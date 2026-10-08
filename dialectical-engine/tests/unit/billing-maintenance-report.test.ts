import { describe, expect, it, vi } from "vitest";
import type { SubscriptionEvent } from "@debateai/billing-core";
import type { BillingRepository } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { BillingMaintenance, type MaintenanceDeps } from "../../apps/api/src/billing/maintenance.js";
import { testBillingPolicy } from "../support/billingFixtures.js";

const NOW = new Date("2026-11-02T10:00:00.000Z");

/** A checkout started an hour ago: the visit folds it and has nothing to do (not yet abandoned). */
const fresh = (subscriptionId: string): SubscriptionEvent[] => [{
  eventId: `${subscriptionId}-created`, subscriptionId, ownerRef: "o", kind: "CREATED", at: new Date(NOW.getTime() - 3_600_000),
  planId: "PLUS", periodAnchorAt: null, cardTokenId: null,
  data: { payment_provider: "netopia", payment_environment: "sandbox" }
} as SubscriptionEvent];

function pass(ids: string[], subscriptionEvents: (subscriptionId: string) => Promise<SubscriptionEvent[]>) {
  const audit = vi.fn();
  const liveSubscriptionIds = vi.fn(async () => ids);
  const maintenance = new BillingMaintenance({
    repository: { subscriptionEvents } as unknown as BillingRepository,
    jobs: { liveSubscriptionIds, lockOwner: vi.fn(), withSubscriptionLease: vi.fn(), outboxJobExists: vi.fn() } as unknown as MaintenanceDeps["jobs"],
    entitlements: { append: vi.fn() },
    renewal: {} as MaintenanceDeps["renewal"],
    policy: testBillingPolicy, publicAppUrl: "https://dezbatere.test", paymentEnvironment: "sandbox", audit, clock: () => NOW
  });
  return { maintenance, audit };
}

describe("P11b the maintenance pass's report line", () => {
  it("writes one line per pass whose visits failed, with the count and the distinct codes only", async () => {
    const { maintenance, audit } = pass(["s-typed-1", "s-fine", "s-plain", "s-typed-2"], async (subscriptionId) => {
      if (subscriptionId.startsWith("s-typed")) throw new TypedDomainError("BILLING_TEST_VISIT_FAILED", "test");
      if (subscriptionId === "s-plain") throw new Error("free text about s-plain");
      return fresh(subscriptionId);
    });
    const report = await maintenance.runOnce();
    expect(report).toMatchObject({ visited: 4, failed: 3 });
    expect(audit).toHaveBeenCalledTimes(1);
    // A plain Error carries no code: the line names UNKNOWN, never its text.
    expect(audit).toHaveBeenCalledWith("billing.maintenance.report", { failed: 3, codes: "BILLING_TEST_VISIT_FAILED,UNKNOWN" });
    const written = JSON.stringify(audit.mock.calls);
    expect(written).not.toMatch(/s-(typed|fine|plain)/);
    expect(written).not.toContain("free text");
  });

  it("writes no line for a pass with no failure", async () => {
    const { maintenance, audit } = pass(["s-fine-1", "s-fine-2"], async (subscriptionId) => fresh(subscriptionId));
    expect(await maintenance.runOnce()).toMatchObject({ visited: 2, failed: 0 });
    expect(audit).not.toHaveBeenCalled();
  });
});
