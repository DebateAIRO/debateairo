import type {
  Answer,
  AnswerIndex,
  Deployment,
  Edge,
  Node as ContractNode
} from "@debateai/contract";
import type { RunProjection } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import composeEnglish from "../../messages/en/compose.json" with { type: "json" };
import { t, tPlural, type MessageCatalog } from "../i18n/translate.js";
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

export type TreeProjectableAnswer = Pick<
  Answer,
  | "nodes"
  | "edges"
  | "condition_mark_records"
  | "answer_id"
  | "answer_version"
  | "question_line"
  | "terminal"
  | "serve_state"
> & {
  composed_text: ReadonlyArray<Pick<Answer["composed_text"][number], "text">>;
};

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

export function wayOfKnowingLabel(
  way: ContractNode["way_of_knowing"],
  catalog: MessageCatalog = composeEnglish
): string {
  switch (way) {
    case "LOOKED_UP": return t(catalog, "compose.v3.wayOfKnowing.lookedUp");
    case "RAN": return t(catalog, "compose.v3.wayOfKnowing.ran");
    case "REASONING": return t(catalog, "compose.v3.wayOfKnowing.reasoning");
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

function completionFromTerminal(
  terminal: Answer["terminal"],
  catalog: MessageCatalog
): DebateCompletion {
  switch (terminal) {
    case "SERVED":
      return { state: "complete", reasonCode: terminal, humanReason: null };
    case "DOWNGRADED":
      return {
        state: "complete",
        reasonCode: terminal,
        humanReason: t(catalog, "compose.v3.completion.servedDowngraded")
      };
    case "COMPONENTS_ONLY":
      return {
        state: "complete",
        reasonCode: terminal,
        humanReason: t(catalog, "compose.v3.completion.componentsOnly")
      };
    case "BLOCKED":
      return {
        state: "failed",
        reasonCode: terminal,
        humanReason: t(catalog, "compose.v3.completion.blocked")
      };
  }
}

type GraphProjection = {
  rootChildren: DebateNode[];
  usedEdgeIds: ReadonlySet<string>;
};

type ParentLink = { parentId: string; edge: Edge };

function childNodeType(
  relation: Edge["relation"],
  catalog: MessageCatalog
): { nodeType: string; label: string | null } {
  switch (relation) {
    case "attack":
    case "defeat":
      return { nodeType: "CON", label: null };
    case "support":
      return { nodeType: "PRO", label: null };
    case "shared-crux":
      return { nodeType: "SHARED-CRUX", label: t(catalog, "compose.v3.sharedCrux") };
  }
}

function projectGraph(answer: TreeProjectableAnswer, catalog: MessageCatalog): GraphProjection {
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
  const hiddenRecordByNodeId = new Map<string, Answer["condition_mark_records"][number]>();
  for (const record of answer.condition_mark_records) {
    if (record.mark !== "HIDDEN-UNJUDGEABLE" && record.mark !== "HIDDEN-LOW-SCORE") continue;
    for (const nodeId of record.affected_node_ids) hiddenRecordByNodeId.set(nodeId, record);
  }
  const build = (
    nodeId: string,
    parentId: string | null,
    depth: number,
    position: number,
    path: string
  ): DebateNode => {
    visited.add(nodeId);
    const contractNode = contractById.get(nodeId)!;
    const link = parentLinks.get(nodeId);
    if (link !== undefined) usedEdgeIds.add(link.edge.edge_id);
    const typed = link === undefined
      ? { nodeType: "CLAIM", label: wayOfKnowingLabel(contractNode.way_of_knowing, catalog) }
      : childNodeType(link.edge.relation, catalog);
    const childIds = (childIdsByParent.get(nodeId) ?? []).filter((childId) => !visited.has(childId));
    const hiddenRecord = hiddenRecordByNodeId.get(nodeId);
    const ownHiddenReason = hiddenRecord?.mark === "HIDDEN-UNJUDGEABLE"
      ? t(catalog, "compose.v3.hidden.unjudged", { reason: hiddenRecord.reason })
      : hiddenRecord?.mark === "HIDDEN-LOW-SCORE"
        ? t(catalog, "compose.v3.hidden.lowScore", { reason: hiddenRecord.reason })
        : null;
    const hiddenReason = ownHiddenReason;
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
      active_generation: contractNode.maker_lineage === null
        ? null
        : {
            model_id: contractNode.maker_lineage.model_id,
            maker: contractNode.maker_lineage.maker
          },
      maker: contractNode.maker_lineage?.maker ?? null,
      ...(hiddenReason === null ? {} : {
        path_status: "abandoned",
        stopping_status: "abandon",
        stopping_reason: hiddenRecord?.mark ?? "HIDDEN-ANCESTOR",
        stopping_reason_human: hiddenReason
      }),
      children: []
    };
    view.children = childIds.map((childId, index) => build(
      childId,
      nodeId,
      depth + 1,
      index,
      `${path}.${index}`
    ));
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
export function unrepresentedEdges(
  answer: Answer,
  catalog: MessageCatalog = composeEnglish
): Edge[] {
  const { usedEdgeIds } = projectGraph(answer, catalog);
  return answer.edges.filter((edge) => !usedEdgeIds.has(edge.edge_id));
}

function synthesisFromAnswer(answer: TreeProjectableAnswer, catalog: MessageCatalog): Synthesis | null {
  const prose = answer.composed_text.map((segment) => segment.text).join("\n\n").trim();
  const componentsOnly = answer.serve_state === "COMPONENTS_ONLY";
  if (prose.length === 0 && !componentsOnly) return null;
  return {
    id: `serve:${answer.answer_id}:v${answer.answer_version}`,
    debate_id: answer.answer_id,
    strongest_pro: "",
    strongest_con: "",
    verdict: componentsOnly
      ? t(catalog, "compose.v3.componentsOnlyVerdict")
      : prose,
    verdict_gate: null,
    model_id: "",
    worker_id: "",
    created_at: ""
  };
}

export function debateDetailFromAnswer(
  answer: TreeProjectableAnswer,
  catalog: MessageCatalog = composeEnglish
): DebateDetail {
  const { rootChildren } = projectGraph(answer, catalog);
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
    synthesis: synthesisFromAnswer(answer, catalog),
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
    completion: completionFromTerminal(answer.terminal, catalog),
    workers: [],
    models: [],
    node_count: answer.nodes.length
  };
}

export function contractNodesById(answer: Pick<Answer, "nodes">): Map<string, ContractNode> {
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
  if (contractNode.final_strength === null) {
    return { status: "ABSENT", reason: "NODE_ABSENT_FROM_SERVED_ANSWER" };
  }
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
 * DR-154(4): restate the recorded probability as a percentage, rounded to the
 * nearest 0.01 percentage point. Trailing zeroes are omitted. When rounding
 * changes the represented value, the visible approximation mark and the
 * detail's original probability make that loss explicit instead of implying
 * precision the display does not carry.
 *
 * This is the one formatter shared by cards, drawers and tooltips. It never
 * clamps or defaults a contract number (DR-115 / AC-76).
 */
export function v3ScorePercentage(
  value: number,
  catalog: MessageCatalog = composeEnglish
): Readonly<{ text: string; detail: string }> {
  const percentage = value * 100;
  const rounded = Math.round(percentage * 100) / 100;
  const decimal = rounded.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  const exact = rounded / 100 === value;
  return exact
    ? {
        text: `${decimal}%`,
        detail: t(catalog, "compose.v3.score.exactPercentage", { percentage: `${decimal}%` })
      }
    : {
        text: `≈${decimal}%`,
        detail: t(catalog, "compose.v3.score.roundedPercentage", {
          percentage: `≈${decimal}%`,
          probability: value
        })
      };
}

export type V3NodeScoreDetail = Readonly<{
  id: "base_score" | "final_strength";
  label: string;
  percentage: Readonly<{ text: string; detail: string }>;
  producer: string;
  source: string;
  replay_handle: string;
}>;

export type V3NodeScoreDetails = readonly [V3NodeScoreDetail, V3NodeScoreDetail];

/** The drawer-ready score records, kept executable so percentage drift is test-visible. */
export function v3NodeScoreDetails(
  node: ContractNode,
  catalog: MessageCatalog = composeEnglish
): V3NodeScoreDetails {
  if (node.final_strength === null) {
    throw new TypedDomainError("FINAL_STRENGTH_WITHHELD", `Node ${node.node_id} was excluded from the served number`);
  }
  return [
    {
      id: "base_score",
      label: t(catalog, "compose.v3.score.baseLabel", { kind: node.base_score.kind }),
      percentage: v3ScorePercentage(node.base_score.value, catalog),
      producer: node.base_score.producer,
      source: node.base_score.source,
      replay_handle: node.base_score.replay_handle
    },
    {
      id: "final_strength",
      label: t(catalog, "compose.v3.score.finalLabel", { kind: node.final_strength.kind }),
      percentage: v3ScorePercentage(node.final_strength.value, catalog),
      producer: node.final_strength.producer,
      source: node.final_strength.source,
      replay_handle: node.final_strength.replay_handle
    }
  ];
}

export type V3NodeHonestyRow = Readonly<{
  key: string;
  value: string;
  title?: string;
}>;

function scoreSourceLabel(detail: V3NodeScoreDetail, catalog: MessageCatalog): string {
  const producer = detail.producer.toLowerCase();
  if (detail.id === "base_score") {
    return producer.includes("judg")
      ? t(catalog, "compose.v3.score.source.judgePanel")
      : t(catalog, "compose.v3.score.source.recordedAssessment");
  }
  return producer.includes("propagat")
    ? t(catalog, "compose.v3.score.source.replayed")
    : t(catalog, "compose.v3.score.source.recordedResult");
}

function restatementStatusLabel(
  status: ContractNode["stranger_restatement"]["check_status"],
  catalog: MessageCatalog
): string {
  switch (status) {
    case "PASS": return t(catalog, "compose.v3.restatement.passed");
    case "FAIL": return t(catalog, "compose.v3.restatement.failed");
    case "NOT_SAMPLED": return t(catalog, "compose.v3.restatement.notSampled");
  }
}

function disagreementLabel(
  disagreement: ContractNode["disagreement"],
  catalog: MessageCatalog
): string {
  if (disagreement === null) return t(catalog, "compose.v3.disagreement.none");
  if (disagreement.kind === "NOT_MEASURED") {
    return disagreement.reason === "SINGLE_JUDGE_WALKING_SKELETON"
      ? t(catalog, "compose.v3.disagreement.singleJudge")
      : t(catalog, "compose.v3.disagreement.notMeasured");
  }
  return t(catalog, "compose.v3.disagreement.recorded");
}

/**
 * Drawer-ready honesty copy. Storage references remain in the contract for
 * traceability, but this visual surface follows the design's semantic labels
 * and never exposes UUIDs or raw JSON as prose.
 */
export function v3NodeHonestyRows(
  node: ContractNode,
  catalog: MessageCatalog = composeEnglish,
  locale = "en"
): readonly V3NodeHonestyRow[] {
  const [baseScore, finalStrength] = v3NodeScoreDetails(node, catalog);
  const defeaters = node.defeater_refs.length === 0
    ? node.defeater_exhaustion_marked
      ? t(catalog, "compose.v3.defeaters.exhausted")
      : t(catalog, "compose.v3.defeaters.open")
    : tPlural(catalog, "compose.v3.defeaters.recorded", node.defeater_refs.length, locale);

  return [
    {
      key: t(catalog, "compose.v3.honesty.baseScore"),
      value: `${baseScore.percentage.text} · ${scoreSourceLabel(baseScore, catalog)}`,
      title: baseScore.percentage.detail
    },
    {
      key: t(catalog, "compose.v3.honesty.finalStrength"),
      value: `${finalStrength.percentage.text} · ${scoreSourceLabel(finalStrength, catalog)}`,
      title: finalStrength.percentage.detail
    },
    {
      key: t(catalog, "compose.v3.honesty.replay"),
      value: t(catalog, "compose.v3.honesty.replayAvailable")
    },
    {
      key: t(catalog, "compose.v3.honesty.restatement"),
      value: t(catalog, "compose.v3.honesty.restatementCheck", {
        status: restatementStatusLabel(node.stranger_restatement.check_status, catalog)
      })
    },
    { key: t(catalog, "compose.v3.honesty.defeaters"), value: defeaters },
    {
      key: t(catalog, "compose.v3.honesty.judgeDisagreement"),
      value: disagreementLabel(node.disagreement, catalog)
    }
  ];
}

function labeledNumberBadge(
  id: V3ScoreBadge["id"],
  nameKey: string,
  abbreviationKey: string,
  number: V3LabeledNumber,
  catalog: MessageCatalog
): V3ScoreBadge {
  const percentage = v3ScorePercentage(number.value, catalog);
  return {
    id,
    pillText: t(catalog, "compose.v3.score.badge", {
      abbreviation: t(catalog, abbreviationKey),
      percentage: percentage.text
    }),
    title: t(catalog, "compose.v3.score.badgeTitle", {
      kind: number.kind,
      name: t(catalog, nameKey),
      percentage: percentage.detail,
      producer: number.producer,
      replay: number.replay_handle,
      source: number.source
    })
  };
}

/** The typed reason a card carries no number — never a 0, never a dash (DR-115). */
export function v3ScoreAbsenceCopy(
  reason: V3NodeScoreAbsence,
  catalog: MessageCatalog = composeEnglish
): Readonly<{ pillText: string; title: string }> {
  switch (reason) {
    case "QUESTION_CARD_IS_NOT_A_NODE":
      return {
        pillText: t(catalog, "compose.v3.score.noScore"),
        title: t(catalog, "compose.v3.score.questionHasNoScore")
      };
    case "NO_SERVED_ANSWER":
      return {
        pillText: t(catalog, "compose.v3.score.noScoreYet"),
        title: t(catalog, "compose.v3.score.answerHasNoScoreYet")
      };
    case "NODE_ABSENT_FROM_SERVED_ANSWER":
      return {
        pillText: t(catalog, "compose.v3.score.noScore"),
        title: t(catalog, "compose.v3.score.cardHasNoScore")
      };
  }
}

export function v3ScorePresentation(
  state: V3NodeScoreState,
  catalog: MessageCatalog = composeEnglish
): V3ScorePresentation {
  if (state.status === "ABSENT") {
    return { status: "ABSENT", badge: v3ScoreAbsenceCopy(state.reason, catalog) };
  }
  return {
    status: "PRESENT",
    badges: [
      labeledNumberBadge(
        "base_score",
        "compose.v3.score.baseName",
        "compose.v3.score.baseAbbreviation",
        state.base_score,
        catalog
      ),
      labeledNumberBadge(
        "final_strength",
        "compose.v3.score.finalName",
        "compose.v3.score.finalAbbreviation",
        state.final_strength,
        catalog
      )
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
    status: tree.status === "complete" ? "complete" : tree.status === "failed" ? "failed" : "generating",
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

/** V2's generating card, backed only by the asker-owned typed run projection. */
export function debateDetailFromRunProjection(
  run: RunProjection,
  catalog: MessageCatalog = composeEnglish,
  locale = "en"
): DebateDetail {
  const status = run.state === "FAILED" ? "failed" : "generating";
  const presentedState = run.state === "CLAIMED" ? "RUNNING" : run.state;
  const holdUntilMs = run.hold_until === null ? null : Date.parse(run.hold_until);
  const remainingMinutes = holdUntilMs === null || Number.isNaN(holdUntilMs)
    ? null
    : Math.max(0, Math.ceil((holdUntilMs - Date.now()) / 60_000));
  const holdReason = run.state === "HOLDING" && run.hold_until !== null
    ? t(catalog, "compose.v3.providerHold", {
        retryAt: new Date(run.hold_until).toLocaleString(),
        remaining: tPlural(catalog, "compose.v3.minutesRemaining", remainingMinutes ?? 0, locale)
      })
    : null;
  return { ...liveDebateDetail(run.run_ref, {
    id: run.run_ref,
    debate_id: run.run_ref,
    parent_id: null,
    node_type: "ROOT_CLAIM",
    label: null,
    lens: null,
    depth: 0,
    position: 0,
    claim: run.question_line,
    status,
    materialized_path: "0",
    active_generation_id: null,
    active_generation: null,
    children: []
  }), run_state: presentedState, hold_until: run.hold_until,
  ...(holdReason === null ? {} : {
    completion: { state: "running" as const, reasonCode: "PROVIDER_RECOVERY_HOLD", humanReason: holdReason }
  }) };
}

export function hiddenNodeScoreThresholdFromDeployment(deployment: Deployment): Readonly<{
  value: number;
  sourceRef: string;
  registerVersion: number;
}> {
  const row = deployment.register.rows.find((candidate) => candidate.row_key === "hiddenNodeScoreThreshold");
  if (row === undefined || typeof row.value !== "number" || !Number.isFinite(row.value)
    || row.value < 0 || row.value > 1) {
    throw new TypedDomainError(
      "HIDDEN_NODE_SCORE_THRESHOLD_UNRESOLVED",
      "Deployment register row hiddenNodeScoreThreshold is absent or invalid."
    );
  }
  return Object.freeze({
    value: row.value,
    sourceRef: row.source_ref,
    registerVersion: deployment.register.register_version
  });
}

export function debateSummariesFromIndex(index: AnswerIndex): DebateSummary[] {
  const servedRunRefs = new Set(index.items.map((item) => item.run_ref));
  const served = index.items.map((item) => ({
    id: item.answer_id,
    topic: item.question_line,
    status: "complete",
    created_at: "",
    completed_at: null,
    models: [],
    created_at_sequence: item.created_at_sequence,
    terminal_reason: null
  }));
  const open = index.open_runs
    .filter((run) => !servedRunRefs.has(run.run_ref))
    .map((run) => ({
      id: run.run_ref,
      topic: run.question_line,
      status: run.state === "FAILED" ? "failed" : "generating",
      created_at: "",
      completed_at: null,
      models: [],
      created_at_sequence: run.created_at_sequence,
      terminal_reason: run.terminal_reason
    }));
  return [...served, ...open]
    .sort((left, right) => right.created_at_sequence - left.created_at_sequence);
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
  t(composeEnglish, "compose.v3.scoringAbsenceReason");

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
export const V3_SCORING_STATUS_LABEL = t(composeEnglish, "compose.v3.scoringStatus");

export function v3ScoringStatusLabel(
  reason: string | null | undefined,
  catalog: MessageCatalog = composeEnglish
): string | null {
  const normalizedReason = (reason ?? "").trim();
  return normalizedReason === SCORING_ABSENCE_REASON
    || normalizedReason === t(catalog, "compose.v3.scoringAbsenceReason")
    ? t(catalog, "compose.v3.scoringStatus")
    : null;
}

export function scoringUnavailable(
  debateId: string,
  catalog: MessageCatalog = composeEnglish
): DebateScoringResponse {
  return {
    debate_id: debateId,
    status: "unavailable",
    node_ids: [],
    items: [],
    reason: t(catalog, "compose.v3.scoringAbsenceReason")
  };
}

export function adaptiveDepthUnavailable(
  debateId: string,
  catalog: MessageCatalog = composeEnglish
): DebateAdaptiveDepthDryRunResponse {
  return {
    debate_id: debateId,
    status: "unavailable",
    reason: t(catalog, "compose.v3.adaptiveDepthUnavailable"),
    plan: {
      policy: {
        mode: "fixed",
        target_depth: null,
        reason: t(catalog, "compose.v3.adaptiveDepthPlanUnavailable")
      },
      candidate_count: 0,
      expansion_count: 0,
      items: []
    }
  };
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

type ModelLedgerIdentity = Pick<
  Deployment["model_ledger"][number],
  "model_id" | "model_version" | "provider"
>;

/** Collision-safe ledger identity; the source escape evaluates to the original NUL delimiter. */
export function modelLedgerIdentityKey(entry: ModelLedgerIdentity): string {
  return `${entry.model_id}\u0000${entry.model_version}\u0000${entry.provider}`;
}

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

    const key = modelLedgerIdentityKey(entry);
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
