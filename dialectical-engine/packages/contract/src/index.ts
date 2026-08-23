import { z } from "zod";
import { ABSTENTION_KINDS, CONDITION_MARKS, LEDGER_ACTION_KINDS, LEDGER_OUTCOMES, TIER_SOURCES } from "@debateai/kernel";

export const RiskTierSchema = z.enum(["casual", "standard", "high-stakes"]);
export const TierSourceSchema = z.enum(TIER_SOURCES);
export const AskTierSourceSchema = z.enum(["ASKER", "MACHINE_DEFAULT"]);
export const CompositionBudgetTierSchema = z.enum(["low", "medium", "high"]);
export const WayOfKnowingSchema = z.enum(["LOOKED_UP", "RAN", "REASONING"]);
export const CheckStatusSchema = z.enum(["PASS", "FAIL", "NOT_SAMPLED"]);
export const StalenessStateSchema = z.enum(["FRESH", "UNDER_REVIEW", "STALE", "ARCHIVED_REVIVED"]);
export const ConditionMarkSchema = z.enum(CONDITION_MARKS);
export const AbstentionKindSchema = z.enum(ABSTENTION_KINDS);
export type ConditionMark = z.infer<typeof ConditionMarkSchema>;
export type AbstentionKind = z.infer<typeof AbstentionKindSchema>;
export type StalenessState = z.infer<typeof StalenessStateSchema>;

export const EVENT_CONSUMERS = Object.freeze({
  "run.accepted": Object.freeze(["W6", "W16"]),
  "run.planning": Object.freeze(["W6"]),
  "run.running": Object.freeze(["W6"]),
  "run.terminal": Object.freeze(["W6", "W20"]),
  "node.spawned": Object.freeze(["W6", "W8", "W10"]),
  "node.generating": Object.freeze(["W6", "W8"]),
  "node.being_judged": Object.freeze(["W6", "W8"]),
  "node.scored": Object.freeze(["W6", "W8", "W10"]),
  "node.text_delta": Object.freeze(["W6", "W20"]),
  "node.complete": Object.freeze(["W6", "W8"]),
  "node.failed": Object.freeze(["W6", "W8"]),
  "node.retrying": Object.freeze(["W6", "W8"]),
  "graph.edge_added": Object.freeze(["W6", "W10"]),
  "graph.cycle_refused": Object.freeze(["W6", "W10"]),
  "serve.bundle_frozen": Object.freeze(["W6", "W20"]),
  "serve.composition_started": Object.freeze(["W6", "W20"]),
  "serve.composition_delta": Object.freeze(["W6", "W20"]),
  "serve.conformance_verdict": Object.freeze(["W6", "W20"]),
  "serve.recompose_or_defect": Object.freeze(["W6", "W20"]),
  "honesty.abstention_typed": Object.freeze(["W6", "W9"]),
  "honesty.budget_skip_marked": Object.freeze(["W6", "W12", "W21"]),
  "honesty.fallback_labeled": Object.freeze(["W6", "W12"]),
  "honesty.investigation_gap_opened": Object.freeze(["W6", "W14"]),
  "honesty.memory_link_decided": Object.freeze(["W6", "W15"]),
  "honesty.staleness_trigger_fired": Object.freeze(["W6", "W11"]),
  "honesty.under_explored_marked": Object.freeze(["W6", "W11"]),
  "ledger.attempt": Object.freeze(["W6", "W18"]),
  "ledger.failure": Object.freeze(["W6", "W18"]),
  "ledger.could_not_do": Object.freeze(["W6", "W18"])
} as const);
export const EVENT_TYPES = Object.freeze(Object.keys(EVENT_CONSUMERS) as Array<keyof typeof EVENT_CONSUMERS>);
export const EventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof EventTypeSchema>;

export const InvestigationGapSchema = z.object({
  gap_ref: z.string().trim().min(1),
  gap: z.string().trim().min(1),
  verdict: ConditionMarkSchema,
  why: z.string().trim().min(1),
  effort_grade: z.string().trim().min(1),
  constructed_prompt: z.string().trim().min(1),
  accepts_user_input: z.boolean(),
  model_authored: z.literal(true)
}).strict();
export type InvestigationGap = z.infer<typeof InvestigationGapSchema>;

