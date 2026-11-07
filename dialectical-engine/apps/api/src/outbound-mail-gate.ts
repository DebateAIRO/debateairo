import { createEmailBlindIndex } from "@debateai/crypto";
import { isMailAddress } from "@debateai/kernel";
import type { OutboundMailPolicy } from "@debateai/register";

/**
 * THE OUTBOUND MAIL GATE (owner's rulings of 2026-11-01; replaces closed PR #113, whose count lived in the API's memory).
 *
 * Every account-mail sender asks this gate immediately before it starts the program named in MAIL_SENDMAIL_PATH (the
 * senders of mail-channel.ts, the password-reset sender and the backup-email / MFA-recovery sender;
 * tests/architecture/outbound-mail-gate.test.ts fails if one skips it). Staff alerts are not account mail and never come here:
 * they have their own root-owned recipient file.
 *
 * The questions, in this order:
 *  1. ADDRESS SHAPE: the one shared rule (packages/kernel/src/mail-address.ts). Refusal: MAIL_INPUT_INVALID.
 *  2. SUPPRESSION: the address's keyed digest must not be on the suppression list. A suppressed address is SKIPPED, not
 *     refused: the mail can never arrive, so the worker that asked must not retry it for ever (an erasure notice waits on
 *     its acknowledgement). Nothing is counted. The list holds digests only, and stays empty until bounce and complaint
 *     reports flow back from Amazon: that feed is still owed.
 *  3. THE DAILY LIMIT: one shared count per UTC day, in the database (migration 0170), so it survives restarts and uploads
 *     and every API copy shares it. "Standard" mail may use the limit minus the security reserve; "security" mail may use
 *     all of it, so a flood of sign-ups can never starve a password reset. Refusal: MAIL_DAILY_LIMIT.
 *
 * "unmetered" is the owner's own limit alert alone: it must arrive when the limit is reached, and at most three go a day.
 *
 * Every refusal and every alert is content-free: a fixed code, the purpose and its class, never an address or a digest. A
 * refused send counts nothing; an admitted one counts once, whether or not the mail program then succeeds (the count is
 * of hand-offs, the conservative reading of a limit). A count that cannot be read refuses the mail
 * (OUTBOUND_MAIL_GATE_UNAVAILABLE): a queued mail is retried by its worker.
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
  | "billing"
  | "data-export"
  | "owner-notice"
  | "threat-report-alert"
  | "team-notice"
  | "moderation-notice"
  | "owner-limit-alert";
export type MailPurposeClass = "standard" | "security" | "unmetered";

const PURPOSE_CLASS: Readonly<Record<MailPurpose, MailPurposeClass>> = Object.freeze({
  "verification": "standard",
  "recovery-email-confirmation": "standard",
  "email-change-confirmation": "standard",
  "email-change-unavailable": "standard",
  "data-export": "standard",
  "email-change-notice": "security",
  "account-erasure-notice": "security",
  "consumer-recovery": "security",
  "consumer-security-notice": "security",
  // Owner's ruling, 2026-11-02: receipts and renewal notices use the reserve, so a flood of sign-ups cannot cost a paying customer their receipt.
  "billing": "security",
  "password-reset": "security",
  "email-recovery": "security",
  "owner-notice": "security",
  "threat-report-alert": "security",
  // V4 (moved onto the V4 line 2026-11-07; class awaiting the owner's confirmation): the team's content-free notices to its Owner,
  // partner and members (team limit, allowances, public review steps, reports on a public debate) are owner notices, so security.
  "team-notice": "security",
  // V4 0156/0157 (class awaiting the owner's confirmation): the DSA statements of reasons and the answers to people who report
  // are legal duties with a deadline, so they use the reserve and a sign-up flood cannot hold them back.
  "moderation-notice": "security",
  "owner-limit-alert": "unmetered"
});

export function mailPurposeClass(purpose: MailPurpose): MailPurposeClass {
  const purposeClass = PURPOSE_CLASS[purpose];
  if (purposeClass === undefined) throw new TypeError("MAIL_PURPOSE_UNKNOWN");
  return purposeClass;
}

export type OutboundMailRefusalCode = "MAIL_INPUT_INVALID" | "MAIL_DAILY_LIMIT";
export type OutboundMailAlertKind = "ALERT_SHARE" | "STANDARD_LIMIT" | "DAILY_LIMIT";

/** A refusal carries its code, the purpose and the class. Nothing else exists on it to leak. */
export class OutboundMailRefusal extends Error {
  constructor(readonly code: OutboundMailRefusalCode, readonly purpose: MailPurpose, readonly purposeClass: MailPurposeClass) {
    super(code);
    this.name = "OutboundMailRefusal";
  }
}

