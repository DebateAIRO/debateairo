import type { ModuleStatusProjection, SignalIntent } from "../../core/types.js";
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
  observe(window: RunFailureWindow, threshold: RunFailureThreshold): Readonly<{
    intents: readonly SignalIntent[];
    projections: readonly ModuleStatusProjection[];
  }>;
}> {
  let openedAt: Date | null = null;
  return Object.freeze({
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
