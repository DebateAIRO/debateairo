import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  decimalToMicros,
  microsToDecimal,
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
