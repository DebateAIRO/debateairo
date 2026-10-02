import { exhaustive } from "@debateai/kernel";
import { microsToDecimal, type TaxStatus } from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository, TaxSummaryRow } from "@debateai/db";
import {
  taxAuthorityFor,
  type TaxAuthorities,
  type TaxAuthorityEntry,
  type TaxAuthorityRegistration,
  type TaxDueRule
} from "@debateai/register";

export type TaxQuarter = Readonly<{ year: number; quarter: 1 | 2 | 3 | 4; from: Date; to: Date; label: string }>;
export type InvoiceUnknownCode =
  | "INVOICE_UNKNOWN" | "CREDIT_NOTE_MANUAL" | "INVOICE_SERVICE_REFUSED" | "INVOICE_SERVICE_UNAVAILABLE";
export type InvoiceUnknownItem = Readonly<{ chargeId: string; jobKind: string; code: InvoiceUnknownCode; since: Date }>;
/** A Romanian SmartBill document of the quarter whose e-Factura acceptance is not recorded (`status`: the latest one). */
export type EFacturaCheckItem = Readonly<{
  document: string; kind: "INVOICE" | "CREDIT_NOTE"; chargeId: string; issuedAt: Date; status: string | null;
}>;
/**
 * What the owner checks in xMoney or at the tax service: a refund xMoney refused (still owed) or one whose outcome is
 * unknown; a refund job the charge records no request for (P2-I5's REFUND_NOT_REQUESTED: nothing was sent, it is no
 * refund to make, and whoever runs the server checks who queued it); a second refund made elsewhere on one payment,
 * which our records cannot hold (P9c's REFUND_UNRECORDED: its amount is in no line of the summary); a withdrawal
 * handed to the owner; a renewal closed with its outcome unknown; a charge with no outcome after 30 days; R2 Q-1's
 * renewals with no charge (a dunning the tax service could not price, a plan such a dunning ended, a renewal a tax
 * refusal blocks); a subscription whose history does not fold (renewals skip it: what was its subscriber charged?).
 */
export type PaymentCheck =
  | "REFUND_REFUSED" | "REFUND_OUTCOME_UNKNOWN" | "REFUND_NOT_REQUESTED" | "REFUND_UNRECORDED" | "WITHDRAWAL_BY_OWNER"
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
   * attempt names (TAX_SERVICE_UNAVAILABLE); else null. Null for REFUND_NOT_REQUESTED: its payload's reason is only
   * what the job claimed.
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
  /** Dashboard refunds of unknown amount on this line's charges: NOT subtracted, listed in `TaxSummary.unknownRefunds`. */
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
  chargebacks: ReadonlyArray<Readonly<{ chargeId: string; taxCountry: string; amountMicros: number; at: Date }>>;
  /** Not subtracted from any line: the owner reads each amount in the dashboard and adjusts that country by hand. */
  unknownRefunds: ReadonlyArray<UnknownRefundItem>;
  invoiceUnknown: ReadonlyArray<InvoiceUnknownItem>;
  efactura: ReadonlyArray<EFacturaCheckItem>;
  paymentsToCheck: ReadonlyArray<PaymentToCheckItem>;
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
 * The quarter's tax rows of the LIVE xMoney system only. D5's `quarterSummaryRows` takes the system because stage and
 * live share one database across the switch, and a sandbox payment is never a sale. The command and O1 both read
 * the rows through here, so neither can count a sandbox payment (a host still on the sandbox prints no sales).
 */
export function liveQuarterSummaryRows(
  billing: Pick<BillingRepository, "quarterSummaryRows">, from: Date, to: Date
): Promise<TaxSummaryRow[]> {
  return billing.quarterSummaryRows(from, to, "live");
}

/**
 * The quarter's Romanian e-Factura documents ANAF has not accepted (P10b's `smartBillDocumentsNotAccepted`: the
 * latest status is not ACCEPTED), each named by the series and number SmartBill printed on it — what the owner types
 * into `pnpm billing:efactura-status --invoice`.
 */
