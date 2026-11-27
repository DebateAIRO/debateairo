// tests/integration/public-debate-upvotes-0194.test.ts
// Migration 0194 on real PostgreSQL: a signed-in account upvotes a debate that is public now, once, and may take the vote back; each
// public debate shows how many accounts upvoted it and never who. Every vote is cast on the API's request login inside the voter's own
// request, as the vote routes run it; the count is read and the sweep is run on the API's system login, the export on the export
// worker's. Debates, holds and exports are fixture rows written by the superuser as the product writes them. Data is made up.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertAccountErasureDatabaseRole, createPool, crossAccount, migrate, type Pool } from "@debateai/db";
import { inAccountRequest, provisionRlsLogins, seedLiveSession, seedSessionAccount, type RlsLogins, type RlsTestAccount } from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const MISMATCH = { code: "42501", message: "REQUEST_OWNER_MISMATCH" };
const INVALID = { code: "22023", message: "PUBLIC_DEBATE_UPVOTE_INVALID" };
const ACCOUNT_INVALID = { code: "22023", message: "PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID" };
const LEASE_INVALID = { code: "P0001", message: "DATA_EXPORT_LEASE_INVALID" };
const denied = (name: string) => ({ code: "42501", message: `permission denied for function ${name}` });
const NOT_PUBLIC = { outcome: "NOT_PUBLIC", upvotes: null };
type Vote = Readonly<{ outcome: string; upvotes: number | null }>;
type Count = Readonly<{ publication_ref: string; upvotes: number }>;

let database: TestDatabase;
let logins: RlsLogins;
/** The API's request login (api-runtime: debateai_billing_runtime), with its system twin as target, as main.ts builds `pool`. */
let request: Pool;
/** The API's system login (api-system: debateai_billing_runtime and the cross-account marker). */
let system: Pool;
/** The export worker's login (debateai_data_export_worker). */
let worker: Pool;
/** The owner of every debate below, and a voter. */
let ana: RlsTestAccount;
let ben: RlsTestAccount;
let cal: RlsTestAccount;
let sequence = 9_930_000;
const opened: Pool[] = [];

/** A login on a pool of its own, with no cross-account target: every statement runs on that login, with no session presented. */
function bare(key: Parameters<RlsLogins["url"]>[0], max = 1): Pool {
  const pool = createPool(logins.url(key), { max });
  opened.push(pool);
  return pool;
}

// The API's three functions, on `pool`, inside the request of `token` (null: a request with no session).
const cast = (pool: Pool, token: string | null, ownerRef: string | null, ref: string | null): Promise<Vote> => inAccountRequest(token, async () =>
  (await pool.query<{ answer: Vote }>("SELECT identity.cast_public_debate_upvote($1,$2) AS answer", [ownerRef, ref])).rows[0]!.answer);
const withdraw = (pool: Pool, token: string | null, ownerRef: string | null, ref: string | null): Promise<Vote> => inAccountRequest(token, async () =>
  (await pool.query<{ answer: Vote }>("SELECT identity.withdraw_public_debate_upvote($1,$2) AS answer", [ownerRef, ref])).rows[0]!.answer);
const own = (pool: Pool, token: string | null, ownerRef: string, refs: readonly string[]): Promise<string[]> => inAccountRequest(token, async () =>
  (await pool.query<{ answer: string[] }>("SELECT identity.read_own_public_debate_upvotes($1,$2::uuid[]) AS answer", [ownerRef, [...refs]])).rows[0]!.answer);
// The count, the sweep and the export reader, on `pool` as it is (the caller wraps it when it wants a request).
const counts = async (pool: Pool, refs: readonly string[]): Promise<Count[]> =>
  (await pool.query<{ answer: Count[] }>("SELECT identity.read_public_debate_upvote_counts($1::uuid[]) AS answer", [[...refs]])).rows[0]!.answer;
const sweep = async (pool: Pool, limit: number): Promise<number> =>
  (await pool.query<{ gone: number }>("SELECT identity.delete_gone_public_debate_upvotes($1) AS gone", [limit])).rows[0]!.gone;
