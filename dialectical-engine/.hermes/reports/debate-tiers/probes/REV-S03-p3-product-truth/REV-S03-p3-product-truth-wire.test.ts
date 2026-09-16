// REV-S03-p3-product-truth — the lens's OWN fixture, pass 3, written against 3f488b3f
// (integration/all carrying slice head 0fe14637 = cd043907 + FIX-S03-p2-F1).
//
// Built from the CLAIM (SPEC-v3 acceptance step 2: "Open /new. The Free card lists
// exactly gpt-5.6-luna and glm-5.3-flash"), never from the author's tests.
//
// Pass-2 B1: the publisher writes {kind,free,premium}; the strict wire schema refused
// `kind`; the route 500'd; /new listed zero ids. FIX-S03-p2-F1 ruled READER-SIDE:
// PostgresAskApplication.readPlanTierRosters projects {free,premium} off the row before
// the strict parse (apps/api/src/index.ts:1536-1547). The writer is unchanged.
//
// Two pass-2 cases are RE-DERIVED here, as the pass-3 package requires:
//   * case 3b asserted the WRITER-side remedy (no `kind` in value_json). That is not the
//     ruling that shipped. Re-derived as the TWO-SIDED statement: the persisted text KEEPS
//     `kind`; the wire MUST NOT carry it.
//   * case C (the page) moves to the companion render probe and is driven by the REAL
//     route body instead of a mocked rejection.
//
// New this pass, exceeding the author's parameters (the refutation duty): case 6 feeds a
// row carrying a FUTURE register-only member. F1's remedy is a named allow-list, so it
// must survive any extra key, not just `kind`. That is the class B1 named.

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
  developmentPlanTierRosters
} from "../../apps/runner/src/dev-deployment-register.js";
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const USER_IDENTITY = testHttpIdentity("p3-product-truth-user");
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

// The ids V put in the ONE declaration, read from the file the same way the stack does.
const FILE_ROSTERS = developmentPlanTierRosters(loadModelConfig(process.cwd()));

// The roster row the dev stack publishes — the REAL producer, not a hand-written fixture.
const PUBLISHED_ROW = buildDevelopmentDeploymentRegisterRows(
  { requiredDistinctMakers: 1, configuredProviders: [] } as never,
  FILE_ROSTERS
).find(({ rowKey }) => rowKey === "planTierRosters")!;

