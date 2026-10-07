import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BillingJobQueries,
  BillingRepository,
  EntitlementRepository,
  migrate,
  type ChargeRow,
  type CustomerXMoneyEnvironment,
  type DueRenewalCursor,
  type OutboxKind,
  type TaxSummaryRow
} from "@debateai/db";
import { openRecord, sealRecord } from "@debateai/crypto";
import type { SubscriptionEvent } from "@debateai/billing-core";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { createBillingTestAccount, eraseBillingTestAccount } from "../support/billingAccountFixture.js";
import { seedNetopiaSubscription } from "../support/billingSubscriptionFixtures.js";

let database: TestDatabase;
let billing: BillingRepository;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  billing = new BillingRepository(database.pool);
}, 600_000);
afterAll(async () => { await database?.stop(); });

const recordsKey = randomBytes(32);
const chargeIdOf = (): string => randomUUID().replaceAll("-", "");
const anchor = new Date("2026-10-01T09:00:00.000Z");

function subscriptionEvent(
  subscriptionId: string, ownerRef: string, kind: SubscriptionEvent["kind"],
  overrides: Partial<SubscriptionEvent> = {}
): SubscriptionEvent {
  return {
    eventId: randomUUID(), subscriptionId, ownerRef, kind, at: anchor, planId: "PLUS", periodAnchorAt: null,
    xmoneyOrderId: null, xmoneyCustomerId: null, cardRef: null, cardTokenId: null,
    data: kind === "CREATED" ? { xmoney_environment: "stage" } : {}, ...overrides
  };
}

async function activeSubscription(ownerRef: string, at = anchor, system: CustomerXMoneyEnvironment = "stage"): Promise<string> {
  const subscriptionId = randomUUID();
  await billing.withTransaction(async (c) => {
    await billing.appendSubscriptionEvent(c, subscriptionEvent(subscriptionId, ownerRef, "CREATED", {
      at, data: { xmoney_environment: system }
    }));
    await billing.appendSubscriptionEvent(c, subscriptionEvent(subscriptionId, ownerRef, "ACTIVATED", {
      at, periodAnchorAt: at, xmoneyOrderId: "4711", cardRef: "77", data: { announced_total_micros: 24_200_000 }
    }));
  });
  return subscriptionId;
}

async function quoteAndCharge(
  ownerRef: string, subscriptionId: string, kind: ChargeRow["kind"] = "INITIAL", periodStart = anchor,
  system: CustomerXMoneyEnvironment = "stage"
): Promise<ChargeRow> {
  const quoteId = randomUUID();
  const now = new Date();
  const location = sealRecord(recordsKey, { table: "billing.quote", column: "location_ciphertext", rowId: quoteId },
    Buffer.from(JSON.stringify({ country: "RO" })));
  const charge: ChargeRow = {
    chargeId: chargeIdOf(), ownerRef, subscriptionId, kind, attempt: 1, periodStart,
    periodEnd: new Date(periodStart.getTime() + 30 * 86_400_000), quoteId, netMicros: 20_000_000,
    taxMicros: 4_200_000, totalMicros: 24_200_000, currency: "USD", createdAt: now, paymentProvider: "xmoney", paymentEnvironment: system
  };
  await billing.withTransaction(async (c) => {
    await billing.insertQuote(c, {
      quoteId, ownerRef, planId: "PLUS", kind: kind === "RENEWAL" ? "RENEWAL" : "SUBSCRIBE",
      netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: 24_200_000, taxCountry: "RO", taxRegion: null,
      taxRateBasisPoints: 2100, taxStatus: "TAXABLE", taxName: "VAT", quadernoRef: null, createdAt: now,
      expiresAt: new Date(now.getTime() + 1_800_000), locationCiphertext: location.ciphertext, keyId: location.keyId,
      recurringTotalMicros: null
    });
    await billing.insertCharge(c, charge);
  });
  return charge;
}

/** Written around the repository on purpose: the history a bug or a race could leave behind. */
async function rawSubscriptionEvent(
  subscriptionId: string, ownerRef: string, kind: string, data: Readonly<Record<string, unknown>>,
  extra: Readonly<{ periodAnchorAt?: Date; xmoneyOrderId?: string }> = {}
): Promise<void> {
  await database.pool.query(`
    INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id, period_anchor_at,
      xmoney_order_id, data)
    VALUES ($1, $2, $3, $4, $5, 'PLUS', $6, $7, $8::jsonb)
  `, [randomUUID(), subscriptionId, ownerRef, kind, anchor, extra.periodAnchorAt ?? null, extra.xmoneyOrderId ?? null,
    JSON.stringify(data)]);
}

describe("P1b — customers and profiles", () => {
  it("creates one customer per owner, even under concurrency, and links the xMoney id", async () => {
    const ownerRef = randomUUID();
    const [left, right] = await Promise.all([
      billing.withTransaction((c) => billing.ensureCustomer(c, { ownerRef, locale: "ro", now: new Date(), environment: "stage" })),
      billing.withTransaction((c) => billing.ensureCustomer(c, { ownerRef, locale: "ro", now: new Date(), environment: "stage" }))
    ]);
    expect(left.customerId).toBe(right.customerId);
    expect(left.xmoneyCustomerId).toBeNull();
    await billing.withTransaction((c) => billing.setXMoneyCustomerId(c, left.customerId, "5501", "stage"));
    await billing.withTransaction((c) => billing.setXMoneyCustomerId(c, left.customerId, "5501", "stage"));
    expect(await billing.customerByOwner(ownerRef, "stage")).toEqual({ customerId: left.customerId, xmoneyCustomerId: "5501", locale: "ro" });
    expect(await billing.customerByOwner(randomUUID())).toBeNull();
  });

  it("has no xMoney customer in live after stage, and keeps each environment's own (R-14)", async () => {
    const ownerRef = randomUUID();
    const staged = await billing.withTransaction(async (c) => {
      const customer = await billing.ensureCustomer(c, { ownerRef, locale: "en", now: new Date(), environment: "stage" });
      await billing.setXMoneyCustomerId(c, customer.customerId, "5601", "stage");
      return customer;
    });
    const live = await billing.withTransaction((c) => billing.ensureCustomer(c, { ownerRef, locale: "en", now: new Date(), environment: "live" }));
    expect(live).toEqual({ customerId: staged.customerId, xmoneyCustomerId: null });
    await billing.withTransaction((c) => billing.setXMoneyCustomerId(c, staged.customerId, "9601", "live"));
    const again = await billing.withTransaction((c) => billing.ensureCustomer(c, { ownerRef, locale: "en", now: new Date(), environment: "stage" }));
    expect(again.xmoneyCustomerId).toBe("5601");
    expect((await billing.customerByOwner(ownerRef, "live"))?.xmoneyCustomerId).toBe("9601");
    expect((await billing.customerByOwner(ownerRef, "stage"))?.xmoneyCustomerId).toBe("5601");
    expect((await billing.customerByOwner(ownerRef))?.xmoneyCustomerId).toBe("9601");
  });

  it("keeps the latest profile and its locale, readable with the records key", async () => {
    const ownerRef = randomUUID();
    const { customerId } = await billing.withTransaction((c) => billing.ensureCustomer(c, { ownerRef, locale: "en", now: new Date(), environment: "stage" }));
    const aad = { table: "billing.customer_profile_event", column: "profile_ciphertext", rowId: customerId };
    for (const [name, locale] of [["First", "en"], ["Second", "de"]] as const) {
      const sealed = sealRecord(recordsKey, aad, Buffer.from(JSON.stringify({ name })));
      await billing.withTransaction((c) => billing.appendProfile(c, {
        customerId, at: new Date(), locale, profileCiphertext: sealed.ciphertext, keyId: sealed.keyId
      }));
    }
    const latest = await billing.latestProfile(customerId);
    expect(latest?.locale).toBe("de");
    expect(JSON.parse(openRecord(recordsKey, aad, latest!.profileCiphertext).toString("utf8"))).toEqual({ name: "Second" });
    expect((await billing.customerByOwner(ownerRef))?.locale).toBe("de");
  });
});

