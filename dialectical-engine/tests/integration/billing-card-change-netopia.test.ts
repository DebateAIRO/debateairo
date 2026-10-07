import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription, paymentError, type PaymentState } from "@debateai/billing-core";
import { BillingCardChangeResponseSchema, BillingCardDetailsResponseSchema } from "@debateai/contract";
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
import { openBillingProfile, sealCardToken } from "../../apps/api/src/billing/records.js";
import { chargeEvent, newChargeId, subscriptionEvent } from "../../apps/api/src/billing/rows.js";

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
const EMAIL = "holder@example.test";
const IP = "198.51.100.40";
const CORRECTED = {
  first_name: "Ana", last_name: "Pop", phone: "+40722111222", street: "Strada Noua 2", city: "Cluj-Napoca", postal_code: "400001"
};

async function start(label: string) {
  const identity = testHttpIdentity(label);
  const clock = { now: new Date() };
  const payments = new StubCardPayments();
  const audit = recordingAudit();
  const seeded = await seedNetopiaSubscription(database.pool, {
    ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(clock.now.getTime() - 3 * DAY), taxCountry: "RO"
  });
  const deps = subscriptionDeps(database.pool, {
    payments, audit, geo: new StubGeo(), clock: () => clock.now, accountEmail: { read: async () => EMAIL }
  });
  const api = await mountSubscriptionRoutes(deps, identity);
  const headers = { "x-test-session": identity.rawSessionToken, "x-test-ip": IP };
  const details = () => api.inject({ method: "GET", url: "/v1/billing/subscription/card", headers });
  const change = (body: Record<string, unknown> = {}) => api.inject({
    method: "POST", url: "/v1/billing/subscription/card", headers,
    payload: { locale: "en", renewal_terms: testAgreement("en"), ...CORRECTED, ...body }
  });
  const started = async () => {
    const response = await change();
    expect(response.statusCode, response.body).toBe(200);
    return BillingCardChangeResponseSchema.parse(response.json());
  };
  const { verify } = netopiaVerifyHandler(database.pool, { payments, clock: () => clock.now });
  /** NETOPIA reads the 0 check in `state`, and VERIFY_PAYMENT decides it (N10's path with this task's gate). */
  const check = (chargeRef: string, state: PaymentState, extra: Parameters<typeof stubPaymentReport>[2] = {}) => {
    payments.scriptStatus(chargeRef, stubPaymentReport(chargeRef, state, { amountMicros: 0, ...extra }));
    return verify.handle(verifyJob(chargeRef, clock.now), clock.now);
  };
  return { identity, clock, payments, audit, seeded, api, details, change, started, check };
}
type Run = Awaited<ReturnType<typeof start>>;

/** The card NETOPIA saved with the check, as N9's intake stores it. */
async function storeToken(run: Run, chargeRef: string): Promise<string> {
  const tokenId = randomUUID();
  const sealed = sealCardToken(TEST_RECORDS_KEY, tokenId, testCardToken(["tok", "n13", tokenId.slice(0, 8)].join("-")));
  await repository.withTransaction((client) => repository.insertCardToken(client, {
    tokenId, customerId: run.seeded.customerId, paymentProvider: "netopia", paymentEnvironment: "sandbox",
    sourceChargeId: chargeRef, sourceToolOrder: null, sourceNoticeId: null, sourcePaidAt: run.clock.now,
    tokenCiphertext: sealed.ciphertext, keyId: sealed.keyId, expMonth: 11, expYear: run.clock.now.getUTCFullYear() + 3,
    last4: "0004", cardCountry: "RO", createdAt: run.clock.now
  }));
  return tokenId;
}

const trail = async (chargeRef: string) =>
  (await repository.charge(chargeRef))!.events.map((event) => [event.kind, event.errorCode]);
const stateOf = async (run: Run) => foldSubscription(await repository.subscriptionEvents(run.seeded.subscriptionId));
const revocation = async (tokenId: string) => (await database.pool.query<{ reason: string }>(
  "SELECT reason FROM billing.card_token_revocation WHERE token_id = $1", [tokenId]
)).rows.map((row) => row.reason);

