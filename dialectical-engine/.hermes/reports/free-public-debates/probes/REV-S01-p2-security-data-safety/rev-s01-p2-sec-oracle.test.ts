// TEMPORARY REVIEW FIXTURE — REV-S01-p2-security-data-safety. Deleted before handoff.
// Charge 8: SPEC-v3 widened the trigger to a SECOND owner route, GET /v1/answers/{id}.
// Re-derived from the pass-1 oracle probe (which only knew GET /v1/runs/{id}/answer).
import { describe, expect, it, vi } from "vitest";
import {
  buildApi, CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, type ApiOptions
} from "../../apps/api/src/index.js";

const ORIGIN = "https://ui.example.test";
const BOUND_RUN = "11111111-1111-4111-8111-111111111111";
const ANSWER_ID = "66666666-6666-4666-8666-666666666666";
const MISSING = "00000000-0000-4000-8000-000000000000";
const OWNER_TOKEN = "s".repeat(43);
const SECOND_TOKEN = "t".repeat(43);
const CSRF = "c".repeat(43);

const OWNER = Object.freeze({
  session: Object.freeze({
    session_id: "22222222-2222-4222-8222-222222222222",
    asker_id: "owner:owner-one", caller_scope: "user",
    ownership_provenance: "server_session"
  }),
  userId: "33333333-3333-4333-8333-333333333333", ownerRef: "owner-one"
});
const SECOND = Object.freeze({
  session: Object.freeze({
    session_id: "44444444-4444-4444-8444-444444444444",
    asker_id: "owner:owner-two", caller_scope: "user",
    ownership_provenance: "server_session"
  }),
  userId: "55555555-5555-4555-8555-555555555555", ownerRef: "owner-two"
});

// A schema-valid Answer: the routes end in AnswerSchema.parse, so an invalid body
// would be a 500 and would hide the thing under test.
const ANSWER = Object.freeze({
  answer_id: "answer-rev-p2", answer_version: 1, run_ref: BOUND_RUN,
  terminal: "SERVED", question_line: "Does a public square need a gatekeeper?",
  verdict_state: "SUPPORTED", verdict_unavailable: null, confidence_band: "high",
  band_ceiling: {
    label: "high", basis: { LOOKED_UP: 1, RAN: 0, REASONING: 0 },
    register_row_key: "rev-p2-band", register_version: 1,
    source_ref: "rev-p2-source", lift_path: "none"
  },
  answer_form: null, serve_state: "COMPOSED",
  composed_text: [{
    segment_id: "segment-rev-p2", text: "A public answer.",
    load_bearing: true, served_number_refs: []
  }],
  number_slots: [], abstention: null, shadow_suppressions: [], badges: [],
  residual_objections: [], value_hinges: [], condition_marks: [],
  condition_mark_records: [], reversal_point: "New evidence",
  builds_on_previous: { value: false, answer_ref: null }, memory_disclosure: null,
  risk_tier: "standard", tier_source: "ASKER", tier_provenance_ref: "rev-p2-tier",
  cost_envelope: {
    basis: {}, state: "WITHIN", consumed_model_attempts: 1,
    protected_core: "NEVER_SKIPPABLE"
  },
  composition_budget_tier: "low", conformance_outcome: "PASS",
  ledger_digest_handle: "rev-p2-ledger", inspection_handle: "rev-p2-inspection",
  as_of: "2026-09-21T00:00:00.000Z", staleness_state: "FRESH",
  relevant_as_of: "2026-09-21T00:00:00.000Z", nodes: [], edges: []
});

// readAnswer / readRunAnswer are ownership-scoped in the product; the harness models
// exactly that: they answer only for the owner's ownerRef.
function harness() {
  const tryAutoPublish = vi.fn(async () => undefined);
  const readAnswer = vi.fn(async (
    answerId: string, _s: unknown, _v: unknown, ownership: { ownerRef: string | null }
  ) => answerId === ANSWER_ID && ownership.ownerRef === OWNER.ownerRef ? ANSWER : null);
  const readRunAnswer = vi.fn(async (
    runId: string, _s: unknown, ownership: { ownerRef: string | null }
  ) => runId === BOUND_RUN && ownership.ownerRef === OWNER.ownerRef ? ANSWER : null);
  const api = buildApi({
    application: Object.freeze({ readAnswer, readRunAnswer }) as unknown as
      ApiOptions["application"],
    sessions: Object.freeze({
      authenticate: vi.fn(async (token: string) => token === OWNER_TOKEN
        ? OWNER : token === SECOND_TOKEN ? SECOND : null),
      verifyCsrf: vi.fn(() => true)
    }) as unknown as NonNullable<ApiOptions["sessions"]>,
    allowedOrigin: ORIGIN,
    publications: Object.freeze({
      tryAutoPublish,
      preflightGrant: vi.fn(async () => false),
      auditPreflightDenial: vi.fn(async () => undefined),
      readOwnedVisibility: vi.fn(async () => null),
      isFreePublicBound: vi.fn(async () => true),
      unpublish: vi.fn(async () => null)
    }) as unknown as NonNullable<ApiOptions["publications"]>
  });
  return { api, tryAutoPublish };
}

