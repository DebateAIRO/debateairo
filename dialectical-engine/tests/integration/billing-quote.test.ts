import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { BillingRepository, migrate } from "@debateai/db";
import { computeWindows } from "@debateai/billing-core";
import { TypedDomainError } from "@debateai/kernel";
import { QuoteService, type QuoteInput } from "../../apps/api/src/billing/quote.js";
import { openQuoteLocation } from "../../apps/api/src/billing/records.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import {
  activeSubscriptionEvents, AdjustableTaxEngine, StubGeo, testBillingPlans, testBillingPolicy, testCountryPolicy
} from "../support/billingFixtures.js";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const KEY = randomBytes(32);
let database: TestDatabase;
let repository: BillingRepository;
let tax: AdjustableTaxEngine;
let geo: StubGeo;
let audit: Array<Readonly<Record<string, unknown>>>;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  repository = new BillingRepository(database.pool);
});
afterAll(async () => { await database?.stop(); });
beforeEach(() => { tax = new AdjustableTaxEngine(); geo = new StubGeo(); audit = []; });

const service = () => new QuoteService({
  repository, tax, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy, plans: testBillingPlans,
  recordsKey: KEY, audit: (event, fields) => { audit.push({ event, ...fields }); }
});
const input = (ownerRef: string, overrides: Partial<QuoteInput> = {}): QuoteInput => ({
  ownerRef, ip: "198.51.100.7", planId: "PLUS", country: "RO", name: "Ana Pop", region: "Bucuresti", postalCode: "010101",
  city: "Sector 1", company: null, now: NOW, ...overrides
});

