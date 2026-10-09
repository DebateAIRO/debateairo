import type { PoolClient } from "pg";
import {
  microsToDecimal, paymentErrorCode, paymentNothingSent, withdrawalRefundDeadline,
  type CardPayments, type PaymentEnvironment
} from "@debateai/billing-core";
import type {
  BillingJobQueries, BillingRepository, ChargeEventRow, ChargeRow, OutboxJob
} from "@debateai/db";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { renderMail, type MailTemplateId } from "@debateai/mail-templates";
import type { BillingPolicy } from "@debateai/register";
import { credentialsRefused, type BillingAudit } from "./audit.js";
import type { RequestedRefundReason } from "./codes.js";
import { emailJob, enqueueEmail, type BillingMailTemplateId } from "./email-job.js";
import {
  claimLost, DONE, enqueueOnce, failureRetryAt, isThisPaymentSystem, otherPaymentSystem, otherSystemCode, type OutboxHandler,
  type OutboxOutcome
} from "./outbox.js";
import { queuePaymentAlert } from "./payment-alert.js";
import { chargeEvent, refundTarget } from "./rows.js";
import { enqueueCreditNote } from "./settlement.js";

/*
 * Q-5: every dead end of a refund job below goes through `deadLetter`, which queues the owner email O2 before the
 * job dies. Only an unreadable payload (`REFUND_PAYLOAD_INVALID`) dies without it: it names no charge or amount.
 */

/** One payment's money going back (A4a: the unit of the refund-sum guard and of the PAYMENT_REFUND job). */
export type RefundIntent = Readonly<{
  chargeId: string;
  transactionId: string;
  amountMicros: number;
  /** The whole payment (a refused or second payment, or the release of a card check's hold, A12). */
  whole: boolean;
  ownerRef: string;
  reason: RequestedRefundReason;
}>;

export type PaidTransaction = Readonly<{
  chargeId: string; transactionId: string; paidMicros: number; refundedMicros: number; succeededAt: Date;
  /**
   * A refund made at NETOPIA, not by us (P9c `PROVIDER_REFUND` / `PROVIDER_VOID`), touched this payment. Its true
   * refunded amount is unknown (NETOPIA's status shows none), so `refundedMicros` is an upper bound: a withdrawal over
   * such a payment goes to the owner (P12d), never settled from this figure.
   */
  providerRefunded: boolean;
}>;
export type RefundAllocation = Readonly<{ chargeId: string; transactionId: string; amountMicros: number }>;

type ChargeWithEvents = ChargeRow & { events: ChargeEventRow[] };
type FollowUp = (client: PoolClient, at: Date) => Promise<void>;
type PaymentReportOrMissing = Awaited<ReturnType<CardPayments["status"]>>;

const REQUESTED_REASONS: ReadonlySet<string> = new Set<RequestedRefundReason>([
  "CARD_COUNTRY_BLOCKED", "ALREADY_SUBSCRIBED", "SUBSCRIPTION_ENDED", "WITHDRAWAL", "CARD_CHECK_RELEASE",
  "CARD_CHECK_REFUSED", "CARD_CHECK_DEFERRED", "CARD_CHECK_NOT_LIVE", "DUPLICATE_PAYMENT", "UPGRADE_CLOSED"
]);
const PROVIDER_REASONS: ReadonlySet<string> = new Set(["PROVIDER_REFUND", "PROVIDER_VOID"]);
/** The releases of a card change's hold (P12e, P20): the only refunds whose amount may be 0 (P2-M4). */
const CARD_CHECK_REASONS: ReadonlySet<string> = new Set<RequestedRefundReason>([
  "CARD_CHECK_RELEASE", "CARD_CHECK_REFUSED", "CARD_CHECK_DEFERRED", "CARD_CHECK_NOT_LIVE"
]);
/** How often a job keeps coming back once the failure schedule is spent, while nothing could be sent. */
const KEEP_TRYING_MS = 12 * 3_600_000;

const dead = (code: string): OutboxOutcome => Object.freeze({ kind: "DEAD" as const, code });

/** What rows of `kind` refunded from the paid transaction `transactionId` (P1a's target: `refundTarget`). */
function sumOf(events: ReadonlyArray<ChargeEventRow>, kind: ChargeEventRow["kind"], transactionId: string): number {
  return events.filter((event) => event.kind === kind && refundTarget(event) === transactionId)
    .reduce((total, event) => total + (event.amountMicros ?? 0), 0);
}

/**
 * What already went back from ONE paid transaction of this charge: the larger of "asked" (REFUND_REQUESTED) and
 * "reported" (REFUNDED), counted per transaction as P1a's refund-sum guard counts it, so a refund of another
 * transaction on the same charge (a duplicate payment's) never counts against this one.
 */
export function refundedMicros(charge: Readonly<{ events: ReadonlyArray<ChargeEventRow> }>, transactionId: string): number {
  return Math.max(sumOf(charge.events, "REFUND_REQUESTED", transactionId), sumOf(charge.events, "REFUNDED", transactionId));
}

/**
 * The one rule for when a refund request is recorded: what the REFUNDED rows of payment `paymentId` (P1a's target:
 * `refundTarget`) add up to, a missing amount counting 0, so a refund recorded in parts adds up. A request is recorded
 * once this covers what it asked back. Shared by RefundDesk's follow-ups (the M8/M11 mails and the credit note, through
 * `openOwnRequest`) and the waiting and return pages (F4: `chargeStatusOf`'s REFUND_PENDING), so the page never says
 * "refunded" while the desk still counts the request open, nor the reverse.
 */
export function refundedFrom(events: ReadonlyArray<ChargeEventRow>, paymentId: string): number {
  return sumOf(events, "REFUNDED", paymentId);
}

/**
 * A4(b): what each paid transaction since `since` took and what already went back. Per transaction the larger of
 * "asked" (REFUND_REQUESTED) and "reported" (REFUNDED) counts, as P1a's refund-sum guard does; an old REFUNDED row of
 * a separate refund transaction counts against the payment it names (D5 5g). A CARD_CHECK hold is not a
 * payment, and neither is a DUPLICATE_PAYMENT (D5 5f: it bought nothing and was refunded whole). Oldest first.
 */
export function paidTransactions(charges: ReadonlyArray<ChargeWithEvents>, since: Date): PaidTransaction[] {
  const paid: PaidTransaction[] = [];
  for (const charge of charges) {
    if (charge.kind === "CARD_CHECK") continue;
    for (const event of charge.events) {
      if (event.kind !== "SUCCEEDED" || event.providerPaymentId === null || event.at.getTime() < since.getTime()) continue;
      const transactionId = event.providerPaymentId;
      paid.push(Object.freeze({
        chargeId: charge.chargeId, transactionId, paidMicros: event.amountMicros ?? 0,
        refundedMicros: refundedMicros(charge, transactionId),
        succeededAt: event.at,
        providerRefunded: charge.events.some((other) => refundTarget(other) === transactionId
          && (other.kind === "REFUND_REQUESTED" || other.kind === "REFUNDED")
          && other.errorCode !== null && PROVIDER_REASONS.has(other.errorCode))
      }));
    }
  }
  return paid.sort((left, right) => left.succeededAt.getTime() - right.succeededAt.getTime());
}

