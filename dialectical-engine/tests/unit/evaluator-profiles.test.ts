import { describe, expect, it } from "vitest";
import {
  deriveEvaluatorProfiles,
  selectJudgesByBiasRank,
  type EvaluatorProfileObservation
} from "../../packages/evaluator/src/index.js";

const AS_OF = new Date("2026-08-15T18:00:00.000Z");

function observation(
  overrides: Partial<EvaluatorProfileObservation> & Pick<EvaluatorProfileObservation, "observationId" | "runId">
): EvaluatorProfileObservation {
  const { observationId, runId, ...rest } = overrides;
  return {
    observationId,
    runId,
    provider: "provider:test",
    modelId: "model:author",
    modelVersion: "v1",
    domainId: "domain:test",
    step: "AUTHORING",
    metric: "prowess.outcome.v1",
    value: 0.8,
    outcome: null,
    truthBasis: "CONSENSUS",
    sourceKind: "NODE_STRENGTH",
    sourceRef: overrides.observationId,
    supersedesObservationId: null,
    itemKey: null,
    subjectMaker: null,
    authorMaker: null,
    posterior: null,
    observedAt: new Date("2026-08-15T12:00:00.000Z"),
    atSequence: 1,
    ...rest
  };
}

describe("deterministic evaluator profile derivation", () => {
  it("replaces superseded consensus evidence and never mixes strength with settlement semantics", () => {
    const result = deriveEvaluatorProfiles({
      observations: [
        observation({ observationId: "consensus:replaced", runId: "run:1", value: 0.9 }),
        observation({
          observationId: "settlement:replacement",
          runId: "run:1",
          truthBasis: "SETTLEMENT",
          sourceKind: "EXTERNAL_ANSWER_OUTCOME",
          value: 0,
          supersedesObservationId: "consensus:replaced",
          atSequence: 2
        }),
        observation({ observationId: "consensus:active", runId: "run:2", value: 0.6, atSequence: 3 })
      ],
      asOf: AS_OF,
      derivationVersion: 1
    });

    expect(result.prowessCells.map((cell) => ({ metric: cell.metric, value: cell.value, n: cell.n })))
      .toEqual([
        { metric: "prowess.consensus-strength.v1", value: 0.6, n: 1 },
        { metric: "prowess.settlement-outcome.v1", value: 0, n: 1 }
      ]);
    expect(result.prowessCells.flatMap((cell) => cell.derivationInput))
      .not.toContain("consensus:replaced@1");
  });

  it("keeps derivation versions independent and exposes sample counts and pinned intervals", () => {
    const inputs = [
      observation({ observationId: "strength:1", runId: "run:1", value: 0.2 }),
      observation({ observationId: "strength:2", runId: "run:2", value: 0.8, atSequence: 2 })
    ];
    const v1 = deriveEvaluatorProfiles({ observations: inputs, asOf: AS_OF, derivationVersion: 1 });
    const v2 = deriveEvaluatorProfiles({ observations: inputs, asOf: AS_OF, derivationVersion: 2 });

    expect(v1.prowessCells[0]).toMatchObject({ value: 0.5, n: 2, derivationVersion: 1 });
    expect(v1.prowessCells[0]!.intervalLower).toBeLessThanOrEqual(0.5);
    expect(v1.prowessCells[0]!.intervalUpper).toBeGreaterThanOrEqual(0.5);
    expect(v2.prowessCells[0]!.derivationVersion).toBe(2);
    expect(v2.prowessCells[0]!.derivationHash).not.toBe(v1.prowessCells[0]!.derivationHash);
  });

  it("derives v2 quality ranks only from evidence that measures quality", () => {
    const result = deriveEvaluatorProfiles({
      observations: [
        observation({ observationId: "strength:a:1", runId: "run:a", value: 0.2, itemKey: "node:1" }),
        observation({ observationId: "strength:a:2", runId: "run:a", value: 0.8, itemKey: "node:2", atSequence: 2 }),
        observation({ observationId: "strength:b", runId: "run:b", value: 1, itemKey: "node:3", atSequence: 3 }),
        observation({
          observationId: "settlement:false-correct", runId: "run:c", value: 0,
          truthBasis: "SETTLEMENT", sourceKind: "EXTERNAL_ANSWER_OUTCOME", posterior: 0.1,
          atSequence: 4
        }),
        observation({
          observationId: "tau:judge", runId: "run:d", provider: "provider:judge",
          modelId: "model:judge", step: "JUDGING", sourceKind: "REDUCED_JUDGEMENT",
          metric: "judging.tau.v1", value: 0.9, atSequence: 5
        }),
        observation({
          observationId: "grade:judge", runId: "run:d", provider: "provider:judge",
          modelId: "model:judge", step: "JUDGING", sourceKind: "BLIND_JUDGE_GRADE",
          truthBasis: "BLIND_ADDON", metric: "judging.blind-grade.v1", value: 0.7,
          atSequence: 6
        }),
        observation({
          observationId: "review:agree", runId: "run:e", provider: "provider:reviewer",
          modelId: "model:reviewer", step: "REVIEWING", sourceKind: "NODE_REVIEW",
          metric: "reviewing.outcome.v1", value: null, outcome: "agree", authorMaker: "maker:author",
          atSequence: 7
        })
      ],
      asOf: AS_OF,
      derivationVersion: 2
    });

    expect(result.prowessCells.map((cell) => ({
      modelId: cell.modelId, metric: cell.metric, value: cell.value, n: cell.n
    }))).toEqual([
      { modelId: "model:author", metric: "prowess.consensus-strength.v1", value: 0.75, n: 2 },
      { modelId: "model:author", metric: "prowess.forecast-accuracy.v2", value: 0.99, n: 1 },
      { modelId: "model:judge", metric: "process.judging-tau.v2", value: 0.9, n: 1 },
      { modelId: "model:judge", metric: "prowess.judging-quality.v2", value: 0.7, n: 1 },
      { modelId: "model:reviewer", metric: "process.review-agreement.v2", value: 1, n: 1 }
    ]);
    expect(result.prowessRanks.map((rank) => ({ modelId: rank.modelId, metric: rank.metric })))
      .toEqual([
        { modelId: "model:author", metric: "prowess.consensus-strength.v1" },
        { modelId: "model:author", metric: "prowess.forecast-accuracy.v2" },
        { modelId: "model:judge", metric: "prowess.judging-quality.v2" }
      ]);
    expect(result.judgeRanks).toEqual([
      expect.objectContaining({
        modelId: "model:judge", metric: "judging.quality-rank.v2", score: 0.7, n: 1,
        intervalLower: 0, intervalUpper: 1
      })
    ]);
  });

  it("does not rank unsupported v2 judging, reviewing, or settlement observations", () => {
    const result = deriveEvaluatorProfiles({
      observations: [
        observation({
          observationId: "tau", runId: "run:1", step: "JUDGING",
          sourceKind: "REDUCED_JUDGEMENT", value: 0.95
        }),
        observation({
          observationId: "review", runId: "run:1", step: "REVIEWING",
          sourceKind: "NODE_REVIEW", value: null, outcome: "agree", authorMaker: "maker:author",
          atSequence: 2
        }),
        observation({
          observationId: "settlement:no-posterior", runId: "run:1", sourceKind: "EXTERNAL_ANSWER_OUTCOME",
          truthBasis: "SETTLEMENT", value: 1, posterior: null, atSequence: 3
        })
      ],
      asOf: AS_OF,
      derivationVersion: 2
    });

    expect(result.prowessCells.map((cell) => cell.metric)).toEqual([
      "process.judging-tau.v2", "process.review-agreement.v2"
    ]);
    expect(result.judgeRanks).toEqual([]);
    expect(result.prowessRanks).toEqual([]);
  });

  it("preserves the explicit v1 tau, agreement, and settlement ranking semantics", () => {
    const result = deriveEvaluatorProfiles({
      observations: [
        observation({
          observationId: "tau", runId: "run:1", step: "JUDGING",
          sourceKind: "REDUCED_JUDGEMENT", value: 0.9
        }),
        observation({
          observationId: "review", runId: "run:1", step: "REVIEWING",
          sourceKind: "NODE_REVIEW", value: null, outcome: "agree", authorMaker: "maker:author",
          atSequence: 2
        }),
        observation({
          observationId: "settlement", runId: "run:1", sourceKind: "EXTERNAL_ANSWER_OUTCOME",
          truthBasis: "SETTLEMENT", value: 0, posterior: 0.1, atSequence: 3
        })
      ],
      asOf: AS_OF,
      derivationVersion: 1
    });

    expect(result.prowessRanks.map((rank) => ({ metric: rank.metric, score: rank.score })))
      .toEqual([
        { metric: "prowess.settlement-outcome.v1", score: 0 },
        { metric: "prowess.judging-tau.v1", score: 0.9 },
        { metric: "prowess.review-outcome.v1", score: 1 }
      ]);
  });
});

