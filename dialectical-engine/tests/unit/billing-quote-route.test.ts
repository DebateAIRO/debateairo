import { describe, expect, it, vi } from "vitest";
import { buildApi } from "@debateai/api";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { BillingRouteOptions } from "../../apps/api/src/billing/index.js";
import type { QuoteResult, QuoteServicePort } from "../../apps/api/src/billing/quote.js";
import { BillingRefusal } from "../../apps/api/src/billing/refusal.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";
import { testBillingPlans, unusedAskApplication } from "../support/billingFixtures.js";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const OWNER = testHttpIdentity("billing-quote-owner");
const RESULT: QuoteResult = Object.freeze({
  quote: {
    quoteId: "5f0c2a8e-8a61-4d1f-9a55-0d6f3a1b2c4d", ownerRef: OWNER.authenticated.ownerRef, planId: "PLUS",
    kind: "SUBSCRIBE", netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: 24_200_000, taxCountry: "RO",
    taxRegion: null, taxRateBasisPoints: 2_100, taxStatus: "TAXABLE", taxName: "VAT", quadernoRef: null,
    expiresAt: new Date(NOW.getTime() + 1_800_000), createdAt: NOW, locationCiphertext: Buffer.alloc(1), keyId: "k",
    recurringTotalMicros: null, currency: "USD"
  } as unknown as QuoteResult["quote"],
  declaredCountry: "RO", countryConfirmNeeded: true, ipCountry: "DE", addressRequired: false,
  renewsOn: new Date("2026-11-01T10:00:00.000Z"), withdrawalDays: 14
});

function harness(quotes: QuoteServicePort, overrides: Partial<{ requiresReacceptance: boolean; admission: AdmissionLimiter }> = {}) {
  const billing: BillingRouteOptions = {
    plans: testBillingPlans, clock: () => NOW, quotes,
    legal: { requiresReacceptance: async () => overrides.requiresReacceptance ?? false }
  };
  return buildApi({
    application: unusedAskApplication(), sessions: testSessionApplication([OWNER]), allowedOrigin: TEST_APP_ORIGIN,
    billing, ...(overrides.admission === undefined ? {} : { admission: overrides.admission })
  });
}

const post = (api: ReturnType<typeof harness>, payload: unknown, mutating = true) => api.inject({
  method: "POST", url: "/v1/billing/quote",
  headers: { ...testSessionHeaders(OWNER, mutating), "content-type": "application/json" },
  payload: JSON.stringify(payload)
});

