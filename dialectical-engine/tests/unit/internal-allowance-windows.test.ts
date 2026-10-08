import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import * as billingCore from "@debateai/billing-core";
import { BILLING_PLANS_DEPLOYMENT_REGISTER_ROW, billingPlansFromValue } from "@debateai/register";
import type { InternalGrant, FundingBasis } from "@debateai/kernel";
const ownerRef = randomUUID(), grantId = randomUUID(), grantEventId = randomUUID(), eventId = randomUUID();
const grant: InternalGrant = { ownerRef, grantId, grantEventId, revision: 1, amountMicros: 1000000, dayMicros: 100000,
  weekMicros: 500000, startsAt: new Date("2026-10-01T10:00:00Z"), expiresAt: new Date("2026-10-09T12:00:00Z"),
  fundingApprovalRef: "SYNTHETIC-APPROVAL", policyRegisterVersion: 2 };
const plans = billingPlansFromValue(BILLING_PLANS_DEPLOYMENT_REGISTER_ROW.value, "test:task11");
const now = new Date("2026-10-09T11:00:00Z");
function source(current: InternalGrant | null = grant, basis: FundingBasis | null = null, pinned: InternalGrant | null = grant, policyChange: Record<string,unknown> = {}) {
  const Constructor = (billingCore as unknown as { FundingAwarePersonAllowanceSource: new(input: unknown) => {
    read(owner: string, at: Date, context?: { runId: string }): Promise<readonly import("@debateai/budget").PersonWindow[]>;
    resolveAskFunding(owner: string, at: Date): Promise<FundingBasis>;
    readFundingForRun(run: string): Promise<FundingBasis>;
    assertProviderFundingAdmission(run: string, at: Date): Promise<void>;
  } }).FundingAwarePersonAllowanceSource;
  return new Constructor({ allowances: { readPolicy: async () => ({registerVersion:2, policy:{enabled:true,fundingPolicyVersion:1,currency:"USD",maximumGrantMicros:1000000,maximumDayMicros:100000,maximumWeekMicros:500000,maximumLifetimeMs:2678400000,finishAllowanceBp:10000,sourceRef:"test:task11",...policyChange}}), current: async () => current, forRun: async () => pinned },
    entitlements: { current: async () => ({ planId: "FREE", eventId, periodAnchorAt: new Date("2026-10-01T10:00:00Z"), monthCreditOverrideMicros: null }),
      readRunFundingBasis: async () => basis }, plans, closeBasisPoints: 9500, registerVersion: 2 });
}
describe("finite internal windows preserve the grant rather than a subscription", () => {
  it("uses grant-anchored day/week and total with expiry-clipped edges and zero finish overrun", async () => {
    const windows = await source().read(ownerRef, now);
    expect(windows.map(w => [w.scope, w.limitMicros, w.periodStart.toISOString(), w.resetsAt.toISOString(), w.finishBasisPoints, w.closeBasisPoints, w.funding]))
      .toEqual([
        ["PERSON_DAY",100000,"2026-10-09T10:00:00.000Z","2026-10-09T12:00:00.000Z",10000,9500,{kind:"INTERNAL",grantId,grantEventId}],
        ["PERSON_WEEK",500000,"2026-10-08T10:00:00.000Z","2026-10-09T12:00:00.000Z",10000,9500,{kind:"INTERNAL",grantId,grantEventId}],
        ["PERSON_GRANT",1000000,"2026-10-01T10:00:00.000Z","2026-10-09T12:00:00.000Z",10000,9500,{kind:"INTERNAL",grantId,grantEventId}]
      ]);
    expect(await source().resolveAskFunding(ownerRef, now)).toEqual({kind:"INTERNAL",grantId,grantEventId});
  });
  it("keeps absent current grant on finite FREE customer windows", async () => {
    expect(await source(null).resolveAskFunding(ownerRef,now)).toEqual({kind:"SUBSCRIPTION",planId:"FREE",entitlementEventId:eventId});
    expect((await source(null).read(ownerRef,now)).map(w=>w.scope)).toEqual(["PERSON_MONTH"]);
  });
  it("never replaces an INTERNAL pin with current replacement or subscription", async () => {
    const pin = {kind:"INTERNAL",grantId,grantEventId} as const;
    await expect(source(null,pin,null).read(ownerRef,now,{runId:randomUUID()})).rejects.toThrow();
    await expect(source(grant,pin,{...grant,grantId:randomUUID()}).assertProviderFundingAdmission(randomUUID(),now)).rejects.toThrow();
    expect(await source(grant,pin).readFundingForRun(randomUUID())).toEqual(pin);
  });
  it("refuses malformed amounts, owner/version/date and out-of-window grants", async () => {
    for (const malformed of [
      {...grant,amountMicros:Number.MAX_SAFE_INTEGER+1},{...grant,dayMicros:0},{...grant,weekMicros:1000001},
      {...grant,ownerRef:randomUUID()},{...grant,policyRegisterVersion:3},{...grant,expiresAt:new Date(NaN)},
      {...grant,expiresAt:now},{...grant,startsAt:new Date("2026-10-10T00:00:00Z")}
    ]) await expect(source(malformed).read(ownerRef,now)).rejects.toThrow();
  });
  it("does not turn missing pinned funding into an unbounded allowance", async () => {
    await expect(source(null,null).read(ownerRef,now,{runId:randomUUID()})).rejects.toThrow();
  });
  it("refuses malformed selected policy rather than letting NaN or missing maxima bypass bounds",async()=>{
    for(const p of [{maximumGrantMicros:undefined},{maximumDayMicros:NaN},{maximumWeekMicros:0},{maximumLifetimeMs:2678400001},{maximumDayMicros:600000},{sourceRef:""}])
      await expect(source(grant,null,grant,p).read(ownerRef,now)).rejects.toThrow();
  });
});
