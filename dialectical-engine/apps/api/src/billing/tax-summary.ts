import { exhaustive } from "@debateai/kernel";
import { microsToDecimal, type TaxStatus } from "@debateai/billing-core";
import type {
  BillingJobQueries, BillingRepository, NoticeQuarantineCursor, NoticeQuarantineRow, TaxSummaryRow
} from "@debateai/db";
import {
  taxAuthorityFor,
  type TaxAuthorities,
  type TaxAuthorityEntry,
  type TaxAuthorityRegistration,
  type TaxDueRule
} from "@debateai/register";
import { deadEmailAction, documentJobAction } from "./dead-jobs.js";

export type TaxQuarter = Readonly<{ year: number; quarter: 1 | 2 | 3 | 4; from: Date; to: Date; label: string }>;
/**
 * W12 (P2-I16): the dead job's own code, whatever it is (P16b's four were INVOICE_UNKNOWN, CREDIT_NOTE_MANUAL,
 * INVOICE_SERVICE_REFUSED and INVOICE_SERVICE_UNAVAILABLE); `documentJobAction` says what each one asks of the owner.
 */
export type InvoiceUnknownCode = string;
export type InvoiceUnknownItem = Readonly<{ chargeId: string; jobKind: string; code: InvoiceUnknownCode; since: Date }>;
/** W12 (P2-I16): an EMAIL job that died (P1b's `deadEmails`): its ref, template, recipient kind and code. */
export type DeadEmailItem = Readonly<{
  ref: string; template: string | null; recipient: string | null; code: string; since: Date;
}>;
/** N9 (spec 2026-10-05 §2.7.4 step 3): NETOPIA messages that failed verification and were kept, per UTC day. */
export type UnverifiedNoticeDay = Readonly<{ day: string; count: number }>;
/**
 * A Romanian SmartBill document issued by the quarter's end, in it or earlier (P2-M24), whose e-Factura acceptance is
 * not recorded (`status`: the latest one).
 */
export type EFacturaCheckItem = Readonly<{
  document: string; kind: "INVOICE" | "CREDIT_NOTE"; chargeId: string; issuedAt: Date; status: string | null;
}>;
/**
 * What the owner checks in xMoney or at the tax service: a refund xMoney refused (still owed) or one whose outcome is
 * unknown; a refund job the charge records no request for, naming a charge we do not have, or whose payload cannot be
 * read (P2-I5's REFUND_NOT_REQUESTED, with C-7's REFUND_PAYLOAD_INVALID: nothing was sent, it is no refund to make, and
 * whoever runs the server checks who queued it); a
 * refund job of a payment of the other xMoney system (P2-W4's REFUND_OTHER_SYSTEM: nothing was sent, nothing is owed on
 * this server); a second refund made elsewhere on one payment,
 * which our records cannot hold (P9c's REFUND_UNRECORDED: its amount is in no line of the summary); a withdrawal
 * handed to the owner; a renewal closed with its outcome unknown; a charge with no outcome after 30 days; R2 Q-1's
 * renewals with no charge (a dunning the tax service could not price, a plan such a dunning ended, a renewal a tax
 * refusal blocks); a subscription whose history does not fold (renewals skip it: what was its subscriber charged?).
 */
export type PaymentCheck =
  | "REFUND_REFUSED" | "REFUND_OUTCOME_UNKNOWN" | "REFUND_NOT_REQUESTED" | "REFUND_OTHER_SYSTEM" | "REFUND_UNRECORDED"
  | "WITHDRAWAL_BY_OWNER"
  | "RENEWAL_STUCK" | "PAYMENT_UNSETTLED" | "DUNNING_UNPRICED" | "ENDED_UNPRICED" | "RENEWAL_BLOCKED"
  | "SUBSCRIPTION_HISTORY_INVALID";
