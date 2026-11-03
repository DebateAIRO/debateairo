import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizationPolicyInventory, buildApi } from "@debateai/api";
import { BillingPlansResponseSchema, contractInventory } from "@debateai/contract";
import { TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW, taxAuthoritiesFromValue } from "@debateai/register";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { BillingAudit } from "../../apps/api/src/billing/audit.js";
import { DisplayedTaxReader } from "../../apps/api/src/billing/displayed-tax.js";
import { BILLING_ROUTE_PATHS, type BillingRouteOptions } from "../../apps/api/src/billing/index.js";
import { createBillingRuntime, type BillingRuntimeDeps } from "../../apps/api/src/billing/runtime.js";
import type { GeoLookup } from "@debateai/geo";
import {
  testBillingPlans, testBillingPolicy, testCountryPolicy, testRegionalPlans, unusedAskApplication
} from "../support/billingFixtures.js";
import { FakeTaxEngine } from "../support/fake-tax-engine.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";

const NOW = new Date("2026-10-01T10:00:00.000Z");
/** testBillingPlans' prices (the regional fixture shares them): every plan in every currency; no country's tax. */
const PLANS_ANSWER = [
  { plan_id: "FREE", net_prices: { USD: "0.00", EUR: "0.00", RON: "0.00" }, total_price: null, allowance_vs_plus: "0.05" },
  { plan_id: "PLUS", net_prices: { USD: "20.00", EUR: "20.00", RON: "100.00" }, total_price: null, allowance_vs_plus: "1" },
  { plan_id: "PRO", net_prices: { USD: "50.00", EUR: "50.00", RON: "250.00" }, total_price: null, allowance_vs_plus: "5" },
  { plan_id: "MAX", net_prices: { USD: "200.00", EUR: "200.00", RON: "1000.00" }, total_price: null, allowance_vs_plus: "33.33" }
] as const;
const billing = (): BillingRouteOptions => ({
  plans: testBillingPlans, legal: { requiresReacceptance: async () => false }, clock: () => NOW
});

