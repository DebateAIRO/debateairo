import { Pool } from "pg";

export const OBS_G1_READBACK_MAX_ROWS = 100 as const;
export const OBS_G1_READBACK_TIMEOUT_MS = 1_000 as const;

export interface ObsOccurrenceReadbackQuery {
  readonly baseline: bigint;
  readonly runRef: string;
  readonly runtime: string;
  readonly capturePoint: string;
}

export interface ObsOccurrenceReadbackRow {
  readonly occurrenceSequence: bigint;
  readonly runRef: string;
  readonly runtime: string;
  readonly capturePoint: string;
}

export interface ObsReadback {
  readBaseline(): Promise<bigint>;
  readRows(query: ObsOccurrenceReadbackQuery): Promise<readonly ObsOccurrenceReadbackRow[]>;
  close(): Promise<void>;
}

export class ObsReadbackFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ObsReadbackFailure";
  }
}

interface BaselineRow {
  readonly occ_seq: string;
}

interface OccurrenceRow {
  readonly occ_seq: string;
  readonly run_ref: string;
  readonly runtime: string;
  readonly capture_point: string;
}

function occurrenceSequence(value: unknown): bigint {
  if (typeof value !== "string" || !/^\d+$/u.test(value)) {
    throw new ObsReadbackFailure("ROW_READBACK_INVALID");
  }
  return BigInt(value);
}

async function closeWithinDeadline(pool: Pool): Promise<void> {
  let deadline: NodeJS.Timeout | undefined;
  const closed = pool.end();
  try {
    await Promise.race([
      closed,
      new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(
          () => reject(new ObsReadbackFailure("ROW_READBACK_CLOSE_TIMEOUT")),
          OBS_G1_READBACK_TIMEOUT_MS,
        );
        deadline.unref();
      }),
    ]);
  } finally {
    if (deadline !== undefined) clearTimeout(deadline);
    void closed.catch(() => undefined);
  }
}

export async function openObsReadbackFromEnvironment(): Promise<ObsReadback | undefined> {
  const connectionString = process.env.OBS_LISTENER_DATABASE_URL?.trim();
  if (connectionString === undefined || connectionString === "") return undefined;

  let pool: Pool;
  try {
    pool = new Pool({
      application_name: "debateai-fix08-acceptance",
      connectionString,
      connectionTimeoutMillis: OBS_G1_READBACK_TIMEOUT_MS,
      idleTimeoutMillis: OBS_G1_READBACK_TIMEOUT_MS,
      max: 1,
      query_timeout: OBS_G1_READBACK_TIMEOUT_MS,
      statement_timeout: OBS_G1_READBACK_TIMEOUT_MS,
    });
  } catch {
    throw new ObsReadbackFailure("ROW_VERIFIER_UNAVAILABLE");
  }

  let closed = false;
  return Object.freeze({
    async readBaseline(): Promise<bigint> {
      try {
        const result = await pool.query<BaselineRow>(`
          SELECT COALESCE(max(occ_seq), 0)::text AS occ_seq
          FROM obs.occurrence
        `);
        if (result.rows.length !== 1) throw new ObsReadbackFailure("ROW_READBACK_INVALID");
        return occurrenceSequence(result.rows[0]?.occ_seq);
      } catch (error) {
        if (error instanceof ObsReadbackFailure) throw error;
        throw new ObsReadbackFailure("ROW_READBACK_QUERY_FAILED");
      }
    },
    async readRows(query: ObsOccurrenceReadbackQuery): Promise<readonly ObsOccurrenceReadbackRow[]> {
      try {
        const result = await pool.query<OccurrenceRow>(`
          SELECT
            occ_seq::text AS occ_seq,
            run_ref,
            runtime,
            capture_point
          FROM obs.occurrence
          WHERE occ_seq > $1::bigint
            AND run_ref = $2
            AND runtime = $3
            AND capture_point = $4
          ORDER BY occ_seq ASC
          LIMIT $5
        `, [
          query.baseline.toString(),
          query.runRef,
          query.runtime,
          query.capturePoint,
          OBS_G1_READBACK_MAX_ROWS + 1,
        ]);
        if (result.rows.length > OBS_G1_READBACK_MAX_ROWS) {
          throw new ObsReadbackFailure("ROW_READBACK_LIMIT");
        }
        return Object.freeze(result.rows.map((row) => Object.freeze({
          occurrenceSequence: occurrenceSequence(row.occ_seq),
          runRef: row.run_ref,
          runtime: row.runtime,
          capturePoint: row.capture_point,
        })));
      } catch (error) {
        if (error instanceof ObsReadbackFailure) throw error;
        throw new ObsReadbackFailure("ROW_READBACK_QUERY_FAILED");
      }
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      try {
        await closeWithinDeadline(pool);
      } catch (error) {
        if (error instanceof ObsReadbackFailure) throw error;
        throw new ObsReadbackFailure("ROW_READBACK_CLOSE_FAILED");
      }
    },
  });
}
