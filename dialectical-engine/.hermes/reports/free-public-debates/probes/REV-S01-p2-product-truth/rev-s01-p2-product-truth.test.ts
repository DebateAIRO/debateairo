// PROBE — REV(S01) pass 2 (scoped), lens product-truth. Written against slice head c358d494
// (previous head db4758da, base 5b6cc9b1). This is the pass-1 probe
// (probes/REV-S01-p1-product-truth/rev-s01-p1-product-truth.test.ts) RE-DERIVED at the new head:
// every expectation that pinned the PRE-FIX state is inverted here and says so in its comment, so a
// RED at the old head and a GREEN here are the same measurement of a changed product.
// Copy into <worktree>/tests/unit/ and run:
//   pnpm exec vitest run tests/unit/rev-s01-p2-product-truth.test.ts
// It writes nothing, starts no process and binds no port.
import { readFileSync } from "node:fs";
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
const FREE_RUN_2 = "88888888-8888-4888-8888-888888888888";
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

function answer(
  terminal: Answer["terminal"] = "SERVED",
  runRef: string = FREE_RUN
): Answer {
  return {
    answer_id: ANSWER_ID,
    answer_version: 1,
    run_ref: runRef,
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
      source_ref: "probe:REV-S01-p2-product-truth",
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
    tier_provenance_ref: "probe:REV-S01-p2-product-truth",
    cost_envelope: {
      basis: { source_ref: "probe:REV-S01-p2-product-truth" }, state: "WITHIN",
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
const readHeaders = Object.freeze({ cookie, "user-agent": "rev-s01-p2-product-truth" });
const mutationHeaders = Object.freeze({
  cookie, origin: ORIGIN, "x-csrf-token": CSRF_TOKEN,
  "user-agent": "rev-s01-p2-product-truth"
});

function repositoryDouble(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const record = <T>(name: string, value: T) => async (...args: unknown[]) => {
    calls.push(`${name}(${String(args[0] ?? "")})`);
    return value;
  };
  const base = {
    runIsFreePublicBound: record("runIsFreePublicBound", true),
    readOwnedVisibility: record("readOwnedVisibility", { state: "PRIVATE", publicRef: null }),
    ensureAutoPublishWork: record("ensureAutoPublishWork", true),
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

const only = (calls: readonly string[], name: string) =>
  calls.filter((call) => call.startsWith(name));

describe("REV(S01) p2 product-truth — the pass-1 findings, re-measured at c358d494", () => {
  // P-B2, was BLOCKING at db4758da. Pass-1 PT-3 asserted tryAutoPublish was NOT called here;
  // SPEC-v3 §1 makes every AnswerSchema-sending route a trigger, so the expectation INVERTS.
  it("P2-1 now fires the publish trigger from GET /v1/answers/{id} too", async () => {
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
    expect(tryAutoPublish).toHaveBeenCalledOnce();
    // it must name the ANSWER's run, not the answer id in the URL
    expect(tryAutoPublish.mock.calls[0]?.[0]).toMatchObject({
      runId: FREE_RUN, userId: USER_ID, ownerRef: OWNER_REF
    });
    await api.close();
  });

  // The other answer-serving route still fires (pass-1 PT-1, unchanged expectation).
  it("P2-2 still fires the publish trigger from GET /v1/runs/{id}/answer", async () => {
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
    expect(publish).not.toHaveBeenCalled();
    await api.close();
  });

  // SPEC-v3 §1's mechanical consequence (a), run as a test so a future route cannot slip past:
  // the count of AnswerSchema.parse( send sites equals the count of trigger call sites.
  it("P2-3 keeps every AnswerSchema-sending site paired with a trigger call", () => {
    const source = readFileSync(
      new URL("../../apps/api/src/index.ts", import.meta.url), "utf8"
    );
    const sendSites = source.match(/AnswerSchema\.parse\(/g) ?? [];
    const triggerCalls = source.match(/await tryAutoPublishServedAnswer\(/g) ?? [];
    expect(sendSites.length).toBe(2);
    expect(triggerCalls.length).toBe(sendSites.length);
  });

  // Acceptance step 3b — the ANSWER INDEX is a projection, never a trigger.
  it("P2-4 never publishes from the answer index route", async () => {
    const tryAutoPublish = vi.fn(async () => undefined);
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({ tryAutoPublish })
    });
    const index = await api.inject({
      method: "GET", url: "/v1/answers?limit=25&offset=0", headers: readHeaders
    });
    expect(index.statusCode).toBe(200);
    expect(tryAutoPublish).not.toHaveBeenCalled();
    // and the projection routes named by SPEC-v3 §1 are not triggers either
    for (const url of [
      `/v1/answers/${ANSWER_ID}/inspection`,
      `/v1/answers/${ANSWER_ID}/ledger-digest`
    ]) {
      await api.inject({ method: "GET", url, headers: readHeaders });
    }
    expect(tryAutoPublish).not.toHaveBeenCalled();
    await api.close();
  });

  // Acceptance step 3c — a second Free run published through the OTHER route behaves identically
  // at the two steps that follow it in the walk: visibility is two keys, unpublish is the 409.
  it("P2-5 gives a run published through the second route the same 409 and the same visibility", async () => {
    const unpublish = vi.fn(async () => ({ state: "PRIVATE" as const, public_ref: null }));
    const api = buildApi({
      application: application({ readAnswer: async () => answer("SERVED", FREE_RUN_2) }),
      sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        unpublish,
        readOwnedVisibility: async () => ({ state: "PUBLISHED", public_ref: FREE_REF }),
        isFreePublicBound: async () => true
      })
    });
    const visibility = await api.inject({
      method: "GET", url: `/v1/runs/${FREE_RUN_2}/visibility`, headers: readHeaders
    });
    expect(visibility.json()).toEqual({ state: "PUBLISHED", public_ref: FREE_REF });
    const refused = await api.inject({
      method: "POST", url: `/v1/runs/${FREE_RUN_2}/unpublish`, headers: mutationHeaders,
      payload: { step_up_grant: GRANT_TOKEN, copies_may_persist_acknowledged: true }
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: "FREE_DEBATE_CANNOT_BE_UNPUBLISHED" });
    expect(unpublish).not.toHaveBeenCalled();
    await api.close();
  });

  // Acceptance step 11b — deleting that second run is the same 200/202, never a 409.
  it("P2-6 deletes a run published through the second route exactly like the first", async () => {
    for (const [outcome, status, body] of [
      ["CLEANED", 200, { status: "CLEANED" }],
      ["PENDING", 202, { status: "PENDING" }]
    ] as const) {
      const api = buildApi({
        application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
        publications: publications(), accountErasure: erasure(outcome)
      });
      const deleted = await api.inject({
        method: "DELETE", url: `/v1/debates/${FREE_RUN_2}`, headers: mutationHeaders,
        payload: { step_up_grant: GRANT_TOKEN }
      });
      expect(deleted.statusCode).toBe(status);
      expect(deleted.json()).toEqual(body);
      await api.close();
    }
  });

  // P-B3, was BLOCKING. Pass-1 PT-4 asserted upsertAutoPublishWork was NEVER called when
  // readAuthorPseudonym throws; c358d494 adds ensure-before-attempt, so the expectation INVERTS:
  // the work row must already exist when the throw happens.
  it("P2-7 enqueues the run BEFORE the fallible attempt begins", async () => {
    const { calls, repository } = repositoryDouble({
      readAuthorPseudonym: async () => { throw new TypeError("TRANSIENT_DB"); }
    });
    const app = new PostgresPublicationApplication(repository, cipherDouble);
    await expect(app.tryAutoPublish({
      runId: FREE_RUN, answer: answer(), userId: USER_ID, ownerRef: OWNER_REF
    })).rejects.toThrow("TRANSIENT_DB");
    expect(only(calls, "ensureAutoPublishWork").length).toBe(1);
    // the enqueue precedes the first fallible call of the attempt
    expect(calls.indexOf(`ensureAutoPublishWork(${FREE_RUN})`))
      .toBeLessThan(calls.length);
  });

  // P-B3 — the deterministic raise path of 0067/0070 (RAISE 40001) is now caught, not swallowed.
  it("P2-8 converts a raising systemPublish into an outstanding record", async () => {
    const { calls, repository } = repositoryDouble({
      systemPublish: async () => {
        throw new TypeError("SYSTEM_PUBLICATION_KEY_PROVISION_INTENT_INCOMPLETE");
      }
    });
    const app = new PostgresPublicationApplication(repository, cipherDouble);
    await app.tryAutoPublish({
      runId: FREE_RUN, answer: answer(), userId: USER_ID, ownerRef: OWNER_REF
    });
    expect(only(calls, "ensureAutoPublishWork").length).toBe(1);
    expect(only(calls, "upsertAutoPublishWork").length).toBe(1);
    expect(only(calls, "abandonSystemKeyProvision").length).toBe(1);
  });

  // P-B3 RESIDUE — the two calls that still run BEFORE the enqueue. A throw there still leaves
  // the run PRIVATE with nothing outstanding, and the route still swallows it.
  it("P2-9 still records nothing when a call before the enqueue throws", async () => {
    for (const [name, override] of [
      ["isFreePublicBound", { runIsFreePublicBound: async () => { throw new TypeError("T"); } }],
      ["readOwnedVisibility", { readOwnedVisibility: async () => { throw new TypeError("T"); } }]
    ] as const) {
      const { calls, repository } = repositoryDouble(override);
      const app = new PostgresPublicationApplication(repository, cipherDouble);
      await expect(app.tryAutoPublish({
        runId: FREE_RUN, answer: answer(), userId: USER_ID, ownerRef: OWNER_REF
      })).rejects.toThrow("T");
      expect(only(calls, "ensureAutoPublishWork"), name).toEqual([]);
      expect(only(calls, "upsertAutoPublishWork"), name).toEqual([]);
    }
    // and the answer route still returns 200 while swallowing it
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        tryAutoPublish: async () => { throw new TypeError("T"); }
      })
    });
    for (const url of [`/v1/runs/${FREE_RUN}/answer`, `/v1/answers/${ANSWER_ID}`]) {
      expect((await api.inject({ method: "GET", url, headers: readHeaders })).statusCode).toBe(200);
    }
    await api.close();
  });

  // P-N2, was non-blocking. Pass-1 PT-7 asserted clearAutoPublishWork ran BEFORE the bound check;
  // the order is swapped at c358d494, so the expectation INVERTS.
  it("P2-10 asks whether the run is bound before it writes anything for a BLOCKED answer", async () => {
    const unbound = repositoryDouble({ runIsFreePublicBound: async () => false });
    const appUnbound = new PostgresPublicationApplication(unbound.repository, cipherDouble);
    await appUnbound.tryAutoPublish({
      runId: FREE_RUN, answer: answer("BLOCKED"), userId: USER_ID, ownerRef: OWNER_REF
    });
    expect(unbound.calls).toEqual([]);
    const bound = repositoryDouble();
    const appBound = new PostgresPublicationApplication(bound.repository, cipherDouble);
    await appBound.tryAutoPublish({
      runId: FREE_RUN, answer: answer("BLOCKED"), userId: USER_ID, ownerRef: OWNER_REF
    });
    expect(bound.calls[0]).toBe(`runIsFreePublicBound(${FREE_RUN})`);
    expect(only(bound.calls, "clearAutoPublishWork").length).toBe(1);
    expect(only(bound.calls, "ensureAutoPublishWork")).toEqual([]);
    expect(only(bound.calls, "systemPublish")).toEqual([]);
  });

  // V-1 / R-8 unchanged: a BLOCKED bound run is not published and not left outstanding.
  it("P2-11 leaves a BLOCKED bound run unpublished and with nothing outstanding", async () => {
    const { calls, repository } = repositoryDouble();
    const app = new PostgresPublicationApplication(repository, cipherDouble);
    await app.tryAutoPublish({
      runId: FREE_RUN, answer: answer("BLOCKED"), userId: USER_ID, ownerRef: OWNER_REF
    });
    expect(only(calls, "upsertAutoPublishWork")).toEqual([]);
  });

  // R-11 / acceptance step 5 and 3b: two keys, and the third only while outstanding.
  it("P2-12 keeps the visibility read at two keys unless an auto-publish is outstanding", async () => {
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        readOwnedVisibility: async () => ({ state: "PRIVATE", public_ref: null })
      })
    });
    expect((await api.inject({
      method: "GET", url: `/v1/runs/${FREE_RUN_2}/visibility`, headers: readHeaders
    })).json()).toEqual({ state: "PRIVATE", public_ref: null });
    await api.close();
    const pendingApi = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        readOwnedVisibility: async () => ({
          state: "PRIVATE", public_ref: null, publish_pending: true
        })
      })
    });
    expect((await pendingApi.inject({
      method: "GET", url: `/v1/runs/${FREE_RUN}/visibility`, headers: readHeaders
    })).json()).toEqual({ state: "PRIVATE", public_ref: null, publish_pending: true });
    await pendingApi.close();
  });

  // Unchanged pass-1 expectations, re-run at the new head so a fix cannot have dropped them.
  it("P2-13 keeps the unbound unpublish at 200 and the unbound delete at 409", async () => {
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        readOwnedVisibility: async () => ({ state: "PUBLISHED", public_ref: FREE_REF }),
        isFreePublicBound: async () => false
      }),
      accountErasure: erasure("PUBLISHED")
    });
    const ok = await api.inject({
      method: "POST", url: `/v1/runs/${FREE_RUN}/unpublish`, headers: mutationHeaders,
      payload: { step_up_grant: GRANT_TOKEN, copies_may_persist_acknowledged: true }
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ state: "PRIVATE", public_ref: null });
    const refused = await api.inject({
      method: "DELETE", url: `/v1/debates/${FREE_RUN}`, headers: mutationHeaders,
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toEqual({ error: "DEBATE_MUST_BE_PRIVATE" });
    await api.close();
  });

  it("P2-14 still hides a bound published run from a non-owner and an anonymous caller", async () => {
    const api = buildApi({
      application: application(), sessions: sessions(), allowedOrigin: ORIGIN,
      publications: publications({
        preflightGrant: async () => false,
        readOwnedVisibility: async () => ({ state: "PUBLISHED", public_ref: FREE_REF }),
        isFreePublicBound: async () => true
      }),
      accountErasure: erasure("NOT_FOUND")
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
    const anonymous = await api.inject({
      method: "DELETE", url: `/v1/debates/${FREE_RUN}`,
      headers: { origin: ORIGIN, "x-csrf-token": CSRF_TOKEN, "user-agent": "rev-s01-p2" },
      payload: { step_up_grant: GRANT_TOKEN }
    });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toEqual({ error: "SESSION_REQUIRED" });
    await api.close();
  });

  // The reconciler is still fed only by the work table.
  it("P2-15 reconciles nothing when the work table is empty", async () => {
    const { calls, repository } = repositoryDouble({ claimAutoPublishWork: async () => [] });
    const app = new PostgresPublicationApplication(repository, cipherDouble);
    expect(await app.reconcileFreePublicAutoPublish()).toBe(0);
    expect(only(calls, "systemPublish")).toEqual([]);
  });
});
