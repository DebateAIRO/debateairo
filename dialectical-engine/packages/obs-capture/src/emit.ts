import { getObsContext, type ObsContext } from "./context.js";
import {
  CAPTURE_GAP_CLASSES,
  CAPTURE_HEALTH_CODES,
  createCaptureGapCounter,
  createCaptureHealth,
  type CaptureGapCounter,
  type CaptureHealth,
} from "./health.js";

export interface CaptureQueueEntry {
  readonly kind: "envelope" | "handled_error";
  readonly payload_ref: unknown;
  readonly ambient_context_ref: ObsContext | undefined;
  readonly handled_context_ref?: unknown;
}

export interface CaptureQueuePort {
  offer(entry: CaptureQueueEntry): boolean;
}

export interface CaptureEmitter {
  emit(envelope: unknown): void;
  captureHandled(error: unknown, context: unknown): void;
}

type Schedule = (task: () => void) => void;

export function createCaptureEmitter(options: {
  readonly queue: CaptureQueuePort;
  readonly health: CaptureHealth;
  readonly gaps: CaptureGapCounter;
  readonly schedule?: Schedule;
}): CaptureEmitter {
  const schedule = options.schedule ?? queueMicrotask;

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
        });
      } catch {
        deferLoss("EMIT_FAILURE");
      }
    },
    captureHandled(error: unknown, context: unknown): void {
      try {
        enqueue({
          kind: "handled_error",
          payload_ref: error,
          ambient_context_ref: getObsContext(),
          handled_context_ref: context,
        });
      } catch {
        deferLoss("EMIT_FAILURE");
      }
    },
  });
}

const DEFAULT_HEALTH = createCaptureHealth();
const DEFAULT_GAPS = createCaptureGapCounter({ health: DEFAULT_HEALTH });
let activeEmitter: CaptureEmitter = createCaptureEmitter({
  queue: Object.freeze({ offer: () => false }),
  health: DEFAULT_HEALTH,
  gaps: DEFAULT_GAPS,
});

/** Installed lazily after register-backed bounds are available. */
export function installCaptureEmitter(emitter: CaptureEmitter): void {
  activeEmitter = emitter;
}

export function emit(envelope: unknown): void {
  try {
    activeEmitter.emit(envelope);
  } catch {
    // Product failure semantics always win over observability.
  }
}

export function captureHandled(error: unknown, context: unknown): void {
  try {
    activeEmitter.captureHandled(error, context);
  } catch {
    // Product failure semantics always win over observability.
  }
}

