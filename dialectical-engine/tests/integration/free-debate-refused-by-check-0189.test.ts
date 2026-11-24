// tests/integration/free-debate-refused-by-check-0189.test.ts
// Migration 0189 on real PostgreSQL: the owner of a Free debate the publication check refused is told so by the visibility read
// (public_stage KEPT_PRIVATE), and no one else learns anything new. Unless a test says otherwise, every row is written by the code that
// writes it in the product: the ask's Free notice by the API's writer on the request login, each check by the shipped publication check
// and its recorder (only the judge's answers are scripted), and the outcome by the shipped Free publication path with the sweep's own store. The visibility
// read runs on the API's request login inside the reader's own request, as the route runs it. Data is made up.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RunVisibilitySchema, type Answer } from "@debateai/contract";
import {
  MemoryPublicationKeyStore, PublicationCipher, hashToken, loadKek, type AuditContextHasher
} from "../../packages/crypto/src/index.js";
import {
  createPool, migrate, PostgresPublicDebateRepository, PostgresPublicDebateRunnerRepository, PostgresPublicationCheckRecordRepository,
  PostgresPublicationRepository, type Pool
} from "@debateai/db";
import { PostgresPublicationApplication, type FreeEndCheck, type FreePublicationStore } from "../../apps/api/src/publications.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import { createPublicationContentCheck, PublicationJudgeFailure } from "../../apps/api/src/publication-check/check.js";
import { PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW } from "../../packages/register/src/publication-check-policy.js";
import { createPartJudgeStub, type JudgeStubStep } from "../support/hs-s02-judge-stub.js";
import { persistTerminalRun } from "../support/settledRun.js";
import {
  createEncryptedStoryRun, provisionStoryEncryptedOwner, releaseStoryEncryptedOwner, type StoryEncryptedOwner
} from "../support/storyEncryptedOwner.js";
import { buildFairShapedAnswer } from "../support/v2uiFixtures.js";
import {
  inAccountRequest, provisionRlsLogins, seedLiveSession, seedSessionAccount, type RlsLogins, type RlsTestAccount
} from "../support/rls-logins.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const READER = "identity.read_free_debate_refused_by_check(uuid,uuid)";
const HASHER = Object.freeze({ hashSourceIp: async () => "33".repeat(32), hashUserAgent: async () => "44".repeat(32) }) as unknown as AuditContextHasher;
const CIPHER = new PublicationCipher(new MemoryPublicationKeyStore(loadKek(Buffer.alloc(32, 0xb8))));
/** The register's code-owned publication check deadline. */
const DEADLINE_MS = PUBLICATION_CHECK_POLICY_DEPLOYMENT_REGISTER_ROW.value.deadline_ms;
const SOURCE = Object.freeze({ ip: "", userAgent: "", requestId: "free-publication-sweep" });
const BLOCK: Readonly<Record<string, JudgeStubStep>> = { question: JSON.stringify({ verdict: "BLOCK", rules: [1], parts: ["question"], possibly_illegal: false }) };
const UNSURE: Readonly<Record<string, JudgeStubStep>> = { question: JSON.stringify({ verdict: "UNSURE", rules: [], parts: ["question"], possibly_illegal: false }) };
const UNAVAILABLE: Readonly<Record<string, JudgeStubStep>> = { question: new PublicationJudgeFailure("JUDGE_TRANSPORT_FAILED") };
const ALLOW: Readonly<Record<string, JudgeStubStep>> = {};
/** The end-of-debate check allowing every answer at once, so each test here turns on the publication check alone. */
const END_CHECK_ALLOWS: FreeEndCheck = Object.freeze({ stateOf: async () => "SHOW" as const, decide: async () => "PROCEED" as const });
const PRIVATE = Object.freeze({ state: "PRIVATE", public_ref: null });
const KEPT_PRIVATE = Object.freeze({ state: "PRIVATE", public_ref: null, public_stage: "KEPT_PRIVATE" });

let database: TestDatabase;
let logins: RlsLogins;
/** The API's request login (api-runtime: debateai_billing_runtime), with its system twin as target, as main.ts builds `pool`. */
let request: Pool;
/** The Free debates' owner: an account whose runs carry real encrypted content, and one live session it presents. */
let owner: StoryEncryptedOwner;
let ownerToken: string;
let other: RlsTestAccount;
const opened: Pool[] = [];

type Run = Readonly<{ runId: string; answer: Answer }>;

