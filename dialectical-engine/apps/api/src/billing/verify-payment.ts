import { decimalToMicros, foldSubscription, type SubscriptionEvent } from "@debateai/billing-core";
import type {
  BillingJobQueries, BillingReadExecutor, BillingRepository, ChargeEventRow, ChargeKind, ChargeRow, CustomerXMoneyEnvironment,
  EntitlementRepository, LocationEvidenceRow, OutboxJob, QuoteRow
} from "@debateai/db";
import { decideCardCountry } from "@debateai/geo";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import type { XMoneyClient, XMoneyTransaction } from "@debateai/payments-xmoney";
import type { BillingPolicy, CountryPolicy } from "@debateai/register";
import type { PoolClient } from "pg";
import { credentialsRefused, type BillingAudit } from "./audit.js";
import type { NoticeOutcome, RequestedRefundReason } from "./codes.js";
import { locationVerdict } from "./location-verdict.js";
import { DONE, notFinalRetryAt, type OutboxHandler, type OutboxOutcome } from "./outbox.js";
import { openQuoteLocation, sealIpEvidence } from "./records.js";
import { covers, pendingRefund, refundedAlready, refundIntentOf, type RefundDesk } from "./refunds.js";
import { chargeEvent, refundTarget, subscriptionEvent } from "./rows.js";
import { enqueueInvoice, type ChargeSettlement, type SettlementContext, type SettlementPrepared } from "./settlement.js";

type ChargeWithEvents = ChargeRow & { events: ChargeEventRow[] };
type Owner = Readonly<{ ownerRef: string; quote: QuoteRow | null; customerId: string; events: ReadonlyArray<SubscriptionEvent> }>;
/** The payment a DUPLICATE_PAYMENT row records and gives back whole: its amount and the refund's reason. */
type SecondPayment = Readonly<{ amountMicros: number; reason: RequestedRefundReason }>;
/**
 * A RENEWAL/UPGRADE charge of the subscription a rebill of this amount may belong to: `OPEN` (no outcome, no other
 * transaction submitted: it can take the payment) or `PAID` (another transaction already paid it: A2's resubmit).
 */
type RebillCandidate = Readonly<{ state: "OPEN" | "PAID"; charge: ChargeWithEvents }>;
/**
 * A1: the charge a transaction settles (`CHARGE`); a second payment on an INITIAL/CARD_CHECK order already paid
 * (`DUPLICATE`); a second success there that may still be one of our rebills (`MAYBE_REBILL`); or a transaction
 * already recorded as a DUPLICATE_PAYMENT of a charge, whose later statuses are read there (`RECORDED_DUPLICATE`).
 */
type Resolved = Readonly<{ kind: "CHARGE" | "DUPLICATE" | "MAYBE_REBILL" | "RECORDED_DUPLICATE"; charge: ChargeWithEvents }>;

/** OpenAPI `Transaction.transactionSource`: what xMoney says made the transaction. */
const REBILL_SOURCES: ReadonlySet<string> = new Set(["re-bill", "re-bill-micro"]);
const NOT_REBILL_SOURCES: ReadonlySet<string> = new Set(["service-call", "card-change"]);
const NOT_FINAL_STATUSES: ReadonlySet<string> = new Set(["start", "in-progress", "3d-pending"]);

export type VerifyDeps = Readonly<{
  repository: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner" | "chargeIdForTransaction">;
  xmoney: Pick<XMoneyClient, "getTransaction" | "getOrder" | "getCard">;
  refunds: Pick<RefundDesk, "request" | "recordRefunded">;
  entitlements: Pick<EntitlementRepository, "append">;
  countryPolicy: CountryPolicy;
  policy: BillingPolicy;
  recordsKey: Buffer;
  audit: BillingAudit;
  /** D5 5h: the xMoney system this API talks to; a transaction id is matched only among its rows. */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
}>;

function amountMatches(decimal: string, micros: number): boolean {
  try {
    return decimalToMicros(decimal) === micros;
  } catch {
    return false;
  }
}

const notFinal = (job: OutboxJob, now: Date, code: string): OutboxOutcome =>
  Object.freeze({ kind: "RETRY" as const, code, retryAt: notFinalRetryAt(job.attempts, now) });

/** A second payment of the reused order itself: the order's own total, and a card check's second hold is released. */
const sameOrderPayment = (charge: ChargeRow): SecondPayment => Object.freeze({
  amountMicros: charge.totalMicros, reason: charge.kind === "CARD_CHECK" ? "CARD_CHECK_RELEASE" as const : "DUPLICATE_PAYMENT" as const
});

