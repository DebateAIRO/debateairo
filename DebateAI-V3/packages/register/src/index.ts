import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { z } from "zod";
import {
  CLAIM_TYPES,
  OPERATOR_SUPPLYING_LEVELS,
  RISK_TIERS,
  SCORING_OPERATORS,
  TypedDomainError,
  type ClaimType,
  type OperatorSupplyingLevel,
  type RiskTier,
  type ScoringOperator
} from "@debateai/kernel";

export const CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY = "claimTypeCompositionMap" as const;
export const ENGINE_BRANCHING_FACTOR = 2 as const;
export const ENGINE_COMPOSITION_SEGMENT_CAP = 2 as const;
export const ENGINE_FIXED_ORGANS_PER_COMPOSITION = 1 + ENGINE_COMPOSITION_SEGMENT_CAP + 1;
export const ENGINE_MAX_RECOMPOSE = 2 as const;

const unitIntervalSchema = z.number().finite().min(0).max(1);
const compositionMetricSchema = z.enum([
  "steelman_fidelity", "counter_resilience", "evidence_quality", "evidence_relevance",
  "context_fit", "clarity", "fallacy_resilience"
]);

export const claimTypeCompositionMemberSchema = z.object({
  branch: z.enum(["EVIDENCE_AWARE", "EVIDENCE_FREE"]),
  clarityDecayPerAmbiguity: unitIntervalSchema,
  terms: z.array(z.object({
    metric: compositionMetricSchema,
    coefficient: unitIntervalSchema
  }).strict()),
  caps: z.array(z.object({
    whenFatalType: z.string().trim().min(1),
    to: unitIntervalSchema,
    why: z.string().trim().min(1),
    by: z.string().trim().min(1)
  }).strict()),
  uncertaintyLadder: z.array(z.object({
    atMost: unitIntervalSchema,
    label: z.string().trim().min(1)
  }).strict())
}).strict();

export type ClaimTypeCompositionMember = z.infer<typeof claimTypeCompositionMemberSchema>;

export const claimTypeCompositionMapValueSchema = z.object({
  kind: z.literal("CLAIM_TYPE_COMPOSITION_MAP"),
  entries: z.partialRecord(z.enum(CLAIM_TYPES), claimTypeCompositionMemberSchema)
}).strict();

export type ClaimTypeCompositionMapValue = z.infer<typeof claimTypeCompositionMapValueSchema>;

export interface CompositionMapRegisterRow {
  readonly rowKey: typeof CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly value: {
    readonly kind: "CLAIM_TYPE_COMPOSITION_MAP";
    readonly entries: Partial<Readonly<Record<ClaimType, ClaimTypeCompositionMember>>>;
  };
}

