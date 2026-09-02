import { describe, expect, it, vi } from "vitest";
import {
  API_BODY_LIMIT_BYTES,
  API_MAX_PARAM_LENGTH,
  API_REQUEST_TIMEOUT_MS,
  AUTH_BODY_LIMIT_BYTES,
  AUTH_PASSWORD_MAX_BYTES,
  buildApi,
  type AskApplication
} from "@debateai/api";
import type { MfaApplication } from "../../apps/api/src/mfa.js";
import { RECOVERY_START_PUBLIC_RESPONSE, type RecoveryApplication } from "../../apps/api/src/recovery.js";
import {
  REGISTRATION_PUBLIC_RESPONSE,
  RESEND_PUBLIC_RESPONSE,
  type RegistrationApplication
} from "../../apps/api/src/registration.js";
import type { SessionApplication } from "../../apps/api/src/sessions.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const USER_IDENTITY = testHttpIdentity("api-request-limits");
const USER_MUTATION_HEADERS = testSessionHeaders(USER_IDENTITY, true);
const JSON_HEADERS = Object.freeze({ "content-type": "application/json" });

// L1 "B5 body-size ceilings": every credential, token, and management route
// carries at most ~1.1 KiB of legitimate body; all of them share the 16 KiB
// ceiling. The free-text routes (asks, investigations) keep the server default.
const CREDENTIAL_ROUTES = Object.freeze([
  ["POST", "/v1/auth/register"],
  ["POST", "/v1/auth/verify-email"],
  ["POST", "/v1/auth/resend-verification"],
  ["POST", "/v1/auth/recovery/start"],
  ["POST", "/v1/auth/mfa/totp/begin"],
  ["POST", "/v1/auth/mfa/totp/verify"],
  ["POST", "/v1/auth/mfa/recovery-codes/generate"],
  ["POST", "/v1/auth/mfa/recovery-codes/confirm"],
  ["POST", "/v1/auth/login"],
  ["POST", "/v1/auth/logout"],
  ["DELETE", `/v1/auth/sessions/${SESSION_ID}`],
  ["DELETE", "/v1/auth/sessions"],
  ["POST", "/v1/auth/step-up"],
  ["DELETE", "/v1/account"],
  ["POST", "/v1/account/erasure/cancel"],
  ["POST", "/v1/account/legacy-runs/claim"],
  ["DELETE", `/v1/debates/${RUN_ID}`],
  ["POST", `/v1/runs/${RUN_ID}/publish`],
  ["POST", `/v1/runs/${RUN_ID}/unpublish`]
] as const);

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

/** A JSON document of exactly `totalBytes` bytes. */
function jsonBodyOfBytes(totalBytes: number): string {
  const body = `{"filler":"${"a".repeat(totalBytes - 13)}"}`;
  if (Buffer.byteLength(body, "utf8") !== totalBytes) throw new Error("FIXTURE_SIZE_MISMATCH");
  return body;
}

function harness() {
  const registration = {
    register: vi.fn(async () => REGISTRATION_PUBLIC_RESPONSE),
    verifyEmail: vi.fn(async () => ({ status: "mfa_required" as const })),
    resendVerification: vi.fn(async () => RESEND_PUBLIC_RESPONSE)
  } satisfies RegistrationApplication;
  const recovery = {
    start: vi.fn(async () => RECOVERY_START_PUBLIC_RESPONSE)
  } satisfies RecoveryApplication;
  const mfa = {
    beginTotp: vi.fn(async () => ({
      status: "verification_required" as const, secret: "secret", otpauthUri: "otpauth://totp/test"
    })),
    verifyTotp: vi.fn(async () => ({ status: "recovery_codes_required" as const })),
    generateRecoveryCodes: vi.fn(async () => ({ status: "confirmation_required" as const, recoveryCodes: [] })),
    confirmRecoveryCode: vi.fn(async () => ({ status: "active" as const }))
  } satisfies MfaApplication;
  const baseSessions = testSessionApplication([USER_IDENTITY]);
  const sessions = {
    ...baseSessions,
    beginLogin: vi.fn(baseSessions.beginLogin),
    stepUp: vi.fn(baseSessions.stepUp)
  } satisfies SessionApplication;
  const api = buildApi({
    application: fixtureApplication(),
    registration,
    recovery,
    mfa,
    sessions,
    allowedOrigin: TEST_APP_ORIGIN
  });
  const failureLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const close = async () => {
    failureLog.mockRestore();
    await api.close();
  };
  const upstreamCalls = () => [
    ...Object.values(registration), ...Object.values(recovery), ...Object.values(mfa),
    sessions.beginLogin, sessions.stepUp
  ].reduce((total, stub) => total + stub.mock.calls.length, 0);
  return { api, registration, recovery, mfa, sessions, failureLog, close, upstreamCalls };
}

