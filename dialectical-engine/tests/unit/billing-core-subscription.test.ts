import { describe, expect, it } from "vitest";
import {
  entitlementPlanOf,
  foldSubscription,
  type SubscriptionEvent,
  type SubscriptionEventKind
} from "@debateai/billing-core";

const SUBSCRIPTION = "5f0a4e6c-0b3a-4c55-9b1e-7d2f00000001";
const OWNER = "5f0a4e6c-0b3a-4c55-9b1e-7d2f00000002";
const anchor = new Date("2026-01-31T10:00:00.000Z");
let sequence = 0;

function event(
  kind: SubscriptionEventKind,
  overrides: Partial<Omit<SubscriptionEvent, "kind">> = {}
): SubscriptionEvent {
  sequence += 1;
  return {
    eventId: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    subscriptionId: SUBSCRIPTION,
    ownerRef: OWNER,
    kind,
    at: new Date(anchor.getTime() + sequence * 1_000),
    planId: "PLUS",
    periodAnchorAt: null,
    xmoneyOrderId: null,
    xmoneyCustomerId: null,
    cardRef: null,
    data: {},
    ...overrides
  };
}

const created = (): SubscriptionEvent => event("CREATED", { xmoneyCustomerId: "55", data: { xmoney_environment: "stage" } });
const activated = (): SubscriptionEvent => event("ACTIVATED", {
  at: anchor, periodAnchorAt: anchor, xmoneyOrderId: "4711", cardRef: "77",
  data: { announced_total_micros: 24_200_000 }
});
const ended = (cause: string): SubscriptionEvent => event("ENDED", { data: { cause } });
const fold = (...events: SubscriptionEvent[]) => foldSubscription(events);
const illegal = expect.objectContaining({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" });

describe("P2 — subscription fold: the legal paths", () => {
  it("CREATED → ACTIVATED gives the first anchored month, the order, the card and the announced total", () => {
    const createdOnly = fold(created());
    expect(createdOnly.status).toBe("CREATED");
    expect(entitlementPlanOf(createdOnly)).toBe("FREE");
    const state = fold(created(), activated());
    expect(state).toMatchObject({
      status: "ACTIVE", planId: "PLUS", xmoneyOrderId: "4711", xmoneyCustomerId: "55", cardRef: "77",
      announcedTotalMicros: 24_200_000, activatedAt: anchor, cancelRequested: false, retryIndex: 0,
      xmoneyEnvironment: "stage"
    });
    expect(state.currentPeriodStart?.toISOString()).toBe("2026-01-31T10:00:00.000Z");
    expect(state.currentPeriodEnd?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(entitlementPlanOf(state)).toBe("PLUS");
  });

  it("RENEWED advances one anchored month; RENEWAL_POSTPONED does not move the period", () => {
    const postponed = fold(created(), activated(), event("RENEWAL_POSTPONED", { data: { until: "2026-03-10T10:00:00.000Z" } }));
    expect(postponed.currentPeriodEnd?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(postponed.renewalPostponedUntil?.toISOString()).toBe("2026-03-10T10:00:00.000Z");
    const renewed = fold(created(), activated(), event("RENEWAL_POSTPONED", { data: { until: "2026-03-10T10:00:00.000Z" } }), event("RENEWED"));
    expect(renewed.currentPeriodStart?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(renewed.currentPeriodEnd?.toISOString()).toBe("2026-03-31T10:00:00.000Z");
    expect(renewed.renewalPostponedUntil).toBeNull();
  });

  it("takes the new period from RENEWED's data when P11 wrote it (R-23)", () => {
    const state = fold(created(), activated(), event("RENEWED", {
      data: { charge_id: "c".repeat(32), period_start: "2026-02-28T10:00:00.000Z", period_end: "2026-03-31T10:00:00.000Z" }
    }), event("RENEWED", {
      data: { charge_id: "d".repeat(32), period_start: "2026-03-31T10:00:00.000Z", period_end: "2026-04-30T10:00:00.000Z" }
    }));
    expect(state.currentPeriodStart?.toISOString()).toBe("2026-03-31T10:00:00.000Z");
    expect(state.currentPeriodEnd?.toISOString()).toBe("2026-04-30T10:00:00.000Z");
  });

  it("RENEWAL_NOTICE_SENT records the new announced total and when it was sent (A7)", () => {
    const state = fold(created(), activated(), event("RENEWAL_NOTICE_SENT", {
      data: { announced_total_micros: 24_400_000, sent_at: "2026-02-17T09:00:00.000Z" }
    }));
    expect(state.announcedTotalMicros).toBe(24_400_000);
    expect(state.lastNoticeAt?.toISOString()).toBe("2026-02-17T09:00:00.000Z");
  });

  it("PAST_DUE keeps the paid plan, counts retries, and RECOVERED advances the period", () => {
    const failing = event("PAST_DUE");
    const pastDue = fold(created(), activated(), failing, event("PAST_DUE"), event("PAST_DUE"));
    expect(pastDue).toMatchObject({ status: "PAST_DUE", retryIndex: 2, pastDueSince: failing.at });
    expect(entitlementPlanOf(pastDue)).toBe("PLUS");
    const recovered = fold(created(), activated(), event("PAST_DUE"), event("PAST_DUE"), event("RECOVERED"));
    expect(recovered).toMatchObject({ status: "ACTIVE", retryIndex: 0, pastDueSince: null });
    expect(recovered.currentPeriodStart?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
  });

  it("the last failed retry ends in Free", () => {
    const state = fold(created(), activated(), event("PAST_DUE"), ended("DUNNING"));
    expect(state).toMatchObject({ status: "ENDED", endedCause: "DUNNING" });
    expect(entitlementPlanOf(state)).toBe("FREE");
  });

  it("UPGRADED changes the plan and keeps the anchor", () => {
    const state = fold(created(), activated(), event("UPGRADED", { planId: "PRO", data: { announced_total_micros: 60_500_000 } }));
    expect(state).toMatchObject({ planId: "PRO", announcedTotalMicros: 60_500_000 });
    expect(state.currentPeriodStart?.toISOString()).toBe("2026-01-31T10:00:00.000Z");
    expect(entitlementPlanOf(state)).toBe("PRO");
  });

  it("DOWNGRADE_SCHEDULED waits; at the renewal DOWNGRADED switches the plan and RENEWED moves the period", () => {
    const upgrade = () => event("UPGRADED", { planId: "MAX", data: { announced_total_micros: 242_000_000, quote_ref: "q" } });
    const schedule = () => event("DOWNGRADE_SCHEDULED", { planId: "PRO", data: { announced_total_micros: 60_500_000 } });
    const scheduled = fold(created(), activated(), upgrade(), schedule());
    expect(scheduled).toMatchObject({ planId: "MAX", scheduledDowngradePlanId: "PRO", announcedTotalMicros: 60_500_000 });
    const switched = fold(created(), activated(), upgrade(), schedule(),
      event("DOWNGRADED", { planId: "PRO", data: { charge_id: "e".repeat(32) } }));
    expect(switched).toMatchObject({ planId: "PRO", scheduledDowngradePlanId: null, status: "ACTIVE" });
    expect(switched.currentPeriodEnd?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    const renewed = fold(created(), activated(), upgrade(), schedule(),
      event("DOWNGRADED", { planId: "PRO", data: { charge_id: "e".repeat(32) } }),
      event("RENEWED", { planId: "PRO", data: { charge_id: "e".repeat(32), period_start: "2026-02-28T10:00:00.000Z", period_end: "2026-03-31T10:00:00.000Z" } }));
    expect(renewed).toMatchObject({ planId: "PRO", scheduledDowngradePlanId: null });
    expect(renewed.currentPeriodStart?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(renewed.currentPeriodEnd?.toISOString()).toBe("2026-03-31T10:00:00.000Z");
    expect(entitlementPlanOf(renewed)).toBe("PRO");
  });

  it("a downgrade can land on a recovered retry: DOWNGRADED then RECOVERED out of PAST_DUE", () => {
    const state = fold(created(), activated(),
      event("UPGRADED", { planId: "PRO", data: { announced_total_micros: 60_500_000 } }),
      event("DOWNGRADE_SCHEDULED", { planId: "PLUS", data: { announced_total_micros: 24_200_000 } }),
      event("PAST_DUE", { planId: "PRO", data: { attempt: 1 } }),
      event("DOWNGRADED", { planId: "PLUS" }),
      event("RECOVERED", { planId: "PLUS", data: { period_start: "2026-02-28T10:00:00.000Z", period_end: "2026-03-31T10:00:00.000Z" } }));
    expect(state).toMatchObject({ status: "ACTIVE", planId: "PLUS", scheduledDowngradePlanId: null, retryIndex: 0, pastDueSince: null });
    expect(state.currentPeriodEnd?.toISOString()).toBe("2026-03-31T10:00:00.000Z");
  });

  it("a PAST_DUE plan recovers at the scheduled lower plan in ONE event, moving the period once (D6a P11a's write)", () => {
    const state = fold(created(), activated(),
      event("UPGRADED", { planId: "PRO", data: { announced_total_micros: 60_500_000 } }),
      event("DOWNGRADE_SCHEDULED", { planId: "PLUS", data: { announced_total_micros: 24_200_000 } }),
      event("PAST_DUE", { planId: "PRO", data: { attempt: 1 } }),
      event("RECOVERED", { planId: "PLUS", data: { period_start: "2026-02-28T10:00:00.000Z", period_end: "2026-03-31T10:00:00.000Z" } }));
    expect(state).toMatchObject({ status: "ACTIVE", planId: "PLUS", scheduledDowngradePlanId: null, retryIndex: 0, pastDueSince: null });
    expect(state.currentPeriodStart?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(state.currentPeriodEnd?.toISOString()).toBe("2026-03-31T10:00:00.000Z");
    expect(entitlementPlanOf(state)).toBe("PLUS");
  });

  it("never dates a period by when its event was written: renewals retried for 72 h (RULINGS-R2 Q-1)", () => {
    const periodEnd = new Date("2026-02-28T10:00:00.000Z");
    // xMoney or the tax service was down at the period end; the renewal went through 71 hours later.
    const renewed = fold(created(), activated(), event("RENEWED", { at: new Date(periodEnd.getTime() + 71 * 3_600_000) }));
    expect(renewed.currentPeriodStart?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(renewed.currentPeriodEnd?.toISOString()).toBe("2026-03-31T10:00:00.000Z");
    // No outcome after 72 hours: dunning starts from that moment, and the period still does not move.
    const dunningFrom = new Date(periodEnd.getTime() + 72 * 3_600_000);
    const pastDue = fold(created(), activated(), event("PAST_DUE", { at: dunningFrom }));
    expect(pastDue).toMatchObject({ status: "PAST_DUE", pastDueSince: dunningFrom, retryIndex: 0 });
    expect(pastDue.currentPeriodEnd?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(entitlementPlanOf(pastDue)).toBe("PLUS");
    const recovered = fold(created(), activated(), event("PAST_DUE", { at: dunningFrom }),
      event("RECOVERED", { at: new Date(dunningFrom.getTime() + 3 * 86_400_000) }));
    expect(recovered.currentPeriodStart?.toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(recovered.currentPeriodEnd?.toISOString()).toBe("2026-03-31T10:00:00.000Z");
  });

  it("a live plan paid with a card from a blocked country ends as CANCEL without a request (P9b)", () => {
    const state = fold(created(), activated(), event("ENDED", { data: { cause: "CANCEL", reason: "CARD_COUNTRY_BLOCKED" } }));
    expect(state).toMatchObject({ status: "ENDED", endedCause: "CANCEL" });
    expect(entitlementPlanOf(state)).toBe("FREE");
  });

  it("notices land on ACTIVE and PAST_DUE alike", () => {
    const state = fold(created(), activated(), event("PAST_DUE"), event("RENEWAL_NOTICE_SENT", {
      data: { announced_total_micros: 24_400_000 }
    }));
    expect(state).toMatchObject({ status: "PAST_DUE", announcedTotalMicros: 24_400_000 });
    expect(state.lastNoticeAt).not.toBeNull();
  });

  it("cancel keeps the plan until ENDED(CANCEL); a revoke clears the request", () => {
    const requested = fold(created(), activated(), event("CANCEL_REQUESTED"));
    expect(requested).toMatchObject({ status: "ACTIVE", cancelRequested: true });
    expect(entitlementPlanOf(requested)).toBe("PLUS");
    expect(fold(created(), activated(), event("CANCEL_REQUESTED"), event("CANCEL_REVOKED")).cancelRequested).toBe(false);
    const cancelled = fold(created(), activated(), event("CANCEL_REQUESTED"), ended("CANCEL"));
    expect(cancelled).toMatchObject({ status: "ENDED", endedCause: "CANCEL" });
    expect(entitlementPlanOf(cancelled)).toBe("FREE");
  });

  it("withdrawal, a dispute and erasure each leave the paid plan", () => {
    expect(entitlementPlanOf(fold(created(), activated(), event("WITHDRAWN")))).toBe("FREE");
    const suspended = fold(created(), activated(), event("SUSPENDED"));
    expect(suspended.status).toBe("SUSPENDED");
    expect(entitlementPlanOf(suspended)).toBe("FREE");
    expect(fold(created(), activated(), event("SUSPENDED"), event("RESUMED")).status).toBe("ACTIVE");
    expect(fold(created(), activated(), event("SUSPENDED"), ended("DISPUTE"))).toMatchObject({ status: "ENDED", endedCause: "DISPUTE" });
    expect(fold(created(), activated(), event("ERASURE_STOPPED"))).toMatchObject({ status: "ENDED", endedCause: "ERASURE" });
    expect(fold(created(), event("ERASURE_STOPPED"))).toMatchObject({ status: "ENDED", endedCause: "ERASURE" });
  });

  it("CARD_CHANGED moves the order, the card and the xMoney customer, also while PAST_DUE", () => {
    const state = fold(created(), activated(), event("CARD_CHANGED", { xmoneyOrderId: "4800", cardRef: "78" }));
    expect(state).toMatchObject({ xmoneyOrderId: "4800", cardRef: "78", xmoneyCustomerId: "55", status: "ACTIVE" });
    const retrying = fold(created(), activated(), event("PAST_DUE"), event("CARD_CHANGED", {
      xmoneyOrderId: "4801", xmoneyCustomerId: "56", cardRef: "79", data: { charge_id: "f".repeat(32), retry_now: true }
    }));
    expect(retrying).toMatchObject({ status: "PAST_DUE", xmoneyOrderId: "4801", xmoneyCustomerId: "56", cardRef: "79" });
  });

  it("an ABANDONED start re-activates on a late payment (A8c)", () => {
    const abandoned = fold(created(), ended("ABANDONED"));
    expect(abandoned).toMatchObject({ status: "ENDED", endedCause: "ABANDONED" });
    const late = fold(created(), ended("ABANDONED"), activated());
    expect(late).toMatchObject({ status: "ACTIVE", endedCause: null });
  });

  it("keeps the xMoney system the subscription was created in, for life", () => {
    const live = fold(event("CREATED", { data: { xmoney_environment: "live" } }), activated(), event("RENEWED"));
    expect(live.xmoneyEnvironment).toBe("live");
  });

  it("leaves PAST_DUE by every exit D6a/D6b write, and SUSPENDED by erasure (spec §2.8: every transition)", () => {
    const pastDue = () => [created(), activated(), event("PAST_DUE")] as const;
    expect(fold(...pastDue(), event("CANCEL_REQUESTED"))).toMatchObject({ status: "PAST_DUE", cancelRequested: true });
    expect(fold(...pastDue(), event("CANCEL_REQUESTED"), ended("CANCEL"))).toMatchObject({ status: "ENDED", endedCause: "CANCEL" });
    expect(fold(...pastDue(), event("WITHDRAWN")).status).toBe("WITHDRAWN");
    expect(fold(...pastDue(), event("SUSPENDED")).status).toBe("SUSPENDED");
    expect(fold(...pastDue(), event("ERASURE_STOPPED"))).toMatchObject({ status: "ENDED", endedCause: "ERASURE" });
    expect(fold(...pastDue(), event("ENDED", { data: { cause: "CANCEL", reason: "CARD_COUNTRY_BLOCKED" } })))
      .toMatchObject({ status: "ENDED", endedCause: "CANCEL" });
    expect(fold(created(), activated(), event("SUSPENDED"), event("ERASURE_STOPPED")))
      .toMatchObject({ status: "ENDED", endedCause: "ERASURE" });
  });

  it("W7 (P2-I10): a deletion scheduled while SUSPENDED stops the renewal too, and a resumed plan keeps that stop", () => {
    const stopped = fold(created(), activated(), event("SUSPENDED"), event("CANCEL_REQUESTED", { data: { source: "ACCOUNT_ERASURE" } }));
    expect(stopped).toMatchObject({ status: "SUSPENDED", cancelRequested: true });
    // Won after the deletion was cancelled: the plan resumes, runs to its period end, and is not renewed.
    const resumed = fold(created(), activated(), event("SUSPENDED"), event("CANCEL_REQUESTED"), event("RESUMED"));
    expect(resumed).toMatchObject({ status: "ACTIVE", cancelRequested: true });
    expect(fold(created(), activated(), event("SUSPENDED"), event("CANCEL_REQUESTED"), ended("DISPUTE")))
      .toMatchObject({ status: "ENDED", endedCause: "DISPUTE" });
    // The erasure's commit still ends it.
    expect(fold(created(), activated(), event("SUSPENDED"), event("CANCEL_REQUESTED"), event("ERASURE_STOPPED")))
      .toMatchObject({ status: "ENDED", endedCause: "ERASURE" });
  });
});

describe("P2 — subscription fold: illegal histories are refused", () => {
  it.each([
    ["nothing at all", () => fold()],
    ["a first event that is not CREATED", () => fold(activated())],
    ["CREATED twice", () => fold(created(), created())],
    ["a renewal before activation", () => fold(created(), event("RENEWED"))],
    ["RENEWED that changes the plan", () => fold(created(), activated(), event("RENEWED", { planId: "PRO" }))],
    ["DOWNGRADED with nothing scheduled", () => fold(created(), activated(), event("DOWNGRADED", { planId: "PLUS" }))],
    ["an ACTIVE renewal at the scheduled plan without DOWNGRADED first", () => fold(created(), activated(),
      event("UPGRADED", { planId: "PRO", data: { announced_total_micros: 60_500_000 } }),
      event("DOWNGRADE_SCHEDULED", { planId: "PLUS", data: { announced_total_micros: 24_200_000 } }),
      event("RENEWED", { planId: "PLUS" }))],
    ["RECOVERED at a plan neither current nor scheduled", () => fold(created(), activated(), event("PAST_DUE"),
      event("RECOVERED", { planId: "PRO" }))],
    ["a renewal that does not continue the period", () => fold(created(), activated(), event("RENEWED", {
      data: { period_start: "2026-03-01T10:00:00.000Z", period_end: "2026-03-31T10:00:00.000Z" }
    }))],
    ["a renewal period that ends when it starts", () => fold(created(), activated(), event("RENEWED", {
      data: { period_start: "2026-02-28T10:00:00.000Z", period_end: "2026-02-28T10:00:00.000Z" }
    }))],
    ["ENDED(CANCEL) without a request", () => fold(created(), activated(), ended("CANCEL"))],
    ["ENDED(CANCEL) for any other reason without a request", () => fold(created(), activated(), event("ENDED", {
      data: { cause: "CANCEL", reason: "SOMETHING_ELSE" }
    }))],
    ["a postponement while PAST_DUE", () => fold(created(), activated(), event("PAST_DUE"), event("RENEWAL_POSTPONED", {
      data: { until: "2026-03-10T10:00:00.000Z" }
    }))],
    ["RESUMED without a suspension", () => fold(created(), activated(), event("RESUMED"))],
    ["ENDED(DUNNING) while paid up", () => fold(created(), activated(), ended("DUNNING"))],
    ["ENDED(ERASURE) instead of ERASURE_STOPPED", () => fold(created(), activated(), ended("ERASURE"))],
    ["an unknown cause", () => fold(created(), activated(), ended("BORED"))],
    ["anything after WITHDRAWN", () => fold(created(), activated(), event("WITHDRAWN"), event("RESUMED"))],
    ["re-activation after a real end", () => fold(created(), activated(), event("CANCEL_REQUESTED"), ended("CANCEL"), activated())],
    ["an ACTIVATED without an order", () => fold(created(), event("ACTIVATED", { data: { announced_total_micros: 1 } }))],
    ["an ACTIVATED without the announced total", () => fold(created(), event("ACTIVATED", { xmoneyOrderId: "1" }))],
    ["an event for another subscription", () => fold(created(), activated(), event("RENEWED", { subscriptionId: "5f0a4e6c-0b3a-4c55-9b1e-7d2f00000009" }))],
    ["a revoke with no cancel pending", () => fold(created(), activated(), event("CANCEL_REVOKED"))],
    ["a postponement without a date", () => fold(created(), activated(), event("RENEWAL_POSTPONED"))],
    ["UPGRADED while PAST_DUE", () => fold(created(), activated(), event("PAST_DUE"), event("UPGRADED", {
      planId: "PRO", data: { announced_total_micros: 60_500_000 }
    }))],
    ["DOWNGRADE_SCHEDULED while PAST_DUE", () => fold(created(), activated(),
      event("UPGRADED", { planId: "PRO", data: { announced_total_micros: 60_500_000 } }), event("PAST_DUE"),
      event("DOWNGRADE_SCHEDULED", { planId: "PLUS", data: { announced_total_micros: 24_200_000 } }))],
    ["RENEWED while SUSPENDED", () => fold(created(), activated(), event("SUSPENDED"), event("RENEWED"))],
    ["a CREATED that names no xMoney environment", () => fold(event("CREATED"))],
    ["a CREATED that names an unknown xMoney environment", () => fold(event("CREATED", { data: { xmoney_environment: "sandbox" } }))]
  ])("%s", (_label, run) => {
    expect(run).toThrow(illegal);
  });
});