/** A4(b): the newest transaction first, never more than one still holds; REFUND_EXCEEDS_CHARGE past the total. */
export function allocateRefund(amountMicros: number, paid: ReadonlyArray<PaidTransaction>): RefundAllocation[] {
  if (!Number.isSafeInteger(amountMicros) || amountMicros < 0) {
    throw new TypedDomainError("REFUND_AMOUNT_INVALID", "a refund is a non-negative whole number of micros");
  }
  let remaining = amountMicros;
  const allocations: RefundAllocation[] = [];
  for (const transaction of [...paid].sort((older, newer) => newer.succeededAt.getTime() - older.succeededAt.getTime())) {
    if (remaining === 0) break;
    const room = transaction.paidMicros - transaction.refundedMicros;
    if (room <= 0) continue;
    const take = Math.min(room, remaining);
    allocations.push(Object.freeze({ chargeId: transaction.chargeId, transactionId: transaction.transactionId, amountMicros: take }));
    remaining -= take;
  }
  if (remaining > 0) throw new TypedDomainError("REFUND_EXCEEDS_CHARGE", "the refund is larger than what the transactions still hold");
  return allocations;
}

/**
 * F2 (ruling PR-55): whether the charge's paid payment (its SUCCEEDED) went back in full: the REFUNDED rows naming it,
 * its own or a separate refund transaction's, add up to what it took. Such a payment bought nothing, so it never counts
 * as an earlier attempt "paid" (`RenewalService.earlierAttemptPaid`) nor as an attempt made (`BillingMaintenance`'s
 * retry). False with no SUCCEEDED.
 */
export function paidAndRefundedInFull(charge: Readonly<{ events: ReadonlyArray<ChargeEventRow> }>): boolean {
  const paid = charge.events.find((event) => event.kind === "SUCCEEDED");
  if (paid === undefined || paid.providerPaymentId === null || paid.amountMicros === null) return false;
  return sumOf(charge.events, "REFUNDED", paid.providerPaymentId) >= paid.amountMicros;
}

/** Whether this paid transaction already holds a REFUNDED row, its own or a separate refund transaction's. */
export function refundedAlready(charge: Readonly<{ events: ReadonlyArray<ChargeEventRow> }>, transactionId: string): boolean {
  return charge.events.some((event) => event.kind === "REFUNDED" && refundTarget(event) === transactionId);
}

/** The intent behind one of OUR requests; a provider refund's REFUND_REQUESTED (P9c) is not one. */
export function refundIntentOf(charge: ChargeRow, event: ChargeEventRow): RefundIntent | null {
  if (event.kind !== "REFUND_REQUESTED" || event.providerPaymentId === null || event.amountMicros === null
    || event.errorCode === null || !REQUESTED_REASONS.has(event.errorCode)) return null;
  return Object.freeze({
    chargeId: charge.chargeId, transactionId: event.providerPaymentId, amountMicros: event.amountMicros, whole: false,
    ownerRef: charge.ownerRef, reason: event.errorCode as RequestedRefundReason
  });
}

/**
 * N14 (spec §2.12.2): our own request on one NETOPIA payment and what is still open of it — the request minus every
 * REFUNDED part (the owner may record a refund in parts). Null when the payment holds no request of ours.
 */
export function openOwnRequest(
  charge: ChargeRow & { events: ReadonlyArray<ChargeEventRow> }, paymentId: string
): Readonly<{ intent: RefundIntent; openMicros: number }> | null {
  const requested = charge.events.find((event) => event.kind === "REFUND_REQUESTED" && event.providerPaymentId === paymentId);
  const intent = requested === undefined ? null : refundIntentOf(charge, requested);
  if (intent === null) return null;
  const refunded = refundedFrom(charge.events, paymentId);
  return Object.freeze({ intent, openMicros: Math.max(intent.amountMicros - refunded, 0) });
}

/**
 * N15b (ruling PR-41, spec §2.13): whether an owner refund on this payment is HELD: the charge holds a CHARGEBACK of
 * `paymentId` and no CHARGEBACK_RESOLVED of that same id. A held refund is not due (the person's bank is taking the
 * money back): its PAYMENT_REFUND job moves no money and hands nothing to the owner (owner and API mode), the reminder
 * leaves it out, it gets no daily status read, and `pnpm billing:refund-done` refuses it without `--despite-chargeback`. A dispute won (CHARGEBACK_RESOLVED) makes it due again; a dispute lost writes no
 * charge event, so it stays held. The same rule as the SQL of `BillingRepository.openOwnerRefunds` and of
 * `BillingJobQueries.dueStatusReads`' REFUND schedule (packages/db); keyed by the payment, never by the charge alone.
 */
export function heldByChargeback(charge: Readonly<{ events: ReadonlyArray<ChargeEventRow> }>, paymentId: string): boolean {
  return charge.events.some((event) => event.kind === "CHARGEBACK" && event.providerPaymentId === paymentId)
    && !charge.events.some((event) => event.kind === "CHARGEBACK_RESOLVED" && event.providerPaymentId === paymentId);
}

/**
 * N15b (ruling PR-41): the owner's one O3 REFUND_HELD_BY_CHARGEBACK for an open owner refund (`open`, from
 * `openOwnRequest`) that a charge-back on its payment holds (`heldByChargeback`). Once per payment ever, whichever path
 * finds the hold first: VERIFY_PAYMENT writing the CHARGEBACK while the request is open (`netopiaChargedBack`, queued on
 * that transaction through `client`), or the PAYMENT_REFUND job of a request made on a payment already under a
 * dispute (`RefundDesk`, owner and API mode). `amount` is the open amount, as the reminder and
 * `pnpm billing:refund-done` print it. Returns `queuePaymentAlert`'s answer: false when that payment's O3 was queued
 * before, so the caller's audit line billing.refund.held_by_chargeback stays once per payment too.
 */
export async function queueRefundHeldAlert(
  deps: Parameters<typeof queuePaymentAlert>[0],
  charge: Pick<ChargeRow, "chargeId" | "currency">,
  open: Readonly<{ intent: RefundIntent; openMicros: number }>,
  now: Date,
  client?: PoolClient
): Promise<boolean> {
  const { chargeId, currency } = charge;
  const paymentId = open.intent.transactionId;
  const amount = microsToDecimal(open.openMicros);
  return queuePaymentAlert(deps, {
    code: "REFUND_HELD_BY_CHARGEBACK", reference: `charge ${chargeId}`, dedupeRef: `${chargeId}:REFUND_HELD:${paymentId}`, now,
    nextSteps: `A refund of ${amount} ${currency} (reason ${open.intent.reason}) was due on this payment`
      + ` (NETOPIA payment ${paymentId}), and NETOPIA now reports a charge-back on it: the person's bank is taking the`
      + " money back. Do not refund it in NETOPIA's admin; the site no longer lists it as due. If the dispute ends for"
      + ` us, record that with pnpm billing:dispute --charge ${chargeId} --outcome won: the refund is then due`
      + " again and comes back into the reminder. If it ends for the person, nothing is left to refund. If you had"
      + " already refunded it in NETOPIA's admin before the dispute, record that refund with"
      + ` pnpm billing:refund-done --charge ${chargeId} --amount ${amount} --despite-chargeback, and tell NETOPIA,`
      + " so the dispute is answered."
  }, client);
}

