import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  buildApi,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type AskApplication
} from "@debateai/api";
import type {
  AuthenticatedSession,
  SessionApplication
} from "../../apps/api/src/sessions.js";
import { createContractClient } from "@debateai/contract";
import { createServerContractClient as createUiServerClient } from "../../apps/ui/lib/serverApi.js";
import { RETIRED_DEV_HEADER } from "../support/httpSession.js";

const SESSION_TOKEN = "s".repeat(43);
const CSRF_TOKEN = "c".repeat(43);
const ORIGIN = "https://app.debateai.test";
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const ANSWER_ID = "22222222-2222-4222-8222-222222222222";

function application(): AskApplication {
  return {
    withContentLease: async (_runId,use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async (runId) => ({
      run_ref: runId, question_line: "S5 stream", state: "QUEUED",
      terminal_reason: null, hold_until: null
    }),
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
  const ownerRef = "33333333-3333-4333-8333-333333333333";
  return Object.freeze({
    session: Object.freeze({
      asker_id: `owner:${ownerRef}`,
      session_id: "22222222-2222-4222-8222-222222222222",
      caller_scope: "ASKER" as const,
      ownership_provenance: "server_session" as const,
      provisional_identity_model: false as const
    }),
    userId: "11111111-1111-4111-8111-111111111111",
    ownerRef,
    tokenHash: "sha256:" + createHash("sha256").update(SESSION_TOKEN).digest("hex"),
    csrfTokenHash: "sha256:" + createHash("sha256").update(CSRF_TOKEN).digest("hex"),
    authKind: "cookie" as const
  });
}

function sessions(): SessionApplication {
  const auth = authenticated();
  return {
    assertCurrent: async (session) => {
      if (session.userId !== auth.userId || session.session.session_id !== auth.session.session_id || session.tokenHash !== auth.tokenHash) throw new Error("SESSION_REQUIRED");
    },
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
const ownedMutationCases = Object.freeze([
  {
    label: "investigation",
    url: `/v1/answers/${ANSWER_ID}/investigations/gap:test`,
    payload: { user_input: null, human_steer_input: true }
  },
  {
    label: "memory unlink",
    url: `/v1/answers/${ANSWER_ID}/memory-link/unlink`,
    payload: undefined
  }
]);
const rejectedCsrfCases = Object.freeze([
  ["missing origin", { cookie, "x-csrf-token": CSRF_TOKEN }],
  ["foreign origin", { cookie, origin: "https://evil.test", "x-csrf-token": CSRF_TOKEN }],
  ["missing csrf", { cookie, origin: ORIGIN }],
  ["mismatched double-submit", { cookie, origin: ORIGIN, "x-csrf-token": "x".repeat(43) }]
] as const);

describe("S5 HTTP session boundary", () => {
  it("refuses the retired development header with no rollback seam", async () => {
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
    const response = await api.inject({
      method: "GET",
      url: "/v1/session",
      headers: { [RETIRED_DEV_HEADER]: "configured-only-in-test" }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "SESSION_REQUIRED" });
    await api.close();
  });

  it("never falls back from an invalid/present cookie or accepts both credential channels", async () => {
    const api = buildApi({
      application: application(),
      sessions: sessions(),
      allowedOrigin: ORIGIN
    });
    const invalidCookie = `${SESSION_COOKIE_NAME}=${"x".repeat(43)}`;
    expect((await api.inject({
      method: "GET",
      url: "/v1/session",
      headers: { cookie: invalidCookie, [RETIRED_DEV_HEADER]: "configured-only-in-test" }
    })).statusCode).toBe(401);
    expect((await api.inject({
      method: "GET",
      url: "/v1/session",
      headers: { cookie, [RETIRED_DEV_HEADER]: "configured-only-in-test", "user-agent": "s5-test-browser" }
    })).statusCode).toBe(401);
    await api.close();
  });

  it("keeps a real cookie ASKER out of every transitional operator route", async () => {
    const selectConsumerModel = vi.fn().mockResolvedValue({
      consumerSelectionId: "selection:test",
      modelId: "model:test",
      selectedAt: new Date("2026-08-23T00:00:00.000Z")
    });
    const api = buildApi({
      application: application(),
      sessions: sessions(),
      allowedOrigin: ORIGIN,
      evaluatorDevMenuRegisterVersion: 1,
      evaluatorDevMenu: {
        readView: async () => ({
          catalog: { state: "UNAVAILABLE", probeId: null, failureCode: "TEST", models: [] },
          selectedConsumer: null,
          dispatchBinding: {
            state: "UNBOUND", reason: "ROW_ABSENT", registerVersion: 1, sourceRef: null
          },
          harvestedRows: 0,
          domains: [],
          profiles: [],
          parkedRuns: []
        }),
        selectConsumerModel
      }
    });
    for (const request of [
      { method: "GET" as const, url: "/v1/deployment", headers: { cookie, "user-agent": "s5-test-browser" } },
      { method: "GET" as const, url: "/v1/dev/evaluator", headers: { cookie, "user-agent": "s5-test-browser" } },
      {
        method: "POST" as const,
        url: "/v1/dev/evaluator/consumer-selection",
        headers: csrfHeaders,
        payload: { model_id: "model:test" }
      }
    ]) {
      const response = await api.inject(request);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "OPERATOR_REQUIRED" });
    }
    expect(selectConsumerModel).not.toHaveBeenCalled();
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
      url: `/v1/runs/${RUN_ID}/events`,
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
      method: "POST", url: `/v1/answers/${ANSWER_ID}/memory-link/unlink`, headers: csrfHeaders
    });
    expect(response.statusCode).toBe(200);
    await api.close();
  });

  it.each(ownedMutationCases.flatMap((mutation) => rejectedCsrfCases.map(([csrfCase, headers]) => ({
    ...mutation, csrfCase, headers
  }))))("rejects $label with $csrfCase before the application owner check", async ({ url, payload, headers }) => {
    const candidate = application();
    const recordInvestigation = vi.fn().mockResolvedValue(null);
    const unlinkMemoryLink = vi.fn().mockResolvedValue(null);
    candidate.recordInvestigation = recordInvestigation;
    candidate.unlinkMemoryLink = unlinkMemoryLink;
    const api = buildApi({ application: candidate, sessions: sessions(), allowedOrigin: ORIGIN });
    const response = await api.inject({ method: "POST", url, headers, ...(payload === undefined ? {} : { payload }) });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "CSRF_VALIDATION_FAILED" });
    expect(recordInvestigation).not.toHaveBeenCalled();
    expect(unlinkMemoryLink).not.toHaveBeenCalled();
    await api.close();
  });

  it.each(ownedMutationCases)("lets valid cookie CSRF reach the $label owner check", async ({ url, payload }) => {
    const candidate = application();
    const recordInvestigation = vi.fn().mockResolvedValue(null);
    const unlinkMemoryLink = vi.fn().mockResolvedValue(null);
    candidate.recordInvestigation = recordInvestigation;
    candidate.unlinkMemoryLink = unlinkMemoryLink;
    const api = buildApi({ application: candidate, sessions: sessions(), allowedOrigin: ORIGIN });
    const response = await api.inject({ method: "POST", url, headers: csrfHeaders, ...(payload === undefined ? {} : { payload }) });
    expect(response.statusCode).toBe(404);
    expect(recordInvestigation.mock.calls.length + unlinkMemoryLink.mock.calls.length).toBe(1);
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

  it("maps malformed revoke ids to foreign-safe 404 without reaching the repository", async () => {
    const revokeSession = vi.fn().mockResolvedValue(true);
    const api = buildApi({
      application: application(),
      sessions: { ...sessions(), revokeSession },
      allowedOrigin: ORIGIN
    });
    const response = await api.inject({
      method: "DELETE", url: "/v1/auth/sessions/not-a-uuid", headers: csrfHeaders
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "NOT_FOUND" });
    expect(revokeSession).not.toHaveBeenCalled();
    await api.close();
  });

  it("keeps generic 500 envelopes constant and excludes database messages", async () => {
    const broken = application();
    broken.readAnswer = async () => {
      throw new Error("invalid input syntax for type uuid: secret-driver-detail");
    };
    const api = buildApi({ application: broken, sessions: sessions(), allowedOrigin: ORIGIN });
    const response = await api.inject({
      method: "GET", url: `/v1/answers/${ANSWER_ID}`, headers: { cookie, "user-agent": "s5-test-browser" }
    });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "INTERNAL_ERROR", message: "INTERNAL_ERROR" });
    expect(response.body).not.toContain("uuid");
    expect(response.body).not.toContain("driver");
    await api.close();
  });

  it("forwards only the incoming browser User-Agent on the cookie-native SSR client", async () => {
    const originalBase = process.env.DIALECTICAL_API_BASE;
    process.env.DIALECTICAL_API_BASE = "https://api.debateai.test";
    const seen: Headers[] = [];
    const boundFetch = (async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push(headers);
      return headers.get("user-agent") === "Bound Browser A"
        ? Response.json(authenticated().session)
        : Response.json({ error: "SESSION_REQUIRED" }, { status: 401 });
    }) as typeof fetch;
    try {
      for (const createServerClient of [createUiServerClient]) {
        await expect(createServerClient(boundFetch, SESSION_TOKEN, "Bound Browser A")
          .readSession()).resolves.toMatchObject({ ownership_provenance: "server_session" });
        await expect(createServerClient(boundFetch, SESSION_TOKEN, "Different Browser B")
          .readSession()).rejects.toMatchObject({ code: "SESSION_REQUIRED" });
      }
      expect(seen).toHaveLength(2);
      expect(seen[0]!.get("cookie")).toBe(`${SESSION_COOKIE_NAME}=${SESSION_TOKEN}`);
      expect(seen[0]!.get("user-agent")).toBe("Bound Browser A");
      expect([...seen[0]!.keys()].sort()).toEqual(["cookie", "user-agent"]);
    } finally {
      if (originalBase === undefined) delete process.env.DIALECTICAL_API_BASE;
      else process.env.DIALECTICAL_API_BASE = originalBase;
    }
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

// Exercise hook barriers under exact canonical policies; v1 fixture leaves these mounts to each test.
describe('prepared staff HTTP authority', () => {
    it('denies missing separate staff cookie instead of admitting ordinary MFA', async () => {
        const staff = await import('../../apps/api/src/staff/access.js');
        expect(staff).not.toBeNull();
        const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
        api.get('/v1/admin/team', staff.staffRoutePolicy('TEAM_READ'), async () => ({ secret: 'private' }));
        expect((await api.inject({ url: '/v1/admin/team', headers: { cookie } })).statusCode).toBe(401);
        await api.close();
    });
});
async function staffHttpFixture() {
    const staff = await import('../../apps/api/src/staff/access.js');
    const ordinary = sessions(), base = (await ordinary.authenticate(SESSION_TOKEN, { ip: '192.0.2.1', userAgent: 'test', requestId: 'test' }))!;
    const token = Buffer.alloc(32, 3).toString('base64url'), csrf = Buffer.alloc(32, 4).toString('base64url');
    const hash = (value: string) => 'sha256:' + createHash('sha256').update(value).digest('hex');
    const context = { staffId: '77777777-7777-4777-8777-777777777777', userId: base.userId, ordinarySessionId: base.session.session_id, privilegeSessionId: '88888888-8888-4888-8888-888888888888', designation: 'DELEGATED' as const, securityEpoch: 0, accountSecurityEpoch: 0, grantRevision: 0, capabilities: ['TEAM_READ' as const] };
    let current = true, unavailable = false;
    const record = () => {
        if (unavailable)
            throw new Error('SECRET_DB_DETAIL');
        return current ? { context, csrfTokenHash: hash(csrf), expiresAt: new Date(Date.now() + 60000) } : null;
    };
    const repo = { readAuthentication: async (input: any) => input.staffTokenHash === hash(token) && input.ordinaryTokenHash === base.tokenHash ? record() : null, readCurrentContext: async () => record(), authorize: async (input: any) => input.capability === 'TEAM_READ' && current, readActionProof: async () => null, readInvitationContext: async () => null, readOwnerPossessionContext: async () => null };
    const service = new staff.StaffAccessService(repo, ordinary);
    const api = buildApi({ application: application(), sessions: ordinary, staffAccess: service, allowedOrigin: ORIGIN });
    const bothCookies = cookie + '; ' + staff.STAFF_COOKIE_NAME + '=' + token + '; ' + staff.STAFF_CSRF_COOKIE_NAME + '=' + csrf;
    const headers = { cookie: bothCookies, origin: ORIGIN, 'x-csrf-token': CSRF_TOKEN, 'x-staff-csrf-token': csrf };
    return { api, staff, token, csrf, headers, bothCookies, revoke: () => { current = false; }, outage: () => { unavailable = true; } };
}
describe('Task4 exact staff transport and response boundary', () => {
    it.each([
        ['missing staff csrf', { 'x-staff-csrf-token': undefined }],
        ['wrong staff csrf', { 'x-staff-csrf-token': Buffer.alloc(32, 5).toString('base64url') }],
        ['joined duplicate staff csrf', { 'x-staff-csrf-token': 'bad,bad' }],
        ['missing ordinary csrf', { 'x-csrf-token': undefined }],
        ['missing Origin', { origin: undefined }],
        ['foreign Origin', { origin: 'https://foreign.test' }],
        ['nonexact Origin', { origin: ORIGIN + '/' }],
    ])('rejects %s before a staff mutation handler', async (_label, change) => {
        const f = await staffHttpFixture();
        let reached = false;
        f.api.post('/v1/admin/webauthn/action/options', {config: {auth: 'staff'}}, async () => { reached = true; return { secret: 'private' }; });
        const headers = Object.fromEntries(Object.entries({ ...f.headers, ...change }).filter(([, value]) => value !== undefined)) as Record<string, string>;
        const response = await f.api.inject({ method: 'POST', url: '/v1/admin/webauthn/action/options', headers });
        expect(response.statusCode).toBe(403);
        expect(reached).toBe(false);
        await f.api.close();
    });
    it('requires separate cookies, rejects duplicates/retired channels, and preserves safe GET Origin semantics', async () => {
        const f = await staffHttpFixture();
        f.api.get('/v1/admin/team', f.staff.staffRoutePolicy('TEAM_READ'), async () => ({ own: true }));
        for (const headers of [{ cookie }, { cookie: f.bothCookies + '; ' + f.staff.STAFF_COOKIE_NAME + '=' + f.token }, { cookie: f.bothCookies, authorization: 'Bearer ' + f.token }, { cookie: f.bothCookies, [RETIRED_DEV_HEADER]: 'legacy' }])
            expect((await f.api.inject({ url: '/v1/admin/team', headers })).statusCode).toBe(401);
        const read = await f.api.inject({ url: '/v1/admin/team', headers: { cookie: f.bothCookies } });
        expect(read.statusCode).toBe(200);
        expect(read.json()).toEqual({ own: true });
        await f.api.close();
    });
    it('requires persistent capability, keeps Session ASKER and sends secrets only in trusted Set-Cookie', async () => {
        const f = await staffHttpFixture();
        f.api.get('/v1/admin/team', f.staff.staffRoutePolicy('TEAM_READ'), async (request, reply) => { expect(request.session.caller_scope).toBe('ASKER'); reply.header('set-cookie', f.staff.staffCookies({ staffToken: f.token, staffCsrfToken: f.csrf, expiresAt: new Date(Date.now() + 60000) })); return { own: true }; });
        f.api.get('/v1/admin/audit', f.staff.staffRoutePolicy('AUDIT_READ'), async () => ({ secret: 'audit' }));
        expect((await f.api.inject({ url: '/v1/admin/audit', headers: f.headers })).statusCode).toBe(403);
        const response = await f.api.inject({ url: '/v1/admin/team', headers: f.headers });
        expect(response.statusCode).toBe(200);
        expect(response.body).not.toContain(f.token);
        expect(response.body).not.toContain(f.csrf);
        const cookies = response.headers['set-cookie'] as string[];
        expect(cookies).toHaveLength(2);
        expect(cookies[0]).toContain('; HttpOnly; Secure; SameSite=Strict');
        expect(cookies[1]).not.toContain('HttpOnly');
        for (const cookie of [...cookies, ...f.staff.clearStaffCookies()]) {
            expect(cookie).toContain('Path=/');
            expect(cookie).toContain('Secure; SameSite=Strict');
            expect(cookie).not.toContain('Domain=');
        }
        await f.api.close();
    });
    it.each(['disable', 'outage'])('suppresses privileged content at the pre-serialization %s barrier', async (mode) => {
        const f = await staffHttpFixture();
        let started: () => void = () => { }, release: () => void = () => { };
        const waiting = new Promise<void>(r => { started = r; }), barrier = new Promise<void>(r => { release = r; });
        f.api.get('/v1/admin/team', f.staff.staffRoutePolicy('TEAM_READ'), async () => { started(); await barrier; return { secret: 'must never emit' }; });
        const pending = f.api.inject({ url: '/v1/admin/team', headers: f.headers });
        await waiting;
        if (mode === 'disable')
            f.revoke();
        else
            f.outage();
        release();
        const response = await pending;
        expect(response.statusCode).toBe(401);
        expect(response.json()).toEqual({ error: 'STAFF_AUTHORITY_INVALID' });
        expect(response.body).not.toContain('must never emit');
        expect(response.body).not.toContain('SECRET_DB_DETAIL');
        await f.api.close();
    });
    it('rechecks ordinary base immediately before an existing private SSE event', async () => {
        const ordinary = sessions(), app = application();
        let revoked = false, started: () => void = () => { }, release: () => void = () => { };
        const waiting = new Promise<void>(r => { started = r; }), barrier = new Promise<void>(r => { release = r; });
        ordinary.assertCurrent = async () => {
            if (revoked)
                throw new Error('HELD');
        };
        app.events = async function* () { started(); await barrier; yield { event_id: 'event:private', event_type: 'run.accepted', run_ref: RUN_ID, at_sequence: 1, payload: { secret: 'never' } }; };
        const api = buildApi({ application: app, sessions: ordinary, allowedOrigin: ORIGIN }), pending = api.inject({ url: '/v1/runs/' + RUN_ID + '/events', headers: { cookie } });
        await waiting;
        revoked = true;
        release();
        const response = await pending;
        expect(response.body).not.toContain('event:private');
        expect(response.body).not.toContain('never');
        await api.close();
    });
});
it('rechecks a prepared staff string response at final onSend after its handler revokes authority', async () => {
    const f = await staffHttpFixture();
    f.api.get('/v1/admin/team', f.staff.staffRoutePolicy('TEAM_READ'), async () => { f.revoke(); return 'SECRET_STRING_MUST_NOT_ESCAPE'; });
    const response = await f.api.inject({ url: '/v1/admin/team', headers: f.headers });
    expect(response.statusCode).toBe(401);
    expect(response.body).not.toContain('SECRET_STRING_MUST_NOT_ESCAPE');
    await f.api.close();
});


describe("direct TOTP session completion", () => {
  it("sets the shared host-only session cookies and projects no bearer into JSON", async () => {
    const auth = authenticated();
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      mfa: { verifyTotp: async () => ({ status: "authenticated", sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN, session: auth.session }) } as never });
    try {
      const response = await api.inject({ method: "POST", url: "/v1/auth/mfa/totp/verify", headers: { origin: ORIGIN }, payload: { enrollment_token: "e".repeat(43), code: "123456" } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "authenticated", csrf_token: CSRF_TOKEN, session: auth.session });
      const cookies = response.headers["set-cookie"] as string[];
      expect(cookies).toHaveLength(2);
      expect(cookies[0]).toContain("HttpOnly");
      for (const cookie of cookies) { expect(cookie).toContain("Secure"); expect(cookie).toContain("SameSite=Lax"); expect(cookie).toContain("Max-Age=1209600"); expect(cookie).not.toContain("Domain="); }
    } finally { await api.close(); }
  });
});