export const InvestigationRequestSchema = z.object({
  user_input: z.string().min(1).nullable(),
  human_steer_input: z.literal(true)
}).strict();
export const InvestigationAcceptedSchema = z.object({
  request_ref: z.string().min(1),
  status: z.literal("RECORDED"),
  replay_handle: z.string().min(1)
}).strict();
export type InvestigationRequest = z.infer<typeof InvestigationRequestSchema>;
export type InvestigationAccepted = z.infer<typeof InvestigationAcceptedSchema>;

export const ExecutionLedgerDigestSchema = z.object({
  answer_id: z.string().min(1),
  run_ref: z.string().min(1),
  work_items: z.array(z.object({
    node_ref: z.string().min(1),
    status: z.enum(["READY", "PENDING", "ERROR"]),
    reason: z.string().nullable()
  }).strict()),
  entries: z.array(z.object({
    entry_ref: z.string().min(1),
    action_kind: z.enum(LEDGER_ACTION_KINDS),
    subject_ref: z.string().min(1),
    outcome: z.enum(LEDGER_OUTCOMES),
    actor_ref: z.string().min(1),
    started_at: z.iso.datetime(),
    finished_at: z.iso.datetime()
  }).strict())
}).strict();
export type ExecutionLedgerDigest = z.infer<typeof ExecutionLedgerDigestSchema>;

export const HONESTY_EVENT_CONSUMERS = Object.freeze({
  "honesty.staleness_trigger_fired": Object.freeze(["W6", "W11"])
} as const);

export const NODE_LIFECYCLE_EVENT_CONSUMERS = Object.freeze({
  "node.spawned": Object.freeze(["W6", "W8", "W10"]),
  "node.generating": Object.freeze(["W6", "W8"]),
  "node.being_judged": Object.freeze(["W6", "W8"]),
  "node.scored": Object.freeze(["W6", "W8", "W10"])
} as const);

export const AskRequestSchema = z.object({
  question_line: z.string().trim().min(1),
  risk_tier: RiskTierSchema,
  tier_source: AskTierSourceSchema,
  tier_provenance_ref: z.string().trim().min(1),
  composition_budget_tier: CompositionBudgetTierSchema,
  depth_params: z.record(z.string(), z.unknown()),
  decision_scope: z.string().trim().min(1),
  as_of: z.iso.datetime(),
  steering_presets: z.array(z.string().trim().min(1)),
  steering_annotations: z.array(z.string().min(1))
}).strict();
export type AskRequest = z.infer<typeof AskRequestSchema>;

export const AskAcceptedSchema = z.object({
  run_ref: z.string().min(1),
  status: z.literal("QUEUED")
}).strict();
export type AskAccepted = z.infer<typeof AskAcceptedSchema>;

export const RunProjectionSchema = z.object({
  run_ref: z.string().min(1),
  question_line: z.string().trim().min(1),
  state: z.enum(["QUEUED", "CLAIMED", "RUNNING", "HOLDING", "SETTLED", "FAILED"]),
  terminal_reason: z.string().trim().min(1).nullable(),
  hold_until: z.iso.datetime().nullable()
}).strict().superRefine((run, context) => {
  if ((run.state === "FAILED") !== (run.terminal_reason !== null)) {
    context.addIssue({
      code: "custom",
      message: "FAILED requires a terminal reason and non-failed runs forbid one"
    });
  }
  if ((run.state === "HOLDING") !== (run.hold_until !== null)) {
    context.addIssue({ code: "custom", message: "HOLDING requires hold_until and other states forbid it" });
  }
});
export type RunProjection = z.infer<typeof RunProjectionSchema>;

const LegacyDevelopmentSessionSchema = z.object({
  asker_id: z.string().min(1),
  session_id: z.string().min(1),
  caller_scope: z.enum(["ASKER", "OPERATOR"]),
  ownership_provenance: z.enum(["user_dev_token", "operator_dev_token"]),
  provisional_identity_model: z.literal(true)
}).strict();

