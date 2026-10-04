import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { WorkItemRepository } from "@debateai/battery";
import { PostgresModelSpendStore, costEnvelopeDay, withSpendDecisionLock } from "@debateai/budget";
import { RunRepository, RunWaitRepository, migrate } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Migration 0083 (budget spec §2.6, §2.7, §2.9): the holds, the waiting line, why
 * each run waits, and the owner record of cheaper models — in real SQL — and the
 * first job queued on a caller's transaction. CI skips this directory, so run it
 * before merging the migration.
 */
let database: TestDatabase;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 600_000);

afterAll(async () => {
  await database?.stop();
});

/** Every test starts with no live job: a hold left counting by one test would fill the next one's day. */
afterEach(async () => {
  await database.pool.query(
    "UPDATE core.work_item SET state='DONE', claimed_by=NULL, claim_deadline=NULL WHERE state IN ('READY','CLAIMED')"
  );
});

async function legacyRun(
  askerId = `hold:${randomUUID()}`,
  planTier: "free" | "premium" | "none" = "free"
): Promise<string> {
  return new RunRepository(database.pool).startRun({
    questionLine: "Does a hold stop counting when its run ends?",
    principal: { kind: "legacy", legacyAskerId: askerId },
    sessionId: randomUUID(),
    callerScope: "ASKER",
    asOf: new Date(),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "asker:test",
    compositionBudgetTier: "low",
    ...(planTier === "none" ? {} : { planTier }),
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2),
    strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4),
    registerVersion: 1,
    batteryVersion: "test",
    askContract: {},
    batteryRows: []
  });
}

async function readyJob(runId: string): Promise<string> {
  return new WorkItemRepository(database.pool).enqueue({
    runId, batteryRowId: "Q1", commandKey: `S00:${runId}:Q1`, nodeSet: []
  });
}

async function charge(runId: string, micros: number, source: "RUN" | "STORY" = "RUN"): Promise<void> {
  await database.pool.query(
    `INSERT INTO ledger.model_spend
       (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
     VALUES ($1,$2,$3,'provider-1',current_date,$4,1,1)`,
    [randomUUID(), source, runId, micros]
  );
}

