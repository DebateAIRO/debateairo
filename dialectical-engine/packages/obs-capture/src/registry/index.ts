import {
  CONDITION_MARKS,
  exhaustive,
  type ConditionMark,
} from "@debateai/kernel";

declare const REGISTRY_CODE_BRAND: unique symbol;
export type RegistryCode = string & {
  readonly [REGISTRY_CODE_BRAND]: "RegistryCode";
};

const DERIVED_CODE_PAYLOAD = `ABSENT_SIGNAL_HAS_FRESHNESS
AMENDED_QUERY_REQUIRED
AMENDMENT_REASON_REQUIRED
ANSWER_INDEX_PAGE_INVALID
ARROW_ENDPOINT_ABSENT
ASK_AS_OF_INVALID
ASK_RISK_TIER_DEFAULT_UNAVAILABLE
ATTEMPT_ACCESS_DEPTH_MISSING
AUTH_POLICY_INVALID
AUTH_POLICY_UNRESOLVED
BAND_CEILING_BAND_UNKNOWN
BAND_CEILING_BASIS_EMPTY
BAND_CEILING_BASIS_INVALID
BAND_CEILING_BASIS_MISMATCH
BAND_CEILING_CUT_EMPTY
BAND_CEILING_CUT_INVALID
BAND_CEILING_DECISION_INVALID
BAND_CEILING_LABELS_INVALID
BAND_CEILING_LABEL_INVALID
BAND_CEILING_LABEL_UNKNOWN
BAND_CEILING_LIFT_PATH_INVALID
BAND_CEILING_ROW_INVALID
BAND_CEILING_SOURCE_INVALID
BAND_CEILING_VERSION_INVALID
BAND_LABEL_INVALID
BAND_LABEL_UNKNOWN
BAND_ORDER_INVALID
BLANK_QUERY_REFUSED
BLOCKED_TERMINAL_RETIRED
BUDGET_SKIP_AFFECTED_NODES_REQUIRED
CALIBRATION_STRATEGY_INVALID
CALL_BUDGET_EXHAUSTED
CATCH_UP_ANSWER_NOT_FOUND
CATCH_UP_DISCLOSURE_MISMATCH
CATCH_UP_SOURCE_VERSION_CHANGED
CATEGORICAL_SPAWN_CHILD_MISSING
CENSUS_PARTITION_INVALID
CLAIM_TYPE_COMPOSITION_MAP_INVALID
CLAIM_TYPE_COMPOSITION_MAP_PROVENANCE_MISSING
CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED
COMPLETENESS_GATE_FAILED
COMPOSITION_BUDGET_UNRESOLVED
COMPOSITION_CONTRACT_ERROR
COMPOSITION_MEASUREMENT_INVALID
COMPOSITION_UNRESOLVED
CONDITION_MARK_AFFECTED_NODES_REQUIRED
CONDITION_MARK_RECORD_REQUIRED
CONDITION_MARK_RECORD_WITHOUT_MARK
CONFIGURED_PROVIDER_SET_INVALID
CONFIGURED_PROVIDER_SET_UNRESOLVED
CONFORMANCE_CONTRACT_ERROR
CONSUMER_AUTHORIZATION_FAILED
CONSUMER_CONTENT_REFUSED
CONVERGENCE_CONTROLS_INVALID
CONVERGENCE_CONTROLS_PROVENANCE_MISSING
CONVERGENCE_CONTROLS_UNRESOLVED
CRITERION_ID_DUPLICATE
CRITERION_ID_INVALID
CRITERION_LABEL_INVALID
CRITIC_UNAVAILABLE_BAND_CAP_UNRESOLVED
CRITIQUE_CONTEXT_NOT_ISOLATED
DATABASE_POOL_FAILED
DEBATE_EXPANSION_PARENT_MISSING
DEBATE_MAKER_UNRESOLVED
DEBATE_ROOT_MISSING
DECISION_IDEMPOTENCY_CONFLICT
DECISION_IDENTITY_UNSERIALIZABLE
DECISION_SPAWN_COUNT_INVALID
DEEPENING_IDENTITY_MISSING
DEEPENING_ROUND_INVALID
DEPLOYMENT_REGISTER_UNAVAILABLE
DERIVED_STANDING_RECORD_INVALID
DIFFERENT_MAKER_REVIEWER_UNAVAILABLE
DISPUTED_RESOLUTION_REQUIRES_HUMAN
DISTINCT_CERTIFICATION_CAPTURES_REQUIRED
DUPLICATE_SNAPSHOT_NODE
EDGE_IDENTITY_CONFLICT
EDGE_INTEGRITY_ERROR
EDGE_MEASURED_MAGNITUDE_MISSING
EDGE_TARGET_MISSING
EMPIRICAL_FINDINGS_MISSING
EMPIRICAL_SETTLEMENT_MISSING
EMPTY_DECISION_REASON
EMPTY_EVENT_STREAM
EMPTY_OVERLAY_OWNER
EMPTY_PROPAGATION
ENVELOPE_EXHAUSTED_WITHOUT_VERIFIED_COMPONENTS
ENVELOPE_VERIFIED_NODE_SET_EMPTY
EVALUATOR_ADDON_OUTPUT_INVALID
EVALUATOR_ADDON_POLICY_INVALID
EVALUATOR_ADDON_RUN_ID_INVALID
EVALUATOR_CATALOG_UNAVAILABLE
EVALUATOR_CONSUMER_MODEL_NOT_ENUMERATED
EVALUATOR_DOMAIN_ASSIGNMENT_ADMISSION_MISMATCH
EVALUATOR_DOMAIN_ID_INVALID
EVALUATOR_DOMAIN_PROPOSAL_ARTIFACT_MISMATCH
EVALUATOR_DOMAIN_REFUSAL_REASON_INVALID
EVALUATOR_GROWN_DOMAIN_PROVENANCE_REQUIRED
EVALUATOR_HARVEST_RUN_ID_INVALID
EVALUATOR_MAKER_PANEL_COLLISION
EVALUATOR_PROFILE_DERIVATION_CONFLICT
EVALUATOR_PROFILE_STRATEGY_ROW_KEY_INVALID
EVALUATOR_PROFILE_STRATEGY_SOURCE_REF_INVALID
EVALUATOR_PROVIDER_ENDPOINT_FORBIDDEN
EVALUATOR_PROVIDER_FAMILY_INVALID
EVALUATOR_PROVIDER_FAMILY_UNRESOLVED
EVALUATOR_PROVIDER_PANEL_COLLISION
EVALUATOR_RANK_DERIVATION_CONFLICT
EVALUATOR_TAGGER_ARTIFACT_REQUIRED
EVALUATOR_TAGGER_MAKER_MISMATCH
EVALUATOR_TAGGER_OUTPUT_INVALID
EVALUATOR_TAG_EVENT_REASON_INVALID
EVALUATOR_TAG_INPUT_HASH_INVALID
EVALUATOR_TAG_PROVENANCE_INVALID
EVALUATOR_TAG_QUESTION_INVALID
EVALUATOR_TAG_RUN_ID_INVALID
EVIDENCE_ITEM_REF_REQUIRED
EVIDENCE_REPLAY_HANDLE_REQUIRED
EXPLORATION_FLOOR_INVALID
EXTERNAL_RESOLVER_REQUIRED
FINAL_STRENGTH_WITHHELD
FIXED_SINGLE_ROOT_SERVE_VIOLATED
FRESHNESS_BOUND_INVALID
FRESHNESS_REGISTER_ROW_REQUIRED
FRESHNESS_SOURCE_MISSING
GRAPH_CHILD_STRUCTURE_INVALID
GRAPH_CYCLE_DETECTED
GRAPH_CYCLE_WRITE_REJECTED
GRAPH_PARENT_NOT_FOUND
GRAPH_ROOT_STRUCTURE_INVALID
GRAPH_RUN_MISMATCH
HIDDEN_CONDITION_MARK_RECORD_INVALID
HIDDEN_NODE_SCORE_THRESHOLD_UNRESOLVED
HONESTY_FIELD_MISSING
INCONSISTENT_PRE_COMPOSITION_EVIDENCE
INDEPENDENT_BUDGET_MARKS_CONFLATED
INSTRUMENT_REF_REQUIRED
INVALID_COMPOSITION_ATTEMPT
JUDGEMENT_POLICY_UNRESOLVED
JUDGE_PARSE_FAILURE
JUDGE_SCHEMA_FAILURE
LEVERAGE_ROUND_INCOMPLETE
LIFT_TARGET_ABSENT
LIVENESS_AFFECTED_EMPTY
LIVENESS_NODE_NOT_FOUND
LIVENESS_PARENT_CYCLE
LIVENESS_POLICY_INVALID
LIVENESS_POLICY_PROVENANCE_MISSING
LIVENESS_POLICY_UNRESOLVED
LIVENESS_QUERY_INVALID
LIVENESS_THRESHOLD_INVALID
LIVENESS_TIME_INVALID
MAKER_INVENTORY_UNSATISFIED
MAKER_POLICY_INVALID
MAKER_POSITION_UNAVAILABLE
MALFORMED_ARROW_ORDER
MAX_RECOMPOSE_INVALID
MEMORY_DIFFERENCE_REQUIRED
MEMORY_DISCLOSURE_GATE_FAILED
MEMORY_LINK_NOT_FOUND
MEMORY_MATCH_FACT_REQUIRED
MEMORY_MATCH_PREDICATE_DRIFT
MEMORY_PRIOR_ANSWER_MISSING
MEMORY_PULL_CAP_EXCEEDED
MEMORY_PULL_POLICY_INVALID
MEMORY_PULL_UNPINNED
MEMORY_QUESTION_EMPTY
MEMORY_QUESTION_NOT_CANONICAL
MISSING_COMPOSITION_ARTIFACT
MODEL_ASSERTED_EVIDENCE_SCORE_REFUSED
MODEL_FAMILY_REQUIRED
MULTI_MAKER_PLAN_REQUIRES_MULTIPLE_MAKERS
NEGATIVE_CAPTURE_REQUIRED
NODE_ID_REQUIRED
NODE_REVIEW_PARSE_FAILURE
NODE_REVIEW_SCHEMA_FAILURE
NODE_REVIEW_UNAVAILABLE
NONSPAWNING_DECISION_HAS_CHILD
NO_ELIGIBLE_MODEL
NO_SERVABLE_MAKER_POSITION_AFTER_REVIEW
NO_USABLE_JUDGEMENTS
OFF_PLAN_QUERY_REFUSED
OFF_SUBJECT_SHARE_REQUIRED
OPERATOR_RESOLUTION_MISSING
OPPOSITION_QUERY_REQUIRED
OPTION_CRITERION_UNRESOLVED
OPTION_ID_DUPLICATE
OPTION_ID_INVALID
OPTION_LABEL_INVALID
ORG_POLICY_PROFILE_INVALID
OVERLAY_DETACHMENT_VIOLATION
OVERLAY_RUN_MISMATCH
PANEL_DISCOVERY_POLICY_UNRESOLVED
PARTIAL_SCORE_RUN_IDENTITY
POSITIVE_CAPTURE_REQUIRED
POST_COMPOSE_R9_CONTRACT_ERROR
PRESENT_SIGNAL_FRESHNESS_UNKNOWN
PRODUCER_GRADING_FORBIDDEN
PRODUCING_RUN_REQUIRED
PROPAGATION_MAGNITUDE_INVALID
PROPAGATION_RECEIPT_INVALID
PROPAGATION_RECEIPT_MISSING
PROPAGATION_STRENGTH_INVALID
PROPER_SCORE_INVALID
PROTECTED_CITATION_COMPARE_SKIPPED
PROTECTED_CORE_NOT_VERIFIED
PROVIDER_CALL_INSIDE_TRANSACTION
QUERY_SET_REF_REQUIRED
RECONSTRUCTION_INPUT_MISSING
REGENERATION_POLICY_MISMATCH
REGENERATION_POLICY_UNRECORDED
REGENERATION_REJECTION_EVIDENCE_MISSING
REVISION_TRIGGER_NOT_FOUND
RISK_TIER_POLICY_INVALID
RISK_TIER_POLICY_PROVENANCE_MISSING
RISK_TIER_POLICY_UNRESOLVED
RIVAL_CARVER_UNAVAILABLE
RUNNER_FAILURE_STATE_NOT_RECORDED
RUN_COST_ENVELOPE_EXHAUSTED
RUN_COST_ENVELOPE_UNRESOLVED
RUN_DEPTH_PARAMS_INVALID
RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM
RUN_HOLD_RECORDER_UNRESOLVED
RUN_MAKER_COUNT_INVALID
RUN_NOT_FOUND
SCALAR_DECISION_CANNOT_SPAWN
SCORECARD_INTERVAL_INVALID
SCORECARD_TASK_CLASS_MAP_INVALID
SCORED_REJECTED_EVIDENCE_REFUSED
SCORING_OPERATOR_UNRESOLVED
SELF_ROUTING_FORBIDDEN
SENSITIVITY_FEEDBACK_ORDER_INVALID
SEQUENCE_ALLOCATION_FAILED
SERVED_NUMBER_NOT_FOUND
SERVED_ROOT_UNRESOLVED
SERVE_ITEMS_NOT_A_LIST
SERVE_ITEM_INVALID
SERVE_ITEM_OUT_OF_NODE_SET
SERVE_NODE_SET_EMPTY
SERVE_OUTPUT_NOT_FROM_LEDGER
SERVE_POLICY_UNRESOLVED
SERVE_STATUS_UNKNOWN
SETTLEMENT_FIELD_REQUIRED
SETTLEMENT_IDENTITY_INVALID
SETTLEMENT_NUMBER_INVALID
SETTLEMENT_PROVENANCE_INVALID
SETTLEMENT_RACE_WITHOUT_WINNER
SETTLEMENT_READ_BACK_FAILED
SHADOW_SUBJECT_REQUIRED
SHADOW_UNLOCK_REQUIRED
SOURCE_REF_REQUIRED
SPAWN_SLOT_IDENTITY_CONFLICT
STORED_RESULT_MISSING
STRENGTH_LINEAGE_UNRESOLVED
STRUCTURAL_CEILING_INPUTS_UNRESOLVED
SUPERSEDED_ANSWER_IDENTITY_MISMATCH
SUPERSEDED_ANSWER_NOT_FOUND
TERMINAL_ACTIVATION_EVALUATOR_UNRESOLVED
TERMINAL_ACTIVATION_UNRESOLVED
TERMINAL_FACT_READ_FAILED
TERMINAL_ROW_NOT_EVALUATABLE
TIER_PROVENANCE_MISSING
UNDERCUT_TARGET_INVALID
UNSERVED_MAKER_POSITION_UNRESOLVED
UNSUPPRESSED_BAND_REQUIRED
VALUE_CRITERIA_EMPTY
VALUE_OPTIONS_INSUFFICIENT
VALUE_PHASE_NOT_READY
WAIT_RESOLUTION_INCOMPLETE
WAIT_RESOLUTION_NOT_CURRENT
WEIGHT_CRITERION_INVALID
WEIGHT_VALUE_INVALID
WEIGHT_VECTOR_CRITERIA_MISMATCH
WEIGHT_VECTOR_EMPTY
WEIGHT_VECTOR_ZERO
WORK_ITEM_WITHOUT_RUN`;

