import { describe, expect, it } from "vitest";
import type { SubscriptionState } from "@debateai/billing-core";
import type { ChargeRow, QuoteRow } from "@debateai/db";
import { chargeInCurrentPeriod, upgradeSucceededWrites } from "../../apps/api/src/billing/upgrade.js";
import { testBillingPlans } from "../support/billingFixtures.js";

const START = new Date("2026-10-01T00:00:00.000Z");
const END = new Date("2026-10-31T00:00:00.000Z");
const MIDDLE = new Date("2026-10-16T00:00:00.000Z");

const state = (overrides: Partial<SubscriptionState> = {}): SubscriptionState => Object.freeze({
  subscriptionId: "sub-1", ownerRef: "owner-1", planId: "PLUS", status: "ACTIVE",
  periodAnchorAt: START, currentPeriodStart: START, currentPeriodEnd: END,
  cancelRequested: false, scheduledDowngradePlanId: null, activatedAt: START, endedCause: null, pastDueSince: null, retryIndex: 0,
  renewalPostponedUntil: null, announcedTotalMicros: 24_200_000, lastNoticeAt: null, paymentProvider: "netopia",
  paymentEnvironment: "sandbox", cardTokenId: null, currency: "USD",
  ...overrides
});

const quote: QuoteRow = Object.freeze({
  quoteId: "q-1", ownerRef: "owner-1", planId: "PRO", kind: "UPGRADE",
  netMicros: 15_000_000, taxMicros: 3_150_000, totalMicros: 18_150_000, taxCountry: "RO", taxRegion: null,
  taxRateBasisPoints: 2_100, taxStatus: "TAXABLE", taxName: "VAT", quadernoRef: null,
  createdAt: MIDDLE, expiresAt: new Date(MIDDLE.getTime() + 1_800_000),
  locationCiphertext: Buffer.alloc(0), keyId: "k", recurringTotalMicros: 60_500_000, currency: "USD"
});

/** P12c's key: the charge runs from its quote's creation to the end of the period it was quoted in. */
const charge = (periodEnd: Date = END): ChargeRow => Object.freeze({
  chargeId: "c".repeat(32), ownerRef: "owner-1", subscriptionId: "sub-1", kind: "UPGRADE", attempt: 1,
  periodStart: MIDDLE, periodEnd, quoteId: "q-1", netMicros: 15_000_000, taxMicros: 3_150_000, totalMicros: 18_150_000,
  currency: "USD", createdAt: MIDDLE, paymentProvider: "netopia", paymentEnvironment: "sandbox"
});

describe("P12c what the UPGRADE settlement writes when an upgrade is paid", () => {
  it("keeps the anchor, pays through the period end, announces the new total and prorates the credit", () => {
    const now = new Date(MIDDLE.getTime() + 5_000);
    const writes = upgradeSucceededWrites({
      state: state(), charge: charge(), quote, plans: testBillingPlans, currentMonthCreditOverrideMicros: null, now
    });
    expect(writes.subscriptionEvent).toEqual({
      kind: "UPGRADED", at: now, planId: "PRO",
      // Terms §12: the price the next renewal charges is recorded with the upgrade (P11a's `recurringNetOf`).
      data: { announced_total_micros: 60_500_000, quote_ref: "q-1", recurring_net_micros: 50_000_000 }
    });
    expect(writes.entitlement).toEqual({
      planId: "PRO", periodAnchorAt: START, cause: "UPGRADED", paidThrough: END, monthCreditOverrideMicros: 12_500_000
    });
  });

  it("refuses a charge from a period a renewal has already closed (the settlement refunds it instead)", () => {
    const nextEnd = new Date("2026-11-30T00:00:00.000Z");
    const moved = state({ currentPeriodStart: END, currentPeriodEnd: nextEnd });
    expect(chargeInCurrentPeriod(charge(), moved)).toBe(false);
    expect(chargeInCurrentPeriod(charge(), state())).toBe(true);
    expect(() => upgradeSucceededWrites({
      state: moved, charge: charge(), quote, plans: testBillingPlans, currentMonthCreditOverrideMicros: null, now: END
    })).toThrow(expect.objectContaining({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" }));
  });

  it("keeps paid access until a postponed renewal (A8a), never before it", () => {
    const postponed = new Date("2026-11-09T00:00:00.000Z");
    const writes = upgradeSucceededWrites({
      state: state({ renewalPostponedUntil: postponed }), charge: charge(), quote,
      plans: testBillingPlans, currentMonthCreditOverrideMicros: null, now: MIDDLE
    });
    expect(writes.entitlement.paidThrough).toEqual(postponed);
  });

  it("keeps R2 Q-1's pending window when paid after the period end, unless a cancel is pending", () => {
    // The renewal waited for this upgrade past END; P11a's RENEWAL_PENDING row pays through END + 72 hours.
    const late = new Date(END.getTime() + 40 * 60_000);
    const held = new Date(END.getTime() + 72 * 3_600_000);
    expect(upgradeSucceededWrites({
      state: state(), charge: charge(), quote, plans: testBillingPlans, currentMonthCreditOverrideMicros: null, now: late
    }).entitlement.paidThrough).toEqual(held);
    expect(upgradeSucceededWrites({
      state: state({ cancelRequested: true }), charge: charge(), quote, plans: testBillingPlans,
      currentMonthCreditOverrideMicros: null, now: late
    }).entitlement.paidThrough).toEqual(END);
    // Before the period end nothing is pending: the period end, as in the first case.
    expect(upgradeSucceededWrites({
      state: state(), charge: charge(), quote, plans: testBillingPlans, currentMonthCreditOverrideMicros: null,
      now: new Date(END.getTime() - 1)
    }).entitlement.paidThrough).toEqual(END);
  });
});
