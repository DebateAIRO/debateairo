export const CAPTURE_HEALTH_CODES = Object.freeze({
  QUEUE_FULL: "QUEUE_FULL",
  EMIT_FAILURE: "EMIT_FAILURE",
  REDACTOR_FAILURE: "REDACTOR_FAILURE",
  POSTGRES_FAILURE: "POSTGRES_FAILURE",
  SPOOL_FAILURE: "SPOOL_FAILURE",
  GAP_WRITE_FAILURE: "GAP_WRITE_FAILURE",
  FLUSH_OK: "FLUSH_OK",
} as const);

export type CaptureHealthCode =
  (typeof CAPTURE_HEALTH_CODES)[keyof typeof CAPTURE_HEALTH_CODES];

const HEALTH_CODE_SET: ReadonlySet<string> = new Set(
  Object.values(CAPTURE_HEALTH_CODES),
);

export interface CaptureHealthSnapshot {
  readonly counts: Readonly<Record<CaptureHealthCode, number>>;
  readonly suppressed_recursive: number;
}

export interface CaptureHealth {
  record(code: CaptureHealthCode): void;
  snapshot(): CaptureHealthSnapshot;
}

function zeroHealthCounts(): Record<CaptureHealthCode, number> {
  return {
    QUEUE_FULL: 0,
    EMIT_FAILURE: 0,
    REDACTOR_FAILURE: 0,
    POSTGRES_FAILURE: 0,
    SPOOL_FAILURE: 0,
    GAP_WRITE_FAILURE: 0,
    FLUSH_OK: 0,
  };
}

function boundedAdd(current: number, increment: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, current + increment);
}

export function createCaptureHealth(
  observer?: (code: CaptureHealthCode) => void,
): CaptureHealth {
  const counts = zeroHealthCounts();
  let recording = false;
  let suppressedRecursive = 0;

  return Object.freeze({
    record(code: CaptureHealthCode): void {
      if (!HEALTH_CODE_SET.has(code)) {
        return;
      }
      if (recording) {
        suppressedRecursive = boundedAdd(suppressedRecursive, 1);
        return;
      }
      recording = true;
      try {
        counts[code] = boundedAdd(counts[code], 1);
        try {
          observer?.(code);
        } catch {
          // Health observation cannot recurse into or break product capture.
        }
      } finally {
        recording = false;
      }
    },
    snapshot(): CaptureHealthSnapshot {
      return Object.freeze({
        counts: Object.freeze({ ...counts }),
        suppressed_recursive: suppressedRecursive,
      });
    },
  });
}

export const CAPTURE_GAP_CLASSES = Object.freeze({
  QUEUE_FULL: "QUEUE_FULL",
  EMIT_FAILURE: "EMIT_FAILURE",
  REDACTOR_FAILURE: "REDACTOR_FAILURE",
  SPOOL_FAILURE: "SPOOL_FAILURE",
} as const);

/**
 * The counter is intentionally volatile. Any process death that can lose it
 * must also prevent refresh of the separate positive authority proof.
 */
export const CAPTURE_GAP_AUTHORITY_CONTRACT = Object.freeze({
  storage: "PROCESS_LOCAL_ONLY",
  counter_loss: "AUTHORITY_PROOF_MUST_NOT_REFRESH",
} as const);

export type CaptureGapClass =
  (typeof CAPTURE_GAP_CLASSES)[keyof typeof CAPTURE_GAP_CLASSES];
export type CaptureSource =
  | "first_party"
  | "hatchet"
  | "ui_client"
  | "unclassified";

const CAPTURE_SOURCE_SET: ReadonlySet<string> = new Set([
  "first_party",
  "hatchet",
  "ui_client",
  "unclassified",
]);
const CAPTURE_GAP_CLASS_SET: ReadonlySet<string> = new Set(
  Object.values(CAPTURE_GAP_CLASSES),
);

interface PendingGap {
  readonly source: CaptureSource;
  readonly gap_class: CaptureGapClass;
  lost_count: number;
  readonly opened_at: Date;
}

export interface CaptureGapRow {
  readonly source: CaptureSource;
  readonly gap_class: CaptureGapClass;
  readonly lost_count: number;
  readonly opened_at: Date;
  readonly closed_at: Date;
}

export interface CaptureGapCounter {
  recordLoss(source: CaptureSource, gapClass: CaptureGapClass, count?: number): void;
  pendingLossCount(): number;
  flushOne(
    sink: (row: CaptureGapRow) => void | Promise<void>,
  ): Promise<boolean>;
}

export function createCaptureGapCounter(options: {
  readonly health: CaptureHealth;
  readonly now?: () => Date;
}): CaptureGapCounter {
  const pending = new Map<string, PendingGap>();
  const now = options.now ?? (() => new Date());

  function key(source: CaptureSource, gapClass: CaptureGapClass): string {
    return `${source}\u0000${gapClass}`;
  }

  function requeue(gapKey: string, gap: PendingGap): void {
    const concurrent = pending.get(gapKey);
    if (concurrent === undefined) {
      pending.set(gapKey, gap);
    } else {
      concurrent.lost_count = boundedAdd(
        concurrent.lost_count,
        gap.lost_count,
      );
    }
    options.health.record(CAPTURE_HEALTH_CODES.GAP_WRITE_FAILURE);
  }

  return Object.freeze({
    recordLoss(
      source: CaptureSource,
      gapClass: CaptureGapClass,
      count = 1,
    ): void {
      try {
        const safeSource = CAPTURE_SOURCE_SET.has(source)
          ? source
          : "unclassified";
        if (!CAPTURE_GAP_CLASS_SET.has(gapClass)) {
          return;
        }
        const safeCount = Number.isSafeInteger(count) && count > 0 ? count : 1;
        const gapKey = key(safeSource, gapClass);
        const existing = pending.get(gapKey);
        if (existing !== undefined) {
          existing.lost_count = boundedAdd(existing.lost_count, safeCount);
          return;
        }
        pending.set(gapKey, {
          source: safeSource,
          gap_class: gapClass,
          lost_count: safeCount,
          opened_at: now(),
        });
      } catch {
        // The positive authority proof covers loss of this process-local counter.
      }
    },
    pendingLossCount(): number {
      let total = 0;
      for (const gap of pending.values()) {
        total = boundedAdd(total, gap.lost_count);
      }
      return total;
    },
    async flushOne(
      sink: (row: CaptureGapRow) => void | Promise<void>,
    ): Promise<boolean> {
      const first = pending.entries().next();
      if (first.done === true) {
        return false;
      }
      const [gapKey, gap] = first.value;
      pending.delete(gapKey);
      let row: CaptureGapRow;
      try {
        row = Object.freeze({
          source: gap.source,
          gap_class: gap.gap_class,
          lost_count: gap.lost_count,
          opened_at: gap.opened_at,
          closed_at: now(),
        });
      } catch {
        requeue(gapKey, gap);
        return false;
      }
      try {
        await sink(row);
        return true;
      } catch {
        requeue(gapKey, gap);
        return false;
      }
    },
  });
}
