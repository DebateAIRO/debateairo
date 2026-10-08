import { randomBytes, randomUUID } from "node:crypto";
import {
  foldSubscription, microsToDecimal, paymentError, type CardPayments, type HostedPaymentStart, type HostedPaymentStarted,
  type PaymentReport, type PaymentState, type SavedCardCharge
} from "@debateai/billing-core";
import { AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type Pool } from "@debateai/db";
import type { BillingPlans } from "@debateai/register";
import type { BillingRecipientReader } from "../../apps/api/src/billing/account-email.js";
import type { BillingAudit } from "../../apps/api/src/billing/audit.js";
import { CheckoutService, type CheckoutDeps, type ConsentKind } from "../../apps/api/src/billing/checkout.js";
import {
  createEmailJobHandler, type AttachmentResolver, type BillingAttachmentKind, type BillingMail
} from "../../apps/api/src/billing/email-job.js";
import { BillingMaintenance } from "../../apps/api/src/billing/maintenance.js";
import { englishOrderText } from "../../apps/api/src/billing/order-text.js";
import { BillingOutboxWorker } from "../../apps/api/src/billing/outbox.js";
import { QuoteService } from "../../apps/api/src/billing/quote.js";
import { sealCardToken } from "../../apps/api/src/billing/records.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { RenewalService, type RenewalDeps } from "../../apps/api/src/billing/renewal.js";
import { createRenewalNoticeHandler } from "../../apps/api/src/billing/renewal-notice-job.js";
import { createInitialSettlement } from "../../apps/api/src/billing/settlement-initial.js";
import { createRenewalSettlement } from "../../apps/api/src/billing/settlement-renewal.js";
import { VerifyPaymentHandler } from "../../apps/api/src/billing/verify-payment.js";
import { consentDocument } from "../../apps/ui/scripts/legal-consent-manifest.mjs";
import { testCardToken } from "./billingSubscriptionFixtures.js";
import { stubPaymentReport } from "./stub-card-payments.js";
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

/**
 * What a saved-card charge does at NETOPIA, scripted per subscription (spec 2026-10-05 §2.9): `PAID` at once (the
 * default, a frictionless merchant-initiated payment), `PENDING`, `DECLINED` (code 20, a card decline the bank gave),
 * `ACTION_REQUIRED` (3-D Secure asked, code 100), `PAID_ANSWER_LOST` (the charge is made, the answer is lost: a later
 * status read finds it PAID), `UNKNOWN_NOTHING_MADE` (the answer is lost and nothing was made: the order is unknown),
 * and the three errors that prove nothing reached NETOPIA or was refused before any charge.
 */
export type HarnessChargeOutcome =
  | "PAID" | "PENDING" | "DECLINED" | "ACTION_REQUIRED" | "PAID_ANSWER_LOST" | "UNKNOWN_NOTHING_MADE"
  | "UNAVAILABLE" | "CREDENTIALS" | "CONFIGURATION";

/**
 * NETOPIA's port in memory (the NETOPIA counterpart of the harness's former xMoney stub; the protocol itself runs
 * against N5's fake in the fake stack). Our charge id is NETOPIA's orderID, so every report is keyed by charge. A status
 * read answers the order's current report, or NO_SUCH_ORDER. There is no `refund`: RefundDesk runs in the owner mode
 * (spec §2.12.2), as in production until N-10.
 */
export class HarnessPayments implements CardPayments {
  readonly provider = "netopia" as const;
  readonly environment = "sandbox" as const;
  readonly reports = new Map<string, PaymentReport>();
  readonly hosted: HostedPaymentStart[] = [];
  readonly charges: SavedCardCharge[] = [];
  readonly #outcomes = new Map<string, HarnessChargeOutcome[]>();
  readonly #countries = new Map<string, string>();
  readonly #statusFailures = new Map<string, number>();
  readonly #calls = new Map<string, number>();
  readonly #made = new Map<string, number>();

  /** `subscriptionOf`: the subscription a charge belongs to (the harness reads its own database). */
  constructor(private readonly clock: () => Date, private readonly subscriptionOf: (chargeId: string) => Promise<string>) {}

