import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { paymentError } from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository, migrate } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { XMoneyClient } from "@debateai/payments-xmoney";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { StubGeo } from "../support/billingFixtures.js";
import {
  recordingAudit, seedActiveSubscription, seedNetopiaSubscription, subscriptionDeps, testAgreement, TEST_RECORDS_KEY,
  type SeededNetopiaSubscription
} from "../support/billingSubscriptionFixtures.js";
import { StubCardPayments, stubPaymentReport } from "../support/stub-card-payments.js";
import { closeUnpaidHostedCharge } from "../../apps/api/src/billing/hosted-payment.js";
import { BillingReconciler } from "../../apps/api/src/billing/reconcile.js";
import { sealPaymentUrl } from "../../apps/api/src/billing/records.js";
import { chargeEvent, newChargeId } from "../../apps/api/src/billing/rows.js";
import { quoteUpgrade, startUpgrade } from "../../apps/api/src/billing/upgrade.js";

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

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Each test lives in its own year: the due list's 151-day horizon never mixes two tests' charges. */
const epoch = (year: number): Date => new Date(Date.UTC(year, 2, 1, 12));
const plus = (base: Date, ms: number): Date => new Date(base.getTime() + ms);

const subscription = (activatedAt: Date): Promise<SeededNetopiaSubscription> =>
  seedNetopiaSubscription(database.pool, { ownerRef: randomUUID(), planId: "PLUS", activatedAt, taxCountry: "RO" });

/** A 0 card check whose NETOPIA page was opened at `startedAt` (as N13 writes it). */
async function hostedCheck(seeded: SeededNetopiaSubscription, startedAt: Date): Promise<string> {
  const chargeId = newChargeId();
  const paymentId = `ntp-${chargeId.slice(0, 12)}`;
  const sealed = sealPaymentUrl(TEST_RECORDS_KEY, chargeId, `https://secure-sandbox.netopia-payments.com/ui/card?p=${chargeId}`);
  await repository.withTransaction(async (client) => {
    await repository.insertCharge(client, {
      chargeId, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "CARD_CHECK", attempt: 1,
      periodStart: startedAt, periodEnd: plus(startedAt, DAY), quoteId: null, netMicros: 0, taxMicros: 0, totalMicros: 0,
      currency: "USD", createdAt: startedAt, paymentProvider: "netopia", paymentEnvironment: "sandbox"
    });
    await repository.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", startedAt, { providerPaymentId: null, amountMicros: 0, errorCode: null }));
    await repository.insertHostedPayment(client, {
      chargeId, paymentProvider: "netopia", paymentEnvironment: "sandbox", providerPaymentId: paymentId,
      redirectCiphertext: sealed.ciphertext, keyId: sealed.keyId, startedAt
    });
    await repository.appendChargeEvent(client, chargeEvent(chargeId, "SUBMITTED", startedAt, { providerPaymentId: paymentId, amountMicros: 0, errorCode: null }));
  });
  return chargeId;
}

/** A renewal charge NETOPIA answered (SUBMITTED) or whose outcome is unknown (N11's own probes then own it). */
async function renewal(seeded: SeededNetopiaSubscription, createdAt: Date, answered: boolean): Promise<string> {
  const chargeId = newChargeId();
  await repository.withTransaction(async (client) => {
    await repository.insertCharge(client, {
      chargeId, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "RENEWAL", attempt: 1,
      periodStart: seeded.periodEnd, periodEnd: plus(seeded.periodEnd, 30 * DAY), quoteId: seeded.initialQuoteId,
      netMicros: seeded.totalMicros, taxMicros: 0, totalMicros: seeded.totalMicros, currency: "USD", createdAt,
      paymentProvider: "netopia", paymentEnvironment: "sandbox"
    });
    await repository.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", createdAt, {
      providerPaymentId: null, amountMicros: seeded.totalMicros, errorCode: null
    }));
    await repository.appendChargeEvent(client, answered
      ? chargeEvent(chargeId, "SUBMITTED", createdAt, { providerPaymentId: `ntp-${chargeId.slice(0, 12)}`, amountMicros: seeded.totalMicros, errorCode: null })
      : chargeEvent(chargeId, "SUBMIT_UNKNOWN", createdAt, { providerPaymentId: null, amountMicros: seeded.totalMicros, errorCode: "CHARGE_OUTCOME_UNKNOWN" }));
  });
  return chargeId;
}