describe("P1b — quotes, subscriptions and charges", () => {
  it("reads a quote only for its owner and spends it once", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    const charge = await quoteAndCharge(ownerRef, subscriptionId);
    expect((await billing.quote(charge.quoteId!, ownerRef))?.taxRateBasisPoints).toBe(2100);
    expect(await billing.quote(charge.quoteId!, randomUUID())).toBeNull();
    const first = await billing.withTransaction((c) => billing.useQuote(c, { quoteId: charge.quoteId!, usedAt: new Date(), chargeId: charge.chargeId }));
    const second = await billing.withTransaction((c) => billing.useQuote(c, { quoteId: charge.quoteId!, usedAt: new Date(), chargeId: charge.chargeId }));
    expect([first, second]).toEqual(["USED", "ALREADY_USED"]);
  });

  it("folds the owner's subscription and finds renewals that are due", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    const state = await billing.subscriptionForOwner(ownerRef);
    expect(state).toMatchObject({ subscriptionId, status: "ACTIVE", planId: "PLUS", paymentProvider: "xmoney", paymentEnvironment: "stage" });
    const periodEnd = state!.currentPeriodEnd!;
    const stage = { provider: "xmoney", environment: "stage" } as const;
    const beforeHorizon = await billing.dueRenewals(new Date(periodEnd.getTime() - 3_600_000), 300_000, 500, stage);
    expect(beforeHorizon.some((due) => due.subscriptionId === subscriptionId)).toBe(false);
    const due = await billing.dueRenewals(new Date(periodEnd.getTime() - 60_000), 300_000, 500, stage);
    expect(due.some((row) => row.subscriptionId === subscriptionId)).toBe(true);
    await quoteAndCharge(ownerRef, subscriptionId, "RENEWAL", periodEnd);
    const afterCharge = await billing.dueRenewals(new Date(periodEnd.getTime() - 60_000), 300_000, 500, stage);
    expect(afterCharge.some((row) => row.subscriptionId === subscriptionId)).toBe(false);
  });

  it("prefers a live subscription over a newer ended one", async () => {
    const ownerRef = randomUUID();
    const live = await activeSubscription(ownerRef);
    const abandoned = randomUUID();
    await billing.withTransaction(async (c) => {
      await billing.appendSubscriptionEvent(c, subscriptionEvent(abandoned, ownerRef, "CREATED"));
      await billing.appendSubscriptionEvent(c, subscriptionEvent(abandoned, ownerRef, "ENDED", { data: { cause: "ABANDONED" } }));
    });
    expect((await billing.subscriptionForOwner(ownerRef))?.subscriptionId).toBe(live);
    expect(await billing.subscriptionForOwner(randomUUID())).toBeNull();
  });

  it("reads every subscription of an owner, newest first, so a newer checkout never hides a paid one (D6a's P9b)", async () => {
    const ownerRef = randomUUID();
    const paid = await activeSubscription(ownerRef);
    const checkout = randomUUID();
    await billing.withTransaction((c) => billing.appendSubscriptionEvent(c, subscriptionEvent(checkout, ownerRef, "CREATED")));
    expect((await billing.subscriptionsForOwner(ownerRef)).map((state) => [state.subscriptionId, state.status]))
      .toEqual([[checkout, "CREATED"], [paid, "ACTIVE"]]);
    // The one-subscription read answers the newer live one — the CREATED checkout — which is why P9b needs the list.
    expect((await billing.subscriptionForOwner(ownerRef))?.subscriptionId).toBe(checkout);
    expect(await billing.subscriptionsForOwner(randomUUID())).toEqual([]);
  });

  it("reads through the caller's transaction when handed its client, uncommitted rows included (D6b)", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = randomUUID();
    const quoteId = randomUUID();
    const chargeId = chargeIdOf();
    await billing.withTransaction(async (c) => {
      const now = new Date();
      const { customerId } = await billing.ensureCustomer(c, { ownerRef, locale: "ro", now, environment: "stage" });
      await billing.setXMoneyCustomerId(c, customerId, "5701", "stage");
      const profile = sealRecord(recordsKey, { table: "billing.customer_profile_event", column: "profile_ciphertext", rowId: customerId },
        Buffer.from(JSON.stringify({ name: "Not committed yet" })));
      await billing.appendProfile(c, { customerId, at: now, locale: "ro", profileCiphertext: profile.ciphertext, keyId: profile.keyId });
      await billing.appendSubscriptionEvent(c, subscriptionEvent(subscriptionId, ownerRef, "CREATED"));
      const location = sealRecord(recordsKey, { table: "billing.quote", column: "location_ciphertext", rowId: quoteId },
        Buffer.from(JSON.stringify({ country: "RO" })));
      await billing.insertQuote(c, {
        quoteId, ownerRef, planId: "PLUS", kind: "SUBSCRIBE", netMicros: 20_000_000, taxMicros: 4_200_000,
        totalMicros: 24_200_000, taxCountry: "RO", taxRegion: null, taxRateBasisPoints: 2100, taxStatus: "TAXABLE",
        taxName: "VAT", quadernoRef: null, createdAt: now, expiresAt: new Date(now.getTime() + 1_800_000),
        locationCiphertext: location.ciphertext, keyId: location.keyId, recurringTotalMicros: null
      });
      await billing.insertCharge(c, {
        chargeId, ownerRef, subscriptionId, kind: "INITIAL", attempt: 1, periodStart: anchor,
        periodEnd: new Date(anchor.getTime() + 30 * 86_400_000), quoteId, netMicros: 20_000_000, taxMicros: 4_200_000,
        totalMicros: 24_200_000, currency: "USD", createdAt: now, paymentProvider: "xmoney", paymentEnvironment: "stage"
      });
      await billing.appendChargeEvent(c, { chargeId, kind: "REQUESTED", at: now, providerPaymentId: null, amountMicros: null, errorCode: null });
      // Through the transaction's client: everything above is there.
      expect((await billing.customerByOwner(ownerRef, "stage", c))?.xmoneyCustomerId).toBe("5701");
      expect((await billing.latestProfile(customerId, c))?.locale).toBe("ro");
      expect((await billing.quote(quoteId, ownerRef, c))?.quoteId).toBe(quoteId);
      expect((await billing.subscriptionEvents(subscriptionId, c)).map((event) => event.kind)).toEqual(["CREATED"]);
      expect((await billing.subscriptionForOwner(ownerRef, c))?.subscriptionId).toBe(subscriptionId);
      expect((await billing.subscriptionsForOwner(ownerRef, c)).map((state) => state.subscriptionId)).toEqual([subscriptionId]);
      expect((await billing.chargesForSubscription(subscriptionId, c)).map((row) => row.chargeId)).toEqual([chargeId]);
      expect((await billing.charge(chargeId, c))?.events.map((event) => event.kind)).toEqual(["REQUESTED"]);
      // Through the pool (the default): nothing of it is committed yet.
      expect(await billing.customerByOwner(ownerRef, "stage")).toBeNull();
      expect(await billing.latestProfile(customerId)).toBeNull();
      expect(await billing.quote(quoteId, ownerRef)).toBeNull();
      expect(await billing.subscriptionEvents(subscriptionId)).toEqual([]);
      expect(await billing.subscriptionForOwner(ownerRef)).toBeNull();
      expect(await billing.subscriptionsForOwner(ownerRef)).toEqual([]);
      expect(await billing.chargesForSubscription(subscriptionId)).toEqual([]);
      expect(await billing.charge(chargeId)).toBeNull();
    });
    // Committed now: the default pool reads see it too.
    expect((await billing.charge(chargeId))?.events.map((event) => event.kind)).toEqual(["REQUESTED"]);
  });

  it("types duplicates and refuses a second charge for the same attempt", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    const charge = await quoteAndCharge(ownerRef, subscriptionId);
    await expect(billing.withTransaction((c) => billing.insertCharge(c, { ...charge, chargeId: chargeIdOf() })))
      .rejects.toMatchObject({ code: "BILLING_CHARGE_DUPLICATE" });
    const succeeded = { eventId: randomUUID(), chargeId: charge.chargeId, kind: "SUCCEEDED" as const, at: new Date(),
      providerPaymentId: "9001", amountMicros: 24_200_000, errorCode: null };
    expect(await billing.withTransaction((c) => billing.appendChargeEvent(c, succeeded))).toBe("INSERTED");
    expect(await billing.withTransaction((c) => billing.appendChargeEvent(c, { ...succeeded, eventId: randomUUID() }))).toBe("DUPLICATE");
    await expect(billing.withTransaction((c) => billing.appendChargeEvent(c, {
      eventId: randomUUID(), chargeId: charge.chargeId, kind: "REFUND_REQUESTED", at: new Date(),
      providerPaymentId: "9001", amountMicros: 30_000_000, errorCode: null
    }))).rejects.toMatchObject({ code: "REFUND_EXCEEDS_CHARGE" });
    await expect(billing.withTransaction((c) => billing.appendChargeEvent(c, { ...succeeded, chargeId: chargeIdOf() })))
      .rejects.toMatchObject({ code: "BILLING_CHARGE_UNKNOWN" });
    const read = await billing.charge(charge.chargeId);
    expect(read?.events.map((event) => event.kind)).toEqual(["SUCCEEDED"]);
    expect(read?.events[0]).toMatchObject({ paymentProvider: "xmoney", paymentEnvironment: "stage", refundsTransactionId: null });
    expect(read?.totalMicros).toBe(24_200_000);
    expect((await billing.chargesForSubscription(subscriptionId)).map((row) => row.chargeId)).toEqual([charge.chargeId]);
  });

  it("tells a replayed payment from a second payment, and refunds the second one in full (DUPLICATE_PAYMENT)", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    const charge = await quoteAndCharge(ownerRef, subscriptionId);
    const record = (kind: "SUCCEEDED" | "DUPLICATE_PAYMENT" | "REFUND_REQUESTED", transactionId: string) =>
      billing.withTransaction((c) => billing.appendChargeEvent(c, {
        chargeId: charge.chargeId, kind, at: new Date(), providerPaymentId: transactionId, amountMicros: 24_200_000,
        errorCode: kind === "REFUND_REQUESTED" ? "DUPLICATE_PAYMENT" : null
      }));
    expect(await record("SUCCEEDED", "63001")).toBe("INSERTED");
    // A second SUCCEEDED from ANOTHER transaction is refused by the one-success index: the answer alone cannot tell
    // it from a replay, so the caller asks which payment is recorded.
    expect(await record("SUCCEEDED", "63002")).toBe("DUPLICATE");
    expect(await billing.withTransaction((c) => billing.succeededTransaction(c, charge.chargeId))).toBe("63001");
    expect(await billing.withTransaction((c) => billing.succeededTransaction(c, chargeIdOf()))).toBeNull();
    expect(await record("DUPLICATE_PAYMENT", "63002")).toBe("INSERTED");
    // The second payment goes back in full; a withdrawal of the first still fits.
    expect(await record("REFUND_REQUESTED", "63002")).toBe("INSERTED");
    expect(await record("REFUND_REQUESTED", "63001")).toBe("INSERTED");
    expect((await billing.charge(charge.chargeId))?.events.map((event) => event.kind))
      .toEqual(["SUCCEEDED", "DUPLICATE_PAYMENT", "REFUND_REQUESTED", "REFUND_REQUESTED"]);
  });

  it("records a live payment whose transaction number a stage payment already used", async () => {
    const stageOwner = randomUUID();
    const stageCharge = await quoteAndCharge(stageOwner, await activeSubscription(stageOwner));
    const liveOwner = randomUUID();
    const liveCharge = await quoteAndCharge(liveOwner, await activeSubscription(liveOwner, anchor, "live"), "INITIAL", anchor, "live");
    const pay = (chargeId: string) => billing.withTransaction((c) => billing.appendChargeEvent(c, {
      chargeId, kind: "SUCCEEDED", at: new Date(), providerPaymentId: "62001", amountMicros: 24_200_000, errorCode: null
    }));
    expect(await pay(stageCharge.chargeId)).toBe("INSERTED");
    expect(await pay(liveCharge.chargeId)).toBe("INSERTED");
    expect((await billing.charge(liveCharge.chargeId))?.events[0]?.paymentEnvironment).toBe("live");
  });
});

