import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription } from "@debateai/billing-core";
import { startBillingHarness, type BillingHarness } from "../support/billingHarness.js";
import { testCountryPolicy } from "../support/billingFixtures.js";
import { subscriptionDeps } from "../support/billingSubscriptionFixtures.js";
import { createCardCheckSettlement, startCardChange } from "../../apps/api/src/billing/card-change.js";
import { chargeStatusOf } from "../../apps/api/src/billing/charge-status.js";

let h: BillingHarness;
beforeAll(async () => {
  h = await startBillingHarness();
  h.verify.registerSettlement("CARD_CHECK", createCardCheckSettlement({
    repository: h.repository, recordsKey: h.recordsKey, countryPolicy: testCountryPolicy, audit: h.audit
  }));
}, 120_000);
afterAll(async () => { await h?.stop(); });

const MINUTE = 60_000;
const DAY = 86_400_000;
const IP = "198.51.100.7";

const cardDeps = () => subscriptionDeps(h.database.pool, {
  recordsKey: h.recordsKey, geo: h.geo, audit: h.audit, clock: h.clock.read, checkout: h.checkoutWith({}),
  accountEmail: { read: async () => "card-change@example.test" }
});

/** Starts a card change for this purchase and pays its 1.00 USD hold with a card issued in `cardCountry`. */
async function changeCard(paid: Awaited<ReturnType<BillingHarness["activate"]>>, cardCountry: string) {
  const started = await startCardChange(cardDeps(), { ownerRef: paid.ownerRef, userId: paid.userId, ip: IP, now: h.clock.now });
  const hold = h.xmoney.pay({ externalOrderId: started.charge_ref, amountDecimal: "1.00", cardCountry });
  await h.settle(hold.transactionId);
  return { chargeRef: started.charge_ref, hold };
}

