import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
import { BillingReconciler, statusNeedsVerify } from "../../apps/api/src/billing/reconcile.js";
import { heldByChargeback, RefundDesk, refundReminderDue } from "../../apps/api/src/billing/refunds.js";
import { chargeEvent, newChargeId, subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { createInitialSettlement } from "../../apps/api/src/billing/settlement-initial.js";
import { VerifyPaymentHandler } from "../../apps/api/src/billing/verify-payment.js";
import { readSubscriptionView } from "../../apps/api/src/billing/subscription-view.js";
import { recordOwnerWithdrawal, settleOwnerWithdrawal, withdrawStoresFor } from "../../apps/api/src/billing/withdraw-cli.js";
import { recordWithdrawal } from "../../apps/api/src/billing/withdrawal.js";

/**
 * O3 REFUND_HELD_BY_CHARGEBACK's steps (N15b; F8, ruling PR-56: the owner commands in README §14.8's host form, each on
 * its own line; refund-done previews first, then --confirm records).
 */
const ON_HOST = "systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api"
  + " --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm";
const heldStepsText = (chargeId: string, paymentId: string, amount: string) => [
  `A refund of ${amount} USD (reason WITHDRAWAL) was due on this payment (NETOPIA payment ${paymentId}), and NETOPIA now`
    + " reports a charge-back on it: the person's bank is taking the money back. Do not refund it in NETOPIA's admin; the"
    + " site no longer lists it as due.",
  "If the dispute ends for us, record that as root on the server with the command below (it records at once): the refund"
    + " is then due again and comes back into the reminder. If it ends for the person, nothing is left to refund.",
  `  ${ON_HOST} billing:dispute --charge ${chargeId} --outcome won`,
  "If you had already refunded it in NETOPIA's admin before the dispute, record that refund as root on the server with"
    + " the command below: run it once to see what it records, then again with --confirm added at the end to record it."
    + " Then tell NETOPIA, so the dispute is answered.",
  `  ${ON_HOST} billing:refund-done --charge ${chargeId} --amount ${amount} --despite-chargeback`
].join("\n");

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
  orderId, providerPaymentId, state,
  providerStatus: state === "REFUNDED" ? "8" : state === "CHARGEBACK_OPENED" ? "9" : state === "VOIDED" ? "4" : "3", amountMicros, currency: "USD",
  cardCountry: "DE", savedCard: null, declineCode: null, declineSide: null, bankDeclined: false, occurredAt: null, clientId: null
});

function deskFor(port: RefundPort, clock: { now: Date }, paymentEnvironment: "sandbox" | "live" = "sandbox") {
  const audit = recordingAudit();
  const refunds = new RefundDesk({
    repository, jobs, policy: testBillingPolicy, audit, clock: () => clock.now,
    netopia: { payments: port, paymentEnvironment, jobs }
  });
  const entitlements = new EntitlementRepository(database.pool);
  const verify = new VerifyPaymentHandler({
    repository, jobs, refunds, entitlements, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    recordsKey: TEST_RECORDS_KEY, audit, netopia: { payments: port, paymentEnvironment, jobs }
  });
  verify.registerSettlement("INITIAL", createInitialSettlement({
    repository, entitlements, acceptances: new AcceptanceRepository(database.pool), policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL
  }));
  return { refunds, verify, audit };
}