export async function efacturaChecksFrom(
  jobs: Pick<BillingJobQueries, "smartBillDocumentsNotAccepted">, from: Date, to: Date
): Promise<EFacturaCheckItem[]> {
  return (await jobs.smartBillDocumentsNotAccepted(from, to)).map((document): EFacturaCheckItem => Object.freeze({
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
    return Object.freeze({ what, ref: item.chargeId, reason: what === "REFUND_NOT_REQUESTED" ? null : item.reason, since: item.since });
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

/**
 * Which list a dead XMONEY_REFUND job goes on, by its dead-letter code (an open set of strings). REFUND_NOT_REQUESTED
 * (P2-I5) moved no money and is no refund to make; every other dead end leaves the money owed.
 */
function deadRefundCheck(code: string | null): "REFUND_REFUSED" | "REFUND_OUTCOME_UNKNOWN" | "REFUND_NOT_REQUESTED" {
  switch (code) {
    case "REFUND_OUTCOME_UNKNOWN":
      return "REFUND_OUTCOME_UNKNOWN";
    case "REFUND_NOT_REQUESTED":
      return "REFUND_NOT_REQUESTED";
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
  let sales = 0;
  let refunds = 0;
  for (const row of input.rows) {
    if (row.type === "CHARGEBACK") {
      // For the accountant: the sale stays counted where it was made; the bank took the money back.
      chargebacks.push(Object.freeze({ chargeId: row.chargeId, taxCountry: row.taxCountry, amountMicros: row.amountMicros, at: row.at }));
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
      // understate this country's sales and tax; it is listed for the owner instead, and changes no figure.
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
    invoiceUnknown: Object.freeze([...input.invoiceUnknown]),
    efactura: Object.freeze([...input.efactura]), paymentsToCheck: Object.freeze([...input.paymentsToCheck]), sales, refunds
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

/** The O1 text and the command's output: amounts, countries, codes and our own charge ids; never a person. */
export function renderTaxSummary(summary: TaxSummary): string {
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
  const section = <T>(items: ReadonlyArray<T>, empty: string, heading: string, lineOf: (item: T) => string): void => {
    if (items.length === 0) {
      out.push(empty);
      return;
    }
    out.push(heading);
    for (const item of items) out.push(`  - ${lineOf(item)}`);
  };
  section(summary.conflicting, "Charges with conflicting location evidence: none.",
    "Charges with conflicting location evidence (taxed at the declared country; for the accountant):",
    (item) => `charge ${item.chargeId}, declared ${item.taxCountry}, on ${isoDay(item.at)}`);
  section(summary.notRegistered, "Sales where we are not registered: none.",
    "Sales where we are not registered (no tax collected; for the accountant):",
    (item) => `charge ${item.chargeId}, ${item.taxCountry}${item.taxRegion === null ? "" : `, ${item.taxRegion}`}, on ${isoDay(item.at)}`);
  section(summary.chargebacks, "Charge-backs this quarter: none.",
    "Charge-backs this quarter (the card holder's bank took the money back; the sale above still counts until the"
      + " accountant decides):",
    (item) => `charge ${item.chargeId}, ${item.taxCountry}, ${microsToDecimal(item.amountMicros)} USD, on ${isoDay(item.at)}`);
  section(summary.unknownRefunds, "Refunds made in the xMoney dashboard, amount unknown: none.",
    "Refunds made in the xMoney dashboard, amount unknown (not subtracted above; read the amount in the dashboard and"
      + " adjust that country's net sales and tax by hand, at most the amount shown):",
    (item) => `charge ${item.chargeId}, ${item.taxCountry}${item.taxRegion === null ? "" : `, ${item.taxRegion}`},`
      + ` up to ${microsToDecimal(item.upToMicros)} USD, on ${isoDay(item.at)}`);
  section(summary.invoiceUnknown, "Invoices and credit notes to check by hand: none.",
    "Invoices and credit notes to check by hand in SmartBill or Quaderno (INVOICE_UNKNOWN: the issuer never"
      + " confirmed it; INVOICE_SERVICE_REFUSED / INVOICE_SERVICE_UNAVAILABLE: SmartBill never issued the Romanian"
      + " invoice or storno, issue it by hand; CREDIT_NOTE_MANUAL: a partial credit note to issue by hand, and for"
      + " DASHBOARD_REFUND the refund made in the xMoney dashboard, whose amount only the dashboard shows):",
    (item) => `charge ${item.chargeId}: ${item.jobKind} (${item.code}), since ${isoDay(item.since)}`);
  section(summary.efactura, "Romanian e-Factura documents to confirm: none.",
    "Romanian e-Factura documents to confirm in SmartBill or the ANAF SPV (issued this quarter, and no ACCEPTED status"
      + " recorded yet; record ANAF's answer with pnpm billing:efactura-status --invoice <series>-<number> --status"
      + " ACCEPTED|REJECTED):",
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
      + " REFUND_UNRECORDED: a second refund made in the xMoney dashboard on a payment that already had one, which our"
      + " records cannot hold, so it is in no figure above: read its amount on that transaction in the dashboard and"
      + " take it off that country's net sales and tax by hand;"
      + " WITHDRAWAL_BY_OWNER: a withdrawal over a payment a dashboard refund touched, refund in the dashboard what the"
      + " command cannot take back, then settle it with pnpm billing:withdraw --owner <ref> --refund <amount>"
      + " --dashboard <amount refunded in the dashboard>; RENEWAL_STUCK: a renewal closed with its outcome"
      + " unknown, check whether the card was charged; PAYMENT_UNSETTLED: no outcome after 30 days;"
      + " DUNNING_UNPRICED: a renewal the tax service could not price within the 3-day quiet retry, so the payment"
      + " reminders run with nothing charged, check the tax service; ENDED_UNPRICED: such a plan ended after its last"
      + " retry day, nothing was charged; RENEWAL_BLOCKED: the tax service refuses to price a renewal (a revoked"
      + " Quaderno key or a refused request), so nothing is charged and the person is on Free until it prices again,"
      + " fix the tax service;"
      + " SUBSCRIPTION_HISTORY_INVALID: a subscription whose records do not add up, so renewals skip it, check what its"
      + " subscriber was charged and ask the developer):",
    (item) => `${subjectOf(item)}: ${item.what}${item.reason === null ? "" : ` (${item.reason})`}, since ${isoDay(item.since)}`);
  return `${out.join("\n")}\n`;
}
