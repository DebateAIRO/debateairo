/**
 * V4 start step, Task 41 (spec 2026-11-03 §8 "Before upload"): one debate must fit each spending gate's daily pot. The
 * pure half of the guard: which choices are checked (every switched-on plan at its widest How wide, both question
 * depths and one dig), and what comes out of weighing each case's needs against each gate's `/remaining` answer with
 * its pot: a refusal code when one debate does not fit the pot, when the gate reports no pot or did not answer; a note
 * (never a failure) when the pot fits but today's money is already spent. Task 42 wires it into check-version. Every pot
 * and price here is made up.
 */
import { describe, expect, it } from "vitest";
import type { PreviewGateRemaining } from "@debateai/providers";
import { debateShapePolicyStartValues, debateShapeStartStepStartValues, type DebateShapePolicy } from "@debateai/register";
import { previewGateEstimateNanoUsd, type PreviewGateNeed } from "../../apps/api/src/preview-budget-estimate.js";
import {
  GATE_POT_CODES, checkGatePotsFitOneDebate, gatePotCases, gatePotChoice, type GatePotCase, type GatePotCaseNeeds
} from "../../apps/api/src/settings-check.js";

const ON: DebateShapePolicy = Object.freeze({ ...debateShapePolicyStartValues(), startStep: debateShapeStartStepStartValues() });
const OFF: DebateShapePolicy = debateShapePolicyStartValues();
// Made-up pots: 0.05, 2.5 and 7.25 dollars, as exact nano-USD.
const POT_SMALL = 50_000_000n;
const POT_MID = 2_500_000_000n;
const POT_BIG = 7_250_000_000n;
const CODE = /^GATE_POT_[A-Z_]+:(deepinfra|anthropic|perplexity)(:[a-z0-9]+)*$/u;

/** A gate's answer with the pot asked: today's money left starts at the whole pot; each slot holds a made-up 0.1. */
const withPot = (pot: bigint, change: Partial<PreviewGateRemaining> = {}): PreviewGateRemaining => Object.freeze({
  state: "active", windowOpen: true, remainingNanoUsd: pot, remainingCalls: 600, maxConcurrentCalls: 2,
  largestReservationNanoUsd: 100_000_000n, enabledModels: ["made-up-model"], dailyPotNanoUsd: pot, ...change });
/** The same answer from a gate whose code does not report the pot. */
const noPot = (): PreviewGateRemaining => {
  const { dailyPotNanoUsd: _pot, ...rest } = withPot(POT_BIG);
  return Object.freeze(rest);
};
const need = (gate: PreviewGateNeed["gate"], callsNanoUsd: bigint): PreviewGateNeed => Object.freeze({
  gate, modelIds: Object.freeze(["made-up-model"]), expectedCalls: 10, callsWithMargin: 12, callsNanoUsd });
const PLUS_D2: GatePotCase = Object.freeze({ plan: "plus", kind: "QUESTION", depth: 2, paths: 7, web: true });
const FREE_D1: GatePotCase = Object.freeze({ plan: "free", kind: "QUESTION", depth: 1, paths: 3, web: false });
const caseOf = (choice: GatePotCase, needs: readonly PreviewGateNeed[], searchNanoUsd: bigint | null = null): GatePotCaseNeeds =>
  Object.freeze({ choice, needs: Object.freeze([...needs]), searchNanoUsd });
const PLANS = ["pro", "max", "premium"] as const;

describe("the codes", () => {
  it("are the four the release guide's hints name", () => {
    expect(GATE_POT_CODES).toEqual({ BELOW: "GATE_POT_BELOW_ONE_DEBATE", SPENT_TODAY: "GATE_POT_SPENT_TODAY",
      UNREPORTED: "GATE_POT_UNREPORTED", UNANSWERED: "GATE_POT_UNANSWERED" });
    expect(Object.isFrozen(GATE_POT_CODES)).toBe(true);
  });
});

