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
const policyOf = (change: Record<string, unknown> = {}) => ({ enabled: true, fundingPolicyVersion: 1, currency: "USD",
  maximumGrantMicros: 1000000, maximumDayMicros: 100000, maximumWeekMicros: 500000, maximumLifetimeMs: 2678400000,
  finishAllowanceBp: 10000, sourceRef: "test:task11", ...change });
type Funding = {
  read(owner: string, at: Date, context?: { runId: string }): Promise<readonly import("@debateai/budget").PersonWindow[]>;
  resolveAskFunding(owner: string, at: Date): Promise<FundingBasis>;
  readFundingForRun(run: string): Promise<FundingBasis>;
  assertProviderFundingAdmission(run: string, at: Date): Promise<void>;
};
/**
 * `policyChange` shapes the policy of the grant's own version (readPolicyAt) and the selection alike. `versions`
 * answers readPolicyAt by version (default: version 2 only); `selection` is what readPolicy answers (the pointer);
 * `calls` counts both reads.
 */
function source(current: InternalGrant | null = grant, basis: FundingBasis | null = null, pinned: InternalGrant | null = grant,
  policyChange: Record<string,unknown> = {}, more: Readonly<{
    versions?: Readonly<Record<number, ReturnType<typeof policyOf> | null>>;
    selection?: Readonly<{ registerVersion: number; policy: ReturnType<typeof policyOf> }> | null;
    calls?: { readPolicy: number; readPolicyAt: number[] };
    /** null: the owner has no windows row (the entitlement port answers null). */
    entitlement?: null;
  }> = {}) {
  const Constructor = (billingCore as unknown as { FundingAwarePersonAllowanceSource: new(input: unknown) => Funding })
    .FundingAwarePersonAllowanceSource;
  const versions = more.versions ?? { 2: policyOf(policyChange) };
  const selection = more.selection === undefined ? { registerVersion: 2, policy: policyOf(policyChange) } : more.selection;
  return new Constructor({ allowances: {
    readPolicy: async () => { if (more.calls) more.calls.readPolicy += 1; return selection; },
    readPolicyAt: async (version: number) => {
      more.calls?.readPolicyAt.push(version);
      const policy = versions[version];
      return policy === undefined || policy === null ? null : { registerVersion: version, policy };
    },
    current: async () => current, forRun: async () => pinned },
    entitlements: { current: async () => more.entitlement === null ? null
      : ({ planId: "FREE", eventId, periodAnchorAt: new Date("2026-10-01T10:00:00Z"), monthCreditOverrideMicros: null }),
      readRunFundingBasis: async () => basis }, plans, closeBasisPoints: 9500 });
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
      {...grant,ownerRef:randomUUID()},{...grant,policyRegisterVersion:0},{...grant,expiresAt:new Date(NaN)},
      {...grant,expiresAt:now},{...grant,startsAt:new Date("2026-10-10T00:00:00Z")}
    ]) await expect(source(malformed).read(ownerRef,now)).rejects.toThrow();
  });
  // Side-by-side spec §9, C15: a grant stays valid under the version it was issued with, bound by that version's maxima.
  it("keeps a grant of another version valid under its own version's maxima, and refuses one above them", async () => {
    const earlier = { ...grant, policyRegisterVersion: 1, amountMicros: 1100000, weekMicros: 600000, dayMicros: 200000 };
    const versions = { 1: policyOf({ maximumGrantMicros: 1100000, maximumWeekMicros: 600000, maximumDayMicros: 200000 }), 2: policyOf() };
    expect((await source(earlier, null, grant, {}, { versions }).read(ownerRef, now)).map(w => [w.scope, w.limitMicros]))
      .toEqual([["PERSON_DAY", 200000], ["PERSON_WEEK", 600000], ["PERSON_GRANT", 1100000]]);
    expect((await source(grant, null, grant, {}).read(ownerRef, now)).map(w => w.scope)).toEqual(["PERSON_DAY", "PERSON_WEEK", "PERSON_GRANT"]);
    for (const malformed of [
      { ...earlier, dayMicros: 700000 }, { ...earlier, weekMicros: 1200000 },
      { ...earlier, startsAt: new Date("2026-09-08T10:00:00Z") } // a lifetime above 31 days
    ]) await expect(source(malformed, null, grant, {}, { versions }).read(ownerRef, now)).rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
    for (const aboveMaximum of [{ ...grant, amountMicros: 1100000 }, { ...grant, dayMicros: 200000, weekMicros: 600000, amountMicros: 1000000 }])
      await expect(source(aboveMaximum, null, grant, {}, { versions }).read(ownerRef, now)).rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
    // The v1 grant above v2's maxima is never judged by v2's (the pointer's) maxima, and v1's own bind it.
    await expect(source(earlier, null, grant, {}, { versions: { 1: policyOf(), 2: policyOf({ maximumGrantMicros: 2000000 }) } })
      .read(ownerRef, now)).rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
  });
  it("does not turn missing pinned funding into an unbounded allowance", async () => {
    await expect(source(null,null).read(ownerRef,now,{runId:randomUUID()})).rejects.toThrow();
  });
  it("refuses a malformed policy at the grant's version rather than letting NaN or missing maxima bypass bounds",async()=>{
    for(const p of [{maximumGrantMicros:undefined},{maximumDayMicros:NaN},{maximumWeekMicros:0},{maximumLifetimeMs:2678400001},{maximumDayMicros:600000},{sourceRef:""}])
      await expect(source(grant,null,grant,p).read(ownerRef,now)).rejects.toThrow();
  });
});

