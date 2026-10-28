import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { PostgresRunReleaseLookup, ReleaseNotServedError, ReleaseRoutedDispatcher, createReleaseNotServedAlert } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore, costEnvelopeDay } from "@debateai/budget";
import { RunRepository, createPool, migrate, recordReleaseEvent, recordReleaseSwitch, recordSpendWaiver } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side spec §2, §4, §9 (plan C task C4), over embedded Postgres with 0123: every send is routed by the run's own
 * release, and a retired release's run is never sent. Its never-claimed first job is closed FAILED
 * (RUN_SETUP_FAILED:RELEASE_NOT_SERVED), its waiver written, and the site's counted holds drop by its hold. The
 * dispatcher reads, closes and waives through a login with exactly the API's two memberships (debateai_runtime and
 * debateai_billing_runtime), as main.ts builds it on the runtime pool — and, since row-level security S01, with that
 * pool's cross-account target, the API's system login (the same roles and the marker role debateai_rls_all_accounts,
 * main.ts's setCrossAccountTarget(pool, systemPool)), which runs every statement made outside a request. The same
 * login with no target sends no account context and sees no run (the last case). The superuser pool only arranges
 * rows (the release events, the runs, their holds). Only the job system is a stand-in. CI skips this directory; run it alone.
 */
const R16 = ["r16", "0123456789ab"].join("-");
const R17 = ["r17", "0123456789ab"].join("-");
const R18 = ["r18", "0123456789ab"].join("-");
const BASE = "dialectical-run";
const BY = "test:side-by-side-release-dispatch";

let database: TestDatabase;
let apiSystem: Pool;
let api: Pool;
let bareApi: Pool;

function login(name: string, crossAccount?: Pool): Pool {
  const url = new URL(database.connectionString);
  url.username = name;
  url.password = ["private", "fixture", name].join("-");
  return createPool(url.toString(), crossAccount === undefined ? {} : { crossAccount });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(
    `CREATE ROLE release_dispatch_api LOGIN PASSWORD '${["private", "fixture", "release_dispatch_api"].join("-")}' IN ROLE debateai_runtime,debateai_billing_runtime`
  );
  apiSystem = createPool(await createSystemTwin(database, "release_dispatch_api_system", ["debateai_runtime", "debateai_billing_runtime"]));
  api = login("release_dispatch_api", apiSystem);
  bareApi = login("release_dispatch_api");
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
  await bareApi?.end();
  await apiSystem?.end();
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
      releaseKey: R16,
      state: { state: "RETIRED", frontPairStopped: false, retireRequested: false, stillDraining: false },
      anyCurrent: true
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

  // Final review A4: a draining release staged again for a rollback reads STAGED, yet its drained debates may run.
  it("sends the run of a draining release staged again for a rollback (STAGED, still draining)", async () => {
    const r17 = await startedRun(R17, 300);
    // r18 becomes current (r17 drains), then a rollback stages r17 again.
    await recordReleaseEvent(database.pool, { releaseKey: R18, kind: "STAGED", recordedBy: BY });
    await recordReleaseSwitch(database.pool, {
      newReleaseKey: R18, expectedCurrent: R17, takeTrafficFrom: new Date(), recordedBy: BY
    });
    await recordReleaseEvent(database.pool, { releaseKey: R17, kind: "STAGED", recordedBy: BY });
    expect(await new PostgresRunReleaseLookup(api).lookup(r17.runId)).toEqual({
      releaseKey: R17,
      state: { state: "STAGED", frontPairStopped: false, retireRequested: false, stillDraining: true },
      anyCurrent: true
    });
    const { dispatcher, sent, alerts } = routedDispatcher();
    await expect(dispatcher.dispatch(r17)).resolves.toBeUndefined();
    expect(sent).toEqual(["dialectical-run-r17-0123456789ab"]);
    expect(await jobRow(r17.workItemId)).toEqual({ state: "READY", terminal_reason: null });
    expect(await waivers(r17.runId)).toEqual([]);
    expect(alerts).toEqual([]);
  });

  it("the API's login with no cross-account target, outside a request, sees no run and writes no waiver (row-level security, 0126)", async () => {
    const r16 = await startedRun(R16, 1);
    expect(await new PostgresRunReleaseLookup(bareApi).lookup(r16.runId)).toBeNull();
    await expect(recordSpendWaiver(bareApi, r16.runId, "RELEASE_NOT_SERVED")).rejects.toMatchObject({ code: "42501" });
    expect(await waivers(r16.runId)).toEqual([]);
    expect(await jobRow(r16.workItemId)).toEqual({ state: "READY", terminal_reason: null });
    // Not vacuous: the same login, routed to its system target as main.ts wires it, reads the run.
    expect(await new PostgresRunReleaseLookup(api).lookup(r16.runId)).toMatchObject({ releaseKey: R16, anyCurrent: true });
    await database.pool.query(
      "UPDATE core.work_item SET state = 'FAILED', terminal_reason = 'TEST_LAYER:RELEASE_DISPATCH_CLEARED' WHERE work_item_id = $1",
      [r16.workItemId]
    );
  });
});
