import { assertPricedProviderTargets, type ProviderDiscoveryTarget } from "@debateai/providers";
import type { InternalAllowancePolicy } from "@debateai/kernel";
import type { InternalAllowancePort } from "@debateai/db";
import type { BillingPlans } from "@debateai/register";
import { parseCanonicalRegisterJson } from "@debateai/register";
import { StaffAlertError } from "./alerts.js";

const unavailable = () => new Error("STAFF_UNAVAILABLE");

export interface StaffInternalFundingApplication {
  readonly allowances: InternalAllowancePort;
  requireReady(): Promise<void>;
}
const canonical = (policy: unknown) => parseCanonicalRegisterJson(Buffer.from(JSON.stringify(policy)));
/**
 * Side-by-side spec §9 (C17): how the shared funding selection differs from this release's own settings, as one
 * content-free reason for boot's journal line `api.funding.selection_differs`, or null when they agree (both off, or the
 * same policy). NOT_CONFIGURED: this release's settings name no funding, the selection names some; ABSENT: the settings
 * name funding, funding is switched off; DIFFERENT: both name a policy, another one; UNREADABLE: the selection could not
 * be read (a shape a newer release wrote). Never throws: another release moves the selection, so neither process refuses
 * boot over it.
 */
export type FundingSelectionDifference = "NOT_CONFIGURED" | "ABSENT" | "DIFFERENT" | "UNREADABLE";
export async function fundingSelectionDifference(allowances: Pick<InternalAllowancePort, "readPolicy">,
  configured: Extract<InternalAllowancePolicy, { enabled: true }> | undefined): Promise<FundingSelectionDifference | null> {
  let selected: Awaited<ReturnType<InternalAllowancePort["readPolicy"]>>;
  try { selected = await allowances.readPolicy(); } catch { return "UNREADABLE"; }
  if (configured === undefined) return selected === null ? null : "NOT_CONFIGURED";
  if (selected === null) return "ABSENT";
  return canonical(selected.policy) === canonical(configured) ? null : "DIFFERENT";
}
/**
 * Trusted composition consumes priced targets, billing and fresh independent evidence at boot, and the actual sealed
 * selection at use time. Side-by-side spec §9 (C17): the selection is shared by every live release and moved by the
 * newest, so boot never judges it (`fundingSelectionDifference` names a difference in one journal line), and a funded
 * action reads the selection, then the funding publication at the selection's OWN version, never this release's.
 */
export class StaffInternalFundingReadiness implements StaffInternalFundingApplication {
  constructor(readonly allowances: InternalAllowancePort, private readonly input: Readonly<{
    deploymentMode: "hosted" | "local";
    billingPlans: BillingPlans | null;
    providerTargets: readonly ProviderDiscoveryTarget[];
    independentReadiness: Readonly<{ readIndependentAlertReadiness(): Promise<"READY" | "UNAVAILABLE"> }>;
  }>) {}
  /** Static startup facts of this release only: hosted USD billing and priced targets. The selection is not read. */
  async requireConfigured(): Promise<void> {
    if (this.input.deploymentMode !== "hosted" || this.input.billingPlans === null || this.input.billingPlans.creditCurrency !== "USD"
      || this.input.providerTargets.length === 0) throw unavailable();
    assertPricedProviderTargets(this.input.providerTargets, this.input.deploymentMode);
  }
  /**
   * Every funded action: static facts, then funding switched on (a selection) whose publication at the selection's own
   * version reads as the selection does, then fresh independent evidence; stale evidence means team tools are locked.
   */
  async requireReady(): Promise<void> {
    await this.requireConfigured();
    const selected = await this.allowances.readPolicy();
    if (selected === null) throw unavailable();
    const atOwnVersion = await this.allowances.readPolicyAt(selected.registerVersion);
    if (atOwnVersion === null || canonical(atOwnVersion.policy) !== canonical(selected.policy)) throw unavailable();
    if (await this.input.independentReadiness.readIndependentAlertReadiness() !== "READY") throw new StaffAlertError("STAFF_ALERT_UNAVAILABLE");
  }
}