describe("P8b the quote", () => {
  it("stores the tax service's figures with the location sealed under the records key, for its owner only", async () => {
    const ownerRef = randomUUID();
    const result = await service().create(input(ownerRef));
    expect(result).toMatchObject({ declaredCountry: "RO", countryConfirmNeeded: false, ipCountry: "RO", addressRequired: false, withdrawalDays: 14 });
    expect(result.renewsOn).toEqual(computeWindows(NOW, NOW).month.end);
    const stored = await repository.quote(result.quote.quoteId, ownerRef);
    expect(stored).toMatchObject({
      planId: "PLUS", kind: "SUBSCRIBE", netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: 24_200_000,
      taxCountry: "RO", taxRateBasisPoints: 2_100, taxStatus: "TAXABLE", expiresAt: new Date(NOW.getTime() + 1_800_000)
    });
    expect(openQuoteLocation(KEY, result.quote.quoteId, stored!.locationCiphertext)).toEqual({
      name: "Ana Pop", firstName: null, lastName: null, phone: null, country: "RO", region: "Bucuresti",
      postalCode: "010101", city: "Sector 1", street: null, ip: "198.51.100.7", ipCountry: "RO", company: null
    });
    expect(await repository.quote(result.quote.quoteId, randomUUID())).toBeNull();
  });

  it("uses the connection's country when the page sends none", async () => {
    geo.country = "DE";
    const result = await service().create(input(randomUUID(), { country: null, name: null, region: null, city: null }));
    expect(result).toMatchObject({ declaredCountry: "DE", ipCountry: "DE", countryConfirmNeeded: false, addressRequired: false });
    expect(result.quote).toMatchObject({ taxCountry: "DE", taxRateBasisPoints: 1_900, totalMicros: 23_800_000 });
  });

  it("asks for the name, city and county a Romanian invoice needs, and still prices without them (R-15)", async () => {
    const result = await service().create(input(randomUUID(), { name: null, city: null }));
    expect(result).toMatchObject({ addressRequired: true, quote: { totalMicros: 24_200_000 } });
    const company = { name: "SC Test SRL", vatId: "RO123VALID", address: "Str. Test 1" };
    expect((await service().create(input(randomUUID(), { name: null, company }))).addressRequired).toBe(false);
  });

  it("asks for a county SmartBill knows and, in Bucharest, a sector, or ANAF refuses the e-Factura (P2-M15)", async () => {
    const asks = async (region: string, city: string) =>
      (await service().create(input(randomUUID(), { region, city }))).addressRequired;
    expect(await asks("Bucuresti", "Sector 3")).toBe(false);
    expect(await asks("Cluj", "Cluj-Napoca")).toBe(false);
    // SPV validates a Bucharest buyer only with a city of Sector 1 to Sector 6 (smartbill-api-facts.md row 3).
    expect(await asks("B", "Bucuresti")).toBe(true);
    expect(await asks("Bucuresti", "Bucuresti")).toBe(true);
    expect(await asks("Atlantis", "Poseidonia")).toBe(true);
    // A company is invoiced at the same county and city.
    const company = { name: "SC Test SRL", vatId: "RO123VALID", address: "Str. Test 1" };
    expect((await service().create(input(randomUUID(), { name: null, company, region: "B", city: "Bucuresti" }))).addressRequired)
      .toBe(true);
  });

  it("asks a US or Canadian buyer for the postal code before the checkout: a state alone is not enough (spec §1.3, P2-M29)", async () => {
    geo.country = "US";
    const bare = { country: "US", name: null, region: null, postalCode: null, city: null } as const;
    expect(await service().create(input(randomUUID(), bare))).toMatchObject({ addressRequired: true, quote: { taxCountry: "US" } });
    expect((await service().create(input(randomUUID(), { ...bare, postalCode: "10001" }))).addressRequired).toBe(false);
    // Quaderno is never sent a region (P4), so a state alone would price the sale with no state at all.
    expect((await service().create(input(randomUUID(), { ...bare, region: "NY" }))).addressRequired).toBe(true);
    expect((await service().create(input(randomUUID(), { ...bare, region: "TX" }))).quote).toMatchObject({ taxMicros: 0, taxStatus: "NOT_REGISTERED" });
    expect((await service().create(input(randomUUID(), { ...bare, postalCode: "75001" }))).quote)
      .toMatchObject({ taxMicros: 1_250_000, taxRegion: "TX", taxStatus: "TAXABLE" });
  });

  it("asks the person to confirm their country when the connection looks like another one", async () => {
    geo.country = "DE";
    expect(await service().create(input(randomUUID()))).toMatchObject({ countryConfirmNeeded: true, ipCountry: "DE" });
  });

  it("refuses a country that cannot pay, an unknown place and Tor, each with its code and one audit line", async () => {
    await expect(service().create(input(randomUUID(), { country: "GB" }))).rejects.toMatchObject({ status: 403, code: "COUNTRY_PAYMENT_UNAVAILABLE" });
    geo.country = "XX";
    await expect(service().create(input(randomUUID()))).rejects.toMatchObject({ status: 403, code: "COUNTRY_UNKNOWN" });
    await expect(service().create(input(randomUUID(), { country: null }))).rejects.toMatchObject({ status: 403, code: "COUNTRY_UNKNOWN" });
    geo.country = "RO";
    geo.tor = true;
    await expect(service().create(input(randomUUID()))).rejects.toMatchObject({ status: 403, code: "TOR_REFUSED" });
    expect(audit.filter((line) => line.event === "billing.country.refused").map((line) => line.code)).toEqual([
      "COUNTRY_PAYMENT_UNAVAILABLE", "COUNTRY_UNKNOWN", "COUNTRY_UNKNOWN", "TOR_REFUSED"
    ]);
    expect(JSON.stringify(audit)).not.toContain("198.51.100.7");
  });

  it("checks a company's VAT number first: a valid cross-border one is reverse charge, an invalid one refused", async () => {
    geo.country = "DE";
    const company = { name: "Test GmbH", vatId: "DE123VALID", address: "Teststr. 1" };
    const valid = await service().create(input(randomUUID(), { country: "DE", name: null, region: null, city: null, company }));
    expect(valid.quote).toMatchObject({ taxMicros: 0, totalMicros: 20_000_000, taxStatus: "REVERSE_CHARGE" });
    await expect(service().create(input(randomUUID(), { country: "DE", company: { ...company, vatId: "DE123INVALID" } })))
      .rejects.toMatchObject({ status: 422, code: "TAX_ID_INVALID" });
  });

  it("answers TAX_SERVICE_UNAVAILABLE when the tax service fails, and stores nothing", async () => {
    const ownerRef = randomUUID();
    tax.failNext("TAX_SERVICE_UNAVAILABLE");
    await expect(service().create(input(ownerRef))).rejects.toMatchObject({ status: 503, code: "TAX_SERVICE_UNAVAILABLE" });
    const rows = await database.pool.query("SELECT 1 FROM billing.quote WHERE owner_ref=$1", [ownerRef]);
    expect(rows.rowCount).toBe(0);
    expect(audit).toEqual([{ event: "billing.quote.refused", code: "TAX_SERVICE_UNAVAILABLE" }]);
  });

  it("audits a quote the tax service refuses as that refusal, with its detail, and still answers the one 503 (P2-M27)", async () => {
    // P4's client on a wrong or revoked Quaderno key: TAX_SERVICE_REFUSED with the detail QUADERNO_HTTP_401.
    const refusing = {
      quote: async (): Promise<never> => { throw new TypedDomainError("TAX_SERVICE_REFUSED", "QUADERNO_HTTP_401"); },
      validateTaxId: (country: string, taxId: string) => tax.validateTaxId(country, taxId)
    };
    const quotes = new QuoteService({
      repository, tax: refusing, geo, countryPolicy: testCountryPolicy, policy: testBillingPolicy, plans: testBillingPlans,
      recordsKey: KEY, audit: (event, fields) => { audit.push({ event, ...fields }); }
    });
    await expect(quotes.create(input(randomUUID()))).rejects.toMatchObject({ status: 503, code: "TAX_SERVICE_UNAVAILABLE" });
    expect(audit).toEqual([{ event: "billing.quote.refused", code: "TAX_SERVICE_REFUSED", reason: "QUADERNO_HTTP_401" }]);
  });

  it("refuses ALREADY_SUBSCRIBED while the owner has a live subscription", async () => {
    const ownerRef = randomUUID();
    await repository.withTransaction(async (client) => {
      for (const event of activeSubscriptionEvents(ownerRef, NOW)) await repository.appendSubscriptionEvent(client, event);
    });
    await expect(service().create(input(ownerRef))).rejects.toMatchObject({ status: 409, code: "ALREADY_SUBSCRIBED" });
  });
});
