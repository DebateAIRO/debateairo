import { randomBytes, randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import {
  AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository, type CustomerXMoneyEnvironment
} from "@debateai/db";
import { computeWindows, foldSubscription } from "@debateai/billing-core";
import { hashToken } from "@debateai/crypto";
import { TypedDomainError } from "@debateai/kernel";
import type { XMoneyClient } from "@debateai/payments-xmoney";
import { planById, type PlanId } from "@debateai/register";
import type { BillingAudit, BillingAuditEvent, BillingAuditField } from "../../apps/api/src/billing/audit.js";
import type { BillingAdmissionScope } from "../../apps/api/src/billing/index.js";
import { CheckoutService } from "../../apps/api/src/billing/checkout.js";
import { sealBillingProfile, sealQuoteLocation } from "../../apps/api/src/billing/records.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { chargeEvent, subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { installSubscriptionRoutes } from "../../apps/api/src/billing/subscription-routes.js";
import type { SubscriptionRouteDeps } from "../../apps/api/src/billing/subscription-deps.js";
import { AdjustableTaxEngine, StubGeo, testBillingPlans, testBillingPolicy, testCountryPolicy } from "./billingFixtures.js";
import type { TestHttpIdentity } from "./httpSession.js";

/** A generated records key: tests never hold a real one. */
export const TEST_RECORDS_KEY = Buffer.alloc(32, 7);
/** Stands for PUBLIC_APP_URL (R-7) in every billing link a test reads. */
export const TEST_PUBLIC_APP_URL = "https://dezbatere.test";
/** A generated xMoney private key (A23: bytes); tests never hold a real one. */
export const TEST_XMONEY_PRIVATE_KEY = Buffer.alloc(32, 9);

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

const TEST_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,t=3,p=1$c2FsdHNhbHRzYWx0c2FsdA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/** The identity rows a real session would have, and one live WITHDRAW_SUBSCRIPTION grant on it (P12a's CHECK). */
export async function seedWithdrawalGrant(pool: Pool, identity: TestHttpIdentity, grantToken: string): Promise<void> {
  const { userId, ownerRef } = identity.authenticated;
  const sessionId = identity.authenticated.session.session_id;
  await pool.query(`
    INSERT INTO identity."user"(
      user_id,email_blind_index,email_ciphertext,recovery_email_ciphertext,phone_ciphertext,password_hash,
      pseudonym,audit_token,owner_ref,state,adult_affirmed_at,created_at
    ) VALUES ($1,$2,'{}','{}',NULL,$3,$4,$5,$6,'active',clock_timestamp(),clock_timestamp())
    ON CONFLICT (user_id) DO NOTHING
  `, [userId, randomBytes(32), TEST_PASSWORD_HASH, `p12-${randomUUID()}`, randomUUID(), ownerRef]);
  await pool.query(`
    INSERT INTO identity.session(
      session_id,user_id,token_hash,csrf_token_hash,binding_context,created_at,
      last_seen_at,idle_expires_at,absolute_expires_at,last_mfa_at,revoked_at
    ) VALUES ($1,$2,$3,$4,'{"user_agent_hash":"p12"}'::jsonb,clock_timestamp(),clock_timestamp(),
      clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours',clock_timestamp(),NULL)
    ON CONFLICT (session_id) DO NOTHING
  `, [sessionId, userId, identity.authenticated.tokenHash, identity.authenticated.csrfTokenHash]);
  await pool.query(`
    INSERT INTO identity.step_up_grant(
      step_up_grant_id,token_hash,session_id,user_id,action,target_run_id,target_account_id,issued_at,expires_at
    ) VALUES ($1,$2,$3,$4,'WITHDRAW_SUBSCRIPTION',NULL,$4,clock_timestamp()-interval '1 second',
      clock_timestamp()+interval '5 minutes')
  `, [randomUUID(), hashToken("step-up-grant", grantToken), sessionId, userId]);
}

/** A paid UPGRADE on a seeded subscription, as P12c + the UPGRADE settlement leave it (quote, charge, UPGRADED, entitlement). */
export async function seedPaidUpgrade(pool: Pool, seeded: SeededSubscription, input: Readonly<{
  at: Date; netMicros: number; taxMicros: number; transactionId: string; monthCreditOverrideMicros: number;
}>): Promise<Readonly<{ chargeId: string; quoteId: string }>> {
  const billing = new BillingRepository(pool);
  const quoteId = randomUUID();
  const chargeId = randomUUID().replaceAll("-", "");
  const totalMicros = input.netMicros + input.taxMicros;
  const quotedAt = new Date(input.at.getTime() - 60_000);
  const location = sealQuoteLocation(TEST_RECORDS_KEY, quoteId, {
    name: null, country: "RO", region: null, postalCode: null, city: null, street: null, ip: "192.0.2.10", ipCountry: "RO", company: null
  });
  await billing.withTransaction(async (client) => {
    await billing.insertQuote(client, {
      quoteId, ownerRef: seeded.ownerRef, planId: "PRO", kind: "UPGRADE", netMicros: input.netMicros,
      taxMicros: input.taxMicros, totalMicros, taxCountry: "RO", taxRegion: null, taxRateBasisPoints: 2_100,
      taxStatus: "TAXABLE", taxName: "VAT", quadernoRef: null, createdAt: quotedAt,
      expiresAt: new Date(quotedAt.getTime() + 1_800_000), locationCiphertext: location.ciphertext, keyId: location.keyId,
      recurringTotalMicros: 60_500_000
    });
    await billing.insertCharge(client, {
      chargeId, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "UPGRADE", attempt: 1,
      periodStart: seeded.periodStart, periodEnd: seeded.periodEnd, quoteId, netMicros: input.netMicros,
      taxMicros: input.taxMicros, totalMicros, currency: "USD", createdAt: new Date(input.at.getTime() - 30_000),
      xmoneyEnvironment: seeded.xmoneyEnvironment
    });
    await billing.useQuote(client, { quoteId, usedAt: new Date(input.at.getTime() - 30_000), chargeId });
    for (const [kind, transactionId] of [["REQUESTED", null], ["SUBMITTED", input.transactionId], ["SUCCEEDED", input.transactionId]] as const) {
      await billing.appendChargeEvent(client, chargeEvent(chargeId, kind, input.at, {
        xmoneyTransactionId: transactionId, amountMicros: totalMicros, errorCode: null
      }));
    }
    const state = foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId));
    await billing.appendSubscriptionEvent(client, subscriptionEvent(state, "UPGRADED", input.at,
      { announced_total_micros: 60_500_000, quote_ref: quoteId, recurring_net_micros: 50_000_000 }, { planId: "PRO" }));
    await new EntitlementRepository(pool).append(client, {
      ownerRef: seeded.ownerRef, planId: "PRO", periodAnchorAt: seeded.periodStart, cause: "UPGRADED",
      effectiveAt: input.at, subscriptionId: seeded.subscriptionId, paidThrough: seeded.periodEnd,
      monthCreditOverrideMicros: input.monthCreditOverrideMicros
    });
  });
  return Object.freeze({ chargeId, quoteId });
}

