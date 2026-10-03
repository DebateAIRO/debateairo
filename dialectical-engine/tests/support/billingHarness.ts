import { randomBytes, randomUUID } from "node:crypto";
import { decimalToMicros, foldSubscription, microsToDecimal } from "@debateai/billing-core";
import { AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type Pool } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { XMoneyNotice, XMoneyStatus, XMoneyTransaction } from "@debateai/payments-xmoney";
import type { BillingPlans } from "@debateai/register";
import type { BillingAudit } from "../../apps/api/src/billing/audit.js";
import {
  CheckoutService, type CheckoutDeps, type ConsentKind, type EmbeddedOrderInput, type SignedEmbeddedOrder
} from "../../apps/api/src/billing/checkout.js";
import {
  createEmailJobHandler, type AttachmentResolver, type BillingAttachmentKind, type BillingMail
} from "../../apps/api/src/billing/email-job.js";
import { BillingMaintenance } from "../../apps/api/src/billing/maintenance.js";
import { NoticeIntake } from "../../apps/api/src/billing/notice-intake.js";
import { BillingOutboxWorker } from "../../apps/api/src/billing/outbox.js";
import { QuoteService } from "../../apps/api/src/billing/quote.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { RenewalService, type RenewalDeps } from "../../apps/api/src/billing/renewal.js";
import { createRenewalNoticeHandler } from "../../apps/api/src/billing/renewal-notice-job.js";
import { createInitialSettlement } from "../../apps/api/src/billing/settlement-initial.js";
import { createRenewalSettlement } from "../../apps/api/src/billing/settlement-renewal.js";
import { VerifyPaymentHandler } from "../../apps/api/src/billing/verify-payment.js";
import { consentDocument } from "../../apps/ui/scripts/legal-consent-manifest.mjs";
import { startTestDatabase, type TestDatabase } from "./testDatabase.js";
import {
  AdjustableTaxEngine, PROFILE_ADDRESS_ONLY, StubGeo, testBillingPlans, testBillingPolicy, testCountryPolicy
} from "./billingFixtures.js";

/** The origin PUBLIC_APP_URL stands for in these tests (R-7). */
export const TEST_PUBLIC_APP_URL = "https://dezbatere.test";

export const TEST_CONSENT_TEXT: Readonly<Record<ConsentKind, string>> = Object.freeze({
  CONSENT_RENEWAL: "I agree that my subscription renews automatically every month at the price shown, until I cancel.",
  CONSENT_IMMEDIATE_START: "Start my plan now. I understand that if I withdraw within 14 days, I pay for the part already used."
});

export function testConsentDocuments(kind: ConsentKind, locale: string): Readonly<{ version: string; sha256: string }> | null {
  return locale === "en" ? consentDocument(TEST_CONSENT_TEXT[kind]) : null;
}

export class MutableClock {
  constructor(public now: Date) {}
  readonly read = (): Date => this.now;
  advance(ms: number): void { this.now = new Date(this.now.getTime() + ms); }
}

/** The expected side of an `eventKinds` comparison. */
export const kindsOf = (...kinds: string[]): string[] => [...kinds].sort();

/**
 * `work`, or `POOL_STARVED` after `ms`: a pool whose connections all wait on each other never settles, and the test
 * must fail rather than hang.
 */
export function within<T>(work: Promise<T>, ms: number): Promise<T> {
  return Promise.race([work, new Promise<never>((_resolve, reject) => {
    setTimeout(() => reject(new Error("POOL_STARVED")), ms).unref();
  })]);
}

/** Ends a test's own pool; a starved one holds connections that never come back, so the wait is bounded too. */
export async function endPoolWithin(pool: Pool, ms = 2_000): Promise<void> {
  await Promise.race([pool.end(), new Promise<void>((resolve) => { setTimeout(resolve, ms).unref(); })]);
}

/** xMoney stamps `creationDate` to the whole second (xmoney-openapi.yaml: "2020-05-18T00:00:00+00:00"). */
const wholeSecond = (value: Date): Date => new Date(Math.floor(value.getTime() / 1_000) * 1_000);

