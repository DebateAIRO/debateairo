import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  CONVERGENCE_EPSILON_ROW_KEY,
  CONVERGENCE_STOP_DEFAULTS_ROW_KEY,
  RUN_COST_ENVELOPE_ROW_KEY,
  readConvergenceControls,
  readRunCostEnvelopePolicy,
  resolveRunCostEnvelopeBasis
} from "@debateai/register";

function poolReturning(rows: readonly Record<string, unknown>[]): Pool {
  return {
    query: async () => ({ rows })
  } as unknown as Pool;
}

describe("S09 register authorities", () => {
  it("resolves the cost envelope from an exact depth/risk member and prints provenance", async () => {
    const row = await readRunCostEnvelopePolicy(poolReturning([{
      row_key: RUN_COST_ENVELOPE_ROW_KEY,
      value_json: {
        kind: "RUN_COST_ENVELOPE_POLICY",
        members: [{
          depth_params: { depth: 1 },
          risk_tier: "standard",
          max_model_attempts: 7
        }]
      },
      source_ref: "test-layer:run-cost-envelope"
    }]), 3);
    expect(resolveRunCostEnvelopeBasis(row, {
      depthParams: { depth: 1 },
      riskTier: "standard"
    })).toEqual({
      max_model_attempts: 7,
      register_row_key: RUN_COST_ENVELOPE_ROW_KEY,
      register_version: 3,
      source_ref: "test-layer:run-cost-envelope",
      derived_from: { depth_params: { depth: 1 }, risk_tier: "standard" }
    });
  });

  it("fails loudly when no ratified envelope member matches", async () => {
    const row = await readRunCostEnvelopePolicy(poolReturning([{
      row_key: RUN_COST_ENVELOPE_ROW_KEY,
      value_json: {
        kind: "RUN_COST_ENVELOPE_POLICY",
        members: [{ depth_params: { depth: 1 }, risk_tier: "casual", max_model_attempts: 2 }]
      },
      source_ref: "test-layer:run-cost-envelope"
    }]), 1);
    expect(() => resolveRunCostEnvelopeBasis(row, {
      depthParams: { depth: 2 }, riskTier: "casual"
    })).toThrowError(expect.objectContaining({ code: "RUN_COST_ENVELOPE_MEMBER_UNRESOLVED" }));
  });

  it("reads H8 epsilon and one consolidated typed defaults row without supplying defaults", async () => {
    const controls = await readConvergenceControls(poolReturning([
      {
        row_key: CONVERGENCE_EPSILON_ROW_KEY,
        value_json: { kind: "CONVERGENCE_EPSILON", epsilon: 0.03 },
        source_ref: "test-layer:convergence-epsilon"
      },
      {
        row_key: CONVERGENCE_STOP_DEFAULTS_ROW_KEY,
        value_json: { kind: "CONVERGENCE_STOP_DEFAULTS", members: { rounds: 4 } },
        source_ref: "test-layer:convergence-defaults"
      }
    ]), 5);
    expect(controls).toMatchObject({
      registerVersion: 5,
      epsilon: 0.03,
      defaults: { rounds: 4 },
      epsilonSourceRef: "test-layer:convergence-epsilon",
      defaultsSourceRef: "test-layer:convergence-defaults"
    });
  });
});
