import { describe, expect, it, vi } from "vitest";
import {
  buildApi,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type AskApplication
} from "@debateai/api";
import type { Answer, PublicDebate } from "@debateai/contract";
import type { PublicationApplication } from "../../apps/api/src/publications.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { PublicationCipher } from "../../packages/crypto/src/index.js";
import { PostgresPublicationRepository } from "../../packages/db/src/publication.js";
import type {
  AuthenticatedSession,
  SessionApplication
} from "../../apps/api/src/sessions.js";

const ORIGIN = "https://app.debateai.test";
const SESSION_TOKEN = "s".repeat(43);
const CSRF_TOKEN = "c".repeat(43);
const GRANT_TOKEN = "g".repeat(43);
const RUN_ID = "11111111-1111-4111-8111-111111111111";
const PUBLIC_REF = "22222222-2222-4222-8222-222222222222";
const MISSING_REF = "33333333-3333-4333-8333-333333333333";

const authenticated = Object.freeze({
  session: Object.freeze({
    asker_id: "owner:44444444-4444-4444-8444-444444444444",
    session_id: "55555555-5555-4555-8555-555555555555",
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  }),
  userId: "66666666-6666-4666-8666-666666666666",
  ownerRef: "44444444-4444-4444-8444-444444444444",
  tokenHash: "sha256:session",
  csrfTokenHash: "sha256:csrf",
  authKind: "cookie" as const
}) satisfies AuthenticatedSession;

const publicDebate: PublicDebate = {
  public_ref: PUBLIC_REF,
  author_pseudonym: "public-author",
  question: "What may be public?",
  published_at: "2026-08-24T00:00:00.000Z",
  answer: {
    terminal: "SERVED" as const,
    verdict: "SUPPORTED" as const,
    verdict_available: true,
    confidence_band: "moderate",
    summary_segments: [{ text: "Only the strict public summary." }],
    badges: [],
    residual_objections: [],
    reversal_point: "Contrary public evidence.",
    as_of: "2026-08-24T00:00:00.000Z"
  }
};

function answer(): Answer {
  return {
    answer_id: "answer:s8",
    answer_version: 1,
    run_ref: RUN_ID,
    question_line: "What may be public?",
    terminal: "SERVED",
    verdict_state: "SUPPORTED",
    verdict_unavailable: null,
    confidence_band: "moderate",
    band_ceiling: {
      label: "TEST_LAYER_CEILING",
      basis: { LOOKED_UP: 1, RAN: 0, REASONING: 0 },
      register_row_key: "wayOfKnowingCeiling",
      register_version: 1,
      source_ref: "test:S8",
      lift_path: "test:public"
    },
    answer_form: { kind: "EMPIRICAL" },
    serve_state: "COMPOSED",
    composed_text: [{
      segment_id: "segment:s8", text: "Only the strict public summary.",
      load_bearing: true, served_number_refs: []
    }],
    number_slots: [], abstention: null, shadow_suppressions: [], nodes: [], edges: [],
    badges: [], residual_objections: [], value_hinges: [], condition_marks: [],
    condition_mark_records: [], reversal_point: "Contrary public evidence.",
    builds_on_previous: { value: false, answer_ref: null }, memory_disclosure: null,
    risk_tier: "standard", tier_source: "ASKER", tier_provenance_ref: "test:S8",
    cost_envelope: {
      basis: { source_ref: "test:S8" }, state: "WITHIN",
      consumed_model_attempts: 1, protected_core: "NEVER_SKIPPABLE"
    },
    composition_budget_tier: "low", conformance_outcome: "PASS",
    ledger_digest_handle: "ledger:private", inspection_handle: "inspection:private",
    as_of: "2026-08-24T00:00:00.000Z", staleness_state: "FRESH",
    relevant_as_of: "2026-08-24T00:00:00.000Z"
  };
}

