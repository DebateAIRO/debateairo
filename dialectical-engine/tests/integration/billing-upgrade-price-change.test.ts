import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decimalToMicros, foldSubscription } from "@debateai/billing-core";
import type { BillingPlans } from "@debateai/register";
import { startBillingHarness, type BillingHarness } from "../support/billingHarness.js";
import { testBillingPlans } from "../support/billingFixtures.js";
import { subscriptionDeps, testAgreement } from "../support/billingSubscriptionFixtures.js";
import { openQuoteLocation, sealQuoteLocation } from "../../apps/api/src/billing/records.js";
import { createUpgradeSettlement, monthlyQuoteIdOf, quoteUpgrade, startUpgrade } from "../../apps/api/src/billing/upgrade.js";

// Plan prices can change with an upload while a person is in the middle of an upgrade. These suites play that out on
// the real tables: the upgrade is quoted under one set of plans, and started, paid and renewed by processes that have
// another. Every price here is made up.
const plansPriced = (plus: number, pro: number, max: number, sourceRef: string): BillingPlans => Object.freeze({
  ...testBillingPlans, sourceRef,
  plans: Object.freeze(testBillingPlans.plans.map((plan) => {
    const net = ({ PLUS: plus, PRO: pro, MAX: max } as Readonly<Record<string, number>>)[plan.planId];
    return net === undefined ? plan : Object.freeze({ ...plan, netPrices: Object.freeze({ USD: net, EUR: net, RON: net }) });
  }))
}) as BillingPlans;
/** The plans the person saw: PLUS 22.00, PRO 66.00, MAX 187.00 a month before tax. */
const SHOWN = plansPriced(22_000_000, 66_000_000, 187_000_000, "test:plans-shown");
/** The plans published while the upgrade was open: PRO and MAX cost more. */
const LATER = plansPriced(22_000_000, 88_000_000, 209_000_000, "test:plans-later");

let h: BillingHarness;
beforeAll(async () => {
  h = await startBillingHarness();
  // The process that verifies payments already has the later plans.
  h.verify.registerSettlement("UPGRADE", createUpgradeSettlement({
    repository: h.repository, entitlements: h.entitlements, plans: LATER
  }));
}, 120_000);
afterAll(async () => { await h?.stop(); });

const DAY = 86_400_000;
const MINUTE = 60_000;
const IP = "198.51.100.7";
const deps = (plans: BillingPlans) => subscriptionDeps(h.database.pool, {
  recordsKey: h.recordsKey, tax: h.tax, payments: h.payments, geo: h.geo, clock: h.clock.read, plans
});
const upgradeInput = (ownerRef: string, planId: "PRO" | "MAX", quoteRef: string) => ({
  ownerRef, userId: randomUUID(), planId, quoteRef, ip: IP, userAgent: "upgrade-price-change", locale: "en",
  agreement: testAgreement("en")!
});
const chargesOf = async (subscriptionId: string, kind: "UPGRADE" | "RENEWAL") =>
  (await h.repository.chargesForSubscription(subscriptionId)).filter((charge) => charge.kind === kind);
const eventsOf = (subscriptionId: string) => h.repository.subscriptionEvents(subscriptionId);
/** The person pays on NETOPIA's page (the card it saved, its PAID status), then VERIFY_PAYMENT decides it. */
async function payAndSettle(chargeId: string): Promise<void> {
  const charge = (await h.repository.charge(chargeId))!;
  await h.storeCardToken(chargeId);
  await h.payments.pay(chargeId, { amountMicros: charge.totalMicros, cardCountry: "RO" });
  await h.settle(chargeId);
}

