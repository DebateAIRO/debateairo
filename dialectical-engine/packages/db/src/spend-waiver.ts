import type { Pool, PoolClient } from "pg";

/**
 * Side-by-side uploads spec 2026-10-21 §9, C10 (migration 0123 §7) — A SET-ASIDE DEBATE USES NONE OF THE PERSON'S QUOTA.
 *
 * A budget never hard-stops a debate, and a debate set aside because of an upload is not the person's spend:
 * `ledger.model_spend_waiver` names the run (append-only, one row per run), every person-window reader leaves its spend
 * out (`readOwnerSpentMicros`' subscription SQL and `billing.read_internal_grant_spent` for a funded person), and the
 * site's day still counts it (the money was really spent). The reasons are the set-aside reasons of the runner lane's
 * battery, identical by name and spelling, so it can reuse `SpendWaiverReason`. The writers pass the client of the
 * transaction that writes the run's terminal FAILED row, so the waiver and the FAILED commit together: area B (the
 * runner's backstop, an unsupported settings version; runner login, debateai_runtime), area C (RELEASE_NOT_SERVED; the
 * API's login) and area D's owner stop. An unknown run is the reference's 23503, an unknown reason the CHECK's 23514;
 * both are rethrown unchanged.
 */
export const SPEND_WAIVER_REASONS = Object.freeze(
  ["BACKSTOP", "OWNER_STOPPED", "SETTINGS_VERSION_UNSUPPORTED", "RELEASE_NOT_SERVED"] as const
);
export type SpendWaiverReason = (typeof SPEND_WAIVER_REASONS)[number];

/**
 * INSERT … ON CONFLICT (run_id) DO NOTHING (addendum A-x4): `written` is false when the run already had a waiver, whose
 * first reason stays, so a retried terminal write is harmless.
 */
export async function recordSpendWaiver(
  db: Pick<Pool, "query"> | PoolClient,
  runId: string,
  reason: SpendWaiverReason
): Promise<Readonly<{ written: boolean }>> {
  const result = await (db as Pick<Pool, "query">).query(
    "INSERT INTO ledger.model_spend_waiver (run_id, reason) VALUES ($1::uuid, $2) ON CONFLICT (run_id) DO NOTHING",
    [runId, reason]
  );
  return Object.freeze({ written: result.rowCount === 1 });
}
