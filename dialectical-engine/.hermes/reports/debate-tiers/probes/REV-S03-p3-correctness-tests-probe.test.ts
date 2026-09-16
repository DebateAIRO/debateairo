// REV-S03-p3-correctness-tests — pass-3 probe. Head 3f488b3f. TEMPORARY: deleted before handoff.
//
// Built from the CLAIM, not from the patch: FIX-S03-p2-F1 ruled the row<->reader seam on the
// READER side ("project the named allow-list {free,premium} before the strict wire parse").
// The shipped joining case asserts that the happy path works. This probe asks the question the
// shipped case does not: what did the reader-side projection STOP refusing?
//
// Every roster id is read from the committed config/models.yaml or built by the production
// publisher; no model id is written as a literal.
import { describe, expect, it } from "vitest";
import { PostgresAskApplication, type RunCreationSettings } from "@debateai/api";
import { PlanTierRostersSchema, PLAN_TIER_ROSTERS, type Session } from "@debateai/contract";
import { buildDevelopmentDeploymentRegisterRows } from "../../apps/runner/src/dev-deployment-register.js";
import { testHttpIdentity } from "../support/httpSession.js";

const SESSION: Session = testHttpIdentity("rev-s03-p3").authenticated.session;

function settings(): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 7,
    batteryVersion: "battery:test",
    settlementWatchHandle: "watch:test",
    resolveDiscoveredPanel: async () => [],
    resolveEnvelopeBasis: async () => ({ max_model_attempts: 1 }),
    resolveRisk: (effectiveRiskTier, tierSource, tierProvenanceRef) => ({
      effectiveRiskTier, tierSource, tierProvenanceRef
    })
  } as unknown as RunCreationSettings;
}

// Drives the REAL application method against one register-row value.
async function readThroughApplication(rowValue: unknown): Promise<unknown> {
  const pool = {
    query: async (statement: string) => {
      if (statement.includes("FROM register.register_row")) {
        return { rows: [{
          row_key: "planTierRosters",
          value_json: rowValue,
          source_ref: "rev-s03-p3:probe"
        }] };
      }
      if (statement.includes("FROM scorecard.scorecard_cell")
        || statement.includes("FROM identity.run_execution_binding")) {
        return { rows: [] };
      }
      throw new Error(`UNEXPECTED_QUERY:${statement}`);
    }
  };
  const application = new PostgresAskApplication(
    pool as never,
    { dispatch: async () => undefined },
    settings(),
    undefined,
    {} as never,
    { server: {} as never, legacy: {} as never }
  );
  return application.readPlanTierRosters(SESSION);
}

async function applicationRefuses(rowValue: unknown): Promise<boolean> {
  try { await readThroughApplication(rowValue); return false; } catch { return true; }
}

function schemaRefuses(value: unknown): boolean {
  try { PlanTierRostersSchema.parse(value); return false; } catch { return true; }
}

// The eleven shapes my pass-2 probe X1 measured against the SCHEMA, verbatim.
const SHAPES: readonly (readonly [string, unknown])[] = [
  ["row absent (undefined)", undefined],
  ["null", null],
  ["neither key", {}],
  ["missing premium", { free: ["a"] }],
  ["missing free", { premium: ["a"] }],
  ["free not an array", { free: "a", premium: ["b"] }],
  ["blank model id", { free: [""], premium: ["b"] }],
  ["whitespace-only id", { free: ["   "], premium: ["b"] }],
  ["non-string id", { free: ["a"], premium: [1] }],
  ["UNKNOWN TOP-LEVEL KEY", { free: ["a"], premium: ["b"], hidden: ["c"] }],
  ["proto key in literal", { free: ["a"], premium: ["b"], __proto__: ["c"] }]
];

