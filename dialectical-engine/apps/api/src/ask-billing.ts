import { PLAN_TIER_ROSTERS, type AskApplied, type AskRequest, type PlanTier } from "@debateai/contract";
import type { CostEstimator, PersonAllowanceSource } from "@debateai/budget";
import { TypedDomainError } from "@debateai/kernel";
import { planById, type BillingPlan, type BillingPlans, type PlanId } from "@debateai/register";

/**
 * PAID PLANS (spec 2026-09-29 §2.3.4, §2.6 item 7; amendment R1 A5; ruling
 * R-28) — THE SERVER DECIDES THE ASK when billing is on. `main.ts` builds
 * `AskBilling` from B6b's room composition, which exists only in hosted mode
 * with the band published, and carries billing only when the published
 * `billingPolicy` says enabled: true (B4a's `assertBillingReady` ran there).
 * Without it, `submit` and the room read take the client's settings exactly as
 * today.
 */
export const ASK_SIGN_IN_REQUIRED = "ASK_SIGN_IN_REQUIRED" as const;

/** How /new marks the Free defaults today (apps/ui/app/new/defaults.tsx `buildNewDebateAskConfig`). */
const FREE_GAUGE_SOURCE = Object.freeze({
  tierSource: "MACHINE_DEFAULT" as const,
  provenanceRef: "machine:plan-tier-free"
});

export type AskBilling = Readonly<{
  plans: BillingPlans;
  /** `EntitlementRepository` (B5), as B6b's composition holds it: lazily writes the Free sign-up event. */
  entitlements: Readonly<{ current(ownerRef: string, now: Date): Promise<Readonly<{ planId: PlanId; eventId: string }>> }>;
  /** The objects B6b's room decision uses (its composition's `personAllowance`, `spend`, `estimator`); the coarse fit reads them too. */
  coarseFit: Readonly<{
    personAllowance: PersonAllowanceSource;
    spend: Readonly<{
      readOwnerSpentMicros(ownerRef: string, from: Date, to: Date): Promise<number>;
      readOwnerCountedHoldsMicros(ownerRef: string): Promise<number>;
    }>;
    estimator: CostEstimator;
  }>;
  clock: () => Date;
}>;

export type BillingAskResolution = Readonly<{
  ask: AskRequest;
  planId: PlanId;
  entitlementEventId: string;
  normalised: boolean;
}>;

/** The gauges an ask carries, in the accepted reply's words. */
export function appliedAskOf(ask: AskRequest): AskApplied {
  return Object.freeze({
    plan_tier: ask.plan_tier,
    risk_tier: ask.risk_tier,
    composition_budget_tier: ask.composition_budget_tier,
    depth: ask.depth_params.depth
  });
}

/** The three settings the room is read for and the run's cost class is built from. */
export type AskSettings = Pick<AskRequest, "plan_tier" | "composition_budget_tier" | "depth_params">;

function freeGaugesOf(plan: BillingPlan): NonNullable<BillingPlan["fixedGauges"]> {
  const gauges = plan.fixedGauges;
  if (gauges === null) {
    throw new TypedDomainError("BILLING_PLAN_GAUGES_MISSING", "The Free plan in force carries no fixed gauges");
  }
  return gauges;
}

/**
 * The settings a plan runs (R-28): a paid plan raises the tier to premium and
 * keeps the person's composition and depth; Free runs its sealed gauges.
 */
export function decideSettingsForPlan<T extends AskSettings>(settings: T, plan: BillingPlan): T {
  if (plan.tier === "premium") {
    return settings.plan_tier === "premium" ? settings : Object.freeze({ ...settings, plan_tier: "premium" as const });
  }
  const gauges = freeGaugesOf(plan);
  if (settings.plan_tier === "free" && settings.composition_budget_tier === gauges.compositionBudgetTier
    && settings.depth_params.depth === gauges.depth) {
    return settings;
  }
  return Object.freeze({
    ...settings,
    plan_tier: "free" as const,
    composition_budget_tier: gauges.compositionBudgetTier,
    depth_params: Object.freeze({ depth: gauges.depth })
  });
}

/**
 * The plan's tier, and for Free its sealed fixed gauges, as /new's Free reset
 * would have sent them. A paid plan keeps every gauge the person chose.
 */
export function normaliseAskForPlan(ask: AskRequest, plan: BillingPlan): Readonly<{ ask: AskRequest; normalised: boolean }> {
  if (plan.tier === "premium") {
    return Object.freeze({ ask: decideSettingsForPlan(ask, plan), normalised: false });
  }
  const gauges = freeGaugesOf(plan);
  const normalised = ask.plan_tier !== "free"
    || ask.risk_tier !== gauges.riskTier
    || ask.tier_source !== FREE_GAUGE_SOURCE.tierSource
    || ask.tier_provenance_ref !== FREE_GAUGE_SOURCE.provenanceRef
    || ask.composition_budget_tier !== gauges.compositionBudgetTier
    || ask.depth_params.depth !== gauges.depth;
  if (!normalised) return Object.freeze({ ask, normalised: false });
  return Object.freeze({
    ask: Object.freeze({
      ...ask,
      plan_tier: "free" as const,
      risk_tier: gauges.riskTier,
      tier_source: FREE_GAUGE_SOURCE.tierSource,
      tier_provenance_ref: FREE_GAUGE_SOURCE.provenanceRef,
      composition_budget_tier: gauges.compositionBudgetTier,
      depth_params: Object.freeze({ depth: gauges.depth })
    }),
    normalised: true
  });
}

