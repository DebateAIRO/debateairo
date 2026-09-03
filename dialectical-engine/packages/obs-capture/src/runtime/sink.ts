import pg from "pg";

import type { CaptureDatabaseSink } from "../flusher.js";
import type { CaptureGapRow } from "../health.js";
import type { PostRedactionEnvelope } from "../redactor.js";

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

export interface PostgresCaptureSink extends CaptureDatabaseSink {
  close(): Promise<void>;
}

function occurrenceValues(
  envelope: PostRedactionEnvelope,
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
    "PERSISTED",
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

export function createPostgresCaptureSink(options: {
  readonly connectionString: string | undefined;
}): PostgresCaptureSink {
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
      const values = envelopes.flatMap((envelope) => occurrenceValues(envelope));
      const rows = envelopes.map((_, rowIndex) => {
        const offset = rowIndex * OCCURRENCE_COLUMNS.length;
        const parameters = OCCURRENCE_COLUMNS.map(
          (_column, columnIndex) => `$${offset + columnIndex + 1}`,
        );
        return `(${parameters.join(", ")})`;
      });
      await requirePool().query(
        `INSERT INTO obs.occurrence (${OCCURRENCE_COLUMNS.join(", ")})
         VALUES ${rows.join(", ")}
         ON CONFLICT (source, source_event_ref) DO NOTHING`,
        values,
      );
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
    async close(): Promise<void> {
      await pool?.end();
    },
  });
}
