/**
 * REV-S03-p3-security-data-safety — PROBE R3, the pass-2 probe R RE-DERIVED TO THE PROMISE,
 * plus the new question F1 opens.
 *
 * Head this was written against: 3f488b3f (integration/all, = slice head 0fe14637 merged).
 * Pass 2 measured, at d35a9634: the publisher writes {kind, free, premium}; the reader parsed the
 * WHOLE row with the strict {free, premium} wire schema; route = 500. F1's remedy is reader-side
 * PROJECTION (apps/api/src/index.ts:1536-1546): pick {free, premium} out of the row, then parse.
 *
 * So the direction of R's cases 2 and 3 INVERTS by construction. They are re-derived here to the
 * PROMISE (reader OK, route 200 carrying exactly the two lists), never carried at their old polarity.
 *
 * The NEW question this pass owns: a projection DROPS what a strict parse REFUSED. Pass 2 proved the
 * route fail-closed by smuggling operator-only members into the APPLICATION's return value, where the
 * handler's strict re-parse caught them. After F1 the application itself projects, so the smuggling
 * must be moved one layer down — into the REGISTER ROW — which is the only layer an attacker who can
 * write a register row actually controls. S3/S3b below are that probe.
 *
 * Temporary: deleted before this seat's handoff. No provider socket, no dev server, no live database,
 * no port bound, no `.local/**` read. Every key value is this seat's own fake.
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
import {
  TEST_APP_ORIGIN,
  testHttpIdentity,
  testSessionApplication,
  testSessionHeaders
} from "../support/httpSession.js";

const FAKE_KEY = "FAKEKEY-rev-s03-p3-security-DO-NOT-USE";
const USER_IDENTITY = testHttpIdentity("rev-s03-p3-security");
const USER_HEADERS = testSessionHeaders(USER_IDENTITY);

function log(line: string): void {
  // eslint-disable-next-line no-console
  console.log(line);
}

/** The planTierRosters row VALUE exactly as the slice's own publisher builds it. */
function publishedRosterRowValue(): Record<string, unknown> {
  const config = loadModelConfig(process.cwd());
  const panel = parseDevelopmentProviderPanelTargets(
    JSON.stringify([
      {
        provider_ref: "development:openai-free-api",
        base_url: "https://api.openai.com/v1",
        model: "gpt-5.6-luna",
        authorization_header: `Bearer ${FAKE_KEY}`
      },
      {
        provider_ref: "development:zai-free-api",
        base_url: "https://api.z.ai/api/coding/paas/v4",
        model: "glm-5.3-flash",
        authorization_header: `Bearer ${FAKE_KEY}`
      }
    ]),
    [
      { providerRef: "development:openai-free-api", adapterKind: "openai-compatible-http" as const, maker: "OpenAI" },
      { providerRef: "development:zai-free-api", adapterKind: "openai-compatible-http" as const, maker: "Z.AI" }
    ]
  );
  const rows = buildDevelopmentDeploymentRegisterRows(panel, developmentPlanTierRosters(config));
  const row = rows.find((candidate) => candidate.rowKey === "planTierRosters");
  if (row === undefined) throw new TypeError("PROBE_R3_NO_ROSTER_ROW");
  return row.value as Record<string, unknown>;
}

function settings(): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 7,
    batteryVersion: "battery:probe",
    settlementWatchHandle: "watch:probe",
    resolveDiscoveredPanel: async () => [],
    resolveEnvelopeBasis: async () => ({ max_model_attempts: 1 }),
    resolveRisk: (effectiveRiskTier: unknown, tierSource: unknown, tierProvenanceRef: unknown) => ({
      effectiveRiskTier, tierSource, tierProvenanceRef
    })
  } as unknown as RunCreationSettings;
}

/** A pool that answers readDeployment's three queries with the given row value. */
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

function applicationOver(rowValue: unknown): PostgresAskApplication {
  return new PostgresAskApplication(
    poolServing(rowValue) as never,
    { dispatch: async () => undefined } as never,
    settings(),
    undefined,
    {} as never,
    { server: {} as never, legacy: {} as never }
  );
}

