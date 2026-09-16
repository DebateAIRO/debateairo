// REV-S03-p3r-product-truth — the lens's OWN fixture for the V-authorized scoped re-check,
// written against b97985a8 (integration/all after the RULING 4 merge; slice head a25c0d99).
//
// Pass 3 ruled REWORK from this lens on a chain whose FIRST link was: "the planTierRosters row
// is never published on V's database, because the seed replays it into the sealed historical v4
// and REGISTER_PUBLICATION_SEAL_INVALID stops dev:auth:up". FIX-S03-p3-F1 (+ RULING 4) moved the
// row out of the historical set; the orchestrator's live run at b97985a8 published register v10
// on V's actual database.
//
// This fixture does what pass 3 could not: it drives the join with THE BYTES THAT ARE NOW IN
// V'S DATABASE, copied verbatim out of the read-only diagnostic the orchestrator recorded
// (review-packages/S03-p3r/live/serve-merged-diag-v10-b97985a8.log:4). No literal of mine sits
// between V's row and the DOM V looks at. I never touched the database; these bytes are a
// transcription of the record, and case L0 proves this head's publisher reproduces them exactly.

import { describe, expect, it } from "vitest";
import {
  buildApi as buildApiBase,
  PostgresAskApplication,
  type RunCreationSettings
} from "@debateai/api";
import { createContractClient } from "@debateai/contract";
import { loadModelConfig } from "@debateai/model-config";
import {
  buildDevelopmentDeploymentRegisterRows,
  buildDevelopmentDeploymentRegisterPublicationRows,
  developmentPlanTierRosters
} from "../../apps/runner/src/dev-deployment-register.js";
import { loadBootstrapRegister } from "../../packages/register/src/index.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

// VERBATIM from live/serve-merged-diag-v10-b97985a8.log:4 — the value_json of row
// `planTierRosters` in register version 10 on V's dev database (127.0.0.1:55432).
const LIVE_V10_TEXT =
  '{"free":["gpt-5.6-luna","glm-5.3-flash"],"kind":"PLAN_TIER_ROSTERS","premium":["gpt-5.6-sol","claude-opus-5","grok-4.6-build"]}';

const USER_IDENTITY = testHttpIdentity("p3r-product-truth-user");
const USER_HEADERS = testSessionHeaders(USER_IDENTITY);

function settings(): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 4,
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

