import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { Pool, PoolClient } from "pg";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore } from "@debateai/budget";
import { RunWaitRepository, createPool } from "@debateai/db";
import { AskRoom, nextWholeMinute, type AskRoomOptions, type RoomDecisionContext, type RoomQuestion } from "../../apps/api/src/ask-room.js";
import { PostgresAskAdmissionGate } from "../../apps/api/src/release-state.js";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";
import { TEST_RELEASE_KEY } from "../support/releaseKey.js";
import { createSystemTwin } from "../support/rls-logins.js";

/**
 * NV-48 (security audit run 3) — ONE ACCOUNT HOLDS AT MOST TWO OF THE SITE'S EIGHT PLACES, over embedded Postgres. The
 * production gate's count of a person's live debates (a READY or CLAIMED job, one per run) on the room decision pool's
 * login, by the run's owner as core.run_waiting_v reads it: the latest ownership event (as core.create_encrypted_run writes
 * one), else an `owner:` asker id. Then the real room and the real line: a person at their share waits as their own
 * wait (PERSON, holding nobody back until its recheck instant), the waker leaves it in line and records every one of
 * the person's waiting runs again, and starts it once one of theirs ends. The superuser pool only arranges rows. CI
 * skips this directory; run it before merging.
 */
const R = TEST_RELEASE_KEY;
// Row-level security (0130, X19): the room decision pool is API_SYSTEM_DATABASE_URL (apps/api/src/main.ts, roomDecisionPool),
// the api-system login, so the count runs on the system twin of debateai_runtime (the role and the cross-account marker
// debateai_rls_all_accounts), as tests/integration/side-by-side-site-cap.test.ts reads the site's count. A login holding
// debateai_runtime alone carries no account context and sees no run at all.
const LOGIN = "owner_share_system";
const CLASS = Object.freeze({ planTier: "free" as const, compositionBudgetTier: "low" as const, makerCount: 2, depth: 1 });
const QUESTION = "Should one account hold more than its share of the site's debates?";

let fixture: ContentRunFixture;
let runtime: Pool;

beforeAll(async () => {
  fixture = await startContentRunFixture("owner-share");
  runtime = createPool(await createSystemTwin(fixture.database, LOGIN, ["debateai_runtime"]));
}, 600_000);

afterAll(async () => {
  await runtime?.end();
  await fixture?.stop();
});

// Each case starts with nothing live and nobody waiting.
afterEach(async () => {
  await fixture.database.pool.query(
    "UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE state IN ('READY','CLAIMED')"
  );
  await fixture.database.pool.query(
    "INSERT INTO core.run_wait_start (run_id, started_at) SELECT run_id, clock_timestamp() FROM core.run_waiting_v"
  );
});

async function activeOwner(): Promise<string> {
  const ownerRef = randomUUID();
  await fixture.database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [randomUUID(), randomBytes(32), `owner-share-${randomUUID()}`, randomUUID(), ownerRef]
  );
  return ownerRef;
}

/** An unencrypted run owned through an ownership event (the event branch of the count). */
async function eventRun(ownerRef: string): Promise<string> {
  const runId = await fixture.createLegacyRun(QUESTION, { releaseKey: R });
  await fixture.database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
  return runId;
}

/** One READY job of the run, enqueued as the API enqueues a first job. */
function liveJob(runId: string, n = 1): Promise<string> {
  return new WorkItemRepository(fixture.database.pool).enqueue({
    runId, batteryRowId: "Q1", nodeSet: [], commandKey: `S00:${runId}:Q${String(n)}`
  });
}

async function claimJob(workItemId: string): Promise<void> {
  await fixture.database.pool.query(
    `UPDATE core.work_item SET state='CLAIMED', claimed_by='worker:owner-share',
       claim_deadline = clock_timestamp() + interval '10 minutes'
     WHERE work_item_id=$1`,
    [workItemId]
  );
}

async function failJob(workItemId: string): Promise<void> {
  await fixture.database.pool.query(
    `UPDATE core.work_item SET state='FAILED', claimed_by=NULL, claim_deadline=NULL,
       terminal_reason='TEST_LAYER:OWNER_SHARE'
     WHERE work_item_id=$1`,
    [workItemId]
  );
}

async function settleJob(workItemId: string): Promise<void> {
  await fixture.database.pool.query(
    "UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE work_item_id=$1", [workItemId]
  );
}

/**
 * A run of `ownerRef` with NO ownership event and an `owner:` asker id, READY: the count's fallback branch. Copied from
 * a fresh legacy run by the superuser under `session_replication_role = replica` (core.run is insert-only and refuses
 * an unencrypted `owner:` insert; replica mode lifts both triggers for this transaction only), as
 * tests/integration/tiers-s02-run-plan-tier.test.ts does.
 */
