import { createEmailBlindIndex } from "@debateai/crypto";
import { isMailAddress } from "@debateai/kernel";
import type { OutboundMailPolicy } from "@debateai/register";

/**
 * THE OUTBOUND MAIL GATE (open sign-up mail, PR 3, 2026-10-09; design §3(a) option A3, owner decisions G1-G3).
 *
 * Every account-mail sender asks this gate immediately before it starts the program named in MAIL_SENDMAIL_PATH:
 * the six senders of mail-channel.ts, the password-reset sender and the backup-email / MFA-recovery sender. Staff
 * alerts are not account mail and never come here (they have their own root-owned recipient file).
 *
 * The questions, in this order:
 *  1. ADDRESS SHAPE: the one shared rule (packages/kernel/src/mail-address.ts). Refusal: MAIL_INPUT_INVALID.
 *  2. SUPPRESSION: the address's keyed digest (the same HMAC blind index the account store looks people up by)
 *     must not be on the suppression list. Refusal: RECIPIENT_SUPPRESSED. The list holds digests only.
 *  3. DAILY BUDGET: one count per UTC day. Mail of the "standard" class (sign-up verification, address
 *     confirmations, billing) may use the cap minus the security reserve; "security" mail (password reset,
 *     recovery, security notices, the notice to the old address on an email change) may use the whole cap, so a
 *     flood of sign-ups can never starve a password reset. Refusal: MAIL_DAILY_LIMIT.
 *
 * Every refusal and every alert is content-free: a fixed code, the purpose and its class. Never an address, never
 * a digest. A refused send counts nothing; an admitted one counts once, whether or not the mail program then
 * succeeds (the count is of hand-offs, the conservative reading of a cap).
 *
 * Storage sits behind two small interfaces. Until the counter table lands (a migration "numbered at merge", see
 * docs/superpowers/specs/2026-10-09-outbound-mail-gate.md) the running API uses InMemoryOutboundMailStore: an
 * in-process count, which is exact for the preview's single API process but restarts from zero when the process
 * restarts and is not shared between processes. That is why it is PREVIEW-ONLY until the migration lands.
 */
export type MailPurpose =
  | "verification"
  | "recovery-email-confirmation"
  | "email-change-confirmation"
  | "email-change-unavailable"
  | "email-change-notice"
  | "account-erasure-notice"
  | "consumer-recovery"
  | "consumer-security-notice"
  | "password-reset"
  | "email-recovery"
  | "templated";
export type MailPurposeClass = "standard" | "security";

const PURPOSE_CLASS: Readonly<Record<MailPurpose, MailPurposeClass>> = Object.freeze({
  "verification": "standard",
  "recovery-email-confirmation": "standard",
  "email-change-confirmation": "standard",
  "email-change-unavailable": "standard",
  "templated": "standard",
  "email-change-notice": "security",
  "account-erasure-notice": "security",
  "consumer-recovery": "security",
  "consumer-security-notice": "security",
  "password-reset": "security",
  "email-recovery": "security"
});

export function mailPurposeClass(purpose: MailPurpose): MailPurposeClass {
  const purposeClass = PURPOSE_CLASS[purpose];
  if (purposeClass === undefined) throw new TypeError("MAIL_PURPOSE_UNKNOWN");
  return purposeClass;
}

export type OutboundMailRefusalCode = "MAIL_INPUT_INVALID" | "RECIPIENT_SUPPRESSED" | "MAIL_DAILY_LIMIT";
export type OutboundMailAlertCode =
  | "OUTBOUND_MAIL_DAILY_THRESHOLD"
  | "OUTBOUND_MAIL_STANDARD_CAP_REACHED"
  | "OUTBOUND_MAIL_DAILY_CAP_REACHED";

/** A refusal carries its code, the purpose and the class. Nothing else exists on it to leak. */
export class OutboundMailRefusal extends Error {
  constructor(readonly code: OutboundMailRefusalCode, readonly purpose: MailPurpose, readonly purposeClass: MailPurposeClass) {
    super(code);
    this.name = "OutboundMailRefusal";
  }
}

