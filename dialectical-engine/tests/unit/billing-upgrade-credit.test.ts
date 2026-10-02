import { describe, expect, it } from "vitest";
import { upgradeMonthCreditOverrideMicros } from "@debateai/billing-core";

const START = new Date("2026-10-01T00:00:00.000Z");
const END = new Date("2026-10-31T00:00:00.000Z");
const at = (fraction: number) => new Date(START.getTime() + (END.getTime() - START.getTime()) * fraction);
const plusToPro = {
  currentMonthCreditMicros: 5_000_000, oldPlanCreditMicros: 5_000_000, newPlanCreditMicros: 20_000_000,
  periodStart: START, periodEnd: END
};

describe("P12c A6: the month credit after an upgrade", () => {
  it("adds the new plan's extra credit for the part of the period still to run", () => {
    expect(upgradeMonthCreditOverrideMicros({ ...plusToPro, at: at(0.5) })).toBe(12_500_000);
    expect(upgradeMonthCreditOverrideMicros({ ...plusToPro, at: START })).toBe(20_000_000);
    expect(upgradeMonthCreditOverrideMicros({ ...plusToPro, at: END })).toBe(5_000_000);
    expect(upgradeMonthCreditOverrideMicros({ ...plusToPro, at: new Date(END.getTime() + 1) })).toBe(5_000_000);
    expect(upgradeMonthCreditOverrideMicros({ ...plusToPro, at: new Date(START.getTime() - 1) })).toBe(20_000_000);
  });

  it("builds on an earlier upgrade's credit in the same period", () => {
    expect(upgradeMonthCreditOverrideMicros({
      currentMonthCreditMicros: 12_500_000, oldPlanCreditMicros: 20_000_000, newPlanCreditMicros: 150_000_000,
      periodStart: START, periodEnd: END, at: at(0.75)
    })).toBe(45_000_000);
  });

  it("floors to whole micros and never lowers the credit", () => {
    const tiny = { periodStart: new Date(0), periodEnd: new Date(3_000), at: new Date(2_000) };
    expect(upgradeMonthCreditOverrideMicros({ ...tiny, currentMonthCreditMicros: 7, oldPlanCreditMicros: 0, newPlanCreditMicros: 1 }))
      .toBe(7);
    expect(upgradeMonthCreditOverrideMicros({ ...tiny, currentMonthCreditMicros: 7, oldPlanCreditMicros: 5, newPlanCreditMicros: 4 }))
      .toBe(7);
  });

  it("refuses an amount that is not whole micros and a period with no length", () => {
    expect(() => upgradeMonthCreditOverrideMicros({ ...plusToPro, currentMonthCreditMicros: 1.5, at: START }))
      .toThrow(expect.objectContaining({ code: "BILLING_CREDIT_INVALID" }));
    expect(() => upgradeMonthCreditOverrideMicros({ ...plusToPro, periodStart: END, at: START }))
      .toThrow(expect.objectContaining({ code: "BILLING_PERIOD_INVALID" }));
  });
});
