import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type Pool } from "@debateai/db";
import { foldSubscription, microsToDecimal, withdrawalRefundMicros } from "@debateai/billing-core";
import { planById } from "@debateai/register";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testBillingPlans, testBillingPolicy } from "../support/billingFixtures.js";
import {
  recordingAudit,
  seedActiveSubscription,
  seedPaidUpgrade,
  type SeededSubscription
} from "../support/billingSubscriptionFixtures.js";
import { openBillingOperatorPool } from "../../apps/api/src/billing/operator-connection.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { chargeEvent } from "../../apps/api/src/billing/rows.js";
import { withdrawalOpenUntil } from "../../apps/api/src/billing/subscription-view.js";
import {
  parseWithdrawArguments,
  recordOwnerWithdrawal,
  runWithdrawCommand,
  settleOwnerWithdrawal,
  withdrawStoresFor
} from "../../apps/api/src/billing/withdraw-cli.js";

let database: TestDatabase;
/** The command's own pool, opened the way `pnpm billing:withdraw` opens it (two connections, bounded waits). */
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
const stores = (audit = recordingAudit()) => withdrawStoresFor(operator, {
  policy: testBillingPolicy, plans: testBillingPlans, audit, clock: () => new Date()
});
const rows = () => new BillingRepository(database.pool);

const m8Of = async (subscriptionId: string) => (await database.pool.query<{ payload: Record<string, unknown> }>(
  "SELECT payload FROM billing.outbox WHERE kind='EMAIL' AND ref=$1", [`M8:${subscriptionId}`]
)).rows;

const withdrawalRequests = async (chargeId: string) => ((await rows().charge(chargeId))?.events ?? [])
  .filter((event) => event.kind === "REFUND_REQUESTED" && event.errorCode === "WITHDRAWAL")
  .map((event) => [event.xmoneyTransactionId, event.amountMicros]);

/** P9c's record of a refund made in the xMoney dashboard on the first payment: its true amount is unknown. */
async function dashboardRefund(seeded: SeededSubscription, at: Date): Promise<void> {
  const repository = rows();
  await repository.withTransaction(async (client) => {
    for (const kind of ["REFUND_REQUESTED", "REFUNDED"] as const) {
      await repository.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, kind, at, {
        xmoneyTransactionId: seeded.initialTransactionId, amountMicros: 5_000_000, errorCode: "PROVIDER_REFUND"
      }));
    }
  });
}

/** The API's outbox worker moving this charge's XMONEY_REFUND jobs, with an xMoney that refunds every call. */
async function moveRefunds(chargeId: string): Promise<void> {
  const desk = new RefundDesk({
    repository: rows(), jobs: new BillingJobQueries(database.pool),
    xmoney: {
      refund: async () => undefined,
      getTransaction: async () => { throw new TypedDomainError("XMONEY_UNAVAILABLE", "not read at attempt 1"); },
      listTransactions: async () => { throw new TypedDomainError("XMONEY_UNAVAILABLE", "not listed at attempt 1"); }
    },
    policy: testBillingPolicy, audit: recordingAudit(), clock: () => new Date()
  });
  const claimed = await rows().claim(["XMONEY_REFUND"], 50, "p14c-test", new Date());
  for (const job of claimed.filter((candidate) => candidate.ref.startsWith(`${chargeId}:`))) {
    expect(await desk.handle(job, new Date())).toEqual({ kind: "DONE" });
  }
}

