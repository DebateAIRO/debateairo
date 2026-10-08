import { assertPricedProviderTargets, type ProviderDiscoveryTarget } from "@debateai/providers";
import type { InternalAllowancePolicy } from "@debateai/kernel";
import type { InternalAllowancePort } from "@debateai/db";
import type { BillingPlans } from "@debateai/register";
import { parseCanonicalRegisterJson } from "@debateai/register";

export interface StaffInternalFundingApplication {
  readonly allowances: InternalAllowancePort;
  requireReady(): Promise<void>;
}
/** Trusted composition consumes actual sealed selection, priced targets, billing and fresh independent evidence. */
export class StaffInternalFundingReadiness implements StaffInternalFundingApplication {
  constructor(readonly allowances: InternalAllowancePort, private readonly input: Readonly<{
    expectedPolicy: Extract<InternalAllowancePolicy, { enabled: true }>;
    deploymentMode: "hosted" | "local";
    billingPlans: BillingPlans | null;
    providerTargets: readonly ProviderDiscoveryTarget[];
    independentReadiness: Readonly<{ readIndependentAlertReadiness(): Promise<"READY" | "UNAVAILABLE"> }>;
  }>) {}
  async requireReady(): Promise<void> {
    const unavailable = () => new Error("STAFF_UNAVAILABLE");
    if (this.input.deploymentMode !== "hosted" || this.input.billingPlans === null || this.input.billingPlans.currency !== "USD"
      || this.input.providerTargets.length === 0) throw unavailable();
    assertPricedProviderTargets(this.input.providerTargets, this.input.deploymentMode);
    const selected = await this.allowances.readPolicy();
    if (selected === null || parseCanonicalRegisterJson(Buffer.from(JSON.stringify(selected.policy)))
      !== parseCanonicalRegisterJson(Buffer.from(JSON.stringify(this.input.expectedPolicy)))
      || await this.input.independentReadiness.readIndependentAlertReadiness() !== "READY") throw unavailable();
  }
}
