import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import { encrypt, generateDek } from "@debateai/crypto";
import { WorkItemRepository } from "@debateai/battery";
import { RunRepository, RunWaitRepository, recordRunSupersession, resolveRunRef, type StartRunInput } from "@debateai/db";
import { fixtureDiscoveredPanel, fixtureStructuralCeiling } from "../support/discoveredPanel.js";
import { startContentRunFixture, type ContentRunFixture } from "../support/contentRunFixture.js";

/**
 * Re-admission records (side-by-side uploads spec 2026-10-21 §4, §9, §13; migration 0123 §4-§5). A waiting debate
 * re-admitted under the current release gets a NEW run; core.run_supersession records old → new, append-only, and its
 * guard refuses an edge unless the old run is still waiting (a wait row, no start row, and still in the line: final
 * review P3) and the new run has no edge of its own, so a started or deleted debate is never re-admitted (plan A review
 * focus 4) and no cycle can form. core.resolve_run_ref
 * follows the chain (at most 16 hops); core.run_waiting_v no longer lists a superseded run. The wait reasons widen with
 * SITE_BUSY and SWITCHING. A superseded run's start is refused RUN_SUPERSEDED. An owner's encrypted waiting run gets
 * its new run's key provision without a live session, once per old run while that re-admission lives (A-x1); an edge
 * links two runs of one person only; only the API's role records and resolves supersessions and lists a waiting run's
 * re-admissions whose START never committed (C11 review), while both runtimes read the stamp and the release state
 * (A-x2). CI skips this directory; run it alone.
 */
let fixture: ContentRunFixture;
const waits = (): RunWaitRepository => new RunWaitRepository(fixture.database.pool);

beforeAll(async () => { fixture = await startContentRunFixture("run-supersession"); }, 240_000);
afterAll(async () => { await fixture?.stop(); });

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

/** One legacy asker for the file: an edge links two runs of the same person only (the guard compares them). */
const ASKER = `legacy-run-supersession-${randomUUID()}`;

/** A legacy run of `askerId` (re-admission copies the old run's asker into the new run, plan C11). */
function legacyRun(askerId = ASKER, overrides: Partial<StartRunInput> = {}): Promise<string> {
  return new RunRepository(fixture.database.pool).startRun({
    questionLine: "Should a waiting debate keep its place after an upload?",
    principal: { kind: "legacy", legacyAskerId: askerId },
    sessionId: randomUUID(),
    callerScope: "ASKER",
    asOf: new Date("2026-10-21T00:00:00.000Z"),
    askerRiskTier: "casual",
    effectiveRiskTier: "casual",
    tierSource: "ASKER",
    tierProvenanceRef: "asker:run-supersession",
    compositionBudgetTier: "low",
    depthParams: { depth: 1 },
    discoveredPanel: fixtureDiscoveredPanel(2),
    strangerSampleRate: 0,
    envelopeBasis: fixtureStructuralCeiling(4),
    registerVersion: 1,
    batteryVersion: "run-supersession",
    askContract: {},
    batteryRows: [],
    ...overrides
  });
}

/** A legacy run that has taken its place in line (the ask's WAIT), with its SITE reason. */
async function waitingRun(askerId = ASKER, overrides: Partial<StartRunInput> = {}): Promise<string> {
  const runId = await legacyRun(askerId, overrides);
  await inTransaction(async (client) => {
    await waits().enterWait(client, runId, new Date());
    await waits().recordReason(client, runId, { waitsFor: "SITE", personRecheckAt: null, at: new Date() });
  });
  return runId;
}

async function refusal(work: Promise<unknown>): Promise<unknown> {
  try { await work; } catch (error) { return error; }
  throw new Error("expected a refusal, but the call succeeded");
}
const codeOf = (error: unknown): unknown => (error as { code?: unknown }).code;
const supersede = (oldRunId: string, newRunId: string): Promise<void> =>
  inTransaction((client) => recordRunSupersession(client, { oldRunId, newRunId }));
const edges = async (): Promise<number> =>
  (await fixture.database.pool.query<{ n: number }>("SELECT count(*)::int AS n FROM core.run_supersession")).rows[0]!.n;