const ServerSessionSchema = z.object({
  asker_id: z.string().regex(/^owner:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
  session_id: z.uuid(),
  caller_scope: z.literal("ASKER"),
  ownership_provenance: z.literal("server_session"),
  provisional_identity_model: z.literal(false)
}).strict();

export const SessionSchema = z.union([LegacyDevelopmentSessionSchema, ServerSessionSchema]);
export type Session = z.infer<typeof SessionSchema>;

export const SessionSummarySchema = z.object({
  session_id: z.uuid(),
  created_at: z.iso.datetime(),
  last_seen_at: z.iso.datetime(),
  idle_expires_at: z.iso.datetime(),
  absolute_expires_at: z.iso.datetime(),
  last_mfa_at: z.iso.datetime(),
  current: z.boolean()
}).strict();
export type SessionSummary = z.infer<typeof SessionSummarySchema>;

export const SessionListSchema = z.object({
  sessions: z.array(SessionSummarySchema)
}).strict();
export type SessionList = z.infer<typeof SessionListSchema>;

export const RevokeAllSessionsSchema = z.object({ revoked: z.number().int().nonnegative() }).strict();
export const StepUpResponseSchema = z.object({
  status: z.literal("step_up_complete"),
  csrf_token: z.string().regex(/^[A-Za-z0-9_-]{43}$/)
}).strict();

export const DeploymentSchema = z.object({
  register: z.object({
    register_version: z.number().int().positive(),
    rows: z.array(z.object({
      row_key: z.string().trim().min(1),
      value: z.unknown(),
      source_ref: z.string().trim().min(1)
    }).strict())
  }).strict(),
  scorecards: z.array(z.object({
    model_id: z.string().trim().min(1),
    model_version: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    task_class: z.string().trim().min(1),
    metric: z.string().trim().min(1),
    value: z.number().finite().nullable(),
    basis: z.enum(["MEASURED_OUTCOME", "MEASURED_PROCESS", "EXTERNAL_BENCHMARK", "NONE"]),
    derivation_hash: z.string().regex(/^[a-f0-9]{64}$/i),
    source_ref: z.string().trim().min(1),
    as_of: z.iso.datetime()
  }).strict()),
  model_ledger: z.array(z.object({
    task_class: z.string().trim().min(1),
    model_id: z.string().trim().min(1),
    model_version: z.string().trim().min(1),
    provider: z.string().trim().min(1),
    routing_decision_ref: z.string().trim().min(1)
  }).strict()),
  fleet: z.discriminatedUnion("state", [
    z.object({ state: z.literal("UNAVAILABLE"), reason: z.literal("NO_TYPED_FLEET_SOURCE") }).strict(),
    z.object({ state: z.literal("AVAILABLE"), workers: z.array(z.object({
      worker_ref: z.string().trim().min(1), status: z.enum(["ONLINE", "OFFLINE"]), source_ref: z.string().trim().min(1)
    }).strict()) }).strict()
  ])
}).strict();
export type Deployment = z.infer<typeof DeploymentSchema>;

export const LabeledNumberSchema = z.object({
  value: z.number().finite(),
  kind: z.string().min(1),
  source: z.string().min(1),
  producer: z.string().min(1),
  provenance_ref: z.string().min(1),
  replay_handle: z.string().min(1)
}).strict();

export const NumberSlotSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("PRESENT"), number: LabeledNumberSchema }).strict(),
  z.object({ status: z.literal("EVICTED"), mark: z.literal("MISSING-NUMBER") }).strict(),
  z.object({
    status: z.literal("WITHHELD"),
    reason: z.literal("STRICT_AND_CONJUNCT_UNJUDGED_OR_ABSTAINED"),
    components: z.array(LabeledNumberSchema)
  }).strict()
]);

export const ComposedSegmentSchema = z.object({
  segment_id: z.string().trim().min(1),
  text: z.string().trim().min(1),
  load_bearing: z.boolean(),
  served_number_refs: z.array(z.string().trim().min(1))
}).strict();

