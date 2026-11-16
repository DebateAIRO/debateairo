// tests/integration/moderation-final-outcome-0176.test.ts
// Migration 0176 (what was left of 0172's M3, owner, 11 Nov 2026) on real PostgreSQL: everyone told that a dig or a report of theirs is off the page
// "until a person puts it back or the review ends" hears how the review ended, at a re-publish (what stays off, or that it is back) and at DECIDE.
// The log rows are written as 0150's apply writes them; data is made up.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encrypt } from "@debateai/crypto";
import { migrate, PostgresModerationStatementRepository } from "@debateai/db";
import { TemplatedMailSender } from "../../apps/api/src/mail-channel.js";
import { ModerationStatementReconciler } from "../../apps/api/src/moderation-statements.js";
import { testOutboundMailGate } from "../support/outboundMailGate.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const timeout = 300_000;
let database: TestDatabase;
let sequence = 9_960_000;
const owner = randomUUID();
const holder = randomUUID();

type Account = Readonly<{ userId: string; ownerRef: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `outcome-${userId}`]);
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
const sealed = (ref: string) => JSON.stringify({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "AAAA", tag: "AAAA", ct: "YQ==" });
/** A public debate of `author`'s: its run, its ownership event, its snapshot and its PUBLISHED event. */
async function publishedDebate(author: Account): Promise<string> {
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
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,1)`, [runId, `owner:${author.ownerRef}`, randomUUID(), seq]],
    ["INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, author.ownerRef, seq]],
    ["INSERT INTO core.publication_ref_tombstone (ref,ref_kind,created_at) VALUES ($1,'publication_ref',now())", [ref]],
    ["INSERT INTO serve.publication_snapshot (publication_ref,run_id,format_version,content_ciphertext,created_at) VALUES ($1,$2,1,$3::jsonb,now())", [ref, runId, sealed(ref)]],
    [`INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
      VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',now(),$5)`, [randomUUID(), runId, ref, randomUUID(), ++sequence]]]);
  return ref;
}

