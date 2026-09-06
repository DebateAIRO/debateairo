import { randomUUID } from "node:crypto";
import { TypedDomainError } from "@debateai/kernel";
import type {
  SupportConfigurationPort,
  SupportConfigurationState
} from "@debateai/register";

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

  events(): readonly SupportModelReservationEvent[] {
    return Object.freeze([...this.#events]);
  }

  activeCount(): number {
    return this.#active.size;
  }
}

export type SupportModelReservationResult =
  | Readonly<{ kind: "RESERVED"; reservation: SupportModelReservation }>
  | Readonly<{
    kind: "DISABLED";
    code: Extract<SupportConfigurationState, { kind: "DISABLED" }>["code"] | "SUPPORT_DISABLED";
  }>;

export async function reserveSupportModelCall(input: Readonly<{
  configuration: Pick<SupportConfigurationPort, "current">;
  ledger: SupportModelReservationLedger;
  kind: SupportSubmissionKind;
  nonce: string;
}>): Promise<SupportModelReservationResult> {
  const state = await input.configuration.current();
  const atMs = input.ledger.timestamp();
  if (state.kind === "DISABLED") {
    return Object.freeze({ kind: "DISABLED", code: state.code });
  }
  if (!state.snapshot.values.supportEnabled) {
    return Object.freeze({ kind: "DISABLED", code: "SUPPORT_DISABLED" });
  }
  return Object.freeze({
    kind: "RESERVED",
    reservation: input.ledger.reserve({
      kind: input.kind,
      nonce: input.nonce,
      supportRegisterVersion: state.snapshot.supportRegisterVersion,
      atMs
    })
  });
}
