import { describe, expect, it } from "vitest";
import type { Pool } from "pg";
import * as arithmetic from "../../packages/published-arithmetic/src/index.js";
import {
  REPLAY_ISOLATION_PROOF,
  runLaunchReplayCeremony,
  validateOperatorAttestation
} from "../../apps/replay/src/index.js";

function replayPool(rows: readonly Record<string, unknown>[]): Pool {
  return { async query() { return { rows }; } } as unknown as Pool;
}

describe("FX-IND-01 / FX-IND-02 — replay isolation", () => {
  it("pins both the imported and exported arithmetic surface at symbol granularity", () => {
    expect(REPLAY_ISOLATION_PROOF).toEqual({
      workspaceImports: ["@debateai/published-arithmetic"],
      sharedSymbols: ["agg", "σ", "product"],
      localArithmeticSymbols: []
    });
    expect(Object.keys(arithmetic).sort()).toEqual(["agg", "product", "σ"].sort());
  });
});

describe("FX-IND-03 — operator attestation", () => {
  it("accepts only a named read-only principal replaying run ids it did not produce", () => {
    const attestation = validateOperatorAttestation({
      principal: "ci:independent-replay", credentialScope: "READ_ONLY",
      replayedRunIds: ["run:external"], producedRunIds: ["run:other"]
    });
    expect(attestation.replayedRunIds).toEqual(["run:external"]);
    expect(() => validateOperatorAttestation({
      principal: "ci:independent-replay", credentialScope: "READ_ONLY",
      replayedRunIds: ["run:same"], producedRunIds: ["run:same"]
    })).toThrow("REPLAY_OPERATOR_PRODUCED_RUN");
  });
});

describe("FX-LG-01b — exact launch replay ceremony", () => {
  const attestation = {
    principal: "ci:independent-replay", credentialScope: "READ_ONLY" as const,
    replayedRunIds: ["run:external"], producedRunIds: []
  };

  it("reads every structural outcome as frozen data and reproduces a recorded number byte-identically", async () => {
    const report = await runLaunchReplayCeremony(replayPool([{
      run_id: "run:external", served_number_id: "number:one", stored: 0.61,
      base_strengths: [0.61], arrow_order: [], transmission_reductions: [],
      lift_records: [], cluster_records: [], operator_by_parent: [],
      judgement_selection_rule: { kind: "ONLY_PERSISTED_JUDGEMENT" }
    }]), attestation);
    expect(report).toMatchObject({ checked: 1, exact: true, mismatches: [] });
    expect(report.structuralFieldsRead).toEqual([
      "arrow_order", "transmission_reductions", "lift_records", "cluster_records",
      "operator_by_parent", "judgement_selection_rule"
    ]);
  });

  it("refuses an unsupported recorded shape instead of fabricating a score", async () => {
    await expect(runLaunchReplayCeremony(replayPool([{
      run_id: "run:external", served_number_id: "number:many", stored: 0.61,
      base_strengths: [0.61], arrow_order: ["arrow:recorded"], transmission_reductions: [],
      lift_records: [], cluster_records: [], operator_by_parent: [],
      judgement_selection_rule: { kind: "ONLY_PERSISTED_JUDGEMENT" }
    }]), attestation)).rejects.toThrow("REPLAY_SHAPE_NOT_IMPLEMENTED");
  });
});
