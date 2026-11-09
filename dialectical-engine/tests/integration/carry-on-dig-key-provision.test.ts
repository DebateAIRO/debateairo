import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { encrypt, generateDek } from "@debateai/crypto";
import type { PathId } from "@debateai/contract";
import { PostgresStartPathsStore, RunRepository, RunWaitRepository, type StartRunInput, type StoredStartPathSet } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";

/**
 * 0163 (V4 start step, plan 2026-11-03 Task 56a; decision record answer 11, owner ruling 3 Nov night): the carry-on's digs run even when
 * the person has signed out or their session has lapsed. A dig of the carry-on is a NEW encrypted run whose key is provisioned from the
 * debate's own binding (the same user and identity session, signed out or not), once per chosen path and never again, Free once in all,
 * while the carry-on is BEGUN and not DONE and the account is active and still the debate's owner. The ordinary provision (0040) still
 * needs a live session, and 0123's re-admission still commits. Over embedded Postgres and the forward chain to 0163, with the content
 * cipher configured (tests/support/contentRunFixture.ts). Made-up questions and paths. CI skips this directory; run it alone.
 */
let fixture: ContentRunFixture;
let store: PostgresStartPathsStore;

beforeAll(async () => {
  fixture = await startContentRunFixture("carry-on-0163");
  store = new PostgresStartPathsStore(fixture.database.pool);
}, 600_000);
afterAll(async () => { await fixture?.stop(); });

const runInput = (questionLine: string, principal: StartRunInput["principal"], planTier: "free" | "premium",
  sessionId: string = fixture.authSessionId): StartRunInput => ({
  questionLine,
  askContract: { audience: "carry-on-0163" },
  principal,
  sessionId,
  callerScope: "ASKER",
  asOf: new Date("2026-11-05T00:00:00.000Z"),
  askerRiskTier: "casual",
  effectiveRiskTier: "casual",
  tierSource: "ASKER",
  tierProvenanceRef: "carry-on-0163:integration",
  compositionBudgetTier: "low",
  planTier,
  depthParams: { depth: 1 },
  discoveredPanel: fixtureDiscoveredPanel(1),
  strangerSampleRate: 1,
  envelopeBasis: fixtureStructuralCeiling(4),
  registerVersion: 1,
  batteryVersion: "carry-on-0163:integration",
  batteryRows: []
});
const owner = (): StartRunInput["principal"] => ({ kind: "server", userId: fixture.userId, ownerRef: fixture.ownerRef });
const runs = (): RunRepository => new RunRepository(fixture.database.pool);

/** The chosen paths b1..bN of a made-up debate, the carry-on box ticked. */
const setOf = (runId: string, count: number): StoredStartPathSet => Object.freeze({
  runId, source: "MENU", width: 5, chosenBy: "PERSON", carryOnToReport: true, menu: null,
  paths: Object.freeze(Array.from({ length: count }, (_, index) => index + 1).map((no) => Object.freeze({
    pathId: `b${String(no)}` as PathId, pathNo: no, author: "AI_SUGGESTION" as const, title: `Path ${String(no)}`,
    question: `What does path ${String(no)} weigh for the harbour?`, ownWords: Object.freeze([]),
    viewpoints: Object.freeze([{ viewpointId: `pt1${String(no)}`, pickNo: null, title: `Path ${String(no)}`,
      question: `What does path ${String(no)} weigh for the harbour?`, own: false }])
  })))
});

/** A parent debate of the fixture's owner, written while the Start session is live: its paths, DUE, and BEGUN unless told otherwise. */
async function parent(planTier: "free" | "premium", begun = true, paths = 3): Promise<string> {
  const runId = await runs().startRun(runInput("Should the harbour keep its winter ferry?", owner(), planTier));
  expect(await store.recordStartPaths(setOf(runId, paths))).toBe("RECORDED");
  expect(await store.recordCarryOnDue(runId)).toBe("RECORDED");
  if (begun) await fixture.database.pool.query("INSERT INTO core.carry_on_mark (run_id, mark) VALUES ($1, 'BEGUN')", [runId]);
  return runId;
}
const done = async (runId: string): Promise<void> => {
  expect((await fixture.database.pool.query<{ outcome: string }>("SELECT core.record_carry_on_done($1) AS outcome", [runId])).rows[0]!.outcome)
    .toBe("RECORDED");
};

