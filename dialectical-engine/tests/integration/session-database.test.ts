import { randomUUID } from "node:crypto";
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
  hashSourceIp: async () => "$argon2id$v=19$m=19456,t=2,p=1$source$ip",
  hashUserAgent: async () => "$argon2id$v=19$m=19456,t=2,p=1$source$ua"
}) as unknown as AuditContextHasher;

function hash(symbol: string): string {
  return `sha256:${symbol.repeat(64)}`;
}

async function fixtureUser(label: string): Promise<Readonly<{
  userId: string;
  auditToken: string;
  factorId: string;
  passwordHash: string;
}>> {
  const userId = randomUUID();
  const auditToken = randomUUID();
  const passwordHash = "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  await database.pool.query(`
    INSERT INTO identity."user" (
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
      phone_ciphertext,password_hash,pseudonym,audit_token,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,$3,$4,$5,'active',now(),now())
  `, [userId, Buffer.alloc(32, label.charCodeAt(0)), passwordHash, `s5-${label}`, auditToken]);
  const factorId = randomUUID();
  await database.pool.query(`
    INSERT INTO identity.mfa_factor (
      mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
      state,created_at,verified_at,last_accepted_step
    ) VALUES ($1,$2,'totp','{}'::jsonb,NULL,NULL,'active',now(),now(),10)
  `, [factorId, userId]);
  return Object.freeze({ userId, auditToken, factorId, passwordHash });
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
    const absolute = new Date(now.getTime() + 60_000);
    const sessionId = await fixtureSession(identity.userId, hash("a"), hash("c"), {
      bindingHash: hash("b"),
      idleExpiresAt: new Date(now.getTime() + 30_000),
      absoluteExpiresAt: absolute
    });
    const refreshed = await repository.authenticateSession({
      tokenHash: hash("a"), bindingHash: hash("b"), occurredAt: now,
      idleExpiresAt: new Date(now.getTime() + 14 * 86_400_000)
    });
    expect(refreshed).toMatchObject({ sessionId, userId: identity.userId, csrfTokenHash: hash("c") });
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

  it("linearizes refresh against revoke and keeps own revoke idempotent/foreign indistinguishable", async () => {
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
    await expect(repository.revokeSession({ userId: owner.userId, sessionId, occurredAt, source })).resolves.toBe(true);
    await expect(repository.revokeSession({ userId: foreign.userId, sessionId, occurredAt, source })).resolves.toBe(false);
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
          phone_ciphertext,password_hash,pseudonym,audit_token,state,adult_affirmed_at,created_at
        ) VALUES ($1,$2,'{}'::jsonb,'{}'::jsonb,NULL,$3,$4,$5,'active',$6,$6)
      `, [userId, createEmailBlindIndex(blindIndexKey, email), passwordHash, "s5-real-login", auditToken, now]);
      await database.pool.query(`
        INSERT INTO identity.mfa_factor (
          mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
          state,created_at,verified_at,last_accepted_step
        ) VALUES ($1,$2,'totp',$3::jsonb,NULL,NULL,'active',$4,$4,NULL)
      `, [factorId, userId, JSON.stringify(secretCiphertext), now]);

      const repository = new PostgresSessionRepository(database.pool, fakeAuditHasher);
      const dekStore: ReadableUserDekStore = {
        store: async () => undefined,
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
      expect(authenticated).toMatchObject({ userId });
      if (authenticated === null) throw new Error("expected the new session to authenticate");

      await expect(service.stepUp({
        session: authenticated,
        password: "wrong password",
        code: totpCodeAtStep(secret, step + 1)
      }, source)).rejects.toMatchObject({ code: "AUTH_CREDENTIALS_INVALID" });
      const failedStepUp = await database.pool.query<{ success: boolean; source_context: unknown }>(`
        SELECT success,source_context FROM identity.audit_event
        WHERE event_type='identity.session.step_up' AND target_id=$1
        ORDER BY occurred_at DESC,audit_id DESC LIMIT 1
      `, [completed.session.session_id]);
      expect(failedStepUp.rows[0]).toMatchObject({
        success: false,
        source_context: { requestId: source.requestId }
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
      await expect(service.authenticate(rotated.sessionToken, source)).resolves.toMatchObject({ userId });
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
    await expect(repository.listActiveSessions(identity.userId, new Date())).resolves.toEqual([]);
    const audit = await database.pool.query<{ source_context: unknown; body: string }>(`
      SELECT source_context,(row_to_json(event)::text) AS body
      FROM identity.audit_event event
      WHERE actor_key_ref=$1 ORDER BY occurred_at DESC
    `, [identity.auditToken]);
    expect(audit.rows.length).toBeGreaterThan(0);
    expect(audit.rows[0]!.source_context).toMatchObject({ requestId: source.requestId });
    expect(audit.rows[0]!.body).toContain(initiatingSessionId);
    for (const row of audit.rows) {
      for (const secret of secretHashes) expect(row.body).not.toContain(secret);
      expect(row.body).not.toContain(identity.userId);
    }
  });
});
