import type {
  Module,
  ModuleConfigurationObject,
  ModuleStatusProjection,
  ProbeObservation,
  SampleIntent,
  SignalIntent
} from "../../core/types.js";
import { readPostgresCapacity, type PostgresCapacitySnapshot } from "./query.js";
import {
  createPostgresCapacityTracker,
  type PostgresCapacityThresholds
} from "./tracker.js";

export type PostgresCapacityDependencies = Readonly<{
  readSnapshot(databaseUrl: string, observedAt: Date): Promise<PostgresCapacitySnapshot>;
}>;

const productionDependencies: PostgresCapacityDependencies = Object.freeze({
  readSnapshot: readPostgresCapacity
});

function numeric(configuration: ModuleConfigurationObject, key: string, fallback: number): number {
  const value = configuration[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function thresholds(configuration: ModuleConfigurationObject): PostgresCapacityThresholds {
  return Object.freeze({
    connectionsSeverePercent: numeric(configuration, "connections_severe_percent", 80),
    connectionsFatalPercent: numeric(configuration, "connections_fatal_percent", 95),
    lockWaiterCount: numeric(configuration, "lock_waiter_count", 1),
    lockWaitSeconds: numeric(configuration, "lock_wait_s", 60),
    transactionAgeSeconds: numeric(configuration, "transaction_age_s", 300),
    idleInTransactionCount: numeric(configuration, "idle_in_transaction_count", 5),
    idleInTransactionSeconds: numeric(configuration, "idle_in_transaction_s", 120),
    clearSamples: numeric(configuration, "clear_samples", 2)
  });
}

function metric(
  key: string,
  value: number,
  unit: "COUNT" | "SECONDS" | "BYTES" | "PERCENT",
  observedAt: Date
): ModuleStatusProjection {
  return Object.freeze({ kind: "metric", key, value, unit, observedAt, view: "capacity" });
}

function samples(snapshot: PostgresCapacitySnapshot): readonly SampleIntent[] {
  return Object.freeze([
    ["capacity.postgres.connections.used", snapshot.usedConnections],
    ["capacity.postgres.connections.max", snapshot.maxConnections],
    ["capacity.postgres.lock_waiters", snapshot.lockWaiters],
    ["capacity.postgres.longest_lock_wait_s", snapshot.longestLockWaitSeconds],
    ["capacity.postgres.longest_transaction_age_s", snapshot.longestTransactionAgeSeconds],
    ["capacity.postgres.active_query_age_s", snapshot.activeQueryAgeSeconds],
    ["capacity.postgres.idle_in_transaction", snapshot.idleInTransactionCount],
    ["capacity.postgres.database.debateai_bytes", snapshot.debateaiDatabaseBytes],
    ["capacity.postgres.database.hatchet_bytes", snapshot.hatchetDatabaseBytes]
  ].map(([metricKey, value]) => Object.freeze({
    metricKey: metricKey as string,
    value: value as number,
    observedAt: snapshot.observedAt
  })));
}

function projections(snapshot: PostgresCapacitySnapshot): readonly ModuleStatusProjection[] {
  return Object.freeze([
    metric("postgres.connections.used", snapshot.usedConnections, "COUNT", snapshot.observedAt),
    metric("postgres.connections.max", snapshot.maxConnections, "COUNT", snapshot.observedAt),
    metric("postgres.lock_waiters", snapshot.lockWaiters, "COUNT", snapshot.observedAt),
    metric("postgres.longest_transaction_age_s", snapshot.longestTransactionAgeSeconds, "SECONDS", snapshot.observedAt),
    metric("postgres.active_query_age_s", snapshot.activeQueryAgeSeconds, "SECONDS", snapshot.observedAt),
    metric("postgres.idle_in_transaction", snapshot.idleInTransactionCount, "COUNT", snapshot.observedAt),
    metric("postgres.database.debateai", snapshot.debateaiDatabaseBytes, "BYTES", snapshot.observedAt),
    metric("postgres.database.hatchet", snapshot.hatchetDatabaseBytes, "BYTES", snapshot.observedAt),
    Object.freeze({
      kind: "template",
      key: "slow_queries",
      template: "SLOW_QUERIES_NOT_OBSERVABLE",
      view: "capacity"
    })
  ]);
}

export function createPostgresCapacityModule(
  dependencies: Partial<PostgresCapacityDependencies> = {}
): Module {
  const resolved = Object.freeze({ ...productionDependencies, ...dependencies });
  const tracker = createPostgresCapacityTracker();
  let pendingSamples: readonly SampleIntent[] = Object.freeze([]);
  let pendingSignals: readonly SignalIntent[] = Object.freeze([]);
  return Object.freeze({
    name: "postgres-capacity",
    cadence: Object.freeze({ intervalMs: 30_000, timeoutMs: 2_000 }),
    async probe(ctx): Promise<readonly ProbeObservation[]> {
      const snapshot = await resolved.readSnapshot(ctx.databaseUrl, ctx.now);
      const cycle = tracker.observe({ snapshot, thresholds: thresholds(ctx.thresholds) });
      pendingSamples = samples(snapshot);
      pendingSignals = cycle.intents;
      return Object.freeze([Object.freeze({
        component: "postgres",
        ok: cycle.band === "NORMAL",
        class: "CAPACITY",
        probe: "postgres_capacity",
        lastStatus: cycle.band,
        observedAt: snapshot.observedAt,
        management: "module",
        statusState: cycle.band,
        status: Object.freeze([...projections(snapshot), ...cycle.projections])
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

export default createPostgresCapacityModule();