describe("N13 the card page's details and NETOPIA's 0 check (spec §2.11)", () => {
  it("pre-fills the newest details, with the tax location's country and region, for a NETOPIA plan only", async () => {
    const run = await start("n13-details");
    const response = await run.details();
    expect(response.statusCode, response.body).toBe(200);
    expect(BillingCardDetailsResponseSchema.parse(response.json())).toEqual({
      country: "RO", region: null, first_name: "Test", last_name: "Subscriber", phone: "+40712345678",
      street: "Strada Exemplu 1", city: "Bucuresti", postal_code: "010101"
    });
    await run.api.close();
    const identity = testHttpIdentity("n13-details-xmoney");
    await seedActiveSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO"
    });
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool), identity);
    const refused = await api.inject({
      method: "GET", url: "/v1/billing/subscription/card", headers: { "x-test-session": identity.rawSessionToken }
    });
    expect([refused.statusCode, refused.json().error]).toEqual([409, "NOT_SUBSCRIBED"]);
    await api.close();
  });

  it("records the agreement and the corrected details, then opens NETOPIA's check for 0", async () => {
    const run = await start("n13-start");
    const answer = await run.started();
    expect(answer).toMatchObject({ hold_amount: "0.00" });
    expect(answer.redirect_url).toBe(`https://secure-sandbox.netopia-payments.com/ui/card?p=${answer.charge_ref}`);
    expect((await repository.charge(answer.charge_ref))!).toMatchObject({
      kind: "CARD_CHECK", totalMicros: 0, quoteId: null, paymentProvider: "netopia", paymentEnvironment: "sandbox"
    });
    expect(await trail(answer.charge_ref)).toEqual([["REQUESTED", null], ["SUBMITTED", null]]);
    expect(run.payments.hosted[0]).toMatchObject({
      orderId: answer.charge_ref, amountMicros: 0, currency: "USD", language: "en", description: expect.stringContaining("card check"),
      clientId: run.seeded.customerId.replaceAll("-", ""),
      returnUrl: `${TEST_PUBLIC_APP_URL}/settings/card?charge=${answer.charge_ref}`,
      notifyUrl: `${TEST_PUBLIC_APP_URL}/api/v1/billing/netopia/notify`,
      payer: {
        firstName: "Ana", lastName: "Pop", email: EMAIL, phone: "+40722111222", country: "RO", region: null,
        street: "Strada Noua 2", city: "Cluj-Napoca", postalCode: "400001"
      }
    });
    const accepted = (await database.pool.query<{ kind: string; surface: string }>(
      "SELECT kind, surface FROM legal.acceptance WHERE owner_ref = $1", [run.identity.authenticated.ownerRef]
    )).rows;
    expect(accepted).toEqual([{ kind: "RENEWAL_TERMS", surface: "CARD_CHANGE" }]);
    const latest = (await repository.latestProfile(run.seeded.customerId))!;
    expect(openBillingProfile(TEST_RECORDS_KEY, run.seeded.customerId, latest.profileCiphertext)).toMatchObject({
      firstName: "Ana", lastName: "Pop", phone: "+40722111222", street: "Strada Noua 2", city: "Cluj-Napoca",
      postalCode: "400001", country: "RO", paymentIp: IP, email: EMAIL
    });
    // SR-30: the correction reaches the next page and NETOPIA, never the tax location.
    expect(BillingCardDetailsResponseSchema.parse((await run.details()).json())).toMatchObject({ first_name: "Ana", country: "RO" });
    expect((await stateOf(run)).cardTokenId).toBe(run.seeded.cardTokenId);
    expect(run.audit.events.map((entry) => entry.event)).toContain("billing.card.change.started");
    await run.api.close();
  });

  it("refuses a stale agreement, a phone that is not E.164, an xMoney plan, an open renewal outcome and a failed start", async () => {
    const run = await start("n13-refusals");
    const stale = await run.change({ renewal_terms: { version: "2026-01-01", sha256: "0".repeat(63) + "1" } });
    expect([stale.statusCode, stale.json().error]).toEqual([409, "LEGAL_DOCUMENT_STALE"]);
    const phone = await run.change({ phone: "0722 111 222" });
    expect([phone.statusCode, phone.json().error]).toEqual([422, "BILLING_PHONE_INVALID"]);
    expect((await run.change({ first_name: "" })).statusCode).toBe(400);
    // A renewal whose charge may have reached NETOPIA: the card does not change under it (A2, kept).
    const renewalId = newChargeId();
    await repository.withTransaction(async (client) => {
      await repository.insertCharge(client, {
        chargeId: renewalId, ownerRef: run.seeded.ownerRef, subscriptionId: run.seeded.subscriptionId, kind: "RENEWAL",
        attempt: 1, periodStart: run.seeded.periodEnd, periodEnd: new Date(run.seeded.periodEnd.getTime() + 30 * DAY),
        quoteId: run.seeded.initialQuoteId, netMicros: run.seeded.totalMicros, taxMicros: 0, totalMicros: run.seeded.totalMicros,
        currency: "USD", createdAt: run.clock.now, paymentProvider: "netopia", paymentEnvironment: "sandbox"
      });
      await repository.appendChargeEvent(client, chargeEvent(renewalId, "REQUESTED", run.clock.now, {
        providerPaymentId: null, amountMicros: run.seeded.totalMicros, errorCode: null
      }));
      await repository.appendChargeEvent(client, chargeEvent(renewalId, "SUBMIT_UNKNOWN", run.clock.now, {
        providerPaymentId: null, amountMicros: run.seeded.totalMicros, errorCode: "CHARGE_OUTCOME_UNKNOWN"
      }));
    });
    const open = await run.change();
    expect([open.statusCode, open.json().error]).toEqual([409, "CARD_CHANGE_NOT_AVAILABLE_NOW"]);
    expect(run.payments.startCalls).toBe(0);
    await run.api.close();

    const failing = await start("n13-start-fails");
    const original = failing.payments.startHostedPayment.bind(failing.payments);
    failing.payments.startHostedPayment = async (input) => {
      failing.payments.hosted.push(input);
      throw paymentError("PAYMENT_PROVIDER_UNAVAILABLE");
    };
    const down = await failing.change();
    expect([down.statusCode, down.json().error]).toEqual([503, "PAYMENT_PROVIDER_UNAVAILABLE"]);
    expect(await trail(failing.payments.hosted[0]!.orderId)).toEqual([["REQUESTED", null], ["FAILED", "PAYMENT_PROVIDER_UNAVAILABLE"]]);
    failing.payments.startHostedPayment = original;
    expect((await failing.change()).statusCode).toBe(200);
    await failing.api.close();

    const identity = testHttpIdentity("n13-xmoney");
    await seedActiveSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO"
    });
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool), identity);
    const xmoney = await api.inject({
      method: "POST", url: "/v1/billing/subscription/card", headers: { "x-test-session": identity.rawSessionToken },
      payload: { locale: "en", renewal_terms: testAgreement("en"), ...CORRECTED }
    });
    expect([xmoney.statusCode, xmoney.json().error]).toEqual([409, "NOT_SUBSCRIBED"]);
    await api.close();
  });
});

