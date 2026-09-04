import { loadObservationAgentEnvironment } from "../../../../../packages/register/src/runtime-environment.js";
import { observationTargetSchema } from "../../core/targets.js";
import type { Module, ModuleStatusProjection, ProbeObservation, SampleIntent, SignalIntent } from "../../core/types.js";
import { readHatchetPrometheus, readHatchetRest } from "./client.js";
import { correlateHatchetSources, type CorrelatedHatchetSources } from "./correlation.js";
import type { HatchetMetricValues } from "./prometheus.js";
import { createHatchetThroughputTracker } from "./tracker.js";

export type HatchetThroughputDependencies = Readonly<{
  tokenPath(): string | undefined;
  readRest(input: Readonly<{ queueUrl: string; tokenPath: string; timeoutMs: number }>): Promise<HatchetMetricValues>;
  readPrometheus(input: Readonly<{ url: string; timeoutMs: number }>): Promise<HatchetMetricValues>;
}>;

const productionDependencies: HatchetThroughputDependencies = Object.freeze({
  tokenPath: () => loadObservationAgentEnvironment().OBSERVATION_HATCHET_TOKEN_PATH,
  readRest: readHatchetRest,
  readPrometheus: readHatchetPrometheus
});

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createHatchetThroughputModule(
  dependencies: HatchetThroughputDependencies = productionDependencies
): Module {
  const tracker = createHatchetThroughputTracker();
  let pendingIntents: readonly SignalIntent[] = Object.freeze([]);
  let pendingSamples: readonly SampleIntent[] = Object.freeze([]);
  let correlation: CorrelatedHatchetSources | null = null;
  return Object.freeze({
    name: "hatchet-throughput",
    cadence: Object.freeze({ intervalMs: 30_000, timeoutMs: 2_000 }),
    targetFragmentBasename: "OBS-06.json",
    async probe(ctx): Promise<readonly ProbeObservation[]> {
      const target = ctx.targets.map((value) => observationTargetSchema.parse(value))
        .find((value) => value.kind === "hatchet_metrics");
      if (target === undefined) throw new TypeError("OBSERVATION_HATCHET_TARGET_INVALID");
      const tokenPath = dependencies.tokenPath();
      let rest: HatchetMetricValues | null = null;
      let prometheus: HatchetMetricValues | null = null;
      try {
        if (tokenPath === undefined) throw new TypeError("OBSERVATION_HATCHET_TOKEN_UNAVAILABLE");
        rest = await dependencies.readRest({ queueUrl: target.rest_url, tokenPath, timeoutMs: ctx.timeoutMs });
      } catch {
        rest = null;
      }
      let prometheusState: Parameters<typeof correlateHatchetSources>[1];
      if (target.prometheus_url === undefined) {
        prometheusState = Object.freeze({ kind: "DISABLED" });
      } else {
        try {
          prometheus = await dependencies.readPrometheus({ url: target.prometheus_url, timeoutMs: ctx.timeoutMs });
          prometheusState = Object.freeze({ kind: "VALUE", queueDepth: prometheus.queueDepth, observedAt: ctx.now });
        } catch {
          prometheusState = Object.freeze({ kind: "FAILED" });
        }
      }
      correlation = correlateHatchetSources(
        rest === null ? null : Object.freeze({ queueDepth: rest.queueDepth, observedAt: ctx.now }),
        prometheusState,
        correlation
      );
      const status: ModuleStatusProjection[] = [
        Object.freeze({ kind: "state", key: "hatchet.metrics.source", state: correlation.state, view: "throughput", observedAt: ctx.now }),
        Object.freeze({ kind: "timestamp", key: "hatchet.metrics.last_observed", value: correlation.lastObservedAt, view: "throughput" })
      ];
      if (correlation.restQueueDepth !== null) status.push(Object.freeze({
        kind: "metric", key: "hatchet.queue.rest", value: correlation.restQueueDepth,
        unit: "COUNT", view: "throughput", observedAt: correlation.restObservedAt ?? ctx.now
      }));
      if (correlation.prometheusQueueDepth !== null) status.push(Object.freeze({
        kind: "metric", key: "hatchet.queue.prometheus", value: correlation.prometheusQueueDepth,
        unit: "COUNT", view: "throughput", observedAt: correlation.prometheusObservedAt ?? ctx.now
      }));
      if (rest === null) {
        const unknown = tracker.unknown(ctx.now);
        pendingIntents = unknown.intents;
        pendingSamples = Object.freeze([]);
        return Object.freeze([Object.freeze({
          component: "hatchet", ok: false, class: "THROUGHPUT_ANOMALY",
          probe: "hatchet_metrics_rest", lastStatus: "UNKNOWN", observedAt: ctx.now,
          management: "module", statusState: "UNKNOWN", status: Object.freeze([...status, ...unknown.projections])
        })]);
      }
      const cycle = tracker.observe({ ...rest, observedAt: ctx.now, source: "REST" }, {
        queueDepth: positive(ctx.thresholds.queue_depth, 10),
        queueSeconds: positive(ctx.thresholds.queue_sustained_s, 300),
        dispatchP95Seconds: positive(ctx.thresholds.dispatch_p95_s, 30),
        failedTasks: positive(ctx.thresholds.failed_tasks, 3),
        failedWindowMinutes: positive(ctx.thresholds.failed_window_minutes, 15)
      });
      pendingIntents = cycle.intents;
      pendingSamples = Object.freeze([
        Object.freeze({ metricKey: "throughput.hatchet.queue", value: rest.queueDepth, observedAt: ctx.now }),
        Object.freeze({ metricKey: "throughput.hatchet.dispatch_p95_s", value: rest.dispatchP95Seconds, observedAt: ctx.now }),
        Object.freeze({ metricKey: "throughput.hatchet.failed_total", value: rest.failedTasksTotal, observedAt: ctx.now }),
        Object.freeze({ metricKey: "throughput.hatchet.created_total", value: rest.createdTasksTotal, observedAt: ctx.now })
      ]);
      return Object.freeze([Object.freeze({
        component: "hatchet", ok: cycle.intents.every((intent) => intent.state !== "OPEN"),
        class: "THROUGHPUT_ANOMALY", probe: "hatchet_metrics_rest",
        lastStatus: correlation.state, observedAt: ctx.now, management: "module",
        statusState: correlation.state, status: Object.freeze([...status, ...cycle.projections])
      })]);
    },
    samples() {
      const current = pendingSamples;
      pendingSamples = Object.freeze([]);
      return current;
    },
    signals() {
      const current = pendingIntents;
      pendingIntents = Object.freeze([]);
      return current;
    }
  });
}

export default createHatchetThroughputModule();
