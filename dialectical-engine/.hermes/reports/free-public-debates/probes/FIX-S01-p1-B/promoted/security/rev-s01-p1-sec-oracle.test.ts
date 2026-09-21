// TEMPORARY REVIEW FIXTURE — REV-S01-p1-security-data-safety. Deleted before handoff.
// R-13 / R-18: is the new 409 an existence-or-tier oracle for anyone but the owner?
import { describe, expect, it, vi } from "vitest";
import {
  buildApi, CSRF_COOKIE_NAME, SESSION_COOKIE_NAME, type ApiOptions
} from "../../apps/api/src/index.js";

const ORIGIN = "https://ui.example.test";
const BOUND_RUN = "11111111-1111-4111-8111-111111111111";
const MISSING_RUN = "00000000-0000-4000-8000-000000000000";
const OWNER_TOKEN = "s".repeat(43);
const SECOND_TOKEN = "t".repeat(43);
const CSRF = "c".repeat(43);
const GRANT = "g".repeat(43);

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

// Models the product: a step-up grant is bound to (session, run), so a second
// user's grant never preflights against the first user's run, and no grant at
// all never preflights. A run nobody owns preflights false as well.
function harness() {
  const preflightGrant = vi.fn(async (input: {
    runId: string; authenticated: typeof OWNER; grantToken: string;
  }) => input.runId === BOUND_RUN
    && input.authenticated.userId === OWNER.userId
    && input.grantToken === GRANT);
  const readRun = vi.fn(async (runId: string, _s: unknown, ownership: { ownerRef: string }) =>
    runId === BOUND_RUN && ownership.ownerRef === OWNER.ownerRef ? Object.freeze({}) : null);
  const deletePrivateDebate = vi.fn(async (input: {
    runId: string; authenticated: typeof OWNER;
  }) => input.runId === BOUND_RUN && input.authenticated.userId === OWNER.userId
    ? "CLEANED" : "NOT_FOUND");
  const publications = Object.freeze({
    preflightGrant,
    auditPreflightDenial: vi.fn(async () => undefined),
    readOwnedVisibility: vi.fn(async () => Object.freeze({
      state: "PUBLISHED" as const, public_ref: BOUND_RUN
    })),
    isFreePublicBound: vi.fn(async (runId: string) => runId === BOUND_RUN),
    unpublish: vi.fn(async () => Object.freeze({ state: "PRIVATE" as const, public_ref: null }))
  }) as unknown as NonNullable<ApiOptions["publications"]>;
  const api = buildApi({
    application: Object.freeze({ readRun }) as unknown as ApiOptions["application"],
    sessions: Object.freeze({
      authenticate: vi.fn(async (token: string) => token === OWNER_TOKEN
        ? OWNER : token === SECOND_TOKEN ? SECOND : null),
      verifyCsrf: vi.fn(() => true)
    }) as unknown as NonNullable<ApiOptions["sessions"]>,
    allowedOrigin: ORIGIN,
    publications,
    accountErasure: Object.freeze({ deletePrivateDebate }) as unknown as
      NonNullable<ApiOptions["accountErasure"]>
  });
  return { api, preflightGrant };
}

function headers(token?: string): Record<string, string> {
  const base: Record<string, string> = { origin: ORIGIN, "x-csrf-token": CSRF };
  if (token !== undefined) {
    base["cookie"] = `${SESSION_COOKIE_NAME}=${token}; ${CSRF_COOKIE_NAME}=${CSRF}`;
  }
  return base;
}

async function unpublish(api: ReturnType<typeof buildApi>, runId: string, token?: string) {
  const response = await api.inject({
    method: "POST", url: `/v1/runs/${runId}/unpublish`, headers: headers(token),
    payload: { step_up_grant: GRANT, copies_may_persist_acknowledged: true }
  });
  return { status: response.statusCode, body: response.body };
}

async function remove(api: ReturnType<typeof buildApi>, runId: string, token?: string) {
  const response = await api.inject({
    method: "DELETE", url: `/v1/debates/${runId}`, headers: headers(token),
    payload: { step_up_grant: GRANT }
  });
  return { status: response.statusCode, body: response.body };
}

describe("REV-S01-p1 security: the refusal oracle", () => {
  it("C1 R-13 unpublish: only the owner with a live grant sees the 409", async () => {
    const { api } = harness();
    try {
      const results = {
        ownerBoundPublished: await unpublish(api, BOUND_RUN, OWNER_TOKEN),
        secondUserSameRun: await unpublish(api, BOUND_RUN, SECOND_TOKEN),
        secondUserMissingRun: await unpublish(api, MISSING_RUN, SECOND_TOKEN),
        ownerMissingRun: await unpublish(api, MISSING_RUN, OWNER_TOKEN),
        anonymousSameRun: await unpublish(api, BOUND_RUN),
        anonymousMissingRun: await unpublish(api, MISSING_RUN)
      };
      console.log("C1 unpublish:", JSON.stringify(results, null, 1));
      expect(results.ownerBoundPublished).toEqual({
        status: 409, body: JSON.stringify({ error: "FREE_DEBATE_CANNOT_BE_UNPUBLISHED" })
      });
      expect(results.secondUserSameRun).toEqual(results.secondUserMissingRun);
      expect(results.anonymousSameRun).toEqual(results.anonymousMissingRun);
      expect(results.ownerMissingRun.status).toBe(404);
    } finally {
      await api.close();
    }
  });

  it("C2 R-14 the refusal is repeatable with the same grant and consumes nothing", async () => {
    const { api, preflightGrant } = harness();
    try {
      const first = await unpublish(api, BOUND_RUN, OWNER_TOKEN);
      const second = await unpublish(api, BOUND_RUN, OWNER_TOKEN);
      console.log("C2 repeat:", JSON.stringify({ first, second }),
        "preflight calls:", preflightGrant.mock.calls.length);
      expect(second).toEqual(first);
      expect(second.status).toBe(409);
    } finally {
      await api.close();
    }
  });

  it("C3 R-18 delete: a second user and an anonymous caller learn nothing", async () => {
    const { api } = harness();
    try {
      const results = {
        secondUserSameRun: await remove(api, BOUND_RUN, SECOND_TOKEN),
        secondUserMissingRun: await remove(api, MISSING_RUN, SECOND_TOKEN),
        anonymousSameRun: await remove(api, BOUND_RUN),
        anonymousMissingRun: await remove(api, MISSING_RUN),
        owner: await remove(api, BOUND_RUN, OWNER_TOKEN)
      };
      console.log("C3 delete:", JSON.stringify(results, null, 1));
      expect(results.secondUserSameRun).toEqual(results.secondUserMissingRun);
      expect(results.anonymousSameRun).toEqual(results.anonymousMissingRun);
      expect(results.owner.status).toBe(200);
    } finally {
      await api.close();
    }
  });

  it("C4 the 409 is reached only AFTER preflightGrant, never before", async () => {
    const { api, preflightGrant } = harness();
    try {
      // A grant token that does not preflight: the answer must be the plain 404,
      // not the tier-revealing 409.
      const response = await api.inject({
        method: "POST", url: `/v1/runs/${BOUND_RUN}/unpublish`, headers: headers(OWNER_TOKEN),
        payload: { step_up_grant: "x".repeat(43), copies_may_persist_acknowledged: true }
      });
      console.log("C4 owner with a dead grant:", response.statusCode, response.body,
        "preflight calls:", preflightGrant.mock.calls.length);
      expect(response.statusCode).toBe(404);
      expect(response.body).toBe(JSON.stringify({ error: "RUN_NOT_FOUND" }));
    } finally {
      await api.close();
    }
  });
});
