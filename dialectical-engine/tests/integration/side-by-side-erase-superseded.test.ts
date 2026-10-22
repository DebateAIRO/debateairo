import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool as PgPool, type PoolClient } from "pg";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  ContentCipher, FileRunContentKeyStore, FileUserDekStore, generateDek, hashToken, loadKek,
  type AuditContextHasher, type RunContentKeyStore
} from "@debateai/crypto";
import {
  PostgresAccountErasureRepository, PostgresPrivateRunErasureRepository, PrivateRunErasureCoordinator, RunRepository,
  RunWaitRepository, configureContentEncryption, migrate, recordRunSupersession, resolveRunRef,
  type ReadmissionPrincipal, type StartRunInput
} from "@debateai/db";
import { ServeRepository } from "@debateai/serve";
import { PostgresAccountErasureApplication } from "../../apps/api/src/account-erasure.js";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { TEST_APP_ORIGIN, testSessionApplication, testSessionHeaders, type TestHttpIdentity } from "../support/httpSession.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4 (plan A addendum A-x3) — DELETING A DEBATE ERASES EVERY RUN OF IT. A debate that
 * waited through an upload is re-admitted as a NEW run that supersedes the old one (core.run_supersession, 0123 §4); the
 * person's list shows the newest run only. Deleting the debate (DELETE /v1/debates/:id, the id resolved to the newest
 * run) must leave no readable content in ANY run of its chain and no live run key, whichever id the page sent and
 * whichever id the step-up grant is bound to (controller ruling (h): the grant stays bound to the id the page sent).
 * Another person's run and a run outside the chain are never touched; a legacy (plaintext) chain stays out of reach of
 * a signed-in person's per-debate erasure, as a single legacy run always was. Over embedded Postgres and migration 0123,
 * through the real route, the real account-erasure application and coordinator (on a connection acting as
 * debateai_erasure_runtime) and a real file key store. CI skips this directory; run it alone.
 */
type Person = Readonly<{ userId: string; ownerRef: string; sessionId: string; identity: TestHttpIdentity }>;

let database: TestDatabase;
let secretRoot: string;
let keys: FileRunContentKeyStore;
let erasurePool: PgPool;
let readerPool: PgPool;
let owner: Person;
let other: Person;
/** One key destroy that fails, for the resumability case (the coordinator's key store is `flakyKeys`). */
let failDestroyOnce: string | null = null;

const OLD_RELEASE = ["r16", "0123456789ab"].join("-");
const NEW_RELEASE = ["r17", "0123456789ab"].join("-");

