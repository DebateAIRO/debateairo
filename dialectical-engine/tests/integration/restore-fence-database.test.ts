// NV-07: the restore fence on real PostgreSQL. A backup carries the database half of the fence (identity.restore_fence);
// the host half (the fence file) is never captured, so a restore leaves the two disagreeing, and the settle then revokes
// every long-lived bearer and holds public reads before the API answers anything. Case (c) is the regression: a session
// revoked after the "backup" authenticates again once the snapshot is put back, and is refused after the settle.
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { chmod, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPool, migrate, PostgresSessionRepository, type Pool } from "@debateai/db";
import type { AuditContextHasher } from "../../packages/crypto/src/index.js";
import { PostgresRestoreFenceRepository } from "../../packages/db/src/restore-fence.js";
import { FileRestoreFence } from "../../apps/api/src/restore-fence.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const PASSWORD = "nv07-fence-witness-only";
const REVOKED_KEYS = ["sessions", "privilegeSessions", "stepUpGrants", "loginChallenges", "staffInvitations", "emailChanges",
  "recoveryEmails", "passwordRecoveries", "mfaRecoveries", "passwordResets", "backupEmails"];
const source = Object.freeze({ ip: "192.0.2.7", userAgent: "NV-07 Browser", requestId: "request:nv07" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "11".repeat(32),
  hashUserAgent: async () => "22".repeat(32)
}) as unknown as AuditContextHasher;

let database: TestDatabase;
let authorizationPool: Pool;
let runtimePool: Pool;
let sessions: PostgresSessionRepository;
let root: string;
let path: string;
let fence: FileRestoreFence;

const hash = (symbol: string): string => `sha256:${symbol.repeat(64)}`;
const randomHash = (): string => `sha256:${randomBytes(32).toString("hex")}`;

async function fixtureUser(label: string): Promise<Readonly<{ userId: string; factorId: string }>> {
  const userId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,$3,$4,$5,$6,'active',now(),now())
  `, [
    userId,
    createHash("sha256").update(`nv07-fence:${label}:${userId}`).digest(),
    "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    `nv07-${label}`,
    randomUUID(),
    randomUUID()
  ]);
  // identity.login_challenge.mfa_factor_id references a factor (0036), so the user gets one first.
  const factorId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity.mfa_factor (
      mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
      state,created_at,verified_at,last_accepted_step
    ) VALUES ($1,$2,'totp','{}'::jsonb,NULL,NULL,'active',now(),now(),10)
  `, [factorId, userId]);
  return Object.freeze({ userId, factorId });
}

async function fixtureSession(userId: string, tokenHash: string): Promise<string> {
  const sessionId = randomUUID();
  const now = new Date();
  await database.pool.query(`
    INSERT INTO identity.session (
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6,$7,$8,$6,NULL)
  `, [sessionId, userId, tokenHash, randomHash(), JSON.stringify({ user_agent_hash: hash("b") }), now,
    new Date(now.getTime() + 86_400_000), new Date(now.getTime() + 7 * 86_400_000)]);
  return sessionId;
}

const authenticates = async (tokenHash: string): Promise<boolean> => (await sessions.authenticateSession({
  tokenHash, bindingHash: hash("b"), occurredAt: new Date(), idleExpiresAt: new Date(Date.now() + 1_209_600_000)
})) !== null;

const row = async () => (await database.pool.query<{ fence_token: string | null; public_hold_since: Date | null }>(
  "SELECT fence_token,public_hold_since FROM identity.restore_fence"
)).rows;
const fenceToken = async (): Promise<string | null> => (await row())[0]!.fence_token;
const fileToken = async (): Promise<string> => (await readFile(path, "utf8")).replace(/\n$/u, "");
const liveSessions = async (): Promise<number> => Number((await database.pool.query<{ count: string }>(
  "SELECT count(*) FROM identity.session WHERE revoked_at IS NULL"
)).rows[0]!.count);
const errorCode = async (operation: Promise<unknown>): Promise<string | undefined> =>
  operation.then(() => undefined, (error: unknown) => (error as { code?: string }).code);

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  await database.pool.query(`
    CREATE ROLE nv07_fence_login LOGIN PASSWORD '${PASSWORD}';
    CREATE ROLE nv07_runtime_login LOGIN PASSWORD '${PASSWORD}';
    GRANT debateai_authorization_runtime TO nv07_fence_login;
    GRANT debateai_runtime TO nv07_runtime_login
  `);
  const urlFor = (role: string): string => {
    const url = new URL(database.connectionString);
    url.username = role;
    url.password = PASSWORD;
    return url.toString();
  };
  authorizationPool = createPool(urlFor("nv07_fence_login"));
  runtimePool = createPool(urlFor("nv07_runtime_login"));
  sessions = new PostgresSessionRepository(authorizationPool, fakeAuditHasher);
  root = await mkdtemp(join(tmpdir(), "nv07-restore-fence-"));
  await chmod(root, 0o700);
  path = join(root, "fence");
  fence = new FileRestoreFence({ path, repository: new PostgresRestoreFenceRepository(authorizationPool) });
}, 240_000);

