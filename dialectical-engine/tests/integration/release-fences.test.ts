import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { WorkItemRepository, runSetAsideReason, RUN_SET_ASIDE } from "@debateai/battery";
import { RunRepository, createPool, migrate, withWriteTransaction } from "@debateai/db";
import { LEGACY_RELEASE_KEY } from "@debateai/kernel";
import { acceptanceFailureRecorder, ACCEPTANCE_WORKER_ID } from "../../acceptance/main.js";
import { ACCEPTANCE_RELEASE_KEY } from "../../acceptance/seed-register.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { listRunnerSettingsPreload } from "../../apps/runner/src/run-settings.js";

/**
 * Side-by-side spec §3 ("the database refuses to give a runner another release's debate"), over embedded Postgres,
 * connected as a principal with exactly the live runner principal's one membership (debateai_runtime), so every read
 * and write below is one a runner may really make. The superuser pool only arranges rows (claims, lapsed deadlines).
 * CI skips this directory; run it before merging.
 */
let database: TestDatabase;
let runtime: Pool;

const KEY_A = ["r1", "aaaaaaaaaaaa"].join("-");
const KEY_B = ["r2", "bbbbbbbbbbbb"].join("-");

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE fence_runner_runtime LOGIN PASSWORD 'fence-runner-private-fixture-only' IN ROLE debateai_runtime");
  const url = new URL(database.connectionString);
  url.username = "fence_runner_runtime";
  url.password = "fence-runner-private-fixture-only";
  runtime = createPool(url.toString());
}, 600_000);

afterAll(async () => {
  await runtime?.end();
  await database?.stop();
});

// Every case starts with no open work, so "oldest first" and "lists only" read exactly the rows the case wrote.
beforeEach(async () => {
  await database.pool.query(
    `UPDATE core.work_item SET state = 'FAILED', claimed_by = NULL, claim_deadline = NULL,
       terminal_reason = 'TEST_LAYER:RELEASE_FENCES_CLEARED'
     WHERE state IN ('READY','CLAIMED')`
  );
});

type Job = Readonly<{ runId: string | null; workItemId: string }>;

/** A run stamped with `releaseKey` (none: the run reads `legacy`) and its first job READY. */
async function runWithJob(releaseKey?: string): Promise<Readonly<{ runId: string; workItemId: string }>> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: "Does a runner leave another release's debate alone?",
    principal: { kind: "legacy", legacyAskerId: `fence:${randomUUID()}` },
    sessionId: randomUUID(), callerScope: "ASKER", asOf: new Date(),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER", tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low", planTier: "free", depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4), registerVersion: 1, batteryVersion: "test",
    askContract: {}, batteryRows: [],
    ...(releaseKey === undefined ? {} : { releaseKey })
  });
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `S00:${runId}:Q1`
  });
  return { runId, workItemId };
}

async function runlessJob(): Promise<Job> {
  const workItemId = await new WorkItemRepository(database.pool).enqueue({
    runId: null, batteryRowId: "Q1", nodeSet: [], commandKey: `S00:runless:${randomUUID()}:Q1`
  });
  return { runId: null, workItemId };
}

/** Arranged by the superuser: a claim held by `worker`, live or lapsed a minute ago. */
async function claim(job: Job, worker: string, live: boolean): Promise<void> {
  await database.pool.query(
    `UPDATE core.work_item SET state = 'CLAIMED', claimed_by = $2,
       claim_deadline = clock_timestamp() + CASE WHEN $3 THEN interval '10 minutes' ELSE interval '-1 minute' END
     WHERE work_item_id = $1`,
    [job.workItemId, worker, live]
  );
}

async function jobRow(workItemId: string) {
  return (await database.pool.query<{ state: string; terminal_reason: string | null; claimed_by: string | null }>(
    "SELECT state, terminal_reason, claimed_by FROM core.work_item WHERE work_item_id = $1", [workItemId]
  )).rows[0];
}

const fenceA = () => new WorkItemRepository(runtime, { releaseKey: KEY_A, workerId: "worker:a" });
const claimSeconds = 30;