async function person(label: string, users: FileUserDekStore): Promise<Person> {
  const userId = randomUUID(), ownerRef = randomUUID(), sessionId = randomUUID();
  const rawSessionToken = randomBytes(32).toString("base64url");
  const rawCsrfToken = randomBytes(32).toString("base64url");
  await database.pool.query(
    `INSERT INTO identity."user" (
       user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
       phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
       adult_affirmed_at,created_at
     ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'test-password-hash',$3,$4,$5,'active',now(),now())`,
    [userId, randomBytes(32), `erase-superseded-${label}-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await database.pool.query(
    `INSERT INTO identity.session(
       session_id,user_id,token_hash,csrf_token_hash,binding_context,
       created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
     ) VALUES ($1,$2,$3,$4,'{}'::jsonb,now(),now(),now()+interval '1 hour',now()+interval '2 hours',now())`,
    [sessionId, userId, hashToken("session", rawSessionToken), hashToken("csrf", rawCsrfToken)]
  );
  await users.store(userId, generateDek());
  const identity: TestHttpIdentity = Object.freeze({
    rawSessionToken, rawCsrfToken,
    authenticated: Object.freeze({
      session: Object.freeze({
        asker_id: `owner:${ownerRef}`, session_id: sessionId, caller_scope: "ASKER" as const,
        ownership_provenance: "server_session" as const, provisional_identity_model: false as const
      }),
      userId, ownerRef, tokenHash: hashToken("session", rawSessionToken), csrfTokenHash: hashToken("csrf", rawCsrfToken),
      authKind: "cookie" as const
    })
  });
  return Object.freeze({ userId, ownerRef, sessionId, identity });
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  secretRoot = await mkdtemp(join(tmpdir(), "debateai-erase-superseded-"));
  const users = new FileUserDekStore(secretRoot, loadKek(generateDek()));
  const resolver = new Map<string, string>();
  keys = new FileRunContentKeyStore(secretRoot, users, async (candidate) => {
    const userId = resolver.get(candidate);
    if (userId === undefined) throw new Error("OWNER_REF_UNRESOLVED");
    return userId;
  });
  owner = await person("owner", users);
  other = await person("other", users);
  resolver.set(owner.ownerRef, owner.userId).set(other.ownerRef, other.userId);
  configureContentEncryption(database.pool, new ContentCipher(keys));
  // The erasure application's own login acts as debateai_erasure_runtime (EXECUTE on its exact function list only).
  erasurePool = new PgPool({ connectionString: database.connectionString, max: 2, options: "-c role=debateai_erasure_runtime" });
  const acting = (await erasurePool.query<{ role: string }>("SELECT current_user AS role")).rows[0]!.role;
  if (acting !== "debateai_erasure_runtime") throw new Error(`erasure pool acts as ${acting}`);
  // A second reader with the cipher, so a read after the erasure never reuses a key loaded before it.
  readerPool = new PgPool({ connectionString: database.connectionString, max: 2 });
  configureContentEncryption(readerPool, new ContentCipher(keys));
}, 600_000);

afterAll(async () => {
  await erasurePool?.end();
  await readerPool?.end();
  await database?.stop();
  if (secretRoot !== undefined) await rm(secretRoot, { recursive: true, force: true });
});

async function inTransaction<T>(use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await database.pool.connect();
  try {
    await client.query("BEGIN");
    const result = await use(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

const runShape = (questionLine: string) => ({
  questionLine, asOf: new Date("2026-10-22T00:00:00.000Z"),
  askerRiskTier: "casual" as const, effectiveRiskTier: "casual" as const, tierSource: "ASKER" as const,
  tierProvenanceRef: "asker:erase-superseded", compositionBudgetTier: "low" as const, planTier: "free" as const,
  depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(2), strangerSampleRate: 0,
  envelopeBasis: fixtureStructuralCeiling(4), batteryVersion: "erase-superseded",
  askContract: { decision_scope: "erase-superseded integration test", steering_presets: [], steering_annotations: [] },
  batteryRows: []
});

/** A run the old release admitted and placed in line (waiting for the site), as T-1 left it. */
async function waitingRun(questionLine: string, principal: StartRunInput["principal"], sessionId: string): Promise<string> {
  const runId = await new RunRepository(database.pool).startRun({
    ...runShape(questionLine), principal, sessionId, callerScope: "ASKER", registerVersion: 16, releaseKey: OLD_RELEASE
  });
  await enterLine(runId);
  return runId;
}

async function enterLine(runId: string): Promise<void> {
  const line = new RunWaitRepository(database.pool);
  await inTransaction(async (client) => {
    await line.enterWait(client, runId, new Date());
    await line.recordReason(client, runId, { waitsFor: "SWITCHING", personRecheckAt: null, at: new Date() });
  });
}

/**
 * The re-admission of `old` as the waker writes it (plan C11): the new run under r17 (an owner's re-encrypted under its
 * own new key, a legacy asker's copied in the clear), then the edge. `waits` puts the new run in line too, so a later
 * upload can re-admit it once more.
 */
async function readmit(old: string, principal: ReadmissionPrincipal, questionLine: string, waits = false): Promise<string> {
  const created = await new RunRepository(database.pool).startReadmittedRun({
    ...runShape(questionLine), fromRunId: old, principal, registerVersion: 17, releaseKey: NEW_RELEASE
  });
  if (waits) await enterLine(created);
  await inTransaction((client) => recordRunSupersession(client, { oldRunId: old, newRunId: created }));
  return created;
}

const ownerPrincipal = () => ({ kind: "server" as const, userId: owner.userId, ownerRef: owner.ownerRef });
const readmittedOwner = (): ReadmissionPrincipal => ({ kind: "readmitted-owner", ownerRef: owner.ownerRef });

/** An encrypted debate of the owner re-admitted `uploads` times: its runs, oldest first. */
async function readmittedDebate(question: string, uploads: number): Promise<string[]> {
  const chain = [await waitingRun(question, ownerPrincipal(), owner.sessionId)];
  for (let upload = 1; upload <= uploads; upload += 1) {
    chain.push(await readmit(chain.at(-1)!, readmittedOwner(), question, upload < uploads));
  }
  return chain;
}

/** A step-up grant for DELETE_PRIVATE_DEBATE bound to `targetRunId`, as POST /v1/auth/step-up stores one; its raw token. */
async function deletionGrant(who: Person, targetRunId: string): Promise<string> {
  const raw = randomBytes(32).toString("base64url");
  await database.pool.query(
    `INSERT INTO identity.step_up_grant(
       step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,
       target_account_id,issued_at,expires_at,consumed_at
     ) VALUES ($1,$2,$3,$4,'DELETE_PRIVATE_DEBATE',$5,NULL,now(),now()+interval '10 minutes',NULL)`,
    [randomUUID(), hashToken("step-up-grant", raw), who.sessionId, who.userId, targetRunId]
  );
  return raw;
}

async function grantConsumed(raw: string): Promise<boolean> {
  return (await database.pool.query<{ consumed: boolean }>(
    "SELECT consumed_at IS NOT NULL AS consumed FROM identity.step_up_grant WHERE token_hash = $1",
    [hashToken("step-up-grant", raw)]
  )).rows[0]!.consumed;
}

/** The route's minimal ask application: only the run-ref resolution the DELETE route asks for is real. */
function askApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => { throw new Error("UNEXPECTED_SUBMIT"); },
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () { /* no events */ },
    resolveRunRef: (runId: string) => resolveRunRef(database.pool, runId)
  };
}

/** The coordinator's key store: the real one, except one destroy that fails when `failDestroyOnce` names its run. */
const flakyKeys = (): RunContentKeyStore => ({
  store: (runId, identity, key) => keys.store(runId, identity, key),
  load: (runId) => keys.load(runId),
  exists: (runId) => keys.exists(runId),
  ownerRef: (runId) => keys.ownerRef(runId),
  listByOwner: (ownerRef) => keys.listByOwner(ownerRef),
  destroy: async (runId) => {
    if (failDestroyOnce === runId) {
      failDestroyOnce = null;
      throw new Error("KEY_STORE_UNAVAILABLE");
    }
    return keys.destroy(runId);
  }
});

async function deleteDebate(who: Person, pathId: string, grant: string) {
  const hasher = {} as AuditContextHasher;
  const api = buildApi({
    application: askApplication(),
    sessions: testSessionApplication([owner.identity, other.identity]),
    accountErasure: new PostgresAccountErasureApplication(
      new PostgresAccountErasureRepository(erasurePool, hasher),
      new PrivateRunErasureCoordinator(new PostgresPrivateRunErasureRepository(erasurePool, hasher), flakyKeys())
    ),
    allowedOrigin: TEST_APP_ORIGIN
  });
  try {
    const response = await api.inject({
      method: "DELETE", url: `/v1/debates/${pathId}`, headers: testSessionHeaders(who.identity, true),
      payload: { step_up_grant: grant }
    });
    return { status: response.statusCode, body: response.body };
  } finally {
    await api.close();
  }
}

/** What is left of a run: its key, its readable question (a fresh read through the cipher), its erasure records. */
async function remains(runId: string) {
  const row = (await database.pool.query<{ tombstone: boolean; intent: boolean; secret: boolean; live: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM serve.private_run_erasure_tombstone WHERE run_id = $1) AS tombstone,
            EXISTS (SELECT 1 FROM serve.private_run_key_cleanup_intent WHERE run_id = $1) AS intent,
            EXISTS (SELECT 1 FROM core.run_content_attestation_secret WHERE run_id = $1) AS secret,
            core.run_private_content_is_live($1) AS live`, [runId]
  )).rows[0]!;
  let question: string | null;
  try {
    question = (await new RunRepository(readerPool).readFrozenHead(runId)).questionLine;
  } catch (error) {
    if ((error as { code?: unknown }).code !== "PRIVATE_CONTENT_ERASED") throw error;
    question = null;
  }
  return { key: await keys.exists(runId), question, ...row };
}

