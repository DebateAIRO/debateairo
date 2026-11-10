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
// Who the staff alert goes to: the active Owner and the active team-limit holder, as 0151's notices (seeded once, in the top-level beforeAll).
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
  // Every describe's seeds, once: the staff alert's two recipients (only one active Owner may exist).
  await seeded([
    ["INSERT INTO staff.owner_designation (staff_id, active) VALUES ($1, true)", [owner]],
    ["INSERT INTO staff.team_limit_holder (staff_id, active, granted_by_staff_id, granted_operation_id) VALUES ($1, true, $2, $3)", [holder, owner, randomUUID()]]]);
}, timeout);
afterAll(async () => {
  await runtime?.end();
  await database?.stop();
}, timeout);

describe("M5: one bad row never stops the moderation mail", () => {
  let broken: Readonly<{ ref: string; event: string }>;
  let healthy: Readonly<{ ref: string; event: string }>;

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

// M6 and M4 (decision C): a person's review step or DECIDE whose ground names a report closes it as ACTED in the same transaction, and the reporter
// hears one decision: "no breach" never after "acted", "acted" after an earlier "no breach". The steps' identity half, as the staff door calls it.
describe("M6, M4: a review step that acts on a report closes it, and the reporter hears one decision", () => {
  const AUTOMATIC = "00000000-0000-0000-0000-000000000000";
  const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
  /** The close's own operation: md5('review-close:' || the step's log row or decision), as a uuid. */
  const derived = (source: string): string => createHash("md5").update(`review-close:${source}`).digest("hex").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/u, "$1-$2-$3-$4-$5");
  const sealed = (ref: string) => JSON.stringify({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "AAAA", tag: "AAAA", ct: "YQ==" });
  /** A report of `ref`'s by `reporter`, in `state`, with its words sealed. */
  async function reportOf(ref: string, reporter: Account, state: "QUEUED" | "CHECKING" = "QUEUED"): Promise<string> {
    const flagId = randomUUID();
    await database.pool.query("INSERT INTO identity.public_flag (flag_id, publication_ref, reporter_ref, state, content_ciphertext) VALUES ($1,$2,$3,$4,$5::jsonb)",
      [flagId, ref, reporter.ownerRef, state, sealed(ref)]);
    return flagId;
  }
  /** 0150's log row of a step (as its apply writes it), then 0157's ground for it naming the report, as staff.public_review_act_grounded calls it. */
  async function grounded(ref: string, action: "REMOVE_DIG" | "HIDE_REPORT", flagId: string, actor: string): Promise<string> {
    const [eventId, operation] = [randomUUID(), randomUUID()];
    const revision = (await database.pool.query<{ n: number }>("SELECT COALESCE(max(revision),0)::int + 1 AS n FROM identity.public_review_event WHERE publication_ref=$1", [ref])).rows[0]!.n;
    await seeded([[`INSERT INTO identity.public_review_event (event_id,publication_ref,revision,action,piece_kind,piece_id,actor_staff_id,operation_id,request_sha256)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [eventId, ref, revision, action, action === "REMOVE_DIG" ? "DIG" : "REPORT", randomUUID(), actor, operation, "0".repeat(64)]]]);
    await database.pool.query("SELECT identity.record_step_ground($1::uuid,$2::uuid,ARRAY['PERSONAL_DATA'],'REPORT_BUTTON',$3::uuid,$4,$5::jsonb)", [operation, ref, flagId, sha("facts"), sealed(ref)]);
    return eventId;
  }
  /** A person's hide through 0150's own apply and 0157's ground, in one transaction as the staff door runs them. Returns the hide's operation. */
  async function hideNaming(ref: string, flagId: string, actor: string): Promise<string> {
    const operation = randomUUID();
    const client = await database.pool.connect();
    try {
      await client.query("BEGIN");
      const revision = (await client.query<{ n: number }>("SELECT COALESCE(max(revision),0)::int AS n FROM identity.public_review_event WHERE publication_ref=$1", [ref])).rows[0]!.n;
      await client.query("SELECT identity.public_review_apply($1::uuid,'HIDE',$2::uuid,NULL,NULL,NULL,NULL,NULL,$3,$4::uuid,$5)", [actor, ref, revision, operation, sha(operation)]);
      await client.query("SELECT identity.record_hide_ground($1::uuid,$2::uuid,ARRAY['PERSONAL_DATA'],'REPORT_BUTTON',$3::uuid)", [operation, ref, flagId]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    return operation;
  }
  /** A person's close of a report (0157's identity half of staff.public_flag_close). */
  const close = (flagId: string, outcome: "NO_BREACH" | "ACTED", actor: string) =>
    database.pool.query("SELECT identity.public_flag_close($1::uuid,$2,$3::uuid,$4::uuid,$5)", [flagId, outcome, actor, randomUUID(), "0".repeat(64)]);
  type Flag = Readonly<{ dismissed_at: Date | null; dismissed_by: string | null; has_words: boolean }>;
  const flagRow = async (flagId: string): Promise<Flag> => (await database.pool.query<Flag>(
    "SELECT dismissed_at, dismissed_by, content_ciphertext IS NOT NULL AS has_words FROM identity.public_flag WHERE flag_id=$1", [flagId])).rows[0]!;
  type Answer = Readonly<{ outcome: string; actor_staff_id: string; operation_id: string; recorded_at: Date }>;
  const answerOf = async (flagId: string): Promise<Answer | undefined> => (await database.pool.query<Answer>(
    "SELECT outcome, actor_staff_id, operation_id, recorded_at FROM identity.public_flag_answer WHERE flag_id=$1", [flagId])).rows[0];
  /** The reporter's mails, in the order they were queued, after the sender's queue runs. */
  const mailsOf = async (flagId: string): Promise<string[]> => {
    await database.pool.query("SELECT identity.queue_public_flag_mail()");
    return (await database.pool.query<{ kind: string }>("SELECT kind FROM identity.public_flag_mail WHERE flag_id=$1 ORDER BY created_at, mail_id", [flagId])).rows.map((row) => row.kind);
  };
  const queueRow = async (flagId: string) => (await database.pool.query<{ value: Array<Record<string, unknown>> }>("SELECT identity.public_flag_queue_answered() AS value")).rows[0]!
    .value.find((row) => row.flag_id === flagId)!;

  it("a removal naming a report closes it as ACTED", async () => {
    const [ana, rea] = [await account(), await account()];
    const ref = await publishedDebate(ana);
    const flagId = await reportOf(ref, rea);
    const staffer = randomUUID();
    const eventId = await grounded(ref, "REMOVE_DIG", flagId, staffer);
    const flag = await flagRow(flagId);
    expect(flag.dismissed_at).not.toBeNull();
    expect(flag.dismissed_by).toBe(staffer);
    // Its own operation, derived from the step's log row, so it never meets a step's own.
    expect(await answerOf(flagId)).toMatchObject({ outcome: "ACTED", actor_staff_id: staffer, operation_id: derived(eventId) });
    expect((await answerOf(flagId))!.recorded_at.getTime()).toBe(flag.dismissed_at!.getTime());
    expect(await mailsOf(flagId)).toEqual(["RECEIPT", "ACTED"]);
    // Staff's close finds it closed (the panel shows no Close button on it), and staff's queue says a step closed it.
    await expect(close(flagId, "NO_BREACH", randomUUID())).rejects.toMatchObject({ message: "PUBLIC_FLAG_ALREADY_DISMISSED" });
    expect(await queueRow(flagId)).toMatchObject({ outcome: "ACTED", closed_by_step: true });
    expect(await mailsOf(flagId)).toEqual(["RECEIPT", "ACTED"]);
  }, timeout);

  it("a final decision naming a report closes it as ACTED, as a step does", async () => {
    const [ana, rea] = [await account(), await account()];
    const ref = await publishedDebate(ana);
    const flagId = await reportOf(ref, rea);
    await hide(ref);
    const staffer = randomUUID();
    const operation = randomUUID();
    await database.pool.query("SELECT identity.moderation_decide($1::uuid,$2::uuid,ARRAY['PERSONAL_DATA'],'REPORT_BUTTON',$3::uuid,$4,$5::jsonb,1,$6::uuid,$4)",
      [staffer, ref, flagId, sha("decided"), sealed(ref), operation]);
    const decisionId = (await database.pool.query<{ id: string }>("SELECT decision_id AS id FROM identity.moderation_decision WHERE operation_id=$1", [operation])).rows[0]!.id;
    expect((await answerOf(flagId))?.operation_id).toBe(derived(decisionId));
    expect((await flagRow(flagId)).dismissed_by).toBe(staffer);
    expect(await answerOf(flagId)).toMatchObject({ outcome: "ACTED", actor_staff_id: staffer });
    expect(await mailsOf(flagId)).toEqual(["RECEIPT", "ACTED"]);
    expect(await queueRow(flagId)).toMatchObject({ outcome: "ACTED", closed_by_step: true });
    // A person's own close as ACTED is a person's close, not a step's.
    const other = await reportOf(ref, await account());
    await close(other, "ACTED", staffer);
    expect(await queueRow(other)).toMatchObject({ outcome: "ACTED", closed_by_step: false });
  }, timeout);

  it("a hide naming an already closed report still succeeds", async () => {
    const [ana, rea] = [await account(), await account()];
    const ref = await publishedDebate(ana);
    const flagId = await reportOf(ref, rea);
    const [first, second] = [randomUUID(), randomUUID()];
    await close(flagId, "NO_BREACH", first);
    expect(await mailsOf(flagId)).toEqual(["RECEIPT", "NO_BREACH"]);
    const closedAt = (await flagRow(flagId)).dismissed_at;
    // The hide is never refused: its log row and its ground stand; the report is not closed twice, and its answer stays what the person found.
    const operation = await hideNaming(ref, flagId, second);
    const event = (await database.pool.query<{ event_id: string }>("SELECT event_id FROM identity.public_review_event WHERE operation_id=$1 AND action='HIDE'", [operation])).rows[0];
    expect(event).toBeDefined();
    expect((await database.pool.query("SELECT 1 FROM identity.moderation_ground WHERE event_id=$1 AND flag_id=$2 AND source='REPORT_BUTTON'", [event!.event_id, flagId])).rowCount).toBe(1);
    expect(await flagRow(flagId)).toMatchObject({ dismissed_at: closedAt, dismissed_by: first });
    expect(await answerOf(flagId)).toMatchObject({ outcome: "NO_BREACH", actor_staff_id: first });
    // Decision C: "acted" may follow an earlier "no breach" (a later, real decision); never the reverse.
    expect(await mailsOf(flagId)).toEqual(["RECEIPT", "NO_BREACH", "ACTED"]);
    expect(await queueRow(flagId)).toMatchObject({ outcome: "NO_BREACH", closed_by_step: false });
  }, timeout);

  it("no breach is never mailed once acted is queued or due before it", async () => {
    const [ana, rea, rob] = [await account(), await account(), await account()];
    const ref = await publishedDebate(ana);
    // An ACTED already queued (by any path), then a person's no-breach close: the reporter hears the one decision.
    const queued = await reportOf(ref, rea);
    await seeded([["INSERT INTO identity.public_flag_mail (flag_id, kind, happened_at) VALUES ($1,'ACTED',now())", [queued]]]);
    await close(queued, "NO_BREACH", randomUUID());
    expect(await mailsOf(queued)).toEqual(["ACTED", "RECEIPT"]);
    // A step's ground named the report and its close did not happen; a later no-breach close, both due in one run of the queue: "acted" only.
    const due = await reportOf(ref, rob);
    const [eventId, operation] = [randomUUID(), randomUUID()];
    await seeded([
      [`INSERT INTO identity.public_review_event (event_id,publication_ref,revision,action,piece_kind,piece_id,actor_staff_id,operation_id,request_sha256)
        VALUES ($1,$2,1,'REMOVE_DIG','DIG',$3,$4,$5,$6)`, [eventId, ref, randomUUID(), randomUUID(), operation, "0".repeat(64)]],
      [`INSERT INTO identity.moderation_ground (event_id, publication_ref, grounds, source, flag_id, facts_sha256, facts_ciphertext, interim)
        VALUES ($1,$2,ARRAY['PERSONAL_DATA'],'REPORT_BUTTON',$3,$4,$5::jsonb,false)`, [eventId, ref, due, sha("facts"), sealed(ref)]]]);
    await close(due, "NO_BREACH", randomUUID());
    expect(await mailsOf(due)).toEqual(["RECEIPT", "ACTED"]);
  }, timeout);

  it("a close that fails is skipped with a warning and no words, and the step stands", async () => {
    const [ana, rea] = [await account(), await account()];
    const ref = await publishedDebate(ana);
    const flagId = await reportOf(ref, rea);
    await database.pool.query(`CREATE OR REPLACE FUNCTION public.test_0172_answer_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.flag_id = '${flagId}'::uuid THEN RAISE EXCEPTION USING ERRCODE = 'XX001', MESSAGE = 'TEST_0172_SECRET_WORDS'; END IF; RETURN NEW; END $$`);
    await database.pool.query("CREATE TRIGGER test_0172_answer_fault BEFORE INSERT ON identity.public_flag_answer FOR EACH ROW EXECUTE FUNCTION public.test_0172_answer_fault()");
    const warnings: string[] = [];
    const client = await database.pool.connect();
    const listen = (notice: { severity?: string | undefined; message?: string | undefined }) => { warnings.push(`${notice.severity}:${notice.message}`); };
    client.on("notice", listen);
    try {
      const operation = randomUUID();
      await client.query("BEGIN");
      await client.query("SELECT identity.public_review_apply($1::uuid,'HIDE',$2::uuid,NULL,NULL,NULL,NULL,NULL,0,$3::uuid,$4)", [randomUUID(), ref, operation, sha(operation)]);
      await client.query("SELECT identity.record_hide_ground($1::uuid,$2::uuid,ARRAY['PERSONAL_DATA'],'REPORT_BUTTON',$3::uuid)", [operation, ref, flagId]);
      await client.query("COMMIT");
    } finally { client.off("notice", listen); client.release(); await database.pool.query("DROP TRIGGER IF EXISTS test_0172_answer_fault ON identity.public_flag_answer"); }
    expect(warnings).toEqual(["WARNING:PUBLIC_FLAG_REVIEW_CLOSE_SKIPPED"]);
    // The hide and its ground stand; the close went back whole (no dismissal without its answer), so a person still closes the report.
    expect((await database.pool.query("SELECT 1 FROM identity.moderation_ground WHERE flag_id=$1 AND source='REPORT_BUTTON'", [flagId])).rowCount).toBe(1);
    expect((await flagRow(flagId)).dismissed_at).toBeNull();
    expect(await answerOf(flagId)).toBeUndefined();
  }, timeout);

  it("the automatic hide leaves the report open", async () => {
    const [ana, rea] = [await account(), await account()];
    const ref = await publishedDebate(ana);
    const flagId = await reportOf(ref, rea, "CHECKING");
    expect((await database.pool.query<{ state: string }>("SELECT identity.settle_public_flag($1::uuid,'AGREE','PERSONAL',NULL,NULL,NULL,NULL,NULL) AS state", [flagId])).rows[0]!.state).toBe("HIDDEN");
    // 0151's own hide: the nil actor, the report's id as its operation. Even with a ground naming the report, no person decided it.
    expect((await database.pool.query("SELECT 1 FROM identity.public_review_event WHERE operation_id=$1 AND actor_staff_id=$2", [flagId, AUTOMATIC])).rowCount).toBe(1);
    await database.pool.query("SELECT identity.record_hide_ground($1::uuid,$2::uuid,ARRAY['PERSONAL_DATA'],'REPORT_BUTTON',$1::uuid)", [flagId, ref]);
    expect((await flagRow(flagId)).dismissed_at).toBeNull();
    expect(await answerOf(flagId)).toBeUndefined();
    expect(await queueRow(flagId)).toMatchObject({ dismissed_at: null, outcome: null, closed_by_step: false });
  }, timeout);

  it("the six months start at the step", async () => {
    const [ana, rea] = [await account(), await account()];
    const ref = await publishedDebate(ana);
    const flagId = await reportOf(ref, rea);
    await grounded(ref, "HIDE_REPORT", flagId, randomUUID());
    const closedAt = (await flagRow(flagId)).dismissed_at!;
    expect((await answerOf(flagId))!.recorded_at.getTime()).toBe(closedAt.getTime());
    // A day short of six months after the step, the words stay; past it, 0151's sweep takes them.
    const back = (by: string) => seeded([[`UPDATE identity.public_flag SET dismissed_at = $2::timestamptz - $3::interval WHERE flag_id=$1`, [flagId, closedAt.toISOString(), by]]]);
    await back("6 months - 1 day");
    await database.pool.query("SELECT identity.delete_public_flag_words_due()");
    expect((await flagRow(flagId)).has_words).toBe(true);
    await back("6 months 1 minute");
    await database.pool.query("SELECT identity.delete_public_flag_words_due()");
    expect((await flagRow(flagId)).has_words).toBe(false);
  }, timeout);
});

// M3 (owner's decision D, 10 Nov 2026): everyone told at a hide that their content left with the debate hears the final decision, once per kind.
describe("M3: the final decision reaches everyone whose content left with the debate", () => {
  const sealed = (ref: string) => JSON.stringify({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "AAAA", tag: "AAAA", ct: "YQ==" });
  /** A dig of `person`'s on `ref`, allowed before the hide (so the hide takes it along). */
  async function dig(ref: string, person: Account): Promise<string> {
    const digRunId = randomUUID();
    await seeded([[`INSERT INTO identity.public_contribution (dig_run_id, owner_ref, publication_ref, root_run_id, parent_run_id, outcome, check_ref, checked_at)
      VALUES ($1,$2,$3,$4,$5,'ALLOWED',$6,now())`, [digRunId, person.ownerRef, ref, randomUUID(), randomUUID(), randomUUID()]]]);
    return digRunId;
  }
  /** A report of `person`'s on `ref` that the hold took with it. */
  async function reportBy(ref: string, person: Account): Promise<string> {
    const reportId = randomUUID();
    await seeded([[`INSERT INTO identity.public_report (report_id, publication_ref, report_version, writer_ref, carrier_run_id, free, outcome, failure_code, recorded_at)
      VALUES ($1,$2,(SELECT COALESCE(max(report_version),0)+1 FROM identity.public_report WHERE publication_ref=$2),$3,$4,true,'FAILED','PUBLIC_REVIEW_HOLD',now())`,
      [reportId, ref, person.ownerRef, randomUUID()]]]);
    return reportId;
  }
  const queue = () => database.pool.query("SELECT identity.queue_moderation_statements()");
  async function decide(ref: string): Promise<string> {
    const operation = randomUUID();
    const revision = (await database.pool.query<{ n: number }>("SELECT max(revision)::int AS n FROM identity.public_review_event WHERE publication_ref=$1", [ref])).rows[0]!.n;
    await database.pool.query("SELECT identity.moderation_decide($1::uuid,$2::uuid,ARRAY['PERSONAL_DATA'],'OWN_INITIATIVE',NULL,$3,$4::jsonb,$5,$6::uuid,$3)",
      [randomUUID(), ref, "1".repeat(64), sealed(ref), revision, operation]);
    return (await database.pool.query<{ id: string }>("SELECT decision_id AS id FROM identity.moderation_decision WHERE operation_id=$1", [operation])).rows[0]!.id;
  }
  type Told = Readonly<{ owner_ref: string; kind: string; piece_kind: string | null; piece_id: string | null; places: unknown[] }>;
  const toldOf = async (decisionId: string): Promise<Told[]> => (await database.pool.query<Told>(
    "SELECT owner_ref, kind, piece_kind, piece_id, places FROM identity.moderation_statement WHERE decision_id=$1 ORDER BY kind, owner_ref", [decisionId])).rows;
  const sorted = (rows: readonly Told[]) => [...rows].sort((a, b) => (a.kind + a.owner_ref).localeCompare(b.kind + b.owner_ref));

  it("DECIDE tells each affected contributor once, whatever the number of their pieces (R8)", async () => {
    const [author, pia, quin, rae] = [await account(), await account(), await account(), await account()];
    const ref = await publishedDebate(author);
    await dig(ref, pia); await dig(ref, pia); await reportBy(ref, quin);
    await dig(ref, rae); await reportBy(ref, rae);
    await hide(ref);
    await queue();
    expect((await database.pool.query("SELECT 1 FROM identity.moderation_statement WHERE publication_ref=$1 AND kind IN ('CONTRIBUTION_AFFECTED','REPORT_AFFECTED')", [ref])).rowCount).toBe(5);
    const decisionId = await decide(ref);
    await queue();
    const told = await toldOf(decisionId);
    expect(sorted(told)).toEqual(sorted([
      { owner_ref: author.ownerRef, kind: "DEBATE_DECIDED", piece_kind: null, piece_id: null, places: [] },
      { owner_ref: pia.ownerRef, kind: "CONTRIBUTION_DECIDED", piece_kind: null, piece_id: null, places: [] },
      { owner_ref: quin.ownerRef, kind: "REPORT_DECIDED", piece_kind: null, piece_id: null, places: [] },
      { owner_ref: rae.ownerRef, kind: "CONTRIBUTION_DECIDED", piece_kind: null, piece_id: null, places: [] },
      { owner_ref: rae.ownerRef, kind: "REPORT_DECIDED", piece_kind: null, piece_id: null, places: [] }]));
    // A second pass adds nothing.
    await queue();
    expect(await toldOf(decisionId)).toHaveLength(5);
  }, timeout);

  it("an erased contributor gets nothing, and nothing is stuck", async () => {
    const [author, pia, quin] = [await account(), await account(), await account()];
    const ref = await publishedDebate(author);
    await dig(ref, pia); await reportBy(ref, quin);
    const hidden = await hide(ref);
    await queue();
    await database.pool.query('UPDATE identity."user" SET state=\'deleted\' WHERE owner_ref=$1', [pia.ownerRef]);
    const decisionId = await decide(ref);
    await queue();
    expect((await toldOf(decisionId)).map((row) => `${row.kind}`).sort()).toEqual(["DEBATE_DECIDED", "REPORT_DECIDED"]);
    expect((await toldOf(decisionId)).some((row) => row.owner_ref === pia.ownerRef)).toBe(false);
    expect((await stuck()).some((row) => row.source_id === decisionId || row.source_id === hidden)).toBe(false);
    expect(await seen(decisionId)).toBe(true);
  }, timeout);

  it("a debate put back and hidden again: only the second hide's affected people are told", async () => {
    const [author, first, second] = [await account(), await account(), await account()];
    const ref = await publishedDebate(author);
    const firstDig = await dig(ref, first);
    await hide(ref);
    await queue();
    // The first dig is taken out (revision 2), the debate put back (3), a second person digs, and it is hidden again (4): the first person's dig is not
    // taken along by the second hide, so only the second person was told at it.
    const step = (revision: number, action: string, piece: string | null) => seeded([[`INSERT INTO identity.public_review_event (event_id,publication_ref,revision,action,piece_kind,piece_id,actor_staff_id,operation_id,request_sha256)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [randomUUID(), ref, revision, action, piece === null ? null : "DIG", piece, randomUUID(), randomUUID(), "0".repeat(64)]]]);
    await step(2, "REMOVE_DIG", firstDig);
    await step(3, "REPUBLISH", null);
    await dig(ref, second);
    await step(4, "HIDE", null);
    await queue();
    const decisionId = await decide(ref);
    await queue();
    expect((await toldOf(decisionId)).filter((row) => row.kind === "CONTRIBUTION_DECIDED").map((row) => row.owner_ref)).toEqual([second.ownerRef]);
  }, timeout);
});