function asRegistryCode(value: string): RegistryCode {
  return value as RegistryCode;
}

function frozenLines(payload: string): readonly RegistryCode[] {
  return Object.freeze(payload.split("\n").map(asRegistryCode));
}

function frozenCodes(values: readonly string[]): readonly RegistryCode[] {
  return Object.freeze(values.map(asRegistryCode));
}

export const DERIVED_CODES = frozenLines(DERIVED_CODE_PAYLOAD);

export const DECLARED_GAP_CODES = frozenCodes([
  "EVALUATOR_DOMAIN_MODEL_ID_INVALID",
  "EVALUATOR_DOMAIN_MODEL_VERSION_INVALID",
  "EVALUATOR_DOMAIN_PROVENANCE_INVALID",
  "EVALUATOR_DOMAIN_PROVIDER_INVALID",
  "EVALUATOR_DOMAIN_RUN_ID_INVALID",
  "SCORECARD_TASK_CLASS_AMBIGUOUS",
  "SCORECARD_TASK_CLASS_UNRESOLVED",
]);

export interface IndirectOrigin {
  readonly path: string;
  readonly function_name: string;
  readonly parameter: string;
  readonly argument_index: number;
}

export const INDIRECT_ORIGINS = Object.freeze([
  {
    path: "dialectical-engine/apps/runner/src/index.ts",
    function_name: "callWithContentContract",
    parameter: "organFailureCode",
    argument_index: 2,
  },
  {
    path: "dialectical-engine/apps/runner/src/index.ts",
    function_name: "parseContent",
    parameter: "code",
    argument_index: 2,
  },
  {
    path: "dialectical-engine/packages/evaluator/src/index.ts",
    function_name: "requireNonblank",
    parameter: "code",
    argument_index: 1,
  },
  {
    path: "dialectical-engine/packages/evidence/src/index.ts",
    function_name: "nonBlank",
    parameter: "code",
    argument_index: 1,
  },
  {
    path: "dialectical-engine/packages/serve/src/index.ts",
    function_name: "requiredText",
    parameter: "code",
    argument_index: 1,
  },
  {
    path: "dialectical-engine/packages/settlement/src/index.ts",
    function_name: "?",
    parameter: "code",
    argument_index: -1,
  },
  {
    path: "dialectical-engine/packages/valuation/src/index.ts",
    function_name: "requireNonBlank",
    parameter: "code",
    argument_index: 1,
  },
] as const satisfies readonly IndirectOrigin[]);

