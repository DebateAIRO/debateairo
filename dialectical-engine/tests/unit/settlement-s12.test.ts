import { describe, expect, it } from "vitest";
import { selectReducedJudgement } from "@debateai/judgement";
import {
  deriveScorecardCell,
  deriveDisagreementRateMonitor,
  recordProperScore,
  resolveScorecardTaskClass,
  routeServedLane,
  SCORECARD_BASES,
  type CalibrationStrategy,
  type RecordedProperScore,
  type RegisteredProperScore
} from "@debateai/settlement";

const properScore: RegisteredProperScore = Object.freeze({
  rowKey: "test-layer:proper-score",
  registerVersion: 404_012,
  sourceRef: "test-layer:FX-S22-03",
  score(input: { readonly prior: number; readonly posterior: number; readonly resolvedOutcome: boolean }) {
    const error = input.posterior - (input.resolvedOutcome ? 1 : 0);
    const total = 1 - error * error;
    return Object.freeze({ total, reliability: total, resolution: 0, uncertainty: 0 });
  }
});

const calibration: CalibrationStrategy = Object.freeze({
  rowKey: "test-layer:calibration",
  registerVersion: 404_012,
  sourceRef: "test-layer:FX-S22-03",
  deriveValue: (scores: readonly RecordedProperScore[]) => scores.reduce((sum: number, score: RecordedProperScore) => sum + score.total, 0) / scores.length,
  deriveInterval: (scores: readonly RecordedProperScore[]) => {
    const values = scores.map((score) => score.total);
    return Object.freeze({ lower: Math.min(...values), upper: Math.max(...values) });
  }
});

describe("S12 / FX-S22-03 / FX-LG-10 — ledger-derived scorecards", () => {
  it("resolves the DR-080 pair only from a provenance-carrying supplied map", () => {
    const receipt = Object.freeze({
      rowKey: "test-layer:scorecard-task-class-map",
      registerVersion: 404_012,
      sourceRef: "test-layer:VG-02-deferred-values",
      entries: Object.freeze([
        Object.freeze({ settlementAct: "act:test", questionType: "type:test", taskClass: "class:test" })
      ])
    });
    expect(resolveScorecardTaskClass("act:test", "type:test", receipt)).toBe("class:test");
    expect(() => resolveScorecardTaskClass("missing", "type:test", receipt)).toThrow("SCORECARD_TASK_CLASS_UNRESOLVED");
  });

  it("records VR-1 as a descriptive monitor without inventing a kill threshold", () => {
    expect(deriveDisagreementRateMonitor([], 0.2)).toEqual({
      observedRate: null, declaredPrice: 0.2, absoluteDifference: null, n: 0, basis: "NONE"
    });
    expect(deriveDisagreementRateMonitor([true, false, false, false, false], 0.2)).toEqual({
      observedRate: 0.2, declaredPrice: 0.2, absoluteDifference: 0, n: 5, basis: "MEASURED_PROCESS"
    });
  });

  it("keeps t=0 honestly absent and moves a weight after one labeled synthetic settlement", () => {
    const key = {
      modelId: "model:test-layer",
      modelVersion: "version:test-layer:1",
      provider: "provider:test-layer",
      taskClass: "class:test-layer",
      metric: "judge_weight",
      asOf: "2026-08-08T00:00:00.000Z"
    } as const;
    const cold = deriveScorecardCell([], key, calibration);
    expect(cold).toMatchObject({ basis: "NONE", value: null, n: 0, interval: null });

    const scored = recordProperScore({
      outcomeRef: "outcome:test-layer:1",
      modelId: key.modelId,
      modelVersion: key.modelVersion,
      provider: key.provider,
      taskClass: key.taskClass,
      prior: 0.5,
      posterior: 0.8,
      resolvedOutcome: true,
      ledgerSequence: 17,
      definition: properScore
    });
    const learned = deriveScorecardCell([scored], key, calibration);
    expect(learned.basis).toBe("MEASURED_OUTCOME");
    expect(learned.value).not.toBe(cold.value);
    expect(learned.n).toBe(1);
    expect(learned.derivationInput).toEqual(["outcome:test-layer:1@17"]);
    expect(deriveScorecardCell([scored], key, calibration)).toEqual(learned);
    expect(SCORECARD_BASES).toEqual(["MEASURED_OUTCOME", "MEASURED_PROCESS", "EXTERNAL_BENCHMARK", "NONE"]);
  });

  it("wakes a cell on model-version identity instead of carrying a prior version forward", () => {
    const scored = recordProperScore({
      outcomeRef: "outcome:test-layer:versioned",
      modelId: "model:test-layer",
      modelVersion: "v1",
      provider: "provider:test-layer",
      taskClass: "class:test-layer",
      prior: 0.4,
      posterior: 0.9,
      resolvedOutcome: true,
      ledgerSequence: 19,
      definition: properScore
    });
    const shared = { modelId: "model:test-layer", provider: "provider:test-layer", taskClass: "class:test-layer", metric: "judge_weight", asOf: "2026-08-08T00:00:00.000Z" } as const;
    expect(deriveScorecardCell([scored], { ...shared, modelVersion: "v1" }, calibration).basis).toBe("MEASURED_OUTCOME");
    expect(deriveScorecardCell([scored], { ...shared, modelVersion: "v2" }, calibration)).toMatchObject({ basis: "NONE", value: null, n: 0 });
  });
});