async function readerOutcome(rowValue: unknown): Promise<string> {
  return applicationOver(rowValue)
    .readPlanTierRosters(USER_IDENTITY.authenticated.session)
    .then((rosters) => `OK ${JSON.stringify(rosters)}`,
      (error: unknown) => `THROW ${String(error).slice(0, 140)}`);
}

async function routeOutcome(rowValue: unknown): Promise<{ status: number; body: string }> {
  const api = buildApiBase({
    application: applicationOver(rowValue) as unknown as AskApplication,
    sessions: testSessionApplication([USER_IDENTITY]),
    allowedOrigin: TEST_APP_ORIGIN
  });
  try {
    const response = await api.inject({ method: "GET", url: "/v1/plan-tiers", headers: USER_HEADERS });
    return { status: response.statusCode, body: response.body };
  } finally {
    await api.close();
  }
}

describe("PROBE R3 — the wire answer of GET /v1/plan-tiers at the merged head, after F1", () => {
  it("S0 the publisher STILL writes the discriminator into the row (unchanged from pass 2)", () => {
    const value = publishedRosterRowValue();
    log(`S0_PUBLISHED_ROW_VALUE=${JSON.stringify(value)}`);
    log(`S0_PUBLISHED_ROW_KEYS=${JSON.stringify(Object.keys(value))}`);
    // Pass 2's fact, re-measured: the writer side did NOT move. F1 is reader-side.
    expect(Object.keys(value)).toContain("kind");
  });

  it("S1 RE-DERIVED — the reader now ACCEPTS the real published row (pass 2: THROW)", async () => {
    const outcome = await readerOutcome(publishedRosterRowValue());
    log(`S1_READER_OUTCOME=${outcome}`);
    expect(outcome.startsWith("OK")).toBe(true);
  });

  it("S2 RE-DERIVED — the route answers 200 and the body key set is EXACTLY the two lists (pass 2: 500)",
    async () => {
      const published = publishedRosterRowValue();
      const { status, body } = await routeOutcome(published);
      log(`S2_ROUTE_STATUS=${status} BODY=${body}`);
      expect(status).toBe(200);
      const keys = Object.keys(JSON.parse(body) as object).sort();
      log(`S2_WIRE_KEYS=${JSON.stringify(keys)}`);
      expect(keys).toEqual(["free", "premium"]);
      // The discriminator the publisher writes must NOT reach the browser.
      expect(body).not.toContain("kind");
      expect(body).not.toContain("PLAN_TIER_ROSTERS");
      // And the real config's ids must carry no credential material.
      expect(body).not.toContain(FAKE_KEY);
      expect(body).not.toContain("Bearer");
      expect(body).not.toContain("api.openai.com");
      expect(body).not.toContain("api.z.ai");
    });

  it("S3 NEW — operator-only members smuggled into the REGISTER ROW do not reach the wire", async () => {
    const hostileRow = {
      ...publishedRosterRowValue(),
      authorization_header: `Bearer ${FAKE_KEY}`,
      register_version: 9,
      provider_targets: [{ base_url: "https://api.z.ai", key: FAKE_KEY }],
      source_key_path: "/Users/v/.local/dev-auth/provider-keys.env"
    };
    const { status, body } = await routeOutcome(hostileRow);
    log(`S3_ROUTE_STATUS=${status} BODY=${body}`);
    log(`S3_WIRE_KEYS=${status === 200 ? JSON.stringify(Object.keys(JSON.parse(body) as object).sort()) : "n/a"}`);
    // Whatever the status, NOTHING operator-only may appear in the response.
    expect(body).not.toContain(FAKE_KEY);
    expect(body).not.toContain("authorization_header");
    expect(body).not.toContain("provider_targets");
    expect(body).not.toContain("register_version");
    expect(body).not.toContain("source_key_path");
    expect(body).not.toContain(".local");
  });

  it("S3b NEW — the same row driven through the reader directly carries nothing extra", async () => {
    const hostileRow = {
      ...publishedRosterRowValue(),
      authorization_header: `Bearer ${FAKE_KEY}`,
      provider_targets: [{ key: FAKE_KEY }]
    };
    const outcome = await readerOutcome(hostileRow);
    log(`S3b_READER_OUTCOME=${outcome}`);
    expect(outcome).not.toContain(FAKE_KEY);
    expect(outcome).not.toContain("authorization_header");
    expect(outcome).not.toContain("provider_targets");
    if (outcome.startsWith("OK")) {
      expect(Object.keys(JSON.parse(outcome.slice(3)) as object).sort()).toEqual(["free", "premium"]);
    }
  });

  it("S4 NEW — what the reader does when the row carries a DIFFERENT discriminator", async () => {
    const wrongKind = { ...publishedRosterRowValue(), kind: "RUN_DEATH_POLICY" };
    const outcome = await readerOutcome(wrongKind);
    const { status, body } = await routeOutcome(wrongKind);
    log(`S4_WRONG_KIND_READER=${outcome}`);
    log(`S4_WRONG_KIND_ROUTE=${status} BODY=${body}`);
    // Recorded, not asserted as desired: this measures whether the discriminator is checked at all.
    expect(typeof status).toBe("number");
    expect(body).not.toContain(FAKE_KEY);
  });

  it("S5 NEW — a missing / null / non-object row value stays fail-closed and leaks nothing", async () => {
    const cases: readonly { readonly label: string; readonly value: unknown }[] = [
      { label: "null", value: null },
      { label: "string", value: `REGISTER_OPEN_FAILED host=127.0.0.1:55432 secret=${FAKE_KEY}` },
      { label: "number", value: 7 },
      { label: "empty object", value: {} },
      { label: "free only", value: { free: ["a"] } },
      { label: "free not an array", value: { free: "a", premium: ["b"] } },
      { label: "blank id", value: { free: [""], premium: ["b"] } }
    ];
    const rows: { label: string; status: number; keys: string; leaks: boolean }[] = [];
    for (const { label, value } of cases) {
      const { status, body } = await routeOutcome(value);
      rows.push({
        label,
        status,
        keys: JSON.stringify(Object.keys(JSON.parse(body) as object).sort()),
        leaks: body.includes(FAKE_KEY) || body.includes("55432")
      });
    }
    log(`S5_DEGENERATE_ROWS=${JSON.stringify(rows, null, 1)}`);
    expect(rows.every((row) => row.status === 500)).toBe(true);
    expect(rows.every((row) => row.leaks === false)).toBe(true);
    expect(rows.every((row) => row.keys === '["correlation_id","error"]')).toBe(true);
  });

  it("S6 NEW — the padded/trim behaviour survives the projection (a fact, not a finding)", async () => {
    const padded = { kind: "PLAN_TIER_ROSTERS", free: ["  spaced  "], premium: ["b"] };
    const { status, body } = await routeOutcome(padded);
    log(`S6_PADDED=${status} BODY=${body}`);
    expect(status).toBe(200);
  });

  it("S7 NEW — the anonymous and retired-header refusals still stand at the merged head", async () => {
    const published = publishedRosterRowValue();
    const api = buildApiBase({
      application: applicationOver(published) as unknown as AskApplication,
      sessions: testSessionApplication([USER_IDENTITY]),
      allowedOrigin: TEST_APP_ORIGIN
    });
    const anonymous = await api.inject({ method: "GET", url: "/v1/plan-tiers" });
    const retired = await api.inject({
      method: "GET", url: "/v1/plan-tiers", headers: { "x-user-dev-token": "rev-s03-p3" }
    });
    log(`S7_ANON=${anonymous.statusCode} ${anonymous.body}`);
    log(`S7_RETIRED_HEADER=${retired.statusCode} ${retired.body}`);
    expect(anonymous.statusCode).toBe(401);
    expect(retired.statusCode).toBe(401);
    await api.close();
  });
});
