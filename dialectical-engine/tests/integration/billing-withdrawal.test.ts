import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { BillingJobQueries, BillingRepository, createPool, EntitlementRepository, migrate, type OutboxJob } from "@debateai/db";
import { foldSubscription, microsToDecimal, withdrawalRefundMicros } from "@debateai/billing-core";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { testBillingPolicy } from "../support/billingFixtures.js";
import {
  mountSubscriptionRoutes,
  recordingAudit,
  seedActiveSubscription,
  seedPaidUpgrade,
  seedWithdrawalGrant,
  subscriptionDeps
} from "../support/billingSubscriptionFixtures.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { chargeEvent } from "../../apps/api/src/billing/rows.js";
import { withdraw } from "../../apps/api/src/billing/withdrawal.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const DAY = 86_400_000;

async function start(label: string, input: Readonly<{ activatedDaysAgo: number; taxCountry: string; spentMicros?: number }>) {
  const identity = testHttpIdentity(label);
  const now = new Date();
  const seeded = await seedActiveSubscription(database.pool, {
    ownerRef: identity.authenticated.ownerRef, planId: "PLUS",
    activatedAt: new Date(now.getTime() - input.activatedDaysAgo * DAY), taxCountry: input.taxCountry
  });
  // A fresh 43-character token per test: step_up_grant.token_hash is UNIQUE (0039:12).
  const grant = randomBytes(32).toString("base64url");
  await seedWithdrawalGrant(database.pool, identity, grant);
  const audit = recordingAudit();
  const kick = vi.fn();
  const billing = new BillingRepository(database.pool);
  const deps = subscriptionDeps(database.pool, {
    billing, audit, kick,
    ownerSpend: { readOwnerSpentMicros: async () => input.spentMicros ?? 1_000_000 },
    clock: () => now
  });
  const api = await mountSubscriptionRoutes(deps, identity);
  const withdraw = (token = grant) => api.inject({
    method: "POST", url: "/v1/billing/subscription/withdraw",
    headers: { "x-test-session": identity.rawSessionToken }, payload: { step_up_grant: token }
  });
  return { identity, now, seeded, grant, audit, kick, billing, deps, api, withdraw };
}

const refundRequests = async (billing: BillingRepository, chargeId: string) =>
  (await billing.charge(chargeId))!.events
    .filter((event) => event.kind === "REFUND_REQUESTED")
    .map((event) => [event.xmoneyTransactionId, event.amountMicros, event.errorCode]);

const m8Of = async (subscriptionId: string) => (await database.pool.query<{ payload: Record<string, unknown> }>(
  "SELECT payload FROM billing.outbox WHERE kind='EMAIL' AND ref=$1", [`M8:${subscriptionId}`]
)).rows;

/** The XMONEY_REFUND jobs these refs name, claimed as P7's worker would (attempt 1). */
async function claimRefunds(refs: readonly string[]): Promise<OutboxJob[]> {
  const claimed = await new BillingRepository(database.pool).claim(["XMONEY_REFUND"], 50, "p12d-test", new Date());
  return claimed.filter((job) => refs.includes(job.ref)).sort((left, right) => left.ref.localeCompare(right.ref));
}

/** P9b's desk over the real tables (its lease and the owner lock on the same pool), with an xMoney that refunds (or refuses) every call. */
const deskWith = (refund: () => Promise<void>) => new RefundDesk({
  repository: new BillingRepository(database.pool), jobs: new BillingJobQueries(database.pool),
  xmoney: {
    refund,
    getTransaction: async () => { throw new TypedDomainError("XMONEY_UNAVAILABLE", "not read at attempt 1"); },
    listTransactions: async () => { throw new TypedDomainError("XMONEY_UNAVAILABLE", "not listed at attempt 1"); }
  },
  policy: testBillingPolicy, audit: recordingAudit(), clock: () => new Date()
});

