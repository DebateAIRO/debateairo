import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription } from "@debateai/billing-core";
import { startBillingHarness, type BillingHarness } from "../support/billingHarness.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { mountSubscriptionRoutes, subscriptionDeps } from "../support/billingSubscriptionFixtures.js";

let h: BillingHarness;
beforeAll(async () => { h = await startBillingHarness(); }, 120_000);
afterAll(async () => { await h?.stop(); });

const MINUTE = 60_000;

const deps = () => subscriptionDeps(h.database.pool, { recordsKey: h.recordsKey, tax: h.tax, clock: h.clock.read });

async function cancel(identity: ReturnType<typeof testHttpIdentity>): Promise<number> {
  const api = await mountSubscriptionRoutes(deps(), identity);
  try {
    return (await api.inject({
      method: "POST", url: "/v1/billing/subscription/cancel", headers: { "x-test-session": identity.rawSessionToken }
    })).statusCode;
  } finally {
    await api.close();
  }
}

async function revoke(identity: ReturnType<typeof testHttpIdentity>): Promise<number> {
  const api = await mountSubscriptionRoutes(deps(), identity);
  try {
    return (await api.inject({
      method: "POST", url: "/v1/billing/subscription/cancel-revoke", headers: { "x-test-session": identity.rawSessionToken }
    })).statusCode;
  } finally {
    await api.close();
  }
}

const renewalCharges = async (subscriptionId: string) => (await h.repository.chargesForSubscription(subscriptionId))
  .filter((charge) => charge.kind === "RENEWAL");
const subscriptionKinds = async (subscriptionId: string) =>
  (await h.repository.subscriptionEvents(subscriptionId)).map((event) => event.kind);
const m7Of = async (subscriptionId: string) => (await h.outboxRows(subscriptionId))
  .filter((row) => row.kind === "EMAIL" && row.ref.startsWith("M7:"));

describe("P12b a cancel after the renewal started ends the plan, and the renewal's money goes back", () => {
  it("refunds a renewal adopted after a cancel that came while its outcome was unknown (R2 Q-1)", async () => {
    const identity = testHttpIdentity("p12b-race-unknown");
    const paid = await h.activate({ ownerRef: identity.authenticated.ownerRef });
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() + MINUTE);
    // NETOPIA made the charge, but its answer was lost: SUBMIT_UNKNOWN, and RENEWAL_PENDING keeps the plan.
    h.payments.failNextCharge(paid.subscriptionId, "PAID_ANSWER_LOST");
    await h.renewal.runOnce();
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect(charge).toMatchObject({ attempt: 1, periodStart: end });
    expect((await h.repository.charge(charge!.chargeId))!.events.map((event) => event.kind)).toContain("SUBMIT_UNKNOWN");
    h.clock.advance(2 * MINUTE);
    const cancelledAt = h.clock.now;
    expect(await cancel(identity)).toBe(204);
    expect((await subscriptionKinds(paid.subscriptionId)).slice(-2)).toEqual(["CANCEL_REQUESTED", "ENDED"]);
    expect((await m7Of(paid.subscriptionId))[0]?.payload).toMatchObject({
      "param.accessEndDate": cancelledAt.toISOString().slice(0, 10), "param.canUndo": "false"
    });
    // P11a's recovery reads NETOPIA's status of the same order (spec §2.9.3) and hands the payment to VERIFY_PAYMENT:
    // no second charge.
    h.clock.advance(2 * MINUTE);
    await h.renewal.runOnce();
    expect(h.payments.chargesFor(paid.subscriptionId)).toBe(1);
    await h.worker.drain(10);
    const recorded = (await h.repository.charge(charge!.chargeId))!.events;
    expect(recorded.map((event) => event.kind)).toContain("SUBMITTED");
    expect(recorded.map((event) => [event.kind, event.errorCode]))
      .toEqual(expect.arrayContaining([["REFUND_REQUESTED", "SUBSCRIPTION_ENDED"]]));
    expect(await subscriptionKinds(paid.subscriptionId)).not.toContain("RENEWED");
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId))).toMatchObject({
      status: "ENDED", endedCause: "CANCEL"
    });
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });
  });

  it("ends the plan and refunds the renewal when the cancel comes inside the renewal's lead, after the charge", async () => {
    const identity = testHttpIdentity("p12b-race-lead");
    const paid = await h.activate({ ownerRef: identity.authenticated.ownerRef });
    const end = await h.periodEndOf(paid.subscriptionId);
    // Two minutes before the period end: inside the 5-minute lead, so the renewal is charged now.
    h.clock.now = new Date(end.getTime() - 2 * MINUTE);
    await h.renewal.runOnce();
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect((await h.repository.charge(charge!.chargeId))!.events.map((event) => event.kind)).toEqual(["REQUESTED", "SUBMITTED"]);
    // Its VERIFY_PAYMENT has not run yet when the person cancels.
    const cancelledAt = h.clock.now;
    expect(await cancel(identity)).toBe(204);
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId))).toMatchObject({
      status: "ENDED", endedCause: "CANCEL"
    });
    // The paid access ends now, two minutes early (the recorded cost of this rule), and there is nothing to undo.
    expect((await m7Of(paid.subscriptionId))[0]).toMatchObject({
      ref: `M7:${paid.subscriptionId}:${cancelledAt.toISOString()}`,
      payload: expect.objectContaining({
        "param.accessEndDate": cancelledAt.toISOString().slice(0, 10), "param.canUndo": "false"
      })
    });
    expect(await h.entitlements.current(paid.ownerRef, cancelledAt)).toMatchObject({
      planId: "FREE", cause: "ENDED_CANCEL", periodAnchorAt: cancelledAt
    });
    expect(await revoke(identity)).toBe(409);
    // NETOPIA's PAID status is read: the plan is no longer live, so the money goes back and nothing renews.
    await h.worker.drain(10);
    const kinds = (await h.repository.charge(charge!.chargeId))!.events.map((event) => [event.kind, event.errorCode]);
    expect(kinds).toEqual(expect.arrayContaining([["REFUND_REQUESTED", "SUBSCRIPTION_ENDED"]]));
    expect(await subscriptionKinds(paid.subscriptionId)).not.toContain("RENEWED");
  });

  it("keeps a cancel before the renewal as a cancel at the period end, and the renewal never charges (control)", async () => {
    const identity = testHttpIdentity("p12b-race-control");
    const paid = await h.activate({ ownerRef: identity.authenticated.ownerRef });
    const end = await h.periodEndOf(paid.subscriptionId);
    // Ten minutes before the end: outside the lead, and no RENEWAL charge exists.
    h.clock.now = new Date(end.getTime() - 10 * MINUTE);
    expect(await cancel(identity)).toBe(204);
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId))).toMatchObject({
      status: "ACTIVE", cancelRequested: true
    });
    expect((await m7Of(paid.subscriptionId))[0]).toMatchObject({
      ref: `M7:${paid.subscriptionId}:${end.toISOString()}`,
      payload: expect.objectContaining({ "param.accessEndDate": end.toISOString().slice(0, 10), "param.canUndo": "true" })
    });
    h.clock.now = new Date(end.getTime() - 2 * MINUTE);
    await h.renewal.runOnce();
    h.clock.now = new Date(end.getTime() + MINUTE);
    await h.renewal.runOnce();
    expect(await renewalCharges(paid.subscriptionId)).toEqual([]);
    expect(h.payments.chargesFor(paid.subscriptionId)).toBe(0);
    // P11b's period-end sweep ends it, as before this rule.
    await h.maintenance.runOnce();
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId))).toMatchObject({
      status: "ENDED", endedCause: "CANCEL"
    });
  });
});

