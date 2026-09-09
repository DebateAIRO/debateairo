import type { ObservationSignal } from "../../core/signals.js";
import type { ModuleStatusProjection, RestoredOpenSignal, SignalIntent } from "../../core/types.js";
import { classifyRunFailureWindow } from "./anomalies.js";

export type RunFailureWindow = Readonly<{
  failed: number;
  total: number;
  windowStartedAt: Date;
  windowEndedAt: Date;
}>;

export type RunFailureThreshold = Readonly<{
  minimum: number;
  ratio: number;
  windowMinutes: number;
}>;

export function createRunFailureTracker(): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  observe(window: RunFailureWindow, threshold: RunFailureThreshold): Readonly<{
    intents: readonly SignalIntent[];
    projections: readonly ModuleStatusProjection[];
  }>;
}> {
  let openedAt: Date | null = null;
  return Object.freeze({
    legacyCorrelationKey(signal): string | null {
      const evidence = signal.evidence as Readonly<Record<string, unknown>>;
      const startedAt = typeof evidence.window_started_at === "string"
        ? new Date(evidence.window_started_at).getTime() : Number.NaN;
      const endedAt = typeof evidence.window_ended_at === "string"
        ? new Date(evidence.window_ended_at).getTime() : Number.NaN;
      return signal.state === "OPEN"
        && signal.component === "runner"
        && signal.class === "THROUGHPUT_ANOMALY"
        && signal.severity === "SEVERE"
        && signal.impact_code === "IMPACT_RUN_FAILURE"
        && signal.first_failed_probe_at !== null
        && signal.suspected_defect === false
        && signal.defect_kind === null
        && signal.run_ref === null
        && signal.work_item_ref === null
        && Object.keys(evidence).sort().join(":")
          === "failed:ratio:threshold_ratio:total:window_ended_at:window_minutes:window_started_at"
        && Number.isInteger(evidence.failed) && (evidence.failed as number) >= 0
        && Number.isInteger(evidence.total) && (evidence.total as number) > 0
        && (evidence.failed as number) <= (evidence.total as number)
        && typeof evidence.ratio === "number" && Number.isFinite(evidence.ratio)
        && Math.abs(evidence.ratio - (evidence.failed as number) / (evidence.total as number)) < 1e-9
        && typeof evidence.threshold_ratio === "number" && Number.isFinite(evidence.threshold_ratio)
        && evidence.ratio >= evidence.threshold_ratio
        && typeof evidence.window_minutes === "number" && Number.isFinite(evidence.window_minutes)
        && evidence.window_minutes > 0
        && Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt >= startedAt
        ? "run-failure"
        : null;
    },
    restore(openSignals): void {
      if (openSignals.length > 1) throw new TypeError("OBSERVATION_THROUGHPUT_RESTORE_INVALID");
      const restored = openSignals[0];
      if (restored === undefined) return;
      if (this.legacyCorrelationKey(restored.signal) !== restored.correlationKey
        || restored.correlationKey !== "run-failure") {
        throw new TypeError("OBSERVATION_THROUGHPUT_RESTORE_INVALID");
      }
      openedAt = new Date(restored.signal.detected_at);
    },
    observe(window, threshold) {
      const band = classifyRunFailureWindow(window, threshold);
      const intents: SignalIntent[] = [];
      if (band.state === "OPEN" && openedAt === null) {
        openedAt = window.windowEndedAt;
        intents.push(Object.freeze({
          correlationKey: "run-failure",
          component: "runner",
          class: "THROUGHPUT_ANOMALY",
          state: "OPEN",
          severity: "SEVERE",
          impactCode: "IMPACT_RUN_FAILURE",
          firstFailedProbeAt: window.windowStartedAt,
          detectedAt: window.windowEndedAt,
          evidence: Object.freeze({
            failed: window.failed,
            total: window.total,
            ratio: band.ratio,
            threshold_ratio: threshold.ratio,
            window_minutes: threshold.windowMinutes,
            window_started_at: window.windowStartedAt.toISOString(),
            window_ended_at: window.windowEndedAt.toISOString()
          }),
          suspectedDefect: false,
          defectKind: null,
          runRef: null,
          workItemRef: null
        }));
      } else if (band.state === "QUALIFIED_NORMAL" && openedAt !== null) {
        intents.push(Object.freeze({
          correlationKey: "run-failure",
          component: "runner",
          class: "THROUGHPUT_ANOMALY",
          state: "CLEARED",
          severity: "SEVERE",
          impactCode: "IMPACT_CLEARED",
          firstFailedProbeAt: openedAt,
          detectedAt: window.windowEndedAt,
          evidence: Object.freeze({
            duration_seconds: Math.max(0, (window.windowEndedAt.getTime() - openedAt.getTime()) / 1_000)
          }),
          suspectedDefect: false,
          defectKind: null,
          runRef: null,
          workItemRef: null
        }));
        openedAt = null;
      }
      return Object.freeze({
        intents: Object.freeze(intents),
        projections: Object.freeze([
          Object.freeze({ kind: "state", key: "run.failure.band", state: band.state, view: "throughput" }),
          Object.freeze({
            kind: "template", key: "run.failure.threshold",
            template: "PERCENT_MINIMUM_THRESHOLD",
            percent: threshold.ratio * 100, minimum: threshold.minimum, view: "throughput"
          }),
          Object.freeze({
            kind: "template", key: "run.failure", template: "RATIO_WINDOW_STATE",
            numerator: window.failed, denominator: window.total,
            windowMinutes: threshold.windowMinutes,
            state: band.state === "OPEN" ? "SEVERE" : band.state,
            view: "throughput"
          }),
          Object.freeze({ kind: "metric", key: "run.failure.failed", value: window.failed, unit: "COUNT", view: "throughput" }),
          Object.freeze({ kind: "metric", key: "run.failure.total", value: window.total, unit: "COUNT", view: "throughput" }),
          Object.freeze({ kind: "metric", key: "run.failure.ratio", value: band.ratio * 100, unit: "PERCENT", view: "throughput" })
        ])
      });
    }
  });
}