describe("work items are fenced by release (side-by-side §3)", () => {
  it("claimById refuses another release's item and leaves it untouched", async () => {
    const a = await runWithJob(KEY_A), b = await runWithJob(KEY_B);
    expect(await fenceA().claimById({ workItemId: b.workItemId, workerId: "worker:a", claimSeconds })).toBeNull();
    expect(await jobRow(b.workItemId)).toEqual({ state: "READY", terminal_reason: null, claimed_by: null });

    const claimed = await fenceA().claimById({ workItemId: a.workItemId, workerId: "worker:a", claimSeconds });
    expect(claimed).toMatchObject({ workItemId: a.workItemId, runId: a.runId, claimedBy: "worker:a" });
    expect(await jobRow(a.workItemId)).toMatchObject({ state: "CLAIMED", claimed_by: "worker:a" });
  });

  it("claimNext skips an older item of another release and takes its own", async () => {
    const b = await runWithJob(KEY_B);
    const a = await runWithJob(KEY_A);
    const claimed = await fenceA().claimNext({ workerId: "worker:a", claimSeconds });
    expect(claimed?.workItemId).toBe(a.workItemId);
    expect(await fenceA().claimNext({ workerId: "worker:a", claimSeconds })).toBeNull();
    expect(await jobRow(b.workItemId)).toEqual({ state: "READY", terminal_reason: null, claimed_by: null });
  });

  it("the default fence is the legacy release", async () => {
    const legacy = await runWithJob(), a = await runWithJob(KEY_A);
    const repository = new WorkItemRepository(runtime);
    expect(await repository.claimById({ workItemId: a.workItemId, workerId: "worker:legacy", claimSeconds })).toBeNull();
    expect(await repository.claimById({ workItemId: legacy.workItemId, workerId: "worker:legacy", claimSeconds }))
      .toMatchObject({ workItemId: legacy.workItemId, claimedBy: "worker:legacy" });
    expect(await jobRow(a.workItemId)).toEqual({ state: "READY", terminal_reason: null, claimed_by: null });
  });

  it("a run-less item stays claimable by any fence (D3)", async () => {
    await runWithJob(KEY_B);
    const runless = await runlessJob();
    expect((await fenceA().claimNext({ workerId: "worker:a", claimSeconds }))?.workItemId).toBe(runless.workItemId);
  });

  it("releaseKeyOf reads the item's run's release", async () => {
    const b = await runWithJob(KEY_B), legacy = await runWithJob(), runless = await runlessJob();
    expect(await fenceA().releaseKeyOf(b.workItemId)).toBe(KEY_B);
    expect(await fenceA().releaseKeyOf(legacy.workItemId)).toBe(LEGACY_RELEASE_KEY);
    expect(await fenceA().releaseKeyOf(randomUUID())).toBeNull();
    expect(await fenceA().releaseKeyOf(runless.workItemId)).toBeNull();
  });

  it("listDispatchable lists this release's ready and lapsed items only", async () => {
    const aReady = await runWithJob(KEY_A), aLapsed = await runWithJob(KEY_A), aLive = await runWithJob(KEY_A);
    const bReady = await runWithJob(KEY_B), legacy = await runWithJob();
    await runlessJob();
    await claim(aLapsed, "worker:old", false);
    await claim(aLive, "worker:a", true);
    expect((await fenceA().listDispatchable(10)).map((item) => item.workItemId))
      .toEqual([aReady.workItemId, aLapsed.workItemId]);
    expect(await new WorkItemRepository(runtime, { releaseKey: KEY_B }).listDispatchable(10))
      .toEqual([{ runId: bReady.runId, workItemId: bReady.workItemId }]);
    expect((await new WorkItemRepository(runtime).listDispatchable(10)).map((item) => item.workItemId))
      .toEqual([legacy.workItemId]);
  });

  it("listLapsedClaimed lists this release's lapsed claims only", async () => {
    const aLapsed = await runWithJob(KEY_A), aReady = await runWithJob(KEY_A), aLive = await runWithJob(KEY_A);
    const bLapsed = await runWithJob(KEY_B);
    await claim(aLapsed, "worker:old", false);
    await claim(aLive, "worker:a", true);
    await claim(bLapsed, "worker:old", false);
    expect(await fenceA().listLapsedClaimed(10)).toEqual([{ runId: aLapsed.runId, workItemId: aLapsed.workItemId }]);
    expect(await jobRow(aReady.workItemId)).toMatchObject({ state: "READY" });
    await expect(fenceA().listLapsedClaimed(0)).rejects.toBeInstanceOf(TypeError);
  });

  it("recordTerminalFailure writes only this release's items, never under another worker's live claim (D2)", async () => {
    const failure = (job: { runId: string; workItemId: string }, reason: string) =>
      fenceA().recordTerminalFailure({ ...job, reason });

    const b = await runWithJob(KEY_B);
    expect(await failure(b, "TEST_LAYER:OTHER_RELEASE")).toBe(false);
    expect(await jobRow(b.workItemId)).toEqual({ state: "READY", terminal_reason: null, claimed_by: null });

    const ready = await runWithJob(KEY_A);
    expect(await failure(ready, "TEST_LAYER:READY")).toBe(true);
    expect(await jobRow(ready.workItemId)).toEqual({ state: "FAILED", terminal_reason: "TEST_LAYER:READY", claimed_by: null });

    const othersLive = await runWithJob(KEY_A);
    await claim(othersLive, "worker:other", true);
    expect(await failure(othersLive, "TEST_LAYER:OTHERS_LIVE")).toBe(false);
    expect(await jobRow(othersLive.workItemId)).toEqual({ state: "CLAIMED", terminal_reason: null, claimed_by: "worker:other" });

    // A repository told no worker id writes over no live claim at all.
    expect(await new WorkItemRepository(runtime, { releaseKey: KEY_A })
      .recordTerminalFailure({ ...othersLive, reason: "TEST_LAYER:NO_WORKER" })).toBe(false);
    expect(await jobRow(othersLive.workItemId)).toEqual({ state: "CLAIMED", terminal_reason: null, claimed_by: "worker:other" });

    const mineLive = await runWithJob(KEY_A);
    await claim(mineLive, "worker:a", true);
    expect(await failure(mineLive, "TEST_LAYER:MINE_LIVE")).toBe(true);
    expect(await jobRow(mineLive.workItemId)).toEqual({ state: "FAILED", terminal_reason: "TEST_LAYER:MINE_LIVE", claimed_by: null });

    const othersLapsed = await runWithJob(KEY_A);
    await claim(othersLapsed, "worker:other", false);
    expect(await failure(othersLapsed, "TEST_LAYER:OTHERS_LAPSED")).toBe(true);
    expect(await jobRow(othersLapsed.workItemId)).toMatchObject({ state: "FAILED", terminal_reason: "TEST_LAYER:OTHERS_LAPSED" });

    // D2: today's re-write of an already FAILED item of its own release is kept.
    expect(await failure(ready, "TEST_LAYER:REWRITTEN")).toBe(true);
    expect(await jobRow(ready.workItemId)).toMatchObject({ state: "FAILED", terminal_reason: "TEST_LAYER:REWRITTEN" });
  });

  it("settle writes DONE only under this worker's own claim, never over a set-aside FAILED item (R3)", async () => {
    const settle = (repository: WorkItemRepository, job: Job) =>
      repository.settle({ workItemId: job.workItemId, attemptId: randomUUID(), artifactRef: randomUUID() });

    const mine = await runWithJob(KEY_A);
    await claim(mine, "worker:a", true);
    expect(await settle(fenceA(), mine)).toBe(true);
    expect(await jobRow(mine.workItemId)).toEqual({ state: "DONE", terminal_reason: null, claimed_by: null });

    const othersLive = await runWithJob(KEY_A);
    await claim(othersLive, "worker:other", true);
    expect(await settle(fenceA(), othersLive)).toBe(false);
    expect(await jobRow(othersLive.workItemId)).toEqual({ state: "CLAIMED", terminal_reason: null, claimed_by: "worker:other" });

    // The backstop set the debate aside while this worker's last task still ran: that task's settle writes nothing.
    const setAside = await runWithJob(KEY_A);
    await claim(setAside, "worker:a", true);
    expect(await fenceA().setAsideWorkItem({ ...setAside, reason: "BACKSTOP", readyOnly: false })).toBe(true);
    expect(await settle(fenceA(), setAside)).toBe(false);
    expect(await jobRow(setAside.workItemId)).toEqual({ state: "FAILED", terminal_reason: "RUN_SET_ASIDE:BACKSTOP", claimed_by: null });

    // A runner settles only what it claimed: never a READY item.
    const ready = await runWithJob(KEY_A);
    expect(await settle(fenceA(), ready)).toBe(false);
    expect(await jobRow(ready.workItemId)).toEqual({ state: "READY", terminal_reason: null, claimed_by: null });

    // A repository told no worker id (the test fixtures') still settles an open item, and never a FAILED one.
    const unnamed = new WorkItemRepository(runtime, { releaseKey: KEY_A });
    expect(await settle(unnamed, ready)).toBe(true);
    expect(await jobRow(ready.workItemId)).toMatchObject({ state: "DONE" });
    expect(await settle(unnamed, setAside)).toBe(false);
    expect(await jobRow(setAside.workItemId)).toEqual({ state: "FAILED", terminal_reason: "RUN_SET_ASIDE:BACKSTOP", claimed_by: null });
  });

  it("refuses a malformed fence key; legacy and a well-formed key are accepted", () => {
    for (const releaseKey of [["r1", "0123456789AB"].join("-"), ["r01", "aaaaaaaaaaaa"].join("-"), "", "LEGACY"]) {
      expect(() => new WorkItemRepository(runtime, { releaseKey })).toThrow(expect.objectContaining({ code: "RELEASE_KEY_INVALID" }));
    }
    expect(() => new WorkItemRepository(runtime, { releaseKey: ["r1", "aaaaaaaaaaaa"].join("-"), workerId: "" })).toThrow(TypeError);
    expect(() => new WorkItemRepository(runtime, { releaseKey: LEGACY_RELEASE_KEY })).not.toThrow();
    expect(() => new WorkItemRepository(runtime, { releaseKey: KEY_B })).not.toThrow();
  });

  it("the acceptance runner's failure recorder writes under that runner's own live claim (D2)", async () => {
    // B16: acceptance runs are stamped with ACCEPTANCE_RELEASE_KEY, the key the acceptance runner claims under.
    const live = await runWithJob(ACCEPTANCE_RELEASE_KEY), others = await runWithJob(ACCEPTANCE_RELEASE_KEY);
    await claim(live, ACCEPTANCE_WORKER_ID, true);
    await claim(others, "worker:other", true);
    const recorder = acceptanceFailureRecorder(runtime);
    expect(await recorder.recordTerminalFailure({ ...live, reason: "ACCEPTANCE_EXECUTION_FAILED:TEST_LAYER" })).toBe(true);
    expect(await jobRow(live.workItemId)).toEqual({ state: "FAILED", terminal_reason: "ACCEPTANCE_EXECUTION_FAILED:TEST_LAYER", claimed_by: null });
    expect(await recorder.recordTerminalFailure({ ...others, reason: "ACCEPTANCE_EXECUTION_FAILED:TEST_LAYER" })).toBe(false);
    expect(await jobRow(others.workItemId)).toMatchObject({ state: "CLAIMED", claimed_by: "worker:other" });
  });

  it("the acceptance failure recorder writes only under the acceptance key, never a `legacy` run (B16)", async () => {
    const legacy = await runWithJob();
    await claim(legacy, ACCEPTANCE_WORKER_ID, true);
    const recorder = acceptanceFailureRecorder(runtime);
    expect(await recorder.recordTerminalFailure({ ...legacy, reason: "ACCEPTANCE_EXECUTION_FAILED:TEST_LAYER" })).toBe(false);
    expect(await jobRow(legacy.workItemId)).toMatchObject({ state: "CLAIMED", claimed_by: ACCEPTANCE_WORKER_ID });
  });

  it("names a set-aside by its waiver reason", () => {
    expect(RUN_SET_ASIDE).toBe("RUN_SET_ASIDE");
    expect(runSetAsideReason("BACKSTOP")).toBe("RUN_SET_ASIDE:BACKSTOP");
    expect(runSetAsideReason("RELEASE_NOT_SERVED")).toBe("RUN_SET_ASIDE:RELEASE_NOT_SERVED");
    expect(runSetAsideReason("OWNER_STOPPED")).toBe("RUN_SET_ASIDE:OWNER_STOPPED");
    expect(runSetAsideReason("SETTINGS_VERSION_UNSUPPORTED")).toBe("RUN_SET_ASIDE:SETTINGS_VERSION_UNSUPPORTED");
    expect(() => runSetAsideReason("PAUSED" as never)).toThrow(TypeError);
  });

  it("setAsideOpenWork sets aside this release's open work, oldest first, never another worker's live claim", async () => {
    const a1 = await runWithJob(KEY_A), a2 = await runWithJob(KEY_A), a3 = await runWithJob(KEY_A);
    const othersLive = await runWithJob(KEY_A), othersLapsed = await runWithJob(KEY_A);
    const b1 = await runWithJob(KEY_B), legacy = await runWithJob();
    await claim(a2, "worker:a", true);
    await fenceA().recordTerminalFailure({ ...a3, reason: "TEST_LAYER:ALREADY_FAILED" });
    await claim(othersLive, "worker:other", true);
    await claim(othersLapsed, "worker:other", false);

    expect(await fenceA().setAsideOpenWork({ reason: "BACKSTOP", limit: 100 })).toEqual([
      { runId: a1.runId, workItemId: a1.workItemId },
      { runId: a2.runId, workItemId: a2.workItemId },
      { runId: othersLapsed.runId, workItemId: othersLapsed.workItemId }
    ]);
    for (const job of [a1, a2, othersLapsed]) {
      expect(await jobRow(job.workItemId)).toEqual({ state: "FAILED", terminal_reason: "RUN_SET_ASIDE:BACKSTOP", claimed_by: null });
    }
    expect(await jobRow(a3.workItemId)).toMatchObject({ state: "FAILED", terminal_reason: "TEST_LAYER:ALREADY_FAILED" });
    expect(await jobRow(othersLive.workItemId)).toMatchObject({ state: "CLAIMED", claimed_by: "worker:other" });
    expect(await jobRow(b1.workItemId)).toMatchObject({ state: "READY" });
    expect(await jobRow(legacy.workItemId)).toMatchObject({ state: "READY" });
    expect(await fenceA().setAsideOpenWork({ reason: "BACKSTOP", limit: 100 })).toEqual([]);
  });

  it("setAsideOpenWork honours its page size, and its On form writes on the caller's transaction", async () => {
    const first = await runWithJob(KEY_A), second = await runWithJob(KEY_A);
    expect(await fenceA().setAsideOpenWork({ reason: "BACKSTOP", limit: 1 })).toEqual([
      { runId: first.runId, workItemId: first.workItemId }
    ]);
    expect(await jobRow(second.workItemId)).toMatchObject({ state: "READY" });

    // Rolled back with the caller's transaction: nothing of the set-aside stays.
    await expect(withWriteTransaction(runtime, async (client) => {
      expect(await fenceA().setAsideOpenWorkOn(client, { reason: "BACKSTOP", limit: 10 }))
        .toEqual([{ runId: second.runId, workItemId: second.workItemId }]);
      throw new Error("TEST_LAYER:ROLL_BACK");
    })).rejects.toThrow("TEST_LAYER:ROLL_BACK");
    expect(await jobRow(second.workItemId)).toMatchObject({ state: "READY", terminal_reason: null });
    await expect(fenceA().setAsideOpenWork({ reason: "BACKSTOP", limit: 0 })).rejects.toBeInstanceOf(TypeError);
  });

  it("setAsideWorkItem sets aside one item of the fence's release; readyOnly leaves a claimed one alone", async () => {
    const b1 = await runWithJob(KEY_B), bClaimed = await runWithJob(KEY_B);
    await claim(bClaimed, "worker:b", true);
    const fenceB = new WorkItemRepository(runtime, { releaseKey: KEY_B });

    // Another release's fence never writes it.
    expect(await fenceA().setAsideWorkItem({ ...b1, reason: "RELEASE_NOT_SERVED", readyOnly: true })).toBe(false);
    expect(await jobRow(b1.workItemId)).toEqual({ state: "READY", terminal_reason: null, claimed_by: null });

    expect(await fenceB.setAsideWorkItem({ ...b1, reason: "RELEASE_NOT_SERVED", readyOnly: true })).toBe(true);
    expect(await jobRow(b1.workItemId)).toEqual({ state: "FAILED", terminal_reason: "RUN_SET_ASIDE:RELEASE_NOT_SERVED", claimed_by: null });
    expect(await fenceB.setAsideWorkItem({ ...b1, reason: "RELEASE_NOT_SERVED", readyOnly: true })).toBe(false);

    expect(await fenceB.setAsideWorkItem({ ...bClaimed, reason: "RELEASE_NOT_SERVED", readyOnly: true })).toBe(false);
    expect(await jobRow(bClaimed.workItemId)).toMatchObject({ state: "CLAIMED", claimed_by: "worker:b" });
    // Without readyOnly the live claim of a worker this fence does not name is still left alone (D2).
    expect(await fenceB.setAsideWorkItem({ ...bClaimed, reason: "BACKSTOP", readyOnly: false })).toBe(false);
    expect(await new WorkItemRepository(runtime, { releaseKey: KEY_B, workerId: "worker:b" })
      .setAsideWorkItem({ ...bClaimed, reason: "BACKSTOP", readyOnly: false })).toBe(true);
    expect(await jobRow(bClaimed.workItemId)).toEqual({ state: "FAILED", terminal_reason: "RUN_SET_ASIDE:BACKSTOP", claimed_by: null });
  });
});

