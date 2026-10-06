import type { PublicationRefusalStatement } from "./index.js";

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
    readonly waiting: ContractWaitingRefusal | null = null
  ) {
    super(message);
    this.name = "ContractHttpError";
  }
}
