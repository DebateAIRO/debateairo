import { TypedDomainError } from "@debateai/kernel";

export type SupportDegradedReason = "relay" | "cap";
export type SupportDegradedSnapshot =
  | Readonly<{ degraded: false }>
  | Readonly<{ degraded: true;since: Date;reason: SupportDegradedReason }>;

export interface SupportDegradedPort {
  markUnavailable(at: Date,reason?: SupportDegradedReason): void;
  markAvailable(): void;
  beginModelAttempt(at: Date): boolean;
  endModelAttempt(): void;
  isDegraded(): SupportDegradedSnapshot;
}

export class SupportDegradedError extends TypedDomainError {
  constructor() {
    super("SUPPORT_DEGRADED_TIME_INVALID","Support degraded time is invalid");
    this.name = "SupportDegradedError";
  }
}

export class SupportDegradedState implements SupportDegradedPort {
  #state: SupportDegradedSnapshot = Object.freeze({ degraded: false });
  #probeAfterMs = 0;
  #probeInFlight = false;

  markUnavailable(at: Date,reason: SupportDegradedReason = "relay"): void {
    if (!Number.isFinite(at.getTime())) throw new SupportDegradedError();
    if (!this.#state.degraded) {
      this.#state = Object.freeze({
        degraded: true,since: new Date(at.getTime()),reason
      });
    }
    this.#probeInFlight = false;
    this.#probeAfterMs = at.getTime() + 1_000;
  }

  markAvailable(): void {
    this.#probeInFlight = false;
    this.#probeAfterMs = 0;
    this.#state = Object.freeze({ degraded: false });
  }

  beginModelAttempt(at: Date): boolean {
    const atMs = at.getTime();
    if (!Number.isFinite(atMs)) throw new SupportDegradedError();
    if (!this.#state.degraded) return true;
    if (this.#probeInFlight || atMs < this.#probeAfterMs) return false;
    this.#probeInFlight = true;
    return true;
  }

  endModelAttempt(): void {
    this.#probeInFlight = false;
  }

  isDegraded(): SupportDegradedSnapshot {
    return this.#state.degraded ? Object.freeze({
      ...this.#state,since: new Date(this.#state.since.getTime())
    }) : this.#state;
  }
}