function poolReturning(rosterValue: unknown, includeRow = true) {
  return {
    query: async (statement: string) => {
      if (statement.includes("FROM register.register_row")) {
        return {
          rows: includeRow
            ? [{ row_key: "planTierRosters", value_json: rosterValue, source_ref: "config/models.yaml" }]
            : []
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

function applicationOver(rosterValue: unknown, includeRow = true): PostgresAskApplication {
  return new PostgresAskApplication(
    poolReturning(rosterValue, includeRow) as never,
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

const FILE_ROSTERS = developmentPlanTierRosters(loadModelConfig(process.cwd()));

const PUBLISHED_ROW = buildDevelopmentDeploymentRegisterRows(
  { requiredDistinctMakers: 1, configuredProviders: [] } as never,
  FILE_ROSTERS
).find(({ rowKey }) => rowKey === "planTierRosters")!;

describe("REV-S03-p3r-product-truth — V's LIVE register v10 row, through the real route, at b97985a8", () => {
  it("L0 this head's publisher reproduces V's live v10 bytes EXACTLY (so the row in V's DB is this head's row)", async () => {
    const rows = await buildDevelopmentDeploymentRegisterPublicationRows(
      await loadBootstrapRegister(),
      { requiredDistinctMakers: 1, configuredProviders: [] } as never,
      FILE_ROSTERS
    );
    const published = rows.find(({ rowKey }) => rowKey === "planTierRosters")!;
    console.log(`[PROBE p3r] publisher valueJsonText = ${published.valueJsonText}`);
    console.log(`[PROBE p3r] V's live v10 text       = ${LIVE_V10_TEXT}`);
    expect(published.valueJsonText).toBe(LIVE_V10_TEXT);
  });

  it("L1 THE LIVE BYTES — V's own row, served to an ordinary signed-in session, is 200 with the file's five ids", async () => {
    const liveValue = JSON.parse(LIVE_V10_TEXT) as Record<string, unknown>;
    expect(liveValue.kind).toBe("PLAN_TIER_ROSTERS");

    const server = api(applicationOver(liveValue));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    console.log(`[PROBE p3r] live v10 row -> status=${response.statusCode} body=${response.body.slice(0, 400)}`);
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json() as object).sort()).toEqual(["free", "premium"]);
    expect(response.body).not.toContain("PLAN_TIER_ROSTERS");
    expect(response.json()).toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
    await server.close();
  });

  it("L2 the REAL browser client parses V's live row over the real route", async () => {
    const server = api(applicationOver(JSON.parse(LIVE_V10_TEXT)));
    const fetchImplementation = (async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = input instanceof URL ? input : new URL(String(input));
      const injected = await server.inject({
        method: (init?.method ?? "GET") as "GET",
        url: `${url.pathname}${url.search}`,
        headers: { ...USER_HEADERS, ...(init?.headers as Record<string, string> | undefined) }
      });
      return new Response(injected.body, {
        status: injected.statusCode,
        headers: { "content-type": injected.headers["content-type"] as string ?? "application/json" }
      });
    }) as typeof fetch;
    const rosters = await createContractClient("http://127.0.0.1/", fetchImplementation).readPlanTiers();
    console.log(`[PROBE p3r] client.readPlanTiers() over V's live row -> ${JSON.stringify(rosters)}`);
    expect(rosters).toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
    await server.close();
  });

  it("L3 acceptance step 2's literal claim, against V's live row: Free is exactly the file's two ids", () => {
    const liveValue = JSON.parse(LIVE_V10_TEXT) as { free: string[]; premium: string[] };
    expect(liveValue.free).toEqual(["gpt-5.6-luna", "glm-5.3-flash"]);
    expect(liveValue.free).toEqual([...FILE_ROSTERS.free]);
    expect(liveValue.premium).toEqual([...FILE_ROSTERS.premium]);
  });

  it("2 UNCHANGED EXPECTATION — the locally built published row still serves as the two lists at b97985a8", async () => {
    expect(Object.keys(PUBLISHED_ROW.value as object).sort()).toEqual(["free", "kind", "premium"]);
    const server = api(applicationOver(PUBLISHED_ROW.value));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
    await server.close();
  });

  it("6 THE CLASS — a future register-only member still cannot break the user's read", async () => {
    const widened = {
      ...(JSON.parse(LIVE_V10_TEXT) as Record<string, unknown>),
      retiredAt: "2026-09-16T00:00:00Z",
      provenance: { sealedBy: "dev:auth:up" }
    };
    const server = api(applicationOver(widened));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json() as object).sort()).toEqual(["free", "premium"]);
    await server.close();
  });

  it("4 no cookie session — still 401", async () => {
    const server = api(applicationOver(JSON.parse(LIVE_V10_TEXT)));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "SESSION_REQUIRED" });
    await server.close();
  });

  it("5 /v1/deployment still operator-only for the same ordinary session", async () => {
    const server = api(applicationOver(JSON.parse(LIVE_V10_TEXT)));
    const response = await server.inject({ method: "GET", url: "/v1/deployment", headers: USER_HEADERS });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "OPERATOR_REQUIRED" });
    await server.close();
  });

  it("7 the row absent — recorded, not predicted (the pass-3 blocking chain's last link)", async () => {
    const server = api(applicationOver(undefined, false));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    console.log(`[PROBE p3r] row ABSENT -> status=${response.statusCode} body=${response.body.slice(0, 300)}`);
    expect([200, 404, 500]).toContain(response.statusCode);
    await server.close();
  });
});