describe("P8b POST /v1/billing/quote", () => {
  it("quotes for the signed-in owner and answers the parts the page words itself", async () => {
    const quotes = { create: vi.fn(async () => RESULT) };
    const api = harness(quotes);
    const response = await post(api, { plan_id: "PLUS", country: "RO", postal_code: "010101", name: "Ana Pop" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      quote_ref: RESULT.quote.quoteId, plan_id: "PLUS", net: "20.00", tax: "4.20", total: "24.20", currency: "USD",
      tax_name: "VAT", tax_rate_bp: 2100, tax_country: "RO", tax_region: null, tax_status: "TAXABLE",
      country: "RO", ip_country: "DE", country_confirm_needed: true, address_required: false,
      renews_on: "2026-11-01T10:00:00.000Z", withdrawal_days: 14, expires_at: "2026-10-01T10:30:00.000Z"
    });
    expect(quotes.create).toHaveBeenCalledWith(expect.objectContaining({
      ownerRef: OWNER.authenticated.ownerRef, planId: "PLUS", country: "RO", postalCode: "010101", name: "Ana Pop",
      region: null, city: null, company: null, now: NOW
    }));
    await api.close();
  });

  it("lets the page ask without a country, so the connection's country pre-fills it", async () => {
    const quotes = { create: vi.fn(async () => RESULT) };
    const api = harness(quotes);
    expect((await post(api, { plan_id: "PLUS" })).statusCode).toBe(200);
    expect(quotes.create).toHaveBeenCalledWith(expect.objectContaining({ country: null, name: null }));
    await api.close();
  });

  it("requires a session, the CSRF pair and a paid plan", async () => {
    const quotes = { create: vi.fn(async () => RESULT) };
    const api = harness(quotes);
    const anonymous = await api.inject({ method: "POST", url: "/v1/billing/quote", headers: { "content-type": "application/json" }, payload: "{}" });
    expect(anonymous.statusCode).toBe(401);
    expect((await post(api, { plan_id: "PLUS", country: "RO" }, false)).statusCode).toBe(403);
    const free = await post(api, { plan_id: "FREE", country: "RO" });
    expect(free.statusCode).toBe(400);
    expect(free.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
    expect((await post(api, { plan_id: "PLUS", country: "ro" })).statusCode).toBe(400);
    expect(quotes.create).not.toHaveBeenCalled();
    await api.close();
  });

  it("answers a refusal with its status and code only", async () => {
    for (const [status, code] of [[403, "COUNTRY_PAYMENT_UNAVAILABLE"], [422, "TAX_ID_INVALID"], [503, "TAX_SERVICE_UNAVAILABLE"], [409, "ALREADY_SUBSCRIBED"]] as const) {
      const api = harness({ create: async () => { throw new BillingRefusal(status, code); } });
      const response = await post(api, { plan_id: "PLUS", country: "RO" });
      expect(response.statusCode).toBe(status);
      expect(response.json()).toEqual({ error: code, message: code });
      await api.close();
    }
  });

  it("refuses before quoting when the documents must be accepted again, and charges the owner's budget", async () => {
    const quotes = { create: vi.fn(async () => RESULT) };
    const stale = harness(quotes, { requiresReacceptance: true });
    const refused = await post(stale, { plan_id: "PLUS", country: "RO" });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toEqual({ error: "LEGAL_REACCEPTANCE_REQUIRED", message: "LEGAL_REACCEPTANCE_REQUIRED" });
    await stale.close();
    const decide = vi.fn(() => ({ allowed: false, reason: "LIMIT", retryAfterMs: 1_000, windowMs: 3_600_000 }));
    const limited = harness(quotes, { admission: { configured: () => true, decide } as unknown as AdmissionLimiter });
    expect((await post(limited, { plan_id: "PLUS", country: "RO" })).statusCode).toBe(429);
    expect(decide).toHaveBeenCalledWith("billingQuote", OWNER.authenticated.ownerRef, expect.any(Date));
    expect(quotes.create).not.toHaveBeenCalled();
    await limited.close();
  });
});

describe("N18 the quote route passes NETOPIA's cardholder fields through (spec §2.6.1)", () => {
  it("maps first_name, last_name, phone and street, and keeps 422 BILLING_PHONE_INVALID", async () => {
    const quotes = { create: vi.fn(async () => RESULT) };
    const api = harness(quotes);
    const response = await post(api, {
      plan_id: "PLUS", country: "RO", first_name: "Ana", last_name: "Pop", phone: "+40 712 345 678",
      street: "Strada Lipscani 1", city: "Sector 1", region: "Bucuresti", postal_code: "010101"
    });
    expect(response.statusCode).toBe(200);
    expect(quotes.create).toHaveBeenCalledWith(expect.objectContaining({
      firstName: "Ana", lastName: "Pop", phone: "+40 712 345 678", street: "Strada Lipscani 1", name: null
    }));
    await api.close();
    const refused = harness({ create: async () => { throw new BillingRefusal(422, "BILLING_PHONE_INVALID"); } });
    const answer = await post(refused, { plan_id: "PLUS", phone: "0712" });
    expect([answer.statusCode, answer.json()]).toEqual([422, { error: "BILLING_PHONE_INVALID", message: "BILLING_PHONE_INVALID" }]);
    await refused.close();
  });
});