function sessionOf(account: Readonly<{ userId: string; ownerRef: string }>): AuthenticatedSession {
  return Object.freeze({
    session: Object.freeze({ asker_id: `owner:${account.ownerRef}`, session_id: randomUUID(), caller_scope: "ASKER" as const,
      ownership_provenance: "server_session" as const, provisional_identity_model: false as const }),
    userId: account.userId, ownerRef: account.ownerRef, tokenHash: "sha256:fixture", csrfTokenHash: "sha256:fixture", authKind: "cookie" as const
  });
}

/** A finished debate of the owner's: its run, its settled work and the answer the sweep reads. */
async function finishedRun(label: string): Promise<Run> {
  const marker = `${label}-${randomUUID()}`;
  const runId = await createEncryptedStoryRun(database.pool, owner, `kept-private ${marker}`);
  const { answerId } = await persistTerminalRun({
    pool: database.pool, runId, fixtureKey: marker,
    factBundle: { facts: [`kept-private-fact-${marker}`], residualObjections: [], badges: [], conditionMarks: ["DEFECT"],
      reversalPoint: `kept-private-reversal-${marker}`, buildsOnPrevious: { value: false, answerRef: null }, memoryDisclosure: null }
  });
  return { runId, answer: buildFairShapedAnswer({ run_ref: runId, answer_id: answerId, question_line: `Should the harbour open at night? ${marker}` }) };
}

/** A finished Free debate: the ask carried the Free notice, recorded by the API's writer inside the owner's own request. */
async function freeDebate(label: string): Promise<Run> {
  const run = await finishedRun(label);
  expect(await inAccountRequest(ownerToken, () => new PostgresPublicDebateRepository(request).recordFreeNotice(owner.ownerRef, run.runId))).toBe("RECORDED");
  return run;
}

/** The sweep's own store, on the API's pool outside a request (its system login), as main.ts wires it. */
function sweepStore(): FreePublicationStore {
  const runner = new PostgresPublicDebateRunnerRepository(request);
  return {
    prepare: (runId, publicationRef) => runner.prepareFreePublication(runId, publicationRef),
    publish: (input) => runner.publishFree(input),
    refuse: (runId) => runner.refuseFree(runId)
  };
}

/** One pass of the Free publication sweep over `run`: the shipped path and check, the judge answering `steps` per part. */
async function sweep(run: Run, steps: Readonly<Record<string, JudgeStubStep>>, store: FreePublicationStore = sweepStore()) {
  const judge = createPartJudgeStub(steps);
  const contentCheck = createPublicationContentCheck({
    judge: () => judge, recorder: new PostgresPublicationCheckRecordRepository(database.pool), clock: () => new Date(), deadlineMs: DEADLINE_MS
  });
  const sweeper = new PostgresPublicationApplication(new PostgresPublicationRepository(database.pool, HASHER), CIPHER);
  const outcome = await sweeper.publishFreeDebate({
    runId: run.runId, answer: run.answer, owner: { userId: owner.userId, ownerRef: owner.ownerRef }, purposeLines: null, source: SOURCE,
    contentCheck, endCheck: END_CHECK_ALLOWS, store, lease: { run: (use) => use(), readAnswer: async () => run.answer }
  });
  return { outcome, judgeCalls: judge.calls.length };
}

/** What the database recorded for `runId`: the ask's outcome and the check records' outcomes, oldest first. */
async function recorded(runId: string): Promise<Readonly<{ ask: string | null | undefined; checks: string[] }>> {
  const ask = (await database.pool.query<{ outcome: string | null }>("SELECT outcome FROM identity.free_public_ask WHERE run_id=$1", [runId])).rows[0];
  const checks = (await database.pool.query<{ outcome: string }>(
    "SELECT outcome FROM serve.publication_check_record WHERE run_id=$1 ORDER BY attempted_at", [runId])).rows.map((row) => row.outcome);
  return { ask: ask === undefined ? undefined : ask.outcome, checks };
}

/** The visibility route's read, on the request login inside the reader's own request (null token: a request with no session). */
async function visibilityFor(reader: Readonly<{ userId: string; ownerRef: string }>, token: string | null, runId: string) {
  const application = new PostgresPublicationApplication(new PostgresPublicationRepository(request, HASHER), CIPHER);
  const read = await inAccountRequest(token, () => application.readOwnedVisibility({ runId, authenticated: sessionOf(reader) }));
  // The route parses what it sends with the contract's strict schema; the answer must pass it as it is.
  if (read !== null) expect(RunVisibilitySchema.parse(read)).toStrictEqual(read);
  return read;
}
const ownersRead = (runId: string) => visibilityFor(owner, ownerToken, runId);