describe("REV-S03-p3-product-truth — what an ordinary signed-in session gets from /v1/plan-tiers at 3f488b3f", () => {
  it("0 the file still has the two Free ids acceptance step 2 names", () => {
    expect([...FILE_ROSTERS.free]).toEqual(["gpt-5.6-luna", "glm-5.3-flash"]);
    expect(PUBLISHED_ROW.sourceRef.length).toBeGreaterThan(0);
  });

  it("1 CONTROL — a bare {free,premium} row is served to an ordinary user as 200 with the file's ids", async () => {
    const server = api(applicationOver({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    }));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
    await server.close();
  });

  it("2 THE REAL ROW — the value the dev register actually publishes, through the real route", async () => {
    // What the publisher writes, verbatim. The writer is UNCHANGED by F1.
    expect(Object.keys(PUBLISHED_ROW.value as object).sort()).toEqual(["free", "kind", "premium"]);

    const server = api(applicationOver(PUBLISHED_ROW.value));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    console.log(`[PROBE p3] real published row -> status=${response.statusCode} body=${response.body.slice(0, 400)}`);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
    await server.close();
  });

  it("2b THE WIRE ANSWER — exactly the two lists, no discriminator (charge 3)", async () => {
    const server = api(applicationOver(PUBLISHED_ROW.value));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    const body = response.json() as Record<string, unknown>;
    console.log(`[PROBE p3] wire key set = ${JSON.stringify(Object.keys(body).sort())}`);
    expect(Object.keys(body).sort()).toEqual(["free", "premium"]);
    expect(body).not.toHaveProperty("kind");
    expect(response.body).not.toContain("PLAN_TIER_ROSTERS");
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

  it("3b RE-DERIVED — the persisted text KEEPS `kind` (writer untouched) while the wire drops it", async () => {
    const { loadBootstrapRegister } = await import("../../packages/register/src/index.js");
    const { buildDevelopmentDeploymentRegisterPublicationRows } =
      await import("../../apps/runner/src/dev-deployment-register.js");
    const rows = await buildDevelopmentDeploymentRegisterPublicationRows(
      await loadBootstrapRegister(),
      { requiredDistinctMakers: 1, configuredProviders: [] } as never,
      FILE_ROSTERS
    );
    const published = rows.find(({ rowKey }) => rowKey === "planTierRosters")!;
    console.log(`[PROBE p3] persisted value_json text = ${published.valueJsonText}`);
    const persisted = JSON.parse(published.valueJsonText) as Record<string, unknown>;

    // The ruling that shipped is reader-side: the internal discriminator STAYS persisted.
    expect(persisted.kind).toBe("PLAN_TIER_ROSTERS");
    expect(persisted.free).toEqual([...FILE_ROSTERS.free]);
    expect(persisted.premium).toEqual([...FILE_ROSTERS.premium]);

    // And the wire, over that same persisted value, carries only the two lists.
    const server = api(applicationOver(persisted));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json() as object).sort()).toEqual(["free", "premium"]);
    await server.close();
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
    const response = await server.inject({ method: "GET", url: "/v1/deployment", headers: USER_HEADERS });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: "OPERATOR_REQUIRED" });
    await server.close();
  });

  it("6 THE CLASS — a future register-only member on the row must not break the user's read", async () => {
    // B1's class was "a strict public reader fed an internal register object wholesale".
    // A named allow-list survives ANY new internal key; a `kind`-only patch would not.
    const widened = {
      ...(PUBLISHED_ROW.value as Record<string, unknown>),
      retiredAt: "2026-09-16T00:00:00Z",
      provenance: { sealedBy: "dev:auth:up" }
    };
    const server = api(applicationOver(widened));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    console.log(`[PROBE p3] widened row -> status=${response.statusCode} body=${response.body.slice(0, 300)}`);
    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json() as object).sort()).toEqual(["free", "premium"]);
    expect(response.json()).toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
    await server.close();
  });

  it("7 the row absent entirely — what an ordinary user is handed, recorded not predicted", async () => {
    const server = api(applicationOver(undefined, false));
    const response = await server.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    console.log(`[PROBE p3] row ABSENT -> status=${response.statusCode} body=${response.body.slice(0, 300)}`);
    expect([200, 404, 500]).toContain(response.statusCode);
    await server.close();
  });
});

// The REAL browser client, not a mock. `readPlanTiers` parses the wire body with the same
// .strict() PlanTierRostersSchema, so a discriminator ON THE WIRE would break the browser
// even where the server allowed it. The merge also replaced the 5xx envelope
// ({error,message} -> {error,correlation_id}, diff-0fe14637..3f488b3f-S03-files.patch:109-115),
// which is what the page's refusal copy is built from — so measure that at THIS head.
describe("REV-S03-p3-product-truth — the real contract client over the real route at 3f488b3f", () => {
  function clientOver(server: ReturnType<typeof api>) {
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
    return createContractClient("http://127.0.0.1/", fetchImplementation);
  }

  it("8 the REAL client parses the REAL wire body for the REAL published row", async () => {
    const server = api(applicationOver(PUBLISHED_ROW.value));
    const rosters = await clientOver(server).readPlanTiers();
    console.log(`[PROBE p3] client.readPlanTiers() -> ${JSON.stringify(rosters)}`);
    expect(rosters).toEqual({
      free: [...FILE_ROSTERS.free],
      premium: [...FILE_ROSTERS.premium]
    });
    await server.close();
  });

  it("9 the FAULT path's copy at the merged head: what the page's banner is built from", async () => {
    const server = api(applicationOver(undefined, false));
    let detail = "";
    try {
      await clientOver(server).readPlanTiers();
      throw new TypeError("PROBE_EXPECTED_A_REFUSAL");
    } catch (failure) {
      detail = failure instanceof Error ? failure.message : String(failure);
    }
    console.log(`[PROBE p3] banner would read = ASK_PLAN_TIER_ROSTERS_UNAVAILABLE: ${detail}`);
    expect(detail).toContain("INTERNAL_ERROR");
    // The 5xx envelope carries a correlation_id; record whether the user-facing copy keeps it.
    console.log(`[PROBE p3] correlation id reaches the user? ${/[0-9a-f]{8}-[0-9a-f]{4}-4/u.test(detail)}`);
    await server.close();
  });
});
