import { describe, expect, it } from "vitest";
import { parsePrometheusMetrics } from "../../apps/observation-agent/src/modules/hatchet-throughput/prometheus.js";
import { createHatchetThroughputTracker } from "../../apps/observation-agent/src/modules/hatchet-throughput/tracker.js";

const at = (seconds: number) => new Date(Date.parse("2026-09-04T10:00:00.000Z") + seconds * 1_000);

describe("OBS-06 Hatchet throughput", () => {
  it("opens queue only at depth ten sustained for exactly 300 seconds", () => {
    const tracker = createHatchetThroughputTracker();
    const thresholds = { queueDepth: 10, queueSeconds: 300, dispatchP95Seconds: 30,
      failedTasks: 3, failedWindowMinutes: 15 };
    expect(tracker.observe({ queueDepth: 10, dispatchP95Seconds: 1, failedTasksTotal: 0,
      createdTasksTotal: 10, observedAt: at(0), source: "REST" }, thresholds).intents).toEqual([]);
    expect(tracker.observe({ queueDepth: 10, dispatchP95Seconds: 1, failedTasksTotal: 1,
      createdTasksTotal: 11, observedAt: at(299), source: "REST" }, thresholds).intents).toEqual([]);
    const opened = tracker.observe({ queueDepth: 10, dispatchP95Seconds: 30, failedTasksTotal: 3,
      createdTasksTotal: 13, observedAt: at(300), source: "REST" }, thresholds).intents;
    expect(opened).toEqual(expect.arrayContaining([
      expect.objectContaining({ correlationKey: "hatchet-queue", state: "OPEN", severity: "SEVERE",
        impactCode: "IMPACT_HATCHET_QUEUE", suspectedDefect: false, defectKind: null }),
      expect.objectContaining({ correlationKey: "hatchet-dispatch-p95", state: "OPEN", severity: "DEGRADED",
        impactCode: "IMPACT_HATCHET_DISPATCH_SLOW" }),
      expect.objectContaining({ correlationKey: "hatchet-failed-tasks", state: "OPEN", severity: "SEVERE",
        impactCode: "IMPACT_HATCHET_FAILED_TASKS" })
    ]));
  });

  it("clears queue on recovery and never interprets an unknown read as zero", () => {
    const tracker = createHatchetThroughputTracker();
    const thresholds = { queueDepth: 10, queueSeconds: 300, dispatchP95Seconds: 30,
      failedTasks: 3, failedWindowMinutes: 15 };
    tracker.observe({ queueDepth: 10, dispatchP95Seconds: 0, failedTasksTotal: 0,
      createdTasksTotal: 0, observedAt: at(0), source: "REST" }, thresholds);
    tracker.observe({ queueDepth: 10, dispatchP95Seconds: 0, failedTasksTotal: 0,
      createdTasksTotal: 0, observedAt: at(300), source: "REST" }, thresholds);
    expect(tracker.unknown(at(310)).intents).toEqual([]);
    expect(tracker.observe({ queueDepth: 9, dispatchP95Seconds: 0, failedTasksTotal: 0,
      createdTasksTotal: 0, observedAt: at(320), source: "REST" }, thresholds).intents)
      .toContainEqual(expect.objectContaining({ correlationKey: "hatchet-queue", state: "CLEARED" }));
  });

  it("parses only declared Prometheus facts including histogram p95", () => {
    expect(parsePrometheusMetrics(`# TYPE hatchet_tenant_queue_size gauge
hatchet_tenant_queue_size{tenant="main"} 12
hatchet_queued_to_assigned_time_seconds_bucket{le="10"} 90
hatchet_queued_to_assigned_time_seconds_bucket{le="31"} 96
hatchet_queued_to_assigned_time_seconds_bucket{le="+Inf"} 100
hatchet_failed_tasks_total{tenant="main"} 4
hatchet_created_tasks_total{tenant="main"} 20
`)).toEqual({ queueDepth: 12, dispatchP95Seconds: 31, failedTasksTotal: 4, createdTasksTotal: 20 });
    expect(() => parsePrometheusMetrics("hatchet_tenant_queue_size NaN\n"))
      .toThrow("OBSERVATION_HATCHET_METRICS_INVALID");
  });
});
