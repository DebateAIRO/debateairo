import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type Pool } from "@debateai/db";
import { foldSubscription } from "@debateai/billing-core";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testBillingPolicy } from "../support/billingFixtures.js";
import {
  recordingAudit, seedActiveSubscription, seedPaidUpgrade, TEST_PUBLIC_APP_URL
} from "../support/billingSubscriptionFixtures.js";
import { recordDisputeOutcome, type DisputeStores } from "../../apps/api/src/billing/dispute-cli.js";
import { BillingMaintenance, type MaintenanceDeps } from "../../apps/api/src/billing/maintenance.js";
import { openBillingOperatorPool } from "../../apps/api/src/billing/operator-connection.js";
import { chargeEvent, subscriptionEvent } from "../../apps/api/src/billing/rows.js";

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
    const resolved = (await new BillingRepository(database.pool).charge(seeded.initialChargeId))!.events
      .filter((event) => event.kind === "CHARGEBACK_RESOLVED").map((event) => event.xmoneyTransactionId);
    expect(resolved).toEqual([seeded.initialTransactionId]);
  }, 10_000);

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