afterAll(async () => {
  await authorizationPool?.end();
  await runtimePool?.end();
  await database?.stop();
  if (root !== undefined) await rm(root, { recursive: true, force: true });
});

describe("NV-07 the restore fence on PostgreSQL", () => {
  let user: Readonly<{ userId: string; factorId: string }>;
  let token: string;
  let sessionId: string;

  it("(a) initialises without revoking when the row and the file are both empty", async () => {
    expect(await row()).toEqual([{ fence_token: null, public_hold_since: null }]);
    user = await fixtureUser("a");
    token = randomHash();
    sessionId = await fixtureSession(user.userId, token);
    const settlement = await fence.settle();
    expect(settlement).toEqual({ outcome: "INITIALISED", publicHold: false, revoked: {} });
    expect(await fileToken()).toMatch(/^[A-Za-z0-9_-]{43}$/u);
    expect(await fenceToken()).toBe(await fileToken());
    expect(await authenticates(token)).toBe(true);
    expect(fence.publicReadsHeld()).toBe(false);
  });

  it("(b) advances both halves to a new token and leaves sessions alone", async () => {
    const before = await fenceToken();
    await expect(fence.settle()).resolves.toEqual({ outcome: "ADVANCED", publicHold: false, revoked: {} });
    expect(await fenceToken()).not.toBe(before);
    expect(await fenceToken()).toBe(await fileToken());
    expect(await authenticates(token)).toBe(true);
  });

  it("(c) revokes a session put back by a restore, with every long-lived bearer, and holds public reads", async () => {
    // What a backup taken now carries.
    const backupToken = await fenceToken();
    const challengeId = randomUUID(), grantId = randomUUID(), changeId = randomUUID();
    await database.pool.query(`INSERT INTO identity.login_challenge(login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,password_hash_snapshot,created_at,expires_at)
      VALUES($1,$2,$3,$4,$5,'old-password-hash',clock_timestamp(),clock_timestamp()+interval '10 minutes')`,
    [challengeId, user.userId, user.factorId, randomHash(), randomHash()]);
    await database.pool.query(`INSERT INTO identity.step_up_grant(step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,issued_at,expires_at)
      VALUES($1,$2,$3,$4,'PUBLISH',$5,clock_timestamp(),clock_timestamp()+interval '10 minutes')`,
    [grantId, randomHash(), sessionId, user.userId, randomUUID()]);
    await database.pool.query(`INSERT INTO identity.email_change_request(email_change_id,user_id,new_email_blind_index,new_email_ciphertext,confirm_token_hash,cancel_token_hash,issued_at,last_sent_at,expires_at)
      VALUES($1,$2,$3,'{}'::jsonb,$4,$5,clock_timestamp(),clock_timestamp(),clock_timestamp()+interval '1 day')`,
    [changeId, user.userId, randomBytes(32), randomHash(), randomHash()]);
    // After the backup: the user signs everyone out.
    await expect(sessions.revokeAllSessions({ userId: user.userId, initiatingSessionId: sessionId, occurredAt: new Date(), source }))
      .resolves.toBeGreaterThanOrEqual(1);
    expect(await authenticates(token)).toBe(false);
    await expect(fence.settle()).resolves.toMatchObject({ outcome: "ADVANCED" });
    // The restore: the snapshot's rows come back as they were, the host file stays as it is.
    await database.pool.query("UPDATE identity.session SET revoked_at=NULL WHERE session_id=$1", [sessionId]);
    await database.pool.query("UPDATE identity.login_challenge SET consumed_at=NULL WHERE login_challenge_id=$1", [challengeId]);
    await database.pool.query("UPDATE identity.step_up_grant SET consumed_at=NULL WHERE step_up_grant_id=$1", [grantId]);
    await database.pool.query("UPDATE identity.restore_fence SET fence_token=$1", [backupToken]);
    // The vulnerability: the revoked session is live again.
    expect(await authenticates(token)).toBe(true);

    const settlement = await fence.settle();
    expect(settlement.outcome).toBe("RESTORE_REVOKED");
    expect(settlement.publicHold).toBe(true);
    expect(Object.keys(settlement.revoked).sort()).toEqual([...REVOKED_KEYS].sort());
    expect(settlement.revoked.sessions).toBeGreaterThanOrEqual(1);
    expect(settlement.revoked.loginChallenges).toBeGreaterThanOrEqual(1);
    expect(settlement.revoked.stepUpGrants).toBeGreaterThanOrEqual(1);
    expect(settlement.revoked.emailChanges).toBeGreaterThanOrEqual(1);
    expect(settlement.revoked.passwordResets).toBe(0);
    expect(settlement.revoked.backupEmails).toBe(0);
    expect(await authenticates(token)).toBe(false);
    const consumed = await database.pool.query<{ challenge: Date | null; grant: Date | null; change: string | null }>(`
      SELECT (SELECT consumed_at FROM identity.login_challenge WHERE login_challenge_id=$1) AS challenge,
        (SELECT consumed_at FROM identity.step_up_grant WHERE step_up_grant_id=$2) AS grant,
        (SELECT outcome FROM identity.email_change_request WHERE email_change_id=$3) AS change`, [challengeId, grantId, changeId]);
    expect(consumed.rows[0]!.challenge).not.toBeNull();
    expect(consumed.rows[0]!.grant).not.toBeNull();
    expect(consumed.rows[0]!.change).toBe("CANCELLED");
    expect(await fenceToken()).toBe(await fileToken());
    expect(await fenceToken()).not.toBe(backupToken);
    expect(fence.publicReadsHeld()).toBe(true);
    const recorded = (await database.pool.query<{ last_revoked_counts: Record<string, number>; public_hold_since: Date | null }>(
      "SELECT last_revoked_counts,public_hold_since FROM identity.restore_fence")).rows[0]!;
    expect(recorded.public_hold_since).not.toBeNull();
    expect(recorded.last_revoked_counts).toEqual(settlement.revoked);
  });

  it("(d) revokes on a host that has no fence file (a fenced database on a new machine)", async () => {
    await unlink(path);
    const other = randomHash();
    await fixtureSession(user.userId, other);
    expect(await authenticates(other)).toBe(true);
    await expect(fence.settle()).resolves.toMatchObject({ outcome: "RESTORE_REVOKED", publicHold: true });
    expect(await authenticates(other)).toBe(false);
  });

  it("(e) revokes on the operator's marker (an empty file)", async () => {
    await writeFile(path, "");
    await chmod(path, 0o600);
    await expect(fence.settle()).resolves.toMatchObject({ outcome: "RESTORE_REVOKED", publicHold: true });
  });

  it("(f) two APIs on one host never mistake each other's advance for a restore", async () => {
    const second = new FileRestoreFence({ path, repository: new PostgresRestoreFenceRepository(authorizationPool) });
    const results = await Promise.all([fence, second, fence, second, fence].map((instance) => instance.settle()));
    expect(results.map((result) => result.outcome)).toEqual(["ADVANCED", "ADVANCED", "ADVANCED", "ADVANCED", "ADVANCED"]);
    expect(await fenceToken()).toBe(await fileToken());
    // The hold set by (c) stays across advances.
    expect(results.every((result) => result.publicHold)).toBe(true);
  });

  it("(g) only the owner releases the hold, and the next settle picks the release up", async () => {
    expect(await errorCode(authorizationPool.query("SELECT identity.restore_fence_release_public_hold_v1('x')"))).toBe("42501");
    expect(await errorCode(database.pool.query("SELECT identity.restore_fence_release_public_hold_v1(E'bad\\nnote')"))).toBe("22023");
    expect((await database.pool.query<{ released: boolean }>(
      "SELECT identity.restore_fence_release_public_hold_v1('restore of the test artefact reconciled') AS released")).rows[0]!.released).toBe(true);
    expect((await database.pool.query<{ released: boolean }>(
      "SELECT identity.restore_fence_release_public_hold_v1('again') AS released")).rows[0]!.released).toBe(false);
    expect(fence.publicReadsHeld()).toBe(true);
    await expect(fence.settle()).resolves.toEqual({ outcome: "ADVANCED", publicHold: false, revoked: {} });
    expect(fence.publicReadsHeld()).toBe(false);
  });

  it("(h) the ordinary runtime can neither begin nor settle the fence", async () => {
    const before = await fenceToken();
    const live = await liveSessions();
    expect(await errorCode(runtimePool.query("SELECT identity.restore_fence_begin_v1()"))).toBe("42501");
    expect(await errorCode(runtimePool.query("SELECT * FROM identity.restore_fence_settle_v1(NULL,$1)", ["q".repeat(43)]))).toBe("42501");
    expect(await errorCode(runtimePool.query("SELECT * FROM identity.restore_fence"))).toBe("42501");
    expect(await fenceToken()).toBe(before);
    expect(await liveSessions()).toBe(live);
    // The settle refuses a malformed or repeated token before it touches anything.
    const client = await authorizationPool.connect();
    try {
      expect(await errorCode(client.query("SELECT * FROM identity.restore_fence_settle_v1(NULL,'short')"))).toBe("22023");
      expect(await errorCode(client.query("SELECT * FROM identity.restore_fence_settle_v1($1,$1)", ["r".repeat(43)]))).toBe("22023");
      expect(await errorCode(client.query("SELECT * FROM identity.restore_fence_settle_v1('not a token',$1)", ["r".repeat(43)]))).toBe("22023");
    } finally {
      client.release();
    }
    expect(await fenceToken()).toBe(before);
  });

  it("(i) an insecure fence file refuses the settle, which rolls back", async () => {
    const before = await fenceToken();
    await chmod(path, 0o644);
    await expect(fence.settle()).rejects.toThrow(/^RESTORE_FENCE_FILE_INSECURE$/u);
    expect(await fenceToken()).toBe(before);
    expect(await fileToken()).toBe(before);
  });
});
