import type { Pool } from "pg";
import { z } from "zod";
import { ExpansionDepthSchema, type PlanTier } from "@debateai/contract";
import { RISK_TIERS, TypedDomainError, type RiskTier } from "@debateai/kernel";

/**
 * PAID PLANS (spec 2026-09-29 §1.2, §2.5.1) — THE PLANS ROW.
 *
 * Every price, credit and cap is a SETTING. Changing one is a new register
 * version, never an edit of this constant's sealed row. Money is integer USD
 * micro-units, and every price is whole cents.
 *
 *  - Plans are listed in price order (FREE, PLUS, PRO, MAX), and each paid plan
 *    costs strictly more than the one before. "An upgrade means a higher
 *    price" reads that order.
 *  - Free has a monthly credit only; each paid plan also has a day and a week
 *    cap, as basis points of its monthly credit (`day_bp`, `week_bp`).
 *  - `finish_bp` is how far a RUNNING debate may take a person's window so it
 *    can finish (110%). New questions still wait at 100%.
 *  - Free's `fixed_gauges` are the values `/new` sends for Free today
 *    (NewDebatePageClient.tsx `choosePlanTier`). The server enforces them when
 *    billing is on (§2.3.4); the API never imports UI code for them.
 */
export const BILLING_PLANS_ROW_KEY = "billingPlans" as const;

export const PLAN_IDS = Object.freeze(["FREE", "PLUS", "PRO", "MAX"] as const);
export type PlanId = typeof PLAN_IDS[number];

export type FreeFixedGauges = Readonly<{ riskTier: RiskTier; compositionBudgetTier: "low"; depth: number }>;

export type BillingPlan = Readonly<{
  planId: PlanId;
  tier: PlanTier;
  netPriceMicros: number;
  monthlyCreditMicros: number;
  dayBasisPoints: number | null;
  weekBasisPoints: number | null;
  finishBasisPoints: number;
  fixedGauges: FreeFixedGauges | null;
}>;

export type BillingPlans = Readonly<{ currency: "USD"; plans: ReadonlyArray<BillingPlan>; sourceRef: string }>;

/** Module-private, as in cost-envelope-policy.ts: one denominator, never restated. */
const BASIS_POINTS = Object.freeze({ whole: 10_000 });
/** One US cent in micro-units: every price is a whole number of them. */
const CENT = Object.freeze({ micros: 10_000 });

const micros = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const positiveMicros = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const capBasisPoints = z.number().int().positive().max(BASIS_POINTS.whole);
const finishBasisPoints = z.number().int().min(BASIS_POINTS.whole).max(2 * BASIS_POINTS.whole);

const fixedGaugesSchema = z.object({
  risk_tier: z.enum(RISK_TIERS),
  composition_budget_tier: z.literal("low"),
  depth: ExpansionDepthSchema
}).strict();

const planSchema = z.object({
  plan_id: z.enum(PLAN_IDS),
  tier: z.enum(["free", "premium"]),
  net_price_micros: micros,
  monthly_credit_micros: positiveMicros,
  day_bp: capBasisPoints.nullable(),
  week_bp: capBasisPoints.nullable(),
  finish_bp: finishBasisPoints,
  fixed_gauges: fixedGaugesSchema.nullable()
}).strict();

const billingPlansValueSchema = z.object({
  kind: z.literal("BILLING_PLANS"),
  currency: z.literal("USD"),
  minor_units_per_unit: z.literal(1_000_000),
  plans: z.array(planSchema).length(PLAN_IDS.length)
}).strict().superRefine((value, ctx) => {
  const refuse = (index: number, message: string): void => {
    ctx.addIssue({ code: "custom", path: ["plans", index], message });
  };
  value.plans.forEach((plan, index) => {
    if (plan.plan_id !== PLAN_IDS[index]) refuse(index, "plans are listed FREE, PLUS, PRO, MAX");
    if (plan.net_price_micros % CENT.micros !== 0) refuse(index, "a price is a whole number of cents");
    const free = plan.plan_id === "FREE";
    if (free) {
      if (plan.tier !== "free" || plan.net_price_micros !== 0) refuse(index, "Free is the free tier at no price");
      if (plan.day_bp !== null || plan.week_bp !== null) refuse(index, "Free has a monthly credit only");
      if (plan.fixed_gauges === null) refuse(index, "Free carries its fixed gauges");
    } else {
      if (plan.tier !== "premium" || plan.net_price_micros === 0) refuse(index, "a paid plan is premium and has a price");
      if (plan.day_bp === null || plan.week_bp === null) refuse(index, "a paid plan has a day and a week cap");
      else if (plan.day_bp > plan.week_bp) refuse(index, "a day cap is never larger than the week cap");
      // A cap is `credit x bp / 10000` rounded down (planCapMicros). One that
      // rounds to 0 micros would make budget's room and wall refuse every ask on
      // this plan (BUDGET_ROOM_LIMIT_INVALID), so the row is refused instead.
      for (const basisPoints of [plan.day_bp, plan.week_bp]) {
        if (basisPoints !== null
          && (BigInt(plan.monthly_credit_micros) * BigInt(basisPoints)) / BigInt(BASIS_POINTS.whole) < 1n) {
          refuse(index, "a day or week cap is at least one micro-unit");
        }
      }
      if (plan.fixed_gauges !== null) refuse(index, "only Free has fixed gauges");
    }
    const previous = value.plans[index - 1];
    if (previous !== undefined && plan.net_price_micros <= previous.net_price_micros) {
      refuse(index, "each plan costs strictly more than the one before");
    }
  });
});

