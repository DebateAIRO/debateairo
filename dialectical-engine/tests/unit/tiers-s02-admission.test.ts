import { describe, expect, it } from "vitest";
import {
  buildApi,
  evaluateAskAdmission,
  PostgresAskApplication,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import type { AskRequest, Session } from "@debateai/contract";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const HTTP_IDENTITY = testHttpIdentity("tiers-s02-admission");
const HTTP_HEADERS = testSessionHeaders(HTTP_IDENTITY, true);

function ask(planTier: AskRequest["plan_tier"]): AskRequest {
  return {
    question_line: "Which models should debate this question?",
    risk_tier: "casual",
    tier_source: "ASKER",
    tier_provenance_ref: "asker:test",
    composition_budget_tier: "low",
    depth_params: { depth: 1 },
    decision_scope: "tier admission test",
    as_of: "2026-09-12T00:00:00.000Z",
    steering_presets: [],
    plan_tier: planTier,
    steering_annotations: []
  };
}

function member(modelId: string, provider: string) {
  return Object.freeze({
    provider_ref: `provider:${provider}`,
    maker: `maker:${provider}`,
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
    batteryVersion: "battery:test",
    settlementWatchHandle: "watch:test",
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

async function rejectedAdmission(
  discoveredPanel: readonly ReturnType<typeof member>[],
  planTier: AskRequest["plan_tier"]
): Promise<unknown> {
  try {
    await evaluateAskAdmission(settingsFor(discoveredPanel), ask(planTier));
    return null;
  } catch (error) {
    return error;
  }
}

describe("S02 tier roster admission", () => {
  it("filters Free admission to its two models in roster order and sizes the envelope to two", async () => {
    const panelSizes: number[] = [];
    const result = await evaluateAskAdmission(settingsFor([
      member("gpt-5.6-sol", "sol"),
      member("glm-5.3-flash", "glm"),
      member("gpt-5.6-luna", "luna")
    ], panelSizes), ask("free"));

    expect(result.discoveredPanel.map(({ model_id }) => model_id)).toEqual([
      "gpt-5.6-luna",
      "glm-5.3-flash"
    ]);
    expect(panelSizes).toEqual([2]);
  });

  it("filters Premium admission to its three models in roster order and sizes the envelope to three", async () => {
    const panelSizes: number[] = [];
    const result = await evaluateAskAdmission(settingsFor([
      member("gpt-5.6-luna", "luna"),
      member("grok-4.7-build", "grok"),
      member("claude-opus-5", "opus"),
      member("glm-5.3-flash", "glm"),
      member("gpt-5.6-sol", "sol")
    ], panelSizes), ask("premium"));

    expect(result.discoveredPanel.map(({ model_id }) => model_id)).toEqual([
      "gpt-5.6-sol",
      "claude-opus-5",
      "grok-4.7-build"
    ]);
    expect(panelSizes).toEqual([3]);
  });

  it("refuses Free admission with the tier-unavailable code when every roster member is missing", async () => {
    const error = await rejectedAdmission([
      member("gpt-5.6-sol", "sol"),
      member("claude-opus-5", "opus")
    ], "free");

    expect(error).toMatchObject({
      name: "AskRefusal",
      code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
      message: "The free plan needs gpt-5.6-luna, glm-5.3-flash, and they are not available right now"
    });
    expect(error).not.toMatchObject({ code: "MAKER_INVENTORY_UNSATISFIED" });
  });

  // Property: a valid Free ask missing both file-fed ids names both before any run is created.
  // Production break: keep the retired model member in the Free roster.
  it("refuses a Free ask missing both file-fed ids before creating a run", async () => {
    let runCreations = 0;
    const application = applicationWithSubmit(async (submittedAsk) => {
      await evaluateAskAdmission(settingsFor([]), submittedAsk);
      runCreations += 1;
      return { run_ref: RUN_ID, status: "QUEUED" };
    });
    const api = buildApi({
      application,
      sessions: testSessionApplication([HTTP_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN
    });

    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: HTTP_HEADERS,
      payload: ask("free")
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
      message: "The free plan needs gpt-5.6-luna, glm-5.3-flash, and they are not available right now"
    });
    expect(runCreations).toBe(0);
    await api.close();
  });

  it("refuses Premium admission with every missing roster member named", async () => {
    const error = await rejectedAdmission([], "premium");

    expect(error).toMatchObject({
      name: "AskRefusal",
      code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
      message: "The premium plan needs gpt-5.6-sol, claude-opus-5, grok-4.7-build, and they are not available right now"
    });
  });

  it("names the one missing Premium roster member in the tier-unavailable refusal", async () => {
    const error = await rejectedAdmission([
      member("gpt-5.6-sol", "sol"),
      member("claude-opus-5", "opus")
    ], "premium");

    expect(error).toMatchObject({
      code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
      message: "The premium plan needs grok-4.7-build, and it is not available right now"
    });
  });

  it("names every missing Premium roster member and the tier in one refusal", async () => {
    const error = await rejectedAdmission([
      member("gpt-5.6-sol", "sol")
    ], "premium");

    expect(error).toMatchObject({ code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE" });
    expect(error).toMatchObject({ message: expect.stringContaining("claude-opus-5") });
    expect(error).toMatchObject({ message: expect.stringContaining("grok-4.7-build") });
    expect(error).toMatchObject({ message: expect.stringContaining("premium") });
  });

  it("refuses an empty panel with the tier-unavailable code before maker or envelope errors", async () => {
    const error = await rejectedAdmission([], "free");

    expect(error).toMatchObject({
      name: "AskRefusal",
      code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
      message: "The free plan needs gpt-5.6-luna, glm-5.3-flash, and they are not available right now"
    });
    expect(error).not.toMatchObject({ code: "MAKER_INVENTORY_UNSATISFIED" });
    expect(error).not.toMatchObject({ code: "STRUCTURAL_CEILING_PANELSIZE_INVALID" });
  });

  it("maps a real tier-unavailable admission refusal to the HTTP 422 face", async () => {
    const application = applicationWithSubmit(async (submittedAsk) => {
      await evaluateAskAdmission(settingsFor([
        member("gpt-5.6-sol", "sol"),
        member("claude-opus-5", "opus")
      ]), submittedAsk);
      return { run_ref: RUN_ID, status: "QUEUED" };
    });
    const api = buildApi({
      application,
      sessions: testSessionApplication([HTTP_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN
    });

    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: HTTP_HEADERS,
      payload: ask("free")
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "ASK_PLAN_TIER_MODEL_UNAVAILABLE",
      message: "The free plan needs gpt-5.6-luna, glm-5.3-flash, and they are not available right now"
    });
    await api.close();
  });

  it("returns fixed typed refusals for out-of-vocabulary tiers at the exported boundary", async () => {
    for (const planTier of ["constructor", "gold"]) {
      const error = await rejectedAdmission(
        [],
        planTier as AskRequest["plan_tier"]
      );

      expect(error).toMatchObject({
        name: "AskRefusal",
        code: "ASK_PLAN_TIER_INVALID",
        message: "The plan tier must be free or premium"
      });
    }
  });

  it("refuses an invalid tier before resolving the discovered panel", async () => {
    let panelResolutions = 0;
    const error = await evaluateAskAdmission({
      ...settingsFor([]),
      resolveDiscoveredPanel: async () => {
        panelResolutions += 1;
        return [];
      }
    }, { ...ask("free"), plan_tier: "gold" } as unknown as AskRequest).catch(
      (caught: unknown) => caught
    );

    expect(error).toMatchObject({
      name: "AskRefusal",
      code: "ASK_PLAN_TIER_INVALID",
      message: "The plan tier must be free or premium"
    });
    expect(panelResolutions).toBe(0);
  });

  it("keeps an out-of-vocabulary tier on the reachable HTTP 400 malformed-request face", async () => {
    let submitCalls = 0;
    const application = applicationWithSubmit(async () => {
      submitCalls += 1;
      return { run_ref: RUN_ID, status: "QUEUED" };
    });
    const api = buildApi({
      application,
      sessions: testSessionApplication([HTTP_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN
    });

    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: HTTP_HEADERS,
      payload: { ...ask("free"), plan_tier: "gold" }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: "MALFORMED_REQUEST" });
    expect(submitCalls).toBe(0);
    await api.close();
  });

  it("maps an injected invalid tier at the exported application boundary to HTTP 422", async () => {
    const application = applicationWithSubmit(async (submittedAsk) => {
      await evaluateAskAdmission(
        settingsFor([]),
        { ...submittedAsk, plan_tier: "gold" } as unknown as AskRequest
      );
      return { run_ref: RUN_ID, status: "QUEUED" };
    });
    const api = buildApi({
      application,
      sessions: testSessionApplication([HTTP_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN
    });

    const response = await api.inject({
      method: "POST",
      url: "/v1/asks",
      headers: HTTP_HEADERS,
      payload: ask("free")
    });

    expect(response.statusCode).toBe(422);
    expect(response.json()).toEqual({
      error: "ASK_PLAN_TIER_INVALID",
      message: "The plan tier must be free or premium"
    });
    await api.close();
  });

  it("refuses before taking an admission lease or issuing any run-provision query", async () => {
    const queries: string[] = [];
    let connectCalls = 0;
    const pool = {
      async query(statement: string) {
        queries.push(statement);
        return { rows: [] };
      },
      async connect() {
        connectCalls += 1;
        return {
          async query(statement: string) {
            queries.push(statement);
            return { rows: [] };
          },
          on() { return this; },
          removeListener() { return this; },
          release() {}
        };
      }
    };
    const serverAdmissionPool = new Proxy(pool, {});
    const legacyAdmissionPool = new Proxy(pool, {});
    const application = new PostgresAskApplication(
      pool as never,
      { dispatch: async () => undefined },
      settingsFor([
        member("gpt-5.6-sol", "sol"),
        member("claude-opus-5", "opus")
      ]),
      undefined,
      pool as never,
      {
        server: serverAdmissionPool as never,
        legacy: legacyAdmissionPool as never
      }
    );
    const session: Session = {
      asker_id: "owner:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      session_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      caller_scope: "ASKER",
      ownership_provenance: "server_session",
      provisional_identity_model: false
    };

    await expect(application.submit(ask("free"), session, {
      kind: "server",
      userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      ownerRef: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    })).rejects.toMatchObject({
      name: "AskRefusal",
      code: "ASK_PLAN_TIER_MODEL_UNAVAILABLE"
    });

    expect(connectCalls).toBe(0);
    expect(queries.join("\n")).not.toMatch(
      /prepare_run_key_provision|create_encrypted_run|INSERT INTO core\.run/i
    );
  });

  it("keeps one provider per roster model id and sizes the envelope to the roster", async () => {
    const panelSizes: number[] = [];
    const result = await evaluateAskAdmission(settingsFor([
      member("gpt-5.6-sol", "a"),
      member("claude-opus-5", "b"),
      member("grok-4.7-build", "c"),
      member("grok-4.7-build", "d")
    ], panelSizes), ask("premium"));

    expect(result.discoveredPanel.map(({ model_id, provider_ref }) => ({
      model_id,
      provider_ref
    }))).toEqual([
      { model_id: "gpt-5.6-sol", provider_ref: "provider:a" },
      { model_id: "claude-opus-5", provider_ref: "provider:b" },
      { model_id: "grok-4.7-build", provider_ref: "provider:c" }
    ]);
    expect(result.discoveredPanel).toHaveLength(3);
    expect(panelSizes).toEqual([3]);
  });
});
