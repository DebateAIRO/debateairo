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

/**
 * T10 (goal 188-195, rulings S6-1 / S6-3) — the rule that picks the served root.
 *
 * DR-161's configuration-order rule is RETIRED — its retired string is named
 * once, in migrations/0055_t10_served_root_selection.sql, and nowhere else in
 * shipped source. Configuration order no longer decides the answer;
 * propagation does. The served root is the one carrying the
 * maximum propagated strength among the servable maker roots, and an exact tie
 * is broken by lexicographic node id — deterministic, order-independent, and
 * CONTESTED under T11's ladder anyway because a tie's margin is zero.
 *
 * Minted here, beside the other closed vocabularies, because the same string is
 * a typed record field (serve), a wire literal (contract) and a DDL CHECK member
 * (migrations). One declaration; every representation imports it.
 */
export const SERVED_ROOT_SELECTION_RULE = "max-propagated-strength-lexicographic-tiebreak" as const;
/** The rule a NEW selection may record. The write vocabulary. */
export type ServedRootRule = typeof SERVED_ROOT_SELECTION_RULE;

/**
 * Rules that were lawful when older answers were sealed, and are therefore
 * still present on their records. READ-ONLY: no new selection may record one,
 * and no shipped writer contains the literal — the values only ever arrive by
 * reading a row that was sealed before migration 0055.
 *
 * This list exists because migration 0055 PRESERVES those rows rather than
 * relabelling them. A record is evidence of how an answer was actually chosen;
 * rewriting it to today's rule would be a falsification, so the read vocabulary
 * is a superset of the write vocabulary and says so in the type system.
 */
export const RETIRED_SERVED_ROOT_RULES = ["first-configured-provider"] as const;
export type RetiredServedRootRule = typeof RETIRED_SERVED_ROOT_RULES[number];

/** Every value a sealed record may lawfully carry — the READ vocabulary. */
export const SERVED_ROOT_RULE_HISTORY = Object.freeze([
  SERVED_ROOT_SELECTION_RULE,
  ...RETIRED_SERVED_ROOT_RULES
] as const);
export type ServedRootRuleHistory = ServedRootRule | RetiredServedRootRule;

/** True for a value that may be READ but never WRITTEN by a fresh selection. */
export function isRetiredServedRootRule(value: string | null): value is RetiredServedRootRule {
  return value !== null && (RETIRED_SERVED_ROOT_RULES as readonly string[]).includes(value);
}

