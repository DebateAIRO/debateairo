import type { Pool } from "pg";

/**
 * A sign-up not finished within 24 hours is deleted (0183). Each method calls one SECURITY DEFINER function of the
 * cross-account marker (debateai_rls_all_accounts), so it is called outside any request, where the API's pools reach its
 * system login; no login has a right on the tables themselves. Ids only: no address and no name reaches this file.
 * Imported by its path, never through index.ts (whose bytes the migration audit pins, NATIVE_MIGRATE_MODULE_SHA256).
 */
export type UnfinishedSignupExpiryOutcome = "EXPIRED" | "NOT_DUE";

export interface UnfinishedSignupExpiryPort {
  due(limit: number): Promise<readonly string[]>;
  expire(userId: string): Promise<UnfinishedSignupExpiryOutcome>;
  keyCleanupOwed(limit: number): Promise<readonly string[]>;
  completeKeyCleanup(userId: string): Promise<boolean>;
}

export class PostgresUnfinishedSignupExpiryRepository implements UnfinishedSignupExpiryPort {
  constructor(private readonly pool: Pick<Pool, "query">) {}

  /** The accounts still pending 24 hours after their sign-up began, with no link still live, the oldest first, at most `limit` (1 to 1000). */
  async due(limit: number): Promise<readonly string[]> {
    const result = await this.pool.query<{ due: string[] }>(
      "SELECT identity.read_unfinished_signups_due($1::integer)::text[] AS due", [limit]
    );
    return Object.freeze([...(result.rows[0]?.due ?? [])]);
  }

  /**
   * Deletes one, in its own transaction, under the locks every sign-up step takes; the database asks the state, the
   * 24 hours and the links again after them. NOT_DUE for an account that is gone, finished, younger or holding a live link.
   */
  async expire(userId: string): Promise<UnfinishedSignupExpiryOutcome> {
    const result = await this.pool.query<{ outcome: string }>(
      "SELECT identity.expire_unfinished_signup($1::uuid) AS outcome", [userId]
    );
    const outcome = result.rows[0]?.outcome;
    if (outcome !== "EXPIRED" && outcome !== "NOT_DUE") throw new TypeError("UNFINISHED_SIGNUP_EXPIRY_OUTCOME_INVALID");
    return outcome;
  }

  /** The deleted sign-ups whose key file is still to be destroyed, the oldest first, at most `limit` (1 to 1000). */
  async keyCleanupOwed(limit: number): Promise<readonly string[]> {
    const result = await this.pool.query<{ owed: string[] }>(
      "SELECT identity.read_unfinished_signup_key_cleanup($1::integer)::text[] AS owed", [limit]
    );
    return Object.freeze([...(result.rows[0]?.owed ?? [])]);
  }

  /** The key file is gone: the row goes. True when this call took it. */
  async completeKeyCleanup(userId: string): Promise<boolean> {
    const result = await this.pool.query<{ taken: boolean }>(
      "SELECT identity.complete_unfinished_signup_key_cleanup($1::uuid) AS taken", [userId]
    );
    return result.rows[0]?.taken === true;
  }
}
