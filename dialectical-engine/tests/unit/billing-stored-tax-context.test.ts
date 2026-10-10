import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { BillingRepository } from "@debateai/db";
import {
  sealBillingProfile,
  sealQuoteLocation,
  type BillingProfile,
  type QuoteLocation
} from "../../apps/api/src/billing/records.js";
import { storedTaxContext } from "../../apps/api/src/billing/stored-tax-context.js";

/**
 * P2-M30 follow-up: a later quote for a subscription (renewal, look-ahead, upgrade, downgrade, card change) is priced
 * with the VAT id its OWN checkout validated and sealed in the quote location, never with a later profile's company.
 * A8c can revive an abandoned checkout after a newer checkout under other details wrote the latest profile; the
 * revived plan's documents name the buyer from the sealed location, so the tax id must come from there too.
 */
const KEY = randomBytes(32);
const COMPANY = Object.freeze({ name: "Later GmbH", vatId: "DE-VALID-1", address: "Strasse 1, Berlin", vatValidated: true });

function location(company: QuoteLocation["company"]): QuoteLocation {
  return {
    name: "Test Person", firstName: null, lastName: null, phone: null, country: "DE", region: null, postalCode: "10115",
    city: "Berlin", street: null, ip: "198.51.100.7", ipCountry: "DE", company
  };
}

const LATER_PROFILE: BillingProfile = Object.freeze({
  email: "later@example.test", locale: "de", name: "Test Person", firstName: null, lastName: null, phone: null,
  paymentIp: null, country: "DE", region: null,
  postalCode: "10115", city: "Berlin", street: null, company: COMPANY
});

function stub(sealedLocation: QuoteLocation) {
  const ownerRef = randomUUID();
  const subscriptionId = randomUUID();
  const quoteId = randomUUID();
  const customerId = randomUUID();
  const billing = {
    chargesForSubscription: async (id: string) => id === subscriptionId
      ? [{ chargeId: randomUUID(), subscriptionId, kind: "INITIAL", quoteId }] : [],
    quote: async (id: string, owner: string) => id === quoteId && owner === ownerRef
      ? { quoteId, ownerRef, locationCiphertext: sealQuoteLocation(KEY, quoteId, sealedLocation).ciphertext } : null,
    customerByOwner: async (owner: string) => owner === ownerRef
      ? { customerId, locale: "de" } : null,
    latestProfile: async (id: string) => id === customerId
      ? { profileCiphertext: sealBillingProfile(KEY, customerId, LATER_PROFILE).ciphertext, keyId: "k", at: new Date(), locale: "de" }
      : null
  } as unknown as Pick<BillingRepository, "chargesForSubscription" | "quote" | "customerByOwner" | "latestProfile">;
  return { deps: { billing, recordsKey: KEY }, state: { subscriptionId, ownerRef } };
}

describe("storedTaxContext prices with the subscription's own checkout VAT id (P2-M30)", () => {
  it("ignores a later profile's validated company when the checkout bought as a person", async () => {
    const { deps, state } = stub(location(null));
    const context = await storedTaxContext(deps, state);
    expect(context.taxId).toBeNull();
    expect(context.quoteLocation.company).toBeNull();
    // The profile is still read (email and locale come from it), only its company does not price the quote.
    expect(context.profile?.company?.vatId).toBe("DE-VALID-1");
  });

  it("control: uses the VAT id the checkout validated and sealed in its location", async () => {
    const { deps, state } = stub(location(COMPANY));
    expect((await storedTaxContext(deps, state)).taxId).toBe("DE-VALID-1");
  });

  it("control: a sealed company whose VAT id was not validated prices without a tax id", async () => {
    const { deps, state } = stub(location({ ...COMPANY, vatValidated: false }));
    expect((await storedTaxContext(deps, state)).taxId).toBeNull();
  });
});
