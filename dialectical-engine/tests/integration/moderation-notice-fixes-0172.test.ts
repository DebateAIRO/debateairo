// tests/integration/moderation-notice-fixes-0172.test.ts
// Migration 0172 (the moderation notices' seven gaps after 0157, the owner's list of 10 Nov 2026) on real PostgreSQL, through the API's runtime
// login as the sender calls it. One describe per gap, named as the migration names it. Data is made up.
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, PostgresModerationStatementRepository } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const timeout = 300_000;
let database: TestDatabase;
/** The API's runtime login, as the sender's claim runs on it: SET ROLE on every new connection of the test's superuser. */
let runtime: Pool;
let sequence = 9_950_000;
// Who the staff alert goes to: the active Owner and the active team-limit holder, as 0151's notices (seeded once, by the first describe).
const owner = randomUUID();
const holder = randomUUID();

type Account = Readonly<{ userId: string; ownerRef: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `notice-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef };
}
async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
/** A public debate of `owner`'s: its run, its ownership event, its snapshot and its PUBLISHED event. */
async function publishedDebate(owner: Account): Promise<string> {
  const runId = randomUUID();
  const ref = randomUUID();
  const seq = ++sequence;
  await seeded([
    [`INSERT INTO core.run
      (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,
       tier_source,tier_provenance_ref,composition_budget_tier,depth_params,agent_count,discovered_panel,
       stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,
       question_blind_index_version,content_encryption_version)
      VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low',
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,1)`, [runId, `owner:${owner.ownerRef}`, randomUUID(), seq]],
    ["INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner.ownerRef, seq]],
    ["INSERT INTO core.publication_ref_tombstone (ref,ref_kind,created_at) VALUES ($1,'publication_ref',now())", [ref]],
    ["INSERT INTO serve.publication_snapshot (publication_ref,run_id,format_version,content_ciphertext,created_at) VALUES ($1,$2,1,$3::jsonb,now())",
      [ref, runId, JSON.stringify({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "AAAA", tag: "AAAA", ct: "YQ==" })]],
    [`INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
      VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',now(),$5)`, [randomUUID(), runId, ref, randomUUID(), ++sequence]]]);
  return ref;
}
/** 0150's hold, as its log writes it: a HIDE row. Returns its event id. */
async function hide(ref: string): Promise<string> {
  const eventId = randomUUID();
  await seeded([[`INSERT INTO identity.public_review_event (event_id,publication_ref,revision,action,actor_staff_id,operation_id,request_sha256)
    VALUES ($1,$2,1,'HIDE',$3,$4,$5)`, [eventId, ref, randomUUID(), randomUUID(), "0".repeat(64)]]]);
  return eventId;
}

/**
 * R4 (the controller's ruling): a genuine fault for one marked source, made by the test itself. A trigger on the statements raises for one debate's
 * row, inside the queue's own work for that source; dropping it is "fixing the data".
 */
async function breakDebate(ref: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/u.test(ref)) throw new Error("NOT_A_UUID");
  await database.pool.query(`CREATE OR REPLACE FUNCTION public.test_0172_fault() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.publication_ref = '${ref}'::uuid THEN RAISE EXCEPTION USING ERRCODE = 'XX001', MESSAGE = 'TEST_0172_FAULT'; END IF; RETURN NEW; END $$`);
  await database.pool.query("DROP TRIGGER IF EXISTS test_0172_fault ON identity.moderation_statement");
  await database.pool.query("CREATE TRIGGER test_0172_fault BEFORE INSERT ON identity.moderation_statement FOR EACH ROW EXECUTE FUNCTION public.test_0172_fault()");
}
async function mendDebate(): Promise<void> {
  await database.pool.query("DROP TRIGGER IF EXISTS test_0172_fault ON identity.moderation_statement");
}

type Stuck = Readonly<{ source_id: string; sqlstate: string; tries: number }>;
const stuck = async (): Promise<Stuck[]> =>
  (await database.pool.query<Stuck>("SELECT source_id, sqlstate, tries FROM identity.moderation_statement_stuck ORDER BY source_id")).rows;