describe("REV-S03-p3 correctness — what the reader-side projection stopped refusing", () => {
  it("Y1 records, shape by shape, where the schema and the application seam now disagree", async () => {
    const disagreements: string[] = [];
    for (const [label, value] of SHAPES) {
      const bySchema = schemaRefuses(value);
      const bySeam = await applicationRefuses(value);
      if (bySchema !== bySeam) disagreements.push(`${label}: schema=${bySchema} seam=${bySeam}`);
    }
    // Measured at 3f488b3f, not assumed. My first expectation was ONE flip; the probe refuted it.
    // TWO of the eleven shapes the schema refuses are now admitted at the application seam:
    //  - the unknown top-level key is silently DROPPED (the widening);
    //  - the `__proto__` literal (which sets the prototype, not an own key) is normalised away
    //    into a fresh plain object — measured safe by Y6, but still a refusal that disappeared.
    expect(disagreements).toEqual([
      "UNKNOWN TOP-LEVEL KEY: schema=true seam=false",
      "proto key in literal: schema=true seam=false"
    ]);
  });

  it("Y2 serves a row whose discriminant is WRONG — the kind is read by nobody", async () => {
    const free = [...PLAN_TIER_ROSTERS.free];
    const premium = [...PLAN_TIER_ROSTERS.premium];
    await expect(readThroughApplication({
      kind: "CONFIGURED_PROVIDER_SET", free, premium
    })).resolves.toEqual({ free, premium });
    await expect(readThroughApplication({ free, premium })).resolves.toEqual({ free, premium });
  });

  it("Y3 drops any extra top-level member of the register row instead of refusing it", async () => {
    const free = [...PLAN_TIER_ROSTERS.free];
    const premium = [...PLAN_TIER_ROSTERS.premium];
    const served = await readThroughApplication({
      kind: "PLAN_TIER_ROSTERS", free, premium,
      operatorOnlyNote: "internal", apiKeyHint: "sk-not-a-real-key"
    });
    expect(Object.keys(served as object).sort()).toEqual(["free", "premium"]);
    expect(JSON.stringify(served)).not.toContain("sk-not-a-real-key");
  });

  it("Y4 preserves the published order and does not normalise duplicates", async () => {
    const published = buildDevelopmentDeploymentRegisterRows(
      { requiredDistinctMakers: 1, configuredProviders: [] } as never,
      { free: ["p3-free-b", "p3-free-a", "p3-free-b"], premium: ["p3-prem-z", "p3-prem-a"] }
    ).find(({ rowKey }) => rowKey === "planTierRosters");
    if (published === undefined) throw new TypeError("PUBLISHER_ROW_MISSING");
    await expect(readThroughApplication(published.value)).resolves.toEqual({
      free: ["p3-free-b", "p3-free-a", "p3-free-b"],
      premium: ["p3-prem-z", "p3-prem-a"]
    });
  });

  it("Y5 the publisher still emits the discriminant, so the seam is reader-side only", () => {
    const published = buildDevelopmentDeploymentRegisterRows(
      { requiredDistinctMakers: 1, configuredProviders: [] } as never,
      { free: ["p3-f"], premium: ["p3-p"] }
    ).find(({ rowKey }) => rowKey === "planTierRosters");
    if (published === undefined) throw new TypeError("PUBLISHER_ROW_MISSING");
    expect(Object.keys(published.value as object).sort()).toEqual(["free", "kind", "premium"]);
    expect((published.value as { kind: string }).kind).toBe("PLAN_TIER_ROSTERS");
    // and the strict wire schema still refuses that value whole — the reason F1 existed.
    expect(() => PlanTierRostersSchema.parse(published.value)).toThrow();
  });

  it("Y6 a real own __proto__ member on the row does not pollute Object.prototype", async () => {
    const hostile = JSON.parse(
      '{"kind":"PLAN_TIER_ROSTERS","free":["p3-f"],"premium":["p3-p"],"__proto__":{"polluted":"yes"}}'
    );
    await expect(readThroughApplication(hostile)).resolves.toEqual({
      free: ["p3-f"], premium: ["p3-p"]
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
