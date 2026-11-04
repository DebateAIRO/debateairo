// tests/integration/start-paths-database.test.ts
// V4 start step, Task 20 (spec 2026-11-03 §4): the paths a person chose at Start, on real PostgreSQL through 0157's definers, sealed under the
// debate's own key by PostgresStartPathsStore on the runner's login; the carry-on marks; the definers' refusals; and no role reading a table.
// Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { StartMenuSchema, type StartMenu } from "@debateai/contract";
import {
  START_PATH_CARRIER, START_PATH_SET_CARRIER, PostgresStartPathsStore, configureContentEncryption, contentCipherFor, createPool,
  decryptLeasedContentForRun, encryptAttestedContentForRun, migrate, prepareLeasedContentEncryptionForRun, withRunContentLease,
  type Pool, type StoredStartPath, type StoredStartPathSet
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
let store: PostgresStartPathsStore;

const QUESTION = "Should Harbour Town build a second ferry pier?";
const MENU: StartMenu = StartMenuSchema.parse({
  menu_id: "A".repeat(22), revision: 1, language: { code: "en", name: "English" },
  angles: [{ angle_id: "g1", kind: "GENERAL", label: "The whole picture" }],
  viewpoints: [
    { viewpoint_id: "pt11", title: "The queues", question: "Would a second pier cut the queues?", why: "It is the town's first worry.", angle_id: "g1",
      repeat_ids: ["pt21"] },
    { viewpoint_id: "pt12", title: "Winter", question: "Does winter ridership fall?", why: "Half the year is quiet.", angle_id: "g1", repeat_ids: ["pt22"] }
  ],
  // Two viewpoints another list wrote again, in their own words: they are sealed whole with the menu.
  repeats: [
    { viewpoint_id: "pt21", title: "Shorter waits", question: "Do two piers halve the wait?", why: "Queues are the complaint.", angle_id: "g1" },
    { viewpoint_id: "pt22", title: "Quiet months", question: "Who rides in January?", why: "Winter is long here.", angle_id: "g1" }
  ],
  paths: [
    { path_ref: "kp00", title: "The queues", question: "Would a second pier cut the queues?", viewpoint_ids: ["pt11"], put_together: false, is_new: false },
    { path_ref: "kp01", title: "Winter", question: "Does winter ridership fall?", viewpoint_ids: ["pt12"], put_together: false, is_new: false }
  ],
  cards: [], suggestions: []
});
const PATHS: readonly StoredStartPath[] = [
  { pathId: "b1", pathNo: 1, author: "AI_SUGGESTION", title: "The queues", question: "Would a second pier cut the queues?",
    viewpoints: [{ viewpointId: "pt11", pickNo: null, title: "The queues", question: "Would a second pier cut the queues?", own: false }], ownWords: [] },
  { pathId: "b2", pathNo: 2, author: "PERSON_OWN_VIEW", title: "My view", question: "I think tourists keep the ferries full all year.",
    viewpoints: [{ viewpointId: null, pickNo: null, title: null, question: "I think tourists keep the ferries full all year.", own: true }],
    ownWords: ["I think tourists keep the ferries full all year."] }
];
const setOf = (runId: string, extra: Partial<StoredStartPathSet> = {}): StoredStartPathSet => ({
  runId, source: "MENU", width: 3, chosenBy: "PERSON", carryOnToReport: false, paths: PATHS, menu: { menu: MENU, lateLists: [] }, ...extra });

type SqlError = { code?: string | undefined; message?: string | undefined };
async function sqlError(run: () => Promise<unknown>): Promise<SqlError> {
  try { await run(); return { code: undefined, message: undefined }; }
  catch (error) { return error as SqlError; }
}
/** Writes past every trigger, as the database's own fixtures do: a binding taken away, a tombstone, an account suspended. */
async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
const debate = (): Promise<string> => createEncryptedStoryRun(database.pool, owner, QUESTION);
/** A debate with a set recorded; DUE when carry-on was asked. */
async function withSet(extra: Partial<StoredStartPathSet> = {}, due = false): Promise<string> {
  const runId = await debate();
  expect(await store.recordStartPaths(setOf(runId, extra))).toBe("RECORDED");
  if (due) expect(await store.recordCarryOnDue(runId)).toBe("RECORDED");
  return runId;
}
/** A fake envelope with a true attestation under the run's own secret, for the definers' refusals. */
async function attested(runId: string, carrier: string, key: string): Promise<Readonly<{ content: unknown; attestation: string }>> {
  const content = { v: 1, keyId: "fixture-key", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" };
  const row = (await database.pool.query<{ value: Buffer }>(`SELECT audit_crypto_internal.hmac(core.content_envelope_attestation_bytes($1,$2,$3,'content_ciphertext',$4::jsonb),
      (SELECT secret.secret FROM core.run_content_attestation_secret AS secret WHERE secret.run_id = $1),'sha256') AS value`,
    [runId, carrier, key, JSON.stringify(content)])).rows[0]!;
  return { content, attestation: row.value.toString("hex") };
}
async function rawRecord(runId: string, set: Record<string, unknown>, paths: readonly Record<string, unknown>[]): Promise<unknown> {
  return (await runner.query("SELECT core.record_start_paths($1,$2::jsonb,$3::jsonb) AS outcome", [runId, JSON.stringify(set), JSON.stringify(paths)])).rows[0];
}
async function rawPath(runId: string, no: number, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const id = `b${no}`;
  const sealed = await attested(runId, START_PATH_CARRIER, id);
  return { path_id: id, path_no: no, author: "AI_SUGGESTION", viewpoint_count: 1, has_own_words: false, ...sealed, ...extra };
}
async function rawSet(runId: string, extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const sealed = await attested(runId, START_PATH_SET_CARRIER, runId.toLowerCase());
  return { source: "MENU", width: 3, path_count: 2, chosen_by: "PERSON", carry_on_to_report: false, ...sealed, ...extra };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  owner = await provisionStoryEncryptedOwner(database.pool);
  logins = await provisionRlsLogins(database);
  runner = createPool(logins.url("RUNNER_DATABASE_URL"));
  configureContentEncryption(runner, contentCipherFor(database.pool)!);
  store = new PostgresStartPathsStore(runner);
}, 300_000);

afterAll(async () => {
  await runner?.end();
  await logins?.end();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

describe("a debate's chosen paths, sealed under its own key", () => {
  it("round-trips a MENU set, the menu's repeats in their own words, and keeps the first set on a second record", async () => {
    const runId = await withSet();
    expect(await store.readStartPaths(runId)).toEqual(setOf(runId));
    expect((await store.readStartPaths(runId))!.menu!.menu.repeats.map((one) => one.question)).toEqual(["Do two piers halve the wait?", "Who rides in January?"]);
    expect(await store.recordStartPaths(setOf(runId, { width: 5, paths: PATHS.slice(0, 1), menu: null }))).toBe("ALREADY");
    expect(await store.readStartPaths(runId)).toEqual(setOf(runId));
    // The words are sealed: every row's content is an envelope, and no word of the menu or the paths is in either table.
    for (const table of ["core.start_path_set", "core.start_path"]) {
      const rows = (await database.pool.query<{ sealed: boolean; plain: string }>(
        `SELECT core.is_content_envelope(content_ciphertext) AS sealed, to_jsonb(row_value)::text AS plain FROM ${table} AS row_value WHERE run_id=$1`,
        [runId])).rows;
      expect(rows.length, table).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.sealed, table).toBe(true);
        for (const word of ["tourists", "queues", "January", "Harbour", "halve"]) expect(row.plain, `${table} ${word}`).not.toContain(word);
      }
    }
  });

  it("seals the set as the plan says: the menu itself, or {} for a set without one, and reads a set sealed that way", async () => {
    const opened = async (runId: string): Promise<unknown> => {
      const envelope = (await database.pool.query("SELECT content_ciphertext FROM core.start_path_set WHERE run_id=$1", [runId])).rows[0].content_ciphertext;
      const leased = await prepareLeasedContentEncryptionForRun(runner, runId);
      try { return decryptLeasedContentForRun<unknown>(leased, START_PATH_SET_CARRIER, runId.toLowerCase(), envelope, null); }
      finally { await leased.close(); }
    };
    expect(await opened(await withSet())).toEqual({ menu: MENU, lateLists: [] });
    expect(await opened(await withSet({ source: "DIG_PICKS", menu: null }))).toEqual({});
    // Sealed by hand in that shape, the store reads it back.
    for (const [content, menu] of [[{ menu: MENU, lateLists: [] }, { menu: MENU, lateLists: [] }], [{}, null]] as const) {
      const runId = await debate();
      await withRunContentLease(runner, [runId], async () => {
        const set = (await encryptAttestedContentForRun(runner, runId, START_PATH_SET_CARRIER, runId.toLowerCase(), content))!;
        const path = (await encryptAttestedContentForRun(runner, runId, START_PATH_CARRIER, "b1", { title: PATHS[0]!.title,
          question: PATHS[0]!.question, viewpoints: PATHS[0]!.viewpoints, ownWords: [] }))!;
        expect(await rawRecord(runId, { source: "MENU", width: 3, path_count: 1, chosen_by: "PERSON", carry_on_to_report: false,
          content: set.envelope, attestation: set.attestation.toString("hex") }, [{ path_id: "b1", path_no: 1, author: "AI_SUGGESTION",
          viewpoint_count: 1, has_own_words: false, content: path.envelope, attestation: path.attestation.toString("hex") }]))
          .toEqual({ outcome: "RECORDED" });
      });
      expect(await store.readStartPaths(runId)).toEqual(setOf(runId, { paths: PATHS.slice(0, 1), menu }));
    }
  });

  it("a RUN_BUILT set with a menu round-trips its menu; a set without one reads back null", async () => {
    const built = await withSet({ source: "RUN_BUILT", chosenBy: "AIS" });
    expect(await store.readStartPaths(built)).toEqual(setOf(built, { source: "RUN_BUILT", chosenBy: "AIS" }));
    const dig = await withSet({ source: "DIG_PICKS", menu: null });
    expect((await store.readStartPaths(dig))!.menu).toBeNull();
  });

  it("reads the path ids without opening anything, and another debate has none", async () => {
    const runId = await withSet();
    expect(await store.readStartPathIds(runId)).toEqual(["b1", "b2"]);
    expect(await store.readStartPathIds(await debate())).toBeNull();
  });

  it("copies a set to a re-admitted debate, sealed again under the new debate's key; a debate with none copies NONE", async () => {
    const from = await withSet();
    const to = await debate();
    expect(await store.copyStartPathsForReadmission(from, to)).toBe("COPIED");
    expect(await store.readStartPaths(to)).toEqual(setOf(to));
    expect(await store.copyStartPathsForReadmission(await debate(), await debate())).toBe("NONE");
  });

  it("an erased debate reads null, and a debate without content encryption keeps no set", async () => {
    const runId = await withSet();
    await seeded([[`INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count)
      VALUES ($1,clock_timestamp(),1,0)`, [runId]]]);
    expect(await store.readStartPaths(runId)).toBeNull();
    const legacy = await createLegacyStoryRun(database.pool, QUESTION, `legacy:${randomUUID()}`);
    await expect(store.recordStartPaths(setOf(legacy))).rejects.toMatchObject({ code: "START_PATHS_NOT_SEALED" });
  });
});

describe("the definer's refusals", () => {
  it("refuses an erased debate, a debate without encryption, a wrong count, numbering or repeated id, and a table rule", async () => {
    const erased = await debate();
    await seeded([[`INSERT INTO serve.private_run_erasure_tombstone (run_id,completed_at,destroyed_key_count,already_absent_key_count)
      VALUES ($1,clock_timestamp(),1,0)`, [erased]]]);
    expect(await sqlError(async () => rawRecord(erased, await rawSet(erased), [await rawPath(erased, 1), await rawPath(erased, 2)])))
      .toMatchObject({ code: "55000", message: "PRIVATE_CONTENT_ERASED" });
    const legacy = await createLegacyStoryRun(database.pool, QUESTION, `legacy:${randomUUID()}`);
    const fake = { content: { v: 1, keyId: "k", nonce: "AAAAAAAAAAAAAAAA", tag: "AAAAAAAAAAAAAAAAAAAAAA==", ct: "YQ==" }, attestation: "0".repeat(64) };
    expect(await sqlError(() => rawRecord(legacy, { source: "MENU", width: 3, path_count: 1, chosen_by: "PERSON", carry_on_to_report: false, ...fake },
      [{ path_id: "b1", path_no: 1, author: "AI_SUGGESTION", viewpoint_count: 1, has_own_words: false, ...fake }])))
      .toMatchObject({ code: "22023", message: "WEB_EVIDENCE_ENCRYPTION_REQUIRED" });
    const runId = await debate();
    const [one, two] = [await rawPath(runId, 1), await rawPath(runId, 2)];
    for (const paths of [[one], [two, one], [one, { ...two, path_id: "b1" }], [one, { ...two, path_no: 1 }]]) {
      expect(await sqlError(async () => rawRecord(runId, await rawSet(runId), paths))).toMatchObject({ code: "22023", message: "START_PATHS_INVALID" });
    }
    // A table rule: the person's own view without their words, and more paths than How wide allows.
    expect((await sqlError(async () => rawRecord(runId, await rawSet(runId), [one, { ...two, author: "PERSON_OWN_VIEW" }]))).code).toBe("23514");
    expect((await sqlError(async () => rawRecord(runId, await rawSet(runId, { width: 1 }), [one, two]))).code).toBe("23514");
    expect(await store.readStartPathIds(runId)).toBeNull();
  });

  it("no row is updated, deleted or truncated, and no role reads a table; the definers follow debateai_runtime", async () => {
    const runId = await withSet({}, false);
    for (const table of ["core.start_path_set", "core.start_path"]) {
      expect((await sqlError(() => database.pool.query(`DELETE FROM ${table} WHERE run_id=$1`, [runId]))).code).toBe("55000");
      expect((await sqlError(() => database.pool.query(`TRUNCATE ${table} CASCADE`))).code).toBe("55000");
    }
    // Every role but the superusers (the migrator owns the tables) and PostgreSQL's own pg_ roles, so the runner's own login (a member of
    // debateai_runtime) is checked as well as every role a later grant could reach.
    const signatures = ["core.record_start_paths(uuid,jsonb,jsonb)", "core.read_start_paths(uuid)", "core.read_start_path_ids(uuid)",
      "core.record_carry_on_due(uuid)", "core.claim_carry_on_due(integer)", "core.read_carry_on_begun(integer)", "core.record_carry_on_done(uuid)"];
    const rows = (await database.pool.query<{ role: string; target: string; kind: "table" | "function"; held: boolean; runtime: boolean }>(`
      WITH roles AS (SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname !~ '^pg_'
        AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'core.start_path_set'::regclass))
      SELECT roles.rolname AS role, f.name AS target, 'function' AS kind, has_function_privilege(roles.rolname, f.name, 'EXECUTE') AS held,
        pg_has_role(roles.rolname, 'debateai_runtime', 'USAGE') AS runtime
      FROM roles CROSS JOIN unnest($1::text[]) AS f(name)
      UNION ALL
      SELECT roles.rolname, t.relation, 'table', has_table_privilege(roles.rolname, t.relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'), false
      FROM roles CROSS JOIN unnest(ARRAY['core.start_path_set','core.start_path','core.carry_on_mark']) AS t(relation)`, [signatures])).rows;
    const runnerLogin = decodeURIComponent(new URL(logins!.url("RUNNER_DATABASE_URL")).username);
    expect(rows.filter((row) => row.kind === "function" && row.role === runnerLogin && row.runtime && row.held)).toHaveLength(signatures.length);
    for (const row of rows) {
      expect(row.held, `${row.role} ${row.target}`).toBe(row.kind === "function" && row.runtime);
    }
  });
});

describe("the carry-on marks", () => {
  it("DUE only when the person asked for it at Start", async () => {
    const asked = await withSet({ carryOnToReport: true });
    expect(await store.recordCarryOnDue(asked)).toBe("RECORDED");
    expect(await store.recordCarryOnDue(asked)).toBe("ALREADY");
    expect(await store.recordCarryOnDue(await withSet())).toBe("NOT_ASKED");
    expect(await store.recordCarryOnDue(await withSet({ source: "DIG_PICKS", carryOnToReport: true, menu: null }))).toBe("NOT_ASKED");
    expect(await store.recordCarryOnDue(await debate())).toBe("NOT_ASKED");
    // Claimed and closed here, so the later cases start from no open mark.
    expect((await store.claimCarryOnDue(10)).map((due) => due.runId)).toEqual([asked]);
    expect(await store.recordCarryOnDone(asked)).toBe("RECORDED");
  });

  it("claims a DUE debate once, even with two callers at once, with its owner, user and identity session; BEGUN until DONE", async () => {
    const first = await withSet({ carryOnToReport: true }, true);
    const [claimed] = await store.claimCarryOnDue(10);
    expect(claimed).toMatchObject({ runId: first, ownerRef: owner.ownerRef, userId: owner.userId, identitySessionId: owner.sessionId });
    expect(claimed!.begunAt).toBeInstanceOf(Date);
    expect(await store.claimCarryOnDue(10)).toEqual([]);
    const second = await withSet({ carryOnToReport: true }, true);
    const both = await Promise.all([store.claimCarryOnDue(10), store.claimCarryOnDue(10)]);
    expect(both.flat().map((due) => due.runId)).toEqual([second]);
    expect((await store.readCarryOnBegun(10)).map((due) => due.runId)).toEqual([first, second]);
    expect(await store.recordCarryOnDone(first)).toBe("RECORDED");
    expect(await store.recordCarryOnDone(first)).toBe("ALREADY");
    expect((await store.readCarryOnBegun(10)).map((due) => due.runId)).toEqual([second]);
    expect(await store.recordCarryOnDone(second)).toBe("RECORDED");
    expect(await store.recordCarryOnDone(await withSet({ carryOnToReport: true }, true))).toBe("NOT_BEGUN");
    // That last one is DUE: the next claim takes it, and it is closed for the cases below.
    const [last] = await store.claimCarryOnDue(10);
    expect(await store.recordCarryOnDone(last!.runId)).toBe("RECORDED");
  });

  it("a caller that loses the race for a debate returns nothing for it, even when both callers are inside the claim at once", async () => {
    const raced = await withSet({ carryOnToReport: true }, true);
    const first = await database.pool.connect();
    try {
      await first.query("BEGIN");
      expect((await first.query<{ due: Array<{ run_id: string }> }>("SELECT core.claim_carry_on_due(10) AS due")).rows[0]!.due
        .map((due) => due.run_id)).toEqual([raced]);
      // The store's claim reads the debate as unclaimed (the first BEGUN is not committed) and waits on that BEGUN row.
      const second = store.claimCarryOnDue(10);
      let waiting = 0;
      for (let tries = 0; tries < 200 && waiting === 0; tries += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 25); });
        waiting = (await database.pool.query<{ waiting: number }>(`SELECT count(*)::int AS waiting FROM pg_stat_activity
          WHERE wait_event_type = 'Lock' AND query LIKE '%claim_carry_on_due%' AND pid <> pg_backend_pid()`)).rows[0]!.waiting;
      }
      expect(waiting).toBe(1);
      await first.query("COMMIT");
      expect(await second).toEqual([]);
    } finally {
      first.release();
    }
    expect(await store.recordCarryOnDone(raced)).toBe("RECORDED");
  });

  it("a small page is never filled by debates the claim leaves out: Free debates still waiting, and live debates ahead of a dead one", async () => {
    // An older DUE debate waits for its Free publication; a page of one still claims the newer debate.
    const waiting = await withSet({ carryOnToReport: true });
    expect((await database.pool.query("SELECT identity.record_free_public_ask($1,$2) AS outcome", [owner.ownerRef, waiting])).rows[0].outcome).toBe("RECORDED");
    expect(await store.recordCarryOnDue(waiting)).toBe("RECORDED");
    const ready = await withSet({ carryOnToReport: true }, true);
    expect((await store.claimCarryOnDue(1)).map((due) => due.runId)).toEqual([ready]);
    // An older BEGUN debate is live, a newer one lost its binding: a claim of one still closes the dead one.
    const dead = await withSet({ carryOnToReport: true }, true);
    expect((await store.claimCarryOnDue(1)).map((due) => due.runId)).toEqual([dead]);
    await seeded([["DELETE FROM identity.run_execution_binding WHERE run_id=$1", [dead]]]);
    expect(await store.claimCarryOnDue(1)).toEqual([]);
    expect(await store.recordCarryOnDone(dead)).toBe("ALREADY");
    expect(await store.recordCarryOnDone(ready)).toBe("RECORDED");
    expect((await database.pool.query("SELECT identity.refuse_free_publication($1) AS outcome", [waiting])).rows[0].outcome).toBe("RECORDED");
    expect((await store.claimCarryOnDue(1)).map((due) => due.runId)).toEqual([waiting]);
    expect(await store.recordCarryOnDone(waiting)).toBe("RECORDED");
  });

  it("a debate whose binding is gone is closed by the claim, never handed out, and dead debates never crowd the BEGUN page", async () => {
    const gone = await withSet({ carryOnToReport: true }, true);
    await seeded([["DELETE FROM identity.run_execution_binding WHERE run_id=$1", [gone]]]);
    expect(await store.claimCarryOnDue(10)).toEqual([]);
    expect(await store.readCarryOnBegun(10)).toEqual([]);
    expect(await store.recordCarryOnDone(gone)).toBe("ALREADY");
    // Two claimed debates lose their binding after the claim; a third, newer, stays live. A page of two still holds the live one.
    const dead = [await withSet({ carryOnToReport: true }, true), await withSet({ carryOnToReport: true }, true)];
    const live = await withSet({ carryOnToReport: true }, true);
    expect((await store.claimCarryOnDue(10)).map((due) => due.runId)).toEqual([...dead, live]);
    await seeded(dead.map((runId) => ["DELETE FROM identity.run_execution_binding WHERE run_id=$1", [runId]] as const));
    expect((await store.readCarryOnBegun(2)).map((due) => due.runId)).toEqual([live]);
    // The next claim closes the dead ones.
    expect(await store.claimCarryOnDue(10)).toEqual([]);
    for (const runId of dead) expect(await store.recordCarryOnDone(runId)).toBe("ALREADY");
    expect(await store.recordCarryOnDone(live)).toBe("RECORDED");
  });

  it("waits for an undecided Free publication, then claims after it is refused or published", async () => {
    const refused = await withSet({ carryOnToReport: true });
    const published = await withSet({ carryOnToReport: true });
    for (const runId of [refused, published]) {
      expect((await database.pool.query("SELECT identity.record_free_public_ask($1,$2) AS outcome", [owner.ownerRef, runId])).rows[0].outcome).toBe("RECORDED");
      expect(await store.recordCarryOnDue(runId)).toBe("RECORDED");
    }
    expect(await store.claimCarryOnDue(10)).toEqual([]);
    expect((await database.pool.query("SELECT identity.refuse_free_publication($1) AS outcome", [refused])).rows[0].outcome).toBe("RECORDED");
    expect((await store.claimCarryOnDue(10)).map((due) => due.runId)).toEqual([refused]);
    await database.pool.query("SELECT identity.mark_free_public_published($1,$2)", [published, randomUUID()]);
    expect((await store.claimCarryOnDue(10)).map((due) => due.runId)).toEqual([published]);
    for (const runId of [refused, published]) expect(await store.recordCarryOnDone(runId)).toBe("RECORDED");
  });

  it("refuses a limit outside 1..50, and no mark is updated or deleted", async () => {
    for (const limit of [0, 51]) {
      await expect(store.claimCarryOnDue(limit)).rejects.toMatchObject({ code: "22023", message: "CARRY_ON_LIMIT_INVALID" });
      await expect(store.readCarryOnBegun(limit)).rejects.toMatchObject({ code: "22023", message: "CARRY_ON_LIMIT_INVALID" });
    }
    const runId = await withSet({ carryOnToReport: true }, true);
    expect((await sqlError(() => database.pool.query("UPDATE core.carry_on_mark SET recorded_at = now() WHERE run_id=$1", [runId]))).code).toBe("55000");
    expect((await sqlError(() => database.pool.query("DELETE FROM core.carry_on_mark WHERE run_id=$1", [runId]))).code).toBe("55000");
  });
});