it('requires ordinary cookie CSRF when adding TOTP and exposes only enrolled on completion',async()=>{
  const begin=vi.fn(async()=>({status:'verification_required',secret:'A'.repeat(32),otpauthUri:'otpauth://totp/fixture',enrollment_token:'e'.repeat(43),expires_at:'2026-10-05T12:00:00.000Z'}));
  const complete=vi.fn(async(..._args:unknown[])=>({status:'enrolled'}));
  const api=buildApi({application:application(),sessions:sessions(),allowedOrigin:ORIGIN,mfa:{beginTotp:begin,verifyTotp:complete} as never});
  try {
    const cookie=`${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`;
    const missing=await api.inject({method:'POST',url:'/v1/auth/mfa/totp/begin',headers:{cookie,origin:ORIGIN},payload:{step_up_grant:'g'.repeat(43)}});
    expect(missing.statusCode).toBe(403);expect(begin).not.toHaveBeenCalled();
    const success=await api.inject({method:'POST',url:'/v1/auth/mfa/totp/verify',headers:{cookie,origin:ORIGIN,'x-csrf-token':CSRF_TOKEN},payload:{enrollment_token:'e'.repeat(43),code:'123456'}});
    expect(success.statusCode).toBe(200);expect(success.json()).toEqual({status:'enrolled'});
    expect(complete.mock.calls[0]?.[2]).toMatchObject({userId:authenticated().userId});
  } finally {await api.close();}
});
