import { describe, expect, it } from "vitest";
import { DEBATE_ROLES, type DebateRole } from "@debateai/kernel";
import { PREVIEW_GLM_GENERATION_TOKEN_FLOOR, parsePreviewLineUp, previewModelRow } from "@debateai/providers";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, computeStructuralCeilingBasis, debateShapePolicyStartValues, debateShapeSiteCounts, engineSettingsOf,
  engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, normaliseDepthParamsForShape, parseDebateShapePolicy, resolveDebateShape,
  resolveLengthGuidance, settingsRowKind, type DebateShapePolicy
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
   * engine 2's own sites unchanged. It is a DEBATE settings row, so it can be activated without an upload. (The owner
   * chose the same shape on four AIs, MiMo out, on 2026-10-29: the last block below.)
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

/**
 * THE OWNER'S LEANER FREE (R22 item 11, ruled 2026-10-29: "Leaner Free, all 4 fit"): every Free debate uses 2 map AIs, 2
 * answers, 1 grader, 2 points per answer, no gap round and no close-call extras, on the Free line-up GLM, DeepSeek, Qwen
 * and Haiku (no MiMo). Both are DEBATE settings rows, so they are published as a settings version: the release guide's
 * "Changing debate settings without an upload" (deploy/preview-release/v1/README.md, SV0-SV6), SV1's two choices below,
 * or the same two inputs to the upload's own plan (`rel native-plan --operation plan --debate-shape … --line-up …`).
 * A sealed version is never edited: these values make a NEW version.
 *
 *  - SV1 `SHAPE`: the debateShapePolicy value below, verbatim. It is the owners' start values with only `plans.free`
 *    changed. The test site's versions carry NO debateShapePolicy row today (R17-R21 published none), so this row also
 *    turns the debate shape on for the paid plans, at the start values (V4's map and answer check need the shape in
 *    force); if the version it is planned from already carries a shape row, change only `plans.free`.
 *  - SV1 `LINEUP`: a copy of the active line-up file with `XiaomiMiMo/MiMo-V2.6-Pro` taken out of `free_model_ids`;
 *    `premium_model_ids` and `thinking_levels` stay exactly as they are. Free's list then reads LEAN_FREE_MODEL_IDS.
 */
const LEAN_FREE_SHAPE_SV1 = '{"kind":"DEBATE_SHAPE_POLICY","version":1,"plans":{"free":{"mapAIs":2,"answers":2,"graders":1,"pointsPerAnswer":2,"deeperTopPoints":1,"gapRoundsMax":0,"closeCallExtraGraders":0,"fixedDepthAllowed":false,"scrutiny":{"deep":null,"exhaustive":null,"scrutinyLeverageMin":0.05,"scrutinyWeakBelow":0.5},"opening":"ANGLE_MAP"},"plus":{"mapAIs":4,"answers":3,"graders":3,"pointsPerAnswer":4,"deeperTopPoints":2,"gapRoundsMax":2,"closeCallExtraGraders":2,"fixedDepthAllowed":true,"scrutiny":{"deep":{"roundsPerPoint":2,"pointsPerDebate":6},"exhaustive":{"roundsPerPoint":3,"pointsPerDebate":15},"scrutinyLeverageMin":0.05,"scrutinyWeakBelow":0.5},"opening":"ANGLE_MAP"},"pro":{"mapAIs":5,"answers":4,"graders":3,"pointsPerAnswer":4,"deeperTopPoints":2,"gapRoundsMax":2,"closeCallExtraGraders":2,"fixedDepthAllowed":true,"scrutiny":{"deep":{"roundsPerPoint":2,"pointsPerDebate":6},"exhaustive":{"roundsPerPoint":3,"pointsPerDebate":15},"scrutinyLeverageMin":0.05,"scrutinyWeakBelow":0.5},"opening":"ANGLE_MAP"},"max":{"mapAIs":7,"answers":4,"graders":3,"pointsPerAnswer":4,"deeperTopPoints":2,"gapRoundsMax":2,"closeCallExtraGraders":2,"fixedDepthAllowed":true,"scrutiny":{"deep":{"roundsPerPoint":2,"pointsPerDebate":6},"exhaustive":{"roundsPerPoint":3,"pointsPerDebate":15},"scrutinyLeverageMin":0.05,"scrutinyWeakBelow":0.5},"opening":"ANGLE_MAP"},"premium":{"mapAIs":5,"answers":4,"graders":3,"pointsPerAnswer":4,"deeperTopPoints":2,"gapRoundsMax":2,"closeCallExtraGraders":2,"fixedDepthAllowed":true,"scrutiny":{"deep":{"roundsPerPoint":2,"pointsPerDebate":6},"exhaustive":{"roundsPerPoint":3,"pointsPerDebate":15},"scrutinyLeverageMin":0.05,"scrutinyWeakBelow":0.5},"opening":"ANGLE_MAP"}},"answerLength":{"short":{"words":200,"writerBound":8192},"standard":{"words":350,"writerBound":12288},"detailed":{"words":1000,"writerBound":16384}},"mapStepBounds":{"merge":32768,"choose":32768}}';
const LEAN_FREE_MODEL_IDS = ["zai-org/GLM-5.3-Flash", "deepseek-ai/DeepSeek-V4.1-Flash", "Qwen/Qwen3.8-Flash", "claude-haiku-5-5"] as const;

