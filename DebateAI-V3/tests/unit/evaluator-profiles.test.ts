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

  it("derives bias before judge-dependent prowess and changes judge rank from live inputs", () => {
    const judge = (id: string, runId: string, itemKey: string, value: number, maker: string,
      authorMaker: string, atSequence: number): EvaluatorProfileObservation => observation({
        observationId: id,
        runId,
        provider: "provider:judges",
        modelId: maker === "maker:a" ? "judge:a" : "judge:b",
        modelVersion: "judge-v1",
        step: "JUDGING",
        metric: "judging.tau.v1",
        value,
        sourceKind: "REDUCED_JUDGEMENT",
        itemKey,
        subjectMaker: maker,
        authorMaker,
        atSequence
      });
    const observations = [
      judge("judge:a:1", "run:1", "item:1", 0.9, "maker:a", "maker:a", 1),
      judge("judge:b:1", "run:1", "item:1", 0.4, "maker:b", "maker:a", 2),
      judge("judge:a:2", "run:2", "item:2", 0.9, "maker:a", "maker:c", 3),
      judge("judge:b:2", "run:2", "item:2", 0.1, "maker:b", "maker:c", 4),
      observation({
        observationId: "settlement:1", runId: "run:1", truthBasis: "SETTLEMENT",
        sourceKind: "EXTERNAL_ANSWER_OUTCOME", value: 0, atSequence: 5
      }),
      observation({
        observationId: "settlement:2", runId: "run:2", truthBasis: "SETTLEMENT",
        sourceKind: "EXTERNAL_ANSWER_OUTCOME", value: 0, atSequence: 6
      }),
      observation({
        observationId: "addon:a", runId: "run:2", provider: "provider:judges",
        modelId: "judge:a", modelVersion: "judge-v1", step: "JUDGING",
        metric: "judging.blind-grade.v1", truthBasis: "BLIND_ADDON",
        sourceKind: "BLIND_JUDGE_GRADE", value: 0.25, subjectMaker: "maker:a", atSequence: 7
      })
    ];

    const result = deriveEvaluatorProfiles({ observations, asOf: AS_OF, derivationVersion: 1 });
    const contradiction = result.biasCells.find((cell) =>
      cell.modelId === "judge:a" && cell.metric === "bias.settlement_contradiction.v1");
    const leniency = result.biasCells.find((cell) =>
      cell.modelId === "judge:a" && cell.metric === "bias.leniency.v1");

    expect(result.phaseOrder).toEqual(["BIAS", "JUDGE_RANK", "PROWESS", "PROWESS_RANK"]);
    expect(leniency).toMatchObject({ value: 0.325, n: 2 });
    expect(contradiction).toMatchObject({ value: 1, n: 2 });
    expect(result.judgeRanks.map((rank) => rank.modelId)).toEqual(["judge:b", "judge:a"]);
    expect(result.prowessCells
      .filter((cell) => cell.step === "JUDGING")
      .flatMap((cell) => cell.derivationInput))
      .toEqual(expect.arrayContaining([expect.stringMatching(/^bias-rank:provider:judges\/judge:/)]));
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
