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
  requireNewGrantPolicy(policyRegisterVersion: number): Promise<void>;
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
 * newest, so boot never judges it (`fundingSelectionDifference` names a difference in one journal line). A NEW grant
 * still needs two parties to agree (C17 review): this release's env policy (`expectedPolicy`, the deployment's) and the
 * sealed funding publication at the version the grant is issued under (the independent operator's reviewed selection).
 */
export class StaffInternalFundingReadiness implements StaffInternalFundingApplication {
  constructor(readonly allowances: InternalAllowancePort, private readonly input: Readonly<{
    expectedPolicy: Extract<InternalAllowancePolicy, { enabled: true }>;
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
   * Every funded action: static facts, then funding switched on (a selection), then fresh independent evidence; stale
   * evidence means team tools are locked. The selection's content is judged per new grant (`requireNewGrantPolicy`).
   */
  async requireReady(): Promise<void> {
    await this.requireConfigured();
    if (await this.allowances.readPolicy() === null) throw unavailable();
    if (await this.input.independentReadiness.readIndependentAlertReadiness() !== "READY") throw new StaffAlertError("STAFF_ALERT_UNAVAILABLE");
  }
  /**
   * A configure (a NEW grant) only, after the guarded reader named its `policyRegisterVersion` (the version bound into
   * the proof digest, so a selection moved since `requireReady` is judged as the grant will be issued): the sealed
   * funding publication at that version must equal this release's env policy. Refuses the action (STAFF_UNAVAILABLE),
   * never boot. A revoke is not checked: it names the grant's own version and can only narrow funding.
   */
  async requireNewGrantPolicy(policyRegisterVersion: number): Promise<void> {
    const published = await this.allowances.readPolicyAt(policyRegisterVersion);
    if (published === null || canonical(published.policy) !== canonical(this.input.expectedPolicy)) throw unavailable();
  }
}