async function downgrade(identity: ReturnType<typeof testHttpIdentity>, plan: "PLUS" | "PRO") {
  const api = await mountSubscriptionRoutes(deps(), identity);
  try {
    return await api.inject({
      method: "POST", url: "/v1/billing/subscription/downgrade",
      headers: { "x-test-session": identity.rawSessionToken }, payload: { plan_id: plan }
    });
  } finally {
    await api.close();
  }
}

describe("P12b a downgrade after the renewal charge is written is refused, not moved a month on", () => {
  it("refuses DOWNGRADE_NOT_AVAILABLE_NOW once the renewal is charged at the current plan, which then renews", async () => {
    const identity = testHttpIdentity("p12b-downgrade-race");
    const paid = await h.activate({ ownerRef: identity.authenticated.ownerRef, planId: "PRO" });
    const end = await h.periodEndOf(paid.subscriptionId);
    // Inside the lead: P11a writes the RENEWAL charge for the next period, priced at PRO.
    h.clock.now = new Date(end.getTime() - 4 * MINUTE);
    await h.renewal.runOnce();
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect(charge).toMatchObject({ periodStart: end, netMicros: 50_000_000 });
    // Two minutes later the person picks PLUS: the renewal is under way, so nothing is scheduled.
    h.clock.advance(2 * MINUTE);
    const refused = await downgrade(identity, "PLUS");
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: "DOWNGRADE_NOT_AVAILABLE_NOW", message: "DOWNGRADE_NOT_AVAILABLE_NOW" });
    expect(await subscriptionKinds(paid.subscriptionId)).not.toContain("DOWNGRADE_SCHEDULED");
    // The PRO charge succeeds and settles as a renewal at PRO; no downgrade waits for the month after.
    await h.worker.drain(10);
    const written = await h.repository.subscriptionEvents(paid.subscriptionId);
    expect(written.at(-1)).toMatchObject({ kind: "RENEWED", planId: "PRO" });
    expect(written.map((event) => event.kind)).not.toContain("DOWNGRADED");
    expect(foldSubscription(written)).toMatchObject({ status: "ACTIVE", planId: "PRO", scheduledDowngradePlanId: null });
  });

  it("accepts a downgrade inside the lead while no renewal charge exists yet, and the renewal is priced at it (control)", async () => {
    const identity = testHttpIdentity("p12b-downgrade-lead");
    const paid = await h.activate({ ownerRef: identity.authenticated.ownerRef, planId: "PRO" });
    const end = await h.periodEndOf(paid.subscriptionId);
    // Inside the lead, before P11a's pass has written anything (as during a tax outage, when no charge is priced).
    h.clock.now = new Date(end.getTime() - 4 * MINUTE);
    expect(await renewalCharges(paid.subscriptionId)).toEqual([]);
    expect((await downgrade(identity, "PLUS")).statusCode).toBe(204);
    expect((await subscriptionKinds(paid.subscriptionId)).at(-1)).toBe("DOWNGRADE_SCHEDULED");
    h.clock.advance(2 * MINUTE);
    await h.renewal.runOnce();
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect(charge).toMatchObject({ periodStart: end, netMicros: 20_000_000 });
    await h.worker.drain(10);
    const written = await h.repository.subscriptionEvents(paid.subscriptionId);
    expect(written.slice(-2).map((event) => [event.kind, event.planId])).toEqual([["DOWNGRADED", "PLUS"], ["RENEWED", "PLUS"]]);
    expect(foldSubscription(written)).toMatchObject({ status: "ACTIVE", planId: "PLUS", scheduledDowngradePlanId: null });
  });
});
