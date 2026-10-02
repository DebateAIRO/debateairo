import type { Pool, PoolClient } from "pg";

export type RetentionPurgeCounts = Readonly<{
  /**
   * What `legal.purge_expired_acceptance` deleted: the acceptance rows AND the account-closure rows it covers (D1's
   * revision widened the function to both legal tables; it still returns one bigint, R-36).
   */
  legal: number;
  /** What `billing.purge_expired_records` deleted over every billing table it covers (R-13). */
  records: number;
}>;

/**
 * A15 — the two sanctioned delete paths of the append-only legal and billing tables. It runs wherever the API runs
 * (acceptance records are written in every mode, A14), never only while billing is on. Each function decides by its
 * own rule what has expired (the legal rows — acceptances and the account-closure dates — six years after the
 * account's erasure, payment records ten full calendar years after the charge's year) and clamps the clock to the
 * database's own, so calling again changes nothing.
 * `runIfDue` keeps A15's yearly cadence: the first check of each UTC year on or after 2 January runs it (a process
 * started mid-year runs it at its first check).
 */
export function createRetentionPurge(deps: Readonly<{
  pool: Pick<Pool, "query"> | PoolClient;
  clock: () => Date;
  /** One content-free line (R-25): the two counts only. */
  log: (line: string) => void;
}>): Readonly<{ run(): Promise<RetentionPurgeCounts>; runIfDue(): Promise<RetentionPurgeCounts | null> }> {
  let lastPurgedYear: number | null = null;
  const count = (value: string | number | null | undefined): number => Number(value ?? 0);
  const run = async (): Promise<RetentionPurgeCounts> => {
    const now = deps.clock();
    const legal = await deps.pool.query<{ purged: string | number | null }>(
      "SELECT legal.purge_expired_acceptance($1::timestamptz) AS purged", [now]
    );
    const records = await deps.pool.query<{ purged: string | number | null }>(
      "SELECT billing.purge_expired_records($1::timestamptz) AS purged", [now]
    );
    const counts = Object.freeze({ legal: count(legal.rows[0]?.purged), records: count(records.rows[0]?.purged) });
    deps.log(JSON.stringify({ event: "retention.purged", legal: counts.legal, records: counts.records }));
    lastPurgedYear = now.getUTCFullYear();
    return counts;
  };
  return Object.freeze({
    run,
    async runIfDue(): Promise<RetentionPurgeCounts | null> {
      const now = deps.clock();
      const beforeSecondJanuary = now.getUTCMonth() === 0 && now.getUTCDate() < 2;
      if (lastPurgedYear === now.getUTCFullYear() || beforeSecondJanuary) return null;
      return run();
    }
  });
}
