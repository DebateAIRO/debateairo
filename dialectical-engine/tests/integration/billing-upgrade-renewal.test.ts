import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decimalToMicros, foldSubscription } from "@debateai/billing-core";
import { startBillingHarness, type BillingHarness } from "../support/billingHarness.js";
import { testBillingPlans } from "../support/billingFixtures.js";
import { subscriptionDeps } from "../support/billingSubscriptionFixtures.js";
import { renewalLeadMs } from "../../apps/api/src/billing/renewal-rules.js";
import { chargeEvent } from "../../apps/api/src/billing/rows.js";
import { createUpgradeSettlement, quoteUpgrade, startUpgrade } from "../../apps/api/src/billing/upgrade.js";

let h: BillingHarness;
beforeAll(async () => {
  h = await startBillingHarness();
  h.verify.registerSettlement("UPGRADE", createUpgradeSettlement({
    repository: h.repository, entitlements: h.entitlements, plans: testBillingPlans
  }));
}, 120_000);
afterAll(async () => { await h?.stop(); });

const MINUTE = 60_000;
const DAY = 86_400_000;
const IP = "198.51.100.7";
const deps = () => subscriptionDeps(h.database.pool, {
  recordsKey: h.recordsKey, tax: h.tax, xmoney: h.xmoney, geo: h.geo, clock: h.clock.read
});
const renewalCharges = async (subscriptionId: string) =>
  (await h.repository.chargesForSubscription(subscriptionId)).filter((charge) => charge.kind === "RENEWAL");

