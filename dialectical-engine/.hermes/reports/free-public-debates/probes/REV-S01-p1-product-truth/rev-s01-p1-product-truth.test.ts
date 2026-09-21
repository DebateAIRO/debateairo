// PROBE — REV(S01) pass 1, lens product-truth. Written against slice head db4758da
// (base 5b6cc9b1). Built from SPEC-v2 §4 (V's acceptance walk) and V's intake words
// I-1…I-4, never from the author's tests. Copy into <worktree>/tests/unit/ and run:
//   pnpm exec vitest run tests/unit/rev-s01-p1-product-truth.test.ts
// It writes nothing, starts no process and binds no port.
import { describe, expect, it, vi } from "vitest";
import {
  buildApi,
  CSRF_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  type AskApplication
} from "@debateai/api";
import type { Answer } from "@debateai/contract";
import type { AccountErasureApplication } from "../../apps/api/src/account-erasure.js";
import type { PublicationApplication } from "../../apps/api/src/publications.js";
import { PostgresPublicationApplication } from "../../apps/api/src/publications.js";
import type { PublicationCipher } from "../../packages/crypto/src/index.js";
import type { PostgresPublicationRepository } from "../../packages/db/src/publication.js";
import type {
  AuthenticatedSession,
  SessionApplication
} from "../../apps/api/src/sessions.js";

const ORIGIN = "https://app.debateai.test";
const SESSION_TOKEN = "s".repeat(43);
const CSRF_TOKEN = "c".repeat(43);
const GRANT_TOKEN = "g".repeat(43);
const FREE_RUN = "11111111-1111-4111-8111-111111111111";
const FREE_REF = "22222222-2222-4222-8222-222222222222";
const ANSWER_ID = "77777777-7777-4777-8777-777777777777";
const ABSENT_RUN = "99999999-9999-4999-8999-999999999999";
const USER_ID = "66666666-6666-4666-8666-666666666666";
const OWNER_REF = "44444444-4444-4444-8444-444444444444";

const authenticated = Object.freeze({
  session: Object.freeze({
    asker_id: `owner:${OWNER_REF}`,
    session_id: "55555555-5555-4555-8555-555555555555",
    caller_scope: "ASKER" as const,
    ownership_provenance: "server_session" as const,
    provisional_identity_model: false as const
  }),
  userId: USER_ID,
  ownerRef: OWNER_REF,
  tokenHash: "sha256:session",
  csrfTokenHash: "sha256:csrf",
  authKind: "cookie" as const
}) satisfies AuthenticatedSession;

function answer(terminal: Answer["terminal"] = "SERVED"): Answer {
  return {
    answer_id: ANSWER_ID,
    answer_version: 1,
    run_ref: FREE_RUN,
    question_line: "FPD-S01-FREE does a public square need a gatekeeper",
    terminal,
    verdict_state: "SUPPORTED",
    verdict_unavailable: null,
    confidence_band: "moderate",
    band_ceiling: {
      label: "TEST_LAYER_CEILING",
      basis: { LOOKED_UP: 1, RAN: 0, REASONING: 0 },
      register_row_key: "wayOfKnowingCeiling",
      register_version: 1,
      source_ref: "probe:REV-S01-p1-product-truth",
      lift_path: "probe:public"
    },
    answer_form: { kind: "EMPIRICAL" },
    serve_state: "COMPOSED",
    composed_text: [{
      segment_id: "segment:probe", text: "The public square answer.",
      load_bearing: true, served_number_refs: []
    }],
    number_slots: [], abstention: null, shadow_suppressions: [], nodes: [], edges: [],
    badges: [], residual_objections: [], value_hinges: [], condition_marks: [],
    condition_mark_records: [], reversal_point: "Contrary public evidence.",
    builds_on_previous: { value: false, answer_ref: null }, memory_disclosure: null,
    risk_tier: "standard", tier_source: "ASKER",
    tier_provenance_ref: "probe:REV-S01-p1-product-truth",
    cost_envelope: {
      basis: { source_ref: "probe:REV-S01-p1-product-truth" }, state: "WITHIN",
      consumed_model_attempts: 1, protected_core: "NEVER_SKIPPABLE"
    },
    composition_budget_tier: "low", conformance_outcome: "PASS",
    ledger_digest_handle: "ledger:private", inspection_handle: "inspection:private",
    as_of: "2026-09-21T00:00:00.000Z", staleness_state: "FRESH",
    relevant_as_of: "2026-09-21T00:00:00.000Z"
  };
}

