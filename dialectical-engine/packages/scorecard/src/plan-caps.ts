import type { PickerSettings } from "./schema.js";

/** The typed refusal of a scorecard that breaks the owners' plan-cap rule on a site that sells plans. */
export const SCORECARD_PLAN_CAPS_INVALID = "SCORECARD_PLAN_CAPS_INVALID" as const;

/**
 * PAID PLANS S2 (spec §2.6 item 6; owner decision §1.10, 29 September 2026) — THE
 * OWNERS' PLAN-CAP RULE: Free → ECONOMY, every paid plan → BEST. The caps are
 * keyed by plan TIER (`free` caps the Free plan, `premium` every paid plan), so
 * the rule is: a `free` cap of exactly ECONOMY, and no `premium` cap below BEST
 * (absent is BEST, the top). Checked only where plans are sold (hosted, billing
 * on); the callers refuse, never override, so the public scorecard says what the
 * site does.
 */
export function planCapsFollowPaidSiteRule(caps: PickerSettings["planStrengthCaps"]): boolean {
  return caps.free === "ECONOMY" && (caps.premium === undefined || caps.premium === "BEST");
}
