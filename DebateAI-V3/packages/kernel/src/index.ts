export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type RunId = Brand<string, "RunId">;
export type NodeId = Brand<string, "NodeId">;
export type EdgeId = Brand<string, "EdgeId">;
export type WorkItemId = Brand<string, "WorkItemId">;
export type RawArtifactRef = Brand<string, "RawArtifactRef">;
export type LedgerEntryRef = Brand<string, "LedgerEntryRef">;

export const TERMINAL_ROUTES = [
  "INERT_STOP",
  "FALSE_PRESUPPOSITION_NON_ANSWER",
  "VALUE_TO_HUMAN",
  "NOT_EMPIRICALLY_DECIDABLE",
  "DEPTH_ZERO_NO_JUSTIFICATION_NO_SPLIT"
] as const;
export type TerminalRoute = typeof TERMINAL_ROUTES[number];

export const WAY_OF_KNOWING = ["LOOKED_UP", "RAN", "REASONING"] as const;
export type WayOfKnowing = typeof WAY_OF_KNOWING[number];

export const CLAIM_TYPES = [
  "empirical", "causal", "normative", "definitional",
  "prediction", "comparative", "mixed", "unknown"
] as const;
export type ClaimType = typeof CLAIM_TYPES[number];

export const ACCESS_DEPTHS = ["OPENED_FULL", "PREVIEW_ONLY", "ACCESS_BLOCKED"] as const;
export type AccessDepth = typeof ACCESS_DEPTHS[number];

// DR-109 ratified this exact ordered failure ladder. VERIFIED is deliberately
// carried by CitationOutcome, never smuggled in as a ninth route.
export const CITATION_ROUTES = [
  "NO_SOURCE_FOUND",
  "CITATION_UNBACKED",
  "SOURCE_UNREACHABLE",
  "PREVIEW_DEPTH_ONLY",
  "SOURCE_SUPERSEDED",
  "EXACT_COMPARE_UNAVAILABLE",
  "SPAN_NOT_FOUND",
  "SPAN_MISMATCH"
] as const;
export type CitationRoute = typeof CITATION_ROUTES[number];

export const CITATION_OUTCOMES = ["VERIFIED", "ROUTED"] as const;
export type CitationOutcome = typeof CITATION_OUTCOMES[number];

export const COMPARE_UNAVAILABLE_REASONS = [
  "NO_SPAN_CITED",
  "MEDIUM_UNSUPPORTED",
  "COMPARE_NOT_EXECUTED",
  "COMPARE_EXECUTION_NOT_OK",
  "COMPARE_RESULT_MISSING"
] as const;
export type CompareUnavailableReason = typeof COMPARE_UNAVAILABLE_REASONS[number];

// Spec §12.3 is the sole minting authority for these five ignorance-ledger outcomes.
export const ABSTENTION_KINDS = [
  "not searched",
  "searched and found nothing",
  "measured and inconclusive",
  "not runnable",
  "a value choice"
] as const;
export type AbstentionKind = typeof ABSTENTION_KINDS[number];

// Spec §12.3 Home 2 is the sole minting authority. Every wire, UI and DDL
// representation imports this vocabulary; no sibling package extends it.
export const CONDITION_MARKS = [
  "UNINSTRUMENTED",
  "UNFALSIFIED-AFTER-ROTATION",
  "SKIPPED-BY-BUDGET",
  "ENVELOPE_EXHAUSTED",
  "LEVERAGE_UNRESOLVED",
  "DEGRADED-DIVERSITY",
  "SINGLE-LINEAGE",
  "CRITIQUE-UNAVAILABLE",
  "AMBIGUOUS_ATTRIBUTION",
  "STALE",
  "UNDER-REVIEW",
  "UNDER-EXPLORED",
  "UNRESOLVED-TYPE-FALLBACK",
  "DEFECT",
  "UNPRICED",
  "UNADJUDICATED",
  "UNCOVERED-SCOPE",
  "NON-COMPARABLE",
  "NOT_SAMPLED",
  "OFF-SUBJECT-DOWNGRADE",
  "AMENDED-SEARCH",
  "MISSING-NUMBER",
  // DR-139(4), TERM-01: a battery row ACTIVE at run completion whose owed
  // check has no recorded execution — the run settles and the served answer
  // names each such check loudly (one condition-mark record per row).
  "OWED-CHECK-UNEXECUTED"
] as const;
export type ConditionMark = typeof CONDITION_MARKS[number];

