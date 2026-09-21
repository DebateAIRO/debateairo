import type { Pool } from "pg";

export async function runIsFreePublicBound(
  pool: Pick<Pool, "query">,
  runId: string
): Promise<boolean> {
  const result = await pool.query<{ bound: boolean | null }>(
    "SELECT core.run_is_free_public_bound($1::uuid) AS bound",
    [runId]
  );
  return result.rows[0]?.bound === true;
}
