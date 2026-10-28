import type { Pool } from "pg";
import { AnswerLengthSchema, DepthModeSchema, ScrutinySchema, type AnswerLength, type DepthMode, type Scrutiny } from "@debateai/contract";
import { DEBATE_SHAPE_PLAN_KEYS, type CostEstimateStartPolicy, type DebateShapePlanKey } from "@debateai/register";
import { chargeMicrosForUsage, type ProviderTargetPrice } from "./cost-envelope.js";

/**
 * Budget spec 2026-09-28 §2.5 — THE ESTIMATE, "recent debates at today's prices".
 *
 * A seam (`CostEstimator`), so the scorecard branch's `estimateRunCost` plugs in
 * when it merges. This implementation:
 *  - samples the last `sampleSize` (20) hosted runs of the same settings class
 *    that settled inside the last `lookbackMs` (30 days);
 *  - NV-49 (security audit run 3): at most one run per owner
 *    (`MAX_SAMPLES_PER_OWNER`), and no run a DAILY or ALLOWANCE wall stopped,
 *    so one owner, or one day of wall cuts, cannot set a class's estimate;
 *  - prices each sample run's RUN and STORY charges row by row at TODAY's price
 *    (`chargeMicrosForUsage`), a provider no longer configured at the highest
 *    current price on each side;
 *  - answers the 75th percentile (nearest rank), capped at the run's own maximum
 *    (`mostOneRunMaySpendMicros`), and never below one micro-unit (a hold is > 0);
 *  - with fewer samples than that, answers the maximum — today's reservation
 *    figure, the careful side;
 *  - owner rulings 2026-10-22 (fresh-site estimate): with the register's
 *    `costEstimateStartPolicy` row (`start`), the sample is trusted from its
 *    `min_samples` (5) runs, and below that the answer is the sealed starting
 *    figure of the ask's depth, capped at the maximum (a depth with no figure,
 *    or nothing to price with, still answers the maximum). Without the row
 *    (null or left out) nothing changes: 20 samples, the maximum while short;
 *  - caches each class for `cacheMs` (60 s) per process.
 * The estimate is never sent to a client (I6): the room read returns a word.
 */
export type RunSettingsClass = Readonly<{
  planTier: "free" | "premium";
  compositionBudgetTier: "low" | "medium" | "high";
  /**
   * The number of MODELS the debate is run with (the contract's name is kept):
   * the plan's roster length for an ask, the stored panel's length for a run.
   * Both sides count models, never distinct makers, so they always agree.
   */
  makerCount: number;
  depth: number;
  /** Debate shape: present only for a shaped run (see RunShapeClass). */
  shape?: RunShapeClass;
}>;

/**
 * Debate shape (spec 2026-10-12 §3.6): what a shaped run's cost depends on beyond today's class — its plan's sizes and
 * its three settings. A run asked without the register's row has none, and is sampled only among runs that had none.
 */
export type RunShapeClass = Readonly<{ plan: DebateShapePlanKey; depthMode: DepthMode; scrutiny: Scrutiny; answerLength: AnswerLength }>;

export interface CostEstimator {
  estimateMicros(settings: RunSettingsClass): Promise<number>;
}

export type RecentRunCharge = Readonly<{ providerRef: string; inputTokens: number; outputTokens: number }>;
export type RecentRunUsage = Readonly<{ runId: string; charges: ReadonlyArray<RecentRunCharge> }>;

export interface RecentRunUsageSource {
  readRecentRunUsage(input: Readonly<{
    settings: RunSettingsClass;
    since: Date;
    limit: number;
    /** NV-49: the most runs of one owner the sample may hold (1 … limit); left out, `MAX_SAMPLES_PER_OWNER`. */
    maxPerOwner?: number;
  }>): Promise<ReadonlyArray<RecentRunUsage>>;
}

const PLAN_TIERS = Object.freeze(["free", "premium"] as const);
const COMPOSITION_TIERS = Object.freeze(["low", "medium", "high"] as const);
/**
 * NV-49 (security audit run 3): the runs one owner may contribute to a class's sample. Not register-set, because an
 * older release's strict start schema (costEstimateStartPolicy) would refuse a new member at boot; change it only in code.
 */