/**
 * The xMoney surface billing calls, in memory: payments made "in the browser" (`pay`), rebills, refunds, cards.
 * It stands in for P3's client wherever a test shapes a transaction's status by hand; the notice decryption
 * itself runs against P3's fake server (`tests/support/fake-xmoney.ts`) in P9a. Where the real service's behaviour is
 * known it is copied, so the stub cannot hide a case: `createdAt` has whole-second precision, an embedded payment is
 * `service-call` and a rebill `re-bill` (the OpenAPI `transactionSource` enum), and the refund model is P3b's careful
 * one (D5): every refund is its own `transactionType: "refund"` transaction (`complete-ok`, its own amount,
 * `relatedTransactionIds: [payment]`); a PARTIAL refund leaves the payment `complete-ok`, and only the refund that
 * leaves nothing turns it `refund-ok`. `refundRowsHidden` models the other reading X0 may record: no refund row.
 * A1 (P2-I6): our charge id lives on the ORDER only. Every transaction carries `externalOrderId: null`, as P3b's
 * protocol fake and the OpenAPI copy have it, so a match goes through `getOrder` exactly as it must against xMoney.
 * A payment is made by the customer its signed order names (`signed`, which the harness's checkout calls): the
 * xMoney customer `createCustomer` made for that identifier.
 */
export class StubXMoney {
  readonly transactions = new Map<string, XMoneyTransaction>();
  readonly orders = new Map<string, Readonly<{ orderId: string; externalOrderId: string | null }>>();
  readonly cards = new Map<string, string | null>();
  readonly orderCards = new Map<string, string>();
  readonly refunds: Array<Readonly<{ transactionId: string; amountDecimal: string | null; reason: string }>> = [];
  rebillCalls = 0;
  customers = 0;
  /** The next refund calls fail BEFORE anything moves, reported as an unknown outcome (a timeout that moved nothing). */
  refundFailures = 0;
  /** The next refund calls fail before any byte is sent, reported as such (P3b's XMONEY_UNAVAILABLE). */
  refundNotSent = 0;
  /** The next refund calls move the money and then lose the answer (XMONEY_OUTCOME_UNKNOWN after the refund). */
  refundLostResponses = 0;
  /** X0's other possible reading: a refund moves money but is listed as no transaction of its own. */
  refundRowsHidden = false;
  /** Rebills per xMoney order: a test counts its own subscription's charges, whatever else is due. */
  private readonly rebillsByOrder = new Map<string, number>();
  private readonly rebillFailures = new Map<string, Readonly<{ code: string; afterCreate: boolean }>>();
  /** Micros refunded so far per paid transaction. */
  private readonly refundedMicros = new Map<string, number>();
  /** Reads of one transaction that fail before any byte is sent (P3b's XMONEY_UNAVAILABLE), per transaction id. */
  private readonly lookupFailures = new Map<string, number>();
  /** xMoney's customer per our identifier (`createCustomer`), and the identifier each signed order names. */
  private readonly customersByIdentifier = new Map<string, string>();
  private readonly signedOrders = new Map<string, string>();
  /** Ids `createCustomer` answers next, reserved by a test that pays before its checkout exists. */
  private readonly reservedCustomers: string[] = [];
  /** `getOrder` calls so far (the checkout's look asks once per order). */
  getOrderCalls = 0;
  private sequence = 1_000;

  constructor(private readonly clock: () => Date) {}

  private next(): string { this.sequence += 1; return String(this.sequence); }

  /**
   * The next `times` reads of this one transaction (`getTransaction`) fail as an outage that sent nothing. Keyed by
   * transaction, so a test's outage never lands on another test's job that the same drain happens to run.
   */
  failNextLookup(transactionId: string, times = 1): void {
    this.lookupFailures.set(transactionId, (this.lookupFailures.get(transactionId) ?? 0) + times);
  }

