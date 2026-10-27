import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type {
  CardPayments, HostedPaymentStart, HostedPaymentStarted, PaymentReport, PaymentState
} from "@debateai/billing-core";
import {
  AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type OutboxJob
} from "@debateai/db";
import { CheckoutService, type CheckoutDeps, type ConsentKind } from "../../apps/api/src/billing/checkout.js";
import { createEmailJobHandler, emailJob, type BillingMail } from "../../apps/api/src/billing/email-job.js";
import { openBillingProfile, sealBillingProfile } from "../../apps/api/src/billing/records.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { QuoteService } from "../../apps/api/src/billing/quote.js";
import { createInitialSettlement } from "../../apps/api/src/billing/settlement-initial.js";
import { VerifyPaymentHandler } from "../../apps/api/src/billing/verify-payment.js";
import { consentDocument } from "../../apps/ui/scripts/legal-consent-manifest.mjs";
import {
  AdjustableTaxEngine, PROFILE_ADDRESS_ONLY, StubGeo, testBillingPlans, testBillingPolicy, testCountryPolicy
} from "../support/billingFixtures.js";
import {
  mountSubscriptionRoutes, recordingAudit, seedNetopiaSubscription, subscriptionDeps, testAgreement, TEST_PUBLIC_APP_URL,
  TEST_RECORDS_KEY
} from "../support/billingSubscriptionFixtures.js";
import { StubCardPayments } from "../support/stub-card-payments.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

// S01-C13 (R-18, R-19, R-47, D-74): a checkout stores its language on the billing profile and on the CREATED event;
// every system row sends the profile's language; M1 sends the checkout's language after a later checkout moves the
// profile; a card change or an upgrade asked in another language keeps the stored profile's language (V-15).

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const DAY = 86_400_000;
const MINUTE = 60_000;
const IP = "198.51.100.40";
const CORRECTED = { first_name: "Ana", last_name: "Pop", phone: "+40722111222", street: "Strada Noua 2", city: "Cluj-Napoca", postal_code: "400001" };
const TEXT = Object.freeze({
  CONSENT_RENEWAL: "I agree that NETOPIA Payments keeps my card and that {total} is charged to it every month until I cancel.",
  CONSENT_IMMEDIATE_START: "Start my plan now. I understand that if I withdraw within 14 days, I pay for the part already used."
});
const consents = () => ({ renewal: consentDocument(TEXT.CONSENT_RENEWAL), immediateStart: consentDocument(TEXT.CONSENT_IMMEDIATE_START) });

/** The port, scripted per order: an unscripted start opens a page; an unscripted status is "untouched" (status 1). */
class ScriptedPayments implements CardPayments {
  readonly provider = "netopia" as const;
  readonly environment = "sandbox" as const;
  private readonly statuses = new Map<string, PaymentReport>();
  scriptPaid(orderId: string, amountMicros: number, currency: PaymentReport["currency"]): void {
    this.statuses.set(orderId, Object.freeze({
      orderId, providerPaymentId: `ntp-${orderId.slice(0, 12)}`, state: "PAID" as PaymentState, providerStatus: "3",
      amountMicros, currency, cardCountry: "RO", savedCard: null, declineCode: null, declineSide: null, bankDeclined: false,
      occurredAt: null, clientId: null
    }));
  }
  async startHostedPayment(input: HostedPaymentStart): Promise<HostedPaymentStarted> {
    return Object.freeze({
      providerPaymentId: `ntp-${input.orderId.slice(0, 12)}`, redirectUrl: `https://secure-sandbox.netopia-payments.com/ui/card?p=${input.orderId.slice(0, 12)}`
    });
  }
  async chargeSavedCard(): Promise<PaymentReport> { throw new Error("NOT_IN_THIS_SUITE"); }
  async status(input: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER"> {
    return this.statuses.get(input.orderId) ?? "NO_SUCH_ORDER";
  }
}