export const RISK_TIERS = ["casual", "standard", "high-stakes"] as const;
export type RiskTier = typeof RISK_TIERS[number];

export const TIER_SOURCES = ["ASKER", "DEPLOYMENT_POLICY"] as const;
export type TierSource = typeof TIER_SOURCES[number];

// DR-017/DR-053: these vocabularies are minted once here. In particular,
// weight absence is a real member and there is deliberately no default.
export const WEIGHT_SOURCES = ["owner_elicited", "org_policy", "none"] as const;
export type WeightSourceKind = typeof WEIGHT_SOURCES[number];

export const RUN_PHASES = ["EMPIRICAL", "VALUE"] as const;
export type RunPhase = typeof RUN_PHASES[number];

export const SETTLEMENT_ACTS = ["EMPIRICAL_ACT", "VALUE_ACT", "DUAL_ACT"] as const;
export type SettlementAct = typeof SETTLEMENT_ACTS[number];

export const COMPOSITION_BUDGET_TIERS = ["low", "medium", "high"] as const;
export type CompositionBudgetTier = typeof COMPOSITION_BUDGET_TIERS[number];

export const ACTIVATION_STATES = ["ACTIVE", "INACTIVE", "WAIT", "POLICY_BLOCKED"] as const;
export type ActivationState = typeof ACTIVATION_STATES[number];

export const CHILD_KINDS = [
  "support",
  "attack",
  "defeater",
  "shared-crux sub-claim",
  "necessary condition",
  "sub-question",
  "assumption",
  "scope carve-out"
] as const;
export type ChildKind = typeof CHILD_KINDS[number];

export const GENERATION_STATUSES = ["pending", "complete", "failed", "stale"] as const;
export type GenerationStatus = typeof GENERATION_STATUSES[number];

export const PATH_STATUSES = ["active", "abandoned"] as const;
export type PathStatus = typeof PATH_STATUSES[number];

export const EXPLORATION_DECISIONS = [
  "continue",
  "deepen",
  "seek_evidence",
  "challenge",
  "abandon",
  "reopen"
] as const;
export type ExplorationDecision = typeof EXPLORATION_DECISIONS[number];

export const EDGE_TARGET_KINDS = ["NODE", "EDGE"] as const;
export type EdgeTargetKind = typeof EDGE_TARGET_KINDS[number];

export const EDGE_POLARITIES = ["support", "attack"] as const;
export type EdgePolarity = typeof EDGE_POLARITIES[number];

export const EDGE_KINDS = ["rebutting", "undercutting"] as const;
export type EdgeKind = typeof EDGE_KINDS[number];

export const MAGNITUDE_STATUSES = ["MEASURED", "UNKNOWN"] as const;
export type MagnitudeStatus = typeof MAGNITUDE_STATUSES[number];

export const STRENGTH_SOURCES = [
  "EVIDENCE_VERIFIER",
  "CLUSTER_COLLAPSE",
  "UNDERCUT_TRANSMISSION"
] as const;
export type StrengthSource = typeof STRENGTH_SOURCES[number];

export const SCORING_OPERATORS = ["accumulate", "strict-and"] as const;
export type ScoringOperator = typeof SCORING_OPERATORS[number];

export const OPERATOR_SUPPLYING_LEVELS = ["parent", "run", "deployment"] as const;
export type OperatorSupplyingLevel = typeof OPERATOR_SUPPLYING_LEVELS[number];

export const STANCES = ["SUPPORTS", "ATTACKS", "NEUTRAL", "UNASSIGNED"] as const;
export type StanceAtAction = typeof STANCES[number];

export const LEDGER_OUTCOMES = ["OK", "FAILED", "BLOCKED", "TIMED_OUT", "REFUSED", "SKIPPED_BY_BUDGET"] as const;
export type LedgerOutcome = typeof LEDGER_OUTCOMES[number];

