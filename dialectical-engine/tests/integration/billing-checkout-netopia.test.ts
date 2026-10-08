import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  paymentError, type CardPayments, type HostedPaymentStart, type HostedPaymentStarted, type PaymentReport, type PaymentState
} from "@debateai/billing-core";
import { AcceptanceRepository, BillingJobQueries, BillingRepository, migrate } from "@debateai/db";
import { ChargeStatusReader, waitingCheckAfterMs } from "../../apps/api/src/billing/charge-status.js";
import { CheckoutService, type CheckoutDeps, type ConsentKind } from "../../apps/api/src/billing/checkout.js";
import { QuoteService, type QuoteInput } from "../../apps/api/src/billing/quote.js";
import { openBillingProfile, openPaymentUrl } from "../../apps/api/src/billing/records.js";
import { chargeEvent } from "../../apps/api/src/billing/rows.js";
import { consentDocument } from "../../apps/ui/scripts/legal-consent-manifest.mjs";
import {
  activeSubscriptionEvents, AdjustableTaxEngine, StubGeo, testBillingPlans, testBillingPolicy, testCountryPolicy
} from "../support/billingFixtures.js";
import { recordingAudit, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const MINUTE = 60_000;
const START = new Date("2026-10-01T10:00:00.000Z");
const clock = { now: START };
const advance = (ms: number): void => { clock.now = new Date(clock.now.getTime() + ms); };
const geo = new StubGeo();
beforeEach(() => { clock.now = START; geo.country = "RO"; geo.tor = false; });

const TEXT: Readonly<Record<ConsentKind, string>> = Object.freeze({
  CONSENT_RENEWAL: "I agree that NETOPIA Payments keeps my card and that {total} is charged to it every month until I cancel.",
  CONSENT_IMMEDIATE_START: "Start my plan now. I understand that if I withdraw within 14 days, I pay for the part already used."
});
const consentDocuments = (kind: ConsentKind, locale: string) => (locale === "en" ? consentDocument(TEXT[kind]) : null);
const consents = () => ({ renewal: consentDocument(TEXT.CONSENT_RENEWAL), immediateStart: consentDocument(TEXT.CONSENT_IMMEDIATE_START) });

const STATUS: Readonly<Record<PaymentState, string>> = Object.freeze({
  PENDING: "1", AUTHORIZED: "2", PAID: "3", VOIDED: "4", REFUNDED: "8", CHARGEBACK_OPENED: "9", CHARGEBACK_LOST: "10",
  FAILED: "11", DECLINED: "12", ACTION_REQUIRED: "15", CHARGEBACK_REPRESENTED: "16", UNCLEAR: "17", EXPIRED: "23"
});
const ntpOf = (orderId: string): string => `ntp-${orderId.slice(0, 16)}`;
/** A payment URL on NETOPIA's sandbox host; the query part is made from the order, never key-like. */
const pageOf = (orderId: string): string => `https://secure-sandbox.netopia-payments.com/ui/card?p=${orderId.slice(0, 12)}`;
function report(orderId: string, state: PaymentState, providerStatus = STATUS[state]): PaymentReport {
  return Object.freeze({
    orderId, providerPaymentId: ntpOf(orderId), state, providerStatus, amountMicros: 24_200_000, currency: "USD",
    cardCountry: null, savedCard: null, declineCode: null, declineSide: null, bankDeclined: false, occurredAt: null, clientId: null
  });
}

/** The port, scripted per order: an unscripted start opens a page; an unscripted status is "untouched" (status 1). */
class ScriptedPayments implements CardPayments {
  readonly provider = "netopia" as const;
  readonly environment = "sandbox" as const;
  readonly starts: HostedPaymentStart[] = [];
  readonly reads: Array<Readonly<{ orderId: string; providerPaymentId: string | null }>> = [];
  startFailure: Error | null = null;
  private readonly statuses = new Map<string, PaymentReport | "NO_SUCH_ORDER" | Error>();

  scriptStatus(orderId: string, outcome: PaymentReport | "NO_SUCH_ORDER" | Error): void { this.statuses.set(orderId, outcome); }
  async startHostedPayment(input: HostedPaymentStart): Promise<HostedPaymentStarted> {
    this.starts.push(input);
    const failure = this.startFailure;
    this.startFailure = null;
    if (failure !== null) throw failure;
    return Object.freeze({ providerPaymentId: ntpOf(input.orderId), redirectUrl: pageOf(input.orderId) });
  }
  async chargeSavedCard(): Promise<PaymentReport> { throw new Error("NOT_IN_THIS_SUITE"); }
  async status(input: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER"> {
    this.reads.push(input);
    const next = this.statuses.get(input.orderId) ?? report(input.orderId, "PENDING");
    if (next instanceof Error) throw next;
    return next;
  }
}

function world() {
  const repository = new BillingRepository(database.pool);
  const jobs = new BillingJobQueries(database.pool);
  const payments = new ScriptedPayments();
  const audit = recordingAudit();
  const tax = new AdjustableTaxEngine();
  const quotes = new QuoteService({
    repository, tax, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy, plans: testBillingPlans,
    recordsKey: TEST_RECORDS_KEY, audit
  });
  const deps: CheckoutDeps = {
    repository, jobs, acceptances: new AcceptanceRepository(database.pool), payments,
    accountEmail: { read: async () => "buyer@example.test" }, geo, countryPolicy: testCountryPolicy,
    policy: testBillingPolicy, consentDocuments, recordsKey: TEST_RECORDS_KEY, publicAppUrl: TEST_PUBLIC_APP_URL, audit
  };
  const checkout = new CheckoutService(deps);
  // Ruling PR-19: every billing owner_ref is a uuid (0085).
  const ownerRef = randomUUID();
  const quote = async (overrides: Partial<QuoteInput> = {}) => (await quotes.create({
    ownerRef, ip: "198.51.100.7", planId: "PLUS", country: "RO", name: null, firstName: "Ana", lastName: "Pop",
    phone: "+40 712 345 678", street: "Strada Memorandumului 1", region: "Cluj", postalCode: "400001",
    city: "Cluj-Napoca", company: null, now: clock.now, ...overrides
  })).quote.quoteId;
  const start = (quoteRef: string, overrides: Partial<Parameters<CheckoutService["start"]>[0]> = {}) => checkout.start({
    ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "n18", quoteRef, locale: "en", consents: consents(),
    countryConfirmed: false, now: clock.now, ...overrides
  });
  return { repository, jobs, payments, audit, quotes, quote, start, ownerRef };
}

const trail = async (chargeId: string): Promise<string[]> =>
  ((await new BillingRepository(database.pool).charge(chargeId))?.events ?? [])
    .map((event) => event.errorCode === null ? event.kind : `${event.kind}:${event.errorCode}`);
const ownerAlerts = async (reasonCode: string, chargeId: string) => (await database.pool.query(
  "SELECT 1 FROM billing.outbox WHERE kind = 'EMAIL' AND ref LIKE 'O3:%' AND payload->>'param.reasonCode' = $1 AND payload->>'param.reference' = $2",
  [reasonCode, `charge ${chargeId}`]
)).rowCount;

describe("N18 the checkout starts NETOPIA's page (spec §2.6.2)", () => {
  it("sends the payer, the client id and our addresses, and records CREATED, the charge, the profile, the page and SUBMITTED", async () => {
    const w = world();
    const result = await w.start(await w.quote());
    expect(result).toEqual({ chargeId: expect.stringMatching(/^[0-9a-f]{32}$/u), redirectUrl: pageOf(result.chargeId), environment: "sandbox", reused: false });
    const customer = await w.repository.customerByOwner(w.ownerRef);
    expect(w.payments.starts).toHaveLength(1);
    expect(w.payments.starts[0]).toEqual({
      orderId: result.chargeId, amountMicros: 24_200_000, currency: "USD", description: "DebateAI Plus monthly plan",
      clientId: customer!.customerId.replaceAll("-", ""), language: "en",
      returnUrl: `${TEST_PUBLIC_APP_URL}/checkout/return?charge=${result.chargeId}`,
      notifyUrl: `${TEST_PUBLIC_APP_URL}/api/v1/billing/netopia/notify`,
      payer: {
        firstName: "Ana", lastName: "Pop", email: "buyer@example.test", phone: "+40712345678", country: "RO",
        region: "Cluj", city: "Cluj-Napoca", postalCode: "400001", street: "Strada Memorandumului 1"
      }
    });
    const charge = await w.repository.charge(result.chargeId);
    expect(charge).toMatchObject({ kind: "INITIAL", totalMicros: 24_200_000, paymentProvider: "netopia", paymentEnvironment: "sandbox" });
    expect(await trail(result.chargeId)).toEqual(["REQUESTED", "SUBMITTED"]);
    const [created] = await w.repository.subscriptionEvents(charge!.subscriptionId);
    expect(created).toMatchObject({
      kind: "CREATED", xmoneyCustomerId: null,
      data: { payment_provider: "netopia", payment_environment: "sandbox", country_confirmed: false, ip_country: "RO" }
    });
    const hosted = await w.repository.withTransaction((client) => w.repository.hostedPaymentForCharge(client, result.chargeId));
    expect(hosted).toMatchObject({ providerPaymentId: ntpOf(result.chargeId), startedAt: START });
    expect(openPaymentUrl(TEST_RECORDS_KEY, result.chargeId, hosted!.redirectCiphertext)).toBe(pageOf(result.chargeId));
    const profile = await w.repository.latestProfile(customer!.customerId);
    expect(openBillingProfile(TEST_RECORDS_KEY, customer!.customerId, profile!.profileCiphertext)).toMatchObject({
      email: "buyer@example.test", firstName: "Ana", lastName: "Pop", phone: "+40712345678", paymentIp: "198.51.100.7",
      name: "Ana Pop", street: "Strada Memorandumului 1"
    });
    expect((await database.pool.query("SELECT kind, surface FROM legal.acceptance WHERE owner_ref = $1 ORDER BY kind", [w.ownerRef])).rows)
      .toEqual([{ kind: "IMMEDIATE_START", surface: "CHECKOUT" }, { kind: "RENEWAL_TERMS", surface: "CHECKOUT" }]);
    // NETOPIA has no customer object: no xMoney link is written (spec §2.6.2 step 2).
    expect((await database.pool.query("SELECT 1 FROM billing.customer_xmoney WHERE customer_id = $1", [customer!.customerId])).rowCount).toBe(0);
    // Spec §2.2 rule 5: no audit line carries the URL, the phone or the address.
    const lines = JSON.stringify(w.audit.events);
    for (const secret of ["netopia-payments.com", "+40712345678", "buyer@example.test", "Memorandumului"]) expect(lines).not.toContain(secret);
  });

  it("refuses 422 a checkout whose quote lacks a payer field, and a phone it cannot read, and calls nobody", async () => {
    const w = world();
    await expect(w.start(await w.quote({ phone: null }))).rejects.toMatchObject({ status: 422, code: "BILLING_ADDRESS_REQUIRED" });
    // The quote keeps the phone as E.164 and refuses one it cannot read (spec §2.6.1).
    await expect(w.quote({ phone: "0712 345 678" })).rejects.toMatchObject({ status: 422, code: "BILLING_PHONE_INVALID" });
    expect(w.payments.starts).toHaveLength(0);
    expect(await w.repository.subscriptionForOwner(w.ownerRef)).toBeNull();
  });

  it("refuses a stale consent, an unconfirmed country, an expired quote and a live plan before anything is written", async () => {
    const w = world();
    const quoteRef = await w.quote();
    await expect(w.start(quoteRef, { consents: { ...consents(), renewal: { version: "sha256-000000000000", sha256: "0".repeat(64) } } }))
      .rejects.toMatchObject({ status: 409, code: "LEGAL_DOCUMENT_STALE" });
    geo.country = "DE";
    await expect(w.start(quoteRef)).rejects.toMatchObject({ status: 409, code: "COUNTRY_CONFIRMATION_REQUIRED" });
    geo.country = "RO";
    advance(31 * MINUTE);
    await expect(w.start(quoteRef)).rejects.toMatchObject({ status: 409, code: "QUOTE_EXPIRED" });
    const live = world();
    const liveQuote = await live.quote();
    await live.repository.withTransaction(async (client) => {
      for (const event of activeSubscriptionEvents(live.ownerRef, clock.now)) await live.repository.appendSubscriptionEvent(client, event);
    });
    await expect(live.start(liveQuote)).rejects.toMatchObject({ status: 409, code: "ALREADY_SUBSCRIBED" });
    expect([...w.payments.starts, ...live.payments.starts]).toHaveLength(0);
  });

  it("answers 503 for a start that never reached NETOPIA, writes FAILED with its code, and emails the owner for our own setup", async () => {
    for (const [failure, code, alert] of [
      [paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "ECONNREFUSED"), "PAYMENT_PROVIDER_UNAVAILABLE", null],
      [paymentError("PAYMENT_CREDENTIALS_REFUSED", "401"), "PAYMENT_CREDENTIALS_REFUSED", "CHARGE_CREDENTIALS_REFUSED"],
      // Ruling PR-11 (b): a 56 on a hosted start is our charge id reused, a configuration refusal.
      [paymentError("PAYMENT_CONFIGURATION_REFUSED", "56"), "PAYMENT_CONFIGURATION_REFUSED", "CHARGE_CONFIGURATION_REFUSED"]
    ] as const) {
      const w = world();
      w.payments.startFailure = failure;
      await expect(w.start(await w.quote()), code).rejects.toMatchObject({ status: 503, code: "PAYMENT_PROVIDER_UNAVAILABLE" });
      const [charge] = await w.repository.chargesForSubscription((await w.repository.subscriptionForOwner(w.ownerRef))!.subscriptionId);
      expect(await trail(charge!.chargeId), code).toEqual(["REQUESTED", `FAILED:${code}`]);
      expect(await w.repository.withTransaction((client) => w.repository.hostedPaymentForCharge(client, charge!.chargeId))).toBeNull();
      if (alert !== null) expect(await ownerAlerts(alert, charge!.chargeId), code).toBe(1);
      if (code === "PAYMENT_CREDENTIALS_REFUSED") {
        expect(w.audit.events).toContainEqual({ event: "billing.payment.credentials_refused", fields: { operation: "checkout" } });
      }
      // The next checkout abandons the failed one at once and starts anew.
      const again = await w.start(await w.quote());
      expect(again.chargeId).not.toBe(charge!.chargeId);
      expect((await w.repository.subscriptionEvents(charge!.subscriptionId)).at(-1))
        .toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED", reason: "NEW_CHECKOUT" } });
    }
  });

  it("leaves an unknown start without a payment URL (SUBMIT_UNKNOWN), answers 503, and abandons it at the next checkout", async () => {
    const w = world();
    w.payments.startFailure = paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout");
    await expect(w.start(await w.quote())).rejects.toMatchObject({ status: 503, code: "PAYMENT_PROVIDER_UNAVAILABLE" });
    const first = (await w.repository.chargesForSubscription((await w.repository.subscriptionForOwner(w.ownerRef))!.subscriptionId))[0]!;
    expect(await trail(first.chargeId)).toEqual(["REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN"]);
    const again = await w.start(await w.quote());
    expect(again.chargeId).not.toBe(first.chargeId);
    // Nothing was read for the unknown start: nobody holds its page.
    expect(w.payments.reads).toHaveLength(0);
  });
});

