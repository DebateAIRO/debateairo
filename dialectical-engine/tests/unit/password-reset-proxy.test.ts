import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as route from "../../apps/ui/app/api/[...path]/route.js";
const originalFetch = globalThis.fetch, originalBase = process.env.DIALECTICAL_API_BASE;
const TOKEN = "A".repeat(43), CSRF = "B".repeat(43);
beforeEach(() => { process.env.DIALECTICAL_API_BASE = "http://acceptance.local:8790"; });
afterEach(() => { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.DIALECTICAL_API_BASE; else process.env.DIALECTICAL_API_BASE = originalBase; });
async function proxy(outgoing: string[]) {
  let forwarded = new Headers();
  globalThis.fetch = (async (_url, init) => {
    forwarded = new Headers(init?.headers);
    const headers = new Headers({ "content-type": "application/json" });
    for (const cookie of outgoing) headers.append("set-cookie", cookie);
    return new Response(JSON.stringify({ status: "password_required" }), { headers });
  }) as typeof fetch;
  const response = await route.POST(new Request("https://ui.example.test/api/v1/auth/password-reset/complete", {
    method: "POST", headers: { origin: "https://ui.example.test", "content-type": "application/json", cookie: `__Host-debateai-password-reset=${TOKEN}; __Host-debateai-password-reset-csrf=${CSRF}; unrelated=drop`, "x-password-reset-csrf-token": CSRF }, body: '{"password":"synthetic","code":"123456"}'
  }), { params: Promise.resolve({ path: ["v1", "auth", "password-reset", "complete"] }) });
  return { forwarded, response };
}
describe("password-only reset proxy scope", () => {
  it("forwards exact reset cookies and CSRF and preserves bounded Strict response cookies", async () => {
    const outgoing = [`__Host-debateai-password-reset=${TOKEN}; Path=/; Max-Age=1700; HttpOnly; Secure; SameSite=Strict`, `__Host-debateai-password-reset-csrf=${CSRF}; Path=/; Max-Age=1700; Secure; SameSite=Strict`];
    const { forwarded, response } = await proxy(outgoing);
    expect(forwarded.get("cookie")).toBe(`__Host-debateai-password-reset=${TOKEN}; __Host-debateai-password-reset-csrf=${CSRF}`);
    expect(forwarded.get("x-password-reset-csrf-token")).toBe(CSRF);
    expect(response.headers.getSetCookie()).toEqual(outgoing);
  });
  it.each(["Max-Age=1801; HttpOnly; Secure; SameSite=Strict", "Max-Age=1700; Secure; SameSite=Strict", "Max-Age=1700; HttpOnly; Secure; SameSite=Lax"])("rejects a reset success with unlawful cookie attributes %s", async attributes => {
    const { response } = await proxy([`__Host-debateai-password-reset=${TOKEN}; Path=/; ${attributes}`]);
    expect(response.status).toBe(502);
    expect(response.headers.getSetCookie()).toEqual([]);
  });
  it("preserves exact reset-cookie deletion", async () => {
    const outgoing = ["__Host-debateai-password-reset=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict", "__Host-debateai-password-reset-csrf=; Path=/; Max-Age=0; Secure; SameSite=Strict"];
    expect((await proxy(outgoing)).response.headers.getSetCookie()).toEqual(outgoing);
  });
});