const MAX_SAMPLES_PER_OWNER = 1;

/**
 * NV-49: the condition-mark reasons of a DAILY or ALLOWANCE wall stop, the runner's `ENVELOPE_STOP_REASONS.DAILY` and
 * `.ALLOWANCE` (apps/runner/src/index.ts; pinned equal by tests/unit/nv49-estimate-owner-share.test.ts). A run whose
 * answer carries one is not sampled: the wall cut it short, so its cost is not a typical run's. A MONEY stop (the run's
 * own ceiling) stays sampled: it marks an expensive run.
 */
export const BUDGET_WALL_STOP_REASONS = Object.freeze(["DAILY_COST_ENVELOPE_REACHED", "PERSON_ALLOWANCE_REACHED"] as const);

/**
 * NV-49: the same two stops as `serve.serve_disclosure`'s `body_stop` / `serve_stop` store them, the runner's
 * `ENVELOPE_STOP_CODES.DAILY_COST_ENVELOPE_REACHED` and `.PERSON_ALLOWANCE_REACHED`. The row is kept for every answer,
 * so it also catches a DEFECT answer, which carries no envelope mark.
 */
export const BUDGET_WALL_STOP_KINDS = Object.freeze(["DAILY", "ALLOWANCE"] as const);

export function settingsClassKey(settings: RunSettingsClass): string {
  if (!PLAN_TIERS.includes(settings?.planTier)
    || !COMPOSITION_TIERS.includes(settings?.compositionBudgetTier)
    || !Number.isSafeInteger(settings.makerCount) || settings.makerCount < 1
    || !Number.isSafeInteger(settings.depth) || settings.depth < 1) {
    throw new TypeError("COST_ESTIMATE_SETTINGS_INVALID");
  }
  const base = `${settings.planTier}|${settings.compositionBudgetTier}|${settings.makerCount}|${settings.depth}`;
  const shape = settings.shape;
  if (shape === undefined) return base;
  if (!(DEBATE_SHAPE_PLAN_KEYS as readonly string[]).includes(shape?.plan) || !DepthModeSchema.safeParse(shape.depthMode).success
    || !ScrutinySchema.safeParse(shape.scrutiny).success || !AnswerLengthSchema.safeParse(shape.answerLength).success) {
    throw new TypeError("COST_ESTIMATE_SETTINGS_INVALID");
  }
  return `${base}|${shape.plan}|${shape.depthMode}|${shape.scrutiny}|${shape.answerLength}`;
}

/**
 * A waiting run's stored shape settings, read the CAREFUL way (contract deviation 8): a value this code does not know
 * reads as the dearest one, so one odd row can never stop the whole waiting line (the reason migration 0085's trigger
 * exists for the depth cast); the dearest class is the careful side (with fewer than the sample size of its own runs it
 * is estimated at the run's maximum). No settings (a run asked without the row) is null. A shaped run with no plan on
 * its receipt (one maker) takes `fallbackPlan`.
 */
export function waitingShapeClassOf(raw: unknown, fallbackPlan: DebateShapePlanKey): RunShapeClass | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const known = <T extends string>(options: readonly T[], found: unknown, dearest: T): T =>
    (options as readonly unknown[]).includes(found) ? found as T : dearest;
  return Object.freeze({
    plan: value.plan === null || value.plan === undefined ? fallbackPlan : known(DEBATE_SHAPE_PLAN_KEYS, value.plan, "max"),
    depthMode: known(DepthModeSchema.options, value.depthMode, "fixed"),
    scrutiny: known(ScrutinySchema.options, value.scrutiny, "exhaustive"),
    answerLength: known(AnswerLengthSchema.options, value.answerLength, "detailed")
  });
}