/** The day's shared count (packages/db/src/outbound-mail.ts). The day is the database's, so copies never disagree. */
export interface OutboundMailLedger {
  reserve(request: Readonly<{ purposeClass: "standard" | "security"; ceiling: number }>): Promise<Readonly<{ admitted: boolean; total: number; day: string }>>;
  today(): Promise<Readonly<{ total: number; day: string }>>;
  /** True for exactly one caller per kind per day. */
  claimAlert(kind: OutboundMailAlertKind, day: string): Promise<boolean>;
}

/** Keyed digests of addresses that bounced for good or complained. It never sees an address. */
export interface MailSuppressionList {
  isSuppressed(digest: Buffer): Promise<boolean>;
}

export type OutboundMailGateEvent =
  | Readonly<{ kind: "refused"; code: OutboundMailRefusalCode | "RECIPIENT_SUPPRESSED" | "OUTBOUND_MAIL_GATE_UNAVAILABLE"; purpose: MailPurpose; purposeClass: MailPurposeClass }>
  | Readonly<{ kind: "alert"; alert: OutboundMailAlertKind; day: string; total: number; dailyLimit: number }>;

export interface OutboundMailAuthorizer {
  /**
   * True when this one mail may be handed to the mail program, false when it must be dropped without a send (a suppressed
   * address). Rejects with OutboundMailRefusal, or any other error when the count cannot be read.
   */
  authorize(request: Readonly<{ recipient: string; purpose: MailPurpose }>): Promise<boolean>;
}

const ceilingOf = (policy: OutboundMailPolicy, purposeClass: "standard" | "security"): number =>
  purposeClass === "security"
    ? policy.dailyLimit
    : Math.floor(policy.dailyLimit * (100 - policy.reservedForSecurityPct) / 100);

