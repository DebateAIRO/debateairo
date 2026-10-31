import { TypedDomainError } from "@debateai/kernel";
import type { PlanId } from "./billing-plans.js";

/**
 * THE TEAM (plan 2026-10-31-r22-owner-changes decision 14): a funded debate (an internal grant, billing.run_charge_scope funding_kind
 * INTERNAL) counts as the top plan's features: web search, Thorough, digs and reports. Customers' limits do not apply; one separate team
 * limit does, a private server setting, never a figure in code (decision 18). Practice runs count as team when they run on a grant.
 *
 * The limit is one amount per calendar month (UTC), across every team member: staff.read_team_internal_spent (0140) reads what the team
 * spent, and `teamRoomMicros` says what is left. No setting: no team room at all, so a funded debate is held to its own grant alone and
 * the Team lane treats the features as off. There is no default on purpose.
 */
export const TEAM_FEATURE_PLAN_ID: PlanId = "MAX";
/** The server setting's name; its value never appears in this repository. */
export const TEAM_LIMIT_SETTING = "TEAM_LIMIT_MONTH_MICROS" as const;

export type TeamLimit = Readonly<{ monthMicros: number }>;

export function teamLimitFromEnvironment(source: Readonly<NodeJS.ProcessEnv>): TeamLimit | null {
  const text = source[TEAM_LIMIT_SETTING];
  if (text === undefined) return null;
  const value = /^[1-9][0-9]{0,15}$/u.test(text) ? Number(text) : Number.NaN;
  if (!Number.isSafeInteger(value)) throw new TypedDomainError("TEAM_LIMIT_INVALID", "The team limit setting must be a positive whole amount");
  return Object.freeze({ monthMicros: value });
}

/** The calendar month (UTC) the limit counts over. */
export function teamLimitWindow(now: Date): Readonly<{ from: Date; to: Date }> {
  return Object.freeze({
    from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
  });
}

/** What is left of the team's month, never below zero. */
export function teamRoomMicros(limit: TeamLimit, spentMicros: number): number {
  return Math.max(0, limit.monthMicros - spentMicros);
}
