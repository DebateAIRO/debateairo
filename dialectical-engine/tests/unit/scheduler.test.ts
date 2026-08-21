import { describe, expect, it } from "vitest";
import { runReaper, runReplaySelfTest, runSettlementWatch } from "../../apps/scheduler/src/index.js";

describe("apps/scheduler entry-point honesty", () => {
  it("keeps reaper loud while publishing the third independent settlement watch", async () => {
    const unreachablePool = {} as Parameters<typeof runReaper>[0];
    await expect(runReaper(unreachablePool)).rejects.toThrow("S00_SCAFFOLD_ONLY: job:reaper");
    await expect(runSettlementWatch(unreachablePool)).resolves.toEqual({
      checked: 0, settled: 0, superseded: 0, incomplete: 0, results: []
    });
    await expect(runSettlementWatch(unreachablePool, [{} as never])).rejects.toThrow("SETTLEMENT_POLICY_REQUIRED");
  });
});

describe("P13 — continuous replay consumes recorded structure", () => {
  it("refuses a recorded arrow order it cannot reconstruct instead of replacing it with an empty order", async () => {
    const pool = {
      async query() {
        return { rows: [{
          served_number_id: "number:test", stored: 0.61, node_id: "node:test", tau: 0.61,
          arrow_order: ["arrow:recorded"], cluster_records: [], operator_by_parent: []
        }] };
      }
    } as unknown as Parameters<typeof runReplaySelfTest>[0];
    await expect(runReplaySelfTest(pool)).rejects.toThrow("CONTINUOUS_REPLAY_SHAPE_NOT_IMPLEMENTED");
  });
});
