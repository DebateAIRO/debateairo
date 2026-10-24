import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Pool } from "pg";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore, costEnvelopeDay } from "@debateai/budget";
import { EntitlementRepository, RunRepository, createPool, migrate, withWriteTransaction } from "@debateai/db";
import { postgresRunnerRetirementStore } from "../../apps/runner/src/runner-retirement.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { createSystemTwin } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side spec §4 (the backstop, step 3) and §9 ("the waiver"): what a retiring release leaves open is recorded
 * FAILED as RUN_SET_ASIDE:<reason>, and in the SAME transaction its run gets a spend waiver, so the person's quota is
 * whole again while the site's day still counts the money that really left. Over embedded Postgres, as the live
 * runner's own login: debateai_runtime and, since row-level security S01, the marker role debateai_rls_all_accounts
 * (a system twin, as deploy/postgres/hardening.sql and the dev runner login grant it); the bare debateai_runtime
 * login, with no account context, records no spend and sets nothing aside (the first case). The superuser pool only
 * arranges rows (a person, a live claim, a DONE item). The cases run in order on one database; each name states what
 * it expects. CI skips this directory; run it before merging.
 */
const R1 = ["r1", "aaaaaaaaaaaa"].join("-");
const R2 = ["r2", "bbbbbbbbbbbb"].join("-");
const FENCE = Object.freeze({ releaseKey: R1, workerId: "worker:a" });

let database: TestDatabase;
let runtime: Pool;
let bareRuntime: Pool;

type Job = Readonly<{ runId: string; workItemId: string }>;

/** A run stamped with `releaseKey` and its first job READY. */
async function runWithJob(releaseKey: string): Promise<Job> {
  const runId = await new RunRepository(database.pool).startRun({
    questionLine: "Does a set-aside debate use the person's quota?",
    principal: { kind: "legacy", legacyAskerId: `backstop:${randomUUID()}` },
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
  return { runId, workItemId };
}

/** An active subscription person (the free plan, no entitlement event), as the spend-waiver suite seeds one. */
async function subscriptionPerson(): Promise<string> {
  const ownerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,
       password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at)
     VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [randomUUID(), randomBytes(32), `backstop-${randomUUID()}`, randomUUID(), ownerRef]
  );
  return ownerRef;
}

/** `runId` owned by `ownerRef` and pinned to its subscription window, as the room pins it. */
async function chargeScope(runId: string, ownerRef: string): Promise<void> {
  await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
  const entitlements = new EntitlementRepository(database.pool);
  const admittedAt = new Date();
  const entitlement = await entitlements.current(ownerRef, admittedAt);
  const client = await database.pool.connect();
  try {
    await entitlements.recordRunChargeScope(client, { runId, ownerRef, planId: entitlement.planId, entitlementEventId: entitlement.eventId, admittedAt });
  } finally { client.release(); }
}

/** Arranged by the superuser: a live claim held by `worker`. */
async function claimLive(job: Job, worker: string): Promise<void> {
  await database.pool.query(
    `UPDATE core.work_item SET state = 'CLAIMED', claimed_by = $2, claim_deadline = clock_timestamp() + interval '10 minutes'
     WHERE work_item_id = $1`,
    [job.workItemId, worker]
  );
}

async function jobRow(workItemId: string) {
  return (await database.pool.query<{ state: string; terminal_reason: string | null; claimed_by: string | null }>(
    "SELECT state, terminal_reason, claimed_by FROM core.work_item WHERE work_item_id = $1", [workItemId]
  )).rows[0];
}

async function waivers() {
  return (await database.pool.query<{ run_id: string; reason: string }>(
    "SELECT run_id::text AS run_id, reason FROM ledger.model_spend_waiver ORDER BY reason, run_id"
  )).rows;
}

