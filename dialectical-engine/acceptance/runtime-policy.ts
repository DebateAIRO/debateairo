import { z } from "zod";
import type { Pool } from "pg";
import type { RiskTier } from "@debateai/kernel";
import { computeStructuralCeilingBasis } from "@debateai/register";
import {
  RUNNER_BRANCHING_FACTOR,
  RUNNER_COMPOSITION_SEGMENT_CAP,
  RUNNER_FIXED_ORGANS_PER_COMPOSITION,
  RUNNER_MAX_RECOMPOSE
} from "@debateai/runner";
import {
  readClaimTypeCompositionMap,
  type CompositionMapRegisterRow
} from "@debateai/register";
import type { BandCeilingRegisterRow, CompositionBudgetResolution } from "@debateai/serve";
import {
  ACCEPTANCE_PROVIDER_SET_SOURCE_REF,
  ACCEPTANCE_HIDDEN_SCORE_SOURCE_REF,
  ACCEPTANCE_REGISTER_SOURCE_REF,
  ACCEPTANCE_REGISTER_VERSION,
  ACCEPTANCE_RUN_DEATH_POLICY_SOURCE_REF,
  ACCEPTANCE_DISCOVERY_SOURCE_REF
} from "./seed-register.js";

const costBoundSchema = z.object({
  maxAttempts: z.number().int().positive(),
  tokenCeiling: z.number().int().positive(),
  deadlineMs: z.number().int().positive()
}).strict();

const minimumSharesSchema = z.partialRecord(
  z.enum(["LOOKED_UP", "RAN", "REASONING"]),
  z.number().min(0).max(1)
);

const runtimeRowsSchema = z.object({
  riskTier: z.literal("standard"),
  acceptanceOrganCostBounds: z.object({
    kind: z.literal("ACCEPTANCE_ORGAN_COST_BOUNDS"),
    organs: z.object({
      JUDGE: costBoundSchema,
      COMPOSER: costBoundSchema,
      CONFORMANCE: costBoundSchema
    }).strict()
  }).strict(),
  panelDiscoveryPolicy: z.object({
    kind: z.literal("PANEL_DISCOVERY_POLICY"),
    probe_freshness_ms: z.literal(600_000),
    probe_max_attempts: z.literal(1)
  }).strict(),
  runDeathPolicy: z.object({
    kind: z.literal("RUN_DEATH_POLICY"),
    cooldown_ms: z.number().int().positive(),
    final_retry_attempts: z.literal(1),
    max_cooldown_holds_per_run: z.literal(2),
    applies_to: z.literal("TRANSPORT_EXHAUSTION")
  }).strict(),
  hiddenNodeScoreThreshold: z.literal(0.35),
  compositionBundleBudget: z.object({
    low: z.number().int().positive(),
    medium: z.number().int().positive(),
    high: z.number().int().positive()
  }).strict(),
  wayOfKnowingCeiling: z.object({
    bandOrder: z.array(z.string().min(1)).min(1),
    ceilingLabels: z.array(z.string().min(1)).min(1),
    defaultCeiling: z.object({
      label: z.string().min(1), ceilingBand: z.string().min(1), liftPath: z.string().min(1)
    }).strict(),
    cuts: z.array(z.object({
      minimumShares: minimumSharesSchema,
      label: z.string().min(1), ceilingBand: z.string().min(1), liftPath: z.string().min(1)
    }).strict())
  }).strict(),
  // FAIR-02 (DR-140): both real makers, in seeded order. The floor stays 1
  // (DR-137 mono-model admission); the honest 2-maker report comes from the
  // provider list itself.
  configuredProviderSet: z.object({
    kind: z.literal("CONFIGURED_PROVIDER_SET"),
    requiredDistinctMakers: z.literal(1),
    providers: z.array(z.object({
      providerRef: z.string().trim().min(1),
      adapterKind: z.literal("openai-compatible-http"),
      maker: z.string().trim().min(1)
    }).strict()).min(1)
  }).strict(),
  judgeContractHash: z.string().regex(/^[a-f0-9]{64}$/),
  composerContractHash: z.string().regex(/^[a-f0-9]{64}$/),
  conformanceContractHash: z.string().regex(/^[a-f0-9]{64}$/),
  propagationContractHash: z.string().regex(/^[a-f0-9]{64}$/),
  serveContractHash: z.string().regex(/^[a-f0-9]{64}$/)
}).strict();

