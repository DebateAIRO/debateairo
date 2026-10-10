// tests/integration/billing-other-system-records.test.ts
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SubscriptionEvent } from "@debateai/billing-core";
import { BillingRepository, migrate, type ChargeRow } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let billing: BillingRepository;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  billing = new BillingRepository(database.pool);
}, 600_000);
afterAll(async () => { await database?.stop(); });

const LIVE = Object.freeze({ paymentProvider: "netopia", paymentEnvironment: "live" } as const);
const anchor = new Date("2026-10-01T09:00:00.000Z");
type System = Readonly<Record<string, string>>;

function event(subscriptionId: string, ownerRef: string, kind: SubscriptionEvent["kind"], extra: Partial<SubscriptionEvent> = {}): SubscriptionEvent {
  return {
    eventId: randomUUID(), subscriptionId, ownerRef, kind, at: anchor, planId: "PLUS", periodAnchorAt: null,
    cardTokenId: null, data: {}, ...extra
  };
}

async function active(ownerRef: string, created: System): Promise<string> {
  const subscriptionId = randomUUID();
  await billing.withTransaction(async (client) => {
    await billing.appendSubscriptionEvent(client, event(subscriptionId, ownerRef, "CREATED", { data: created }));
    // N23: an old plan (no payment_provider in CREATED) folds without its order now; the column stays for old rows.
    await billing.appendSubscriptionEvent(client, event(subscriptionId, ownerRef, "ACTIVATED", {
      periodAnchorAt: anchor, data: { announced_total_micros: 24_200_000, recurring_net_micros: 20_000_000 }
    }));
  });
  return subscriptionId;
}

/** A card check needs no quote (0086's charge_card_check_has_no_quote), so it is the smallest open charge. */
async function openCardCheck(ownerRef: string, subscriptionId: string, system: "sandbox" | "live"): Promise<string> {
  const chargeId = randomUUID().replaceAll("-", "");
  const charge: ChargeRow = {
    chargeId, ownerRef, subscriptionId, kind: "CARD_CHECK", attempt: 1, periodStart: anchor,
    periodEnd: new Date(anchor.getTime() + 30 * 86_400_000), quoteId: null, netMicros: 0, taxMicros: 0, totalMicros: 0,
    currency: "USD", createdAt: anchor, paymentProvider: "netopia", paymentEnvironment: system
  };
  await billing.withTransaction((client) => billing.insertCharge(client, charge));
  return chargeId;
}

describe("N8 — what is still open outside NETOPIA live (spec §2.5.4)", () => {
  it("counts xMoney-era and NETOPIA sandbox subscriptions, charges and jobs, never the live system's own", async () => {
    const before = await billing.openOtherSystemRecordCounts(LIVE);
    const ownerRef = randomUUID();
    const own = await active(ownerRef, { payment_provider: "netopia", payment_environment: "live" });
    const ownCharge = await openCardCheck(ownerRef, own, "live");
    await billing.withTransaction((client) => billing.enqueue(client, {
      kind: "SMARTBILL_INVOICE", ref: ownCharge, notBefore: anchor, payload: { card_country: "RO" }
    }));
    expect(await billing.openOtherSystemRecordCounts(LIVE)).toEqual(before);

    const sandboxOwner = randomUUID();
    const sandbox = await active(sandboxOwner, { payment_provider: "netopia", payment_environment: "sandbox" });
    const legacyOwner = randomUUID();
    const legacy = await active(legacyOwner, { xmoney_environment: "stage" });
    expect(await billing.openOtherSystemRecordCounts(LIVE))
      .toEqual({ ...before, subscriptions: before.subscriptions + 2 });
    const sandboxCharge = await openCardCheck(sandboxOwner, sandbox, "sandbox");
    const jobId = await billing.withTransaction((client) => billing.enqueue(client, {
      kind: "QUADERNO_RECORD_SALE", ref: sandboxCharge, notBefore: anchor, payload: {}
    }));
    expect(await billing.openOtherSystemRecordCounts(LIVE))
      .toEqual({ subscriptions: before.subscriptions + 2, charges: before.charges + 1, jobs: before.jobs + 1 });

    // Settled: a final event on the charge, a cancel pending on both plans, the job done.
    await billing.withTransaction((client) => billing.appendChargeEvent(client, {
      chargeId: sandboxCharge, kind: "FAILED", at: anchor, providerPaymentId: null, amountMicros: null, errorCode: "PAYMENT_DECLINED"
    }));
    await billing.withTransaction(async (client) => {
      await billing.appendSubscriptionEvent(client, event(sandbox, sandboxOwner, "CANCEL_REQUESTED"));
      await billing.appendSubscriptionEvent(client, event(legacy, legacyOwner, "CANCEL_REQUESTED"));
    });
    await billing.complete(jobId, new Date());
    expect(await billing.openOtherSystemRecordCounts(LIVE)).toEqual(before);
    // The sandbox system's own view is the mirror image: the live plan is "other" to it.
    expect((await billing.openOtherSystemRecordCounts({ paymentProvider: "netopia", paymentEnvironment: "sandbox" })).subscriptions)
      .toBeGreaterThanOrEqual(1);
  });
});

describe("F7 — open NETOPIA plans of one environment (final review data-2: the sandbox boot's guard)", () => {
  it("counts live NETOPIA plans until they end or are withdrawn, never a sandbox or previous processor's plan", async () => {
    const before = await billing.openNetopiaSubscriptionCount("live");
    const liveOwner = randomUUID();
    const live = await active(liveOwner, { payment_provider: "netopia", payment_environment: "live" });
    await active(randomUUID(), { payment_provider: "netopia", payment_environment: "sandbox" });
    await active(randomUUID(), { xmoney_environment: "stage" });
    expect(await billing.openNetopiaSubscriptionCount("live")).toBe(before + 1);
    // A cancel pending leaves the live plan open: its paid month still runs on a live card.
    await billing.withTransaction((client) => billing.appendSubscriptionEvent(client, event(live, liveOwner, "CANCEL_REQUESTED")));
    expect(await billing.openNetopiaSubscriptionCount("live")).toBe(before + 1);
    await billing.withTransaction((client) => billing.appendSubscriptionEvent(client, event(live, liveOwner, "WITHDRAWN", {
      data: { withdrew_at: anchor.toISOString() }
    })));
    expect(await billing.openNetopiaSubscriptionCount("live")).toBe(before);
    expect(await billing.openNetopiaSubscriptionCount("sandbox")).toBeGreaterThanOrEqual(1);
  });
});
