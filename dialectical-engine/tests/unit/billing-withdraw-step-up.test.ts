import { describe, expect, it, vi } from "vitest";
import { buildApi, CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, type AskApplication } from "@debateai/api";
import { StepUpAuthorizationRequestSchema, StepUpResponseSchema } from "@debateai/contract";
import type { AuthenticatedSession, SessionApplication } from "../../apps/api/src/sessions.js";

const ORIGIN = "https://app.debateai.test";
const SESSION_TOKEN = "s".repeat(43);
const CSRF_TOKEN = "c".repeat(43);
const GRANT_TOKEN = "g".repeat(43);
const RUN_ID = "11111111-1111-4111-8111-111111111111";
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

function application(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
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

function sessions(stepUp: SessionApplication["stepUp"]): SessionApplication {
  return {
    authenticate: async (token) => token === SESSION_TOKEN ? authenticated : null,
    verifyCsrf: (_session, token) => token === CSRF_TOKEN,
    beginLogin: async () => ({ status: "mfa_required", challengeToken: "m".repeat(43) }),
    completeLogin: async () => ({
      status: "authenticated", sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN, session: authenticated.session
    }),
    logout: async () => true, listSessions: async () => [], revokeSession: async () => true,
    revokeAllSessions: async () => 1,
    stepUp
  };
}

const headers = Object.freeze({
  cookie: `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`,
  origin: ORIGIN, "x-csrf-token": CSRF_TOKEN, "user-agent": "p12a-test-browser"
});

describe("P12a the WITHDRAW_SUBSCRIPTION step-up purpose", () => {
  it("is account-scoped: it parses alone and refuses a run or an account target", () => {
    expect(StepUpAuthorizationRequestSchema.parse({ action: "WITHDRAW_SUBSCRIPTION" }))
      .toEqual({ action: "WITHDRAW_SUBSCRIPTION" });
    expect(StepUpAuthorizationRequestSchema.safeParse({ action: "WITHDRAW_SUBSCRIPTION", target_run_id: RUN_ID }).success)
      .toBe(false);
    expect(StepUpAuthorizationRequestSchema.safeParse({
      action: "WITHDRAW_SUBSCRIPTION", target_account_id: authenticated.userId
    }).success).toBe(false);
    const parsed = StepUpResponseSchema.parse({
      status: "step_up_complete", csrf_token: CSRF_TOKEN,
      step_up_grant: { token: GRANT_TOKEN, action: "WITHDRAW_SUBSCRIPTION", expires_at: "2026-10-01T00:05:00.000Z" }
    });
    expect(parsed.step_up_grant?.action).toBe("WITHDRAW_SUBSCRIPTION");
  });

  it("hands the purpose to the session service with no run and answers with the grant", async () => {
    const stepUp = vi.fn<SessionApplication["stepUp"]>(async () => ({
      sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN,
      grantToken: GRANT_TOKEN, grantExpiresAt: new Date("2026-10-01T00:05:00.000Z")
    }));
    const api = buildApi({ application: application(), sessions: sessions(stepUp), allowedOrigin: ORIGIN });
    const response = await api.inject({
      method: "POST", url: "/v1/auth/step-up", headers,
      payload: { password: "correct horse battery staple", code: "123456", authorization: { action: "WITHDRAW_SUBSCRIPTION" } }
    });
    expect(response.statusCode).toBe(200);
    expect(stepUp).toHaveBeenCalledOnce();
    expect(stepUp.mock.calls[0]![0].authorization).toEqual({ action: "WITHDRAW_SUBSCRIPTION" });
    expect(response.json().step_up_grant).toEqual({
      token: GRANT_TOKEN, action: "WITHDRAW_SUBSCRIPTION", expires_at: "2026-10-01T00:05:00.000Z"
    });
    await api.close();
  });
});