/** A checkout in `locale`, as the API runs it: a quote, then CheckoutService.start (CREATED, the charge, the profile). */
function checkoutWorld() {
  const repository = new BillingRepository(database.pool);
  const jobs = new BillingJobQueries(database.pool);
  const payments = new ScriptedPayments();
  const audit = recordingAudit();
  const geo = new StubGeo();
  geo.country = "RO";
  const quotes = new QuoteService({
    repository, tax: new AdjustableTaxEngine(), geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    plans: testBillingPlans, recordsKey: TEST_RECORDS_KEY, audit
  });
  const deps: CheckoutDeps = {
    repository, jobs, acceptances: new AcceptanceRepository(database.pool), payments,
    accountEmail: { read: async () => "buyer@example.test" }, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    consentDocuments: (kind: ConsentKind) => consentDocument(TEXT[kind]), recordsKey: TEST_RECORDS_KEY,
    publicAppUrl: TEST_PUBLIC_APP_URL, audit, kick: () => undefined
  };
  return { repository, jobs, payments, audit, quotes, checkout: new CheckoutService(deps) };
}

async function buy(world: ReturnType<typeof checkoutWorld>, locale: string, now: Date) {
  const ownerRef = randomUUID();
  const { quote } = await world.quotes.create({
    ownerRef, ip: "198.51.100.7", planId: "PLUS", country: "RO", name: null, firstName: "Ana", lastName: "Pop",
    phone: "+40 712 345 678", street: "Strada Memorandumului 1", region: "Cluj", postalCode: "400001", city: "Cluj-Napoca",
    company: null, now
  });
  const started = await world.checkout.start({
    ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "s01-c13", quoteRef: quote.quoteId, locale,
    consents: consents(), countryConfirmed: false, now
  });
  const subscription = (await world.repository.subscriptionForOwner(ownerRef))!;
  const customer = (await world.repository.customerByOwner(ownerRef))!;
  return { ownerRef, chargeId: started.chargeId, subscriptionId: subscription.subscriptionId, customerId: customer.customerId };
}

/** The M1 settlement: NETOPIA reads the order PAID at the charge's amount, then VERIFY_PAYMENT decides it. */
async function activate(world: ReturnType<typeof checkoutWorld>, bought: Awaited<ReturnType<typeof buy>>, now: Date) {
  const charge = (await world.repository.charge(bought.chargeId))!;
  world.payments.scriptPaid(bought.chargeId, charge.totalMicros, charge.currency);
  const refunds = new RefundDesk({
    repository: world.repository, jobs: world.jobs, policy: testBillingPolicy, audit: world.audit, clock: () => now,
    netopia: { payments: { status: async () => { throw new Error("no read in this suite"); } } as never, paymentEnvironment: "sandbox", jobs: world.jobs }
  });
  const verify = new VerifyPaymentHandler({
    repository: world.repository, jobs: world.jobs, refunds, entitlements: new EntitlementRepository(database.pool),
    countryPolicy: testCountryPolicy, policy: testBillingPolicy, recordsKey: TEST_RECORDS_KEY, audit: world.audit,
    netopia: { payments: world.payments, paymentEnvironment: "sandbox", jobs: world.jobs }
  });
  verify.registerSettlement("INITIAL", createInitialSettlement({
    repository: world.repository, entitlements: new EntitlementRepository(database.pool),
    acceptances: new AcceptanceRepository(database.pool), policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL
  }));
  const job = {
    jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: bought.chargeId, payload: { charge_id: bought.chargeId }, attempts: 1,
    notBefore: now, createdAt: now, claimedBy: "test", claimedAt: now
  } as unknown as OutboxJob;
  expect(await verify.handle(job, now)).toEqual({ kind: "DONE" });
}

/** The EMAIL handler of the outbox worker, reading the profile from the database. */
function mailer(repository: BillingRepository) {
  const sent: BillingMail[] = [];
  const handler = createEmailJobHandler({
    repository, recipients: PROFILE_ADDRESS_ONLY, recordsKey: TEST_RECORDS_KEY, ownerReportEmail: "owner@example.test",
    mail: { sendTemplated: async (mail) => { sent.push(mail); } },
    attachments: new Map([
      ["ACCEPTED_TERMS", async () => null], ["WITHDRAWAL_FORM", async () => null], ["SMARTBILL_INVOICE_PDF", async () => null]
    ])
  });
  return { sent, handler };
}

