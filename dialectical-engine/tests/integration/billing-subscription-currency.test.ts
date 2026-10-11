import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription, microsToDecimal, upgradeProrationMicros, type PriceCurrency } from "@debateai/billing-core";
import { BillingRepository, migrate } from "@debateai/db";
import type { BillingPlans } from "@debateai/register";
import { scheduleDowngrade } from "../../apps/api/src/billing/subscription-actions.js";
import { quoteUpgrade } from "../../apps/api/src/billing/upgrade.js";
import { AdjustableTaxEngine, StubGeo, testRegionalPlans } from "../support/billingFixtures.js";
import { seedNetopiaSubscription, subscriptionDeps } from "../support/billingSubscriptionFixtures.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

/**
 * Spec 2026-10-05 §2.16.3 (Part C): a subscription keeps its currency for good. Every later quote (an upgrade's
 * proration and recurring total, a downgrade's recurring total) uses the plan prices in the subscription's own currency
 * and asks the tax in it, whatever the register's region rule says today.
 */
const DAY = 86_400_000;
const BUYER_IP = "198.51.100.23";

let database: TestDatabase;
let billing: BillingRepository;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  billing = new BillingRepository(database.pool);
}, 600_000);
afterAll(async () => database?.stop());

async function seeded(input: Readonly<{
  planId: "PLUS" | "MAX"; taxCountry: string; currency?: PriceCurrency; netMicros?: number; plans?: BillingPlans;
}>) {
  const now = new Date();
  const ownerRef = randomUUID();
  const subscription = await seedNetopiaSubscription(database.pool, {
    ownerRef, planId: input.planId, activatedAt: new Date(now.getTime() - 5 * DAY), taxCountry: input.taxCountry,
    ...(input.currency === undefined ? {} : { currency: input.currency }),
    ...(input.netMicros === undefined ? {} : { netMicros: input.netMicros })
  });
  const tax = new AdjustableTaxEngine();
  const geo = new StubGeo();
  geo.country = input.taxCountry;
  const deps = subscriptionDeps(database.pool, { plans: input.plans ?? testRegionalPlans, tax, geo, clock: () => now });
  return { now, ownerRef, subscription, tax, deps };
}

const withTax = (net: number, basisPoints: number) => net + Math.round(net * basisPoints / 10_000 / 10_000) * 10_000;

describe("every later quote of a subscription is in its own currency (Part C)", () => {
  it("a RON PLUS subscription upgrades to PRO from the RON prices, asked only in RON", async () => {
    const run = await seeded({ planId: "PLUS", taxCountry: "RO", currency: "RON", netMicros: 100_000_000 });
    const quoted = await quoteUpgrade(run.deps, { ownerRef: run.ownerRef, planId: "PRO", ip: BUYER_IP, now: run.now });
    const prorated = upgradeProrationMicros({
      oldNetMicros: 100_000_000, newNetMicros: 250_000_000,
      periodStart: run.subscription.periodStart, periodEnd: run.subscription.periodEnd, now: run.now
    });
    expect(quoted.net).toBe(microsToDecimal(prorated));
    expect(quoted.recurring_total).toBe(microsToDecimal(withTax(250_000_000, 2_100)));
    expect(quoted.recurring_total).toBe("302.50");
    expect(run.tax.quotedCurrencies).toEqual(["RON", "RON"]);
    const row = await billing.quote(quoted.quote_ref, run.ownerRef);
    expect(row).toMatchObject({ kind: "UPGRADE", currency: "RON", recurringTotalMicros: 302_500_000 });
  });

  it("a RON MAX subscription schedules a downgrade to PRO at PRO's RON price, asked in RON", async () => {
    const run = await seeded({ planId: "MAX", taxCountry: "RO", currency: "RON" });
    expect((await billing.quote(run.subscription.initialQuoteId, run.ownerRef))?.netMicros).toBe(1_000_000_000);
    await scheduleDowngrade(run.deps, run.ownerRef, "PRO");
    const events = await billing.subscriptionEvents(run.subscription.subscriptionId);
    const scheduled = events.find((event) => event.kind === "DOWNGRADE_SCHEDULED");
    expect(scheduled).toMatchObject({ planId: "PRO", data: { recurring_net_micros: 250_000_000 } });
    expect(run.tax.quotedCurrencies).toEqual(["RON"]);
    expect(foldSubscription(events).currency).toBe("RON");
  });

  it("a USD subscription (the default seed, bought before Part C) upgrades from the USD prices, asked in USD", async () => {
    const run = await seeded({ planId: "PLUS", taxCountry: "RO" });
    const quoted = await quoteUpgrade(run.deps, { ownerRef: run.ownerRef, planId: "PRO", ip: BUYER_IP, now: run.now });
    const prorated = upgradeProrationMicros({
      oldNetMicros: 20_000_000, newNetMicros: 50_000_000,
      periodStart: run.subscription.periodStart, periodEnd: run.subscription.periodEnd, now: run.now
    });
    expect(quoted.net).toBe(microsToDecimal(prorated));
    expect(quoted.recurring_total).toBe(microsToDecimal(withTax(50_000_000, 2_100)));
    expect(run.tax.quotedCurrencies).toEqual(["USD", "USD"]);
    expect((await billing.quote(quoted.quote_ref, run.ownerRef))?.currency).toBe("USD");
  });

  it("a USD MAX subscription schedules a downgrade to PRO at PRO's USD price, asked in USD", async () => {
    const run = await seeded({ planId: "MAX", taxCountry: "RO" });
    await scheduleDowngrade(run.deps, run.ownerRef, "PRO");
    const scheduled = (await billing.subscriptionEvents(run.subscription.subscriptionId))
      .find((event) => event.kind === "DOWNGRADE_SCHEDULED");
    expect(scheduled).toMatchObject({ planId: "PRO", data: { recurring_net_micros: 50_000_000 } });
    expect(run.tax.quotedCurrencies).toEqual(["USD"]);
  });

  it("an EUR subscription still upgrades in EUR after the register maps its country to USD (§2.16.3)", async () => {
    const moved: BillingPlans = Object.freeze({
      ...testRegionalPlans,
      currencyByCountry: Object.freeze({
        ...testRegionalPlans.currencyByCountry,
        countries: Object.freeze({ ...testRegionalPlans.currencyByCountry.countries, DE: "USD" as const })
      })
    });
    const run = await seeded({ planId: "PLUS", taxCountry: "DE", currency: "EUR", plans: moved });
    const quoted = await quoteUpgrade(run.deps, { ownerRef: run.ownerRef, planId: "PRO", ip: BUYER_IP, now: run.now });
    expect(run.tax.quotedCurrencies).toEqual(["EUR", "EUR"]);
    expect(quoted.recurring_total).toBe(microsToDecimal(withTax(50_000_000, 1_900)));
    expect((await billing.quote(quoted.quote_ref, run.ownerRef))?.currency).toBe("EUR");
  });
});