describe("the choices the guard checks", () => {
  it("checks every switched-on plan at its widest How wide: both question depths and one dig, web on paid plans", () => {
    const cases = gatePotCases(ON, { searchGate: true });
    expect(cases).toHaveLength(15);
    expect(cases.map(gatePotChoice).slice(0, 6)).toEqual(["free:question:d1:p3", "free:question:d2:p3", "free:dig:d1:p3",
      "plus:question:d1:p7:web", "plus:question:d2:p7:web", "plus:dig:d2:p7:web"]);
    expect(cases.map(gatePotChoice).slice(6)).toEqual(PLANS.flatMap((plan) =>
      [`${plan}:question:d1:p7:web`, `${plan}:question:d2:p7:web`, `${plan}:dig:d2:p7:web`]));
    expect(cases[0]).toEqual({ plan: "free", kind: "QUESTION", depth: 1, paths: 3, web: false });
    expect(cases[5]).toEqual({ plan: "plus", kind: "DIG", depth: 2, paths: 7, web: true });
  });

  it("has no web search without a search gate", () => {
    const cases = gatePotCases(ON, { searchGate: false });
    expect(cases).toHaveLength(15);
    expect(cases.every((c) => !c.web)).toBe(true);
    expect(cases.map(gatePotChoice).filter((choice) => choice.includes("web"))).toEqual([]);
    expect(gatePotChoice(cases[4]!)).toBe("plus:question:d2:p7");
  });

  it("checks nothing without the switch, or on a row switched off", () => {
    expect(gatePotCases(OFF, { searchGate: true })).toEqual([]);
    expect(gatePotCases({ ...ON, enabled: false }, { searchGate: true })).toEqual([]);
  });

  it("checks Free at 3 paths at most whatever its row says, and a paid plan at the widest of its own choices", () => {
    const widths = ON.startStep!.widths;
    const policy: DebateShapePolicy = { ...ON, startStep: { widths: { ...widths,
      free: { options: [3, 5, 7], default: 5 }, plus: { options: [3, 5], default: 3 } } } };
    const choices = gatePotCases(policy, { searchGate: true }).map(gatePotChoice);
    expect(choices.slice(0, 6)).toEqual(["free:question:d1:p3", "free:question:d2:p3", "free:dig:d1:p3",
      "plus:question:d1:p5:web", "plus:question:d2:p5:web", "plus:dig:d2:p5:web"]);
  });
});