/** Queues one row exactly as the writers do (repository.enqueue in a transaction), then reads it back as the worker does. */
async function queue(repository: BillingRepository, request: ReturnType<typeof emailJob>): Promise<OutboxJob> {
  await repository.withTransaction((client) => repository.enqueue(client, request));
  const row = (await database.pool.query<{ job_id: string; ref: string; payload: Record<string, unknown>; not_before: Date }>(
    "SELECT job_id, ref, payload, not_before FROM billing.outbox WHERE kind = 'EMAIL' AND ref = $1", [request.ref]
  )).rows[0]!;
  return { jobId: row.job_id, kind: "EMAIL", ref: row.ref, notBefore: row.not_before, attempts: 1, payload: row.payload } as unknown as OutboxJob;
}

describe("S01-C13 a checkout's language is the profile's and the system rows' (R-18, R-19, R-47)", () => {
  it("stores the checkout's language on the billing profile and on the CREATED event", async () => {
    const world = checkoutWorld();
    const now = new Date();
    const bought = await buy(world, "ro", now);
    const profile = (await world.repository.latestProfile(bought.customerId))!;
    expect(profile.locale).toBe("ro");
    expect(openBillingProfile(TEST_RECORDS_KEY, bought.customerId, profile.profileCiphertext)).toMatchObject({ locale: "ro" });
    const created = (await world.repository.subscriptionEvents(bought.subscriptionId)).find((event) => event.kind === "CREATED");
    expect(created?.data.locale).toBe("ro");
  });

  it("sends each of the thirteen system rows in the profile's language, the checkout's (R-18)", async () => {
    const world = checkoutWorld();
    const now = new Date();
    const bought = await buy(world, "ro", now);
    const { sent, handler } = mailer(world.repository);
    const templates = [
      "M2_INVOICE_LINK", "M2_INVOICE_ATTACHED", "M3", "M4", "M5A", "M5B", "M5C", "M6", "M10", "M10_ENDED", "M11", "M11_DUPLICATE",
      "M12"
    ] as const;
    for (const template of templates) {
      const job = await queue(world.repository, emailJob({
        template, recipient: { kind: "CUSTOMER", customerId: bought.customerId }, dedupeRef: `${bought.subscriptionId}:${template}`,
        params: {}, notBefore: now
      }));
      expect(job.payload).not.toHaveProperty("locale");
      expect(await handler(job, now)).toEqual({ kind: "DONE" });
    }
    expect(sent.map((mail) => [mail.templateId, mail.locale])).toEqual(templates.map((template) => [template, "ro"]));
  });

  it("sends M1 in the checkout's language after a later checkout moves the profile to pl (D-74, B6)", async () => {
    const world = checkoutWorld();
    const now = new Date();
    const bought = await buy(world, "ro", now);
    await activate(world, bought, now);
    // A later checkout writes the profile in pl (checkout.ts's appendProfile). It cannot run while this subscription is
    // live, so the same profile row is written here, after M1 was queued and before the worker sends it.
    const latest = (await world.repository.latestProfile(bought.customerId))!;
    const opened = openBillingProfile(TEST_RECORDS_KEY, bought.customerId, latest.profileCiphertext);
    const resealed = sealBillingProfile(TEST_RECORDS_KEY, bought.customerId, { ...opened, locale: "pl" });
    await world.repository.withTransaction((client) => world.repository.appendProfile(client, {
      customerId: bought.customerId, at: new Date(now.getTime() + 1), locale: "pl",
      profileCiphertext: resealed.ciphertext, keyId: resealed.keyId
    }));
    const m1 = await queuedM1(bought.subscriptionId);
    expect(m1.payload.locale).toBe("ro");
    const { sent, handler } = mailer(world.repository);
    expect(await handler(m1, now)).toEqual({ kind: "DONE" });
    expect(sent).toEqual([expect.objectContaining({ templateId: "M1", locale: "ro" })]);
  });
});

