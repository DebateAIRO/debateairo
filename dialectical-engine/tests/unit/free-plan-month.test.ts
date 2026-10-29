import { describe, expect, it } from "vitest";
import { DEBATE_ROLES, type DebateRole } from "@debateai/kernel";
import { PREVIEW_GLM_GENERATION_TOKEN_FLOOR, previewModelRow } from "@debateai/providers";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, computeStructuralCeilingBasis, debateShapePolicyStartValues, debateShapeSiteCounts, engineSettingsOf,
  engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, normaliseDepthParamsForShape, parseDebateShapePolicy, resolveDebateShape,
  resolveLengthGuidance, type DebateShapePolicy
} from "@debateai/register";
import { expectedCallsByRoleFromBasis } from "../../apps/api/src/ask-model-picker.js";
import {
  PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, calibratedEstimatePricer, previewCallNanoUsd
} from "../../apps/api/src/preview-budget-estimate.js";

/**
 * FREE PLAN, R22 — WHAT ONE FREE MONTH COSTS (owner rulings 2026-10-29: "#1" and "Free plan shape"). No AI is called and
 * nothing is spent: every number comes from the engine's own functions.
 *
 * The owner's Free month: question 1 at depth 1 + 1 dig, question 2 at depth 1 + 1 dig, each with the final written
 * answer (and a PDF, which is page work and costs no AI). A V4 dig is a follow-up question asked as a new debate
 * (apps/ui/lib/v4/askText.ts), so the month is FOUR depth-1 Free debates. Free's allowance is 20 cents a month
 * (billingPlans FREE `monthly_credit_micros` 200,000).
 *
 * How one debate is counted (assumptions, all the engine's own):
 *  - SHAPE: the debate-shape row's Free start values (3 map AIs, 3 answers, 2 graders, 3 points per answer, 1 gap round,
 *    2 close-call extra graders) on the preview's five Free makers, depth 1, engine 2 (3 comparing judges, 2
 *    investigations at their cap, 1 answer check), so the same receipt admission mints (`computeStructuralCeilingBasis`);
 *  - CALLS: one call per site (`expectedCallsByRoleFromBasis`, the picker's and the estimate's count). "Ceiling" counts
 *    the close-call extra graders on EVERY node, as the receipt does; "expected" counts them on none (they are asked
 *    only for a close call). The answer is one writer call and one checker call (one round; the receipt allows 3), and
 *    the story one storyteller call and one story-checker call (one round);
 *  - TOKENS: the engine's calibrated estimate at its starting point (`calibratedEstimatePricer([])`: 4,000 tokens in and
 *    1,200 out per call, at each AI's list price), the figure the estimate uses before it has measured 20 calls of a kind.
 *    Cross-check: the R21 practice debate (depth 1, five AIs, engine 1) made 218 calls for $0.297 by the gates' count,
 *    0.136 cents a call; the calibrated start averages 0.148 cents a call over the Free line-up;
 *  - WHO: every arguing call shared evenly by the five Free AIs (the seat book without a scorecard seats every debater
 *    in every role); the answer and the story written by Haiku and checked by DeepSeek (the owner's final-step design:
 *    Haiku writes, a cheap checker until Luna is reachable).
 *  - UPPER BOUND: the same calls at the realistic worst case (64 KiB in, 8,192 out: the preview estimate's active mode).
 */
const TERMS = Object.freeze({ maxDepth: 5, judgeMaxAttempts: 3, organMaxAttempts: 3, finalRetryAttempts: 1, maxRecompose: 1,
  maxCooldownHoldsPerRun: 2, branchingFactor: 2, compositionSegmentCap: 3, fixedOrgansPerComposition: 5,
  reviewerCallsPerNode: 1, synthesizerMaxRounds: 3, evaluatorMaxRounds: 3 });
const FREE_LINE_UP = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "XiaomiMiMo/MiMo-V2.6-Pro", "Qwen/Qwen3.8-Flash",
  "claude-haiku-5-5"] as const;
const WRITER = "claude-haiku-5-5";
const CHECKER = "deepseek-ai/DeepSeek-V4.1-Flash";
const FREE_MONTH_MICROS = BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value.plans.find((plan) => plan.plan_id === "FREE")!.monthly_credit_micros;
const DEBATES_PER_MONTH = 4;
const BODY_ROLES: readonly DebateRole[] = DEBATE_ROLES.filter((role) => role !== "ANSWER_WRITER" && role !== "ANSWER_CHECKER");

const row = (model: string) => previewModelRow(model)!;
const calibrated = calibratedEstimatePricer([]);
/** One call at the calibrated start, in micro-units (the pricer is nano-USD), rounded up. */
const callMicros = (model: string): number => Math.ceil(Number(calibrated(row(model), "DEBATE")) / 1000);
const worstCallMicros = (model: string): number =>
  Math.ceil(Number(previewCallNanoUsd(row(model), PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, PREVIEW_GLM_GENERATION_TOKEN_FLOOR)) / 1000);
const mean = (models: readonly string[], price: (model: string) => number) =>
  models.reduce((sum, model) => sum + price(model), 0) / models.length;

