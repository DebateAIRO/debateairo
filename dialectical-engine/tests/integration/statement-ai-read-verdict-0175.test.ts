// tests/integration/statement-ai-read-verdict-0175.test.ts
// Migration 0175 on real PostgreSQL. The statement to a debate's author says "An AI read the report first" (0157's automated_detection) only when
// 0151's check gave a verdict (AGREE, NOT_FOUND or UNSURE) by the statement's moment. 0151's settle records the model it tried even when the call
// failed (UNAVAILABLE), and before 0175 that alone made the statement say an AI had read the report. Data is made up.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const timeout = 300_000;
let database: TestDatabase;
let sequence = 9_975_000;
const sha = (text: string): string => createHash("sha256").update(text).digest("hex");
const sealed = (ref: string) => JSON.stringify({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "AAAA", tag: "AAAA", ct: "YQ==" });

type Account = Readonly<{ userId: string; ownerRef: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `ai-read-${userId}`]);
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
/** A person's hide naming the report, through 0150's own apply and 0157's ground in one transaction as the staff door runs them; 0172 closes the
 * report with it. It is the step that sends the debate's author a statement (DEBATE_HIDDEN). */
async function hideNaming(ref: string, flagId: string): Promise<void> {
  const operation = randomUUID();
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    const revision = (await client.query<{ n: number }>("SELECT COALESCE(max(revision),0)::int AS n FROM identity.public_review_event WHERE publication_ref=$1", [ref])).rows[0]!.n;
    await client.query("SELECT identity.public_review_apply($1::uuid,'HIDE',$2::uuid,NULL,NULL,NULL,NULL,NULL,$3,$4::uuid,$5)", [randomUUID(), ref, revision, operation, sha(operation)]);
    await client.query("SELECT identity.record_hide_ground($1::uuid,$2::uuid,ARRAY['PERSONAL_DATA'],'REPORT_BUTTON',$3::uuid)", [operation, ref, flagId]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
}
/** The check's answer, as the API's press records it after the judge: the model it tried is recorded whatever the verdict. */
const settle = (flagId: string, verdict: "AGREE" | "NOT_FOUND" | "UNSURE" | "UNAVAILABLE") =>
  database.pool.query("SELECT identity.settle_public_flag($1::uuid,$2,'PERSONAL','fixture','fixture-model',120,8,0.0004)", [flagId, verdict]);
type Ground = Readonly<{ automated_detection: boolean; automated_decision: boolean; sources: string[] }>;
/** The statements queued to the debate's author for `ref`, each with its ground as the page and the mail read it. */
async function authorGrounds(ref: string, author: Account): Promise<Ground[]> {
  await database.pool.query("SELECT identity.queue_moderation_statements()");
  return (await database.pool.query<{ ground: Ground }>(
    "SELECT identity.moderation_statement_ground(statement_id) AS ground FROM identity.moderation_statement WHERE publication_ref=$1 AND owner_ref=$2 ORDER BY created_at",
    [ref, author.ownerRef])).rows.map((row) => row.ground);
}
/** A debate, a report of it, the check's answer (or none yet), then a person's hide naming the report; the author's statements' grounds. */
async function hideAfter(verdict: "AGREE" | "NOT_FOUND" | "UNSURE" | "UNAVAILABLE" | null): Promise<Readonly<{ ref: string; flagId: string; author: Account; grounds: Ground[] }>> {
  const author = await account();
  const ref = await publishedDebate(author);
  const flagId = await checkingReport(ref);
  if (verdict !== null) await settle(flagId, verdict);
  await hideNaming(ref, flagId);
  return { ref, flagId, author, grounds: await authorGrounds(ref, author) };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, timeout);
afterAll(async () => {
  await database?.stop();
}, timeout);

describe("0175: the statement to the debate's author says an AI read the report first only for a verdict", () => {
  it("the check's call failed (UNAVAILABLE, its model recorded): a person's hide naming the report tells the author no AI read it", async () => {
    const { flagId, grounds } = await hideAfter("UNAVAILABLE");
    expect((await database.pool.query("SELECT judge_model_id FROM identity.public_flag WHERE flag_id=$1", [flagId])).rows[0]).toEqual({ judge_model_id: "fixture-model" });
    expect(grounds.length).toBeGreaterThan(0);
    for (const ground of grounds) expect(ground).toMatchObject({ automated_detection: false, automated_decision: false, sources: ["REPORT_BUTTON"] });
  }, timeout);

  it("a verdict given before the hide (UNSURE, NOT_FOUND) still says an AI read the report first", async () => {
    for (const verdict of ["UNSURE", "NOT_FOUND"] as const) {
      const { grounds } = await hideAfter(verdict);
      expect(grounds.length, verdict).toBeGreaterThan(0);
      for (const ground of grounds) expect(ground, verdict).toMatchObject({ automated_detection: true, automated_decision: false });
    }
  }, timeout);

  it("a person who hid the debate while the check still read the report decided alone, whatever the check said after", async () => {
    const { ref, flagId, author } = await hideAfter(null);
    await settle(flagId, "UNSURE");
    const grounds = await authorGrounds(ref, author);
    expect(grounds.length).toBeGreaterThan(0);
    for (const ground of grounds) expect(ground).toMatchObject({ automated_detection: false, automated_decision: false });
  }, timeout);

  it("0151's automatic hide still says both: an AI found it and the hide was automated", async () => {
    const author = await account();
    const ref = await publishedDebate(author);
    const flagId = await checkingReport(ref);
    await settle(flagId, "AGREE");
    const grounds = await authorGrounds(ref, author);
    expect(grounds.length).toBeGreaterThan(0);
    for (const ground of grounds) expect(ground).toMatchObject({ automated_detection: true, automated_decision: true });
  }, timeout);
});
