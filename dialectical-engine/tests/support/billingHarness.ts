import { randomBytes, randomUUID } from "node:crypto";
import { decimalToMicros, microsToDecimal } from "@debateai/billing-core";
import { AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type Pool } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { XMoneyStatus, XMoneyTransaction } from "@debateai/payments-xmoney";
import type { BillingPlans } from "@debateai/register";
import type { BillingAudit } from "../../apps/api/src/billing/audit.js";
import { CheckoutService, type CheckoutDeps, type ConsentKind } from "../../apps/api/src/billing/checkout.js";
import { QuoteService } from "../../apps/api/src/billing/quote.js";
import { consentDocument } from "../../apps/ui/scripts/legal-consent-manifest.mjs";
import { startTestDatabase, type TestDatabase } from "./testDatabase.js";
import { AdjustableTaxEngine, StubGeo, testBillingPlans, testBillingPolicy, testCountryPolicy } from "./billingFixtures.js";

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

  async createCustomer(): Promise<{ customerId: string }> { this.customers += 1; return { customerId: this.next() }; }

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
      orderId: input.orderId, externalOrderId: this.orders.get(input.orderId)?.externalOrderId ?? null,
      customerId: input.customerId, cardId: this.orderCards.get(input.orderId) ?? null, status: "complete-ok",
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
          orderId: found.orderId, externalOrderId: found.externalOrderId, customerId: found.customerId, cardId: found.cardId,
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

  /** A person paying in the embedded form for the order whose merchant id is `externalOrderId`. */
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
      orderId: order.orderId, externalOrderId: input.externalOrderId, customerId: input.customerId ?? "9999",
      cardId, status: input.status ?? "complete-ok", amountDecimal: input.amountDecimal,
      ...(input.transactionType === undefined ? {} : { transactionType: input.transactionType })
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
  const checkoutWith = (overrides: Partial<CheckoutDeps>): CheckoutService => new CheckoutService({ ...checkoutDeps, ...overrides } as CheckoutDeps);
  const checkout = checkoutWith({});
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
    async stop() { await database.stop(); }
  });
}
