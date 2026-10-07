import { TypedDomainError, type FundingBasis, type InternalAllowancePolicy, type InternalAllowanceReadPort, type InternalGrant, type InternalRunFundingState } from "@debateai/kernel";
import type { PersonAllowanceSource, PersonWindow } from "@debateai/budget";
import type { BillingPlans } from "@debateai/register";
import { BillingPersonAllowanceSource, type EntitlementWindowBasis } from "./allowance-source.js";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const unavailable = () => new TypedDomainError("INTERNAL_FUNDING_UNAVAILABLE", "The finite funding basis is unavailable");
const positive = (n: number) => Number.isSafeInteger(n) && n > 0;
export interface FundingEntitlementPort {
  current(ownerRef: string, now: Date): Promise<(EntitlementWindowBasis & Readonly<{ eventId: string }>) | null>;
  readRunFundingBasis(runId: string): Promise<FundingBasis | null>;
}
export interface FundingAllowancePort extends InternalAllowanceReadPort {
  readRunState(runId:string):Promise<InternalRunFundingState>;
  readPolicy(): Promise<Readonly<{ registerVersion: number; policy: Extract<InternalAllowancePolicy, { enabled: true }> }> | null>;
}
/** Consumption only: no privileged mutation or recovery-login readiness dependency. */
export class FundingAwarePersonAllowanceSource implements PersonAllowanceSource {
  private readonly customer: BillingPersonAllowanceSource;
  constructor(private readonly options: Readonly<{
    allowances: FundingAllowancePort; entitlements: FundingEntitlementPort; plans: BillingPlans;
    closeBasisPoints: number; registerVersion: number;
  }>) {
    if (!positive(options.registerVersion)) throw unavailable();
    this.customer = new BillingPersonAllowanceSource({ ...options, entitlements: {
      current: async (owner, now) => { const value = await options.entitlements.current(owner, now); if (value === null) throw unavailable(); return value; }
    } });
  }
  private checkBasis(basis: FundingBasis | null): FundingBasis {
    if (basis === null || (basis.kind === "INTERNAL" ? !UUID.test(basis.grantId) || !UUID.test(basis.grantEventId)
      : !["FREE","PLUS","PRO","MAX"].includes(basis.planId) || !UUID.test(basis.entitlementEventId))) throw unavailable();
    return basis;
  }
  async readRunFundingState(runId:string):Promise<InternalRunFundingState> { return this.options.allowances.readRunState(runId); }
  async readFundingForRun(runId: string): Promise<FundingBasis> { return this.checkBasis(await this.options.entitlements.readRunFundingBasis(runId)); }
  async resolveAskFunding(ownerRef: string, now: Date): Promise<FundingBasis> {
    const grant = await this.readGrant(ownerRef, now);
    if (grant !== null) return Object.freeze({ kind: "INTERNAL", grantId: grant.grantId, grantEventId: grant.grantEventId });
    const entitlement = await this.options.entitlements.current(ownerRef, now);
    if (entitlement === null) throw unavailable();
    return this.checkBasis(Object.freeze({ kind: "SUBSCRIPTION", planId: entitlement.planId, entitlementEventId: entitlement.eventId }));
  }
  async readGrant(ownerRef: string, now: Date, context?: Readonly<{ runId: string }>): Promise<InternalGrant | null> {
    if (!UUID.test(ownerRef) || !Number.isFinite(now.getTime())) throw unavailable();
    let basis: FundingBasis | null = null;
    if (context !== undefined) {
      basis = await this.readFundingForRun(context.runId);
      if (basis.kind === "SUBSCRIPTION") return null;
    }
    const selected = await this.options.allowances.readPolicy();
    if (selected === null || selected.registerVersion !== this.options.registerVersion || selected.policy.enabled !== true
      || selected.policy.fundingPolicyVersion !== 1 || selected.policy.currency !== "USD" || selected.policy.finishAllowanceBp !== 10000
      || !positive(selected.policy.maximumGrantMicros) || !positive(selected.policy.maximumDayMicros) || !positive(selected.policy.maximumWeekMicros)
      || !positive(selected.policy.maximumLifetimeMs) || selected.policy.maximumLifetimeMs > 2678400000
      || selected.policy.maximumDayMicros > selected.policy.maximumWeekMicros || selected.policy.maximumWeekMicros > selected.policy.maximumGrantMicros
      || typeof selected.policy.sourceRef !== "string" || selected.policy.sourceRef.trim() === "") throw unavailable();
    const grant = context === undefined ? await this.options.allowances.current(ownerRef, now) : await this.options.allowances.forRun(context.runId, now);
    if (grant === null) { if (basis !== null) throw unavailable(); return null; }
    const p = selected.policy, start = grant.startsAt?.getTime(), expiry = grant.expiresAt?.getTime();
    if (!UUID.test(grant.grantId) || !UUID.test(grant.grantEventId) || grant.ownerRef !== ownerRef || !positive(grant.revision)
      || grant.policyRegisterVersion !== this.options.registerVersion || !positive(grant.amountMicros) || !positive(grant.dayMicros) || !positive(grant.weekMicros)
      || grant.dayMicros > grant.weekMicros || grant.weekMicros > grant.amountMicros || grant.amountMicros > p.maximumGrantMicros
      || grant.dayMicros > p.maximumDayMicros || grant.weekMicros > p.maximumWeekMicros
      || !Number.isFinite(start) || !Number.isFinite(expiry) || expiry <= start || expiry - start > p.maximumLifetimeMs
      || now.getTime() < start || now.getTime() >= expiry
      || (basis?.kind === "INTERNAL" && (basis.grantId !== grant.grantId || basis.grantEventId !== grant.grantEventId))) throw unavailable();
    return grant;
  }
  async assertProviderFundingAdmission(runId: string, now: Date): Promise<void> {
    const basis = await this.options.entitlements.readRunFundingBasis(runId);
    // Legacy/billing-off runs have no scope; new funded room runs always persist one.
    if (basis === null) return;
    this.checkBasis(basis);
    if (basis.kind === "INTERNAL") {
      const grant = await this.options.allowances.forRun(runId, now);
      if (grant === null) throw unavailable();
      await this.readGrant(grant.ownerRef, now, { runId });
    }
  }
  async readSubscriptionWindows(ownerRef: string, now: Date): Promise<readonly PersonWindow[]> { return this.customer.read(ownerRef, now); }
  async read(ownerRef: string, now: Date, context?: Readonly<{ runId: string }>): Promise<readonly PersonWindow[]> {
    const grant = await this.readGrant(ownerRef, now, context);
    if (grant === null) return this.customer.read(ownerRef, now);
    const start = grant.startsAt.getTime(), end = grant.expiresAt.getTime(), elapsed = now.getTime() - start;
    const funding = Object.freeze({ kind: "INTERNAL" as const, grantId: grant.grantId, grantEventId: grant.grantEventId });
    const window = (scope: PersonWindow["scope"], limitMicros: number, span: number | null): PersonWindow => {
      const from = span === null ? start : start + Math.floor(elapsed / span) * span;
      return Object.freeze({ scope, limitMicros, periodStart: new Date(from), resetsAt: new Date(span === null ? end : Math.min(from + span, end)),
        finishBasisPoints: 10000, closeBasisPoints: this.options.closeBasisPoints, funding });
    };
    return Object.freeze([window("PERSON_DAY", grant.dayMicros, 86400000), window("PERSON_WEEK", grant.weekMicros, 604800000), window("PERSON_GRANT", grant.amountMicros, null)]);
  }
}
