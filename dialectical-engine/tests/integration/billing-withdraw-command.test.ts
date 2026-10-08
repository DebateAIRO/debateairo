import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type Pool } from "@debateai/db";
import {
  foldSubscription, microsToDecimal, withdrawalRefundMicros, withdrawalRefundPerPaymentMicros
} from "@debateai/billing-core";
import { renderMail } from "@debateai/mail-templates";
import { planById } from "@debateai/register";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testHttpIdentity } from "../support/httpSession.js";
import { testBillingPlans, testBillingPolicy, XMONEY_SYSTEM_UNTIL_N23 } from "../support/billingFixtures.js";
import {
  netopiaRefundDesk,
  ownerRefundDone,
  recordingAudit,
  seedNetopiaSubscription,
  seedPaidUpgrade,
  seedWithdrawalGrant,
  subscriptionDeps,
  type SeededNetopiaSubscription
} from "../support/billingSubscriptionFixtures.js";
import { openBillingOperatorPool } from "../../apps/api/src/billing/operator-connection.js";
import { chargeEvent } from "../../apps/api/src/billing/rows.js";
import { withdrawalOpenUntil } from "../../apps/api/src/billing/subscription-view.js";
import { withdraw } from "../../apps/api/src/billing/withdrawal.js";
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
/**
 * The command's stores; the API's NETOPIA environment is the sandbox, `seedNetopiaSubscription`'s default (spec §2.5.4,
 * N14's `servedHere` guard: with `null` a NETOPIA plan would be refused NOT_SUBSCRIBED).
 */
const stores = (audit = recordingAudit(), paymentEnvironment: "sandbox" | "live" = "sandbox") => withdrawStoresFor(operator, {
  policy: testBillingPolicy, plans: testBillingPlans, audit, clock: () => new Date(), ...XMONEY_SYSTEM_UNTIL_N23, paymentEnvironment
});
const rows = () => new BillingRepository(database.pool);

const m8Of = async (subscriptionId: string) => (await database.pool.query<{ payload: Record<string, unknown> }>(
  "SELECT payload FROM billing.outbox WHERE kind='EMAIL' AND ref=$1", [`M8:${subscriptionId}`]
)).rows;

/** The English text of a queued EMAIL job, rendered from its own params (`param.<name>` in the payload). */
const renderedText = (payload: Record<string, unknown>): string => renderMail(
  payload.template as "M8", "en", Object.fromEntries(Object.entries(payload)
    .filter(([key]) => key.startsWith("param.")).map(([key, value]) => [key.slice("param.".length), String(value)]))
).text;

/** The EMAIL job a template queued under this ref (W9: `M8_RECEIVED:<subscription>`, `O2_WITHDRAWAL:<subscription>`). */
const emailOf = async (template: string, ref: string) => (await database.pool.query<{ payload: Record<string, unknown> }>(
  "SELECT payload FROM billing.outbox WHERE kind='EMAIL' AND ref=$1", [`${template}:${ref}`]
)).rows;

const withdrawalRequests = async (chargeId: string) => ((await rows().charge(chargeId))?.events ?? [])
  .filter((event) => event.kind === "REFUND_REQUESTED" && event.errorCode === "WITHDRAWAL")
  .map((event) => [event.providerPaymentId, event.amountMicros]);

/** VERIFY_PAYMENT's record of a refund made in NETOPIA's admin on the first payment: its true amount is unknown. */
async function dashboardRefund(seeded: SeededNetopiaSubscription, at: Date): Promise<void> {
  const repository = rows();
  await repository.withTransaction(async (client) => {
    for (const kind of ["REFUND_REQUESTED", "REFUNDED"] as const) {
      await repository.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, kind, at, {
        providerPaymentId: seeded.providerPaymentId, amountMicros: 5_000_000, errorCode: "PROVIDER_REFUND"
      }));
    }
  });
}

const refundedOf = async (chargeId: string) => ((await rows().charge(chargeId))?.events ?? [])
  .filter((event) => event.kind === "REFUNDED").map((event) => event.amountMicros);