export type PaymentToCheckItem = Readonly<{
  what: PaymentCheck;
  /**
   * What the owner looks up: a charge ref; the refund transaction's xMoney id for REFUND_UNRECORDED; the owner ref
   * that `pnpm billing:withdraw --owner` takes for WITHDRAWAL_BY_OWNER; the subscription id for DUNNING_UNPRICED,
   * ENDED_UNPRICED, RENEWAL_BLOCKED and SUBSCRIPTION_HISTORY_INVALID.
   */
  ref: string;
  /**
   * A dead refund's reason (a WITHDRAWAL refund is due within 14 days of the withdrawal), or the code a charge-less
   * attempt names (TAX_SERVICE_UNAVAILABLE: the tax service could not price it; RETRY_TOTAL_CHANGED: P2-M10's retry
   * priced afresh at a total other than the announced one, so nothing was charged); else null. Null for
   * REFUND_NOT_REQUESTED and REFUND_OTHER_SYSTEM: no recorded request was checked, so its payload's reason is only what
   * the job claimed.
   */
  reason: string | null;
  since: Date;
}>;
export type TaxSummaryLine = Readonly<{
  taxCountry: string;
  taxRegion: string | null;
  scheme: string | null;
  authority: TaxAuthorityEntry | null;
  netMicros: number;
  taxMicros: number;
  sales: number;
  /** Refunds subtracted above (their amount is known). */
  refunds: number;
  /**
   * Dashboard refunds of unknown amount on this line's charges: NOT subtracted, listed in `TaxSummary.unknownRefunds`.
   * Not a payment refunded before its plan started (a REFUNDED_BEFORE_START line, Part 4 final review C-5): no credit
   * note is owed for it, and its own line is its only instruction.
   */
  unknownRefunds: number;
  statusCounts: Readonly<Record<TaxStatus, number>>;
}>;
/** A refund made in the xMoney dashboard whose amount our rows cannot know; `upToMicros` is its upper bound. */
export type UnknownRefundItem = Readonly<{
  chargeId: string; taxCountry: string; taxRegion: string | null; upToMicros: number; at: Date;
}>;
export type TaxSummary = Readonly<{
  quarter: TaxQuarter;
  authorities: TaxAuthorities;
  lines: ReadonlyArray<TaxSummaryLine>;
  conflicting: ReadonlyArray<Readonly<{ chargeId: string; taxCountry: string; at: Date }>>;
  notRegistered: ReadonlyArray<Readonly<{ chargeId: string; taxCountry: string; taxRegion: string | null; at: Date }>>;
  /**
   * `saleRecorded` false (Part 4 final review C-19): the charge holds no SUCCEEDED (a checkout charged back before we
   * verified it), so no sale was ever counted for it.
   */
  chargebacks: ReadonlyArray<Readonly<{ chargeId: string; taxCountry: string; amountMicros: number; at: Date; saleRecorded: boolean }>>;
  /**
   * Not subtracted from any line: the owner reads each amount in the dashboard, records its credit note with
   * `--amount`, and until then adjusts that country by hand. Never a charge with a REFUNDED_BEFORE_START line (C-5).
   */
  unknownRefunds: ReadonlyArray<UnknownRefundItem>;
  /**
   * `invoiceUnknownItems`' lines, every kind in every quarter, except a REFUNDED_BEFORE_START line, which only the
   * quarter holding its charge's SALE prints (C-5): the quarter whose figures its words ask to correct.
   */
  invoiceUnknown: ReadonlyArray<InvoiceUnknownItem>;
  efactura: ReadonlyArray<EFacturaCheckItem>;
  paymentsToCheck: ReadonlyArray<PaymentToCheckItem>;
  deadEmails: ReadonlyArray<DeadEmailItem>;
  unverifiedNotices: ReadonlyArray<UnverifiedNoticeDay>;
  sales: number;
  refunds: number;
}>;

const QUARTER_TEXT = /^([0-9]{4})-Q([1-4])$/u;

export function parseTaxQuarter(text: string): TaxQuarter {
  const match = QUARTER_TEXT.exec(text);
  if (match === null) throw new TypeError("BILLING_TAX_SUMMARY_USAGE");
  const year = Number(match[1]);
  const quarter = Number(match[2]) as 1 | 2 | 3 | 4;
  return Object.freeze({
    year, quarter, label: text,
    from: new Date(Date.UTC(year, 3 * (quarter - 1), 1)),
    to: new Date(Date.UTC(year, 3 * quarter, 1))
  });
}

/** The quarter that ended most recently before `now` (UTC). */
export function lastEndedQuarter(now: Date): TaxQuarter {
  const current = Math.floor(now.getUTCMonth() / 3) + 1;
  const year = current === 1 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
  return parseTaxQuarter(`${String(year)}-Q${String(current === 1 ? 4 : current - 1)}`);
}

/** A due rule's dates for one quarter: one date for a quarterly return, one per month for a monthly one. */
export function dueDatesFor(rule: TaxDueRule, quarter: TaxQuarter): readonly Date[] {
  const firstMonth = 3 * (quarter.quarter - 1);
  switch (rule.rule) {
    case "QUARTER_FOLLOWING_MONTH_END":
      return [new Date(Date.UTC(quarter.year, firstMonth + 4, 0))];
    case "FOLLOWING_MONTH_DAY":
      // One payment per month of the quarter, each in the month that follows it. (Spelled with `Array.from`, not an
      // array of 1..3: S1-1's depth contract reads such a literal run as a second definition of the depth ceiling.)
      return Array.from({ length: 3 }, (_, month) => new Date(Date.UTC(quarter.year, firstMonth + month + 1, rule.day)));
    case "NONE":
      return [];
    default:
      return exhaustive(rule);
  }
}

/**
 * The quarter's tax rows of the LIVE NETOPIA system only (ruling PR-21). `quarterSummaryRows` takes the payment system
 * because the sandbox and live share one database across the switch, and a sandbox payment is never a sale. The
 * command and O1 both read the rows through here, so neither can count a sandbox payment (a host still on the sandbox
 * prints no sales).
 */
export function liveQuarterSummaryRows(
  billing: Pick<BillingRepository, "quarterSummaryRows">, from: Date, to: Date
): Promise<TaxSummaryRow[]> {
  return billing.quarterSummaryRows(from, to, { provider: "netopia", environment: "live" });
}

