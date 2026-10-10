import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PriceCurrency, TaxLocation } from "@debateai/billing-core";
import { QuadernoTaxEngine } from "@debateai/tax-quaderno";
import { FakeTaxEngine } from "../support/fake-tax-engine.js";
import { startFakeQuaderno, type FakeQuaderno } from "../support/fake-quaderno.js";

/**
 * Spec 2026-10-05 §2.16.4 (Part C): the tax is asked in the subscription's currency, and the answer is priced in the
 * currency asked, or the quote is not ours to charge. (Task C2 extends this file to the charge and the documents.)
 */
const LOCATION: TaxLocation = Object.freeze({
  country: "DE", region: null, postalCode: "10115", city: "Berlin", street: null, ip: "198.51.100.7"
});
const DATE = new Date("2026-10-10T08:00:00.000Z");

let fake: FakeQuaderno;
let engine: QuadernoTaxEngine;

beforeAll(async () => {
  fake = await startFakeQuaderno();
  engine = new QuadernoTaxEngine({ baseUrl: fake.baseUrl, apiKey: fake.apiKey, timeoutMs: 2_000 });
});
afterAll(async () => { await fake.stop(); });

const ask = (currency: PriceCurrency) => engine.quote({
  netMicros: 20_000_000, currency, location: LOCATION, taxId: null, taxCode: "saas", date: DATE
});

describe("Quaderno is asked in the subscription's currency", () => {
  it.each(["EUR", "RON", "USD"] as const)("a quote in %s sends that currency and keeps the cents answered", async (currency) => {
    const before = fake.requests.length;
    const quote = await ask(currency);
    const sent = fake.requests.slice(before).find((request) => request.path === "/api/tax_rates/calculate");
    expect(sent?.query.currency).toBe(currency);
    expect(sent?.query.amount).toBe("20.00");
    expect(quote).toMatchObject({ netMicros: 20_000_000, taxMicros: 3_800_000, totalMicros: 23_800_000, taxCountry: "DE" });
  });

  it("refuses an answer priced in another currency than the one asked (QUADERNO_CURRENCY_MISMATCH)", async () => {
    fake.overrideNextCalculation({ currency: '"USD"' });
    await expect(ask("EUR")).rejects.toThrowError(expect.objectContaining({
      code: "TAX_SERVICE_REFUSED", message: "QUADERNO_CURRENCY_MISMATCH"
    }));
  });

  it("the in-memory fake records the currency of every quote asked", async () => {
    const tax = new FakeTaxEngine();
    await tax.quote({ netMicros: 100_000_000, currency: "RON", location: { ...LOCATION, country: "RO" }, taxId: null, taxCode: "saas", date: DATE });
    await tax.quote({ netMicros: 20_000_000, currency: "EUR", location: LOCATION, taxId: null, taxCode: "saas", date: DATE });
    expect(tax.quotedCurrencies).toEqual(["RON", "EUR"]);
  });
});
