import type { CaptureQueueEntry } from "./emit.js";
import {
  CAPTURE_GAP_CLASSES,
  CAPTURE_HEALTH_CODES,
  type CaptureGapCounter,
  type CaptureGapRow,
  type CaptureHealth,
} from "./health.js";
import type { ReferenceQueue } from "./queue.js";
import {
  isPostRedactionEnvelope,
  type PostRedactionEnvelope,
  type SharedRedactor,
} from "./redactor.js";
import type { SpoolWriter } from "./spool.js";

export interface CaptureDatabaseSink {
  writeOccurrences(envelopes: readonly PostRedactionEnvelope[]): Promise<void>;
  writeCaptureGap(row: CaptureGapRow): Promise<void>;
}

export interface FlushResult {
  readonly dequeued: number;
  readonly persisted: number;
  readonly spooled: number;
  readonly lost: number;
}

export interface CaptureFlusher {
  flushOnce(): Promise<FlushResult>;
}

export function createCaptureFlusher(options: {
  readonly queue: Pick<ReferenceQueue<CaptureQueueEntry>, "drain">;
  readonly redactor: SharedRedactor;
  readonly databaseSink: CaptureDatabaseSink;
  readonly spool: Pick<SpoolWriter, "append">;
  readonly health: CaptureHealth;
  readonly gaps: CaptureGapCounter;
}): CaptureFlusher {
  async function flushGapAfterSinkReturn(): Promise<void> {
    try {
      await options.gaps.flushOne((row) =>
        options.databaseSink.writeCaptureGap(row),
      );
    } catch {
      options.health.record(CAPTURE_HEALTH_CODES.GAP_WRITE_FAILURE);
    }
  }

  function spoolOne(envelope: PostRedactionEnvelope): boolean {
    try {
      options.spool.append(envelope);
      return true;
    } catch {
      options.health.record(CAPTURE_HEALTH_CODES.SPOOL_FAILURE);
      options.gaps.recordLoss(
        envelope.source,
        CAPTURE_GAP_CLASSES.SPOOL_FAILURE,
      );
      return false;
    }
  }

  return Object.freeze({
    async flushOnce(): Promise<FlushResult> {
      const queued = options.queue.drain();
      const databaseEnvelopes: PostRedactionEnvelope[] = [];
      const directSpool: PostRedactionEnvelope[] = [];
      let spooled = 0;
      let lost = 0;

      for (const queuedEntry of queued) {
        try {
          const redacted = options.redactor.redact(queuedEntry);
          if (!isPostRedactionEnvelope(redacted)) {
            throw new TypeError("REDACTOR_RETURNED_UNBRANDED_ENVELOPE");
          }
          if (redacted.code.startsWith("DATABASE_")) {
            directSpool.push(redacted);
          } else {
            databaseEnvelopes.push(redacted);
          }
        } catch {
          options.health.record(CAPTURE_HEALTH_CODES.REDACTOR_FAILURE);
          options.gaps.recordLoss(
            "unclassified",
            CAPTURE_GAP_CLASSES.REDACTOR_FAILURE,
          );
          lost += 1;
        }
      }

      for (const envelope of directSpool) {
        if (spoolOne(envelope)) {
          spooled += 1;
          await flushGapAfterSinkReturn();
        } else {
          lost += 1;
        }
      }

      let persisted = 0;
      if (databaseEnvelopes.length > 0) {
        try {
          await options.databaseSink.writeOccurrences(databaseEnvelopes);
          persisted = databaseEnvelopes.length;
          options.health.record(CAPTURE_HEALTH_CODES.FLUSH_OK);
        } catch {
          options.health.record(CAPTURE_HEALTH_CODES.POSTGRES_FAILURE);
          for (const envelope of databaseEnvelopes) {
            if (spoolOne(envelope)) {
              spooled += 1;
              await flushGapAfterSinkReturn();
            } else {
              lost += 1;
            }
          }
        }
        if (persisted > 0) {
          await flushGapAfterSinkReturn();
        }
      }

      return Object.freeze({
        dequeued: queued.length,
        persisted,
        spooled,
        lost,
      });
    },
  });
}
