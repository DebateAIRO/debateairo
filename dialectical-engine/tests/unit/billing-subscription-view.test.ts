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
    renewalPostponedUntil: null, announcedTotalMicros: 24_200_000, lastNoticeAt: null, paymentProvider: "xmoney",
    paymentEnvironment: "stage", cardTokenId: null,
    ...overrides
  });
}

// The API's two systems: xMoney stage and NETOPIA sandbox (the fixture's `subscriptionDeps` defaults).
const view = (overrides: Partial<SubscriptionState> = {}, taxCountry: string | null = "RO", now = NOW) => subscriptionView({
  state: state(overrides), taxCountry, policy: testBillingPolicy, now, xmoneyEnvironment: "stage", paymentEnvironment: "sandbox"
});
/** A NETOPIA plan of the API's environment: since N12 the only plan the upgrade route serves. */
const NETOPIA: Partial<SubscriptionState> = Object.freeze({ paymentProvider: "netopia", paymentEnvironment: "sandbox" });

describe("P12b the subscription as the person sees it", () => {
  it("shows the renewal date, the announced total and the open withdrawal window", () => {
    // Since N12 an xMoney plan is never offered the upgrade (the route serves NETOPIA plans only).
    expect(view()).toEqual({
      plan_id: "PLUS", status: "ACTIVE", cancel_requested: false,
      current_period_end: "2026-11-01T09:00:00.000Z", renews_on: "2026-11-01T09:00:00.000Z",
      renewal_total: "24.20", scheduled_downgrade_plan_id: null,
      // Romania: the 14 days run 2–15 October, Bucharest time; the window closes at the next local midnight.
      withdrawal_open_until: "2026-10-15T21:00:00.000Z", withdrawal_last_day: "2026-10-15",
      can_upgrade: false, can_change_card: true, can_revoke_cancel: false
    });
  });

  it("shows no renewal once a cancel is requested, and the postponed date while a notice runs", () => {
    expect(view({ cancelRequested: true })).toMatchObject({ renews_on: null, renewal_total: null });
    expect(view({ ...NETOPIA, renewalPostponedUntil: new Date("2026-11-10T09:00:00.000Z") })).toMatchObject({
      renews_on: "2026-11-10T09:00:00.000Z", can_upgrade: false
    });
    expect(view({ status: "ENDED" })).toMatchObject({ renews_on: null, renewal_total: null });
  });

  it("closes the withdrawal window at the end of the 14th calendar day, the consumer's time (R2 Q-6)", () => {
    const open = (overrides: Partial<SubscriptionState>, taxCountry: string | null, now: Date) =>
      withdrawalOpenUntil({
        state: state(overrides), taxCountry, policy: testBillingPolicy, now, xmoneyEnvironment: "stage", paymentEnvironment: "sandbox"
      });
    // Romania, activated Thursday 1 October 09:00 UTC: the last day is Thursday 15 October.
    expect(open({}, "RO", new Date("2026-10-15T20:59:59.999Z"))).toEqual(new Date("2026-10-15T21:00:00.000Z"));
    expect(open({}, "RO", new Date("2026-10-15T21:00:00.000Z"))).toBeNull();
    expect(open({}, "DE", NOW)).toEqual(new Date("2026-10-15T22:00:00.000Z"));
    expect(open({}, "US", NOW)).toBeNull();
    expect(open({}, null, NOW)).toBeNull();
    expect(open({ status: "PAST_DUE" }, "RO", NOW)).toBeNull();
  });

  it("rolls a 14th day on a Saturday or Sunday to the next Monday (W6, P2-I9: Regulation 1182/71 art. 3(4))", () => {
    const open = (overrides: Partial<SubscriptionState>, taxCountry: string | null, now: Date) =>
      withdrawalOpenUntil({
        state: state(overrides), taxCountry, policy: testBillingPolicy, now, xmoneyEnvironment: "stage", paymentEnvironment: "sandbox"
      });
    // Romania, activated Saturday 3 October: the 14th day is Saturday 17 October, so the window stays open through
    // Sunday 18 and Monday 19 October and closes at Monday's midnight, Bucharest time.
    const saturday = new Date("2026-10-03T09:00:00.000Z");
    expect(withdrawalDeadline({ activatedAt: saturday, taxCountry: "RO", withdrawalDays: 14 }))
      .toEqual({ lastDay: "2026-10-19", closesAt: new Date("2026-10-19T21:00:00.000Z") });
    expect(open({ activatedAt: saturday }, "RO", new Date("2026-10-18T12:00:00.000Z")))
      .toEqual(new Date("2026-10-19T21:00:00.000Z"));
    expect(open({ activatedAt: saturday }, "RO", new Date("2026-10-19T20:59:59.999Z")))
      .toEqual(new Date("2026-10-19T21:00:00.000Z"));
    expect(open({ activatedAt: saturday }, "RO", new Date("2026-10-19T21:00:00.000Z"))).toBeNull();
    // Activated Sunday 4 October: the 14th day is Sunday 18 October, which also rolls to Monday 19 October.
    expect(withdrawalDeadline({ activatedAt: new Date("2026-10-04T09:00:00.000Z"), taxCountry: "RO", withdrawalDays: 14 }))
      .toEqual({ lastDay: "2026-10-19", closesAt: new Date("2026-10-19T21:00:00.000Z") });
    // Activated Friday 2 October: the 14th day is Friday 16 October, a working day, and nothing moves.
    expect(withdrawalDeadline({ activatedAt: new Date("2026-10-02T09:00:00.000Z"), taxCountry: "RO", withdrawalDays: 14 }))
      .toEqual({ lastDay: "2026-10-16", closesAt: new Date("2026-10-16T21:00:00.000Z") });
    // The UK rolls the same Saturday to Monday 19 October, closing at London's midnight (BST, UTC+1).
    expect(open({ activatedAt: saturday }, "GB", new Date("2026-10-19T12:00:00.000Z")))
      .toEqual(new Date("2026-10-19T23:00:00.000Z"));
    expect(open({ activatedAt: saturday }, "GB", new Date("2026-10-19T23:00:00.000Z"))).toBeNull();
    // Portugal: the date is read in Lisbon and the window closes at the Azores' Monday midnight (summer time, UTC+0).
    expect(withdrawalDeadline({ activatedAt: saturday, taxCountry: "PT", withdrawalDays: 14 }))
      .toEqual({ lastDay: "2026-10-19", closesAt: new Date("2026-10-20T00:00:00.000Z") });
    // A Saturday rolled across a DST change: activated Saturday 17 October, the 14th day is Saturday 31 October, the
    // window closes at Bucharest's midnight after Monday 2 November, in winter time (UTC+2).
    expect(withdrawalDeadline({ activatedAt: new Date("2026-10-17T09:00:00.000Z"), taxCountry: "RO", withdrawalDays: 14 }))
      .toEqual({ lastDay: "2026-11-02", closesAt: new Date("2026-11-02T22:00:00.000Z") });
    // The person sees the Monday as the last day.
    expect(view({ activatedAt: saturday }, "RO", new Date("2026-10-18T12:00:00.000Z"))).toMatchObject({
      withdrawal_open_until: "2026-10-19T21:00:00.000Z", withdrawal_last_day: "2026-10-19"
    });
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
    // The upgrade on a NETOPIA plan (the only one it serves since N12), so every `false` below has a cause of its own.
    expect(view(NETOPIA).can_upgrade).toBe(true);
    expect(view({ ...NETOPIA, planId: "MAX" }).can_upgrade).toBe(false);
    expect(view({ ...NETOPIA, status: "PAST_DUE" }).can_upgrade).toBe(false);
    expect(view({ ...NETOPIA, status: "SUSPENDED" }).can_upgrade).toBe(false);
    const insideLead = new Date(PERIOD_END.getTime() - renewalLeadMs());
    expect(view(NETOPIA, "RO", insideLead).can_upgrade).toBe(false);
    expect(view(NETOPIA, "RO", new Date(insideLead.getTime() - 1)).can_upgrade).toBe(true);
    // The card change stays on the xMoney plan until N13 moves it.
    expect(view({ status: "PAST_DUE" }).can_change_card).toBe(true);
    expect(view({ status: "SUSPENDED" }).can_change_card).toBe(false);
  });

  it("offers the upgrade only to a NETOPIA plan of this API's environment (N12, spec §2.5.4, §2.10)", () => {
    const read = (api: "sandbox" | "live" | null, overrides: Partial<SubscriptionState>) => subscriptionView({
      state: state(overrides), taxCountry: "RO", policy: testBillingPolicy, now: NOW, xmoneyEnvironment: "stage",
      paymentEnvironment: api
    });
    // Control: a NETOPIA plan of the API's own environment is offered it, sandbox or live.
    expect(read("sandbox", NETOPIA).can_upgrade).toBe(true);
    expect(read("live", { paymentProvider: "netopia", paymentEnvironment: "live" }).can_upgrade).toBe(true);
    // A plan of the other NETOPIA environment, or one read by an API that serves no NETOPIA environment, is not.
    expect(read("live", NETOPIA).can_upgrade).toBe(false);
    expect(read("sandbox", { paymentProvider: "netopia", paymentEnvironment: "live" }).can_upgrade).toBe(false);
    expect(read(null, NETOPIA).can_upgrade).toBe(false);
    // An xMoney plan of the API's own xMoney system is not offered it either: the route answers it NOT_SUBSCRIBED.
    expect(read("sandbox", {}).can_upgrade).toBe(false);
  });

  it("offers no upgrade and no card change for a plan of the other xMoney system (P2-W3 (a), D5 5h)", () => {
    // README §14.8's same-host switch: a sandbox plan still open, read by the live API. Both routes would refuse it
    // NOT_SUBSCRIBED (upgrade.ts, card-change.ts), so Settings never offers them.
    const read = (api: "stage" | "live", overrides: Partial<SubscriptionState> = {}) => subscriptionView({
      state: state(overrides), taxCountry: "RO", policy: testBillingPolicy, now: NOW, xmoneyEnvironment: api,
      paymentEnvironment: "sandbox"
    });
    expect(read("live")).toMatchObject({ can_upgrade: false, can_change_card: false });
    expect(read("live", { status: "PAST_DUE" })).toMatchObject({ can_upgrade: false, can_change_card: false });
    // Control: the plan's own system offers the card change, and a live plan on the live API too. Since N12 an xMoney
    // plan is never offered the upgrade, in either system (the route serves NETOPIA plans only).
    expect(read("stage")).toMatchObject({ can_upgrade: false, can_change_card: true });
    expect(read("stage", { status: "PAST_DUE" })).toMatchObject({ can_upgrade: false, can_change_card: true });
    expect(read("live", { paymentEnvironment: "live" })).toMatchObject({ can_upgrade: false, can_change_card: true });
  });

  it("offers Undo only where the revoke route accepts it: ACTIVE, this API's xMoney system, a cancel pending, before the period end (C-15)", () => {
    const read = (api: "stage" | "live", overrides: Partial<SubscriptionState> = {}, now = NOW) => subscriptionView({
      state: state(overrides), taxCountry: "RO", policy: testBillingPolicy, now, xmoneyEnvironment: api,
      paymentEnvironment: "sandbox"
    });
    // README §14.8's same-host switch: a live start allows a sandbox plan only ACTIVE with a cancel pending, and the
    // revoke route refuses it NOT_SUBSCRIBED (subscription-actions.ts), which Settings would word as "try again".
    expect(read("live", { cancelRequested: true }).can_revoke_cancel).toBe(false);
    // Control: the plan's own system offers it, and a live plan on the live API too.
    expect(read("stage", { cancelRequested: true }).can_revoke_cancel).toBe(true);
    expect(read("live", { cancelRequested: true, paymentEnvironment: "live" }).can_revoke_cancel).toBe(true);
    // Nothing to undo; the period is over (the route refuses it there); a plan paused by a dispute (refused while paused).
    expect(read("stage").can_revoke_cancel).toBe(false);
    expect(read("stage", { cancelRequested: true }, new Date(PERIOD_END.getTime() - 1)).can_revoke_cancel).toBe(true);
    expect(read("stage", { cancelRequested: true }, PERIOD_END).can_revoke_cancel).toBe(false);
    expect(read("stage", { cancelRequested: true, status: "SUSPENDED" }).can_revoke_cancel).toBe(false);
    expect(read("stage", { cancelRequested: true, status: "ENDED" }).can_revoke_cancel).toBe(false);
  });

  it("names only paid plans, every one of them a PlanIdSchema member, and never shows Free as a subscription", () => {
    expect(SubscribedPlanIdSchema.options).toEqual(["PLUS", "PRO", "MAX"]);
    expect(PlanIdSchema.options).toEqual(expect.arrayContaining([...SubscribedPlanIdSchema.options]));
    expect(() => view({ planId: "FREE" })).toThrow(expect.objectContaining({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" }));
  });
});
