import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  foldSubscription, paymentError, type HostedPaymentStart, type HostedPaymentStarted
} from "@debateai/billing-core";
import { BillingUpgradePendingErrorSchema, BillingUpgradeResponseSchema } from "@debateai/contract";
import { BillingRepository, migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { StubGeo } from "../support/billingFixtures.js";
import {
  mountSubscriptionRoutes, recordingAudit, seedActiveSubscription, seedNetopiaSubscription, subscriptionDeps, testAgreement,
  testCardToken, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY
} from "../support/billingSubscriptionFixtures.js";
import { netopiaVerifyHandler, verifyJob } from "../support/netopia-verify.js";
import { StubCardPayments, stubPaymentReport } from "../support/stub-card-payments.js";
import { chargeStatusOf } from "../../apps/api/src/billing/charge-status.js";
import { openBillingProfile, openPaymentUrl, sealBillingProfile, sealCardToken } from "../../apps/api/src/billing/records.js";
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

async function start(label: string, options: Readonly<{ paymentEnvironment?: "sandbox" | "live" }> = {}) {
  const identity = testHttpIdentity(label);
  const clock = { now: new Date() };
  const payments = new ScriptedStarts();
  const geo = new StubGeo();
  const audit = recordingAudit();
  const seeded = await seedNetopiaSubscription(database.pool, {
    ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(clock.now.getTime() - 5 * DAY), taxCountry: "RO"
  });
  const deps = subscriptionDeps(database.pool, {
    payments, geo, audit, clock: () => clock.now, accountEmail: { read: async () => EMAIL },
    ...(options.paymentEnvironment === undefined ? {} : { paymentEnvironment: options.paymentEnvironment })
  });
  const api = await mountSubscriptionRoutes(deps, identity);
  const headers = { "x-test-session": identity.rawSessionToken, "x-test-ip": BUYER_IP };
  const quote = async (plan: "PRO" | "MAX") => {
    const response = await api.inject({ method: "POST", url: "/v1/billing/subscription/upgrade-quote", headers, payload: { plan_id: plan } });
    expect(response.statusCode, response.body).toBe(200);
    return response.json() as { quote_ref: string; total: string; recurring_total: string };
  };
  const upgrade = (plan: "PRO" | "MAX", quoteRef: string, agreement: unknown = testAgreement("en")) => api.inject({
    method: "POST", url: "/v1/billing/subscription/upgrade", headers,
    payload: { plan_id: plan, quote_ref: quoteRef, locale: "en", renewal_terms: agreement }
  });
  const { verify } = netopiaVerifyHandler(database.pool, { payments, clock: () => clock.now });
  return { identity, clock, payments, geo, audit, seeded, deps, api, headers, quote, upgrade, verify };
}
type Run = Awaited<ReturnType<typeof start>>;

/** NETOPIA reads the order PAID at the charge's own amount, and VERIFY_PAYMENT decides it (N10's path). */
async function pay(run: Run, chargeRef: string): Promise<void> {
  const charge = (await repository.charge(chargeRef))!;
  run.payments.scriptStatus(chargeRef, stubPaymentReport(chargeRef, "PAID", { amountMicros: charge.totalMicros }));
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
    const answer = BillingUpgradeResponseSchema.parse((await run.upgrade("PRO", (await run.quote("PRO")).quote_ref)).json());
    const tokenId = await storeToken(run, answer.charge_ref);
    await pay(run, answer.charge_ref);
    const after = await stateOf(run.seeded.subscriptionId);
    expect(after).toMatchObject({ planId: "PRO", status: "ACTIVE", cardTokenId: tokenId });
    expect(after.periodAnchorAt?.getTime()).toBe(run.seeded.periodStart.getTime());
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
    expect(chargeStatusOf(events)).toEqual({ state: "FAILED", reasonCode: "UPGRADE_CLOSED" });
    expect((await stateOf(run.seeded.subscriptionId)).planId).toBe("MAX");
    expect((await repository.subscriptionEvents(run.seeded.subscriptionId)).filter((event) => event.kind === "UPGRADED")).toHaveLength(1);
    await run.api.close();
  });
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

    const identity = testHttpIdentity("n12-xmoney-plan");
    await seedActiveSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 5 * DAY), taxCountry: "RO"
    });
    const deps = subscriptionDeps(database.pool, { geo: new StubGeo(), accountEmail: { read: async () => EMAIL } });
    const xmoneyQuote = await quoteUpgrade(deps, { ownerRef: identity.authenticated.ownerRef, planId: "PRO", ip: BUYER_IP, now: new Date() });
    await expect(startUpgrade(deps, {
      ownerRef: identity.authenticated.ownerRef, userId: identity.authenticated.userId, planId: "PRO",
      quoteRef: xmoneyQuote.quote_ref, ip: BUYER_IP, userAgent: "n12", locale: "en", agreement: testAgreement("en")!
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
