import { describe, expect, it } from "vitest";
import type { SubscriptionEvent, SubscriptionState } from "@debateai/billing-core";
import type { CardTokenRow, ChargeEventRow, ChargeRow } from "@debateai/db";
import { adoptingKindOf, chooseAdoptableToken } from "../../apps/api/src/billing/card-adoption.js";

const SUBSCRIPTION = "5b0f2b1e-0d6c-4f1a-9a37-2f4f3c8e1a01";
const CHARGE = "0123456789abcdef0123456789abcdef";
const DAY = 86_400_000;
const at = (day: number) => new Date(Date.UTC(2026, 9, 1) + day * DAY);

function charge(kind: ChargeRow["kind"], events: ReadonlyArray<Pick<ChargeEventRow, "kind" | "errorCode">>):
  ChargeRow & { events: ChargeEventRow[] } {
  return {
    chargeId: CHARGE, ownerRef: "owner", subscriptionId: SUBSCRIPTION, kind, attempt: 1, periodStart: at(0),
    periodEnd: at(31), quoteId: kind === "CARD_CHECK" ? null : "q", netMicros: 20_000_000, taxMicros: 3_800_000,
    totalMicros: 23_800_000, currency: "USD", createdAt: at(0), paymentProvider: "netopia", paymentEnvironment: "sandbox",
    events: events.map((event, index) => ({
      eventId: `e${index}`, chargeId: CHARGE, kind: event.kind, at: at(1), providerPaymentId: "ntp-1",
      amountMicros: 23_800_000, errorCode: event.errorCode, paymentProvider: "netopia", paymentEnvironment: "sandbox",
      refundsTransactionId: null
    }) as ChargeEventRow)
  } as ChargeRow & { events: ChargeEventRow[] };
}

function token(id: string, paidDay: number, extra: Partial<CardTokenRow> = {}): CardTokenRow {
  return {
    tokenId: id, customerId: "c", paymentProvider: "netopia", paymentEnvironment: "sandbox", sourceChargeId: CHARGE,
    sourceToolOrder: null, sourceNoticeId: null, sourcePaidAt: at(paidDay), tokenCiphertext: Buffer.alloc(1), keyId: "0".repeat(16),
    expMonth: 12, expYear: 2031, last4: "4242", cardCountry: "DE", createdAt: at(paidDay), revokedAt: null, ...extra
  } as CardTokenRow;
}

const state = (extra: Partial<SubscriptionState> = {}): SubscriptionState => ({
  subscriptionId: SUBSCRIPTION, status: "ACTIVE", paymentProvider: "netopia", paymentEnvironment: "sandbox",
  cardTokenId: null, ...extra
}) as SubscriptionState;

const cardChanged = (day: number): SubscriptionEvent => ({
  eventId: "cc", subscriptionId: SUBSCRIPTION, ownerRef: "owner", kind: "CARD_CHANGED", at: at(day), planId: "PLUS",
  periodAnchorAt: at(0), xmoneyOrderId: null, xmoneyCustomerId: null, cardRef: null, cardTokenId: "new", data: {}
}) as SubscriptionEvent;

const paid = [{ kind: "SUCCEEDED" as const, errorCode: null }];

