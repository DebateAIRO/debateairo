import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresWebEvidenceRepository, type Pool, type WebSealed } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0132 on real PostgreSQL (Perplexity plan 2026-10-30, task W1-3; owner answers Q4, Q7, Q11): the web evidence store.
 * The runner's role writes and reads one debate's searches, pages, transient page texts, readings, extracts, top pages and
 * packs; every content value is an attested envelope under the run's key, never plaintext; the API's role records the
 * person's "added to researched" choices; no role reads a table; the rows are append-only; deleting one debate (R22 item
 * 16) and deleting the account remove them; the export worker reads them behind its lease. Pages are made up.
 */
let database: TestDatabase;
let runner: Pool;
let api: Pool;
let erasure: Pool;
let worker: Pool;
let sequence = 9_100_000;
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
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `web-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef };
}
/** A private debate with content encryption (0038) and its attestation secret, seeded as 0127's suite seeds one. */
async function encryptedRun(owner: Account, encrypted = true): Promise<string> {
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
       '{}'::jsonb,2,'[{},{}]'::jsonb,0,'{}'::jsonb,1,'fixture','{}'::jsonb,$4,1,$5)`,
      [runId, `owner:${owner.ownerRef}`, randomUUID(), seq, encrypted ? 1 : null]);
    await seed.query("INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner.ownerRef, seq]);
    await seed.query("INSERT INTO core.run_content_attestation_secret(run_id,secret,created_at) VALUES ($1,$2,now())", [runId, SECRET]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
  return runId;
}
/** The runner's attestation of the fixture envelope for one carrier row (0040's attestation bytes, the run's secret). */
async function sealed(run: string, carrier: string, ref: string, envelope: object = ENVELOPE): Promise<WebSealed> {
  const attestation = (await database.pool.query<{ value: Buffer }>(`SELECT audit_crypto_internal.hmac(
      core.content_envelope_attestation_bytes($1,$2,$3,'content_ciphertext',$4::jsonb),$5::bytea,'sha256') AS value`,
    [run, carrier, ref, JSON.stringify(envelope), SECRET])).rows[0]!.value;
  return { envelope: envelope as never, attestation };
}
async function seedTombstone(run: string): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    await seed.query(`INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count)
      VALUES ($1,clock_timestamp(),1,0)`, [run]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}

type Step = Readonly<{ run: string; search: string; pages: readonly string[]; readings: readonly string[]; extract: string; pack: string }>;
/** One path's web step, as W3-1 will store it: a FOUND search, three pages with their texts, readings, an extract, picks, a pack. */
async function webStep(repository: PostgresWebEvidenceRepository, run: string, path = "pos-1"): Promise<Step> {
  const search = randomUUID();
  expect(await repository.recordSearch({ runId: run, searchId: search, pathRef: path, side: "for", languageKind: "english",
    language: "en", country: null, lookBack: "12m", outcome: "FOUND", chargeMicros: 1000, resultCount: 3,
    words: await sealed(run, "identity.web_search", search) })).toBe("RECORDED");
  const pages: string[] = [];
  for (const rank of [1, 2, 3]) {
    const page = randomUUID();
    pages.push(page);
    expect(await repository.recordPage({ runId: run, pageId: page, searchId: search, rank, readDepth: rank === 3 ? "preview" : "whole",
      about: await sealed(run, "identity.web_page", page),
      text: { chars: 1200 * rank, digest: createHash("sha256").update(`keyed-${page}`).digest(),
        sealed: await sealed(run, "identity.web_page_text", page) } })).toBe("RECORDED");
  }
  const readings: string[] = [];
  for (const [reader, maker, page] of [[1, "anthropic", pages[0]], [2, "deepseek", pages[0]], [3, "zhipu", pages[0]], [1, "anthropic", pages[1]]] as const) {
    const reading = randomUUID();
    readings.push(reading);
    expect(await repository.recordReading({ runId: run, readingId: reading, pageId: page!, reader, maker, outcome: "READ",
      grade: reader === 1 ? 3 : 2, line: await sealed(run, "identity.web_reading", reading) })).toBe("RECORDED");
  }
  const extract = randomUUID();
  expect(await repository.recordExtract({ runId: run, extractId: extract, pageId: pages[0]!, label: "S1-1", foundBy: [1, 2],
    quote: await sealed(run, "identity.web_extract", extract) })).toBe("RECORDED");
  expect(await repository.recordPicks(run, path, [pages[0]!, pages[1]!])).toBe("RECORDED");
  const pack = randomUUID();
  expect(await repository.recordPack({ runId: run, packId: pack, pathRef: path, extractLabels: ["S1-1"],
    pack: await sealed(run, "identity.web_pack", pack) })).toBe("RECORDED");
  return { run, search, pages, readings, extract, pack };
}
const rowsOf = async (run: string): Promise<number> => Number((await database.pool.query<{ n: string }>(`SELECT
  (SELECT count(*) FROM identity.web_search WHERE run_id=$1) + (SELECT count(*) FROM identity.web_page WHERE run_id=$1)
  + (SELECT count(*) FROM identity.web_page_text WHERE run_id=$1) + (SELECT count(*) FROM identity.web_reading WHERE run_id=$1)
  + (SELECT count(*) FROM identity.web_extract WHERE run_id=$1) + (SELECT count(*) FROM identity.web_pick WHERE run_id=$1)
  + (SELECT count(*) FROM identity.web_pack WHERE run_id=$1) + (SELECT count(*) FROM identity.web_researched WHERE run_id=$1) AS n`, [run])).rows[0]!.n);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE web_runner LOGIN PASSWORD 'web-runner-test-only' IN ROLE debateai_runtime");
  await database.pool.query("CREATE ROLE web_api LOGIN PASSWORD 'web-api-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE web_erasure LOGIN PASSWORD 'web-erasure-test-only' IN ROLE debateai_erasure_runtime");
  await database.pool.query("CREATE ROLE web_worker LOGIN PASSWORD 'web-worker-test-only' IN ROLE debateai_data_export_worker");
  runner = loginPool("web_runner", "web-runner-test-only");
  api = loginPool("web_api", "web-api-test-only");
  erasure = loginPool("web_erasure", "web-erasure-test-only");
  worker = loginPool("web_worker", "web-worker-test-only");
  expect((await runner.query("SELECT current_user AS name")).rows[0].name).toBe("web_runner");
}, 300_000);