async function inTransaction<T>(use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await use(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/** An active account, so a run's ownership event can name it (the lock trigger checks it). */
async function activeOwner(): Promise<string> {
  const ownerRef = randomUUID();
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [randomUUID(), randomBytes(32), `waiting-${randomUUID()}`, randomUUID(), ownerRef]
  );
  return ownerRef;
}

const TODAY = () => costEnvelopeDay(new Date());
const APPEND_ONLY = [
  "ledger.model_spend_hold", "core.run_wait", "core.run_wait_start", "core.run_wait_reason", "core.run_cost_substitution"
] as const;

describe("B3 migration 0083 — five append-only tables, verified", () => {
  it("installs the truncate guard and the reject-mutation trigger on all five", async () => {
    const triggers = await database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM pg_catalog.pg_trigger AS trigger
       WHERE NOT trigger.tgisinternal AND trigger.tgenabled IN ('O','A')
         AND trigger.tgfoid = ANY(ARRAY['core.reject_truncate()'::regprocedure,'core.reject_mutation()'::regprocedure])
         AND trigger.tgrelid = ANY($1::regclass[])`,
      [APPEND_ONLY]
    );
    expect(triggers.rows[0]?.count).toBe("10");
  });

  it("refuses UPDATE, DELETE and TRUNCATE on each, owner included", async () => {
    const runId = await legacyRun();
    await readyJob(runId);
    const store = new PostgresModelSpendStore(database.pool);
    const waits = new RunWaitRepository(database.pool);
    await inTransaction(async (client) => {
      await store.openHold(client, { runId, heldMicros: 10 });
      await waits.enterWait(client, runId, new Date());
      await waits.recordReason(client, runId, { waitsFor: "SITE", personRecheckAt: null, at: new Date() });
      await waits.markStarted(client, runId, new Date());
      await client.query(
        `INSERT INTO core.run_cost_substitution
           (substitution_id, run_id, call_site_key, planned_provider_ref, used_provider_ref, reason)
         VALUES ($1,$2,'JUDGE:root:0','provider:dear','provider:cheap','RUN_ARGUING')`,
        [randomUUID(), runId]
      );
    });
    for (const table of APPEND_ONLY) {
      await expect(database.pool.query(`UPDATE ${table} SET run_id = run_id`), `${table} UPDATE`).rejects.toThrowError();
      await expect(database.pool.query(`DELETE FROM ${table}`), `${table} DELETE`).rejects.toThrowError();
      await expect(database.pool.query(`TRUNCATE ${table} CASCADE`), `${table} TRUNCATE`).rejects.toThrowError();
    }
  });

  it("is replay-safe: applying the file again changes nothing", async () => {
    const sql = await readFile(new URL("../../migrations/0083_budget_holds_waiting_line.sql", import.meta.url), "utf8");
    await database.pool.query(sql);
    const view = await database.pool.query<{ exists: boolean }>(
      "SELECT to_regclass('core.run_waiting_v') IS NOT NULL AS exists"
    );
    expect(view.rows[0]?.exists).toBe(true);
  });

  it("admits the stop kind ALLOWANCE on the owner's disclosure row, for the arguing and the answer alike (R-20)", async () => {
    const definitions = await database.pool.query<{ name: string; definition: string }>(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS definition
       FROM pg_catalog.pg_constraint
       WHERE conrelid = 'serve.serve_disclosure'::regclass
         AND conname IN ('serve_disclosure_body_stop_check', 'serve_disclosure_serve_stop_check')
       ORDER BY conname`
    );
    // Exactly one of each, after the replay above: dropped and re-created, never doubled.
    expect(definitions.rows.map((row) => row.name))
      .toEqual(["serve_disclosure_body_stop_check", "serve_disclosure_serve_stop_check"]);
    for (const row of definitions.rows) {
      expect(row.definition, row.name).toContain("'ALLOWANCE'");
      expect(row.definition, row.name).toContain("'DAILY'");
    }
    expect(definitions.rows[1]?.definition).toContain("'NO_ARTIFACT'");
  });

  it("refuses a zero hold, a second hold for one run, an unknown substitution reason and a start with no wait", async () => {
    const runId = await legacyRun();
    const store = new PostgresModelSpendStore(database.pool);
    await expect(inTransaction((client) => store.openHold(client, { runId, heldMicros: 0 }))).rejects.toThrow(TypeError);
    await expect(database.pool.query(
      "INSERT INTO ledger.model_spend_hold (hold_id, run_id, held_micros, opened_at) VALUES ($1,$2,0,now())",
      [randomUUID(), runId]
    )).rejects.toThrowError(/held_micros/u);
    await inTransaction((client) => store.openHold(client, { runId, heldMicros: 5 }));
    await expect(inTransaction((client) => store.openHold(client, { runId, heldMicros: 5 })))
      .rejects.toThrowError(/model_spend_hold_run_id_key/u);
    await expect(database.pool.query(
      `INSERT INTO core.run_cost_substitution
         (substitution_id, run_id, call_site_key, planned_provider_ref, used_provider_ref, reason)
       VALUES ($1,$2,'JUDGE:root:0','provider:a','provider:b','PANEL')`,
      [randomUUID(), runId]
    )).rejects.toThrowError(/reason/u);
    await expect(database.pool.query(
      `INSERT INTO core.run_cost_substitution
         (substitution_id, run_id, call_site_key, planned_provider_ref, used_provider_ref, reason)
       VALUES ($1,$2,'JUDGE:root:0','provider:a','provider:a','SITE_DAY')`,
      [randomUUID(), runId]
    )).rejects.toThrowError(/run_cost_substitution_changes_the_model/u);
    await expect(database.pool.query(
      "INSERT INTO core.run_wait_start (run_id, started_at) VALUES ($1, now())", [await legacyRun()]
    )).rejects.toThrowError(/violates foreign key constraint/u);
  });
});

