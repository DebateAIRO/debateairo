import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  appendAuditEvent,
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
  readonly auditToken: string;
  readonly adultAffirmedAt: Date;
  readonly verificationTokenHash: string;
  readonly verificationExpiresAt: Date;
  readonly occurredAt: Date;
  readonly source: AuthSourceContext;
}

export type PendingAccountResult =
  | Readonly<{ status: "created"; userId: string; auditToken: string; channelBindingId: string }>
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

interface LockedMfaEnrollmentBearer {
  readonly channelBindingId: string;
  readonly userId: string;
  readonly auditToken: string;
  readonly pseudonym: string;
  readonly userState: string;
  readonly expiresAt: Date;
  readonly consumedAt: Date | null;
  readonly isBindingBearer: boolean;
}

// Deliberately carries no raw source context: by the time an AuditWrite exists
// the IP and user agent have already been reduced to prepared Argon2 digests,
// so raw values cannot reach the transactional append path at all.
interface AuditWrite {
  readonly actorToken: string;
  readonly eventType: string;
  readonly targetType: string;
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
    const ipArgon2id = await this.auditContext.hashSourceIp(normalized.ip);
    const userAgentArgon2id = await this.auditContext.hashUserAgent(normalized.userAgent);
    return Object.freeze({ ipArgon2id, userAgentArgon2id });
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

  /**
   * Locks every row used to authorize MFA enrolment in the same explicit
   * account-local order as email verification: channel -> user -> credential.
   * The initial credential lookup is only a locator. Authorization is derived
   * again from the locked rows, including exact equality with the one sibling
   * credential designated as the channel's MFA bearer.
   */
  private async lockMfaEnrollmentBearer(
    client: PoolClient,
    enrollmentTokenHash: string
  ): Promise<LockedMfaEnrollmentBearer | null> {
    const located = await client.query<{ channel_binding_id: string }>(`
      SELECT channel_binding_id
      FROM identity.verification_token_credential
      WHERE token_hash=$1
    `, [enrollmentTokenHash]);
    const channelBindingId = located.rows[0]?.channel_binding_id;
    if (channelBindingId === undefined) return null;

    const channel = (await client.query<{
      channel_binding_id: string;
      user_id: string;
      verification_token_hash: string | null;
    }>(`
      SELECT channel_binding_id,user_id,verification_token_hash
      FROM identity.channel_binding
      WHERE channel_binding_id=$1 AND channel_type='email'
      FOR UPDATE
    `, [channelBindingId])).rows[0];
    if (channel === undefined) return null;

    const user = (await client.query<{
      audit_token: string;
      pseudonym: string;
      state: string;
    }>(`
      SELECT audit_token,pseudonym,state
      FROM identity."user"
      WHERE user_id=$1
      FOR UPDATE
    `, [channel.user_id])).rows[0];
    if (user === undefined) return null;

    const credential = (await client.query<{
      expires_at: Date;
      consumed_at: Date | null;
    }>(`
      SELECT expires_at,consumed_at
      FROM identity.verification_token_credential
      WHERE token_hash=$1 AND channel_binding_id=$2
      FOR UPDATE
    `, [enrollmentTokenHash, channel.channel_binding_id])).rows[0];
    if (credential === undefined) return null;

    return Object.freeze({
      channelBindingId: channel.channel_binding_id,
      userId: channel.user_id,
      auditToken: user.audit_token,
      pseudonym: user.pseudonym,
      userState: user.state,
      expiresAt: credential.expires_at,
      consumedAt: credential.consumed_at,
      isBindingBearer: channel.verification_token_hash === enrollmentTokenHash
    });
  }

