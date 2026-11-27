// tests/integration/public-vote-flow.test.ts
// Upvotes on public debates followed end to end through the API's own routes, built by buildApi on the product's own database logins over the real chain: cast, counted
// for every reader, taken back, kept under a hold, swept when the debate is gone for good, gone with a deleted account, and braked per account. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { OwnPublicVotesSchema, PublicDebateListSchema, PublicDebateSchema, PublicVoteAnswerSchema } from "@debateai/contract";
import { MemoryPublicationKeyStore, PublicationCipher, generateDek, loadKek } from "../../packages/crypto/src/index.js";
import { migrate, PostgresPublicationRepository, PostgresPublicDebateUpvoteRepository } from "@debateai/db";
import { ADMISSION_POLICY_REGISTER_ROW, admissionPolicyFromValue } from "@debateai/register";
import { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { buildApi, type AskApplication } from "../../apps/api/src/index.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import { TEST_APP_ORIGIN, testSessionApplication, testSessionHeaders, type TestHttpIdentity } from "../support/httpSession.js";
import { httpIdentityFor, loginApiPools, provisionRlsLogins, seedSessionAccount, type ApiTestPools, type RlsTestAccount } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const NAMES = ["ana", "ben", "cat", "dan", "eve", "fay", "gus"] as const;
type Name = (typeof NAMES)[number];
type Person = Readonly<{ account: RlsTestAccount; session: TestHttpIdentity }>;
type Debate = Readonly<{ ref: string; runId: string }>;
const LIST = "/v1/public/debates?limit=100&offset=0";
const NOT_FOUND = { error: "DEBATE_NOT_FOUND" };
const policy = admissionPolicyFromValue(ADMISSION_POLICY_REGISTER_ROW.value, ADMISSION_POLICY_REGISTER_ROW.sourceRef);
const publicationCipher = new PublicationCipher(new MemoryPublicationKeyStore(loadKek(generateDek())));
const who = {} as Record<Name, Person>;
let database: TestDatabase;
let pools: ApiTestPools;
let api: ReturnType<typeof buildApi>;
let now = new Date("2026-11-26T12:00:00.000Z");

async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
const EVENT = `INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
  VALUES ($1,$2,$3,$4,$5,2,$6,now(),ledger.allocate_sequence())`;
/** The run made public under a new link, as the transition writes it: a real snapshot under its own key, and the PUBLISHED event. */
async function publish(runId: string): Promise<Debate> {
  const [ref, at] = [randomUUID(), new Date()];
  const snapshot = PublicDebateSchema.parse({ public_ref: ref, author_pseudonym: "fixture", published_at: at.toISOString(), question: "Should Harbour Town build a second ferry pier?",
    answer: { terminal: "COMPONENTS_ONLY", verdict: null, verdict_available: false, confidence_band: null, summary_segments: [{ text: "The first answer." }], badges: [],
      residual_objections: [], reversal_point: "none", as_of: at.toISOString() } });
  const prepared = await publicationCipher.create(ref, runId);
  const content = prepared.encrypt(snapshot);
  prepared.close();
  await seeded([
    ["INSERT INTO core.publication_ref_tombstone (ref,ref_kind,created_at) VALUES ($1,'publication_ref',now())", [ref]],
    ["INSERT INTO serve.publication_snapshot (publication_ref,run_id,format_version,content_ciphertext,created_at) VALUES ($1,$2,1,$3::jsonb,$4)", [ref, runId, JSON.stringify(content), at]],
    [EVENT, [randomUUID(), runId, ref, "PUBLISHED", randomUUID(), "PUBLIC_INDEXED_V1"]]]);
  return { ref, runId };
}
/** A public debate on a run of its own: `author`'s, or a freshly seeded account's. */
const published = async (author?: RlsTestAccount): Promise<Debate> => publish((author ?? await seedSessionAccount(database.pool, "author")).runId);
const unpublish = (debate: Debate) => seeded([[EVENT, [randomUUID(), debate.runId, debate.ref, "PRIVATE", randomUUID(), "COPIES_MAY_PERSIST_V1"]]]);
/** 0150's log, as a staff step writes it: HIDE holds the debate for review, REPUBLISH lifts the hold. */
const review = (ref: string, revision: number, action: "HIDE" | "REPUBLISH") => seeded([[`INSERT INTO identity.public_review_event (publication_ref,revision,action,actor_staff_id,operation_id,request_sha256)
  VALUES ($1,$2,$3,$4,$5,$6)`, [ref, revision, action, randomUUID(), randomUUID(), "0".repeat(64)]]]);

const ownerOf = (name: Name): string => who[name].account.ownerRef;
const voteUrl = (ref: string): string => `/v1/public/debates/${ref}/vote`;
const put = (name: Name, ref: string) => api.inject({ method: "PUT", url: voteUrl(ref), headers: testSessionHeaders(who[name].session, true), payload: {} });
const del = (name: Name, ref: string) => api.inject({ method: "DELETE", url: voteUrl(ref), headers: testSessionHeaders(who[name].session, true) });
const own = (name: Name, refs: readonly string[]) => api.inject({ method: "GET", url: `/v1/account/public-debate-votes?refs=${refs.join(",")}`, headers: testSessionHeaders(who[name].session) });
const answered = (response: { json(): unknown }) => PublicVoteAnswerSchema.parse(response.json());
/** Every header of an answer but its clock, as one string: two answers that tell the same thing have the same one. */
const headersOf = (response: { headers: Record<string, unknown> }): string =>
  JSON.stringify(Object.entries(response.headers).filter(([name]) => name !== "date").sort(([a], [b]) => (a < b ? -1 : 1)));
const votedOf = (response: { json(): unknown }) => OwnPublicVotesSchema.parse(response.json()).voted;
/** What any visitor's read of the list shows for `ref`: its count, or null when the list does not show the debate. */
async function countOf(ref: string): Promise<number | null> {
  const answer = await api.inject({ method: "GET", url: LIST });
  expect(answer.statusCode).toBe(200);
  const item = PublicDebateListSchema.parse(answer.json()).items.find((row) => row.public_ref === ref);
  return item === undefined ? null : item.vote_count ?? Number.NaN;
}
/** The accounts whose vote on `ref` is stored: read back on the harness superuser, outside every request. */
const stored = async (ref: string): Promise<string[]> => (await database.pool.query<{ owner_ref: string }>(
  "SELECT owner_ref::text AS owner_ref FROM identity.public_debate_upvote WHERE publication_ref=$1", [ref])).rows.map((row) => row.owner_ref).sort();
/** The sweep of debates gone for good, on the API's system login, as the API's timer calls it. */
const sweep = async (limit: number): Promise<number> => (await pools.system.query<{ deleted: number }>(
  "SELECT identity.delete_gone_public_debate_upvotes($1) AS deleted", [limit])).rows[0]!.deleted;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  pools = await loginApiPools(database);
  for (const name of NAMES) {
    const account = await seedSessionAccount(database.pool, name);
    who[name] = { account, session: httpIdentityFor(account) };
  }
  api = buildApi({
    application: {} as AskApplication,
    sessions: testSessionApplication(NAMES.map((name) => who[name].session)),
    allowedOrigin: TEST_APP_ORIGIN,
    // As main.ts builds them: both on the request pool, whose cross-account target is the system login.
    publications: new PostgresPublicationApplication(new PostgresPublicationRepository(pools.runtime, { hash: () => "sha256:0" } as never), publicationCipher),
    publicVotes: { repository: new PostgresPublicDebateUpvoteRepository(pools.runtime) },
    admission: new AdmissionLimiter(policy),
    admissionClock: () => now
  });
  await api.ready();
}, 300_000);
// Every case starts with fresh budgets: the clock moves one whole window on.
beforeEach(() => { now = new Date(now.getTime() + Math.max(policy.publicReads.windowMs, policy.publicVotes.windowMs)); });
afterAll(async () => {
  await api?.close();
  if (database !== undefined) await (await provisionRlsLogins(database)).end();
  await database?.stop();
});

