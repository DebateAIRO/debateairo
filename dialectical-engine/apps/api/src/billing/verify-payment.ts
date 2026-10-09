import {
  foldSubscription, invoiceIssuerFor, paymentErrorCode, type CardPayments, type PaymentEnvironment,
  type PaymentReport, type SubscriptionEvent
} from "@debateai/billing-core";
import type {
  BillingJobQueries, BillingRepository, ChargeEventRow, ChargeKind, ChargeRow,
  EntitlementRepository, LocationEvidenceRow, NoticeOutcome as PaymentNoticeOutcome, OutboxJob, PaymentNoticeRow, QuoteRow
} from "@debateai/db";
import { decideCardCountry } from "@debateai/geo";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { netopiaAmountToMicros, statusToState } from "@debateai/payments-netopia";
import type { BillingPolicy, CountryPolicy } from "@debateai/register";
import type { PoolClient } from "pg";
import { answerRejected, credentialsRefused, type BillingAudit } from "./audit.js";
import { adoptingKindOf, chooseAdoptableToken, writeCardSaved, type AdoptingKind } from "./card-adoption.js";
import { REFUND_REASONS_REFUSING_THE_PAYMENT, type RequestedRefundReason } from "./codes.js";
import { enqueueEmail } from "./email-job.js";
import { locationVerdict } from "./location-verdict.js";
import { clientIdOf } from "./netopia-payer.js";
import {
  DONE, isThisPaymentSystem, notFinalRetryAt, otherPaymentSystem, type OutboxHandler, type OutboxOutcome
} from "./outbox.js";
import { queuePaymentAlert } from "./payment-alert.js";
import { openQuoteLocation, sealIpEvidence } from "./records.js";
import {
  heldByChargeback, openOwnRequest, PAUSED_EMAIL_SENTENCE, queueRefundHeldAlert, refundedAlready, refundedMicros,
  wholePaymentOpen, type RefundDesk, type RefundIntent
} from "./refunds.js";
import { retiredVerifyJob } from "./retired-jobs.js";
import { chargeEvent, subscriptionEvent } from "./rows.js";
import {
  enqueueCreditNote, enqueueInvoice, type ChargeSettlement, type SettledPayment, type SettlementContext, type SettlementPrepared
} from "./settlement.js";
import { writeDunningEnd } from "./settlement-renewal.js";

type ChargeWithEvents = ChargeRow & { events: ChargeEventRow[] };
type Owner = Readonly<{ ownerRef: string; quote: QuoteRow | null; customerId: string; events: ReadonlyArray<SubscriptionEvent> }>;
/** Skeleton §1 rule 2: what the NETOPIA path needs. */
export type NetopiaVerifyDeps = Readonly<{
  payments: Pick<CardPayments, "status">;
  /** N8's `BillingConnectors.paymentEnvironment`: a NETOPIA charge of another environment is another system's. */
  paymentEnvironment: PaymentEnvironment;
  /** `queuePaymentAlert`'s once-only check. */
  jobs: Pick<BillingJobQueries, "outboxJobExists">;
}>;

export type VerifyDeps = Readonly<{
  repository: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner">;
  refunds: Pick<RefundDesk, "request" | "recordNetopiaRefund">;
  entitlements: Pick<EntitlementRepository, "append">;
  countryPolicy: CountryPolicy;
  policy: BillingPolicy;
  recordsKey: Buffer;
  audit: BillingAudit;
  /** N10: the NETOPIA path's deps (spec §2.8). */
  netopia: NetopiaVerifyDeps;
}>;

const notFinal = (job: OutboxJob, now: Date, code: string): OutboxOutcome =>
  Object.freeze({ kind: "RETRY" as const, code, retryAt: notFinalRetryAt(job.attempts, now) });

/** The plan states that keep a card (spec §2.15.4). */
const CARD_HOLDING: ReadonlySet<string> = new Set(["ACTIVE", "PAST_DUE", "SUSPENDED"]);
/**
 * Spec §2.13 / A9: the refund reasons that mean a payment bought nothing (a refusal, a second payment, a card check's
 * hold). A charge-back of such a payment is recorded with the code DUPLICATE_PAYMENT and never changes a plan. So is a
 * charge-back of a CARD_CHECK charge, and of a charge never seen paid (it holds no SUCCEEDED; none is invented for it).
 */
const BOUGHT_NOTHING: ReadonlySet<string> = new Set<string>([
  ...REFUND_REASONS_REFUSING_THE_PAYMENT, "DUPLICATE_PAYMENT", "UPGRADE_CLOSED", "CARD_CHECK_RELEASE"
]);

/** Spec §2.8 step 2: a report from the newest stored (signed) notice; it carries no decline code, so never "bank refused". */
function reportFromNotice(orderId: string, notice: PaymentNoticeRow): PaymentReport | null {
  if (notice.providerStatus === null || notice.providerPaymentId === null) return null;
  let amountMicros: number | null = null;
  try {
    amountMicros = notice.amountText === null ? null : netopiaAmountToMicros(notice.amountText);
  } catch {
    amountMicros = null;
  }
  const state = statusToState(notice.providerStatus);
  return Object.freeze({
    orderId, providerPaymentId: notice.providerPaymentId, state, providerStatus: String(notice.providerStatus),
    amountMicros, currency: notice.currency, cardCountry: notice.cardCountry, savedCard: null, declineCode: null,
    declineSide: state === "DECLINED" ? "CARD" as const : null, bankDeclined: false, occurredAt: null, clientId: null
  });
}