export async function readClaimTypeCompositionMap(
  pool: Pool,
  registerVersion: number
): Promise<CompositionMapRegisterRow> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for the claim-type composition map");
  }
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key, value_json, source_ref
     FROM register.register_row
     WHERE register_version = $1 AND row_key = $2`,
    [registerVersion, CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "CLAIM_TYPE_COMPOSITION_MAP_UNRESOLVED",
      `No V-ratified ${CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY} value exists in register version ${registerVersion}`
    );
  }
  const parsed = claimTypeCompositionMapValueSchema.safeParse(row.value_json);
  if (!parsed.success) {
    throw new TypedDomainError(
      "CLAIM_TYPE_COMPOSITION_MAP_INVALID",
      `The ${CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY} row violates its DR-128 declared member type`
    );
  }
  if (row.source_ref.trim() === "") {
    throw new TypedDomainError(
      "CLAIM_TYPE_COMPOSITION_MAP_PROVENANCE_MISSING",
      `The ${CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY} row has no source_ref`
    );
  }
  return Object.freeze({
    rowKey: CLAIM_TYPE_COMPOSITION_MAP_ROW_KEY,
    registerVersion,
    sourceRef: row.source_ref,
    value: parsed.data
  });
}

export const DEPLOYMENT_RISK_TIER_ROW_KEY = "riskTier" as const;
export const CONVERGENCE_EPSILON_ROW_KEY = "convergenceEpsilon" as const;
export const CONVERGENCE_STOP_DEFAULTS_ROW_KEY = "convergenceStopDefaults" as const;
export const LIVENESS_POLICY_ROW_KEY = "livenessPolicy" as const;

const livenessPolicySchema = z.object({
  kind: z.literal("LIVENESS_POLICY"),
  classes: z.record(z.string().trim().min(1), z.object({
    review_after_ms: z.number().int().positive(),
    retire_after_ms: z.number().int().positive()
  }).strict())
}).strict();

export async function readLivenessPolicy(pool: Pool, registerVersion: number, questionClass: string): Promise<{
  readonly rowKey: typeof LIVENESS_POLICY_ROW_KEY;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly questionClass: string;
  readonly reviewAfterMs: number;
  readonly retireAfterMs: number;
}> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1 || questionClass.trim() === "") {
    throw new TypeError("A positive register version and nonempty question class are required for liveness");
  }
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json, source_ref FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, LIVENESS_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) throw new TypedDomainError("LIVENESS_POLICY_UNRESOLVED", `${LIVENESS_POLICY_ROW_KEY}@${registerVersion}`);
  const parsed = livenessPolicySchema.safeParse(row.value_json);
  const member = parsed.success ? parsed.data.classes[questionClass] : undefined;
  if (!parsed.success || member === undefined) {
    throw new TypedDomainError("LIVENESS_POLICY_INVALID", `${LIVENESS_POLICY_ROW_KEY}:${questionClass}`);
  }
  if (row.source_ref.trim() === "") throw new TypedDomainError("LIVENESS_POLICY_PROVENANCE_MISSING", questionClass);
  return Object.freeze({
    rowKey: LIVENESS_POLICY_ROW_KEY,
    registerVersion,
    sourceRef: row.source_ref,
    questionClass,
    reviewAfterMs: member.review_after_ms,
    retireAfterMs: member.retire_after_ms
  });
}

export interface StructuralCeilingInput {
  readonly panelSize: number;
  readonly depth: number;
  readonly judgeMaxAttempts: number;
  readonly organMaxAttempts: number;
  readonly maxRecompose: number;
  readonly maxCooldownHoldsPerRun: number;
  readonly finalRetryAttempts: number;
  readonly branchingFactor: number;
  readonly compositionSegmentCap: number;
  readonly fixedOrgansPerComposition: number;
}

/** DR-181/182: an invisible bug tripwire derived from the engine's exported facts. */
export function computeStructuralCeilingBasis(input: StructuralCeilingInput): Readonly<Record<string, unknown>> & {
  readonly max_model_attempts: number;
} {
  for (const [name, value] of Object.entries(input)) {
    if (!Number.isInteger(value) || value < 1) throw new TypeError(`STRUCTURAL_CEILING_${name.toUpperCase()}_INVALID`);
  }
  const nodesPerRoot = input.panelSize === 1
    ? 1
    : (input.branchingFactor ** (input.depth + 1) - 1) / (input.branchingFactor - 1);
  if (!Number.isInteger(nodesPerRoot)) throw new TypeError("STRUCTURAL_CEILING_TREE_INVALID");
  const authored = input.panelSize === 1
    ? 1
    : input.panelSize * nodesPerRoot + input.panelSize * (input.panelSize - 1);
  const reviews = input.panelSize === 1 ? 0 : authored;
  const fixedSites = input.maxRecompose * input.fixedOrgansPerComposition;
  const maxModelAttempts = (authored + reviews) * (input.judgeMaxAttempts + input.finalRetryAttempts)
    + fixedSites * input.organMaxAttempts;
  return Object.freeze({
    kind: "COMPUTED_STRUCTURAL_CEILING",
    max_model_attempts: maxModelAttempts,
    panel_size: input.panelSize,
    depth: input.depth,
    per_site_attempts: Object.freeze({ judge: input.judgeMaxAttempts, organ: input.organMaxAttempts }),
    hold_cap: input.maxCooldownHoldsPerRun,
    final_retry_attempts: input.finalRetryAttempts,
    formula_version: "DR-184-v2",
    bounds_source_ref: "engine-exports+register"
  });
}

const structuralBoundSchema = z.object({
  kind: z.literal("ACCEPTANCE_ORGAN_COST_BOUNDS"),
  organs: z.object({
    JUDGE: z.object({ maxAttempts: z.number().int().positive() }).passthrough(),
    COMPOSER: z.object({ maxAttempts: z.number().int().positive() }).passthrough(),
    CONFORMANCE: z.object({ maxAttempts: z.number().int().positive() }).passthrough()
  }).passthrough()
}).passthrough();

const structuralDeathSchema = z.object({
  kind: z.literal("RUN_DEATH_POLICY"),
  final_retry_attempts: z.number().int().positive(),
  max_cooldown_holds_per_run: z.number().int().positive()
}).passthrough();

export async function readStructuralCeilingPolicyInputs(pool: Pool, registerVersion: number): Promise<{
  readonly judgeMaxAttempts: number;
  readonly organMaxAttempts: number;
  readonly finalRetryAttempts: number;
  readonly maxCooldownHoldsPerRun: number;
}> {
  const result = await pool.query<{ row_key: string; value_json: unknown }>(
    `SELECT row_key, value_json FROM register.register_row
     WHERE register_version=$1 AND row_key=ANY($2::text[])`,
    [registerVersion, ["acceptanceOrganCostBounds", "runDeathPolicy"]]
  );
  const byKey = new Map(result.rows.map((row) => [row.row_key, row.value_json]));
  const bounds = structuralBoundSchema.safeParse(byKey.get("acceptanceOrganCostBounds"));
  const death = structuralDeathSchema.safeParse(byKey.get("runDeathPolicy"));
  if (!bounds.success || !death.success) {
    throw new TypedDomainError("STRUCTURAL_CEILING_INPUTS_UNRESOLVED", "The engine attempt bounds or death policy are absent");
  }
  return Object.freeze({
    judgeMaxAttempts: bounds.data.organs.JUDGE.maxAttempts,
    organMaxAttempts: Math.max(bounds.data.organs.COMPOSER.maxAttempts, bounds.data.organs.CONFORMANCE.maxAttempts),
    finalRetryAttempts: death.data.final_retry_attempts,
    maxCooldownHoldsPerRun: death.data.max_cooldown_holds_per_run
  });
}

export async function readPanelDiscoveryPolicy(pool: Pool, registerVersion: number): Promise<{
  readonly probeFreshnessMs: number;
  readonly probeMaxAttempts: 1;
  readonly sourceRef: string;
}> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json, source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key='panelDiscoveryPolicy'`,
    [registerVersion]
  );
  const row = result.rows[0];
  const parsed = z.object({
    kind: z.literal("PANEL_DISCOVERY_POLICY"),
    probe_freshness_ms: z.number().int().positive(),
    probe_max_attempts: z.literal(1)
  }).strict().safeParse(row?.value_json);
  if (row === undefined || !parsed.success || row.source_ref.trim() === "") {
    throw new TypedDomainError("PANEL_DISCOVERY_POLICY_UNRESOLVED", "No ruled discovery policy is available");
  }
  return Object.freeze({
    probeFreshnessMs: parsed.data.probe_freshness_ms,
    probeMaxAttempts: parsed.data.probe_max_attempts,
    sourceRef: row.source_ref
  });
}

