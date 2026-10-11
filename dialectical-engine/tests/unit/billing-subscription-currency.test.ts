import { describe, expect, it } from "vitest";
import { foldSubscription, type SubscriptionEvent } from "@debateai/billing-core";
import { activeSubscriptionEvents } from "../support/billingFixtures.js";

/**
 * Spec 2026-10-05 §2.16.3 (Part C): a subscription keeps the currency its CREATED names, for good. A history written
 * before Part C names none and folds to US dollars; a CREATED naming anything else is not a legal history.
 */
const OWNER = "6a1b2c3d-4e5f-4a6b-8c7d-000000000c01";
const at = new Date("2026-10-01T09:00:00.000Z");

function withCreatedCurrency(currency: unknown): SubscriptionEvent[] {
  const [created, activated] = activeSubscriptionEvents(OWNER, at);
  return [
    { ...created!, data: { ...created!.data, currency } as SubscriptionEvent["data"] },
    activated!
  ];
}

describe("the fold gives every subscription its currency", () => {
  it.each(["EUR", "RON", "USD"] as const)("CREATED naming %s folds to it", (currency) => {
    expect(foldSubscription(withCreatedCurrency(currency)).currency).toBe(currency);
  });

  it("a history with no data.currency (written before Part C) folds to USD", () => {
    const events = activeSubscriptionEvents(OWNER, at);
    expect(Object.hasOwn(events[0]!.data, "currency")).toBe(false);
    expect(foldSubscription(events).currency).toBe("USD");
  });

  it.each([["GBP"], ["eur"], [""], [978], [true], [null]])("CREATED naming %j refuses", (currency) => {
    expect(() => foldSubscription(withCreatedCurrency(currency)))
      .toThrowError(expect.objectContaining({ code: "BILLING_SUBSCRIPTION_EVENTS_INVALID" }));
  });

  it("a later event naming another currency does not change it", () => {
    const [created, activated] = withCreatedCurrency("EUR");
    const later = { ...activated!, data: { ...activated!.data, currency: "RON" } };
    expect(foldSubscription([created!, later]).currency).toBe("EUR");
  });
});
