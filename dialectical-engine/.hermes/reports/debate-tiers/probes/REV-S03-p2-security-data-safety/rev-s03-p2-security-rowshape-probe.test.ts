/**
 * REV-S03-p2-security-data-safety — PROBE R: producer ⟷ consumer, no hand-written fixture.
 * The row VALUE is taken from the slice's own publisher (buildDevelopmentDeploymentRegisterRows)
 * and handed to the slice's own reader (PostgresAskApplication.readPlanTierRosters) and to the
 * live route. Temporary: written at review head d35a9634, deleted before the seat's handoff.
 */
import { describe, expect, it } from "vitest";
import {
  buildApi as buildApiBase,
  PostgresAskApplication,
  type AskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { loadModelConfig } from "@debateai/model-config";
import {
  buildDevelopmentDeploymentRegisterRows,
  developmentPlanTierRosters
} from "../../apps/runner/src/dev-deployment-register.js";
import { parseDevelopmentProviderPanelTargets } from "../../apps/runner/src/dev-provider-panel.js";
import { developmentProviderSlots } from "../../apps/runner/src/dev-provider-panel.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const USER_IDENTITY = testHttpIdentity("rev-s03-p2-rowshape");
const USER_HEADERS = testSessionHeaders(USER_IDENTITY);

function log(line: string): void {
  // eslint-disable-next-line no-console
  console.log(line);
}

/**
 * The planTierRosters row VALUE exactly as the slice's own publisher builds it.
 * The panel only feeds the configuredProviderSet row; the roster row comes from the
 * REAL config/models.yaml through the REAL developmentPlanTierRosters().
 */
function publishedRosterRowValue(): unknown {
  const config = loadModelConfig(process.cwd());
  const panel = parseDevelopmentProviderPanelTargets(
    JSON.stringify([
      {
        provider_ref: "development:openai-free-api",
        base_url: "https://api.openai.com/v1",
        model: "gpt-5.6-luna",
        authorization_header: "Bearer FAKEKEY-rev-s03-p2-DO-NOT-USE"
      },
      {
        provider_ref: "development:zai-free-api",
        base_url: "https://api.z.ai/api/coding/paas/v4",
        model: "glm-5.3-flash",
        authorization_header: "Bearer FAKEKEY-rev-s03-p2-DO-NOT-USE"
      }
    ]),
    [
      { providerRef: "development:openai-free-api", adapterKind: "openai-compatible-http" as const, maker: "OpenAI" },
      { providerRef: "development:zai-free-api", adapterKind: "openai-compatible-http" as const, maker: "Z.AI" }
    ]
  );
  const rows = buildDevelopmentDeploymentRegisterRows(panel, developmentPlanTierRosters(config));
  const row = rows.find((candidate) => candidate.rowKey === "planTierRosters");
  if (row === undefined) throw new TypeError("PROBE_R_NO_ROSTER_ROW");
  return row.value;
}

function settings(): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 7,
    batteryVersion: "battery:probe",
    settlementWatchHandle: "watch:probe",
    resolveDiscoveredPanel: async () => [],
    resolveEnvelopeBasis: async () => ({ max_model_attempts: 1 }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource, tierProvenanceRef
    })
  } as unknown as RunCreationSettings;
}

/** A pool that answers readDeployment's three queries with the PUBLISHED row value. */
function poolServing(rowValue: unknown) {
  return {
    query: async (statement: string) => {
      if (statement.includes("FROM register.register_row")) {
        return { rows: [{
          row_key: "planTierRosters",
          value_json: rowValue,
          source_ref: "config/models.yaml"
        }] };
      }
      if (statement.includes("FROM scorecard.scorecard_cell")
        || statement.includes("FROM identity.run_execution_binding")) {
        return { rows: [] };
      }
      throw new Error(`UNEXPECTED_QUERY:${statement}`);
    }
  };
}

describe("PROBE R — the producer's row shape against the consumer's strict schema", () => {
  it("shows what the slice's own publisher writes into the planTierRosters row", () => {
    const value = publishedRosterRowValue();
    log(`R_PUBLISHED_ROW_VALUE=${JSON.stringify(value)}`);
    log(`R_PUBLISHED_ROW_KEYS=${JSON.stringify(Object.keys(value as object))}`);
    expect(Object.keys(value as object)).toContain("kind");
  });

  it("feeds that exact value to PostgresAskApplication.readPlanTierRosters", async () => {
    const value = publishedRosterRowValue();
    const application = new PostgresAskApplication(
      poolServing(value) as never,
      { dispatch: async () => undefined } as never,
      settings(),
      undefined,
      {} as never,
      { server: {} as never, legacy: {} as never }
    );
    const outcome = await application
      .readPlanTierRosters(testHttpIdentity("rev-s03-p2-rowshape").authenticated.session)
      .then((rosters) => `OK ${JSON.stringify(rosters)}`, (error: unknown) => `THROW ${String(error).slice(0, 120)}`);
    log(`R_READER_OUTCOME=${outcome}`);
    expect(outcome.startsWith("THROW")).toBe(true);
  });

  it("drives GET /v1/plan-tiers against that same published value", async () => {
    const value = publishedRosterRowValue();
    const application = new PostgresAskApplication(
      poolServing(value) as never,
      { dispatch: async () => undefined } as never,
      settings(),
      undefined,
      {} as never,
      { server: {} as never, legacy: {} as never }
    );
    const api = buildApiBase({
      application: application as unknown as AskApplication,
      sessions: testSessionApplication([USER_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN
    });
    const response = await api.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    log(`R_ROUTE_STATUS=${response.statusCode} BODY=${response.body}`);
    expect(response.statusCode).toBe(500);
    await api.close();
  });

  it("shows the same value passes once the `kind` member is dropped", async () => {
    const value = publishedRosterRowValue() as Record<string, unknown>;
    const { kind: _dropped, ...withoutKind } = value;
    const application = new PostgresAskApplication(
      poolServing(withoutKind) as never,
      { dispatch: async () => undefined } as never,
      settings(),
      undefined,
      {} as never,
      { server: {} as never, legacy: {} as never }
    );
    const outcome = await application
      .readPlanTierRosters(testHttpIdentity("rev-s03-p2-rowshape").authenticated.session)
      .then((rosters) => `OK ${JSON.stringify(rosters)}`, (error: unknown) => `THROW ${String(error).slice(0, 120)}`);
    log(`R_READER_WITHOUT_KIND=${outcome}`);
    expect(outcome.startsWith("OK")).toBe(true);
  });
});
