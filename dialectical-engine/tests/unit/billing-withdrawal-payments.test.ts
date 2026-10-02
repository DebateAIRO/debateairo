import { describe, expect, it } from "vitest";
import type { ChargeRow } from "@debateai/db";
import type { PaidTransaction } from "../../apps/api/src/billing/refunds.js";
import { withdrawalPayments } from "../../apps/api/src/billing/withdrawal.js";

// W6 (P2-I8): the stretch of the period each paid transaction covered, for the per-payment withdrawal share.
const ACTIVATED = new Date("2026-10-01T09:00:00.000Z");
const PERIOD = { start: ACTIVATED, end: new Date("2026-11-01T09:00:00.000Z") };
const QUOTED = new Date("2026-10-14T09:00:00.000Z");

const charge = (chargeId: string, kind: ChargeRow["kind"], periodStart: Date, periodEnd: Date) =>
  ({ chargeId, kind, periodStart, periodEnd }) as const;
const payment = (chargeId: string, transactionId: string, paidMicros: number, refundedMicros = 0): PaidTransaction =>
  ({ chargeId, transactionId, paidMicros, refundedMicros, succeededAt: ACTIVATED, providerRefunded: false });

describe("W6 each paid transaction's own coverage (P2-I8)", () => {
  it("measures the first payment over the subscription's period, and an upgrade from its quote to the period end", () => {
    // The INITIAL charge's stored period is the checkout's provisional one (checkout.ts: from the checkout, two hours
    // before the payment here); the paid period starts at activation (P9b), as the withdrawal always measured it.
    const checkoutAt = new Date(ACTIVATED.getTime() - 2 * 3_600_000);
    const charges = [
      charge("initial", "INITIAL", checkoutAt, new Date("2026-11-01T07:00:00.000Z")),
      charge("upgrade", "UPGRADE", QUOTED, PERIOD.end)
    ];
    expect(withdrawalPayments([payment("initial", "1", 24_200_000), payment("upgrade", "2", 123_420_000)], charges, PERIOD))
      .toEqual([
        { paidMicros: 24_200_000, coverageStart: PERIOD.start, coverageEnd: PERIOD.end },
        { paidMicros: 123_420_000, coverageStart: QUOTED, coverageEnd: PERIOD.end }
      ]);
  });

  it("counts what each payment still holds, never below zero, and every transaction of a charge", () => {
    const charges = [charge("initial", "INITIAL", ACTIVATED, PERIOD.end), charge("upgrade", "UPGRADE", QUOTED, PERIOD.end)];
    expect(withdrawalPayments([
      payment("initial", "1", 24_200_000, 1_000_000),
      // A provider refund's figure is only an upper bound (P9c); such a withdrawal goes to the owner anyway.
      payment("upgrade", "2", 18_150_000, 20_000_000),
      payment("upgrade", "3", 18_150_000)
    ], charges, PERIOD)).toEqual([
      { paidMicros: 23_200_000, coverageStart: PERIOD.start, coverageEnd: PERIOD.end },
      { paidMicros: 0, coverageStart: QUOTED, coverageEnd: PERIOD.end },
      { paidMicros: 18_150_000, coverageStart: QUOTED, coverageEnd: PERIOD.end }
    ]);
  });

  it("refuses a paid transaction whose charge is not among the subscription's charges", () => {
    expect(() => withdrawalPayments([payment("elsewhere", "9", 1_000_000)], [], PERIOD))
      .toThrow(expect.objectContaining({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" }));
  });
});
