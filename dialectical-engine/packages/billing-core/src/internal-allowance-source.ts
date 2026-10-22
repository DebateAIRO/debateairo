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
  /** The selection (the pointer): read only to know whether funding is switched on for a NEW ask. */
  readPolicy(): Promise<FundingPolicyAt | null>;
  /** The sealed funding publication at `registerVersion`, or null when that version is none. */
  readPolicyAt(registerVersion: number): Promise<FundingPolicyAt | null>;
}
type FundingPolicyAt = Readonly<{ registerVersion: number; policy: Extract<InternalAllowancePolicy, { enabled: true }> }>;
/** Lifetime ceiling of any grant, whatever its version's policy says (31 days). */
const MAXIMUM_GRANT_LIFETIME_MS = 2678400000;
/** A policy usable for bounds: the version asked for, finite USD maxima, day ≤ week ≤ grant, lifetime ≤ 31 days. */
function validPolicyAt(published: FundingPolicyAt | null, registerVersion: number): published is FundingPolicyAt {
  if (published === null) return false;
  const p = published.policy;
  return published.registerVersion === registerVersion && p.enabled === true && p.fundingPolicyVersion === 1 && p.currency === "USD"
    && p.finishAllowanceBp === 10000 && positive(p.maximumGrantMicros) && positive(p.maximumDayMicros) && positive(p.maximumWeekMicros)
    && positive(p.maximumLifetimeMs) && p.maximumLifetimeMs <= MAXIMUM_GRANT_LIFETIME_MS
    && p.maximumDayMicros <= p.maximumWeekMicros && p.maximumWeekMicros <= p.maximumGrantMicros
    && typeof p.sourceRef === "string" && p.sourceRef.trim() !== "";
}
/**
 * Consumption only: no privileged mutation or recovery-login readiness dependency. It holds no register version: a
 * grant stays valid under the version it was issued with, whatever the selection or the process's version is now
 * (side-by-side spec §9, C15): it is checked against the sealed funding publication of its own
 * `policyRegisterVersion` (`readPolicyAt`), and nothing compares a grant with the current pointer. A run-pinned read
 * never reads the pointer at all; a new ask reads it only to know whether funding is switched on (null: the
 * subscription path, as when funding is off).
 */
export class FundingAwarePersonAllowanceSource implements PersonAllowanceSource {
  private readonly customer: BillingPersonAllowanceSource;
  constructor(private readonly options: Readonly<{
    allowances: FundingAllowancePort; entitlements: FundingEntitlementPort; plans: BillingPlans;
    closeBasisPoints: number;
  }>) {
    // The subscription path reads exactly as the plain source does: an owner with no windows row has no personal limit
    // (`[]`). Only a NEW ask refuses a missing row (resolveAskFunding), since its run needs a basis to pin.
    this.customer = new BillingPersonAllowanceSource({
      entitlements: options.entitlements, plans: options.plans, closeBasisPoints: options.closeBasisPoints
    });
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
    } else if (await this.options.allowances.readPolicy() === null) {
      // A new ask while funding is switched off: no grant applies; the subscription path answers.
      return null;
    }
    const grant = context === undefined ? await this.options.allowances.current(ownerRef, now) : await this.options.allowances.forRun(context.runId, now);
    if (grant === null) { if (basis !== null) throw unavailable(); return null; }
    // The grant's own bounds first (ids, day ≤ week ≤ amount, lifetime ≤ 31 days, inside its window, the run's basis).
    const start = grant.startsAt?.getTime(), expiry = grant.expiresAt?.getTime();
    if (!UUID.test(grant.grantId) || !UUID.test(grant.grantEventId) || grant.ownerRef !== ownerRef || !positive(grant.revision)
      || !positive(grant.policyRegisterVersion) || !positive(grant.amountMicros) || !positive(grant.dayMicros) || !positive(grant.weekMicros)
      || grant.dayMicros > grant.weekMicros || grant.weekMicros > grant.amountMicros
      || !Number.isFinite(start) || !Number.isFinite(expiry) || expiry <= start || expiry - start > MAXIMUM_GRANT_LIFETIME_MS
      || now.getTime() < start || now.getTime() >= expiry
      || (basis?.kind === "INTERNAL" && (basis.grantId !== grant.grantId || basis.grantEventId !== grant.grantEventId))) throw unavailable();
    // Then the maxima of the version it was issued with (spec §9), never the selection's: a version that is no sealed
    // funding publication any more refuses.
    const issued = await this.options.allowances.readPolicyAt(grant.policyRegisterVersion);
    if (!validPolicyAt(issued, grant.policyRegisterVersion)) throw unavailable();
    const p = issued.policy;
    if (grant.amountMicros > p.maximumGrantMicros || grant.dayMicros > p.maximumDayMicros || grant.weekMicros > p.maximumWeekMicros
      || expiry - start > p.maximumLifetimeMs) throw unavailable();
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
