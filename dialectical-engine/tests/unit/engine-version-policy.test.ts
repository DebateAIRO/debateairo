import { describe, expect, expectTypeOf, it } from "vitest";
import type { CompositionMetric } from "@debateai/judgement";
import {
  COMPOSITION_METRICS, ENGINE_JUDGE_MAKER_RULES, ENGINE_RIVAL_REPLIES, ENGINE_SCORING_COMBINES, ENGINE_VERSION_LIMITS,
  ENGINE_VERSION_POLICY_ROW_KEY, ENGINE_VERSION_START, claimTypeCompositionMemberSchema, engineInForce,
  engineVersionPolicyRow, engineVersionPolicyStartValues, parseEngineVersionPolicy, readEngineVersionPolicy,
  type CompositionMetricName
} from "@debateai/register";

const START = engineVersionPolicyStartValues();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const plain = (): any => JSON.parse(JSON.stringify(START));
const refusal = (path: string) => new TypeError(`ENGINE_VERSION_POLICY_INVALID:${path}`);
const poolReturning = (rows: unknown[]) => {
  const calls: unknown[][] = [];
  return { calls, pool: { query: async (_sql: string, params: unknown[]) => { calls.push(params); return { rows }; } } as never };
};
const sumOf = (terms: readonly { coefficient: number }[]) => terms.reduce((total, term) => total + term.coefficient, 0);

describe("engineVersionPolicy: one optional row, absent means engine 1 (spec 2026-10-15 §3)", () => {
  it("holds the owners' start values, frozen, and never writes `enabled`", () => {
    expect(ENGINE_VERSION_POLICY_ROW_KEY).toBe("engineVersionPolicy");
    expect(START).toEqual({
      kind: "ENGINE_VERSION_POLICY", version: 1, engine: 2,
      scoring: {
        terms: COMPOSITION_METRICS.map((metric) => ({ metric, coefficient: 0.142857 })),
        clarityDecayPerAmbiguity: 0.1, fatalCap: { minFlagSeverity: 0.5, to: 0.3 }, fidelityFloor: { below: 0.5, to: 0.5 },
        combine: "MEDIAN", disputedWeight: 0.7
      },
      links: { cannotAssessWeight: 0.66, ownReplyCountsAsSupport: false, rivalReplies: "EQUAL" },
      investigate: { maxPerDebate: 2 },
      judges: { count: 3, makerRule: "PREFER_NON_ARGUING_ELSE_IGNORE_OWN" },
      label: { clearAgreeing: 3, closeCallAgreeing: 2 },
      answerCheck: { candidates: 3 }
    });
    // Every member, in the composition row's order, at 1/7 rounded to six decimals: the seven sum to 0.999999.
    expect(START.scoring.terms.map((term) => term.metric)).toEqual([...COMPOSITION_METRICS]);
    expect(START.scoring.terms.every((term) => term.coefficient === 0.142857)).toBe(true);
    expect(Math.abs(sumOf(START.scoring.terms) - 1)).toBeLessThanOrEqual(0.001);
    expect(Object.hasOwn(START, "enabled")).toBe(false);
    expect(ENGINE_VERSION_START).toEqual({
      equalCoefficient: 0.142857, clarityDecayPerAmbiguity: 0.1, fatalCap: { minFlagSeverity: 0.5, to: 0.3 },
      fidelityFloor: { below: 0.5, to: 0.5 }, disputedWeight: 0.7, cannotAssessWeight: 0.66, maxInvestigationsPerDebate: 2,
      judges: 3, clearAgreeing: 3, closeCallAgreeing: 2, answerCheckCandidates: 3
    });
    expect(ENGINE_VERSION_LIMITS).toEqual({ judgesMax: 5, investigationsMax: 5, answerCheckMax: 4, sumTolerance: 0.001 });
    expect([ENGINE_SCORING_COMBINES, ENGINE_RIVAL_REPLIES, ENGINE_JUDGE_MAKER_RULES])
      .toEqual([["MEDIAN"], ["EQUAL"], ["PREFER_NON_ARGUING_ELSE_IGNORE_OWN"]]);
    for (const frozen of [START, START.scoring, START.scoring.terms, START.scoring.terms[0], START.scoring.fatalCap,
      START.scoring.fidelityFloor, START.links, START.investigate, START.judges, START.label, START.answerCheck,
      COMPOSITION_METRICS, ENGINE_SCORING_COMBINES, ENGINE_RIVAL_REPLIES, ENGINE_JUDGE_MAKER_RULES,
      ENGINE_VERSION_LIMITS, ENGINE_VERSION_START, ENGINE_VERSION_START.fatalCap, ENGINE_VERSION_START.fidelityFloor]) {
      expect(Object.isFrozen(frozen)).toBe(true);
    }
  });

  it("names the seven measures exactly as judgement and the composition row do (no package edge)", () => {
    // Compile-time pin: `pnpm typecheck` fails if judgement's CompositionMetric and this list ever differ.
    expectTypeOf<CompositionMetricName>().toEqualTypeOf<CompositionMetric>();
    // Run-time pin: the composition row's own metric enum (packages/register/src/index.ts:43-46), in its order.
    expect(claimTypeCompositionMemberSchema.shape.terms.element.shape.metric.options).toEqual([...COMPOSITION_METRICS]);
  });
});

