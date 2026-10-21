import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import type { AccountErasureApplication } from "../../apps/api/src/account-erasure.js";
import type { PublicationApplication } from "../../apps/api/src/publications.js";
import type { SessionApplication } from "../../apps/api/src/sessions.js";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders } from "../support/httpSession.js";

/**
 * Side-by-side uploads spec 2026-10-21 §4 (plan C task C9) — AN OLD RUN ID KEEPS WORKING. A debate re-admitted from the
 * waiting line gets a new run; the person's page, a bookmark, an open stream or a step-up grant may still name the old
 * one. Every run-id route follows `AskApplication.resolveRunRef` right after it parses the id, so the first downstream
 * call already names the newest run; the three step-up routes rewrite `target_run_id` before the service sees it, so the
 * grant and the path name the same run. An application without the method passes the id through unchanged.
 * Embedded-Postgres proof of the database half: tests/integration/side-by-side-run-ref.test.ts.
 */
const OLD = "11111111-1111-4111-8111-111111111111";
const NEW = "22222222-2222-4222-8222-222222222222";
const GRANT = "g".repeat(43);
const OWNER = testHttpIdentity("c9-run-ref-owner");

function fixtureApplication(seen: string[], resolve: boolean): AskApplication {
  const record = (label: string, runId: string) => { seen.push(`${label}:${runId}`); };
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: NEW, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async (runId) => { record("readRunAnswer", runId); return null; },
    readRun: async (runId) => {
      record("readRun", runId);
      return { run_ref: runId, question_line: "A re-admitted debate", state: "QUEUED", terminal_reason: null, hold_until: null };
    },
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* (runId) { record("events", runId); },
    eventMark: async (runId) => { record("eventMark", runId); return Object.freeze({ mark: "0:0:0:0:0:0:0", settled: true }); },
    ...(resolve ? { resolveRunRef: async (runId: string) => runId === OLD ? NEW : runId } : {})
  };
}

function arrange(input: { resolve?: boolean } = {}) {
  const seen: string[] = [];
  const stepUp = vi.fn<SessionApplication["stepUp"]>(async () => ({
    sessionToken: OWNER.rawSessionToken, csrfToken: OWNER.rawCsrfToken
  }));
  const publications: PublicationApplication = {
    reconcileKeyCleanup: async () => 0,
    reconcileKeyProvisionCleanup: async () => 0,
    preflightGrant: async ({ runId, action }) => { seen.push(`preflightGrant:${action}:${runId}`); return false; },
    auditPreflightDenial: async () => true,
    readOwnedVisibility: async ({ runId }) => { seen.push(`readOwnedVisibility:${runId}`); return null; },
    publish: async () => null,
    unpublish: async () => null,
    readPublicDebate: async () => null,
    list: async () => ({ items: [], total: 0 })
  };
  const accountErasure: AccountErasureApplication = {
    schedule: async () => { throw new Error("UNEXPECTED_SCHEDULE"); },
    current: async () => ({ status: "NONE" }),
    cancel: async () => true,
    deletePrivateDebate: async ({ runId }) => { seen.push(`deletePrivateDebate:${runId}`); return "NOT_FOUND"; }
  };
  const beginPasskeyStepUp = vi.fn(async (_body: unknown): Promise<never> => { throw new Error("RECORDED"); });
  const beginStepUp = vi.fn(async (_provider: string, _body: unknown) => ({
    authorization_url: "https://accounts.example.test/authorize", flowCookie: "f".repeat(43),
    expiresAt: "2026-10-22T00:05:00.000Z"
  }));
  const api = buildApi({
    application: fixtureApplication(seen, input.resolve ?? true),
    sessions: { ...testSessionApplication([OWNER]), stepUp },
    publications,
    accountErasure,
    consumerSecurity: { beginPasskeyStepUp } as never,
    socialAuth: { beginStepUp } as never,
    allowedOrigin: TEST_APP_ORIGIN
  });
  return { api, seen, stepUp, beginPasskeyStepUp, beginStepUp };
}

const read = testSessionHeaders(OWNER);
const write = testSessionHeaders(OWNER, true);

