import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPool,
  migrate,
  PostgresDigModelRepository,
  PostgresDigModelRunnerRepository,
  PostgresInvestigationRepository,
  PostgresInvestigationRunnerRepository,
  PostgresWebEvidenceRepository,
  type PathRewriteRecord,
  type PathRewritesRead,
  type Pool,
  type WebSealed
} from "@debateai/db";
import { loadMigrationPlan } from "../../packages/db/src/migration-lineage.js";
import { asRequestOf, seedLiveSession } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0134 on real PostgreSQL (dig-model revision 2026-10-30, task W2-8, and its money rule of 31 Oct): the dig level (1-10
 * join, 11 is TOO_DEEP with nothing written, two joins at once never pass 10, the fill-in of 0133's members), the path
 * rewrite (a settled dig's turn, the rewrite written at the front of its path's line on the path's current text,
 * encrypted under the dig's key, read only by the owner; erasing the dig removes its rewrite and the path falls back),
 * the search planner's decision for each path (written once, its reason sealed), the month pause (PAUSED, Continue),
 * the spend source PATH_REWRITE, and the deletions and the export. Data is made up. Since the security review's 0171 (F5) the API's role
 * runs here as each person's own request (its login carrying their live session), as its functions believe no other owner; 0134's owner
 * readers of every level, of the rewrites and of the paused debates had no caller and are no role's any more, so they are read here as the
 * migrator, as is 0133's first join.
 */
let database: TestDatabase;
let api: Pool;
/** The API's role wired as main.ts wires its request pool: inside a request its own connections carry the person's session. */
let requests: Pool;
let apiUrl: string;
let runner: Pool;
let erasure: Pool;
let worker: Pool;
let sequence = 9_300_000;
const SECRET = Buffer.alloc(32, 7);
const ENVELOPE = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" };
const LINEAGE = Object.freeze({ maker: "anthropic", model: "fixture-writer" });

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
type Account = Readonly<{ userId: string; ownerRef: string; token: string }>;
async function account(): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `dig-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef, token: await seedLiveSession(database.pool, userId) };
}
/** The person's own request, on the API's role. */
const asking = (person: Account): Pool => asRequestOf(requests, person.token);
/** 0134's owner reader of an investigation's levels, as the migrator (no role's since 0171). */
const readDigLevels = async (ownerRef: string, runId: string): Promise<ReadonlyArray<{ dig_level: number }> | null> =>
  (await database.pool.query("SELECT identity.read_investigation_dig_levels($1,$2) AS levels", [ownerRef, runId])).rows[0]?.levels ?? null;
/** 0134's owner reader of a debate's path rewrites, as the migrator (no role's since 0171). */
const readPathRewrites = async (ownerRef: string, runId: string): Promise<PathRewritesRead | null> =>
  (await database.pool.query("SELECT identity.read_path_rewrites($1,$2) AS rewrites", [ownerRef, runId])).rows[0]?.rewrites ?? null;
/** 0134's owner reader of the account's paused debates, as the migrator (no role's since 0171). */
const readPausedRuns = async (ownerRef: string): Promise<ReadonlyArray<{ run_id: string }>> =>
  (await database.pool.query("SELECT identity.read_paused_runs($1) AS paused", [ownerRef])).rows[0]!.paused;
/** A private debate with content encryption and its attestation secret. */
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
async function sealed(runId: string, ref: string, envelope: object = ENVELOPE, carrier = "identity.path_rewrite"): Promise<WebSealed> {
  const attestation = (await database.pool.query<{ value: Buffer }>(`SELECT audit_crypto_internal.hmac(
      core.content_envelope_attestation_bytes($1,$5,$2,'content_ciphertext',$3::jsonb),$4::bytea,'sha256') AS value`,
    [runId, ref, JSON.stringify(envelope), SECRET, carrier])).rows[0]!.value;
  return { envelope: envelope as never, attestation };
}
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
/** A chain of `depth` digs under a new first debate: [root, level 1, …, level depth]. */
async function chain(owner: Account, depth: number): Promise<string[]> {
  const investigations = new PostgresInvestigationRepository(asking(owner));
  const runs = [await run(owner)];
  for (let level = 1; level <= depth; level += 1) {
    const child = await run(owner);
    expect(await investigations.join({ ownerRef: owner.ownerRef, parentRunId: runs.at(-1)!, childRunId: child,
      places: ["path:p1"], mode: "quick" })).toMatchObject({ outcome: "JOINED", digLevel: level });
    runs.push(child);
  }
  return runs;
}
async function ready(dig: string, basedOn: string | null, extra: Partial<PathRewriteRecord> = {}): Promise<PathRewriteRecord> {
  const rewriteId = extra.rewriteId ?? randomUUID();
  return { rewriteId, digRunId: dig, parentAnswerVersion: 1, basedOnRewriteId: basedOn, outcome: "READY", failureCode: null,
    fateBefore: "HELD_UP", fateAfter: "PARTLY_HELD", verdict: { outcome: "HELPED", scope: "PATH" }, writerLineage: LINEAGE,
    checkerLineage: { maker: "zhipu", model: "fixture-checker" }, rounds: 1, artifactRefs: [randomUUID()],
    content: await sealed(dig, rewriteId), ...extra };
}
const levelRows = async (owner: string): Promise<number> =>
  Number((await database.pool.query("SELECT count(*) AS n FROM identity.investigation_dig_level WHERE owner_ref=$1", [owner])).rows[0].n);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE dig_api LOGIN PASSWORD 'dig-api-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  // The runner's login holds the cross-account marker, as runner-runtime does: since 0171 (F5) the runner's own steps of a debate are the marker's.
  await database.pool.query("CREATE ROLE dig_runner LOGIN PASSWORD 'dig-runner-test-only' IN ROLE debateai_runtime,debateai_rls_all_accounts");
  await database.pool.query("CREATE ROLE dig_erasure LOGIN PASSWORD 'dig-erasure-test-only' IN ROLE debateai_erasure_runtime");
  await database.pool.query("CREATE ROLE dig_worker LOGIN PASSWORD 'dig-worker-test-only' IN ROLE debateai_data_export_worker");
  api = loginPool("dig_api", "dig-api-test-only");
  runner = loginPool("dig_runner", "dig-runner-test-only");
  erasure = loginPool("dig_erasure", "dig-erasure-test-only");
  worker = loginPool("dig_worker", "dig-worker-test-only");
  expect((await api.query("SELECT current_user AS name")).rows[0].name).toBe("dig_api");
  const url = new URL(database.connectionString);
  url.username = "dig_api";
  url.password = "dig-api-test-only";
  apiUrl = url.toString();
  requests = createPool(apiUrl, { crossAccount: api });
}, 300_000);

afterAll(async () => {
  await Promise.all([api?.end(), runner?.end(), erasure?.end(), worker?.end(), requests?.end()]);
  await database?.stop();
});

describe("0134 the dig level", () => {
  it("L1 levels 1 to 10 join; an eleventh is TOO_DEEP and writes nothing; the levels read back", async () => {
    const person = await account();
    const runs = await chain(person, 10);
    const levels = new PostgresDigModelRepository(asking(person));
    expect(await levels.readDigLevel(person.ownerRef, runs[0]!)).toBe(0);
    expect(await levels.readDigLevel(person.ownerRef, runs[10]!)).toBe(10);
    expect(await new PostgresDigModelRunnerRepository(runner).readDigLevel(runs[7]!)).toBe(7);
    expect((await readDigLevels(person.ownerRef, runs[3]!))!.map((row) => row.dig_level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const tooDeep = await run(person);
    const investigations = new PostgresInvestigationRepository(asking(person));
    expect(await investigations.join({ ownerRef: person.ownerRef, parentRunId: runs[10]!, childRunId: tooDeep, places: [], mode: "quick" }))
      .toMatchObject({ outcome: "TOO_DEEP", digLevel: null });
    expect(await new PostgresInvestigationRunnerRepository(runner).ofRun(tooDeep)).toBeNull();
    expect((await database.pool.query("SELECT count(*)::int n FROM identity.dig_link WHERE child_run_id=$1", [tooDeep])).rows[0].n).toBe(0);
    // A sibling at level 10 still joins; the same dig again is ALREADY with its level.
    const sibling = await run(person);
    expect(await investigations.join({ ownerRef: person.ownerRef, parentRunId: runs[9]!, childRunId: sibling, places: [], mode: "thorough" }))
      .toMatchObject({ outcome: "JOINED", digLevel: 10 });
    expect(await investigations.join({ ownerRef: person.ownerRef, parentRunId: runs[9]!, childRunId: sibling, places: [], mode: "thorough" }))
      .toMatchObject({ outcome: "ALREADY", digLevel: 10 });
    expect(await levelRows(person.ownerRef)).toBe(11);
    // Not this account's: no level.
    const stranger = await account();
    expect(await new PostgresDigModelRepository(asking(stranger)).readDigLevel(stranger.ownerRef, runs[2]!)).toBeNull();
    expect(await readDigLevels(stranger.ownerRef, runs[2]!)).toBeNull();
    // 0171 (F5): the person's request names no one else, and with no session the API's role names no one.
    expect(await levels.readDigLevel(stranger.ownerRef, runs[2]!)).toBeNull();
    expect(await new PostgresDigModelRepository(api).readDigLevel(person.ownerRef, runs[2]!)).toBeNull();
    // The level table holds 1..10 only, whoever writes.
    expect(await sqlError(() => database.pool.query("INSERT INTO identity.investigation_dig_level (run_id, owner_ref, dig_level) VALUES ($1,$2,11)",
      [tooDeep, person.ownerRef]))).toMatchObject({ code: "23514" });
  }, 120_000);

  it("L2 two joins at once never pass 10", async () => {
    const person = await account();
    const runs = await chain(person, 9);
    const tenth = await run(person);
    const eleventh = await run(person);
    const leftPool = createPool(apiUrl, { crossAccount: api });
    const rightPool = createPool(apiUrl, { crossAccount: api });
    const left = new PostgresInvestigationRepository(asRequestOf(leftPool, person.token));
    const right = new PostgresInvestigationRepository(asRequestOf(rightPool, person.token));
    try {
      const outcomes = await Promise.all([
        left.join({ ownerRef: person.ownerRef, parentRunId: runs[9]!, childRunId: tenth, places: [], mode: "quick" }),
        right.join({ ownerRef: person.ownerRef, parentRunId: tenth, childRunId: eleventh, places: [], mode: "quick" })
      ]);
      // Either the tenth joined first (the eleventh is TOO_DEEP) or the eleventh made the tenth a root of its own (the
      // tenth then conflicts): never a dig at 11.
      expect([["JOINED", "TOO_DEEP"], ["CONFLICT", "JOINED"]]).toContainEqual(outcomes.map((outcome) => outcome.outcome));
      expect(Number((await database.pool.query("SELECT max(dig_level) AS m FROM identity.investigation_dig_level WHERE owner_ref=$1",
        [person.ownerRef])).rows[0].m)).toBeLessThanOrEqual(10);
    } finally {
      await Promise.all([leftPool.end(), rightPool.end()]);
    }
  }, 120_000);

  it("L3 the fill-in: 0133's join wrote digs without levels; their levels are walked, and 0134's fill writes them", async () => {
    const person = await account();
    const root = await run(person);
    const one = await run(person);
    const two = await run(person);
    // 0133's join, as the release before called it (no code calls it any more, and since 0171 no role may: the migrator calls it here).
    await database.pool.query("SELECT * FROM identity.join_investigation($1,$2,$3,'{}'::text[],'quick')", [person.ownerRef, root, one]);
    await database.pool.query("SELECT * FROM identity.join_investigation($1,$2,$3,'{}'::text[],'quick')", [person.ownerRef, one, two]);
    expect(await levelRows(person.ownerRef)).toBe(0);
    const levels = new PostgresDigModelRepository(asking(person));
    expect(await levels.readDigLevel(person.ownerRef, two)).toBe(2);
    // A dig of a dig with no level row joins at the walked level + 1.
    const three = await run(person);
    expect(await new PostgresInvestigationRepository(asking(person)).join({ ownerRef: person.ownerRef, parentRunId: two, childRunId: three,
      places: [], mode: "quick" })).toMatchObject({ outcome: "JOINED", digLevel: 3 });
    // 0134 replayed over the finished chain (its fill-in is ON CONFLICT DO NOTHING) writes the missing rows. The replay also puts back 0134's own
    // bodies of the functions a later step redefined in place and declared as an amendment of 0134 (0171, the security review: the guard and the forget
    // definer ask their scope, not a setting; the pause's reader and Continue ask the session's owner), and 0134's grants on the owner readers 0171
    // took back and on the runner's own steps it moved to the cross-account marker. The chain then refuses the database until they are that step's
    // again, so a replay cannot quietly undo it.
    const amended = (await loadMigrationPlan()).forwardChain.flatMap((step) => step.amendsPostconditionsOf ?? [])
      .flatMap((amendment) => amendment.step === "0134_dig_model_and_month_pause.sql" && amendment.field === "function_definition" ? amendment.functions : []);
    expect(amended.length).toBeGreaterThan(0);
    const grantees = async () => new Map((await database.pool.query<{ signature: string; grantees: string[] }>(`SELECT signature,
        ARRAY(SELECT DISTINCT CASE WHEN acl.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(acl.grantee)) END
          FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl WHERE acl.grantee <> p.proowner) AS grantees
      FROM unnest($1::text[]) AS signature JOIN pg_proc AS p ON p.oid = signature::regprocedure`, [amended])).rows
      .map((row) => [row.signature, row.grantees] as const));
    const current = (await database.pool.query<{ definition: string }>(
      "SELECT pg_get_functiondef(signature::regprocedure) AS definition FROM unnest($1::text[]) AS signature", [amended])).rows;
    const granted = await grantees();
    await database.pool.query(await readFile(new URL("../../migrations/0134_dig_model_and_month_pause.sql", import.meta.url), "utf8"));
    await expect(migrate(database.pool)).rejects.toThrow("MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT 0134_dig_model_and_month_pause.sql");
    for (const { definition } of current) await database.pool.query(definition);
    expect([...(await grantees())].some(([signature, now]) => now.some((grantee) => !granted.get(signature)!.includes(grantee)))).toBe(true);
    await expect(migrate(database.pool)).rejects.toThrow("MIGRATION_FORWARD_CHAIN_POSTCONDITION_DRIFT 0134_dig_model_and_month_pause.sql");
    for (const [signature, now] of await grantees()) {
      const regranted = now.filter((grantee) => !granted.get(signature)!.includes(grantee));
      if (regranted.length > 0) await database.pool.query(`REVOKE ALL ON FUNCTION ${signature} FROM ${regranted.join(",")}`);
    }
    await expect(migrate(database.pool)).resolves.toEqual({ appliedSteps: [], extraSteps: [] });
    expect((await database.pool.query("SELECT run_id, dig_level FROM identity.investigation_dig_level WHERE owner_ref=$1 ORDER BY dig_level",
      [person.ownerRef])).rows).toEqual([{ run_id: one, dig_level: 1 }, { run_id: two, dig_level: 2 }, { run_id: three, dig_level: 3 }]);
  }, 180_000);
});

describe("0134 the path rewrite", () => {
  it("P1 a settled dig takes its path's turn, writes its rewrite at the front, and only the owner reads it", async () => {
    const person = await account();
    const [root, dig] = await chain(person, 1);
    const rewrites = new PostgresDigModelRunnerRepository(runner);
    expect(await rewrites.readRewriteTurn(dig!)).toBeNull();
    expect(await rewrites.takeRewriteTurn(dig!, root!, "a1")).toEqual({ outcome: "TAKEN", pathSeq: 1 });
    expect(await rewrites.takeRewriteTurn(dig!, root!, "a1")).toEqual({ outcome: "ALREADY", pathSeq: 1 });
    expect(await rewrites.takeRewriteTurn(dig!, root!, "a2")).toEqual({ outcome: "CONFLICT", pathSeq: null });
    expect(await rewrites.readRewriteTurn(dig!)).toEqual({ parent_run_id: root, position_ref: "a1", path_seq: 1, state: "FRONT",
      waiting_for: 0, base_rewrite_id: null });
    // While it writes, the parent's page sees the path WRITING.
    expect((await readPathRewrites(person.ownerRef, root!))!.paths).toEqual([expect.objectContaining({ run_id: dig,
      position_ref: "a1", path_seq: 1, state: "WRITING", rewrite_id: null, content: null })]);
    const record = await ready(dig!, null);
    expect(await rewrites.recordRewrite(record)).toBe("RECORDED");
    expect(await rewrites.recordRewrite({ ...record, rewriteId: randomUUID() })).toBe("ALREADY");
    expect((await rewrites.readRewriteTurn(dig!))!.state).toBe("DONE");
    const read = (await readPathRewrites(person.ownerRef, root!))!;
    expect(read.paths).toEqual([expect.objectContaining({ run_id: dig, state: "READY", rewrite_id: record.rewriteId,
      fate_before: "HELD_UP", fate_after: "PARTLY_HELD", verdict_outcome: "HELPED", verdict_scope: "PATH", rounds: 1,
      content: ENVELOPE })]);
    expect(read.own).toBeNull();
    // The dig's own page: what it dug and its rewrite's state.
    expect((await readPathRewrites(person.ownerRef, dig!))!.own).toMatchObject({ parent_run_id: root, position_ref: "a1", state: "READY" });
    expect((await rewrites.readPathRewrites(root!))!.paths).toHaveLength(1);
    const stranger = await account();
    expect(await readPathRewrites(stranger.ownerRef, root!)).toBeNull();
    // A debate that is not a dig of that parent takes no turn on it.
    const unrelated = await run(person);
    expect(await rewrites.takeRewriteTurn(unrelated, root!, "a1")).toEqual({ outcome: "NOT_A_DIG", pathSeq: null });
    expect(await rewrites.recordRewrite(await ready(unrelated, null))).toBe("NO_TURN");
  });

  it("P2 two digs of one path rewrite it one after another, each on the text the one before left", async () => {
    const person = await account();
    const investigations = new PostgresInvestigationRepository(asking(person));
    const root = await run(person);
    const first = await run(person);
    const second = await run(person);
    const third = await run(person);
    for (const dig of [first, second, third]) {
      await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: dig, places: ["path:a1"], mode: "quick" });
    }
    const rewrites = new PostgresDigModelRunnerRepository(runner);
    expect(await rewrites.takeRewriteTurn(first, root, "a1")).toEqual({ outcome: "TAKEN", pathSeq: 1 });
    expect(await rewrites.takeRewriteTurn(second, root, "a1")).toEqual({ outcome: "TAKEN", pathSeq: 2 });
    expect(await rewrites.takeRewriteTurn(third, root, "a1")).toEqual({ outcome: "TAKEN", pathSeq: 3 });
    expect(await rewrites.readRewriteTurn(second)).toMatchObject({ state: "WAITING", waiting_for: 1 });
    expect(await rewrites.recordRewrite(await ready(second, null))).toBe("WAIT_TURN");
    // The first fails: the path keeps its text, so the second writes on the story's line (no base).
    const failedId = randomUUID();
    expect(await rewrites.recordRewrite({ ...(await ready(first, null)), rewriteId: failedId, outcome: "FAILED",
      failureCode: "REWRITE_ALL_WRITERS_FAILED", fateAfter: null, verdict: null, content: null, rounds: 2 })).toBe("RECORDED");
    expect(await rewrites.readRewriteTurn(second)).toMatchObject({ state: "FRONT", base_rewrite_id: null });
    const secondRecord = await ready(second, null);
    expect(await rewrites.recordRewrite(secondRecord)).toBe("RECORDED");
    // The third must write on the second's rewrite.
    expect(await rewrites.recordRewrite(await ready(third, null))).toBe("BASE_MOVED");
    expect(await rewrites.readRewriteTurn(third)).toMatchObject({ state: "FRONT", base_rewrite_id: secondRecord.rewriteId });
    const thirdRecord = await ready(third, secondRecord.rewriteId, { verdict: null });
    expect(await rewrites.recordRewrite(thirdRecord)).toBe("RECORDED");
    const history = (await readPathRewrites(person.ownerRef, root))!.paths;
    expect(history.map((entry) => [entry.path_seq, entry.state, entry.based_on_rewrite_id])).toEqual([
      [1, "FAILED", null], [2, "READY", null], [3, "READY", secondRecord.rewriteId]]);
  });

  it("P3 never keeps text in clear, nor a malformed rewrite; rows are insert-once", async () => {
    const person = await account();
    const [root, dig] = await chain(person, 1);
    const rewrites = new PostgresDigModelRunnerRepository(runner);
    await rewrites.takeRewriteTurn(dig!, root!, "a1");
    const record = await ready(dig!, null);
    expect(await sqlError(() => rewrites.recordRewrite({ ...record, content: { envelope: ENVELOPE as never, attestation: Buffer.alloc(32, 1) } })))
      .toMatchObject({ code: "22023", message: "CONTENT_ATTESTATION_INVALID" });
    expect(await sqlError(() => rewrites.recordRewrite({ ...record, content: null }))).toMatchObject({ code: "23514" });
    expect(await sqlError(() => rewrites.recordRewrite({ ...record, outcome: "FAILED", failureCode: "REWRITE_FAILED", fateAfter: null,
      verdict: null }))).toMatchObject({ code: "23514" });
    expect(await sqlError(() => rewrites.recordRewrite({ ...record, outcome: "FAILED", failureCode: "REWRITE_FAILED", fateAfter: null,
      content: null }))).toMatchObject({ code: "23514" });
    expect(await sqlError(() => rewrites.recordRewrite({ ...record, rounds: 0 }))).toMatchObject({ code: "23514" });
    expect(await rewrites.recordRewrite(record)).toBe("RECORDED");
    for (const statement of ["UPDATE identity.path_rewrite SET fate_after='FELL' WHERE run_id=$1",
      "DELETE FROM identity.path_rewrite WHERE run_id=$1", "DELETE FROM identity.path_rewrite_turn WHERE run_id=$1",
      "UPDATE identity.investigation_dig_level SET dig_level=2 WHERE run_id=$1"]) {
      expect(await sqlError(() => database.pool.query(statement, [dig])), statement).toMatchObject({ code: "55000", message: "DIG_MODEL_APPEND_ONLY" });
    }
    // No role reads or writes a table directly.
    for (const pool of [api, runner, erasure, worker]) {
      expect(await sqlError(() => pool.query("SELECT 1 FROM identity.path_rewrite LIMIT 1"))).toMatchObject({ code: "42501" });
      expect(await sqlError(() => pool.query("SELECT 1 FROM identity.run_pause_event LIMIT 1"))).toMatchObject({ code: "42501" });
    }
    // The runner's role cannot reach the API's functions, nor the API's own role the export reader.
    expect(await sqlError(() => runner.query("SELECT identity.read_path_rewrites($1,$2)", [person.ownerRef, root]))).toMatchObject({ code: "42501" });
    expect(await sqlError(() => runner.query("SELECT * FROM identity.join_investigation_nested($1,$2,$3,'{}'::text[],'quick')",
      [person.ownerRef, root, randomUUID()]))).toMatchObject({ code: "42501" });
    expect(await sqlError(() => api.query("SELECT identity.read_data_export_dig_model($1,$2)", [randomUUID(), randomUUID()]))).toMatchObject({ code: "42501" });
  });
});

describe("0134 the web plan", () => {
  it("W1 each path's decision is written once, its reason only sealed, and read back by path for the runner and the serve", async () => {
    const person = await account();
    const debate = await run(person);
    const web = new PostgresWebEvidenceRepository(runner);
    const REASON = { ...ENVELOPE, ct: "cmVhc29u" };
    const reason = await sealed(debate, "pos-2", REASON, "identity.web_plan_path");
    expect(await web.readPlanStatuses(debate)).toEqual([]);
    const plan = [
      { pathRef: "pos-1", status: "PLANNED" as const, searchesToSend: 2, reason: null },
      { pathRef: "pos-2", status: "NO_SEARCH_PLANNED" as const, searchesToSend: 0, reason },
      { pathRef: "pos-3", status: "PLANNED" as const, searchesToSend: 0, reason: null }
    ];
    expect(await web.recordPlanStatuses(debate, plan)).toBe("RECORDED");
    // A replay rewrites nothing, even with another decision.
    expect(await web.recordPlanStatuses(debate, [{ pathRef: "pos-1", status: "FAILED", searchesToSend: 0, reason: null }])).toBe("ALREADY");
    const read = (await web.readPlanStatuses(debate))!;
    expect(read.map(({ pathRef, status, searchesToSend, reason: sealedReason }) => [pathRef, status, searchesToSend, sealedReason]))
      .toEqual([["pos-1", "PLANNED", 2, null], ["pos-2", "NO_SEARCH_PLANNED", 0, REASON], ["pos-3", "PLANNED", 0, null]]);
    // The API's serve reads it too, in its owner's own request (its role is a member of the runtime role); since 0171 (F5) a request with
    // no session reads nothing, as for a plan never written.
    expect(await new PostgresWebEvidenceRepository(asking(person)).readPlanStatuses(debate)).toHaveLength(3);
    expect(await new PostgresWebEvidenceRepository(api).readPlanStatuses(debate)).toBeNull();
    // The rules: a reason exactly on NO_SEARCH_PLANNED, sends only when planned, attested, never on a plaintext run.
    const other = await run(person);
    expect(await sqlError(() => web.recordPlanStatuses(other, [{ pathRef: "pos-1", status: "NO_SEARCH_PLANNED", searchesToSend: 0, reason: null }])))
      .toMatchObject({ code: "23514" });
    expect(await sqlError(async () => web.recordPlanStatuses(other, [{ pathRef: "pos-1", status: "PLANNED", searchesToSend: 0,
      reason: await sealed(other, "pos-1", ENVELOPE, "identity.web_plan_path") }]))).toMatchObject({ code: "23514" });
    expect(await sqlError(() => web.recordPlanStatuses(other, [{ pathRef: "pos-1", status: "SWITCHED_OFF", searchesToSend: 1, reason: null }])))
      .toMatchObject({ code: "23514" });
    expect(await sqlError(async () => web.recordPlanStatuses(other, [{ pathRef: "pos-1", status: "NO_SEARCH_PLANNED", searchesToSend: 0,
      reason: await sealed(other, "pos-9", ENVELOPE, "identity.web_plan_path") }]))).toMatchObject({ code: "22023", message: "CONTENT_ATTESTATION_INVALID" });
    expect(await sqlError(() => database.pool.query("UPDATE identity.web_plan_path SET status='FAILED' WHERE run_id=$1", [debate])))
      .toMatchObject({ code: "55000", message: "DIG_MODEL_APPEND_ONLY" });
    expect(await sqlError(() => runner.query("SELECT 1 FROM identity.web_plan_path LIMIT 1"))).toMatchObject({ code: "42501" });
    // Deleting the debate (R22 item 16) and exporting the account.
    const exportId = randomUUID();
    const lease = randomUUID();
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, person.userId, randomUUID(), lease]);
    const exported = (await worker.query("SELECT identity.read_data_export_dig_model($1,$2) AS e", [exportId, lease])).rows[0].e;
    expect(exported.web_plans.map((row: { path_ref: string; status: string }) => [row.path_ref, row.status]))
      .toEqual([["pos-1", "PLANNED"], ["pos-2", "NO_SEARCH_PLANNED"], ["pos-3", "PLANNED"]]);
    await seedTombstone(debate);
    expect((await erasure.query("SELECT identity.forget_erased_debate_dig_model($1) AS n", [debate])).rows[0].n).toBe(3);
    expect(await web.readPlanStatuses(debate)).toBeNull();
    expect(Number((await database.pool.query("SELECT count(*) AS n FROM identity.web_plan_path WHERE run_id=$1", [debate])).rows[0].n)).toBe(0);
  });
});

describe("0134 the month pause", () => {
  it("M1 a running debate pauses at the month wall with the work it planned; the person continues it", async () => {
    const person = await account();
    const debate = await run(person);
    const runnerSide = new PostgresDigModelRunnerRepository(runner);
    const apiSide = new PostgresDigModelRepository(asking(person));
    expect(await apiSide.readPause(person.ownerRef, debate)).toMatchObject({ state: "NONE", reason: null });
    expect(await apiSide.resume(person.ownerRef, debate)).toBe("NOT_PAUSED");
    const resumableAt = new Date(Date.now() + 7 * 86_400_000);
    const pause = { runId: debate, reason: "MONTH_WALL" as const, resumableAt, plannedCalls: 14, plannedSearches: 6, plannedMicros: 31_500 };
    expect(await runnerSide.recordPause(pause)).toBe("RECORDED");
    expect(await runnerSide.recordPause(pause)).toBe("ALREADY_PAUSED");
    expect(await runnerSide.readPause(debate)).toMatchObject({ state: "PAUSED", reason: "MONTH_WALL", planned_calls: 14,
      planned_searches: 6, planned_micros: 31_500 });
    expect(new Date((await apiSide.readPause(person.ownerRef, debate))!.resumable_at!).getTime()).toBe(resumableAt.getTime());
    expect((await readPausedRuns(person.ownerRef)).map((paused) => paused.run_id)).toEqual([debate]);
    const stranger = await account();
    const strangerSide = new PostgresDigModelRepository(asking(stranger));
    expect(await strangerSide.resume(stranger.ownerRef, debate)).toBe("NOT_OWNED");
    expect(await strangerSide.readPause(stranger.ownerRef, debate)).toBeNull();
    // 0171 (F5): a request names only its own session's account, and with no session the API's role names no one.
    expect(await sqlError(() => strangerSide.resume(person.ownerRef, debate))).toMatchObject({ code: "42501", message: "REQUEST_OWNER_MISMATCH" });
    expect(await sqlError(() => strangerSide.readPause(person.ownerRef, debate))).toMatchObject({ code: "42501", message: "REQUEST_OWNER_MISMATCH" });
    expect(await sqlError(() => new PostgresDigModelRepository(api).resume(person.ownerRef, debate)))
      .toMatchObject({ code: "42501", message: "REQUEST_OWNER_MISMATCH" });
    expect(await apiSide.resume(person.ownerRef, debate)).toBe("RECORDED");
    expect(await apiSide.readPause(person.ownerRef, debate)).toMatchObject({ state: "RESUMED", reason: "MONTH_WALL", planned_calls: 14 });
    expect(await readPausedRuns(person.ownerRef)).toEqual([]);
    // It may pause again in a later month.
    expect(await runnerSide.recordPause(pause)).toBe("RECORDED");
    for (const bad of [{ ...pause, resumableAt: new Date(Date.now() - 1000) }, { ...pause, plannedCalls: -1 },
      { ...pause, reason: "DAY_WALL" as never }]) {
      expect(await sqlError(() => runnerSide.recordPause(bad))).toMatchObject({ code: "22023", message: "RUN_PAUSE_INVALID" });
    }
  });

  it("M2 the rewrite's charge is spend source PATH_REWRITE and names its run; the other sources stay accepted", async () => {
    const person = await account();
    const dig = await run(person);
    const insert = (source: string, runId: string | null) => database.pool.query(`INSERT INTO ledger.model_spend
      (spend_id, spend_source, run_id, provider_ref, charged_on, charge_micros, input_tokens, output_tokens)
      VALUES ($1,$2,$3,'path-rewrite:anthropic:fixture',(now() AT TIME ZONE 'UTC')::date,800,1000,200)`, [randomUUID(), source, runId]);
    await expect(insert("PATH_REWRITE", dig)).resolves.toBeDefined();
    await expect(insert("STORY", dig)).resolves.toBeDefined();
    expect(await sqlError(() => insert("PATH_REWRITE", null))).toMatchObject({ code: "23514" });
    expect(await sqlError(() => insert("PATH_REWRITE_TYPO", dig))).toMatchObject({ code: "23514" });
  });
});

describe("0134 deleting and the export", () => {
  it("D1 (R22 item 16) erasing a dig removes its rewrite and turn (the path falls back) and its pauses; erasing the debate dug from removes its paths' rewrites", async () => {
    const person = await account();
    const investigations = new PostgresInvestigationRepository(asking(person));
    const root = await run(person);
    const first = await run(person);
    const second = await run(person);
    const deeper = await run(person);
    await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: first, places: [], mode: "quick" });
    await investigations.join({ ownerRef: person.ownerRef, parentRunId: root, childRunId: second, places: [], mode: "quick" });
    await investigations.join({ ownerRef: person.ownerRef, parentRunId: first, childRunId: deeper, places: [], mode: "quick" });
    const rewrites = new PostgresDigModelRunnerRepository(runner);
    await rewrites.takeRewriteTurn(first, root, "a1");
    await rewrites.takeRewriteTurn(second, root, "a1");
    await rewrites.takeRewriteTurn(deeper, first, "a2");
    const firstRecord = await ready(first, null);
    expect(await rewrites.recordRewrite(firstRecord)).toBe("RECORDED");
    expect(await rewrites.recordRewrite(await ready(deeper, null))).toBe("RECORDED");
    await rewrites.recordPause({ runId: first, reason: "MONTH_WALL", resumableAt: new Date(Date.now() + 86_400_000),
      plannedCalls: 1, plannedSearches: 0, plannedMicros: 100 });
    expect(await sqlError(() => erasure.query("SELECT identity.forget_erased_debate_dig_model($1)", [first])))
      .toMatchObject({ code: "55000", message: "DIG_MODEL_DEBATE_NOT_ERASED" });
    await seedTombstone(first);
    // As the finalize transaction runs them: 0133's (first and deeper leave the investigation; their levels go with
    // them), then 0134's: first's rewrite and turn, deeper's rewrite and turn on first's path, first's pause, no level.
    expect((await erasure.query("SELECT identity.forget_erased_debate_investigation($1) AS n", [first])).rows[0].n).toBe(2);
    expect((await erasure.query("SELECT identity.forget_erased_debate_dig_model($1) AS n", [first])).rows[0].n).toBe(5);
    expect((await erasure.query("SELECT identity.forget_erased_debate_dig_model($1) AS n", [first])).rows[0].n).toBe(0);
    expect((await database.pool.query("SELECT run_id FROM identity.investigation_dig_level WHERE owner_ref=$1", [person.ownerRef])).rows)
      .toEqual([{ run_id: second }]);
    // The path falls back: the second dig now writes on the story's line.
    expect(await rewrites.readRewriteTurn(second)).toMatchObject({ state: "FRONT", base_rewrite_id: null });
    expect(await rewrites.recordRewrite(await ready(second, firstRecord.rewriteId))).toBe("BASE_MOVED");
    expect(await rewrites.recordRewrite(await ready(second, null))).toBe("RECORDED");
    await seedTombstone(root);
    expect((await erasure.query("SELECT identity.forget_erased_debate_dig_model($1) AS n", [root])).rows[0].n).toBe(2);
    expect(Number((await database.pool.query("SELECT (SELECT count(*) FROM identity.path_rewrite WHERE owner_ref=$1)"
      + " + (SELECT count(*) FROM identity.path_rewrite_turn WHERE owner_ref=$1) AS n", [person.ownerRef])).rows[0].n)).toBe(0);
  });

  it("D2 deleting the account removes its levels, turns, rewrites, web plans and pauses", async () => {
    const person = await account();
    const keeper = await account();
    for (const owner of [person, keeper]) {
      const [root, dig] = await chain(owner, 1);
      const rewrites = new PostgresDigModelRunnerRepository(runner);
      await rewrites.takeRewriteTurn(dig!, root!, "a1");
      expect(await rewrites.recordRewrite(await ready(dig!, null))).toBe("RECORDED");
      await rewrites.recordPause({ runId: root!, reason: "MONTH_WALL", resumableAt: new Date(Date.now() + 86_400_000),
        plannedCalls: 1, plannedSearches: 1, plannedMicros: 1 });
      expect(await new PostgresWebEvidenceRepository(runner).recordPlanStatuses(root!, [{ pathRef: "a1", status: "PLANNED",
        searchesToSend: 1, reason: null }])).toBe("RECORDED");
    }
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [person.userId]);
    const left = async (owner: string) => Number((await database.pool.query(`SELECT
      (SELECT count(*) FROM identity.investigation_dig_level WHERE owner_ref=$1) + (SELECT count(*) FROM identity.path_rewrite_turn WHERE owner_ref=$1)
      + (SELECT count(*) FROM identity.path_rewrite WHERE owner_ref=$1) + (SELECT count(*) FROM identity.run_pause_event WHERE owner_ref=$1)
      + (SELECT count(*) FROM identity.web_plan_path WHERE owner_ref=$1) AS n`,
      [owner])).rows[0].n);
    expect(await left(person.ownerRef)).toBe(0);
    expect(await left(keeper.ownerRef)).toBe(5);
  });

  it("D3 the export worker reads the account's levels, rewrites (sealed) and pauses behind its lease", async () => {
    const person = await account();
    const [root, dig] = await chain(person, 1);
    const rewrites = new PostgresDigModelRunnerRepository(runner);
    await rewrites.takeRewriteTurn(dig!, root!, "a1");
    const record = await ready(dig!, null);
    await rewrites.recordRewrite(record);
    await rewrites.recordPause({ runId: dig!, reason: "MONTH_WALL", resumableAt: new Date(Date.now() + 86_400_000),
      plannedCalls: 3, plannedSearches: 2, plannedMicros: 4_000 });
    const exportId = randomUUID();
    const lease = randomUUID();
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, person.userId, randomUUID(), lease]);
    const exported = (await worker.query("SELECT identity.read_data_export_dig_model($1,$2) AS e", [exportId, lease])).rows[0].e;
    expect(exported.dig_levels.map((row: { run_id: string; dig_level: number }) => [row.run_id, row.dig_level])).toEqual([[root, 0], [dig, 1]]);
    expect(exported.path_rewrites).toEqual([expect.objectContaining({ run_id: dig, rewrite_id: record.rewriteId, state: "READY", content: ENVELOPE })]);
    expect(exported.run_pauses).toEqual([expect.objectContaining({ run_id: dig, kind: "PAUSED", planned_calls: 3, planned_searches: 2 })]);
    expect(exported.run_pauses[0]).not.toHaveProperty("planned_micros");
    expect(await sqlError(() => worker.query("SELECT identity.read_data_export_dig_model($1,$2)", [exportId, randomUUID()])))
      .toMatchObject({ code: "P0001", message: "DATA_EXPORT_LEASE_INVALID" });
  });
});