/**
 * The API's outbox worker handing this charge's PAYMENT_REFUND jobs to the owner (NETOPIA's owner mode, spec §2.12.2:
 * DONE at OWNER_REFUND_DUE, O2_REFUND_DUE with the amount, the reason and the withdrawal's deadline, nothing refunded
 * yet), then the owner recording each refund with `pnpm billing:refund-done --amount <the request's amount> --confirm`,
 * whose credit note follows.
 */
async function refundThroughOwner(chargeId: string, deadline: Date): Promise<void> {
  const owner = netopiaRefundDesk(database.pool);
  const claimed = (await rows().claim(["PAYMENT_REFUND"], 50, "p14c-test", new Date()))
    .filter((candidate) => candidate.ref.startsWith(`${chargeId}:`));
  expect(claimed.length).toBeGreaterThan(0);
  for (const job of claimed) {
    const amountMicros = job.payload.amount_micros as number;
    expect(await owner.handle(job, new Date())).toEqual({ kind: "DONE" });
    expect(await new BillingJobQueries(database.pool).jobStage(job.jobId)).toBe("OWNER_REFUND_DUE");
    expect((await emailOf("O2_REFUND_DUE", job.ref)).map((row) => row.payload)).toEqual([expect.objectContaining({
      recipient: "OWNER", "param.refundAmount": microsToDecimal(amountMicros), "param.refundReason": "WITHDRAWAL",
      "param.refundDeadline": deadline.toISOString()
    })]);
    expect(await refundedOf(chargeId)).toEqual([]);
    expect(await ownerRefundDone(owner, chargeId, amountMicros)).toContain("Recorded.");
    expect(await refundedOf(chargeId)).toEqual([amountMicros]);
    const notes = await database.pool.query<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM billing.outbox WHERE kind IN ('SMARTBILL_STORNO','QUADERNO_RECORD_REFUND') AND ref=$1", [job.ref]
    );
    expect(notes.rows.map((row) => row.payload)).toEqual([expect.objectContaining({ refund_micros: amountMicros })]);
  }
}

