import {
  decimalToMicros, foldSubscription, invoiceIssuerFor, paymentErrorCode, type CardPayments, type PaymentEnvironment,
  type PaymentReport, type SubscriptionEvent
} from "@debateai/billing-core";
import type {
  BillingJobQueries, BillingReadExecutor, BillingRepository, ChargeEventRow, ChargeKind, ChargeRow, CustomerXMoneyEnvironment,
  EntitlementRepository, LocationEvidenceRow, NoticeOutcome as PaymentNoticeOutcome, OutboxJob, PaymentNoticeRow, QuoteRow
} from "@debateai/db";
import { decideCardCountry } from "@debateai/geo";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { netopiaAmountToMicros, statusToState } from "@debateai/payments-netopia";
import type { XMoneyClient, XMoneyTransaction } from "@debateai/payments-xmoney";
import type { BillingPolicy, CountryPolicy } from "@debateai/register";
import type { PoolClient } from "pg";
import { credentialsRefused, type BillingAudit } from "./audit.js";
import { adoptingKindOf, chooseAdoptableToken, writeCardSaved, type AdoptingKind } from "./card-adoption.js";
import { REFUND_REASONS_REFUSING_THE_PAYMENT, type NoticeOutcome, type RequestedRefundReason } from "./codes.js";
import { enqueueEmail } from "./email-job.js";
import { locationVerdict } from "./location-verdict.js";
import { clientIdOf } from "./netopia-payer.js";
import {
  DONE, notFinalRetryAt, otherPaymentSystem, otherXMoneySystem, type OutboxHandler, type OutboxOutcome
} from "./outbox.js";
import { queuePaymentAlert } from "./payment-alert.js";
import { openQuoteLocation, sealIpEvidence } from "./records.js";
import {
  covers, openOwnRequest, pendingRefund, refundedAlready, refundedMicros, refundIntentOf, type RefundDesk
} from "./refunds.js";
import { chargeEvent, refundTarget, subscriptionEvent, transactionRoute } from "./rows.js";
import {
  enqueueCreditNote, enqueueInvoice, type ChargeSettlement, type SettledPayment, type SettlementContext, type SettlementPrepared
} from "./settlement.js";

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
/**
 * Spec §2.7 (P2-I1): a payment xMoney's own records do not tie to the charge. The notice's order reference disagrees
 * with xMoney's (`ORDER_REF_MISMATCH`), or a first payment or card check was made by another xMoney customer than the
 * subscription's CREATED one (`CUSTOMER_MISMATCH`). It changes nothing.
 */
type Mismatch = Readonly<{ kind: "MISMATCH"; code: "ORDER_REF_MISMATCH" | "CUSTOMER_MISMATCH" }>;
const ORDER_REF_MISMATCH: Mismatch = Object.freeze({ kind: "MISMATCH" as const, code: "ORDER_REF_MISMATCH" as const });
const CUSTOMER_MISMATCH: Mismatch = Object.freeze({ kind: "MISMATCH" as const, code: "CUSTOMER_MISMATCH" as const });

/** OpenAPI `Transaction.transactionSource`: what xMoney says made the transaction. */
const REBILL_SOURCES: ReadonlySet<string> = new Set(["re-bill", "re-bill-micro"]);
const NOT_REBILL_SOURCES: ReadonlySet<string> = new Set(["service-call", "card-change"]);
const NOT_FINAL_STATUSES: ReadonlySet<string> = new Set(["start", "in-progress", "3d-pending"]);

/** Skeleton §1 rule 2: what the NETOPIA path needs. Absent: this API serves no NETOPIA charge (they end OTHER_PAYMENT_SYSTEM). */
export type NetopiaVerifyDeps = Readonly<{
  payments: Pick<CardPayments, "status">;
  /** N8's `BillingConnectors.paymentEnvironment`: a NETOPIA charge of another environment is another system's. */
  paymentEnvironment: PaymentEnvironment;
  /** `queuePaymentAlert`'s once-only check. */
  jobs: Pick<BillingJobQueries, "outboxJobExists">;
}>;

