import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decimalToMicros,
  microsToDecimal,
  upgradeMonthCreditOverrideMicros,
  upgradeProrationMicros,
  withdrawalRefundMicros
} from "@debateai/billing-core";

const day = 86_400_000;
const start = new Date("2026-10-01T09:30:00.000Z");
const plus30 = (offsetMs: number): Date => new Date(start.getTime() + offsetMs);
const end30 = plus30(30 * day);
const end31 = plus30(31 * day);

describe("P2 — decimal money", () => {
  it("prints whole cents and refuses anything finer", () => {
    expect(microsToDecimal(24_200_000)).toBe("24.20");
    expect(microsToDecimal(0)).toBe("0.00");
    expect(microsToDecimal(10_000)).toBe("0.01");
    expect(microsToDecimal(200_000_000)).toBe("200.00");
    expect(microsToDecimal(-1_500_000)).toBe("-1.50");
    expect(() => microsToDecimal(24_200_001)).toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_NOT_CENTS" }));
    expect(() => microsToDecimal(1.5)).toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_INVALID" }));
  });

  it("parses one or two decimals exactly and refuses everything else", () => {
    expect(decimalToMicros("24.2")).toBe(24_200_000);
    expect(decimalToMicros("24.20")).toBe(24_200_000);
    expect(decimalToMicros("24")).toBe(24_000_000);
    expect(decimalToMicros("0.01")).toBe(10_000);
    expect(decimalToMicros("-3.10")).toBe(-3_100_000);
    for (const refused of ["24.201", "1e3", " 24.20", "24.", ".5", "", "0024.20", "24,20", "NaN"]) {
      expect(() => decimalToMicros(refused), refused)
        .toThrow(expect.objectContaining({ code: "BILLING_DECIMAL_INVALID" }));
    }
  });

  it("round-trips every whole-cent amount", () => {
    fc.assert(fc.property(fc.integer({ min: -10_000_000, max: 10_000_000 }), (cents) => {
      expect(decimalToMicros(microsToDecimal(cents * 10_000))).toBe(cents * 10_000);
    }));
  });
});

describe("P2 — upgrade proration", () => {
  const base = { oldNetMicros: 20_000_000, newNetMicros: 50_000_000, periodStart: start, periodEnd: end30 };
  it("charges the difference for the remaining share of the period, floored to cents", () => {
    expect(upgradeProrationMicros({ ...base, now: start })).toBe(30_000_000);
    expect(upgradeProrationMicros({ ...base, now: plus30(10 * day) })).toBe(20_000_000);
    expect(upgradeProrationMicros({ ...base, now: end30 })).toBe(0);
    expect(upgradeProrationMicros({ ...base, now: plus30(40 * day) })).toBe(0);
    expect(upgradeProrationMicros({ ...base, now: plus30(-day) })).toBe(30_000_000);
    expect(upgradeProrationMicros({ ...base, periodEnd: end31, now: plus30(day) })).toBe(29_030_000);
    expect(upgradeProrationMicros({ ...base, now: plus30(30 * day - 1_000) })).toBe(0);
  });
  it("refuses a move that is not upward and a period that is not a period", () => {
    expect(() => upgradeProrationMicros({ ...base, newNetMicros: 20_000_000, now: start }))
      .toThrow(expect.objectContaining({ code: "UPGRADE_NOT_HIGHER" }));
    expect(() => upgradeProrationMicros({ ...base, periodEnd: start, now: start }))
      .toThrow(expect.objectContaining({ code: "BILLING_PERIOD_INVALID" }));
    expect(() => upgradeProrationMicros({ ...base, oldNetMicros: 20_000_001, now: start }))
      .toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_NOT_CENTS" }));
  });
});

