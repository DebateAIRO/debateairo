import pg from "pg";

import type { CaptureDatabaseSink } from "../flusher.js";
import type { CaptureGapRow, CaptureHealthCode } from "../health.js";
import type { PostRedactionEnvelope } from "../redactor.js";
import type { SpoolWriter } from "../spool.js";

const WRITER_POOL_MAX_SEED = 2; // seed — V ratifies at FIX-01 acceptance

const OCCURRENCE_COLUMNS = Object.freeze([
  "prev_link",
  "occurred_at",
  "environment",
  "build_ref",
  "build_dirty",
  "runtime",
  "component",
  "capture_point",
  "code",
  "taxonomy_class",
  "severity",
  "condition_mark",
  "disposition",
  "fingerprint",
  "fingerprint_version",
  "redaction_policy_version",
  "allowlist_set_id",
  "fallback_minimized",
  "capture_status",
  "run_ref",
  "work_item_ref",
  "node_ref",
  "attempt_ref",
  "ledger_ref",
  "parent_occurrence_ref",
  "cause_relation",
  "at_seq_watermark",
  "frames",
  "safe_template_id",
  "template_parameters",
  "source",
  "source_event_ref",
  "zone_context",
  "attempt_index",
  "writer_identity",
] as const);
const DETAIL_INPUT_COLUMNS = Object.freeze([
  "detail_normalized_frames",
  "detail_cause_chain_codes",
  "detail_template_parameters",
] as const);
const INPUT_COLUMNS = Object.freeze([
  "input_ordinal",
  ...OCCURRENCE_COLUMNS,
  ...DETAIL_INPUT_COLUMNS,
] as const);
const INPUT_CASTS = Object.freeze([
  "bigint",
  "bytea",
  "timestamptz",
  "text",
  "text",
  "boolean",
  "text",
  "jsonb",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "integer",
  "text",
  "text",
  "boolean",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "text",
  "jsonb",
  "text",
  "jsonb",
  "text",
  "text",
  "boolean",
  "integer",
  "text",
  "jsonb",
  "jsonb",
  "jsonb",
] as const);

export interface PostgresCaptureSink extends CaptureDatabaseSink {
  ingestSpooledOccurrence(envelope: PostRedactionEnvelope): Promise<void>;
  close(): Promise<void>;
}

export type CaptureHeartbeatState =
  | "ARMED" | "SPOOL_ONLY" | "DRAINING" | "OFF";

export interface CaptureComponentHealthWrite {
  readonly component: `capture:${string}`;
  readonly state: CaptureHeartbeatState;
  readonly detailCode: CaptureHealthCode;
}

export interface CaptureRuntimeDatabaseSink extends PostgresCaptureSink {
  writeComponentHealth(row: CaptureComponentHealthWrite): Promise<void>;
}

export function createTierOneExitSink(options: {
  readonly spool: Pick<SpoolWriter, "prepare" | "appendOnExit">;
  readonly envelope: PostRedactionEnvelope;
}): () => void {
  const prepared = options.spool.prepare(options.envelope);
  let attempted = false;

  return (): void => {
    if (attempted) return;
    attempted = true;
    options.spool.appendOnExit(prepared);
  };
}

function occurrenceValues(
  envelope: PostRedactionEnvelope,
  captureStatus: "PERSISTED" | "SPOOLED",
): readonly unknown[] {
  return [
    null,
    envelope.occurred_at,
    envelope.environment,
    envelope.build_ref,
    envelope.build_dirty,
    envelope.runtime,
    JSON.stringify(envelope.component),
    envelope.capture_point,
    envelope.code,
    envelope.taxonomy_class,
    envelope.severity,
    envelope.condition_mark,
    envelope.disposition,
    envelope.fingerprint,
    envelope.fingerprint_version,
    envelope.redaction_policy_version,
    envelope.allowlist_set_id,
    envelope.fallback_minimized,
    captureStatus,
    envelope.run_ref,
    envelope.work_item_ref,
    envelope.node_ref,
    envelope.attempt_ref,
    envelope.ledger_ref,
    envelope.parent_occurrence_ref,
    envelope.cause_relation,
    envelope.at_seq_watermark,
    JSON.stringify(envelope.frames),
    envelope.safe_template_id,
    JSON.stringify(envelope.template_parameters),
    envelope.source,
    envelope.source_event_ref,
    envelope.zone_context,
    envelope.attempt_index,
    envelope.writer_identity,
  ];
}

function inputValues(
  envelope: PostRedactionEnvelope,
  captureStatus: "PERSISTED" | "SPOOLED",
  inputOrdinal: number,
): readonly unknown[] {
  return [
    inputOrdinal,
    ...occurrenceValues(envelope, captureStatus),
    JSON.stringify(envelope.frames),
    JSON.stringify(envelope.cause_chain_codes),
    JSON.stringify(envelope.template_parameters),
  ];
}