export const AUTHORED_CODES = frozenCodes([
  "OBS_CAPTURE_SELF",
  "OBS_COMPONENT_HEALTH",
]);

export interface RegistryCodePartitions {
  readonly derived: readonly RegistryCode[];
  readonly declared_gap: readonly RegistryCode[];
  readonly authored: readonly RegistryCode[];
}

const AUTHORED_CODE_PATTERN = /^OBS_[A-Z0-9_]+$/u;

export function assertRegistryCodePartitions(
  partitions: RegistryCodePartitions,
): void {
  const ownerByCode = new Map<string, keyof RegistryCodePartitions>();

  for (const [partition, codes] of Object.entries(partitions) as [
    keyof RegistryCodePartitions,
    readonly RegistryCode[],
  ][]) {
    for (const code of codes) {
      const authored = partition === "authored";
      if (authored !== AUTHORED_CODE_PATTERN.test(code)) {
        throw new Error(`Registry namespace fence violation in ${partition}: ${code}`);
      }
      const existingOwner = ownerByCode.get(code);
      if (existingOwner !== undefined) {
        throw new Error(
          `Registry code collision between ${existingOwner} and ${partition}: ${code}`,
        );
      }
      ownerByCode.set(code, partition);
    }
  }
}

assertRegistryCodePartitions({
  derived: DERIVED_CODES,
  declared_gap: DECLARED_GAP_CODES,
  authored: AUTHORED_CODES,
});

