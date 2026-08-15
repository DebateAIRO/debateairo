import { describe, expect, it } from "vitest";
import {
  allocateEvaluatorSeatShare,
  type EvaluatorSeatShareCandidate,
  type EvaluatorSeatSharePolicy
} from "../../packages/evaluator/src/index.js";

const policy: EvaluatorSeatSharePolicy = {
  rowKey: "evaluatorSeatSharePolicy",
  registerVersion: 7,
  sourceRef: "test:seat-share-policy:v1",
  formulaVersion: 1,
  premiumMinimumDepth: 3,
  shares: {
    premium: { best: 0.8, runnerUp: 0.2, residual: 0 },
    normal: { best: 0.6, runnerUp: 0.3, residual: 0.1 },
    bestAlsoCheaper: { best: 0.8, runnerUp: 0.15, residual: 0.05 }
  }
};

function candidate(
  modelId: string,
  prowessOrdinal: number,
  relativeCost: number | null
): EvaluatorSeatShareCandidate {
  return {
    provider: "provider:test",
    modelId,
    modelVersion: "v1",
    maker: `maker:${modelId}`,
    healthy: true,
    prowessOrdinal,
    relativeCost,
    costComparability: relativeCost === null ? "UNKNOWN" : "COMPARABLE"
  };
}

describe("deterministic evaluator seat-share allocator", () => {
  it("assigns every requested seat to the sole eligible model for M=1", () => {
    const result = allocateEvaluatorSeatShare({
      requestedSeatCount: 7,
      riskTier: "standard",
      depth: 1,
      candidates: [candidate("only", 1, 0.7)],
      policy,
      numericInputProducerIdentities: []
    });

    expect(result).toMatchObject({
      formulaVersion: 1,
      selectedVector: "NORMAL",
      requestedSeatCount: 7,
      allocations: [{ modelId: "only", prowessOrdinal: 1, seatCount: 7 }]
    });
  });

  it("uses the premium best/runner-up vector for M=2 with hand-computable rounding", () => {
    const result = allocateEvaluatorSeatShare({
      requestedSeatCount: 10,
      riskTier: "high-stakes",
      depth: 3,
      candidates: [candidate("runner", 2, 0.2), candidate("best", 1, 0.8)],
      policy,
      numericInputProducerIdentities: []
    });

    expect(result.selectedVector).toBe("PREMIUM");
    expect(result.allocations.map(({ modelId, seatCount }) => ({ modelId, seatCount })))
      .toEqual([{ modelId: "best", seatCount: 8 }, { modelId: "runner", seatCount: 2 }]);
  });

  it("uses rank-three residual seats for M=3 and lets cheaper-best override both tiers", () => {
    const normal = allocateEvaluatorSeatShare({
      requestedSeatCount: 10,
      riskTier: "standard",
      depth: 2,
      candidates: [candidate("third", 3, 0.1), candidate("best", 1, 0.9), candidate("runner", 2, 0.4)],
      policy,
      numericInputProducerIdentities: []
    });
    expect(normal.selectedVector).toBe("NORMAL");
    expect(normal.allocations.map(({ modelId, seatCount }) => ({ modelId, seatCount })))
      .toEqual([
        { modelId: "best", seatCount: 6 },
        { modelId: "runner", seatCount: 3 },
        { modelId: "third", seatCount: 1 }
      ]);

    const cheaperBest = allocateEvaluatorSeatShare({
      requestedSeatCount: 20,
      riskTier: "high-stakes",
      depth: 4,
      candidates: [candidate("third", 3, 0.8), candidate("runner", 2, 0.5), candidate("best", 1, 0.1)],
      policy,
      numericInputProducerIdentities: []
    });
    expect(cheaperBest.selectedVector).toBe("BEST_ALSO_CHEAPER");
    expect(cheaperBest.allocations.map(({ modelId, seatCount }) => ({ modelId, seatCount })))
      .toEqual([
        { modelId: "best", seatCount: 16 },
        { modelId: "runner", seatCount: 3 },
        { modelId: "third", seatCount: 1 }
      ]);
  });

  it("is deterministic on identity ties, preserves a positive runner-up seat, and refuses self-routing", () => {
    const tied = [candidate("z", 1, null), candidate("a", 1, null)];
    const result = allocateEvaluatorSeatShare({
      requestedSeatCount: 2,
      riskTier: "standard",
      depth: 1,
      candidates: tied,
      policy,
      numericInputProducerIdentities: []
    });
    expect(result.allocations.map(({ modelId, seatCount }) => ({ modelId, seatCount })))
      .toEqual([{ modelId: "a", seatCount: 1 }, { modelId: "z", seatCount: 1 }]);

    expect(() => allocateEvaluatorSeatShare({
      requestedSeatCount: 2,
      riskTier: "standard",
      depth: 1,
      candidates: tied,
      policy,
      numericInputProducerIdentities: [{ provider: "provider:test", modelId: "a", modelVersion: "v1" }]
    })).toThrow("SELF_ROUTING_FORBIDDEN");
  });

  it("fails loud when a register-owned share vector is not a complete allocation", () => {
    expect(() => allocateEvaluatorSeatShare({
      requestedSeatCount: 10,
      riskTier: "standard",
      depth: 1,
      candidates: [candidate("best", 1, 0.8), candidate("runner", 2, 0.2)],
      policy: {
        ...policy,
        shares: { ...policy.shares, normal: { best: 0.6, runnerUp: 0.3, residual: 0.2 } }
      },
      numericInputProducerIdentities: []
    })).toThrow("EVALUATOR_SEAT_SHARE_VECTOR_INVALID:normal");
  });
});