describe("N13 VERIFY_PAYMENT on a 0 card check (spec §2.11)", () => {
  it("succeeds once the card is stored: CARD_CHANGED with it, the old card revoked REPLACED, nothing refunded", async () => {
    const run = await start("n13-success");
    const answer = await run.started();
    const tokenId = await storeToken(run, answer.charge_ref);
    expect(await run.check(answer.charge_ref, "AUTHORIZED")).toEqual({ kind: "DONE" });
    expect(await trail(answer.charge_ref)).toEqual([["REQUESTED", null], ["SUBMITTED", null], ["SUCCEEDED", null]]);
    const changed = (await repository.subscriptionEvents(run.seeded.subscriptionId)).filter((event) => event.kind === "CARD_CHANGED");
    expect(changed.map((event) => [event.cardTokenId, event.data.charge_id, event.data.retry_now]))
      .toEqual([[tokenId, answer.charge_ref, false]]);
    expect((await stateOf(run)).cardTokenId).toBe(tokenId);
    expect(await revocation(run.seeded.cardTokenId)).toEqual(["REPLACED"]);
    expect(await revocation(tokenId)).toEqual([]);
    expect(chargeStatusOf((await repository.charge(answer.charge_ref))!.events)).toEqual({ state: "SUCCEEDED", reasonCode: null });
    const refunds = (await database.pool.query("SELECT 1 FROM billing.outbox WHERE ref LIKE $1 AND kind <> 'VERIFY_PAYMENT'",
      [`${answer.charge_ref}%`])).rowCount;
    expect(refunds).toBe(0);
    await run.api.close();
  });

  it("waits up to 15 minutes for the card, then fails CARD_NOT_SAVED, and never adopts a card that lands later", async () => {
    const run = await start("n13-not-saved");
    const answer = await run.started();
    const waiting = await run.check(answer.charge_ref, "AUTHORIZED");
    expect(waiting).toMatchObject({ kind: "RETRY", code: "CARD_NOT_SAVED_YET" });
    if (waiting.kind !== "RETRY" || waiting.retryAt === null) throw new Error("expected a retry with a time");
    expect(waiting.retryAt.getTime()).toBeLessThanOrEqual(run.clock.now.getTime() + 15 * MINUTE);
    expect(await trail(answer.charge_ref)).toEqual([["REQUESTED", null], ["SUBMITTED", null]]);
    run.clock.now = new Date(run.clock.now.getTime() + 16 * MINUTE);
    expect(await run.check(answer.charge_ref, "AUTHORIZED")).toEqual({ kind: "DONE" });
    expect((await trail(answer.charge_ref)).at(-1)).toEqual(["FAILED", "CARD_NOT_SAVED"]);
    expect(chargeStatusOf((await repository.charge(answer.charge_ref))!.events)).toEqual({ state: "FAILED", reasonCode: "CARD_NOT_SAVED" });
    await storeToken(run, answer.charge_ref);
    expect(await run.check(answer.charge_ref, "PAID")).toEqual({ kind: "DONE" });
    expect((await trail(answer.charge_ref)).map(([kind]) => kind)).not.toContain("SUCCEEDED");
    expect((await stateOf(run)).cardTokenId).toBe(run.seeded.cardTokenId);
    await run.api.close();
  });

  it("saves a card that arrives within the 15 minutes, and retries a plan behind on payment now", async () => {
    const run = await start("n13-late-card");
    await repository.withTransaction(async (client) => {
      const state = foldSubscription(await repository.subscriptionEvents(run.seeded.subscriptionId, client));
      await repository.appendSubscriptionEvent(client, subscriptionEvent(state, "PAST_DUE", run.clock.now, { attempt: 1 }));
    });
    const answer = await run.started();
    expect(await run.check(answer.charge_ref, "PAID")).toMatchObject({ kind: "RETRY", code: "CARD_NOT_SAVED_YET" });
    run.clock.now = new Date(run.clock.now.getTime() + 5 * MINUTE);
    const tokenId = await storeToken(run, answer.charge_ref);
    expect(await run.check(answer.charge_ref, "PAID")).toEqual({ kind: "DONE" });
    const changed = (await repository.subscriptionEvents(run.seeded.subscriptionId)).filter((event) => event.kind === "CARD_CHANGED");
    expect(changed.map((event) => [event.cardTokenId, event.data.retry_now])).toEqual([[tokenId, true]]);
    await run.api.close();
  });

  it("refuses an always-blocked country's card, defers under an open renewal, and changes nothing for a plan no longer live", async () => {
    const cases: Array<[string, (run: Run) => Promise<void>, Parameters<typeof stubPaymentReport>[2], string]> = [
      ["n13-refused", async () => undefined, { cardCountry: "RU" }, "CARD_CHECK_REFUSED"],
      ["n13-deferred", async (run) => {
        const renewalId = newChargeId();
        await repository.withTransaction(async (client) => {
          await repository.insertCharge(client, {
            chargeId: renewalId, ownerRef: run.seeded.ownerRef, subscriptionId: run.seeded.subscriptionId, kind: "RENEWAL",
            attempt: 1, periodStart: run.seeded.periodEnd, periodEnd: new Date(run.seeded.periodEnd.getTime() + 30 * DAY),
            quoteId: run.seeded.initialQuoteId, netMicros: run.seeded.totalMicros, taxMicros: 0,
            totalMicros: run.seeded.totalMicros, currency: "USD", createdAt: run.clock.now, paymentProvider: "netopia",
            paymentEnvironment: "sandbox"
          });
          await repository.appendChargeEvent(client, chargeEvent(renewalId, "REQUESTED", run.clock.now, {
            providerPaymentId: null, amountMicros: run.seeded.totalMicros, errorCode: null
          }));
        });
      }, {}, "CARD_CHECK_DEFERRED"],
      ["n13-not-live", async (run) => {
        await repository.withTransaction(async (client) => {
          const state = foldSubscription(await repository.subscriptionEvents(run.seeded.subscriptionId, client));
          await repository.appendSubscriptionEvent(client, subscriptionEvent(state, "SUSPENDED", run.clock.now, {
            charge_id: run.seeded.initialChargeId
          }));
        });
      }, {}, "CARD_CHECK_NOT_LIVE"]
    ];
    for (const [label, before, extra, reason] of cases) {
      const run = await start(label);
      const answer = await run.started();
      const tokenId = await storeToken(run, answer.charge_ref);
      await before(run);
      expect(await run.check(answer.charge_ref, "AUTHORIZED", extra), label).toEqual({ kind: "DONE" });
      const events = (await repository.charge(answer.charge_ref))!.events;
      expect(events.find((event) => event.kind === "REFUND_REQUESTED"), label).toMatchObject({ errorCode: reason, amountMicros: 0 });
      expect(chargeStatusOf(events), label).toEqual({ state: "FAILED", reasonCode: reason });
      expect(await revocation(tokenId), label).toEqual(["NOT_ADOPTED"]);
      expect((await stateOf(run)).cardTokenId, label).toBe(run.seeded.cardTokenId);
      expect((await repository.subscriptionEvents(run.seeded.subscriptionId)).some((event) => event.kind === "CARD_CHANGED"), label).toBe(false);
      await run.api.close();
    }
  });

  it("keeps a declined check retryable on NETOPIA's page and changes nothing", async () => {
    const run = await start("n13-declined");
    const answer = await run.started();
    expect(await run.check(answer.charge_ref, "DECLINED", { declineCode: "20", declineSide: "CARD", bankDeclined: true }))
      .toEqual({ kind: "DONE" });
    expect(chargeStatusOf((await repository.charge(answer.charge_ref))!.events)).toEqual({ state: "NEEDS_ACTION", reasonCode: "PAYMENT_DECLINED" });
    expect((await stateOf(run)).cardTokenId).toBe(run.seeded.cardTokenId);
    await run.api.close();
  });
});
