import { readFile } from "node:fs/promises";
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
