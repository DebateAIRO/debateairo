/**
 * Paid plans S2 — the picker compares like with like: the arguing part of the
 * estimate with the body ceiling, the whole run with the serve ceiling; an
 * estimate it cannot make is the run maximum against a person's room; and a
 * plan's strength cap is read by the plan's tier.
 */
import { describe, expect, it } from "vitest";
import {
  costPhaseOfRole,
  estimateRunCostByPhase,
  fitsMoneyLimits,
  pickRoleAssignment,
  type PickerInput,
  type PickerMoneyLimits
} from "@debateai/scorecard";
import { DEBATE_ROLES, type ModelStrength } from "@debateai/kernel";
import {
  assignedOutcome,
  roleNumbers,
  targetFor,
  testCandidate,
  testEntry,
  testPickerInput,
  testPrice,
  testScorecard
} from "../support/scorecardFixtures.js";

const best = testCandidate("best", "OpenAI");
const mid = testCandidate("mid", "Anthropic");
const cheap = testCandidate("cheap", "Google");
const entries = [testEntry("best", 95, 1), testEntry("mid", 92, 1), testEntry("cheap", 70, 1)];
const reachable = [best, mid, cheap].map((candidate) => targetFor(candidate));
// One call of each route costs exactly: best 400, mid 150, cheap 30 micros.
const prices = new Map([["provider:best", testPrice(400)], ["provider:mid", testPrice(150)], ["provider:cheap", testPrice(30)]]);
const judgeAndWriter = testScorecard([best, mid, cheap], { JUDGE: entries, ANSWER_WRITER: entries }, { diversityShare: 0 });
const writerOnly = testScorecard([best, mid, cheap], { ANSWER_WRITER: entries }, { diversityShare: 0 });

// Ten judge calls (arguing) and ten answer-writer calls:
//   BEST 4000 + 4000 = 8000 (arguing 4000) · BALANCED 1500 + 1500 = 3000 (arguing 1500) · ECONOMY 300 + 300 = 600 (arguing 300)
function hosted(overrides: Partial<PickerInput> = {}, strength: ModelStrength = "BEST"): PickerInput {
  return testPickerInput({
    scorecard: judgeAndWriter, reachable, mode: "HOSTED", strength, prices,
    seatDemand: roleNumbers({ JUDGE: 1, ANSWER_WRITER: 1 }),
    expectedCallsByRole: roleNumbers({ JUDGE: 10, ANSWER_WRITER: 10 }),
    ...overrides
  });
}

const limits = (bodyMicros: number, serveMicros: number, personRoomMicros: number | null = null, unknownEstimateMicros = 1_000_000): PickerMoneyLimits =>
  Object.freeze({ bodyMicros, serveMicros, personRoomMicros, unknownEstimateMicros });

describe("costPhaseOfRole", () => {
  it("holds the five arguing roles to the body ceiling and the two answer roles to the serve ceiling", () => {
    expect(DEBATE_ROLES.map((role) => [role, costPhaseOfRole(role)])).toEqual([
      ["POSITION", "BODY"], ["SUPPORT_ATTACK", "BODY"], ["CROSS_EXCHANGE", "BODY"], ["JUDGE", "BODY"],
      ["REVIEWER", "BODY"], ["ANSWER_WRITER", "ANSWER"], ["ANSWER_CHECKER", "ANSWER"]
    ]);
  });
});

describe("estimateRunCostByPhase", () => {
  it("splits a HOSTED estimate into its arguing and answer parts", () => {
    const outcome = assignedOutcome(pickRoleAssignment(hosted()));
    const input = { assignment: outcome.assignment, expectedCallsByRole: roleNumbers({ JUDGE: 10, ANSWER_WRITER: 10 }), scorecard: judgeAndWriter, prices, mode: "HOSTED" as const };
    expect(estimateRunCostByPhase(input)).toEqual({ bodyMoneyMicros: 4000, answerMoneyMicros: 4000 });
    expect(outcome.estimate.moneyMicros).toBe(8000);
  });

  it("has no money parts in LOCAL mode", () => {
    const outcome = assignedOutcome(pickRoleAssignment(hosted({ mode: "LOCAL" })));
    expect(estimateRunCostByPhase({
      assignment: outcome.assignment, expectedCallsByRole: roleNumbers({ JUDGE: 10, ANSWER_WRITER: 10 }),
      scorecard: judgeAndWriter, prices, mode: "LOCAL"
    })).toEqual({ bodyMoneyMicros: null, answerMoneyMicros: null });
  });
});

