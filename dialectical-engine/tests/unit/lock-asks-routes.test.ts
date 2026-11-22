// PREVIEW_ASKS_OPEN_TO on the API's five front doors and submit: with asks open, a signed-in account outside the (empty)
// team passes the team rule everywhere it applies; a principal with no user id is still refused. Each case is a pair:
// the same request with the setting absent gets today's team refusal.
import { describe, expect, it } from "vitest";
import { buildApi, evaluateAskAdmission, PostgresAskApplication, type AskApplication, type RunCreationSettings } from "@debateai/api";
import type { AskRequest, StartListsEvent } from "@debateai/contract";
import { parsePreviewProviderTestConfig } from "@debateai/providers";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { CountryGate } from "../../apps/api/src/country-gate.js";
import { SavedQuestionRefused, type SavedQuestionGate, type SavedQuestionService } from "../../apps/api/src/saved-questions/service.js";
import { newStartStepKey } from "../../apps/api/src/start-step/signing.js";
import type { StartListsInput, StartStepPort } from "../../apps/api/src/start-step/step.js";
import { parseStartStepFrames } from "@debateai/contract";
import { TEST_APP_ORIGIN, testHttpIdentity, testSessionApplication, testSessionHeaders, type TestHttpIdentity } from "../support/httpSession.js";
import { questionCheckPass } from "../support/questionCheckPass.js";
import { testReleaseKey } from "../support/releaseKey.js";

const MODEL = "zai-org/GLM-5.3-Flash";
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;
const ASK = Object.freeze({
  question_line: "Should cities price congestion on central roads?", risk_tier: "casual", tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:test", composition_budget_tier: "low", plan_tier: "free", depth_params: { depth: 1 },
  decision_scope: "test-layer scope", as_of: "2026-10-08T00:00:00.000Z", steering_presets: [], steering_annotations: []
});
const QUESTION = "Should the town build a second pier?";
const PURPOSE = { text: "What do you want the answer for?", answers: ["To vote on it", "To write to the council"] };
/** Both modes of the same preview: asks open to everyone (with an empty team, as the parser demands) or today's team rule. */
const MODES = [["open", true], ["absent", false]] as const;
const previewOptions = (open: boolean) => ({ previewProviderTestConfig: PREVIEW, previewTeamUserIds: [] as readonly string[],
  ...(open ? { previewAsksOpen: true as const } : {}) });

type Counters = { submitted: number; probes: number; quota: number };
function askApplication(counters: Counters): AskApplication {
  const settings = {
    previewProviderTestConfig: PREVIEW,
    previewBudgetGate: { remaining: { deepinfra: async () => ({ state: "active", windowOpen: true, remainingNanoUsd: 1_000_000_000_000n, remainingCalls: 100_000,
      maxConcurrentCalls: 4, largestReservationNanoUsd: 72_499_200n, enabledModels: [MODEL] }) },
      roleModels: { answerWriter: MODEL, answerChecker: MODEL, storyteller: null, storyChecker: null }, storyRounds: 0,
      callOutputTokens: { debate: 8192, storyteller: 0, storytellerRetry: 0, storyChecker: 0 }, askProbeModelIds: [], roleProviderRefs: [],
      maxCooldownHoldsPerRun: 0, readUnfinishedRuns: async () => [], termsForVersion: async () => { throw new Error("FIXTURE_HAS_NO_UNFINISHED_DEBATES"); } },
    strangerSampleRate: 0, releaseKey: testReleaseKey(5), registerVersion: 5, batteryVersion: "fixture", settlementWatchHandle: "fixture",
    resolveDiscoveredPanel: async () => {
      counters.probes += 1;
      return [{ provider_ref: "preview:fixture-a", maker: "Z.AI", model_id: MODEL, probe_evidence_ref: "fixture:probe", probed_at: "2026-10-08T00:00:00Z" }];
    },
    resolveEnvelopeBasis: async (input: { panelSize: number }) => ({ panel_size: input.panelSize, max_model_attempts: 8 }),
    resolveRisk: (effectiveRiskTier: string, tierSource: string, tierProvenanceRef: string) => ({ effectiveRiskTier, tierSource, tierProvenanceRef })
  } as unknown as RunCreationSettings;
  return new Proxy({}, {
    get: (_target, property) => property === "submit"
      ? async (ask: AskRequest) => {
        counters.submitted += 1;
        await evaluateAskAdmission(settings, ask);
        return { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" };
      }
      : async () => null
  }) as AskApplication;
}

describe("POST /v1/asks: the pre-flight team check", () => {
  it.each(MODES)("%s: a signed-in account outside the team", async (mode, open) => {
    const stranger = testHttpIdentity(`asks-stranger-${mode}`);
    const counters: Counters = { submitted: 0, probes: 0, quota: 0 };
    const admission = { decide: () => { counters.quota += 1; return { allowed: true }; } } as unknown as AdmissionLimiter;
    const countryGate = { recordedCountry: () => null, ask: () => null } as unknown as CountryGate;
    const sessions = { ...testSessionApplication([stranger]), readSensitiveDataConsent: async () => "given" as const };
    const api = buildApi({ ...previewOptions(open), application: askApplication(counters), questionCheck: questionCheckPass, sessions, admission,
      countryGate, allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await api.inject({ method: "POST", url: "/v1/asks", headers: testSessionHeaders(stranger, true), payload: ASK });
      if (open) {
        // Past the team rule: the asks budget, the submit and its discovery probe all ran, as for a team member today.
        expect(response.statusCode).toBe(202);
        expect(counters).toEqual({ submitted: 1, probes: 1, quota: 1 });
      } else {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ error: "PREVIEW_TEAM_ONLY" });
        expect(counters).toEqual({ submitted: 0, probes: 0, quota: 0 });
      }
    } finally {
      await api.close();
    }
  });
});