export function estimateFromSampleCosts(input: Readonly<{
  costs: ReadonlyArray<number>;
  sampleSize: number;
  maximumMicros: number;
  /** The samples needed before the percentile is trusted (1 … sampleSize); left out, the whole sample size. */
  minSamples?: number;
  /** The answer while the sample is short (capped at the maximum); null or left out, the maximum. */
  startMicros?: number | null;
}>): number {
  if (!Number.isSafeInteger(input.maximumMicros) || input.maximumMicros < 1) {
    throw new TypeError("COST_ESTIMATE_MAXIMUM_INVALID");
  }
  if (!Number.isSafeInteger(input.sampleSize) || input.sampleSize < 1) {
    throw new TypeError("COST_ESTIMATE_SAMPLE_SIZE_INVALID");
  }
  const minSamples = input.minSamples ?? input.sampleSize;
  if (!Number.isSafeInteger(minSamples) || minSamples < 1 || minSamples > input.sampleSize) {
    throw new TypeError("COST_ESTIMATE_SAMPLE_SIZE_INVALID");
  }
  const startMicros = input.startMicros ?? null;
  if (startMicros !== null && (!Number.isSafeInteger(startMicros) || startMicros < 1)) {
    throw new TypeError("COST_ESTIMATE_START_INVALID");
  }
  for (const cost of input.costs) {
    if (!Number.isSafeInteger(cost) || cost < 0) throw new TypeError("COST_ESTIMATE_COST_INVALID");
  }
  if (input.costs.length < minSamples) {
    return startMicros === null ? input.maximumMicros : Math.min(startMicros, input.maximumMicros);
  }
  const sorted = [...input.costs].sort((left, right) => left - right);
  // Nearest rank: the smallest sample at or above three quarters of the sample.
  const rank = Math.ceil((sorted.length * 75) / 100);
  const percentile = sorted[rank - 1] ?? input.maximumMicros;
  return Math.max(1, Math.min(percentile, input.maximumMicros));
}

/** One sample run at today's prices; null when there is no price at all to charge with. */
export function priceRecentRun(
  run: RecentRunUsage,
  prices: ReadonlyMap<string, ProviderTargetPrice>
): number | null {
  if (prices.size === 0) return null;
  let highestInput = 0;
  let highestOutput = 0;
  for (const price of prices.values()) {
    highestInput = Math.max(highestInput, price.inputMicrosPerMillionTokens);
    highestOutput = Math.max(highestOutput, price.outputMicrosPerMillionTokens);
  }
  const highest: ProviderTargetPrice = Object.freeze({
    inputMicrosPerMillionTokens: highestInput,
    outputMicrosPerMillionTokens: highestOutput
  });
  let total = 0;
  for (const charge of run.charges) {
    total += chargeMicrosForUsage(prices.get(charge.providerRef) ?? highest, {
      promptTokens: charge.inputTokens,
      completionTokens: charge.outputTokens
    });
  }
  if (!Number.isSafeInteger(total)) throw new TypeError("COST_ESTIMATE_COST_INVALID");
  return total;
}

export class RecentRunsCostEstimator implements CostEstimator {
  readonly #source: RecentRunUsageSource;
  readonly #prices: ReadonlyMap<string, ProviderTargetPrice>;
  readonly #maximumMicros: number;
  readonly #clock: () => Date;
  readonly #sampleSize: number;
  readonly #lookbackMs: number;
  readonly #cacheMs: number;
  readonly #start: CostEstimateStartPolicy | null;
  readonly #cache = new Map<string, Readonly<{ at: number; value: number }>>();