describe("P14c a withdrawal the person sent by email, carried out by the owner's command", () => {
  it("records it as of the instant it arrived and refunds through RefundDesk, M8 after the refund", async () => {
    const now = new Date();
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 20 * DAY), taxCountry: "RO"
    });
    const receivedAt = new Date(seeded.periodStart.getTime() + 12 * DAY);
    // Settings could no longer take it (the window has closed since), but it was open when the email arrived.
    const state = foldSubscription(await rows().subscriptionEvents(seeded.subscriptionId));
    expect(withdrawalOpenUntil({ state, taxCountry: "RO", policy: testBillingPolicy, now })).toBeNull();
    const expected = withdrawalRefundMicros({
      paidTotalMicros: seeded.totalMicros, periodStart: seeded.periodStart, periodEnd: seeded.periodEnd,
      now: receivedAt, creditSpentMicros: 0, monthlyCreditMicros: planById(testBillingPlans, "PLUS").monthlyCreditMicros
    });
    expect(expected).toBeGreaterThan(0);
    expect(await recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt }))
      .toEqual({ kind: "REFUNDING", refundMicros: expected });
    expect((await rows().subscriptionEvents(seeded.subscriptionId)).at(-1)).toMatchObject({
      kind: "WITHDRAWN", data: { refund_micros: expected, source: "OWNER", withdrew_at: receivedAt.toISOString() }
    });
    expect(await new EntitlementRepository(database.pool).current(seeded.ownerRef, new Date()))
      .toMatchObject({ planId: "FREE", cause: "ENDED_WITHDRAWAL" });
    expect(await withdrawalRequests(seeded.initialChargeId)).toEqual([[seeded.initialTransactionId, expected]]);
    expect(await m8Of(seeded.subscriptionId)).toEqual([]);
    await moveRefunds(seeded.initialChargeId);
    expect((await m8Of(seeded.subscriptionId))[0]?.payload)
      .toMatchObject({ "param.refundAmount": microsToDecimal(expected), "param.plan": "PLUS" });
    // Once recorded, a second statement is refused like a second click.
    await expect(recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt }))
      .rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
  }, 10_000);

  it("runs P12d's withdrawal as of the command's own clock for `--owner <ref>` alone (R2 Q-9)", async () => {
    const at = new Date();
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(at.getTime() - 2 * DAY), taxCountry: "RO"
    });
    const audit = recordingAudit();
    const clocked = withdrawStoresFor(operator, { policy: testBillingPolicy, plans: testBillingPlans, audit, clock: () => at });
    expect(await runWithdrawCommand(clocked, parseWithdrawArguments(["--owner", seeded.ownerRef])))
      .toMatchObject({ kind: "REFUNDING" });
    expect((await rows().subscriptionEvents(seeded.subscriptionId)).at(-1)).toMatchObject({
      kind: "WITHDRAWN", data: { source: "OWNER", withdrew_at: at.toISOString() }
    });
    // Owner-run and audited: the same content-free line as a Settings withdrawal, with its source.
    expect(audit.events).toContainEqual({ event: "billing.withdrawal", fields: { refunds: 1, source: "OWNER" } });
  }, 10_000);

  it("refuses a statement that arrived after the window closed or is dated ahead, and settles nothing not handed over", async () => {
    const now = new Date();
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 20 * DAY), taxCountry: "DE"
    });
    // Day 19 after the activation: past the 14 calendar days (R2 Q-6) in any time zone.
    await expect(recordOwnerWithdrawal(stores(), {
      ownerRef: seeded.ownerRef, receivedAt: new Date(seeded.periodStart.getTime() + 19 * DAY)
    })).rejects.toMatchObject({ code: "WITHDRAWAL_WINDOW_CLOSED" });
    await expect(recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt: new Date(now.getTime() + 60_000) }))
      .rejects.toThrow("BILLING_WITHDRAW_RECEIVED_IN_FUTURE");
    await expect(recordOwnerWithdrawal(stores(), { ownerRef: randomUUID(), receivedAt: new Date(now.getTime() - DAY) }))
      .rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
    await expect(settleOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, refundMicros: 1_000_000, dashboardMicros: 0 }))
      .rejects.toThrow("BILLING_WITHDRAW_NOT_AWAITING_OWNER");
    expect(foldSubscription(await rows().subscriptionEvents(seeded.subscriptionId)).status).toBe("ACTIVE");
  }, 10_000);

  it("hands a withdrawal over a dashboard-refunded payment to the owner, then refunds what the owner names and M8 says the whole", async () => {
    const now = new Date();
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 3 * DAY), taxCountry: "RO"
    });
    const upgrade = await seedPaidUpgrade(database.pool, seeded, {
      at: new Date(now.getTime() - 2 * DAY), netMicros: 15_000_000, taxMicros: 3_150_000, transactionId: "7720001",
      monthCreditOverrideMicros: 12_500_000
    });
    await dashboardRefund(seeded, new Date(now.getTime() - DAY));
    expect(await recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt: new Date(now.getTime() - 60_000) }))
      .toEqual({ kind: "OWNER_REVIEW" });
    expect((await rows().subscriptionEvents(seeded.subscriptionId)).at(-1)).toMatchObject({
      kind: "WITHDRAWN", data: { refund_micros: null, refund_by_owner: true, source: "OWNER" }
    });
    expect(await withdrawalRequests(upgrade.chargeId)).toEqual([]);
    expect(await m8Of(seeded.subscriptionId)).toEqual([]);
    expect(await rows().withdrawalsAwaitingOwner()).toEqual(expect.arrayContaining([expect.objectContaining({
      ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, planId: "PRO"
    })]));
    // More than the untouched payments still hold: the rest is the dashboard's, and nothing is written.
    await expect(settleOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, refundMicros: 999_000_000, dashboardMicros: 0 }))
      .rejects.toMatchObject({ code: "REFUND_EXCEEDS_CHARGE" });
    expect(await rows().withdrawalOwnerSettlement(seeded.subscriptionId)).toBeNull();
    const audit = recordingAudit();
    // 3.00 through RefundDesk, and 5.00 the owner refunded in the dashboard for this withdrawal.
    expect(await settleOwnerWithdrawal(stores(audit), { ownerRef: seeded.ownerRef, refundMicros: 3_000_000, dashboardMicros: 5_000_000 }))
      .toEqual({ kind: "SETTLED", refundMicros: 3_000_000, dashboardMicros: 5_000_000 });
    // Only the payment no dashboard refund touched takes it; the touched one is the owner's to judge.
    expect(await withdrawalRequests(upgrade.chargeId)).toEqual([["7720001", 3_000_000]]);
    expect(await withdrawalRequests(seeded.initialChargeId)).toEqual([]);
    expect(await rows().withdrawalOwnerSettlement(seeded.subscriptionId)).toMatchObject({ dashboardRefundMicros: 5_000_000 });
    expect(audit.events).toContainEqual({ event: "billing.withdrawal.settled", fields: { refunds: 1 } });
    expect(await rows().withdrawalsAwaitingOwner(seeded.ownerRef)).toEqual([]);
    await expect(settleOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, refundMicros: 1_000_000, dashboardMicros: 0 }))
      .rejects.toThrow("BILLING_WITHDRAW_NOT_AWAITING_OWNER");
    // M8 waits for the money to move, then names the whole refund: both parts.
    expect(await m8Of(seeded.subscriptionId)).toEqual([]);
    await moveRefunds(upgrade.chargeId);
    expect((await m8Of(seeded.subscriptionId))[0]?.payload).toMatchObject({ "param.refundAmount": "8.00", "param.plan": "PRO" });
  }, 10_000);

  it("settles a refund made wholly in the dashboard: M8 at once for that amount, and a second settlement is refused", async () => {
    const now = new Date();
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 2 * DAY), taxCountry: "RO"
    });
    // A partial dashboard refund touched the only payment; the owner refunds the rest there too, by hand.
    await dashboardRefund(seeded, new Date(now.getTime() - DAY));
    expect(await recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt: new Date(now.getTime() - 60_000) }))
      .toEqual({ kind: "OWNER_REVIEW" });
    // A figure above what the withdrawal's payments took is a typo: refused, and nothing is written.
    await expect(runWithdrawCommand(stores(), parseWithdrawArguments(["--owner", seeded.ownerRef, "--refund", "0.00", "--dashboard", "99.00"])))
      .rejects.toThrow("BILLING_WITHDRAW_EXCEEDS_PAID");
    expect(await rows().withdrawalOwnerSettlement(seeded.subscriptionId)).toBeNull();
    const settle = parseWithdrawArguments(["--owner", seeded.ownerRef, "--refund", "0.00", "--dashboard", "17.59"]);
    expect(await runWithdrawCommand(stores(), settle)).toEqual({ kind: "SETTLED", refundMicros: 0, dashboardMicros: 17_590_000 });
    // Nothing moves through RefundDesk, so M8 goes now, worded as refunded (D7's `mail.M8.refunded`).
    expect((await m8Of(seeded.subscriptionId))[0]?.payload).toMatchObject({ "param.refundAmount": "17.59", "param.plan": "PLUS" });
    expect(await withdrawalRequests(seeded.initialChargeId)).toEqual([]);
    expect(await rows().withdrawalsAwaitingOwner(seeded.ownerRef)).toEqual([]);
    await expect(runWithdrawCommand(stores(), settle)).rejects.toThrow("BILLING_WITHDRAW_NOT_AWAITING_OWNER");
    expect(await m8Of(seeded.subscriptionId)).toHaveLength(1);
  }, 10_000);

  it("settles with nothing refunded by either part: M8 at once for 0.00 (the nothing-due wording), and the withdrawal leaves the owner's list", async () => {
    const now = new Date();
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 2 * DAY), taxCountry: "RO"
    });
    await dashboardRefund(seeded, new Date(now.getTime() - DAY));
    expect(await recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt: new Date(now.getTime() - 60_000) }))
      .toEqual({ kind: "OWNER_REVIEW" });
    // `--refund 0.00` with no dashboard part.
    expect(await runWithdrawCommand(stores(), parseWithdrawArguments(["--owner", seeded.ownerRef, "--refund", "0.00"])))
      .toEqual({ kind: "SETTLED", refundMicros: 0, dashboardMicros: 0 });
    expect((await m8Of(seeded.subscriptionId))[0]?.payload).toMatchObject({ "param.refundAmount": "0.00" });
    expect(await rows().withdrawalsAwaitingOwner(seeded.ownerRef)).toEqual([]);
  }, 10_000);
});
