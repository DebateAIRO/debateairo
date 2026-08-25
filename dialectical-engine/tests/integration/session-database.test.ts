import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  migrate,
  PostgresSessionRepository,
  type LoginChallengeRecord
} from "@debateai/db";
import {
  Argon2WorkerPool,
  createEmailBlindIndex,
  encrypt,
  generateDek,
  generateTotpSecret,
  hashPassword,
  hashVerificationToken,
  totpCodeAtStep,
  type AuditContextHasher,
  type CryptoEnvelope,
  type ReadableUserDekStore
} from "../../packages/crypto/src/index.js";
import {
  AUTH_POLICY_REGISTER_ROWS,
  authPolicyFromRegisterRows,
  MFA_POLICY_REGISTER_ROW,
  mfaPolicyFromValue,
  SESSION_POLICY_REGISTER_ROW,
  sessionPolicyFromValue
} from "@debateai/register";
import { SessionService } from "../../apps/api/src/sessions.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;

const source = Object.freeze({ ip: "192.0.2.4", userAgent: "S5 Browser", requestId: "request:s5" });
const fakeAuditHasher = Object.freeze({
  hashSourceIp: async () => "11".repeat(32),
  hashUserAgent: async () => "22".repeat(32)
}) as unknown as AuditContextHasher;

function hash(symbol: string): string {
  return `sha256:${symbol.repeat(64)}`;
}

function fixtureHash(label: string): string {
  return `sha256:${createHash("sha256").update(`session-fixture:${label}`).digest("hex")}`;
}

async function expectStillPending<T>(operation: Promise<T>): Promise<void> {
  const state = await Promise.race([
    operation.then(() => "settled" as const, () => "settled" as const),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"),75))
  ]);
  expect(state).toBe("pending");
}

async function fixtureUser(label: string): Promise<Readonly<{
  userId: string;
  ownerRef: string;
  auditToken: string;
  factorId: string;
  passwordHash: string;
}>> {
  const userId = randomUUID();
  const ownerRef = randomUUID();
  const auditToken = randomUUID();
  const passwordHash = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,$3,$4,$5,$6,'active',now(),now())
  `, [
    userId,
    createHash("sha256").update(`s5-session:${label}:${userId}`).digest(),
    passwordHash,
    `s5-${label}`,
    auditToken,
    ownerRef
  ]);
  const factorId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity.mfa_factor (
      mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
      state,created_at,verified_at,last_accepted_step
    ) VALUES ($1,$2,'totp','{}'::jsonb,NULL,NULL,'active',now(),now(),10)
  `, [factorId, userId]);
  return Object.freeze({ userId, ownerRef, auditToken, factorId, passwordHash });
}

async function fixtureSession(userId: string, tokenHash: string, csrfHash: string, input: Readonly<{
  bindingHash?: string;
  idleExpiresAt?: Date;
  absoluteExpiresAt?: Date;
}> = {}): Promise<string> {
  const sessionId = randomUUID();
  const now = new Date();
  await database.pool.query(`
    INSERT INTO identity.session (
      session_id,user_id,token_hash,csrf_token_hash,binding_context,
      created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6,$7,$8,$6,NULL)
  `, [
    sessionId, userId, tokenHash, csrfHash,
    JSON.stringify({ user_agent_hash: input.bindingHash ?? hash("b") }),
    now,
    input.idleExpiresAt ?? new Date(now.getTime() + 86_400_000),
    input.absoluteExpiresAt ?? new Date(now.getTime() + 7 * 86_400_000)
  ]);
  return sessionId;
}

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);

afterAll(async () => database?.stop());

