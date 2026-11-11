import type { PlanId } from "./billing-plans.js";

/**
 * THE TEAM (plan 2026-10-31-r22-owner-changes decisions 14 and 24): a funded debate (an internal grant, billing.run_charge_scope funding_kind
 * INTERNAL) counts as the top plan's features: web search, Thorough, digs and reports. Customers' limits do not apply; one team limit does.
 * That limit lives only in the database (migration 0142), never in this repository or a server setting, and only two accounts can read it.
 */
export const TEAM_FEATURE_PLAN_ID: PlanId = "MAX";

/** The calendar month (UTC) the limit counts over. */
export function teamLimitWindow(now: Date): Readonly<{ from: Date; to: Date }> {
  return Object.freeze({
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  });
}
