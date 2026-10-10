import { createHash, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import Fastify, { type FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository } from "@debateai/db";
import { computeWindows, foldSubscription, microsToDecimal, type PriceCurrency, type SecretToken } from "@debateai/billing-core";
import { hashToken } from "@debateai/crypto";
import { TypedDomainError } from "@debateai/kernel";
import { planById, planNetPrice, type PlanId } from "@debateai/register";
import type { BillingAudit, BillingAuditEvent, BillingAuditField } from "../../apps/api/src/billing/audit.js";
import type { BillingAdmissionScope } from "../../apps/api/src/billing/index.js";
import type { ConsentKind } from "../../apps/api/src/billing/checkout.js";
import { englishOrderText } from "../../apps/api/src/billing/order-text.js";
import { runBillingRefundDoneCli, type RefundDoneArguments } from "../../apps/api/src/billing/refund-done-cli.js";
import { sealBillingProfile, sealCardToken, sealQuoteLocation } from "../../apps/api/src/billing/records.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { chargeEvent, subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { installSubscriptionRoutes } from "../../apps/api/src/billing/subscription-routes.js";
import type { SubscriptionRouteDeps } from "../../apps/api/src/billing/subscription-deps.js";
import { AdjustableTaxEngine, StubGeo, testBillingPlans, testBillingPolicy, testCountryPolicy } from "./billingFixtures.js";
import type { TestHttpIdentity } from "./httpSession.js";
import { StubCardPayments } from "./stub-card-payments.js";

/** A generated records key: tests never hold a real one. */
export const TEST_RECORDS_KEY = Buffer.alloc(32, 7);
/** Stands for PUBLIC_APP_URL (R-7) in every billing link a test reads. */
export const TEST_PUBLIC_APP_URL = "https://dezbatere.test";

const TEST_AGREEMENT_SHA256 = createHash("sha256").update("renewal agreement (test)", "utf8").digest("hex");
/** 0080's `acceptance_document_version_shape`: a consent sentence's version is `sha256-` + its hash's first 12 hex. */
const TEST_AGREEMENT = Object.freeze({ version: `sha256-${TEST_AGREEMENT_SHA256.slice(0, 12)}`, sha256: TEST_AGREEMENT_SHA256 });

/** N12/N13: the card-saving agreement a test page shows in `locale` (spec §2.18); null where none is published. */
export function testAgreement(locale: string): Readonly<{ version: string; sha256: string }> | null {
  return locale === "en" ? TEST_AGREEMENT : null;
}

export type RecordingAudit = BillingAudit & {
  readonly events: Array<Readonly<{ event: BillingAuditEvent; fields: Readonly<Record<string, BillingAuditField>> }>>;
};

export function recordingAudit(): RecordingAudit {
  const events: RecordingAudit["events"] = [];
  return Object.assign((event: BillingAuditEvent, fields: Readonly<Record<string, BillingAuditField>>) => {
    events.push(Object.freeze({ event, fields }));
  }, { events });
}

/** Payment numbers are digits only (0086's CHECK); a fresh one on every seed. */
const digits = (base: number, span: number): string => String(base + Math.floor(Math.random() * span));

export type SeededNetopiaSubscription = Readonly<{
  ownerRef: string; subscriptionId: string; customerId: string;
  initialQuoteId: string; initialChargeId: string;
  /** NETOPIA's ntpID of the first payment. */
  providerPaymentId: string;
  /** The saved card ACTIVATED adopted: a sealed made-up token, its source the INITIAL charge, expiring in December three years on. */
  cardTokenId: string;
  periodStart: Date; periodEnd: Date; totalMicros: number;
  /** NETOPIA's sandbox unless a test asks for "live" (a plan of the other environment, spec §2.5.4). */
  paymentEnvironment: "sandbox" | "live";
  /** Spec 2026-10-05 §2.16.3: the subscription's currency (CREATED's), "USD" unless a test names another. */
  currency: PriceCurrency;
}>;

/** A SecretToken over a made-up value (tests never hold a real token): it prints `[token]` everywhere. */
export function testCardToken(plaintext: string): SecretToken {
  const token = {
    reveal: (): string => plaintext,
    fingerprint: createHash("sha256").update(plaintext, "utf8").digest("hex").slice(0, 16),
    toString: (): string => "[token]",
    toJSON: (): string => "[token]",
    [Symbol.for("nodejs.util.inspect.custom")]: (): string => "[token]"
  };
  return token;
}

/**
 * One ACTIVE NETOPIA subscription as the flows leave it (skeleton §2.5): customer, sealed profile with the payer's fields, SUBSCRIBE quote with its sealed location (ip
 * 192.0.2.10), INITIAL charge in NETOPIA's sandbox, or in the environment a test names (REQUESTED, SUCCEEDED with an
 * ntpID), that spent the quote, the card that payment saved, CREATED naming `payment_provider`/`payment_environment`,
 * ACTIVATED adopting the card, SUBSCRIBED entitlement paid through the period end.
 */
export async function seedNetopiaSubscription(pool: Pool, input: Readonly<{
  ownerRef: string; planId: Exclude<PlanId, "FREE">; activatedAt: Date; taxCountry: string;
  taxRateBasisPoints?: number; email?: string; netMicros?: number;
  /** N24b: the plan's NETOPIA environment; "sandbox" unless a test seeds a plan of the other one. */
  paymentEnvironment?: "sandbox" | "live";
  /**
   * Part C (spec 2026-10-05 §2.16.3): the subscription's currency, "USD" unless a test names another. The fixture stands
   * for a checkout already made, so its quote, its INITIAL charge and its CREATED all carry it.
   */
  currency?: PriceCurrency;
}>): Promise<SeededNetopiaSubscription> {
  const billing = new BillingRepository(pool);
  const entitlements = new EntitlementRepository(pool);
  const environment = input.paymentEnvironment ?? "sandbox";
  const rate = input.taxRateBasisPoints ?? 2_100;
  const currency = input.currency ?? "USD";
  const netMicros = input.netMicros ?? planNetPrice(planById(testBillingPlans, input.planId), currency);
  const taxMicros = Math.floor(netMicros * rate / 10_000 / 10_000) * 10_000;
  const totalMicros = netMicros + taxMicros;
  const subscriptionId = randomUUID();
  const initialQuoteId = randomUUID();
  const initialChargeId = randomUUID().replaceAll("-", "");
  const providerPaymentId = digits(1_000_000, 8_000_000);
  const cardTokenId = randomUUID();
  const periodStart = input.activatedAt;
  const periodEnd = computeWindows(periodStart, periodStart).month.end;
  const checkoutAt = new Date(periodStart.getTime() - 60_000);
  const payer = { firstName: "Test", lastName: "Subscriber", phone: "+40712345678" } as const;
  const location = sealQuoteLocation(TEST_RECORDS_KEY, initialQuoteId, {
    name: "Test Subscriber", ...payer, country: input.taxCountry, region: null, postalCode: "010101", city: "Bucuresti",
    street: "Strada Exemplu 1", ip: "192.0.2.10", ipCountry: input.taxCountry, company: null
  });
  const customerId = await billing.withTransaction(async (client) => {
    const customer = await billing.ensureCustomer(client, { ownerRef: input.ownerRef, locale: "en", now: checkoutAt });
    const profile = sealBillingProfile(TEST_RECORDS_KEY, customer.customerId, {
      email: input.email ?? `${input.ownerRef}@example.test`, locale: "en", name: "Test Subscriber", ...payer,
      paymentIp: "192.0.2.10", country: input.taxCountry, region: null, postalCode: "010101", city: "Bucuresti",
      street: "Strada Exemplu 1", company: null
    });
    await billing.appendProfile(client, {
      customerId: customer.customerId, at: checkoutAt, locale: "en", profileCiphertext: profile.ciphertext, keyId: profile.keyId
    });
    await billing.insertQuote(client, {
      quoteId: initialQuoteId, ownerRef: input.ownerRef, planId: input.planId, kind: "SUBSCRIBE",
      netMicros, taxMicros, totalMicros, taxCountry: input.taxCountry, taxRegion: null,
      taxRateBasisPoints: rate, taxStatus: "TAXABLE", taxName: "VAT", quadernoRef: null,
      createdAt: new Date(periodStart.getTime() - 120_000), expiresAt: new Date(periodStart.getTime() + 1_800_000),
      locationCiphertext: location.ciphertext, keyId: location.keyId, recurringTotalMicros: null, currency
    });
    await billing.insertCharge(client, {
      chargeId: initialChargeId, ownerRef: input.ownerRef, subscriptionId, kind: "INITIAL", attempt: 1,
      periodStart, periodEnd, quoteId: initialQuoteId, netMicros, taxMicros, totalMicros, currency,
      createdAt: checkoutAt, paymentProvider: "netopia", paymentEnvironment: environment
    });
    await billing.useQuote(client, { quoteId: initialQuoteId, usedAt: checkoutAt, chargeId: initialChargeId });
    await billing.appendChargeEvent(client, chargeEvent(initialChargeId, "REQUESTED", checkoutAt, {
      providerPaymentId: null, amountMicros: totalMicros, errorCode: null
    }));
    await billing.appendChargeEvent(client, chargeEvent(initialChargeId, "SUCCEEDED", periodStart, {
      providerPaymentId, amountMicros: totalMicros, errorCode: null, providerCreatedAt: periodStart
    }));
    const sealedCard = sealCardToken(TEST_RECORDS_KEY, cardTokenId, testCardToken(["test", "card", cardTokenId.slice(0, 8)].join("-")));
    await billing.insertCardToken(client, {
      tokenId: cardTokenId, customerId: customer.customerId, paymentProvider: "netopia", paymentEnvironment: environment,
      sourceChargeId: initialChargeId, sourceToolOrder: null, sourceNoticeId: null, sourcePaidAt: periodStart,
      tokenCiphertext: sealedCard.ciphertext, keyId: sealedCard.keyId, expMonth: 12,
      expYear: periodStart.getUTCFullYear() + 3, last4: "1111", cardCountry: input.taxCountry, createdAt: periodStart
    });
    const base = { subscriptionId, ownerRef: input.ownerRef, planId: input.planId } as const;
    await billing.appendSubscriptionEvent(client, {
      ...base, eventId: randomUUID(), kind: "CREATED", at: checkoutAt, periodAnchorAt: null, cardTokenId: null,
      // 0111 `subscription_event_created_names_payment_system`: a NETOPIA CREATED names both keys (spec §2.5.1).
      data: {
        country_confirmed: false, ip_country: input.taxCountry, quote_id: initialQuoteId,
        payment_provider: "netopia", payment_environment: environment, currency
      }
    });
    await billing.appendSubscriptionEvent(client, {
      ...base, eventId: randomUUID(), kind: "ACTIVATED", at: periodStart, periodAnchorAt: periodStart, cardTokenId,
      data: { charge_id: initialChargeId, announced_total_micros: totalMicros, recurring_net_micros: netMicros, reactivated: false }
    });
    await entitlements.append(client, {
      ownerRef: input.ownerRef, planId: input.planId, periodAnchorAt: periodStart, cause: "SUBSCRIBED",
      effectiveAt: periodStart, subscriptionId, paidThrough: periodEnd, monthCreditOverrideMicros: null
    });
    return customer.customerId;
  });
  return Object.freeze({
    ownerRef: input.ownerRef, subscriptionId, customerId, initialQuoteId, initialChargeId, providerPaymentId, cardTokenId,
    periodStart, periodEnd, totalMicros, paymentEnvironment: environment, currency
  });
}

/**
 * What VERIFY_PAYMENT (P9c, A9; N15 on NETOPIA) leaves after the first payment of `seeded` is charged back: CHARGEBACK
 * on the charge, SUSPENDED, and a FREE entitlement effective `at` (paid features paused while the dispute is open).
 */
export async function suspendForChargeback(pool: Pool, seeded: SeededNetopiaSubscription, at: Date = new Date()): Promise<void> {
  const billing = new BillingRepository(pool);
  await billing.withTransaction(async (client) => {
    await billing.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "CHARGEBACK", at, {
      providerPaymentId: seeded.providerPaymentId, amountMicros: seeded.totalMicros, errorCode: null
    }));
    const state = foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId, client));
    await billing.appendSubscriptionEvent(client, subscriptionEvent(state, "SUSPENDED", at, { charge_id: seeded.initialChargeId }));
    await new EntitlementRepository(pool).append(client, {
      ownerRef: seeded.ownerRef, planId: "FREE", periodAnchorAt: at, cause: "SUSPENDED_CHARGEBACK",
      effectiveAt: at, subscriptionId: seeded.subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
    });
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

