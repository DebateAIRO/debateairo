import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as route from "../../apps/ui/app/api/[...path]/route.js";

/**
 * The API writes three short-lived social sign-in cookies (apps/api/src/index.ts, socialCookie /
 * clearedSocialCookie; names in apps/api/src/social-auth.ts). The /api proxy passes them to the
 * browser only in the exact shape the API writes: a 43-character base64url value, Max-Age 1..300,
 * or the cleared form; HttpOnly, Secure, and SameSite=None for the Apple flow cookie alone.
 */
const originalFetch = globalThis.fetch, originalBase = process.env.DIALECTICAL_API_BASE;
const TOKEN = "A".repeat(21) + "-_" + "z".repeat(20);
beforeEach(() => { process.env.DIALECTICAL_API_BASE = "http://acceptance.local:8790"; });
afterEach(() => { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.DIALECTICAL_API_BASE; else process.env.DIALECTICAL_API_BASE = originalBase; });

async function proxy(outgoing: string[]) {
  globalThis.fetch = (async () => {
    const headers = new Headers({ "content-type": "application/json" });
    for (const cookie of outgoing) headers.append("set-cookie", cookie);
    return new Response('{"authorization_url":"https://accounts.example.test/authorize"}', { headers });
  }) as typeof fetch;
  return route.POST(new Request("https://ui.example.test/api/v1/auth/social/google/begin", {
    method: "POST", headers: { origin: "https://ui.example.test", "content-type": "application/json" }, body: "{}"
  }), { params: Promise.resolve({ path: ["v1", "auth", "social", "google", "begin"] }) });
}

const FLOW = "__Host-debateai-social-flow", APPLE = "__Host-debateai-social-apple", BROWSER = "__Host-debateai-social-browser";
const sameSite = (name: string) => name === APPLE ? "None" : "Lax";
const issued = (name: string, age: number, value = TOKEN) => `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=${sameSite(name)}`;
const cleared = (name: string) => `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=${sameSite(name)}`;

describe("social sign-in cookies through the /api proxy", () => {
  it.each([FLOW, APPLE, BROWSER])("passes %s as the API issues it", async name => {
    for (const age of [1, 299, 300]) {
      const response = await proxy([issued(name, age)]);
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual([issued(name, age)]);
    }
  });

  it.each([FLOW, APPLE, BROWSER])("passes the cleared %s", async name => {
    expect((await proxy([cleared(name)])).headers.getSetCookie()).toEqual([cleared(name)]);
  });

  it("passes the three together", async () => {
    const outgoing = [cleared(FLOW), issued(BROWSER, 300), issued(APPLE, 120)];
    expect((await proxy(outgoing)).headers.getSetCookie()).toEqual(outgoing);
  });

  it.each([
    ["the flow cookie with SameSite=None", `${FLOW}=${TOKEN}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=None`],
    ["the browser cookie with SameSite=None", `${BROWSER}=${TOKEN}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=None`],
    ["the Apple cookie with SameSite=Lax", `${APPLE}=${TOKEN}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax`],
    ["the cleared Apple cookie with SameSite=Lax", `${APPLE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`],
    ["a SameSite=Strict flow cookie", `${FLOW}=${TOKEN}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Strict`],
    ["a missing HttpOnly", `${FLOW}=${TOKEN}; Path=/; Max-Age=300; Secure; SameSite=Lax`],
    ["a missing Secure", `${BROWSER}=${TOKEN}; Path=/; Max-Age=300; HttpOnly; SameSite=Lax`],
    ["a missing SameSite", `${FLOW}=${TOKEN}; Path=/; Max-Age=300; HttpOnly; Secure`],
    ["Max-Age 301", issued(FLOW, 301)],
    ["Max-Age 301 on the Apple cookie", issued(APPLE, 301)],
    ["Max-Age 0 with a value", issued(BROWSER, 0)],
    ["an empty value that is not expired", `${FLOW}=; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax`],
    ["a leading-zero Max-Age", `${FLOW}=${TOKEN}; Path=/; Max-Age=030; HttpOnly; Secure; SameSite=Lax`],
    ["a 42-character value", issued(FLOW, 300, TOKEN.slice(1))],
    ["a 44-character value", issued(FLOW, 300, TOKEN + "A")],
    ["a value outside base64url", issued(FLOW, 300, TOKEN.slice(1) + "=")],
    ["a Domain attribute", `${FLOW}=${TOKEN}; Path=/; Domain=ui.example.test; Max-Age=300; HttpOnly; Secure; SameSite=Lax`],
    ["a narrower Path", `${FLOW}=${TOKEN}; Path=/api; Max-Age=300; HttpOnly; Secure; SameSite=Lax`],
    ["reordered attributes", `${FLOW}=${TOKEN}; Path=/; HttpOnly; Max-Age=300; Secure; SameSite=Lax`],
    ["lower-case attributes", `${FLOW}=${TOKEN}; path=/; max-age=300; httponly; secure; samesite=lax`],
    ["an Expires attribute", `${FLOW}=${TOKEN}; Path=/; Max-Age=300; Expires=Thu, 01 Jan 2099 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`],
    ["a foreign social name", `__Host-debateai-social-other=${TOKEN}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax`],
    ["a name without the __Host- prefix", `debateai-social-flow=${TOKEN}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax`]
  ])("refuses %s", async (_label, cookie) => {
    expect((await proxy([cookie])).headers.getSetCookie()).toEqual([]);
  });

  it("drops a social cookie the API repeats, keeping the others", async () => {
    expect((await proxy([cleared(FLOW), cleared(FLOW), issued(BROWSER, 300)])).headers.getSetCookie()).toEqual([issued(BROWSER, 300)]);
  });
});

