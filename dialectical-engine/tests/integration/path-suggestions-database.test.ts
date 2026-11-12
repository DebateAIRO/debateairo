import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PATH_SUGGESTIONS_CARRIER, PostgresPathSuggestionsRepository, type Pool, type WebSealed } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0141 on real PostgreSQL (plan 2026-10-31-r22-owner-changes decision 9): a path's suggestions written once per set, the newest of a path
 * winning, deleted with either the debate that holds them or the run that sealed them, read by the export worker, and no request role
 * reading the table. Data is made up.
 */
let database: TestDatabase;
let runner: Pool;
let billing: Pool;
let erasure: Pool;
let worker: Pool;
let authorization: Pool;
let replay: Pool;
let repository: PostgresPathSuggestionsRepository;
let sequence = 9_800_000;
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
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `suggestions-${userId}`]);
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
async function sealed(runId: string, setId: string, carrier: string = PATH_SUGGESTIONS_CARRIER): Promise<WebSealed> {
  const attestation = (await database.pool.query<{ value: Buffer }>(`SELECT audit_crypto_internal.hmac(
      core.content_envelope_attestation_bytes($1,$2,$3,'content_ciphertext',$4::jsonb),$5::bytea,'sha256') AS value`,
    [runId, carrier, setId, JSON.stringify(ENVELOPE), SECRET])).rows[0]!.value;
  return { envelope: ENVELOPE as never, attestation };
}
/** Writes one set; its id comes back. */
async function write(runId: string, debateRunId: string, positionRef: string): Promise<string> {
  const setId = randomUUID();
  expect(await repository.record({ setId, runId, debateRunId, positionRef, sealed: await sealed(runId, setId) })).toBe("RECORDED");
  return setId;
}
async function tombstone(runId: string): Promise<void> {
  await seeded([[`INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count)
    VALUES ($1,clock_timestamp(),1,0)`, [runId]]]);
}
const rowCount = async (where: string, value: string): Promise<number> =>
  Number((await database.pool.query<{ n: string }>(`SELECT count(*) AS n FROM identity.path_suggestions WHERE ${where}=$1`, [value])).rows[0]!.n);
const forget = async (runId: string): Promise<number> =>
  (await erasure.query<{ rows: number }>("SELECT identity.forget_erased_debate_path_suggestions($1) AS rows", [runId])).rows[0]!.rows;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  // The runner's login holds the cross-account marker, as runner-runtime does: since 0171 (F5) the suggestions' writer is the marker's.
  for (const [login, role] of [["ps_runner", "debateai_runtime,debateai_rls_all_accounts"], ["ps_billing", "debateai_billing_runtime"], ["ps_erasure", "debateai_erasure_runtime"],
    ["ps_worker", "debateai_data_export_worker"], ["ps_authorization", "debateai_authorization_runtime"], ["ps_replay", "debateai_replay"]] as const) {
    await database.pool.query(`CREATE ROLE ${login} LOGIN PASSWORD '${login}-test-only' IN ROLE ${role}`);
  }
  runner = loginPool("ps_runner", "ps_runner-test-only");
  billing = loginPool("ps_billing", "ps_billing-test-only");
  erasure = loginPool("ps_erasure", "ps_erasure-test-only");
  worker = loginPool("ps_worker", "ps_worker-test-only");
  authorization = loginPool("ps_authorization", "ps_authorization-test-only");
  replay = loginPool("ps_replay", "ps_replay-test-only");
  repository = new PostgresPathSuggestionsRepository(runner);
}, 600_000);
afterAll(async () => {
  await Promise.all([runner?.end(), billing?.end(), erasure?.end(), worker?.end(), authorization?.end(), replay?.end()]);
  await database?.stop();
});