/**
 * The Romanian e-Factura documents ANAF has not accepted (P10b's `smartBillDocumentsNotAccepted`: the latest status is
 * not ACCEPTED) issued before `before`, the quarter's end: P2-M24, the quarter's and every earlier quarter's, so a
 * document rejected or unanswered in one quarter stays on the next summary until its ACCEPTED is recorded. Each is
 * named by the series and number SmartBill printed on it — what the owner types into
 * `pnpm billing:efactura-status --invoice`.
 */
export async function efacturaChecksFrom(
  jobs: Pick<BillingJobQueries, "smartBillDocumentsNotAccepted">, before: Date
): Promise<EFacturaCheckItem[]> {
  return (await jobs.smartBillDocumentsNotAccepted(before)).map((document): EFacturaCheckItem => Object.freeze({
    document: document.series === null ? document.number : `${document.series}-${document.number}`,
    kind: document.kind, chargeId: document.chargeId, issuedAt: document.at, status: document.status
  }));
}

/**
 * Every payment list the owner acts on, as the summary shows it (the CLI and O1 share it): dead refunds (P14a),
 * second refunds made elsewhere that P9c could not record (its dead REFUND_UNRECORDED checks) of the last 120 days,
 * withdrawals handed to the owner (P14c), stuck renewals of the last 120 days (as far back as A10's charge-back and
 * refund listings reach), charges with no outcome after 30 days (P14a), R2 Q-1's renewals with no charge (a dunning
 * still running, or ended in the same 120 days; a renewal a tax refusal blocks now), and subscriptions whose history
 * does not fold (D5 5d).
 */
export async function paymentsToCheckFrom(
  billing: Pick<BillingRepository,
    | "deadRefunds" | "unrecordedRefunds" | "withdrawalsAwaitingOwner" | "stuckRenewals" | "longUnsettledCharges"
    | "chargelessDunning" | "blockedRenewals" | "unfoldableSubscriptions">,
  now: Date
): Promise<PaymentToCheckItem[]> {
  const dayMs = 86_400_000;
  const lookBack = new Date(now.getTime() - 120 * dayMs);
  const refunds = (await billing.deadRefunds()).map((item): PaymentToCheckItem => {
    const what = deadRefundCheck(item.code);
    const claimedOnly = what === "REFUND_NOT_REQUESTED" || what === "REFUND_OTHER_SYSTEM";
    return Object.freeze({ what, ref: item.chargeId, reason: claimedOnly ? null : item.reason, since: item.since });
  });
  const unrecorded = (await billing.unrecordedRefunds(lookBack)).map((item): PaymentToCheckItem => Object.freeze({
    what: "REFUND_UNRECORDED", ref: item.transactionId, reason: null, since: item.since
  }));
  const withdrawals = (await billing.withdrawalsAwaitingOwner()).map((item): PaymentToCheckItem => Object.freeze({
    what: "WITHDRAWAL_BY_OWNER", ref: item.ownerRef, reason: null, since: item.since
  }));
  const stuck = (await billing.stuckRenewals(lookBack)).map((item): PaymentToCheckItem =>
    Object.freeze({ what: "RENEWAL_STUCK", ref: item.chargeId, reason: null, since: item.since }));
  const unsettled = (await billing.longUnsettledCharges(["UPGRADE", "RENEWAL"], new Date(now.getTime() - 30 * dayMs)))
    .map((item): PaymentToCheckItem => Object.freeze({
      what: "PAYMENT_UNSETTLED", ref: item.chargeId, reason: null, since: item.createdAt
    }));
  const chargeless = (await billing.chargelessDunning(lookBack)).map((item): PaymentToCheckItem => Object.freeze({
    what: item.ended ? "ENDED_UNPRICED" : "DUNNING_UNPRICED", ref: item.subscriptionId, reason: item.reason,
    since: item.since
  }));
  const blocked = (await billing.blockedRenewals(now)).map((item): PaymentToCheckItem => Object.freeze({
    what: "RENEWAL_BLOCKED", ref: item.subscriptionId, reason: null, since: item.since
  }));
  const unfoldable = (await billing.unfoldableSubscriptions()).map((item): PaymentToCheckItem => Object.freeze({
    what: "SUBSCRIPTION_HISTORY_INVALID", ref: item.subscriptionId, reason: null, since: item.since
  }));
  return [...refunds, ...unrecorded, ...withdrawals, ...stuck, ...unsettled, ...chargeless, ...blocked, ...unfoldable];
}

/** W12 (P2-I16): the emails that died in the last 120 days (the same reach as the payment lists above). */
export async function deadEmailsFrom(
  billing: Pick<BillingRepository, "deadEmails">, now: Date
): Promise<DeadEmailItem[]> {
  return (await billing.deadEmails(new Date(now.getTime() - 120 * 86_400_000))).map((item) => Object.freeze({ ...item }));
}

