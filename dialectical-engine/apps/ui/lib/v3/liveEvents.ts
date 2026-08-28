import { InvestigationGapSchema, type EventType, type InvestigationGap, type RunEvent } from "@debateai/contract";
import type { DebateNode, Generation } from "../types.js";

/**
 * UI-01: V3's run-event stream translated onto V2's live-debate vocabulary.
 * Pure state machine (S14's applyRunEvent lineage): the page client feeds it
 * every RunEvent and materializes a live V2 tree from what the stream has
 * actually said — spawned nodes, parent refs, relations, text deltas — never
 * from invented content. Payload fields are read defensively: an absent field
 * is absent, not defaulted into data.
 */

export type RunPhase = "idle" | "accepted" | "planning" | "running" | "terminal";
export type ServePhase = "idle" | "bundle-frozen" | "composing" | "conformance" | "recompose-or-defect";

export type LiveNodeState = {
  lifecycle: "spawned" | "generating" | "being-judged" | "scored" | "complete" | "failed" | "retrying";
  text: string;
  parentRef: string | null;
  relation: string | null;
};

export type LiveRunState = Readonly<{
  runPhase: RunPhase;
  terminalFailure: string | null;
  servePhase: ServePhase;
  nodeOrder: readonly string[];
  nodes: Readonly<Record<string, LiveNodeState>>;
  compositionText: string;
  cycleRefusals: readonly string[];
  investigationGaps: readonly InvestigationGap[];
  honestyEvents: readonly EventType[];
  ledgerEvents: readonly EventType[];
}>;

export function createLiveRunState(): LiveRunState {
  return Object.freeze({
    runPhase: "idle",
    terminalFailure: null,
    servePhase: "idle",
    nodeOrder: [],
    nodes: {},
    compositionText: "",
    cycleRefusals: [],
    investigationGaps: [],
    honestyEvents: [],
    ledgerEvents: []
  });
}

