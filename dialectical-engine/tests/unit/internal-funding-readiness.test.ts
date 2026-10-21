import { describe, expect, it } from "vitest";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, internalAllowancePolicyFromValue } from "@debateai/register";
import type { InternalAllowancePort } from "@debateai/db";
import { fundingSelectionDifference, StaffInternalFundingReadiness } from "../../apps/api/src/staff/internal-allowances.js";
const policy = internalAllowancePolicyFromValue({ enabled: true, funding_policy_version: 1, currency: "USD", maximum_grant_micros: 1200000,
  maximum_day_micros: 100000, maximum_week_micros: 500000, maximum_lifetime_ms: 2678400000, finish_allowance_bp: 10000 }, "test:funding-ready");
if (!policy.enabled) throw Error("Enabled synthetic policy required");
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test:billing-ready");
const target = { providerRef: "fixture-provider", maker: "fixture-maker", baseUrl: "https://provider.example.test/v1", model: "fixture-model",
  inputPriceMicrosPerMillionTokens: 1, outputPriceMicrosPerMillionTokens: 1 };
const ready = { deploymentMode: "hosted" as const, billingPlans: plans, providerTargets: [target],
  independentReadiness: { readIndependentAlertReadiness: async () => "READY" as const } };
/** The selection (`selected`) and the publication at a version (`at`, default: the selection's when the version is its). */
const port = (selected: unknown = { registerVersion: 2, policy }, at?: (version: number) => unknown) => {
  const reads: Array<"pointer" | number> = [];
  const allowances = {
    readPolicy: async () => { reads.push("pointer"); if (selected instanceof Error) throw selected; return selected; },
    readPolicyAt: async (version: number) => {
      reads.push(version);
      return at !== undefined ? at(version) : (selected as { registerVersion?: number } | null)?.registerVersion === version ? selected : null;
    }
  } as unknown as InternalAllowancePort;
  return Object.assign(allowances, { reads });
};
describe("funding activation consumes actual finite prerequisites", () => {
  it("requires a selection, hosted billing and both priced sides plus fresh evidence", async () => {
    await expect(new StaffInternalFundingReadiness(port(), ready).requireReady()).resolves.toBeUndefined();
    for (const input of [
      { ...ready, deploymentMode: "local" as const }, { ...ready, billingPlans: null }, { ...ready, providerTargets: [] },
      { ...ready, providerTargets: [{ providerRef: target.providerRef, maker: target.maker, baseUrl: target.baseUrl, model: target.model }] },
      { ...ready, providerTargets: [{ ...target, inputPriceMicrosPerMillionTokens: 0 }] },
      { ...ready, independentReadiness: { readIndependentAlertReadiness: async () => "UNAVAILABLE" as const } }
    ]) await expect(new StaffInternalFundingReadiness(port(), input).requireReady()).rejects.toThrow();
    // Funding switched off: no funded action.
    await expect(new StaffInternalFundingReadiness(port(null), ready).requireReady()).rejects.toThrow("STAFF_UNAVAILABLE");
  });
  it("side-by-side C17: a funded action reads the selection by its own version, whatever this release's settings say", async () => {
    // Spec §9: a newer release selected version 18 with another day cap; this release's settings still name the old one.
    const moved = port({ registerVersion: 18, policy: { ...policy, maximumDayMicros: 99999 } });
    await expect(new StaffInternalFundingReadiness(moved, ready).requireReady()).resolves.toBeUndefined();
    expect(moved.reads).toEqual(["pointer", 18]);
    // The selection's version is no funding publication, or reads otherwise than the selection: refused.
    await expect(new StaffInternalFundingReadiness(port({ registerVersion: 18, policy }, () => null), ready).requireReady()).rejects.toThrow("STAFF_UNAVAILABLE");
    await expect(new StaffInternalFundingReadiness(port({ registerVersion: 18, policy }, (version) => ({ registerVersion: version, policy: { ...policy, maximumWeekMicros: 400000 } })), ready)
      .requireReady()).rejects.toThrow("STAFF_UNAVAILABLE");
  });
  it("boot checks only static funding configuration, never the shared selection; stale evidence locks each action with the typed alert refusal", async () => {
    const stale = { ...ready, independentReadiness: { readIndependentAlertReadiness: async () => "UNAVAILABLE" as const } };
    await expect(new StaffInternalFundingReadiness(port(), stale).requireConfigured()).resolves.toBeUndefined();
    await expect(new StaffInternalFundingReadiness(port(), stale).requireReady()).rejects.toMatchObject({ code: "STAFF_ALERT_UNAVAILABLE" });
    for (const input of [{ ...stale, deploymentMode: "local" as const }, { ...stale, billingPlans: null }, { ...stale, providerTargets: [] }])
      await expect(new StaffInternalFundingReadiness(port(), input).requireConfigured()).rejects.toThrow("STAFF_UNAVAILABLE");
    // Side-by-side spec §9: neither process refuses boot over funding (C17).
    for (const selected of [null, { registerVersion: 2, policy: { ...policy, maximumDayMicros: 99999 } }, new Error("INTERNAL_ALLOWANCE_UNAVAILABLE")]) {
      const allowances = port(selected);
      await expect(new StaffInternalFundingReadiness(allowances, stale).requireConfigured()).resolves.toBeUndefined();
      expect(allowances.reads).toEqual([]);
    }
  });
  it("side-by-side C17: boot names how the selection differs from this release's settings, in one content-free reason", async () => {
    await expect(fundingSelectionDifference(port(), policy)).resolves.toBeNull();
    await expect(fundingSelectionDifference(port(null), undefined)).resolves.toBeNull();
    await expect(fundingSelectionDifference(port({ registerVersion: 18, policy: { ...policy, maximumDayMicros: 99999 } }), policy)).resolves.toBe("DIFFERENT");
    await expect(fundingSelectionDifference(port(null), policy)).resolves.toBe("ABSENT");
    await expect(fundingSelectionDifference(port(), undefined)).resolves.toBe("NOT_CONFIGURED");
    await expect(fundingSelectionDifference(port(new Error("INTERNAL_ALLOWANCE_UNAVAILABLE")), policy)).resolves.toBe("UNREADABLE");
    await expect(fundingSelectionDifference(port(new Error("INTERNAL_ALLOWANCE_UNAVAILABLE")), undefined)).resolves.toBe("UNREADABLE");
  });
});