export const BandCeilingSchema = z.object({
  label: z.string().trim().min(1),
  basis: z.object({
    LOOKED_UP: z.number().int().nonnegative(),
    RAN: z.number().int().nonnegative(),
    REASONING: z.number().int().nonnegative()
  }).strict(),
  register_row_key: z.string().trim().min(1),
  register_version: z.number().int().positive(),
  source_ref: z.string().trim().min(1),
  lift_path: z.string().trim().min(1)
}).strict();

export const ShadowSuppressionSchema = z.object({
  gate: z.enum(["EVIDENCE_GATE", "VALUE_OVERLAY"]),
  subject_ref: z.string().trim().min(1),
  would_have_suppressed: z.unknown(),
  unlock_condition: z.string().trim().min(1)
}).strict();

export const ValueHingeProjectionSchema = z.object({
  value_hinge_ref: z.string().min(1),
  left_option_ref: z.string().min(1),
  right_option_ref: z.string().min(1),
  criterion_refs: z.array(z.string().min(1)),
  weight_source: z.enum(["owner_elicited", "org_policy", "none"]),
  weight_owner: z.string().nullable(),
  rejected_criteria: z.array(z.string().min(1))
}).strict();

export const AbstentionSchema = z.object({
  kind: AbstentionKindSchema,
  question_class: z.string().trim().min(1),
  risk_tier: RiskTierSchema,
  price: z.number().finite().gt(0).lt(1),
  register_row_key: z.string().trim().min(1),
  register_version: z.number().int().positive(),
  register_source_ref: z.string().trim().min(1),
  unlock_condition: z.string().trim().min(1),
  ledger_unknown_ref: z.string().trim().min(1)
}).strict();

export const AnswerSummarySchema = z.object({
  answer_id: z.string().min(1),
  run_ref: z.string().min(1),
  answer_version: z.number().int().positive(),
  question_line: z.string().min(1),
  verdict_state: z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).nullable(),
  abstention: AbstentionSchema.nullable(),
  serve_state: z.enum(["COMPOSED", "RECOMPOSED_ONCE", "COMPONENTS_ONLY"]),
  staleness_state: StalenessStateSchema,
  builds_on_previous: z.boolean(),
  created_at_sequence: z.number().int().positive()
}).strict();
export const OpenRunSummarySchema = z.object({
  run_ref: z.string().min(1),
  question_line: z.string().trim().min(1),
  state: z.enum(["QUEUED", "CLAIMED", "RUNNING", "HOLDING", "SETTLED", "FAILED"]),
  terminal_reason: z.string().trim().min(1).nullable(),
  created_at_sequence: z.number().int().positive()
}).strict().superRefine((run, context) => {
  if ((run.state === "FAILED") !== (run.terminal_reason !== null)) {
    context.addIssue({
      code: "custom",
      message: "FAILED requires a terminal reason and non-failed runs forbid one"
    });
  }
});
export const AnswerIndexSchema = z.object({
  items: z.array(AnswerSummarySchema),
  open_runs: z.array(OpenRunSummarySchema),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  total: z.number().int().nonnegative()
}).strict();
export type AnswerIndex = z.infer<typeof AnswerIndexSchema>;

export const MakerLineageSchema = z.object({
  maker: z.string().min(1),
  model_id: z.string().min(1),
  transport: z.string().min(1),
  provider_ref: z.string().min(1)
}).strict();
export type MakerLineage = z.infer<typeof MakerLineageSchema>;

export const NodeReviewSchema = z.object({
  outcome: z.enum(["agree", "dispute", "cannot-assess"]),
  reasons: z.array(z.string().trim().min(1)).min(1),
  provenance_ref: z.string().min(1),
  reviewer_lineage: MakerLineageSchema
}).strict();
export type NodeReview = z.infer<typeof NodeReviewSchema>;

