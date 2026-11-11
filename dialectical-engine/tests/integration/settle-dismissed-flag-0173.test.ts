// tests/integration/settle-dismissed-flag-0173.test.ts
// Migration 0173 (0151's settle on a report a person already closed) on real PostgreSQL. Since 0172 a person's review step that names a report
// closes it while the automatic check may still be reading it (CHECKING). The check's answer that arrives after is kept for the record (the
// verdict, the model, the cost), and it does nothing else: no staff notice and no automatic hide. Data is made up.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const timeout = 300_000;
let database: TestDatabase;
let sequence = 9_960_000;
// The staff notice's two recipients (0151's queue_public_flag_notices sends to the active Owner and every active team-limit holder), seeded once,
// so a notice that is queued is seen: without them, "no notice" would hold for any settle.
const owner = randomUUID();
const holder = randomUUID();
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const sealed = (ref: string) => JSON.stringify({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "AAAA", tag: "AAAA", ct: "YQ==" });

type Account = Readonly<{ userId: string; ownerRef: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `settle-${userId}`]);
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
/** A public debate of `publisher`'s, never hidden: its run, its ownership event, its snapshot and its PUBLISHED event. */
async function publishedDebate(publisher: Account): Promise<string> {
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
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,1)`, [runId, `owner:${publisher.ownerRef}`, randomUUID(), seq]],
    ["INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, publisher.ownerRef, seq]],
    ["INSERT INTO core.publication_ref_tombstone (ref,ref_kind,created_at) VALUES ($1,'publication_ref',now())", [ref]],
    ["INSERT INTO serve.publication_snapshot (publication_ref,run_id,format_version,content_ciphertext,created_at) VALUES ($1,$2,1,$3::jsonb,now())",
      [ref, runId, sealed(ref)]],
    [`INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
      VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',now(),$5)`, [randomUUID(), runId, ref, randomUUID(), ++sequence]]]);
  return ref;
}
/** A report of `ref`'s by a new reporter, still read by the automatic check (CHECKING), its words sealed; `age` back-dates it. */
async function checkingReport(ref: string, age = "0 seconds"): Promise<string> {
  const reporter = await account();
  const flagId = randomUUID();
  await database.pool.query(`INSERT INTO identity.public_flag (flag_id, publication_ref, reporter_ref, state, content_ciphertext, created_at)
    VALUES ($1,$2,$3,'CHECKING',$4::jsonb,clock_timestamp() - $5::interval)`, [flagId, ref, reporter.ownerRef, sealed(ref), age]);
  return flagId;
}
/** A person's removal of a dig naming the report: 0150's log row of the step, then 0157's ground for it, which 0172 makes close the report as ACTED. */
async function removalNaming(ref: string, flagId: string): Promise<void> {
  const [eventId, operation] = [randomUUID(), randomUUID()];
  const revision = (await database.pool.query<{ n: number }>("SELECT COALESCE(max(revision),0)::int + 1 AS n FROM identity.public_review_event WHERE publication_ref=$1", [ref])).rows[0]!.n;
  await seeded([[`INSERT INTO identity.public_review_event (event_id,publication_ref,revision,action,piece_kind,piece_id,actor_staff_id,operation_id,request_sha256)
    VALUES ($1,$2,$3,'REMOVE_DIG','DIG',$4,$5,$6,$7)`, [eventId, ref, revision, randomUUID(), randomUUID(), operation, "0".repeat(64)]]]);
  await database.pool.query("SELECT identity.record_step_ground($1::uuid,$2::uuid,ARRAY['PERSONAL_DATA'],'REPORT_BUTTON',$3::uuid,$4,$5::jsonb)", [operation, ref, flagId, sha("facts"), sealed(ref)]);
}
/** The check's answer, as the API's press records it after the judge (on its system login; the test's superuser holds the marker too). */
const settle = async (flagId: string, verdict: "AGREE" | "NOT_FOUND" | "UNSURE" | "UNAVAILABLE"): Promise<string> =>
  (await database.pool.query<{ state: string }>("SELECT identity.settle_public_flag($1::uuid,$2,'PERSONAL','fixture','fixture-model',120,8,0.0004) AS state", [flagId, verdict])).rows[0]!.state;
type Flag = Readonly<{ state: string; verdict: string | null; reason: string | null; judge_model_id: string | null; judged_at: Date | null; dismissed_at: Date | null }>;
const flagRow = async (flagId: string): Promise<Flag> => (await database.pool.query<Flag>(
  "SELECT state, verdict, reason, judge_model_id, judged_at, dismissed_at FROM identity.public_flag WHERE flag_id=$1", [flagId])).rows[0]!;
