// tests/integration/path-progress-repository.test.ts
// V4 start step, Task 53a (spec 2026-11-03 §2 item 7, §4.6; items wait-d1, chat-first-round, journey-f1, wait-f16, public-f25): each path's
// step and each point's marks on real PostgreSQL through 0161's definers, on the runner's login; the carry-on mark as 0159's marks are
// written; a public debate's report counts on the API's billing login (owner answer Q20: B); erasure; the refusals; and no role reading a
// table. Ids and codes only. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PostgresOwnClosingsReader, PostgresPathProgressRepository, PostgresStartPathsStore, configureContentEncryption, contentCipherFor, createPool,
  migrate, type Pool, type StoredStartPath, type StoredStartPathSet
} from "@debateai/db";
import { provisionRlsLogins, type RlsLogins } from "../support/rls-logins.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let logins: RlsLogins | undefined;
let runner: Pool;
let api: Pool;
let owner: StoryEncryptedOwner;
let paths: PostgresStartPathsStore;
let store: PostgresPathProgressRepository;
let closings: PostgresOwnClosingsReader;

const QUESTION = "Should Harbour Town build a second ferry pier?";
const PATHS: readonly StoredStartPath[] = [
  { pathId: "b1", pathNo: 1, author: "AI_SUGGESTION", title: "The queues", question: "Would a second pier cut the queues?",
    viewpoints: [{ viewpointId: "pt11", pickNo: null, title: "The queues", question: "Would a second pier cut the queues?", own: false }], ownWords: [] },
  { pathId: "b2", pathNo: 2, author: "AI_SUGGESTION", title: "Winter", question: "Does winter ridership fall?",
    viewpoints: [{ viewpointId: "pt12", pickNo: null, title: "Winter", question: "Does winter ridership fall?", own: false }], ownWords: [] }
];
const setOf = (runId: string, extra: Partial<StoredStartPathSet> = {}): StoredStartPathSet => ({
  runId, source: "RUN_BUILT", width: 3, chosenBy: "AIS", carryOnToReport: false, paths: PATHS, menu: null, ...extra });

type SqlError = { code?: string | undefined; message?: string | undefined };
async function sqlError(run: () => Promise<unknown>): Promise<SqlError> {
  try { await run(); return { code: undefined, message: undefined }; }
  catch (error) { return error as SqlError; }
}
/** Writes past every trigger, as the database's own fixtures do. */
async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
/** A path debate: a live sealed debate with its two chosen paths recorded. */
async function pathDebate(extra: Partial<StoredStartPathSet> = {}): Promise<string> {
  const runId = await createEncryptedStoryRun(database.pool, owner, QUESTION);
  expect(await paths.recordStartPaths(setOf(runId, extra))).toBe("RECORDED");
  return runId;
}
/** A node of a sealed debate, written past its content triggers (its words do not matter here). */
async function node(runId: string): Promise<string> {
  const id = randomUUID();
  await seeded([[`
    INSERT INTO core.node (
      node_id, run_id, claim_text, claim_type, parent_node_id, child_kind, depth, sibling_ordinal,
      materialized_path, generation_status, path_status, exploration_decision,
      way_of_knowing, provenance_ref, locator, value_laden, created_at_seq
    ) VALUES ($1,$2,'a point','unknown',NULL,NULL,0,0,'0','complete','active','continue','REASONING',NULL,NULL,false,ledger.allocate_sequence())`,
    [id, runId]]]);
  return id;
}
/** The run's key cleanup intent: core.run_private_content_is_live is false from here on (0040's erasure, first half). */
async function erase(runId: string): Promise<void> {
  await database.pool.query(`INSERT INTO serve.private_run_key_cleanup_intent (request_ref,user_id,run_id,requested_at,cleanup_publication_refs)
    VALUES ($1,$2,$3,now(),'{}')`, [randomUUID(), owner.userId, runId]);
}
const raw = async (sql: string, values: readonly unknown[]): Promise<unknown> => (await runner.query(sql, [...values])).rows[0];
/** One public report row of a publication (0147), seeded past its triggers and keys: only its writer, version, outcome and carrier matter here. */
const report = (publicationRef: string, version: number, writerRef: string | null, outcome: "READY" | "READY_WITH_RESERVATION" | "FAILED" | null,
  reportId: string = randomUUID(), carrierRunId: string = randomUUID()) =>
  [`INSERT INTO identity.public_report (report_id, publication_ref, report_version, writer_ref, carrier_run_id, free, outcome, failure_code,
      recorded_at, content_ciphertext)
    VALUES ($1,$2,$3,$4,$5,false,$6::text,CASE WHEN $6::text = 'FAILED' THEN 'WRITER_FAILED' END,CASE WHEN $6::text IS NOT NULL THEN now() END,
      CASE WHEN $6::text IN ('READY','READY_WITH_RESERVATION') THEN '{"v":1}'::jsonb END)`,
    [reportId, publicationRef, version, writerRef, carrierRunId, outcome]] as const;