describe("fitsMoneyLimits", () => {
  const known = Object.freeze({ mode: "HOSTED" as const, moneyMicros: 3000, seconds: 20 });
  const phases = Object.freeze({ bodyMoneyMicros: 1500, answerMoneyMicros: 1500 });
  it.each([
    { body: 1500, serve: 3000, fits: true },
    { body: 1499, serve: 3000, fits: false },
    { body: 1500, serve: 2999, fits: false }
  ])("arguing ≤ $body and whole ≤ $serve: $fits", ({ body, serve, fits }) => {
    expect(fitsMoneyLimits(known, phases, limits(body, serve))).toBe(fits);
  });

  it("lets an unknown estimate through the site alone, and weighs it as the run maximum against a person's room", () => {
    const unknown = Object.freeze({ mode: "HOSTED" as const, moneyMicros: null, seconds: null });
    const none = Object.freeze({ bodyMoneyMicros: null, answerMoneyMicros: null });
    expect(fitsMoneyLimits(unknown, none, limits(1, 1, null, 9_000))).toBe(true);
    expect(fitsMoneyLimits(unknown, none, limits(1, 1, 8_999, 9_000))).toBe(false);
    expect(fitsMoneyLimits(unknown, none, limits(1, 1, 9_000, 9_000))).toBe(true);
  });
});

describe("pickRoleAssignment — the phase-split limits (moneyLimits)", () => {
  it("steps down when the arguing part is over the body ceiling although the whole run fits", () => {
    // The whole-total rule of the per-run ceiling alone keeps BEST at 8000 …
    expect(assignedOutcome(pickRoleAssignment(hosted({ perRunCeilingMicros: 8000 }))).appliedStrength).toBe("BEST");
    // … the phase split does not: arguing 4000 > 3200.
    const outcome = assignedOutcome(pickRoleAssignment(hosted({ perRunCeilingMicros: 8000, moneyLimits: limits(3200, 8000) })));
    expect(outcome.appliedStrength).toBe("BALANCED");
    expect(outcome.steppedDown).toBe(true);
    expect(outcome.notes).toContain("STEPPED_DOWN:BEST->BALANCED");
  });

  it("steps down when the whole run is over the serve ceiling although the arguing fits", () => {
    const outcome = assignedOutcome(pickRoleAssignment(hosted({ moneyLimits: limits(10_000, 2000) })));
    expect(outcome.appliedStrength).toBe("ECONOMY");
    expect(outcome.estimate.moneyMicros).toBe(600);
  });

  it("refuses BUDGET_TOO_SMALL when even ECONOMY is over either ceiling", () => {
    expect(pickRoleAssignment(hosted({ moneyLimits: limits(299, 10_000) }))).toMatchObject({ state: "REFUSED", reason: "BUDGET_TOO_SMALL" });
    expect(pickRoleAssignment(hosted({ moneyLimits: limits(10_000, 599) }))).toMatchObject({ state: "REFUSED", reason: "BUDGET_TOO_SMALL" });
  });

  it("weighs a seat without a scorecard entry as the run maximum against a person's room — never as 'fits'", () => {
    const noJudgeEntry = (moneyLimits: PickerMoneyLimits) => pickRoleAssignment(testPickerInput({
      scorecard: writerOnly, reachable, mode: "HOSTED", strength: "BEST", prices, moneyLimits,
      seatDemand: roleNumbers({ JUDGE: 1, ANSWER_WRITER: 1 }),
      expectedCallsByRole: roleNumbers({ JUDGE: 10, ANSWER_WRITER: 10 })
    }));
    const siteOnly = assignedOutcome(noJudgeEntry(limits(10, 10, null, 6_000)));
    expect(siteOnly.appliedStrength).toBe("BEST");
    expect(siteOnly.notes).toContain("ESTIMATE_UNAVAILABLE");
    expect(noJudgeEntry(limits(10_000, 10_000, 5_999, 6_000))).toMatchObject({ state: "REFUSED", reason: "BUDGET_TOO_SMALL" });
    expect(assignedOutcome(noJudgeEntry(limits(10_000, 10_000, 6_000, 6_000))).appliedStrength).toBe("BEST");
  });

  it("gives moneyLimits precedence over the whole-total ceiling", () => {
    expect(assignedOutcome(pickRoleAssignment(hosted({ perRunCeilingMicros: 1, moneyLimits: limits(10_000, 10_000) }))).appliedStrength).toBe("BEST");
  });

  it("ignores every money limit in LOCAL mode", () => {
    expect(assignedOutcome(pickRoleAssignment(hosted({ mode: "LOCAL", moneyLimits: limits(0, 0, 0, 1) }))).appliedStrength).toBe("BEST");
  });
});

describe("pickRoleAssignment — plan caps are read by the plan's tier", () => {
  const capped = testScorecard([best, mid, cheap], { JUDGE: entries, ANSWER_WRITER: entries }, { diversityShare: 0, planStrengthCaps: { free: "ECONOMY" } });
  it("caps the free tier at ECONOMY without calling it a step-down", () => {
    const outcome = assignedOutcome(pickRoleAssignment(hosted({ scorecard: capped, planTier: "free" })));
    expect(outcome.appliedStrength).toBe("ECONOMY");
    expect(outcome.steppedDown).toBe(false);
    expect(outcome.notes).toContain("PLAN_CAP:free:BEST->ECONOMY");
  });

  it("leaves the premium tier (every paid plan) at BEST", () => {
    expect(assignedOutcome(pickRoleAssignment(hosted({ scorecard: capped, planTier: "premium" }))).appliedStrength).toBe("BEST");
  });
});