export const NodeSchema = z.object({
  node_id: z.string().min(1),
  claim: z.string().min(1),
  way_of_knowing: WayOfKnowingSchema,
  base_score: LabeledNumberSchema,
  final_strength: LabeledNumberSchema.nullable(),
  provenance_ref: z.string().min(1),
  maker_lineage: MakerLineageSchema.nullable(),
  review: NodeReviewSchema.nullable(),
  locator: z.string().nullable(),
  stranger_restatement: z.object({ check_status: CheckStatusSchema }).passthrough(),
  defeater_refs: z.array(z.string().min(1)),
  defeater_exhaustion_marked: z.boolean(),
  disagreement: z.record(z.string(), z.unknown()).nullable(),
  condition_marks: z.array(ConditionMarkSchema),
  abstention: AbstentionSchema.nullable(),
  staleness_state: StalenessStateSchema,
  relevant_as_of: z.iso.datetime()
}).strict();
export type Node = z.infer<typeof NodeSchema>;

export const EdgeSchema = z.object({
  edge_id: z.string().min(1),
  from_node_ref: z.string().min(1),
  target_kind: z.enum(["NODE", "EDGE"]),
  target_ref: z.string().min(1),
  relation: z.enum(["support", "attack", "defeat", "shared-crux"]),
  strength: z.discriminatedUnion("status", [
    z.object({ status: z.literal("PRESENT"), number: LabeledNumberSchema }).strict(),
    z.object({ status: z.literal("UNKNOWN"), reason: z.literal("NO_JUDGEMENT_OR_MAGNITUDE") }).strict()
  ]),
  provenance_ref: z.string().min(1),
  placeholder: z.boolean()
}).strict();
export type Edge = z.infer<typeof EdgeSchema>;

