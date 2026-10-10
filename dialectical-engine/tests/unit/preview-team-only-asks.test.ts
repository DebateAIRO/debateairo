// Step 1 (owner, 2026-10-08): on the private preview (PREVIEW_PROVIDER_TEST_CONFIG_JSON set)
// the company pays DeepInfra for every GLM call, so only the team (PREVIEW_TEAM_USER_IDS_JSON)
// may start a debate. Everyone else is refused 403 PREVIEW_TEAM_ONLY before any quota use,
// discovery probe or spend. The crisis check stays first and the consent check second.
import { describe, expect, it } from "vitest";
import {
  buildApi,
  evaluateAskAdmission,
  PostgresAskApplication,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { CRISIS_SUPPORT_OFFERED, SENSITIVE_DATA_CONSENT_REQUIRED, type AskRequest } from "@debateai/contract";
import { parsePreviewProviderTestConfig } from "@debateai/providers";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import type { CountryGate } from "../../apps/api/src/country-gate.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders,
  type TestHttpIdentity
} from "../support/httpSession.js";

const MODEL = "zai-org/GLM-5.3-Flash";
const PREVIEW = parsePreviewProviderTestConfig(JSON.stringify({
  deployment: "v3-preview", free_model_ids: [MODEL], requested_thinking_level: "high",
  budget_socket: "/run/debateai-v3-preview/provider-budget.sock", scope_id: "fixture"
}))!;
const ASK = Object.freeze({
  question_line: "Should cities price congestion on central roads?",
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker-declaration:test",
  composition_budget_tier: "low",
  plan_tier: "free",
  depth_params: { depth: 1 },
  decision_scope: "test-layer scope",
  as_of: "2026-10-08T00:00:00.000Z",
  steering_presets: [],
  steering_annotations: []
});

type Counters = { submitted: number; probes: number; quota: number; country: number };

/**
 * The application the route hands an admitted ask to. Its submit runs the REAL admission
 * evaluation, whose discovery resolver is where the paid probe happens, so a probe counted
 * here is a probe the route let through.
 */