describe("POST /v1/asks/clarify", () => {
  it.each(MODES)("%s: a signed-in account outside the team", async (mode, open) => {
    const stranger = testHttpIdentity(`clarify-stranger-${mode}`);
    const seen: string[] = [];
    const sessions = { ...testSessionApplication([stranger]), readSensitiveDataConsent: async () => "given" };
    const application = { submit: async () => { throw new Error("not reached"); } } as unknown as AskApplication;
    const api = buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, ...previewOptions(open),
      askClarify: { read: async (_ownerRef: string, question: string) => { seen.push(question); return { source: "AI" as const, questions: [], purpose: PURPOSE }; } }
    } as never);
    try {
      const response = await api.inject({ method: "POST", url: "/v1/asks/clarify", headers: testSessionHeaders(stranger, true), payload: { question_line: QUESTION } });
      expect(response.statusCode).toBe(200);
      expect(response.json().source).toBe(open ? "AI" : "NONE");
      expect(seen).toEqual(open ? [QUESTION] : []);
    } finally {
      await api.close();
    }
  });
});

describe("POST /v1/asks/paths/lists (the calls before Start)", () => {
  it.each(MODES)("%s: a signed-in account outside the team", async (mode, open) => {
    const stranger = testHttpIdentity(`start-step-stranger-${mode}`);
    const key = newStartStepKey();
    const seen: StartListsInput[] = [];
    const unused = async () => { throw new Error("not reached"); };
    const port = Object.freeze({
      route: "PREVIEW" as const,
      async lists(input: StartListsInput, emit: (event: StartListsEvent) => void) { seen.push(input); emit({ event: "end", data: { reason: "DONE" } }); },
      merge: unused, combine: unused, fit: unused
    }) as unknown as StartStepPort;
    const sessions = { ...testSessionApplication([stranger]), readSensitiveDataConsent: async () => "given" as const };
    const application = { readRun: async () => null } as unknown as AskApplication;
    const api = buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, startStep: port, startStepKey: key,
      admissionView: async () => Object.freeze({ registerVersion: 31, modelScorecardInForce: false }), ...previewOptions(open) });
    try {
      const response = await api.inject({ method: "POST", url: "/v1/asks/paths/lists", headers: testSessionHeaders(stranger, true),
        payload: { question_line: "Should the town build a second ferry pier before next summer?", reading_level: "plain" } });
      expect(response.statusCode).toBe(200);
      const events = parseStartStepFrames(response.body).events.map((one) => ({ event: one.event, data: one.data }));
      if (open) {
        expect(seen).toHaveLength(1);
        expect(events).toEqual([{ event: "end", data: { reason: "DONE" } }]);
      } else {
        expect(seen).toEqual([]);
        expect(events).toEqual([{ event: "none", data: { reason: "NOT_ASKED" } }, { event: "end", data: { reason: "NONE" } }]);
      }
    } finally {
      await api.close();
    }
  });
});

