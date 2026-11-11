import type { Pool } from "pg";
import { crossAccount } from "@debateai/db";
import {
  AnswerLengthSchema, DepthModeSchema, ScrutinySchema, START_STEP_LIMITS, type AnswerLength, type DepthMode, type Scrutiny
} from "@debateai/contract";
import { DEBATE_SHAPE_PLAN_KEYS, webSitesOf, type CostEstimateStartPolicy, type DebateShapePlanKey, type WebSiteInput } from "@debateai/register";
import { chargeMicrosForUsage, type ProviderTargetPrice } from "./cost-envelope.js";
import { WEB_SEARCH_REQUEST_MICROS, isWebSearchProviderRef } from "./web-charge.js";
import { estimateDigUpdatesMicros, estimateWebPartMicros, type WebRolePrices } from "./web-estimate.js";

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
 *  - owner rulings 2026-10-22 (fresh-site estimate): with the register's
 *    `costEstimateStartPolicy` row (`start`), the sample is trusted from its
 *    `min_samples` (5) runs, and below that the answer is the sealed starting
 *    figure of the ask's depth, capped at the maximum (a depth with no figure,
 *    or nothing to price with, still answers the maximum). Without the row
 *    (null or left out) nothing changes: 20 samples, the maximum while short;
 *  - caches each class for `cacheMs` (60 s) per process;
 *  - web search (plan 2026-10-30, W2-2): a class with a web part samples only runs admitted with that same web part,
 *    and prices a sample's searches per search at today's price (they carry no tokens). While a web class is short of
 *    samples (no web run has settled yet), its answer is the start figure of its depth PLUS its web part at the caps
 *    (`estimateWebPartMicros`), still capped at the maximum; with no web prices to price it with, the maximum.
 *  - V4 start step, Task 37 (spec 2026-11-03 §5): a path debate (shape receipt v2) is its own class for each number of
 *    paths, and samples only runs admitted with that many. Short of samples, its depth's start figure stands for a debate
 *    of `V2_START_FIGURE_PATHS_BASIS` (3) paths, so it is scaled to the debate's paths (rounded up), still capped at the
 *    maximum.
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
  /** Web search (W2-2): present only for a run admitted with web search on (its receipt's `web` member). */
  web?: WebSiteInput;
}>;

/**
 * Debate shape (spec 2026-10-12 §3.6): what a shaped run's cost depends on beyond today's class — its plan's sizes and
 * its three settings. A run asked without the register's row has none, and is sampled only among runs that had none.
 * V4 start step, Task 37: `paths`, a path debate's (shape receipt v2) number of chosen paths, 1 to 8; absent on every
 * other run, which is then sampled only among runs whose receipt names no paths.
 */
export type RunShapeClass = Readonly<{
  plan: DebateShapePlanKey; depthMode: DepthMode; scrutiny: Scrutiny; answerLength: AnswerLength; paths?: number;
}>;

/**
 * V4 start step, Task 37: the paths a depth's start figure stands for. A path debate short of samples starts at
 * ceil(figure x paths / 3), capped at the run's maximum. Module-local: the source-purity law refuses an exported numeric
 * literal (as Task 27's busy book); the start figures in tests/unit/start-step-estimate-class.test.ts pin it.
 */
const V2_START_FIGURE_PATHS_BASIS = 3;

export interface CostEstimator {
  estimateMicros(settings: RunSettingsClass): Promise<number>;
  /** R22 decision 9: a dig's web part at its most, for the share shown before it; absent or null: not known. */
  digWebPartMicros?(web: Readonly<{ depth: "QUICK" | "THOROUGH"; digPicks: number }>): number | null;
  /**
   * V4 start step, Task 37: a path debate's web part at its most (every chosen path a pack of its own, at a debate's
   * start), for the share shown before Start; absent or null: not known. Task 79b: `origin` "DIG" prices a path debate's
   * dig (its own results per search, as the ask's receipt counts it); absent: a debate's start, as before.
   */
  pathsWebPartMicros?(web: Readonly<{ depth: "QUICK" | "THOROUGH"; paths: number; origin?: "START" | "DIG" }>): number | null;
  /** The owner's ruling (31 Oct): what follows a dig at this level, for the same share; absent or null: not known. */
  digUpdatesPartMicros?(dig: Readonly<{ level: number; free: boolean }>): number | null;
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
  const base = `${settings.planTier}|${settings.compositionBudgetTier}|${settings.makerCount}|${settings.depth}`;
  const shape = settings.shape;
  if (shape === undefined) return `${base}${webClassKey(settings.web)}`;
  if (!(DEBATE_SHAPE_PLAN_KEYS as readonly string[]).includes(shape?.plan) || !DepthModeSchema.safeParse(shape.depthMode).success
    || !ScrutinySchema.safeParse(shape.scrutiny).success || !AnswerLengthSchema.safeParse(shape.answerLength).success
    || (shape.paths !== undefined && !isPathCount(shape.paths))) {
    throw new TypeError("COST_ESTIMATE_SETTINGS_INVALID");
  }
  // V4 start step, Task 37: a path debate's paths, before the web part (empty without, so every key minted before stays the same).
  const paths = shape.paths === undefined ? "" : `|paths:${shape.paths}`;
  return `${base}|${shape.plan}|${shape.depthMode}|${shape.scrutiny}|${shape.answerLength}${paths}${webClassKey(settings.web)}`;
}

