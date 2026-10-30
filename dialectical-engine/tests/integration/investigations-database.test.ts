import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPool,
  migrate,
  PostgresInvestigationRepository,
  PostgresInvestigationRunnerRepository,
  PostgresWebEvidenceRepository,
  type Pool,
  type WebSealed
} from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0133 on real PostgreSQL (Perplexity plan 2026-10-30, task W1-3; owner answers Q2, Q4, Q5): investigations. The API's
 * role opens an investigation, joins digs to it (writing 0131's dig link too: the server-side dig parent), closes it
 * (a new report version; its page texts are wiped in the same transaction) and reopens it (earlier versions kept); it
 * records the person's ONE reserve, whose order the database enforces; the scheduler's sweep wipes page texts 30 days
 * after the investigation's last activity, open or not; deleting one debate and deleting the account remove the rows.
 */
let database: TestDatabase;
let api: Pool;
let runner: Pool;
let erasure: Pool;
let worker: Pool;
let sequence = 9_200_000;
const SECRET = Buffer.alloc(32, 7);
const ENVELOPE = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" };

type SqlError = { code?: string | undefined; message?: string | undefined };
async function sqlError(run: () => Promise<unknown>): Promise<SqlError> {
  try { await run(); return { code: undefined, message: undefined }; }
  catch (error) { return error as SqlError; }
}
const loginPool = (role: string, password: string): Pool => {
  const url = new URL(database.connectionString);
  url.username = role;
  url.password = password;
  return createPool(url.toString());
};
type Account = Readonly<{ userId: string; ownerRef: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `inv-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef };
}
/** A private debate with content encryption and its attestation secret (0132's web step needs both). */
async function run(owner: Account): Promise<string> {
  const runId = randomUUID();
  const seq = ++sequence;
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    await seed.query(`INSERT INTO core.run
      (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,
       tier_source,tier_provenance_ref,composition_budget_tier,depth_params,agent_count,discovered_panel,
       stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,
       question_blind_index_version,content_encryption_version)
      VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low',
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,1)`,
      [runId, `owner:${owner.ownerRef}`, randomUUID(), seq]);
    await seed.query("INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner.ownerRef, seq]);
    await seed.query("INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at) VALUES ($1,$2,now())", [runId, SECRET]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
  return runId;
}
async function sealed(runId: string, carrier: string, ref: string): Promise<WebSealed> {
  const attestation = (await database.pool.query<{ value: Buffer }>(`SELECT audit_crypto_internal.hmac(
      core.content_envelope_attestation_bytes($1,$2,$3,'content_ciphertext',$4::jsonb),$5::bytea,'sha256') AS value`,
    [runId, carrier, ref, JSON.stringify(ENVELOPE), SECRET])).rows[0]!.value;
  return { envelope: ENVELOPE as never, attestation };
}
/** One search with `count` pages, each with its text. */
async function pagesWithText(runId: string, count = 2): Promise<string[]> {
  const repository = new PostgresWebEvidenceRepository(runner);
  const search = randomUUID();
  expect(await repository.recordSearch({ runId, searchId: search, pathRef: "pos-1", side: "for", languageKind: "english",
    language: "en", country: null, lookBack: "12m", outcome: "FOUND", chargeMicros: 1000, resultCount: count,
    words: await sealed(runId, "identity.web_search", search) })).toBe("RECORDED");
  const pages: string[] = [];
  for (let rank = 1; rank <= count; rank += 1) {
    const page = randomUUID();
    pages.push(page);
    expect(await repository.recordPage({ runId, pageId: page, searchId: search, rank, readDepth: "whole",
      about: await sealed(runId, "identity.web_page", page),
      text: { chars: 500, digest: Buffer.alloc(32, rank), sealed: await sealed(runId, "identity.web_page_text", page) } })).toBe("RECORDED");
  }
  return pages;
}
const texts = async (runId: string): Promise<number> =>
  Number((await database.pool.query("SELECT count(*) AS n FROM identity.web_page_text WHERE run_id=$1", [runId])).rows[0].n);
async function seedTombstone(runId: string): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    await seed.query(`INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count)
      VALUES ($1,clock_timestamp(),1,0)`, [runId]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
/** Moves an investigation's last activity (and its texts' storing) into the past, as the superuser. */
async function age(investigationId: string, days: number): Promise<void> {
  await database.pool.query(`UPDATE identity.investigation SET last_activity_at = clock_timestamp() - make_interval(days => $2)
    WHERE investigation_id = $1`, [investigationId, days]);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE inv_api LOGIN PASSWORD 'inv-api-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE inv_runner LOGIN PASSWORD 'inv-runner-test-only' IN ROLE debateai_runtime");
  await database.pool.query("CREATE ROLE inv_erasure LOGIN PASSWORD 'inv-erasure-test-only' IN ROLE debateai_erasure_runtime");
  await database.pool.query("CREATE ROLE inv_worker LOGIN PASSWORD 'inv-worker-test-only' IN ROLE debateai_data_export_worker");
  api = loginPool("inv_api", "inv-api-test-only");
  runner = loginPool("inv_runner", "inv-runner-test-only");
  erasure = loginPool("inv_erasure", "inv-erasure-test-only");
  worker = loginPool("inv_worker", "inv-worker-test-only");
  expect((await api.query("SELECT current_user AS name")).rows[0].name).toBe("inv_api");
}, 300_000);

afterAll(async () => {
  await Promise.all([api?.end(), runner?.end(), erasure?.end(), worker?.end()]);
  await database?.stop();
});

describe("0133 an investigation and its digs", () => {
  it("I1 a dig joins its parent's investigation (opened with the parent as root) and its dig link is written with it", async () => {
    const person = await account();
    const root = await run(person);
    const dig = await run(person);
    const deeper = await run(person);
    const investigations = new PostgresInvestigationRepository(api);
    const joined = await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: dig, places: ["path:p1", "p:n-3"], mode: "quick" });
    expect(joined.outcome).toBe("JOINED");
    expect(await investigations.open(person.ownerRef, root)).toBe(joined.investigationId);
    expect(await investigations.open(person.ownerRef, dig)).toBe(joined.investigationId);
    expect((await investigations.join({ ownerRef: person.ownerRef, parentRunId: dig, childRunId: deeper, places: [], mode: "thorough" })))
      .toEqual({ outcome: "JOINED", investigationId: joined.investigationId, digLevel: 2 });
    expect((await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: dig, places: ["w"], mode: "thorough" })).outcome).toBe("ALREADY");
    expect((await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: deeper, places: [], mode: "quick" })).outcome).toBe("CONFLICT");
    const read = (await investigations.read(person.ownerRef, deeper))!;
    expect(read).toMatchObject({ investigation_id: joined.investigationId, root_run_id: root, state: "open", report_version: 0, closings: [] });
    expect(read.members.map((member) => [member.run_id, member.parent_run_id, member.places, member.mode])).toEqual([
      [root, null, [], null], [dig, root, ["path:p1", "p:n-3"], "quick"], [deeper, dig, [], "thorough"]]);
    // The server-side dig parent: 0131's links, as identity.read_dig_links answers them.
    const links = (await api.query("SELECT identity.read_dig_links($1,$2) AS l", [person.ownerRef, dig])).rows[0].l;
    expect(links.parent).toMatchObject({ parent_run_id: root, child_run_id: dig, places: ["path:p1", "p:n-3"], mode: "quick" });
    expect(links.children).toEqual([expect.objectContaining({ child_run_id: deeper, mode: "thorough" })]);
    expect(await new PostgresInvestigationRunnerRepository(runner).ofRun(deeper)).toEqual(read);
  });

  it("I2 another account's debates join nothing, and a malformed join is refused before any read", async () => {
    const person = await account();
    const stranger = await account();
    const root = await run(person);
    const theirs = await run(stranger);
    const investigations = new PostgresInvestigationRepository(api);
    expect(await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: theirs, places: [], mode: "quick" }))
      .toEqual({ outcome: "NOT_OWNED", investigationId: null, digLevel: null });
    expect(await investigations.open(stranger.ownerRef, root)).toBeNull();
    expect(await investigations.read(stranger.ownerRef, root)).toBeNull();
    for (const [places, mode] of [[["has space"], "quick"], [[], "deep"], [Array.from({ length: 17 }, () => "w"), "quick"]] as const) {
      expect(await sqlError(() => investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: randomUUID(),
        places: places as string[], mode: mode as "quick" }))).toMatchObject({ code: "22023", message: "INVESTIGATION_JOIN_INVALID" });
    }
  });

  it("I3 closing numbers a report version and wipes the investigation's page texts at once; reopening keeps the earlier versions", async () => {
    const person = await account();
    const root = await run(person);
    const dig = await run(person);
    const outside = await run(person);
    const investigations = new PostgresInvestigationRepository(api);
    const { investigationId } = await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: dig, places: [], mode: "quick" });
    await pagesWithText(root);
    await pagesWithText(dig, 3);
    await pagesWithText(outside);
    expect(await investigations.close(person.ownerRef, investigationId!)).toEqual({ outcome: "CLOSED", reportVersion: 1, wipedTexts: 5 });
    expect([await texts(root), await texts(dig), await texts(outside)]).toEqual([0, 0, 2]);
    // Links and checked quotes stay: the pages are there, their texts read WIPED.
    const web = (await new PostgresWebEvidenceRepository(runner).read(root))!;
    expect(web.pages.map((page) => page.text_state)).toEqual(["WIPED", "WIPED"]);
    expect(await investigations.close(person.ownerRef, investigationId!)).toEqual({ outcome: "ALREADY_CLOSED", reportVersion: 1, wipedTexts: 0 });
    // A closed investigation takes no new dig until it is reopened.
    const late = await run(person);
    expect((await investigations.join({ ownerRef: person.ownerRef, parentRunId: dig, childRunId: late, places: [], mode: "quick" })).outcome).toBe("CLOSED");
    const reportRef = randomUUID();
    const runnerSide = new PostgresInvestigationRunnerRepository(runner);
    expect(await runnerSide.recordReport(investigationId!, 1, reportRef)).toBe("RECORDED");
    expect(await runnerSide.recordReport(investigationId!, 1, randomUUID())).toBe("ALREADY");
    expect(await runnerSide.recordReport(investigationId!, 2, randomUUID())).toBe("NO_CLOSING");
    expect(await investigations.reopen(person.ownerRef, investigationId!)).toBe("REOPENED");
    expect(await investigations.reopen(person.ownerRef, investigationId!)).toBe("ALREADY_OPEN");
    expect((await investigations.join({ ownerRef: person.ownerRef, parentRunId: dig, childRunId: late, places: [], mode: "quick" })).outcome).toBe("JOINED");
    expect(await investigations.close(person.ownerRef, investigationId!)).toMatchObject({ outcome: "CLOSED", reportVersion: 2 });
    const closings = (await investigations.read(person.ownerRef, root))!.closings;
    expect(closings.map((closing) => [closing.report_version, closing.report_ref, closing.reopened_at === null])).toEqual([
      [1, reportRef, false], [2, null, true]]);
    expect(await investigations.close(randomUUID(), investigationId!)).toMatchObject({ outcome: "NOT_OWNED" });
  });

  it("I4 the sweep wipes page texts 30 days after the investigation's last activity, open or not; touching keeps them", async () => {
    const person = await account();
    const idle = await run(person);
    const busy = await run(person);
    const alone = await run(person);
    const investigations = new PostgresInvestigationRepository(api);
    const idleId = (await investigations.open(person.ownerRef, idle))!;
    const busyId = (await investigations.open(person.ownerRef, busy))!;
    await pagesWithText(idle);
    await pagesWithText(busy);
    await pagesWithText(alone);
    await age(idleId, 31);
    await age(busyId, 31);
    expect(await investigations.touch(person.ownerRef, busy)).toBeInstanceOf(Date);
    // A debate in no investigation counts from when its text was stored.
    await database.pool.query("ALTER TABLE identity.web_page_text DISABLE TRIGGER guard_web_evidence_record");
    try {
      await database.pool.query("UPDATE identity.web_page_text SET stored_at = clock_timestamp() - interval '31 days' WHERE run_id=$1", [alone]);
    } finally {
      await database.pool.query("ALTER TABLE identity.web_page_text ENABLE TRIGGER guard_web_evidence_record");
    }
    const sweep = new PostgresInvestigationRunnerRepository(runner);
    expect(await sweep.wipeInactivePageText(1)).toBe(1);
    expect(await sweep.wipeInactivePageText(100)).toBe(3);
    expect([await texts(idle), await texts(busy), await texts(alone)]).toEqual([0, 2, 0]);
    expect((await investigations.read(person.ownerRef, idle))!.state).toBe("open");
    expect(await sqlError(() => sweep.wipeInactivePageText(0))).toMatchObject({ code: "22023", message: "WEB_PAGE_TEXT_SWEEP_INVALID" });
  });
});

describe("0133 the one reserve", () => {
  const amount = 200_000;
  it("R1 is held once, used by a closing, refilled, released; the order is the database's", async () => {
    const person = await account();
    const investigations = new PostgresInvestigationRepository(api);
    const root = await run(person);
    const investigationId = (await investigations.open(person.ownerRef, root))!;
    expect(await investigations.readReserve(person.ownerRef)).toEqual({ state: "NONE", heldMicros: null, since: null,
      blockedWindow: null, blockedUntil: null, openInvestigations: 1 });
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "HELD", amountMicros: amount })).toBe("RECORDED");
    // One reserve per person: never held twice, however many investigations are open.
    await investigations.open(person.ownerRef, await run(person));
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "HELD", amountMicros: amount })).toBe("NOT_ALLOWED");
    expect(await investigations.readReserve(person.ownerRef)).toMatchObject({ state: "HELD", heldMicros: amount, openInvestigations: 2 });
    // Used by a closing of the account's own investigation.
    await investigations.close(person.ownerRef, investigationId);
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "USED", investigationId: randomUUID(), reportVersion: 1 })).toBe("NOT_OWNED");
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "USED", investigationId, reportVersion: 1 })).toBe("RECORDED");
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "USED", investigationId, reportVersion: 1 })).toBe("NOT_ALLOWED");
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "RELEASED" })).toBe("NOT_ALLOWED");
    expect(await investigations.readReserve(person.ownerRef)).toMatchObject({ state: "USED", heldMicros: null, openInvestigations: 1 });
    // Refilled from credits, then given back.
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "HELD", amountMicros: amount })).toBe("RECORDED");
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "RELEASED" })).toBe("RECORDED");
    const events = (await database.pool.query("SELECT event_no,kind,amount_micros FROM identity.investigation_reserve_event WHERE owner_ref=$1 ORDER BY event_no",
      [person.ownerRef])).rows.map((row) => [row.event_no, row.kind, Number(row.amount_micros)]);
    expect(events).toEqual([[1, "HELD", amount], [2, "USED", amount], [3, "HELD", amount], [4, "RELEASED", amount]]);
  });

  it("R2 with no credits after a closing, BLOCKED waits for the limit that ran out to reset; only then is it held again", async () => {
    const person = await account();
    const investigations = new PostgresInvestigationRepository(api);
    const investigationId = (await investigations.open(person.ownerRef, await run(person)))!;
    await investigations.recordReserveEvent(person.ownerRef, { kind: "HELD", amountMicros: amount });
    await investigations.close(person.ownerRef, investigationId);
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "BLOCKED", window: "day", until: new Date(Date.now() + 3_600_000) }))
      .toBe("NOT_ALLOWED");
    await investigations.recordReserveEvent(person.ownerRef, { kind: "USED", investigationId, reportVersion: 1 });
    const until = new Date(Date.now() + 3_600_000);
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "BLOCKED", window: "week", until })).toBe("RECORDED");
    expect(await investigations.readReserve(person.ownerRef)).toMatchObject({ state: "BLOCKED", blockedWindow: "week", blockedUntil: until });
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "HELD", amountMicros: amount })).toBe("NOT_ALLOWED");
    // The reset passes (moved into the past by the superuser): the block reads NONE and the reserve may be held again.
    await database.pool.query("ALTER TABLE identity.investigation_reserve_event DISABLE TRIGGER guard_investigation_record");
    try {
      await database.pool.query("UPDATE identity.investigation_reserve_event SET blocked_until = clock_timestamp() - interval '1 second' WHERE owner_ref=$1 AND kind='BLOCKED'", [person.ownerRef]);
    } finally {
      await database.pool.query("ALTER TABLE identity.investigation_reserve_event ENABLE TRIGGER guard_investigation_record");
    }
    expect(await investigations.readReserve(person.ownerRef)).toMatchObject({ state: "NONE", blockedWindow: null, blockedUntil: null });
    expect(await investigations.recordReserveEvent(person.ownerRef, { kind: "HELD", amountMicros: amount })).toBe("RECORDED");
    for (const event of [{ kind: "HELD", amountMicros: 0 }, { kind: "BLOCKED", window: "year", until }, { kind: "BLOCKED", window: "day", until: new Date(Date.now() - 1000) }]) {
      expect(await sqlError(() => investigations.recordReserveEvent(person.ownerRef, event as never)), JSON.stringify(event))
        .toMatchObject({ code: "22023", message: "RESERVE_EVENT_INVALID" });
    }
    expect(await investigations.recordReserveEvent(randomUUID(), { kind: "HELD", amountMicros: amount })).toBe("NOT_OWNED");
    // The runner's wall reads the same state.
    expect(await new PostgresInvestigationRunnerRepository(runner).readReserve(person.ownerRef)).toMatchObject({ state: "HELD", heldMicros: amount });
  });

  it("R3 members and reserve events are append-only; no role reads a table; the runner's role writes none of the API's", async () => {
    const person = await account();
    const investigations = new PostgresInvestigationRepository(api);
    const root = await run(person);
    await investigations.open(person.ownerRef, root);
    await investigations.recordReserveEvent(person.ownerRef, { kind: "HELD", amountMicros: amount });
    for (const statement of ["UPDATE identity.investigation_member SET places='{w}' WHERE owner_ref=$1",
      "DELETE FROM identity.investigation_member WHERE owner_ref=$1", "UPDATE identity.investigation_reserve_event SET amount_micros=1 WHERE owner_ref=$1",
      "DELETE FROM identity.investigation_reserve_event WHERE owner_ref=$1"]) {
      expect(await sqlError(() => database.pool.query(statement, [person.ownerRef])), statement).toMatchObject({ code: "55000", message: "INVESTIGATION_APPEND_ONLY" });
    }
    for (const table of ["identity.investigation", "identity.investigation_member", "identity.investigation_closing", "identity.investigation_reserve_event"]) {
      for (const pool of [api, runner, erasure, worker]) {
        expect(await sqlError(() => pool.query(`SELECT count(*) FROM ${table}`)), table).toMatchObject({ code: "42501" });
      }
    }
    for (const [statement, values] of [["SELECT identity.open_investigation($1,$2)", [person.ownerRef, root]],
      ["SELECT identity.close_investigation($1,$2)", [person.ownerRef, root]],
      ["SELECT identity.record_reserve_event($1,'RELEASED',NULL,NULL,NULL,NULL,NULL)", [person.ownerRef]],
      ["SELECT identity.forget_erased_debate_investigation($1)", [root]], ["SELECT identity.investigation_json($1)", [root]],
      ["SELECT identity.wipe_investigation_page_text($1)", [root]]] as const) {
      expect(await sqlError(() => runner.query(statement, [...values])), statement).toMatchObject({ code: "42501" });
    }
  });
});

describe("0133 deleting", () => {
  it("D1 (R22 item 16) an erased root takes its investigation; an erased dig leaves it with the digs dug from it", async () => {
    const person = await account();
    const investigations = new PostgresInvestigationRepository(api);
    const root = await run(person);
    const dig = await run(person);
    const deeper = await run(person);
    const sibling = await run(person);
    const { investigationId } = await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: dig, places: [], mode: "quick" });
    await investigations.join({ ownerRef: person.ownerRef, parentRunId: dig, childRunId: deeper, places: [], mode: "quick" });
    await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: sibling, places: [], mode: "quick" });
    await investigations.recordReserveEvent(person.ownerRef, { kind: "HELD", amountMicros: 200_000 });
    expect(await sqlError(() => erasure.query("SELECT identity.forget_erased_debate_investigation($1)", [dig])))
      .toMatchObject({ code: "55000", message: "INVESTIGATION_DEBATE_NOT_ERASED" });
    await seedTombstone(dig);
    expect((await erasure.query("SELECT identity.forget_erased_debate_investigation($1) AS n", [dig])).rows[0].n).toBe(2);
    expect((await investigations.read(person.ownerRef, root))!.members.map((member) => member.run_id)).toEqual([root, sibling]);
    expect(await investigations.read(person.ownerRef, deeper)).toBeNull();
    await investigations.close(person.ownerRef, investigationId!);
    await seedTombstone(root);
    // The investigation, its two remaining members and its closing.
    expect((await erasure.query("SELECT identity.forget_erased_debate_investigation($1) AS n", [root])).rows[0].n).toBe(4);
    expect(Number((await database.pool.query("SELECT count(*) AS n FROM identity.investigation WHERE owner_ref=$1", [person.ownerRef])).rows[0].n)).toBe(0);
    // The reserve stays with the account.
    expect(await investigations.readReserve(person.ownerRef)).toMatchObject({ state: "HELD" });
  });

  it("D2 deleting the account removes its investigations, members, closings and reserve events", async () => {
    const person = await account();
    const keeper = await account();
    const investigations = new PostgresInvestigationRepository(api);
    for (const owner of [person, keeper]) {
      const { investigationId } = await investigations.join({ ownerRef: owner.ownerRef, parentRunId: await run(owner), childRunId: await run(owner), places: [], mode: "quick" });
      await investigations.recordReserveEvent(owner.ownerRef, { kind: "HELD", amountMicros: 200_000 });
      await investigations.close(owner.ownerRef, investigationId!);
      await investigations.recordReserveEvent(owner.ownerRef, { kind: "USED", investigationId: investigationId!, reportVersion: 1 });
    }
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [person.userId]);
    const left = async (owner: string) => Number((await database.pool.query(`SELECT
      (SELECT count(*) FROM identity.investigation WHERE owner_ref=$1) + (SELECT count(*) FROM identity.investigation_member WHERE owner_ref=$1)
      + (SELECT count(*) FROM identity.investigation_closing WHERE owner_ref=$1) + (SELECT count(*) FROM identity.investigation_reserve_event WHERE owner_ref=$1) AS n`,
      [owner])).rows[0].n);
    expect(await left(person.ownerRef)).toBe(0);
    expect(await left(keeper.ownerRef)).toBe(1 + 2 + 1 + 2);
  });

  it("D3 the export worker reads the account's investigations and reserve events behind its lease", async () => {
    const person = await account();
    const investigations = new PostgresInvestigationRepository(api);
    const root = await run(person);
    const investigationId = (await investigations.open(person.ownerRef, root))!;
    await investigations.recordReserveEvent(person.ownerRef, { kind: "HELD", amountMicros: 200_000 });
    const exportId = randomUUID();
    const lease = randomUUID();
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, person.userId, randomUUID(), lease]);
    const exported = (await worker.query("SELECT identity.read_data_export_investigations($1,$2) AS e", [exportId, lease])).rows[0].e;
    expect(exported.investigations).toEqual([expect.objectContaining({ investigation_id: investigationId, root_run_id: root, state: "open" })]);
    expect(exported.reserve_events).toEqual([expect.objectContaining({ event_no: 1, kind: "HELD", amount_micros: 200_000 })]);
    expect(await sqlError(() => worker.query("SELECT identity.read_data_export_investigations($1,$2)", [exportId, randomUUID()])))
      .toMatchObject({ code: "P0001", message: "DATA_EXPORT_LEASE_INVALID" });
  });
});
