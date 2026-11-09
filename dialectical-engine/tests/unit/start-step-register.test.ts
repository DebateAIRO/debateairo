/**
 * V4 start step, Task 11 (spec 2026-11-03 §2.6, §9): the register switch `debateShapePolicy.startStep` and its widths
 * ("How wide"). Absent (or the row switched off) = R22, byte for byte: the start values never carry it. The owners'
 * widths: Free 3 only (How wide hidden), every paid plan 3, 5 or 7 with 5 by default. Free is capped at 3 in code
 * whatever the row says.
 */
import { describe, expect, it } from "vitest";
import {
  debateShapePolicyRow, debateShapePolicyStartValues, debateShapeStartStepOf, debateShapeStartStepStartValues, parseDebateShapePolicy,
  type DebateShapePolicy
} from "@debateai/register";

const PAID = { options: [3, 5, 7], default: 5 };
const ON: DebateShapePolicy = parseDebateShapePolicy({ ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() });
const withWidths = (plan: string, widths: unknown) => ({ ...debateShapePolicyStartValues(),
  startStep: { widths: { ...debateShapeStartStepStartValues().widths, [plan]: widths } } });
const refusalOf = (value: unknown): string => {
  try {
    parseDebateShapePolicy(value);
  } catch (error) {
    return (error as Error).message;
  }
  return "accepted";
};

describe("the start step's switch and widths", () => {
  it("holds the owners' widths, never in the start values", () => {
    expect(debateShapeStartStepStartValues()).toEqual({ widths: { free: { options: [3], default: 3 }, plus: PAID, pro: PAID, max: PAID, premium: PAID } });
    expect(debateShapePolicyStartValues()).not.toHaveProperty("startStep");
  });

  it("is off without the member, with the row switched off, and without a row", () => {
    expect(debateShapeStartStepOf(debateShapePolicyStartValues(), "plus")).toBeNull();
    expect(debateShapeStartStepOf(parseDebateShapePolicy({ ...ON, enabled: false }), "plus")).toBeNull();
    expect(debateShapeStartStepOf(null, "plus")).toBeNull();
    expect(debateShapeStartStepOf(ON, "plus")).toEqual(PAID);
    expect(Object.isFrozen(debateShapeStartStepOf(ON, "plus"))).toBe(true);
  });

  it("caps Free at 3 whatever the row says", () => {
    expect(debateShapeStartStepOf(parseDebateShapePolicy(withWidths("free", { options: [3, 5, 7], default: 5 })), "free")).toEqual({ options: [3], default: 3 });
    expect(debateShapeStartStepOf(parseDebateShapePolicy(withWidths("free", { options: [5], default: 5 })), "free")).toEqual({ options: [3], default: 3 });
  });

  it("refuses widths that do not rise, more than three, above 7, and a default outside them", () => {
    for (const options of [[5, 3], [1, 3, 5, 7], [3, 8]]) {
      expect(refusalOf(withWidths("plus", { options, default: 3 }))).toBe("DEBATE_SHAPE_POLICY_INVALID:startStep.widths.plus.options");
    }
    expect(refusalOf(withWidths("plus", { options: [3, 5], default: 7 }))).toBe("DEBATE_SHAPE_POLICY_INVALID:startStep.widths.plus.default");
  });

  it("round-trips a row without the member byte for byte, and a row with it keeping its lists", () => {
    const plain = debateShapePolicyRow(debateShapePolicyStartValues(), "fixture:plain");
    expect(plain.valueJsonText).not.toContain("startStep");
    expect(debateShapePolicyRow(parseDebateShapePolicy(JSON.parse(plain.valueJsonText)), "fixture:plain").valueJsonText).toBe(plain.valueJsonText);
    const on = debateShapePolicyRow(ON, "fixture:on");
    const back = parseDebateShapePolicy(JSON.parse(on.valueJsonText));
    expect(back.startStep?.widths.plus.options).toEqual([3, 5, 7]);
    expect(debateShapePolicyRow(back, "fixture:on").valueJsonText).toBe(on.valueJsonText);
  });
});
