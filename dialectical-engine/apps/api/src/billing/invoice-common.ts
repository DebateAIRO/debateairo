import { computeWindows, type RefundRecord, type SaleRecord } from "@debateai/billing-core";
import type {
  BillingRepository, ChargeEventRow, ChargeRow, CustomerXMoneyEnvironment, InvoiceRow, OutboxJob, QuoteRow
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { BillingPolicy, PlanId } from "@debateai/register";
import type { BillingRecipientReader } from "./account-email.js";
import type { BillingAudit } from "./audit.js";
import { englishOrderText, invoiceDate, planName, type BillingOrderText } from "./order-text.js";
import { DONE, failureRetryAt, otherXMoneySystem, type OutboxOutcome } from "./outbox.js";
import { openBillingProfile, openQuoteLocation, type BillingProfile, type QuoteLocation } from "./records.js";
import { refundTarget } from "./rows.js";

export type InvoiceJobDeps = Readonly<{
  repository: Pick<BillingRepository,
    | "charge" | "quote" | "customerByOwner" | "latestProfile" | "invoicesForOwner" | "subscriptionEvents"
    | "insertInvoice" | "insertInvoiceIntent" | "enqueue" | "withTransaction">;
  recordsKey: Buffer;
  /**
   * W8 (P2-I12): the address an invoice is issued to (and Quaderno or SmartBill deliver it to) is the account's current
   * one when the document is issued; the profile's only after the account is erased.
   */
  recipients: BillingRecipientReader;
  policy: BillingPolicy;
  /** R-7: `BillingConnectors.publicAppUrl`. */
  publicAppUrl: string;
  /** P8c's order-text port for the invoice line; absent = `englishOrderText` until P17/P18's sentences exist. */
  orderText?: BillingOrderText;
  /**
   * P2-I4 (D5 5h): the connectors' xMoney system. The invoicers follow it (P23's rules), so a document is issued only
   * for a charge paid in this system: a sandbox payment never becomes a live fiscal invoice or OSS record.
   */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
}>;

/**
 * P2-I4 (D5 5h): the outcome of a job whose charge was paid in the other xMoney system (DEAD, one audit line), read
 * before anything else the job does; null when the charge is this system's, or missing (the job's own check answers).
 */
export async function otherSystemOutcome(
  deps: Pick<InvoiceJobDeps, "repository" | "xmoneyEnvironment"> & Readonly<{ audit: BillingAudit }>, job: OutboxJob,
  chargeId: string
): Promise<OutboxOutcome | null> {
  const charge = await deps.repository.charge(chargeId);
  return charge !== null && charge.xmoneyEnvironment !== deps.xmoneyEnvironment
    ? otherXMoneySystem(deps.audit, job.kind) : null;
}

export type PaidCharge = Readonly<{
  charge: ChargeRow & { events: ChargeEventRow[] };
  paid: ChargeEventRow;
  ownerRef: string;
  customerId: string;
  quote: QuoteRow;
  location: QuoteLocation;
  /** The latest billing profile, its `email` replaced by the account's current address (W8) while the account exists. */
  profile: BillingProfile;
  /** The service period the payment bought: the invoice prints it (see "What the invoice says"). */
  period: Readonly<{ start: Date; end: Date }>;
}>;

/**
 * The period an INITIAL payment bought starts at its activation, not at the checkout that wrote the charge row (a
 * late payment, A8c, starts its month days later). Every other kind was priced for its own row's period.
 */
async function paidPeriod(
  repository: Pick<BillingRepository, "subscriptionEvents">, charge: ChargeRow
): Promise<Readonly<{ start: Date; end: Date }>> {
  if (charge.kind === "INITIAL") {
    const activated = (await repository.subscriptionEvents(charge.subscriptionId))
      .find((event) => event.kind === "ACTIVATED" && event.data.charge_id === charge.chargeId);
    const anchor = activated?.periodAnchorAt ?? null;
    if (anchor !== null) {
      const month = computeWindows(anchor, anchor).month;
      return Object.freeze({ start: month.start, end: month.end });
    }
  }
  return Object.freeze({ start: charge.periodStart, end: charge.periodEnd });
}

/** Everything an invoice needs, read at the moment it is issued. `null` = the charge has not succeeded. */
export async function loadPaidCharge(
  deps: Pick<InvoiceJobDeps, "repository" | "recordsKey" | "recipients">, chargeId: string
): Promise<PaidCharge | null> {
  const charge = await deps.repository.charge(chargeId);
  const paid = charge?.events.find((event) => event.kind === "SUCCEEDED");
  if (charge === null || paid === undefined || paid.xmoneyTransactionId === null) return null;
  const quote = charge.quoteId === null ? null : await deps.repository.quote(charge.quoteId, charge.ownerRef);
  const customer = await deps.repository.customerByOwner(charge.ownerRef);
  const latest = customer === null ? null : await deps.repository.latestProfile(customer.customerId);
  if (quote === null || customer === null || latest === null) {
    throw new TypedDomainError("BILLING_INVOICE_DATA_MISSING", "a paid charge without its quote or profile");
  }
  const profile = openBillingProfile(deps.recordsKey, customer.customerId, latest.profileCiphertext);
  // W8 (P2-I12, the owner's ruling): the invoice goes to the address the account has now; the one kept with the
  // profile only once the account is erased. A failed read throws, and the worker retries the document.
  const email = (await deps.recipients.currentAddress(customer.customerId)) ?? profile.email;
  return Object.freeze({
    charge, paid, ownerRef: charge.ownerRef, customerId: customer.customerId, quote,
    location: openQuoteLocation(deps.recordsKey, quote.quoteId, quote.locationCiphertext),
    profile: Object.freeze({ ...profile, email }),
    period: await paidPeriod(deps.repository, charge)
  });
}

/**
 * W12 (P2-I17): what recording a document needs of its charge, read from a handler's `PaidCharge` or by
 * `pnpm billing:invoice` from the charge's own rows (the command opens no records key): the charge, its customer,
 * the plan it paid for, its total and when it was paid (M2's params).
 */
export type RecordedCharge = Readonly<{
  chargeId: string; customerId: string; planId: PlanId; chargeTotalMicros: number; paidAt: Date;
}>;

export function recordedChargeOf(paid: PaidCharge): RecordedCharge {
  return Object.freeze({
    chargeId: paid.charge.chargeId, customerId: paid.customerId, planId: paid.quote.planId,
    chargeTotalMicros: paid.charge.totalMicros, paidAt: paid.paid.at
  });
}

export async function invoicesOfCharge(repository: Pick<BillingRepository, "invoicesForOwner">, paid: PaidCharge): Promise<InvoiceRow[]> {
  return (await repository.invoicesForOwner(paid.ownerRef)).filter((invoice) => invoice.chargeId === paid.charge.chargeId);
}

/** The one invoice line, in the buyer's locale; Quaderno and SmartBill render the rest of the document. */
export function invoiceLine(
  text: BillingOrderText, locale: string, planId: PlanId, period: Readonly<{ start: Date; end: Date }>
): string {
  return text("INVOICE_LINE", locale, {
    plan: planName(planId), from: invoiceDate(period.start, locale), to: invoiceDate(period.end, locale)
  });
}

/** Spec §2.5.4 invoice jobs: the customer, one line with the tax rate, and the three pieces of location evidence. */
export function saleRecordOf(
  paid: PaidCharge, payload: OutboxJob["payload"], taxCode: BillingPolicy["taxCode"], text: BillingOrderText = englishOrderText
): SaleRecord {
  const company = paid.profile.company;
  return Object.freeze({
    chargeId: paid.charge.chargeId,
    transactionId: paid.paid.xmoneyTransactionId!,
    issuedOn: paid.paid.at,
    customer: Object.freeze({
      name: company?.name ?? paid.profile.name, email: paid.profile.email, country: paid.profile.country,
      region: paid.profile.region, postalCode: paid.profile.postalCode, city: paid.profile.city,
      // Spec §2.5.4: "the client is the person or company" — a company is invoiced at its own address.
      street: company?.address ?? paid.profile.street,
      taxId: company !== null && company.vatValidated ? company.vatId : null, locale: paid.profile.locale
    }),
    lines: Object.freeze([Object.freeze({
      description: invoiceLine(text, paid.profile.locale, paid.quote.planId, paid.period), netMicros: paid.charge.netMicros,
      taxMicros: paid.charge.taxMicros, taxRateBasisPoints: paid.quote.taxRateBasisPoints
    })]),
    taxCode,
    evidence: Object.freeze({
      billingCountry: paid.location.country, ipAddress: paid.location.ip,
      bankCountry: typeof payload.card_country === "string" ? payload.card_country : null
    })
  });
}

/**
 * The refund a credit-note job names (`enqueueCreditNote`, P9c). Only a pointer: `creditNoteContext` credits the
 * amount of the charge's own REFUNDED row (P2-I5 (2)), so `refundMicros` is read here only to refuse a malformed row.
 */
export function refundJobOf(job: OutboxJob): Readonly<{ chargeId: string; transactionId: string; refundMicros: number }> | null {
  const { charge_id: chargeId, transaction_id: transactionId, refund_micros: refundMicros } = job.payload;
  return typeof chargeId === "string" && typeof transactionId === "string" && typeof refundMicros === "number" && refundMicros > 0
    ? Object.freeze({ chargeId, transactionId, refundMicros }) : null;
}

/** What a credit-note job knows once its opening checks pass: the paid charge, the invoice it credits, the refund. */
export type CreditNoteContext = Readonly<{ paid: PaidCharge; original: InvoiceRow; refund: RefundRecord }>;

/**
 * The opening steps every credit-note job (Quaderno's refund, SmartBill's storno) shares, in one definition: an
 * outcome when the job ends here, or the context to issue the credit note from.
 */
export async function creditNoteContext(
  deps: InvoiceJobDeps & Readonly<{ audit: BillingAudit }>, job: OutboxJob, now: Date, issuer: "QUADERNO" | "SMARTBILL"
): Promise<OutboxOutcome | CreditNoteContext> {
  const refund = refundJobOf(job);
  if (refund === null) return Object.freeze({ kind: "DEAD" as const, code: "CREDIT_NOTE_PAYLOAD_INVALID" });
  const other = await otherSystemOutcome(deps, job, refund.chargeId);
  if (other !== null) return other;
  const paid = await loadPaidCharge(deps, refund.chargeId);
  if (paid === null) return Object.freeze({ kind: "DEAD" as const, code: "INVOICE_CHARGE_NOT_PAID" });
  const issued = await invoicesOfCharge(deps.repository, paid);
  if (issued.some((invoice) => invoice.kind === "CREDIT_NOTE")) {
    // Refunds of the sale itself only: a DUPLICATE_PAYMENT's refund (D5 5f) was never a sale and has no document.
    const saleRefunds = paid.charge.events.filter((event) => event.kind === "REFUNDED"
      && refundTarget(event) === paid.paid.xmoneyTransactionId).length;
    if (saleRefunds <= 1) return DONE;
    deps.audit("billing.invoice.unknown", { issuer, kind: "CREDIT_NOTE", code: "CREDIT_NOTE_MANUAL" });
    return Object.freeze({ kind: "DEAD" as const, code: "CREDIT_NOTE_MANUAL" });
  }
  const original = issued.find((invoice) => invoice.kind === "INVOICE");
  if (original === undefined) {
    return Object.freeze({ kind: "RETRY" as const, code: "INVOICE_ORIGINAL_MISSING", retryAt: failureRetryAt(job.attempts, now) });
  }
  // P2-I5 (2): the credit note credits what the charge records, never what the job says. The refund of the SALE's
  // paid transaction, on its own row or on a refund transaction naming it (D5 5g), gives the amount and the date; a
  // job naming any other transaction (a duplicate payment's refund was never a sale) or one with no REFUNDED row yet
  // (every real job is queued in the REFUNDED row's own transaction) waits, and dies when the schedule is spent.
  const refunded = refund.transactionId === paid.paid.xmoneyTransactionId
    ? paid.charge.events.find((event) => event.kind === "REFUNDED" && refundTarget(event) === refund.transactionId)
    : undefined;
  if (refunded === undefined || refunded.amountMicros === null || refunded.amountMicros <= 0) {
    return Object.freeze({ kind: "RETRY" as const, code: "CREDIT_NOTE_REFUND_MISSING", retryAt: failureRetryAt(job.attempts, now) });
  }
  // P9c's dashboard refund recorded on the payment itself (PROVIDER_REFUND, no refund transaction) holds only an upper
  // bound: xMoney's read named no amount (`quarterSummaryRows` marks it amountKnown=false). P9c queues no credit note
  // for it, and a job that names it issues none at that figure: it goes to the owner (P16b lists the charge). A D5 5g
  // PROVIDER_REFUND on its own refund transaction, and a PROVIDER_VOID, carry their true amount and stay automatic.
  if (refunded.errorCode === "PROVIDER_REFUND" && refunded.refundsTransactionId === null) {
    deps.audit("billing.invoice.unknown", { issuer, kind: "CREDIT_NOTE", code: "CREDIT_NOTE_MANUAL" });
    return Object.freeze({ kind: "DEAD" as const, code: "CREDIT_NOTE_MANUAL" });
  }
  return Object.freeze({
    paid, original,
    refund: Object.freeze({
      chargeId: paid.charge.chargeId, transactionId: refund.transactionId, issuedOn: refunded.at,
      refundTotalMicros: refunded.amountMicros, original: { documentId: original.externalRef, number: original.number },
      // RefundRecord.description (D5 Open question 4): the credited line in the buyer's language, the same sentence
      // the invoice carried for the period it credits (SmartBill's P5 still names its negative line itself).
      description: invoiceLine(deps.orderText ?? englishOrderText, paid.profile.locale, paid.quote.planId, paid.period)
    })
  });
}
