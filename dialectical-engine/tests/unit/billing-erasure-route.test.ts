import { describe, expect, it, vi } from "vitest";
import { buildApi, CSRF_COOKIE_NAME, SESSION_COOKIE_NAME } from "@debateai/api";
import type { AccountErasureApplication } from "../../apps/api/src/account-erasure.js";
import type { AuthenticatedSession, SessionApplication } from "../../apps/api/src/sessions.js";
import { unusedAskApplication } from "../support/billingFixtures.js";

const ORIGIN = "https://app.debateai.test";
const SESSION_TOKEN = "s".repeat(43);
const CSRF_TOKEN = "c".repeat(43);
const GRANT_TOKEN = "g".repeat(43);
const authenticated = Object.freeze({
  session: Object.freeze({
    asker_id: "owner:22222222-2222-4222-8222-222222222222", session_id: "33333333-3333-4333-8333-333333333333",
    caller_scope: "ASKER" as const, ownership_provenance: "server_session" as const, provisional_identity_model: false as const
  }),
  userId: "44444444-4444-4444-8444-444444444444", ownerRef: "22222222-2222-4222-8222-222222222222",
  tokenHash: "sha256:session", csrfTokenHash: "sha256:csrf", authKind: "cookie" as const
}) satisfies AuthenticatedSession;

const sessions = (): SessionApplication => ({
  authenticate: async (token) => token === SESSION_TOKEN ? authenticated : null,
  verifyCsrf: (_session, token) => token === CSRF_TOKEN,
  beginLogin: async () => ({ status: "mfa_required", challengeToken: "m".repeat(43) }),
  completeLogin: async () => ({ status: "authenticated", sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN, session: authenticated.session }),
  logout: async () => true, listSessions: async () => [], revokeSession: async () => true, revokeAllSessions: async () => 1,
  stepUp: async () => ({ sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN })
});

const erasure = (schedule: AccountErasureApplication["schedule"]): AccountErasureApplication => ({
  schedule, current: async () => ({ status: "NONE" }), cancel: async () => true, deletePrivateDebate: async () => "CLEANED"
});

const headers = { cookie: `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`, origin: ORIGIN, "x-csrf-token": CSRF_TOKEN };
const payload = { confirmation: "DELETE MY ACCOUNT", step_up_grant: GRANT_TOKEN };
const scheduled = async () => ({ status: "SCHEDULED" as const, executeAt: new Date("2026-10-08T00:00:00.000Z"), cancellationRef: "55555555-5555-4555-8555-555555555555" });

describe("P15 scheduling an erasure stops billing", () => {
  it("stops the owner's billing after the erasure is scheduled, and answers 202 even when the stop fails", async () => {
    const stop = vi.fn(async (_ownerRef: string) => "STOPPED" as const);
    const api = buildApi({
      application: unusedAskApplication(), sessions: sessions(), allowedOrigin: ORIGIN,
      accountErasure: erasure(scheduled), billingErasure: { stop }
    });
    const response = await api.inject({ method: "DELETE", url: "/v1/account", headers, payload });
    expect(response.statusCode).toBe(202);
    expect(stop).toHaveBeenCalledWith(authenticated.ownerRef);
    await api.close();

    const failing = vi.fn(async (): Promise<"STOPPED"> => { throw new Error("database down"); });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const degraded = buildApi({
      application: unusedAskApplication(), sessions: sessions(), allowedOrigin: ORIGIN,
      accountErasure: erasure(scheduled), billingErasure: { stop: failing }
    });
    expect((await degraded.inject({ method: "DELETE", url: "/v1/account", headers, payload })).statusCode).toBe(202);
    expect(errors).toHaveBeenCalledWith("[BILLING_ERASURE_STOP_PENDING]");
    errors.mockRestore();
    await degraded.close();
  });

  it("does not touch billing when nothing was scheduled", async () => {
    const stop = vi.fn(async () => "STOPPED" as const);
    const api = buildApi({
      application: unusedAskApplication(), sessions: sessions(), allowedOrigin: ORIGIN,
      accountErasure: erasure(async () => null), billingErasure: { stop }
    });
    expect((await api.inject({ method: "DELETE", url: "/v1/account", headers, payload })).statusCode).toBe(404);
    expect(stop).not.toHaveBeenCalled();
    await api.close();
  });
});