describe("an upgrade whose plan price changes between the quote and the payment", () => {
  it("charges the amount shown, records the monthly price shown, and renews at it with no notice", async () => {
    const paid = await h.activate({ planId: "PLUS", plans: SHOWN });
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() - 10 * DAY);
    const quoted = await quoteUpgrade(deps(SHOWN), { ownerRef: paid.ownerRef, planId: "PRO", ip: IP, now: h.clock.now });
    // The monthly quote the person saw is kept beside the upgrade quote: PRO's net as shown, and the announced total.
    const monthly = (await h.repository.quote(monthlyQuoteIdOf(quoted.quote_ref), paid.ownerRef))!;
    expect(monthly).toMatchObject({
      kind: "RENEWAL", planId: "PRO", netMicros: 66_000_000, totalMicros: decimalToMicros(quoted.recurring_total),
      recurringTotalMicros: null
    });
    expect(monthly.totalMicros).toBeGreaterThan(monthly.netMicros);
    expect(openQuoteLocation(h.recordsKey, monthly.quoteId, monthly.locationCiphertext).country).toBe("RO");

    // The new prices go live. The process that starts the payment and the one that verifies it both have them.
    h.clock.now = new Date(h.clock.now.getTime() + MINUTE);
    const started = await startUpgrade(deps(LATER), upgradeInput(paid.ownerRef, "PRO", quoted.quote_ref));
    const charge = (await h.repository.charge(started.charge_ref))!;
    // What is charged now: the prorated amount of the quote, to the cent.
    expect(charge.totalMicros).toBe(decimalToMicros(quoted.total));
    expect(h.payments.hosted.at(-1)).toMatchObject({ orderId: started.charge_ref, amountMicros: decimalToMicros(quoted.total) });
    await payAndSettle(started.charge_ref);

    // What is recorded as the recurring price: PRO as shown (66.00), not PRO as it costs now (88.00).
    const upgraded = (await eventsOf(paid.subscriptionId)).find((event) => event.kind === "UPGRADED")!;
    expect(upgraded.data).toMatchObject({
      recurring_net_micros: 66_000_000, announced_total_micros: decimalToMicros(quoted.recurring_total),
      quote_ref: quoted.quote_ref
    });
    expect(foldSubscription(await eventsOf(paid.subscriptionId))).toMatchObject({
      planId: "PRO", announcedTotalMicros: decimalToMicros(quoted.recurring_total)
    });

    // What the next renewal charges, in a process that has the later plans: the monthly total shown with the upgrade,
    // at once, with no price notice and no postponement.
    h.clock.now = new Date(end.getTime() - MINUTE);
    await h.renewalWith({ plans: LATER }).runOnce();
    const renewals = await chargesOf(paid.subscriptionId, "RENEWAL");
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({
      netMicros: 66_000_000, totalMicros: decimalToMicros(quoted.recurring_total), periodStart: end
    });
    const kinds = (await eventsOf(paid.subscriptionId)).map((event) => event.kind);
    expect(kinds).not.toContain("RENEWAL_NOTICE_SENT");
    expect(kinds).not.toContain("RENEWAL_POSTPONED");
  });

  it("does the same when only the verifying process has the new prices (the page was opened before the switch)", async () => {
    const paid = await h.activate({ planId: "PLUS", plans: SHOWN });
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() - 10 * DAY);
    const quoted = await quoteUpgrade(deps(SHOWN), { ownerRef: paid.ownerRef, planId: "MAX", ip: IP, now: h.clock.now });
    const started = await startUpgrade(deps(SHOWN), upgradeInput(paid.ownerRef, "MAX", quoted.quote_ref));
    await payAndSettle(started.charge_ref);
    const upgraded = (await eventsOf(paid.subscriptionId)).find((event) => event.kind === "UPGRADED")!;
    expect(upgraded.data).toMatchObject({
      recurring_net_micros: 187_000_000, announced_total_micros: decimalToMicros(quoted.recurring_total)
    });
    h.clock.now = new Date(end.getTime() - MINUTE);
    await h.renewalWith({ plans: LATER }).runOnce();
    expect(await chargesOf(paid.subscriptionId, "RENEWAL")).toMatchObject([
      { netMicros: 187_000_000, totalMicros: decimalToMicros(quoted.recurring_total) }
    ]);
    expect((await eventsOf(paid.subscriptionId)).map((event) => event.kind)).not.toContain("RENEWAL_NOTICE_SENT");
  });

  it("asks for a new quote when an upgrade quote has no monthly quote beside it, and charges nothing", async () => {
    const paid = await h.activate({ planId: "PLUS", plans: SHOWN });
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() - 10 * DAY);
    const quoted = await quoteUpgrade(deps(SHOWN), { ownerRef: paid.ownerRef, planId: "PRO", ip: IP, now: h.clock.now });
    // An upgrade quote as the release before wrote it: the same row under an id of its own, with no monthly quote.
    const row = (await h.repository.quote(quoted.quote_ref, paid.ownerRef))!;
    const alone = randomUUID();
    const sealed = sealQuoteLocation(h.recordsKey, alone, openQuoteLocation(h.recordsKey, row.quoteId, row.locationCiphertext));
    await h.repository.withTransaction((client) => h.repository.insertQuote(client, {
      ...row, quoteId: alone, locationCiphertext: sealed.ciphertext, keyId: sealed.keyId
    }));
    await expect(startUpgrade(deps(LATER), upgradeInput(paid.ownerRef, "PRO", alone)))
      .rejects.toMatchObject({ status: 409, code: "QUOTE_EXPIRED" });
    expect(await chargesOf(paid.subscriptionId, "UPGRADE")).toEqual([]);
    // The quote made the usual way still buys the upgrade.
    const started = await startUpgrade(deps(LATER), upgradeInput(paid.ownerRef, "PRO", quoted.quote_ref));
    expect((await h.repository.charge(started.charge_ref))!.totalMicros).toBe(decimalToMicros(quoted.total));
  });
});
