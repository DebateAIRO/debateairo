import { describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import type { BillingRepository, QuoteRow } from "@debateai/db";
import type { CountryPolicy } from "@debateai/register";
import type { BillingAuditField } from "../../apps/api/src/billing/audit.js";
import { CheckoutService, type CheckoutDeps } from "../../apps/api/src/billing/checkout.js";
import { decidePaymentRegion, regionRefusal } from "../../apps/api/src/billing/place.js";
import { QuoteService, type QuoteInput } from "../../apps/api/src/billing/quote.js";
import { sealQuoteLocation, taxLocationOf, type QuoteLocation } from "../../apps/api/src/billing/records.js";
import type { StoredTaxContext } from "../../apps/api/src/billing/stored-tax-context.js";
import type { SubscriptionRouteDeps } from "../../apps/api/src/billing/subscription-deps.js";
import { gateCardAction, quoteUpgrade } from "../../apps/api/src/billing/upgrade.js";
import {
  StubGeo,
  testBillingPlans,
  testBillingPolicy,
  testClosedRegionsPolicy,
  testCountryPolicy
} from "../support/billingFixtures.js";
import { TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { FakeTaxEngine } from "../support/fake-tax-engine.js";

/**
 * Payment region blocks (spec 2026-10-20 §6, §8; preflight ruling R1): the quote, checkout start and the upgrade
 * refuse payment, never sign-up, for a billing address in a closed region.
 */
const NOW = new Date("2026-10-21T08:00:00.000Z");
const OWNER = "7b2c3d4e-5f60-4a71-8b92-000000000d21";
const COMPANY = Object.freeze({ name: "Acme LLC", vatId: "US123456", address: "1 Main Street, Columbus" });
type Audited = Record<string, BillingAuditField>;

const at = (country: string, postalCode: string | null, region: string | null, company: unknown | null = null) =>
  ({ country, postalCode, region, company });
const decide = (location: ReturnType<typeof at>, postcodeMustFit = true, policy: CountryPolicy = testClosedRegionsPolicy) =>
  decidePaymentRegion({ policy, location, postcodeMustFit });
const refuse = (region: string) => ({ kind: "REFUSE", code: "REGION_PAYMENT_UNAVAILABLE", region });

describe("decidePaymentRegion (ruling R1: a refusing region first, then a postcode that doesn't fit, then allow)", () => {
  it("refuses Saskatchewan by its postal code, however it is typed", () => {
    expect(decide(at("CA", "S4P3Y2", null))).toEqual(refuse("CA-SK"));
    expect(decide(at("CA", "s4p 3y2", null))).toEqual(refuse("CA-SK"));
  });

  it("lets an Ohio consumer pay and refuses an Ohio company (US-OH closes for business buyers only)", () => {
    expect(decide(at("US", "43004", null))).toEqual({ kind: "ALLOW" });
    expect(decide(at("US", "43004", null, COMPANY))).toEqual(refuse("US-OH"));
  });

  it("sends back a US ZIP that lost its leading zero, but only where the postcode must fit", () => {
    expect(decide(at("US", "2903", null), true)).toEqual({ kind: "POSTCODE_INVALID" });
    expect(decide(at("US", "2903", null), false)).toEqual({ kind: "ALLOW" });
  });

  it("refuses a malformed ZIP whose typed region is closed, whatever postcodeMustFit says", () => {
    expect(decide(at("US", "2903", "Rhode Island"), true)).toEqual(refuse("US-RI"));
    expect(decide(at("US", "2903", "Rhode Island"), false)).toEqual(refuse("US-RI"));
  });

  it("refuses when either signal is closed, and names the first closed region in sorted order", () => {
    expect(decide(at("CA", "T5J 0N3", "Saskatchewan"))).toEqual(refuse("CA-SK"));
    expect(decide(at("US", "21201", "Rhode Island"))).toEqual(refuse("US-MD"));
    expect(decide(at("US", "02903", "MD"))).toEqual(refuse("US-MD"));
  });

  it("leaves Romania, mainland Germany and Ireland alone", () => {
    expect(decide(at("RO", "010011", null))).toEqual({ kind: "ALLOW" });
    expect(decide(at("DE", "10115", null))).toEqual({ kind: "ALLOW" });
    expect(decide(at("IE", null, null))).toEqual({ kind: "ALLOW" });
  });

  it("allows every case under a policy without regions (every version published so far)", () => {
    expect(testCountryPolicy.regions).toEqual({});
    for (const location of [
      at("CA", "S4P3Y2", null), at("US", "43004", null, COMPANY), at("US", "2903", null), at("US", "2903", "Rhode Island"),
      at("RO", "010011", null), at("ES", "35001", null)
    ]) {
      for (const mustFit of [true, false]) expect(decide(location, mustFit, testCountryPolicy), JSON.stringify(location)).toEqual({ kind: "ALLOW" });
    }
  });

  it("treats a rule with pay: true exactly like no rule", () => {
    const open: CountryPolicy = Object.freeze({
      ...testCountryPolicy,
      regions: Object.freeze({ "US-MD": Object.freeze({ pay: true, reason: "OFFERED" as const, buyers: "all" as const }) })
    });
    expect(decide(at("US", "21201", "MD"), true, open)).toEqual({ kind: "ALLOW" });
    expect(decide(at("US", "2903", null), true, open)).toEqual({ kind: "ALLOW" });
  });

  it("writes one audit line with the code, the country and the region only, and answers 403", () => {
    const lines: Audited[] = [];
    const refusal = regionRefusal(refuse("CA-SK") as Extract<ReturnType<typeof decide>, { kind: "REFUSE" }>, "CA",
      (event, fields) => { lines.push({ event, ...fields }); });
    expect([refusal.status, refusal.code]).toEqual([403, "REGION_PAYMENT_UNAVAILABLE"]);
    expect(lines).toEqual([{ event: "billing.region.refused", code: "REGION_PAYMENT_UNAVAILABLE", country: "CA", region: "CA-SK" }]);
  });
});

function quoteHarness(country: string) {
  const tax = new FakeTaxEngine();
  const taxCalls: string[] = [];
  const recording = {
    quote: (i: Parameters<FakeTaxEngine["quote"]>[0]) => { taxCalls.push("quote"); return tax.quote(i); },
    validateTaxId: (c: string, id: string) => { taxCalls.push("validateTaxId"); return tax.validateTaxId(c, id); }
  };
  const inserted: QuoteRow[] = [];
  const audit: Audited[] = [];
  const repository = {
    withTransaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => fn({} as PoolClient),
    insertQuote: async (_client: PoolClient, row: QuoteRow) => { inserted.push(row); },
    subscriptionForOwner: async () => null,
    ownerErasurePending: async () => false
  } as unknown as Pick<BillingRepository, "withTransaction" | "insertQuote" | "subscriptionForOwner" | "ownerErasurePending">;
  const geo = new StubGeo();
  geo.country = country;
  const service = new QuoteService({
    repository, tax: recording, geo, countryPolicy: testClosedRegionsPolicy, policy: testBillingPolicy,
    plans: testBillingPlans, recordsKey: TEST_RECORDS_KEY, audit: (event, fields) => { audit.push({ event, ...fields }); }
  });
  const input = (fields: Partial<QuoteInput>): QuoteInput => ({
    ownerRef: OWNER, ip: "198.51.100.7", planId: "PLUS", country, name: null, firstName: "Ana", lastName: "Pop",
    phone: null, street: null, region: null, postalCode: null, city: null, company: null, now: NOW, ...fields
  });
  return { service, input, taxCalls, inserted, audit };
}

describe("the SUBSCRIBE quote checks the payment region right after the country", () => {
  it("refuses an Ohio company before its VAT id or the tax is asked", async () => {
    const { service, input, taxCalls, inserted, audit } = quoteHarness("US");
    await expect(service.create(input({ postalCode: "43004", region: "OH", company: COMPANY })))
      .rejects.toMatchObject({ status: 403, code: "REGION_PAYMENT_UNAVAILABLE" });
    expect(taxCalls).toEqual([]);
    expect(inserted).toEqual([]);
    expect(audit).toEqual([
      { event: "billing.region.refused", code: "REGION_PAYMENT_UNAVAILABLE", country: "US", region: "US-OH" },
      { event: "billing.quote.refused", code: "REGION_PAYMENT_UNAVAILABLE" }
    ]);
  });

  it("quotes an Ohio consumer", async () => {
    const { service, input, inserted } = quoteHarness("US");
    await service.create(input({ postalCode: "43004", region: "OH" }));
    expect(inserted).toHaveLength(1);
  });
});

/** A complete US cardholder (spec 2026-10-05 §2.6.1), so checkout start reaches its region check. */
function storedLocation(fields: Partial<QuoteLocation>): QuoteLocation {
  return {
    name: "Ana Pop", firstName: "Ana", lastName: "Pop", phone: "+12025550123", country: "US", region: "MD",
    postalCode: "21201", city: "Baltimore", street: "1 Main Street", ip: "198.51.100.7", ipCountry: "US", company: null,
    ...fields
  };
}

function checkoutHarness(location: QuoteLocation) {
  const quoteId = "5f0c2a8e-8a61-4d1f-9a55-0d6f3a1b2d21";
  const sealed = sealQuoteLocation(TEST_RECORDS_KEY, quoteId, location);
  const quote = {
    quoteId, ownerRef: OWNER, planId: "PLUS", kind: "SUBSCRIBE", netMicros: 20_000_000, taxMicros: 0,
    totalMicros: 20_000_000, taxCountry: location.country, taxRegion: null, taxRateBasisPoints: 0, taxStatus: "TAXABLE",
    taxName: "Sales tax", quadernoRef: null, expiresAt: new Date(NOW.getTime() + 1_800_000), createdAt: NOW,
    locationCiphertext: sealed.ciphertext, keyId: sealed.keyId, recurringTotalMicros: null, currency: "USD"
  } as unknown as QuoteRow;
  const written = vi.fn(async () => { throw new Error("NOTHING_IS_WRITTEN"); });
  const repository = {
    quote: async (ref: string, owner: string) => (ref === quoteId && owner === OWNER ? quote : null),
    withTransaction: written, insertCharge: written, appendSubscriptionEvent: written, appendChargeEvent: written,
    useQuote: written, ensureCustomer: written, appendProfile: written, insertHostedPayment: written
  };
  const audit: Audited[] = [];
  const geo = new StubGeo();
  geo.country = location.country;
  const payments = { environment: "sandbox", start: written };
  const service = new CheckoutService({
    repository, payments, geo, countryPolicy: testClosedRegionsPolicy, policy: testBillingPolicy,
    recordsKey: TEST_RECORDS_KEY, audit: (event: string, fields: Audited) => { audit.push({ event, ...fields }); },
    consentDocuments: () => { throw new Error("NOT_REACHED"); }, accountEmail: { read: written }, jobs: {},
    acceptances: { record: written }, publicAppUrl: "https://dezbatere.test", kick: () => {}
  } as unknown as CheckoutDeps);
  const start = () => service.start({
    ownerRef: OWNER, userId: OWNER, ip: "198.51.100.7", userAgent: "test", quoteRef: quoteId, locale: "en",
    consents: { renewal: { version: "v", sha256: "a".repeat(64) }, immediateStart: { version: "v", sha256: "a".repeat(64) } },
    countryConfirmed: true, now: NOW
  });
  return { start, written, audit };
}

describe("checkout start re-checks the stored address, so a crafted request cannot skip the quote", () => {
  it("refuses a stored quote in Maryland: 403, one audit line, and no charge or subscription is written", async () => {
    const { start, written, audit } = checkoutHarness(storedLocation({}));
    await expect(start()).rejects.toMatchObject({ status: 403, code: "REGION_PAYMENT_UNAVAILABLE" });
    expect(written).not.toHaveBeenCalled();
    expect(audit).toEqual([{ event: "billing.region.refused", code: "REGION_PAYMENT_UNAVAILABLE", country: "US", region: "US-MD" }]);
  });

  it("sends back a stored ZIP that doesn't fit (422), writing nothing", async () => {
    const { start, written } = checkoutHarness(storedLocation({ postalCode: "2903", region: "Texas", city: "Austin" }));
    await expect(start()).rejects.toMatchObject({ status: 422, code: "BILLING_POSTCODE_INVALID" });
    expect(written).not.toHaveBeenCalled();
  });
});

function upgradeContext(location: QuoteLocation): StoredTaxContext {
  return {
    quoteLocation: location, location: taxLocationOf(location), taxId: null, profile: null,
    customerId: "c", currency: "EUR"
  } as unknown as StoredTaxContext;
}

describe("the upgrade quote's payment gate (gateCardAction) refuses a subscriber whose stored address is closed", () => {
  const gate = (location: QuoteLocation, audit: Audited[] = []) => {
    const geo = new StubGeo();
    geo.country = location.country;
    return gateCardAction({
      legal: { requiresReacceptance: async () => false } as never, geo, countryPolicy: testClosedRegionsPolicy,
      audit: (event, fields) => { audit.push({ event, ...fields }); }
    }, OWNER, "198.51.100.7", upgradeContext(location));
  };

  it("refuses a stored address in the Canary Islands: 403 and one content-free audit line", async () => {
    const audit: Audited[] = [];
    const canaries = storedLocation({ country: "ES", region: null, postalCode: "35001", city: "Las Palmas", ipCountry: "ES" });
    await expect(gate(canaries, audit)).rejects.toMatchObject({ status: 403, code: "REGION_PAYMENT_UNAVAILABLE" });
    expect(audit).toEqual([{ event: "billing.region.refused", code: "REGION_PAYMENT_UNAVAILABLE", country: "ES", region: "ES-CN" }]);
  });

  it("never asks an existing subscriber to fix an old postcode, and still refuses an Ohio company", async () => {
    await expect(gate(storedLocation({ postalCode: "2903", region: "Texas" }))).resolves.toBe("US");
    await expect(gate(storedLocation({ postalCode: "43004", region: "OH" }))).resolves.toBe("US");
    await expect(gate(storedLocation({ postalCode: "43004", region: "OH", company: { ...COMPANY, vatValidated: true } })))
      .rejects.toMatchObject({ status: 403, code: "REGION_PAYMENT_UNAVAILABLE" });
  });
});

describe("quoteUpgrade refuses a subscriber whose stored INITIAL quote is in a closed region", () => {
  it("a Canary Islands subscriber: 403 REGION_PAYMENT_UNAVAILABLE, no tax asked, no quote stored", async () => {
    const quoteId = "5f0c2a8e-8a61-4d1f-9a55-0d6f3a1b2d22";
    const subscriptionId = "7b2c3d4e-5f60-4a71-8b92-000000000d22";
    const location = storedLocation({ country: "ES", region: null, postalCode: "35001", city: "Las Palmas", ipCountry: "ES" });
    const sealed = sealQuoteLocation(TEST_RECORDS_KEY, quoteId, location);
    const initialQuote = {
      quoteId, ownerRef: OWNER, planId: "PLUS", kind: "SUBSCRIBE", currency: "EUR",
      locationCiphertext: sealed.ciphertext, keyId: sealed.keyId
    } as unknown as QuoteRow;
    const state = {
      subscriptionId, ownerRef: OWNER, planId: "PLUS", status: "ACTIVE", currency: "EUR",
      currentPeriodStart: new Date(NOW.getTime() - 10 * 86_400_000), currentPeriodEnd: new Date(NOW.getTime() + 20 * 86_400_000),
      renewalPostponedUntil: null
    };
    const insertQuote = vi.fn(async () => {});
    const taxQuote = vi.fn(async () => { throw new Error("NOT_REACHED"); });
    const audit: Audited[] = [];
    const geo = new StubGeo();
    geo.country = "ES";
    const deps = {
      billing: {
        subscriptionForOwner: async (owner: string) => (owner === OWNER ? state : null),
        ownerErasurePending: async () => false,
        chargesForSubscription: async () => [{ kind: "INITIAL", quoteId, periodStart: state.currentPeriodStart }],
        subscriptionEvents: async () => [{ kind: "ACTIVATED", data: { recurring_net_micros: 20_000_000 } }],
        quote: async (ref: string, owner: string) => (ref === quoteId && owner === OWNER ? initialQuote : null),
        customerByOwner: async () => ({ customerId: "c" }),
        latestProfile: async () => null,
        withTransaction: async <T>(fn: (client: PoolClient) => Promise<T>): Promise<T> => fn({} as PoolClient),
        insertQuote
      },
      plans: testBillingPlans, policy: testBillingPolicy, tax: { quote: taxQuote }, recordsKey: TEST_RECORDS_KEY,
      legal: { requiresReacceptance: async () => false }, countryPolicy: testClosedRegionsPolicy, geo,
      audit: (event: string, fields: Record<string, BillingAuditField>) => { audit.push({ event, ...fields }); }
    } as unknown as SubscriptionRouteDeps;
    await expect(quoteUpgrade(deps, { ownerRef: OWNER, planId: "PRO", ip: "198.51.100.7", now: NOW }))
      .rejects.toMatchObject({ status: 403, code: "REGION_PAYMENT_UNAVAILABLE" });
    expect(insertQuote).not.toHaveBeenCalled();
    expect(taxQuote).not.toHaveBeenCalled();
    expect(audit).toEqual([{ event: "billing.region.refused", code: "REGION_PAYMENT_UNAVAILABLE", country: "ES", region: "ES-CN" }]);
  });
});
