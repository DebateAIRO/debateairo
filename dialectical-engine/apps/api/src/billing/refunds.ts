import type { PoolClient } from "pg";
import { decimalToMicros, microsToDecimal } from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository, ChargeEventRow, ChargeRow, OutboxJob } from "@debateai/db";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import type { XMoneyClient, XMoneyTransaction } from "@debateai/payments-xmoney";
import type { BillingPolicy } from "@debateai/register";
import { credentialsRefused, rejectedRows, type BillingAudit } from "./audit.js";
import type { RequestedRefundReason } from "./codes.js";
import { enqueueEmail, type BillingMailTemplateId } from "./email-job.js";
import { DONE, failureRetryAt, type OutboxHandler, type OutboxOutcome } from "./outbox.js";
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

const REQUESTED_REASONS: ReadonlySet<string> = new Set<RequestedRefundReason>([
  "CARD_COUNTRY_BLOCKED", "ALREADY_SUBSCRIBED", "SUBSCRIPTION_ENDED", "WITHDRAWAL", "CARD_CHECK_RELEASE",
  "CARD_CHECK_REFUSED", "DUPLICATE_PAYMENT"
]);
const PROVIDER_REASONS: ReadonlySet<string> = new Set(["PROVIDER_REFUND", "PROVIDER_VOID"]);
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
      if (event.kind !== "SUCCEEDED" || event.xmoneyTransactionId === null || event.at.getTime() < since.getTime()) continue;
      const transactionId = event.xmoneyTransactionId;
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
  const requested = charge.events.find((event) => event.kind === "REFUND_REQUESTED" && event.xmoneyTransactionId === transactionId);
  if (requested === undefined) return null;
  return charge.events.some((event) => event.kind === "REFUNDED" && refundTarget(event) === transactionId) ? null : requested;
}

/** Whether this paid transaction already holds a REFUNDED row, its own or a separate refund transaction's. */
export function refundedAlready(charge: Readonly<{ events: ReadonlyArray<ChargeEventRow> }>, transactionId: string): boolean {
  return charge.events.some((event) => event.kind === "REFUNDED" && refundTarget(event) === transactionId);
}

/** The intent behind one of OUR requests; a provider refund's REFUND_REQUESTED (P9c) is not one. */
export function refundIntentOf(charge: ChargeRow, event: ChargeEventRow): RefundIntent | null {
  if (event.kind !== "REFUND_REQUESTED" || event.xmoneyTransactionId === null || event.amountMicros === null
    || event.errorCode === null || !REQUESTED_REASONS.has(event.errorCode)) return null;
  return Object.freeze({
    chargeId: charge.chargeId, transactionId: event.xmoneyTransactionId, amountMicros: event.amountMicros, whole: false,
    ownerRef: charge.ownerRef, reason: event.errorCode as RequestedRefundReason
  });
}

function intentOfJob(job: OutboxJob): RefundIntent | null {
  const { charge_id: chargeId, transaction_id: transactionId, amount_micros: amountMicros, whole, owner_ref: ownerRef, reason } = job.payload;
  if (typeof chargeId !== "string" || typeof transactionId !== "string" || typeof ownerRef !== "string"
    || typeof amountMicros !== "number" || !Number.isSafeInteger(amountMicros) || amountMicros <= 0
    || typeof whole !== "boolean" || typeof reason !== "string" || !REQUESTED_REASONS.has(reason)) return null;
  return Object.freeze({ chargeId, transactionId, amountMicros, whole, ownerRef, reason: reason as RequestedRefundReason });
}

/**
 * R-32: THE refund executor. Every refund we make (a refused card, a duplicate plan, a withdrawal, a card-check
 * release) is an intent written in the caller's transaction plus an XMONEY_REFUND job; the job moves the money,
 * looks before any second call (A4c) and writes REFUNDED with the reason's follow-up. It never cancels an order (A4d).
 */
export class RefundDesk {
  constructor(private readonly deps: Readonly<{
    repository: Pick<BillingRepository,
      "withTransaction" | "appendChargeEvent" | "enqueue" | "charge" | "quote" | "customerByOwner"
      | "subscriptionEvents" | "chargesForSubscription">;
    /** The per-transaction lease around the refund call (defense in depth beside P7's claim re-assert), the job's
     * call stage, and the owner lock P12d's WITHDRAWAL follow-up takes before it decides on M8. */
    jobs: Pick<BillingJobQueries, "withLease" | "markJobStage" | "jobStage" | "lockOwner">;
    /** `listTransactions`: A4(c)'s look for a refund that is its own transaction (D5 5g). */
    xmoney: Pick<XMoneyClient, "refund" | "getTransaction" | "listTransactions">;
    policy: BillingPolicy;
    audit: BillingAudit;
    clock: () => Date;
  }>) {}