afterAll(async () => {
  await Promise.all([runner?.end(), api?.end(), erasure?.end(), worker?.end()]);
  await database?.stop();
});

describe("0132 the runner writes and reads a debate's web step", () => {
  it("W1 stores the step in order, reads it back (no page text in the read), and a resumed run's second write changes nothing", async () => {
    const person = await account();
    const run = await encryptedRun(person);
    const repository = new PostgresWebEvidenceRepository(runner);
    const step = await webStep(repository, run);
    const web = (await repository.read(run))!;
    expect(web.searches).toEqual([expect.objectContaining({ search_id: step.search, path_ref: "pos-1", side: "for",
      language_kind: "english", outcome: "FOUND", charge_micros: 1000, result_count: 3, content: ENVELOPE })]);
    expect(web.pages.map((page) => [page.rank, page.read_depth, page.text_state])).toEqual([[1, "whole", "STORED"], [2, "whole", "STORED"], [3, "preview", "STORED"]]);
    expect(web.readings.filter((reading) => reading.page_id === step.pages[0]).map((reading) => [reading.reader, reading.maker, reading.grade]))
      .toEqual([[1, "anthropic", 3], [2, "deepseek", 2], [3, "zhipu", 2]]);
    expect(web.extracts).toEqual([expect.objectContaining({ extract_id: step.extract, label: "S1-1", path_ref: "pos-1", found_by: [1, 2] })]);
    expect(web.picks).toEqual([{ path_ref: "pos-1", rank: 1, page_id: step.pages[0] }, { path_ref: "pos-1", rank: 2, page_id: step.pages[1] }]);
    expect(web.packs).toEqual([expect.objectContaining({ pack_id: step.pack, extract_labels: ["S1-1"] })]);
    // The read never carries a page's text; the texts come one call apart, with their keyed digests.
    expect(JSON.stringify(web)).not.toContain("web_page_text");
    const texts = await repository.readPageTexts(run, [step.pages[0]!, step.pages[2]!, randomUUID()]);
    expect(texts.map((text) => text.pageId).sort()).toEqual([step.pages[0]!, step.pages[2]!].sort());
    expect(texts[0]!.textDigest).toHaveLength(32);
    // A resumed run writes the same rows again: ALREADY, and the first stays.
    expect(await repository.recordSearch({ runId: run, searchId: step.search, pathRef: "pos-2", side: "against", languageKind: "english",
      language: "en", country: null, lookBack: "3y", outcome: "EMPTY", chargeMicros: 1000, resultCount: 0,
      words: await sealed(run, "identity.web_search", step.search) })).toBe("ALREADY");
    expect(await repository.recordPicks(run, "pos-1", [step.pages[2]!])).toBe("ALREADY");
    expect((await repository.read(run))!.searches[0]!.path_ref).toBe("pos-1");
  });

  it("W2 a failed or refused search costs nothing and a refused one keeps no words; a local search names its country", async () => {
    const person = await account();
    const run = await encryptedRun(person);
    const repository = new PostgresWebEvidenceRepository(runner);
    const base = { runId: run, pathRef: "pos-1", side: "against" as const, languageKind: "english" as const, language: "en",
      country: null, lookBack: "none" as const, resultCount: 0 };
    const failed = randomUUID();
    expect(await repository.recordSearch({ ...base, searchId: failed, outcome: "FAILED", chargeMicros: 0,
      words: await sealed(run, "identity.web_search", failed) })).toBe("RECORDED");
    const refused = randomUUID();
    expect(await repository.recordSearch({ ...base, searchId: refused, outcome: "REFUSED", chargeMicros: 0, words: null })).toBe("RECORDED");
    const charged = randomUUID();
    expect(await sqlError(async () => repository.recordSearch({ ...base, searchId: charged, outcome: "FAILED", chargeMicros: 1000,
      words: await sealed(run, "identity.web_search", charged) }))).toMatchObject({ code: "23514" });
    const wordy = randomUUID();
    expect(await sqlError(async () => repository.recordSearch({ ...base, searchId: wordy, outcome: "REFUSED", chargeMicros: 0,
      words: await sealed(run, "identity.web_search", wordy) }))).toMatchObject({ code: "23514" });
    const local = randomUUID();
    expect(await sqlError(async () => repository.recordSearch({ ...base, searchId: local, languageKind: "local", language: "ro",
      outcome: "EMPTY", chargeMicros: 1000, words: await sealed(run, "identity.web_search", local) }))).toMatchObject({ code: "23514" });
    expect(await repository.recordSearch({ ...base, searchId: local, languageKind: "local", language: "ro", country: "RO",
      outcome: "EMPTY", chargeMicros: 1000, words: await sealed(run, "identity.web_search", local) })).toBe("RECORDED");
    // A page only of a FOUND search of this run, within its result count.
    const page = randomUUID();
    expect(await repository.recordPage({ runId: run, pageId: page, searchId: failed, rank: 1, readDepth: "whole",
      about: await sealed(run, "identity.web_page", page), text: null })).toBe("NO_SEARCH");
  });

  it("W3 never keeps plaintext: a run without content encryption, a value that is not an envelope and a wrong attestation are refused", async () => {
    const person = await account();
    const plain = await encryptedRun(person, false);
    const repository = new PostgresWebEvidenceRepository(runner);
    const search = randomUUID();
    const row = { pathRef: "pos-1", side: "for" as const, languageKind: "english" as const, language: "en", country: null,
      lookBack: "12m" as const, outcome: "FOUND" as const, chargeMicros: 1000, resultCount: 1 };
    expect(await sqlError(async () => repository.recordSearch({ ...row, runId: plain, searchId: search,
      words: await sealed(plain, "identity.web_search", search) }))).toMatchObject({ code: "22023", message: "WEB_EVIDENCE_ENCRYPTION_REQUIRED" });
    const run = await encryptedRun(person);
    const words = { v: 1, query: "nurse net salary Germany 2026" };
    expect(await sqlError(async () => repository.recordSearch({ ...row, runId: run, searchId: search,
      words: await sealed(run, "identity.web_search", search, words) }))).toMatchObject({ code: "22023", message: "CONTENT_ATTESTATION_REQUIRED" });
    // Attested for another row (the envelope bound to another id) is not this row's.
    expect(await sqlError(async () => repository.recordSearch({ ...row, runId: run, searchId: search,
      words: await sealed(run, "identity.web_search", randomUUID()) }))).toMatchObject({ code: "22023", message: "CONTENT_ATTESTATION_INVALID" });
    // The page text is bound to its own carrier: an envelope attested as the page's address is refused as its text.
    expect(await repository.recordSearch({ ...row, runId: run, searchId: search, words: await sealed(run, "identity.web_search", search) })).toBe("RECORDED");
    const page = randomUUID();
    expect(await sqlError(async () => repository.recordPage({ runId: run, pageId: page, searchId: search, rank: 1, readDepth: "whole",
      about: await sealed(run, "identity.web_page", page),
      text: { chars: 10, digest: Buffer.alloc(32, 2), sealed: await sealed(run, "identity.web_page", page) } })))
      .toMatchObject({ code: "22023", message: "CONTENT_ATTESTATION_INVALID" });
    expect(Number((await database.pool.query("SELECT count(*) AS n FROM identity.web_page WHERE run_id=$1", [run])).rows[0].n)).toBe(0);
  });

  it("W4 readers 2 and 3 come from other makers; extracts, picks and packs stay within the run and the path", async () => {
    const person = await account();
    const run = await encryptedRun(person);
    const other = await encryptedRun(person);
    const repository = new PostgresWebEvidenceRepository(runner);
    const step = await webStep(repository, run);
    const otherStep = await webStep(repository, other, "pos-9");
    const reading = randomUUID();
    expect(await repository.recordReading({ runId: run, readingId: reading, pageId: step.pages[1]!, reader: 2, maker: "anthropic",
      outcome: "READ", grade: 1, line: await sealed(run, "identity.web_reading", reading) })).toBe("SAME_MAKER");
    const failed = randomUUID();
    expect(await repository.recordReading({ runId: run, readingId: failed, pageId: step.pages[1]!, reader: 2, maker: "zhipu",
      outcome: "FAILED", grade: null, line: null })).toBe("RECORDED");
    const extract = randomUUID();
    expect(await repository.recordExtract({ runId: run, extractId: extract, pageId: otherStep.pages[0]!, label: "S1-2", foundBy: [1],
      quote: await sealed(run, "identity.web_extract", extract) })).toBe("NO_PAGE");
    expect(await repository.recordExtract({ runId: run, extractId: extract, pageId: step.pages[1]!, label: "S1-1", foundBy: [1],
      quote: await sealed(run, "identity.web_extract", extract) })).toBe("LABEL_TAKEN");
    expect(await repository.recordPicks(run, "pos-2", [step.pages[0]!])).toBe("NOT_THIS_PATH");
    const pack = randomUUID();
    expect(await repository.recordPack({ runId: run, packId: pack, pathRef: "pos-2", extractLabels: ["S1-1"],
      pack: await sealed(run, "identity.web_pack", pack) })).toBe("UNKNOWN_EXTRACT");
  });

  it("W5 is append-only: no update, no delete, but of the transient page text", async () => {
    const person = await account();
    const run = await encryptedRun(person);
    const step = await webStep(new PostgresWebEvidenceRepository(runner), run);
    for (const statement of [
      "UPDATE identity.web_search SET charge_micros=0 WHERE run_id=$1", "UPDATE identity.web_page SET rank=rank WHERE run_id=$1",
      "UPDATE identity.web_reading SET grade=0 WHERE run_id=$1", "DELETE FROM identity.web_page WHERE run_id=$1",
      "DELETE FROM identity.web_extract WHERE run_id=$1", "DELETE FROM identity.web_pick WHERE run_id=$1",
      "UPDATE identity.web_page_text SET stored_at=now() WHERE run_id=$1"
    ]) {
      expect(await sqlError(() => database.pool.query(statement, [run])), statement).toMatchObject({ code: "55000", message: "WEB_EVIDENCE_APPEND_ONLY" });
    }
    expect(await sqlError(() => database.pool.query("TRUNCATE identity.web_search CASCADE"))).toMatchObject({ code: expect.any(String) });
    await database.pool.query("DELETE FROM identity.web_page_text WHERE page_id=$1", [step.pages[2]]);
    const web = (await new PostgresWebEvidenceRepository(runner).read(run))!;
    expect(web.pages.find((page) => page.page_id === step.pages[2])!.text_state).toBe("WIPED");
  });
});

