import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const USER_IDENTITY = testHttpIdentity("api-error-envelopes");
const USER_MUTATION_HEADERS = testSessionHeaders(USER_IDENTITY, true);
const USER_READ_HEADERS = testSessionHeaders(USER_IDENTITY, false);
const JSON_HEADERS = Object.freeze({ "content-type": "application/json" });

function fixtureApplication(): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit: async () => ({ run_ref: RUN_ID, status: "QUEUED" }),
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({ items: [], open_runs: [], limit, offset, total: 0 }),
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] }, scorecards: [], model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    readNode: async () => null,
    recordInvestigation: async () => ({ request_ref: "request:test", status: "RECORDED", replay_handle: "replay:test" }),
    unlinkMemoryLink: async () => ({ memory_link_id: "memory:test", state: "UNLINKED" }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    events: async function* () {
      yield { event_id: "event:test", event_type: "run.accepted", run_ref: RUN_ID, at_sequence: 1, payload: {} };
    }
  };
}

function harness() {
  const application = fixtureApplication();
  const recordInvestigation = vi.fn(application.recordInvestigation);
  const api = buildApi({
    application: { ...application, recordInvestigation },
    sessions: testSessionApplication([USER_IDENTITY]),
    allowedOrigin: TEST_APP_ORIGIN
  });
  const failureLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const close = async () => {
    failureLog.mockRestore();
    await api.close();
  };
  return { api, failureLog, close, recordInvestigation };
}

/** Every `api.request.failed` line this suite must never provoke. */
function requestFailures(failureLog: ReturnType<typeof vi.spyOn>): readonly string[] {
  return failureLog.mock.calls
    .map((call) => String(call[0]))
    .filter((line) => line.includes("api.request.failed"));
}

describe("API error envelopes (L1-F5, L1-F6)", () => {
  // L1-F5: the 400 carried the full ZodError issue list — every field path,
  // every expected enum value, and each `.strict()` extra-key name.
  it("returns a constant MALFORMED_REQUEST envelope with no schema disclosure", async () => {
    const { api, failureLog, close } = harness();
    try {
      const response = await api.inject({
        method: "POST",
        url: "/v1/asks",
        headers: { ...USER_MUTATION_HEADERS, ...JSON_HEADERS },
        payload: JSON.stringify({ question_line: 42, unexpected_key: "x" })
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST"
      });
      // No zod vocabulary may survive into the transport.
      const body = response.body;
      for (const leak of ["question_line", "unexpected_key", "expected", "invalid_type", "issues", "path", "received"]) {
        expect(body, `disclosed ${leak}`).not.toContain(leak);
      }
      expect(requestFailures(failureLog)).toEqual([]);
    } finally {
      await close();
    }
  });

  // B25b invariant: every 400 the API emits carries one constant shape —
  // `{error, message}` with message === error. Pinned in one place so a new
  // route cannot quietly reintroduce a bare or a detail-bearing envelope.
  it("gives every MALFORMED_REQUEST 400 the same two-field envelope", async () => {
    const { api, failureLog, close } = harness();
    try {
      const probes = [
        ["/v1/public/debates?limit=129&offset=0", {}],
        ["/v1/answers?limit=129&offset=0", USER_READ_HEADERS],
        [`/v1/answers/${RUN_ID}?version=0`, USER_READ_HEADERS],
        [`/v1/answers/${RUN_ID}/inspection?version=0`, USER_READ_HEADERS]
      ] as const;
      for (const [url, headers] of probes) {
        const response = await api.inject({ method: "GET", url, headers });
        expect(response.statusCode, url).toBe(400);
        expect(response.json(), url).toEqual({
          error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST"
        });
      }
      // The operator-only evaluator route cannot be driven to a 400 (it is 403
      // before its handler), so the shape is pinned at the source as well.
      const source = await readFile("apps/api/src/index.ts", "utf8");
      expect(source).not.toContain('send({ error: "MALFORMED_REQUEST" })');
      expect(requestFailures(failureLog)).toEqual([]);
    } finally {
      await close();
    }
  });
});