describe("isolated unbound judge selector", () => {
  it("rank-and-selects only healthy eligible makers without weight multipliers", () => {
    const selected = selectJudgesByBiasRank({
      seatCount: 2,
      candidates: [
        { provider: "p", modelId: "a", modelVersion: "v1", maker: "maker:a", healthy: true },
        { provider: "p", modelId: "b", modelVersion: "v1", maker: "maker:b", healthy: true },
        { provider: "p", modelId: "c", modelVersion: "v1", maker: "maker:c", healthy: false }
      ],
      ranks: [
        { provider: "p", modelId: "b", modelVersion: "v1", ordinal: 1 },
        { provider: "p", modelId: "a", modelVersion: "v1", ordinal: 2 }
      ],
      excludedMakers: ["maker:a"],
      numericInputProducerIdentities: []
    });

    expect(selected).toEqual([
      { provider: "p", modelId: "b", modelVersion: "v1", maker: "maker:b", healthy: true }
    ]);
  });

  it("rejects self-routing inputs", () => {
    expect(() => selectJudgesByBiasRank({
      seatCount: 1,
      candidates: [{ provider: "p", modelId: "a", modelVersion: "v1", maker: "maker:a", healthy: true }],
      ranks: [{ provider: "p", modelId: "a", modelVersion: "v1", ordinal: 1 }],
      excludedMakers: [],
      numericInputProducerIdentities: [{ provider: "p", modelId: "a", modelVersion: "v1" }]
    })).toThrow("SELF_ROUTING_FORBIDDEN");
  });
});
