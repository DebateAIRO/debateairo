import { describe, expect, it } from "vitest";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { DEBATE_ROLES, type DebateRole } from "@debateai/kernel";
import { START_STEP_HAIKU_MODEL } from "@debateai/map";
import { PREVIEW_GLM_GENERATION_TOKEN_FLOOR, PREVIEW_V2_FINAL_SEATS, parsePreviewLineUp, previewModelRow } from "@debateai/providers";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, computeStructuralCeilingBasis, debateShapePolicyStartValues, debateShapeSiteCounts, debateShapeSiteCountsV2,
  engineSettingsOf, engineVersionPolicyStartValues, lengthGuidancePolicyStartValues, normaliseDepthParamsForShape, parseDebateShapePolicy,
  resolveDebateShape, resolveDebateShapeV2, resolveLengthGuidance, settingsRowKind, type DebateShapePolicy
} from "@debateai/register";
import { ASK_CLARIFY_MODEL_SETTINGS } from "../../apps/api/src/ask-clarify.js";
import { expectedCallsByRoleFromBasis } from "../../apps/api/src/ask-model-picker.js";
import {
  PREVIEW_REALISTIC_INPUT_TOKENS_PER_CALL, calibratedEstimatePricer, previewCallNanoUsd
} from "../../apps/api/src/preview-budget-estimate.js";
import { START_SEAT_SPEED_ORDER } from "../../apps/api/src/start-step/seats.js";

