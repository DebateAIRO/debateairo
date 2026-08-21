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