export const LEDGER_ACTION_KINDS = [
  "MODEL_CALL",
  "JUDGEMENT_SCHEDULED",
  "PROPAGATION",
  "BUDGET_SKIP",
  "SERVE",
  "SETTLEMENT_OUTCOME_RECORDED",
  "SETTLEMENT_ATTEMPT_SUPERSEDED",
  "SETTLEMENT_READ_BACK_VERIFIED",
  "SCORECARD_DERIVED_FROM_LEDGER",
  "UNCLASSIFIED_ACTION"
] as const;
export type LedgerActionKind = typeof LEDGER_ACTION_KINDS[number];

export const ACTION_SCOPES = ["ITEM_SCOPED", "PRE_ITEM"] as const;
export type ActionScope = typeof ACTION_SCOPES[number];

export const SYMMETRY_DIFF_STATUSES = ["SYMMETRIC", "ASYMMETRIC", "UNINSTRUMENTED"] as const;
export type SymmetryDiffStatus = typeof SYMMETRY_DIFF_STATUSES[number];

export const INDEPENDENCE_RECEIPT_STATUSES = ["INDEPENDENT", "NOT_INDEPENDENT", "UNKNOWN"] as const;
export type IndependenceReceiptStatus = typeof INDEPENDENCE_RECEIPT_STATUSES[number];

export const INDEPENDENCE_ABSENCE_REASONS = [
  "NO_CRITIC", "SAME_MAKER", "SHARED_CONTEXT", "PACKET_MISSING", "CRITIC_LOG_MISSING",
  "CRITIC_SAW_UNBLINDED_ORDER"
] as const;
export type IndependenceAbsenceReason = typeof INDEPENDENCE_ABSENCE_REASONS[number];

export const OBJECTION_STATUSES = ["OPEN", "CLOSED"] as const;
export type ObjectionStatus = typeof OBJECTION_STATUSES[number];

export const LEDGER_ACTION_SCOPE = Object.freeze({
  MODEL_CALL: "ITEM_SCOPED",
  JUDGEMENT_SCHEDULED: "ITEM_SCOPED",
  PROPAGATION: "ITEM_SCOPED",
  BUDGET_SKIP: "ITEM_SCOPED",
  SERVE: "ITEM_SCOPED",
  SETTLEMENT_OUTCOME_RECORDED: "PRE_ITEM",
  SETTLEMENT_ATTEMPT_SUPERSEDED: "PRE_ITEM",
  SETTLEMENT_READ_BACK_VERIFIED: "PRE_ITEM",
  SCORECARD_DERIVED_FROM_LEDGER: "PRE_ITEM",
  UNCLASSIFIED_ACTION: "PRE_ITEM"
} as const satisfies Readonly<Record<LedgerActionKind, ActionScope>>);

export function classifyLedgerActionKind(value: string): LedgerActionKind {
  return (LEDGER_ACTION_KINDS as readonly string[]).includes(value)
    ? value as LedgerActionKind
    : "UNCLASSIFIED_ACTION";
}

export const ORGAN_STAGE_MAP = Object.freeze({
  SCORER: Object.freeze(["WEIGH", "COMPOSE"] as const),
  JUDGE_CONTRACT: Object.freeze(["WEIGH"] as const),
  GRAPH_SHAPES: Object.freeze(["SPLIT_OBJECT", "SPLIT_SUBSTRATE"] as const),
  SPAWN_PLUMBING: Object.freeze(["SPLIT_MECHANICS"] as const),
  LEDGER: Object.freeze(["ALL_STAGES", "SERVE_READS"] as const),
  SERVE: Object.freeze(["SERVE"] as const)
});

export interface LabeledNumber {
  readonly value: number;
  readonly kind: string;
  readonly source: string;
  readonly producer: string;
  readonly provenanceRef: string;
  readonly replayHandle: string;
}

export function createLabeledNumber(input: LabeledNumber): LabeledNumber {
  if (!Number.isFinite(input.value)) {
    throw new TypeError("A labeled number must be finite");
  }
  for (const field of [input.kind, input.source, input.producer, input.provenanceRef, input.replayHandle]) {
    if (field.trim().length === 0) throw new TypeError("A labeled number cannot contain a blank label");
  }
  return Object.freeze({ ...input });
}

export function exhaustive(value: never): never {
  throw new TypeError(`Unknown closed-vocabulary member: ${String(value)}`);
}

export class TypedDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TypedDomainError";
  }
}
