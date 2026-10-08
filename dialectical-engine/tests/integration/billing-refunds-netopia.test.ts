import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeWindows, foldSubscription, type CardPayments, type PaymentReport } from "@debateai/billing-core";
import {
  AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository, migrate, RETIRED_OUTBOX_KINDS,
  type OutboxJob
} from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testBillingPlans, testBillingPolicy, testCountryPolicy } from "../support/billingFixtures.js";
import {
  recordingAudit, seedNetopiaSubscription, subscriptionDeps, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY
} from "../support/billingSubscriptionFixtures.js";
import { recordDisputeOutcome } from "../../apps/api/src/billing/dispute-cli.js";
import { OwnerJobs } from "../../apps/api/src/billing/owner-jobs.js";
import { heldByChargeback, RefundDesk, refundReminderDue } from "../../apps/api/src/billing/refunds.js";
import { chargeEvent, newChargeId, subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { createInitialSettlement } from "../../apps/api/src/billing/settlement-initial.js";
import { VerifyPaymentHandler } from "../../apps/api/src/billing/verify-payment.js";
import { readSubscriptionView } from "../../apps/api/src/billing/subscription-view.js";
import { recordOwnerWithdrawal, settleOwnerWithdrawal, withdrawStoresFor } from "../../apps/api/src/billing/withdraw-cli.js";
import { recordWithdrawal } from "../../apps/api/src/billing/withdrawal.js";

let database: TestDatabase;
let repository: BillingRepository;
let jobs: BillingJobQueries;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  repository = new BillingRepository(database.pool);
  jobs = new BillingJobQueries(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const DAY = 86_400_000;

/** The port: scripted status reads, and (API mode only) a refund call that records what it was asked. */
class RefundPort implements Pick<CardPayments, "status" | "refund"> {
  readonly refunds: Array<Readonly<{ orderId: string; providerPaymentId: string; amountMicros: number }>> = [];
  readonly statuses = new Map<string, PaymentReport>();
  refund?: NonNullable<CardPayments["refund"]>;
  constructor(apiMode: boolean) {
    if (apiMode) this.refund = async (input) => { this.refunds.push(input); return this.statuses.get(input.orderId)!; };
  }
  async status(input: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER"> {
    return this.statuses.get(input.orderId) ?? "NO_SUCH_ORDER";
  }
}

const report = (orderId: string, providerPaymentId: string, state: PaymentReport["state"], amountMicros: number): PaymentReport => Object.freeze({
  orderId, providerPaymentId, state, providerStatus: state === "REFUNDED" ? "8" : state === "CHARGEBACK_OPENED" ? "9" : "3", amountMicros, currency: "USD",
  cardCountry: "DE", savedCard: null, declineCode: null, declineSide: null, bankDeclined: false, occurredAt: null, clientId: null
});

function deskFor(port: RefundPort, clock: { now: Date }) {
  const audit = recordingAudit();
  const refunds = new RefundDesk({
    repository, jobs, policy: testBillingPolicy, audit, clock: () => clock.now,
    netopia: { payments: port, paymentEnvironment: "sandbox", jobs }
  });
  const entitlements = new EntitlementRepository(database.pool);
  const verify = new VerifyPaymentHandler({
    repository, jobs, refunds, entitlements, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    recordsKey: TEST_RECORDS_KEY, audit, netopia: { payments: port, paymentEnvironment: "sandbox", jobs }
  });
  verify.registerSettlement("INITIAL", createInitialSettlement({
    repository, entitlements, acceptances: new AcceptanceRepository(database.pool), policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL
  }));
  return { refunds, verify, audit };
}

async function paidPlan(_label: string) {
  return seedNetopiaSubscription(database.pool, {
    ownerRef: randomUUID() /* billing owner_ref is a uuid (0085) */, planId: "PLUS", activatedAt: new Date(Date.now() - 2 * DAY), taxCountry: "DE"
  });
}

/** Claims the one open job of this kind and ref, exactly as P1b's `claim` does, and hands it over as the worker would. */
async function claim(kind: string, ref: string, now: Date): Promise<OutboxJob> {
  const row = (await database.pool.query<{ job_id: string; payload: Record<string, unknown>; created_at: Date; not_before: Date; attempts: number }>(`
    UPDATE billing.outbox SET claimed_by = 'n14', claimed_at = $3, attempts = attempts + 1
    WHERE kind = $1 AND ref = $2 AND done_at IS NULL AND dead_at IS NULL
    RETURNING job_id, payload, created_at, not_before, attempts
  `, [kind, ref, now])).rows[0]!;
  return {
    jobId: row.job_id, kind, ref, payload: row.payload, createdAt: row.created_at, notBefore: row.not_before,
    attempts: row.attempts, claimedBy: "n14", claimedAt: now
  } as unknown as OutboxJob;
}
const stageOf = async (jobId: string) => jobs.jobStage(jobId);
const emails = async (template: string, needle: string) => (await database.pool.query<{ payload: Record<string, string> }>(
  "SELECT payload FROM billing.outbox WHERE kind = 'EMAIL' AND payload->>'template' = $1", [template]
)).rows.map((row) => row.payload).filter((payload) => JSON.stringify(payload).includes(needle));
const refundedRows = async (chargeId: string) => (await repository.charge(chargeId))!.events
  .filter((event) => event.kind === "REFUNDED").map((event) => event.amountMicros);

async function requestWhole(seeded: Awaited<ReturnType<typeof paidPlan>>, desk: RefundDesk, reason: "SUBSCRIPTION_ENDED" | "WITHDRAWAL", amountMicros: number) {
  await repository.withTransaction(async (client) => {
    await jobs.lockOwner(client, seeded.ownerRef);
    await desk.request(client, {
      chargeId: seeded.initialChargeId, transactionId: seeded.providerPaymentId, amountMicros,
      whole: amountMicros === seeded.totalMicros, ownerRef: seeded.ownerRef, reason
    }, new Date());
  });
}

describe("N14 refunds on NETOPIA: the owner mode", () => {
  it("queues PAYMENT_REFUND, emails the owner O2_REFUND_DUE with the whole amount and the command, and moves no money", async () => {
    const seeded = await paidPlan("due");
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds, audit } = deskFor(port, clock);
    await requestWhole(seeded, refunds, "SUBSCRIPTION_ENDED", seeded.totalMicros);
    const ref = `${seeded.initialChargeId}:${seeded.providerPaymentId}`;
    // No job of the previous card processor's refund kind (N23: RETIRED_OUTBOX_KINDS).
    expect((await database.pool.query("SELECT 1 FROM billing.outbox WHERE kind = ANY($2::text[]) AND ref = $1",
      [ref, [...RETIRED_OUTBOX_KINDS]])).rowCount).toBe(0);
    const job = await claim("PAYMENT_REFUND", ref, clock.now);
    expect(await refunds.handle(job, clock.now)).toEqual({ kind: "DONE" });
    expect(await stageOf(job.jobId)).toBe("OWNER_REFUND_DUE");
    expect(await refundedRows(seeded.initialChargeId)).toEqual([]);
    const [due] = await emails("O2_REFUND_DUE", seeded.initialChargeId);
    expect(due).toMatchObject({
      "param.chargeRef": seeded.initialChargeId, "param.paymentRef": seeded.providerPaymentId, "param.whole": "true",
      "param.currency": "USD", "param.refundReason": "SUBSCRIPTION_ENDED",
      "param.doneCommand": `pnpm billing:refund-done --charge ${seeded.initialChargeId} --amount ${(seeded.totalMicros / 1_000_000).toFixed(2)} --confirm`
    });
    expect(due!["param.refundDeadline"]).toBeUndefined();
    expect(audit.events).toContainEqual({ event: "billing.refund.owner_due", fields: { reason: "SUBSCRIPTION_ENDED" } });
  });

  it("records a WHOLE refund as soon as NETOPIA reports it, with the customer's email (spec §2.12.4)", async () => {
    const seeded = await paidPlan("whole-seen");
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds, verify } = deskFor(port, clock);
    await requestWhole(seeded, refunds, "SUBSCRIPTION_ENDED", seeded.totalMicros);
    port.statuses.set(seeded.initialChargeId, report(seeded.initialChargeId, seeded.providerPaymentId, "REFUNDED", seeded.totalMicros));
    const job = { jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: seeded.initialChargeId, payload: {}, attempts: 1, notBefore: clock.now,
      createdAt: clock.now, claimedBy: "n14", claimedAt: clock.now } as unknown as OutboxJob;
    expect(await verify.handle(job, clock.now)).toEqual({ kind: "DONE" });
    expect(await refundedRows(seeded.initialChargeId)).toEqual([seeded.totalMicros]);
    expect(await emails("M11_DUPLICATE", seeded.customerId)).toHaveLength(1);
    // Seen again: nothing more.
    expect(await verify.handle(job, clock.now)).toEqual({ kind: "DONE" });
    expect(await refundedRows(seeded.initialChargeId)).toEqual([seeded.totalMicros]);
  });

  it("records nothing for a PARTIAL request NETOPIA reports refunded, and the reminder asks for the command", async () => {
    const seeded = await paidPlan("partial-seen");
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds, verify } = deskFor(port, clock);
    await requestWhole(seeded, refunds, "WITHDRAWAL", 12_100_000);
    port.statuses.set(seeded.initialChargeId, report(seeded.initialChargeId, seeded.providerPaymentId, "REFUNDED", seeded.totalMicros));
    const job = { jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: seeded.initialChargeId, payload: {}, attempts: 1, notBefore: clock.now,
      createdAt: clock.now, claimedBy: "n14", claimedAt: clock.now } as unknown as OutboxJob;
    await verify.handle(job, clock.now);
    expect(await refundedRows(seeded.initialChargeId)).toEqual([]);
    expect(await refunds.remindOwnerRefunds(clock.now)).toBeGreaterThan(0);
    const [reminder] = await emails("O2_REFUND_REMINDER", seeded.initialChargeId);
    expect(reminder!["param.refundList"]).toContain(`- charge ${seeded.initialChargeId}, NETOPIA payment ${seeded.providerPaymentId}: refund 12.10 USD (part of the payment), reason WITHDRAWAL`);
    expect(reminder!["param.refundList"]).toContain("NETOPIA shows a refund: only the command is missing");
    // At most one reminder a day (its ref is the UTC day).
    await refunds.remindOwnerRefunds(clock.now);
    const today = (await database.pool.query("SELECT 1 FROM billing.outbox WHERE kind = 'EMAIL' AND ref = $1",
      [`O2_REFUND_REMINDER:${clock.now.toISOString().slice(0, 10)}`])).rowCount;
    expect(today).toBe(1);
  });

  it("records an owner's refund in parts: the rest stays open, and M8 and the credit note follow the last part", async () => {
    const seeded = await paidPlan("parts");
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds } = deskFor(port, clock);
    const withdrewAt = new Date(Date.now() - DAY);
    await repository.withTransaction(async (client) => {
      await jobs.lockOwner(client, seeded.ownerRef);
      const state = foldSubscription(await repository.subscriptionEvents(seeded.subscriptionId, client));
      await repository.appendSubscriptionEvent(client, subscriptionEvent(state, "WITHDRAWN", withdrewAt, { withdrew_at: withdrewAt.toISOString() }));
      await refunds.requestAll(client, {
        ownerRef: seeded.ownerRef, reason: "WITHDRAWAL", at: withdrewAt,
        allocations: [{ chargeId: seeded.initialChargeId, transactionId: seeded.providerPaymentId, amountMicros: 12_100_000 }]
      });
    });
    const ref = `${seeded.initialChargeId}:${seeded.providerPaymentId}`;
    await refunds.handle(await claim("PAYMENT_REFUND", ref, clock.now), clock.now);
    const [due] = await emails("O2_REFUND_DUE", seeded.initialChargeId);
    expect(due).toMatchObject({ "param.whole": "false", "param.refundDeadline": new Date(withdrewAt.getTime() + 14 * DAY).toISOString() });

    const first = await refunds.planOwnerRefund(seeded.initialChargeId, 5_000_000);
    expect(first).toMatchObject({ openMicros: 12_100_000, restMicros: 7_100_000, mail: null, reason: "WITHDRAWAL" });
    expect(await refunds.recordOwnerRefund(first, clock.now)).toBe("PART_RECORDED");
    expect(await refundedRows(seeded.initialChargeId)).toEqual([5_000_000]);
    expect(await emails("M8", seeded.customerId)).toHaveLength(0);
    await expect(refunds.planOwnerRefund(seeded.initialChargeId, 7_200_000)).rejects.toThrow("BILLING_REFUND_DONE_EXCEEDS_REQUEST");

    const last = await refunds.planOwnerRefund(seeded.initialChargeId, 7_100_000);
    expect(last.mail).toMatchObject({ template: "M8" });
    expect(last.mail!.text).toContain("12.10");
    expect(await refunds.recordOwnerRefund(last, clock.now)).toBe("RECORDED");
    expect(await refundedRows(seeded.initialChargeId)).toEqual([5_000_000, 7_100_000]);
    expect(await emails("M8", seeded.customerId)).toHaveLength(1);
    const notes = (await database.pool.query<{ payload: Record<string, unknown> }>(
      "SELECT payload FROM billing.outbox WHERE kind = 'QUADERNO_RECORD_REFUND' AND ref = $1", [ref]
    )).rows;
    expect(notes).toHaveLength(1);
    await expect(refunds.planOwnerRefund(seeded.initialChargeId, 1_000_000)).rejects.toThrow("BILLING_REFUND_DONE_NO_OPEN_REQUEST");
  });

  it("refuses the command on another system's charge", async () => {
    const seeded = await paidPlan("other-system");
    const clock = { now: new Date() };
    const audit = recordingAudit();
    const live = new RefundDesk({
      repository, jobs, policy: testBillingPolicy, audit, clock: () => clock.now,
      netopia: { payments: new RefundPort(false), paymentEnvironment: "live", jobs }
    });
    await expect(live.planOwnerRefund(seeded.initialChargeId, 1_000_000)).rejects.toThrow("BILLING_REFUND_DONE_OTHER_PAYMENT_SYSTEM");
  });

  it("records a 0.00 card-check release with no call and no email to the owner, ahead of the owner mode", async () => {
    const seeded = await paidPlan("release");
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds } = deskFor(port, clock);
    const chargeId = newChargeId();
    const paymentId = `ntp-cc-${chargeId.slice(0, 8)}`;
    await repository.withTransaction(async (client) => {
      await repository.insertCharge(client, {
        chargeId, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "CARD_CHECK", attempt: 1,
        periodStart: seeded.periodStart, periodEnd: seeded.periodEnd, quoteId: null, netMicros: 0, taxMicros: 0, totalMicros: 0,
        currency: "USD", createdAt: clock.now, paymentProvider: "netopia", paymentEnvironment: "sandbox"
      });
      await repository.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", clock.now, { providerPaymentId: null, amountMicros: 0, errorCode: null }));
      await repository.appendChargeEvent(client, chargeEvent(chargeId, "SUCCEEDED", clock.now, { providerPaymentId: paymentId, amountMicros: 0, errorCode: null }));
      await jobs.lockOwner(client, seeded.ownerRef);
      await refunds.request(client, { chargeId, transactionId: paymentId, amountMicros: 0, whole: true, ownerRef: seeded.ownerRef, reason: "CARD_CHECK_RELEASE" }, clock.now);
    });
    expect(await refunds.handle(await claim("PAYMENT_REFUND", `${chargeId}:${paymentId}`, clock.now), clock.now)).toEqual({ kind: "DONE" });
    expect(await refundedRows(chargeId)).toEqual([0]);
    expect(await emails("O2_REFUND_DUE", chargeId)).toHaveLength(0);
  });

  it("records a refund made in NETOPIA's admin with no request of ours as A9's PROVIDER_REFUND", async () => {
    const seeded = await paidPlan("by-hand");
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { verify, audit } = deskFor(port, clock);
    port.statuses.set(seeded.initialChargeId, report(seeded.initialChargeId, seeded.providerPaymentId, "REFUNDED", seeded.totalMicros));
    await verify.handle({ jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: seeded.initialChargeId, payload: {}, attempts: 1,
      notBefore: clock.now, createdAt: clock.now, claimedBy: "n14", claimedAt: clock.now } as unknown as OutboxJob, clock.now);
    const rows = (await repository.charge(seeded.initialChargeId))!.events.filter((event) => event.kind === "REFUNDED");
    expect(rows.map((event) => [event.errorCode, event.amountMicros])).toEqual([["PROVIDER_REFUND", seeded.totalMicros]]);
    expect(audit.events).toContainEqual({ event: "billing.invoice.unknown", fields: { issuer: "QUADERNO", kind: "CREDIT_NOTE", code: "CREDIT_NOTE_MANUAL" } });
  });
});

