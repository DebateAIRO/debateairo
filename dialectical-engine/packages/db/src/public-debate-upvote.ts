import type { Pool } from "pg";

export type PublicDebateUpvoteCast = Readonly<{ outcome: "CAST" | "ALREADY" | "NOT_PUBLIC" | "ACCOUNT_INVALID"; upvotes: number | null }>;
export type PublicDebateUpvoteWithdrawn = Readonly<{ outcome: "WITHDRAWN" | "NONE"; upvotes: number | null }>;

/** The account's refusal of a cast: 0193's own (the account is not active), or the voter's key gone while the vote was written (23503). */
function accountInvalid(error: unknown): boolean {
  const record = error as Readonly<{ code?: unknown; message?: unknown }> | null;
  return record !== null && typeof record === "object" && (record.message === "PUBLIC_DEBATE_UPVOTE_ACCOUNT_INVALID" || record.code === "23503");
}

/**
 * Upvotes on public debates (migration 0193), through its definers only. It runs on the API's request pool under the caller's session, where
 * the database asks whose connection it is; never inside a cross-account frame, where that question is answered yes for every owner.
 */
export class PostgresPublicDebateUpvoteRepository {
  constructor(private readonly pool: Pool) {}

  private async one(sql: string, values: readonly unknown[]): Promise<unknown> {
    return (await this.pool.query<{ value: unknown }>(sql, [...values])).rows[0]?.value;
  }
  /** The account's upvote on a debate that is public now, with the fresh count. An account that is not active answers ACCOUNT_INVALID. */
  async cast(ownerRef: string, publicationRef: string): Promise<PublicDebateUpvoteCast> {
    try {
      const { outcome, upvotes } = await this.one("SELECT identity.cast_public_debate_upvote($1::uuid,$2::uuid) AS value", [ownerRef, publicationRef]) as PublicDebateUpvoteCast;
      return Object.freeze({ outcome, upvotes });
    } catch (error) {
      if (accountInvalid(error)) return Object.freeze({ outcome: "ACCOUNT_INVALID", upvotes: null });
      throw error;
    }
  }
  /** The account's upvote taken back, whatever the debate's state now; the count is null when the debate is not public now. */
  async withdraw(ownerRef: string, publicationRef: string): Promise<PublicDebateUpvoteWithdrawn> {
    const { outcome, upvotes } = await this.one("SELECT identity.withdraw_public_debate_upvote($1::uuid,$2::uuid) AS value", [ownerRef, publicationRef]) as PublicDebateUpvoteWithdrawn;
    return Object.freeze({ outcome, upvotes });
  }
  /** Which of the asked debates this account upvoted, sorted, whatever their state now. An empty question is answered here. */
  async readOwn(ownerRef: string, publicationRefs: readonly string[]): Promise<readonly string[]> {
    if (publicationRefs.length === 0) return Object.freeze([]);
    return Object.freeze([...await this.one("SELECT identity.read_own_public_debate_upvotes($1::uuid,$2::uuid[]) AS value", [ownerRef, [...publicationRefs]]) as readonly string[]]);
  }
}