export async function resolveBillingAsk(
  ask: AskRequest,
  ownerRef: string,
  billing: AskBilling,
  now: Date
): Promise<BillingAskResolution> {
  const entitlement = await billing.entitlements.current(ownerRef, now);
  const plan = planById(billing.plans, entitlement.planId);
  const normalised = normaliseAskForPlan(ask, plan);
  return Object.freeze({
    ask: normalised.ask,
    planId: plan.planId,
    entitlementEventId: entitlement.eventId,
    normalised: normalised.normalised
  });
}

/**
 * R-28: GET /v1/asks/room reads the room for the settings `submit` would run.
 * Without billing, or without a signed-in owner (whose ask `submit` would
 * refuse with ASK_SIGN_IN_REQUIRED), the query is read as sent. The interim
 * coarse fit is not applied here: a premium ask that does not fit reads CLOSE
 * on its own roster, which is what the person is told either way (A5).
 */
export async function decideRoomSettings<T extends AskSettings>(
  settings: T,
  ownerRef: string | null,
  billing: AskBilling | undefined
): Promise<T> {
  if (billing === undefined || ownerRef === null) return settings;
  const entitlement = await billing.entitlements.current(ownerRef, billing.clock());
  return decideSettingsForPlan(settings, planById(billing.plans, entitlement.planId));
}

export type CoarseFit = "AS_ASKED" | "FREE_ROSTER";

/**
 * THE INTERIM FIT (spec §2.6 item 7, amended by A5), until the scorecard's
 * picker (S2) replaces it. A premium ask that does not fit the person's room
 * runs on the Free roster when it STARTs: cheaper models, starting as CLOSE.
 * It swaps whether or not the Free estimate fits, because the Free roster is
 * the cheapest choice there is. A question that WAITs (a FULL window of the
 * person or the site, or a blocking site line) never swaps. It is stored on
 * its plan's roster and settings, so B7b's PLAN_CHANGED guard sees it as
 * premium. At wake it starts on that roster (Q-11: the waker does not
 * re-pick). A FULL person window is visible here, so this answers AS_ASKED;
 * the site's day and the line are the locked decision's, so `#submitWithRoom`
 * keeps the plan's ask for a WAIT whatever this answered.
 */
export function decideCoarseFit(input: Readonly<{
  planTier: PlanTier;
  estimateMicros: number;
  windows: ReadonlyArray<Readonly<{ usedMicros: number; limitMicros: number }>>;
}>): CoarseFit {
  if (!Number.isSafeInteger(input.estimateMicros) || input.estimateMicros < 0
    || input.windows.some((window) => !Number.isSafeInteger(window.usedMicros) || !Number.isSafeInteger(window.limitMicros))) {
    throw new TypedDomainError("ASK_COARSE_FIT_INPUT_INVALID", "The coarse fit takes whole micro-units only");
  }
  if (input.planTier !== "premium" || input.windows.length === 0) return "AS_ASKED";
  if (input.windows.some((window) => window.usedMicros >= window.limitMicros)) return "AS_ASKED";
  if (input.windows.every((window) => window.usedMicros + input.estimateMicros <= window.limitMicros)) return "AS_ASKED";
  return "FREE_ROSTER";
}

/**
 * The coarse fit's reads. They are taken OUTSIDE B6a's locks on purpose: this
 * only chooses a roster, and B6a's locked room decision remains the one that
 * admits. A race can at worst choose the other roster for one ask that STARTs;
 * an ask the locked decision makes WAIT is created on its plan's roster
 * whatever this chose (`#submitWithRoom`).
 */
export async function coarseFitFor(ask: AskRequest, ownerRef: string, billing: AskBilling, now: Date): Promise<CoarseFit> {
  if (ask.plan_tier !== "premium") return "AS_ASKED";
  const windows = await billing.coarseFit.personAllowance.read(ownerRef, now);
  if (windows.length === 0) return "AS_ASKED";
  const [holdsMicros, estimateMicros, spent] = await Promise.all([
    billing.coarseFit.spend.readOwnerCountedHoldsMicros(ownerRef),
    billing.coarseFit.estimator.estimateMicros({
      planTier: "premium",
      compositionBudgetTier: ask.composition_budget_tier,
      makerCount: PLAN_TIER_ROSTERS.premium.length,
      depth: ask.depth_params.depth
    }),
    Promise.all(windows.map((window) => billing.coarseFit.spend.readOwnerSpentMicros(ownerRef, window.periodStart, window.resetsAt)))
  ]);
  return decideCoarseFit({
    planTier: "premium",
    estimateMicros,
    windows: windows.map((window, index) => Object.freeze({
      usedMicros: spent[index]! + holdsMicros,
      limitMicros: window.limitMicros
    }))
  });
}