/**
 * Whether a request gives back the WHOLE payment it names (the payment's own amount, nothing recorded of it yet).
 * VERIFY_PAYMENT records such a request when NETOPIA reports the payment REFUNDED or, after it was paid, VOIDED (F2).
 */
export function wholePaymentOpen(
  charge: Readonly<{ events: ReadonlyArray<ChargeEventRow> }>, open: Readonly<{ intent: RefundIntent; openMicros: number }>
): boolean {
  const paid = charge.events.find((event) => (event.kind === "SUCCEEDED" || event.kind === "DUPLICATE_PAYMENT")
    && event.providerPaymentId === open.intent.transactionId);
  return paid !== undefined && paid.amountMicros === open.intent.amountMicros && open.openMicros === open.intent.amountMicros;
}

/** The customer's email after a refund of `reason` is recorded (R-32's follow-ups); null: none (a card-check release). */
export function refundMailOf(reason: RequestedRefundReason): "M8" | "M11" | "M11_DUPLICATE" | null {
  switch (reason) {
    case "WITHDRAWAL":
      return "M8";
    case "CARD_COUNTRY_BLOCKED":
      return "M11";
    case "ALREADY_SUBSCRIBED":
    case "SUBSCRIPTION_ENDED":
    case "DUPLICATE_PAYMENT":
    case "UPGRADE_CLOSED":
      return "M11_DUPLICATE";
    case "CARD_CHECK_RELEASE":
    case "CARD_CHECK_REFUSED":
    case "CARD_CHECK_DEFERRED":
    case "CARD_CHECK_NOT_LIVE":
      return null;
    default:
      return exhaustive(reason);
  }
}

/** Spec §2.12.2: the exact command the owner runs once a NETOPIA refund is made. */
export function refundDoneCommand(chargeId: string, amountMicros: number): string {
  return `pnpm billing:refund-done --charge ${chargeId} --amount ${microsToDecimal(amountMicros)} --confirm`;
}

/** One open owner refund, as the reminder lists it (owner-facing English; our ids, no customer data). */
export type OwnerRefundLine = Readonly<{
  chargeId: string; providerPaymentId: string; reason: string; currency: string; openMicros: number; whole: boolean;
  requestedAt: Date; deadline: Date | null; seenRefunded: boolean;
}>;

/** What the owner's command would record, and the email that follows when it closes the request. */
export type OwnerRefundPlan = Readonly<{
  chargeId: string; providerPaymentId: string; reason: RequestedRefundReason; currency: string;
  amountMicros: number; openMicros: number; restMicros: number;
  /** The customer's follow-up email, rendered in their language; null while a rest stays open, or for none. */
  mail: Readonly<{ template: string; text: string }> | null;
  /**
   * N15b: the owner's `--despite-chargeback` (a refund made in NETOPIA's admin before the dispute arrived): only then
   * is a refund `heldByChargeback` planned and recorded.
   */
  despiteChargeback: boolean;
}>;

const DAY_MS = 86_400_000;
const utcDay = (at: Date): number => Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());

/**
 * Spec §2.12.2 item 3: whether an open refund puts the owner's list in today's mail: on the day it became due, then
 * every third day, and every day from three days before a withdrawal's deadline (and after it).
 */
export function refundReminderDue(line: Pick<OwnerRefundLine, "requestedAt" | "deadline">, now: Date): boolean {
  const days = Math.round((utcDay(now) - utcDay(line.requestedAt)) / DAY_MS);
  if (days >= 0 && days % 3 === 0) return true;
  return line.deadline !== null && line.deadline.getTime() - now.getTime() <= 3 * DAY_MS;
}

/** At most this many lines reach one reminder (O2_REFUND_REMINDER's block holds 65,536 characters). */
const REMINDER_LINES = 40;

export function renderOwnerRefundList(lines: ReadonlyArray<OwnerRefundLine>): string {
  const shown = lines.slice(0, REMINDER_LINES).map((line) => [
    `- charge ${line.chargeId}, NETOPIA payment ${line.providerPaymentId}: refund ${microsToDecimal(line.openMicros)} ${line.currency}`
      + ` (${line.whole ? "the whole payment" : "part of the payment"}), reason ${line.reason},`
      + ` open since ${line.requestedAt.toISOString().slice(0, 10)}`
      + (line.deadline === null ? "" : `, withdrawal deadline ${line.deadline.toISOString()}`)
      + (line.seenRefunded ? ", NETOPIA shows a refund: only the command is missing" : ""),
    `  ${refundDoneCommand(line.chargeId, line.openMicros)}`
  ].join("\n"));
  const rest = lines.length - shown.length;
  return [...shown, ...(rest > 0 ? [`... and ${rest} more open refunds.`] : [])].join("\n");
}

/**
 * Whether a refund for `reason` gives a whole payment back (P9b's refused or duplicate payments and card-check holds,
 * requested with `whole: true` at the payment's own amount). A withdrawal's refund is always a named amount (P12d).
 */
function refundsWholePayment(reason: RequestedRefundReason): boolean {
  switch (reason) {
    case "WITHDRAWAL":
      return false;
    case "CARD_COUNTRY_BLOCKED":
    case "ALREADY_SUBSCRIBED":
    case "SUBSCRIPTION_ENDED":
    case "UPGRADE_CLOSED":
    case "DUPLICATE_PAYMENT":
    case "CARD_CHECK_RELEASE":
    case "CARD_CHECK_REFUSED":
    case "CARD_CHECK_DEFERRED":
    case "CARD_CHECK_NOT_LIVE":
      return true;
    default:
      return exhaustive(reason);
  }
}

/**
 * P2-I5 (1): whether a job's intent is the one the charge itself records. The outbox can be written by any process
 * holding the runtime role, so the job is only a pointer: its charge must hold OUR REFUND_REQUESTED for this
 * transaction (`refundIntentOf`: never a provider refund's row) with the same owner, amount and reason. `whole` (the
 * call without an amount) is allowed only for a reason that refunds a whole payment, and only at that payment's full
 * amount as its SUCCEEDED or DUPLICATE_PAYMENT row records it.
 */
function isRequested(charge: ChargeWithEvents, intent: RefundIntent): boolean {
  const requested = charge.events.find((event) => event.kind === "REFUND_REQUESTED" && event.providerPaymentId === intent.transactionId);
  const recorded = requested === undefined ? null : refundIntentOf(charge, requested);
  if (recorded === null || recorded.chargeId !== intent.chargeId || recorded.ownerRef !== intent.ownerRef
    || recorded.amountMicros !== intent.amountMicros || recorded.reason !== intent.reason) return false;
  if (!intent.whole) return true;
  const paid = charge.events.find((event) => (event.kind === "SUCCEEDED" || event.kind === "DUPLICATE_PAYMENT")
    && event.providerPaymentId === intent.transactionId);
  return refundsWholePayment(intent.reason) && paid !== undefined && paid.amountMicros === intent.amountMicros;
}

