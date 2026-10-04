import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type Pool } from "@debateai/db";
import { foldSubscription } from "@debateai/billing-core";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testBillingPolicy } from "../support/billingFixtures.js";
import {
  recordingAudit, seedActiveSubscription, seedPaidUpgrade, subscriptionDeps, TEST_PUBLIC_APP_URL
} from "../support/billingSubscriptionFixtures.js";
import { startBillingHarness, type BillingHarness } from "../support/billingHarness.js";
import { recordDisputeOutcome, type DisputeStores } from "../../apps/api/src/billing/dispute-cli.js";
import { BillingMaintenance, type MaintenanceDeps } from "../../apps/api/src/billing/maintenance.js";
import { openBillingOperatorPool } from "../../apps/api/src/billing/operator-connection.js";
import { chargeEvent, subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { cancelForOwner, revokeCancelForOwner } from "../../apps/api/src/billing/subscription-actions.js";

let database: TestDatabase;
/** The command's own pool, opened the way `pnpm billing:dispute` opens it (two connections, bounded waits). */
let operator: Pool;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  operator = await openBillingOperatorPool(database.connectionString, { production: false, readOnly: false, max: 2 });
}, 120_000);
afterAll(async () => {
  await operator?.end();
  await database?.stop();
});

const DAY = 86_400_000;

/** What VERIFY_PAYMENT (P9c, A9, R-33) leaves after a charge-back: CHARGEBACK, SUSPENDED and a FREE entitlement. */
async function disputed(
  planId: "PLUS" | "PRO" = "PRO",
  beforeChargeback?: (seeded: Awaited<ReturnType<typeof seedActiveSubscription>>) => Promise<void>,
  activatedAt: Date = new Date(Date.now() - 5 * DAY)
) {
  const seeded = await seedActiveSubscription(database.pool, {
    ownerRef: randomUUID(), planId, activatedAt, taxCountry: "DE"
  });
  if (beforeChargeback !== undefined) await beforeChargeback(seeded);
  const billing = new BillingRepository(database.pool);
  await billing.withTransaction(async (client) => {
    await billing.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "CHARGEBACK", new Date(), {
      xmoneyTransactionId: seeded.initialTransactionId, amountMicros: seeded.totalMicros, errorCode: null
    }));
    const state = foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId));
    await billing.appendSubscriptionEvent(client, subscriptionEvent(state, "SUSPENDED", new Date(), {
      charge_id: seeded.initialChargeId
    }));
    await new EntitlementRepository(database.pool).append(client, {
      ownerRef: seeded.ownerRef, planId: "FREE", periodAnchorAt: new Date(), cause: "SUSPENDED_CHARGEBACK",
      effectiveAt: new Date(), subscriptionId: seeded.subscriptionId, paidThrough: null, monthCreditOverrideMicros: null
    });
  });
  return seeded;
}

const stores = (): DisputeStores => Object.freeze({
  billing: new BillingRepository(operator), jobs: new BillingJobQueries(operator),
  entitlements: new EntitlementRepository(operator), clock: () => new Date()
});