/**
 * A paid UPGRADE on a seeded NETOPIA subscription, as N12's hosted upgrade and the UPGRADE settlement leave it (quote,
 * charge in the plan's environment with REQUESTED, SUBMITTED and SUCCEEDED naming `providerPaymentId`, UPGRADED,
 * entitlement).
 */
export async function seedPaidUpgrade(pool: Pool, seeded: SeededNetopiaSubscription, input: Readonly<{
  at: Date; netMicros: number; taxMicros: number; providerPaymentId: string; monthCreditOverrideMicros: number;
  /** The plan upgraded to (PRO by default); its full price, with Romania's 21 %, is the next renewal's. */
  planId?: "PRO" | "MAX";
}>): Promise<Readonly<{ chargeId: string; quoteId: string }>> {
  const planId = input.planId ?? "PRO";
  const recurringNetMicros = planNetPrice(planById(testBillingPlans, planId), seeded.currency);
  const recurringTotalMicros = recurringNetMicros + Math.floor(recurringNetMicros * 2_100 / 10_000 / 10_000) * 10_000;
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
      quoteId, ownerRef: seeded.ownerRef, planId, kind: "UPGRADE", netMicros: input.netMicros,
      taxMicros: input.taxMicros, totalMicros, taxCountry: "RO", taxRegion: null, taxRateBasisPoints: 2_100,
      taxStatus: "TAXABLE", taxName: "VAT", quadernoRef: null, createdAt: quotedAt,
      expiresAt: new Date(quotedAt.getTime() + 1_800_000), locationCiphertext: location.ciphertext, keyId: location.keyId,
      recurringTotalMicros, currency: seeded.currency
    });
    // As upgrade.ts writes it: the UPGRADE charge covers its quote's creation to the period end (W6's coverage).
    await billing.insertCharge(client, {
      chargeId, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "UPGRADE", attempt: 1,
      periodStart: quotedAt, periodEnd: seeded.periodEnd, quoteId, netMicros: input.netMicros,
      taxMicros: input.taxMicros, totalMicros, currency: seeded.currency, createdAt: new Date(input.at.getTime() - 30_000),
      paymentProvider: "netopia", paymentEnvironment: seeded.paymentEnvironment
    });
    await billing.useQuote(client, { quoteId, usedAt: new Date(input.at.getTime() - 30_000), chargeId });
    for (const [kind, providerPaymentId] of [["REQUESTED", null], ["SUBMITTED", input.providerPaymentId], ["SUCCEEDED", input.providerPaymentId]] as const) {
      await billing.appendChargeEvent(client, chargeEvent(chargeId, kind, input.at, {
        providerPaymentId, amountMicros: totalMicros, errorCode: null,
        ...(kind === "SUCCEEDED" ? { providerCreatedAt: input.at } : {})
      }));
    }
    const state = foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId));
    await billing.appendSubscriptionEvent(client, subscriptionEvent(state, "UPGRADED", input.at,
      { announced_total_micros: recurringTotalMicros, quote_ref: quoteId, recurring_net_micros: recurringNetMicros }, { planId }));
    await new EntitlementRepository(pool).append(client, {
      ownerRef: seeded.ownerRef, planId, periodAnchorAt: seeded.periodStart, cause: "UPGRADED",
      effectiveAt: input.at, subscriptionId: seeded.subscriptionId, paidThrough: seeded.periodEnd,
      monthCreditOverrideMicros: input.monthCreditOverrideMicros
    });
  });
  return Object.freeze({ chargeId, quoteId });
}

