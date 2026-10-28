import type { Pool } from "pg";

/**
 * NV-07: the database half of the restore fence (0125 [NV-07], identity.restore_fence and its two functions). The host
 * half is a file outside every captured store (apps/api/src/restore-fence.ts). Not exported from index.ts, whose bytes
 * are sealed (NATIVE_MIGRATE_MODULE_SHA256): callers import this module by its path.
 */
/** The host file's word: its token, "MARKER" (empty or not a token: the operator's restore mark), or null (no file). */
export type RestoreFenceHostToken = string | "MARKER" | null;
export type RestoreFenceOutcome = "INITIALISED" | "ADVANCED" | "RESTORE_REVOKED";
export interface RestoreFenceSettlement {
  readonly outcome: RestoreFenceOutcome;
  readonly publicHold: boolean;
  readonly revoked: Readonly<Record<string, number>>;
}

const OUTCOMES: readonly string[] = Object.freeze(["INITIALISED", "ADVANCED", "RESTORE_REVOKED"]);

function settlementOf(rows: readonly Record<string, unknown>[]): RestoreFenceSettlement {
  const row = rows.length === 1 ? rows[0]! : undefined;
  const revoked = row?.settle_revoked;
  if (row === undefined || typeof row.settle_outcome !== "string" || !OUTCOMES.includes(row.settle_outcome)
    || typeof row.settle_public_hold !== "boolean"
    || typeof revoked !== "object" || revoked === null || Array.isArray(revoked)
    || Object.values(revoked).some((count) => !Number.isSafeInteger(count) || (count as number) < 0)) {
    throw new TypeError("RESTORE_FENCE_SETTLEMENT_INVALID");
  }
  return Object.freeze({
    outcome: row.settle_outcome as RestoreFenceOutcome,
    publicHold: row.settle_public_hold,
    revoked: Object.freeze({ ...(revoked as Record<string, number>) })
  });
}

export class PostgresRestoreFenceRepository {
  constructor(private readonly pool: Pool) {}

  /**
   * One transaction: take the fence row's lock, only then read the host file, compare and (on a mismatch) revoke in
   * SQL, write the next token to the host file, commit. A failure anywhere rolls back; a crash after the host write and
   * before the commit leaves file and row disagreeing, which the next settle treats as a restore (fails closed).
   */
  async settle(input: Readonly<{
    readHostToken(): Promise<RestoreFenceHostToken>;
    nextToken: string;
    commitHostToken(token: string): Promise<void>;
  }>): Promise<RestoreFenceSettlement> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '10s'");
      await client.query("SET LOCAL statement_timeout = '120s'");
      await client.query("SELECT identity.restore_fence_begin_v1()");
      const host = await input.readHostToken();
      const result = await client.query(
        "SELECT settle_outcome, settle_public_hold, settle_revoked FROM identity.restore_fence_settle_v1($1,$2)",
        [host, input.nextToken]
      );
      const settlement = settlementOf(result.rows);
      await input.commitHostToken(input.nextToken);
      await client.query("COMMIT");
      client.release();
      return settlement;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      client.release(true);
      throw error;
    }
  }
}