// Spec §12.3 Home 2 is the sole minting authority. Every wire, UI and DDL
// representation imports this vocabulary; no sibling package extends it.
export const CONDITION_MARKS = [
  "UNINSTRUMENTED",
  "UNFALSIFIED-AFTER-ROTATION",
  "SKIPPED-BY-BUDGET",
  "ENVELOPE_EXHAUSTED",
  "LEVERAGE_UNRESOLVED",
  // S3-2/S5-1 (goal-v4 T7): adaptive stopping froze this branch — its
  // root-scoped leverage fell strictly below ε (mission ruling J3), so nothing
  // was expanded beneath it. Placed HERE beside the other leverage disclosure
  // and NOT appended: the DR-176 tail of this vocabulary is read positionally
  // by `CONDITION_MARKS.slice(-4)`.
  "BRANCH-FROZEN-LOW-LEVERAGE",
  "DEGRADED-DIVERSITY",
  "SINGLE-LINEAGE",
  "CRITIQUE-UNAVAILABLE",
  // S2-2 (goal-v4 T3) / confirm-item 5, ruling J13(b): the judge panel's two degradation
  // disclosures. PANEL-PARTIAL — some non-author members failed, the node was reduced on
  // the voices that parsed. PANEL-DEGRADED-SINGLE-VOICE — every non-author member failed,
  // so the author's own voice is the only one left and the node's band steps down. Placed
  // HERE, beside the other panel/lineage degradations and NOT appended: the DR-176 tail
  // of this vocabulary is read positionally by `CONDITION_MARKS.slice(-4)`.
  "PANEL-PARTIAL",
  "PANEL-DEGRADED-SINGLE-VOICE",
  "AMBIGUOUS_ATTRIBUTION",
  "STALE",
  "UNDER-REVIEW",
  "UNDER-EXPLORED",
  "UNRESOLVED-TYPE-FALLBACK",
  "DEFECT",
  "UNPRICED",
  "UNADJUDICATED",
  "UNCOVERED-SCOPE",
  // DR-161: another maker authored a complete root position, but the ruled
  // one-root serve selected a different maker's root.
  "UNSERVED-MAKER-POSITION",
  "NON-COMPARABLE",
  "NOT_SAMPLED",
  "OFF-SUBJECT-DOWNGRADE",
  // S2-3 (goal-v4 T4): the judge claimed a way of knowing normalization could
  // not keep — a locator-less LOOKED_UP. The node is served as REASONING and
  // the override is disclosed rather than absorbed. Deliberately placed here,
  // beside the other downgrade disclosure, and NOT appended: the DR-176 tail
  // of this vocabulary is read positionally by `CONDITION_MARKS.slice(-4)`.
  "WAY-OF-KNOWING-DOWNGRADED",
  "AMENDED-SEARCH",
  "MISSING-NUMBER",
  // S6-1 / T11, confirm-item 6: the three-state label was derived without a
  // complete basis — no runner-up existed to measure a margin against, or the
  // winning root's panel reported fewer than two parseable judgements, so no
  // dispersion could be measured. The label is CONTESTED and says why: a solo
  // voice can never print SUPPORTED, no matter how confident. Placed HERE,
  // beside the other served-answer honesty disclosures, and NOT appended: the
  // DR-176 tail of this vocabulary is read positionally by
  // `CONDITION_MARKS.slice(-4)`.
  "LABEL-BASIS-INCOMPLETE",
  // DR-139(4), TERM-01: a battery row ACTIVE at run completion whose owed
  // check has no recorded execution — the run settles and the served answer
  // names each such check loudly (one condition-mark record per row).
  "OWED-CHECK-UNEXECUTED",
  // S6-2 / T9, confirm-items 2-3: the synthesis loop reached its sealed round
  // bound with the evaluator still unsatisfied. The statement is SERVED
  // regardless — the loop never withholds an answer — and the objection that
  // is still standing rides it VISIBLY rather than being dropped on the floor.
  "SYNTHESIS-OBJECTION-STANDING",
  // T9 (goal 223-231): the digest's per-node summaries had to be tightened to
  // fit the composition byte budget. MEMBERSHIP is untouched — every
  // materialized node is still in the digest — so this names a loss of detail,
  // never a loss of nodes.
  "DIGEST-COMPRESSED",
  // T9 (goal 226-228, 263-266): even at maximum compression the digest exceeds
  // the byte budget, so no digest exists to synthesize from. One of the four
  // enumerated COMPONENTS_ONLY crash classes — a death, not a quality
  // judgement, and never a silent subset of the nodes.
  "DIGEST-CANNOT-EXIST",
  // F4 / T9 (goal 248-251): the envelope terminal fired while the served root's
  // R9 restatement had FAILED. Before T9 that combination could not exist —
  // `protectedCoreVerified` threw — because the guard was keyed on R9's
  // GATE-HOOD. R9 is an evaluator objection criterion now, so the guard is
  // knowingly retired and the failing status is DISCLOSED instead of deciding.
  // Minted as a mark rather than left in the gate trace because J25 rules that
  // a disclosure a reader of the answer cannot see is not a disclosure.
  "PROTECTED-CORE-GUARD-RETIRED",
  // DR-176: authored material whose cross-maker review transport exhausted.
  // It remains append-only and revealable, but is excluded from the served
  // number and disclosed as unjudged when revealed.
  "HIDDEN-UNJUDGEABLE",
  // DR-184-A/DR-186: the node's own cross-house review is missing, but it
  // remains visible and numeric on the authority of its judged arguments.
  "DERIVED-STANDING-UNREVIEWED",
  // DR-176: authored material at or below the ruled deployment threshold.
  "HIDDEN-LOW-SCORE",
  // DR-176: authoring stopped before a node existed. Nothing is hidden or
  // revealable; this mark names the halted expansion without fabricating it.
  "UNAUTHORED-BRANCH-HALTED"
] as const;
export type ConditionMark = typeof CONDITION_MARKS[number];