/** The staff notices queued for the report (0151 keys them by the report's id), by kind and recipient. */
const noticesOf = async (flagId: string): Promise<string[]> => (await database.pool.query<{ item: string }>(
  "SELECT kind || ':' || recipient_staff_id AS item FROM staff.public_flag_notice WHERE operation_id=$1 ORDER BY kind, recipient_staff_id", [flagId])).rows.map((row) => row.item);
const hidesOf = async (ref: string): Promise<number> =>
  (await database.pool.query("SELECT 1 FROM identity.public_review_event WHERE publication_ref=$1 AND action='HIDE'", [ref])).rowCount ?? 0;
const held = async (ref: string): Promise<boolean> =>
  (await database.pool.query<{ held: boolean }>("SELECT identity.public_review_held($1::uuid) AS held", [ref])).rows[0]!.held;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await seeded([
    ["INSERT INTO staff.owner_designation (staff_id, active) VALUES ($1, true)", [owner]],
    ["INSERT INTO staff.team_limit_holder (staff_id, active, granted_by_staff_id, granted_operation_id) VALUES ($1, true, $2, $3)", [holder, owner, randomUUID()]]]);
}, timeout);
afterAll(async () => {
  await database?.stop();
}, timeout);

describe("0173: a report a person closed while the check read it", () => {
  it("closed by a person's removal naming it, then settled AGREE: no hide, no staff notice, and the verdict is stored", async () => {
    const ref = await publishedDebate(await account());
    const flagId = await checkingReport(ref);
    await removalNaming(ref, flagId);
    expect((await flagRow(flagId)).dismissed_at).not.toBeNull();
    expect(await settle(flagId, "AGREE")).toBe("QUEUED");
    expect(await hidesOf(ref)).toBe(0);
    expect(await held(ref)).toBe(false);
    expect(await noticesOf(flagId)).toEqual([]);
    expect(await flagRow(flagId)).toMatchObject({ state: "QUEUED", verdict: "AGREE", reason: "PERSONAL", judge_model_id: "fixture-model" });
    expect((await flagRow(flagId)).judged_at).not.toBeNull();
    // The answer is recorded once: a second settle finds it settled and changes nothing.
    expect(await settle(flagId, "NOT_FOUND")).toBe("QUEUED");
    expect(await flagRow(flagId)).toMatchObject({ verdict: "AGREE" });
    expect(await noticesOf(flagId)).toEqual([]);
  }, timeout);

  it("every other verdict on a closed report queues no staff notice either, and NOT_FOUND still settles NOT_FOUND", async () => {
    const ref = await publishedDebate(await account());
    for (const [verdict, state] of [["UNSURE", "QUEUED"], ["UNAVAILABLE", "QUEUED"], ["NOT_FOUND", "NOT_FOUND"]] as const) {
      const flagId = await checkingReport(ref);
      await removalNaming(ref, flagId);
      expect(await settle(flagId, verdict), verdict).toBe(state);
      expect(await noticesOf(flagId), verdict).toEqual([]);
      expect(await flagRow(flagId), verdict).toMatchObject({ state, verdict });
    }
    expect(await hidesOf(ref)).toBe(0);
  }, timeout);

  it("0157's five-minute sweep of a closed report left CHECKING records UNAVAILABLE and queues no staff notice", async () => {
    const ref = await publishedDebate(await account());
    const flagId = await checkingReport(ref, "6 minutes");
    await removalNaming(ref, flagId);
    await database.pool.query("SELECT identity.settle_stuck_public_flags()");
    expect(await flagRow(flagId)).toMatchObject({ state: "QUEUED", verdict: "UNAVAILABLE" });
    expect(await noticesOf(flagId)).toEqual([]);
  }, timeout);

  it("a report no person closed is settled as before: a waiting report tells both accounts, an AGREE hides once and tells both", async () => {
    const ref = await publishedDebate(await account());
    const waiting = await checkingReport(ref);
    expect(await settle(waiting, "UNSURE")).toBe("QUEUED");
    expect(await noticesOf(waiting)).toEqual([`PUBLIC_FLAG_WAITING:${owner}`, `PUBLIC_FLAG_WAITING:${holder}`].sort());
    const agreed = await checkingReport(ref);
    expect(await settle(agreed, "AGREE")).toBe("HIDDEN");
    expect(await hidesOf(ref)).toBe(1);
    expect(await noticesOf(agreed)).toEqual([`PUBLIC_FLAG_HIDDEN:${owner}`, `PUBLIC_FLAG_HIDDEN:${holder}`].sort());
  }, timeout);
});
