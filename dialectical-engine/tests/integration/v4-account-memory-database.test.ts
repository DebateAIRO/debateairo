import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0130 on real PostgreSQL (owner rulings N7 and N11, 2026-10-29): the V4 account memory. The API's own role
 * (debateai_billing_runtime) saves and reads the reading level, the last visit of a debate it owns and the dig links
 * between its own debates; every write is validated before any read; the shared runtime role reaches none of it; the
 * tables are never read directly; the export worker reads the account's rows behind the export lease; deleting the
 * account (what 0110's erasure finally does) removes every row.
 */
let database: TestDatabase;
let api: Pool;
let shared: Pool;
let worker: Pool;
let sequence = 9_000_000;

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
async function account(state = "active"): Promise<Account> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,$4,now())`, [userId, createHash("sha256").update(userId).digest(), `memory-${userId}`, state]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef };
}
/** A run whose latest ownership event names `owner`. Only the event is seeded: 0130 reads nothing else of the run. */
async function ownedRun(owner: Account): Promise<string> {
  const runId = randomUUID();
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    await seed.query("INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner.ownerRef, ++sequence]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
  return runId;
}
const saveLevel = (pool: Pool, owner: string | null, level: string | null) =>
  pool.query<{ level: string }>("SELECT identity.save_page_reading_level($1,$2) AS level", [owner, level]);
const readLevel = async (pool: Pool, owner: string) =>
  (await pool.query<{ level: string | null }>("SELECT identity.read_page_reading_level($1) AS level", [owner])).rows[0]!.level;
const recordVisit = async (pool: Pool, owner: string, run: string, items: unknown) =>
  (await pool.query<{ seen_at: Date | null }>("SELECT identity.record_debate_last_visit($1,$2,$3::jsonb) AS seen_at",
    [owner, run, JSON.stringify(items)])).rows[0]!.seen_at;
const readVisit = async (pool: Pool, owner: string, run: string) =>
  (await pool.query<{ owned: boolean; seen_at: Date | null; items: unknown }>("SELECT * FROM identity.read_debate_last_visit($1,$2)", [owner, run])).rows;
const recordDig = async (pool: Pool, owner: string, parent: string | null, child: string | null, places: unknown, mode: string | null) =>
  (await pool.query<{ outcome: string }>("SELECT identity.record_dig_link($1,$2,$3,$4::text[],$5) AS outcome", [owner, parent, child, places, mode])).rows[0]!.outcome;
const readDigs = async (pool: Pool, owner: string, run: string) =>
  (await pool.query<{ links: unknown }>("SELECT identity.read_dig_links($1,$2) AS links", [owner, run])).rows[0]!.links;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE memory_api LOGIN PASSWORD 'memory-api-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE memory_shared LOGIN PASSWORD 'memory-shared-test-only' IN ROLE debateai_runtime");
  await database.pool.query("CREATE ROLE memory_worker LOGIN PASSWORD 'memory-worker-test-only' IN ROLE debateai_data_export_worker");
  api = loginPool("memory_api", "memory-api-test-only");
  shared = loginPool("memory_shared", "memory-shared-test-only");
  worker = loginPool("memory_worker", "memory-worker-test-only");
  expect((await api.query("SELECT current_user AS name")).rows[0].name).toBe("memory_api");
}, 300_000);

afterAll(async () => {
  await Promise.all([api?.end(), shared?.end(), worker?.end()]);
  await database?.stop();
});

describe("0130 the reading level", () => {
  it("D1 the API's role saves and reads the account's level; the last choice wins", async () => {
    const person = await account();
    expect(await readLevel(api, person.ownerRef)).toBeNull();
    expect((await saveLevel(api, person.ownerRef, "expert")).rows[0]!.level).toBe("expert");
    expect((await saveLevel(api, person.ownerRef, "plain")).rows[0]!.level).toBe("plain");
    expect(await readLevel(api, person.ownerRef)).toBe("plain");
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.page_reading_level WHERE owner_ref=$1", [person.ownerRef])).rows[0].n).toBe(1);
  });

  it("D2 refuses a level that is not one of the three, and an account that is not active", async () => {
    const person = await account();
    for (const level of ["Plain", "basic", "", null]) {
      expect(await sqlError(() => saveLevel(api, person.ownerRef, level))).toMatchObject({ code: "22023", message: "PAGE_READING_LEVEL_INVALID" });
    }
    const pending = await account("pending_verification");
    expect(await sqlError(() => saveLevel(api, pending.ownerRef, "plain"))).toMatchObject({ code: "22023", message: "PAGE_MEMORY_ACCOUNT_INVALID" });
    expect(await sqlError(() => saveLevel(api, randomUUID(), "plain"))).toMatchObject({ code: "22023", message: "PAGE_MEMORY_ACCOUNT_INVALID" });
  });
});

describe("0130 the last visit of a debate", () => {
  it("D3 reads nothing before a first visit, then the saved snapshot; a later save replaces it", async () => {
    const person = await account();
    const run = await ownedRun(person);
    expect(await readVisit(api, person.ownerRef, run)).toEqual([{ owned: true, seen_at: null, items: null }]);
    const first = await recordVisit(api, person.ownerRef, run, { "point:n-1": "SURE", "path:p1": "HELD_UP" });
    expect(first).toBeInstanceOf(Date);
    expect(await readVisit(api, person.ownerRef, run)).toEqual([{ owned: true, seen_at: first, items: { "point:n-1": "SURE", "path:p1": "HELD_UP" } }]);
    const second = await recordVisit(api, person.ownerRef, run, { "dig:6f1c": "DONE", "open:p:n-1": "dug" });
    expect(second!.getTime()).toBeGreaterThanOrEqual(first!.getTime());
    expect((await readVisit(api, person.ownerRef, run))[0]!.items).toEqual({ "dig:6f1c": "DONE", "open:p:n-1": "dug" });
  });

  it("D4 another account's debate is neither read nor written", async () => {
    const owner = await account();
    const stranger = await account();
    const run = await ownedRun(owner);
    await recordVisit(api, owner.ownerRef, run, { "point:n-1": "SURE" });
    expect(await readVisit(api, stranger.ownerRef, run)).toEqual([{ owned: false, seen_at: null, items: null }]);
    expect(await recordVisit(api, stranger.ownerRef, run, { "point:n-1": "DIDNT_HOLD" })).toBeNull();
    expect((await readVisit(api, owner.ownerRef, run))[0]!.items).toEqual({ "point:n-1": "SURE" });
    // A run with no ownership event at all, and an account that is no longer active, own nothing.
    expect(await readVisit(api, owner.ownerRef, randomUUID())).toEqual([{ owned: false, seen_at: null, items: null }]);
    const closing = await account();
    const closingRun = await ownedRun(closing);
    await database.pool.query(`UPDATE identity."user" SET state='suspended' WHERE user_id=$1`, [closing.userId]);
    expect(await recordVisit(api, closing.ownerRef, closingRun, { "point:n-1": "SURE" })).toBeNull();
  });

  it("D5 refuses a snapshot that is not a small object of map ids and state words, before any ownership read", async () => {
    const person = await account();
    const run = await ownedRun(person);
    const tooMany = Object.fromEntries(Array.from({ length: 513 }, (_, at) => [`point:n-${at}`, "SURE"]));
    for (const items of [[], "SURE", { "question:n-1": "SURE" }, { "point:": "SURE" }, { "point:has space": "SURE" },
      { "point:n-1": "sure-ish" }, { "point:n-1": 3 }, { "point:n-1": "" }, { [`point:${"x".repeat(151)}`]: "SURE" }, tooMany]) {
      expect(await sqlError(() => recordVisit(api, person.ownerRef, run, items)), JSON.stringify(items).slice(0, 60))
        .toMatchObject({ code: "22023", message: "DEBATE_VISIT_INVALID" });
    }
    // The cap is 512 entries: exactly 512 is kept.
    expect(await recordVisit(api, person.ownerRef, run, Object.fromEntries(Object.entries(tooMany).slice(0, 512)))).toBeInstanceOf(Date);
    // The same refusal for a debate that is not the caller's: validation runs first.
    expect(await sqlError(() => recordVisit(api, randomUUID(), randomUUID(), []))).toMatchObject({ code: "22023", message: "DEBATE_VISIT_INVALID" });
  });
});

describe("0130 the dig links", () => {
  it("D6 records a dig between two of the account's debates once, and reads it from both ends", async () => {
    const person = await account();
    const parent = await ownedRun(person);
    const first = await ownedRun(person);
    const second = await ownedRun(person);
    expect(await recordDig(api, person.ownerRef, parent, first, ["p:n-1", "o:0"], "quick")).toBe("RECORDED");
    // Sent again (a retry): the same link, still recorded; the first places and mode stay.
    expect(await recordDig(api, person.ownerRef, parent, first, ["w"], "thorough")).toBe("RECORDED");
    expect(await recordDig(api, person.ownerRef, parent, second, [], "thorough")).toBe("RECORDED");
    const fromParent = await readDigs(api, person.ownerRef, parent) as { parent: unknown; children: Array<Record<string, unknown>> };
    expect(fromParent.parent).toBeNull();
    expect(fromParent.children.map(({ created_at: _at, ...link }) => link)).toEqual([
      { parent_run_id: parent, child_run_id: first, places: ["p:n-1", "o:0"], mode: "quick" },
      { parent_run_id: parent, child_run_id: second, places: [], mode: "thorough" }
    ]);
    expect(typeof fromParent.children[0]!.created_at).toBe("string");
    const fromChild = await readDigs(api, person.ownerRef, first) as { parent: Record<string, unknown>; children: unknown[] };
    expect(fromChild.parent).toMatchObject({ parent_run_id: parent, child_run_id: first, places: ["p:n-1", "o:0"], mode: "quick" });
    expect(fromChild.children).toEqual([]);
  });

  it("D7 a dig already linked elsewhere is a CONFLICT; a debate of another account is NOT_OWNED; reads of it are null", async () => {
    const person = await account();
    const stranger = await account();
    const parent = await ownedRun(person);
    const other = await ownedRun(person);
    const child = await ownedRun(person);
    const theirs = await ownedRun(stranger);
    expect(await recordDig(api, person.ownerRef, parent, child, [], "quick")).toBe("RECORDED");
    expect(await recordDig(api, person.ownerRef, other, child, [], "quick")).toBe("CONFLICT");
    expect(await recordDig(api, person.ownerRef, parent, theirs, [], "quick")).toBe("NOT_OWNED");
    expect(await recordDig(api, person.ownerRef, theirs, child, [], "quick")).toBe("NOT_OWNED");
    expect(await recordDig(api, stranger.ownerRef, theirs, child, [], "quick")).toBe("NOT_OWNED");
    expect(await readDigs(api, stranger.ownerRef, parent)).toBeNull();
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.dig_link WHERE child_run_id=ANY($1::uuid[])", [[child, theirs]])).rows[0].n).toBe(1);
  });

  it("D8 refuses a missing or repeated id, too many or malformed places, and an unknown mode", async () => {
    const person = await account();
    const parent = await ownedRun(person);
    const child = await ownedRun(person);
    for (const [from, to, places, mode] of [
      [parent, parent, [], "quick"], [null, child, [], "quick"], [parent, null, [], "quick"],
      [parent, child, Array.from({ length: 17 }, (_, at) => `o:${at}`), "quick"], [parent, child, ["has space"], "quick"],
      [parent, child, [""], "quick"], [parent, child, ["x".repeat(161)], "quick"], [parent, child, null, "quick"],
      [parent, child, [], "deep"], [parent, child, [], null]
    ] as const) {
      expect(await sqlError(() => recordDig(api, person.ownerRef, from, to, places, mode)), `${String(mode)} ${JSON.stringify(places)}`)
        .toMatchObject({ code: "22023", message: "DIG_LINK_INVALID" });
    }
  });
});

describe("0130 who may reach it", () => {
  it("D9 the shared runtime role calls none of the functions, and no API role reads a table directly", async () => {
    const person = await account();
    const run = await ownedRun(person);
    for (const statement of [
      "SELECT identity.read_page_reading_level($1)", "SELECT identity.save_page_reading_level($1,'plain')",
      "SELECT * FROM identity.read_debate_last_visit($1,$1)", "SELECT identity.record_debate_last_visit($1,$1,'{}'::jsonb)",
      "SELECT identity.read_dig_links($1,$1)", "SELECT identity.record_dig_link($1,$1,$1,'{}'::text[],'quick')",
      "SELECT identity.page_memory_run_owned($1,$1)", "SELECT identity.read_data_export_page_memory($1,$1)"
    ]) {
      expect(await sqlError(() => shared.query(statement, [person.ownerRef])), statement).toMatchObject({ code: "42501" });
    }
    for (const table of ["identity.page_reading_level", "identity.debate_last_visit", "identity.dig_link"]) {
      expect(await sqlError(() => api.query(`SELECT count(*) FROM ${table}`)), table).toMatchObject({ code: "42501" });
      expect(await sqlError(() => worker.query(`SELECT count(*) FROM ${table}`)), table).toMatchObject({ code: "42501" });
    }
    // The API's role may not call the private helper or the export reader either.
    expect(await sqlError(() => api.query("SELECT identity.page_memory_run_owned($1,$2)", [person.ownerRef, run]))).toMatchObject({ code: "42501" });
    expect(await sqlError(() => api.query("SELECT identity.read_data_export_page_memory($1,$2)", [randomUUID(), randomUUID()]))).toMatchObject({ code: "42501" });
  });

  it("D10 the export worker reads the account's rows behind its lease; visit items leave as item/word pairs", async () => {
    const person = await account();
    const other = await account();
    const parent = await ownedRun(person);
    const child = await ownedRun(person);
    await saveLevel(api, person.ownerRef, "background");
    await recordVisit(api, person.ownerRef, parent, { "point:n-2": "STILL_ARGUED", "dig:x": "RUNNING" });
    await recordDig(api, person.ownerRef, parent, child, ["w"], "thorough");
    await saveLevel(api, other.ownerRef, "expert");
    const exportId = randomUUID();
    const lease = randomUUID();
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, person.userId, randomUUID(), lease]);
    const memory = (await worker.query<{ m: Record<string, unknown> }>("SELECT identity.read_data_export_page_memory($1,$2) AS m", [exportId, lease])).rows[0]!.m;
    expect(Object.keys(memory).sort()).toEqual(["debate_visits", "dig_links", "page_reading_level"]);
    expect(memory.page_reading_level).toMatchObject({ reading_level: "background" });
    expect(memory.debate_visits).toEqual([{ run_id: parent, seen_at: expect.any(String),
      items: [{ item: "dig:x", word: "RUNNING" }, { item: "point:n-2", word: "STILL_ARGUED" }] }]);
    expect(memory.dig_links).toEqual([{ parent_run_id: parent, child_run_id: child, places: ["w"], mode: "thorough", created_at: expect.any(String) }]);
    expect(await sqlError(() => worker.query("SELECT identity.read_data_export_page_memory($1,$2)", [exportId, randomUUID()])))
      .toMatchObject({ code: "P0001", message: "DATA_EXPORT_LEASE_INVALID" });
    // An account with nothing saved reads empty lists and no level.
    const empty = await account();
    const emptyExport = randomUUID();
    await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
      VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [emptyExport, empty.userId, randomUUID(), lease]);
    expect((await worker.query("SELECT identity.read_data_export_page_memory($1,$2) AS m", [emptyExport, lease])).rows[0].m)
      .toEqual({ page_reading_level: null, debate_visits: [], dig_links: [] });
  });

  it("D11 deleting the account (erasure's last step) removes its level, visits and dig links", async () => {
    const person = await account();
    const keeper = await account();
    const parent = await ownedRun(person);
    const child = await ownedRun(person);
    const kept = await ownedRun(keeper);
    await saveLevel(api, person.ownerRef, "expert");
    await recordVisit(api, person.ownerRef, parent, { "point:n-1": "SURE" });
    await recordDig(api, person.ownerRef, parent, child, [], "quick");
    await saveLevel(api, keeper.ownerRef, "plain");
    await recordVisit(api, keeper.ownerRef, kept, { "point:n-1": "SURE" });
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [person.userId]);
    const left = async (owner: string) => (await database.pool.query<{ n: number }>(`SELECT
      (SELECT count(*) FROM identity.page_reading_level WHERE owner_ref=$1) + (SELECT count(*) FROM identity.debate_last_visit WHERE owner_ref=$1)
      + (SELECT count(*) FROM identity.dig_link WHERE owner_ref=$1) AS n`, [owner])).rows[0]!.n;
    expect(Number(await left(person.ownerRef))).toBe(0);
    expect(Number(await left(keeper.ownerRef))).toBe(2);
  });
});
