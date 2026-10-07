import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { BillingRepository, createPool, EntitlementRepository, migrate } from "@debateai/db";
import {
  foldSubscription,
  microsToDecimal,
  upgradeMonthCreditOverrideMicros,
  upgradeProrationMicros
} from "@debateai/billing-core";
import { XMoneyPaymentFailedError, type XMoneyClient, type XMoneyTransaction } from "@debateai/payments-xmoney";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { AdjustableTaxEngine, StubGeo, testBillingPlans } from "../support/billingFixtures.js";
import {
  mountSubscriptionRoutes,
  recordingAudit,
  seedActiveSubscription,
  subscriptionDeps
} from "../support/billingSubscriptionFixtures.js";
import { subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { createUpgradeSettlement, quoteUpgrade, startUpgrade } from "../../apps/api/src/billing/upgrade.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const DAY = 86_400_000;
type RebillOutcome =
  | "OK" | "XMONEY_PAYMENT_FAILED" | "XMONEY_OUTCOME_UNKNOWN" | "XMONEY_UNAVAILABLE" | "XMONEY_CREDENTIALS_REFUSED";

function fakeRebill(outcome: { value: RebillOutcome }) {
  const calls: Array<Parameters<XMoneyClient["rebill"]>[0]> = [];
  const declined: string[] = [];
  return {
    calls,
    declined,
    rebill: async (input: Parameters<XMoneyClient["rebill"]>[0]) => {
      calls.push(input);
      // xMoney transaction ids are digits (0086 CHECK), and one id is recorded once per kind.
      const id = `77${String(calls.length)}${String(Date.now() % 100_000)}`;
      if (outcome.value === "OK") return { transactionId: id, orderId: input.orderId };
      // P3b: a decline is XMoneyPaymentFailedError and names its transaction; a timeout, a broken connection or a
      // 5xx is XMONEY_OUTCOME_UNKNOWN; a refused connection or a 429 is XMONEY_UNAVAILABLE and a 401/403
      // XMONEY_CREDENTIALS_REFUSED (nothing processed, D5 5i).
      if (outcome.value === "XMONEY_PAYMENT_FAILED") {
        declined.push(id);
        throw new XMoneyPaymentFailedError(id, null);
      }
      throw new TypedDomainError(outcome.value, "fake xMoney");
    }
  };
}

async function start(label: string, planId: "PLUS" | "PRO" = "PLUS") {
  const identity = testHttpIdentity(label);
  const now = new Date();
  const clock = { now };
  const outcome = { value: "OK" as RebillOutcome };
  const xmoney = fakeRebill(outcome);
  const geo = new StubGeo();
  const kick = vi.fn();
  const audit = recordingAudit();
  const seeded = await seedActiveSubscription(database.pool, {
    ownerRef: identity.authenticated.ownerRef, planId, activatedAt: new Date(now.getTime() - 5 * DAY), taxCountry: "RO"
  });
  const api = await mountSubscriptionRoutes(
    subscriptionDeps(database.pool, { xmoney, geo, kick, audit, clock: () => clock.now }), identity
  );
  const headers = { "x-test-session": identity.rawSessionToken };
  const quote = (plan: string) => api.inject({
    method: "POST", url: "/v1/billing/subscription/upgrade-quote", headers, payload: { plan_id: plan }
  });
  const upgrade = (plan: string, quoteRef: string) => api.inject({
    method: "POST", url: "/v1/billing/subscription/upgrade", headers, payload: { plan_id: plan, quote_ref: quoteRef }
  });
  return { identity, now, clock, outcome, xmoney, geo, kick, audit, seeded, api, quote, upgrade };
}

const upgradeCharges = async (subscriptionId: string) =>
  (await new BillingRepository(database.pool).chargesForSubscription(subscriptionId)).filter((charge) => charge.kind === "UPGRADE");

describe("P12c upgrade on real PostgreSQL", () => {
  it("quotes the prorated difference with tax and the new plan's recurring total", async () => {
    const run = await start("p12c-quote");
    const response = await run.quote("PRO");
    expect(response.statusCode).toBe(200);
    const net = upgradeProrationMicros({
      oldNetMicros: 20_000_000, newNetMicros: 50_000_000,
      periodStart: run.seeded.periodStart, periodEnd: run.seeded.periodEnd, now: run.now
    });
    // The same fake engine the routes price with (P4's rates, RO 21 %, rounded half up to the cent).
    const tax = (await new AdjustableTaxEngine().quote({
      netMicros: net, currency: "USD", taxId: null, taxCode: "saas", date: run.now,
      location: { country: "RO", region: null, postalCode: null, city: null, street: null, ip: null }
    })).taxMicros;
    expect(response.json()).toMatchObject({
      plan_id: "PRO", net: microsToDecimal(net), tax: microsToDecimal(tax), total: microsToDecimal(net + tax),
      tax_country: "RO", tax_rate_basis_points: 2_100, recurring_total: "60.50",
      renews_on: run.seeded.periodEnd.toISOString()
    });
    const stored = await new BillingRepository(database.pool).quote(response.json().quote_ref, run.identity.authenticated.ownerRef);
    expect(stored).toMatchObject({ kind: "UPGRADE", planId: "PRO", totalMicros: net + tax, recurringTotalMicros: 60_500_000 });
    await run.api.close();
  });

  it("prorates from the price the subscriber pays, never the register's current one (Terms §12)", async () => {
    const identity = testHttpIdentity("p12c-own-price");
    const now = new Date();
    // Bought when Plus cost 18.00; the register says 20.00 today. The credit for the old plan is what was paid.
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(now.getTime() - 5 * DAY),
      taxCountry: "RO", netMicros: 18_000_000
    });
    const deps = subscriptionDeps(database.pool, { geo: new StubGeo(), clock: () => now });
    const quoted = await quoteUpgrade(deps, { ownerRef: identity.authenticated.ownerRef, planId: "PRO", ip: "192.0.2.10", now });
    const own = upgradeProrationMicros({
      oldNetMicros: 18_000_000, newNetMicros: 50_000_000,
      periodStart: seeded.periodStart, periodEnd: seeded.periodEnd, now
    });
    const registers = upgradeProrationMicros({
      oldNetMicros: 20_000_000, newNetMicros: 50_000_000,
      periodStart: seeded.periodStart, periodEnd: seeded.periodEnd, now
    });
    expect(own).toBeGreaterThan(registers);
    expect(quoted.net).toBe(microsToDecimal(own));
  });

  it("charges once per quote, records SUBMITTED, queues and kicks the verification, and changes no plan yet", async () => {
    const run = await start("p12c-ok");
    const quoteRef = (await run.quote("PRO")).json().quote_ref as string;
    const first = await run.upgrade("PRO", quoteRef);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ state: "PENDING", reason_code: null });
    const second = await run.upgrade("PRO", quoteRef);
    expect(second.json().charge_ref).toBe(first.json().charge_ref);
    const billing = new BillingRepository(database.pool);
    const stored = await billing.quote(quoteRef, run.identity.authenticated.ownerRef);
    expect(run.xmoney.calls).toEqual([{
      orderId: run.seeded.xmoneyOrderId, customerId: run.seeded.xmoneyCustomerId,
      amountDecimal: microsToDecimal(stored!.totalMicros)
    }]);
    const charge = await billing.charge(first.json().charge_ref as string);
    // The quote's own key: from its creation to the end of the period it was quoted in.
    expect(charge).toMatchObject({
      kind: "UPGRADE", ownerRef: run.identity.authenticated.ownerRef, subscriptionId: run.seeded.subscriptionId,
      attempt: 1, quoteId: quoteRef, periodStart: stored!.createdAt, periodEnd: run.seeded.periodEnd
    });
    const submitted = charge!.events.find((event) => event.kind === "SUBMITTED")!;
    expect(charge!.events.map((event) => event.kind)).toEqual(["REQUESTED", "SUBMITTED"]);
    const verify = await database.pool.query<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM billing.outbox WHERE kind='VERIFY_PAYMENT' AND ref=$1", [submitted.providerPaymentId]
    );
    expect(verify.rows).toEqual([{ payload: { charge_id: first.json().charge_ref } }]);
    expect(run.kick).toHaveBeenCalledTimes(1);
    expect(foldSubscription(await billing.subscriptionEvents(run.seeded.subscriptionId)).planId).toBe("PLUS");
    await run.api.close();
  });

  it("records a declined card as FAILED with the transaction xMoney named, and changes nothing", async () => {
    const run = await start("p12c-declined");
    run.outcome.value = "XMONEY_PAYMENT_FAILED";
    const quoteRef = (await run.quote("PRO")).json().quote_ref as string;
    const response = await run.upgrade("PRO", quoteRef);
    expect(response.json()).toMatchObject({ state: "FAILED", reason_code: "PAYMENT_DECLINED" });
    const billing = new BillingRepository(database.pool);
    expect((await billing.charge(response.json().charge_ref as string))!.events
      .map((event) => [event.kind, event.errorCode, event.providerPaymentId]))
      .toEqual([["REQUESTED", null, null], ["FAILED", "PAYMENT_DECLINED", run.xmoney.declined[0]]]);
    expect(foldSubscription(await billing.subscriptionEvents(run.seeded.subscriptionId)).planId).toBe("PLUS");
    await run.api.close();
  });

  it("never resubmits an unknown outcome and refuses a second upgrade while it is open (A2)", async () => {
    const run = await start("p12c-unknown");
    run.outcome.value = "XMONEY_OUTCOME_UNKNOWN";
    const quoteRef = (await run.quote("PRO")).json().quote_ref as string;
    const response = await run.upgrade("PRO", quoteRef);
    expect(response.json()).toMatchObject({ state: "PENDING", reason_code: null });
    expect((await run.upgrade("PRO", quoteRef)).json().charge_ref).toBe(response.json().charge_ref);
    expect(run.xmoney.calls).toHaveLength(1);
    expect((await new BillingRepository(database.pool).charge(response.json().charge_ref as string))!.events
      .map((event) => [event.kind, event.errorCode])).toEqual([["REQUESTED", null], ["SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"]]);
    run.outcome.value = "OK";
    const other = (await run.quote("MAX")).json().quote_ref as string;
    const blocked = await run.upgrade("MAX", other);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe("UPGRADE_IN_PROGRESS");
    expect(run.xmoney.calls).toHaveLength(1);
    await run.api.close();
  });

  it("keeps the charge REQUESTED when nothing reached xMoney, and never reads a refused key as a decline (D5 5i)", async () => {
    // A 429 (or a refused connection): nothing was processed, so neither SUBMIT_UNKNOWN nor FAILED is written.
    const busy = await start("p12c-unavailable");
    busy.outcome.value = "XMONEY_UNAVAILABLE";
    const quoteRef = (await busy.quote("PRO")).json().quote_ref as string;
    const unavailable = await busy.upgrade("PRO", quoteRef);
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json().error).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    const billing = new BillingRepository(database.pool);
    const [open] = await upgradeCharges(busy.seeded.subscriptionId);
    expect((await billing.charge(open!.chargeId))!.events.map((event) => event.kind)).toEqual(["REQUESTED"]);
    // The same quote answers the open charge and sends nothing: P14a's adoption pass settles it after 30 minutes.
    busy.outcome.value = "OK";
    expect((await busy.upgrade("PRO", quoteRef)).json()).toMatchObject({ charge_ref: open!.chargeId, state: "PENDING" });
    expect(busy.xmoney.calls).toHaveLength(1);
    expect(busy.audit.events.map(({ event }) => event)).not.toContain("billing.xmoney.credentials_refused");
    await busy.api.close();

    // A 401/403: xMoney refused OUR key. Not the card's fault: no FAILED, no decline code, and the operator alarm.
    const keyless = await start("p12c-key-refused");
    keyless.outcome.value = "XMONEY_CREDENTIALS_REFUSED";
    const keyQuote = (await keyless.quote("PRO")).json().quote_ref as string;
    const refused = await keyless.upgrade("PRO", keyQuote);
    expect(refused.statusCode).toBe(503);
    expect(refused.json().error).toBe("PAYMENT_PROVIDER_UNAVAILABLE");
    const [held] = await upgradeCharges(keyless.seeded.subscriptionId);
    expect((await billing.charge(held!.chargeId))!.events.map((event) => [event.kind, event.errorCode]))
      .toEqual([["REQUESTED", null]]);
    // The one operator alarm every xMoney caller writes (`credentialsRefused`, audit.ts), with its `operation` field.
    expect(keyless.audit.events).toContainEqual({ event: "billing.xmoney.credentials_refused", fields: { operation: "rebill" } });
    expect(foldSubscription(await billing.subscriptionEvents(keyless.seeded.subscriptionId)).planId).toBe("PLUS");
    await keyless.api.close();
  });

  it("refuses an upgrade of a subscription created in the other xMoney system, before any charge (D5 5h)", async () => {
    const identity = testHttpIdentity("p12c-other-system");
    const now = new Date();
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(now.getTime() - 5 * DAY),
      taxCountry: "RO", xmoneyEnvironment: "live"
    });
    const xmoney = fakeRebill({ value: "OK" });
    // The connectors talk to stage (the fixture's default); this subscription's order lives in live.
    const deps = subscriptionDeps(database.pool, { xmoney, geo: new StubGeo(), clock: () => now });
    const quoted = await quoteUpgrade(deps, { ownerRef: identity.authenticated.ownerRef, planId: "PRO", ip: "192.0.2.10", now });
    await expect(startUpgrade(deps, { ownerRef: identity.authenticated.ownerRef, planId: "PRO", quoteRef: quoted.quote_ref }))
      .rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
    expect(await upgradeCharges(seeded.subscriptionId)).toEqual([]);
    expect(xmoney.calls).toEqual([]);
  });

  it("refuses a second upgrade while the first is SUBMITTED and not yet verified", async () => {
    const run = await start("p12c-submitted");
    const first = (await run.quote("PRO")).json().quote_ref as string;
    expect((await run.upgrade("PRO", first)).json()).toMatchObject({ state: "PENDING" });
    run.clock.now = new Date(run.now.getTime() + 1_000);
    const second = (await run.quote("MAX")).json().quote_ref as string;
    const blocked = await run.upgrade("MAX", second);
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json().error).toBe("UPGRADE_IN_PROGRESS");
    expect(run.xmoney.calls).toHaveLength(1);
    await run.api.close();
  });

  it("lets a person upgrade after four declined cards: every quote is its own charge key", async () => {
    const run = await start("p12c-declines");
    run.outcome.value = "XMONEY_PAYMENT_FAILED";
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      run.clock.now = new Date(run.now.getTime() + attempt * 1_000);
      const quoteRef = (await run.quote("PRO")).json().quote_ref as string;
      expect((await run.upgrade("PRO", quoteRef)).json(), String(attempt)).toMatchObject({ state: "FAILED" });
    }
    // Two quotes made in the same millisecond share a key and count up (the first is declined too).
    run.clock.now = new Date(run.now.getTime() + 10_000);
    const twinA = (await run.quote("PRO")).json().quote_ref as string;
    const twinB = (await run.quote("PRO")).json().quote_ref as string;
    expect((await run.upgrade("PRO", twinA)).json()).toMatchObject({ state: "FAILED" });
    // The new card works.
    run.outcome.value = "OK";
    const paid = await run.upgrade("PRO", twinB);
    expect(paid.json()).toMatchObject({ state: "PENDING", reason_code: null });
    const charges = await upgradeCharges(run.seeded.subscriptionId);
    expect(charges).toHaveLength(6);
    const twins = charges.filter((charge) => charge.periodStart.getTime() === run.clock.now.getTime());
    expect(twins.map((charge) => charge.attempt).sort()).toEqual([1, 2]);
    expect(charges.every((charge) => charge.periodEnd.getTime() === run.seeded.periodEnd.getTime())).toBe(true);
    await run.api.close();
  });

  it("refuses an expired quote, a plan that is not higher, a past-due plan and a Tor connection", async () => {
    const run = await start("p12c-expired");
    const quoteRef = (await run.quote("PRO")).json().quote_ref as string;
    run.clock.now = new Date(run.now.getTime() + 31 * 60_000);
    const expired = await run.upgrade("PRO", quoteRef);
    expect(expired.statusCode).toBe(409);
    expect(expired.json().error).toBe("QUOTE_EXPIRED");
    await run.api.close();

    const pro = await start("p12c-not-higher", "PRO");
    const notHigher = await pro.quote("PRO");
    expect(notHigher.statusCode).toBe(422);
    expect(notHigher.json().error).toBe("UPGRADE_NOT_HIGHER");
    await pro.api.close();

    const pastDue = await start("p12c-past-due");
    const billing = new BillingRepository(database.pool);
    const written = await billing.subscriptionEvents(pastDue.seeded.subscriptionId);
    await billing.withTransaction((client) => billing.appendSubscriptionEvent(client,
      subscriptionEvent(foldSubscription(written), "PAST_DUE", new Date(), { attempt: 1 })));
    const refused = await pastDue.quote("PRO");
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe("NOT_SUBSCRIBED");
    await pastDue.api.close();

    const tor = await start("p12c-tor");
    tor.geo.tor = true;
    const torQuote = await tor.quote("PRO");
    expect(torQuote.statusCode).toBe(403);
    expect(torQuote.json().error).toBe("TOR_REFUSED");
    await tor.api.close();
  });

  it("applies a paid upgrade through the UPGRADE settlement: UPGRADED, the same anchor, the prorated credit", async () => {
    const run = await start("p12c-settle");
    const quoteRef = (await run.quote("PRO")).json().quote_ref as string;
    const chargeRef = (await run.upgrade("PRO", quoteRef)).json().charge_ref as string;
    const billing = new BillingRepository(database.pool);
    const entitlements = new EntitlementRepository(database.pool);
    const settlement = createUpgradeSettlement({ repository: billing, entitlements, plans: testBillingPlans });
    const charge = (await billing.charge(chargeRef))!;
    const quote = (await billing.quote(quoteRef, run.identity.authenticated.ownerRef))!;
    const transaction: XMoneyTransaction = Object.freeze({
      transactionId: charge.events.find((event) => event.kind === "SUBMITTED")!.providerPaymentId!,
      orderId: run.seeded.xmoneyOrderId, externalOrderId: run.seeded.initialChargeId,
      customerId: run.seeded.xmoneyCustomerId, cardId: run.seeded.cardRef, status: "complete-ok",
      amountDecimal: microsToDecimal(charge.totalMicros), currency: "USD", ip: null,
      transactionSource: "service-call", transactionType: "deposit", createdAt: new Date(), relatedTransactionIds: []
    });
    const at = new Date(run.now.getTime() + 60_000);
    // As P9b's VERIFY_PAYMENT calls it: inside its one transaction, the subscription folded afresh.
    const result = await billing.withTransaction(async (client) => {
      const events = await billing.subscriptionEvents(run.seeded.subscriptionId);
      return settlement.succeeded({
        client, now: at, charge, transaction, payment: null, subscription: foldSubscription(events), events, quote,
        ownerRef: run.identity.authenticated.ownerRef, customerId: run.seeded.customerId, cardCountry: "RO"
      });
    });
    expect(result).toEqual({ kind: "APPLIED" });
    expect(foldSubscription(await billing.subscriptionEvents(run.seeded.subscriptionId))).toMatchObject({
      planId: "PRO", periodAnchorAt: run.seeded.periodStart, announcedTotalMicros: 60_500_000
    });
    expect(await entitlements.current(run.identity.authenticated.ownerRef, at)).toMatchObject({
      planId: "PRO", cause: "UPGRADED", periodAnchorAt: run.seeded.periodStart, paidThrough: run.seeded.periodEnd,
      monthCreditOverrideMicros: upgradeMonthCreditOverrideMicros({
        currentMonthCreditMicros: 5_000_000, oldPlanCreditMicros: 5_000_000, newPlanCreditMicros: 20_000_000,
        periodStart: run.seeded.periodStart, periodEnd: run.seeded.periodEnd, at: quote.createdAt
      })
    });
    // Paid again for a plan it is already on (a second verification of another quote): the money goes back.
    const again = await billing.withTransaction(async (client) => {
      const events = await billing.subscriptionEvents(run.seeded.subscriptionId);
      return settlement.succeeded({
        client, now: at, charge, transaction, payment: null, subscription: foldSubscription(events), events, quote,
        ownerRef: run.identity.authenticated.ownerRef, customerId: run.seeded.customerId, cardCountry: "RO"
      });
    });
    expect(again).toEqual({ kind: "REFUND", reason: "SUBSCRIPTION_ENDED" });
    await run.api.close();
  });

  it("refunds an upgrade paid after a renewal moved the period, and writes nothing", async () => {
    const run = await start("p12c-stale");
    const quoteRef = (await run.quote("MAX")).json().quote_ref as string;
    const chargeRef = (await run.upgrade("MAX", quoteRef)).json().charge_ref as string;
    const billing = new BillingRepository(database.pool);
    const entitlements = new EntitlementRepository(database.pool);
    // The renewal went through before this payment was verified (an adopted SUBMIT_UNKNOWN can land that late).
    const renewed = foldSubscription(await billing.subscriptionEvents(run.seeded.subscriptionId));
    await billing.withTransaction((client) => billing.appendSubscriptionEvent(client,
      subscriptionEvent(renewed, "RENEWED", run.seeded.periodEnd, {})));
    const before = (await database.pool.query("SELECT 1 FROM billing.entitlement_event WHERE owner_ref=$1",
      [run.identity.authenticated.ownerRef])).rowCount;
    const charge = (await billing.charge(chargeRef))!;
    const quote = (await billing.quote(quoteRef, run.identity.authenticated.ownerRef))!;
    const transaction: XMoneyTransaction = Object.freeze({
      transactionId: charge.events.find((event) => event.kind === "SUBMITTED")!.providerPaymentId!,
      orderId: run.seeded.xmoneyOrderId, externalOrderId: run.seeded.initialChargeId,
      customerId: run.seeded.xmoneyCustomerId, cardId: run.seeded.cardRef, status: "complete-ok",
      amountDecimal: microsToDecimal(charge.totalMicros), currency: "USD", ip: null,
      transactionSource: "service-call", transactionType: "deposit", createdAt: new Date(), relatedTransactionIds: []
    });
    const settlement = createUpgradeSettlement({ repository: billing, entitlements, plans: testBillingPlans });
    const result = await billing.withTransaction(async (client) => {
      const events = await billing.subscriptionEvents(run.seeded.subscriptionId);
      return settlement.succeeded({
        client, now: new Date(run.seeded.periodEnd.getTime() + 60_000), charge, transaction, payment: null,
        subscription: foldSubscription(events), events, quote,
        ownerRef: run.identity.authenticated.ownerRef, customerId: run.seeded.customerId, cardCountry: "RO"
      });
    });
    expect(result).toEqual({ kind: "REFUND", reason: "SUBSCRIPTION_ENDED" });
    const after = await billing.subscriptionEvents(run.seeded.subscriptionId);
    expect(after.some((event) => event.kind === "UPGRADED")).toBe(false);
    expect(foldSubscription(after).planId).toBe("PLUS");
    expect((await database.pool.query("SELECT 1 FROM billing.entitlement_event WHERE owner_ref=$1",
      [run.identity.authenticated.ownerRef])).rowCount).toBe(before);
    await run.api.close();
  });

  it("completes on a pool of ONE connection: every transaction runs on the lease's own", async () => {
    const small = createPool(database.connectionString, { max: 1 });
    try {
      const identity = testHttpIdentity("p12c-small-pool");
      await seedActiveSubscription(database.pool, {
        ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO"
      });
      const deps = subscriptionDeps(small, { xmoney: fakeRebill({ value: "OK" }), geo: new StubGeo() });
      const quoted = await quoteUpgrade(deps, {
        ownerRef: identity.authenticated.ownerRef, planId: "PRO", ip: "192.0.2.10", now: new Date()
      });
      // The lease holds the only connection; a transaction or a read that asked the pool for another would wait for ever.
      expect(await startUpgrade(deps, { ownerRef: identity.authenticated.ownerRef, planId: "PRO", quoteRef: quoted.quote_ref }))
        .toMatchObject({ state: "PENDING" });
    } finally {
      await small.end();
    }
  }, 10_000);

  it("runs as many upgrades at once as the pool has connections, with no lease holder waiting for a second", async () => {
    const width = 3;
    const small = createPool(database.connectionString, { max: width });
    try {
      // Every rebill waits until all of them have arrived: all three hold a lease when they next need the database.
      let arrived = 0;
      let openBarrier: () => void = () => undefined;
      const barrier = new Promise<void>((resolve) => { openBarrier = resolve; });
      const xmoney = {
        rebill: async (input: Parameters<XMoneyClient["rebill"]>[0]) => {
          arrived += 1;
          const call = arrived;
          if (arrived === width) openBarrier();
          await barrier;
          // Digits only (0086), one id per call.
          return { transactionId: `78${String(call)}${String(Date.now() % 100_000)}`, orderId: input.orderId };
        }
      };
      const deps = subscriptionDeps(small, { xmoney, geo: new StubGeo() });
      const runs: Array<Readonly<{ ownerRef: string; quoteRef: string }>> = [];
      for (let index = 0; index < width; index += 1) {
        const ownerRef = testHttpIdentity(`p12c-parallel-${String(index)}`).authenticated.ownerRef;
        await seedActiveSubscription(database.pool, {
          ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO"
        });
        const quoted = await quoteUpgrade(deps, { ownerRef, planId: "PRO", ip: "192.0.2.10", now: new Date() });
        runs.push({ ownerRef, quoteRef: quoted.quote_ref });
      }
      // With a second connection per upgrade, three leases would fill the pool and every upgrade would wait for ever.
      const answers = await Promise.all(runs.map((run) => startUpgrade(deps, { ...run, planId: "PRO" })));
      expect(answers.map((answer) => answer.state)).toEqual(["PENDING", "PENDING", "PENDING"]);
      expect(arrived).toBe(width);
    } finally {
      await small.end();
    }
  }, 10_000);
});