// Owner's decision of 16 November 2026: refund = price paid × (plan credit not used ÷ plan credit in force), one rule
// for every country. The function takes no date: the 14-day window is `withdrawalOpenUntil`'s, not the money rule's.
describe("P2 — withdrawal refund (the share of the plan credit not used; days do not count)", () => {
  // Plus on the made-up test credits: 24.20 paid, 6.60 of credit a month.
  const base = { paidMicros: 24_200_000, creditSpentMicros: 0, monthlyCreditMicros: 6_600_000 };

  it("gives the whole price back when nothing was used, whatever the day", () => {
    // The rule takes no date and no period, so the start of the period, day 10 and a moment after the period's end are
    // one and the same call.
    expect(withdrawalRefundMicros(base)).toBe(24_200_000);
    // A caller that still passes them is refused by the compiler, and they change nothing if they get through.
    // @ts-expect-error a date is not an input of the refund rule any more
    expect(withdrawalRefundMicros({ ...base, now: start })).toBe(24_200_000);
    // @ts-expect-error a date is not an input of the refund rule any more
    expect(withdrawalRefundMicros({ ...base, now: plus30(10 * day) })).toBe(24_200_000);
    // @ts-expect-error nor is the period
    expect(withdrawalRefundMicros({ ...base, periodStart: start, periodEnd: end30, now: plus30(45 * day) })).toBe(24_200_000);
  });

  it("gives back the share of the price that matches the credit not used: 30 % used, 70 % back", () => {
    // 1.98 of 6.60 used = 30 %: 24.20 × 0.7 = 16.94.
    expect(withdrawalRefundMicros({ ...base, creditSpentMicros: 1_980_000 })).toBe(16_940_000);
    // Half used: 24.20 × (3.30 ÷ 6.60) = 12.10.
    expect(withdrawalRefundMicros({ ...base, creditSpentMicros: 3_300_000 })).toBe(12_100_000);
  });

  it("floors to whole cents once, in the company's favour by under a cent", () => {
    // One micro of credit used: 24.20 × 6,599,999 ÷ 6,600,000 = 24.199996…, floored to 24.19.
    expect(withdrawalRefundMicros({ ...base, creditSpentMicros: 1 })).toBe(24_190_000);
    // One micro of credit left: 24.20 × 1 ÷ 6,600,000 = 0.0000036…, floored to 0.00.
    expect(withdrawalRefundMicros({ ...base, creditSpentMicros: 6_599_999 })).toBe(0);
    // A third used of 0.02 paid: 0.02 × 2 ÷ 3 = 0.0133…, floored to 0.01.
    expect(withdrawalRefundMicros({ paidMicros: 20_000, creditSpentMicros: 1, monthlyCreditMicros: 3 })).toBe(10_000);
    // Two payments of 0.01, half the credit used: the total 0.02 gives 0.01 back (a floor per payment would give 0).
    expect(withdrawalRefundMicros({ paidMicros: 2 * 10_000, creditSpentMicros: 3_300_000, monthlyCreditMicros: 6_600_000 }))
      .toBe(10_000);
  });

  it("gives nothing back when the whole credit was used, or more than it (a debate that finished past the limit)", () => {
    expect(withdrawalRefundMicros({ ...base, creditSpentMicros: 6_600_000 })).toBe(0);
    expect(withdrawalRefundMicros({ ...base, creditSpentMicros: 7_260_000 })).toBe(0);
    expect(withdrawalRefundMicros({ ...base, paidMicros: 0 })).toBe(0);
  });

  it("gives the whole amount back for a plan with no credit: nothing could be used", () => {
    expect(withdrawalRefundMicros({ ...base, monthlyCreditMicros: 0 })).toBe(24_200_000);
    expect(withdrawalRefundMicros({ ...base, monthlyCreditMicros: 0, creditSpentMicros: 5 })).toBe(24_200_000);
  });

  it("after an upgrade, measures the total paid against the credit in force (the reviewer's worked example)", () => {
    // Final review F1's figures: Romania (21 % VAT), a 30-day period, Plus paid on day 0 (24.20), an upgrade to Max
    // quoted and paid on day 13 ((200 − 20) × 17/30 = 102.00 net, 123.42 with VAT): 147.62 paid in all.
    const paidMicros = 24_200_000 + 123_420_000;
    // A6: the month credit in force after the upgrade, on made-up credits: Plus's 6.60 plus Max's extra 213.40 for the
    // 17 days left.
    const creditAfterUpgrade = upgradeMonthCreditOverrideMicros({
      currentMonthCreditMicros: 6_600_000, oldPlanCreditMicros: 6_600_000, newPlanCreditMicros: 220_000_000,
      periodStart: start, periodEnd: end30, at: plus30(13 * day)
    });
    expect(creditAfterUpgrade).toBe(127526666);
    // Nothing used: both payments whole.
    expect(withdrawalRefundMicros({ paidMicros, creditSpentMicros: 0, monthlyCreditMicros: creditAfterUpgrade }))
      .toBe(147_620_000);
    // 4.40 used: 147.62 × (127.526666 − 4.40) ÷ 127.526666 = 142.5267…, floored to 142.52.
    expect(withdrawalRefundMicros({ paidMicros, creditSpentMicros: 4_400_000, monthlyCreditMicros: creditAfterUpgrade }))
      .toBe(142_520_000);
    // The whole credit used: nothing comes back from either payment.
    expect(withdrawalRefundMicros({ paidMicros, creditSpentMicros: creditAfterUpgrade, monthlyCreditMicros: creditAfterUpgrade }))
      .toBe(0);
  });

  it("is floor(paid × credit left ÷ credit), never negative, never above what was paid, never below the old rule's refund", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 0, max: 250_000_000 }), fc.integer({ min: 1, max: 220_000_000 }),
      fc.integer({ min: 1, max: 40 * day }), fc.integer({ min: 0, max: 45 * day }),
      (cents, spent, credit, spanMs, elapsedMs) => {
        const paidMicros = cents * 10_000;
        const refund = withdrawalRefundMicros({ paidMicros, creditSpentMicros: spent, monthlyCreditMicros: credit });
        const left = BigInt(Math.max(credit - spent, 0));
        const exact = (BigInt(paidMicros) * left) / BigInt(credit);
        expect(refund).toBe(Number(exact - (exact % 10_000n)));
        expect(refund).toBeGreaterThanOrEqual(0);
        expect(refund).toBeLessThanOrEqual(paidMicros);
        expect(refund % 10_000).toBe(0);
        // The rule it replaced took the price minus the LARGER of the part of the period gone by and the part of the
        // credit used, so it paid the smaller of two refunds. The new refund is the credit one alone: never less.
        const timeLeft = BigInt(spanMs - Math.min(elapsedMs, spanMs));
        const forTimeLeft = (BigInt(paidMicros) * timeLeft) / BigInt(spanMs);
        const replaced = forTimeLeft < exact ? forTimeLeft : exact;
        expect(refund).toBeGreaterThanOrEqual(Number(replaced - (replaced % 10_000n)));
      }
    ));
  });

  it("refuses amounts that are not micros, and a paid amount that is not whole cents", () => {
    expect(() => withdrawalRefundMicros({ ...base, paidMicros: 1 }))
      .toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_NOT_CENTS" }));
    expect(() => withdrawalRefundMicros({ ...base, paidMicros: -10_000 }))
      .toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_INVALID" }));
    expect(() => withdrawalRefundMicros({ ...base, creditSpentMicros: -1 }))
      .toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_INVALID" }));
    expect(() => withdrawalRefundMicros({ ...base, creditSpentMicros: 1.5 }))
      .toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_INVALID" }));
    expect(() => withdrawalRefundMicros({ ...base, monthlyCreditMicros: -1 }))
      .toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_INVALID" }));
    expect(() => withdrawalRefundMicros({ ...base, monthlyCreditMicros: Number.NaN }))
      .toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_INVALID" }));
  });
});
