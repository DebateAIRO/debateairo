import type {
  Module,
  ModuleConfigurationObject,
  ProbeObservation,
  RestoredOpenSignal,
  SignalIntent
} from "../../core/types.js";
import type { ObservationSignal } from "../../core/signals.js";
import type { ObservationDatabasePort } from "../../core/database.js";
import { appendDailyNotWiredImpact } from "./daily.js";
import { createCaptureGapTracker } from "./gaps.js";
import {
  readRuntimeLiveness,
  type RuntimeLiveness
} from "./liveness.js";
import {
  readCaptureSnapshot,
  type CaptureSnapshot
} from "./queries.js";
import { createCaptureHealthTracker } from "./tracker.js";

export type CaptureHealthDependencies = Readonly<{
  readSnapshot(database: ObservationDatabasePort): Promise<CaptureSnapshot>;
  readRuntimeLiveness(
    stateDir: string,
    runtimes: readonly string[]
  ): Promise<Readonly<Record<string, RuntimeLiveness>>>;
  appendDailyNotWiredImpact(stateDir: string, runtime: string, now: Date): Promise<void>;
}>;

const productionDependencies: CaptureHealthDependencies = Object.freeze({
  readSnapshot: readCaptureSnapshot,
  readRuntimeLiveness,
  appendDailyNotWiredImpact
});

function expectedRuntimes(thresholds: ModuleConfigurationObject): readonly string[] {
  const configured = thresholds.expected_runtimes;
  if (!Array.isArray(configured)) return Object.freeze(["runner"]);
  const runtimes = configured.filter((value): value is string =>
    typeof value === "string" && /^[A-Za-z0-9_.-]+$/u.test(value));
  return Object.freeze(runtimes.length === 0 ? ["runner"] : [...new Set(runtimes)]);
}

export function createCaptureHealthModule(
  dependencies: Partial<CaptureHealthDependencies> = {}
): Module {
  const resolved: CaptureHealthDependencies = Object.freeze({
    ...productionDependencies,
    ...dependencies
  });
  const tracker = createCaptureHealthTracker();
  const gapTracker = createCaptureGapTracker();
  let pendingIntents: readonly SignalIntent[] = Object.freeze([]);

  return Object.freeze({
    name: "capture-health",
    cadence: Object.freeze({ intervalMs: 15_000, timeoutMs: 2_000 }),
    lifecycle: Object.freeze({
      legacyCorrelationKey(signal: ObservationSignal) {
        return tracker.legacyCorrelationKey(signal) ?? gapTracker.legacyCorrelationKey(signal);
      },
      restore(openSignals: readonly RestoredOpenSignal[]) {
        tracker.restore(openSignals.filter((open) =>
          tracker.legacyCorrelationKey(open.signal) === open.correlationKey));
        gapTracker.restore(openSignals.filter((open) =>
          gapTracker.legacyCorrelationKey(open.signal) === open.correlationKey));
      }
    }),
    async probe(ctx): Promise<readonly ProbeObservation[]> {
      const runtimes = expectedRuntimes(ctx.thresholds);
      const [snapshot, liveness] = await Promise.all([
        resolved.readSnapshot(ctx.database),
        resolved.readRuntimeLiveness(ctx.stateDir, runtimes)
      ]);
      const cycle = tracker.observe({
        snapshot,
        runtimeLiveness: liveness,
        expectedRuntimes: runtimes,
        now: ctx.now,
        blindWindowSeconds: typeof ctx.thresholds.blind_window_s === "number"
          ? ctx.thresholds.blind_window_s : 120
      });
      const gaps = gapTracker.observe({
        snapshot,
        now: ctx.now,
        windowSeconds: typeof ctx.thresholds.gap_window_s === "number"
          ? ctx.thresholds.gap_window_s : 300,
        severeLostCount: typeof ctx.thresholds.gap_severe_lost_count === "number"
          ? ctx.thresholds.gap_severe_lost_count : 100
      });
      pendingIntents = Object.freeze([...cycle.intents, ...gaps.intents]);
      for (const runtime of cycle.dailyNotWiredRuntimes) {
        await resolved.appendDailyNotWiredImpact(ctx.stateDir, runtime, ctx.now);
      }
      return Object.freeze([Object.freeze({
        component: "obs_capture",
        ok: cycle.state === "WIRED_CURRENT",
        class: "CAPTURE_NOT_WIRED",
        probe: "capture_health_relations",
        lastStatus: cycle.state,
        observedAt: ctx.now,
        management: "module",
        statusState: cycle.state,
        status: cycle.state === "UNKNOWN"
          ? cycle.projections
          : Object.freeze([
          ...cycle.projections,
          ...gaps.projections,
          Object.freeze({
            kind: "metric" as const,
            key: "capture.blind_threshold",
            value: typeof ctx.thresholds.blind_window_s === "number"
              ? ctx.thresholds.blind_window_s : 120,
            unit: "SECONDS" as const,
            observedAt: ctx.now
          }),
          Object.freeze({
            kind: "metric" as const,
            key: "capture.gap_severe",
            value: typeof ctx.thresholds.gap_severe_lost_count === "number"
              ? ctx.thresholds.gap_severe_lost_count : 100,
            unit: "COUNT" as const,
            observedAt: ctx.now
          }),
          Object.freeze({
            kind: "metric" as const,
            key: "capture.gap_window",
            value: (typeof ctx.thresholds.gap_window_s === "number"
              ? ctx.thresholds.gap_window_s : 300) / 60,
            unit: "MINUTES" as const,
            observedAt: ctx.now
          })
        ])
      })]);
    },
    samples() {
      return Object.freeze([]);
    },
    signals() {
      const intents = pendingIntents;
      pendingIntents = Object.freeze([]);
      return intents;
    }
  });
}

export default createCaptureHealthModule();