describe("S12 / FX-LG-09 / FX-ORPH-05 — eight guarded routing strategies", () => {
  const policy = Object.freeze({
    rowKey: "test-layer:routing-policy",
    registerVersion: 404_012,
    sourceRef: "test-layer:FX-LG-09",
    explorationShare: 0.2,
    departNeutralMinimumN: 30,
    hardRoutingMinimumN: 293,
    multiplicityControl: "INTERVAL_OVERLAP_FALLBACK" as const
  });
  const candidates = Object.freeze([
    Object.freeze({ modelId: "model:a", modelVersion: "v1", provider: "provider:a", n: 293, value: 0.75, interval: Object.freeze({ lower: 0.7, upper: 0.8 }) }),
    Object.freeze({ modelId: "model:b", modelVersion: "v1", provider: "provider:b", n: 293, value: 0.55, interval: Object.freeze({ lower: 0.5, upper: 0.6 }) })
  ]);

  it("is byte-for-byte fallback-equivalent at t=0 and exposes both producible branches", () => {
    const empty = routeServedLane({ taskClass: "class:test-layer", lane: "SERVED", candidates: [], fallbackModelId: "model:fallback", explorationDraw: 0.9, policy });
    expect(empty).toEqual(routeServedLane({ taskClass: "class:test-layer", lane: "SERVED", candidates: [], fallbackModelId: "model:fallback", explorationDraw: 0.9, policy }));
    expect(empty).toMatchObject({ kind: "FALLBACK", selectedModelId: "model:fallback", propensity: 1 });

    const learned = routeServedLane({ taskClass: "class:test-layer", lane: "SERVED", candidates, fallbackModelId: "model:fallback", explorationDraw: 0.9, policy });
    const exploration = routeServedLane({ taskClass: "class:test-layer", lane: "SERVED", candidates, fallbackModelId: "model:fallback", explorationDraw: 0.1, policy });
    expect(learned).toMatchObject({ kind: "LEARNED", selectedModelId: "model:a", propensity: 0.8 });
    expect(exploration).toMatchObject({ kind: "EXPLORATION", selectedModelId: "model:b", propensity: 0.2 });
    expect(learned.guardTrail.map((guard) => guard.guard)).toEqual(["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"]);
  });

  it("keeps panel uniform, critic exempt, overlapping intervals on fallback, and self-routing forbidden", () => {
    expect(routeServedLane({ taskClass: "class:test-layer", lane: "PANEL", candidates, fallbackModelId: "model:fallback", explorationDraw: 0.9, policy }).kind).toBe("UNIFORM_PANEL");
    expect(routeServedLane({ taskClass: "class:test-layer", lane: "CRITIC", candidates, fallbackModelId: "model:fallback", explorationDraw: 0.9, policy }).kind).toBe("CRITIC_EXEMPT");
    expect(routeServedLane({ taskClass: "class:test-layer", lane: "SERVED", candidates: [candidates[0]!, { ...candidates[1]!, interval: { lower: 0.72, upper: 0.78 } }], fallbackModelId: "model:fallback", explorationDraw: 0.9, policy }).kind).toBe("FALLBACK");
    expect(() => routeServedLane({ taskClass: "class:test-layer", lane: "SERVED", candidates, fallbackModelId: "model:fallback", explorationDraw: 0.9, policy, scorerModelId: "model:a" })).toThrow("SELF_ROUTING_FORBIDDEN");
  });
});

describe("S12 / FX-PT-D5 — constant-1.0 MUST-DIFFER", () => {
  it("changes the served selection when ledger-earned weights replace constant weights", () => {
    const rule = { kind: "MAXIMIZE_WEIGHTED_TAU" as const, rowKey: "test-layer:selection", registerVersion: 404_012, sourceRef: "test-layer:FX-PT-D5" };
    const constant = selectReducedJudgement([
      { judgementRef: "judge:a", tau: 0.9, effectiveWeight: 1 },
      { judgementRef: "judge:b", tau: 0.7, effectiveWeight: 1 }
    ], rule);
    const learned = selectReducedJudgement([
      { judgementRef: "judge:a", tau: 0.9, effectiveWeight: 0.1 },
      { judgementRef: "judge:b", tau: 0.7, effectiveWeight: 1 }
    ], rule);
    expect(constant).toMatchObject({ kind: "SELECTED", selectedJudgementRef: "judge:a", tau: 0.9 });
    expect(learned).toMatchObject({ kind: "SELECTED", selectedJudgementRef: "judge:b", tau: 0.7 });
  });
});