function application(counters: Counters): AskApplication {
  const settings: RunCreationSettings = {
    previewProviderTestConfig: PREVIEW,
    // The preview's start-of-debate estimate: an ample pot (tests/unit/preview-budget-estimate.test.ts covers refusals).
    previewBudgetGate: {remaining:{deepinfra:async()=>({state:"active",windowOpen:true,remainingNanoUsd:3_000_000_000n,remainingCalls:1200,maxConcurrentCalls:4,largestReservationNanoUsd:131_481_600n,enabledModels:[MODEL]})},roleModelIds:[],storyCalls:0,roleProviderRefs:[],maxCooldownHoldsPerRun:0,readUnfinishedRuns:async()=>[]},
    strangerSampleRate: 0, registerVersion: 5, batteryVersion: "fixture", settlementWatchHandle: "fixture",
    resolveDiscoveredPanel: async () => {
      counters.probes += 1;
      return [{ provider_ref: "preview:fixture-a", maker: "Z.AI", model_id: MODEL, probe_evidence_ref: "fixture:probe", probed_at: "2026-10-08T00:00:00Z" }];
    },
    resolveEnvelopeBasis: async (input) => ({ panel_size: input.panelSize, max_model_attempts: 8 }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({ effectiveRiskTier, tierSource, tierProvenanceRef })
  } as RunCreationSettings;
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

function harness(input: Readonly<{
  team?: readonly string[];
  preview?: boolean;
  identities: readonly TestHttpIdentity[];
  consent?: "given" | "required";
}>) {
  const counters: Counters = { submitted: 0, probes: 0, quota: 0, country: 0 };
  const admission = { decide: () => {
    counters.quota += 1;
    return { allowed: true };
  } } as unknown as AdmissionLimiter;
  const countryGate = {
    recordedCountry: () => null,
    ask: () => { counters.country += 1; return null; }
  } as unknown as CountryGate;
  const sessions = {
    ...testSessionApplication(input.identities),
    readSensitiveDataConsent: async () => input.consent ?? "given"
  };
  const api = buildApi({
    ...(input.preview === false ? {} : {
      previewProviderTestConfig: PREVIEW,
      ...(input.team === undefined ? {} : { previewTeamUserIds: input.team })
    }),
    application: application(counters), sessions, admission, countryGate, allowedOrigin: TEST_APP_ORIGIN
  });
  return { api, counters };
}

async function ask(api: ReturnType<typeof buildApi>, identity: TestHttpIdentity, question: string = ASK.question_line) {
  return api.inject({
    method: "POST", url: "/v1/asks", headers: testSessionHeaders(identity, true),
    payload: { ...ASK, question_line: question }
  });
}

describe("POST /v1/asks on the private preview is for the team only", () => {
  it("refuses a signed-in person outside the team with 403 PREVIEW_TEAM_ONLY, before quota, country, submit or probe", async () => {
    const member = testHttpIdentity("team-member");
    const outsider = testHttpIdentity("outsider");
    const { api, counters } = harness({ team: [member.authenticated.userId], identities: [member, outsider] });
    try {
      const response = await ask(api, outsider);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "PREVIEW_TEAM_ONLY" });
      expect(counters).toEqual({ submitted: 0, probes: 0, quota: 0, country: 0 });
    } finally {
      await api.close();
    }
  });

  it("lets a team member through exactly as before: quota, country, submit and the discovery probe", async () => {
    const member = testHttpIdentity("team-member-proceeds");
    const { api, counters } = harness({ team: [member.authenticated.userId], identities: [member] });
    try {
      const response = await ask(api, member);
      expect(response.statusCode).toBe(202);
      expect(counters).toEqual({ submitted: 1, probes: 1, quota: 1, country: 1 });
    } finally {
      await api.close();
    }
  });

  it.each([
    ["missing", undefined],
    ["empty", []]
  ] as const)("refuses everyone when the team list is %s (fail closed)", async (_name, team) => {
    const person = testHttpIdentity(`no-team-${_name}`);
    const { api, counters } = harness({ ...(team === undefined ? {} : { team }), identities: [person] });
    try {
      const response = await ask(api, person);
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: "PREVIEW_TEAM_ONLY" });
      expect(counters).toEqual({ submitted: 0, probes: 0, quota: 0, country: 0 });
    } finally {
      await api.close();
    }
  });

  it("keeps the crisis check first: a person outside the team in crisis gets help, not a refusal", async () => {
    const outsider = testHttpIdentity("outsider-crisis");
    const { api, counters } = harness({ team: [], identities: [outsider] });
    try {
      const response = await ask(api, outsider, "I want to kill myself tonight");
      expect(response.statusCode).toBe(422);
      expect(response.json().error).toBe(CRISIS_SUPPORT_OFFERED);
      expect(counters).toEqual({ submitted: 0, probes: 0, quota: 0, country: 0 });
    } finally {
      await api.close();
    }
  });

  it("keeps the consent check before it: an outsider who has not agreed is asked to agree first", async () => {
    const outsider = testHttpIdentity("outsider-no-consent");
    const { api, counters } = harness({ team: [], identities: [outsider], consent: "required" });
    try {
      const response = await ask(api, outsider);
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe(SENSITIVE_DATA_CONSENT_REQUIRED);
      expect(counters).toEqual({ submitted: 0, probes: 0, quota: 0, country: 0 });
    } finally {
      await api.close();
    }
  });

  it("applies no team rule off the preview: anyone signed in proceeds", async () => {
    const person = testHttpIdentity("real-site");
    const { api, counters } = harness({ preview: false, identities: [person] });
    try {
      const response = await ask(api, person);
      expect(response.statusCode).toBe(202);
      expect(counters.submitted).toBe(1);
    } finally {
      await api.close();
    }
  });
});

