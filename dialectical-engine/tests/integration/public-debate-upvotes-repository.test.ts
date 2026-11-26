// tests/integration/public-debate-upvotes-repository.test.ts
// Migration 0193 through the database package, on real PostgreSQL: the upvote repository casts, withdraws and reads an account's own
// upvotes on the API's request login inside that account's own request, as a route runs it, and the public list's read carries each
// listed debate's count. A debate is made public and private again with seeded rows. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type AuditContextHasher } from "../../packages/crypto/src/index.js";
import { migrate, PostgresPublicDebateUpvoteRepository, PostgresPublicationRepository, type Pool } from "@debateai/db";
import { inAccountRequest, provisionRlsLogins, seedSessionAccount, type RlsLogins, type RlsTestAccount } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const HASHER = Object.freeze({ hashSourceIp: async () => "33".repeat(32), hashUserAgent: async () => "44".repeat(32) }) as unknown as AuditContextHasher;
const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
let database: TestDatabase;
let logins: RlsLogins;
/** The API's request login with its system twin as target, as main.ts builds `pool`. */
let request: Pool;
let upvotes: PostgresPublicDebateUpvoteRepository;
let publications: PostgresPublicationRepository;
let sequence = 9_930_000;

const person = (label: string): Promise<RlsTestAccount> => seedSessionAccount(database.pool, `upvote-${label}`);
/** `fn` inside `who`'s own request (null: a request with no session). */
const asking = <T>(who: RlsTestAccount | null, fn: () => Promise<T>): Promise<T> => inAccountRequest(who?.token ?? null, fn);
const rows = async (ref: string): Promise<number> => (await database.pool.query<{ n: number }>(
  "SELECT count(*)::int AS n FROM identity.public_debate_upvote WHERE publication_ref=$1", [ref])).rows[0]!.n;
const refused = async (run: () => Promise<unknown>): Promise<unknown> => { try { await run(); return null; } catch (error) { return error; } };
const fakePool = (query: (...args: unknown[]) => unknown): Pool => ({ query }) as unknown as Pool;

async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
const pubEnvelope = (ref: string) => ({ v: 1, keyId: `publication-snapshot:${ref}:v1`, nonce: "AAAA", tag: "AAAA", ct: "YQ==" });
/** The debate made public under a new link, as the transition does: its snapshot and its PUBLISHED event. */
async function publish(runId: string): Promise<string> {
  const ref = randomUUID();
  await seeded([
    ["INSERT INTO core.publication_ref_tombstone (ref,ref_kind,created_at) VALUES ($1,'publication_ref',now())", [ref]],
    ["INSERT INTO serve.publication_snapshot (publication_ref,run_id,format_version,content_ciphertext,created_at) VALUES ($1,$2,1,$3::jsonb,now())",
      [ref, runId, JSON.stringify(pubEnvelope(ref))]],
    [`INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
      VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',now(),$5)`, [randomUUID(), runId, ref, randomUUID(), ++sequence]]]);
  return ref;
}
/** The debate made private again under that link, as the transition's unpublish writes it. */
async function unpublish(runId: string, ref: string): Promise<void> {
  await seeded([[`INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
      VALUES ($1,$2,$3,'PRIVATE',$4,2,'COPIES_MAY_PERSIST_V1',now(),$5)`, [randomUUID(), runId, ref, randomUUID(), ++sequence]]]);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  request = logins.apiPools().runtime;
  upvotes = new PostgresPublicDebateUpvoteRepository(request);
  publications = new PostgresPublicationRepository(request, HASHER);
}, 600_000);
afterAll(async () => { await logins?.end(); await database?.stop(); });