async function noEventOwnerRun(ownerRef: string): Promise<string> {
  const source = await fixture.createLegacyRun(QUESTION, { releaseKey: R });
  const runId = randomUUID();
  const client = await fixture.database.pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role = replica");
    await client.query(
      `INSERT INTO core.run SELECT (jsonb_populate_record(NULL::core.run, to_jsonb(r) || jsonb_build_object(
         'run_id', $2::uuid, 'asker_id', 'owner:' || $3::uuid::text, 'created_at_seq', ledger.allocate_sequence()))).*
       FROM core.run AS r WHERE r.run_id = $1`,
      [source, runId, ownerRef]
    );
    await client.query(
      `INSERT INTO core.work_item (run_id, battery_row_id, node_set, command_key, state, created_at_seq)
       VALUES ($1::uuid, 'Q1', '[]'::jsonb, 'S00:' || $1::uuid::text || ':Q1', 'READY', ledger.allocate_sequence())`,
      [runId]
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return runId;
}

const questionOf = (ownerRef: string): RoomQuestion =>
  Object.freeze({ access: Object.freeze({ ownerRef, legacyAskerId: null }), settingsClass: CLASS });

/** A room as main.ts builds it over the real line and spend store, with the production gate and its default share. */
function roomOf(overrides: Partial<AskRoomOptions>): AskRoom {
  const pool = fixture.database.pool;
  return new AskRoom({
    lockPool: pool,
    spend: new PostgresModelSpendStore(pool),
    line: new RunWaitRepository(pool),
    estimator: { estimateMicros: async () => 1_000 },
    personAllowance: { read: async () => [] },
    entitlements: null,
    dailyCeilingMicros: 10_000_000,
    closeBasisPoints: 9_500,
    waitingLinePerPerson: 1,
    gate: new PostgresAskAdmissionGate({ releaseKey: R, hosted: false }),
    ...overrides
  });
}

/** The decision's apply as #submitWithRoom shapes it: a WAIT enters `runId` in line on the decision's transaction. */
function enterOnWait(room: AskRoom, runId: string) {
  return async ({ admission, now, tx }: RoomDecisionContext) => {
    if (admission.kind === "WAIT") await room.enterWait(tx, runId, now);
    return admission;
  };
}

const enqueue = (tx: PoolClient, runId: string) => new WorkItemRepository(fixture.database.pool).enqueueOn(tx, {
  runId, batteryRowId: "Q1", nodeSet: [], commandKey: `S00:${runId}:Q1`
});

async function lineRow(runId: string) {
  return (await fixture.database.pool.query<{ waits_for: string | null; person_recheck_at: Date | null }>(
    "SELECT waits_for, person_recheck_at FROM core.run_waiting_v WHERE run_id=$1", [runId]
  )).rows[0];
}

async function holdCount(runId: string): Promise<number> {
  return (await fixture.database.pool.query<{ n: number }>(
    "SELECT count(*)::integer AS n FROM ledger.model_spend_hold WHERE run_id=$1", [runId]
  )).rows[0]!.n;
}

async function jobsOf(runId: string) {
  return (await fixture.database.pool.query<{ work_item_id: string; state: string }>(
    "SELECT work_item_id, state FROM core.work_item WHERE run_id=$1", [runId]
  )).rows;
}

describe("NV-48 the production gate counts a person's live debates", () => {
  it("the count reads a person's live runs by the run's owner, on the room decision pool's login", async () => {
    const A = fixture.ownerRef;
    const a1 = await fixture.createEncryptedRun(QUESTION, { releaseKey: R });
    await liveJob(a1);
    const a2 = await fixture.createEncryptedRun(QUESTION, { releaseKey: R });
    await claimJob(await liveJob(a2));
    const a3 = await fixture.createEncryptedRun(QUESTION, { releaseKey: R });
    await settleJob(await liveJob(a3));
    const a4 = await fixture.createEncryptedRun(QUESTION, { releaseKey: R });
    await failJob(await liveJob(a4));
    const a5 = await fixture.createEncryptedRun(QUESTION, { releaseKey: R });
    await liveJob(a5, 1);
    await liveJob(a5, 2);
    const aF = await noEventOwnerRun(A);
    expect((await fixture.database.pool.query(
      "SELECT count(*)::integer AS n FROM core.run_ownership_event WHERE run_id=$1", [aF]
    )).rows[0]).toEqual({ n: 0 });

    const B = await activeOwner();
    const C = await activeOwner();
    const b1 = await eventRun(B);
    await liveJob(b1);
    const x = await eventRun(B);
    await fixture.database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [x, C]);
    await liveJob(x);

    const gate = new PostgresAskAdmissionGate({ releaseKey: R, hosted: false });
    expect(await gate.ownerActiveDebates(runtime, A)).toBe(4);
    expect(await gate.ownerActiveDebates(runtime, B)).toBe(1);
    expect(await gate.ownerActiveDebates(runtime, C)).toBe(1);
    expect(await gate.ownerActiveDebates(runtime, await activeOwner())).toBe(0);
  });
});