export interface DeploymentRiskTierRow {
  readonly rowKey: typeof DEPLOYMENT_RISK_TIER_ROW_KEY;
  readonly registerVersion: number;
  readonly sourceRef: string;
  readonly value: RiskTier;
}

/** One deployment-floor source for every composition root and UI projection. */
export async function readDeploymentRiskTier(
  pool: Pool,
  registerVersion: number
): Promise<DeploymentRiskTierRow> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for the deployment risk tier");
  }
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key, value_json, source_ref
     FROM register.register_row
     WHERE register_version = $1 AND row_key = $2`,
    [registerVersion, DEPLOYMENT_RISK_TIER_ROW_KEY]
  );
  const row = result.rows[0];
  if (row === undefined) {
    throw new TypedDomainError(
      "RISK_TIER_POLICY_UNRESOLVED",
      `No V-ratified ${DEPLOYMENT_RISK_TIER_ROW_KEY} exists in register version ${registerVersion}`
    );
  }
  const parsed = z.enum(RISK_TIERS).safeParse(row.value_json);
  if (!parsed.success) {
    throw new TypedDomainError("RISK_TIER_POLICY_INVALID", `${DEPLOYMENT_RISK_TIER_ROW_KEY} is not a ruled risk tier`);
  }
  if (row.source_ref.trim() === "") {
    throw new TypedDomainError("RISK_TIER_POLICY_PROVENANCE_MISSING", `${DEPLOYMENT_RISK_TIER_ROW_KEY} has no source_ref`);
  }
  return Object.freeze({
    rowKey: DEPLOYMENT_RISK_TIER_ROW_KEY,
    registerVersion,
    sourceRef: row.source_ref,
    value: parsed.data
  });
}

const convergenceEpsilonSchema = z.object({
  kind: z.literal("CONVERGENCE_EPSILON"),
  epsilon: z.number().finite().nonnegative()
}).strict();

const convergenceStopDefaultsSchema = z.object({
  kind: z.literal("CONVERGENCE_STOP_DEFAULTS"),
  members: z.record(z.string().trim().min(1), z.unknown())
    .refine((members) => Object.keys(members).length > 0)
}).strict();

export async function readConvergenceControls(pool: Pool, registerVersion: number): Promise<{
  readonly registerVersion: number;
  readonly epsilon: number;
  readonly defaults: Readonly<Record<string, unknown>>;
  readonly epsilonSourceRef: string;
  readonly defaultsSourceRef: string;
}> {
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    throw new TypeError("A positive register version is required for convergence controls");
  }
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key, value_json, source_ref
     FROM register.register_row
     WHERE register_version = $1 AND row_key = ANY($2::text[])`,
    [registerVersion, [CONVERGENCE_EPSILON_ROW_KEY, CONVERGENCE_STOP_DEFAULTS_ROW_KEY]]
  );
  const epsilonRow = result.rows.find((row) => row.row_key === CONVERGENCE_EPSILON_ROW_KEY);
  const defaultsRow = result.rows.find((row) => row.row_key === CONVERGENCE_STOP_DEFAULTS_ROW_KEY);
  if (epsilonRow === undefined || defaultsRow === undefined) {
    throw new TypedDomainError(
      "CONVERGENCE_CONTROLS_UNRESOLVED",
      `Both ${CONVERGENCE_EPSILON_ROW_KEY} and ${CONVERGENCE_STOP_DEFAULTS_ROW_KEY} are mandatory`
    );
  }
  const epsilon = convergenceEpsilonSchema.safeParse(epsilonRow.value_json);
  const defaults = convergenceStopDefaultsSchema.safeParse(defaultsRow.value_json);
  if (!epsilon.success || !defaults.success) {
    throw new TypedDomainError("CONVERGENCE_CONTROLS_INVALID", "H8 convergence controls violate their ruled member types");
  }
  if (epsilonRow.source_ref.trim() === "" || defaultsRow.source_ref.trim() === "") {
    throw new TypedDomainError("CONVERGENCE_CONTROLS_PROVENANCE_MISSING", "H8 convergence controls require source_ref");
  }
  return Object.freeze({
    registerVersion,
    epsilon: epsilon.data.epsilon,
    defaults: Object.freeze({ ...defaults.data.members }),
    epsilonSourceRef: epsilonRow.source_ref,
    defaultsSourceRef: defaultsRow.source_ref
  });
}