describe("B3 a hold counts its unspent part while its run is live (budget spec §2.6)", () => {
  it("counts the hold minus the run's RUN and STORY spend, never below zero", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const runId = await legacyRun();
    await readyJob(runId);
    await inTransaction((client) => store.openHold(client, { runId, heldMicros: 500 }));
    expect(await store.readSiteCountedHoldsMicros(TODAY())).toBe(500);
    await charge(runId, 200);
    expect(await store.readSiteCountedHoldsMicros(TODAY())).toBe(300);
    await charge(runId, 100, "STORY");
    expect(await store.readSiteCountedHoldsMicros(TODAY())).toBe(200);
    await charge(runId, 900);
    expect(await store.readSiteCountedHoldsMicros(TODAY())).toBe(0);
  });

  it("stops counting when the run has no READY or CLAIMED job: DONE, FAILED, or none at all", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const work = new WorkItemRepository(database.pool);
    const done = await legacyRun();
    const workItemId = await readyJob(done);
    const failed = await legacyRun();
    await readyJob(failed);
    const bornDead = await legacyRun();
    await inTransaction(async (client) => {
      for (const runId of [done, failed, bornDead]) await store.openHold(client, { runId, heldMicros: 1_000 });
    });
    expect(await store.readSiteCountedHoldsMicros(TODAY())).toBe(2_000);
    await work.settle({ workItemId, attemptId: randomUUID(), artifactRef: randomUUID() });
    await work.recordSetupFailure({ runId: failed, batteryRowId: "Q1", commandKey: `S00:${failed}:Q1`, reason: "RUN_SETUP_FAILED:DISPATCH" });
    expect(await store.readSiteCountedHoldsMicros(TODAY())).toBe(0);
  });

  it("does not count a hold opened after the day asked about", async () => {
    const store = new PostgresModelSpendStore(database.pool);
    const runId = await legacyRun();
    await readyJob(runId);
    await inTransaction((client) => store.openHold(client, { runId, heldMicros: 700 }));
    expect(await store.readSiteCountedHoldsMicros("2020-01-01")).toBe(0);
    expect(await store.readSiteCountedHoldsMicros(TODAY())).toBe(700);
  });
});

