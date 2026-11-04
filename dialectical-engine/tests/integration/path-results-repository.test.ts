// tests/integration/path-results-repository.test.ts
// V4 start step, Task 21 (spec 2026-11-03 §2.7, §4.3): a path debate's results per path on real PostgreSQL through 0158's six definers, on the
// runner's login: which root argued each path (and where it moved after a reclaim), each path's answer so far and the gap round, the last two
// sealed under the debate's own key; erasure; the definers' refusals; and no role reading a table. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DIG_MODEL_LIMITS, PATH_RESULT_LIMITS, PathGapRoundSchema, PathOutcomeSchema, WEB_CONTRACT_LIMITS, type PathGapRound, type PathOutcome
} from "@debateai/contract";
import {
  PATH_RESULT_CARRIERS, PostgresPathResultsRepository, configureContentEncryption, contentCipherFor, createPool, encryptAttestedContentForRun,
  migrate, withRunContentLease, type Pool
} from "@debateai/db";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import {
  createEncryptedStoryRun, createLegacyStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let logins: RlsLogins | undefined;
let runner: Pool;
let owner: StoryEncryptedOwner;
let store: PostgresPathResultsRepository;

const QUESTION = "Should Harbour Town build a second ferry pier?";
const READY: PathOutcome = {
  state: "READY", text: { line: "Yes, for the summer queues.", summary: "Two piers halve the July wait; winter needs one." },
  what_changed: ["The winter numbers came in lower."], view: null, trust: "SURE_FOR_CASE", rests_on: ["pt01"]
} as unknown as PathOutcome;
const FAILED: PathOutcome = { state: "FAILED", text: null, what_changed: [], view: null, trust: null, rests_on: [] } as PathOutcome;
const ROUND: PathGapRound = { points: [{ text: "Nobody asked who pays for the dredging.", path_id: "b1" }, { text: "The ferry crews were not heard.", path_id: null }] };
const WORDS = ["queues", "dredging", "winter", "crews", "Harbour"];

type SqlError = { code?: string | undefined; message?: string | undefined };
async function sqlError(run: () => Promise<unknown>): Promise<SqlError> {
  try { await run(); return { code: undefined, message: undefined }; }
  catch (error) { return error as SqlError; }
}
const encrypted = (): Promise<string> => createEncryptedStoryRun(database.pool, owner, QUESTION);
const legacy = (): Promise<string> => createLegacyStoryRun(database.pool, QUESTION, `asker:${randomUUID()}`);
/** A real node of the run, in the clear (a legacy run), as tests/integration/map-choice-repository.test.ts makes them. */
async function node(runId: string, status: "complete" | "stale" = "complete"): Promise<string> {
  return (await database.pool.query<{ node_id: string }>(`
    INSERT INTO core.node (
      run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
      materialized_path, generation_status, path_status, exploration_decision,
      way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
    ) VALUES ($1,'path root','unknown',NULL,NULL,0,0,'0',$2,'active','continue','REASONING',NULL,NULL,false,ledger.allocate_sequence())
    RETURNING node_id`, [runId, status])).rows[0]!.node_id;
}
/** A node of a sealed debate, written past its content triggers as the database's own fixtures do (its words do not matter here). */
async function sealedNode(runId: string): Promise<string> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    const id = (await seed.query<{ node_id: string }>(`
      INSERT INTO core.node (
        run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
        materialized_path, generation_status, path_status, exploration_decision,
        way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
      ) VALUES ($1,'path root','unknown',NULL,NULL,0,0,'0','complete','active','continue','REASONING',NULL,NULL,false,ledger.allocate_sequence())
      RETURNING node_id`, [runId])).rows[0]!.node_id;
    await seed.query("COMMIT");
    return id;
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
/** The longest text the contract allows, in a script whose every character is three bytes once encoded. */
const widest = (length: number): string => "漢".repeat(length);
const stale = async (runId: string, nodeId: string): Promise<void> => {
  await database.pool.query("UPDATE core.node SET generation_status = 'stale' WHERE run_id = $1 AND node_id = $2", [runId, nodeId]);
};
/** The run's key cleanup intent: core.run_private_content_is_live is false from here on (0040's erasure, first half). */
async function erase(runId: string): Promise<void> {
  await database.pool.query(`INSERT INTO serve.private_run_key_cleanup_intent (request_ref,user_id,run_id,requested_at,cleanup_publication_refs)
    VALUES ($1,$2,$3,now(),'{}')`, [randomUUID(), owner.userId, runId]);
}
const raw = async (sql: string, values: readonly unknown[]): Promise<unknown> => (await runner.query(sql, [...values])).rows[0];

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  logins = await provisionRlsLogins(database);
  runner = createPool(logins.url("RUNNER_DATABASE_URL"));
  configureContentEncryption(runner, contentCipherFor(database.pool)!);
  store = new PostgresPathResultsRepository(runner);
}, 300_000);