  private add(fields: Pick<XMoneyTransaction, "orderId" | "externalOrderId" | "customerId" | "cardId" | "status" | "amountDecimal">
    & Partial<Pick<XMoneyTransaction, "transactionType" | "transactionSource" | "createdAt" | "relatedTransactionIds">>): XMoneyTransaction {
    const transaction = Object.freeze({
      transactionId: this.next(), currency: "USD", ip: "198.51.100.7", transactionSource: "service-call",
      transactionType: "deposit", createdAt: wholeSecond(this.clock()), relatedTransactionIds: Object.freeze([]), ...fields
    }) as XMoneyTransaction;
    this.transactions.set(transaction.transactionId, transaction);
    return transaction;
  }

  /** The refund transactions xMoney lists for one payment (D5's model). */
  refundTransactionsOf(paymentId: string): XMoneyTransaction[] {
    return [...this.transactions.values()].filter((transaction) =>
      transaction.transactionType === "refund" && transaction.relatedTransactionIds.includes(paymentId));
  }

  async createCustomer(input?: Readonly<{ identifier: string }>): Promise<{ customerId: string }> {
    this.customers += 1;
    const customerId = this.reservedCustomers.shift() ?? this.next();
    if (input !== undefined) this.customersByIdentifier.set(input.identifier, customerId);
    return { customerId };
  }

  /** The id the next `createCustomer` answers: a payment made before its checkout's customer exists names it. */
  reserveCustomer(): string {
    const customerId = this.next();
    this.reservedCustomers.push(customerId);
    return customerId;
  }

  /** An embedded order was signed for this merchant id and customer identifier (the harness's checkout reports it). */
  signed(externalOrderId: string, customerIdentifier: string): void {
    this.signedOrders.set(externalOrderId, customerIdentifier);
  }

  /** The xMoney customer whose signed order has this merchant id, when the stub created that customer. */
  private customerOfOrder(externalOrderId: string): string | null {
    const identifier = this.signedOrders.get(externalOrderId);
    return identifier === undefined ? null : this.customersByIdentifier.get(identifier) ?? null;
  }

  async getTransaction(transactionId: string): Promise<XMoneyTransaction> {
    const failing = this.lookupFailures.get(transactionId) ?? 0;
    if (failing > 0) {
      this.lookupFailures.set(transactionId, failing - 1);
      throw new TypedDomainError("XMONEY_UNAVAILABLE", "connection refused");
    }
    const found = this.transactions.get(transactionId);
    if (found === undefined) throw new TypedDomainError("XMONEY_REFUSED", "unknown transaction");
    return found;
  }

  async getOrder(orderId: string): Promise<{ orderId: string; externalOrderId: string | null }> {
    this.getOrderCalls += 1;
    const found = this.orders.get(orderId);
    if (found === undefined) throw new TypedDomainError("XMONEY_REFUSED", "unknown order");
    return found;
  }

  async getCard(cardId: string, _customerId: string): Promise<{ cardId: string; countryCode: string | null }> {
    return { cardId, countryCode: this.cards.get(cardId) ?? null };
  }

  async rebill(input: { orderId: string; customerId: string; amountDecimal: string }): Promise<{ transactionId: string; orderId: string }> {
    this.rebillCalls += 1;
    this.rebillsByOrder.set(input.orderId, this.rebillsFor(input.orderId) + 1);
    const failure = this.rebillFailures.get(input.orderId) ?? null;
    this.rebillFailures.delete(input.orderId);
    if (failure !== null && !failure.afterCreate) throw new TypedDomainError(failure.code, failure.code);
    const transaction = this.add({
      orderId: input.orderId, externalOrderId: null, customerId: input.customerId, cardId: this.orderCards.get(input.orderId) ?? null, status: "complete-ok",
      amountDecimal: input.amountDecimal, transactionSource: "re-bill"
    });
    if (failure !== null) throw new TypedDomainError(failure.code, failure.code);
    return { transactionId: transaction.transactionId, orderId: input.orderId };
  }

