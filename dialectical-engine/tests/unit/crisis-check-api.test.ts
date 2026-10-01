import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { CRISIS_SUPPORT_OFFERED } from "@debateai/contract";
import type { SessionApplication } from "../../apps/api/src/sessions.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

/* Crisis check — the API half (V, 2026-09-30): a question that reads as a person in crisis is
   refused with CRISIS_SUPPORT_OFFERED before any other rule, so the person is sent to help
   numbers, no debate is submitted and no quota is spent. */

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

function sessionsWithConsent(
  identity: ReturnType<typeof testHttpIdentity>,
  consent: "given" | "required"
): { sessions: SessionApplication; consentReads: () => number } {
  let reads = 0;
  return {
    consentReads: () => reads,
    sessions: {
      ...testSessionApplication([identity]),
      readSensitiveDataConsent: async () => { reads += 1; return consent; },
      recordSensitiveDataConsent: async () => "given"
    }
  };
}

describe("crisis check before a debate starts", () => {
  it.each([
    ["English", "Should I kill myself?"],
    ["a method question", "What is the most painless way to die?"],
    ["someone close", "My best friend wants to kill herself, what do I do?"]
  ])("refuses %s with 422 CRISIS_SUPPORT_OFFERED and submits nothing", async (_label, question) => {
    const identity = testHttpIdentity("crisis");
    const { sessions } = sessionsWithConsent(identity, "given");
    const asks = askSpy();
    const api = buildApi({ application: asks.app, sessions, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
        payload: { ...ASK, question_line: question }
      });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({
        error: CRISIS_SUPPORT_OFFERED, message: CRISIS_SUPPORT_OFFERED, country: null
      });
      expect(asks.submitted()).toBe(0);
    } finally {
      await api.close();
    }
  });

  it("answers before the consent rule: a person in crisis is never asked to consent first", async () => {
    const identity = testHttpIdentity("crisis-no-consent");
    const { sessions, consentReads } = sessionsWithConsent(identity, "required");
    const asks = askSpy();
    const api = buildApi({ application: asks.app, sessions, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
        payload: { ...ASK, question_line: "I want to die" }
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error).toBe(CRISIS_SUPPORT_OFFERED);
      expect(consentReads()).toBe(0);
      expect(asks.submitted()).toBe(0);
    } finally {
      await api.close();
    }
  });

  it("names the edge's country so the screen can show that country's helplines first", async () => {
    const identity = testHttpIdentity("crisis-country");
    const { sessions } = sessionsWithConsent(identity, "given");
    const api = buildApi({ application: askSpy().app, sessions, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/asks",
        headers: { ...testSessionHeaders(identity, true), "cf-ipcountry": "RO" },
        payload: { ...ASK, question_line: "vreau să mă sinucid" }
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().country).toBe("RO");
    } finally {
      await api.close();
    }
  });

  it("lets a policy question about suicide become a debate", async () => {
    const identity = testHttpIdentity("policy");
    const { sessions } = sessionsWithConsent(identity, "given");
    const asks = askSpy();
    const api = buildApi({ application: asks.app, sessions, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
        payload: { ...ASK, question_line: "Should assisted suicide be legal for terminally ill adults?" }
      });
      expect(response.statusCode).toBe(202);
      expect(asks.submitted()).toBe(1);
    } finally {
      await api.close();
    }
  });
});