const readAt = (chargeId: string, at: Date, outcome = "PENDING") =>
  repository.withTransaction((client) => repository.insertStatusRead(client, { chargeId, at, outcome }));
const dueOf = async (chargeId: string, now: Date) =>
  (await jobs.dueStatusReads(database.pool, now, null, 1_000, "sandbox")).rows.find((row) => row.chargeId === chargeId) ?? null;
const lastEvent = async (chargeId: string) => (await repository.charge(chargeId))!.events.map((event) => [event.kind, event.errorCode]).at(-1);

function reconcilerFor(payments: StubCardPayments, clock: { now: Date }) {
  const audit = recordingAudit();
  const kick = vi.fn();
  const listed: unknown[] = [];
  const xmoney = {
    listTransactions: async (query: unknown) => { listed.push(query); return []; },
    getOrder: async () => { throw new TypedDomainError("XMONEY_UNAVAILABLE", "unused"); }
  } as unknown as Pick<XMoneyClient, "listTransactions" | "getOrder">;
  const reconciler = new BillingReconciler({
    billing: repository, jobs, xmoney, environment: "stage", audit, clock: () => clock.now, kick,
    netopia: { payments, paymentEnvironment: "sandbox", jobs, pool: database.pool }
  });
  return { reconciler, audit, kick, listed };
}

/** An upgrade opened on NETOPIA's page at `at` (N12's flow), for the CLOSED schedule and the quote-lifetime close. */
async function hostedUpgrade(at: Date): Promise<Readonly<{ seeded: SeededNetopiaSubscription; chargeId: string }>> {
  const seeded = await subscription(plus(at, -5 * DAY));
  const deps = subscriptionDeps(database.pool, { geo: new StubGeo(), clock: () => at, payments: new StubCardPayments() });
  const quoted = await quoteUpgrade(deps, { ownerRef: seeded.ownerRef, planId: "PRO", ip: "192.0.2.10", now: at });
  const started = await startUpgrade(deps, {
    ownerRef: seeded.ownerRef, userId: randomUUID(), planId: "PRO", quoteRef: quoted.quote_ref, ip: "192.0.2.10",
    userAgent: "n16", locale: "en", agreement: testAgreement("en")!
  });
  return Object.freeze({ seeded, chargeId: started.charge_ref });
}