describe("PostgresPublicDebateUpvoteRepository on the API's request login", () => {
  it("cast answers CAST then ALREADY with the fresh count, and a person may upvote their own debate", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const ref = await publish(ana.runId);
    expect(await asking(dan, () => upvotes.cast(dan.ownerRef, ref))).toEqual({ outcome: "CAST", upvotes: 1 });
    expect(await asking(dan, () => upvotes.cast(dan.ownerRef, ref))).toEqual({ outcome: "ALREADY", upvotes: 1 });
    expect(await asking(ana, () => upvotes.cast(ana.ownerRef, ref))).toEqual({ outcome: "CAST", upvotes: 2 });
    expect(await rows(ref)).toBe(2);
  });
  it("withdraw answers WITHDRAWN then NONE with the fresh count, and still works, with a null count, once the debate is private", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const ref = await publish(ana.runId);
    await asking(ana, () => upvotes.cast(ana.ownerRef, ref));
    await asking(dan, () => upvotes.cast(dan.ownerRef, ref));
    expect(await asking(dan, () => upvotes.withdraw(dan.ownerRef, ref))).toEqual({ outcome: "WITHDRAWN", upvotes: 1 });
    expect(await asking(dan, () => upvotes.withdraw(dan.ownerRef, ref))).toEqual({ outcome: "NONE", upvotes: 1 });
    await unpublish(ana.runId, ref);
    expect(await asking(ana, () => upvotes.withdraw(ana.ownerRef, ref))).toEqual({ outcome: "WITHDRAWN", upvotes: null });
    expect(await rows(ref)).toBe(0);
  });
  it("cast answers NOT_PUBLIC with a null count for a guessed link and for a debate made private, and stores nothing", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const ref = await publish(ana.runId);
    await unpublish(ana.runId, ref);
    for (const target of [randomUUID(), ref]) {
      expect(await asking(dan, () => upvotes.cast(dan.ownerRef, target))).toEqual({ outcome: "NOT_PUBLIC", upvotes: null });
    }
    expect(await rows(ref)).toBe(0);
  });
  it("cast answers ACCOUNT_INVALID with a null count for an account that is not active, and stores nothing", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const ref = await publish(ana.runId);
    // The session still names the account (rls.context_user_id reads the session row only), so the owner check passes.
    await database.pool.query(`UPDATE identity."user" SET state='suspended' WHERE user_id=$1`, [dan.userId]);
    expect(await asking(dan, () => upvotes.cast(dan.ownerRef, ref))).toEqual({ outcome: "ACCOUNT_INVALID", upvotes: null });
    expect(await rows(ref)).toBe(0);
  });
  it("readOwn names the asked debates this account upvoted, sorted, whatever their state, and no one else's", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const [first, second] = [await publish(ana.runId), await publish(dan.runId)];
    await asking(dan, () => upvotes.cast(dan.ownerRef, first));
    await asking(dan, () => upvotes.cast(dan.ownerRef, second));
    await asking(ana, () => upvotes.cast(ana.ownerRef, first));
    await unpublish(dan.runId, second);
    const asked = [second, randomUUID(), first];
    expect(await asking(dan, () => upvotes.readOwn(dan.ownerRef, asked))).toEqual([first, second].sort());
    expect(await asking(ana, () => upvotes.readOwn(ana.ownerRef, asked))).toEqual([first]);
    expect(await asking(ana, () => upvotes.readOwn(ana.ownerRef, [second]))).toEqual([]);
  });
  it("another account's owner, and a request with no session, are refused by the database and the error comes back as it was", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const ref = await publish(ana.runId);
    for (const who of [dan, null]) {
      expect(await refused(() => asking(who, () => upvotes.cast(ana.ownerRef, ref)))).toMatchObject(MISMATCH);
      expect(await refused(() => asking(who, () => upvotes.withdraw(ana.ownerRef, ref)))).toMatchObject(MISMATCH);
      expect(await refused(() => asking(who, () => upvotes.readOwn(ana.ownerRef, [ref])))).toMatchObject(MISMATCH);
    }
    expect(await rows(ref)).toBe(0);
  });
});

describe("PostgresPublicDebateUpvoteRepository, the parts no database decides", () => {
  const [owner, ref] = [randomUUID(), randomUUID()];
  const over = (query: (...args: unknown[]) => unknown) => new PostgresPublicDebateUpvoteRepository(fakePool(query));
  it("readOwn with an empty list answers [] and sends nothing", async () => {
    const query = vi.fn();
    expect(await over(query).readOwn(owner, [])).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
  it("cast answers ACCOUNT_INVALID when the voter's key is gone (23503); withdraw does not; any other error is rethrown", async () => {
    const gone = Object.assign(new Error("violates foreign key constraint"), { code: "23503" });
    const invalid = Object.assign(new Error("PUBLIC_DEBATE_UPVOTE_INVALID"), { code: "22023" });
    expect(await over(async () => { throw gone; }).cast(owner, ref)).toEqual({ outcome: "ACCOUNT_INVALID", upvotes: null });
    await expect(over(async () => { throw gone; }).withdraw(owner, ref)).rejects.toBe(gone);
    await expect(over(async () => { throw invalid; }).cast(owner, ref)).rejects.toBe(invalid);
  });
});

describe("PostgresPublicationRepository.listPublicRefs with the counts", () => {
  it("carries the count of every listed debate, the same for every caller", async () => {
    const [ana, dan] = [await person("ana"), await person("dan")];
    const [voted, quiet] = [await publish(ana.runId), await publish(dan.runId)];
    await asking(ana, () => upvotes.cast(ana.ownerRef, voted));
    await asking(dan, () => upvotes.cast(dan.ownerRef, voted));
    const anonymous = await asking(null, () => publications.listPublicRefs(100, 0));
    expect(anonymous.refs).toEqual(expect.arrayContaining([voted, quiet]));
    expect(Object.keys(anonymous.upvotes).sort()).toEqual([...anonymous.refs].sort());
    expect(anonymous.upvotes[voted]).toBe(2);
    expect(anonymous.upvotes[quiet]).toBe(0);
    expect(Object.isFrozen(anonymous.upvotes)).toBe(true);
    expect(await asking(dan, () => publications.listPublicRefs(100, 0))).toEqual(anonymous);
    expect(await publications.listPublicRefs(100, 0)).toEqual(anonymous);
  });
  it("an empty page carries {} and asks for no counts", async () => {
    expect(await asking(null, () => publications.listPublicRefs(10, 1_000))).toMatchObject({ refs: [], upvotes: {} });
    const query = vi.fn(async () => ({ rows: [{ publication_ref: null, total: "3" }] }));
    expect(await new PostgresPublicationRepository(fakePool(query), HASHER).listPublicRefs(10, 50)).toEqual({ refs: [], total: 3, upvotes: {} });
    expect(query).toHaveBeenCalledTimes(1);
  });
  it("asks for the page's refs in one statement and keeps only the counts the database answered", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [{ publication_ref: a, total: "2" }, { publication_ref: b, total: "2" }] })
      .mockResolvedValueOnce({ rows: [{ value: [{ publication_ref: a, upvotes: 4 }] }] });
    expect(await new PostgresPublicationRepository(fakePool(query), HASHER).listPublicRefs(2, 0)).toEqual({ refs: [a, b], total: 2, upvotes: { [a]: 4 } });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1]).toEqual([expect.stringContaining("identity.read_public_debate_upvote_counts($1::uuid[])"), [[a, b]]]);
  });
});
