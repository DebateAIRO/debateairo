import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,
  BILLING_PLANS_ROW_KEY,
  BILLING_POLICY_DEPLOYMENT_REGISTER_ROW,
  BILLING_POLICY_ROW_KEY,
  PLAN_IDS,
  assertBillingReady,
  billingPlansFromValue,
  billingPolicyFromValue,
  loadBootstrapRegister,
  planById,
  planCapMicros,
  readBillingPlans,
  readBillingPolicy,
  type PlanId
} from "../../packages/register/src/index.js";
import { buildDevelopmentDeploymentRegisterPublicationRows } from "../../apps/runner/src/dev-deployment-register.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";

/**
 * PAID PLANS (spec 2026-09-29 §2.5.1, §1.2; amendments R1 A22). The two rows are
 * sealed register settings, never code: prices, credits and caps change only as
 * a NEW register version. These tests pin the owner's 29 September values and
 * every refusal the parser owes, so a malformed hosted row is refused by name.
 */
const plansRow = () => structuredClone(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value) as unknown as {
  plans: Array<Record<string, unknown>>;
} & Record<string, unknown>;
const policyRow = () => structuredClone(BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value) as unknown as Record<string, unknown>;
const plansOf = (value: unknown) => billingPlansFromValue(value, "b4 test");
const policyOf = (value: unknown) => billingPolicyFromValue(value, "b4 test");

