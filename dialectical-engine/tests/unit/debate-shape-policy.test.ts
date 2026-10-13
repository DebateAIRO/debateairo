import { describe, expect, it } from "vitest";
import {
  DEBATE_SHAPE_OPENINGS, DEBATE_SHAPE_PLAN_KEYS, DEBATE_SHAPE_POLICY_ROW_KEY, assertDebateShapeRunnerReady,
  debateShapePlanKeyOf, debateShapePolicyRow, debateShapePolicyStartValues, normaliseDepthParamsForShape,
  parseDebateShapePolicy, readDebateShapePolicy, resolveDebateShape
} from "@debateai/register";

const START = debateShapePolicyStartValues();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plain = (): any => JSON.parse(JSON.stringify(START));
const poolReturning = (rows: unknown[]) => {
  const calls: unknown[][] = [];
  return { calls, pool: { query: async (_sql: string, params: unknown[]) => { calls.push(params); return { rows }; } } as never };
};
const SETTINGS = Object.freeze({ depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" } as const);

describe("debateShapePolicy: one optional row, absent means today's shape (spec 2026-10-12 §3.1)", () => {
  it("holds the owner's start values (rulings S5-S8), frozen", () => {
    expect(START.plans.free).toEqual({ mapAIs: 3, answers: 3, graders: 2, pointsPerAnswer: 3, deeperTopPoints: 1, gapRoundsMax: 1,
      closeCallExtraGraders: 2, fixedDepthAllowed: false,
      scrutiny: { deep: null, exhaustive: null, scrutinyLeverageMin: 0.05, scrutinyWeakBelow: 0.5 }, opening: "ANGLE_MAP" });
    const scrutiny = { deep: { roundsPerPoint: 2, pointsPerDebate: 6 }, exhaustive: { roundsPerPoint: 3, pointsPerDebate: 15 },
      scrutinyLeverageMin: 0.05, scrutinyWeakBelow: 0.5 };
    const premium = (mapAIs: number, answers: number) => ({ mapAIs, answers, graders: 3, pointsPerAnswer: 4, deeperTopPoints: 2,
      gapRoundsMax: 2, closeCallExtraGraders: 2, fixedDepthAllowed: true, scrutiny, opening: "ANGLE_MAP" });
    expect(START.plans.plus).toEqual(premium(4, 3));
    expect(START.plans.pro).toEqual(premium(5, 4));
    expect(START.plans.max).toEqual(premium(7, 4));
    expect(START.plans.premium).toEqual(START.plans.pro);
    expect(START.answerLength).toEqual({ short: { words: 300, writerBound: 8192 }, standard: { words: 700, writerBound: 12288 },
      detailed: { words: 1500, writerBound: 16384 } });
    // Controller ruling X1: the map's merge and choose steps answer at their own bound (P2b ruling R-2).
    expect(START.mapStepBounds).toEqual({ merge: 32_768, choose: 32_768 });
    expect(Object.isFrozen(START.plans.max.scrutiny.exhaustive)).toBe(true);
    expect(DEBATE_SHAPE_PLAN_KEYS).toEqual(["free", "plus", "pro", "max", "premium"]);
    expect(DEBATE_SHAPE_OPENINGS).toEqual(["ANGLE_MAP", "BLIND_LISTS", "SNOWBALL"]);
    expect(debateShapePolicyStartValues("SNOWBALL").plans.pro.opening).toBe("SNOWBALL");
  });

  it.each([
    ["a map size above its bound", (v: any) => { v.plans.free.mapAIs = 10; }, "plans.free.mapAIs"],
    ["one answer", (v: any) => { v.plans.pro.answers = 1; }, "plans.pro.answers"],
    ["no grader", (v: any) => { v.plans.max.graders = 0; }, "plans.max.graders"],
    ["an unknown opening", (v: any) => { v.plans.plus.opening = "DEBATE"; }, "plans.plus.opening"],
    ["deep rounds above their bound", (v: any) => { v.plans.pro.scrutiny.deep.roundsPerPoint = 6; }, "plans.pro.scrutiny.deep.roundsPerPoint"],
    ["a leverage share above one", (v: any) => { v.plans.pro.scrutiny.scrutinyLeverageMin = 1.5; }, "plans.pro.scrutiny.scrutinyLeverageMin"],
    ["a share with seven decimals", (v: any) => { v.plans.free.scrutiny.scrutinyWeakBelow = 0.1234567; }, "plans.free.scrutiny.scrutinyWeakBelow"],
    ["a missing premium fallback", (v: any) => { delete v.plans.premium; }, "plans.premium"],
    ["an unknown plan field", (v: any) => { v.plans.free.concurrency = 3; }, "plans.free"],
    ["the wrong kind", (v: any) => { v.kind = "CALL_CONCURRENCY_POLICY"; }, "kind"],
    ["another version", (v: any) => { v.version = 2; }, "version"],
    ["lengths that do not rise", (v: any) => { v.answerLength.short.words = 800; }, "answerLength.words"],
    // T2 (final review): the writer bound's own order rule, and the exhaustive budget's own bound.
    ["a writer bound that falls", (v: any) => { v.answerLength.detailed.writerBound = 8192; }, "answerLength.writerBound"],
    ["exhaustive rounds above their bound", (v: any) => { v.plans.max.scrutiny.exhaustive.roundsPerPoint = 9; },
      "plans.max.scrutiny.exhaustive.roundsPerPoint"]
  ])("refuses %s, naming the path", (_name, mutate, path) => {
    const value = plain();
    mutate(value);
    expect(() => parseDebateShapePolicy(value)).toThrow(`DEBATE_SHAPE_POLICY_INVALID:${path}`);
  });
  it("T2: the zero values the bounds allow survive the publishers' row and parse back unchanged", () => {
    const value = plain();
    value.plans.free.gapRoundsMax = 0;
    value.plans.free.closeCallExtraGraders = 0;
    value.plans.free.scrutiny.scrutinyLeverageMin = 0;
    const parsed = parseDebateShapePolicy(value);
    expect(parsed.plans.free).toMatchObject({ gapRoundsMax: 0, closeCallExtraGraders: 0, scrutiny: { scrutinyLeverageMin: 0 } });
    expect(parseDebateShapePolicy(JSON.parse(debateShapePolicyRow(parsed, "t").valueJsonText))).toEqual(value);
  });
  it("X1: a row without mapStepBounds reads the default; a written one is checked strictly (8,192..32,768 tokens each)", () => {
    const without = plain();
    delete without.mapStepBounds;
    const parsed = parseDebateShapePolicy(without);
    expect(parsed).toEqual(START);
    expect(Object.isFrozen(parsed.mapStepBounds)).toBe(true);
    const lower = parseDebateShapePolicy({ ...plain(), mapStepBounds: { merge: 8192, choose: 16_384 } });
    expect(lower.mapStepBounds).toEqual({ merge: 8192, choose: 16_384 });
    expect(resolveDebateShape({ policy: lower, plan: "pro", makers: 3, settings: SETTINGS }))
      .toMatchObject({ mapMergeBound: 8192, mapChooseBound: 16_384 });
    // The publishers' row writes the member (the default included), and it parses back to the same value.
    const row = debateShapePolicyRow(parsed, "x1");
    expect(JSON.parse(row.valueJsonText).mapStepBounds).toEqual({ merge: 32_768, choose: 32_768 });
  });
  it.each([
    ["a merge bound under the judge bound floor", (v: any) => { v.mapStepBounds.merge = 8191; }, "mapStepBounds.merge"],
    ["a choose bound above 32,768", (v: any) => { v.mapStepBounds.choose = 32_769; }, "mapStepBounds.choose"],
    ["a fractional merge bound", (v: any) => { v.mapStepBounds.merge = 16_384.5; }, "mapStepBounds.merge"],
    ["a missing choose bound", (v: any) => { delete v.mapStepBounds.choose; }, "mapStepBounds.choose"],
    ["an unknown map step", (v: any) => { v.mapStepBounds.gap = 16_384; }, "mapStepBounds"],
    ["a null member", (v: any) => { v.mapStepBounds = null; }, "mapStepBounds"]
  ])("X1: refuses %s, naming the path", (_name, mutate, path) => {
    const value = plain();
    mutate(value);
    expect(() => parseDebateShapePolicy(value)).toThrow(`DEBATE_SHAPE_POLICY_INVALID:${path}`);
  });
  it("refuses a value that is not an object, and a __proto__ key a JSON text carries", () => {
    expect(() => parseDebateShapePolicy("ON")).toThrow("DEBATE_SHAPE_POLICY_INVALID:$");
    const text = JSON.stringify(plain()).replace('"plans":{', '"plans":{"__proto__":{},');
    expect(() => parseDebateShapePolicy(JSON.parse(text))).toThrow("DEBATE_SHAPE_POLICY_INVALID:plans.__proto__");
  });

  it("reads ABSENT as null, a valid row as the policy, and refuses a malformed row loudly", async () => {
    const absent = poolReturning([]);
    await expect(readDebateShapePolicy(absent.pool, 9)).resolves.toBeNull();
    expect(absent.calls).toEqual([[9, DEBATE_SHAPE_POLICY_ROW_KEY]]);
    await expect(readDebateShapePolicy(poolReturning([{ value_json: plain() }]).pool, 10)).resolves.toEqual(START);
    await expect(readDebateShapePolicy(poolReturning([{ value_json: { ...plain(), kind: "X" } }]).pool, 10))
      .rejects.toThrow("DEBATE_SHAPE_POLICY_INVALID:kind");
  });

  it("the publishers' row is the canonical JSON of the value and parses back to it", () => {
    const row = debateShapePolicyRow(START, "docs/superpowers/specs/2026-10-12-debate-shape-design.md; owner 2026-10-12");
    expect(row.rowKey).toBe("debateShapePolicy");
    expect(JSON.parse(row.valueJsonText)).toEqual(plain());
    const again = debateShapePolicyRow(parseDebateShapePolicy(JSON.parse(row.valueJsonText)), row.sourceRef);
    expect(again.valueJsonText).toBe(row.valueJsonText);
    expect(() => debateShapePolicyRow(START, " ")).toThrow("DEBATE_SHAPE_POLICY_INVALID:sourceRef");
  });

  it("the plan key: the plan id with billing on, else the tier", () => {
    expect(["FREE", "PLUS", "PRO", "MAX"].map((id) => debateShapePlanKeyOf(id as never, "premium"))).toEqual(["free", "plus", "pro", "max"]);
    expect(debateShapePlanKeyOf(null, "free")).toBe("free");
    expect(debateShapePlanKeyOf(null, "premium")).toBe("premium");
  });

  it("normalises per plan; without the row a depth-only ask is the same object and anything else is stripped", () => {
    const depthOnly = Object.freeze({ depth: 2 });
    expect(normaliseDepthParamsForShape(depthOnly, null, "free")).toBe(depthOnly);
    expect(normaliseDepthParamsForShape({ depth: 2, depthMode: "fixed", answerLength: "short" }, null, "pro")).toEqual({ depth: 2 });
    const free = normaliseDepthParamsForShape({ depth: 2, depthMode: "fixed", scrutiny: "exhaustive", answerLength: "detailed" }, START, "free");
    expect(JSON.stringify(free)).toBe('{"depth":2,"depthMode":"adaptive","scrutiny":"standard","answerLength":"detailed"}');
    expect(normaliseDepthParamsForShape({ depth: 3 }, START, "pro"))
      .toEqual({ depth: 3, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" });
    expect(normaliseDepthParamsForShape({ depth: 3, depthMode: "fixed", scrutiny: "deep" }, START, "max"))
      .toEqual({ depth: 3, depthMode: "fixed", scrutiny: "deep", answerLength: "standard" });
  });

  it("with the row, Free's depth has ceiling 2 even with billing off (ruling S6, controller ruling PF9); without it, depth is untouched", () => {
    expect(normaliseDepthParamsForShape({ depth: 3 }, START, "free"))
      .toEqual({ depth: 2, depthMode: "adaptive", scrutiny: "standard", answerLength: "standard" });
    expect(normaliseDepthParamsForShape({ depth: 4, answerLength: "short" }, START, "free").depth).toBe(2);
    expect(normaliseDepthParamsForShape({ depth: 1 }, START, "free").depth).toBe(1);
    expect(normaliseDepthParamsForShape({ depth: 2 }, START, "free").depth).toBe(2);
    expect(normaliseDepthParamsForShape({ depth: 4 }, START, "premium").depth).toBe(4);
    expect(normaliseDepthParamsForShape({ depth: 4 }, START, "plus").depth).toBe(4);
    expect(normaliseDepthParamsForShape({ depth: 3 }, null, "free")).toEqual({ depth: 3 });
  });

  it("resolves the sizes, capped by the makers present; one maker keeps today's shape", () => {
    expect(resolveDebateShape({ policy: START, plan: "pro", makers: 1, settings: SETTINGS })).toBeNull();
    expect(resolveDebateShape({ policy: START, plan: "free", makers: 2, settings: SETTINGS }))
      .toMatchObject({ mapAIs: 2, answers: 2, graders: 1, closeCallExtraGraders: 0, pointsPerAnswer: 3, deeperTopPoints: 1, gapRounds: 1 });
    expect(resolveDebateShape({ policy: START, plan: "pro", makers: 5, settings: SETTINGS }))
      .toMatchObject({ mapAIs: 5, answers: 4, graders: 3, closeCallExtraGraders: 1 });
    expect(resolveDebateShape({ policy: START, plan: "max", makers: 7,
      settings: { depthMode: "fixed", scrutiny: "exhaustive", answerLength: "detailed" } })).toEqual({
      plan: "max", depthMode: "fixed", scrutiny: "exhaustive", answerLength: "detailed", mapAIs: 7, answers: 4, graders: 3,
      pointsPerAnswer: 4, deeperTopPoints: 2, gapRounds: 2, closeCallExtraGraders: 2, scrutinyRoundsPerPoint: 3,
      scrutinyPointsPerDebate: 15, scrutinyLeverageMin: 0.05, scrutinyWeakBelow: 0.5, opening: "ANGLE_MAP",
      answerWords: 1500, writerBound: 16384, mapMergeBound: 32_768, mapChooseBound: 32_768 });
    expect(() => resolveDebateShape({ policy: START, plan: "free", makers: 3, settings: { ...SETTINGS, depthMode: "fixed" } }))
      .toThrow("DEBATE_SHAPE_SETTINGS_NOT_NORMALISED:depthMode");
    expect(() => resolveDebateShape({ policy: START, plan: "free", makers: 3, settings: { ...SETTINGS, scrutiny: "deep" } }))
      .toThrow("DEBATE_SHAPE_SETTINGS_NOT_NORMALISED:scrutiny");
    expect(() => resolveDebateShape({ policy: START, plan: "free", makers: 0, settings: SETTINGS })).toThrow("DEBATE_SHAPE_MAKERS_INVALID");
  });

  it("Phase 2a: a valid row refuses the runner's boot until the runner can run the shape", () => {
    expect(() => assertDebateShapeRunnerReady(null)).not.toThrow();
    const refused = (() => { try { assertDebateShapeRunnerReady(START); return null; } catch (error) { return error; } })();
    expect(refused).toMatchObject({ code: "DEBATE_SHAPE_POLICY_RUNNER_PENDING" });
  });
});
