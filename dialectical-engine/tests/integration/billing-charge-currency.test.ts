import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription, type PriceCurrency } from "@debateai/billing-core";
import { startBillingHarness, testConsentDocuments, type BillingHarness } from "../support/billingHarness.js";
import { testRegionalPlans } from "../support/billingFixtures.js";

/**
 * Spec 2026-10-05 §2.16.4 (Part C, task C2): every charge is in its quote's currency, which is its subscription's for
 * good, and NETOPIA is asked for exactly that: the hosted page of a checkout, the saved-card charge of a renewal. A
 * NETOPIA status that names another currency than the charge's is not the charge's payment (VERIFY_PAYMENT's existing
 * PAYMENT_AMOUNT_MISMATCH, reachable now that a charge can be in EUR or RON).
 */
const MINUTE = 60_000;
const POSTAL_CODES: Readonly<Record<string, string>> = Object.freeze({ DE: "10115", RO: "010011" });

let h: BillingHarness;
beforeAll(async () => { h = await startBillingHarness(); }, 120_000);
afterAll(async () => { await h?.stop(); });

/** A checkout under the engine's region rule, with the inputs the harness's own `buy` builds. */
async function buyIn(country: "DE" | "RO") {
  const ownerRef = randomUUID();
  h.geo.country = country;
  const quoted = await h.quotesWith(testRegionalPlans).create({
    ownerRef, ip: "198.51.100.7", planId: "PLUS", country, name: null, firstName: "Test", lastName: "Buyer",
    phone: "+40712345678", street: "Strada Test 1", region: country === "RO" ? "Bucuresti" : null,
    postalCode: POSTAL_CODES[country]!, city: country === "RO" ? "Sector 1" : "Berlin", company: null, now: h.clock.now
  });
  const started = await h.checkoutWith({}).start({
    ownerRef, userId: randomUUID(), ip: "198.51.100.7", userAgent: "billing-charge-currency", quoteRef: quoted.quote.quoteId,
    locale: "en", consents: {
      renewal: testConsentDocuments("CONSENT_RENEWAL", "en")!, immediateStart: testConsentDocuments("CONSENT_IMMEDIATE_START", "en")!
    },
    countryConfirmed: true, now: h.clock.now
  });
  const quote = (await h.repository.quote(quoted.quote.quoteId, ownerRef))!;
  const charge = (await h.repository.charge(started.chargeId))!;
  return { ownerRef, quote, charge, chargeId: started.chargeId, subscriptionId: charge.subscriptionId };
}

const hostedStartsFor = (chargeId: string) => h.payments.hosted.filter((start) => start.orderId === chargeId);

async function expectCheckoutIn(country: "DE" | "RO", currency: PriceCurrency) {
  const bought = await buyIn(country);
  expect(bought.quote.currency).toBe(currency);
  expect(bought.charge).toMatchObject({ kind: "INITIAL", currency, totalMicros: bought.quote.totalMicros });
  expect(hostedStartsFor(bought.chargeId)).toEqual([
    expect.objectContaining({ orderId: bought.chargeId, currency, amountMicros: bought.quote.totalMicros })
  ]);
  return bought;
}

describe("every charge and every NETOPIA request is in the subscription's currency (Part C)", () => {
  it("a German buyer's checkout is charged, started and paid in EUR, and the plan keeps EUR", async () => {
    const bought = await expectCheckoutIn("DE", "EUR");
    const paid = h.payments.pay(bought.chargeId, { amountMicros: bought.charge.totalMicros, cardCountry: "DE" });
    expect(paid.currency).toBe("EUR");
    await h.settle(bought.chargeId);
    const events = await h.repository.subscriptionEvents(bought.subscriptionId);
    expect(events.map((event) => event.kind)).toContain("ACTIVATED");
    expect(foldSubscription(events)).toMatchObject({ status: "ACTIVE", currency: "EUR" });
  });

  it("a Romanian buyer pays in RON, and the renewal charges the saved card in RON at the subscription's recurring total", async () => {
    const bought = await expectCheckoutIn("RO", "RON");
    await h.storeCardToken(bought.chargeId, { cardCountry: "RO" });
    h.payments.pay(bought.chargeId, { amountMicros: bought.charge.totalMicros, cardCountry: "RO" });
    await h.settle(bought.chargeId);
    expect(foldSubscription(await h.repository.subscriptionEvents(bought.subscriptionId))).toMatchObject({
      status: "ACTIVE", currency: "RON"
    });
    h.clock.now = new Date((await h.periodEndOf(bought.subscriptionId)).getTime() + MINUTE);
    expect(await h.renewal.renew(bought.subscriptionId)).toBe("charged");
    const renewals = (await h.repository.chargesForSubscription(bought.subscriptionId)).filter((charge) => charge.kind === "RENEWAL");
    expect(renewals).toHaveLength(1);
    // PLUS at 100.00 RON and Romania's 21 %: the subscription's own recurring total, the INITIAL charge's.
    expect(renewals[0]).toMatchObject({ currency: "RON", netMicros: 100_000_000, totalMicros: bought.charge.totalMicros });
    expect(h.payments.charges.filter((charge) => charge.orderId === renewals[0]!.chargeId)).toEqual([
      expect.objectContaining({ currency: "RON", amountMicros: bought.charge.totalMicros })
    ]);
  });

  it("an EUR charge whose NETOPIA status says PAID in USD is not its payment: no plan starts", async () => {
    const bought = await expectCheckoutIn("DE", "EUR");
    h.payments.setState(bought.chargeId, "PAID", { currency: "USD", amountMicros: bought.charge.totalMicros });
    await h.settle(bought.chargeId);
    const verify = (await h.outboxRows(bought.chargeId)).filter((row) => row.kind === "VERIFY_PAYMENT");
    expect(verify).toEqual([expect.objectContaining({ dead: true, lastErrorCode: "PAYMENT_AMOUNT_MISMATCH" })]);
    expect(await h.eventKinds(bought.chargeId)).toEqual(["REQUESTED", "SUBMITTED"]);
    const events = await h.repository.subscriptionEvents(bought.subscriptionId);
    expect(events.map((event) => event.kind)).not.toContain("ACTIVATED");
    expect(foldSubscription(events).status).toBe("CREATED");
  });
});
