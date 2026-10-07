import type { PoolClient } from "pg";
import {
  decimalToMicros, microsToDecimal, paymentErrorCode, paymentNothingSent, withdrawalRefundDeadline,
  type CardPayments, type PaymentEnvironment
} from "@debateai/billing-core";
import type {
  BillingJobQueries, BillingRepository, ChargeEventRow, ChargeRow, CustomerXMoneyEnvironment, OutboxJob
} from "@debateai/db";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { renderMail, type MailTemplateId } from "@debateai/mail-templates";
import type { XMoneyClient, XMoneyTransaction } from "@debateai/payments-xmoney";
import type { BillingPolicy } from "@debateai/register";
import { credentialsRefused, rejectedRows, type BillingAudit } from "./audit.js";
import type { RequestedRefundReason } from "./codes.js";
import { emailJob, enqueueEmail, type BillingMailTemplateId } from "./email-job.js";
import {
  claimLost, DONE, enqueueOnce, failureRetryAt, otherPaymentSystem, otherXMoneySystem, type OutboxHandler, type OutboxOutcome
} from "./outbox.js";
import { chargeEvent, refundTarget } from "./rows.js";
import { enqueueCreditNote } from "./settlement.js";

/*
 * Q-5: every dead end of a refund job below goes through `deadLetter`, which queues the owner email O2 before the
 * job dies. Only an unreadable payload (`REFUND_PAYLOAD_INVALID`) dies without it: it names no charge or amount.
 */

/** One transaction's money going back (A4a: the unit of the refund-sum guard and of the XMONEY_REFUND job). */
export type RefundIntent = Readonly<{
  chargeId: string;
  transactionId: string;
  amountMicros: number;
  /** The whole transaction: xMoney is called without an amount (the void of an uncaptured hold, A12). */
  whole: boolean;
  ownerRef: string;
  reason: RequestedRefundReason;
}>;