/**
 * Spec §2.5.4 VERIFY_PAYMENT: the only place a payment changes state. It reads xMoney server to server; the
 * browser and the notice are only triggers.
 */
export class VerifyPaymentHandler {
  private readonly settlements = new Map<ChargeKind, ChargeSettlement>();

  constructor(private readonly deps: VerifyDeps) {}

  registerSettlement(kind: ChargeKind, settlement: ChargeSettlement): void {
    if (this.settlements.has(kind)) throw new TypeError(`BILLING_SETTLEMENT_DUPLICATE:${kind}`);
    this.settlements.set(kind, settlement);
  }

  /** A credentials refusal (D5 5i) raises the operator alarm; the worker's failure schedule retries the check. */
  readonly handle: OutboxHandler = async (job, now) => {
    try {
      return await this.run(job, now);
    } catch (error) {
      credentialsRefused(this.deps.audit, error, "verify");
      throw error;
    }
  };

  /** `linked`: this run follows the unmatched-rebill path's own SUBMITTED link, so it never links a second time. */
  private async run(job: OutboxJob, now: Date, linked = false): Promise<OutboxOutcome> {
    const transaction = await this.deps.xmoney.getTransaction(job.ref);
    const noticeId = typeof job.payload.notice_id === "string" ? job.payload.notice_id : null;
    // A9: a representment finds its own target (the charged-back charge) and is never a payment, so it is dispatched
    // before A1's matching, which would read it as a second success on the order. D5 5g: a refund that is its own
    // transaction belongs to the charge of the payment it names, never to its order's merchant id.
    if (transaction.transactionType === "representment") return this.represented(job, transaction, noticeId, now);
    if (transaction.transactionType === "refund") return this.refundTransaction(job, transaction, noticeId, now);
    const resolved = await this.resolveCharge(transaction, job.payload);
    if (resolved === null) return notFinal(job, now, "CHARGE_NOT_FOUND");
    const { charge } = resolved;
    if (transaction.currency !== "USD") {
      this.deps.audit("billing.payment.mismatch", { chargeKind: charge.kind });
      await this.outcome(noticeId, now, "MISMATCH");
      return DONE;
    }
    if (resolved.kind === "MAYBE_REBILL") {
      // Wait for the rebill's SUBMITTED on the not-final schedule. Its amount is the renewal's or the upgrade's, never
      // the order's first charge (an upgrade, a tax change, a card change's 1.00 CARD_CHECK order), so it is never
      // checked against `charge`: at the schedule's end it is linked to its open charge, or refunded whole.
      const retryAt = notFinalRetryAt(job.attempts, now);
      if (retryAt !== null) return Object.freeze({ kind: "RETRY" as const, code: "CHARGE_NOT_FOUND", retryAt });
      if (linked) return notFinal(job, now, "CHARGE_NOT_FOUND");
      const settled = await this.settleUnmatchedRebill(charge, transaction, noticeId, now);
      return settled === "LINKED" ? this.run(job, now, true) : settled;
    }
    // The order's own amount binds only a payment of the order itself: its charge, or a second payment of it. A
    // recorded duplicate's later statuses are read against its own DUPLICATE_PAYMENT row.
    if ((resolved.kind === "CHARGE" || resolved.kind === "DUPLICATE") && !amountMatches(transaction.amountDecimal, charge.totalMicros)) {
      this.deps.audit("billing.payment.mismatch", { chargeKind: charge.kind });
      await this.outcome(noticeId, now, "MISMATCH");
      return DONE;
    }
    if (resolved.kind === "DUPLICATE") {
      return this.duplicatePayment(charge, transaction, noticeId, now);
    }
    if (resolved.kind === "RECORDED_DUPLICATE") return this.duplicateStatus(job, charge, transaction, noticeId, now);
    switch (transaction.status) {
      case "start":
      case "in-progress":
      case "3d-pending":
        return notFinal(job, now, "PAYMENT_NOT_FINAL");
      case "complete-ok":
        return this.succeeded(charge, transaction, noticeId, now);
      case "complete-failed":
        return this.failed(charge, transaction, noticeId, now, "PAYMENT_DECLINED");
      case "refund-ok":
        return this.refunded(charge, transaction, noticeId, now);
      case "void-ok":
      case "cancel-ok":
        return this.voided(charge, transaction, noticeId, now);
      case "charge-back":
        return this.chargedBack(charge, transaction, noticeId, now);
      default:
        return exhaustive(transaction.status);
    }
  }