const alerts = async (source: string): Promise<string[]> =>
  (await database.pool.query<{ recipient_staff_id: string }>("SELECT recipient_staff_id FROM staff.public_flag_notice WHERE operation_id=$1 AND kind='MODERATION_MAIL_FAILED' ORDER BY recipient_staff_id",
    [source])).rows.map((row) => row.recipient_staff_id);
const seen = async (source: string): Promise<boolean> =>
  (await database.pool.query("SELECT 1 FROM identity.moderation_statement_seen WHERE source_id=$1", [source])).rowCount === 1;
const statementsOf = async (ids: readonly string[]): Promise<Array<{ publication_ref: string; kind: string }>> =>
  (await database.pool.query<{ publication_ref: string; kind: string }>("SELECT publication_ref, kind FROM identity.moderation_statement WHERE statement_id = ANY($1::uuid[]) ORDER BY created_at",
    [ids])).rows;
/** The stuck row's last failure, an hour and a minute ago. */
const anHourLater = async (source: string): Promise<void> => {
  await database.pool.query("UPDATE identity.moderation_statement_stuck SET last_failed_at = last_failed_at - interval '61 minutes', first_failed_at = first_failed_at - interval '61 minutes' WHERE source_id=$1", [source]);
};

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  runtime = new Pool({ connectionString: database.connectionString, max: 2 });
  runtime.on("connect", (client) => { void client.query("SET ROLE debateai_runtime"); });
}, timeout);
afterAll(async () => {
  await runtime?.end();
  await database?.stop();
}, timeout);

describe("M5: one bad row never stops the moderation mail", () => {
  let broken: Readonly<{ ref: string; event: string }>;
  let healthy: Readonly<{ ref: string; event: string }>;

  beforeAll(async () => {
    await seeded([
      ["INSERT INTO staff.owner_designation (staff_id, active) VALUES ($1, true)", [owner]],
      ["INSERT INTO staff.team_limit_holder (staff_id, active, granted_by_staff_id, granted_operation_id) VALUES ($1, true, $2, $3)", [holder, owner, randomUUID()]]]);
  }, timeout);

  it("a source row that raises is set aside and the others are queued", async () => {
    const [ana, bea] = [await account(), await account()];
    const first = await publishedDebate(ana);
    broken = { ref: first, event: await hide(first) };
    const second = await publishedDebate(bea);
    healthy = { ref: second, event: await hide(second) };
    await breakDebate(broken.ref);

    // The sender's claim, on the API's runtime login: the first source raises, the second is queued and claimed all the same.
    const claims = await new PostgresModerationStatementRepository(runtime).claim(100);
    expect(await statementsOf(claims.map((claim) => claim.statementId))).toEqual([{ publication_ref: healthy.ref, kind: "DEBATE_HIDDEN" }]);
    // The bad source's work rolled back (its seen row too), and it is set aside once, with its SQLSTATE, never its words.
    expect(await seen(broken.event)).toBe(false);
    expect(await seen(healthy.event)).toBe(true);
    expect(await stuck()).toEqual([{ source_id: broken.event, sqlstate: "XX001", tries: 1 }]);
    // On its first failure, one staff alert per active Owner and team-limit holder, keyed by the source.
    expect(await alerts(broken.event)).toEqual([owner, holder].sort());
    // Inside the hour it is not tried again: the next claims leave it alone.
    await new PostgresModerationStatementRepository(runtime).claim(100);
    expect(await stuck()).toEqual([{ source_id: broken.event, sqlstate: "XX001", tries: 1 }]);
    // The alert kind is in 0151's CHECK, under its own (catalog) name.
    const check = (await database.pool.query<{ conname: string; definition: string }>(`SELECT k.conname, pg_get_constraintdef(k.oid) AS definition FROM pg_constraint AS k
      WHERE k.conrelid = 'staff.public_flag_notice'::regclass AND k.contype = 'c' AND pg_get_constraintdef(k.oid) LIKE '%PUBLIC_FLAG_WAITING%'`)).rows;
    expect(check).toHaveLength(1);
    expect(check[0]!.conname).toBe("public_flag_notice_kind_check");
    expect(check[0]!.definition).toContain("MODERATION_MAIL_FAILED");
  }, timeout);

  it("a stuck source is retried after an hour and alerted once", async () => {
    await anHourLater(broken.event);
    await new PostgresModerationStatementRepository(runtime).claim(100);
    expect(await stuck()).toEqual([{ source_id: broken.event, sqlstate: "XX001", tries: 2 }]);
    expect(await alerts(broken.event)).toEqual([owner, holder].sort());
    expect(await seen(broken.event)).toBe(false);

    // The data is fixed; an hour later the statement is queued and the stuck row is gone.
    await mendDebate();
    await anHourLater(broken.event);
    const claims = await new PostgresModerationStatementRepository(runtime).claim(100);
    expect(await statementsOf(claims.map((claim) => claim.statementId))).toEqual([{ publication_ref: broken.ref, kind: "DEBATE_HIDDEN" }]);
    expect(await seen(broken.event)).toBe(true);
    expect(await stuck()).toEqual([]);
    expect(await alerts(broken.event)).toEqual([owner, holder].sort());
    // The runtime login reads no table of this step: only the sender's doors.
    const refused = await runtime.query("SELECT count(*) FROM identity.moderation_statement_stuck").then(() => null, (error: { code?: string }) => error.code);
    expect(refused).toBe("42501");
  }, timeout);
});

