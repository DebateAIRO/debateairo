import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { BillingJobQueries, BillingRepository, EntitlementRepository, type CustomerXMoneyEnvironment } from "@debateai/db";
import { computeWindows } from "@debateai/billing-core";
import { TypedDomainError } from "@debateai/kernel";
import { planById, type PlanId } from "@debateai/register";
import type { BillingAudit, BillingAuditEvent, BillingAuditField } from "../../apps/api/src/billing/audit.js";
import { sealBillingProfile, sealQuoteLocation } from "../../apps/api/src/billing/records.js";
import { chargeEvent } from "../../apps/api/src/billing/rows.js";
import { installSubscriptionRoutes } from "../../apps/api/src/billing/subscription-routes.js";
import type { SubscriptionRouteDeps } from "../../apps/api/src/billing/subscription-deps.js";
import { AdjustableTaxEngine, StubGeo, testBillingPlans, testBillingPolicy, testCountryPolicy } from "./billingFixtures.js";
import type { TestHttpIdentity } from "./httpSession.js";

/** A generated records key: tests never hold a real one. */
export const TEST_RECORDS_KEY = Buffer.alloc(32, 7);
/** Stands for PUBLIC_APP_URL (R-7) in every billing link a test reads. */
export const TEST_PUBLIC_APP_URL = "https://dezbatere.test";

export type RecordingAudit = BillingAudit & {
  readonly events: Array<Readonly<{ event: BillingAuditEvent; fields: Readonly<Record<string, BillingAuditField>> }>>;
};

export function recordingAudit(): RecordingAudit {
  const events: RecordingAudit["events"] = [];
  return Object.assign((event: BillingAuditEvent, fields: Readonly<Record<string, BillingAuditField>>) => {
    events.push(Object.freeze({ event, fields }));
  }, { events });
}

export type SeededSubscription = Readonly<{
  ownerRef: string; subscriptionId: string; customerId: string;
  initialQuoteId: string; initialChargeId: string; initialTransactionId: string;
  xmoneyOrderId: string; xmoneyCustomerId: string; cardRef: string;
  periodStart: Date; periodEnd: Date; totalMicros: number;
  /** The xMoney system the subscription was created in (D5 5h); "stage" unless a test asks for "live". */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
}>;

/** xMoney ids and card refs are digits only (0085/0086 CHECKs). */
const digits = (base: number, span: number): string => String(base + Math.floor(Math.random() * span));

/**
 * One ACTIVE subscription as checkout (P8c) and VERIFY_PAYMENT (P9b) leave it: customer with its xMoney link, sealed
 * profile, SUBSCRIBE quote with its sealed location, INITIAL charge (REQUESTED, SUCCEEDED) that spent the quote,
 * CREATED + ACTIVATED (with the subscriber's own `recurring_net_micros`, Terms §12), SUBSCRIBED entitlement paid
 * through the period end. `netMicros` is the price the person bought at (default: the register's price today), so a
 * test can show the register's later price never reaches an existing subscriber.
 */
