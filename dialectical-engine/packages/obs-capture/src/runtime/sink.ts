import pg from "pg";

import type { CaptureDatabaseSink } from "../flusher.js";
import type { CaptureGapRow, CaptureHealthCode } from "../health.js";
import type { PostRedactionEnvelope } from "../redactor.js";
import type { SpoolWriter } from "../spool.js";

const WRITER_POOL_MAX_SEED = 2; // seed — V ratifies at FIX-01 acceptance

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
      const chain = await import("../chain/occurrence-gateway.js");
      chain.configureOccurrenceGateway(requirePool());
      await chain.appendChainedOccurrences(
        envelopes.map((envelope) => chain.materializeDirectOccurrence(envelope)),
      );
    },
    async ingestSpooledOccurrence(
      envelope: PostRedactionEnvelope,
    ): Promise<void> {
      const chain = await import("../chain/occurrence-gateway.js");
      chain.configureOccurrenceGateway(requirePool());
      await chain.appendChainedOccurrences([
        chain.materializeSpooledOccurrence(envelope, envelope.runtime),
      ]);
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