  /** The next saved-card charge of this subscription ends as `outcome`; several calls queue in order. */
  failNextCharge(subscriptionId: string, outcome: HarnessChargeOutcome): void {
    this.#outcomes.set(subscriptionId, [...(this.#outcomes.get(subscriptionId) ?? []), outcome]);
  }

  /** The next `times` status reads of this charge fail before anything is sent (PAYMENT_PROVIDER_UNAVAILABLE). */
  failNextStatus(chargeId: string, times = 1): void {
    this.#statusFailures.set(chargeId, (this.#statusFailures.get(chargeId) ?? 0) + times);
  }

  /** The issuer country NETOPIA reports on this subscription's next saved-card charges (default: Romania). */
  cardCountryFor(subscriptionId: string, iso2: string): void {
    this.#countries.set(subscriptionId, iso2);
  }

  /** Saved-card charge calls made for this subscription, whatever their outcome. */
  chargesFor(subscriptionId: string): number { return this.#calls.get(subscriptionId) ?? 0; }

  /** Saved-card charges NETOPIA actually made for this subscription (PAID, or PAID with the answer lost). */
  madeFor(subscriptionId: string): number { return this.#made.get(subscriptionId) ?? 0; }

  /** A person paying a hosted payment (a checkout, an upgrade or a card check) on NETOPIA's page. */
  pay(chargeId: string, input: Readonly<{ amountMicros: number; cardCountry: string | null }>): PaymentReport {
    const report = stubPaymentReport(chargeId, input.amountMicros === 0 ? "AUTHORIZED" : "PAID", {
      amountMicros: input.amountMicros, currency: "USD", cardCountry: input.cardCountry, occurredAt: this.clock()
    });
    this.reports.set(chargeId, report);
    return report;
  }

  /** NETOPIA's status of a charge changes (a void, an admin refund, a charge-back): the amount and card are kept. */
  setState(chargeId: string, state: PaymentState, overrides: Partial<PaymentReport> = {}): PaymentReport {
    const current = this.reports.get(chargeId);
    if (current === undefined) throw new Error("HARNESS_PAYMENT_UNKNOWN");
    const report = stubPaymentReport(chargeId, state, {
      providerPaymentId: current.providerPaymentId, amountMicros: current.amountMicros, currency: current.currency,
      cardCountry: current.cardCountry, occurredAt: this.clock(), ...overrides
    });
    this.reports.set(chargeId, report);
    return report;
  }

  async startHostedPayment(input: HostedPaymentStart): Promise<HostedPaymentStarted> {
    this.hosted.push(input);
    return Object.freeze({
      providerPaymentId: `ntp-${input.orderId.slice(0, 12)}`,
      redirectUrl: `https://secure-sandbox.netopia-payments.com/ui/card?p=${input.orderId}`
    });
  }

  async chargeSavedCard(input: SavedCardCharge): Promise<PaymentReport> {
    this.charges.push(input);
    const subscriptionId = await this.subscriptionOf(input.orderId);
    this.#calls.set(subscriptionId, this.chargesFor(subscriptionId) + 1);
    const outcome = this.#outcomes.get(subscriptionId)?.shift() ?? "PAID";
    const base = {
      amountMicros: input.amountMicros, currency: input.currency, cardCountry: this.#countries.get(subscriptionId) ?? "RO",
      occurredAt: this.clock()
    };
    const made = (): PaymentReport => {
      this.#made.set(subscriptionId, this.madeFor(subscriptionId) + 1);
      const report = stubPaymentReport(input.orderId, "PAID", base);
      this.reports.set(input.orderId, report);
      return report;
    };
    switch (outcome) {
      case "PAID":
        return made();
      case "PAID_ANSWER_LOST":
        made();
        throw paymentError("PAYMENT_OUTCOME_UNKNOWN", "UND_ERR_SOCKET");
      case "UNKNOWN_NOTHING_MADE":
        throw paymentError("PAYMENT_OUTCOME_UNKNOWN", "UND_ERR_SOCKET");
      case "UNAVAILABLE":
        throw paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "429");
      case "CREDENTIALS":
        throw paymentError("PAYMENT_CREDENTIALS_REFUSED", "401");
      case "CONFIGURATION":
        throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "32");
      case "PENDING":
      case "DECLINED":
      case "ACTION_REQUIRED": {
        const report = stubPaymentReport(input.orderId, outcome, outcome === "DECLINED"
          ? { ...base, declineCode: "20", declineSide: "CARD", bankDeclined: true }
          : outcome === "ACTION_REQUIRED" ? { ...base, declineCode: "100" } : base);
        this.reports.set(input.orderId, report);
        return report;
      }
      default:
        return exhaustive(outcome);
    }
  }

