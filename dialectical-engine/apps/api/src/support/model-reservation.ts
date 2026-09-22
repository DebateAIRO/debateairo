import { randomUUID } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import type {
  SupportConfigurationPort,
  SupportConfigurationState
} from "@debateai/register";
import { SupportModelError,type SupportModelPort } from "./model.js";

export type SupportSubmissionKind = "new" | "queued" | "retry" | "follow-on";

export class SupportReservationError extends TypedDomainError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = "SupportReservationError";
  }
}

export type SupportModelReservationEvent = Readonly<{
  processId: string;
  processPid: number;
  ordinaryPoolId: string;
  controlPoolId: string;
  kind: SupportSubmissionKind;
  nonce: string;
  reservationId: string;
  supportRegisterVersion: string;
  atMs: number;
  immutable: true;
  singleUse: true;
}>;

export type SupportModelReservation = Readonly<{
  reservationId: string;
  nonce: string;
  kind: SupportSubmissionKind;
  supportRegisterVersion: string;
  reservedAtMs: number;
  immutable: true;
  singleUse: true;
  runOriginalAttempt<T>(
    relayPost: (event: SupportModelReservationEvent) => Promise<T>
  ): Promise<T>;
  releaseBeforePost(): void;
}>;

type LedgerOptions = Readonly<{
  processId: string;
  processPid: number;
  ordinaryPoolId: string;
  controlPoolId: string;
  monotonicNow?: () => number;
}>;

function fail(code: string, message: string): never {
  throw new SupportReservationError(code, message);
}

function validIdentifier(value: string): boolean {
  return value.length >= 1 && value.length <= 256 && /^[A-Za-z0-9:_-]+$/u.test(value);
}

/**
 * DL1-F8. The ledger used to keep one frozen record per model call for the
 * lifetime of the process, and nothing in production ever read them back, so
 * its memory grew with uptime x the daily cap. Only the newest records are
 * retained now; the `#active` set the release path depends on is unchanged.
 */
export const SUPPORT_MODEL_RESERVATION_EVENT_CAP = 64 as const;

export class SupportModelReservationLedger {
  readonly #events: SupportModelReservationEvent[] = [];
  readonly #active = new Set<string>();
  readonly #now: () => number;

  constructor(readonly options: LedgerOptions) {
    if (!validIdentifier(options.processId)
      || !validIdentifier(options.ordinaryPoolId)
      || !validIdentifier(options.controlPoolId)
      || !Number.isSafeInteger(options.processPid)
      || options.processPid < 1) {
      fail("SUPPORT_MODEL_RESERVATION_CONTEXT_INVALID", "Support reservation context is invalid");
    }
    this.#now = options.monotonicNow ?? (() => performance.now());
  }

  timestamp(): number {
    const value = this.#now();
    if (!Number.isFinite(value) || value < 0) {
      fail("SUPPORT_MODEL_RESERVATION_CLOCK_INVALID", "Support reservation clock is invalid");
    }
    return value;
  }