export function createPostgresCaptureSink(options: {
  readonly connectionString: string | undefined;
}): CaptureRuntimeDatabaseSink {
  const pool = options.connectionString === undefined
    ? undefined
    : new pg.Pool({
        connectionString: options.connectionString,
        max: WRITER_POOL_MAX_SEED,
      });

  function requirePool(): pg.Pool {
    if (pool === undefined) {
      throw new Error("OBS_WRITER_DATABASE_UNAVAILABLE");
    }
    return pool;
  }

  return Object.freeze({
    async writeOccurrences(
      envelopes: readonly PostRedactionEnvelope[],
    ): Promise<void> {
      if (envelopes.length === 0) return;
      const values = envelopes.flatMap((envelope, inputIndex) =>
        inputValues(envelope, "PERSISTED", inputIndex + 1)
      );
      const rows = envelopes.map((_, rowIndex) => {
        const offset = rowIndex * INPUT_COLUMNS.length;
        const parameters = INPUT_COLUMNS.map(
          (_column, columnIndex) =>
            `$${offset + columnIndex + 1}::${INPUT_CASTS[columnIndex]}`,
        );
        return `(${parameters.join(", ")})`;
      });
      await requirePool().query(
        `WITH input (${INPUT_COLUMNS.join(", ")}) AS (
           VALUES ${rows.join(", ")}
         ), ranked AS (
           SELECT input.*,
                  row_number() OVER (
                    PARTITION BY source, source_event_ref
                    ORDER BY input_ordinal
                  ) AS candidate_rank
             FROM input
         ), candidate AS (
           SELECT ${INPUT_COLUMNS.join(", ")}
             FROM ranked
            WHERE candidate_rank = 1
         ), inserted AS (
           INSERT INTO obs.occurrence (${OCCURRENCE_COLUMNS.join(", ")})
           SELECT ${OCCURRENCE_COLUMNS.join(", ")} FROM candidate
           ORDER BY input_ordinal
           ON CONFLICT (source, source_event_ref) DO NOTHING
           RETURNING occurrence_id, source, source_event_ref
         )
         INSERT INTO obs.occurrence_detail
           (occurrence_id, normalized_frames, cause_chain_codes, template_parameters)
         SELECT inserted.occurrence_id,
                candidate.detail_normalized_frames,
                candidate.detail_cause_chain_codes,
                candidate.detail_template_parameters
           FROM inserted
           JOIN candidate USING (source, source_event_ref)
          WHERE jsonb_array_length(candidate.detail_cause_chain_codes) > 0`,
        values,
      );
    },
    async ingestSpooledOccurrence(
      envelope: PostRedactionEnvelope,
    ): Promise<void> {
      const client = await requirePool().connect();
      try {
        await client.query("BEGIN");
        const inserted = await client.query<{ occurrence_id: string }>(
          `INSERT INTO obs.occurrence (${OCCURRENCE_COLUMNS.join(", ")})
           VALUES (${OCCURRENCE_COLUMNS.map(
             (_column, index) => `$${index + 1}`,
           ).join(", ")})
           ON CONFLICT (source, source_event_ref) DO NOTHING
           RETURNING occurrence_id::text`,
          [...occurrenceValues(envelope, "SPOOLED")],
        );
        const occurrenceId = inserted.rows[0]?.occurrence_id;
        if (occurrenceId !== undefined) {
          if (envelope.cause_chain_codes.length > 0) {
            await client.query(
              `INSERT INTO obs.occurrence_detail
               (occurrence_id, normalized_frames, cause_chain_codes, template_parameters)
               VALUES ($1::uuid, $2::jsonb, $3::jsonb, $4::jsonb)`,
              [
                occurrenceId,
                JSON.stringify(envelope.frames),
                JSON.stringify(envelope.cause_chain_codes),
                JSON.stringify(envelope.template_parameters),
              ],
            );
          }
          await client.query(
            `INSERT INTO obs.spool_receipt
               (source, spool_ref, occurrence_id)
             VALUES ($1, $2, $3::uuid)`,
            [envelope.source, envelope.source_event_ref, occurrenceId],
          );
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
    async writeCaptureGap(row: CaptureGapRow): Promise<void> {
      await requirePool().query(
        `INSERT INTO obs.capture_gap
           (source, gap_class, lost_count, opened_at, closed_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          row.source,
          row.gap_class,
          row.lost_count,
          row.opened_at,
          row.closed_at,
        ],
      );
    },
    async writeComponentHealth(
      row: CaptureComponentHealthWrite,
    ): Promise<void> {
      await requirePool().query(
        `INSERT INTO obs.component_health
           (component, state, observed_at, detail_code)
         VALUES ($1, $2, clock_timestamp(), $3)
         ON CONFLICT (component) DO UPDATE SET
           state = $2,
           observed_at = clock_timestamp(),
           detail_code = $3,
           updated_at = clock_timestamp()`,
        [row.component, row.state, row.detailCode],
      );
    },
    async close(): Promise<void> {
      await pool?.end();
    },
  });
}
