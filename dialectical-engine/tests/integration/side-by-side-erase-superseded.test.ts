import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool as PgPool, type PoolClient } from "pg";
import { buildApi, type AskApplication } from "@debateai/api";
import { WorkItemRepository } from "@debateai/battery";
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
import { apiTestPools, provisionRlsLogins, type ApiTestPools } from "../support/rls-logins.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4 (plan A addendum A-x3) — DELETING A DEBATE ERASES EVERY RUN OF IT. A debate that
 * waited through an upload is re-admitted as a NEW run that supersedes the old one (core.run_supersession, 0123 §4); the
 * person's list shows the newest run only. Deleting the debate (DELETE /v1/debates/:id, the id resolved to the newest
 * run) must leave no readable content in ANY run of its chain and no live run key, whichever id the page sent and
 * whichever id the step-up grant is bound to (controller ruling (h): the grant stays bound to the id the page sent).
 * Another person's run and a run outside the chain are never touched; a legacy (plaintext) chain stays out of reach of
 * a signed-in person's per-debate erasure, as a single legacy run always was. The runs are linked by the re-admission
 * marker (security review follow-ups): a copy whose START never committed its edge (recorded FAILED, never started) goes
 * with the debate, an edge to a run that does not re-admit its old run joins nothing, and a plaintext run is never a run
 * of an encrypted debate (so it never blocks its deletion). Over embedded Postgres and migration 0123,
 * through the real route, the real account-erasure application and coordinator (on a connection acting as
 * debateai_erasure_runtime) and a real file key store. CI skips this directory; run it alone.
 */
type Person = Readonly<{ userId: string; ownerRef: string; sessionId: string; identity: TestHttpIdentity }>;

let database: TestDatabase;
let pools: ApiTestPools | undefined;
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
  // R21 (PLAN S5.3): the API's pools are the mode's (the product's logins in API-login mode); seeding stays on the
  // harness superuser.
  pools = await apiTestPools(database, import.meta.url);
  // The erasure application's own login acts as debateai_erasure_runtime (EXECUTE on its exact function list only): the
  // product's erasure login in API-login mode, else, as at base, a harness connection acting as that role.
  erasurePool = pools.erasure !== database.pool ? pools.erasure
    : new PgPool({ connectionString: database.connectionString, max: 2, options: "-c role=debateai_erasure_runtime" });
  const acting = (await erasurePool.query<{ role: string; erasure: boolean; superuser: boolean }>(
    `SELECT current_user AS role, pg_has_role(current_user, 'debateai_erasure_runtime', 'USAGE') AS erasure,
            (SELECT rolsuper FROM pg_roles WHERE rolname = current_user) AS superuser`)).rows[0]!;
  if (!acting.erasure || acting.superuser) throw new Error(`erasure pool acts as ${acting.role}`);
  // A second reader with the cipher, so a read after the erasure never reuses a key loaded before it.
  readerPool = new PgPool({ connectionString: database.connectionString, max: 2 });
  configureContentEncryption(readerPool, new ContentCipher(keys));
}, 600_000);