  private async appendAudit(
    client: PoolClient,
    prepared: PreparedAuditContext,
    event: AuditWrite
  ): Promise<void> {
    assertOpaqueToken(event.actorToken);
    const { ipArgon2id, userAgentArgon2id } = prepared;
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('identity:audit-chain', 0))");
    const head = await client.query<{ this_hash: Buffer }>(`
      SELECT parent.this_hash
      FROM identity.audit_event parent
      LEFT JOIN identity.audit_event child ON child.prev_hash=parent.this_hash
      WHERE child.audit_id IS NULL
      ORDER BY parent.occurred_at DESC,parent.audit_id DESC
      LIMIT 1
    `);
    const previous = head.rows[0]?.this_hash.toString("hex") ?? null;
    const payload = Object.freeze({
      auditId: randomUUID(),
      actorCiphertext: null,
      actorKeyRef: event.actorToken,
      eventType: event.eventType,
      targetType: event.targetType,
      targetId: event.actorToken,
      occurredAt: event.occurredAt,
      sourceContext: Object.freeze({
        ipArgon2id,
        userAgentArgon2id
      }),
      decision: event.decision,
      success: event.success,
      justification: event.justification
    });
    const chained = appendAuditEvent(previous, payload);
    await client.query(`
      INSERT INTO identity.audit_event (
        audit_id,prev_hash,this_hash,actor_ciphertext,actor_key_ref,event_type,
        target_type,target_id,occurred_at,source_context,decision,success,justification
      ) VALUES ($1,$2,$3,NULL,$4,$5,$6,$4,$7,$8::jsonb,$9,$10,$11)
    `, [
      chained.auditId,
      chained.prevHash === null ? null : Buffer.from(chained.prevHash, "hex"),
      Buffer.from(chained.thisHash, "hex"),
      chained.actorKeyRef,
      chained.eventType,
      chained.targetType,
      chained.occurredAt,
      JSON.stringify(chained.sourceContext),
      chained.decision,
      chained.success,
      chained.justification
    ]);
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
      const inserted = await client.query<{ user_id: string }>(`
        INSERT INTO identity."user" (
          user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,
          phone_ciphertext,password_hash,pseudonym,audit_token,state,adult_affirmed_at,created_at
        ) VALUES ($1,$2,$3::jsonb,$4::jsonb,NULL,$5,$6,$7,'pending_verification',$8,$9)
        ON CONFLICT DO NOTHING
        RETURNING user_id
      `, [
        input.userId,
        input.emailBlindIndex,
        JSON.stringify(input.emailCiphertext),
        JSON.stringify(input.recoveryEmailCiphertext),
        input.passwordHash,
        input.pseudonym,
        input.auditToken,
        input.adultAffirmedAt,
        input.occurredAt
      ]);
      if (inserted.rowCount === 0) {
        const duplicate = await client.query<{ user_id: string; audit_token: string }>(`
          SELECT user_id,audit_token FROM identity."user" WHERE email_blind_index=$1
        `, [input.emailBlindIndex]);
        const existing = duplicate.rows[0];
        if (existing === undefined) {
          return Object.freeze({ status: "pseudonym_collision" as const });
        }
        // Same three no-op updates, same predicates, same round-trip count and
        // row-version work as before, so the reviewed enumeration-equalization
        // shape is untouched. Only their order changes, from user-before-channels
        // to channels-before-user, so this branch can no longer hold the user row
        // while waiting for the email channel a concurrent resend already holds.
        await client.query(`
          UPDATE identity.channel_binding SET state=state
          WHERE user_id=$1 AND channel_type='email'
        `, [existing.user_id]);
        await client.query(`
          UPDATE identity.channel_binding SET state=state
          WHERE user_id=$1 AND channel_type='recovery_email'
        `, [existing.user_id]);
        await client.query(`
          UPDATE identity."user" SET state=state WHERE user_id=$1
        `, [existing.user_id]);
        await this.appendAudit(client, prepared, {
          actorToken: existing.audit_token,
          eventType: "identity.registration",
          targetType: "identity.user",
          occurredAt: input.occurredAt,
          decision: "DENY",
          success: false,
          justification: "REGISTRATION_ADDRESS_UNAVAILABLE"
        });
        return Object.freeze({ status: "email_duplicate" as const, userId: existing.user_id });
      }
      const emailChannel = await client.query<{ channel_binding_id: string }>(`
        INSERT INTO identity.channel_binding (
          user_id,channel_type,address_ciphertext,state,created_at,
          verification_token_hash,verification_expires_at,verification_last_sent_at,delivery_status
        ) VALUES ($1,'email',$2::jsonb,'pending_verification',$3,$4,$5,$3,'pending')
        RETURNING channel_binding_id
      `, [
        input.userId,
        JSON.stringify(input.emailCiphertext),
        input.occurredAt,
        input.verificationTokenHash,
        input.verificationExpiresAt
      ]);
      await client.query(`
        INSERT INTO identity.verification_token_credential (
          token_hash,channel_binding_id,issued_at,expires_at
        ) VALUES ($1,$2,$3,$4)
      `, [
        input.verificationTokenHash,
        emailChannel.rows[0]!.channel_binding_id,
        input.occurredAt,
        input.verificationExpiresAt
      ]);
      await client.query(`
        INSERT INTO identity.channel_binding (
          user_id,channel_type,address_ciphertext,state,created_at,delivery_status
        ) VALUES ($1,'recovery_email',$2::jsonb,'pending_verification',$3,'not_requested')
      `, [input.userId, JSON.stringify(input.recoveryEmailCiphertext), input.occurredAt]);
      await this.appendAudit(client, prepared, {
        actorToken: input.auditToken,
        eventType: "identity.registration",
        targetType: "identity.user",
        occurredAt: input.occurredAt,
        decision: "ALLOW",
        success: true,
        justification: null
      });
      await beforeCommit();
      return Object.freeze({
        status: "created" as const,
        userId: input.userId,
        auditToken: input.auditToken,
        channelBindingId: emailChannel.rows[0]!.channel_binding_id
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
      // Lock the channel binding and then the user in one statement, in the
      // same `c,u` order prepareVerificationResend uses. Locking the user first
      // and reaching the channel binding only through the UPDATE below inverted
      // the order against a concurrent resend preparation, and the resulting
      // 40P01 deadlock_detected surfaced on the request path as an untyped 500
      // that a missing address could never produce.
      const user = await client.query<{ audit_token: string }>(`
        SELECT u.audit_token
        FROM identity."user" u
        JOIN identity.channel_binding c ON c.user_id=u.user_id AND c.channel_type='email'
        WHERE u.user_id=$1
        FOR UPDATE OF c,u
      `, [input.userId]);
      if (user.rows[0] === undefined) throw new Error("IDENTITY_USER_NOT_FOUND");
      await client.query(`
        UPDATE identity.channel_binding
        SET verification_last_sent_at=$2,delivery_status=$3,delivery_error=$4
        WHERE user_id=$1 AND channel_type='email'
      `, [input.userId, input.occurredAt, input.success ? "sent" : "failed", input.errorCode]);
      await this.appendAudit(client, prepared, {
        actorToken: user.rows[0].audit_token,
        eventType: "identity.verification.sent",
        targetType: "identity.channel_binding",
        occurredAt: input.occurredAt,
        decision: "ALLOW",
        success: input.success,
        justification: input.errorCode
      });
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
      const user = await client.query<{ audit_token: string }>(`
        SELECT audit_token FROM identity."user" WHERE user_id=$1 FOR UPDATE
      `, [input.userId]);
      if (user.rows[0] === undefined) throw new Error("IDENTITY_USER_NOT_FOUND");
      await this.appendAudit(client, prepared, {
        actorToken: user.rows[0].audit_token,
        eventType: "identity.verification.delivery_record_failed",
        targetType: "identity.channel_binding",
        occurredAt: input.occurredAt,
        decision: "DENY",
        success: false,
        justification: `correlation:${input.correlationId};code:${input.errorCode}`
      });
    });
  }

  async recordDuplicateRegistrationPostwork(input: {
    readonly userId: string;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<void> {
    const prepared = await this.prepareAuditContext(input.source);
    await this.transaction(async (client) => {
      // Both original round trips are retained; only their order changes, so the
      // email channel is taken before the user and this path cannot invert
      // against a concurrent resend preparation.
      await client.query(`
        UPDATE identity.channel_binding SET state=state
        WHERE user_id=$1 AND channel_type='email'
      `, [input.userId]);
      const user = await client.query<{ audit_token: string }>(`
        SELECT audit_token FROM identity."user" WHERE user_id=$1 FOR UPDATE
      `, [input.userId]);
      if (user.rows[0] === undefined) throw new Error("IDENTITY_USER_NOT_FOUND");
      await this.appendAudit(client, prepared, {
        actorToken: user.rows[0].audit_token,
        eventType: "identity.registration.duplicate_postwork",
        targetType: "identity.channel_binding",
        occurredAt: input.occurredAt,
        decision: "DENY",
        success: false,
        justification: "REGISTRATION_ADDRESS_UNAVAILABLE"
      });
    });
  }

  async consumeVerification(input: {
    readonly tokenHash: string;
    readonly occurredAt: Date;
    readonly source: AuthSourceContext;
  }): Promise<boolean> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => {
      // Explicit sequential row locking in the account-local order
      // channel -> user -> credential. A multi-relation `FOR UPDATE OF` list is
      // not a portable acquisition-order contract, so each row is locked by its
      // own statement and every decision is re-derived from the locked rows.
      //
      // Step 1: locate the candidate credential's parent channel. This is only a
      // locator; it takes no row lock and is never authorization.
      const located = await client.query<{ channel_binding_id: string }>(`
        SELECT c.channel_binding_id
        FROM identity.verification_token_credential token
        JOIN identity.channel_binding c ON c.channel_binding_id=token.channel_binding_id
        WHERE token.token_hash=$1 AND c.channel_type='email'
      `, [input.tokenHash]);
      const locatedChannelBindingId = located.rows[0]?.channel_binding_id;
      // Step 2: lock that exact email channel row and read the authoritative
      // user_id back off the locked row.
      const channel = locatedChannelBindingId === undefined ? undefined : (
        await client.query<{ channel_binding_id: string; user_id: string }>(`
          SELECT channel_binding_id,user_id FROM identity.channel_binding
          WHERE channel_binding_id=$1 AND channel_type='email'
          FOR UPDATE
        `, [locatedChannelBindingId])
      ).rows[0];
      // Step 3: lock that exact user row and read its actor token and state.
      const user = channel === undefined ? undefined : (
        await client.query<{ audit_token: string; state: string }>(`
          SELECT audit_token,state FROM identity."user" WHERE user_id=$1 FOR UPDATE
        `, [channel.user_id])
      ).rows[0];
      // Step 4: only now lock and re-read the requested credential, restricted
      // to both the token hash and the locked channel binding.
      const credential = channel === undefined || user === undefined ? undefined : (
        await client.query<{ expires_at: Date; consumed_at: Date | null }>(`
          SELECT expires_at,consumed_at FROM identity.verification_token_credential
          WHERE token_hash=$1 AND channel_binding_id=$2
          FOR UPDATE
        `, [input.tokenHash, channel.channel_binding_id])
      ).rows[0];
      // Step 5: validity comes only from the locked, revalidated rows. Missing,
      // moved, pruned, consumed, expired, wrong-channel or non-pending is the
      // existing typed invalid-token outcome.
      const valid = channel !== undefined
        && user !== undefined
        && credential !== undefined
        && credential.consumed_at === null
        && credential.expires_at.getTime() >= input.occurredAt.getTime()
        && user.state === "pending_verification";
      const actorToken = user?.audit_token ?? randomUUID();
      if (channel !== undefined && valid) {
        await client.query(`
          UPDATE identity.verification_token_credential SET consumed_at=$2
          WHERE channel_binding_id=$1 AND consumed_at IS NULL
        `, [channel.channel_binding_id, input.occurredAt]);
        await client.query(`
          UPDATE identity.channel_binding
          SET state='verified',verified_at=$2,verification_consumed_at=$2,
            verification_token_hash=$3,verification_expires_at=$4,
            delivery_error=NULL
          WHERE channel_binding_id=$1
        `, [
          channel.channel_binding_id,
          input.occurredAt,
          input.tokenHash,
          credential!.expires_at
        ]);
        // Email possession opens the short-lived MFA enrolment capability; it
        // never makes the account usable. Only recovery-code confirmation in
        // S4 promotes pending_mfa to active.
        await client.query(`UPDATE identity."user" SET state='pending_mfa' WHERE user_id=$1`, [channel.user_id]);
      }
      await this.appendAudit(client, prepared, {
        actorToken,
        eventType: "identity.verification.consumed",
        targetType: "identity.channel_binding",
        occurredAt: input.occurredAt,
        decision: valid ? "ALLOW" : "DENY",
        success: valid,
        justification: valid ? null : "VERIFICATION_TOKEN_INVALID"
      });
      return valid;
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
      const found = await client.query<{
        channel_binding_id: string;
        user_id: string;
        audit_token: string;
        state: string;
        verification_last_sent_at: Date | null;
      }>(`
        SELECT c.channel_binding_id,c.user_id,u.audit_token,u.state,c.verification_last_sent_at
        FROM identity."user" u
        JOIN identity.channel_binding c ON c.user_id=u.user_id AND c.channel_type='email'
        WHERE u.email_blind_index=$1
        FOR UPDATE OF c,u
      `, [input.emailBlindIndex]);
      const row = found.rows[0];
      const cooling = row?.verification_last_sent_at !== null && row?.verification_last_sent_at !== undefined
        && input.occurredAt.getTime() - row.verification_last_sent_at.getTime() < input.cooldownMs;
      const send = row !== undefined && row.state === "pending_verification" && !cooling;
      const actorToken = row?.audit_token ?? randomUUID();
      if (send) {
        await client.query(`
          DELETE FROM identity.verification_token_credential
          WHERE channel_binding_id=$1 AND expires_at < $2
        `, [row.channel_binding_id, input.occurredAt]);
        await client.query(`
          INSERT INTO identity.verification_token_credential (
            token_hash,channel_binding_id,issued_at,expires_at
          ) VALUES ($1,$2,$3,$4)
        `, [input.tokenHash, row.channel_binding_id, input.occurredAt, input.expiresAt]);
        await client.query(`
          UPDATE identity.channel_binding
          SET verification_token_hash=$2,verification_expires_at=$3,
            verification_consumed_at=NULL,verification_last_sent_at=$4,
            delivery_status='pending',delivery_error=NULL
          WHERE channel_binding_id=$1
        `, [row.channel_binding_id, input.tokenHash, input.expiresAt, input.occurredAt]);
      }
      await this.appendAudit(client, prepared, {
        actorToken,
        eventType: "identity.verification.resend_requested",
        targetType: "identity.channel_binding",
        occurredAt: input.occurredAt,
        decision: send ? "ALLOW" : "DENY",
        success: send,
        justification: send ? null : cooling ? "RESEND_COOLDOWN" : "RESEND_NOT_APPLICABLE"
      });
      return send ? Object.freeze({
        status: "send" as const,
        userId: row.user_id,
        auditToken: row.audit_token,
        channelBindingId: row.channel_binding_id
      }) : Object.freeze({ status: "ignored" as const });
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
      const row = await this.lockMfaEnrollmentBearer(client, input.enrollmentTokenHash);
      const valid = row !== undefined
        && row !== null
        && row.isBindingBearer
        && row.consumedAt !== null
        && row.expiresAt.getTime() >= input.occurredAt.getTime()
        && row.userState === "pending_mfa";
      const actorToken = row?.isBindingBearer === true ? row.auditToken : randomUUID();
      if (!valid) {
        await this.appendAudit(client, prepared, {
          actorToken,
          eventType: "identity.mfa.totp.begin",
          targetType: "identity.mfa_factor",
          occurredAt: input.occurredAt,
          decision: "DENY",
          success: false,
          justification: "MFA_ENROLLMENT_CREDENTIAL_INVALID"
        });
        return null;
      }
      const currentFactor = await client.query<{ state: string }>(`
        SELECT state
        FROM identity.mfa_factor
        WHERE user_id=$1 AND factor_type='totp'
        ORDER BY created_at DESC,mfa_factor_id DESC
        LIMIT 1
        FOR UPDATE
      `, [row!.userId]);
      if (currentFactor.rows[0] !== undefined && currentFactor.rows[0].state !== "pending") {
        await this.appendAudit(client, prepared, {
          actorToken,
          eventType: "identity.mfa.totp.begin",
          targetType: "identity.mfa_factor",
          occurredAt: input.occurredAt,
          decision: "DENY",
          success: false,
          justification: "MFA_ENROLLMENT_STATE_INVALID"
        });
        return null;
      }
      // A begin retry never re-displays an earlier seed. It atomically removes
      // only an unverified TOTP factor and creates a fresh envelope. After a
      // successful TOTP proof, recovery-code state cannot be orphaned by begin.
      await client.query(`
        DELETE FROM identity.mfa_factor
        WHERE user_id=$1 AND factor_type='totp' AND state='pending'
      `, [row!.userId]);
      const inserted = await client.query<{ mfa_factor_id: string }>(`
        INSERT INTO identity.mfa_factor (
          mfa_factor_id,user_id,factor_type,secret_ciphertext,credential_id,public_key,
          state,created_at,verified_at,revoked_at,last_accepted_step
        ) VALUES ($1,$2,'totp',$3::jsonb,NULL,NULL,'pending',$4,NULL,NULL,NULL)
        RETURNING mfa_factor_id
      `, [input.factorId, row!.userId, JSON.stringify(input.secretCiphertext), input.occurredAt]);
      await this.appendAudit(client, prepared, {
        actorToken,
        eventType: "identity.mfa.totp.begin",
        targetType: "identity.mfa_factor",
        occurredAt: input.occurredAt,
        decision: "ALLOW",
        success: true,
        justification: null
      });
      return Object.freeze({
        userId: row!.userId,
        pseudonym: row!.pseudonym,
        factorId: inserted.rows[0]!.mfa_factor_id
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
      const bearer = await this.lockMfaEnrollmentBearer(client, input.enrollmentTokenHash);
      const lockedFactor = bearer === null ? undefined : (await client.query<{
        factor_state: string;
        last_accepted_step: string | number | null;
      }>(`
        SELECT state AS factor_state,last_accepted_step
        FROM identity.mfa_factor
        WHERE mfa_factor_id=$1 AND user_id=$2 AND factor_type='totp'
        FOR UPDATE
      `, [input.factorId, bearer.userId])).rows[0];
      const current = lockedFactor?.last_accepted_step === null
        || lockedFactor?.last_accepted_step === undefined
        ? null : Number(lockedFactor.last_accepted_step);
      const eligible = bearer !== null && bearer.isBindingBearer
        && bearer.userState === "pending_mfa"
        && lockedFactor?.factor_state === "pending" && bearer.consumedAt !== null
        && bearer.expiresAt.getTime() >= input.occurredAt.getTime();
      const replayed = eligible && current !== null && input.acceptedStep <= current;
      const confirmed = eligible && !replayed;
      const actorToken = bearer?.isBindingBearer === true ? bearer.auditToken : randomUUID();
      if (confirmed) {
        await client.query(`
          UPDATE identity.mfa_factor
          SET state='verified_pending_recovery',verified_at=$2,last_accepted_step=$3
          WHERE mfa_factor_id=$1
        `, [input.factorId, input.occurredAt, input.acceptedStep]);
      }
      await this.appendAudit(client, prepared, {
        actorToken,
        eventType: "identity.mfa.totp.verified",
        targetType: "identity.mfa_factor",
        occurredAt: input.occurredAt,
        decision: confirmed ? "ALLOW" : "DENY",
        success: confirmed,
        justification: confirmed ? null : replayed ? "MFA_TOTP_REPLAYED" : "MFA_ENROLLMENT_INVALID"
      });
      return confirmed ? "confirmed" : replayed ? "replayed" : "invalid";
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
      const bearer = await this.lockMfaEnrollmentBearer(client, input.enrollmentTokenHash);
      await this.appendAudit(client, prepared, {
        actorToken: bearer?.isBindingBearer === true ? bearer.auditToken : randomUUID(),
        eventType: "identity.mfa.verification_failed",
        targetType: "identity.mfa_factor",
        occurredAt: input.occurredAt,
        decision: "DENY",
        success: false,
        justification: input.reason
      });
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
      const bearer = await this.lockMfaEnrollmentBearer(client, input.enrollmentTokenHash);
      const lockedFactor = bearer === null ? undefined : (await client.query<{
        factor_state: string;
      }>(`
        SELECT state AS factor_state
        FROM identity.mfa_factor
        WHERE mfa_factor_id=$1 AND user_id=$2 AND factor_type='totp'
        FOR UPDATE
      `, [input.factorId, bearer.userId])).rows[0];
      const valid = bearer !== null && bearer.isBindingBearer
        && bearer.userState === "pending_mfa"
        && (lockedFactor?.factor_state === "verified_pending_recovery"
          || lockedFactor?.factor_state === "recovery_pending")
        && bearer.consumedAt !== null
        && bearer.expiresAt.getTime() >= input.occurredAt.getTime();
      const actorToken = bearer?.isBindingBearer === true ? bearer.auditToken : randomUUID();
      if (valid) {
        // A response can be lost before the user records its one-time
        // plaintext. Regeneration is recoverable without redisplay: revoke
        // the unseen set and insert a wholly fresh set in this transaction.
        await client.query(`
          UPDATE identity.recovery_code SET revoked_at=$2
          WHERE user_id=$1 AND consumed_at IS NULL AND revoked_at IS NULL
        `, [bearer.userId, input.occurredAt]);
        for (const code of input.codes) {
          await client.query(`
            INSERT INTO identity.recovery_code (
              user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
            ) VALUES ($1,$2,$3,$4,NULL,NULL)
          `, [bearer.userId, code.slot, code.hash, input.occurredAt]);
        }
        await client.query(`
          UPDATE identity.mfa_factor SET state='recovery_pending'
          WHERE mfa_factor_id=$1
        `, [input.factorId]);
      }
      await this.appendAudit(client, prepared, {
        actorToken,
        eventType: "identity.mfa.recovery_codes.generated",
        targetType: "identity.recovery_code",
        occurredAt: input.occurredAt,
        decision: valid ? "ALLOW" : "DENY",
        success: valid,
        justification: valid ? null : "MFA_ENROLLMENT_INVALID"
      });
      return valid;
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
      const bearer = await this.lockMfaEnrollmentBearer(client, input.enrollmentTokenHash);
      const lockedFactor = bearer === null ? undefined : (await client.query<{
        mfa_factor_id: string;
        factor_state: string;
      }>(`
        SELECT mfa_factor_id,state AS factor_state
        FROM identity.mfa_factor
        WHERE user_id=$1 AND factor_type='totp'
        ORDER BY created_at DESC,mfa_factor_id DESC
        LIMIT 1
        FOR UPDATE
      `, [bearer.userId])).rows[0];
      // Recovery-code rows are always locked after their parent factor.
      const lockedCode = bearer === null || lockedFactor === undefined
        ? undefined
        : (await client.query<{ recovery_code_id: string }>(`
          SELECT recovery_code_id
          FROM identity.recovery_code
          WHERE recovery_code_id=$1 AND user_id=$2
            AND consumed_at IS NULL AND revoked_at IS NULL
          FOR UPDATE
        `, [input.recoveryCodeId, bearer.userId])).rows[0];
      const valid = bearer !== null && bearer.isBindingBearer
        && bearer.userState === "pending_mfa"
        && lockedFactor?.factor_state === "recovery_pending"
        && lockedCode !== undefined
        && bearer.consumedAt !== null
        && bearer.expiresAt.getTime() >= input.occurredAt.getTime();
      const actorToken = bearer?.isBindingBearer === true ? bearer.auditToken : randomUUID();
      if (valid) {
        await client.query(`
          UPDATE identity.mfa_factor SET state='active' WHERE mfa_factor_id=$1
        `, [lockedFactor.mfa_factor_id]);
        await client.query(`UPDATE identity."user" SET state='active' WHERE user_id=$1`, [bearer.userId]);
        // Activation destroys the short-lived enrolment capability at its
        // ownership row. Consumed sibling credentials remain only as S3 audit
        // history and cannot be reused as MFA bearers.
        await client.query(`
          UPDATE identity.channel_binding
          SET verification_token_hash=NULL,verification_expires_at=NULL
          WHERE channel_binding_id=$1
        `, [bearer.channelBindingId]);
      }
      await this.appendAudit(client, prepared, {
        actorToken,
        eventType: "identity.mfa.enrollment.activated",
        targetType: "identity.mfa_factor",
        occurredAt: input.occurredAt,
        decision: valid ? "ALLOW" : "DENY",
        success: valid,
        justification: valid ? null : "MFA_ENROLLMENT_INVALID"
      });
      return valid;
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
      const user = await client.query<{ audit_token: string }>(`
        SELECT audit_token FROM identity."user" WHERE user_id=$1 FOR UPDATE
      `, [input.userId]);
      const consumed = await client.query<{ code_slot: number }>(`
        UPDATE identity.recovery_code SET consumed_at=$3
        WHERE recovery_code_id=$1 AND user_id=$2
          AND consumed_at IS NULL AND revoked_at IS NULL
        RETURNING code_slot
      `, [input.recoveryCodeId, input.userId, input.occurredAt]);
      const row = consumed.rows[0];
      const valid = user.rows[0] !== undefined && row !== undefined;
      if (valid) {
        await client.query(`
          INSERT INTO identity.recovery_code (
            user_id,code_slot,code_hash,created_at,consumed_at,revoked_at
          ) VALUES ($1,$2,$3,$4,NULL,NULL)
        `, [input.userId, row.code_slot, input.replacementHash, input.occurredAt]);
      }
      await this.appendAudit(client, prepared, {
        actorToken: user.rows[0]?.audit_token ?? randomUUID(),
        eventType: "identity.mfa.recovery_code.consumed",
        targetType: "identity.recovery_code",
        occurredAt: input.occurredAt,
        decision: valid ? "ALLOW" : "DENY",
        success: valid,
        justification: valid ? null : "MFA_RECOVERY_CODE_INVALID"
      });
      return valid;
    });
  }
}
