import { describe, expect, expectTypeOf, it } from "vitest";
import type { BillingCurrency } from "@debateai/contract";
import type { PriceCurrency } from "@debateai/billing-core";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW,
  billingPlansFromValue,
  planById,
  planNetPrice,
  priceCurrencyFor,
  type BillingPlan
} from "../../packages/register/src/index.js";

/**
 * Spec 2026-10-05 §2.16.1–§2.16.2 (Part C, rulings PR-60 and PR-63): every plan has a net price in USD, EUR and RON at
 * once, and the buyer's tax country picks the currency (RON for Romania, EUR for 31 European countries, USD
 * elsewhere). The AI credit stays in US dollars.
 */
const EUR_COUNTRIES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL",
  "PL", "PT", "SK", "SI", "ES", "SE", "NO", "IS", "LI", "CH", "GB"
] as const;

type RowValue = Record<string, unknown> & {
  credit_currency?: unknown;
  currency_by_country: { default: unknown; countries: Record<string, unknown> };
  plans: Array<Record<string, unknown> & { net_prices: Record<string, unknown> }>;
};
const row = (): RowValue => structuredClone(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value) as unknown as RowValue;
const plansOf = (value: unknown) => billingPlansFromValue(value, "price list test");

describe("the engine's billingPlans v2 row: a price in every currency and the region rule", () => {
  const plans = plansOf(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value);

  it("parses, keeps the AI credit in US dollars, and carries D3's prices", () => {
    expect(plans.creditCurrency).toBe("USD");
    const priced = (id: "FREE" | "PLUS" | "PRO" | "MAX") => {
      const plan = planById(plans, id);
      return [planNetPrice(plan, "USD"), planNetPrice(plan, "EUR"), planNetPrice(plan, "RON")];
    };
    expect(priced("FREE")).toEqual([0, 0, 0]);
    expect(priced("PLUS")).toEqual([20_000_000, 20_000_000, 100_000_000]);
    expect(priced("PRO")).toEqual([50_000_000, 50_000_000, 250_000_000]);
    expect(priced("MAX")).toEqual([200_000_000, 200_000_000, 1_000_000_000]);
  });

  it("answers RON for Romania in either letter case", () => {
    expect(priceCurrencyFor(plans, "RO")).toBe("RON");
    expect(priceCurrencyFor(plans, "ro")).toBe("RON");
  });

  it.each(EUR_COUNTRIES)("answers EUR for %s", (country) => {
    expect(priceCurrencyFor(plans, country)).toBe("EUR");
  });

  it.each(["US", "JP", "XX", "", null] as const)("answers the default USD for %j", (country) => {
    expect(priceCurrencyFor(plans, country)).toBe("USD");
  });

  it("lists exactly the 31 EUR countries", () => {
    const eur = Object.entries(plans.currencyByCountry.countries)
      .filter(([, currency]) => currency === "EUR").map(([country]) => country).sort();
    expect(eur).toEqual([...EUR_COUNTRIES].sort());
    expect(eur).toHaveLength(31);
    expect(plans.currencyByCountry.defaultCurrency).toBe("USD");
  });

  it("names one currency type in the contract and the payments core", () => {
    expectTypeOf<BillingCurrency>().toEqualTypeOf<PriceCurrency>();
    expectTypeOf<BillingPlan["netPrices"]>().toEqualTypeOf<Readonly<Record<PriceCurrency, number>>>();
  });

  it.each([
    ["a plan missing RON", (value: RowValue) => { delete value.plans[1]!.net_prices.RON; }],
    ["a plan with a fourth currency", (value: RowValue) => { value.plans[1]!.net_prices.GBP = 20_000_000; }],
    ["net_prices absent", (value: RowValue) => { delete (value.plans[2] as Record<string, unknown>).net_prices; }],
    ["a v1 row", (value: RowValue) => {
      delete value.credit_currency;
      value.currency = "USD";
      for (const plan of value.plans) {
        plan.net_price_micros = plan.net_prices.USD;
        delete (plan as Record<string, unknown>).net_prices;
      }
    }],
    ["an EUR price that is not whole cents", (value: RowValue) => { value.plans[1]!.net_prices.EUR = 20_000_001; }],
    ["Free with a RON price", (value: RowValue) => { value.plans[0]!.net_prices.RON = 10_000; }],
    ["a paid plan at EUR 0", (value: RowValue) => { value.plans[1]!.net_prices.EUR = 0; }],
    ["PRO's RON price equal to PLUS's", (value: RowValue) => { value.plans[2]!.net_prices.RON = 100_000_000; }],
    ["a credit currency of EUR", (value: RowValue) => { value.credit_currency = "EUR"; }],
    ["a default of GBP", (value: RowValue) => { value.currency_by_country.default = "GBP"; }],
    ["a country mapped to a lower-case currency", (value: RowValue) => { value.currency_by_country.countries.DE = "eur"; }],
    ["the lookup's own XX as a key", (value: RowValue) => { value.currency_by_country.countries.XX = "USD"; }],
    ["a lower-case country key", (value: RowValue) => { value.currency_by_country.countries.ro = "RON"; }],
    ["250 countries", (value: RowValue) => {
      const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const countries: Record<string, string> = {};
      for (const first of letters) {
        for (const second of letters) {
          const code = `${first}${second}`;
          if (code !== "XX" && Object.keys(countries).length < 250) countries[code] = "EUR";
        }
      }
      value.currency_by_country.countries = countries;
    }]
  ])("refuses %s (BILLING_PLANS_INVALID)", (_name, mutate) => {
    const value = row();
    mutate(value);
    expect(() => plansOf(value)).toThrowError(expect.objectContaining({
      code: "BILLING_PLANS_INVALID", message: "The sealed billing plans row is malformed"
    }));
  });

  it("accepts a rule with the default EUR and no countries: every country pays EUR", () => {
    const value = row();
    value.currency_by_country = { default: "EUR", countries: {} };
    const euro = plansOf(value);
    for (const country of ["RO", "US", "DE", "XX", "", null]) expect(priceCurrencyFor(euro, country)).toBe("EUR");
  });
});
