import { DEBATE_ROLES, type DebateRole } from "@debateai/kernel";
import { roleHasEligibleCandidate, type ReachableTarget } from "./picker.js";
import type { PickerSettings, Scorecard } from "./schema.js";

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

/** The typed refusal of a scorecard that cannot seat a Free ask's answer jobs on a site that sells plans. */
export const SCORECARD_FREE_ANSWER_UNSCORED = "SCORECARD_FREE_ANSWER_UNSCORED" as const;

/**
 * A declared connection as the publish command and the API boot hold it (`ProviderDiscoveryTarget`
 * in @debateai/providers, structurally): its route, maker and model, and the levels and window it
 * declares.
 */
export type DeclaredModelTarget = Readonly<{
  providerRef: string;
  maker: string;
  model: string;
  thinkingLevels?: readonly string[];
  contextWindowTokens?: number;
}>;

/**
 * PAID PLANS P4-E (Part 3b re-review M-4; the controller's ruling C4 of 3 October 2026) — A FREE ASK
 * CAN SEAT ITS ANSWER JOBS. On a site that sells plans a Free ask's ANSWER_WRITER and ANSWER_CHECKER
 * take a scored Free-roster model or none (S4b fix round 1, `roleMayFallBack` in ./picker.ts), so a
 * scorecard under which no declared Free-roster model can take one of them refuses every Free
 * question at ask time. This asks, for each of the two jobs, whether the picker's own eligibility
 * (`roleHasEligibleCandidate`, which is `eligiblePool`: listed for the job, not AVOID or UNTESTED, an
 * API route, a declared target serving a Free-roster model at the candidate's level, and a typical
 * call that fits the window under the job's sealed answer bound) admits at least one candidate. The
 * two jobs may share one model, as the picker allows. The reachable targets are the declared ones
 * serving a Free-roster model, the filter admission applies to a Free ask then
 * (`reachableInTodaysOrder` with `rosterOnly`); health is the ask's question, not this one. Checked
 * where plans are sold (hosted, billing on), after the two cap rules; the callers refuse, never
 * override.
 */
export function freeAnswerJobsFollowPaidSiteRule(input: Readonly<{
  scorecard: Scorecard;
  targets: readonly DeclaredModelTarget[];
  freeRosterModelIds: readonly string[];
  answerTokenCeilingByRole: Readonly<Record<"ANSWER_WRITER" | "ANSWER_CHECKER", number>>;
}>): boolean {
  const reachable: readonly ReachableTarget[] = input.targets
    .filter((target) => input.freeRosterModelIds.includes(target.model))
    .map((target) => Object.freeze({
      providerRef: target.providerRef,
      maker: target.maker,
      modelId: target.model,
      thinkingLevels: target.thinkingLevels ?? [],
      contextWindowTokens: target.contextWindowTokens ?? null
    }));
  const answerJobs: readonly DebateRole[] = ["ANSWER_WRITER", "ANSWER_CHECKER"];
  return answerJobs.every((role) => roleHasEligibleCandidate({
    scorecard: input.scorecard,
    mode: "HOSTED",
    reachable,
    answerTokenCeilingByRole: input.answerTokenCeilingByRole
  }, role));
}