const ERASED = { key: false, question: null, tombstone: true, intent: false, secret: false, live: false };
const untouched = (question: string) => ({ key: true, question, tombstone: false, intent: false, secret: true, live: true });

async function erasedAudits(): Promise<number> {
  return (await database.pool.query<{ n: number }>(
    "SELECT count(*)::integer AS n FROM identity.audit_event WHERE event_type = 'debate.private.erased'"
  )).rows[0]!.n;
}

describe("side-by-side A-x3: deleting a re-admitted debate erases every run of its chain", () => {
  it("by the OLD id, the grant bound to the OLD id: all three runs of a twice re-admitted debate are erased, nothing else", async () => {
    const question = "Should a debate deleted after two uploads leave nothing behind?";
    const [oldest, middle, newest] = await readmittedDebate(question, 2) as [string, string, string];
    expect(await resolveRunRef(database.pool, oldest)).toBe(newest);
    const unrelatedQuestion = "Is the person's other debate left alone?";
    const unrelated = await waitingRun(unrelatedQuestion, ownerPrincipal(), owner.sessionId);
    const foreignQuestion = "Is another person's debate left alone?";
    const foreign = await waitingRun(foreignQuestion, { kind: "server", userId: other.userId, ownerRef: other.ownerRef }, other.sessionId);
    // Each run of the chain has its own content and its own live key before the deletion.
    for (const runId of [oldest, middle, newest]) expect(await remains(runId)).toEqual(untouched(question));
    const library = async () => (await new ServeRepository(database.pool).readAnswerIndex(
      { ownerRef: owner.ownerRef, legacyAskerId: null }, 100, 0)).open_runs.map((run) => run.run_ref);
    expect(await library()).toContain(newest);
    expect(await library()).not.toContain(oldest);
    const audits = await erasedAudits();

    const grant = await deletionGrant(owner, oldest);
    expect(await deleteDebate(owner, oldest, grant)).toEqual({ status: 200, body: JSON.stringify({ status: "CLEANED" }) });

    for (const runId of [oldest, middle, newest]) expect(await remains(runId), runId).toEqual(ERASED);
    expect(await erasedAudits()).toBe(audits + 3);
    expect(await grantConsumed(grant)).toBe(true);
    expect(await remains(unrelated)).toEqual(untouched(unrelatedQuestion));
    expect(await remains(foreign)).toEqual(untouched(foreignQuestion));
    // The person's list no longer names any run of the debate; the other debate is still there.
    expect(await library()).not.toContain(newest);
    expect(await library()).toContain(unrelated);
    // A second deletion of the same debate with the spent grant finds nothing (as for a never re-admitted debate).
    expect((await deleteDebate(owner, newest, grant)).status).toBe(404);
  });

  it("by the NEW id, the grant bound to the NEW id: the superseded run is erased with it", async () => {
    const question = "Should the superseded copy go when the newest run is deleted?";
    const [oldest, newest] = await readmittedDebate(question, 1) as [string, string];
    const grant = await deletionGrant(owner, newest);
    expect(await deleteDebate(owner, newest, grant)).toEqual({ status: 200, body: JSON.stringify({ status: "CLEANED" }) });
    expect(await remains(oldest)).toEqual(ERASED);
    expect(await remains(newest)).toEqual(ERASED);
  });

  it("by the OLD id with the grant bound to the NEW id (the page's own run_ref): the whole chain is erased", async () => {
    const question = "Should an old link with a fresh grant delete the whole debate?";
    const [oldest, newest] = await readmittedDebate(question, 1) as [string, string];
    const grant = await deletionGrant(owner, newest);
    expect((await deleteDebate(owner, oldest, grant)).status).toBe(200);
    expect(await remains(oldest)).toEqual(ERASED);
    expect(await remains(newest)).toEqual(ERASED);
  });

  it("is resumable: a key store failure part-way leaves no run readable, and the same grant finishes the rest", async () => {
    const question = "Should a deletion that stops half-way finish on the next try?";
    const [oldest, middle, newest] = await readmittedDebate(question, 2) as [string, string, string];
    const grant = await deletionGrant(owner, newest);
    failDestroyOnce = middle;
    expect((await deleteDebate(owner, newest, grant)).status).toBe(500);
    expect(failDestroyOnce).toBeNull();
    // Already nothing is readable: every run of the chain was marked in the one prepare transaction.
    for (const runId of [oldest, middle, newest]) {
      expect(await remains(runId), runId).toMatchObject({ question: null, secret: false, live: false });
    }
    expect(await keys.exists(middle)).toBe(true);
    expect(await deleteDebate(owner, newest, grant)).toEqual({ status: 200, body: JSON.stringify({ status: "CLEANED" }) });
    for (const runId of [oldest, middle, newest]) expect(await remains(runId), runId).toEqual(ERASED);
  });

  it("never waits: a re-admission writing its edge, or a reader of an old run, answers PENDING with nothing spent", async () => {
    const question = "Should a deletion step aside for a re-admission in flight?";
    const [oldest, newest] = await readmittedDebate(question, 1) as [string, string];
    const grant = await deletionGrant(owner, newest);
    const lease = `debateai:run-content-lease:v1:${oldest}`;
    const holder = await database.pool.connect();
    try {
      // START holds the supersession guard's lock until its edge commits (0123 §4).
      await holder.query("BEGIN");
      await holder.query("SELECT pg_advisory_xact_lock(hashtextextended('debateai:run-supersession', 0))");
      expect(await deleteDebate(owner, newest, grant)).toEqual({ status: 202, body: JSON.stringify({ status: "PENDING" }) });
      await holder.query("ROLLBACK");
      // A reader of the old run's private content holds its shared lease (the API leases only the run named).
      await holder.query("SELECT pg_advisory_lock_shared(hashtextextended($1, 0))", [lease]);
      expect(await deleteDebate(owner, newest, grant)).toEqual({ status: 202, body: JSON.stringify({ status: "PENDING" }) });
      await holder.query("SELECT pg_advisory_unlock_shared(hashtextextended($1, 0))", [lease]);
    } finally {
      holder.release();
    }
    expect(await grantConsumed(grant)).toBe(false);
    expect(await remains(oldest)).toEqual(untouched(question));
    expect(await remains(newest)).toEqual(untouched(question));
    expect((await deleteDebate(owner, newest, grant)).status).toBe(200);
    expect(await remains(oldest)).toEqual(ERASED);
    expect(await remains(newest)).toEqual(ERASED);
  });

  it("refuses a grant bound to another debate, and another person's grant, touching nothing", async () => {
    const question = "Does a grant for another debate open this one?";
    const [oldest, newest] = await readmittedDebate(question, 1) as [string, string];
    const elsewhere = await waitingRun("The person's other debate", ownerPrincipal(), owner.sessionId);
    const wrongDebate = await deletionGrant(owner, elsewhere);
    expect((await deleteDebate(owner, oldest, wrongDebate)).status).toBe(404);
    expect(await grantConsumed(wrongDebate)).toBe(false);
    // Another person signed in, with a grant bound to this debate's ids: no run of theirs, nothing happens.
    for (const target of [oldest, newest]) {
      const foreignGrant = await deletionGrant(other, target);
      expect((await deleteDebate(other, target, foreignGrant)).status).toBe(404);
      expect(await grantConsumed(foreignGrant)).toBe(false);
    }
    expect(await remains(oldest)).toEqual(untouched(question));
    expect(await remains(newest)).toEqual(untouched(question));
    expect(await remains(elsewhere)).toEqual(untouched("The person's other debate"));
  });

  it("never touches another person's run, even on an edge written past the guard", async () => {
    const question = "Is a forged edge to another person's run ignored?";
    const [oldest, newest] = await readmittedDebate(question, 1) as [string, string];
    const foreignQuestion = "Another person's waiting question";
    const foreign = await waitingRun(foreignQuestion, { kind: "server", userId: other.userId, ownerRef: other.ownerRef }, other.sessionId);
    // Only a superuser can write it: the guard (same person, old run waiting) is bypassed for this one row.
    await inTransaction(async (client) => {
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query("INSERT INTO core.run_supersession (old_run_id, new_run_id, reason) VALUES ($1, $2, 'READMITTED')", [foreign, oldest]);
    });
    const grant = await deletionGrant(owner, newest);
    expect((await deleteDebate(owner, newest, grant)).status).toBe(200);
    expect(await remains(oldest)).toEqual(ERASED);
    expect(await remains(newest)).toEqual(ERASED);
    expect(await remains(foreign)).toEqual(untouched(foreignQuestion));
  });

  it("a re-admitted legacy (plaintext) debate stays out of a signed-in person's per-debate erasure, by either id", async () => {
    const question = "Does a legacy asker's re-admitted question stay where it was?";
    const askerId = `legacy-erase-superseded-${randomUUID()}`;
    const oldest = await waitingRun(question, { kind: "legacy", legacyAskerId: askerId }, randomUUID());
    const newest = await readmit(oldest, { kind: "legacy", legacyAskerId: askerId }, question);
    expect(await resolveRunRef(database.pool, oldest)).toBe(newest);
    for (const target of [oldest, newest]) {
      const grant = await deletionGrant(owner, target);
      expect((await deleteDebate(owner, target, grant)).status).toBe(404);
      expect(await grantConsumed(grant)).toBe(false);
    }
    // Plaintext legacy content was never erasable per debate (0040: LEGACY_PLAINTEXT_RETAINED); nothing changed.
    for (const runId of [oldest, newest]) {
      expect(await remains(runId)).toMatchObject({ key: false, question, tombstone: false, intent: false });
    }
  });
});