describe("P1b — one broken history never stops the renewals of everyone else", () => {
  it("leaves a subscription whose history does not fold out, reports it once, and still renews the rest", async () => {
    const healthyOwner = randomUUID();
    const healthy = await activeSubscription(healthyOwner);
    const poisonedOwner = randomUUID();
    const poisoned = randomUUID();
    await rawSubscriptionEvent(poisoned, poisonedOwner, "CREATED", { xmoney_environment: "stage" });
    await rawSubscriptionEvent(poisoned, poisonedOwner, "ACTIVATED", { announced_total_micros: 24_200_000 },
      { periodAnchorAt: anchor, xmoneyOrderId: "4711" });
    await rawSubscriptionEvent(poisoned, poisonedOwner, "WITHDRAWN", {});
    await rawSubscriptionEvent(poisoned, poisonedOwner, "RENEWAL_POSTPONED", { until: "2026-11-10T09:00:00.000Z" });
    const periodEnd = (await billing.subscriptionForOwner(healthyOwner))!.currentPeriodEnd!;
    const edge = new Date(periodEnd.getTime() - 60_000);
    const invalid: string[] = [];
    const due = await billing.dueRenewals(edge, 300_000, 500, {
      provider: "xmoney", environment: "stage", onInvalid: (subscriptionId) => invalid.push(subscriptionId)
    });
    expect(due.some((state) => state.subscriptionId === healthy)).toBe(true);
    expect(invalid.filter((subscriptionId) => subscriptionId === poisoned)).toHaveLength(1);
    // The broken one takes no limit slot.
    expect((await billing.dueRenewals(edge, 300_000, due.length, { provider: "xmoney", environment: "stage" })).map((state) => state.subscriptionId)).toEqual(due.map((state) => state.subscriptionId));
    // A read for that one owner still fails closed.
    await expect(billing.subscriptionForOwner(poisonedOwner)).rejects.toMatchObject({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" });
  });

  it("refuses to append an event the history cannot take, and writes nothing", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    await billing.withTransaction((c) => billing.appendSubscriptionEvent(c, subscriptionEvent(subscriptionId, ownerRef, "SUSPENDED")));
    await expect(billing.withTransaction((c) => billing.appendSubscriptionEvent(c, subscriptionEvent(
      subscriptionId, ownerRef, "RENEWAL_POSTPONED", { data: { until: "2026-11-10T09:00:00.000Z" } }
    )))).rejects.toMatchObject({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" });
    expect((await billing.subscriptionEvents(subscriptionId)).map((event) => event.kind)).toEqual(["CREATED", "ACTIVATED", "SUSPENDED"]);
  });

  it("checks several events of one transaction together (the history is read through the caller's transaction)", async () => {
    const ownerRef = randomUUID();
    // activeSubscription appends CREATED then ACTIVATED in ONE transaction: the second is folded after the first.
    const subscriptionId = await activeSubscription(ownerRef);
    await billing.withTransaction(async (c) => {
      await billing.appendSubscriptionEvent(c, subscriptionEvent(subscriptionId, ownerRef, "UPGRADED", {
        planId: "PRO", data: { announced_total_micros: 60_500_000 }
      }));
      await billing.appendSubscriptionEvent(c, subscriptionEvent(subscriptionId, ownerRef, "DOWNGRADE_SCHEDULED", {
        data: { announced_total_micros: 24_200_000 }
      }));
    });
    // DOWNGRADED then RENEWED at the lower plan, together: RENEWED is legal only after the uncommitted DOWNGRADED.
    await billing.withTransaction(async (c) => {
      await billing.appendSubscriptionEvent(c, subscriptionEvent(subscriptionId, ownerRef, "DOWNGRADED"));
      await billing.appendSubscriptionEvent(c, subscriptionEvent(subscriptionId, ownerRef, "RENEWED"));
    });
    expect(await billing.subscriptionForOwner(ownerRef)).toMatchObject({ planId: "PLUS", scheduledDowngradePlanId: null });
  });

  it("pages the due renewals by (period end, subscription), so a stuck head can never starve the rest", async () => {
    for (let index = 0; index < 3; index += 1) await activeSubscription(randomUUID(), new Date(anchor.getTime() - index * 60_000));
    const now = new Date(anchor.getTime() + 40 * 86_400_000);
    const stage = { provider: "xmoney", environment: "stage" } as const;
    const all = await billing.dueRenewals(now, 0, 10_000, stage);
    expect(all.length).toBeGreaterThanOrEqual(3);
    const paged: string[] = [];
    let after: DueRenewalCursor | null = null;
    for (;;) {
      const page = await billing.dueRenewals(now, 0, 2, { ...stage, after });
      paged.push(...page.map((state) => state.subscriptionId));
      if (page.length < 2) break;
      const last = page[page.length - 1]!;
      after = { periodEnd: last.currentPeriodEnd!, subscriptionId: last.subscriptionId };
    }
    expect(paged).toEqual(all.map((state) => state.subscriptionId));
  });

  it("renews each xMoney system's subscriptions only there, and counts its open records as another payment system's", async () => {
    // The seeded xMoney live rows are another system to a NETOPIA sandbox deployment, so its view counts them.
    const otherSystem = { paymentProvider: "netopia", paymentEnvironment: "sandbox" } as const;
    const before = await billing.openOtherSystemRecordCounts(otherSystem);
    const ownerRef = randomUUID();
    const live = await activeSubscription(ownerRef, anchor, "live");
    const now = new Date(anchor.getTime() + 40 * 86_400_000);
    const liveDue = await billing.dueRenewals(now, 0, 10_000, { provider: "xmoney", environment: "live" });
    expect(liveDue.map((state) => state.subscriptionId)).toContain(live);
    expect(liveDue.every((state) => state.paymentProvider === "xmoney" && state.paymentEnvironment === "live")).toBe(true);
    expect((await billing.dueRenewals(now, 0, 10_000, { provider: "xmoney", environment: "stage" })).map((state) => state.subscriptionId))
      .not.toContain(live);
    expect(await billing.openOtherSystemRecordCounts(otherSystem)).toEqual({ ...before, subscriptions: before.subscriptions + 1 });
    const charge = await quoteAndCharge(ownerRef, live, "INITIAL", anchor, "live");
    expect((await billing.openOtherSystemRecordCounts(otherSystem)).charges).toBe(before.charges + 1);
    await billing.withTransaction((c) => billing.appendChargeEvent(c, {
      chargeId: charge.chargeId, kind: "SUCCEEDED", at: new Date(), providerPaymentId: "61001", amountMicros: 24_200_000, errorCode: null
    }));
    await billing.withTransaction((c) => billing.appendSubscriptionEvent(c, subscriptionEvent(live, ownerRef, "CANCEL_REQUESTED")));
    expect(await billing.openOtherSystemRecordCounts(otherSystem)).toEqual(before);
  });

  it("counts the refund, invoice, credit-note and payment-check jobs still open on another payment system's charges (P2-I4)", async () => {
    const ownerRef = randomUUID();
    const subscription = await activeSubscription(ownerRef, anchor, "live");
    const charge = await quoteAndCharge(ownerRef, subscription, "INITIAL", anchor, "live");
    await billing.withTransaction((c) => billing.appendChargeEvent(c, {
      chargeId: charge.chargeId, kind: "SUCCEEDED", at: new Date(), providerPaymentId: "61002", amountMicros: 24_200_000, errorCode: null
    }));
    await billing.withTransaction((c) => billing.appendSubscriptionEvent(c, subscriptionEvent(subscription, ownerRef, "CANCEL_REQUESTED")));
    // Seen from a NETOPIA sandbox deployment the seeded xMoney live rows are another system's; from their own system,
    // xMoney live, they never count.
    const otherSystem = { paymentProvider: "netopia", paymentEnvironment: "sandbox" } as const;
    const ownSystem = { paymentProvider: "xmoney", paymentEnvironment: "live" } as const;
    const live = await billing.openOtherSystemRecordCounts(otherSystem);
    const own = await billing.openOtherSystemRecordCounts(ownSystem);
    // The plan (a cancel pending) and its paid charge count as closed; what they still queue does not.
    const [invoice, refund] = await billing.withTransaction(async (c) => [
      await billing.enqueue(c, { kind: "SMARTBILL_INVOICE", ref: charge.chargeId, notBefore: anchor, payload: { card_country: "RO" } }),
      await billing.enqueue(c, {
        kind: "XMONEY_REFUND", ref: `${charge.chargeId}:61002`, notBefore: new Date(anchor.getTime() + 30 * 86_400_000),
        payload: { charge_id: charge.chargeId, transaction_id: "61002", amount_micros: 5_000_000, whole: false, owner_ref: ownerRef, reason: "WITHDRAWAL" }
      }),
      await billing.enqueue(c, {
        kind: "QUADERNO_RECORD_REFUND", ref: `${charge.chargeId}:61002`, notBefore: anchor,
        payload: { charge_id: charge.chargeId, transaction_id: "61002", refund_micros: 5_000_000 }
      }),
      // An xMoney notice's payment check names the charge only as its external order id (notice-intake.ts).
      await billing.enqueue(c, {
        kind: "VERIFY_PAYMENT", ref: "61003", notBefore: anchor,
        payload: { notice_id: null, order_id: "61003", external_order_id: charge.chargeId }
      }),
      // A job naming no charge (an owner email) is not this count's.
      await billing.enqueue(c, { kind: "EMAIL", ref: `O2:${charge.chargeId}`, notBefore: anchor, payload: {} })
    ]);
    expect(await billing.openOtherSystemRecordCounts(otherSystem)).toEqual({ ...live, jobs: live.jobs + 4 });
    expect(await billing.openOtherSystemRecordCounts(ownSystem)).toEqual(own);
    // A job that is done or dead is closed.
    await billing.complete(invoice!, new Date());
    await billing.fail(refund!, "XMONEY_REFUSED", null, new Date());
    expect((await billing.openOtherSystemRecordCounts(otherSystem)).jobs).toBe(live.jobs + 2);
  });

  it("counts the billing rows and open jobs dated more than a day ahead of the real clock (W14, P2-I19)", async () => {
    const now = new Date();
    const before = await billing.recordsDatedAhead(now);
    const entitlements = new EntitlementRepository(database.pool);
    const ownerRef = randomUUID();
    // Written on the real clock, or within the day's margin: never counted, on either system.
    const today = await activeSubscription(ownerRef, now, "live");
    const todayCharge = await quoteAndCharge(ownerRef, today, "INITIAL", now, "live");
    const soon = new Date(now.getTime() + 23 * 3_600_000);
    await billing.withTransaction(async (c) => {
      await billing.appendChargeEvent(c, {
        chargeId: todayCharge.chargeId, kind: "SUCCEEDED", at: soon, providerPaymentId: "62001", amountMicros: 24_200_000, errorCode: null
      });
      await billing.enqueue(c, { kind: "SMARTBILL_INVOICE", ref: todayCharge.chargeId, notBefore: soon, payload: { card_country: "RO" } });
      // The quarter's summary is due at 06:00 on the 5th day after its quarter ends (owner-jobs.ts), so up to four
      // days and six hours ahead by design: not counted.
      await billing.enqueue(c, {
        kind: "OWNER_TAX_SUMMARY", ref: `w14-summary-${randomUUID()}`, notBefore: new Date(now.getTime() + 4 * 86_400_000), payload: {}
      });
    });
    expect(await billing.recordsDatedAhead(now)).toEqual(before);
    // A stage host's moved clock (BILLING_STAGE_CLOCK_OFFSET_DAYS=31) dates every billing change it records a month ahead.
    const moved = new Date(now.getTime() + 31 * 86_400_000);
    const sandboxOwner = randomUUID();
    const sandbox = await activeSubscription(sandboxOwner, moved, "stage");
    expect(await billing.recordsDatedAhead(now)).toEqual({ rows: before.rows + 2, jobs: before.jobs });
    const sandboxCharge = await quoteAndCharge(sandboxOwner, sandbox, "RENEWAL", moved, "stage");
    await billing.withTransaction(async (c) => {
      await billing.appendChargeEvent(c, {
        chargeId: sandboxCharge.chargeId, kind: "SUCCEEDED", at: moved, providerPaymentId: "62002", amountMicros: 24_200_000, errorCode: null
      });
      await entitlements.append(c, {
        ownerRef: sandboxOwner, planId: "PLUS", periodAnchorAt: moved, cause: "RENEWED", effectiveAt: moved,
        subscriptionId: sandbox, paidThrough: new Date(moved.getTime() + 30 * 86_400_000), monthCreditOverrideMicros: null
      });
    });
    // quoteAndCharge stamps the charge itself on the real clock; its SUCCEEDED and the entitlement are moved.
    expect(await billing.recordsDatedAhead(now)).toEqual({ rows: before.rows + 4, jobs: before.jobs });
    const [movedJob, rescheduled] = await billing.withTransaction(async (c) => [
      // A job queued on the moved clock (its creation is always the database's real clock).
      await billing.enqueue(c, {
        kind: "XMONEY_REFUND", ref: `${sandboxCharge.chargeId}:62002`, notBefore: moved, payload: { charge_id: sandboxCharge.chargeId }
      }),
      // A job retried on the moved clock, just past the day's margin.
      await billing.enqueue(c, {
        kind: "QUADERNO_RECORD_SALE", ref: sandboxCharge.chargeId, notBefore: new Date(now.getTime() + 25 * 3_600_000), payload: {}
      }),
      // The quarter's summary queued on the moved clock is past even its own margin.
      await billing.enqueue(c, {
        kind: "OWNER_TAX_SUMMARY", ref: `w14-summary-${randomUUID()}`, notBefore: moved, payload: {}
      })
    ]);
    expect(await billing.recordsDatedAhead(now)).toEqual({ rows: before.rows + 4, jobs: before.jobs + 3 });
    // A job that is done or dead is not open.
    await billing.complete(movedJob!, now);
    await billing.fail(rescheduled!, "XMONEY_REFUSED", null, now);
    expect(await billing.recordsDatedAhead(now)).toEqual({ rows: before.rows + 4, jobs: before.jobs + 1 });
  });
});

describe("P1b — invoices, notices and the tax summary", () => {
  it("needs an intent before an invoice and lists the owner's invoices", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    const charge = await quoteAndCharge(ownerRef, subscriptionId);
    const invoice = {
      invoiceId: randomUUID(), chargeId: charge.chargeId, issuer: "SMARTBILL" as const, kind: "INVOICE" as const,
      externalRef: `DBT-${charge.chargeId.slice(0, 6)}`, series: "DBT", number: charge.chargeId.slice(0, 6),
      url: null, totalMicros: 24_200_000, at: new Date()
    };
    await expect(billing.withTransaction((c) => billing.insertInvoice(c, invoice))).rejects.toMatchObject({ code: "23503" });
    const intent = { chargeId: charge.chargeId, kind: "INVOICE" as const, issuer: "SMARTBILL" as const, requestedAt: new Date() };
    expect(await billing.withTransaction((c) => billing.insertInvoiceIntent(c, intent))).toBe("INSERTED");
    expect(await billing.withTransaction((c) => billing.insertInvoiceIntent(c, intent))).toBe("DUPLICATE");
    await billing.withTransaction((c) => billing.insertInvoice(c, invoice));
    await billing.withTransaction((c) => billing.appendInvoiceStatus(c, { invoiceId: invoice.invoiceId, at: new Date(), efacturaStatus: "SENT" }));
    expect((await billing.invoicesForOwner(ownerRef)).map((row) => row.number)).toEqual([invoice.number]);
  });

  it("stores a notice once per payload and records its outcome once", async () => {
    const notice = { noticeId: randomUUID(), receivedAt: new Date(), payloadSha256: randomBytes(32).toString("hex"),
      transactionId: "9900", orderId: "4711", externalOrderId: chargeIdOf(), status: "complete-ok", xmoneyEnvironment: "stage" as const };
    expect(await billing.withTransaction((c) => billing.insertNotice(c, notice))).toBe("INSERTED");
    expect(await billing.withTransaction((c) => billing.insertNotice(c, { ...notice, noticeId: randomUUID() }))).toBe("DUPLICATE");
    await billing.withTransaction((c) => billing.recordNoticeOutcome(c, { noticeId: notice.noticeId, at: new Date(), outcome: "VERIFY_ENQUEUED" }));
    await billing.withTransaction((c) => billing.recordNoticeOutcome(c, { noticeId: notice.noticeId, at: new Date(), outcome: "DUPLICATE" }));
    const outcomes = await database.pool.query<{ outcome: string }>("SELECT outcome FROM billing.xmoney_notice_outcome WHERE notice_id = $1", [notice.noticeId]);
    expect(outcomes.rows).toEqual([{ outcome: "VERIFY_ENQUEUED" }]);
  });

  it("lists one SALE per paid charge and one REFUND per refund in the quarter, as P16b reads them (R-31)", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    const charge = await quoteAndCharge(ownerRef, subscriptionId);
    const paidAt = new Date("2031-02-10T12:00:00.000Z");
    const refundedAt = new Date("2031-02-11T12:00:00.000Z");
    const nextQuarter = new Date("2031-04-02T12:00:00.000Z");
    const ip = sealRecord(recordsKey, { table: "billing.location_evidence", column: "ip_ciphertext", rowId: charge.chargeId },
      Buffer.from("192.0.2.10"));
    await billing.withTransaction(async (c) => {
      // eventId left out on purpose: the repository mints it.
      await billing.appendChargeEvent(c, { chargeId: charge.chargeId, kind: "SUCCEEDED", at: paidAt,
        providerPaymentId: "31001", amountMicros: 24_200_000, errorCode: null });
      await billing.appendChargeEvent(c, { chargeId: charge.chargeId, kind: "REFUND_REQUESTED", at: refundedAt,
        providerPaymentId: "31001", amountMicros: 4_200_000, errorCode: "WITHDRAWAL" });
      await billing.appendChargeEvent(c, { chargeId: charge.chargeId, kind: "REFUNDED", at: refundedAt,
        providerPaymentId: "31001", amountMicros: 4_200_000, errorCode: "WITHDRAWAL" });
      // A second payment of the same charge and its refund: never a sale, so its refund is not a tax REFUND row.
      await billing.appendChargeEvent(c, { chargeId: charge.chargeId, kind: "DUPLICATE_PAYMENT", at: paidAt,
        providerPaymentId: "31003", amountMicros: 24_200_000, errorCode: null });
      await billing.appendChargeEvent(c, { chargeId: charge.chargeId, kind: "REFUNDED", at: refundedAt,
        providerPaymentId: "31004", refundsTransactionId: "31003", amountMicros: 24_200_000, errorCode: "DUPLICATE_PAYMENT" });
      await billing.insertLocationEvidence(c, { chargeId: charge.chargeId, ipCountry: "RO", declaredCountry: "RO",
        cardCountry: "RO", verdict: "AGREED", ipCiphertext: ip.ciphertext, keyId: ip.keyId, at: paidAt });
    });
    const renewal = await quoteAndCharge(ownerRef, subscriptionId, "RENEWAL", new Date(anchor.getTime() + 30 * 86_400_000));
    await billing.withTransaction((c) => billing.appendChargeEvent(c, { chargeId: renewal.chargeId, kind: "SUCCEEDED",
      at: nextQuarter, providerPaymentId: "31002", amountMicros: 24_200_000, errorCode: null }));
    const rows = await billing.quarterSummaryRows(new Date("2031-01-01T00:00:00Z"), new Date("2031-04-01T00:00:00Z"), { provider: "xmoney", environment: "stage" });
    expect(rows).toEqual([
      { type: "SALE", chargeId: charge.chargeId, at: paidAt, taxCountry: "RO", taxRegion: null, taxStatus: "TAXABLE",
        chargeNetMicros: 20_000_000, chargeTaxMicros: 4_200_000, chargeTotalMicros: 24_200_000, amountMicros: 24_200_000,
        amountKnown: true, saleRecorded: true, locationVerdict: "AGREED" },
      { type: "REFUND", chargeId: charge.chargeId, at: refundedAt, taxCountry: "RO", taxRegion: null, taxStatus: "TAXABLE",
        chargeNetMicros: 20_000_000, chargeTaxMicros: 4_200_000, chargeTotalMicros: 24_200_000, amountMicros: 4_200_000,
        amountKnown: true, saleRecorded: true, locationVerdict: "AGREED" }
    ]);
    const next = await billing.quarterSummaryRows(new Date("2031-04-01T00:00:00Z"), new Date("2031-07-01T00:00:00Z"), { provider: "xmoney", environment: "stage" });
    expect(next).toEqual([expect.objectContaining({ type: "SALE", chargeId: renewal.chargeId, locationVerdict: null })]);
  });

  it("lists one CHARGEBACK per charge-back no dispute has won back, and none for a second payment (D6b's P16b)", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    const open = await quoteAndCharge(ownerRef, subscriptionId, "INITIAL", new Date("2032-01-05T00:00:00.000Z"));
    const won = await quoteAndCharge(ownerRef, subscriptionId, "RENEWAL", new Date("2032-02-05T00:00:00.000Z"));
    // Part 4 final review C-19: a checkout charged back before we verified it holds only the CHARGEBACK, no SUCCEEDED.
    const unsold = await quoteAndCharge(ownerRef, subscriptionId, "INITIAL", new Date("2032-01-06T00:00:00.000Z"));
    const paidAt = new Date("2032-02-10T12:00:00.000Z");
    const disputedAt = new Date("2032-02-20T12:00:00.000Z");
    const event = (chargeId: string, kind: "SUCCEEDED" | "DUPLICATE_PAYMENT" | "CHARGEBACK" | "CHARGEBACK_RESOLVED",
      at: Date, providerPaymentId: string, amountMicros: number | null) =>
      ({ chargeId, kind, at, providerPaymentId, amountMicros, errorCode: null });
    await billing.withTransaction(async (c) => {
      await billing.appendChargeEvent(c, event(open.chargeId, "SUCCEEDED", paidAt, "32001", 24_200_000));
      // No amount on the charge-back: the row carries the charge total.
      await billing.appendChargeEvent(c, event(open.chargeId, "CHARGEBACK", disputedAt, "32001", null));
      // A second payment of the same charge, charged back too: it was never a sale, so it gives no row.
      await billing.appendChargeEvent(c, event(open.chargeId, "DUPLICATE_PAYMENT", paidAt, "32003", 24_200_000));
      await billing.appendChargeEvent(c, event(open.chargeId, "CHARGEBACK", disputedAt, "32003", 24_200_000));
      // The second payment's dispute is won back: that settles transaction 32003 only, never the open charge-back
      // of the payment itself (32001), whose money the bank kept.
      await billing.appendChargeEvent(c, event(open.chargeId, "CHARGEBACK_RESOLVED", new Date("2032-03-01T12:00:00.000Z"), "32003", null));
      await billing.appendChargeEvent(c, event(won.chargeId, "SUCCEEDED", paidAt, "32002", 24_200_000));
      await billing.appendChargeEvent(c, event(won.chargeId, "CHARGEBACK", disputedAt, "32002", 10_000_000));
      // The owner's `billing:dispute --outcome won` (D6b): that charge-back is over; the sale stays.
      await billing.appendChargeEvent(c, event(won.chargeId, "CHARGEBACK_RESOLVED", new Date("2032-03-01T12:00:00.000Z"), "32002", null));
      await billing.appendChargeEvent(c, event(unsold.chargeId, "CHARGEBACK", disputedAt, "32004", null));
    });
    const rows = (await billing.quarterSummaryRows(new Date("2032-01-01T00:00:00Z"), new Date("2032-04-01T00:00:00Z"), { provider: "xmoney", environment: "stage" }))
      .filter((row) => row.chargeId === open.chargeId || row.chargeId === won.chargeId);
    expect(rows).toHaveLength(3);
    expect(rows.filter((row) => row.type === "SALE").map((row) => row.chargeId).sort()).toEqual([open.chargeId, won.chargeId].sort());
    expect(rows.filter((row) => row.type === "CHARGEBACK")).toEqual([
      { type: "CHARGEBACK", chargeId: open.chargeId, at: disputedAt, taxCountry: "RO", taxRegion: null,
        taxStatus: "TAXABLE", chargeNetMicros: 20_000_000, chargeTaxMicros: 4_200_000, chargeTotalMicros: 24_200_000,
        amountMicros: 24_200_000, amountKnown: true, saleRecorded: true, locationVerdict: null }
    ]);
    // C-19: the never-verified charge's charge-back says no sale was recorded for it (and it gives no SALE row).
    const unsoldRows = (await billing.quarterSummaryRows(new Date("2032-01-01T00:00:00Z"), new Date("2032-04-01T00:00:00Z"), { provider: "xmoney", environment: "stage" }))
      .filter((row) => row.chargeId === unsold.chargeId);
    expect(unsoldRows.map((row) => `${row.type} saleRecorded=${String(row.saleRecorded)}`)).toEqual(["CHARGEBACK saleRecorded=false"]);
  });

  it("dates each row when xMoney says the money moved, so a payment verified after the quarter's end stays in it", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    const charge = await quoteAndCharge(ownerRef, subscriptionId, "INITIAL", new Date("2033-03-01T00:00:00.000Z"));
    const takenAt = new Date("2033-03-31T23:59:00.000Z");
    const verifiedAt = new Date("2033-04-01T00:05:00.000Z");
    await billing.withTransaction((c) => billing.appendChargeEvent(c, {
      chargeId: charge.chargeId, kind: "SUCCEEDED", at: verifiedAt, providerCreatedAt: takenAt,
      providerPaymentId: "33001", amountMicros: 24_200_000, errorCode: null
    }));
    const first = await billing.quarterSummaryRows(new Date("2033-01-01T00:00:00Z"), new Date("2033-04-01T00:00:00Z"), { provider: "xmoney", environment: "stage" });
    expect(first.filter((row) => row.chargeId === charge.chargeId))
      .toEqual([expect.objectContaining({ type: "SALE", at: takenAt, amountMicros: 24_200_000 })]);
    const second = await billing.quarterSummaryRows(new Date("2033-04-01T00:00:00Z"), new Date("2033-07-01T00:00:00Z"), { provider: "xmoney", environment: "stage" });
    expect(second.some((row) => row.chargeId === charge.chargeId)).toBe(false);
    // A row that names no transaction cannot carry xMoney's time (P1a's constraint), whatever the caller passes.
    await expect(billing.withTransaction((c) => billing.appendChargeEvent(c, {
      chargeId: charge.chargeId, kind: "REQUESTED", at: verifiedAt, providerCreatedAt: takenAt,
      providerPaymentId: null, amountMicros: null, errorCode: null
    }))).rejects.toMatchObject({ code: "23514" });
  });

  it("dates a refund of the payment itself when it was recorded, so a May refund of a March payment is Q2's", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    const charge = await quoteAndCharge(ownerRef, subscriptionId, "INITIAL", new Date("2035-03-01T00:00:00.000Z"));
    const takenAt = new Date("2035-03-20T09:00:00.000Z");
    const refundedAt = new Date("2035-05-12T09:00:00.000Z");
    await billing.withTransaction((c) => billing.appendChargeEvent(c, {
      chargeId: charge.chargeId, kind: "SUCCEEDED", at: new Date("2035-03-20T09:05:00.000Z"), providerCreatedAt: takenAt,
      providerPaymentId: "35001", amountMicros: 24_200_000, errorCode: null
    }));
    // refund-ok on the payment's own transaction (A9): that transaction's createdAt is the PAYMENT's, so the row
    // may not carry it — P1a's constraint refuses it (the refund-sum trigger lets it through first: 35001 paid 24.20).
    await expect(billing.withTransaction((c) => billing.appendChargeEvent(c, {
      chargeId: charge.chargeId, kind: "REFUNDED", at: refundedAt, providerCreatedAt: takenAt,
      providerPaymentId: "35001", amountMicros: 24_200_000, errorCode: null
    }))).rejects.toMatchObject({ code: "23514", constraint: "charge_event_provider_time_names_payment" });
    // As D6a's VERIFY_PAYMENT writes it: no xMoney time, so the row is dated when it was recorded.
    await billing.withTransaction((c) => billing.appendChargeEvent(c, {
      chargeId: charge.chargeId, kind: "REFUNDED", at: refundedAt,
      providerPaymentId: "35001", amountMicros: 24_200_000, errorCode: null
    }));
    const ours = (rows: readonly TaxSummaryRow[]) => rows.filter((row) => row.chargeId === charge.chargeId);
    expect(ours(await billing.quarterSummaryRows(new Date("2035-01-01T00:00:00Z"), new Date("2035-04-01T00:00:00Z"), { provider: "xmoney", environment: "stage" })))
      .toEqual([expect.objectContaining({ type: "SALE", at: takenAt, amountMicros: 24_200_000 })]);
    // No error code on that row: its amount is still known (the column is never NULL).
    expect(ours(await billing.quarterSummaryRows(new Date("2035-04-01T00:00:00Z"), new Date("2035-07-01T00:00:00Z"), { provider: "xmoney", environment: "stage" })))
      .toEqual([expect.objectContaining({ type: "REFUND", at: refundedAt, amountMicros: 24_200_000, amountKnown: true })]);
  });

  it("marks a dashboard refund recorded on the payment itself as of unknown amount, and every other row as known (D6b's P16b)", async () => {
    const ownerRef = randomUUID();
    const subscriptionId = await activeSubscription(ownerRef);
    const onPayment = await quoteAndCharge(ownerRef, subscriptionId, "INITIAL", new Date("2036-01-05T00:00:00.000Z"));
    const ownTransaction = await quoteAndCharge(ownerRef, subscriptionId, "RENEWAL", new Date("2036-02-05T00:00:00.000Z"));
    const paidAt = new Date("2036-02-10T12:00:00.000Z");
    const refundedAt = new Date("2036-02-20T12:00:00.000Z");
    await billing.withTransaction(async (c) => {
      await billing.appendChargeEvent(c, { chargeId: onPayment.chargeId, kind: "SUCCEEDED", at: paidAt,
        providerPaymentId: "36001", amountMicros: 24_200_000, errorCode: null });
      await billing.appendChargeEvent(c, { chargeId: ownTransaction.chargeId, kind: "SUCCEEDED", at: paidAt,
        providerPaymentId: "36002", amountMicros: 24_200_000, errorCode: null });
      // D6a's P9c, xMoney's read naming no refunded amount: recorded on the payment at what was left of the charge
      // (an upper bound), so the summary must not subtract it.
      for (const kind of ["REFUND_REQUESTED", "REFUNDED"] as const) {
        await billing.appendChargeEvent(c, { chargeId: onPayment.chargeId, kind, at: refundedAt,
          providerPaymentId: "36001", amountMicros: 24_200_000, errorCode: "PROVIDER_REFUND" });
      }
      // A dashboard refund xMoney lists as its own transaction, naming the payment: its amount is known.
      await billing.appendChargeEvent(c, { chargeId: ownTransaction.chargeId, kind: "REFUND_REQUESTED", at: refundedAt,
        providerPaymentId: "36002", amountMicros: 3_000_000, errorCode: "PROVIDER_REFUND" });
      await billing.appendChargeEvent(c, { chargeId: ownTransaction.chargeId, kind: "REFUNDED", at: refundedAt,
        providerPaymentId: "36003", refundsTransactionId: "36002", amountMicros: 3_000_000, errorCode: "PROVIDER_REFUND" });
    });
    const rows = (await billing.quarterSummaryRows(new Date("2036-01-01T00:00:00Z"), new Date("2036-04-01T00:00:00Z"), { provider: "xmoney", environment: "stage" }))
      .filter((row) => row.chargeId === onPayment.chargeId || row.chargeId === ownTransaction.chargeId);
    expect(rows.filter((row) => row.type === "SALE").map((row) => row.amountKnown)).toEqual([true, true]);
    const refunds = rows.filter((row) => row.type === "REFUND");
    expect(refunds).toHaveLength(2);
    expect(refunds).toEqual(expect.arrayContaining([
      expect.objectContaining({ chargeId: onPayment.chargeId, amountMicros: 24_200_000, amountKnown: false }),
      expect.objectContaining({ chargeId: ownTransaction.chargeId, amountMicros: 3_000_000, amountKnown: true })
    ]));
  });

  it("lists only the charges of the xMoney system it is asked for: a sandbox payment is never a sale", async () => {
    const periodStart = new Date("2034-01-05T00:00:00.000Z");
    const paidAt = new Date("2034-02-10T12:00:00.000Z");
    const stageOwner = randomUUID();
    const liveOwner = randomUUID();
    const stageCharge = await quoteAndCharge(stageOwner, await activeSubscription(stageOwner, anchor, "stage"),
      "INITIAL", periodStart, "stage");
    const liveCharge = await quoteAndCharge(liveOwner, await activeSubscription(liveOwner, anchor, "live"),
      "INITIAL", periodStart, "live");
    await billing.withTransaction(async (c) => {
      // The same transaction number in both systems: two payments, one per system (P1a keys every id by system).
      for (const chargeId of [stageCharge.chargeId, liveCharge.chargeId]) {
        await billing.appendChargeEvent(c, { chargeId, kind: "SUCCEEDED", at: paidAt,
          providerPaymentId: "34001", amountMicros: 24_200_000, errorCode: null });
      }
    });
    const from = new Date("2034-01-01T00:00:00Z");
    const to = new Date("2034-04-01T00:00:00Z");
    const ours = (rows: readonly TaxSummaryRow[]) =>
      rows.filter((row) => row.chargeId === stageCharge.chargeId || row.chargeId === liveCharge.chargeId);
    expect(ours(await billing.quarterSummaryRows(from, to, { provider: "xmoney", environment: "live" })))
      .toEqual([expect.objectContaining({ type: "SALE", chargeId: liveCharge.chargeId, at: paidAt })]);
    expect(ours(await billing.quarterSummaryRows(from, to, { provider: "xmoney", environment: "stage" })))
      .toEqual([expect.objectContaining({ type: "SALE", chargeId: stageCharge.chargeId, at: paidAt })]);
  });
});

