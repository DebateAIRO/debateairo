// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://localhost/settings"}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContractHttpError } from "@debateai/contract";
import { createBrowserContractClient, createSameOriginFetch, holdsNoSession } from "../../apps/ui/lib/api.js";

/*
 * The site sits behind a site password at the edge, and the browser forgets that password whenever a request it sent with
 * it comes back 401 without asking for it again. When the server has ended a session (it expired, was ended from another
 * device, or a password reset ended it) the API answers 401 SESSION_REQUIRED and clears no cookie, so every later page
 * sent its reads again and got the same 401: a site-password prompt on every page until the person signed in again.
 *
 * The website now removes the readable session cookie after that answer, so its session reads are answered here. These
 * tests run on an https page with the browser's real cookie rules (a `__Host-` cookie needs Secure and Path=/), so the
 * removal the page writes is the one a browser would apply.
 */

const CSRF = `__Host-debateai-csrf=${"c".repeat(43)}`;
const NEWER = `__Host-debateai-csrf=${"n".repeat(43)}`;

function signIn(cookie: string = CSRF): void {
  document.cookie = `${cookie}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`;
}
function held(): string | null {
  return document.cookie.split(";").map((member) => member.trim()).find((member) => member.startsWith("__Host-debateai-csrf=")) ?? null;
}
const json = (body: unknown, status: number, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function server(answer: (path: string) => Response | Promise<Response>) {
  const calls: string[] = [];
  const fetchImplementation = (async (input: unknown) => {
    const path = String(input);
    calls.push(path);
    return await answer(path);
  }) as typeof fetch;
  return { fetch: fetchImplementation, calls };
}

beforeEach(() => { signIn(); });
afterEach(() => {
  document.cookie = "__Host-debateai-csrf=; Path=/; Max-Age=0; Secure; SameSite=Lax";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("a session the server has ended is forgotten after its first refusal", () => {
  it("the API's 401 SESSION_REQUIRED removes the readable cookie, and the next session read is answered here", async () => {
    const api = server(() => json({ error: "SESSION_REQUIRED" }, 401));
    const sameOrigin = createSameOriginFetch("/api", api.fetch);
    expect(holdsNoSession()).toBe(false);
    const refused = await sameOrigin(new URL("https://localhost/v1/account/export"));
    expect(refused.status).toBe(401);
    // The caller still reads the API's own answer.
    expect(await refused.json()).toEqual({ error: "SESSION_REQUIRED" });
    expect(held(), "the readable cookie is gone").toBeNull();
    expect(holdsNoSession()).toBe(true);
    const session = await sameOrigin(new URL("https://localhost/v1/session"));
    expect(session.status).toBe(401);
    expect(api.calls, "only the first read reached the server").toEqual(["/api/v1/account/export"]);
  });

  it("the readable cookie is already gone when the caller sees the refusal, though the body comes after the status", async () => {
    // A real answer's body reaches the browser after its status line. A caller that looks at the session the moment the
    // 401 is handed to it (a poll deciding whether to stop) must already find none.
    const slowBody = (body: unknown, status: number): Response => {
      const bytes = new TextEncoder().encode(JSON.stringify(body));
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await new Promise((resolve) => { setTimeout(resolve, 5); });
          controller.enqueue(bytes);
          controller.close();
        }
      });
      return new Response(stream, { status, headers: { "content-type": "application/json" } });
    };
    const api = server(() => slowBody({ error: "SESSION_REQUIRED" }, 401));
    const seen = await createSameOriginFetch("/api", api.fetch)(new URL("https://localhost/v1/account/export"))
      .then((answer) => ({ status: answer.status, noSession: holdsNoSession() }));
    expect(seen).toEqual({ status: 401, noSession: true });
  });

  it("through the contract client: after a refused poll, the session and room reads send nothing", async () => {
    const api = server(() => json({ error: "SESSION_REQUIRED" }, 401));
    const client = createBrowserContractClient(api.fetch);
    await expect(client.readDataExportStatus()).rejects.toMatchObject({ status: 401 });
    await expect(client.readSession()).rejects.toBeInstanceOf(ContractHttpError);
    await expect(client.getAskRoom({ plan_tier: "free", composition_budget_tier: "low", depth: 1 })).rejects.toMatchObject({ status: 401 });
    expect(api.calls).toEqual(["/api/v1/account/export"]);
  });

  it("a sign-in in another tab between the request and its answer keeps the new cookie", async () => {
    const api = server(() => { signIn(NEWER); return json({ error: "SESSION_REQUIRED" }, 401); });
    const sameOrigin = createSameOriginFetch("/api", api.fetch);
    await sameOrigin(new URL("https://localhost/v1/account/export"));
    expect(held()).toBe(NEWER);
    expect(holdsNoSession()).toBe(false);
  });

  it("a sign-out in another tab meanwhile leaves nothing to remove, and nothing is set", async () => {
    const api = server(() => { document.cookie = "__Host-debateai-csrf=; Path=/; Max-Age=0; Secure; SameSite=Lax"; return json({ error: "SESSION_REQUIRED" }, 401); });
    await createSameOriginFetch("/api", api.fetch)(new URL("https://localhost/v1/account/export"));
    expect(held()).toBeNull();
  });

  it("every other answer keeps the cookie: other refusals, the edge's own request for the site password, writes refused for CSRF", async () => {
    const answers: ReadonlyArray<readonly [string, () => Response]> = [
      ["a wrong password", () => json({ error: "AUTH_CREDENTIALS_INVALID" }, 401)],
      ["no team sign-in", () => json({ error: "STAFF_AUTHORITY_INVALID" }, 401)],
      ["no reset held", () => json({ error: "PASSWORD_RESET_INVALID" }, 401)],
      ["the edge asking for the site password", () => new Response("Unauthorized", { status: 401, headers: { "www-authenticate": "Basic realm=\"site\"" } })],
      ["a 401 with no body", () => new Response(null, { status: 401 })],
      ["a write without the CSRF pair", () => json({ error: "CSRF_VALIDATION_FAILED" }, 403)],
      ["a cookie session the route needs", () => json({ error: "COOKIE_SESSION_REQUIRED" }, 409)],
      ["the proxy while the API restarts", () => json({ error: "API_UPSTREAM_UNAVAILABLE" }, 502)],
      ["an answer", () => json({ status: "NONE" }, 200)]
    ];
    for (const [name, answer] of answers) {
      const api = server(answer);
      await createSameOriginFetch("/api", api.fetch)(new URL("https://localhost/v1/account/export"));
      expect(held(), name).toBe(CSRF);
    }
  });

  it("a refusal under /v1/admin/ keeps the cookie: there the API also says so when its second look at the session failed", async () => {
    const api = server(() => json({ error: "SESSION_REQUIRED" }, 401));
    await createSameOriginFetch("/api", api.fetch)(new URL("https://localhost/v1/admin/team-limit"));
    expect(held()).toBe(CSRF);
  });
});
