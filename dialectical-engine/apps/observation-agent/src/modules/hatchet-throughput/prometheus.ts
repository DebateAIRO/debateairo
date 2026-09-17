export type HatchetMetricValues = Readonly<{
  queueDepth: number;
  dispatchP95Seconds: number;
  failedTasksTotal: number;
  createdTasksTotal: number;
}>;

function samples(text: string, metric: string): readonly Readonly<{
  labels: string;
  value: number;
}>[] {
  const rows: Array<Readonly<{ labels: string; value: number }>> = [];
  for (const line of text.split("\n")) {
    const match = new RegExp(`^${metric}(\\{[^}]*\\})?\\s+([^\\s]+)$`, "u").exec(line.trim());
    if (match === null) continue;
    const value = Number(match[2]);
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError("OBSERVATION_HATCHET_METRICS_INVALID");
    }
    rows.push(Object.freeze({ labels: match[1] ?? "", value }));
  }
  return Object.freeze(rows);
}

function sum(values: readonly Readonly<{ value: number }>[], name: string): number {
  if (values.length === 0) throw new TypeError(`OBSERVATION_HATCHET_${name}_MISSING`);
  return values.reduce((total, row) => total + row.value, 0);
}

function histogramP95(text: string): number {
  const buckets = samples(text, "hatchet_queued_to_assigned_time_seconds_bucket")
    .map((row) => {
      const label = /(?:^|,)le="([^"]+)"/u.exec(row.labels.slice(1, -1))?.[1];
      const upper = label === "+Inf" ? Number.POSITIVE_INFINITY : Number(label);
      if (label === undefined || Number.isNaN(upper)) {
        throw new TypeError("OBSERVATION_HATCHET_METRICS_INVALID");
      }
      return Object.freeze({ upper, count: row.value });
    })
    .sort((left, right) => left.upper - right.upper);
  if (buckets.length === 0) {
    const direct = samples(text, "hatchet_queued_to_assigned_time_seconds")
      .find((row) => /quantile="0\.95"/u.test(row.labels));
    if (direct === undefined) throw new TypeError("OBSERVATION_HATCHET_DISPATCH_MISSING");
    return direct.value;
  }
  const total = buckets.at(-1)!.count;
  const selected = buckets.find((bucket) => bucket.count >= total * 0.95 && Number.isFinite(bucket.upper));
  return selected?.upper ?? 0;
}

export function parsePrometheusMetrics(text: string): HatchetMetricValues {
  return Object.freeze({
    queueDepth: sum(samples(text, "hatchet_tenant_queue_size"), "QUEUE"),
    dispatchP95Seconds: histogramP95(text),
    failedTasksTotal: sum(samples(text, "hatchet_failed_tasks_total"), "FAILED_TASKS"),
    createdTasksTotal: sum(samples(text, "hatchet_created_tasks_total"), "CREATED_TASKS")
  });
}