describe("P1b — the outbox and the cancel tokens", () => {
  const kind: OutboxKind = "EMAIL";
  it("dedupes live jobs and hands each job to one worker (SKIP LOCKED)", async () => {
    const now = new Date();
    const refs = Array.from({ length: 4 }, () => `email:M1:${chargeIdOf()}`);
    const ids = await Promise.all(refs.map((ref) => billing.withTransaction((c) => billing.enqueue(c, { kind, ref, notBefore: now, payload: {} }))));
    expect(await billing.withTransaction((c) => billing.enqueue(c, { kind, ref: refs[0]!, notBefore: now, payload: {} }))).toBe(ids[0]);
    const holder = await database.pool.connect();
    try {
      await holder.query("BEGIN");
      await holder.query("SELECT job_id FROM billing.outbox WHERE job_id = ANY($1::uuid[]) ORDER BY job_id LIMIT 2 FOR UPDATE", [ids]);
      const claimed = await billing.claim([kind], 100, "worker-b", new Date());
      const mine = claimed.filter((job) => ids.includes(job.jobId));
      expect(mine).toHaveLength(2);
      expect(mine.every((job) => job.attempts === 1 && job.claimedBy === "worker-b")).toBe(true);
      await holder.query("ROLLBACK");
      const [c1, c2] = await Promise.all([
        billing.claim([kind], 100, "worker-c", new Date()),
        billing.claim([kind], 100, "worker-d", new Date())
      ]);
      const later = [...c1, ...c2].filter((job) => ids.includes(job.jobId)).map((job) => job.jobId);
      expect(new Set(later).size).toBe(later.length);
      expect(later.sort()).toEqual(ids.filter((id) => !mine.some((job) => job.jobId === id)).sort());
      expect(await billing.complete(ids[0]!, new Date())).toBe(true);
      expect(await billing.withTransaction((c) => billing.enqueue(c, { kind, ref: refs[0]!, notBefore: now, payload: {} }))).not.toBe(ids[0]);
      await billing.fail(ids[1]!, "MAIL_TRANSPORT_FAILED", new Date(Date.now() + 60_000), new Date());
      expect((await billing.claim([kind], 100, "worker-e", new Date())).some((job) => job.jobId === ids[1])).toBe(false);
      await billing.fail(ids[2]!, "MAIL_ADDRESS_REFUSED", null, new Date());
      const dead = await database.pool.query<{ dead: boolean }>("SELECT dead_at IS NOT NULL AS dead FROM billing.outbox WHERE job_id = $1", [ids[2]]);
      expect(dead.rows[0]?.dead).toBe(true);
    } finally {
      await holder.query("ROLLBACK").catch(() => undefined);
      holder.release();
    }
  });

  it("fences a claim: after the lease a job belongs to its new worker, and the old one can neither finish nor renew it", async () => {
    // OWNER_TAX_SUMMARY: a kind no other test in this file queues, so the claims below see this job alone.
    const quarterly: OutboxKind = "OWNER_TAX_SUMMARY";
    const t0 = new Date();
    const jobId = await billing.withTransaction((c) => billing.enqueue(c, { kind: quarterly, ref: `tax:${randomUUID()}`, notBefore: t0, payload: {} }));
    const [first] = await billing.claim([quarterly], 1, "worker-a", t0);
    expect(first).toMatchObject({ jobId, attempts: 1, claimedBy: "worker-a" });
    expect(await billing.claim([quarterly], 1, "worker-b", new Date(t0.getTime() + 299_000))).toEqual([]);
    const reclaimedAt = new Date(t0.getTime() + 300_001);
    const [second] = await billing.claim([quarterly], 1, "worker-b", reclaimedAt);
    expect(second).toMatchObject({ jobId, attempts: 2, claimedBy: "worker-b" });
    const row = async () => (await database.pool.query<{ claimed_by: string; claimed_at: Date; not_before: Date; done_at: Date | null }>(
      "SELECT claimed_by, claimed_at, not_before, done_at FROM billing.outbox WHERE job_id = $1", [jobId]
    )).rows[0]!;
    const held = await row();
    const stale = { workerId: "worker-a", attempts: 1 } as const;
    expect(await billing.complete(jobId, new Date(), stale)).toBe(false);
    expect(await billing.fail(jobId, "SMTP_TIMEOUT", new Date(Date.now() + 60_000), new Date(), stale)).toBe(false);
    expect(await billing.fail(jobId, "SMTP_TIMEOUT", null, new Date(), stale)).toBe(false);
    expect(await billing.renewClaim(jobId, "worker-a", 1, new Date())).toBe(false);
    expect(await row()).toEqual(held);
    const renewedAt = new Date(reclaimedAt.getTime() + 60_000);
    expect(await billing.renewClaim(jobId, "worker-b", 2, renewedAt)).toBe(true);
    expect((await row()).claimed_at.getTime()).toBe(renewedAt.getTime());
    // Renewed at +360 s, the lease now runs to +660 s: a third worker at +600 s finds nothing to take.
    expect(await billing.claim([quarterly], 1, "worker-c", new Date(t0.getTime() + 600_000))).toEqual([]);
    expect(await billing.complete(jobId, new Date(), { workerId: "worker-b", attempts: 2 })).toBe(true);
    expect((await row()).done_at).not.toBeNull();
  });

  it("refuses a claim limit outside 1..100", async () => {
    await expect(billing.claim(["EMAIL"], 0, "w", new Date())).rejects.toMatchObject({ code: "BILLING_OUTBOX_LIMIT_INVALID" });
  });

  it("lets a cancel token be used exactly once, even concurrently, and never after it expires", async () => {
    const subscriptionId = randomUUID();
    const token = randomBytes(32).toString("hex");
    const expired = randomBytes(32).toString("hex");
    await billing.withTransaction(async (c) => {
      await billing.insertCancelToken(c, { tokenSha256: token, subscriptionId, issuedAt: new Date(), expiresAt: new Date(Date.now() + 86_400_000) });
      await billing.insertCancelToken(c, { tokenSha256: expired, subscriptionId, issuedAt: new Date(Date.now() - 90_000_000), expiresAt: new Date(Date.now() - 3_600_000) });
    });
    const results = await Promise.all([1, 2, 3].map(() => billing.withTransaction((c) => billing.useCancelToken(c, token, new Date()))));
    expect(results.filter((result) => result !== null)).toEqual([{ subscriptionId }]);
    expect(await billing.withTransaction((c) => billing.useCancelToken(c, expired, new Date()))).toBeNull();
  });
});

