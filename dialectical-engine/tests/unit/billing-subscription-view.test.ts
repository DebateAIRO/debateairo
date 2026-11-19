import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { consumerCalendarDay, consumerTimeZone, withdrawalDeadline, type SubscriptionState } from "@debateai/billing-core";
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
    activatedAt: ACTIVATED, endedCause: null, pastDueSince: null, retryIndex: 0,
    renewalPostponedUntil: null, announcedTotalMicros: 24_200_000, lastNoticeAt: null, paymentProvider: "netopia",
    paymentEnvironment: "sandbox", cardTokenId: null, currency: "USD",
    ...overrides
  });
}

// The API's payment system: NETOPIA's sandbox (the fixture's `subscriptionDeps` default).
const view = (overrides: Partial<SubscriptionState> = {}, taxCountry: string | null = "RO", now = NOW) => subscriptionView({
  state: state(overrides), taxCountry, policy: testBillingPolicy, now, paymentEnvironment: "sandbox"
});
/** A NETOPIA plan of the API's environment (the default plan above): the only plan the upgrade route serves. */
const NETOPIA: Partial<SubscriptionState> = Object.freeze({ paymentProvider: "netopia", paymentEnvironment: "sandbox" });

describe("P12b the subscription as the person sees it", () => {
  it("shows the renewal date, the announced total and the open withdrawal window", () => {
    // A NETOPIA plan of this API's environment, ACTIVE, below Max and outside the renewal's lead: both are offered.
    expect(view()).toEqual({
      plan_id: "PLUS", status: "ACTIVE", cancel_requested: false,
      current_period_end: "2026-11-01T09:00:00.000Z", renews_on: "2026-11-01T09:00:00.000Z",
      renewal_total: "24.20", currency: "USD", scheduled_downgrade_plan_id: null,
      // Romania: the 14 days run 2–15 October, Bucharest time; the window closes at the next local midnight.
      withdrawal_open_until: "2026-10-15T21:00:00.000Z", withdrawal_last_day: "2026-10-15", started_on: "2026-10-01",
      can_upgrade: true, can_change_card: true, can_revoke_cancel: false
    });
  });

  it("names the day the plan started in the buyer's calendar, the one the 14 days are counted in", () => {
    // 22:30 UTC on 1 October is already 2 October in Bucharest, and still 1 October in Lisbon.
    const late = new Date("2026-10-01T22:30:00.000Z");
    expect(view({ activatedAt: late }, "RO").started_on).toBe("2026-10-02");
    expect(view({ activatedAt: late }, "PT").started_on).toBe("2026-10-01");
    expect(consumerCalendarDay(late, "RO")).toBe("2026-10-02");
    // A country with no zone of its own is read where the day is latest, as its window is.
    expect(consumerCalendarDay(late, "US")).toBe("2026-10-02");
    // No activation or no tax country: unknown, so the statement names the plan alone.
    expect(view({ activatedAt: null }).started_on).toBeNull();
    expect(view({}, null).started_on).toBeNull();
    // The zone the acknowledgement prints the time in: the country's own, or UTC where it has several or none listed.
    expect(consumerTimeZone("RO")).toBe("Europe/Bucharest");
    expect(consumerTimeZone("DE")).toBe("Europe/Berlin");
    for (const country of ["ES", "PT", "US", null]) expect(consumerTimeZone(country), String(country)).toBe("UTC");
  });

  it("shows no renewal once a cancel is requested, and the postponed date while a notice runs", () => {
    expect(view({ cancelRequested: true })).toMatchObject({ renews_on: null, renewal_total: null });
    expect(view({ ...NETOPIA, renewalPostponedUntil: new Date("2026-11-10T09:00:00.000Z") })).toMatchObject({
      renews_on: "2026-11-10T09:00:00.000Z", can_upgrade: false
    });
    expect(view({ status: "ENDED" })).toMatchObject({ renews_on: null, renewal_total: null });
    // A plan behind on payment promises no date, but its card page names the total the retried renewal charges.
    expect(view({ ...NETOPIA, status: "PAST_DUE", pastDueSince: PERIOD_END })).toMatchObject({
      renews_on: null, renewal_total: "24.20", can_change_card: true
    });
  });

  it("closes the withdrawal window at the end of the 14th calendar day, the consumer's time (R2 Q-6)", () => {
    const open = (overrides: Partial<SubscriptionState>, taxCountry: string | null, now: Date) =>
      withdrawalOpenUntil({
        state: state(overrides), taxCountry, policy: testBillingPolicy, now, paymentEnvironment: "sandbox"
      });
    // Romania, activated Thursday 1 October 09:00 UTC: the last day is Thursday 15 October.
    expect(open({}, "RO", new Date("2026-10-15T20:59:59.999Z"))).toEqual(new Date("2026-10-15T21:00:00.000Z"));
    expect(open({}, "RO", new Date("2026-10-15T21:00:00.000Z"))).toBeNull();
    expect(open({}, "DE", NOW)).toEqual(new Date("2026-10-15T22:00:00.000Z"));
    // The list is still what opens the window: a tax country that is not on it (Brazil, which the site does not serve)
    // has none, and neither has a plan with no tax country or one that is not ACTIVE.
    expect(testBillingPolicy.withdrawalCountries).not.toContain("BR");
    expect(open({}, "BR", NOW)).toBeNull();
    expect(open({}, null, NOW)).toBeNull();
    expect(open({ status: "PAST_DUE" }, "RO", NOW)).toBeNull();
  });

  it("keeps the window of a plan paused by a payment dispute, so Settings still shows the withdrawal and its e-mail route", () => {
    // The right lasts the whole 14 days, a dispute or not. Recording stays ACTIVE-only (`recordWithdrawal`), so only
    // the view opens; the page tells a paused buyer to withdraw by e-mail.
    expect(view({ status: "SUSPENDED" })).toMatchObject({
      status: "SUSPENDED", withdrawal_open_until: "2026-10-15T21:00:00.000Z", withdrawal_last_day: "2026-10-15"
    });
    expect(withdrawalOpenUntil({
      state: state({ status: "SUSPENDED" }), taxCountry: "RO", policy: testBillingPolicy,
      now: new Date("2026-10-15T21:00:00.000Z"), paymentEnvironment: "sandbox"
    })).toBeNull();
    for (const status of ["PAST_DUE", "ENDED", "WITHDRAWN"] as const) {
      expect(view({ status }), status).toMatchObject({ withdrawal_open_until: null, withdrawal_last_day: null });
    }
  });

  it("opens the 14 days for every country the site serves, the United States and Japan among them (owner's decision of 16 November 2026)", () => {
    const input = (taxCountry: string, now: Date) => ({
      state: state(), taxCountry, policy: testBillingPolicy, now, paymentEnvironment: "sandbox" as const
    });
    // The fixture's list is the hosted example's, country for country.
    const hosted = JSON.parse(readFileSync(
      new URL("../../deploy/vps/register/hosted-register.example.json", import.meta.url), "utf8"
    )) as { billingPolicy: { withdrawal_countries: string[] } };
    expect(testBillingPolicy.withdrawalCountries).toEqual(hosted.billingPolicy.withdrawal_countries);
    // Activated Thursday 1 October 09:00 UTC. A country with no zone of its own in `withdrawalDeadline` is counted
    // on the Earth's extremes, in the buyer's favour: the day is read where it is latest (Kiritimati, UTC+14: still 1
    // October), so the last day is 15 October, and the window closes at the last midnight on Earth (UTC−12).
    for (const taxCountry of ["US", "JP"]) {
      expect(withdrawalOpenUntil(input(taxCountry, NOW)), taxCountry).toEqual(new Date("2026-10-16T12:00:00.000Z"));
      expect(withdrawalOpenUntil(input(taxCountry, new Date("2026-10-16T11:59:59.999Z"))), taxCountry)
        .toEqual(new Date("2026-10-16T12:00:00.000Z"));
      expect(withdrawalOpenUntil(input(taxCountry, new Date("2026-10-16T12:00:00.000Z"))), taxCountry).toBeNull();
      expect(view({}, taxCountry)).toMatchObject({
        withdrawal_open_until: "2026-10-16T12:00:00.000Z", withdrawal_last_day: "2026-10-15"
      });
    }
    // Every listed country has the window on day 9, not only the two above.
    for (const taxCountry of testBillingPolicy.withdrawalCountries) {
      expect(withdrawalOpenUntil(input(taxCountry, NOW)), taxCountry).not.toBeNull();
    }
  });

  it("rolls a 14th day on a Saturday or Sunday to the next Monday (W6, P2-I9: Regulation 1182/71 art. 3(4))", () => {
    const open = (overrides: Partial<SubscriptionState>, taxCountry: string | null, now: Date) =>
      withdrawalOpenUntil({
        state: state(overrides), taxCountry, policy: testBillingPolicy, now, paymentEnvironment: "sandbox"
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

  it("moves a last day on a Romanian public holiday, as on a weekend, to the end of the next working day", () => {
    const deadline = (activatedAt: string, taxCountry = "RO") =>
      withdrawalDeadline({ activatedAt: new Date(activatedAt), taxCountry, withdrawalDays: 14 });
    // Activated Friday 11 December 2026: the 14th day is Friday 25 December (Christmas), then Saturday 26 December
    // (a holiday too) and Sunday 27: the window stays open until the end of Monday 28 December, Bucharest time.
    expect(deadline("2026-12-11T10:00:00.000Z"))
      .toEqual({ lastDay: "2026-12-28", closesAt: new Date("2026-12-28T22:00:00.000Z") });
    // Activated Tuesday 17 November 2026: the 14th day is Tuesday 1 December, a holiday, so the last day is 2 December.
    expect(deadline("2026-11-17T10:00:00.000Z"))
      .toEqual({ lastDay: "2026-12-02", closesAt: new Date("2026-12-02T22:00:00.000Z") });
    // A day later the 14th day is 2 December itself, a working day: nothing moves.
    expect(deadline("2026-11-18T10:00:00.000Z"))
      .toEqual({ lastDay: "2026-12-02", closesAt: new Date("2026-12-02T22:00:00.000Z") });
    // Friday 1 January 2027, Saturday 2 January (a holiday and a weekend day), Sunday 3: Monday 4 January.
    expect(deadline("2026-12-18T10:00:00.000Z"))
      .toEqual({ lastDay: "2027-01-04", closesAt: new Date("2027-01-04T22:00:00.000Z") });
    // Wednesday 6 and Thursday 7 January 2027 are holidays: Friday 8 January.
    expect(deadline("2026-12-23T10:00:00.000Z"))
      .toEqual({ lastDay: "2027-01-08", closesAt: new Date("2027-01-08T22:00:00.000Z") });
    // Good Friday 30 April 2027, Labour Day on the Saturday, Easter Sunday 2 May and Easter Monday 3 May: Tuesday 4
    // May, closing at Bucharest's midnight in summer time (UTC+3).
    expect(deadline("2027-04-16T10:00:00.000Z"))
      .toEqual({ lastDay: "2027-05-04", closesAt: new Date("2027-05-04T21:00:00.000Z") });
    // A 14th day on that Saturday or that Sunday rolls past the weekend onto Easter Monday, and on to Tuesday.
    for (const activatedAt of ["2027-04-17T10:00:00.000Z", "2027-04-18T10:00:00.000Z"]) {
      expect(deadline(activatedAt), activatedAt)
        .toEqual({ lastDay: "2027-05-04", closesAt: new Date("2027-05-04T21:00:00.000Z") });
    }
    // Rusalii Monday 21 June 2027 (the 50th day of Easter): the last day is Tuesday 22 June.
    expect(deadline("2027-06-07T10:00:00.000Z"))
      .toEqual({ lastDay: "2027-06-22", closesAt: new Date("2027-06-22T21:00:00.000Z") });
    // The local date decides: 22:30 UTC on 10 December is already 11 December in Bucharest.
    expect(deadline("2026-12-10T22:30:00.000Z").lastDay).toBe("2026-12-28");
    // The same rule for every buyer: Germany's window also runs to Monday 28 December, closing at Berlin's midnight.
    expect(deadline("2026-12-11T10:00:00.000Z", "DE"))
      .toEqual({ lastDay: "2026-12-28", closesAt: new Date("2026-12-28T23:00:00.000Z") });
    // Settings shows the Monday and keeps the window open through it.
    const open = (now: string) => withdrawalOpenUntil({
      state: state({ activatedAt: new Date("2026-12-11T10:00:00.000Z") }), taxCountry: "RO", policy: testBillingPolicy,
      now: new Date(now), paymentEnvironment: "sandbox"
    });
    expect(open("2026-12-26T12:00:00.000Z")).toEqual(new Date("2026-12-28T22:00:00.000Z"));
    expect(open("2026-12-28T21:59:59.999Z")).toEqual(new Date("2026-12-28T22:00:00.000Z"));
    expect(open("2026-12-28T22:00:00.000Z")).toBeNull();
    expect(view({ activatedAt: new Date("2026-12-11T10:00:00.000Z") }, "RO", new Date("2026-12-26T12:00:00.000Z")))
      .toMatchObject({ withdrawal_open_until: "2026-12-28T22:00:00.000Z", withdrawal_last_day: "2026-12-28" });
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
    // The card change on a NETOPIA plan (the only one N13's route serves).
    expect(view(NETOPIA).can_change_card).toBe(true);
    expect(view({ ...NETOPIA, status: "PAST_DUE" }).can_change_card).toBe(true);
    expect(view({ ...NETOPIA, status: "SUSPENDED" }).can_change_card).toBe(false);
  });

  it("offers the upgrade only to a NETOPIA plan of this API's environment (N12, spec §2.5.4, §2.10)", () => {
    const read = (api: "sandbox" | "live", overrides: Partial<SubscriptionState>) => subscriptionView({
      state: state(overrides), taxCountry: "RO", policy: testBillingPolicy, now: NOW, paymentEnvironment: api
    });
    // Control: a NETOPIA plan of the API's own environment is offered it, sandbox or live.
    expect(read("sandbox", NETOPIA).can_upgrade).toBe(true);
    expect(read("live", { paymentProvider: "netopia", paymentEnvironment: "live" }).can_upgrade).toBe(true);
    // A plan of the other NETOPIA environment is not: the route answers it NOT_SUBSCRIBED.
    expect(read("live", NETOPIA).can_upgrade).toBe(false);
    expect(read("sandbox", { paymentProvider: "netopia", paymentEnvironment: "live" }).can_upgrade).toBe(false);
  });

  it("offers the card change only to a NETOPIA plan of this API's environment (N13, spec §2.5.4, §2.11)", () => {
    // Both routes refuse anything else NOT_SUBSCRIBED (upgrade.ts, card-change.ts), so Settings never offers them.
    const read = (api: "sandbox" | "live", overrides: Partial<SubscriptionState> = {}) => subscriptionView({
      state: state(overrides), taxCountry: "RO", policy: testBillingPolicy, now: NOW, paymentEnvironment: api
    });
    // Control: a NETOPIA plan of the API's own environment is offered it, ACTIVE or PAST_DUE, sandbox or live.
    expect(read("sandbox", NETOPIA).can_change_card).toBe(true);
    expect(read("sandbox", { ...NETOPIA, status: "PAST_DUE" }).can_change_card).toBe(true);
    expect(read("live", { paymentProvider: "netopia", paymentEnvironment: "live" }).can_change_card).toBe(true);
    // A plan of the other NETOPIA environment is offered neither (P2-W3 (a), D5 5h).
    expect(read("live", NETOPIA)).toMatchObject({ can_upgrade: false, can_change_card: false });
    expect(read("live", { ...NETOPIA, status: "PAST_DUE" })).toMatchObject({ can_upgrade: false, can_change_card: false });
  });

  it("offers Undo only where the revoke route accepts it: ACTIVE, this API's payment system, a cancel pending, before the period end (C-15)", () => {
    const read = (api: "sandbox" | "live", overrides: Partial<SubscriptionState> = {}, now = NOW) => subscriptionView({
      state: state(overrides), taxCountry: "RO", policy: testBillingPolicy, now, paymentEnvironment: api
    });
    // README §14.8's same-host switch: a live start allows a sandbox plan only ACTIVE with a cancel pending, and the
    // revoke route refuses it NOT_SUBSCRIBED (subscription-actions.ts), which Settings would word as "try again".
    expect(read("live", { cancelRequested: true }).can_revoke_cancel).toBe(false);
    // Control: the plan's own system offers it, and a live plan on the live API too.
    expect(read("sandbox", { cancelRequested: true }).can_revoke_cancel).toBe(true);
    expect(read("live", { cancelRequested: true, paymentEnvironment: "live" }).can_revoke_cancel).toBe(true);
    // Nothing to undo; the period is over (the route refuses it there); a plan paused by a dispute (refused while paused).
    expect(read("sandbox").can_revoke_cancel).toBe(false);
    expect(read("sandbox", { cancelRequested: true }, new Date(PERIOD_END.getTime() - 1)).can_revoke_cancel).toBe(true);
    expect(read("sandbox", { cancelRequested: true }, PERIOD_END).can_revoke_cancel).toBe(false);
    expect(read("sandbox", { cancelRequested: true, status: "SUSPENDED" }).can_revoke_cancel).toBe(false);
    expect(read("sandbox", { cancelRequested: true, status: "ENDED" }).can_revoke_cancel).toBe(false);
  });

  it("names only paid plans, every one of them a PlanIdSchema member, and never shows Free as a subscription", () => {
    expect(SubscribedPlanIdSchema.options).toEqual(["PLUS", "PRO", "MAX"]);
    expect(PlanIdSchema.options).toEqual(expect.arrayContaining([...SubscribedPlanIdSchema.options]));
    expect(() => view({ planId: "FREE" })).toThrow(expect.objectContaining({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" }));
  });
});