describe("upvotes on public debates, over the API's routes on real PostgreSQL", () => {
  it("a vote shows to every reader as the count: one per account, a second account makes 2, taking one back makes 1, and an author may upvote their own debate", async () => {
    const debate = await published(who.ana.account);
    expect(await countOf(debate.ref)).toBe(0);
    const first = await put("ben", debate.ref);
    expect(first.statusCode).toBe(200);
    expect(first.headers["cache-control"]).toBe("no-store");
    expect(answered(first)).toEqual({ voted: true, vote_count: 1 });
    expect(await countOf(debate.ref)).toBe(1);
    expect(answered(await put("ben", debate.ref))).toEqual({ voted: true, vote_count: 1 });
    expect(answered(await put("cat", debate.ref))).toEqual({ voted: true, vote_count: 2 });
    expect(await countOf(debate.ref)).toBe(2);
    expect(await stored(debate.ref)).toEqual([ownerOf("ben"), ownerOf("cat")].sort());
    const back = await del("ben", debate.ref);
    expect(back.statusCode).toBe(200);
    expect(back.headers["cache-control"]).toBe("no-store");
    expect(answered(back)).toEqual({ voted: false, vote_count: 1 });
    expect(answered(await del("ben", debate.ref))).toEqual({ voted: false, vote_count: 1 });
    expect(await countOf(debate.ref)).toBe(1);
    expect(answered(await put("ana", debate.ref))).toEqual({ voted: true, vote_count: 2 });
    expect(await stored(debate.ref)).toEqual([ownerOf("ana"), ownerOf("cat")].sort());
    // Votes never reorder the list (a non-goal): it stays newest first, whichever debate has the votes.
    const [older, newer] = [await published(), await published()];
    const order = async (): Promise<string[]> => PublicDebateListSchema.parse((await api.inject({ method: "GET", url: LIST })).json()).items
      .map((row) => row.public_ref).filter((ref) => ref === older.ref || ref === newer.ref);
    expect(await order()).toEqual([newer.ref, older.ref]);
    expect((await put("ben", older.ref)).statusCode).toBe(200);
    expect((await put("cat", older.ref)).statusCode).toBe(200);
    expect(await order()).toEqual([newer.ref, older.ref]);
  });

  it("the list is the same bytes for every caller and names no voter; which debates an account upvoted is that account's own read", async () => {
    const [one, two] = [await published(), await published()];
    expect((await put("ben", one.ref)).statusCode).toBe(200);
    expect((await put("cat", two.ref)).statusCode).toBe(200);
    const anonymous = await api.inject({ method: "GET", url: LIST });
    for (const name of ["ben", "cat", "dan"] as const) {
      const signedIn = await api.inject({ method: "GET", url: LIST, headers: testSessionHeaders(who[name].session) });
      expect(signedIn.body, name).toBe(anonymous.body);
      expect(headersOf(signedIn), name).toBe(headersOf(anonymous));   // nothing about the caller rides in a header either
    }
    for (const name of NAMES) {
      expect(anonymous.body).not.toContain(who[name].account.ownerRef);
      expect(anonymous.body).not.toContain(who[name].account.userId);
    }
    const row = (anonymous.json() as { items: Record<string, unknown>[] }).items.find((item) => item.public_ref === one.ref)!;
    expect(Object.keys(row).sort()).toEqual(["author_pseudonym", "confidence_band", "models", "public_ref", "published_at", "question", "verdict", "vote_count"]);
    expect(row.vote_count).toBe(1);
    const mine = await own("ben", [one.ref, two.ref]);
    expect(mine.statusCode).toBe(200);
    expect(mine.headers["cache-control"]).toBe("no-store");
    expect(votedOf(mine)).toEqual([one.ref]);
    expect(votedOf(await own("cat", [one.ref, two.ref]))).toEqual([two.ref]);
    expect(votedOf(await own("dan", [one.ref, two.ref]))).toEqual([]);
    const signedOut = await api.inject({ method: "GET", url: `/v1/account/public-debate-votes?refs=${one.ref}` });
    expect(signedOut.statusCode).toBe(401);
    expect(signedOut.json()).toEqual({ error: "SESSION_REQUIRED" });
  });

  it("a debate that is not public, a guessed link, a malformed id and an account that is not active all answer the one 404 and store nothing; no session is 401, no CSRF pair is 403", async () => {
    const [open, closed, held] = [await published(), await published(), await published()];
    await unpublish(closed);
    await review(held.ref, 1, "HIDE");
    await seeded([[`UPDATE identity."user" SET state='suspended' WHERE user_id=$1`, [who.eve.account.userId]]]);
    const absent = [
      await put("ben", randomUUID()), await put("ben", "not-an-id"), await put("ben", closed.ref), await put("ben", held.ref), await put("eve", open.ref),
      await del("ben", randomUUID()), await del("ben", "not-an-id"), await del("ben", closed.ref), await del("ben", held.ref)];
    for (const answer of absent) {
      expect(answer.statusCode).toBe(404);
      expect(answer.json()).toEqual(NOT_FOUND);
      expect(answer.headers["cache-control"]).toBe("no-store");
    }
    expect(new Set(absent.map((answer) => answer.body)).size).toBe(1);
    // One face: status, body and every header are the same for private, held, unknown, malformed and not-active. The one
    // header that may differ is the caller's own sliding cookie refresh (apps/api/src/index.ts's onSend hook): eve's
    // answer carries eve's session, ben's carry ben's. Each is read as "the caller's own" and must be exactly that.
    const callers: readonly Name[] = ["ben", "ben", "ben", "ben", "eve", "ben", "ben", "ben", "ben"];
    expect(callers).toHaveLength(absent.length);
    const faceOf = (answer: (typeof absent)[number], name: Name): string => headersOf(answer)
      .replaceAll(who[name].session.rawSessionToken, "<own session>").replaceAll(who[name].session.rawCsrfToken, "<own csrf>");
    expect(new Set(absent.map((answer, at) => faceOf(answer, callers[at]!))).size).toBe(1);
    const signedOut = await api.inject({ method: "PUT", url: voteUrl(open.ref), payload: {} });
    expect(signedOut.statusCode).toBe(401);
    expect(signedOut.json()).toEqual({ error: "SESSION_REQUIRED" });
    const noCsrf = await api.inject({ method: "PUT", url: voteUrl(open.ref), headers: testSessionHeaders(who.ben.session), payload: {} });
    expect(noCsrf.statusCode).toBe(403);
    expect(noCsrf.json()).toEqual({ error: "CSRF_VALIDATION_FAILED" });
    const elsewhere = await api.inject({ method: "DELETE", url: voteUrl(open.ref), headers: testSessionHeaders(who.ben.session, true, "https://elsewhere.example") });
    expect(elsewhere.statusCode).toBe(403);
    for (const debate of [open, closed, held]) expect(await stored(debate.ref)).toEqual([]);
    expect(await countOf(open.ref)).toBe(0);
  });

  it("held for review: no new vote, the votes are kept, one can still be taken back, and the rest count again when the hold is lifted", async () => {
    const debate = await published();
    for (const name of ["ben", "cat", "dan"] as const) expect((await put(name, debate.ref)).statusCode).toBe(200);
    expect(await countOf(debate.ref)).toBe(3);
    await review(debate.ref, 1, "HIDE");
    expect(await countOf(debate.ref)).toBeNull();
    const late = await put("fay", debate.ref);
    expect(late.statusCode).toBe(404);
    expect(late.json()).toEqual(NOT_FOUND);
    expect(await stored(debate.ref)).toEqual([ownerOf("ben"), ownerOf("cat"), ownerOf("dan")].sort());
    // Taking a vote back always works: the row goes, and the answer tells nothing about the debate.
    const back = await del("dan", debate.ref);
    expect(back.statusCode).toBe(404);
    expect(back.json()).toEqual(NOT_FOUND);
    expect(await stored(debate.ref)).toEqual([ownerOf("ben"), ownerOf("cat")].sort());
    expect(votedOf(await own("ben", [debate.ref]))).toEqual([debate.ref]);
    expect(votedOf(await own("dan", [debate.ref]))).toEqual([]);
    await review(debate.ref, 2, "REPUBLISH");
    expect(await countOf(debate.ref)).toBe(2);
    expect(answered(await put("dan", debate.ref))).toEqual({ voted: true, vote_count: 3 });
  });

  it("gone for good: the sweep deletes those votes in bounded batches and never a held debate's; a new link starts from zero", async () => {
    const [closed, moved, held] = [await published(), await published(), await published()];
    for (const [name, debate] of [["ben", closed], ["ben", moved], ["cat", moved], ["ben", held]] as const) expect((await put(name, debate.ref)).statusCode).toBe(200);
    await unpublish(closed);                          // made private again
    await unpublish(moved);
    const again = await publish(moved.runId);         // and this one came back under a new link
    await review(held.ref, 1, "HIDE");
    expect(await countOf(closed.ref)).toBeNull();
    expect(await countOf(moved.ref)).toBeNull();
    expect(await countOf(again.ref)).toBe(0);
    expect((await put("dan", moved.ref)).statusCode).toBe(404);
    expect(await stored(moved.ref)).toHaveLength(2);
    // No other case of this file leaves a vote on a debate that is gone, so these three rows are all there is to take.
    expect(await sweep(1)).toBe(1);
    expect(await sweep(100)).toBe(2);
    expect(await sweep(100)).toBe(0);
    expect(await stored(closed.ref)).toEqual([]);
    expect(await stored(moved.ref)).toEqual([]);
    expect(await stored(held.ref)).toEqual([ownerOf("ben")]);
    await review(held.ref, 2, "REPUBLISH");
    expect(await countOf(held.ref)).toBe(1);
    expect(votedOf(await own("ben", [closed.ref, moved.ref, held.ref, again.ref]))).toEqual([held.ref]);
  });

  it("an account that is deleted takes its vote with it, and the count falls", async () => {
    const debate = await published();
    expect(answered(await put("gus", debate.ref))).toEqual({ voted: true, vote_count: 1 });
    expect(answered(await put("ben", debate.ref))).toEqual({ voted: true, vote_count: 2 });
    // The statement account erasure ends with (migrations/0110_account_erasure_public_debates.sql:747), on the harness superuser.
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [who.gus.account.userId]);
    expect(await stored(debate.ref)).toEqual([ownerOf("ben")]);
    expect(await countOf(debate.ref)).toBe(1);
  });

  it("one brake per account covers the three routes together: past it the answer is 429 with the wait and nothing is stored, nobody else is slowed, and a window later it works again", async () => {
    const [one, two] = [await published(), await published()];
    const kinds = [() => put("fay", one.ref), () => del("fay", one.ref), () => own("fay", [one.ref])];
    for (let action = 0; action < policy.publicVotes.limit; action += 1) {
      expect((await kinds[action % kinds.length]!()).statusCode, `action ${String(action + 1)}`).toBe(200);
    }
    const before = await stored(one.ref);
    for (const refused of [await put("fay", two.ref), await del("fay", one.ref), await own("fay", [one.ref]), await put("fay", "not-an-id")]) {
      expect(refused.statusCode).toBe(429);
      expect(refused.json()).toEqual({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
      expect(refused.headers["retry-after"]).toBe(String(policy.publicVotes.windowMs / 1_000));
    }
    expect(await stored(two.ref)).toEqual([]);
    expect(await stored(one.ref)).toEqual(before);
    expect(answered(await put("ben", two.ref))).toEqual({ voted: true, vote_count: 1 });
    now = new Date(now.getTime() + policy.publicVotes.windowMs);
    expect(answered(await put("fay", two.ref))).toEqual({ voted: true, vote_count: 2 });
  });
});