// Side-by-side spec §13 runner point 3 (S8): the boot preload's two reads, as the runtime principal really makes them.
describe("the runner's boot preload reads its own release's open versions and its passed versions (side-by-side §13)", () => {
  it("lists the fenced release's READY and CLAIMED runs' versions only, and unions them with the passed versions", async () => {
    const ready = await runWithJob(KEY_A), claimed = await runWithJob(KEY_A), failed = await runWithJob(KEY_A);
    await claim(claimed, "worker:a", true);
    await database.pool.query("UPDATE core.work_item SET state = 'FAILED', terminal_reason = 'TEST_LAYER:S8' WHERE work_item_id = $1",
      [failed.workItemId]);
    await runWithJob(KEY_B);
    await runWithJob();
    expect(ready.runId).not.toBe(claimed.runId);
    // Two open runs, both stamped version 1: one version, once.
    expect(await fenceA().listOpenRunSettingsVersions(KEY_A)).toEqual([1]);
    // Legacy runs are never listed, and a fence reads only its own release.
    expect(await new WorkItemRepository(runtime).listOpenRunSettingsVersions(LEGACY_RELEASE_KEY)).toEqual([]);
    await expect(fenceA().listOpenRunSettingsVersions(KEY_B)).rejects.toThrow("WORK_ITEM_FENCE_RELEASE_MISMATCH");
    // Release B (key r2-…): its open run's version 1, its key's own number 2 (read_passed_settings_versions), its site 2.
    const fenceB = new WorkItemRepository(runtime, { releaseKey: KEY_B });
    expect(await listRunnerSettingsPreload({ pool: runtime, work: fenceB, releaseKey: KEY_B, siteVersion: 2 })).toEqual([1, 2]);
    expect(await listRunnerSettingsPreload({ pool: runtime, work: fenceA(), releaseKey: KEY_A, siteVersion: 1 })).toEqual([1]);
    // Nothing open for release A any more: its site version (and its key's number) only.
    await database.pool.query("UPDATE core.work_item SET state = 'FAILED', claimed_by = NULL, claim_deadline = NULL, terminal_reason = 'TEST_LAYER:S8' WHERE work_item_id = ANY($1::uuid[])",
      [[ready.workItemId, claimed.workItemId]]);
    expect(await fenceA().listOpenRunSettingsVersions(KEY_A)).toEqual([]);
  });
});