export type PaidTransaction = Readonly<{
  chargeId: string; transactionId: string; paidMicros: number; refundedMicros: number; succeededAt: Date;
  /**
   * A refund made at xMoney, not by us (P9c `PROVIDER_REFUND` / `PROVIDER_VOID`), touched this transaction. Its true
   * refunded amount is unknown (xMoney's read shows none), so `refundedMicros` is an upper bound: a withdrawal over
   * such a transaction goes to the owner (P12d), never settled from this figure.
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
/** Refused by xMoney as fraud-related: a card from an always-blocked country (a payment, or P12e's new card). */
const FRAUD_REASONS: ReadonlySet<string> = new Set<RequestedRefundReason>(["CARD_COUNTRY_BLOCKED", "CARD_CHECK_REFUSED"]);
/**
 * Failures that prove xMoney processed nothing (P3b: a refused connection, a 429, a 401/403). A partial refund after
 * one of them may be sent again, and the job is retried for as long as they last, never killed (D5 5i).
 */
const NOTHING_SENT: ReadonlySet<string> = new Set(["XMONEY_UNAVAILABLE", "XMONEY_CREDENTIALS_REFUSED"]);
/** How often a job keeps coming back once the failure schedule is spent, while nothing could be sent. */
const KEEP_TRYING_MS = 12 * 3_600_000;

const dead = (code: string): OutboxOutcome => Object.freeze({ kind: "DEAD" as const, code });
/** A refund call's failure code; anything untyped may have reached xMoney, so it never reads as "not sent". */
const codeOf = (error: unknown): string => error instanceof TypedDomainError ? error.code : "XMONEY_OUTCOME_UNKNOWN";

/** Whether `amountMicros` is less than the whole transaction (an unreadable amount counts as partial: fail closed). */
function isPartOf(amountMicros: number, transaction: XMoneyTransaction): boolean {
  try {
    return amountMicros < decimalToMicros(transaction.amountDecimal);
  } catch {
    return true;
  }
}

/** Whether a listed refund of `decimal` covers `amountMicros` (an unreadable amount covers nothing: fail closed). */
export function covers(decimal: string, amountMicros: number): boolean {
  try {
    return decimalToMicros(decimal) >= amountMicros;
  } catch {
    return false;
  }
}

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
 * A4(b): what each paid transaction since `since` took and what already went back. Per transaction the larger of
 * "asked" (REFUND_REQUESTED) and "reported" (REFUNDED) counts, as P1a's refund-sum guard does; a REFUNDED row of a
 * refund that is its own xMoney transaction counts against the payment it names (D5 5g). A CARD_CHECK hold is not a
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

/** Our REFUND_REQUESTED for this paid transaction that has no REFUNDED (on it, or naming it) yet, if any. */
export function pendingRefund(charge: Readonly<{ events: ReadonlyArray<ChargeEventRow> }>, transactionId: string): ChargeEventRow | null {
  const requested = charge.events.find((event) => event.kind === "REFUND_REQUESTED" && event.providerPaymentId === transactionId);
  if (requested === undefined) return null;
  return charge.events.some((event) => event.kind === "REFUNDED" && refundTarget(event) === transactionId) ? null : requested;
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
  const refunded = charge.events.filter((event) => event.kind === "REFUNDED" && refundTarget(event) === paymentId)
    .reduce((total, event) => total + (event.amountMicros ?? 0), 0);
  return Object.freeze({ intent, openMicros: Math.max(intent.amountMicros - refunded, 0) });
}

/** Whether a request gives back the WHOLE payment it names (the payment's own amount, nothing recorded of it yet). */
function wholePaymentOpen(
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

/** Skeleton §1 rule 2: what a NETOPIA refund needs. Absent: this API serves no NETOPIA refund (they end OTHER_PAYMENT_SYSTEM). */
export type NetopiaRefundDeps = Readonly<{
  /** `refund` is absent until NETOPIA confirms its refund call (N-10): the owner mode (§2.12.2). */
  payments: Pick<CardPayments, "status" | "refund">;
  paymentEnvironment: PaymentEnvironment;
  /** The reminder's once-a-day check. */
  jobs: Pick<BillingJobQueries, "outboxJobExists">;
}>;

/**
 * R-32: THE refund executor. Every refund we make (a refused card, a duplicate plan, a withdrawal, a card-check
 * release) is an intent written in the caller's transaction plus a refund job (PAYMENT_REFUND on NETOPIA, N14;
 * XMONEY_REFUND on xMoney until N23); the job moves the money (on NETOPIA, for now, hands it to the owner), looks
 * before any second call (A4c) and writes REFUNDED with the reason's follow-up. It never cancels an order (A4d).
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
    /** `listTransactions`: A4(c)'s look for a refund that is its own transaction (D5 5g). */
    xmoney: Pick<XMoneyClient, "refund" | "getTransaction" | "listTransactions">;
    policy: BillingPolicy;
    audit: BillingAudit;
    clock: () => Date;
    /**
     * P2-I4 (D5 5h): the xMoney system `xmoney` talks to (`connectors.xmoneyEnvironment`). A job whose charge was
     * paid in the other one (a sandbox refund still queued after README §14.8's switch to live) ends DEAD before any
     * call, with O2: a sandbox transaction id is never sent to live xMoney.
     */
    xmoneyEnvironment: CustomerXMoneyEnvironment;
    /** N14: NETOPIA's port and environment (optional so the xMoney harnesses compile unchanged until N23). */
    netopia?: NetopiaRefundDeps;
  }>) {}

  /** A4(a), inside the caller's transaction: the intent is on record, and its job queued, before money moves. */
  async request(client: PoolClient, intent: RefundIntent, at: Date): Promise<"REQUESTED" | "DUPLICATE"> {
    const written = await this.deps.repository.appendChargeEvent(client, chargeEvent(intent.chargeId, "REFUND_REQUESTED", at, {
      providerPaymentId: intent.transactionId, amountMicros: intent.amountMicros, errorCode: intent.reason
    }));
    if (written === "DUPLICATE") return "DUPLICATE";
    // Skeleton §1 rule 2: a NETOPIA payment's refund is PAYMENT_REFUND; an xMoney one keeps XMONEY_REFUND until N23.
    const charge = await this.deps.repository.charge(intent.chargeId, client);
    await this.deps.repository.enqueue(client, {
      kind: charge?.paymentProvider === "netopia" ? "PAYMENT_REFUND" : "XMONEY_REFUND",
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
   * holds a refund request (UNIQUE (charge, transaction, REFUND_REQUESTED): ours, or a refund made at xMoney, P9c)
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
   * The XMONEY_REFUND and PAYMENT_REFUND handler (registered in `createBillingRuntime`). The call runs under a
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
    // Skeleton §1 rule 2: a NETOPIA charge takes the owner mode or the API mode (N23 deletes the xMoney code below).
    if (charge.paymentProvider === "netopia") return this.netopiaMoveMoney(job, intent, charge, now);
    // A refund already recorded has nothing left to do in either system (a job that died between its REFUNDED row and
    // its completion): it ends DONE quietly. Any other job of the other system ends here, before any lookup or call.
    if (refundedAlready(charge, intent.transactionId)) return DONE;
    if (charge.paymentProvider !== "xmoney" || charge.paymentEnvironment !== this.deps.xmoneyEnvironment) {
      return this.deadLetter(intent, otherXMoneySystem(this.deps.audit, job.kind).code, now);
    }
    // P2-I5 (1): a job its charge records no request for (a forged or corrupted outbox row) moves no money; it ends
    // here, before any lookup or call, and the owner is told (O2). The 0086 guard would fire only on REFUNDED, after.
    if (!isRequested(charge, intent)) return this.deadLetter(intent, "REFUND_NOT_REQUESTED", now);
    // P2-M4: a 0.00 card-check hold (A12 allows it, if X0 switches the hold to 0) holds no money, so there is nothing
    // to release at xMoney. Its release is recorded at once (REFUNDED at 0, which 0086 accepts only for such a hold),
    // with no call, as `recordDuplicatePayment` skips a zero second hold: no refund is left owed and `deadRefunds`
    // never counts it. `isRequested` has matched the 0 against the charge's own SUCCEEDED amount. No zero intent ever
    // reaches xMoney (whole, it would be a call without an amount).
    if (intent.amountMicros === 0) {
      await this.recordRefunded(intent, now);
      return DONE;
    }
    if (job.attempts > 1) {
      // The stage the last CALL left, read once, inside the lease: XMONEY_UNAVAILABLE / XMONEY_CREDENTIALS_REFUSED
      // prove it sent nothing; REFUND_CALL_STARTED (a process died during it) or any other code proves nothing.
      const stage = await this.deps.jobs.jobStage(job.jobId);
      const keep = stage !== null && NOTHING_SENT.has(stage) ? stage : null;
      // A4(c): an earlier attempt may have moved the money; a refund (or the void of a hold) already made is recorded.
      let transaction: XMoneyTransaction;
      try {
        transaction = await this.deps.xmoney.getTransaction(intent.transactionId);
      } catch (error) {
        // A lookup never proves anything about a call: it keeps a not-sent stage the last call established, and
        // otherwise records its own code. No refund call was made in this attempt, so the last call's proof stands.
        return this.again(job, intent, now, "REFUND_LOOKUP_UNAVAILABLE", this.nothingSent(error), keep);
      }
      if (transaction.status === "refund-ok" || transaction.status === "void-ok") {
        await this.recordRefunded(intent, now);
        return DONE;
      }
      // D5 5g: a refund is reported as its own `refund` transaction naming the payment. One of at least this amount is
      // ours, landed; it is recorded on that transaction (provisional until X0 (g)/(h) show xMoney's real report).
      const landed = await this.landedRefund(intent, transaction, now);
      if (landed === "UNAVAILABLE" || landed === "UNREADABLE") {
        return this.again(job, intent, now, "REFUND_LOOKUP_UNAVAILABLE", landed === "UNAVAILABLE", keep);
      }
      if (landed !== null) {
        await this.recordRefunded(intent, now, landed.transactionId, landed.createdAt);
        return DONE;
      }
      // No row for it: a partial refund an earlier attempt may have made still leaves the payment complete-ok. It is
      // sent again only when the last CALL proved nothing was sent (P3b's XMONEY_UNAVAILABLE or a credentials
      // refusal); otherwise never twice, and the owner checks it (P16's summary, P14a's listing). A full-amount
      // refund that landed reads refund-ok, so complete-ok there means it did not: calling again is safe.
      if (!intent.whole && isPartOf(intent.amountMicros, transaction) && keep === null) {
        this.deps.audit("billing.refund.outcome_unknown", { reason: intent.reason });
        return this.deadLetter(intent, "REFUND_OUTCOME_UNKNOWN", now);
      }
    }
    // Recorded before the call: a process that dies during it leaves this stage, which never reads as "not sent".
    // P2-M6: only the job's current claim holder records it; a stale holder (another worker claimed the job after this
    // one's lease ran out) stops here, before the call.
    if (!await this.deps.jobs.markJobStage(job, "REFUND_CALL_STARTED")) return claimLost(now);
    try {
      await this.deps.xmoney.refund({
        transactionId: intent.transactionId,
        amountDecimal: intent.whole ? null : microsToDecimal(intent.amountMicros),
        reason: FRAUD_REASONS.has(intent.reason) ? "fraud-confirm" : "customer-demand",
        message: intent.reason
      });
    } catch (error) {
      const code = codeOf(error);
      if (code === "XMONEY_REFUSED") {
        this.deps.audit("billing.refund.refused", { reason: intent.reason });
        return this.deadLetter(intent, "XMONEY_REFUSED", now);
      }
      // The code is kept as the job's stage: XMONEY_UNAVAILABLE / XMONEY_CREDENTIALS_REFUSED mean nothing was sent.
      return this.again(job, intent, now, code, this.nothingSent(error));
    }
    await this.recordRefunded(intent, now);
    return DONE;
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
   * P2-W4: two more dead ends stop before any xMoney call, so O2 never says "xMoney refused" for them.
   * REFUND_CHARGE_MISSING (the job names a charge we do not have) is no refund to make either, so it takes the
   * not-requested sentences and ref. OTHER_XMONEY_SYSTEM (the payment was taken in the other xMoney system) has its own
   * sentences (`otherSystem`) and ref: nothing was sent and nothing is owed on this server, and this API never sees
   * that system's refunds, so it carries no deadline ("M8 follows by itself" would be false). Neither carries a reason:
   * no recorded request was checked, so it is only the job's claim.
   */
  private async deadLetter(intent: RefundIntent, code: string, now: Date): Promise<OutboxOutcome> {
    const notRequested = code === "REFUND_NOT_REQUESTED" || code === "REFUND_CHARGE_MISSING";
    const otherSystem = code === "OTHER_XMONEY_SYSTEM" || code === "OTHER_PAYMENT_SYSTEM";
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
   * A `refund` transaction xMoney lists for this payment, of at least the intent's amount. No listing: UNAVAILABLE
   * when the failure proved xMoney processed nothing (an outage, a revoked key), UNREADABLE otherwise.
   */
  private async landedRefund(
    intent: RefundIntent, payment: XMoneyTransaction, now: Date
  ): Promise<XMoneyTransaction | null | "UNAVAILABLE" | "UNREADABLE"> {
    const rejected = rejectedRows(this.deps.audit, "refund");
    try {
      const listed = await this.deps.xmoney.listTransactions({
        from: payment.createdAt ?? new Date(now.getTime() - 120 * 86_400_000), to: now, orderId: payment.orderId,
        dateType: "refund", onRejected: rejected.onRejected
      });
      return listed.find((candidate) => candidate.transactionType === "refund"
        && candidate.relatedTransactionIds.includes(intent.transactionId) && candidate.status === "complete-ok"
        && covers(candidate.amountDecimal, intent.amountMicros)) ?? null;
    } catch (error) {
      return this.nothingSent(error) ? "UNAVAILABLE" : "UNREADABLE";
    } finally {
      rejected.report();
    }
  }

  /** D5 5i: whether `error` proves xMoney processed nothing (it also raises the credentials alarm). */
  private nothingSent(error: unknown): boolean {
    credentialsRefused(this.deps.audit, error, "refund");
    return error instanceof TypedDomainError && NOTHING_SENT.has(error.code);
  }

  /**
   * REFUNDED once per paid transaction (P1a's unique keys), with the reason's follow-up in one transaction. For a
   * refund xMoney reported as its own transaction, the row is written on that transaction and names the payment it
   * refunds (`refundsTransactionId`, D5 5g), with that refund transaction's `creationDate` (D5 5m: the quarter rows
   * date the refund by it). A refund read from the payment's own status carries no such time. Every recording takes
   * the owner lock first, before the REFUNDED row.
   * P2-M6: one refund can reach here twice at once from two API processes: RefundDesk with the call's answer (a row on
   * the payment) and VERIFY_PAYMENT with xMoney's own refund transaction naming the payment (a row on that
   * transaction). The two rows have different keys, and 0086's sum guard lets both in while the refund is at most half
   * the payment, so the unique keys alone cannot stop the second. Under the owner lock the charge is read again on the
   * transaction's own connection, and a refund whose payment already holds a REFUNDED (`refundedAlready`) is recorded
   * already: nothing more is written and no follow-up runs (no second credit note, no second M8).
   */
  async recordRefunded(
    intent: RefundIntent, at: Date, refundTransactionId: string | null = null, refundCreatedAt: Date | null = null
  ): Promise<void> {
    const followUp = await this.followUp(intent);
    await this.deps.repository.withTransaction(async (client) => {
      // The owner lock comes first, then the charge's refund lock that 0086's trigger takes on the REFUNDED insert:
      // this is the order the withdrawal and VERIFY_PAYMENT's refund writers use, and the WITHDRAWAL follow-up
      // decides on M8 under the owner lock.
      await this.deps.jobs.lockOwner(client, intent.ownerRef);
      const current = await this.deps.repository.charge(intent.chargeId, client);
      if (current !== null && refundedAlready(current, intent.transactionId)) return;
      const written = await this.deps.repository.appendChargeEvent(client, chargeEvent(intent.chargeId, "REFUNDED", at, {
        providerPaymentId: refundTransactionId ?? intent.transactionId, amountMicros: intent.amountMicros,
        errorCode: intent.reason, refundsTransactionId: refundTransactionId === null ? null : intent.transactionId,
        providerCreatedAt: refundTransactionId === null ? null : refundCreatedAt
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
   * refund of the withdrawal is recorded — never before the money moved, and never for a refund xMoney refused
   * (that job dies and P14a/P16b list it for the owner). One M8 per withdrawal rests on three things: (1) the owner
   * lock, which `recordRefunded` takes before the REFUNDED row, serializes the refund recordings of one withdrawal, so
   * exactly one of them sees every refund recorded; (2) a repeated REFUNDED returns before its follow-up runs; (3) the
   * ref `M8:<subscriptionId>` only absorbs a second M8 while the first is still unsent (`enqueue`'s open-job key), so
   * no WITHDRAWAL request may be added after M8 has gone out (P14c settles only unsettled `refund_by_owner`
   * withdrawals, and those never get one).
   * The amount is the sum of the withdrawal's own requests (reason WITHDRAWAL): `refund_micros` when P12d computed
   * it, the owner's amount when P14c settled a withdrawal handed to the owner (whose `refund_micros` is null), plus
   * what the owner recorded as refunded in the xMoney dashboard for it (P12a's `billing.withdrawal_owner_settlement`).
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
          // D5 5g: a REFUNDED may sit on xMoney's own refund transaction, naming the payment in
          // `refundsTransactionId`; `refundTarget` reads both shapes, never the transaction id alone. N14: a NETOPIA
          // request is refunded only once its REFUNDED parts cover it (the owner may record it in parts).
          const covered = read !== null && read.paymentProvider === "netopia"
            ? openOwnRequest(read, target)?.openMicros === 0
            : recorded.some((other) => other.kind === "REFUNDED" && refundTarget(other) === target);
          const refunded = isThisRefund || covered;
          if (!refunded) return;
          refundMicros += event.amountMicros ?? 0;
        }
      }
      // P14c: what the owner refunded in the xMoney dashboard for this withdrawal is part of the refund M8 names.
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
  // N14 — NETOPIA (spec §2.12). N23 deletes the xMoney members above.
  // ---------------------------------------------------------------------------------------------------------------

  /**
   * Spec §2.12.1-2.12.3, inside the lease: another system's job dies (O2); an unrequested one moves nothing; the 0.00
   * card-check release is recorded with no call, ahead of the rest; a covered request is done; then API or owner mode.
   */
  private async netopiaMoveMoney(job: OutboxJob, intent: RefundIntent, charge: ChargeWithEvents, now: Date): Promise<OutboxOutcome> {
    const netopia = this.deps.netopia;
    if (netopia === undefined || charge.paymentEnvironment !== netopia.paymentEnvironment) {
      return this.deadLetter(intent, otherPaymentSystem(this.deps.audit, job.kind).code, now);
    }
    if (!isRequested(charge, intent)) return this.deadLetter(intent, "REFUND_NOT_REQUESTED", now);
    if (intent.amountMicros === 0) {
      await this.recordRefunded(intent, now);
      return DONE;
    }
    if (openOwnRequest(charge, intent.transactionId)?.openMicros === 0) return DONE;
    if (netopia.payments.refund !== undefined) return this.netopiaApiRefund(job, intent, now);
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
  private async netopiaApiRefund(job: OutboxJob, intent: RefundIntent, now: Date): Promise<OutboxOutcome> {
    const payments = this.deps.netopia!.payments;
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
    if (!await this.deps.jobs.markJobStage(job, "REFUND_CALL_STARTED")) return claimLost(now);
    try {
      await payments.refund!({ orderId: intent.chargeId, providerPaymentId: intent.transactionId, amountMicros: intent.amountMicros });
    } catch (error) {
      const code = paymentErrorCode(error) ?? "PAYMENT_OUTCOME_UNKNOWN";
      if (code === "PAYMENT_CREDENTIALS_REFUSED") this.deps.audit("billing.payment.credentials_refused", { operation: "refund" });
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

  /** `pnpm billing:refund-done`'s first half: what it would record, and the email when this amount closes the request. */
  async planOwnerRefund(chargeId: string, amountMicros: number): Promise<OwnerRefundPlan> {
    const charge = await this.deps.repository.charge(chargeId);
    if (charge === null) throw new TypeError("BILLING_REFUND_DONE_CHARGE_NOT_FOUND");
    const netopia = this.deps.netopia;
    if (netopia === undefined || charge.paymentProvider !== "netopia" || charge.paymentEnvironment !== netopia.paymentEnvironment) {
      throw new TypeError("BILLING_REFUND_DONE_OTHER_PAYMENT_SYSTEM");
    }
    const open = charge.events.filter((event) => event.kind === "REFUND_REQUESTED" && event.providerPaymentId !== null)
      .map((event) => openOwnRequest(charge, event.providerPaymentId!))
      .find((candidate) => candidate !== null && candidate.openMicros > 0) ?? null;
    if (open === null) throw new TypeError("BILLING_REFUND_DONE_NO_OPEN_REQUEST");
    if (amountMicros <= 0 || amountMicros > open.openMicros) throw new TypeError("BILLING_REFUND_DONE_EXCEEDS_REQUEST");
    const restMicros = open.openMicros - amountMicros;
    return Object.freeze({
      chargeId, providerPaymentId: open.intent.transactionId, reason: open.intent.reason, currency: charge.currency,
      amountMicros, openMicros: open.openMicros, restMicros, mail: restMicros > 0 ? null : await this.followUpMail(open.intent)
    });
  }

  /** The owner's command, its second half: records the plan's amount (the plan is re-checked under the lock). */
  async recordOwnerRefund(plan: OwnerRefundPlan, at: Date): Promise<"RECORDED" | "PART_RECORDED" | "ALREADY_RECORDED"> {
    const charge = await this.deps.repository.charge(plan.chargeId);
    const open = charge === null ? null : openOwnRequest(charge, plan.providerPaymentId);
    if (open === null) throw new TypeError("BILLING_REFUND_DONE_NO_OPEN_REQUEST");
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
   * shows a refund": the charge's latest status read was REFUNDED (§2.12.4). Returns the refunds listed (0: no email).
   */
  async remindOwnerRefunds(now: Date): Promise<number> {
    const netopia = this.deps.netopia;
    if (netopia === undefined) return 0;
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
        deadline: await this.withdrawalDeadlineOf(intent), seenRefunded: last?.outcome === "REFUNDED"
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