export function parseAcceptanceRuntimeRows(input: unknown): z.infer<typeof runtimeRowsSchema> {
  return runtimeRowsSchema.parse(input);
}

export interface AcceptanceRuntimePolicy {
  readonly riskTier: RiskTier;
  readonly compositionRow: CompositionMapRegisterRow;
  readonly bounds: z.infer<typeof runtimeRowsSchema>["acceptanceOrganCostBounds"]["organs"];
  readonly compositionBudgets: Readonly<Record<"low" | "medium" | "high", CompositionBudgetResolution>>;
  readonly bandCeiling: BandCeilingRegisterRow;
  readonly panelDiscoveryPolicy: {
    readonly probeFreshnessMs: 600_000;
    readonly probeMaxAttempts: 1;
  };
  readonly runDeathPolicy: {
    readonly cooldownMs: number;
    readonly finalRetryAttempts: 1;
    readonly maxCooldownHoldsPerRun: 2;
  };
  readonly hiddenNodeScoreThreshold: {
    readonly value: 0.35;
    readonly sourceRef: typeof ACCEPTANCE_HIDDEN_SCORE_SOURCE_REF;
  };
  /** DR-162-A/DR-177: configured real makers remain register-driven data. */
  readonly providers: ReadonlyArray<z.infer<typeof runtimeRowsSchema>["configuredProviderSet"]["providers"][number]>;
  readonly hashes: {
    readonly judge: string;
    readonly composer: string;
    readonly conformance: string;
    readonly propagation: string;
    readonly serve: string;
  };
}

export function computeAcceptanceStructuralCeiling(
  policy: Pick<AcceptanceRuntimePolicy, "bounds" | "runDeathPolicy">,
  panelSize: number,
  depth: number
): ReturnType<typeof computeStructuralCeilingBasis> {
  return computeStructuralCeilingBasis({
    panelSize,
    depth,
    judgeMaxAttempts: policy.bounds.JUDGE.maxAttempts,
    organMaxAttempts: Math.max(policy.bounds.COMPOSER.maxAttempts, policy.bounds.CONFORMANCE.maxAttempts),
    maxRecompose: RUNNER_MAX_RECOMPOSE,
    maxCooldownHoldsPerRun: policy.runDeathPolicy.maxCooldownHoldsPerRun,
    finalRetryAttempts: policy.runDeathPolicy.finalRetryAttempts,
    branchingFactor: RUNNER_BRANCHING_FACTOR,
    compositionSegmentCap: RUNNER_COMPOSITION_SEGMENT_CAP,
    fixedOrgansPerComposition: RUNNER_FIXED_ORGANS_PER_COMPOSITION
  });
}

/**
 * FAIR-01 × DR-074: the mandatory deployment `scoringOperator` register row.
 * Its VALUE is V's at DR-023 and is NOT part of the DR-133 acceptance seed —
 * this read is therefore optional-by-absence: a missing row returns undefined
 * and the runner stops loudly (SCORING_OPERATOR_UNRESOLVED) the moment an
 * arrow-bearing graph needs it. The raw row value travels to the runner
 * untouched; the SHIPPED resolveScoringOperator chain (P8) validates it at
 * the point of use, and the recorded receipt carries the supplying level.
 */
