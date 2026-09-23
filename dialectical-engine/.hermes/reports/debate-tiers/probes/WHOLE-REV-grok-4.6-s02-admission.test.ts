// Independent WHOLE-REV-grok-4.6 probe: S02 R3–R9 + acceptance 5–7 from SPEC-v2,
// not from the author's suite. Deleted before handoff.

import { describe, expect, it } from "vitest";
import {
  AskRefusal,
  buildApi,
  evaluateAskAdmission,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { PLAN_TIER_ROSTERS, type AskRequest } from "@debateai/contract";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const HTTP_IDENTITY = testHttpIdentity("whole-rev-s02");
const HTTP_HEADERS = testSessionHeaders(HTTP_IDENTITY, true);

function ask(planTier: AskRequest["plan_tier"]): AskRequest {
  return {
    question_line: "Independent whole-rev probe of the tier filter.",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:whole-rev",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "whole-rev probe",
    as_of: "2026-09-12T00:00:00.000Z",
    steering_presets: [],
    plan_tier: planTier,
    steering_annotations: []
  };
}

function member(modelId: string, provider: string, maker = `maker:${provider}`) {
  return Object.freeze({
    provider_ref: `provider:${provider}`,
    maker,
    model_id: modelId,
    probe_evidence_ref: `probe:${provider}`,
    probed_at: "2026-09-12T00:00:00.000Z"
  });
}

function settingsFor(
  discoveredPanel: readonly ReturnType<typeof member>[],
  observedPanelSizes: number[] = []
): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "battery:whole-rev",
    settlementWatchHandle: "watch:whole-rev",
    resolveDiscoveredPanel: async () => discoveredPanel,
    resolveEnvelopeBasis: async ({ panelSize }) => {
      observedPanelSizes.push(panelSize);
      return { max_model_attempts: 1 };
    },
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier,
      tierSource,
      tierProvenanceRef
    })
  };
}

function applicationWithSubmit(submit: AskApplication["submit"]): AskApplication {
  return {
    withContentLease: async (_runId, use) => use(),
    submit,
    readAnswer: async () => null,
    readRunAnswer: async () => null,
    readRun: async () => null,
    readAnswerIndex: async (_session, limit, offset) => ({
      items: [], open_runs: [], limit, offset, total: 0
    }),
    readInspection: async () => null,
    readLedgerDigest: async () => null,
    readNode: async () => null,
    recordInvestigation: async () => null,
    unlinkMemoryLink: async () => null,
    readDeployment: async () => ({
      register: { register_version: 1, rows: [] },
      scorecards: [],
      model_ledger: [],
      fleet: { state: "UNAVAILABLE", reason: "NO_TYPED_FLEET_SOURCE" }
    }),
    events: async function* () {}
  };
}

async function refusalOf(
  discoveredPanel: readonly ReturnType<typeof member>[],
  planTier: AskRequest["plan_tier"]
): Promise<AskRefusal> {
  try {
    await evaluateAskAdmission(settingsFor(discoveredPanel), ask(planTier));
    throw new Error("expected refusal");
  } catch (error) {
    if (error instanceof AskRefusal) return error;
    throw error;
  }
}