afterAll(async () => {
  await runner?.end();
  await logins?.end();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

describe("which root argued each chosen path", () => {
  it("INSERTED, then ALREADY_PRESENT; the roots in force by root index", async () => {
    const runId = await legacy();
    const [first, second] = [await node(runId), await node(runId)];
    expect(await store.writePathRoot({ runId, pathId: "b2", rootIndex: 1, rootNodeId: second, maker: "maker-1" })).toBe("INSERTED");
    expect(await store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: first, maker: "maker-0" })).toBe("INSERTED");
    expect(await store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: first, maker: "maker-0" })).toBe("ALREADY_PRESENT");
    // A live root stays: another root for the same path is not taken.
    expect(await store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: await node(runId), maker: "maker-2" })).toBe("ALREADY_PRESENT");
    expect(await store.readPathRoots(runId)).toEqual([
      { pathId: "b1", rootIndex: 0, rootNodeId: first, maker: "maker-0", stale: false },
      { pathId: "b2", rootIndex: 1, rootNodeId: second, maker: "maker-1", stale: false }
    ]);
    expect(await store.readPathRoots(await legacy())).toEqual([]);
  });

  it("a live sealed debate, the kind path debates run on, keeps and reads its roots", async () => {
    const runId = await encrypted();
    const root = await sealedNode(runId);
    expect(await store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: root, maker: "maker-0" })).toBe("INSERTED");
    expect(await store.readPathRoots(runId)).toEqual([{ pathId: "b1", rootIndex: 0, rootNodeId: root, maker: "maker-0", stale: false }]);
    expect(await raw("SELECT core.read_path_roots($1) AS value", [runId])).not.toEqual({ value: null });
  });

  it("REPOINTED after a reclaim set the root aside, then the new root is in force; never onto a stale node", async () => {
    const runId = await legacy();
    const dead = await node(runId);
    expect(await store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: dead, maker: "maker-0" })).toBe("INSERTED");
    await stale(runId, dead);
    expect(await store.readPathRoots(runId)).toEqual([{ pathId: "b1", rootIndex: 0, rootNodeId: dead, maker: "maker-0", stale: true }]);
    // A move onto a node that is itself set aside is refused.
    const alsoDead = await node(runId, "stale");
    expect(await sqlError(() => store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: alsoDead, maker: "maker-1" })))
      .toMatchObject({ code: "55000", message: "PATH_ROOT_REPOINT_TARGET_STALE" });
    const live = await node(runId);
    expect(await store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: live, maker: "maker-1" })).toBe("REPOINTED");
    expect(await store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: live, maker: "maker-1" })).toBe("ALREADY_PRESENT");
    // The root index stays the first pass's; the maker is the one that wrote the root in force.
    expect(await store.readPathRoots(runId)).toEqual([{ pathId: "b1", rootIndex: 0, rootNodeId: live, maker: "maker-1", stale: false }]);
    // A second reclaim moves it again, from the root in force.
    await stale(runId, live);
    const third = await node(runId);
    expect(await store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: third, maker: "maker-2" })).toBe("REPOINTED");
    expect((await store.readPathRoots(runId))[0]).toMatchObject({ rootNodeId: third, maker: "maker-2", stale: false });
  });

  it("refuses another debate's node and a second path on the same root index", async () => {
    const runId = await legacy();
    const other = await legacy();
    const foreign = await node(other);
    expect((await sqlError(() => store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: foreign, maker: "maker-0" }))).code).toBe("23503");
    const root = await node(runId);
    expect(await store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: root, maker: "maker-0" })).toBe("INSERTED");
    expect((await sqlError(() => store.writePathRoot({ runId, pathId: "b2", rootIndex: 0, rootNodeId: root, maker: "maker-0" }))).code).toBe("23505");
    expect(await store.readPathRoots(runId)).toHaveLength(1);
  });
});

