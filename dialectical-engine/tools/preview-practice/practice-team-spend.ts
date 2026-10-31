import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/**
 * PRACTICE RUNS COUNT AS TEAM (plan 2026-10-31-r22-owner-changes decision 14). A practice runs on the operator's Mac with a throwaway
 * database, billing kept off: it spends real money through the gates, and the live ledger never sees it. So its end says what it was charged
 * and under which reference, and one of the two accounts adds that on the private team page (POST /v1/admin/team-limit/practice), once per
 * reference. The line carries no key and no setting; the reference means nothing outside that page.
 */
export function practiceTeamSpendLine(practiceRef: string, chargeMicros: number): string {
  return `team limit: add this practice on the team page: reference ${practiceRef}, charged $${(chargeMicros / 1_000_000).toFixed(6)}`;
}
/** Everything the practice's own throwaway ledger charged. */
export async function readPracticeTeamSpend(pool: Pick<Pool, "query">): Promise<Readonly<{ practiceRef: string; chargeMicros: number }>> {
  const row = (await pool.query<{ charged: string }>("SELECT coalesce(sum(charge_micros),0)::text AS charged FROM ledger.model_spend")).rows[0];
  return Object.freeze({ practiceRef: randomUUID(), chargeMicros: Number(row?.charged ?? 0) });
}