/** The day's count. `reserve` is atomic: it counts one hand-off only while the day's total is below `ceiling`. */
export interface OutboundMailLedger {
  reserve(request: Readonly<{ day: string; purposeClass: MailPurposeClass; ceiling: number }>): Promise<Readonly<{ admitted: boolean; total: number }>>;
  total(day: string): Promise<number>;
}

/** Keyed digests of addresses that bounced for good or complained. It never sees an address. */
export interface MailSuppressionList {
  isSuppressed(blindIndex: Buffer): Promise<boolean>;
}

export type OutboundMailGateEvent =
  | Readonly<{ kind: "refused"; code: OutboundMailRefusalCode; purpose: MailPurpose; purposeClass: MailPurposeClass }>
  | Readonly<{ kind: "alert"; code: OutboundMailAlertCode; day: string; total: number; dailyCap: number }>;

export interface OutboundMailAuthorizer {
  /** Resolves when this one mail may be handed to the mail program; rejects with OutboundMailRefusal otherwise. */
  authorize(request: Readonly<{ recipient: string; purpose: MailPurpose }>): Promise<void>;
}

const ceilingOf = (policy: OutboundMailPolicy, purposeClass: MailPurposeClass): number =>
  purposeClass === "security"
    ? policy.dailyCap
    : Math.floor(policy.dailyCap * (100 - policy.reservedForSecurityPct) / 100);

export class OutboundMailGate implements OutboundMailAuthorizer {
  private readonly now: () => Date;
  /** Once per UTC day per code: the alerts and the refusal lines. Only today's entries are ever kept. */
  private reported: { day: string; keys: Set<string> } = { day: "", keys: new Set() };

  constructor(private readonly dependencies: Readonly<{
    policy: OutboundMailPolicy;
    blindIndexKey: Uint8Array;
    ledger: OutboundMailLedger;
    suppression: MailSuppressionList;
    /** Content-free events only. Exceptions thrown here are swallowed: reporting never decides a send. */
    report: (event: OutboundMailGateEvent) => void;
    now?: () => Date;
  }>) {
    const { policy } = dependencies;
    if (!Number.isInteger(policy.dailyCap) || policy.dailyCap < 1
      || !Number.isInteger(policy.reservedForSecurityPct) || policy.reservedForSecurityPct < 0 || policy.reservedForSecurityPct > 100
      || !Number.isInteger(policy.alertAtPct) || policy.alertAtPct < 1 || policy.alertAtPct > 100
      || !ArrayBuffer.isView(dependencies.blindIndexKey) || dependencies.blindIndexKey.byteLength < 1
      || typeof dependencies.report !== "function") {
      throw new TypeError("OUTBOUND_MAIL_GATE_CONFIGURATION_INVALID");
    }
    this.now = dependencies.now ?? (() => new Date());
  }

  private day(): string {
    return this.now().toISOString().slice(0, 10);
  }

  private once(day: string, key: string): boolean {
    if (this.reported.day !== day) this.reported = { day, keys: new Set() };
    if (this.reported.keys.has(key)) return false;
    this.reported.keys.add(key);
    return true;
  }

  private emit(event: OutboundMailGateEvent): void {
    try { this.dependencies.report(event); } catch { /* Reporting never decides a send. */ }
  }

  private refuse(day: string, code: OutboundMailRefusalCode, purpose: MailPurpose, purposeClass: MailPurposeClass): never {
    if (this.once(day, `refused:${code}:${purpose}`)) this.emit({ kind: "refused", code, purpose, purposeClass });
    throw new OutboundMailRefusal(code, purpose, purposeClass);
  }

  private alert(day: string, code: OutboundMailAlertCode, total: number): void {
    if (this.once(day, `alert:${code}`)) this.emit({ kind: "alert", code, day, total, dailyCap: this.dependencies.policy.dailyCap });
  }

