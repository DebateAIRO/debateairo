export type CorrelatedHatchetSources = Readonly<{
  state: "REST_ONLY" | "REST_AND_PROMETHEUS_MATCH" | "SOURCE_MISMATCH" | "UNKNOWN";
  restQueueDepth: number | null;
  prometheusQueueDepth: number | null;
  restObservedAt: Date | null;
  prometheusObservedAt: Date | null;
  lastObservedAt: Date | null;
}>;

type RestValue = Readonly<{ queueDepth: number; observedAt: Date }>;
type PrometheusValue =
  | Readonly<{ kind: "DISABLED" }>
  | Readonly<{ kind: "FAILED" }>
  | Readonly<{ kind: "VALUE"; queueDepth: number; observedAt: Date }>;

export function correlateHatchetSources(
  rest: RestValue | null,
  prometheus: PrometheusValue,
  previous: CorrelatedHatchetSources | null
): CorrelatedHatchetSources {
  if (rest === null || prometheus.kind === "FAILED") {
    return Object.freeze({
      state: "UNKNOWN",
      restQueueDepth: null,
      prometheusQueueDepth: null,
      restObservedAt: null,
      prometheusObservedAt: null,
      lastObservedAt: previous?.lastObservedAt ?? null
    });
  }
  if (prometheus.kind === "DISABLED") {
    return Object.freeze({
      state: "REST_ONLY",
      restQueueDepth: rest.queueDepth,
      prometheusQueueDepth: null,
      restObservedAt: rest.observedAt,
      prometheusObservedAt: null,
      lastObservedAt: rest.observedAt
    });
  }
  return Object.freeze({
    state: prometheus.queueDepth === rest.queueDepth
      ? "REST_AND_PROMETHEUS_MATCH" : "SOURCE_MISMATCH",
    restQueueDepth: rest.queueDepth,
    prometheusQueueDepth: prometheus.queueDepth,
    restObservedAt: rest.observedAt,
    prometheusObservedAt: prometheus.observedAt,
    lastObservedAt: prometheus.observedAt.getTime() >= rest.observedAt.getTime()
      ? prometheus.observedAt : rest.observedAt
  });
}