describe("N16 each charge's next read (spec §2.14)", () => {
  it("reads an open hosted payment 10 min, 30 min, 1 h and 3 h after its start, then daily up to 30 days", async () => {
    const start = epoch(2031);
    const check = await hostedCheck(await subscription(plus(start, -30 * MINUTE)), start);
    expect(await dueOf(check, plus(start, 9 * MINUTE))).toBeNull();
    expect(await dueOf(check, plus(start, 10 * MINUTE))).toMatchObject({ schedule: "OPEN", dueAt: plus(start, 10 * MINUTE), providerPaymentId: `ntp-${check.slice(0, 12)}` });
    await readAt(check, plus(start, 11 * MINUTE));
    expect(await dueOf(check, plus(start, 29 * MINUTE))).toBeNull();
    expect((await dueOf(check, plus(start, 30 * MINUTE)))?.dueAt).toEqual(plus(start, 30 * MINUTE));
    await readAt(check, plus(start, 30 * MINUTE));
    expect((await dueOf(check, plus(start, HOUR)))?.dueAt).toEqual(plus(start, HOUR));
    await readAt(check, plus(start, HOUR));
    expect((await dueOf(check, plus(start, 3 * HOUR)))?.dueAt).toEqual(plus(start, 3 * HOUR));
    await readAt(check, plus(start, 3 * HOUR));
    expect(await dueOf(check, plus(start, DAY))).toBeNull();
    expect((await dueOf(check, plus(start, DAY + 3 * HOUR)))?.dueAt).toEqual(plus(start, DAY + 3 * HOUR));
    await readAt(check, plus(start, 29 * DAY + 12 * HOUR));
    expect(await dueOf(check, plus(start, 31 * DAY))).toBeNull();
  });

  it("reads a closed unpaid upgrade daily for 30 days, and a closed card check never", async () => {
    const start = epoch(2032);
    const { seeded, chargeId } = await hostedUpgrade(start);
    expect(await closeUnpaidHostedCharge({ billing: repository, jobs, audit: recordingAudit() }, {
      chargeId, ownerRef: seeded.ownerRef, now: plus(start, 31 * MINUTE)
    })).toBe(true);
    expect(await dueOf(chargeId, plus(start, 23 * HOUR))).toBeNull();
    expect(await dueOf(chargeId, plus(start, DAY))).toMatchObject({ schedule: "CLOSED", dueAt: plus(start, DAY) });
    await readAt(chargeId, plus(start, DAY + 5 * MINUTE));
    expect(await dueOf(chargeId, plus(start, 2 * DAY))).toBeNull();
    expect((await dueOf(chargeId, plus(start, 2 * DAY + 5 * MINUTE)))?.dueAt).toEqual(plus(start, 2 * DAY + 5 * MINUTE));
    await readAt(chargeId, plus(start, 29 * DAY + HOUR));
    expect(await dueOf(chargeId, plus(start, 31 * DAY))).toBeNull();
    const check = await hostedCheck(seeded, plus(start, HOUR));
    await repository.withTransaction((client) => repository.appendChargeEvent(client, chargeEvent(check, "FAILED", plus(start, 2 * HOUR), {
      providerPaymentId: null, amountMicros: 0, errorCode: "NO_TRANSACTION"
    })));
    expect(await dueOf(check, plus(start, 2 * DAY))).toBeNull();
  });

  it("reads a payment at 1, 7, 30, 60, 90 and 120 days, and an open owner refund daily until it is recorded", async () => {
    const paidAt = epoch(2033);
    const seeded = await subscription(paidAt);
    const payment = seeded.initialChargeId;
    expect(await dueOf(payment, plus(paidAt, 23 * HOUR))).toBeNull();
    expect(await dueOf(payment, plus(paidAt, DAY + MINUTE))).toMatchObject({ schedule: "PAID", dueAt: plus(paidAt, DAY) });
    await readAt(payment, plus(paidAt, DAY + 2 * MINUTE), "PAID");
    expect(await dueOf(payment, plus(paidAt, 6 * DAY))).toBeNull();
    expect((await dueOf(payment, plus(paidAt, 7 * DAY + MINUTE)))?.dueAt).toEqual(plus(paidAt, 7 * DAY));
    await readAt(payment, plus(paidAt, 7 * DAY + 2 * MINUTE), "PAID");
    // §2.12.2 item 2: an owner refund still open is read now, then daily, until it is recorded.
    await repository.withTransaction((client) => repository.appendChargeEvent(client, chargeEvent(payment, "REFUND_REQUESTED", plus(paidAt, 10 * DAY), {
      providerPaymentId: seeded.providerPaymentId, amountMicros: 5_000_000, errorCode: "WITHDRAWAL"
    })));
    expect(await dueOf(payment, plus(paidAt, 10 * DAY + MINUTE))).toMatchObject({ schedule: "REFUND" });
    await readAt(payment, plus(paidAt, 10 * DAY + 2 * MINUTE), "PAID");
    expect(await dueOf(payment, plus(paidAt, 11 * DAY))).toBeNull();
    expect(await dueOf(payment, plus(paidAt, 11 * DAY + 2 * MINUTE))).toMatchObject({ schedule: "REFUND" });
    await repository.withTransaction((client) => repository.appendChargeEvent(client, chargeEvent(payment, "REFUNDED", plus(paidAt, 11 * DAY + 3 * MINUTE), {
      providerPaymentId: seeded.providerPaymentId, amountMicros: 5_000_000, errorCode: null
    })));
    expect(await dueOf(payment, plus(paidAt, 12 * DAY))).toBeNull();
    expect(await dueOf(payment, plus(paidAt, 30 * DAY + MINUTE))).toMatchObject({ schedule: "PAID", dueAt: plus(paidAt, 30 * DAY) });
    await readAt(payment, plus(paidAt, 120 * DAY + MINUTE), "PAID");
    expect(await dueOf(payment, plus(paidAt, 150 * DAY))).toBeNull();
    // A 0 card check that succeeded moved no money: never read again.
    const check = await hostedCheck(seeded, plus(paidAt, HOUR));
    await repository.withTransaction((client) => repository.appendChargeEvent(client, chargeEvent(check, "SUCCEEDED", plus(paidAt, HOUR), {
      providerPaymentId: `ntp-${check.slice(0, 12)}`, amountMicros: 0, errorCode: null
    })));
    expect(await dueOf(check, plus(paidAt, 2 * DAY))).toBeNull();
  });

  it("never reads daily for an owner refund held by a charge-back, only the payment's own schedule (ruling PR-41)", async () => {
    const paidAt = epoch(2039);
    const seeded = await subscription(paidAt);
    const payment = seeded.initialChargeId;
    const append = (kind: "REFUND_REQUESTED" | "CHARGEBACK" | "CHARGEBACK_RESOLVED", at: Date, errorCode: string | null) =>
      repository.withTransaction((client) => repository.appendChargeEvent(client, chargeEvent(payment, kind, at, {
        providerPaymentId: seeded.providerPaymentId, amountMicros: kind === "REFUND_REQUESTED" ? 5_000_000 : seeded.totalMicros, errorCode
      })));
    await readAt(payment, plus(paidAt, DAY + MINUTE), "PAID");
    await append("REFUND_REQUESTED", plus(paidAt, 2 * DAY), "WITHDRAWAL");
    expect(await dueOf(payment, plus(paidAt, 2 * DAY + MINUTE))).toMatchObject({ schedule: "REFUND" });
    await readAt(payment, plus(paidAt, 2 * DAY + 2 * MINUTE), "PAID");
    // The bank disputes the payment: the open refund is held, so no daily read; the 7-day read of the payment stays.
    await append("CHARGEBACK", plus(paidAt, 2 * DAY + 3 * MINUTE), null);
    expect(await dueOf(payment, plus(paidAt, 3 * DAY + 3 * MINUTE))).toBeNull();
    expect(await dueOf(payment, plus(paidAt, 6 * DAY))).toBeNull();
    expect(await dueOf(payment, plus(paidAt, 7 * DAY + MINUTE))).toMatchObject({ schedule: "PAID", dueAt: plus(paidAt, 7 * DAY) });
    await readAt(payment, plus(paidAt, 7 * DAY + 2 * MINUTE), "CHARGEBACK_OPENED");
    expect(await dueOf(payment, plus(paidAt, 8 * DAY + 3 * MINUTE))).toBeNull();
    // The dispute is won (billing:dispute --outcome won): the refund is due again, read daily.
    await append("CHARGEBACK_RESOLVED", plus(paidAt, 9 * DAY), null);
    expect(await dueOf(payment, plus(paidAt, 9 * DAY + MINUTE))).toMatchObject({ schedule: "REFUND", dueAt: plus(paidAt, 8 * DAY + 2 * MINUTE) });
  });

  it("leaves an unknown renewal to N11's probes, and reads a SUBMITTED one on the open schedule", async () => {
    const start = epoch(2034);
    const unknown = await renewal(await subscription(plus(start, -29 * DAY)), start, false);
    const answered = await renewal(await subscription(plus(start, -29 * DAY)), start, true);
    expect(await dueOf(unknown, plus(start, 10 * MINUTE))).toBeNull();
    expect(await dueOf(unknown, plus(start, DAY))).toBeNull();
    expect(await dueOf(answered, plus(start, 10 * MINUTE))).toMatchObject({ schedule: "OPEN", kind: "RENEWAL" });
  });

  it("lists newest due first, at most `limit`, after a cursor that goes round", async () => {
    const start = epoch(2035);
    const seeded = await subscription(plus(start, -30 * MINUTE));
    const first = await hostedCheck(seeded, start);
    const second = await hostedCheck(seeded, plus(start, MINUTE));
    const third = await hostedCheck(seeded, plus(start, 2 * MINUTE));
    const now = plus(start, 30 * MINUTE);
    const page1 = await jobs.dueStatusReads(database.pool, now, null, 2, "sandbox");
    expect(page1.rows.map((row) => row.chargeId)).toEqual([third, second]);
    expect(page1.next).toEqual({ dueAt: plus(start, 11 * MINUTE), chargeId: second });
    const page2 = await jobs.dueStatusReads(database.pool, now, page1.next, 2, "sandbox");
    expect(page2.rows.map((row) => row.chargeId)).toEqual([first]);
    expect(page2.next).toBeNull();
    expect((await jobs.dueStatusReads(database.pool, now, null, 2, "sandbox")).rows.map((row) => row.chargeId)).toEqual([third, second]);
    expect((await jobs.dueStatusReads(database.pool, now, null, 2, "live")).rows).toEqual([]);
  });

  it("keeps each read's instant across a daylight-saving change, whatever the session's time zone", async () => {
    const paidAt = epoch(2038);
    const seeded = await subscription(paidAt);
    await readAt(seeded.initialChargeId, plus(paidAt, 7 * DAY + MINUTE), "PAID");
    const client = await database.pool.connect();
    try {
      // 28 March 2038 moves Bucharest's clocks forward: a calendar-day step would land an hour early.
      await client.query("SET TIME ZONE 'Europe/Bucharest'");
      const due = (await jobs.dueStatusReads(client, plus(paidAt, 30 * DAY + MINUTE), null, 1_000, "sandbox")).rows
        .find((row) => row.chargeId === seeded.initialChargeId);
      expect(due).toMatchObject({ schedule: "PAID", dueAt: plus(paidAt, 30 * DAY) });
      expect((await jobs.dueStatusReads(client, plus(paidAt, 30 * DAY - MINUTE), null, 1_000, "sandbox")).rows
        .some((row) => row.chargeId === seeded.initialChargeId)).toBe(false);
    } finally {
      await client.query("RESET TIME ZONE");
      client.release();
    }
  });
});

