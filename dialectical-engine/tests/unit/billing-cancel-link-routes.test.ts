import { describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { mountSubscriptionRoutes } from "../support/billingSubscriptionFixtures.js";
import type { SubscriptionRouteDeps } from "../../apps/api/src/billing/subscription-deps.js";
import { cancelLinkUrl, cancelTokenSha256 } from "../../apps/api/src/billing/cancel-link.js";

function withLinks(cancelLinks: SubscriptionRouteDeps["cancelLinks"]): SubscriptionRouteDeps {
  // Only the two public routes run here; they read nothing else from the composition.
  return { cancelLinks } as unknown as SubscriptionRouteDeps;
}

const withoutDate = (headers: Record<string, unknown>) => {
  const { date: _date, ...rest } = headers;
  return rest;
};

describe("P13 the public cancel routes", () => {
  it("answers 202 with identical bodies and headers before any lookup has finished", async () => {
    const pending = new Promise<"SENT">(() => undefined);
    const request = vi.fn((_email: string) => pending);
    const api = await mountSubscriptionRoutes(withLinks({ request, cancelByToken: vi.fn() }), null);
    const known = await api.inject({ method: "POST", url: "/v1/billing/cancel-link", payload: { email: "subscriber@example.test" } });
    const unknown = await api.inject({ method: "POST", url: "/v1/billing/cancel-link", payload: { email: "nobody@example.test" } });
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.json()).toEqual({ status: "ACCEPTED" });
    expect(unknown.body).toBe(known.body);
    expect(withoutDate(unknown.headers)).toEqual(withoutDate(known.headers));
    await new Promise((resolve) => setImmediate(resolve));
    expect(request.mock.calls.map(([email]) => email)).toEqual(["subscriber@example.test", "nobody@example.test"]);
    await api.close();
  });

  it("refuses a malformed body and a spent per-address budget without calling the service", async () => {
    const request = vi.fn(async () => "SILENT" as const);
    const open = await mountSubscriptionRoutes(withLinks({ request, cancelByToken: vi.fn() }), null);
    expect((await open.inject({ method: "POST", url: "/v1/billing/cancel-link", payload: { email: 42 } })).statusCode).toBe(400);
    await open.close();
    const limited = await mountSubscriptionRoutes(withLinks({ request, cancelByToken: vi.fn() }), null, () => false);
    expect((await limited.inject({ method: "POST", url: "/v1/billing/cancel-link", payload: { email: "a@example.test" } })).statusCode)
      .toBe(429);
    await limited.close();
    await new Promise((resolve) => setImmediate(resolve));
    expect(request).not.toHaveBeenCalled();
  });

  it("maps the token's outcome: invalid is 404, cancelled is 204, nothing left to cancel is its own 409 (W10, P2-M18)", async () => {
    const cancelByToken = vi.fn(async (token: string) =>
      token.startsWith("A") ? "INVALID" as const : token.startsWith("B") ? "CANCELLED" as const : "NOTHING_TO_CANCEL" as const);
    const api = await mountSubscriptionRoutes(withLinks({ request: vi.fn(), cancelByToken }), null);
    const call = (token: unknown) => api.inject({ method: "POST", url: "/v1/billing/cancel-by-token", payload: { token } });
    const invalid = await call("A".repeat(43));
    expect(invalid.statusCode).toBe(404);
    expect(invalid.json()).toEqual({ error: "CANCEL_LINK_INVALID", message: "CANCEL_LINK_INVALID" });
    expect((await call("B".repeat(43))).statusCode).toBe(204);
    // A plan already cancelled, ended, paused by a dispute or replaced by a newer one: the page must never say "your
    // plan is cancelled" for it, so the answer differs from a real cancel's.
    const nothing = await call("C".repeat(43));
    expect(nothing.statusCode).toBe(409);
    expect(nothing.json()).toEqual({ error: "NOTHING_TO_CANCEL", message: "NOTHING_TO_CANCEL" });
    expect((await call("short")).statusCode).toBe(400);
    await api.close();
  });

  it("keys both routes' budget by the source's network: two addresses of one IPv6 /64 share a bucket (DL5-F3)", async () => {
    const used = new Map<string, number>();
    const keys: string[] = [];
    // One request per key: the second request of a bucket is refused, as the sealed 5-an-hour budget would be.
    const scopes: string[] = [];
    const admitted = (scope: string, key: string) => {
      scopes.push(scope);
      keys.push(key);
      const count = (used.get(key) ?? 0) + 1;
      used.set(key, count);
      return count <= 1;
    };
    const api = await mountSubscriptionRoutes(withLinks({
      request: vi.fn(async () => "SILENT" as const), cancelByToken: vi.fn(async () => "INVALID" as const)
    }), null, admitted);
    const ask = (ip: string) => api.inject({
      method: "POST", url: "/v1/billing/cancel-link", headers: { "x-test-ip": ip }, payload: { email: "a@example.test" }
    });
    expect((await ask("2001:db8:1:2::a")).statusCode).toBe(202);
    // Another address of the same /64: the same bucket, so no second link from one allocation.
    expect((await ask("2001:db8:1:2:ffff::b")).statusCode).toBe(429);
    expect((await ask("2001:db8:1:3::a")).statusCode).toBe(202);
    // The token press shares the scope and the key.
    const press = await api.inject({
      method: "POST", url: "/v1/billing/cancel-by-token", headers: { "x-test-ip": "2001:db8:1:3::c" },
      payload: { token: "A".repeat(43) }
    });
    expect(press.statusCode).toBe(429);
    expect(keys).toEqual(["2001:db8:1:2::/64", "2001:db8:1:2::/64", "2001:db8:1:3::/64", "2001:db8:1:3::/64"]);
    // An IPv4 source is its own key.
    expect((await ask("192.0.2.44")).statusCode).toBe(202);
    expect(keys.at(-1)).toBe("192.0.2.44");
    // Both public routes charge A25's sealed per-IP budget: four link asks and the one token press.
    expect(scopes).toEqual(Array(5).fill("billingCancelLink"));
    await api.close();
  });

  it("logs a failed send with a content-free code only: a declared code passes, free text becomes UNKNOWN", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const request = vi.fn()
        .mockRejectedValueOnce(new TypedDomainError("SOME_CODE", "person@example.test"))
        .mockRejectedValueOnce(new Error("person@example.test"));
      const api = await mountSubscriptionRoutes(withLinks({ request, cancelByToken: vi.fn() }), null);
      const ask = () => api.inject({ method: "POST", url: "/v1/billing/cancel-link", payload: { email: "a@example.test" } });
      expect((await ask()).statusCode).toBe(202);
      expect((await ask()).statusCode).toBe(202);
      await new Promise((resolve) => setImmediate(resolve));
      await api.close();
      const lines = errorSpy.mock.calls.map((args) => args.join(" "));
      expect(lines).toEqual([
        '{"event":"billing.cancel_link.failed","code":"SOME_CODE"}',
        '{"event":"billing.cancel_link.failed","code":"UNKNOWN"}'
      ]);
      for (const line of lines) expect(line).not.toContain("@");
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("hashes the token with its own purpose label and links through the URL fragment", () => {
    const token = "t".repeat(43);
    expect(cancelTokenSha256(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(cancelTokenSha256(token)).not.toBe(cancelTokenSha256("u".repeat(43)));
    expect(cancelLinkUrl("https://dezbatere.ro/some/path", token)).toBe(`https://dezbatere.ro/cancel#token=${token}`);
  });
});