function payloadText(event: RunEvent, key: string): string | null {
  const value = event.payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function withNode(
  state: LiveRunState,
  nodeId: string,
  update: (current: LiveNodeState) => LiveNodeState
): LiveRunState {
  const current = state.nodes[nodeId] ?? { lifecycle: "spawned" as const, text: "", parentRef: null, relation: null };
  const known = state.nodes[nodeId] !== undefined;
  return Object.freeze({
    ...state,
    nodeOrder: known ? state.nodeOrder : Object.freeze([...state.nodeOrder, nodeId]),
    nodes: Object.freeze({ ...state.nodes, [nodeId]: update(current) })
  });
}

/** True when the settled projection should be re-read after this event. */
export function refreshTriggeredBy(eventType: EventType): boolean {
  return (
    eventType === "run.terminal" ||
    eventType === "node.complete" ||
    eventType === "node.failed" ||
    eventType === "node.scored" ||
    eventType === "graph.edge_added" ||
    eventType === "serve.conformance_verdict" ||
    eventType === "serve.recompose_or_defect" ||
    eventType === "honesty.staleness_trigger_fired"
  );
}

export function applyRunEvent(state: LiveRunState, event: RunEvent): LiveRunState {
  switch (event.event_type) {
    case "run.accepted": return Object.freeze({ ...state, runPhase: "accepted" });
    case "run.planning": return Object.freeze({ ...state, runPhase: "planning" });
    case "run.running": return Object.freeze({ ...state, runPhase: "running" });
    case "run.terminal": return Object.freeze({
      ...state,
      runPhase: "terminal",
      terminalFailure: payloadText(event, "state") === "FAILED"
        ? payloadText(event, "reason")
        : null
    });
    case "serve.bundle_frozen": return Object.freeze({ ...state, servePhase: "bundle-frozen" });
    case "serve.composition_started": return Object.freeze({ ...state, servePhase: "composing", compositionText: "" });
    case "serve.composition_delta":
      return Object.freeze({
        ...state,
        servePhase: "composing",
        compositionText: state.compositionText + (payloadText(event, "delta") ?? "")
      });
    case "serve.conformance_verdict": return Object.freeze({ ...state, servePhase: "conformance" });
    case "serve.recompose_or_defect": return Object.freeze({ ...state, servePhase: "recompose-or-defect" });
    case "graph.cycle_refused":
      return Object.freeze({
        ...state,
        cycleRefusals: Object.freeze([...state.cycleRefusals, payloadText(event, "code") ?? "CIRCULAR_DEPENDENCY_FOUND"])
      });
    case "honesty.investigation_gap_opened": {
      const parsed = InvestigationGapSchema.safeParse(event.payload);
      return Object.freeze({
        ...state,
        honestyEvents: Object.freeze([...state.honestyEvents, event.event_type]),
        investigationGaps: parsed.success
          ? Object.freeze([...state.investigationGaps, Object.freeze(parsed.data)])
          : state.investigationGaps
      });
    }
    case "honesty.abstention_typed":
    case "honesty.budget_skip_marked":
    case "honesty.fallback_labeled":
    case "honesty.memory_link_decided":
    case "honesty.staleness_trigger_fired":
    case "honesty.under_explored_marked":
      return Object.freeze({ ...state, honestyEvents: Object.freeze([...state.honestyEvents, event.event_type]) });
    case "ledger.attempt":
    case "ledger.failure":
    case "ledger.could_not_do":
      return Object.freeze({ ...state, ledgerEvents: Object.freeze([...state.ledgerEvents, event.event_type]) });
    case "graph.edge_added": {
      const from = payloadText(event, "from_node_ref");
      const to = payloadText(event, "target_ref");
      if (from === null || to === null) return state;
      const relation = payloadText(event, "relation");
      return withNode(state, from, (current) => ({ ...current, parentRef: current.parentRef ?? to, relation: current.relation ?? relation }));
    }
    default:
      break;
  }
  const subject = event.subject_ref ?? payloadText(event, "node_ref");
  if (subject === null || subject === undefined) return state;
  switch (event.event_type) {
    case "node.spawned": {
      const parent = payloadText(event, "parent_ref");
      const relation = payloadText(event, "relation");
      return withNode(state, subject, (current) => ({
        ...current,
        lifecycle: "spawned",
        parentRef: current.parentRef ?? parent,
        relation: current.relation ?? relation
      }));
    }
    case "node.generating": return withNode(state, subject, (current) => ({ ...current, lifecycle: "generating" }));
    case "node.being_judged": return withNode(state, subject, (current) => ({ ...current, lifecycle: "being-judged" }));
    case "node.scored": return withNode(state, subject, (current) => ({ ...current, lifecycle: "scored" }));
    case "node.complete": return withNode(state, subject, (current) => ({ ...current, lifecycle: "complete" }));
    case "node.failed": return withNode(state, subject, (current) => ({ ...current, lifecycle: "failed" }));
    case "node.retrying": return withNode(state, subject, (current) => ({ ...current, lifecycle: "retrying" }));
    case "node.text_delta":
      return withNode(state, subject, (current) => ({ ...current, text: current.text + (payloadText(event, "delta") ?? "") }));
    default:
      return state;
  }
}

function liveStatus(lifecycle: LiveNodeState["lifecycle"]): string {
  switch (lifecycle) {
    case "spawned": return "pending";
    case "generating":
    case "being-judged":
    case "retrying":
      return "generating";
    case "scored":
    case "complete":
      return "complete";
    case "failed": return "failed";
  }
}

function liveNodeType(relation: string | null, hasParent: boolean): { nodeType: string; label: string | null } {
  if (!hasParent) return { nodeType: "CLAIM", label: null };
  const normalized = (relation ?? "").toLowerCase();
  if (normalized === "attack" || normalized === "defeat") return { nodeType: "CON", label: null };
  if (normalized === "support") return { nodeType: "PRO", label: null };
  if (normalized === "shared-crux") return { nodeType: "SHARED-CRUX", label: "Shared crux" };
  return { nodeType: "CLAIM", label: null };
}

/**
 * Materializes a V2 tree from the live stream state alone — used while no
 * settled answer projection exists yet. Text and structure come verbatim from
 * events; the root claim is the question line when known, "" otherwise.
 */
export function liveTreeFromState(state: LiveRunState, rootId: string, rootClaim: string): DebateNode | null {
  if (state.nodeOrder.length === 0) return null;
  const childIds = new Map<string, string[]>();
  const roots: string[] = [];
  for (const nodeId of state.nodeOrder) {
    const parentRef = state.nodes[nodeId]!.parentRef;
    if (parentRef !== null && state.nodes[parentRef] !== undefined) {
      const siblings = childIds.get(parentRef) ?? [];
      siblings.push(nodeId);
      childIds.set(parentRef, siblings);
    } else {
      roots.push(nodeId);
    }
  }
  const visited = new Set<string>();
  const build = (nodeId: string, parentId: string | null, depth: number, position: number, path: string): DebateNode => {
    visited.add(nodeId);
    const live = state.nodes[nodeId]!;
    const typed = liveNodeType(live.relation, parentId !== null && parentId !== rootId);
    const generation: Generation | null = live.text.length === 0
      ? null
      : { id: "streaming", model_id: "streaming", role: "streaming", argument: live.text, worker_id: "", created_at: "" };
    return {
      id: nodeId,
      debate_id: rootId,
      parent_id: parentId,
      node_type: typed.nodeType,
      label: typed.label,
      lens: null,
      depth,
      position,
      claim: live.text,
      status: liveStatus(live.lifecycle),
      materialized_path: path,
      active_generation_id: generation === null ? null : generation.id,
      active_generation: generation,
      children: (childIds.get(nodeId) ?? [])
        .filter((childId) => !visited.has(childId))
        .map((childId, index) => build(childId, nodeId, depth + 1, index, `${path}.${index}`))
    };
  };
  return {
    id: rootId,
    debate_id: rootId,
    parent_id: null,
    node_type: "ROOT_CLAIM",
    label: null,
    lens: null,
    depth: 0,
    position: 0,
    claim: rootClaim,
    status: state.runPhase === "terminal" ? "complete" : "generating",
    materialized_path: "0",
    active_generation_id: null,
    active_generation: null,
    children: roots.map((nodeId, index) => build(nodeId, rootId, 1, index, `0.${index}`))
  };
}

/**
 * Honest copy for the debate page while no debate detail exists yet.
 * "Connecting" is claimed ONLY while the stream is down and nothing has been
 * observed; the moment evidence flows, the line reports real progress instead
 * (a healthy two-maker debate runs for minutes and used to sit behind a static
 * "Connecting to the coordinator…" that read as a hang).
 */
export function pendingProgressCopy(
  live: LiveRunState,
  stream: Readonly<{ status: "connecting" | "live" | "reconnecting"; retryInMs?: number }>
): string {
  const total = live.nodeOrder.length;
  const settled = live.nodeOrder.filter((ref) => {
    const lifecycle = live.nodes[ref]?.lifecycle;
    return lifecycle === "scored" || lifecycle === "complete";
  }).length;
  const noEvidence = live.runPhase === "idle" && total === 0;

  if (stream.status === "connecting" && noEvidence) return "Connecting to the coordinator…";

  const parts: string[] = [];
  if (live.servePhase === "composing" || live.servePhase === "conformance") {
    parts.push("Composing the answer");
  } else if (total > 0) {
    parts.push("Debating");
  } else {
    parts.push(live.runPhase === "planning" ? "Planning the debate" : "Debate accepted");
  }
  if (total > 0) {
    parts.push(settled > 0
      ? `${settled} of ${total} ${total === 1 ? "node" : "nodes"} settled`
      : `${total} ${total === 1 ? "node" : "nodes"} in play`);
  }
  if (stream.status === "reconnecting") {
    const seconds = Math.max(1, Math.round((stream.retryInMs ?? 1000) / 1000));
    parts.push(`Reconnecting to the live stream in ${seconds}s`);
  }
  return `${parts.join(" — ")}…`;
}
