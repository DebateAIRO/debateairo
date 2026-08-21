import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import {
  CONVERGENCE_EPSILON_ROW_KEY,
  CONVERGENCE_STOP_DEFAULTS_ROW_KEY,
  computeStructuralCeilingBasis,
  readConvergenceControls,
  readPanelDiscoveryPolicy
} from "@debateai/register";

function poolReturning(rows: readonly Record<string, unknown>[]): Pool {
  return {
    query: async () => ({ rows })
  } as unknown as Pool;
}

describe("S09 register authorities", () => {
  it("computes a structural ceiling without a ratified member table", () => {
    expect(computeStructuralCeilingBasis({
      panelSize: 2, depth: 1, judgeMaxAttempts: 3, organMaxAttempts: 3,
      maxRecompose: 2, maxCooldownHoldsPerRun: 2, finalRetryAttempts: 1,
      branchingFactor: 2, compositionSegmentCap: 2, fixedOrgansPerComposition: 4
    })).toMatchObject({ kind: "COMPUTED_STRUCTURAL_CEILING", max_model_attempts: 88, panel_size: 2, depth: 1 });
  });

  it("reads DR-182 discovery freshness and the one-attempt bound", async () => {
    await expect(readPanelDiscoveryPolicy(poolReturning([{
      value_json: { kind: "PANEL_DISCOVERY_POLICY", probe_freshness_ms: 600_000, probe_max_attempts: 1 },
      source_ref: "acceptance:DR-182:V-approved"
    }]), 1)).resolves.toMatchObject({ probeFreshnessMs: 600_000, probeMaxAttempts: 1 });
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
