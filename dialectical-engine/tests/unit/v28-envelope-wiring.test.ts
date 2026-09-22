import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { evaluateAskAdmission, type RunCreationSettings } from "../../apps/api/src/index.js";

/**
 * V-28 — THE CONTROLS ARE WIRED INTO BOTH SHIPPED ROOTS.
 *
 * This is the F33 class the mission has paid for five times: a control is built,
 * consumed behind an OPTIONAL setting, wired into ONE deployment entry point and
 * silently absent from the other. The compiler never asks, because the field is
 * optional; no unit test asks, because supplying the setting is what such a test
 * does. It surfaces only as money leaving a live deployment.
 *
 * So the daily gate's own behaviour is exercised through the real admission
 * function, and each entry point's wiring is pinned by name.
 */
function settingsWith(
  extra: Partial<RunCreationSettings> = {}
): RunCreationSettings {
  return {
    strangerSampleRate: 0,
    registerVersion: 1,
    batteryVersion: "test",
    settlementWatchHandle: "test",
    resolveDiscoveredPanel: async () => [],
    resolveEnvelopeBasis: async () => ({}),
    resolveRisk: () => ({
      effectiveRiskTier: "casual" as const,
      tierSource: "ASKER" as const,
      tierProvenanceRef: "asker:test"
    }),
    ...extra
  } as RunCreationSettings;
}

const ASK = Object.freeze({
  question_line: "q",
  as_of: new Date().toISOString(),
  risk_tier: "casual",
  tier_source: "ASKER",
  tier_provenance_ref: "asker:test",
  composition_budget_tier: "standard",
  depth_params: {},
  decision_scope: {},
  steering_presets: [],
  steering_annotations: []
}) as never;

describe("V-28 a new ask passes the daily envelope before anything is resolved", () => {
  it("asks the daily gate, and asks it FIRST", async () => {
    const order: string[] = [];
    // The admission goes on to refuse this empty fixture panel; what is pinned
    // here is the ORDER, so the refusal is caught and discarded.
    await evaluateAskAdmission(settingsWith({
      assertDailyCostEnvelope: async () => { order.push("daily"); },
      resolveDiscoveredPanel: async () => { order.push("panel"); return []; }
    }), ASK).catch(() => undefined);

    expect(order).toEqual(["daily", "panel"]);
  });

  it("refuses the ask, and never discovers a panel, once the day is spent", async () => {
    let panelDiscovered = false;
    await expect(evaluateAskAdmission(settingsWith({
      assertDailyCostEnvelope: async () => {
        throw Object.assign(new Error("DAILY_COST_ENVELOPE_REACHED"), {
          code: "DAILY_COST_ENVELOPE_REACHED"
        });
      },
      resolveDiscoveredPanel: async () => { panelDiscovered = true; return []; }
    }), ASK)).rejects.toThrowError(
      expect.objectContaining({ code: "DAILY_COST_ENVELOPE_REACHED" })
    );

    expect(panelDiscovered).toBe(false);
  });

  it("is INERT when no gate is supplied — local mode admits every ask", async () => {
    let panelDiscovered = false;
    await evaluateAskAdmission(settingsWith({
      resolveDiscoveredPanel: async () => { panelDiscovered = true; return []; }
    }), ASK).catch((error: unknown) => {
      // Whatever else this fixture ask runs into, it must never be the money
      // gate: local mode has no daily envelope to reach.
      expect(error).not.toMatchObject({ code: "DAILY_COST_ENVELOPE_REACHED" });
    });

    expect(panelDiscovered).toBe(true);
  });
});

describe("V-28 both shipped roots carry the envelopes", () => {
  it("the runner gives its gateway the per-run money seam", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/main.ts", import.meta.url), "utf8"
    );
    expect(source).toContain("CostEnvelopeGuard");
    expect(source).toContain("PostgresModelSpendStore");
    expect(source).toContain("readCostEnvelopePolicy");
    // Wired per target, because the price is the target's.
    expect(source).toContain("providerSeam(");
    expect(source).toContain("providerTargetPrice(");
  });

  it("the API gates a new ask on the daily envelope", async () => {
    const source = await readFile(
      new URL("../../apps/api/src/main.ts", import.meta.url), "utf8"
    );
    expect(source).toContain("CostEnvelopeGuard");
    expect(source).toContain("readCostEnvelopePolicy");
    expect(source).toContain("assertDailyCostEnvelope");
  });

  it("the API refuses to boot hosted without the three support admission scopes", async () => {
    const source = await readFile(
      new URL("../../apps/api/src/main.ts", import.meta.url), "utf8"
    );
    // The amendment: the check is taken where the admission row IN FORCE has
    // been read, which is the earliest point a pool exists to read it with.
    expect(source).toContain("assertHostedSupportAdmissionSealed(");
    expect(source).toContain("admissionPolicy");
  });

  it("the deployment register publishes the cost-envelope row", async () => {
    const source = await readFile(
      new URL("../../apps/runner/src/dev-deployment-register.ts", import.meta.url), "utf8"
    );
    expect(source).toContain("COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW");
  });
});
