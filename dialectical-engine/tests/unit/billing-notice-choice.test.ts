// tests/unit/billing-notice-choice.test.ts
// F8 (ruling PR-56, decision 4): when NETOPIA's status stays unreadable for the whole schedule, VERIFY_PAYMENT decides
// from a stored (verified) notice. A failure notice (declined, failed, expired) decides only when no notice of the same
// order says paid or anything after paid; otherwise the newest such notice decides, so a resent decline stored after
// the paid notice never closes a paid order as failed.
import { describe, expect, it } from "vitest";
import type { PaymentNoticeRow } from "@debateai/db";
import { noticeToDecide } from "../../apps/api/src/billing/verify-payment.js";

/** A notice of one order by its NETOPIA status; `notices` below are newest first, as `noticesForOrder` returns them. */
const notice = (label: string, providerStatus: number | null): PaymentNoticeRow => ({
  noticeId: label, paymentProvider: "netopia", paymentEnvironment: "sandbox", receivedAt: new Date("2026-10-09T10:00:00Z"),
  bodySha256: "0".repeat(64), orderId: "a".repeat(32), providerPaymentId: `ntp-${label}`, providerStatus, amountText: "24.20",
  currency: "USD", cardCountry: "RO", keyFingerprint: "e".repeat(64), jwtIat: null, allowedCiphertext: Buffer.alloc(0),
  keyId: "k"
}) as PaymentNoticeRow;
const chosen = (notices: PaymentNoticeRow[], paidSeen = false) => noticeToDecide(notices, paidSeen)?.noticeId ?? null;

describe("F8 the notice that decides once the status schedule is spent", () => {
  it("is the newest notice when it is not a failure, or when no notice says paid or after", () => {
    expect(chosen([])).toBeNull();
    expect(chosen([notice("paid", 3), notice("declined", 12)])).toBe("paid");
    expect(chosen([notice("pending", 1), notice("paid", 3)])).toBe("pending");
    expect(chosen([notice("declined-again", 12), notice("declined", 12)])).toBe("declined-again");
    expect(chosen([notice("expired", 23), notice("pending", 1)])).toBe("expired");
    // A void before any payment is not "after paid": the newest decline decides.
    expect(chosen([notice("declined", 12), notice("voided", 4)])).toBe("declined");
    expect(chosen([notice("unread", null), notice("paid", 3)])).toBe("unread");
  });

  it("passes over a newer decline, failure or expiry for the newest notice that says paid or after", () => {
    for (const failure of [11, 12, 23]) {
      expect(chosen([notice("failure", failure), notice("paid", 3)]), String(failure)).toBe("paid");
      expect(chosen([notice("failure", failure), notice("paid-5", 5), notice("declined", 12)]), String(failure)).toBe("paid-5");
    }
    expect(chosen([notice("declined", 12), notice("refunded", 8), notice("paid", 3)])).toBe("refunded");
    for (const chargeback of [9, 10, 16]) {
      expect(chosen([notice("declined", 12), notice("chargeback", chargeback), notice("paid", 3)])).toBe("chargeback");
    }
    // A void after a payment (a paid notice, or the charge seen paid) is after paid.
    expect(chosen([notice("declined", 12), notice("voided", 4), notice("paid", 3)])).toBe("voided");
    expect(chosen([notice("declined", 12), notice("voided", 4)], true)).toBe("voided");
    // Several failures newer than the paid notice: still the paid one.
    expect(chosen([notice("declined-2", 12), notice("failed", 11), notice("paid", 3), notice("declined-1", 12)])).toBe("paid");
  });
});