/** A NETOPIA read none of these deps should make: a test that needs one passes its own fake. */
const unconfigured = async (): Promise<never> => {
  throw new TypedDomainError("PAYMENT_PROVIDER_UNAVAILABLE", "no fake configured");
};
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
    payments: new StubCardPayments(),
    paymentEnvironment: "sandbox",
    acceptances: new AcceptanceRepository(pool),
    consentDocuments: (kind: ConsentKind, locale: string) => kind === "CONSENT_RENEWAL" ? testAgreement(locale) : null,
    orderText: englishOrderText,
    countryPolicy: testCountryPolicy,
    geo: new StubGeo(),
    kick: () => undefined,
    ownerSpend: { readOwnerSpentMicros: async () => 0 },
    accountEmail: { read: async () => "p12@example.test" },
    refunds: new RefundDesk({
      repository: billing, jobs, policy: testBillingPolicy, audit, clock: () => new Date(),
      netopia: { payments: { status: unconfigured }, paymentEnvironment: "sandbox", jobs }
    }),
    cancelLinks: { request: async () => "SILENT" as const, cancelByToken: async () => "INVALID" as const },
    ...overrides
  });
}

/**
 * N24b: the API's RefundDesk in NETOPIA's owner mode (spec §2.12.2: no refund call is configured), over the real tables
 * (its lease, the job stage and the owner lock on the same pool). A PAYMENT_REFUND job it handles moves no money: it
 * ends DONE at the stage OWNER_REFUND_DUE with O2_REFUND_DUE queued to the owner. It never reads NETOPIA.
 */
