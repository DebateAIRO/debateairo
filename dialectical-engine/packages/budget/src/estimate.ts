import type { Pool } from "pg";
import { chargeMicrosForUsage, type ProviderTargetPrice } from "./cost-envelope.js";

/**
 * Budget spec 2026-09-28 §2.5 — THE ESTIMATE, "recent debates at today's prices".
 *
 * A seam (`CostEstimator`), so the scorecard branch's `estimateRunCost` plugs in
 * when it merges. This implementation:
 *  - samples the last `sampleSize` (20) hosted runs of the same settings class
 *    that settled inside the last `lookbackMs` (30 days);
 *  - prices each sample run's RUN and STORY charges row by row at TODAY's price
 *    (`chargeMicrosForUsage`), a provider no longer configured at the highest
 *    current price on each side;
 *  - answers the 75th percentile (nearest rank), capped at the run's own maximum
 *    (`mostOneRunMaySpendMicros`), and never below one micro-unit (a hold is > 0);
 *  - with fewer samples than that, answers the maximum — today's reservation
 *    figure, the careful side;
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
}>;

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
  }>): Promise<ReadonlyArray<RecentRunUsage>>;
}

const PLAN_TIERS = Object.freeze(["free", "premium"] as const);
const COMPOSITION_TIERS = Object.freeze(["low", "medium", "high"] as const);

export function settingsClassKey(settings: RunSettingsClass): string {
  if (!PLAN_TIERS.includes(settings?.planTier)
    || !COMPOSITION_TIERS.includes(settings?.compositionBudgetTier)
    || !Number.isSafeInteger(settings.makerCount) || settings.makerCount < 1
    || !Number.isSafeInteger(settings.depth) || settings.depth < 1) {
    throw new TypeError("COST_ESTIMATE_SETTINGS_INVALID");
  }
  return `${settings.planTier}|${settings.compositionBudgetTier}|${settings.makerCount}|${settings.depth}`;
}

export function estimateFromSampleCosts(input: Readonly<{
  costs: ReadonlyArray<number>;
  sampleSize: number;
  maximumMicros: number;
}>): number {
  if (!Number.isSafeInteger(input.maximumMicros) || input.maximumMicros < 1) {
    throw new TypeError("COST_ESTIMATE_MAXIMUM_INVALID");
  }
  if (!Number.isSafeInteger(input.sampleSize) || input.sampleSize < 1) {
    throw new TypeError("COST_ESTIMATE_SAMPLE_SIZE_INVALID");
  }
  for (const cost of input.costs) {
    if (!Number.isSafeInteger(cost) || cost < 0) throw new TypeError("COST_ESTIMATE_COST_INVALID");
  }
  if (input.costs.length < input.sampleSize) return input.maximumMicros;
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
  }>) {
    this.#source = options.source;
    this.#prices = options.prices;
    this.#maximumMicros = options.maximumMicros;
    this.#clock = options.clock ?? (() => new Date());
    this.#sampleSize = options.sampleSize ?? 20;
    this.#lookbackMs = options.lookbackMs ?? 30 * 24 * 60 * 60 * 1_000;
    this.#cacheMs = options.cacheMs ?? 60_000;
    for (const value of [this.#maximumMicros, this.#sampleSize, this.#lookbackMs, this.#cacheMs]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("COST_ESTIMATE_OPTIONS_INVALID");
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
      limit: this.#sampleSize
    });
    const costs: number[] = [];
    if (this.#prices.size > 0) {
      for (const run of runs) costs.push(priceRecentRun(run, this.#prices) ?? this.#maximumMicros);
    }
    const value = estimateFromSampleCosts({ costs, sampleSize: this.#sampleSize, maximumMicros: this.#maximumMicros });
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
 */
export class PostgresRecentRunUsageSource implements RecentRunUsageSource {
  constructor(private readonly pool: Pool) {}

  async readRecentRunUsage(input: Readonly<{
    settings: RunSettingsClass;
    since: Date;
    limit: number;
  }>): Promise<ReadonlyArray<RecentRunUsage>> {
    settingsClassKey(input.settings);
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 1_000) {
      throw new TypeError("COST_ESTIMATE_SAMPLE_SIZE_INVALID");
    }
    const result = await this.pool.query<{
      run_id: string;
      provider_ref: string;
      input_tokens: string;
      output_tokens: string;
    }>(
      `WITH sample AS (
         SELECT run.run_id, max(spend.recorded_at) AS last_charged_at
         FROM core.run AS run
         JOIN ledger.model_spend AS spend
           ON spend.run_id = run.run_id AND spend.spend_source IN ('RUN','STORY')
         WHERE run.plan_tier = $1
           AND run.composition_budget_tier = $2
           AND run.depth_params->>'depth' = $3
           AND jsonb_array_length(run.discovered_panel) = $4
           AND EXISTS (SELECT 1 FROM core.work_item AS work WHERE work.run_id = run.run_id)
           AND NOT EXISTS (
             SELECT 1 FROM core.work_item AS work
             WHERE work.run_id = run.run_id AND work.state IN ('READY','CLAIMED','FAILED')
           )
         GROUP BY run.run_id
         HAVING max(spend.recorded_at) >= $5
         ORDER BY max(spend.recorded_at) DESC, run.run_id
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
        input.limit
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