export class OutboundMailGate implements OutboundMailAuthorizer {
  /** Only to spare the database a repeated question; which copy alerts is decided by claimAlert. Today's entries only. */
  private seen: { day: string; keys: Set<string> } = { day: "", keys: new Set() };

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
    if (!Number.isInteger(policy.dailyLimit) || policy.dailyLimit < 1
      || !Number.isInteger(policy.reservedForSecurityPct) || policy.reservedForSecurityPct < 0 || policy.reservedForSecurityPct > 90
      || ceilingOf(policy, "standard") < 1
      || !Number.isInteger(policy.alertAtPct) || policy.alertAtPct < 1 || policy.alertAtPct > 100
      || !ArrayBuffer.isView(dependencies.blindIndexKey) || dependencies.blindIndexKey.byteLength < 1
      || typeof dependencies.report !== "function") {
      throw new TypeError("OUTBOUND_MAIL_GATE_CONFIGURATION_INVALID");
    }
  }

  private localDay(): string {
    return (this.dependencies.now ?? (() => new Date()))().toISOString().slice(0, 10);
  }

  private firstToday(day: string, key: string): boolean {
    if (this.seen.day !== day) this.seen = { day, keys: new Set() };
    if (this.seen.keys.has(key)) return false;
    this.seen.keys.add(key);
    return true;
  }

  private emit(event: OutboundMailGateEvent): void {
    try { this.dependencies.report(event); } catch { /* Reporting never decides a send. */ }
  }

  private refusedLine(day: string, code: Extract<OutboundMailGateEvent, { kind: "refused" }>["code"], purpose: MailPurpose, purposeClass: MailPurposeClass): void {
    if (this.firstToday(day, `refused:${code}:${purpose}`)) this.emit({ kind: "refused", code, purpose, purposeClass });
  }

  /** The alert is sent by the one copy that takes it. A claim that fails is asked again by the next mail: an alert is not lost to one failed read. */
  private async alert(day: string, alert: OutboundMailAlertKind, total: number): Promise<void> {
    const key = `alert:${alert}`;
    if (!this.firstToday(day, key)) return;
    let claimed: boolean;
    try {
      claimed = await this.dependencies.ledger.claimAlert(alert, day);
    } catch {
      this.seen.keys.delete(key);
      return;
    }
    if (claimed) this.emit({ kind: "alert", alert, day, total, dailyLimit: this.dependencies.policy.dailyLimit });
  }

  /**
   * The sign-up and resend question, asked before any account work: is there room today for one more standard mail? A yes
   * reserves nothing; the send itself still asks `authorize`. It depends on the day's count alone, never on whether an
   * account exists. Rejects when the count cannot be read.
   */
  async hasStandardRoom(): Promise<boolean> {
    const { total, day } = await this.dependencies.ledger.today();
    if (total < ceilingOf(this.dependencies.policy, "standard")) return true;
    // At the limit sign-up and resend stop HERE, before any send reaches `authorize`: the owner's alert must too.
    await this.alert(day, "STANDARD_LIMIT", total);
    return false;
  }

  async authorize(request: Readonly<{ recipient: string; purpose: MailPurpose }>): Promise<boolean> {
    const purposeClass = mailPurposeClass(request.purpose);
    if (!isMailAddress(request.recipient)) {
      this.refusedLine(this.localDay(), "MAIL_INPUT_INVALID", request.purpose, purposeClass);
      throw new OutboundMailRefusal("MAIL_INPUT_INVALID", request.purpose, purposeClass);
    }
    if (purposeClass === "unmetered") return true;
    const { policy, ledger, suppression, blindIndexKey } = this.dependencies;
    try {
      const digest = createEmailBlindIndex(blindIndexKey, request.recipient);
      try {
        if (await suppression.isSuppressed(digest)) {
          this.refusedLine(this.localDay(), "RECIPIENT_SUPPRESSED", request.purpose, purposeClass);
          return false;
        }
      } finally {
        digest.fill(0);
      }
      const reservation = await ledger.reserve({ purposeClass, ceiling: ceilingOf(policy, purposeClass) });
      if (!reservation.admitted) {
        await this.alert(reservation.day, purposeClass === "security" ? "DAILY_LIMIT" : "STANDARD_LIMIT", reservation.total);
        this.refusedLine(reservation.day, "MAIL_DAILY_LIMIT", request.purpose, purposeClass);
        throw new OutboundMailRefusal("MAIL_DAILY_LIMIT", request.purpose, purposeClass);
      }
      if (reservation.total * 100 >= policy.dailyLimit * policy.alertAtPct) await this.alert(reservation.day, "ALERT_SHARE", reservation.total);
      return true;
    } catch (error) {
      if (!(error instanceof OutboundMailRefusal)) this.refusedLine(this.localDay(), "OUTBOUND_MAIL_GATE_UNAVAILABLE", request.purpose, purposeClass);
      throw error;
    }
  }
}

/** The owner's mail for one alert: the fixed English owner templates of @debateai/mail-templates. */
const ALERT_TEMPLATE = Object.freeze({
  ALERT_SHARE: "OUTBOUND_MAIL_SHARE",
  STANDARD_LIMIT: "OUTBOUND_MAIL_SIGN_UP_STOPPED",
  DAILY_LIMIT: "OUTBOUND_MAIL_ALL_STOPPED"
} as const);

/**
 * The running API's report: one fixed-code line per event, no address, no digest; and for an alert, one mail to the owner
 * when the site has the owner's address (OWNER_REPORT_EMAIL_PATH, billing on). Without it the journal line is the alert.
 * A mail that fails leaves its own line; the alert is not sent again that day.
 */
export function outboundMailReport(input: Readonly<{
  ownerAddress: string | undefined;
  mail: Readonly<{ sendTemplated(mail: Readonly<{ to: string; templateId: (typeof ALERT_TEMPLATE)[OutboundMailAlertKind]; locale: string; params: Readonly<Record<string, string>> }>): Promise<void> }>;
}>): (event: OutboundMailGateEvent) => void {
  return (event) => {
    if (event.kind === "refused") {
      console.error(`[OUTBOUND_MAIL_REFUSED] code=${event.code} class=${event.purposeClass} purpose=${event.purpose}`);
      return;
    }
    console.error(`[OUTBOUND_MAIL_ALERT] alert=${event.alert} day=${event.day} total=${String(event.total)} limit=${String(event.dailyLimit)}`);
    if (input.ownerAddress === undefined) return;
    void input.mail.sendTemplated({
      to: input.ownerAddress, templateId: ALERT_TEMPLATE[event.alert], locale: "en",
      params: { day: event.day, total: String(event.total), limit: String(event.dailyLimit) }
    }).catch(() => { console.error(`[OUTBOUND_MAIL_ALERT_MAIL_FAILED] alert=${event.alert} day=${event.day}`); });
  };
}