  reserve(input: Readonly<{
    kind: SupportSubmissionKind;
    nonce: string;
    supportRegisterVersion: string;
    atMs: number;
  }>): SupportModelReservation {
    if (!validIdentifier(input.nonce)
      || !/^[1-9][0-9]*$/u.test(input.supportRegisterVersion)
      || !Number.isFinite(input.atMs)
      || input.atMs < 0) {
      fail("SUPPORT_MODEL_RESERVATION_INPUT_INVALID", "Support reservation input is invalid");
    }
    const reservationId = randomUUID();
    const event = Object.freeze({
      processId: this.options.processId,
      processPid: this.options.processPid,
      ordinaryPoolId: this.options.ordinaryPoolId,
      controlPoolId: this.options.controlPoolId,
      kind: input.kind,
      nonce: input.nonce,
      reservationId,
      supportRegisterVersion: input.supportRegisterVersion,
      atMs: input.atMs,
      immutable: true as const,
      singleUse: true as const
    });
    if (this.#events.length >= SUPPORT_MODEL_RESERVATION_EVENT_CAP) this.#events.shift();
    this.#events.push(event);
    this.#active.add(reservationId);
    let state: "RESERVED" | "CONSUMED" | "RELEASED" = "RESERVED";
    const release = (): void => {
      this.#active.delete(reservationId);
    };
    return Object.freeze({
      reservationId,
      nonce: input.nonce,
      kind: input.kind,
      supportRegisterVersion: input.supportRegisterVersion,
      reservedAtMs: input.atMs,
      immutable: true as const,
      singleUse: true as const,
      async runOriginalAttempt<T>(
        relayPost: (recorded: SupportModelReservationEvent) => Promise<T>
      ): Promise<T> {
        if (state !== "RESERVED") {
          fail("SUPPORT_MODEL_RESERVATION_REUSED", "A support reservation is single-use");
        }
        state = "CONSUMED";
        try {
          return await relayPost(event);
        } finally {
          state = "RELEASED";
          release();
        }
      },
      releaseBeforePost(): void {
        if (state !== "RESERVED") return;
        state = "RELEASED";
        release();
      }
    });
  }

  /** The retained window, oldest first, never longer than the cap. */
  events(): readonly SupportModelReservationEvent[] {
    return Object.freeze([...this.#events]);
  }

  activeCount(): number {
    return this.#active.size;
  }
}

export type SupportModelReservationResult =
  | Readonly<{
    kind: "RESERVED";
    modelRef: string;
    dailyCap: number;
    reservation: SupportModelReservation;
  }>
  | Readonly<{
    kind: "DISABLED";
    code: Extract<SupportConfigurationState, { kind: "DISABLED" }>["code"] | "SUPPORT_DISABLED";
  }>;

export async function reserveSupportModelCall(input: Readonly<{
  configuration: Pick<SupportConfigurationPort, "current">;
  ledger: SupportModelReservationLedger;
  kind: SupportSubmissionKind;
  nonce: string;
  signal?: AbortSignal;
}>): Promise<SupportModelReservationResult> {
  if (input.signal?.aborted === true) {
    throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
  }
  const state = await supportBoundary(input.configuration.current(),input.signal);
  const atMs = input.ledger.timestamp();
  if (state.kind === "DISABLED") {
    return Object.freeze({ kind: "DISABLED", code: state.code });
  }
  if (!state.snapshot.values.supportEnabled) {
    return Object.freeze({ kind: "DISABLED", code: "SUPPORT_DISABLED" });
  }
  return Object.freeze({
    kind: "RESERVED",
    modelRef: state.snapshot.values.supportModelRef,
    dailyCap: state.snapshot.values.supportDailyCallCap,
    reservation: input.ledger.reserve({
      kind: input.kind,
      nonce: input.nonce,
      supportRegisterVersion: state.snapshot.supportRegisterVersion,
      atMs
    })
  });
}

function supportBoundary<T>(operation: Promise<T>,signal: AbortSignal | undefined): Promise<T> {
  if (signal === undefined) return operation;
  if (signal.aborted) return Promise.reject(new SupportModelError("SUPPORT_MODEL_UNAVAILABLE"));
  return new Promise<T>((resolve,reject) => {
    let settled = false;
    const abort = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort",abort);
      reject(new SupportModelError("SUPPORT_MODEL_UNAVAILABLE"));
    };
    signal.addEventListener("abort",abort,{ once: true });
    void operation.then((value) => {
      if (settled) return;
      if (signal.aborted) {
        abort();
        return;
      }
      settled = true;
      signal.removeEventListener("abort",abort);
      resolve(value);
    },(error: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort",abort);
      reject(error);
    });
  });
}

/**
 * The only production path from SupportAgent orchestration to a provider.
 * Configuration is refreshed after all earlier waits, then the immutable
 * reservation is consumed immediately around exactly one provider attempt.
 */
export function createReservedSupportModelPort(input: Readonly<{
  configuration: Pick<SupportConfigurationPort,"current">;
  ledger: SupportModelReservationLedger;
  durableCalls: Readonly<{
    reserveModelCall(input: Readonly<{
      at: Date;dailyCap: number;callId?: string;signal?: AbortSignal;
    }>): Promise<Readonly<{ kind: "RECORDED" | "DAILY_CAP" }>>;
  }>;
  modelFor(modelRef: string): SupportModelPort | undefined;
  /**
   * V-30 review finding 3: the typed diagnostic sink (`reportSupportDiagnostic`
   * in the API's composition). The ONE condition it reports here is a configured
   * support model ref that names no composed model.
   */
  reportDiagnostic?: (diagnostic: Readonly<{ code: string }>) => void;
  kind?: () => SupportSubmissionKind;
  nonce?: () => string;
  clock?: () => Date;
}>): SupportModelPort {
  return Object.freeze({
    complete: async (request: Parameters<SupportModelPort["complete"]>[0]) => {
      if (request.signal?.aborted === true) {
        throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
      }
      const result = await reserveSupportModelCall({
        configuration: input.configuration,
        ledger: input.ledger,
        kind: input.kind?.() ?? "new",
        nonce: input.nonce?.() ?? randomUUID(),
        ...(request.signal === undefined ? {} : { signal: request.signal })
      });
      if (result.kind !== "RESERVED") {
        throw new SupportModelError(result.code === "SUPPORT_DISABLED"
          ? "SUPPORT_DISABLED" : "SUPPORT_MODEL_UNAVAILABLE");
      }
      const model = input.modelFor(result.modelRef);
      if (model === undefined) {
        result.reservation.releaseBeforePost();
        // V-30 review finding 3. The sealed `supportModelRef` and the composed
        // model map disagree — a hosted cutover that published one of them and
        // not the other. Every visitor sees DEGRADED either way; what changes
        // here is that the refusal carries the name the route layer has always
        // had for this condition, and the operator gets one line naming the ref
        // that could not be composed. A ref is configuration, never a secret.
        input.reportDiagnostic?.({
          code: `SUPPORT_RELAY_NOT_COMPOSED:${result.modelRef}`
        });
        throw new SupportModelError("SUPPORT_RELAY_NOT_COMPOSED");
      }
      let durable: Readonly<{ kind: "RECORDED" | "DAILY_CAP" }>;
      try {
        durable = await supportBoundary(input.durableCalls.reserveModelCall({
          at: input.clock?.() ?? new Date(),dailyCap: result.dailyCap,
          callId: result.reservation.reservationId,
          ...(request.signal === undefined ? {} : { signal: request.signal })
        }),request.signal);
      } catch {
        result.reservation.releaseBeforePost();
        throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
      }
      if (durable.kind !== "RECORDED") {
        result.reservation.releaseBeforePost();
        throw new SupportModelError("SUPPORT_MODEL_UNAVAILABLE");
      }
      return result.reservation.runOriginalAttempt(() => supportBoundary(
        model.complete(request),request.signal
      ));
    }
  });
}