describe("the owner's leaner Free (R22 item 11): four Free debates a month fit in 20 cents, with these exact settings", () => {
  const lean = parseDebateShapePolicy(JSON.parse(LEAN_FREE_SHAPE_SV1));
  const debate = freeDebate(lean, LEAN_FREE_MODEL_IDS);

  it("SHAPE is the start values with only plans.free changed, to exactly the owner's numbers; a DEBATE row", () => {
    const start = debateShapePolicyStartValues();
    expect({ ...lean, plans: { ...lean.plans, free: start.plans.free } }).toEqual(start);
    expect(lean.plans.free).toEqual({ ...start.plans.free,
      mapAIs: 2, answers: 2, graders: 1, pointsPerAnswer: 2, gapRoundsMax: 0, closeCallExtraGraders: 0 });
    // The value is plain JSON in the start values' own key order, so it pastes into SV1's SHAPE='…' unchanged.
    expect(JSON.stringify(lean)).toBe(LEAN_FREE_SHAPE_SV1);
    expect(settingsRowKind("debateShapePolicy")).toBe("DEBATE");
  });

  it("LINEUP: Free without MiMo passes the line-up's own check (reviewed ids, two-maker rule); a DEBATE row", () => {
    expect(LEAN_FREE_MODEL_IDS).toEqual(FREE_LINE_UP.filter((model) => model !== "XiaomiMiMo/MiMo-V2.6-Pro"));
    // Premium stays whatever the active line-up holds; the five Free AIs stand in for it here.
    const checked = parsePreviewLineUp({ free_model_ids: [...LEAN_FREE_MODEL_IDS], premium_model_ids: [...FREE_LINE_UP], thinking_levels: null });
    expect(checked.free_model_ids).toEqual(LEAN_FREE_MODEL_IDS);
    expect(new Set(LEAN_FREE_MODEL_IDS.map((model) => row(model).maker)).size).toBe(4);
    // The final step's two AIs (Haiku writes, DeepSeek checks) stay on Free's list.
    expect(LEAN_FREE_MODEL_IDS).toEqual(expect.arrayContaining([WRITER, CHECKER]));
    expect(settingsRowKind("previewLineUpPolicy")).toBe("DEBATE");
  });

  it("one leaner Free debate: depth 1, 37 arguing calls (the receipt's count is the same: no close-call extras) plus 4 final-step calls", () => {
    expect(debate.depth).toBe(1);
    expect(debate.byRole).toEqual({ POSITION: 10, SUPPORT_ATTACK: 4, CROSS_EXCHANGE: 2, JUDGE: 11, REVIEWER: 10, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
    expect(debate.ceilingCalls).toBe(37);
    expect(debate.expectedCalls).toBe(37);
  });

  it("about 4.8 cents a debate; the owner's month (2 questions + 2 digs) about 19.2 cents: under Free's 20, and under the 22-cent finish edge", () => {
    // GLM 1,200, DeepSeek 1,520, Qwen 911, Haiku 1,000 micro-dollars a call at the calibrated start: 1,157.75 on average.
    expect(mean(LEAN_FREE_MODEL_IDS, callMicros)).toBeCloseTo(1157.75, 2);
    // 37 x 1,157.75 + the final step (Haiku writes and DeepSeek checks, the answer and the story): 4.79 cents.
    expect(debate.expectedMicros).toBe(47_877);
    expect(debate.ceilingMicros).toBe(debate.expectedMicros);
    const month = DEBATES_PER_MONTH * debate.expectedMicros;
    expect(month).toBe(191_508);
    expect(month).toBeLessThan(FREE_MONTH_MICROS);
    const finishEdge = FREE_MONTH_MICROS * BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value.plans.find((plan) => plan.plan_id === "FREE")!.finish_bp / 10_000;
    expect(month).toBeLessThan(finishEdge);
    // The realistic worst case (64 KiB in, 8,192 out on every call) is still far above: the calibrated start is the plan.
    expect(debate.worstMicros).toBe(299_069);
  });
});