  /**
   * A1: the job's own charge id, then our SUBMITTED record, then a DUPLICATE_PAYMENT already recorded, then
   * (INITIAL/CARD_CHECK only) the order's merchant id. Every lookup stays inside this API's xMoney system (D5 5h).
   */
  private async resolveCharge(transaction: XMoneyTransaction, payload: OutboxJob["payload"]): Promise<Resolved | null> {
    const environment = this.deps.xmoneyEnvironment;
    const own = typeof payload.charge_id === "string" ? payload.charge_id : null;
    const submitted = own ?? await this.deps.jobs.chargeIdForTransaction(transaction.transactionId, "SUBMITTED", environment);
    if (submitted !== null) {
      const found = await this.deps.repository.charge(submitted);
      return found === null ? null : Object.freeze({ kind: "CHARGE" as const, charge: found });
    }
    const duplicateOf = await this.deps.jobs.chargeIdForTransaction(transaction.transactionId, "DUPLICATE_PAYMENT", environment);
    if (duplicateOf !== null) {
      const found = await this.deps.repository.charge(duplicateOf);
      return found === null ? null : Object.freeze({ kind: "RECORDED_DUPLICATE" as const, charge: found });
    }
    const external = transaction.externalOrderId
      ?? (typeof payload.external_order_id === "string" ? payload.external_order_id : null)
      ?? (await this.deps.xmoney.getOrder(transaction.orderId)).externalOrderId;
    if (external === null || !/^[0-9a-f]{32}$/.test(external)) return null;
    const charge = await this.deps.repository.charge(external);
    if (charge === null || (charge.kind !== "INITIAL" && charge.kind !== "CARD_CHECK")) return null;
    if (charge.xmoneyEnvironment !== environment) return null;
    const paidByAnother = transaction.status === "complete-ok"
      && charge.events.some((event) => event.kind === "SUCCEEDED" && event.xmoneyTransactionId !== transaction.transactionId);
    if (!paidByAnother) return Object.freeze({ kind: "CHARGE" as const, charge });
    // A second success on an order already paid: a rebill whose SUBMITTED row is not written yet (wait for it on the
    // not-final schedule), or the person paid the reused order twice (refund it).
    return Object.freeze({ kind: await this.mayBeOurRebill(charge, transaction) ? "MAYBE_REBILL" as const : "DUPLICATE" as const, charge });
  }

  /**
   * Whether a second success on an INITIAL/CARD_CHECK order can be one of our rebills. xMoney's own label decides
   * when it gives a known one. Without one, our records do: A1 writes REQUESTED before every rebill, so a rebill of
   * ours has a RENEWAL or UPGRADE charge of the same amount, created no later than the transaction (whole-second
   * precision, a few seconds of clock skew), either open (not yet linked to another transaction) or already paid by
   * another one (A2's resubmit: this is the lost first submission).
   */
  private async mayBeOurRebill(charge: ChargeWithEvents, transaction: XMoneyTransaction): Promise<boolean> {
    const source = transaction.transactionSource;
    if (source !== null && REBILL_SOURCES.has(source)) return true;
    if (source !== null && NOT_REBILL_SOURCES.has(source)) return false;
    // No transaction is open here: the reads take the pool (P1b's default executor). A charge of this amount already
    // paid by another transaction (A2's resubmit) makes it one of ours as surely as an open one.
    return (await this.rebillCandidates(charge.subscriptionId, transaction)).length > 0;
  }

  /**
   * The RENEWAL/UPGRADE charges of the subscription a rebill of this transaction's amount may belong to, created no
   * later than the transaction (whole-second precision, a few seconds of clock skew): `OPEN` when it has no outcome and
   * no other transaction submitted, `PAID` when another transaction already paid it. Oldest first. Every read runs on
   * `client`: the caller's transaction under the owner lock, or (undefined) the pool when no transaction is open.
   */
  private async rebillCandidates(
    subscriptionId: string, transaction: XMoneyTransaction, client?: BillingReadExecutor
  ): Promise<RebillCandidate[]> {
    const skewMs = 5_000;
    const createdBy = transaction.createdAt === null ? Number.POSITIVE_INFINITY
      : Math.floor(transaction.createdAt.getTime() / 1_000) * 1_000 + 1_000 + skewMs;
    const candidates: RebillCandidate[] = [];
    for (const row of await this.deps.repository.chargesForSubscription(subscriptionId, client)) {
      if (row.kind !== "RENEWAL" && row.kind !== "UPGRADE") continue;
      if (!amountMatches(transaction.amountDecimal, row.totalMicros)) continue;
      if (row.createdAt.getTime() > createdBy) continue;
      const found = await this.deps.repository.charge(row.chargeId, client);
      if (found === null) continue;
      const paidByAnother = found.events.some((event) => event.kind === "SUCCEEDED" && event.xmoneyTransactionId !== transaction.transactionId);
      const closed = found.events.some((event) => event.kind === "SUCCEEDED" || event.kind === "FAILED");
      const submittedOther = found.events.some((event) => event.kind === "SUBMITTED" && event.xmoneyTransactionId !== transaction.transactionId);
      if (paidByAnother) candidates.push(Object.freeze({ state: "PAID" as const, charge: found }));
      else if (!closed && !submittedOther) candidates.push(Object.freeze({ state: "OPEN" as const, charge: found }));
    }
    return candidates.sort((left, right) => left.charge.createdAt.getTime() - right.charge.createdAt.getTime());
  }