describe("0132 the person's choice and who may reach it", () => {
  it("W6 the API's role adds an other page of a path to researched; the runner settles it once", async () => {
    const person = await account();
    const stranger = await account();
    const run = await encryptedRun(person);
    const step = await webStep(new PostgresWebEvidenceRepository(runner), run);
    const record = async (pool: Pool, owner: string, page: string) =>
      (await pool.query<{ o: string }>("SELECT identity.record_web_researched($1,$2,$3) AS o", [owner, run, page])).rows[0]!.o;
    expect(await record(api, person.ownerRef, step.pages[2]!)).toBe("RECORDED");
    expect(await record(api, person.ownerRef, step.pages[2]!)).toBe("ALREADY");
    expect(await record(api, person.ownerRef, step.pages[0]!)).toBe("NOT_OTHER_PAGE");
    expect(await record(api, person.ownerRef, randomUUID())).toBe("NOT_OTHER_PAGE");
    expect(await record(api, stranger.ownerRef, step.pages[2]!)).toBe("NOT_OWNED");
    const repository = new PostgresWebEvidenceRepository(runner);
    expect(await repository.settleResearched(run, step.pages[2]!, "ADDS")).toBe("SETTLED");
    expect(await repository.settleResearched(run, step.pages[2]!, "DOES_NOT_ADD")).toBe("ALREADY");
    expect(await repository.settleResearched(run, step.pages[1]!, "ADDS")).toBe("NOT_CHOSEN");
    expect((await repository.read(run))!.researched).toEqual([expect.objectContaining({ page_id: step.pages[2], path_ref: "pos-1", outcome: "ADDS" })]);
    // Only the outcome changes, once: the choice itself is never rewritten.
    expect(await sqlError(() => database.pool.query("UPDATE identity.web_researched SET path_ref='pos-9' WHERE page_id=$1", [step.pages[2]])))
      .toMatchObject({ code: "55000", message: "WEB_EVIDENCE_APPEND_ONLY" });
  });

  it("W7 no role reads a table; the runner's role cannot record a choice, delete a debate or export", async () => {
    const person = await account();
    const run = await encryptedRun(person);
    for (const table of ["identity.web_search", "identity.web_page", "identity.web_page_text", "identity.web_reading",
      "identity.web_extract", "identity.web_pick", "identity.web_pack", "identity.web_researched"]) {
      for (const pool of [runner, api, erasure, worker]) {
        expect(await sqlError(() => pool.query(`SELECT count(*) FROM ${table}`)), table).toMatchObject({ code: "42501" });
      }
    }
    for (const [statement, values] of [["SELECT identity.record_web_researched($1,$2,$2)", [person.ownerRef, run]],
      ["SELECT identity.forget_erased_debate_web_evidence($1)", [run]], ["SELECT identity.read_data_export_web_evidence($1,$1)", [run]],
      ["SELECT identity.web_evidence_run_owner($1)", [run]]] as const) {
      expect(await sqlError(() => runner.query(statement, [...values])), statement).toMatchObject({ code: "42501" });
    }
    expect(await sqlError(() => erasure.query("SELECT identity.read_web_evidence($1)", [run]))).toMatchObject({ code: "42501" });
    expect(await sqlError(() => worker.query("SELECT identity.read_web_evidence($1)", [run]))).toMatchObject({ code: "42501" });
  });
});