describe("P1b — account erasure leaves billing rows intact (spec §2.2 rule 5)", () => {
  it("keeps customer, profile, subscription and charge rows, and the profile still opens with the records key", async () => {
    const account = await createBillingTestAccount(database.pool, "erasure");
    const { customerId } = await billing.withTransaction((c) => billing.ensureCustomer(c, { ownerRef: account.ownerRef, locale: "ro", now: new Date(), environment: "stage" }));
    const aad = { table: "billing.customer_profile_event", column: "profile_ciphertext", rowId: customerId };
    const sealed = sealRecord(recordsKey, aad, Buffer.from(JSON.stringify({ name: "Kept for the tax law" })));
    await billing.withTransaction((c) => billing.appendProfile(c, { customerId, at: new Date(), locale: "ro", profileCiphertext: sealed.ciphertext, keyId: sealed.keyId }));
    const subscriptionId = await activeSubscription(account.ownerRef);
    const charge = await quoteAndCharge(account.ownerRef, subscriptionId);
    expect(await eraseBillingTestAccount(database.pool, account)).toBe("COMMITTED");
    expect((await database.pool.query('SELECT 1 FROM identity."user" WHERE user_id = $1', [account.userId])).rowCount).toBe(0);
    expect((await billing.customerByOwner(account.ownerRef))?.customerId).toBe(customerId);
    expect((await billing.subscriptionForOwner(account.ownerRef))?.subscriptionId).toBe(subscriptionId);
    expect((await billing.charge(charge.chargeId))?.chargeId).toBe(charge.chargeId);
    const profile = await billing.latestProfile(customerId);
    expect(JSON.parse(openRecord(recordsKey, aad, profile!.profileCiphertext).toString("utf8"))).toEqual({ name: "Kept for the tax law" });
  });
});