describe("each path's answer so far and the gap round, sealed per run", () => {
  it("records an outcome once and reads every path's back; the words are sealed", async () => {
    const runId = await encrypted();
    expect(await store.recordPathOutcome({ runId, pathId: "b1", outcome: READY })).toBe("RECORDED");
    expect(await store.recordPathOutcome({ runId, pathId: "b1", outcome: FAILED })).toBe("ALREADY");
    expect(await store.recordPathOutcome({ runId, pathId: "b2", outcome: FAILED })).toBe("RECORDED");
    expect(await store.readPathOutcomes(runId)).toEqual(new Map([["b1", READY], ["b2", FAILED]]));
    expect(await store.readPathOutcomes(await encrypted())).toEqual(new Map());
    const rows = (await database.pool.query<{ sealed: boolean; plain: string }>(`SELECT core.is_content_envelope(content_ciphertext) AS sealed,
      to_jsonb(outcome)::text AS plain FROM core.path_outcome AS outcome WHERE run_id = $1`, [runId])).rows;
    expect(rows.map((row) => row.sealed)).toEqual([true, true]);
    for (const row of rows) for (const word of WORDS) expect(row.plain, word).not.toContain(word);
  });

  it("records the gap round once and reads it back; the words are sealed", async () => {
    const runId = await encrypted();
    expect(await store.readPathGapRound(runId)).toBeNull();
    expect(await store.recordPathGapRound({ runId, roundCount: 1, round: ROUND })).toBe("RECORDED");
    expect(await store.recordPathGapRound({ runId, roundCount: 2, round: { points: [] } })).toBe("ALREADY");
    expect(await store.readPathGapRound(runId)).toEqual({ roundCount: 1, round: ROUND });
    const row = (await database.pool.query<{ sealed: boolean; plain: string }>(`SELECT core.is_content_envelope(content_ciphertext) AS sealed,
      to_jsonb(gap)::text AS plain FROM core.path_gap_round AS gap WHERE run_id = $1`, [runId])).rows[0]!;
    expect(row.sealed).toBe(true);
    for (const word of WORDS) expect(row.plain, word).not.toContain(word);
  });

  it("keeps the largest answer and gap round the contract accepts, in a three-byte script", async () => {
    const runId = await encrypted();
    const outcome = PathOutcomeSchema.parse({
      state: "READY_WITH_RESERVATION", text: { line: widest(DIG_MODEL_LIMITS.lineMaxChars), summary: widest(DIG_MODEL_LIMITS.summaryMaxChars), fate: "PARTLY_HELD" },
      what_changed: Array.from({ length: PATH_RESULT_LIMITS.whatChangedMax }, () => widest(DIG_MODEL_LIMITS.sentenceMaxChars)),
      view: { outcome: "HELPED", scope: "PATH", reason: widest(DIG_MODEL_LIMITS.reasonMaxChars),
        own_words: Array.from({ length: WEB_CONTRACT_LIMITS.digPicksMax }, () => widest(WEB_CONTRACT_LIMITS.pickTextMaxChars)) },
      trust: "STILL_ARGUED", rests_on: Array.from({ length: PATH_RESULT_LIMITS.restsOnMax }, () => widest(160))
    });
    expect(await store.recordPathOutcome({ runId, pathId: "b8", outcome })).toBe("RECORDED");
    expect((await store.readPathOutcomes(runId)).get("b8")).toEqual(outcome);
    const round = PathGapRoundSchema.parse({ points: Array.from({ length: PATH_RESULT_LIMITS.gapPointsMax },
      (_, at) => ({ text: widest(PATH_RESULT_LIMITS.gapPointMaxChars), path_id: at % 2 === 0 ? "b1" : null })) });
    expect(await store.recordPathGapRound({ runId, roundCount: 2, round })).toBe("RECORDED");
    expect(await store.readPathGapRound(runId)).toEqual({ roundCount: 2, round });
  });

  it("an erased debate answers RUN_ERASED to every write and reads as nothing", async () => {
    const runId = await encrypted();
    expect(await store.recordPathOutcome({ runId, pathId: "b1", outcome: READY })).toBe("RECORDED");
    expect(await store.recordPathGapRound({ runId, roundCount: 1, round: ROUND })).toBe("RECORDED");
    // Envelopes sealed while the debate is live, offered to the definers after it is erased.
    const [late, lateRound] = await withRunContentLease(runner, [runId], async () => [
      (await encryptAttestedContentForRun(runner, runId, PATH_RESULT_CARRIERS.outcome, "b2", FAILED))!,
      (await encryptAttestedContentForRun(runner, runId, PATH_RESULT_CARRIERS.gapRound, runId.toLowerCase(), ROUND))!] as const);
    await erase(runId);
    expect(await raw("SELECT core.record_path_outcome($1,$2,$3,$4::jsonb,$5) AS outcome",
      [runId, "b2", "FAILED", JSON.stringify(late.envelope), late.attestation])).toEqual({ outcome: "RUN_ERASED" });
    expect(await raw("SELECT core.record_path_gap_round($1,$2,$3::jsonb,$4) AS outcome",
      [runId, 2, JSON.stringify(lateRound.envelope), lateRound.attestation])).toEqual({ outcome: "RUN_ERASED" });
    expect(await store.recordPathOutcome({ runId, pathId: "b2", outcome: FAILED })).toBe("RUN_ERASED");
    expect(await store.recordPathGapRound({ runId, roundCount: 2, round: ROUND })).toBe("RUN_ERASED");
    expect(await store.writePathRoot({ runId, pathId: "b1", rootIndex: 0, rootNodeId: randomUUID(), maker: "maker-0" })).toBe("RUN_ERASED");
    expect(await store.readPathOutcomes(runId)).toEqual(new Map());
    expect(await store.readPathGapRound(runId)).toBeNull();
    expect(await store.readPathRoots(runId)).toEqual([]);
    for (const name of ["core.read_path_roots", "core.read_path_outcomes", "core.read_path_gap_round"]) {
      expect(await raw(`SELECT ${name}($1) AS value`, [runId]), name).toEqual({ value: null });
    }
  });
});