describe("N14 refunds on NETOPIA: the API mode (dormant until N-10)", () => {
  it("calls NETOPIA's refund once, and records a payment already REFUNDED instead of refunding again", async () => {
    const seeded = await paidPlan("api");
    const port = new RefundPort(true);
    const clock = { now: new Date() };
    const { refunds } = deskFor(port, clock);
    await requestWhole(seeded, refunds, "SUBSCRIPTION_ENDED", seeded.totalMicros);
    port.statuses.set(seeded.initialChargeId, report(seeded.initialChargeId, seeded.providerPaymentId, "REFUNDED", seeded.totalMicros));
    const ref = `${seeded.initialChargeId}:${seeded.providerPaymentId}`;
    expect(await refunds.handle(await claim("PAYMENT_REFUND", ref, clock.now), clock.now)).toEqual({ kind: "DONE" });
    expect(port.refunds).toEqual([{ orderId: seeded.initialChargeId, providerPaymentId: seeded.providerPaymentId, amountMicros: seeded.totalMicros }]);
    expect(await refundedRows(seeded.initialChargeId)).toEqual([seeded.totalMicros]);

    const again = await paidPlan("api-again");
    await requestWhole(again, refunds, "SUBSCRIPTION_ENDED", again.totalMicros);
    port.statuses.set(again.initialChargeId, report(again.initialChargeId, again.providerPaymentId, "REFUNDED", again.totalMicros));
    const job = await claim("PAYMENT_REFUND", `${again.initialChargeId}:${again.providerPaymentId}`, clock.now);
    expect(await refunds.handle({ ...job, attempts: 2 } as OutboxJob, clock.now)).toEqual({ kind: "DONE" });
    expect(port.refunds.filter((call) => call.orderId === again.initialChargeId)).toEqual([]);
    expect(await refundedRows(again.initialChargeId)).toEqual([again.totalMicros]);
  });
});

