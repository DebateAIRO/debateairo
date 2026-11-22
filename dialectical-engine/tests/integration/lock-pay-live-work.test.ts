// Real payments on the hosted preview, the way back: the sandbox boot refuses while live NETOPIA work is still open
// after the last live plan ended (main.ts's billing-live-records-on-sandbox, preview only). A withdrawn plan is over at
// once, while its refund and its credit note are still to come; a sandbox API would end those jobs unrun and could not
// record the refund. These cases run BillingRepository.openNetopiaChargeWork on the migrated schema.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription } from "@debateai/billing-core";
import { BillingRepository, migrate, type ChargeRow } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { seedNetopiaSubscription } from "../support/billingSubscriptionFixtures.js";
import { chargeEvent, subscriptionEvent } from "../../apps/api/src/billing/rows.js";

let database: TestDatabase;
let billing: BillingRepository;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  billing = new BillingRepository(database.pool);
}, 600_000);
afterAll(async () => { await database?.stop(); });

const DAY = 86_400_000;
const work = () => billing.openNetopiaChargeWork("live");
const paidPlan = (paymentEnvironment: "sandbox" | "live") => seedNetopiaSubscription(database.pool, {
  ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(Date.now() - 2 * DAY), taxCountry: "RO", paymentEnvironment
});
type Seeded = Awaited<ReturnType<typeof paidPlan>>;

async function withdraw(seeded: Seeded, at = new Date()): Promise<void> {
  await billing.withTransaction(async (client) => {
    const state = foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId, client));
    await billing.appendSubscriptionEvent(client, subscriptionEvent(state, "WITHDRAWN", at, { withdrew_at: at.toISOString() }));
  });
}
/** A card check needs no quote, so it is the smallest charge whose payment is not final yet. */
async function openCardCheck(seeded: Seeded): Promise<string> {
  const chargeId = randomUUID().replaceAll("-", "");
  const charge: ChargeRow = {
    chargeId, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "CARD_CHECK", attempt: 1,
    periodStart: seeded.periodStart, periodEnd: seeded.periodEnd, quoteId: null, netMicros: 0, taxMicros: 0, totalMicros: 0,
    currency: "USD", createdAt: new Date(), paymentProvider: "netopia", paymentEnvironment: seeded.paymentEnvironment
  };
  await billing.withTransaction((client) => billing.insertCharge(client, charge));
  return chargeId;
}
async function event(chargeId: string, kind: "REFUND_REQUESTED" | "REFUNDED" | "CHARGEBACK" | "CHARGEBACK_RESOLVED" | "FAILED",
  providerPaymentId: string | null, amountMicros: number | null, errorCode: string | null = null): Promise<void> {
  await billing.withTransaction((client) => billing.appendChargeEvent(client, chargeEvent(chargeId, kind, new Date(), {
    providerPaymentId, amountMicros, errorCode
  })));
}
const enqueue = (kind: "VERIFY_PAYMENT" | "SMARTBILL_STORNO" | "SMARTBILL_INVOICE", ref: string, payload: Record<string, string | number>) =>
  billing.withTransaction((client) => billing.enqueue(client, { kind, ref, notBefore: new Date(), payload }));

