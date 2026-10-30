import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  BUDGET_WALL_STOP_KINDS,
  BUDGET_WALL_STOP_REASONS,
  PostgresRecentRunUsageSource,
  RecentRunsCostEstimator,
  type ProviderTargetPrice,
  type RecentRunUsage,
  type RecentRunUsageSource,
  type RunSettingsClass
} from "@debateai/budget";
import { SERVE_DISCLOSURE_BODY_STOPS, SERVE_DISCLOSURE_SERVE_STOPS } from "@debateai/db";
import { COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW, costEstimateStartPolicyFromValue } from "@debateai/register";
import { ENVELOPE_STOP_CODES, ENVELOPE_STOP_REASONS } from "../../apps/runner/src/index.js";

/**
 * NV-49 (security audit run 3) — ONE OWNER CANNOT SET A CLASS'S ESTIMATE. The estimator reads at most one run per owner
 * (the module's MAX_SAMPLES_PER_OWNER), and the sample leaves out every run a DAILY or ALLOWANCE wall stopped, by the
 * runner's condition-mark reason or by the disclosure row's stop kind. The cap is code, never a register member: an
 * older release's strict start schema would refuse one at boot. The SQL itself is proven in
 * tests/integration/b2-recent-runs-estimator.test.ts.
 */
const CLASS: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1 });
const PRICES = new Map<string, ProviderTargetPrice>([
  ["provider:cheap", Object.freeze({ inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 500_000 })]
]);
const POLICY = costEstimateStartPolicyFromValue(
  COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.value, COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
);

function recordingSource(): RecentRunUsageSource & { reads: Array<Parameters<RecentRunUsageSource["readRecentRunUsage"]>[0]> } {
  const reads: Array<Parameters<RecentRunUsageSource["readRecentRunUsage"]>[0]> = [];
  return {
    reads,
    readRecentRunUsage: async (input): Promise<ReadonlyArray<RecentRunUsage>> => {
      reads.push(input);
      return [];
    }
  };
}

function fakePool(): { pool: Pool; values: unknown[][] } {
  const values: unknown[][] = [];
  const pool = {
    query: async (_text: string, params: unknown[]) => {
      values.push(params);
      return { rows: [] };
    }
  } as unknown as Pool;
  return { pool, values };
}

describe("NV-49 the estimator reads one run per owner", () => {
  it("passes maxPerOwner 1 on every read, without a start policy and with the sealed one", async () => {
    for (const start of [null, POLICY]) {
      const source = recordingSource();
      const now = new Date("2026-10-28T12:00:00.000Z");
      const estimator = new RecentRunsCostEstimator({ source, prices: PRICES, maximumMicros: 300_000, clock: () => now, start });
      await estimator.estimateMicros(CLASS);
      await estimator.estimateMicros({ ...CLASS, depth: 2 });
      expect(source.reads).toHaveLength(2);
      for (const read of source.reads) expect(read.maxPerOwner).toBe(1);
    }
  });
});

describe("NV-49 the wall stops the sample leaves out", () => {
  it("are the runner's DAILY and ALLOWANCE condition-mark reasons", () => {
    expect(BUDGET_WALL_STOP_REASONS).toEqual([ENVELOPE_STOP_REASONS.DAILY, ENVELOPE_STOP_REASONS.ALLOWANCE]);
    expect(Object.isFrozen(BUDGET_WALL_STOP_REASONS)).toBe(true);
  });

  it("are the runner's DAILY and ALLOWANCE stop kinds, as the disclosure row stores them", () => {
    expect(BUDGET_WALL_STOP_KINDS).toEqual([
      ENVELOPE_STOP_CODES.DAILY_COST_ENVELOPE_REACHED,
      ENVELOPE_STOP_CODES.PERSON_ALLOWANCE_REACHED
    ]);
    expect(BUDGET_WALL_STOP_KINDS).toEqual(["DAILY", "ALLOWANCE"]);
    expect(Object.isFrozen(BUDGET_WALL_STOP_KINDS)).toBe(true);
  });

  it("are stop kinds both of the disclosure row's stop columns admit", () => {
    expect(BUDGET_WALL_STOP_KINDS.length).toBeGreaterThan(0);
    for (const kind of BUDGET_WALL_STOP_KINDS) {
      expect(SERVE_DISCLOSURE_BODY_STOPS as readonly string[]).toContain(kind);
      expect(SERVE_DISCLOSURE_SERVE_STOPS as readonly string[]).toContain(kind);
    }
  });
});

describe("NV-49 the Postgres sample reader", () => {
  const since = new Date("2026-09-28T12:00:00.000Z");

  it("refuses a per-owner cap that is not a whole number from 1 to the sample size", async () => {
    for (const maxPerOwner of [0, 1.5, 21]) {
      const { pool, values } = fakePool();
      await expect(new PostgresRecentRunUsageSource(pool).readRecentRunUsage({ settings: CLASS, since, limit: 20, maxPerOwner }))
        .rejects.toThrow("COST_ESTIMATE_SAMPLE_SIZE_INVALID");
      expect(values).toEqual([]);
    }
  });

  it("sends one run per owner and the wall stops as $11..$13 by default", async () => {
    const { pool, values } = fakePool();
    await new PostgresRecentRunUsageSource(pool).readRecentRunUsage({ settings: CLASS, since, limit: 20 });
    expect(values).toHaveLength(1);
    expect(values[0]!.slice(10)).toEqual([
      1,
      ["DAILY_COST_ENVELOPE_REACHED", "PERSON_ALLOWANCE_REACHED"],
      ["DAILY", "ALLOWANCE"]
    ]);
  });

  it("sends a cap the caller passes", async () => {
    const { pool, values } = fakePool();
    await new PostgresRecentRunUsageSource(pool).readRecentRunUsage({ settings: CLASS, since, limit: 20, maxPerOwner: 20 });
    expect(values[0]![10]).toBe(20);
  });
});

describe("NV-49 (guard) no register member carries the cap", () => {
  it("leaves the sealed start row as it was, and the start schema still refuses a max_samples_per_owner member", () => {
    expect(Object.keys(COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.value).sort()).toEqual([
      "currency", "kind", "min_samples", "minor_units_per_unit", "start_micros_by_depth"
    ]);
    expect(() => costEstimateStartPolicyFromValue(
      { ...COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.value, max_samples_per_owner: 1 },
      COST_ESTIMATE_START_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    )).toThrow(expect.objectContaining({ code: "COST_ESTIMATE_START_POLICY_INVALID" }));
  });
});
