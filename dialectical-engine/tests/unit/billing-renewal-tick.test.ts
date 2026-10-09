import { describe, expect, it, vi } from "vitest";
import type { SubscriptionState } from "@debateai/billing-core";
import type { BillingRepository, DueRenewalCursor } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { englishOrderText } from "../../apps/api/src/billing/order-text.js";
import { RenewalService, type RenewalDeps } from "../../apps/api/src/billing/renewal.js";
import type { ChargeSettlement } from "../../apps/api/src/billing/settlement.js";
import { testBillingPlans, testBillingPolicy } from "../support/billingFixtures.js";

const NOW = new Date("2026-11-02T10:00:00.000Z");

/** A due-list row the tick skips at once (not ACTIVE), so only the paging is exercised. */
const created = (subscriptionId: string): SubscriptionState => ({
  subscriptionId, ownerRef: "o", planId: "PLUS", status: "CREATED", periodAnchorAt: null, currentPeriodStart: null,
  currentPeriodEnd: new Date(NOW.getTime() - 1_000), cancelRequested: false, scheduledDowngradePlanId: null,
  activatedAt: null, endedCause: null, pastDueSince: null,
  retryIndex: 0, renewalPostponedUntil: null, announcedTotalMicros: null, lastNoticeAt: null, paymentProvider: "netopia",
  paymentEnvironment: "sandbox", cardTokenId: null
} as SubscriptionState);

function tick(dueRenewals: BillingRepository["dueRenewals"]) {
  const audit = vi.fn();
  const openPaymentCharges = vi.fn(async () => []);
  const submittedPaymentRenewals = vi.fn(async () => []);
  // The lease runs its work, as a free lease does.
  const withSubscriptionLease = vi.fn(async (_subscriptionId: string, use: () => Promise<unknown>) => ({ kind: "RAN" as const, value: await use() }));
  const service = new RenewalService({
    repository: { dueRenewals } as unknown as BillingRepository,
    jobs: {
      openPaymentCharges, submittedPaymentRenewals, lockOwner: vi.fn(), withSubscriptionLease
    } as unknown as RenewalDeps["jobs"],
    entitlements: { append: vi.fn(), current: vi.fn() } as unknown as RenewalDeps["entitlements"],
    tax: { quote: vi.fn() } as unknown as RenewalDeps["tax"], settlement: {} as ChargeSettlement, policy: testBillingPolicy,
    plans: testBillingPlans, recordsKey: Buffer.alloc(32), publicAppUrl: "https://dezbatere.test", audit, clock: () => NOW,
    kick: () => undefined,
    netopia: {
      payments: { chargeSavedCard: vi.fn(), status: vi.fn() } as unknown as RenewalDeps["netopia"]["payments"],
      paymentEnvironment: "sandbox", recipients: { currentAddress: async () => null }, orderText: englishOrderText
    }
  });
  return { service, audit, openPaymentCharges, submittedPaymentRenewals };
}