describe("N18 one open checkout at a time (spec §2.6.3)", () => {
  it("gives the same page again for an untouched payment of the same purchase within 30 minutes, with no second start", async () => {
    const w = world();
    const first = await w.start(await w.quote());
    advance(5 * MINUTE);
    const again = await w.start(await w.quote());
    expect(again).toEqual({ ...first, reused: true });
    expect(w.payments.starts).toHaveLength(1);
    expect(w.payments.reads).toEqual([{ orderId: first.chargeId, providerPaymentId: ntpOf(first.chargeId) }]);
    expect((await database.pool.query("SELECT outcome FROM billing.status_read WHERE charge_id = $1", [first.chargeId])).rows)
      .toEqual([{ outcome: "PENDING" }]);
    const accepted = await database.pool.query("SELECT kind FROM legal.acceptance WHERE owner_ref = $1", [w.ownerRef]);
    expect(accepted.rowCount).toBe(4);
  });

  it("answers CHECKOUT_PENDING naming the charge while it is paid or almost, or while NETOPIA cannot say", async () => {
    for (const outcome of ["PAID", "PENDING_6", "READ_FAILED"] as const) {
      const w = world();
      const first = await w.start(await w.quote());
      w.payments.scriptStatus(first.chargeId, outcome === "PAID" ? report(first.chargeId, "PAID")
        : outcome === "PENDING_6" ? report(first.chargeId, "PENDING", "6")
          : paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "503"));
      await expect(w.start(await w.quote()), outcome).rejects.toMatchObject({ status: 409, code: "CHECKOUT_PENDING", chargeRef: first.chargeId });
      expect(w.payments.starts, outcome).toHaveLength(1);
    }
    // A charge our rows already call paid needs no read.
    const paid = world();
    const first = await paid.start(await paid.quote());
    await paid.repository.withTransaction((client) => paid.repository.appendChargeEvent(client, chargeEvent(first.chargeId, "SUCCEEDED", clock.now, {
      providerPaymentId: ntpOf(first.chargeId), amountMicros: 24_200_000, errorCode: null
    })));
    await expect(paid.start(await paid.quote())).rejects.toMatchObject({ status: 409, code: "CHECKOUT_PENDING" });
    expect(paid.payments.reads).toHaveLength(0);
  });

  it("makes one charge and one start for two checkouts at once; the other waits on that charge or gets its page", async () => {
    const w = world();
    const [a, b] = await Promise.allSettled([w.start(await w.quote()), w.start(await w.quote())]);
    expect(w.payments.starts).toHaveLength(1);
    const subscription = await w.repository.subscriptionForOwner(w.ownerRef);
    const charges = await w.repository.chargesForSubscription(subscription!.subscriptionId);
    expect(charges).toHaveLength(1);
    const outcomes = [a, b].map((settled) => settled.status === "fulfilled"
      ? settled.value.chargeId : (settled.reason as { code: string; chargeRef?: string }).chargeRef);
    expect(outcomes).toEqual([charges[0]!.chargeId, charges[0]!.chargeId]);
    for (const settled of [a, b]) {
      if (settled.status === "rejected") expect(settled.reason).toMatchObject({ status: 409, code: "CHECKOUT_PENDING" });
    }
  });
});