describe("billingPlans v1 carries exactly the owner's plans", () => {
  const plans = plansOf(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value);

  it("names the row and the four plans in price order", () => {
    expect(BILLING_PLANS_ROW_KEY).toBe("billingPlans");
    expect(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.rowKey).toBe("billingPlans");
    expect(PLAN_IDS).toEqual(["FREE", "PLUS", "PRO", "MAX"]);
    expect(plans.currency).toBe("USD");
    expect(plans.plans.map((plan) => plan.planId)).toEqual(["FREE", "PLUS", "PRO", "MAX"]);
  });

  it.each([
    ["FREE", "free", 0, 200_000, null, null],
    ["PLUS", "premium", 20_000_000, 5_000_000, 2_000, 5_000],
    ["PRO", "premium", 50_000_000, 20_000_000, 2_000, 5_000],
    ["MAX", "premium", 200_000_000, 150_000_000, 2_000, 5_000]
  ] as const)("%s: tier %s, price %d, credit %d, day %s, week %s, finish 11000", (id, tier, price, credit, day, week) => {
    expect(planById(plans, id)).toMatchObject({
      planId: id, tier, netPriceMicros: price, monthlyCreditMicros: credit,
      dayBasisPoints: day, weekBasisPoints: week, finishBasisPoints: 11_000
    });
  });

  it("gives Free, and only Free, fixed gauges: the values /new sends for Free today", async () => {
    expect(planById(plans, "FREE").fixedGauges).toEqual({ riskTier: "standard", compositionBudgetTier: "low", depth: 2 });
    for (const id of ["PLUS", "PRO", "MAX"] as const) expect(planById(plans, id).fixedGauges).toBeNull();
    // The UI's Free reset (choosePlanTier) is the source these values were copied from (spec §2.3.4).
    const page = await readFile(new URL("../../apps/ui/app/new/NewDebatePageClient.tsx", import.meta.url), "utf8");
    const reset = page.slice(page.indexOf("function choosePlanTier("), page.indexOf("const askAsOf"));
    expect(reset).toContain('setRiskTier("standard")');
    expect(reset).toContain("setBudgetTier(PROVISIONAL_COMPOSITION_BUDGET_DEFAULT)");
    expect(reset).toContain("setDepth(2)");
  });

  it("computes each cap as credit x basis points / 10000, rounded down", () => {
    expect(planCapMicros(planById(plans, "PLUS"), "DAY")).toBe(1_000_000);
    expect(planCapMicros(planById(plans, "PLUS"), "WEEK")).toBe(2_500_000);
    expect(planCapMicros(planById(plans, "MAX"), "DAY")).toBe(30_000_000);
    expect(planCapMicros(planById(plans, "MAX"), "MONTH")).toBe(150_000_000);
    expect(planCapMicros(planById(plans, "FREE"), "DAY")).toBeNull();
    expect(planCapMicros(planById(plans, "FREE"), "MONTH")).toBe(200_000);
    const odd = plansRow();
    odd.plans[1]!.monthly_credit_micros = 1_000_001;
    expect(planCapMicros(planById(plansOf(odd), "PLUS"), "DAY")).toBe(200_000);
  });

  it("refuses an unknown plan id by name", () => {
    expect(() => planById(plans, "GOLD" as PlanId))
      .toThrowError(expect.objectContaining({ code: "BILLING_PLAN_UNKNOWN" }));
  });

  it.each([
    ["a price that is not whole cents", (row: ReturnType<typeof plansRow>) => { row.plans[1]!.net_price_micros = 20_000_001; }],
    ["Free with a day cap", (row: ReturnType<typeof plansRow>) => { row.plans[0]!.day_bp = 2_000; }],
    ["a paid plan without a week cap", (row: ReturnType<typeof plansRow>) => { row.plans[2]!.week_bp = null; }],
    ["a paid plan whose day cap exceeds its week cap", (row: ReturnType<typeof plansRow>) => { row.plans[1]!.day_bp = 6_000; }],
    ["a paid plan with fixed gauges", (row: ReturnType<typeof plansRow>) => {
      row.plans[1]!.fixed_gauges = { risk_tier: "standard", composition_budget_tier: "low", depth: 2 };
    }],
    ["Free without fixed gauges", (row: ReturnType<typeof plansRow>) => { row.plans[0]!.fixed_gauges = null; }],
    ["a fixed depth outside 1-5", (row: ReturnType<typeof plansRow>) => {
      row.plans[0]!.fixed_gauges = { risk_tier: "standard", composition_budget_tier: "low", depth: 6 };
    }],
    ["plans out of price order", (row: ReturnType<typeof plansRow>) => { row.plans[2]!.net_price_micros = 10_000_000; }],
    ["plans in the wrong order", (row: ReturnType<typeof plansRow>) => { [row.plans[1], row.plans[2]] = [row.plans[2]!, row.plans[1]!]; }],
    ["a duplicated plan", (row: ReturnType<typeof plansRow>) => { row.plans[3] = structuredClone(row.plans[2]!); }],
    ["a missing plan", (row: ReturnType<typeof plansRow>) => { row.plans.pop(); }],
    ["a finish edge under 100%", (row: ReturnType<typeof plansRow>) => { row.plans[1]!.finish_bp = 9_999; }],
    ["a finish edge over 200%", (row: ReturnType<typeof plansRow>) => { row.plans[1]!.finish_bp = 20_001; }],
    ["Free with a price", (row: ReturnType<typeof plansRow>) => { row.plans[0]!.net_price_micros = 10_000; }],
    // 4 micros x 2000 bp / 10000 rounds down to a 0-micro day cap, and a 0-micro
    // limit breaks every admission and wall check on that plan. (A week cap can
    // only round to nothing when the day cap, never larger, already has.)
    ["a day cap that rounds down to nothing", (row: ReturnType<typeof plansRow>) => { row.plans[1]!.monthly_credit_micros = 4; }],
    ["an unknown member", (row: ReturnType<typeof plansRow>) => { row.plans[1]!.discount = 0; }],
    ["another currency", (row: ReturnType<typeof plansRow>) => { row.currency = "EUR"; }]
  ])("refuses %s (BILLING_PLANS_INVALID)", (_name, mutate) => {
    const row = plansRow();
    mutate(row);
    expect(() => plansOf(row)).toThrowError(expect.objectContaining({ code: "BILLING_PLANS_INVALID" }));
  });

  it("reads null when the version sealed no plans row, refuses a malformed one, and reads a sealed one", async () => {
    const emptyPool = { query: async () => ({ rows: [] }) } as never;
    await expect(readBillingPlans(emptyPool, 7)).resolves.toBeNull();
    const brokenPool = { query: async () => ({ rows: [{ value_json: { kind: "BILLING_PLANS" }, source_ref: "x" }] }) } as never;
    await expect(readBillingPlans(brokenPool, 7)).rejects.toThrowError(expect.objectContaining({ code: "BILLING_PLANS_INVALID" }));
    const sealedPool = { query: async () => ({ rows: [{
      value_json: BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, source_ref: BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef
    }] }) } as never;
    await expect(readBillingPlans(sealedPool, 7)).resolves.toMatchObject({ sourceRef: BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef });
  });
});

