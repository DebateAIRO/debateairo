import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildApi, type AskApplication } from "@debateai/api";
import { CRISIS_SUPPORT_OFFERED } from "@debateai/contract";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { CountryGate } from "../../apps/api/src/country-gate.js";
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

  // V, 2026-10-01: "make sure this crisis check is done in the pre-flight. if a question is
  // flagged as a crisis thing, no debate start and do the crisis workflow." Every rule that
  // could refuse the ask some other way comes after the crisis check, so the person gets help
  // numbers, never a quota, country or malformed-request refusal instead.
  it("answers before the quota and the country rule, and touches neither", async () => {
    const identity = testHttpIdentity("crisis-preflight");
    const { sessions } = sessionsWithConsent(identity, "given");
    const asks = askSpy();
    let quotaReads = 0;
    let countryReads = 0;
    const admission = { decide: () => {
      quotaReads += 1;
      return { allowed: false, reason: "ASKS_EXHAUSTED", retryAfterMs: 60_000, windowMs: 60_000 };
    } } as unknown as AdmissionLimiter;
    const countryGate = {
      // The session's source record reads it (recorded, never decisive): not a refusal.
      recordedCountry: () => null,
      ask: () => { countryReads += 1; return "COUNTRY_ASK_BLOCKED"; }
    } as unknown as CountryGate;
    const api = buildApi({ application: asks.app, sessions, admission, countryGate, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const crisis = await api.inject({
        method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
        payload: { ...ASK, question_line: "I want to kill myself tonight" }
      });
      expect(crisis.statusCode).toBe(422);
      expect(crisis.json().error).toBe(CRISIS_SUPPORT_OFFERED);
      expect([quotaReads, countryReads, asks.submitted()]).toEqual([0, 0, 0]);
      // The same route still applies its rules to every other question.
      const policy = await api.inject({
        method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
        payload: { ...ASK }
      });
      expect(policy.statusCode).toBe(429);
      expect(quotaReads).toBe(1);
    } finally {
      await api.close();
    }
  });

  it("answers a crisis question even when the rest of the ask is malformed", async () => {
    const identity = testHttpIdentity("crisis-malformed");
    const { sessions } = sessionsWithConsent(identity, "given");
    const asks = askSpy();
    const api = buildApi({ application: asks.app, sessions, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await api.inject({
        method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
        payload: { question_line: "我想死" }
      });
      expect(response.statusCode).toBe(422);
      expect(response.json().error).toBe(CRISIS_SUPPORT_OFFERED);
      expect(asks.submitted()).toBe(0);
    } finally {
      await api.close();
    }
  });

  it("stays the first step of the ask pre-flight: nothing in the route runs before it", () => {
    // A later pre-flight check of the question (the hate-speech check, S03) belongs after this
    // line: a person in crisis must never meet its refusal or its "check unavailable" message,
    // and their words must not reach its judge model.
    const source = readFileSync(new URL("../../apps/api/src/index.ts", import.meta.url), "utf8");
    const start = source.indexOf('api.post("/v1/asks"');
    expect(start).toBeGreaterThan(-1);
    const handler = source.slice(start, source.indexOf("\n  api.", start + 1));
    const crisisAt = handler.indexOf("detectCrisis(questionLine)");
    expect(crisisAt).toBeGreaterThan(-1);
    const beforeCrisis = handler.slice(0, crisisAt).replace(/\/\/.*$/gm, "");
    expect(beforeCrisis).not.toMatch(/\bawait\b|\boptions\.|admitOrRefuse|parseRequest|reply\.status/);
  });
});