describe("API request limits (F-07, L1-F4)", () => {
  it("advertises the ruled body, request-time, and param limits", async () => {
    const { api, close } = harness();
    try {
      await api.ready();
      expect(API_BODY_LIMIT_BYTES).toBe(262_144);
      expect(AUTH_BODY_LIMIT_BYTES).toBe(16_384);
      expect(API_REQUEST_TIMEOUT_MS).toBe(30_000);
      expect(AUTH_PASSWORD_MAX_BYTES).toBe(1_024);
      expect(api.initialConfig.bodyLimit).toBe(API_BODY_LIMIT_BYTES);
      // Fastify's initialConfig type omits requestTimeout; the Node server
      // carries the effective value and the frozen config still records it.
      expect(api.server.requestTimeout).toBe(API_REQUEST_TIMEOUT_MS);
      expect((api.initialConfig as Readonly<Record<string, unknown>>).requestTimeout).toBe(API_REQUEST_TIMEOUT_MS);
      // L1 (c): keep Fastify's default param length; B5 does not loosen it to 128.
      expect(API_MAX_PARAM_LENGTH).toBe(100);
      expect(api.initialConfig.routerOptions?.maxParamLength).toBe(API_MAX_PARAM_LENGTH);
      expect(api.initialConfig.maxParamLength).toBe(API_MAX_PARAM_LENGTH);
    } finally {
      await close();
    }
  });

  it("refuses a 16 KiB + 1 body on every credential, token, and management route with a typed 413", async () => {
    const { api, close, failureLog, upstreamCalls } = harness();
    try {
      const oversized = jsonBodyOfBytes(AUTH_BODY_LIMIT_BYTES + 1);
      for (const [method, url] of CREDENTIAL_ROUTES) {
        const response = await api.inject({
          method, url, headers: { ...USER_MUTATION_HEADERS, ...JSON_HEADERS }, payload: oversized
        });
        expect(response.statusCode, `${method} ${url}`).toBe(413);
        expect(response.json(), `${method} ${url}`).toEqual({
          error: "PAYLOAD_TOO_LARGE", message: "PAYLOAD_TOO_LARGE"
        });
      }
      expect(upstreamCalls()).toBe(0);
      // Client faults are not server faults: nothing reaches the >=500 log.
      expect(failureLog).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("still admits a credential body at exactly the ceiling", async () => {
    const { api, close, registration } = harness();
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/auth/register", headers: JSON_HEADERS,
        payload: jsonBodyOfBytes(AUTH_BODY_LIMIT_BYTES)
      });
      expect(response.statusCode).toBe(202);
      expect(registration.register).toHaveBeenCalledTimes(1);
    } finally {
      await close();
    }
  });

  it("keeps the wider free-text ceiling on POST /v1/asks and refuses 300 KiB with a typed 413", async () => {
    const { api, close, failureLog } = harness();
    try {
      const withinDefault = await api.inject({
        method: "POST", url: "/v1/asks", headers: { ...USER_MUTATION_HEADERS, ...JSON_HEADERS },
        payload: jsonBodyOfBytes(AUTH_BODY_LIMIT_BYTES + 1)
      });
      // Past the credential ceiling but inside the server default: the body is
      // parsed and refused by the contract, not by the transport.
      expect(withinDefault.statusCode).toBe(400);
      expect(withinDefault.json()).toMatchObject({ error: "MALFORMED_REQUEST" });

      const oversized = await api.inject({
        method: "POST", url: "/v1/asks", headers: { ...USER_MUTATION_HEADERS, ...JSON_HEADERS },
        payload: jsonBodyOfBytes(300 * 1_024)
      });
      expect(oversized.statusCode).toBe(413);
      expect(oversized.json()).toEqual({ error: "PAYLOAD_TOO_LARGE", message: "PAYLOAD_TOO_LARGE" });
      expect(failureLog).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("maps empty, invalid, and unsupported bodies to typed 400/415 envelopes without a failure log", async () => {
    const { api, close, failureLog } = harness();
    try {
      const empty = await api.inject({
        method: "POST", url: "/v1/asks", headers: { ...USER_MUTATION_HEADERS, ...JSON_HEADERS }, payload: ""
      });
      expect(empty.statusCode).toBe(400);
      expect(empty.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });

      const invalid = await api.inject({
        method: "POST", url: "/v1/asks", headers: { ...USER_MUTATION_HEADERS, ...JSON_HEADERS }, payload: "{not json"
      });
      expect(invalid.statusCode).toBe(400);
      expect(invalid.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });

      const unsupported = await api.inject({
        method: "POST", url: "/v1/asks",
        headers: { ...USER_MUTATION_HEADERS, "content-type": "application/x-www-form-urlencoded" },
        payload: "question_line=hello"
      });
      expect(unsupported.statusCode).toBe(415);
      expect(unsupported.json()).toEqual({ error: "UNSUPPORTED_MEDIA_TYPE", message: "UNSUPPORTED_MEDIA_TYPE" });

      const registerEmpty = await api.inject({
        method: "POST", url: "/v1/auth/register", headers: JSON_HEADERS, payload: ""
      });
      expect(registerEmpty.statusCode).toBe(400);
      expect(registerEmpty.json()).toEqual({ error: "MALFORMED_REQUEST", message: "MALFORMED_REQUEST" });
      expect(failureLog).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });

  it("bounds the password request shape at 1024 bytes before any credential work", async () => {
    const { api, close, registration, sessions, failureLog } = harness();
    try {
      // 513 two-byte characters: under the ceiling in characters, over it in bytes.
      const overByBytes = "é".repeat(AUTH_PASSWORD_MAX_BYTES / 2 + 1);
      const overByLength = "p".repeat(AUTH_PASSWORD_MAX_BYTES + 1);
      const atLimit = "p".repeat(AUTH_PASSWORD_MAX_BYTES);
      const registerBody = (password: string) => ({
        email: "alice@example.test", password, recovery_email: "", adult_affirmed: true
      });

      for (const password of [overByBytes, overByLength]) {
        const refused = await api.inject({
          method: "POST", url: "/v1/auth/register", payload: registerBody(password)
        });
        expect(refused.statusCode).toBe(400);
        expect(refused.json()).toEqual({ error: "MALFORMED_REQUEST" });
      }
      expect(registration.register).not.toHaveBeenCalled();
      const admitted = await api.inject({
        method: "POST", url: "/v1/auth/register", payload: registerBody(atLimit)
      });
      expect(admitted.statusCode).toBe(202);
      expect(registration.register).toHaveBeenCalledTimes(1);

      const login = await api.inject({
        method: "POST", url: "/v1/auth/login", headers: { origin: TEST_APP_ORIGIN },
        payload: { email: "alice@example.test", password: overByLength }
      });
      expect(login.statusCode).toBe(400);
      expect(login.json()).toEqual({ error: "MALFORMED_REQUEST" });
      expect(sessions.beginLogin).not.toHaveBeenCalled();

      const stepUp = await api.inject({
        method: "POST", url: "/v1/auth/step-up", headers: USER_MUTATION_HEADERS,
        payload: { password: overByLength, code: "123456" }
      });
      expect(stepUp.statusCode).toBe(400);
      expect(stepUp.json()).toEqual({ error: "MALFORMED_REQUEST" });
      expect(sessions.stepUp).not.toHaveBeenCalled();
      expect(failureLog).not.toHaveBeenCalled();
    } finally {
      await close();
    }
  });
});
