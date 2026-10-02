import { describe, expect, it, vi } from "vitest";
import {
  RecentRunsCostEstimator,
  chargeMicrosForUsage,
  estimateFromSampleCosts,
  priceRecentRun,
  settingsClassKey,
  type ProviderTargetPrice,
  type RecentRunUsage,
  type RecentRunUsageSource,
  type RunSettingsClass
} from "@debateai/budget";

const FREE_LOW: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1 });
const PREMIUM_HIGH: RunSettingsClass = Object.freeze({ planTier: "premium", compositionBudgetTier: "high", makerCount: 3, depth: 3 });
const CHEAP = Object.freeze({ inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 500_000 });
const DEAR = Object.freeze({ inputMicrosPerMillionTokens: 4_000_000, outputMicrosPerMillionTokens: 20_000_000 });
const PRICES = new Map<string, ProviderTargetPrice>([["provider:cheap", CHEAP], ["provider:dear", DEAR]]);

describe("B2 the estimate from a sample (budget spec §2.5)", () => {
  it("is the run's maximum while fewer than 20 sample runs exist", () => {
    expect(estimateFromSampleCosts({ costs: Array.from({ length: 19 }, () => 10), sampleSize: 20, maximumMicros: 300_000 }))
      .toBe(300_000);
    expect(estimateFromSampleCosts({ costs: [], sampleSize: 20, maximumMicros: 300_000 })).toBe(300_000);
  });

  it("is the 75th percentile of 20 runs, nearest rank", () => {
    // 1 000 … 20 000 in a shuffled order: rank ⌈20 × 75 / 100⌉ = 15 → 15 000.
    const costs = Array.from({ length: 20 }, (_, index) => (((index * 7) % 20) + 1) * 1_000);
    expect(estimateFromSampleCosts({ costs, sampleSize: 20, maximumMicros: 300_000 })).toBe(15_000);
  });

  it("is capped at the run's own maximum", () => {
    expect(estimateFromSampleCosts({ costs: Array.from({ length: 20 }, () => 1_000_000), sampleSize: 20, maximumMicros: 300_000 }))
      .toBe(300_000);
  });

  it("is never zero, because a hold is at least one micro-unit", () => {
    expect(estimateFromSampleCosts({ costs: Array.from({ length: 20 }, () => 0), sampleSize: 20, maximumMicros: 300_000 }))
      .toBe(1);
  });

  it("refuses a cost that is not whole micro-units, and a maximum below one", () => {
    expect(() => estimateFromSampleCosts({ costs: [1.5], sampleSize: 1, maximumMicros: 10 })).toThrow(TypeError);
    expect(() => estimateFromSampleCosts({ costs: [], sampleSize: 1, maximumMicros: 0 })).toThrow(TypeError);
  });
});

describe("B2 a sample run is priced at today's prices", () => {
  const run: RecentRunUsage = Object.freeze({
    runId: "run:a",
    charges: Object.freeze([
      Object.freeze({ providerRef: "provider:cheap", inputTokens: 10_000, outputTokens: 2_000 }),
      Object.freeze({ providerRef: "provider:gone", inputTokens: 1_000, outputTokens: 100 })
    ])
  });

  it("prices a configured provider at its own price and one no longer configured at the highest price, per side", () => {
    const expected = chargeMicrosForUsage(CHEAP, { promptTokens: 10_000, completionTokens: 2_000 })
      + chargeMicrosForUsage(DEAR, { promptTokens: 1_000, completionTokens: 100 });
    expect(priceRecentRun(run, PRICES)).toBe(expected);
  });

  it("cannot price anything with no price at all", () => {
    expect(priceRecentRun(run, new Map())).toBeNull();
  });
});

describe("B2 RecentRunsCostEstimator", () => {
  function sourceReturning(runs: ReadonlyArray<RecentRunUsage>) {
    const reads: Array<Parameters<RecentRunUsageSource["readRecentRunUsage"]>[0]> = [];
    const source: RecentRunUsageSource = {
      readRecentRunUsage: vi.fn(async (input) => {
        reads.push(input);
        return runs;
      })
    };
    return { source, reads };
  }
  // Run k (1…20) sends k × 10 000 input tokens at 0.1 USD per million: k × 1 000 micro-units.
  const twentyRuns: ReadonlyArray<RecentRunUsage> = Array.from({ length: 20 }, (_, index) => Object.freeze({
    runId: `run:${index + 1}`,
    charges: Object.freeze([Object.freeze({ providerRef: "provider:cheap", inputTokens: (index + 1) * 10_000, outputTokens: 0 })])
  }));

  it("reads the last 20 runs of the class from the last 30 days, and prices them", async () => {
    const now = new Date("2026-09-30T12:00:00.000Z");
    const { source, reads } = sourceReturning(twentyRuns);
    const estimator = new RecentRunsCostEstimator({ source, prices: PRICES, maximumMicros: 300_000, clock: () => now });
    await expect(estimator.estimateMicros(FREE_LOW)).resolves.toBe(15_000);
    expect(reads).toEqual([{ settings: FREE_LOW, since: new Date("2026-08-31T12:00:00.000Z"), limit: 20 }]);
  });

  it("caches each class for 60 seconds per process, and each class separately", async () => {
    let now = new Date("2026-09-30T12:00:00.000Z");
    const { source, reads } = sourceReturning(twentyRuns);
    const estimator = new RecentRunsCostEstimator({ source, prices: PRICES, maximumMicros: 300_000, clock: () => now });
    await estimator.estimateMicros(FREE_LOW);
    now = new Date(now.getTime() + 59_999);
    await estimator.estimateMicros(FREE_LOW);
    expect(reads).toHaveLength(1);
    await estimator.estimateMicros(PREMIUM_HIGH);
    expect(reads).toHaveLength(2);
    now = new Date(now.getTime() + 1);
    await estimator.estimateMicros(FREE_LOW);
    expect(reads).toHaveLength(3);
  });

  it("answers the maximum when no price is configured: it cannot price a sample", async () => {
    const { source } = sourceReturning(twentyRuns);
    const estimator = new RecentRunsCostEstimator({ source, prices: new Map(), maximumMicros: 300_000 });
    await expect(estimator.estimateMicros(FREE_LOW)).resolves.toBe(300_000);
  });

  it("keys a class by its four parts and refuses one it cannot key", () => {
    expect(settingsClassKey(FREE_LOW)).toBe("free|low|2|1");
    expect(() => settingsClassKey({ ...FREE_LOW, makerCount: 0 })).toThrow(TypeError);
    expect(() => settingsClassKey({ ...FREE_LOW, planTier: "gold" as never })).toThrow(TypeError);
  });
});