describe("N16 the reconciler's NETOPIA pass (spec §2.14)", () => {
  it("queues VERIFY_PAYMENT for what our rows do not record, isolates a failed read, and never reads an xMoney row", async () => {
    const now = epoch(2036);
    const clock = { now };
    const payments = new StubCardPayments();
    const refunded = await subscription(plus(now, -7 * DAY - MINUTE));
    const paid = await subscription(plus(now, -7 * DAY - MINUTE));
    const authorised = await hostedCheck(paid, plus(now, -20 * MINUTE));
    const unreadable = await hostedCheck(paid, plus(now, -15 * MINUTE));
    const xmoney = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: plus(now, -7 * DAY - MINUTE), taxCountry: "RO"
    });
    payments.scriptStatus(authorised, stubPaymentReport(authorised, "AUTHORIZED", { amountMicros: 0 }));
    payments.scriptStatus(unreadable, paymentError("PAYMENT_PROVIDER_UNAVAILABLE"));
    payments.scriptStatus(refunded.initialChargeId, stubPaymentReport(refunded.initialChargeId, "REFUNDED", { providerPaymentId: refunded.providerPaymentId }));
    payments.scriptStatus(paid.initialChargeId, stubPaymentReport(paid.initialChargeId, "PAID", { providerPaymentId: paid.providerPaymentId }));
    const { reconciler, audit, kick, listed } = reconcilerFor(payments, clock);
    const report = await reconciler.tick();
    expect(report.statusChecks).toEqual({ read: 4, queued: 2, closed: 0, failed: 1 });
    expect(new Set(payments.statusReads.map((read) => read.orderId)))
      .toEqual(new Set([authorised, unreadable, refunded.initialChargeId, paid.initialChargeId]));
    expect(payments.statusReads.map((read) => read.orderId)).not.toContain(xmoney.initialChargeId);
    expect(listed.length).toBeGreaterThan(0);
    const verify = (await database.pool.query<{ ref: string; not_before: Date }>(
      "SELECT ref, not_before FROM billing.outbox WHERE kind = 'VERIFY_PAYMENT' AND ref = ANY($1::text[])",
      [[authorised, refunded.initialChargeId, paid.initialChargeId, unreadable]]
    )).rows;
    expect(verify.map((row) => row.ref).sort()).toEqual([authorised, refunded.initialChargeId].sort());
    for (const row of verify) expect(row.not_before.getTime()).toBeLessThanOrEqual(now.getTime());
    expect(audit.events.filter((entry) => entry.event === "billing.reconcile.status_failed").map((entry) => entry.fields))
      .toEqual([{ code: "PAYMENT_PROVIDER_UNAVAILABLE" }]);
    const outcomes = (await database.pool.query<{ outcome: string }>(
      "SELECT outcome FROM billing.status_read WHERE charge_id = $1", [unreadable]
    )).rows.map((row) => row.outcome);
    expect(outcomes).toEqual(["PAYMENT_PROVIDER_UNAVAILABLE"]);
    expect(kick).toHaveBeenCalled();
    // Ten minutes on, only the card check whose 30-minute step has come is read again; NETOPIA still says
    // AUTHORIZED, so it is queued again.
    clock.now = plus(now, 10 * MINUTE);
    const again = await reconciler.tick();
    expect(again.statusChecks).toEqual({ read: 1, queued: 1, closed: 0, failed: 0 });
    expect(payments.statusReads.slice(4).map((read) => read.orderId)).toEqual([authorised]);
  });

  it("closes a card check unpaid after 24 hours and an upgrade past its quote's lifetime, never one on its way", async () => {
    const now = epoch(2037);
    const payments = new StubCardPayments();
    const seeded = await subscription(plus(now, -5 * DAY));
    const untouched = await hostedCheck(seeded, plus(now, -25 * HOUR));
    const onItsWay = await hostedCheck(seeded, plus(now, -25 * HOUR - MINUTE));
    const neverArrived = await hostedCheck(seeded, plus(now, -26 * HOUR));
    const young = await hostedCheck(seeded, plus(now, -2 * HOUR));
    const lapsed = await hostedUpgrade(plus(now, -31 * MINUTE));
    const live = await hostedUpgrade(plus(now, -20 * MINUTE));
    payments.scriptStatus(untouched, stubPaymentReport(untouched, "PENDING", { amountMicros: 0 }));
    payments.scriptStatus(onItsWay, stubPaymentReport(onItsWay, "PENDING", { amountMicros: 0, providerStatus: "6" }));
    payments.scriptStatus(young, stubPaymentReport(young, "PENDING", { amountMicros: 0 }));
    payments.scriptStatus(lapsed.chargeId, stubPaymentReport(lapsed.chargeId, "PENDING"));
    payments.scriptStatus(live.chargeId, stubPaymentReport(live.chargeId, "PENDING"));
    const { reconciler } = reconcilerFor(payments, { now });
    expect(await reconciler.runStatusChecks(now)).toMatchObject({ closed: 3, queued: 0, failed: 0 });
    for (const closed of [untouched, neverArrived, lapsed.chargeId]) expect(await lastEvent(closed), closed).toEqual(["FAILED", "NO_TRANSACTION"]);
    for (const open of [onItsWay, young, live.chargeId]) expect((await lastEvent(open))?.[0], open).toBe("SUBMITTED");
  });
});
