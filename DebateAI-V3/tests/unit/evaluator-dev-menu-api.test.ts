import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApi, type AskApplication, type EvaluatorDevMenuApplication } from "@debateai/api";
import { loadApiEnvironment } from "@debateai/register";

const view = {
  catalog: { state: "UNAVAILABLE" as const, probeId: "probe:test", failureCode: "ECONNREFUSED", models: [] },
  selectedConsumer: null,
  dispatchBinding: { state: "UNBOUND" as const, reason: "ROW_ABSENT" as const, registerVersion: 1, sourceRef: null },
  harvestedRows: 0,
  domains: [],
  profiles: [],
  parkedRuns: []
};

function askApplication(): AskApplication {
  return {
    submit: vi.fn(), readAnswer: vi.fn(), readRunAnswer: vi.fn(), readRun: vi.fn(),
    readAnswerIndex: vi.fn(), readInspection: vi.fn(), readLedgerDigest: vi.fn(),
    readNode: vi.fn(), recordInvestigation: vi.fn(), unlinkMemoryLink: vi.fn(),
    readDeployment: vi.fn(), events: vi.fn()
  } as unknown as AskApplication;
}

describe("dev-only evaluator API", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses to enable the surface in a production composition", () => {
    for (const [name, value] of Object.entries({
      DATABASE_URL: "postgresql://runtime:runtime@localhost/debateai",
      API_HOST: "127.0.0.1", API_PORT: "3001", STRANGER_SAMPLE_RATE: "0",
      REGISTER_VERSION: "1", BATTERY_VERSION: "test", SETTLEMENT_WATCH_HANDLE: "test",
      HATCHET_CLIENT_TOKEN: "fixture", HATCHET_HOST_PORT: "localhost:7070",
      HATCHET_API_URL: "http://localhost:7070", HATCHET_TENANT_ID: "fixture",
      HATCHET_WORKFLOW_NAME: "fixture", HATCHET_TLS_STRATEGY: "none",
      NODE_ENV: "production", EVALUATOR_DEV_MENU_ENABLED: "true",
      EVALUATOR_DEV_MENU_DATABASE_URL: "postgresql://evaluator_api:fixture@localhost/debateai"
    })) vi.stubEnv(name, value);

    expect(() => loadApiEnvironment()).toThrow("EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN");
  });

  it("does not register the surface in a normal API composition", async () => {
    const api = buildApi({ application: askApplication() });
    const response = await api.inject({
      method: "GET", url: "/v1/dev/evaluator", headers: { "x-user-dev-token": "token" }
    });
    expect(response.statusCode).toBe(404);
    await api.close();
  });

  it("authenticates the gated read and maps the sole write to the resolved developer identity", async () => {
    const selectConsumerModel = vi.fn(async () => ({
      consumerSelectionId: "selection:test", modelId: "consumer:alpha", selectedAt: new Date("2026-08-15T14:00:00.000Z")
    }));
    const evaluatorDevMenu: EvaluatorDevMenuApplication = {
      readView: vi.fn(async () => view),
      selectConsumerModel
    };
    const api = buildApi({ application: askApplication(), evaluatorDevMenu, evaluatorDevMenuRegisterVersion: 1 });

    expect((await api.inject({ method: "GET", url: "/v1/dev/evaluator" })).statusCode).toBe(401);
    const read = await api.inject({
      method: "GET", url: "/v1/dev/evaluator", headers: { "x-user-dev-token": "token" }
    });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ catalog: { state: "UNAVAILABLE" }, dispatchBinding: { state: "UNBOUND" } });

    const selected = await api.inject({
      method: "POST", url: "/v1/dev/evaluator/consumer-selection",
      headers: { "x-user-dev-token": "token" }, payload: { model_id: "consumer:alpha" }
    });
    expect(selected.statusCode).toBe(201);
    expect(selectConsumerModel).toHaveBeenCalledWith(expect.objectContaining({
      modelId: "consumer:alpha",
      selectedBy: expect.stringMatching(/^asker:/),
      orderRef: expect.stringMatching(/^dev-menu:session:/)
    }));
    await api.close();
  });
});