async function paidPlan(_label: string, paymentEnvironment: "sandbox" | "live" = "sandbox") {
  return seedNetopiaSubscription(database.pool, {
    ownerRef: randomUUID() /* billing owner_ref is a uuid (0085) */, planId: "PLUS", activatedAt: new Date(Date.now() - 2 * DAY), taxCountry: "DE",
    paymentEnvironment
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

async function requestWhole(
  seeded: Awaited<ReturnType<typeof paidPlan>>, desk: RefundDesk, reason: "SUBSCRIPTION_ENDED" | "WITHDRAWAL" | "ALREADY_SUBSCRIBED",
  amountMicros: number
) {
  await repository.withTransaction(async (client) => {
    await jobs.lockOwner(client, seeded.ownerRef);
    await desk.request(client, {
      chargeId: seeded.initialChargeId, transactionId: seeded.providerPaymentId, amountMicros,
      whole: amountMicros === seeded.totalMicros, ownerRef: seeded.ownerRef, reason
    }, new Date());
  });
}

// Placed first in the file on purpose: the README's query counts the whole database, and this suite shares one.
describe("F6b (ops-2): README §14.8's switch-off query open_owner_refunds, run exactly as the runbook writes it", () => {
  const readmeQuery = async (): Promise<string> => {
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    const line = readme.split("\n")
      .find((text) => text.startsWith("sudo -u postgres psql -d debateai -c \"SELECT count(*) AS open_owner_refunds")) ?? "";
    expect(line.endsWith("\"")).toBe(true);
    // The shell hands psql the text between -c " and the closing quote, with each \" read as ".
    return line.slice(line.indexOf("-c \"") + 4, -1).replaceAll("\\\"", "\"");
  };
  const withdrawalPart = async (seeded: Awaited<ReturnType<typeof paidPlan>>, desk: RefundDesk, amountMicros: number, at: Date) => {
    await repository.withTransaction(async (client) => {
      await jobs.lockOwner(client, seeded.ownerRef);
      const state = foldSubscription(await repository.subscriptionEvents(seeded.subscriptionId, client));
      await repository.appendSubscriptionEvent(client, subscriptionEvent(state, "WITHDRAWN", at, { withdrew_at: at.toISOString() }));
      await desk.requestAll(client, {
        ownerRef: seeded.ownerRef, reason: "WITHDRAWAL", at,
        allocations: [{ chargeId: seeded.initialChargeId, transactionId: seeded.providerPaymentId, amountMicros }]
      });
    });
  };
  /** The owner mode hands the refund over: PAYMENT_REFUND ends DONE, and its O2_REFUND_DUE email is then sent. */
  const handOver = async (seeded: Awaited<ReturnType<typeof paidPlan>>, desk: RefundDesk, now: Date) => {
    const ref = `${seeded.initialChargeId}:${seeded.providerPaymentId}`;
    const job = await claim("PAYMENT_REFUND", ref, now);
    expect(await desk.handle(job, now)).toEqual({ kind: "DONE" });
    expect(await repository.complete(job.jobId, now)).toBe(true); // as the outbox worker finishes a DONE job
    const sent = await database.pool.query(
      "UPDATE billing.outbox SET done_at = $2 WHERE kind = 'EMAIL' AND payload->>'template' = 'O2_REFUND_DUE'"
        + " AND payload->>'param.chargeRef' = $1 AND done_at IS NULL", [seeded.initialChargeId, now]);
    expect(sent.rowCount).toBe(1);
    // So no open job of the refund is left for the second switch-off query to count.
    expect((await database.pool.query(
      "SELECT kind, ref, payload->>'template' AS template FROM billing.outbox WHERE done_at IS NULL AND dead_at IS NULL"
        + " AND (ref = $1 OR payload->>'param.chargeRef' = $2)",
      [ref, seeded.initialChargeId])).rows).toEqual([]);
  };

  // The query counts live refunds only (owed to real people), so this case runs on live plans; a sandbox one is left out.
  it("counts a refund handed to the owner once O2_REFUND_DUE is sent, until its parts are recorded; a held one stays counted", async () => {
    const sql = await readmeQuery();
    const openOwnerRefunds = async (): Promise<number> =>
      Number((await database.pool.query<{ open_owner_refunds: string }>(sql)).rows[0]!.open_owner_refunds);
    expect(await openOwnerRefunds(), "this case runs on a database with no refund yet").toBe(0);

    const seeded = await paidPlan("switch-off", "live");
    const clock = { now: new Date() };
    const { refunds } = deskFor(new RefundPort(false), clock, "live");
    await withdrawalPart(seeded, refunds, 12_100_000, new Date(Date.now() - DAY));
    await handOver(seeded, refunds, clock.now);
    expect(await openOwnerRefunds()).toBe(1);
    // A part recorded by the owner's command keeps the rest open; the last part closes it.
    expect(await refunds.recordOwnerRefund(await refunds.planOwnerRefund(seeded.initialChargeId, 5_000_000), clock.now)).toBe("PART_RECORDED");
    expect(await openOwnerRefunds()).toBe(1);
    expect(await refunds.recordOwnerRefund(await refunds.planOwnerRefund(seeded.initialChargeId, 7_100_000), clock.now)).toBe("RECORDED");
    expect(await openOwnerRefunds()).toBe(0);

    // A refund a charge-back holds is still owed once the dispute ends for us, so the switch-off query counts it, although
    // the reminder's own list (BillingRepository.openOwnerRefunds) leaves it out while the dispute lasts.
    const held = await paidPlan("switch-off-held", "live");
    const port = new RefundPort(false);
    const desk = deskFor(port, clock, "live");
    await withdrawalPart(held, desk.refunds, 12_100_000, new Date(Date.now() - DAY));
    await handOver(held, desk.refunds, clock.now);
    port.statuses.set(held.initialChargeId, report(held.initialChargeId, held.providerPaymentId, "CHARGEBACK_OPENED", held.totalMicros));
    const verifyJob = { jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: held.initialChargeId, payload: {}, attempts: 1,
      notBefore: clock.now, createdAt: clock.now, claimedBy: "f6b", claimedAt: clock.now } as unknown as OutboxJob;
    expect(await desk.verify.handle(verifyJob, clock.now)).toEqual({ kind: "DONE" });
    expect(heldByChargeback((await repository.charge(held.initialChargeId))!, held.providerPaymentId)).toBe(true);
    expect((await repository.openOwnerRefunds("live", ["WITHDRAWAL"])).map((row) => row.chargeId)).not.toContain(held.initialChargeId);
    expect(await openOwnerRefunds()).toBe(1);

    // A sandbox refund is test money: handed over and open in the sandbox's own list, it leaves the README count unchanged.
    const sandbox = await paidPlan("switch-off-sandbox", "sandbox");
    const sandboxDesk = deskFor(new RefundPort(false), clock, "sandbox");
    await withdrawalPart(sandbox, sandboxDesk.refunds, 12_100_000, new Date(Date.now() - DAY));
    await handOver(sandbox, sandboxDesk.refunds, clock.now);
    expect((await repository.openOwnerRefunds("sandbox", ["WITHDRAWAL"])).map((row) => row.chargeId)).toContain(sandbox.initialChargeId);
    expect(await openOwnerRefunds()).toBe(1);
    // Recorded, so the later cases of this shared database find no open sandbox refund of this case's.
    expect(await sandboxDesk.refunds.recordOwnerRefund(await sandboxDesk.refunds.planOwnerRefund(sandbox.initialChargeId, 12_100_000), clock.now))
      .toBe("RECORDED");
    expect(await openOwnerRefunds()).toBe(1);
  });

  it("F6b (ops-5, ops-6): the runbook's two live-message queries run on the migrated schema as written", async () => {
    const readme = await readFile(new URL("../../deploy/vps/README.md", import.meta.url), "utf8");
    for (const prefix of ["SELECT n.received_at, n.order_id AS charge_ref", "SELECT n.received_at, n.provider_status, o.outcome"]) {
      const line = readme.split("\n").find((text) => text.startsWith(`sudo -u postgres psql -d debateai -c "${prefix}`)) ?? "";
      expect(line.endsWith("\""), prefix).toBe(true);
      const result = await database.pool.query(line.slice(line.indexOf("-c \"") + 4, -1));
      expect(result.fields.length, prefix).toBeGreaterThanOrEqual(3);
    }
  });
});

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
      // F6a (ops-4): README §14.8's host form, without --confirm (the email says to preview it first).
      "param.doneCommand": "systemd-run --pipe --wait --collect --uid=debateai-api --gid=debateai-api"
        + " --property=EnvironmentFile=/etc/debateai/api.env --working-directory=/opt/debateai/dialectical-engine /usr/bin/pnpm"
        + ` billing:refund-done --charge ${seeded.initialChargeId} --amount ${(seeded.totalMicros / 1_000_000).toFixed(2)}`
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
      .toEqual({ kind: "SETTLED", refundMicros: 0, dashboardMicros: 2_000_000, currency: "USD" });
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
    expect(alerts[0]!.payload["param.nextSteps"]).toBe(heldStepsText(chargeId, seeded.providerPaymentId, "12.10"));
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
  const heldSteps = heldStepsText;
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
    // F6a (ui-3): the plan was live, so the same VERIFY_PAYMENT paused it and queued the customer's M10; the O3 says so.
    const [paused] = await heldAlerts(chargeId);
    expect(paused!.payload["param.nextSteps"]).toBe(heldSteps(chargeId, seeded.providerPaymentId, "12.10").replace(
      "the money back. ", "the money back. The customer was emailed that the plan is paused (M10). "));
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

describe("F2 a void NETOPIA reports on a payment with our own open refund request (money-2, ruling PR-55)", () => {
  const REASONS = ["WITHDRAWAL", "CARD_COUNTRY_BLOCKED", "ALREADY_SUBSCRIBED", "SUBSCRIPTION_ENDED", "DUPLICATE_PAYMENT",
    "UPGRADE_CLOSED", "CARD_CHECK_RELEASE", "CARD_CHECK_REFUSED", "CARD_CHECK_DEFERRED", "CARD_CHECK_NOT_LIVE"];
  const listed = async (chargeId: string) => (await repository.openOwnerRefunds("sandbox", REASONS)).filter((row) => row.chargeId === chargeId);
  const verifyJob = (chargeId: string, now: Date) => ({ jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: chargeId, payload: {}, attempts: 1,
    notBefore: now, createdAt: now, claimedBy: "f2", claimedAt: now }) as unknown as OutboxJob;
  const verifyRows = async (chargeId: string) => (await database.pool.query(
    "SELECT 1 FROM billing.outbox WHERE kind = 'VERIFY_PAYMENT' AND ref = $1", [chargeId]
  )).rowCount;

  it("a refused checkout's whole request, then a VOIDED read: one REFUNDED, the customer's email, nothing open, and no VERIFY after", async () => {
    const seeded = await paidPlan("voided-own");
    const chargeId = seeded.initialChargeId;
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds, verify } = deskFor(port, clock);
    await requestWhole(seeded, refunds, "ALREADY_SUBSCRIBED", seeded.totalMicros);
    expect(await listed(chargeId)).toHaveLength(1);
    const voided = report(chargeId, seeded.providerPaymentId, "VOIDED", seeded.totalMicros);
    port.statuses.set(chargeId, voided);
    expect(await verify.handle(verifyJob(chargeId, clock.now), clock.now)).toEqual({ kind: "DONE" });
    const refunded = (await repository.charge(chargeId))!.events.filter((event) => event.kind === "REFUNDED");
    expect(refunded.map((event) => [event.errorCode, event.amountMicros])).toEqual([["ALREADY_SUBSCRIBED", seeded.totalMicros]]);
    expect(await emails("M11_DUPLICATE", seeded.customerId)).toHaveLength(1);
    expect(await listed(chargeId)).toEqual([]);
    // Seen again: nothing more.
    expect(await verify.handle(verifyJob(chargeId, clock.now), clock.now)).toEqual({ kind: "DONE" });
    expect(await refundedRows(chargeId)).toEqual([seeded.totalMicros]);
    expect(await emails("M11_DUPLICATE", seeded.customerId)).toHaveLength(1);
    expect(statusNeedsVerify((await repository.charge(chargeId))!, voided)).toBe(false);
    const verifiedAt = (await repository.lastStatusRead(chargeId))!;
    expect(verifiedAt).toEqual({ at: clock.now, outcome: "VOIDED" });
    const later = { now: new Date(clock.now.getTime() + DAY + 3_600_000) };
    const reconciler = new BillingReconciler({
      billing: repository, jobs, audit: recordingAudit(), clock: () => later.now, kick: () => undefined,
      netopia: { payments: port, paymentEnvironment: "sandbox", jobs, pool: database.pool }
    });
    // 25 hours on: the refund is recorded, so the REFUND schedule's daily read has stopped; the PAID schedule's 24-hour
    // step (the seeded payment is two days old) was already met by VERIFY's own read. Nothing is read.
    await reconciler.runStatusChecks(later.now);
    expect(await repository.lastStatusRead(chargeId)).toEqual(verifiedAt);
    expect(await verifyRows(chargeId)).toBe(0);
    // Six days on, past the PAID schedule's 168-hour step: the charge is read again, NETOPIA still says VOIDED, and no
    // VERIFY is queued for it.
    later.now = new Date(clock.now.getTime() + 6 * DAY);
    await reconciler.runStatusChecks(later.now);
    expect(await repository.lastStatusRead(chargeId)).toEqual({ at: later.now, outcome: "VOIDED" });
    expect(await verifyRows(chargeId)).toBe(0);
  });

  it("ruling PR-41: a VOIDED read on a payment whose whole own request a charge-back holds records nothing and emails nobody", async () => {
    const seeded = await paidPlan("voided-held");
    const chargeId = seeded.initialChargeId;
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds, verify } = deskFor(port, clock);
    await requestWhole(seeded, refunds, "ALREADY_SUBSCRIBED", seeded.totalMicros);
    expect(await listed(chargeId)).toHaveLength(1);
    // The bank disputes the payment, recorded through VERIFY (N15b's pattern): the request is held.
    port.statuses.set(chargeId, report(chargeId, seeded.providerPaymentId, "CHARGEBACK_OPENED", seeded.totalMicros));
    expect(await verify.handle(verifyJob(chargeId, clock.now), clock.now)).toEqual({ kind: "DONE" });
    expect(heldByChargeback((await repository.charge(chargeId))!, seeded.providerPaymentId)).toBe(true);
    expect(await listed(chargeId)).toEqual([]);
    // Then NETOPIA reports the payment VOIDED: the hold wins, so nothing is recorded through the desk.
    port.statuses.set(chargeId, report(chargeId, seeded.providerPaymentId, "VOIDED", seeded.totalMicros));
    expect(await verify.handle(verifyJob(chargeId, clock.now), clock.now)).toEqual({ kind: "DONE" });
    expect(await refundedRows(chargeId)).toEqual([]);
    for (const template of ["M8", "M11", "M11_DUPLICATE"]) expect(await emails(template, seeded.customerId)).toEqual([]);
    expect(heldByChargeback((await repository.charge(chargeId))!, seeded.providerPaymentId)).toBe(true);
    expect(await listed(chargeId)).toEqual([]);
  });

  it("the reminder's hint names a refund NETOPIA shows when the last read was VOIDED", async () => {
    const seeded = await paidPlan("voided-hint");
    const chargeId = seeded.initialChargeId;
    const port = new RefundPort(false);
    const clock = { now: new Date() };
    const { refunds } = deskFor(port, clock);
    await requestWhole(seeded, refunds, "WITHDRAWAL", 12_100_000);
    await repository.withTransaction((client) => repository.insertStatusRead(client, { chargeId, at: clock.now, outcome: "VOIDED" }));
    // A reminder day of its own (every third day after the request; today's reminder is another test's).
    const day = new Date(clock.now.getTime() + 33 * DAY);
    expect(await refunds.remindOwnerRefunds(day)).toBeGreaterThan(0);
    const [reminder] = (await database.pool.query<{ payload: Record<string, string> }>(
      "SELECT payload FROM billing.outbox WHERE kind = 'EMAIL' AND ref = $1", [`O2_REFUND_REMINDER:${day.toISOString().slice(0, 10)}`]
    )).rows.map((row) => row.payload);
    const line = (reminder!["param.refundList"] ?? "").split("\n").find((entry) => entry.startsWith(`- charge ${chargeId},`)) ?? "";
    expect(line).toContain("NETOPIA shows a refund: only the command is missing");
  });
});
