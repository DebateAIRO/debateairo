import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  type AuditContextHasher,
  type CryptoEnvelope
} from "@debateai/crypto";

export interface AuthSourceContext {
  readonly ip: string;
  readonly userAgent: string;
  readonly requestId: string;
}

export interface PendingAccountInput {
  readonly userId: string;
  readonly emailBlindIndex: Buffer;
  readonly emailCiphertext: CryptoEnvelope;
  readonly recoveryEmailCiphertext: CryptoEnvelope;
  readonly passwordHash: string;
  readonly pseudonym: string;
  readonly adultAffirmedAt: Date;
  readonly verificationTokenHash: string;
  readonly verificationExpiresAt: Date;
  readonly occurredAt: Date;
  readonly source: AuthSourceContext;
}

export type PendingAccountResult =
  | Readonly<{ status: "created"; userId: string; channelBindingId: string }>
  | Readonly<{ status: "email_duplicate"; userId: string }>
  | Readonly<{ status: "pseudonym_collision" }>;

export type ResendPreparation =
  | Readonly<{ status: "send"; userId: string; auditToken: string; channelBindingId: string }>
  | Readonly<{ status: "ignored" }>;

export interface TotpEnrollmentRecord {
  readonly userId: string;
  readonly pseudonym: string;
  readonly factorId: string;
  readonly secretCiphertext: CryptoEnvelope;
  readonly lastAcceptedStep: number | null;
  readonly factorState: "pending" | "verified_pending_recovery" | "recovery_pending";
}

export interface RecoveryCodeRecord {
  readonly userId: string;
  readonly recoveryCodeId: string;
  readonly codeHash: string;
  readonly codeSlot: number;
}

// Deliberately carries no raw source context: by the time an AuditWrite exists
// the IP and user agent have already been reduced to prepared Argon2 digests,
// so raw values cannot reach the transactional append path at all.
interface AuditWrite {
  readonly actorToken: string;
  readonly eventType: string;
  readonly targetType: string;
  readonly subjectId: string | null;
  readonly occurredAt: Date;
  readonly decision: "ALLOW" | "DENY";
  readonly success: boolean;
  readonly justification: string | null;
}

function assertOpaqueToken(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError("AUDIT_TOKEN_MUST_BE_RANDOM_UUID_V4");
  }
}

function normalizeAuditContextValue(value: unknown, maximumLength: number): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return (trimmed === "" ? "unknown" : trimmed).slice(0, maximumLength);
}

function normalizeAuditSourceContext(source: AuthSourceContext): AuthSourceContext {
  return Object.freeze({
    ip: normalizeAuditContextValue(source?.ip, 64),
    userAgent: normalizeAuditContextValue(source?.userAgent, 256),
    requestId: normalizeAuditContextValue(source?.requestId, 128)
  });
}

/**
 * The two audit KDF digests, derived off-thread BEFORE any connection is taken.
 * `appendAudit` accepts only prepared digests, so no Argon2 work can begin
 * after `pool.connect()`, `BEGIN`, a row lock, or the audit-chain advisory lock.
 */
export interface PreparedAuditContext {
  readonly ipArgon2id: string;
  readonly userAgentArgon2id: string;
}

function versionedAuditDigest(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError("AUDIT_CONTEXT_DIGEST_INVALID");
  return `argon2id-audit:v1:${value}`;
}