export type VerifyDeps = Readonly<{
  repository: BillingRepository;
  jobs: Pick<BillingJobQueries, "lockOwner" | "chargeIdForTransaction">;
  xmoney: Pick<XMoneyClient, "getTransaction" | "getOrder" | "getCard">;
  refunds: Pick<RefundDesk, "request" | "recordRefunded" | "recordNetopiaRefund">;
  entitlements: Pick<EntitlementRepository, "append">;
  countryPolicy: CountryPolicy;
  policy: BillingPolicy;
  recordsKey: Buffer;
  audit: BillingAudit;
  /** D5 5h: the xMoney system this API talks to; a transaction id is matched only among its rows. */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
  /** N10: the NETOPIA path's deps (optional so the xMoney harnesses compile unchanged until N23). */
  netopia?: NetopiaVerifyDeps;
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

/** A NETOPIA job's ref: our charge id, which is NETOPIA's orderID (spec §2.8). xMoney refs are digits. */
const CHARGE_REF = /^[0-9a-f]{32}$/u;
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
      // Skeleton §1 rule 2: a NETOPIA job (ref = our charge id) takes the NETOPIA path; every other ref keeps xMoney's.
      if (CHARGE_REF.test(job.ref)) return await this.netopiaJob(job, now);
      if (await this.namesOtherSystemCharge(job)) return otherXMoneySystem(this.deps.audit, job.kind);
      return await this.run(job, now);
    } catch (error) {
      credentialsRefused(this.deps.audit, error, "verify");
      throw error;
    }
  };

  /**
   * P2-I4 (D5 5h): a check whose job names its own charge (a rebill's, A1) is matched within this API's xMoney system
   * only. A charge paid in the other system (a sandbox record after README §14.8's same-host switch) ends the job DEAD
   * OTHER_XMONEY_SYSTEM before any xMoney call or write; the two systems number their transactions separately, so the
   * job's transaction id means nothing here. A charge id that names no charge keeps A1's path (CHARGE_NOT_FOUND).
   */
  private async namesOtherSystemCharge(job: OutboxJob): Promise<boolean> {
    if (typeof job.payload.charge_id !== "string") return false;
    const charge = await this.deps.repository.charge(job.payload.charge_id);
    return charge !== null && (charge.paymentProvider !== "xmoney" || charge.paymentEnvironment !== this.deps.xmoneyEnvironment);
  }

  /** `linked`: this run follows the unmatched-rebill path's own SUBMITTED link, so it never links a second time. */
  private async run(job: OutboxJob, now: Date, linked = false): Promise<OutboxOutcome> {
    const transaction = await this.deps.xmoney.getTransaction(job.ref);
    const noticeId = typeof job.payload.notice_id === "string" ? job.payload.notice_id : null;
    // A9: a representment finds its own target (the charged-back charge) and is never a payment, so it is dispatched
    // before A1's matching, which would read it as a second success on the order. D5 5g: a refund that is its own
    // transaction belongs to the charge of the payment it names, never to its order's merchant id. P2-I2: so does a
    // dispute that is its own transaction (every type that is neither a payment, a refund nor a representment).
    const route = transactionRoute(transaction.transactionType);
    switch (route) {
      case "REPRESENTMENT":
        return this.represented(job, transaction, noticeId, now);
      case "REFUND":
        return this.refundTransaction(job, transaction, noticeId, now);
      case "DISPUTE":
        return this.disputeTransaction(job, transaction, noticeId, now);
      case "PAYMENT":
        break;
      default:
        return exhaustive(route);
    }
    const resolved = await this.resolveCharge(transaction, job.payload);
    if (resolved === null) return notFinal(job, now, "CHARGE_NOT_FOUND");
    if (resolved.kind === "MISMATCH") return this.mismatch(resolved, noticeId, now);
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
        return this.chargedBack(charge, transaction.transactionId, transaction, noticeId, now);
      default:
        return exhaustive(transaction.status);
    }
  }

  /** One content-free line (no id of either person, no amount) and the notice's MISMATCH; nothing else moves. */
  private async mismatch(mismatch: Mismatch, noticeId: string | null, now: Date): Promise<OutboxOutcome> {
    this.deps.audit("billing.payment.mismatch", { code: mismatch.code });
    await this.outcome(noticeId, now, "MISMATCH");
    return DONE;
  }

  /**
   * Spec §2.7 (P2-I1): the order's merchant id, from xMoney only: the transaction's own, else GET /order (A1: a
   * transaction carries none). A notice is not authenticated (spec §2.1: no MAC), so its `external_order_id` is only a
   * hint, and one that disagrees with xMoney's is a MISMATCH. X0 follow-up: the notice's `signature` field stays
   * unverified until X0 records what it is.
   */
  private async merchantOrderId(transaction: XMoneyTransaction, payload: OutboxJob["payload"]): Promise<string | null | Mismatch> {
    const external = transaction.externalOrderId ?? (await this.deps.xmoney.getOrder(transaction.orderId)).externalOrderId;
    const hint = typeof payload.external_order_id === "string" ? payload.external_order_id : null;
    return hint !== null && hint !== external ? ORDER_REF_MISMATCH : external;
  }

  /** P2-I1: whether xMoney's payer of a first payment or card check is the subscription's CREATED xMoney customer. */
  private async paidByItsCustomer(charge: ChargeRow, transaction: XMoneyTransaction): Promise<boolean> {
    const created = (await this.deps.repository.subscriptionEvents(charge.subscriptionId)).find((event) => event.kind === "CREATED");
    const customer = created?.xmoneyCustomerId ?? null;
    return customer !== null && customer === transaction.customerId;
  }

  /**
   * A1: the job's own charge id, then our SUBMITTED record, then a DUPLICATE_PAYMENT already recorded, then
   * (INITIAL/CARD_CHECK only) the order's merchant id as xMoney holds it, paid by the subscription's own xMoney
   * customer (spec §2.7, P2-I1). Every lookup stays inside this API's xMoney system (D5 5h).
   */
  private async resolveCharge(transaction: XMoneyTransaction, payload: OutboxJob["payload"]): Promise<Resolved | Mismatch | null> {
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
    const external = await this.merchantOrderId(transaction, payload);
    if (external !== null && typeof external !== "string") return external;
    if (external === null || !/^[0-9a-f]{32}$/.test(external)) return null;
    const charge = await this.deps.repository.charge(external);
    if (charge === null || (charge.kind !== "INITIAL" && charge.kind !== "CARD_CHECK")) return null;
    if (charge.paymentProvider !== "xmoney" || charge.paymentEnvironment !== environment) return null;
    if (!(await this.paidByItsCustomer(charge, transaction))) return CUSTOMER_MISMATCH;
    const paidByAnother = transaction.status === "complete-ok"
      && charge.events.some((event) => event.kind === "SUCCEEDED" && event.providerPaymentId !== transaction.transactionId);
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
      const paidByAnother = found.events.some((event) => event.kind === "SUCCEEDED" && event.providerPaymentId !== transaction.transactionId);
      const closed = found.events.some((event) => event.kind === "SUCCEEDED" || event.kind === "FAILED");
      const submittedOther = found.events.some((event) => event.kind === "SUBMITTED" && event.providerPaymentId !== transaction.transactionId);
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
          providerPaymentId: transaction.transactionId, amountMicros: open.charge.totalMicros, errorCode: null
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
      providerPaymentId: transaction.transactionId, amountMicros: paid.amountMicros, errorCode: null,
      providerCreatedAt: transaction.createdAt
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
    if (transaction.status === "charge-back") return this.duplicateChargedBack(charge, transaction.transactionId, noticeId, now);
    await this.outcome(noticeId, now, "DUPLICATE");
    return DONE;
  }

  /**
   * A charge-back of a second payment recorded as a DUPLICATE_PAYMENT (`paymentId`): its CHARGEBACK, keyed by that
   * payment, at the duplicate's own amount (an unmatched rebill's is not the charge total). The plan never changes for
   * it. Reached by the payment's own `charge-back` status and by a dispute transaction naming it (P2-I2): the second
   * report of one dispute is a replay.
   */
  private async duplicateChargedBack(
    charge: ChargeWithEvents, paymentId: string, noticeId: string | null, now: Date
  ): Promise<OutboxOutcome> {
    if (charge.events.some((event) => event.kind === "CHARGEBACK" && event.providerPaymentId === paymentId)) {
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    const recorded = charge.events.find((event) => event.kind === "DUPLICATE_PAYMENT" && event.providerPaymentId === paymentId);
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "CHARGEBACK", now, {
        providerPaymentId: paymentId, amountMicros: recorded?.amountMicros ?? charge.totalMicros,
        errorCode: "DUPLICATE_PAYMENT"
      }));
      await this.outcome(noticeId, now, "CHARGEBACK", client);
    });
    this.deps.audit("billing.chargeback", { chargeKind: charge.kind, code: "DUPLICATE_PAYMENT" });
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
    cardCountry: string | null = null, prepared: SettlementPrepared = {}, payment: SettledPayment | null = null
  ): Promise<SettlementContext> {
    const events = await this.deps.repository.subscriptionEvents(charge.subscriptionId, client);
    return Object.freeze({
      client, now, charge, transaction, payment, subscription: foldSubscription(events), events,
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
    if (charge.events.some((event) => event.kind === "SUCCEEDED" && event.providerPaymentId === transaction.transactionId)) {
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
      // `at` is the verification instant (the fold's activatedAt, D6b's withdrawal); `providerCreatedAt` is when the
      // money moved, which P1b's quarter rows date the sale by (D5 5m).
      const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "SUCCEEDED", now, {
        providerPaymentId: transaction.transactionId, amountMicros: charge.totalMicros, errorCode: null,
        providerCreatedAt: transaction.createdAt
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
    if (charge.events.some((event) => event.kind === "FAILED" && event.providerPaymentId === transaction.transactionId)) {
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    const settlement = this.settlementFor(charge.kind);
    const owner = await this.owner(charge);
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "FAILED", now, {
        providerPaymentId: transaction.transactionId, amountMicros: charge.totalMicros, errorCode
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
    return this.providerRefund(charge, transaction, noticeId, now, "PROVIDER_REFUND");
  }

  /**
   * D5 5g: the charge that recorded the payment a `refund` transaction (P2-I2: or a dispute transaction) names, as
   * SUCCEEDED or DUPLICATE_PAYMENT.
   */
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
      || charge.events.some((event) => event.kind === "REFUNDED" && event.providerPaymentId === transaction.transactionId)) {
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
    // P2-M1: only a REFUNDED written on the payment's own row (our call's answer) can be this refund's own report: one
    // recorded on another refund transaction (our landed refund) already settled that transaction, so a same-amount
    // refund now is a second one made elsewhere, for the owner. On the payment's own row the amount is all there is
    // to tell ours from a dashboard refund of the same amount until X0 (g)/(h) shows xMoney's real report.
    const ours = charge.events.some((event) => event.kind === "REFUNDED" && event.providerPaymentId === paymentId
      && event.errorCode !== "PROVIDER_REFUND" && event.errorCode !== "PROVIDER_VOID"
      && amountMatches(transaction.amountDecimal, event.amountMicros ?? -1));
    if (ours) {
      // Our refund was recorded when its call answered (on the payment's own row); this is its own report of it.
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    return this.providerRefundTransaction(charge, paymentId, transaction, noticeId, now);
  }

  /**
   * P2-I2: a dispute xMoney reports as its own transaction (`chargeback`, or any type that is neither a payment, a
   * refund nor a representment) belongs to the payment it names (`relatedTransactionIds`), never to its order's
   * merchant id, and is never matched as a payment, whatever its status. Once final and happened (`charge-back`,
   * `complete-ok`, `refund-ok`), it records that payment's charge-back on the payment's own charge, keyed by the
   * payment's id, so the payment's own `charge-back` status and this transaction are one dispute (0086's key). Still
   * in flight it waits; failed or withdrawn, it moved nothing. A payment we hold no record of yet is waited for on the
   * not-final schedule. X0 follow-up: how real xMoney reports a dispute is the owner's question to xMoney.
   */
  private async disputeTransaction(job: OutboxJob, transaction: XMoneyTransaction, noticeId: string | null, now: Date): Promise<OutboxOutcome> {
    if (NOT_FINAL_STATUSES.has(transaction.status)) return notFinal(job, now, "PAYMENT_NOT_FINAL");
    if (transaction.status === "complete-failed" || transaction.status === "void-ok" || transaction.status === "cancel-ok") {
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    const found = await this.disputedPaymentOf(transaction);
    if (found === null) return notFinal(job, now, "CHARGE_NOT_FOUND");
    if (found === "RECORDED") {
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    const { charge, paymentId } = found;
    return charge.events.some((event) => event.kind === "DUPLICATE_PAYMENT" && event.providerPaymentId === paymentId)
      ? this.duplicateChargedBack(charge, paymentId, noticeId, now)
      : this.chargedBack(charge, paymentId, transaction, noticeId, now);
  }

  /**
   * The payment a dispute transaction names, and the charge that recorded it (D5 5g's `paymentOf`). `RECORDED`: a
   * payment it names already holds its CHARGEBACK (on whichever charge, even one never seen paid), so this report is a
   * replay of that dispute.
   */
  private async disputedPaymentOf(
    dispute: XMoneyTransaction
  ): Promise<Readonly<{ charge: ChargeWithEvents; paymentId: string }> | "RECORDED" | null> {
    for (const paymentId of dispute.relatedTransactionIds) {
      if (await this.deps.jobs.chargeIdForTransaction(paymentId, "CHARGEBACK", this.deps.xmoneyEnvironment) !== null) return "RECORDED";
    }
    return this.paymentOf(dispute);
  }

  private async voided(charge: ChargeWithEvents, transaction: XMoneyTransaction, noticeId: string | null, now: Date): Promise<OutboxOutcome> {
    const settlement = this.settlements.get(charge.kind);
    if (settlement?.voided !== undefined) {
      const owner = await this.owner(charge);
      await this.deps.repository.withTransaction(async (client) => {
        await this.deps.jobs.lockOwner(client, owner.ownerRef);
        await settlement.voided!(await this.context(client, charge, transaction, owner, now));
      });
      return DONE;
    }
    const succeeded = charge.events.some((event) => event.kind === "SUCCEEDED" && event.providerPaymentId === transaction.transactionId);
    return succeeded
      ? this.providerRefund(charge, transaction, noticeId, now, "PROVIDER_VOID")
      : this.failed(charge, transaction, noticeId, now, "VOIDED");
  }

  /**
   * A9: a refund or a void made at xMoney, not by us: record it and keep the plan. A void after success is a refund in
   * full (A9), so its credit note is issued at once. A dashboard refund's amount cannot be read (Open question 11), so
   * the remaining amount is recorded as an upper bound and its credit note is the owner's, never automatic.
   */
  private async providerRefund(
    charge: ChargeWithEvents, transaction: XMoneyTransaction, noticeId: string | null, now: Date,
    reason: "PROVIDER_REFUND" | "PROVIDER_VOID"
  ): Promise<OutboxOutcome> {
    // Recorded already, on the payment or through its own refund transaction (D5 5g).
    if (refundedAlready(charge, transaction.transactionId)) {
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    const owner = await this.owner(charge);
    const paidRow = charge.events.find((event) => event.kind === "SUCCEEDED" && event.providerPaymentId === transaction.transactionId);
    const succeeded = paidRow !== undefined;
    // What is left of THIS paid transaction, counted per transaction as P1a's guard and `paidTransactions` count it: a
    // duplicate payment's own refund on the same charge never counts against it. The `!succeeded` path below records
    // the payment's SUCCEEDED at the charge total, so that is what it paid.
    const paidMicros = paidRow?.amountMicros ?? charge.totalMicros;
    const amountMicros = paidMicros - refundedMicros(charge, transaction.transactionId);
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      if (!succeeded) {
        // We never saw it paid: the money came and went. Record both, with no plan change and no invoice.
        const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "SUCCEEDED", now, {
          providerPaymentId: transaction.transactionId, amountMicros: charge.totalMicros, errorCode: null,
          providerCreatedAt: transaction.createdAt
        }));
        if (inserted === "DUPLICATE") return;
        // P2-M5: the checkout this payment was for bought nothing, so it ends now (folded under the lock), instead of
        // holding CHECKOUT_PENDING for the 24 hours until P11b's sweep; the waiting screen reads FAILED (`chargeStatusOf`).
        if (charge.kind === "INITIAL") {
          const subscription = foldSubscription(await this.deps.repository.subscriptionEvents(charge.subscriptionId, client));
          if (subscription.status === "CREATED") {
            await this.deps.repository.appendSubscriptionEvent(client, subscriptionEvent(subscription, "ENDED", now, { cause: "ABANDONED", reason }));
          }
        }
      }
      if (amountMicros > 0) {
        const fields = { providerPaymentId: transaction.transactionId, amountMicros, errorCode: reason };
        await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "REFUND_REQUESTED", now, fields));
        await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "REFUNDED", now, fields));
        if (succeeded && owner.quote !== null && reason === "PROVIDER_VOID") {
          await enqueueCreditNote(this.deps.repository, client, {
            charge, quote: owner.quote, policy: this.deps.policy, transactionId: transaction.transactionId, refundMicros: amountMicros, now
          });
        }
      }
      await this.outcome(noticeId, now, "REFUNDED", client);
    });
    if (reason === "PROVIDER_REFUND" && succeeded && owner.quote !== null && amountMicros > 0) {
      // The owner's summary (P16b) lists this charge: a PROVIDER_REFUND REFUNDED with no CREDIT_NOTE invoice row.
      this.deps.audit("billing.invoice.unknown", {
        issuer: invoiceIssuerFor(owner.quote.taxCountry, this.deps.policy.invoiceIssuerRules), kind: "CREDIT_NOTE",
        code: "CREDIT_NOTE_MANUAL"
      });
    }
    this.deps.audit("billing.refund", { reason, chargeKind: charge.kind });
    return DONE;
  }

  /**
   * D5 5g: a refund made elsewhere that xMoney reports as its own transaction, so its amount is known. Recorded at
   * that amount (the request on the payment, the REFUNDED on the refund transaction naming it) with the credit note
   * for exactly that amount. A payment that already holds a refund record takes no second one (P1a's key): the same
   * provider refund reported again is a replay (DONE), any other goes to the owner. Its durable mark (D6b's P16b
   * lists it) is this VERIFY_PAYMENT job itself, keyed by the refund transaction's id: it ends DEAD with the code
   * `REFUND_UNRECORDED`, with or without a notice (P14a's listing and a notice both reach here), next to one
   * `billing.refund.unrecorded` line; a notice, when there is one, records `UNRECORDED_REFUND`.
   */
  private async providerRefundTransaction(
    charge: ChargeWithEvents, paymentId: string, transaction: XMoneyTransaction, noticeId: string | null, now: Date
  ): Promise<OutboxOutcome> {
    const amountMicros = decimalToMicros(transaction.amountDecimal);
    const held = charge.events.filter((event) => (event.kind === "REFUND_REQUESTED" || event.kind === "REFUNDED")
      && refundTarget(event) === paymentId);
    if (held.length > 0) {
      // A replay is only this refund transaction recorded already, or the same provider refund reported on the
      // payment's own row (its refund-ok or void) at this amount. Another refund transaction's REFUNDED, of any amount,
      // or one of ours, makes this one a second refund elsewhere.
      const replay = held.some((event) => event.kind === "REFUNDED" && (event.providerPaymentId === transaction.transactionId
        || (event.providerPaymentId === paymentId && event.amountMicros === amountMicros
          && (event.errorCode === "PROVIDER_REFUND" || event.errorCode === "PROVIDER_VOID"))));
      if (replay) {
        await this.outcome(noticeId, now, "DUPLICATE");
        return DONE;
      }
      this.deps.audit("billing.refund.unrecorded", { reason: "PROVIDER_REFUND" });
      await this.outcome(noticeId, now, "UNRECORDED_REFUND");
      return Object.freeze({ kind: "DEAD" as const, code: "REFUND_UNRECORDED" });
    }
    const owner = await this.owner(charge);
    const paid = charge.events.some((event) => event.kind === "SUCCEEDED" && event.providerPaymentId === paymentId);
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      const requested = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "REFUND_REQUESTED", now, {
        providerPaymentId: paymentId, amountMicros, errorCode: "PROVIDER_REFUND"
      }));
      if (requested === "DUPLICATE") return;
      // D5 5m: the refund transaction's own creationDate dates the REFUND tax row.
      await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "REFUNDED", now, {
        providerPaymentId: transaction.transactionId, amountMicros, errorCode: "PROVIDER_REFUND",
        refundsTransactionId: paymentId, providerCreatedAt: transaction.createdAt
      }));
      // A second payment we refunded ourselves was never a sale; a charge's own payment gets its credit note.
      if (paid && owner.quote !== null) {
        await enqueueCreditNote(this.deps.repository, client, {
          charge, quote: owner.quote, policy: this.deps.policy, transactionId: paymentId, refundMicros: amountMicros, now
        });
      }
      await this.outcome(noticeId, now, "REFUNDED", client);
    });
    this.deps.audit("billing.refund", { reason: "PROVIDER_REFUND", chargeKind: charge.kind });
    return DONE;
  }

  /**
   * A9: a charge-back of the payment `paymentId` of this charge: its one CHARGEBACK, keyed by that payment, then
   * SUSPENDED + FREE + M10 for a live plan. `transaction` is what reported it: the payment's own `charge-back` status,
   * or a dispute transaction naming the payment (P2-I2). Either report of one dispute after the other is a replay:
   * 0086's (system, transaction, kind) key holds one CHARGEBACK per payment.
   */
  private async chargedBack(
    charge: ChargeWithEvents, paymentId: string, transaction: XMoneyTransaction, noticeId: string | null, now: Date
  ): Promise<OutboxOutcome> {
    if (charge.events.some((event) => event.kind === "CHARGEBACK" && event.providerPaymentId === paymentId)) {
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    const owner = await this.owner(charge);
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "CHARGEBACK", now, {
        providerPaymentId: paymentId, amountMicros: charge.totalMicros, errorCode: null
      }));
      if (inserted === "DUPLICATE") return;
      const { subscription } = await this.context(client, charge, transaction, owner, now);
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
      }
      await this.outcome(noticeId, now, "CHARGEBACK", client);
    });
    this.deps.audit("billing.chargeback", { chargeKind: charge.kind });
    return DONE;
  }

  /** A9: evidence was submitted in our favour; the outcome itself arrives by the owner's command (P14b). */
  private async represented(job: OutboxJob, transaction: XMoneyTransaction, noticeId: string | null, now: Date): Promise<OutboxOutcome> {
    // Recorded already, on whichever charge: a replay. Checked before choosing a target, because the charge it was
    // recorded on no longer counts as a charged-back charge waiting for its representment.
    if (await this.deps.jobs.chargeIdForTransaction(transaction.transactionId, "CHARGEBACK_REPRESENTED", this.deps.xmoneyEnvironment) !== null) {
      await this.outcome(noticeId, now, "DUPLICATE");
      return DONE;
    }
    const target = await this.chargedBackCharge(transaction, job.payload);
    // No charged-back charge yet: the representment arrived before its chargeback.
    if (target === null) return notFinal(job, now, "CHARGE_NOT_FOUND");
    if (target.kind === "MISMATCH") return this.mismatch(target, noticeId, now);
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.repository.appendChargeEvent(client, chargeEvent(target.chargeId, "CHARGEBACK_REPRESENTED", now, {
        providerPaymentId: transaction.transactionId, amountMicros: target.totalMicros, errorCode: null
      }));
      await this.outcome(noticeId, now, "REPRESENTED", client);
    });
    return DONE;
  }

  /**
   * The newest charge of the order's subscription that has a CHARGEBACK and no representment yet; the order's merchant
   * id comes from xMoney only (P2-I1).
   */
  private async chargedBackCharge(
    transaction: XMoneyTransaction, payload: OutboxJob["payload"]
  ): Promise<ChargeWithEvents | Mismatch | null> {
    const external = await this.merchantOrderId(transaction, payload);
    if (external !== null && typeof external !== "string") return external;
    if (external === null || !/^[0-9a-f]{32}$/.test(external)) return null;
    const initial = await this.deps.repository.charge(external);
    if (initial === null) return null;
    const charges = await this.deps.repository.chargesForSubscription(initial.subscriptionId);
    const withEvents = (await Promise.all(charges.map((charge) => this.deps.repository.charge(charge.chargeId))))
      .filter((charge): charge is ChargeWithEvents => charge !== null)
      .filter((charge) => charge.events.some((event) => event.kind === "CHARGEBACK")
        && !charge.events.some((event) => event.kind === "CHARGEBACK_REPRESENTED"))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
    return withEvents[0] ?? null;
  }

  // ---------------------------------------------------------------------------------------------------------------
  // N10 — the NETOPIA path (spec §2.8). N23 deletes everything above that serves xMoney.
  // ---------------------------------------------------------------------------------------------------------------

  /** The dispatch: this API's NETOPIA charge, another system's (DEAD before any read), or none yet (wait for it). */
  private async netopiaJob(job: OutboxJob, now: Date): Promise<OutboxOutcome> {
    const charge = await this.deps.repository.charge(job.ref);
    if (charge === null) return notFinal(job, now, "CHARGE_NOT_FOUND");
    const netopia = this.deps.netopia;
    if (netopia === undefined || charge.paymentProvider !== "netopia" || charge.paymentEnvironment !== netopia.paymentEnvironment) {
      return otherPaymentSystem(this.deps.audit, job.kind);
    }
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
    const payments = this.deps.netopia!.payments;
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
      if (code === "PAYMENT_CREDENTIALS_REFUSED") this.deps.audit("billing.payment.credentials_refused", { operation: "verify" });
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
        // A9's void-ok rule, kept: before success a closed order; after it a full refund made at NETOPIA.
        return charge.events.some((event) => event.kind === "SUCCEEDED")
          ? this.netopiaProviderRefund(charge, report, now, "PROVIDER_VOID")
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
      await queuePaymentAlert({ repository: this.deps.repository, jobs: this.deps.netopia!.jobs }, {
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
      const context = await this.context(client, charge, null, owner, now, cardCountry, prepared, payment);
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
        ...(await this.context(client, charge, null, owner, now)), errorCode,
        ...(errorCode === "PAYMENT_DECLINED" ? { bankDeclined: report.bankDeclined } : {})
      });
    });
    this.deps.audit("billing.payment.failed", { chargeKind: charge.kind, code: errorCode });
    return DONE;
  }

  /**
   * A9 on NETOPIA: a void after success (PROVIDER_VOID) is a full refund with its credit note; an admin refund
   * (PROVIDER_REFUND, N14) is recorded at the remaining amount, its credit note the owner's; never seen paid: paid and refunded.
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
    await this.deps.repository.withTransaction(async (client) => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      if (!succeeded) {
        const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "SUCCEEDED", now, {
          providerPaymentId: paymentId, amountMicros: charge.totalMicros, errorCode: null, providerCreatedAt: report.occurredAt
        }));
        if (inserted === "DUPLICATE") return;
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
    });
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
   * Spec §2.12.4: our open request for the WHOLE payment is recorded, follow-ups included; a partial one records nothing
   * (N-8: NETOPIA may report both alike; the reminder asks for the command); no request of ours is A9's PROVIDER_REFUND.
   */
  private async netopiaRefunded(charge: ChargeWithEvents, report: PaymentReport, now: Date): Promise<OutboxOutcome> {
    const paymentId = charge.events.find((event) => event.kind === "SUCCEEDED")?.providerPaymentId ?? report.providerPaymentId;
    const requested = charge.events.some((event) => event.kind === "REFUND_REQUESTED" && event.providerPaymentId === paymentId);
    if (!requested) return this.netopiaProviderRefund(charge, report, now, "PROVIDER_REFUND");
    const open = openOwnRequest(charge, paymentId);
    if (open === null || open.openMicros === 0) return DONE;
    const paid = charge.events.find((event) => (event.kind === "SUCCEEDED" || event.kind === "DUPLICATE_PAYMENT")
      && event.providerPaymentId === paymentId);
    const whole = paid !== undefined && paid.amountMicros === open.intent.amountMicros && open.openMicros === open.intent.amountMicros;
    if (!whole) {
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
   * The audit line billing.chargeback carries `code: "DUPLICATE_PAYMENT"` when the CHARGEBACK written is so coded,
   * as xMoney's `duplicateChargedBack` writes it.
   */
  private async netopiaChargedBack(
    charge: ChargeWithEvents, report: PaymentReport, now: Date, stage: "OPENED" | "LOST" | "REPRESENTED"
  ): Promise<OutboxOutcome> {
    const paid = charge.events.find((event) => event.kind === "SUCCEEDED");
    const paymentId = paid?.providerPaymentId ?? report.providerPaymentId;
    const owner = await this.owner(charge);
    type Recorded = Readonly<{ written: boolean; boughtNothing: boolean }>;
    const recorded = await this.deps.repository.withTransaction(async (client): Promise<Recorded> => {
      await this.deps.jobs.lockOwner(client, owner.ownerRef);
      const current = (await this.deps.repository.charge(charge.chargeId, client)) ?? charge;
      const boughtNothing = charge.kind === "CARD_CHECK" || current.events.some((event) => event.kind === "REFUND_REQUESTED"
        && event.errorCode !== null && BOUGHT_NOTHING.has(event.errorCode))
        || !current.events.some((event) => event.kind === "SUCCEEDED");
      let written = false;
      if (!current.events.some((event) => event.kind === "CHARGEBACK" && event.providerPaymentId === paymentId)) {
        const inserted = await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "CHARGEBACK", now, {
          providerPaymentId: paymentId, amountMicros: paid?.amountMicros ?? charge.totalMicros,
          errorCode: boughtNothing ? "DUPLICATE_PAYMENT" : null
        }));
        written = inserted === "INSERTED";
        if (written && !boughtNothing) {
          const { subscription } = await this.context(client, charge, null, owner, now);
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
          }
        }
      }
      if (stage === "REPRESENTED"
        && !current.events.some((event) => event.kind === "CHARGEBACK_REPRESENTED" && event.providerPaymentId === paymentId)) {
        await this.deps.repository.appendChargeEvent(client, chargeEvent(charge.chargeId, "CHARGEBACK_REPRESENTED", now, {
          providerPaymentId: paymentId, amountMicros: paid?.amountMicros ?? charge.totalMicros, errorCode: null
        }));
      }
      return { written, boughtNothing };
    });
    if (recorded.written) {
      this.deps.audit("billing.chargeback", recorded.boughtNothing
        ? { chargeKind: charge.kind, code: "DUPLICATE_PAYMENT" }
        : { chargeKind: charge.kind });
    }
    if (stage !== "LOST") return DONE;
    const paused = foldSubscription(await this.deps.repository.subscriptionEvents(charge.subscriptionId)).status === "SUSPENDED";
    const notice = await this.newestNotice(charge.chargeId);
    if (notice !== null) await this.noticeOutcome(notice.noticeId, now, "OWNER_REVIEW");
    this.deps.audit("billing.payment.owner_review", { state: report.state });
    await queuePaymentAlert({ repository: this.deps.repository, jobs: this.deps.netopia!.jobs }, {
      code: "OWNER_REVIEW", reference: `charge ${charge.chargeId}`, dedupeRef: `${charge.chargeId}:CHARGEBACK_LOST`, now,
      nextSteps: `NETOPIA reports the dispute on this payment (NETOPIA payment ${paymentId}) as lost: status 10,`
        + " \"chargeback accepted\"."
        + (paused
          ? " The paid features are paused."
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
    await queuePaymentAlert({ repository: this.deps.repository, jobs: this.deps.netopia!.jobs }, {
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
      await settlement.failed({ ...(await this.context(client, charge, null, owner, now)), errorCode: "CARD_NOT_SAVED" });
    });
    this.deps.audit("billing.payment.failed", { chargeKind: charge.kind, code: "CARD_NOT_SAVED" });
    return DONE;
  }
}
