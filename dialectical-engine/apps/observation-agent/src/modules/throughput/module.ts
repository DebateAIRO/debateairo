import type {
  ObservationDatabasePort,
  ObservationQueryClient
} from "../../core/database.js";
import type { Module, ModuleStatusProjection, ProbeObservation, SampleIntent, SignalIntent } from "../../core/types.js";
import { computeThroughputDelta, type ThroughputCounters } from "./deltas.js";
import { THROUGHPUT_COUNTERS_SELECT } from "./queries.js";
import { createRunFailureTracker } from "./tracker.js";

export type ThroughputRead = Readonly<{
  current: ThroughputCounters;
  previous: ThroughputCounters;
  fiveMinuteBaseline?: ThroughputCounters;
  hourlyBaseline?: ThroughputCounters;
}>;

export type ThroughputDependencies = Readonly<{
  read(
    database: ObservationDatabasePort,
    now?: Date,
    fiveMinuteWindow?: number,
    hourlyWindow?: number
  ): Promise<ThroughputRead>;
}>;

const metricKeys = Object.freeze({
  runSequence: "throughput.cursor.run_sequence",
  runsStarted: "throughput.cumulative.runs_started",
  terminalRuns: "throughput.cumulative.terminal_runs",
  failedRuns: "throughput.cumulative.failed_runs",
  workItemSequence: "throughput.cursor.work_item_sequence",
  completedWorkItems: "throughput.cumulative.work_items_done",
  failedWorkItems: "throughput.cumulative.work_items_failed"
} satisfies Readonly<Record<keyof ThroughputCounters, string>>);

function counters(row: Readonly<Record<string, string>>): ThroughputCounters {
  return Object.freeze({
    runSequence: Number(row.run_sequence), runsStarted: Number(row.runs_started),
    terminalRuns: Number(row.terminal_runs), failedRuns: Number(row.failed_runs),
    workItemSequence: Number(row.work_item_sequence), completedWorkItems: Number(row.completed_work_items),
    failedWorkItems: Number(row.failed_work_items)
  });
}

async function storedCounters(
  client: ObservationQueryClient,
  cutoff: Date | null
): Promise<ThroughputCounters | null> {
  const stored = await client.query<{ metric_key: string; value: string }>(`
    SELECT DISTINCT ON (metric_key) metric_key,value::text
    FROM observation.sample_ring
    WHERE metric_key = ANY($1::text[])
      AND ($2::timestamptz IS NULL OR observed_at <= $2::timestamptz)
    ORDER BY metric_key,observed_at DESC
  `, [Object.values(metricKeys), cutoff]);
  const byKey = new Map(stored.rows.map((row) => [row.metric_key, Number(row.value)]));
  if (!Object.values(metricKeys).every((key) => byKey.has(key))) return null;
  return Object.freeze(Object.fromEntries(
    Object.entries(metricKeys).map(([field, key]) => [field, byKey.get(key)!])
  )) as ThroughputCounters;
}

async function rollupCompletedHours(client: ObservationQueryClient, now: Date): Promise<void> {
  await client.query(`
    INSERT INTO observation.sample_hourly(
      sample_hourly_id,metric_key,hour,minimum,average,maximum,sample_count
    )
    SELECT md5(metric_key || ':' || date_trunc('hour',observed_at)::text)::uuid,
           metric_key,date_trunc('hour',observed_at),min(value),avg(value),max(value),count(*)::integer
    FROM observation.sample_ring
    WHERE metric_key LIKE 'throughput.window.%'
      AND observed_at >= date_trunc('hour',$1::timestamptz) - interval '24 hours'
      AND observed_at < date_trunc('hour',$1::timestamptz)
    GROUP BY metric_key,date_trunc('hour',observed_at)
    ON CONFLICT (metric_key,hour) DO NOTHING
  `, [now]);
}

async function read(
  database: ObservationDatabasePort,
  now = new Date(),
  fiveMinuteWindow = 5,
  hourlyWindow = 60
): Promise<ThroughputRead> {
  return database.withClient(async (client) => {
    await rollupCompletedHours(client, now);
    const currentResult = await client.query<Record<string, string>>(THROUGHPUT_COUNTERS_SELECT);
    const current = counters(currentResult.rows[0] ?? {});
    const previous = await storedCounters(client, null);
    const fiveMinuteBaseline = await storedCounters(
      client,
      new Date(now.getTime() - fiveMinuteWindow * 60_000)
    );
    const hourlyBaseline = await storedCounters(
      client,
      new Date(now.getTime() - hourlyWindow * 60_000)
    );
    return Object.freeze({
      current,
      previous: previous ?? current,
      fiveMinuteBaseline: fiveMinuteBaseline ?? current,
      hourlyBaseline: hourlyBaseline ?? current
    });
  });
}

