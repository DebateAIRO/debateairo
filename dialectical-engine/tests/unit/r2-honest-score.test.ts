// tests/unit/r2-honest-score.test.ts
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  compositionMetricsOf, honestDisagreementRecord, honestDisputeFactor, honestGrade, honestMedian, honestPointScore,
  honestSelectionRule, judgeAssessmentSchema, reduceAssessment,
  type CompositionMapRegisterRow, type CompositionMetric, type HonestGrade, type HonestVoice, type JudgeAssessment
} from "@debateai/judgement";
import {
  COMPOSITION_METRICS, engineVersionPolicyStartValues, type CompositionMetricName, type EngineScoring
} from "@debateai/register";

/** Engine redesign R2 (spec 2026-10-15 §4.2, E7, E10): honest grades, the median without the author, the dispute factor. */
const START: EngineScoring = engineVersionPolicyStartValues().scoring;

type Over = Readonly<{ fidelity?: number; counter?: number; quality?: number; relevance?: number; fit?: number;
  ambiguity?: number; severity?: number; fatal?: readonly number[]; fatalType?: string }>;
/** Defaults give the seven measures 0.8, 0.7, 0.6, 0.9, 0.8, 0.8, 0.9 (sum 5.5). */
const assessment = (over: Over = {}): JudgeAssessment => judgeAssessmentSchema.parse({
  steelman: { summary: "The point, restated.", fidelity: over.fidelity ?? 0.8 },
  critic: { summary: "The best counter.", counterargumentStrength: over.counter ?? 0.3, basis: "REAL_ATTACK" },
  evidence: { quality: over.quality ?? 0.6, relevance: over.relevance ?? 0.9 },
  context: { fit: over.fit ?? 0.8, ambiguityFlags: Array.from({ length: over.ambiguity ?? 2 }, (_, index) => `unclear term ${String(index + 1)}`) },
  fallacy: { severity: over.severity ?? 0.1, fatalFlags: (over.fatal ?? []).map((severity) => ({
    type: over.fatalType ?? "false dichotomy", severity, description: "The point offers only two options." })) }
});
const rowOf = (terms: readonly Readonly<{ metric: CompositionMetric; coefficient: number }>[]): CompositionMapRegisterRow => ({
  rowKey: "claimTypeCompositionMap", registerVersion: 1, sourceRef: "test-layer:r2",
  value: { kind: "CLAIM_TYPE_COMPOSITION_MAP", entries: { unknown: {
    branch: "EVIDENCE_AWARE", clarityDecayPerAmbiguity: 0.1, terms: [...terms], caps: [],
    uncertaintyLadder: [{ atMost: 1, label: "PROVISIONAL" }] } } }
});
const graded = (grade: number): HonestGrade => ({ grade, weighted: grade, caps: [], metrics: compositionMetricsOf(assessment(), 0.1) });
const voice = (judgementRef: string, maker: string, grade: number, isAuthor = false): HonestVoice =>
  ({ judgementRef, maker, isAuthor, grade: graded(grade) });

describe("the seven measures, shared by engine 1 and engine 2", () => {
  it("reads them exactly as the composition reduction does, in the composition row's order", () => {
    const metrics = compositionMetricsOf(assessment(), 0.1);
    expect(metrics).toEqual({ steelman_fidelity: 0.8, counter_resilience: 0.7, evidence_quality: 0.6, evidence_relevance: 0.9,
      context_fit: 0.8, clarity: 0.8, fallacy_resilience: 0.9 });
    expect(Object.keys(metrics)).toEqual([...COMPOSITION_METRICS]);
    for (const metric of COMPOSITION_METRICS) {
      const reduced = reduceAssessment({ claimType: "unknown", assessment: assessment(), compositionRow: rowOf([{ metric, coefficient: 1 }]), reducerVersion: "test-layer:r2" });
      expect(reduced.kind === "REDUCED" ? reduced.tau : null, metric).toBe(metrics[metric]);
    }
  });

  it("gives engine 1's composition and engine 2's weighted grade the same number for the same terms", () => {
    for (const over of [{}, { fidelity: 0.3, ambiguity: 9, severity: 0.95 }, { counter: 1, quality: 0, fit: 0.05 }] as const) {
      const reduced = reduceAssessment({ claimType: "unknown", assessment: assessment(over), compositionRow: rowOf(START.terms), reducerVersion: "test-layer:r2" });
      expect(reduced.kind === "REDUCED" ? reduced.tau : null).toBe(honestGrade(assessment(over), START).weighted);
    }
  });

  it("names the register's measures with judgement's own type", () => {
    // A compile-time row: `vitest run` passes it whatever the types are; Step 5's `pnpm run typecheck` checks it (pre-flight PF-R2a2.2).
    expectTypeOf<CompositionMetricName>().toEqualTypeOf<CompositionMetric>();
  });
});