const exported = async (pool: Pool, exportId: string, lease: string): Promise<Array<Record<string, unknown>>> =>
  (await pool.query<{ answer: Array<Record<string, unknown>> }>("SELECT identity.read_data_export_public_debate_upvotes($1,$2) AS answer", [exportId, lease])).rows[0]!.answer;
// The public list's own path: the count asked inside site X10's frame of a request (packages/db/src/publication.ts:686).
const listCounts = (pool: Pool, token: string | null, refs: readonly string[]) => inAccountRequest(token, () => crossAccount("X10", () => counts(pool, refs)));

// Fixtures and read-backs, on the superuser, outside any request.
type SqlError = { code?: string | undefined; message?: string | undefined };
async function sqlError(work: () => Promise<unknown>): Promise<SqlError> {
  try { await work(); return { code: undefined, message: undefined }; }
  catch (error) { return error as SqlError; }
}
/** What a debate's fixture needs of its owner. */
type Account = Readonly<{ ownerRef: string }>;
async function seeded(statements: ReadonlyArray<readonly [string, readonly unknown[]]>): Promise<void> {
  const seed = await database.pool.connect();
  try {
    await seed.query("BEGIN");
    await seed.query("SET LOCAL session_replication_role = 'replica'");
    for (const [sql, values] of statements) await seed.query(sql, [...values]);
    await seed.query("COMMIT");
  } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
}
/** A debate of `owner`'s, as a run row and its ownership event. */
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
    ["INSERT INTO core.run_ownership_event(run_id,owner_ref,at_seq) VALUES ($1,$2,$3)", [runId, owner.ownerRef, seq]]]);
  return runId;
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
/** A public debate of `owner`'s: its run, and the link it is public under. */
async function debate(owner: { ownerRef: string }): Promise<{ runId: string; ref: string }> {
  const runId = await run(owner);
  return { runId, ref: await publish(runId) };
}
/** A review log row at the next revision, as 0150's apply writes it, with the ground 0157/0172 record beside a HIDE. */
async function step(ref: string, action: "HIDE" | "REPUBLISH"): Promise<string> {
  const eventId = randomUUID();
  const revision = (await database.pool.query<{ n: number }>("SELECT COALESCE(max(revision),0)::int + 1 AS n FROM identity.public_review_event WHERE publication_ref=$1", [ref])).rows[0]!.n;
  await seeded([
    [`INSERT INTO identity.public_review_event (event_id,publication_ref,revision,action,piece_kind,piece_id,actor_staff_id,operation_id,request_sha256)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`, [eventId, ref, revision, action, null, null, randomUUID(), randomUUID(), "0".repeat(64)]],
    ...(action === "HIDE" ? [[`INSERT INTO identity.moderation_ground (event_id, publication_ref, grounds, source, interim) VALUES ($1,$2,ARRAY['REVIEW_HOLD'],'OWN_INITIATIVE',true)`, [eventId, ref]] as const] : [])]);
  return eventId;
}
/** Staff hold the page for review, and lift the hold. */
const hold = (ref: string) => step(ref, "HIDE");
const release = (ref: string) => step(ref, "REPUBLISH");
/** An account with one live session and nothing else, which a test may suspend or delete. */
async function person(): Promise<{ userId: string; ownerRef: string; token: string }> {
  const userId = randomUUID();
  await database.pool.query(`INSERT INTO identity."user" (user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,password_hash,pseudonym,state,adult_affirmed_at)
    VALUES ($1,$2,'{}','{}','fixture-password',$3,'active',now())`, [userId, createHash("sha256").update(userId).digest(), `upvote-${userId}`]);
  const ownerRef = (await database.pool.query<{ owner_ref: string }>('SELECT owner_ref FROM identity."user" WHERE user_id=$1', [userId])).rows[0]!.owner_ref;
  return { userId, ownerRef, token: await seedLiveSession(database.pool, userId) };
}
async function leasedExport(userId: string): Promise<Readonly<{ exportId: string; lease: string }>> {
  const exportId = randomUUID();
  const lease = randomUUID();
  await database.pool.query(`INSERT INTO identity.data_export(export_id,user_id,session_id,locale,status,requested_at,attempts,lease_owner,lease_until)
    VALUES ($1,$2,$3,'en','PREPARING',clock_timestamp(),1,$4,clock_timestamp()+interval '1 minute')`, [exportId, userId, randomUUID(), lease]);
  return { exportId, lease };
}
const votersOf = async (ref: string): Promise<string[]> => (await database.pool.query<{ owner_ref: string }>(
  "SELECT owner_ref FROM identity.public_debate_upvote WHERE publication_ref=$1 ORDER BY owner_ref", [ref])).rows.map((row) => row.owner_ref);