const bootstrapKeys = [
  "nodeRuntimeVersion",
  "pnpmVersion",
  "postgresMajorVersion",
  "typescriptVersion",
  "vllmImageDigest"
] as const;

export type BootstrapKey = typeof bootstrapKeys[number];

const bootstrapSchema = z.object({
  registerVersion: z.literal(1),
  values: z.object({
    nodeRuntimeVersion: z.string().min(1),
    pnpmVersion: z.string().min(1),
    postgresMajorVersion: z.string().regex(/^\d+$/),
    typescriptVersion: z.string().min(1),
    vllmImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/)
  }).strict(),
  resolution: z.record(z.enum(bootstrapKeys), z.string().min(1))
});

export type BootstrapRegister = z.infer<typeof bootstrapSchema>;

export async function loadBootstrapRegister(
  location = new URL("../../../register.bootstrap.json", import.meta.url)
): Promise<BootstrapRegister> {
  const raw = await readFile(location, "utf8");
  return bootstrapSchema.parse(JSON.parse(raw));
}

export type RegisterLevel = OperatorSupplyingLevel;

export function resolveRegisterValue<T>(
  key: string,
  levels: Readonly<Record<RegisterLevel, Readonly<Record<string, T>>>>
): { readonly value: T; readonly suppliedBy: RegisterLevel } {
  for (const suppliedBy of OPERATOR_SUPPLYING_LEVELS) {
    if (Object.hasOwn(levels[suppliedBy], key)) {
      return { value: levels[suppliedBy][key]!, suppliedBy };
    }
  }
  throw new Error(`Unresolved register key: ${key}`);
}

export interface EffectiveRiskTierResolution {
  readonly effectiveRiskTier: RiskTier;
  readonly tierSource: "ASKER" | "DEPLOYMENT_POLICY";
  readonly tierProvenanceRef: string;
  readonly policySuppliedBy: RegisterLevel | null;
}

