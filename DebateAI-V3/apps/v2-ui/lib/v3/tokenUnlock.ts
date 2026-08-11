import { ContractHttpError } from "@debateai/contract";

/**
 * One typed decision for what to tell the user when unlocking with a token
 * fails — read by every call site, so the message can never drift from the
 * thing that actually happened.
 *
 * The defect this closes (found live, 2026-08-11): V2's `unlockActions` wrapped
 * the check in a bare `catch` and always said "Token was rejected by the
 * coordinator." V pasted the CORRECT token against a coordinator that was not
 * running; the request died with ECONNREFUSED before any server saw it, and the
 * UI asserted a verdict that was never issued. DR-115: never state an outcome
 * the system did not observe. A refusal and an outage must not wear one face.
 *
 * The contract client already types this distinction (`ContractHttpError.code`
 * / `.status`); the UI was throwing that information away.
 */
export type TokenUnlockFailure =
  /** The coordinator answered, and it declined this token. */
  | { readonly kind: "REJECTED"; readonly message: string }
  /** No answer ever arrived — the token's validity is UNKNOWN, not bad. */
  | { readonly kind: "UNREACHABLE"; readonly message: string }
  /** The coordinator answered, but with a failure of its own. */
  | { readonly kind: "COORDINATOR_FAILED"; readonly message: string }
  /** Something failed that this seam cannot classify; say exactly that. */
  | { readonly kind: "UNCLASSIFIED"; readonly message: string };

export function classifyTokenUnlockFailure(error: unknown): TokenUnlockFailure {
  if (!(error instanceof ContractHttpError)) {
    const detail = error instanceof Error && error.message.trim().length > 0 ? error.message : "no detail reported";
    return {
      kind: "UNCLASSIFIED",
      message: `Token check failed before any verdict arrived (${detail}). The token was not rejected.`
    };
  }
  switch (error.code) {
    case "SESSION_REQUIRED":
    case "FORBIDDEN":
      return { kind: "REJECTED", message: "The coordinator rejected this token." };
    case "NETWORK_FAILURE":
      return {
        kind: "UNREACHABLE",
        message: "Could not reach the coordinator, so the token was never checked. Is the API running?"
      };
    case "RATE_LIMITED":
      return {
        kind: "COORDINATOR_FAILED",
        message: "The coordinator is rate-limiting requests, so the token was not checked. Try again shortly."
      };
    case "SERVER_FAILURE":
      return {
        kind: "COORDINATOR_FAILED",
        message: `The coordinator failed while checking the token (HTTP ${error.status}). The token was not rejected.`
      };
    case "NOT_FOUND":
      return {
        kind: "COORDINATOR_FAILED",
        message: `The coordinator has no session endpoint at this address (HTTP ${error.status}). The token was not checked.`
      };
    case "MALFORMED_REQUEST":
    case "INVALID_RESPONSE":
      return {
        kind: "COORDINATOR_FAILED",
        message: "The coordinator's reply could not be read, so the token's validity is unknown."
      };
  }
}

/** The user-facing line. Never claims a rejection the coordinator did not make. */
export function tokenUnlockFailureMessage(error: unknown): string {
  return classifyTokenUnlockFailure(error).message;
}