describe("B3 the waiting line (budget spec §2.7)", () => {
  it("lists a waiting run oldest first with its class, until it starts or fails", async () => {
    const waits = new RunWaitRepository(database.pool);
    const askerId = `line:${randomUUID()}`;
    const first = await legacyRun(askerId);
    const second = await legacyRun(askerId);
    const since = new Date("2031-01-01T10:00:00.000Z");
    await inTransaction(async (client) => {
      await waits.enterWait(client, second, new Date(since.getTime() + 1_000));
      await waits.enterWait(client, first, since);
    });
    expect(await waits.waitingForLegacyAsker(askerId)).toEqual([
      { runId: first, waitingSince: since },
      { runId: second, waitingSince: new Date(since.getTime() + 1_000) }
    ]);
    expect(await waits.readWaiting(first)).toEqual({
      runId: first, waitingSince: since, ownerRef: null, legacyAskerId: askerId,
      planTier: "free", compositionBudgetTier: "low", depth: 1, makerCount: 2,
      waitsFor: null, personRecheckAt: null, reasonAt: null
    });
    expect(await waits.isWaiting(database.pool, first)).toBe(true);
    const oldest = (await waits.oldestWaiting(1_000)).map((run) => run.runId);
    expect(oldest.indexOf(first)).toBeLessThan(oldest.indexOf(second));
    const counted = await waits.countWaiting();
    expect(counted).toBeGreaterThanOrEqual(2);

    await inTransaction((client) => waits.markStarted(client, first, new Date()));
    await new WorkItemRepository(database.pool).recordSetupFailure({
      runId: second, batteryRowId: "Q1", commandKey: `S00:${second}:Q1`, reason: "RUN_SETUP_FAILED:WAITING_LINE"
    });
    expect(await waits.waitingForLegacyAsker(askerId)).toEqual([]);
    expect(await waits.isWaiting(database.pool, first)).toBe(false);
    expect(await waits.readWaiting(second)).toBeNull();
    expect(await waits.countWaiting()).toBe(counted - 2);
  });

  it("reads a claimed run's owner from its ownership event, never from a column of its own", async () => {
    const waits = new RunWaitRepository(database.pool);
    const ownerRef = await activeOwner();
    const runId = await legacyRun();
    await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
    const at = new Date("2031-01-02T10:00:00.000Z");
    await inTransaction((client) => waits.enterWait(client, runId, at));
    expect(await waits.waitingForOwner(ownerRef)).toEqual([{ runId, waitingSince: at }]);
    expect(await waits.readWaiting(runId)).toMatchObject({ ownerRef, legacyAskerId: null });
  });

  it("drops an owner's run, encrypted or not, once the owner's account is suspended, age-frozen or erased", async () => {
    // This fixture's runs are NOT encrypted (legacy start, then claimed): only the account filter can drop them.
    const waits = new RunWaitRepository(database.pool);
    const suspended = await activeOwner();
    const frozen = await activeOwner();
    const erased = await activeOwner();
    const at = new Date("2031-01-03T10:00:00.000Z");
    const runs: string[] = [];
    for (const ownerRef of [suspended, frozen, erased]) {
      const runId = await legacyRun();
      await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
      await inTransaction((client) => waits.enterWait(client, runId, at));
      runs.push(runId);
    }
    expect((await waits.waitingForOwner(suspended)).map((run) => run.runId)).toEqual([runs[0]]);
    expect((await waits.waitingForOwner(frozen)).map((run) => run.runId)).toEqual([runs[1]]);
    await database.pool.query(`UPDATE identity."user" SET state='suspended' WHERE owner_ref=$1`, [suspended]);
    // Dev's 0077: the age interstitial freezes an existing account it refuses (identity.confirm_account_age_with_audit).
    await database.pool.query(`UPDATE identity."user" SET state='age_frozen' WHERE owner_ref=$1`, [frozen]);
    await database.pool.query(`DELETE FROM identity."user" WHERE owner_ref=$1`, [erased]);
    expect(await waits.waitingForOwner(suspended)).toEqual([]);
    expect(await waits.waitingForOwner(frozen)).toEqual([]);
    expect(await waits.waitingForOwner(erased)).toEqual([]);
    const line = (await waits.oldestWaiting(1_000)).map((run) => run.runId);
    for (const runId of runs) expect(line).not.toContain(runId);
    expect(await waits.readWaiting(runs[1]!)).toBeNull();
    expect(await waits.readWaiting(runs[2]!)).toBeNull();
    // A reactivated account's run is back in line: nothing was written or lost.
    await database.pool.query(`UPDATE identity."user" SET state='active' WHERE owner_ref=$1`, [suspended]);
    expect((await waits.waitingForOwner(suspended)).map((run) => run.runId)).toEqual([runs[0]]);
  });
});

describe("B3 why a run waits (budget spec §2.3 rule 1)", () => {
  it("reads each run's LATEST reason with the line, and refuses a reason that does not say its instant", async () => {
    const waits = new RunWaitRepository(database.pool);
    const runId = await legacyRun();
    const since = new Date("2031-01-04T10:00:00.000Z");
    const recheck = new Date("2031-01-05T09:00:00.000Z");
    await inTransaction(async (client) => {
      await waits.enterWait(client, runId, since);
      await waits.recordReason(client, runId, { waitsFor: "SITE", personRecheckAt: null, at: since });
    });
    expect(await waits.readWaiting(runId)).toMatchObject({ waitsFor: "SITE", personRecheckAt: null, reasonAt: since });
    const later = new Date(since.getTime() + 60_000);
    await inTransaction((client) => waits.recordReason(client, runId, { waitsFor: "PERSON", personRecheckAt: recheck, at: later }));
    expect(await waits.readWaiting(runId)).toMatchObject({ waitsFor: "PERSON", personRecheckAt: recheck, reasonAt: later });

    for (const [waitsFor, recheckAt] of [["PERSON", null], ["SITE", recheck]] as const) {
      await expect(database.pool.query(
        `INSERT INTO core.run_wait_reason (reason_id, run_id, evaluated_at, waits_for, person_recheck_at)
         VALUES (gen_random_uuid(), $1, now(), $2, $3)`,
        [runId, waitsFor, recheckAt]
      ), waitsFor).rejects.toThrowError(/run_wait_reason/u);
    }
    await expect(inTransaction((client) => waits.recordReason(client, runId, {
      waitsFor: "PERSON", personRecheckAt: null as unknown as Date, at: later
    }))).rejects.toThrow("RUN_WAIT_REASON_INVALID");
  });
});