describe("P8a GET /v1/billing/plans", () => {
  it("answers the house 404 when billing is off or the deployment is local, with the route still registered", async () => {
    for (const options of [{}, { billing: {} }]) {
      const api = buildApi({ application: unusedAskApplication(), ...options });
      const response = await api.inject({ method: "GET", url: "/v1/billing/plans" });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "NOT_FOUND", message: "NOT_FOUND" });
      // The router's own not-found handler answers the same body, so only the registration tells the two apart.
      expect(api.hasRoute({ method: "GET", url: "/v1/billing/plans" })).toBe(true);
      await api.close();
    }
  });

  it("lists net prices in each currency and the allowance as a multiple of Plus, never credit in dollars", async () => {
    const api = buildApi({ application: unusedAskApplication(), billing: billing() });
    const response = await api.inject({ method: "GET", url: "/v1/billing/plans" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ currency: "USD", tax: null, plans: PLANS_ANSWER });
    expect(response.body).not.toMatch(/credit|6\.60|220\.00|0\.33/);
    expect(BillingPlansResponseSchema.safeParse({
      ...response.json<Record<string, unknown>>(),
      plans: [{ plan_id: "PLUS", net_prices: PLANS_ANSWER[1]!.net_prices, total_price: null, allowance_vs_plus: "1", credit: "6.60" }]
    }).success).toBe(false);
    // Part C: one price per plan is gone; every plan carries all three.
    expect(BillingPlansResponseSchema.safeParse({
      currency: "USD", tax: null, plans: [{ plan_id: "PLUS", net_price: "20.00", total_price: null, allowance_vs_plus: "1" }]
    }).success).toBe(false);
    await api.close();
  });

  it("answers each visitor in the currency their connection pays in, with the same prices for everyone (spec 2026-10-05 §2.16.1)", async () => {
    const PLACES: Readonly<Record<string, Readonly<{ country: string; tor: boolean }>>> = {
      "198.51.100.10": { country: "RO", tor: false },
      "198.51.100.20": { country: "DE", tor: false },
      "198.51.100.30": { country: "US", tor: false },
      "198.51.100.40": { country: "RO", tor: true }
    };
    const geo: GeoLookup = { lookup: (ip) => PLACES[ip] ?? { country: "XX", tor: false }, close: () => undefined };
    const api = buildApi({ application: unusedAskApplication(), billing: { ...billing(), plans: testRegionalPlans, geo } });
    const answers: Array<[string, string]> = [
      ["198.51.100.10", "RON"], ["198.51.100.20", "EUR"], ["198.51.100.30", "USD"],
      // An unknown place, a Tor exit and an address that is not an IP say nothing about where the person is billed.
      ["198.51.100.99", "USD"], ["198.51.100.40", "USD"], ["not-an-address", "USD"]
    ];
    for (const [remoteAddress, currency] of answers) {
      const response = await api.inject({ method: "GET", url: "/v1/billing/plans", remoteAddress });
      expect(response.statusCode, remoteAddress).toBe(200);
      expect(response.json(), remoteAddress).toEqual({ currency, tax: null, plans: PLANS_ANSWER });
      expect(response.body, remoteAddress).not.toMatch(/credit/u);
    }
    await api.close();
  });

  it("lets a served list be cached for 60 seconds, and nothing else (spec §2.5.3)", async () => {
    const on = buildApi({ application: unusedAskApplication(), billing: billing() });
    const served = await on.inject({ method: "GET", url: "/v1/billing/plans" });
    // Spec 2026-10-05 §2.16.5: the answer names the caller's currency, so no shared cache may keep it.
    expect([served.statusCode, served.headers["cache-control"]]).toEqual([200, "private, max-age=60"]);
    // The house security headers still ride along on the cached answer.
    expect(served.headers["x-content-type-options"]).toBe("nosniff");
    await on.close();
    const off = buildApi({ application: unusedAskApplication() });
    const missing = await off.inject({ method: "GET", url: "/v1/billing/plans" });
    expect([missing.statusCode, missing.headers["cache-control"]]).toEqual([404, "no-store"]);
    await off.close();
    const refusing = { configured: () => true, decide: () => ({ allowed: false, reason: "LIMIT", retryAfterMs: 1_000, windowMs: 60_000 }) } as unknown as AdmissionLimiter;
    const limited = buildApi({ application: unusedAskApplication(), billing: billing(), admission: refusing });
    const refused = await limited.inject({ method: "GET", url: "/v1/billing/plans" });
    expect([refused.statusCode, refused.headers["cache-control"]]).toEqual([429, "no-store"]);
    await limited.close();
  });

  it("charges the per-source public-read budget, keyed by the caller's network: one IPv6 /64 is one source", async () => {
    const decide = vi.fn((_scope: string, _key: string, _at: Date) =>
      ({ allowed: false, reason: "LIMIT", retryAfterMs: 1_000, windowMs: 60_000 }));
    const refusing = { configured: () => true, decide } as unknown as AdmissionLimiter;
    const api = buildApi({ application: unusedAskApplication(), billing: billing(), admission: refusing });
    const response = await api.inject({ method: "GET", url: "/v1/billing/plans", remoteAddress: "198.51.100.23" });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
    expect(decide).toHaveBeenCalledWith("publicReads", "198.51.100.23", expect.any(Date));
    // DL5-F3: two addresses of one /64 allocation share one bucket (clientIpNetworkScope), never 2^64 of them.
    for (const remoteAddress of ["2001:db8:1:2::a", "2001:db8:1:2:ffff::b"]) {
      expect((await api.inject({ method: "GET", url: "/v1/billing/plans", remoteAddress })).statusCode).toBe(429);
    }
    expect(decide.mock.calls.slice(-2).map((call) => call[1])).toEqual(["2001:db8:1:2::/64", "2001:db8:1:2::/64"]);
    await api.close();
  });

  it("is declared public in the one policy table and in the contract, beside B7a's usage route", () => {
    expect(authorizationPolicyInventory).toContainEqual(
      { route: "GET /v1/billing/plans", auth: "public", resource: "billing", action: "read-plans" }
    );
    expect(contractInventory.routes).toContain("GET /v1/billing/plans");
    const paths = BILLING_ROUTE_PATHS as readonly string[];
    expect(paths.indexOf("GET /v1/billing/plans")).toBe(paths.indexOf("GET /v1/billing/usage") + 1);
    const routes = contractInventory.routes as readonly string[];
    expect(routes.indexOf("GET /v1/billing/plans")).toBe(routes.indexOf("GET /v1/billing/usage") + 1);
  });
});

