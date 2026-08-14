import type {
  Answer,
  AbstentionKind,
  ConditionMark,
  EventType,
  InvestigationGap,
  RunEvent,
  StalenessState
} from "@debateai/contract";
import { InvestigationGapSchema } from "@debateai/contract";

export type AnswerSurfaceProjection = Readonly<{
  identity: { answerId: string; answerVersion: number; runRef: string };
  mode: "COMPOSED" | "RECOMPOSED_ONCE" | "COMPONENTS_ONLY";
  text: readonly string[];
  defect: boolean;
  questionLine: string;
  terminal: Answer["terminal"];
  verdict: { state: Answer["verdict_state"]; unavailable: Answer["verdict_unavailable"]; confidenceBand: string | null; ceiling: Answer["band_ceiling"] };
  answerForm: Answer["answer_form"];
  numberSlots: Answer["number_slots"];
  abstention: Answer["abstention"];
  shadowSuppressions: Answer["shadow_suppressions"];
  nodes: Answer["nodes"];
  edges: Answer["edges"];
  badges: Answer["badges"];
  residualObjections: Answer["residual_objections"];
  valueHinges: Answer["value_hinges"];
  conditionMarks: Answer["condition_marks"];
  conditionMarkRecords: Answer["condition_mark_records"];
  reversalPoint: string;
  buildsOnPrevious: Answer["builds_on_previous"];
  memoryDisclosure: Answer["memory_disclosure"];
  risk: { tier: Answer["risk_tier"]; source: Answer["tier_source"]; provenanceRef: string };
  costEnvelope: Answer["cost_envelope"];
  compositionBudgetTier: Answer["composition_budget_tier"];
  conformanceOutcome: string;
  ledgerDigestHandle: string;
  inspectionHandle: string;
  time: { asOf: string; stalenessState: Answer["staleness_state"]; relevantAsOf: string };
}>;

// This projection deliberately destructures every declared Answer field. It is
// the served-field -> consumer half of AC-61, enforced by auditS14TypeGraph.
export function projectAnswerSurface(answer: Answer): AnswerSurfaceProjection {
  const {
    answer_id,
    answer_version,
    run_ref,
    question_line,
    terminal,
    verdict_state,
    verdict_unavailable,
    confidence_band,
    band_ceiling,
    answer_form,
    serve_state,
    composed_text,
    number_slots,
    abstention,
    shadow_suppressions,
    nodes,
    edges,
    badges,
    residual_objections,
    value_hinges,
    condition_marks,
    condition_mark_records,
    reversal_point,
    builds_on_previous,
    memory_disclosure,
    risk_tier,
    tier_source,
    tier_provenance_ref,
    cost_envelope,
    composition_budget_tier,
    conformance_outcome,
    ledger_digest_handle,
    inspection_handle,
    as_of,
    staleness_state,
    relevant_as_of
  } = answer;
  return Object.freeze({
    identity: { answerId: answer_id, answerVersion: answer_version, runRef: run_ref },
    mode: serve_state,
    text: Object.freeze(composed_text.map((segment) => segment.text)),
    defect: condition_marks.includes("DEFECT"),
    questionLine: question_line,
    terminal,
    verdict: { state: verdict_state, unavailable: verdict_unavailable, confidenceBand: confidence_band, ceiling: band_ceiling },
    answerForm: answer_form,
    numberSlots: number_slots,
    abstention,
    shadowSuppressions: shadow_suppressions,
    nodes,
    edges,
    badges,
    residualObjections: residual_objections,
    valueHinges: value_hinges,
    conditionMarks: condition_marks,
    conditionMarkRecords: condition_mark_records,
    reversalPoint: reversal_point,
    buildsOnPrevious: builds_on_previous,
    memoryDisclosure: memory_disclosure,
    risk: { tier: risk_tier, source: tier_source, provenanceRef: tier_provenance_ref },
    costEnvelope: cost_envelope,
    compositionBudgetTier: composition_budget_tier,
    conformanceOutcome: conformance_outcome,
    ledgerDigestHandle: ledger_digest_handle,
    inspectionHandle: inspection_handle,
    time: { asOf: as_of, stalenessState: staleness_state, relevantAsOf: relevant_as_of }
  });
}

