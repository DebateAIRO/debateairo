import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { foldSubscription } from "@debateai/billing-core";
import { erasurePendingOf } from "../../apps/api/src/billing/erasure-hook.js";
import { RenewalService, type RenewalDeps } from "../../apps/api/src/billing/renewal.js";
import { activeSubscriptionEvents } from "../support/billingFixtures.js";

const ACTIVATED = new Date("2026-10-01T10:00:00.000Z");
const NOW = new Date("2026-11-01T10:00:00.000Z");

/**
 * P11a's RenewalService with only what `renew` reads before it prices anything; the erasure port is the one P15
 * composes in the runtime (`erasurePendingOf(repository)`), over a fake repository.
 */
function renewalWith(events: ReturnType<typeof activeSubscriptionEvents>, pending: boolean, charges: unknown[] = []) {
  const ownerErasurePending = vi.fn(async (_ownerRef: string) => pending);
  const chargesForSubscription = vi.fn(async () => charges);
  const audit = vi.fn();
  const renewal = new RenewalService({
    repository: { subscriptionEvents: async () => events, chargesForSubscription },
    erasurePending: erasurePendingOf({ ownerErasurePending }),
    audit,
    clock: () => NOW
  } as unknown as RenewalDeps);
  return { renewal, ownerErasurePending, chargesForSubscription, audit };
}

describe("P15 no rebill for an owner whose account is being erased or frozen by the age gate (R-34, R3-2)", () => {
  it("skips a due renewal before any charge is read, and blocks the dunning retry through the same service", async () => {
    const events = activeSubscriptionEvents(randomUUID(), ACTIVATED);
    const run = renewalWith(events, true);
    expect(await run.renewal.renew(events[0]!.subscriptionId)).toBe("skipped");
    expect(run.ownerErasurePending).toHaveBeenCalledWith(events[0]!.ownerRef);
    expect(run.chargesForSubscription).not.toHaveBeenCalled();
    // P11a's line (D6a renamed `billing.renewal.erasure_pending`): the port answers only yes or no, so it says
    // "stopped", never "erasure", and a frozen account is never read as one.
    expect(run.audit).toHaveBeenCalledWith("billing.renewal.owner_stopped", {});
    // P11b's PAST_DUE retry asks `renewal.erasureBlocks` before it creates the next charge.
    expect(await run.renewal.erasureBlocks(events[0]!.ownerRef)).toBe(true);
  });

  it("lets the renewal go on to its own checks when no erasure is pending", async () => {
    const events = activeSubscriptionEvents(randomUUID(), ACTIVATED);
    const periodEnd = foldSubscription(events).currentPeriodEnd!;
    // A RENEWAL charge for this period already exists, so `renew` stops right after reading the charges.
    const run = renewalWith(events, false, [{ kind: "RENEWAL", periodStart: periodEnd }]);
    expect(await run.renewal.renew(events[0]!.subscriptionId)).toBe("skipped");
    expect(run.chargesForSubscription).toHaveBeenCalledOnce();
    expect(run.audit).not.toHaveBeenCalled();
    expect(await run.renewal.erasureBlocks(events[0]!.ownerRef)).toBe(false);
  });
});