  /** A4(a), inside the caller's transaction: the intent is on record, and its job queued, before money moves. */
  async request(client: PoolClient, intent: RefundIntent, at: Date): Promise<"REQUESTED" | "DUPLICATE"> {
    const written = await this.deps.repository.appendChargeEvent(client, chargeEvent(intent.chargeId, "REFUND_REQUESTED", at, {
      xmoneyTransactionId: intent.transactionId, amountMicros: intent.amountMicros, errorCode: intent.reason
    }));
    if (written === "DUPLICATE") return "DUPLICATE";
    await this.deps.repository.enqueue(client, {
      kind: "XMONEY_REFUND", ref: `${intent.chargeId}:${intent.transactionId}`, notBefore: at,
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
   * The XMONEY_REFUND handler (registered in `createBillingRuntime`). The call runs under a per-transaction session
   * lease, and the charge is re-read INSIDE it, so two processes holding the job can never both refund: the second
   * finds the lease busy, or the REFUNDED the first one wrote.
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
    if (refundedAlready(charge, intent.transactionId)) return DONE;
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
    await this.deps.jobs.markJobStage(job.jobId, "REFUND_CALL_STARTED");
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
   */
  private async deadLetter(intent: RefundIntent, code: string, now: Date): Promise<OutboxOutcome> {
    await this.deps.repository.withTransaction((client) => enqueueEmail(this.deps.repository, client, {
      template: "O2", recipient: { kind: "OWNER" }, dedupeRef: `${intent.chargeId}:${intent.transactionId}`,
      params: { chargeRef: intent.chargeId, refundAmount: microsToDecimal(intent.amountMicros), reasonCode: code },
      notBefore: now
    }));
    return dead(code);
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
   * date the refund by it). A refund read from the payment's own status carries no such time. A WITHDRAWAL refund
   * takes the owner lock first, before the REFUNDED row; no other reason takes it.
   */
  async recordRefunded(
    intent: RefundIntent, at: Date, refundTransactionId: string | null = null, refundCreatedAt: Date | null = null
  ): Promise<void> {
    const followUp = await this.followUp(intent);
    await this.deps.repository.withTransaction(async (client) => {
      // The owner lock comes first, then the charge's refund lock that 0086's trigger takes on the REFUNDED insert:
      // this is the order the withdrawal and VERIFY_PAYMENT's refund writers use, and the WITHDRAWAL follow-up
      // decides on M8 under the owner lock.
      if (intent.reason === "WITHDRAWAL") await this.deps.jobs.lockOwner(client, intent.ownerRef);
      const written = await this.deps.repository.appendChargeEvent(client, chargeEvent(intent.chargeId, "REFUNDED", at, {
        xmoneyTransactionId: refundTransactionId ?? intent.transactionId, amountMicros: intent.amountMicros,
        errorCode: intent.reason, refundsTransactionId: refundTransactionId === null ? null : intent.transactionId,
        xmoneyCreatedAt: refundTransactionId === null ? null : refundCreatedAt
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

  /** What follows a refund we made: the person's email, or the credit note for a charge that was invoiced. */
  private async followUp(intent: RefundIntent): Promise<FollowUp> {
    switch (intent.reason) {
      case "CARD_COUNTRY_BLOCKED":
        return this.mail(intent, "M11", intent.chargeId);
      case "ALREADY_SUBSCRIBED":
      case "SUBSCRIPTION_ENDED":
        return this.mail(intent, "M11_DUPLICATE", intent.chargeId);
      case "DUPLICATE_PAYMENT":
        // One charge can take more than one duplicate: each refunded transaction gets its own email.
        return this.mail(intent, "M11_DUPLICATE", `${intent.chargeId}:${intent.transactionId}`);
      case "WITHDRAWAL":
        return this.withdrawalFollowUp(intent);
      case "CARD_CHECK_RELEASE":
        return async () => undefined;
      case "CARD_CHECK_REFUSED":
        return async () => undefined;
      default:
        return exhaustive(intent.reason);
    }
  }

  private async mail(intent: RefundIntent, template: BillingMailTemplateId, dedupeRef: string): Promise<FollowUp> {
    const customer = await this.deps.repository.customerByOwner(intent.ownerRef);
    if (customer === null) throw new TypedDomainError("BILLING_CUSTOMER_MISSING", "a refund without its customer");
    return async (client, at) => {
      await enqueueEmail(this.deps.repository, client, {
        template, recipient: { kind: "CUSTOMER", customerId: customer.customerId }, dedupeRef,
        params: { refundAmount: microsToDecimal(intent.amountMicros) }, notBefore: at
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
   * it, the owner's amount when P14c settled a withdrawal handed to the owner (whose `refund_micros` is null).
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
          // `refundsTransactionId`; `refundTarget` reads both shapes, never the transaction id alone.
          const refunded = isThisRefund || recorded.some((other) => other.kind === "REFUNDED" && refundTarget(other) === target);
          if (!refunded) return;
          refundMicros += event.amountMicros ?? 0;
        }
      }
      await enqueueEmail(this.deps.repository, client, {
        template: "M8", recipient: { kind: "CUSTOMER", customerId: customer.customerId },
        dedupeRef: charge.subscriptionId,
        params: { plan: withdrawn.planId, refundAmount: microsToDecimal(refundMicros) }, notBefore: at
      });
    };
  }
}
