import { describe, expect, it } from "vitest";
import {
  computeThroughputDelta,
  type ThroughputCounters
} from "../../apps/observation-agent/src/modules/throughput/deltas.js";

function counters(values: Partial<ThroughputCounters> = {}): ThroughputCounters {
  return Object.freeze({
    runSequence: 0, runsStarted: 0, terminalRuns: 0, failedRuns: 0,
    workItemSequence: 0, completedWorkItems: 0, failedWorkItems: 0,
    ...values
  });
}

describe("OBS-06 restart-safe throughput deltas", () => {
  it("takes nonnegative deltas from the last stored cumulative sample", () => {
    expect(computeThroughputDelta(
      counters({ runSequence: 10, runsStarted: 3, terminalRuns: 2, failedRuns: 1,
        workItemSequence: 20, completedWorkItems: 4, failedWorkItems: 1 }),
      counters({ runSequence: 18, runsStarted: 5, terminalRuns: 4, failedRuns: 3,
        workItemSequence: 29, completedWorkItems: 7, failedWorkItems: 2 })
    )).toEqual({
      runsStarted: 2, terminalRuns: 2, failedRuns: 2,
      completedWorkItems: 3, failedWorkItems: 1, drainedWorkItems: 4
    });
  });

  it("replaying the same sequence never double-counts", () => {
    const same = counters({ runSequence: 18, runsStarted: 5, terminalRuns: 4, failedRuns: 3,
      workItemSequence: 29, completedWorkItems: 7, failedWorkItems: 2 });
    expect(computeThroughputDelta(same, same)).toEqual({
      runsStarted: 0, terminalRuns: 0, failedRuns: 0,
      completedWorkItems: 0, failedWorkItems: 0, drainedWorkItems: 0
    });
  });

  it("fails closed when a stored cursor is ahead of the product source", () => {
    expect(() => computeThroughputDelta(
      counters({ runSequence: 20, runsStarted: 5 }),
      counters({ runSequence: 19, runsStarted: 5 })
    )).toThrow("OBSERVATION_THROUGHPUT_CURSOR_INVALID");
  });
});
