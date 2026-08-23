import { describe, expect, it } from "vitest";
import {
  buildApi,
  createLegacyDevSessionResolver,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type AskApplication
} from "@debateai/api";
import type {
  AuthenticatedSession,
  SessionApplication
} from "../../apps/api/src/sessions.js";
import { createContractClient } from "@debateai/contract";

const SESSION_TOKEN = "s".repeat(43);
const CSRF_TOKEN = "c".repeat(43);
const ORIGIN = "https://app.debateai.test";

function application(): AskApplication {
  return {
    submit: async () => ({ run_ref: "run:s5", status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () => ({ request_ref: "request:s5", status: "RECORDED", replay_handle: "replay:s5" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:s5", state: "UNLINKED" }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    events: async function* () {}
  };
}

function authenticated(): AuthenticatedSession {
  return Object.freeze({
    session: Object.freeze({
      asker_id: "user:11111111-1111-4111-8111-111111111111",
      session_id: "22222222-2222-4222-8222-222222222222",
      caller_scope: "ASKER" as const,
      ownership_provenance: "server_session" as const,
      provisional_identity_model: false as const
    }),
    userId: "11111111-1111-4111-8111-111111111111",
    tokenHash: "sha256:session",
    csrfTokenHash: "sha256:csrf",
    authKind: "cookie" as const
  });
}

function sessions(): SessionApplication {
  const auth = authenticated();
  return {
    authenticate: async (token) => token === SESSION_TOKEN ? auth : null,
    verifyCsrf: (resolved, supplied) => resolved === auth && supplied === CSRF_TOKEN,
    beginLogin: async () => ({ status: "mfa_required", challengeToken: "m".repeat(43) }),
    completeLogin: async () => ({
      status: "authenticated",
      sessionToken: SESSION_TOKEN,
      csrfToken: CSRF_TOKEN,
      session: auth.session
    }),
    logout: async () => true,
    listSessions: async () => [{
      session_id: auth.session.session_id,
      created_at: "2026-08-23T00:00:00.000Z",
      last_seen_at: "2026-08-23T00:00:00.000Z",
      idle_expires_at: "2026-09-06T00:00:00.000Z",
      absolute_expires_at: "2026-11-21T00:00:00.000Z",
      last_mfa_at: "2026-08-23T00:00:00.000Z",
      current: true
    }],
    revokeSession: async () => true,
    revokeAllSessions: async () => 1,
    stepUp: async () => ({ sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN })
  };
}

const cookie = `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`;
const csrfHeaders = Object.freeze({
  cookie,
  origin: ORIGIN,
  "x-csrf-token": CSRF_TOKEN,
  "user-agent": "s5-test-browser"
});

describe("S5 HTTP session boundary", () => {
  it("keeps the legacy rollback credential default-off and exact when explicitly configured", async () => {
    const disabled = buildApi({ application: application() });
    const disabledResponse = await disabled.inject({
      method: "GET",
      url: "/v1/session",
      headers: { "x-user-dev-token": "configured-only-in-test" }
    });
    expect(disabledResponse.statusCode).toBe(401);
    await disabled.close();

    const enabled = buildApi({
      application: application(),
      legacyDevSessionResolver: createLegacyDevSessionResolver({ userToken: "configured-only-in-test" })
    });
    expect((await enabled.inject({
      method: "GET", url: "/v1/session", headers: { "x-user-dev-token": "wrong" }
    })).statusCode).toBe(401);
    const exact = await enabled.inject({
      method: "GET", url: "/v1/session", headers: { "x-user-dev-token": "configured-only-in-test" }
    });
    expect(exact.statusCode).toBe(200);
    expect(exact.json()).toMatchObject({
      ownership_provenance: "user_dev_token",
      provisional_identity_model: true
    });
    await enabled.close();
  });

  it("never falls back from an invalid/present cookie or accepts both credential channels", async () => {
    const api = buildApi({
      application: application(),
      sessions: sessions(),
      allowedOrigin: ORIGIN,
      legacyDevSessionResolver: createLegacyDevSessionResolver({ userToken: "configured-only-in-test" })
    });
    const invalidCookie = `${SESSION_COOKIE_NAME}=${"x".repeat(43)}`;
    expect((await api.inject({
      method: "GET",
      url: "/v1/session",
      headers: { cookie: invalidCookie, "x-user-dev-token": "configured-only-in-test" }
    })).statusCode).toBe(401);
    expect((await api.inject({
      method: "GET",
      url: "/v1/session",
      headers: { cookie, "x-user-dev-token": "configured-only-in-test", "user-agent": "s5-test-browser" }
    })).statusCode).toBe(401);
    await api.close();
  });

  it("accepts only the HttpOnly-cookie session and flips the identity model", async () => {
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
    const response = await api.inject({ method: "GET", url: "/v1/session", headers: { cookie, "user-agent": "s5-test-browser" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ownership_provenance: "server_session",
      provisional_identity_model: false
    });
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers["strict-transport-security"]).toContain("max-age=");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["permissions-policy"]).toBeTruthy();
    const refreshed = Array.isArray(response.headers["set-cookie"])
      ? response.headers["set-cookie"].join("\n") : response.headers["set-cookie"] ?? "";
    expect(refreshed).toContain(`${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`);
    expect(refreshed).toContain(`${CSRF_COOKIE_NAME}=${CSRF_TOKEN}; Path=/; Max-Age=1209600; Secure; SameSite=Lax`);
    await api.close();
  });

  it("keeps the raw SSE response on the same no-store security-header boundary", async () => {
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
    const response = await api.inject({
      method: "GET",
      url: "/v1/runs/run:s5/events",
      headers: { cookie, "user-agent": "s5-test-browser" }
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers["strict-transport-security"]).toContain("max-age=");
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["permissions-policy"]).toBeTruthy();
    const refreshed = Array.isArray(response.headers["set-cookie"])
      ? response.headers["set-cookie"].join("\n") : response.headers["set-cookie"] ?? "";
    expect(refreshed).toContain(`${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`);
    await api.close();
  });

  it.each([
    ["missing origin", { cookie, "x-csrf-token": CSRF_TOKEN }],
    ["foreign origin", { cookie, origin: "https://evil.test", "x-csrf-token": CSRF_TOKEN }],
    ["multiple origins", { cookie, origin: `${ORIGIN}, https://evil.test`, "x-csrf-token": CSRF_TOKEN }],
    ["missing csrf", { cookie, origin: ORIGIN }],
    ["wrong csrf", { cookie, origin: ORIGIN, "x-csrf-token": "x".repeat(43) }]
  ])("rejects cookie-authenticated POST /v1/asks with %s", async (_case, headers) => {
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
    const response = await api.inject({ method: "POST", url: "/v1/asks", headers, payload: {} });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "CSRF_VALIDATION_FAILED" });
    await api.close();
  });

  it("allows the exact trusted Origin and session-bound CSRF proof on an existing mutation", async () => {
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
    const response = await api.inject({
      method: "POST", url: "/v1/answers/answer:s5/memory-link/unlink", headers: csrfHeaders
    });
    expect(response.statusCode).toBe(200);
    await api.close();
  });

  it("never issues a session cookie after password phase and issues exact cookies only after MFA", async () => {
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
    const first = await api.inject({
      method: "POST", url: "/v1/auth/login", headers: { origin: ORIGIN },
      payload: { email: "person@example.test", password: "correct horse battery staple" }
    });
    expect(first.statusCode).toBe(202);
    expect(first.headers["set-cookie"]).toBeUndefined();
    expect(first.json()).toMatchObject({ status: "mfa_required" });

    const second = await api.inject({
      method: "POST", url: "/v1/auth/login", headers: { origin: ORIGIN },
      payload: { challenge_token: "m".repeat(43), code: "123456" }
    });
    expect(second.statusCode).toBe(200);
    const setCookie = Array.isArray(second.headers["set-cookie"])
      ? second.headers["set-cookie"].join("\n") : second.headers["set-cookie"] ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=${SESSION_TOKEN}`);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");
    expect(setCookie).toContain("Max-Age=1209600");
    expect(setCookie).toContain(`${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`);
    await api.close();
  });

  it("requires Origin and CSRF even for logout and clears both cookies", async () => {
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
    expect((await api.inject({ method: "POST", url: "/v1/auth/logout", headers: { cookie } })).statusCode).toBe(403);
    const response = await api.inject({ method: "POST", url: "/v1/auth/logout", headers: csrfHeaders });
    expect(response.statusCode).toBe(204);
    const setCookie = Array.isArray(response.headers["set-cookie"])
      ? response.headers["set-cookie"].join("\n") : response.headers["set-cookie"] ?? "";
    expect(setCookie).toContain(`${SESSION_COOKIE_NAME}=`);
    expect(setCookie).toContain(`${CSRF_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
    await api.close();
  });

  it("exposes the complete cookie-session lifecycle through the contract client", async () => {
    const calls: Array<{ path: string; method: string; headers: Headers }> = [];
    const fetchImplementation = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      const method = init?.method ?? "GET";
      calls.push({ path: url.pathname, method, headers: new Headers(init?.headers) });
      if (url.pathname.endsWith(`/auth/sessions/${authenticated().session.session_id}`)) {
        return new Response(null, { status: 204 });
      }
      if (url.pathname.endsWith("/auth/sessions") && method === "GET") {
        return Response.json({ sessions: [{
          session_id: authenticated().session.session_id,
          created_at: "2026-08-23T00:00:00.000Z",
          last_seen_at: "2026-08-23T00:00:00.000Z",
          idle_expires_at: "2026-09-06T00:00:00.000Z",
          absolute_expires_at: "2026-11-21T00:00:00.000Z",
          last_mfa_at: "2026-08-23T00:00:00.000Z",
          current: true
        }] });
      }
      if (url.pathname.endsWith("/auth/sessions") && method === "DELETE") {
        return Response.json({ revoked: 1 });
      }
      if (url.pathname.endsWith("/auth/step-up")) {
        return Response.json({ status: "step_up_complete", csrf_token: CSRF_TOKEN });
      }
      throw new Error(`unexpected contract-client path ${method} ${url.pathname}`);
    }) as typeof fetch;
    const client = createContractClient("https://api.debateai.test", fetchImplementation, {
      mode: "cookie",
      cookieHeader: `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`,
      csrfToken: () => CSRF_TOKEN
    });

    await expect(client.listSessions()).resolves.toMatchObject({ sessions: [{ current: true }] });
    await expect(client.revokeSession(authenticated().session.session_id)).resolves.toBeUndefined();
    await expect(client.revokeAllSessions()).resolves.toEqual({ revoked: 1 });
    await expect(client.stepUp("password", "123456")).resolves.toEqual({
      status: "step_up_complete", csrf_token: CSRF_TOKEN
    });
    expect(calls.map((call) => [call.method, call.path])).toEqual([
      ["GET", "/v1/auth/sessions"],
      ["DELETE", `/v1/auth/sessions/${authenticated().session.session_id}`],
      ["DELETE", "/v1/auth/sessions"],
      ["POST", "/v1/auth/step-up"]
    ]);
    expect(calls[0]!.headers.get("x-csrf-token")).toBeNull();
    for (const call of calls.slice(1)) {
      expect(call.headers.get("x-csrf-token")).toBe(CSRF_TOKEN);
      expect(call.headers.get("cookie")).toContain(`${SESSION_COOKIE_NAME}=${SESSION_TOKEN}`);
    }
  });
});
