import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { AuditContextHasher, CryptoEnvelope } from "@debateai/crypto";
import type { AuthSourceContext } from "./identity.js";

// Turn 14 — change email. Each method is one call to one SECURITY DEFINER
// capability of migration 0079 inside one transaction that opens the runtime
// audit attempt the capability consumes. Bearers reach this layer only as
// their SHA-256 (`sha256:<hex>`); addresses only as ciphertext and blind index.

export interface EmailChangePendingRecord {
  readonly emailChangeId: string;
  readonly newEmailCiphertext: CryptoEnvelope;
  readonly expiresAt: Date;
  readonly lastSentAt: Date;
}

export interface EmailSettingsRecord {
  readonly emailCiphertext: CryptoEnvelope;
  readonly recoveryEmailCiphertext: CryptoEnvelope | null;
  readonly pending: EmailChangePendingRecord | null;
}

export type EmailChangeRequestOutcome =
  | Readonly<{
    status: "PENDING";
    emailChangeId: string;
    expiresAt: Date;
    currentEmailCiphertext: CryptoEnvelope;
    addressAvailable: boolean;
  }>
  | Readonly<{ status: "DENIED" }>
  | Readonly<{ status: "UNCHANGED" }>;

export type EmailChangeResendOutcome =
  | Readonly<{
    status: "RESENT";
    newEmailCiphertext: CryptoEnvelope;
    expiresAt: Date;
    addressAvailable: boolean;
  }>
  | Readonly<{ status: "COOLDOWN" }>
  | Readonly<{ status: "NONE" }>;

export type EmailChangeConfirmOutcome = "CONFIRMED" | "INVALID" | "EXPIRED" | "ADDRESS_UNAVAILABLE";
export type EmailChangeCancelOutcome = "CANCELLED" | "INVALID";

type PreparedSource = Readonly<{ ipArgon2id: string; userAgentArgon2id: string }>;

function normalized(value: unknown, maximumLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  return (text === "" ? "unknown" : text).slice(0, maximumLength);
}

function versionedAuditDigest(value: string): string {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new TypeError("AUDIT_CONTEXT_DIGEST_INVALID");
  return `argon2id-audit:v1:${value}`;
}

function assertCredentialHash(value: string): void {
  if (!/^sha256:[0-9a-f]{64}$/.test(value)) throw new TypeError("EMAIL_CHANGE_CREDENTIAL_HASH_INVALID");
}

function assertBlindIndex(value: Uint8Array): void {
  if (value.byteLength !== 32) throw new TypeError("EMAIL_CHANGE_BLIND_INDEX_INVALID");
}

export class PostgresEmailChangeRepository {
  constructor(
    private readonly pool: Pool,
    private readonly auditContext: AuditContextHasher
  ) {}

  async readSettings(input: Readonly<{ userId: string; sessionId: string }>): Promise<EmailSettingsRecord | null> {
    const result = await this.pool.query<{
      result_email_ciphertext: CryptoEnvelope;
      result_recovery_email_ciphertext: CryptoEnvelope | null;
      result_pending_email_change_id: string | null;
      result_pending_new_email_ciphertext: CryptoEnvelope | null;
      result_pending_expires_at: Date | null;
      result_pending_last_sent_at: Date | null;
    }>("SELECT * FROM identity.read_email_settings($1,$2)", [input.userId, input.sessionId]);
    const row = result.rows[0];
    if (row === undefined) return null;
    return Object.freeze({
      emailCiphertext: row.result_email_ciphertext,
      recoveryEmailCiphertext: row.result_recovery_email_ciphertext,
      pending: row.result_pending_email_change_id === null
        || row.result_pending_new_email_ciphertext === null
        || row.result_pending_expires_at === null
        || row.result_pending_last_sent_at === null
        ? null
        : Object.freeze({
          emailChangeId: row.result_pending_email_change_id,
          newEmailCiphertext: row.result_pending_new_email_ciphertext,
          expiresAt: row.result_pending_expires_at,
          lastSentAt: row.result_pending_last_sent_at
        })
    });
  }