describe("B3 the first job on the caller's transaction (WorkItemRepository.enqueueOn)", () => {
  it("writes nothing another connection can see until that transaction commits, and nothing if it rolls back", async () => {
    const work = new WorkItemRepository(database.pool);
    const rolledBack = await legacyRun();
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      await work.enqueueOn(client, { runId: rolledBack, batteryRowId: "Q1", commandKey: `S00:${rolledBack}:Q1`, nodeSet: [] });
      const seen = await database.pool.query("SELECT 1 FROM core.work_item WHERE run_id=$1", [rolledBack]);
      expect(seen.rows).toEqual([]);
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    expect((await database.pool.query("SELECT 1 FROM core.work_item WHERE run_id=$1", [rolledBack])).rows).toEqual([]);
    expect((await work.listDispatchable(1_000)).map((item) => item.runId)).not.toContain(rolledBack);

    const committed = await legacyRun();
    const id = await inTransaction((tx) => work.enqueueOn(tx, {
      runId: committed, batteryRowId: "Q1", commandKey: `S00:${committed}:Q1`, nodeSet: []
    }));
    // `enqueue` is the same statement on a transaction of its own: the command key answers the same job.
    await expect(work.enqueue({ runId: committed, batteryRowId: "Q1", commandKey: `S00:${committed}:Q1`, nodeSet: [] }))
      .resolves.toBe(id);
    expect((await work.listDispatchable(1_000)).map((item) => item.workItemId)).toContain(id);
  });
});