describe("side-by-side C9: every run-id route follows the old id to its newest run", () => {
  it("each of the seven routes, called with the old id, reaches its first downstream call with the new one", async () => {
    const { api, seen } = arrange();
    try {
      const cases = [
        { method: "DELETE", url: `/v1/debates/${OLD}`, headers: write, payload: { step_up_grant: GRANT }, first: `deletePrivateDebate:${NEW}` },
        { method: "GET", url: `/v1/runs/${OLD}/events`, headers: read, first: `readRun:${NEW}` },
        { method: "GET", url: `/v1/runs/${OLD}`, headers: read, first: `readRun:${NEW}` },
        { method: "GET", url: `/v1/runs/${OLD}/visibility`, headers: read, first: `readOwnedVisibility:${NEW}` },
        { method: "GET", url: `/v1/runs/${OLD}/answer`, headers: read, first: `readRunAnswer:${NEW}` },
        { method: "POST", url: `/v1/runs/${OLD}/publish`, headers: write,
          payload: { step_up_grant: GRANT, warning_acknowledged: true }, first: `preflightGrant:PUBLISH:${NEW}` },
        { method: "POST", url: `/v1/runs/${OLD}/unpublish`, headers: write,
          payload: { step_up_grant: GRANT, copies_may_persist_acknowledged: true }, first: `preflightGrant:UNPUBLISH:${NEW}` }
      ] as const;
      for (const entry of cases) {
        seen.length = 0;
        await api.inject({
          method: entry.method, url: entry.url, headers: entry.headers,
          ...("payload" in entry ? { payload: entry.payload } : {})
        });
        expect(seen[0], entry.url).toBe(entry.first);
        expect(seen.join(" "), entry.url).not.toContain(OLD);
      }
    } finally {
      await api.close();
    }
  });

  it("the event stream reads its snapshot and its mark under the new id", async () => {
    const { api, seen } = arrange();
    try {
      const response = await api.inject({ method: "GET", url: `/v1/runs/${OLD}/events`, headers: read });
      expect(response.statusCode).toBe(200);
      expect(seen).toContain(`events:${NEW}`);
      expect(seen).toContain(`eventMark:${NEW}`);
      expect(seen.join(" ")).not.toContain(OLD);
    } finally {
      await api.close();
    }
  });

  it("POST /v1/auth/step-up binds the grant to the new run", async () => {
    const { api, stepUp } = arrange();
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/auth/step-up", headers: write,
        payload: { password: "correct horse battery staple", code: "123456", authorization: { action: "PUBLISH", target_run_id: OLD } }
      });
      expect(response.statusCode).toBe(200);
      expect(stepUp).toHaveBeenCalledWith(expect.objectContaining({
        authorization: { action: "PUBLISH", targetRunId: NEW }
      }), expect.anything());
    } finally {
      await api.close();
    }
  });

  it("the passkey and provider step-up starts hand the service the new run", async () => {
    const { api, beginPasskeyStepUp, beginStepUp } = arrange();
    try {
      await api.inject({
        method: "POST", url: "/v1/auth/passkeys/step-up/options", headers: write,
        payload: { authorization: { action: "DELETE_PRIVATE_DEBATE", target_run_id: OLD } }
      });
      expect(beginPasskeyStepUp).toHaveBeenCalledOnce();
      expect(beginPasskeyStepUp.mock.calls[0]?.[0]).toEqual({ authorization: { action: "DELETE_PRIVATE_DEBATE", target_run_id: NEW } });

      const social = await api.inject({
        method: "POST", url: "/v1/account/social/google/step-up/begin", headers: write,
        payload: { authorization: { action: "UNPUBLISH", target_run_id: OLD }, next: "/settings/security" }
      });
      expect(social.statusCode).toBe(200);
      expect(beginStepUp.mock.calls[0]?.[1]).toEqual({ authorization: { action: "UNPUBLISH", target_run_id: NEW }, next: "/settings/security" });
    } finally {
      await api.close();
    }
  });

  it("a body with no run target reaches the step-up services as sent", async () => {
    const { api, beginPasskeyStepUp } = arrange();
    try {
      const body = { authorization: { action: "DELETE_ACCOUNT" } };
      await api.inject({ method: "POST", url: "/v1/auth/passkeys/step-up/options", headers: write, payload: body });
      expect(beginPasskeyStepUp.mock.calls[0]?.[0]).toEqual(body);
    } finally {
      await api.close();
    }
  });

  it("an application without resolveRunRef passes the old id through unchanged", async () => {
    const { api, seen, stepUp, beginPasskeyStepUp } = arrange({ resolve: false });
    try {
      await api.inject({ method: "GET", url: `/v1/runs/${OLD}`, headers: read });
      await api.inject({ method: "GET", url: `/v1/runs/${OLD}/visibility`, headers: read });
      expect(seen).toEqual([`readRun:${OLD}`, `readOwnedVisibility:${OLD}`]);
      await api.inject({
        method: "POST", url: "/v1/auth/step-up", headers: write,
        payload: { password: "correct horse battery staple", code: "123456", authorization: { action: "PUBLISH", target_run_id: OLD } }
      });
      expect(stepUp).toHaveBeenCalledWith(expect.objectContaining({
        authorization: { action: "PUBLISH", targetRunId: OLD }
      }), expect.anything());
      await api.inject({
        method: "POST", url: "/v1/auth/passkeys/step-up/options", headers: write,
        payload: { authorization: { action: "PUBLISH", target_run_id: OLD } }
      });
      expect(beginPasskeyStepUp.mock.calls[0]?.[0]).toEqual({ authorization: { action: "PUBLISH", target_run_id: OLD } });
    } finally {
      await api.close();
    }
  });
});