describe("N18 the waiting screen's charge (spec §2.6.5)", () => {
  const reader = (w: ReturnType<typeof world>, at: () => Date) => new ChargeStatusReader({ repository: w.repository, jobs: w.jobs, clock: at });
  const verifyJob = async (chargeId: string) => (await database.pool.query<{ not_before: Date }>(
    "SELECT not_before FROM billing.outbox WHERE kind = 'VERIFY_PAYMENT' AND ref = $1 AND done_at IS NULL AND dead_at IS NULL", [chargeId]
  )).rows[0] ?? null;

  it("answers the charge's kind, and asks for a check once it has waited past waitingCheckAfterMs since SUBMITTED", async () => {
    const w = world();
    const started = await w.start(await w.quote());
    const soon = new Date(START.getTime() + waitingCheckAfterMs() - 1_000);
    expect(await reader(w, () => soon).read(started.chargeId, w.ownerRef)).toEqual({ state: "PENDING", reasonCode: null, kind: "INITIAL" });
    expect(await verifyJob(started.chargeId)).toBeNull();
    const later = new Date(START.getTime() + waitingCheckAfterMs() + 1_000);
    await reader(w, () => later).read(started.chargeId, w.ownerRef);
    expect((await verifyJob(started.chargeId))!.not_before.getTime()).toBeLessThanOrEqual(later.getTime());
    expect(await reader(w, () => later).read(started.chargeId, `other-${w.ownerRef}`)).toBeNull();
  });

  it("brings a check queued for later forward to now, and leaves it alone right after a status read", async () => {
    const w = world();
    const started = await w.start(await w.quote());
    await w.repository.withTransaction((client) => w.repository.enqueue(client, {
      kind: "VERIFY_PAYMENT", ref: started.chargeId, notBefore: new Date(START.getTime() + 60 * MINUTE), payload: { charge_id: started.chargeId }
    }));
    const later = new Date(START.getTime() + waitingCheckAfterMs() + 1_000);
    await reader(w, () => later).read(started.chargeId, w.ownerRef);
    expect((await verifyJob(started.chargeId))!.not_before.getTime()).toBeLessThanOrEqual(later.getTime());

    const fresh = world();
    const other = await fresh.start(await fresh.quote());
    const at = new Date(START.getTime() + waitingCheckAfterMs() + 1_000);
    await fresh.repository.withTransaction((client) => fresh.repository.insertStatusRead(client, {
      chargeId: other.chargeId, at: new Date(at.getTime() - 5_000), outcome: "PENDING"
    }));
    await reader(fresh, () => at).read(other.chargeId, fresh.ownerRef);
    expect(await verifyJob(other.chargeId)).toBeNull();
  });
});