describe("N14 the owner's daily job and the withdrawal on a NETOPIA plan", () => {
  it("runs the refund reminders in the daily owner job", async () => {
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds } = deskFor(port, clock);
    const calls: Date[] = [];
    const owner = new OwnerJobs({
      billing: repository, jobs, taxAuthorities: [] as never, audit: recordingAudit(), clock: () => clock.now,
      refunds: { remindOwnerRefunds: async (now: Date) => { calls.push(now); return refunds.remindOwnerRefunds(now); } }
    });
    await owner.schedule();
    expect(calls).toEqual([clock.now]);
  });

  it("lets a NETOPIA plan withdraw: the refund goes to the owner mode (N11's guard note)", async () => {
    const seeded = await paidPlan("withdraw");
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds } = deskFor(port, clock);
    const deps = subscriptionDeps(database.pool, { refunds, paymentEnvironment: "sandbox", clock: () => clock.now });
    const outcome = await recordWithdrawal(deps, {
      ownerRef: seeded.ownerRef, withdrewAt: clock.now, source: "OWNER", authorize: async () => undefined
    });
    expect(outcome.refundMicros).toBeGreaterThan(0);
    const queued = (await database.pool.query<{ kind: string }>(
      "SELECT kind FROM billing.outbox WHERE ref = $1", [`${seeded.initialChargeId}:${seeded.providerPaymentId}`]
    )).rows.map((row) => row.kind);
    expect(queued).toEqual(["PAYMENT_REFUND"]);
  });

  it("shows a NETOPIA plan's withdrawal window in its own environment only (spec §2.5.4, §2.5.6)", async () => {
    const seeded = await paidPlan("view"); // DE, activated two days ago: inside the 14 days
    const now = new Date();
    const here = await readSubscriptionView(subscriptionDeps(database.pool, { paymentEnvironment: "sandbox" }), seeded.ownerRef, now);
    expect(here?.withdrawal_open_until).not.toBeNull();
    expect(here?.withdrawal_last_day).not.toBeNull();
    const elsewhere = await readSubscriptionView(subscriptionDeps(database.pool, { paymentEnvironment: "live" }), seeded.ownerRef, now);
    expect(elsewhere?.withdrawal_open_until).toBeNull();
  });

  it("lets the owner's withdraw command take a NETOPIA plan of its own environment only (ruling PR-32, G2)", async () => {
    const seeded = await paidPlan("command");
    const now = new Date();
    const storesFor = (paymentEnvironment: "sandbox" | "live") => withdrawStoresFor(database.pool, {
      policy: testBillingPolicy, plans: testBillingPlans, audit: recordingAudit(), clock: () => new Date(), paymentEnvironment
    });
    // A refund made in NETOPIA's admin on the payment (A9's PROVIDER_REFUND): the withdrawal is the owner's to settle.
    await repository.withTransaction(async (client) => {
      for (const kind of ["REFUND_REQUESTED", "REFUNDED"] as const) {
        await repository.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, kind, new Date(now.getTime() - DAY), {
          providerPaymentId: seeded.providerPaymentId, amountMicros: 5_000_000, errorCode: "PROVIDER_REFUND"
        }));
      }
    });
    const receivedAt = new Date(now.getTime() - 60_000);
    await expect(recordOwnerWithdrawal(storesFor("live"), { ownerRef: seeded.ownerRef, receivedAt }))
      .rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
    expect(await recordOwnerWithdrawal(storesFor("sandbox"), { ownerRef: seeded.ownerRef, receivedAt })).toEqual({ kind: "OWNER_REVIEW" });
    // The settlement: refused from another environment, taken in its own.
    await expect(settleOwnerWithdrawal(storesFor("live"), { ownerRef: seeded.ownerRef, refundMicros: 0, dashboardMicros: 2_000_000 }))
      .rejects.toMatchObject({ code: "NOT_SUBSCRIBED" });
    expect(await repository.withdrawalOwnerSettlement(seeded.subscriptionId)).toBeNull();
    expect(await settleOwnerWithdrawal(storesFor("sandbox"), { ownerRef: seeded.ownerRef, refundMicros: 0, dashboardMicros: 2_000_000 }))
      .toEqual({ kind: "SETTLED", refundMicros: 0, dashboardMicros: 2_000_000 });
  });
});

