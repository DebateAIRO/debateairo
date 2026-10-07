import type { PostgresRecoveryEmailRepository, ProfileSession, AuthSourceContext } from "@debateai/db";
import { createEmailBlindIndex, decrypt, encrypt, generateVerificationToken, hashToken, type CryptoEnvelope, type ReadableUserDekStore } from "@debateai/crypto";
import { normalizedAddress } from "./email-change.js";
import type { RecoveryEmailMailSender } from "./mail-channel.js";
export class RecoveryEmailError extends Error {
  constructor(readonly code: "EMAIL_INVALID" | "EMAIL_UNCHANGED" | "STEP_UP_REQUIRED" | "LINK_INVALID" | "LINK_EXPIRED") {
    super(code);
    this.name = "RecoveryEmailError";
  }
}
export interface RecoveryEmailSettings {
  readonly state: "absent" | "pending" | "verified";
  readonly email: string | null;
  readonly pending: Readonly<{
    email: string;
    expires_at: string;
  }> | null;
}
// Candidates use their final field AAD, like email-change: SQL copies the exact
// token-bound stored envelope under the account lock, with no change of AAD.
export const recoveryEmailAad = (id: string) => ["identity", "user.recovery_email_ciphertext", id, "run:none", id, `user-dek:${id}`, "1"] as const;
export class RecoveryEmailService {
  constructor(private readonly dependencies: {
    readonly repository: Pick<PostgresRecoveryEmailRepository, "read" | "request" | "confirm" | "remove">;
    readonly users: ReadableUserDekStore;
    readonly blindIndexKey: Uint8Array;
    readonly mail: RecoveryEmailMailSender;
    readonly now?: () => Date;
    readonly tokenFactory?: () => string;
  }) {
  }
  async recoveryEmail(session: ProfileSession): Promise<RecoveryEmailSettings | null> {
    const record = await this.dependencies.repository.read(session);
    if (record === null)
      return null;
    const email = record.ciphertext === null ? null : await this.open(session.userId, record.ciphertext), pending = record.pending === null ? null : {
      email: await this.open(session.userId, record.pending.ciphertext), expires_at: record.pending.expiresAt.toISOString()
    };
    return {
      state: pending !== null ? "pending" : email !== null ? "verified" : "absent", email, pending
    };
  }
  async requestRecoveryEmail(session: ProfileSession, input: Readonly<{
    email: unknown;
    grantToken: unknown;
  }>, source: AuthSourceContext): Promise<RecoveryEmailSettings> {
    let email: string;
    try {
      email = normalizedAddress(input.email);
    }
    catch {
      throw new RecoveryEmailError("EMAIL_INVALID");
    }
    const grantTokenHash = this.grantHash(input.grantToken), token = (this.dependencies.tokenFactory ?? generateVerificationToken)(), expiresAt = new Date((this.dependencies.now?.() ?? new Date()).getTime() + 86400000), dek = await this.dependencies.users.load(session.userId), plain = Buffer.from(email);
    let ciphertext;
    try {
      ciphertext = encrypt(dek, plain, recoveryEmailAad(session.userId));
    }
    finally {
      dek.fill(0);
      plain.fill(0);
    }
    const result = await this.dependencies.repository.request(session, {
      grantTokenHash, emailBlindIndex: createEmailBlindIndex(this.dependencies.blindIndexKey, email), ciphertext, confirmTokenHash: hashToken("recovery-email-confirm", token), expiresAt
    }, source);
    if (result === "UNCHANGED")
      throw new RecoveryEmailError("EMAIL_UNCHANGED");
    if (result !== "PENDING")
      throw new RecoveryEmailError("STEP_UP_REQUIRED");
    await this.dependencies.mail.sendRecoveryEmail({
      kind: "confirmation", recipient: email, token, expiresAt
    });
    const settings = await this.recoveryEmail(session);
    if (settings === null)
      throw new RecoveryEmailError("STEP_UP_REQUIRED");
    return settings;
  }
  async confirmRecoveryEmail(input: Readonly<{
    token: unknown;
  }>, source: AuthSourceContext): Promise<void> {
    if (typeof input.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(input.token))
      throw new RecoveryEmailError("LINK_INVALID");
    const result = await this.dependencies.repository.confirm(hashToken("recovery-email-confirm", input.token), source);
    if (result === "EXPIRED")
      throw new RecoveryEmailError("LINK_EXPIRED");
    if (result !== "CONFIRMED")
      throw new RecoveryEmailError("LINK_INVALID");
  }
  async removeRecoveryEmail(session: ProfileSession, input: Readonly<{
    grantToken: unknown;
  }>, source: AuthSourceContext): Promise<void> {
    if (!await this.dependencies.repository.remove(session, this.grantHash(input.grantToken), source))
      throw new RecoveryEmailError("STEP_UP_REQUIRED");
  }
  private grantHash(value: unknown): string {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value))
      throw new RecoveryEmailError("STEP_UP_REQUIRED");
    return hashToken("step-up-grant", value);
  }
  private async open(id: string, envelope: CryptoEnvelope): Promise<string> {
    const dek = await this.dependencies.users.load(id);
    let plain: Buffer | undefined;
    try {
      plain = decrypt(dek, envelope, recoveryEmailAad(id));
      return plain.toString("utf8");
    }
    finally {
      dek.fill(0);
      plain?.fill(0);
    }
  }
}
