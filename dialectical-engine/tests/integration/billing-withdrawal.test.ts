import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BillingJobQueries, BillingRepository, createPool, EntitlementRepository, migrate, type OutboxJob } from "@debateai/db";
import { foldSubscription, microsToDecimal, withdrawalRefundPerPaymentMicros } from "@debateai/billing-core";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testHttpIdentity } from "../support/httpSession.js";
import {
  mountSubscriptionRoutes,
  netopiaRefundDesk,
  ownerRefundDone,
  recordingAudit,
  seedNetopiaSubscription,
  seedPaidUpgrade,
  seedWithdrawalGrant,
  subscriptionDeps
} from "../support/billingSubscriptionFixtures.js";
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
  const seeded = await seedNetopiaSubscription(database.pool, {
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
    .map((event) => [event.providerPaymentId, event.amountMicros, event.errorCode]);

const m8Of = async (subscriptionId: string) => (await database.pool.query<{ payload: Record<string, unknown> }>(
  "SELECT payload FROM billing.outbox WHERE kind='EMAIL' AND ref=$1", [`M8:${subscriptionId}`]
)).rows;

/** The EMAIL jobs a template queued under this ref (W9: `M8_RECEIVED:<subscription>`, `O2_WITHDRAWAL:<subscription>`). */
const emailOf = async (template: string, ref: string) => (await database.pool.query<{ payload: Record<string, unknown> }>(
  "SELECT payload FROM billing.outbox WHERE kind='EMAIL' AND ref=$1", [`${template}:${ref}`]
)).rows.map((row) => row.payload);

/** The PAYMENT_REFUND jobs these refs name, claimed as P7's worker would (attempt 1). */
async function claimRefunds(refs: readonly string[]): Promise<OutboxJob[]> {
  const claimed = await new BillingRepository(database.pool).claim(["PAYMENT_REFUND"], 50, "p12d-test", new Date());
  return claimed.filter((job) => refs.includes(job.ref)).sort((left, right) => left.ref.localeCompare(right.ref));
}

/** The API's desk in NETOPIA's owner mode (spec §2.12.2): a refund job hands the refund to the owner, moving no money. */
const desk = () => netopiaRefundDesk(database.pool);
const stageOf = (jobId: string) => new BillingJobQueries(database.pool).jobStage(jobId);

/** The REFUNDED amounts recorded on a charge (none until the owner runs `pnpm billing:refund-done`). */
const refundedOf = async (billing: BillingRepository, chargeId: string) =>
  (await billing.charge(chargeId))!.events.filter((event) => event.kind === "REFUNDED").map((event) => event.amountMicros);

/** The credit-note jobs a refund queued under `<charge>:<payment>` (RO sells through SmartBill: its storno). */
const creditNotesOf = async (ref: string) => (await database.pool.query<{ kind: string; payload: Record<string, unknown> }>(
  "SELECT kind, payload FROM billing.outbox WHERE kind IN ('SMARTBILL_STORNO','QUADERNO_RECORD_REFUND') AND ref=$1", [ref]
)).rows;

describe("P12d withdrawal on real PostgreSQL", () => {
  it("refunds the unused share across both charges newest first, ends the plan, and sends M8 after the last refund", async () => {
    const run = await start("p12d-happy", { activatedDaysAgo: 1, taxCountry: "RO" });
    const upgradeAt = new Date(run.now.getTime() - 12 * 3_600_000);
    const upgrade = await seedPaidUpgrade(database.pool, run.seeded, {
      at: upgradeAt, netMicros: 15_000_000, taxMicros: 3_150_000,
      providerPaymentId: "7700123", monthCreditOverrideMicros: 12_500_000
    });
    // W6 (P2-I8): each payment over its own coverage; the upgrade's starts at its quote, a minute before it was paid.
    const expected = withdrawalRefundPerPaymentMicros({
      payments: [
        { paidMicros: run.seeded.totalMicros, coverageStart: run.seeded.periodStart, coverageEnd: run.seeded.periodEnd },
        { paidMicros: 18_150_000, coverageStart: new Date(upgradeAt.getTime() - 60_000), coverageEnd: run.seeded.periodEnd }
      ],
      now: run.now, creditSpentMicros: 1_000_000, monthlyCreditMicros: 12_500_000
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
      [[run.seeded.providerPaymentId, expected - 18_150_000, "WITHDRAWAL"]]
    );
    const initialRef = `${run.seeded.initialChargeId}:${run.seeded.providerPaymentId}`;
    const upgradeRef = `${upgrade.chargeId}:7700123`;
    const refs = [initialRef, upgradeRef].sort();
    expect(run.audit.events.map(({ event }) => event)).toContain("billing.withdrawal");
    expect(run.kick).toHaveBeenCalledTimes(1);
    // No "we refunded" email while the money has not moved.
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    // W9 (P2-I11): the acknowledgement of receipt, queued in the withdrawal's own transaction, says only what happened.
    expect(await emailOf("M8_RECEIVED", run.seeded.subscriptionId)).toEqual([expect.objectContaining({
      template: "M8_RECEIVED", recipient: "CUSTOMER", "param.plan": "PRO",
      "param.withdrawalDate": run.now.toISOString(), "param.refundAmount": microsToDecimal(expected)
    })]);
    expect(await emailOf("O2_WITHDRAWAL", run.seeded.subscriptionId)).toEqual([]);
    const jobs = await claimRefunds(refs);
    expect(jobs.map((job) => job.ref)).toEqual(refs);
    const owner = desk();
    // Spec §2.12.2 (owner mode): each PAYMENT_REFUND job hands its refund to the owner, with the amount, the reason and
    // the withdrawal's legal deadline, and moves no money.
    for (const job of jobs) {
      expect(await owner.handle(job, new Date())).toEqual({ kind: "DONE" });
      expect(await stageOf(job.jobId)).toBe("OWNER_REFUND_DUE");
    }
    // The upgrade's payment goes back whole; the first payment only in part.
    for (const [ref, amountMicros, whole] of [[upgradeRef, 18_150_000, "true"], [initialRef, expected - 18_150_000, "false"]] as const) {
      expect(await emailOf("O2_REFUND_DUE", ref)).toEqual([expect.objectContaining({
        template: "O2_REFUND_DUE", recipient: "OWNER", "param.refundAmount": microsToDecimal(amountMicros),
        "param.refundReason": "WITHDRAWAL", "param.whole": whole,
        "param.refundDeadline": new Date(run.now.getTime() + 14 * DAY).toISOString()
      })]);
    }
    expect(await refundedOf(run.billing, upgrade.chargeId)).toEqual([]);
    expect(await refundedOf(run.billing, run.seeded.initialChargeId)).toEqual([]);
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    // The owner refunds the upgrade's share in NETOPIA's admin and records it: its credit note follows, M8 waits.
    expect(await ownerRefundDone(owner, upgrade.chargeId, 18_150_000)).toContain("Recorded.");
    expect(await refundedOf(run.billing, upgrade.chargeId)).toEqual([18_150_000]);
    expect((await creditNotesOf(upgradeRef)).map((row) => row.payload)).toEqual([expect.objectContaining({ refund_micros: 18_150_000 })]);
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    // The last refund of the withdrawal, recorded the same way: M8 names the whole refund.
    expect(await ownerRefundDone(owner, run.seeded.initialChargeId, expected - 18_150_000)).toContain("Recorded.");
    expect((await creditNotesOf(initialRef)).map((row) => row.payload))
      .toEqual([expect.objectContaining({ refund_micros: expected - 18_150_000 })]);
    const m8 = await m8Of(run.seeded.subscriptionId);
    expect(m8).toHaveLength(1);
    expect(m8[0]!.payload).toMatchObject({ "param.refundAmount": microsToDecimal(expected), "param.plan": "PRO" });
    const again = await run.withdraw();
    expect(again.statusCode).toBe(409);
    expect(again.json().error).toBe("NOT_SUBSCRIBED");
    await run.api.close();
  });

  it("never sends M8 for a withdrawal whose refund the owner has not recorded", async () => {
    const run = await start("p12d-refused", { activatedDaysAgo: 1, taxCountry: "DE" });
    expect((await run.withdraw()).statusCode).toBe(200);
    const ref = `${run.seeded.initialChargeId}:${run.seeded.providerPaymentId}`;
    const [request] = (await refundRequests(run.billing, run.seeded.initialChargeId)).filter(([, , reason]) => reason === "WITHDRAWAL");
    const [job] = await claimRefunds([ref]);
    // Owner mode: the job ends DONE having moved no money; the refund stays open until the owner records it.
    expect(await desk().handle(job!, new Date())).toEqual({ kind: "DONE" });
    expect(await stageOf(job!.jobId)).toBe("OWNER_REFUND_DUE");
    expect(await refundedOf(run.billing, run.seeded.initialChargeId)).toEqual([]);
    expect(await creditNotesOf(ref)).toEqual([]);
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    // W9: the person still holds the acknowledgement, and the owner's O2_REFUND_DUE names the amount, the reason and
    // the legal deadline.
    expect(await emailOf("M8_RECEIVED", run.seeded.subscriptionId)).toHaveLength(1);
    expect(await emailOf("O2_REFUND_DUE", ref)).toEqual([expect.objectContaining({
      template: "O2_REFUND_DUE", recipient: "OWNER", "param.refundAmount": microsToDecimal(request![1] as number),
      "param.refundReason": "WITHDRAWAL", "param.refundDeadline": new Date(run.now.getTime() + 14 * DAY).toISOString()
    })]);
    await run.api.close();
  });

  it("keeps the rest of a withdrawal refund open when the owner records a part: still reminded, no M8 until the rest", async () => {
    const run = await start("p12d-part", { activatedDaysAgo: 1, taxCountry: "RO" });
    expect((await run.withdraw()).statusCode).toBe(200);
    const ref = `${run.seeded.initialChargeId}:${run.seeded.providerPaymentId}`;
    const [request] = (await refundRequests(run.billing, run.seeded.initialChargeId)).filter(([, , reason]) => reason === "WITHDRAWAL");
    const requestedMicros = request![1] as number;
    const partMicros = 5_000_000;
    expect(requestedMicros).toBeGreaterThan(partMicros);
    const owner = desk();
    const [job] = await claimRefunds([ref]);
    expect(await owner.handle(job!, new Date())).toEqual({ kind: "DONE" });
    // The owner refunded only a part in NETOPIA's admin and records that part.
    expect(await ownerRefundDone(owner, run.seeded.initialChargeId, partMicros))
      .toContain(`${microsToDecimal(requestedMicros - partMicros)} USD is still open`);
    expect(await refundedOf(run.billing, run.seeded.initialChargeId)).toEqual([partMicros]);
    // A part runs no follow-up: no M8 and no credit note yet, and the rest is in the owner's reminder.
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    expect(await creditNotesOf(ref)).toEqual([]);
    const now = new Date();
    expect(await owner.remindOwnerRefunds(now)).toBeGreaterThan(0);
    const [reminder] = await emailOf("O2_REFUND_REMINDER", now.toISOString().slice(0, 10));
    expect(String(reminder!["param.refundList"])).toContain(
      `- charge ${run.seeded.initialChargeId}, NETOPIA payment ${run.seeded.providerPaymentId}:`
        + ` refund ${microsToDecimal(requestedMicros - partMicros)} USD (part of the payment), reason WITHDRAWAL`
    );
    // The rest recorded: M8 and the credit note now follow, for the whole refund.
    expect(await ownerRefundDone(owner, run.seeded.initialChargeId, requestedMicros - partMicros)).toContain("Recorded.");
    expect(await refundedOf(run.billing, run.seeded.initialChargeId)).toEqual([partMicros, requestedMicros - partMicros]);
    expect((await creditNotesOf(ref)).map((row) => row.payload)).toEqual([expect.objectContaining({ refund_micros: requestedMicros })]);
    expect((await m8Of(run.seeded.subscriptionId)).map((row) => row.payload))
      .toEqual([expect.objectContaining({ "param.refundAmount": microsToDecimal(requestedMicros) })]);
    await run.api.close();
  });

  it("refuses without a valid grant and writes nothing", async () => {
    const run = await start("p12d-grant", { activatedDaysAgo: 2, taxCountry: "DE" });
    const refused = await run.withdraw("x".repeat(43));
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toBe("STEP_UP_REQUIRED");
    expect(foldSubscription(await run.billing.subscriptionEvents(run.seeded.subscriptionId)).status).toBe("ACTIVE");
    expect(await refundRequests(run.billing, run.seeded.initialChargeId)).toEqual([]);
    expect(await emailOf("M8_RECEIVED", run.seeded.subscriptionId)).toEqual([]);
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
    // W9: M8 is itself the acknowledgement here (queued in the same transaction), so no second email says the same.
    expect(await emailOf("M8_RECEIVED", run.seeded.subscriptionId)).toEqual([]);
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
            providerPaymentId: "7700456", monthCreditOverrideMicros: 12_500_000
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
    // VERIFY_PAYMENT's record of a refund made in NETOPIA's admin: its true amount is unknown (an upper bound here).
    await run.billing.withTransaction(async (client) => {
      for (const kind of ["REFUND_REQUESTED", "REFUNDED"] as const) {
        await run.billing.appendChargeEvent(client, chargeEvent(run.seeded.initialChargeId, kind, new Date(run.now.getTime() - 60_000), {
          providerPaymentId: run.seeded.providerPaymentId, amountMicros: 5_000_000, errorCode: "PROVIDER_REFUND"
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
    // W9 (P2-I11): the person's acknowledgement names no amount; the owner is told at once, with the deadline.
    const acknowledged = await emailOf("M8_RECEIVED", run.seeded.subscriptionId);
    expect(acknowledged).toEqual([expect.objectContaining({
      template: "M8_RECEIVED", recipient: "CUSTOMER", "param.plan": "PLUS", "param.withdrawalDate": run.now.toISOString()
    })]);
    expect(acknowledged[0]).not.toHaveProperty("param.refundAmount");
    expect(await emailOf("O2_WITHDRAWAL", run.seeded.subscriptionId)).toEqual([expect.objectContaining({
      template: "O2_WITHDRAWAL", recipient: "OWNER", "param.ownerRef": run.identity.authenticated.ownerRef,
      "param.reasonCode": "WITHDRAWAL_BY_OWNER", "param.withdrawalDate": run.now.toISOString(),
      "param.refundDeadline": new Date(run.now.getTime() + 14 * DAY).toISOString()
    })]);
    expect(run.kick).not.toHaveBeenCalled();
    expect(run.audit.events.map(({ event }) => event))
      .toEqual(expect.arrayContaining(["billing.withdrawal", "billing.withdrawal.owner_review"]));
    await run.api.close();
  });

  it("hands it to the owner too when a refund request already holds a transaction, keeping none of the new intents", async () => {
    const run = await start("p12d-held", { activatedDaysAgo: 1, taxCountry: "RO" });
    const upgrade = await seedPaidUpgrade(database.pool, run.seeded, {
      at: new Date(run.now.getTime() - 12 * 3_600_000), netMicros: 15_000_000, taxMicros: 3_150_000,
      providerPaymentId: "7700789", monthCreditOverrideMicros: 12_500_000
    });
    // An earlier refund of ours on the INITIAL payment, still in flight: that transaction cannot take a second request.
    await run.billing.withTransaction((client) => run.billing.appendChargeEvent(client, chargeEvent(
      run.seeded.initialChargeId, "REFUND_REQUESTED", new Date(run.now.getTime() - 60_000), {
        providerPaymentId: run.seeded.providerPaymentId, amountMicros: 1_000_000, errorCode: "SUBSCRIPTION_ENDED"
      }
    )));
    const response = await run.withdraw();
    expect(response.json()).toEqual({ refund: null });
    // The upgrade's intent was written first (newest first) and went back with the savepoint, job and all.
    expect(await refundRequests(run.billing, upgrade.chargeId)).toEqual([]);
    // No job of any kind (a refund job or its follow-ups) names the upgrade's payment.
    expect((await database.pool.query(
      "SELECT 1 FROM billing.outbox WHERE ref=$1", [`${upgrade.chargeId}:7700789`]
    )).rowCount).toBe(0);
    expect((await run.billing.subscriptionEvents(run.seeded.subscriptionId)).at(-1))
      .toMatchObject({ kind: "WITHDRAWN", data: { refund_micros: null, refund_by_owner: true } });
    expect(await m8Of(run.seeded.subscriptionId)).toEqual([]);
    // W9: the savepoint took back the refund intents, not the acknowledgement or the owner's alert.
    expect(await emailOf("M8_RECEIVED", run.seeded.subscriptionId)).toHaveLength(1);
    expect(await emailOf("O2_WITHDRAWAL", run.seeded.subscriptionId)).toHaveLength(1);
    await run.api.close();
  });

  it("records a withdrawal refund under the owner lock first, then the charge's refund lock (the writers' order)", async () => {
    const run = await start("p12d-lock-order", { activatedDaysAgo: 1, taxCountry: "RO" });
    expect((await run.withdraw()).statusCode).toBe(200);
    const ownerRef = run.identity.authenticated.ownerRef;
    const [request] = (await refundRequests(run.billing, run.seeded.initialChargeId))
      .filter(([, , reason]) => reason === "WITHDRAWAL");
    const amountMicros = request![1] as number;
    // The owner's command plans the refund first (it reads, and takes no lock), then records it.
    const owner = desk();
    const plan = await owner.planOwnerRefund(run.seeded.initialChargeId, amountMicros);
    const holder = await database.pool.connect();
    let recording: Promise<unknown> | undefined;
    try {
      await holder.query("BEGIN");
      await new BillingJobQueries(database.pool).lockOwner(holder, ownerRef);
      recording = owner.recordOwnerRefund(plan, new Date());
      // Wait until the recording is queued behind the owner lock this test holds.
      const deadline = Date.now() + 5_000;
      let waiting = false;
      while (!waiting && Date.now() < deadline) {
        waiting = ((await database.pool.query(
          "SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted"
        )).rowCount ?? 0) > 0;
        if (!waiting) await new Promise((resolve) => setTimeout(resolve, 50));
      }
      expect(waiting).toBe(true);
      // The recording waits for the owner lock BEFORE its REFUNDED insert takes the charge's refund lock (0086).
      const free = await holder.query<{ free: boolean }>(
        "SELECT pg_try_advisory_xact_lock(hashtextextended('debateai.billing.refund:'||$1,0)) AS free",
        [run.seeded.initialChargeId]
      );
      expect(free.rows[0]!.free).toBe(true);
    } finally {
      await holder.query("ROLLBACK");
      holder.release();
    }
    expect(await recording).toBe("RECORDED");
    const m8 = await m8Of(run.seeded.subscriptionId);
    expect(m8).toHaveLength(1);
    expect(m8[0]!.payload).toMatchObject({ "param.refundAmount": microsToDecimal(amountMicros) });
    await run.api.close();
  });

  it("records one refund once when the owner's command runs twice at once: one REFUNDED, one M8 (P2-M6)", async () => {
    // 3.00 of Plus's 5.00 credit used: the larger share is 60 %, so the refund is under half the payment and the sum
    // guard alone would let a second REFUNDED row for it in (a NETOPIA refund may be recorded in parts, PR-20: no
    // unique key stops a second one, only the re-read under the owner lock does).
    const run = await start("p2-m6-two-recorders", { activatedDaysAgo: 1, taxCountry: "RO", spentMicros: 3_000_000 });
    expect((await run.withdraw()).statusCode).toBe(200);
    const ownerRef = run.identity.authenticated.ownerRef;
    const [request] = (await refundRequests(run.billing, run.seeded.initialChargeId))
      .filter(([, , reason]) => reason === "WITHDRAWAL");
    const amountMicros = request![1] as number;
    const paidMicros = (await run.billing.charge(run.seeded.initialChargeId))!.totalMicros;
    expect(2 * amountMicros).toBeLessThanOrEqual(paidMicros);
    expect(ownerRef).toBe(run.seeded.ownerRef);
    // Two runs of `pnpm billing:refund-done` for the whole request (the owner pressed it twice), each on its own desk
    // and connection, both planned while the request was still open.
    const [first, second] = [desk(), desk()];
    const plans = await Promise.all([first, second].map((owner) => owner.planOwnerRefund(run.seeded.initialChargeId, amountMicros)));
    const results = await Promise.all([first.recordOwnerRefund(plans[0]!, new Date()), second.recordOwnerRefund(plans[1]!, new Date())]);
    expect([...results].sort()).toEqual(["ALREADY_RECORDED", "RECORDED"]);
    const refunded = (await run.billing.charge(run.seeded.initialChargeId))!.events.filter((event) => event.kind === "REFUNDED");
    expect(refunded).toHaveLength(1);
    expect(refunded[0]).toMatchObject({ amountMicros });
    expect(await m8Of(run.seeded.subscriptionId)).toHaveLength(1);
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
