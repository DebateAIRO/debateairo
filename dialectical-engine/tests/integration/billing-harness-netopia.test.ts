import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription } from "@debateai/billing-core";
import { startBillingHarness, type BillingHarness } from "../support/billingHarness.js";

/**
 * N24: the in-memory harness on NETOPIA's port (spec 2026-10-05 §2.3). A plan starts from a PAID status with the card
 * its first payment saved; a renewal charges that card; the scripted outcomes reach the renewal as NETOPIA's would.
 */
let h: BillingHarness;
beforeAll(async () => { h = await startBillingHarness(); }, 120_000);
afterAll(async () => { await h?.stop(); });

const MINUTE = 60_000;
const state = async (subscriptionId: string) => foldSubscription(await h.repository.subscriptionEvents(subscriptionId));

describe("N24 the billing harness pays through NETOPIA's port", () => {
  it("activates a plan from NETOPIA's PAID status with the card its first payment saved", async () => {
    // A German buyer on a German connection (the harness's geo answers Romania otherwise, which asks to confirm).
    h.geo.country = "DE";
    const paid = await h.activate({ country: "DE", cardCountry: "DE" });
    h.geo.country = "RO";
    expect(paid.payment).toMatchObject({ orderId: paid.chargeId, state: "PAID", cardCountry: "DE" });
    expect(await state(paid.subscriptionId)).toMatchObject({
      status: "ACTIVE", paymentProvider: "netopia", paymentEnvironment: "sandbox", cardTokenId: paid.cardTokenId
    });
    expect(h.payments.hosted.map((start) => start.orderId)).toContain(paid.chargeId);
    expect(await h.eventKinds(paid.chargeId)).toEqual(expect.arrayContaining(["REQUESTED", "SUBMITTED", "SUCCEEDED"]));
  });

  it("renews on the saved card, and a declined renewal moves the plan to PAST_DUE", async () => {
    const paid = await h.activate();
    h.clock.now = new Date((await h.periodEndOf(paid.subscriptionId)).getTime() + MINUTE);
    await h.renewal.runOnce();
    await h.worker.drain(10);
    expect([h.payments.chargesFor(paid.subscriptionId), h.payments.madeFor(paid.subscriptionId)]).toEqual([1, 1]);
    // This subscription's own charge: the shared harness's earlier plans fall due on the same clock.
    const [renewal] = (await h.repository.chargesForSubscription(paid.subscriptionId)).filter((charge) => charge.kind === "RENEWAL");
    expect(h.payments.charges.find((charge) => charge.orderId === renewal!.chargeId))
      .toMatchObject({ amountMicros: 24_200_000, currency: "USD" });
    expect((await state(paid.subscriptionId)).status).toBe("ACTIVE");
    h.payments.failNextCharge(paid.subscriptionId, "DECLINED");
    h.clock.now = new Date((await h.periodEndOf(paid.subscriptionId)).getTime() + MINUTE);
    await h.renewal.runOnce();
    await h.worker.drain(10);
    expect([h.payments.chargesFor(paid.subscriptionId), h.payments.madeFor(paid.subscriptionId)]).toEqual([2, 1]);
    expect((await state(paid.subscriptionId)).status).toBe("PAST_DUE");
  });

  it("settles a renewal whose answer was lost from NETOPIA's status, and never charges it twice", async () => {
    const paid = await h.activate();
    h.payments.failNextCharge(paid.subscriptionId, "PAID_ANSWER_LOST");
    h.clock.now = new Date((await h.periodEndOf(paid.subscriptionId)).getTime() + MINUTE);
    await h.renewal.runOnce();
    await h.worker.drain(10);
    h.clock.advance(61 * MINUTE);
    await h.renewal.runOnce();
    await h.worker.drain(10);
    expect(h.payments.madeFor(paid.subscriptionId)).toBe(1);
    expect((await state(paid.subscriptionId)).status).toBe("ACTIVE");
    const renewal = (await h.repository.chargesForSubscription(paid.subscriptionId)).find((charge) => charge.kind === "RENEWAL")!;
    expect(await h.eventKinds(renewal.chargeId)).toEqual(expect.arrayContaining(["SUBMIT_UNKNOWN", "SUCCEEDED"]));
  });

  it("knows a started page as untouched (status 1) until it is paid, so the same purchase again gets the same page (spec §2.6.3)", async () => {
    const first = await h.buy();
    expect(await h.payments.status({ orderId: first.chargeId, providerPaymentId: null }))
      .toMatchObject({ orderId: first.chargeId, state: "PENDING", providerStatus: "1" });
    const again = await h.buy({ ownerRef: first.ownerRef });
    expect([again.chargeId, again.reused]).toEqual([first.chargeId, true]);
    expect(h.payments.hosted.filter((start) => start.orderId === first.chargeId)).toHaveLength(1);
  });
});
