import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunCostSubstitutionRepository, RunRepository, migrate } from "../../packages/db/src/index.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * R-2: `RunCostSubstitutionRepository` is the one writer of
 * `core.run_cost_substitution` (B3's table, 0081). B8 records the interim roster
 * swap with it; B9c records the runner's cheaper-model calls with it and keeps
 * its own case (the describe block B9c appends to tests/integration/database.test.ts).
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

async function createRun(): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Which roster did this run use?",
    principal: { kind: "legacy", legacyAskerId: `test:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 0, envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1,
    batteryVersion: "test", askContract: {}, batteryRows: []
  });
}

describe("the interim coarse fit's owner record (core.run_cost_substitution, 0081)", () => {
  it("records a roster swap for a run with reason PERSON, content-free, and lists it back", async () => {
    const runId = await createRun();
    const repository = new RunCostSubstitutionRepository(database.pool);
    const recordedAt = new Date("2026-09-29T12:00:00.000Z");
    const substitutionId = await repository.record({
      runId, callSiteKey: "ASK:roster", plannedProviderRef: "roster:premium", usedProviderRef: "roster:free",
      reason: "PERSON", recordedAt
    });
    expect(substitutionId).toMatch(/^[0-9a-f-]{36}$/u);
    const rows = await database.pool.query(
      "SELECT call_site_key, planned_provider_ref, used_provider_ref, reason FROM core.run_cost_substitution WHERE run_id=$1",
      [runId]
    );
    expect(rows.rows).toEqual([{
      call_site_key: "ASK:roster", planned_provider_ref: "roster:premium", used_provider_ref: "roster:free", reason: "PERSON"
    }]);
    expect(await repository.listForRun(runId)).toEqual([{
      substitutionId, runId, callSiteKey: "ASK:roster", plannedProviderRef: "roster:premium",
      usedProviderRef: "roster:free", reason: "PERSON", recordedAt
    }]);
  });

  it("refuses a record that is not a substitution, before the database does", async () => {
    const repository = new RunCostSubstitutionRepository(database.pool);
    const runId = await createRun();
    const valid = {
      runId, callSiteKey: "ASK:roster", plannedProviderRef: "roster:premium", usedProviderRef: "roster:free",
      reason: "PERSON" as const, recordedAt: new Date()
    };
    await expect(repository.record({ ...valid, reason: "OTHER" as never })).rejects.toThrowError("RUN_COST_SUBSTITUTION_INVALID");
    await expect(repository.record({ ...valid, usedProviderRef: "roster:premium" })).rejects.toThrowError("RUN_COST_SUBSTITUTION_INVALID");
    await expect(repository.record({ ...valid, callSiteKey: " " })).rejects.toThrowError("RUN_COST_SUBSTITUTION_INVALID");
    await expect(repository.listForRun(runId)).resolves.toEqual([]);
  });

  it("lists one run's substitutions in the order they happened, and no other run's (B9c's report reads this)", async () => {
    const repository = new RunCostSubstitutionRepository(database.pool);
    const runId = await createRun();
    const otherRunId = await createRun();
    const earlier = new Date("2026-09-29T12:01:00.000Z");
    const later = new Date("2026-09-29T12:05:00.000Z");
    const moved = { plannedProviderRef: "provider:planned", usedProviderRef: "provider:cheaper" } as const;
    // Written out of time order, so the list's order comes from recorded_at, not from insertion.
    await repository.record({ runId, callSiteKey: "BODY:late", ...moved, reason: "RUN_ARGUING", recordedAt: later });
    await repository.record({ runId, callSiteKey: "BODY:early", ...moved, reason: "SITE_DAY", recordedAt: earlier });
    await repository.record({ runId: otherRunId, callSiteKey: "BODY:other", ...moved, reason: "PERSON", recordedAt: earlier });
    expect((await repository.listForRun(runId)).map((row) => [row.callSiteKey, row.reason, row.recordedAt]))
      .toEqual([["BODY:early", "SITE_DAY", earlier], ["BODY:late", "RUN_ARGUING", later]]);
    expect((await repository.listForRun(otherRunId)).map((row) => row.callSiteKey)).toEqual(["BODY:other"]);
    await expect(repository.listForRun(randomUUID())).resolves.toEqual([]);
  });

  it("writes inside the caller's transaction: rolled back with it, committed with it (B8's room path)", async () => {
    const repository = new RunCostSubstitutionRepository(database.pool);
    const runId = await createRun();
    const input = {
      runId, callSiteKey: "ASK:roster", plannedProviderRef: "roster:premium", usedProviderRef: "roster:free",
      reason: "PERSON" as const, recordedAt: new Date("2026-09-29T12:00:00.000Z")
    };
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await repository.record(input, client);
      await client.query("ROLLBACK");
      await expect(repository.listForRun(runId)).resolves.toEqual([]);
      await client.query("BEGIN");
      const substitutionId = await repository.record(input, client);
      // Not visible outside the transaction until it commits.
      await expect(repository.listForRun(runId)).resolves.toEqual([]);
      await client.query("COMMIT");
      expect((await repository.listForRun(runId)).map((row) => row.substitutionId)).toEqual([substitutionId]);
    } finally {
      client.release();
    }
  });
});