/** An allowed dig of `person`'s on `ref` with one row on its page (its own transaction, so its moments follow the ones before). */
async function dig(ref: string, person: Account, outcome: "ALLOWED" | "UNAVAILABLE" = "ALLOWED"): Promise<Readonly<{ digRunId: string; updateId: string }>> {
  const digRunId = randomUUID();
  const updateId = randomUUID();
  await seeded([
    [`INSERT INTO identity.public_contribution (dig_run_id, owner_ref, publication_ref, root_run_id, parent_run_id, outcome, check_ref, checked_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,now())`, [digRunId, person.ownerRef, ref, randomUUID(), randomUUID(), outcome, randomUUID()]],
    ...(outcome !== "ALLOWED" ? [] : [[`INSERT INTO identity.public_debate_update (publication_ref,update_seq,update_id,kind,dig_run_id,content_ciphertext)
      VALUES ($1,(SELECT COALESCE(max(update_seq),0)+1 FROM identity.public_debate_update WHERE publication_ref=$1),$2,'MAIN_ANSWER',$3,$4::jsonb)`,
      [ref, updateId, digRunId, sealed(ref)]] as const])]);
  return { digRunId, updateId };
}
/** A report of `person`'s on `ref`, written onto the page (its copy), or stopped by the hold (PUBLIC_REVIEW_HOLD, no copy). */
async function report(ref: string, person: Account, held = false): Promise<string> {
  const reportId = randomUUID();
  await seeded([
    [`INSERT INTO identity.public_report (report_id, publication_ref, report_version, writer_ref, carrier_run_id, free, outcome, failure_code, recorded_at, content_ciphertext)
      VALUES ($1,$2,(SELECT COALESCE(max(report_version),0)+1 FROM identity.public_report WHERE publication_ref=$2),$3,$4,true,$5,$6,now(),$7::jsonb)`,
      [reportId, ref, person.ownerRef, randomUUID(), held ? "FAILED" : "READY", held ? "PUBLIC_REVIEW_HOLD" : null, held ? null : sealed(ref)]],
    ...(held ? [] : [[`INSERT INTO identity.public_debate_report (publication_ref, report_version, report_id, content_ciphertext)
      VALUES ($1,(SELECT report_version FROM identity.public_report WHERE report_id=$2),$2,$3::jsonb)`, [ref, reportId, sealed(ref)]] as const])]);
  return reportId;
}
/** A log row at the next revision, as 0150's apply writes it, with the ground 0157/0172 record beside it. Returns its event id. */
async function step(ref: string, action: "HIDE" | "REMOVE_DIG" | "PUT_BACK" | "REPUBLISH", piece: Readonly<{ kind: "DIG" | "UPDATE" | "REPORT"; id: string }> | null = null): Promise<string> {
  const eventId = randomUUID();
  const revision = (await database.pool.query<{ n: number }>("SELECT COALESCE(max(revision),0)::int + 1 AS n FROM identity.public_review_event WHERE publication_ref=$1", [ref])).rows[0]!.n;
  await seeded([
    [`INSERT INTO identity.public_review_event (event_id,publication_ref,revision,action,piece_kind,piece_id,actor_staff_id,operation_id,request_sha256)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [eventId, ref, revision, action, piece?.kind ?? null, piece?.id ?? null, randomUUID(), randomUUID(), "0".repeat(64)]],
    ...(action === "HIDE" ? [[`INSERT INTO identity.moderation_ground (event_id, publication_ref, grounds, source, interim) VALUES ($1,$2,ARRAY['REVIEW_HOLD'],'OWN_INITIATIVE',true)`, [eventId, ref]] as const]
      : action === "REMOVE_DIG" ? [[`INSERT INTO identity.moderation_ground (event_id, publication_ref, grounds, source, facts_sha256, facts_ciphertext, interim)
        VALUES ($1,$2,ARRAY['HATE_SPEECH'],'OWN_INITIATIVE',$3,$4::jsonb,false)`, [eventId, ref, "1".repeat(64), sealed(ref)]] as const] : [])]);
  return eventId;
}
const queue = () => database.pool.query("SELECT identity.queue_moderation_statements()");
type Told = Readonly<{ owner_ref: string; kind: string; ground_events: string[] }>;
const toldAt = async (source: string): Promise<Told[]> => (await database.pool.query<Told>(
  "SELECT owner_ref, kind, ground_events::text[] AS ground_events FROM identity.moderation_statement WHERE event_id=$1 OR decision_id=$1 ORDER BY kind, owner_ref", [source])).rows;
const kindsOf = async (ref: string, person: Account): Promise<string[]> => (await database.pool.query<{ kind: string }>(
  "SELECT kind FROM identity.moderation_statement WHERE publication_ref=$1 AND owner_ref=$2 ORDER BY kind", [ref, person.ownerRef])).rows.map((row) => row.kind);
const seen = async (source: string): Promise<boolean> =>
  (await database.pool.query("SELECT 1 FROM identity.moderation_statement_seen WHERE source_id=$1", [source])).rowCount === 1;
type Read = Readonly<{ kind: string; facts: unknown[]; facts_deleted: boolean; ground: { grounds: string[]; recorded: boolean } }>;
const page = async (person: Account): Promise<Read[]> =>
  (await database.pool.query<{ value: Read[] }>("SELECT identity.read_own_moderation_statements($1::uuid) AS value", [person.ownerRef])).rows[0]!.value;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // The staff alert's two recipients (M5's MODERATION_MAIL_FAILED), as 0172's test seeds them.
  await seeded([
    ["INSERT INTO staff.owner_designation (staff_id, active) VALUES ($1, true)", [owner]],
    ["INSERT INTO staff.team_limit_holder (staff_id, active, granted_by_staff_id, granted_operation_id) VALUES ($1, true, $2, $3)", [holder, owner, randomUUID()]]]);
}, timeout);
afterAll(async () => { await database?.stop(); }, timeout);

describe("0176: everyone told \"until the review ends\" hears how it ended", () => {
  it("a re-publish tells those of a dig taken out what stays off and what is back, with the removal's ground and none of its facts", async () => {
    const [author, ana, ben, cai, dee, eve, fay] = [await account(), await account(), await account(), await account(), await account(), await account(), await account()];
    const ref = await publishedDebate(author);
    // Fay dug first; then Ana (whose dig is taken out); then Ben, Cai and the author dug after her; then Dee and Eve asked for reports.
    await dig(ref, fay);
    const anaDig = await dig(ref, ana);
    await dig(ref, ben);
    const caiDig = await dig(ref, cai);
    await dig(ref, author);
    await report(ref, dee);
    const eveReport = await report(ref, eve);
    await step(ref, "HIDE");
    await queue();
    const removal = await step(ref, "REMOVE_DIG", { kind: "DIG", id: anaDig.digRunId });
    await queue();
    // 0150's rule took Ben's, Cai's and the author's later rows and both reports along: each was told "until the review ends".
    for (const person of [ben, cai, author]) expect(await kindsOf(ref, person)).toContain("CONTRIBUTION_AFFECTED");
    // A person puts back Cai's row and Eve's report; nobody puts back Ben's, the author's or Dee's. Then the debate goes back.
    await step(ref, "PUT_BACK", { kind: "UPDATE", id: caiDig.updateId });
    await step(ref, "PUT_BACK", { kind: "REPORT", id: eveReport });
    const back = await step(ref, "REPUBLISH");
    await queue();
    const told = await toldAt(back);
    expect(told).toEqual([
      { owner_ref: cai.ownerRef, kind: "CONTRIBUTION_BACK", ground_events: expect.arrayContaining([removal]) as unknown as string[] },
      { owner_ref: fay.ownerRef, kind: "CONTRIBUTION_BACK", ground_events: expect.any(Array) as unknown as string[] },
      ...[author, ben].map((person) => ({ owner_ref: person.ownerRef, kind: "CONTRIBUTION_KEPT_OFF", ground_events: [removal] }))
        .sort((a, b) => a.owner_ref.localeCompare(b.owner_ref)),
      { owner_ref: eve.ownerRef, kind: "REPORT_BACK", ground_events: expect.arrayContaining([removal]) as unknown as string[] },
      { owner_ref: dee.ownerRef, kind: "REPORT_KEPT_OFF", ground_events: [removal] }
    ].sort((a, b) => (a.kind + a.owner_ref).localeCompare(b.kind + b.owner_ref)));
    // Ana's own dig was taken out, and she was told so then (its end): nothing more.
    expect(told.some((row) => row.owner_ref === ana.ownerRef)).toBe(false);
    expect(await kindsOf(ref, ana)).toEqual(["CONTRIBUTION_AFFECTED", "CONTRIBUTION_REMOVED"]);
    // What stays off names the rule the removed content broke, never the facts staff typed about it, even once those are swept at twelve months.
    expect((await page(ben)).find((row) => row.kind === "CONTRIBUTION_KEPT_OFF")).toMatchObject({ facts: [], facts_deleted: false, ground: { grounds: ["HATE_SPEECH"], recorded: true } });
    await seeded([["UPDATE identity.moderation_ground SET facts_ciphertext = NULL, facts_deleted_at = now() WHERE event_id=$1", [removal]]]);
    for (const row of await page(ben)) expect(row, row.kind).toMatchObject({ facts: [], facts_deleted: false });
    expect((await page(ana)).find((row) => row.kind === "CONTRIBUTION_REMOVED")).toMatchObject({ facts_deleted: true });
    // A second pass adds nothing.
    await queue();
    expect(await toldAt(back)).toHaveLength(told.length);
  }, timeout);

  it("a re-publish with no dig taken out tells every person the hide took along that it is back; a dig the hide detached, and a report it stopped, stay off on the hold", async () => {
    const [author, gus, hal, ida] = [await account(), await account(), await account(), await account()];
    const ref = await publishedDebate(author);
    await dig(ref, gus);
    await report(ref, gus);
    const running = await dig(ref, hal, "UNAVAILABLE");
    await report(ref, ida, true);
    const hidden = await step(ref, "HIDE");
    // 0150's hide settled Hal's dig, still running, UNAVAILABLE and detached it: it never reaches the page.
    await seeded([["INSERT INTO identity.public_review_detached (dig_run_id, publication_ref, revision) VALUES ($1,$2,1)", [running.digRunId, ref]]]);
    await queue();
    const back = await step(ref, "REPUBLISH");
    await queue();
    expect((await toldAt(back)).map(({ owner_ref, kind, ground_events }) => ({ owner_ref, kind, ground_events }))).toEqual([
      { owner_ref: gus.ownerRef, kind: "CONTRIBUTION_BACK", ground_events: [hidden] },
      { owner_ref: hal.ownerRef, kind: "CONTRIBUTION_KEPT_OFF", ground_events: [hidden] },
      { owner_ref: gus.ownerRef, kind: "REPORT_BACK", ground_events: [hidden] },
      { owner_ref: ida.ownerRef, kind: "REPORT_KEPT_OFF", ground_events: [hidden] }
    ].sort((a, b) => (a.kind + a.owner_ref).localeCompare(b.kind + b.owner_ref)));
    expect((await page(hal)).find((row) => row.kind === "CONTRIBUTION_KEPT_OFF")).toMatchObject({ facts: [], ground: { grounds: ["REVIEW_HOLD"], recorded: true } });
    // The author was told of the hide as the debate's owner, and the debate is back: no statement of theirs at the re-publish.
    expect((await toldAt(back)).some((row) => row.owner_ref === author.ownerRef)).toBe(false);
  }, timeout);

  it("a re-publish waits for its review's dig taken out: nothing is lost when the removal is set aside for an hour", async () => {
    const [author, ana, ben] = [await account(), await account(), await account()];
    const ref = await publishedDebate(author);
    const anaDig = await dig(ref, ana);
    await dig(ref, ben);
    await step(ref, "HIDE");
    await queue();
    const removal = await step(ref, "REMOVE_DIG", { kind: "DIG", id: anaDig.digRunId });
    // A fault on this debate's statements sets the removal aside.
    await database.pool.query(`CREATE OR REPLACE FUNCTION public.test_0176_fault() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.publication_ref = '${ref}'::uuid THEN RAISE EXCEPTION USING ERRCODE = 'XX001', MESSAGE = 'TEST_0176_FAULT'; END IF; RETURN NEW; END $$`);
    await database.pool.query("CREATE TRIGGER test_0176_fault BEFORE INSERT ON identity.moderation_statement FOR EACH ROW EXECUTE FUNCTION public.test_0176_fault()");
    await queue();
    expect(await seen(removal)).toBe(false);
    const back = await step(ref, "REPUBLISH");
    await queue();
    // The re-publish is neither told nor seen nor set aside: it waits.
    expect(await toldAt(back)).toEqual([]);
    expect(await seen(back)).toBe(false);
    expect((await database.pool.query("SELECT 1 FROM identity.moderation_statement_stuck WHERE source_id=$1", [back])).rowCount).toBe(0);
    // The fault goes and the hour passes: the removal is told, and the end after it.
    await database.pool.query("DROP TRIGGER test_0176_fault ON identity.moderation_statement");
    await database.pool.query("UPDATE identity.moderation_statement_stuck SET last_failed_at = last_failed_at - interval '61 minutes' WHERE source_id=$1", [removal]);
    await queue();
    await queue();
    expect(await kindsOf(ref, ben)).toEqual(["CONTRIBUTION_AFFECTED", "CONTRIBUTION_AFFECTED", "CONTRIBUTION_KEPT_OFF"]);
    expect(await seen(back)).toBe(true);
  }, timeout);

  it("DECIDE tells those of a dig taken out, but not for the piece taken out itself, nor the debate's owner twice", async () => {
    const [author, ana, ben] = [await account(), await account(), await account()];
    const ref = await publishedDebate(author);
    const anaDig = await dig(ref, ana);
    await dig(ref, ben);
    await dig(ref, author);
    await step(ref, "HIDE");
    await queue();
    await step(ref, "REMOVE_DIG", { kind: "DIG", id: anaDig.digRunId });
    await queue();
    expect(await kindsOf(ref, author)).toEqual(["CONTRIBUTION_AFFECTED", "DEBATE_HIDDEN"]);
    const operation = randomUUID();
    const revision = (await database.pool.query<{ n: number }>("SELECT max(revision)::int AS n FROM identity.public_review_event WHERE publication_ref=$1", [ref])).rows[0]!.n;
    await database.pool.query("SELECT identity.moderation_decide($1::uuid,$2::uuid,ARRAY['PERSONAL_DATA'],'OWN_INITIATIVE',NULL,$3,$4::jsonb,$5,$6::uuid,$3)",
      [randomUUID(), ref, "1".repeat(64), sealed(ref), revision, operation]);
    const decisionId = (await database.pool.query<{ id: string }>("SELECT decision_id AS id FROM identity.moderation_decision WHERE operation_id=$1", [operation])).rows[0]!.id;
    await queue();
    expect((await toldAt(decisionId)).map(({ owner_ref, kind }) => ({ owner_ref, kind }))).toEqual([
      { owner_ref: ben.ownerRef, kind: "CONTRIBUTION_DECIDED" },
      { owner_ref: author.ownerRef, kind: "DEBATE_DECIDED" }
    ].sort((a, b) => (a.kind + a.owner_ref).localeCompare(b.kind + b.owner_ref)));
    // The decision's words stay the owner's: Ben's final statement names the debate's rule, without its facts.
    expect((await page(ben)).find((row) => row.kind === "CONTRIBUTION_DECIDED")).toMatchObject({ facts: [], facts_deleted: false, ground: { grounds: ["PERSONAL_DATA"] } });
  }, timeout);

  it("the kind CHECK takes the four ends and nothing else", async () => {
    const person = await account();
    const ref = await publishedDebate(person);
    const event = await step(ref, "HIDE");
    const insert = (kind: string) => database.pool.query(`INSERT INTO identity.moderation_statement (owner_ref, kind, publication_ref, event_id, mail_locale, happened_at)
      VALUES ($1,$2,$3,$4,'en',now())`, [person.ownerRef, kind, ref, event]);
    for (const kind of ["CONTRIBUTION_KEPT_OFF", "REPORT_KEPT_OFF", "CONTRIBUTION_BACK", "REPORT_BACK"]) await insert(kind);
    await expect(insert("CONTRIBUTION_RESTORED")).rejects.toMatchObject({ code: "23514" });
  }, timeout);
});

describe("0176 end to end: the final outcome is mailed through the API's own sender, in each person's language", () => {
  // Each person's key and address, as the account store keeps them: the address sealed under the person's own key, opened by the sender at sending time.
  const keys = new Map<string, Buffer>();
  async function person(address: string, locale: string): Promise<Account> {
    const userId = randomUUID();
    const dek = randomBytes(32);
    keys.set(userId, dek);
    const sealedAddress = encrypt(dek, Buffer.from(address, "utf8"), ["identity", "user.email_ciphertext", userId, "run:none", userId, `user-dek:${userId}`, "1"]);
    await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
      VALUES ($1,$2,$3::jsonb,'{}','fixture-password',$4,'active',now())`, [userId, createHash("sha256").update(userId).digest(), JSON.stringify(sealedAddress), `mail-${userId}`]);
    const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
    // The language picked in the dropdown at sign-up, recorded with the Terms acceptance: the language every statement is written in.
    await seeded([[`INSERT INTO legal.acceptance (acceptance_id,owner_ref,kind,document_version,document_sha256,locale,surface,accepted_at,evidence_ciphertext,key_id)
      VALUES ($1,$2,'TERMS','2.17',$3,$4,'SIGN_UP',now(),$5,'aaaaaaaaaaaaaaaa')`, [randomUUID(), ownerRef, "a".repeat(64), locale, Buffer.alloc(30)]]]);
    return { userId, ownerRef };
  }
  /** The plain-text parts of a captured message, decoded. */
  const textOf = (message: string): string => [...message.matchAll(/Content-Transfer-Encoding: base64\r\n(?:[^\r\n]+\r\n)*\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)]
    .map((match) => Buffer.from(match[1]!.replaceAll("\r\n", ""), "base64").toString("utf8")).join("\n").replace(/\s+/gu, " ");
  /** The locale's own sentence after the item's link: words no other locale and no other kind has. */
  const sentenceAfterLink = (locale: string, key: string): string => {
    const catalog = JSON.parse(readFileSync(resolve(`packages/mail-templates/messages/${locale}/mail.json`), "utf8")) as Record<string, string>;
    return catalog[`mail.statement.${key}`]!.split("{itemUrl}")[1]!.slice(1).trim().slice(0, 60).replace(/\s+/gu, " ");
  };

  it("a re-publish after a dig taken out: what stays off and what is back reach each person's address, in Romanian, German and French, and are settled SENT", async () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-final-outcome-mail-"));
    const previous = process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR;
    process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = join(root, "mail");
    const runtime = new Pool({ connectionString: database.connectionString, max: 2 });
    runtime.on("connect", (client) => { void client.query("SET ROLE debateai_runtime"); });
    try {
      const author = await person("autor@example.test", "en");
      const ana = await person("ana@example.test", "en");
      const ben = await person("ben@example.test", "ro");
      const cai = await person("cai@example.test", "de");
      const dee = await person("dee@example.test", "fr");
      const ref = await publishedDebate(author);
      const anaDig = await dig(ref, ana);
      await dig(ref, ben);
      const caiDig = await dig(ref, cai);
      await report(ref, dee);
      await step(ref, "HIDE");
      await step(ref, "REMOVE_DIG", { kind: "DIG", id: anaDig.digRunId });
      await step(ref, "PUT_BACK", { kind: "UPDATE", id: caiDig.updateId });
      const back = await step(ref, "REPUBLISH");
      // The API's sender as main.ts builds it: the database's claim and read on the runtime login, the account keys, and the production sendmail path.
      const sender = new ModerationStatementReconciler(new PostgresModerationStatementRepository(runtime),
        { load: async (userId: string) => { const dek = keys.get(userId); if (dek === undefined) throw new Error("NO_KEY"); return Buffer.from(dek); } },
        new TemplatedMailSender({ gate: testOutboundMailGate(), executable: resolve("deploy/dev-auth/sendmail-capture.mjs"), from: "noreply@localhost.test", timeoutMs: 10_000 }),
        "https://dezbatere.example.test/");
      // Every statement queued on this debate: the hide's, the removal's and the re-publish's. Each pass claims what is due and sends it.
      for (let pass = 0; pass < 5; pass += 1) await sender.reconcile(100);
      type Final = Readonly<{ statement_id: string; owner_ref: string; kind: string; mail_locale: string; delivered_at: Date | null }>;
      const finals = (await database.pool.query<Final>("SELECT statement_id, owner_ref, kind, mail_locale, delivered_at FROM identity.moderation_statement WHERE event_id=$1 ORDER BY kind, owner_ref", [back])).rows;
      const expected = [[ben, "CONTRIBUTION_KEPT_OFF", "ro", "ben@example.test", "contributionKeptOff"], [cai, "CONTRIBUTION_BACK", "de", "cai@example.test", "contributionBack"],
        [dee, "REPORT_KEPT_OFF", "fr", "dee@example.test", "reportKeptOff"]] as const;
      expect(finals.map(({ owner_ref, kind, mail_locale }) => ({ owner_ref, kind, mail_locale }))).toEqual(
        expected.map(([who, kind, locale]) => ({ owner_ref: who.ownerRef, kind, mail_locale: locale })).sort((a, b) => (a.kind + a.owner_ref).localeCompare(b.kind + b.owner_ref)));
      for (const row of finals) expect(row.delivered_at, row.kind).not.toBeNull();
      const captured = readdirSync(join(root, "mail")).filter((name) => name.endsWith(".eml")).map((name) => readFileSync(join(root, "mail", name), "utf8"));
      for (const [who, kind, locale, address, key] of expected) {
        const id = finals.find((row) => row.owner_ref === who.ownerRef && row.kind === kind)!.statement_id;
        const mails = captured.filter((message) => message.includes(`Message-ID: <${id}@`));
        expect(mails, `${kind} ${locale}`).toHaveLength(1);
        const [message] = mails as [string];
        expect(message).toMatch(new RegExp(`^To: ${address.replace(".", "\\.")}\\r?$`, "mu"));
        expect(message).toContain(`Content-Language: ${locale}`);
        expect(message).toMatch(/^Reply-To: office@dezbatere\.ro\r?$/mu);
        const text = textOf(message);
        expect(text, `${kind} ${locale}`).toContain(`https://dezbatere.example.test/public/debate/${ref}`);
        expect(text, `${kind} ${locale}`).toContain(sentenceAfterLink(locale, key));
        expect(text).toContain(`https://dezbatere.example.test/settings/notices#${id}`);
      }
      // What stays off is a statement of reasons: the other content's rule, said as such, and the routes. What is back has neither.
      const keptOff = textOf(captured.find((message) => message.includes(`Message-ID: <${finals.find((row) => row.kind === "CONTRIBUTION_KEPT_OFF")!.statement_id}@`))!);
      const ro = JSON.parse(readFileSync(resolve("packages/mail-templates/messages/ro/mail.json"), "utf8")) as Record<string, string>;
      expect(keptOff).toContain(ro["mail.statement.groundIntroOther"]!.replace(/\s+/gu, " "));
      expect(keptOff).toContain(ro["mail.statement.groundHate"]!.replace(/\s+/gu, " "));
      expect(keptOff).toContain("office@dezbatere.ro");
      const backMail = textOf(captured.find((message) => message.includes(`Message-ID: <${finals.find((row) => row.kind === "CONTRIBUTION_BACK")!.statement_id}@`))!);
      const de = JSON.parse(readFileSync(resolve("packages/mail-templates/messages/de/mail.json"), "utf8")) as Record<string, string>;
      expect(backMail).not.toContain(de["mail.statement.routes"]!.replace(/\s+/gu, " ").slice(0, 40));
      // Ana's dig was taken out: she got that statement, and no final one.
      expect(finals.some((row) => row.owner_ref === ana.ownerRef)).toBe(false);
    } finally {
      await runtime.end();
      if (previous === undefined) delete process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR;
      else process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = previous;
      rmSync(root, { recursive: true, force: true });
    }
  }, timeout);
});