describe("NV-48 the room and the waker keep a person to their share", () => {
  it("the room makes the person's third question wait as their own wait, and the waker starts it when one of theirs ends", async () => {
    const now = new Date("2034-03-01T10:00:20.000Z");
    const A = fixture.ownerRef;
    const pool = fixture.database.pool;
    const line = new RunWaitRepository(pool);
    const a1 = await fixture.createEncryptedRun(QUESTION, { releaseKey: R });
    const a1Job = await liveJob(a1);
    const a2 = await fixture.createEncryptedRun(QUESTION, { releaseKey: R });
    await liveJob(a2);
    const w = await fixture.createEncryptedRun(QUESTION, { releaseKey: R });
    const room = roomOf({ clock: () => now });

    expect(await room.decide(questionOf(A), enterOnWait(room, w)))
      .toEqual({ kind: "WAIT", waitsUntil: nextWholeMinute(now), worstScope: "SITE_DAY", cause: "PERSON_BUSY" });
    expect(await lineRow(w)).toEqual({ waits_for: "PERSON", person_recheck_at: nextWholeMinute(now) });
    expect(await line.siteLineBlocking(now)).toBe(false);

    const B = await activeOwner();
    expect(await room.decide(questionOf(B), async ({ admission }) => admission)).toEqual(expect.objectContaining({ kind: "START" }));

    const waiting = await line.readWaiting(w);
    expect(waiting).not.toBeNull();
    expect(waiting).toEqual(expect.objectContaining({ ownerRef: A, releaseKey: R, registerVersion: 1 }));
    expect(await room.startWaiting(waiting!, enqueue)).toEqual({ kind: "PERSON_FULL" });
    expect(await holdCount(w)).toBe(0);
    expect(await jobsOf(w)).toEqual([]);
    expect((await lineRow(w))?.waits_for).toBe("PERSON");

    await settleJob(a1Job);
    const again = await line.readWaiting(w);
    expect(again).not.toBeNull();
    const started = await room.startWaiting(again!, enqueue);
    const jobs = await jobsOf(w);
    expect(jobs).toEqual([expect.objectContaining({ state: "READY" })]);
    expect(started).toEqual({ kind: "STARTED", runId: w, value: jobs[0]!.work_item_id });
    expect(await holdCount(w)).toBe(1);
  });

  it("with two waiting questions, a person at their share still holds nobody back after the waker's tick", async () => {
    let at = new Date("2034-03-01T11:00:20.000Z");
    const A = fixture.ownerRef;
    const line = new RunWaitRepository(fixture.database.pool);
    const room = roomOf({ waitingLinePerPerson: 2, clock: () => at });
    for (let index = 0; index < 2; index += 1) await liveJob(await fixture.createEncryptedRun(QUESTION, { releaseKey: R }));
    const w1 = await fixture.createEncryptedRun(QUESTION, { releaseKey: R });
    const w2 = await fixture.createEncryptedRun(QUESTION, { releaseKey: R });

    expect(await room.decide(questionOf(A), enterOnWait(room, w1))).toEqual(expect.objectContaining({ kind: "WAIT", cause: "PERSON_BUSY" }));
    expect(await room.decide(questionOf(A), enterOnWait(room, w2))).toEqual(expect.objectContaining({ kind: "WAIT", cause: "PERSON_BUSY" }));

    // Both recheck instants (11:01:00) have passed: the stale moment the waker's tick must close.
    at = new Date("2034-03-01T11:01:01.000Z");
    expect(await line.siteLineBlocking(at)).toBe(true);

    const waiting = await line.readWaiting(w1);
    expect(waiting).not.toBeNull();
    expect(await room.startWaiting(waiting!, enqueue)).toEqual({ kind: "PERSON_FULL" });
    expect(await line.siteLineBlocking(at)).toBe(false);
    const recheck = new Date("2034-03-01T11:02:00.000Z");
    expect(await lineRow(w1)).toEqual({ waits_for: "PERSON", person_recheck_at: recheck });
    expect(await lineRow(w2)).toEqual({ waits_for: "PERSON", person_recheck_at: recheck });
  });
});