  constructor(options: Readonly<{
    source: RecentRunUsageSource;
    prices: ReadonlyMap<string, ProviderTargetPrice>;
    /** `mostOneRunMaySpendMicros(guardPolicy)`: the cap, and the answer while the sample is short. */
    maximumMicros: number;
    clock?: () => Date;
    sampleSize?: number;
    lookbackMs?: number;
    cacheMs?: number;
    /**
     * The register's `costEstimateStartPolicy` at the version in force (readCostEstimateStartPolicy): the trusted
     * minimum and the per-depth starting figures. Null or left out: a version without the row, today's behaviour.
     */
    start?: CostEstimateStartPolicy | null;
  }>) {
    this.#source = options.source;
    this.#prices = options.prices;
    this.#maximumMicros = options.maximumMicros;
    this.#clock = options.clock ?? (() => new Date());
    this.#sampleSize = options.sampleSize ?? 20;
    this.#lookbackMs = options.lookbackMs ?? 30 * 24 * 60 * 60 * 1_000;
    this.#cacheMs = options.cacheMs ?? 60_000;
    this.#start = options.start ?? null;
    for (const value of [this.#maximumMicros, this.#sampleSize, this.#lookbackMs, this.#cacheMs]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("COST_ESTIMATE_OPTIONS_INVALID");
    }
    if (this.#start !== null && (!Number.isSafeInteger(this.#start.minSamples) || this.#start.minSamples < 1
      || this.#start.minSamples > this.#sampleSize)) {
      throw new TypeError("COST_ESTIMATE_OPTIONS_INVALID");
    }
  }

  async estimateMicros(settings: RunSettingsClass): Promise<number> {
    const key = settingsClassKey(settings);
    const now = this.#clock().getTime();
    const cached = this.#cache.get(key);
    if (cached !== undefined && now - cached.at < this.#cacheMs) return cached.value;
    const runs = await this.#source.readRecentRunUsage({
      settings,
      since: new Date(now - this.#lookbackMs),
      limit: this.#sampleSize,
      maxPerOwner: MAX_SAMPLES_PER_OWNER
    });
    const costs: number[] = [];
    if (this.#prices.size > 0) {
      for (const run of runs) costs.push(priceRecentRun(run, this.#prices) ?? this.#maximumMicros);
    }
    // With nothing to price with, the starting figure is not used either: the careful side, the maximum.
    const start = this.#start === null || this.#prices.size === 0 ? {} : {
      minSamples: this.#start.minSamples,
      startMicros: this.#start.startMicrosByDepth.get(settings.depth) ?? null
    };
    const value = estimateFromSampleCosts({ costs, sampleSize: this.#sampleSize, maximumMicros: this.#maximumMicros, ...start });
    this.#cache.set(key, Object.freeze({ at: now, value }));
    return value;
  }
}

function countedTokens(text: string): number {
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError("COST_ESTIMATE_USAGE_UNREPRESENTABLE");
  return value;
}

/**
 * The sample, read from `core.run`, `core.work_item` and `ledger.model_spend`.
 * Settled = at least one work item and none READY, CLAIMED or FAILED; the run's
 * recency is its last RUN or STORY charge. The class is read from the columns the
 * run already stores (budget spec §2.5 "The plan reads each from the columns");
 * its model count is the stored panel's length, the ask side's roster length.
 * Debate shape (M1): a shaped class samples only runs whose RECEIPT carries that plan's shape, so a one-maker run (the
 * four settings stored, no shape minted) never joins it; a one-maker shaped ask then samples nothing and is estimated
 * at the run's maximum, the careful side. An unshaped class still samples only runs with no settings and no shape.
 * NV-49 (security audit run 3): at most `maxPerOwner` runs of one owner (`MAX_SAMPLES_PER_OWNER`, 1), each owner's
 * newest, the owner read as core.run_waiting_v reads it (the run's latest ownership event, else the uuid of an `owner:`
 * asker id; a legacy asker is its own owner). And no run a DAILY or ALLOWANCE wall stopped: one whose answer carries
 * such a condition mark (`BUDGET_WALL_STOP_REASONS`), or whose disclosure row records such a body or serve stop
 * (`BUDGET_WALL_STOP_KINDS`). Both are read: a DEFECT answer carries no mark, and the row's write may fail.
 */
export class PostgresRecentRunUsageSource implements RecentRunUsageSource {
  constructor(private readonly pool: Pool) {}

  async readRecentRunUsage(input: Readonly<{
    settings: RunSettingsClass;
    since: Date;
    limit: number;
    maxPerOwner?: number;
  }>): Promise<ReadonlyArray<RecentRunUsage>> {
    settingsClassKey(input.settings);
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1_000) {
      throw new TypeError("COST_ESTIMATE_SAMPLE_SIZE_INVALID");
    }
    const perOwner = input.maxPerOwner ?? MAX_SAMPLES_PER_OWNER;
    if (!Number.isSafeInteger(perOwner) || perOwner < 1 || perOwner > input.limit) {
      throw new TypeError("COST_ESTIMATE_SAMPLE_SIZE_INVALID");
    }
    const result = await this.pool.query<{
      run_id: string;
      provider_ref: string;
      input_tokens: string;
      output_tokens: string;
    }>(
      `WITH candidate AS (
         SELECT run.run_id, run.asker_id, max(spend.recorded_at) AS last_charged_at
         FROM core.run AS run
         JOIN ledger.model_spend AS spend
           ON spend.run_id = run.run_id AND spend.spend_source IN ('RUN','STORY')
         WHERE run.plan_tier = $1
           AND run.composition_budget_tier = $2
           AND run.depth_params->>'depth' = $3
           AND jsonb_array_length(run.discovered_panel) = $4
           AND COALESCE(run.depth_params->>'depthMode', '') = $7
           AND COALESCE(run.depth_params->>'scrutiny', '') = $8
           AND COALESCE(run.depth_params->>'answerLength', '') = $9
           AND COALESCE(run.envelope_basis->'shape'->>'plan', '') = $10
           AND EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = run.run_id)
           AND NOT EXISTS (
             SELECT 1 FROM core.work_item AS work
             WHERE work.run_id = run.run_id AND work.state IN ('READY','CLAIMED','FAILED')
           )
           AND NOT EXISTS (
             SELECT 1 FROM serve.answer AS answer
             JOIN serve.condition_mark AS mark
               ON mark.answer_id = answer.answer_id AND mark.answer_version = answer.answer_version
             WHERE answer.run_id = run.run_id AND mark.reason = ANY($12::text[])
           )
           AND NOT EXISTS (
             SELECT 1 FROM serve.serve_disclosure AS disclosure
             WHERE disclosure.run_id = run.run_id
               AND (disclosure.body_stop = ANY($13::text[]) OR disclosure.serve_stop = ANY($13::text[]))
           )
         GROUP BY run.run_id
         HAVING max(spend.recorded_at) >= $5
       ), ranked AS (
         SELECT candidate.run_id, candidate.last_charged_at,
                row_number() OVER (
                  PARTITION BY CASE
                    WHEN latest.owner_ref IS NOT NULL THEN latest.owner_ref::text
                    WHEN candidate.asker_id LIKE 'owner:%' THEN substr(candidate.asker_id, 7)
                    ELSE 'asker:' || candidate.asker_id
                  END
                  ORDER BY candidate.last_charged_at DESC, candidate.run_id
                ) AS owner_rank
         FROM candidate
         LEFT JOIN LATERAL (
           SELECT event.owner_ref FROM core.run_ownership_event AS event
           WHERE event.run_id = candidate.run_id
           ORDER BY event.at_seq DESC
           LIMIT 1
         ) AS latest ON true
       ), sample AS (
         SELECT ranked.run_id, ranked.last_charged_at
         FROM ranked
         WHERE ranked.owner_rank <= $11
         ORDER BY ranked.last_charged_at DESC, ranked.run_id
         LIMIT $6
       )
       SELECT sample.run_id, spend.provider_ref,
              spend.input_tokens::text AS input_tokens, spend.output_tokens::text AS output_tokens
       FROM sample
       JOIN ledger.model_spend AS spend
         ON spend.run_id = sample.run_id AND spend.spend_source IN ('RUN','STORY')
       ORDER BY sample.last_charged_at DESC, sample.run_id, spend.recorded_at, spend.spend_id`,
      [
        input.settings.planTier,
        input.settings.compositionBudgetTier,
        String(input.settings.depth),
        input.settings.makerCount,
        input.since,
        input.limit,
        input.settings.shape?.depthMode ?? "",
        input.settings.shape?.scrutiny ?? "",
        input.settings.shape?.answerLength ?? "",
        input.settings.shape?.plan ?? "",
        perOwner,
        [...BUDGET_WALL_STOP_REASONS],
        [...BUDGET_WALL_STOP_KINDS]
      ]
    );
    const runs = new Map<string, RecentRunCharge[]>();
    for (const row of result.rows) {
      const charges = runs.get(row.run_id) ?? [];
      charges.push(Object.freeze({
        providerRef: row.provider_ref,
        inputTokens: countedTokens(row.input_tokens),
        outputTokens: countedTokens(row.output_tokens)
      }));
      runs.set(row.run_id, charges);
    }
    return Object.freeze([...runs].map(([runId, charges]) => Object.freeze({ runId, charges: Object.freeze(charges) })));
  }
}
