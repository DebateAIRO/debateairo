import { describe, expect, it } from "vitest";
import type { ChargeEventRow, ChargeRow } from "@debateai/db";
import { allocateRefund, paidTransactions, type PaidTransaction } from "../../apps/api/src/billing/refunds.js";

const T0 = new Date("2026-10-01T09:00:00.000Z");
const T1 = new Date("2026-10-03T09:00:00.000Z");
const paid: PaidTransaction[] = [
  { chargeId: "initial", transactionId: "1", paidMicros: 24_200_000, refundedMicros: 0, succeededAt: T0, providerRefunded: false },
  { chargeId: "upgrade", transactionId: "2", paidMicros: 18_150_000, refundedMicros: 0, succeededAt: T1, providerRefunded: false }
];

function charge(kind: ChargeRow["kind"], chargeId: string, events: Array<Partial<ChargeEventRow> & Pick<ChargeEventRow, "kind">>) {
  return Object.assign({
    chargeId, ownerRef: "owner", subscriptionId: "sub", kind, periodStart: T0, periodEnd: T1, attempt: 1, quoteId: null,
    netMicros: 0, taxMicros: 0, totalMicros: 10_000_000, currency: "USD" as const, createdAt: T0, paymentProvider: "netopia" as const, paymentEnvironment: "sandbox" as const
  }, {
    events: events.map((event) => ({
      eventId: "e", chargeId, at: T0, providerPaymentId: null, amountMicros: null, errorCode: null,
      paymentProvider: "netopia", paymentEnvironment: "sandbox", refundsTransactionId: null, ...event
    }) as ChargeEventRow)
  }) as ChargeRow & { events: ChargeEventRow[] };
}

describe("P9b the refund split, newest transaction first (A4b)", () => {
  it("takes the newest transaction first and never more than it holds", () => {
    expect(allocateRefund(30_000_000, paid)).toEqual([
      { chargeId: "upgrade", transactionId: "2", amountMicros: 18_150_000 },
      { chargeId: "initial", transactionId: "1", amountMicros: 11_850_000 }
    ]);
    expect(allocateRefund(10_000_000, paid)).toEqual([{ chargeId: "upgrade", transactionId: "2", amountMicros: 10_000_000 }]);
    expect(allocateRefund(0, paid)).toEqual([]);
  });

  it("skips what is already refunded and refuses a refund larger than what is left", () => {
    const partly = [paid[0]!, { ...paid[1]!, refundedMicros: 18_150_000 }];
    expect(allocateRefund(5_000_000, partly)).toEqual([{ chargeId: "initial", transactionId: "1", amountMicros: 5_000_000 }]);
    expect(() => allocateRefund(42_350_001, paid)).toThrow(expect.objectContaining({ code: "REFUND_EXCEEDS_CHARGE" }));
  });

  it("counts only successful paid charges since a moment, net of any refund requested or recorded", () => {
    const rows = [
      charge("INITIAL", "initial", [
        { kind: "REQUESTED" },
        { kind: "SUCCEEDED", providerPaymentId: "1", amountMicros: 24_200_000, at: T0 },
        { kind: "REFUND_REQUESTED", providerPaymentId: "1", amountMicros: 1_000_000 }
      ]),
      charge("UPGRADE", "declined", [{ kind: "REQUESTED" }, { kind: "FAILED", errorCode: "PAYMENT_DECLINED" }]),
      charge("CARD_CHECK", "hold", [{ kind: "SUCCEEDED", providerPaymentId: "9", amountMicros: 1_000_000, at: T1 }]),
      charge("UPGRADE", "upgrade", [
        { kind: "SUCCEEDED", providerPaymentId: "2", amountMicros: 18_150_000, at: T1 },
        { kind: "REFUNDED", providerPaymentId: "2", amountMicros: 2_000_000 }
      ])
    ];
    expect(paidTransactions(rows, T0)).toEqual([
      { chargeId: "initial", transactionId: "1", paidMicros: 24_200_000, refundedMicros: 1_000_000, succeededAt: T0, providerRefunded: false },
      { chargeId: "upgrade", transactionId: "2", paidMicros: 18_150_000, refundedMicros: 2_000_000, succeededAt: T1, providerRefunded: false }
    ]);
    expect(paidTransactions(rows, T1).map((row) => row.chargeId)).toEqual(["upgrade"]);
  });

  it("never counts a second payment, and counts a refund that is its own transaction against the payment it names", () => {
    const rows = [charge("INITIAL", "twice", [
      { kind: "SUCCEEDED", providerPaymentId: "5", amountMicros: 24_200_000, at: T0 },
      // D5 5f: the second payment of the same order, refunded in full; it bought nothing.
      { kind: "DUPLICATE_PAYMENT", providerPaymentId: "6", amountMicros: 24_200_000, at: T0 },
      { kind: "REFUND_REQUESTED", providerPaymentId: "6", amountMicros: 24_200_000, errorCode: "DUPLICATE_PAYMENT" },
      { kind: "REFUNDED", providerPaymentId: "6", amountMicros: 24_200_000, errorCode: "DUPLICATE_PAYMENT" },
      // D5 5g: a withdrawal refund recorded as its own transaction "7", refunding payment "5" (the previous card
      // processor's shape; 0109 keeps refunds_transaction_id NULL on NETOPIA rows, and old rows still read this way).
      { kind: "REFUND_REQUESTED", providerPaymentId: "5", amountMicros: 3_000_000, errorCode: "WITHDRAWAL" },
      { kind: "REFUNDED", providerPaymentId: "7", refundsTransactionId: "5", amountMicros: 3_000_000, errorCode: "WITHDRAWAL" }
    ])];
    expect(paidTransactions(rows, T0)).toEqual([
      { chargeId: "twice", transactionId: "5", paidMicros: 24_200_000, refundedMicros: 3_000_000, succeededAt: T0, providerRefunded: false }
    ]);
  });

  it("marks a transaction a refund made in NETOPIA's admin touched, whose true refunded amount is unknown (P9c)", () => {
    const dashboard = charge("INITIAL", "dashboard", [
      { kind: "SUCCEEDED", providerPaymentId: "3", amountMicros: 24_200_000, at: T0 },
      { kind: "REFUND_REQUESTED", providerPaymentId: "3", amountMicros: 24_200_000, errorCode: "PROVIDER_REFUND" },
      { kind: "REFUNDED", providerPaymentId: "3", amountMicros: 24_200_000, errorCode: "PROVIDER_REFUND" }
    ]);
    expect(paidTransactions([dashboard], T0)).toEqual([
      { chargeId: "dashboard", transactionId: "3", paidMicros: 24_200_000, refundedMicros: 24_200_000, succeededAt: T0, providerRefunded: true }
    ]);
  });
});