async function queuedM1(subscriptionId: string): Promise<OutboxJob & { payload: Record<string, unknown> }> {
  const row = (await database.pool.query<{ job_id: string; ref: string; payload: Record<string, unknown>; not_before: Date }>(
    "SELECT job_id, ref, payload, not_before FROM billing.outbox WHERE kind = 'EMAIL' AND ref = $1", [`M1:${subscriptionId}`]
  )).rows[0]!;
  return { jobId: row.job_id, kind: "EMAIL", ref: row.ref, notBefore: row.not_before, attempts: 1, payload: row.payload } as unknown as
    OutboxJob & { payload: Record<string, unknown> };
}

describe("S01-C13 a card change or an upgrade keeps the stored profile's language (R-18, V-15)", () => {
  /** A subscription seeded as a checkout made it, its profile rewritten in `ro` (the checkout's language). */
  async function seededInRo(label: string, now: Date) {
    const identity = testHttpIdentity(label);
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(now.getTime() - 3 * DAY), taxCountry: "RO"
    });
    const repository = new BillingRepository(database.pool);
    const latest = (await repository.latestProfile(seeded.customerId))!;
    const opened = openBillingProfile(TEST_RECORDS_KEY, seeded.customerId, latest.profileCiphertext);
    const resealed = sealBillingProfile(TEST_RECORDS_KEY, seeded.customerId, { ...opened, locale: "ro" });
    await repository.withTransaction((client) => repository.appendProfile(client, {
      customerId: seeded.customerId, at: new Date(now.getTime() - MINUTE), locale: "ro",
      profileCiphertext: resealed.ciphertext, keyId: resealed.keyId
    }));
    return { identity, seeded, repository };
  }

  /** The renewal agreement is the English text for every page language, so a request in pl is checked against it. */
  const agreementForAnyLocale = (kind: ConsentKind) => (kind === "CONSENT_RENEWAL" ? testAgreement("en") : null);

  it("a card change asked in pl leaves the profile in ro", async () => {
    const now = new Date();
    const { identity, seeded, repository } = await seededInRo("c13-card-pl", now);
    const deps = subscriptionDeps(database.pool, {
      payments: new StubCardPayments(), audit: recordingAudit(), geo: new StubGeo(), clock: () => now,
      accountEmail: { read: async () => "holder@example.test" }, consentDocuments: agreementForAnyLocale
    });
    const api = await mountSubscriptionRoutes(deps, identity);
    const response = await api.inject({
      method: "POST", url: "/v1/billing/subscription/card",
      headers: { "x-test-session": identity.rawSessionToken, "x-test-ip": IP },
      payload: { locale: "pl", renewal_terms: testAgreement("en"), ...CORRECTED }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect((await repository.latestProfile(seeded.customerId))!.locale).toBe("ro");
    await api.close();
  });

  it("an upgrade asked in pl leaves the profile in ro", async () => {
    const now = new Date();
    const { identity, seeded, repository } = await seededInRo("c13-upgrade-pl", now);
    const deps = subscriptionDeps(database.pool, {
      payments: new StubCardPayments(), audit: recordingAudit(), geo: new StubGeo(), clock: () => now,
      accountEmail: { read: async () => "holder@example.test" }, consentDocuments: agreementForAnyLocale
    });
    const api = await mountSubscriptionRoutes(deps, identity);
    const headers = { "x-test-session": identity.rawSessionToken, "x-test-ip": IP };
    const quoted = await api.inject({ method: "POST", url: "/v1/billing/subscription/upgrade-quote", headers, payload: { plan_id: "PRO" } });
    expect(quoted.statusCode, quoted.body).toBe(200);
    const response = await api.inject({
      method: "POST", url: "/v1/billing/subscription/upgrade", headers,
      payload: { plan_id: "PRO", quote_ref: quoted.json().quote_ref, locale: "pl", renewal_terms: testAgreement("en") }
    });
    expect(response.statusCode, response.body).toBe(200);
    expect((await repository.latestProfile(seeded.customerId))!.locale).toBe("ro");
    await api.close();
  });
});
