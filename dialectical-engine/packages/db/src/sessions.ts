import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
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

function versionedAuditDigest(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError("AUDIT_CONTEXT_DIGEST_INVALID");
  return `argon2id-audit:v1:${value}`;
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
    const ipArgon2id = versionedAuditDigest(await this.auditContext.hashSourceIp(ip));
    const userAgentArgon2id = versionedAuditDigest(await this.auditContext.hashUserAgent(userAgent));
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
      await client.query("SELECT identity.begin_runtime_audit_attempt()");
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
    const source = JSON.stringify({ ipArgon2id: prepared.ipArgon2id,
      userAgentArgon2id: prepared.userAgentArgon2id });
    if (input.eventType === "identity.login.failed" && input.decision === "DENY"
      && !input.success && input.justification !== null) {
      await client.query("SELECT identity.audit_login_failed($1,$2::jsonb,$3)",
        [input.actorToken,source,input.justification]);
      return;
    }
    if (input.eventType === "identity.session.step_up" && input.decision === "DENY"
      && !input.success && input.justification !== null) {
      await client.query("SELECT identity.audit_session_step_up_denied($1,$2::jsonb,$3)",
        [input.actorToken,source,input.justification]);
      return;
    }
    throw new TypeError("AUDIT_OPERATION_CAPABILITY_REQUIRED");
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
      const result = await client.query<{ valid: boolean }>(`
        SELECT identity.create_login_challenge_with_audit(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb
        ) AS valid
      `, [input.identity.userId,input.identity.ownerRef,input.identity.passwordHash,
        input.identity.factorId,input.challengeId,input.challengeTokenHash,input.bindingHash,
        input.occurredAt,input.expiresAt,JSON.stringify({
          ipArgon2id: prepared.ipArgon2id,userAgentArgon2id: prepared.userAgentArgon2id
        })]);
      return result.rows[0]?.valid === true;
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
      const result = await client.query<{ valid: boolean }>(`
        SELECT identity.complete_totp_login_with_audit(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16::jsonb
        ) AS valid
      `, [input.challenge.userId,input.challenge.ownerRef,input.challenge.passwordHash,
        input.challenge.factorId,input.challenge.challengeId,input.challenge.challengeTokenHash,
        input.bindingHash,input.acceptedStep,input.sessionId,input.sessionTokenHash,
        input.csrfTokenHash,JSON.stringify(input.sessionBindingContext),input.occurredAt,
        input.idleExpiresAt,input.absoluteExpiresAt,JSON.stringify({
          ipArgon2id: prepared.ipArgon2id,userAgentArgon2id: prepared.userAgentArgon2id
        })]);
      return result.rows[0]?.valid === true;
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
      const result = await client.query<{ valid: boolean }>(`
        SELECT identity.complete_recovery_login_with_audit(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17::jsonb
        ) AS valid
      `, [input.challenge.userId,input.challenge.ownerRef,input.challenge.passwordHash,
        input.challenge.factorId,input.challenge.challengeId,input.challenge.challengeTokenHash,
        input.bindingHash,input.recoveryCodeId,input.replacementHash,input.sessionId,
        input.sessionTokenHash,input.csrfTokenHash,JSON.stringify(input.sessionBindingContext),
        input.occurredAt,input.idleExpiresAt,input.absoluteExpiresAt,JSON.stringify({
          ipArgon2id: prepared.ipArgon2id,userAgentArgon2id: prepared.userAgentArgon2id
        })]);
      return result.rows[0]?.valid === true;
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
    const result = await this.pool.query<{
      session_id: string; user_id: string; owner_ref: string; csrf_token_hash: string;
      created_at: Date; last_seen_at: Date; idle_expires_at: Date;
      absolute_expires_at: Date; last_mfa_at: Date;
    }>("SELECT * FROM identity.authenticate_session_t9($1,$2,$3,$4)", [
      input.tokenHash,input.bindingHash,input.occurredAt,input.idleExpiresAt
    ]);
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

  async authenticateAccountErasureStatusSession(input: Readonly<{
    tokenHash: string;
    bindingHash: string;
    occurredAt: Date;
  }>): Promise<SessionAuthenticationRecord | null> {
    assertCredentialHash(input.tokenHash);
    assertCredentialHash(input.bindingHash);
    const result=await this.pool.query<{
      session_id:string;user_id:string;owner_ref:string;csrf_token_hash:string;
      created_at:Date;last_seen_at:Date;idle_expires_at:Date;
      absolute_expires_at:Date;last_mfa_at:Date;
    }>(
      "SELECT * FROM identity.authenticate_account_erasure_status_session($1,$2,$3)",
      [input.tokenHash,input.bindingHash,input.occurredAt]
    );
    const row=result.rows[0];
    return row===undefined ? null : Object.freeze({
      sessionId:row.session_id,userId:row.user_id,ownerRef:row.owner_ref,
      csrfTokenHash:row.csrf_token_hash,createdAt:row.created_at,
      lastSeenAt:row.last_seen_at,idleExpiresAt:row.idle_expires_at,
      absoluteExpiresAt:row.absolute_expires_at,lastMfaAt:row.last_mfa_at
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
      const result = await client.query<{ valid: boolean }>(`
        SELECT identity.revoke_session_with_audit($1,$2,$3,$4::jsonb) AS valid
      `, [input.userId,input.sessionId,input.occurredAt,JSON.stringify({
        ipArgon2id: prepared.ipArgon2id,userAgentArgon2id: prepared.userAgentArgon2id
      })]);
      return result.rows[0]?.valid === true;
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
      const result = await client.query<{ count: number }>(`
        SELECT identity.revoke_all_sessions_with_audit($1,$2,$3,$4::jsonb) AS count
      `, [input.userId,input.initiatingSessionId,input.occurredAt,JSON.stringify({
        ipArgon2id: prepared.ipArgon2id,userAgentArgon2id: prepared.userAgentArgon2id
      })]);
      return Number(result.rows[0]?.count ?? 0);
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
      action: "PUBLISH" | "UNPUBLISH" | "DELETE_PRIVATE_DEBATE";
      targetRunId: string;
      expiresAt: Date;
    }> | Readonly<{
      grantId: string;
      grantTokenHash: string;
      action: "DELETE_ACCOUNT";
      expiresAt: Date;
    }>;
  }>): Promise<boolean> {
    if (input.grant !== undefined) assertCredentialHash(input.grant.grantTokenHash);
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const rotated = await client.query<{ valid: boolean }>(`
        SELECT identity.rotate_session_after_step_up_with_audit(
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13,$14,$15,$16,$17::jsonb
        ) AS valid
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
        input.grant !== undefined && input.grant.action !== "DELETE_ACCOUNT"
          ? input.grant.targetRunId : null,
        input.grant?.expiresAt ?? null,
        JSON.stringify({ ipArgon2id: prepared.ipArgon2id,
          userAgentArgon2id: prepared.userAgentArgon2id })
      ]);
      return rotated.rows[0]?.valid === true;
    });
  }
}
