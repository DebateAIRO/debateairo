import type { ObservationSignal } from "../../core/signals.js";
import type { ObservationComponent, RestoredOpenSignal, SignalIntent } from "../../core/types.js";

type ThresholdComponent = Extract<ObservationComponent, "api" | "ui" | "tls_front_door">;
type LatencyComponent = Extract<ObservationComponent, ThresholdComponent | "runner" | "kanban">;

export type ProbeLatencyPolicy = Readonly<{
  windowMs: number;
  thresholdsMs: Readonly<Record<ThresholdComponent, number>>;
}>;

type Sample = Readonly<{ at: Date; value: number }>;

function exactLatencyEvidence(signal: ObservationSignal): boolean {
  const evidence = signal.evidence as Readonly<Record<string, unknown>>;
  const keys = Object.keys(evidence).sort().join(":");
  return keys === "metric_key:observed_at:p95_ms:threshold_ms:window_minutes"
    && evidence.metric_key === `probe.${signal.component}.latency_ms`
    && typeof evidence.p95_ms === "number"
    && Number.isFinite(evidence.p95_ms)
    && typeof evidence.threshold_ms === "number"
    && Number.isFinite(evidence.threshold_ms)
    && evidence.threshold_ms > 0
    && evidence.p95_ms > evidence.threshold_ms
    && typeof evidence.window_minutes === "number"
    && Number.isFinite(evidence.window_minutes)
    && evidence.window_minutes > 0
    && evidence.observed_at === signal.detected_at;
}

function validatePolicy(policy: ProbeLatencyPolicy): ProbeLatencyPolicy {
  if (!Number.isFinite(policy.windowMs) || policy.windowMs <= 0
    || Object.values(policy.thresholdsMs).some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new TypeError("OBSERVATION_LATENCY_POLICY_INVALID");
  }
  return Object.freeze({ windowMs: policy.windowMs, thresholdsMs: Object.freeze({ ...policy.thresholdsMs }) });
}

function percentile95(samples: readonly Sample[]): number {
  const ordered = samples.map((sample) => sample.value).sort((left, right) => left - right);
  const index = Math.min(ordered.length - 1, Math.ceil((ordered.length - 1) * 0.95));
  return ordered[index] ?? 0;
}

export function createProbeLatencyTracker(initialPolicy: ProbeLatencyPolicy): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  updatePolicy(policy: ProbeLatencyPolicy): void;
  observe(component: LatencyComponent, latencyMs: number, at: Date): readonly SignalIntent[];
}> {
  let policy = validatePolicy(initialPolicy);
  const samples = new Map<LatencyComponent, Sample[]>();
  const opened = new Set<ThresholdComponent>();
  const openedAt = new Map<ThresholdComponent, Date>();

  return Object.freeze({
    legacyCorrelationKey(signal): string | null {
      return (signal.component === "api"
          || signal.component === "ui"
          || signal.component === "tls_front_door")
        && signal.state === "OPEN"
        && signal.class === "THROUGHPUT_ANOMALY"
        && signal.severity === "DEGRADED"
        && signal.impact_code === "IMPACT_SLOW"
        && signal.first_failed_probe_at !== null
        && signal.suspected_defect === false
        && signal.defect_kind === null
        && signal.run_ref === null
        && signal.work_item_ref === null
        && exactLatencyEvidence(signal)
        ? `latency:${signal.component}`
        : null;
    },
    restore(openSignals): void {
      for (const restored of openSignals) {
        const component = restored.signal.component;
        if (!(component === "api" || component === "ui" || component === "tls_front_door")
          || this.legacyCorrelationKey(restored.signal) !== restored.correlationKey
          || restored.correlationKey !== `latency:${component}`
          || opened.has(component)) {
          throw new TypeError("OBSERVATION_LATENCY_RESTORE_INVALID");
        }
        opened.add(component);
        openedAt.set(component, new Date(restored.signal.detected_at));
      }
    },
    updatePolicy(input): void { policy = validatePolicy(input); },
    observe(component, latencyMs, at) {
      if (!Number.isFinite(latencyMs) || latencyMs < 0) {
        throw new TypeError("OBSERVATION_LATENCY_SAMPLE_INVALID");
      }
      const current = samples.get(component) ?? [];
      current.push(Object.freeze({ at, value: latencyMs }));
      const cutoff = at.getTime() - policy.windowMs;
      while ((current[0]?.at.getTime() ?? cutoff) < cutoff) current.shift();
      samples.set(component, current);
      if (!(component in policy.thresholdsMs)) return Object.freeze([]);

      const thresholdComponent = component as ThresholdComponent;
      const thresholdMs = policy.thresholdsMs[thresholdComponent];
      const p95Ms = percentile95(current);
      const evidence = Object.freeze({
        metric_key: `probe.${component}.latency_ms`,
        p95_ms: p95Ms,
        threshold_ms: thresholdMs,
        window_minutes: policy.windowMs / 60_000,
        observed_at: at.toISOString()
      });
      if (p95Ms > thresholdMs && !opened.has(thresholdComponent)) {
        opened.add(thresholdComponent);
        openedAt.set(thresholdComponent, at);
        return Object.freeze([Object.freeze({
          correlationKey: `latency:${component}`,
          component,
          class: "THROUGHPUT_ANOMALY",
          state: "OPEN",
          severity: "DEGRADED",
          impactCode: "IMPACT_SLOW",
          firstFailedProbeAt: at,
          detectedAt: at,
          evidence,
          suspectedDefect: false,
          defectKind: null,
          runRef: null,
          workItemRef: null
        })]);
      }
      if (p95Ms <= thresholdMs && opened.delete(thresholdComponent)) {
        const start = openedAt.get(thresholdComponent);
        openedAt.delete(thresholdComponent);
        return Object.freeze([Object.freeze({
          correlationKey: `latency:${component}`,
          component,
          class: "THROUGHPUT_ANOMALY",
          state: "CLEARED",
          severity: "DEGRADED",
          impactCode: "IMPACT_CLEARED",
          firstFailedProbeAt: start ?? null,
          detectedAt: at,
          evidence: Object.freeze({
            ...evidence,
            ...(start === undefined ? {} : {
              duration_seconds: Math.max(0, (at.getTime() - start.getTime()) / 1_000)
            })
          }),
          suspectedDefect: false,
          defectKind: null,
          runRef: null,
          workItemRef: null
        })]);
      }
      return Object.freeze([]);
    }
  });
}
