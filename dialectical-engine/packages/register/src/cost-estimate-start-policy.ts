import { z } from "zod";
import { TypedDomainError } from "@debateai/kernel";
import type { Pool } from "pg";

/**
 * THE COST ESTIMATE'S STARTING FIGURES, as a sealed register row (owner rulings 2026-10-22, fresh-site estimate).
 *
 * The room's estimate (packages/budget/src/estimate.ts, RecentRunsCostEstimator) samples the last 20 settled hosted
 * runs of the ask's settings class and answers their 75th percentile. Before this row, with fewer than 20 samples it
 * answered the run's maximum ($3.66 on the preview), so on a fresh site every room read said "close to your plan's
 * limit" and every premium Plus ask (day allowance $1.00) ran on the Free AIs. The owner ruled:
 *  - `min_samples`: the history needed before the sample is trusted (5; at most the sample size, 20);
 *  - `start_micros_by_depth`: until then, the estimate is this figure for the ask's depth (depth 1 $0.30, depth 2
 *    $0.60, depth 3 $1.00), still capped at the run's maximum; a depth without a figure (4, 5) answers the maximum.
 *    One figure for every plan and line-up (the careful side for smaller line-ups). Measured: a depth-1 debate of five
 *    AIs with its story cost $0.25 (R19 practice).
 * Money in USD micro-units, named on the row as costEnvelopePolicy names them.
 *
 * OPTIONAL in reading: a version without the row reads null, and the estimator then answers exactly as before (20
 * samples, the maximum while short), so every sealed version keeps its behaviour. A malformed row refuses the API's
 * boot (COST_ESTIMATE_START_POLICY_INVALID). Code-owned: every development, hosted and preview publication seals it,
 * and changing a figure is a new settings version, never a code change to a sealed one.
 * Only the API reads it (the room and the coarse fit, at admission); nothing reaches a client (I6).
 */
export const COST_ESTIMATE_START_POLICY_ROW_KEY = "costEstimateStartPolicy" as const;

/** The estimator's sample size (estimate.ts): the trusted minimum can never ask for more history than it reads. */
const MAX_SAMPLES = 20;
/** A sanity bound on one figure ($50, the preview kit's per-run bound), never a ceiling: the run's maximum caps it. */
const MAX_FIGURE_MICROS = 50_000_000;

const figure = z.number().int().min(1).max(MAX_FIGURE_MICROS);

const costEstimateStartPolicyValueSchema = z.object({
  kind: z.literal("COST_ESTIMATE_START_POLICY"),
  currency: z.literal("USD"),
  minor_units_per_unit: z.literal(1_000_000),
  min_samples: z.number().int().min(1).max(MAX_SAMPLES),
  /** Keyed by the debate's depth as text ("1" … "5", the contract's EXPANSION_DEPTH range); each key optional. */
  start_micros_by_depth: z.object({
    "1": figure.optional(),
    "2": figure.optional(),
    "3": figure.optional(),
    "4": figure.optional(),
    "5": figure.optional()
  }).strict()
}).strict();

export type CostEstimateStartPolicyValue = z.infer<typeof costEstimateStartPolicyValueSchema>;

export type CostEstimateStartPolicy = Readonly<{
  minSamples: number;
  /** depth → starting figure in micro-units; a depth not listed answers the run's maximum. */
  startMicrosByDepth: ReadonlyMap<number, number>;
}>;

export function costEstimateStartPolicyFromValue(value: unknown, sourceRef: string): CostEstimateStartPolicy {
  const parsed = costEstimateStartPolicyValueSchema.safeParse(value);
  if (!parsed.success || typeof sourceRef !== "string" || sourceRef.trim() === "") {
    throw new TypedDomainError("COST_ESTIMATE_START_POLICY_INVALID", "The sealed cost-estimate start policy row is malformed");
  }
  const byDepth = new Map<number, number>();
  for (const [depth, micros] of Object.entries(parsed.data.start_micros_by_depth).sort(([a], [b]) => Number(a) - Number(b))) {
    if (micros !== undefined) byDepth.set(Number(depth), micros);
  }
  return Object.freeze({ minSamples: parsed.data.min_samples, startMicrosByDepth: byDepth });
}

/** The row at a register version: null when the version has none (the estimator's behaviour before 2026-10-22). */
export async function readCostEstimateStartPolicy(
  pool: Pick<Pool, "query">,
  registerVersion: number
): Promise<CostEstimateStartPolicy | null> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, COST_ESTIMATE_START_POLICY_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : costEstimateStartPolicyFromValue(row.value_json, row.source_ref);
}

export const COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: COST_ESTIMATE_START_POLICY_ROW_KEY,
  sourceRef: "owner rulings 2026-10-22 (fresh-site estimate): trust the sample from 5 settled runs of a class; until"
    + " then depth 1 $0.30, depth 2 $0.60, depth 3 $1.00, capped at the run's maximum; measured depth-1 five-AI debate"
    + " with story $0.25 (R19 practice)",
  value: Object.freeze({
    kind: "COST_ESTIMATE_START_POLICY" as const,
    currency: "USD" as const,
    minor_units_per_unit: 1_000_000 as const,
    min_samples: 5,
    start_micros_by_depth: Object.freeze({ "1": 300_000, "2": 600_000, "3": 1_000_000 })
  })
});