describe("engineVersionPolicy: the parser refuses by path (INTERFACE §1.2)", () => {
  it.each([
    ["an unknown key at the root", (v: any) => { v.extra = 1; }, "$"],
    ["the wrong kind", (v: any) => { v.kind = "DEBATE_SHAPE_POLICY"; }, "kind"],
    ["another version", (v: any) => { v.version = 2; }, "version"],
    ["engine 1 written into the row", (v: any) => { v.engine = 1; }, "engine"],
    ["an enabled that is a word", (v: any) => { v.enabled = "yes"; }, "enabled"],
    ["six measures", (v: any) => { v.scoring.terms.pop(); }, "scoring.terms"],
    ["a measure twice and one missing", (v: any) => { v.scoring.terms[6].metric = "clarity"; }, "scoring.terms"],
    ["an unknown measure", (v: any) => { v.scoring.terms[0].metric = "honesty"; }, "scoring.terms.0.metric"],
    ["an unknown key in a term", (v: any) => { v.scoring.terms[0].why = "x"; }, "scoring.terms.0"],
    ["a weight above one", (v: any) => { v.scoring.terms[0].coefficient = 1.5; }, "scoring.terms.0.coefficient"],
    ["a weight with seven decimals", (v: any) => { v.scoring.terms[0].coefficient = 0.1428571; }, "scoring.terms.0.coefficient"],
    ["weights that do not sum to one", (v: any) => { v.scoring.terms[0].coefficient = 0.2; }, "scoring.terms"],
    ["a clarity decay above one", (v: any) => { v.scoring.clarityDecayPerAmbiguity = 1.5; }, "scoring.clarityDecayPerAmbiguity"],
    ["a fatal-cap severity below zero", (v: any) => { v.scoring.fatalCap.minFlagSeverity = -0.1; }, "scoring.fatalCap.minFlagSeverity"],
    ["a fatal-cap target above one", (v: any) => { v.scoring.fatalCap.to = 1.2; }, "scoring.fatalCap.to"],
    ["a fidelity floor above one", (v: any) => { v.scoring.fidelityFloor.below = 2; }, "scoring.fidelityFloor.below"],
    ["a fidelity target with seven decimals", (v: any) => { v.scoring.fidelityFloor.to = 0.5000001; }, "scoring.fidelityFloor.to"],
    ["another way to combine", (v: any) => { v.scoring.combine = "MEAN"; }, "scoring.combine"],
    ["a disputed weight above one", (v: any) => { v.scoring.disputedWeight = 1.1; }, "scoring.disputedWeight"],
    ["an unknown scoring key", (v: any) => { v.scoring.extra = 1; }, "scoring"],
    ["a cannot-assess weight below zero", (v: any) => { v.links.cannotAssessWeight = -0.5; }, "links.cannotAssessWeight"],
    ["own replies counted as support", (v: any) => { v.links.ownReplyCountsAsSupport = true; }, "links.ownReplyCountsAsSupport"],
    ["unequal rival replies", (v: any) => { v.links.rivalReplies = "MORE"; }, "links.rivalReplies"],
    ["six investigations", (v: any) => { v.investigate.maxPerDebate = 6; }, "investigate.maxPerDebate"],
    ["half an investigation", (v: any) => { v.investigate.maxPerDebate = 1.5; }, "investigate.maxPerDebate"],
    ["no comparing judge", (v: any) => { v.judges.count = 0; }, "judges.count"],
    ["six comparing judges", (v: any) => { v.judges.count = 6; }, "judges.count"],
    ["another maker rule", (v: any) => { v.judges.makerRule = "ANY"; }, "judges.makerRule"],
    ["a clear answer needing six votes", (v: any) => { v.label.clearAgreeing = 6; }, "label.clearAgreeing"],
    ["a close call needing no vote", (v: any) => { v.label.closeCallAgreeing = 0; }, "label.closeCallAgreeing"],
    ["a close call above a clear answer", (v: any) => { v.label.closeCallAgreeing = 4; }, "label"],
    ["a clear answer above the judges", (v: any) => { v.label.clearAgreeing = 4; v.label.closeCallAgreeing = 2; }, "label"],
    ["five reserve answers", (v: any) => { v.answerCheck.candidates = 5; }, "answerCheck.candidates"],
    ["an unknown key in the answer check", (v: any) => { v.answerCheck.extra = 1; }, "answerCheck"],
    ["a missing label", (v: any) => { delete v.label; }, "label"]
  ])("refuses %s, naming the path", (_name, mutate, path) => {
    const value = plain();
    mutate(value);
    expect(() => parseEngineVersionPolicy(value)).toThrowError(refusal(path));
  });

  it.each([[7], [null], [[]], ["ENGINE"]])("refuses %j at the root", (value) => {
    expect(() => parseEngineVersionPolicy(value)).toThrowError(refusal("$"));
  });

  it("refuses an own __proto__ key by its dotted path, never drops it", () => {
    const inJudges = JSON.stringify(START).replace('"judges":{', '"judges":{"__proto__":{"count":9},');
    expect(() => parseEngineVersionPolicy(JSON.parse(inJudges))).toThrowError(refusal("judges.__proto__"));
    const inTerm = JSON.stringify(START).replace('{"metric":', '{"__proto__":{},"metric":');
    expect(() => parseEngineVersionPolicy(JSON.parse(inTerm))).toThrowError(refusal("scoring.terms.0.__proto__"));
  });

  it("accepts weights within 0.001 of one and refuses them just outside", () => {
    const inside = plain();
    inside.scoring.terms[0].coefficient = 0.143657; // the seven sum to 1.000799
    expect(parseEngineVersionPolicy(inside).scoring.terms[0]?.coefficient).toBe(0.143657);
    const outside = plain();
    outside.scoring.terms[0].coefficient = 0.144; // the seven sum to 1.001142
    expect(() => parseEngineVersionPolicy(outside)).toThrowError(refusal("scoring.terms"));
  });
});