/**
 * A refund job's payload, or null when it cannot be one. An amount of 0 is a refund only as the whole release of a
 * card-check hold (P2-M4: 0086 accepts a zero release of a 0.00 CARD_CHECK, and nothing else at 0).
 */
function intentOfJob(job: OutboxJob): RefundIntent | null {
  const { charge_id: chargeId, transaction_id: transactionId, amount_micros: amountMicros, whole, owner_ref: ownerRef, reason } = job.payload;
  if (typeof chargeId !== "string" || typeof transactionId !== "string" || typeof ownerRef !== "string"
    || typeof amountMicros !== "number" || !Number.isSafeInteger(amountMicros) || amountMicros < 0
    || typeof whole !== "boolean" || typeof reason !== "string" || !REQUESTED_REASONS.has(reason)) return null;
  if (amountMicros === 0 && !(whole && CARD_CHECK_REASONS.has(reason))) return null;
  return Object.freeze({ chargeId, transactionId, amountMicros, whole, ownerRef, reason: reason as RequestedRefundReason });
}

/** Skeleton §1 rule 2: what a NETOPIA refund needs. */
export type NetopiaRefundDeps = Readonly<{
  /** `refund` is absent until NETOPIA confirms its refund call (N-10): the owner mode (§2.12.2). */
  payments: Pick<CardPayments, "status" | "refund">;
  paymentEnvironment: PaymentEnvironment;
  /** The reminder's once-a-day check. */
  jobs: Pick<BillingJobQueries, "outboxJobExists">;
}>;

/**
 * R-32: THE refund executor. Every refund we make (a refused card, a duplicate plan, a withdrawal, a card-check
 * release) is an intent written in the caller's transaction plus a PAYMENT_REFUND job (N14); the job moves the money
 * (for now, hands it to the owner), looks before any second call (A4c) and writes REFUNDED with the reason's follow-up.
 * It never cancels an order (A4d).
 */
export class RefundDesk {
  constructor(private readonly deps: Readonly<{
    repository: Pick<BillingRepository,
      "withTransaction" | "appendChargeEvent" | "enqueue" | "charge" | "quote" | "customerByOwner"
      | "subscriptionEvents" | "chargesForSubscription" | "withdrawalOwnerSettlement" | "openOwnerRefunds" | "lastStatusRead">;
    /** The per-transaction lease around the refund call (defense in depth beside P7's claim re-assert), the job's
     * call stage (fenced on the job's claim, P2-M6), and the owner lock every refund recording takes before it reads
     * the charge again (P2-M6) and P12d's WITHDRAWAL follow-up decides on M8. */
    jobs: Pick<BillingJobQueries, "withLease" | "markJobStage" | "jobStage" | "lockOwner">;
    policy: BillingPolicy;
    audit: BillingAudit;
    clock: () => Date;
    /**
     * N14: NETOPIA's port and environment. P2-I4 (D5 5h): a job whose charge was paid in another payment system (a
     * sandbox refund still queued after README §14.8's switch to live) ends DEAD before any call, with O2.
     */
    netopia: NetopiaRefundDeps;
  }>) {}

  /** A4(a), inside the caller's transaction: the intent is on record, and its job queued, before money moves. */
  async request(client: PoolClient, intent: RefundIntent, at: Date): Promise<"REQUESTED" | "DUPLICATE"> {
    const written = await this.deps.repository.appendChargeEvent(client, chargeEvent(intent.chargeId, "REFUND_REQUESTED", at, {
      providerPaymentId: intent.transactionId, amountMicros: intent.amountMicros, errorCode: intent.reason
    }));
    if (written === "DUPLICATE") return "DUPLICATE";
    await this.deps.repository.enqueue(client, {
      kind: "PAYMENT_REFUND",
      ref: `${intent.chargeId}:${intent.transactionId}`, notBefore: at,
      payload: {
        charge_id: intent.chargeId, transaction_id: intent.transactionId, amount_micros: intent.amountMicros,
        whole: intent.whole, owner_ref: intent.ownerRef, reason: intent.reason
      }
    });
    return "REQUESTED";
  }

  /**
   * A4(b): one intent per allocation (from `allocateRefund`), each with its amount named. A transaction that already
   * holds a refund request (UNIQUE (charge, transaction, REFUND_REQUESTED): ours, or a refund made at NETOPIA, P9c)
   * cannot take a second one; that refusal is loud (`REFUND_TRANSACTION_ALREADY_REFUNDED`, the caller's transaction
   * rolls back), so a withdrawal never reports a refund that was never requested.
   */
  async requestAll(client: PoolClient, input: Readonly<{
    ownerRef: string; reason: RequestedRefundReason; allocations: ReadonlyArray<RefundAllocation>; at: Date;
  }>): Promise<void> {
    for (const allocation of input.allocations) {
      const written = await this.request(client, { ...allocation, whole: false, ownerRef: input.ownerRef, reason: input.reason }, input.at);
      if (written === "DUPLICATE") {
        throw new TypedDomainError("REFUND_TRANSACTION_ALREADY_REFUNDED", "this transaction already holds a refund request");
      }
    }
  }

  /**
   * The PAYMENT_REFUND handler (registered in `createBillingRuntime`). The call runs under a
   * per-transaction session lease, and the charge is re-read INSIDE it, so two processes holding the job can never both
   * refund: the second finds the lease busy, or the REFUNDED the first one wrote.
   */
  readonly handle: OutboxHandler = async (job, now) => {
    const intent = intentOfJob(job);
    if (intent === null) return dead("REFUND_PAYLOAD_INVALID");
    const leased = await this.deps.jobs.withLease(`debateai.billing.refund-call:${intent.transactionId}`, () => this.moveMoney(job, intent, now));
    return leased.kind === "RAN" ? leased.value
      : Object.freeze({ kind: "RETRY" as const, code: "REFUND_BUSY", retryAt: new Date(now.getTime() + 60_000) });
  };

  private async moveMoney(job: OutboxJob, intent: RefundIntent, now: Date): Promise<OutboxOutcome> {
    const charge = await this.deps.repository.charge(intent.chargeId);
    if (charge === null) return this.deadLetter(intent, "REFUND_CHARGE_MISSING", now);
    return this.netopiaMoveMoney(job, intent, charge, now);
  }