export function resolveEffectiveRiskTier(input: {
  readonly askerTier: RiskTier;
  readonly askerProvenanceRef: string;
  readonly policyLevels: Readonly<Record<RegisterLevel, Readonly<Partial<Record<"riskTier", RiskTier>>>>>;
}): EffectiveRiskTierResolution {
  if (input.askerProvenanceRef.trim() === "") {
    throw new TypedDomainError("TIER_PROVENANCE_MISSING", "The asker declaration must carry provenance");
  }
  let policy: { readonly value: RiskTier; readonly suppliedBy: RegisterLevel } | null = null;
  try {
    policy = resolveRegisterValue("riskTier", input.policyLevels);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Unresolved register key: riskTier") throw error;
  }
  if (policy !== null && !(RISK_TIERS as readonly string[]).includes(policy.value)) {
    throw new TypedDomainError("RISK_TIER_POLICY_INVALID", `Invalid risk tier at ${policy.suppliedBy}`);
  }
  const askerRank = RISK_TIERS.indexOf(input.askerTier);
  const policyRank = policy === null ? -1 : RISK_TIERS.indexOf(policy.value);
  if (policy !== null && policyRank > askerRank) {
    return Object.freeze({
      effectiveRiskTier: policy.value,
      tierSource: "DEPLOYMENT_POLICY",
      tierProvenanceRef: input.askerProvenanceRef,
      policySuppliedBy: policy.suppliedBy
    });
  }
  return Object.freeze({
    effectiveRiskTier: input.askerTier,
    tierSource: "ASKER",
    tierProvenanceRef: input.askerProvenanceRef,
    policySuppliedBy: null
  });
}

export function resolveScoringOperator(
  levels: Readonly<Record<RegisterLevel, Readonly<Record<string, unknown>>>>
): { readonly value: ScoringOperator; readonly suppliedBy: RegisterLevel } {
  if (!Object.hasOwn(levels.deployment, "scoringOperator")) {
    throw new Error("Mandatory deployment register row is missing: scoringOperator");
  }
  for (const suppliedBy of OPERATOR_SUPPLYING_LEVELS) {
    if (!Object.hasOwn(levels[suppliedBy], "scoringOperator")) continue;
    const value = levels[suppliedBy].scoringOperator;
    if (!(SCORING_OPERATORS as readonly unknown[]).includes(value)) {
      throw new Error(`Invalid scoringOperator register value at ${suppliedBy}`);
    }
    return Object.freeze({ value: value as ScoringOperator, suppliedBy });
  }
  throw new Error("Mandatory deployment register row is missing: scoringOperator");
}

export async function persistBootstrapRegister(pool: Pool, bootstrap: BootstrapRegister): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const key of bootstrapKeys) {
      await client.query(
        `INSERT INTO register.register_row (register_version, row_key, value_json, source_ref)
         VALUES ($1, $2, $3::jsonb, $4)
         ON CONFLICT (register_version, row_key) DO NOTHING`,
        [bootstrap.registerVersion, key, JSON.stringify(bootstrap.values[key]), bootstrap.resolution[key]]
      );
    }
    await client.query(
      `INSERT INTO register.register_version (register_version, row_count, sealed)
       VALUES ($1, $2, true)
       ON CONFLICT (register_version) DO NOTHING`,
      [bootstrap.registerVersion, bootstrapKeys.length]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function assertBootstrapEquality(pool: Pool, bootstrap: BootstrapRegister): Promise<void> {
  const result = await pool.query<{ row_key: BootstrapKey; value_json: unknown }>(
    `SELECT row_key, value_json FROM register.register_row
     WHERE register_version = $1 AND row_key = ANY($2::text[])
     ORDER BY row_key`,
    [bootstrap.registerVersion, bootstrapKeys]
  );
  if (result.rows.length !== bootstrapKeys.length) {
    throw new Error(`FX-REG-01 bootstrap row count mismatch: expected ${bootstrapKeys.length}, received ${result.rows.length}`);
  }
  for (const row of result.rows) {
    if (row.value_json !== bootstrap.values[row.row_key]) {
      throw new Error(`FX-REG-01 bootstrap mismatch at ${row.row_key}`);
    }
  }
}

export {
  loadApiEnvironment,
  loadLivenessEnvironment,
  loadMigrationEnvironment,
  loadReplaySelfTestEnvironment,
  loadRunnerEnvironment,
  loadSettlementEnvironment
} from "./runtime-environment.js";