export async function readOptionalScoringOperator(pool: Pool): Promise<{
  readonly deploymentRowValue: unknown;
  readonly registerRef: string;
} | undefined> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json, source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key='scoringOperator'`,
    [ACCEPTANCE_REGISTER_VERSION]
  );
  const row = result.rows[0];
  if (row === undefined) return undefined;
  if (typeof row.source_ref !== "string" || row.source_ref.trim().length === 0) {
    throw new Error("ACCEPTANCE_SCORING_OPERATOR_PROVENANCE_INVALID");
  }
  return Object.freeze({
    deploymentRowValue: row.value_json,
    registerRef: `scoringOperator@${ACCEPTANCE_REGISTER_VERSION}:${row.source_ref}`
  });
}

export async function readAcceptanceRuntimePolicy(pool: Pool): Promise<AcceptanceRuntimePolicy> {
  const keys = Object.keys(runtimeRowsSchema.shape);
  const result = await pool.query<{ row_key: string; value_json: unknown; source_ref: string }>(
    `SELECT row_key, value_json, source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=ANY($2::text[])`,
    [ACCEPTANCE_REGISTER_VERSION, keys]
  );
  if (result.rows.length !== keys.length) throw new Error("ACCEPTANCE_RUNTIME_POLICY_UNRESOLVED");
  const expectedSourceRef = (rowKey: string): string => {
    if (rowKey === "panelDiscoveryPolicy") return ACCEPTANCE_DISCOVERY_SOURCE_REF;
    if (rowKey === "runDeathPolicy") return ACCEPTANCE_RUN_DEATH_POLICY_SOURCE_REF;
    if (rowKey === "hiddenNodeScoreThreshold") return ACCEPTANCE_HIDDEN_SCORE_SOURCE_REF;
    if (rowKey === "configuredProviderSet") return ACCEPTANCE_PROVIDER_SET_SOURCE_REF;
    return ACCEPTANCE_REGISTER_SOURCE_REF;
  };
  if (result.rows.some((row) => row.source_ref !== expectedSourceRef(row.row_key))) {
    throw new Error("ACCEPTANCE_RUNTIME_POLICY_PROVENANCE_INVALID");
  }
  const parsed = parseAcceptanceRuntimeRows(Object.fromEntries(
    result.rows.map((row) => [row.row_key, row.value_json])
  ));
  const compositionRow = await readClaimTypeCompositionMap(pool, ACCEPTANCE_REGISTER_VERSION);
  const compositionBudgets = Object.freeze(Object.fromEntries(
    Object.entries(parsed.compositionBundleBudget).map(([tier, bound]) => [tier, Object.freeze({
      tier: tier as "low" | "medium" | "high",
      bound,
      registerRowKey: "compositionBundleBudget",
      registerVersion: ACCEPTANCE_REGISTER_VERSION,
      sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF
    })])
  ) as Record<"low" | "medium" | "high", CompositionBudgetResolution>);
  return Object.freeze({
    riskTier: parsed.riskTier,
    compositionRow,
    bounds: parsed.acceptanceOrganCostBounds.organs,
    compositionBudgets,
    bandCeiling: Object.freeze({
      rowKey: "wayOfKnowingCeiling",
      registerVersion: ACCEPTANCE_REGISTER_VERSION,
      sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF,
      value: parsed.wayOfKnowingCeiling
    }),
    panelDiscoveryPolicy: Object.freeze({
      probeFreshnessMs: parsed.panelDiscoveryPolicy.probe_freshness_ms,
      probeMaxAttempts: parsed.panelDiscoveryPolicy.probe_max_attempts
    }),
    runDeathPolicy: Object.freeze({
      cooldownMs: parsed.runDeathPolicy.cooldown_ms,
      finalRetryAttempts: parsed.runDeathPolicy.final_retry_attempts,
      maxCooldownHoldsPerRun: parsed.runDeathPolicy.max_cooldown_holds_per_run
    }),
    hiddenNodeScoreThreshold: Object.freeze({
      value: parsed.hiddenNodeScoreThreshold,
      sourceRef: ACCEPTANCE_HIDDEN_SCORE_SOURCE_REF
    }),
    providers: Object.freeze(parsed.configuredProviderSet.providers),
    hashes: Object.freeze({
      judge: parsed.judgeContractHash,
      composer: parsed.composerContractHash,
      conformance: parsed.conformanceContractHash,
      propagation: parsed.propagationContractHash,
      serve: parsed.serveContractHash
    })
  });
}