describe("honestGrade (E7)", () => {
  it("weighs the seven measures equally at the start, with no cap", () => {
    const grade = honestGrade(assessment(), START);
    expect(grade.weighted).toBeCloseTo(5.5 * 0.142857, 12);
    expect(grade.grade).toBe(grade.weighted);
    expect(grade.caps).toEqual([]);
  });

  it("caps at the fatal cap a flag of the row's severity or more, whatever the flag's words; a milder flag does not", () => {
    expect(honestGrade(assessment({ fatal: [0.5] }), START)).toMatchObject({ grade: 0.3, caps: ["FATAL"] });
    expect(honestGrade(assessment({ fatal: [0.2, 0.9], fatalType: "ad hominem (imputed motive)" }), START)).toMatchObject({ grade: 0.3, caps: ["FATAL"] });
    expect(honestGrade(assessment({ fatal: [0.49] }), START).caps).toEqual([]);
    // The overall fallacy severity lowers a measure, never caps.
    expect(honestGrade(assessment({ severity: 0.95 }), START).caps).toEqual([]);
  });

  it("caps at the fidelity floor a grader that could not restate the point", () => {
    const floored = honestGrade(assessment({ fidelity: 0.4 }), START);
    expect(floored.weighted).toBeCloseTo(5.1 * 0.142857, 12);
    expect(floored).toMatchObject({ grade: 0.5, caps: ["FIDELITY_FLOOR"] });
    expect(honestGrade(assessment({ fidelity: 0.5 }), START).caps).toEqual([]);
  });

  it("applies both caps, the lower one deciding", () => {
    expect(honestGrade(assessment({ fidelity: 0.4, fatal: [0.9] }), START)).toMatchObject({ grade: 0.3, caps: ["FATAL", "FIDELITY_FLOOR"] });
  });

  it("lists no cap that would not lower the grade, and never raises one", () => {
    const low = honestGrade(assessment({ fidelity: 0.2, counter: 0.9, quality: 0.1, relevance: 0.1, fit: 0.1, ambiguity: 9, severity: 0.9, fatal: [0.8] }), START);
    expect(low.caps).toEqual([]);
    expect(low.grade).toBe(low.weighted);
    expect(low.grade).toBeLessThan(0.3);
  });
});

describe("honestMedian and honestPointScore (E10)", () => {
  it("takes the middle grade, or the mean of the middle two, and refuses no grade at all", () => {
    expect(honestMedian([0.3])).toBe(0.3);
    expect(honestMedian([0.2, 0.9, 0.4])).toBe(0.4);
    expect(honestMedian([0.8, 0.2, 0.6, 0.4])).toBeCloseTo(0.5, 12);
    expect(() => honestMedian([])).toThrowError(expect.objectContaining({ code: "HONEST_MEDIAN_EMPTY" }));
  });

  it("scores a point by the other makers only, the median voice selected", () => {
    expect(honestPointScore([voice("author", "m0", 0.95, true), voice("a", "m1", 0.4), voice("b", "m2", 0.6), voice("c", "m3", 0.5)]))
      .toEqual({ score: 0.5, source: "OTHER_MAKERS", voices: 3, selectedJudgementRef: "c" });
  });

  it("with an even count, scores the mean of the middle two and selects the lower middle voice", () => {
    const score = honestPointScore([voice("author", "m0", 0.95, true), voice("a", "m1", 0.4), voice("b", "m2", 0.6)]);
    expect(score).toMatchObject({ source: "OTHER_MAKERS", voices: 2, selectedJudgementRef: "a" });
    expect(score?.score).toBeCloseTo(0.5, 12);
  });

  it("counts the author's grade only as the last resort, and nothing without a voice", () => {
    expect(honestPointScore([voice("author", "m0", 0.95, true)]))
      .toEqual({ score: 0.95, source: "AUTHOR_LAST_RESORT", voices: 1, selectedJudgementRef: "author" });
    expect(honestPointScore([])).toBeNull();
  });

  it("selects the first heard of two equal grades at the middle", () => {
    expect(honestPointScore([voice("x", "m1", 0.5), voice("y", "m2", 0.5), voice("z", "m3", 0.1)])?.selectedJudgementRef).toBe("x");
    expect(honestPointScore([voice("x", "m1", 0.5), voice("y", "m2", 0.5)])?.selectedJudgementRef).toBe("x");
  });
});

describe("the dispute factor, the selection rule and the record", () => {
  it("weighs a disputed point at the row's disputed weight, every other status at 1", () => {
    expect(honestDisputeFactor("DISPUTE", START)).toBe(0.7);
    for (const status of ["AGREE", "CANNOT_ASSESS", "NONE"] as const) expect(honestDisputeFactor(status, START)).toBe(1);
  });

  it("names engine 2's selection rule with complete provenance, and refuses an incomplete one", () => {
    expect(honestSelectionRule({ rowKey: "engineVersionPolicy", registerVersion: 7, sourceRef: "test-layer:r2" }))
      .toEqual({ kind: "ENGINE2_HONEST_MEDIAN", rowKey: "engineVersionPolicy", registerVersion: 7, sourceRef: "test-layer:r2" });
    expect(() => honestSelectionRule({ rowKey: "engineVersionPolicy", registerVersion: 7, sourceRef: " " })).toThrow("Register-row provenance is incomplete");
    expect(() => honestSelectionRule({ rowKey: "engineVersionPolicy", registerVersion: 0, sourceRef: "test-layer:r2" })).toThrow("Register-row provenance is incomplete");
  });

  it("records every voice's grade, weighted sum and caps beside the median and its source", () => {
    const capped = honestGrade(assessment({ fatal: [0.6] }), START);
    const plain = honestGrade(assessment(), START);
    const score = honestPointScore([{ judgementRef: "author", maker: "m0", isAuthor: true, grade: plain }, { judgementRef: "a", maker: "m1", isAuthor: false, grade: capped }])!;
    expect(honestDisagreementRecord([{ memberRole: "m0", grade: plain }, { memberRole: "m1", grade: capped }], score)).toEqual({
      voices: [{ memberRole: "m0", grade: plain.grade, weighted: plain.weighted, caps: [] },
        { memberRole: "m1", grade: 0.3, weighted: capped.weighted, caps: ["FATAL"] }],
      median: 0.3,
      source: "OTHER_MAKERS"
    });
  });
});
