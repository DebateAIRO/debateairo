import type {
  Answer,
  AnswerIndex,
  Deployment,
  Edge,
  Node as ContractNode
} from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import type {
  DebateAdaptiveDepthDryRunResponse,
  DebateCompletion,
  DebateDetail,
  DebateNode,
  DebateScoringResponse,
  DebateSummary,
  Synthesis,
  WorkerStatus
} from "../types.js";

/**
 * UI-01 (DR-145): the data-layer adapter that lets V2's debate workspace serve
 * V3's real data. It consumes ONLY generated contract types (AC-59 — no
 * hand-maintained wire mirror) and produces the V2 view models the restored
 * components already consume. DR-115 governs every mapping: where V3 supplies
 * no value for a V2 slot, the slot carries the component's own typed absence
 * ("", null, []) — never a fabricated value, sample, or invented label.
 *
 * Graph -> tree projection: V3 serves a flat node/edge graph; V2 renders a
 * tree. The projection places the real question line as the ROOT_CLAIM card,
 * every node without a representable incoming edge as its child, and every
 * NODE-targeting edge as a parent/child link — relation "attack"/"defeat"
 * becomes V2's CON vocabulary, "support" becomes PRO, "shared-crux" keeps its
 * own name. Edges the tree cannot carry (EDGE-targeting edges, second parents,
 * cycle leftovers) are NEVER dropped: unrepresentedEdges() surfaces them and
 * the honesty drawer lists every edge verbatim.
 */

export function wayOfKnowingLabel(way: ContractNode["way_of_knowing"]): string {
  switch (way) {
    case "LOOKED_UP": return "Looked up";
    case "RAN": return "Ran";
    case "REASONING": return "Reasoning";
  }
}

export function debateStatusFromTerminal(terminal: Answer["terminal"]): string {
  switch (terminal) {
    case "SERVED":
    case "DOWNGRADED":
    case "COMPONENTS_ONLY":
      return "complete";
    case "BLOCKED":
      return "failed";
  }
}

function completionFromTerminal(terminal: Answer["terminal"]): DebateCompletion {
  switch (terminal) {
    case "SERVED":
      return { state: "complete", reasonCode: terminal, humanReason: null };
    case "DOWNGRADED":
      return { state: "complete", reasonCode: terminal, humanReason: "Served downgraded" };
    case "COMPONENTS_ONLY":
      return { state: "complete", reasonCode: terminal, humanReason: "Components-only serve: prose withheld" };
    case "BLOCKED":
      return { state: "failed", reasonCode: terminal, humanReason: "Blocked at terminal" };
  }
}

type GraphProjection = {
  rootChildren: DebateNode[];
  usedEdgeIds: ReadonlySet<string>;
};

type ParentLink = { parentId: string; edge: Edge };

function childNodeType(relation: Edge["relation"]): { nodeType: string; label: string | null } {
  switch (relation) {
    case "attack":
    case "defeat":
      return { nodeType: "CON", label: null };
    case "support":
      return { nodeType: "PRO", label: null };
    case "shared-crux":
      return { nodeType: "SHARED-CRUX", label: "Shared crux" };
  }
}