function application(): AskApplication {
  return {
    withContentLease: async (_runId,use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => answer(),
    readRun: async (runId) => ({
      run_ref: runId, question_line: "Owned run", state: "SETTLED",
      terminal_reason: null, hold_until: null
    }),
    readAnswerIndex: async (_session, limit, offset) => ({
      items: [], open_runs: [], limit, offset, total: 0
    }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

function sessions(stepUp = vi.fn<SessionApplication["stepUp"]>(async () => ({
  sessionToken: SESSION_TOKEN,
  csrfToken: CSRF_TOKEN,
  grantToken: GRANT_TOKEN,
  grantExpiresAt: new Date("2026-08-24T00:05:00.000Z")
}))): SessionApplication {
  return {
    authenticate: async (token) => token === SESSION_TOKEN ? authenticated : null,
    verifyCsrf: (_session, token) => token === CSRF_TOKEN,
    beginLogin: async () => ({ status: "mfa_required", challengeToken: "m".repeat(43) }),
    completeLogin: async () => ({
      status: "authenticated", sessionToken: SESSION_TOKEN,
      csrfToken: CSRF_TOKEN, session: authenticated.session
    }),
    logout: async () => true,
    listSessions: async () => [],
    revokeSession: async () => true,
    revokeAllSessions: async () => 1,
    stepUp
  };
}

function publications(overrides: Partial<PublicationApplication> = {}): PublicationApplication {
  return {
    reconcileKeyCleanup: async () => 0,
    reconcileKeyProvisionCleanup: async () => 0,
    preflightGrant: async () => true,
    auditPreflightDenial: async () => true,
    readOwnedVisibility: async () => ({ state: "PRIVATE", public_ref: null }),
    publish: async () => ({ state: "PUBLISHED", public_ref: PUBLIC_REF }),
    unpublish: async () => ({ state: "PRIVATE", public_ref: null }),
    readPublicDebate: async (publicationRef) => publicationRef === PUBLIC_REF ? publicDebate : null,
    list: async () => ({
      items: [{
        public_ref: PUBLIC_REF, author_pseudonym: publicDebate.author_pseudonym,
        question: publicDebate.question, published_at: publicDebate.published_at,
        verdict: publicDebate.answer.verdict, confidence_band: publicDebate.answer.confidence_band
      }],
      total: 1
    }),
    ...overrides
  };
}

const cookie = `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`;
const mutationHeaders = Object.freeze({
  cookie,
  origin: ORIGIN,
  "x-csrf-token": CSRF_TOKEN,
  "user-agent": "s8-test-browser"
});

describe("S8 publication HTTP boundary", () => {
  it("serves only the strict public projection and gives every absent public ref the same face", async () => {
    const api = buildApi({ application: application(), publications: publications() });
    const visible = await api.inject({ method: "GET", url: `/v1/public/debates/${PUBLIC_REF}` });
    expect(visible.statusCode).toBe(200);
    expect(visible.json()).toEqual(publicDebate);
    const serialized = visible.body;
    for (const forbidden of ["owner_ref", "run_ref", "memory_disclosure", "inspection:private", "ledger:private"]) {
      expect(serialized).not.toContain(forbidden);
    }
    for (const ref of [MISSING_REF, "not-a-uuid"]) {
      const absent = await api.inject({ method: "GET", url: `/v1/public/debates/${ref}` });
      expect(absent.statusCode).toBe(404);
      expect(absent.json()).toEqual({ error: "DEBATE_NOT_FOUND" });
    }
    await api.close();
  });

  it("keeps publication private without exact CSRF and affirmative warning consent", async () => {
    const publish = vi.fn<PublicationApplication["publish"]>(async () => ({
      state: "PUBLISHED", public_ref: PUBLIC_REF
    }));
    const api = buildApi({
      application: application(), sessions: sessions(), publications: publications({ publish }),
      allowedOrigin: ORIGIN
    });
    const request = (headers: Record<string, string>, warning_acknowledged: boolean) => api.inject({
      method: "POST", url: `/v1/runs/${RUN_ID}/publish`, headers,
      payload: { step_up_grant: GRANT_TOKEN, warning_acknowledged }
    });
    expect((await request({ cookie, "user-agent": "s8-test-browser" }, true)).statusCode).toBe(403);
    expect((await request(mutationHeaders, false)).statusCode).toBe(400);
    expect(publish).not.toHaveBeenCalled();
    const accepted = await request(mutationHeaders, true);
    expect(accepted.statusCode).toBe(201);
    expect(accepted.json()).toEqual({ state: "PUBLISHED", public_ref: PUBLIC_REF });
    expect(publish).toHaveBeenCalledOnce();
    await api.close();
  });

  it("audits authenticated invalid grants before private S6 reads, corpus key I/O, or audit KDF work", async () => {
    const privateS6Read = vi.fn<AskApplication["readRunAnswer"]>(async () => answer());
    const privateRunRead = vi.fn<AskApplication["readRun"]>(async (runId) => ({
      run_ref: runId, question_line: "Owned run", state: "SETTLED",
      terminal_reason: null, hold_until: null
    }));
    const app = application();
    app.readRunAnswer = privateS6Read;
    app.readRun = privateRunRead;
    const corpusKeyCreate = vi.fn();
    const corpusKeyDestroy = vi.fn();
    const auditIpKdf = vi.fn();
    const auditUserAgentKdf = vi.fn();
    const query = vi.fn(async (statement: string, values?: readonly unknown[]) => {
      if (statement.includes("identity.publication_grant_is_live")) {
        return { rows: [{ live: false }] };
      }
      if (statement.includes("identity.reserve_publication_event_refs")) {
        return { rows: [{
          reservation_id: "88888888-8888-4888-8888-888888888888",
          visibility_event_id: null,
          visibility_actor_ref: null,
          audit_id: "99999999-9999-4999-8999-999999999999",
          audit_actor_ref: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          audit_target_ref: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          denied_audit_id: null,
          denied_audit_actor_ref: null,
          denied_audit_target_ref: null
        }] };
      }
      if (statement.includes("FROM identity.\"user\" AS identity_user")) {
        return { rows: [{
          audit_token: "77777777-7777-4777-8777-777777777777",
          this_hash: null
        }] };
      }
      if (statement.includes("identity.audit_publication_preflight_denial")) {
        return { rows: [{ appended: true }], values };
      }
      throw new Error(`UNEXPECTED_QUERY:${statement}`);
    });
    const repository = new PostgresPublicationRepository(
      { query } as never,
      { hashSourceIp: auditIpKdf, hashUserAgent: auditUserAgentKdf } as never
    );
    const publication = new PostgresPublicationApplication(
      repository,
      { create: corpusKeyCreate, destroy: corpusKeyDestroy } as unknown as PublicationCipher
    );
    const api = buildApi({
      application: app,
      sessions: sessions(),
      publications: publication,
      allowedOrigin: ORIGIN
    });
    for (const attempt of [
      { label: "random", method: "publish", token: "r".repeat(43) },
      { label: "expired", method: "publish", token: "e".repeat(43) },
      { label: "wrong-action", method: "unpublish", token: "w".repeat(43) }
    ] as const) {
      const response = await api.inject({
        method: "POST", url: `/v1/runs/${RUN_ID}/${attempt.method}`, headers: mutationHeaders,
        payload: attempt.method === "publish"
          ? { step_up_grant: attempt.token, warning_acknowledged: true }
          : { step_up_grant: attempt.token, copies_may_persist_acknowledged: true }
      });
      expect(response.statusCode, attempt.label).toBe(404);
      expect(response.json()).toEqual({ error: "RUN_NOT_FOUND" });
    }
    expect(privateS6Read).not.toHaveBeenCalled();
    expect(privateRunRead).not.toHaveBeenCalled();
    expect(corpusKeyCreate).not.toHaveBeenCalled();
    expect(corpusKeyDestroy).not.toHaveBeenCalled();
    expect(auditIpKdf).not.toHaveBeenCalled();
    expect(auditUserAgentKdf).not.toHaveBeenCalled();
    const denialCalls = query.mock.calls.filter(([statement]) =>
      statement.includes("identity.audit_publication_preflight_denial")
    );
    expect(denialCalls).toHaveLength(3);
    for (const [, values] of denialCalls) {
      expect(values).toHaveLength(5);
      expect(JSON.stringify(values)).not.toContain(RUN_ID);
      expect(JSON.stringify(values)).not.toContain("s8-test-browser");
    }
    const unauthenticated = await api.inject({
      method: "POST", url: `/v1/runs/${RUN_ID}/publish`,
      headers: { origin: ORIGIN, "user-agent": "s8-test-browser" },
      payload: { step_up_grant: "u".repeat(43), warning_acknowledged: true }
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(query.mock.calls.filter(([statement]) =>
      statement.includes("identity.audit_publication_preflight_denial")
    )).toHaveLength(3);
    await api.close();
  });

  it("mints an action/target-bound grant after MFA without asking the publication layer about the target", async () => {
    const stepUp = vi.fn<SessionApplication["stepUp"]>(async () => ({
      sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN,
      grantToken: GRANT_TOKEN, grantExpiresAt: new Date("2026-08-24T00:05:00.000Z")
    }));
    const targetProbe = vi.fn<PublicationApplication["readOwnedVisibility"]>();
    const api = buildApi({
      application: application(), sessions: sessions(stepUp),
      publications: publications({ readOwnedVisibility: targetProbe }), allowedOrigin: ORIGIN
    });
    const response = await api.inject({
      method: "POST", url: "/v1/auth/step-up", headers: mutationHeaders,
      payload: {
        password: "correct horse battery staple", code: "123456",
        authorization: { action: "PUBLISH", target_run_id: MISSING_REF }
      }
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().step_up_grant).toMatchObject({
      token: GRANT_TOKEN, action: "PUBLISH", target_run_id: MISSING_REF
    });
    expect(stepUp).toHaveBeenCalledWith(expect.objectContaining({
      authorization: { action: "PUBLISH", targetRunId: MISSING_REF }
    }), expect.anything());
    expect(targetProbe).not.toHaveBeenCalled();
    await api.close();
  });
});
