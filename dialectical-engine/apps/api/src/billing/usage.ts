import type { PersonAllowanceSource, PersonWindow } from "@debateai/budget";
import { TypedDomainError, type FundingBasis, type InternalGrant } from "@debateai/kernel";
import type { PlanId } from "@debateai/register";
import type { BillingUsageReader } from "./index.js";

/**
 * Paid-plans spec §1.2 (U1) — WHAT THE USAGE BARS SHOW: what the person has spent
 * in each window, as a whole percentage of its limit, rounded DOWN and clamped to
 * 0–110 (a running debate may take a window to its 110% finish edge). Holds are
 * not shown: a bar says what was used, not what is promised to a running debate.
 */
export function usagePercent(spentMicros: number, limitMicros: number): number {
  if (!Number.isSafeInteger(spentMicros) || spentMicros < 0
    || !Number.isSafeInteger(limitMicros) || limitMicros < 1) {
    throw new TypeError("BILLING_USAGE_INPUT_INVALID");
  }
  const shown = (BigInt(spentMicros) * 100n) / BigInt(limitMicros);
  return Number(shown > 110n ? 110n : shown);
}

const WINDOW_ORDER: Readonly<Record<PersonWindow["scope"], number>> = Object.freeze({
  PERSON_DAY: 0, PERSON_WEEK: 1, PERSON_MONTH: 2, PERSON_GRANT: 2
});

export class PersonUsageReader implements BillingUsageReader {
  constructor(private readonly options: Readonly<{
    entitlements: Readonly<{ current(ownerRef: string, now: Date): Promise<Readonly<{ planId: PlanId }>> }>;
    allowance: PersonAllowanceSource;
    funding?: Readonly<{readGrant(ownerRef:string,now:Date):Promise<Pick<InternalGrant,"expiresAt"|"grantId"|"grantEventId">|null>}>;
    spend: Readonly<{ readOwnerSpentMicros(ownerRef: string, from: Date, to: Date, funding?:FundingBasis, scope?:PersonWindow["scope"]): Promise<number> }>;
  }>) {}

  async read(ownerRef: string, now: Date): Promise<Awaited<ReturnType<BillingUsageReader["read"]>>> {
    const grant = await this.options.funding?.readGrant(ownerRef,now) ?? null;
    const entitlement = grant === null ? await this.options.entitlements.current(ownerRef, now) : null;
    const windows = [...await this.options.allowance.read(ownerRef, now)]
      .sort((left, right) => WINDOW_ORDER[left.scope] - WINDOW_ORDER[right.scope]);
    if (windows.some(window => grant === null ? window.funding?.kind === "INTERNAL" : window.funding?.kind !== "INTERNAL"
      || window.funding.grantId !== grant.grantId || window.funding.grantEventId !== grant.grantEventId))
      throw new TypedDomainError("RUN_FUNDING_BASIS_CONFLICT","Usage funding changed during its read");
    const rows: Array<Readonly<{ scope: PersonWindow["scope"]; percent: number; resetsAt: Date }>> = [];
    for (const window of windows) {
      const spent = await this.options.spend.readOwnerSpentMicros(ownerRef, window.periodStart, window.resetsAt, window.funding, window.scope);
      rows.push(Object.freeze({ scope: window.scope, percent: Math.min(grant === null ? 110 : 100,usagePercent(spent, window.limitMicros)), resetsAt: window.resetsAt }));
    }
    return Object.freeze({ planId: entitlement?.planId ?? null, ...(grant === null ? {} : {funding:{kind:"INTERNAL" as const,expiresAt:grant.expiresAt}}), windows: Object.freeze(rows) });
  }
}