function projectGraph(answer: Answer): GraphProjection {
  const contractById = new Map<string, ContractNode>(answer.nodes.map((node) => [node.node_id, node]));
  const parentLinks = new Map<string, ParentLink>();
  const usedEdgeIds = new Set<string>();
  for (const edge of answer.edges) {
    if (edge.target_kind !== "NODE") continue;
    if (!contractById.has(edge.from_node_ref) || !contractById.has(edge.target_ref)) continue;
    if (edge.from_node_ref === edge.target_ref) continue;
    if (parentLinks.has(edge.from_node_ref)) continue;
    parentLinks.set(edge.from_node_ref, { parentId: edge.target_ref, edge });
  }

  const childIdsByParent = new Map<string, string[]>();
  const rootIds: string[] = [];
  for (const node of answer.nodes) {
    const link = parentLinks.get(node.node_id);
    if (link === undefined) {
      rootIds.push(node.node_id);
      continue;
    }
    const siblings = childIdsByParent.get(link.parentId) ?? [];
    siblings.push(node.node_id);
    childIdsByParent.set(link.parentId, siblings);
  }

  const visited = new Set<string>();
  const build = (nodeId: string, parentId: string | null, depth: number, position: number, path: string): DebateNode => {
    visited.add(nodeId);
    const contractNode = contractById.get(nodeId)!;
    const link = parentLinks.get(nodeId);
    if (link !== undefined) usedEdgeIds.add(link.edge.edge_id);
    const typed = link === undefined
      ? { nodeType: "CLAIM", label: wayOfKnowingLabel(contractNode.way_of_knowing) }
      : childNodeType(link.edge.relation);
    const childIds = (childIdsByParent.get(nodeId) ?? []).filter((childId) => !visited.has(childId));
    const view: DebateNode = {
      id: contractNode.node_id,
      debate_id: answer.answer_id,
      parent_id: parentId,
      node_type: typed.nodeType,
      label: typed.label,
      lens: null,
      depth,
      position,
      claim: contractNode.claim,
      status: "complete",
      materialized_path: path,
      active_generation_id: null,
      active_generation: null,
      children: []
    };
    view.children = childIds.map((childId, index) => build(childId, nodeId, depth + 1, index, `${path}.${index}`));
    return view;
  };

  const rootChildren = rootIds.map((nodeId, index) => build(nodeId, null, 1, index, `0.${index}`));
  // A cycle among non-root nodes would leave members unvisited; keep every
  // real node visible by surfacing the remainder as top-level claims (their
  // edges stay listed verbatim in the honesty drawer).
  for (const node of answer.nodes) {
    if (!visited.has(node.node_id)) {
      rootChildren.push(build(node.node_id, null, 1, rootChildren.length, `0.${rootChildren.length}`));
    }
  }
  return { rootChildren, usedEdgeIds };
}

/** Edges the tree projection cannot carry — never dropped, always listed. */
export function unrepresentedEdges(answer: Answer): Edge[] {
  const { usedEdgeIds } = projectGraph(answer);
  return answer.edges.filter((edge) => !usedEdgeIds.has(edge.edge_id));
}

function synthesisFromAnswer(answer: Answer): Synthesis | null {
  const prose = answer.composed_text.map((segment) => segment.text).join("\n\n").trim();
  const componentsOnly = answer.serve_state === "COMPONENTS_ONLY";
  if (prose.length === 0 && !componentsOnly) return null;
  return {
    id: `serve:${answer.answer_id}:v${answer.answer_version}`,
    debate_id: answer.answer_id,
    strongest_pro: "",
    strongest_con: "",
    verdict: componentsOnly
      ? "Components-only: composed prose was not cleared to serve. Open Honesty for the verified projections."
      : prose,
    verdict_gate: null,
    model_id: "",
    worker_id: "",
    created_at: ""
  };
}

export function debateDetailFromAnswer(answer: Answer): DebateDetail {
  const { rootChildren } = projectGraph(answer);
  const status = debateStatusFromTerminal(answer.terminal);
  const root: DebateNode = {
    id: answer.answer_id,
    debate_id: answer.answer_id,
    parent_id: null,
    node_type: "ROOT_CLAIM",
    label: null,
    lens: null,
    depth: 0,
    position: 0,
    claim: answer.question_line,
    status,
    materialized_path: "0",
    active_generation_id: null,
    active_generation: null,
    children: rootChildren
  };
  return {
    id: answer.answer_id,
    topic: answer.question_line,
    status,
    config: {},
    direct_answer: null,
    root_node_id: answer.answer_id,
    synthesis_id: null,
    created_at: "",
    completed_at: null,
    tree: root,
    scoring: null,
    synthesis: synthesisFromAnswer(answer),
    active_synthesis: null,
    branch_lineage: [],
    analyzer_runs: [],
    lean: null,
    selected_skills: [],
    selected_agents: [],
    agent_outputs: [],
    agent_runs: [],
    skills_used: [],
    provenance_records: [],
    completion: completionFromTerminal(answer.terminal),
    workers: [],
    models: [],
    node_count: answer.nodes.length
  };
}

