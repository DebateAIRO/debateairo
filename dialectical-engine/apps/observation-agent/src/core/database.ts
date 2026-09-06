import pg from "pg";
import type {
  Pool,
  QueryConfig,
  QueryConfigValues,
  QueryResult,
  QueryResultRow
} from "pg";

export type ObservationDatabaseBudgetPolicy = Readonly<{
  value: Readonly<{
    resources: Readonly<{ max_database_sessions: number }>;
  }>;
}>;

export type ObservationQueryClient = Readonly<{
  query<R extends QueryResultRow = any, I = any[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    values?: QueryConfigValues<I>
  ): Promise<QueryResult<R>>;
}>;
export type ObservationDatabasePort = Readonly<{
  withClient<T>(operation: (client: ObservationQueryClient) => Promise<T>): Promise<T>;
}>;

export type ObservationDaemonDatabase = Readonly<{
  pool: Pool;
  database: ObservationDatabasePort;
}>;

export function createObservationDaemonDatabase(input: Readonly<{
  connectionString: string;
  policy: ObservationDatabaseBudgetPolicy;
}>): ObservationDaemonDatabase {
  const pool = new pg.Pool({
    connectionString: input.connectionString,
    max: Math.min(2, input.policy.value.resources.max_database_sessions)
  });
  return Object.freeze({ pool, database: createObservationDatabasePort(pool) });
}

export function createObservationDatabasePort(pool: Pool): ObservationDatabasePort {
  return Object.freeze({
    async withClient<T>(
      operation: (client: ObservationQueryClient) => Promise<T>
    ): Promise<T> {
      const checkedOut = await pool.connect();
      let active = true;
      const startedQueries: Promise<unknown>[] = [];
      const client = Object.freeze({
        query: (<R extends QueryResultRow = any, I = any[]>(
          queryTextOrConfig: string | QueryConfig<I>,
          values?: QueryConfigValues<I>
        ): Promise<QueryResult<R>> => {
          if (!active) {
            return Promise.reject(new Error("OBSERVATION_DATABASE_CLIENT_EXPIRED"));
          }
          let query: Promise<QueryResult<R>>;
          try {
            query = checkedOut.query<R, I>(queryTextOrConfig, values);
          } catch (error) {
            query = Promise.reject(error);
          }
          startedQueries.push(query);
          return query;
        })
      });

      let outcome: Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: unknown }>;
      try {
        outcome = Object.freeze({ ok: true, value: await operation(client) });
      } catch (error) {
        outcome = Object.freeze({ ok: false, error });
      }

      active = false;
      await Promise.allSettled(startedQueries);

      let cleanupError: unknown;
      try {
        await checkedOut.query("ROLLBACK");
        await checkedOut.query("RESET ROLE");
      } catch (error) {
        cleanupError = error;
      }

      const releaseReason = cleanupError === undefined
        ? undefined
        : cleanupError instanceof Error
          ? cleanupError
          : new Error("OBSERVATION_DATABASE_CLEANUP_FAILED", { cause: cleanupError });
      let releaseError: unknown;
      try {
        checkedOut.release(releaseReason);
      } catch (error) {
        releaseError = error;
      }

      if (!outcome.ok) {
        throw outcome.error;
      }
      if (cleanupError !== undefined) {
        throw cleanupError;
      }
      if (releaseError !== undefined) {
        throw releaseError;
      }
      return outcome.value;
    }
  });
}
