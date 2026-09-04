import { describe, expect, it } from "vitest";
import { correlateHatchetSources } from "../../apps/observation-agent/src/modules/hatchet-throughput/correlation.js";

const restAt = new Date("2026-09-04T10:00:00.000Z");
const prometheusAt = new Date("2026-09-04T10:00:01.000Z");

describe("OBS-06 Hatchet source correlation", () => {
  it("reports REST_ONLY when Prometheus is disabled", () => {
    expect(correlateHatchetSources({ queueDepth: 10, observedAt: restAt }, { kind: "DISABLED" }, null))
      .toEqual({ state: "REST_ONLY", restQueueDepth: 10, prometheusQueueDepth: null,
        restObservedAt: restAt, prometheusObservedAt: null, lastObservedAt: restAt });
  });

  it("marks equal values MATCH and preserves both sampled timestamps", () => {
    expect(correlateHatchetSources(
      { queueDepth: 10, observedAt: restAt },
      { kind: "VALUE", queueDepth: 10, observedAt: prometheusAt }, null
    )).toEqual({ state: "REST_AND_PROMETHEUS_MATCH", restQueueDepth: 10,
      prometheusQueueDepth: 10, restObservedAt: restAt, prometheusObservedAt: prometheusAt,
      lastObservedAt: prometheusAt });
  });

  it("marks unequal values SOURCE_MISMATCH and failed reads UNKNOWN without zeroing", () => {
    const previous = correlateHatchetSources(
      { queueDepth: 10, observedAt: restAt },
      { kind: "VALUE", queueDepth: 11, observedAt: prometheusAt }, null
    );
    expect(previous.state).toBe("SOURCE_MISMATCH");
    expect(correlateHatchetSources(null, { kind: "FAILED" }, previous)).toEqual({
      state: "UNKNOWN", restQueueDepth: null, prometheusQueueDepth: null,
      restObservedAt: null, prometheusObservedAt: null, lastObservedAt: prometheusAt
    });
  });
});
