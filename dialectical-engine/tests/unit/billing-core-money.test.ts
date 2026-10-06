import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decimalToMicros,
  microsToDecimal,
  upgradeMonthCreditOverrideMicros,
  upgradeProrationMicros,
  withdrawalRefundMicros,
  withdrawalRefundPerPaymentMicros
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

describe("P2 — withdrawal refund (the larger of days used or credit used)", () => {
  const base = {
    paidTotalMicros: 24_200_000, periodStart: start, periodEnd: end30,
    creditSpentMicros: 0, monthlyCreditMicros: 5_000_000
  };
  it("refunds the unused share of the period to the millisecond, floored to cents (a started day is NOT a used day)", () => {
    expect(withdrawalRefundMicros({ ...base, now: start })).toBe(24_200_000);
    expect(withdrawalRefundMicros({ ...base, now: plus30(1) })).toBe(24_190_000);
    expect(withdrawalRefundMicros({ ...base, now: plus30(day) })).toBe(23_390_000);
    expect(withdrawalRefundMicros({ ...base, now: plus30(day + 1) })).toBe(23_390_000);
    expect(withdrawalRefundMicros({ ...base, now: plus30(10 * day) })).toBe(16_130_000);
  });
  it("uses the credit share when it is larger", () => {
    expect(withdrawalRefundMicros({ ...base, now: plus30(1), creditSpentMicros: 2_500_000 })).toBe(12_100_000);
    expect(withdrawalRefundMicros({ ...base, now: plus30(1), creditSpentMicros: 4_999_999 })).toBe(0);
  });
  it("never goes below zero: leeway spending, the period's end, or later", () => {
    expect(withdrawalRefundMicros({ ...base, now: plus30(1), creditSpentMicros: 5_500_000 })).toBe(0);
    expect(withdrawalRefundMicros({ ...base, now: end30 })).toBe(0);
    expect(withdrawalRefundMicros({ ...base, now: plus30(45 * day) })).toBe(0);
  });
  it("uses days alone when the plan has no credit, and floors to cents", () => {
    expect(withdrawalRefundMicros({ ...base, monthlyCreditMicros: 0, creditSpentMicros: 0, now: plus30(1) }))
      .toBe(24_190_000);
    expect(withdrawalRefundMicros({ ...base, periodEnd: end31, now: plus30(day) })).toBe(23_410_000);
  });
  it("refuses amounts that are not micros of cents", () => {
    expect(() => withdrawalRefundMicros({ ...base, paidTotalMicros: 1, now: start }))
      .toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_NOT_CENTS" }));
    expect(() => withdrawalRefundMicros({ ...base, creditSpentMicros: -1, now: start }))
      .toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_INVALID" }));
  });
});

