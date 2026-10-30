import type { Pool } from "pg";

/** 0131 §4b: the erasure role's one page-memory function. */
export const FORGET_ERASED_DEBATE_PAGE_MEMORY = "identity.forget_erased_debate_page_memory(uuid)" as const;
/** 0132 §12: the erasure role's deletion of one debate's web evidence. */
export const FORGET_ERASED_DEBATE_WEB_EVIDENCE = "identity.forget_erased_debate_web_evidence(uuid)" as const;
/** 0133 §9: the erasure role's deletion of one debate's investigation rows. */
export const FORGET_ERASED_DEBATE_INVESTIGATION = "identity.forget_erased_debate_investigation(uuid)" as const;

/**
 * R22 item 16 (owner, 2026-10-29: "Yes, delete them too"): deleting one private debate also deletes its V4 page memory
 * (0131: its last-visit row and every dig link where it is the parent or the child) in the SAME transaction as the
 * rest of that deletion, the one that writes the run's erasure tombstone. `finalizeSql` is that finalize statement
 * (0040/0123's core.finalize_private_run_erasure or 0126's core.finalize_synthesis_check_erasure), one row with an
 * `outcome` column. The run is read from 0040's manifest first (finalize deletes the intent it names); only a COMMITTED
 * finalize, which has just written the tombstone, is followed by the deletion. Any error rolls the whole transaction
 * back, so the run stays marked and the next try (the same request again, or the reconciler) finishes both together.
 * The same transaction also deletes the debate's investigation rows (0133: an erased root takes its investigation, an
 * erased dig leaves it) and its web evidence (0132: searches, pages, page texts, readings, extracts, picks, packs and
 * researched choices).
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
        await client.query("SELECT identity.forget_erased_debate_investigation($1)", [runId]);
        await client.query("SELECT identity.forget_erased_debate_web_evidence($1)", [runId]);
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
