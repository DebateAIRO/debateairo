import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as route from "../../apps/ui/app/api/[...path]/route.js";

/* Age gate (8j) — the same-origin proxy carries the 30-day lockout both ways, and only it. */

const LOCKOUT = "__Host-debateai-age-refusal=refused; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax";
const originalFetch = globalThis.fetch;
const originalBase = process.env.DIALECTICAL_API_BASE;

beforeEach(() => { process.env.DIALECTICAL_API_BASE = "http://acceptance.local:8790"; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.DIALECTICAL_API_BASE;
  else process.env.DIALECTICAL_API_BASE = originalBase;
});

async function proxied(cookie: string, upstreamSetCookies: readonly string[]) {
  const calls: RequestInit[] = [];
  globalThis.fetch = (async (_url: unknown, init: RequestInit = {}) => {
    calls.push(init);
    const headers = new Headers({ "content-type": "application/json" });
    for (const value of upstreamSetCookies) headers.append("set-cookie", value);
    return new Response(JSON.stringify({ outcome: "refused" }), { status: 200, headers });
  }) as typeof fetch;
  const response = await route.POST(
    new Request("http://web.local/api/v1/auth/age-check", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: "https://ui.example.test" },
      body: JSON.stringify({ date_of_birth: "2015-01-01" })
    }),
    { params: Promise.resolve({ path: ["v1", "auth", "age-check"] }) }
  );
  return { forwardedCookie: new Headers(calls[0]!.headers).get("cookie"), setCookies: response.headers.getSetCookie() };
}

describe("age-gate lockout through the proxy", () => {
  it("forwards the exact lockout cookie upstream beside the session pair", async () => {
    const { forwardedCookie } = await proxied(
      `other=x; __Host-debateai-session=${"s".repeat(43)}; __Host-debateai-age-refusal=refused`, []
    );
    expect(forwardedCookie).toBe(`__Host-debateai-session=${"s".repeat(43)}; __Host-debateai-age-refusal=refused`);
  });

  it("drops a lockout cookie with any other value", async () => {
    const { forwardedCookie } = await proxied("__Host-debateai-age-refusal=anything-else", []);
    expect(forwardedCookie).toBeNull();
  });

  it("passes the API's exact lockout Set-Cookie down, and nothing that merely shares its name", async () => {
    const { setCookies } = await proxied("", [
      LOCKOUT,
      "__Host-debateai-age-refusal=refused; Path=/; Max-Age=99999999; HttpOnly; Secure; SameSite=Lax",
      "__Host-debateai-age-refusal=other; Path=/; Max-Age=2592000; HttpOnly; Secure; SameSite=Lax",
      "__Host-debateai-age-refusal=refused; Path=/; Max-Age=2592000; Secure; SameSite=Lax",
      "tracking=1; Path=/"
    ]);
    expect(setCookies).toEqual([LOCKOUT]);
  });
});