/** A NETOPIA card check (no quote): the smallest charge of NETOPIA's sandbox, through the repository. */
async function netopiaCharge(): Promise<ChargeRow> {
  const charge: ChargeRow = {
    chargeId: chargeIdOf(), ownerRef: randomUUID(), subscriptionId: randomUUID(), kind: "CARD_CHECK", attempt: 1,
    periodStart: anchor, periodEnd: new Date(anchor.getTime() + 86_400_000), quoteId: null, netMicros: 0, taxMicros: 0,
    totalMicros: 0, currency: "USD", createdAt: new Date(), paymentProvider: "netopia", paymentEnvironment: "sandbox"
  };
  await billing.withTransaction((c) => billing.insertCharge(c, charge));
  return charge;
}
const sealedBytes = Buffer.from([9, 8, 7, 6]);
const KEY_ID = "0123456789abcdef";
const hex64 = (text: string): string => createHash("sha256").update(text).digest("hex");
const inTx = <T>(run: (c: PoolClient) => Promise<T>): Promise<T> => billing.withTransaction(run);

describe("N6 — NETOPIA's rows through the repository (spec §2.5.1, §2.5.2)", () => {
  it("copies the charge's provider and environment onto its events, and reads both back", async () => {
    const charge = await netopiaCharge();
    expect(await inTx((c) => billing.appendChargeEvent(c, { chargeId: charge.chargeId, kind: "SUCCEEDED", at: new Date(),
      providerPaymentId: "ntp-4401", amountMicros: 0, errorCode: null, providerCreatedAt: anchor }))).toBe("INSERTED");
    const read = await billing.charge(charge.chargeId);
    expect(read).toMatchObject({ paymentProvider: "netopia", paymentEnvironment: "sandbox" });
    expect(read?.events[0]).toMatchObject({ providerPaymentId: "ntp-4401", paymentProvider: "netopia", paymentEnvironment: "sandbox" });
    expect(await inTx((c) => billing.succeededTransaction(c, charge.chargeId))).toBe("ntp-4401");
  });
  it("stores a message once per body, keeps its raw bytes and outcomes, finds the newest for an order, quarantines the rest", async () => {
    const orderId = chargeIdOf();
    const message = (noticeId: string, receivedAt: Date, body: string) => ({
      noticeId, paymentProvider: "netopia" as const, paymentEnvironment: "sandbox" as const, receivedAt, bodySha256: hex64(body),
      orderId, providerPaymentId: "5501", providerStatus: 3, amountText: "24.2", currency: "USD", cardCountry: "RO",
      keyFingerprint: hex64("key"), jwtIat: "1759744800", allowedCiphertext: sealedBytes, keyId: KEY_ID
    });
    const [first, later] = [randomUUID(), randomUUID()];
    expect(await inTx((c) => billing.insertPaymentNotice(c, message(first, anchor, `a-${orderId}`)))).toEqual({ noticeId: first, inserted: true });
    expect(await inTx((c) => billing.insertPaymentNotice(c, message(randomUUID(), anchor, `a-${orderId}`)))).toEqual({ noticeId: first, inserted: false });
    await inTx(async (c) => {
      await billing.insertPaymentNotice(c, message(later, new Date(anchor.getTime() + 60_000), `b-${orderId}`));
      await billing.insertPaymentNoticeRaw(c, { noticeId: later, rawCiphertext: sealedBytes, keyId: KEY_ID, storedAt: new Date() });
      await billing.insertPaymentNoticeOutcome(c, { noticeId: later, at: new Date(), outcome: "PARSE_FAILED" });
      await billing.insertPaymentNoticeOutcome(c, { noticeId: later, at: new Date(), outcome: "APPLIED" });
    });
    const newest = await billing.newestNoticeForOrder(database.pool, orderId);
    expect(newest).toMatchObject({ noticeId: later, providerPaymentId: "5501", providerStatus: 3, amountText: "24.2", orderId });
    expect(newest?.allowedCiphertext.equals(sealedBytes)).toBe(true);
    expect(await billing.newestNoticeForOrder(database.pool, chargeIdOf())).toBeNull();
    expect((await database.pool.query("SELECT outcome FROM billing.payment_notice_outcome WHERE notice_id = $1", [later])).rows
      .map((row) => row.outcome).sort()).toEqual(["APPLIED", "PARSE_FAILED"]);
    const since = new Date();
    const quarantineId = randomUUID();
    await inTx((c) => billing.insertNoticeQuarantine(c, { quarantineId, receivedAt: new Date(since.getTime() + 1_000),
      reason: "NOTICE_SIGNATURE_INVALID", orderId, rawCiphertext: sealedBytes, headerCiphertext: null, keyId: KEY_ID }));
    expect((await billing.quarantineSince(database.pool, since)).find((row) => row.quarantineId === quarantineId))
      .toMatchObject({ reason: "NOTICE_SIGNATURE_INVALID", headerCiphertext: null, orderId });
    expect((await billing.quarantineSince(database.pool, new Date(since.getTime() + 60_000))).map((row) => row.quarantineId)).not.toContain(quarantineId);
  });
  it("stores a saved card, finds it by id and by source charge, lists live tokens, revokes once and purges it", async () => {
    const charge = await netopiaCharge();
    const tokenId = randomUUID();
    const card = {
      tokenId, customerId: randomUUID(), paymentProvider: "netopia" as const, paymentEnvironment: "sandbox" as const,
      sourceChargeId: charge.chargeId, sourceToolOrder: null, sourceNoticeId: null, sourcePaidAt: anchor,
      tokenCiphertext: sealedBytes, keyId: KEY_ID, expMonth: 11, expYear: 2030, last4: "1111", cardCountry: "RO",
      createdAt: new Date(Date.now() - 3 * 86_400_000)
    };
    expect(await inTx((c) => billing.insertCardToken(c, card))).toEqual({ tokenId });
    expect(await billing.cardTokenById(database.pool, tokenId))
      .toMatchObject({ ...card, tokenCiphertext: expect.any(Buffer), revokedAt: null, revocationReason: null });
    expect((await billing.cardTokensFromCharge(database.pool, charge.chargeId)).map((row) => row.tokenId)).toEqual([tokenId]);
    expect((await billing.liveCardTokensOlderThan(database.pool, new Date(Date.now() - 86_400_000))).map((row) => row.tokenId)).toContain(tokenId);
    const revokedAt = new Date(Date.now() - 2 * 86_400_000);
    await inTx((c) => billing.revokeCardToken(c, { tokenId, at: revokedAt, reason: "PLAN_ENDED" }));
    await inTx((c) => billing.revokeCardToken(c, { tokenId, at: new Date(), reason: "ERASURE" }));
    expect(await billing.cardTokenById(database.pool, tokenId)).toMatchObject({ revokedAt, revocationReason: "PLAN_ENDED" });
    expect((await billing.liveCardTokensOlderThan(database.pool, new Date())).map((row) => row.tokenId)).not.toContain(tokenId);
    expect(await billing.purgeRevokedCardTokens(new Date())).toBeGreaterThanOrEqual(1);
    expect(await billing.cardTokenById(database.pool, tokenId)).toBeNull();
  });
  it("records a hosted payment, a status read and a tool order, and runs the short-lived purge", async () => {
    const charge = await netopiaCharge();
    const startedAt = new Date();
    const orderId = `t-${chargeIdOf().slice(0, 30)}`;
    await inTx(async (c) => {
      await billing.insertHostedPayment(c, { chargeId: charge.chargeId, paymentProvider: "netopia", paymentEnvironment: "sandbox",
        providerPaymentId: "6601", redirectCiphertext: sealedBytes, keyId: KEY_ID, startedAt });
      await billing.insertStatusRead(c, { chargeId: charge.chargeId, at: startedAt, outcome: "PENDING" });
      await billing.insertToolOrder(c, { orderId, paymentEnvironment: "sandbox", createdAt: startedAt, purpose: "SANDBOX_RECORDING" });
    });
    expect(await billing.hostedPaymentForCharge(database.pool, charge.chargeId))
      .toMatchObject({ chargeId: charge.chargeId, providerPaymentId: "6601", startedAt, paymentEnvironment: "sandbox" });
    expect(await billing.hostedPaymentForCharge(database.pool, chargeIdOf())).toBeNull();
    expect((await database.pool.query("SELECT outcome FROM billing.status_read WHERE charge_id = $1", [charge.chargeId])).rows)
      .toEqual([{ outcome: "PENDING" }]);
    expect(await billing.toolOrder(database.pool, orderId)).toEqual({ orderId, paymentEnvironment: "sandbox", createdAt: startedAt, purpose: "SANDBOX_RECORDING" });
    expect(await billing.toolOrder(database.pool, `t-${"0".repeat(30)}`)).toBeNull();
    expect(await billing.purgeShortLived(new Date())).toBeGreaterThanOrEqual(0);
  });
  it("brings a live job forward to now, never later, and answers false when none is live", async () => {
    const jobs = new BillingJobQueries(database.pool);
    const ref = chargeIdOf();
    const now = new Date();
    const notBefore = async () => (await database.pool.query<{ not_before: Date }>(
      "SELECT not_before FROM billing.outbox WHERE kind = 'VERIFY_PAYMENT' AND ref = $1", [ref])).rows[0]!.not_before.getTime();
    await inTx((c) => billing.enqueue(c, { kind: "VERIFY_PAYMENT", ref, notBefore: new Date(now.getTime() + 3_600_000), payload: { charge_id: ref } }));
    expect(await inTx((c) => jobs.bringForward(c, "VERIFY_PAYMENT", ref, now))).toBe(true);
    expect(await notBefore()).toBe(now.getTime());
    expect(await inTx((c) => jobs.bringForward(c, "VERIFY_PAYMENT", ref, new Date(now.getTime() + 7_200_000)))).toBe(true);
    expect(await notBefore()).toBe(now.getTime());
    expect(await inTx((c) => jobs.bringForward(c, "VERIFY_PAYMENT", chargeIdOf(), now))).toBe(false);
  });
});