/** The owner's only session, revoked (the person signed out) while `use` runs, then live again. */
async function signedOut<T>(use: () => Promise<T>): Promise<T> {
  const pool = fixture.database.pool;
  await pool.query("UPDATE identity.session SET revoked_at = clock_timestamp() WHERE session_id = $1", [fixture.authSessionId]);
  try { return await use(); } finally {
    await pool.query("UPDATE identity.session SET revoked_at = NULL WHERE session_id = $1", [fixture.authSessionId]);
  }
}

/** A carry-on dig of `parentRunId`'s path, as the server starts one: no live session, and no session id of the shape a sign-in has. */
const dig = (parentRunId: string, pathId: string, principal: Readonly<{ userId: string; ownerRef: string }> = fixture,
  planTier: "free" | "premium" = "premium"): Promise<string> =>
  runs().startRun(runInput(`Dig ${pathId}: what would a second pier change?`,
    { kind: "server", userId: principal.userId, ownerRef: principal.ownerRef, carryOn: { parentRunId, pathId } }, planTier, "carry-on"));

async function refusal(work: Promise<unknown>): Promise<unknown> {
  try { await work; } catch (error) { return error; }
  throw new Error("expected a refusal");
}
const codeOf = (error: unknown): unknown => (error as { code?: unknown }).code;
/** Everything a dig of `parentRunId` could leave: its bindings, its pending intents and the runs written under them. */
const leftBy = async (parentRunId: string): Promise<Readonly<{ bindings: number; intents: number; runs: number }>> => {
  const pool = fixture.database.pool;
  const [bindings, intents, written] = await Promise.all([
    pool.query<{ n: number }>("SELECT count(*)::int AS n FROM identity.run_execution_binding WHERE carry_on_parent_run_id = $1", [parentRunId]),
    pool.query<{ n: number }>("SELECT count(*)::int AS n FROM core.run_key_provision_intent WHERE carry_on_parent_run_id = $1", [parentRunId]),
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM core.run AS run JOIN identity.run_execution_binding AS binding
      ON binding.run_id = run.run_id WHERE binding.carry_on_parent_run_id = $1`, [parentRunId])
  ]);
  return { bindings: bindings.rows[0]!.n, intents: intents.rows[0]!.n, runs: written.rows[0]!.n };
};

describe("0163: a carry-on dig's key provision, without a live sign-in", () => {
  it("a Plus debate's dig of b1 is written with its Start session revoked; a second dig of b1 is TAKEN and writes nothing; b2 is its own", async () => {
    const pool = fixture.database.pool;
    const debate = await parent("premium");
    const first = await signedOut(() => dig(debate, "b1"));
    // The dig is the owner's encrypted run, under its own key (its question reads back), its intent consumed.
    expect((await pool.query("SELECT asker_id, content_encryption_version, plan_tier FROM core.run WHERE run_id = $1", [first])).rows[0])
      .toEqual({ asker_id: `owner:${fixture.ownerRef}`, content_encryption_version: 1, plan_tier: "premium" });
    expect((await runs().readStoredAsk(first))?.questionLine).toBe("Dig b1: what would a second pier change?");
    // Its binding copies the debate's: the same user and the same identity session (revoked), with both markers.
    expect((await pool.query(`SELECT user_id::text, identity_session_id::text, carry_on_parent_run_id::text AS parent_run, carry_on_path_id,
        readmitted_from_run_id FROM identity.run_execution_binding WHERE run_id = $1`, [first])).rows)
      .toEqual([{ user_id: fixture.userId, identity_session_id: fixture.authSessionId, parent_run: debate, carry_on_path_id: "b1",
        readmitted_from_run_id: null }]);
    expect(await leftBy(debate)).toEqual({ bindings: 1, intents: 0, runs: 1 });
    // One dig per path, whatever becomes of it: the second is refused before anything is written.
    const again = await refusal(signedOut(() => dig(debate, "b1")));
    expect(codeOf(again)).toBe("CARRY_ON_DIG_TAKEN");
    expect(await leftBy(debate)).toEqual({ bindings: 1, intents: 0, runs: 1 });
    // Plus digs each chosen path once: b2 is not b1's.
    const second = await signedOut(() => dig(debate, "b2"));
    expect(second).not.toBe(first);
    expect(await leftBy(debate)).toEqual({ bindings: 2, intents: 0, runs: 2 });
  });

  it("the security review's F2 (0171's patch of this body): a carry-on dig marked as the API marks every dig has its own dig row, written by the statement that creates it, its Start session revoked; an unmarked document writes none", async () => {
    const pool = fixture.database.pool;
    const debate = await parent("premium");
    const start = (pathId: string, marked: boolean): Promise<string> => runs().startRun({
      ...runInput(`Dig ${pathId}: what would a second pier change?`, { kind: "server", userId: fixture.userId, ownerRef: fixture.ownerRef, carryOn: { parentRunId: debate, pathId } }, "premium", "carry-on"),
      ...(marked ? { digRun: true as const } : {}) });
    const marked = await signedOut(() => start("b1", true));
    const unmarked = await signedOut(() => start("b2", false));
    const rowsOf = async (runId: string): Promise<readonly unknown[]> => (await pool.query("SELECT owner_ref::text FROM identity.dig_run WHERE run_id = $1", [runId])).rows;
    expect(await rowsOf(marked)).toEqual([{ owner_ref: fixture.ownerRef }]);
    expect(await rowsOf(unmarked)).toEqual([]);
    const isDig = async (runId: string): Promise<boolean> => (await pool.query<{ dig: boolean }>("SELECT identity.run_is_dig($1) AS dig", [runId])).rows[0]!.dig;
    expect([await isDig(marked), await isDig(unmarked), await isDig(debate)]).toEqual([true, false, false]);
  });

  it("a path the debate did not choose (b4 of b1..b3) is INVALID, and nothing is written", async () => {
    const debate = await parent("premium");
    expect(codeOf(await refusal(signedOut(() => dig(debate, "b4"))))).toBe("CARRY_ON_DIG_INVALID");
    expect(codeOf(await refusal(signedOut(() => dig(debate, "b9"))))).toBe("CARRY_ON_DIG_INVALID");
    expect(await leftBy(debate)).toEqual({ bindings: 0, intents: 0, runs: 0 });
  });

  it("a carry-on DUE but not BEGUN is INVALID; once DONE it is INVALID too; nothing is written", async () => {
    const waiting = await parent("premium", false);
    expect(codeOf(await refusal(signedOut(() => dig(waiting, "b1"))))).toBe("CARRY_ON_DIG_INVALID");
    expect(await leftBy(waiting)).toEqual({ bindings: 0, intents: 0, runs: 0 });
    const ended = await parent("premium");
    await done(ended);
    expect(codeOf(await refusal(signedOut(() => dig(ended, "b1"))))).toBe("CARRY_ON_DIG_INVALID");
    expect(await leftBy(ended)).toEqual({ bindings: 0, intents: 0, runs: 0 });
  });

  it("an account no longer active is OWNER_GONE, and nothing is written", async () => {
    const pool = fixture.database.pool;
    const debate = await parent("premium");
    // Signed out first: a suspended account's sessions can no longer be changed (0040's active-user guard).
    await signedOut(async () => {
      await pool.query(`UPDATE identity."user" SET state = 'suspended' WHERE user_id = $1`, [fixture.userId]);
      try {
        expect(codeOf(await refusal(dig(debate, "b1")))).toBe("CARRY_ON_DIG_OWNER_GONE");
      } finally {
        await pool.query(`UPDATE identity."user" SET state = 'active' WHERE user_id = $1`, [fixture.userId]);
      }
    });
    expect(await leftBy(debate)).toEqual({ bindings: 0, intents: 0, runs: 0 });
  });

  it("another owner's debate is INVALID before any provision; the debate's binding answering another user is RUN_OWNER_INVALID", async () => {
    const debate = await parent("premium");
    const stranger = { userId: randomUUID(), ownerRef: randomUUID() };
    expect(codeOf(await refusal(signedOut(() => dig(debate, "b1", stranger))))).toBe("CARRY_ON_DIG_INVALID");
    expect(await leftBy(debate)).toEqual({ bindings: 0, intents: 0, runs: 0 });
    // The owner's reference, someone else's user: the provision answers the debate's own user, which is not the principal's.
    expect(codeOf(await refusal(signedOut(() => dig(debate, "b2", { userId: randomUUID(), ownerRef: fixture.ownerRef })))))
      .toBe("RUN_OWNER_INVALID");
    expect((await leftBy(debate)).runs).toBe(0);
  });

  it("a Free debate gets one dig in all: b1 is written, then b2 is TAKEN", async () => {
    const debate = await parent("free");
    await signedOut(() => dig(debate, "b1", fixture, "free"));
    expect(codeOf(await refusal(signedOut(() => dig(debate, "b2", fixture, "free"))))).toBe("CARRY_ON_DIG_TAKEN");
    expect(await leftBy(debate)).toEqual({ bindings: 1, intents: 0, runs: 1 });
  });

  it("DONE recorded between the prepare and the commit: the commit answers false and nothing of the run is written", async () => {
    const pool = fixture.database.pool;
    const debate = await parent("premium");
    const fresh = randomUUID();
    await signedOut(async () => {
      const prepared = (await pool.query<{ execution_ref: string; user_id: string }>(
        "SELECT execution_ref::text, user_id::text FROM core.prepare_carry_on_run_key_provision($1, $2, $3)", [debate, fresh, "b1"])).rows;
      expect(prepared).toHaveLength(1);
      expect(prepared[0]!.user_id).toBe(fixture.userId);
      await done(debate);
      expect(await createDirectly(pool, await encryptedRunDocument(fresh, prepared[0]!.execution_ref))).toBe(false);
    });
    expect((await pool.query("SELECT count(*)::int AS n FROM core.run WHERE run_id = $1", [fresh])).rows[0].n).toBe(0);
    expect((await pool.query("SELECT count(*)::int AS n FROM core.run_ownership_event WHERE run_id = $1", [fresh])).rows[0].n).toBe(0);
  });

  it("a debate the person deleted is INVALID, before the prepare and between the prepare and the commit; nothing is written", async () => {
    // Review of Task 56a: as 0123's re-admission refuses a run whose content is no longer live (core.run_waiting_v), a carry-on never
    // digs a deleted debate, whose question each dig would carry on. Its erasure tombstone (0040) is enough: the key is gone.
    const pool = fixture.database.pool;
    const erase = (runId: string) => pool.query(`INSERT INTO serve.private_run_erasure_tombstone (run_id, completed_at, destroyed_key_count,
      already_absent_key_count) VALUES ($1, clock_timestamp(), 1, 0)`, [runId]);
    const deleted = await parent("premium");
    await erase(deleted);
    expect(codeOf(await refusal(signedOut(() => dig(deleted, "b1"))))).toBe("CARRY_ON_DIG_INVALID");
    expect(await leftBy(deleted)).toEqual({ bindings: 0, intents: 0, runs: 0 });
    const deletedLater = await parent("premium");
    const fresh = randomUUID();
    await signedOut(async () => {
      const prepared = (await pool.query<{ execution_ref: string }>(
        "SELECT execution_ref::text FROM core.prepare_carry_on_run_key_provision($1, $2, $3)", [deletedLater, fresh, "b1"])).rows;
      expect(prepared).toHaveLength(1);
      await erase(deletedLater);
      expect(await createDirectly(pool, await encryptedRunDocument(fresh, prepared[0]!.execution_ref))).toBe(false);
    });
    expect((await pool.query("SELECT count(*)::int AS n FROM core.run WHERE run_id = $1", [fresh])).rows[0].n).toBe(0);
  });

  it("the markers' table rules: a carry-on binding names its path, never re-admits as well, and one binding per debate and path", async () => {
    const pool = fixture.database.pool;
    const debate = await parent("premium");
    const first = await signedOut(() => dig(debate, "b1"));
    const second = await signedOut(() => dig(debate, "b2"));
    for (const change of ["carry_on_path_id = NULL", "carry_on_path_id = 'b9'", `readmitted_from_run_id = '${randomUUID()}'`]) {
      const refused = await refusal(pool.query(`UPDATE identity.run_execution_binding SET ${change} WHERE run_id = $1`, [first]));
      expect(codeOf(refused), change).toBe("23514");
    }
    // The UNIQUE index is the backstop: no second binding of the same debate and path, whatever the prepare decides.
    expect(codeOf(await refusal(pool.query("UPDATE identity.run_execution_binding SET carry_on_path_id = 'b1' WHERE run_id = $1", [second]))))
      .toBe("23505");
  });
});

describe("0163 leaves 0040's provision and 0123's re-admission as they were", () => {
  it("an ordinary startRun (no carryOn) on the revoked session is still refused RUN_OWNER_INVALID", async () => {
    const refused = await refusal(signedOut(() => runs().startRun(runInput("Should the ferry run at night?", owner(), "premium"))));
    expect(codeOf(refused)).toBe("RUN_OWNER_INVALID");
  });

  it("a waiting run's re-admission still commits without a live session", async () => {
    const pool = fixture.database.pool;
    const old = await runs().startRun(runInput("Should the waiting ferry debate start after an upload?", owner(), "premium"));
    await inTransaction(async (client) => {
      await new RunWaitRepository(pool).enterWait(client, old, new Date());
      await new RunWaitRepository(pool).recordReason(client, old, { waitsFor: "SITE", personRecheckAt: null, at: new Date() });
    });
    const fresh = randomUUID();
    await signedOut(async () => {
      const prepared = (await pool.query<{ execution_ref: string; user_id: string }>(
        "SELECT execution_ref::text, user_id::text FROM core.prepare_readmitted_run_key_provision($1, $2)", [old, fresh])).rows;
      expect(prepared).toHaveLength(1);
      expect(await createDirectly(pool, await encryptedRunDocument(fresh, prepared[0]!.execution_ref))).toBe(true);
    });
    expect((await pool.query(`SELECT readmitted_from_run_id::text AS old, carry_on_parent_run_id, carry_on_path_id
      FROM identity.run_execution_binding WHERE run_id = $1`, [fresh])).rows).toEqual([{ old, carry_on_parent_run_id: null, carry_on_path_id: null }]);
  });
});

async function inTransaction<T>(use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await fixture.database.pool.connect();
  let clean = false;
  try {
    await client.query("BEGIN");
    const result = await use(client);
    await client.query("COMMIT");
    clean = true;
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    clean = true;
    throw error;
  } finally { client.release(!clean); }
}

const createDirectly = async (client: Pick<PoolClient, "query">, document: Record<string, unknown>): Promise<boolean> =>
  (await client.query<{ created: boolean }>("SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb) AS created",
    [JSON.stringify(document), fixture.userId, fixture.ownerRef, JSON.stringify([])])).rows[0]!.created;

/** A valid encrypted-run document for core.create_encrypted_run (as tests/integration/run-supersession.test.ts builds one). */
async function encryptedRunDocument(runId: string, executionRef: string): Promise<Record<string, unknown>> {
  const pool = fixture.database.pool;
  const dek = generateDek(), secret = randomBytes(32);
  const aad = ["core", "run.content_ciphertext", runId, runId, fixture.ownerRef, "carry-on:v1", "1"] as const;
  const envelope = encrypt(dek, Buffer.from(JSON.stringify({ questionLine: "carried on" })), aad);
  const attestation = (await pool.query(`SELECT audit_crypto_internal.hmac(core.content_envelope_attestation_bytes($1::uuid,'core.run',($1::uuid)::text,'content_ciphertext',$2::jsonb),$3,'sha256') AS value`,
    [runId, envelope, secret])).rows[0].value as Buffer;
  const document = {
    runId, questionLine: "⟦DEBATEAI:CIPHERTEXT:V1⟧", askerId: `owner:${fixture.ownerRef}`, executionRef, callerScope: "ASKER",
    asOf: new Date().toISOString(), askerRiskTier: "casual", riskTier: "casual", tierSource: "ASKER",
    tierProvenanceRef: "carry-on", compositionBudgetTier: "low", depthParams: { depth: 1 },
    discoveredPanel: [{ agentId: "carry-on" }], strangerSampleRate: 1, envelopeBasis: { source: "carry-on" },
    registerVersion: 1, batteryVersion: "carry-on", askContract: { ciphertext: true, v: 1 }, contentCiphertext: envelope,
    contentAttestation: attestation.toString("base64"), contentAttestationSecret: secret.toString("base64")
  };
  secret.fill(0); dek.fill(0);
  return document;
}