describe("one debate against each gate's pot", () => {
  it("raises nothing when one debate fits every pot and today's money", () => {
    expect(checkGatePotsFitOneDebate({
      cases: [caseOf(PLUS_D2, [need("deepinfra", 1_000_000_000n), need("anthropic", 2_000_000_000n)])],
      remaining: { deepinfra: withPot(POT_BIG), anthropic: withPot(POT_MID) }
    })).toEqual({ refusals: [], warnings: [] });
  });

  it("weighs one debate as the ask's own estimate: the calls plus what the gate holds for calls in flight", () => {
    // 2.3 of calls + 2 slots x 0.1 = 2.5: exactly the pot, so it fits; 2.4 of calls alone fits, with the holds it does not.
    const at = (callsNanoUsd: bigint, change: Partial<PreviewGateRemaining> = {}) => checkGatePotsFitOneDebate({
      cases: [caseOf(PLUS_D2, [need("anthropic", callsNanoUsd)])], remaining: { anthropic: withPot(POT_MID, change) } });
    expect(previewGateEstimateNanoUsd(need("anthropic", 2_300_000_000n), withPot(POT_MID))).toBe(POT_MID);
    expect(at(2_300_000_000n)).toEqual({ refusals: [], warnings: [] });
    expect(at(2_400_000_000n)).toEqual({ refusals: ["GATE_POT_BELOW_ONE_DEBATE:anthropic:plus:question:d2:p7:web"], warnings: [] });
    // A final-writer slot holds its own worst case (made-up 0.5): 2.0 + 0.1 + 0.5 = 2.6 is above the pot.
    expect(at(2_000_000_000n)).toEqual({ refusals: [], warnings: [] });
    expect(at(2_000_000_000n, { largestFinalWriterReservationNanoUsd: 500_000_000n, finalWriterMaxInFlight: 1 }))
      .toEqual({ refusals: ["GATE_POT_BELOW_ONE_DEBATE:anthropic:plus:question:d2:p7:web"], warnings: [] });
  });

  it("names each choice that does not fit, on its own gate only", () => {
    const FREE_DIG: GatePotCase = Object.freeze({ plan: "free", kind: "DIG", depth: 1, paths: 3, web: false });
    expect(checkGatePotsFitOneDebate({
      cases: [caseOf(FREE_D1, [need("deepinfra", 3_000_000_000n)]), caseOf(FREE_DIG, [need("deepinfra", 2_000_000_000n)]),
        caseOf(PLUS_D2, [need("deepinfra", 1_000_000_000n), need("anthropic", 1_000_000_000n)])],
      remaining: { deepinfra: withPot(POT_MID), anthropic: withPot(POT_MID) }
    })).toEqual({ refusals: ["GATE_POT_BELOW_ONE_DEBATE:deepinfra:free:question:d1:p3"], warnings: [] });
  });

  it("notes once per gate, never as a failure, when the pot fits but today's money is already spent", () => {
    const FREE_D2: GatePotCase = Object.freeze({ ...FREE_D1, depth: 2 });
    expect(checkGatePotsFitOneDebate({
      cases: [caseOf(FREE_D1, [need("deepinfra", 1_000_000_000n)]), caseOf(FREE_D2, [need("deepinfra", 1_500_000_000n)])],
      remaining: { deepinfra: withPot(POT_BIG, { remainingNanoUsd: POT_SMALL }) }
    })).toEqual({ refusals: [], warnings: ["GATE_POT_SPENT_TODAY:deepinfra"] });
  });

  it("refuses a gate that reports no pot, and one that did not answer or was never asked", () => {
    const cases = [caseOf(PLUS_D2, [need("deepinfra", 1_000_000_000n), need("anthropic", 1_000_000_000n)])];
    expect(checkGatePotsFitOneDebate({ cases, remaining: { deepinfra: null, anthropic: noPot() } }))
      .toEqual({ refusals: ["GATE_POT_UNANSWERED:deepinfra", "GATE_POT_UNREPORTED:anthropic"], warnings: [] });
    expect(checkGatePotsFitOneDebate({ cases, remaining: {} }))
      .toEqual({ refusals: ["GATE_POT_UNANSWERED:anthropic", "GATE_POT_UNANSWERED:deepinfra"], warnings: [] });
  });

  it("never names a gate no case needs", () => {
    expect(checkGatePotsFitOneDebate({
      cases: [caseOf(FREE_D1, [need("deepinfra", 1_000_000_000n)])],
      remaining: { deepinfra: withPot(POT_BIG), anthropic: null, perplexity: noPot() }
    })).toEqual({ refusals: [], warnings: [] });
  });

  it("weighs the search gate on the searches' money, when the case searches", () => {
    // Made-up searches: 56 at 0.001 = 0.056, above the 0.05 pot; one slot holding nothing.
    const search = withPot(POT_SMALL, { maxConcurrentCalls: 1, largestReservationNanoUsd: 0n });
    const models = [need("deepinfra", 1_000_000_000n), need("anthropic", 1_000_000_000n)];
    const fine = { deepinfra: withPot(POT_BIG), anthropic: withPot(POT_BIG) };
    expect(checkGatePotsFitOneDebate({ cases: [caseOf(PLUS_D2, models, 56_000_000n)], remaining: { ...fine, perplexity: search } }))
      .toEqual({ refusals: ["GATE_POT_BELOW_ONE_DEBATE:perplexity:plus:question:d2:p7:web"], warnings: [] });
    expect(checkGatePotsFitOneDebate({ cases: [caseOf(PLUS_D2, models, 40_000_000n)], remaining: { ...fine, perplexity: search } }))
      .toEqual({ refusals: [], warnings: [] });
    expect(checkGatePotsFitOneDebate({ cases: [caseOf(PLUS_D2, models, 40_000_000n)], remaining: fine }))
      .toEqual({ refusals: ["GATE_POT_UNANSWERED:perplexity"], warnings: [] });
    expect(checkGatePotsFitOneDebate({ cases: [caseOf(PLUS_D2, models, null)], remaining: { ...fine, perplexity: null } }))
      .toEqual({ refusals: [], warnings: [] });
  });

  it("lists every code sorted and once, each a gate and a choice of lowercase parts", () => {
    const cases = gatePotCases(ON, { searchGate: true }).map((choice) => caseOf(choice,
      [need("deepinfra", 3_000_000_000n), need("anthropic", 3_000_000_000n)], choice.web ? 56_000_000n : null));
    const findings = checkGatePotsFitOneDebate({ cases: [...cases, ...cases],
      remaining: { deepinfra: withPot(POT_MID), anthropic: withPot(POT_MID), perplexity: withPot(POT_SMALL) } });
    // 15 choices on each model gate, 12 searching choices on the search gate.
    expect(findings.refusals).toHaveLength(15 + 15 + 12);
    expect(findings.refusals).toEqual([...new Set(findings.refusals)].sort());
    expect(findings.warnings).toEqual([]);
    for (const code of findings.refusals) expect(code).toMatch(CODE);
    const all = checkGatePotsFitOneDebate({ cases, remaining: { deepinfra: null, anthropic: noPot(),
      perplexity: withPot(POT_BIG, { remainingNanoUsd: 0n }) } });
    for (const code of [...all.refusals, ...all.warnings]) expect(code).toMatch(CODE);
    expect(all).toEqual({ refusals: ["GATE_POT_UNANSWERED:deepinfra", "GATE_POT_UNREPORTED:anthropic"],
      warnings: ["GATE_POT_SPENT_TODAY:perplexity"] });
  });
});