export const REGISTRY = Object.freeze({
  derived: DERIVED_CODES,
  declared_gap: DECLARED_GAP_CODES,
  indirect_origins: INDIRECT_ORIGINS,
  authored: AUTHORED_CODES,
});

const ALL_REGISTRY_CODES = Object.freeze([
  ...DERIVED_CODES,
  ...DECLARED_GAP_CODES,
  ...AUTHORED_CODES,
]);
const REGISTRY_CODE_SET: ReadonlySet<string> = new Set(ALL_REGISTRY_CODES);

export const TEMPLATE_PARAMETER_TYPES = Object.freeze([
  "id",
  "registry_code",
  "closed_enum",
  "bounded_int",
] as const);
export type TemplateParameterType =
  (typeof TEMPLATE_PARAMETER_TYPES)[number];

/**
 * G0 parameter-safety guarantee:
 * - registry_code, closed_enum and bounded_int are membership/range closed;
 * - id admits exact registry codes, bare RFC-4122 UUIDs, and `run_` followed by
 *   an RFC-4122 UUID; shape cannot distinguish a lawful run/node UUID from an
 *   unlawful session/asker UUID;
 * - the operative OBS-R048/R103 protection at G0 is every seed template
 *   declaring zero parameters plus the fail-shut first-id security gate, not a
 *   claim that the id validator establishes identifier provenance.
 */