  async refund(input: { transactionId: string; amountDecimal: string | null; reason: string; message: string }): Promise<void> {
    if (this.refundNotSent > 0) {
      this.refundNotSent -= 1;
      throw new TypedDomainError("XMONEY_UNAVAILABLE", "connection refused");
    }
    if (this.refundFailures > 0) {
      this.refundFailures -= 1;
      throw new TypedDomainError("XMONEY_OUTCOME_UNKNOWN", "timeout");
    }
    this.refunds.push({ transactionId: input.transactionId, amountDecimal: input.amountDecimal, reason: input.reason });
    const found = this.transactions.get(input.transactionId);
    if (found !== undefined) {
      const paid = decimalToMicros(found.amountDecimal);
      const before = this.refundedMicros.get(found.transactionId) ?? 0;
      const amount = input.amountDecimal === null ? paid - before : decimalToMicros(input.amountDecimal);
      this.refundedMicros.set(found.transactionId, before + amount);
      if (!this.refundRowsHidden) {
        this.add({
          orderId: found.orderId, externalOrderId: null, customerId: found.customerId, cardId: found.cardId,
          status: "complete-ok", amountDecimal: microsToDecimal(amount), transactionType: "refund", transactionSource: null,
          relatedTransactionIds: Object.freeze([found.transactionId])
        });
      }
      if (before + amount >= paid) this.setStatus(found.transactionId, "refund-ok");
    }
    if (this.refundLostResponses > 0) {
      this.refundLostResponses -= 1;
      throw new TypedDomainError("XMONEY_OUTCOME_UNKNOWN", "the refund was made, the answer was lost");
    }
  }

  /** A2/A10's listing: by order and by creation time, both at xMoney's whole-second precision. */
  async listTransactions(input: Readonly<{
    orderId?: string; from?: Date; to?: Date; dateType?: string; onRejected?: (transactionId: string | null) => void;
  }>): Promise<ReadonlyArray<XMoneyTransaction>> {
    const from = input.from === undefined ? null : wholeSecond(input.from).getTime();
    const to = input.to === undefined ? null : wholeSecond(input.to).getTime() + 999;
    return [...this.transactions.values()].filter((transaction) => {
      if (input.orderId !== undefined && transaction.orderId !== input.orderId) return false;
      const created = transaction.createdAt?.getTime() ?? null;
      if (created === null) return true;
      return (from === null || created >= from) && (to === null || created <= to);
    });
  }

  /**
   * A person paying in the embedded form for the order whose merchant id is `externalOrderId`. The transaction carries
   * no merchant id (A1); its customer is `customerId`, else the one the signed order names, else a stranger.
   */
  pay(input: Readonly<{
    externalOrderId: string; amountDecimal: string; cardCountry: string | null; status?: XMoneyStatus;
    customerId?: string; transactionType?: string;
  }>): XMoneyTransaction {
    let order = [...this.orders.values()].find((candidate) => candidate.externalOrderId === input.externalOrderId);
    if (order === undefined) {
      order = Object.freeze({ orderId: this.next(), externalOrderId: input.externalOrderId });
      this.orders.set(order.orderId, order);
    }
    const cardId = this.orderCards.get(order.orderId) ?? this.next();
    this.cards.set(cardId, input.cardCountry);
    this.orderCards.set(order.orderId, cardId);
    return this.add({
      orderId: order.orderId, externalOrderId: null,
      customerId: input.customerId ?? this.customerOfOrder(input.externalOrderId) ?? "9999",
      cardId, status: input.status ?? "complete-ok", amountDecimal: input.amountDecimal,
      ...(input.transactionType === undefined ? {} : { transactionType: input.transactionType })
    });
  }

  /**
   * A dispute xMoney reports as its own `chargeback` transaction naming the payment (P3b's fake's model, P2-I2), on
   * the payment's order, customer and card, for its amount. Only the new transaction: the payment's own status is
   * left as it is (`setStatus` it to `charge-back` for the case where xMoney reports both).
   */
  dispute(paymentId: string, status: XMoneyStatus = "charge-back", transactionType = "chargeback"): XMoneyTransaction {
    const payment = this.transactions.get(paymentId);
    if (payment === undefined) throw new Error("STUB_TRANSACTION_UNKNOWN");
    return this.add({
      orderId: payment.orderId, externalOrderId: null, customerId: payment.customerId, cardId: payment.cardId, status,
      amountDecimal: payment.amountDecimal, transactionType, relatedTransactionIds: Object.freeze([paymentId])
    });
  }

