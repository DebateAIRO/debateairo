import { describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import type { TaxQuote } from "@debateai/billing-core";
import type { BillingRepository, QuoteRow } from "@debateai/db";
import type { BillingPlans, CountryPolicy } from "@debateai/register";
import type { BillingAuditField } from "../../apps/api/src/billing/audit.js";
import { QuoteService, type QuoteInput } from "../../apps/api/src/billing/quote.js";
import {
  StubGeo,
  testBillingPlans,
  testBillingPolicy,
  testCountryPolicy,
  testRegionalPlans
} from "../support/billingFixtures.js";
import { TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { FakeTaxEngine } from "../support/fake-tax-engine.js";

/**
 * Spec 2026-10-05 §2.16.1 (Part C): the SUBSCRIBE quote's currency is the tax location's country's, under the
 * register's `currency_by_country`, and the plan's net price is the one in that currency. The quote row records it.
 */
const NOW = new Date("2026-10-10T08:00:00.000Z");
const OWNER = "7b2c3d4e-5f60-4a71-8b92-000000000c04";
/** testCountryPolicy, plus Japan offered: a country under none of the rule's listed currencies. */
const COUNTRIES: CountryPolicy = Object.freeze({
  ...testCountryPolicy,
  countries: Object.freeze({
    ...testCountryPolicy.countries,
    JP: Object.freeze({ signup: true, pay: true, reason: "OFFERED" as const, blocked: false })
  })
});

const ADDRESSES: Readonly<Record<string, Partial<QuoteInput>>> = Object.freeze({
  RO: { street: "Strada Lipscani 1", region: "Bucuresti", postalCode: "010101", city: "Sector 1", phone: "+40712345678" },
  DE: { street: "Unter den Linden 1", region: null, postalCode: "10115", city: "Berlin", phone: "+4930123456" },
  US: { street: "1 Main Street", region: "TX", postalCode: "75001", city: "Addison", phone: "+12025550123" },
  JP: { street: "1-1 Chiyoda", region: null, postalCode: "100-0001", city: "Tokyo", phone: "+81312345678" }
});

function harness(plans: BillingPlans, country: string, tax: Pick<FakeTaxEngine, "quote" | "validateTaxId"> = new FakeTaxEngine()) {
  const inserted: QuoteRow[] = [];
  const audit: Array<Record<string, BillingAuditField>> = [];
  const repository = {
    withTransaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => fn({} as PoolClient),
    insertQuote: async (_client: PoolClient, row: QuoteRow) => { inserted.push(row); },
    subscriptionForOwner: async () => null,
    ownerErasurePending: async () => false
  } as unknown as Pick<BillingRepository, "withTransaction" | "insertQuote" | "subscriptionForOwner" | "ownerErasurePending">;
  const geo = new StubGeo();
  geo.country = country;
  const service = new QuoteService({
    repository, tax, geo, countryPolicy: COUNTRIES, policy: testBillingPolicy, plans, recordsKey: TEST_RECORDS_KEY,
    audit: (event, fields) => { audit.push({ event, ...fields }); }
  });
  const input: QuoteInput = {
    ownerRef: OWNER, ip: "198.51.100.7", planId: "PLUS", country, name: null, firstName: "Ana", lastName: "Pop",
    phone: null, street: null, region: null, postalCode: null, city: null, company: null, now: NOW,
    ...ADDRESSES[country]
  };
  return { service, input, inserted, audit };
}

describe("the SUBSCRIBE quote's currency is the tax country's (Part C)", () => {
  it("a Romanian buyer's PLUS quote is RON at 100.00 net, asked in RON, and the row says RON", async () => {
    const tax = new FakeTaxEngine();
    const asked: number[] = [];
    const recording = {
      quote: (i: Parameters<FakeTaxEngine["quote"]>[0]): Promise<TaxQuote> => { asked.push(i.netMicros); return tax.quote(i); },
      validateTaxId: tax.validateTaxId.bind(tax)
    };
    const { service, input, inserted } = harness(testRegionalPlans, "RO", recording);
    const result = await service.create(input);
    expect(result.quote).toMatchObject({ currency: "RON", netMicros: 100_000_000, taxMicros: 21_000_000, totalMicros: 121_000_000 });
    expect(tax.quotedCurrencies).toEqual(["RON"]);
    expect(asked).toEqual([100_000_000]);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]!.currency).toBe("RON");
  });

  it.each([
    ["DE", "EUR", 20_000_000, 3_800_000],
    ["US", "USD", 20_000_000, 1_250_000],
    ["JP", "USD", 20_000_000, 0]
  ] as const)("a buyer in %s pays %s", async (country, currency, net, taxMicros) => {
    const tax = new FakeTaxEngine();
    const { service, input, inserted } = harness(testRegionalPlans, country, tax);
    const result = await service.create(input);
    expect(result.quote).toMatchObject({ currency, netMicros: net, taxMicros, totalMicros: net + taxMicros });
    expect(tax.quotedCurrencies).toEqual([currency]);
    expect(inserted[0]!.currency).toBe(currency);
  });

  it("under testBillingPlans (every country USD) the Romanian buyer pays USD 20.00", async () => {
    const tax = new FakeTaxEngine();
    const { service, input, inserted } = harness(testBillingPlans, "RO", tax);
    const result = await service.create(input);
    expect(result.quote).toMatchObject({ currency: "USD", netMicros: 20_000_000, taxMicros: 4_200_000 });
    expect(tax.quotedCurrencies).toEqual(["USD"]);
    expect(inserted[0]!.currency).toBe("USD");
  });

  it("refuses a tax answer for a country of another currency: 503, no row, one audit line", async () => {
    const tax = new FakeTaxEngine();
    const elsewhere = {
      quote: async (i: Parameters<FakeTaxEngine["quote"]>[0]): Promise<TaxQuote> =>
        Object.freeze({ ...(await tax.quote(i)), taxCountry: "DE" }),
      validateTaxId: tax.validateTaxId.bind(tax)
    };
    const { service, input, inserted, audit } = harness(testRegionalPlans, "RO", elsewhere);
    await expect(service.create(input)).rejects.toMatchObject({ status: 503, code: "TAX_SERVICE_UNAVAILABLE" });
    expect(inserted).toEqual([]);
    expect(audit).toEqual([{ event: "billing.quote.refused", code: "TAX_SERVICE_UNAVAILABLE" }]);
  });
});
