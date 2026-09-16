// REV-S03-p2-product-truth — the lens's OWN fixture, pass 2. Built from the CLAIM
// (SPEC-v3 acceptance step 2: "Open /new. The Free card lists exactly gpt-5.6-luna
// and glm-5.3-flash"), never from the author's tests.
//
// Head under review: d35a9634 (integration/all, carrying slice head cd043907).
//
// Pass-1 B1: /new's ids came from GET /v1/deployment (auth:"operator"), so an ordinary
// signed-in session saw ZERO ids, silently. FIX-S03-p1-F2 added GET /v1/plan-tiers
// (auth:"user") + a named refusal. The shipped route tests stub readPlanTierRosters on
// a fixture application, and the projection test feeds a hand-written register row.
// Neither runs the row the DEV STACK ACTUALLY PUBLISHES through the real projection
// and the real route. That join is this probe.

import { describe, expect, it } from "vitest";
import {
  buildApi as buildApiBase,
  PostgresAskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { loadModelConfig } from "@debateai/model-config";
import {
  buildDevelopmentDeploymentRegisterRows,
  developmentPlanTierRosters
} from "../../apps/runner/src/dev-deployment-register.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const USER_IDENTITY = testHttpIdentity("p2-product-truth-user");
const USER_HEADERS = testSessionHeaders(USER_IDENTITY);

const REGISTER_VERSION = 4;

function settings(): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: REGISTER_VERSION,
    batteryVersion: "battery:probe",
    settlementWatchHandle: "watch:probe",
    resolveDiscoveredPanel: async () => [],
    resolveEnvelopeBasis: async () => ({ max_model_attempts: 1 }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier,
      tierSource,
      tierProvenanceRef
    })
  } as RunCreationSettings;
}

// The rows the sealed register hands back, with the roster row's value_json exactly as
// the caller supplies it.
function poolReturning(rosterValue: unknown) {
  return {
    query: async (statement: string) => {
      if (statement.includes("FROM register.register_row")) {
        return {
          rows: [{
            row_key: "planTierRosters",
            value_json: rosterValue,
            source_ref: "config/models.yaml"
          }]
        };
      }
      if (statement.includes("FROM scorecard.scorecard_cell")
        || statement.includes("FROM identity.run_execution_binding")) {
        return { rows: [] };
      }
      throw new Error(`UNEXPECTED_QUERY:${statement}`);
    }
  };
}

function applicationOver(rosterValue: unknown): PostgresAskApplication {
  return new PostgresAskApplication(
    poolReturning(rosterValue) as never,
    { dispatch: async () => undefined },
    settings(),
    undefined,
    {} as never,
    { server: {} as never, legacy: {} as never }
  );
}

function api(application: PostgresAskApplication) {
  return buildApiBase({
    application: application as never,
    sessions: testSessionApplication([USER_IDENTITY]),
    allowedOrigin: TEST_APP_ORIGIN
  });
}

// The ids V put in the ONE declaration, read from the file the same way the stack does.
const FILE_ROSTERS = developmentPlanTierRosters(loadModelConfig(process.cwd()));

// The roster row the dev stack publishes — the REAL producer, not a hand-written fixture.
const PUBLISHED_ROW = buildDevelopmentDeploymentRegisterRows(
  { requiredDistinctMakers: 1, configuredProviders: [] } as never,
  FILE_ROSTERS
).find(({ rowKey }) => rowKey === "planTierRosters")!;

describe("REV-S03-p2-product-truth — what an ordinary signed-in session gets from /v1/plan-tiers", () => {
  it("0 the file has the two Free ids acceptance step 2 names", () => {
    expect([...FILE_ROSTERS.free]).toEqual(["gpt-5.6-luna", "glm-5.3-flash"]);
    expect(PUBLISHED_ROW.sourceRef.length).toBeGreaterThan(0);
  });

  it("1 CONTROL — a bare {free,premium} row is served to an ordinary user as 200 with the file's ids", async () => {
    const server = api(applicationOver({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    }));
    const response = await server.inject({
      method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
    await server.close();
  });

  it("2 THE REAL ROW — the value the dev register actually publishes, through the real route", async () => {
    // What the publisher writes, verbatim.
    expect(Object.keys(PUBLISHED_ROW.value as object).sort())
      .toEqual(["free", "kind", "premium"]);

    const server = api(applicationOver(PUBLISHED_ROW.value));
    const response = await server.inject({
      method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS
    });
    // No prediction: record what the browser is handed.
    console.log(`[PROBE] real published row -> status=${response.statusCode} body=${response.body.slice(0, 400)}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
    await server.close();
  });

  it("3 the projection itself, called directly with the published value", async () => {
    const application = applicationOver(PUBLISHED_ROW.value);
    await expect(
      application.readPlanTierRosters(USER_IDENTITY.authenticated.session)
    ).resolves.toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
  });

  it("3b the PERSISTED text — what importHistorical writes as value_json keeps every key", async () => {
    const { loadBootstrapRegister } = await import("../../packages/register/src/index.js");
    const { buildDevelopmentDeploymentRegisterPublicationRows } =
      await import("../../apps/runner/src/dev-deployment-register.js");
    const rows = await buildDevelopmentDeploymentRegisterPublicationRows(
      await loadBootstrapRegister(),
      { requiredDistinctMakers: 1, configuredProviders: [] } as never,
      FILE_ROSTERS
    );
    const published = rows.find(({ rowKey }) => rowKey === "planTierRosters")!;
    console.log(`[PROBE] persisted value_json text = ${published.valueJsonText}`);
    expect(JSON.parse(published.valueJsonText)).toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
  });

  it("4 no cookie session — the roster route refuses with 401", async () => {
    const server = api(applicationOver(PUBLISHED_ROW.value));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "SESSION_REQUIRED" });
    await server.close();
  });

  it("5 /v1/deployment stayed operator-only for the same ordinary session", async () => {
    const server = api(applicationOver(PUBLISHED_ROW.value));
    const response = await server.inject({
      method: "GET", url: "/v1/deployment", headers: USER_HEADERS
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "OPERATOR_REQUIRED" });
    await server.close();
  });
});