export function netopiaRefundDesk(pool: Pool, input: Readonly<{
  audit?: BillingAudit; clock?: () => Date; paymentEnvironment?: "sandbox" | "live";
}> = {}): RefundDesk {
  const repository = new BillingRepository(pool);
  const jobs = new BillingJobQueries(pool);
  const unread = async (): Promise<never> => {
    throw new TypedDomainError("PAYMENT_PROVIDER_UNAVAILABLE", "the owner mode never reads NETOPIA in these tests");
  };
  return new RefundDesk({
    repository, jobs, policy: testBillingPolicy, audit: input.audit ?? recordingAudit(),
    clock: input.clock ?? (() => new Date()),
    netopia: { payments: { status: unread }, paymentEnvironment: input.paymentEnvironment ?? "sandbox", jobs }
  });
}

/**
 * N24b: the owner's `pnpm billing:refund-done --charge <charge> --amount <amount> --confirm` (spec §2.12.2 item 4), run
 * through the command's own parser and printer over `desk`, as its entry block wires it (`refund-done-cli.ts`): what
 * the owner records after refunding that amount in NETOPIA's admin. Its output; a refusal throws its code.
 */
export async function ownerRefundDone(desk: RefundDesk, chargeId: string, amountMicros: number, at: Date = new Date()): Promise<string> {
  const output: string[] = [];
  const sink = { stdout: (text: string) => { output.push(text); }, stderr: (text: string) => { output.push(text); } };
  const code = await runBillingRefundDoneCli(
    ["--charge", chargeId, "--amount", microsToDecimal(amountMicros), "--confirm"], sink, async () => {
      const plan = (input: RefundDoneArguments) => desk.planOwnerRefund(input.chargeRef, input.amountMicros, {
        despiteChargeback: input.despiteChargeback
      });
      return Object.freeze({
        plan, record: async (input: RefundDoneArguments) => desk.recordOwnerRefund(await plan(input), at), close: async () => undefined
      });
    }
  );
  if (code !== 0) throw new Error(`OWNER_REFUND_DONE_${String(code)}:${output.join("").trim()}`);
  return output.join("");
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

/**
 * P2-M12: holds `ownerRef`'s billing owner lock (P8c's `lockOwner`) on a connection of its own until `release`, so a
 * test can start a writer, see it wait for the lock (`waiter`: an advisory lock not granted, polled for up to 5 s),
 * move its clock meanwhile, and only then let it in.
 */
export async function holdOwnerLock(pool: Pool, ownerRef: string): Promise<Readonly<{
  waiter(): Promise<void>; release(): Promise<void>;
}>> {
  const holder = await pool.connect();
  await holder.query("BEGIN");
  await new BillingJobQueries(pool).lockOwner(holder, ownerRef);
  return Object.freeze({
    async waiter() {
      for (let tries = 0; tries < 100; tries += 1) {
        const waiting = await pool.query<{ n: number }>(
          "SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND NOT granted"
        );
        if ((waiting.rows[0]?.n ?? 0) > 0) return;
        await delay(50);
      }
      throw new Error("no writer waited for the owner lock within 5 s");
    },
    async release() {
      try {
        await holder.query("COMMIT");
      } finally {
        holder.release();
      }
    }
  });
}