/** Every xMoney method a consumer of these deps picks, unconfigured: a test that needs one passes its own fake. */
const unconfigured = async (): Promise<never> => {
  throw new TypedDomainError("XMONEY_UNAVAILABLE", "no fake configured");
};
const UNCONFIGURED_XMONEY: Pick<XMoneyClient, "rebill" | "refund" | "getTransaction" | "listTransactions"> = Object.freeze({
  rebill: unconfigured, refund: unconfigured, getTransaction: unconfigured, listTransactions: unconfigured
});
/** The stand-in for the methods P8c's `CheckoutDeps.xmoney` picks (`listTransactions`, `getOrder`: D7 #5's look). */
const UNCONFIGURED_XMONEY_CUSTOMERS: Pick<XMoneyClient, "createCustomer" | "listTransactions" | "getOrder"> = Object.freeze({
  createCustomer: unconfigured, listTransactions: unconfigured, getOrder: unconfigured
});

/**
 * P8c's real CheckoutService over a real database, keyed with generated values. The ONE place the billing tests
 * name CheckoutDeps' members; the card change uses only its `signEmbeddedOrder` (R-17).
 */
export function cardCheckoutFor(pool: Pool): CheckoutService {
  return new CheckoutService({
    repository: new BillingRepository(pool),
    jobs: new BillingJobQueries(pool),
    acceptances: new AcceptanceRepository(pool),
    xmoney: UNCONFIGURED_XMONEY_CUSTOMERS,
    accountEmail: { read: async () => "p12@example.test" },
    geo: new StubGeo(),
    countryPolicy: testCountryPolicy,
    policy: testBillingPolicy,
    consentDocuments: () => null,
    recordsKey: TEST_RECORDS_KEY,
    xmoneyPrivateKey: TEST_XMONEY_PRIVATE_KEY,
    xmoneyPublicKey: "pk_test_p12",
    siteId: "site-p12",
    publicAppUrl: TEST_PUBLIC_APP_URL,
    xmoneyEnvironment: "stage",
    audit: recordingAudit()
  });
}