  /**
   * Q-5: a refund we could not complete is the owner's to settle by hand, and a withdrawal refund has a legal
   * deadline, so the dead end queues O2 to the owner's custody address at once (English only; the charge, the amount
   * and the dead-letter code), beside the worker's `billing.outbox.dead` line and P16b's daily list. The ref is the
   * refund job's own, so while one O2 is still waiting a second dead end of the same refund queues no other.
   * P2-I5: REFUND_NOT_REQUESTED is no refund to make (the job matches no request the charge records, and nothing was
   * sent), so its O2 says so (`notRequested`) and has a ref of its own: it never absorbs, and is never absorbed by, a
   * real refund's O2 for the same payment.
   * W9 (P2-M8): a real refund's O2 also names what it was for (`refundReason`, the intent's reason), and a withdrawal
   * refund's its legal deadline, 14 days after the person withdrew (`withdrawalRefundDeadline` of the WITHDRAWN row's
   * `withdrew_at`), with how to refund it by hand so that M8 still follows. A forged job's O2 carries neither: its
   * reason is only the job's claim.
   * P2-W4: two more dead ends stop before any call to NETOPIA, so O2 never says "NETOPIA refused" for them.
   * REFUND_CHARGE_MISSING (the job names a charge we do not have) is no refund to make either, so it takes the
   * not-requested sentences and ref. OTHER_PAYMENT_SYSTEM (the payment was taken in another payment system; the code
   * the previous card processor's era stored reads the same, `otherSystemCode`) has its own sentences (`otherSystem`)
   * and ref: nothing was sent and nothing is owed on this server, and this API never sees that system's refunds, so it
   * carries no deadline ("M8 follows by itself" would be false). Neither carries a reason: no recorded request was
   * checked, so it is only the job's claim.
   */
  private async deadLetter(intent: RefundIntent, code: string, now: Date): Promise<OutboxOutcome> {
    const notRequested = code === "REFUND_NOT_REQUESTED" || code === "REFUND_CHARGE_MISSING";
    const otherSystem = otherSystemCode(code);
    const real = !notRequested && !otherSystem;
    const ref = `${intent.chargeId}:${intent.transactionId}`;
    const deadline = real ? await this.withdrawalDeadlineOf(intent) : null;
    const dedupeRef = notRequested ? `${ref}:not-requested` : otherSystem ? `${ref}:other-system` : ref;
    await this.deps.repository.withTransaction((client) => enqueueEmail(this.deps.repository, client, {
      template: "O2", recipient: { kind: "OWNER" }, dedupeRef,
      params: {
        chargeRef: intent.chargeId, refundAmount: microsToDecimal(intent.amountMicros), reasonCode: code,
        notRequested: notRequested ? "true" : "false",
        ...(otherSystem ? { otherSystem: "true" } : {}),
        ...(real ? { refundReason: intent.reason } : {}),
        ...(deadline === null ? {} : { refundDeadline: deadline.toISOString() })
      },
      notBefore: now
    }));
    return dead(code);
  }

  /**
   * W9 (P2-M8): when a WITHDRAWAL refund's money is due at the latest, from the withdrawal its charge's subscription
   * records (`withdrew_at`: the Settings click, or the arrival of the statement the owner recorded; the row's own time
   * for a row written before it carried one). Null for any other reason, or when the charge or its WITHDRAWN row
   * cannot be found (O2 then names the reason without a date).
   */
  private async withdrawalDeadlineOf(intent: RefundIntent): Promise<Date | null> {
    if (intent.reason !== "WITHDRAWAL") return null;
    const charge = await this.deps.repository.charge(intent.chargeId);
    if (charge === null) return null;
    const withdrawn = (await this.deps.repository.subscriptionEvents(charge.subscriptionId))
      .find((event) => event.kind === "WITHDRAWN");
    if (withdrawn === undefined) return null;
    const recorded = withdrawn.data.withdrew_at;
    const withdrewAt = typeof recorded === "string" ? new Date(recorded) : withdrawn.at;
    return withdrawalRefundDeadline(Number.isFinite(withdrewAt.getTime()) ? withdrewAt : withdrawn.at);
  }

  /**
   * REFUNDED once per paid payment (P1a's unique keys), on the payment's own row, with the reason's follow-up in one
   * transaction (the 0.00 card-check release, which moves no money). Every recording takes the owner lock first,
   * before the REFUNDED row. P2-M6: under the owner lock the charge is read again on the transaction's own
   * connection, and a refund whose payment already holds a REFUNDED (`refundedAlready`) is recorded already: nothing
   * more is written and no follow-up runs (no second credit note, no second M8).
   */
  async recordRefunded(intent: RefundIntent, at: Date): Promise<void> {
    const followUp = await this.followUp(intent);
    await this.deps.repository.withTransaction(async (client) => {
      // The owner lock comes first, then the charge's refund lock that 0086's trigger takes on the REFUNDED insert:
      // this is the order the withdrawal and VERIFY_PAYMENT's refund writers use, and the WITHDRAWAL follow-up
      // decides on M8 under the owner lock.
      await this.deps.jobs.lockOwner(client, intent.ownerRef);
      const current = await this.deps.repository.charge(intent.chargeId, client);
      if (current !== null && refundedAlready(current, intent.transactionId)) return;
      const written = await this.deps.repository.appendChargeEvent(client, chargeEvent(intent.chargeId, "REFUNDED", at, {
        providerPaymentId: intent.transactionId, amountMicros: intent.amountMicros, errorCode: intent.reason
      }));
      if (written === "DUPLICATE") return;
      await followUp(client, at);
    });
    this.deps.audit("billing.refund", { reason: intent.reason });
  }

  /**
   * The failure schedule; once it is spent, a job whose failures proved nothing was sent keeps coming back every 12
   * hours instead of dying (D5 5i: an outage or a revoked key is never the person's loss). Any other spent schedule
   * is a dead end, and the owner is emailed (Q-5) with `code`. `retryCode` is what the worker keeps as the job's stage
   * for the next attempt when it differs from `code`: a failed lookup keeps the not-sent stage of the last call.
   */
  private async again(
    job: OutboxJob, intent: RefundIntent, now: Date, code: string, keepTrying: boolean, retryCode: string | null = null
  ): Promise<OutboxOutcome> {
    const scheduled = failureRetryAt(job.attempts, now);
    const retryAt = scheduled ?? (keepTrying ? new Date(now.getTime() + KEEP_TRYING_MS) : null);
    if (retryAt === null) return this.deadLetter(intent, code, now);
    return Object.freeze({ kind: "RETRY" as const, code: retryCode ?? code, retryAt });
  }

  /** What follows a refund we made: the person's email (`refundMailOf`), or the credit note for a charge that was invoiced. */
  private async followUp(intent: RefundIntent): Promise<FollowUp> {
    const template = refundMailOf(intent.reason);
    switch (template) {
      case "M8":
        return this.withdrawalFollowUp(intent);
      case "M11":
        return this.mail(intent, "M11", intent.chargeId, await this.planEndedByRefusal(intent));
      case "M11_DUPLICATE":
        // One charge can take more than one duplicate: each refunded transaction gets its own email.
        return this.mail(intent, "M11_DUPLICATE",
          intent.reason === "DUPLICATE_PAYMENT" ? `${intent.chargeId}:${intent.transactionId}` : intent.chargeId);
      case null:
        // The card-check releases (P12e, P20): the hold goes back with no email and no credit note.
        return async () => undefined;
      default:
        return exhaustive(template);
    }
  }

