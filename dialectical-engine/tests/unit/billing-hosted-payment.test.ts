import { describe, expect, it } from "vitest";
import type { PaymentReport, PaymentState } from "@debateai/billing-core";
import type { ChargeEventRow } from "@debateai/db";
import { chargeStatusOf } from "../../apps/api/src/billing/charge-status.js";
import { REFUND_REASONS_REFUSING_THE_PAYMENT } from "../../apps/api/src/billing/codes.js";
import { paidOrAlmost, stillPayable } from "../../apps/api/src/billing/hosted-payment.js";

const ORDER = "0123456789abcdef0123456789abcdef";

function report(state: PaymentState, providerStatus: string): PaymentReport {
  return Object.freeze({
    orderId: ORDER, providerPaymentId: "ntp-1", state, providerStatus, amountMicros: 6_050_000, currency: "USD",
    cardCountry: "RO", savedCard: null, declineCode: null, declineSide: null, bankDeclined: false, occurredAt: null,
    clientId: null
  });
}

const event = (kind: ChargeEventRow["kind"], errorCode: string | null = null, providerPaymentId: string | null = null) =>
  ({ kind, errorCode, providerPaymentId }) as unknown as ChargeEventRow;
/** A row that names a payment and an amount (P1a's refund target: its own payment, as on every NETOPIA row). */
const money = (kind: ChargeEventRow["kind"], errorCode: string | null, providerPaymentId: string, amountMicros: number) =>
  ({ kind, errorCode, providerPaymentId, amountMicros, refundsTransactionId: null }) as unknown as ChargeEventRow;

describe("N12 the hosted payment's states (spec §2.6.3, §2.10)", () => {
  it("reads PAID, AUTHORIZED and NETOPIA's pending statuses 6, 13, 14 and 18 as paid or almost", () => {
    expect(paidOrAlmost(report("PAID", "3"))).toBe(true);
    expect(paidOrAlmost(report("PAID", "5"))).toBe(true);
    expect(paidOrAlmost(report("AUTHORIZED", "2"))).toBe(true);
    for (const status of ["6", "13", "14", "18"]) expect(paidOrAlmost(report("PENDING", status)), status).toBe(true);
    expect(paidOrAlmost(report("PENDING", "1"))).toBe(false);
    for (const state of ["DECLINED", "ACTION_REQUIRED", "FAILED", "EXPIRED", "VOIDED", "UNCLEAR"] as const) {
      expect(paidOrAlmost(report(state, "12")), state).toBe(false);
    }
  });

  it("keeps a page payable only while it is untouched (1), declined (the person may retry) or at the bank's check (15)", () => {
    expect(stillPayable(report("PENDING", "1"))).toBe(true);
    expect(stillPayable(report("DECLINED", "12"))).toBe(true);
    expect(stillPayable(report("ACTION_REQUIRED", "15"))).toBe(true);
    for (const [state, status] of [["PENDING", "6"], ["PAID", "3"], ["FAILED", "11"], ["EXPIRED", "23"], ["VOIDED", "4"]] as const) {
      expect(stillPayable(report(state, status)), `${state}/${status}`).toBe(false);
    }
  });

  it("reads a refunded closed upgrade as FAILED with UPGRADE_CLOSED (the waiting page never says it succeeded)", () => {
    expect(REFUND_REASONS_REFUSING_THE_PAYMENT.has("UPGRADE_CLOSED")).toBe(true);
    expect(chargeStatusOf([
      event("REQUESTED"), event("SUBMITTED", null, "ntp-1"), event("FAILED", "NO_TRANSACTION"),
      money("SUCCEEDED", null, "ntp-1", 6_050_000), money("REFUND_REQUESTED", "UPGRADE_CLOSED", "ntp-1", 6_050_000),
      money("REFUNDED", "UPGRADE_CLOSED", "ntp-1", 6_050_000)
    ])).toEqual({ state: "FAILED", reasonCode: "UPGRADE_CLOSED" });
  });
});

// F4 (ruling PR-55, finding ui-1): refunds are the owner's own act in NETOPIA's admin, so a refused payment can wait
// days for its refund. Until REFUNDED rows of that same payment cover the request, the page may only say the refund is
// on its way (REFUND_PENDING); the refused reason, whose sentence says "we refunded", follows the REFUNDED rows.
describe("F4 a refused payment reads REFUND_PENDING until its refund is recorded", () => {
  const paid = (reason: string) => [
    event("REQUESTED"), money("SUCCEEDED", null, "ntp-1", 6_050_000), money("REFUND_REQUESTED", reason, "ntp-1", 6_050_000)
  ];

  it("reads ALREADY_SUBSCRIBED, SUBSCRIPTION_ENDED and UPGRADE_CLOSED with no REFUNDED as REFUND_PENDING", () => {
    for (const reason of ["ALREADY_SUBSCRIBED", "SUBSCRIPTION_ENDED", "UPGRADE_CLOSED"]) {
      expect(chargeStatusOf(paid(reason)), reason).toEqual({ state: "FAILED", reasonCode: "REFUND_PENDING" });
    }
  });

  it("reads the refused reason once REFUNDED rows of the same payment cover the request, in one part or several", () => {
    expect(chargeStatusOf([...paid("ALREADY_SUBSCRIBED"), money("REFUNDED", "ALREADY_SUBSCRIBED", "ntp-1", 6_050_000)]))
      .toEqual({ state: "FAILED", reasonCode: "ALREADY_SUBSCRIBED" });
    expect(chargeStatusOf([
      ...paid("SUBSCRIPTION_ENDED"), money("REFUNDED", "SUBSCRIPTION_ENDED", "ntp-1", 4_000_000),
      money("REFUNDED", "SUBSCRIPTION_ENDED", "ntp-1", 2_050_000)
    ])).toEqual({ state: "FAILED", reasonCode: "SUBSCRIPTION_ENDED" });
  });

  it("stays REFUND_PENDING while the REFUNDED parts fall short, or name another payment", () => {
    expect(chargeStatusOf([...paid("ALREADY_SUBSCRIBED"), money("REFUNDED", "ALREADY_SUBSCRIBED", "ntp-1", 6_000_000)]))
      .toEqual({ state: "FAILED", reasonCode: "REFUND_PENDING" });
    expect(chargeStatusOf([...paid("UPGRADE_CLOSED"), money("REFUNDED", "DUPLICATE_PAYMENT", "ntp-2", 6_050_000)]))
      .toEqual({ state: "FAILED", reasonCode: "REFUND_PENDING" });
  });

  it("leaves the sentences that are true before the refund alone: a blocked card country, the card check's releases", () => {
    for (const reason of ["CARD_COUNTRY_BLOCKED", "CARD_CHECK_REFUSED", "CARD_CHECK_DEFERRED", "CARD_CHECK_NOT_LIVE"]) {
      expect(chargeStatusOf(paid(reason)), reason).toEqual({ state: "FAILED", reasonCode: reason });
    }
  });
});