describe("side-by-side §9: a grant stays valid under the funding version it was issued with", () => {
  const runId = randomUUID();
  const pin = { kind: "INTERNAL", grantId, grantEventId } as const;
  const limits = (windows: readonly import("@debateai/budget").PersonWindow[]) => windows.map(w => [w.scope, w.limitMicros]);
  const granted = [["PERSON_DAY", 100000], ["PERSON_WEEK", 500000], ["PERSON_GRANT", 1000000]];

  it("checks a run's v2 grant against readPolicyAt(2), with no register version given to the source", async () => {
    const calls = { readPolicy: 0, readPolicyAt: [] as number[] };
    expect(limits(await source(grant, pin, grant, {}, { calls }).read(ownerRef, now, { runId }))).toEqual(granted);
    expect(calls.readPolicyAt).toEqual([2]);
  });

  it("refuses when the grant's own version is no funding publication (readPolicyAt → null)", async () => {
    await expect(source(grant, pin, grant, {}, { versions: { 2: null } }).read(ownerRef, now, { runId }))
      .rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
  });

  it("the pointer moved to v5: the v2 grant's windows are unchanged and the pointer is never read", async () => {
    const calls = { readPolicy: 0, readPolicyAt: [] as number[] };
    const selection = { registerVersion: 5, policy: policyOf({ maximumGrantMicros: 10, maximumWeekMicros: 10, maximumDayMicros: 10 }) };
    expect(limits(await source(grant, pin, grant, {}, { selection, calls }).read(ownerRef, now, { runId }))).toEqual(granted);
    expect(calls.readPolicy).toBe(0);
    expect(calls.readPolicyAt).toEqual([2]);
  });

  it("a grant above its own version's maximumDayMicros is refused (the policy check moved, not removed)", async () => {
    const above = { ...grant, dayMicros: 100001 };
    await expect(source(above, pin, above).read(ownerRef, now, { runId })).rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
  });

  // C17 billing-core part, folded into B14 by controller ruling.
  it("the selection names v18 and the run's grant is v17: the grant is returned, never INTERNAL_FUNDING_UNAVAILABLE", async () => {
    const v17 = { ...grant, policyRegisterVersion: 17 };
    const selection = { registerVersion: 18, policy: policyOf() };
    expect(limits(await source(v17, pin, v17, {}, { selection, versions: { 17: policyOf() } }).read(ownerRef, now, { runId })))
      .toEqual(granted);
  });

  it("funding switched off (selection null): the run's pinned grant still holds, a new ask takes the subscription path", async () => {
    const calls = { readPolicy: 0, readPolicyAt: [] as number[] };
    const off = source(grant, pin, grant, {}, { selection: null, calls });
    expect(limits(await off.read(ownerRef, now, { runId }))).toEqual(granted);
    expect(calls.readPolicy).toBe(0);
    expect((await off.read(ownerRef, now)).map(w => w.scope)).toEqual(["PERSON_MONTH"]);
    expect(await off.resolveAskFunding(ownerRef, now)).toEqual({ kind: "SUBSCRIPTION", planId: "FREE", entitlementEventId: eventId });
    // A new ask never reads a grant's version policy once funding is off.
    expect(calls.readPolicyAt).toEqual([2]);
  });

  it("a grant longer than its own version's maximumLifetimeMs (1 day; the grant runs ~8 days) is refused, run-pinned or new", async () => {
    const oneDay = { maximumLifetimeMs: 86_400_000 };
    await expect(source(grant, pin, grant, oneDay).read(ownerRef, now, { runId }))
      .rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
    await expect(source(grant, null, grant, oneDay).read(ownerRef, now))
      .rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
  });

  // Exact parity with the plain BillingPersonAllowanceSource: no windows row means no personal limit ([]) on the read
  // path, while a NEW ask with neither a grant nor a windows row is still refused at resolveAskFunding.
  it("a SUBSCRIPTION-pinned run whose owner has no windows row reads [] (no personal limit), never a refusal", async () => {
    const subscription = { kind: "SUBSCRIPTION", planId: "FREE", entitlementEventId: eventId } as const;
    expect(await source(grant, subscription, grant, {}, { entitlement: null }).read(ownerRef, now, { runId })).toEqual([]);
    // Funding switched off: a new ask takes the subscription path, also [] with no row.
    expect(await source(null, null, grant, {}, { entitlement: null, selection: null }).read(ownerRef, now)).toEqual([]);
  });

  it("a new ask with no grant and no windows row is still refused at resolveAskFunding", async () => {
    await expect(source(null, null, grant, {}, { entitlement: null }).resolveAskFunding(ownerRef, now))
      .rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
    await expect(source(null, null, grant, {}, { entitlement: null, selection: null }).resolveAskFunding(ownerRef, now))
      .rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
  });

  it("a grant whose day exceeds its week is refused, run-pinned or new", async () => {
    const lopsided = { ...grant, dayMicros: 600000, weekMicros: 500000 };
    const versions = { 2: policyOf({ maximumDayMicros: 600000, maximumWeekMicros: 600000 }) };
    await expect(source(lopsided, pin, lopsided, {}, { versions }).read(ownerRef, now, { runId }))
      .rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
    await expect(source(lopsided, null, lopsided, {}, { versions }).read(ownerRef, now))
      .rejects.toMatchObject({ code: "INTERNAL_FUNDING_UNAVAILABLE" });
  });
});