describe("N7 — a NETOPIA subscription through the repository (spec 2026-10-05 §2.5.5)", () => {
  it("folds the seeded NETOPIA plan with its card, and renews it only in its own system", async () => {
    const ownerRef = randomUUID();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 40 * 86_400_000), taxCountry: "RO"
    });
    expect(await billing.subscriptionForOwner(ownerRef)).toMatchObject({
      subscriptionId: seeded.subscriptionId, status: "ACTIVE", paymentProvider: "netopia", paymentEnvironment: "sandbox",
      cardTokenId: seeded.cardTokenId, xmoneyOrderId: null, xmoneyCustomerId: null, cardRef: null,
      currentPeriodEnd: seeded.periodEnd
    });
    expect(await billing.cardTokenById(database.pool, seeded.cardTokenId)).toMatchObject({
      sourceChargeId: seeded.initialChargeId, customerId: seeded.customerId, paymentEnvironment: "sandbox", revokedAt: null
    });
    const charge = await billing.charge(seeded.initialChargeId);
    expect(charge).toMatchObject({ kind: "INITIAL", paymentProvider: "netopia", paymentEnvironment: "sandbox" });
    expect(charge?.events.map((event) => [event.kind, event.providerPaymentId]))
      .toEqual([["REQUESTED", null], ["SUCCEEDED", seeded.providerPaymentId]]);
    const now = new Date(seeded.periodEnd.getTime() + 60_000);
    const dueIn = async (provider: "xmoney" | "netopia", environment: "stage" | "sandbox" | "live") =>
      (await billing.dueRenewals(now, 0, 10_000, { provider, environment })).map((state) => state.subscriptionId);
    expect(await dueIn("netopia", "sandbox")).toContain(seeded.subscriptionId);
    expect(await dueIn("netopia", "live")).not.toContain(seeded.subscriptionId);
    expect(await dueIn("xmoney", "stage")).not.toContain(seeded.subscriptionId);
    expect(await dueIn("xmoney", "live")).not.toContain(seeded.subscriptionId);
    // An xMoney plan stays on the xMoney pass only.
    const xmoneyOwner = randomUUID();
    const xmoneyPlan = await activeSubscription(xmoneyOwner, new Date(now.getTime() - 40 * 86_400_000));
    expect(await dueIn("xmoney", "stage")).toContain(xmoneyPlan);
    expect(await dueIn("netopia", "sandbox")).not.toContain(xmoneyPlan);
  });

  it("adopts a later card with CARD_SAVED, stores it in card_token_id, and refuses a card on any other kind", async () => {
    const ownerRef = randomUUID();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 5 * 86_400_000), taxCountry: "DE"
    });
    const newer = randomUUID();
    await billing.withTransaction((c) => billing.appendSubscriptionEvent(c,
      subscriptionEvent(seeded.subscriptionId, ownerRef, "CARD_SAVED", { cardTokenId: newer })));
    expect((await billing.subscriptionForOwner(ownerRef))?.cardTokenId).toBe(newer);
    const stored = await database.pool.query<{ kind: string; card_token_id: string | null }>(
      "SELECT kind, card_token_id FROM billing.subscription_event WHERE subscription_id = $1 ORDER BY seq", [seeded.subscriptionId]);
    expect(stored.rows).toEqual([
      { kind: "CREATED", card_token_id: null }, { kind: "ACTIVATED", card_token_id: seeded.cardTokenId },
      { kind: "CARD_SAVED", card_token_id: newer }
    ]);
    await expect(billing.withTransaction((c) => billing.appendSubscriptionEvent(c,
      subscriptionEvent(seeded.subscriptionId, ownerRef, "CANCEL_REQUESTED", { cardTokenId: randomUUID() }))))
      .rejects.toMatchObject({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" });
    expect((await billing.subscriptionEvents(seeded.subscriptionId)).map((event) => event.kind))
      .toEqual(["CREATED", "ACTIVATED", "CARD_SAVED"]);
  });
});
