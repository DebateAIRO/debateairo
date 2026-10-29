import type { Pool } from "pg";

/** 0130 §4b: the erasure role's one page-memory function. */
export const FORGET_ERASED_DEBATE_PAGE_MEMORY = "identity.forget_erased_debate_page_memory(uuid)" as const;

/**
 * R22 item 16 (owner, 2026-10-29: "Yes, delete them too"): deleting one private debate also deletes its V4 page memory
 * (0130: its last-visit row and every dig link where it is the parent or the child) in the SAME transaction as the
 * rest of that deletion, the one that writes the run's erasure tombstone. `finalizeSql` is that finalize statement
 * (0040/0123's core.finalize_private_run_erasure or 0126's core.finalize_synthesis_check_erasure), one row with an
 * `outcome` column. The run is read from 0040's manifest first (finalize deletes the intent it names); only a COMMITTED
 * finalize, which has just written the tombstone, is followed by the deletion. Any error rolls the whole transaction
 * back, so the run stays marked and the next try (the same request again, or the reconciler) finishes both together.
 */
export async function finalizeWithPageMemory<Outcome extends string>(
  pool: Pool,
  erasureId: string,
  finalizeSql: string,
  values: readonly unknown[]
): Promise<Outcome | undefined> {
  const client = await pool.connect();
  let broken: Error | undefined;
  try {
    await client.query("BEGIN");
    try {
      const manifest = await client.query<{ run_id: string }>(
        "SELECT run_id FROM core.private_run_erasure_manifest($1)", [erasureId]);
      const outcome = (await client.query<{ outcome: Outcome }>(finalizeSql, [...values])).rows[0]?.outcome;
      const runId = manifest.rows[0]?.run_id;
      if (outcome === "COMMITTED" && runId !== undefined) {
        await client.query("SELECT identity.forget_erased_debate_page_memory($1)", [runId]);
      }
      await client.query("COMMIT");
      return outcome;
    } catch (error) {
      // A failed ROLLBACK leaves the connection in an unknown state: it leaves the pool rather than return to it.
      await client.query("ROLLBACK").catch((rollback: unknown) => {
        broken = rollback instanceof Error ? rollback : new Error("ROLLBACK_FAILED");
      });
      throw error;
    }
  } finally {
    client.release(broken);
  }
}
