import { describe, expect, it } from "vitest";
import { foldSubscription, type SubscriptionEvent, type SubscriptionState } from "@debateai/billing-core";
import type { ChargeRow, QuoteRow } from "@debateai/db";
import {
  chargeInCurrentPeriod, createUpgradeSettlement, monthlyQuoteIdOf, monthlyQuoteOf, upgradeSucceededWrites
} from "../../apps/api/src/billing/upgrade.js";
import { activeSubscriptionEvents, testBillingPlans, testRegionalPlans } from "../support/billingFixtures.js";

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
      state: state(), charge: charge(), quote, plans: testBillingPlans, currentMonthCreditOverrideMicros: null, now,
      recurringNetMicros: 50_000_000
    });
    expect(writes.subscriptionEvent).toEqual({
      kind: "UPGRADED", at: now, planId: "PRO",
      // Terms §12: the price the next renewal charges is recorded with the upgrade (P11a's `recurringNetOf`).
      data: { announced_total_micros: 60_500_000, quote_ref: "q-1", recurring_net_micros: 50_000_000 }
    });
    expect(writes.entitlement).toEqual({
      planId: "PRO", periodAnchorAt: START, cause: "UPGRADED", paidThrough: END, monthCreditOverrideMicros: 19_800_000
    });
  });

  it("CF1 (tests-1): a RON subscription upgrading PLUS to PRO records PRO's RON price as the next renewals' net", () => {
    // Terms §12: every renewal after the upgrade charges this net. PRO is 250.00 RON but 50.00 USD and 50.00 EUR, so only
    // RON tells the subscription's currency from a price read in another one (spec 2026-10-05 §2.16.3).
    const now = new Date(MIDDLE.getTime() + 5_000);
    const ronQuote: QuoteRow = Object.freeze({
      ...quote, netMicros: 75_000_000, taxMicros: 15_750_000, totalMicros: 90_750_000, recurringTotalMicros: 302_500_000,
      currency: "RON"
    });
    const ronCharge: ChargeRow = Object.freeze({
      ...charge(), netMicros: 75_000_000, taxMicros: 15_750_000, totalMicros: 90_750_000, currency: "RON"
    });
    const writes = upgradeSucceededWrites({
      state: state({ currency: "RON", announcedTotalMicros: 121_000_000 }), charge: ronCharge, quote: ronQuote,
      plans: testRegionalPlans, currentMonthCreditOverrideMicros: null, now, recurringNetMicros: 250_000_000
    });
    expect(writes.subscriptionEvent.data).toEqual({
      announced_total_micros: 302_500_000, quote_ref: "q-1", recurring_net_micros: 250_000_000
    });
  });

  it("refuses a charge from a period a renewal has already closed (the settlement refunds it instead)", () => {
    const nextEnd = new Date("2026-11-30T00:00:00.000Z");
    const moved = state({ currentPeriodStart: END, currentPeriodEnd: nextEnd });
    expect(chargeInCurrentPeriod(charge(), moved)).toBe(false);
    expect(chargeInCurrentPeriod(charge(), state())).toBe(true);
    expect(() => upgradeSucceededWrites({
      state: moved, charge: charge(), quote, plans: testBillingPlans, currentMonthCreditOverrideMicros: null, now: END,
      recurringNetMicros: 50_000_000
    })).toThrow(expect.objectContaining({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" }));
  });

  it("keeps paid access until a postponed renewal (A8a), never before it", () => {
    const postponed = new Date("2026-11-09T00:00:00.000Z");
    const writes = upgradeSucceededWrites({
      state: state({ renewalPostponedUntil: postponed }), charge: charge(), quote,
      plans: testBillingPlans, currentMonthCreditOverrideMicros: null, now: MIDDLE, recurringNetMicros: 50_000_000
    });
    expect(writes.entitlement.paidThrough).toEqual(postponed);
  });

  it("keeps R2 Q-1's pending window when paid after the period end, unless a cancel is pending", () => {
    // The renewal waited for this upgrade past END; P11a's RENEWAL_PENDING row pays through END + 72 hours.
    const late = new Date(END.getTime() + 40 * 60_000);
    const held = new Date(END.getTime() + 72 * 3_600_000);
    expect(upgradeSucceededWrites({
      state: state(), charge: charge(), quote, plans: testBillingPlans, currentMonthCreditOverrideMicros: null, now: late,
      recurringNetMicros: 50_000_000
    }).entitlement.paidThrough).toEqual(held);
    expect(upgradeSucceededWrites({
      state: state({ cancelRequested: true }), charge: charge(), quote, plans: testBillingPlans,
      currentMonthCreditOverrideMicros: null, now: late, recurringNetMicros: 50_000_000
    }).entitlement.paidThrough).toEqual(END);
    // Before the period end nothing is pending: the period end, as in the first case.
    expect(upgradeSucceededWrites({
      state: state(), charge: charge(), quote, plans: testBillingPlans, currentMonthCreditOverrideMicros: null,
      now: new Date(END.getTime() - 1), recurringNetMicros: 50_000_000
    }).entitlement.paidThrough).toEqual(END);
  });
});

describe("an upgrade renews at the monthly price the person was shown, not at the plan's price on the day it is paid", () => {
  // Made-up prices. The person was shown 66.00 a month (79.86 with tax); by the time the payment is verified the same
  // plan costs something else in this process's plans (`testBillingPlans` says 50.00).
  const SHOWN_NET = 66_000_000;
  const SHOWN_TOTAL = 79_860_000;
  const shown: QuoteRow = Object.freeze({ ...quote, quoteId: "9b0e7f0c-55aa-4c11-8d07-3a4f1f2e6d11", recurringTotalMicros: SHOWN_TOTAL });
  const monthly: QuoteRow = Object.freeze({
    ...quote, quoteId: monthlyQuoteIdOf(shown.quoteId), kind: "RENEWAL", netMicros: SHOWN_NET, taxMicros: 13_860_000,
    totalMicros: SHOWN_TOTAL, recurringTotalMicros: null
  });
  /** A repository that holds exactly these quote rows, read as the settlement reads them (by id and owner). */
  const holding = (...rows: QuoteRow[]) => ({
    quote: async (quoteId: string, ownerRef: string) =>
      rows.find((row) => row.quoteId === quoteId && row.ownerRef === ownerRef) ?? null
  });
  const client = {} as never;

  it("records the net it is given, whatever the plans say", () => {
    const writes = upgradeSucceededWrites({
      state: state(), charge: charge(), quote: shown, plans: testBillingPlans, currentMonthCreditOverrideMicros: null,
      now: MIDDLE, recurringNetMicros: SHOWN_NET
    });
    expect(writes.subscriptionEvent.data).toEqual({
      announced_total_micros: SHOWN_TOTAL, quote_ref: shown.quoteId, recurring_net_micros: SHOWN_NET
    });
  });

  it("gives every upgrade quote one monthly quote id of its own, a well-formed UUID that never changes", () => {
    const id = monthlyQuoteIdOf(shown.quoteId);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(monthlyQuoteIdOf(shown.quoteId)).toBe(id);
    expect(id).not.toBe(shown.quoteId);
    expect(monthlyQuoteIdOf("9b0e7f0c-55aa-4c11-8d07-3a4f1f2e6d12")).not.toBe(id);
  });

  it("finds the monthly quote beside its upgrade quote, and none for an upgrade quote that has none", async () => {
    expect(await monthlyQuoteOf(holding(shown, monthly), shown, client)).toBe(monthly);
    expect(await monthlyQuoteOf(holding(shown), shown, client)).toBeNull();
    // Another owner's row under the same id is not this person's.
    expect(await monthlyQuoteOf(holding({ ...monthly, ownerRef: "owner-2" }), shown, client)).toBeNull();
  });

  it("refuses a row under that id that is not this upgrade's monthly quote", async () => {
    const wrong: ReadonlyArray<Partial<QuoteRow>> = [
      { kind: "SUBSCRIBE" }, { planId: "MAX" }, { currency: "EUR" },
      { netMicros: 77_000_000, taxMicros: 16_170_000, totalMicros: 93_170_000 }
    ];
    for (const change of wrong) {
      await expect(monthlyQuoteOf(holding({ ...monthly, ...change }), shown, client))
        .rejects.toMatchObject({ code: "BILLING_UPGRADE_MONTHLY_QUOTE_INVALID" });
    }
  });

  /**
   * The settlement itself, over a repository that holds only what it reads: a PLUS subscription, its paid PRO
   * upgrade charge and these quote rows. Returns the UPGRADED event it wrote.
   */
  async function settled(...rows: QuoteRow[]): Promise<SubscriptionEvent> {
    const events = activeSubscriptionEvents("owner-1", START);
    const subscription = foldSubscription(events);
    const paid: ChargeRow = Object.freeze({
      ...charge(subscription.currentPeriodEnd!), subscriptionId: subscription.subscriptionId, quoteId: shown.quoteId
    });
    const written: SubscriptionEvent[] = [];
    const settlement = createUpgradeSettlement({
      repository: {
        ownerErasurePending: async () => false,
        charge: async () => ({ ...paid, events: [] }),
        chargesForSubscription: async () => [paid],
        periodCreditOverride: async () => null,
        quote: holding(...rows).quote,
        appendSubscriptionEvent: async (_client, event) => { written.push(event); }
      },
      entitlements: { append: async () => undefined as never },
      plans: testBillingPlans
    });
    expect(await settlement.succeeded({
      client, now: new Date(MIDDLE.getTime() + 5_000), charge: paid, payment: null, subscription, events, quote: shown,
      ownerRef: "owner-1", customerId: "customer-1", cardCountry: null
    })).toEqual({ kind: "APPLIED" });
    expect(written).toHaveLength(1);
    return written[0]!;
  }

  it("the settlement records the monthly quote's net and total, though this process's plans price the plan differently", async () => {
    expect((await settled(shown, monthly)).data).toEqual({
      announced_total_micros: SHOWN_TOTAL, quote_ref: shown.quoteId, recurring_net_micros: SHOWN_NET
    });
  });

  it("the settlement of an upgrade quote written before monthly quotes existed keeps the plan's price in this process", async () => {
    expect((await settled(shown)).data).toEqual({
      announced_total_micros: SHOWN_TOTAL, quote_ref: shown.quoteId, recurring_net_micros: 50_000_000
    });
  });
});