/**
 * Terms §12: "Prices include VAT, GST or sales tax, which depends on where you live". The list prices every plan with
 * the connection country's tax, from the tax engine the quote asks (FakeTaxEngine's rates: RO 21 %, DE 19 %, FR 20 %;
 * every other country adds none). The US and Canada price tax by the postal code's state or province, so the country
 * alone cannot: there the list stays before tax.
 */
describe("Terms §12 GET /v1/billing/plans shows each country's price with its tax", () => {
  const PLACES: Readonly<Record<string, Readonly<{ country: string; tor: boolean }>>> = {
    "198.51.100.10": { country: "RO", tor: false },
    "198.51.100.20": { country: "DE", tor: false },
    "198.51.100.21": { country: "FR", tor: false },
    "198.51.100.30": { country: "US", tor: false },
    "198.51.100.31": { country: "CA", tor: false },
    "198.51.100.40": { country: "RO", tor: true },
    "198.51.100.50": { country: "CH", tor: false }
  };
  const geo: GeoLookup = { lookup: (ip) => PLACES[ip] ?? { country: "XX", tor: false }, close: () => undefined };

  function taxed(tax = new FakeTaxEngine(), clock = () => NOW) {
    const audit: Array<Readonly<Record<string, unknown>>> = [];
    const record: BillingAudit = (event, fields) => { audit.push({ event, ...fields }); };
    const displayedTax = new DisplayedTaxReader({
      tax, plans: testRegionalPlans, policy: testBillingPolicy, audit: record, clock
    });
    const api = buildApi({
      application: unusedAskApplication(),
      billing: { ...billing(), plans: testRegionalPlans, geo, displayedTax, clock }
    });
    const read = async (remoteAddress: string) => {
      const response = await api.inject({ method: "GET", url: "/v1/billing/plans", remoteAddress });
      expect(response.statusCode, remoteAddress).toBe(200);
      return response.json<{
        currency: string; tax: Record<string, unknown> | null;
        plans: ReadonlyArray<{ plan_id: string; total_price: string | null; net_prices: Record<string, string> }>;
      }>();
    };
    const totals = (answer: Awaited<ReturnType<typeof read>>) =>
      Object.fromEntries(answer.plans.map((plan) => [plan.plan_id, plan.total_price]));
    return { api, tax, audit, read, totals };
  }

  it("prices each plan with its own country's tax, in that country's currency", async () => {
    const { api, read, totals } = taxed();
    const romania = await read("198.51.100.10");
    expect(romania.currency).toBe("RON");
    expect(romania.tax).toEqual({ country: "RO", tax_name: "VAT", tax_rate_bp: 2_100, tax_status: "TAXABLE" });
    expect(totals(romania)).toEqual({ FREE: "0.00", PLUS: "121.00", PRO: "302.50", MAX: "1210.00" });
    const germany = await read("198.51.100.20");
    expect(germany.currency).toBe("EUR");
    expect(germany.tax).toEqual({ country: "DE", tax_name: "MwSt.", tax_rate_bp: 1_900, tax_status: "TAXABLE" });
    expect(totals(germany)).toEqual({ FREE: "0.00", PLUS: "23.80", PRO: "59.50", MAX: "238.00" });
    // Two countries of one currency, two different totals: the price is the visitor's own country's.
    const france = await read("198.51.100.21");
    expect([france.currency, france.tax?.tax_rate_bp]).toEqual(["EUR", 2_000]);
    expect(totals(france)).toEqual({ FREE: "0.00", PLUS: "24.00", PRO: "60.00", MAX: "240.00" });
    // Where the tax engine adds nothing, the total is the net, and the answer says so.
    const switzerland = await read("198.51.100.50");
    expect(switzerland.tax).toEqual({ country: "CH", tax_name: "VAT", tax_rate_bp: 0, tax_status: "NOT_REGISTERED" });
    expect(totals(switzerland)).toEqual({ FREE: "0.00", PLUS: "20.00", PRO: "50.00", MAX: "200.00" });
    // The net prices in every currency are still listed beside the total, unchanged.
    expect(germany.plans.map((plan) => plan.net_prices)).toEqual(PLANS_ANSWER.map((plan) => plan.net_prices));
    await api.close();
  });

  it("names no country's tax for an unknown place, a Tor exit or an address that is not an IP", async () => {
    const { api, tax, read } = taxed();
    for (const remoteAddress of ["198.51.100.99", "198.51.100.40", "not-an-address"]) {
      expect(await read(remoteAddress), remoteAddress).toEqual({ currency: "USD", tax: null, plans: PLANS_ANSWER });
    }
    expect(tax.quotedCurrencies).toEqual([]);
    await api.close();
  });

  it("keeps the US and Canada before tax, never asking the country alone for a state's or province's tax", async () => {
    // The fake prices Texas at 6.25 % by its postal code, and the country alone at nothing: a card built from that
    // would say the price holds the tax while the checkout adds it.
    const { api, tax, read } = taxed();
    expect(await read("198.51.100.30")).toEqual({ currency: "USD", tax: null, plans: PLANS_ANSWER });
    expect((await read("198.51.100.31")).tax).toBeNull();
    expect(tax.quotedCurrencies).toEqual([]);
    await api.close();
  });

  it("asks the tax engine once per country, for every paid plan, and keeps the answer for six hours", async () => {
    let now = NOW.getTime();
    const { api, tax, read } = taxed(new FakeTaxEngine(), () => new Date(now));
    const quote = vi.spyOn(tax, "quote");
    await Promise.all([read("198.51.100.20"), read("198.51.100.20"), read("198.51.100.21")]);
    // The free plan costs nothing anywhere, so it is never quoted: three paid plans, two countries.
    expect(quote).toHaveBeenCalledTimes(6);
    expect(quote.mock.calls.map(([call]) => call.location)).toContainEqual(
      { country: "DE", region: null, postalCode: null, city: null, street: null, ip: null }
    );
    expect(quote.mock.calls.every(([call]) => call.taxId === null && call.taxCode === "saas")).toBe(true);
    now += 6 * 60 * 60 * 1_000 - 1;
    await read("198.51.100.20");
    expect(quote).toHaveBeenCalledTimes(6);
    now += 1;
    await read("198.51.100.20");
    expect(quote).toHaveBeenCalledTimes(9);
    await api.close();
  });

  it("falls back to the prices before tax while the tax service is down, and asks again only after a minute", async () => {
    let now = NOW.getTime();
    const { api, tax, audit, read } = taxed(new FakeTaxEngine(), () => new Date(now));
    tax.failNext("TAX_SERVICE_UNAVAILABLE");
    expect(await read("198.51.100.20")).toEqual({ currency: "EUR", tax: null, plans: PLANS_ANSWER });
    expect(audit).toEqual([
      { event: "billing.plans.tax_unavailable", country: "DE", code: "TAX_SERVICE_UNAVAILABLE", reason: "UNKNOWN" }
    ]);
    const quote = vi.spyOn(tax, "quote");
    now += 59_999;
    expect((await read("198.51.100.20")).tax).toBeNull();
    expect(quote).not.toHaveBeenCalled();
    now += 1;
    expect((await read("198.51.100.20")).tax).toMatchObject({ country: "DE", tax_rate_bp: 1_900 });
    expect(quote).toHaveBeenCalledTimes(3);
    await api.close();
  });

  it("keeps the last answer when a refresh fails, so an outage never takes a country's tax off the cards", async () => {
    let now = NOW.getTime();
    const { api, tax, audit, read, totals } = taxed(new FakeTaxEngine(), () => new Date(now));
    expect(totals(await read("198.51.100.10")).PLUS).toBe("121.00");
    now += 6 * 60 * 60 * 1_000;
    tax.failNext("TAX_SERVICE_REFUSED");
    const kept = await read("198.51.100.10");
    expect([kept.tax?.country, totals(kept).PLUS]).toEqual(["RO", "121.00"]);
    expect(audit.map((line) => [line.event, line.code])).toEqual([["billing.plans.tax_unavailable", "TAX_SERVICE_REFUSED"]]);
    await api.close();
  });

  it("never holds a page past its wait for a slow tax service, and keeps that answer for the visitors after", async () => {
    const tax = new FakeTaxEngine();
    const honest = tax.quote.bind(tax);
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => { release = resolve; });
    vi.spyOn(tax, "quote").mockImplementation(async (call) => { await slow; return honest(call); });
    const audit: BillingAudit = () => undefined;
    const reader = new DisplayedTaxReader({
      tax, plans: testRegionalPlans, policy: testBillingPolicy, audit, clock: () => NOW, waitMs: 20
    });
    // The first visitor gets no tax (none is known yet) instead of waiting for the tax service.
    expect(await reader.read("DE")).toBeNull();
    release();
    await vi.waitFor(async () => { expect((await reader.read("DE"))?.taxRateBasisPoints).toBe(1_900); });
    expect(tax.quote).toHaveBeenCalledTimes(3);
  });

  it("never shows an answer that is not the plan's net in the country's currency", async () => {
    const tax = new FakeTaxEngine();
    const honest = tax.quote.bind(tax);
    // A tax service that prices Germany as the United States (a USD country) is not Germany's price.
    vi.spyOn(tax, "quote").mockImplementation(async (call) => ({ ...(await honest(call)), taxCountry: "US" }));
    const { api, audit, read } = taxed(tax);
    expect((await read("198.51.100.20")).tax).toBeNull();
    expect(audit).toEqual([{ event: "billing.plans.tax_unavailable", country: "DE", code: "TAX_ANSWER_MISMATCH" }]);
    await api.close();
  });

  it("answers the list even when the tax reader itself throws", async () => {
    const displayedTax = { read: async () => { throw new Error("READER_BROKEN"); } };
    const api = buildApi({
      application: unusedAskApplication(), billing: { ...billing(), plans: testRegionalPlans, geo, displayedTax }
    });
    const response = await api.inject({ method: "GET", url: "/v1/billing/plans", remoteAddress: "198.51.100.20" });
    expect([response.statusCode, response.json()]).toEqual([200, { currency: "EUR", tax: null, plans: PLANS_ANSWER }]);
    await api.close();
  });

  it("refuses a list that names a total without a tax, or a tax without a total", () => {
    const tax = { country: "DE", tax_name: "MwSt.", tax_rate_bp: 1_900, tax_status: "TAXABLE" };
    const plus = { plan_id: "PLUS", net_prices: PLANS_ANSWER[1]!.net_prices, allowance_vs_plus: "1" };
    expect(BillingPlansResponseSchema.safeParse({ currency: "EUR", tax, plans: [{ ...plus, total_price: "23.80" }] }).success).toBe(true);
    expect(BillingPlansResponseSchema.safeParse({ currency: "EUR", tax: null, plans: [{ ...plus, total_price: "23.80" }] }).success).toBe(false);
    expect(BillingPlansResponseSchema.safeParse({ currency: "EUR", tax, plans: [{ ...plus, total_price: null }] }).success).toBe(false);
  });
});

