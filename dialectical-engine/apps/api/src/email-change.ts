import type { AuthSourceContext, PostgresEmailChangeRepository } from "@debateai/db";
import {
  createEmailBlindIndex,
  decrypt,
  encrypt,
  generateVerificationToken,
  hashToken,
  normalizeEmailForBlindIndex,
  type CryptoEnvelope,
  type ReadableUserDekStore
} from "@debateai/crypto";
import { isSingleDeliverableRecipient, type EmailChangeMailSender } from "./mail-channel.js";

// Turn 14 — change email (design doc 14A/14B/14C). The owner, fresh from a
// CHANGE_EMAIL step-up, names a new address. Nothing about the account changes
// until the link mailed to that address is opened; the current address gets a
// notice with a cancel link and keeps working meanwhile.

export type EmailChangeErrorCode =
  | "EMAIL_INVALID"
  | "EMAIL_UNCHANGED"
  | "STEP_UP_REQUIRED"
  | "RESEND_COOLDOWN"
  | "NO_PENDING_CHANGE"
  | "LINK_INVALID"
  | "LINK_EXPIRED"
  | "ADDRESS_UNAVAILABLE";

export class EmailChangeError extends Error {
  constructor(readonly code: EmailChangeErrorCode) {
    super(code);
    this.name = "EmailChangeError";
  }
}

export interface EmailChangeSession {
  readonly userId: string;
  readonly sessionId: string;
}

export interface EmailSettings {
  readonly email: string;
  readonly recoveryEmail: string;
  readonly pending: Readonly<{ newEmail: string; expiresAt: Date }> | null;
}

export interface EmailChangePending {
  readonly newEmail: string;
  readonly expiresAt: Date;
}

type Repository = Pick<PostgresEmailChangeRepository,
  "readSettings" | "request" | "resend" | "cancelOwn" | "cancelByToken" | "confirm">;

/** "It expires in 24 hours" (design 14C). */
export const EMAIL_CHANGE_LINK_TTL_MS = 24 * 3_600_000;
/** Resend rides a signed-in session and mails only the new address. */
export const EMAIL_CHANGE_RESEND_COOLDOWN_MS = 60_000;

const BEARER = /^[A-Za-z0-9_-]{43}$/;
const MAX_ADDRESS_LENGTH = 254;

function addressAad(userId: string, field: "user.email_ciphertext" | "user.recovery_email_ciphertext") {
  return ["identity", field, userId, "run:none", userId, `user-dek:${userId}`, "1"] as const;
}

function normalizedAddress(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_ADDRESS_LENGTH) throw new EmailChangeError("EMAIL_INVALID");
  let normalized: string;
  try {
    normalized = normalizeEmailForBlindIndex(value);
  } catch {
    throw new EmailChangeError("EMAIL_INVALID");
  }
  if (!isSingleDeliverableRecipient(normalized) || !/@[^@]+\.[^@.]+$/.test(normalized)) {
    throw new EmailChangeError("EMAIL_INVALID");
  }
  return normalized;
}

export class EmailChangeService {
  private readonly now: () => Date;
  private readonly tokenFactory: () => string;

  constructor(private readonly dependencies: {
    readonly repository: Repository;
    readonly users: ReadableUserDekStore;
    readonly blindIndexKey: Uint8Array;
    readonly mail: EmailChangeMailSender;
    readonly tokenTtlMs: number;
    readonly resendCooldownMs: number;
    readonly now?: () => Date;
    readonly tokenFactory?: () => string;
  }) {
    if (!Number.isInteger(dependencies.tokenTtlMs) || dependencies.tokenTtlMs <= 0
      || dependencies.tokenTtlMs > 25 * 3_600_000
      || !Number.isInteger(dependencies.resendCooldownMs)
      || dependencies.resendCooldownMs < 1_000 || dependencies.resendCooldownMs > 3_600_000) {
      throw new TypeError("EMAIL_CHANGE_POLICY_INVALID");
    }
    this.now = dependencies.now ?? (() => new Date());
    this.tokenFactory = dependencies.tokenFactory ?? generateVerificationToken;
  }

  async settings(session: EmailChangeSession): Promise<EmailSettings | null> {
    const record = await this.dependencies.repository.readSettings(session);
    if (record === null) return null;
    return this.withDek(session.userId, (dek) => Object.freeze({
      email: this.open(dek, session.userId, record.emailCiphertext, "user.email_ciphertext"),
      recoveryEmail: this.open(dek, session.userId, record.recoveryEmailCiphertext, "user.recovery_email_ciphertext"),
      pending: record.pending === null ? null : Object.freeze({
        newEmail: this.open(dek, session.userId, record.pending.newEmailCiphertext, "user.email_ciphertext"),
        expiresAt: record.pending.expiresAt
      })
    }));
  }