/** V4 start step, Task 37: a path debate's number of paths, 1 to 8 (b1..b8). */
function isPathCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 1 && value <= START_STEP_LIMITS.storedPathsMax;
}

/** W2-2: the web part's place in the class key (empty without one, so every class key minted before stays the same). */
function webClassKey(web: WebSiteInput | undefined): string {
  if (web === undefined) return "";
  let sites;
  try { sites = webSitesOf(web); } catch { throw new TypeError("COST_ESTIMATE_SETTINGS_INVALID"); }
  return `|web:${sites.kind}:${sites.depth}:${sites.packs}:${sites.searches}`;
}

/**
 * A waiting run's stored shape settings, read the CAREFUL way (contract deviation 8): a value this code does not know
 * reads as the dearest one, so one odd row can never stop the whole waiting line (the reason migration 0085's trigger
 * exists for the depth cast); the dearest class is the careful side (with fewer than the sample size of its own runs it
 * is estimated at the run's maximum). No settings (a run asked without the row) is null. A shaped run with no plan on
 * its receipt (one maker) takes `fallbackPlan`. V4 start step, Task 37: the receipt's paths (a path debate's) are kept
 * from 1 to 8; none (null, or not read) is no paths; any other value reads as the most, 8.
 */
export function waitingShapeClassOf(raw: unknown, fallbackPlan: DebateShapePlanKey): RunShapeClass | null {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const known = <T extends string>(options: readonly T[], found: unknown, dearest: T): T =>
    (options as readonly unknown[]).includes(found) ? found as T : dearest;
  const paths = value.paths === null || value.paths === undefined ? {}
    : { paths: isPathCount(value.paths) ? value.paths : START_STEP_LIMITS.storedPathsMax };
  return Object.freeze({
    plan: value.plan === null || value.plan === undefined ? fallbackPlan : known(DEBATE_SHAPE_PLAN_KEYS, value.plan, "max"),
    depthMode: known(DepthModeSchema.options, value.depthMode, "fixed"),
    scrutiny: known(ScrutinySchema.options, value.scrutiny, "exhaustive"),
    answerLength: known(AnswerLengthSchema.options, value.answerLength, "detailed"),
    ...paths
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
    // W2-2: a search is billed per request, never by tokens (its row carries none): today's price per search.
    if (isWebSearchProviderRef(charge.providerRef)) {
      total += WEB_SEARCH_REQUEST_MICROS;
      continue;
    }
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
  readonly #webPrices: WebRolePrices | null;
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
    /**
     * W2-2: each web role's price (the dearest of its candidates), so a web class short of samples is estimated at its
     * start figure plus its web part. Null or left out: a web class short of samples answers the maximum.
     */
    webPrices?: WebRolePrices | null;
  }>) {
    this.#source = options.source;
    this.#prices = options.prices;
    this.#maximumMicros = options.maximumMicros;
    this.#clock = options.clock ?? (() => new Date());
    this.#sampleSize = options.sampleSize ?? 20;
    this.#lookbackMs = options.lookbackMs ?? 30 * 24 * 60 * 60 * 1_000;
    this.#cacheMs = options.cacheMs ?? 60_000;
    this.#start = options.start ?? null;
    this.#webPrices = options.webPrices ?? null;
    for (const value of [this.#maximumMicros, this.#sampleSize, this.#lookbackMs, this.#cacheMs]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError("COST_ESTIMATE_OPTIONS_INVALID");
    }
    if (this.#start !== null && (!Number.isSafeInteger(this.#start.minSamples) || this.#start.minSamples < 1
      || this.#start.minSamples > this.#sampleSize)) {
      throw new TypeError("COST_ESTIMATE_OPTIONS_INVALID");
    }
  }

  /**
   * R22 decision 9: a dig's web part at the most it can do (up to 4 searches per chosen path, each chosen path's planner,
   * the readers, its suggestions), for the share of today shown before it. Null with no web prices. It holds nothing and walls
   * nothing (the owner's money rule, 31 Oct: no worst-case hold before a start): only the line reads it.
   */
  digWebPartMicros(web: Readonly<{ depth: "QUICK" | "THOROUGH"; digPicks: number }>): number | null {
    if (this.#webPrices === null) return null;
    return estimateWebPartMicros(webSitesOf({ kind: "DIG", depth: web.depth, digPicks: web.digPicks }), this.#webPrices).totalMicros;
  }

  /**
   * V4 start step, Task 37: a path debate's web part at the most it can do (every chosen path its own planner, up to 4
   * searches on a Quick look, 8 on a Thorough one, its readers and its pick; every path's arguing reading every path's
   * pack), for the share shown before Start. Null with no web prices. Like a dig's, only the share reads it. Task 79b: a
   * path debate's dig asks it from a dig's origin (`origin` "DIG"), the share shown before the dig.
   */
  pathsWebPartMicros(web: Readonly<{ depth: "QUICK" | "THOROUGH"; paths: number; origin?: "START" | "DIG" }>): number | null {
    if (this.#webPrices === null) return null;
    return estimateWebPartMicros(webSitesOf({ kind: "PATHS", depth: web.depth, paths: web.paths, origin: web.origin ?? "START" }),
      this.#webPrices).totalMicros;
  }

  /** What follows a dig: its rewrite, the climb and the main answer's update. Null with no web prices. Like the web part, only the line reads it. */
  digUpdatesPartMicros(dig: Readonly<{ level: number; free: boolean }>): number | null {
    return this.#webPrices === null ? null : estimateDigUpdatesMicros(dig, this.#webPrices);
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
    // With nothing to price with, the starting figure is not used either: the careful side, the maximum.
    const depthFigure = this.#start === null ? null : this.#start.startMicrosByDepth.get(settings.depth) ?? null;
    // V4 start step, Task 37: a path debate's figure counts its paths (the depth's figure stands for 3), rounded up.
    const paths = settings.shape?.paths;
    const depthStart = depthFigure === null || paths === undefined ? depthFigure
      : Math.ceil((depthFigure * paths) / V2_START_FIGURE_PATHS_BASIS);
    // W2-2: a web class starts at its depth's figure plus its web part at the caps; without web prices, the maximum.
    const startMicros = depthStart === null || settings.web === undefined ? depthStart
      : this.#webPrices === null ? null
        : depthStart + estimateWebPartMicros(webSitesOf(settings.web), this.#webPrices).totalMicros;
    const start = this.#start === null || this.#prices.size === 0 ? {} : {
      minSamples: this.#start.minSamples,
      startMicros: startMicros !== null && Number.isSafeInteger(startMicros) ? startMicros : null
    };
    const value = estimateFromSampleCosts({ costs, sampleSize: this.#sampleSize, maximumMicros: this.#maximumMicros, ...start });
    this.#cache.set(key, Object.freeze({ at: now, value }));
    return value;
  }
}

/**
 * W2-2: the sample's web filter: a web class's own kind, depth, packs and searches; '' for a class that names none, which samples
 * every run of its settings, with or without a web receipt: the room's classes name none (only the quota line prices a dig's web
 * part), so a minted receipt must not take a paid run out of the sample its own estimate learns from.
 */
function webSampleParams(web: WebSiteInput | undefined): readonly [string, string, string, string] {
  if (web === undefined) return ["", "", "", ""];
  const sites = webSitesOf(web);
  return [sites.kind, sites.depth, String(sites.packs), String(sites.searches)];
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
 * V4 start step, Task 37: a class with paths samples only runs whose receipt names that many paths ($15); a class without
 * them, only runs whose receipt names none.
 */
export class PostgresRecentRunUsageSource implements RecentRunUsageSource {
  constructor(private readonly pool: Pool) {}

  async readRecentRunUsage(input: Readonly<{
    settings: RunSettingsClass;
    since: Date;
    limit: number;
  }>): Promise<ReadonlyArray<RecentRunUsage>> {
    return crossAccount("X20", async () => {
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
             AND COALESCE(run.depth_params->>'depthMode', '') = $7
             AND COALESCE(run.depth_params->>'scrutiny', '') = $8
             AND COALESCE(run.depth_params->>'answerLength', '') = $9
             AND COALESCE(run.envelope_basis->'shape'->>'plan', '') = $10
             AND ($11 = '' OR COALESCE(run.envelope_basis->'web'->>'kind', '') = $11)
             AND ($12 = '' OR COALESCE(run.envelope_basis->'web'->>'depth', '') = $12)
             AND ($13 = '' OR COALESCE(run.envelope_basis->'web'->>'packs', '') = $13)
             AND ($14 = '' OR COALESCE(run.envelope_basis->'web'->>'searches', '') = $14)
             AND COALESCE(run.envelope_basis->'shape'->>'paths', '') = $15
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
          input.limit,
          input.settings.shape?.depthMode ?? "",
          input.settings.shape?.scrutiny ?? "",
          input.settings.shape?.answerLength ?? "",
          input.settings.shape?.plan ?? "",
          ...webSampleParams(input.settings.web),
          input.settings.shape?.paths === undefined ? "" : String(input.settings.shape.paths)
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
    });
  }
}
