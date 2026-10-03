import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addBusinessDays, foldSubscription } from "@debateai/billing-core";
import { BillingMaintenance } from "../../apps/api/src/billing/maintenance.js";
import { addYearsClamped } from "../../apps/api/src/billing/renewal-rules.js";
import { subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { testBillingPolicy } from "../support/billingFixtures.js";
import { kindsOf, startBillingHarness, TEST_PUBLIC_APP_URL, type BillingHarness } from "../support/billingHarness.js";

let h: BillingHarness;
beforeAll(async () => { h = await startBillingHarness(); });
afterAll(async () => { await h?.stop(); });
beforeEach(() => { h.tax.rateOverride.clear(); h.tax.unavailableCountries.clear(); });

const MINUTE = 60_000;
const DAY = 86_400_000;
const kinds = async (subscriptionId: string) => (await h.repository.subscriptionEvents(subscriptionId)).map((event) => event.kind);
const renewals = async (subscriptionId: string) => (await h.repository.chargesForSubscription(subscriptionId))
  .filter((charge) => charge.kind === "RENEWAL").sort((left, right) => left.attempt - right.attempt);
/** W10 (P2-I21): one param of the queued EMAIL job `jobRef` (M5's `bankDeclined` is "true" only for PAYMENT_DECLINED). */
const emailParam = async (jobRef: string, name: string) =>
  (await h.outboxRows(jobRef)).find((row) => row.kind === "EMAIL" && row.ref === jobRef)?.payload[`param.${name}`];
const append = async (subscriptionId: string, kind: Parameters<typeof subscriptionEvent>[1], data: Record<string, string>) => {
  const state = foldSubscription(await h.repository.subscriptionEvents(subscriptionId));
  await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client, subscriptionEvent(state, kind, h.clock.now, data)));
};

async function firstFailure() {
  const paid = await h.activate();
  h.clock.now = new Date((await h.periodEndOf(paid.subscriptionId)).getTime() + MINUTE);
  const failedAt = h.clock.now;
  h.xmoney.failNextRebill(paid.transaction.orderId, "XMONEY_PAYMENT_FAILED");
  await h.renewal.runOnce();
  return { paid, failedAt };
}

/**
 * A German plan whose renewal found the tax service down for Q-1's 72 hours: P11a starts the dunning with no charge.
 * The outage is German only (`unavailableCountries`), so the other subscriptions of this shared harness still price.
 */
async function unpricedDunning() {
  h.geo.country = "DE";
  const paid = await h.activate({ country: "DE", cardCountry: "DE" });
  h.geo.country = "RO";
  const end = await h.periodEndOf(paid.subscriptionId);
  h.tax.unavailableCountries.add("DE");
  h.clock.now = new Date(end.getTime() + 72 * 3_600_000 + MINUTE);
  expect(await h.renewal.renew(paid.subscriptionId)).toBe("dunning");
  expect(await renewals(paid.subscriptionId)).toEqual([]);
  return { paid, end, failedAt: h.clock.now };
}

