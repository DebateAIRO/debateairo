import { describe, expect, it } from "vitest";
import type { PaymentReport, PaymentState } from "@debateai/billing-core";
import {
  classifyOpenCheckout, hostedStartInFlightMs, inFlightAttemptLifeMs, type OpenCheckoutFacts
} from "../../apps/api/src/billing/checkout.js";

const NOW = new Date("2026-10-01T10:00:00.000Z");
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
const MINUTE = 60_000;

const report = (state: PaymentState, providerStatus: string): PaymentReport => Object.freeze({
  orderId: "0123456789abcdef0123456789abcdef", providerPaymentId: "ntp-1", state, providerStatus, amountMicros: 24_200_000,
  currency: "USD", cardCountry: null, savedCard: null, declineCode: null, declineSide: null, bankDeclined: false,
  occurredAt: null, clientId: null
});
const event = (kind: string, errorCode: string | null = null) => Object.freeze({ kind, errorCode }) as OpenCheckoutFacts["events"][number];

/** A young, same-purchase checkout whose page was opened a minute ago and is untouched (status 1). */
const base: OpenCheckoutFacts = Object.freeze({
  events: [event("REQUESTED"), event("SUBMITTED")], notice: null, read: report("PENDING", "1"),
  hostedStartedAt: ago(MINUTE), samePurchase: true, createdAt: ago(MINUTE), chargeCreatedAt: ago(MINUTE), now: NOW
});
const verdict = (overrides: Partial<OpenCheckoutFacts>) => classifyOpenCheckout({ ...base, ...overrides });

describe("N18 spec §2.6.3: one open checkout at a time", () => {
  it("waits on a paid charge, a paid or almost paid status, and a status read that failed (the safe side)", () => {
    expect(verdict({ events: [event("REQUESTED"), event("SUBMITTED"), event("SUCCEEDED")] })).toBe("PENDING");
    expect(verdict({ read: report("PAID", "3") })).toBe("PENDING");
    expect(verdict({ read: report("PAID", "5") })).toBe("PENDING");
    expect(verdict({ read: report("AUTHORIZED", "2") })).toBe("PENDING");
    for (const status of ["6", "13", "14", "18"]) expect(verdict({ read: report("PENDING", status) }), status).toBe("PENDING");
    expect(verdict({ read: "READ_FAILED" })).toBe("PENDING");
    // A page whose read is missing (the open charge changed under the lock) counts as a failed read.
    expect(verdict({ read: null })).toBe("PENDING");
    // NETOPIA's newest stored message counts as much as the status read.
    expect(verdict({ notice: { providerStatus: 3, receivedAt: ago(MINUTE) } })).toBe("PENDING");
    expect(verdict({ notice: { providerStatus: 13, receivedAt: ago(MINUTE) } })).toBe("PENDING");
    expect(verdict({ notice: { providerStatus: 12, receivedAt: ago(MINUTE) } })).toBe("REUSE");
  });

  it("counts a not-final payment as almost paid only while inFlightAttemptLifeMs lasts; a paid one always", () => {
    const old = { hostedStartedAt: ago(inFlightAttemptLifeMs() + MINUTE), createdAt: ago(25 * MINUTE), chargeCreatedAt: ago(25 * MINUTE) };
    expect(verdict({ ...old, read: report("PENDING", "6") })).toBe("ABANDON");
    expect(verdict({ ...old, read: report("AUTHORIZED", "2") })).toBe("ABANDON");
    expect(verdict({ ...old, read: report("PAID", "3") })).toBe("PENDING");
    // A message received since keeps it fresh.
    expect(verdict({ ...old, read: report("PENDING", "6"), notice: { providerStatus: 6, receivedAt: ago(MINUTE) } })).toBe("PENDING");
  });

  it("gives the same page again for an untouched, declined or 3-D Secure payment of the same young purchase", () => {
    expect(verdict({})).toBe("REUSE");
    expect(verdict({ read: report("DECLINED", "12"), events: [event("REQUESTED"), event("SUBMITTED"), event("FAILED", "PAYMENT_DECLINED")] })).toBe("REUSE");
    expect(verdict({ read: report("ACTION_REQUIRED", "15") })).toBe("REUSE");
  });

  it("abandons an older checkout, another purchase, an order NETOPIA does not know, a final failure or an unknown start", () => {
    expect(verdict({ createdAt: ago(31 * MINUTE) })).toBe("ABANDON");
    expect(verdict({ samePurchase: false })).toBe("ABANDON");
    expect(verdict({ read: "NO_SUCH_ORDER" })).toBe("ABANDON");
    expect(verdict({ read: report("FAILED", "11") })).toBe("ABANDON");
    expect(verdict({ read: report("EXPIRED", "23") })).toBe("ABANDON");
    expect(verdict({ read: report("UNCLEAR", "17") })).toBe("ABANDON");
    expect(verdict({ events: [event("REQUESTED"), event("FAILED", "PAYMENT_PROVIDER_UNAVAILABLE")], hostedStartedAt: null, read: null })).toBe("ABANDON");
    expect(verdict({ events: [event("REQUESTED"), event("SUBMIT_UNKNOWN", "CHARGE_OUTCOME_UNKNOWN")], hostedStartedAt: null, read: null })).toBe("ABANDON");
    // A start still on its way (no page yet, moments old) waits; one that never answered is abandoned.
    const starting = { events: [event("REQUESTED")], hostedStartedAt: null, read: null } as const;
    expect(verdict({ ...starting, chargeCreatedAt: ago(hostedStartInFlightMs() - 1_000) })).toBe("PENDING");
    expect(verdict({ ...starting, chargeCreatedAt: ago(hostedStartInFlightMs() + 1_000) })).toBe("ABANDON");
  });
});
