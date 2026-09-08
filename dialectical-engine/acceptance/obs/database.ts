import { Pool } from "pg";

import type { RawByteSource } from "./cases/corpus.js";
import type { ObsSchemaColumn } from "./cases/schema-manifest.js";

const QUERY_TIMEOUT_MS = 2_000;
const MAX_CASE_ROWS = 200;

function listenerUrl(): string | undefined {
  const value = process.env.OBS_LISTENER_DATABASE_URL?.trim();
  return value === undefined || value === "" ? undefined : value;
}

async function withListener<T>(query: (pool: Pool) => Promise<T>): Promise<T> {
  const connectionString = listenerUrl();
  if (connectionString === undefined) throw new Error("OBS_LISTENER_DATABASE_URL_MISSING");
  const pool = new Pool({
    application_name: "debateai-fix08-case-readback",
    connectionString,
    connectionTimeoutMillis: QUERY_TIMEOUT_MS,
    max: 1,
    query_timeout: QUERY_TIMEOUT_MS,
    statement_timeout: QUERY_TIMEOUT_MS,
  });
  try {
    return await query(pool);
  } finally {
    await pool.end().catch(() => undefined);
  }
}

export async function readRawObsBytes(runRef: string): Promise<readonly RawByteSource[]> {
  return withListener(async (pool) => {
    const result = await pool.query<{ source: string; payload: string }>(`
      SELECT 'occurrence:' || o.occ_seq::text AS source,
             row_to_json(o)::text AS payload
        FROM obs.occurrence o
       WHERE o.run_ref = $1
      UNION ALL
      SELECT 'detail:' || d.occurrence_detail_id::text AS source,
             row_to_json(d)::text AS payload
        FROM obs.occurrence_detail d
        JOIN obs.occurrence o USING (occurrence_id)
       WHERE o.run_ref = $1
      LIMIT $2
    `, [runRef, MAX_CASE_ROWS + 1]);
    if (result.rows.length > MAX_CASE_ROWS) throw new Error("FIX08_READBACK_LIMIT");
    return Object.freeze(result.rows.map((row) => Object.freeze({
      source: row.source,
      bytes: Buffer.from(row.payload, "utf8"),
    })));
  });
}

export async function readCorrelationRows(
  runRef: string,
): Promise<readonly Readonly<Record<string, unknown>>[]> {
  return withListener(async (pool) => {
    const result = await pool.query(`
      SELECT run_ref, work_item_ref, node_ref, attempt_ref, ledger_ref,
             parent_occurrence_ref, at_seq_watermark
        FROM obs.occurrence
       WHERE run_ref = $1
       ORDER BY occ_seq ASC
       LIMIT $2
    `, [runRef, MAX_CASE_ROWS + 1]);
    if (result.rows.length > MAX_CASE_ROWS) throw new Error("FIX08_READBACK_LIMIT");
    return Object.freeze(result.rows.map((row) => Object.freeze({ ...row })));
  });
}

export async function readObsSchemaColumns(): Promise<readonly ObsSchemaColumn[]> {
  return withListener(async (pool) => {
    const result = await pool.query<ObsSchemaColumn>(`
      SELECT table_schema, table_name, column_name, data_type
        FROM information_schema.columns
       WHERE table_schema = 'obs'
       ORDER BY table_name, ordinal_position
       LIMIT $1
    `, [MAX_CASE_ROWS + 1]);
    if (result.rows.length > MAX_CASE_ROWS) throw new Error("FIX08_SCHEMA_READBACK_LIMIT");
    return Object.freeze(result.rows.map((row) => Object.freeze({ ...row })));
  });
}
