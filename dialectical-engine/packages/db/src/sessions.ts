import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  appendAuditEvent,
  type AuditContextHasher,
  type CryptoEnvelope
} from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";

export interface LoginIdentityRecord {
  readonly userId: string;
  readonly ownerRef: string;
  readonly auditToken: string;
  readonly passwordHash: string;
  readonly factorId: string;
  readonly secretCiphertext: CryptoEnvelope;
  readonly lastAcceptedStep: number | null;
}

export interface LoginChallengeRecord extends LoginIdentityRecord {
  readonly challengeId: string;
  readonly challengeTokenHash: string;
  readonly bindingHash: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
}

export interface SessionAuthenticationRecord {
  readonly sessionId: string;
  readonly userId: string;
  readonly ownerRef: string;
  readonly csrfTokenHash: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly lastMfaAt: Date;
}

export interface SessionListRecord {
  readonly sessionId: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly idleExpiresAt: Date;
  readonly absoluteExpiresAt: Date;
  readonly lastMfaAt: Date;
}

type PreparedAuditContext = Readonly<{
  ipArgon2id: string;
  userAgentArgon2id: string;
  requestId: string;
}>;

function normalized(value: unknown, maximumLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return (text === "" ? "unknown" : text).slice(0, maximumLength);
}

function assertOpaqueAuditToken(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError("AUDIT_TOKEN_MUST_BE_RANDOM_UUID_V4");
  }
}

function assertCredentialHash(value: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw new TypeError("SESSION_CREDENTIAL_HASH_INVALID");
}