export function contractNodesById(answer: Answer): Map<string, ContractNode> {
  return new Map(answer.nodes.map((node) => [node.node_id, node]));
}

// ---------------------------------------------------------------------------
// UI-02a (DR-149(3)): V3's own per-node numbers, carried to V2's node cards.
//
// NodeSchema already serves `base_score` and `final_strength` as
// LabeledNumbers; nothing in the restored workspace read them, so the cards
// showed no number at all and the top bar said "Scoring unavailable" — which
// misstated V3's capability. What is genuinely absent is V2's per-node scoring
// ENDPOINT (and the feedback loop hanging off it), not V3's scoring.
// ---------------------------------------------------------------------------

/** One recorded number, exactly as the contract labels it. */
export type V3LabeledNumber = ContractNode["base_score"];

/**
 * The only three ways a V2 card can carry no V3 number. Both contract fields
 * are REQUIRED on `NodeSchema`, so a node that parsed always has both — the
 * absence is always about the card, never about a node with a missing score.
 */
export type V3NodeScoreAbsence =
  | "QUESTION_CARD_IS_NOT_A_NODE"
  | "NO_SERVED_ANSWER"
  | "NODE_ABSENT_FROM_SERVED_ANSWER";

export type V3NodeScoreState =
  | Readonly<{ status: "PRESENT"; base_score: V3LabeledNumber; final_strength: V3LabeledNumber }>
  | Readonly<{ status: "ABSENT"; reason: V3NodeScoreAbsence }>;

/**
 * Resolve a V2 tree card to V3's recorded numbers.
 *
 * `nodesById === null` means the caller is on the V3 data path but no served
 * answer projection exists yet (the live/streaming view) — that is a different
 * fact from "this card is not in the graph", and the reader is told which.
 */
export function v3NodeScoreState(
  node: Readonly<{ id: string; node_type: string }>,
  nodesById: ReadonlyMap<string, ContractNode> | null
): V3NodeScoreState {
  // The ROOT_CLAIM card is the question line, not a graph node (the projection
  // synthesises it in debateDetailFromAnswer); V3 records no score for it.
  if (node.node_type === "ROOT_CLAIM") return { status: "ABSENT", reason: "QUESTION_CARD_IS_NOT_A_NODE" };
  if (nodesById === null) return { status: "ABSENT", reason: "NO_SERVED_ANSWER" };
  const contractNode = nodesById.get(node.id);
  if (contractNode === undefined) return { status: "ABSENT", reason: "NODE_ABSENT_FROM_SERVED_ANSWER" };
  return {
    status: "PRESENT",
    base_score: contractNode.base_score,
    final_strength: contractNode.final_strength
  };
}

/**
 * V2's score-badge shape: a short mono pill plus the whole story in `title`.
 * `id` names WHICH contract field the pill carries, so the renderer can mark
 * the two numbers apart in the DOM without re-deriving them from the text.
 */
export type V3ScoreBadge = Readonly<{ id: "base_score" | "final_strength"; pillText: string; title: string }>;

export type V3ScorePresentation =
  | Readonly<{ status: "PRESENT"; badges: readonly V3ScoreBadge[] }>
  | Readonly<{ status: "ABSENT"; badge: Readonly<{ pillText: string; title: string }> }>;

/**
 * THE VALUE IS RENDERED VERBATIM. V2's own formatScorePercent clamps to [0,1]
 * and multiplies by 100; V3 rules no scale for these numbers, so rescaling or
 * rounding them here would publish a number the run never recorded
 * (AC-76/DR-039). A LabeledNumber is not a bare float either: its `kind`,
 * `producer`, `source` and `replay_handle` ride along in the title, which is
 * also the badge's accessible name.
 */
