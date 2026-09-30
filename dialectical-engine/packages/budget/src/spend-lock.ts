import type { Pool, PoolClient } from "pg";

/**
 * Budget spec 2026-09-28 §2.6, paid-plans spec §2.4.2 — THE TWO LOCKS EVERY ROOM
 * DECISION TAKES, in one order, inside one transaction:
 *  - the site's day lock, the SAME key `PostgresModelSpendStore.admitNewRun`
 *    takes (model-spend.ts), so an old settings version and a new one can
 *    never decide the same day at once;
 *  - then, for a person, `debateai.cost_envelope.person:<owner_ref>`.
 * Day first, then person, always: two decisions can never deadlock. Both are
 * transaction locks, released by the COMMIT or the ROLLBACK.
 *
 * `use` writes the decision (a hold, a wait row and its reason, a run's charge
 * scope, a start mark) on the client it is given, and may do other work on other
 * connections meanwhile (the run's creation, its memory question, the lazy Free
 * entitlement). So the pool this runs on must be one no such work draws from: a
 * decision waiting for the lock must never hold a connection the decision it
 * waits for needs (apps/api/src/main.ts gives it its own pool).
 *
 * A START queues the run's first job on THIS client too (`enqueueOn`), and as
 * the decision's LAST statement: `ledger.allocate_sequence()` locks the one
 * shared sequence row until COMMIT, so any later write on another connection
 * that also allocates a sequence would wait on this transaction while it waits
 * on that write — a deadlock the database cannot see. The job then commits with
 * its hold, its charge scope and its start mark, or not at all.
 *
 * The single-key `bigint` form over `hashtextextended(<text>, 0)` — the shape
 * tests/architecture/v28-advisory-lock-shape.test.ts explains and
 * tests/architecture/b3-spend-lock-shape.test.ts pins for this file.
 */
export async function withSpendDecisionLock<T>(
  pool: Pool,
  input: Readonly<{ day: string; ownerRef: string | null }>,
  use: (client: PoolClient) => Promise<T>
): Promise<T> {
  if (typeof input?.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(input.day)) {
    throw new TypeError("SPEND_DECISION_DAY_INVALID");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(pg_catalog.hashtextextended('debateai.cost_envelope.day:' || $1, 0))",
      [input.day]
    );
    if (input.ownerRef !== null) {
      await client.query(
        "SELECT pg_advisory_xact_lock(pg_catalog.hashtextextended('debateai.cost_envelope.person:' || $1, 0))",
        [input.ownerRef]
      );
    }
    const result = await use(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