/**
 * The other direction: the browser's social cookies reach the API as the API reads them
 * (apps/api/src/index.ts exactCookie: one occurrence with a 43-character base64url value, else none).
 * A malformed or repeated social cookie is left out on its own; it never costs the session cookie.
 */
async function forwardedCookie(cookie: string) {
  let forwarded = new Headers();
  globalThis.fetch = (async (_url, init) => {
    forwarded = new Headers(init?.headers);
    return new Response("{}", { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  await route.POST(new Request("https://ui.example.test/api/v1/auth/social/signup/status", {
    method: "POST", headers: { origin: "https://ui.example.test", "content-type": "application/json", cookie }, body: "{}"
  }), { params: Promise.resolve({ path: ["v1", "auth", "social", "signup", "status"] }) });
  return forwarded.get("cookie");
}

const SESSION = `__Host-debateai-session=${"S".repeat(43)}`;
const OTHER = "Q".repeat(43);

describe("social sign-in cookies from the browser to the API", () => {
  it.each([FLOW, APPLE, BROWSER])("forwards %s", async name => {
    expect(await forwardedCookie(`${name}=${TOKEN}`)).toBe(`${name}=${TOKEN}`);
  });

  it("forwards all three next to the session cookie, in a fixed order", async () => {
    expect(await forwardedCookie(`${BROWSER}=${OTHER}; unrelated=drop; ${APPLE}=${TOKEN}; ${SESSION}; ${FLOW}=${TOKEN}`))
      .toBe(`${SESSION}; ${FLOW}=${TOKEN}; ${APPLE}=${TOKEN}; ${BROWSER}=${OTHER}`);
  });

  it.each([
    ["a 42-character value", `${FLOW}=${TOKEN.slice(1)}`],
    ["a 44-character value", `${FLOW}=${TOKEN}A`],
    ["a value outside base64url", `${BROWSER}=${TOKEN.slice(1)}=`],
    ["an empty value", `${APPLE}=`],
    ["a repeated cookie, even with equal values", `${FLOW}=${TOKEN}; ${FLOW}=${TOKEN}`],
    ["a repeated cookie whose second value is malformed", `${BROWSER}=${TOKEN}; ${BROWSER}=bad`],
    ["a foreign social name", `__Host-debateai-social-other=${TOKEN}`],
    ["a name without the __Host- prefix", `debateai-social-flow=${TOKEN}`]
  ])("leaves out %s and keeps the session cookie", async (_label, social) => {
    expect(await forwardedCookie(`${SESSION}; ${social}`)).toBe(SESSION);
  });

  it("a bad social cookie leaves the other social cookies alone", async () => {
    expect(await forwardedCookie(`${FLOW}=${TOKEN}; ${FLOW}=${OTHER}; ${BROWSER}=${OTHER}`)).toBe(`${BROWSER}=${OTHER}`);
  });

  it("sends no cookie header when only a bad social cookie came", async () => {
    expect(await forwardedCookie(`${APPLE}=short`)).toBeNull();
  });
});
