import { describe, expect, it } from "vitest";
import { withdrawalDeadline, type SubscriptionState } from "@debateai/billing-core";
import { PlanIdSchema, SubscribedPlanIdSchema } from "@debateai/contract";
import { renewalLeadMs } from "../../apps/api/src/billing/renewal-rules.js";
import { subscriptionView, withdrawalOpenUntil } from "../../apps/api/src/billing/subscription-view.js";
import { testBillingPolicy } from "../support/billingFixtures.js";

const ACTIVATED = new Date("2026-10-01T09:00:00.000Z");
const PERIOD_END = new Date("2026-11-01T09:00:00.000Z");
const NOW = new Date("2026-10-10T12:00:00.000Z");

function state(overrides: Partial<SubscriptionState> = {}): SubscriptionState {
  return Object.freeze({
    subscriptionId: "sub-1", ownerRef: "owner-1", planId: "PLUS", status: "ACTIVE",
    periodAnchorAt: ACTIVATED, currentPeriodStart: ACTIVATED, currentPeriodEnd: PERIOD_END,
    cancelRequested: false, scheduledDowngradePlanId: null,
    xmoneyOrderId: "901", xmoneyCustomerId: "77", cardRef: "4242",
    activatedAt: ACTIVATED, endedCause: null, pastDueSince: null, retryIndex: 0,
    renewalPostponedUntil: null, announcedTotalMicros: 24_200_000, lastNoticeAt: null, xmoneyEnvironment: "stage",
    ...overrides
  });
}

const view = (overrides: Partial<SubscriptionState> = {}, taxCountry: string | null = "RO", now = NOW) =>
  subscriptionView({ state: state(overrides), taxCountry, policy: testBillingPolicy, now, xmoneyEnvironment: "stage" });

describe("P12b the subscription as the person sees it", () => {
  it("shows the renewal date, the announced total and the open withdrawal window", () => {
    expect(view()).toEqual({
      plan_id: "PLUS", status: "ACTIVE", cancel_requested: false,
      current_period_end: "2026-11-01T09:00:00.000Z", renews_on: "2026-11-01T09:00:00.000Z",
      renewal_total: "24.20", scheduled_downgrade_plan_id: null,
      // Romania: the 14 days run 2–15 October, Bucharest time; the window closes at the next local midnight.
      withdrawal_open_until: "2026-10-15T21:00:00.000Z", withdrawal_last_day: "2026-10-15",
      can_upgrade: true, can_change_card: true
    });
  });

  it("shows no renewal once a cancel is requested, and the postponed date while a notice runs", () => {
    expect(view({ cancelRequested: true })).toMatchObject({ renews_on: null, renewal_total: null });
    expect(view({ renewalPostponedUntil: new Date("2026-11-10T09:00:00.000Z") })).toMatchObject({
      renews_on: "2026-11-10T09:00:00.000Z", can_upgrade: false
    });
    expect(view({ status: "ENDED" })).toMatchObject({ renews_on: null, renewal_total: null });
  });

  it("closes the withdrawal window at the end of the 14th calendar day, the consumer's time, with no weekend roll (R2 Q-6)", () => {
    const open = (overrides: Partial<SubscriptionState>, taxCountry: string | null, now: Date) =>
      withdrawalOpenUntil({ state: state(overrides), taxCountry, policy: testBillingPolicy, now, xmoneyEnvironment: "stage" });
    // Romania, activated Thursday 1 October 09:00 UTC: the last day is Thursday 15 October.
    expect(open({}, "RO", new Date("2026-10-15T20:59:59.999Z"))).toEqual(new Date("2026-10-15T21:00:00.000Z"));
    expect(open({}, "RO", new Date("2026-10-15T21:00:00.000Z"))).toBeNull();
    // Romania, activated Saturday 3 October: the 14th day is Saturday 17 October, and the window closes at its end —
    // calendar days, so a weekend moves nothing.
    const saturday = new Date("2026-10-03T09:00:00.000Z");
    expect(open({ activatedAt: saturday }, "RO", new Date("2026-10-17T20:59:59.999Z")))
      .toEqual(new Date("2026-10-17T21:00:00.000Z"));
    expect(open({ activatedAt: saturday }, "RO", new Date("2026-10-17T21:00:00.000Z"))).toBeNull();
    expect(withdrawalDeadline({ activatedAt: saturday, taxCountry: "RO", withdrawalDays: 14 }).lastDay).toBe("2026-10-17");
    // The UK counts the same calendar days, at London time (BST).
    expect(open({ activatedAt: saturday }, "GB", new Date("2026-10-17T12:00:00.000Z")))
      .toEqual(new Date("2026-10-17T23:00:00.000Z"));
    expect(open({ activatedAt: saturday }, "GB", new Date("2026-10-17T23:00:00.000Z"))).toBeNull();
    expect(open({}, "DE", NOW)).toEqual(new Date("2026-10-15T22:00:00.000Z"));
    expect(open({}, "US", NOW)).toBeNull();
    expect(open({}, null, NOW)).toBeNull();
    expect(open({ status: "PAST_DUE" }, "RO", NOW)).toBeNull();
  });

  it("counts from the consumer's local date, and never closes before any zone of a two-zone country", () => {
    // 22:30 UTC on 1 October is already 2 October in Bucharest: the first day is 3 October, the last 16 October.
    expect(withdrawalDeadline({ activatedAt: new Date("2026-10-01T22:30:00.000Z"), taxCountry: "RO", withdrawalDays: 14 }))
      .toEqual({ lastDay: "2026-10-16", closesAt: new Date("2026-10-16T21:00:00.000Z") });
    // Portugal: the date is read in Lisbon, the window closes at the Azores' midnight (one hour later).
    expect(withdrawalDeadline({ activatedAt: ACTIVATED, taxCountry: "PT", withdrawalDays: 14 }))
      .toEqual({ lastDay: "2026-10-15", closesAt: new Date("2026-10-16T00:00:00.000Z") });
    expect(() => withdrawalDeadline({ activatedAt: ACTIVATED, taxCountry: "RO", withdrawalDays: 0 }))
      .toThrow(expect.objectContaining({ code: "BILLING_WITHDRAWAL_DAYS_INVALID" }));
  });

  it("offers an upgrade below Max while ACTIVE and outside the renewal's lead, and a card change while ACTIVE or PAST_DUE", () => {
    expect(view({ planId: "MAX" }).can_upgrade).toBe(false);
    expect(view({ status: "PAST_DUE" })).toMatchObject({ can_upgrade: false, can_change_card: true });
    expect(view({ status: "SUSPENDED" })).toMatchObject({ can_upgrade: false, can_change_card: false });
    const insideLead = new Date(PERIOD_END.getTime() - renewalLeadMs());
    expect(view({}, "RO", insideLead).can_upgrade).toBe(false);
    expect(view({}, "RO", new Date(insideLead.getTime() - 1)).can_upgrade).toBe(true);
  });

  it("names only paid plans, every one of them a PlanIdSchema member, and never shows Free as a subscription", () => {
    expect(SubscribedPlanIdSchema.options).toEqual(["PLUS", "PRO", "MAX"]);
    expect(PlanIdSchema.options).toEqual(expect.arrayContaining([...SubscribedPlanIdSchema.options]));
    expect(() => view({ planId: "FREE" })).toThrow(expect.objectContaining({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" }));
  });
});
