import { z } from "zod";

import { GENERATED_PLAN_TIER_ROSTERS } from "../generated/plan-tier-rosters.js";

export const PlanTierSchema = z.enum(["free", "premium"]);
export type PlanTier = z.infer<typeof PlanTierSchema>;

export const PLAN_TIERS = Object.freeze(["free", "premium"] as const);

export const PLAN_TIER_ROSTERS =
  GENERATED_PLAN_TIER_ROSTERS satisfies Readonly<
    Record<PlanTier, readonly string[]>
  >;