export function conditionMarkLabel(mark: ConditionMark): string {
  switch (mark) {
    case "UNINSTRUMENTED": return "Checking record incomplete";
    case "UNFALSIFIED-AFTER-ROTATION": return "Not falsified after model rotation";
    case "SKIPPED-BY-BUDGET": return "Enrichment skipped by budget";
    case "ENVELOPE_EXHAUSTED": return "Run envelope exhausted";
    case "LEVERAGE_UNRESOLVED": return "Leverage unresolved";
    case "DEGRADED-DIVERSITY": return "Model diversity degraded";
    case "SINGLE-LINEAGE": return "Single model lineage";
    case "CRITIQUE-UNAVAILABLE": return "Independent critique unavailable";
    case "AMBIGUOUS_ATTRIBUTION": return "Attribution ambiguous";
    case "STALE": return "Stale";
    case "UNDER-REVIEW": return "Under review";
    case "UNDER-EXPLORED": return "Under-explored";
    case "UNRESOLVED-TYPE-FALLBACK": return "Question type unresolved; fallback served";
    case "DEFECT": return "Defect: components-only answer";
    case "UNPRICED": return "Abstention cell unpriced";
    case "UNADJUDICATED": return "No adverse evidence found";
    case "UNCOVERED-SCOPE": return "Scope not fully covered";
    case "UNSERVED-MAKER-POSITION": return "Another maker's position was not served";
    case "NON-COMPARABLE": return "Results are not compute-matched";
    case "NOT_SAMPLED": return "Not sampled";
    case "OFF-SUBJECT-DOWNGRADE": return "Off-subject evidence downgraded";
    case "AMENDED-SEARCH": return "Search amended during run";
    case "MISSING-NUMBER": return "Number removed after replay failure";
    case "OWED-CHECK-UNEXECUTED": return "Owed check not executed at completion";
    case "HIDDEN-UNJUDGEABLE": return "Hidden: could not be judged — show hidden to read it";
    case "HIDDEN-LOW-SCORE": return "Hidden: scored below the shown threshold";
    case "UNAUTHORED-BRANCH-HALTED": return "Expansion stopped here — nothing was written to hide or show";
  }
}

export function abstentionKindLabel(kind: AbstentionKind): string {
  switch (kind) {
    case "not searched": return "Not searched";
    case "searched and found nothing": return "Searched and found nothing";
    case "measured and inconclusive": return "Measured, but inconclusive";
    case "not runnable": return "Not runnable";
    case "a value choice": return "A value choice";
  }
}

export type FreshnessItem = Readonly<{ subjectRef: string; state: StalenessState }>;
export function summarizeFreshness(items: readonly FreshnessItem[]):
  | Readonly<{ kind: "EMPTY"; items: readonly FreshnessItem[] }>
  | Readonly<{ kind: "UNIFORM"; state: StalenessState; items: readonly FreshnessItem[] }>
  | Readonly<{ kind: "MIXED"; items: readonly FreshnessItem[] }> {
  const frozen = Object.freeze(items.map((item) => Object.freeze({ ...item })));
  if (frozen.length === 0) return { kind: "EMPTY", items: frozen };
  const first = frozen[0]!.state;
  return frozen.every((item) => item.state === first)
    ? { kind: "UNIFORM", state: first, items: frozen }
    : { kind: "MIXED", items: frozen };
}

export type LiveNode = Readonly<{ lifecycle: "spawned" | "generating" | "being-judged" | "scored" | "complete" | "failed" | "retrying" }>;
export type LiveAnswerState = Readonly<{
  nodes: Readonly<Record<string, LiveNode>>;
  placeholderEdges: readonly Readonly<{ from: string; to: string; relation: string }>[];
  refreshRequired: boolean;
  runPhase: "idle" | "accepted" | "planning" | "running" | "terminal";
  servePhase: "idle" | "bundle-frozen" | "composing" | "conformance" | "recompose-or-defect";
  nodeText: Readonly<Record<string, string>>;
  compositionText: string;
  cycleRefusals: readonly string[];
  investigationGaps: readonly InvestigationGap[];
  honestyEvents: readonly EventType[];
  ledgerEvents: readonly EventType[];
  consumedEvents: Readonly<Partial<Record<EventType, number>>>;
}>;

export function createEmptyLiveAnswerState(): LiveAnswerState {
  return Object.freeze({
    nodes: {}, placeholderEdges: [], refreshRequired: false, runPhase: "idle", servePhase: "idle",
    nodeText: {}, compositionText: "", cycleRefusals: [], investigationGaps: [], honestyEvents: [],
    ledgerEvents: [], consumedEvents: {}
  });
}