describe("billingPolicy v1 keeps billing switched off", () => {
  const policy = policyOf(BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value);

  it("carries the spec's values, with no payment environment and no owner address (A22)", () => {
    expect(BILLING_POLICY_ROW_KEY).toBe("billingPolicy");
    expect(policy).toMatchObject({
      enabled: false,
      dunningRetryDays: [1, 3, 7],
      withdrawalDays: 14,
      renewalNoticeBusinessDays: 7,
      lookAheadBusinessDays: 10,
      confirmationBusinessDays: 2,
      quoteTtlSeconds: 1_800,
      taxCode: "saas",
      invoiceIssuerRules: { RO: "SMARTBILL", "*": "QUADERNO" }
    });
    expect(policy).not.toHaveProperty("paymentEnvironment");
    expect(Object.keys(BILLING_POLICY_DEPLOYMENT_REGISTER_ROW.value)).not.toContain("owner_report_email_ref");
  });

  it("lists the EU 27 plus Iceland, Liechtenstein, Norway and the UK for withdrawal, and nothing else", () => {
    expect([...policy.withdrawalCountries].sort()).toEqual([
      "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GR", "HR", "HU", "IE",
      "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO", "PL", "PT", "RO", "SE", "SI", "SK"
    ]);
  });

  it("accepts a renewal notice of exactly 7 business days and a longer one: 7 is a floor, not a ceiling", () => {
    for (const days of [7, 10]) {
      const row = policyRow();
      row.renewal_notice_business_days = days;
      expect(policyOf(row)).toMatchObject({ renewalNoticeBusinessDays: days });
    }
  });

  it("accepts a longer withdrawal period and an extra country: the law sets a floor, not a ceiling", () => {
    const row = policyRow();
    row.withdrawal_days = 30;
    row.withdrawal_countries = [...(row.withdrawal_countries as string[]), "CH"];
    expect(policyOf(row)).toMatchObject({ withdrawalDays: 30 });
    expect(policyOf(row).withdrawalCountries).toContain("CH");
  });

  it.each([
    ["a policy naming a payment environment (A22: the environment follows the API's base URL, never the policy)", (row: Record<string, unknown>) => { row.payment_environment = "sandbox"; }],
    ["no catch-all invoice rule", (row: Record<string, unknown>) => { row.invoice_issuer_rules = { RO: "SMARTBILL" }; }],
    ["a lower-case rule country", (row: Record<string, unknown>) => { row.invoice_issuer_rules = { ro: "SMARTBILL", "*": "QUADERNO" }; }],
    // P2-M23 (spec §1.4): exactly RO→SmartBill and everything else→Quaderno. A catch-all SmartBill would issue
    // e-Facturas placing foreign buyers in Romania; RO→Quaderno would issue Romanian invoices with no e-Factura.
    ["a catch-all SmartBill rule", (row: Record<string, unknown>) => { row.invoice_issuer_rules = { RO: "SMARTBILL", "*": "SMARTBILL" }; }],
    ["Romania sent to Quaderno", (row: Record<string, unknown>) => { row.invoice_issuer_rules = { RO: "QUADERNO", "*": "QUADERNO" }; }],
    ["no Romanian rule", (row: Record<string, unknown>) => { row.invoice_issuer_rules = { "*": "QUADERNO" }; }],
    ["a second SmartBill country", (row: Record<string, unknown>) => {
      row.invoice_issuer_rules = { RO: "SMARTBILL", MD: "SMARTBILL", "*": "QUADERNO" };
    }],
    ["an extra country spelled out", (row: Record<string, unknown>) => {
      row.invoice_issuer_rules = { RO: "SMARTBILL", DE: "QUADERNO", "*": "QUADERNO" };
    }],
    ["retry days that do not rise", (row: Record<string, unknown>) => { row.dunning_retry_days = [1, 7, 3]; }],
    ["four retry days, one more than A2's 1..4 attempts allow", (row: Record<string, unknown>) => { row.dunning_retry_days = [1, 3, 7, 14]; }],
    ["a look-ahead shorter than the renewal notice", (row: Record<string, unknown>) => { row.look_ahead_business_days = 5; }],
    ["a duplicated withdrawal country", (row: Record<string, unknown>) => {
      row.withdrawal_countries = [...(row.withdrawal_countries as string[]), "RO"];
    }],
    ["a withdrawal period under the legal 14 days", (row: Record<string, unknown>) => { row.withdrawal_days = 13; }],
    ["a withdrawal list without Romania", (row: Record<string, unknown>) => {
      row.withdrawal_countries = (row.withdrawal_countries as string[]).filter((country) => country !== "RO");
    }],
    ["a withdrawal list without the UK", (row: Record<string, unknown>) => {
      row.withdrawal_countries = (row.withdrawal_countries as string[]).filter((country) => country !== "GB");
    }],
    ["a withdrawal list of one country", (row: Record<string, unknown>) => { row.withdrawal_countries = ["RO"]; }],
    ["a quote that lives under a minute", (row: Record<string, unknown>) => { row.quote_ttl_seconds = 30; }],
    // Final review Part 1b, Minor 6: a changed renewal needs at least 7 business days' notice (M3; A7's notice rule,
    // kept for NETOPIA until N-23 is answered).
    ["a renewal notice under the 7 business days a changed renewal needs", (row: Record<string, unknown>) => {
      row.renewal_notice_business_days = 6;
    }],
    ["a renewal notice of a single business day", (row: Record<string, unknown>) => { row.renewal_notice_business_days = 1; }]
  ])("refuses %s (BILLING_POLICY_INVALID)", (_name, mutate) => {
    const row = policyRow();
    mutate(row);
    expect(() => policyOf(row)).toThrowError(expect.objectContaining({ code: "BILLING_POLICY_INVALID" }));
  });

  it("reads null when the version sealed no policy row: billing is off", async () => {
    await expect(readBillingPolicy({ query: async () => ({ rows: [] }) } as never, 7)).resolves.toBeNull();
  });
});

