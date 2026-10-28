import type { PostgresLegacyRunClaimRepository } from "@debateai/db";
import type { AuthenticatedSession } from "./sessions.js";
import type { AuthSourceContext } from "@debateai/db";
import type { MfaPolicy } from "@debateai/register";

/** NV-01: the durable per-account attempt budget of the legacy-run claim (0125's core.legacy_claim_admit). */
export type LegacyRunClaimPolicy = Readonly<{ maxAttempts:number; windowMs:number; lockMs:number }>;

/** At most five claim attempts per account per hour; the attempt past them is refused, and so is every claim for an hour. */
export const LEGACY_RUN_CLAIM_ACCOUNT_POLICY: LegacyRunClaimPolicy = Object.freeze({
  maxAttempts:5, windowMs:3_600_000, lockMs:3_600_000
});

/**
 * The claim route's own in-process source ceiling: ten attempts per IPv4 address or IPv6 /64 per hour across accounts,
 * then an hour's refusal. `perEnrollment` is required by the type and unused (the route charges the source only).
 */
export const LEGACY_RUN_CLAIM_SOURCE_POLICY = Object.freeze({
  windowMs:3_600_000, perEnrollment:10, perSourceAcrossAccounts:10, temporaryLockMs:3_600_000, capacity:10_000
}) satisfies MfaPolicy["verificationLimits"];

export interface LegacyRunClaimApplication {
  claim(input: Readonly<{
    authenticated: AuthenticatedSession;
    legacyToken: string;
    source: AuthSourceContext;
  }>): Promise<Readonly<{
    status:"CLAIMED"|"NO_MATCH"|"SESSION_INVALID";
    claimedCount:number;
  }>|Readonly<{
    status:"RATE_LIMITED";
    claimedCount:0;
    retryAfterMs:number;
  }>>;
}

export class PostgresLegacyRunClaimApplication implements LegacyRunClaimApplication {
  constructor(
    private readonly repository: PostgresLegacyRunClaimRepository,
    private readonly policy: LegacyRunClaimPolicy
  ) {
    // lockMs >= windowMs keeps a racing admit's later window start below locked_until in practice (0125's CHECK);
    // the SQL admit refuses the same values.
    const positive = (value: number) => Number.isSafeInteger(value) && value > 0;
    if (!positive(policy.maxAttempts) || !positive(policy.windowMs) || !positive(policy.lockMs)
      || policy.windowMs < 1_000 || policy.lockMs < policy.windowMs) {
      throw new TypeError("LEGACY_RUN_CLAIM_POLICY_INVALID");
    }
  }

  async claim(input: Readonly<{
    authenticated: AuthenticatedSession;
    legacyToken: string;
    source: AuthSourceContext;
  }>) {
    // Charged first, atomically, before any hashing or SQL claim work. NO_MATCH, SESSION_INVALID and errors stay
    // charged (fail-closed); only CLAIMED clears, and the clear never lifts an active lock.
    const admission = await this.repository.admit(input.authenticated.userId, this.policy);
    if (!admission.admitted) {
      return Object.freeze({ status:"RATE_LIMITED" as const, claimedCount:0 as const, retryAfterMs:admission.retryAfterMs });
    }
    const outcome = await this.repository.claim({
      userId:input.authenticated.userId,
      ownerRef:input.authenticated.ownerRef,
      sessionId:input.authenticated.session.session_id,
      sessionTokenHash:input.authenticated.tokenHash,
      legacyToken:input.legacyToken,
      source:input.source
    });
    if (outcome.status === "CLAIMED") {
      // The claim is committed; a leftover count only shortens the budget and expires with its window.
      try { await this.repository.clearAttempts(input.authenticated.userId); } catch { /* ignored */ }
    }
    return outcome;
  }
}
