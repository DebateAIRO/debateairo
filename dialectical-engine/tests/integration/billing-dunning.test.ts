import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { addBusinessDays, foldSubscription } from "@debateai/billing-core";
import { renderMail } from "@debateai/mail-templates";
import { BillingMaintenance, NO_CARD_STEPS } from "../../apps/api/src/billing/maintenance.js";
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

/** B2: the queued EMAIL job `jobRef`'s template and params, and its English text as `renderMail` gives it. */
async function queuedEmail(jobRef: string) {
  const row = (await h.outboxRows(jobRef)).find((candidate) => candidate.kind === "EMAIL" && candidate.ref === jobRef);
  if (row === undefined) throw new Error(`no EMAIL job ${jobRef}`);
  const template = row.payload.template as "M5A" | "M5B" | "M5C";
  const params = Object.fromEntries(Object.entries(row.payload)
    .filter(([name]) => name.startsWith("param.")).map(([name, value]) => [name.slice("param.".length), String(value)]));
  return { template, params, text: renderMail(template, "en", params).text };
}

/** The renewal fails at NETOPIA as `DECLINED` with refusal code `declineCode` (B2: only "20" is retried by itself). */
async function firstFailure(declineCode = "20") {
  const paid = await h.activate();
  h.clock.now = new Date((await h.periodEndOf(paid.subscriptionId)).getTime() + MINUTE);
  const failedAt = h.clock.now;
  h.payments.failNextCharge(paid.subscriptionId, "DECLINED", declineCode);
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
      h.payments.failNextCharge(paid.subscriptionId, "DECLINED");
      await h.maintenance.runOnce();
      const latest = (await renewals(paid.subscriptionId)).at(-1)!;
      expect((await h.outboxRows(latest.chargeId)).map((row) => row.ref)).toContain(`${template}:${latest.chargeId}`);
      // W10 (P2-I21): each retry the bank declined says so.
      expect(await emailParam(`${template}:${latest.chargeId}`, "bankDeclined")).toBe("true");
    }
    h.clock.now = new Date(failedAt.getTime() + 7 * DAY + MINUTE);
    h.payments.failNextCharge(paid.subscriptionId, "DECLINED");
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
    const cardTokenId = await h.storeCardToken(changed.paid.chargeId);
    await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client,
      subscriptionEvent(state, "CARD_CHANGED", h.clock.now, { retry_now: true }, { cardTokenId })));
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
    const orderId = frozen.paid.subscriptionId;
    const rebillsAfterFailure = h.payments.chargesFor(orderId);
    h.frozen.add(frozen.paid.ownerRef);
    const stopped = () => h.auditLines.filter((line) => line.event === "billing.renewal.owner_stopped").length;
    const before = stopped();
    // Past the first retry day, and after a card change asking for a retry now: neither brings a charge.
    h.clock.now = new Date(frozen.failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    const state = foldSubscription(await h.repository.subscriptionEvents(frozen.paid.subscriptionId));
    const cardTokenId = await h.storeCardToken(frozen.paid.chargeId);
    await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client,
      subscriptionEvent(state, "CARD_CHANGED", h.clock.now, { retry_now: true }, { cardTokenId })));
    await h.maintenance.runOnce();
    expect(await renewals(frozen.paid.subscriptionId)).toHaveLength(1);
    expect(h.payments.chargesFor(orderId)).toBe(rebillsAfterFailure);
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
    h.payments.setState(disputed.chargeId, "CHARGEBACK_OPENED");
    await h.settle(disputed.chargeId);
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

  it("names the plan the reminder's price is for: a scheduled downgrade's plan, never the current one (P2-M14)", async () => {
    const paid = await h.activate({ planId: "PRO" });
    const state = foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId));
    // DOWNGRADE_SCHEDULED (P12b) announces the lower plan's total; the plan renews at it from the next period.
    await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client, subscriptionEvent(
      state, "DOWNGRADE_SCHEDULED", h.clock.now, { announced_total_micros: 24_200_000, recurring_net_micros: 20_000_000 },
      { planId: "PLUS" }
    )));
    h.clock.now = new Date(addYearsClamped(state.activatedAt!, 1).getTime() + 60 * MINUTE);
    await h.maintenance.runOnce();
    const reminder = (await h.outboxRows(paid.subscriptionId)).find((row) => row.ref === `M4:${paid.subscriptionId}:1`);
    expect(reminder?.payload).toMatchObject({ template: "M4", "param.plan": "PLUS", "param.totalAmount": "24.20" });
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
    // NETOPIA answered the charge; its VERIFY_PAYMENT has not run yet when the cancel lands.
    await append(paid.subscriptionId, "CANCEL_REQUESTED", {});
    await h.worker.drain(10);
    expect(await h.eventKinds(retry.chargeId)).toEqual(kindsOf("REQUESTED", "SUBMITTED", "SUCCEEDED", "REFUND_REQUESTED"));
    expect((await h.repository.charge(retry.chargeId))!.events.find((event) => event.kind === "REFUND_REQUESTED"))
      .toMatchObject({ errorCode: "SUBSCRIPTION_ENDED" });
    // Spec §2.12.2, the owner mode: the whole retry is handed to the owner to refund in NETOPIA's admin.
    expect(await h.ownerRefundsDue(retry.chargeId)).toEqual([
      expect.objectContaining({ refundAmount: "24.20", refundReason: "SUBSCRIPTION_ENDED", whole: "true" })
    ]);
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
    const rebills = h.payments.chargesFor(paid.subscriptionId);
    // The tax service answers again, but at a rate the person was never told (19 % then, 20 % now).
    h.tax.unavailableCountries.delete("DE");
    h.tax.rateOverride.set("DE", 2_000);
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    expect(await renewals(paid.subscriptionId)).toEqual([]);
    expect(h.payments.chargesFor(paid.subscriptionId)).toBe(rebills);
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

  it("never retries, nor announces a renewal for, a subscription of the other NETOPIA system, but still ends its cancel (D5 5h)", async () => {
    // The live runtime's pass, on the same database as the harness's sandbox subscriptions.
    const live = new BillingMaintenance({
      repository: h.repository, jobs: h.jobs, entitlements: h.entitlements, renewal: h.renewal, policy: testBillingPolicy,
      publicAppUrl: TEST_PUBLIC_APP_URL, paymentEnvironment: "live", audit: h.audit, clock: h.clock.read
    });
    const { paid: pastDue, failedAt } = await firstFailure();
    const orderId = pastDue.subscriptionId;
    const rebillsAfterFailure = h.payments.chargesFor(orderId);
    const cancelled = await h.activate();
    await append(cancelled.subscriptionId, "CANCEL_REQUESTED", {});
    const cancelEnd = await h.periodEndOf(cancelled.subscriptionId);
    const noticed = await h.activate();
    const noticedEnd = await h.periodEndOf(noticed.subscriptionId);

    // Past the first retry day: the live pass makes no attempt 2 and bills nothing.
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    await live.runOnce();
    expect(await renewals(pastDue.subscriptionId)).toHaveLength(1);
    expect(h.payments.chargesFor(orderId)).toBe(rebillsAfterFailure);
    expect((await h.repository.subscriptionEvents(pastDue.subscriptionId)).at(-1)).toMatchObject({ kind: "PAST_DUE", data: { attempt: 1 } });

    // A changed total inside the look-ahead: the live pass queues no notice (P11a's live renewal never renews it).
    h.tax.rateOverride.set("RO", 1_900);
    h.clock.now = new Date(noticedEnd.getTime() - 12 * DAY);
    await live.runOnce();
    expect((await h.outboxRows(noticed.subscriptionId)).map((row) => row.ref)).not.toContain(`${noticed.subscriptionId}:${noticedEnd.toISOString()}`);
    h.tax.rateOverride.clear();

    // A cancel pending past the period end IS ended by it (no NETOPIA call; README §14.8 step 1).
    h.clock.now = new Date(Math.max(cancelEnd.getTime(), noticedEnd.getTime()) + MINUTE);
    await live.runOnce();
    expect((await h.repository.subscriptionEvents(cancelled.subscriptionId)).at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "CANCEL" } });
    expect(await h.entitlements.current(cancelled.ownerRef, h.clock.now)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });
    expect(await renewals(pastDue.subscriptionId)).toHaveLength(1);
    expect(h.payments.chargesFor(orderId)).toBe(rebillsAfterFailure);

    // The control: the harness's own sandbox pass does retry that plan.
    await h.maintenance.runOnce();
    expect((await renewals(pastDue.subscriptionId)).map((charge) => charge.attempt)).toEqual([1, 2]);
    expect(h.payments.chargesFor(orderId)).toBe(rebillsAfterFailure + 1);
  });

  it("ends a dunning the owner's shorter retry days left with no retry day: ENDED(DUNNING), Free and M6 (P2-M13)", async () => {
    // The owner publishes a billing policy whose dunning has one retry day where the plan was dunned under three.
    const shorter = new BillingMaintenance({
      repository: h.repository, jobs: h.jobs, entitlements: h.entitlements, renewal: h.renewal,
      policy: { ...testBillingPolicy, dunningRetryDays: [1] },
      publicAppUrl: TEST_PUBLIC_APP_URL, paymentEnvironment: "sandbox", audit: h.audit, clock: h.clock.read
    });
    // Two attempts failed under +1/+3/+7: the plan waits for its +3 retry, which the new policy no longer has.
    const { paid, failedAt } = await firstFailure();
    const orderId = paid.subscriptionId;
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    h.payments.failNextCharge(orderId, "DECLINED");
    await h.maintenance.runOnce();
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({ kind: "PAST_DUE", data: { attempt: 2 } });
    const rebills = h.payments.chargesFor(orderId);
    await shorter.runOnce();
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "DUNNING" } });
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).status).toBe("ENDED");
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "FREE", cause: "ENDED_DUNNING", paidThrough: null });
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref)).toContain(`M6:${paid.subscriptionId}`);
    // Nothing is charged for it, and the next pass writes nothing more.
    expect(await renewals(paid.subscriptionId)).toHaveLength(2);
    expect(h.payments.chargesFor(orderId)).toBe(rebills);
    const written = (await h.repository.subscriptionEvents(paid.subscriptionId)).length;
    await shorter.runOnce();
    expect(await h.repository.subscriptionEvents(paid.subscriptionId)).toHaveLength(written);

    // The control: a plan with its one failed attempt still has the +1 retry day under that policy, and is retried.
    const retried = await firstFailure();
    h.clock.now = new Date(retried.failedAt.getTime() + DAY + MINUTE);
    await shorter.runOnce();
    expect((await renewals(retried.paid.subscriptionId)).map((charge) => charge.attempt)).toEqual([1, 2]);
    expect((await h.repository.subscriptionEvents(retried.paid.subscriptionId)).some((event) => event.kind === "ENDED")).toBe(false);
  });
});