describe("the definers' refusals and the tables' rules", () => {
  it("refuses a debate without content encryption, plain text, a foreign attestation and bad codes", async () => {
    const plain = await legacy();
    await expect(store.recordPathOutcome({ runId: plain, pathId: "b1", outcome: READY })).rejects.toMatchObject({ code: "PATH_RESULTS_NOT_SEALED" });
    await expect(store.recordPathGapRound({ runId: plain, roundCount: 1, round: ROUND })).rejects.toMatchObject({ code: "PATH_RESULTS_NOT_SEALED" });
    const runId = await encrypted();
    // Sealed for b1, offered as b2: the attestation binds the envelope to its own path.
    const sealed = (await withRunContentLease(runner, [runId], () =>
      encryptAttestedContentForRun(runner, runId, PATH_RESULT_CARRIERS.outcome, "b1", READY)))!;
    expect(await sqlError(() => raw("SELECT core.record_path_outcome($1,$2,$3,$4::jsonb,$5) AS outcome",
      [runId, "b2", "READY", JSON.stringify(sealed.envelope), sealed.attestation])))
      .toMatchObject({ code: "22023", message: "CONTENT_ATTESTATION_INVALID" });
    expect(await sqlError(() => raw("SELECT core.record_path_outcome($1,$2,$3,$4::jsonb,$5) AS outcome",
      [runId, "b1", "READY", JSON.stringify({ text: "the queues" }), sealed.attestation]))).toMatchObject({ code: "22023" });
    expect(await sqlError(() => raw("SELECT core.record_path_outcome($1,$2,$3,$4::jsonb,$5) AS outcome",
      [plain, "b1", "READY", JSON.stringify(sealed.envelope), sealed.attestation]))).toMatchObject({ code: "22023" });
    for (const [pathId, state] of [["b9", "READY"], ["a1", "READY"], ["b1", "DONE"], [null, "READY"]] as const) {
      expect(await sqlError(() => raw("SELECT core.record_path_outcome($1,$2,$3,$4::jsonb,$5) AS outcome",
        [runId, pathId, state, JSON.stringify(sealed.envelope), sealed.attestation])), `${pathId} ${state}`)
        .toMatchObject({ code: "22023", message: "PATH_RESULTS_INVALID" });
    }
    for (const count of [-1, 3]) {
      expect(await sqlError(() => raw("SELECT core.record_path_gap_round($1,$2,$3::jsonb,$4) AS outcome",
        [runId, count, JSON.stringify(sealed.envelope), sealed.attestation])), String(count)).toMatchObject({ code: "22023", message: "PATH_RESULTS_INVALID" });
    }
    const root = await legacy();
    for (const [pathId, index, maker] of [["b0", 0, "maker-0"], ["b1", 8, "maker-0"], ["b1", -1, "maker-0"], ["b1", 0, "two words"]] as const) {
      expect(await sqlError(() => raw("SELECT core.write_path_root($1,$2,$3,$4,$5) AS outcome", [root, pathId, index, randomUUID(), maker])),
        `${pathId} ${index} ${maker}`).toMatchObject({ code: "22023", message: "PATH_RESULTS_INVALID" });
    }
    expect(await store.readPathOutcomes(runId)).toEqual(new Map());
  });

  it("no row is updated, deleted or truncated; the runtime cannot read a table; only debateai_runtime's members run the definers", async () => {
    const runId = await encrypted();
    expect(await store.recordPathOutcome({ runId, pathId: "b1", outcome: READY })).toBe("RECORDED");
    for (const table of ["core.path_root", "core.path_root_repoint", "core.path_outcome", "core.path_gap_round"]) {
      expect((await sqlError(() => database.pool.query(`DELETE FROM ${table} WHERE run_id = $1`, [runId]))).code, table).toBe("55000");
      expect((await sqlError(() => database.pool.query(`UPDATE ${table} SET run_id = run_id WHERE run_id = $1`, [runId]))).code, table).toBe("55000");
      expect((await sqlError(() => database.pool.query(`TRUNCATE ${table} CASCADE`))).code, table).toBe("55000");
    }
    expect((await sqlError(() => runner.query("SELECT * FROM core.path_outcome"))).code).toBe("42501");
    const signatures = ["core.write_path_root(uuid,text,integer,uuid,text)", "core.record_path_outcome(uuid,text,text,jsonb,bytea)",
      "core.record_path_gap_round(uuid,integer,jsonb,bytea)", "core.read_path_roots(uuid)", "core.read_path_outcomes(uuid)", "core.read_path_gap_round(uuid)"];
    const guards = ["core.enforce_content_ciphertext_path_outcome()", "core.enforce_content_attestation_v2_path_outcome()",
      "core.enforce_content_ciphertext_path_gap_round()", "core.enforce_content_attestation_v2_path_gap_round()"];
    // Every role but the superusers (the migrator owns the tables) and PostgreSQL's own pg_ roles.
    const rows = (await database.pool.query<{ role: string; target: string; kind: "table" | "definer" | "guard"; held: boolean; runtime: boolean }>(`
      WITH roles AS (SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname !~ '^pg_'
        AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'core.path_outcome'::regclass))
      SELECT roles.rolname AS role, f.name AS target, 'definer' AS kind, has_function_privilege(roles.rolname, f.name, 'EXECUTE') AS held,
        pg_has_role(roles.rolname, 'debateai_runtime', 'USAGE') AS runtime
      FROM roles CROSS JOIN unnest($1::text[]) AS f(name)
      UNION ALL
      SELECT roles.rolname, g.name, 'guard', has_function_privilege(roles.rolname, g.name, 'EXECUTE'), false
      FROM roles CROSS JOIN unnest($2::text[]) AS g(name)
      UNION ALL
      SELECT roles.rolname, t.relation, 'table', has_table_privilege(roles.rolname, t.relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), false
      FROM roles CROSS JOIN unnest(ARRAY['core.path_root','core.path_root_repoint','core.path_outcome','core.path_gap_round']) AS t(relation)`,
      [signatures, guards])).rows;
    const runnerLogin = decodeURIComponent(new URL(logins!.url("RUNNER_DATABASE_URL")).username);
    expect(rows.filter((row) => row.kind === "definer" && row.role === runnerLogin && row.runtime && row.held)).toHaveLength(signatures.length);
    for (const row of rows) expect(row.held, `${row.role} ${row.target}`).toBe(row.kind === "definer" && row.runtime);
  });
});
