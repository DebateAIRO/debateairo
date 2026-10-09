// tests/unit/billing-netopia-notify-proxy.test.ts
// N9 (spec 2026-10-05 §2.7.1, §2.4.6 step 5): the UI proxy forwards NETOPIA's header and the exact body bytes to the
// notify route, and that header to no other route.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as route from "../../apps/ui/app/api/[...path]/route.js";

const originalFetch = globalThis.fetch;
const originalBase = process.env.DIALECTICAL_API_BASE;
const HEADER = ["eyJhbGciOiJSUzUxMiJ9", "eyJhdWQiOiJ4In0", "c2lnbmF0dXJl"].join(".");
const BODY = new TextEncoder().encode(`{ "payment": { "message": "Plată aprobată" },\r\n "order": {} }`);

beforeEach(() => { process.env.DIALECTICAL_API_BASE = "http://acceptance.local:8790"; });
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalBase === undefined) delete process.env.DIALECTICAL_API_BASE;
  else process.env.DIALECTICAL_API_BASE = originalBase;
});

async function forward(path: string[], headers: Record<string, string>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  await route.POST(
    new Request(`http://web.local/api/${path.join("/")}`, { method: "POST", headers, body: BODY }),
    { params: Promise.resolve({ path }) }
  );
  expect(calls).toHaveLength(1);
  return { url: calls[0]!.url, headers: new Headers(calls[0]!.init.headers), body: new Uint8Array(calls[0]!.init.body as ArrayBuffer) };
}

describe("N9 the proxy and NETOPIA's message", () => {
  it("forwards Verification-token and the bytes unchanged to the notify route", async () => {
    const sent = await forward(["v1", "billing", "netopia", "notify"], { "content-type": "text/plain", "Verification-token": HEADER });
    expect(sent.url).toBe("http://acceptance.local:8790/v1/billing/netopia/notify");
    expect(sent.headers.get("verification-token")).toBe(HEADER);
    expect(sent.headers.get("content-type")).toBe("text/plain");
    expect(Buffer.from(sent.body).equals(Buffer.from(BODY))).toBe(true);
  });

  it("never forwards the header to any other route, nor an oversized one", async () => {
    const asks = await forward(["v1", "asks"], { "content-type": "application/json", "verification-token": HEADER });
    expect(asks.headers.get("verification-token")).toBeNull();
    const huge = await forward(["v1", "billing", "netopia", "notify"], { "verification-token": "a".repeat(16_385) });
    expect(huge.headers.get("verification-token")).toBeNull();
  });
});