describe("P14b dispute outcomes on real PostgreSQL, through the command's own pool", () => {
  it("resumes the plan when the dispute is won, once", async () => {
    const seeded = await disputed();
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("RESUMED");
    const billing = new BillingRepository(database.pool);
    expect(foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId)).status).toBe("ACTIVE");
    expect((await billing.charge(seeded.initialChargeId))!.events.at(-1)).toMatchObject({
      kind: "CHARGEBACK_RESOLVED", xmoneyTransactionId: seeded.initialTransactionId
    });
    expect(await new EntitlementRepository(database.pool).current(seeded.ownerRef, new Date())).toMatchObject({
      planId: "PRO", cause: "RESUMED", periodAnchorAt: seeded.periodStart, paidThrough: seeded.periodEnd
    });
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("ALREADY_SETTLED");
  }, 10_000);

  it("gives back the period's own credit after a won dispute: an upgrade's prorated override (A6)", async () => {
    const seeded = await disputed("PLUS", (plus) => seedPaidUpgrade(database.pool, plus, {
      at: new Date(Date.now() - DAY), netMicros: 15_000_000, taxMicros: 2_850_000, transactionId: "7710001",
      monthCreditOverrideMicros: 12_500_000
    }).then(() => undefined));
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("RESUMED");
    expect(await new EntitlementRepository(database.pool).current(seeded.ownerRef, new Date())).toMatchObject({
      planId: "PRO", cause: "RESUMED", monthCreditOverrideMicros: 12_500_000
    });
  }, 10_000);

  it("ends the plan when the dispute is lost, once", async () => {
    const seeded = await disputed();
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "lost" })).toBe("ENDED_DISPUTE");
    const state = foldSubscription(await new BillingRepository(database.pool).subscriptionEvents(seeded.subscriptionId));
    expect(state).toMatchObject({ status: "ENDED", endedCause: "DISPUTE" });
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "lost" })).toBe("ALREADY_SETTLED");
  }, 10_000);

  it("never resumes a suspension whose paid period is over, even before the sweep, and the sweep then ends it (A8b)", async () => {
    // ACTIVATED 33 days ago, so the period ended a few days ago; the renewal failed (PAST_DUE), then the bank took
    // the money back (SUSPENDED). The owner records the won dispute before P11b's next period-end sweep.
    const repository = new BillingRepository(database.pool);
    const seeded = await disputed("PRO", async (paid) => {
      const state = foldSubscription(await repository.subscriptionEvents(paid.subscriptionId));
      await repository.withTransaction((client) => repository.appendSubscriptionEvent(client,
        subscriptionEvent(state, "PAST_DUE", new Date(paid.periodEnd.getTime() + 60_000), { attempt: 1 })));
    }, new Date(Date.now() - 33 * DAY));
    expect(seeded.periodEnd.getTime()).toBeLessThan(Date.now());
    expect(foldSubscription(await repository.subscriptionEvents(seeded.subscriptionId)).status).toBe("SUSPENDED");
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("RESOLVED_AFTER_END");
    // The money is recorded as won back; the plan is neither resumed nor given a paid entitlement for an ended period.
    expect((await repository.charge(seeded.initialChargeId))!.events.at(-1)).toMatchObject({
      kind: "CHARGEBACK_RESOLVED", xmoneyTransactionId: seeded.initialTransactionId
    });
    const kinds = (await repository.subscriptionEvents(seeded.subscriptionId)).map((event) => event.kind);
    expect(kinds).not.toContain("RESUMED");
    expect(foldSubscription(await repository.subscriptionEvents(seeded.subscriptionId)).status).toBe("SUSPENDED");
    expect(await new EntitlementRepository(database.pool).current(seeded.ownerRef, new Date())).toMatchObject({
      planId: "FREE", cause: "SUSPENDED_CHARGEBACK"
    });
    // P11b's next maintenance pass ends it as a dispute (its renewal stand-in throws: nothing here may renew).
    const neverRenews = new Proxy({}, {
      get: () => async () => { throw new Error("the dispute test never renews"); }
    }) as MaintenanceDeps["renewal"];
    await new BillingMaintenance({
      repository, jobs: new BillingJobQueries(database.pool), entitlements: new EntitlementRepository(database.pool),
      renewal: neverRenews, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL,
      xmoneyEnvironment: seeded.xmoneyEnvironment, audit: recordingAudit(), clock: () => new Date()
    }).runOnce();
    expect(foldSubscription(await repository.subscriptionEvents(seeded.subscriptionId))).toMatchObject({
      status: "ENDED", endedCause: "DISPUTE"
    });
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("ALREADY_SETTLED");
  }, 20_000);

  it("settles a second payment's charge-back on its own transaction and never touches the plan (D5 5f)", async () => {
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(Date.now() - 2 * DAY), taxCountry: "RO"
    });
    const billing = new BillingRepository(database.pool);
    // P9b's record of the order paid twice (refunded by RefundDesk), then the card holder's bank took it back too:
    // P9c records the charge-back on the same charge and changes no subscription.
    await billing.withTransaction(async (client) => {
      await billing.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "DUPLICATE_PAYMENT", new Date(), {
        xmoneyTransactionId: "7719001", amountMicros: seeded.totalMicros, errorCode: null
      }));
      await billing.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "CHARGEBACK", new Date(), {
        xmoneyTransactionId: "7719001", amountMicros: seeded.totalMicros, errorCode: "DUPLICATE_PAYMENT"
      }));
    });
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "lost" })).toBe("SECOND_PAYMENT");
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("SECOND_PAYMENT");
    const events = (await billing.charge(seeded.initialChargeId))!.events;
    expect(events.filter((event) => event.kind === "CHARGEBACK_RESOLVED").map((event) => event.xmoneyTransactionId))
      .toEqual(["7719001"]);
    expect(foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId)).status).toBe("ACTIVE");
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("ALREADY_SETTLED");
  }, 10_000);

  it("resolves the plan's own charge-back first when a newer one of a second payment is open on the same charge", async () => {
    const seeded = await disputed("PLUS");
    const repository = new BillingRepository(database.pool);
    // After the plan's own charge-back: a second payment of the order, charged back as well (the newest CHARGEBACK).
    await repository.withTransaction(async (client) => {
      await repository.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "DUPLICATE_PAYMENT", new Date(), {
        xmoneyTransactionId: "7719101", amountMicros: seeded.totalMicros, errorCode: null
      }));
      await repository.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "CHARGEBACK", new Date(), {
        xmoneyTransactionId: "7719101", amountMicros: seeded.totalMicros, errorCode: "DUPLICATE_PAYMENT"
      }));
    });
    // The dispute that suspended the plan is the one on the first payment, whatever came after it.
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("RESUMED");
    const resolvedTransactions = async () => (await new BillingRepository(database.pool).charge(seeded.initialChargeId))!
      .events.filter((event) => event.kind === "CHARGEBACK_RESOLVED").map((event) => event.xmoneyTransactionId);
    expect(await resolvedTransactions()).toEqual([seeded.initialTransactionId]);
    // The next call settles the one still open, the second payment's; once both are settled nothing is left.
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("SECOND_PAYMENT");
    expect(await resolvedTransactions()).toEqual([seeded.initialTransactionId, "7719101"]);
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("ALREADY_SETTLED");
    expect(foldSubscription(await repository.subscriptionEvents(seeded.subscriptionId)).status).toBe("ACTIVE");
  }, 10_000);

  it("settles two second payments' charge-backs on one charge one after the other (D5 5f)", async () => {
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(Date.now() - 2 * DAY), taxCountry: "RO"
    });
    const billing = new BillingRepository(database.pool);
    await billing.withTransaction(async (client) => {
      for (const transactionId of ["7719201", "7719202"]) {
        await billing.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "DUPLICATE_PAYMENT", new Date(), {
          xmoneyTransactionId: transactionId, amountMicros: seeded.totalMicros, errorCode: null
        }));
        await billing.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "CHARGEBACK", new Date(), {
          xmoneyTransactionId: transactionId, amountMicros: seeded.totalMicros, errorCode: "DUPLICATE_PAYMENT"
        }));
      }
    });
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("SECOND_PAYMENT");
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("SECOND_PAYMENT");
    const resolved = (await billing.charge(seeded.initialChargeId))!.events
      .filter((event) => event.kind === "CHARGEBACK_RESOLVED").map((event) => event.xmoneyTransactionId);
    expect([...resolved].sort()).toEqual(["7719201", "7719202"]);
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" })).toBe("ALREADY_SETTLED");
    expect(foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId)).status).toBe("ACTIVE");
  }, 10_000);

  it("refuses a won outcome it cannot place once the plan's own dispute was lost and a second payment's is open", async () => {
    const seeded = await disputed("PLUS");
    const billing = new BillingRepository(database.pool);
    await billing.withTransaction(async (client) => {
      await billing.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "DUPLICATE_PAYMENT", new Date(), {
        xmoneyTransactionId: "7719301", amountMicros: seeded.totalMicros, errorCode: null
      }));
      await billing.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "CHARGEBACK", new Date(), {
        xmoneyTransactionId: "7719301", amountMicros: seeded.totalMicros, errorCode: "DUPLICATE_PAYMENT"
      }));
    });
    expect(await recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "lost" })).toBe("ENDED_DISPUTE");
    // A lost outcome writes no charge event, so the plan's own charge-back still reads open: this won may be about
    // either dispute. Nothing is written.
    await expect(recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" }))
      .rejects.toThrow("BILLING_DISPUTE_AMBIGUOUS");
    expect((await billing.charge(seeded.initialChargeId))!.events.some((event) => event.kind === "CHARGEBACK_RESOLVED"))
      .toBe(false);
    expect(foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId))).toMatchObject({
      status: "ENDED", endedCause: "DISPUTE"
    });
  }, 10_000);

  it("keeps the plan paused while another payment of the subscription is still charged back (spec 1.3, A9)", async () => {
    const billing = new BillingRepository(database.pool);
    const entitlements = new EntitlementRepository(database.pool);
    // The usual stolen-card case: the first payment and its upgrade are both charged back. P9c suspends on the first
    // and, the plan being SUSPENDED already, writes only the CHARGEBACK row for the upgrade's.
    const seedBoth = async (transactionId: string) => {
      let upgradeChargeId = "";
      const seeded = await disputed("PLUS", async (plus) => {
        upgradeChargeId = (await seedPaidUpgrade(database.pool, plus, {
          at: new Date(Date.now() - DAY), netMicros: 15_000_000, taxMicros: 2_850_000, transactionId,
          monthCreditOverrideMicros: 12_500_000
        })).chargeId;
      });
      await billing.withTransaction((client) => billing.appendChargeEvent(client, chargeEvent(upgradeChargeId,
        "CHARGEBACK", new Date(), { xmoneyTransactionId: transactionId, amountMicros: 17_850_000, errorCode: null })));
      return { seeded, upgradeChargeId };
    };

    const lostLater = await seedBoth("7719401");
    expect(await recordDisputeOutcome(stores(), { chargeRef: lostLater.seeded.initialChargeId, outcome: "won" }))
      .toBe("STILL_DISPUTED");
    expect(foldSubscription(await billing.subscriptionEvents(lostLater.seeded.subscriptionId)).status).toBe("SUSPENDED");
    expect((await billing.subscriptionEvents(lostLater.seeded.subscriptionId)).map((event) => event.kind)).not.toContain("RESUMED");
    expect(await entitlements.current(lostLater.seeded.ownerRef, new Date())).toMatchObject({
      planId: "FREE", cause: "SUSPENDED_CHARGEBACK"
    });
    // The other dispute is lost: one lost dispute ends a SUSPENDED plan.
    expect(await recordDisputeOutcome(stores(), { chargeRef: lostLater.upgradeChargeId, outcome: "lost" })).toBe("ENDED_DISPUTE");
    expect(foldSubscription(await billing.subscriptionEvents(lostLater.seeded.subscriptionId))).toMatchObject({
      status: "ENDED", endedCause: "DISPUTE"
    });

    const wonBoth = await seedBoth("7719402");
    expect(await recordDisputeOutcome(stores(), { chargeRef: wonBoth.seeded.initialChargeId, outcome: "won" }))
      .toBe("STILL_DISPUTED");
    expect(await recordDisputeOutcome(stores(), { chargeRef: wonBoth.upgradeChargeId, outcome: "won" })).toBe("RESUMED");
    expect(foldSubscription(await billing.subscriptionEvents(wonBoth.seeded.subscriptionId)).status).toBe("ACTIVE");
    expect(await entitlements.current(wonBoth.seeded.ownerRef, new Date())).toMatchObject({
      planId: "PRO", cause: "RESUMED", monthCreditOverrideMicros: 12_500_000
    });
  }, 20_000);

  it("refuses a charge that has no chargeback, and one that does not exist", async () => {
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(Date.now() - DAY), taxCountry: "RO"
    });
    await expect(recordDisputeOutcome(stores(), { chargeRef: seeded.initialChargeId, outcome: "won" }))
      .rejects.toThrow("BILLING_DISPUTE_NO_CHARGEBACK");
    await expect(recordDisputeOutcome(stores(), { chargeRef: "f".repeat(32), outcome: "won" }))
      .rejects.toThrow("BILLING_DISPUTE_CHARGE_NOT_FOUND");
  });
});