  async status(input: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER"> {
    const failing = this.#statusFailures.get(input.orderId) ?? 0;
    if (failing > 0) {
      this.#statusFailures.set(input.orderId, failing - 1);
      throw paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "429");
    }
    return this.reports.get(input.orderId) ?? "NO_SUCH_ORDER";
  }
}

function exhaustive(value: never): never {
  throw new Error(`HARNESS_UNEXPECTED_OUTCOME:${String(value)}`);
}

/** The payer's current address (W8), as DekBillingRecipientReader answers for an account still standing. */
const HARNESS_PAYERS: BillingRecipientReader = Object.freeze({
  currentAddress: async (customerId: string) => `payer-${customerId.slice(0, 8)}@example.test`
});

export type Purchase = Readonly<{
  ownerRef: string; userId: string; quoteId: string; chargeId: string; subscriptionId: string;
  totalDecimal: string; redirectUrl: string; reused: boolean;
}>;

export type BillingHarness = Readonly<{
  database: TestDatabase;
  recordsKey: Buffer;
  clock: MutableClock;
  payments: HarnessPayments;
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
    /** The postal code and the free-text state or county the buyer typed (defaults below). */
    postalCode?: string; region?: string;
  }>): Promise<Purchase>;
  refunds: RefundDesk;
  verify: VerifyPaymentHandler;
  worker: BillingOutboxWorker;
  /** Enqueues VERIFY_PAYMENT as NETOPIA's message or a charge's answer would (ref = our charge id), and drains the worker. */
  settle(chargeId: string, payload?: Readonly<Record<string, string | null>>): Promise<void>;
  /** Stores the card a payment of this charge saved, as N9's intake stores a message's token. Returns its id. */
  storeCardToken(chargeId: string, input?: Readonly<{ cardCountry?: string; expYear?: number; paidAt?: Date }>): Promise<string>;
  /** `buy`, the card the first payment saved, NETOPIA's PAID status, then VERIFY_PAYMENT. */
  activate(input?: Parameters<BillingHarness["buy"]>[0] & Readonly<{ cardCountry?: string }>): Promise<Purchase & Readonly<{ payment: PaymentReport; cardTokenId: string }>>;
  /** The refunds handed to the owner for this charge (O2_REFUND_DUE, spec §2.12.2), oldest first. */
  ownerRefundsDue(chargeId: string): Promise<Array<Readonly<{ refundAmount: string; refundReason: string; whole: string }>>>;
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
  const clock = new MutableClock(start);
  const tax = new AdjustableTaxEngine();
  const geo = new StubGeo();
  const repository = new BillingRepository(database.pool);
  const jobs = new BillingJobQueries(database.pool);
  const entitlements = new EntitlementRepository(database.pool);
  const acceptances = new AcceptanceRepository(database.pool);
  const payments = new HarnessPayments(clock.read, async (chargeId) => {
    const charge = await repository.charge(chargeId);
    if (charge === null) throw new Error("HARNESS_CHARGE_MISSING");
    return charge.subscriptionId;
  });
  /** N10, N11, N14 (skeleton §1 rule 2): what the NETOPIA paths of VERIFY_PAYMENT, the renewal and RefundDesk need. */
  const netopiaPort = Object.freeze({ payments, paymentEnvironment: "sandbox" as const, jobs });
  /** Until N23: the xMoney deps member the not-yet-cleaned services still type; every call fails before any byte. */
  const noXMoney = async (): Promise<never> => { throw new Error("HARNESS_HAS_NO_XMONEY"); };
  const NO_XMONEY = Object.freeze({
    getTransaction: noXMoney, getOrder: noXMoney, getCard: noXMoney, refund: noXMoney, listTransactions: noXMoney,
    rebill: noXMoney, createCustomer: noXMoney
  });
  const auditLines: Array<Readonly<Record<string, unknown>>> = [];
  const audit: BillingAudit = (event, fields) => { auditLines.push(Object.freeze({ event, ...fields })); };
  const quotes = new QuoteService({
    repository, tax, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy, plans: testBillingPlans, recordsKey, audit
  });
  const checkoutDeps: CheckoutDeps = {
    repository, jobs, acceptances, payments, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    accountEmail: { read: async (userId: string) => `buyer-${userId.slice(0, 8)}@example.test` },
    consentDocuments: testConsentDocuments, recordsKey, publicAppUrl: TEST_PUBLIC_APP_URL, audit
  };
  const checkoutWith = (overrides: Partial<CheckoutDeps>): CheckoutService =>
    new CheckoutService({ ...checkoutDeps, ...overrides } as CheckoutDeps);
  const checkout = checkoutWith({});
  const refunds = new RefundDesk({
    repository, jobs, xmoney: NO_XMONEY as never, policy: testBillingPolicy, audit, clock: clock.read, xmoneyEnvironment: "stage",
    netopia: netopiaPort
  });
  const verify = new VerifyPaymentHandler({
    repository, jobs, xmoney: NO_XMONEY as never, refunds, entitlements, countryPolicy: testCountryPolicy,
    policy: testBillingPolicy, recordsKey, audit, xmoneyEnvironment: "stage", netopia: netopiaPort
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
    xmoney: NO_XMONEY as never, tax, settlement: renewalSettlement, policy: testBillingPolicy, plans: testBillingPlans,
    recordsKey, publicAppUrl: TEST_PUBLIC_APP_URL, audit, clock: clock.read, kick: () => undefined, xmoneyEnvironment: "stage",
    netopia: { payments, paymentEnvironment: "sandbox", recipients: HARNESS_PAYERS, orderText: englishOrderText },
    erasurePending: async (ownerRef) => erasures.has(ownerRef) || frozen.has(ownerRef)
  });
  const renewalOn = (pool: Pool | null): RenewalService => new RenewalService(renewalDeps(pool));
  const renewal = renewalOn(null);
  const worker = new BillingOutboxWorker({ repository, workerId: "harness", clock: clock.read, audit, batchSize: 20 });
  worker.register("VERIFY_PAYMENT", verify.handle);
  worker.register("XMONEY_REFUND", refunds.handle);
  worker.register("PAYMENT_REFUND", refunds.handle);
  const maintenance = new BillingMaintenance({
    repository, jobs, entitlements, renewal, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL,
    xmoneyEnvironment: "stage", paymentEnvironment: "sandbox", audit, clock: clock.read
  });
  worker.register("RENEWAL_NOTICE", createRenewalNoticeHandler({
    repository, jobs, renewal, policy: testBillingPolicy, xmoneyEnvironment: "stage", paymentEnvironment: "sandbox", audit
  }));
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
  /** A quote service under another `billingPlans` version (a price published later; P11a's price test). */
  const quotesWith = (plans: BillingPlans): QuoteService => new QuoteService({
    repository, tax, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy, plans, recordsKey, audit
  });
  return Object.freeze({
    database, recordsKey, clock, payments, tax, geo, repository, jobs, entitlements, acceptances,
    audit, auditLines, quotes, quotesWith, checkoutWith,
    async buy(input = {}) {
      const ownerRef = input.ownerRef ?? randomUUID();
      const userId = input.userId ?? randomUUID();
      // A Romanian buyer carries the name, city and county SmartBill needs (R-15); a US or Canadian buyer the postal
      // code Quaderno prices by (P2-M29; New York's and Ottawa's, where the fakes are not registered); every buyer the
      // full cardholder NETOPIA needs (spec 2026-10-05 §2.6.1).
      const country = input.country ?? "RO";
      const postalCode = input.postalCode
        ?? ({ US: "10001", CA: "K1A 0B1", RO: "010011", DE: "10115" } as Readonly<Record<string, string>>)[country] ?? "00000";
      const quoted = await quotes.create({
        ownerRef, ip: "198.51.100.7", planId: input.planId ?? "PLUS", country, name: null, firstName: "Test",
        lastName: "Buyer", phone: "+40712345678", street: "Strada Test 1", region: input.region ?? "Bucuresti",
        postalCode, city: "Sector 1", company: input.company ?? null, now: clock.now
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
        totalDecimal: microsToDecimal(charge.totalMicros), redirectUrl: started.redirectUrl, reused: started.reused
      });
    },
    refunds, verify, worker, mail,
    renewal, maintenance, erasures, frozen,
    renewalFor: (pool) => renewalOn(pool),
    renewalWith: (overrides) => new RenewalService({ ...renewalDeps(null), ...overrides }),
    async periodEndOf(subscriptionId) {
      const end = foldSubscription(await repository.subscriptionEvents(subscriptionId)).currentPeriodEnd;
      if (end === null) throw new Error("HARNESS_NO_PERIOD");
      return end;
    },
    async settle(chargeId, payload = {}) {
      await repository.withTransaction((client) => repository.enqueue(client, {
        kind: "VERIFY_PAYMENT", ref: chargeId, notBefore: clock.now, payload: { charge_id: chargeId, ...payload }
      }));
      await worker.drain(10);
    },
    async storeCardToken(chargeId, input = {}) {
      const charge = await repository.charge(chargeId);
      if (charge === null) throw new Error("HARNESS_CHARGE_MISSING");
      const customer = await repository.customerByOwner(charge.ownerRef);
      if (customer === null) throw new Error("HARNESS_CUSTOMER_MISSING");
      const tokenId = randomUUID();
      const paidAt = input.paidAt ?? clock.now;
      // Built from pieces: never a key-like literal (spec §2.2 rule 2).
      const sealed = sealCardToken(recordsKey, tokenId, testCardToken(["harness", "tok", tokenId.slice(0, 8)].join("-")));
      await repository.withTransaction((client) => repository.insertCardToken(client, {
        tokenId, customerId: customer.customerId, paymentProvider: "netopia", paymentEnvironment: "sandbox",
        sourceChargeId: chargeId, sourceToolOrder: null, sourceNoticeId: null, sourcePaidAt: paidAt,
        tokenCiphertext: sealed.ciphertext, keyId: sealed.keyId, expMonth: 12,
        expYear: input.expYear ?? paidAt.getUTCFullYear() + 3, last4: "4242", cardCountry: input.cardCountry ?? "RO",
        createdAt: paidAt
      }));
      return tokenId;
    },
    async activate(input = {}) {
      const bought = await this.buy(input);
      const charge = await repository.charge(bought.chargeId);
      if (charge === null) throw new Error("HARNESS_CHARGE_MISSING");
      const cardCountry = input.cardCountry ?? "RO";
      const cardTokenId = await this.storeCardToken(bought.chargeId, { cardCountry });
      const payment = payments.pay(bought.chargeId, { amountMicros: charge.totalMicros, cardCountry });
      await this.settle(bought.chargeId);
      return Object.freeze({ ...bought, payment, cardTokenId });
    },
    async ownerRefundsDue(chargeId) {
      const found = await database.pool.query<{ amount: string; reason: string; whole: string }>(`
        SELECT payload->>'param.refundAmount' AS amount, payload->>'param.refundReason' AS reason,
          payload->>'param.whole' AS whole
        FROM billing.outbox WHERE kind = 'EMAIL' AND payload->>'template' = 'O2_REFUND_DUE'
          AND payload->>'param.chargeRef' = $1
        ORDER BY created_at
      `, [chargeId]);
      return found.rows.map((row) => Object.freeze({ refundAmount: row.amount, refundReason: row.reason, whole: row.whole }));
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