describe("N15b an owner refund waits while the bank disputes the payment (ruling PR-41)", () => {
  const REASONS = ["WITHDRAWAL", "CARD_COUNTRY_BLOCKED", "ALREADY_SUBSCRIBED", "SUBSCRIPTION_ENDED", "DUPLICATE_PAYMENT",
    "UPGRADE_CLOSED", "CARD_CHECK_RELEASE", "CARD_CHECK_REFUSED", "CARD_CHECK_DEFERRED", "CARD_CHECK_NOT_LIVE"];
  const listed = async (chargeId: string) => (await repository.openOwnerRefunds("sandbox", REASONS)).filter((row) => row.chargeId === chargeId);
  const verifyJob = (chargeId: string, now: Date) => ({ jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: chargeId, payload: {}, attempts: 1,
    notBefore: now, createdAt: now, claimedBy: "n15b", claimedAt: now }) as unknown as OutboxJob;
  const heldAlerts = async (chargeId: string) => (await database.pool.query<{ ref: string; payload: Record<string, string> }>(
    "SELECT ref, payload FROM billing.outbox WHERE kind = 'EMAIL' AND payload->>'template' = 'O3' AND payload->>'param.reference' = $1"
      + " AND payload->>'param.reasonCode' = 'REFUND_HELD_BY_CHARGEBACK'", [`charge ${chargeId}`]
  )).rows;
  const reminderOn = async (day: Date) => (await database.pool.query<{ payload: Record<string, string> }>(
    "SELECT payload FROM billing.outbox WHERE kind = 'EMAIL' AND ref = $1", [`O2_REFUND_REMINDER:${day.toISOString().slice(0, 10)}`]
  )).rows.map((row) => row.payload);
  /** A day after today on which no refund still open in this suite's database is due for a reminder (each test's own day). */
  const quietDay = async (): Promise<Date> => {
    const open = await repository.openOwnerRefunds("sandbox", REASONS);
    for (let days = 1; days <= 30; days += 1) {
      const at = new Date(Date.now() + days * DAY);
      if (!open.some((row) => refundReminderDue({ requestedAt: row.requestedAt, deadline: null }, at))) return at;
    }
    throw new Error("no quiet day");
  };
  /** The realistic case: a withdrawal's part of the payment, requested at `at` (the plan withdrawn now). */
  async function withdrawalPart(seeded: Awaited<ReturnType<typeof paidPlan>>, desk: RefundDesk, amountMicros: number, at: Date): Promise<void> {
    const withdrewAt = new Date();
    await repository.withTransaction(async (client) => {
      await jobs.lockOwner(client, seeded.ownerRef);
      const state = foldSubscription(await repository.subscriptionEvents(seeded.subscriptionId, client));
      await repository.appendSubscriptionEvent(client, subscriptionEvent(state, "WITHDRAWN", withdrewAt, { withdrew_at: withdrewAt.toISOString() }));
      await desk.requestAll(client, {
        ownerRef: seeded.ownerRef, reason: "WITHDRAWAL", at,
        allocations: [{ chargeId: seeded.initialChargeId, transactionId: seeded.providerPaymentId, amountMicros }]
      });
    });
  }
  const chargedBack = (port: RefundPort, seeded: Awaited<ReturnType<typeof paidPlan>>) => port.statuses.set(seeded.initialChargeId,
    report(seeded.initialChargeId, seeded.providerPaymentId, "CHARGEBACK_OPENED", seeded.totalMicros));

  it("an open owner refund is held while the bank disputes the payment", async () => {
    const seeded = await paidPlan("held");
    const chargeId = seeded.initialChargeId;
    const port = new RefundPort(false);
    const day = await quietDay();
    const clock = { now: day };
    const { refunds, verify, audit } = deskFor(port, clock);
    await withdrawalPart(seeded, refunds, 12_100_000, day);
    expect(await listed(chargeId)).toHaveLength(1);
    chargedBack(port, seeded);
    expect(await verify.handle(verifyJob(chargeId, day), day)).toEqual({ kind: "DONE" });
    const charge = (await repository.charge(chargeId))!;
    expect(charge.events.filter((event) => event.kind === "CHARGEBACK")).toHaveLength(1);
    expect(heldByChargeback(charge, seeded.providerPaymentId)).toBe(true);
    expect(await listed(chargeId)).toEqual([]);
    // It was the only refund due today: no reminder at all.
    expect(await refunds.remindOwnerRefunds(day)).toBe(0);
    expect(await reminderOn(day)).toEqual([]);
    const alerts = await heldAlerts(chargeId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.ref).toBe(`O3:${chargeId}:REFUND_HELD:${seeded.providerPaymentId}`);
    expect(alerts[0]!.payload).toMatchObject({ recipient: "OWNER", "param.paymentAlert": "true", "param.jobKind": "PAYMENT" });
    expect(alerts[0]!.payload["param.nextSteps"]).toBe(`A refund of 12.10 USD (reason WITHDRAWAL) was due on this payment (NETOPIA payment ${seeded.providerPaymentId}), and`
      + " NETOPIA now reports a charge-back on it: the person's bank is taking the money back. Do not refund it in NETOPIA's"
      + " admin; the site no longer lists it as due. If the dispute ends for us, record that with"
      + ` pnpm billing:dispute --charge ${chargeId} --outcome won: the refund is then due again and comes back into the`
      + " reminder. If it ends for the person, nothing is left to refund. If you had already refunded it in NETOPIA's admin"
      + ` before the dispute, record that refund with pnpm billing:refund-done --charge ${chargeId} --amount 12.10`
      + " --despite-chargeback, and tell NETOPIA, so the dispute is answered.");
    // The same status again: no second O3, no second line.
    expect(await verify.handle(verifyJob(chargeId, day), day)).toEqual({ kind: "DONE" });
    expect(await heldAlerts(chargeId)).toHaveLength(1);
    expect(audit.events.filter((entry) => entry.event === "billing.refund.held_by_chargeback"))
      .toEqual([{ event: "billing.refund.held_by_chargeback", fields: { reason: "WITHDRAWAL" } }]);
  });

  it("the command refuses a held refund unless the owner says it was made before the dispute", async () => {
    const seeded = await paidPlan("held-command");
    const chargeId = seeded.initialChargeId;
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds, verify } = deskFor(port, clock);
    await withdrawalPart(seeded, refunds, 12_100_000, clock.now);
    chargedBack(port, seeded);
    await verify.handle(verifyJob(chargeId, clock.now), clock.now);
    await expect(refunds.planOwnerRefund(chargeId, 12_100_000)).rejects.toThrow("BILLING_REFUND_DONE_HELD_BY_CHARGEBACK");
    const plan = await refunds.planOwnerRefund(chargeId, 12_100_000, { despiteChargeback: true });
    expect(plan).toMatchObject({
      providerPaymentId: seeded.providerPaymentId, reason: "WITHDRAWAL", openMicros: 12_100_000, restMicros: 0, despiteChargeback: true
    });
    expect(plan.mail).toMatchObject({ template: "M8" });
    // The recording checks the hold again: a plan without the owner's word is refused, and nothing is written.
    await expect(refunds.recordOwnerRefund({ ...plan, despiteChargeback: false }, clock.now)).rejects.toThrow("BILLING_REFUND_DONE_HELD_BY_CHARGEBACK");
    expect(await refundedRows(chargeId)).toEqual([]);
    expect(await refunds.recordOwnerRefund(plan, clock.now)).toBe("RECORDED");
    expect(await refundedRows(chargeId)).toEqual([12_100_000]);
    expect(await emails("M8", seeded.customerId)).toHaveLength(1);
    const notes = await database.pool.query("SELECT 1 FROM billing.outbox WHERE kind = 'QUADERNO_RECORD_REFUND' AND ref = $1",
      [`${chargeId}:${seeded.providerPaymentId}`]);
    expect(notes.rowCount).toBe(1);
    await expect(refunds.planOwnerRefund(chargeId, 1_000_000, { despiteChargeback: true })).rejects.toThrow("BILLING_REFUND_DONE_NO_OPEN_REQUEST");
  });

  it("a dispute won makes the refund due again", async () => {
    const seeded = await paidPlan("held-won");
    const chargeId = seeded.initialChargeId;
    const port = new RefundPort(false);
    const day = await quietDay();
    const clock = { now: day };
    const { refunds, verify } = deskFor(port, clock);
    await withdrawalPart(seeded, refunds, 12_100_000, day);
    chargedBack(port, seeded);
    await verify.handle(verifyJob(chargeId, day), day);
    expect(await listed(chargeId)).toEqual([]);
    expect(await refunds.remindOwnerRefunds(day)).toBe(0);
    const stores = Object.freeze({ billing: repository, jobs, entitlements: new EntitlementRepository(database.pool), clock: () => day });
    expect(await recordDisputeOutcome(stores, { chargeRef: chargeId, outcome: "won" })).toBe("RESOLVED_AFTER_END");
    const charge = (await repository.charge(chargeId))!;
    expect(heldByChargeback(charge, seeded.providerPaymentId)).toBe(false);
    expect(await listed(chargeId)).toEqual([expect.objectContaining({ providerPaymentId: seeded.providerPaymentId, reason: "WITHDRAWAL", requestedMicros: 12_100_000 })]);
    // Its next due day (every third day from the request): the reminder lists it again, with its command.
    const next = new Date(day.getTime() + 3 * DAY);
    expect(await refunds.remindOwnerRefunds(next)).toBeGreaterThan(0);
    const [reminder] = await reminderOn(next);
    expect(reminder!["param.refundList"]).toContain(`- charge ${chargeId}, NETOPIA payment ${seeded.providerPaymentId}: refund 12.10 USD (part of the payment), reason WITHDRAWAL`);
    expect(await refunds.planOwnerRefund(chargeId, 12_100_000)).toMatchObject({ openMicros: 12_100_000, despiteChargeback: false });
  });

  it("a refund with no charge-back is unchanged", async () => {
    const seeded = await paidPlan("not-held");
    const chargeId = seeded.initialChargeId;
    const second = `${seeded.providerPaymentId}7`;
    const port = new RefundPort(false);
    // A day of its own, far from the other cases' reminders: the request is due on it (its first day).
    const day = new Date(Date.now() + 60 * DAY);
    const clock = { now: day };
    const { refunds, verify } = deskFor(port, clock);
    // A second payment on the same order, to give back whole; then the bank disputes the FIRST payment only.
    await repository.withTransaction(async (client) => {
      await repository.appendChargeEvent(client, chargeEvent(chargeId, "DUPLICATE_PAYMENT", day, {
        providerPaymentId: second, amountMicros: seeded.totalMicros, errorCode: null
      }));
      await jobs.lockOwner(client, seeded.ownerRef);
      await refunds.request(client, {
        chargeId, transactionId: second, amountMicros: seeded.totalMicros, whole: true, ownerRef: seeded.ownerRef, reason: "DUPLICATE_PAYMENT"
      }, day);
    });
    chargedBack(port, seeded);
    await verify.handle(verifyJob(chargeId, day), day);
    const charge = (await repository.charge(chargeId))!;
    expect(charge.events.filter((event) => event.kind === "CHARGEBACK").map((event) => event.providerPaymentId)).toEqual([seeded.providerPaymentId]);
    expect(heldByChargeback(charge, seeded.providerPaymentId)).toBe(true);
    expect(heldByChargeback(charge, second)).toBe(false);
    expect(await heldAlerts(chargeId)).toHaveLength(0);
    expect(await listed(chargeId)).toEqual([expect.objectContaining({ providerPaymentId: second, reason: "DUPLICATE_PAYMENT", whole: true })]);
    expect(await refunds.remindOwnerRefunds(day)).toBeGreaterThan(0);
    const [reminder] = await reminderOn(day);
    const amount = (seeded.totalMicros / 1_000_000).toFixed(2);
    expect(reminder!["param.refundList"]).toContain(`- charge ${chargeId}, NETOPIA payment ${second}: refund ${amount} USD (the whole payment), reason DUPLICATE_PAYMENT`);
    expect(await refunds.planOwnerRefund(chargeId, seeded.totalMicros)).toMatchObject({ providerPaymentId: second, despiteChargeback: false });
  });

  // Fix round 1 (F1): the PAYMENT_REFUND job of a held request moves no money and hands nothing to the owner.
  const heldSteps = (chargeId: string, paymentId: string, amount: string) => `A refund of ${amount} USD (reason WITHDRAWAL) was due on`
    + ` this payment (NETOPIA payment ${paymentId}), and NETOPIA now reports a charge-back on it: the person's bank is taking`
    + " the money back. Do not refund it in NETOPIA's admin; the site no longer lists it as due. If the dispute ends for us,"
    + ` record that with pnpm billing:dispute --charge ${chargeId} --outcome won: the refund is then due again and comes back`
    + " into the reminder. If it ends for the person, nothing is left to refund. If you had already refunded it in NETOPIA's"
    + ` admin before the dispute, record that refund with pnpm billing:refund-done --charge ${chargeId} --amount ${amount}`
    + " --despite-chargeback, and tell NETOPIA, so the dispute is answered.";
  const heldLines = (audit: ReturnType<typeof deskFor>["audit"]) => audit.events.filter((entry) => entry.event === "billing.refund.held_by_chargeback");
  const ownerDue = (audit: ReturnType<typeof deskFor>["audit"]) => audit.events.filter((entry) => entry.event === "billing.refund.owner_due");

  it("a refund asked for on a payment already under a dispute is held: its job hands nothing to the owner", async () => {
    const seeded = await paidPlan("held-before-request");
    const chargeId = seeded.initialChargeId;
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds, verify, audit } = deskFor(port, clock);
    chargedBack(port, seeded);
    expect(await verify.handle(verifyJob(chargeId, clock.now), clock.now)).toEqual({ kind: "DONE" });
    expect(await heldAlerts(chargeId)).toHaveLength(0); // no refund was open when the charge-back came
    await requestWhole(seeded, refunds, "WITHDRAWAL", 12_100_000);
    const job = await claim("PAYMENT_REFUND", `${chargeId}:${seeded.providerPaymentId}`, clock.now);
    expect(await refunds.handle(job, clock.now)).toEqual({ kind: "DONE" });
    expect(await stageOf(job.jobId)).toBeNull();
    expect(await emails("O2_REFUND_DUE", chargeId)).toHaveLength(0);
    expect(ownerDue(audit)).toEqual([]);
    expect(await refundedRows(chargeId)).toEqual([]);
    const alerts = await heldAlerts(chargeId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.ref).toBe(`O3:${chargeId}:REFUND_HELD:${seeded.providerPaymentId}`);
    expect(alerts[0]!.payload["param.nextSteps"]).toBe(heldSteps(chargeId, seeded.providerPaymentId, "12.10"));
    expect(heldLines(audit)).toEqual([{ event: "billing.refund.held_by_chargeback", fields: { reason: "WITHDRAWAL" } }]);
    // The request stays open (held): a dispute won brings it back by the existing rules.
    const charge = (await repository.charge(chargeId))!;
    expect(heldByChargeback(charge, seeded.providerPaymentId)).toBe(true);
    expect(charge.events.filter((event) => event.kind === "REFUND_REQUESTED")).toHaveLength(1);
  });

  it("the job of a refund held after it was asked for sends no O2_REFUND_DUE and no second O3", async () => {
    const seeded = await paidPlan("held-job-after");
    const chargeId = seeded.initialChargeId;
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds, verify, audit } = deskFor(port, clock);
    await requestWhole(seeded, refunds, "WITHDRAWAL", 12_100_000);
    chargedBack(port, seeded);
    expect(await verify.handle(verifyJob(chargeId, clock.now), clock.now)).toEqual({ kind: "DONE" });
    expect(await heldAlerts(chargeId)).toHaveLength(1);
    const job = await claim("PAYMENT_REFUND", `${chargeId}:${seeded.providerPaymentId}`, clock.now);
    expect(await refunds.handle(job, clock.now)).toEqual({ kind: "DONE" });
    expect(await stageOf(job.jobId)).toBeNull();
    expect(await emails("O2_REFUND_DUE", chargeId)).toHaveLength(0);
    expect(ownerDue(audit)).toEqual([]);
    expect(await heldAlerts(chargeId)).toHaveLength(1);
    expect(heldLines(audit)).toEqual([{ event: "billing.refund.held_by_chargeback", fields: { reason: "WITHDRAWAL" } }]);
  });

  it("the API mode never calls NETOPIA's refund on a held payment, and still records one NETOPIA already reports", async () => {
    const seeded = await paidPlan("held-api");
    const chargeId = seeded.initialChargeId;
    const port = new RefundPort(true);
    const clock = { now: new Date() };
    const { refunds, verify, audit } = deskFor(port, clock);
    await requestWhole(seeded, refunds, "WITHDRAWAL", 12_100_000);
    chargedBack(port, seeded);
    await verify.handle(verifyJob(chargeId, clock.now), clock.now);
    const job = await claim("PAYMENT_REFUND", `${chargeId}:${seeded.providerPaymentId}`, clock.now);
    expect(await refunds.handle(job, clock.now)).toEqual({ kind: "DONE" });
    expect(port.refunds).toEqual([]);
    expect(await stageOf(job.jobId)).toBeNull();
    expect(await refundedRows(chargeId)).toEqual([]);
    expect(await heldAlerts(chargeId)).toHaveLength(1);
    expect(heldLines(audit)).toHaveLength(1);

    // A retried job looks first: a refund NETOPIA already reports on the held payment is recorded, never made again.
    const again = await paidPlan("held-api-seen");
    await requestWhole(again, refunds, "SUBSCRIPTION_ENDED", again.totalMicros);
    chargedBack(port, again);
    await verify.handle(verifyJob(again.initialChargeId, clock.now), clock.now);
    port.statuses.set(again.initialChargeId, report(again.initialChargeId, again.providerPaymentId, "REFUNDED", again.totalMicros));
    const retried = await claim("PAYMENT_REFUND", `${again.initialChargeId}:${again.providerPaymentId}`, clock.now);
    expect(await refunds.handle({ ...retried, attempts: 2 } as OutboxJob, clock.now)).toEqual({ kind: "DONE" });
    expect(port.refunds).toEqual([]);
    expect(await refundedRows(again.initialChargeId)).toEqual([again.totalMicros]);
  });
});
