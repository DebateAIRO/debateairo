import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription } from "@debateai/billing-core";
import { startBillingHarness, type BillingHarness } from "../support/billingHarness.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { mountSubscriptionRoutes, subscriptionDeps, TEST_PUBLIC_APP_URL } from "../support/billingSubscriptionFixtures.js";
import { CancelLinkService, cancelTokenSha256 } from "../../apps/api/src/billing/cancel-link.js";
import { subscriptionEvent } from "../../apps/api/src/billing/rows.js";

let h: BillingHarness;
beforeAll(async () => { h = await startBillingHarness(); }, 120_000);
afterAll(async () => { await h?.stop(); });

const MINUTE = 60_000;
const DAY = 86_400_000;

/** A paid plan whose first renewal attempt was declined: PAST_DUE, with P11a's PAST_DUE_GRACE entitlement. */
async function pastDue(ownerRef: string) {
  const paid = await h.activate({ ownerRef });
  h.clock.now = new Date((await h.periodEndOf(paid.subscriptionId)).getTime() + MINUTE);
  const failedAt = h.clock.now;
  h.xmoney.failNextRebill(paid.transaction.orderId, "XMONEY_PAYMENT_FAILED");
  await h.renewal.runOnce();
  expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).status).toBe("PAST_DUE");
  return { paid, failedAt };
}

const renewals = async (subscriptionId: string) => (await h.repository.chargesForSubscription(subscriptionId))
  .filter((charge) => charge.kind === "RENEWAL").map((charge) => charge.attempt).sort();

const deps = () => subscriptionDeps(h.database.pool, { recordsKey: h.recordsKey, tax: h.tax, clock: h.clock.read });

describe("P12b a cancel while PAST_DUE ends the plan and every retry", () => {
  it("ends the plan at once with a FREE entitlement effective now, M7 for today, and no retry at +1, +3 or +8 days", async () => {
    const identity = testHttpIdentity("p12b-past-due");
    const { paid, failedAt } = await pastDue(identity.authenticated.ownerRef);
    h.clock.now = new Date(failedAt.getTime() + 2 * 60 * MINUTE);
    const cancelledAt = h.clock.now;
    const api = await mountSubscriptionRoutes(deps(), identity);
    const cancelled = await api.inject({
      method: "POST", url: "/v1/billing/subscription/cancel", headers: { "x-test-session": identity.rawSessionToken }
    });
    expect(cancelled.statusCode).toBe(204);
    await api.close();
    const written = await h.repository.subscriptionEvents(paid.subscriptionId);
    expect(written.slice(-2).map((event) => [event.kind, event.data.cause ?? null])).toEqual([
      ["CANCEL_REQUESTED", null], ["ENDED", "CANCEL"]
    ]);
    expect(await h.entitlements.current(paid.ownerRef, cancelledAt)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });
    const m7 = (await h.outboxRows(paid.subscriptionId)).filter((row) => row.kind === "EMAIL" && row.ref.startsWith("M7:"));
    expect(m7).toEqual([expect.objectContaining({
      ref: `M7:${paid.subscriptionId}:${cancelledAt.toISOString()}`,
      // The access ended at once: "ended on", and no undo is offered (D7's `canUndo`).
      payload: expect.objectContaining({ "param.accessEndDate": cancelledAt.toISOString().slice(0, 10), "param.canUndo": "false" })
    })]);
    const rebills = h.xmoney.rebillsFor(paid.transaction.orderId);
    for (const day of [1, 3, 8]) {
      h.clock.now = new Date(failedAt.getTime() + day * DAY + MINUTE);
      await h.maintenance.runOnce();
    }
    expect(await renewals(paid.subscriptionId)).toEqual([1]);
    expect(h.xmoney.rebillsFor(paid.transaction.orderId)).toBe(rebills);
  });

  it("never retries a PAST_DUE subscription with a cancel pending, however the cancel got there (P11b's guard)", async () => {
    const { paid, failedAt } = await pastDue(testHttpIdentity("p12b-guard").authenticated.ownerRef);
    // A CANCEL_REQUESTED left on PAST_DUE by any other path: P11b's pass ends it and never charges it.
    const state = foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId));
    await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client,
      subscriptionEvent(state, "CANCEL_REQUESTED", h.clock.now, { source: "SETTINGS" })));
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toEqual([1]);
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId))).toMatchObject({
      status: "ENDED", endedCause: "CANCEL"
    });
  });

  it("refunds a retry that was already submitted when the cancel came, if it is paid afterwards", async () => {
    const identity = testHttpIdentity("p12b-late-retry");
    const { paid, failedAt } = await pastDue(identity.authenticated.ownerRef);
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toEqual([1, 2]);
    // The retry is SUBMITTED; its VERIFY_PAYMENT has not run yet when the person cancels.
    const api = await mountSubscriptionRoutes(deps(), identity);
    expect((await api.inject({
      method: "POST", url: "/v1/billing/subscription/cancel", headers: { "x-test-session": identity.rawSessionToken }
    })).statusCode).toBe(204);
    await api.close();
    await h.worker.drain(10);
    const retry = (await h.repository.chargesForSubscription(paid.subscriptionId))
      .find((charge) => charge.kind === "RENEWAL" && charge.attempt === 2)!;
    const kinds = (await h.repository.charge(retry.chargeId))!.events.map((event) => [event.kind, event.errorCode]);
    expect(kinds).toEqual(expect.arrayContaining([["REFUND_REQUESTED", "SUBSCRIPTION_ENDED"]]));
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).status).toBe("ENDED");
  });

  it("ends a PAST_DUE plan through the emailed link exactly as through Settings (P13)", async () => {
    const { paid, failedAt } = await pastDue(testHttpIdentity("p13-past-due").authenticated.ownerRef);
    h.clock.now = new Date(failedAt.getTime() + 60 * MINUTE);
    // The link's token as M9 would carry it; only its hash is stored (P1b's insertCancelToken).
    const token = randomBytes(32).toString("base64url");
    await h.repository.withTransaction((client) => h.repository.insertCancelToken(client, {
      tokenSha256: cancelTokenSha256(token), subscriptionId: paid.subscriptionId,
      issuedAt: h.clock.now, expiresAt: new Date(h.clock.now.getTime() + DAY)
    }));
    const links = new CancelLinkService({
      billing: h.repository, jobs: h.jobs, entitlements: h.entitlements,
      identities: { ownerRefByEmailBlindIndex: async () => null }, blindIndexKey: Buffer.alloc(32, 3),
      recordsKey: h.recordsKey, mail: undefined, publicAppUrl: TEST_PUBLIC_APP_URL, audit: h.audit, clock: h.clock.read
    });
    expect(await links.cancelByToken(token)).toBe("CANCELLED");
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).slice(-2).map((event) => event.kind))
      .toEqual(["CANCEL_REQUESTED", "ENDED"]);
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toEqual([1]);
  });
});