/** A press's sealed copy (0147's identity.public_material), seeded past its triggers and keys: a version being written has one. */
const material = (reportId: string, carrierRunId: string, publicationRef: string) =>
  [`INSERT INTO identity.public_material (material_id, run_id, owner_ref, publication_ref, kind, content_ciphertext, content_attestation)
    VALUES ($1,$2,$3,$4,'REPORT','{"v":1}'::jsonb,'\\x00'::bytea)`, [reportId, carrierRunId, owner.ownerRef, publicationRef]] as const;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  logins = await provisionRlsLogins(database);
  runner = createPool(logins.url("RUNNER_DATABASE_URL"));
  configureContentEncryption(runner, contentCipherFor(database.pool)!);
  api = createPool(logins.url("API_SYSTEM_DATABASE_URL"));
  paths = new PostgresStartPathsStore(runner);
  store = new PostgresPathProgressRepository(runner);
  closings = new PostgresOwnClosingsReader(api);
}, 300_000);

afterAll(async () => {
  await Promise.all([runner?.end(), api?.end()]);
  await logins?.end();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

describe("each path's step", () => {
  it("RECORDED, then ALREADY; the newest step per path", async () => {
    const runId = await pathDebate();
    expect(await store.readPathProgress(runId)).toEqual({ steps: new Map(), marks: [] });
    expect(await store.recordPathStep({ runId, pathId: "b1", step: "FINDING_SOURCES" })).toBe("RECORDED");
    expect(await store.recordPathStep({ runId, pathId: "b1", step: "FINDING_SOURCES" })).toBe("ALREADY");
    expect(await store.recordPathStep({ runId, pathId: "b2", step: "FINDING_SOURCES" })).toBe("RECORDED");
    expect((await store.readPathProgress(runId)).steps).toEqual(new Map([["b1", "FINDING_SOURCES"], ["b2", "FINDING_SOURCES"]]));
    expect(await store.recordPathStep({ runId, pathId: "b1", step: "ARGUING" })).toBe("RECORDED");
    expect(await store.recordPathStep({ runId, pathId: "b1", step: "ARGUING" })).toBe("ALREADY");
    expect((await store.readPathProgress(runId)).steps).toEqual(new Map([["b1", "ARGUING"], ["b2", "FINDING_SOURCES"]]));
    expect(await store.recordPathStep({ runId, pathId: "b2", step: "CHECKING" })).toBe("RECORDED");
    expect((await store.readPathProgress(runId)).steps).toEqual(new Map([["b1", "ARGUING"], ["b2", "CHECKING"]]));
    // Another debate's progress is its own.
    expect(await store.readPathProgress(await pathDebate())).toEqual({ steps: new Map(), marks: [] });
  });

  it("refuses a path the debate has not got, a debate without paths, and bad codes", async () => {
    const runId = await pathDebate();
    expect(await sqlError(() => store.recordPathStep({ runId, pathId: "b3", step: "ARGUING" })))
      .toMatchObject({ code: "22023", message: "PATH_PROGRESS_INVALID" });
    const bare = await createEncryptedStoryRun(database.pool, owner, QUESTION);
    expect(await sqlError(() => store.recordPathStep({ runId: bare, pathId: "b1", step: "ARGUING" })))
      .toMatchObject({ code: "22023", message: "PATH_PROGRESS_INVALID" });
    for (const [pathId, step] of [["b9", "ARGUING"], ["a1", "ARGUING"], ["b1", "DONE"], [null, "ARGUING"], ["b1", null]] as const) {
      expect(await sqlError(() => raw("SELECT core.record_path_step($1,$2,$3) AS outcome", [runId, pathId, step])), `${pathId} ${step}`)
        .toMatchObject({ code: "22023", message: "PATH_PROGRESS_INVALID" });
    }
    expect(await store.readPathProgress(runId)).toEqual({ steps: new Map(), marks: [] });
  });
});

describe("each point's marks", () => {
  it("RECORDED, then ALREADY; the marks in recorded order, FOUND with its trust word", async () => {
    const runId = await pathDebate();
    const [first, second] = [await node(runId), await node(runId)];
    expect(await store.recordPathPointMark({ runId, pathId: "b1", nodeId: first, mark: "PUT_FORWARD", trust: null })).toBe("RECORDED");
    expect(await store.recordPathPointMark({ runId, pathId: "b1", nodeId: first, mark: "PUT_FORWARD", trust: null })).toBe("ALREADY");
    expect(await store.recordPathPointMark({ runId, pathId: "b2", nodeId: second, mark: "PUT_FORWARD", trust: null })).toBe("RECORDED");
    expect(await store.recordPathPointMark({ runId, pathId: "b1", nodeId: first, mark: "CHECKING", trust: null })).toBe("RECORDED");
    expect(await store.recordPathPointMark({ runId, pathId: "b1", nodeId: first, mark: "CHECKED", trust: null })).toBe("RECORDED");
    expect(await store.recordPathPointMark({ runId, pathId: "b1", nodeId: first, mark: "FOUND", trust: "SURE_FOR_CASE" })).toBe("RECORDED");
    expect(await store.recordPathPointMark({ runId, pathId: "b1", nodeId: first, mark: "FOUND", trust: "SURE" })).toBe("ALREADY");
    const read = await store.readPathProgress(runId);
    expect(read.marks.map(({ pathId, nodeId, mark, trust }) => ({ pathId, nodeId, mark, trust }))).toEqual([
      { pathId: "b1", nodeId: first, mark: "PUT_FORWARD", trust: null },
      { pathId: "b2", nodeId: second, mark: "PUT_FORWARD", trust: null },
      { pathId: "b1", nodeId: first, mark: "CHECKING", trust: null },
      { pathId: "b1", nodeId: first, mark: "CHECKED", trust: null },
      { pathId: "b1", nodeId: first, mark: "FOUND", trust: "SURE_FOR_CASE" }
    ]);
    for (const row of read.marks) {
      expect(row.at).toBeInstanceOf(Date);
      expect(Number.isFinite(row.at.getTime())).toBe(true);
    }
    const times = read.marks.map((row) => row.at.getTime());
    expect(times).toEqual([...times].sort((left, right) => left - right));
    expect(read.steps).toEqual(new Map());
  });

  it("FOUND needs its trust word and no other mark has one (23514); another debate's node and a path the debate has not got are refused", async () => {
    const runId = await pathDebate();
    const point = await node(runId);
    expect((await sqlError(() => store.recordPathPointMark({ runId, pathId: "b1", nodeId: point, mark: "FOUND", trust: null }))).code).toBe("23514");
    expect((await sqlError(() => store.recordPathPointMark({ runId, pathId: "b1", nodeId: point, mark: "PUT_FORWARD", trust: "SURE" }))).code).toBe("23514");
    const other = await pathDebate();
    const foreign = await node(other);
    expect(await sqlError(() => store.recordPathPointMark({ runId, pathId: "b1", nodeId: foreign, mark: "PUT_FORWARD", trust: null })))
      .toMatchObject({ code: "22023", message: "PATH_PROGRESS_INVALID" });
    expect(await sqlError(() => store.recordPathPointMark({ runId, pathId: "b1", nodeId: randomUUID(), mark: "PUT_FORWARD", trust: null })))
      .toMatchObject({ code: "22023", message: "PATH_PROGRESS_INVALID" });
    expect(await sqlError(() => store.recordPathPointMark({ runId, pathId: "b5", nodeId: point, mark: "PUT_FORWARD", trust: null })))
      .toMatchObject({ code: "22023", message: "PATH_PROGRESS_INVALID" });
    for (const [pathId, mark, trust] of [["b0", "PUT_FORWARD", null], ["b1", "BEING_CHECKED", null], ["b1", "FOUND", "MAYBE"], ["b1", null, null]] as const) {
      expect(await sqlError(() => raw("SELECT core.record_path_point_mark($1,$2,$3,$4,$5) AS outcome", [runId, pathId, point, mark, trust])),
        `${pathId} ${mark} ${trust}`).toMatchObject({ code: "22023", message: "PATH_PROGRESS_INVALID" });
    }
    expect(await store.readPathProgress(runId)).toEqual({ steps: new Map(), marks: [] });
  });
});

describe("an erased debate", () => {
  it("answers RUN_ERASED to every write and reads as nothing", async () => {
    const runId = await pathDebate();
    const point = await node(runId);
    expect(await store.recordPathStep({ runId, pathId: "b1", step: "ARGUING" })).toBe("RECORDED");
    expect(await store.recordPathPointMark({ runId, pathId: "b1", nodeId: point, mark: "PUT_FORWARD", trust: null })).toBe("RECORDED");
    await erase(runId);
    // The definers' own answer, before 0040's barrier would refuse the insert.
    expect(await raw("SELECT core.record_path_step($1,$2,$3) AS outcome", [runId, "b1", "CHECKING"])).toEqual({ outcome: "RUN_ERASED" });
    expect(await raw("SELECT core.record_path_point_mark($1,$2,$3,$4,$5) AS outcome", [runId, "b1", point, "CHECKING", null]))
      .toEqual({ outcome: "RUN_ERASED" });
    expect(await store.recordPathStep({ runId, pathId: "b1", step: "CHECKING" })).toBe("RUN_ERASED");
    expect(await store.recordPathPointMark({ runId, pathId: "b1", nodeId: point, mark: "CHECKING", trust: null })).toBe("RUN_ERASED");
    expect(await store.readPathProgress(runId)).toEqual({ steps: new Map(), marks: [] });
    expect(await raw("SELECT core.read_path_progress($1) AS value", [runId])).toEqual({ value: null });
  });
});

describe("the carry-on mark", () => {
  it("NONE, then DUE, BEGUN and DONE as 0159's marks are written", async () => {
    const runId = await pathDebate({ carryOnToReport: true });
    expect(await store.readCarryOnMark(runId)).toBe("NONE");
    expect(await paths.recordCarryOnDue(runId)).toBe("RECORDED");
    expect(await store.readCarryOnMark(runId)).toBe("DUE");
    expect((await paths.claimCarryOnDue(50)).map((due) => due.runId)).toContain(runId);
    expect(await store.readCarryOnMark(runId)).toBe("BEGUN");
    expect(await paths.recordCarryOnDone(runId)).toBe("RECORDED");
    expect(await store.readCarryOnMark(runId)).toBe("DONE");
    // A debate without carry-on, or without paths at all, has none.
    expect(await store.readCarryOnMark(await pathDebate())).toBe("NONE");
    expect(await store.readCarryOnMark(randomUUID())).toBe("NONE");
  });
});

describe("a public debate's report counts (answer Q20)", () => {
  it("own: this owner's ready and writing versions; all: every writer's, a visitor's included; a failed or never-written version never counts", async () => {
    const publication = randomUUID();
    const visitor = randomUUID();
    // A live carrier (0147: the debate whose key seals the copy; 0132's owner rule: its owner is active and it is not erased).
    const carrier = await createEncryptedStoryRun(database.pool, owner, QUESTION);
    const [writing, carrierGone, neverSealed] = [randomUUID(), randomUUID(), randomUUID()];
    expect(await closings.countPublicReports(owner.ownerRef, publication)).toEqual({ own: 0, all: 0 });
    await seeded([
      report(publication, 1, owner.ownerRef, "READY"),
      report(publication, 2, owner.ownerRef, "FAILED"),
      report(publication, 3, visitor, "READY_WITH_RESERVATION"),
      report(publication, 4, visitor, "FAILED"),
      report(publication, 5, null, "READY"),
      // Being written: its carrier lives and its copy is sealed (0147's WRITING).
      report(publication, 6, owner.ownerRef, null, writing, carrier),
      material(writing, carrier, publication),
      // Never written, so not a report (0147 never writes it and a new press opens past it): its carrier went, or the press never sealed
      // its copy (pressPublicReport answered NO_CARRIER after the version was opened).
      report(publication, 7, owner.ownerRef, null, carrierGone, randomUUID()),
      material(carrierGone, randomUUID(), publication),
      report(publication, 8, visitor, null, neverSealed, carrier),
      // Another publication's reports are its own.
      report(randomUUID(), 1, owner.ownerRef, "READY")
    ]);
    expect(await closings.countPublicReports(owner.ownerRef, publication)).toEqual({ own: 2, all: 4 });
    expect(await closings.countPublicReports(visitor, publication)).toEqual({ own: 1, all: 4 });
    expect(await closings.countPublicReports(randomUUID(), publication)).toEqual({ own: 0, all: 4 });
  });
});

describe("the tables' rules", () => {
  it("no row is updated, deleted or truncated; no login reads a table; only the runtime's members run the core four, only the API's billing role the counts", async () => {
    const runId = await pathDebate();
    const point = await node(runId);
    expect(await store.recordPathStep({ runId, pathId: "b1", step: "ARGUING" })).toBe("RECORDED");
    expect(await store.recordPathPointMark({ runId, pathId: "b1", nodeId: point, mark: "PUT_FORWARD", trust: null })).toBe("RECORDED");
    for (const table of ["core.path_step", "core.path_point_mark"]) {
      expect((await sqlError(() => database.pool.query(`DELETE FROM ${table} WHERE run_id = $1`, [runId]))).code, table).toBe("55000");
      expect((await sqlError(() => database.pool.query(`UPDATE ${table} SET run_id = run_id WHERE run_id = $1`, [runId]))).code, table).toBe("55000");
      expect((await sqlError(() => database.pool.query(`TRUNCATE ${table} CASCADE`))).code, table).toBe("55000");
      expect((await sqlError(() => runner.query(`SELECT * FROM ${table}`))).code, table).toBe("42501");
      expect((await sqlError(() => api.query(`SELECT * FROM ${table}`))).code, table).toBe("42501");
    }
    // The runner cannot count public reports; the API's billing role can.
    expect((await sqlError(() => runner.query("SELECT identity.count_public_reports($1,$2) AS counts", [owner.ownerRef, randomUUID()]))).code).toBe("42501");
    const core = ["core.record_path_step(uuid,text,text)", "core.record_path_point_mark(uuid,text,uuid,text,text)", "core.read_path_progress(uuid)",
      "core.read_carry_on_mark(uuid)"];
    const counts = "identity.count_public_reports(uuid,uuid)";
    // Every role but the superusers (the migrator owns the tables) and PostgreSQL's own pg_ roles.
    const rows = (await database.pool.query<{ role: string; target: string; kind: "table" | "core" | "counts"; held: boolean; runtime: boolean; billing: boolean }>(`
      WITH roles AS (SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname !~ '^pg_'
        AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'core.path_step'::regclass))
      SELECT roles.rolname AS role, f.name AS target, 'core' AS kind, has_function_privilege(roles.rolname, f.name, 'EXECUTE') AS held,
        pg_has_role(roles.rolname, 'debateai_runtime', 'USAGE') AS runtime, false AS billing
      FROM roles CROSS JOIN unnest($1::text[]) AS f(name)
      UNION ALL
      SELECT roles.rolname, $2, 'counts', has_function_privilege(roles.rolname, $2, 'EXECUTE'), false,
        pg_has_role(roles.rolname, 'debateai_billing_runtime', 'USAGE')
      FROM roles
      UNION ALL
      SELECT roles.rolname, t.relation, 'table', has_table_privilege(roles.rolname, t.relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), false, false
      FROM roles CROSS JOIN unnest(ARRAY['core.path_step','core.path_point_mark']) AS t(relation)`, [core, counts])).rows;
    const runnerLogin = decodeURIComponent(new URL(logins!.url("RUNNER_DATABASE_URL")).username);
    const apiLogin = decodeURIComponent(new URL(logins!.url("API_SYSTEM_DATABASE_URL")).username);
    expect(rows.filter((row) => row.kind === "core" && row.role === runnerLogin && row.held)).toHaveLength(core.length);
    expect(rows.filter((row) => row.kind === "counts" && row.role === apiLogin && row.held)).toHaveLength(1);
    for (const row of rows) {
      const expected = row.kind === "core" ? row.runtime : row.kind === "counts" ? row.billing : false;
      expect(row.held, `${row.role} ${row.target}`).toBe(expected);
    }
  });
});
