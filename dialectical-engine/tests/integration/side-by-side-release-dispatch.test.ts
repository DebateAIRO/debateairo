import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresRunReleaseLookup, ReleaseNotServedError, ReleaseRoutedDispatcher, createReleaseNotServedAlert } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore, costEnvelopeDay } from "@debateai/budget";
import { RunRepository, createPool, migrate, recordReleaseEvent, recordReleaseSwitch, recordSpendWaiver } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side spec §2, §4, §9 (plan C task C4), over embedded Postgres with 0123: every send is routed by the run's own
 * release, and a retired release's run is never sent. Its never-claimed first job is closed FAILED
 * (RUN_SETUP_FAILED:RELEASE_NOT_SERVED), its waiver written, and the site's counted holds drop by its hold. The
 * dispatcher reads, closes and waives through a login with exactly the API's two memberships (debateai_runtime and
 * debateai_billing_runtime), as main.ts builds it on the runtime pool; the superuser pool only arranges rows (the
 * release events, the runs, their holds). Only the job system is a stand-in. CI skips this directory; run it alone.
 */
const R16 = ["r16", "0123456789ab"].join("-");
const R17 = ["r17", "0123456789ab"].join("-");
const BASE = "dialectical-run";
const BY = "test:side-by-side-release-dispatch";

let database: TestDatabase;
let api: Pool;

function login(name: string): Pool {
  const url = new URL(database.connectionString);
  url.username = name;
  url.password = ["private", "fixture", name].join("-");
  return createPool(url.toString());
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(
    `CREATE ROLE release_dispatch_api LOGIN PASSWORD '${["private", "fixture", "release_dispatch_api"].join("-")}' IN ROLE debateai_runtime,debateai_billing_runtime`
  );
  api = login("release_dispatch_api");
  // r16 CURRENT, then r17 CURRENT (r16 now DRAINING), then r16 RETIRED.
  for (const [key, expectedCurrent] of [[R16, null], [R17, R16]] as const) {
    await recordReleaseEvent(database.pool, { releaseKey: key, kind: "STAGED", recordedBy: BY });
    await recordReleaseSwitch(database.pool, { newReleaseKey: key, expectedCurrent, takeTrafficFrom: new Date(), recordedBy: BY });
  }
  await recordReleaseEvent(database.pool, { releaseKey: R16, kind: "RETIRED", recordedBy: BY });
}, 600_000);

afterEach(() => { vi.restoreAllMocks(); });

afterAll(async () => {
  await api?.end();
  await database?.stop();
});

/** A run stamped with `releaseKey`, its first job READY, and its open hold. */
async function startedRun(releaseKey: string, heldMicros: number): Promise<Readonly<{ runId: string; workItemId: string }>> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: "Is a retired release's debate ever sent?",
    principal: { kind: "legacy", legacyAskerId: `release-dispatch:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test",
    askContract: {}, batteryRows: [], releaseKey
  });
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `S00:${runId}:Q1`
  });
  await new PostgresModelSpendStore(database.pool).openHold(database.pool, { runId, heldMicros });
  return { runId, workItemId };
}

async function jobRow(workItemId: string) {
  return (await database.pool.query<{ state: string; terminal_reason: string | null }>(
    "SELECT state, terminal_reason FROM core.work_item WHERE work_item_id = $1", [workItemId]
  )).rows[0];
}

async function waivers(runId: string) {
  return (await database.pool.query<{ run_id: string; reason: string }>(
    "SELECT run_id, reason FROM ledger.model_spend_waiver WHERE run_id = $1", [runId]
  )).rows;
}

function routedDispatcher() {
  const sent: string[] = [];
  const alerts: string[] = [];
  const dispatcher = new ReleaseRoutedDispatcher({
    client: { runNoWait: async (name: string) => { sent.push(name); return undefined as never; } },
    workflowName: BASE,
    hosted: true,
    lookup: new PostgresRunReleaseLookup(api),
    work: new WorkItemRepository(api),
    waive: async (runId) => { await recordSpendWaiver(api, runId, "RELEASE_NOT_SERVED"); },
    alert: createReleaseNotServedAlert({ write: (line) => alerts.push(line) })
  });
  return { dispatcher, sent, alerts };
}

describe("every send is routed by the run's own release (side-by-side C4)", () => {
  it("the lookup reads the run's key, its release's state and whether any release is current, as the API's login", async () => {
    const r16 = await startedRun(R16, 1);
    const lookup = new PostgresRunReleaseLookup(api);
    expect(await lookup.lookup(r16.runId)).toEqual({
      releaseKey: R16, state: { state: "RETIRED", frontPairStopped: false, retireRequested: false }, anyCurrent: true
    });
    expect(await lookup.lookup(randomUUID())).toBeNull();
    await database.pool.query(
      "UPDATE core.work_item SET state = 'FAILED', terminal_reason = 'TEST_LAYER:RELEASE_DISPATCH_CLEARED' WHERE work_item_id = $1",
      [r16.workItemId]
    );
  });

  it("never sends a retired release's run: its job FAILED, one waiver, the site's counted holds drop by its hold", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const today = costEnvelopeDay(new Date());
    const before = await store.readSiteCountedHoldsMicros(today);
    const r16 = await startedRun(R16, 700);
    expect(await store.readSiteCountedHoldsMicros(today)).toBe(before + 700);
    const { dispatcher, sent, alerts } = routedDispatcher();
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const refusal = await dispatcher.dispatch(r16).then(() => null, (error: unknown) => error);
    expect(refusal).toBeInstanceOf(ReleaseNotServedError);
    expect(refusal).toMatchObject({ code: "RELEASE_NOT_SERVED", runId: r16.runId, releaseKey: R16, closed: true });
    expect(sent).toEqual([]);
    expect(await jobRow(r16.workItemId)).toEqual({ state: "FAILED", terminal_reason: "RUN_SETUP_FAILED:RELEASE_NOT_SERVED" });
    expect(await waivers(r16.runId)).toEqual([{ run_id: r16.runId, reason: "RELEASE_NOT_SERVED" }]);
    expect(await store.readSiteCountedHoldsMicros(today)).toBe(before);
    expect(alerts).toEqual([`DEBATEAI_RELEASE_NOT_SERVED {"releaseKey":"${R16}","state":"RETIRED"}`]);
    expect(logged.mock.calls.map(([line]) => JSON.parse(String(line)))).toEqual([{
      event: "api.dispatch.release_not_served", runId: r16.runId, releaseKey: R16, state: "RETIRED", closed: true
    }]);

    // A second send of the same run closes nothing more and writes no second waiver.
    const again = await dispatcher.dispatch(r16).then(() => null, (error: unknown) => error);
    expect(again).toMatchObject({ code: "RELEASE_NOT_SERVED", closed: false });
    expect(await waivers(r16.runId)).toHaveLength(1);
  });

  it("sends the current release's run to its own task name, and its job stays READY", async () => {
    const r17 = await startedRun(R17, 500);
    const { dispatcher, sent, alerts } = routedDispatcher();
    await expect(dispatcher.dispatch(r17)).resolves.toBeUndefined();
    expect(sent).toEqual(["dialectical-run-r17-0123456789ab"]);
    expect(await jobRow(r17.workItemId)).toEqual({ state: "READY", terminal_reason: null });
    expect(await waivers(r17.runId)).toEqual([]);
    expect(alerts).toEqual([]);
  });
});