export const AnswerSchema = z.object({
  answer_id: z.string().min(1),
  answer_version: z.number().int().positive(),
  run_ref: z.string().min(1),
  question_line: z.string().min(1),
  terminal: z.enum(["SERVED", "DOWNGRADED", "BLOCKED", "COMPONENTS_ONLY"]),
  verdict_state: z.enum(["SUPPORTED", "CONTESTED", "UNSUPPORTED"]).nullable(),
  verdict_unavailable: z.object({ reason_ref: z.string().trim().min(1) }).strict().nullable(),
  confidence_band: z.string().min(1).nullable(),
  band_ceiling: BandCeilingSchema.nullable(),
  answer_form: z.unknown().nullable(),
  serve_state: z.enum(["COMPOSED", "RECOMPOSED_ONCE", "COMPONENTS_ONLY"]),
  composed_text: z.array(ComposedSegmentSchema),
  number_slots: z.array(NumberSlotSchema),
  abstention: AbstentionSchema.nullable(),
  shadow_suppressions: z.array(ShadowSuppressionSchema),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  badges: z.array(z.string()),
  residual_objections: z.array(z.string()),
  value_hinges: z.array(ValueHingeProjectionSchema),
  condition_marks: z.array(ConditionMarkSchema),
  // DR-139(4): typed loud condition-mark records on the served answer —
  // each names its subject (an OWED-CHECK-UNEXECUTED record names the battery
  // row whose owed check has no recorded execution at terminal).
  condition_mark_records: z.array(z.object({
    mark: ConditionMarkSchema,
    scope: z.enum(["answer", "node"]),
    subject_ref: z.string().min(1),
    reason: z.string().min(1),
    lift_path: z.string().nullable(),
    served_root_rule: z.literal("first-configured-provider").nullable(),
    call_site_key: z.string().min(1).nullable().default(null),
    planned_leg_count: z.number().int().nonnegative().nullable().default(null),
    terminal_transport_outcome: z.enum(["TIMED_OUT", "FAILED"]).nullable().default(null),
    hidden_strength: z.number().min(0).max(1).nullable().default(null),
    hidden_score_threshold: z.number().min(0).max(1).nullable().default(null),
    hidden_score_threshold_source_ref: z.string().min(1).nullable().default(null),
    excluded_from_served_number: z.boolean().nullable().default(null),
    judged_basis_count: z.number().int().positive().nullable().default(null),
    affected_node_ids: z.array(z.string().min(1)).default([])
  }).strict().superRefine((record, context) => {
    if (record.mark === "HIDDEN-UNJUDGEABLE" && (
      record.call_site_key === null || record.terminal_transport_outcome === null
      || record.excluded_from_served_number !== true || record.affected_node_ids.length === 0
    )) context.addIssue({ code: "custom", message: "Class H requires transport provenance and affected hidden nodes" });
    if (record.mark === "HIDDEN-LOW-SCORE" && (
      record.hidden_strength === null || record.hidden_score_threshold === null
      || record.hidden_score_threshold_source_ref === null
      || record.excluded_from_served_number !== false || record.affected_node_ids.length === 0
    )) context.addIssue({ code: "custom", message: "Class L requires threshold provenance, presentation-only status, and affected hidden nodes" });
    if (record.mark === "DERIVED-STANDING-UNREVIEWED" && (
      record.call_site_key === null || record.terminal_transport_outcome === null
      || record.excluded_from_served_number !== false
      || record.judged_basis_count === null || record.affected_node_ids.length === 0
    )) context.addIssue({ code: "custom", message: "Class D requires failed-review provenance and a positive judged basis" });
    if (record.mark === "UNAUTHORED-BRANCH-HALTED" && (
      record.call_site_key === null || record.planned_leg_count === null
      || record.terminal_transport_outcome === null || record.affected_node_ids.length === 0
    )) context.addIssue({ code: "custom", message: "Class N requires halted-call provenance and a surviving parent" });
  })),
  reversal_point: z.string().min(1),
  builds_on_previous: z.object({
    value: z.boolean(),
    answer_ref: z.string().min(1).nullable()
  }).strict(),
  memory_disclosure: z.object({
    matched: z.boolean(),
    memory_link_id: z.string().nullable(),
    tier: z.enum(["EXACT_QUESTION", "SAME_BINDING", "PARTIAL_BINDING", "TERM_OVERLAP"]).nullable(),
    relation: z.enum(["REPEATS", "REFINES", "CONTRADICTS_PRIOR", "RELATED_ONLY"]).nullable(),
    decided_by: z.string().nullable(),
    prior: z.object({
      run_id: z.string(), answer_id: z.string(), answer_version: z.number().int().positive(),
      question_line: z.string(), answered_at: z.iso.datetime(), verdict: z.string().nullable(),
      confidence_band: z.string().nullable(), staleness_state: z.string()
    }).strict().nullable(),
    agreed_fields: z.array(z.string()),
    disagreed_fields: z.array(z.string()),
    not_compared_fields: z.array(z.string()),
    pulls: z.array(z.object({
      artifactId: z.string(), version: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/i),
      asOf: z.iso.datetime(), stalenessStateAtPull: z.string(), askerScope: z.string(), registerRowKey: z.string(),
      registerVersion: z.number().int().positive(), registerSourceRef: z.string()
    }).strict()),
    candidates_not_linked: z.array(z.object({
      prior_run_id: z.string(), tier: z.enum(["EXACT_QUESTION", "SAME_BINDING", "PARTIAL_BINDING", "TERM_OVERLAP"])
    }).strict()),
    unlink: z.object({ available: z.boolean(), memory_link_id: z.string().nullable() }).strict()
  }).strict().nullable(),
  risk_tier: RiskTierSchema,
  tier_source: TierSourceSchema,
  tier_provenance_ref: z.string().trim().min(1),
  cost_envelope: z.object({
    basis: z.record(z.string(), z.unknown()),
    state: z.enum(["WITHIN", "ENRICHMENT_SKIPPED", "EXHAUSTED"]),
    consumed_model_attempts: z.number().int().nonnegative(),
    protected_core: z.literal("NEVER_SKIPPABLE")
  }).strict(),
  composition_budget_tier: CompositionBudgetTierSchema,
  conformance_outcome: z.string().min(1),
  ledger_digest_handle: z.string().min(1),
  inspection_handle: z.string().min(1),
  as_of: z.iso.datetime(),
  staleness_state: StalenessStateSchema,
  relevant_as_of: z.iso.datetime()
}).strict().superRefine((answer, context) => {
  if ((answer.confidence_band === null) !== (answer.band_ceiling === null)) {
    context.addIssue({ code: "custom", message: "confidence_band and band_ceiling must be present together" });
  }
  if ((answer.verdict_state === null) === (answer.verdict_unavailable === null)) {
    context.addIssue({ code: "custom", message: "exactly one verdict projection must be present" });
  }
  if (answer.verdict_unavailable !== null && answer.confidence_band !== null) {
    context.addIssue({ code: "custom", message: "an unavailable verdict cannot carry a confidence band" });
  }
});
export type Answer = z.infer<typeof AnswerSchema>;