describe("billing may be switched on only with the plans and the budget members (A22)", () => {
  const plans = plansOf(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value);
  const on = policyOf({ ...policyRow(), enabled: true });
  const members = { closeBasisPoints: 9_500, finishBasisPoints: 11_500, waitingLinePerPerson: 1 };
  const none = { closeBasisPoints: null, finishBasisPoints: null, waitingLinePerPerson: null };

  it("says billing is off when no policy is sealed or it is disabled, whatever else is missing", () => {
    expect(assertBillingReady({ policy: null, plans: null, envelope: none })).toBeNull();
    expect(assertBillingReady({ policy: policyOf(policyRow()), plans: null, envelope: none })).toBeNull();
  });

  it("refuses an enabled policy without the three costEnvelopePolicy members", () => {
    expect(() => assertBillingReady({ policy: on, plans, envelope: none }))
      .toThrowError(expect.objectContaining({ code: "BILLING_REQUIRES_ENVELOPE_MEMBERS" }));
  });

  it("refuses an enabled policy on a version that seals no plans", () => {
    expect(() => assertBillingReady({ policy: on, plans: null, envelope: members }))
      .toThrowError(expect.objectContaining({ code: "BILLING_PLANS_UNRESOLVED" }));
  });

  it("returns the plans when everything billing needs is sealed", () => {
    expect(assertBillingReady({ policy: on, plans, envelope: members })).toBe(plans);
  });
});

describe("the development seeder publishes both rows", () => {
  it.each(["local", "hosted"] as const)("in a %s publication, with billing off", async (deployment) => {
    const rows = await buildDevelopmentDeploymentRegisterPublicationRows(
      await loadBootstrapRegister(), TEST_DEVELOPMENT_PROVIDER_PANEL, undefined, deployment
    );
    const plans = rows.find((row) => row.rowKey === "billingPlans");
    const policy = rows.find((row) => row.rowKey === "billingPolicy");
    expect(plans?.sourceRef).toBe(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
    expect(billingPlansFromValue(JSON.parse(plans!.valueJsonText), plans!.sourceRef).plans).toHaveLength(4);
    expect(billingPolicyFromValue(JSON.parse(policy!.valueJsonText), policy!.sourceRef).enabled).toBe(false);
  });
});