/**
 * THE TEMPORARY PLAN VALUES the owner chose on 29 September 2026 (§1.10). The
 * first paid test debates may revise them. That revision is a NEW register
 * version of this row, never an edit.
 */
export const BILLING_PLANS_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: BILLING_PLANS_ROW_KEY,
  sourceRef: "paid-plans-and-payments-design-2026-09-29#2.5.1 billingPlans v1"
    + " (owner decisions 2026-09-29: Free/Plus/Pro/Max, day 20%, week 50%, finish 110%)",
  value: Object.freeze({
    kind: "BILLING_PLANS" as const,
    currency: "USD" as const,
    minor_units_per_unit: 1_000_000 as const,
    plans: Object.freeze([
      Object.freeze({
        plan_id: "FREE" as const, tier: "free" as const, net_price_micros: 0, monthly_credit_micros: 200_000,
        day_bp: null, week_bp: null, finish_bp: 11_000,
        fixed_gauges: Object.freeze({ risk_tier: "standard" as const, composition_budget_tier: "low" as const, depth: 2 })
      }),
      Object.freeze({
        plan_id: "PLUS" as const, tier: "premium" as const, net_price_micros: 20_000_000, monthly_credit_micros: 5_000_000,
        day_bp: 2_000, week_bp: 5_000, finish_bp: 11_000, fixed_gauges: null
      }),
      Object.freeze({
        plan_id: "PRO" as const, tier: "premium" as const, net_price_micros: 50_000_000, monthly_credit_micros: 20_000_000,
        day_bp: 2_000, week_bp: 5_000, finish_bp: 11_000, fixed_gauges: null
      }),
      Object.freeze({
        plan_id: "MAX" as const, tier: "premium" as const, net_price_micros: 200_000_000, monthly_credit_micros: 150_000_000,
        day_bp: 2_000, week_bp: 5_000, finish_bp: 11_000, fixed_gauges: null
      })
    ])
  })
});

export function billingPlansFromValue(value: unknown, sourceRef: string): BillingPlans {
  const parsed = billingPlansValueSchema.safeParse(value);
  if (!parsed.success || typeof sourceRef !== "string" || sourceRef.trim() === "") {
    throw new TypedDomainError("BILLING_PLANS_INVALID", "The sealed billing plans row is malformed");
  }
  return Object.freeze({
    currency: parsed.data.currency,
    plans: Object.freeze(parsed.data.plans.map((plan) => Object.freeze({
      planId: plan.plan_id,
      tier: plan.tier,
      netPriceMicros: plan.net_price_micros,
      monthlyCreditMicros: plan.monthly_credit_micros,
      dayBasisPoints: plan.day_bp,
      weekBasisPoints: plan.week_bp,
      finishBasisPoints: plan.finish_bp,
      fixedGauges: plan.fixed_gauges === null ? null : Object.freeze({
        riskTier: plan.fixed_gauges.risk_tier,
        compositionBudgetTier: plan.fixed_gauges.composition_budget_tier,
        depth: plan.fixed_gauges.depth
      })
    }))),
    sourceRef
  });
}

export function planById(plans: BillingPlans, id: PlanId): BillingPlan {
  const plan = plans.plans.find((candidate) => candidate.planId === id);
  if (plan === undefined) throw new TypedDomainError("BILLING_PLAN_UNKNOWN", `No plan ${String(id)} is sealed`);
  return plan;
}

/**
 * A plan's cap in micro-units: `credit x basis points / 10000`, rounded DOWN
 * like every other ceiling share. It is the one place the share is computed:
 * `@debateai/billing-core` and the hosted publish command both read it. Null
 * when the plan has no such cap (Free has no day or week cap).
 */
export function planCapMicros(plan: BillingPlan, cap: "DAY" | "WEEK" | "MONTH"): number | null {
  if (cap === "MONTH") return plan.monthlyCreditMicros;
  const basisPoints = cap === "DAY" ? plan.dayBasisPoints : plan.weekBasisPoints;
  if (basisPoints === null) return null;
  return Number((BigInt(plan.monthlyCreditMicros) * BigInt(basisPoints)) / BigInt(BASIS_POINTS.whole));
}

/** The row in force at a register version, or `null` when that version sealed none. */
export async function readBillingPlans(pool: Pool, registerVersion: number): Promise<BillingPlans | null> {
  const result = await pool.query<{ value_json: unknown; source_ref: string }>(
    `SELECT value_json,source_ref FROM register.register_row
     WHERE register_version=$1 AND row_key=$2`,
    [registerVersion, BILLING_PLANS_ROW_KEY]
  );
  const row = result.rows[0];
  return row === undefined ? null : billingPlansFromValue(row.value_json, row.source_ref);
}