describe("P12c an upgrade and a renewal are never open together", () => {
  it("holds the renewal back while an upgrade waits for its payment, then renews at the upgraded plan without M3", async () => {
    const paid = await h.activate({ planId: "PLUS" });
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() - 10 * MINUTE);
    const quoted = await quoteUpgrade(deps(), { ownerRef: paid.ownerRef, planId: "MAX", ip: IP, now: h.clock.now });
    expect(await startUpgrade(deps(), { ownerRef: paid.ownerRef, planId: "MAX", quoteRef: quoted.quote_ref }))
      .toMatchObject({ state: "PENDING" });
    h.clock.now = new Date(end.getTime() - MINUTE);
    await h.renewal.runOnce();
    expect(await renewalCharges(paid.subscriptionId)).toEqual([]);
    await h.worker.drain(10);
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).planId).toBe("MAX");
    await h.renewal.runOnce();
    const renewals = await renewalCharges(paid.subscriptionId);
    expect(renewals).toHaveLength(1);
    // A7: the announced total is the MAX recurring total quoted with the upgrade, so no notice and no postponement.
    expect(renewals[0]).toMatchObject({ totalMicros: decimalToMicros(quoted.recurring_total), periodStart: end });
    const kinds = (await h.repository.subscriptionEvents(paid.subscriptionId)).map((event) => event.kind);
    expect(kinds).not.toContain("RENEWAL_NOTICE_SENT");
    expect(kinds).not.toContain("RENEWAL_POSTPONED");
  });

  it("keeps the paid plan through RENEWAL_PENDING while an unknown upgrade holds the renewal past the period end (R2 Q-1)", async () => {
    const paid = await h.activate({ planId: "PLUS" });
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() - 10 * MINUTE);
    const quoted = await quoteUpgrade(deps(), { ownerRef: paid.ownerRef, planId: "MAX", ip: IP, now: h.clock.now });
    // The rebill reached xMoney but its answer was lost: SUBMIT_UNKNOWN, which only an adoption can settle.
    h.xmoney.failNextRebill(paid.transaction.orderId, "XMONEY_OUTCOME_UNKNOWN", true);
    expect(await startUpgrade(deps(), { ownerRef: paid.ownerRef, planId: "MAX", quoteRef: quoted.quote_ref }))
      .toMatchObject({ state: "PENDING" });
    // Inside the lead the renewal waits for the upgrade, and the hold is written before the period end.
    h.clock.now = new Date(end.getTime() - 2 * MINUTE);
    await h.renewal.runOnce();
    h.clock.now = new Date(end.getTime() + 20 * MINUTE);
    await h.renewal.runOnce();
    expect(await renewalCharges(paid.subscriptionId)).toEqual([]);
    // Without the hold this reads FREE: the SUBSCRIBED row is paid only through the period end (A8a).
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({
      planId: "PLUS", cause: "RENEWAL_PENDING", lapsed: false
    });
    expect((await h.entitlementRows(paid.ownerRef)).filter((row) => row.cause === "RENEWAL_PENDING")).toHaveLength(1);
    // P14a's adoption (built later) links the lost payment and hands it to VERIFY_PAYMENT; done here the same way.
    h.clock.now = new Date(end.getTime() + 40 * MINUTE);
    const upgrade = (await h.repository.chargesForSubscription(paid.subscriptionId)).find((row) => row.kind === "UPGRADE")!;
    const lost = (await h.xmoney.listTransactions({ orderId: paid.transaction.orderId, from: upgrade.createdAt }))
      .find((transaction) => transaction.transactionSource === "re-bill")!;
    await h.repository.withTransaction(async (client) => {
      await h.repository.appendChargeEvent(client, chargeEvent(upgrade.chargeId, "SUBMITTED", h.clock.now, {
        providerPaymentId: lost.transactionId, amountMicros: upgrade.totalMicros, errorCode: null
      }));
      await h.repository.enqueue(client, {
        kind: "VERIFY_PAYMENT", ref: lost.transactionId, notBefore: h.clock.now, payload: { charge_id: upgrade.chargeId }
      });
    });
    await h.worker.drain(10);
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).planId).toBe("MAX");
    // Without `upgradedPaidThrough` this reads FREE: the UPGRADED row would be paid only through the period end.
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "MAX", lapsed: false });
    // The renewal now runs at the upgraded plan, charging the announced MAX total with no notice.
    await h.renewal.runOnce();
    const renewals = await renewalCharges(paid.subscriptionId);
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ totalMicros: decimalToMicros(quoted.recurring_total), periodStart: end });
    await h.worker.drain(10);
    const kinds = (await h.repository.subscriptionEvents(paid.subscriptionId)).map((event) => event.kind);
    expect(kinds.at(-1)).toBe("RENEWED");
    expect(kinds).not.toContain("RENEWAL_NOTICE_SENT");
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).planId).toBe("MAX");
  });

  it("refuses an upgrade once the next period's renewal charge exists, whatever this process's clock says", async () => {
    const paid = await h.activate({ planId: "PLUS" });
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() - 20 * MINUTE);
    const quoted = await quoteUpgrade(deps(), { ownerRef: paid.ownerRef, planId: "PRO", ip: IP, now: h.clock.now });
    h.clock.now = new Date(end.getTime() - MINUTE);
    await h.renewal.runOnce();
    expect(await renewalCharges(paid.subscriptionId)).toHaveLength(1);
    // A second API process whose clock is ten minutes behind: the renewal charge itself is the refusal.
    h.clock.now = new Date(end.getTime() - 10 * MINUTE);
    await expect(startUpgrade(deps(), { ownerRef: paid.ownerRef, planId: "PRO", quoteRef: quoted.quote_ref }))
      .rejects.toMatchObject({ code: "UPGRADE_NOT_AVAILABLE_NOW" });
    await expect(quoteUpgrade(deps(), { ownerRef: paid.ownerRef, planId: "PRO", ip: IP, now: h.clock.now }))
      .rejects.toMatchObject({ code: "UPGRADE_NOT_AVAILABLE_NOW" });
    h.clock.now = new Date(end.getTime() + MINUTE);
  });

  it("refunds a day-old upgrade paid once the next period's renewal charge exists, and writes nothing", async () => {
    const paid = await h.activate({ planId: "PLUS" });
    const end = await h.periodEndOf(paid.subscriptionId);
    const plusTotal = foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).announcedTotalMicros;
    h.clock.now = new Date(end.getTime() - 2 * DAY);
    const quoted = await quoteUpgrade(deps(), { ownerRef: paid.ownerRef, planId: "MAX", ip: IP, now: h.clock.now });
    expect(await startUpgrade(deps(), { ownerRef: paid.ownerRef, planId: "MAX", quoteRef: quoted.quote_ref }))
      .toMatchObject({ state: "PENDING" });
    // The upgrade stays SUBMITTED (no drain). A day later it no longer holds the renewal, priced at the old plan.
    h.clock.now = new Date(end.getTime() - MINUTE);
    await h.renewal.runOnce();
    const renewals = await renewalCharges(paid.subscriptionId);
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ totalMicros: plusTotal, periodStart: end });
    // The upgrade's payment verified now, before RENEWED moved the period: as P9b's VERIFY_PAYMENT calls it.
    const upgrade = (await h.repository.chargesForSubscription(paid.subscriptionId)).find((row) => row.kind === "UPGRADE")!;
    const read = (await h.repository.charge(upgrade.chargeId))!;
    const transaction = h.xmoney.transactions.get(read.events.find((event) => event.kind === "SUBMITTED")!.providerPaymentId!)!;
    const quote = (await h.repository.quote(upgrade.quoteId!, paid.ownerRef))!;
    const customer = (await h.repository.customerByOwner(paid.ownerRef))!;
    const rowsBefore = (await h.entitlementRows(paid.ownerRef)).length;
    const settlement = createUpgradeSettlement({ repository: h.repository, entitlements: h.entitlements, plans: testBillingPlans });
    const result = await h.repository.withTransaction(async (client) => {
      const events = await h.repository.subscriptionEvents(paid.subscriptionId, client);
      return settlement.succeeded({
        client, now: h.clock.now, charge: upgrade, transaction, payment: null, subscription: foldSubscription(events), events, quote,
        ownerRef: paid.ownerRef, customerId: customer.customerId, cardCountry: "RO"
      });
    });
    expect(result).toEqual({ kind: "REFUND", reason: "SUBSCRIPTION_ENDED" });
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).some((event) => event.kind === "UPGRADED")).toBe(false);
    expect(await h.entitlementRows(paid.ownerRef)).toHaveLength(rowsBefore);
    // The real VERIFY_PAYMENT jobs: the renewal settles at PLUS, the upgrade goes back in full through RefundDesk.
    await h.worker.drain(10);
    const after = await h.repository.subscriptionEvents(paid.subscriptionId);
    expect(after.at(-1)?.kind).toBe("RENEWED");
    expect(foldSubscription(after).planId).toBe("PLUS");
    expect((await h.repository.charge(upgrade.chargeId))!.events.find((event) => event.kind === "REFUND_REQUESTED"))
      .toMatchObject({ errorCode: "SUBSCRIPTION_ENDED" });
  });

  it("refuses an upgrade quoted inside the renewal's lead", async () => {
    const paid = await h.activate({ planId: "PLUS" });
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() - renewalLeadMs());
    await expect(quoteUpgrade(deps(), { ownerRef: paid.ownerRef, planId: "PRO", ip: IP, now: h.clock.now }))
      .rejects.toMatchObject({ code: "UPGRADE_NOT_AVAILABLE_NOW" });
  });
});
