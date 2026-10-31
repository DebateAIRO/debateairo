import type { Pool, PoolClient } from "pg";

/**
 * The team's one limit (plan 2026-10-31-r22-owner-changes decision 14): what every funded debate was charged in [from, to), across all
 * grants, through 0140's staff.read_team_internal_spent (debateai_runtime). The limit it is held to is the server's setting
 * (packages/register team-limit.ts).
 */
export async function readTeamInternalSpentMicros(pool: Pick<Pool, "query"> | PoolClient, from: Date, to: Date): Promise<number> {
  return Number((await pool.query<{ spent: string }>("SELECT staff.read_team_internal_spent($1,$2) AS spent", [from, to])).rows[0]!.spent);
}