/** Ruling PR-30's page, as the start's re-check reads it: a flood of kept messages is never read at once. */
const QUARANTINE_PAGE_ROWS = 500;

/**
 * N9: the quarantine of the last 14 days (its whole life), counted by the UTC day it arrived. Read in keyset pages of
 * at most 500 rows (ruling PR-30) until a short page.
 */
export async function unverifiedNoticeDaysFrom(
  billing: Pick<BillingRepository, "withTransaction" | "quarantineSince">, now: Date
): Promise<UnverifiedNoticeDay[]> {
  const since = new Date(now.getTime() - 14 * 86_400_000);
  const counts = new Map<string, number>();
  let after: NoticeQuarantineCursor | null = null;
  for (;;) {
    const cursor = after;
    const rows: ReadonlyArray<NoticeQuarantineRow> = await billing.withTransaction((client) =>
      billing.quarantineSince(client, since, { after: cursor, limit: QUARANTINE_PAGE_ROWS }));
    for (const row of rows) {
      const day = row.receivedAt.toISOString().slice(0, 10);
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    const last = rows.at(-1);
    if (rows.length < QUARANTINE_PAGE_ROWS || last === undefined) break;
    after = Object.freeze({ receivedAt: last.receivedAt, quarantineId: last.quarantineId });
  }
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, count]) => Object.freeze({ day, count }));
}

/**
 * Which list a dead XMONEY_REFUND job goes on, by its dead-letter code (an open set of strings). REFUND_NOT_REQUESTED
 * (P2-I5) and REFUND_CHARGE_MISSING (P2-W4: the job names a charge we do not have) moved no money and are no refund to
 * make; REFUND_PAYLOAD_INVALID (Part 4 final review C-7) ended before any xMoney call, and only a row written by
 * something other than `RefundDesk.request` holds an unreadable payload, so it goes with them: its reason is only the
 * job's claim, and REFUND_NOT_REQUESTED's legend sends the owner to the charge's own refund requests (one never
 * refunded is still owed, progress.md's P4-B ruling); OTHER_XMONEY_SYSTEM (P2-W4) moved none and is owed nothing on
 * this server; every other dead end leaves the money owed.
 */
function deadRefundCheck(
  code: string | null
): "REFUND_REFUSED" | "REFUND_OUTCOME_UNKNOWN" | "REFUND_NOT_REQUESTED" | "REFUND_OTHER_SYSTEM" {
  switch (code) {
    case "REFUND_OUTCOME_UNKNOWN":
      return "REFUND_OUTCOME_UNKNOWN";
    case "REFUND_NOT_REQUESTED":
    case "REFUND_CHARGE_MISSING":
    case "REFUND_PAYLOAD_INVALID":
      return "REFUND_NOT_REQUESTED";
    case "OTHER_XMONEY_SYSTEM":
      return "REFUND_OTHER_SYSTEM";
    default:
      return "REFUND_REFUSED";
  }
}

/** How a payment line names what the owner looks up. */
function subjectOf(item: PaymentToCheckItem): string {
  switch (item.what) {
    case "REFUND_UNRECORDED":
      return `xMoney transaction ${item.ref}`;
    case "WITHDRAWAL_BY_OWNER":
      return `owner ${item.ref}`;
    case "DUNNING_UNPRICED":
    case "ENDED_UNPRICED":
    case "RENEWAL_BLOCKED":
    case "SUBSCRIPTION_HISTORY_INVALID":
      return `subscription ${item.ref}`;
    case "REFUND_REFUSED":
    case "REFUND_OUTCOME_UNKNOWN":
    case "REFUND_NOT_REQUESTED":
    case "REFUND_OTHER_SYSTEM":
    case "RENEWAL_STUCK":
    case "PAYMENT_UNSETTLED":
      return `charge ${item.ref}`;
    default:
      return exhaustive(item.what);
  }
}

/** `amount × part ÷ whole`, floored to whole cents, exactly (bigint). */
function shareInCents(amount: number, part: number, whole: number): number {
  if (whole <= 0) return 0;
  const micros = (BigInt(amount) * BigInt(part)) / BigInt(whole);
  return Number(micros - micros % 10_000n);
}

const zeroCounts = (): Record<TaxStatus, number> => ({ TAXABLE: 0, NON_TAXABLE: 0, NOT_REGISTERED: 0, REVERSE_CHARGE: 0 });