function payloadText(event: RunEvent, key: string): string | null {
  const value = event.payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

export function applyRunEvent(state: LiveAnswerState, event: RunEvent): LiveAnswerState {
  const consumedEvents = Object.freeze({
    ...state.consumedEvents,
    [event.event_type]: (state.consumedEvents[event.event_type] ?? 0) + 1
  });
  const observed = Object.freeze({ ...state, consumedEvents });
  switch (event.event_type) {
    case "run.accepted": return Object.freeze({ ...observed, runPhase: "accepted" });
    case "run.planning": return Object.freeze({ ...observed, runPhase: "planning" });
    case "run.running": return Object.freeze({ ...observed, runPhase: "running" });
    case "run.terminal": return Object.freeze({ ...observed, runPhase: "terminal" });
    case "serve.bundle_frozen": return Object.freeze({ ...observed, servePhase: "bundle-frozen" });
    case "serve.composition_started": return Object.freeze({ ...observed, servePhase: "composing" });
    case "serve.composition_delta": return Object.freeze({
      ...observed,
      servePhase: "composing",
      compositionText: observed.compositionText + (payloadText(event, "delta") ?? "")
    });
    case "serve.conformance_verdict": return Object.freeze({ ...observed, servePhase: "conformance" });
    case "serve.recompose_or_defect": return Object.freeze({ ...observed, servePhase: "recompose-or-defect" });
    case "graph.edge_added": {
      const from = payloadText(event, "from_node_ref");
      const to = payloadText(event, "target_ref");
      if (from === null || to === null) return observed;
      return Object.freeze({
        ...observed,
        placeholderEdges: Object.freeze([...observed.placeholderEdges, Object.freeze({
          from,
          to,
          relation: payloadText(event, "relation") ?? "pending"
        })])
      });
    }
    case "graph.cycle_refused": return Object.freeze({
      ...observed,
      cycleRefusals: Object.freeze([...observed.cycleRefusals, payloadText(event, "code") ?? "CIRCULAR_DEPENDENCY_FOUND"])
    });
    case "honesty.staleness_trigger_fired": return Object.freeze({
      ...observed,
      refreshRequired: true,
      honestyEvents: Object.freeze([...observed.honestyEvents, event.event_type])
    });
    case "honesty.investigation_gap_opened": return Object.freeze({
      ...observed,
      investigationGaps: Object.freeze([...observed.investigationGaps, Object.freeze(InvestigationGapSchema.parse(event.payload))]),
      honestyEvents: Object.freeze([...observed.honestyEvents, event.event_type])
    });
    case "honesty.abstention_typed":
    case "honesty.budget_skip_marked":
    case "honesty.fallback_labeled":
    case "honesty.memory_link_decided":
    case "honesty.under_explored_marked":
      return Object.freeze({ ...observed, honestyEvents: Object.freeze([...observed.honestyEvents, event.event_type]) });
    case "ledger.attempt":
    case "ledger.failure":
    case "ledger.could_not_do":
      return Object.freeze({ ...observed, ledgerEvents: Object.freeze([...observed.ledgerEvents, event.event_type]) });
  }
  const subject = event.subject_ref ?? payloadText(event, "node_ref");
  if (subject === null || subject === undefined) return observed;
  if (event.event_type === "node.text_delta") {
    return Object.freeze({
      ...observed,
      nodeText: Object.freeze({ ...observed.nodeText, [subject]: (observed.nodeText[subject] ?? "") + (payloadText(event, "delta") ?? "") })
    });
  }
  const lifecycle = event.event_type === "node.being_judged"
    ? "being-judged"
    : event.event_type.slice("node.".length) as LiveNode["lifecycle"];
  const nodes = Object.freeze({ ...observed.nodes, [subject]: Object.freeze({ lifecycle }) });
  if (event.event_type !== "node.spawned") return Object.freeze({ ...observed, nodes });
  const parent = payloadText(event, "parent_ref");
  if (parent === null) return Object.freeze({ ...observed, nodes });
  const relation = payloadText(event, "relation") ?? "placeholder";
  return Object.freeze({
    ...observed,
    nodes,
    placeholderEdges: Object.freeze([...observed.placeholderEdges, Object.freeze({ from: subject, to: parent, relation })])
  });
}
