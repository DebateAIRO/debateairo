import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, type Pool } from "@debateai/db";
import {
  SavedQuestionAccountInvalidError,
  savedQuestionStoreFrom,
  type SavedQuestionStore
} from "../../apps/api/src/saved-questions/store.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * 0162 on real PostgreSQL (V4 start step, plan 2026-11-03 Task 39d; saved-questions spec 2026-11-04 §3.1, §3.14; owner answers S3 A, S4 A):
 * the questions a person has not started yet. The API's own role (debateai_billing_runtime) creates, saves, lists, reads and deletes the
 * account's rows; at most 20 per account; every part is an envelope naming the row's own key; the export worker reads them behind 0128's
 * lease; deleting the account (0110's finalize) removes them; no request role reads the table, and the shared runtime role calls nothing.
 * The envelopes are made up (their keyId is `saved-question:<row id>:v1`); no key is made here.
 */
let database: TestDatabase;
let api: Pool;
let shared: Pool;
let authorization: Pool;
let worker: Pool;
let erasure: Pool;
let store: SavedQuestionStore;

type SqlError = { code?: string | undefined; message?: string | undefined; constraint?: string | undefined };
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
    VALUES ($1,$2,'{}','{}','fixture-password',$3,$4,now())`, [userId, createHash("sha256").update(userId).digest(), `saved-${userId}`, state]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef };
}
type Envelope = Readonly<Record<string, unknown>>;
/** A made-up envelope under the row's own key name; `ct` is padded to `size` characters. */
const envelope = (id: string, size = 24, extra: Readonly<Record<string, unknown>> = {}): Envelope =>
  ({ v: 1, keyId: `saved-question:${id}:v1`, nonce: "bm9uY2Utbm9uY2U=", ct: "Y".repeat(size), tag: "dGFnLXRhZy10YWctdGFnLQ==", ...extra });
const create = async (pool: { query: Pool["query"] }, owner: string | null, id: string | null, title: unknown, content: unknown) =>
  (await pool.query<{ answer: unknown }>("SELECT identity.create_saved_question($1,$2,$3::jsonb,$4::jsonb) AS answer",
    [owner, id, JSON.stringify(title), JSON.stringify(content)])).rows[0]!.answer;
const save = async (pool: Pool, owner: string, id: string, revision: number, title: unknown, content: unknown) =>
  (await pool.query<{ answer: unknown }>("SELECT identity.save_saved_question($1,$2,$3,$4::jsonb,$5::jsonb) AS answer",
    [owner, id, revision, JSON.stringify(title), JSON.stringify(content)])).rows[0]!.answer;
const list = async (pool: Pool, owner: string, limit: number | null) =>
  (await pool.query<{ answer: Array<Record<string, unknown>> }>("SELECT identity.read_saved_questions($1,$2) AS answer", [owner, limit])).rows[0]!.answer;
const readOne = async (pool: Pool, owner: string, id: string) =>
  (await pool.query<{ answer: Record<string, unknown> | null }>("SELECT identity.read_saved_question($1,$2) AS answer", [owner, id])).rows[0]!.answer;
const remove = async (pool: Pool, owner: string, id: string) =>
  (await pool.query<{ answer: string }>("SELECT identity.delete_saved_question($1,$2) AS answer", [owner, id])).rows[0]!.answer;
const rows = async (owner: string) =>
  (await database.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM identity.saved_question WHERE owner_ref=$1", [owner])).rows[0]!.n;
async function fill(owner: string, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let at = 0; at < count; at += 1) {
    const id = randomUUID();
    expect(await create(api, owner, id, envelope(id), envelope(id))).toEqual({ outcome: "CREATED", revision: 1 });
    ids.push(id);
  }
  return ids;
}
async function leasedExport(userId: string): Promise<Readonly<{ exportId: string; lease: string }>> {
  const exportId = randomUUID();
  const lease = randomUUID();
  await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
    VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, userId, randomUUID(), lease]);
  return { exportId, lease };
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query("CREATE ROLE saved_api LOGIN PASSWORD 'saved-api-test-only' IN ROLE debateai_runtime,debateai_billing_runtime");
  await database.pool.query("CREATE ROLE saved_shared LOGIN PASSWORD 'saved-shared-test-only' IN ROLE debateai_runtime");
  await database.pool.query("CREATE ROLE saved_authorization LOGIN PASSWORD 'saved-authorization-test-only' IN ROLE debateai_authorization_runtime");
  await database.pool.query("CREATE ROLE saved_worker LOGIN PASSWORD 'saved-worker-test-only' IN ROLE debateai_data_export_worker");
  await database.pool.query("CREATE ROLE saved_erasure LOGIN PASSWORD 'saved-erasure-test-only' IN ROLE debateai_erasure_runtime");
  api = loginPool("saved_api", "saved-api-test-only");
  shared = loginPool("saved_shared", "saved-shared-test-only");
  authorization = loginPool("saved_authorization", "saved-authorization-test-only");
  worker = loginPool("saved_worker", "saved-worker-test-only");
  erasure = loginPool("saved_erasure", "saved-erasure-test-only");
  expect((await api.query("SELECT current_user AS name")).rows[0].name).toBe("saved_api");
  store = savedQuestionStoreFrom((text, values) => api.query(text, values));
}, 300_000);

afterAll(async () => {
  await Promise.all([api?.end(), shared?.end(), authorization?.end(), worker?.end(), erasure?.end()]);
  await database?.stop();
});

describe("0162 saves and revisions", () => {
  it("D1 create is revision 1; a save on the current revision is the next; a save on an old one answers the current revision", async () => {
    const person = await account();
    const id = randomUUID();
    expect(await create(api, person.ownerRef, id, envelope(id, 8), envelope(id, 40))).toEqual({ outcome: "CREATED", revision: 1 });
    expect(await save(api, person.ownerRef, id, 1, envelope(id, 9), envelope(id, 41))).toEqual({ outcome: "SAVED", revision: 2 });
    expect(await save(api, person.ownerRef, id, 1, envelope(id, 10), envelope(id, 42))).toEqual({ outcome: "REVISION", revision: 2 });
    const kept = await readOne(api, person.ownerRef, id);
    expect(Object.keys(kept!).sort()).toEqual(["content_ciphertext", "created_at", "revision", "saved_question_id", "title_ciphertext", "updated_at"]);
    expect(kept).toMatchObject({ saved_question_id: id, revision: 2, title_ciphertext: envelope(id, 9), content_ciphertext: envelope(id, 41) });
    expect(new Date(String(kept!.updated_at)).getTime()).toBeGreaterThan(new Date(String(kept!.created_at)).getTime());
    expect(await save(api, person.ownerRef, id, 2, envelope(id, 11), envelope(id, 43))).toEqual({ outcome: "SAVED", revision: 3 });
    // The same id twice, the account's own or another's, is refused.
    expect(await sqlError(() => create(api, person.ownerRef, id, envelope(id), envelope(id))))
      .toMatchObject({ code: "22023", message: "SAVED_QUESTION_ID_TAKEN" });
    const other = await account();
    expect(await sqlError(() => create(api, other.ownerRef, id, envelope(id), envelope(id))))
      .toMatchObject({ code: "22023", message: "SAVED_QUESTION_ID_TAKEN" });
    expect((await readOne(api, person.ownerRef, id))!.revision).toBe(3);
  });

  it("D2 another owner's id, like a missing one: GONE on save, NULL on read, GONE on delete; nothing of it changes", async () => {
    const owner = await account();
    const stranger = await account();
    const id = randomUUID();
    await create(api, owner.ownerRef, id, envelope(id), envelope(id));
    for (const target of [id, randomUUID()]) {
      expect(await save(api, stranger.ownerRef, target, 1, envelope(target), envelope(target))).toEqual({ outcome: "GONE" });
      expect(await readOne(api, stranger.ownerRef, target)).toBeNull();
      expect(await remove(api, stranger.ownerRef, target)).toBe("GONE");
    }
    expect(await readOne(api, owner.ownerRef, id)).toMatchObject({ revision: 1, title_ciphertext: envelope(id) });
    expect(await remove(api, owner.ownerRef, id)).toBe("DELETED");
    expect(await remove(api, owner.ownerRef, id)).toBe("GONE");
    expect(await readOne(api, owner.ownerRef, id)).toBeNull();
    expect(await save(api, owner.ownerRef, id, 1, envelope(id), envelope(id))).toEqual({ outcome: "GONE" });
  });

  it("D3 the list: the account's own, newest first, at most p_limit, and no content in it", async () => {
    const person = await account();
    const other = await account();
    const [first, second, third] = await fill(person.ownerRef, 3);
    await fill(other.ownerRef, 1);
    // Saving the first makes it the newest.
    expect(await save(api, person.ownerRef, first!, 1, envelope(first!, 30), envelope(first!))).toEqual({ outcome: "SAVED", revision: 2 });
    const all = await list(api, person.ownerRef, 20);
    expect(all.map((item) => item.saved_question_id)).toEqual([first, third, second]);
    for (const item of all) expect(Object.keys(item).sort()).toEqual(["created_at", "revision", "saved_question_id", "title_ciphertext", "updated_at"]);
    expect(all[0]).toMatchObject({ revision: 2, title_ciphertext: envelope(first!, 30) });
    expect((await list(api, person.ownerRef, 2)).map((item) => item.saved_question_id)).toEqual([first, third]);
    expect(await list(api, randomUUID(), 20)).toEqual([]);
  });
});

describe("0162 at most 20 per account (S3 A)", () => {
  it("D4 with 20 rows a create answers FULL and writes nothing", async () => {
    const person = await account();
    await fill(person.ownerRef, 20);
    const id = randomUUID();
    expect(await create(api, person.ownerRef, id, envelope(id), envelope(id))).toEqual({ outcome: "FULL" });
    expect(await rows(person.ownerRef)).toBe(20);
    expect((await database.pool.query("SELECT count(*)::int AS n FROM identity.saved_question WHERE saved_question_id=$1", [id])).rows[0].n).toBe(0);
    // A delete frees a place.
    const [oldest] = (await list(api, person.ownerRef, 20)).map((item) => String(item.saved_question_id)).reverse();
    expect(await remove(api, person.ownerRef, oldest!)).toBe("DELETED");
    expect(await create(api, person.ownerRef, id, envelope(id), envelope(id))).toEqual({ outcome: "CREATED", revision: 1 });
  });

  it("D5 two creates at once on 19 rows: one CREATED, one FULL, 20 rows", async () => {
    const person = await account();
    await fill(person.ownerRef, 19);
    const [a, b] = [randomUUID(), randomUUID()];
    // The first create holds the account's lock until its transaction ends: the second waits for it, then counts 20. Without the lock
    // it would count 19 (the first row is not committed yet) and write a 21st.
    const first = await api.connect();
    try {
      await first.query("BEGIN");
      expect(await create(first, person.ownerRef, a, envelope(a), envelope(a))).toEqual({ outcome: "CREATED", revision: 1 });
      let done = false;
      const second = create(api, person.ownerRef, b, envelope(b), envelope(b)).finally(() => { done = true; });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(done).toBe(false);
      await first.query("COMMIT");
      expect(await second).toEqual({ outcome: "FULL" });
    } catch (error) {
      await first.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { first.release(); }
    expect(await rows(person.ownerRef)).toBe(20);
    // Sent together, as two windows would: one is kept.
    const other = await account();
    await fill(other.ownerRef, 19);
    const [c, d] = [randomUUID(), randomUUID()];
    const answers = await Promise.all([create(api, other.ownerRef, c, envelope(c), envelope(c)), create(api, other.ownerRef, d, envelope(d), envelope(d))]);
    expect(answers.map((answer) => (answer as { outcome: string }).outcome).sort()).toEqual(["CREATED", "FULL"]);
    expect(await rows(other.ownerRef)).toBe(20);
  });
});

describe("0162 the envelopes", () => {
  it("D6 refuses 23514 a non-envelope, a sixth key, a key name that is not this row's own, a missing part and an oversized one", async () => {
    const person = await account();
    const other = randomUUID();
    const bad = (id: string): ReadonlyArray<readonly [string, unknown]> => [
      ["plain words", "Should the town build a second pier?"],
      ["an array", [envelope(id)]],
      ["a sixth key", envelope(id, 24, { aad: "x" })],
      ["the account key", envelope(id, 24, { keyId: `user-dek:${randomUUID()}` })],
      ["a debate's key", envelope(id, 24, { keyId: `run-content:${randomUUID()}:v1` })],
      ["another row's key", envelope(id, 24, { keyId: `saved-question:${other}:v1` })],
      ["a null key name", envelope(id, 24, { keyId: null })],
      ["a number for a part", envelope(id, 24, { ct: 7 })],
      ["version 2", envelope(id, 24, { v: 2 })],
      ["a missing part", { v: 1, keyId: `saved-question:${id}:v1`, nonce: "bm9uY2U=", ct: "Y" }]
    ];
    const id = randomUUID();
    for (const [what, value] of bad(id)) {
      expect(await sqlError(() => create(api, person.ownerRef, id, value, envelope(id))), `title ${what}`)
        .toMatchObject({ code: "23514", constraint: "saved_question_title_envelope" });
      expect(await sqlError(() => create(api, person.ownerRef, id, envelope(id), value)), `content ${what}`)
        .toMatchObject({ code: "23514", constraint: "saved_question_content_envelope" });
    }
    // The caps are on the stored size: a title past 2 KiB, a content past 896 KiB.
    expect(await sqlError(() => create(api, person.ownerRef, id, envelope(id, 2_048), envelope(id))))
      .toMatchObject({ code: "23514", constraint: "saved_question_title_envelope" });
    expect(await sqlError(() => create(api, person.ownerRef, id, envelope(id), envelope(id, 917_504))))
      .toMatchObject({ code: "23514", constraint: "saved_question_content_envelope" });
    expect(await rows(person.ownerRef)).toBe(0);
    // The largest legal content is kept; the same refusals hold on a save, and the row stays as it was.
    const largest = 917_504 - JSON.stringify(envelope(id, 0)).length - 64;
    expect(await create(api, person.ownerRef, id, envelope(id), envelope(id, largest))).toEqual({ outcome: "CREATED", revision: 1 });
    for (const [what, value] of bad(id)) {
      expect(await sqlError(() => save(api, person.ownerRef, id, 1, envelope(id), value)), `save ${what}`).toMatchObject({ code: "23514" });
    }
    expect(await readOne(api, person.ownerRef, id)).toMatchObject({ revision: 1 });
  });
});

describe("0162 the account", () => {
  it("D7 an account that is not active (suspended, as 0110's prepare leaves it) is refused on create and on save", async () => {
    const person = await account();
    const id = randomUUID();
    await create(api, person.ownerRef, id, envelope(id), envelope(id));
    await database.pool.query(`UPDATE identity."user" SET state='suspended' WHERE user_id=$1`, [person.userId]);
    const next = randomUUID();
    expect(await sqlError(() => create(api, person.ownerRef, next, envelope(next), envelope(next))))
      .toMatchObject({ code: "22023", message: "SAVED_QUESTION_ACCOUNT_INVALID" });
    expect(await sqlError(() => save(api, person.ownerRef, id, 1, envelope(id), envelope(id))))
      .toMatchObject({ code: "22023", message: "SAVED_QUESTION_ACCOUNT_INVALID" });
    for (const owner of [randomUUID(), null]) {
      expect(await sqlError(() => create(api, owner, next, envelope(next), envelope(next))))
        .toMatchObject({ code: "22023", message: "SAVED_QUESTION_ACCOUNT_INVALID" });
    }
    const pending = await account("pending_verification");
    expect(await sqlError(() => create(api, pending.ownerRef, next, envelope(next), envelope(next))))
      .toMatchObject({ code: "22023", message: "SAVED_QUESTION_ACCOUNT_INVALID" });
    expect(await readOne(api, person.ownerRef, id)).toMatchObject({ revision: 1 });
  });

  it("D8 deleting the identity.\"user\" row, as 0110's finalize does, removes the account's rows and no one else's", async () => {
    const person = await account();
    const keeper = await account();
    await fill(person.ownerRef, 3);
    await fill(keeper.ownerRef, 2);
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [person.userId]);
    expect(await rows(person.ownerRef)).toBe(0);
    expect(await rows(keeper.ownerRef)).toBe(2);
    expect(await sqlError(() => database.pool.query("TRUNCATE identity.saved_question"))).toMatchObject({ code: expect.any(String) });
    expect(await rows(keeper.ownerRef)).toBe(2);
  });
});

describe("0162 the export reader", () => {
  it("D9 answers every row of the leased export's account with both parts, oldest first, and [] when there is none; refused without the lease", async () => {
    const person = await account();
    const other = await account();
    const ids = await fill(person.ownerRef, 2);
    await save(api, person.ownerRef, ids[0]!, 1, envelope(ids[0]!, 31), envelope(ids[0]!, 32));
    await fill(other.ownerRef, 1);
    const { exportId, lease } = await leasedExport(person.userId);
    const exported = (await worker.query<{ e: Array<Record<string, unknown>> }>("SELECT identity.read_data_export_saved_questions($1,$2) AS e",
      [exportId, lease])).rows[0]!.e;
    expect(exported.map((item) => item.saved_question_id)).toEqual(ids);
    expect(Object.keys(exported[0]!).sort()).toEqual(["content_ciphertext", "created_at", "revision", "saved_question_id", "title_ciphertext", "updated_at"]);
    expect(exported[0]).toMatchObject({ revision: 2, title_ciphertext: envelope(ids[0]!, 31), content_ciphertext: envelope(ids[0]!, 32) });
    expect(await sqlError(() => worker.query("SELECT identity.read_data_export_saved_questions($1,$2)", [exportId, randomUUID()])))
      .toMatchObject({ code: "P0001", message: "DATA_EXPORT_LEASE_INVALID" });
    expect(await sqlError(() => worker.query("SELECT identity.read_data_export_saved_questions($1,$2)", [randomUUID(), lease])))
      .toMatchObject({ code: "P0001", message: "DATA_EXPORT_LEASE_INVALID" });
    const empty = await account();
    const none = await leasedExport(empty.userId);
    expect((await worker.query("SELECT identity.read_data_export_saved_questions($1,$2) AS e", [none.exportId, none.lease])).rows[0].e).toEqual([]);
  });
});

describe("0162 who may reach it", () => {
  it("D10 no request role reads the table; the shared runtime role, the authorization, export and erasure roles call no API function", async () => {
    const person = await account();
    for (const [who, pool] of [["runtime", shared], ["authorization", authorization], ["billing", api], ["export worker", worker], ["erasure", erasure]] as const) {
      expect(await sqlError(() => pool.query("SELECT count(*) FROM identity.saved_question")), who).toMatchObject({ code: "42501" });
    }
    const id = randomUUID();
    for (const pool of [shared, authorization, worker, erasure]) {
      for (const statement of [
        "SELECT identity.create_saved_question($1,$2,'{}'::jsonb,'{}'::jsonb)", "SELECT identity.save_saved_question($1,$2,1,'{}'::jsonb,'{}'::jsonb)",
        "SELECT identity.read_saved_questions($1,20)", "SELECT identity.read_saved_question($1,$2)", "SELECT identity.delete_saved_question($1,$2)"
      ]) {
        const values = statement.includes("$2") ? [person.ownerRef, id] : [person.ownerRef];
        expect(await sqlError(() => pool.query(statement, values)), statement).toMatchObject({ code: "42501" });
      }
    }
    // The API's role reaches the five, not the export reader; the shared runtime role and the erasure role not that either.
    for (const pool of [api, shared, erasure, authorization]) {
      expect(await sqlError(() => pool.query("SELECT identity.read_data_export_saved_questions($1,$2)", [randomUUID(), randomUUID()])))
        .toMatchObject({ code: "42501" });
    }
  });

  it("D11 p_limit outside 1..20 is refused 22023 SAVED_QUESTION_LIMIT_INVALID", async () => {
    const person = await account();
    await fill(person.ownerRef, 1);
    for (const limit of [0, 21, -1, null]) {
      expect(await sqlError(() => list(api, person.ownerRef, limit)), String(limit)).toMatchObject({ code: "22023", message: "SAVED_QUESTION_LIMIT_INVALID" });
    }
    expect(await list(api, person.ownerRef, 1)).toHaveLength(1);
    expect(await list(api, person.ownerRef, 20)).toHaveLength(1);
  });
});

describe("0162 the store through the API's pool", () => {
  it("D12 savedQuestionStoreFrom maps every answer to its typed result, and the account refusal to SavedQuestionAccountInvalidError", async () => {
    const person = await account();
    const id = randomUUID();
    const title = envelope(id, 12) as never;
    const content = envelope(id, 48) as never;
    expect(await store.create(person.ownerRef, id, title, content)).toEqual({ outcome: "CREATED", revision: 1 });
    expect(await store.save(person.ownerRef, id, 1, envelope(id, 13) as never, content)).toEqual({ outcome: "SAVED", revision: 2 });
    expect(await store.save(person.ownerRef, id, 1, title, content)).toEqual({ outcome: "REVISION", revision: 2 });
    expect(await store.save(person.ownerRef, randomUUID(), 1, title, content)).toEqual({ outcome: "GONE" });
    const [listed] = await store.list(person.ownerRef, 5);
    expect(listed).toMatchObject({ id, revision: 2, title: envelope(id, 13), content: null });
    expect(listed!.createdAt).toBeInstanceOf(Date);
    expect(listed!.updatedAt.getTime()).toBeGreaterThan(listed!.createdAt.getTime());
    const read = await store.read(person.ownerRef, id);
    expect(read).toMatchObject({ id, revision: 2, title: envelope(id, 13), content: envelope(id, 48) });
    expect(read!.createdAt.getTime()).toBe(listed!.createdAt.getTime());
    expect(await store.read(person.ownerRef, randomUUID())).toBeNull();
    expect(await store.remove(person.ownerRef, id)).toBe("DELETED");
    expect(await store.remove(person.ownerRef, id)).toBe("GONE");
    const full = await account();
    await fill(full.ownerRef, 20);
    const next = randomUUID();
    expect(await store.create(full.ownerRef, next, envelope(next) as never, envelope(next) as never)).toEqual({ outcome: "FULL" });
    expect(await store.list(full.ownerRef, 20)).toHaveLength(20);
    await database.pool.query(`UPDATE identity."user" SET state='suspended' WHERE user_id=$1`, [full.userId]);
    const kept = (await store.list(full.ownerRef, 1))[0]!;
    await expect(store.create(full.ownerRef, next, envelope(next) as never, envelope(next) as never)).rejects.toBeInstanceOf(SavedQuestionAccountInvalidError);
    await expect(store.save(full.ownerRef, kept.id, kept.revision, kept.title, envelope(kept.id) as never)).rejects.toBeInstanceOf(SavedQuestionAccountInvalidError);
    // Any other refusal is not the account's.
    const limit = await store.list(full.ownerRef, 0).then(() => null, (error: unknown) => error);
    expect(limit).not.toBeInstanceOf(SavedQuestionAccountInvalidError);
    expect(limit).toMatchObject({ code: "22023", message: "SAVED_QUESTION_LIMIT_INVALID" });
  });
});
