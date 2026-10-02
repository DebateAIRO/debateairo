import { describe, expect, it, vi } from "vitest";
import type { ChargeEventKind } from "@debateai/db";
import type { XMoneyStatus } from "@debateai/payments-xmoney";
import { BillingReconciler, expectedChargeEventKinds, transactionSettled } from "../../apps/api/src/billing/reconcile.js";

describe("P14a what a listed transaction should already have left in our rows", () => {
  it("names the final kinds per status, and nothing for a payment still in flight", () => {
    const cases: Array<[XMoneyStatus, readonly string[] | null]> = [
      ["start", null], ["in-progress", null], ["3d-pending", null],
      // D5 5f: a second payment of an order already paid is recorded as DUPLICATE_PAYMENT (and refunded).
      ["complete-ok", ["SUCCEEDED", "DUPLICATE_PAYMENT"]], ["complete-failed", ["FAILED"]], ["refund-ok", ["REFUNDED"]],
      ["void-ok", ["FAILED", "REFUNDED"]], ["cancel-ok", ["FAILED", "REFUNDED"]], ["charge-back", ["CHARGEBACK"]]
    ];
    for (const [status, kinds] of cases) {
      expect(expectedChargeEventKinds({ status, transactionType: "deposit" }), status).toEqual(kinds);
    }
    expect(expectedChargeEventKinds({ status: "complete-ok", transactionType: "chargeback" })).toEqual(["CHARGEBACK"]);
    expect(expectedChargeEventKinds({ status: "complete-ok", transactionType: "representment" }))
      .toEqual(["CHARGEBACK_REPRESENTED"]);
  });

  it("never reads a refund transaction as a payment, whatever status xMoney reports (D5 5g)", () => {
    const refund = (status: XMoneyStatus) => expectedChargeEventKinds({ status, transactionType: "refund" });
    expect(refund("complete-ok")).toEqual(["REFUNDED"]);
    expect(refund("refund-ok")).toEqual(["REFUNDED"]);
    for (const status of ["start", "in-progress", "3d-pending", "complete-failed", "void-ok", "cancel-ok", "charge-back"] as const) {
      expect(refund(status), status).toBeNull();
    }
  });

  it("counts a second payment recorded as DUPLICATE_PAYMENT, and a refund by its own REFUNDED or its payment's", () => {
    const recorded = new Map<string, ReadonlySet<ChargeEventKind>>([
      ["71", new Set<ChargeEventKind>(["DUPLICATE_PAYMENT"])],
      ["72", new Set<ChargeEventKind>(["SUCCEEDED", "REFUNDED"])],
      ["73", new Set<ChargeEventKind>(["SUCCEEDED"])]
    ]);
    const payment = { transactionId: "71", status: "complete-ok" as const, transactionType: "deposit", relatedTransactionIds: [] };
    expect(transactionSettled(payment, recorded)).toBe(true);
    expect(transactionSettled({ ...payment, transactionId: "79" }, recorded)).toBe(false);
    const refund = { transactionId: "80", status: "complete-ok" as const, transactionType: "refund", relatedTransactionIds: ["72"] };
    expect(transactionSettled(refund, recorded)).toBe(true);
    // Its payment was never refunded on our side: VERIFY_PAYMENT has to look at it.
    expect(transactionSettled({ ...refund, relatedTransactionIds: ["73"] }, recorded)).toBe(false);
    // A payment is never settled by what its "related" transactions hold.
    expect(transactionSettled({ ...payment, transactionId: "79", relatedTransactionIds: ["72"] }, recorded)).toBe(false);
  });

  it("runs the full pass once a day and the frequent adoption pass on the ticks between", async () => {
    let now = new Date("2026-10-10T00:00:00.000Z");
    const reconciler = new BillingReconciler({
      billing: {} as never, jobs: {} as never, xmoney: {} as never, environment: "stage", audit: () => undefined,
      clock: () => now, kick: () => undefined
    });
    const daily = vi.spyOn(reconciler, "runDaily").mockResolvedValue({
      listed: 0, enqueued: 0, adopted: 0, failed: 0, uncertain: false, deadRefunds: 0, expired: 0, rejected: 0
    });
    const adoption = vi.spyOn(reconciler, "runAdoption").mockResolvedValue({ adopted: 0, failed: 0, rejected: 0 });
    await reconciler.tick();
    now = new Date(now.getTime() + 10 * 60_000);
    await reconciler.tick();
    now = new Date(now.getTime() + 24 * 3_600_000);
    await reconciler.tick();
    expect(daily).toHaveBeenCalledTimes(2);
    expect(adoption).toHaveBeenCalledTimes(1);
    expect(adoption).toHaveBeenCalledWith(expect.any(Date), "FREQUENT");
  });

  it("keeps the frequent adoption pass running while the daily pass keeps failing, and retries the daily one hourly", async () => {
    let now = new Date("2026-10-10T00:00:00.000Z");
    const reconciler = new BillingReconciler({
      billing: {} as never, jobs: {} as never, xmoney: {} as never, environment: "stage", audit: () => undefined,
      clock: () => now, kick: () => undefined
    });
    const daily = vi.spyOn(reconciler, "runDaily").mockRejectedValue(new Error("XMONEY_REFUSED"));
    const adoption = vi.spyOn(reconciler, "runAdoption").mockResolvedValue({ adopted: 0, failed: 0, rejected: 0 });
    // The daily error still reaches the single-flight (BILLING_RECONCILIATION_PENDING), after the frequent pass ran.
    await expect(reconciler.tick()).rejects.toThrow("XMONEY_REFUSED");
    expect(daily).toHaveBeenCalledTimes(1);
    expect(adoption).toHaveBeenCalledTimes(1);
    expect(adoption).toHaveBeenLastCalledWith(expect.any(Date), "FREQUENT");
    // Ten minutes on: inside the retry backoff, only the frequent pass.
    now = new Date(now.getTime() + 10 * 60_000);
    await reconciler.tick();
    expect(daily).toHaveBeenCalledTimes(1);
    expect(adoption).toHaveBeenCalledTimes(2);
    // More than an hour after the failed attempt: the daily pass is tried again (and adoption runs once more).
    now = new Date(now.getTime() + 55 * 60_000);
    await expect(reconciler.tick()).rejects.toThrow("XMONEY_REFUSED");
    expect(daily).toHaveBeenCalledTimes(2);
    expect(adoption).toHaveBeenCalledTimes(3);
    // Once it completes, the next daily pass is a day later.
    daily.mockResolvedValue({
      listed: 0, enqueued: 0, adopted: 0, failed: 0, uncertain: false, deadRefunds: 0, expired: 0, rejected: 0
    });
    now = new Date(now.getTime() + 61 * 60_000);
    await reconciler.tick();
    expect(daily).toHaveBeenCalledTimes(3);
    now = new Date(now.getTime() + 2 * 3_600_000);
    await reconciler.tick();
    expect(daily).toHaveBeenCalledTimes(3);
    expect(adoption).toHaveBeenCalledTimes(4);
  });
});