/** The reader itself, asked on `pool` inside the request of `token`. */
async function asked(pool: Pool, token: string | null, ownerRef: string, runId: string): Promise<boolean | null> {
  return inAccountRequest(token, async () => (await pool.query<{ refused: boolean | null }>(
    "SELECT identity.read_free_debate_refused_by_check($1,$2) AS refused", [ownerRef, runId])).rows[0]!.refused);
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  logins = await provisionRlsLogins(database);
  request = logins.apiPools().runtime;
  owner = await provisionStoryEncryptedOwner(database.pool);
  ownerToken = await seedLiveSession(database.pool, owner.userId);
  other = await seedSessionAccount(database.pool, "kept-private-other");
}, 600_000);

afterAll(async () => {
  for (const pool of opened) await pool.end().catch(() => undefined);
  await logins?.end();
  await database?.stop();
  if (owner !== undefined) await releaseStoryEncryptedOwner(owner);
});

describe("0189: the owner of a Free debate the publication check refused is told it stays private", () => {
  it("BLOCK: the sweep records the check, then the refusal, and the owner's visibility read says KEPT_PRIVATE", async () => {
    const run = await freeDebate("block");
    expect(await ownersRead(run.runId)).toStrictEqual(PRIVATE);
    expect(await sweep(run, BLOCK)).toMatchObject({ outcome: "REFUSED" });
    expect(await recorded(run.runId)).toEqual({ ask: "REFUSED", checks: ["BLOCK"] });
    expect(await ownersRead(run.runId)).toStrictEqual(KEPT_PRIVATE);
  }, 120_000);

  it("UNSURE: the same, since UNSURE keeps a Free debate private too", async () => {
    const run = await freeDebate("unsure");
    expect(await sweep(run, UNSURE)).toMatchObject({ outcome: "REFUSED" });
    expect(await recorded(run.runId)).toEqual({ ask: "REFUSED", checks: ["UNSURE"] });
    expect(await ownersRead(run.runId)).toStrictEqual(KEPT_PRIVATE);
  }, 120_000);

  it("a debate still waiting for its check shows none: before any check, after an unavailable check, and between a BLOCK record and its refusal", async () => {
    const waiting = await freeDebate("waiting");
    expect(await recorded(waiting.runId)).toEqual({ ask: null, checks: [] });
    expect(await ownersRead(waiting.runId)).toStrictEqual(PRIVATE);
    // The judge could not be reached: the attempt is recorded UNAVAILABLE, nothing is refused, and the sweep tries again later.
    expect(await sweep(waiting, UNAVAILABLE)).toMatchObject({ outcome: "CHECK_UNAVAILABLE" });
    expect(await recorded(waiting.runId)).toEqual({ ask: null, checks: ["UNAVAILABLE"] });
    expect(await ownersRead(waiting.runId)).toStrictEqual(PRIVATE);
    // The check said BLOCK and wrote its record, but the refusal is not written yet: still waiting, still nothing to say.
    const between = await freeDebate("between");
    const unwritten: FreePublicationStore = { ...sweepStore(), refuse: async () => "NOT_FOUND" };
    expect(await sweep(between, BLOCK, unwritten)).toMatchObject({ outcome: "REFUSED" });
    expect(await recorded(between.runId)).toEqual({ ask: null, checks: ["BLOCK"] });
    expect(await ownersRead(between.runId)).toStrictEqual(PRIVATE);
  }, 180_000);

  it("refused with no check (its answer ended blocked) shows none: the words say it did not pass the check, and no check ran", async () => {
    const run = await freeDebate("answer-blocked");
    // An earlier pass found the judge unavailable; this one finds the answer blocked and refuses before any check.
    expect(await sweep(run, UNAVAILABLE)).toMatchObject({ outcome: "CHECK_UNAVAILABLE" });
    const blocked: Run = { runId: run.runId, answer: { ...run.answer, terminal: "BLOCKED" } as Answer };
    expect(await sweep(blocked, BLOCK)).toEqual({ outcome: "REFUSED", judgeCalls: 0 });
    expect(await recorded(run.runId)).toEqual({ ask: "REFUSED", checks: ["UNAVAILABLE"] });
    expect(await ownersRead(run.runId)).toStrictEqual(PRIVATE);
  }, 180_000);

  it("a public debate is unchanged: a Free debate the check allowed, and one refused by the check that its owner later published", async () => {
    const allowed = await freeDebate("allowed");
    expect(await sweep(allowed, ALLOW)).toMatchObject({ outcome: "PUBLISHED" });
    expect(await recorded(allowed.runId)).toEqual({ ask: "PUBLISHED", checks: ["ALLOW"] });
    const page = await ownersRead(allowed.runId);
    expect(page).toStrictEqual({ state: "PUBLISHED", public_ref: expect.stringMatching(/^[0-9a-f-]{36}$/u) });
    // Refused by the check on Free, then made public under a new link (as the owner's own publish does): public, and nothing more.
    const later = await freeDebate("later-public");
    expect(await sweep(later, BLOCK)).toMatchObject({ outcome: "REFUSED" });
    expect(await ownersRead(later.runId)).toStrictEqual(KEPT_PRIVATE);
    const publicationRef = randomUUID();
    const seed = await database.pool.connect();
    try {
      await seed.query("BEGIN");
      await seed.query("SET LOCAL session_replication_role = 'replica'");
      await seed.query("INSERT INTO core.publication_ref_tombstone (ref,ref_kind,created_at) VALUES ($1,'publication_ref',now())", [publicationRef]);
      await seed.query("INSERT INTO serve.publication_snapshot (publication_ref,run_id,format_version,content_ciphertext,created_at) VALUES ($1,$2,1,$3::jsonb,now())",
        [publicationRef, later.runId, JSON.stringify({ v: 1, keyId: `publication-snapshot:${publicationRef}:v1`, nonce: "AAAA", tag: "AAAA", ct: "YQ==" })]);
      await seed.query(`INSERT INTO core.run_visibility_event (run_visibility_event_id,run_id,publication_ref,state,actor_audit_token,actor_ref_version,warning_version,occurred_at,at_seq)
        VALUES ($1,$2,$3,'PUBLISHED',$4,2,'PUBLIC_INDEXED_V1',now(),ledger.allocate_sequence())`, [randomUUID(), later.runId, publicationRef, randomUUID()]);
      await seed.query("COMMIT");
    } catch (error) { await seed.query("ROLLBACK"); throw error; } finally { seed.release(); }
    expect(await ownersRead(later.runId)).toStrictEqual({ state: "PUBLISHED", public_ref: publicationRef });
  }, 180_000);

  it("a paid, private debate shows none, even after its owner's own publish attempt was refused BLOCK", async () => {
    const paid = await finishedRun("paid");
    const grant = `kept-private-grant-${randomUUID()}`;
    await database.pool.query(`INSERT INTO identity.step_up_grant (step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,issued_at,expires_at,consumed_at)
      VALUES ($1,$2,$3,$4,'PUBLISH',$5,$6,$7,NULL)`,
    [randomUUID(), hashToken("step-up-grant", grant), owner.sessionId, owner.userId, paid.runId, new Date(Date.now() - 1_000), new Date(Date.now() + 60_000)]);
    const judge = createPartJudgeStub(BLOCK);
    const contentCheck = createPublicationContentCheck({
      judge: () => judge, recorder: new PostgresPublicationCheckRecordRepository(database.pool), clock: () => new Date(), deadlineMs: DEADLINE_MS
    });
    const publisher = new PostgresPublicationApplication(new PostgresPublicationRepository(database.pool, HASHER), CIPHER);
    const ownSession: AuthenticatedSession = { ...sessionOf(owner), session: { ...sessionOf(owner).session, session_id: owner.sessionId } };
    expect(await publisher.publish({ runId: paid.runId, answer: paid.answer, authenticated: ownSession, grantToken: grant, source: SOURCE, contentCheck }))
      .toMatchObject({ state: "REFUSED" });
    expect(await recorded(paid.runId)).toEqual({ ask: undefined, checks: ["BLOCK"] });
    expect(await ownersRead(paid.runId)).toStrictEqual(PRIVATE);
  }, 120_000);

  it("no one else learns it: another account, a request with no session and a login with no account get what they got before", async () => {
    const run = await freeDebate("strangers");
    expect(await sweep(run, BLOCK)).toMatchObject({ outcome: "REFUSED" });
    expect(await ownersRead(run.runId)).toStrictEqual(KEPT_PRIVATE);
    // The visibility read of another account's debate: not theirs, so nothing at all (the route's 404), as before 0189.
    expect(await visibilityFor(other, other.token, run.runId)).toBeNull();
    expect(await visibilityFor(owner, other.token, run.runId)).toBeNull();
    // The reader itself: null for a connection that is not the owner's, whichever owner it is asked of, and for a debate not theirs.
    expect(await asked(request, ownerToken, owner.ownerRef, run.runId)).toBe(true);
    expect(await asked(request, other.token, owner.ownerRef, run.runId)).toBeNull();
    expect(await asked(request, other.token, other.ownerRef, run.runId)).toBeNull();
    expect(await asked(request, ownerToken, other.ownerRef, run.runId)).toBeNull();
    expect(await asked(request, null, owner.ownerRef, run.runId)).toBeNull();
    expect(await asked(request, other.revokedToken, owner.ownerRef, run.runId)).toBeNull();
    // The request login on a connection of its own, with no account named.
    const bare = createPool(logins.url("DATABASE_URL"), { max: 1 });
    opened.push(bare);
    expect(await asked(bare, null, owner.ownerRef, run.runId)).toBeNull();
    // Another account's debate, asked in the owner's own request with the owner's reference: not the owner's, so null.
    expect(await asked(request, ownerToken, owner.ownerRef, other.runId)).toBeNull();
  }, 120_000);

  it("only the API's billing role may call it; staff, the runner, the authorization login and the other workers may not", async () => {
    const grantees = (await database.pool.query<{ grantee: string }>(`SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
      FROM pg_proc AS p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) AS a
      WHERE p.oid=$1::regprocedure AND a.grantee<>p.proowner ORDER BY 1`, [READER])).rows.map((row) => row.grantee);
    expect(grantees).toEqual(["debateai_billing_runtime"]);
    const roles = ["debateai_runtime", "debateai_authorization_runtime", "debateai_erasure_runtime", "debateai_replay", "debateai_data_export_worker",
      "debateai_staff_security_owner", "debateai_content_provision", "debateai_rls_all_accounts"];
    expect((await database.pool.query<{ role: string }>("SELECT role FROM unnest($1::text[]) AS role WHERE has_function_privilege(role,$2,'EXECUTE')",
      [roles, READER])).rows).toEqual([]);
    // Neither table it reads is any request role's to read directly.
    expect((await database.pool.query<{ readable: boolean }>(`SELECT has_table_privilege('debateai_billing_runtime','identity.free_public_ask','SELECT')
      OR has_table_privilege('debateai_billing_runtime','serve.publication_check_record','SELECT') AS readable`)).rows[0]!.readable).toBe(false);
    for (const key of ["AUTHORIZATION_DATABASE_URL", "RUNNER_DATABASE_URL", "ERASURE_DATABASE_URL", "DATA_EXPORT_DATABASE_URL", "SUPPORT_DATABASE_URL"] as const) {
      const pool = createPool(logins.url(key), { max: 1 });
      opened.push(pool);
      await expect(pool.query("SELECT identity.read_free_debate_refused_by_check($1,$2)", [owner.ownerRef, randomUUID()]), key)
        .rejects.toMatchObject({ code: "42501" });
    }
    // Its shape: a STABLE definer with the search path pinned, owned as identity.read_run_is_dig is.
    expect((await database.pool.query(`SELECT p.provolatile AS volatility, p.prosecdef AS definer, p.proconfig AS config,
        pg_get_userbyid(p.proowner) = (SELECT pg_get_userbyid(d.proowner) FROM pg_proc AS d WHERE d.oid='identity.read_run_is_dig(uuid,uuid)'::regprocedure) AS same_owner
      FROM pg_proc AS p WHERE p.oid=$1::regprocedure`, [READER])).rows).toEqual([{ volatility: "s", definer: true, config: ["search_path=pg_catalog"], same_owner: true }]);
  });

  it("on the production logins: the owner's own request on api-runtime reads KEPT_PRIVATE, another account's reads nothing", async () => {
    const run = await freeDebate("production");
    expect(await sweep(run, BLOCK)).toMatchObject({ outcome: "REFUSED" });
    const production = await logins.production();
    const system = createPool(production.url("api-system"), { max: 2 });
    const runtime = createPool(production.url("api-runtime"), { max: 2, crossAccount: system });
    opened.push(runtime, system);
    const application = new PostgresPublicationApplication(new PostgresPublicationRepository(runtime, HASHER), CIPHER);
    expect(await inAccountRequest(ownerToken, () => application.readOwnedVisibility({ runId: run.runId, authenticated: sessionOf(owner) })))
      .toStrictEqual(KEPT_PRIVATE);
    expect(await inAccountRequest(other.token, () => application.readOwnedVisibility({ runId: run.runId, authenticated: sessionOf(other) }))).toBeNull();
    expect(await asked(runtime, other.token, owner.ownerRef, run.runId)).toBeNull();
  }, 180_000);
});