describe("N10 card adoption (spec §2.15.2)", () => {
  it("adopts the newest eligible token of a paid charge of this subscription", () => {
    const chosen = chooseAdoptableToken({
      state: state(), events: [], charge: charge("INITIAL", paid), current: null, adopting: "CARD_SAVED", deciding: false,
      tokens: [token("old", 1), token("newer", 2), token("revoked", 3, { revokedAt: at(4) })]
    });
    expect(chosen?.tokenId).toBe("newer");
  });

  it("counts the charge as paid at the decision, before its SUCCEEDED is readable elsewhere", () => {
    const input = { state: state({ status: "CREATED" }), events: [], current: null, adopting: "ACTIVATED" as const, tokens: [token("t", 1)] };
    expect(chooseAdoptableToken({ ...input, charge: charge("INITIAL", []), deciding: true })?.tokenId).toBe("t");
    expect(chooseAdoptableToken({ ...input, charge: charge("INITIAL", []), deciding: false })).toBeNull();
  });

  it("never adopts from a charge of another subscription, provider or environment", () => {
    const base = { events: [], charge: charge("INITIAL", paid), current: null, adopting: "CARD_SAVED" as const, deciding: false };
    expect(chooseAdoptableToken({ ...base, state: state({ subscriptionId: "another" }), tokens: [token("t", 1)] })).toBeNull();
    expect(chooseAdoptableToken({ ...base, state: state(), tokens: [token("t", 1, { paymentEnvironment: "live" })] })).toBeNull();
    expect(chooseAdoptableToken({ ...base, state: state(), tokens: [token("t", 1, { sourceChargeId: "f".repeat(32) })] })).toBeNull();
    expect(chooseAdoptableToken({ ...base, state: state(), tokens: [token("t", 1, { customerId: null })] })).toBeNull();
  });

  it("never adopts from a charge that holds a refund request or a refusal", () => {
    for (const reason of ["ALREADY_SUBSCRIBED", "SUBSCRIPTION_ENDED", "UPGRADE_CLOSED", "DUPLICATE_PAYMENT", "WITHDRAWAL", "CARD_CHECK_REFUSED"]) {
      expect(chooseAdoptableToken({
        state: state(), events: [], current: null, adopting: "CARD_SAVED", deciding: false, tokens: [token("t", 1)],
        charge: charge("INITIAL", [...paid, { kind: "REFUND_REQUESTED", errorCode: reason }])
      }), reason).toBeNull();
    }
    expect(chooseAdoptableToken({
      state: state(), events: [], current: null, adopting: "CARD_SAVED", deciding: false, tokens: [token("t", 1)],
      charge: charge("INITIAL", [...paid, { kind: "DUPLICATE_PAYMENT", errorCode: null }])
    })).toBeNull();
  });

  it("adopts a CARD_CHECK token only through the CARD_CHANGED that names its charge", () => {
    const base = { state: state(), events: [], current: null, deciding: true, tokens: [token("t", 1)], charge: charge("CARD_CHECK", []) };
    expect(chooseAdoptableToken({ ...base, adopting: "CARD_CHANGED" as const })?.tokenId).toBe("t");
    expect(chooseAdoptableToken({ ...base, adopting: "CARD_SAVED" })).toBeNull();
  });

  it("never lets an older payment's token win back over the current card or the latest card change", () => {
    const base = { charge: charge("RENEWAL", paid), adopting: "CARD_SAVED" as const, deciding: false };
    // Older than the current card: refused; as new or newer: adopted.
    expect(chooseAdoptableToken({ ...base, state: state(), events: [], current: token("current", 5), tokens: [token("late", 4)] })).toBeNull();
    expect(chooseAdoptableToken({ ...base, state: state(), events: [], current: token("current", 5), tokens: [token("later", 6)] })?.tokenId).toBe("later");
    // Review Focus 5: a late message of the replaced card, paid before the latest CARD_CHANGED, is never adopted.
    expect(chooseAdoptableToken({ ...base, state: state(), events: [cardChanged(7)], current: null, tokens: [token("late", 6)] })).toBeNull();
    expect(chooseAdoptableToken({ ...base, state: state(), events: [cardChanged(7)], current: null, tokens: [token("after", 8)] })?.tokenId).toBe("after");
  });

  it("orders by the source payment's time, falling back to the row's own time", () => {
    const chosen = chooseAdoptableToken({
      state: state(), events: [], charge: charge("INITIAL", paid), current: null, adopting: "CARD_SAVED", deciding: false,
      tokens: [token("a", 3, { sourcePaidAt: null, createdAt: at(3) }), token("b", 2)]
    });
    expect(chosen?.tokenId).toBe("a");
  });

  it("names the event that carries a charge kind's card", () => {
    expect(adoptingKindOf("INITIAL")).toBe("ACTIVATED");
    expect(adoptingKindOf("RENEWAL")).toBe("RENEWED");
    expect(adoptingKindOf("UPGRADE")).toBe("UPGRADED");
    expect(adoptingKindOf("CARD_CHECK")).toBe("CARD_CHANGED");
  });
});