interface TemplateParameterBase {
  readonly name: string;
}

export type TemplateParameterDeclaration =
  | (TemplateParameterBase & { readonly type: "id" })
  | (TemplateParameterBase & { readonly type: "registry_code" })
  | (TemplateParameterBase & {
      readonly type: "closed_enum";
      readonly members: readonly string[];
    })
  | (TemplateParameterBase & {
      readonly type: "bounded_int";
      readonly minimum: number;
      readonly maximum: number;
    });

export type SafeTemplateId = `tpl.${RegistryCode}`;

export interface SafeTemplate {
  readonly code: RegistryCode;
  readonly id: SafeTemplateId;
  readonly parameters: readonly TemplateParameterDeclaration[];
}

const EMPTY_PARAMETERS = Object.freeze([]) as readonly TemplateParameterDeclaration[];

export const FIRST_ID_PARAMETER_SECURITY_GATE =
  "FIRST_ID_PARAMETER_REQUIRES_EXPLICIT_SECURITY_REVIEW" as const;
export type ParameterSecurityGate = typeof FIRST_ID_PARAMETER_SECURITY_GATE;

// A future re-pin may add this gate only with explicit security-review evidence.
// Keeping the acknowledgement list empty makes the first id parameter fail shut.
export const REVIEWED_PARAMETER_SECURITY_GATES = Object.freeze(
  [] as ParameterSecurityGate[],
);