describe("P14c a withdrawal the person sent by email, carried out by the owner's command", () => {
  it("records it as of the instant it arrived and refunds through RefundDesk and the owner's record, M8 after the refund", async () => {
    const now = new Date();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 20 * DAY), taxCountry: "RO"
    });
    const receivedAt = new Date(seeded.periodStart.getTime() + 12 * DAY);
    // Settings could no longer take it (the window has closed since), but it was open when the email arrived.
    const state = foldSubscription(await rows().subscriptionEvents(seeded.subscriptionId));
    // In its own environment: the window is closed by the date alone, not by the plan's payment system.
    expect(withdrawalOpenUntil({
      state, taxCountry: "RO", policy: testBillingPolicy, now, ...XMONEY_SYSTEM_UNTIL_N23, paymentEnvironment: "sandbox"
    })).toBeNull();
    expect(withdrawalOpenUntil({
      state, taxCountry: "RO", policy: testBillingPolicy, now: receivedAt, ...XMONEY_SYSTEM_UNTIL_N23, paymentEnvironment: "sandbox"
    })).not.toBeNull();
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
    expect(await withdrawalRequests(seeded.initialChargeId)).toEqual([[seeded.providerPaymentId, expected]]);
    expect(await m8Of(seeded.subscriptionId)).toEqual([]);
    // W9 (P2-I11): the acknowledgement goes at once, dated when the statement arrived, never "refunded".
    expect((await emailOf("M8_RECEIVED", seeded.subscriptionId)).map((row) => row.payload)).toEqual([expect.objectContaining({
      template: "M8_RECEIVED", recipient: "CUSTOMER", "param.plan": "PLUS",
      "param.withdrawalDate": receivedAt.toISOString(), "param.refundAmount": microsToDecimal(expected)
    })]);
    expect(await emailOf("O2_WITHDRAWAL", seeded.subscriptionId)).toEqual([]);
    await refundThroughOwner(seeded.initialChargeId, new Date(receivedAt.getTime() + 14 * DAY));
    expect((await m8Of(seeded.subscriptionId))[0]?.payload)
      .toMatchObject({ "param.refundAmount": microsToDecimal(expected), "param.plan": "PLUS" });
    // Once recorded, a second statement is refused like a second click.
    await expect(recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt }))
      .rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
  }, 10_000);

  it("keeps the rest of the refund open when the owner records a part of it: still reminded, no M8 until the rest", async () => {
    const now = new Date();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 5 * DAY), taxCountry: "RO"
    });
    const receivedAt = new Date(now.getTime() - 60_000);
    const recorded = await recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt });
    expect(recorded).toMatchObject({ kind: "REFUNDING" });
    const requestedMicros = (recorded as Readonly<{ refundMicros: number }>).refundMicros;
    const partMicros = 2_000_000;
    expect(requestedMicros).toBeGreaterThan(partMicros);
    const owner = netopiaRefundDesk(database.pool);
    const ref = `${seeded.initialChargeId}:${seeded.providerPaymentId}`;
    const [job] = (await rows().claim(["PAYMENT_REFUND"], 50, "p14c-part", new Date())).filter((claimed) => claimed.ref === ref);
    expect(await owner.handle(job!, new Date())).toEqual({ kind: "DONE" });
    expect(await ownerRefundDone(owner, seeded.initialChargeId, partMicros))
      .toContain(`${microsToDecimal(requestedMicros - partMicros)} USD is still open`);
    expect(await refundedOf(seeded.initialChargeId)).toEqual([partMicros]);
    // The rest stays open: listed by the owner's reminder, and no M8 (nor credit note) before it is recorded.
    expect(await m8Of(seeded.subscriptionId)).toEqual([]);
    expect((await database.pool.query(
      "SELECT 1 FROM billing.outbox WHERE kind IN ('SMARTBILL_STORNO','QUADERNO_RECORD_REFUND') AND ref=$1", [ref]
    )).rowCount).toBe(0);
    expect(await owner.remindOwnerRefunds(now)).toBeGreaterThan(0);
    const [reminder] = await emailOf("O2_REFUND_REMINDER", now.toISOString().slice(0, 10));
    expect(String(reminder!.payload["param.refundList"])).toContain(
      `- charge ${seeded.initialChargeId}, NETOPIA payment ${seeded.providerPaymentId}:`
        + ` refund ${microsToDecimal(requestedMicros - partMicros)} USD (part of the payment), reason WITHDRAWAL`
    );
    // The rest recorded: M8 names the whole refund.
    expect(await ownerRefundDone(owner, seeded.initialChargeId, requestedMicros - partMicros)).toContain("Recorded.");
    expect((await m8Of(seeded.subscriptionId)).map((row) => row.payload))
      .toEqual([expect.objectContaining({ "param.refundAmount": microsToDecimal(requestedMicros), "param.plan": "PLUS" })]);
  }, 10_000);

  it("runs P12d's withdrawal as of the command's own clock for `--owner <ref>` alone (R2 Q-9)", async () => {
    const at = new Date();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(at.getTime() - 2 * DAY), taxCountry: "RO"
    });
    const audit = recordingAudit();
    const clocked = withdrawStoresFor(operator, {
      policy: testBillingPolicy, plans: testBillingPlans, audit, clock: () => at, ...XMONEY_SYSTEM_UNTIL_N23, paymentEnvironment: "sandbox"
    });
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
    const seeded = await seedNetopiaSubscription(database.pool, {
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
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 3 * DAY), taxCountry: "RO"
    });
    const upgrade = await seedPaidUpgrade(database.pool, seeded, {
      at: new Date(now.getTime() - 2 * DAY), netMicros: 15_000_000, taxMicros: 3_150_000, providerPaymentId: "7720001",
      monthCreditOverrideMicros: 12_500_000
    });
    await dashboardRefund(seeded, new Date(now.getTime() - DAY));
    const receivedAt = new Date(now.getTime() - 60_000);
    expect(await recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt }))
      .toEqual({ kind: "OWNER_REVIEW" });
    // W9 (P2-I11): the person's acknowledgement (no amount: the owner works it out), and the owner's own alert with
    // the 14-day deadline counted from when the statement arrived.
    const acknowledged = (await emailOf("M8_RECEIVED", seeded.subscriptionId)).map((row) => row.payload);
    expect(acknowledged).toEqual([expect.objectContaining({
      template: "M8_RECEIVED", recipient: "CUSTOMER", "param.withdrawalDate": receivedAt.toISOString()
    })]);
    expect(acknowledged[0]).not.toHaveProperty("param.refundAmount");
    expect((await emailOf("O2_WITHDRAWAL", seeded.subscriptionId)).map((row) => row.payload)).toEqual([expect.objectContaining({
      template: "O2_WITHDRAWAL", recipient: "OWNER", "param.ownerRef": seeded.ownerRef,
      "param.reasonCode": "WITHDRAWAL_BY_OWNER", "param.withdrawalDate": receivedAt.toISOString(),
      "param.refundDeadline": new Date(receivedAt.getTime() + 14 * DAY).toISOString()
    })]);
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
    // 3.00 through RefundDesk, and 5.00 the owner refunded in NETOPIA's admin for this withdrawal.
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
    await refundThroughOwner(upgrade.chargeId, new Date(receivedAt.getTime() + 14 * DAY));
    expect((await m8Of(seeded.subscriptionId))[0]?.payload).toMatchObject({ "param.refundAmount": "8.00", "param.plan": "PRO" });
  }, 10_000);

  it("refuses to record or settle the withdrawal of a plan paid in the other NETOPIA environment (P2-I4, spec §2.5.4)", async () => {
    const now = new Date();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 2 * DAY), taxCountry: "RO",
      paymentEnvironment: "live"
    });
    await dashboardRefund(seeded, new Date(now.getTime() - DAY));
    // The command on a host pointed at the sandbox: the live plan is not its to end.
    await expect(recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt: new Date(now.getTime() - 60_000) }))
      .rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
    expect((await rows().subscriptionEvents(seeded.subscriptionId)).map((event) => event.kind)).not.toContain("WITHDRAWN");
    // Handed to the owner in its own environment (live), then settled from a host pointed at the sandbox: refused,
    // nothing written.
    expect(await recordOwnerWithdrawal(stores(recordingAudit(), "live"), {
      ownerRef: seeded.ownerRef, receivedAt: new Date(now.getTime() - 60_000)
    })).toEqual({ kind: "OWNER_REVIEW" });
    await expect(runWithdrawCommand(stores(), parseWithdrawArguments(["--owner", seeded.ownerRef, "--refund", "1.00", "--dashboard", "2.00"])))
      .rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
    expect(await withdrawalRequests(seeded.initialChargeId)).toEqual([]);
    expect(await rows().withdrawalOwnerSettlement(seeded.subscriptionId)).toBeNull();
    expect(await m8Of(seeded.subscriptionId)).toEqual([]);
  }, 10_000);

  it("settles a refund made wholly in the dashboard: M8 at once for that amount, and a second settlement is refused", async () => {
    const now = new Date();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 2 * DAY), taxCountry: "RO"
    });
    // A partial refund in NETOPIA's admin touched the only payment; the owner refunds the rest there too, by hand.
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
    // P2-M7's control: a settlement with money due keeps today's M8, its params unchanged.
    expect((await m8Of(seeded.subscriptionId))[0]?.payload).not.toHaveProperty("param.ownerSettled");
    expect(renderedText((await m8Of(seeded.subscriptionId))[0]!.payload))
      .toContain("Your Plus plan has ended, and we refunded $17.59 to your card.");
    expect(await withdrawalRequests(seeded.initialChargeId)).toEqual([]);
    expect(await rows().withdrawalsAwaitingOwner(seeded.ownerRef)).toEqual([]);
    await expect(runWithdrawCommand(stores(), settle)).rejects.toThrow("BILLING_WITHDRAW_NOT_AWAITING_OWNER");
    expect(await m8Of(seeded.subscriptionId)).toHaveLength(1);
  }, 10_000);

  it("settles with nothing refunded by either part: M8 at once for 0.00, saying only that nothing more is due (P2-M7), and the withdrawal leaves the owner's list", async () => {
    const now = new Date();
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 2 * DAY), taxCountry: "RO"
    });
    await dashboardRefund(seeded, new Date(now.getTime() - DAY));
    expect(await recordOwnerWithdrawal(stores(), { ownerRef: seeded.ownerRef, receivedAt: new Date(now.getTime() - 60_000) }))
      .toEqual({ kind: "OWNER_REVIEW" });
    // `--refund 0.00` with no dashboard part.
    expect(await runWithdrawCommand(stores(), parseWithdrawArguments(["--owner", seeded.ownerRef, "--refund", "0.00"])))
      .toEqual({ kind: "SETTLED", refundMicros: 0, dashboardMicros: 0 });
    const [m8] = await m8Of(seeded.subscriptionId);
    expect(m8?.payload).toMatchObject({ "param.refundAmount": "0.00", "param.ownerSettled": "true" });
    // P2-M7: the money had usually gone back already (here, a dashboard refund), so M8 never says that the part already
    // used covers the whole price; it says only what is true in both cases.
    const text = renderedText(m8!.payload);
    expect(text).toContain("Your Plus plan has ended, and nothing more is due back to you.");
    expect(text).not.toContain("covers the whole price");
    expect(await rows().withdrawalsAwaitingOwner(seeded.ownerRef)).toEqual([]);
  }, 10_000);
});