describe("engineVersionPolicy: row, read, in force", () => {
  it("the row a publisher seals is canonical JSON, parses back, and a blank source ref is refused", () => {
    const row = engineVersionPolicyRow(START, "spec 2026-10-15 §3.4");
    expect(row.rowKey).toBe("engineVersionPolicy");
    expect(row.sourceRef).toBe("spec 2026-10-15 §3.4");
    const terms = COMPOSITION_METRICS.map((metric) => `{"coefficient":0.142857,"metric":"${metric}"}`).join(",");
    expect(row.valueJsonText).toBe(
      '{"answerCheck":{"candidates":3},"engine":2,"investigate":{"maxPerDebate":2},'
      + '"judges":{"count":3,"makerRule":"PREFER_NON_ARGUING_ELSE_IGNORE_OWN"},"kind":"ENGINE_VERSION_POLICY",'
      + '"label":{"clearAgreeing":3,"closeCallAgreeing":2},'
      + '"links":{"cannotAssessWeight":0.66,"ownReplyCountsAsSupport":false,"rivalReplies":"EQUAL"},'
      + '"scoring":{"clarityDecayPerAmbiguity":0.1,"combine":"MEDIAN","disputedWeight":0.7,'
      + '"fatalCap":{"minFlagSeverity":0.5,"to":0.3},"fidelityFloor":{"below":0.5,"to":0.5},'
      + `"terms":[${terms}]},"version":1}`);
    expect(parseEngineVersionPolicy(JSON.parse(row.valueJsonText))).toEqual(START);
    expect(engineVersionPolicyRow({ ...START, enabled: false }, "t").valueJsonText).toContain('"enabled":false');
    expect(() => engineVersionPolicyRow(START, " ")).toThrowError(refusal("sourceRef"));
  });

  it("reads ABSENT as null, a row as the policy, and a malformed row as a refusal", async () => {
    const absent = poolReturning([]);
    await expect(readEngineVersionPolicy(absent.pool, 14)).resolves.toBeNull();
    expect(absent.calls).toEqual([[14, "engineVersionPolicy"]]);
    await expect(readEngineVersionPolicy(poolReturning([{ value_json: plain() }]).pool, 14)).resolves.toEqual(START);
    await expect(readEngineVersionPolicy(poolReturning([{ value_json: { kind: "ENGINE_VERSION_POLICY" } }]).pool, 14))
      .rejects.toThrowError(/^ENGINE_VERSION_POLICY_INVALID:/u);
  });

  it("enabled:false reads as no row on the ask side; absent or true is the row", () => {
    expect(engineInForce(null)).toBeNull();
    expect(engineInForce(START)).toBe(START);
    const on = parseEngineVersionPolicy({ ...plain(), enabled: true });
    expect(engineInForce(on)).toBe(on);
    const off = parseEngineVersionPolicy({ ...plain(), enabled: false });
    expect(off.enabled).toBe(false);
    expect(engineInForce(off)).toBeNull();
  });
});
