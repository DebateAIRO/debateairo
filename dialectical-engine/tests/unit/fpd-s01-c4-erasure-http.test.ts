import { describe, expect, it, vi } from "vitest";
import {
  buildApi,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type AskApplication
} from "@debateai/api";
import type { AccountErasureApplication } from "../../apps/api/src/account-erasure.js";
import type {
  AuthenticatedSession,
  SessionApplication
} from "../../apps/api/src/sessions.js";

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
  tokenHash: "sha256:session",
  csrfTokenHash: "sha256:csrf",
  authKind: "cookie" as const
}) satisfies AuthenticatedSession;

function application(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({
      items: [], open_runs: [], limit, offset, total: 0
    }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] },
      scorecards: [],
      model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function*() {}
  };
}

function sessions(): SessionApplication {
  return {
    authenticate: async (token) => token === SESSION_TOKEN ? authenticated : null,
    verifyCsrf: (_session, token) => token === CSRF_TOKEN,
    beginLogin: async () => ({ status: "mfa_required", challengeToken: "m".repeat(43) }),
    completeLogin: async () => ({
      status: "authenticated",
      sessionToken: SESSION_TOKEN,
      csrfToken: CSRF_TOKEN,
      session: authenticated.session
    }),
    logout: async () => true,
    listSessions: async () => [],
    revokeSession: async () => true,
    revokeAllSessions: async () => 1,
    stepUp: async () => ({ sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN })
  };
}

function erasure(
  outcome: Awaited<ReturnType<AccountErasureApplication["deletePrivateDebate"]>> = "CLEANED"
): AccountErasureApplication {
  return {
    schedule: async () => ({
      status: "SCHEDULED",
      executeAt: new Date("2026-08-31T00:00:00.000Z"),
      cancellationRef: "55555555-5555-4555-8555-555555555555"
    }),
    current: async () => ({ status: "NONE" }),
    cancel: async () => false,
    deletePrivateDebate: async () => outcome
  };
}

const cookie = `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`;
const headers = Object.freeze({
  cookie,
  origin: ORIGIN,
  "x-csrf-token": CSRF_TOKEN,
  "user-agent": "fpd-s01-c4-test-browser"
});