describe("P12e the card change through VERIFY_PAYMENT", () => {
  it("releases a blocked-country card's hold with no email, keeps the old card, and reads FAILED(CARD_CHECK_REFUSED)", async () => {
    const paid = await h.activate();
    const before = foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId));
    const { chargeRef, hold } = await changeCard(paid, "RU");
    expect(chargeStatusOf((await h.repository.charge(chargeRef))!.events))
      .toEqual({ state: "FAILED", reasonCode: "CARD_CHECK_REFUSED" });
    const rows = await h.outboxRows(chargeRef);
    expect(rows.filter((row) => row.kind === "XMONEY_REFUND")).toEqual([
      expect.objectContaining({ done: true, payload: expect.objectContaining({ reason: "CARD_CHECK_REFUSED", whole: true }) })
    ]);
    // No M11 ("refunded … you stay on Free") and no other mail: nothing was charged and nothing changed.
    expect(rows.filter((row) => row.kind === "EMAIL")).toEqual([]);
    expect(h.xmoney.refunds.map((refund) => refund.transactionId)).toContain(hold.transactionId);
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId))).toMatchObject({
      status: "ACTIVE", planId: before.planId, cardRef: before.cardRef, xmoneyOrderId: before.xmoneyOrderId
    });
  });

  it("retries a past-due renewal at once on the NEW order after the card changed (R-34)", async () => {
    const paid = await h.activate();
    h.clock.now = new Date((await h.periodEndOf(paid.subscriptionId)).getTime() + MINUTE);
    h.xmoney.failNextRebill(paid.transaction.orderId, "XMONEY_PAYMENT_FAILED");
    await h.renewal.runOnce();
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).status).toBe("PAST_DUE");
    h.clock.now = new Date(h.clock.now.getTime() + 2 * 60 * MINUTE);
    const { hold } = await changeCard(paid, "RO");
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({
      kind: "CARD_CHANGED", xmoneyOrderId: hold.orderId, data: { retry_now: true }
    });
    await h.maintenance.runOnce();
    const retry = (await h.repository.chargesForSubscription(paid.subscriptionId))
      .find((charge) => charge.kind === "RENEWAL" && charge.attempt === 2);
    expect(retry).toBeDefined();
    expect((await h.repository.charge(retry!.chargeId))!.events.map((event) => event.kind)).toContain("SUBMITTED");
    expect(h.xmoney.rebillsFor(hold.orderId)).toBe(1);
  });

  it("refuses a card change while a dunning retry's outcome is unknown, and writes no charge (A2)", async () => {
    const paid = await h.activate();
    h.clock.now = new Date((await h.periodEndOf(paid.subscriptionId)).getTime() + MINUTE);
    h.xmoney.failNextRebill(paid.transaction.orderId, "XMONEY_PAYMENT_FAILED");
    await h.renewal.runOnce();
    h.clock.now = new Date(h.clock.now.getTime() + DAY + MINUTE);
    h.xmoney.failNextRebill(paid.transaction.orderId, "XMONEY_OUTCOME_UNKNOWN");
    await h.maintenance.runOnce();
    const retry = (await h.repository.chargesForSubscription(paid.subscriptionId))
      .find((charge) => charge.kind === "RENEWAL" && charge.attempt === 2)!;
    expect((await h.repository.charge(retry.chargeId))!.events.map((event) => event.kind)).toContain("SUBMIT_UNKNOWN");
    // Defense in depth (A2): P11a looks for that payment on every order that could hold it, and the order still
    // does not move under it while the outcome is open.
    await expect(startCardChange(cardDeps(), { ownerRef: paid.ownerRef, userId: paid.userId, ip: IP, now: h.clock.now }))
      .rejects.toMatchObject({ status: 409, code: "CARD_CHANGE_NOT_AVAILABLE_NOW" });
    expect((await h.repository.chargesForSubscription(paid.subscriptionId)).filter((charge) => charge.kind === "CARD_CHECK"))
      .toEqual([]);
  });

  it("releases the hold and keeps the old order when a renewal went unknown before the hold was paid (A2)", async () => {
    const paid = await h.activate();
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() - 10 * MINUTE);
    const started = await startCardChange(cardDeps(), { ownerRef: paid.ownerRef, userId: paid.userId, ip: IP, now: h.clock.now });
    // The renewal is sent and its answer is lost; the payment IS on the old order.
    h.clock.now = new Date(end.getTime() + MINUTE);
    h.xmoney.failNextRebill(paid.transaction.orderId, "XMONEY_OUTCOME_UNKNOWN", true);
    await h.renewal.runOnce();
    h.clock.advance(MINUTE);
    const hold = h.xmoney.pay({ externalOrderId: started.charge_ref, amountDecimal: "1.00", cardCountry: "RO" });
    await h.settle(hold.transactionId);
    expect(chargeStatusOf((await h.repository.charge(started.charge_ref))!.events))
      .toEqual({ state: "FAILED", reasonCode: "CARD_CHECK_DEFERRED" });
    const events = await h.repository.subscriptionEvents(paid.subscriptionId);
    expect(events.some((event) => event.kind === "CARD_CHANGED")).toBe(false);
    expect(foldSubscription(events).xmoneyOrderId).toBe(paid.transaction.orderId);
    const rows = await h.outboxRows(started.charge_ref);
    expect(rows.filter((row) => row.kind === "XMONEY_REFUND")).toEqual([
      expect.objectContaining({ done: true, payload: expect.objectContaining({ reason: "CARD_CHECK_DEFERRED", whole: true }) })
    ]);
    expect(rows.filter((row) => row.kind === "EMAIL")).toEqual([]);
    expect(h.xmoney.refunds.map((refund) => refund.transactionId)).toContain(hold.transactionId);
    expect(h.auditLines.some((line) => line.event === "billing.card.change.deferred")).toBe(true);
    // The order never moved, so P11a finds the lost payment where it was made, and the new card is never charged.
    h.clock.advance(2 * MINUTE);
    await h.renewal.runOnce();
    const renewal = (await h.repository.chargesForSubscription(paid.subscriptionId)).find((charge) => charge.kind === "RENEWAL")!;
    expect((await h.repository.charge(renewal.chargeId))!.events.map((event) => event.kind)).toContain("SUBMITTED");
    expect(h.xmoney.rebillsFor(paid.transaction.orderId)).toBe(1);
    expect(h.xmoney.rebillsFor(hold.orderId)).toBe(0);
  });
});
