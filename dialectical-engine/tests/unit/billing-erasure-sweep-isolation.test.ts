import { describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { reconcileWork } from "../../apps/api/src/billing/erasure-hook.js";
import type { ReconcileReport } from "../../apps/api/src/billing/reconcile.js";
import { createCoalescingSingleFlight } from "../../apps/api/src/billing/single-flight.js";

const REPORT: ReconcileReport = Object.freeze({
  deadRefunds: 0, expired: 0, statusChecks: Object.freeze({ read: 0, queued: 0, closed: 0, failed: 0 })
});

/** The runtime's composition (P15's `runtime.ts`), with fakes, run once through the real single-flight. */
async function runOnce(sweep: () => Promise<number>, tick: () => Promise<ReconcileReport>) {
  const reportPending = vi.fn((_code: string) => undefined);
  const ticks = vi.fn(tick);
  const run = createCoalescingSingleFlight(
    reconcileWork({ erasure: { sweep }, reconciler: { tick: ticks }, reportPending }),
    () => reportPending("BILLING_RECONCILIATION_PENDING")
  );
  run();
  await vi.waitFor(() => expect(ticks).toHaveBeenCalledOnce());
  // Let the single-flight's catch/finally settle.
  await new Promise((resolve) => setImmediate(resolve));
  return { reportPending, ticks };
}

describe("P15 a failing erasure sweep never stops the money check", () => {
  it("runs the reconciler when the sweep fails, and reports only the sweep", async () => {
    const { reportPending, ticks } = await runOnce(
      async () => { throw new TypedDomainError("BILLING_SUBSCRIPTION_EVENTS_INVALID", "a history that does not fold"); },
      async () => REPORT
    );
    expect(ticks).toHaveBeenCalledOnce();
    expect(reportPending.mock.calls).toEqual([["BILLING_ERASURE_SWEEP_PENDING"]]);
  });

  it("reports the reconciler alone when it is the one that fails", async () => {
    const { reportPending } = await runOnce(async () => 0, async () => { throw new Error("listing refused"); });
    expect(reportPending.mock.calls).toEqual([["BILLING_RECONCILIATION_PENDING"]]);
  });

  it("reports nothing when both passes complete", async () => {
    const { reportPending } = await runOnce(async () => 2, async () => REPORT);
    expect(reportPending).not.toHaveBeenCalled();
  });
});
