import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as route from "../../apps/ui/app/api/[...path]/route.js";
const originalFetch = globalThis.fetch, originalBase = process.env.DIALECTICAL_API_BASE;
const TOKEN = "A".repeat(43), CSRF = "B".repeat(43);
beforeEach(() => { process.env.DIALECTICAL_API_BASE = "http://acceptance.local:8790"; });
afterEach(() => { globalThis.fetch = originalFetch; if (originalBase === undefined) delete process.env.DIALECTICAL_API_BASE; else process.env.DIALECTICAL_API_BASE = originalBase; });
async function proxy(age: number) {
  let forwarded = new Headers();
  const outgoing = [`__Host-debateai-mfa-recovery=${TOKEN}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Strict`, `__Host-debateai-mfa-recovery-csrf=${CSRF}; Path=/; Max-Age=${age}; Secure; SameSite=Strict`];
  globalThis.fetch = (async (_url, init) => { forwarded = new Headers(init?.headers); const headers = new Headers({ "content-type": "application/json" }); for (const cookie of outgoing) headers.append("set-cookie", cookie); return new Response('{"status":"factor_required"}', { headers }); }) as typeof fetch;
  const response = await route.POST(new Request("https://ui.example.test/api/v1/auth/mfa-recovery/complete", { method: "POST", headers: { origin: "https://ui.example.test", "content-type": "application/json", cookie: `__Host-debateai-mfa-recovery=${TOKEN}; __Host-debateai-mfa-recovery-csrf=${CSRF}`, "x-mfa-recovery-csrf-token": CSRF }, body: "{}" }), { params: Promise.resolve({ path: ["v1", "auth", "mfa-recovery", "complete"] }) });
  return { forwarded, response, outgoing };
}
describe("bounded MFA replacement UI capability", () => {
  it("forwards only exact scoped credentials and preserves a sub-five-minute cookie", async () => {
    const { forwarded, response, outgoing } = await proxy(299);
    expect(forwarded.get("cookie")).toBe(`__Host-debateai-mfa-recovery=${TOKEN}; __Host-debateai-mfa-recovery-csrf=${CSRF}`);
    expect(forwarded.get("x-mfa-recovery-csrf-token")).toBe(CSRF);
    expect(response.headers.getSetCookie()).toEqual(outgoing);
  });
  it("rejects an upstream success extending the MFA capability to five minutes", async () => { expect((await proxy(300)).response.status).toBe(502); });
});