  setStatus(transactionId: string, status: XMoneyStatus): void {
    const found = this.transactions.get(transactionId);
    if (found === undefined) throw new Error("STUB_TRANSACTION_UNKNOWN");
    this.transactions.set(transactionId, Object.freeze({ ...found, status }));
  }

  rebillsFor(orderId: string): number { return this.rebillsByOrder.get(orderId) ?? 0; }

  /**
   * The next rebill of this xMoney order fails with `code`. `afterCreate`: the transaction IS created, but the
   * caller sees the error (a lost response).
   */
  failNextRebill(orderId: string, code: string, afterCreate = false): void {
    this.rebillFailures.set(orderId, Object.freeze({ code, afterCreate }));
  }
}

/** P8c's checkout, reporting every order it signs to the stub: the order's customer is who pays it (A1). */
class HarnessCheckout extends CheckoutService {
  constructor(deps: CheckoutDeps, private readonly stub: StubXMoney) { super(deps); }

  override signEmbeddedOrder(input: EmbeddedOrderInput): SignedEmbeddedOrder {
    this.stub.signed(input.chargeId, input.customerIdentifier);
    return super.signEmbeddedOrder(input);
  }
}

export type Purchase = Readonly<{
  ownerRef: string; userId: string; quoteId: string; chargeId: string; subscriptionId: string;
  totalDecimal: string; orderPayload: string; orderChecksum: string; reused: boolean;
}>;

export type BillingHarness = Readonly<{
  database: TestDatabase;
  recordsKey: Buffer;
  xmoneyPrivateKey: Buffer;
  clock: MutableClock;
  xmoney: StubXMoney;
  tax: AdjustableTaxEngine;
  geo: StubGeo;
  repository: BillingRepository;
  jobs: BillingJobQueries;
  entitlements: EntitlementRepository;
  acceptances: AcceptanceRepository;
  audit: BillingAudit;
  auditLines: Array<Readonly<Record<string, unknown>>>;
  quotes: QuoteService;
  quotesWith(plans: BillingPlans): QuoteService;
  checkoutWith(overrides: Partial<CheckoutDeps>): CheckoutService;
  buy(input?: Readonly<{
    ownerRef?: string; userId?: string; planId?: "PLUS" | "PRO" | "MAX"; country?: string; chargeId?: string;
    countryConfirmed?: boolean; company?: Readonly<{ name: string; vatId: string; address: string }>;
  }>): Promise<Purchase>;
  refunds: RefundDesk;
  verify: VerifyPaymentHandler;
  worker: BillingOutboxWorker;
  notices: NoticeIntake;
  /**
   * An opaque "opensslResult" that the harness's notice intake decrypts to this transaction's notice. Like xMoney's,
   * the notice names the order's merchant id; `overrides` forge fields (a notice is not authenticated, spec §2.1).
   */
  noticeFor(transaction: XMoneyTransaction, overrides?: Partial<XMoneyNotice>): string;
  /** Enqueues VERIFY_PAYMENT for a transaction, as a notice or a rebill would, and drains the worker. */
  settle(transactionId: string, payload?: Readonly<Record<string, string | null>>): Promise<void>;
  activate(input?: Parameters<BillingHarness["buy"]>[0] & Readonly<{ cardCountry?: string }>): Promise<Purchase & Readonly<{ transaction: XMoneyTransaction }>>;
  outboxRows(ref: string): Promise<Array<Readonly<{ kind: string; ref: string; done: boolean; dead: boolean; lastErrorCode: string | null; notBefore: Date; payload: Readonly<Record<string, unknown>> }>>>;
  entitlementRows(ownerRef: string): Promise<Array<Readonly<{ planId: string; cause: string; paidThrough: Date | null }>>>;
  /** The charge's event kinds as a sorted multiset: events written in one transaction share one instant. */
  eventKinds(chargeId: string): Promise<string[]>;
  renewal: RenewalService;
  /**
   * W12 (A7): the EMAIL jobs, sent only when a test drains them (the main `worker` leaves them queued), through P7's
   * handler with the runtime's `sent` hook, so M3's notice record is written once M3 went out. `sent` holds every
   * message; attachments resolve to nothing.
   */
  mail: Readonly<{ sent: BillingMail[]; drain(): Promise<number> }>;
  /** P11b: the maintenance pass (dunning retries, period-end endings, the yearly reminder, the look-ahead notice). */
  maintenance: BillingMaintenance;
  /** A renewal service on its own pool: a second API process sharing the database. */
  renewalFor(pool: Pool): RenewalService;
  /** A renewal service with some deps replaced, e.g. `plans` from a later `billingPlans` version (Terms §12). */
  renewalWith(overrides: Partial<RenewalDeps>): RenewalService;
  periodEndOf(subscriptionId: string): Promise<Date>;
  /** Owners whose account erasure a test marks as pending (the stand-in for P15's lookup). */
  erasures: Set<string>;
  /**
   * Owners whose account a test marks as frozen by the age gate (0077's `age_frozen`, R3-2): the stand-in for the
   * same lookup, which P15 widens so that `billing.owner_erasure_pending` answers true for such an owner too.
   */
  frozen: Set<string>;
  stop(): Promise<void>;
}>;

