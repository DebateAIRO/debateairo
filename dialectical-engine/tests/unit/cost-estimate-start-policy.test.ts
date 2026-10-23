import { describe, expect, it } from "vitest";
import {
  RecentRunsCostEstimator,
  estimateFromSampleCosts,
  type ProviderTargetPrice,
  type RecentRunUsage,
  type RecentRunUsageSource,
  type RunSettingsClass
} from "@debateai/budget";
import {
  loadBootstrapRegister,
  COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW,
  COST_ESTIMATE_START_POLICY_ROW_KEY,
  costEstimateStartPolicyFromValue,
  readCostEstimateStartPolicy
} from "@debateai/register";
import { buildDevelopmentDeploymentRegisterPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";

/**
 * Owner rulings 2026-10-22 (fresh-site estimate): with fewer than `min_samples` (5) settled runs of a class, the
 * estimate is the sealed starting figure of the ask's depth (depth 1 $0.30, 2 $0.60, 3 $1.00), capped at the run's
 * maximum; depths without a figure answer the maximum; 5 or more answer the 75th percentile. A register version
 * WITHOUT the row answers exactly as before (20 samples, the maximum while short).
 */

/** The preview's run maximum: per-run $3.00 × 1.2 plus story $0.05 × 1.2. */
const PREVIEW_MAXIMUM = 3_660_000;
const PRICE: ProviderTargetPrice = Object.freeze({ inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 0 });
const PRICES = new Map<string, ProviderTargetPrice>([["provider:cheap", PRICE]]);
const POLICY = costEstimateStartPolicyFromValue(
  COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.value, COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
);
const classAt = (depth: number): RunSettingsClass =>
  Object.freeze({ planTier: "premium", compositionBudgetTier: "low", makerCount: 5, depth });

/** Run k (1…n) costs k × 10 000 micro-units at the cheap price (k × 100 000 input tokens at 0.1 USD per million). */
function runs(count: number): ReadonlyArray<RecentRunUsage> {
  return Array.from({ length: count }, (_, index) => Object.freeze({
    runId: `run:${index + 1}`,
    charges: Object.freeze([Object.freeze({ providerRef: "provider:cheap", inputTokens: (index + 1) * 100_000, outputTokens: 0 })])
  }));
}
function sourceOf(sample: ReadonlyArray<RecentRunUsage>): RecentRunUsageSource & { limits: number[] } {
  const limits: number[] = [];
  return {
    limits,
    readRecentRunUsage: async (input) => {
      limits.push(input.limit);
      return sample.slice(0, input.limit);
    }
  };
}

describe("costEstimateStartPolicy: the sealed row", () => {
  it("is code-owned with the owner's values: 5 samples, $0.30 / $0.60 / $1.00 for depths 1-3, in USD micro-units", () => {
    expect(COST_ESTIMATE_START_POLICY_ROW_KEY).toBe("costEstimateStartPolicy");
    expect(COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.rowKey).toBe(COST_ESTIMATE_START_POLICY_ROW_KEY);
    expect(COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.value).toEqual({
      kind: "COST_ESTIMATE_START_POLICY",
      currency: "USD",
      minor_units_per_unit: 1_000_000,
      min_samples: 5,
      start_micros_by_depth: { "1": 300_000, "2": 600_000, "3": 1_000_000 }
    });
    expect(Object.isFrozen(COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.value)).toBe(true);
    expect(POLICY.minSamples).toBe(5);
    expect([...POLICY.startMicrosByDepth]).toEqual([[1, 300_000], [2, 600_000], [3, 1_000_000]]);
  });

  it("is sealed by every hosted composition (the hosted publish reuses it), never by a local one", async () => {
    const bootstrap = await loadBootstrapRegister();
    const hosted = await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, TEST_DEVELOPMENT_PROVIDER_PANEL, undefined, "hosted");
    const sealed = hosted.filter((row) => row.rowKey === COST_ESTIMATE_START_POLICY_ROW_KEY);
    expect(sealed).toHaveLength(1);
    expect(sealed[0]!.sourceRef).toBe(COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef);
    expect(JSON.parse(sealed[0]!.valueJsonText)).toEqual(COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.value);
    const local = await buildDevelopmentDeploymentRegisterPublicationRows(bootstrap, TEST_DEVELOPMENT_PROVIDER_PANEL);
    expect(local.map((row) => row.rowKey)).not.toContain(COST_ESTIMATE_START_POLICY_ROW_KEY);
    expect(hosted.length - local.length).toBe(2); // this row and the story's money row
  });

  it("refuses a value outside its bounds by name", () => {
    const base = COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.value;
    const refused = (value: unknown, sourceRef = "test") =>
      expect(() => costEstimateStartPolicyFromValue(value, sourceRef)).toThrow(expect.objectContaining({ code: "COST_ESTIMATE_START_POLICY_INVALID" }));
    refused({ ...base, kind: "COST_ENVELOPE_POLICY" });
    refused({ ...base, currency: "EUR" });
    refused({ ...base, minor_units_per_unit: 100 });
    refused({ ...base, min_samples: 0 });
    refused({ ...base, min_samples: 21 });
    refused({ ...base, min_samples: 4.5 });
    refused({ ...base, start_micros_by_depth: { "0": 1 } });
    refused({ ...base, start_micros_by_depth: { "6": 1 } });
    refused({ ...base, start_micros_by_depth: { "1": 0 } });
    refused({ ...base, start_micros_by_depth: { "1": 1.5 } });
    refused({ ...base, start_micros_by_depth: { "1": 50_000_001 } });
    refused({ ...base, extra: true });
    refused(null);
    refused(base, " ");
    // The bounds' own edges are lawful; an empty map leaves every depth on the maximum.
    expect(costEstimateStartPolicyFromValue({ ...base, min_samples: 1, start_micros_by_depth: { "5": 50_000_000 } }, "test").minSamples).toBe(1);
    expect(costEstimateStartPolicyFromValue({ ...base, min_samples: 20, start_micros_by_depth: {} }, "test").startMicrosByDepth.size).toBe(0);
  });

  it("reads null at a version without the row, and refuses a malformed sealed row", async () => {
    const pool = (rows: unknown[]) => ({ query: async () => ({ rows }) }) as never;
    await expect(readCostEstimateStartPolicy(pool([]), 18)).resolves.toBeNull();
    await expect(readCostEstimateStartPolicy(pool([{
      value_json: COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.value, source_ref: "sealed"
    }]), 19)).resolves.toMatchObject({ minSamples: 5 });
    await expect(readCostEstimateStartPolicy(pool([{ value_json: { kind: "X" }, source_ref: "sealed" }]), 19))
      .rejects.toMatchObject({ code: "COST_ESTIMATE_START_POLICY_INVALID" });
  });
});

