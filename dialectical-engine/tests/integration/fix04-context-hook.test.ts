import { describe, expect, it } from "vitest";

import { buildApi, type AskApplication } from "@debateai/api";
import { getObsContext, type ObsContext } from "@debateai/obs-capture";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const SESSION_TOKEN = "a".repeat(43);
const CSRF_TOKEN = "b".repeat(43);
const USER_HEADERS = Object.freeze({
  cookie: `__Host-debateai-session=${SESSION_TOKEN}; __Host-debateai-csrf=${CSRF_TOKEN}`,
});
const USER_MUTATION_HEADERS = Object.freeze({
  ...USER_HEADERS,
  origin: "https://app.debateai.test",
  "x-csrf-token": CSRF_TOKEN,
});

function application(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({
      items: [], open_runs: [], limit, offset, total: 0,
    }),
    readInspection: async () => null,
    readLedgerDigest: async () => ({
      answer_id: RUN_ID,
      run_ref: RUN_ID,
      work_items: [],
      entries: [],
    }),
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] },
      scorecards: [],
      model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" },
    }),
    events: async function* () {},
  };
}

function sessions() {
  const authenticated = Object.freeze({
    session: Object.freeze({
      asker_id: `owner:${RUN_ID}`,
      session_id: SESSION_ID,
      caller_scope: "ASKER" as const,
      ownership_provenance: "server_session" as const,
      provisional_identity_model: false as const,
    }),
    userId: "33333333-3333-4333-8333-333333333333",
    ownerRef: "44444444-4444-4444-8444-444444444444",
    tokenHash: "sha256:test-session",
    csrfTokenHash: "sha256:test-csrf",
    authKind: "cookie" as const,
  });
  return Object.freeze({
    authenticate: async (token: string) => token === SESSION_TOKEN ? authenticated : null,
    verifyCsrf: (_authenticated: unknown, token: string) => token === CSRF_TOKEN,
    beginLogin: async () => ({ status: "mfa_required" as const, challengeToken: "c".repeat(43) }),
    completeLogin: async () => ({
      status: "authenticated" as const,
      sessionToken: SESSION_TOKEN,
      csrfToken: CSRF_TOKEN,
      session: authenticated.session,
    }),
    logout: async () => true,
    listSessions: async () => [],
    revokeSession: async () => true,
    revokeAllSessions: async () => 1,
    stepUp: async () => ({ sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN }),
  });
}

describe("FIX-04 request-scoped observability context", () => {
  it("declares a server-verified run only on the three frozen route templates", async () => {
    const observations: Array<Readonly<{
      routeTemplate: string | undefined;
      context: ObsContext | undefined;
    }>> = [];
    const api = buildApi({
      application: application(),
      sessions: sessions(),
      allowedOrigin: "https://app.debateai.test",
    });
    api.addHook("preHandler", async (request) => {
      observations.push(Object.freeze({
        routeTemplate: request.routeOptions.url,
        context: getObsContext(),
      }));
    });

    const requests = [
      { method: "GET", url: `/v1/runs/${RUN_ID}/events`, headers: USER_HEADERS },
      { method: "GET", url: `/v1/runs/${RUN_ID}`, headers: USER_HEADERS },
      { method: "GET", url: `/v1/runs/${RUN_ID}/answer`, headers: USER_HEADERS },
      { method: "GET", url: `/v1/runs/not-a-uuid`, headers: USER_HEADERS },
      { method: "GET", url: `/v1/answers/${RUN_ID}`, headers: USER_HEADERS },
      { method: "GET", url: "/v1/answers?limit=1&offset=0", headers: USER_HEADERS },
      { method: "GET", url: "/v1/session", headers: USER_HEADERS },
      {
        method: "POST",
        url: "/v1/auth/login",
        headers: { origin: "https://app.debateai.test" },
        payload: {},
      },
      {
        method: "DELETE",
        url: `/v1/auth/sessions/${SESSION_ID}`,
        headers: USER_MUTATION_HEADERS,
      },
      { method: "GET", url: "/v1/account/erasure", headers: USER_HEADERS },
    ] as const;

    for (const request of requests) await api.inject(request);

    expect(observations).toHaveLength(requests.length);
    const runTemplates = new Set([
      "/v1/runs/:id/events",
      "/v1/runs/:id",
      "/v1/runs/:id/answer",
    ]);
    for (const [index, observation] of observations.entries()) {
      expect(observation.context).toBeDefined();
      if (
        index < 3
        && observation.routeTemplate !== undefined
        && runTemplates.has(observation.routeTemplate)
      ) {
        expect(observation.context).toEqual({
          run_ref: { kind: "run", value: RUN_ID },
        });
      } else {
        expect(observation.context).toEqual({});
      }
    }
    await api.close();
  });
});
