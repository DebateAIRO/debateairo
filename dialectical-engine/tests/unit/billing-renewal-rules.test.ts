import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { addBusinessDays, type SubscriptionEvent } from "@debateai/billing-core";
import {
  addDays, addYearsClamped, anniversaryDue, dunningProgress, ordersHoldingCharge, recurringNetOf, renewalNoticeDecision,
  renewalPendingMs, renewalPendingUntil
} from "../../apps/api/src/billing/renewal-rules.js";

const NOW = new Date("2026-11-02T10:00:00.000Z");

function events(...rows: Array<[SubscriptionEvent["kind"], SubscriptionEvent["planId"], SubscriptionEvent["data"]]>): SubscriptionEvent[] {
  return rows.map(([kind, planId, data]) => ({
    eventId: randomUUID(), subscriptionId: "s", ownerRef: "o", kind, at: NOW, planId, periodAnchorAt: NOW,
    xmoneyOrderId: "1", xmoneyCustomerId: "2", cardRef: null, data
  }));
}

describe("P11a the subscriber's own recurring price (Terms §12)", () => {
  it("is the net recorded at activation, and moves only with an upgrade or a downgrade the person chose", () => {
    const activated = events(
      ["CREATED", "PLUS", { xmoney_environment: "stage" }],
      ["ACTIVATED", "PLUS", { announced_total_micros: 24_200_000, recurring_net_micros: 20_000_000 }],
      ["RENEWED", "PLUS", {}]
    );
    expect(recurringNetOf(activated)).toEqual({ currentMicros: 20_000_000, nextRenewalMicros: 20_000_000 });
    const upgraded = [...activated, ...events(["UPGRADED", "PRO", { announced_total_micros: 60_500_000, recurring_net_micros: 50_000_000 }])];
    expect(recurringNetOf(upgraded)).toEqual({ currentMicros: 50_000_000, nextRenewalMicros: 50_000_000 });
    // A scheduled downgrade is charged at the next renewal; the plan paid for now keeps its own net until then.
    const scheduled = [...upgraded, ...events(["DOWNGRADE_SCHEDULED", "PLUS", { announced_total_micros: 24_200_000, recurring_net_micros: 20_000_000 }])];
    expect(recurringNetOf(scheduled)).toEqual({ currentMicros: 50_000_000, nextRenewalMicros: 20_000_000 });
    const applied = [...scheduled, ...events(["DOWNGRADED", "PLUS", {}], ["RENEWED", "PLUS", {}])];
    expect(recurringNetOf(applied)).toEqual({ currentMicros: 20_000_000, nextRenewalMicros: 20_000_000 });
    // PAST_DUE recovers at the scheduled plan directly (P2's fold): the scheduled net is then the current one.
    const recovered = [...scheduled, ...events(["PAST_DUE", "PRO", {}], ["RECOVERED", "PLUS", {}])];
    expect(recurringNetOf(recovered)).toEqual({ currentMicros: 20_000_000, nextRenewalMicros: 20_000_000 });
  });

  it("is unknown for a history that never recorded one, so no renewal guesses it", () => {
    expect(recurringNetOf(events(["CREATED", "PLUS", {}], ["ACTIVATED", "PLUS", { announced_total_micros: 24_200_000 }])))
      .toEqual({ currentMicros: null, nextRenewalMicros: null });
  });
});

describe("P11a the renewal notice rule (A7)", () => {
  it("charges when the fresh total equals the announced total and no recent notice is pending", () => {
    expect(renewalNoticeDecision({ freshTotalMicros: 24_200_000, announcedTotalMicros: 24_200_000, lastNoticeAt: null, now: NOW, noticeBusinessDays: 7 }))
      .toEqual({ kind: "CHARGE" });
    const longAgo = addDays(NOW, -30);
    expect(renewalNoticeDecision({ freshTotalMicros: 24_200_000, announcedTotalMicros: 24_200_000, lastNoticeAt: longAgo, now: NOW, noticeBusinessDays: 7 }))
      .toEqual({ kind: "CHARGE" });
  });

  it("sends a notice and postpones 7 business days when the total changed or was never announced", () => {
    const until = addBusinessDays(NOW, 7);
    expect(renewalNoticeDecision({ freshTotalMicros: 23_800_000, announcedTotalMicros: 24_200_000, lastNoticeAt: null, now: NOW, noticeBusinessDays: 7 }))
      .toEqual({ kind: "NOTICE", until });
    expect(renewalNoticeDecision({ freshTotalMicros: 23_800_000, announcedTotalMicros: null, lastNoticeAt: null, now: NOW, noticeBusinessDays: 7 }))
      .toEqual({ kind: "NOTICE", until });
  });

  it("waits out a notice that is younger than 7 business days", () => {
    const sent = addDays(NOW, -2);
    expect(renewalNoticeDecision({ freshTotalMicros: 23_800_000, announcedTotalMicros: 23_800_000, lastNoticeAt: sent, now: NOW, noticeBusinessDays: 7 }))
      .toEqual({ kind: "WAIT", until: addBusinessDays(sent, 7) });
  });
});

