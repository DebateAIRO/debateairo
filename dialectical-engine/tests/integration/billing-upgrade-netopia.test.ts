import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  foldSubscription, microsToDecimal, paymentError, upgradeMonthCreditOverrideMicros, upgradeProrationMicros,
  type HostedPaymentStart, type HostedPaymentStarted, type PriceCurrency
} from "@debateai/billing-core";
import { BillingUpgradePendingErrorSchema, BillingUpgradeResponseSchema } from "@debateai/contract";
import { BillingJobQueries, BillingRepository, createPool, EntitlementRepository, migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { AdjustableTaxEngine, StubGeo, testBillingPolicy, testRegionalPlans } from "../support/billingFixtures.js";
import {
  mountSubscriptionRoutes, recordingAudit, seedNetopiaSubscription, subscriptionDeps, testAgreement,
  testCardToken, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY
} from "../support/billingSubscriptionFixtures.js";
import { netopiaVerifyHandler, verifyJob } from "../support/netopia-verify.js";
import { StubCardPayments, stubPaymentReport } from "../support/stub-card-payments.js";
import { chargeStatusOf } from "../../apps/api/src/billing/charge-status.js";
import { englishOrderText } from "../../apps/api/src/billing/order-text.js";
import { RenewalService } from "../../apps/api/src/billing/renewal.js";
import { createRenewalSettlement } from "../../apps/api/src/billing/settlement-renewal.js";
import { openBillingProfile, openPaymentUrl, sealBillingProfile, sealCardToken } from "../../apps/api/src/billing/records.js";
import { subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { quoteUpgrade, startUpgrade } from "../../apps/api/src/billing/upgrade.js";

let database: TestDatabase;
let repository: BillingRepository;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  repository = new BillingRepository(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const MINUTE = 60_000;
const DAY = 86_400_000;
const EMAIL = "buyer@example.test";
const BUYER_IP = "198.51.100.23";

/** NETOPIA's port with starts that can fail on demand (spec §2.6.2 step 8), else the stub's sandbox page. */
class ScriptedStarts extends StubCardPayments {
  readonly failures: Error[] = [];
  override async startHostedPayment(input: HostedPaymentStart): Promise<HostedPaymentStarted> {
    const failure = this.failures.shift();
    if (failure !== undefined) {
      this.hosted.push(input);
      throw failure;
    }
    return super.startHostedPayment(input);
  }
}

async function start(label: string, options: Readonly<{
  paymentEnvironment?: "sandbox" | "live"; planId?: "PLUS" | "PRO";
  /** Part C (spec 2026-10-05 §2.16.3): the subscription's currency; with one, the plans are the engine's region rule. */
  currency?: PriceCurrency;
}> = {}) {
  const identity = testHttpIdentity(label);
  const clock = { now: new Date() };
  const payments = new ScriptedStarts();
  const geo = new StubGeo();
  const audit = recordingAudit();
  const seeded = await seedNetopiaSubscription(database.pool, {
    ownerRef: identity.authenticated.ownerRef, planId: options.planId ?? "PLUS", activatedAt: new Date(clock.now.getTime() - 5 * DAY),
    taxCountry: "RO",
    ...(options.currency === undefined ? {} : { currency: options.currency }),
    ...(options.currency === "RON" ? { netMicros: 100_000_000 } : {})
  });
  const deps = subscriptionDeps(database.pool, {
    payments, geo, audit, clock: () => clock.now, accountEmail: { read: async () => EMAIL },
    ...(options.currency === undefined ? {} : { plans: testRegionalPlans }),
    ...(options.paymentEnvironment === undefined ? {} : { paymentEnvironment: options.paymentEnvironment })
  });
  const api = await mountSubscriptionRoutes(deps, identity);
  const headers = { "x-test-session": identity.rawSessionToken, "x-test-ip": BUYER_IP };
  const quoteResponse = (plan: "PRO" | "MAX") =>
    api.inject({ method: "POST", url: "/v1/billing/subscription/upgrade-quote", headers, payload: { plan_id: plan } });
  const quote = async (plan: "PRO" | "MAX") => {
    const response = await quoteResponse(plan);
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as { quote_ref: string; total: string; recurring_total: string };
  };
  const upgrade = (plan: "PRO" | "MAX", quoteRef: string, agreement: unknown = testAgreement("en")) => api.inject({
    method: "POST", url: "/v1/billing/subscription/upgrade", headers,
    payload: { plan_id: plan, quote_ref: quoteRef, locale: "en", renewal_terms: agreement }
  });
  const { verify } = netopiaVerifyHandler(database.pool, { payments, clock: () => clock.now });
  return { identity, clock, payments, geo, audit, seeded, deps, api, headers, quoteResponse, quote, upgrade, verify };
}
type Run = Awaited<ReturnType<typeof start>>;

/** NETOPIA reads the order PAID at the charge's own amount and currency, and VERIFY_PAYMENT decides it (N10's path). */
async function pay(run: Run, chargeRef: string): Promise<void> {
  const charge = (await repository.charge(chargeRef))!;
  run.payments.scriptStatus(chargeRef, stubPaymentReport(chargeRef, "PAID", { amountMicros: charge.totalMicros, currency: charge.currency }));
  expect(await run.verify.handle(verifyJob(chargeRef, run.clock.now), run.clock.now)).toEqual({ kind: "DONE" });
}

/** The card NETOPIA saved with this payment, as N9's intake stores it. */
async function storeToken(run: Run, chargeRef: string): Promise<string> {
  const tokenId = randomUUID();
  const sealed = sealCardToken(TEST_RECORDS_KEY, tokenId, testCardToken(["tok", "n12", tokenId.slice(0, 8)].join("-")));
  await repository.withTransaction((client) => repository.insertCardToken(client, {
    tokenId, customerId: run.seeded.customerId, paymentProvider: "netopia", paymentEnvironment: "sandbox",
    sourceChargeId: chargeRef, sourceToolOrder: null, sourceNoticeId: null, sourcePaidAt: run.clock.now,
    tokenCiphertext: sealed.ciphertext, keyId: sealed.keyId, expMonth: 12, expYear: run.clock.now.getUTCFullYear() + 2,
    last4: "4242", cardCountry: "RO", createdAt: run.clock.now
  }));
  return tokenId;
}

const trail = async (chargeRef: string) =>
  (await repository.charge(chargeRef))!.events.map((event) => [event.kind, event.errorCode]);
const stateOf = async (subscriptionId: string) => foldSubscription(await repository.subscriptionEvents(subscriptionId));
const upgradeCharges = async (subscriptionId: string) =>
  (await repository.chargesForSubscription(subscriptionId)).filter((charge) => charge.kind === "UPGRADE");
const upgradedEvents = async (subscriptionId: string) =>
  (await repository.subscriptionEvents(subscriptionId)).filter((event) => event.kind === "UPGRADED");
const entitlementRows = async (ownerRef: string) => (await database.pool.query(
  "SELECT 1 FROM billing.entitlement_event WHERE owner_ref = $1", [ownerRef]
)).rowCount;
const owners = async (reasonCode: string) => (await database.pool.query<{ payload: Record<string, unknown> }>(
  "SELECT payload FROM billing.outbox WHERE kind = 'EMAIL' AND payload->>'template' = 'O3'"
)).rows.filter((row) => JSON.stringify(row.payload).includes(reasonCode));

describe("N12 an upgrade on NETOPIA's page (spec §2.10)", () => {
  it("records the agreement and a profile with the payment address, then opens NETOPIA's page for the prorated total", async () => {
    const run = await start("n12-start");
    const quoted = await run.quote("PRO");
    const response = await run.upgrade("PRO", quoted.quote_ref);
    expect(response.statusCode, response.body).toBe(200);
    const answer = BillingUpgradeResponseSchema.parse(response.json());
    const chargeRef = answer.charge_ref;
    expect(answer.redirect_url).toBe(`https://secure-sandbox.netopia-payments.com/ui/card?p=${chargeRef}`);
    const charge = (await repository.charge(chargeRef))!;
    expect(charge).toMatchObject({
      kind: "UPGRADE", paymentProvider: "netopia", paymentEnvironment: "sandbox", quoteId: quoted.quote_ref,
      periodEnd: run.seeded.periodEnd
    });
    expect(charge.events.map((event) => [event.kind, event.providerPaymentId])).toEqual([
      ["REQUESTED", null], ["SUBMITTED", `ntp-${chargeRef.slice(0, 12)}`]
    ]);
    // Spec §2.10: the payer from the newest profile, the account's current email, our client id and the return page.
    expect(run.payments.hosted).toHaveLength(1);
    expect(run.payments.hosted[0]).toMatchObject({
      orderId: chargeRef, amountMicros: charge.totalMicros, currency: "USD", language: "en",
      clientId: run.seeded.customerId.replaceAll("-", ""),
      returnUrl: `${TEST_PUBLIC_APP_URL}/checkout/return?charge=${chargeRef}`,
      notifyUrl: `${TEST_PUBLIC_APP_URL}/api/v1/billing/netopia/notify`,
      payer: {
        firstName: "Test", lastName: "Subscriber", email: EMAIL, phone: "+40712345678", country: "RO", city: "Bucuresti",
        street: "Strada Exemplu 1", postalCode: "010101"
      }
    });
    // Spec §2.5.2: the page's URL is kept sealed, never in clear.
    const hosted = (await repository.hostedPaymentForCharge(database.pool, chargeRef))!;
    expect(openPaymentUrl(TEST_RECORDS_KEY, chargeRef, hosted.redirectCiphertext)).toBe(answer.redirect_url);
    // Spec §2.18 (SR-20): the card-saving agreement, as a RENEWAL_TERMS acceptance with the surface UPGRADE.
    const accepted = (await database.pool.query<{ kind: string; surface: string; document_version: string; locale: string }>(
      "SELECT kind, surface, document_version, locale FROM legal.acceptance WHERE owner_ref = $1 ORDER BY accepted_at",
      [run.identity.authenticated.ownerRef]
    )).rows;
    expect(accepted).toEqual([{
      kind: "RENEWAL_TERMS", surface: "UPGRADE", document_version: testAgreement("en")!.version, locale: "en"
    }]);
    const latest = (await repository.latestProfile(run.seeded.customerId))!;
    expect(openBillingProfile(TEST_RECORDS_KEY, run.seeded.customerId, latest.profileCiphertext))
      .toMatchObject({ paymentIp: BUYER_IP, email: EMAIL, firstName: "Test" });
    // Nothing changes before NETOPIA confirms the payment.
    expect((await stateOf(run.seeded.subscriptionId)).planId).toBe("PLUS");
    await run.api.close();
  });

  it("a RON subscription upgrades on NETOPIA's page in RON", async () => {
    const run = await start("c2-upgrade-ron", { currency: "RON" });
    const quoted = await run.quote("PRO");
    const response = await run.upgrade("PRO", quoted.quote_ref);
    expect(response.statusCode, response.body).toBe(200);
    const chargeRef = BillingUpgradeResponseSchema.parse(response.json()).charge_ref;
    const quote = (await repository.quote(quoted.quote_ref, run.identity.authenticated.ownerRef))!;
    expect(quote.currency).toBe("RON");
    const charge = (await repository.charge(chargeRef))!;
    expect(charge).toMatchObject({ kind: "UPGRADE", currency: "RON", totalMicros: quote.totalMicros });
    expect(run.payments.hosted).toEqual([
      expect.objectContaining({ orderId: chargeRef, currency: "RON", amountMicros: quote.totalMicros })
    ]);
    expect(microsToDecimal(quote.totalMicros)).toBe(quoted.total);

    // CF1 (tests-1): paid, the upgrade records PRO's RON price as the net every later renewal charges (Terms §12)…
    await pay(run, chargeRef);
    expect((await stateOf(run.seeded.subscriptionId))).toMatchObject({ planId: "PRO", status: "ACTIVE", currency: "RON" });
    const [upgraded, ...moreUpgrades] = await upgradedEvents(run.seeded.subscriptionId);
    expect(moreUpgrades).toEqual([]);
    expect(upgraded!.data).toMatchObject({ recurring_net_micros: 250_000_000, quote_ref: quoted.quote_ref });
    // …and the next renewal charges it: a RENEWAL in RON at PRO's 250.00 RON net, on the saved card.
    const renewal = new RenewalService({
      repository, jobs: new BillingJobQueries(database.pool), entitlements: new EntitlementRepository(database.pool),
      tax: run.deps.tax, settlement: createRenewalSettlement({
        repository, entitlements: new EntitlementRepository(database.pool), policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL
      }),
      policy: testBillingPolicy, plans: testRegionalPlans, recordsKey: TEST_RECORDS_KEY, publicAppUrl: TEST_PUBLIC_APP_URL,
      audit: run.audit, clock: () => run.clock.now, kick: () => undefined,
      netopia: { payments: run.payments, paymentEnvironment: "sandbox", recipients: { currentAddress: async () => EMAIL }, orderText: englishOrderText }
    });
    run.clock.now = new Date(run.seeded.periodEnd.getTime() + MINUTE);
    expect(await renewal.renew(run.seeded.subscriptionId)).toBe("charged");
    const renewals = (await repository.chargesForSubscription(run.seeded.subscriptionId)).filter((charge) => charge.kind === "RENEWAL");
    expect(renewals).toEqual([expect.objectContaining({ currency: "RON", netMicros: 250_000_000 })]);
    expect(run.payments.charges).toEqual([
      expect.objectContaining({ orderId: renewals[0]!.chargeId, currency: "RON", amountMicros: renewals[0]!.totalMicros })
    ]);
    await run.api.close();
  });

  it("refuses an upgrade quote in another currency than the subscription's as the writer's bug it would be", async () => {
    const run = await start("c2-upgrade-mismatch");
    const quoted = await run.quote("PRO");
    const usd = (await repository.quote(quoted.quote_ref, run.identity.authenticated.ownerRef))!;
    const eur = { ...usd, quoteId: randomUUID(), currency: "EUR" as const };
    await repository.withTransaction((client) => repository.insertQuote(client, eur));
    await expect(startUpgrade(run.deps, {
      ownerRef: run.identity.authenticated.ownerRef, userId: run.identity.authenticated.userId, planId: "PRO",
      quoteRef: eur.quoteId, ip: BUYER_IP, userAgent: "c2", locale: "en", agreement: testAgreement("en")!
    })).rejects.toMatchObject({ code: "BILLING_CURRENCY_MISMATCH" });
    expect(await upgradeCharges(run.seeded.subscriptionId)).toEqual([]);
    expect(run.payments.hosted).toEqual([]);
    await run.api.close();
  });

  it("answers the same page for the same quote while it is payable, and never opens a second one", async () => {
    const run = await start("n12-reuse");
    const quoted = await run.quote("PRO");
    const first = BillingUpgradeResponseSchema.parse((await run.upgrade("PRO", quoted.quote_ref)).json());
    run.payments.scriptStatus(first.charge_ref, stubPaymentReport(first.charge_ref, "PENDING"));
    const again = await run.upgrade("PRO", quoted.quote_ref);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first);
    // Declined: the person may retry on the same page (spec §2.10).
    run.payments.scriptStatus(first.charge_ref, stubPaymentReport(first.charge_ref, "DECLINED", { declineCode: "20", declineSide: "CARD" }));
    expect((await run.upgrade("PRO", quoted.quote_ref)).json()).toEqual(first);
    expect(run.payments.startCalls).toBe(1);
    expect(run.payments.statusReads.map((read) => read.providerPaymentId))
      .toEqual([`ntp-${first.charge_ref.slice(0, 12)}`, `ntp-${first.charge_ref.slice(0, 12)}`]);
    await run.api.close();
  });

  it("hands the same quote's page back only within 15 minutes of its start, then asks for a fresh price (N-25)", async () => {
    const run = await start("n12-reuse-window");
    const quoted = await run.quote("PRO");
    const first = BillingUpgradeResponseSchema.parse((await run.upgrade("PRO", quoted.quote_ref)).json());
    run.payments.scriptStatus(first.charge_ref, stubPaymentReport(first.charge_ref, "PENDING", { providerStatus: "1" }));
    // NETOPIA's page lasts 20 minutes; 16 minutes on, the quote (30 minutes) still lives but its page is not handed back.
    run.clock.now = new Date(run.clock.now.getTime() + 16 * MINUTE);
    const refused = await run.upgrade("PRO", quoted.quote_ref);
    expect(refused.statusCode, refused.body).toBe(409);
    expect(refused.json()).toMatchObject({ error: "QUOTE_EXPIRED" });
    expect((await trail(first.charge_ref)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    expect(run.payments.startCalls).toBe(1);
    // A fresh price opens a second page.
    const fresh = await run.upgrade("PRO", (await run.quote("PRO")).quote_ref);
    expect(fresh.statusCode, fresh.body).toBe(200);
    const second = BillingUpgradeResponseSchema.parse(fresh.json());
    expect(second.charge_ref).not.toBe(first.charge_ref);
    expect(second.redirect_url).not.toBe(first.redirect_url);
    expect(run.payments.startCalls).toBe(2);
    await run.api.close();
  });

  it("answers 409 UPGRADE_PENDING while an upgrade is paid or almost, or its status cannot be read", async () => {
    const run = await start("n12-pending");
    const quoted = await run.quote("PRO");
    const first = BillingUpgradeResponseSchema.parse((await run.upgrade("PRO", quoted.quote_ref)).json());
    const cases = [
      stubPaymentReport(first.charge_ref, "PENDING", { providerStatus: "6" }),
      paymentError("PAYMENT_PROVIDER_UNAVAILABLE"),
      stubPaymentReport(first.charge_ref, "PAID")
    ];
    for (const read of cases) {
      run.payments.scriptStatus(first.charge_ref, read);
      const second = await run.quote("PRO");
      const refused = await run.upgrade("PRO", second.quote_ref);
      expect(refused.statusCode).toBe(409);
      expect(BillingUpgradePendingErrorSchema.parse(refused.json())).toEqual({
        error: "UPGRADE_PENDING", message: "UPGRADE_PENDING", charge_ref: first.charge_ref
      });
    }
    // A PAID read is decided now: VERIFY_PAYMENT is queued for the charge.
    const queued = (await database.pool.query("SELECT 1 FROM billing.outbox WHERE kind = 'VERIFY_PAYMENT' AND ref = $1",
      [first.charge_ref])).rowCount;
    expect(queued).toBe(1);
    expect(run.payments.startCalls).toBe(1);
    expect((await repository.chargesForSubscription(run.seeded.subscriptionId)).filter((row) => row.kind === "UPGRADE")).toHaveLength(1);
    await run.api.close();
  });

  it("closes an unpaid upgrade after its quote's lifetime, or when another quote is paid for, and lets the new one go on", async () => {
    const run = await start("n12-close");
    const first = BillingUpgradeResponseSchema.parse((await run.upgrade("PRO", (await run.quote("PRO")).quote_ref)).json());
    // NETOPIA knows no payment for it (the person left the page): past the quote's 30 minutes it closes.
    run.clock.now = new Date(run.clock.now.getTime() + 31 * MINUTE);
    const second = await run.upgrade("PRO", (await run.quote("PRO")).quote_ref);
    expect(second.statusCode, second.body).toBe(200);
    expect(await trail(first.charge_ref)).toEqual([["REQUESTED", null], ["SUBMITTED", null], ["FAILED", "NO_TRANSACTION"]]);
    // Within the lifetime, an untouched page of ANOTHER quote is not reused: it is closed too (SR-23: same quote only).
    const secondRef = BillingUpgradeResponseSchema.parse(second.json()).charge_ref;
    run.payments.scriptStatus(secondRef, stubPaymentReport(secondRef, "PENDING"));
    run.clock.now = new Date(run.clock.now.getTime() + 5 * MINUTE);
    const third = await run.upgrade("MAX", (await run.quote("MAX")).quote_ref);
    expect(third.statusCode, third.body).toBe(200);
    expect((await trail(secondRef)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    expect(run.payments.startCalls).toBe(3);
    await run.api.close();
  });

  it("applies a paid upgrade with its saved card: UPGRADED, the same anchor, the new card", async () => {
    const run = await start("n12-paid");
    const quoteRef = (await run.quote("PRO")).quote_ref;
    const answer = BillingUpgradeResponseSchema.parse((await run.upgrade("PRO", quoteRef)).json());
    const tokenId = await storeToken(run, answer.charge_ref);
    await pay(run, answer.charge_ref);
    const after = await stateOf(run.seeded.subscriptionId);
    expect(after).toMatchObject({ planId: "PRO", status: "ACTIVE", cardTokenId: tokenId });
    expect(after.periodAnchorAt?.getTime()).toBe(run.seeded.periodStart.getTime());
    // A7: the new plan's monthly total the quote announced; A6: the prorated month credit, measured at the quote.
    const quote = (await repository.quote(quoteRef, run.identity.authenticated.ownerRef))!;
    expect(after.announcedTotalMicros).toBe(quote.recurringTotalMicros);
    expect(await new EntitlementRepository(database.pool).current(run.identity.authenticated.ownerRef, run.clock.now)).toMatchObject({
      planId: "PRO", cause: "UPGRADED", periodAnchorAt: run.seeded.periodStart, paidThrough: run.seeded.periodEnd,
      monthCreditOverrideMicros: upgradeMonthCreditOverrideMicros({
        currentMonthCreditMicros: 5_000_000, oldPlanCreditMicros: 5_000_000, newPlanCreditMicros: 20_000_000,
        periodStart: run.seeded.periodStart, periodEnd: run.seeded.periodEnd, at: quote.createdAt
      })
    });
    const upgraded = (await repository.subscriptionEvents(run.seeded.subscriptionId)).filter((event) => event.kind === "UPGRADED");
    expect(upgraded.map((event) => event.cardTokenId)).toEqual([tokenId]);
    expect(chargeStatusOf((await repository.charge(answer.charge_ref))!.events)).toEqual({ state: "SUCCEEDED", reasonCode: null });
    await run.api.close();
  });

  it("applies a late payment of a closed upgrade that can still buy what it was priced for", async () => {
    const run = await start("n12-late-applies");
    const first = BillingUpgradeResponseSchema.parse((await run.upgrade("PRO", (await run.quote("PRO")).quote_ref)).json());
    run.clock.now = new Date(run.clock.now.getTime() + 31 * MINUTE);
    expect((await run.upgrade("PRO", (await run.quote("PRO")).quote_ref)).statusCode).toBe(200);
    expect((await trail(first.charge_ref)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    // NETOPIA's page of the closed upgrade was paid after all: same period, no plan change since its quote.
    await pay(run, first.charge_ref);
    expect((await stateOf(run.seeded.subscriptionId)).planId).toBe("PRO");
    expect((await trail(first.charge_ref)).some(([kind]) => kind === "REFUND_REQUESTED")).toBe(false);
    await run.api.close();
  });

  it("refunds UPGRADE_CLOSED a late payment of a closed upgrade once the plan changed since its quote", async () => {
    const run = await start("n12-late-refund");
    const first = BillingUpgradeResponseSchema.parse((await run.upgrade("PRO", (await run.quote("PRO")).quote_ref)).json());
    run.clock.now = new Date(run.clock.now.getTime() + 31 * MINUTE);
    const second = BillingUpgradeResponseSchema.parse((await run.upgrade("MAX", (await run.quote("MAX")).quote_ref)).json());
    await pay(run, second.charge_ref);
    expect((await stateOf(run.seeded.subscriptionId)).planId).toBe("MAX");
    await pay(run, first.charge_ref);
    const events = (await repository.charge(first.charge_ref))!.events;
    expect(events.find((event) => event.kind === "REFUND_REQUESTED")).toMatchObject({
      errorCode: "UPGRADE_CLOSED", amountMicros: events.find((event) => event.kind === "SUCCEEDED")!.amountMicros
    });
    // F4 (finding ui-1): the owner refunds by hand, so until the refund is recorded the page says it is on its way.
    expect(chargeStatusOf(events)).toEqual({ state: "FAILED", reasonCode: "REFUND_PENDING" });
    expect((await stateOf(run.seeded.subscriptionId)).planId).toBe("MAX");
    expect((await repository.subscriptionEvents(run.seeded.subscriptionId)).filter((event) => event.kind === "UPGRADED")).toHaveLength(1);
    await run.api.close();
  });

  it("refuses QUOTE_EXPIRED a quote made before another upgrade was applied: two tabs never pay PLUS→PRO and PLUS→MAX", async () => {
    const run = await start("n12-two-tabs");
    const pro = await run.quote("PRO");
    run.clock.now = new Date(run.clock.now.getTime() + 1_000);
    const max = await run.quote("MAX");
    run.clock.now = new Date(run.clock.now.getTime() + 1_000);
    const paid = BillingUpgradeResponseSchema.parse((await run.upgrade("PRO", pro.quote_ref)).json());
    await pay(run, paid.charge_ref);
    expect((await stateOf(run.seeded.subscriptionId)).planId).toBe("PRO");
    // The MAX quote was priced from PLUS; the plan is PRO now, so its price no longer holds.
    const refused = await run.upgrade("MAX", max.quote_ref);
    expect([refused.statusCode, refused.json().error]).toEqual([409, "QUOTE_EXPIRED"]);
    expect((await upgradeCharges(run.seeded.subscriptionId)).map((charge) => charge.chargeId)).toEqual([paid.charge_ref]);
    expect(run.payments.startCalls).toBe(1);
    expect((await stateOf(run.seeded.subscriptionId)).planId).toBe("PRO");
    await run.api.close();
  });

  it("refunds SUBSCRIPTION_ENDED an open upgrade paid after another one applied: a closed PRO page paid late, then MAX", async () => {
    const run = await start("n12-closed-then-applied");
    const pro = BillingUpgradeResponseSchema.parse((await run.upgrade("PRO", (await run.quote("PRO")).quote_ref)).json());
    run.clock.now = new Date(run.clock.now.getTime() + MINUTE);
    // Within PRO's lifetime, a MAX request closes PRO's page (another quote) and opens its own.
    const max = BillingUpgradeResponseSchema.parse((await run.upgrade("MAX", (await run.quote("MAX")).quote_ref)).json());
    expect((await trail(pro.charge_ref)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    // NETOPIA's PRO page stayed payable and was paid: nothing applied since its quote, so it applies.
    run.clock.now = new Date(run.clock.now.getTime() + MINUTE);
    await pay(run, pro.charge_ref);
    expect((await stateOf(run.seeded.subscriptionId)).planId).toBe("PRO");
    // Then MAX's page is paid: priced from PLUS, a plan the subscription no longer has. The whole payment goes back.
    run.clock.now = new Date(run.clock.now.getTime() + MINUTE);
    await pay(run, max.charge_ref);
    const charge = (await repository.charge(max.charge_ref))!;
    const succeeded = charge.events.find((event) => event.kind === "SUCCEEDED")!;
    expect(succeeded.amountMicros).toBe(charge.totalMicros);
    expect(charge.events.find((event) => event.kind === "REFUND_REQUESTED")).toMatchObject({
      errorCode: "SUBSCRIPTION_ENDED", amountMicros: charge.totalMicros
    });
    // F4 (finding ui-1): no REFUNDED yet, so the page says the refund is on its way, never that it was made.
    expect(chargeStatusOf(charge.events)).toEqual({ state: "FAILED", reasonCode: "REFUND_PENDING" });
    expect((await stateOf(run.seeded.subscriptionId)).planId).toBe("PRO");
    expect(await upgradedEvents(run.seeded.subscriptionId)).toHaveLength(1);
    await run.api.close();
  });

  it("refunds an upgrade paid after a renewal moved the period, and writes nothing", async () => {
    const run = await start("n12-stale-period");
    const answer = BillingUpgradeResponseSchema.parse((await run.upgrade("MAX", (await run.quote("MAX")).quote_ref)).json());
    // The renewal went through before this payment was verified.
    const renewed = await stateOf(run.seeded.subscriptionId);
    await repository.withTransaction((client) => repository.appendSubscriptionEvent(client,
      subscriptionEvent(renewed, "RENEWED", run.seeded.periodEnd, {})));
    const before = await entitlementRows(run.identity.authenticated.ownerRef);
    run.clock.now = new Date(run.seeded.periodEnd.getTime() + MINUTE);
    await pay(run, answer.charge_ref);
    const charge = (await repository.charge(answer.charge_ref))!;
    expect(charge.events.find((event) => event.kind === "REFUND_REQUESTED")).toMatchObject({
      errorCode: "SUBSCRIPTION_ENDED", amountMicros: charge.totalMicros
    });
    expect(await upgradedEvents(run.seeded.subscriptionId)).toEqual([]);
    expect((await stateOf(run.seeded.subscriptionId)).planId).toBe("PLUS");
    expect(await entitlementRows(run.identity.authenticated.ownerRef)).toBe(before);
    await run.api.close();
  });
});

describe("N12 the quote and the charge key (P12c's cases on NETOPIA)", () => {
  it("quotes the prorated difference with tax and the new plan's recurring total", async () => {
    const run = await start("n12-quote");
    const response = await run.quoteResponse("PRO");
    expect(response.statusCode, response.body).toBe(200);
    const net = upgradeProrationMicros({
      oldNetMicros: 20_000_000, newNetMicros: 50_000_000,
      periodStart: run.seeded.periodStart, periodEnd: run.seeded.periodEnd, now: run.clock.now
    });
    // The same fake engine the routes price with (P4's rates, RO 21 %, rounded half up to the cent).
    const tax = (await new AdjustableTaxEngine().quote({
      netMicros: net, currency: "USD", taxId: null, taxCode: "saas", date: run.clock.now,
      location: { country: "RO", region: null, postalCode: null, city: null, street: null, ip: null }
    })).taxMicros;
    expect(response.json()).toMatchObject({
      plan_id: "PRO", net: microsToDecimal(net), tax: microsToDecimal(tax), total: microsToDecimal(net + tax),
      tax_country: "RO", tax_rate_basis_points: 2_100, recurring_total: "60.50",
      renews_on: run.seeded.periodEnd.toISOString()
    });
    const stored = await repository.quote(response.json().quote_ref as string, run.identity.authenticated.ownerRef);
    expect(stored).toMatchObject({ kind: "UPGRADE", planId: "PRO", totalMicros: net + tax, recurringTotalMicros: 60_500_000 });
    await run.api.close();
  });

  it("prorates from the price the subscriber pays, never the register's current one (Terms §12)", async () => {
    const identity = testHttpIdentity("n12-own-price");
    const now = new Date();
    // Bought when Plus cost 18.00; the register says 20.00 today. The credit for the old plan is what was paid.
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(now.getTime() - 5 * DAY),
      taxCountry: "RO", netMicros: 18_000_000
    });
    const deps = subscriptionDeps(database.pool, { geo: new StubGeo(), clock: () => now });
    const quoted = await quoteUpgrade(deps, { ownerRef: identity.authenticated.ownerRef, planId: "PRO", ip: BUYER_IP, now });
    const own = upgradeProrationMicros({
      oldNetMicros: 18_000_000, newNetMicros: 50_000_000, periodStart: seeded.periodStart, periodEnd: seeded.periodEnd, now
    });
    const registers = upgradeProrationMicros({
      oldNetMicros: 20_000_000, newNetMicros: 50_000_000, periodStart: seeded.periodStart, periodEnd: seeded.periodEnd, now
    });
    expect(own).toBeGreaterThan(registers);
    expect(quoted.net).toBe(microsToDecimal(own));
  });

  it("lets a person upgrade after four declined cards: every quote is its own charge key", async () => {
    const run = await start("n12-declines");
    const ownerRef = run.identity.authenticated.ownerRef;
    const base = run.clock.now.getTime();
    const quoteRefs: string[] = [];
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      run.clock.now = new Date(base + attempt * 1_000);
      const quoteRef = (await run.quote("PRO")).quote_ref;
      const opened = await run.upgrade("PRO", quoteRef);
      expect(opened.statusCode, opened.body).toBe(200);
      const ref = BillingUpgradeResponseSchema.parse(opened.json()).charge_ref;
      run.payments.scriptStatus(ref, stubPaymentReport(ref, "DECLINED", { declineCode: "20", declineSide: "CARD" }));
      expect(await run.verify.handle(verifyJob(ref, run.clock.now), run.clock.now), String(attempt)).toEqual({ kind: "DONE" });
      expect((await trail(ref)).at(-1), String(attempt)).toEqual(["FAILED", "PAYMENT_DECLINED"]);
      quoteRefs.push(quoteRef);
    }
    // A fifth quote still opens: no declined quote used up the period.
    run.clock.now = new Date(base + 5_000);
    const fifthQuote = (await run.quote("PRO")).quote_ref;
    const fifth = await run.upgrade("PRO", fifthQuote);
    expect(fifth.statusCode, fifth.body).toBe(200);
    quoteRefs.push(fifthQuote);
    const opened = await upgradeCharges(run.seeded.subscriptionId);
    for (const quoteRef of quoteRefs) {
      const quote = (await repository.quote(quoteRef, ownerRef))!;
      const charge = opened.find((row) => row.quoteId === quoteRef)!;
      expect(charge.attempt, quoteRef).toBe(1);
      expect(charge.periodStart.getTime(), quoteRef).toBe(quote.createdAt.getTime());
    }
    // Two quotes made in the same millisecond share a key and count up.
    run.clock.now = new Date(base + 10_000);
    const twinA = (await run.quote("PRO")).quote_ref;
    const twinB = (await run.quote("PRO")).quote_ref;
    expect((await run.upgrade("PRO", twinA)).statusCode).toBe(200);
    expect((await run.upgrade("PRO", twinB)).statusCode).toBe(200);
    const charges = await upgradeCharges(run.seeded.subscriptionId);
    expect(charges).toHaveLength(7);
    const twins = charges.filter((charge) => charge.periodStart.getTime() === run.clock.now.getTime());
    expect(twins.map((charge) => charge.attempt).sort()).toEqual([1, 2]);
    expect(charges.every((charge) => charge.periodEnd.getTime() === run.seeded.periodEnd.getTime())).toBe(true);
    await run.api.close();
  });

  it("completes on a pool of ONE connection: every transaction runs on the lease's own", async () => {
    const small = createPool(database.connectionString, { max: 1 });
    try {
      const identity = testHttpIdentity("n12-small-pool");
      await seedNetopiaSubscription(database.pool, {
        ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO"
      });
      const deps = subscriptionDeps(small, { geo: new StubGeo(), accountEmail: { read: async () => EMAIL } });
      const quoted = await quoteUpgrade(deps, { ownerRef: identity.authenticated.ownerRef, planId: "PRO", ip: BUYER_IP, now: new Date() });
      // The lease holds the only connection; a transaction or a read that asked the pool for another would wait for ever.
      const answer = await startUpgrade(deps, {
        ownerRef: identity.authenticated.ownerRef, userId: identity.authenticated.userId, planId: "PRO",
        quoteRef: quoted.quote_ref, ip: BUYER_IP, userAgent: "n12", locale: "en", agreement: testAgreement("en")!
      });
      expect(BillingUpgradeResponseSchema.parse(answer)).toEqual({ redirect_url: expect.any(String), charge_ref: expect.any(String) });
    } finally {
      await small.end();
    }
  }, 10_000);
});

describe("N12 a start NETOPIA refuses or may have received (spec §2.6.2 step 8)", () => {
  it("writes FAILED with the code and answers 503 when nothing was sent; our settings and our key also tell the owner", async () => {
    const run = await start("n12-start-refused");
    const cases = [
      [paymentError("PAYMENT_PROVIDER_UNAVAILABLE"), "PAYMENT_PROVIDER_UNAVAILABLE", null],
      [paymentError("PAYMENT_CONFIGURATION_REFUSED", "32"), "PAYMENT_CONFIGURATION_REFUSED", "CHARGE_CONFIGURATION_REFUSED"],
      [paymentError("PAYMENT_CREDENTIALS_REFUSED", "401"), "PAYMENT_CREDENTIALS_REFUSED", "CHARGE_CREDENTIALS_REFUSED"]
    ] as const;
    for (const [failure, code, alert] of cases) {
      run.payments.failures.push(failure);
      const refused = await run.upgrade("PRO", (await run.quote("PRO")).quote_ref);
      expect(refused.statusCode, code).toBe(503);
      expect(refused.json().error).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
      const ref = run.payments.hosted.at(-1)!.orderId;
      expect(await trail(ref), code).toEqual([["REQUESTED", null], ["FAILED", code]]);
      if (alert !== null) expect((await owners(alert)).length, alert).toBeGreaterThanOrEqual(1);
    }
    expect(run.audit.events.filter((entry) => entry.event === "billing.payment.credentials_refused")).toHaveLength(1);
    expect(run.audit.events.filter((entry) => entry.event === "billing.payment.start_failed").map((entry) => entry.fields.code))
      .toEqual(["PAYMENT_PROVIDER_UNAVAILABLE", "PAYMENT_CONFIGURATION_REFUSED", "PAYMENT_CREDENTIALS_REFUSED"]);
    // A failed start never blocks the next upgrade.
    expect((await run.upgrade("PRO", (await run.quote("PRO")).quote_ref)).statusCode).toBe(200);
    await run.api.close();
  });

  it("leaves an unknown start without a page, and closes it at the next request", async () => {
    const run = await start("n12-start-unknown");
    run.payments.failures.push(paymentError("PAYMENT_OUTCOME_UNKNOWN", "504"));
    const refused = await run.upgrade("PRO", (await run.quote("PRO")).quote_ref);
    expect(refused.statusCode).toBe(503);
    const ref = run.payments.hosted[0]!.orderId;
    expect(await trail(ref)).toEqual([["REQUESTED", null], ["SUBMIT_UNKNOWN", "CHARGE_OUTCOME_UNKNOWN"]]);
    expect(await repository.hostedPaymentForCharge(database.pool, ref)).toBeNull();
    const next = await run.upgrade("PRO", (await run.quote("PRO")).quote_ref);
    expect(next.statusCode, next.body).toBe(200);
    expect((await trail(ref)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    // A page-less upgrade is never read at NETOPIA.
    expect(run.payments.statusReads.map((read) => read.orderId)).not.toContain(ref);
    await run.api.close();
  });
});

describe("N12 refusals before any charge", () => {
  it("refuses an expired quote (no charge yet, or its page still payable), a plan not higher, a past-due plan, Tor", async () => {
    const run = await start("n12-expired");
    const quoteRef = (await run.quote("PRO")).quote_ref;
    run.clock.now = new Date(run.clock.now.getTime() + 31 * MINUTE);
    const expired = await run.upgrade("PRO", quoteRef);
    expect([expired.statusCode, expired.json().error]).toEqual([409, "QUOTE_EXPIRED"]);
    expect(await upgradeCharges(run.seeded.subscriptionId)).toEqual([]);
    expect(run.payments.startCalls).toBe(0);
    await run.api.close();

    // The same quote's page still payable at NETOPIA (status 1): within the lifetime it would be answered again (the
    // reuse case above); 31 minutes on, the page is closed and the quote buys nothing.
    const open = await start("n12-expired-open");
    const quoted = await open.quote("PRO");
    const first = BillingUpgradeResponseSchema.parse((await open.upgrade("PRO", quoted.quote_ref)).json());
    open.payments.scriptStatus(first.charge_ref, stubPaymentReport(first.charge_ref, "PENDING", { providerStatus: "1" }));
    open.clock.now = new Date(open.clock.now.getTime() + 31 * MINUTE);
    const late = await open.upgrade("PRO", quoted.quote_ref);
    expect([late.statusCode, late.json().error]).toEqual([409, "QUOTE_EXPIRED"]);
    expect((await trail(first.charge_ref)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    expect(open.payments.startCalls).toBe(1);
    await open.api.close();

    const pro = await start("n12-not-higher", { planId: "PRO" });
    const notHigher = await pro.quoteResponse("PRO");
    expect([notHigher.statusCode, notHigher.json().error]).toEqual([422, "UPGRADE_NOT_HIGHER"]);
    await pro.api.close();

    const pastDue = await start("n12-past-due");
    const written = await stateOf(pastDue.seeded.subscriptionId);
    await repository.withTransaction((client) => repository.appendSubscriptionEvent(client,
      subscriptionEvent(written, "PAST_DUE", pastDue.clock.now, { attempt: 1 })));
    const refused = await pastDue.quoteResponse("PRO");
    expect([refused.statusCode, refused.json().error]).toEqual([409, "NOT_SUBSCRIBED"]);
    await pastDue.api.close();

    const tor = await start("n12-tor");
    tor.geo.tor = true;
    const torQuote = await tor.quoteResponse("PRO");
    expect([torQuote.statusCode, torQuote.json().error]).toEqual([403, "TOR_REFUSED"]);
    await tor.api.close();
  });

  it("refuses a stale agreement, a plan of another system, an incomplete payer", async () => {
    const run = await start("n12-refusals");
    const quoted = await run.quote("PRO");
    const stale = await run.upgrade("PRO", quoted.quote_ref, { version: "2026-01-01", sha256: "0".repeat(63) + "1" });
    expect([stale.statusCode, stale.json().error]).toEqual([409, "LEGAL_DOCUMENT_STALE"]);
    // No agreement (a default parameter would turn `undefined` back into the valid one, so null stands for none).
    const malformed = await run.upgrade("PRO", quoted.quote_ref, null);
    expect(malformed.statusCode).toBe(400);
    // A profile without a phone (an older checkout): NETOPIA's payer is incomplete, nothing is opened (spec §2.5.3).
    await repository.withTransaction(async (client) => {
      const sealed = sealBillingProfile(TEST_RECORDS_KEY, run.seeded.customerId, {
        email: EMAIL, locale: "en", name: "Test Subscriber", country: "RO", region: null, postalCode: "010101",
        city: "Bucuresti", street: "Strada Exemplu 1", company: null
      });
      await repository.appendProfile(client, {
        customerId: run.seeded.customerId, at: new Date(run.clock.now.getTime() + 1), locale: "en",
        profileCiphertext: sealed.ciphertext, keyId: sealed.keyId
      });
    });
    const incomplete = await run.upgrade("PRO", quoted.quote_ref);
    expect([incomplete.statusCode, incomplete.json().error]).toEqual([422, "BILLING_ADDRESS_REQUIRED"]);
    expect((await repository.chargesForSubscription(run.seeded.subscriptionId)).map((row) => row.kind)).toEqual(["INITIAL"]);
    await run.api.close();

    // A plan of the other NETOPIA environment (the API serves the sandbox) is never upgraded here.
    const identity = testHttpIdentity("n12-other-system-plan");
    await seedNetopiaSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 5 * DAY), taxCountry: "RO",
      paymentEnvironment: "live"
    });
    const deps = subscriptionDeps(database.pool, { geo: new StubGeo(), accountEmail: { read: async () => EMAIL } });
    const otherQuote = await quoteUpgrade(deps, { ownerRef: identity.authenticated.ownerRef, planId: "PRO", ip: BUYER_IP, now: new Date() });
    await expect(startUpgrade(deps, {
      ownerRef: identity.authenticated.ownerRef, userId: identity.authenticated.userId, planId: "PRO",
      quoteRef: otherQuote.quote_ref, ip: BUYER_IP, userAgent: "n12", locale: "en", agreement: testAgreement("en")!
    })).rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
  });
});

describe("N12 the subscription view and the undo of a cancel for a NETOPIA plan (N11's gaps)", () => {
  it("offers the upgrade and the undo of a cancel in this environment only, and the undo works", async () => {
    const run = await start("n12-view");
    const view = async (target: Run) => (await target.api.inject({
      method: "GET", url: "/v1/billing/subscription", headers: target.headers
    })).json().subscription as Record<string, unknown>;
    expect(await view(run)).toMatchObject({ can_upgrade: true, can_revoke_cancel: false });
    expect((await run.api.inject({ method: "POST", url: "/v1/billing/subscription/cancel", headers: run.headers })).statusCode).toBe(204);
    expect(await view(run)).toMatchObject({ cancel_requested: true, can_revoke_cancel: true });
    const revoked = await run.api.inject({ method: "POST", url: "/v1/billing/subscription/cancel-revoke", headers: run.headers });
    expect(revoked.statusCode, revoked.body).toBe(204);
    expect(await view(run)).toMatchObject({ cancel_requested: false });
    await run.api.close();

    const other = await start("n12-view-live", { paymentEnvironment: "live" });
    expect(await view(other)).toMatchObject({ can_upgrade: false, can_revoke_cancel: false });
    await other.api.close();
  });
});
