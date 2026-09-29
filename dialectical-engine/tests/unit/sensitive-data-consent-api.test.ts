import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { SENSITIVE_DATA_NOTICE_VERSION } from "@debateai/contract";
import type { SessionApplication } from "../../apps/api/src/sessions.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

/* Sensitive-data consent — the API half (V's ruling of 2026-09-29): an account that has not
   agreed starts no debate; agreeing once, from a live session, lets it debate. */

const ASK = Object.freeze({
  question_line: "Should a state church be disestablished?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low",
  plan_tier: "free",
  depth_params: { depth: 1 },
  decision_scope: "test-layer scope",
  as_of: "2026-08-07T00:00:00.000Z",
  steering_presets: [],
  steering_annotations: []
});

function askSpy(): { app: AskApplication; submitted: () => number } {
  let submissions = 0;
  const app = new Proxy({}, {
    get: (_target, property) => property === "submit"
      ? async () => {
        submissions += 1;
        return { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" };
      }
      : async () => null
  }) as AskApplication;
  return { app, submitted: () => submissions };
}

/** A session application whose account has not agreed until `recordSensitiveDataConsent` runs. */
function consentingSessions(identity: ReturnType<typeof testHttpIdentity>): {
  sessions: SessionApplication;
  recorded: Array<{ noticeVersion: string; locale: string }>;
} {
  const recorded: Array<{ noticeVersion: string; locale: string }> = [];
  return {
    recorded,
    sessions: {
      ...testSessionApplication([identity]),
      readSensitiveDataConsent: async () => recorded.length > 0 ? "given" : "required",
      recordSensitiveDataConsent: async (_session, input) => { recorded.push({ ...input }); return "given"; }
    }
  };
}

describe("sensitive-data consent before the first debate", () => {
  it("refuses POST /v1/asks with 403 SENSITIVE_DATA_CONSENT_REQUIRED and never submits", async () => {
    const identity = testHttpIdentity("no-consent");
    const { sessions } = consentingSessions(identity);
    const asks = askSpy();
    const api = buildApi({ application: asks.app, sessions, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ASK
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({
        error: "SENSITIVE_DATA_CONSENT_REQUIRED", message: "SENSITIVE_DATA_CONSENT_REQUIRED"
      });
      expect(asks.submitted()).toBe(0);
    } finally {
      await api.close();
    }
  });

  it("reports required, records the agreement with its version and locale, then admits the debate", async () => {
    const identity = testHttpIdentity("consents");
    const { sessions, recorded } = consentingSessions(identity);
    const asks = askSpy();
    const api = buildApi({ application: asks.app, sessions, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const before = await api.inject({
        method: "GET", url: "/v1/account/sensitive-data-consent", headers: testSessionHeaders(identity)
      });
      expect(before.json()).toEqual({ status: "required" });

      const given = await api.inject({
        method: "POST", url: "/v1/account/sensitive-data-consent", headers: testSessionHeaders(identity, true),
        payload: { notice_version: SENSITIVE_DATA_NOTICE_VERSION, locale: "ro" }
      });
      expect(given.statusCode).toBe(200);
      expect(given.json()).toEqual({ status: "given" });
      expect(recorded).toEqual([{ noticeVersion: SENSITIVE_DATA_NOTICE_VERSION, locale: "ro" }]);

      const after = await api.inject({
        method: "GET", url: "/v1/account/sensitive-data-consent", headers: testSessionHeaders(identity)
      });
      expect(after.json()).toEqual({ status: "given" });

      const ask = await api.inject({
        method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ASK
      });
      expect(ask.statusCode).toBe(202);
      expect(asks.submitted()).toBe(1);
    } finally {
      await api.close();
    }
  });

  it.each([
    ["a stale notice version", { notice_version: "2020-01-01", locale: "en" }],
    ["a malformed locale", { notice_version: SENSITIVE_DATA_NOTICE_VERSION, locale: "EN_us!" }],
    ["an extra field", { notice_version: SENSITIVE_DATA_NOTICE_VERSION, locale: "en", given: true }],
    ["no body", undefined]
  ])("refuses %s as a bad request and records nothing", async (_label, payload) => {
    const identity = testHttpIdentity("bad-body");
    const { sessions, recorded } = consentingSessions(identity);
    const api = buildApi({ application: askSpy().app, sessions, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/account/sensitive-data-consent", headers: testSessionHeaders(identity, true),
        ...(payload === undefined ? {} : { payload })
      });
      expect(response.statusCode).toBe(400);
      expect(recorded).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it("needs a session and the CSRF pair to agree", async () => {
    const identity = testHttpIdentity("csrf");
    const { sessions, recorded } = consentingSessions(identity);
    const api = buildApi({ application: askSpy().app, sessions, allowedOrigin: TEST_APP_ORIGIN });
    const payload = { notice_version: SENSITIVE_DATA_NOTICE_VERSION, locale: "en" };
    try {
      const anonymous = await api.inject({ method: "POST", url: "/v1/account/sensitive-data-consent", payload });
      expect(anonymous.statusCode).toBe(401);
      const noCsrf = await api.inject({
        method: "POST", url: "/v1/account/sensitive-data-consent", headers: testSessionHeaders(identity), payload
      });
      expect(noCsrf.statusCode).toBe(403);
      expect(recorded).toEqual([]);
    } finally {
      await api.close();
    }
  });

  it("fails closed when the consent store is not wired: no debate is admitted", async () => {
    const identity = testHttpIdentity("unwired");
    const { readSensitiveDataConsent: _read, recordSensitiveDataConsent: _record, ...unwired }
      = testSessionApplication([identity]);
    const asks = askSpy();
    const api = buildApi({ application: asks.app, sessions: unwired, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true), payload: ASK
      });
      expect(response.statusCode).toBe(503);
      expect(response.json().error).toBe("SENSITIVE_DATA_CONSENT_UNAVAILABLE");
      expect(asks.submitted()).toBe(0);
    } finally {
      await api.close();
    }
  });
});
