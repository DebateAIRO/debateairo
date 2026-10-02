import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingRepository, migrate } from "@debateai/db";
import { foldSubscription } from "@debateai/billing-core";
import { signOrderPayload, type XMoneyEmbeddedOrder, type XMoneyTransaction } from "@debateai/payments-xmoney";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { testCountryPolicy } from "../support/billingFixtures.js";
import {
  mountSubscriptionRoutes,
  recordingAudit,
  seedActiveSubscription,
  subscriptionDeps,
  TEST_PUBLIC_APP_URL,
  TEST_RECORDS_KEY,
  TEST_XMONEY_PRIVATE_KEY
} from "../support/billingSubscriptionFixtures.js";
import { createCardCheckSettlement } from "../../apps/api/src/billing/card-change.js";
import { subscriptionEvent } from "../../apps/api/src/billing/rows.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const DAY = 86_400_000;

async function start(label: string, overrides: Parameters<typeof subscriptionDeps>[1] = {}) {
  const identity = testHttpIdentity(label);
  const email = `${label}@example.test`;
  const deps = subscriptionDeps(database.pool, { accountEmail: { read: async () => email }, ...overrides });
  const seeded = await seedActiveSubscription(database.pool, {
    ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 3 * DAY),
    taxCountry: "RO", email
  });
  const api = await mountSubscriptionRoutes(deps, identity);
  const card = () => api.inject({
    method: "POST", url: "/v1/billing/subscription/card", headers: { "x-test-session": identity.rawSessionToken }
  });
  return { identity, email, deps, seeded, api, card };
}

function authorized(chargeId: string, customerId: string): XMoneyTransaction {
  return Object.freeze({
    transactionId: `88${String(Date.now() % 1_000_000)}`, orderId: "4800123", externalOrderId: chargeId, customerId,
    cardId: "5500123", status: "complete-ok", amountDecimal: "1.00", currency: "USD", ip: null,
    transactionSource: "service-call", transactionType: "deposit", createdAt: new Date(), relatedTransactionIds: []
  });
}

/** As P9b's VERIFY_PAYMENT calls the settlement: in one transaction, the subscription folded afresh. */
async function settle(run: Awaited<ReturnType<typeof start>>, chargeRef: string, cardCountry: string) {
  const billing = new BillingRepository(database.pool);
  const charge = (await billing.charge(chargeRef))!;
  const settlement = createCardCheckSettlement({
    repository: billing, recordsKey: TEST_RECORDS_KEY, countryPolicy: testCountryPolicy, audit: recordingAudit()
  });
  return billing.withTransaction(async (client) => {
    const events = await billing.subscriptionEvents(run.seeded.subscriptionId);
    return settlement.succeeded({
      client, now: new Date(), charge, transaction: authorized(chargeRef, run.seeded.xmoneyCustomerId),
      subscription: foldSubscription(events), events, quote: null, ownerRef: run.identity.authenticated.ownerRef,
      customerId: run.seeded.customerId, cardCountry
    });
  });
}

async function append(subscriptionId: string, kind: "PAST_DUE" | "SUSPENDED") {
  const billing = new BillingRepository(database.pool);
  const state = foldSubscription(await billing.subscriptionEvents(subscriptionId));
  await billing.withTransaction((client) => billing.appendSubscriptionEvent(client,
    subscriptionEvent(state, kind, new Date(), kind === "PAST_DUE" ? { attempt: 1 } : { charge_id: "0".repeat(32) })));
}

