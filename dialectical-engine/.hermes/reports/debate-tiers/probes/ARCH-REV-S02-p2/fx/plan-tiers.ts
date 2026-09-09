export const PLAN_TIER_ROSTERS = Object.freeze({
  free: ["gpt-5.6-luna", "claude-sonnet-5"],
  premium: ["gpt-5.6-sol", "claude-opus-5", "grok-4.6"]
});
export type PlanTier = "free" | "premium";
const unrelated = 1;
