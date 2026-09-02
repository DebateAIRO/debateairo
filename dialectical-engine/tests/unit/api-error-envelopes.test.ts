import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { API_MAX_PARAM_LENGTH, buildApi, type AskApplication } from "@debateai/api";
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
function requestFailures(
  failureLog: Readonly<{ mock: Readonly<{ calls: readonly (readonly unknown[])[] }> }>
): readonly string[] {
  return failureLog.mock.calls
    .map((call): string => String(call[0]))
    .filter((line): boolean => line.includes("api.request.failed"));
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

  // L1-F6: unknown routes returned Fastify's own {message,error,statusCode}
  // envelope, fingerprinting the framework and confirming route existence.
  it("returns a typed NOT_FOUND envelope for an unknown route", async () => {
    const { api, failureLog, close } = harness();
    try {
      const response = await api.inject({
        method: "GET", url: "/v1/does-not-exist", headers: USER_READ_HEADERS
      });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "NOT_FOUND", message: "NOT_FOUND" });
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(requestFailures(failureLog)).toEqual([]);
    } finally {
      await close();
    }
  });

  // `exposeHeadRoutes:false` stays: HEAD and OPTIONS on a *known* url must take
  // the same typed 404 as any unknown one, so neither confirms the route.
  it("returns the typed NOT_FOUND envelope for HEAD and OPTIONS on known routes", async () => {
    const { api, failureLog, close } = harness();
    try {
      const options = await api.inject({
        method: "OPTIONS", url: "/v1/asks", headers: USER_READ_HEADERS
      });
      expect(options.statusCode).toBe(404);
      expect(options.json()).toEqual({ error: "NOT_FOUND", message: "NOT_FOUND" });

      const head = await api.inject({
        method: "HEAD", url: "/v1/session", headers: USER_READ_HEADERS
      });
      expect(head.statusCode).toBe(404);
      // `inject` does not strip the HEAD body the way a real transport does,
      // so the envelope itself is observable here and must be the typed one.
      expect(head.json()).toEqual({ error: "NOT_FOUND", message: "NOT_FOUND" });
      expect(requestFailures(failureLog)).toEqual([]);
    } finally {
      await close();
    }
  });

  // L1-F6: the 414 reflected the oversized parameter straight back at the caller.
  it("returns a typed URI_TOO_LONG envelope that never echoes the parameter", async () => {
    const { api, failureLog, close } = harness();
    try {
      const oversizedParam = "a".repeat(101);
      const response = await api.inject({
        method: "GET", url: `/v1/answers/${oversizedParam}`, headers: USER_READ_HEADERS
      });
      expect(response.statusCode).toBe(414);
      expect(response.json()).toEqual({ error: "URI_TOO_LONG", message: "URI_TOO_LONG" });
      expect(response.body).not.toContain(oversizedParam);
      expect(response.body).not.toContain("FST_ERR");
      expect(requestFailures(failureLog)).toEqual([]);
    } finally {
      await close();
    }
  });


  // A contradicted content-length is refused by the transport, never by a
  // route. `inject` normalises a non-numeric header away, so the reachable
  // case is a truncated body; the two framework codes that `inject` cannot
  // provoke are pinned at the source instead of being faked green.
  it("maps content-length faults to the constant MALFORMED_REQUEST envelope", async () => {
    const { api, failureLog, close } = harness();
    try {
      const truncated = await api.inject({
        method: "POST",
        url: "/v1/asks",
        headers: { ...USER_MUTATION_HEADERS, ...JSON_HEADERS, "content-length": "3" },
        payload: JSON.stringify({ question_line: "a lawful question" })
      });
      expect(truncated.statusCode).toBe(400);
      expect(truncated.json()).toEqual({
        error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST"
      });

      const source = await readFile("apps/api/src/index.ts", "utf8");
      for (const code of ["FST_ERR_CTP_INVALID_CONTENT_LENGTH", "FST_ERR_BAD_URL"]) {
        expect(source, code).toContain(`["${code}", { statusCode: 400, code: "MALFORMED_REQUEST" }]`);
      }
      expect(requestFailures(failureLog)).toEqual([]);
    } finally {
      await close();
    }
  });

  // L1-F7: `{gapRef}` was model-authored free text with no bound of its own.
  // `maxParamLength` stays 100 (L1's ruling), so the two refusals differ: a
  // gapRef the router will not carry takes the typed 414, and one it does
  // carry but the route rejects takes the constant 400.
  it("bounds a model-authored gapRef at the route", async () => {
    const { api, failureLog, close, recordInvestigation } = harness();
    try {
      const overLength = "a".repeat(API_MAX_PARAM_LENGTH + 1);
      const tooLong = await api.inject({
        method: "POST",
        url: `/v1/answers/${RUN_ID}/investigations/${overLength}`,
        headers: { ...USER_MUTATION_HEADERS, ...JSON_HEADERS },
        payload: JSON.stringify({ user_input: "why", human_steer_input: true })
      });
      expect(tooLong.statusCode).toBe(414);
      expect(tooLong.json()).toEqual({ error: "URI_TOO_LONG", message: "URI_TOO_LONG" });
      expect(tooLong.body).not.toContain(overLength);

      const blank = await api.inject({
        method: "POST",
        url: `/v1/answers/${RUN_ID}/investigations/%20%20`,
        headers: { ...USER_MUTATION_HEADERS, ...JSON_HEADERS },
        payload: JSON.stringify({ user_input: "why", human_steer_input: true })
      });
      expect(blank.statusCode).toBe(400);
      expect(blank.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });

      // Neither refusal reached the application.
      expect(recordInvestigation).not.toHaveBeenCalled();

      const admitted = await api.inject({
        method: "POST",
        url: `/v1/answers/${RUN_ID}/investigations/${"g".repeat(API_MAX_PARAM_LENGTH)}`,
        headers: { ...USER_MUTATION_HEADERS, ...JSON_HEADERS },
        payload: JSON.stringify({ user_input: "why", human_steer_input: true })
      });
      expect(admitted.statusCode).toBe(202);
      expect(recordInvestigation).toHaveBeenCalledTimes(1);
      expect(requestFailures(failureLog)).toEqual([]);
    } finally {
      await close();
    }
  });
});
