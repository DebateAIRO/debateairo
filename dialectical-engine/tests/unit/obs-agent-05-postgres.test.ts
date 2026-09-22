import { describe, expect, it, vi } from "vitest";
import { observationRepoRoot } from "../../apps/observation-agent/src/core/paths.js";
import { createPostgresCapacityModule } from "../../apps/observation-agent/src/modules/postgres-capacity/module.js";
import {
  readPostgresCapacity,
  type PostgresCapacitySnapshot
} from "../../apps/observation-agent/src/modules/postgres-capacity/query.js";

const at = (seconds: number) => new Date(1_800_500_000_000 + seconds * 1_000);
const database = Object.freeze({
  async withClient<T>(): Promise<T> { throw new Error("UNUSED_DATABASE_PORT"); }
});

function snapshot(overrides: Partial<PostgresCapacitySnapshot> = {}): PostgresCapacitySnapshot {
  return Object.freeze({
    usedConnections: 10,
    maxConnections: 100,
    lockWaiters: 0,
    longestLockWaitSeconds: 0,
    longestTransactionAgeSeconds: 12,
    activeQueryAgeSeconds: 4,
    idleInTransactionCount: 0,
    idleInTransactionAgeSeconds: 0,
    debateaiDatabaseBytes: 23_000_000,
    hatchetDatabaseBytes: 24_000_000,
    observedAt: at(0),
    ...overrides
  });
}

function context(now = at(0), thresholds: Readonly<Record<string, number>> = {}) {
  return {
    now,
    timeoutMs: 2_000,
    database,
    stateDir: "/tmp/obs-05-fixture",
    repoRoot: observationRepoRoot(),
    targets: [],
    targetFragment: null,
    configuration: {},
    thresholds
  } as const;
}

async function observe(value: PostgresCapacitySnapshot, thresholds = {}) {
  const module = createPostgresCapacityModule({ readSnapshot: async () => value });
  const observations = await module.probe(context(value.observedAt, thresholds));
  return {
    module,
    observations,
    samples: module.samples(observations, { now: value.observedAt }),
    signals: module.signals(observations, {
      now: value.observedAt,
      thresholdVersion: 1,
      targetFragment: null,
      configuration: {},
      thresholds
    })
  };
}

