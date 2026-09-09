import { z } from "zod";

export const PlanTierSchema = z.enum(["free", "premium"]);
export type PlanTier = z.infer<typeof PlanTierSchema>;

export const PLAN_TIERS = Object.freeze(["free", "premium"] as const);

export const PLAN_TIER_ROSTERS = Object.freeze({
  free: Object.freeze(["gpt-5.6-luna", "claude-sonnet-5"]),
  premium: Object.freeze(["gpt-5.6-sol", "claude-opus-5", "grok-4.6"])
} satisfies Readonly<Record<PlanTier, readonly string[]>>);