export function buildTaxSummary(input: Readonly<{
  quarter: TaxQuarter; rows: ReadonlyArray<TaxSummaryRow>; invoiceUnknown: ReadonlyArray<InvoiceUnknownItem>;
  efactura: ReadonlyArray<EFacturaCheckItem>; paymentsToCheck: ReadonlyArray<PaymentToCheckItem>;
  deadEmails: ReadonlyArray<DeadEmailItem>;
  unverifiedNotices?: ReadonlyArray<UnverifiedNoticeDay>;
  authorities: TaxAuthorities;
}>): TaxSummary {
  type Working = { taxCountry: string; taxRegion: string | null; authority: TaxAuthorityEntry | null;
    netMicros: number; taxMicros: number; sales: number; refunds: number; unknownRefunds: number;
    statusCounts: Record<TaxStatus, number> };
  const groups = new Map<string, Working>();
  const conflicting: Array<TaxSummary["conflicting"][number]> = [];
  const notRegistered: Array<TaxSummary["notRegistered"][number]> = [];
  const chargebacks: Array<TaxSummary["chargebacks"][number]> = [];
  const unknownRefunds: UnknownRefundItem[] = [];
  // Part 4 final review C-5: the charges `invoiceUnknownItems` names REFUNDED_BEFORE_START (P9c's never-verified path:
  // no invoice was owed, so no credit note is). That one test decides it; this list is read, never re-derived.
  const refundedBeforeStart = new Set(input.invoiceUnknown
    .filter((item) => item.jobKind === "REFUNDED_BEFORE_START").map((item) => item.chargeId));
  const soldThisQuarter = new Set(input.rows.filter((row) => row.type === "SALE").map((row) => row.chargeId));
  let sales = 0;
  let refunds = 0;
  for (const row of input.rows) {
    if (row.type === "CHARGEBACK") {
      // For the accountant: the sale stays counted where it was made; the bank took the money back. C-19: a charge-back
      // of a payment we never verified has no sale anywhere, and its line says so.
      chargebacks.push(Object.freeze({
        chargeId: row.chargeId, taxCountry: row.taxCountry, amountMicros: row.amountMicros, at: row.at,
        saleRecorded: row.saleRecorded
      }));
      continue;
    }
    if (row.type === "REFUND" && !row.amountKnown && refundedBeforeStart.has(row.chargeId)) {
      // C-5: a payment xMoney refunded before its plan started owes no credit note (A29 (q)); the 'amount unknown'
      // list asks for one via --amount, which the command refuses for it. Its REFUNDED_BEFORE_START line alone tells
      // the owner to take the sale and the refund out by hand; this row changes no figure and is listed nowhere else.
      continue;
    }
    const authority = taxAuthorityFor(input.authorities, row.taxCountry, row.taxStatus);
    const key = `${row.taxCountry}\u0000${row.taxRegion ?? ""}\u0000${authority?.scheme ?? ""}`;
    const group = groups.get(key) ?? { taxCountry: row.taxCountry, taxRegion: row.taxRegion, authority,
      netMicros: 0, taxMicros: 0, sales: 0, refunds: 0, unknownRefunds: 0, statusCounts: zeroCounts() };
    if (row.type === "SALE") {
      group.netMicros += row.chargeNetMicros;
      group.taxMicros += row.chargeTaxMicros;
      group.sales += 1;
      group.statusCounts[row.taxStatus] += 1;
      sales += 1;
      if (row.locationVerdict === "CONFLICTING") conflicting.push(Object.freeze({ chargeId: row.chargeId, taxCountry: row.taxCountry, at: row.at }));
      if (row.taxStatus === "NOT_REGISTERED") {
        notRegistered.push(Object.freeze({ chargeId: row.chargeId, taxCountry: row.taxCountry, taxRegion: row.taxRegion, at: row.at }));
      }
    } else if (!row.amountKnown) {
      // P9c's dashboard refund on the payment itself: `amountMicros` is only an upper bound. Subtracting it would
      // understate this country's sales and tax; it is listed for the owner instead, and changes no figure. (A charge
      // refunded before its plan started never reaches here: see the C-5 skip above.)
      unknownRefunds.push(Object.freeze({
        chargeId: row.chargeId, taxCountry: row.taxCountry, taxRegion: row.taxRegion, upToMicros: row.amountMicros, at: row.at
      }));
      group.unknownRefunds += 1;
    } else {
      const taxBack = shareInCents(row.amountMicros, row.chargeTaxMicros, row.chargeTotalMicros);
      group.taxMicros -= taxBack;
      group.netMicros -= row.amountMicros - taxBack;
      group.refunds += 1;
      refunds += 1;
    }
    groups.set(key, group);
  }
  const countryName = new Intl.DisplayNames(["en"], { type: "region" });
  const lines = [...groups.values()]
    .sort((left, right) => (countryName.of(left.taxCountry) ?? left.taxCountry).localeCompare(countryName.of(right.taxCountry) ?? right.taxCountry)
      || (left.taxRegion ?? "").localeCompare(right.taxRegion ?? "")
      || (left.authority?.scheme ?? "").localeCompare(right.authority?.scheme ?? ""))
    .map((group) => Object.freeze({
      taxCountry: group.taxCountry, taxRegion: group.taxRegion, scheme: group.authority?.scheme ?? null,
      authority: group.authority, netMicros: group.netMicros, taxMicros: group.taxMicros,
      sales: group.sales, refunds: group.refunds, unknownRefunds: group.unknownRefunds,
      statusCounts: Object.freeze({ ...group.statusCounts })
    }));
  return Object.freeze({
    quarter: input.quarter, authorities: input.authorities, lines: Object.freeze(lines),
    conflicting: Object.freeze(conflicting), notRegistered: Object.freeze(notRegistered),
    chargebacks: Object.freeze(chargebacks), unknownRefunds: Object.freeze(unknownRefunds),
    // C-5: a REFUNDED_BEFORE_START line belongs to its sale's quarter (quarterSummaryRows dates the SALE when the money
    // moved, and keeps only one xMoney system's charges); every other line prints in every quarter.
    invoiceUnknown: Object.freeze(input.invoiceUnknown.filter((item) =>
      item.jobKind !== "REFUNDED_BEFORE_START" || soldThisQuarter.has(item.chargeId))),
    efactura: Object.freeze([...input.efactura]), paymentsToCheck: Object.freeze([...input.paymentsToCheck]),
    deadEmails: Object.freeze([...input.deadEmails]),
    unverifiedNotices: Object.freeze([...(input.unverifiedNotices ?? [])]),
    sales, refunds
  });
}

