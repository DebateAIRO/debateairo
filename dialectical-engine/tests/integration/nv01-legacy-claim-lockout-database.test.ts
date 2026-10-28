/**
 * NV-01 (security audit run 3): the legacy-run claim was an unbounded guessing oracle. The new release charges every
 * claim to a durable per-account attempt budget (0125's core.legacy_claim_admit) before any hashing or SQL claim work:
 * at most `maxAttempts` per window, then a refusal for the lock, a fresh window afterwards, and a CLAIMED outcome
 * clears the count. Real PostgreSQL, the full migration chain, the real repository on a debateai_runtime login.
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresLegacyRunClaimRepository, RunRepository } from "@debateai/db";
import type { AuditContextHasher } from "@debateai/crypto";
import { PostgresLegacyRunClaimApplication } from "../../apps/api/src/legacy-claim.js";
import type { AuthenticatedSession } from "../../apps/api/src/sessions.js";
import { fixtureDiscoveredPanel } from "../support/discoveredPanel.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let db: TestDatabase;
let runtimePool: ReturnType<typeof createPool>;
let application: PostgresLegacyRunClaimApplication;
const POLICY = Object.freeze({ maxAttempts: 3, windowMs: 3_600_000, lockMs: 3_600_000 });
const source = Object.freeze({ ip: "192.0.2.101", userAgent: "NV-01 browser", requestId: "nv01:test" });
const auditHasher = Object.freeze({
  hashSourceIp: async (value: string) => createHash("sha256").update(`ip:${value}`).digest("hex"),
  hashUserAgent: async (value: string) => createHash("sha256").update(`ua:${value}`).digest("hex")
}) as AuditContextHasher;

type Identity = Readonly<{ userId: string; ownerRef: string; sessionId: string; sessionTokenHash: string }>;

async function legacyRun(token: string, label: string): Promise<string> {
  const askerId = `asker:${createHash("sha256").update(token).digest("hex")}`;
  const runId = await new RunRepository(db.pool).startRun({
    questionLine: `NV-01 ${label}`,
    askContract: { audience: "nv01-test" },
    principal: { kind: "legacy", legacyAskerId: askerId },
    sessionId: randomUUID(), callerScope: "ASKER",
    asOf: new Date("2026-08-25T00:00:00.000Z"),
    askerRiskTier: "casual", effectiveRiskTier: "casual", tierSource: "ASKER",
    tierProvenanceRef: "nv01:test", compositionBudgetTier: "low",
    depthParams: { depth: 1 }, discoveredPanel: fixtureDiscoveredPanel(1),
    strangerSampleRate: 1, envelopeBasis: { source: "nv01:test" },
    registerVersion: 1, batteryVersion: "nv01:test", batteryRows: []
  });
  // The run as 0041 left an event-less one: unclaimed on the cutover inventory.
  await db.pool.query("INSERT INTO core.legacy_run_cutover(run_id,marked_at) VALUES($1,clock_timestamp())", [runId]);
  return runId;
}

async function identity(label: string): Promise<Identity> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const sessionId = randomUUID();
  const tokenHash = `sha256:${randomBytes(32).toString("hex")}`;
  await db.pool.query(
    `INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,
      adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,'nv01-password',$3,$4,$5,
      'active',clock_timestamp(),clock_timestamp())`,
    [userId, randomBytes(32), `nv01-${label}-${randomUUID()}`, randomUUID(), ownerRef]
  );
  await db.pool.query(
    `INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
    ) VALUES ($1,$2,$3,$4,'{}'::jsonb,clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',
      clock_timestamp())`,
    [sessionId, userId, tokenHash, `sha256:${randomBytes(32).toString("hex")}`]
  );
  return Object.freeze({ userId, ownerRef, sessionId, sessionTokenHash: tokenHash });
}

/** The application reads only these four fields of the session (apps/api/src/legacy-claim.ts). */
function claim(who: Identity, legacyToken: string) {
  return application.claim({
    authenticated: {
      userId: who.userId, ownerRef: who.ownerRef, tokenHash: who.sessionTokenHash,
      session: { session_id: who.sessionId }
    } as unknown as AuthenticatedSession,
    legacyToken,
    source
  });
}