describe("the saved questions' routes", () => {
  it.each(MODES)("%s: the team rule the service is handed for an account outside the team", async (mode, open) => {
    const stranger = testHttpIdentity(`saved-stranger-${mode}`);
    const gates: SavedQuestionGate[] = [];
    const service = {
      list: async (_caller: unknown, gate: SavedQuestionGate) => { gates.push(gate); throw new SavedQuestionRefused("SAVED_QUESTIONS_OFF"); }
    } as unknown as SavedQuestionService;
    const sessions = { ...testSessionApplication([stranger]), readSensitiveDataConsent: async () => "given" as const };
    const application = { submit: async () => { throw new Error("not reached"); } } as unknown as AskApplication;
    const api = buildApi({ application, sessions, allowedOrigin: TEST_APP_ORIGIN, savedQuestions: service, ...previewOptions(open) });
    try {
      const response = await api.inject({ method: "GET", url: "/v1/account/saved-questions", headers: testSessionHeaders(stranger, true) });
      expect(response.statusCode).toBe(409);
      expect(gates.map((gate) => gate.teamAdmits)).toEqual([open]);
    } finally {
      await api.close();
    }
  });
});

describe("PostgresAskApplication.submit (the second check)", () => {
  const PAST_GATE = "PAST_THE_TEAM_GATE";
  const stranger = testHttpIdentity("submit-stranger");
  const server = (identity: TestHttpIdentity) => Object.freeze({ kind: "server" as const, userId: identity.authenticated.userId, ownerRef: identity.authenticated.ownerRef });
  function self(extra: Partial<RunCreationSettings>, reads: { billing: number }) {
    return { settings: { billing: { clock: () => { reads.billing += 1; throw new Error(PAST_GATE); } }, ...extra } };
  }
  const submit = (that: unknown, session: unknown, principal: unknown) =>
    PostgresAskApplication.prototype.submit.call(that as never, ASK as unknown as AskRequest, session as never, principal as never);

  it.each(MODES)("%s: a server principal outside the team", async (_mode, open) => {
    const reads = { billing: 0 };
    const that = self(previewOptions(open) as Partial<RunCreationSettings>, reads);
    if (open) await expect(submit(that, stranger.authenticated.session, server(stranger))).rejects.toThrow(PAST_GATE);
    else await expect(submit(that, stranger.authenticated.session, server(stranger))).rejects.toMatchObject({ name: "AskRefusal", code: "PREVIEW_TEAM_ONLY" });
    expect(reads.billing).toBe(open ? 1 : 0);
  });

  it("open: a legacy principal, which has no user id, is still refused PREVIEW_TEAM_ONLY", async () => {
    const reads = { billing: 0 };
    const legacySession = Object.freeze({ ...stranger.authenticated.session, ownership_provenance: "legacy_cookie", asker_id: "legacy-asker" });
    await expect(submit(self(previewOptions(true) as Partial<RunCreationSettings>, reads), legacySession, { kind: "legacy", legacyAskerId: "legacy-asker" }))
      .rejects.toMatchObject({ name: "AskRefusal", code: "PREVIEW_TEAM_ONLY" });
    expect(reads.billing).toBe(0);
  });
});

describe("open asks still need a signed-in account", () => {
  it("POST /v1/asks with no session is refused, open or not", async () => {
    for (const [, open] of MODES) {
      const counters: Counters = { submitted: 0, probes: 0, quota: 0 };
      const api = buildApi({ ...previewOptions(open), application: askApplication(counters), questionCheck: questionCheckPass,
        sessions: testSessionApplication([]), allowedOrigin: TEST_APP_ORIGIN });
      try {
        const response = await api.inject({ method: "POST", url: "/v1/asks", headers: { origin: TEST_APP_ORIGIN }, payload: ASK });
        expect(response.statusCode).toBeGreaterThanOrEqual(400);
        expect(response.statusCode).toBeLessThan(500);
        expect(counters.submitted).toBe(0);
      } finally {
        await api.close();
      }
    }
  });
});