export function assertParameterSecurityGates(
  templates: readonly Pick<SafeTemplate, "parameters">[],
  reviewedGates: readonly ParameterSecurityGate[],
): void {
  const hasIdParameter = templates.some((template) =>
    template.parameters.some((parameter) => parameter.type === "id"),
  );
  if (
    hasIdParameter &&
    !new Set<string>(reviewedGates).has(FIRST_ID_PARAMETER_SECURITY_GATE)
  ) {
    throw new Error(FIRST_ID_PARAMETER_SECURITY_GATE);
  }
}

export function safeTemplateId(code: RegistryCode): SafeTemplateId {
  return `tpl.${code}` as SafeTemplateId;
}

export const SAFE_TEMPLATES = Object.freeze(
  ALL_REGISTRY_CODES.map((code) =>
    Object.freeze({
      code,
      id: safeTemplateId(code),
      parameters: EMPTY_PARAMETERS,
    }),
  ),
);

assertParameterSecurityGates(
  SAFE_TEMPLATES,
  REVIEWED_PARAMETER_SECURITY_GATES,
);

const SAFE_TEMPLATE_BY_CODE: ReadonlyMap<string, SafeTemplate> = new Map(
  SAFE_TEMPLATES.map((template) => [template.code, template]),
);
const SAFE_TEMPLATE_BY_ID: ReadonlyMap<string, SafeTemplate> = new Map(
  SAFE_TEMPLATES.map((template) => [template.id, template]),
);

export function resolveSafeTemplate(code: string): SafeTemplate | undefined {
  return SAFE_TEMPLATE_BY_CODE.get(code);
}

export function resolveSafeTemplateId(
  templateId: string,
): SafeTemplate | undefined {
  return SAFE_TEMPLATE_BY_ID.get(templateId);
}

const UUID_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const RUN_ID_PATTERN =
  /^run_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * Shape-validates the open `id` type. The admitted forms are exactly bare
 * RFC-4122 UUIDs, `run_` followed by an RFC-4122 UUID, and registry codes.
 * UUID shape cannot distinguish a lawful run/node id from an unlawful session
 * or asker id. Today the operative protection is the empty seed parameter list
 * plus the fail-shut FIRST_ID_PARAMETER_SECURITY_GATE above; this validator
 * does not establish privacy, authorization, or identifier provenance.
 */
export function validateId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (UUID_ID_PATTERN.test(value) ||
      RUN_ID_PATTERN.test(value) ||
      REGISTRY_CODE_SET.has(value))
  );
}

export function validateRegistryCode(value: unknown): value is RegistryCode {
  return typeof value === "string" && REGISTRY_CODE_SET.has(value);
}

export function validateClosedEnum(
  value: unknown,
  members: readonly string[],
): value is string {
  return typeof value === "string" && members.includes(value);
}

export function validateBoundedInt(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    Number.isSafeInteger(minimum) &&
    Number.isSafeInteger(maximum) &&
    minimum <= maximum &&
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
  );
}

export interface ValidatedTemplateParameters {
  readonly parameters: Readonly<Record<string, string | number>>;
  readonly dropped: readonly string[];
  readonly fallback_minimized: boolean;
}