describe("B2 only refusal 20 is retried by itself (NETOPIA answers 2026-10-21, Q15)", () => {
  /** The sentences that promise a retry, which a refusal not retried by itself must never get. */
  const PROMISES = ["while we try again", "We will try again", "We will make one last try", "Our second try"];

  it("never charges a card refused with code 22 again: charge-less attempts on the retry days, M5A–C say so, then the end", async () => {
    const { paid, failedAt } = await firstFailure("22");
    const orderId = paid.subscriptionId;
    const [first] = await renewals(orderId);
    // The policy's last retry day (+1/+3/+7): the day the plan ends unless a card is added.
    const endDate = new Date(failedAt.getTime() + 7 * DAY).toISOString();
    const m5a = await queuedEmail(`M5A:${first!.chargeId}`);
    expect(m5a.params).toMatchObject({ endDate, bankDeclined: "true" });
    expect(m5a.text).toContain("We couldn't take this month's payment for your Plus plan, and we won't try this card again.");
    expect(m5a.text).toContain("Your bank refused the payment.");
    expect(m5a.text).toContain("To keep it after that, add a card, and we'll take the payment from it straight away: ");
    for (const promise of PROMISES) expect(m5a.text).not.toContain(promise);
    const sent = h.payments.chargesFor(orderId);
    for (const [day, attempt, template] of [[1, 2, "M5B"], [3, 3, "M5C"]] as const) {
      h.clock.now = new Date(failedAt.getTime() + day * DAY + MINUTE);
      await h.maintenance.runOnce();
      // No saved-card charge is sent, and no charge row is made: the attempt fails with no charge on its retry day.
      expect(h.payments.chargesFor(orderId), `+${day} days`).toBe(sent);
      expect(await renewals(orderId)).toHaveLength(1);
      expect((await h.repository.subscriptionEvents(orderId)).at(-1)).toMatchObject({
        kind: "PAST_DUE", data: { attempt, reason: "REFUSAL_NOT_RETRIED", auto_retry: false }
      });
      const email = await queuedEmail(`${template}:${orderId}:${first!.periodStart.toISOString()}:${attempt}`);
      expect(email.template).toBe(template);
      expect(email.params).toMatchObject({ endDate, bankDeclined: "false" });
      expect(email.text).toContain("and we won't try this card again.");
      for (const promise of PROMISES) expect(email.text, template).not.toContain(promise);
      expect(email.text).toContain(template === "M5C"
        ? "This is our last reminder. If you don't add a card by "
        : "To keep it after that, add a card, and we'll take the payment from it straight away: ");
      // A second pass the same day writes nothing more.
      const written = (await h.repository.subscriptionEvents(orderId)).length;
      await h.maintenance.runOnce();
      expect(await h.repository.subscriptionEvents(orderId)).toHaveLength(written);
    }
    h.clock.now = new Date(failedAt.getTime() + 7 * DAY + MINUTE);
    await h.maintenance.runOnce();
    expect(h.payments.chargesFor(orderId)).toBe(sent);
    expect((await h.repository.subscriptionEvents(orderId)).at(-1)).toMatchObject({
      kind: "ENDED", data: { cause: "DUNNING", reason: "REFUSAL_NOT_RETRIED" }
    });
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "FREE", cause: "ENDED_DUNNING", paidThrough: null });
    expect((await h.outboxRows(orderId)).map((row) => row.ref)).toContain(`M6:${orderId}`);
    expect(await renewals(orderId)).toHaveLength(1);
  });

  it("retries code 20 (insufficient funds) by itself with a NEW orderID at +1 day; its M5A and M5B promise the retry as before", async () => {
    const { paid, failedAt } = await firstFailure("20");
    const orderId = paid.subscriptionId;
    const [first] = await renewals(orderId);
    const m5a = await queuedEmail(`M5A:${first!.chargeId}`);
    expect(m5a.params.endDate).toBeUndefined();
    expect(m5a.params.retryDate).toBe(new Date(failedAt.getTime() + DAY).toISOString());
    expect(m5a.text).toContain("You keep your plan while we try again.");
    expect(m5a.text).toContain("We will try again on ");
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    h.payments.failNextCharge(orderId, "DECLINED", "20");
    await h.maintenance.runOnce();
    const charges = await renewals(orderId);
    expect(charges.map((charge) => charge.attempt)).toEqual([1, 2]);
    expect(charges[1]!.chargeId).not.toBe(first!.chargeId);
    expect(sentFor(charges[1]!.chargeId)).toHaveLength(1);
    expect((await h.repository.subscriptionEvents(orderId)).at(-1)).toMatchObject({
      kind: "PAST_DUE", data: { attempt: 2, charge_id: charges[1]!.chargeId, decline_code: "20", auto_retry: true }
    });
    const m5b = await queuedEmail(`M5B:${charges[1]!.chargeId}`);
    expect(m5b.params.endDate).toBeUndefined();
    expect(m5b.text).toContain("Our second try did not work either. We will try again on ");
  });

  it("charges at once with the new card after a card change, after a refusal not retried by itself and after its charge-less attempt", async () => {
    // Straight after the refusal: the card change asks for a retry now (R-34), so the new card is charged at once.
    const changedEarly = await firstFailure("22");
    h.clock.now = new Date(changedEarly.failedAt.getTime() + 2 * 60 * MINUTE);
    const earlyCard = await changeCard(changedEarly.paid.subscriptionId, changedEarly.paid.chargeId);
    await h.maintenance.runOnce();
    const early = await renewals(changedEarly.paid.subscriptionId);
    expect(early.map((charge) => charge.attempt)).toEqual([1, 2]);
    expect(sentFor(early[1]!.chargeId).map((charge) => charge.cardToken.reveal())).toEqual([expect.stringContaining(earlyCard.slice(0, 8))]);
    expect((await h.repository.subscriptionEvents(changedEarly.paid.subscriptionId)).some((event) =>
      event.data.reason === "REFUSAL_NOT_RETRIED")).toBe(false);

    // After a charge-less attempt on the first retry day: the card change still retries at once, with the new card.
    const changedLater = await firstFailure("22");
    const orderId = changedLater.paid.subscriptionId;
    h.clock.now = new Date(changedLater.failedAt.getTime() + DAY + MINUTE);
    await h.maintenance.runOnce();
    expect((await h.repository.subscriptionEvents(orderId)).at(-1)).toMatchObject({
      kind: "PAST_DUE", data: { attempt: 2, reason: "REFUSAL_NOT_RETRIED" }
    });
    h.clock.advance(60 * MINUTE);
    const laterCard = await changeCard(orderId, changedLater.paid.chargeId);
    await h.maintenance.runOnce();
    const later = await renewals(orderId);
    expect(later.map((charge) => charge.attempt)).toEqual([1, 3]);
    expect(sentFor(later[1]!.chargeId).map((charge) => charge.cardToken.reveal())).toEqual([expect.stringContaining(laterCard.slice(0, 8))]);
    await h.worker.drain(5);
    expect((await kinds(orderId)).at(-1)).toBe("RECOVERED");
  });

  it("keeps retrying a dunning already under way when this shipped: a PAST_DUE with no auto_retry is retried at +1 day", async () => {
    // Review Focus 4: a PAST_DUE written before B2 names neither auto_retry nor decline_code. The stand-in: the same
    // attempt written again without the two keys (the latest PAST_DUE decides), over a refusal that would not retry.
    const { paid, failedAt } = await firstFailure("22");
    const orderId = paid.subscriptionId;
    const events = await h.repository.subscriptionEvents(orderId);
    const { auto_retry: _retry, decline_code: _code, ...before } = events.at(-1)!.data;
    expect(before).toMatchObject({ attempt: 1, first_failed_at: failedAt.toISOString() });
    await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client,
      subscriptionEvent(foldSubscription(events), "PAST_DUE", h.clock.now, before)));
    expect(Object.hasOwn((await h.repository.subscriptionEvents(orderId)).at(-1)!.data, "auto_retry")).toBe(false);
    const sent = h.payments.chargesFor(orderId);
    h.clock.now = new Date(failedAt.getTime() + DAY + MINUTE);
    h.payments.failNextCharge(orderId, "DECLINED", "20");
    await h.maintenance.runOnce();
    expect(h.payments.chargesFor(orderId)).toBe(sent + 1);
    expect((await renewals(orderId)).map((charge) => charge.attempt)).toEqual([1, 2]);
  });

  it("skips an M5B whose retry day passed before its refusal was decided; an M5C whose day is still ahead goes out", async () => {
    // Owner ruling 2026-10-21: a reminder naming a day already gone is not sent; the next step follows on the next pass.
    const { paid, failedAt } = await firstFailure("20");
    const orderId = paid.subscriptionId;
    // The +1-day retry is decided only after +3 days (the retry day M5B would name).
    h.clock.now = new Date(failedAt.getTime() + 3 * DAY + MINUTE);
    h.payments.failNextCharge(orderId, "DECLINED", "20");
    await h.maintenance.runOnce();
    const second = (await renewals(orderId))[1]!;
    expect((await h.repository.subscriptionEvents(orderId)).at(-1)).toMatchObject({
      kind: "PAST_DUE", data: { attempt: 2, charge_id: second.chargeId, auto_retry: true }
    });
    expect((await h.outboxRows(second.chargeId)).map((row) => row.ref)).not.toContain(`M5B:${second.chargeId}`);
    // The next pass makes the +3-day retry at once; its M5C names +7 days, still ahead, so it is sent.
    h.clock.advance(10 * MINUTE);
    h.payments.failNextCharge(orderId, "DECLINED", "20");
    await h.maintenance.runOnce();
    const third = (await renewals(orderId))[2]!;
    expect(third.attempt).toBe(3);
    const m5c = await queuedEmail(`M5C:${third.chargeId}`);
    expect(m5c.params.retryDate).toBe(new Date(failedAt.getTime() + 7 * DAY).toISOString());
  });

  it("skips M5B and M5C whose 'add a card by' day passed before the pass reached them, and ends the plan with M6", async () => {
    const { paid, failedAt } = await firstFailure("22");
    const orderId = paid.subscriptionId;
    const [first] = await renewals(orderId);
    const refOf = (attempt: number) => `${attempt === 2 ? "M5B" : "M5C"}:${orderId}:${first!.periodStart.toISOString()}:${attempt}`;
    // No pass ran until after the last retry day (+7): each overdue attempt fails with no charge, one per pass.
    h.clock.now = new Date(failedAt.getTime() + 8 * DAY);
    for (const attempt of [2, 3]) {
      await h.maintenance.runOnce();
      expect((await h.repository.subscriptionEvents(orderId)).at(-1)).toMatchObject({
        kind: "PAST_DUE", data: { attempt, reason: "REFUSAL_NOT_RETRIED", auto_retry: false }
      });
      expect((await h.outboxRows(orderId)).map((row) => row.ref)).not.toContain(refOf(attempt));
      h.clock.advance(10 * MINUTE);
    }
    await h.maintenance.runOnce();
    expect((await h.repository.subscriptionEvents(orderId)).at(-1)).toMatchObject({
      kind: "ENDED", data: { cause: "DUNNING", reason: "REFUSAL_NOT_RETRIED" }
    });
    expect((await h.outboxRows(orderId)).map((row) => row.ref)).toContain(`M6:${orderId}`);
  });
});