function headers(token?: string): Record<string, string> {
  const base: Record<string, string> = { origin: ORIGIN, "x-csrf-token": CSRF };
  if (token !== undefined) {
    base["cookie"] = `${SESSION_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=${CSRF}`;
  }
  return base;
}

async function get(api: ReturnType<typeof buildApi>, url: string, token?: string) {
  const r = await api.inject({ method: "GET", url, headers: headers(token) });
  return { status: r.statusCode, body: r.body };
}

describe("REV-S01-p2 security: the second answer-serving route", () => {
  it("E1 GET /v1/answers/{id} tells a non-owner and an anonymous caller nothing new", async () => {
    const { api, tryAutoPublish } = harness();
    try {
      const results = {
        owner: await get(api, `/v1/answers/${ANSWER_ID}`, OWNER_TOKEN),
        secondUserRealAnswer: await get(api, `/v1/answers/${ANSWER_ID}`, SECOND_TOKEN),
        secondUserMissing: await get(api, `/v1/answers/${MISSING}`, SECOND_TOKEN),
        anonymousRealAnswer: await get(api, `/v1/answers/${ANSWER_ID}`),
        anonymousMissing: await get(api, `/v1/answers/${MISSING}`)
      };
      console.log("E1:", JSON.stringify({
        owner: results.owner.status,
        secondUserRealAnswer: results.secondUserRealAnswer,
        secondUserMissing: results.secondUserMissing,
        anonymousRealAnswer: results.anonymousRealAnswer,
        anonymousMissing: results.anonymousMissing
      }, null, 1));
      expect(results.owner.status).toBe(200);
      expect(results.secondUserRealAnswer).toEqual(results.secondUserMissing);
      expect(results.anonymousRealAnswer).toEqual(results.anonymousMissing);
      const publishedRuns = tryAutoPublish.mock.calls.map(
        (c) => (c[0] as { runId: string; ownerRef: string })
      );
      console.log("E1 tryAutoPublish calls:", JSON.stringify(publishedRuns));
      // Exactly one call, from the owner's own read, with the owner's own ownerRef.
      expect(publishedRuns).toEqual([{
        runId: BOUND_RUN, answer: ANSWER, userId: OWNER.userId, ownerRef: OWNER.ownerRef
      }].map((c) => ({ runId: c.runId, ownerRef: c.ownerRef, userId: c.userId, answer: c.answer })));
    } finally {
      await api.close();
    }
  });

  it("E2 both answer-serving routes publish only for the caller who owns the run", async () => {
    const { api, tryAutoPublish } = harness();
    try {
      await get(api, `/v1/answers/${ANSWER_ID}`, SECOND_TOKEN);
      await get(api, `/v1/runs/${BOUND_RUN}/answer`, SECOND_TOKEN);
      await get(api, `/v1/answers/${ANSWER_ID}`);
      await get(api, `/v1/runs/${BOUND_RUN}/answer`);
      console.log("E2 tryAutoPublish calls after 4 non-owner/anonymous reads:",
        tryAutoPublish.mock.calls.length);
      expect(tryAutoPublish.mock.calls.length).toBe(0);
      const owner = await get(api, `/v1/runs/${BOUND_RUN}/answer`, OWNER_TOKEN);
      console.log("E2 owner read status:", owner.status,
        "calls now:", tryAutoPublish.mock.calls.length);
      expect(owner.status).toBe(200);
      expect(tryAutoPublish.mock.calls.length).toBe(1);
    } finally {
      await api.close();
    }
  });

  it("E3 a throw inside the publish hook never changes either route's answer", async () => {
    const { api } = harness();
    try {
      const before = await get(api, `/v1/answers/${ANSWER_ID}`, OWNER_TOKEN);
      await api.close();
      const throwing = buildApi({
        application: Object.freeze({
          readAnswer: async () => ANSWER,
          readRunAnswer: async () => ANSWER
        }) as unknown as ApiOptions["application"],
        sessions: Object.freeze({
          authenticate: vi.fn(async (t: string) => t === OWNER_TOKEN ? OWNER : null),
          verifyCsrf: vi.fn(() => true)
        }) as unknown as NonNullable<ApiOptions["sessions"]>,
        allowedOrigin: ORIGIN,
        publications: Object.freeze({
          tryAutoPublish: vi.fn(async () => { throw new TypeError("PUBLISH_EXPLODED"); }),
          preflightGrant: vi.fn(async () => false),
          auditPreflightDenial: vi.fn(async () => undefined),
          readOwnedVisibility: vi.fn(async () => null),
          isFreePublicBound: vi.fn(async () => true),
          unpublish: vi.fn(async () => null)
        }) as unknown as NonNullable<ApiOptions["publications"]>
      });
      try {
        const answers = await get(throwing, `/v1/answers/${ANSWER_ID}`, OWNER_TOKEN);
        const runs = await get(throwing, `/v1/runs/${BOUND_RUN}/answer`, OWNER_TOKEN);
        console.log("E3 with a throwing hook:", answers.status, runs.status,
          "identical to the healthy body:", answers.body === before.body);
        expect(answers.status).toBe(200);
        expect(runs.status).toBe(200);
        expect(answers.body).toBe(before.body);
      } finally {
        await throwing.close();
      }
    } catch (error) {
      throw error;
    }
  });
});