describe("W6 Settings and the owner's command: each payment's own share (P2-I8) and the weekend roll (P2-I9)", () => {
  /** The spend a withdrawal reads, the same for both paths. */
  const spending = (spentMicros: number) => ({ readOwnerSpentMicros: async () => spentMicros });

  /** P12d's Settings route at `at`, with a fresh step-up grant (the grant's own expiry runs on the database clock). */
  async function viaSettings(label: string, seed: (ownerRef: string) => Promise<SeededNetopiaSubscription>, at: Date, spentMicros: number) {
    const identity = testHttpIdentity(label);
    const seeded = await seed(identity.authenticated.ownerRef);
    const grant = randomBytes(32).toString("base64url");
    await seedWithdrawalGrant(database.pool, identity, grant);
    const deps = subscriptionDeps(database.pool, { clock: () => at, ownerSpend: spending(spentMicros) });
    return { seeded, run: () => withdraw(deps, { authenticated: identity.authenticated, grantToken: grant }) };
  }

  /** The owner's command for a statement that arrived at `at`. */
  async function viaCommand(seed: (ownerRef: string) => Promise<SeededNetopiaSubscription>, at: Date, spentMicros: number) {
    const seeded = await seed(randomUUID());
    return {
      seeded,
      run: () => recordOwnerWithdrawal({ ...stores(), ownerSpend: spending(spentMicros) }, { ownerRef: seeded.ownerRef, receivedAt: at })
    };
  }

  it("refunds the money-data reviewer's worked example per payment, the same in Settings and by the command", async () => {
    // Final review F1, on fixed dates: Romania, Plus from Wednesday 1 April 2026 09:00 UTC (a 30-day period, 24.20),
    // Max quoted and paid on day 13 ((200 − 20) × 17/30 = 102.00 net, 123.42 with VAT), 3.00 of credit spent, and
    // the withdrawal half a day later.
    const activatedAt = new Date("2026-04-01T09:00:00.000Z");
    const day13 = new Date(activatedAt.getTime() + 13 * DAY);
    const withdrewAt = new Date(activatedAt.getTime() + 13.5 * DAY);
    let transaction = 7_730_000;
    const workedExample = async (ownerRef: string) => {
      const seeded = await seedNetopiaSubscription(database.pool, { ownerRef, planId: "PLUS", activatedAt, taxCountry: "RO" });
      expect([seeded.totalMicros, seeded.periodEnd]).toEqual([24_200_000, new Date("2026-05-01T09:00:00.000Z")]);
      // seedPaidUpgrade quotes one minute before the payment, so the upgrade's coverage starts on day 13 exactly.
      await seedPaidUpgrade(database.pool, seeded, {
        at: new Date(day13.getTime() + 60_000), planId: "MAX", netMicros: 102_000_000, taxMicros: 21_420_000,
        providerPaymentId: String(transaction += 1), monthCreditOverrideMicros: 87_166_666
      });
      return seeded;
    };
    // Plus gives back 13.31 (16.5 of its 30 days); Max gives back 123.42 × (1 − 3.00/87.17) = 119.17, because the
    // credit share is larger than its half day of 17. Before W6 the whole 147.62 was charged 13.5 of 30 days: 81.19.
    const expected = 132_480_000;
    const settings = await viaSettings("w6-worked", workedExample, withdrewAt, 3_000_000);
    expect(await settings.run()).toEqual({ refundMicros: expected });
    const command = await viaCommand(workedExample, withdrewAt, 3_000_000);
    expect(await command.run()).toEqual({ kind: "REFUNDING", refundMicros: expected });
    for (const { seeded } of [settings, command]) {
      expect((await rows().subscriptionEvents(seeded.subscriptionId)).at(-1))
        .toMatchObject({ kind: "WITHDRAWN", data: { refund_micros: expected, withdrew_at: withdrewAt.toISOString() } });
      // A4(b) unchanged: the newest payment (the upgrade) gives back first, the rest comes from Plus.
      expect(await withdrawalRequests(seeded.initialChargeId)).toEqual([[seeded.providerPaymentId, expected - 123_420_000]]);
    }
  }, 20_000);

  it("refunds in full a payment made after the statement arrived; one made before it keeps its share (P2-W6, C1)", async () => {
    // The W6 judge's example: Romania, Plus from 1 April 2026 09:00 UTC (24.20), the emailed statement arrives on
    // day 13 with 2.50 of Plus's 5.00 credit spent, and a Max upgrade is paid on day 14 ((200 − 20) × 16/30 = 96.00
    // net, 116.16 with VAT) before the owner runs the command.
    const activatedAt = new Date("2026-04-01T09:00:00.000Z");
    const day13 = new Date(activatedAt.getTime() + 13 * DAY);
    let transaction = 7_740_000;
    const upgradedToMax = async (upgrade: Readonly<{ at: Date; netMicros: number; taxMicros: number; monthCreditOverrideMicros: number }>) => {
      const seeded = await seedNetopiaSubscription(database.pool, {
        ownerRef: randomUUID(), planId: "PLUS", activatedAt, taxCountry: "RO"
      });
      expect(seeded.totalMicros).toBe(24_200_000);
      const paid = await seedPaidUpgrade(database.pool, seeded, { ...upgrade, planId: "MAX", providerPaymentId: String(transaction += 1) });
      return { seeded, upgradeChargeId: paid.chargeId, upgradeTransactionId: String(transaction) };
    };
    const command = (seeded: SeededNetopiaSubscription, receivedAt: Date) =>
      recordOwnerWithdrawal({ ...stores(), ownerSpend: spending(2_500_000) }, { ownerRef: seeded.ownerRef, receivedAt });

    // Plus gives back its credit share, 24.20 × (1 − 2.50/5.00) = 12.10 (smaller than its 17 of 30 days), and the
    // upgrade, paid after the person had withdrawn, goes back whole: 128.26. Before C1 it kept the same credit share
    // of the upgrade (58.08), and the refund was 70.18 of 140.36.
    const after = await upgradedToMax({
      at: new Date(activatedAt.getTime() + 14 * DAY), netMicros: 96_000_000, taxMicros: 20_160_000,
      monthCreditOverrideMicros: 82_333_333
    });
    expect(await command(after.seeded, day13)).toEqual({ kind: "REFUNDING", refundMicros: 128_260_000 });
    expect((await rows().subscriptionEvents(after.seeded.subscriptionId)).at(-1))
      .toMatchObject({ kind: "WITHDRAWN", data: { refund_micros: 128_260_000, withdrew_at: day13.toISOString() } });
    // A4(b) unchanged, newest first: the upgrade's payment goes back whole, then Plus's 12.10.
    expect(await withdrawalRequests(after.upgradeChargeId)).toEqual([[after.upgradeTransactionId, 116_160_000]]);
    expect(await withdrawalRequests(after.seeded.initialChargeId)).toEqual([[after.seeded.providerPaymentId, 12_100_000]]);
    expect((await emailOf("M8_RECEIVED", after.seeded.subscriptionId)).map((row) => row.payload)).toEqual([expect.objectContaining({
      template: "M8_RECEIVED", "param.withdrawalDate": day13.toISOString(), "param.refundAmount": "128.26"
    })]);

    // Control: a statement received after the upgrade is measured as before. Max paid half a day earlier, on day 12.5
    // ((200 − 20) × 17.5/30 = 105.00 net, 127.05 with VAT), so at day 13 each payment gives back its own share, with
    // Max's credit (A6's override, 89.58) in force.
    const upgradeAt = new Date(activatedAt.getTime() + 12.5 * DAY);
    const before = await upgradedToMax({
      at: upgradeAt, netMicros: 105_000_000, taxMicros: 22_050_000, monthCreditOverrideMicros: 89_583_333
    });
    const expected = withdrawalRefundPerPaymentMicros({
      payments: [
        { paidMicros: 24_200_000, coverageStart: before.seeded.periodStart, coverageEnd: before.seeded.periodEnd },
        // seedPaidUpgrade quotes one minute before the payment: the upgrade's coverage starts there.
        { paidMicros: 127_050_000, coverageStart: new Date(upgradeAt.getTime() - 60_000), coverageEnd: before.seeded.periodEnd }
      ],
      now: day13, creditSpentMicros: 2_500_000, monthlyCreditMicros: 89_583_333
    });
    // Plus 24.20 × 17/30 = 13.71 (its days), Max 127.05 × 17 days of its 17.5 days and a minute = 123.41: 137.12.
    expect(expected).toBe(137_120_000);
    expect(await command(before.seeded, day13)).toEqual({ kind: "REFUNDING", refundMicros: expected });
    expect(await withdrawalRequests(before.upgradeChargeId)).toEqual([[before.upgradeTransactionId, 127_050_000]]);
    expect(await withdrawalRequests(before.seeded.initialChargeId))
      .toEqual([[before.seeded.providerPaymentId, expected - 127_050_000]]);
  }, 20_000);

  it("keeps a window whose 14th day is a Saturday open through Monday, in Settings and by the command", async () => {
    // Romania, activated Saturday 5 September 2026: the 14th day is Saturday 19 September, so the window closes at
    // Monday 21 September's midnight, Bucharest time (21:00 UTC).
    const saturday = (ownerRef: string) => seedNetopiaSubscription(database.pool, {
      ownerRef, planId: "PLUS", activatedAt: new Date("2026-09-05T09:00:00.000Z"), taxCountry: "RO"
    });
    const mondayEvening = new Date("2026-09-21T20:59:00.000Z");
    const tuesdayMidnight = new Date("2026-09-21T21:00:00.000Z");
    const refund = (await (await viaSettings("w6-monday", saturday, mondayEvening, 0)).run()).refundMicros;
    expect(refund).toBeGreaterThan(0);
    expect(await (await viaCommand(saturday, mondayEvening, 0)).run()).toEqual({ kind: "REFUNDING", refundMicros: refund });
    await expect((await viaSettings("w6-tuesday", saturday, tuesdayMidnight, 0)).run())
      .rejects.toMatchObject({ code: "WITHDRAWAL_WINDOW_CLOSED" });
    await expect((await viaCommand(saturday, tuesdayMidnight, 0)).run()).rejects.toMatchObject({ code: "WITHDRAWAL_WINDOW_CLOSED" });
  }, 20_000);
});
