import { describe, expect, it } from "vitest";
import { renderImpact, signalSchema } from "../../apps/observation-agent/src/core/signals.js";
import { createRunFailureTracker } from "../../apps/observation-agent/src/modules/throughput/tracker.js";

describe("OBS-06 fixed anomaly copy", () => {
  it("renders the qualifying run-failure fixture through the closed signal schema", () => {
    const now = new Date("2026-09-04T11:00:00.000Z");
    const intent = createRunFailureTracker().observe({
      failed: 3, total: 4,
      windowStartedAt: new Date("2026-09-04T10:00:00.000Z"), windowEndedAt: now
    }, { minimum: 4, ratio: 0.5, windowMinutes: 60 }).intents[0]!;
    const signal = signalSchema.parse({
      seq: 1, signal_id: "60000000-0000-4000-8000-000000000001", state: intent.state,
      class: intent.class, component: intent.component, severity: intent.severity,
      impact_code: intent.impactCode, first_failed_probe_at: intent.firstFailedProbeAt?.toISOString(),
      detected_at: intent.detectedAt.toISOString(), evidence: intent.evidence,
      suspected_defect: intent.suspectedDefect, defect_kind: intent.defectKind,
      run_ref: intent.runRef, work_item_ref: intent.workItemRef, threshold_version: 6,
      clears_signal_id: null, recorded_at: now.toISOString()
    });
    expect(renderImpact(signal)).toBe(
      "3 of 4 terminal runs failed in the last 60 minutes: debate runs are failing more often than they finish."
    );
  });

  it("renders dispatch p95 from numeric evidence and rejects a null impact", () => {
    const base = {
      seq: 2, signal_id: "60000000-0000-4000-8000-000000000002", state: "OPEN",
      class: "THROUGHPUT_ANOMALY", component: "hatchet", severity: "DEGRADED",
      first_failed_probe_at: "2026-09-04T10:55:00.000Z", detected_at: "2026-09-04T11:00:00.000Z",
      evidence: { metric_key: "hatchet.dispatch.p95", p95_seconds: 31, threshold_seconds: 30,
        quantile: 0.95, window_minutes: 5, source: "REST", observed_at: "2026-09-04T11:00:00.000Z" },
      suspected_defect: false, defect_kind: null, run_ref: null, work_item_ref: null,
      threshold_version: 6, clears_signal_id: null, recorded_at: "2026-09-04T11:00:00.000Z"
    } as const;
    const signal = signalSchema.parse({ ...base, impact_code: "IMPACT_HATCHET_DISPATCH_SLOW" });
    expect(renderImpact(signal)).toBe(
      "Hatchet dispatch p95 is 31 seconds over 5 minutes: queued debate work waits too long to start."
    );
    expect(() => signalSchema.parse({ ...base, impact_code: null })).toThrow();
  });
});