function labeledNumberBadge(
  id: V3ScoreBadge["id"],
  name: string,
  abbreviation: string,
  number: V3LabeledNumber
): V3ScoreBadge {
  return {
    id,
    pillText: `${abbreviation} ${number.value}`,
    title:
      `${name} ${number.value} · ${number.kind} · produced by ${number.producer} · ` +
      `source ${number.source} · replay ${number.replay_handle}`
  };
}

/** The typed reason a card carries no number — never a 0, never a dash (DR-115). */
export function v3ScoreAbsenceCopy(reason: V3NodeScoreAbsence): Readonly<{ pillText: string; title: string }> {
  switch (reason) {
    case "QUESTION_CARD_IS_NOT_A_NODE":
      return {
        pillText: "NO SCORE",
        title: "The question line is not a graph node, so V3 records no score for it."
      };
    case "NO_SERVED_ANSWER":
      return {
        pillText: "NO SCORE YET",
        title: "No served answer exists yet, so V3 has recorded no score for this claim."
      };
    case "NODE_ABSENT_FROM_SERVED_ANSWER":
      return {
        pillText: "NO SCORE",
        title: "The served answer graph does not carry this card, so V3 has no recorded score for it."
      };
  }
}

export function v3ScorePresentation(state: V3NodeScoreState): V3ScorePresentation {
  if (state.status === "ABSENT") return { status: "ABSENT", badge: v3ScoreAbsenceCopy(state.reason) };
  return {
    status: "PRESENT",
    badges: [
      labeledNumberBadge("base_score", "Base score", "BASE", state.base_score),
      labeledNumberBadge("final_strength", "Final strength", "FINAL", state.final_strength)
    ]
  };
}

/**
 * A minimal live view of a debate while no settled answer projection exists
 * yet: everything comes from what the run's event stream has actually said
 * (the tree the caller materialized from it). All other slots carry typed
 * absence until the served answer arrives.
 */
export function liveDebateDetail(runId: string, tree: DebateNode): DebateDetail {
  let liveNodeCount = -1; // exclude the root claim card
  const count = (node: DebateNode): void => {
    liveNodeCount += 1;
    node.children.forEach(count);
  };
  count(tree);
  return {
    id: runId,
    topic: tree.claim,
    status: tree.status === "complete" ? "complete" : "generating",
    config: {},
    direct_answer: null,
    root_node_id: tree.id,
    synthesis_id: null,
    created_at: "",
    completed_at: null,
    tree,
    scoring: null,
    synthesis: null,
    active_synthesis: null,
    branch_lineage: [],
    analyzer_runs: [],
    lean: null,
    selected_skills: [],
    selected_agents: [],
    agent_outputs: [],
    agent_runs: [],
    skills_used: [],
    provenance_records: [],
    workers: [],
    models: [],
    node_count: liveNodeCount
  };
}

export function debateSummariesFromIndex(index: AnswerIndex): DebateSummary[] {
  // Every index row is a served answer projection, so its V2 status is
  // "complete"; timestamps and maker lineage are not part of the index
  // contract — typed absence, rendered by the cards' own empty states.
  return index.items.map((item) => ({
    id: item.answer_id,
    topic: item.question_line,
    status: "complete",
    created_at: "",
    completed_at: null,
    models: []
  }));
}

/**
 * The one reason string V3 gives for having no V2 per-node scoring RESOURCE.
 * Exported because the V2 status copy must be able to RECOGNISE it: a typed
 * absence is not a failed check, and must not be reported as one (DR-115).
 *
 * UI-02a: the sentence names precisely what is missing (V2's per-node scoring
 * endpoint, and the refresh/feedback loop that hangs off it) and where V3's own
 * numbers actually are, now that the cards carry them too.
 */
export const SCORING_ABSENCE_REASON =
  "V3 scores every claim on the answer graph itself: each card carries its recorded base score and final " +
  "strength, with the full labels and replay handles in the Honesty drawer. What V3 has no resource for is " +
  "V2's separate per-node scoring endpoint — so no scoring refresh, holes, fatal flags or score feedback " +
  "exist here.";