/** The routes' dependencies over a real database, with fakes for every vendor. */
export function subscriptionDeps(pool: Pool, overrides: Partial<SubscriptionRouteDeps> = {}): SubscriptionRouteDeps {
  const billing = overrides.billing ?? new BillingRepository(pool);
  const entitlements = overrides.entitlements ?? new EntitlementRepository(pool);
  const audit = overrides.audit ?? recordingAudit();
  const jobs = new BillingJobQueries(pool);
  return Object.freeze({
    billing,
    jobs,
    entitlements,
    plans: testBillingPlans,
    policy: testBillingPolicy,
    tax: new AdjustableTaxEngine(),
    recordsKey: TEST_RECORDS_KEY,
    publicAppUrl: TEST_PUBLIC_APP_URL,
    legal: { requiresReacceptance: async () => false },
    audit,
    clock: () => new Date(),
    xmoney: UNCONFIGURED_XMONEY,
    // The connectors' xMoney system in these tests, as P6a's fakes and `seedActiveSubscription`'s default.
    xmoneyEnvironment: "stage",
    countryPolicy: testCountryPolicy,
    geo: new StubGeo(),
    kick: () => undefined,
    ownerSpend: { readOwnerSpentMicros: async () => 0 },
    checkout: cardCheckoutFor(pool),
    accountEmail: { read: async () => "p12@example.test" },
    refunds: new RefundDesk({
      repository: billing, jobs, xmoney: UNCONFIGURED_XMONEY, policy: testBillingPolicy, audit, clock: () => new Date()
    }),
    cancelLinks: { request: async () => "SILENT" as const, cancelByToken: async () => "INVALID" as const },
    ...overrides
  });
}

/**
 * Only the subscription routes, on a bare Fastify, with a stand-in for the API's cookie check: the
 * `x-test-session` header names the one identity. Authorization and CSRF are s7-authorization.test.ts's job.
 * `admitted` sees what a route charges (the scope and the key); the caller's address is the `x-test-ip` header
 * (canonical, as P8a's source hands it on), `192.0.2.10` without it.
 */
export async function mountSubscriptionRoutes(
  deps: SubscriptionRouteDeps | undefined,
  identity: TestHttpIdentity | null,
  admitted: (scope: BillingAdmissionScope, key: string) => boolean = () => true
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
      gate: (reply, scope, _route, key) => {
        if (admitted(scope, key)) return true;
        void reply.status(429).send({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
        return false;
      }
    },
    (request) => {
      const ip = request.headers["x-test-ip"];
      return Object.freeze({ ip: typeof ip === "string" ? ip : "192.0.2.10", userAgent: "p12-test" });
    }
  );
  await api.ready();
  return api;
}