describe("0123 §4: a superseded run leaves the line, and its chain resolves", () => {
  it("a superseded run leaves the line and its new run joins it", async () => {
    const w = await waitingRun();
    const before = await waits().countWaiting();
    const n = await legacyRun();
    // Re-admission writes the new run's place and the supersession in one transaction (plan C, START).
    await inTransaction(async (client) => {
      await waits().enterWait(client, n, new Date());
      await recordRunSupersession(client, { oldRunId: w, newRunId: n });
    });
    expect(await waits().isWaiting(fixture.database.pool, w)).toBe(false);
    expect(await waits().isWaiting(fixture.database.pool, n)).toBe(true);
    expect(await waits().countWaiting()).toBe(before);
    expect((await fixture.database.pool.query(
      "SELECT old_run_id::text, new_run_id::text, reason FROM core.run_supersession WHERE old_run_id=$1", [w])).rows)
      .toEqual([{ old_run_id: w, new_run_id: n, reason: "READMITTED" }]);
  });

  it("resolveRunRef follows the chain", async () => {
    const w = await waitingRun();
    const n = await waitingRun();
    await supersede(w, n);
    expect(await resolveRunRef(fixture.database.pool, w)).toBe(n);
    expect(await resolveRunRef(fixture.database.pool, n)).toBe(n);
    const unknown = randomUUID();
    expect(await resolveRunRef(fixture.database.pool, unknown)).toBe(unknown); // no row: the input itself, unchecked
    // Two hops, through a transaction's client too.
    const m = await waitingRun();
    await supersede(n, m);
    expect(await inTransaction((client) => resolveRunRef(client, w))).toBe(m);
  });

  it("a started run is never superseded", async () => {
    const w = await waitingRun();
    const n = await waitingRun();
    await inTransaction((client) => waits().markStarted(client, w, new Date()));
    const edgesBefore = await edges();
    const error = await refusal(supersede(w, n));
    expect(codeOf(error)).toBe("RUN_SUPERSESSION_INVALID");
    expect((error as Error).message).toBe("RUN_SUPERSESSION_INVALID");
    expect(await edges()).toBe(edgesBefore);
  });

  it("a run that never waited is never superseded", async () => {
    const never = await legacyRun();
    const n = await waitingRun();
    expect(codeOf(await refusal(supersede(never, n)))).toBe("RUN_SUPERSESSION_INVALID");
    // The database's own refusal, under the TS layer: check_violation with the code as its message.
    const raw = await refusal(fixture.database.pool.query(
      "INSERT INTO core.run_supersession (old_run_id, new_run_id, reason) VALUES ($1, $2, 'READMITTED')", [never, n]));
    expect(codeOf(raw)).toBe("23514");
    expect((raw as Error).message).toBe("RUN_SUPERSESSION_INVALID");
  });

  it("no cycle and no second outgoing edge", async () => {
    const a = await waitingRun(), b = await waitingRun(), c = await waitingRun();
    await supersede(a, b);
    // b → a would close a cycle: a already has its own edge.
    expect(codeOf(await refusal(supersede(b, a)))).toBe("RUN_SUPERSESSION_INVALID");
    // a → c: a is superseded, so it no longer waits, and the guard refuses first (final review P3: it reads the line).
    expect(codeOf(await refusal(supersede(a, c)))).toBe("RUN_SUPERSESSION_INVALID");
    // Under the guard, a second edge out of a is still the primary key's refusal (the guard bypassed, as the chain case
    // below seeds).
    const pool = fixture.database.pool;
    await pool.query("ALTER TABLE core.run_supersession DISABLE TRIGGER guard_run_supersession");
    try {
      expect(codeOf(await refusal(pool.query(
        "INSERT INTO core.run_supersession (old_run_id, new_run_id, reason) VALUES ($1, $2, 'READMITTED')", [a, c])))).toBe("23505");
    } finally {
      await pool.query("ALTER TABLE core.run_supersession ENABLE TRIGGER guard_run_supersession");
    }
    // c → b: b is already some run's new run (UNIQUE new_run_id).
    expect(codeOf(await refusal(supersede(c, b)))).toBe("23505");
    // A run superseded by itself is the CHECK's refusal.
    expect(codeOf(await refusal(supersede(c, c)))).toBe("23514");
    expect(await resolveRunRef(fixture.database.pool, a)).toBe(b);
  });

  it("an edge never points at a FAILED run (A3 review)", async () => {
    const w = await waitingRun(), n = await waitingRun();
    // The new run's setup failed (plan C11's orphan path): it never runs, so the old run must not leave the line for it.
    await new WorkItemRepository(fixture.database.pool).recordSetupFailure({
      runId: n, batteryRowId: "Q1", commandKey: `S00:${n}:Q1`, reason: "RUN_SETUP_FAILED:READMISSION"
    });
    const edgesBefore = await edges();
    expect(codeOf(await refusal(supersede(w, n)))).toBe("RUN_SUPERSESSION_INVALID");
    expect(await edges()).toBe(edgesBefore);
    expect(await waits().isWaiting(fixture.database.pool, w)).toBe(true);
  });

  it("an edge links two runs of the same person only", async () => {
    const mine = await waitingRun(), theirs = await waitingRun(`legacy-run-supersession-${randomUUID()}`);
    const edgesBefore = await edges();
    // Another legacy asker's run, either way round.
    expect(codeOf(await refusal(supersede(mine, theirs)))).toBe("RUN_SUPERSESSION_INVALID");
    expect(codeOf(await refusal(supersede(theirs, mine)))).toBe("RUN_SUPERSESSION_INVALID");
    // An owner's encrypted run and a legacy run, either way round.
    const owners = await waitingEncryptedRun();
    expect(codeOf(await refusal(supersede(owners, mine)))).toBe("RUN_SUPERSESSION_INVALID");
    expect(codeOf(await refusal(supersede(mine, owners)))).toBe("RUN_SUPERSESSION_INVALID");
    expect(await edges()).toBe(edgesBefore);
    // Two runs of that owner link.
    const ownersNext = await waitingEncryptedRun();
    await supersede(owners, ownersNext);
    expect(await resolveRunRef(fixture.database.pool, owners)).toBe(ownersNext);
  });

  it("a chain longer than 16 refuses", async () => {
    const runs: string[] = [];
    for (let index = 0; index < 18; index += 1) runs.push(await fixture.createLegacyRun(`chain run ${String(index)}`));
    const pool = fixture.database.pool;
    // The seed bypasses the guard (the runs never waited); 17 edges: runs[0] → runs[1] → … → runs[17].
    await pool.query("ALTER TABLE core.run_supersession DISABLE TRIGGER guard_run_supersession");
    try {
      for (let index = 0; index < 17; index += 1) {
        await pool.query("INSERT INTO core.run_supersession (old_run_id, new_run_id, reason) VALUES ($1, $2, 'READMITTED')",
          [runs[index], runs[index + 1]]);
      }
    } finally {
      await pool.query("ALTER TABLE core.run_supersession ENABLE TRIGGER guard_run_supersession");
    }
    const error = await refusal(resolveRunRef(pool, runs[0]!));
    expect(codeOf(error)).toBe("RUN_SUPERSESSION_CHAIN_INVALID");
    expect((error as Error).message).toBe("RUN_SUPERSESSION_CHAIN_INVALID");
    // Sixteen hops are still followed.
    expect(await resolveRunRef(pool, runs[1]!)).toBe(runs[17]);
    const trigger = (await pool.query<{ tgenabled: string }>(
      "SELECT tgenabled FROM pg_trigger WHERE tgrelid='core.run_supersession'::regclass AND tgname='guard_run_supersession'")).rows;
    expect(trigger).toEqual([{ tgenabled: "O" }]);
  });

  it("an edge written while the old run is being started waits for that start, then refuses", async () => {
    const pool = fixture.database.pool;
    for (const opening of ["start", "cycle"] as const) {
      const w = await waitingRun(), n = await waitingRun();
      const first = await pool.connect(), second = await pool.connect();
      let clean = false;
      try {
        await first.query("BEGIN");
        // The waker starting w (its start row holds KEY SHARE on w's wait row), or a concurrent edge n → w.
        if (opening === "start") await waits().markStarted(first, w, new Date());
        else await recordRunSupersession(first, { oldRunId: n, newRunId: w });
        const pid = (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
        await second.query("BEGIN");
        const racing = recordRunSupersession(second, { oldRunId: w, newRunId: n }).then(() => "written", (error: unknown) => error);
        // Deterministic: the second edge is seen waiting on a lock before the first transaction commits.
        for (let tries = 0; ; tries += 1) {
          const waiting = (await pool.query<{ n: number }>(
            "SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'", [pid])).rows[0]!.n;
          if (waiting === 1) break;
          if (tries > 200) throw new Error("the second edge never waited");
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        await first.query("COMMIT");
        const outcome = await racing;
        expect(codeOf(outcome), opening).toBe("RUN_SUPERSESSION_INVALID");
        await second.query("ROLLBACK");
        clean = true;
      } finally {
        first.release(!clean);
        second.release(!clean);
      }
      expect((await pool.query("SELECT count(*)::int AS n FROM core.run_supersession WHERE old_run_id=$1", [w])).rows[0].n)
        .toBe(0);
    }
  });

  it("a superseded run is never started", async () => {
    const pool = fixture.database.pool;
    const w = await waitingRun(), n = await waitingRun();
    await supersede(w, n);
    const error = await refusal(inTransaction((client) => waits().markStarted(client, w, new Date())));
    expect(codeOf(error)).toBe("23514");
    expect((error as Error).message).toBe("RUN_SUPERSEDED");
    expect((await pool.query("SELECT count(*)::int AS n FROM core.run_wait_start WHERE run_id=$1", [w])).rows[0].n).toBe(0);
    // Its new run starts as usual.
    await inTransaction((client) => waits().markStarted(client, n, new Date()));
    expect(await waits().isWaiting(pool, n)).toBe(false);
  });

  it("a start written while the run is being superseded waits for that edge, then refuses", async () => {
    const pool = fixture.database.pool;
    const w = await waitingRun(), n = await waitingRun();
    const first = await pool.connect(), second = await pool.connect();
    let clean = false;
    try {
      await first.query("BEGIN");
      await recordRunSupersession(first, { oldRunId: w, newRunId: n });
      const pid = (await second.query<{ pid: number }>("SELECT pg_backend_pid() AS pid")).rows[0]!.pid;
      await second.query("BEGIN");
      const racing = waits().markStarted(second, w, new Date()).then(() => "written", (error: unknown) => error);
      for (let tries = 0; ; tries += 1) {
        const waiting = (await pool.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid=$1 AND wait_event_type='Lock'", [pid])).rows[0]!.n;
        if (waiting === 1) break;
        if (tries > 200) throw new Error("the start never waited");
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await first.query("COMMIT");
      expect(((await racing) as Error).message).toBe("RUN_SUPERSEDED");
      await second.query("ROLLBACK");
      clean = true;
    } finally {
      first.release(!clean);
      second.release(!clean);
    }
    expect((await pool.query("SELECT count(*)::int AS n FROM core.run_wait_start WHERE run_id=$1", [w])).rows[0].n).toBe(0);
  });

  it("supersession is append-only", async () => {
    const pool = fixture.database.pool;
    const w = await waitingRun(), n = await waitingRun();
    await supersede(w, n); // its own edge: the case does not rely on earlier ones
    const before = await edges();
    expect(before).toBeGreaterThan(0);
    for (const statement of [
      "UPDATE core.run_supersession SET reason = reason",
      "DELETE FROM core.run_supersession",
      "TRUNCATE core.run_supersession"
    ]) expect(await refusal(pool.query(statement)), statement).toBeInstanceOf(Error);
    expect(await edges()).toBe(before);
  });
});

describe("0123 §5: the two new wait reasons", () => {
  it("the two new wait reasons are stored", async () => {
    const w = await waitingRun();
    const pool = fixture.database.pool;
    for (const waitsFor of ["SITE_BUSY", "SWITCHING"] as const) {
      const at = new Date();
      await inTransaction((client) => waits().recordReason(client, w, { waitsFor, personRecheckAt: null, at }));
      const latest = (await pool.query<{ waits_for: string; person_recheck_at: Date | null }>(
        `SELECT waits_for, person_recheck_at FROM core.run_wait_reason WHERE run_id=$1
         ORDER BY recorded_at DESC, reason_id DESC LIMIT 1`, [w])).rows;
      expect(latest).toEqual([{ waits_for: waitsFor, person_recheck_at: null }]);
      // Readers keep a non-PERSON reason site-like: the run keeps its place and the waker still reads it.
      expect((await waits().readWaiting(w))?.waitsFor).toBe(waitsFor);
    }
    await expect(inTransaction((client) => waits().recordReason(client, w, {
      waitsFor: "SWITCHING", personRecheckAt: new Date(), at: new Date()
    } as never))).rejects.toThrow(new TypeError("RUN_WAIT_REASON_INVALID"));
    await expect(inTransaction((client) => waits().recordReason(client, w, {
      waitsFor: "BOGUS", personRecheckAt: null, at: new Date()
    } as never))).rejects.toThrow(new TypeError("RUN_WAIT_REASON_INVALID"));
    const raw = await refusal(pool.query(
      `INSERT INTO core.run_wait_reason (reason_id, run_id, evaluated_at, waits_for, person_recheck_at)
       VALUES (gen_random_uuid(), $1, now(), 'BOGUS', NULL)`, [w]));
    expect(codeOf(raw)).toBe("23514");
    // The recheck rule still binds the new values: a recheck instant only for PERSON.
    const recheck = await refusal(pool.query(
      `INSERT INTO core.run_wait_reason (reason_id, run_id, evaluated_at, waits_for, person_recheck_at)
       VALUES (gen_random_uuid(), $1, now(), 'SITE_BUSY', now())`, [w]));
    expect(codeOf(recheck)).toBe("23514");
    const checks = (await pool.query<{ conname: string; convalidated: boolean }>(
      `SELECT conname, convalidated FROM pg_constraint
       WHERE conrelid='core.run_wait_reason'::regclass AND contype='c' ORDER BY conname`)).rows;
    expect(checks).toEqual([
      { conname: "run_wait_reason_names_its_recheck", convalidated: true },
      { conname: "run_wait_reason_waits_for_check", convalidated: true }
    ]);
  });
});

/**
 * A valid encrypted-run document for core.create_encrypted_run (as tests/integration/side-by-side-release-stamp.test.ts
 * builds one), for an execution ref the caller already prepared.
 */
async function encryptedRunDocument(runId: string, executionRef: string): Promise<Record<string, unknown>> {
  const pool = fixture.database.pool;
  const dek = generateDek(), secret = randomBytes(32);
  const aad = ["core", "run.content_ciphertext", runId, runId, fixture.ownerRef, "readmission:v1", "1"] as const;
  const envelope = encrypt(dek, Buffer.from(JSON.stringify({ questionLine: "readmitted" })), aad);
  const attestation = (await pool.query(`SELECT audit_crypto_internal.hmac(core.content_envelope_attestation_bytes($1::uuid,'core.run',($1::uuid)::text,'content_ciphertext',$2::jsonb),$3,'sha256') AS value`,
    [runId, envelope, secret])).rows[0].value as Buffer;
  const document = {
    runId, questionLine: "⟦DEBATEAI:CIPHERTEXT:V1⟧", askerId: `owner:${fixture.ownerRef}`, executionRef, callerScope: "ASKER",
    asOf: new Date().toISOString(), askerRiskTier: "casual", riskTier: "casual", tierSource: "ASKER",
    tierProvenanceRef: "readmission", compositionBudgetTier: "low", depthParams: { depth: 1 },
    discoveredPanel: [{ agentId: "readmission" }], strangerSampleRate: 1, envelopeBasis: { source: "readmission" },
    registerVersion: 1, batteryVersion: "readmission", askContract: { ciphertext: true, v: 1 }, contentCiphertext: envelope,
    contentAttestation: attestation.toString("base64"), contentAttestationSecret: secret.toString("base64")
  };
  secret.fill(0); dek.fill(0);
  return document;
}

/** Runs `use` on a dedicated client as `role`; a client left under the role or mid-transaction is destroyed. */
async function asRole<T>(role: string, use: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await fixture.database.pool.connect();
  let clean = false;
  try {
    await client.query(`SET ROLE ${role}`);
    const result = await use(client);
    await client.query("RESET ROLE");
    clean = true;
    return result;
  } finally { client.release(!clean); }
}

const prepareReadmitted = (client: Pick<PoolClient, "query">, oldRunId: string, newRunId: string) =>
  client.query<{ execution_ref: string; user_id: string }>(
    "SELECT execution_ref::text, user_id::text FROM core.prepare_readmitted_run_key_provision($1, $2)", [oldRunId, newRunId]);
const createDirectly = async (client: Pick<PoolClient, "query">, document: Record<string, unknown>): Promise<boolean> =>
  (await client.query<{ created: boolean }>("SELECT core.create_encrypted_run($1::jsonb,$2,$3,$4::jsonb) AS created",
    [JSON.stringify(document), fixture.userId, fixture.ownerRef, JSON.stringify([])])).rows[0]!.created;

/** The owner's only session, ended (revoked: the person signed out) while `use` runs, then live again. */
async function withSessionEnded<T>(use: () => Promise<T>): Promise<T> {
  const pool = fixture.database.pool;
  await pool.query("UPDATE identity.session SET revoked_at = clock_timestamp() WHERE session_id = $1", [fixture.authSessionId]);
  try { return await use(); } finally {
    await pool.query("UPDATE identity.session SET revoked_at = NULL WHERE session_id = $1", [fixture.authSessionId]);
  }
}

async function waitingEncryptedRun(): Promise<string> {
  const runId = await fixture.createEncryptedRun("Should an encrypted waiting debate survive its session?");
  await inTransaction(async (client) => {
    await waits().enterWait(client, runId, new Date());
    await waits().recordReason(client, runId, { waitsFor: "SITE", personRecheckAt: null, at: new Date() });
  });
  return runId;
}

describe("0123 §4: the readmitted run's key provision (A-x1) and the runtime's reach (A-x2)", () => {
  it("an owner's waiting run gets its new run's key provision and commit without a live session", async () => {
    const pool = fixture.database.pool;
    const old = await waitingEncryptedRun();
    const fresh = randomUUID();
    await withSessionEnded(async () => {
      // Today's provision refuses: the session is no longer live.
      expect((await pool.query("SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS value",
        [randomUUID(), fixture.userId, fixture.ownerRef, fixture.authSessionId])).rows[0].value).toBeNull();
      const prepared = await asRole("debateai_content_provision", (client) => prepareReadmitted(client, old, fresh));
      expect(prepared.rows).toHaveLength(1);
      const { execution_ref: executionRef, user_id: userId } = prepared.rows[0]!;
      expect(userId).toBe(fixture.userId);
      expect((await pool.query(
        "SELECT user_id::text, identity_session_id::text, run_id::text FROM identity.run_execution_binding WHERE execution_ref=$1",
        [executionRef])).rows).toEqual([{ user_id: fixture.userId, identity_session_id: fixture.authSessionId, run_id: fresh }]);
      const document = await encryptedRunDocument(fresh, executionRef);
      expect(await asRole("debateai_content_provision", (client) => createDirectly(client, document))).toBe(true);
    });
    // The new run is the owner's encrypted run; its intent was consumed, as on the ordinary path.
    expect((await pool.query(
      "SELECT asker_id, content_encryption_version, session_id FROM core.run WHERE run_id=$1", [fresh])).rows[0])
      .toMatchObject({ asker_id: `owner:${fixture.ownerRef}`, content_encryption_version: 1 });
    expect((await pool.query("SELECT count(*)::int AS n FROM core.run_key_provision_intent WHERE run_id=$1", [fresh])).rows[0].n)
      .toBe(0);
    // Re-admission then records the edge; the old run leaves the line.
    await supersede(old, fresh);
    expect(await waits().isWaiting(pool, old)).toBe(false);
    expect(await resolveRunRef(pool, old)).toBe(fresh);
  });

  it("one live re-admission per old run: a second is refused while the first is pending or alive", async () => {
    const pool = fixture.database.pool;
    const old = await waitingEncryptedRun();
    const first = randomUUID();
    const prepared = (await prepareReadmitted(pool, old, first)).rows[0]!;
    // Pending: the first provision is prepared, its run not yet written.
    const pending = await refusal(prepareReadmitted(pool, old, randomUUID()));
    expect(codeOf(pending)).toBe("55000");
    expect((pending as Error).message).toBe("RUN_READMISSION_TAKEN");
    // Alive: the first run is written (its intent consumed); still refused.
    expect(await createDirectly(pool, await encryptedRunDocument(first, prepared.execution_ref))).toBe(true);
    expect((await refusal(prepareReadmitted(pool, old, randomUUID())) as Error).message).toBe("RUN_READMISSION_TAKEN");
    expect((await pool.query("SELECT readmitted_from_run_id::text AS old FROM identity.run_execution_binding WHERE run_id=$1",
      [first])).rows).toEqual([{ old }]);
    // The orphan path (plan C11): START failed after the new run committed, which is recorded FAILED; the old run,
    // still waiting, may then be re-admitted once more.
    await new WorkItemRepository(pool).recordSetupFailure({
      runId: first, batteryRowId: "Q1", commandKey: `S00:${first}:Q1`, reason: "RUN_SETUP_FAILED:READMISSION"
    });
    const second = randomUUID();
    expect((await prepareReadmitted(pool, old, second)).rows).toHaveLength(1);
    // The pending-intent index is the backstop: a second marked intent for the same old run cannot exist.
    expect(codeOf(await refusal(pool.query(
      `INSERT INTO core.run_key_provision_intent (run_id, user_id, owner_ref, identity_session_id, execution_ref,
         requested_at, expires_at, readmitted_from_run_id)
       SELECT $1, user_id, owner_ref, identity_session_id, execution_ref, requested_at, expires_at, readmitted_from_run_id
       FROM core.run_key_provision_intent WHERE run_id=$2`, [randomUUID(), second])))).toBe("23505");
  });

  it("a readmitted run is the new run of the run it re-admits only (A3 review)", async () => {
    const pool = fixture.database.pool;
    const old = await waitingEncryptedRun(), other = await waitingEncryptedRun();
    const fresh = randomUUID();
    const prepared = (await prepareReadmitted(pool, old, fresh)).rows[0]!;
    expect(await createDirectly(pool, await encryptedRunDocument(fresh, prepared.execution_ref))).toBe(true);
    // Same owner, both waiting, but `fresh` re-admits `old`: it cannot become `other`'s new run.
    const edgesBefore = await edges();
    expect(codeOf(await refusal(supersede(other, fresh)))).toBe("RUN_SUPERSESSION_INVALID");
    expect(await edges()).toBe(edgesBefore);
    expect(await waits().isWaiting(pool, other)).toBe(true);
    // It is `old`'s.
    await supersede(old, fresh);
    expect(await resolveRunRef(pool, old)).toBe(fresh);
  });

  it("a marked intent takes the re-admission's checks even when its session is live", async () => {
    const pool = fixture.database.pool;
    const old = await waitingEncryptedRun();
    const fresh = randomUUID();
    const prepared = (await prepareReadmitted(pool, old, fresh)).rows[0]!;
    // The old run starts on its own meanwhile: it no longer waits, so its re-admission must not commit, although the
    // session is live (0040's lock alone would take it).
    await inTransaction((client) => waits().markStarted(client, old, new Date()));
    expect(await createDirectly(pool, await encryptedRunDocument(fresh, prepared.execution_ref))).toBe(false);
    expect((await pool.query("SELECT count(*)::int AS n FROM core.run WHERE run_id=$1", [fresh])).rows[0].n).toBe(0);
  });

  it("an ordinary provision still needs a live session at commit", async () => {
    const pool = fixture.database.pool;
    const runId = randomUUID();
    const executionRef = (await pool.query("SELECT core.prepare_run_key_provision($1,$2,$3,$4) AS value",
      [runId, fixture.userId, fixture.ownerRef, fixture.authSessionId])).rows[0].value as string;
    const document = await encryptedRunDocument(runId, executionRef);
    expect(await withSessionEnded(() => asRole("debateai_content_provision", (client) => createDirectly(client, document))))
      .toBe(false);
    expect((await pool.query("SELECT count(*)::int AS n FROM core.run WHERE run_id=$1", [runId])).rows[0].n).toBe(0);
  });

  it("refuses an old run that is not waiting, already superseded, not an owner's, or whose owner is gone", async () => {
    const pool = fixture.database.pool;
    const intents = async (): Promise<number> =>
      (await pool.query<{ n: number }>("SELECT count(*)::int AS n FROM core.run_key_provision_intent")).rows[0]!.n;
    const before = await intents();
    const notWaiting = await fixture.createEncryptedRun("never waited");
    const started = await waitingEncryptedRun();
    await inTransaction((client) => waits().markStarted(client, started, new Date()));
    const superseded = await waitingEncryptedRun();
    await supersede(superseded, await waitingEncryptedRun());
    const legacy = await waitingRun();
    for (const old of [notWaiting, started, superseded, legacy, randomUUID()]) {
      const error = await refusal(prepareReadmitted(pool, old, randomUUID()));
      expect(codeOf(error), old).toBe("55000");
      expect((error as Error).message, old).toBe("RUN_READMISSION_INVALID");
    }
    const waiting = await waitingEncryptedRun();
    expect((await refusal(prepareReadmitted(pool, waiting, waiting)) as Error).message).toBe("RUN_READMISSION_INVALID");
    expect((await refusal(prepareReadmitted(pool, waiting, notWaiting)) as Error).message).toBe("RUN_READMISSION_INVALID");
    await pool.query(`UPDATE identity."user" SET state = 'suspended' WHERE user_id = $1`, [fixture.userId]);
    try {
      const error = await refusal(prepareReadmitted(pool, waiting, randomUUID()));
      expect(codeOf(error)).toBe("55000");
      expect((error as Error).message).toBe("RUN_READMISSION_OWNER_GONE");
    } finally {
      await pool.query(`UPDATE identity."user" SET state = 'active' WHERE user_id = $1`, [fixture.userId]);
    }
    expect(await intents()).toBe(before);
  });

  /**
   * Final review P3: START writes the edge after createRun committed the new run on its own connection, so the old run
   * can stop waiting in between (its person deleted the question, it was set aside). The guard reads the line itself,
   * after its lock, so a deleted question never restarts under a new id.
   */
  it("an edge is refused when the old run stopped waiting after its new run was written (final review P3)", async () => {
    const pool = fixture.database.pool;
    for (const erasure of ["cleanup intent", "tombstone"] as const) {
      const old = await waitingEncryptedRun();
      const fresh = randomUUID();
      const prepared = (await prepareReadmitted(pool, old, fresh)).rows[0]!;
      expect(await createDirectly(pool, await encryptedRunDocument(fresh, prepared.execution_ref))).toBe(true);
      // The person deletes the waiting question now: per-debate erasure's first mark, or its finished tombstone.
      if (erasure === "cleanup intent") {
        await pool.query(`INSERT INTO serve.private_run_key_cleanup_intent (request_ref, user_id, run_id, requested_at,
          cleanup_publication_refs) VALUES ($1, $2, $3, now(), '{}'::uuid[])`, [randomUUID(), fixture.userId, old]);
      } else {
        await pool.query(`INSERT INTO serve.private_run_erasure_tombstone (run_id, completed_at, destroyed_key_count,
          already_absent_key_count) VALUES ($1, now(), 1, 0)`, [old]);
      }
      expect(await waits().isWaiting(pool, old), erasure).toBe(false);
      const edgesBefore = await edges();
      const error = await refusal(supersede(old, fresh));
      expect(codeOf(error), erasure).toBe("RUN_SUPERSESSION_INVALID");
      expect((error as Error).message, erasure).toBe("RUN_SUPERSESSION_INVALID");
      expect(await edges(), erasure).toBe(edgesBefore);
      expect(await resolveRunRef(pool, old), erasure).toBe(old);
    }
    // A legacy run set aside (FAILED) in between no longer waits either.
    const setAside = await waitingRun(), next = await legacyRun();
    await new WorkItemRepository(pool).recordSetupFailure({
      runId: setAside, batteryRowId: "Q1", commandKey: `S00:${setAside}:Q1`, reason: "RUN_SETUP_FAILED:WAITING_LINE"
    });
    const edgesBefore = await edges();
    expect(codeOf(await refusal(supersede(setAside, next)))).toBe("RUN_SUPERSESSION_INVALID");
    expect(await edges()).toBe(edgesBefore);
  });

  /**
   * C11 review (controller ruling 2026-10-22): START commits the new run's row before the START itself, so a crash
   * between the two, or a FAILED record that never lands, leaves a new run with no edge and no job. The API asks
   * core.list_unstarted_readmissions under the old run's owner lease (no START in flight) and records each FAILED.
   */
  it("lists the re-admissions of a waiting run whose START never committed: an owner's and a legacy asker's", async () => {
    const pool = fixture.database.pool;
    const listed = (oldRunId: string): Promise<string[]> => asRole("debateai_billing_runtime", async (client) =>
      (await client.query<{ run_id: string }>(
        "SELECT listed.run_id::text AS run_id FROM core.list_unstarted_readmissions($1::uuid) AS listed(run_id)", [oldRunId]
      )).rows.map((row) => row.run_id));
    // An owner's: the new run is written (its binding names the old run), and nothing started it.
    const old = await waitingEncryptedRun();
    const orphan = randomUUID();
    const prepared = (await prepareReadmitted(pool, old, orphan)).rows[0]!;
    expect(await createDirectly(pool, await encryptedRunDocument(orphan, prepared.execution_ref))).toBe(true);
    expect(await listed(old)).toEqual([orphan]);
    await expect(new RunRepository(pool).listUnstartedReadmissions(old)).resolves.toEqual([orphan]);
    // Recorded FAILED (plan C11's orphan path), it leaves the list, and the old run may be re-admitted again.
    await new WorkItemRepository(pool).recordSetupFailure({
      runId: orphan, batteryRowId: "Q1", commandKey: `S00:${orphan}:Q1`, reason: "RUN_SETUP_FAILED:READMISSION"
    });
    expect(await listed(old)).toEqual([]);
    // A provision still pending has no run to record: not listed (0040's sweep removes it with its intent).
    await prepareReadmitted(pool, old, randomUUID());
    expect(await listed(old)).toEqual([]);
    // A started re-admission (its edge written) is not listed.
    const startedOld = await waitingEncryptedRun();
    const started = randomUUID();
    const startedPrepared = (await prepareReadmitted(pool, startedOld, started)).rows[0]!;
    expect(await createDirectly(pool, await encryptedRunDocument(started, startedPrepared.execution_ref))).toBe(true);
    await supersede(startedOld, started);
    expect(await listed(startedOld)).toEqual([]);

    // A legacy asker's: the plain copy of the old row (same asker, session and question) under another release, never
    // in line, with no edge and no job. A run of another session, one under the old run's own release and one that
    // waits are not copies of it.
    const session = randomUUID();
    const oldRelease = ["r16", "0123456789ab"].join("-");
    const newRelease = ["r17", "0123456789ab"].join("-");
    const legacyOld = await waitingRun(ASKER, { sessionId: session, releaseKey: oldRelease, registerVersion: 16 });
    const copy = await legacyRun(ASKER, { sessionId: session, releaseKey: newRelease, registerVersion: 17 });
    await legacyRun(ASKER, { sessionId: randomUUID(), releaseKey: newRelease, registerVersion: 17 });
    await legacyRun(ASKER, { sessionId: session, releaseKey: oldRelease, registerVersion: 16 });
    await waitingRun(ASKER, { sessionId: session, releaseKey: newRelease, registerVersion: 17 });
    expect(await listed(legacyOld)).toEqual([copy]);
    await new WorkItemRepository(pool).recordSetupFailure({
      runId: copy, batteryRowId: "Q1", commandKey: `S00:${copy}:Q1`, reason: "RUN_SETUP_FAILED:READMISSION"
    });
    expect(await listed(legacyOld)).toEqual([]);
    // A run that never waited has no unstarted re-admission; neither has an unknown id.
    expect(await listed(await legacyRun())).toEqual([]);
    expect(await listed(randomUUID())).toEqual([]);
  });

  it("only the API's role records and resolves; both runtimes read the stamp and the release state", async () => {
    const pool = fixture.database.pool;
    const grants = (await pool.query<Record<string, boolean>>(`
      SELECT
        has_table_privilege('debateai_billing_runtime','core.run_supersession','SELECT') AS supersession_select,
        has_table_privilege('debateai_billing_runtime','core.run_supersession','INSERT') AS supersession_insert,
        has_table_privilege('debateai_billing_runtime','core.run_supersession','UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS supersession_more,
        has_table_privilege('debateai_runtime','core.run_supersession','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS runner_supersession,
        has_column_privilege('debateai_runtime','core.run','release_key','SELECT') AS release_key_select,
        has_function_privilege('debateai_runtime','core.read_current_release()','EXECUTE') AS read_current,
        has_function_privilege('debateai_runtime','core.read_release_state(text)','EXECUTE') AS read_state,
        has_function_privilege('debateai_billing_runtime','core.resolve_run_ref(uuid)','EXECUTE') AS resolve,
        has_function_privilege('debateai_runtime','core.resolve_run_ref(uuid)','EXECUTE') AS runner_resolve,
        has_function_privilege('public','core.resolve_run_ref(uuid)','EXECUTE') AS resolve_public,
        has_function_privilege('debateai_content_provision','core.prepare_readmitted_run_key_provision(uuid,uuid)','EXECUTE') AS readmit_provision,
        has_function_privilege('debateai_runtime','core.prepare_readmitted_run_key_provision(uuid,uuid)','EXECUTE') AS readmit_runtime,
        has_function_privilege('public','core.prepare_readmitted_run_key_provision(uuid,uuid)','EXECUTE') AS readmit_public,
        has_function_privilege('debateai_content_provision','core.lock_readmitted_run_key_provision_for_commit(uuid,uuid,uuid,uuid)','EXECUTE') AS lock_provision,
        has_function_privilege('public','core.lock_readmitted_run_key_provision_for_commit(uuid,uuid,uuid,uuid)','EXECUTE') AS lock_public,
        has_function_privilege('debateai_billing_runtime','core.list_unstarted_readmissions(uuid)','EXECUTE') AS unstarted,
        has_function_privilege('debateai_runtime','core.list_unstarted_readmissions(uuid)','EXECUTE') AS runner_unstarted,
        has_function_privilege('debateai_content_provision','core.list_unstarted_readmissions(uuid)','EXECUTE') AS provision_unstarted,
        has_function_privilege('public','core.list_unstarted_readmissions(uuid)','EXECUTE') AS unstarted_public
    `)).rows[0];
    expect(grants).toEqual({
      supersession_select: true, supersession_insert: true, supersession_more: false, runner_supersession: false,
      release_key_select: true, read_current: true, read_state: true, resolve: true, runner_resolve: false, resolve_public: false,
      readmit_provision: true, readmit_runtime: false, readmit_public: false, lock_provision: false, lock_public: false,
      unstarted: true, runner_unstarted: false, provision_unstarted: false, unstarted_public: false
    });
    // And it works as the API's role: record an edge, resolve it, read the line, the stamp and the release state.
    const w = await waitingRun();
    const n = await waitingRun();
    await asRole("debateai_billing_runtime", async (client) => {
      await client.query("BEGIN");
      await recordRunSupersession(client, { oldRunId: w, newRunId: n });
      await client.query("COMMIT");
      expect(await resolveRunRef(client, w)).toBe(n);
      expect(await waits().isWaiting(client, w)).toBe(false);
      expect((await client.query("SELECT release_key FROM core.run WHERE run_id=$1", [n])).rows).toEqual([{ release_key: "legacy" }]);
      expect((await client.query("SELECT count(*)::int AS n FROM core.read_current_release()")).rows).toEqual([{ n: 0 }]);
    });
    // The runner's role reads the stamp and its release state, and can neither record nor resolve.
    const m = await waitingRun();
    await asRole("debateai_runtime", async (client) => {
      expect((await client.query("SELECT release_key FROM core.run WHERE run_id=$1", [n])).rows).toEqual([{ release_key: "legacy" }]);
      expect((await client.query("SELECT count(*)::int AS n FROM core.read_release_state('r17-0123456789ab')")).rows).toEqual([{ n: 0 }]);
      expect(codeOf(await refusal(resolveRunRef(client, w)))).toBe("42501");
      expect(codeOf(await refusal(client.query("SELECT * FROM core.list_unstarted_readmissions($1::uuid)", [w])))).toBe("42501");
      await client.query("BEGIN");
      expect(codeOf(await refusal(recordRunSupersession(client, { oldRunId: n, newRunId: m })))).toBe("42501");
      await client.query("ROLLBACK");
    });
    expect(await resolveRunRef(fixture.database.pool, n)).toBe(n);
  });
});