export async function startBillingHarness(start = new Date("2026-10-01T10:00:00.000Z")): Promise<BillingHarness> {
  const database = await startTestDatabase();
  await migrate(database.pool);
  const recordsKey = randomBytes(32);
  const xmoneyPrivateKey = randomBytes(32);
  const clock = new MutableClock(start);
  const xmoney = new StubXMoney(clock.read);
  const tax = new AdjustableTaxEngine();
  const geo = new StubGeo();
  const repository = new BillingRepository(database.pool);
  const jobs = new BillingJobQueries(database.pool);
  const entitlements = new EntitlementRepository(database.pool);
  const acceptances = new AcceptanceRepository(database.pool);
  const auditLines: Array<Readonly<Record<string, unknown>>> = [];
  const audit: BillingAudit = (event, fields) => { auditLines.push(Object.freeze({ event, ...fields })); };
  const quotes = new QuoteService({
    repository, tax, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy, plans: testBillingPlans, recordsKey, audit
  });
  const checkoutDeps: CheckoutDeps = {
    repository, jobs, acceptances, xmoney, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    accountEmail: { read: async (userId: string) => `buyer-${userId.slice(0, 8)}@example.test` },
    consentDocuments: testConsentDocuments, recordsKey, xmoneyPrivateKey, xmoneyPublicKey: "pk_test_harness",
    siteId: "site-test", publicAppUrl: TEST_PUBLIC_APP_URL, xmoneyEnvironment: "stage", audit
  };
  const checkoutWith = (overrides: Partial<CheckoutDeps>): CheckoutService =>
    new HarnessCheckout({ ...checkoutDeps, ...overrides } as CheckoutDeps, xmoney);
  const checkout = checkoutWith({});
  const refunds = new RefundDesk({
    repository, jobs, xmoney, policy: testBillingPolicy, audit, clock: clock.read, xmoneyEnvironment: "stage"
  });
  const verify = new VerifyPaymentHandler({
    repository, jobs, xmoney, refunds, entitlements, countryPolicy: testCountryPolicy, policy: testBillingPolicy, recordsKey, audit,
    xmoneyEnvironment: "stage"
  });
  verify.registerSettlement("INITIAL", createInitialSettlement({
    repository, entitlements, acceptances, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL
  }));
  const erasures = new Set<string>();
  const frozen = new Set<string>();
  const renewalSettlement = createRenewalSettlement({
    repository, entitlements, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL
  });
  verify.registerSettlement("RENEWAL", renewalSettlement);
  const renewalDeps = (pool: Pool | null): RenewalDeps => ({
    repository: pool === null ? repository : new BillingRepository(pool),
    jobs: pool === null ? jobs : new BillingJobQueries(pool),
    entitlements: pool === null ? entitlements : new EntitlementRepository(pool),
    xmoney, tax, settlement: renewalSettlement, policy: testBillingPolicy, plans: testBillingPlans, recordsKey,
    publicAppUrl: TEST_PUBLIC_APP_URL, audit, clock: clock.read, kick: () => undefined, xmoneyEnvironment: "stage",
    erasurePending: async (ownerRef) => erasures.has(ownerRef) || frozen.has(ownerRef)
  });
  const renewalOn = (pool: Pool | null): RenewalService => new RenewalService(renewalDeps(pool));
  const renewal = renewalOn(null);
  const worker = new BillingOutboxWorker({ repository, workerId: "harness", clock: clock.read, audit, batchSize: 20 });
  worker.register("VERIFY_PAYMENT", verify.handle);
  worker.register("XMONEY_REFUND", refunds.handle);
  const maintenance = new BillingMaintenance({
    repository, jobs, entitlements, renewal, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL,
    xmoneyEnvironment: "stage", audit, clock: clock.read
  });
  worker.register("RENEWAL_NOTICE", createRenewalNoticeHandler({ repository, jobs, renewal, policy: testBillingPolicy }));
  const sentMail: BillingMail[] = [];
  const mailWorker = new BillingOutboxWorker({ repository, workerId: "harness-mail", clock: clock.read, audit, batchSize: 20 });
  const nothingAttached: AttachmentResolver = async () => null;
  mailWorker.register("EMAIL", createEmailJobHandler({
    repository, recipients: PROFILE_ADDRESS_ONLY, recordsKey, ownerReportEmail: "owner@example.test",
    mail: { sendTemplated: async (message) => { sentMail.push(message); } },
    attachments: new Map<BillingAttachmentKind, AttachmentResolver>([
      ["ACCEPTED_TERMS", nothingAttached], ["WITHDRAWAL_FORM", nothingAttached], ["SMARTBILL_INVOICE_PDF", nothingAttached]
    ]),
    sent: (job, now) => renewal.noticeMailSent(job, now)
  }));
  const mail = Object.freeze({ sent: sentMail, drain: () => mailWorker.drain(10) });
  const noticeTokens = new Map<string, XMoneyNotice>();
  const notices = new NoticeIntake({
    repository, audit, clock: clock.read, kick: () => undefined, xmoneyEnvironment: "stage",
    decrypt: (token) => {
      const notice = noticeTokens.get(token);
      if (notice === undefined) throw new Error("UNDECRYPTABLE");
      return notice;
    }
  });
  /** A quote service under another `billingPlans` version (a price published later; P11a's price test). */
  const quotesWith = (plans: BillingPlans): QuoteService => new QuoteService({
    repository, tax, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy, plans, recordsKey, audit
  });
  return Object.freeze({
    database, recordsKey, xmoneyPrivateKey, clock, xmoney, tax, geo, repository, jobs, entitlements, acceptances,
    audit, auditLines, quotes, quotesWith, checkoutWith,
    async buy(input = {}) {
      const ownerRef = input.ownerRef ?? randomUUID();
      const userId = input.userId ?? randomUUID();
      // A Romanian buyer carries the name, city and county SmartBill needs (R-15).
      const quoted = await quotes.create({
        ownerRef, ip: "198.51.100.7", planId: input.planId ?? "PLUS", country: input.country ?? "RO",
        name: "Test Buyer", region: "B", postalCode: null, city: "Bucuresti", company: input.company ?? null, now: clock.now
      });
      const chargeId = input.chargeId;
      const service = chargeId === undefined ? checkout : checkoutWith({ chargeIds: () => chargeId });
      const started = await service.start({
        ownerRef, userId, ip: "198.51.100.7", userAgent: "billing-harness", quoteRef: quoted.quote.quoteId,
        locale: "en", consents: {
          renewal: testConsentDocuments("CONSENT_RENEWAL", "en")!, immediateStart: testConsentDocuments("CONSENT_IMMEDIATE_START", "en")!
        },
        countryConfirmed: input.countryConfirmed ?? false, now: clock.now
      });
      const charge = await repository.charge(started.chargeId);
      if (charge === null) throw new Error("HARNESS_CHARGE_MISSING");
      return Object.freeze({
        ownerRef, userId, quoteId: quoted.quote.quoteId, chargeId: started.chargeId, subscriptionId: charge.subscriptionId,
        totalDecimal: microsToDecimal(charge.totalMicros), orderPayload: started.orderPayload,
        orderChecksum: started.orderChecksum, reused: started.reused
      });
    },
    refunds, verify, worker, notices, mail,
    renewal, maintenance, erasures, frozen,
    renewalFor: (pool) => renewalOn(pool),
    renewalWith: (overrides) => new RenewalService({ ...renewalDeps(null), ...overrides }),
    async periodEndOf(subscriptionId) {
      const end = foldSubscription(await repository.subscriptionEvents(subscriptionId)).currentPeriodEnd;
      if (end === null) throw new Error("HARNESS_NO_PERIOD");
      return end;
    },
    noticeFor(transaction, overrides = {}) {
      const token = `notice-${randomUUID()}`;
      noticeTokens.set(token, Object.freeze({
        transactionStatus: transaction.status, orderId: transaction.orderId,
        externalOrderId: xmoney.orders.get(transaction.orderId)?.externalOrderId ?? null,
        transactionId: transaction.transactionId, customerId: transaction.customerId, amountDecimal: transaction.amountDecimal,
        currency: transaction.currency, cardId: transaction.cardId, timestamp: null, ...overrides
      }));
      return token;
    },
    async settle(transactionId, payload = {}) {
      await repository.withTransaction((client) => repository.enqueue(client, {
        kind: "VERIFY_PAYMENT", ref: transactionId, notBefore: clock.now, payload
      }));
      await worker.drain(10);
    },
    async activate(input = {}) {
      const bought = await this.buy(input);
      const transaction = xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: input.cardCountry ?? "RO" });
      await this.settle(transaction.transactionId);
      return Object.freeze({ ...bought, transaction });
    },
    async outboxRows(ref) {
      const result = await database.pool.query<{ kind: string; ref: string; done_at: Date | null; dead_at: Date | null; last_error_code: string | null; not_before: Date; payload: Record<string, unknown> }>(
        "SELECT kind, ref, done_at, dead_at, last_error_code, not_before, payload FROM billing.outbox WHERE ref=$1 OR ref LIKE $2 ORDER BY not_before, kind",
        [ref, `%${ref}%`]
      );
      return result.rows.map((row) => Object.freeze({
        kind: row.kind, ref: row.ref, done: row.done_at !== null, dead: row.dead_at !== null,
        lastErrorCode: row.last_error_code, notBefore: row.not_before, payload: row.payload
      }));
    },
    async entitlementRows(ownerRef) {
      // In the order 0084's `billing.entitlement_at` resolves them: two rows of one instant (the harness clock does not
      // move between a plan's activation and its suspension) are ordered by when they were written, never by their id.
      const result = await database.pool.query<{ plan_id: string; cause: string; paid_through: Date | null }>(
        "SELECT plan_id, cause, paid_through FROM billing.entitlement_event WHERE owner_ref=$1 AND cause <> 'SIGNED_UP_FREE' ORDER BY effective_at, recorded_at, event_id",
        [ownerRef]
      );
      return result.rows.map((row) => Object.freeze({ planId: row.plan_id, cause: row.cause, paidThrough: row.paid_through }));
    },
    async eventKinds(chargeId) {
      return ((await repository.charge(chargeId))?.events ?? []).map((event) => event.kind).sort();
    },
    async stop() { await database.stop(); }
  });
}