/** The saved-card charges sent to NETOPIA with this orderID (our charge id); the shared harness charges other plans too. */
const sentFor = (chargeId: string) => h.payments.charges.filter((charge) => charge.orderId === chargeId);

/** A CARD_CHANGED asking for a retry now (R-34), with a new card stored from `chargeId`'s payment. Returns its id. */
async function changeCard(subscriptionId: string, chargeId: string): Promise<string> {
  const state = foldSubscription(await h.repository.subscriptionEvents(subscriptionId));
  const cardTokenId = await h.storeCardToken(chargeId);
  await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client,
    subscriptionEvent(state, "CARD_CHANGED", h.clock.now, { retry_now: true }, { cardTokenId })));
  return cardTokenId;
}

describe("B3 the owner hears once when a first payment brought no saved card (NETOPIA answers 2026-10-21)", () => {
  /**
   * A first payment NETOPIA confirmed with no saved card: no message carried one (only the first does; its resent copies
   * never do), and the status read carried none either. The plan is ACTIVE with no card, from `h.clock.now`.
   */
  async function activateWithoutCard() {
    const bought = await h.buy();
    const charge = await h.repository.charge(bought.chargeId);
    if (charge === null) throw new Error("NO_CHARGE");
    h.payments.pay(bought.chargeId, { amountMicros: charge.totalMicros, cardCountry: "RO" });
    await h.settle(bought.chargeId);
    expect(foldSubscription(await h.repository.subscriptionEvents(bought.subscriptionId)))
      .toMatchObject({ status: "ACTIVE", cardTokenId: null, activatedAt: h.clock.now });
    return { ...bought, activatedAt: h.clock.now };
  }
  /** Every O3 about this subscription, whatever its ref: the dedupe must hold, not just the ref. */
  const ownerAlerts = async (subscriptionId: string) => (await h.database.pool.query<{ ref: string; payload: Record<string, unknown> }>(
    "SELECT ref, payload FROM billing.outbox WHERE kind = 'EMAIL' AND payload->>'template' = 'O3' AND payload->>'param.reference' = $1",
    [`subscription ${subscriptionId}`]
  )).rows;
  const at = (start: Date, ms: number) => new Date(start.getTime() + ms);

  it("waits 30 minutes for NETOPIA's copies and a spool replay, then emails the owner once, and never again", async () => {
    const plan = await activateWithoutCard();
    h.clock.now = at(plan.activatedAt, 10 * MINUTE);
    await h.maintenance.runOnce();
    expect(await ownerAlerts(plan.subscriptionId)).toEqual([]);

    h.clock.now = at(plan.activatedAt, 31 * MINUTE);
    await h.maintenance.runOnce();
    const alerts = await ownerAlerts(plan.subscriptionId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      ref: `O3:FIRST_PAYMENT_NO_CARD:${plan.subscriptionId}`,
      payload: {
        recipient: "OWNER", "param.jobKind": "PAYMENT", "param.reasonCode": "FIRST_PAYMENT_NO_CARD",
        "param.nextSteps": NO_CARD_STEPS, "param.paymentAlert": "true"
      }
    });

    h.clock.now = at(plan.activatedAt, 41 * MINUTE);
    await h.maintenance.runOnce();
    h.clock.now = at(plan.activatedAt, 3 * DAY);
    await h.maintenance.runOnce();
    expect(await ownerAlerts(plan.subscriptionId)).toHaveLength(1);
  });

  it("says nothing for a plan whose first payment saved its card", async () => {
    const plan = await h.activate();
    expect(foldSubscription(await h.repository.subscriptionEvents(plan.subscriptionId)).cardTokenId).toBe(plan.cardTokenId);
    h.clock.now = at(h.clock.now, 31 * MINUTE);
    await h.maintenance.runOnce();
    expect(await ownerAlerts(plan.subscriptionId)).toEqual([]);
  });

  it("says nothing for a plan activated more than 7 days before the pass first saw it (it predates this alert)", async () => {
    const plan = await activateWithoutCard();
    h.clock.now = at(plan.activatedAt, 8 * DAY);
    await h.maintenance.runOnce();
    expect(await ownerAlerts(plan.subscriptionId)).toEqual([]);
  });

  it("says nothing from the other NETOPIA system's pass; the plan's own system's pass says it (D5 5h)", async () => {
    const live = new BillingMaintenance({
      repository: h.repository, jobs: h.jobs, entitlements: h.entitlements, renewal: h.renewal, policy: testBillingPolicy,
      publicAppUrl: TEST_PUBLIC_APP_URL, paymentEnvironment: "live", audit: h.audit, clock: h.clock.read
    });
    const plan = await activateWithoutCard();
    h.clock.now = at(plan.activatedAt, 31 * MINUTE);
    await live.runOnce();
    expect(await ownerAlerts(plan.subscriptionId)).toEqual([]);
    await h.maintenance.runOnce();
    expect(await ownerAlerts(plan.subscriptionId)).toHaveLength(1);
  });
});
