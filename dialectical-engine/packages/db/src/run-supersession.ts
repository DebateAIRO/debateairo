import type { Pool, PoolClient } from "pg";
import { TypedDomainError } from "@debateai/kernel";

/**
 * Side-by-side uploads spec 2026-10-21 §4, §9, §13 (migration 0123 §4) — RE-ADMISSION RECORDS.
 *
 * A debate that waits through an upload is re-admitted under the current release as a NEW run; the old row is never
 * touched. `core.run_supersession` records old → new (reason READMITTED), append-only. Its guard refuses
 * RUN_SUPERSESSION_INVALID unless the old run still waits (a wait row and no start row: a started debate is never
 * re-admitted, ruling O1) and the new run has no edge of its own (so no cycle); a second edge out of a run is the
 * primary key's 23505; once superseded, a run's start is refused RUN_SUPERSEDED. `core.run_waiting_v` no longer lists a
 * superseded run. `core.resolve_run_ref` follows the chain to the newest run, at most 16 hops
 * (RUN_SUPERSESSION_CHAIN_INVALID beyond). Both are the API's alone (SELECT, INSERT / EXECUTE for
 * debateai_billing_runtime, which the API's login holds and the runner's does not; 42501 for the runner).
 * Refusals named here surface as TypedDomainError with the SQL code as `code`;
 * every other error (a key violation, a permission refusal) is rethrown unchanged.
 */
const SUPERSESSION_REFUSALS: ReadonlySet<string> = new Set(["RUN_SUPERSESSION_INVALID", "RUN_SUPERSESSION_CHAIN_INVALID"]);

function typedRefusal(error: unknown): unknown {
  const code = error instanceof Error ? error.message : undefined;
  return code !== undefined && SUPERSESSION_REFUSALS.has(code) ? new TypedDomainError(code, code) : error;
}

/**
 * Re-admission's record, written on the START transaction's client (plan C11) together with the new run's hold and its
 * first job, so the old run leaves the line exactly when its new run is started.
 */
export async function recordRunSupersession(
  client: PoolClient,
  input: Readonly<{ oldRunId: string; newRunId: string }>
): Promise<void> {
  try {
    await client.query(
      "INSERT INTO core.run_supersession (old_run_id, new_run_id, reason) VALUES ($1, $2, 'READMITTED')",
      [input.oldRunId, input.newRunId]
    );
  } catch (error) {
    throw typedRefusal(error);
  }
}

/** The newest run an id's re-admission chain reaches; the id itself when it was never superseded (existence unchecked). */
export async function resolveRunRef(db: Pick<Pool, "query"> | PoolClient, runId: string): Promise<string> {
  let rows: ReadonlyArray<{ run_id: string | null }>;
  try {
    rows = (await (db as Pick<Pool, "query">).query<{ run_id: string | null }>(
      "SELECT core.resolve_run_ref($1::uuid)::text AS run_id", [runId]
    )).rows;
  } catch (error) {
    throw typedRefusal(error);
  }
  const resolved = rows[0]?.run_id;
  if (typeof resolved !== "string") throw new TypeError("RUN_REF_UNRESOLVED");
  return resolved;
}