/**
 * The status label V2's top bar must use for V3's scoring-endpoint absence, or
 * null when the reason is not V3's (V2 keeps its own copy for real failures).
 *
 * This rule lives in the V3 layer on purpose: it is a statement about what V3
 * does and does not have, and V2's copy function only has to consult it. A
 * typed absence is not a failed check, and reporting one would assert an event
 * that never happened (DR-115).
 *
 * UI-02a: the label used to read "Scoring unavailable", which was false — V3's
 * judge-informed numbers exist on every node. It now says the scores are on the
 * graph and names the one thing that is genuinely absent.
 */
export const V3_SCORING_STATUS_LABEL = "Scored on the graph — no V2 scoring endpoint";

export function v3ScoringStatusLabel(reason: string | null | undefined): string | null {
  return (reason ?? "").trim() === SCORING_ABSENCE_REASON ? V3_SCORING_STATUS_LABEL : null;
}

export function scoringUnavailable(debateId: string): DebateScoringResponse {
  return {
    debate_id: debateId,
    status: "unavailable",
    node_ids: [],
    items: [],
    reason: SCORING_ABSENCE_REASON
  };
}

export function adaptiveDepthUnavailable(debateId: string): DebateAdaptiveDepthDryRunResponse {
  return {
    debate_id: debateId,
    status: "unavailable",
    reason: "V3 has no adaptive-depth dry-run resource; expansion decisions live in the run itself.",
    plan: {
      policy: { mode: "fixed", target_depth: null, reason: "No V3 adaptive-depth plan exists." },
      candidate_count: 0,
      expansion_count: 0,
      items: []
    }
  };
}

export type RunCostEnvelopeMember = Readonly<{
  depth: number;
  riskTier: "casual" | "standard" | "high-stakes";
  maxModelAttempts: number;
}>;

export type RunCostEnvelopeView = Readonly<{
  registerVersion: number;
  sourceRef: string;
  deploymentRiskTier: RunCostEnvelopeMember["riskTier"] | null;
  members: readonly RunCostEnvelopeMember[];
}>;

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/** Projects the ruled run envelope without inventing a fallback value. */
export function runCostEnvelopeFromDeployment(deployment: Deployment): RunCostEnvelopeView {
  const row = deployment.register.rows.find((candidate) => candidate.row_key === "runCostEnvelope");
  if (row === undefined) {
    throw new TypedDomainError(
      "RUN_COST_ENVELOPE_UNAVAILABLE",
      "Deployment register row runCostEnvelope is absent."
    );
  }
  const value = recordValue(row.value);
  const rawMembers = value?.kind === "RUN_COST_ENVELOPE_POLICY" ? value.members : undefined;
  if (!Array.isArray(rawMembers) || rawMembers.length === 0) {
    throw new TypedDomainError("RUN_COST_ENVELOPE_INVALID", "runCostEnvelope has no typed policy members.");
  }
  const members = rawMembers.map((rawMember, index): RunCostEnvelopeMember => {
    const member = recordValue(rawMember);
    const depthParams = recordValue(member?.depth_params);
    const depth = depthParams?.depth;
    const riskTier = member?.risk_tier;
    const maxModelAttempts = member?.max_model_attempts;
    if (
      !Number.isInteger(depth) || (depth as number) < 1 ||
      (riskTier !== "casual" && riskTier !== "standard" && riskTier !== "high-stakes") ||
      !Number.isInteger(maxModelAttempts) || (maxModelAttempts as number) < 1
    ) {
      throw new TypedDomainError(
        "RUN_COST_ENVELOPE_INVALID",
        `Member ${index} has invalid depth, risk tier, or attempt ceiling.`
      );
    }
    return Object.freeze({
      depth: depth as number,
      riskTier,
      maxModelAttempts: maxModelAttempts as number
    });
  });
  const memberKeys = new Set(members.map((member) => `${member.riskTier}:${member.depth}`));
  if (memberKeys.size !== members.length) {
    throw new TypedDomainError(
      "RUN_COST_ENVELOPE_INVALID",
      "Duplicate risk-tier/depth members are ambiguous."
    );
  }
  const riskTierRow = deployment.register.rows.find((candidate) => candidate.row_key === "riskTier");
  const deploymentRiskTier = riskTierRow?.value ?? null;
  if (
    deploymentRiskTier !== null &&
    deploymentRiskTier !== "casual" &&
    deploymentRiskTier !== "standard" &&
    deploymentRiskTier !== "high-stakes"
  ) {
    throw new TypedDomainError("RISK_TIER_POLICY_INVALID", "Deployment register row riskTier is invalid.");
  }
  return Object.freeze({
    registerVersion: deployment.register.register_version,
    sourceRef: row.source_ref,
    deploymentRiskTier,
    members: Object.freeze(members)
  });
}

