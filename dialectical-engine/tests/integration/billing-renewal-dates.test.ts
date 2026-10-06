import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription } from "@debateai/billing-core";
import { startBillingHarness, type BillingHarness } from "../support/billingHarness.js";

let h: BillingHarness;
beforeAll(async () => { h = await startBillingHarness(new Date("2027-01-31T10:00:00.000Z")); });
afterAll(async () => { await h?.stop(); });

const MINUTE = 60_000;
const at = (value: string) => new Date(value);
const renewals = async (subscriptionId: string) => (await h.repository.chargesForSubscription(subscriptionId))
  .filter((charge) => charge.kind === "RENEWAL")
  .sort((left, right) => left.periodStart.getTime() - right.periodStart.getTime());

/** One renewal of this subscription: to its period end plus a minute, the timer, then VERIFY_PAYMENT. */
async function renewOnce(subscriptionId: string): Promise<void> {
  h.clock.now = new Date((await h.periodEndOf(subscriptionId)).getTime() + MINUTE);
  await h.renewal.runOnce();
  await h.worker.drain(10);
}

/** After a renewal: the fold's period end and the entitlement's paid-through are the same literal instant. */
async function expectPaidThrough(paid: Readonly<{ subscriptionId: string; ownerRef: string }>, end: string): Promise<void> {
  expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).currentPeriodEnd).toEqual(at(end));
  expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ cause: "RENEWED", paidThrough: at(end) });
}

describe("P11a renewal dates clamp to the month's end and never skip or double a month (Review Focus 4)", () => {
  it("renews a plan activated on 31 January on 28 February, 31 March and 30 April; a postponed one keeps its period", async () => {
    const monthly = await h.activate();
    h.geo.country = "DE";
    const postponed = await h.activate({ country: "DE", cardCountry: "DE" });
    h.geo.country = "RO";
    expect(await h.periodEndOf(monthly.subscriptionId)).toEqual(at("2027-02-28T10:00:00.000Z"));
    // The German rate moves before the first renewal: M3, then the 7-business-day wait (A7).
    h.tax.rateOverride.set("DE", 1_800);

    await renewOnce(monthly.subscriptionId);
    await expectPaidThrough(monthly, "2027-03-31T10:00:00.000Z");
    // W12 (A7): the postponed plan's M3 goes out now, so its notice counts from now.
    await h.mail.drain();
    const until = foldSubscription(await h.repository.subscriptionEvents(postponed.subscriptionId)).renewalPostponedUntil!;
    expect(until.getTime()).toBeGreaterThan(at("2027-03-05T00:00:00.000Z").getTime());
    h.clock.now = new Date(until.getTime() + MINUTE);
    await h.renewal.runOnce();
    await h.worker.drain(10);
    // Charged about 9 March, but for the period that began at the old end: never 9 March → 9 April, never → 28 March.
    expect(await renewals(postponed.subscriptionId)).toEqual([expect.objectContaining({
      attempt: 1, periodStart: at("2027-02-28T10:00:00.000Z"), periodEnd: at("2027-03-31T10:00:00.000Z"), totalMicros: 23_600_000
    })]);
    await expectPaidThrough(postponed, "2027-03-31T10:00:00.000Z");

    await renewOnce(monthly.subscriptionId);
    await expectPaidThrough(monthly, "2027-04-30T10:00:00.000Z");
    await renewOnce(monthly.subscriptionId);
    await expectPaidThrough(monthly, "2027-05-31T10:00:00.000Z");
    const charged = await renewals(monthly.subscriptionId);
    expect(charged.map((charge) => [charge.attempt, charge.periodStart.toISOString(), charge.periodEnd.toISOString()])).toEqual([
      [1, "2027-02-28T10:00:00.000Z", "2027-03-31T10:00:00.000Z"],
      [1, "2027-03-31T10:00:00.000Z", "2027-04-30T10:00:00.000Z"],
      [1, "2027-04-30T10:00:00.000Z", "2027-05-31T10:00:00.000Z"]
    ]);
    // Each period starts where the last one ended, beginning at the activation's own period end.
    for (let index = 1; index < charged.length; index += 1) {
      expect(charged[index]!.periodStart).toEqual(charged[index - 1]!.periodEnd);
    }
    h.tax.rateOverride.clear();
  });

  it("renews a plan activated on 31 January of a leap year on 29 February, then 31 March and 30 April", async () => {
    h.clock.now = at("2028-01-31T10:00:00.000Z");
    const leap = await h.activate();
    expect(await h.periodEndOf(leap.subscriptionId)).toEqual(at("2028-02-29T10:00:00.000Z"));
    await renewOnce(leap.subscriptionId);
    await expectPaidThrough(leap, "2028-03-31T10:00:00.000Z");
    await renewOnce(leap.subscriptionId);
    await expectPaidThrough(leap, "2028-04-30T10:00:00.000Z");
    expect((await renewals(leap.subscriptionId)).map((charge) => [charge.periodStart.toISOString(), charge.periodEnd.toISOString()])).toEqual([
      ["2028-02-29T10:00:00.000Z", "2028-03-31T10:00:00.000Z"],
      ["2028-03-31T10:00:00.000Z", "2028-04-30T10:00:00.000Z"]
    ]);
  });
});