describe("0141: recording and reading", () => {
  it("records a set, reads it back, and a debate with none reads an empty list", async () => {
    const ana = await account();
    const debate = await run(ana);
    expect(await repository.readOfRun(debate)).toEqual([]);
    const setId = await write(debate, debate, "pos-1");
    expect(await repository.readOfRun(debate)).toEqual([
      { set_id: setId, run_id: debate, position_ref: "pos-1", recorded_at: expect.any(String), content: ENVELOPE }]);
    const row = (await database.pool.query<{ owner_ref: string; debate_run_id: string }>(
      "SELECT owner_ref,debate_run_id FROM identity.path_suggestions WHERE set_id=$1", [setId])).rows[0]!;
    expect(row).toEqual({ owner_ref: ana.ownerRef, debate_run_id: debate });
  });

  it("a second copy of the same set writes ALREADY, and the first row stays", async () => {
    const ana = await account();
    const debate = await run(ana);
    const setId = await write(debate, debate, "pos-1");
    const before = await repository.readOfRun(debate);
    expect(await repository.record({ setId, runId: debate, debateRunId: debate, positionRef: "pos-1", sealed: await sealed(debate, setId) })).toBe("ALREADY");
    expect(await repository.readOfRun(debate)).toEqual(before);
    expect(await rowCount("debate_run_id", debate)).toBe(1);
  });

  it("the newest set per path wins, in path order, a dig's refresh under the dig's own run", async () => {
    const ana = await account();
    const debate = await run(ana);
    const dig = await run(ana);
    await write(debate, debate, "pos-2");
    const otherPath = await write(debate, debate, "pos-1");
    await write(debate, debate, "pos-2");
    const refresh = await write(dig, debate, "pos-2");
    expect((await repository.readOfRun(debate))!.map(({ set_id, run_id, position_ref }) => ({ set_id, run_id, position_ref }))).toEqual([
      { set_id: otherPath, run_id: debate, position_ref: "pos-1" },
      { set_id: refresh, run_id: dig, position_ref: "pos-2" }]);
    // A dig's own map holds nothing: the row belongs to the debate whose map holds the path.
    expect(await repository.readOfRun(dig)).toEqual([]);
    expect(await rowCount("debate_run_id", debate)).toBe(4);
  });

  it("NOT_LIVE when the sealing run or the debate is not live, and the reader answers null", async () => {
    const ana = await account();
    const [debate, dig, erased] = [await run(ana), await run(ana), await run(ana)];
    await tombstone(erased);
    const setId = randomUUID();
    expect(await repository.record({ setId, runId: erased, debateRunId: erased, positionRef: "pos-1", sealed: await sealed(erased, setId) })).toBe("NOT_LIVE");
    expect(await repository.record({ setId, runId: erased, debateRunId: debate, positionRef: "pos-1", sealed: await sealed(erased, setId) })).toBe("NOT_LIVE");
    expect(await repository.record({ setId, runId: dig, debateRunId: erased, positionRef: "pos-1", sealed: await sealed(dig, setId) })).toBe("NOT_LIVE");
    const unknown = randomUUID();
    expect(await repository.record({ setId, runId: unknown, debateRunId: unknown, positionRef: "pos-1", sealed: await sealed(dig, setId) })).toBe("NOT_LIVE");
    expect(await repository.readOfRun(erased)).toBeNull();
    expect(await repository.readOfRun(unknown)).toBeNull();
    expect(await rowCount("set_id", setId)).toBe(0);
  });

  it("refuses a bad path and an envelope bound to another run, set or table", async () => {
    const ana = await account();
    const debate = await run(ana);
    const other = await run(ana);
    const setId = randomUUID();
    const input = { setId, runId: debate, debateRunId: debate, positionRef: "pos-1", sealed: await sealed(debate, setId) };
    for (const positionRef of ["", "with space", "with\"quote", "x".repeat(151)]) {
      expect((await sqlError(() => repository.record({ ...input, positionRef }))).message, positionRef).toBe("PATH_SUGGESTIONS_INVALID");
    }
    for (const bound of [await sealed(other, setId), await sealed(debate, randomUUID()), await sealed(debate, setId, "identity.path_update")]) {
      expect((await sqlError(() => repository.record({ ...input, sealed: { ...input.sealed, attestation: bound.attestation } }))).message).toBe("CONTENT_ATTESTATION_INVALID");
    }
    // Text in clear is not an envelope.
    expect((await sqlError(() => runner.query("SELECT identity.record_path_suggestions($1,$2,$3,'pos-1',$4::jsonb,$5)",
      [setId, debate, debate, JSON.stringify({ text: "A suggestion in clear" }), input.sealed.attestation]))).message).toBe("CONTENT_ATTESTATION_REQUIRED");
    expect(await rowCount("debate_run_id", debate)).toBe(0);
  });

  it("is append-only: no UPDATE, no DELETE, no TRUNCATE, even for the table's owner", async () => {
    const ana = await account();
    const debate = await run(ana);
    const setId = await write(debate, debate, "pos-1");
    expect((await sqlError(() => database.pool.query("UPDATE identity.path_suggestions SET position_ref='pos-2' WHERE set_id=$1", [setId]))).message).toBe("PATH_SUGGESTIONS_APPEND_ONLY");
    expect((await sqlError(() => database.pool.query("DELETE FROM identity.path_suggestions WHERE set_id=$1", [setId]))).message).toBe("PATH_SUGGESTIONS_APPEND_ONLY");
    expect((await sqlError(() => database.pool.query("TRUNCATE identity.path_suggestions"))).code).toBeDefined();
    expect(await rowCount("set_id", setId)).toBe(1);
  });
});

