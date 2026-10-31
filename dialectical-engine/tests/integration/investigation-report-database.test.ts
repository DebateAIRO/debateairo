import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPool,
  migrate,
  PostgresInvestigationReportRepository,
  PostgresInvestigationReportRunnerRepository,
  PostgresInvestigationRepository,
  type InvestigationReportRecord,
  type Pool,
  type WebSealed
} from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0136 on real PostgreSQL (plan task W5-1; owner answer F7 A): the final report over an investigation. The runner's role
 * lists the closings still waiting for their report, reads what a report still waits for (a running dig counts, a dig
 * paused at the month wall does not, a settled dig whose path rewrite is not written yet counts), writes the report once
 * (and 0133's closing records it), reads the reports and when the newest unreported closing was made; the API's role
 * reads the person's reports; the content trigger binds the envelope to the root's run and the report id; the spend
 * source INVESTIGATION_REPORT must name its run; erasing the root and deleting the account remove the reports; no
 * request role reads the table. Data is made up.
 */
let database: TestDatabase;
let api: Pool;
let runner: Pool;
let erasure: Pool;
let worker: Pool;
let sequence = 9_600_000;
const SECRET = Buffer.alloc(32, 9);
const ENVELOPE = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" };
const CARRIER = "identity.investigation_report";
const LINEAGE = { maker: "maker-a", model_id: "model-a", transport: "openai-compatible-http", provider_ref: "provider:a" };

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
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `rep-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef };
}
/** Runs a few statements as the superuser with triggers off (seeding rows the runner or the scheduler would write). */
async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
/** A private debate with content encryption and its attestation secret, and no work item yet (queued). */
async function run(owner: Account): Promise<string> {
  const runId = randomUUID();
  const seq = ++sequence;
  await seeded([[`INSERT INTO core.run
      (run_id,question_line,asker_id,session_id,caller_scope,as_of,asker_risk_tier,risk_tier,
       tier_source,tier_provenance_ref,composition_budget_tier,depth_params,agent_count,discovered_panel,
       stranger_sample_rate,envelope_basis,register_version,battery_version,ask_contract,created_at_seq,
       question_blind_index_version,content_encryption_version)
      VALUES ($1,'Fixture question',$2,$3,'ASKER',now(),'standard','standard','ASKER','fixture','low',
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,1)`, [runId, `owner:${owner.ownerRef}`, randomUUID(), seq]],
    ["INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner.ownerRef, seq]],
    ["INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at) VALUES ($1,$2,now())", [runId, SECRET]]]);
  return runId;
}
/** One work item of the run in `state` (DONE: settled; CLAIMED: running; FAILED: failed). */
async function work(runId: string, state: "DONE" | "CLAIMED" | "FAILED"): Promise<void> {
  await seeded([[`INSERT INTO core.work_item (run_id,battery_row_id,node_set,command_key,state,claimed_by,claim_deadline,terminal_reason,created_at_seq)
    VALUES ($1,'fixture','[]'::jsonb,$2,$3,$4,$5,$6,$7)`, [runId, `fixture:${randomUUID()}`, state,
    state === "CLAIMED" ? "fixture-runner" : null, state === "CLAIMED" ? new Date(Date.now() + 600_000) : null,
    state === "FAILED" ? "FIXTURE_FAILED" : null, ++sequence]]]);
}
/** A dig's pick set on a path (0135), and optionally its stored path rewrite (0134). */
async function onPath(owner: Account, root: string, dig: string, rewritten: boolean): Promise<void> {
  await seeded([["INSERT INTO identity.dig_pick_set (run_id,owner_ref,parent_run_id,position_ref,pick_count) VALUES ($1,$2,$3,'pos-1',0)",
    [dig, owner.ownerRef, root]]]);
  if (rewritten) await rewrite(owner, root, dig, 1);
}
/** The dig's turn on the path and its stored rewrite (a FAILED one: no text), as the runner would write them. */
async function rewrite(owner: Account, root: string, dig: string, pathSeq: number): Promise<void> {
  await seeded([["INSERT INTO identity.path_rewrite_turn (run_id,owner_ref,parent_run_id,position_ref,path_seq) VALUES ($1,$2,$3,'pos-1',$4)",
    [dig, owner.ownerRef, root, pathSeq]],
  [`INSERT INTO identity.path_rewrite (rewrite_id,run_id,owner_ref,parent_run_id,parent_answer_version,position_ref,path_seq,
      outcome,failure_code,fate_before,rounds,artifact_refs) VALUES ($1,$2,$3,$4,1,'pos-1',$5,'FAILED','FIXTURE_FAILED','HELD_UP',0,'[]'::jsonb)`,
    [randomUUID(), dig, owner.ownerRef, root, pathSeq]]]);
}
async function sealed(runId: string, ref: string): Promise<WebSealed> {
  const attestation = (await database.pool.query<{ value: Buffer }>(`SELECT audit_crypto_internal.hmac(
      core.content_envelope_attestation_bytes($1,$2,$3,'content_ciphertext',$4::jsonb),$5::bytea,'sha256') AS value`,
    [runId, CARRIER, ref, JSON.stringify(ENVELOPE), SECRET])).rows[0]!.value;
  return { envelope: ENVELOPE as never, attestation };
}
async function seedTombstone(runId: string): Promise<void> {
  await seeded([[`INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count)
    VALUES ($1,clock_timestamp(),1,0)`, [runId]]]);
}
/** An investigation of a settled root, with its digs joined; closed when `close` is set. */
async function investigation(owner: Account, digs = 0, close = true): Promise<Readonly<{ id: string; root: string; digs: string[] }>> {
  const investigations = new PostgresInvestigationRepository(api);
  const root = await run(owner);
  await work(root, "DONE");
  const id = (await investigations.open(owner.ownerRef, root))!;
  const joined: string[] = [];
  for (let at = 0; at < digs; at += 1) {
    const dig = await run(owner);
    expect(await investigations.join({ ownerRef: owner.ownerRef, parentRunId: root, childRunId: dig, places: ["path:pos-1"], mode: "quick" }))
      .toMatchObject({ outcome: "JOINED" });
    joined.push(dig);
  }
  if (close) expect(await investigations.close(owner.ownerRef, id)).toMatchObject({ outcome: "CLOSED" });
  return { id, root, digs: joined };
}
const written = async (id: string, version: number, root: string): Promise<InvestigationReportRecord> => {
  const reportId = randomUUID();
  return { investigationId: id, reportVersion: version, reportId, outcome: "READY", storyOutcome: "READY_WITH_RESERVATION",
    failureCode: null, coveredRewrite: { rewriteId: randomUUID(), recordedAt: new Date().toISOString() },
    dossierFingerprint: "a".repeat(64), ladderStep: 2, leftOut: 3, answerRounds: 1, storyRounds: 2,
    writerLineage: LINEAGE, checkerLineage: { ...LINEAGE, maker: "maker-b" }, artifactRefs: [randomUUID()], spentMicros: 120_000,
    content: await sealed(root, reportId) };
};
const failed = (id: string, version: number): InvestigationReportRecord => ({ investigationId: id, reportVersion: version,
  reportId: randomUUID(), outcome: "FAILED", storyOutcome: null, failureCode: "REPORT_WRITER_FAILED", coveredRewrite: null,
  dossierFingerprint: "b".repeat(64), ladderStep: 5, leftOut: 0, answerRounds: 0, storyRounds: 0, writerLineage: null,
  checkerLineage: null, artifactRefs: [], spentMicros: 0, content: null });
const reportRows = async (id: string): Promise<number> =>
  Number((await database.pool.query("SELECT count(*) AS n FROM identity.investigation_report WHERE investigation_id=$1", [id])).rows[0].n);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE rep_api LOGIN PASSWORD 'rep-api-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE rep_runner LOGIN PASSWORD 'rep-runner-test-only' IN ROLE debateai_runtime");
  await database.pool.query("CREATE ROLE rep_erasure LOGIN PASSWORD 'rep-erasure-test-only' IN ROLE debateai_erasure_runtime");
  await database.pool.query("CREATE ROLE rep_worker LOGIN PASSWORD 'rep-worker-test-only' IN ROLE debateai_data_export_worker");
  api = loginPool("rep_api", "rep-api-test-only");
  runner = loginPool("rep_runner", "rep-runner-test-only");
  erasure = loginPool("rep_erasure", "rep-erasure-test-only");
  worker = loginPool("rep_worker", "rep-worker-test-only");
  expect((await runner.query("SELECT current_user AS name")).rows[0].name).toBe("rep_runner");
}, 300_000);

afterAll(async () => {
  await Promise.all([api?.end(), runner?.end(), erasure?.end(), worker?.end()]);
  await database?.stop();
});

describe("0136 the runner's side", () => {
  it("U1 lists the closings still waiting for their report, oldest first; reopened and written ones are left out", async () => {
    const person = await account();
    const reports = new PostgresInvestigationReportRunnerRepository(runner);
    const first = await investigation(person);
    const second = await investigation(person);
    const reopened = await investigation(person);
    expect(await new PostgresInvestigationRepository(api).reopen(person.ownerRef, reopened.id)).toBe("REOPENED");
    const done = await investigation(person);
    expect(await reports.record(failed(done.id, 1))).toBe("RECORDED");
    const ours = new Set([first.id, second.id, reopened.id, done.id]);
    const listed = (await reports.readUnreported(100)).filter((closing) => ours.has(closing.investigationId));
    expect(listed.map(({ investigationId, reportVersion, rootRunId }) => ({ investigationId, reportVersion, rootRunId }))).toEqual([
      { investigationId: first.id, reportVersion: 1, rootRunId: first.root },
      { investigationId: second.id, reportVersion: 1, rootRunId: second.root }]);
    expect(Date.parse(listed[0]!.closedAt)).toBeLessThanOrEqual(Date.parse(listed[1]!.closedAt));
    expect((await reports.readUnreported(1))).toHaveLength(1);
    for (const limit of [0, 101]) {
      expect(await sqlError(() => reports.readUnreported(limit))).toMatchObject({ code: "22023", message: "INVESTIGATION_REPORT_LIST_INVALID" });
    }
  });

  it("U2 waits for a running dig and a settled dig whose rewrite is not written; not for a paused, rewritten, failed or pathless one", async () => {
    const person = await account();
    const { id, root, digs } = await investigation(person, 6, false);
    const [running, paused, unwritten, rewritten, broken, pathless] = digs as [string, string, string, string, string, string];
    // running: no work item yet. paused: running, then paused at the month wall.
    await work(paused, "CLAIMED");
    expect((await runner.query("SELECT identity.record_run_pause($1,'MONTH_WALL',clock_timestamp()+interval '1 day',3,1,4000) AS o", [paused]))
      .rows[0].o).toBe("RECORDED");
    await work(unwritten, "DONE");
    await onPath(person, root, unwritten, false);
    await work(rewritten, "DONE");
    await onPath(person, root, rewritten, true);
    await work(broken, "FAILED");
    await onPath(person, root, broken, false);
    await work(pathless, "DONE");
    const reports = new PostgresInvestigationReportRunnerRepository(runner);
    const read = await reports.readWaiting(root);
    expect(read).toEqual({ investigation_id: id, root_run_id: root, waiting: [running, unwritten].sort() });
    // Any member's read names the same investigation; a debate in none, or not live, reads null.
    expect(await reports.readWaiting(pathless)).toEqual(read);
    const alone = await run(person);
    expect(await reports.readWaiting(alone)).toBeNull();
    expect(await reports.readWaiting(randomUUID())).toBeNull();
    // The running dig settles and the rewrite is written: nothing waits.
    await work(running, "DONE");
    await rewrite(person, root, unwritten, 2);
    expect((await reports.readWaiting(root))?.waiting).toEqual([]);
  });

  it("U3 writes a report once, recorded on 0133's closing in the same transaction; ALREADY and NO_CLOSING write nothing", async () => {
    const person = await account();
    const reports = new PostgresInvestigationReportRunnerRepository(runner);
    const { id, root } = await investigation(person);
    const closedAt = (await database.pool.query<{ closed_at: Date }>(
      "SELECT closed_at FROM identity.investigation_closing WHERE investigation_id=$1 AND report_version=1", [id])).rows[0]!.closed_at;
    expect(await reports.readClosingSince(root)).toEqual(closedAt);
    const record = await written(id, 1, root);
    expect(await reports.record(record)).toBe("RECORDED");
    const closing = (await database.pool.query<{ report_ref: string | null; report_written_at: Date | null }>(
      "SELECT report_ref, report_written_at FROM identity.investigation_closing WHERE investigation_id=$1 AND report_version=1", [id])).rows[0]!;
    expect(closing.report_ref).toBe(record.reportId);
    expect(closing.report_written_at).not.toBeNull();
    expect(await reports.readClosingSince(root)).toBeNull();
    // Again, with the same id or another: nothing written.
    expect(await reports.record(record)).toBe("ALREADY");
    expect(await reports.record({ ...(await written(id, 1, root)) })).toBe("ALREADY");
    expect(await reportRows(id)).toBe(1);
    // No such closing; a closing reopened before its report.
    expect(await reports.record(failed(randomUUID(), 1))).toBe("NO_CLOSING");
    expect(await reports.record(failed(id, 2))).toBe("NO_CLOSING");
    const investigations = new PostgresInvestigationRepository(api);
    expect(await investigations.reopen(person.ownerRef, id)).toBe("REOPENED");
    expect(await investigations.close(person.ownerRef, id)).toMatchObject({ outcome: "CLOSED", reportVersion: 2 });
    const second = (await database.pool.query<{ closed_at: Date }>(
      "SELECT closed_at FROM identity.investigation_closing WHERE investigation_id=$1 AND report_version=2", [id])).rows[0]!.closed_at;
    expect(await reports.readClosingSince(root)).toEqual(second);
    expect(await investigations.reopen(person.ownerRef, id)).toBe("REOPENED");
    expect(await reports.readClosingSince(root)).toBeNull();
    expect(await reports.record(failed(id, 2))).toBe("NO_CLOSING");
    expect(await reportRows(id)).toBe(1);
    expect(await reports.readClosingSince(randomUUID())).toBeNull();
    // A third closing gets a FAILED report: no text.
    expect(await investigations.close(person.ownerRef, id)).toMatchObject({ outcome: "CLOSED", reportVersion: 3 });
    const third = failed(id, 3);
    expect(await reports.record(third)).toBe("RECORDED");
    const read = await reports.readOfRun(root);
    expect(read).toMatchObject({ investigation_id: id, root_run_id: root });
    expect(read!.reports.map((entry) => [entry.report_version, entry.report_id, entry.outcome, entry.story_outcome, entry.failure_code]))
      .toEqual([[1, record.reportId, "READY", "READY_WITH_RESERVATION", null], [3, third.reportId, "FAILED", null, "REPORT_WRITER_FAILED"]]);
    expect(read!.reports[0]).toMatchObject({ covered_rewrite_id: record.coveredRewrite!.rewriteId, ladder_step: 2, left_out: 3,
      spent_micros: 120_000, content: ENVELOPE });
    expect(read!.reports[1]!.content).toBeNull();
    expect(await reports.readOfRun(randomUUID())).toBeNull();
  });

  it("U4 the content is bound to the root's run and the report id; the table's shape rules and the refusals hold", async () => {
    const person = await account();
    const reports = new PostgresInvestigationReportRunnerRepository(runner);
    const { id, root } = await investigation(person, 1);
    const other = await run(person);
    const record = await written(id, 1, root);
    // Sealed under another run, or for another report id.
    expect(await sqlError(async () => reports.record({ ...record, content: await sealed(other, record.reportId) })))
      .toMatchObject({ code: "22023", message: "CONTENT_ATTESTATION_INVALID" });
    expect(await sqlError(async () => reports.record({ ...record, content: await sealed(root, randomUUID()) })))
      .toMatchObject({ code: "22023", message: "CONTENT_ATTESTATION_INVALID" });
    // A written report without text, a FAILED one with a story outcome, without its writer, with no code.
    for (const broken of [{ ...record, content: null }, { ...failed(id, 1), storyOutcome: "READY" as const },
      { ...record, writerLineage: null }, { ...record, answerRounds: 0 }, { ...failed(id, 1), failureCode: null },
      { ...record, ladderStep: 6 }, { ...record, dossierFingerprint: "nope" }, { ...record, artifactRefs: Array.from({ length: 65 }, () => "x") }]) {
      expect(await sqlError(() => reports.record(broken)), JSON.stringify(broken)).toMatchObject({ code: "23514" });
    }
    for (const broken of [{ ...record, outcome: "MAYBE" as never }, { ...record, content: { ...record.content!, attestation: null as never } }]) {
      expect(await sqlError(() => reports.record(broken))).toMatchObject({ code: "22023", message: "INVESTIGATION_REPORT_RECORD_INVALID" });
    }
    expect(await reportRows(id)).toBe(0);
    expect(await reports.record(record)).toBe("RECORDED");
    // Append-only, even for the superuser.
    for (const statement of ["UPDATE identity.investigation_report SET left_out=0 WHERE investigation_id=$1",
      "DELETE FROM identity.investigation_report WHERE investigation_id=$1"]) {
      expect(await sqlError(() => database.pool.query(statement, [id])), statement)
        .toMatchObject({ code: "55000", message: "INVESTIGATION_REPORT_APPEND_ONLY" });
    }
  });
});

describe("0136 the API's reader, the spend source, the grants", () => {
  it("A1 the owner reads the investigation, how many debates the report waits for and the reports; another account reads null", async () => {
    const person = await account();
    const stranger = await account();
    const { id, root, digs } = await investigation(person, 1);
    const record = await written(id, 1, root);
    expect(await new PostgresInvestigationReportRunnerRepository(runner).record(record)).toBe("RECORDED");
    const reports = new PostgresInvestigationReportRepository(api);
    const read = await reports.read(person.ownerRef, digs[0]!);
    expect(read).toMatchObject({ investigation: { investigation_id: id, root_run_id: root, state: "closed" }, waiting: 1 });
    expect(read!.investigation.closings[0]).toMatchObject({ report_version: 1, report_ref: record.reportId });
    expect(read!.reports).toEqual([expect.objectContaining({ report_version: 1, report_id: record.reportId, content: ENVELOPE })]);
    expect(await reports.read(stranger.ownerRef, root)).toBeNull();
    expect(await reports.read(person.ownerRef, await run(person))).toBeNull();
    // The runner's role cannot reach the API's reader.
    expect(await sqlError(() => new PostgresInvestigationReportRepository(runner).read(person.ownerRef, root))).toMatchObject({ code: "42501" });
  });

  it("A2 the spend source INVESTIGATION_REPORT is accepted only with a run", async () => {
    const person = await account();
    const root = await run(person);
    const insert = (runId: string | null) => seeded([[`INSERT INTO ledger.model_spend
        (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
      VALUES ($1,'INVESTIGATION_REPORT',$2,'provider:fixture',current_date,10,1,1)`, [randomUUID(), runId]]]);
    await insert(root);
    expect(await sqlError(() => insert(null))).toMatchObject({ code: "23514" });
    expect(Number((await database.pool.query("SELECT count(*) AS n FROM ledger.model_spend WHERE run_id=$1 AND spend_source='INVESTIGATION_REPORT'",
      [root])).rows[0].n)).toBe(1);
  });

  it("A3 no request role reads the table; the private helpers are no one's; the runner writes nothing of the API's", async () => {
    const person = await account();
    const { id, root } = await investigation(person);
    for (const pool of [api, runner, erasure, worker]) {
      expect(await sqlError(() => pool.query("SELECT count(*) FROM identity.investigation_report"))).toMatchObject({ code: "42501" });
      for (const [statement, values] of [["SELECT identity.investigation_report_waiting($1)", [id]],
        ["SELECT identity.investigation_reports_json($1)", [id]]] as const) {
        expect(await sqlError(() => pool.query(statement, [...values])), statement).toMatchObject({ code: "42501" });
      }
    }
    for (const pool of [erasure, worker]) {
      expect(await sqlError(() => pool.query("SELECT identity.read_unreported_closings(10)"))).toMatchObject({ code: "42501" });
      expect(await sqlError(() => pool.query("SELECT identity.read_closing_since_of_root($1)", [root]))).toMatchObject({ code: "42501" });
    }
  });

  it("A4 the export worker reads the account's reports, codes only, behind its lease", async () => {
    const person = await account();
    const { id, root } = await investigation(person);
    const record = await written(id, 1, root);
    expect(await new PostgresInvestigationReportRunnerRepository(runner).record(record)).toBe("RECORDED");
    const exportId = randomUUID();
    const lease = randomUUID();
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, person.userId, randomUUID(), lease]);
    const exported = (await worker.query("SELECT identity.read_data_export_investigation_reports($1,$2) AS e", [exportId, lease])).rows[0].e;
    expect(exported.investigation_reports).toEqual([expect.objectContaining({ investigation_id: id, report_version: 1,
      report_id: record.reportId, root_run_id: root, outcome: "READY", ladder_step: 2 })]);
    expect(exported.investigation_reports[0]).not.toHaveProperty("content");
    expect(exported.investigation_reports[0]).not.toHaveProperty("spent_micros");
    expect(await sqlError(() => worker.query("SELECT identity.read_data_export_investigation_reports($1,$2)", [exportId, randomUUID()])))
      .toMatchObject({ code: "P0001", message: "DATA_EXPORT_LEASE_INVALID" });
  });
});

describe("0136 deleting", () => {
  it("D1 an erased root takes its investigation, its closings and their reports; an erased dig leaves them", async () => {
    const person = await account();
    const { id, root, digs } = await investigation(person, 1);
    expect(await new PostgresInvestigationReportRunnerRepository(runner).record(await written(id, 1, root))).toBe("RECORDED");
    await seedTombstone(digs[0]!);
    await erasure.query("SELECT identity.forget_erased_debate_investigation($1)", [digs[0]!]);
    expect(await reportRows(id)).toBe(1);
    await seedTombstone(root);
    // The investigation, its one member left and its closing; the report goes with the closing.
    expect((await erasure.query("SELECT identity.forget_erased_debate_investigation($1) AS n", [root])).rows[0].n).toBe(3);
    expect(await reportRows(id)).toBe(0);
  });

  it("D2 deleting the account removes its reports and leaves another account's", async () => {
    const person = await account();
    const keeper = await account();
    const ids: string[] = [];
    for (const owner of [person, keeper]) {
      const { id, root } = await investigation(owner);
      expect(await new PostgresInvestigationReportRunnerRepository(runner).record(await written(id, 1, root))).toBe("RECORDED");
      ids.push(id);
    }
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [person.userId]);
    expect(await reportRows(ids[0]!)).toBe(0);
    expect(await reportRows(ids[1]!)).toBe(1);
  });
});