describe("W6 (P2-I8) — withdrawal refund per paid transaction, each over the days it paid for", () => {
  // The money-data reviewer's worked example (final review F1): Romania (21 % VAT), a 30-day period, Plus paid on
  // day 0 (24.20), an upgrade to Max quoted and paid on day 13 ((200 − 20) × 17/30 = 102.00 net, 123.42 with VAT),
  // which covers day 13 to the period end, and a withdrawal on day 13.5.
  const plus = { paidMicros: 24_200_000, coverageStart: start, coverageEnd: end30 };
  const max = { paidMicros: 123_420_000, coverageStart: plus30(13 * day), coverageEnd: end30 };
  const withdrewAt = plus30(13.5 * day);
  // A6: the month credit in force after the upgrade, Plus's 5.00 plus Max's extra 145.00 for the 17 days left.
  const creditAfterUpgrade = upgradeMonthCreditOverrideMicros({
    currentMonthCreditMicros: 5_000_000, oldPlanCreditMicros: 5_000_000, newPlanCreditMicros: 150_000_000,
    periodStart: start, periodEnd: end30, at: plus30(13 * day)
  });

  it("refunds each payment the share of its own days still unused: 13.31 of Plus and 119.79 of Max", () => {
    expect(creditAfterUpgrade).toBe(87_166_666);
    // Plus keeps 13.5 of 30 days (10.89); Max keeps half a day of its 17 (123.42 × 0.5/17 ≈ 3.63).
    expect(withdrawalRefundPerPaymentMicros({
      payments: [plus, max], now: withdrewAt, creditSpentMicros: 0, monthlyCreditMicros: creditAfterUpgrade
    })).toBe(133_100_000);
    // The old reading charged the upgrade payment for the 13 days before it was bought: 81.19 of 147.62.
    expect(withdrawalRefundMicros({
      paidTotalMicros: 147_620_000, periodStart: start, periodEnd: end30, now: withdrewAt,
      creditSpentMicros: 0, monthlyCreditMicros: creditAfterUpgrade
    })).toBe(81_190_000);
  });

  it("takes the larger of the days share and the credit share for each payment on its own (3.00 of credit spent)", () => {
    // Plus: the days share 13.5/30 is larger than the credit share 3.00/87.17, so 13.31 back. Max: half a day of 17
    // (2.94 %) is smaller than the credit share (3.44 %), so 123.42 × (1 − 3.00/87.17) = 119.17 back. 132.48 in all.
    expect(withdrawalRefundPerPaymentMicros({
      payments: [plus, max], now: withdrewAt, creditSpentMicros: 3_000_000, monthlyCreditMicros: creditAfterUpgrade
    })).toBe(132_480_000);
    // The whole credit spent: nothing comes back from either payment.
    expect(withdrawalRefundPerPaymentMicros({
      payments: [plus, max], now: withdrewAt, creditSpentMicros: creditAfterUpgrade, monthlyCreditMicros: creditAfterUpgrade
    })).toBe(0);
  });

  it("sums the exact shares and floors to cents once, never each payment on its own", () => {
    // Two payments of 0.01, each half used: 0.005 + 0.005 = 0.01 back (a floor per payment would pay back nothing).
    const half = { paidMicros: 10_000, coverageStart: start, coverageEnd: plus30(2) };
    expect(withdrawalRefundPerPaymentMicros({
      payments: [half, half], now: plus30(1), creditSpentMicros: 0, monthlyCreditMicros: 0
    })).toBe(10_000);
    expect(withdrawalRefundPerPaymentMicros({ payments: [], now: plus30(1), creditSpentMicros: 0, monthlyCreditMicros: 0 }))
      .toBe(0);
  });

  it("clamps each payment's days to its own coverage: none used before it starts, all used after it ends", () => {
    const later = { paidMicros: 10_000_000, coverageStart: plus30(20 * day), coverageEnd: end30 };
    expect(withdrawalRefundPerPaymentMicros({
      payments: [later], now: plus30(day), creditSpentMicros: 0, monthlyCreditMicros: 0
    })).toBe(10_000_000);
    expect(withdrawalRefundPerPaymentMicros({
      payments: [plus, later], now: plus30(40 * day), creditSpentMicros: 0, monthlyCreditMicros: 0
    })).toBe(0);
  });

  it("is today's single-payment result when there was no upgrade", () => {
    fc.assert(fc.property(
      fc.integer({ min: 0, max: 100_000 }), fc.integer({ min: 1, max: 40 * day }), fc.integer({ min: -day, max: 45 * day }),
      fc.integer({ min: 0, max: 200_000_000 }), fc.integer({ min: 0, max: 150_000_000 }),
      (cents, spanMs, offsetMs, spent, credit) => {
        const paidMicros = cents * 10_000;
        const periodEnd = plus30(spanMs);
        const now = plus30(offsetMs);
        expect(withdrawalRefundPerPaymentMicros({
          payments: [{ paidMicros, coverageStart: start, coverageEnd: periodEnd }], now,
          creditSpentMicros: spent, monthlyCreditMicros: credit
        })).toBe(withdrawalRefundMicros({
          paidTotalMicros: paidMicros, periodStart: start, periodEnd, now, creditSpentMicros: spent, monthlyCreditMicros: credit
        }));
      }
    ));
  });

  it("refuses an amount that is not cents and a coverage that is not a period", () => {
    expect(() => withdrawalRefundPerPaymentMicros({
      payments: [{ ...plus, paidMicros: 1 }], now: withdrewAt, creditSpentMicros: 0, monthlyCreditMicros: 0
    })).toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_NOT_CENTS" }));
    expect(() => withdrawalRefundPerPaymentMicros({
      payments: [{ ...plus, coverageEnd: start }], now: withdrewAt, creditSpentMicros: 0, monthlyCreditMicros: 0
    })).toThrow(expect.objectContaining({ code: "BILLING_PERIOD_INVALID" }));
    expect(() => withdrawalRefundPerPaymentMicros({
      payments: [plus], now: withdrewAt, creditSpentMicros: -1, monthlyCreditMicros: 0
    })).toThrow(expect.objectContaining({ code: "BILLING_AMOUNT_INVALID" }));
  });
});
