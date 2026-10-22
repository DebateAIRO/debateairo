import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { WorkItemRepository } from "@debateai/battery";
import { RunRepository, createPool, migrate, recordReleaseEvent, recordReleaseSwitch } from "@debateai/db";
import { postgresRunnerRetirementStore } from "../../apps/runner/src/runner-retirement.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side spec §4: a draining release's runner retires once, "in one database transaction", its release is
 * DRAINING, its front pair stopped and no READY or CLAIMED item of it is left. Over embedded Postgres, read as a
 * principal with exactly the live runner principal's one membership (debateai_runtime); the superuser pool only
 * arranges rows (the switch, the release events, a FAILED item). The cases run in order on one database; each name
 * states what it expects. CI skips this directory; run it before merging.
 */
const R1 = ["r1", "aaaaaaaaaaaa"].join("-");
const R2 = ["r2", "bbbbbbbbbbbb"].join("-");
const R9 = ["r9", "999999999999"].join("-");
const BY = "test:runner-retirement-store";

let database: TestDatabase;
let runtime: Pool;
let r1Item: string;

/** A run stamped with `releaseKey` and its first job READY. */
async function runWithJob(releaseKey: string): Promise<string> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: "Does a drained release switch itself off?",
    principal: { kind: "legacy", legacyAskerId: `retire:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test",
    askContract: {}, batteryRows: [], releaseKey
  });
  return new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `S00:${runId}:Q1`
  });
}

const store = (releaseKey: string) => postgresRunnerRetirementStore(runtime, { releaseKey, workerId: "worker:retire" });

describe("the retirement facts, read in one snapshot as the runner principal", () => {
  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    await database.pool.query("CREATE ROLE retire_runner_runtime LOGIN PASSWORD 'retire-runner-private-fixture-only' IN ROLE debateai_runtime");
    const url = new URL(database.connectionString);
    url.username = "retire_runner_runtime";
    url.password = "retire-runner-private-fixture-only";
    runtime = createPool(url.toString());

    for (const [key, expectedCurrent] of [[R1, null], [R2, R1]] as const) {
      await recordReleaseEvent(database.pool, { releaseKey: key, kind: "STAGED", recordedBy: BY });
      await recordReleaseSwitch(database.pool, { newReleaseKey: key, expectedCurrent, takeTrafficFrom: new Date(), recordedBy: BY });
    }
    await recordReleaseEvent(database.pool, { releaseKey: R1, kind: "FRONT_PAIR_STOPPED", recordedBy: BY });
    r1Item = await runWithJob(R1);
    await runWithJob(R2);
  }, 600_000);

  afterAll(async () => {
    await runtime?.end();
    await database?.stop();
  });

  it("r1 is draining, its pair stopped, one item open", async () => {
    const facts = await store(R1).readFacts(R1);
    expect(facts).toEqual({ state: "DRAINING", frontPairStopped: true, retireRequested: false, openWork: 1 });
    expect(Object.isFrozen(facts)).toBe(true);
  });

  it("r1 has no open work once its item is FAILED", async () => {
    await database.pool.query(
      "UPDATE core.work_item SET state = 'FAILED', terminal_reason = 'TEST_LAYER:RETIREMENT_STORE' WHERE work_item_id = $1", [r1Item]
    );
    expect(await store(R1).readFacts(R1)).toEqual({ state: "DRAINING", frontPairStopped: true, retireRequested: false, openWork: 0 });
  });

  it("r2 is current with its own item open (r1's items never count for it)", async () => {
    expect(await store(R2).readFacts(R2)).toEqual({ state: "CURRENT", frontPairStopped: false, retireRequested: false, openWork: 1 });
  });

  it("a release never recorded reads state null, no flags, no work", async () => {
    expect(await store(R9).readFacts(R9)).toEqual({ state: null, frontPairStopped: false, retireRequested: false, openWork: 0 });
  });

  it("r1 reads the retire request once root records it", async () => {
    await recordReleaseEvent(database.pool, { releaseKey: R1, kind: "RETIRE_REQUESTED", recordedBy: BY });
    expect(await store(R1).readFacts(R1)).toEqual({ state: "DRAINING", frontPairStopped: true, retireRequested: true, openWork: 0 });
  });
});