  /**
   * W10 (P2-M9): the plan a refused renewal or upgrade payment ended. VERIFY_PAYMENT's `endRefusedPayment` ends a live
   * plan paid with a card from an always-blocked country at once (ENDED, cause CANCEL, reason CARD_COUNTRY_BLOCKED) in
   * the transaction that records this payment's SUCCEEDED and requests this refund, both at that transaction's
   * instant; so an ENDED of that cause at the payment's own instant is the end this refusal caused, and M11 then says
   * the plan ended. A checkout's payment (INITIAL, its plan never started), a payment on a plan that had already
   * ended, and any other refusal of the same plan name none.
   */
  private async planEndedByRefusal(intent: RefundIntent): Promise<string | null> {
    const charge = await this.deps.repository.charge(intent.chargeId);
    if (charge === null || (charge.kind !== "RENEWAL" && charge.kind !== "UPGRADE")) return null;
    const paidAt = charge.events.find((event) => event.kind === "SUCCEEDED" && event.providerPaymentId === intent.transactionId)?.at;
    if (paidAt === undefined) return null;
    const ended = (await this.deps.repository.subscriptionEvents(charge.subscriptionId)).find((event) =>
      event.kind === "ENDED" && event.data.cause === "CANCEL" && event.data.reason === "CARD_COUNTRY_BLOCKED"
      && event.at.getTime() === paidAt.getTime());
    return ended?.planId ?? null;
  }

  private async mail(
    intent: RefundIntent, template: BillingMailTemplateId, dedupeRef: string, endedPlan: string | null = null
  ): Promise<FollowUp> {
    const customer = await this.deps.repository.customerByOwner(intent.ownerRef);
    if (customer === null) throw new TypedDomainError("BILLING_CUSTOMER_MISSING", "a refund without its customer");
    const params = { refundAmount: microsToDecimal(intent.amountMicros), ...(endedPlan === null ? {} : { endedPlan }) };
    return async (client, at) => {
      await enqueueEmail(this.deps.repository, client, {
        template, recipient: { kind: "CUSTOMER", customerId: customer.customerId }, dedupeRef, params, notBefore: at
      });
    };
  }

  private async creditNote(intent: RefundIntent): Promise<FollowUp> {
    const charge = await this.deps.repository.charge(intent.chargeId);
    const quote = charge === null || charge.quoteId === null ? null : await this.deps.repository.quote(charge.quoteId, intent.ownerRef);
    if (charge === null || quote === null) throw new TypedDomainError("BILLING_QUOTE_MISSING", "a refunded charge without its quote");
    return async (client, at) => {
      await enqueueCreditNote(this.deps.repository, client, {
        charge, quote, policy: this.deps.policy, transactionId: intent.transactionId, refundMicros: intent.amountMicros, now: at
      });
    };
  }

  /**
   * P12d (spec §2.5.6): the credit note for this transaction, and M8 "we refunded {refundAmount}" once the LAST
   * refund of the withdrawal is recorded — never before the money moved, and never for a refund NETOPIA refused
   * (that job dies and P14a/P16b list it for the owner). One M8 per withdrawal rests on three things: (1) the owner
   * lock, which `recordRefunded` takes before the REFUNDED row, serializes the refund recordings of one withdrawal, so
   * exactly one of them sees every refund recorded; (2) a repeated REFUNDED returns before its follow-up runs; (3) the
   * ref `M8:<subscriptionId>` only absorbs a second M8 while the first is still unsent (`enqueue`'s open-job key), so
   * no WITHDRAWAL request may be added after M8 has gone out (P14c settles only unsettled `refund_by_owner`
   * withdrawals, and those never get one).
   * The amount is the sum of the withdrawal's own requests (reason WITHDRAWAL): `refund_micros` when P12d computed
   * it, the owner's amount when P14c settled a withdrawal handed to the owner (whose `refund_micros` is null), plus
   * what the owner recorded as refunded in NETOPIA's admin for it (P12a's `billing.withdrawal_owner_settlement`).
   */
  private async withdrawalFollowUp(intent: RefundIntent): Promise<FollowUp> {
    const creditNote = await this.creditNote(intent);
    const charge = await this.deps.repository.charge(intent.chargeId);
    const customer = await this.deps.repository.customerByOwner(intent.ownerRef);
    if (charge === null || customer === null) {
      throw new TypedDomainError("BILLING_CUSTOMER_MISSING", "a withdrawal refund without its charge or customer");
    }
    return async (client, at) => {
      await creditNote(client, at);
      // Runs under the owner lock `recordRefunded` took before the REFUNDED row (its only caller).
      const events = await this.deps.repository.subscriptionEvents(charge.subscriptionId, client);
      const withdrawn = events.find((event) => event.kind === "WITHDRAWN");
      if (withdrawn === undefined) return;
      let refundMicros = 0;
      for (const row of await this.deps.repository.chargesForSubscription(charge.subscriptionId, client)) {
        const read = await this.deps.repository.charge(row.chargeId, client);
        const recorded = read?.events ?? [];
        for (const event of recorded) {
          const target = refundTarget(event);
          if (event.kind !== "REFUND_REQUESTED" || event.errorCode !== "WITHDRAWAL" || target === null) continue;
          // This transaction's REFUNDED is the row this very transaction has just written.
          const isThisRefund = row.chargeId === intent.chargeId && target === intent.transactionId;
          // N14: a request is refunded only once its REFUNDED parts cover it (the owner may record it in parts).
          const covered = read !== null && openOwnRequest(read, target)?.openMicros === 0;
          const refunded = isThisRefund || covered;
          if (!refunded) return;
          refundMicros += event.amountMicros ?? 0;
        }
      }
      // P14c: what the owner refunded in NETOPIA's admin for this withdrawal is part of the refund M8 names.
      refundMicros += (await this.deps.repository.withdrawalOwnerSettlement(charge.subscriptionId, client))
        ?.dashboardRefundMicros ?? 0;
      await enqueueEmail(this.deps.repository, client, {
        template: "M8", recipient: { kind: "CUSTOMER", customerId: customer.customerId },
        dedupeRef: charge.subscriptionId,
        params: { plan: withdrawn.planId, refundAmount: microsToDecimal(refundMicros) }, notBefore: at
      });
    };
  }

