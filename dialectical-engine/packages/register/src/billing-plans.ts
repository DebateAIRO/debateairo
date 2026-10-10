import type { Pool } from "pg";
import { z } from "zod";
import { BillingCurrencySchema, ExpansionDepthSchema, type BillingCurrency, type PlanTier } from "@debateai/contract";
import { RISK_TIERS, TypedDomainError, type RiskTier } from "@debateai/kernel";

/**
 * PAID PLANS (spec 2026-09-29 §1.2, §2.5.1) — THE PLANS ROW.
 *
 * Every price, credit and cap is a SETTING. Changing one is a new register
 * version, never an edit of a sealed row. Money is integer micro-units. Every
 * plan has a net price in USD, EUR and RON (spec 2026-10-05 §2.16.2), each a
 * whole number of cents or bani, and `currency_by_country` says which one a
 * buyer's tax country pays in. The monthly credit is always US dollars: it is
 * what the AI companies charge.
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
  /** Spec 2026-10-05 §2.16.2: the net monthly price in each currency, in micro-units (whole cents or bani). */
  netPrices: Readonly<Record<BillingCurrency, number>>;
  monthlyCreditMicros: number;
  dayBasisPoints: number | null;
  weekBasisPoints: number | null;
  finishBasisPoints: number;
  fixedGauges: FreeFixedGauges | null;
}>;

/** Spec 2026-10-05 §2.16.1: the currency each tax country pays in; any country not listed pays in the default. */
type CurrencyByCountry = Readonly<{
  defaultCurrency: BillingCurrency;
  countries: Readonly<Record<string, BillingCurrency>>;
}>;

export type BillingPlans = Readonly<{
  /** The AI credit's currency, always US dollars (spec 2026-10-05 §2.16.1). */
  creditCurrency: "USD";
  currencyByCountry: CurrencyByCountry;
  plans: ReadonlyArray<BillingPlan>;
  sourceRef: string;
}>;

/** Module-private, as in cost-envelope-policy.ts: one denominator, never restated. */
const BASIS_POINTS = Object.freeze({ whole: 10_000 });
/** One cent (or ban) in micro-units: every price is a whole number of them, in each currency. */
const CENT = Object.freeze({ micros: 10_000 });

const micros = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const PRICE_CURRENCIES = BillingCurrencySchema.options;
const netPricesSchema = z.object({ USD: micros, EUR: micros, RON: micros }).strict();
/** ISO 3166-1 alpha-2, upper case; "XX" is the geo lookup's own "no country" and never a key. */
const isoCountrySchema = z.string().regex(/^[A-Z]{2}$/u).refine((code) => code !== "XX");
const currencyByCountrySchema = z.object({
  default: BillingCurrencySchema,
  countries: z.record(isoCountrySchema, BillingCurrencySchema)
}).strict().refine((value) => Object.keys(value.countries).length <= 249, "at most 249 countries");
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
  net_prices: netPricesSchema,
  monthly_credit_micros: positiveMicros,
  day_bp: capBasisPoints.nullable(),
  week_bp: capBasisPoints.nullable(),
  finish_bp: finishBasisPoints,
  fixed_gauges: fixedGaugesSchema.nullable()
}).strict();

