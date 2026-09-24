import type { ObservationDatabasePort } from "../../core/database.js";

export type PostgresCapacitySnapshot = Readonly<{
  usedConnections: number;
  maxConnections: number;
  lockWaiters: number;
  longestLockWaitSeconds: number;
  longestTransactionAgeSeconds: number;
  activeQueryAgeSeconds: number;
  idleInTransactionCount: number;
  idleInTransactionAgeSeconds: number;
  debateaiDatabaseBytes: number;
  hatchetDatabaseBytes: number;
  observedAt: Date;
}>;

export type PostgresCapacityQueryThresholds = Readonly<{
  lockWaitSeconds: number;
  idleInTransactionSeconds: number;
}>;

type CapacityRow = Readonly<{
  used_connections: number;
  max_connections: number;
  lock_waiters: number;
  longest_lock_wait_seconds: number;
  longest_transaction_age_seconds: number;
  active_query_age_seconds: number;
  idle_in_transaction_count: number;
  idle_in_transaction_age_seconds: number;
  debateai_database_bytes: number;
  hatchet_database_bytes: number;
}>;

// V-29: the probe reads one definer-owned window (migrations/0068_observation_stats_window.sql)
// that returns only these ten aggregated numbers. The agent's principal holds no
// predefined role, so it can see neither other sessions' statement text nor their states
// except through this window.
export const POSTGRES_CAPACITY_SQL = `
SELECT used_connections,max_connections,lock_waiters,longest_lock_wait_seconds,
       longest_transaction_age_seconds,active_query_age_seconds,idle_in_transaction_count,
       idle_in_transaction_age_seconds,debateai_database_bytes,hatchet_database_bytes
FROM obs.postgres_capacity($1::double precision,$2::double precision)
`;

function finite(value: unknown, key: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`OBSERVATION_POSTGRES_CAPACITY_INVALID:${key}`);
  return number;
}

export function postgresCapacityParameters(
  thresholds: PostgresCapacityQueryThresholds
): readonly [number, number] {
  const lockWaitSeconds = finite(thresholds.lockWaitSeconds, "lockWaitSeconds");
  const idleInTransactionSeconds = finite(
    thresholds.idleInTransactionSeconds,
    "idleInTransactionSeconds"
  );
  return Object.freeze([lockWaitSeconds, idleInTransactionSeconds]);
}

export async function readPostgresCapacity(
  database: ObservationDatabasePort,
  observedAt: Date,
  thresholds: PostgresCapacityQueryThresholds
): Promise<PostgresCapacitySnapshot> {
  const parameters = postgresCapacityParameters(thresholds) as [number, number];
  return database.withClient(async (client) => {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 2000");
    const result = await client.query<CapacityRow>(POSTGRES_CAPACITY_SQL, parameters);
    await client.query("COMMIT");
    const row = result.rows[0];
    if (row === undefined) throw new Error("OBSERVATION_POSTGRES_CAPACITY_EMPTY");
    return Object.freeze({
      usedConnections: finite(row.used_connections, "used_connections"),
      maxConnections: finite(row.max_connections, "max_connections"),
      lockWaiters: finite(row.lock_waiters, "lock_waiters"),
      longestLockWaitSeconds: finite(row.longest_lock_wait_seconds, "longest_lock_wait_seconds"),
      longestTransactionAgeSeconds: finite(
        row.longest_transaction_age_seconds,
        "longest_transaction_age_seconds"
      ),
      activeQueryAgeSeconds: finite(row.active_query_age_seconds, "active_query_age_seconds"),
      idleInTransactionCount: finite(row.idle_in_transaction_count, "idle_in_transaction_count"),
      idleInTransactionAgeSeconds: finite(
        row.idle_in_transaction_age_seconds,
        "idle_in_transaction_age_seconds"
      ),
      debateaiDatabaseBytes: finite(row.debateai_database_bytes, "debateai_database_bytes"),
      hatchetDatabaseBytes: finite(row.hatchet_database_bytes, "hatchet_database_bytes"),
      observedAt
    });
  });
}