describe("P12e the card change on real PostgreSQL", () => {
  it("signs a managed 1.00 USD authorization for the dedicated card page and records the CARD_CHECK charge", async () => {
    const run = await start("p12e-start");
    const response = await run.card();
    expect(response.statusCode).toBe(200);
    const body = response.json();
    // `hold_amount` is the amount of the order just signed: the card page names it before "Save card".
    expect(body).toMatchObject({ public_key: "pk_test_p12", sdk_environment: "stage", hold_amount: "1.00" });
    expect(body.charge_ref).toMatch(/^[0-9a-f]{32}$/);
    const order = JSON.parse(Buffer.from(body.order_payload, "base64").toString("utf8")) as XMoneyEmbeddedOrder;
    expect(order).toMatchObject({
      siteId: "site-p12", cardTransactionMode: "auth", saveCard: true,
      backUrl: `${TEST_PUBLIC_APP_URL}/settings/card?charge=${body.charge_ref}`,
      customer: { identifier: run.seeded.customerId, email: run.email, country: "RO" },
      order: { orderId: body.charge_ref, type: "managed", amount: "1.00", currency: "USD" }
    });
    expect(body.order_checksum).toBe(signOrderPayload(order, TEST_XMONEY_PRIVATE_KEY).checksum);
    // P8c words the order line for the card check in the person's locale (English here, `orderText`'s fallback).
    expect(order.order.description).toBe("DebateAI card check");
    const charge = await new BillingRepository(database.pool).charge(body.charge_ref);
    expect(charge).toMatchObject({
      kind: "CARD_CHECK", totalMicros: 1_000_000, taxMicros: 0, quoteId: null, attempt: 1, xmoneyEnvironment: "stage"
    });
    expect(charge!.events.map((event) => event.kind)).toEqual(["REQUESTED"]);
    // A second card change in the same period is its own row (its own day), never an attempt counter.
    expect((await run.card()).statusCode).toBe(200);
    await run.api.close();
  });

  it("moves the order and the card, then asks RefundDesk to release the hold", async () => {
    const run = await start("p12e-changed");
    const ref = (await run.card()).json().charge_ref as string;
    expect(await settle(run, ref, "RO")).toEqual({ kind: "REFUND", reason: "CARD_CHECK_RELEASE" });
    const events = await new BillingRepository(database.pool).subscriptionEvents(run.seeded.subscriptionId);
    expect(events.at(-1)).toMatchObject({
      kind: "CARD_CHANGED", xmoneyOrderId: "4800123", cardRef: "5500123", data: { charge_id: ref, retry_now: false }
    });
    expect(foldSubscription(events)).toMatchObject({ xmoneyOrderId: "4800123", cardRef: "5500123", status: "ACTIVE" });
    await run.api.close();
  });

  it("refuses a card from an always-blocked country: no change, the hold goes back as a refused card check", async () => {
    const run = await start("p12e-blocked");
    const ref = (await run.card()).json().charge_ref as string;
    expect(await settle(run, ref, "RU")).toEqual({ kind: "REFUND", reason: "CARD_CHECK_REFUSED" });
    const events = await new BillingRepository(database.pool).subscriptionEvents(run.seeded.subscriptionId);
    expect(events.some((event) => event.kind === "CARD_CHANGED")).toBe(false);
    expect(foldSubscription(events)).toMatchObject({ status: "ACTIVE", cardRef: run.seeded.cardRef });
    await run.api.close();
  });

  it("asks for an immediate retry when the card changes while PAST_DUE", async () => {
    const run = await start("p12e-past-due");
    await append(run.seeded.subscriptionId, "PAST_DUE");
    const ref = (await run.card()).json().charge_ref as string;
    expect(await settle(run, ref, "RO")).toEqual({ kind: "REFUND", reason: "CARD_CHECK_RELEASE" });
    expect((await new BillingRepository(database.pool).subscriptionEvents(run.seeded.subscriptionId)).at(-1)).toMatchObject({
      kind: "CARD_CHANGED", data: { retry_now: true }
    });
    await run.api.close();
  });

  it("releases the hold without a change once the subscription is no longer live, as a card check that changed nothing", async () => {
    const run = await start("p12e-gone");
    const ref = (await run.card()).json().charge_ref as string;
    await append(run.seeded.subscriptionId, "SUSPENDED");
    // P20: never CARD_CHECK_RELEASE here, which reads SUCCEEDED ("Your new card is saved.") for a card that was not.
    expect(await settle(run, ref, "RO")).toEqual({ kind: "REFUND", reason: "CARD_CHECK_NOT_LIVE" });
    expect((await new BillingRepository(database.pool).subscriptionEvents(run.seeded.subscriptionId)).at(-1)?.kind)
      .toBe("SUSPENDED");
    await run.api.close();
  });

  it("refuses while suspended and while the Terms must be accepted again", async () => {
    const suspended = await start("p12e-suspended");
    await append(suspended.seeded.subscriptionId, "SUSPENDED");
    const refused = await suspended.card();
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe("NOT_SUBSCRIBED");
    await suspended.api.close();
    const stale = await start("p12e-legal", { legal: { requiresReacceptance: async () => true } });
    const legal = await stale.card();
    expect(legal.statusCode).toBe(403);
    expect(legal.json().error).toBe("LEGAL_REACCEPTANCE_REQUIRED");
    await stale.api.close();
  });

  it("refuses a subscription created in the other xMoney system, and writes no charge (D5 5h)", async () => {
    const identity = testHttpIdentity("p12e-other-system");
    const email = "p12e-other-system@example.test";
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: identity.authenticated.ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 3 * DAY),
      taxCountry: "RO", email, xmoneyEnvironment: "live"
    });
    // The fixture's connectors (and checkout) talk to stage.
    const api = await mountSubscriptionRoutes(subscriptionDeps(database.pool, { accountEmail: { read: async () => email } }), identity);
    const refused = await api.inject({
      method: "POST", url: "/v1/billing/subscription/card", headers: { "x-test-session": identity.rawSessionToken }
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe("NOT_SUBSCRIBED");
    const charges = await new BillingRepository(database.pool).chargesForSubscription(seeded.subscriptionId);
    expect(charges.filter((charge) => charge.kind === "CARD_CHECK")).toEqual([]);
    await api.close();
  });
});