/**
 * FREE PLAN, R22 — WHAT ONE FREE MONTH COSTS (owner rulings 2026-10-29: "#1" and "Free plan shape"). No AI is called and
 * nothing is spent: every number comes from the engine's own functions.
 *
 * The owner's Free month: question 1 at depth 1 + 1 dig, question 2 at depth 1 + 1 dig, each with the final written
 * answer (and a PDF, which is page work and costs no AI). A V4 dig is a follow-up question asked as a new debate
 * (apps/ui/lib/v4/askText.ts), so the month is FOUR depth-1 Free debates.
 *
 * R22 decision 18: the row's credit is MADE UP and the real one is on the owner's server, so these tests prove what the
 * ENGINE would charge for a Free month, and hold it against the made-up credit only to pin the arithmetic. Whether four
 * Free debates fit the REAL credit is no longer proved here: the owner checks that figure against his server's values.
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
 *    1,200 out per call, at each AI's list price), the figure the estimate uses before it has measured 20 calls of a kind;
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

  it("one debate is its calls at the mean price plus the final step; a month of four does NOT fit the row's made-up credit", () => {
    // The final step: Haiku writes and DeepSeek checks, the answer and the story.
    const finalStep = 2 * (1000 + 1520);
    expect(today.expectedMicros).toBe(Math.ceil(76 * 1479 + finalStep));
    expect(today.ceilingMicros).toBe(Math.ceil(106 * 1479 + finalStep));
    expect(DEBATES_PER_MONTH * today.expectedMicros).toBeGreaterThan(FREE_MONTH_MICROS);
    // The realistic worst case (the preview estimate's active mode) is far above.
    expect(today.worstMicros).toBe(1_001_165);
  });

  /**
   * A LEANER FREE, for the owner's decision (not applied): the debate-shape row's smallest Free values (2 map AIs, 2
   * answers, 1 grader, 2 points, no gap round, no close-call extras) on the three cheapest Free AIs (Qwen, Haiku, GLM),
   * engine 2's own sites unchanged. It is a DEBATE settings row, so it can be activated without an upload. (The owner
   * chose the same shape on four AIs, MiMo out, on 2026-10-29: the last block below.)
   */
  it("a leaner Free (smallest shape, three cheapest AIs) charges 37 calls at their mean price: four fit the row's made-up credit", () => {
    const start = debateShapePolicyStartValues();
    const lean = parseDebateShapePolicy({ ...start, plans: { ...start.plans,
      free: { ...start.plans.free, mapAIs: 2, answers: 2, graders: 1, pointsPerAnswer: 2, gapRoundsMax: 0, closeCallExtraGraders: 0 } } });
    const cheapest = [...FREE_LINE_UP].sort((a, b) => callMicros(a) - callMicros(b)).slice(0, 3);
    expect(cheapest).toEqual(["Qwen/Qwen3.8-Flash", "claude-haiku-5-5", "zai-org/GLM-5.3-Flash"]);
    const leaner = freeDebate(lean, cheapest);
    expect(leaner.ceilingCalls).toBe(37);
    expect(leaner.expectedCalls).toBe(37);
    // Qwen 911, Haiku 1,000, GLM 1,200 a call; the final step as above.
    expect(leaner.expectedMicros).toBe(Math.ceil(37 * (911 + 1000 + 1200) / 3 + 2 * (1000 + 1520)));
    expect(DEBATES_PER_MONTH * leaner.expectedMicros).toBeLessThanOrEqual(FREE_MONTH_MICROS);
    // The same lean shape on all five Free AIs (MiMo included) costs more.
    expect(freeDebate(lean, FREE_LINE_UP).expectedMicros).toBeGreaterThan(leaner.expectedMicros);
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

describe("the owner's leaner Free (R22 item 11): what four Free debates a month charge, with these exact settings", () => {
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

  it("the engine's own charge for the owner's month (2 questions + 2 digs) is four debates of 37 calls and a final step; the row's made-up edge is its credit plus its overflow", () => {
    // GLM 1,200, DeepSeek 1,520, Qwen 911, Haiku 1,000 micro-dollars a call at the calibrated start: 1,157.75 on average.
    expect(mean(LEAN_FREE_MODEL_IDS, callMicros)).toBeCloseTo(1157.75, 2);
    // 37 x 1,157.75 + the final step (Haiku writes and DeepSeek checks, the answer and the story).
    expect(debate.expectedMicros).toBe(Math.ceil(37 * 1157.75 + 2 * (1000 + 1520)));
    expect(debate.ceilingMicros).toBe(debate.expectedMicros);
    const month = DEBATES_PER_MONTH * debate.expectedMicros;
    expect(month).toBeLessThan(FREE_MONTH_MICROS);
    // billingPlans v4 (owner 2026-10-30, Q1): Free's month may be passed by a fixed overflow; on the made-up row, 330,000 + 220,000.
    const free = BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value.plans.find((plan) => plan.plan_id === "FREE")!;
    const finishEdge = FREE_MONTH_MICROS * free.finish_bp / 10_000 + free.finish_overflow_micros;
    expect(finishEdge).toBe(550_000);
    expect(month).toBeLessThan(finishEdge);
    // The realistic worst case (64 KiB in, 8,192 out on every call) is still far above: the calibrated start is the plan.
    expect(debate.worstMicros).toBe(299_069);
  });
});

/**
 * V4 START STEP, Task 43 (spec 2026-11-03 §5): THE FREE MONTH WITH PATHS, at 2 and 3 paths, on the owner's leaner Free above
 * (its shape and its four AIs), at the calibrated start (`callMicros`). Made-up figures only; the owner's real month is his.
 *
 *  - A QUESTION at p paths (MENU, depth 1): the path debate's arguing calls (shape receipt v2, as admission mints it) at the
 *    line-up's mean; each path's answer so far (one round on Free: Haiku writes, GLM checks, the v2 final seats); the final
 *    step (the answer and the story, each written by Haiku and checked by GLM); and the calls BEFORE START: the clarify
 *    call, the angle planner on the first seat of the speed order, the merge on the start step's Haiku, one combine (Haiku's
 *    too) and Free's two lists at the line-up's mean.
 *  - A DIG as paths: the same debate from the picks (DIG_PICKS), with no calls before Start (a dig has no Next).
 *  - A DIG as today: R22's leaner Free debate above (37 arguing calls and the final step).
 *  - A MONTH: 2 questions + 2 digs.
 *
 * The role split is the picker's own reader (`expectedCallsByRoleFromBasis`) on the receipt admission mints, as the R22
 * blocks above read theirs: plan Task 34's split for a v2 receipt (POSITION = the paths and the map sites, no cross replies,
 * SUPPORT_ATTACK = the author sites less those and the path outcome sites), so every count here is the engine's own.
 */
function freePathDebate(paths: number, pathsSource: "MENU" | "DIG_PICKS") {
  const lean = parseDebateShapePolicy(JSON.parse(LEAN_FREE_SHAPE_SV1));
  const makers = LEAN_FREE_MODEL_IDS.length;
  const settings = normaliseDepthParamsForShape({ depth: 1, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" }, lean, "free");
  const shapeV2 = resolveDebateShapeV2(lean, "free",
    { depthMode: "adaptive", scrutiny: "standard", answerLength: "standard", paths, pathsSource }, makers);
  // A path debate has no answer check (plan Task 34: the engine is told there is no map opening).
  const basis = computeStructuralCeilingBasis({ ...TERMS, panelSize: makers, depth: settings.depth, shapeV2,
    length: resolveLengthGuidance({ policy: lengthGuidancePolicyStartValues(), plan: "free", answerLength: "standard" }),
    engine: engineSettingsOf(engineVersionPolicyStartValues(), { makers, mapOpening: false }) });
  const admitted = parseCostEnvelopeBasis(basis);
  const counts = debateShapeSiteCountsV2(admitted.shapeV2!, admitted.depth);
  const engineSites = admitted.engine!.sites;
  const byRole = expectedCallsByRoleFromBasis(basis);
  const bodyCalls = BODY_ROLES.reduce((sum, role) => sum + byRole[role], 0);
  const { writer, checker } = PREVIEW_V2_FINAL_SEATS;
  // Each path's answer so far: its outcome sites, half written (Haiku) and half checked (GLM).
  const outcomes = (counts.pathOutcomeSites / 2) * (callMicros(writer) + callMicros(checker));
  const finalStep = 2 * (callMicros(writer) + callMicros(checker)); // the answer and the story, each written and checked
  return Object.freeze({ formulaVersion: basis.formula_version, byRole, counts, bodyCalls,
    comparingJudges: engineSites.comparingJudges, investigations: engineSites.investigations,
    arguingMicros: bodyCalls * mean(LEAN_FREE_MODEL_IDS, callMicros) + outcomes + finalStep, lists: lean.plans.free.mapAIs });
}

/**
 * The four single calls before Start on Free, by their models: clarify, the angle planner (the first seat of the speed order
 * on Free's line-up, plan Task 28), the merge and one combine (the start step's Haiku).
 */
function freePreStartSingleCalls(): readonly string[] {
  const planner = START_SEAT_SPEED_ORDER.find((model) => (LEAN_FREE_MODEL_IDS as readonly string[]).includes(model))!;
  return [ASK_CLARIFY_MODEL_SETTINGS.model, planner, START_STEP_HAIKU_MODEL, START_STEP_HAIKU_MODEL];
}

/** The calls before Start on Free: the four single calls, and the lists at the line-up's mean. */
function freePreStartMicros(lists: number): number {
  return Math.ceil(freePreStartSingleCalls().reduce((sum, model) => sum + callMicros(model), 0) + lists * mean(LEAN_FREE_MODEL_IDS, callMicros));
}

/** A Free question at `paths` paths: chosen from the menu, with the calls before Start. */
function freeQuestionV2(paths: number) {
  const debate = freePathDebate(paths, "MENU");
  const preStartMicros = freePreStartMicros(debate.lists);
  return Object.freeze({ ...debate, preStartMicros, micros: Math.ceil(debate.arguingMicros + preStartMicros) });
}

/** A Free dig at `paths` paths, from its picks: no calls before Start. */
function freeDigV2(paths: number) {
  const debate = freePathDebate(paths, "DIG_PICKS");
  return Object.freeze({ ...debate, preStartMicros: 0, micros: Math.ceil(debate.arguingMicros) });
}

/** One Free month: 2 questions at `paths` paths and 2 digs, as paths or as today's leaner Free debate. */
function month(paths: number, digs: "paths" | "today"): number {
  const dig = digs === "paths" ? freeDigV2(paths).micros
    : freeDebate(parseDebateShapePolicy(JSON.parse(LEAN_FREE_SHAPE_SV1)), LEAN_FREE_MODEL_IDS).expectedMicros;
  return 2 * freeQuestionV2(paths).micros + 2 * dig;
}

describe("the Free month with paths (V4 start step): 2 questions and 2 digs, at 2 and 3 paths, before-Start calls included", () => {
  const PATH_COUNTS = [2, 3] as const;

  it("one Free path debate: one root per path, two points each, no cross replies; engine 2's judges and investigations on top", () => {
    for (const p of PATH_COUNTS) {
      const question = freeQuestionV2(p);
      expect(question.formulaVersion).toBe("DR-185-shape-v2");
      expect(question.comparingJudges).toBe(3);
      expect(question.investigations).toBe(2);
      expect(question.byRole).toEqual({ POSITION: p, SUPPORT_ATTACK: 2 * p, CROSS_EXCHANGE: 0, JUDGE: 3 * p + question.comparingJudges,
        REVIEWER: 3 * p + question.investigations, ANSWER_WRITER: 3, ANSWER_CHECKER: 3 });
      expect(question.counts).toMatchObject({ mapSites: 0, nodes: 3 * p, pathOutcomeSites: 2 * p });
      // A dig from its picks is the same debate on Free (no gap round either way, no map of its own).
      const dig = freeDigV2(p);
      expect(dig.byRole).toEqual(question.byRole);
      expect(dig.counts).toEqual(question.counts);
    }
  });

  it("the calls before Start: clarify, the planner, the merge and one combine on Haiku, and Free's two lists at the line-up's mean", () => {
    expect(mean(LEAN_FREE_MODEL_IDS, callMicros)).toBeCloseTo(1157.75, 2);
    expect(freePreStartSingleCalls()).toEqual(["claude-haiku-5-5", "claude-haiku-5-5", "claude-haiku-5-5", "claude-haiku-5-5"]);
    expect(freeQuestionV2(2).lists).toBe(2);
    // Haiku's made-up 1,000 a call for the four Haiku calls; two lists at 1,157.75.
    expect(freeQuestionV2(2).preStartMicros).toBe(Math.ceil(4 * 1000 + 2 * 1157.75));
    expect(freeQuestionV2(3).preStartMicros).toBe(freeQuestionV2(2).preStartMicros);
    expect(freeDigV2(2).preStartMicros).toBe(0);
  });

  it("a question and a dig are their calls at the made-up prices: the arguing at the mean, the outcomes and the final step on Haiku and GLM", () => {
    // Haiku writes (1,000 a call), GLM checks (1,200 a call).
    expect(PREVIEW_V2_FINAL_SEATS).toEqual({ writer: "claude-haiku-5-5", checker: "zai-org/GLM-5.3-Flash" });
    for (const p of PATH_COUNTS) {
      // p + 2p + (3p + 3) + (3p + 2) arguing calls.
      expect(freeQuestionV2(p).bodyCalls).toBe(9 * p + 5);
      expect(freeQuestionV2(p).micros).toBe(Math.ceil((9 * p + 5) * 1157.75 + p * (1000 + 1200) + 2 * (1000 + 1200)
        + Math.ceil(4 * 1000 + 2 * 1157.75)));
      expect(freeDigV2(p).micros).toBe(Math.ceil((9 * p + 5) * 1157.75 + p * (1000 + 1200) + 2 * (1000 + 1200)));
    }
  });

  it("each of the four months is below the row's made-up credit, and 3 paths cost more than 2", () => {
    for (const p of PATH_COUNTS) {
      expect(month(p, "paths")).toBe(2 * freeQuestionV2(p).micros + 2 * freeDigV2(p).micros);
      // A dig as today: R22's leaner Free debate, 37 arguing calls and its final step (Haiku writes, DeepSeek checks).
      expect(month(p, "today")).toBe(2 * freeQuestionV2(p).micros + 2 * Math.ceil(37 * 1157.75 + 2 * (1000 + 1520)));
      expect(month(p, "paths")).toBeLessThan(FREE_MONTH_MICROS);
      expect(month(p, "today")).toBeLessThan(FREE_MONTH_MICROS);
    }
    expect(month(3, "paths")).toBeGreaterThan(month(2, "paths"));
    expect(month(3, "today")).toBeGreaterThan(month(2, "today"));
  });
});