describe("the live charges' open work, which the preview's sandbox boot waits for", () => {
  it("counts the owner's withdrawn live plan while its refund is not recorded, part by part, and its credit-note job until it ends", async () => {
    const before = await work();
    const seeded = await paidPlan("live");
    expect(await work(), "a paid live plan leaves no charge work").toEqual(before);
    await withdraw(seeded);
    expect(await billing.openNetopiaSubscriptionCount("live"), "the withdrawn plan is over at once").toBe(0);
    await event(seeded.initialChargeId, "REFUND_REQUESTED", seeded.providerPaymentId, seeded.totalMicros, "WITHDRAWAL");
    expect(await work()).toEqual({ charges: before.charges + 1, jobs: before.jobs });
    // The owner records the refund in two parts: the request stays open until they cover it.
    await event(seeded.initialChargeId, "REFUNDED", seeded.providerPaymentId, 10_000, "WITHDRAWAL");
    expect(await work()).toEqual({ charges: before.charges + 1, jobs: before.jobs });
    const storno = await enqueue("SMARTBILL_STORNO", `${seeded.initialChargeId}:${seeded.providerPaymentId}`, {
      charge_id: seeded.initialChargeId, transaction_id: seeded.providerPaymentId, refund_micros: seeded.totalMicros
    });
    expect(await work()).toEqual({ charges: before.charges + 1, jobs: before.jobs + 1 });
    await event(seeded.initialChargeId, "REFUNDED", seeded.providerPaymentId, seeded.totalMicros - 10_000, "WITHDRAWAL");
    expect(await work()).toEqual({ charges: before.charges, jobs: before.jobs + 1 });
    // A job that ended either way (done, or dead) is no open work.
    await billing.complete(storno, new Date());
    expect(await work()).toEqual(before);
    const invoice = await enqueue("SMARTBILL_INVOICE", seeded.initialChargeId, { card_country: "RO", ip_country: "RO" });
    expect(await work()).toEqual({ charges: before.charges, jobs: before.jobs + 1 });
    await billing.fail(invoice, "INVOICE_SERVICE_REFUSED", null, new Date());
    expect(await work()).toEqual(before);
  });

  it("counts a live payment not final while its plan is open, never once the plan is withdrawn; a sandbox one never", async () => {
    const before = await work();
    const live = await paidPlan("live");
    const check = await openCardCheck(live);
    expect(await work()).toEqual({ charges: before.charges + 1, jobs: before.jobs });
    const verify = await enqueue("VERIFY_PAYMENT", check, { charge_id: check });
    expect(await work()).toEqual({ charges: before.charges + 1, jobs: before.jobs + 1 });
    await event(check, "FAILED", null, null, "PAYMENT_DECLINED");
    await billing.complete(verify, new Date());
    expect(await work()).toEqual(before);

    const sandbox = await paidPlan("sandbox");
    const sandboxCheck = await openCardCheck(sandbox);
    await enqueue("VERIFY_PAYMENT", sandboxCheck, { charge_id: sandboxCheck });
    await event(sandbox.initialChargeId, "REFUND_REQUESTED", sandbox.providerPaymentId, sandbox.totalMicros, "WITHDRAWAL");
    expect(await work(), "sandbox work never counts as live").toEqual(before);
    expect((await billing.openNetopiaChargeWork("sandbox")).charges).toBeGreaterThanOrEqual(2);

    const withdrawn = await paidPlan("live");
    await openCardCheck(withdrawn);
    expect((await work()).charges).toBe(before.charges + 1);
    await withdraw(withdrawn);
    expect(await work(), "the rule of the live start's own count: a payment of a plan already over is not waited for").toEqual(before);
  });

  it("the owner's read-only checks before going back run on the migrated schema and count the same work", async () => {
    // The texts the way-back steps give the owner, each printing one count that must be 0 before the swap.
    const count = async (sql: string) => Number((await database.pool.query<{ count: string }>(sql)).rows[0]!.count);
    const OPEN_LIVE_PLANS = "SELECT count(*) FROM billing.subscription_latest_v s JOIN billing.subscription_event c ON c.subscription_id = s.subscription_id AND c.kind = 'CREATED' WHERE jsonb_extract_path_text(c.data, 'payment_provider') = 'netopia' AND jsonb_extract_path_text(c.data, 'payment_environment') = 'live' AND s.kind NOT IN ('ENDED', 'WITHDRAWN')";
    const LIVE_PAYMENTS_NOT_FINAL = "SELECT count(*) FROM billing.charge c WHERE c.payment_provider = 'netopia' AND c.payment_environment = 'live' AND NOT EXISTS (SELECT 1 FROM billing.charge_event f WHERE f.charge_id = c.charge_id AND f.kind IN ('SUCCEEDED', 'FAILED')) AND NOT EXISTS (SELECT 1 FROM billing.subscription_latest_v s WHERE s.subscription_id = c.subscription_id AND s.kind IN ('ENDED', 'WITHDRAWN'))";
    const OPEN_LIVE_REFUNDS = "SELECT count(*) FROM billing.charge_event r WHERE r.kind = 'REFUND_REQUESTED' AND r.payment_provider = 'netopia' AND r.payment_environment = 'live' AND r.amount_micros > 0 AND COALESCE((SELECT sum(d.amount_micros) FROM billing.charge_event d WHERE d.charge_id = r.charge_id AND d.kind = 'REFUNDED' AND COALESCE(d.refunds_transaction_id, d.provider_payment_id) = r.provider_payment_id), 0) < r.amount_micros";
    const UNSETTLED_LIVE_OWNER_WITHDRAWALS = "SELECT count(*) FROM billing.subscription_event w JOIN billing.subscription_event c ON c.subscription_id = w.subscription_id AND c.kind = 'CREATED' WHERE w.kind = 'WITHDRAWN' AND jsonb_extract_path_text(w.data, 'refund_by_owner') = 'true' AND jsonb_extract_path_text(c.data, 'payment_environment') = 'live' AND NOT EXISTS (SELECT 1 FROM billing.withdrawal_owner_settlement s WHERE s.subscription_id = w.subscription_id)";
    const OPEN_LIVE_JOBS = "SELECT count(*) FROM billing.outbox j WHERE j.done_at IS NULL AND j.dead_at IS NULL AND EXISTS (SELECT 1 FROM billing.charge c WHERE c.payment_provider = 'netopia' AND c.payment_environment = 'live' AND (c.charge_id = jsonb_extract_path_text(j.payload, 'charge_id') OR c.charge_id = jsonb_extract_path_text(j.payload, 'external_order_id') OR (j.kind IN ('QUADERNO_RECORD_SALE', 'SMARTBILL_INVOICE') AND c.charge_id = j.ref)))";
    const all = async () => Promise.all([OPEN_LIVE_PLANS, LIVE_PAYMENTS_NOT_FINAL, OPEN_LIVE_REFUNDS, UNSETTLED_LIVE_OWNER_WITHDRAWALS, OPEN_LIVE_JOBS].map(count));
    const before = await all();
    const beforeWork = await work();

    const seeded = await paidPlan("live");
    const check = await openCardCheck(seeded);
    expect(await all()).toEqual([before[0]! + 1, before[1]! + 1, before[2], before[3], before[4]]);
    await event(check, "FAILED", null, null, "PAYMENT_DECLINED");
    await withdraw(seeded);
    await event(seeded.initialChargeId, "REFUND_REQUESTED", seeded.providerPaymentId, seeded.totalMicros, "WITHDRAWAL");
    const storno = await enqueue("SMARTBILL_STORNO", `${seeded.initialChargeId}:${seeded.providerPaymentId}`, {
      charge_id: seeded.initialChargeId, transaction_id: seeded.providerPaymentId, refund_micros: seeded.totalMicros
    });
    expect(await all()).toEqual([before[0], before[1], before[2]! + 1, before[3], before[4]! + 1]);
    expect(await work()).toEqual({ charges: beforeWork.charges + 1, jobs: beforeWork.jobs + 1 });
    await event(seeded.initialChargeId, "REFUNDED", seeded.providerPaymentId, seeded.totalMicros, "WITHDRAWAL");
    await billing.complete(storno, new Date());
    expect(await all()).toEqual(before);
    expect(await work()).toEqual(beforeWork);

    // A withdrawal handed to the owner (a refund made in NETOPIA's admin touched the payment) waits for his settlement.
    const handed = await paidPlan("live");
    await billing.withTransaction(async (client) => {
      const state = foldSubscription(await billing.subscriptionEvents(handed.subscriptionId, client));
      await billing.appendSubscriptionEvent(client, subscriptionEvent(state, "WITHDRAWN", new Date(), {
        withdrew_at: new Date().toISOString(), refund_micros: null, refund_by_owner: true
      }));
    });
    expect(await all()).toEqual([before[0], before[1], before[2], before[3]! + 1, before[4]]);
  });

  it("leaves out a refund an open charge-back holds, and counts it again once the dispute is recorded won", async () => {
    const before = await work();
    const seeded = await paidPlan("live");
    await withdraw(seeded);
    await event(seeded.initialChargeId, "REFUND_REQUESTED", seeded.providerPaymentId, seeded.totalMicros, "WITHDRAWAL");
    expect((await work()).charges).toBe(before.charges + 1);
    await event(seeded.initialChargeId, "CHARGEBACK", seeded.providerPaymentId, seeded.totalMicros);
    expect(await work()).toEqual(before);
    await event(seeded.initialChargeId, "CHARGEBACK_RESOLVED", seeded.providerPaymentId, null);
    expect((await work()).charges).toBe(before.charges + 1);
  });
});
