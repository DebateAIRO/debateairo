import { ContractHttpError, InvestigationGapSchema, type EventType, type InvestigationGap, type RunEvent } from "@debateai/contract";
import type { DebateNode, Generation } from "../types.js";
import composeEnglish from "../../messages/en/compose.json" with { type: "json" };
import { t, type MessageCatalog } from "../i18n/translate.js";
import { announceNewerVersion } from "./releaseWatch.js";

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

/**
 * Live run events (2026-10-11). The server keeps one stream open and replays
 * the stored events first, so every reconnect repeats history. The page
 * applies each event once: this gate remembers the event ids it has let
 * through and answers false for a replayed one.
 */
export type LiveEventGate = Readonly<{ admit(event: RunEvent): boolean }>;

export function createLiveEventGate(): LiveEventGate {
  const seen = new Set<string>();
  return Object.freeze({
    admit(event: RunEvent): boolean {
      if (seen.has(event.event_id)) return false;
      seen.add(event.event_id);
      return true;
    }
  });
}

/**
 * Reconnect timing. Before 2026-10-11 the page reconnected about once a second and one tab spent its
 * address's whole `publicReads` admission budget in about two minutes. A clean close of a live run now
 * waits at least 5 s, doubling to 60 s, until a NEW event arrives; a 429 waits at least the server's
 * `Retry-After` (a minute when it names none), and never more than `capMs` (15 minutes).
 */
export const LIVE_STREAM_RECONNECT = Object.freeze({
  minGapMs: 5_000,
  maxGapMs: 60_000,
  rateLimitedFloorMs: 60_000,
  /** The longest any wait may be, whatever the server asked: setTimeout above ~24.8 days fires after 1 ms. */
  capMs: 900_000
});

export function liveReconnectDelay(attempt: number, failure: unknown): number {
  const backoff = Math.min(LIVE_STREAM_RECONNECT.maxGapMs, LIVE_STREAM_RECONNECT.minGapMs * 2 ** Math.max(0, attempt));
  const rateLimited = failure instanceof ContractHttpError && failure.code === "RATE_LIMITED";
  const floor = rateLimited ? failure.retryAfterMs ?? LIVE_STREAM_RECONNECT.rateLimitedFloorMs : 0;
  return Math.min(LIVE_STREAM_RECONNECT.capMs, Math.max(backoff, floor));
}

/**
 * The live stream's state for the page. "offline": the stream stopped for good because this page cannot read the answers
 * of the release now serving (INVALID_RESPONSE); the reload note speaks, and the page hides its stream line (final fix
 * wave W3), so it never says live, connecting or reconnecting under the note.
 */
export type LiveStreamStatus = Readonly<{ status: "connecting" | "live" | "reconnecting" | "offline"; retryInMs?: number }>;

/**
 * The debate page's live-stream loop (the page wires it; tests drive it with fake timers):
 * open one stream, apply only NEW events (a new event resets the back-off), re-read the
 * page once when a stream closes, stop on a terminal run, reconnect with back-off otherwise.
 * An unreadable answer (INVALID_RESPONSE) stops it with the reload note (side-by-side C13) and an "offline" status.
 * Returns the stop function.
 */
export function startLiveEventStream(input: Readonly<{
  /** Opens one stream; resolves on a clean close, rejects on a refusal or a network failure. */
  open: (emit: (event: RunEvent) => void, signal: AbortSignal) => Promise<void>;
  /** Applies a NEW event; the page's consumer re-reads the settled projection for the events that call for it. */
  consume: (event: RunEvent) => void;
  refresh: (answerExpected?: boolean) => void;
  isTerminal: () => boolean;
  onStatus: (status: LiveStreamStatus) => void;
  /** The first event of a connection arrived: a stale transient error may be cleared. */
  onLive?: () => void;
  /** True when the failure ends the live view for good (the page shows it); no reconnect then. */
  onFatal: (failure: unknown) => boolean;
  gate?: LiveEventGate;
}>): () => void {
  const gate = input.gate ?? createLiveEventGate();
  const controller = new AbortController();
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempt = 0;

  const scheduleReconnect = (failure: unknown) => {
    if (stopped || timer !== null) return;
    const delay = liveReconnectDelay(attempt, failure);
    attempt += 1;
    input.onStatus({ status: "reconnecting", retryInMs: delay });
    timer = setTimeout(connect, delay);
  };

  function connect() {
    timer = null;
    if (stopped) return;
    input.onStatus({ status: "connecting" });
    let opened = false;
    input.open((event) => {
      if (stopped) return;
      if (!opened) {
        opened = true;
        input.onStatus({ status: "live" });
        input.onLive?.();
      }
      // A replayed event is history the page already holds: not applied again, no
      // re-read, and no back-off reset (that reset made the page reconnect every second).
      if (!gate.admit(event)) return;
      attempt = 0;
      input.consume(event);
    }, controller.signal).then(() => {
      if (stopped) return;
      // The stream closed. A terminal run is done: re-read the settled answer.
      if (input.isTerminal()) {
        input.refresh(true);
        return;
      }
      input.refresh();
      scheduleReconnect(null);
    }, (failure: unknown) => {
      if (stopped || controller.signal.aborted) return;
      if (input.onFatal(failure)) return;
      // Side-by-side spec §7 (plan C13): an event this page cannot read comes from a newer release, and the same event
      // would fail again on every reconnect. The page shows the reload note and stops: no re-read, no retry.
      // Final fix wave W3: one last "offline" status, so the page never keeps saying live (or connecting) under the note.
      if (failure instanceof ContractHttpError && failure.code === "INVALID_RESPONSE") {
        announceNewerVersion("NEWER_BUILD");
        input.onStatus({ status: "offline" });
        return;
      }
      input.refresh();
      scheduleReconnect(failure);
    });
  }

  connect();
  return () => {
    stopped = true;
    controller.abort();
    if (timer !== null) clearTimeout(timer);
  };
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

function liveNodeType(
  relation: string | null,
  hasParent: boolean,
  catalog: MessageCatalog
): { nodeType: string; label: string | null } {
  if (!hasParent) return { nodeType: "CLAIM", label: null };
  const normalized = (relation ?? "").toLowerCase();
  if (normalized === "attack" || normalized === "defeat") return { nodeType: "CON", label: null };
  if (normalized === "support") return { nodeType: "PRO", label: null };
  // Same label, same key as the served projection (adapter.ts), in the reader's locale.
  if (normalized === "shared-crux") return { nodeType: "SHARED-CRUX", label: t(catalog, "compose.v3.sharedCrux") };
  return { nodeType: "CLAIM", label: null };
}

/**
 * Materializes a V2 tree from the live stream state alone — used while no
 * settled answer projection exists yet. Text and structure come verbatim from
 * events; the root claim is the question line when known, "" otherwise.
 */
export function liveTreeFromState(
  state: LiveRunState,
  rootId: string,
  rootClaim: string,
  catalog: MessageCatalog = composeEnglish
): DebateNode | null {
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
    const typed = liveNodeType(live.relation, parentId !== null && parentId !== rootId, catalog);
    const generation: Generation | null = live.text.length === 0
      ? null
      : { id: "streaming", model_id: "streaming", role: "streaming", argument: live.text, worker_id: "", created_at: "" };
    // A node scored before any of its text reached the page is waiting for the settled read,
    // not an empty argument: it shows as pending, never as "No strong argument found".
    const status = liveStatus(live.lifecycle);
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
      status: status === "complete" && live.text.length === 0 ? "pending" : status,
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