export async function seedActiveSubscription(pool: Pool, input: Readonly<{
  ownerRef: string; planId: Exclude<PlanId, "FREE">; activatedAt: Date; taxCountry: string;
  taxRateBasisPoints?: number; email?: string; xmoneyEnvironment?: CustomerXMoneyEnvironment; netMicros?: number;
}>): Promise<SeededSubscription> {
  const billing = new BillingRepository(pool);
  const entitlements = new EntitlementRepository(pool);
  const environment = input.xmoneyEnvironment ?? "stage";
  const rate = input.taxRateBasisPoints ?? 2_100;
  const netMicros = input.netMicros ?? planById(testBillingPlans, input.planId).netPriceMicros;
  const taxMicros = Math.floor(netMicros * rate / 10_000 / 10_000) * 10_000;
  const totalMicros = netMicros + taxMicros;
  const subscriptionId = randomUUID();
  const initialQuoteId = randomUUID();
  const initialChargeId = randomUUID().replaceAll("-", "");
  const initialTransactionId = digits(100_000_000, 800_000_000);
  const xmoneyOrderId = digits(900_000_000, 90_000_000);
  const xmoneyCustomerId = digits(50_000_000, 40_000_000);
  const cardRef = digits(4_000_000, 900_000);
  const periodStart = input.activatedAt;
  const periodEnd = computeWindows(periodStart, periodStart).month.end;
  const checkoutAt = new Date(periodStart.getTime() - 60_000);
  const location = sealQuoteLocation(TEST_RECORDS_KEY, initialQuoteId, {
    name: null, country: input.taxCountry, region: null, postalCode: null, city: null, street: null,
    ip: "192.0.2.10", ipCountry: input.taxCountry, company: null
  });
  const customerId = await billing.withTransaction(async (client) => {
    // R-14: the xMoney customer is linked in one environment; the tests use stage, as P6a's fakes do.
    const customer = await billing.ensureCustomer(client, {
      ownerRef: input.ownerRef, locale: "en", now: checkoutAt, environment
    });
    await billing.setXMoneyCustomerId(client, customer.customerId, xmoneyCustomerId, environment);
    const profile = sealBillingProfile(TEST_RECORDS_KEY, customer.customerId, {
      email: input.email ?? `${input.ownerRef}@example.test`, locale: "en", name: null, country: input.taxCountry,
      region: null, postalCode: null, city: null, street: null, company: null
    });
    await billing.appendProfile(client, {
      customerId: customer.customerId, at: checkoutAt, locale: "en",
      profileCiphertext: profile.ciphertext, keyId: profile.keyId
    });
    await billing.insertQuote(client, {
      quoteId: initialQuoteId, ownerRef: input.ownerRef, planId: input.planId, kind: "SUBSCRIBE",
      netMicros, taxMicros, totalMicros, taxCountry: input.taxCountry, taxRegion: null,
      taxRateBasisPoints: rate, taxStatus: "TAXABLE", taxName: "VAT", quadernoRef: null,
      createdAt: new Date(periodStart.getTime() - 120_000), expiresAt: new Date(periodStart.getTime() + 1_800_000),
      locationCiphertext: location.ciphertext, keyId: location.keyId, recurringTotalMicros: null
    });
    await billing.insertCharge(client, {
      chargeId: initialChargeId, ownerRef: input.ownerRef, subscriptionId, kind: "INITIAL", attempt: 1,
      periodStart, periodEnd, quoteId: initialQuoteId, netMicros, taxMicros, totalMicros, currency: "USD",
      createdAt: checkoutAt, xmoneyEnvironment: environment
    });
    await billing.useQuote(client, { quoteId: initialQuoteId, usedAt: checkoutAt, chargeId: initialChargeId });
    await billing.appendChargeEvent(client, chargeEvent(initialChargeId, "REQUESTED", checkoutAt, {
      xmoneyTransactionId: null, amountMicros: totalMicros, errorCode: null
    }));
    await billing.appendChargeEvent(client, chargeEvent(initialChargeId, "SUCCEEDED", periodStart, {
      xmoneyTransactionId: initialTransactionId, amountMicros: totalMicros, errorCode: null
    }));
    const base = { subscriptionId, ownerRef: input.ownerRef, planId: input.planId, xmoneyCustomerId } as const;
    await billing.appendSubscriptionEvent(client, {
      ...base, eventId: randomUUID(), kind: "CREATED", at: checkoutAt,
      periodAnchorAt: null, xmoneyOrderId: null, cardRef: null,
      // 0085 `subscription_event_created_names_environment`: every CREATED names its xMoney system (D5 5h).
      data: { country_confirmed: false, ip_country: input.taxCountry, quote_id: initialQuoteId, xmoney_environment: environment }
    });
    await billing.appendSubscriptionEvent(client, {
      ...base, eventId: randomUUID(), kind: "ACTIVATED", at: periodStart, periodAnchorAt: periodStart,
      xmoneyOrderId, cardRef,
      // As P9b writes it: the SUBSCRIBE quote's net is the price this subscriber keeps (Terms §12, P11a's
      // `recurringNetOf`); a history without it is never renewed (BILLING_RECURRING_PRICE_MISSING).
      data: { charge_id: initialChargeId, announced_total_micros: totalMicros, recurring_net_micros: netMicros, reactivated: false }
    });
    await entitlements.append(client, {
      ownerRef: input.ownerRef, planId: input.planId, periodAnchorAt: periodStart, cause: "SUBSCRIBED",
      effectiveAt: periodStart, subscriptionId, paidThrough: periodEnd, monthCreditOverrideMicros: null
    });
    return customer.customerId;
  });
  return Object.freeze({
    ownerRef: input.ownerRef, subscriptionId, customerId, initialQuoteId, initialChargeId, initialTransactionId,
    xmoneyOrderId, xmoneyCustomerId, cardRef, periodStart, periodEnd, totalMicros, xmoneyEnvironment: environment
  });
}

/** The routes' dependencies over a real database, with fakes for every vendor. */
export function subscriptionDeps(pool: Pool, overrides: Partial<SubscriptionRouteDeps> = {}): SubscriptionRouteDeps {
  return Object.freeze({
    billing: new BillingRepository(pool),
    jobs: new BillingJobQueries(pool),
    entitlements: new EntitlementRepository(pool),
    plans: testBillingPlans,
    policy: testBillingPolicy,
    tax: new AdjustableTaxEngine(),
    recordsKey: TEST_RECORDS_KEY,
    publicAppUrl: TEST_PUBLIC_APP_URL,
    legal: { requiresReacceptance: async () => false },
    audit: recordingAudit(),
    clock: () => new Date(),
    xmoney: {
      rebill: async () => { throw new TypedDomainError("XMONEY_UNAVAILABLE", "no fake configured"); }
    },
    // The connectors' xMoney system in these tests, as P6a's fakes and `seedActiveSubscription`'s default.
    xmoneyEnvironment: "stage",
    countryPolicy: testCountryPolicy,
    geo: new StubGeo(),
    kick: () => undefined,
    ...overrides
  });
}

/**
 * Only the subscription routes, on a bare Fastify, with a stand-in for the API's cookie check: the
 * `x-test-session` header names the one identity. Authorization and CSRF are s7-authorization.test.ts's job.
 */
export async function mountSubscriptionRoutes(
  deps: SubscriptionRouteDeps | undefined,
  identity: TestHttpIdentity | null,
  admitted: () => boolean = () => true
): Promise<FastifyInstance> {
  const api = Fastify({ logger: false });
  api.decorateRequest("authenticatedSession");
  api.addHook("preHandler", async (request) => {
    if (identity !== null && request.headers["x-test-session"] === identity.rawSessionToken) {
      request.authenticatedSession = identity.authenticated;
    }
  });
  installSubscriptionRoutes(
    api, deps,
    () => Object.freeze({ config: Object.freeze({ auth: "user" as const }) }),
    {
      gate: (reply) => {
        if (admitted()) return true;
        void reply.status(429).send({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
        return false;
      }
    },
    () => Object.freeze({ ip: "192.0.2.10", userAgent: "p12-test" })
  );
  await api.ready();
  return api;
}