export const RISK_TIERS = ["casual", "standard", "high-stakes"] as const;
export type RiskTier = typeof RISK_TIERS[number];

export const TIER_SOURCES = ["ASKER", "MACHINE_DEFAULT", "DEPLOYMENT_POLICY"] as const;
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

// DR-148(4): a second maker's review conclusion is data, never UI-parsed prose.
export const REVIEW_OUTCOMES = ["agree", "dispute", "cannot-assess"] as const;
export type ReviewOutcome = typeof REVIEW_OUTCOMES[number];

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

/**
 * T5 / S3-1 — the stamp names the role that actually measures. `REVIEWER`
 * replaces the retired `EVIDENCE_VERIFIER`, which named a role that never
 * took a measurement: every edge it stamped carried a NULL strength.
 * Migration 0052 renames the stamp on the stored rows and narrows the column
 * domain, so no read path can hand back a value this vocabulary refuses.
 */
export const STRENGTH_SOURCES = [
  "REVIEWER",
  "CLUSTER_COLLAPSE",
  "UNDERCUT_TRANSMISSION"
] as const;
export type StrengthSource = typeof STRENGTH_SOURCES[number];

export const SCORING_OPERATORS = ["accumulate"] as const;
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

/**
 * V-28 (DL4-F2) — THE RUN-LEVEL SPEND STOPS.
 *
 * Three refusals that are the RUN's business and never one step's: the run has
 * reached its money ceiling, the application has reached its day, or a hosted
 * vendor answered without the usage figures its cost can be read from. Each must
 * travel UNTOUCHED through every layer that would otherwise translate it — the
 * panel, which turns a failure into a member note and carries on to the next
 * member; the node-review catch, which turns one into NODE_REVIEW_UNAVAILABLE —
 * because every such translation costs another billed call and hides which
 * control spoke.
 *
 * It lives in the kernel because the code that RAISES these (`@debateai/budget`,
 * `@debateai/providers`) and the code that must not swallow them
 * (`@debateai/judgement`, the runner) have no other package in common, and a
 * second copy of the list is a list that drifts.
 *
 * `RUN_COST_ENVELOPE_EXHAUSTED`, the ATTEMPT ceiling, is deliberately NOT here:
 * it has always been treated as a member failure and V-28 does not change it.
 */
export const RUN_LEVEL_SPEND_STOP_CODES = Object.freeze([
  "RUN_COST_ENVELOPE_MONEY_REACHED",
  "DAILY_COST_ENVELOPE_REACHED",
  "PROVIDER_USAGE_UNREPORTED"
] as const);

export type RunLevelSpendStopCode = typeof RUN_LEVEL_SPEND_STOP_CODES[number];

export function isRunLevelSpendStop(error: unknown): boolean {
  const code = (error as Readonly<{ code?: unknown }>)?.code;
  return typeof code === "string"
    && (RUN_LEVEL_SPEND_STOP_CODES as readonly string[]).includes(code);
}

export class TypedDomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "TypedDomainError";
  }
}

const SUPPORT_SECRET_LIKE_PATTERN =
  /(?:\b(?:sk|key)-[A-Za-z0-9_-]+\b|\b(?:code|cod(?:ul)?)\s+\d{6}\b|\b\d{6}\b|\b[A-Za-z0-9_-]+[.][A-Za-z0-9_-]+[.][A-Za-z0-9_-]+\b|\b[A-Za-z0-9_-]{32,}\b)/giu;

/** Browser-safe and server-safe canonical support-message redaction. */
export function redactSupportText(text: string): Readonly<{ text: string;redacted: boolean }> {
  const redactedText = text.replace(SUPPORT_SECRET_LIKE_PATTERN,"[REDACTED_SECRET_LIKE]");
  return Object.freeze({ text: redactedText,redacted: redactedText !== text });
}
