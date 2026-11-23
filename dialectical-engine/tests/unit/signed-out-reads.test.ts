// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { createBrowserContractClient, createSameOriginFetch, holdsNoSession } from "../../apps/ui/lib/api.js";
import { holdSessionCookies } from "../support/sessionCookie.js";

/*
 * The site sits behind a site password at the edge, and a browser forgets that password whenever a request it sent with it
 * comes back 401 without asking for it again. The API's "not signed in" answer is such a 401, so a browser that holds no
 * session (no CSRF cookie, which the API sets and clears together with the session cookie) answers the two reads that can
 * only be refused itself, exactly as the API would. Every other request goes out as before.
 */

const ROOM = "http://localhost/v1/asks/room?plan_tier=free&composition_budget_tier=low&depth=1";

function forwarded(): { fetch: typeof fetch; calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetchImplementation = (async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetch: fetchImplementation, calls };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a browser that holds no session sends no read the API can only refuse", () => {
  it("holdsNoSession follows the CSRF cookie, and knows nothing without a document", () => {
    expect(holdsNoSession()).toBe(true);
    const cookies = holdSessionCookies();
    expect(holdsNoSession()).toBe(false);
    cookies.drop();
    expect(holdsNoSession()).toBe(true);
    vi.stubGlobal("document", undefined);
    expect(holdsNoSession(), "a server render").toBe(false);
  });

  it("with no cookie, GET /v1/session and GET /v1/asks/room are answered 401 SESSION_REQUIRED without a request", async () => {
    const server = forwarded();
    const sameOrigin = createSameOriginFetch("/api", server.fetch);
    for (const [url, init] of [
      ["http://localhost/v1/session", undefined],
      ["http://localhost/v1/session", { method: "GET" }],
      [ROOM, {}],
      [ROOM, { method: "get" }]
    ] as const) {
      const response = await sameOrigin(new URL(url), init);
      expect(response.status, url).toBe(401);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(await response.json()).toEqual({ error: "SESSION_REQUIRED" });
    }
    expect(server.calls).toEqual([]);
  });

  it("the contract client reads that answer as the API's own refusal", async () => {
    const server = forwarded();
    const client = createBrowserContractClient(server.fetch);
    const refusal = await client.readSession().catch((error: unknown) => error);
    expect(refusal).toBeInstanceOf(ContractHttpError);
    expect((refusal as ContractHttpError).code).toBe("SESSION_REQUIRED");
    expect((refusal as ContractHttpError).status).toBe(401);
    await expect(client.getAskRoom({ plan_tier: "free", composition_budget_tier: "low", depth: 1 }))
      .rejects.toMatchObject({ code: "SESSION_REQUIRED", status: 401 });
    expect(server.calls).toEqual([]);
  });

  it("with the cookie, both reads go to the server", async () => {
    holdSessionCookies();
    const server = forwarded();
    const sameOrigin = createSameOriginFetch("/api", server.fetch);
    await sameOrigin(new URL("http://localhost/v1/session"));
    await sameOrigin(new URL(ROOM), { method: "GET" });
    expect(server.calls.map((call) => call.url)).toEqual([
      "/api/v1/session",
      "/api/v1/asks/room?plan_tier=free&composition_budget_tier=low&depth=1"
    ]);
  });

  it("with no document (a server render, a test without a DOM), both reads go to the server", async () => {
    vi.stubGlobal("document", undefined);
    const server = forwarded();
    const sameOrigin = createSameOriginFetch("/api", server.fetch);
    await sameOrigin(new URL("http://localhost/v1/session"));
    await sameOrigin(new URL(ROOM));
    expect(server.calls.map((call) => call.url)).toEqual([
      "/api/v1/session",
      "/api/v1/asks/room?plan_tier=free&composition_budget_tier=low&depth=1"
    ]);
  });

  it("with no cookie, a write, a read of a neighbouring path and any other read are still sent", async () => {
    const server = forwarded();
    const sameOrigin = createSameOriginFetch("/api", server.fetch);
    const sent: Array<readonly [string, RequestInit | undefined]> = [
      ["http://localhost/v1/session", { method: "POST" }],
      ["http://localhost/v1/session", { method: "DELETE" }],
      ["http://localhost/v1/asks/room", { method: "POST" }],
      ["http://localhost/v1/sessions", undefined],
      ["http://localhost/v1/session/extra", undefined],
      ["http://localhost/v1/auth/sessions", undefined],
      ["http://localhost/v1/asks/room/extra", undefined],
      ["http://localhost/v1/asks", undefined],
      ["http://localhost/v1/deployment", undefined]
    ];
    for (const [url, init] of sent) {
      const response = await sameOrigin(new URL(url), init);
      expect(response.status, url).toBe(200);
    }
    expect(server.calls.map((call) => [call.url, call.init?.method ?? "GET"])).toEqual([
      ["/api/v1/session", "POST"],
      ["/api/v1/session", "DELETE"],
      ["/api/v1/asks/room", "POST"],
      ["/api/v1/sessions", "GET"],
      ["/api/v1/session/extra", "GET"],
      ["/api/v1/auth/sessions", "GET"],
      ["/api/v1/asks/room/extra", "GET"],
      ["/api/v1/asks", "GET"],
      ["/api/v1/deployment", "GET"]
    ]);
  });
});