const wrongToken = () => `legacy:${randomUUID()}`;

async function owned(runId: string, ownerRef: string): Promise<boolean> {
  return (await db.pool.query<{ owned: boolean }>(
    "SELECT core.run_is_owned_by($1,$2,NULL) AS owned", [runId, ownerRef]
  )).rows[0]!.owned;
}

async function lockoutRows(userId: string): Promise<number> {
  return Number((await db.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM core.legacy_claim_lockout WHERE user_id=$1", [userId]
  )).rows[0]!.count);
}

async function deniedAudits(): Promise<number> {
  return Number((await db.pool.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM identity.audit_event WHERE event_type='debate.legacy_run.claim_denied'"
  )).rows[0]!.count);
}

beforeAll(async () => {
  db = await startTestDatabase();
  await migrate(db.pool);
  await db.pool.query("CREATE ROLE nv01_runtime LOGIN PASSWORD 'nv01-test-only' IN ROLE debateai_runtime");
  const url = new URL(db.connectionString); url.username = "nv01_runtime"; url.password = "nv01-test-only";
  runtimePool = createPool(url.toString());
  expect((await runtimePool.query("SELECT current_user AS name")).rows[0].name).toBe("nv01_runtime");
  application = new PostgresLegacyRunClaimApplication(new PostgresLegacyRunClaimRepository(runtimePool, auditHasher), POLICY);
}, 300_000);
afterAll(async () => { await runtimePool?.end(); await db?.stop(); });