/**
 * P8a's production wiring (F33 class, the B7a judge's ruling): apps/api/src/main.ts hands buildApi the billing
 * runtime's routes, and those routes carry L4's own legal gate. Source pins, not a call of createBillingRuntime:
 * from P12d its required() helper refuses to compose without inputs this task does not pass, and P23's whole-flow
 * test exercises runtime.routes behaviourally. The pins read only TOP-LEVEL members of each object literal, because
 * from P8b the services built inside the routes literal also receive `plans: deps.plans` / `legal: deps.legal`, and
 * a substring match would still pass with the top-level member gone. They tolerate whitespace, comments and the
 * members later tasks append.
 */
describe("P8a the API root hands the billing runtime's routes to buildApi", () => {
  /** The source with every comment and string body blanked (same length), so brackets and commas in them never count. */
  function code(source: string): string {
    let out = "";
    let i = 0;
    while (i < source.length) {
      const c = source[i] ?? "";
      const next = source[i + 1] ?? "";
      if (c === "/" && next === "/") {
        while (i < source.length && source[i] !== "\n") { out += " "; i += 1; }
      } else if (c === "/" && next === "*") {
        const end = source.indexOf("*/", i + 2);
        const stop = end === -1 ? source.length : end + 2;
        for (; i < stop; i += 1) out += source[i] === "\n" ? "\n" : " ";
      } else if (c === "\"" || c === "'" || c === "`") {
        out += c;
        i += 1;
        while (i < source.length && source[i] !== c) {
          if (source[i] === "\\") { out += " "; i += 1; }
          out += source[i] === "\n" ? "\n" : " ";
          i += 1;
        }
        out += c;
        i += 1;
      } else {
        out += c;
        i += 1;
      }
    }
    return out;
  }

  /** The index of the bracket that closes the one at `open`, in blanked source. */
  function closing(text: string, open: number): number {
    let depth = 0;
    for (let i = open; i < text.length; i += 1) {
      const c = text[i];
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") {
        depth -= 1;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  /** The depth-1 members of the object literal whose `{` is at `open`, whitespace collapsed. */
  function topLevelMembers(text: string, open: number): string[] {
    expect(text[open]).toBe("{");
    const close = closing(text, open);
    expect(close).toBeGreaterThan(open);
    const members: string[] = [];
    let depth = 0;
    let start = open + 1;
    for (let i = open + 1; i < close; i += 1) {
      const c = text[i];
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") depth -= 1;
      else if (c === "," && depth === 0) {
        members.push(text.slice(start, i));
        start = i + 1;
      }
    }
    members.push(text.slice(start, close));
    return members.map((member) => member.replace(/\s+/gu, " ").trim()).filter((member) => member !== "");
  }

  /** The `{` that a match of `pattern` (ending at that brace) opens; the pattern must match exactly once. */
  function braceAfter(text: string, pattern: RegExp, from = 0, to = text.length): number {
    const region = text.slice(from, to);
    const matches = [...region.matchAll(new RegExp(pattern.source, "gu"))];
    expect(matches.length, `${pattern.source} matches once`).toBe(1);
    const match = matches[0];
    const index = from + (match?.index ?? 0) + (match?.[0].length ?? 0) - 1;
    expect(text[index]).toBe("{");
    return index;
  }

  it("spreads the billing runtime's routes into the billing options main.ts hands buildApi", async () => {
    const main = code(await readFile("apps/api/src/main.ts", "utf8"));
    const start = main.search(/const\s+billingRouteOptions\s*:\s*BillingRouteOptions\s*\|\s*undefined\s*=/u);
    expect(start).toBeGreaterThan(-1);
    const end = main.indexOf(";", start);
    expect(end).toBeGreaterThan(start);
    expect(main.slice(start, end + 1)).toMatch(
      /\.\.\.\(\s*billingRuntime\s*===\s*undefined\s*\?\s*\{\s*\}\s*:\s*billingRuntime\.routes\s*\)/u
    );
  });

  it("composes the runtime with L4's legal gate, main.ts's own binding, never an inline object", async () => {
    const main = code(await readFile("apps/api/src/main.ts", "utf8"));
    const open = braceAfter(main, /\bcreateBillingRuntime\(\s*\{/u);
    const legal = topLevelMembers(main, open).filter((member) => /^legal\b/u.test(member));
    expect(legal.length, "createBillingRuntime gets one top-level legal member").toBe(1);
    expect(legal[0]).toMatch(/^legal(?:\s*:\s*legal)?$/u);
    expect(main.match(/\bconst\s+legal\s*=\s*new\s+RepositoryLegalAcceptanceApplication\(/gu)?.length).toBe(1);
    // No second binding named legal (a shadow inside the billing-runtime closure, say) can stand in for L4's.
    expect(main.match(/\b(?:const|let|var)\s+legal\b/gu)?.length).toBe(1);
  });

  it("puts plans and the legal gate at the top level of the runtime's routes, and returns those routes", async () => {
    const runtime = code(await readFile("apps/api/src/billing/runtime.ts", "utf8"));
    const signature = runtime.search(/export\s+function\s+createBillingRuntime\(/u);
    expect(signature).toBeGreaterThan(-1);
    const params = runtime.indexOf("(", signature);
    const bodyOpen = runtime.indexOf("{", closing(runtime, params));
    const bodyClose = closing(runtime, bodyOpen);
    expect(bodyClose).toBeGreaterThan(bodyOpen);

    const routesOpen = braceAfter(
      runtime, /\bconst\s+routes\s*(?::[^=]+)?=\s*(?:Object\.freeze\(\s*)?\{/u, bodyOpen, bodyClose
    );
    const routes = topLevelMembers(runtime, routesOpen);
    expect(routes.filter((member) => /^plans\s*:\s*deps\.plans$/u.test(member)), routes.join(" | ")).toHaveLength(1);
    expect(routes.filter((member) => /^legal\s*:\s*deps\.legal$/u.test(member)), routes.join(" | ")).toHaveLength(1);

    // The function's own return (depth 0 of its body; nested helpers' returns sit deeper) lists `routes`.
    const returns: number[] = [];
    let depth = 0;
    for (let i = bodyOpen + 1; i < bodyClose; i += 1) {
      const c = runtime[i];
      if (c === "(" || c === "[" || c === "{") depth += 1;
      else if (c === ")" || c === "]" || c === "}") depth -= 1;
      else if (depth === 0 && runtime.startsWith("return", i)
        && !/[\w$]/u.test(runtime[i - 1] ?? "") && !/[\w$]/u.test(runtime[i + 6] ?? "")) {
        returns.push(i);
      }
    }
    expect(returns.length, "createBillingRuntime has one top-level return").toBe(1);
    const returned = /^return\s+(?:Object\.freeze\(\s*)?\{/u.exec(runtime.slice(returns[0]));
    expect(returned, "createBillingRuntime returns an object literal").not.toBeNull();
    const returnOpen = (returns[0] ?? 0) + (returned?.[0].length ?? 0) - 1;
    expect(topLevelMembers(runtime, returnOpen)).toContainEqual(expect.stringMatching(/^routes(?:\s*:\s*routes)?$/u));
  });
});

/**
 * Side-by-side uploads spec 2026-10-21 §4 (plan C task C7): the billing runtime's five timers (outbox 5 s, renewals
 * 60 s, the money check 10 min, the spool replay 10 min, the owner's daily jobs) and their immediate first passes run
 * only while `when()` says this release is current; `kick` (a route's, on work this process accepted) never asks.
 * Composed over a pool that only counts: a loop that ran would touch it.
 */
describe("side-by-side C7 the billing runtime's loops run only while the release is current", () => {
  afterEach(() => { vi.useRealTimers(); });

  function composed() {
    const touches = { count: 0 };
    const query = async () => { touches.count += 1; throw new Error("COUNTING_POOL_ANSWERS_NOTHING"); };
    const pool = { query, connect: query } as unknown as BillingRuntimeDeps["pool"];
    const runtime = createBillingRuntime({
      cancelLinksPerDay: 11,
      pool,
      connectors: {
        payments: {}, noticeTrust: {}, paymentEnvironment: "sandbox", tax: {}, invoiceRo: {}, recordsKey: Buffer.alloc(32, 7),
        ownerReportEmail: "owner@example.test", publicAppUrl: TEST_APP_ORIGIN
      } as unknown as BillingRuntimeDeps["connectors"],
      policy: testBillingPolicy,
      plans: testBillingPlans,
      countryPolicy: testCountryPolicy,
      geo: { lookup: () => ({ country: "XX", tor: false }), close: () => undefined } as unknown as GeoLookup,
      legal: { requiresReacceptance: async () => false },
      dekStore: {} as unknown as BillingRuntimeDeps["dekStore"],
      mail: undefined,
      audit: () => undefined,
      clock: () => new Date(),
      reportPending: () => undefined,
      ownerSpend: { readOwnerSpentMicros: async () => 0 },
      blindIndexKey: new Uint8Array(32),
      identities: { ownerRefByEmailBlindIndex: async () => null },
      taxAuthorities: taxAuthoritiesFromValue(
        TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.value, TAX_AUTHORITIES_DEPLOYMENT_REGISTER_ROW.sourceRef
      )
    });
    const drain = vi.spyOn(runtime.outbox, "drain").mockResolvedValue(0 as never);
    const renew = vi.spyOn(runtime.renewal, "runOnce").mockResolvedValue(undefined as never);
    const maintain = vi.spyOn(runtime.maintenance, "runOnce").mockResolvedValue(undefined as never);
    const sweep = vi.spyOn(runtime.erasure, "sweep").mockResolvedValue(undefined as never);
    return { runtime, touches, drain, renew, maintain, sweep };
  }

  it("asks nothing for ten minutes while not current, and the routes' kick still drains", async () => {
    vi.useFakeTimers();
    const { runtime, touches, drain, renew, maintain, sweep } = composed();
    try {
      runtime.start({ when: () => false });
      await vi.advanceTimersByTimeAsync(600_000);
      expect(drain).toHaveBeenCalledTimes(0);
      expect(renew).toHaveBeenCalledTimes(0);
      expect(maintain).toHaveBeenCalledTimes(0);
      expect(sweep).toHaveBeenCalledTimes(0);
      expect(touches.count).toBe(0);
      runtime.kick();
      await vi.advanceTimersByTimeAsync(0);
      expect(drain).toHaveBeenCalledTimes(1);
    } finally { runtime.stop(); }
  });

  it("runs as before while current: the outbox 121 times in 600 s (1 at the start + 120 ticks)", async () => {
    vi.useFakeTimers();
    const { runtime, drain, renew, sweep } = composed();
    try {
      runtime.start({ when: () => true });
      await vi.advanceTimersByTimeAsync(600_000);
      expect(drain).toHaveBeenCalledTimes(121);
      expect(renew).toHaveBeenCalledTimes(11);
      expect(sweep).toHaveBeenCalledTimes(2);
    } finally { runtime.stop(); }
  });

  it("starts loops that wait for the release: they run from the first tick after it becomes current", async () => {
    vi.useFakeTimers();
    const { runtime, drain, renew } = composed();
    let current = false;
    try {
      runtime.start({ when: () => current });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(drain).toHaveBeenCalledTimes(0);
      current = true;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(drain).toHaveBeenCalledTimes(12);
      expect(renew).toHaveBeenCalledTimes(1);
    } finally { runtime.stop(); }
  });
});