describe("P11a the renewal tick (D5 5d)", () => {
  it("asks for this NETOPIA environment only and pages until a page is short", async () => {
    const pages = [Array.from({ length: 50 }, (_, index) => created(`s-${String(index).padStart(2, "0")}`)), [created("s-50")]];
    const dueRenewals = vi.fn(async () => pages.shift() ?? []);
    const { service } = tick(dueRenewals as unknown as BillingRepository["dueRenewals"]);
    const report = await service.runOnce();
    expect(report.skipped).toBe(51);
    expect(dueRenewals).toHaveBeenCalledTimes(2);
    const options = (dueRenewals.mock.calls as unknown as Array<[Date, number, number, { provider: string; environment: string; after: DueRenewalCursor | null }]>);
    expect(options[0]![3]).toMatchObject({ provider: "netopia", environment: "sandbox", after: null });
    expect(options[1]![3]).toMatchObject({
      provider: "netopia", environment: "sandbox", after: { periodEnd: new Date(NOW.getTime() - 1_000), subscriptionId: "s-49" }
    });
  });

  it("counts histories that do not fold and writes one content-free line per tick", async () => {
    const dueRenewals = vi.fn(async (_now: Date, _horizon: number, _limit: number, options: { onInvalid?: (id: string) => void }) => {
      options.onInvalid?.("broken-1");
      options.onInvalid?.("broken-2");
      return [];
    });
    const { service, audit } = tick(dueRenewals as unknown as BillingRepository["dueRenewals"]);
    expect((await service.runOnce()).invalid).toBe(2);
    expect(audit).toHaveBeenCalledWith("billing.renewal.history_invalid", { count: 2, code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" });
    expect(JSON.stringify(audit.mock.calls)).not.toContain("broken-");
  });

  it("still recovers open charges and decides pending renewals when the due list fails, and reports it once", async () => {
    const { service, openPaymentCharges, submittedPaymentRenewals, audit } = tick((async () => { throw new Error("database away"); }) as unknown as BillingRepository["dueRenewals"]);
    const report = await service.runOnce();
    expect(report.failed).toBe(1);
    // Spec §2.9.3: the open renewals of the last 30 days, probed on their own orderID.
    expect(openPaymentCharges).toHaveBeenCalledWith(expect.objectContaining({
      provider: "netopia", environment: "sandbox", kinds: ["RENEWAL"], after: null,
      createdFrom: new Date(NOW.getTime() - 30 * 86_400_000)
    }));
    // Spec §2.9.4: renewals NETOPIA answered and still holds pending, sent a minute ago or more.
    expect(submittedPaymentRenewals).toHaveBeenCalledWith(expect.objectContaining({
      provider: "netopia", environment: "sandbox", submittedBefore: new Date(NOW.getTime() - 60_000), after: null
    }));
    // The plain Error carries no code: the line names UNKNOWN, never its text.
    expect(audit).toHaveBeenCalledWith("billing.renewal.report", { failed: 1, taxRefused: 0, codes: "UNKNOWN" });
    expect(JSON.stringify(audit.mock.calls)).not.toContain("database away");
  });

  it("counts a tax refusal apart from failures, in the same one line per tick", async () => {
    const due = {
      ...created("s-refused"), status: "ACTIVE", periodAnchorAt: new Date(NOW.getTime() - 31 * 86_400_000)
    } as SubscriptionState;
    const { service, audit } = tick((async () => [due]) as unknown as BillingRepository["dueRenewals"]);
    vi.spyOn(service, "renew").mockRejectedValueOnce(new TypedDomainError("TAX_SERVICE_REFUSED", "QUADERNO_HTTP_401"));
    const report = await service.runOnce();
    expect([report.taxRefused, report.failed]).toEqual([1, 0]);
    expect(audit).toHaveBeenCalledWith("billing.renewal.report", { failed: 0, taxRefused: 1, codes: "" });
  });

  it("names a failed renewal's declared code on the tick's line", async () => {
    const due = {
      ...created("s-missing"), status: "ACTIVE", periodAnchorAt: new Date(NOW.getTime() - 31 * 86_400_000)
    } as SubscriptionState;
    const { service, audit } = tick((async () => [due]) as unknown as BillingRepository["dueRenewals"]);
    vi.spyOn(service, "renew").mockRejectedValueOnce(new TypedDomainError("BILLING_STORED_CONTEXT_MISSING", "x"));
    const report = await service.runOnce();
    expect([report.taxRefused, report.failed]).toEqual([0, 1]);
    expect(audit).toHaveBeenCalledWith("billing.renewal.report", { failed: 1, taxRefused: 0, codes: "BILLING_STORED_CONTEXT_MISSING" });
  });

  it("writes UNKNOWN, never the text, for a failure whose code is not a code", async () => {
    const due = {
      ...created("s-text"), status: "ACTIVE", periodAnchorAt: new Date(NOW.getTime() - 31 * 86_400_000)
    } as SubscriptionState;
    const { service, audit } = tick((async () => [due]) as unknown as BillingRepository["dueRenewals"]);
    vi.spyOn(service, "renew").mockRejectedValueOnce(Object.assign(new Error("x"), { code: "not a code" }));
    const report = await service.runOnce();
    expect(report.failed).toBe(1);
    expect(audit).toHaveBeenCalledWith("billing.renewal.report", { failed: 1, taxRefused: 0, codes: "UNKNOWN" });
    expect(JSON.stringify(audit.mock.calls)).not.toContain("not a code");
  });

  it("writes no report line for a quiet tick", async () => {
    const { service, audit } = tick((async () => []) as unknown as BillingRepository["dueRenewals"]);
    await service.runOnce();
    expect(audit.mock.calls.map(([event]) => event)).not.toContain("billing.renewal.report");
  });

  it("renews a NETOPIA plan that holds no payment handle, and skips one that is not renewable (spec §2.5.5)", async () => {
    const lapsedAnchor = new Date(NOW.getTime() - 31 * 86_400_000);
    const netopia = { ...created("s-netopia"), status: "ACTIVE", periodAnchorAt: lapsedAnchor } as SubscriptionState;
    const cancelled = {
      ...created("s-cancelled"), status: "ACTIVE", periodAnchorAt: lapsedAnchor, cancelRequested: true
    } as SubscriptionState;
    const { service } = tick((async () => [netopia, cancelled]) as unknown as BillingRepository["dueRenewals"]);
    const renew = vi.spyOn(service, "renew").mockResolvedValue("charged");
    const report = await service.runOnce();
    expect(renew.mock.calls).toEqual([["s-netopia"]]);
    expect([report.charged, report.skipped]).toEqual([1, 1]);
  });
});