describe("the estimate with the starting figures (owner rulings 2026-10-22)", () => {
  it.each([0, 1, 4])("answers the depth's starting figure with %i settled runs", async (count) => {
    for (const [depth, figure] of [[1, 300_000], [2, 600_000], [3, 1_000_000]] as const) {
      const estimator = new RecentRunsCostEstimator({ source: sourceOf(runs(count)), prices: PRICES, maximumMicros: PREVIEW_MAXIMUM, start: POLICY });
      await expect(estimator.estimateMicros(classAt(depth))).resolves.toBe(figure);
    }
  });

  it("answers the 75th percentile once 5 runs have settled, and still samples up to 20", async () => {
    // 5 runs: 10 000 … 50 000; rank ⌈5 × 75 / 100⌉ = 4 → 40 000.
    const five = sourceOf(runs(5));
    await expect(new RecentRunsCostEstimator({ source: five, prices: PRICES, maximumMicros: PREVIEW_MAXIMUM, start: POLICY })
      .estimateMicros(classAt(1))).resolves.toBe(40_000);
    expect(five.limits).toEqual([20]);
    // 20 runs: 10 000 … 200 000; rank 15 → 150 000.
    await expect(new RecentRunsCostEstimator({ source: sourceOf(runs(25)), prices: PRICES, maximumMicros: PREVIEW_MAXIMUM, start: POLICY })
      .estimateMicros(classAt(1))).resolves.toBe(150_000);
  });

  it("answers the maximum for a depth with no figure (4, 5)", async () => {
    for (const depth of [4, 5]) {
      const estimator = new RecentRunsCostEstimator({ source: sourceOf(runs(2)), prices: PRICES, maximumMicros: PREVIEW_MAXIMUM, start: POLICY });
      await expect(estimator.estimateMicros(classAt(depth))).resolves.toBe(PREVIEW_MAXIMUM);
    }
  });

  it("caps the figure at the run's maximum, and keeps the maximum when nothing can be priced", async () => {
    await expect(new RecentRunsCostEstimator({ source: sourceOf([]), prices: PRICES, maximumMicros: 500_000, start: POLICY })
      .estimateMicros(classAt(3))).resolves.toBe(500_000);
    await expect(new RecentRunsCostEstimator({ source: sourceOf([]), prices: new Map(), maximumMicros: PREVIEW_MAXIMUM, start: POLICY })
      .estimateMicros(classAt(1))).resolves.toBe(PREVIEW_MAXIMUM);
  });

  it("refuses a minimum above the sample size", () => {
    expect(() => new RecentRunsCostEstimator({
      source: sourceOf([]), prices: PRICES, maximumMicros: PREVIEW_MAXIMUM, sampleSize: 4, start: POLICY
    })).toThrow("COST_ESTIMATE_OPTIONS_INVALID");
  });

  it("without the row answers exactly as before: the maximum until 20 runs have settled", async () => {
    for (const start of [undefined, null]) {
      const nineteen = new RecentRunsCostEstimator({ source: sourceOf(runs(19)), prices: PRICES, maximumMicros: PREVIEW_MAXIMUM, ...(start === undefined ? {} : { start }) });
      await expect(nineteen.estimateMicros(classAt(1))).resolves.toBe(PREVIEW_MAXIMUM);
      const twenty = new RecentRunsCostEstimator({ source: sourceOf(runs(20)), prices: PRICES, maximumMicros: PREVIEW_MAXIMUM, ...(start === undefined ? {} : { start }) });
      await expect(twenty.estimateMicros(classAt(1))).resolves.toBe(150_000);
    }
  });

  it("estimateFromSampleCosts: a short sample answers the starting figure (capped, at least one micro) or the maximum", () => {
    const base = { sampleSize: 20, maximumMicros: 300_000 } as const;
    expect(estimateFromSampleCosts({ ...base, costs: [1, 2, 3, 4], minSamples: 5, startMicros: 100_000 })).toBe(100_000);
    expect(estimateFromSampleCosts({ ...base, costs: [1, 2, 3, 4], minSamples: 5, startMicros: 900_000 })).toBe(300_000);
    expect(estimateFromSampleCosts({ ...base, costs: [1, 2, 3, 4], minSamples: 5, startMicros: null })).toBe(300_000);
    expect(estimateFromSampleCosts({ ...base, costs: [10, 20, 30, 40, 50], minSamples: 5, startMicros: 100_000 })).toBe(40);
    expect(estimateFromSampleCosts({ ...base, costs: [10, 20, 30, 40, 50] })).toBe(300_000);
    expect(() => estimateFromSampleCosts({ ...base, costs: [], minSamples: 21 })).toThrow("COST_ESTIMATE_SAMPLE_SIZE_INVALID");
    expect(() => estimateFromSampleCosts({ ...base, costs: [], minSamples: 5, startMicros: 0 })).toThrow("COST_ESTIMATE_START_INVALID");
  });
});