export class PostgresIdentityRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auditContext: AuditContextHasher
  ) {}

  /**
   * Normalizes the source and derives both audit digests through the worker
   * pool. Callers MUST await this before entering `transaction`, so a KDF
   * failure surfaces before any durable identity mutation and no memory-hard
   * work is ever performed while holding a connection or a lock.
   */
  private async prepareAuditContext(source: AuthSourceContext): Promise<PreparedAuditContext> {
    const normalized = normalizeAuditSourceContext(source);
    const ipArgon2id = versionedAuditDigest(await this.auditContext.hashSourceIp(normalized.ip));
    const userAgentArgon2id = versionedAuditDigest(
      await this.auditContext.hashUserAgent(normalized.userAgent)
    );
    return Object.freeze({ ipArgon2id, userAgentArgon2id });
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

  private async appendAudit(
    client: PoolClient,
    prepared: PreparedAuditContext,
    event: AuditWrite
  ): Promise<void> {
    assertOpaqueToken(event.actorToken);
    const { ipArgon2id, userAgentArgon2id } = prepared;
    const source = JSON.stringify({ ipArgon2id,userAgentArgon2id });
    if (event.eventType === "identity.verification.delivery_record_failed"
      && event.decision === "DENY" && !event.success
      && event.justification === "MAIL_RECORD_FAILED") {
      await client.query("SELECT identity.audit_verification_record_failed($1,$2::jsonb)",
        [event.actorToken,source]);
      return;
    }
    if (event.eventType === "identity.registration.duplicate_postwork"
      && event.decision === "DENY" && !event.success
      && event.justification === "REGISTRATION_ADDRESS_UNAVAILABLE") {
      await client.query("SELECT identity.audit_registration_duplicate_postwork($1,$2::jsonb)",
        [event.actorToken,source]);
      return;
    }
    if (event.eventType === "identity.auth.rate_limit_refused"
      && event.decision === "DENY" && !event.success && event.justification !== null) {
      await client.query("SELECT identity.audit_rate_limit_refused($1,$2::jsonb,$3)",
        [event.actorToken,source,event.justification]);
      return;
    }
    if (event.eventType === "identity.registration.failed"
      && event.decision === "DENY" && !event.success && event.justification === "PROVISION_FAILED") {
      await client.query("SELECT identity.audit_registration_failed($1,$2::jsonb)",
        [event.actorToken,source]);
      return;
    }
    throw new TypeError("AUDIT_OPERATION_CAPABILITY_REQUIRED");
  }

  async createPendingAccount(
    input: PendingAccountInput,
    beforeCommit: () => Promise<void>
  ): Promise<PendingAccountResult> {
    // Prepared once, before any connection: the new-account and duplicate
    // branches below consume the same digests, so both perform equivalent
    // audit KDF work and neither branch is distinguishable by timing.
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const created = await client.query<{
        status: "CREATED" | "EMAIL_DUPLICATE" | "PSEUDONYM_COLLISION";
        user_id: string | null;
        channel_binding_id: string | null;
      }>(`SELECT * FROM identity.create_pending_account_with_audit(
        $1,$2,$3::jsonb,$4::jsonb,$5,$6,$7,$8,$9,$10,$11::jsonb
      )`, [
        input.userId,
        input.emailBlindIndex,
        JSON.stringify(input.emailCiphertext),
        JSON.stringify(input.recoveryEmailCiphertext),
        input.passwordHash,
        input.pseudonym,
        input.adultAffirmedAt,
        input.occurredAt,
        input.verificationTokenHash,
        input.verificationExpiresAt,
        JSON.stringify({
          ipArgon2id: prepared.ipArgon2id,
          userAgentArgon2id: prepared.userAgentArgon2id
        })
      ]);
      const row = created.rows[0];
      if (row === undefined) throw new Error("ACCOUNT_CREATE_OUTCOME_MISSING");
      if (row.status === "PSEUDONYM_COLLISION") {
        return Object.freeze({ status: "pseudonym_collision" as const });
      }
      if (row.status === "EMAIL_DUPLICATE") {
        if (row.user_id === null) throw new Error("ACCOUNT_DUPLICATE_ID_MISSING");
        return Object.freeze({ status: "email_duplicate" as const, userId: row.user_id });
      }
      if (row.user_id === null || row.channel_binding_id === null) {
        throw new Error("ACCOUNT_CREATE_RECEIPT_INVALID");
      }
      await beforeCommit();
      return Object.freeze({
        status: "created" as const,
        userId: row.user_id,
        channelBindingId: row.channel_binding_id
      });
    });
  }

  async findAuditIdentityByBlindIndex(emailBlindIndex: Buffer): Promise<{
    readonly auditToken: string;
    readonly addressKey: string;
  } | null> {
    const result = await this.pool.query<{ audit_token: string; address_key: string }>(`
      SELECT audit_token,encode(email_blind_index,'hex') AS address_key
      FROM identity."user" WHERE email_blind_index=$1
    `, [emailBlindIndex]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      auditToken: row.audit_token,
      addressKey: row.address_key
    });
  }

  async findAuditIdentityByVerificationHash(tokenHash: string): Promise<{
    readonly auditToken: string;
    readonly addressKey: string;
  } | null> {
    const result = await this.pool.query<{ audit_token: string; address_key: string }>(`
      SELECT u.audit_token,encode(u.email_blind_index,'hex') AS address_key
      FROM identity.verification_token_credential token
      JOIN identity.channel_binding c ON c.channel_binding_id=token.channel_binding_id
      JOIN identity."user" u ON u.user_id=c.user_id
      WHERE token.token_hash=$1 AND c.channel_type='email'
    `, [tokenHash]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      auditToken: row.audit_token,
      addressKey: row.address_key
    });
  }

  async recordVerificationDelivery(input: {
    readonly userId: string;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
    readonly success: boolean;
    readonly errorCode: string | null;
  }): Promise<void> {
    const prepared = await this.prepareAuditContext(input.source);
    await this.transaction(async (client) => {
      await client.query(`SELECT identity.record_verification_delivery_with_audit(
        $1,$2,$3,$4,$5::jsonb
      )`, [
        input.userId,input.occurredAt,input.success,input.errorCode,
        JSON.stringify({
          ipArgon2id: prepared.ipArgon2id,
          userAgentArgon2id: prepared.userAgentArgon2id
        })
      ]);
    });
  }

  async recordVerificationDeliveryRecordFailure(input: {
    readonly userId: string;
    readonly correlationId: string;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
    readonly errorCode: "MAIL_RECORD_FAILED";
  }): Promise<void> {
    const prepared = await this.prepareAuditContext(input.source);
    await this.transaction(async (client) => {
      await client.query("SELECT identity.audit_verification_record_failed($1,$2::jsonb)", [
        input.userId,JSON.stringify({
          ipArgon2id: prepared.ipArgon2id,userAgentArgon2id: prepared.userAgentArgon2id
        })
      ]);
    });
  }

  async recordDuplicateRegistrationPostwork(input: {
    readonly userId: string;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<void> {
    const prepared = await this.prepareAuditContext(input.source);
    await this.transaction(async (client) => {
      await client.query("SELECT identity.audit_registration_duplicate_postwork($1,$2::jsonb)", [
        input.userId,JSON.stringify({
          ipArgon2id: prepared.ipArgon2id,userAgentArgon2id: prepared.userAgentArgon2id
        })
      ]);
    });
  }

  async consumeVerification(input: {
    readonly tokenHash: string;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<boolean> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const result = await client.query<{ valid: boolean }>(`
        SELECT identity.consume_verification_with_audit($1,$2,$3::jsonb) AS valid
      `, [
        input.tokenHash,input.occurredAt,JSON.stringify({
          ipArgon2id: prepared.ipArgon2id,
          userAgentArgon2id: prepared.userAgentArgon2id
        })
      ]);
      return result.rows[0]?.valid === true;
    });
  }

  async prepareVerificationResend(input: {
    readonly emailBlindIndex: Buffer;
    readonly tokenHash: string;
    readonly expiresAt: Date;
    readonly occurredAt: Date;
    readonly cooldownMs: number;
    readonly source: AuthSourceContext;
  }): Promise<ResendPreparation> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const result = await client.query<{
        status: "SEND" | "IGNORED";
        user_id: string | null;
        audit_token: string | null;
        channel_binding_id: string | null;
      }>(`SELECT * FROM identity.prepare_verification_resend_with_audit(
        $1,$2,$3,$4,$5,$6::jsonb
      )`, [
        input.emailBlindIndex,input.tokenHash,input.expiresAt,input.occurredAt,
        input.cooldownMs,JSON.stringify({
          ipArgon2id: prepared.ipArgon2id,
          userAgentArgon2id: prepared.userAgentArgon2id
        })
      ]);
      const row = result.rows[0];
      if (row?.status !== "SEND") return Object.freeze({ status: "ignored" as const });
      if (row.user_id === null || row.audit_token === null || row.channel_binding_id === null) {
        throw new Error("RESEND_RECEIPT_INVALID");
      }
      return Object.freeze({ status: "send" as const, userId: row.user_id,
        auditToken: row.audit_token, channelBindingId: row.channel_binding_id });
    });
  }

  async recordRateLimitRefusal(input: {
    readonly actorToken: string;
    readonly route: "register" | "verify" | "resend";
    readonly scope: "ip" | "address";
    readonly count: number;
    readonly ipCount: number;
    readonly addressCount: number;
    readonly occurredAt: Date;
    readonly aggregateWindowStartedAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<void> {
    if (!Number.isSafeInteger(input.count) || input.count < 1
      || !Number.isSafeInteger(input.ipCount) || input.ipCount < 0
      || !Number.isSafeInteger(input.addressCount) || input.addressCount < 0
      || input.ipCount + input.addressCount !== input.count) {
      throw new TypeError("RATE_LIMIT_REFUSAL_AGGREGATE_INVALID");
    }
    const prepared = await this.prepareAuditContext(input.source);
    await this.transaction((client) => this.appendAudit(client, prepared, {
      actorToken: input.actorToken,
      eventType: "identity.auth.rate_limit_refused",
      targetType: `auth.${input.route}`,
      subjectId: null,
      occurredAt: input.occurredAt,
      decision: "DENY",
      success: false,
      justification: `aggregate:route-window;route:${input.route};window:${input.aggregateWindowStartedAt.toISOString()}`
        + `;count:${input.count};ip_count:${input.ipCount};address_count:${input.addressCount}`
    }));
  }

  async recordRegistrationFailure(input: {
    readonly correlationId: string;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<void> {
    const prepared = await this.prepareAuditContext(input.source);
    await this.transaction((client) => this.appendAudit(client, prepared, {
      actorToken: input.correlationId,
      eventType: "identity.registration.failed",
      targetType: "identity.registration_attempt",
      subjectId: null,
      occurredAt: input.occurredAt,
      decision: "DENY",
      success: false,
      justification: "PROVISION_FAILED"
    }));
  }

  /**
   * Reuses the already-consumed email-verification credential as the bounded
   * MFA-enrolment capability. The plaintext token is never persisted; only
   * the S3 SHA-256 credential hash reaches this boundary.
   */
  async readMfaEnrollmentIdentity(enrollmentTokenHash: string): Promise<Readonly<{
    userId: string;
    pseudonym: string;
  }> | null> {
    const result = await this.pool.query<{ user_id: string; pseudonym: string }>(`
      SELECT u.user_id,u.pseudonym
      FROM identity.verification_token_credential credential
      JOIN identity.channel_binding binding
        ON binding.channel_binding_id=credential.channel_binding_id
      JOIN identity."user" u ON u.user_id=binding.user_id
      WHERE credential.token_hash=$1 AND credential.consumed_at IS NOT NULL
        AND binding.verification_token_hash=credential.token_hash
        AND credential.expires_at >= statement_timestamp()
        AND u.state='pending_mfa'
    `, [enrollmentTokenHash]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      userId: row.user_id,
      pseudonym: row.pseudonym
    });
  }

  async beginTotpEnrollment(input: {
    readonly enrollmentTokenHash: string;
    readonly factorId: string;
    readonly secretCiphertext: CryptoEnvelope;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<Readonly<{ userId: string; pseudonym: string; factorId: string }> | null> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const result = await client.query<{
        user_id: string; pseudonym: string; factor_id: string;
      }>(`SELECT * FROM identity.begin_totp_enrollment_with_audit(
        $1,$2,$3::jsonb,$4,$5::jsonb
      )`, [input.enrollmentTokenHash,input.factorId,JSON.stringify(input.secretCiphertext),
        input.occurredAt,JSON.stringify({ ipArgon2id: prepared.ipArgon2id,
          userAgentArgon2id: prepared.userAgentArgon2id })]);
      const row = result.rows[0];
      return row === undefined ? null : Object.freeze({
        userId: row.user_id,pseudonym: row.pseudonym,factorId: row.factor_id
      });
    });
  }

  async readTotpEnrollment(enrollmentTokenHash: string): Promise<TotpEnrollmentRecord | null> {
    const result = await this.pool.query<{
      user_id: string;
      pseudonym: string;
      mfa_factor_id: string;
      secret_ciphertext: CryptoEnvelope;
      last_accepted_step: string | number | null;
      factor_state: TotpEnrollmentRecord["factorState"];
    }>(`
      SELECT u.user_id,u.pseudonym,factor.mfa_factor_id,factor.secret_ciphertext,
        factor.last_accepted_step,factor.state AS factor_state
      FROM identity.verification_token_credential credential
      JOIN identity.channel_binding binding
        ON binding.channel_binding_id=credential.channel_binding_id
      JOIN identity."user" u ON u.user_id=binding.user_id
      JOIN LATERAL (
        SELECT mfa_factor_id,secret_ciphertext,last_accepted_step,state,created_at
        FROM identity.mfa_factor
        WHERE user_id=u.user_id AND factor_type='totp'
          AND state IN ('pending','verified_pending_recovery','recovery_pending')
        ORDER BY created_at DESC,mfa_factor_id DESC LIMIT 1
      ) factor ON true
      WHERE credential.token_hash=$1 AND credential.consumed_at IS NOT NULL
        AND binding.verification_token_hash=credential.token_hash
        AND credential.expires_at >= statement_timestamp()
        AND u.state='pending_mfa'
    `, [enrollmentTokenHash]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      userId: row.user_id,
      pseudonym: row.pseudonym,
      factorId: row.mfa_factor_id,
      secretCiphertext: row.secret_ciphertext,
      lastAcceptedStep: row.last_accepted_step === null ? null : Number(row.last_accepted_step),
      factorState: row.factor_state
    });
  }

  async confirmTotpEnrollment(input: {
    readonly enrollmentTokenHash: string;
    readonly factorId: string;
    readonly acceptedStep: number;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<"confirmed" | "replayed" | "invalid"> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const result = await client.query<{ outcome: "CONFIRMED" | "REPLAYED" | "INVALID" }>(`
        SELECT identity.confirm_totp_enrollment_with_audit(
          $1,$2,$3,$4,$5::jsonb
        ) AS outcome
      `, [input.enrollmentTokenHash,input.factorId,input.acceptedStep,input.occurredAt,
        JSON.stringify({ ipArgon2id: prepared.ipArgon2id,
          userAgentArgon2id: prepared.userAgentArgon2id })]);
      const outcome = result.rows[0]?.outcome;
      return outcome === "CONFIRMED" ? "confirmed" : outcome === "REPLAYED" ? "replayed" : "invalid";
    });
  }

  async recordMfaVerificationFailure(input: {
    readonly enrollmentTokenHash: string;
    readonly reason: "MFA_ENROLLMENT_INVALID" | "MFA_TOTP_INVALID"
      | "MFA_RECOVERY_CONFIRMATION_INVALID" | "MFA_RATE_LIMITED";
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<void> {
    const prepared = await this.prepareAuditContext(input.source);
    await this.transaction(async (client) => {
      await client.query(`SELECT identity.record_mfa_failure_with_audit(
        $1,$2,$3::jsonb
      )`, [input.enrollmentTokenHash,input.reason,JSON.stringify({
        ipArgon2id: prepared.ipArgon2id,userAgentArgon2id: prepared.userAgentArgon2id
      })]);
    });
  }

  async storeRecoveryCodes(input: {
    readonly enrollmentTokenHash: string;
    readonly factorId: string;
    readonly codes: readonly Readonly<{ slot: number; hash: string }>[];
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<boolean> {
    if (input.codes.length !== 10 || new Set(input.codes.map((code) => code.slot)).size !== 10
      || input.codes.some((code) => code.slot < 1 || code.slot > 10 || code.hash.trim() === "")) {
      throw new TypeError("MFA_RECOVERY_CODE_SET_INVALID");
    }
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const result = await client.query<{ valid: boolean }>(`
        SELECT identity.store_recovery_codes_with_audit(
          $1,$2,$3::jsonb,$4,$5::jsonb
        ) AS valid
      `, [input.enrollmentTokenHash,input.factorId,JSON.stringify(input.codes),
        input.occurredAt,JSON.stringify({ ipArgon2id: prepared.ipArgon2id,
          userAgentArgon2id: prepared.userAgentArgon2id })]);
      return result.rows[0]?.valid === true;
    });
  }

  async readRecoveryCodeForConfirmation(
    enrollmentTokenHash: string,
    slot: number
  ): Promise<RecoveryCodeRecord | null> {
    const result = await this.pool.query<{
      user_id: string;
      recovery_code_id: string;
      code_hash: string;
      code_slot: number;
    }>(`
      SELECT u.user_id,code.recovery_code_id,code.code_hash,code.code_slot
      FROM identity.verification_token_credential credential
      JOIN identity.channel_binding binding
        ON binding.channel_binding_id=credential.channel_binding_id
      JOIN identity."user" u ON u.user_id=binding.user_id
      JOIN identity.mfa_factor factor ON factor.user_id=u.user_id AND factor.factor_type='totp'
      JOIN identity.recovery_code code ON code.user_id=u.user_id
      WHERE credential.token_hash=$1 AND code.code_slot=$2
        AND binding.verification_token_hash=credential.token_hash
        AND credential.consumed_at IS NOT NULL
        AND credential.expires_at >= statement_timestamp()
        AND u.state='pending_mfa' AND factor.state='recovery_pending'
        AND code.consumed_at IS NULL AND code.revoked_at IS NULL
    `, [enrollmentTokenHash, slot]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      userId: row.user_id,
      recoveryCodeId: row.recovery_code_id,
      codeHash: row.code_hash,
      codeSlot: Number(row.code_slot)
    });
  }

  async activateMfaEnrollment(input: {
    readonly enrollmentTokenHash: string;
    readonly recoveryCodeId: string;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<boolean> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const result = await client.query<{ valid: boolean }>(`
        SELECT identity.activate_mfa_enrollment_with_audit(
          $1,$2,$3,$4::jsonb
        ) AS valid
      `, [input.enrollmentTokenHash,input.recoveryCodeId,input.occurredAt,
        JSON.stringify({ ipArgon2id: prepared.ipArgon2id,
          userAgentArgon2id: prepared.userAgentArgon2id })]);
      return result.rows[0]?.valid === true;
    });
  }

  async readRecoveryCodeForUse(userId: string, slot: number): Promise<RecoveryCodeRecord | null> {
    const result = await this.pool.query<{
      recovery_code_id: string;
      code_hash: string;
      code_slot: number;
    }>(`
      SELECT code.recovery_code_id,code.code_hash,code.code_slot
      FROM identity.recovery_code code
      JOIN identity."user" u ON u.user_id=code.user_id AND u.state='active'
      JOIN identity.mfa_factor factor
        ON factor.user_id=u.user_id AND factor.factor_type='totp' AND factor.state='active'
      WHERE code.user_id=$1 AND code.code_slot=$2
        AND code.consumed_at IS NULL AND code.revoked_at IS NULL
    `, [userId, slot]);
    const row = result.rows[0];
    return row === undefined ? null : Object.freeze({
      userId,
      recoveryCodeId: row.recovery_code_id,
      codeHash: row.code_hash,
      codeSlot: Number(row.code_slot)
    });
  }

  async consumeAndReplaceRecoveryCode(input: {
    readonly userId: string;
    readonly recoveryCodeId: string;
    readonly replacementHash: string;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<boolean> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      const result = await client.query<{ valid: boolean }>(`
        SELECT identity.consume_recovery_code_with_audit(
          $1,$2,$3,$4,$5::jsonb
        ) AS valid
      `, [input.userId,input.recoveryCodeId,input.replacementHash,input.occurredAt,
        JSON.stringify({ ipArgon2id: prepared.ipArgon2id,
          userAgentArgon2id: prepared.userAgentArgon2id })]);
      return result.rows[0]?.valid === true;
    });
  }
}