describe("NV-01 legacy-run claim attempt budget on real PostgreSQL", () => {
  it("admits maxAttempts guesses, refuses the next and the true token while locked, then claims after the cooldown and clears", async () => {
    const token = `legacy:${randomUUID()}`;
    const runId = await legacyRun(token, "case-1");
    const who = await identity("case-1");
    for (let attempt = 0; attempt < POLICY.maxAttempts; attempt += 1) {
      expect(await claim(who, wrongToken())).toEqual({ status: "NO_MATCH", claimedCount: 0 });
    }
    const refused = await claim(who, wrongToken());
    expect(refused.status).toBe("RATE_LIMITED");
    expect(refused.claimedCount).toBe(0);
    const retryAfterMs = (refused as { retryAfterMs?: number }).retryAfterMs;
    expect(retryAfterMs).toBeGreaterThan(0);
    expect(retryAfterMs).toBeLessThanOrEqual(POLICY.lockMs);
    // The holder of the true token waits out the lock like everybody else; nothing was claimed.
    expect((await claim(who, token)).status).toBe("RATE_LIMITED");
    expect(await owned(runId, who.ownerRef)).toBe(false);

    // End the cooldown deterministically (the CHECK keeps locked_until after the window start).
    await db.pool.query(`UPDATE core.legacy_claim_lockout
      SET locked_until=clock_timestamp()-interval '1 second', window_started_at=clock_timestamp()-interval '2 seconds'
      WHERE user_id=$1`, [who.userId]);
    expect(await claim(who, token)).toEqual({ status: "CLAIMED", claimedCount: 1 });
    expect(await lockoutRows(who.userId)).toBe(0);
    expect(await owned(runId, who.ownerRef)).toBe(true);
  });

  it("serializes concurrent guesses: exactly maxAttempts reach core.claim_legacy_runs", async () => {
    await legacyRun(`legacy:${randomUUID()}`, "case-2");
    const who = await identity("case-2");
    const before = await deniedAudits();
    const results = await Promise.all(
      Array.from({ length: 2 * POLICY.maxAttempts }, () => claim(who, wrongToken()))
    );
    expect(results.filter((result) => result.status === "NO_MATCH")).toHaveLength(POLICY.maxAttempts);
    expect(results.filter((result) => result.status === "RATE_LIMITED")).toHaveLength(POLICY.maxAttempts);
    expect((await deniedAudits()) - before).toBe(POLICY.maxAttempts);
  });

  it("starts a fresh window once the old one has elapsed", async () => {
    const who = await identity("case-3");
    for (let attempt = 0; attempt < 2; attempt += 1) {
      expect((await claim(who, wrongToken())).status).toBe("NO_MATCH");
    }
    await db.pool.query(
      "UPDATE core.legacy_claim_lockout SET window_started_at=clock_timestamp()-interval '2 hours' WHERE user_id=$1",
      [who.userId]
    );
    for (let attempt = 0; attempt < POLICY.maxAttempts; attempt += 1) {
      expect((await claim(who, wrongToken())).status).toBe("NO_MATCH");
    }
    expect((await claim(who, wrongToken())).status).toBe("RATE_LIMITED");
  });

  it("pins the owner, the grants and the guard, refuses direct access and refuses an invalid budget", async () => {
    const installer = (await db.pool.query<{ name: string }>("SELECT current_user AS name")).rows[0]!.name;
    const objects = (await db.pool.query<{ table_owner: string; admit_owner: string; clear_owner: string }>(`
      SELECT pg_get_userbyid((SELECT relowner FROM pg_class WHERE oid='core.legacy_claim_lockout'::regclass)) AS table_owner,
        pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='core.legacy_claim_admit(uuid,bigint,integer,bigint)'::regprocedure)) AS admit_owner,
        pg_get_userbyid((SELECT proowner FROM pg_proc WHERE oid='core.legacy_claim_clear(uuid)'::regprocedure)) AS clear_owner`)).rows[0]!;
    expect(objects).toEqual({ table_owner: installer, admit_owner: installer, clear_owner: installer });
    for (const signature of ["core.legacy_claim_admit(uuid,bigint,integer,bigint)", "core.legacy_claim_clear(uuid)"]) {
      const acl = (await db.pool.query<{ item: string }>(`
        SELECT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC')||':'||a.privilege_type AS item
        FROM pg_proc p, aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
        WHERE p.oid=$1::regprocedure ORDER BY 1`, [signature])).rows.map((row) => row.item);
      expect(acl, signature).toEqual([`${installer}:EXECUTE`, "debateai_runtime:EXECUTE"].sort());
    }
    const tableGrantees = (await db.pool.query<{ grantee: string }>(`
      SELECT DISTINCT coalesce(pg_get_userbyid(nullif(a.grantee,0)),'PUBLIC') AS grantee
      FROM pg_class c, aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      WHERE c.oid='core.legacy_claim_lockout'::regclass ORDER BY 1`)).rows.map((row) => row.grantee);
    expect(tableGrantees).toEqual([installer]);
    const triggers = (await db.pool.query<{ name: string }>(
      "SELECT tgname AS name FROM pg_trigger WHERE tgrelid='core.legacy_claim_lockout'::regclass AND NOT tgisinternal ORDER BY 1"
    )).rows.map((row) => row.name);
    expect(triggers).toEqual(["reject_truncate"]);

    await expect(runtimePool.query("SELECT * FROM core.legacy_claim_lockout")).rejects.toMatchObject({ code: "42501" });
    await expect(runtimePool.query("TRUNCATE core.legacy_claim_lockout")).rejects.toMatchObject({ code: "42501" });
    const userId = (await identity("case-4")).userId;
    for (const [windowMs, max, lockMs] of [[3_600_000, 0, 3_600_000], [999, 3, 3_600_000], [3_600_000, 3, 3_599_999]] as const) {
      await expect(runtimePool.query("SELECT * FROM core.legacy_claim_admit($1,$2,$3,$4)", [userId, windowMs, max, lockMs]))
        .rejects.toMatchObject({ code: "22023", message: "LEGACY_CLAIM_ADMIT_INVALID" });
    }
    expect(await lockoutRows(userId)).toBe(0);
    // The application refuses the same budgets before any database work.
    const repository = new PostgresLegacyRunClaimRepository(runtimePool, auditHasher);
    for (const policy of [
      { maxAttempts: 0, windowMs: 3_600_000, lockMs: 3_600_000 },
      { maxAttempts: 3, windowMs: 999, lockMs: 3_600_000 },
      { maxAttempts: 3, windowMs: 3_600_000, lockMs: 3_599_999 },
      { maxAttempts: 1.5, windowMs: 3_600_000, lockMs: 3_600_000 }
    ]) expect(() => new PostgresLegacyRunClaimApplication(repository, policy), JSON.stringify(policy))
      .toThrow("LEGACY_RUN_CLAIM_POLICY_INVALID");
  });
});