function validatesDeclaration(
  declaration: TemplateParameterDeclaration,
  value: unknown,
): value is string | number {
  switch (declaration.type) {
    case "id":
      return validateId(value);
    case "registry_code":
      return validateRegistryCode(value);
    case "closed_enum":
      return validateClosedEnum(value, declaration.members);
    case "bounded_int":
      return validateBoundedInt(
        value,
        declaration.minimum,
        declaration.maximum,
      );
    default:
      return exhaustive(declaration);
  }
}

export function validateTemplateParameters(
  declarations: readonly TemplateParameterDeclaration[],
  input: Readonly<Record<string, unknown>>,
): ValidatedTemplateParameters {
  const parameters: Record<string, string | number> = Object.create(null) as Record<
    string,
    string | number
  >;
  const dropped: string[] = [];
  const declaredNames = new Set<string>();

  for (const declaration of declarations) {
    if (declaredNames.has(declaration.name)) {
      throw new Error(
        `Duplicate template parameter declaration: ${declaration.name}`,
      );
    }
    declaredNames.add(declaration.name);
  }

  for (const declaration of declarations) {
    const value = input[declaration.name];
    if (
      Object.prototype.hasOwnProperty.call(input, declaration.name) &&
      validatesDeclaration(declaration, value)
    ) {
      parameters[declaration.name] = value;
    } else {
      dropped.push(declaration.name);
    }
  }

  for (const name of Object.keys(input)) {
    if (!declaredNames.has(name)) {
      dropped.push(name);
    }
  }

  return Object.freeze({
    parameters: Object.freeze(parameters),
    dropped: Object.freeze(dropped),
    fallback_minimized: dropped.length > 0,
  });
}

export const SEVERITY_LADDER = Object.freeze([
  "INFO",
  "DEGRADED",
  "SEVERE",
  "FATAL",
] as const);
export type Severity = (typeof SEVERITY_LADDER)[number];
export const SEVERITY_DEFAULT: Severity = "DEGRADED";
export const SEVERITY_OVERRIDES: Readonly<
  Partial<Record<RegistryCode, Severity>>
> = Object.freeze({});

export function severity(code: RegistryCode): Severity {
  return SEVERITY_OVERRIDES[code] ?? SEVERITY_DEFAULT;
}

export const CONDITION_MARK_SEVERITY = Object.freeze(
  Object.fromEntries(
    CONDITION_MARKS.map((mark) => [mark, SEVERITY_DEFAULT] as const),
  ),
) as Readonly<Record<ConditionMark, Severity>>;

export function severityForConditionMark(mark: ConditionMark): Severity {
  return CONDITION_MARK_SEVERITY[mark];
}

export const TAXONOMY_CLASSES = Object.freeze([
  "PROCESS_DEATH",
  "HTTP_FAILURE",
  "JOB_FAILURE",
  "PROVIDER_EXHAUSTED",
  "DB_FAILURE",
  "PARSE_SCHEMA_FAILURE",
  "STALL_DETECTED",
  "SILENT_NOOP",
  "SUSPICIOUS_SUCCESS",
  "CLIENT_FAILURE",
  "CAPTURE_SELF",
  "ORIGIN_UNKNOWN",
] as const);
export type TaxonomyClass = (typeof TAXONOMY_CLASSES)[number];

export const SUSPICIOUS_SUCCESS_SUBCLASSES = Object.freeze([
  "empty_output",
  "missing_required_fields",
  "missing_artifact_chain",
] as const);
export type SuspiciousSuccessSubclass =
  (typeof SUSPICIOUS_SUCCESS_SUBCLASSES)[number];

export interface ResolvedTaxonomyClass {
  readonly taxonomy_class: TaxonomyClass;
  readonly suspicious_success_subclasses: readonly SuspiciousSuccessSubclass[];
}

const TAXONOMY_CLASS_SET: ReadonlySet<string> = new Set(TAXONOMY_CLASSES);

export function resolveTaxonomyClass(
  taxonomyClass: string,
): ResolvedTaxonomyClass | undefined {
  if (!TAXONOMY_CLASS_SET.has(taxonomyClass)) {
    return undefined;
  }
  const resolved = taxonomyClass as TaxonomyClass;
  return Object.freeze({
    taxonomy_class: resolved,
    suspicious_success_subclasses:
      resolved === "SUSPICIOUS_SUCCESS"
        ? SUSPICIOUS_SUCCESS_SUBCLASSES
        : Object.freeze([]),
  });
}