const productionDependencies: ThroughputDependencies = Object.freeze({ read });

function positive(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createThroughputModule(dependencies: ThroughputDependencies = productionDependencies): Module {
  const tracker = createRunFailureTracker();
  let pendingSignals: readonly SignalIntent[] = Object.freeze([]);
  let pendingSamples: readonly SampleIntent[] = Object.freeze([]);
  return Object.freeze({
    name: "throughput",
    cadence: Object.freeze({ intervalMs: 30_000, timeoutMs: 2_000 }),
    lifecycle: Object.freeze({
      legacyCorrelationKey: tracker.legacyCorrelationKey,
      restore: tracker.restore
    }),
    async probe(ctx): Promise<readonly ProbeObservation[]> {
      const throughputWindowMinutes = positive(ctx.thresholds.window_minutes, 5);
      const windowMinutes = positive(ctx.thresholds.run_failure_window_minutes, 60);
      const snapshot = await dependencies.read(
        ctx.database,
        ctx.now,
        throughputWindowMinutes,
        windowMinutes
      );
      const delta = computeThroughputDelta(
        snapshot.fiveMinuteBaseline ?? snapshot.previous,
        snapshot.current
      );
      const hourlyDelta = computeThroughputDelta(
        snapshot.hourlyBaseline ?? snapshot.previous,
        snapshot.current
      );
      const runCycle = tracker.observe({
        failed: hourlyDelta.failedRuns,
        total: hourlyDelta.terminalRuns,
        windowStartedAt: new Date(ctx.now.getTime() - windowMinutes * 60_000),
        windowEndedAt: ctx.now
      }, {
        minimum: positive(ctx.thresholds.run_failure_minimum, 4),
        ratio: positive(ctx.thresholds.run_failure_ratio, 0.5),
        windowMinutes
      });
      pendingSignals = runCycle.intents;
      pendingSamples = Object.freeze([
        ...(Object.entries(metricKeys) as Array<[keyof ThroughputCounters, string]>)
          .map(([field, metricKey]) => Object.freeze({
            metricKey, value: snapshot.current[field], observedAt: ctx.now
          })),
        Object.freeze({ metricKey: "throughput.window.runs_started", value: delta.runsStarted, observedAt: ctx.now }),
        Object.freeze({ metricKey: "throughput.window.terminal_runs", value: delta.terminalRuns, observedAt: ctx.now }),
        Object.freeze({ metricKey: "throughput.window.failed_runs", value: delta.failedRuns, observedAt: ctx.now }),
        Object.freeze({ metricKey: "throughput.window.work_items_done", value: delta.completedWorkItems, observedAt: ctx.now }),
        Object.freeze({ metricKey: "throughput.window.work_items_failed", value: delta.failedWorkItems, observedAt: ctx.now }),
        Object.freeze({ metricKey: "throughput.window.work_items_drained", value: delta.drainedWorkItems, observedAt: ctx.now })
      ]);
      const metric = (key: string, value: number): ModuleStatusProjection => Object.freeze({
        kind: "metric", key, value, unit: "COUNT", view: "throughput", observedAt: ctx.now
      });
      return Object.freeze([Object.freeze({
        component: "runner", ok: runCycle.intents.every((intent) => intent.state !== "OPEN"),
        class: "THROUGHPUT_ANOMALY", probe: "throughput_safe_views", lastStatus: "CURRENT",
        observedAt: ctx.now, management: "module", statusState: "CURRENT",
        status: Object.freeze([
          metric("throughput.runs.started", delta.runsStarted),
          metric("throughput.runs.terminal", delta.terminalRuns),
          metric("throughput.runs.failed", delta.failedRuns),
          metric("throughput.work_items.done", delta.completedWorkItems),
          metric("throughput.work_items.failed", delta.failedWorkItems),
          metric("throughput.work_items.drained", delta.drainedWorkItems),
          ...runCycle.projections
        ])
      })]);
    },
    samples() {
      const current = pendingSamples;
      pendingSamples = Object.freeze([]);
      return current;
    },
    signals() {
      const current = pendingSignals;
      pendingSignals = Object.freeze([]);
      return current;
    }
  });
}

export default createThroughputModule();
