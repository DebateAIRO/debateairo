import type { ObservationSignal } from "../../core/signals.js";
import type { ModuleStatusProjection, RestoredOpenSignal, SignalIntent } from "../../core/types.js";

export type HatchetThroughputSnapshot = Readonly<{
  queueDepth: number;
  dispatchP95Seconds: number;
  failedTasksTotal: number;
  createdTasksTotal: number;
  observedAt: Date;
  source: "REST" | "PROMETHEUS";
}>;

export type HatchetThroughputThresholds = Readonly<{
  queueDepth: number;
  queueSeconds: number;
  dispatchP95Seconds: number;
  failedTasks: number;
  failedWindowMinutes: number;
}>;

type OpenMetric = Readonly<{ openedAt: Date }>;

function openIntent(input: Readonly<{
  key: string;
  severity: "DEGRADED" | "SEVERE";
  impactCode: "IMPACT_HATCHET_QUEUE" | "IMPACT_HATCHET_DISPATCH_SLOW" | "IMPACT_HATCHET_FAILED_TASKS";
  firstAt: Date;
  now: Date;
  evidence: Readonly<Record<string, unknown>>;
}>): SignalIntent {
  return Object.freeze({
    correlationKey: input.key, component: "hatchet", class: "THROUGHPUT_ANOMALY",
    state: "OPEN", severity: input.severity, impactCode: input.impactCode,
    firstFailedProbeAt: input.firstAt, detectedAt: input.now, evidence: input.evidence,
    suspectedDefect: false, defectKind: null, runRef: null, workItemRef: null
  });
}

