import { describe, expect, it } from "vitest";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue, internalAllowancePolicyFromValue } from "@debateai/register";
import type { InternalAllowancePort } from "@debateai/db";
import { StaffInternalFundingReadiness } from "../../apps/api/src/staff/internal-allowances.js";
const policy = internalAllowancePolicyFromValue({ enabled: true, funding_policy_version: 1, currency: "USD", maximum_grant_micros: 1200000,
  maximum_day_micros: 100000, maximum_week_micros: 500000, maximum_lifetime_ms: 2678400000, finish_allowance_bp: 10000 }, "test:funding-ready");
if (!policy.enabled) throw Error("Enabled synthetic policy required");
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test:billing-ready");
const target = { providerRef: "fixture-provider", maker: "fixture-maker", baseUrl: "https://provider.example.test/v1", model: "fixture-model",
  inputPriceMicrosPerMillionTokens: 1, outputPriceMicrosPerMillionTokens: 1 };
const ready = { expectedPolicy: policy, deploymentMode: "hosted" as const, billingPlans: plans, providerTargets: [target],
  independentReadiness: { readIndependentAlertReadiness: async () => "READY" as const } };
const port = (selected: unknown = { registerVersion: 2, policy }) => ({ readPolicy: async () => selected }) as unknown as InternalAllowancePort;
describe("funding activation consumes actual finite prerequisites", () => {
  it("requires a matching selected policy, hosted billing and both priced sides plus fresh evidence", async () => {
    await expect(new StaffInternalFundingReadiness(port(), ready).requireReady()).resolves.toBeUndefined();
    for (const input of [
      { ...ready, deploymentMode: "local" as const }, { ...ready, billingPlans: null }, { ...ready, providerTargets: [] },
      { ...ready, providerTargets: [{ providerRef: target.providerRef, maker: target.maker, baseUrl: target.baseUrl, model: target.model }] },
      { ...ready, providerTargets: [{ ...target, inputPriceMicrosPerMillionTokens: 0 }] },
      { ...ready, independentReadiness: { readIndependentAlertReadiness: async () => "UNAVAILABLE" as const } }
    ]) await expect(new StaffInternalFundingReadiness(port(), input).requireReady()).rejects.toThrow();
    await expect(new StaffInternalFundingReadiness(port(null), ready).requireReady()).rejects.toThrow();
    await expect(new StaffInternalFundingReadiness(port({ registerVersion: 2, policy: { ...policy, maximumDayMicros: 99999 } }), ready).requireReady()).rejects.toThrow();
  });
});
