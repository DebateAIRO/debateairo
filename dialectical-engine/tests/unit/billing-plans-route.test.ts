import { describe, expect, it, vi } from "vitest";
import { authorizationPolicyInventory, buildApi } from "@debateai/api";
import { BillingPlansResponseSchema, contractInventory } from "@debateai/contract";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { BILLING_ROUTE_PATHS, type BillingRouteOptions } from "../../apps/api/src/billing/index.js";
import { testBillingPlans, unusedAskApplication } from "../support/billingFixtures.js";

const NOW = new Date("2026-10-01T10:00:00.000Z");
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

  it("lists net prices and the allowance as a multiple of Plus, never credit in dollars", async () => {
    const api = buildApi({ application: unusedAskApplication(), billing: billing() });
    const response = await api.inject({ method: "GET", url: "/v1/billing/plans" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      currency: "USD",
      plans: [
        { plan_id: "FREE", net_price: "0.00", allowance_vs_plus: "0.04" },
        { plan_id: "PLUS", net_price: "20.00", allowance_vs_plus: "1" },
        { plan_id: "PRO", net_price: "50.00", allowance_vs_plus: "4" },
        { plan_id: "MAX", net_price: "200.00", allowance_vs_plus: "30" }
      ]
    });
    expect(response.body).not.toMatch(/credit|5\.00|150\.00|0\.20/);
    expect(BillingPlansResponseSchema.safeParse({
      ...response.json<Record<string, unknown>>(), plans: [{ plan_id: "PLUS", net_price: "20.00", allowance_vs_plus: "1", credit: "5.00" }]
    }).success).toBe(false);
    await api.close();
  });

  it("lets a served list be cached for 60 seconds, and nothing else (spec §2.5.3)", async () => {
    const on = buildApi({ application: unusedAskApplication(), billing: billing() });
    const served = await on.inject({ method: "GET", url: "/v1/billing/plans" });
    expect([served.statusCode, served.headers["cache-control"]]).toEqual([200, "public, max-age=60"]);
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