afterAll(async () => {
  if (erasurePool !== undefined && erasurePool !== pools?.erasure) await erasurePool.end();
  await readerPool?.end();
  if (database !== undefined && pools !== undefined && pools.runtime !== database.pool) await (await provisionRlsLogins(database)).end();
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
  const created = await readmittedRow(old, principal, questionLine);
  if (waits) await enterLine(created);
  await inTransaction((client) => recordRunSupersession(client, { oldRunId: old, newRunId: created }));
  return created;
}

/** The new run's row of a re-admission, and nothing else: a START that never committed its edge (plan C11's orphan). */
async function readmittedRow(old: string, principal: ReadmissionPrincipal, questionLine: string): Promise<string> {
  return new RunRepository(database.pool).startReadmittedRun({
    ...runShape(questionLine), fromRunId: old, principal, registerVersion: 17, releaseKey: NEW_RELEASE
  });
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
    // The application's run-ref read, on its runtime pool as main.ts gives PostgresAskApplication `pool` (R21).
    resolveRunRef: (runId: string) => {
      if (pools === undefined) throw new Error("ERASE_SUPERSEDED_POOLS_UNBUILT");
      return resolveRunRef(pools.runtime, runId);
    }
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

  it("R22 item 16: also deletes the debate's page memory (each run's last visit, every dig link to or from it), nothing else", async () => {
    const question = "Does deleting a debate also forget when its map was last opened?";
    const [oldest, newest] = await readmittedDebate(question, 1) as [string, string];
    const from = await waitingRun("Which debate was it dug from?", ownerPrincipal(), owner.sessionId);
    const dug = await waitingRun("Which dig was started from it?", ownerPrincipal(), owner.sessionId);
    const kept = await waitingRun("Is another debate's memory kept?", ownerPrincipal(), owner.sessionId);
    const keptDig = await waitingRun("Is another dig link kept?", ownerPrincipal(), owner.sessionId);
    // What the V4 pages store (0131), written here by the test's superuser through the same functions the API calls.
    const visit = (run: string) => database.pool.query("SELECT identity.record_debate_last_visit($1,$2,$3::jsonb)",
      [owner.ownerRef, run, JSON.stringify({ "point:n-1": "SURE" })]);
    const dig = async (parent: string, child: string) => expect((await database.pool.query<{ outcome: string }>(
      "SELECT identity.record_dig_link($1,$2,$3,'{}'::text[],'quick') AS outcome", [owner.ownerRef, parent, child])).rows[0]!.outcome).toBe("RECORDED");
    for (const run of [oldest, newest, kept]) await visit(run);
    await dig(from, oldest);
    await dig(newest, dug);
    await dig(kept, keptDig);
    const memory = async () => (await database.pool.query<{ visits: string[]; links: string[] }>(`SELECT
      ARRAY(SELECT run_id::text FROM identity.debate_last_visit WHERE owner_ref=$1 ORDER BY run_id) AS visits,
      ARRAY(SELECT parent_run_id||'>'||child_run_id FROM identity.dig_link WHERE owner_ref=$1 ORDER BY 1) AS links`, [owner.ownerRef])).rows[0]!;
    const before = await memory();
    expect(before.visits).toEqual(expect.arrayContaining([oldest, newest, kept]));
    expect(before.links).toEqual(expect.arrayContaining([`${from}>${oldest}`, `${newest}>${dug}`, `${kept}>${keptDig}`]));

    const grant = await deletionGrant(owner, newest);
    expect(await deleteDebate(owner, newest, grant)).toEqual({ status: 200, body: JSON.stringify({ status: "CLEANED" }) });

    for (const runId of [oldest, newest]) expect(await remains(runId), runId).toEqual(ERASED);
    const after = await memory();
    expect(after.visits).not.toContain(oldest);
    expect(after.visits).not.toContain(newest);
    expect(after.visits).toContain(kept);
    expect(after.links.filter((link) => link.includes(oldest) || link.includes(newest))).toEqual([]);
    expect(after.links).toContain(`${kept}>${keptDig}`);
    // The debates on the other end of a deleted link are still the person's, with their own memory untouched.
    expect(await remains(from)).toEqual(untouched("Which debate was it dug from?"));
    expect(await remains(dug)).toEqual(untouched("Which dig was started from it?"));
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

  it("erases the copies no edge links (recorded FAILED, never started) with the debate; another person's marked run is never touched", async () => {
    const question = "Should the copies a failed start left behind go with the debate?";
    const oldest = await waitingRun(question, ownerPrincipal(), owner.sessionId);
    // A first re-admission whose START failed after its row committed: recorded FAILED, which frees the old run.
    const failed = await readmittedRow(oldest, readmittedOwner(), question);
    expect(await new WorkItemRepository(database.pool).recordSetupFailure({
      runId: failed, batteryRowId: "Q1", commandKey: `S00:${failed}:Q1`, reason: "RUN_SETUP_FAILED:READMISSION"
    })).toBe(true);
    const newest = await readmit(oldest, readmittedOwner(), question, true);
    // The newest run's own re-admission, cut short before its START (a crash, or a deletion landing in between): a row,
    // no edge, no job.
    const unstarted = await readmittedRow(newest, readmittedOwner(), question);
    expect(await resolveRunRef(database.pool, oldest)).toBe(newest);
    const foreignQuestion = "Another person's question, marked past the provision";
    const foreign = await waitingRun(foreignQuestion, { kind: "server", userId: other.userId, ownerRef: other.ownerRef }, other.sessionId);
    // Only a superuser can write it: another person's run whose binding claims to re-admit this debate's first run.
    await database.pool.query(
      "UPDATE identity.run_execution_binding SET readmitted_from_run_id = $1 WHERE run_id = $2", [oldest, foreign]);
    for (const runId of [oldest, failed, newest, unstarted]) expect(await remains(runId), runId).toEqual(untouched(question));
    const audits = await erasedAudits();

    const grant = await deletionGrant(owner, oldest);
    expect(await deleteDebate(owner, oldest, grant)).toEqual({ status: 200, body: JSON.stringify({ status: "CLEANED" }) });

    for (const runId of [oldest, failed, newest, unstarted]) expect(await remains(runId), runId).toEqual(ERASED);
    expect(await erasedAudits()).toBe(audits + 4);
    expect(await remains(foreign)).toEqual(untouched(foreignQuestion));
    // The cut-short START can no longer link its copy: the run it re-admits no longer waits.
    await expect(inTransaction((client) => recordRunSupersession(client, { oldRunId: newest, newRunId: unstarted })))
      .rejects.toThrow("RUN_SUPERSESSION_INVALID");
  });

  it("follows an edge only to the re-admission of its old run: an edge between two of the person's debates joins nothing", async () => {
    const firstQuestion = "Is a debate an edge points away from deleted with the other one?";
    const secondQuestion = "Is the debate an edge points at deleted alone?";
    const first = await waitingRun(firstQuestion, ownerPrincipal(), owner.sessionId);
    const second = await waitingRun(secondQuestion, ownerPrincipal(), owner.sessionId);
    // The guard allows this edge: the old run waits, the new run is the same person's, live, unmarked, with no edge.
    await inTransaction((client) => recordRunSupersession(client, { oldRunId: first, newRunId: second }));
    expect(await resolveRunRef(database.pool, first)).toBe(second);
    // The second run does not re-admit the first, so a grant bound to the first does not open the second ...
    const firstGrant = await deletionGrant(owner, first);
    expect((await deleteDebate(owner, second, firstGrant)).status).toBe(404);
    expect(await grantConsumed(firstGrant)).toBe(false);
    // ... and deleting the second leaves the first as it was.
    const secondGrant = await deletionGrant(owner, second);
    expect(await deleteDebate(owner, second, secondGrant)).toEqual({ status: 200, body: JSON.stringify({ status: "CLEANED" }) });
    expect(await remains(second)).toEqual(ERASED);
    expect(await remains(first)).toEqual(untouched(firstQuestion));
  });

  it("a plaintext run marked as a copy of an encrypted debate shares no chain with it: it never blocks the deletion, nor is touched", async () => {
    const question = "Does a plaintext copy keep the encrypted copies from going?";
    const [oldest, newest] = await readmittedDebate(question, 1) as [string, string];
    const plainQuestion = "A plaintext run the same person claimed";
    const plain = await waitingRun(plainQuestion, { kind: "legacy", legacyAskerId: `legacy-erase-superseded-${randomUUID()}` }, randomUUID());
    // Only a superuser can write these (no provision marks a plaintext run: §4 re-admits encrypted runs only): the person
    // owns the plaintext run (its first and latest ownership event), and its binding claims to re-admit the first run.
    await inTransaction(async (client) => {
      await client.query("SET LOCAL session_replication_role = replica");
      await client.query(
        "INSERT INTO core.run_ownership_event (run_id, owner_ref, at_seq) VALUES ($1, $2, ledger.allocate_sequence())",
        [plain, owner.ownerRef]);
      await client.query(
        `INSERT INTO identity.run_execution_binding (execution_ref, user_id, identity_session_id, run_id, created_at, readmitted_from_run_id)
         VALUES ($1, $2, $3, $4, now(), $5)`, [randomUUID(), owner.userId, owner.sessionId, plain, oldest]);
    });
    // Named, it is one legacy run, as 0040 always answered it: kept, and no encrypted run touched.
    const plainGrant = await deletionGrant(owner, plain);
    expect(await deleteDebate(owner, plain, plainGrant)).toEqual({ status: 409, body: JSON.stringify({ error: "LEGACY_CONTENT_RETAINED" }) });
    for (const runId of [oldest, newest]) expect(await remains(runId), runId).toEqual(untouched(question));
    // Deleting the debate erases both encrypted runs; the plaintext run is no run of it and stays as it was.
    const grant = await deletionGrant(owner, newest);
    expect(await deleteDebate(owner, newest, grant)).toEqual({ status: 200, body: JSON.stringify({ status: "CLEANED" }) });
    for (const runId of [oldest, newest]) expect(await remains(runId), runId).toEqual(ERASED);
    expect(await remains(plain)).toMatchObject({ key: false, question: plainQuestion, tombstone: false, intent: false });
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