/**
 * P2-W10, the owner's ruling of 3 October 2026: a plan paused by a card dispute can be cancelled by its person, with no
 * further renewal; if the dispute is won, the plan ends at its period end instead of renewing. Through the whole fake
 * stack: the payment's charge-back reaches VERIFY_PAYMENT (SUSPENDED + Free), the person cancels in Settings, the owner
 * records the outcome, and P11a's renewal tick and P11b's maintenance pass run at the period end.
 */
describe("P2-W10 a plan cancelled while a card dispute pauses it, on the fake stack", () => {
  let h: BillingHarness;
  beforeAll(async () => { h = await startBillingHarness(); }, 120_000);
  afterAll(async () => { await h?.stop(); });

  const MINUTE = 60_000;
  const harnessStores = (): DisputeStores => Object.freeze({
    billing: h.repository, jobs: h.jobs, entitlements: h.entitlements, clock: () => h.clock.now
  });
  const settingsDeps = () => subscriptionDeps(h.database.pool, { recordsKey: h.recordsKey, tax: h.tax, clock: h.clock.read });
  const folded = async (subscriptionId: string) => foldSubscription(await h.repository.subscriptionEvents(subscriptionId));
  const renewalCharges = async (subscriptionId: string) => (await h.repository.chargesForSubscription(subscriptionId))
    .filter((charge) => charge.kind === "RENEWAL");

  /** A paid plan whose payment the bank took back: SUSPENDED, paid features paused. */
  async function pausedByDispute() {
    const paid = await h.activate();
    h.xmoney.setStatus(paid.transaction.transactionId, "charge-back");
    await h.settle(paid.transaction.transactionId);
    expect(await folded(paid.subscriptionId)).toMatchObject({ status: "SUSPENDED", cancelRequested: false });
    return paid;
  }

  /** One minute past the paid period's end: the renewal tick, then the period-end sweep. */
  async function pastPeriodEnd(subscriptionId: string): Promise<void> {
    h.clock.now = new Date((await h.periodEndOf(subscriptionId)).getTime() + MINUTE);
    await h.renewal.runOnce();
    await h.maintenance.runOnce();
  }

  it("won: the plan resumes with the cancel still pending, then ends at its period end and is never renewed", async () => {
    const paid = await pausedByDispute();
    await cancelForOwner(settingsDeps(), paid.ownerRef);
    expect(await folded(paid.subscriptionId)).toMatchObject({ status: "SUSPENDED", cancelRequested: true });
    expect(await recordDisputeOutcome(harnessStores(), { chargeRef: paid.chargeId, outcome: "won" })).toBe("RESUMED");
    // RESUMED keeps the cancel: the paid features come back until the period end, and no renewal follows.
    expect(await folded(paid.subscriptionId)).toMatchObject({ status: "ACTIVE", cancelRequested: true });
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "PLUS", cause: "RESUMED" });
    await pastPeriodEnd(paid.subscriptionId);
    expect(await folded(paid.subscriptionId)).toMatchObject({ status: "ENDED", endedCause: "CANCEL" });
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });
    h.clock.advance(10 * MINUTE);
    await h.renewal.runOnce();
    expect(await renewalCharges(paid.subscriptionId)).toEqual([]);
    expect(h.xmoney.rebillsFor(paid.transaction.orderId)).toBe(0);
  }, 30_000);

  it("lost: a plan cancelled while paused ends as a dispute", async () => {
    const paid = await pausedByDispute();
    await cancelForOwner(settingsDeps(), paid.ownerRef);
    expect(await recordDisputeOutcome(harnessStores(), { chargeRef: paid.chargeId, outcome: "lost" })).toBe("ENDED_DISPUTE");
    expect(await folded(paid.subscriptionId)).toMatchObject({ status: "ENDED", endedCause: "DISPUTE" });
    expect(await renewalCharges(paid.subscriptionId)).toEqual([]);
  }, 30_000);

  it("the undo stays refused while paused, and works again once a won dispute resumes the plan (C5)", async () => {
    const paid = await pausedByDispute();
    await cancelForOwner(settingsDeps(), paid.ownerRef);
    await expect(revokeCancelForOwner(settingsDeps(), paid.ownerRef)).rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
    expect(await folded(paid.subscriptionId)).toMatchObject({ status: "SUSPENDED", cancelRequested: true });
    expect(await recordDisputeOutcome(harnessStores(), { chargeRef: paid.chargeId, outcome: "won" })).toBe("RESUMED");
    await revokeCancelForOwner(settingsDeps(), paid.ownerRef);
    expect(await folded(paid.subscriptionId)).toMatchObject({ status: "ACTIVE", cancelRequested: false });
  }, 30_000);

  it("control: a won dispute without a cancel still renews at the period end", async () => {
    const paid = await pausedByDispute();
    expect(await recordDisputeOutcome(harnessStores(), { chargeRef: paid.chargeId, outcome: "won" })).toBe("RESUMED");
    await pastPeriodEnd(paid.subscriptionId);
    expect(await renewalCharges(paid.subscriptionId)).toHaveLength(1);
    expect(h.xmoney.rebillsFor(paid.transaction.orderId)).toBe(1);
    expect((await folded(paid.subscriptionId)).status).not.toBe("ENDED");
  }, 30_000);
});
