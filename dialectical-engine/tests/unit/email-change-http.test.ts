import { describe, expect, it, vi } from "vitest";
import {
  authorizationPolicyInventory,
  buildApi,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type AskApplication,
  type EmailChangeApplication
} from "@debateai/api";
import { contractInventory } from "@debateai/contract";
import { EmailChangeError } from "../../apps/api/src/email-change.js";
import type { AuthenticatedSession, SessionApplication } from "../../apps/api/src/sessions.js";

// Turn 14 — the change-email HTTP boundary: four owner routes behind the cookie
// session and CSRF, two link routes that need only the first-party Origin and
// the mailed bearer, and the CHANGE_EMAIL step-up grant that gates the request.

const ORIGIN = "https://app.debateai.test";
const SESSION_TOKEN = "s".repeat(43);
const CSRF_TOKEN = "c".repeat(43);
const GRANT_TOKEN = "g".repeat(43);
const LINK_TOKEN = "L".repeat(43);
const authenticated = Object.freeze({
  session: Object.freeze({
    asker_id: "owner:22222222-2222-4222-8222-222222222222",
    session_id: "33333333-3333-4333-8333-333333333333",
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  }),
  userId: "44444444-4444-4444-8444-444444444444",
  ownerRef: "22222222-2222-4222-8222-222222222222",
  tokenHash: "sha256:session", csrfTokenHash: "sha256:csrf", authKind: "cookie" as const
}) satisfies AuthenticatedSession;
const owner = { userId: authenticated.userId, sessionId: authenticated.session.session_id };
const EXPIRES = new Date("2026-09-29T12:00:00.000Z");