function application(overrides: Partial<AskApplication> = {}): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: FREE_RUN, status: "QUEUED" }),
    readAnswer: async () => answer(),
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
    events: async function* () {},
    ...overrides
  } as AskApplication;
}

function sessions(): SessionApplication {
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
    stepUp: async () => ({
      sessionToken: SESSION_TOKEN, csrfToken: CSRF_TOKEN, grantToken: GRANT_TOKEN,
      grantExpiresAt: new Date("2026-09-21T00:05:00.000Z")
    })
  } as SessionApplication;
}

function publications(overrides: Partial<PublicationApplication> = {}): PublicationApplication {
  return {
    reconcileKeyCleanup: async () => 0,
    reconcileKeyProvisionCleanup: async () => 0,
    preflightGrant: async () => true,
    auditPreflightDenial: async () => true,
    readOwnedVisibility: async () => ({ state: "PRIVATE", public_ref: null }),
    publish: async () => ({ state: "PUBLISHED", public_ref: FREE_REF }),
    unpublish: async () => ({ state: "PRIVATE", public_ref: null }),
    readPublicDebate: async () => null,
    list: async () => ({ items: [], total: 0 }),
    ...overrides
  } as PublicationApplication;
}

function erasure(
  outcome: Awaited<ReturnType<AccountErasureApplication["deletePrivateDebate"]>>
): AccountErasureApplication {
  return {
    schedule: async () => null,
    current: async () => ({ state: "NONE" }),
    cancel: async () => true,
    deletePrivateDebate: async () => outcome
  } as unknown as AccountErasureApplication;
}

const cookie = `${SESSION_COOKIE_NAME}=${SESSION_TOKEN}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN}`;
const readHeaders = Object.freeze({ cookie, "user-agent": "rev-s01-product-truth" });
const mutationHeaders = Object.freeze({
  cookie, origin: ORIGIN, "x-csrf-token": CSRF_TOKEN,
  "user-agent": "rev-s01-product-truth"
});

// A repository double that answers the shapes tryAutoPublish calls, and records them.
function repositoryDouble(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const record = <T>(name: string, value: T) => async (...args: unknown[]) => {
    calls.push(`${name}(${String(args[0] ?? "")})`);
    return value;
  };
  const base = {
    runIsFreePublicBound: record("runIsFreePublicBound", true),
    readOwnedVisibility: record("readOwnedVisibility", { state: "PRIVATE", publicRef: null }),
    readAuthorPseudonym: record("readAuthorPseudonym", "public-author"),
    prepareSystemKeyProvision: record("prepareSystemKeyProvision", true),
    abandonSystemKeyProvision: record("abandonSystemKeyProvision", true),
    systemPublish: record("systemPublish", FREE_REF),
    auditSystemPublicationAttempt: record("auditSystemPublicationAttempt", true),
    upsertAutoPublishWork: record("upsertAutoPublishWork", true),
    clearAutoPublishWork: record("clearAutoPublishWork", true),
    claimAutoPublishWork: record("claimAutoPublishWork", []),
    ...overrides
  };
  return { calls, repository: base as unknown as PostgresPublicationRepository };
}

const cipherDouble = {
  create: async () => ({
    encrypt: () => ({ v: 1, ciphertext: "x", nonce: "y", aad: [] }),
    close: () => undefined
  }),
  destroy: async () => undefined,
  exists: async () => false
} as unknown as PublicationCipher;

