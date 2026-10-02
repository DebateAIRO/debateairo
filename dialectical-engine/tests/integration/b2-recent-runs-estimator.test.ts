import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresRecentRunUsageSource, RecentRunsCostEstimator, type RunSettingsClass } from "@debateai/budget";
import { RunRepository, migrate, type DiscoveredPanelMember } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Budget spec §2.5 — the SAMPLE the estimate is read from, in real SQL: the last
 * N runs of one settings class that settled inside the window, and every RUN
 * and STORY charge of each, re-priced at today's prices.
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

type RunShape = Readonly<{
  depth?: number;
  planTier?: "free" | "premium";
  makers?: number;
  panel?: readonly DiscoveredPanelMember[];
  compositionBudgetTier?: "low" | "medium" | "high";
}>;

async function run(shape: RunShape = {}): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Does a sample run price itself at today's prices?",
    principal: { kind: "legacy", legacyAskerId: `estimator:${randomUUID()}` },
    sessionId: randomUUID(),
    callerScope: "ASKER",
    asOf: new Date(),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "asker:test",
    compositionBudgetTier: shape.compositionBudgetTier ?? "low",
    planTier: shape.planTier ?? "free",
    depthParams: { depth: shape.depth ?? 1 },
    discoveredPanel: shape.panel ?? fixtureDiscoveredPanel(shape.makers ?? 2),
    strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4),
    registerVersion: 1,
    batteryVersion: "test",
    askContract: {},
    batteryRows: []
  });
}

async function job(runId: string, finish: "DONE" | "FAILED" | "READY"): Promise<void> {
  const work = new WorkItemRepository(database.pool);
  const workItemId = await work.enqueue({ runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, nodeSet: [] });
  if (finish === "DONE") await work.settle({ workItemId, attemptId: randomUUID(), artifactRef: randomUUID() });
  if (finish === "FAILED") {
    await work.recordSetupFailure({ runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, reason: "TEST_FAILED" });
  }
}

async function spend(input: Readonly<{
  runId: string; source?: "RUN" | "STORY"; providerRef?: string;
  inputTokens?: number; outputTokens?: number; recordedAt: Date;
}>): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.model_spend
       (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens, recorded_at)
     VALUES ($1,$2,$3,$4,$5::date,1,$6,$7,$8)`,
    [randomUUID(), input.source ?? "RUN", input.runId, input.providerRef ?? "provider:cheap",
      input.recordedAt.toISOString().slice(0, 10), input.inputTokens ?? 1, input.outputTokens ?? 1, input.recordedAt]
  );
}

const HOUR = 3_600_000;

describe("B2 the recent-runs sample (budget spec §2.5)", () => {
  it("samples only settled runs of the same class whose last charge is inside the window, newest first", async () => {
    const now = new Date();
    const cls: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "low", makerCount: 2, depth: 1 });
    const sampled: string[] = [];
    for (const hoursAgo of [26, 25, 24]) {
      const runId = await run();
      await job(runId, "DONE");
      await spend({ runId, recordedAt: new Date(now.getTime() - hoursAgo * HOUR) });
      sampled.unshift(runId);
    }
    const noise: Array<[RunShape, "DONE" | "FAILED" | "READY" | null, number]> = [
      [{ depth: 2 }, "DONE", 1],
      [{ planTier: "premium" }, "DONE", 1],
      [{ makers: 3 }, "DONE", 1],
      [{}, "READY", 1],
      [{}, "FAILED", 1],
      [{}, "DONE", 31 * 24],
      [{}, null, 1]
    ];
    for (const [shape, finish, hoursAgo] of noise) {
      const runId = await run(shape);
      if (finish !== null) await job(runId, finish);
      await spend({ runId, recordedAt: new Date(now.getTime() - hoursAgo * HOUR) });
    }

    const read = await new PostgresRecentRunUsageSource(database.pool).readRecentRunUsage({
      settings: cls, since: new Date(now.getTime() - 30 * 24 * HOUR), limit: 20
    });
    expect(read.map((sample) => sample.runId)).toEqual(sampled);
  });

  it("limits the sample to the newest N and prices RUN and STORY charges at today's prices", async () => {
    const now = new Date();
    const cls: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "medium", makerCount: 2, depth: 1 });
    for (let k = 1; k <= 21; k += 1) {
      const runId = await run({ compositionBudgetTier: "medium" });
      await job(runId, "DONE");
      const recordedAt = new Date(now.getTime() - (22 - k) * 60_000);
      // k × 10 000 input tokens at 0.1 USD / million = k × 1 000 micro-units …
      await spend({ runId, inputTokens: k * 10_000, outputTokens: 0, recordedAt });
      // … and a story on a vendor no longer configured: 100 output tokens at the highest output price (0.5 USD / million) = 50.
      await spend({ runId, source: "STORY", providerRef: "provider:gone", inputTokens: 0, outputTokens: 100, recordedAt });
    }
    const estimator = new RecentRunsCostEstimator({
      source: new PostgresRecentRunUsageSource(database.pool),
      prices: new Map([["provider:cheap", { inputMicrosPerMillionTokens: 100_000, outputMicrosPerMillionTokens: 500_000 }]]),
      maximumMicros: 300_000,
      clock: () => now
    });
    // The newest 20 are k = 2 … 21; rank 15 of those is k = 16: 16 000 + 50.
    await expect(estimator.estimateMicros(cls)).resolves.toBe(16_050);
  });

  it("counts a panel's MODELS, so two models of one maker are still the class of a two-model roster", async () => {
    const now = new Date();
    // The ask side counts PLAN_TIER_ROSTERS[tier].length (models); the stored side must count the same.
    const cls: RunSettingsClass = Object.freeze({ planTier: "free", compositionBudgetTier: "high", makerCount: 2, depth: 1 });
    const oneMaker = fixtureDiscoveredPanel(2).map((member) => Object.freeze({ ...member, maker: "maker:shared" }));
    const runId = await run({ compositionBudgetTier: "high", panel: oneMaker });
    await job(runId, "DONE");
    await spend({ runId, recordedAt: new Date(now.getTime() - HOUR) });
    const read = await new PostgresRecentRunUsageSource(database.pool).readRecentRunUsage({
      settings: cls, since: new Date(now.getTime() - 24 * HOUR), limit: 20
    });
    expect(read.map((sample) => sample.runId)).toEqual([runId]);
  });
});
