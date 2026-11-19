import type { UserDekStore } from "@debateai/crypto";
import type { UnfinishedSignupExpiryPort } from "../../../packages/db/src/unfinished-signup-expiry.js";

/** How often the API looks for sign-ups to delete (0183): every ten minutes, so one outlives its 24 hours by about ten minutes at most. */
export const UNFINISHED_SIGNUP_EXPIRY_EVERY_MS = 10 * 60_000;
/** One pass: batches of this many, at most this many batches, so a backlog never holds the timer; the next pass takes the rest. */
const PASS = Object.freeze({ batch: 200, batchesPerPass: 5 });

export type UnfinishedSignupExpiryCounts = Readonly<{
  /** Sign-ups deleted in this pass. */
  expired: number;
  /** Key files destroyed (or found already gone) and taken off the owed list. */
  keys: number;
  /** Accounts or key files this pass could not finish; they stay due or owed. */
  failed: number;
  /** True when the pass stopped at its cap with more left; the next pass takes it. */
  backlog: boolean;
}>;

/**
 * 0183 — a sign-up not finished within 24 hours is deleted. An account still pending_verification or pending_mfa 24 hours
 * after its sign-up began (and after the last link it was sent ran out) held its address and its name for good; this pass
 * deletes it (identity.expire_unfinished_signup, one account a transaction, the database deciding again under the
 * account's locks) and then destroys the account's key file, which the database cannot reach. The delete writes the owed key in its own transaction, so a pass that stops
 * between the two leaves the key owed and the next pass destroys it.
 * Its caller runs it outside any request, so the API's pool sends it to the system login, which holds the cross-account
 * marker the four functions are granted to. One account that fails never stops the others; the pass then ends with
 * UNFINISHED_SIGNUP_EXPIRY_INCOMPLETE after its one content-free line (the counts only); the single-flight trigger logs
 * its own line and the next pass tries again.
 */
export function createUnfinishedSignupExpiry(deps: Readonly<{
  repository: UnfinishedSignupExpiryPort;
  users: Pick<UserDekStore, "destroy">;
  /** One content-free line: the counts only, and only when a pass did or failed something. */
  log: (line: string) => void;
}>): Readonly<{ run(): Promise<UnfinishedSignupExpiryCounts> }> {
  /** Batches of `read`'s ids through `take` until one comes back short, nothing moves, or the cap is reached (then: more is left). */
  const drain = async (read: (limit: number) => Promise<readonly string[]>, take: (id: string) => Promise<boolean>): Promise<Readonly<{ taken: number; failed: number; more: boolean }>> => {
    let taken = 0;
    let failed = 0;
    for (let batch = 0; batch < PASS.batchesPerPass; batch += 1) {
      const ids = await read(PASS.batch);
      let moved = 0;
      for (const id of ids) {
        try { if (await take(id)) moved += 1; } catch { failed += 1; }
      }
      taken += moved;
      if (ids.length < PASS.batch || moved === 0) return { taken, failed, more: false };
    }
    return { taken, failed, more: true };
  };

  return Object.freeze({
    async run(): Promise<UnfinishedSignupExpiryCounts> {
      const accounts = await drain((limit) => deps.repository.due(limit), async (userId) => await deps.repository.expire(userId) === "EXPIRED");
      const keys = await drain((limit) => deps.repository.keyCleanupOwed(limit), async (userId) => {
        await deps.users.destroy(userId);
        await deps.repository.completeKeyCleanup(userId);
        return true;
      });
      const counts = Object.freeze({ expired: accounts.taken, keys: keys.taken, failed: accounts.failed + keys.failed, backlog: accounts.more || keys.more });
      if (counts.expired > 0 || counts.keys > 0 || counts.failed > 0) {
        deps.log(JSON.stringify({ event: "signup.unfinished_expired", expired: counts.expired, keys: counts.keys, failed: counts.failed }));
      }
      if (counts.failed > 0) throw new Error("UNFINISHED_SIGNUP_EXPIRY_INCOMPLETE");
      return counts;
    }
  });
}