describe("PostgresAskApplication.submit refuses outside the team too (defense in depth)", () => {
  const PAST_GATE = "PAST_THE_TEAM_GATE";
  const member = testHttpIdentity("submit-member");
  const outsider = testHttpIdentity("submit-outsider");
  const server = (identity: TestHttpIdentity) => Object.freeze({
    kind: "server" as const, userId: identity.authenticated.userId, ownerRef: identity.authenticated.ownerRef
  });
  /** `this` for the real submit: billing is the first thing it reads after the team gate. */
  function self(extra: Partial<RunCreationSettings>, reads: { billing: number }) {
    return {
      settings: {
        billing: { clock: () => { reads.billing += 1; throw new Error(PAST_GATE); } },
        ...extra
      }
    };
  }
  const submit = (that: unknown, identity: TestHttpIdentity, principal: unknown) =>
    PostgresAskApplication.prototype.submit.call(
      that as never, ASK as unknown as AskRequest, identity.authenticated.session, principal as never
    );

  it("refuses a server principal outside the team with the ask refusal PREVIEW_TEAM_ONLY, before billing", async () => {
    const reads = { billing: 0 };
    const that = self({ previewProviderTestConfig: PREVIEW, previewTeamUserIds: [member.authenticated.userId] }, reads);
    await expect(submit(that, outsider, server(outsider))).rejects.toMatchObject({ name: "AskRefusal", code: "PREVIEW_TEAM_ONLY" });
    expect(reads.billing).toBe(0);
  });

  it("refuses everyone on the preview when the team list is missing", async () => {
    const reads = { billing: 0 };
    await expect(submit(self({ previewProviderTestConfig: PREVIEW }, reads), member, server(member)))
      .rejects.toMatchObject({ name: "AskRefusal", code: "PREVIEW_TEAM_ONLY" });
    expect(reads.billing).toBe(0);
  });

  it("refuses a legacy principal on the preview: it has no identity user id", async () => {
    const reads = { billing: 0 };
    const legacySession = Object.freeze({ ...outsider.authenticated.session, ownership_provenance: "legacy_cookie", asker_id: "legacy-asker" });
    await expect(PostgresAskApplication.prototype.submit.call(
      self({ previewProviderTestConfig: PREVIEW, previewTeamUserIds: [member.authenticated.userId] }, reads) as never,
      ASK as unknown as AskRequest, legacySession as never, { kind: "legacy", legacyAskerId: "legacy-asker" }
    )).rejects.toMatchObject({ name: "AskRefusal", code: "PREVIEW_TEAM_ONLY" });
    expect(reads.billing).toBe(0);
  });

  it("lets a team member, and anyone off the preview, past the gate", async () => {
    const reads = { billing: 0 };
    await expect(submit(self({ previewProviderTestConfig: PREVIEW, previewTeamUserIds: [member.authenticated.userId] }, reads), member, server(member)))
      .rejects.toThrow(PAST_GATE);
    await expect(submit(self({}, reads), outsider, server(outsider))).rejects.toThrow(PAST_GATE);
    expect(reads.billing).toBe(2);
  });

  it("answers 403 PREVIEW_TEAM_ONLY at the HTTP boundary when only the application layer refuses", async () => {
    const reads = { billing: 0 };
    const that = self({ previewProviderTestConfig: PREVIEW, previewTeamUserIds: [member.authenticated.userId] }, reads);
    const app = new Proxy({}, {
      get: (_target, property) => property === "submit"
        ? (askRequest: AskRequest, session: never, principal: never) =>
          PostgresAskApplication.prototype.submit.call(that as never, askRequest, session, principal)
        : async () => null
    }) as AskApplication;
    // No preview configuration on the API itself: the route's own gate is off.
    const api = buildApi({ application: app, sessions: testSessionApplication([outsider]), allowedOrigin: TEST_APP_ORIGIN });
    try {
      const response = await ask(api, outsider);
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe("PREVIEW_TEAM_ONLY");
      expect(reads.billing).toBe(0);
    } finally {
      await api.close();
    }
  });
});
