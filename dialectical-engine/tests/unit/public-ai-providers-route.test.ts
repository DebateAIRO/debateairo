// Side-by-side spec §13, addition D24 (owner's answer to Q-L6, 2026-10-22: providers only, not the models, listed
// automatically): GET /v1/public/ai-providers answers the companies the API's declared targets reach, so the website's
// "AI providers" page lists them at request time. Public, session-free, charged to the per-source public-read budget
// by the caller's network exactly as GET /v1/billing/plans, and the answer's strict schema leaves no room for a model
// id, a URL or a price. Modelled on tests/unit/billing-plans-route.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { authorizationPolicyInventory, buildApi } from "@debateai/api";
import { PublicAiProvidersResponseSchema, contractInventory } from "@debateai/contract";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { unusedAskApplication } from "../support/billingFixtures.js";

const ROUTE = "GET /v1/public/ai-providers";
const URL_PATH = "/v1/public/ai-providers";

describe("GET /v1/public/ai-providers (addition D24)", () => {
  it("answers the composed companies without a session, and an empty list when none were composed", async () => {
    const api = buildApi({ application: unusedAskApplication(), aiProviderCompanies: Object.freeze(["anthropic", "deepinfra"]) });
    const response = await api.inject({ method: "GET", url: URL_PATH });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ companies: ["anthropic", "deepinfra"] });
    expect(response.headers["cache-control"]).toBe("no-store");
    await api.close();
    const bare = buildApi({ application: unusedAskApplication() });
    const empty = await bare.inject({ method: "GET", url: URL_PATH });
    expect([empty.statusCode, empty.json()]).toEqual([200, { companies: [] }]);
    await bare.close();
  });

  it("an unchecked `host:` company rides the answer as it is (ruling R20)", async () => {
    const api = buildApi({ application: unusedAskApplication(), aiProviderCompanies: ["deepinfra", "host:api.acme.example"] });
    expect((await api.inject({ method: "GET", url: URL_PATH })).json()).toEqual({ companies: ["deepinfra", "host:api.acme.example"] });
    await api.close();
  });

  it("charges the per-source public-read budget, keyed by the caller's network: one IPv6 /64 is one source", async () => {
    const decide = vi.fn((_scope: string, _key: string, _at: Date) =>
      ({ allowed: false, reason: "LIMIT", retryAfterMs: 1_000, windowMs: 60_000 }));
    const refusing = { configured: () => true, decide } as unknown as AdmissionLimiter;
    const api = buildApi({ application: unusedAskApplication(), aiProviderCompanies: ["deepinfra"], admission: refusing });
    const response = await api.inject({ method: "GET", url: URL_PATH, remoteAddress: "198.51.100.23" });
    expect(response.statusCode).toBe(429);
    expect(response.json()).toEqual({ error: "ADMISSION_RATE_LIMITED", message: "ADMISSION_RATE_LIMITED" });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(decide).toHaveBeenCalledWith("publicReads", "198.51.100.23", expect.any(Date));
    for (const remoteAddress of ["2001:db8:1:2::a", "2001:db8:1:2:ffff::b"]) {
      expect((await api.inject({ method: "GET", url: URL_PATH, remoteAddress })).statusCode).toBe(429);
    }
    expect(decide.mock.calls.slice(-2).map((call) => call[1])).toEqual(["2001:db8:1:2::/64", "2001:db8:1:2::/64"]);
    await api.close();
  });

  it("is declared public in the one policy table and in the contract, right after GET /v1/public/debates/{id}", () => {
    expect(authorizationPolicyInventory).toContainEqual(
      { route: ROUTE, auth: "public", resource: "deployment", action: "read-ai-providers" }
    );
    const governed = authorizationPolicyInventory.map((policy) => policy.route);
    expect(governed.indexOf(ROUTE)).toBe(governed.indexOf("GET /v1/public/debates/{id}") + 1);
    const routes = contractInventory.routes as readonly string[];
    expect(routes).toContain(ROUTE);
    expect(routes.indexOf(ROUTE)).toBe(routes.indexOf("GET /v1/public/debates/{id}") + 1);
    expect((contractInventory.resources as Record<string, unknown>).PublicAiProvidersResponseSchema).toBe(PublicAiProvidersResponseSchema);
  });

  it("the answer's schema is strict: no extra member, so a model id or a URL can never ride along", () => {
    expect(PublicAiProvidersResponseSchema.safeParse({ companies: ["anthropic", "deepinfra"] }).success).toBe(true);
    expect(PublicAiProvidersResponseSchema.safeParse({ companies: [] }).success).toBe(true);
    for (const extra of [{ models: ["zai-org/GLM-5.3-Flash"] }, { base_urls: ["https://api.deepinfra.com/v1/openai"] }, { price: "1" }]) {
      expect(PublicAiProvidersResponseSchema.safeParse({ companies: ["deepinfra"], ...extra }).success, JSON.stringify(extra)).toBe(false);
    }
    // Bounded: at most 32 companies (the target limit), each 1-260 characters.
    expect(PublicAiProvidersResponseSchema.safeParse({ companies: Array.from({ length: 33 }, (_, index) => `host:h${index}.example`) }).success).toBe(false);
    expect(PublicAiProvidersResponseSchema.safeParse({ companies: Array.from({ length: 32 }, (_, index) => `host:h${index}.example`) }).success).toBe(true);
    expect(PublicAiProvidersResponseSchema.safeParse({ companies: [""] }).success).toBe(false);
    expect(PublicAiProvidersResponseSchema.safeParse({ companies: ["x".repeat(261)] }).success).toBe(false);
    expect(PublicAiProvidersResponseSchema.safeParse({ companies: ["x".repeat(260)] }).success).toBe(true);
    expect(PublicAiProvidersResponseSchema.safeParse({ companies: [1] }).success).toBe(false);
    expect(PublicAiProvidersResponseSchema.safeParse({}).success).toBe(false);
  });
});