  /**
   * The sign-up and resend question, asked before any account work: is there room today for one more mail of
   * this class? A yes reserves nothing; the send itself still asks `authorize`.
   */
  async hasCapacity(purposeClass: MailPurposeClass): Promise<boolean> {
    const day = this.day();
    return await this.dependencies.ledger.total(day) < ceilingOf(this.dependencies.policy, purposeClass);
  }

  async authorize(request: Readonly<{ recipient: string; purpose: MailPurpose }>): Promise<void> {
    const purposeClass = mailPurposeClass(request.purpose);
    const day = this.day();
    if (!isMailAddress(request.recipient)) this.refuse(day, "MAIL_INPUT_INVALID", request.purpose, purposeClass);
    const index = createEmailBlindIndex(this.dependencies.blindIndexKey, request.recipient);
    try {
      if (await this.dependencies.suppression.isSuppressed(index)) this.refuse(day, "RECIPIENT_SUPPRESSED", request.purpose, purposeClass);
    } finally {
      index.fill(0);
    }
    const { policy } = this.dependencies;
    const reservation = await this.dependencies.ledger.reserve({ day, purposeClass, ceiling: ceilingOf(policy, purposeClass) });
    if (!reservation.admitted) {
      this.alert(day, purposeClass === "security" ? "OUTBOUND_MAIL_DAILY_CAP_REACHED" : "OUTBOUND_MAIL_STANDARD_CAP_REACHED", reservation.total);
      this.refuse(day, "MAIL_DAILY_LIMIT", request.purpose, purposeClass);
    }
    if (reservation.total * 100 >= policy.dailyCap * policy.alertAtPct) this.alert(day, "OUTBOUND_MAIL_DAILY_THRESHOLD", reservation.total);
  }
}

/**
 * The in-memory ledger and suppression list: the tests' implementation, and the running API's until the counter
 * table's migration lands (PREVIEW-ONLY, see the header). Only the current day is kept, so memory stays bounded.
 */
export class InMemoryOutboundMailStore implements OutboundMailLedger, MailSuppressionList {
  private current: { day: string; total: number; byClass: Record<MailPurposeClass, number> } = { day: "", total: 0, byClass: { standard: 0, security: 0 } };
  private readonly suppressed = new Set<string>();

  private today(day: string) {
    if (this.current.day !== day) this.current = { day, total: 0, byClass: { standard: 0, security: 0 } };
    return this.current;
  }

  async reserve(request: Readonly<{ day: string; purposeClass: MailPurposeClass; ceiling: number }>): Promise<Readonly<{ admitted: boolean; total: number }>> {
    // Synchronous between the read and the write: no await, so two callers can never both take the last unit.
    const today = this.today(request.day);
    if (today.total >= request.ceiling) return Object.freeze({ admitted: false, total: today.total });
    today.total += 1;
    today.byClass[request.purposeClass] += 1;
    return Object.freeze({ admitted: true, total: today.total });
  }

  async total(day: string): Promise<number> {
    return this.current.day === day ? this.current.total : 0;
  }

  /** Per class, for tests and the owner's view. */
  counts(day: string): Readonly<Record<MailPurposeClass, number>> {
    return Object.freeze(this.current.day === day ? { ...this.current.byClass } : { standard: 0, security: 0 });
  }

  async isSuppressed(blindIndex: Buffer): Promise<boolean> {
    return this.suppressed.has(blindIndex.toString("hex"));
  }

  /** Tests only, until bounce and complaint events flow back (design §3(b) B-full). Takes a digest, never an address. */
  suppress(blindIndex: Buffer): void {
    this.suppressed.add(blindIndex.toString("hex"));
  }
}

/** The running API's report: one fixed-code line per event, no address, no digest. */
export function consoleOutboundMailReport(event: OutboundMailGateEvent): void {
  if (event.kind === "refused") {
    console.error(`[OUTBOUND_MAIL_REFUSED] code=${event.code} class=${event.purposeClass} purpose=${event.purpose}`);
  } else {
    console.error(`[OUTBOUND_MAIL_ALERT] code=${event.code} day=${event.day} total=${event.total} cap=${event.dailyCap}`);
  }
}
