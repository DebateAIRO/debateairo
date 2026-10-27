/**
 * Row-level security S01, V-18's residue (ticket t_f658685f). Since 0124 a subscription event written under an account's
 * context may name only a saved card its own charge saved (`billing.guard_own_references`), but an event stored before
 * 0124 may still name another account's card, and the renewal charges whatever card the newest adopting event names.
 * `usableSavedCard` therefore answers a card only when a charge of the subscription's owner saved it.
 */
import { describe, expect, it } from "vitest";
import type { BillingRepository, CardTokenRow } from "@debateai/db";
import { usableSavedCard } from "../../apps/api/src/billing/renewal.js";

const OWNER = "00000000-0000-4000-8000-00000000000a";
const OTHER = "00000000-0000-4000-8000-00000000000b";
const TOKEN_ID = "00000000-0000-4000-8000-0000000000c1";
const CHARGE_ID = "c".repeat(32);
const AT = new Date("2026-10-27T00:00:00.000Z");
const state = { cardTokenId: TOKEN_ID, paymentEnvironment: "sandbox", ownerRef: OWNER } as const;

function repository(card: Pick<CardTokenRow, "sourceChargeId" | "sourceToolOrder">, chargeOwner: string) {
  const row = {
    tokenId: TOKEN_ID, customerId: "00000000-0000-4000-8000-0000000000d1", paymentProvider: "netopia",
    paymentEnvironment: "sandbox", revokedAt: null, expMonth: 12, expYear: 2029, ...card
  } as unknown as CardTokenRow;
  return {
    withTransaction: async <T>(use: (client: never) => Promise<T>): Promise<T> => use({} as never),
    cardTokenById: async () => row,
    charge: async (chargeId: string) => (chargeId === CHARGE_ID ? { chargeId, ownerRef: chargeOwner, events: [] } : null)
  } as unknown as BillingRepository;
}

describe("usableSavedCard answers only a card the subscription owner's own charge saved (V-18 residue)", () => {
  it("answers the card a charge of the owner saved", async () => {
    const card = await usableSavedCard(repository({ sourceChargeId: CHARGE_ID, sourceToolOrder: null }, OWNER), state, AT);
    expect(card?.tokenId).toBe(TOKEN_ID);
  });

  it("answers null for a card another account's charge saved", async () => {
    expect(await usableSavedCard(repository({ sourceChargeId: CHARGE_ID, sourceToolOrder: null }, OTHER), state, AT)).toBeNull();
  });

  it("answers null for a test-tool order's card, which no charge saved", async () => {
    const toolOrder = `t-${"0".repeat(30)}`;
    expect(await usableSavedCard(repository({ sourceChargeId: null, sourceToolOrder: toolOrder }, OWNER), state, AT)).toBeNull();
  });
});