describe("B3 withSpendDecisionLock serialises decisions on one day", () => {
  it("makes a second decision on the same day wait for the first to commit, and a decision on another day not wait", async () => {
    const events: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstMayFinish = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let firstEntered: () => void = () => undefined;
    const firstIsIn = new Promise<void>((resolve) => { firstEntered = resolve; });
    const first = withSpendDecisionLock(database.pool, { day: "2031-02-01", ownerRef: null }, async () => {
      events.push("first:in");
      firstEntered();
      await firstMayFinish;
      events.push("first:out");
    });
    await firstIsIn;
    const second = withSpendDecisionLock(database.pool, { day: "2031-02-01", ownerRef: null }, async () => {
      events.push("second:in");
    });
    await withSpendDecisionLock(database.pool, { day: "2031-02-02", ownerRef: null }, async () => {
      events.push("other-day:in");
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(events).toEqual(["first:in", "other-day:in"]);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(["first:in", "other-day:in", "first:out", "second:in"]);
  });

  it("holds the day lock, and the person lock when there is a person, inside one transaction", async () => {
    const held = async (ownerRef: string | null) => withSpendDecisionLock(
      database.pool, { day: "2031-02-03", ownerRef },
      async (client) => Number((await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid()"
      )).rows[0]?.count)
    );
    expect(await held(null)).toBe(1);
    expect(await held(randomUUID())).toBe(2);
  });

  it("rolls back what the decision wrote when it throws", async () => {
    const runId = await legacyRun();
    const waits = new RunWaitRepository(database.pool);
    await expect(withSpendDecisionLock(database.pool, { day: "2031-02-04", ownerRef: null }, async (client) => {
      await waits.enterWait(client, runId, new Date());
      throw new Error("test: the decision failed");
    })).rejects.toThrow("test: the decision failed");
    expect(await waits.isWaiting(database.pool, runId)).toBe(false);
  });

  it("refuses a day that is not YYYY-MM-DD", async () => {
    await expect(withSpendDecisionLock(database.pool, { day: "tomorrow", ownerRef: null }, async () => 1))
      .rejects.toThrow("SPEND_DECISION_DAY_INVALID");
  });
});

describe("Part 4 final review C-10: the runbook's billing-on count, run exactly as README §14.8 writes it", () => {
  it("counts every waiting paid question of an existing account, whatever the account's state, and nothing else", async () => {
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    const line = readme.split("\n")
      .find((text) => text.startsWith("sudo -u postgres psql -d debateai -c \"SELECT count(*) AS waiting_premium")) ?? "";
    expect(line.endsWith("\"")).toBe(true);
    // The shell hands psql the text between -c " and the closing quote, with each \" read as ".
    const sql = line.slice(line.indexOf("-c \"") + 4, -1).replaceAll("\\\"", "\"");
    expect(sql).toMatch(/^SELECT count\(\*\) AS waiting_premium, count\(\*\) FILTER/u);
    const count = async (): Promise<readonly [number, number]> => {
      const row = (await database.pool.query<{ waiting_premium: string; of_accounts_not_active: string }>(sql)).rows[0]!;
      return [Number(row.waiting_premium), Number(row.of_accounts_not_active)] as const;
    };
    const viewCount = async (): Promise<number> => Number((await database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM core.run_waiting_v WHERE owner_ref IS NOT NULL AND plan_tier IS DISTINCT FROM 'free'"
    )).rows[0]?.count);
    const [before, beforeInactive] = await count();
    const viewBefore = await viewCount();

    const waits = new RunWaitRepository(database.pool);
    const waiting = async (ownerRef: string | null, planTier: "free" | "premium" | "none"): Promise<string> => {
      const runId = await legacyRun(`billing-on:${randomUUID()}`, planTier);
      if (ownerRef !== null) await database.pool.query("SELECT core.append_run_ownership_event($1,$2)", [runId, ownerRef]);
      await inTransaction((client) => waits.enterWait(client, runId, new Date("2031-03-01T10:00:00.000Z")));
      return runId;
    };
    const active = await activeOwner();
    const suspended = await activeOwner();
    const frozen = await activeOwner();
    const erased = await activeOwner();

    // Counted: a paid question, a question with no recorded plan (a paid one to the site), and the paid questions of a
    // suspended and an age-frozen account. Neither starts: the waker reads only core.run_waiting_v, which needs an
    // active account. Suspended is only an account deletion's prepared state, which ends by deleting the account row,
    // so that question leaves the count by itself; nothing makes an age-frozen account active again, so its question
    // stays counted.
    await waiting(active, "premium");
    await waiting(active, "none");
    await waiting(suspended, "premium");
    await waiting(frozen, "premium");
    // Not counted: a Free question, a legacy asker's, an erased account's, a started one, a failed one, and an
    // encrypted debate its person deleted (both erasure marks); none of them can ever meet PLAN_CHANGED.
    await waiting(active, "free");
    await waiting(null, "premium");
    await waiting(erased, "premium");
    const started = await waiting(active, "premium");
    await inTransaction((client) => waits.markStarted(client, started, new Date()));
    const failed = await waiting(active, "premium");
    await new WorkItemRepository(database.pool).recordSetupFailure({
      runId: failed, batteryRowId: "Q1", commandKey: `S00:${failed}:Q1`, reason: "RUN_SETUP_FAILED:WAITING_LINE"
    });
    const tombstoned = await waiting(active, "premium");
    await database.pool.query(
      `INSERT INTO serve.private_run_erasure_tombstone (run_id, completed_at, destroyed_key_count, already_absent_key_count)
       VALUES ($1, now(), 1, 0)`,
      [tombstoned]
    );
    const cleaning = await waiting(active, "premium");
    await database.pool.query(
      `INSERT INTO serve.private_run_key_cleanup_intent (request_ref, user_id, run_id, requested_at, cleanup_publication_refs)
       SELECT $1, account.user_id, $2, now(), '{}'::uuid[] FROM identity."user" AS account WHERE account.owner_ref = $3`,
      [randomUUID(), cleaning, active]
    );
    await database.pool.query(`UPDATE identity."user" SET state='suspended' WHERE owner_ref=$1`, [suspended]);
    await database.pool.query(`UPDATE identity."user" SET state='age_frozen' WHERE owner_ref=$1`, [frozen]);
    await database.pool.query(`DELETE FROM identity."user" WHERE owner_ref=$1`, [erased]);

    expect(await count()).toEqual([before + 4, beforeInactive + 2]);
    // The view the earlier check read hides the suspended and the frozen account's questions: the gap C-10 closes.
    // (It does count the two runs with erasure marks, but only because this fixture's runs are not encrypted: the
    // view reads those marks for an encrypted run only, and only a private debate ever carries them.)
    expect(await viewCount()).toBe(viewBefore + 4);
  });
});