describe("S5 sessions on real PostgreSQL", () => {
  it("refreshes conditionally, caps idle at absolute, and rejects the exact expiry boundary", async () => {
    const identity = await fixtureUser("refresh");
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const now = new Date();
    const refreshAt = new Date(now.getTime() + 1_000);
    const absolute = new Date(now.getTime() + 60_000);
    const sessionId = await fixtureSession(identity.userId, hash("a"), hash("c"), {
      bindingHash: hash("b"),
      idleExpiresAt: new Date(now.getTime() + 30_000),
      absoluteExpiresAt: absolute
    });
    const refreshed = await repository.authenticateSession({
      tokenHash: hash("a"), bindingHash: hash("b"), occurredAt: refreshAt,
      idleExpiresAt: new Date(now.getTime() + 14 * 86_400_000)
    });
    expect(refreshed).toMatchObject({
      sessionId, userId: identity.userId, ownerRef: identity.ownerRef, csrfTokenHash: hash("c")
    });
    expect(refreshed!.idleExpiresAt.getTime()).toBe(absolute.getTime());

    const boundaryId = await fixtureSession(identity.userId, hash("d"), hash("e"), {
      bindingHash: hash("b"),
      idleExpiresAt: new Date(absolute.getTime() - 10_000),
      absoluteExpiresAt: absolute
    });
    const boundary = new Date(Date.now() + 1_000);
    await database.pool.query(`UPDATE identity.session SET idle_expires_at=$2 WHERE session_id=$1`, [
      boundaryId, boundary
    ]);
    expect(boundaryId).toBeTruthy();
    await expect(repository.authenticateSession({
      tokenHash: hash("d"), bindingHash: hash("b"), occurredAt: boundary,
      idleExpiresAt: new Date(boundary.getTime() + 1_000)
    })).resolves.toBeNull();
  });

  it("linearizes refresh against revoke and never audits a replayed revoke as success", async () => {
    const owner = await fixtureUser("owner");
    const foreign = await fixtureUser("foreign");
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const tokenHash = hash("f");
    const sessionId = await fixtureSession(owner.userId, tokenHash, hash("1"));
    const occurredAt = new Date();
    await Promise.all([
      repository.authenticateSession({
        tokenHash, bindingHash: hash("b"), occurredAt,
        idleExpiresAt: new Date(occurredAt.getTime() + 86_400_000)
      }),
      repository.revokeSession({ userId: owner.userId, sessionId, occurredAt, source })
    ]);
    await expect(repository.authenticateSession({
      tokenHash, bindingHash: hash("b"), occurredAt: new Date(occurredAt.getTime() + 1),
      idleExpiresAt: new Date(occurredAt.getTime() + 86_400_001)
    })).resolves.toBeNull();
    await expect(repository.revokeSession({ userId: owner.userId, sessionId, occurredAt, source })).resolves.toBe(false);
    await expect(repository.revokeSession({ userId: foreign.userId, sessionId, occurredAt, source })).resolves.toBe(false);
    const successfulRevokes = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM identity.audit_event
      WHERE actor_key_ref=$1 AND event_type='identity.session.revoked' AND success
    `, [owner.auditToken]);
    expect(successfulRevokes.rows[0]?.count).toBe("1");
  });

  it("consumes one MFA challenge exactly once under concurrent completion", async () => {
    const identity = await fixtureUser("challenge");
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const now = new Date();
    const challengeId = randomUUID();
    await database.pool.query(`
      INSERT INTO identity.login_challenge (
        login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,
        password_hash_snapshot,created_at,expires_at,consumed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
    `, [
      challengeId, identity.userId, identity.factorId, hash("2"), hash("b"),
      identity.passwordHash, now, new Date(now.getTime() + 300_000)
    ]);
    const challenge: LoginChallengeRecord = Object.freeze({
      challengeId,
      challengeTokenHash: hash("2"),
      bindingHash: hash("b"),
      expiresAt: new Date(now.getTime() + 300_000),
      consumedAt: null,
      userId: identity.userId,
      ownerRef: identity.ownerRef,
      auditToken: identity.auditToken,
      passwordHash: identity.passwordHash,
      factorId: identity.factorId,
      secretCiphertext: {} as CryptoEnvelope,
      lastAcceptedStep: 10
    });
    const completion = (symbol: string, acceptedStep: number) => repository.completeTotpLogin({
      challenge,
      acceptedStep,
      bindingHash: hash("b"),
      sessionId: randomUUID(),
      sessionTokenHash: hash(symbol),
      csrfTokenHash: hash(symbol.toUpperCase()),
      sessionBindingContext: { user_agent_hash: hash("b") },
      occurredAt: now,
      idleExpiresAt: new Date(now.getTime() + 86_400_000),
      absoluteExpiresAt: new Date(now.getTime() + 7 * 86_400_000),
      source
    });
    const outcomes = await Promise.all([completion("3", 11), completion("4", 12)]);
    expect(outcomes.sort()).toEqual([false, true]);
    const sessions = await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM identity.session WHERE user_id=$1 AND revoked_at IS NULL`, [identity.userId]
    );
    expect(Number(sessions.rows[0]!.count)).toBe(1);
    // Non-vacuity guard: with the consumed predicate deleted, the strictly
    // newer step remains eligible and would mint a second session.
    await expect(completion("5", 13)).resolves.toBe(false);
    const afterReplay = await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM identity.session WHERE user_id=$1 AND revoked_at IS NULL`, [identity.userId]
    );
    expect(Number(afterReplay.rows[0]!.count)).toBe(1);
  });

  it("revalidates the password snapshot under lock for TOTP and recovery completion", async () => {
    const identity = await fixtureUser("password-snapshot-lock");
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const now = new Date();
    const challengeId = randomUUID();
    const recoveryCodeId = randomUUID();
    await database.pool.query(`
      INSERT INTO identity.login_challenge (
        login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,
        password_hash_snapshot,created_at,expires_at,consumed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
    `, [
      challengeId, identity.userId, identity.factorId, hash("9"), hash("b"),
      identity.passwordHash, now, new Date(now.getTime() + 300_000)
    ]);
    await database.pool.query(`
      INSERT INTO identity.recovery_code (
        recovery_code_id,user_id,code_hash,created_at,consumed_at,revoked_at,code_slot
      ) VALUES ($1,$2,$3,$4,NULL,NULL,1)
    `, [recoveryCodeId, identity.userId, hash("r"), now]);

    // Cache the valid first-leg record, then change the password. This forces
    // both completion paths to prove they revalidate under their user lock.
    const challenge = await repository.readLoginChallenge(hash("9"));
    expect(challenge).not.toBeNull();
    if (challenge === null) throw new Error("expected a readable login challenge");
    await database.pool.query(`UPDATE identity."user" SET password_hash=$2 WHERE user_id=$1`, [
      identity.userId, `changed:${identity.passwordHash}`
    ]);

    const sessionInput = {
      challenge,
      bindingHash: hash("b"),
      sessionId: randomUUID(),
      sessionTokenHash: hashVerificationToken("locked-totp-session-token-material-01"),
      csrfTokenHash: hashVerificationToken("locked-totp-csrf-token-material-002"),
      sessionBindingContext: { user_agent_hash: hash("b") },
      occurredAt: now,
      idleExpiresAt: new Date(now.getTime() + 86_400_000),
      absoluteExpiresAt: new Date(now.getTime() + 7 * 86_400_000),
      source
    } as const;
    await expect(repository.completeTotpLogin({ ...sessionInput, acceptedStep: 11 })).resolves.toBe(false);
    await expect(repository.completeRecoveryLogin({
      ...sessionInput, recoveryCodeId,
      replacementHash: hashVerificationToken("locked-recovery-replacement-material")
    })).resolves.toBe(false);

    const sessions = await database.pool.query<{ count: string }>(
      `SELECT count(*) FROM identity.session WHERE user_id=$1`, [identity.userId]
    );
    const recovery = await database.pool.query<{ consumed_at: Date | null }>(
      `SELECT consumed_at FROM identity.recovery_code WHERE recovery_code_id=$1`, [recoveryCodeId]
    );
    expect(Number(sessions.rows[0]!.count)).toBe(0);
    expect(recovery.rows[0]!.consumed_at).toBeNull();
  });

  it("denies missing TOTP and recovery challenges with one audit and no mutation", async () => {
    const identity = await fixtureUser(`missing-challenge-${randomUUID()}`);
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const recoveryCodeId = randomUUID();
    await database.pool.query(`
      INSERT INTO identity.recovery_code (
        recovery_code_id,user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
      ) VALUES ($1,$2,1,$3,clock_timestamp(),NULL,NULL)
    `, [recoveryCodeId,identity.userId,hashVerificationToken(`recovery-${randomUUID()}`)]);
    const occurredAt = new Date();
    const missingChallenge: LoginChallengeRecord = Object.freeze({
      challengeId: randomUUID(),
      challengeTokenHash: hashVerificationToken(`challenge-${randomUUID()}`),
      bindingHash: hashVerificationToken(`binding-${randomUUID()}`),
      expiresAt: new Date(occurredAt.getTime()+300_000),
      consumedAt: null,
      userId: identity.userId,
      ownerRef: identity.ownerRef,
      auditToken: identity.auditToken,
      passwordHash: identity.passwordHash,
      factorId: identity.factorId,
      secretCiphertext: {} as CryptoEnvelope,
      lastAcceptedStep: 10
    });
    const before = await database.pool.query<{ audits: string; sessions: string }>(`
      SELECT
        (SELECT count(*)::text FROM identity.audit_event
         WHERE event_type='identity.login.failed') AS audits,
        (SELECT count(*)::text FROM identity.session WHERE user_id=$1) AS sessions
    `,[identity.userId]);
    const common = {
      challenge: missingChallenge,
      bindingHash: missingChallenge.bindingHash,
      sessionBindingContext: { user_agent_hash: missingChallenge.bindingHash },
      occurredAt,
      idleExpiresAt: new Date(occurredAt.getTime()+86_400_000),
      absoluteExpiresAt: new Date(occurredAt.getTime()+7*86_400_000),
      source
    } as const;
    await expect(repository.completeTotpLogin({
      ...common,
      acceptedStep: 11,
      sessionId: randomUUID(),
      sessionTokenHash: hashVerificationToken(`totp-session-${randomUUID()}`),
      csrfTokenHash: hashVerificationToken(`totp-csrf-${randomUUID()}`)
    })).resolves.toBe(false);
    await expect(repository.completeRecoveryLogin({
      ...common,
      recoveryCodeId,
      replacementHash: hashVerificationToken(`replacement-${randomUUID()}`),
      sessionId: randomUUID(),
      sessionTokenHash: hashVerificationToken(`recovery-session-${randomUUID()}`),
      csrfTokenHash: hashVerificationToken(`recovery-csrf-${randomUUID()}`)
    })).resolves.toBe(false);
    const after = await database.pool.query<{
      audits: string;
      sessions: string;
      attempts: string;
      factor_step: string;
      recovery_consumed_at: Date | null;
      opaque_targets: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM identity.audit_event
         WHERE event_type='identity.login.failed') AS audits,
        (SELECT count(*)::text FROM identity.session WHERE user_id=$1) AS sessions,
        (SELECT count(*)::text FROM identity.runtime_audit_attempt) AS attempts,
        (SELECT last_accepted_step::text FROM identity.mfa_factor
         WHERE mfa_factor_id=$2) AS factor_step,
        (SELECT consumed_at FROM identity.recovery_code
         WHERE recovery_code_id=$3) AS recovery_consumed_at,
        (SELECT count(*)::text FROM identity.audit_event
         WHERE actor_key_ref<>$4 AND event_type='identity.login.failed'
           AND decision='DENY' AND NOT success AND justification='AUTH_MFA_INVALID'
           AND target_id<>$5) AS opaque_targets
    `,[
      identity.userId,identity.factorId,recoveryCodeId,
      identity.auditToken,missingChallenge.challengeId
    ]);
    expect(Number(after.rows[0]!.audits)-Number(before.rows[0]!.audits)).toBe(2);
    expect(after.rows[0]).toMatchObject({
      sessions: before.rows[0]!.sessions,
      attempts: "0",
      factor_step: "10",
      recovery_consumed_at: null
    });
    expect(Number(after.rows[0]!.opaque_targets)-Number(before.rows[0]!.audits)).toBe(2);
  });

  it("rejects a login challenge at its exact expiry boundary", async () => {
    const identity = await fixtureUser("expiry-boundary");
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const boundary = new Date();
    const challengeId = randomUUID();
    const challenge: LoginChallengeRecord = Object.freeze({
      challengeId,
      challengeTokenHash: hash("a"),
      bindingHash: hash("b"),
      expiresAt: boundary,
      consumedAt: null,
      userId: identity.userId,
      ownerRef: identity.ownerRef,
      auditToken: identity.auditToken,
      passwordHash: identity.passwordHash,
      factorId: identity.factorId,
      secretCiphertext: {} as CryptoEnvelope,
      lastAcceptedStep: 10
    });
    await database.pool.query(`
      INSERT INTO identity.login_challenge (
        login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,
        password_hash_snapshot,created_at,expires_at,consumed_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
    `, [
      challengeId, identity.userId, identity.factorId, challenge.challengeTokenHash,
      challenge.bindingHash, identity.passwordHash, new Date(boundary.getTime() - 1_000), boundary
    ]);
    await expect(repository.completeTotpLogin({
      challenge,
      acceptedStep: 11,
      bindingHash: challenge.bindingHash,
      sessionId: randomUUID(),
      sessionTokenHash: hash("c"),
      csrfTokenHash: hash("d"),
      sessionBindingContext: { user_agent_hash: challenge.bindingHash },
      occurredAt: boundary,
      idleExpiresAt: new Date(boundary.getTime() + 86_400_000),
      absoluteExpiresAt: new Date(boundary.getTime() + 7 * 86_400_000),
      source
    })).resolves.toBe(false);
  });

  it("runs the password-to-TOTP challenge through real Argon2 and creates one hash-only session", async () => {
    const now = new Date("2026-08-23T10:00:00.000Z");
    let currentTime = now;
    const email = `s5-login-${randomUUID()}@example.test`;
    const password = "correct horse battery staple for S5";
    const userId = randomUUID();
    const ownerRef = randomUUID();
    const auditToken = randomUUID();
    const factorId = randomUUID();
    const blindIndexKey = Buffer.alloc(32, 0x51);
    const bindingKey = Buffer.alloc(32, 0x52);
    const dek = generateDek();
    const secret = generateTotpSecret();
    const argon2 = new Argon2WorkerPool({ workers: 1 });
    await argon2.ready();
    try {
      const authPolicy = authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS);
      const passwordHash = await hashPassword(argon2, password, authPolicy.password.argon2id);
      const secretCiphertext = encrypt(dek, secret, [
        "identity", "mfa_factor.secret_ciphertext", factorId, "run:none", userId,
        `user-dek:${userId}`, "1"
      ]);
      await database.pool.query(`
        INSERT INTO identity."user" (
          user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
          phone_ciphertext,password_hash,pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
        ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,$3,$4,$5,$6,'active',$7,$7)
      `, [userId, createEmailBlindIndex(blindIndexKey, email), passwordHash, "s5-real-login", auditToken, ownerRef, now]);
      await database.pool.query(`
        INSERT INTO identity.mfa_factor (
          mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
          state,created_at,verified_at,last_accepted_step
        ) VALUES ($1,$2,'totp',$3::jsonb,NULL,NULL,'active',$4,$4,NULL)
      `, [factorId, userId, JSON.stringify(secretCiphertext), now]);

      const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
      const dekStore: ReadableUserDekStore = {
        store: async () => undefined,
        destroy: async () => "ALREADY_ABSENT",
        exists: async () => true,
        load: async (requestedUserId) => {
          if (requestedUserId !== userId) throw new Error("UNEXPECTED_USER_DEK_LOOKUP");
          return Buffer.from(dek);
        }
      };
      const service = await SessionService.create({
        repository,
        dekStore,
        argon2,
        authPolicy,
        mfaPolicy: mfaPolicyFromValue(MFA_POLICY_REGISTER_ROW.value),
        sessionPolicy: sessionPolicyFromValue(
          SESSION_POLICY_REGISTER_ROW.value,
          SESSION_POLICY_REGISTER_ROW.sourceRef
        ),
        blindIndexKey,
        bindingKey,
        dummyPasswordHash: passwordHash,
        clock: () => currentTime
      });

      const invalidatedChallenge = await service.beginLogin({ email, password }, source);
      expect(invalidatedChallenge.challengeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const replacementPasswordHash = await hashPassword(
        argon2, "replacement password after challenge", authPolicy.password.argon2id
      );
      await database.pool.query(`UPDATE identity."user" SET password_hash=$2 WHERE user_id=$1`, [
        userId, replacementPasswordHash
      ]);
      const step = Math.floor(now.getTime() / 30_000);
      await expect(service.completeLogin({
        challengeToken: invalidatedChallenge.challengeToken,
        code: totpCodeAtStep(secret, step)
      }, source)).rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
      const afterPasswordChange = await database.pool.query<{ count: string }>(
        `SELECT count(*) FROM identity.session WHERE user_id=$1`, [userId]
      );
      expect(Number(afterPasswordChange.rows[0]!.count)).toBe(0);

      await database.pool.query(`UPDATE identity."user" SET password_hash=$2 WHERE user_id=$1`, [
        userId, passwordHash
      ]);
      const challenge = await service.beginLogin({ email, password }, source);
      expect(challenge.challengeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const beforeMfa = await database.pool.query<{ count: string }>(
        `SELECT count(*) FROM identity.session WHERE user_id=$1`, [userId]
      );
      expect(Number(beforeMfa.rows[0]!.count)).toBe(0);

      const completed = await service.completeLogin({
        challengeToken: challenge.challengeToken,
        code: totpCodeAtStep(secret, step)
      }, source);
      expect(completed.session).toMatchObject({
        asker_id: `owner:${ownerRef}`,
        ownership_provenance: "server_session",
        provisional_identity_model: false
      });
      expect(completed.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(completed.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);

      const persisted = await database.pool.query<{
        token_hash: string;
        csrf_token_hash: string;
        count: string;
      }>(`
        SELECT token_hash,csrf_token_hash,count(*) OVER ()::text AS count
        FROM identity.session WHERE user_id=$1
      `, [userId]);
      expect(persisted.rows).toHaveLength(1);
      expect(persisted.rows[0]).toMatchObject({
        token_hash: hashVerificationToken(completed.sessionToken),
        csrf_token_hash: hashVerificationToken(completed.csrfToken),
        count: "1"
      });
      expect(JSON.stringify(persisted.rows[0])).not.toContain(completed.sessionToken);
      const authenticated = await service.authenticate(completed.sessionToken, source);
      expect(authenticated).toMatchObject({ userId, ownerRef, session: { asker_id: `owner:${ownerRef}` } });
      if (authenticated === null) throw new Error("expected the new session to authenticate");

      await expect(service.stepUp({
        session: authenticated,
        password: "wrong password",
        code: totpCodeAtStep(secret, step + 1)
      }, source)).rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
      const failedStepUp = await database.pool.query<{
        success: boolean; source_context: Record<string, unknown>; target_id: string;
      }>(`
        SELECT success,source_context,target_id FROM identity.audit_event
        WHERE event_type='identity.session.step_up' AND success=false
        ORDER BY occurred_at DESC,audit_id DESC LIMIT 1
      `);
      expect(failedStepUp.rows[0]?.success).toBe(false);
      expect(failedStepUp.rows[0]?.target_id).not.toBe(completed.session.session_id);
      expect(failedStepUp.rows[0]?.source_context).toEqual({
        ipArgon2id: expect.stringMatching(/^argon2id-audit:v1:[0-9a-f]{64}$/),
        userAgentArgon2id: expect.stringMatching(/^argon2id-audit:v1:[0-9a-f]{64}$/)
      });

      currentTime = new Date(now.getTime() + 30_000);
      const rotated = await service.stepUp({
        session: authenticated,
        password,
        code: totpCodeAtStep(secret, step + 1)
      }, source);
      expect(rotated.sessionToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(rotated.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      await expect(service.authenticate(completed.sessionToken, source)).resolves.toBeNull();
      await expect(service.authenticate(rotated.sessionToken, source)).resolves.toMatchObject({
        userId, ownerRef, session: { asker_id: `owner:${ownerRef}` }
      });
      await expect(service.completeLogin({
        challengeToken: challenge.challengeToken,
        code: totpCodeAtStep(secret, step)
      }, source)).rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
      const afterReplay = await database.pool.query<{ count: string }>(
        `SELECT count(*) FROM identity.session WHERE user_id=$1`, [userId]
      );
      expect(Number(afterReplay.rows[0]!.count)).toBe(1);
    } finally {
      secret.fill(0);
      dek.fill(0);
      blindIndexKey.fill(0);
      bindingKey.fill(0);
      await argon2.close();
    }
  }, 30_000);

  it("revoke-all atomically removes every active session and audit rows contain no credential material", async () => {
    const identity = await fixtureUser("all");
    const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
    const secretHashes = [hash("5"), hash("6")];
    const initiatingSessionId = await fixtureSession(identity.userId, secretHashes[0]!, hash("7"));
    await fixtureSession(identity.userId, secretHashes[1]!, hash("8"));
    await expect(repository.revokeAllSessions({
      userId: identity.userId, initiatingSessionId, occurredAt: new Date(), source
    }))
      .resolves.toBe(2);
    await expect(repository.revokeAllSessions({
      userId: identity.userId, initiatingSessionId, occurredAt: new Date(), source
    })).resolves.toBe(0);
    await expect(repository.listActiveSessions(identity.userId, new Date())).resolves.toEqual([]);
    const audit = await database.pool.query<{ source_context: unknown; body: string }>(`
      SELECT source_context,(row_to_json(event)::text) AS body
      FROM identity.audit_event event
      WHERE actor_key_ref=$1 ORDER BY occurred_at DESC
    `, [identity.auditToken]);
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows[0]!.source_context).toEqual({
      ipArgon2id: "argon2id-audit:v1:" + "1".repeat(64),
      userAgentArgon2id: "argon2id-audit:v1:" + "2".repeat(64)
    });
    expect(audit.rows[0]!.body).not.toContain(initiatingSessionId);
    for (const row of audit.rows) {
      for (const secret of secretHashes) expect(row.body).not.toContain(secret);
      expect(row.body).not.toContain(identity.userId);
    }
    const successfulRevokeAll = await database.pool.query<{ count: string }>(`
      SELECT count(*)::text AS count FROM identity.audit_event
      WHERE actor_key_ref=$1 AND event_type='identity.session.revoked_all' AND success
    `, [identity.auditToken]);
    expect(successfulRevokeAll.rows[0]?.count).toBe("1");
  });

  it("S10 operation-bound audit capabilities reject generic, no-op and replay attacks", async () => {
    const identity = await fixtureUser("audit-capability");
    const currentHash = fixtureHash("audit-capability-current");
    const replacementHash = fixtureHash("audit-capability-replacement");
    const replacementCsrf = fixtureHash("audit-capability-replacement-csrf");
    const sessionId = await fixtureSession(
      identity.userId,currentHash,fixtureHash("audit-capability-current-csrf")
    );
    const sourceContext = JSON.stringify({
      ipArgon2id: "argon2id-audit:v1:" + "1".repeat(64),
      userAgentArgon2id: "argon2id-audit:v1:" + "2".repeat(64)
    });
    const catalog = await database.pool.query<{ auth_internal: boolean; runtime_cap: boolean;
      auth_cap: boolean; obsolete_generic: string | null; obsolete_success: string | null }>(`
      SELECT
        has_function_privilege('debateai_authorization_runtime',
          'identity.append_runtime_audit_event_internal(uuid,text,uuid,timestamptz,jsonb,text,boolean,text)',
          'EXECUTE') AS auth_internal,
        has_function_privilege('debateai_runtime',
          'identity.rotate_session_after_step_up_with_audit(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz,jsonb)',
          'EXECUTE') AS runtime_cap,
        has_function_privilege('debateai_authorization_runtime',
          'identity.rotate_session_after_step_up_with_audit(uuid,uuid,text,uuid,bigint,uuid,text,text,text,jsonb,timestamptz,uuid,text,text,uuid,timestamptz,jsonb)',
          'EXECUTE') AS auth_cap,
        to_regprocedure('identity.append_runtime_audit_event(uuid,text,uuid,timestamptz,jsonb,text,boolean,text)')::text AS obsolete_generic,
        to_regprocedure('identity.audit_session_step_up(uuid,uuid,jsonb)')::text AS obsolete_success
    `);
    expect(catalog.rows[0]).toEqual({
      auth_internal: false,runtime_cap: false,auth_cap: true,
      obsolete_generic: null,obsolete_success: null
    });

    const attack = await database.pool.connect();
    try {
      await attack.query("BEGIN");
      await attack.query("SET LOCAL ROLE debateai_authorization_runtime");
      await expect(attack.query(`SELECT identity.append_runtime_audit_event_internal(
        $1,'identity.session.step_up',$2,clock_timestamp(),$3::jsonb,'ALLOW',true,NULL
      )`, [identity.auditToken,sessionId,sourceContext])).rejects.toMatchObject({ code: "42501" });
      await attack.query("ROLLBACK");

      await attack.query("BEGIN");
      await attack.query("SET LOCAL ROLE debateai_authorization_runtime");
      await expect(attack.query(
        "UPDATE identity.session SET last_seen_at=last_seen_at WHERE session_id=$1",
        [sessionId]
      )).rejects.toMatchObject({ code: "42501" });
      await attack.query("ROLLBACK");

      await attack.query("BEGIN");
      await attack.query("SET LOCAL ROLE debateai_authorization_runtime");
      await attack.query("SELECT identity.begin_runtime_audit_attempt()");
      const forged = await attack.query<{ valid: boolean }>(`
        SELECT identity.rotate_session_after_step_up_with_audit(
          $1,$2,$3,$4,11,$5,$6,$7,$8,'{}'::jsonb,$9,NULL,NULL,NULL,NULL,NULL,$10::jsonb
        ) AS valid
      `, [identity.userId,identity.ownerRef,identity.passwordHash,identity.factorId,
        sessionId,hash("e"),replacementHash,replacementCsrf,
        new Date(Date.now() + 60_000),sourceContext]);
      expect(forged.rows[0]?.valid).toBe(false);
      await attack.query("COMMIT");

      await attack.query("BEGIN");
      await attack.query("SET LOCAL ROLE debateai_authorization_runtime");
      await expect(attack.query(`SELECT identity.rotate_session_after_step_up_with_audit(
        $1,$2,$3,$4,11,$5,$6,$7,$8,'{}'::jsonb,$9,NULL,NULL,NULL,NULL,NULL,$10::jsonb
      )`, [identity.userId,identity.ownerRef,identity.passwordHash,identity.factorId,
        sessionId,currentHash,replacementHash,replacementCsrf,
        new Date(Date.now() + 60_000),sourceContext])).rejects.toMatchObject({
        code: "55000", message: "AUDIT_ATTEMPT_REQUIRED"
      });
      await attack.query("ROLLBACK");
    } finally {
      attack.release();
    }
    const unchanged = await database.pool.query<{ token_hash: string }>(`
      SELECT token_hash FROM identity.session WHERE session_id=$1
    `, [sessionId]);
    expect(unchanged.rows[0]?.token_hash).toBe(currentHash);
  });

  it("S10 T9 denies direct DML across every account child and intent family", async () => {
    const governedRelations = [
      'identity."user"',
      "identity.channel_binding",
      "identity.verification_token_credential",
      "identity.mfa_factor",
      "identity.recovery_code",
      "identity.session",
      "identity.login_challenge",
      "identity.step_up_grant",
      "identity.audit_event",
      "identity.account_erasure_request",
      "identity.account_erasure_notification_outbox",
      "identity.publication_event_binding",
      "identity.private_erasure_audit_binding",
      "identity.run_execution_binding",
      "identity.runtime_audit_attempt",
      "core.publication_ref_tombstone",
      "core.run_key_provision_intent",
      "serve.publication_key_provision_intent",
      "serve.publication_key_cleanup_intent",
      "serve.private_run_key_cleanup_intent",
      "serve.private_run_erasure_tombstone"
    ] as const;
    const serviceRoles = [
      "debateai_runtime",
      "debateai_authorization_runtime",
      "debateai_erasure_runtime",
      "debateai_replay",
      "debateai_publication_cleanup"
    ] as const;
    const privileges = ["INSERT","UPDATE","DELETE","TRUNCATE"] as const;
    const serviceViolations = await database.pool.query<{
      role_name: string;relation_name: string;privilege_name: string;
    }>(`
      SELECT role_name,relation_name,privilege_name
      FROM unnest($1::text[]) AS role_name
      CROSS JOIN unnest($2::text[]) AS relation_name
      CROSS JOIN unnest($3::text[]) AS privilege_name
      WHERE has_table_privilege(role_name,relation_name,privilege_name)
      ORDER BY role_name,relation_name,privilege_name
    `, [serviceRoles,governedRelations,privileges]);
    expect(serviceViolations.rows).toEqual([]);

    const publicViolations = await database.pool.query<{
      relation_name: string;privilege_name: string;
    }>(`
      SELECT target.relation_name,acl.privilege_type AS privilege_name
      FROM unnest($1::text[]) AS target(relation_name)
      JOIN pg_catalog.pg_class AS relation
        ON relation.oid=pg_catalog.to_regclass(target.relation_name)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        relation.relacl,pg_catalog.acldefault('r',relation.relowner)
      )) AS acl
      WHERE acl.grantee=0
        AND acl.privilege_type=ANY($2::text[])
      ORDER BY target.relation_name,acl.privilege_type
    `, [governedRelations,privileges]);
    expect(publicViolations.rows).toEqual([]);

    const internalFunctions = [
      "identity.lock_account_t9_internal(uuid,boolean)",
      "identity.consume_runtime_audit_attempt()",
      "identity.append_runtime_audit_event_internal(uuid,text,uuid,timestamptz,jsonb,text,boolean,text)",
      "identity.append_audit_event_internal(uuid,text,text,text,text,timestamptz,jsonb,text,boolean,text)",
      "core.private_run_erasure_for_run(uuid)",
      "core.private_run_erasure_audit_seed(uuid)",
      "identity.account_erasure_audit_seed(uuid)"
    ] as const;
    const publicFunctionViolations = await database.pool.query<{ signature: string }>(`
      SELECT target.signature
      FROM unnest($1::text[]) AS target(signature)
      JOIN pg_catalog.pg_proc AS routine
        ON routine.oid=pg_catalog.to_regprocedure(target.signature)
      CROSS JOIN LATERAL pg_catalog.aclexplode(COALESCE(
        routine.proacl,pg_catalog.acldefault('f',routine.proowner)
      )) AS acl
      WHERE acl.grantee=0 AND acl.privilege_type='EXECUTE'
      ORDER BY target.signature
    `, [internalFunctions]);
    expect(publicFunctionViolations.rows).toEqual([]);
  });

  it("S10 T9 serializes real factor writers against recovery consumption in both orders", async () => {
    const sourceContext = JSON.stringify({
      ipArgon2id: "argon2id-audit:v1:" + "1".repeat(64),
      userAgentArgon2id: "argon2id-audit:v1:" + "2".repeat(64)
    });
    const direct = await database.pool.connect();
    const directIdentity = await fixtureUser("factor-direct-deny");
    try {
      await direct.query("SET ROLE debateai_runtime");
      await expect(direct.query(
        "UPDATE identity.mfa_factor SET state='revoked' WHERE mfa_factor_id=$1",
        [directIdentity.factorId]
      )).rejects.toMatchObject({ code: "42501" });
    } finally {
      await direct.query("RESET ROLE").catch(() => undefined);
      direct.release();
    }

    const runSchedule = async (factorWins: boolean): Promise<void> => {
      const identity = await fixtureUser(factorWins ? "step-wins" : "recovery-wins");
      const scheduleLabel = factorWins ? "step-wins" : "recovery-wins";
      const currentHash = fixtureHash(`${scheduleLabel}-current`);
      const sessionId = await fixtureSession(
        identity.userId,currentHash,fixtureHash(`${scheduleLabel}-csrf`)
      );
      const recoveryCodeId = randomUUID();
      await database.pool.query(`
        INSERT INTO identity.recovery_code(
          recovery_code_id,user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
        ) VALUES ($1,$2,1,$3,clock_timestamp(),NULL,NULL)
      `,[recoveryCodeId,identity.userId,fixtureHash(`${scheduleLabel}-recovery-code`)]);
      const pauseKey = factorWins ? 805001 : 805002;
      const triggerName = factorWins ? "s10_pause_factor_writer" : "s10_pause_recovery_writer";
      const functionName = factorWins ? "s10_pause_factor_writer" : "s10_pause_recovery_writer";
      const relation = factorWins ? "identity.mfa_factor" : "identity.recovery_code";
      const updateColumn = factorWins ? "last_accepted_step" : "consumed_at";
      await database.pool.query(`
        CREATE OR REPLACE FUNCTION public.${functionName}()
        RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $body$
        BEGIN
          IF NEW.user_id::text=TG_ARGV[0] THEN
            PERFORM pg_advisory_xact_lock(TG_ARGV[1]::bigint);
          END IF;
          RETURN NEW;
        END
        $body$;
        DROP TRIGGER IF EXISTS ${triggerName} ON ${relation};
        CREATE TRIGGER ${triggerName}
        BEFORE UPDATE OF ${updateColumn} ON ${relation}
        FOR EACH ROW EXECUTE FUNCTION public.${functionName}(
          '${identity.userId}','${pauseKey}'
        )
      `);
      const barrier = await database.pool.connect();
      const recoveryClient = await database.pool.connect();
      const factorClient = await database.pool.connect();
      try {
        await barrier.query("BEGIN");
        await barrier.query("SELECT pg_advisory_xact_lock($1)",[pauseKey]);
        await recoveryClient.query("BEGIN");
        await recoveryClient.query("SET LOCAL ROLE debateai_runtime");
        await recoveryClient.query("SELECT identity.begin_runtime_audit_attempt()");
        await factorClient.query("BEGIN");
        await factorClient.query("SET LOCAL ROLE debateai_authorization_runtime");
        await factorClient.query("SELECT identity.begin_runtime_audit_attempt()");
        const recover = () => recoveryClient.query<{ valid: boolean }>(`
          SELECT identity.consume_recovery_code_with_audit(
            $1,$2,$3,clock_timestamp(),$4::jsonb
          ) AS valid
        `,[identity.userId,recoveryCodeId,hash(factorWins ? "8" : "d"),sourceContext]).then(async (result) => {
          await recoveryClient.query("COMMIT");
          return result.rows[0]?.valid === true;
        });
        const writeFactor = () => factorClient.query<{ valid: boolean }>(`
          SELECT identity.rotate_session_after_step_up_with_audit(
            $1,$2,$3,$4,11,$5,$6,$7,$8,'{}'::jsonb,$9,
            NULL::uuid,NULL::text,NULL::text,NULL::uuid,NULL::timestamptz,$10::jsonb
          ) AS valid
        `,[identity.userId,identity.ownerRef,identity.passwordHash,identity.factorId,
          sessionId,currentHash,hash(factorWins ? "9" : "e"),hash(factorWins ? "a" : "f"),
          new Date(Date.now()+60_000),sourceContext]).then(async (result) => {
          await factorClient.query("COMMIT");
          return result.rows[0]?.valid === true;
        });
        const winner = factorWins ? writeFactor() : recover();
        await expectStillPending(winner);
        const follower = factorWins ? recover() : writeFactor();
        await expectStillPending(follower);
        await barrier.query("COMMIT");
        expect(await winner).toBe(true);
        expect(await follower).toBe(true);
      } finally {
        await Promise.all([
          barrier.query("ROLLBACK").catch(() => undefined),
          recoveryClient.query("ROLLBACK").catch(() => undefined),
          factorClient.query("ROLLBACK").catch(() => undefined)
        ]);
        barrier.release();
        recoveryClient.release();
        factorClient.release();
        await database.pool.query(`DROP TRIGGER IF EXISTS ${triggerName} ON ${relation}`);
        await database.pool.query(`DROP FUNCTION IF EXISTS public.${functionName}()`);
      }
      const state = await database.pool.query<{
        last_accepted_step: string;consumed_at: Date | null;replacement_count: string;
      }>(`
        SELECT factor.last_accepted_step::text,recovery.consumed_at,
          (SELECT count(*)::text FROM identity.recovery_code AS replacement
            WHERE replacement.user_id=$1 AND replacement.code_slot=1
              AND replacement.consumed_at IS NULL) AS replacement_count
        FROM identity.mfa_factor AS factor
        JOIN identity.recovery_code AS recovery ON recovery.recovery_code_id=$2
        WHERE factor.mfa_factor_id=$3
      `,[identity.userId,recoveryCodeId,identity.factorId]);
      expect(state.rows[0]).toMatchObject({
        last_accepted_step: "11",replacement_count: "1"
      });
      expect(state.rows[0]?.consumed_at).toBeInstanceOf(Date);
    };
    await runSchedule(false);
    await runSchedule(true);
  });
});
