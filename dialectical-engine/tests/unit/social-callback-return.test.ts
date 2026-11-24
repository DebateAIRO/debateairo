import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as callback from "../../apps/ui/app/v1/auth/social/[provider]/callback/route.js";
import * as proxy from "../../apps/ui/app/api/[...path]/route.js";

/**
 * A sign-in company sends the browser back to <site>/v1/auth/social/<provider>/callback
 * (apps/api/src/social-providers/provider.ts derives that address from PUBLIC_APP_URL, and the
 * relay accepts no other path). The website is the only thing that answers on the site's address,
 * so it hands that one address to the API and gives the browser the API's own redirect: the
 * finishing page (/social/complete#...) or the page a linked account returns to.
 */
const originalFetch = globalThis.fetch, originalBase = process.env.DIALECTICAL_API_BASE;
const TOKEN = "A".repeat(21) + "-_" + "z".repeat(20);
const FLOW = "__Host-debateai-social-flow", BROWSER = "__Host-debateai-social-browser";
const clearedFlow = `${FLOW}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
const issuedBrowser = `${BROWSER}=${TOKEN}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax`;
const COMPLETE = `/social/complete#kind=signup&token=${TOKEN}&next=%2Fnew`;
const FAILED = "/login?social=failed";

type Seen = { url: string; init: RequestInit | undefined };
let seen: Seen[] = [];
beforeEach(() => { seen = []; process.env.DIALECTICAL_API_BASE = "http://acceptance.local:8790"; });
afterEach(() => { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.DIALECTICAL_API_BASE; else process.env.DIALECTICAL_API_BASE = originalBase; });

function upstream(status: number, headers: Record<string, string>, cookies: string[] = [], body: string | null = null) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    seen.push({ url: String(input), init });
    const out = new Headers(headers);
    for (const cookie of cookies) out.append("set-cookie", cookie);
    return new Response(body, { status, headers: out });
  }) as typeof fetch;
}

function comeBack(provider = "google", search = `?state=${TOKEN}&code=4%2F0Abc-def`) {
  return callback.GET(new Request(`https://ui.example.test/v1/auth/social/${provider}/callback${search}`, {
    headers: { cookie: `${FLOW}=${TOKEN}; other=1` }
  }), { params: Promise.resolve({ provider }) });
}

describe("the sign-in company's return address on the website", () => {
  it("hands the return to the API with its query and the flow cookie, and follows no redirect itself", async () => {
    upstream(303, { location: COMPLETE }, [clearedFlow, issuedBrowser]);
    await comeBack();
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(`http://acceptance.local:8790/v1/auth/social/google/callback?state=${TOKEN}&code=4%2F0Abc-def`);
    expect(seen[0]!.init?.method).toBe("GET");
    expect(seen[0]!.init?.redirect).toBe("manual");
    expect(new Headers(seen[0]!.init?.headers).get("cookie")).toBe(`${FLOW}=${TOKEN}`);
  });

  it("gives the browser the API's redirect to the finishing page, with the API's cookies", async () => {
    upstream(303, { location: COMPLETE }, [clearedFlow, issuedBrowser]);
    const response = await comeBack();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(COMPLETE);
    expect(response.headers.getSetCookie()).toEqual([clearedFlow, issuedBrowser]);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("gives the browser the API's redirect after an account link", async () => {
    upstream(303, { location: "/settings/security" }, [clearedFlow]);
    const response = await comeBack("x");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/settings/security");
  });

  it.each([
    ["a refused return (cancelled at the company, stale or foreign state)", 400, {}, '{"error":"SOCIAL_PROOF_INVALID"}'],
    ["a provider that is not switched on", 503, {}, '{"error":"SOCIAL_PROVIDER_UNAVAILABLE"}'],
    ["a rate limit", 429, { "retry-after": "60" }, '{"error":"RATE_LIMITED"}'],
    ["an answer that is not a redirect", 200, {}, "{}"]
  ])("sends %s to the sign-in page, never a bare API answer", async (_name, status, headers, body) => {
    upstream(status, { "content-type": "application/json", ...headers }, [clearedFlow], body);
    const response = await comeBack();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(FAILED);
    expect(response.headers.getSetCookie()).toEqual([clearedFlow]);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
  });

  it.each([
    ["another site", "https://evil.example.test/social/complete"],
    ["a scheme-relative address", "//evil.example.test/social/complete"],
    ["a backslash address", "/\\evil.example.test"],
    ["a relative path", "social/complete"],
    ["a control character", "/social/complete\u0000"],
    ["an over-long address", "/" + "a".repeat(4096)],
    ["no address", null]
  ])("never passes on a redirect to %s", async (_name, location) => {
    const control = location !== null && location.includes("\u0000");
    upstream(303, location === null || control ? {} : { location }, [clearedFlow]);
    if (control) {
      // Headers refuses a NUL, so the hostile value is handed over through a stand-in response.
      globalThis.fetch = (async () => ({ status: 303, statusText: "", body: null, headers: { get: (n: string) => n === "location" ? location : null, has: (n: string) => n === "location", getSetCookie: () => [clearedFlow] } })) as unknown as typeof fetch;
    }
    const response = await comeBack();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(FAILED);
  });

  it.each([["apple (its return is a form post, not this address)", "apple"], ["an unknown company", "github"], ["a hostile name", "..%2F..%2Fasks"]])(
    "does not call the API for %s", async (_name, provider) => {
      upstream(303, { location: COMPLETE });
      const response = await comeBack(provider);
      expect(seen).toHaveLength(0);
      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(FAILED);
    });

  it("sends an unreachable API to the sign-in page", async () => {
    globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
    const response = await comeBack();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(FAILED);
  });
});

describe("the /api proxy outside the return address", () => {
  it("still passes no Location header on for any other path", async () => {
    upstream(303, { location: COMPLETE });
    const response = await proxy.GET(new Request("https://ui.example.test/api/v1/auth/providers"), { params: Promise.resolve({ path: ["v1", "auth", "providers"] }) });
    expect(seen[0]!.init?.redirect).toBeUndefined();
    expect(response.headers.get("location")).toBeNull();
  });
});