describe("OBS-05 Postgres capacity", () => {
  it("passes the active lock and idle ages to the query boundary on every probe", async () => {
    const contextNow = at(0);
    const readSnapshot = vi.fn(async () => snapshot({ observedAt: contextNow }));
    const module = createPostgresCapacityModule({ readSnapshot });

    await module.probe(context(contextNow, { lock_wait_s: 7, idle_in_transaction_s: 11 }));

    expect(readSnapshot).toHaveBeenCalledWith(
      database,
      contextNow,
      { lockWaitSeconds: 7, idleInTransactionSeconds: 11 }
    );
  });

  it("builds the two ordered age parameters and rejects invalid policy before opening Postgres", async () => {
    const queryModule = await import(
      "../../apps/observation-agent/src/modules/postgres-capacity/query.js"
    );
    const parameters = Reflect.get(queryModule, "postgresCapacityParameters") as unknown;
    expect(parameters).toBeTypeOf("function");
    if (typeof parameters !== "function") return;

    expect(parameters({ lockWaitSeconds: 7, idleInTransactionSeconds: 11 })).toEqual([7, 11]);
    expect(() => parameters({ lockWaitSeconds: Number.NaN, idleInTransactionSeconds: 11 }))
      .toThrow("OBSERVATION_POSTGRES_CAPACITY_INVALID:lockWaitSeconds");
    expect(() => parameters({ lockWaitSeconds: 7, idleInTransactionSeconds: -1 }))
      .toThrow("OBSERVATION_POSTGRES_CAPACITY_INVALID:idleInTransactionSeconds");
    await expect(readPostgresCapacity(
      database,
      at(0),
      { lockWaitSeconds: -1, idleInTransactionSeconds: 11 }
    )).rejects.toThrow("OBSERVATION_POSTGRES_CAPACITY_INVALID:lockWaitSeconds");
  });

  it("runs every 30 seconds and opens measured SEVERE/FATAL connection bands", async () => {
    const severe = await observe(snapshot({ usedConnections: 80 }));
    expect(severe.module.cadence).toEqual({ intervalMs: 30_000, timeoutMs: 2_000 });
    expect(severe.signals).toEqual([expect.objectContaining({
      correlationKey: "postgres-connections",
      component: "postgres",
      class: "CAPACITY",
      state: "OPEN",
      severity: "SEVERE",
      impactCode: "IMPACT_PG_CAPACITY",
      evidence: {
        used: 80,
        max: 100,
        percent: 80,
        threshold_percent: 80,
        unit: "connections",
        observed_at: at(0).toISOString()
      },
      suspectedDefect: false,
      defectKind: null,
      runRef: null,
      workItemRef: null
    })]);

    const fatal = await observe(snapshot({ usedConnections: 95 }));
    expect(fatal.signals).toEqual([expect.objectContaining({
      severity: "FATAL",
      evidence: expect.objectContaining({ used: 95, max: 100, threshold_percent: 95 })
    })]);
    expect((await observe(snapshot({ usedConnections: 79 }))).signals).toEqual([]);
  });

  it("detects sustained lock, transaction-age and idle-in-transaction boundaries", async () => {
    const result = await observe(snapshot({
      lockWaiters: 1,
      longestLockWaitSeconds: 60,
      longestTransactionAgeSeconds: 300,
      idleInTransactionCount: 5,
      idleInTransactionAgeSeconds: 120
    }));
    expect(result.signals).toEqual(expect.arrayContaining([
      expect.objectContaining({
        correlationKey: "postgres-lock-waiters",
        severity: "SEVERE",
        impactCode: "IMPACT_PG_LOCKS",
        evidence: expect.objectContaining({ count: 1, duration_seconds: 60, threshold_seconds: 60 })
      }),
      expect.objectContaining({
        correlationKey: "postgres-long-transaction",
        severity: "SEVERE",
        impactCode: "IMPACT_PG_LONG_XACT",
        evidence: expect.objectContaining({ duration_seconds: 300, threshold_seconds: 300 })
      }),
      expect.objectContaining({
        correlationKey: "postgres-idle-transaction",
        severity: "DEGRADED",
        impactCode: "IMPACT_PG_LONG_XACT",
        evidence: expect.objectContaining({ count: 5, duration_seconds: 120, threshold_seconds: 120 })
      })
    ]));
  });

  it("samples only numeric capacity values and projects every required Postgres status row", async () => {
    const result = await observe(snapshot());
    expect(result.samples.map(({ metricKey, value }) => [metricKey, value])).toEqual([
      ["capacity.postgres.connections.used", 10],
      ["capacity.postgres.connections.max", 100],
      ["capacity.postgres.lock_waiters", 0],
      ["capacity.postgres.longest_lock_wait_s", 0],
      ["capacity.postgres.longest_transaction_age_s", 12],
      ["capacity.postgres.active_query_age_s", 4],
      ["capacity.postgres.idle_in_transaction", 0],
      ["capacity.postgres.database.debateai_bytes", 23_000_000],
      ["capacity.postgres.database.hatchet_bytes", 24_000_000]
    ]);
    expect(result.samples.every(({ value }) => Number.isFinite(value))).toBe(true);
    expect(result.observations[0]?.status).toEqual(expect.arrayContaining([
      { kind: "template", key: "slow_queries", template: "SLOW_QUERIES_NOT_OBSERVABLE", view: "capacity" },
      expect.objectContaining({ kind: "metric", key: "postgres.connections.used", value: 10, unit: "COUNT", view: "capacity" }),
      expect.objectContaining({ kind: "metric", key: "postgres.database.hatchet", value: 24_000_000, unit: "BYTES", view: "capacity" })
    ]));
  });
});
