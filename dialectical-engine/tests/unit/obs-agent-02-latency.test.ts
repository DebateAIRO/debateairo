import { describe, expect, it } from "vitest";
import { createProbeLatencyTracker } from "../../apps/observation-agent/src/modules/product-liveness/latency.js";

describe("OBS-02 probe latency", () => {
  it("keeps a five-minute p95 and emits DEGRADED THROUGHPUT_ANOMALY with IMPACT_SLOW", () => {
    const tracker = createProbeLatencyTracker({
      windowMs: 300_000,
      thresholdsMs: { api: 500, ui: 2_000, tls_front_door: 2_500 }
    });
    const base = Date.parse("2026-09-03T08:00:00.000Z");
    for (let index = 0; index < 19; index += 1) {
      expect(tracker.observe("api", 100, new Date(base + index * 5_000))).toEqual([]);
    }
    const opened = tracker.observe("api", 700, new Date(base + 95_000));
    expect(opened).toEqual([expect.objectContaining({
      correlationKey: "latency:api", component: "api", class: "THROUGHPUT_ANOMALY",
      state: "OPEN", severity: "DEGRADED", impactCode: "IMPACT_SLOW",
      evidence: {
        metric_key: "probe.api.latency_ms", p95_ms: 700, threshold_ms: 500,
        window_minutes: 5, observed_at: "2026-09-03T08:01:35.000Z"
      }
    })]);
    expect(tracker.observe("api", 100, new Date(base + 300_001))).toEqual([]);
    expect(tracker.observe("api", 100, new Date(base + 395_001))).toEqual([
      expect.objectContaining({
        correlationKey: "latency:api", state: "CLEARED", severity: "DEGRADED",
        impactCode: "IMPACT_CLEARED"
      })
    ]);
  });

  it("does not invent a threshold for runner or Kanban samples", () => {
    const tracker = createProbeLatencyTracker({
      windowMs: 300_000,
      thresholdsMs: { api: 500, ui: 2_000, tls_front_door: 2_500 }
    });
    expect(tracker.observe("runner", 9_999, new Date())).toEqual([]);
    expect(tracker.observe("kanban", 9_999, new Date())).toEqual([]);
  });
});