const votesBy = async (ownerRef: string): Promise<string[]> => (await database.pool.query<{ publication_ref: string }>(
  "SELECT publication_ref FROM identity.public_debate_upvote WHERE owner_ref=$1 ORDER BY publication_ref", [ownerRef])).rows.map((row) => row.publication_ref);
const granteesOf = async (signature: string): Promise<string[]> => (await database.pool.query<{ grantee: string }>(`SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
  FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a
  WHERE p.oid=$1::regprocedure AND a.grantee<>p.proowner ORDER BY 1`, [signature])).rows.map((row) => row.grantee);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  request = logins.apiPools().runtime;
  system = logins.apiPools().system;
  worker = logins.apiPools().dataExport;
  ana = await seedSessionAccount(database.pool, "upvote-ana");
  ben = await seedSessionAccount(database.pool, "upvote-ben");
  cal = await seedSessionAccount(database.pool, "upvote-cal");
}, 600_000);

afterAll(async () => {
  for (const pool of opened) await pool.end().catch(() => undefined);
  await logins?.end();
  await database?.stop();
});

describe("0194: upvotes on public debates, on the real logins", () => {
  it("one vote per account per debate: CAST with the fresh count, ALREADY the second time, a person may upvote their own debate, and taking a vote back deletes the row", async () => {
    const { ref } = await debate(ana);
    expect(await cast(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "CAST", upvotes: 1 });
    expect(await cast(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "ALREADY", upvotes: 1 });
    expect(await cast(request, ana.token, ana.ownerRef, ref)).toEqual({ outcome: "CAST", upvotes: 2 });   // ana's own debate
    expect(await votersOf(ref)).toEqual([ana.ownerRef, ben.ownerRef].sort());
    expect(await withdraw(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "WITHDRAWN", upvotes: 1 });
    expect(await withdraw(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "NONE", upvotes: 1 });
    expect(await votersOf(ref)).toEqual([ana.ownerRef]);
  });

  it("the own-votes read names the asked debates this account upvoted, sorted, whatever their state, and no one else's", async () => {
    // ben upvotes a and b, cal upvotes c; then b is made private.
    const a = await debate(ana);
    const b = await debate(ana);
    const c = await debate(ana);
    await cast(request, ben.token, ben.ownerRef, a.ref);
    await cast(request, ben.token, ben.ownerRef, b.ref);
    await cast(request, cal.token, cal.ownerRef, c.ref);
    await unpublish(b.runId, b.ref);
    expect(await own(request, ben.token, ben.ownerRef, [c.ref, b.ref, a.ref, randomUUID()])).toEqual([a.ref, b.ref].sort());
    expect(await own(request, ben.token, ben.ownerRef, [c.ref])).toEqual([]);
    expect(await own(request, ben.token, ben.ownerRef, Array.from({ length: 100 }, () => randomUUID()))).toEqual([]);
    await expect(own(request, ben.token, ben.ownerRef, Array.from({ length: 101 }, () => randomUUID()))).rejects.toMatchObject(INVALID);
  });

  it("every kind of absence answers NOT_PUBLIC and stores nothing; a held debate keeps its votes and they count again when the hold is lifted", async () => {
    // gone: made private. moved: made private, then published again under a new link. held: ben upvotes it, then staff hold it.
    const gone = await debate(ana);
    await unpublish(gone.runId, gone.ref);
    const moved = await debate(ana);
    await unpublish(moved.runId, moved.ref);
    const next = await publish(moved.runId);
    const held = await debate(ana);
    await cast(request, ben.token, ben.ownerRef, held.ref);
    await hold(held.ref);
    for (const ref of [randomUUID(), gone.ref, moved.ref, held.ref]) {
      expect(await cast(request, cal.token, cal.ownerRef, ref), ref).toEqual(NOT_PUBLIC);
      expect(await votersOf(ref), ref).not.toContain(cal.ownerRef);
    }
    expect(await cast(request, cal.token, cal.ownerRef, next)).toEqual({ outcome: "CAST", upvotes: 1 });
    expect(await counts(system, [held.ref])).toEqual([]);
    expect(await votersOf(held.ref)).toEqual([ben.ownerRef]);
    await release(held.ref);
    expect(await counts(system, [held.ref])).toEqual([{ publication_ref: held.ref, upvotes: 1 }]);
    expect(await cast(request, cal.token, cal.ownerRef, held.ref)).toEqual({ outcome: "CAST", upvotes: 2 });
  });

  it("only the account's own request casts, withdraws or reads: every other connection is refused, and nothing is written or removed", async () => {
    // ana upvotes the debate first.
    const { ref } = await debate(ana);
    await cast(request, ana.token, ana.ownerRef, ref);
    const others: ReadonlyArray<readonly [string, Pool, string | null]> = [["ben's session", request, ben.token], ["a request with no session", request, null],
      ["ana's revoked session", request, ana.revokedToken], ["ana's expired session", request, ana.expiredToken], ["the request login on its own connection", bare("DATABASE_URL"), null]];
    for (const [label, pool, token] of others) {
      await expect(cast(pool, token, ana.ownerRef, ref), label).rejects.toMatchObject(MISMATCH);
      await expect(withdraw(pool, token, ana.ownerRef, ref), label).rejects.toMatchObject(MISMATCH);
      await expect(own(pool, token, ana.ownerRef, [ref]), label).rejects.toMatchObject(MISMATCH);
    }
    expect(await votersOf(ref)).toEqual([ana.ownerRef]);
    await expect(cast(request, ana.token, null, ref)).rejects.toMatchObject(INVALID);
    await expect(cast(request, ana.token, ana.ownerRef, null)).rejects.toMatchObject(INVALID);
    await expect(withdraw(request, ana.token, ana.ownerRef, null)).rejects.toMatchObject(INVALID);
  });

  it("an account that is not active is refused a new vote, its earlier vote still counts, and it can still take it back", async () => {
    // sam upvotes the first debate, and is then suspended, as 0110's prepare leaves an account that is closing.
    const first = await debate(ana);
    const second = await debate(ana);
    const sam = await person();
    await cast(request, sam.token, sam.ownerRef, first.ref);
    await database.pool.query(`UPDATE identity."user" SET state='suspended' WHERE user_id=$1`, [sam.userId]);
    await expect(cast(request, sam.token, sam.ownerRef, second.ref)).rejects.toMatchObject(ACCOUNT_INVALID);
    expect(await votersOf(second.ref)).toEqual([]);
    expect(await counts(system, [first.ref])).toEqual([{ publication_ref: first.ref, upvotes: 1 }]);
    expect(await withdraw(request, sam.token, sam.ownerRef, first.ref)).toEqual({ outcome: "WITHDRAWN", upvotes: 0 });
  });

  it("taking a vote back works when the debate is no longer public, and then answers no count", async () => {
    // ben upvotes both; then one is made private and the other is held.
    const gone = await debate(ana);
    const held = await debate(ana);
    await cast(request, ben.token, ben.ownerRef, gone.ref);
    await cast(request, ben.token, ben.ownerRef, held.ref);
    await unpublish(gone.runId, gone.ref);
    await hold(held.ref);
    for (const { ref } of [gone, held]) {
      expect(await withdraw(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "WITHDRAWN", upvotes: null });
      expect(await withdraw(request, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "NONE", upvotes: null });
      expect(await votersOf(ref)).toEqual([]);
    }
  });

  it("counts are the same for every caller, name no account, and are given for public debates only", async () => {
    // loud: ana and ben upvote it. quiet: no vote. held: ben upvotes, then staff hold it. gone: ben upvotes, then it is made private.
    const loud = await debate(ana);
    const quiet = await debate(ana);
    const held = await debate(ana);
    const gone = await debate(ana);
    await cast(request, ana.token, ana.ownerRef, loud.ref);
    await cast(request, ben.token, ben.ownerRef, loud.ref);
    await cast(request, ben.token, ben.ownerRef, held.ref);
    await hold(held.ref);
    await cast(request, ben.token, ben.ownerRef, gone.ref);
    await unpublish(gone.runId, gone.ref);
    const asked = [gone.ref, loud.ref, held.ref, quiet.ref, loud.ref, randomUUID()];
    const expected = [{ publication_ref: loud.ref, upvotes: 2 }, { publication_ref: quiet.ref, upvotes: 0 }].sort((a, b) => (a.publication_ref < b.publication_ref ? -1 : 1));
    const runner = bare("RUNNER_DATABASE_URL");
    for (const [label, read] of [["the system login, outside any request", () => counts(system, asked)],
      ["the list's read in ana's request", () => listCounts(request, ana.token, asked)], ["the list's read in ben's request", () => listCounts(request, ben.token, asked)],
      ["the list's read with no session", () => listCounts(request, null, asked)], ["the runner's login", () => counts(runner, asked)]] as const) {
      expect(await read(), label).toEqual(expected);
    }
    for (const entry of await counts(system, asked)) expect(Object.keys(entry).sort()).toEqual(["publication_ref", "upvotes"]);
    expect(await counts(system, [held.ref, gone.ref, randomUUID()])).toEqual([]);
    await expect(counts(system, Array.from({ length: 101 }, () => randomUUID()))).rejects.toMatchObject(INVALID);
    // The writers answer the same number the list shows.
    expect(await cast(request, cal.token, cal.ownerRef, loud.ref)).toEqual({ outcome: "CAST", upvotes: 3 });
    expect(await counts(system, [loud.ref])).toEqual([{ publication_ref: loud.ref, upvotes: 3 }]);
    // No request login may ask: outside the frame the statement runs on the request login itself.
    await expect(inAccountRequest(ana.token, () => counts(request, [loud.ref]))).rejects.toMatchObject(denied("read_public_debate_upvote_counts"));
    await expect(counts(bare("DATABASE_URL"), [loud.ref])).rejects.toMatchObject(denied("read_public_debate_upvote_counts"));
    await expect(counts(bare("AUTHORIZATION_DATABASE_URL"), [loud.ref])).rejects.toMatchObject({ code: "42501" });
  });

  it("deleting the account row, as the erasure's last step does, removes that account's votes and no one else's", async () => {
    // leaver and keeper each upvote both debates.
    const a = await debate(ana);
    const b = await debate(ana);
    const leaver = await person();
    const keeper = await person();
    for (const voter of [leaver, keeper]) {
      await cast(request, voter.token, voter.ownerRef, a.ref);
      await cast(request, voter.token, voter.ownerRef, b.ref);
    }
    await database.pool.query('DELETE FROM identity."user" WHERE user_id=$1', [leaver.userId]);   // migrations/0110_account_erasure_public_debates.sql:747
    expect(await votesBy(leaver.ownerRef)).toEqual([]);
    expect(await votesBy(keeper.ownerRef)).toEqual([a.ref, b.ref].sort());
    expect(await counts(system, [a.ref])).toEqual([{ publication_ref: a.ref, upvotes: 1 }]);
    expect((await database.pool.query(`SELECT confrelid::regclass::text AS target, confdeltype::text AS on_delete FROM pg_constraint
      WHERE conrelid='identity.public_debate_upvote'::regclass AND contype='f' ORDER BY 1`)).rows)
      .toEqual([{ target: 'identity."user"', on_delete: "c" }, { target: "serve.publication_snapshot", on_delete: "a" }]);
    expect(await sqlError(() => database.pool.query("TRUNCATE identity.public_debate_upvote"))).toMatchObject({ code: expect.any(String) });
    expect(await votesBy(keeper.ownerRef)).toHaveLength(2);
  });

  it("the export reader answers the leased export's own upvotes, oldest first, whatever the debate's state, and is refused without the lease", async () => {
    // reader upvotes a, then b; other upvotes c; b is made private; then reader's export is leased.
    const a = await debate(ana);
    const b = await debate(ana);
    const c = await debate(ana);
    const reader = await person();
    const other = await person();
    const empty = await person();
    await cast(request, reader.token, reader.ownerRef, a.ref);
    await cast(request, reader.token, reader.ownerRef, b.ref);
    await cast(request, other.token, other.ownerRef, c.ref);
    await unpublish(b.runId, b.ref);
    const { exportId, lease } = await leasedExport(reader.userId);
    const none = await leasedExport(empty.userId);
    const rows = await exported(worker, exportId, lease);
    expect(rows.map((row) => row.publication_ref)).toEqual([a.ref, b.ref]);
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["created_at", "publication_ref"]);
    await expect(exported(worker, exportId, randomUUID())).rejects.toMatchObject(LEASE_INVALID);
    await expect(exported(worker, randomUUID(), lease)).rejects.toMatchObject(LEASE_INVALID);
    expect(await exported(worker, none.exportId, none.lease)).toEqual([]);
    for (const pool of [bare("DATABASE_URL"), system, bare("ERASURE_DATABASE_URL")]) await expect(exported(pool, exportId, lease)).rejects.toMatchObject({ code: "42501" });
  });

  it("the sweep deletes the votes of a debate that is gone for good, also one held and then made private, a bounded number a call, and leaves a held or a public debate's alone", async () => {
    while (await sweep(system, 100) > 0) { /* what the cases above left behind */ }
    // live and held: ana and ben upvote each; then staff hold `held`. ended: ana, ben and cal upvote; then it is made private.
    // moved: ana upvotes; then it is made private and published again under a new link, which cal upvotes.
    // heldEnded: ben upvotes; then staff hold it, and then it is made private (design section 5: held and then made private is swept).
    const live = await debate(ana);
    const held = await debate(ana);
    const ended = await debate(ana);
    const moved = await debate(ana);
    const heldEnded = await debate(ana);
    for (const voter of [ana, ben]) {
      await cast(request, voter.token, voter.ownerRef, live.ref);
      await cast(request, voter.token, voter.ownerRef, held.ref);
    }
    await hold(held.ref);
    for (const voter of [ana, ben, cal]) await cast(request, voter.token, voter.ownerRef, ended.ref);
    await unpublish(ended.runId, ended.ref);
    await cast(request, ana.token, ana.ownerRef, moved.ref);
    await unpublish(moved.runId, moved.ref);
    const next = await publish(moved.runId);
    await cast(request, cal.token, cal.ownerRef, next);
    await cast(request, ben.token, ben.ownerRef, heldEnded.ref);
    await hold(heldEnded.ref);
    await unpublish(heldEnded.runId, heldEnded.ref);
    const gone = async (): Promise<number> => (await votersOf(ended.ref)).length + (await votersOf(moved.ref)).length + (await votersOf(heldEnded.ref)).length;
    await expect(inAccountRequest(ana.token, () => sweep(request, 1))).rejects.toMatchObject(denied("delete_gone_public_debate_upvotes"));
    await expect(sweep(bare("DATABASE_URL"), 1)).rejects.toMatchObject(denied("delete_gone_public_debate_upvotes"));
    // The batch is bounded to 1..1000: a limit outside it is refused and deletes nothing.
    for (const limit of [0, -1, 1001]) await expect(sweep(system, limit), String(limit)).rejects.toMatchObject(INVALID);
    expect(await gone()).toBe(5);
    expect(await sweep(system, 1)).toBe(1);
    expect(await gone()).toBe(4);
    // A vote another transaction holds is skipped, not waited for: the API runs a second sweep after this one on the same trigger (T16).
    const holder = await database.pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT 1 FROM identity.public_debate_upvote WHERE publication_ref=$1 LIMIT 1 FOR UPDATE", [ended.ref]);
      expect(await sweep(system, 100)).toBe(3);
      await holder.query("COMMIT");
    } finally { await holder.query("ROLLBACK").catch(() => undefined); holder.release(); }
    expect(await sweep(system, 100)).toBe(1);
    expect(await sweep(system, 1000)).toBe(0);
    expect([await votersOf(ended.ref), await votersOf(moved.ref), await votersOf(heldEnded.ref)]).toEqual([[], [], []]);
    expect(await votersOf(live.ref)).toEqual([ana.ownerRef, ben.ownerRef].sort());
    expect(await votersOf(held.ref)).toEqual([ana.ownerRef, ben.ownerRef].sort());
    expect(await votersOf(next)).toEqual([cal.ownerRef]);
    await release(held.ref);
    expect(await counts(system, [held.ref])).toEqual([{ publication_ref: held.ref, upvotes: 2 }]);
  });

  it("each function has its one grantee, no login reads the table, and the erasure login gained nothing", async () => {
    const GRANTEES: Readonly<Record<string, string>> = {
      "identity.cast_public_debate_upvote(uuid,uuid)": "debateai_billing_runtime", "identity.withdraw_public_debate_upvote(uuid,uuid)": "debateai_billing_runtime",
      "identity.read_own_public_debate_upvotes(uuid,uuid[])": "debateai_billing_runtime", "identity.read_public_debate_upvote_counts(uuid[])": "debateai_rls_all_accounts",
      "identity.delete_gone_public_debate_upvotes(integer)": "debateai_rls_all_accounts", "identity.read_data_export_public_debate_upvotes(uuid,uuid)": "debateai_data_export_worker" };
    for (const [signature, grantee] of Object.entries(GRANTEES)) expect(await granteesOf(signature), signature).toEqual([grantee]);
    for (const key of ["DATABASE_URL", "AUTHORIZATION_DATABASE_URL", "API_SYSTEM_DATABASE_URL", "RUNNER_DATABASE_URL", "ERASURE_DATABASE_URL", "DATA_EXPORT_DATABASE_URL"] as const) {
      await expect(bare(key).query("SELECT count(*) FROM identity.public_debate_upvote"), key).rejects.toMatchObject({ code: "42501" });
    }
    // The erasure login runs none of the six, and the API's own start check of that login (it counts what the login can run) still passes.
    expect((await database.pool.query("SELECT signature FROM unnest($1::text[]) AS signature WHERE has_function_privilege('debateai_erasure_runtime',signature,'EXECUTE')",
      [Object.keys(GRANTEES)])).rows).toEqual([]);
    await expect(assertAccountErasureDatabaseRole(bare("DATABASE_URL", 2), bare("ERASURE_DATABASE_URL", 2))).resolves.toBeUndefined();
  });

  it("on the production logins (P3-01's memberships): api-runtime votes for its own session only; api-system reads the counts and sweeps; api-runtime does neither", async () => {
    const production = await logins.production();
    const prodSystem = createPool(production.url("api-system"), { max: 2 });
    const prodRequest = createPool(production.url("api-runtime"), { max: 2, crossAccount: prodSystem });
    const prodBare = createPool(production.url("api-runtime"), { max: 1 });
    opened.push(prodRequest, prodSystem, prodBare);
    const { ref } = await debate(ana);
    expect(await cast(prodRequest, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "CAST", upvotes: 1 });
    await expect(cast(prodRequest, cal.token, ben.ownerRef, ref)).rejects.toMatchObject(MISMATCH);
    await expect(cast(prodBare, null, ben.ownerRef, ref)).rejects.toMatchObject(MISMATCH);
    expect(await own(prodRequest, ben.token, ben.ownerRef, [ref])).toEqual([ref]);
    expect(await listCounts(prodRequest, cal.token, [ref])).toEqual([{ publication_ref: ref, upvotes: 1 }]);
    await expect(counts(prodBare, [ref])).rejects.toMatchObject(denied("read_public_debate_upvote_counts"));
    await expect(sweep(prodBare, 1)).rejects.toMatchObject(denied("delete_gone_public_debate_upvotes"));
    expect(await sweep(prodSystem, 1)).toBeGreaterThanOrEqual(0);
    expect(await withdraw(prodRequest, ben.token, ben.ownerRef, ref)).toEqual({ outcome: "WITHDRAWN", upvotes: 0 });
  }, 180_000);
});