  /**
   * A rebill-looking success on an INITIAL/CARD_CHECK order that the not-final schedule never matched to a SUBMITTED
   * (a lost rebill answer that adoption missed). Never kept as a MISMATCH, whatever its amount. Under the owner lock,
   * with the transaction's own amount:
   * (a) an OPEN RENEWAL/UPGRADE charge of this amount takes it: SUBMITTED is written, and the caller's same check then
   *     verifies it as that charge's payment ("LINKED"); nothing is refunded;
   * (b) else a PAID one (A2's resubmit paid it) records it as its DUPLICATE_PAYMENT and refunds it whole;
   * (c) else (no candidate, or its charge closed FAILED(NO_TRANSACTION)) the order's own charge records it as its
   *     DUPLICATE_PAYMENT (P1a's per-transaction limit counts that row's own amount) and refunds it whole.
   * (b) and (c) refund with reason DUPLICATE_PAYMENT (M11_DUPLICATE): a rebill is a captured payment, never a
   * card-check hold to release, and it is never skipped for a zero card-check hold.
   */
  private async settleUnmatchedRebill(
    orderCharge: ChargeWithEvents, transaction: XMoneyTransaction, noticeId: string | null, now: Date
  ): Promise<OutboxOutcome | "LINKED"> {
    let amountMicros: number;
    try {
      amountMicros = decimalToMicros(transaction.amountDecimal);
    } catch {
      // An amount that cannot be read cannot be refunded to the cent: the owner's (P14a lists it).
      this.deps.audit("billing.payment.mismatch", { chargeKind: orderCharge.kind });
      await this.outcome(noticeId, now, "MISMATCH");
      return DONE;
    }
    const owner = await this.owner(orderCharge);
    const settled = await this.deps.repository.withTransaction(async (client): Promise<"LINKED" | ChargeKind | null> => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      const candidates = await this.rebillCandidates(orderCharge.subscriptionId, transaction, client);
      const open = candidates.find((candidate) => candidate.state === "OPEN");
      if (open !== undefined) {
        // A written SUBMITTED, or one a concurrent link wrote first: either way the re-run matches it (A1 step 2).
        await this.deps.repository.appendChargeEvent(client, chargeEvent(open.charge.chargeId, "SUBMITTED", now, {
          xmoneyTransactionId: transaction.transactionId, amountMicros: open.charge.totalMicros, errorCode: null
        }));
        return "LINKED";
      }
      const target = candidates.find((candidate) => candidate.state === "PAID")?.charge ?? orderCharge;
      const recorded = await this.recordDuplicatePayment(client, target, transaction, owner.ownerRef, noticeId, now, {
        amountMicros, reason: "DUPLICATE_PAYMENT"
      });
      return recorded ? target.kind : null;
    });
    if (settled === "LINKED") return "LINKED";
    if (settled === null) await this.outcome(noticeId, now, "DUPLICATE");
    else this.deps.audit("billing.payment.duplicate", { chargeKind: settled });
    return DONE;
  }

  /**
   * D5 5f / D7 #5: a second payment on a charge another transaction already paid (a reused checkout paid twice, or a
   * card check paid twice) pays for nothing. It is recorded on the SAME charge (`recordDuplicatePayment`) and goes back
   * whole through the one refund executor (R-32). No settlement, no evidence, no invoice, no subscription event.
   */
  private async duplicatePayment(charge: ChargeWithEvents, transaction: XMoneyTransaction, noticeId: string | null, now: Date): Promise<OutboxOutcome> {
    const owner = await this.owner(charge);
    const recorded = await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      return this.recordDuplicatePayment(client, charge, transaction, owner.ownerRef, noticeId, now, sameOrderPayment(charge));
    });
    if (recorded) this.deps.audit("billing.payment.duplicate", { chargeKind: charge.kind });
    else await this.outcome(noticeId, now, "DUPLICATE");
    return DONE;
  }

  /**
   * In the caller's transaction, under the owner lock: `DUPLICATE_PAYMENT` for this transaction on this charge, of
   * `paid.amountMicros` (P1a's one-payment-per-transaction index answers DUPLICATE when it was recorded already, as a
   * SUCCEEDED or as this), then the whole-transaction refund intent with `paid.reason` (`DUPLICATE_PAYMENT`:
   * M11_DUPLICATE, never a credit note; a reused card-check order's second hold is released as `CARD_CHECK_RELEASE`)
   * and the notice outcome DUPLICATE. False: nothing new was recorded.
   */
  private async recordDuplicatePayment(
    client: PoolClient, charge: ChargeRow, transaction: XMoneyTransaction, ownerRef: string, noticeId: string | null, now: Date,
    paid: SecondPayment
  ): Promise<boolean> {
    // P1a's `charge_event_second_payment_is_money`: a zero-amount hold (X0 may switch the card check to 0) holds nothing.
    if (paid.amountMicros === 0) return false;
    const written = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "DUPLICATE_PAYMENT", now, {
      xmoneyTransactionId: transaction.transactionId, amountMicros: paid.amountMicros, errorCode: null,
      xmoneyCreatedAt: transaction.createdAt
    }));
    if (written === "DUPLICATE") return false;
    await this.deps.refunds.request(client, {
      chargeId: charge.chargeId, transactionId: transaction.transactionId, amountMicros: paid.amountMicros,
      whole: true, ownerRef, reason: paid.reason
    }, now);
    await this.outcome(noticeId, now, "DUPLICATE", client);
    return true;
  }

  /**
   * A later status of a transaction recorded as a DUPLICATE_PAYMENT: its refund (ours) finishing, a replay, or a
   * chargeback on money we give back anyway. Nothing here changes the subscription.
   */
  private async duplicateStatus(
    job: OutboxJob, charge: ChargeWithEvents, transaction: XMoneyTransaction, noticeId: string | null, now: Date
  ): Promise<OutboxOutcome> {
    if (NOT_FINAL_STATUSES.has(transaction.status)) return notFinal(job, now, "PAYMENT_NOT_FINAL");
    if (transaction.status === "refund-ok" || transaction.status === "void-ok" || transaction.status === "cancel-ok") {
      const pending = pendingRefund(charge, transaction.transactionId);
      const intent = pending === null ? null : refundIntentOf(charge, pending);
      if (intent !== null) {
        await this.deps.refunds.recordRefunded(intent, now);
        await this.outcome(noticeId, now, "REFUNDED");
        return DONE;
      }
    }
    if (transaction.status === "charge-back"
      && !charge.events.some((event) => event.kind === "CHARGEBACK" && event.xmoneyTransactionId === transaction.transactionId)) {
      // The duplicate's own amount (an unmatched rebill's is not the charge total).
      const recorded = charge.events.find((event) => event.kind === "DUPLICATE_PAYMENT" && event.xmoneyTransactionId === transaction.transactionId);
      await this.deps.repository.withTransaction(async (client) => {
        await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "CHARGEBACK", now, {
          xmoneyTransactionId: transaction.transactionId, amountMicros: recorded?.amountMicros ?? charge.totalMicros,
          errorCode: "DUPLICATE_PAYMENT"
        }));
        await this.outcome(noticeId, now, "CHARGEBACK", client);
      });
      this.deps.audit("billing.chargeback", { chargeKind: charge.kind, code: "DUPLICATE_PAYMENT" });
      return DONE;
    }
    await this.outcome(noticeId, now, "DUPLICATE");
    return DONE;
  }

  private settlementFor(kind: ChargeKind): ChargeSettlement {
    const settlement = this.settlements.get(kind);
    if (settlement === undefined) throw new TypedDomainError("BILLING_SETTLEMENT_UNREGISTERED", "no settlement for this charge kind");
    return settlement;
  }

  /** A CARD_CHECK charge has no quote (0086 `charge_card_check_has_no_quote`); every other kind must have one. */
  private async owner(charge: ChargeRow): Promise<Owner> {
    const events = await this.deps.repository.subscriptionEvents(charge.subscriptionId);
    const ownerRef = charge.ownerRef;
    const quote = charge.quoteId === null ? null : await this.deps.repository.quote(charge.quoteId, ownerRef);
    if (quote === null && charge.kind !== "CARD_CHECK") throw new TypedDomainError("BILLING_QUOTE_MISSING", "a charge without its quote");
    const customer = await this.deps.repository.customerByOwner(ownerRef);
    if (customer === null) throw new TypedDomainError("BILLING_CUSTOMER_MISSING", "a charge without its customer");
    return Object.freeze({ ownerRef, quote, customerId: customer.customerId, events });
  }

  /**
   * The subscription folded afresh under the owner lock, for the settlement that writes next. Read on the
   * transaction's own client: never a second pool connection while this one is held.
   */
  private async context(
    client: PoolClient, charge: ChargeRow, transaction: XMoneyTransaction | null, owner: Owner, now: Date,
    cardCountry: string | null = null, prepared: SettlementPrepared = {}
  ): Promise<SettlementContext> {
    const events = await this.deps.repository.subscriptionEvents(charge.subscriptionId, client);
    return Object.freeze({
      client, now, charge, transaction, subscription: foldSubscription(events), events,
      quote: owner.quote, ownerRef: owner.ownerRef, customerId: owner.customerId, cardCountry, prepared
    });
  }

  private async outcome(noticeId: string | null, now: Date, outcome: NoticeOutcome, client?: PoolClient): Promise<void> {
    if (noticeId === null) return;
    if (client !== undefined) {
      await this.deps.repository.recordNoticeOutcome(client, { noticeId, at: now, outcome });
      return;
    }
    await this.deps.repository.withTransaction((own) => this.deps.repository.recordNoticeOutcome(own, { noticeId, at: now, outcome }));
  }

  /**
   * A payment we refuse ends what it paid for: a CREATED checkout is abandoned; a live plan paid with a card from an
   * always-blocked country ends at once and the person is on Free. An ENDED subscription stays as it is. A refused
   * CARD_CHECK (P12e: a new card from a blocked country, or the planned release) pays for nothing: the hold is
   * released and the subscription keeps its plan and its old card; RefundDesk sends nothing for CARD_CHECK_REFUSED
   * (and nothing for CARD_CHECK_RELEASE).
   */
  private async endRefusedPayment(context: SettlementContext, reason: RequestedRefundReason): Promise<void> {
    const { client, now, subscription } = context;
    if (context.charge.kind === "CARD_CHECK") return;
    if (subscription.status === "CREATED") {
      await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "ENDED", now, { cause: "ABANDONED", reason }));
      return;
    }
    if (reason === "CARD_COUNTRY_BLOCKED" && (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE")) {
      await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "ENDED", now, { cause: "CANCEL", reason }));
      await this.deps.entitlements.append(client, {
        ownerRef: context.ownerRef, planId: "FREE", periodAnchorAt: subscription.periodAnchorAt ?? now, cause: "ENDED_CANCEL",
        effectiveAt: now, subscriptionId: subscription.subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
      });
    }
  }

  private async succeeded(charge: ChargeWithEvents, transaction: XMoneyTransaction, noticeId: string | null, now: Date): Promise<OutboxOutcome> {
    if (charge.events.some((event) => event.kind === "SUCCEEDED" && event.xmoneyTransactionId === transaction.transactionId)) {
      // Seen before. A refund we requested for it is the XMONEY_REFUND job's to finish.
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    const settlement = this.settlementFor(charge.kind);
    const owner = await this.owner(charge);
    const location = owner.quote === null ? null
      : openQuoteLocation(this.deps.recordsKey, owner.quote.quoteId, owner.quote.locationCiphertext);
    const card = transaction.cardId === null ? null : await this.deps.xmoney.getCard(transaction.cardId, transaction.customerId);
    const cardCountry = card?.countryCode ?? null;
    const countryConfirmed = owner.events.find((event) => event.kind === "CREATED")?.data.country_confirmed === true;
    // A card check pays nothing and has no stored location: it gets no evidence row and no invoice.
    const verdict = location === null ? null : locationVerdict({
      declaredCountry: location.country, ipCountry: location.ipCountry, cardCountry, countryConfirmed,
      card: decideCardCountry(this.deps.countryPolicy, { declaredCountry: location.country, cardCountry })
    });
    const ipEvidence = location === null ? null : sealIpEvidence(this.deps.recordsKey, charge.chargeId, location.ip);
    // The settlement's reads with no transaction-client form, made before the transaction takes its connection.
    const prepared = verdict === "BLOCKED" || settlement.prepare === undefined ? {} : await settlement.prepare(charge);
    const result = await this.deps.repository.withTransaction(async (client): Promise<"APPLIED" | "REFUND" | "DUPLICATE" | "DUPLICATE_PAYMENT"> => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      // `at` is the verification instant (the fold's activatedAt, D6b's withdrawal); `xmoneyCreatedAt` is when the
      // money moved, which P1b's quarter rows date the sale by (D5 5m).
      const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "SUCCEEDED", now, {
        xmoneyTransactionId: transaction.transactionId, amountMicros: charge.totalMicros, errorCode: null,
        xmoneyCreatedAt: transaction.createdAt
      }));
      if (inserted === "DUPLICATE") {
        // D5 5f: which payment holds the charge? The same transaction is a replay. Another one committed first (two
        // payments of one order verified at once): this one is the second payment, recorded and refunded here.
        const recorded = await this.deps.repository.succeededTransaction(client, charge.chargeId);
        if (recorded === null || recorded === transaction.transactionId) return "DUPLICATE";
        return await this.recordDuplicatePayment(client, charge, transaction, owner.ownerRef, noticeId, now, sameOrderPayment(charge))
          ? "DUPLICATE_PAYMENT" : "DUPLICATE";
      }
      if (location !== null && verdict !== null && ipEvidence !== null) {
        await this.deps.repository.insertLocationEvidence(client, Object.freeze({
          chargeId: charge.chargeId, ipCountry: location.ipCountry, declaredCountry: location.country, cardCountry, verdict,
          ipCiphertext: ipEvidence.ciphertext, keyId: ipEvidence.keyId, at: now
        }) satisfies LocationEvidenceRow);
      }
      const context = await this.context(client, charge, transaction, owner, now, cardCountry, prepared);
      const settled = verdict === "BLOCKED"
        ? Object.freeze({ kind: "REFUND" as const, reason: "CARD_COUNTRY_BLOCKED" as const })
        : await settlement.succeeded(context);
      if (settled.kind === "REFUND") {
        await this.endRefusedPayment(context, settled.reason);
        // R-32: the whole transaction goes back through the one refund executor.
        await this.deps.refunds.request(client, {
          chargeId: charge.chargeId, transactionId: transaction.transactionId, amountMicros: charge.totalMicros,
          whole: true, ownerRef: owner.ownerRef, reason: settled.reason
        }, now);
        await this.outcome(noticeId, now, "REFUNDING", client);
        return "REFUND";
      }
      if (charge.kind !== "CARD_CHECK" && owner.quote !== null && location !== null) {
        await enqueueInvoice(this.deps.repository, client, {
          charge, quote: owner.quote, policy: this.deps.policy, cardCountry, ipCountry: location.ipCountry, now
        });
      }
      await this.outcome(noticeId, now, "APPLIED", client);
      return "APPLIED";
    });
    switch (result) {
      case "APPLIED":
        this.deps.audit("billing.payment.verified", { chargeKind: charge.kind, planId: owner.quote?.planId ?? null, verdict: verdict ?? "NONE" });
        return DONE;
      case "DUPLICATE":
        await this.outcome(noticeId, now, "DUPLICATE");
        return DONE;
      case "DUPLICATE_PAYMENT":
        this.deps.audit("billing.payment.duplicate", { chargeKind: charge.kind });
        return DONE;
      case "REFUND":
        return DONE;
      default:
        return exhaustive(result);
    }
  }

  private async failed(charge: ChargeWithEvents, transaction: XMoneyTransaction, noticeId: string | null, now: Date, errorCode: string): Promise<OutboxOutcome> {
    if (charge.events.some((event) => event.kind === "FAILED" && event.xmoneyTransactionId === transaction.transactionId)) {
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    const settlement = this.settlementFor(charge.kind);
    const owner = await this.owner(charge);
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "FAILED", now, {
        xmoneyTransactionId: transaction.transactionId, amountMicros: charge.totalMicros, errorCode
      }));
      if (inserted === "DUPLICATE") return;
      await settlement.failed({ ...(await this.context(client, charge, transaction, owner, now)), errorCode });
      await this.outcome(noticeId, now, "FAILED", client);
    });
    this.deps.audit("billing.payment.failed", { chargeKind: charge.kind, code: errorCode });
    return DONE;
  }

  /** A4(c): our own requested refund that went through is only recorded. Every other refund is P9c's. */
  private async refunded(charge: ChargeWithEvents, transaction: XMoneyTransaction, noticeId: string | null, now: Date): Promise<OutboxOutcome> {
    const pending = pendingRefund(charge, transaction.transactionId);
    const intent = pending === null ? null : refundIntentOf(charge, pending);
    if (intent !== null) {
      await this.deps.refunds.recordRefunded(intent, now);
      await this.outcome(noticeId, now, "REFUNDED");
      return DONE;
    }
    if (refundedAlready(charge, transaction.transactionId)) {
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    throw new TypedDomainError("BILLING_REVERSAL_UNHANDLED", "a refund we did not request");
  }

  /** D5 5g: the charge that recorded the payment a `refund` transaction names (as SUCCEEDED or DUPLICATE_PAYMENT). */
  private async paymentOf(refund: XMoneyTransaction): Promise<Readonly<{ charge: ChargeWithEvents; paymentId: string }> | null> {
    for (const paymentId of refund.relatedTransactionIds) {
      const chargeId = await this.deps.jobs.chargeIdForTransaction(paymentId, "SUCCEEDED", this.deps.xmoneyEnvironment)
        ?? await this.deps.jobs.chargeIdForTransaction(paymentId, "DUPLICATE_PAYMENT", this.deps.xmoneyEnvironment);
      const charge = chargeId === null ? null : await this.deps.repository.charge(chargeId);
      if (charge !== null) return Object.freeze({ charge, paymentId });
    }
    return null;
  }

  /**
   * D5 5g: a refund xMoney reports as its own transaction. It finishes OUR pending refund of that payment when one of
   * at least its amount is open (recorded on this refund transaction, naming the payment), and is a replay when the
   * payment already holds its REFUNDED. Any other refund of that payment was made elsewhere: P9c's.
   */
  private async refundTransaction(job: OutboxJob, transaction: XMoneyTransaction, noticeId: string | null, now: Date): Promise<OutboxOutcome> {
    const found = await this.paymentOf(transaction);
    if (found === null) return notFinal(job, now, "CHARGE_NOT_FOUND");
    if (NOT_FINAL_STATUSES.has(transaction.status)) return notFinal(job, now, "PAYMENT_NOT_FINAL");
    const { charge, paymentId } = found;
    if (transaction.status !== "complete-ok"
      || charge.events.some((event) => event.kind === "REFUNDED" && event.xmoneyTransactionId === transaction.transactionId)) {
      // A refund that failed moved nothing; one recorded already is a replay.
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    const pending = pendingRefund(charge, paymentId);
    const intent = pending === null ? null : refundIntentOf(charge, pending);
    if (intent !== null && covers(transaction.amountDecimal, intent.amountMicros)) {
      await this.deps.refunds.recordRefunded(intent, now, transaction.transactionId, transaction.createdAt);
      await this.outcome(noticeId, now, "REFUNDED");
      return DONE;
    }
    const ours = charge.events.some((event) => event.kind === "REFUNDED" && refundTarget(event) === paymentId
      && event.errorCode !== "PROVIDER_REFUND" && event.errorCode !== "PROVIDER_VOID"
      && amountMatches(transaction.amountDecimal, event.amountMicros ?? -1));
    if (ours) {
      // Our refund was recorded when its call answered (on the payment's own row); this is its own report of it.
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    return this.providerRefundTransaction(charge, paymentId, transaction, noticeId, now);
  }

  /** P9c: a refund made elsewhere, reported as its own transaction with its amount. */
  private async providerRefundTransaction(
    _charge: ChargeWithEvents, _paymentId: string, _transaction: XMoneyTransaction, _noticeId: string | null, _now: Date
  ): Promise<OutboxOutcome> {
    throw new TypedDomainError("BILLING_REVERSAL_UNHANDLED", "a refund transaction we did not request");
  }

  private async voided(_charge: ChargeWithEvents, _transaction: XMoneyTransaction, _noticeId: string | null, _now: Date): Promise<OutboxOutcome> {
    throw new TypedDomainError("BILLING_REVERSAL_UNHANDLED", "a void or a cancel");
  }

  private async chargedBack(_charge: ChargeWithEvents, _transaction: XMoneyTransaction, _noticeId: string | null, _now: Date): Promise<OutboxOutcome> {
    throw new TypedDomainError("BILLING_REVERSAL_UNHANDLED", "a chargeback");
  }

  private async represented(_job: OutboxJob, _transaction: XMoneyTransaction, _noticeId: string | null, _now: Date): Promise<OutboxOutcome> {
    throw new TypedDomainError("BILLING_REVERSAL_UNHANDLED", "a representment");
  }
}