describe("set aside, never charged (side-by-side §4, §9)", () => {
  let a1: Job, a2: Job, a3: Job, b1: Job, b2: Job, ownerRef: string;
  const now = Date.now();
  const windowStart = new Date(now - 3_600_000), windowEnd = new Date(now + 3_600_000);
  const today = costEnvelopeDay(new Date(now));

  beforeAll(async () => {
    database = await startTestDatabase();
    await migrate(database.pool);
    runtime = createPool(await createSystemTwin(database, "backstop_runner", ["debateai_runtime"]));
    await database.pool.query(`CREATE ROLE backstop_bare_runner LOGIN PASSWORD '${["private", "fixture", "backstop_bare_runner"].join("-")}' IN ROLE debateai_runtime`);
    const url = new URL(database.connectionString);
    url.username = "backstop_bare_runner";
    url.password = ["private", "fixture", "backstop_bare_runner"].join("-");
    bareRuntime = createPool(url.toString());

    // Oldest first: A1 READY, A2 claimed live by this runner and already charged 1,000 micros, A3 DONE; B1 and B2 r2's.
    a1 = await runWithJob(R1);
    a2 = await runWithJob(R1);
    a3 = await runWithJob(R1);
    b1 = await runWithJob(R2);
    b2 = await runWithJob(R2);
    ownerRef = await subscriptionPerson();
    await chargeScope(a2.runId, ownerRef);
    await claimLive(a2, "worker:a");
    await database.pool.query(
      "UPDATE core.work_item SET state = 'DONE', claimed_by = NULL, claim_deadline = NULL WHERE work_item_id = $1", [a3.workItemId]
    );
    await claimLive(b2, "worker:b");
    await new PostgresModelSpendStore(runtime).recordSpend({
      spendId: randomUUID(), spendSource: "RUN", runId: a2.runId, providerRef: "fake-provider",
      chargedOn: today, chargeMicros: 1_000, inputTokens: 1, outputTokens: 1
    });
  }, 600_000);

  afterAll(async () => {
    await runtime?.end();
    await bareRuntime?.end();
    await database?.stop();
  });

  it("the bare runtime login, with no account context, records no spend and sets nothing aside (row-level security, 0124)", async () => {
    await expect(new PostgresModelSpendStore(bareRuntime).recordSpend({
      spendId: randomUUID(), spendSource: "RUN", runId: a1.runId, providerRef: "fake-provider",
      chargedOn: today, chargeMicros: 1, inputTokens: 1, outputTokens: 1
    })).rejects.toMatchObject({ code: "42501", message: 'new row violates row-level security policy for table "model_spend"' });
    expect(await new WorkItemRepository(bareRuntime, FENCE).setAsideOpenWork({ reason: "BACKSTOP", limit: 100 })).toEqual([]);
    expect(await jobRow(a1.workItemId)).toEqual({ state: "READY", terminal_reason: null, claimed_by: null });
    expect(await jobRow(a2.workItemId)).toEqual({ state: "CLAIMED", terminal_reason: null, claimed_by: "worker:a" });
    expect(await waivers()).toEqual([]);
  });

  it("before the set-aside the person's window and the site day both count A2's 1,000 micros", async () => {
    const spend = new PostgresModelSpendStore(runtime);
    expect(await spend.readOwnerSpentMicros(ownerRef, windowStart, windowEnd)).toBe(1_000);
    expect(await spend.readDaySpentMicros(today)).toBe(1_000);
  });

  it("setAsideOpenWork sets r1's open work aside oldest first, FAILED with the reason, and waives each run", async () => {
    const work = new WorkItemRepository(runtime, FENCE);
    const setAside = await work.setAsideOpenWork({ reason: "BACKSTOP", limit: 100 });
    expect(setAside).toEqual([a1, a2]);
    expect(Object.isFrozen(setAside)).toBe(true);
    for (const job of [a1, a2]) {
      expect(await jobRow(job.workItemId)).toEqual({ state: "FAILED", terminal_reason: "RUN_SET_ASIDE:BACKSTOP", claimed_by: null });
    }
    expect(await jobRow(a3.workItemId)).toMatchObject({ state: "DONE" });
    expect(await jobRow(b1.workItemId)).toEqual({ state: "READY", terminal_reason: null, claimed_by: null });
    expect(await waivers()).toEqual(
      [a1.runId, a2.runId].sort().map((runId) => ({ run_id: runId, reason: "BACKSTOP" }))
    );
  });

  it("a second set-aside finds nothing and adds no waiver", async () => {
    expect(await new WorkItemRepository(runtime, FENCE).setAsideOpenWork({ reason: "BACKSTOP", limit: 100 })).toEqual([]);
    expect(await waivers()).toHaveLength(2);
  });

  it("the person's window no longer counts A2's spend; the site day still does (§9)", async () => {
    const spend = new PostgresModelSpendStore(runtime);
    expect(await spend.readOwnerSpentMicros(ownerRef, windowStart, windowEnd)).toBe(0);
    expect(await spend.readDaySpentMicros(today)).toBe(1_000);
  });

  it("setAsideWorkItem on r2's fence sets B1 aside with its waiver; a claimed item with readyOnly is left alone", async () => {
    const r2 = new WorkItemRepository(runtime, { releaseKey: R2 });
    expect(await r2.setAsideWorkItem({ ...b1, reason: "RELEASE_NOT_SERVED", readyOnly: true })).toBe(true);
    expect(await jobRow(b1.workItemId)).toEqual({ state: "FAILED", terminal_reason: "RUN_SET_ASIDE:RELEASE_NOT_SERVED", claimed_by: null });
    expect(await r2.setAsideWorkItem({ ...b2, reason: "RELEASE_NOT_SERVED", readyOnly: true })).toBe(false);
    expect(await jobRow(b2.workItemId)).toEqual({ state: "CLAIMED", terminal_reason: null, claimed_by: "worker:b" });
    expect((await waivers()).filter((row) => row.reason === "RELEASE_NOT_SERVED"))
      .toEqual([{ run_id: b1.runId, reason: "RELEASE_NOT_SERVED" }]);
    expect(await waivers()).toHaveLength(3);
  });

  it("the FAILED row and the waiver commit together: rolled back, neither stays", async () => {
    const job = await runWithJob(R1);
    await expect(withWriteTransaction(runtime, async (client) => {
      expect(await new WorkItemRepository(runtime, FENCE).setAsideOpenWorkOn(client, { reason: "BACKSTOP", limit: 10 })).toEqual([job]);
      expect((await client.query("SELECT count(*)::int AS n FROM ledger.model_spend_waiver WHERE run_id = $1", [job.runId])).rows[0].n).toBe(1);
      throw new Error("TEST_LAYER:ROLL_BACK");
    })).rejects.toThrow("TEST_LAYER:ROLL_BACK");
    expect(await jobRow(job.workItemId)).toEqual({ state: "READY", terminal_reason: null, claimed_by: null });
    expect(await waivers()).toHaveLength(3);
  });

  it("the runner's store pages through all of its release's open work and counts what it set aside", async () => {
    const jobs: Job[] = [];
    for (let index = 0; index < 3; index += 1) jobs.push(await runWithJob(R1));
    const store = postgresRunnerRetirementStore(runtime, FENCE, { pageSize: 2 });
    // The rolled-back job of the case before is still open: four items, two full pages and an empty one.
    expect(await store.setAsideOpenWork(R1, "BACKSTOP")).toBe(4);
    for (const job of jobs) expect(await jobRow(job.workItemId)).toMatchObject({ state: "FAILED", terminal_reason: "RUN_SET_ASIDE:BACKSTOP" });
    expect(await store.setAsideOpenWork(R1, "BACKSTOP")).toBe(0);
    expect(await waivers()).toHaveLength(7);
    // Another release's key is refused before anything is written (O1: never another release's debates).
    await expect(store.setAsideOpenWork(R2, "BACKSTOP")).rejects.toThrow(new TypeError("RETIREMENT_RELEASE_KEY_MISMATCH"));
    expect(await jobRow(b2.workItemId)).toMatchObject({ state: "CLAIMED" });
    expect(await waivers()).toHaveLength(7);
  });
});
