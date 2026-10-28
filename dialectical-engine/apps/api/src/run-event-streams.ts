/**
 * Security fixes run 3 (NV-20): how many live run-event streams one sign-in session, and one account across its
 * sessions, may hold open in this API process at once. Each open stream runs a session check every 250 ms on the
 * authorization pool (staff/access.ts monitorAuthority) and a change-mark read every 1.5 s on the runtime pool.
 * A debate page opens one stream.
 */
export type RunEventStreamLimits = Readonly<{ perSession: number; perOwner: number }>;
export const RUN_EVENT_STREAM_LIMITS: RunEventStreamLimits = Object.freeze({ perSession: 4, perOwner: 8 });
/** A refused open answers 429 with this Retry-After; refusal journal lines are throttled to one per this window. */
export const RUN_EVENT_STREAM_REFUSAL = Object.freeze({ retryAfterSeconds: 30 });
export type RunEventStreamRefusal = "SESSION_STREAMS" | "OWNER_STREAMS";

function validLimit(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1;
}

export class RunEventStreamSlots {
  readonly #sessions = new Map<string, number>();
  readonly #owners = new Map<string, number>();

  constructor(private readonly limits: RunEventStreamLimits = RUN_EVENT_STREAM_LIMITS) {
    if (!validLimit(limits.perSession) || !validLimit(limits.perOwner)) {
      throw new TypeError("RUN_EVENT_STREAM_LIMITS_INVALID");
    }
  }

  /** A slot (its release is idempotent), or why none is free. Counts only go up when both are free. */
  open(key: Readonly<{ sessionId: string; ownerRef: string }>): Readonly<{ release(): void }> | RunEventStreamRefusal {
    const { sessionId, ownerRef } = key;
    if ((this.#sessions.get(sessionId) ?? 0) >= this.limits.perSession) return "SESSION_STREAMS";
    if ((this.#owners.get(ownerRef) ?? 0) >= this.limits.perOwner) return "OWNER_STREAMS";
    this.#sessions.set(sessionId, (this.#sessions.get(sessionId) ?? 0) + 1);
    this.#owners.set(ownerRef, (this.#owners.get(ownerRef) ?? 0) + 1);
    let released = false;
    return Object.freeze({
      release: () => {
        if (released) return;
        released = true;
        RunEventStreamSlots.#decrement(this.#sessions, sessionId);
        RunEventStreamSlots.#decrement(this.#owners, ownerRef);
      }
    });
  }

  /** Test seam: how many sessions and owners hold a slot now (entries at 0 are deleted, so the maps never grow). */
  held(): Readonly<{ sessions: number; owners: number }> {
    return Object.freeze({ sessions: this.#sessions.size, owners: this.#owners.size });
  }

  static #decrement(counts: Map<string, number>, key: string): void {
    const next = (counts.get(key) ?? 0) - 1;
    if (next <= 0) counts.delete(key);
    else counts.set(key, next);
  }
}
