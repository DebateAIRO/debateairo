import pg from "pg";

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

export const POSTGRES_CAPACITY_SQL = `
WITH activity AS MATERIALIZED (
  SELECT datname,backend_type,state,wait_event_type,state_change,xact_start,
         query_start
  FROM pg_catalog.pg_stat_activity
)
SELECT
  count(*) FILTER (WHERE backend_type='client backend')::double precision AS used_connections,
  current_setting('max_connections')::double precision AS max_connections,
  count(*) FILTER (
    WHERE wait_event_type='Lock'
      AND state_change <= clock_timestamp() - $1::double precision * interval '1 second'
  )::double precision AS lock_waiters,
  coalesce(max(extract(epoch FROM clock_timestamp() - state_change)) FILTER (
    WHERE wait_event_type='Lock'
      AND state_change <= clock_timestamp() - $1::double precision * interval '1 second'
  ),0)::double precision AS longest_lock_wait_seconds,
  coalesce(max(extract(epoch FROM clock_timestamp() - xact_start)) FILTER (
    WHERE xact_start IS NOT NULL
  ),0)::double precision AS longest_transaction_age_seconds,
  coalesce(max(extract(epoch FROM clock_timestamp() - query_start)) FILTER (
    WHERE state='active'
  ),0)::double precision AS active_query_age_seconds,
  count(*) FILTER (
    WHERE state='idle in transaction'
      AND state_change <= clock_timestamp() - $2::double precision * interval '1 second'
  )::double precision AS idle_in_transaction_count,
  coalesce(max(extract(epoch FROM clock_timestamp() - state_change)) FILTER (
    WHERE state='idle in transaction'
      AND state_change <= clock_timestamp() - $2::double precision * interval '1 second'
  ),0)::double precision AS idle_in_transaction_age_seconds,
  coalesce(pg_database_size('debateai'),0)::double precision AS debateai_database_bytes,
  coalesce(pg_database_size('hatchet'),0)::double precision AS hatchet_database_bytes
FROM activity
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
  databaseUrl: string,
  observedAt: Date,
  thresholds: PostgresCapacityQueryThresholds
): Promise<PostgresCapacitySnapshot> {
  const parameters = postgresCapacityParameters(thresholds) as [number, number];
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = 2000");
    await client.query("SET LOCAL ROLE pg_monitor");
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
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
