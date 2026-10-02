import { TypedDomainError } from "@debateai/kernel";
import type { BillingPlan, BillingPlans, PlanId } from "@debateai/register";

/**
 * PAID PLANS (spec 2026-09-29 §2.5.1; reconciliation ruling R-1). This package
 * may import `@debateai/register` for TYPES only, so the two plan rules it needs
 * at run time are restated here, exactly:
 *  - `planIn` is register's `planById`: an id no sealed plan carries is refused
 *    `BILLING_PLAN_UNKNOWN`;
 *  - `planShareMicros` is register's `planCapMicros` share: credit x basis
 *    points / 10000, rounded DOWN.
 * tests/unit/b4-billing-windows.test.ts pins both equal to register's for every
 * sealed plan and for an odd credit. Neither is exported from the package index.
 */
const BASIS_POINTS = Object.freeze({ whole: 10_000 });

export function planIn(plans: BillingPlans, id: PlanId): BillingPlan {
  const plan = plans.plans.find((candidate) => candidate.planId === id);
  if (plan === undefined) throw new TypedDomainError("BILLING_PLAN_UNKNOWN", `No plan ${String(id)} is sealed`);
  return plan;
}

export function planShareMicros(plan: BillingPlan, basisPoints: number | null): number | null {
  if (basisPoints === null) return null;
  return Number((BigInt(plan.monthlyCreditMicros) * BigInt(basisPoints)) / BigInt(BASIS_POINTS.whole));
}