  // ---------------------------------------------------------------------------------------------------------------
  // N14 — NETOPIA (spec §2.12).
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Spec §2.12.1-2.12.3, inside the lease: another system's job dies (O2); an unrequested one moves nothing; the 0.00
   * card-check release is recorded with no call, ahead of the rest; a covered request is done; then API or owner mode.
   */
  private async netopiaMoveMoney(job: OutboxJob, intent: RefundIntent, charge: ChargeWithEvents, now: Date): Promise<OutboxOutcome> {
    const netopia = this.deps.netopia;
    if (!isThisPaymentSystem(charge, netopia.paymentEnvironment)) {
      return this.deadLetter(intent, otherPaymentSystem(this.deps.audit, job.kind).code, now);
    }
    if (!isRequested(charge, intent)) return this.deadLetter(intent, "REFUND_NOT_REQUESTED", now);
    if (intent.amountMicros === 0) {
      await this.recordRefunded(intent, now);
      return DONE;
    }
    if (openOwnRequest(charge, intent.transactionId)?.openMicros === 0) return DONE;
    // N15b (ruling PR-41), owner mode: a request on a payment already under a dispute is held, not handed to the owner
    // (no OWNER_REFUND_DUE, no O2_REFUND_DUE); the owner gets the O3 instead. The request stays open: a dispute won
    // brings it into O2_REFUND_REMINDER. The API mode checks the same after its look-first (`netopiaApiRefund`).
    if (netopia.payments.refund === undefined && heldByChargeback(charge, intent.transactionId)) return this.refundHeld(intent, charge, now);
    if (netopia.payments.refund !== undefined) return this.netopiaApiRefund(job, intent, charge, now);
    // §2.12.2 item 1: the owner refunds in NETOPIA's admin. The open REFUND_REQUESTED is what stays open.
    if (!await this.deps.jobs.markJobStage(job, "OWNER_REFUND_DUE")) return claimLost(now);
    const deadline = await this.withdrawalDeadlineOf(intent);
    const whole = wholePaymentOpen(charge, { intent, openMicros: intent.amountMicros });
    await this.deps.repository.withTransaction((client) => enqueueOnce({ repository: this.deps.repository, jobs: netopia.jobs }, client, emailJob({
      template: "O2_REFUND_DUE", recipient: { kind: "OWNER" }, dedupeRef: `${intent.chargeId}:${intent.transactionId}`,
      params: {
        chargeRef: intent.chargeId, paymentRef: intent.transactionId, refundAmount: microsToDecimal(intent.amountMicros),
        currency: charge.currency, refundReason: intent.reason, whole: whole ? "true" : "false",
        doneCommand: refundDoneCommand(intent.chargeId, intent.amountMicros),
        ...(deadline === null ? {} : { refundDeadline: deadline.toISOString() })
      },
      notBefore: now
    })));
    this.deps.audit("billing.refund.owner_due", { reason: intent.reason });
    return DONE;
  }

  /**
   * Spec §2.12.3 (dormant until N-10). A4 (c): after a first attempt, look first: a payment already REFUNDED is recorded,
   * never refunded again; a partial refund whose last call may have landed is never sent twice (O2).
   */
  private async netopiaApiRefund(job: OutboxJob, intent: RefundIntent, charge: ChargeWithEvents, now: Date): Promise<OutboxOutcome> {
    const payments = this.deps.netopia.payments;
    if (job.attempts > 1) {
      const stage = await this.deps.jobs.jobStage(job.jobId);
      const keep = stage === "PAYMENT_PROVIDER_UNAVAILABLE" || stage === "PAYMENT_CREDENTIALS_REFUSED" ? stage : null;
      let read: PaymentReportOrMissing;
      try {
        read = await payments.status({ orderId: intent.chargeId, providerPaymentId: intent.transactionId });
      } catch (error) {
        return this.again(job, intent, now, "REFUND_LOOKUP_UNAVAILABLE", paymentNothingSent(error), keep);
      }
      if (read !== "NO_SUCH_ORDER" && read.state === "REFUNDED") {
        await this.recordNetopiaRefund(intent, intent.amountMicros, now);
        return DONE;
      }
      if (!intent.whole && keep === null) {
        this.deps.audit("billing.refund.outcome_unknown", { reason: intent.reason });
        return this.deadLetter(intent, "REFUND_OUTCOME_UNKNOWN", now);
      }
    }
    // N15b (ruling PR-41): after the look-first (a refund NETOPIA already reports is still recorded), a payment under a
    // dispute never gets a new refund call: the request is held, and the owner gets the O3.
    if (heldByChargeback(charge, intent.transactionId)) return this.refundHeld(intent, charge, now);
    if (!await this.deps.jobs.markJobStage(job, "REFUND_CALL_STARTED")) return claimLost(now);
    try {
      await payments.refund!({ orderId: intent.chargeId, providerPaymentId: intent.transactionId, amountMicros: intent.amountMicros });
    } catch (error) {
      const code = paymentErrorCode(error) ?? "PAYMENT_OUTCOME_UNKNOWN";
      credentialsRefused(this.deps.audit, error, "refund");
      if (code === "PAYMENT_CONFIGURATION_REFUSED") {
        this.deps.audit("billing.refund.refused", { reason: intent.reason });
        return this.deadLetter(intent, code, now);
      }
      return this.again(job, intent, now, code, paymentNothingSent(error));
    }
    await this.recordNetopiaRefund(intent, intent.amountMicros, now);
    return DONE;
  }

  /**
   * N15b (ruling PR-41): a PAYMENT_REFUND job whose payment is `heldByChargeback` moves no money, writes no job stage
   * and ends DONE; its request stays open. The owner's one O3 (`queueRefundHeldAlert`), and the audit line
   * billing.refund.held_by_chargeback only when that O3 was queued now, so the line is once per payment.
   */
  private async refundHeld(intent: RefundIntent, charge: ChargeWithEvents, now: Date): Promise<OutboxOutcome> {
    const open = openOwnRequest(charge, intent.transactionId);
    if (open !== null && open.openMicros > 0
      && await queueRefundHeldAlert({ repository: this.deps.repository, jobs: this.deps.netopia.jobs }, charge, open, now)) {
      this.deps.audit("billing.refund.held_by_chargeback", { reason: open.intent.reason });
    }
    return DONE;
  }