export function createHatchetThroughputTracker(): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  observe(snapshot: HatchetThroughputSnapshot, thresholds: HatchetThroughputThresholds): Readonly<{
    intents: readonly SignalIntent[]; projections: readonly ModuleStatusProjection[];
  }>;
  unknown(now: Date): Readonly<{ intents: readonly SignalIntent[]; projections: readonly ModuleStatusProjection[] }>;
}> {
  const open = new Map<string, OpenMetric>();
  let queueCrossedAt: Date | null = null;
  let baseline: Readonly<{ failed: number; created: number; at: Date }> | null = null;

  function restoredKey(signal: ObservationSignal): string | null {
    if (signal.state !== "OPEN"
      || signal.component !== "hatchet"
      || signal.class !== "THROUGHPUT_ANOMALY"
      || signal.first_failed_probe_at === null
      || signal.suspected_defect
      || signal.defect_kind !== null
      || signal.run_ref !== null
      || signal.work_item_ref !== null) return null;
    const evidence = signal.evidence as Readonly<Record<string, unknown>>;
    const exactKeys = (keys: readonly string[]) => {
      const actual = Object.keys(evidence).sort();
      const expected = [...keys].sort();
      return actual.length === expected.length
        && actual.every((key, index) => key === expected[index]);
    };
    const sourceAndObserved = (observedKey: "observed_at" | "window_ended_at") =>
      (evidence.source === "REST" || evidence.source === "PROMETHEUS")
      && typeof evidence[observedKey] === "string"
      && Number.isFinite(new Date(evidence[observedKey] as string).getTime());
    if (signal.impact_code === "IMPACT_HATCHET_QUEUE"
      && signal.severity === "SEVERE"
      && exactKeys([
        "metric_key", "count", "threshold", "duration_seconds", "window_minutes", "source", "observed_at"
      ])
      && evidence.metric_key === "hatchet.queue"
      && Number.isInteger(evidence.count) && (evidence.count as number) >= 0
      && typeof evidence.threshold === "number" && Number.isFinite(evidence.threshold)
      && evidence.threshold > 0 && (evidence.count as number) >= evidence.threshold
      && typeof evidence.duration_seconds === "number" && Number.isFinite(evidence.duration_seconds)
      && typeof evidence.window_minutes === "number" && Number.isFinite(evidence.window_minutes)
      && evidence.window_minutes > 0
      && evidence.duration_seconds >= evidence.window_minutes * 60
      && sourceAndObserved("observed_at")) return "hatchet-queue";
    if (signal.impact_code === "IMPACT_HATCHET_DISPATCH_SLOW"
      && signal.severity === "DEGRADED"
      && exactKeys([
        "metric_key", "p95_seconds", "threshold_seconds", "quantile", "window_minutes", "source", "observed_at"
      ])
      && evidence.metric_key === "hatchet.dispatch.p95"
      && typeof evidence.p95_seconds === "number" && Number.isFinite(evidence.p95_seconds)
      && typeof evidence.threshold_seconds === "number" && Number.isFinite(evidence.threshold_seconds)
      && evidence.threshold_seconds > 0 && evidence.p95_seconds >= evidence.threshold_seconds
      && evidence.quantile === 0.95 && evidence.window_minutes === 5
      && sourceAndObserved("observed_at")) return "hatchet-dispatch-p95";
    if (signal.impact_code === "IMPACT_HATCHET_FAILED_TASKS"
      && signal.severity === "SEVERE"
      && exactKeys([
        "metric_key", "failed", "total", "threshold", "window_minutes", "source",
        "window_started_at", "window_ended_at"
      ])
      && evidence.metric_key === "hatchet.failed"
      && Number.isInteger(evidence.failed) && (evidence.failed as number) >= 0
      && Number.isInteger(evidence.total) && (evidence.total as number) >= 0
      && typeof evidence.threshold === "number" && Number.isFinite(evidence.threshold)
      && evidence.threshold > 0 && (evidence.failed as number) >= evidence.threshold
      && typeof evidence.window_minutes === "number" && Number.isFinite(evidence.window_minutes)
      && evidence.window_minutes > 0
      && typeof evidence.window_started_at === "string"
      && Number.isFinite(new Date(evidence.window_started_at).getTime())
      && sourceAndObserved("window_ended_at")
      && new Date(evidence.window_ended_at as string).getTime()
        >= new Date(evidence.window_started_at).getTime()) return "hatchet-failed-tasks";
    return null;
  }

  function clear(key: string, now: Date, intents: SignalIntent[]): void {
    const active = open.get(key);
    if (active === undefined) return;
    intents.push(Object.freeze({
      correlationKey: key, component: "hatchet", class: "THROUGHPUT_ANOMALY",
      state: "CLEARED", severity: key === "hatchet-dispatch-p95" ? "DEGRADED" : "SEVERE",
      impactCode: "IMPACT_CLEARED", firstFailedProbeAt: active.openedAt, detectedAt: now,
      evidence: Object.freeze({ duration_seconds: Math.max(0, (now.getTime() - active.openedAt.getTime()) / 1_000) }),
      suspectedDefect: false, defectKind: null, runRef: null, workItemRef: null
    }));
    open.delete(key);
  }

  return Object.freeze({
    legacyCorrelationKey: restoredKey,
    restore(openSignals): void {
      for (const restored of openSignals) {
        const key = restoredKey(restored.signal);
        if (key === null || key !== restored.correlationKey || open.has(key)) {
          throw new TypeError("OBSERVATION_HATCHET_THROUGHPUT_RESTORE_INVALID");
        }
        const openedAt = restored.signal.first_failed_probe_at === null
          ? new Date(restored.signal.detected_at)
          : new Date(restored.signal.first_failed_probe_at);
        open.set(key, Object.freeze({ openedAt }));
        if (key === "hatchet-queue") queueCrossedAt = openedAt;
      }
    },
    observe(snapshot, thresholds) {
      const values = [snapshot.queueDepth, snapshot.dispatchP95Seconds,
        snapshot.failedTasksTotal, snapshot.createdTasksTotal];
      if (values.some((value) => !Number.isFinite(value) || value < 0)) {
        throw new TypeError("OBSERVATION_HATCHET_METRICS_INVALID");
      }
      const intents: SignalIntent[] = [];
      if (snapshot.queueDepth >= thresholds.queueDepth) {
        queueCrossedAt ??= snapshot.observedAt;
        const duration = (snapshot.observedAt.getTime() - queueCrossedAt.getTime()) / 1_000;
        if (duration >= thresholds.queueSeconds && !open.has("hatchet-queue")) {
          open.set("hatchet-queue", Object.freeze({ openedAt: queueCrossedAt }));
          intents.push(openIntent({
            key: "hatchet-queue", severity: "SEVERE", impactCode: "IMPACT_HATCHET_QUEUE",
            firstAt: queueCrossedAt, now: snapshot.observedAt,
            evidence: Object.freeze({ metric_key: "hatchet.queue", count: snapshot.queueDepth,
              threshold: thresholds.queueDepth, duration_seconds: duration,
              window_minutes: thresholds.queueSeconds / 60, source: snapshot.source,
              observed_at: snapshot.observedAt.toISOString() })
          }));
        }
      } else {
        queueCrossedAt = null;
        clear("hatchet-queue", snapshot.observedAt, intents);
      }

      if (snapshot.dispatchP95Seconds >= thresholds.dispatchP95Seconds) {
        if (!open.has("hatchet-dispatch-p95")) {
          open.set("hatchet-dispatch-p95", Object.freeze({ openedAt: snapshot.observedAt }));
          intents.push(openIntent({
            key: "hatchet-dispatch-p95", severity: "DEGRADED",
            impactCode: "IMPACT_HATCHET_DISPATCH_SLOW", firstAt: snapshot.observedAt,
            now: snapshot.observedAt, evidence: Object.freeze({
              metric_key: "hatchet.dispatch.p95", p95_seconds: snapshot.dispatchP95Seconds,
              threshold_seconds: thresholds.dispatchP95Seconds, quantile: 0.95,
              window_minutes: 5, source: snapshot.source, observed_at: snapshot.observedAt.toISOString()
            })
          }));
        }
      } else clear("hatchet-dispatch-p95", snapshot.observedAt, intents);

      if (baseline === null
        || snapshot.observedAt.getTime() - baseline.at.getTime() >= thresholds.failedWindowMinutes * 60_000) {
        if (baseline !== null) {
          const failed = Math.max(0, snapshot.failedTasksTotal - baseline.failed);
          const total = Math.max(0, snapshot.createdTasksTotal - baseline.created);
          if (failed >= thresholds.failedTasks && !open.has("hatchet-failed-tasks")) {
            open.set("hatchet-failed-tasks", Object.freeze({ openedAt: baseline.at }));
            intents.push(openIntent({
              key: "hatchet-failed-tasks", severity: "SEVERE", impactCode: "IMPACT_HATCHET_FAILED_TASKS",
              firstAt: baseline.at, now: snapshot.observedAt, evidence: Object.freeze({
                metric_key: "hatchet.failed", failed, total, threshold: thresholds.failedTasks,
                window_minutes: thresholds.failedWindowMinutes, source: snapshot.source,
                window_started_at: baseline.at.toISOString(), window_ended_at: snapshot.observedAt.toISOString()
              })
            }));
          } else if (failed < thresholds.failedTasks) clear("hatchet-failed-tasks", snapshot.observedAt, intents);
          baseline = Object.freeze({ failed: snapshot.failedTasksTotal, created: snapshot.createdTasksTotal, at: snapshot.observedAt });
        } else {
          baseline = Object.freeze({ failed: snapshot.failedTasksTotal, created: snapshot.createdTasksTotal, at: snapshot.observedAt });
        }
      } else if (snapshot.failedTasksTotal - baseline.failed >= thresholds.failedTasks
        && !open.has("hatchet-failed-tasks")) {
        const failed = snapshot.failedTasksTotal - baseline.failed;
        const total = Math.max(0, snapshot.createdTasksTotal - baseline.created);
        open.set("hatchet-failed-tasks", Object.freeze({ openedAt: baseline.at }));
        intents.push(openIntent({
          key: "hatchet-failed-tasks", severity: "SEVERE", impactCode: "IMPACT_HATCHET_FAILED_TASKS",
          firstAt: baseline.at, now: snapshot.observedAt, evidence: Object.freeze({
            metric_key: "hatchet.failed", failed, total, threshold: thresholds.failedTasks,
            window_minutes: thresholds.failedWindowMinutes, source: snapshot.source,
            window_started_at: baseline.at.toISOString(), window_ended_at: snapshot.observedAt.toISOString()
          })
        }));
      }

      return Object.freeze({
        intents: Object.freeze(intents),
        projections: Object.freeze([
          Object.freeze({
            kind: "template", key: "queue.threshold", template: "COUNT_WINDOW_THRESHOLD",
            count: thresholds.queueDepth, windowMinutes: thresholds.queueSeconds / 60,
            view: "throughput"
          }),
          Object.freeze({
            kind: "template", key: "dispatch.p95", template: "DURATION_WINDOW_STATE",
            valueSeconds: snapshot.dispatchP95Seconds, windowMinutes: 5,
            state: snapshot.dispatchP95Seconds >= thresholds.dispatchP95Seconds
              ? "DEGRADED" : "QUALIFIED_NORMAL",
            view: "throughput"
          }),
          Object.freeze({ kind: "metric", key: "hatchet.dispatch.p95.seconds", value: snapshot.dispatchP95Seconds, unit: "SECONDS", view: "throughput", observedAt: snapshot.observedAt }),
          Object.freeze({ kind: "metric", key: "hatchet.failed.total", value: snapshot.failedTasksTotal, unit: "COUNT", view: "throughput", observedAt: snapshot.observedAt })
        ])
      });
    },
    unknown(now) {
      return Object.freeze({
        intents: Object.freeze([]),
        projections: Object.freeze([Object.freeze({
          kind: "state", key: "hatchet.metrics", state: "UNKNOWN", view: "throughput", observedAt: now
        })])
      });
    }
  });
}