export const InspectionSchema = z.object({
  answer_id: z.string().min(1),
  answer_version: z.number().int().positive(),
  conformance: z.object({
    outcome: z.enum(["PASS", "FAIL", "NOT_RUN"]),
    coverage_mode: z.enum(["EXHAUSTIVE", "SAMPLED", "NOT_RUN"]),
    segment_results: z.array(z.object({
      segment_id: z.string().min(1),
      state: z.enum(["JUDGED", "SAMPLED_PASSED", "NOT_SAMPLED"]),
      conforms: z.boolean()
    }).strict())
  }).strict(),
  segment_suppressions: z.array(z.object({
    segment_id: z.string().min(1),
    evicted_number_ref: z.string().min(1)
  }).strict()),
  shadow_suppressions: z.array(ShadowSuppressionSchema)
}).strict();
export type Inspection = z.infer<typeof InspectionSchema>;

export const RunEventSchema = z.object({
  event_id: z.string().min(1),
  event_type: EventTypeSchema,
  run_ref: z.string().min(1),
  subject_ref: z.string().min(1).nullable().optional(),
  at_sequence: z.number().int().positive(),
  payload: z.record(z.string(), z.unknown())
}).strict().superRefine((event, context) => {
  if (event.event_type === "honesty.investigation_gap_opened") {
    const parsed = InvestigationGapSchema.safeParse(event.payload);
    if (!parsed.success) context.addIssue({ code: "custom", message: "Investigation gap payload violates its closed projection" });
  }
});
export type RunEvent = z.infer<typeof RunEventSchema>;

export const contractInventory = Object.freeze({
  routes: Object.freeze([
    "POST /v1/auth/register",
    "POST /v1/auth/verify-email",
    "POST /v1/auth/resend-verification",
    "POST /v1/auth/mfa/totp/begin",
    "POST /v1/auth/mfa/totp/verify",
    "POST /v1/auth/mfa/recovery-codes/generate",
    "POST /v1/auth/mfa/recovery-codes/confirm",
    "POST /v1/auth/login",
    "POST /v1/auth/logout",
    "GET /v1/auth/sessions",
    "DELETE /v1/auth/sessions/{id}",
    "DELETE /v1/auth/sessions",
    "POST /v1/auth/step-up",
    "POST /v1/asks",
    "GET /v1/session",
    "GET /v1/deployment",
    "GET /v1/dev/evaluator",
    "POST /v1/dev/evaluator/consumer-selection",
    "GET /v1/answers",
    "GET /v1/answers/{id}",
    "GET /v1/answers/{id}/inspection",
    "GET /v1/answers/{id}/nodes/{nodeId}",
    "GET /v1/answers/{id}/ledger-digest",
    "POST /v1/answers/{id}/investigations/{gapRef}",
    "POST /v1/answers/{id}/memory-link/unlink",
    "GET /v1/runs/{id}",
    "GET /v1/runs/{id}/events",
    "GET /v1/runs/{id}/answer"
  ]),
  resources: Object.freeze({
    AskRequestSchema, AskAcceptedSchema, RunProjectionSchema, SessionSchema, SessionSummarySchema,
    SessionListSchema, RevokeAllSessionsSchema, StepUpResponseSchema,
    DeploymentSchema, AnswerSummarySchema, OpenRunSummarySchema, AnswerIndexSchema,
    AnswerSchema, InspectionSchema, NodeSchema,
    RunEventSchema, ComposedSegmentSchema, NumberSlotSchema, BandCeilingSchema, StalenessStateSchema,
    ShadowSuppressionSchema, AbstentionSchema, InvestigationGapSchema, InvestigationRequestSchema,
    InvestigationAcceptedSchema, ExecutionLedgerDigestSchema, ValueHingeProjectionSchema, ConditionMarkSchema, EdgeSchema
  })
});