describe("REV(S01) p1 product-truth — V's words against the built behaviour", () => {
  // SPEC-v2 §4.1 steps 3-5 — the server publishes when the answer is served.
  it("PT-1 fires the auto-publish path from GET /v1/runs/{id}/answer with no publish call", async () => {
    const tryAutoPublish = vi.fn(async () => undefined);
    const publish = vi.fn(async () => ({ state: "PUBLISHED" as const, public_ref: FREE_REF }));
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({ tryAutoPublish, publish })
    });
    const served = await api.inject({
      method: "GET", url: `/v1/runs/${FREE_RUN}/answer`, headers: readHeaders
    });
    expect(served.statusCode).toBe(200);
    expect(tryAutoPublish).toHaveBeenCalledOnce();
    expect(tryAutoPublish.mock.calls[0]?.[0]).toMatchObject({
      runId: FREE_RUN, userId: USER_ID, ownerRef: OWNER_REF
    });
    expect(publish).not.toHaveBeenCalled();
    await api.close();
  });

  // Step 5 / step 12 — the visibility read is byte-exact, two keys.
  it("PT-2 returns exactly two visibility keys unless an auto-publish is outstanding", async () => {
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        readOwnedVisibility: async () => ({ state: "PUBLISHED", public_ref: FREE_REF })
      })
    });
    const published = await api.inject({
      method: "GET", url: `/v1/runs/${FREE_RUN}/visibility`, headers: readHeaders
    });
    expect(published.statusCode).toBe(200);
    expect(published.json()).toEqual({ state: "PUBLISHED", public_ref: FREE_REF });
    await api.close();
    const pendingApi = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        readOwnedVisibility: async () => ({
          state: "PRIVATE", public_ref: null, publish_pending: true
        })
      })
    });
    const pending = await pendingApi.inject({
      method: "GET", url: `/v1/runs/${FREE_RUN}/visibility`, headers: readHeaders
    });
    expect(pending.json()).toEqual({
      state: "PRIVATE", public_ref: null, publish_pending: true
    });
    await pendingApi.close();
  });

  // CHARGE 3 — "an answer that is served through a path other than the hooked route".
  it("PT-3 serves the same Answer at GET /v1/answers/{id} with no auto-publish attempt", async () => {
    const tryAutoPublish = vi.fn(async () => undefined);
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({ tryAutoPublish })
    });
    const byAnswerId = await api.inject({
      method: "GET", url: `/v1/answers/${ANSWER_ID}`, headers: readHeaders
    });
    expect(byAnswerId.statusCode).toBe(200);
    expect(byAnswerId.json().run_ref).toBe(FREE_RUN);
    expect(byAnswerId.json().composed_text[0].text).toBe("The public square answer.");
    expect(tryAutoPublish).not.toHaveBeenCalled();
    await api.close();
  });

  // CHARGE 3 / R-9 — a failure that is not one of the four enumerated reasons
  // leaves the run PRIVATE with nothing outstanding, and the route swallows it.
  it("PT-4 records no outstanding work when the publish attempt throws", async () => {
    const { calls, repository } = repositoryDouble({
      readAuthorPseudonym: async () => { throw new TypeError("TRANSIENT_DB"); }
    });
    const app = new PostgresPublicationApplication(repository, cipherDouble);
    await expect(app.tryAutoPublish({
      runId: FREE_RUN, answer: answer(), userId: USER_ID, ownerRef: OWNER_REF
    })).rejects.toThrow("TRANSIENT_DB");
    expect(calls.filter((call) => call.startsWith("upsertAutoPublishWork"))).toEqual([]);
    expect(calls.filter((call) => call.startsWith("auditSystemPublicationAttempt"))).toEqual([]);

    const tryAutoPublish = vi.fn(async () => { throw new TypeError("TRANSIENT_DB"); });
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({ tryAutoPublish })
    });
    const served = await api.inject({
      method: "GET", url: `/v1/runs/${FREE_RUN}/answer`, headers: readHeaders
    });
    expect(served.statusCode).toBe(200);
    await api.close();
  });

  // CHARGE 3 — the same hole when the publish transition itself raises (0067 RAISE 40001).
  it("PT-5 records no outstanding work when systemPublish raises", async () => {
    const { calls, repository } = repositoryDouble({
      systemPublish: async () => {
        throw new TypeError("SYSTEM_PUBLICATION_KEY_PROVISION_INTENT_INCOMPLETE");
      }
    });
    const app = new PostgresPublicationApplication(repository, cipherDouble);
    await expect(app.tryAutoPublish({
      runId: FREE_RUN, answer: answer(), userId: USER_ID, ownerRef: OWNER_REF
    })).rejects.toThrow("SYSTEM_PUBLICATION_KEY_PROVISION_INTENT_INCOMPLETE");
    expect(calls.filter((call) => call.startsWith("upsertAutoPublishWork"))).toEqual([]);
  });

  // R-9 positive half — an enumerated failure DOES leave an outstanding record.
  it("PT-6 upserts outstanding work when the transition answers null", async () => {
    const { calls, repository } = repositoryDouble({
      systemPublish: async () => null
    });
    const app = new PostgresPublicationApplication(repository, cipherDouble);
    await app.tryAutoPublish({
      runId: FREE_RUN, answer: answer(), userId: USER_ID, ownerRef: OWNER_REF
    });
    expect(calls.filter((call) => call.startsWith("upsertAutoPublishWork")).length).toBe(1);
  });

  // V-1 / R-8 — a BLOCKED answer is not published and is not retried.
  it("PT-7 never publishes a BLOCKED answer and clears its work", async () => {
    const { calls, repository } = repositoryDouble();
    const app = new PostgresPublicationApplication(repository, cipherDouble);
    await app.tryAutoPublish({
      runId: FREE_RUN, answer: answer("BLOCKED"), userId: USER_ID, ownerRef: OWNER_REF
    });
    expect(calls.filter((call) => call.startsWith("systemPublish"))).toEqual([]);
    expect(calls.filter((call) => call.startsWith("upsertAutoPublishWork"))).toEqual([]);
    expect(calls.filter((call) => call.startsWith("clearAutoPublishWork")).length).toBe(1);
    // and it clears before it asks whether the run is bound at all
    expect(calls.filter((call) => call.startsWith("runIsFreePublicBound"))).toEqual([]);
  });

  // I-2 "leave them alone" / R-25 — an unbound run is never touched by the hook.
  it("PT-8 does nothing for a run the predicate calls unbound", async () => {
    const { calls, repository } = repositoryDouble({
      runIsFreePublicBound: async () => false
    });
    const app = new PostgresPublicationApplication(repository, cipherDouble);
    await app.tryAutoPublish({
      runId: FREE_RUN, answer: answer(), userId: USER_ID, ownerRef: OWNER_REF
    });
    // the overridden predicate does not record itself; nothing else may run
    expect(calls).toEqual([]);
  });

  // SPEC-v2 §4.1 steps 7-8 — 409 twice, the grant is never consumed.
  it("PT-9 refuses unpublish on a bound published run twice with the same grant", async () => {
    const unpublish = vi.fn(async () => ({ state: "PRIVATE" as const, public_ref: null }));
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        unpublish,
        readOwnedVisibility: async () => ({ state: "PUBLISHED", public_ref: FREE_REF }),
        isFreePublicBound: async () => true
      })
    });
    for (const attempt of [1, 2]) {
      const refused = await api.inject({
        method: "POST", url: `/v1/runs/${FREE_RUN}/unpublish`, headers: mutationHeaders,
        payload: { step_up_grant: GRANT_TOKEN, copies_may_persist_acknowledged: true }
      });
      expect(refused.statusCode, `attempt ${attempt}`).toBe(409);
      expect(refused.json()).toEqual({ error: "FREE_DEBATE_CANNOT_BE_UNPUBLISHED" });
    }
    expect(unpublish).not.toHaveBeenCalled();
    await api.close();
  });

  // R-13 — a caller who cannot prove the grant learns nothing: byte-identical to a missing run.
  it("PT-10 gives a failed preflight the same 404 face as a run that exists nowhere", async () => {
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        preflightGrant: async () => false,
        readOwnedVisibility: async () => ({ state: "PUBLISHED", public_ref: FREE_REF }),
        isFreePublicBound: async () => true
      })
    });
    const bound = await api.inject({
      method: "POST", url: `/v1/runs/${FREE_RUN}/unpublish`, headers: mutationHeaders,
      payload: { step_up_grant: GRANT_TOKEN, copies_may_persist_acknowledged: true }
    });
    const absent = await api.inject({
      method: "POST", url: `/v1/runs/${ABSENT_RUN}/unpublish`, headers: mutationHeaders,
      payload: { step_up_grant: GRANT_TOKEN, copies_may_persist_acknowledged: true }
    });
    expect(bound.statusCode).toBe(404);
    expect(bound.body).toBe(absent.body);
    await api.close();
  });

  // SPEC-v2 §4.1 step 14 / R-15 / R-25 — Premium unpublish is today's 200.
  it("PT-11 leaves unpublish of an unbound published run at 200 PRIVATE", async () => {
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        readOwnedVisibility: async () => ({ state: "PUBLISHED", public_ref: FREE_REF }),
        isFreePublicBound: async () => false
      })
    });
    const ok = await api.inject({
      method: "POST", url: `/v1/runs/${FREE_RUN}/unpublish`, headers: mutationHeaders,
      payload: { step_up_grant: GRANT_TOKEN, copies_may_persist_acknowledged: true }
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ state: "PRIVATE", public_ref: null });
    await api.close();
  });

  // SPEC-v2 §4.1 step 9 — a second user and an anonymous caller learn nothing.
  it("PT-12 answers 404 NOT_FOUND to a non-owner and 401 SESSION_REQUIRED with no session", async () => {
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications(), accountErasure: erasure("NOT_FOUND")
    });
    const other = await api.inject({
      method: "DELETE", url: `/v1/debates/${FREE_RUN}`, headers: mutationHeaders,
      payload: { step_up_grant: GRANT_TOKEN }
    });
    const absent = await api.inject({
      method: "DELETE", url: `/v1/debates/${ABSENT_RUN}`, headers: mutationHeaders,
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(other.statusCode).toBe(404);
    expect(other.json()).toEqual({ error: "NOT_FOUND" });
    expect(other.body).toBe(absent.body);
    const anonymous = await api.inject({
      method: "DELETE", url: `/v1/debates/${FREE_RUN}`,
      headers: { origin: ORIGIN, "x-csrf-token": CSRF_TOKEN, "user-agent": "rev-s01" },
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: "SESSION_REQUIRED" });
    await api.close();
  });

  // SPEC-v2 §4.1 step 10 — the creator's delete surfaces CLEANED/PENDING, never 409.
  it("PT-13 surfaces 200 CLEANED and 202 PENDING for the creator's delete", async () => {
    for (const [outcome, status, body] of [
      ["CLEANED", 200, { status: "CLEANED" }],
      ["PENDING", 202, { status: "PENDING" }]
    ] as const) {
      const api = buildApi({
        application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
        publications: publications(), accountErasure: erasure(outcome)
      });
      const deleted = await api.inject({
        method: "DELETE", url: `/v1/debates/${FREE_RUN}`, headers: mutationHeaders,
        payload: { step_up_grant: GRANT_TOKEN }
      });
      expect(deleted.statusCode).toBe(status);
      expect(deleted.json()).toEqual(body);
      await api.close();
    }
  });

  // SPEC-v2 §4.1 step 15 / R-19 — a published Premium debate still answers 409.
  it("PT-14 keeps 409 DEBATE_MUST_BE_PRIVATE for a published unbound run", async () => {
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications(), accountErasure: erasure("PUBLISHED")
    });
    const refused = await api.inject({
      method: "DELETE", url: `/v1/debates/${FREE_RUN}`, headers: mutationHeaders,
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: "DEBATE_MUST_BE_PRIVATE" });
    await api.close();
  });

  // CHARGE 3 — the publication layer absent in a deployment: nothing publishes,
  // nothing is queued, and the owner's read says plain PRIVATE.
  it("PT-15 leaves a bound run private and unqueued when publications are unwired", async () => {
    const api = buildApi({ application: application(), sessions: sessions(), allowedOrigin: ORIGIN });
    const served = await api.inject({
      method: "GET", url: `/v1/runs/${FREE_RUN}/answer`, headers: readHeaders
    });
    expect(served.statusCode).toBe(200);
    const visibility = await api.inject({
      method: "GET", url: `/v1/runs/${FREE_RUN}/visibility`, headers: readHeaders
    });
    expect(visibility.statusCode).toBe(404);
    await api.close();
  });

  // CHARGE 3 — the reconciler only ever sees runs that already have a work row.
  it("PT-16 reconciles nothing when the work table is empty", async () => {
    const { calls, repository } = repositoryDouble({ claimAutoPublishWork: async () => [] });
    const app = new PostgresPublicationApplication(repository, cipherDouble);
    expect(await app.reconcileFreePublicAutoPublish()).toBe(0);
    expect(calls.filter((call) => call.startsWith("systemPublish"))).toEqual([]);
  });
});
