import { afterEach, describe, expect, it } from "vitest";
import { COUNTRY_CODES } from "../../apps/ui/lib/billing/countries.js";
import {
  BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, planNetPrice, priceCurrencyFor
} from "../../packages/register/src/billing-plans.js";
import { quadernoPricing, quadernoPricingFromKeyFile } from "../../tools/v4-mock-api/quaderno-tax.js";
import { startFakeQuaderno, type FakeQuaderno } from "../support/fake-quaderno.js";

const PLANS = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.sourceRef);
/** The US and Canada price by postal code, as the plans route sends it. */
const POSTAL_CODES: Readonly<Record<string, string>> = { US: "10001", CA: "M5V 2T6" };
const cents = (decimal: string): number => Math.round(Number(decimal) * 100);

let quaderno: FakeQuaderno | null = null;
afterEach(async () => {
  await quaderno?.stop();
  quaderno = null;
});

async function pricing() {
  quaderno = await startFakeQuaderno();
  return quadernoPricing({ plans: PLANS, apiKey: quaderno.apiKey, baseUrl: quaderno.baseUrl });
}

describe("the V4 mock's plans priced by Quaderno (MOCK_QUADERNO_API_KEY_PATH)", () => {
  it("prices every country the pricing page offers from Quaderno's own answer, in that country's currency", async () => {
    const price = await pricing();
    for (const country of COUNTRY_CODES) {
      const postalCode = POSTAL_CODES[country] ?? null;
      const priced = await price({ country, postalCode });
      expect(priced, country).not.toBeNull();
      expect(priced!.tax.country, country).toBe(country);
      for (const plan of PLANS.plans) {
        const net = planNetPrice(plan, priceCurrencyFor(PLANS, country)) / 10_000;
        // The total is the plan's net with Quaderno's tax: never below the net, and the net itself where none is added.
        expect(cents(priced!.totals[plan.planId]), `${country} ${plan.planId}`).toBeGreaterThanOrEqual(net);
        if (priced!.tax.tax_status !== "TAXABLE") expect(cents(priced!.totals[plan.planId]), country).toBe(net);
      }
    }
    // Quaderno is asked once per paid plan for each country, for that country, in its currency.
    const calculations = quaderno!.requests.filter((request) => request.path === "/api/tax_rates/calculate");
    expect(calculations).toHaveLength(COUNTRY_CODES.length * 3);
    for (const request of calculations) {
      const country = request.query.to_country!;
      expect(request.query.currency, country).toBe(priceCurrencyFor(PLANS, country));
      expect(request.query.to_postal_code, country).toBe(POSTAL_CODES[country]);
    }
  });

  it("shows a taxed place's rate and name as Quaderno answers them", async () => {
    const priced = await (await pricing())({ country: "DE", postalCode: null });
    expect(priced!.tax).toMatchObject({ country: "DE", tax_status: "TAXABLE" });
    expect(priced!.tax.tax_rate_bp).toBeGreaterThan(0);
    expect(cents(priced!.totals.PLUS)).toBeGreaterThan(cents("20.00"));
    expect(priced!.totals.FREE).toBe("0.00");
  });

  it("gives no price when Quaderno fails, or answers in another currency", async () => {
    const price = await pricing();
    quaderno!.failNext(500, 6);
    expect(await price({ country: "GB", postalCode: null })).toBeNull();
    // Another place, so no kept answer stands in: Quaderno names a currency the place does not pay in.
    for (let call = 0; call < 3; call += 1) quaderno!.overrideNextCalculation({ currency: '"JPY"' });
    expect(await price({ country: "NO", postalCode: null })).toBeNull();
  });

  it("is off without a key path, and refuses a key file it cannot read as the API would", () => {
    const fromKeyFile = (keyPath: string | undefined) =>
      quadernoPricingFromKeyFile({ plans: PLANS, keyPath, baseUrl: undefined, log: () => undefined });
    expect(fromKeyFile(undefined)).toBeNull();
    expect(fromKeyFile(" ")).toBeNull();
    expect(() => fromKeyFile("/nonexistent/quaderno-sandbox-key")).toThrow(/^MOCK_QUADERNO_API_KEY_PATH_INVALID/u);
  });
});