describe("P11b dunning, the period-end sweep, the yearly reminder and the look-ahead notice", () => {
  it("retries at +1, +3 and +7 days with M5B and M5C, then ends the plan with M6 and moves the person to Free", async () => {
    const { paid, failedAt } = await firstFailure();
    for (const [day, template] of [[1, "M5B"], [3, "M5C"]] as const) {
      h.clock.now = new Date(failedAt.getTime() + day * DAY + MINUTE);
      h.xmoney.failNextRebill(paid.transaction.orderId, "XMONEY_PAYMENT_FAILED");
      await h.maintenance.runOnce();
      const latest = (await renewals(paid.subscriptionId)).at(-1)!;
      expect((await h.outboxRows(latest.chargeId)).map((row) => row.ref)).toContain(`${template}:${latest.chargeId}`);
      // W10 (P2-I21): each retry the bank declined says so.
      expect(await emailParam(`${template}:${latest.chargeId}`, "bankDeclined")).toBe("true");
    }
    h.clock.now = new Date(failedAt.getTime() + 7 * DAY + MINUTE);
    h.xmoney.failNextRebill(paid.transaction.orderId, "XMONEY_PAYMENT_FAILED");
    await h.maintenance.runOnce();
    expect((await renewals(paid.subscriptionId)).map((charge) => charge.attempt)).toEqual([1, 2, 3, 4]);
    const ended = (await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1);
    expect(ended).toMatchObject({ kind: "ENDED", data: { cause: "DUNNING" } });
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "FREE", cause: "ENDED_DUNNING", paidThrough: null });
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref)).toContain(`M6:${paid.subscriptionId}`);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toHaveLength(4);
  });

  it("does not retry early, and recovers the plan when a retry succeeds", async () => {
    const { paid, failedAt } = await firstFailure();
    h.clock.now = new Date(failedAt.getTime() + 12 * 60 * MINUTE);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toHaveLength(1);
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    await h.worker.drain(5);
    expect((await kinds(paid.subscriptionId)).at(-1)).toBe("RECOVERED");
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ cause: "RENEWED" });
  });

  it("retries at once after a card change while past due, and never retries an owner whose erasure is pending (R-34)", async () => {
    const changed = await firstFailure();
    h.clock.now = new Date(changed.failedAt.getTime() + 2 * 60 * MINUTE);
    const state = foldSubscription(await h.repository.subscriptionEvents(changed.paid.subscriptionId));
    await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client,
      subscriptionEvent(state, "CARD_CHANGED", h.clock.now, { retry_now: true }, { xmoneyOrderId: state.xmoneyOrderId!, cardRef: "9555" })));
    await h.maintenance.runOnce();
    expect((await renewals(changed.paid.subscriptionId)).map((charge) => charge.attempt)).toEqual([1, 2]);
    await h.maintenance.runOnce();
    expect(await renewals(changed.paid.subscriptionId)).toHaveLength(2);

    const erasing = await firstFailure();
    h.erasures.add(erasing.paid.ownerRef);
    h.clock.now = new Date(erasing.failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    expect(await renewals(erasing.paid.subscriptionId)).toHaveLength(1);
    h.erasures.delete(erasing.paid.ownerRef);
  });

  it("never retries an owner the age gate froze (0077's age_frozen, through P15's port, R3-2), nor bills the card again", async () => {
    const frozen = await firstFailure();
    const orderId = frozen.paid.transaction.orderId;
    const rebillsAfterFailure = h.xmoney.rebillsFor(orderId);
    h.frozen.add(frozen.paid.ownerRef);
    const stopped = () => h.auditLines.filter((line) => line.event === "billing.renewal.owner_stopped").length;
    const before = stopped();
    // Past the first retry day, and after a card change asking for a retry now: neither brings a charge.
    h.clock.now = new Date(frozen.failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    const state = foldSubscription(await h.repository.subscriptionEvents(frozen.paid.subscriptionId));
    await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client,
      subscriptionEvent(state, "CARD_CHANGED", h.clock.now, { retry_now: true }, { xmoneyOrderId: state.xmoneyOrderId!, cardRef: "9556" })));
    await h.maintenance.runOnce();
    expect(await renewals(frozen.paid.subscriptionId)).toHaveLength(1);
    expect(h.xmoney.rebillsFor(orderId)).toBe(rebillsAfterFailure);
    expect((await kinds(frozen.paid.subscriptionId)).at(-1)).toBe("CARD_CHANGED");
    expect(stopped()).toBeGreaterThan(before);
    h.frozen.delete(frozen.paid.ownerRef);
  });

  it("ends a cancelled plan at its period end, an unpaid checkout after 24 hours, and a disputed plan at its period end", async () => {
    const cancelled = await h.activate();
    await append(cancelled.subscriptionId, "CANCEL_REQUESTED", {});
    const end = await h.periodEndOf(cancelled.subscriptionId);
    const unpaid = await h.buy();
    const disputed = await h.activate();
    h.xmoney.setStatus(disputed.transaction.transactionId, "charge-back");
    await h.settle(disputed.transaction.transactionId);
    h.clock.now = new Date(end.getTime() + MINUTE);
    await h.renewal.runOnce();
    await h.maintenance.runOnce();
    expect(await renewals(cancelled.subscriptionId)).toHaveLength(0);
    expect((await h.repository.subscriptionEvents(cancelled.subscriptionId)).at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "CANCEL" } });
    expect((await h.entitlementRows(cancelled.ownerRef)).at(-1)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });
    expect((await h.repository.subscriptionEvents(unpaid.subscriptionId)).at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED" } });
    expect((await h.repository.subscriptionEvents(disputed.subscriptionId)).at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "DISPUTE" } });
  });

  it("ends access at the sweep when a plan whose renewal was pending through an outage is cancelled (Q-1)", async () => {
    const paid = await h.activate();
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() + MINUTE);
    // The tax service is down at the renewal: Q-1's RENEWAL_PENDING keeps the plan to 72 hours past the end.
    h.tax.failNext("TAX_SERVICE_UNAVAILABLE");
    await expect(h.renewal.renew(paid.subscriptionId)).rejects.toMatchObject({ code: "TAX_SERVICE_UNAVAILABLE" });
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ cause: "RENEWAL_PENDING" });
    // The person cancels; the renewal is no longer due, and the sweep ends the plan.
    await append(paid.subscriptionId, "CANCEL_REQUESTED", {});
    h.clock.advance(MINUTE);
    await h.maintenance.runOnce();
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "CANCEL" } });
    // Free from the sweep, not 72 hours later: the FREE row is dated after the pending one.
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL", periodAnchorAt: end });
    expect(await renewals(paid.subscriptionId)).toHaveLength(0);
  });

  it("sends the yearly reminder once per anniversary", async () => {
    const paid = await h.activate();
    const activated = foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).activatedAt!;
    // An hour past the real first anniversary, whatever 29 February lies between (365 days can fall a day short).
    h.clock.now = new Date(addYearsClamped(activated, 1).getTime() + 60 * MINUTE);
    await h.maintenance.runOnce();
    h.clock.advance(11 * MINUTE);
    await h.maintenance.runOnce();
    const reminders = (await h.outboxRows(paid.subscriptionId)).filter((row) => row.ref === `M4:${paid.subscriptionId}:1`);
    expect(reminders).toHaveLength(1);
  });

  it("announces a changed total 10 business days ahead, and then renews at the new total without postponing", async () => {
    const paid = await h.activate();
    const end = await h.periodEndOf(paid.subscriptionId);
    h.tax.rateOverride.set("RO", 1_900);
    // 12 calendar days before the end: inside the 10-business-day look-ahead and more than 7 business days
    // ahead, from any weekday.
    h.clock.now = new Date(end.getTime() - 12 * DAY);
    expect(addBusinessDays(h.clock.now, 10).getTime()).toBeGreaterThanOrEqual(end.getTime());
    expect(addBusinessDays(h.clock.now, 7).getTime()).toBeLessThanOrEqual(end.getTime());
    await h.maintenance.runOnce();
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref)).toContain(`${paid.subscriptionId}:${end.toISOString()}`);
    await h.worker.drain(5);
    // W12 (A7): the notice counts once its email went out.
    expect(await kinds(paid.subscriptionId)).not.toContain("RENEWAL_NOTICE_SENT");
    await h.mail.drain();
    const noticed = (await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1);
    expect(noticed).toMatchObject({ kind: "RENEWAL_NOTICE_SENT", data: { announced_total_micros: 23_800_000 } });
    h.clock.now = new Date(end.getTime() + MINUTE);
    await h.renewal.runOnce();
    expect(await kinds(paid.subscriptionId)).not.toContain("RENEWAL_POSTPONED");
    const charged = await renewals(paid.subscriptionId);
    expect(charged).toHaveLength(1);
    expect(charged[0]).toMatchObject({ totalMicros: 23_800_000, periodStart: end });
  });

  it("announces the real charge date when the look-ahead notice goes out less than 7 business days before the end", async () => {
    const paid = await h.activate();
    const end = await h.periodEndOf(paid.subscriptionId);
    h.tax.rateOverride.set("RO", 1_900);
    h.clock.now = new Date(end.getTime() - 2 * DAY);
    await h.maintenance.runOnce();
    await h.worker.drain(5);
    const noticeRef = `M3:${paid.subscriptionId}:${end.toISOString()}:23800000`;
    const notice = (await h.outboxRows(paid.subscriptionId)).find((row) => row.ref === noticeRef);
    // Not the period end, which is closer than the 7-business-day notice: the day the renewal will really charge.
    expect(notice?.payload).toMatchObject({ "param.chargeDate": addBusinessDays(h.clock.now, 7).toISOString() });
    expect(addBusinessDays(h.clock.now, 7).getTime()).toBeGreaterThan(end.getTime());
  });

  it("ends a PAST_DUE plan the person cancelled at once: no retry (so no M5B), Free from now (spec §1.3)", async () => {
    const { paid, failedAt } = await firstFailure();
    await append(paid.subscriptionId, "CANCEL_REQUESTED", {});
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toHaveLength(1);
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "CANCEL" } });
    expect(await kinds(paid.subscriptionId)).not.toContain("RECOVERED");
    // The plan in force, not merely a row: the FREE row is dated now, after the grace row, so it wins.
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });
    h.clock.advance(3 * DAY);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toHaveLength(1);
  });

  it("refunds a retry submitted before the person cancelled, instead of recovering the plan", async () => {
    const { paid, failedAt } = await firstFailure();
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    const retry = (await renewals(paid.subscriptionId)).at(-1)!;
    expect(retry.attempt).toBe(2);
    // The rebill answered; its VERIFY_PAYMENT has not run yet when the cancel lands.
    await append(paid.subscriptionId, "CANCEL_REQUESTED", {});
    await h.worker.drain(10);
    expect(await h.eventKinds(retry.chargeId)).toEqual(kindsOf("REQUESTED", "SUBMITTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    expect((await h.repository.charge(retry.chargeId))!.events.find((event) => event.kind === "REFUND_REQUESTED"))
      .toMatchObject({ errorCode: "SUBSCRIPTION_ENDED" });
    expect(await kinds(paid.subscriptionId)).not.toContain("RECOVERED");
    h.clock.advance(11 * MINUTE);
    await h.maintenance.runOnce();
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "CANCEL" } });
  });

  it("prices a retry afresh after a dunning that began with no charge, charges the announced total and recovers (Q-1, A7)", async () => {
    const { paid, end, failedAt } = await unpricedDunning();
    // A day on the tax service answers: the retry is quoted now and, its total being the announced one (A7), charged
    // as attempt 2; VERIFY_PAYMENT recovers.
    h.tax.unavailableCountries.delete("DE");
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    const [retry] = await renewals(paid.subscriptionId);
    expect(retry).toMatchObject({ attempt: 2, periodStart: end, totalMicros: 23_800_000 });
    // Its own quote row, made at the retry: nothing was copied from an earlier attempt (there was none to copy).
    expect(await h.repository.quote(retry!.quoteId!, paid.ownerRef)).toMatchObject({ kind: "RENEWAL", createdAt: h.clock.now });
    await h.worker.drain(10);
    expect((await kinds(paid.subscriptionId)).at(-1)).toBe("RECOVERED");
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "PLUS", cause: "RENEWED", paidThrough: retry!.periodEnd });
    // The next pass makes no further attempt.
    h.clock.advance(11 * MINUTE);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toHaveLength(1);
  });

  it("charges a retry exactly the failed attempt's total after a VAT-rate change, never re-priced (P2-M10)", async () => {
    const { paid, failedAt } = await firstFailure();
    const [failed] = await renewals(paid.subscriptionId);
    expect(failed).toMatchObject({ attempt: 1, totalMicros: 24_200_000 });
    const failedQuote = (await h.repository.quote(failed!.quoteId!, paid.ownerRef))!;
    // Romania's VAT rate changes while the plan is past due: a fresh quote would now be 23.80.
    h.tax.rateOverride.set("RO", 1_900);
    const quotes = vi.spyOn(h.tax, "quote");
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    const retry = (await renewals(paid.subscriptionId)).at(-1)!;
    expect(retry).toMatchObject({
      attempt: 2, netMicros: failed!.netMicros, taxMicros: failed!.taxMicros, totalMicros: 24_200_000
    });
    // Its own quote row, a copy of the failed attempt's prices; the tax service was not asked again.
    expect(retry.quoteId).not.toBe(failed!.quoteId);
    expect(await h.repository.quote(retry.quoteId!, paid.ownerRef)).toMatchObject({
      kind: "RENEWAL", planId: failedQuote.planId, netMicros: failedQuote.netMicros, taxMicros: failedQuote.taxMicros,
      totalMicros: failedQuote.totalMicros, taxRateBasisPoints: failedQuote.taxRateBasisPoints, taxCountry: "RO",
      createdAt: h.clock.now
    });
    expect(quotes).not.toHaveBeenCalled();
    quotes.mockRestore();
    await h.worker.drain(10);
    expect((await kinds(paid.subscriptionId)).at(-1)).toBe("RECOVERED");
  });

  it("never charges a changed total after a dunning that began with no charge: the attempt fails with no charge (P2-M10, A7)", async () => {
    const { paid, end, failedAt } = await unpricedDunning();
    const rebills = h.xmoney.rebillsFor(paid.transaction.orderId);
    // The tax service answers again, but at a rate the person was never told (19 % then, 20 % now).
    h.tax.unavailableCountries.delete("DE");
    h.tax.rateOverride.set("DE", 2_000);
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toEqual([]);
    expect(h.xmoney.rebillsFor(paid.transaction.orderId)).toBe(rebills);
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({
      kind: "PAST_DUE", data: { attempt: 2, reason: "RETRY_TOTAL_CHANGED", first_failed_at: failedAt.toISOString() }
    });
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref)).toContain(`M5B:${paid.subscriptionId}:${end.toISOString()}:2`);
    // W10 (P2-I21, the W5 judge's forward): no charge was made, so M5B never says a bank refused.
    expect(await emailParam(`M5B:${paid.subscriptionId}:${end.toISOString()}:2`, "bankDeclined")).toBe("false");
    // A second pass the same day records nothing more.
    h.clock.advance(11 * MINUTE);
    await h.maintenance.runOnce();
    expect((await kinds(paid.subscriptionId)).filter((kind) => kind === "PAST_DUE")).toHaveLength(2);
  });

  it("ends the plan with M6 when the tax service stays down through every retry (Q-1)", async () => {
    const { paid, end, failedAt } = await unpricedDunning();
    for (const [day, attempt, template] of [[1, 2, "M5B"], [3, 3, "M5C"]] as const) {
      h.clock.now = new Date(failedAt.getTime() + day * DAY + MINUTE);
      await h.maintenance.runOnce();
      expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({
        kind: "PAST_DUE", data: { attempt, reason: "TAX_SERVICE_UNAVAILABLE", first_failed_at: failedAt.toISOString() }
      });
      expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref))
        .toContain(`${template}:${paid.subscriptionId}:${end.toISOString()}:${attempt}`);
      // W10 (P2-I21): the tax service was down, no card was asked.
      expect(await emailParam(`${template}:${paid.subscriptionId}:${end.toISOString()}:${attempt}`, "bankDeclined")).toBe("false");
      // Once per retry day: a second pass the same day records nothing more.
      h.clock.advance(11 * MINUTE);
      await h.maintenance.runOnce();
      expect((await kinds(paid.subscriptionId)).filter((kind) => kind === "PAST_DUE")).toHaveLength(attempt);
    }
    h.clock.now = new Date(failedAt.getTime() + 7 * DAY + MINUTE);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toEqual([]);
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ENDED", data: { cause: "DUNNING", reason: "TAX_SERVICE_UNAVAILABLE" } });
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "FREE", cause: "ENDED_DUNNING", paidThrough: null });
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref)).toContain(`M6:${paid.subscriptionId}`);
  });

  it("never retries, nor announces a renewal for, a subscription of the other xMoney system, but still ends its cancel (D5 5h)", async () => {
    // The live runtime's pass, on the same database as the harness's stage subscriptions.
    const live = new BillingMaintenance({
      repository: h.repository, jobs: h.jobs, entitlements: h.entitlements, renewal: h.renewal, policy: testBillingPolicy,
      publicAppUrl: TEST_PUBLIC_APP_URL, xmoneyEnvironment: "live", audit: h.audit, clock: h.clock.read
    });
    const { paid: pastDue, failedAt } = await firstFailure();
    const orderId = pastDue.transaction.orderId;
    const rebillsAfterFailure = h.xmoney.rebillsFor(orderId);
    const cancelled = await h.activate();
    await append(cancelled.subscriptionId, "CANCEL_REQUESTED", {});
    const cancelEnd = await h.periodEndOf(cancelled.subscriptionId);
    const noticed = await h.activate();
    const noticedEnd = await h.periodEndOf(noticed.subscriptionId);

    // Past the first retry day: the live pass makes no attempt 2 and bills nothing.
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await live.runOnce();
    expect(await renewals(pastDue.subscriptionId)).toHaveLength(1);
    expect(h.xmoney.rebillsFor(orderId)).toBe(rebillsAfterFailure);
    expect((await h.repository.subscriptionEvents(pastDue.subscriptionId)).at(-1)).toMatchObject({ kind: "PAST_DUE", data: { attempt: 1 } });

    // A changed total inside the look-ahead: the live pass queues no notice (P11a's live renewal never renews it).
    h.tax.rateOverride.set("RO", 1_900);
    h.clock.now = new Date(noticedEnd.getTime() - 12 * DAY);
    await live.runOnce();
    expect((await h.outboxRows(noticed.subscriptionId)).map((row) => row.ref)).not.toContain(`${noticed.subscriptionId}:${noticedEnd.toISOString()}`);
    h.tax.rateOverride.clear();

    // A cancel pending past the period end IS ended by it (no xMoney call; README §14.8 step 1).
    h.clock.now = new Date(Math.max(cancelEnd.getTime(), noticedEnd.getTime()) + MINUTE);
    await live.runOnce();
    expect((await h.repository.subscriptionEvents(cancelled.subscriptionId)).at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "CANCEL" } });
    expect(await h.entitlements.current(cancelled.ownerRef, h.clock.now)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });
    expect(await renewals(pastDue.subscriptionId)).toHaveLength(1);
    expect(h.xmoney.rebillsFor(orderId)).toBe(rebillsAfterFailure);

    // The control: the harness's own stage pass does retry that plan.
    await h.maintenance.runOnce();
    expect((await renewals(pastDue.subscriptionId)).map((charge) => charge.attempt)).toEqual([1, 2]);
    expect(h.xmoney.rebillsFor(orderId)).toBe(rebillsAfterFailure + 1);
  });
});
