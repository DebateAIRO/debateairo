import type { PublicationRefusalStatement } from "./index.js";
import type { QuestionNotStartedKind } from "./question-check.js";

export type ContractErrorCode =
  | "SESSION_REQUIRED"
  | "RATE_LIMITED"
  | "NOT_FOUND"
  | "MALFORMED_REQUEST"
  | "UNPROCESSABLE"
  | "FORBIDDEN"
  | "SERVER_FAILURE"
  | "NETWORK_FAILURE"
  | "INVALID_RESPONSE";

/** What a 422 ASK_ALREADY_WAITING says about the person's waiting run. */
export type ContractWaitingRefusal = Readonly<{ runRef: string; waitsUntil: string; waitsFor?: "OWN_DEBATES" }>;

export class ContractHttpError extends Error {
  constructor(
    readonly code: ContractErrorCode,
    readonly status: number,
    message: string,
    readonly serverCode: string | null = null,
    readonly statement: PublicationRefusalStatement | null = null,
    /**
     * Budget spec §2.7: set only for 422 ASK_ALREADY_WAITING whose body parses
     * as `AskAlreadyWaitingSchema`: the waiting run and its expected start (no
     * figure), and `waitsFor` when that start waits on the person's own running
     * debates rather than a reset (final review Part 1b, Important 1). The ask
     * page shows sentence D with that time when its room re-read fails.
     */
    readonly waiting: ContractWaitingRefusal | null = null,
    /**
     * Live run events (2026-10-11): how long the server asked the caller to wait (its
     * `Retry-After`, in milliseconds), or null when it named no time. Set on any refused
     * response that carries the header — the admission gate's 429 always does.
     */
    readonly retryAfterMs: number | null = null,
    readonly questionNotStarted: Readonly<{ kind: QuestionNotStartedKind }> | null = null
  ) {
    super(message);
    this.name = "ContractHttpError";
  }
}
