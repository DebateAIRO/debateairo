import { randomUUID } from "node:crypto";

import { getObsContext, type ObsContext } from "./context.js";
import {
  snapshotEmittedCause,
  snapshotHandledCause,
} from "./cause-chain.js";
import {
  CAPTURE_GAP_CLASSES,
  CAPTURE_HEALTH_CODES,
  createCaptureGapCounter,
  createCaptureHealth,
  type CaptureGapCounter,
  type CaptureHealth,
} from "./health.js";
import {
  normalizeSourceEventRef,
  UNKNOWN_SOURCE_EVENT_REF,
} from "./safe-metadata.js";

export interface CaptureQueueEntry {
  readonly kind: "envelope" | "handled_error";
  readonly payload_ref: unknown;
  readonly ambient_context_ref: ObsContext | undefined;
  readonly handled_context_ref?: unknown;
  readonly cause_chain_codes_ref?: readonly string[];
  readonly source_event_ref?: string;
}

export interface CaptureQueuePort {
  offer(entry: CaptureQueueEntry): boolean;
}

export interface CaptureEmitter {
  emit(envelope: unknown): void;
  captureHandled(error: unknown, context: unknown): string;
}

type Schedule = (task: () => void) => void;
type SourceEventRef = () => string;

export function createCaptureEmitter(options: {
  readonly queue: CaptureQueuePort;
  readonly health: CaptureHealth;
  readonly gaps: CaptureGapCounter;
  readonly schedule?: Schedule;
  readonly sourceEventRef?: SourceEventRef;
}): CaptureEmitter {
  const schedule = options.schedule ?? queueMicrotask;
  const sourceEventRef = options.sourceEventRef ?? randomUUID;

  function reserveSourceEventRef(): string {
    try {
      return normalizeSourceEventRef(sourceEventRef()).value;
    } catch {
      return UNKNOWN_SOURCE_EVENT_REF;
    }
  }

  function deferLoss(code: "QUEUE_FULL" | "EMIT_FAILURE"): void {
    try {
      schedule(() => {
        options.health.record(
          code === "QUEUE_FULL"
            ? CAPTURE_HEALTH_CODES.QUEUE_FULL
            : CAPTURE_HEALTH_CODES.EMIT_FAILURE,
        );
        options.gaps.recordLoss(
          "first_party",
          code === "QUEUE_FULL"
            ? CAPTURE_GAP_CLASSES.QUEUE_FULL
            : CAPTURE_GAP_CLASSES.EMIT_FAILURE,
        );
      });
    } catch {
      // emit remains total even if the runtime scheduler is unavailable.
    }
  }

  function enqueue(entry: CaptureQueueEntry): void {
    try {
      if (!options.queue.offer(entry)) {
        deferLoss("QUEUE_FULL");
      }
    } catch {
      deferLoss("EMIT_FAILURE");
    }
  }

  return Object.freeze({
    emit(envelope: unknown): void {
      try {
        enqueue({
          kind: "envelope",
          payload_ref: envelope,
          ambient_context_ref: getObsContext(),
          cause_chain_codes_ref: snapshotEmittedCause(envelope),
        });
      } catch {
        deferLoss("EMIT_FAILURE");
      }
    },
    captureHandled(error: unknown, context: unknown): string {
      const reservedSourceEventRef = reserveSourceEventRef();
      try {
        enqueue({
          kind: "handled_error",
          payload_ref: error,
          ambient_context_ref: getObsContext(),
          handled_context_ref: context,
          cause_chain_codes_ref: snapshotHandledCause(error, context),
          source_event_ref: reservedSourceEventRef,
        });
      } catch {
        deferLoss("EMIT_FAILURE");
      }
      return reservedSourceEventRef;
    },
  });
}

const DEFAULT_HEALTH = createCaptureHealth();
const DEFAULT_GAPS = createCaptureGapCounter({ health: DEFAULT_HEALTH });
let defaultGapTransfer: Promise<void> | undefined;
let activeEmitter: CaptureEmitter = createCaptureEmitter({
  queue: Object.freeze({ offer: () => false }),
  health: DEFAULT_HEALTH,
  gaps: DEFAULT_GAPS,
});

function transferDefaultGaps(
  target: Pick<CaptureGapCounter, "recordLoss">,
): Promise<void> {
  defaultGapTransfer ??= (async () => {
    await Promise.resolve();
    while (await DEFAULT_GAPS.flushOne((row) => {
      target.recordLoss(row.source, row.gap_class, row.lost_count);
    })) {}
  })();
  return defaultGapTransfer;
}

/** Installed lazily after register-backed bounds are available. */
export function installCaptureEmitter(emitter: CaptureEmitter): void;
export function installCaptureEmitter(
  emitter: CaptureEmitter,
  pendingLossTarget: Pick<CaptureGapCounter, "recordLoss">,
): Promise<void>;
export function installCaptureEmitter(
  emitter: CaptureEmitter,
  pendingLossTarget?: Pick<CaptureGapCounter, "recordLoss">,
): void | Promise<void> {
  activeEmitter = emitter;
  if (pendingLossTarget === undefined) {
    return;
  }
  return transferDefaultGaps(pendingLossTarget);
}

export function emit(envelope: unknown): void {
  try {
    activeEmitter.emit(envelope);
  } catch {
    // Product failure semantics always win over observability.
  }
}

export function captureHandled(error: unknown, context: unknown): string {
  try {
    return activeEmitter.captureHandled(error, context);
  } catch {
    // Product failure semantics always win over observability.
    return UNKNOWN_SOURCE_EVENT_REF;
  }
}