const billingPlansValueSchema = z.object({
  kind: z.literal("BILLING_PLANS"),
  credit_currency: z.literal("USD"),
  currency_by_country: currencyByCountrySchema,
  minor_units_per_unit: z.literal(1_000_000),
  plans: z.array(planSchema).length(PLAN_IDS.length)
}).strict().superRefine((value, ctx) => {
  const refuse = (index: number, message: string): void => {
    ctx.addIssue({ code: "custom", path: ["plans", index], message });
  };
  value.plans.forEach((plan, index) => {
    if (plan.plan_id !== PLAN_IDS[index]) refuse(index, "plans are listed FREE, PLUS, PRO, MAX");
    for (const currency of PRICE_CURRENCIES) {
      const price = plan.net_prices[currency];
      if (price % CENT.micros !== 0) refuse(index, `a ${currency} price is a whole number of cents or bani`);
    }
    const free = plan.plan_id === "FREE";
    if (free) {
      if (plan.tier !== "free" || PRICE_CURRENCIES.some((currency) => plan.net_prices[currency] !== 0)) {
        refuse(index, "Free is the free tier at no price");
      }
      if (plan.day_bp !== null || plan.week_bp !== null) refuse(index, "Free has a monthly credit only");
      if (plan.fixed_gauges === null) refuse(index, "Free carries its fixed gauges");
    } else {
      if (plan.tier !== "premium" || PRICE_CURRENCIES.some((currency) => plan.net_prices[currency] === 0)) {
        refuse(index, "a paid plan is premium and has a price in every currency");
      }
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
    for (const currency of PRICE_CURRENCIES) {
      if (previous !== undefined && plan.net_prices[currency] <= previous.net_prices[currency]) {
        refuse(index, `each plan costs strictly more than the one before, in ${currency}`);
      }
    }
  });
});

/**
 * Spec 2026-10-05 §2.16.1 (the owner's choice of 10 October 2026): the 31
 * countries that pay in euro besides Romania's lei — the other 26 EU countries,
 * then Norway, Iceland, Liechtenstein, Switzerland and the United Kingdom.
 */
const EUR_COUNTRIES = Object.freeze([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "SK", "SI", "ES", "SE", "NO", "IS", "LI", "CH", "GB"
] as const);

/**
 * THE PLAN VALUES: the owner's of 29 September 2026 (§1.10), priced in USD, EUR
 * and RON by region since Part C (spec 2026-10-05 §2.16.2). The EUR and RON
 * prices are placeholders until the owner publishes a price list (go-live row
 * 73). The first paid test debates may revise them. That revision is a NEW register
 * version of this row, never an edit.
 */
export const BILLING_PLANS_DEPLOYMENT_REGISTER_ROW = Object.freeze({
  rowKey: BILLING_PLANS_ROW_KEY,
  sourceRef: "spec 2026-10-05 §2.16.2 billingPlans v2 (owner decisions 2026-09-29: Free/Plus/Pro/Max, day 20%,"
    + " week 50%, finish 110%, USD 20/50/200; owner's choice 2026-10-10: RON for RO, EUR for 31 European countries, USD"
    + " elsewhere; EUR and RON prices are placeholders until the owner's price list, go-live row 73)",
  value: Object.freeze({
    kind: "BILLING_PLANS" as const,
    credit_currency: "USD" as const,
    currency_by_country: Object.freeze({
      default: "USD" as const,
      countries: Object.freeze(Object.fromEntries([
        ["RO", "RON"],
        ...EUR_COUNTRIES.map((country) => [country, "EUR"])
      ]) as Readonly<Record<string, BillingCurrency>>)
    }),
    minor_units_per_unit: 1_000_000 as const,
    plans: Object.freeze([
      Object.freeze({
        plan_id: "FREE" as const, tier: "free" as const, net_prices: Object.freeze({ USD: 0, EUR: 0, RON: 0 }),
        monthly_credit_micros: 200_000,
        day_bp: null, week_bp: null, finish_bp: 11_000,
        fixed_gauges: Object.freeze({ risk_tier: "standard" as const, composition_budget_tier: "low" as const, depth: 2 })
      }),
      Object.freeze({
        plan_id: "PLUS" as const, tier: "premium" as const, net_prices: Object.freeze({ USD: 20_000_000, EUR: 20_000_000, RON: 100_000_000 }),
        monthly_credit_micros: 5_000_000,
        day_bp: 2_000, week_bp: 5_000, finish_bp: 11_000, fixed_gauges: null
      }),
      Object.freeze({
        plan_id: "PRO" as const, tier: "premium" as const, net_prices: Object.freeze({ USD: 50_000_000, EUR: 50_000_000, RON: 250_000_000 }),
        monthly_credit_micros: 20_000_000,
        day_bp: 2_000, week_bp: 5_000, finish_bp: 11_000, fixed_gauges: null
      }),
      Object.freeze({
        plan_id: "MAX" as const, tier: "premium" as const, net_prices: Object.freeze({ USD: 200_000_000, EUR: 200_000_000, RON: 1_000_000_000 }),
        monthly_credit_micros: 150_000_000,
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
    creditCurrency: parsed.data.credit_currency,
    currencyByCountry: Object.freeze({
      defaultCurrency: parsed.data.currency_by_country.default,
      countries: Object.freeze({ ...parsed.data.currency_by_country.countries })
    }),
    plans: Object.freeze(parsed.data.plans.map((plan) => Object.freeze({
      planId: plan.plan_id,
      tier: plan.tier,
      netPrices: Object.freeze({ ...plan.net_prices }),
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
 * Spec 2026-10-05 §2.16.1: the currency a tax country pays in (either letter case). A country not listed, an empty
 * one, the lookup's "XX" or none at all pays in the rule's default.
 */
export function priceCurrencyFor(plans: BillingPlans, country: string | null): BillingCurrency {
  const code = typeof country === "string" ? country.toUpperCase() : "";
  const listed = plans.currencyByCountry.countries;
  return Object.hasOwn(listed, code) ? listed[code]! : plans.currencyByCountry.defaultCurrency;
}

/** A plan's net monthly price in `currency` (micro-units). */
export function planNetPrice(plan: BillingPlan, currency: BillingCurrency): number {
  return plan.netPrices[currency];
}

/**
 * A plan's cap in micro-units: `credit x basis points / 10000`, rounded DOWN
 * like every other ceiling share. The hosted publish command reads it.
 * `@debateai/billing-core` may import register for types only (R-1), so it
 * restates this rule privately (`planShareMicros`);
 * tests/unit/b4-billing-windows.test.ts pins the two equal, so a change here
 * changes both. Null when the plan has no such cap (Free has no day or week
 * cap).
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