/** The source with comments and string bodies blanked (same length), so brackets and commas in them never count. */
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

/** The text of an object literal that opens at `open` in blanked source, keeping only its top-level characters. */
function topLevelOf(text: string, open: number): string {
  let depth = 0;
  let out = "";
  for (let i = open; i < text.length; i += 1) {
    const c = text[i]!;
    if (c === "(" || c === "[" || c === "{") { depth += 1; if (depth === 1) continue; }
    else if (c === ")" || c === "]" || c === "}") { depth -= 1; if (depth === 0) return out; }
    if (depth === 1) out += c;
  }
  throw new Error("unterminated literal");
}

describe("the API root computes the companies after the provider-targets stage and hands them to buildApi", () => {
  const main = readFileSync(new URL("../../apps/api/src/main.ts", import.meta.url), "utf8");
  const blanked = code(main);

  it("computes providerCompaniesOfTargets(declaredProviderTargets) once, after the provider-targets stage", () => {
    const flat = main.replace(/\s+/gu, " ");
    const statement = "const aiProviderCompanies = providerCompaniesOfTargets(declaredProviderTargets);";
    expect(flat.split(statement)).toHaveLength(2);
    const stage = flat.indexOf("const declaredProviderTargets = boot.runSync(\"provider-targets\",");
    expect(stage).toBeGreaterThan(-1);
    expect(flat.indexOf(statement)).toBeGreaterThan(stage);
    expect(flat.indexOf(statement)).toBeLessThan(flat.indexOf("const api = buildApi({"));
    expect(main).toMatch(/import \{[^}]*\bproviderCompaniesOfTargets\b[^}]*\} from "@debateai\/providers";/u);
  });

  it("hands buildApi aiProviderCompanies as a top-level member", () => {
    const open = blanked.indexOf("const api = buildApi({");
    expect(open).toBeGreaterThan(-1);
    const members = topLevelOf(blanked, blanked.indexOf("{", open));
    expect(members).toMatch(/(^|[\s,])aiProviderCompanies\s*[,}]|(^|[\s,])aiProviderCompanies\s*$/u);
    // Control: a member that only appears nested does not count.
    expect(topLevelOf("{ a, b: { aiProviderCompanies } }", 0)).not.toContain("aiProviderCompanies");
  });
});
