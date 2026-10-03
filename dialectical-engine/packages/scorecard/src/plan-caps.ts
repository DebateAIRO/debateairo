import { DEBATE_ROLES } from "@debateai/kernel";
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

/** The typed refusal of a scorecard whose Free caps break the owners' Free rule on a site that sells plans. */
export const SCORECARD_FREE_CAPS_INVALID = "SCORECARD_FREE_CAPS_INVALID" as const;

/**
 * PAID PLANS S4b (final review P3-I2; the owner's ruling of 3 October 2026) — FREE IS
 * HELD TO ITS OWN, STRICTER COST CAP: "Free gets almost the cheapest models … in Free
 * we are kind of strict", while paid Economy keeps "a little more leverage". On a site
 * that sells plans a Free ask's ECONOMY pick reads `freeCap` instead of `economyCap`
 * (packages/scorecard/src/picker.ts), so every role needs a Free money cap, set, and
 * at or below that role's Economy money cap. A role whose Economy money cap is unset
 * seats Economy's cheapest candidate, which no Free cap can stay at or below by rule,
 * so it breaks the rule too. Checked where plans are sold (hosted, billing on), after
 * the plan-cap rule; the callers refuse, never override. The figures are the owner's,
 * set when approving the scorecard; this rule invents none.
 */
export function freeCapsFollowPaidSiteRule(settings: Pick<PickerSettings, "freeCap" | "economyCap">): boolean {
  const freeCap = settings.freeCap;
  if (freeCap === undefined) return false;
  return DEBATE_ROLES.every((role) => {
    const free = freeCap[role]?.moneyMicrosPerCall ?? null;
    const economy = settings.economyCap[role]?.moneyMicrosPerCall ?? null;
    return free !== null && economy !== null && free <= economy;
  });
}