describe("P12d withdrawal on real PostgreSQL", () => {
  it("refunds the unused share across both charges newest first, ends the plan, and sends M8 after the last refund", async () => {
    const run = await start("p12d-happy", { activatedDaysAgo: 1, taxCountry: "RO" });
    const upgrade = await seedPaidUpgrade(database.pool, run.seeded, {
      at: new Date(run.now.getTime() - 12 * 3_600_000), netMicros: 15_000_000, taxMicros: 3_150_000,
      transactionId: "7700123", monthCreditOverrideMicros: 12_500_000
    });
    const expected = withdrawalRefundMicros({
      paidTotalMicros: run.seeded.totalMicros + 18_150_000, periodStart: run.seeded.periodStart,
      periodEnd: run.seeded.periodEnd, now: run.now, creditSpentMicros: 1_000_000, monthlyCreditMicros: 12_500_000
    });
    // Both transactions are needed: the upgrade alone cannot cover the refund.
    expect(expected).toBeGreaterThan(18_150_000);
    const response = await run.withdraw();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ refund: microsToDecimal(expected) });
    const events = await run.billing.subscriptionEvents(run.seeded.subscriptionId);
    expect(events.at(-1)).toMatchObject({ kind: "WITHDRAWN", data: { refund_micros: expected } });
    expect(foldSubscription(events).status).toBe("WITHDRAWN");
    expect(await new EntitlementRepository(database.pool).current(run.identity.authenticated.ownerRef, new Date()))
      .toMatchObject({ planId: "FREE", cause: "ENDED_WITHDRAWAL" });
    // A4(b): the newest transaction (the upgrade) is refunded first, and never beyond what it took.
    expect(await refundRequests(run.billing, upgrade.chargeId)).toEqual([["7700123", 18_150_000, "WITHDRAWAL"]]);
    expect(await refundRequests(run.billing, run.seeded.initialChargeId)).toEqual(
      [[run.seeded.initialTransactionId, expected - 18_150_000, "WITHDRAWAL"]]
    );
    const refs = [`${run.seeded.initialChargeId}:${run.seeded.initialTransactionId}`, `${upgrade.chargeId}:7700123`].sort();
    expect(run.audit.events.map(({ event }) => event)).toContain("billing.withdrawal");
    expect(run.kick).toHaveBeenCalledTimes(1);
    // No "we refunded" email while the money has not moved.
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    const jobs = await claimRefunds(refs);
    expect(jobs.map((job) => job.ref)).toEqual(refs);
    const desk = deskWith(async () => undefined);
    // The upgrade's refund lands first, and xMoney reports it as its own refund transaction naming the payment
    // (D5 5g: REFUNDED on 7700999 with refundsTransactionId 7700123), which the follow-up must still count.
    await desk.recordRefunded({
      chargeId: upgrade.chargeId, transactionId: "7700123", amountMicros: 18_150_000, whole: false,
      ownerRef: run.identity.authenticated.ownerRef, reason: "WITHDRAWAL"
    }, new Date(), "7700999");
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    const initialJob = jobs.find((job) => job.ref.startsWith(`${run.seeded.initialChargeId}:`))!;
    expect(await desk.handle(initialJob, new Date())).toEqual({ kind: "DONE" });
    const m8 = await m8Of(run.seeded.subscriptionId);
    expect(m8).toHaveLength(1);
    expect(m8[0]!.payload).toMatchObject({ "param.refundAmount": microsToDecimal(expected), "param.plan": "PRO" });
    const again = await run.withdraw();
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("NOT_SUBSCRIBED");
    await run.api.close();
  });

  it("never sends M8 for a withdrawal whose refund xMoney refused", async () => {
    const run = await start("p12d-refused", { activatedDaysAgo: 1, taxCountry: "DE" });
    expect((await run.withdraw()).statusCode).toBe(200);
    const [job] = await claimRefunds([`${run.seeded.initialChargeId}:${run.seeded.initialTransactionId}`]);
    const refused = deskWith(async () => { throw new TypedDomainError("XMONEY_REFUSED", "fake refusal"); });
    expect(await refused.handle(job!, new Date())).toEqual({ kind: "DEAD", code: "XMONEY_REFUSED" });
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    await run.api.close();
  });

  it("refuses without a valid grant and writes nothing", async () => {
    const run = await start("p12d-grant", { activatedDaysAgo: 2, taxCountry: "DE" });
    const refused = await run.withdraw("x".repeat(43));
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toBe("STEP_UP_REQUIRED");
    expect(foldSubscription(await run.billing.subscriptionEvents(run.seeded.subscriptionId)).status).toBe("ACTIVE");
    expect(await refundRequests(run.billing, run.seeded.initialChargeId)).toEqual([]);
    expect(run.kick).not.toHaveBeenCalled();
    await run.api.close();
  });

  it("refuses long after 14 days and for a tax country without the withdrawal right", async () => {
    // 25 days: well past the 14 calendar days (R2 Q-6) in any time zone, whatever day the test runs on.
    const late = await start("p12d-late", { activatedDaysAgo: 25, taxCountry: "RO" });
    expect((await late.withdraw()).json().error).toBe("WITHDRAWAL_WINDOW_CLOSED");
    await late.api.close();
    const us = await start("p12d-us", { activatedDaysAgo: 1, taxCountry: "US" });
    const refused = await us.withdraw();
    expect(refused.statusCode).toBe(409);
    expect(refused.json().error).toBe("WITHDRAWAL_WINDOW_CLOSED");
    await us.api.close();
  });

  it("writes no refund intent and sends M8 at once when the whole credit was used", async () => {
    const run = await start("p12d-used", { activatedDaysAgo: 1, taxCountry: "RO", spentMicros: 5_000_000 });
    const response = await run.withdraw();
    expect(response.json()).toEqual({ refund: "0.00" });
    expect(foldSubscription(await run.billing.subscriptionEvents(run.seeded.subscriptionId)).status).toBe("WITHDRAWN");
    expect(await refundRequests(run.billing, run.seeded.initialChargeId)).toEqual([]);
    expect((await m8Of(run.seeded.subscriptionId))[0]?.payload).toMatchObject({ "param.refundAmount": "0.00" });
    expect(run.kick).not.toHaveBeenCalled();
    await run.api.close();
  });

  it("refuses, without spending the grant, when the plan changed between the reads and the lock", async () => {
    const run = await start("p12d-raced", { activatedDaysAgo: 1, taxCountry: "RO" });
    // An upgrade settles while the withdrawal is reading the spend: the owner lock then sees PRO, not PLUS.
    const raced = subscriptionDeps(database.pool, {
      billing: run.billing, clock: () => run.now,
      ownerSpend: {
        readOwnerSpentMicros: async () => {
          await seedPaidUpgrade(database.pool, run.seeded, {
            at: new Date(run.now.getTime() - 60_000), netMicros: 15_000_000, taxMicros: 3_150_000,
            transactionId: "7700456", monthCreditOverrideMicros: 12_500_000
          });
          return 0;
        }
      }
    });
    await expect(withdraw(raced, { authenticated: run.identity.authenticated, grantToken: run.grant }))
      .rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
    expect((await run.withdraw()).statusCode).toBe(200);
    await run.api.close();
  });

  it("hands the withdrawal to the owner when a dashboard refund touched a payment: plan ended, no refund, no M8", async () => {
    const run = await start("p12d-dashboard", { activatedDaysAgo: 1, taxCountry: "RO" });
    // P9c's record of a refund made in the xMoney dashboard: its true amount is unknown (an upper bound here).
    await run.billing.withTransaction(async (client) => {
      for (const kind of ["REFUND_REQUESTED", "REFUNDED"] as const) {
        await run.billing.appendChargeEvent(client, chargeEvent(run.seeded.initialChargeId, kind, new Date(run.now.getTime() - 60_000), {
          xmoneyTransactionId: run.seeded.initialTransactionId, amountMicros: 5_000_000, errorCode: "PROVIDER_REFUND"
        }));
      }
    });
    const response = await run.withdraw();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ refund: null });
    const events = await run.billing.subscriptionEvents(run.seeded.subscriptionId);
    expect(events.at(-1)).toMatchObject({
      kind: "WITHDRAWN", data: { refund_micros: null, refund_by_owner: true, source: "SETTINGS" }
    });
    expect(foldSubscription(events).status).toBe("WITHDRAWN");
    expect(await new EntitlementRepository(database.pool).current(run.identity.authenticated.ownerRef, new Date()))
      .toMatchObject({ planId: "FREE", cause: "ENDED_WITHDRAWAL" });
    expect((await refundRequests(run.billing, run.seeded.initialChargeId))
      .filter(([, , reason]) => reason === "WITHDRAWAL")).toEqual([]);
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    expect(run.kick).not.toHaveBeenCalled();
    expect(run.audit.events.map(({ event }) => event))
      .toEqual(expect.arrayContaining(["billing.withdrawal", "billing.withdrawal.owner_review"]));
    await run.api.close();
  });

  it("hands it to the owner too when a refund request already holds a transaction, keeping none of the new intents", async () => {
    const run = await start("p12d-held", { activatedDaysAgo: 1, taxCountry: "RO" });
    const upgrade = await seedPaidUpgrade(database.pool, run.seeded, {
      at: new Date(run.now.getTime() - 12 * 3_600_000), netMicros: 15_000_000, taxMicros: 3_150_000,
      transactionId: "7700789", monthCreditOverrideMicros: 12_500_000
    });
    // An earlier refund of ours on the INITIAL payment, still in flight: that transaction cannot take a second request.
    await run.billing.withTransaction((client) => run.billing.appendChargeEvent(client, chargeEvent(
      run.seeded.initialChargeId, "REFUND_REQUESTED", new Date(run.now.getTime() - 60_000), {
        xmoneyTransactionId: run.seeded.initialTransactionId, amountMicros: 1_000_000, errorCode: "SUBSCRIPTION_ENDED"
      }
    )));
    const response = await run.withdraw();
    expect(response.json()).toEqual({ refund: null });
    // The upgrade's intent was written first (newest first) and went back with the savepoint, job and all.
    expect(await refundRequests(run.billing, upgrade.chargeId)).toEqual([]);
    expect((await database.pool.query(
      "SELECT 1 FROM billing.outbox WHERE kind='XMONEY_REFUND' AND ref=$1", [`${upgrade.chargeId}:7700789`]
    )).rowCount).toBe(0);
    expect((await run.billing.subscriptionEvents(run.seeded.subscriptionId)).at(-1))
      .toMatchObject({ kind: "WITHDRAWN", data: { refund_micros: null, refund_by_owner: true } });
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    await run.api.close();
  });

  it("withdraws on a pool of ONE connection: every read under the owner lock uses the transaction's own", async () => {
    const small = createPool(database.connectionString, { max: 1 });
    try {
      const run = await start("p12d-small-pool", { activatedDaysAgo: 1, taxCountry: "RO" });
      const deps = subscriptionDeps(small, {
        ownerSpend: { readOwnerSpentMicros: async () => 1_000_000 }, clock: () => run.now
      });
      expect(await withdraw(deps, { authenticated: run.identity.authenticated, grantToken: run.grant }))
        .toMatchObject({ refundMicros: expect.any(Number) });
      await run.api.close();
    } finally {
      await small.end();
    }
  }, 10_000);
});
