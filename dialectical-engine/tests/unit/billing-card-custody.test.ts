import { describe, expect, it } from "vitest";
import type { SubscriptionEvent, SubscriptionState } from "@debateai/billing-core";
import type { CardTokenRow, ChargeEventRow, ChargeRow } from "@debateai/db";
import { custodyDecision, type CustodyFacts } from "../../apps/api/src/billing/card-custody.js";

const DAY = 86_400_000;
const NOW = new Date("2026-11-20T03:00:00Z");
const CHARGE = "0123456789abcdef0123456789abcdef";
const SUBSCRIPTION = "5b0f2b1e-0d6c-4f1a-9a37-2f4f3c8e1a01";

const token = (extra: Partial<CardTokenRow> = {}): CardTokenRow => ({
  tokenId: "t1", customerId: "c", paymentProvider: "netopia", paymentEnvironment: "sandbox", sourceChargeId: CHARGE,
  sourceToolOrder: null, sourceNoticeId: null, sourcePaidAt: new Date(NOW.getTime() - 2 * DAY), tokenCiphertext: Buffer.alloc(1),
  keyId: ["01234567", "89abcdef"].join(""), expMonth: 12, expYear: 2031, last4: "4242", cardCountry: "DE",
  createdAt: new Date(NOW.getTime() - 2 * DAY), revokedAt: null, ...extra
}) as CardTokenRow;
const charge = (kind: ChargeRow["kind"], kinds: ReadonlyArray<ChargeEventRow["kind"]>) => ({
  chargeId: CHARGE, subscriptionId: SUBSCRIPTION, kind, ownerRef: "o",
  events: kinds.map((eventKind) => ({ kind: eventKind }) as ChargeEventRow)
}) as unknown as ChargeRow & { events: ChargeEventRow[] };
const state = (status: SubscriptionState["status"], cardTokenId: string | null) =>
  ({ subscriptionId: SUBSCRIPTION, status, cardTokenId }) as SubscriptionState;
const adopted = (tokenId: string): SubscriptionEvent => ({ kind: "ACTIVATED", cardTokenId: tokenId }) as SubscriptionEvent;

const facts = (extra: Partial<CustodyFacts>): CustodyFacts => ({
  token: token(), ours: true, charge: charge("INITIAL", ["REQUESTED", "SUCCEEDED"]), state: state("ACTIVE", "t1"),
  events: [adopted("t1")], erased: false, now: NOW, ...extra
});

describe("N17 which saved cards are deleted (spec §2.15.4)", () => {
  it("keeps the current card of a live plan, whatever its age", () => {
    for (const status of ["ACTIVE", "PAST_DUE", "SUSPENDED"] as const) {
      expect(custodyDecision(facts({ state: state(status, "t1") })), status).toBe("KEEP");
    }
  });

  it("names the reason, in order: tool order, other system, erasure, not adopted, replaced, plan ended", () => {
    expect(custodyDecision(facts({ token: token({ sourceToolOrder: `t-${"a".repeat(30)}`, customerId: null, sourceChargeId: null }), charge: null, state: null })))
      .toBe("TOOL_ORDER");
    expect(custodyDecision(facts({ ours: false }))).toBe("OTHER_SYSTEM");
    expect(custodyDecision(facts({ erased: true }))).toBe("ERASURE");
    expect(custodyDecision(facts({ charge: null, state: null }))).toBe("NOT_ADOPTED");
    expect(custodyDecision(facts({ state: state("ACTIVE", "t2"), events: [] }))).toBe("NOT_ADOPTED");
    expect(custodyDecision(facts({ state: state("ACTIVE", "t2"), events: [adopted("t1"), adopted("t2")] }))).toBe("REPLACED");
    expect(custodyDecision(facts({ state: state("ENDED", "t1") }))).toBe("PLAN_ENDED");
    expect(custodyDecision(facts({ state: state("WITHDRAWN", "t1") }))).toBe("PLAN_ENDED");
    expect(custodyDecision(facts({ state: state("ENDED", null), events: [] }))).toBe("NOT_ADOPTED");
  });

  it("keeps a token whose payment is not decided yet for up to 30 days (A8 (c)), then lets it go", () => {
    const undecided = { charge: charge("INITIAL", ["REQUESTED", "FAILED"]), state: state("CREATED", null), events: [] };
    expect(custodyDecision(facts({ ...undecided, token: token({ createdAt: new Date(NOW.getTime() - 29 * DAY) }) }))).toBe("KEEP");
    expect(custodyDecision(facts({ ...undecided, token: token({ createdAt: new Date(NOW.getTime() - 30 * DAY) }) }))).toBe("NOT_ADOPTED");
    // A renewal is decided by its FAILED: a new attempt is a new charge.
    expect(custodyDecision(facts({ charge: charge("RENEWAL", ["REQUESTED", "SUBMITTED", "FAILED"]), state: state("PAST_DUE", "t0"), events: [] })))
      .toBe("NOT_ADOPTED");
    // An erasure never waits for the 30 days.
    expect(custodyDecision(facts({ ...undecided, erased: true }))).toBe("ERASURE");
  });
});
