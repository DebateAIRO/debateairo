import { ABUSE_LIMITS_DEPLOYMENT_REGISTER_ROW, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW } from "@debateai/register";

/**
 * R22 decision 18: a hosted site's `billingPlans` and `abuseLimits` are the owner's, kept on his server. A test stands in
 * for them with these. They are made up too (multiples of eleven), and they are NOT the code's row: the credits differ, so
 * `billingPlansAreMadeUp` reads false and a publication with billing on accepts them, as it accepts the owner's real row.
 */
const OWNER_CREDITS: Readonly<Record<string, number>> = Object.freeze({ FREE: 440_000, PLUS: 7_700_000, PRO: 44_000_000, MAX: 330_000_000 });

export const TEST_OWNER_BILLING_PLANS = Object.freeze({
  ...BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value,
  plans: BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value.plans.map((plan) => Object.freeze({ ...plan, monthly_credit_micros: OWNER_CREDITS[plan.plan_id]! }))
});

/** The code's made-up row, as a file member: `abuseLimits` has no "real" check, only its parser. */
export const TEST_OWNER_ABUSE_LIMITS = ABUSE_LIMITS_DEPLOYMENT_REGISTER_ROW.value;

/** The two members every hosted file and every kit-v3 owner's input must now carry. */
export const TEST_OWNER_LIMIT_ROWS = Object.freeze({ billingPlans: TEST_OWNER_BILLING_PLANS, abuseLimits: TEST_OWNER_ABUSE_LIMITS });