  /**
   * Spec §2.12.2 item 4 / §2.12.4: REFUNDED at `amountMicros` on our open NETOPIA request, under the owner lock, never
   * above what is open. The closing part runs the follow-ups for the whole request; a smaller part keeps the rest open.
   */
  async recordNetopiaRefund(
    intent: RefundIntent, amountMicros: number, at: Date
  ): Promise<"RECORDED" | "PART_RECORDED" | "ALREADY_RECORDED"> {
    if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) {
      throw new TypedDomainError("REFUND_AMOUNT_INVALID", "a recorded refund is a positive whole number of micros");
    }
    const followUp = await this.followUp(intent);
    const result = await this.deps.repository.withTransaction(async (client): Promise<"RECORDED" | "PART_RECORDED" | "ALREADY_RECORDED"> => {
      await this.deps.jobs.lockOwner(client, intent.ownerRef);
      const current = await this.deps.repository.charge(intent.chargeId, client);
      const open = current === null ? null : openOwnRequest(current, intent.transactionId);
      if (open === null || open.openMicros === 0) return "ALREADY_RECORDED";
      if (amountMicros > open.openMicros) throw new TypedDomainError("REFUND_EXCEEDS_REQUEST", "more than the open refund request");
      const written = await this.deps.repository.appendChargeEvent(client, chargeEvent(intent.chargeId, "REFUNDED", at, {
        providerPaymentId: intent.transactionId, amountMicros, errorCode: intent.reason
      }));
      if (written === "DUPLICATE") return "ALREADY_RECORDED";
      if (amountMicros < open.openMicros) return "PART_RECORDED";
      await followUp(client, at);
      return "RECORDED";
    });
    if (result !== "ALREADY_RECORDED") this.deps.audit("billing.refund", { reason: intent.reason });
    return result;
  }

  /**
   * `pnpm billing:refund-done`'s first half: what it would record, and the email when this amount closes the request.
   * A request held by a charge-back (`heldByChargeback`) is refused with BILLING_REFUND_DONE_HELD_BY_CHARGEBACK unless
   * `despiteChargeback`; an open request of another payment of the charge that is not held is planned first.
   */
  async planOwnerRefund(
    chargeId: string, amountMicros: number, options: Readonly<{ despiteChargeback?: boolean }> = {}
  ): Promise<OwnerRefundPlan> {
    const despiteChargeback = options.despiteChargeback === true;
    const charge = await this.deps.repository.charge(chargeId);
    if (charge === null) throw new TypeError("BILLING_REFUND_DONE_CHARGE_NOT_FOUND");
    if (!isThisPaymentSystem(charge, this.deps.netopia.paymentEnvironment)) {
      throw new TypeError("BILLING_REFUND_DONE_OTHER_PAYMENT_SYSTEM");
    }
    const opens = charge.events.filter((event) => event.kind === "REFUND_REQUESTED" && event.providerPaymentId !== null)
      .map((event) => openOwnRequest(charge, event.providerPaymentId!))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null && candidate.openMicros > 0);
    const open = despiteChargeback ? opens[0] : opens.find((candidate) => !heldByChargeback(charge, candidate.intent.transactionId));
    if (open === undefined) {
      throw new TypeError(opens.length > 0 ? "BILLING_REFUND_DONE_HELD_BY_CHARGEBACK" : "BILLING_REFUND_DONE_NO_OPEN_REQUEST");
    }
    if (amountMicros <= 0 || amountMicros > open.openMicros) throw new TypeError("BILLING_REFUND_DONE_EXCEEDS_REQUEST");
    const restMicros = open.openMicros - amountMicros;
    return Object.freeze({
      chargeId, providerPaymentId: open.intent.transactionId, reason: open.intent.reason, currency: charge.currency,
      amountMicros, openMicros: open.openMicros, restMicros, mail: restMicros > 0 ? null : await this.followUpMail(open.intent),
      despiteChargeback
    });
  }

  /** The owner's command, its second half: records the plan's amount (the plan is re-checked under the lock). */
  async recordOwnerRefund(plan: OwnerRefundPlan, at: Date): Promise<"RECORDED" | "PART_RECORDED" | "ALREADY_RECORDED"> {
    const charge = await this.deps.repository.charge(plan.chargeId);
    const open = charge === null ? null : openOwnRequest(charge, plan.providerPaymentId);
    if (open === null) throw new TypeError("BILLING_REFUND_DONE_NO_OPEN_REQUEST");
    // N15b: the hold is checked again (a charge-back may have arrived since the plan), unless the owner's flag says so.
    if (!plan.despiteChargeback && heldByChargeback(charge!, plan.providerPaymentId)) {
      throw new TypeError("BILLING_REFUND_DONE_HELD_BY_CHARGEBACK");
    }
    const result = await this.recordNetopiaRefund(open.intent, plan.amountMicros, at);
    this.deps.audit("billing.refund.recorded_by_owner", { reason: plan.reason });
    return result;
  }

  /** The follow-up email of `intent`, as the customer will read it (rendered by the same catalogue as the sender). */
  private async followUpMail(intent: RefundIntent): Promise<Readonly<{ template: string; text: string }> | null> {
    const template = refundMailOf(intent.reason);
    if (template === null) return null;
    const customer = await this.deps.repository.customerByOwner(intent.ownerRef);
    const locale = customer?.locale ?? "en";
    const params: Record<string, string> = { refundAmount: microsToDecimal(intent.amountMicros) };
    if (template === "M11") {
      const endedPlan = await this.planEndedByRefusal(intent);
      if (endedPlan !== null) params.endedPlan = endedPlan;
    }
    if (template === "M8") {
      const charge = await this.deps.repository.charge(intent.chargeId);
      const events = charge === null ? [] : await this.deps.repository.subscriptionEvents(charge.subscriptionId);
      const withdrawn = events.find((event) => event.kind === "WITHDRAWN");
      if (charge === null || withdrawn === undefined) return null;
      let refundMicros = 0;
      for (const row of await this.deps.repository.chargesForSubscription(charge.subscriptionId)) {
        const read = await this.deps.repository.charge(row.chargeId);
        for (const event of read?.events ?? []) {
          if (event.kind === "REFUND_REQUESTED" && event.errorCode === "WITHDRAWAL") refundMicros += event.amountMicros ?? 0;
        }
      }
      refundMicros += (await this.deps.repository.withdrawalOwnerSettlement(charge.subscriptionId))?.dashboardRefundMicros ?? 0;
      params.plan = withdrawn.planId;
      params.refundAmount = microsToDecimal(refundMicros);
    }
    return Object.freeze({ template, text: renderMail(template as MailTemplateId, locale, params).text });
  }

  /**
   * Spec §2.12.2 item 3: one O2_REFUND_REMINDER a day listing every open owner refund, when one is due today. "NETOPIA
   * shows a refund": the charge's latest status read was REFUNDED (§2.12.4) or VOIDED (F2: a payment cancelled in
   * NETOPIA's admin is money back too). Returns the refunds listed (0: no email).
   */
  async remindOwnerRefunds(now: Date): Promise<number> {
    const netopia = this.deps.netopia;
    const lines: OwnerRefundLine[] = [];
    for (const row of await this.deps.repository.openOwnerRefunds(netopia.paymentEnvironment, [...REQUESTED_REASONS])) {
      const intent: RefundIntent = Object.freeze({
        chargeId: row.chargeId, transactionId: row.providerPaymentId, amountMicros: row.requestedMicros, whole: row.whole,
        ownerRef: row.ownerRef, reason: row.reason as RequestedRefundReason
      });
      const last = await this.deps.repository.lastStatusRead(row.chargeId);
      lines.push(Object.freeze({
        chargeId: row.chargeId, providerPaymentId: row.providerPaymentId, reason: row.reason, currency: row.currency,
        openMicros: row.requestedMicros - row.refundedMicros, whole: row.whole, requestedAt: row.requestedAt,
        deadline: await this.withdrawalDeadlineOf(intent),
        seenRefunded: last?.outcome === "REFUNDED" || last?.outcome === "VOIDED"
      }));
    }
    if (!lines.some((line) => refundReminderDue(line, now))) return 0;
    const queued = await this.deps.repository.withTransaction((client) => enqueueOnce({ repository: this.deps.repository, jobs: netopia.jobs }, client, emailJob({
      template: "O2_REFUND_REMINDER", recipient: { kind: "OWNER" }, dedupeRef: now.toISOString().slice(0, 10),
      params: { refundCount: String(lines.length), refundList: renderOwnerRefundList(lines) }, notBefore: now
    })));
    return queued ? lines.length : 0;
  }
}