  async request(input: Readonly<{
    userId: string;
    sessionId: string;
    grantTokenHash: string;
    newEmailBlindIndex: Uint8Array;
    newEmailCiphertext: CryptoEnvelope;
    confirmTokenHash: string;
    cancelTokenHash: string;
    expiresAt: Date;
    source: AuthSourceContext;
  }>): Promise<EmailChangeRequestOutcome> {
    assertCredentialHash(input.grantTokenHash);
    assertCredentialHash(input.confirmTokenHash);
    assertCredentialHash(input.cancelTokenHash);
    assertBlindIndex(input.newEmailBlindIndex);
    const emailChangeId = randomUUID();
    const prepared = await this.prepareAuditContext(input.source);
    const row = await this.transaction(async (client) => (await client.query<{
      result_status: "PENDING" | "DENIED" | "UNCHANGED";
      result_expires_at: Date | null;
      result_current_email_ciphertext: CryptoEnvelope | null;
      result_address_available: boolean | null;
    }>(`
      SELECT * FROM identity.request_email_change_with_audit(
        $1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10::jsonb
      )
    `, [
      input.userId, input.sessionId, input.grantTokenHash, emailChangeId,
      Buffer.from(input.newEmailBlindIndex), JSON.stringify(input.newEmailCiphertext),
      input.confirmTokenHash, input.cancelTokenHash, input.expiresAt, JSON.stringify(prepared)
    ])).rows[0]);
    if (row?.result_status === "PENDING" && row.result_expires_at !== null
      && row.result_current_email_ciphertext !== null && row.result_address_available !== null) {
      return Object.freeze({
        status: "PENDING",
        emailChangeId,
        expiresAt: row.result_expires_at,
        currentEmailCiphertext: row.result_current_email_ciphertext,
        addressAvailable: row.result_address_available
      });
    }
    return Object.freeze({ status: row?.result_status === "UNCHANGED" ? "UNCHANGED" : "DENIED" });
  }

  async resend(input: Readonly<{
    userId: string;
    sessionId: string;
    confirmTokenHash: string;
    expiresAt: Date;
    cooldownMs: number;
    source: AuthSourceContext;
  }>): Promise<EmailChangeResendOutcome> {
    assertCredentialHash(input.confirmTokenHash);
    const prepared = await this.prepareAuditContext(input.source);
    const row = await this.transaction(async (client) => (await client.query<{
      result_status: "RESENT" | "COOLDOWN" | "NONE";
      result_new_email_ciphertext: CryptoEnvelope | null;
      result_expires_at: Date | null;
      result_address_available: boolean | null;
    }>(`
      SELECT * FROM identity.resend_email_change_with_audit($1,$2,$3,$4,$5,$6::jsonb)
    `, [
      input.userId, input.sessionId, input.confirmTokenHash, input.expiresAt,
      input.cooldownMs, JSON.stringify(prepared)
    ])).rows[0]);
    if (row?.result_status === "RESENT" && row.result_new_email_ciphertext !== null
      && row.result_expires_at !== null && row.result_address_available !== null) {
      return Object.freeze({
        status: "RESENT",
        newEmailCiphertext: row.result_new_email_ciphertext,
        expiresAt: row.result_expires_at,
        addressAvailable: row.result_address_available
      });
    }
    return Object.freeze({ status: row?.result_status === "COOLDOWN" ? "COOLDOWN" : "NONE" });
  }

  async cancelOwn(input: Readonly<{
    userId: string;
    sessionId: string;
    source: AuthSourceContext;
  }>): Promise<boolean> {
    const prepared = await this.prepareAuditContext(input.source);
    return this.transaction(async (client) => (await client.query<{ cancelled: boolean }>(`
      SELECT identity.cancel_own_email_change_with_audit($1,$2,$3::jsonb) AS cancelled
    `, [input.userId, input.sessionId, JSON.stringify(prepared)])).rows[0]?.cancelled === true);
  }

  async cancelByToken(input: Readonly<{
    cancelTokenHash: string;
    source: AuthSourceContext;
  }>): Promise<EmailChangeCancelOutcome> {
    assertCredentialHash(input.cancelTokenHash);
    const prepared = await this.prepareAuditContext(input.source);
    const outcome = await this.transaction(async (client) => (await client.query<{ outcome: string }>(`
      SELECT identity.cancel_email_change_by_token_with_audit($1,$2::jsonb) AS outcome
    `, [input.cancelTokenHash, JSON.stringify(prepared)])).rows[0]?.outcome);
    return outcome === "CANCELLED" ? "CANCELLED" : "INVALID";
  }

  async confirm(input: Readonly<{
    confirmTokenHash: string;
    source: AuthSourceContext;
  }>): Promise<EmailChangeConfirmOutcome> {
    assertCredentialHash(input.confirmTokenHash);
    const prepared = await this.prepareAuditContext(input.source);
    const outcome = await this.transaction(async (client) => (await client.query<{ outcome: string }>(`
      SELECT identity.confirm_email_change_with_audit($1,$2::jsonb) AS outcome
    `, [input.confirmTokenHash, JSON.stringify(prepared)])).rows[0]?.outcome);
    return outcome === "CONFIRMED" || outcome === "EXPIRED" || outcome === "ADDRESS_UNAVAILABLE"
      ? outcome : "INVALID";
  }

  private async prepareAuditContext(source: AuthSourceContext): Promise<PreparedSource> {
    // Both memory-hard reductions complete before pool.connect(), BEGIN, row
    // locks, or the audit advisory lock (the identity repository law).
    const ipArgon2id = versionedAuditDigest(await this.auditContext.hashSourceIp(normalized(source?.ip, 64)));
    const userAgentArgon2id = versionedAuditDigest(
      await this.auditContext.hashUserAgent(normalized(source?.userAgent, 256))
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
}