/** One Free depth-1 engine-2 debate under `policy`, on `makers`: its arguing calls (ceiling and expected) and their money. */
function freeDebate(policy: DebateShapePolicy, makers: readonly string[]) {
  const settings = normaliseDepthParamsForShape({ depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" }, policy, "free");
  const shape = resolveDebateShape({ policy, plan: "free", makers: makers.length,
    settings: { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } })!;
  const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: makers.length, depth: settings.depth, shape,
    length: resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" }),
    engine: engineSettingsOf(engineVersionPolicyStartValues(), { makers: makers.length, mapOpening: true }) });
  const byRole = expectedCallsByRoleFromBasis(basis);
  const ceilingCalls = BODY_ROLES.reduce((sum, role) => sum + byRole[role], 0);
  const nodes = debateShapeSiteCounts(shape, settings.depth).nodes;
  const expectedCalls = ceilingCalls - shape.closeCallExtraGraders * nodes;
  const perCall = mean(makers, callMicros);
  const finalStep = 2 * (callMicros(WRITER) + callMicros(CHECKER)); // answer (write + check) and story (write + check)
  return Object.freeze({
    depth: settings.depth, byRole, ceilingCalls, expectedCalls,
    expectedMicros: Math.ceil(expectedCalls * perCall + finalStep),
    ceilingMicros: Math.ceil(ceilingCalls * perCall + finalStep),
    worstMicros: Math.ceil(ceilingCalls * mean(makers, worstCallMicros) + 2 * (worstCallMicros(WRITER) + worstCallMicros(CHECKER)))
  });
}

describe("one Free month at the owner's shape (2 x (question at depth 1 + 1 dig) + final answers), R22 start values", () => {
  const today = freeDebate(debateShapePolicyStartValues(), FREE_LINE_UP);

  it("one Free debate makes 106 arguing calls at the receipt's count, 76 expected, plus 4 final-step calls", () => {
    expect(today.depth).toBe(1);
    expect(today.byRole).toEqual({ POSITION: 14, SUPPORT_ATTACK: 9, CROSS_EXCHANGE: 3, JUDGE: 63, REVIEWER: 17, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
    expect(today.ceilingCalls).toBe(106);
    expect(today.expectedCalls).toBe(76);
  });

  it("the calibrated start prices each call at the Free line-up's own list prices", () => {
    expect(FREE_LINE_UP.map(callMicros)).toEqual([1200, 1520, 2764, 911, 1000]);
    expect(mean(FREE_LINE_UP, callMicros)).toBeCloseTo(1479, 0);
  });

  it("one debate is about 12 cents expected (16 at the receipt's count); a month of four is about 47 cents: it does NOT fit 20", () => {
    expect(today.expectedMicros).toBe(117_444);
    expect(today.ceilingMicros).toBe(161_814);
    expect(DEBATES_PER_MONTH * today.expectedMicros).toBe(469_776);
    expect(DEBATES_PER_MONTH * today.expectedMicros).toBeGreaterThan(FREE_MONTH_MICROS);
    // Even one question and its dig cross 20 cents.
    expect(2 * today.expectedMicros).toBeGreaterThan(FREE_MONTH_MICROS);
    // The realistic worst case (the preview estimate's active mode) is far above.
    expect(today.worstMicros).toBe(1_001_165);
  });

  /**
   * A LEANER FREE, for the owner's decision (not applied): the debate-shape row's smallest Free values (2 map AIs, 2
   * answers, 1 grader, 2 points, no gap round, no close-call extras) on the three cheapest Free AIs (Qwen, Haiku, GLM),
   * engine 2's own sites unchanged. It is a DEBATE settings row, so it can be activated without an upload.
   */
  it("a leaner Free (smallest shape, three cheapest AIs) is about 4.3 cents a debate: four fit in 20 cents", () => {
    const start = debateShapePolicyStartValues();
    const lean = parseDebateShapePolicy({ ...start, plans: { ...start.plans,
      free: { ...start.plans.free, mapAIs: 2, answers: 2, graders: 1, pointsPerAnswer: 2, gapRoundsMax: 0, closeCallExtraGraders: 0 } } });
    const cheapest = [...FREE_LINE_UP].sort((a, b) => callMicros(a) - callMicros(b)).slice(0, 3);
    expect(cheapest).toEqual(["Qwen/Qwen3.8-Flash", "claude-haiku-5-5", "zai-org/GLM-5.3-Flash"]);
    const leaner = freeDebate(lean, cheapest);
    expect(leaner.ceilingCalls).toBe(37);
    expect(leaner.expectedCalls).toBe(37);
    expect(leaner.expectedMicros).toBe(43_409);
    expect(DEBATES_PER_MONTH * leaner.expectedMicros).toBeLessThanOrEqual(FREE_MONTH_MICROS);
    // The same lean shape on all five Free AIs (MiMo included) does not fit.
    expect(DEBATES_PER_MONTH * freeDebate(lean, FREE_LINE_UP).expectedMicros).toBeGreaterThan(FREE_MONTH_MICROS);
  });
});
