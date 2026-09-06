import type { ObservationDatabasePort } from "../../core/database.js";

export const CAPTURE_CURSOR_KEYS = Object.freeze({
  captureGap: "obs04.cursor.capture_gap",
  componentHealth: "obs04.cursor.component_health",
  spoolReceipt: "obs04.cursor.spool_receipt"
} as const);

export const CAPTURE_CURSOR_SELECT = `SELECT metric_key,value::text
FROM observation.sample_ring
WHERE metric_key=ANY($1::text[])
ORDER BY metric_key`;

export const CAPTURE_GAP_SELECT = `SELECT capture_gap_id,source,gap_class,lost_count,opened_at,closed_at
FROM obs.capture_gap
WHERE opened_at >= to_timestamp($1 / 1000.0) OR closed_at IS NULL
ORDER BY opened_at,capture_gap_id`;

export const COMPONENT_HEALTH_SELECT = `SELECT component,state,observed_at,detail_code
FROM obs.component_health
WHERE observed_at >= to_timestamp($1 / 1000.0) OR detail_code='FLUSH_OK'
ORDER BY observed_at,component`;

export const SPOOL_RECEIPT_SELECT = `SELECT spool_ref,reingested_at
FROM obs.spool_receipt
WHERE reingested_at >= to_timestamp($1 / 1000.0)
ORDER BY reingested_at,spool_ref`;

export const CAPTURE_CURSOR_UPSERT = `INSERT INTO observation.sample_ring(
  metric_key,bucket,observed_at,value
) VALUES ($1,0,$3,$2)
ON CONFLICT (metric_key,bucket) DO UPDATE SET
  observed_at=GREATEST(observation.sample_ring.observed_at,EXCLUDED.observed_at),
  value=GREATEST(observation.sample_ring.value,EXCLUDED.value)`;

export type CaptureGapFact = Readonly<{
  captureGapId: string;
  source: string;
  gapClass: string;
  lostCount: number;
  openedAt: Date;
  closedAt: Date | null;
}>;

export type CaptureHealthFact = Readonly<{
  runtime: string;
  state: string;
  observedAt: Date;
  detailCode: string;
}>;

export type SpoolReceiptFact = Readonly<{
  spoolRef: string;
  reingestedAt: Date;
}>;

export type CaptureCursor = Readonly<{
  captureGapMs: number;
  componentHealthMs: number;
  spoolReceiptMs: number;
}>;

export type CaptureSnapshot = Readonly<{
  state: "CURRENT" | "UNKNOWN";
  gaps: readonly CaptureGapFact[];
  health: readonly CaptureHealthFact[];
  receipts: readonly SpoolReceiptFact[];
  cursor: CaptureCursor;
}>;

type QueryClient = Readonly<{
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<Readonly<{ rows: readonly Row[] }>>;
}>;

function numericCursor(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
}

function nextCursor(previous: number, dates: readonly Date[]): number {
  return dates.reduce((maximum, date) => Math.max(maximum, date.getTime()), previous);
}

function unknown(cursor: CaptureCursor): CaptureSnapshot {
  return Object.freeze({
    state: "UNKNOWN",
    gaps: Object.freeze([]),
    health: Object.freeze([]),
    receipts: Object.freeze([]),
    cursor
  });
}

export async function readCaptureSnapshotFromClient(client: QueryClient): Promise<CaptureSnapshot> {
  let cursor: CaptureCursor = Object.freeze({
    captureGapMs: 0,
    componentHealthMs: 0,
    spoolReceiptMs: 0
  });
  try {
    await client.query("SET statement_timeout = 2000");
    const stored = await client.query<{ metric_key: string; value: string }>(
      CAPTURE_CURSOR_SELECT,
      [Object.values(CAPTURE_CURSOR_KEYS)]
    );
    const values = new Map(stored.rows.map((row) => [row.metric_key, numericCursor(row.value)]));
    cursor = Object.freeze({
      captureGapMs: values.get(CAPTURE_CURSOR_KEYS.captureGap) ?? 0,
      componentHealthMs: values.get(CAPTURE_CURSOR_KEYS.componentHealth) ?? 0,
      spoolReceiptMs: values.get(CAPTURE_CURSOR_KEYS.spoolReceipt) ?? 0
    });

    const gapRows = await client.query<{
      capture_gap_id: string;
      source: string;
      gap_class: string;
      lost_count: string | number;
      opened_at: Date;
      closed_at: Date | null;
    }>(CAPTURE_GAP_SELECT, [cursor.captureGapMs]);
    const healthRows = await client.query<{
      component: string;
      state: string;
      observed_at: Date;
      detail_code: string;
    }>(COMPONENT_HEALTH_SELECT, [cursor.componentHealthMs]);
    const receiptRows = await client.query<{
      spool_ref: string;
      reingested_at: Date;
    }>(SPOOL_RECEIPT_SELECT, [cursor.spoolReceiptMs]);

    const gaps = Object.freeze(gapRows.rows.map((row): CaptureGapFact => Object.freeze({
      captureGapId: row.capture_gap_id,
      source: row.source,
      gapClass: row.gap_class,
      lostCount: Number(row.lost_count),
      openedAt: row.opened_at,
      closedAt: row.closed_at
    })));
    const health = Object.freeze(healthRows.rows.map((row): CaptureHealthFact => Object.freeze({
      runtime: row.component,
      state: row.state,
      observedAt: row.observed_at,
      detailCode: row.detail_code
    })));
    const receipts = Object.freeze(receiptRows.rows.map((row): SpoolReceiptFact => Object.freeze({
      spoolRef: row.spool_ref,
      reingestedAt: row.reingested_at
    })));
    const advanced = Object.freeze({
      captureGapMs: nextCursor(cursor.captureGapMs, gaps.map((row) => row.openedAt)),
      componentHealthMs: nextCursor(
        cursor.componentHealthMs,
        health.map((row) => row.observedAt)
      ),
      spoolReceiptMs: nextCursor(
        cursor.spoolReceiptMs,
        receipts.map((row) => row.reingestedAt)
      )
    });
    for (const [key, value] of [
      [CAPTURE_CURSOR_KEYS.captureGap, advanced.captureGapMs],
      [CAPTURE_CURSOR_KEYS.componentHealth, advanced.componentHealthMs],
      [CAPTURE_CURSOR_KEYS.spoolReceipt, advanced.spoolReceiptMs]
    ] as const) {
      await client.query(CAPTURE_CURSOR_UPSERT, [key, value, new Date(value)]);
    }
    return Object.freeze({ state: "CURRENT", gaps, health, receipts, cursor: advanced });
  } catch {
    return unknown(cursor);
  }
}

export async function readCaptureSnapshot(
  database: ObservationDatabasePort
): Promise<CaptureSnapshot> {
  return database.withClient(readCaptureSnapshotFromClient);
}