function application(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" }),
    readAnswer: async () => null, readRunAnswer: async () => null, readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null, readLedgerDigest: async () => null,
    readNode: async () => null, recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

function sessions(overrides: Partial<SessionApplication> = {}): SessionApplication {
  return {
    authenticate: async (token) => token === SESSION_TOKEN ? authenticated : null,
    verifyCsrf: (_session, token) => token === CSRF_TOKEN,
    beginLogin: async () => ({ status: "mfa_required", challengeToken: "m".repeat(43) }),
    completeLogin: async () => ({
      status: "authenticated", sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN, session: authenticated.session
    }),
    logout: async () => true, listSessions: async () => [], revokeSession: async () => true,
    revokeAllSessions: async () => 1,
    stepUp: async () => ({ sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN }),
    ...overrides
  };
}

function emailChange(overrides: Partial<EmailChangeApplication> = {}): EmailChangeApplication {
  return {
    settings: async () => ({ email: "ana.popescu@unibuc.ro", recoveryEmail: "a.popescu@proton.me", pending: null }),
    request: async () => ({ newEmail: "ana.popescu@icub.ro", expiresAt: EXPIRES }),
    resend: async () => ({ newEmail: "ana.popescu@icub.ro", expiresAt: EXPIRES }),
    cancel: async () => undefined,
    confirm: async () => undefined,
    cancelByLink: async () => undefined,
    ...overrides
  };
}

const cookie = `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`;
const headers = Object.freeze({ cookie, origin: ORIGIN, "x-csrf-token": CSRF_TOKEN, "user-agent": "t14-browser" });

const ROUTES = [
  ["GET /v1/account/email", "user"],
  ["POST /v1/account/email/change", "user"],
  ["POST /v1/account/email/change/resend", "user"],
  ["DELETE /v1/account/email/change", "user"],
  ["POST /v1/account/email/change/confirm", "public"],
  ["POST /v1/account/email/change/cancel", "public"]
] as const;

describe("Turn 14 change-email HTTP boundary", () => {
  it("declares the six routes in the contract and the authorization inventory", () => {
    for (const [route, auth] of ROUTES) {
      expect(contractInventory.routes).toContain(route);
      const policy = authorizationPolicyInventory.find((entry) => entry.route === route);
      expect(policy).toMatchObject({ auth, resource: "identity" });
      if (auth === "public") expect(policy).toMatchObject({ origin: "trusted" });
    }
  });

  it("mints a targetless CHANGE_EMAIL grant through step-up and refuses a run-targeted one", async () => {
    const stepUp = vi.fn<SessionApplication["stepUp"]>(async () => ({
      sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN, grantToken: GRANT_TOKEN,
      grantExpiresAt: new Date("2026-09-28T12:05:00.000Z")
    }));
    const api = buildApi({ application: application(), sessions: sessions({ stepUp }), allowedOrigin: ORIGIN });
    const crossed = await api.inject({
      method: "POST", url: "/v1/auth/step-up", headers,
      payload: { password: "correct horse", code: "123456",
        authorization: { action: "CHANGE_EMAIL", target_run_id: "11111111-1111-4111-8111-111111111111" } }
    });
    expect(crossed.statusCode).toBe(400);
    expect(stepUp).not.toHaveBeenCalled();
    const minted = await api.inject({
      method: "POST", url: "/v1/auth/step-up", headers,
      payload: { password: "correct horse", code: "123456", authorization: { action: "CHANGE_EMAIL" } }
    });
    expect(minted.statusCode).toBe(200);
    expect(minted.json()).toEqual({
      status: "step_up_complete", csrf_token: CSRF_TOKEN,
      step_up_grant: { token: GRANT_TOKEN, action: "CHANGE_EMAIL", expires_at: "2026-09-28T12:05:00.000Z" }
    });
    expect(stepUp.mock.calls[0]?.[0]).toMatchObject({ authorization: { action: "CHANGE_EMAIL" } });
    await api.close();
  });

  it("reads the owner's addresses and pending change, and nothing without a session", async () => {
    const settings = vi.fn<EmailChangeApplication["settings"]>(async () => ({
      email: "ana.popescu@unibuc.ro", recoveryEmail: "a.popescu@proton.me",
      pending: { newEmail: "ana.popescu@icub.ro", expiresAt: EXPIRES }
    }));
    const api = buildApi({
      application: application(), sessions: sessions(), emailChange: emailChange({ settings }), allowedOrigin: ORIGIN
    });
    const anonymous = await api.inject({ method: "GET", url: "/v1/account/email", headers: { origin: ORIGIN } });
    expect(anonymous.statusCode).toBe(401);
    const read = await api.inject({ method: "GET", url: "/v1/account/email", headers });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({
      email: "ana.popescu@unibuc.ro", recovery_email: "a.popescu@proton.me",
      pending: { new_email: "ana.popescu@icub.ro", expires_at: "2026-09-29T12:00:00.000Z" }
    });
    expect(settings).toHaveBeenCalledWith(owner);
    await api.close();
  });

  it("requests a change with CSRF and a grant, and maps each refusal to its status", async () => {
    const request = vi.fn<EmailChangeApplication["request"]>(async () => ({
      newEmail: "ana.popescu@icub.ro", expiresAt: EXPIRES
    }));
    const api = buildApi({
      application: application(), sessions: sessions(), emailChange: emailChange({ request }), allowedOrigin: ORIGIN
    });
    const payload = { new_email: "ana.popescu@icub.ro", step_up_grant: GRANT_TOKEN };
    const noCsrf = await api.inject({
      method: "POST", url: "/v1/account/email/change", headers: { cookie, origin: ORIGIN }, payload
    });
    expect(noCsrf.statusCode).toBe(403);
    const malformed = await api.inject({
      method: "POST", url: "/v1/account/email/change", headers, payload: { new_email: "x@y.ro" }
    });
    expect(malformed.statusCode).toBe(400);
    const accepted = await api.inject({ method: "POST", url: "/v1/account/email/change", headers, payload });
    expect(accepted.statusCode).toBe(202);
    expect(accepted.json()).toEqual({
      status: "PENDING", new_email: "ana.popescu@icub.ro", expires_at: "2026-09-29T12:00:00.000Z"
    });
    expect(request.mock.calls[0]?.[0]).toEqual(owner);
    expect(request.mock.calls[0]?.[1]).toEqual({ newEmail: "ana.popescu@icub.ro", grantToken: GRANT_TOKEN });
    for (const [code, status] of [
      ["EMAIL_INVALID", 422], ["EMAIL_UNCHANGED", 422], ["STEP_UP_REQUIRED", 403]
    ] as const) {
      request.mockRejectedValueOnce(new EmailChangeError(code));
      const refused = await api.inject({ method: "POST", url: "/v1/account/email/change", headers, payload });
      expect(refused.statusCode).toBe(status);
      expect(refused.json()).toEqual({ error: code });
    }
    await api.close();
  });

  it("resends and cancels the owner's pending change", async () => {
    const resend = vi.fn<EmailChangeApplication["resend"]>(async () => ({
      newEmail: "ana.popescu@icub.ro", expiresAt: EXPIRES
    }));
    const cancel = vi.fn<EmailChangeApplication["cancel"]>(async () => undefined);
    const api = buildApi({
      application: application(), sessions: sessions(), emailChange: emailChange({ resend, cancel }),
      allowedOrigin: ORIGIN
    });
    const resent = await api.inject({ method: "POST", url: "/v1/account/email/change/resend", headers, payload: {} });
    expect(resent.statusCode).toBe(202);
    expect(resent.json()).toMatchObject({ status: "PENDING", new_email: "ana.popescu@icub.ro" });
    resend.mockRejectedValueOnce(new EmailChangeError("RESEND_COOLDOWN"));
    expect((await api.inject({ method: "POST", url: "/v1/account/email/change/resend", headers, payload: {} }))
      .statusCode).toBe(429);
    resend.mockRejectedValueOnce(new EmailChangeError("NO_PENDING_CHANGE"));
    expect((await api.inject({ method: "POST", url: "/v1/account/email/change/resend", headers, payload: {} }))
      .statusCode).toBe(404);
    const cancelled = await api.inject({ method: "DELETE", url: "/v1/account/email/change", headers });
    expect(cancelled.statusCode).toBe(204);
    expect(cancel.mock.calls[0]?.[0]).toEqual(owner);
    cancel.mockRejectedValueOnce(new EmailChangeError("NO_PENDING_CHANGE"));
    expect((await api.inject({ method: "DELETE", url: "/v1/account/email/change", headers })).statusCode).toBe(404);
    await api.close();
  });

  it("confirms and cancels by the mailed bearer without a session, but only from the first-party Origin", async () => {
    const confirm = vi.fn<EmailChangeApplication["confirm"]>(async () => undefined);
    const cancelByLink = vi.fn<EmailChangeApplication["cancelByLink"]>(async () => undefined);
    const api = buildApi({
      application: application(), sessions: sessions(), emailChange: emailChange({ confirm, cancelByLink }),
      allowedOrigin: ORIGIN
    });
    const foreign = await api.inject({
      method: "POST", url: "/v1/account/email/change/confirm",
      headers: { origin: "https://evil.test" }, payload: { token: LINK_TOKEN }
    });
    expect(foreign.statusCode).toBe(403);
    expect(confirm).not.toHaveBeenCalled();
    const confirmed = await api.inject({
      method: "POST", url: "/v1/account/email/change/confirm", headers: { origin: ORIGIN }, payload: { token: LINK_TOKEN }
    });
    expect(confirmed.statusCode).toBe(200);
    expect(confirmed.json()).toEqual({ status: "CONFIRMED" });
    expect(confirm.mock.calls[0]?.[0]).toBe(LINK_TOKEN);
    for (const [code, status] of [
      ["LINK_INVALID", 404], ["LINK_EXPIRED", 410], ["ADDRESS_UNAVAILABLE", 409]
    ] as const) {
      confirm.mockRejectedValueOnce(new EmailChangeError(code));
      const refused = await api.inject({
        method: "POST", url: "/v1/account/email/change/confirm", headers: { origin: ORIGIN }, payload: { token: LINK_TOKEN }
      });
      expect(refused.statusCode).toBe(status);
      expect(refused.json()).toEqual({ error: code });
    }
    const cancelled = await api.inject({
      method: "POST", url: "/v1/account/email/change/cancel", headers: { origin: ORIGIN }, payload: { token: LINK_TOKEN }
    });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toEqual({ status: "CANCELLED" });
    expect(cancelByLink.mock.calls[0]?.[0]).toBe(LINK_TOKEN);
    const malformed = await api.inject({
      method: "POST", url: "/v1/account/email/change/cancel", headers: { origin: ORIGIN }, payload: { token: "x" }
    });
    expect(malformed.statusCode).toBe(400);
    await api.close();
  });

  it("answers a closed 503 when the deployment wires no change-email application", async () => {
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
    const read = await api.inject({ method: "GET", url: "/v1/account/email", headers });
    expect(read.statusCode).toBe(503);
    expect(read.json()).toEqual({ error: "EMAIL_CHANGE_UNAVAILABLE" });
    await api.close();
  });
});