  async request(
    session: EmailChangeSession,
    input: Readonly<{ newEmail: unknown; grantToken: unknown }>,
    source: AuthSourceContext
  ): Promise<EmailChangePending> {
    const newEmail = normalizedAddress(input.newEmail);
    if (typeof input.grantToken !== "string" || !BEARER.test(input.grantToken)) {
      throw new EmailChangeError("STEP_UP_REQUIRED");
    }
    const confirmToken = this.tokenFactory();
    const cancelToken = this.tokenFactory();
    const expiresAt = new Date(this.now().getTime() + this.dependencies.tokenTtlMs);
    const newEmailCiphertext = await this.withDek(session.userId, (dek) =>
      encrypt(dek, Buffer.from(newEmail, "utf8"), addressAad(session.userId, "user.email_ciphertext")));
    const outcome = await this.dependencies.repository.request({
      userId: session.userId,
      sessionId: session.sessionId,
      grantTokenHash: hashToken("step-up-grant", input.grantToken),
      newEmailBlindIndex: createEmailBlindIndex(this.dependencies.blindIndexKey, newEmail),
      newEmailCiphertext,
      confirmTokenHash: hashToken("email-change-confirm", confirmToken),
      cancelTokenHash: hashToken("email-change-cancel", cancelToken),
      expiresAt,
      source
    });
    if (outcome.status === "UNCHANGED") throw new EmailChangeError("EMAIL_UNCHANGED");
    if (outcome.status !== "PENDING") throw new EmailChangeError("STEP_UP_REQUIRED");
    const currentEmail = await this.withDek(session.userId, (dek) =>
      this.open(dek, session.userId, outcome.currentEmailCiphertext, "user.email_ciphertext"));
    await this.sendLink(newEmail, confirmToken, outcome.expiresAt, outcome.addressAvailable);
    await this.dependencies.mail.sendEmailChange({
      kind: "notice", recipient: currentEmail, newEmail, cancelToken, expiresAt: outcome.expiresAt
    });
    return Object.freeze({ newEmail, expiresAt: outcome.expiresAt });
  }

  async resend(session: EmailChangeSession, source: AuthSourceContext): Promise<EmailChangePending> {
    const confirmToken = this.tokenFactory();
    const outcome = await this.dependencies.repository.resend({
      userId: session.userId,
      sessionId: session.sessionId,
      confirmTokenHash: hashToken("email-change-confirm", confirmToken),
      expiresAt: new Date(this.now().getTime() + this.dependencies.tokenTtlMs),
      cooldownMs: this.dependencies.resendCooldownMs,
      source
    });
    if (outcome.status === "COOLDOWN") throw new EmailChangeError("RESEND_COOLDOWN");
    if (outcome.status !== "RESENT") throw new EmailChangeError("NO_PENDING_CHANGE");
    const newEmail = await this.withDek(session.userId, (dek) =>
      this.open(dek, session.userId, outcome.newEmailCiphertext, "user.email_ciphertext"));
    await this.sendLink(newEmail, confirmToken, outcome.expiresAt, outcome.addressAvailable);
    return Object.freeze({ newEmail, expiresAt: outcome.expiresAt });
  }

  async cancel(session: EmailChangeSession, source: AuthSourceContext): Promise<void> {
    if (!await this.dependencies.repository.cancelOwn({ ...session, source })) {
      throw new EmailChangeError("NO_PENDING_CHANGE");
    }
  }

  async confirm(token: unknown, source: AuthSourceContext): Promise<void> {
    if (typeof token !== "string" || !BEARER.test(token)) throw new EmailChangeError("LINK_INVALID");
    const outcome = await this.dependencies.repository.confirm({
      confirmTokenHash: hashToken("email-change-confirm", token), source
    });
    if (outcome === "EXPIRED") throw new EmailChangeError("LINK_EXPIRED");
    if (outcome === "ADDRESS_UNAVAILABLE") throw new EmailChangeError("ADDRESS_UNAVAILABLE");
    if (outcome !== "CONFIRMED") throw new EmailChangeError("LINK_INVALID");
  }

  async cancelByLink(token: unknown, source: AuthSourceContext): Promise<void> {
    if (typeof token !== "string" || !BEARER.test(token)) throw new EmailChangeError("LINK_INVALID");
    const outcome = await this.dependencies.repository.cancelByToken({
      cancelTokenHash: hashToken("email-change-cancel", token), source
    });
    if (outcome !== "CANCELLED") throw new EmailChangeError("LINK_INVALID");
  }

  private async sendLink(recipient: string, token: string, expiresAt: Date, addressAvailable: boolean): Promise<void> {
    await this.dependencies.mail.sendEmailChange(addressAvailable
      ? { kind: "confirmation", recipient, token, expiresAt }
      : { kind: "address-unavailable", recipient });
  }

  private open(
    dek: Uint8Array,
    userId: string,
    envelope: CryptoEnvelope,
    field: "user.email_ciphertext" | "user.recovery_email_ciphertext"
  ): string {
    return decrypt(dek, envelope, addressAad(userId, field)).toString("utf8");
  }

  private async withDek<T>(userId: string, operation: (dek: Uint8Array) => T): Promise<T> {
    const dek = await this.dependencies.users.load(userId);
    try {
      return operation(dek);
    } finally {
      dek.fill(0);
    }
  }
}