describe("P11a how long a renewal waits out an outage (Q-1)", () => {
  it("is 72 hours past the period end, or past a later notice postponement, never past an earlier one", () => {
    const end = new Date("2026-11-01T10:00:00.000Z");
    expect(renewalPendingMs()).toBe(72 * 3_600_000);
    expect(renewalPendingUntil({ currentPeriodEnd: end, renewalPostponedUntil: null }, end))
      .toEqual(new Date("2026-11-04T10:00:00.000Z"));
    // A7's postponement moved the charge date: the 72 hours count from it.
    const postponed = new Date("2026-11-10T10:00:00.000Z");
    expect(renewalPendingUntil({ currentPeriodEnd: end, renewalPostponedUntil: postponed }, end))
      .toEqual(new Date("2026-11-13T10:00:00.000Z"));
    // A postponement of an earlier period, or a state already past this period, never stretches this one.
    expect(renewalPendingUntil({ currentPeriodEnd: end, renewalPostponedUntil: new Date("2026-10-05T10:00:00.000Z") }, end))
      .toEqual(new Date("2026-11-04T10:00:00.000Z"));
    expect(renewalPendingUntil({ currentPeriodEnd: new Date("2026-12-01T10:00:00.000Z"), renewalPostponedUntil: postponed }, end))
      .toEqual(new Date("2026-11-04T10:00:00.000Z"));
  });
});

describe("P11a where a dunning stands, read from the history (Q-1: an attempt may have no charge)", () => {
  const base = events(["CREATED", "PLUS", {}], ["ACTIVATED", "PLUS", { recurring_net_micros: 20_000_000 }]);
  const firstAt = new Date("2026-11-04T10:01:00.000Z");
  const secondAt = new Date("2026-11-05T10:02:00.000Z");

  it("is nothing before the first failure", () => {
    expect(dunningProgress(base, { status: "ACTIVE", pastDueSince: null, retryIndex: 0 })).toBeNull();
  });

  it("counts attempts with or without a charge, from the first failure's recorded time", () => {
    const [unpriced] = events(["PAST_DUE", "PLUS", {
      attempt: 1, reason: "TAX_SERVICE_UNAVAILABLE", first_failed_at: firstAt.toISOString(), next_retry_at: addDays(firstAt, 1).toISOString()
    }]);
    const [declined] = events(["PAST_DUE", "PLUS", {
      charge_id: "c2", attempt: 2, first_failed_at: firstAt.toISOString(), next_retry_at: addDays(firstAt, 3).toISOString()
    }]);
    const history = [...base, { ...unpriced!, at: firstAt }, { ...declined!, at: secondAt }];
    expect(dunningProgress(history, { status: "PAST_DUE", pastDueSince: firstAt, retryIndex: 1 }))
      .toEqual({ firstFailedAt: firstAt, lastFailedAt: secondAt, failedAttempts: 2 });
    // A PAST_DUE with neither key falls back to the fold's own pastDueSince and retryIndex.
    const [bare] = events(["PAST_DUE", "PLUS", { charge_id: "c1" }]);
    expect(dunningProgress([...base, { ...bare!, at: firstAt }], { status: "PAST_DUE", pastDueSince: firstAt, retryIndex: 0 }))
      .toEqual({ firstFailedAt: firstAt, lastFailedAt: firstAt, failedAttempts: 1 });
  });
});

describe("P11a where a lost rebill may sit (A2, A12: a card change moves the subscription's order)", () => {
  const made = new Date("2026-12-02T10:00:00.000Z");
  const [created, activated, changed] = events(
    ["CREATED", "PLUS", { xmoney_environment: "stage" }],
    ["ACTIVATED", "PLUS", { announced_total_micros: 24_200_000, recurring_net_micros: 20_000_000 }],
    ["CARD_CHANGED", "PLUS", { charge_id: "c".repeat(32), retry_now: false }]
  );
  const on = (event: SubscriptionEvent | undefined, at: Date, xmoneyOrderId: string): SubscriptionEvent =>
    ({ ...event!, eventId: randomUUID(), at, xmoneyOrderId });
  // Order "1" at activation, "2" from a card change the day before the charge, then "3" and "2" again after it.
  const history = [
    on(created, NOW, "1"), on(activated, NOW, "1"),
    on(changed, new Date(made.getTime() - 86_400_000), "2"),
    on(changed, new Date(made.getTime() + 60_000), "3"),
    on(changed, new Date(made.getTime() + 120_000), "2")
  ];

  it("is the order in force when the charge was made, then each order a later card change set, oldest first", () => {
    expect(ordersHoldingCharge(history, made)).toEqual(["2", "3"]);
  });

  it("is that one order alone when no card change came after the charge", () => {
    expect(ordersHoldingCharge(history.slice(0, 3), made)).toEqual(["2"]);
    expect(ordersHoldingCharge(history, new Date(made.getTime() + 180_000))).toEqual(["2"]);
  });

  it("reads a card change at the charge's own instant as in force when it was made", () => {
    expect(ordersHoldingCharge([...history.slice(0, 3), on(changed, made, "4")], made)).toEqual(["4"]);
  });
});

describe("P11b the yearly reminder window", () => {
  it("clamps a 29 February anniversary to the 28th and counts whole years", () => {
    expect(addYearsClamped(new Date("2028-02-29T09:00:00.000Z"), 1)).toEqual(new Date("2029-02-28T09:00:00.000Z"));
    expect(addYearsClamped(new Date("2028-02-29T09:00:00.000Z"), 4)).toEqual(new Date("2032-02-29T09:00:00.000Z"));
  });

  it("is due only in the days right after an anniversary", () => {
    const activated = new Date("2026-10-01T10:00:00.000Z");
    expect(anniversaryDue(activated, new Date("2027-09-30T10:00:00.000Z"), 7)).toBeNull();
    expect(anniversaryDue(activated, new Date("2027-10-01T10:00:00.000Z"), 7)).toBe(1);
    expect(anniversaryDue(activated, new Date("2027-10-07T09:59:00.000Z"), 7)).toBe(1);
    expect(anniversaryDue(activated, new Date("2027-10-09T10:00:00.000Z"), 7)).toBeNull();
    expect(anniversaryDue(activated, new Date("2028-10-02T10:00:00.000Z"), 7)).toBe(2);
  });
});