export class PostgresSessionRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auditContext: AuditContextHasher
  ) {}

  private async prepareAuditContext(source: AuthSourceContext): Promise<PreparedAuditContext> {
    const ip = normalized(source?.ip, 64);
    const userAgent = normalized(source?.userAgent, 256);
    // Both memory-hard reductions complete before pool.connect(), BEGIN, row
    // locks, or the audit advisory lock. This is the identity repository law.
    const ipArgon2id = await this.auditContext.hashSourceIp(ip);
    const userAgentArgon2id = await this.auditContext.hashUserAgent(userAgent);
    return Object.freeze({
      ipArgon2id,
      userAgentArgon2id,
      requestId: normalized(source?.requestId, 128)
    });
  }

  private async transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async appendAudit(client: PoolClient, prepared: PreparedAuditContext, input: Readonly<{
    actorToken: string;
    eventType: string;
    targetType: string;
    targetId: string;
    occurredAt: Date;
    decision: "ALLOW" | "DENY";
    success: boolean;
    justification: string | null;
  }>): Promise<void> {
    assertOpaqueAuditToken(input.actorToken);
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('identity:audit-chain', 0))");
    const head = await client.query<{ this_hash: Buffer }>(`
      SELECT parent.this_hash
      FROM identity.audit_event parent
      LEFT JOIN identity.audit_event child ON child.prev_hash=parent.this_hash
      WHERE child.audit_id IS NULL
      ORDER BY parent.occurred_at DESC,parent.audit_id DESC
      LIMIT 1
    `);
    const chained = appendAuditEvent(head.rows[0]?.this_hash.toString("hex") ?? null, Object.freeze({
      auditId: randomUUID(),
      actorCiphertext: null,
      actorKeyRef: input.actorToken,
      eventType: input.eventType,
      targetType: input.targetType,
      targetId: input.targetId,
      occurredAt: input.occurredAt,
      sourceContext: Object.freeze({
        ipArgon2id: prepared.ipArgon2id,
        userAgentArgon2id: prepared.userAgentArgon2id,
        requestId: prepared.requestId
      }),
      decision: input.decision,
      success: input.success,
      justification: input.justification
    }));
    await client.query(`
      INSERT INTO identity.audit_event (
        audit_id,prev_hash,this_hash,actor_ciphertext,actor_key_ref,event_type,
        target_type,target_id,occurred_at,source_context,decision,success,justification
      ) VALUES ($1,$2,$3,NULL,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12)
    `, [
      chained.auditId,
      chained.prevHash === null ? null : Buffer.from(chained.prevHash, "hex"),
      Buffer.from(chained.thisHash, "hex"),
      chained.actorKeyRef,
      chained.eventType,
      chained.targetType,
      chained.targetId,
      chained.occurredAt,
      JSON.stringify(chained.sourceContext),
      chained.decision,
      chained.success,
      chained.justification
    ]);
  }

  async findLoginIdentity(emailBlindIndex: Buffer): Promise<LoginIdentityRecord | null> {
    const result = await this.pool.query<{
      user_id: string;
      owner_ref: string;
      audit_token: string;
      password_hash: string;
      mfa_factor_id: string;
      secret_ciphertext: CryptoEnvelope;
      last_accepted_step: string | number | null;
    }>(`
      SELECT u.user_id,u.owner_ref,u.audit_token,u.password_hash,f.mfa_factor_id,
        f.secret_ciphertext,f.last_accepted_step
      FROM identity."user" u
      JOIN LATERAL (
        SELECT mfa_factor_id,secret_ciphertext,last_accepted_step
        FROM identity.mfa_factor
        WHERE user_id=u.user_id AND factor_type='totp' AND state='active'
        ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1
      ) f ON true
      WHERE u.email_blind_index=$1 AND u.state='active'
    `, [emailBlindIndex]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      userId: row.user_id,
      ownerRef: row.owner_ref,
      auditToken: row.audit_token,
      passwordHash: row.password_hash,
      factorId: row.mfa_factor_id,
      secretCiphertext: row.secret_ciphertext,
      lastAcceptedStep: row.last_accepted_step === null ? null : Number(row.last_accepted_step)
    });
  }

  async createLoginChallenge(input: Readonly<{
    identity: LoginIdentityRecord;
    challengeId: string;
    challengeTokenHash: string;
    bindingHash: string;
    occurredAt: Date;
    expiresAt: Date;
    source: AuthSourceContext;
  }>): Promise<boolean> {
    assertCredentialHash(input.challengeTokenHash);
    assertCredentialHash(input.bindingHash);
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      // Lock/revalidate parent before its active factor and challenge child.
      const user = (await client.query<{ audit_token: string; owner_ref: string }>(`
        SELECT audit_token,owner_ref FROM identity."user"
        WHERE user_id=$1 AND owner_ref=$2 AND state='active' AND password_hash=$3
        FOR UPDATE
      `, [input.identity.userId, input.identity.ownerRef, input.identity.passwordHash])).rows[0];
      const factor = user === undefined ? undefined : (await client.query<{ mfa_factor_id: string }>(`
        SELECT mfa_factor_id FROM identity.mfa_factor
        WHERE mfa_factor_id=$1 AND user_id=$2 AND factor_type='totp' AND state='active'
        FOR UPDATE
      `, [input.identity.factorId, input.identity.userId])).rows[0];
      const valid = user !== undefined && factor !== undefined;
      if (valid) {
        await client.query(`
          INSERT INTO identity.login_challenge (
            login_challenge_id,user_id,mfa_factor_id,token_hash,binding_hash,
            password_hash_snapshot,created_at,expires_at,consumed_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL)
        `, [
          input.challengeId, input.identity.userId, input.identity.factorId,
          input.challengeTokenHash, input.bindingHash, input.identity.passwordHash,
          input.occurredAt, input.expiresAt
        ]);
      }
      await this.appendAudit(client, prepared, {
        actorToken: user?.audit_token ?? randomUUID(),
        eventType: "identity.login.password_verified",
        targetType: "identity.login_challenge",
        targetId: valid ? input.challengeId : randomUUID(),
        occurredAt: input.occurredAt,
        decision: valid ? "ALLOW" : "DENY",
        success: valid,
        justification: valid ? null : "AUTH_CREDENTIALS_INVALID"
      });
      return valid;
    });
  }

  async recordLoginFailure(input: Readonly<{
    actorToken?: string;
    occurredAt: Date;
    source: AuthSourceContext;
    reason: "AUTH_CREDENTIALS_INVALID" | "AUTH_MFA_INVALID" | "AUTH_RATE_LIMITED";
  }>): Promise<void> {
    const prepared = await this.prepareAuditContext(input.source);
    await this.transaction((client) => this.appendAudit(client, prepared, {
      actorToken: input.actorToken ?? randomUUID(),
      eventType: "identity.login.failed",
      targetType: "identity.login_attempt",
      targetId: randomUUID(),
      occurredAt: input.occurredAt,
      decision: "DENY",
      success: false,
      justification: input.reason
    }));
  }

  async recordStepUpFailure(input: Readonly<{
    actorToken?: string;
    sessionId: string;
    occurredAt: Date;
    source: AuthSourceContext;
    reason: "AUTH_CREDENTIALS_INVALID" | "AUTH_RATE_LIMITED";
  }>): Promise<void> {
    const prepared = await this.prepareAuditContext(input.source);
    await this.transaction((client) => this.appendAudit(client, prepared, {
      actorToken: input.actorToken ?? randomUUID(),
      eventType: "identity.session.step_up",
      targetType: "identity.session",
      targetId: input.sessionId,
      occurredAt: input.occurredAt,
      decision: "DENY",
      success: false,
      justification: input.reason
    }));
  }

  async readLoginChallenge(challengeTokenHash: string): Promise<LoginChallengeRecord | null> {
    assertCredentialHash(challengeTokenHash);
    const result = await this.pool.query<{
      login_challenge_id: string;
      user_id: string;
      owner_ref: string;
      audit_token: string;
      password_hash_snapshot: string;
      mfa_factor_id: string;
      secret_ciphertext: CryptoEnvelope;
      last_accepted_step: string | number | null;
      binding_hash: string;
      expires_at: Date;
      consumed_at: Date | null;
    }>(`
      SELECT c.login_challenge_id,c.user_id,u.owner_ref,u.audit_token,c.password_hash_snapshot,
        f.mfa_factor_id,f.secret_ciphertext,f.last_accepted_step,
        c.binding_hash,c.expires_at,c.consumed_at
      FROM identity.login_challenge c
      JOIN identity."user" u ON u.user_id=c.user_id AND u.state='active'
      JOIN identity.mfa_factor f ON f.mfa_factor_id=c.mfa_factor_id
        AND f.user_id=u.user_id AND f.factor_type='totp' AND f.state='active'
      WHERE c.token_hash=$1 AND u.password_hash=c.password_hash_snapshot
    `, [challengeTokenHash]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      challengeId: row.login_challenge_id,
      challengeTokenHash,
      userId: row.user_id,
      ownerRef: row.owner_ref,
      auditToken: row.audit_token,
      passwordHash: row.password_hash_snapshot,
      factorId: row.mfa_factor_id,
      secretCiphertext: row.secret_ciphertext,
      lastAcceptedStep: row.last_accepted_step === null ? null : Number(row.last_accepted_step),
      bindingHash: row.binding_hash,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at
    });
  }

  async completeTotpLogin(input: Readonly<{
    challenge: LoginChallengeRecord;
    acceptedStep: number;
    bindingHash: string;
    sessionId: string;
    sessionTokenHash: string;
    csrfTokenHash: string;
    sessionBindingContext: Readonly<Record<string, string>>;
    occurredAt: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
    source: AuthSourceContext;
  }>): Promise<boolean> {
    assertCredentialHash(input.bindingHash);
    assertCredentialHash(input.sessionTokenHash);
    assertCredentialHash(input.csrfTokenHash);
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const user = (await client.query<{ audit_token: string; owner_ref: string }>(`
        SELECT audit_token,owner_ref FROM identity."user"
        WHERE user_id=$1 AND owner_ref=$2 AND state='active' AND password_hash=$3 FOR UPDATE
      `, [input.challenge.userId, input.challenge.ownerRef, input.challenge.passwordHash])).rows[0];
      const factor = user === undefined ? undefined : (await client.query<{
        last_accepted_step: string | number | null;
      }>(`
        SELECT last_accepted_step FROM identity.mfa_factor
        WHERE mfa_factor_id=$1 AND user_id=$2 AND factor_type='totp' AND state='active'
        FOR UPDATE
      `, [input.challenge.factorId, input.challenge.userId])).rows[0];
      const challenge = factor === undefined ? undefined : (await client.query<{
        consumed_at: Date | null;
        expires_at: Date;
        binding_hash: string;
        password_hash_snapshot: string;
      }>(`
        SELECT consumed_at,expires_at,binding_hash,password_hash_snapshot FROM identity.login_challenge
        WHERE login_challenge_id=$1 AND token_hash=$2 AND user_id=$3 AND mfa_factor_id=$4
        FOR UPDATE
      `, [
        input.challenge.challengeId, input.challenge.challengeTokenHash,
        input.challenge.userId, input.challenge.factorId
      ])).rows[0];
      const previousStep = factor?.last_accepted_step === null || factor?.last_accepted_step === undefined
        ? null : Number(factor.last_accepted_step);
      const valid = user !== undefined && factor !== undefined && challenge !== undefined
        && challenge.consumed_at === null
        && challenge.expires_at.getTime() > input.occurredAt.getTime()
        && challenge.binding_hash === input.bindingHash
        && challenge.password_hash_snapshot === input.challenge.passwordHash
        && (previousStep === null || input.acceptedStep > previousStep);
      if (valid) {
        await client.query(`UPDATE identity.mfa_factor SET last_accepted_step=$2 WHERE mfa_factor_id=$1`, [
          input.challenge.factorId, input.acceptedStep
        ]);
        await client.query(`UPDATE identity.login_challenge SET consumed_at=$2 WHERE login_challenge_id=$1`, [
          input.challenge.challengeId, input.occurredAt
        ]);
        await client.query(`
          INSERT INTO identity.session (
            session_id,user_id,token_hash,csrf_token_hash,binding_context,
            created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
          ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6,$7,$8,$6,NULL)
        `, [
          input.sessionId, input.challenge.userId, input.sessionTokenHash, input.csrfTokenHash,
          JSON.stringify(input.sessionBindingContext), input.occurredAt,
          input.idleExpiresAt, input.absoluteExpiresAt
        ]);
      }
      await this.appendAudit(client, prepared, {
        actorToken: user?.audit_token ?? randomUUID(),
        eventType: valid ? "identity.session.created" : "identity.login.failed",
        targetType: valid ? "identity.session" : "identity.login_attempt",
        targetId: valid ? input.sessionId : input.challenge.challengeId,
        occurredAt: input.occurredAt,
        decision: valid ? "ALLOW" : "DENY",
        success: valid,
        justification: valid ? null : "AUTH_MFA_INVALID"
      });
      return valid;
    });
  }

  async readRecoveryCodeForLogin(challengeTokenHash: string, slot: number): Promise<Readonly<{
    challenge: LoginChallengeRecord;
    recoveryCodeId: string;
    codeHash: string;
    codeSlot: number;
  }> | null> {
    const challenge = await this.readLoginChallenge(challengeTokenHash);
    if (challenge === null) return null;
    const result = await this.pool.query<{
      recovery_code_id: string;
      code_hash: string;
      code_slot: number;
    }>(`
      SELECT recovery_code_id,code_hash,code_slot
      FROM identity.recovery_code
      WHERE user_id=$1 AND code_slot=$2 AND consumed_at IS NULL AND revoked_at IS NULL
    `, [challenge.userId, slot]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      challenge,
      recoveryCodeId: row.recovery_code_id,
      codeHash: row.code_hash,
      codeSlot: Number(row.code_slot)
    });
  }

  async completeRecoveryLogin(input: Readonly<{
    challenge: LoginChallengeRecord;
    recoveryCodeId: string;
    replacementHash: string;
    bindingHash: string;
    sessionId: string;
    sessionTokenHash: string;
    csrfTokenHash: string;
    sessionBindingContext: Readonly<Record<string, string>>;
    occurredAt: Date;
    idleExpiresAt: Date;
    absoluteExpiresAt: Date;
    source: AuthSourceContext;
  }>): Promise<boolean> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const user = (await client.query<{ audit_token: string; owner_ref: string }>(`
        SELECT audit_token,owner_ref FROM identity."user"
        WHERE user_id=$1 AND owner_ref=$2 AND state='active' AND password_hash=$3 FOR UPDATE
      `, [input.challenge.userId, input.challenge.ownerRef, input.challenge.passwordHash])).rows[0];
      const factor = user === undefined ? undefined : (await client.query<{ mfa_factor_id: string }>(`
        SELECT mfa_factor_id FROM identity.mfa_factor
        WHERE mfa_factor_id=$1 AND user_id=$2 AND factor_type='totp' AND state='active'
        FOR UPDATE
      `, [input.challenge.factorId, input.challenge.userId])).rows[0];
      const challenge = factor === undefined ? undefined : (await client.query<{
        consumed_at: Date | null; expires_at: Date; binding_hash: string; password_hash_snapshot: string;
      }>(`
        SELECT consumed_at,expires_at,binding_hash,password_hash_snapshot FROM identity.login_challenge
        WHERE login_challenge_id=$1 AND token_hash=$2 AND user_id=$3 FOR UPDATE
      `, [input.challenge.challengeId, input.challenge.challengeTokenHash, input.challenge.userId])).rows[0];
      const code = challenge === undefined ? undefined : (await client.query<{ code_slot: number }>(`
        SELECT code_slot FROM identity.recovery_code
        WHERE recovery_code_id=$1 AND user_id=$2 AND consumed_at IS NULL AND revoked_at IS NULL
        FOR UPDATE
      `, [input.recoveryCodeId, input.challenge.userId])).rows[0];
      const valid = user !== undefined && factor !== undefined && challenge !== undefined && code !== undefined
        && challenge.consumed_at === null
        && challenge.expires_at.getTime() > input.occurredAt.getTime()
        && challenge.binding_hash === input.bindingHash
        && challenge.password_hash_snapshot === input.challenge.passwordHash;
      if (valid) {
        await client.query(`UPDATE identity.recovery_code SET consumed_at=$2 WHERE recovery_code_id=$1`, [
          input.recoveryCodeId, input.occurredAt
        ]);
        await client.query(`
          INSERT INTO identity.recovery_code (
            user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
          ) VALUES ($1,$2,$3,$4,NULL,NULL)
        `, [input.challenge.userId, code.code_slot, input.replacementHash, input.occurredAt]);
        await client.query(`UPDATE identity.login_challenge SET consumed_at=$2 WHERE login_challenge_id=$1`, [
          input.challenge.challengeId, input.occurredAt
        ]);
        await client.query(`
          INSERT INTO identity.session (
            session_id,user_id,token_hash,csrf_token_hash,binding_context,
            created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
          ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$6,$7,$8,$6,NULL)
        `, [
          input.sessionId, input.challenge.userId, input.sessionTokenHash, input.csrfTokenHash,
          JSON.stringify(input.sessionBindingContext), input.occurredAt,
          input.idleExpiresAt, input.absoluteExpiresAt
        ]);
      }
      await this.appendAudit(client, prepared, {
        actorToken: user?.audit_token ?? randomUUID(),
        eventType: valid ? "identity.session.created" : "identity.login.failed",
        targetType: valid ? "identity.session" : "identity.login_attempt",
        targetId: valid ? input.sessionId : input.challenge.challengeId,
        occurredAt: input.occurredAt,
        decision: valid ? "ALLOW" : "DENY",
        success: valid,
        justification: valid ? "MFA_RECOVERY_CODE" : "AUTH_MFA_INVALID"
      });
      return valid;
    });
  }

  async authenticateSession(input: Readonly<{
    tokenHash: string;
    bindingHash: string;
    occurredAt: Date;
    idleExpiresAt: Date;
  }>): Promise<SessionAuthenticationRecord | null> {
    assertCredentialHash(input.tokenHash);
    assertCredentialHash(input.bindingHash);
    // MATERIALIZED forces the active parent lock to complete before the child
    // UPDATE. The UPDATE predicate is the sole authorization/refresh decision.
    const result = await this.pool.query<{
      session_id: string; user_id: string; owner_ref: string; csrf_token_hash: string;
      created_at: Date; last_seen_at: Date; idle_expires_at: Date;
      absolute_expires_at: Date; last_mfa_at: Date;
    }>(`
      WITH located AS MATERIALIZED (
        SELECT user_id FROM identity.session WHERE token_hash=$1
      ), locked_user AS MATERIALIZED (
        SELECT u.user_id,u.owner_ref FROM identity."user" u
        JOIN located ON located.user_id=u.user_id
        WHERE u.state='active' FOR UPDATE
      ), refreshed AS (
        UPDATE identity.session s
        SET last_seen_at=$3,idle_expires_at=LEAST(s.absolute_expires_at,$4)
        FROM locked_user u
        WHERE s.user_id=u.user_id AND s.token_hash=$1
          AND s.revoked_at IS NULL AND s.csrf_token_hash IS NOT NULL
          AND s.idle_expires_at>$3 AND s.absolute_expires_at>$3
          AND s.binding_context->>'user_agent_hash'=$2
        RETURNING s.session_id,s.user_id,s.csrf_token_hash,s.created_at,
          s.last_seen_at,s.idle_expires_at,s.absolute_expires_at,s.last_mfa_at
      ) SELECT refreshed.*,locked_user.owner_ref
        FROM refreshed JOIN locked_user USING (user_id)
    `, [input.tokenHash, input.bindingHash, input.occurredAt, input.idleExpiresAt]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      sessionId: row.session_id,
      userId: row.user_id,
      ownerRef: row.owner_ref,
      csrfTokenHash: row.csrf_token_hash,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
      lastMfaAt: row.last_mfa_at
    });
  }

  async listActiveSessions(userId: string, occurredAt: Date): Promise<readonly SessionListRecord[]> {
    const result = await this.pool.query<{
      session_id: string; created_at: Date; last_seen_at: Date;
      idle_expires_at: Date; absolute_expires_at: Date; last_mfa_at: Date;
    }>(`
      SELECT session_id,created_at,last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at
      FROM identity.session
      WHERE user_id=$1 AND revoked_at IS NULL AND idle_expires_at>$2 AND absolute_expires_at>$2
      ORDER BY last_seen_at DESC,session_id
    `, [userId, occurredAt]);
    return Object.freeze(result.rows.map((row) => Object.freeze({
      sessionId: row.session_id,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
      lastMfaAt: row.last_mfa_at
    })));
  }

  async revokeSession(input: Readonly<{
    userId: string;
    sessionId: string;
    occurredAt: Date;
    source: AuthSourceContext;
  }>): Promise<boolean> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const user = (await client.query<{ audit_token: string }>(`
        SELECT audit_token FROM identity."user" WHERE user_id=$1 FOR UPDATE
      `, [input.userId])).rows[0];
      const target = user === undefined ? undefined : (await client.query<{ owned: boolean }>(`
        WITH revoked AS (
          UPDATE identity.session SET revoked_at=COALESCE(revoked_at,$3)
          WHERE session_id=$1 AND user_id=$2 RETURNING true AS owned
        ) SELECT owned FROM revoked
        UNION ALL
        SELECT true FROM identity.session
        WHERE session_id=$1 AND user_id=$2 AND NOT EXISTS (SELECT 1 FROM revoked)
        LIMIT 1
      `, [input.sessionId, input.userId, input.occurredAt])).rows[0];
      const owned = user !== undefined && target?.owned === true;
      await this.appendAudit(client, prepared, {
        actorToken: user?.audit_token ?? randomUUID(),
        eventType: "identity.session.revoked",
        targetType: "identity.session",
        targetId: input.sessionId,
        occurredAt: input.occurredAt,
        decision: owned ? "ALLOW" : "DENY",
        success: owned,
        justification: owned ? null : "SESSION_NOT_FOUND"
      });
      return owned;
    });
  }

  async revokeAllSessions(input: Readonly<{
    userId: string;
    initiatingSessionId: string;
    occurredAt: Date;
    source: AuthSourceContext;
  }>): Promise<number> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const user = (await client.query<{ audit_token: string }>(`
        SELECT audit_token FROM identity."user" WHERE user_id=$1 FOR UPDATE
      `, [input.userId])).rows[0];
      const revoked = user === undefined ? { rowCount: 0 } : await client.query(`
        UPDATE identity.session SET revoked_at=$2
        WHERE user_id=$1 AND revoked_at IS NULL
      `, [input.userId, input.occurredAt]);
      await this.appendAudit(client, prepared, {
        actorToken: user?.audit_token ?? randomUUID(),
        eventType: "identity.session.revoked_all",
        targetType: "identity.user_sessions",
        // Audit correlation names the public session generation that requested
        // the operation. The private user UUID must remain erasable with the
        // identity row and therefore must never become immutable audit data.
        targetId: input.initiatingSessionId,
        occurredAt: input.occurredAt,
        decision: user === undefined ? "DENY" : "ALLOW",
        success: user !== undefined,
        justification: user === undefined ? "SESSION_NOT_FOUND" : `revoked_count:${revoked.rowCount ?? 0}`
      });
      return revoked.rowCount ?? 0;
    });
  }

  async readStepUpIdentity(userId: string): Promise<LoginIdentityRecord | null> {
    const result = await this.pool.query<{
      user_id: string; owner_ref: string; audit_token: string; password_hash: string;
      mfa_factor_id: string; secret_ciphertext: CryptoEnvelope; last_accepted_step: string | number | null;
    }>(`
      SELECT u.user_id,u.owner_ref,u.audit_token,u.password_hash,f.mfa_factor_id,
        f.secret_ciphertext,f.last_accepted_step
      FROM identity."user" u
      JOIN LATERAL (
        SELECT mfa_factor_id,secret_ciphertext,last_accepted_step
        FROM identity.mfa_factor
        WHERE user_id=u.user_id AND factor_type='totp' AND state='active'
        ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1
      ) f ON true
      WHERE u.user_id=$1 AND u.state='active'
    `, [userId]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      userId: row.user_id, ownerRef: row.owner_ref,
      auditToken: row.audit_token, passwordHash: row.password_hash,
      factorId: row.mfa_factor_id, secretCiphertext: row.secret_ciphertext,
      lastAcceptedStep: row.last_accepted_step === null ? null : Number(row.last_accepted_step)
    });
  }

  async rotateAfterStepUp(input: Readonly<{
    identity: LoginIdentityRecord;
    currentSessionId: string;
    currentTokenHash: string;
    acceptedStep: number;
    replacementTokenHash: string;
    replacementCsrfHash: string;
    bindingContext: Readonly<Record<string, string>>;
    occurredAt: Date;
    idleExpiresAt: Date;
    source: AuthSourceContext;
    grant?: Readonly<{
      grantId: string;
      grantTokenHash: string;
      action: "PUBLISH" | "UNPUBLISH";
      targetRunId: string;
      expiresAt: Date;
    }>;
  }>): Promise<boolean> {
    if (input.grant !== undefined) assertCredentialHash(input.grant.grantTokenHash);
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const rotated = await client.query<{ actor_token: string | null }>(`
        SELECT identity.rotate_session_after_step_up(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16
        ) AS actor_token
      `, [
        input.identity.userId,
        input.identity.ownerRef,
        input.identity.passwordHash,
        input.identity.factorId,
        input.acceptedStep,
        input.currentSessionId,
        input.currentTokenHash,
        input.replacementTokenHash,
        input.replacementCsrfHash,
        JSON.stringify(input.bindingContext),
        input.idleExpiresAt,
        input.grant?.grantId ?? null,
        input.grant?.grantTokenHash ?? null,
        input.grant?.action ?? null,
        input.grant?.targetRunId ?? null,
        input.grant?.expiresAt ?? null
      ]);
      const actorToken = rotated.rows[0]?.actor_token ?? null;
      const valid = actorToken !== null;
      await this.appendAudit(client, prepared, {
        actorToken: actorToken ?? randomUUID(),
        eventType: "identity.session.step_up",
        targetType: "identity.session",
        targetId: input.currentSessionId,
        occurredAt: input.occurredAt,
        decision: valid ? "ALLOW" : "DENY",
        success: valid,
        justification: valid ? null : "AUTH_MFA_INVALID"
      });
      return valid;
    });
  }
}