export function workersFromDeployment(deployment: Deployment): WorkerStatus[] {
  if (deployment.fleet.state === "UNAVAILABLE") {
    throw new Error(`NO_TYPED_FLEET_SOURCE: the deployment declares no typed fleet source (${deployment.fleet.reason}).`);
  }
  return deployment.fleet.workers.map((worker) => ({
    id: worker.worker_ref,
    name: worker.worker_ref,
    capabilities: [],
    last_seen: "",
    status: worker.status === "ONLINE" ? "online" : "offline",
    current_job_id: null
  }));
}

/**
 * One routed model as the deployment ledger actually records it. Keyed by the
 * (model_id, model_version, provider) triple so that a ledger routing two
 * different versions of the same model stays visibly two rows — collapsing
 * them would hide real lineage.
 */
export type SettingsModelRow = {
  model_id: string;
  model_version: string;
  provider: string;
  task_classes: string[];
  routing_decision_refs: string[];
};

export type SettingsView = {
  /** The register version this deployment projection was read at. */
  register_version: number;
  /** task_class -> model ids, projected verbatim from the deployment model ledger. */
  routing: Record<string, string[]>;
  models: SettingsModelRow[];
  configured_models: string[];
  enabled_models: string[];
  /** V3 supplies no spend or cap accounting — typed absence, never $0.00. */
  model_monthly_caps_usd: Record<string, never>;
  model_monthly_spend_usd: null;
};

export function settingsViewFromDeployment(deployment: Deployment): SettingsView {
  const routing: Record<string, string[]> = {};
  const rowsByKey = new Map<string, SettingsModelRow>();
  const configuredModels: string[] = [];
  for (const entry of deployment.model_ledger) {
    const assigned = routing[entry.task_class] ?? [];
    if (!assigned.includes(entry.model_id)) assigned.push(entry.model_id);
    routing[entry.task_class] = assigned;

    const key = `${entry.model_id} ${entry.model_version} ${entry.provider}`;
    const row = rowsByKey.get(key) ?? {
      model_id: entry.model_id,
      model_version: entry.model_version,
      provider: entry.provider,
      task_classes: [],
      routing_decision_refs: []
    };
    if (!row.task_classes.includes(entry.task_class)) row.task_classes.push(entry.task_class);
    if (!row.routing_decision_refs.includes(entry.routing_decision_ref)) {
      row.routing_decision_refs.push(entry.routing_decision_ref);
    }
    rowsByKey.set(key, row);
    if (!configuredModels.includes(entry.model_id)) configuredModels.push(entry.model_id);
  }
  return {
    register_version: deployment.register.register_version,
    routing,
    models: [...rowsByKey.values()],
    configured_models: configuredModels,
    // V3 has no per-model enable switch: every model the ledger routes IS in
    // service. "enabled" therefore mirrors "configured" honestly rather than
    // implying a toggle the deployment does not own.
    enabled_models: configuredModels,
    model_monthly_caps_usd: {},
    model_monthly_spend_usd: null
  };
}
