import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  appendAuditEvent,
  hashAuditSourceIp,
  hashAuditUserAgent,
  type AuditSourceIpKdfParameters,
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

interface AuditWrite {
  readonly actorToken: string;
  readonly eventType: string;
  readonly targetType: string;
  readonly occurredAt: Date;
  readonly source: AuthSourceContext;
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

export class PostgresIdentityRepository {
  private readonly sourceIpSalt: Buffer;
  private readonly sourceIpKdf: AuditSourceIpKdfParameters;

  constructor(
    private readonly pool: Pool,
    sourceIpSalt: Uint8Array,
    sourceIpKdf: AuditSourceIpKdfParameters
  ) {
    if (sourceIpSalt.byteLength < 32) throw new TypeError("AUDIT_SOURCE_IP_SALT_INVALID");
    this.sourceIpSalt = Buffer.from(sourceIpSalt);
    this.sourceIpKdf = Object.freeze({ ...sourceIpKdf });
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

  private async appendAudit(client: PoolClient, event: AuditWrite): Promise<void> {
    assertOpaqueToken(event.actorToken);
    const source = normalizeAuditSourceContext(event.source);
    const ipArgon2id = await hashAuditSourceIp(source.ip, this.sourceIpSalt, this.sourceIpKdf);
    const userAgentArgon2id = await hashAuditUserAgent(
      source.userAgent, this.sourceIpSalt, this.sourceIpKdf
    );
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
        await this.appendAudit(client, {
          actorToken: existing.audit_token,
          eventType: "identity.registration",
          targetType: "identity.user",
          occurredAt: input.occurredAt,
          source: input.source,
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
      await this.appendAudit(client, {
        actorToken: input.auditToken,
        eventType: "identity.registration",
        targetType: "identity.user",
        occurredAt: input.occurredAt,
        source: input.source,
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
      await this.appendAudit(client, {
        actorToken: user.rows[0].audit_token,
        eventType: "identity.verification.sent",
        targetType: "identity.channel_binding",
        occurredAt: input.occurredAt,
        source: input.source,
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
    await this.transaction(async (client) => {
      const user = await client.query<{ audit_token: string }>(`
        SELECT audit_token FROM identity."user" WHERE user_id=$1 FOR UPDATE
      `, [input.userId]);
      if (user.rows[0] === undefined) throw new Error("IDENTITY_USER_NOT_FOUND");
      await this.appendAudit(client, {
        actorToken: user.rows[0].audit_token,
        eventType: "identity.verification.delivery_record_failed",
        targetType: "identity.channel_binding",
        occurredAt: input.occurredAt,
        source: input.source,
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
      await this.appendAudit(client, {
        actorToken: user.rows[0].audit_token,
        eventType: "identity.registration.duplicate_postwork",
        targetType: "identity.channel_binding",
        occurredAt: input.occurredAt,
        source: input.source,
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
            delivery_error=NULL
          WHERE channel_binding_id=$1
        `, [channel.channel_binding_id, input.occurredAt]);
        await client.query(`UPDATE identity."user" SET state='active' WHERE user_id=$1`, [channel.user_id]);
      }
      await this.appendAudit(client, {
        actorToken,
        eventType: "identity.verification.consumed",
        targetType: "identity.channel_binding",
        occurredAt: input.occurredAt,
        source: input.source,
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
      await this.appendAudit(client, {
        actorToken,
        eventType: "identity.verification.resend_requested",
        targetType: "identity.channel_binding",
        occurredAt: input.occurredAt,
        source: input.source,
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
    await this.transaction((client) => this.appendAudit(client, {
      actorToken: input.actorToken,
      eventType: "identity.auth.rate_limit_refused",
      targetType: `auth.${input.route}`,
      occurredAt: input.occurredAt,
      source: input.source,
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
    await this.transaction((client) => this.appendAudit(client, {
      actorToken: input.correlationId,
      eventType: "identity.registration.failed",
      targetType: "identity.registration_attempt",
      occurredAt: input.occurredAt,
      source: input.source,
      decision: "DENY",
      success: false,
      justification: "PROVISION_FAILED"
    }));
  }
}