describe("0132 deleting", () => {
  it("W8 (R22 item 16) the erasure role deletes one erased debate's web evidence, and nothing of another's; writes then find it gone", async () => {
    const person = await account();
    const run = await encryptedRun(person);
    const kept = await encryptedRun(person);
    const repository = new PostgresWebEvidenceRepository(runner);
    const step = await webStep(repository, run);
    await webStep(repository, kept);
    expect((await api.query("SELECT identity.record_web_researched($1,$2,$3) AS o", [person.ownerRef, run, step.pages[2]])).rows[0].o).toBe("RECORDED");
    expect(await sqlError(() => erasure.query("SELECT identity.forget_erased_debate_web_evidence($1)", [run])))
      .toMatchObject({ code: "55000", message: "WEB_EVIDENCE_DEBATE_NOT_ERASED" });
    const before = await rowsOf(run);
    expect(before).toBe(1 + 3 + 3 + 4 + 1 + 2 + 1 + 1);
    await seedTombstone(run);
    expect((await erasure.query<{ n: number }>("SELECT identity.forget_erased_debate_web_evidence($1) AS n", [run])).rows[0]!.n).toBe(before);
    expect(await rowsOf(run)).toBe(0);
    expect(await rowsOf(kept)).toBe(15);
    expect((await erasure.query<{ n: number }>("SELECT identity.forget_erased_debate_web_evidence($1) AS n", [run])).rows[0]!.n).toBe(0);
    expect(await repository.read(run)).toBeNull();
    const search = randomUUID();
    expect(await repository.recordSearch({ runId: run, searchId: search, pathRef: "pos-1", side: "for", languageKind: "english",
      language: "en", country: null, lookBack: "12m", outcome: "EMPTY", chargeMicros: 1000, resultCount: 0,
      words: await sealed(run, "identity.web_search", search) })).toBe("NOT_LIVE");
  });

  it("W9 deleting the account (erasure's last step) removes every row of its debates' web steps", async () => {
    const person = await account();
    const keeper = await account();
    const run = await encryptedRun(person);
    const kept = await encryptedRun(keeper);
    const repository = new PostgresWebEvidenceRepository(runner);
    await webStep(repository, run);
    await webStep(repository, kept);
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [person.userId]);
    expect(await rowsOf(run)).toBe(0);
    expect(await rowsOf(kept)).toBe(15);
  });

  it("W10 the export worker reads the account's web evidence behind its lease, without the page texts", async () => {
    const person = await account();
    const run = await encryptedRun(person);
    const step = await webStep(new PostgresWebEvidenceRepository(runner), run);
    const exportId = randomUUID();
    const lease = randomUUID();
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, person.userId, randomUUID(), lease]);
    const exported = (await worker.query<{ e: { run_id: string; web: { pages: { page_id: string }[] } }[] }>(
      "SELECT identity.read_data_export_web_evidence($1,$2) AS e", [exportId, lease])).rows[0]!.e;
    expect(exported.map((entry) => entry.run_id)).toEqual([run]);
    expect(exported[0]!.web.pages.map((page) => page.page_id).sort()).toEqual([...step.pages].sort());
    expect(await sqlError(() => worker.query("SELECT identity.read_data_export_web_evidence($1,$2)", [exportId, randomUUID()])))
      .toMatchObject({ code: "P0001", message: "DATA_EXPORT_LEASE_INVALID" });
  });
});