describe("0141: deleting", () => {
  it("refuses a debate that is not erased", async () => {
    const debate = await run(await account());
    expect((await sqlError(() => forget(debate))).message).toBe("PATH_SUGGESTIONS_DEBATE_NOT_ERASED");
  });

  it("an erased dig takes what it sealed, and the path falls back to the set before", async () => {
    const ana = await account();
    const [debate, dig] = [await run(ana), await run(ana)];
    const first = await write(debate, debate, "pos-1");
    const refresh = await write(dig, debate, "pos-1");
    expect((await repository.readOfRun(debate))![0]!.set_id).toBe(refresh);
    await tombstone(dig);
    expect(await forget(dig)).toBe(1);
    expect(await rowCount("set_id", refresh)).toBe(0);
    expect((await repository.readOfRun(debate))!.map((row) => row.set_id)).toEqual([first]);
    expect(await forget(dig)).toBe(0);
  });

  it("an erased debate takes every set on its paths, those a dig sealed too, and nobody else's", async () => {
    const ana = await account();
    const [debate, dig, stranger] = [await run(ana), await run(ana), await run(ana)];
    await write(debate, debate, "pos-1");
    await write(dig, debate, "pos-1");
    const kept = await write(stranger, stranger, "pos-1");
    await tombstone(debate);
    expect(await forget(debate)).toBe(2);
    expect(await rowCount("debate_run_id", debate)).toBe(0);
    expect(await rowCount("run_id", dig)).toBe(0);
    expect(await rowCount("set_id", kept)).toBe(1);
  });

  it("a dig's own paths: the dig seals the set and its own map holds it; a second copy writes ALREADY; erasing the dig takes it", async () => {
    const ana = await account();
    const [debate, dig] = [await run(ana), await run(ana)];
    const setId = await write(dig, dig, "b1");
    expect((await repository.readOfRun(dig))!.map(({ set_id, run_id, position_ref }) => ({ set_id, run_id, position_ref }))).toEqual([
      { set_id: setId, run_id: dig, position_ref: "b1" }]);
    expect(await repository.readOfRun(debate)).toEqual([]);
    expect(await repository.record({ setId, runId: dig, debateRunId: dig, positionRef: "b1", sealed: await sealed(dig, setId) })).toBe("ALREADY");
    // The debate it was dug from holds none of it: erasing that debate alone leaves the dig's own map as it is (0141's rule).
    await tombstone(debate);
    expect(await forget(debate)).toBe(0);
    expect(await rowCount("set_id", setId)).toBe(1);
    await tombstone(dig);
    expect(await forget(dig)).toBe(1);
    expect(await rowCount("set_id", setId)).toBe(0);
  });

  it("deleting the account takes its rows", async () => {
    const ana = await account();
    const debate = await run(ana);
    await write(debate, debate, "pos-1");
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [ana.userId]);
    expect(await rowCount("debate_run_id", debate)).toBe(0);
  });
});

describe("0141: the export and the roles", () => {
  it("the export worker reads the leased account's rows, envelopes included, and no one else's", async () => {
    const [ana, dan] = [await account(), await account()];
    const [debate, dig, others] = [await run(ana), await run(ana), await run(dan)];
    const first = await write(debate, debate, "pos-1");
    const second = await write(dig, debate, "pos-1");
    await write(others, others, "pos-1");
    const [exportId, workerId] = [randomUUID(), randomUUID()];
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, ana.userId, randomUUID(), workerId]);
    const value = (await worker.query<{ value: Record<string, unknown> }>("SELECT identity.read_data_export_path_suggestions($1,$2) AS value", [exportId, workerId])).rows[0]!.value;
    expect(value).toEqual({ path_suggestions: [
      { set_id: first, run_id: debate, debate_run_id: debate, position_ref: "pos-1", recorded_at: expect.any(String), content: ENVELOPE },
      { set_id: second, run_id: dig, debate_run_id: debate, position_ref: "pos-1", recorded_at: expect.any(String), content: ENVELOPE }] });
    // Only under a live lease.
    expect((await sqlError(() => worker.query("SELECT identity.read_data_export_path_suggestions($1,$2)", [randomUUID(), workerId]))).code).toBeDefined();
  });

  it("no request role can SELECT the table, and each function has its one role (with the roles that inherit it)", async () => {
    for (const pool of [runner, billing, erasure, worker, authorization, replay]) {
      expect((await sqlError(() => pool.query("SELECT * FROM identity.path_suggestions"))).code).toBe("42501");
    }
    const debate = randomUUID();
    // The API's two roles inherit debateai_runtime (0039, 0093), as they do for 0134's reader. The writer is the runner's alone: since 0171 (F5) it
    // is the cross-account marker's, which the API's request logins do not hold.
    const allowed = new Map<Pool, string>([[runner, "RUNNER"], [billing, "RUNTIME"], [authorization, "RUNTIME"], [erasure, "ERASURE"], [worker, "WORKER"], [replay, ""]]);
    for (const [pool, kind] of allowed) {
      const denied = async (sql: string, values: readonly unknown[]) => (await sqlError(() => pool.query(sql, [...values]))).code === "42501";
      expect(await denied("SELECT identity.read_path_suggestions_of_run($1)", [debate]), kind).toBe(kind !== "RUNTIME" && kind !== "RUNNER");
      expect(await denied("SELECT identity.record_path_suggestions($1,$1,$1,'pos-1','{}'::jsonb,'\\x00'::bytea)", [debate]), kind).toBe(kind !== "RUNNER");
      expect(await denied("SELECT identity.forget_erased_debate_path_suggestions($1)", [debate]), kind).toBe(kind !== "ERASURE");
      expect(await denied("SELECT identity.read_data_export_path_suggestions($1,$1)", [debate]), kind).toBe(kind !== "WORKER");
    }
  });
});
