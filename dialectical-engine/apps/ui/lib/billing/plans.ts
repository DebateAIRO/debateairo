/** The four plans of the billingPlans register row (spec 2026-09-29 §1.2), as the UI names them. */
export const BILLING_PLAN_IDS = Object.freeze(["FREE", "PLUS", "PRO", "MAX"] as const);
export type BillingPlanId = (typeof BILLING_PLAN_IDS)[number];
export type PaidPlanId = Exclude<BillingPlanId, "FREE">;

export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return typeof value === "string" && (BILLING_PLAN_IDS as readonly string[]).includes(value);
}

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return isBillingPlanId(value) && value !== "FREE";
}