describe("WHOLE-REV independent S02 admission probe", () => {
  it("R3/R4: free keeps only roster members, in roster order, panelSize=2", async () => {
    const sizes: number[] = [];
    const result = await evaluateAskAdmission(settingsFor([
      member("gpt-5.6-sol", "sol"),
      member("claude-sonnet-5", "sonnet"),
      member("gpt-5.6-luna", "luna"),
      member("extra-model", "extra")
    ], sizes), ask("free"));
    expect(result.discoveredPanel.map((row) => row.model_id)).toEqual([...PLAN_TIER_ROSTERS.free]);
    expect(sizes).toEqual([2]);
  });

  it("R3/R4: premium keeps only roster members, in roster order, panelSize=3", async () => {
    const sizes: number[] = [];
    const result = await evaluateAskAdmission(settingsFor([
      member("grok-4.6", "grok"),
      member("gpt-5.6-luna", "luna"),
      member("claude-opus-5", "opus"),
      member("gpt-5.6-sol", "sol")
    ], sizes), ask("premium"));
    expect(result.discoveredPanel.map((row) => row.model_id)).toEqual([...PLAN_TIER_ROSTERS.premium]);
    expect(sizes).toEqual([3]);
  });

  it("R6/R7/step 7: empty free panel is ASK_PLAN_TIER_MODEL_UNAVAILABLE, never MAKER_INVENTORY_UNSATISFIED, names every member", async () => {
    const error = await refusalOf([
      member("gpt-5.6-sol", "sol"),
      member("claude-opus-5", "opus")
    ], "free");
    expect(error.code).toBe("ASK_PLAN_TIER_MODEL_UNAVAILABLE");
    expect(error.code).not.toBe("MAKER_INVENTORY_UNSATISFIED");
    expect(error.message).toContain("free");
    expect(error.message).toContain("gpt-5.6-luna");
    expect(error.message).toContain("claude-sonnet-5");
  });

  it("R6/R7: a single missing premium member names only that member", async () => {
    const error = await refusalOf([
      member("gpt-5.6-sol", "sol"),
      member("claude-opus-5", "opus")
    ], "premium");
    expect(error.code).toBe("ASK_PLAN_TIER_MODEL_UNAVAILABLE");
    expect(error.message).toContain("premium");
    expect(error.message).toContain("grok-4.6");
    expect(error.message).not.toContain("gpt-5.6-luna");
  });

  it("R7: several missing premium members are all named", async () => {
    const error = await refusalOf([member("gpt-5.6-sol", "sol")], "premium");
    expect(error.message).toContain("claude-opus-5");
    expect(error.message).toContain("grok-4.6");
  });

  it("R5: a fully present roster spanning two makers is CAPABLE (no critic cap)", async () => {
    const result = await evaluateAskAdmission(settingsFor([
      member("gpt-5.6-luna", "luna", "OpenAI"),
      member("claude-sonnet-5", "sonnet", "Anthropic")
    ]), ask("free"));
    expect(result.criticUnavailableCap.serves).toBe(true);
    expect(result.criticUnavailableCap.confidenceBandCapRequired).toBe(false);
  });

  it("R8/R9 + S02-6/7: POST /v1/asks 422 names every missing member and never starts a run", async () => {
    let started = 0;
    const api = buildApi({
      application: applicationWithSubmit(async (submittedAsk) => {
        await evaluateAskAdmission(settingsFor([
          member("gpt-5.6-sol", "sol"),
          member("claude-opus-5", "opus")
        ]), submittedAsk);
        started += 1;
        return { run_ref: "should-not-run", status: "QUEUED" };
      }),
      sessions: testSessionApplication([HTTP_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN
    });
    const missing = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: HTTP_HEADERS,
      payload: ask("free")
    });
    expect(missing.statusCode).toBe(422);
    expect(missing.json()).toMatchObject({
      error: "ASK_PLAN_TIER_MODEL_UNAVAILABLE"
    });
    expect(String(missing.json().message)).toContain("gpt-5.6-luna");
    expect(String(missing.json().message)).toContain("claude-sonnet-5");
    expect(String(missing.json().error)).not.toBe("MAKER_INVENTORY_UNSATISFIED");
    expect(started).toBe(0);
    await api.close();

    const schemaApi = buildApi({
      application: applicationWithSubmit(async () => ({ run_ref: "x", status: "QUEUED" })),
      sessions: testSessionApplication([HTTP_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN
    });
    const gold = await schemaApi.inject({
      method: "POST",
      url: "/v1/asks",
      headers: HTTP_HEADERS,
      payload: { ...ask("free"), plan_tier: "gold" }
    });
    expect(gold.statusCode).toBe(400);
    expect(gold.json()).toMatchObject({ error: "MALFORMED_REQUEST" });

    const none = await schemaApi.inject({
      method: "POST",
      url: "/v1/asks",
      headers: HTTP_HEADERS,
      payload: (({ plan_tier: _dropped, ...rest }) => rest)(ask("free"))
    });
    expect(none.statusCode).toBe(400);
    expect(none.json()).toMatchObject({ error: "MALFORMED_REQUEST" });
    await schemaApi.close();
  });

  it("S01-R14: POST /v1/asks 202 for free and premium when the roster is fully present", async () => {
    let seen: AskRequest | null = null;
    const api = buildApi({
      application: applicationWithSubmit(async (submitted) => {
        seen = submitted;
        return { run_ref: "11111111-1111-4111-8111-111111111111", status: "QUEUED" };
      }),
      sessions: testSessionApplication([HTTP_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN
    });
    const free = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: HTTP_HEADERS,
      payload: ask("free")
    });
    expect(free.statusCode).toBe(202);
    expect(seen?.plan_tier).toBe("free");
    const premium = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: HTTP_HEADERS,
      payload: ask("premium")
    });
    expect(premium.statusCode).toBe(202);
    expect(seen?.plan_tier).toBe("premium");
    await api.close();
  });
});