/** Spec §2.11: how long a paid or authorised 0 card check waits for its saved card before it fails CARD_NOT_SAVED. */
function cardSaveWaitMs(): number {
  return 15 * 60_000;
}

/**
 * Spec §2.5.4 VERIFY_PAYMENT: the only place a payment changes state. It reads NETOPIA's status server to server
 * (spec 2026-10-05 §2.8); the browser and the notice are only triggers.
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
    // NETOPIA spec 2026-10-05 §2.5.4: a payment check keyed by the previous card processor's transaction number.
    if (retiredVerifyJob(job)) return otherPaymentSystem(this.deps.audit, job.kind);
    try {
      return await this.netopiaJob(job, now);
    } catch (error) {
      credentialsRefused(this.deps.audit, error, "verify");
      throw error;
    }
  };

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
    client: PoolClient, charge: ChargeRow, owner: Owner, now: Date,
    cardCountry: string | null = null, prepared: SettlementPrepared = {}, payment: SettledPayment | null = null
  ): Promise<SettlementContext> {
    const events = await this.deps.repository.subscriptionEvents(charge.subscriptionId, client);
    return Object.freeze({
      client, now, charge, payment, subscription: foldSubscription(events), events,
      quote: owner.quote, ownerRef: owner.ownerRef, customerId: owner.customerId, cardCountry, prepared
    });
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

  // ---------------------------------------------------------------------------------------------------------------
  // N10 — the NETOPIA path (spec §2.8).
  // ---------------------------------------------------------------------------------------------------------------

  /** The dispatch: this API's NETOPIA charge, another system's (DEAD before any read), or none yet (wait for it). */
  private async netopiaJob(job: OutboxJob, now: Date): Promise<OutboxOutcome> {
    const charge = await this.deps.repository.charge(job.ref);
    if (charge === null) return notFinal(job, now, "CHARGE_NOT_FOUND");
    if (!isThisPaymentSystem(charge, this.deps.netopia.paymentEnvironment)) return otherPaymentSystem(this.deps.audit, job.kind);
    const read = await this.readNetopiaStatus(charge, now);
    if (read !== "UNREADABLE" && read !== "NO_SUCH_ORDER") return this.decideNetopia(job, charge, read, now, false);
    const code = read === "NO_SUCH_ORDER" ? "PAYMENT_NOT_FOUND" : "PAYMENT_STATUS_UNREADABLE";
    const retryAt = notFinalRetryAt(job.attempts, now);
    if (retryAt !== null) return Object.freeze({ kind: "RETRY" as const, code, retryAt });
    // Spec §2.8 step 2: the schedule is spent; NETOPIA's own signed message decides when we hold one.
    if (read === "UNREADABLE") {
      const notice = await this.newestNotice(charge.chargeId);
      const fromNotice = notice === null ? null : reportFromNotice(charge.chargeId, notice);
      if (notice !== null && fromNotice !== null) {
        await this.noticeOutcome(notice.noticeId, now, "DECIDED_BY_NOTICE");
        return this.decideNetopia(job, charge, fromNotice, now, true);
      }
    }
    return this.leftToChecks(charge, code);
  }

  /** Spec §2.8 step 2: one status read with the best ntpID (N-16), its `status_read` row; a payment error is UNREADABLE. */
  private async readNetopiaStatus(charge: ChargeWithEvents, now: Date): Promise<PaymentReport | "NO_SUCH_ORDER" | "UNREADABLE"> {
    const payments = this.deps.netopia.payments;
    const submitted = [...charge.events].reverse()
      .find((event) => event.kind === "SUBMITTED" && event.providerPaymentId !== null)?.providerPaymentId ?? null;
    const notice = submitted !== null ? null : await this.newestNotice(charge.chargeId);
    let read: PaymentReport | "NO_SUCH_ORDER" | "UNREADABLE";
    let outcome: string;
    try {
      const answer = await payments.status({ orderId: charge.chargeId, providerPaymentId: submitted ?? notice?.providerPaymentId ?? null });
      // An answer for another order is no answer for this one.
      if (answer !== "NO_SUCH_ORDER" && answer.orderId !== charge.chargeId) {
        read = "UNREADABLE";
        outcome = "PAYMENT_RESPONSE_INVALID";
      } else {
        read = answer;
        outcome = answer === "NO_SUCH_ORDER" ? answer : answer.state;
      }
    } catch (error) {
      const code = paymentErrorCode(error);
      if (code === null) throw error;
      credentialsRefused(this.deps.audit, error, "verify");
      answerRejected(this.deps.audit, error, "verify");
      read = "UNREADABLE";
      outcome = code;
    }
    await this.deps.repository.withTransaction((client) => this.deps.repository.insertStatusRead(client, {
      chargeId: charge.chargeId, at: now, outcome
    }));
    return read;
  }

  /** Spec §2.8 step 3 by state. `fromNotice`: no retry here. REFUNDED is N14's (§2.12.4); CHARGEBACK_* are N15's (§2.13). */
  private async decideNetopia(
    job: OutboxJob, charge: ChargeWithEvents, report: PaymentReport, now: Date, fromNotice: boolean
  ): Promise<OutboxOutcome> {
    switch (report.state) {
      case "PENDING":
      case "AUTHORIZED":
      case "ACTION_REQUIRED": {
        // §2.9.2: nobody is present to finish the bank's check of a renewal (mail.M5.confirmCard follows, N11).
        if (report.state === "ACTION_REQUIRED" && charge.kind === "RENEWAL") {
          return this.netopiaFailed(charge, report, now, "AUTHENTICATION_REQUIRED");
        }
        // §2.11: a 0.00 card check is authorised, never captured; that is its success once its card is stored.
        if (report.state === "AUTHORIZED" && charge.kind === "CARD_CHECK" && charge.totalMicros === 0) {
          return (await this.cardCheckGate(job, charge, now, fromNotice)) ?? this.netopiaSucceeded(charge, report, now);
        }
        const retryAt = fromNotice ? null : notFinalRetryAt(job.attempts, now);
        return retryAt === null ? this.leftToChecks(charge, "PAYMENT_NOT_FINAL")
          : Object.freeze({ kind: "RETRY" as const, code: "PAYMENT_NOT_FINAL", retryAt });
      }
      case "PAID":
        return (await this.cardCheckGate(job, charge, now, fromNotice)) ?? this.netopiaSucceeded(charge, report, now);
      case "DECLINED":
        return this.netopiaFailed(charge, report, now, "PAYMENT_DECLINED");
      case "FAILED":
        return this.netopiaFailed(charge, report, now, "PAYMENT_FAILED");
      case "EXPIRED":
        return this.netopiaFailed(charge, report, now, "PAYMENT_EXPIRED");
      case "VOIDED":
        // A9's void-ok rule, kept: before success a closed order; after it a full refund made at NETOPIA (F2: our own).
        return charge.events.some((event) => event.kind === "SUCCEEDED")
          ? this.netopiaVoided(charge, report, now)
          : this.netopiaFailed(charge, report, now, "VOIDED");
      case "REFUNDED":
        return this.netopiaRefunded(charge, report, now);
      case "CHARGEBACK_OPENED":
        return this.netopiaChargedBack(charge, report, now, "OPENED");
      case "CHARGEBACK_LOST":
        return this.netopiaChargedBack(charge, report, now, "LOST");
      case "CHARGEBACK_REPRESENTED":
        return this.netopiaChargedBack(charge, report, now, "REPRESENTED");
      case "UNCLEAR":
        return this.netopiaOwnerReview(charge, report, now, true);
      default:
        return exhaustive(report.state);
    }
  }

  /** The schedule is spent: a renewal's job ends DONE (§2.9.4 takes over); any other is left to the checks (§2.14). */
  private leftToChecks(charge: ChargeRow, code: string): OutboxOutcome {
    return charge.kind === "RENEWAL" ? DONE : Object.freeze({ kind: "RETRY" as const, code, retryAt: null });
  }

  /** Spec §2.8 PAID: the payment must be the charge's own: the exact amount, the currency, and our customer. */
  private netopiaMismatch(
    charge: ChargeRow, report: PaymentReport, customerId: string
  ): "PAYMENT_AMOUNT_MISMATCH" | "PAYMENT_CUSTOMER_MISMATCH" | null {
    if (report.amountMicros === null || report.amountMicros !== charge.totalMicros || report.currency !== charge.currency) {
      return "PAYMENT_AMOUNT_MISMATCH";
    }
    // Spec §2.6.4: the client id NETOPIA echoes is our customer id as 32 lower-case hex (PR-7's one rule, PR-37).
    if (report.clientId !== null && report.clientId !== clientIdOf(customerId)) return "PAYMENT_CUSTOMER_MISMATCH";
    return null;
  }

  /**
   * Spec §2.8 PAID, one transaction (A3 (f)): SUCCEEDED (one per charge, A3 (d)), evidence with NETOPIA's card country,
   * the settlement carrying the card adopted now, invoice job and emails. Already SUCCEEDED: only a late card (CARD_SAVED).
   */
  private async netopiaSucceeded(charge: ChargeWithEvents, report: PaymentReport, now: Date): Promise<OutboxOutcome> {
    if (charge.events.some((event) => event.kind === "SUCCEEDED")) return this.adoptLateCard(charge, now);
    const owner = await this.owner(charge);
    const mismatch = this.netopiaMismatch(charge, report, owner.customerId);
    if (mismatch !== null) {
      this.deps.audit("billing.payment.mismatch", { code: mismatch });
      await queuePaymentAlert({ repository: this.deps.repository, jobs: this.deps.netopia.jobs }, {
        code: mismatch, reference: `charge ${charge.chargeId}`, dedupeRef: `${charge.chargeId}:${mismatch}`, now,
        nextSteps: `NETOPIA reports a paid order whose ${mismatch === "PAYMENT_AMOUNT_MISMATCH" ? "amount or currency" : "customer"}`
          + " our charge does not hold. Nothing was recorded and no plan changed. Look at this order in NETOPIA's admin;"
          + " if the money was taken, refund it there in full."
      });
      return Object.freeze({ kind: "DEAD" as const, code: mismatch });
    }
    const settlement = this.settlementFor(charge.kind);
    const location = owner.quote === null ? null
      : openQuoteLocation(this.deps.recordsKey, owner.quote.quoteId, owner.quote.locationCiphertext);
    const cardCountry = report.cardCountry;
    const countryConfirmed = owner.events.find((event) => event.kind === "CREATED")?.data.country_confirmed === true;
    const verdict = location === null ? null : locationVerdict({
      declaredCountry: location.country, ipCountry: location.ipCountry, cardCountry, countryConfirmed,
      card: decideCardCountry(this.deps.countryPolicy, { declaredCountry: location.country, cardCountry })
    });
    const ipEvidence = location === null ? null : sealIpEvidence(this.deps.recordsKey, charge.chargeId, location.ip);
    const prepared = verdict === "BLOCKED" || settlement.prepare === undefined ? {} : await settlement.prepare(charge);
    const result = await this.deps.repository.withTransaction(async (client): Promise<"APPLIED" | "REFUND" | "DUPLICATE"> => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      // `at` is the verification instant; `providerCreatedAt` is when NETOPIA says the money moved (the quarter rows).
      const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "SUCCEEDED", now, {
        providerPaymentId: report.providerPaymentId, amountMicros: charge.totalMicros, errorCode: null,
        providerCreatedAt: report.occurredAt
      }));
      if (inserted === "DUPLICATE") return "DUPLICATE";
      if (location !== null && verdict !== null && ipEvidence !== null) {
        await this.deps.repository.insertLocationEvidence(client, Object.freeze({
          chargeId: charge.chargeId, ipCountry: location.ipCountry, declaredCountry: location.country, cardCountry, verdict,
          ipCiphertext: ipEvidence.ciphertext, keyId: ipEvidence.keyId, at: now
        }) satisfies LocationEvidenceRow);
      }
      const cardTokenId = verdict === "BLOCKED" ? null : await this.adoptableAtDecision(client, charge.chargeId, adoptingKindOf(charge.kind));
      const payment: SettledPayment = Object.freeze({
        provider: "netopia" as const, providerPaymentId: report.providerPaymentId, occurredAt: report.occurredAt, cardCountry, cardTokenId
      });
      const context = await this.context(client, charge, owner, now, cardCountry, prepared, payment);
      const settled = verdict === "BLOCKED"
        ? Object.freeze({ kind: "REFUND" as const, reason: "CARD_COUNTRY_BLOCKED" as const })
        : await settlement.succeeded(context);
      if (settled.kind === "REFUND") {
        await this.endRefusedPayment(context, settled.reason);
        // R-32: the whole payment goes back through the one refund executor (N14: the owner mode on NETOPIA).
        await this.deps.refunds.request(client, {
          chargeId: charge.chargeId, transactionId: report.providerPaymentId, amountMicros: charge.totalMicros,
          whole: true, ownerRef: owner.ownerRef, reason: settled.reason
        }, now);
        return "REFUND";
      }
      if (charge.kind !== "CARD_CHECK" && owner.quote !== null && location !== null) {
        await enqueueInvoice(this.deps.repository, client, {
          charge, quote: owner.quote, policy: this.deps.policy, cardCountry, ipCountry: location.ipCountry, now
        });
      }
      return "APPLIED";
    });
    if (result === "APPLIED") {
      this.deps.audit("billing.payment.verified", { chargeKind: charge.kind, planId: owner.quote?.planId ?? null, verdict: verdict ?? "NONE" });
    }
    return DONE;
  }

  /** Spec §2.15.2 "at the decision": the newest eligible token stored for the charge being decided, under the lock. */
  private async adoptableAtDecision(client: PoolClient, chargeId: string, adopting: AdoptingKind): Promise<string | null> {
    const decided = await this.deps.repository.charge(chargeId, client);
    if (decided === null) return null;
    const events = await this.deps.repository.subscriptionEvents(decided.subscriptionId, client);
    const state = foldSubscription(events);
    const tokens = await this.deps.repository.cardTokensFromCharge(client, chargeId);
    const current = state.cardTokenId === null ? null : await this.deps.repository.cardTokenById(client, state.cardTokenId);
    return chooseAdoptableToken({ state, events, charge: decided, tokens, current, adopting, deciding: true })?.tokenId ?? null;
  }

  /** Spec §2.15.2 "after it": a late token of this SUCCEEDED charge is adopted with CARD_SAVED, once; never a CARD_CHECK's. */
  private async adoptLateCard(charge: ChargeWithEvents, now: Date): Promise<OutboxOutcome> {
    if (charge.kind === "CARD_CHECK") return DONE;
    const saved = await this.deps.repository.withTransaction(async (client): Promise<boolean> => {
      await this.deps.jobs.lockOwner(client, charge.ownerRef);
      const events = await this.deps.repository.subscriptionEvents(charge.subscriptionId, client);
      const state = foldSubscription(events);
      if (!CARD_HOLDING.has(state.status)) return false;
      const decided = await this.deps.repository.charge(charge.chargeId, client);
      if (decided === null) return false;
      const tokens = await this.deps.repository.cardTokensFromCharge(client, charge.chargeId);
      const current = state.cardTokenId === null ? null : await this.deps.repository.cardTokenById(client, state.cardTokenId);
      const token = chooseAdoptableToken({ state, events, charge: decided, tokens, current, adopting: "CARD_SAVED", deciding: false });
      return token !== null && await writeCardSaved({ repository: this.deps.repository }, client, { state, token, at: now });
    });
    if (saved) this.deps.audit("billing.card.saved", { chargeKind: charge.kind });
    return DONE;
  }

  /** Spec §2.8 FAILED states: FAILED with the code, then the kind's `failed`; the bank is named only when NETOPIA says so. */
  private async netopiaFailed(charge: ChargeWithEvents, report: PaymentReport, now: Date, errorCode: string): Promise<OutboxOutcome> {
    if (charge.events.some((event) => event.kind === "SUCCEEDED")) return DONE;
    if (charge.events.some((event) => event.kind === "FAILED" && event.providerPaymentId === report.providerPaymentId)) return DONE;
    const settlement = this.settlementFor(charge.kind);
    const owner = await this.owner(charge);
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "FAILED", now, {
        providerPaymentId: report.providerPaymentId, amountMicros: charge.totalMicros, errorCode
      }));
      if (inserted === "DUPLICATE") return;
      await settlement.failed({
        ...(await this.context(client, charge, owner, now)), errorCode,
        ...(errorCode === "PAYMENT_DECLINED" ? { bankDeclined: report.bankDeclined } : {})
      });
    });
    this.deps.audit("billing.payment.failed", { chargeKind: charge.kind, code: errorCode });
    return DONE;
  }

  /**
   * F2 (money-2, ruling PR-55): a void after success. When our own open request covers the WHOLE payment (the test
   * `netopiaRefunded` uses) and no charge-back holds it (PR-41: the hold wins), it is recorded through RefundDesk, the
   * follow-ups included (M11/M8, the credit note), as a REFUNDED read records it; otherwise A9's PROVIDER_VOID.
   */
  private async netopiaVoided(charge: ChargeWithEvents, report: PaymentReport, now: Date): Promise<OutboxOutcome> {
    const paymentId = charge.events.find((event) => event.kind === "SUCCEEDED")?.providerPaymentId ?? report.providerPaymentId;
    const open = openOwnRequest(charge, paymentId);
    if (open !== null && open.openMicros > 0 && !heldByChargeback(charge, paymentId) && wholePaymentOpen(charge, open)) {
      await this.deps.refunds.recordNetopiaRefund(open.intent, open.openMicros, now);
      return DONE;
    }
    return this.netopiaProviderRefund(charge, report, now, "PROVIDER_VOID");
  }

  /**
   * A9 on NETOPIA: a void after success (PROVIDER_VOID) is a full refund with its credit note; an admin refund
   * (PROVIDER_REFUND, N14) is recorded at the remaining amount, its credit note the owner's; never seen paid: paid and refunded.
   * F2 (money-1, ruling PR-55): a RENEWAL never seen paid that NETOPIA reports refunded means the owner gave that month
   * back in NETOPIA's admin, so in the same transaction its plan ends (`endRefundedRenewal`) and the owner gets one O3;
   * the person is never emailed and never charged for that month again.
   */
  private async netopiaProviderRefund(
    charge: ChargeWithEvents, report: PaymentReport, now: Date, reason: "PROVIDER_REFUND" | "PROVIDER_VOID"
  ): Promise<OutboxOutcome> {
    const paymentId = report.providerPaymentId;
    if (refundedAlready(charge, paymentId)) return DONE;
    const owner = await this.owner(charge);
    const paidRow = charge.events.find((event) => event.kind === "SUCCEEDED");
    const succeeded = paidRow !== undefined;
    const paidMicros = paidRow?.amountMicros ?? charge.totalMicros;
    const amountMicros = paidMicros - refundedMicros(charge, paidRow?.providerPaymentId ?? paymentId);
    const target = paidRow?.providerPaymentId ?? paymentId;
    const renewalRefunded = await this.deps.repository.withTransaction(async (client): Promise<boolean> => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      if (!succeeded) {
        const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "SUCCEEDED", now, {
          providerPaymentId: paymentId, amountMicros: charge.totalMicros, errorCode: null, providerCreatedAt: report.occurredAt
        }));
        if (inserted === "DUPLICATE") return false;
        if (charge.kind === "INITIAL") {
          const subscription = foldSubscription(await this.deps.repository.subscriptionEvents(charge.subscriptionId, client));
          if (subscription.status === "CREATED") {
            await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "ENDED", now, { cause: "ABANDONED", reason }));
          }
        }
      }
      if (amountMicros > 0) {
        const fields = { providerPaymentId: target, amountMicros, errorCode: reason };
        await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "REFUND_REQUESTED", now, fields));
        await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "REFUNDED", now, fields));
        if (succeeded && owner.quote !== null && reason === "PROVIDER_VOID") {
          await enqueueCreditNote(this.deps.repository, client, {
            charge, quote: owner.quote, policy: this.deps.policy, transactionId: target, refundMicros: amountMicros, now
          });
        }
      }
      if (succeeded || charge.kind !== "RENEWAL") return false;
      await this.endRefundedRenewal(client, charge, paymentId, now);
      return true;
    });
    if (renewalRefunded) this.deps.audit("billing.renewal.refunded_before_seen", { attempt: charge.attempt });
    if (reason === "PROVIDER_REFUND" && succeeded && owner.quote !== null && amountMicros > 0) {
      this.deps.audit("billing.invoice.unknown", {
        issuer: invoiceIssuerFor(owner.quote.taxCountry, this.deps.policy.invoiceIssuerRules), kind: "CREDIT_NOTE",
        code: "CREDIT_NOTE_MANUAL"
      });
    }
    this.deps.audit("billing.refund", { reason, chargeKind: charge.kind });
    return DONE;
  }

  /**
   * F2 (money-1, ruling PR-55), in `netopiaProviderRefund`'s transaction under the owner lock: the plan of a RENEWAL
   * charge NETOPIA reports refunded before the site saw it paid ends now, attempt 1 (an ACTIVE plan) and a dunning retry
   * (PAST_DUE) alike, the way the maintenance pass ends a spent dunning (ENDED(DUNNING) and Free, `writeDunningEnd`), and
   * with NO customer email. The fold ends a dunning only from PAST_DUE, so an ACTIVE plan first records the attempt
   * unpaid (PAST_DUE, with no retry date: none will be made). Only a plan still on the month this charge renews. Then one
   * O3 RENEWAL_REFUNDED_BEFORE_SEEN for the owner, in the same transaction, once per charge.
   */
  private async endRefundedRenewal(client: PoolClient, charge: ChargeWithEvents, paymentId: string, now: Date): Promise<void> {
    const subscription = foldSubscription(await this.deps.repository.subscriptionEvents(charge.subscriptionId, client));
    const live = (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE")
      && subscription.currentPeriodEnd?.getTime() === charge.periodStart.getTime();
    if (live) {
      if (subscription.status === "ACTIVE") {
        await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "PAST_DUE", now, {
          charge_id: charge.chargeId, attempt: charge.attempt, first_failed_at: now.toISOString()
        }));
      }
      await writeDunningEnd(this.deps, client, {
        subscription, data: { charge_id: charge.chargeId, refunded_before_seen: true }, now
      });
    }
    await queuePaymentAlert({ repository: this.deps.repository, jobs: this.deps.netopia.jobs }, {
      code: "RENEWAL_REFUNDED_BEFORE_SEEN", reference: `charge ${charge.chargeId}`,
      dedupeRef: `${charge.chargeId}:RENEWAL_REFUNDED_BEFORE_SEEN`, now,
      nextSteps: live
        ? "NETOPIA reports this renewal's payment refunded (or cancelled) before the site saw it paid, so the plan has"
          + " ended and the person was not emailed. Tell them yourself; if they should keep the plan, they can subscribe again."
        : `NETOPIA reports this renewal's payment (NETOPIA payment ${paymentId}) refunded (or cancelled) before the site saw`
          + " it paid. Its plan was no longer on the month this payment renewed, so no plan changed and the person was not"
          + " emailed. Look at the plan and this payment in NETOPIA's admin; tell the person yourself if they need to know."
    }, client);
  }

  /**
   * Spec §2.12.4: our open request for the WHOLE payment is recorded, follow-ups included; a partial one records nothing
   * (N-8: NETOPIA may report both alike; the reminder asks for the command); no request of ours is A9's PROVIDER_REFUND.
   */
  private async netopiaRefunded(charge: ChargeWithEvents, report: PaymentReport, now: Date): Promise<OutboxOutcome> {
    const paymentId = charge.events.find((event) => event.kind === "SUCCEEDED")?.providerPaymentId ?? report.providerPaymentId;
    const requested = charge.events.some((event) => event.kind === "REFUND_REQUESTED" && event.providerPaymentId === paymentId);
    if (!requested) return this.netopiaProviderRefund(charge, report, now, "PROVIDER_REFUND");
    const open = openOwnRequest(charge, paymentId);
    if (open === null || open.openMicros === 0) return DONE;
    if (!wholePaymentOpen(charge, open)) {
      this.deps.audit("billing.refund.seen_partial", { reason: open.intent.reason });
      return DONE;
    }
    await this.deps.refunds.recordNetopiaRefund(open.intent, open.openMicros, now);
    return DONE;
  }

  /**
   * Spec §2.13 (ruling C-7): a charge-back NETOPIA reports as a status of the payment itself. Under the owner lock, the
   * charge read again on the transaction's own client: one CHARGEBACK per payment (0086's key), written first whatever
   * the status (a 10 or a 16 whose 9 was never seen still pauses the plan first), then SUSPENDED + Free + M10 for a live
   * plan; a payment that bought nothing is coded DUPLICATE_PAYMENT and changes no plan, for every charge kind: a
   * CARD_CHECK charge, a charge holding a refund request of `BOUGHT_NOTHING`, or a charge never seen paid (no SUCCEEDED;
   * none is invented for it). A 16 then adds CHARGEBACK_REPRESENTED once. A 10 ("chargeback accepted") is never acted
   * on further by itself (N-8): the notice's outcome OWNER_REVIEW and one O3 tell the owner, who ends the plan with
   * `pnpm billing:dispute`; the O3 says the paid features are paused only when the plan folds SUSPENDED afterwards.
   * The audit line billing.chargeback carries `code: "DUPLICATE_PAYMENT"` when the CHARGEBACK written is so coded.
   * N15b (ruling PR-41): when the CHARGEBACK written finds an open owner refund on the same payment (`openOwnRequest`),
   * that refund is now held (`heldByChargeback`): the O3 REFUND_HELD_BY_CHARGEBACK (`queueRefundHeldAlert`, shared with
   * the PAYMENT_REFUND job's hold) is queued in the same transaction, once per payment ever, and the audit line
   * billing.refund.held_by_chargeback follows only when that O3 was queued now.
   */
  private async netopiaChargedBack(
    charge: ChargeWithEvents, report: PaymentReport, now: Date, stage: "OPENED" | "LOST" | "REPRESENTED"
  ): Promise<OutboxOutcome> {
    const paid = charge.events.find((event) => event.kind === "SUCCEEDED");
    const paymentId = paid?.providerPaymentId ?? report.providerPaymentId;
    const owner = await this.owner(charge);
    type Recorded = Readonly<{ written: boolean; boughtNothing: boolean; held: RefundIntent | null }>;
    const recorded = await this.deps.repository.withTransaction(async (client): Promise<Recorded> => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      const current = (await this.deps.repository.charge(charge.chargeId, client)) ?? charge;
      const boughtNothing = charge.kind === "CARD_CHECK" || current.events.some((event) => event.kind === "REFUND_REQUESTED"
        && event.errorCode !== null && BOUGHT_NOTHING.has(event.errorCode))
        || !current.events.some((event) => event.kind === "SUCCEEDED");
      let written = false;
      let held: RefundIntent | null = null;
      if (!current.events.some((event) => event.kind === "CHARGEBACK" && event.providerPaymentId === paymentId)) {
        const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "CHARGEBACK", now, {
          providerPaymentId: paymentId, amountMicros: paid?.amountMicros ?? charge.totalMicros,
          errorCode: boughtNothing ? "DUPLICATE_PAYMENT" : null
        }));
        written = inserted === "INSERTED";
        let pausedEmailQueued = false;
        if (written && !boughtNothing) {
          const { subscription } = await this.context(client, charge, owner, now);
          if (subscription.status === "ACTIVE" || subscription.status === "PAST_DUE") {
            await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "SUSPENDED", now, { charge_id: charge.chargeId }));
            await this.deps.entitlements.append(client, {
              ownerRef: owner.ownerRef, planId: "FREE", periodAnchorAt: subscription.periodAnchorAt ?? now, cause: "SUSPENDED_CHARGEBACK",
              effectiveAt: now, subscriptionId: subscription.subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
            });
            await enqueueEmail(this.deps.repository, client, {
              template: "M10", recipient: { kind: "CUSTOMER", customerId: owner.customerId }, dedupeRef: charge.chargeId,
              params: { plan: subscription.planId }, notBefore: now
            });
            pausedEmailQueued = true;
          }
        }
        // F6a (ui-3): after the M10 decision, so the owner's O3 says what the customer was told.
        const open = written ? openOwnRequest(current, paymentId) : null;
        if (open !== null && open.openMicros > 0 && await queueRefundHeldAlert(
          { repository: this.deps.repository, jobs: this.deps.netopia.jobs }, charge, open, now, client, pausedEmailQueued
        )) {
          held = open.intent;
        }
      }
      if (stage === "REPRESENTED"
        && !current.events.some((event) => event.kind === "CHARGEBACK_REPRESENTED" && event.providerPaymentId === paymentId)) {
        await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "CHARGEBACK_REPRESENTED", now, {
          providerPaymentId: paymentId, amountMicros: paid?.amountMicros ?? charge.totalMicros, errorCode: null
        }));
      }
      return { written, boughtNothing, held };
    });
    if (recorded.written) {
      this.deps.audit("billing.chargeback", recorded.boughtNothing
        ? { chargeKind: charge.kind, code: "DUPLICATE_PAYMENT" }
        : { chargeKind: charge.kind });
    }
    if (recorded.held !== null) this.deps.audit("billing.refund.held_by_chargeback", { reason: recorded.held.reason });
    if (stage !== "LOST") return DONE;
    const paused = foldSubscription(await this.deps.repository.subscriptionEvents(charge.subscriptionId)).status === "SUSPENDED";
    const notice = await this.newestNotice(charge.chargeId);
    if (notice !== null) await this.noticeOutcome(notice.noticeId, now, "OWNER_REVIEW");
    this.deps.audit("billing.payment.owner_review", { state: report.state });
    await queuePaymentAlert({ repository: this.deps.repository, jobs: this.deps.netopia.jobs }, {
      code: "OWNER_REVIEW", reference: `charge ${charge.chargeId}`, dedupeRef: `${charge.chargeId}:CHARGEBACK_LOST`, now,
      nextSteps: `NETOPIA reports the dispute on this payment (NETOPIA payment ${paymentId}) as lost: status 10,`
        + " \"chargeback accepted\"."
        // F6a (ui-3): SUSPENDED is written only with the customer's M10 (above), so a paused plan's customer was told.
        + (paused
          ? ` The paid features are paused. ${PAUSED_EMAIL_SENTENCE}`
          : " No plan was paused for it: the payment bought nothing, or its plan was not active.")
        + " NETOPIA has not confirmed what this status means, so"
        + " nothing ends by itself. Once you have checked it in NETOPIA's admin, record the outcome with"
        + ` pnpm billing:dispute --charge ${charge.chargeId} --outcome lost (or --outcome won).`
    });
    return DONE;
  }

  /** Ruling C-7: nothing recorded; the notice's outcome OWNER_REVIEW, audit lines, and one O3 per charge and status. */
  private async netopiaOwnerReview(charge: ChargeRow, report: PaymentReport, now: Date, unexpected: boolean): Promise<OutboxOutcome> {
    const notice = await this.newestNotice(charge.chargeId);
    if (notice !== null) await this.noticeOutcome(notice.noticeId, now, "OWNER_REVIEW");
    if (unexpected) this.deps.audit("billing.payment.status_unexpected", { status: report.providerStatus });
    this.deps.audit("billing.payment.owner_review", { state: report.state });
    await queuePaymentAlert({ repository: this.deps.repository, jobs: this.deps.netopia.jobs }, {
      code: "OWNER_REVIEW", reference: `charge ${charge.chargeId}`, dedupeRef: `${charge.chargeId}:OWNER_REVIEW:${report.providerStatus}`, now,
      nextSteps: `NETOPIA reports status ${report.providerStatus} for this order (NETOPIA payment ${report.providerPaymentId}).`
        + " Nothing was recorded on the charge and no plan changed. Look at the order in NETOPIA's admin, then record what"
        + " happened with the owner commands the runbook names."
    });
    return DONE;
  }

  /** The newest stored notice for our order (`billing.payment_notice`), read on its own connection. */
  private async newestNotice(chargeId: string): Promise<PaymentNoticeRow | null> {
    return this.deps.repository.withTransaction((client) => this.deps.repository.newestNoticeForOrder(client, chargeId));
  }

  /** A21's pattern on NETOPIA's notices: what processing made of one is a following row. */
  private async noticeOutcome(noticeId: string, now: Date, outcome: PaymentNoticeOutcome): Promise<void> {
    await this.deps.repository.withTransaction((client) => this.deps.repository.insertPaymentNoticeOutcome(client, { noticeId, at: now, outcome }));
  }

  /**
   * N13 (spec §2.11, SR-12): a card check succeeds only once its saved card has arrived. Without a stored token of this
   * charge it waits 15 minutes (the message may come after the status), then FAILED(CARD_NOT_SAVED). The wait runs from
   * NETOPIA's first PAID/AUTHORIZED read or, when the job decides from the stored notice with no such read, from that
   * notice's arrival. A check closed CARD_NOT_SAVED stays closed: a later token is never adopted (N17 revokes
   * it). Null: not a card check waiting for its card; decide as usual.
   */
  private async cardCheckGate(
    job: OutboxJob, charge: ChargeWithEvents, now: Date, fromNotice: boolean
  ): Promise<OutboxOutcome | null> {
    if (charge.kind !== "CARD_CHECK" || charge.events.some((event) => event.kind === "SUCCEEDED")) return null;
    if (charge.events.some((event) => event.kind === "FAILED" && event.errorCode === "CARD_NOT_SAVED")) return DONE;
    const repository = this.deps.repository;
    const tokens = await repository.withTransaction((client) => repository.cardTokensFromCharge(client, charge.chargeId));
    if (tokens.length > 0) return null;
    const first = await repository.withTransaction((client) => repository.firstStatusReadAt(client, charge.chargeId, ["PAID", "AUTHORIZED"]));
    const start = first ?? (fromNotice ? (await this.newestNotice(charge.chargeId))?.receivedAt ?? now : now);
    const deadline = start.getTime() + cardSaveWaitMs();
    if (now.getTime() >= deadline) return this.cardNotSaved(charge, now);
    const scheduled = fromNotice ? null : notFinalRetryAt(job.attempts, now);
    const retryAt = new Date(Math.min(scheduled?.getTime() ?? deadline, deadline));
    return Object.freeze({ kind: "RETRY" as const, code: "CARD_NOT_SAVED_YET", retryAt });
  }

  /** FAILED(CARD_NOT_SAVED) under the owner lock, once; the card check's `failed` changes nothing else (no dunning retry). */
  private async cardNotSaved(charge: ChargeWithEvents, now: Date): Promise<OutboxOutcome> {
    const settlement = this.settlementFor(charge.kind);
    const owner = await this.owner(charge);
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      const current = await this.deps.repository.charge(charge.chargeId, client);
      if (current === null || current.events.some((event) => event.kind === "SUCCEEDED"
        || (event.kind === "FAILED" && event.errorCode === "CARD_NOT_SAVED"))) return;
      await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "FAILED", now, {
        providerPaymentId: null, amountMicros: charge.totalMicros, errorCode: "CARD_NOT_SAVED"
      }));
      await settlement.failed({ ...(await this.context(client, charge, owner, now)), errorCode: "CARD_NOT_SAVED" });
    });
    this.deps.audit("billing.payment.failed", { chargeKind: charge.kind, code: "CARD_NOT_SAVED" });
    return DONE;
  }
}