function statusWords(status: TaxStatus): string {
  switch (status) {
    case "TAXABLE": return "tax collected";
    case "NON_TAXABLE": return "not taxable";
    case "NOT_REGISTERED": return "not registered, no tax collected";
    case "REVERSE_CHARGE": return "reverse charge, no tax collected";
    default: return exhaustive(status);
  }
}

/** Spec §1.4 "whether we are registered there", in the words the owner reads. */
function registrationWords(registration: TaxAuthorityRegistration | null): string {
  if (registration === null) return "unknown; ask the accountant";
  switch (registration) {
    case "REGISTERED": return "registered";
    case "FROM_FIRST_SALE": return "needed from the first sale";
    case "AFTER_THRESHOLD": return "needed only after the threshold";
    default: return exhaustive(registration);
  }
}

const plural = (count: number, one: string, many: string): string => `${String(count)} ${count === 1 ? one : many}`;
const longDate = (date: Date): string =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
const isoDay = (date: Date): string => date.toISOString().slice(0, 10);

function listOf(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)!}`;
}

/**
 * W12 fix I-1: how much of the summary one email holds. O1 is one `block` param, and a block holds at most 65,536
 * characters (packages/mail-templates/src/render.ts), so a text over it makes the send throw and O1 die, in exactly
 * the mass failure (a Quaderno outage, a revoked key, a relay outage) whose lines it should carry. O1 prints at most
 * `itemsPerSection` lines of each list (then "and N more", with the command that prints them all), and as the last
 * bound cuts the whole text at a line boundary under `maxChars` with a closing line saying so. The command prints
 * everything (no limit).
 */
export type TaxSummaryLimit = Readonly<{ itemsPerSection: number; maxChars: number }>;

/** The O1 text and the command's output: amounts, countries, codes and our own charge ids; never a person. */
export function renderTaxSummary(summary: TaxSummary, limit: TaxSummaryLimit | null = null): string {
  const { quarter } = summary;
  const countryName = new Intl.DisplayNames(["en"], { type: "region" });
  const out: string[] = [
    `DebateAI tax summary for ${quarter.label} (${longDate(quarter.from)} to ${longDate(new Date(quarter.to.getTime() - 86_400_000))}, UTC)`,
    `From our own records: ${plural(summary.sales, "sale", "sales")} and ${plural(summary.refunds, "refund", "refunds")}.`
      + " Amounts are US dollars; one block per country or state and tax scheme.",
    ""
  ];
  for (const line of summary.lines) {
    const place = `${countryName.of(line.taxCountry) ?? line.taxCountry}${line.taxRegion === null ? "" : `, ${line.taxRegion}`}`;
    out.push(`${place}${line.scheme === null ? "" : ` (${line.scheme})`}`);
    out.push(`  Net sales ${microsToDecimal(line.netMicros)} USD, tax collected ${microsToDecimal(line.taxMicros)} USD,`
      + ` from ${plural(line.sales, "sale", "sales")} and ${plural(line.refunds, "refund", "refunds")}.`);
    if (line.unknownRefunds > 0) {
      out.push(`  Not subtracted: ${plural(line.unknownRefunds, "refund", "refunds")} made in the xMoney dashboard,`
        + " amount unknown (listed below).");
    }
    const statuses = (Object.entries(line.statusCounts) as Array<[TaxStatus, number]>)
      .filter(([, count]) => count > 0).map(([status, count]) => `${statusWords(status)}: ${String(count)}`);
    if (statuses.length > 0) out.push(`  Quaderno status: ${statuses.join("; ")}.`);
    out.push(`  Registration: ${registrationWords(line.authority?.registration ?? null)}.`);
    out.push(`  Where to pay: ${line.authority?.where ?? summary.authorities.fallback.where}`);
    out.push(`  When: ${line.authority?.when ?? summary.authorities.fallback.when}`);
    const dates = line.authority === null ? [] : dueDatesFor(line.authority.due, quarter);
    if (dates.length > 0) out.push(`  For ${quarter.label}: ${listOf(dates.map(longDate))}.`);
    out.push("");
  }
  const fullCommand = `pnpm billing:tax-summary --quarter ${quarter.label}`;
  /** Prints a list's lines (at most `limit.itemsPerSection` of them) and hands back the lines it printed. */
  const section = <T>(items: ReadonlyArray<T>, empty: string, heading: string, lineOf: (item: T) => string): ReadonlyArray<T> => {
    if (items.length === 0) {
      out.push(empty);
      return items;
    }
    out.push(heading);
    const shown = limit === null ? items : items.slice(0, limit.itemsPerSection);
    for (const item of shown) out.push(`  - ${lineOf(item)}`);
    if (shown.length < items.length) {
      out.push(`  - and ${String(items.length - shown.length)} more: run ${fullCommand} on the host for the whole list`);
    }
    return shown;
  };
  /**
   * W12 fix I-1: what to do is said once per kind of line, below its list, never on every line (a mass failure lists
   * hundreds of lines of one kind; each action is about 400 characters with its command lines).
   */
  const legend = <T>(shown: ReadonlyArray<T>, keyOf: (item: T) => string, actionOf: (item: T) => string): void => {
    const actions = new Map<string, string>();
    for (const item of shown) {
      const key = keyOf(item);
      if (!actions.has(key)) actions.set(key, actionOf(item));
    }
    if (actions.size === 0) return;
    out.push("  What to do:");
    for (const [key, action] of actions) out.push(`  * ${key}: ${action}`);
  };
  section(summary.conflicting, "Charges with conflicting location evidence: none.",
    "Charges with conflicting location evidence (taxed at the declared country; for the accountant):",
    (item) => `charge ${item.chargeId}, declared ${item.taxCountry}, on ${isoDay(item.at)}`);
  section(summary.notRegistered, "Sales where we are not registered: none.",
    "Sales where we are not registered (no tax collected; for the accountant):",
    (item) => `charge ${item.chargeId}, ${item.taxCountry}${item.taxRegion === null ? "" : `, ${item.taxRegion}`}, on ${isoDay(item.at)}`);
  section(summary.chargebacks, "Charge-backs this quarter: none.",
    "Charge-backs this quarter (the card holder's bank took the money back; the sale above still counts until the"
      + " accountant decides, except for a line that says no sale was recorded for it):",
    (item) => `charge ${item.chargeId}, ${item.taxCountry}, ${microsToDecimal(item.amountMicros)} USD, on ${isoDay(item.at)}`
      + (item.saleRecorded ? "" : ": no sale was recorded for it"));
  section(summary.unknownRefunds, "Refunds made in the xMoney dashboard, amount unknown: none.",
    // P4-K (P2-W12): once the owner records the credit note with its amount, `quarterSummaryRows` subtracts it.
    "Refunds made in the xMoney dashboard, amount unknown (not subtracted above; read the amount in the dashboard,"
      + " issue its credit note by hand and record it with its amount (pnpm billing:invoice --amount, as its line under"
      + " the invoices and credit notes to check by hand says), and the summary then subtracts it at that amount; until"
      + " then, adjust that country's net sales and tax by hand, at most the amount shown):",
    (item) => `charge ${item.chargeId}, ${item.taxCountry}${item.taxRegion === null ? "" : `, ${item.taxRegion}`},`
      + ` up to ${microsToDecimal(item.upToMicros)} USD, on ${isoDay(item.at)}`);
  // W12 (P2-I16, P2-I17): every dead document job, whatever its code; what to do once per job kind and code (fix I-1).
  // `pnpm billing:invoice` records a document issued or found by hand, or re-queues the job, and the line then leaves
  // the list.
  const documentKey = (item: InvoiceUnknownItem): string => `${item.jobKind} (${item.code})`;
  legend(section(summary.invoiceUnknown, "Invoices and credit notes to check by hand: none.",
    "Invoices and credit notes to check by hand in SmartBill or Quaderno (a legal document that was never issued, or"
      + " whose issuing was never confirmed; what to do is said once for each job kind and code below the list, where"
      + " <charge> stands for the line's charge; pnpm billing:invoice records a document you issued or found by hand, or"
      + " re-queues the job; a document's line stays until the document is recorded, and a payment refunded before its"
      + " plan started, which owes no document, is listed only in its sale's quarter):",
    (item) => `charge ${item.chargeId}: ${documentKey(item)}, since ${isoDay(item.since)}`),
  documentKey, (item) => documentJobAction({ chargeId: "<charge>", jobKind: item.jobKind, code: item.code }));
  // F4: the job itself is never tried again; only M3 is sent again, by the renewal (deadEmailAction says so for M3).
  const emailKey = (item: DeadEmailItem): string =>
    `${item.template ?? "unknown template"} ${item.recipient === "OWNER" ? "to you" : "to the customer"}`;
  legend(section(summary.deadEmails, "Emails that never went out: none.",
    "Emails that never went out (the last 120 days; a dead email job is not tried again, and only the notice of a"
      + " changed renewal amount, M3, is sent again, by the renewal; what each one means is said once for each email"
      + " below the list):",
    (item) => `${item.template ?? "unknown template"} (job ${item.ref}): ${item.code}, since ${isoDay(item.since)}`),
  emailKey, (item) => deadEmailAction(item.template, item.recipient));
  // N9: printed only when a NETOPIA message was kept, so a summary without any reads exactly as before.
  if (summary.unverifiedNotices.length > 0) {
    out.push("NETOPIA messages that could not be verified (kept 14 days and checked again at every API start; check the"
      + " NETOPIA key with pnpm billing:check):");
    for (const item of summary.unverifiedNotices) out.push(`  ${item.day}: ${plural(item.count, "message", "messages")}`);
  }
  section(summary.efactura, "Romanian e-Factura documents to confirm: none.",
    "Romanian e-Factura documents to confirm in SmartBill or the ANAF SPV (issued this quarter or earlier, and no"
      + " ACCEPTED status recorded yet; record ANAF's answer with pnpm billing:efactura-status --invoice"
      + " <series>-<number> --status ACCEPTED|REJECTED):",
    (item) => `${item.kind === "INVOICE" ? "invoice" : "credit note"} ${item.document} (charge ${item.chargeId}),`
      + ` issued ${isoDay(item.issuedAt)}: ${item.status === null ? "no status recorded" : `last status ${item.status}`}`);
  section(summary.paymentsToCheck, "Payments to check by hand in xMoney: none.",
    "Payments to check by hand in xMoney (REFUND_REFUSED: xMoney refused our refund, the money is still owed, refund"
      + " it from the dashboard; REFUND_OUTCOME_UNKNOWN: a partial refund whose outcome is unknown, check the"
      + " dashboard before refunding again; a WITHDRAWAL refund is due within 14 days of the withdrawal;"
      + " REFUND_NOT_REQUESTED: a refund job that matches no refund request our records hold for this payment, so"
      + " nothing was sent to xMoney and it is no refund to make; do not refund it: something able to write to the"
      + " billing database queued it, so tell whoever runs the server, who checks this charge's own refund requests"
      + " (one never refunded is still owed);"
      + " REFUND_OTHER_SYSTEM: a refund job for a payment of the other xMoney system (sandbox or live): nothing was"
      + " sent, and nothing is owed on this server;"
      + " REFUND_UNRECORDED: a second refund made in the xMoney dashboard on a payment that already had one, which our"
      + " records cannot hold, so it is in no figure above: read its amount on that transaction in the dashboard and"
      + " take it off that country's net sales and tax by hand."
      // Part 4 final review C-6: P4-K's --amount credit note is already subtracted above (quarterSummaryRows).
      + " A refund transaction of a payment whose dashboard-refund credit note is recorded is already in the figures"
      + " above: do not take it off again;"
      + " WITHDRAWAL_BY_OWNER: a withdrawal over a payment a dashboard refund touched, refund in the dashboard what the"
      + " command cannot take back, then settle it with pnpm billing:withdraw --owner <ref> --refund <amount>"
      + " --dashboard <amount refunded in the dashboard>; RENEWAL_STUCK: a renewal closed with its outcome"
      + " unknown, check whether the card was charged; PAYMENT_UNSETTLED: no outcome after 30 days;"
      + " DUNNING_UNPRICED: a renewal the tax service could not price within the 3-day quiet retry, so the payment"
      + " reminders run with nothing charged, check the tax service; ENDED_UNPRICED: such a plan ended after its last"
      + " retry day, nothing was charged; RETRY_TOTAL_CHANGED (named after DUNNING_UNPRICED or ENDED_UNPRICED): the"
      + " tax service priced a retry again, but at a total the person was never told about (a tax change), so nothing"
      + " is charged and the plan ends after its last retry day unless a later retry prices at the announced total"
      + " again; there is nothing to fix in the tax service, and the person can subscribe again at the new price;"
      + " RENEWAL_BLOCKED: the tax service refuses to price a renewal (a revoked"
      + " Quaderno key or a refused request), so nothing is charged and the person is on Free until it prices again,"
      + " fix the tax service;"
      + " SUBSCRIPTION_HISTORY_INVALID: a subscription whose records do not add up, so renewals skip it, check what its"
      + " subscriber was charged and ask the developer):",
    (item) => `${subjectOf(item)}: ${item.what}${item.reason === null ? "" : ` (${item.reason})`}, since ${isoDay(item.since)}`);
  return fitted(out, limit, fullCommand);
}

/** The text, cut at a line boundary under `limit.maxChars` with a closing line when it is longer (fix I-1). */
function fitted(lines: readonly string[], limit: TaxSummaryLimit | null, fullCommand: string): string {
  const text = `${lines.join("\n")}\n`;
  if (limit === null || text.length <= limit.maxChars) return text;
  const closing = `The summary is cut here: it is longer than one email holds. Run ${fullCommand} on the host for the whole`
    + " of it.\n";
  const kept: string[] = [];
  let length = closing.length;
  for (const line of lines) {
    if (length + line.length + 1 > limit.maxChars) break;
    kept.push(line);
    length += line.length + 1;
  }
  return `${kept.join("\n")}\n${closing}`;
}