// M2: a failed send backs off over about three days, then alerts the team. The same cases for the statement and for the reporter's answer.
describe("M2: a failed send backs off, then gives up once and alerts once", () => {
  type Door = Readonly<{
    name: string; table: string; key: string; claimFn: string; completeFn: string;
    /** A new row of this queue, due at once, and its id. */
    make: () => Promise<string>;
  }>;
  const doors: Door[] = [
    { name: "statement", table: "identity.moderation_statement", key: "statement_id", claimFn: "identity.claim_moderation_statements", completeFn: "identity.complete_moderation_statement",
      make: async () => {
        const id = randomUUID();
        const who = await account();
        const ref = await publishedDebate(who);
        await seeded([[`INSERT INTO identity.moderation_statement (statement_id, owner_ref, publication_ref, kind, event_id, happened_at, mail_locale)
          VALUES ($1,$2,$3,'DEBATE_HIDDEN',$4,now(),'en')`, [id, who.ownerRef, ref, randomUUID()]]]);
        return id;
      } },
    { name: "reporter's answer", table: "identity.public_flag_mail", key: "mail_id", claimFn: "identity.claim_public_flag_mail", completeFn: "identity.complete_public_flag_mail",
      make: async () => {
        const id = randomUUID();
        const flagId = randomUUID();
        const reporter = await account();
        const owner2 = await account();
        const ref = await publishedDebate(owner2);
        await seeded([
          [`INSERT INTO identity.public_flag (flag_id, publication_ref, reporter_ref, reason, state, content_deleted_at) VALUES ($1,$2,$3,'CONTENT','QUEUED',now())`, [flagId, ref, reporter.ownerRef]],
          [`INSERT INTO identity.public_flag_mail (mail_id, flag_id, kind, happened_at) VALUES ($1,$2,'NO_BREACH',now())`, [id, flagId]]]);
        return id;
      } }
  ];
  for (const door of doors) {
    const claim = async (id: string): Promise<string | null> => {
      const rows = (await runtime.query<{ id: string; token: string }>(`SELECT ${door.key} AS id, claim_token AS token FROM ${door.claimFn}(100)`)).rows;
      return rows.find((row) => row.id === id)?.token ?? null;
    };
    const complete = async (id: string, token: string, outcome: string): Promise<boolean> =>
      (await runtime.query<{ ok: boolean }>(`SELECT ${door.completeFn}($1,$2,$3) AS ok`, [id, token, outcome])).rows[0]!.ok;
    const row = async (id: string) => (await database.pool.query<{ attempts: number; failed_at: Date | null; delivered_at: Date | null; wait: number | null }>(
      `SELECT attempts, failed_at, delivered_at, extract(epoch FROM next_attempt_at - clock_timestamp())::float8 AS wait FROM ${door.table} WHERE ${door.key}=$1`, [id])).rows[0]!;
    const due = (id: string) => database.pool.query(`UPDATE ${door.table} SET next_attempt_at = clock_timestamp() - interval '1 second' WHERE ${door.key}=$1`, [id]);
    const notices = async (id: string) => (await database.pool.query<{ recipient_staff_id: string }>(
      "SELECT recipient_staff_id FROM staff.public_flag_notice WHERE operation_id=$1 AND kind='MODERATION_MAIL_FAILED' ORDER BY recipient_staff_id", [id])).rows.map((r) => r.recipient_staff_id);

    it(`${door.name}: a failed send waits before its next try`, async () => {
      const id = await door.make();
      // Waits after tries 1, 2, 3 are 1, 2, 4 minutes; after try 10 it is the 6-hour ceiling.
      for (const minutes of [1, 2, 4]) {
        const token = await claim(id);
        expect(token).not.toBeNull();
        expect(await complete(id, token!, "RETRY")).toBe(true);
        expect(Math.abs((await row(id)).wait! - minutes * 60)).toBeLessThan(1.5);
        // Straight away it is not claimable; once its time has come it is.
        expect(await claim(id)).toBeNull();
        await due(id);
      }
      for (let tries = 4; tries < 10; tries += 1) {
        const token = await claim(id);
        expect(token).not.toBeNull();
        await complete(id, token!, "RETRY");
        await due(id);
      }
      const token = await claim(id);
      await complete(id, token!, "RETRY");
      const after = await row(id);
      expect(after.attempts).toBe(10);
      expect(Math.abs(after.wait! - 6 * 3600)).toBeLessThan(1.5);
    }, timeout);

    it(`${door.name}: the 20th failure gives up once and alerts once`, async () => {
      const id = await door.make();
      for (let tries = 1; tries <= 20; tries += 1) {
        const token = await claim(id);
        expect(token, `try ${tries}`).not.toBeNull();
        expect(await complete(id, token!, "RETRY")).toBe(true);
        if (tries < 20) { expect((await row(id)).failed_at, `try ${tries}`).toBeNull(); expect(await notices(id)).toEqual([]); await due(id); }
      }
      const done = await row(id);
      expect(done.attempts).toBe(20);
      expect(done.failed_at).not.toBeNull();
      expect(await notices(id)).toEqual([owner, holder].sort());
      // Given up: never claimed again, and no second alert.
      await due(id);
      expect(await claim(id)).toBeNull();
      expect(await notices(id)).toEqual([owner, holder].sort());
    }, timeout);

    it(`${door.name}: 19 failures and then SENT is delivered with no alert; DROPPED never alerts`, async () => {
      const id = await door.make();
      for (let tries = 1; tries <= 19; tries += 1) {
        const token = await claim(id);
        expect(token, `try ${tries}`).not.toBeNull();
        await complete(id, token!, "RETRY");
        await due(id);
      }
      const token = await claim(id);
      expect(await complete(id, token!, "SENT")).toBe(true);
      const sent = await row(id);
      expect(sent.delivered_at).not.toBeNull();
      expect(sent.failed_at).toBeNull();
      expect(sent.wait).toBeNull();
      expect(await notices(id)).toEqual([]);

      const dropped = await door.make();
      const droppedToken = await claim(dropped);
      expect(await complete(dropped, droppedToken!, "DROPPED")).toBe(true);
      expect((await row(dropped)).failed_at).not.toBeNull();
      expect(await notices(dropped)).toEqual([]);
    }, timeout);
  }
});