describe("S01-C4 published-run erasure HTTP boundary", () => {
  it("rejects a caller with no session before looking up the run", async () => {
    // PROPERTY: authentication precedes private-debate lookup.
    // CATCHES: routing an unauthenticated delete into account erasure.
    // NEIGHBOUR: an authenticated owner reaches the typed outcome mapping.
    const deletePrivateDebate = vi.fn<AccountErasureApplication["deletePrivateDebate"]>();
    const api = buildApi({
      application: application(),
      sessions: sessions(),
      accountErasure: { ...erasure(), deletePrivateDebate },
      allowedOrigin: ORIGIN
    });
    const response = await api.inject({
      method: "DELETE",
      url: `/v1/debates/${RUN_ID}`,
      headers: { origin: ORIGIN, "x-csrf-token": CSRF_TOKEN },
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "SESSION_REQUIRED" });
    expect(deletePrivateDebate).not.toHaveBeenCalled();
    await api.close();
  });

  it("rejects a signed-in request that fails CSRF validation", async () => {
    // PROPERTY: origin and CSRF validation precede deletion.
    // CATCHES: accepting a cookie-authenticated cross-site delete.
    // NEIGHBOUR: the same cookie with the matching token reaches the route.
    const deletePrivateDebate = vi.fn<AccountErasureApplication["deletePrivateDebate"]>();
    const api = buildApi({
      application: application(), sessions: sessions(),
      accountErasure: { ...erasure(), deletePrivateDebate }, allowedOrigin: ORIGIN
    });
    const response = await api.inject({
      method: "DELETE", url: `/v1/debates/${RUN_ID}`,
      headers: { cookie, origin: ORIGIN }, payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "CSRF_VALIDATION_FAILED" });
    expect(deletePrivateDebate).not.toHaveBeenCalled();
    await api.close();
  });

  it("rejects an extra deletion-body key", async () => {
    // PROPERTY: the private-debate deletion body is strict.
    // CATCHES: forwarding unrecognized request data to the erasure boundary.
    // NEIGHBOUR: the exact one-key body is accepted.
    const deletePrivateDebate = vi.fn<AccountErasureApplication["deletePrivateDebate"]>();
    const api = buildApi({
      application: application(), sessions: sessions(),
      accountErasure: { ...erasure(), deletePrivateDebate }, allowedOrigin: ORIGIN
    });
    const response = await api.inject({
      method: "DELETE", url: `/v1/debates/${RUN_ID}`, headers,
      payload: { step_up_grant: GRANT_TOKEN, extra: true }
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MALFORMED_REQUEST" });
    expect(deletePrivateDebate).not.toHaveBeenCalled();
    await api.close();
  });

  it("returns the typed unavailable response when account erasure is not configured", async () => {
    // PROPERTY: a missing erasure application is an explicit service failure.
    // CATCHES: treating missing configuration as a successful deletion.
    // NEIGHBOUR: a configured application returns its typed result.
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN
    });
    const response = await api.inject({
      method: "DELETE", url: `/v1/debates/${RUN_ID}`, headers,
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "ACCOUNT_ERASURE_UNAVAILABLE" });
    await api.close();
  });

  it("keeps a second signed-in user opaque as NOT_FOUND", async () => {
    // PROPERTY: SQL ownership refusal remains opaque at HTTP.
    // CATCHES: revealing that another user's run exists.
    // NEIGHBOUR: the creator's successful outcome remains distinguishable.
    const deletePrivateDebate = vi.fn<AccountErasureApplication["deletePrivateDebate"]>(
      async () => "NOT_FOUND"
    );
    const api = buildApi({
      application: application(), sessions: sessions(),
      accountErasure: { ...erasure(), deletePrivateDebate }, allowedOrigin: ORIGIN
    });
    const response = await api.inject({
      method: "DELETE", url: `/v1/debates/${RUN_ID}`, headers,
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "NOT_FOUND" });
    await api.close();
  });

  it("maps a completed bound-public deletion to CLEANED", async () => {
    // PROPERTY: a successful erasure remains the existing 200 CLEANED response.
    // CATCHES: retaining the published-only 409 after SQL admits the bound run.
    // NEIGHBOUR: incomplete cleanup remains PENDING.
    const api = buildApi({
      application: application(), sessions: sessions(),
      accountErasure: erasure("CLEANED"), allowedOrigin: ORIGIN
    });
    const response = await api.inject({
      method: "DELETE", url: `/v1/debates/${RUN_ID}`, headers,
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "CLEANED" });
    await api.close();
  });

  it("maps an admitted deletion with outstanding cleanup to PENDING", async () => {
    // PROPERTY: admitted asynchronous cleanup keeps the existing 202 response.
    // CATCHES: converting a typed pending result into a published-only conflict.
    // NEIGHBOUR: completed cleanup returns 200.
    const api = buildApi({
      application: application(), sessions: sessions(),
      accountErasure: erasure("PENDING"), allowedOrigin: ORIGIN
    });
    const response = await api.inject({
      method: "DELETE", url: `/v1/debates/${RUN_ID}`, headers,
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual({ status: "PENDING" });
    await api.close();
  });

  it("keeps an unbound published run at DEBATE_MUST_BE_PRIVATE", async () => {
    // PROPERTY: only the bound-public SQL carve-out can escape the published conflict.
    // CATCHES: making every published run deletable.
    // NEIGHBOUR: CLEANED and PENDING retain their success mappings.
    const api = buildApi({
      application: application(), sessions: sessions(),
      accountErasure: erasure("PUBLISHED"), allowedOrigin: ORIGIN
    });
    const response = await api.inject({
      method: "DELETE", url: `/v1/debates/${RUN_ID}`, headers,
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "DEBATE_MUST_BE_PRIVATE" });
    await api.close();
  });
});
