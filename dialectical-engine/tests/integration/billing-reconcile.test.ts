import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TypedDomainError } from "@debateai/kernel";
import { foldSubscription } from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository, migrate } from "@debateai/db";
import type { XMoneyClient, XMoneyStatus, XMoneyTransaction } from "@debateai/payments-xmoney";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { recordingAudit, seedActiveSubscription, type RecordingAudit } from "../support/billingSubscriptionFixtures.js";
import { BillingReconciler } from "../../apps/api/src/billing/reconcile.js";
import { chargeEvent, subscriptionEvent } from "../../apps/api/src/billing/rows.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const DAY = 86_400_000;
type ListInput = Parameters<XMoneyClient["listTransactions"]>[0];

function tx(
  transactionId: string, orderId: string, status: XMoneyStatus, amountDecimal: string,
  transactionType = "deposit", externalOrderId: string | null = null, relatedTransactionIds: readonly string[] = []
): XMoneyTransaction {
  return Object.freeze({
    transactionId, orderId, externalOrderId, customerId: "c", cardId: null, status, amountDecimal,
    currency: "USD", ip: null, transactionSource: "service-call", transactionType, createdAt: new Date(),
    relatedTransactionIds: Object.freeze([...relatedTransactionIds])
  });
}

function fakeXMoney() {
  const state = {
    byDateType: new Map<string, XMoneyTransaction[]>(),
    byOrder: new Map<string, XMoneyTransaction[]>(),
    externalOrderIds: new Map<string, string>(),
    orderLookupFails: false,
    /** Rows each listing "could not parse": reported through `onRejected`, as P3b's client does, and skipped. */
    rejectedRows: 0,
    /** A10's windowed listings xMoney refuses on every attempt (an order's own listing is never refused). */
    refusedDateTypes: new Set<string>(),
    calls: [] as ListInput[],
    orderLookups: [] as string[]
  };
  return {
    state,
    listTransactions: async (input: ListInput) => {
      state.calls.push(input);
      if (input.orderId === undefined && state.refusedDateTypes.has(input.dateType ?? "")) {
        throw new TypedDomainError("XMONEY_REFUSED", "fake: this dateType is refused");
      }
      for (let row = 0; row < state.rejectedRows; row += 1) input.onRejected?.(null);
      // `dateType` is optional in P3b's query type; every listing here names one.
      return input.orderId !== undefined
        ? state.byOrder.get(input.orderId) ?? []
        : state.byDateType.get(input.dateType ?? "") ?? [];
    },
    getOrder: async (orderId: string) => {
      state.orderLookups.push(orderId);
      if (state.orderLookupFails) throw new TypedDomainError("XMONEY_UNAVAILABLE", "fake");
      return { orderId, externalOrderId: state.externalOrderIds.get(orderId) ?? null };
    }
  };
}

/** The pass as the runtime builds it: the connectors' system is stage, as every seeded subscription's by default. */
function reconciler(xmoney: ReturnType<typeof fakeXMoney>, now: Date, audit: RecordingAudit = recordingAudit()) {
  return new BillingReconciler({
    billing: new BillingRepository(database.pool), jobs: new BillingJobQueries(database.pool),
    xmoney, environment: "stage", audit, clock: () => now, kick: () => undefined
  });
}

async function verifyJobs(ref: string): Promise<number> {
  return (await database.pool.query("SELECT 1 FROM billing.outbox WHERE kind='VERIFY_PAYMENT' AND ref=$1", [ref])).rowCount ?? 0;
}

/**
 * An open charge on a seeded subscription. Its period starts at its creation instant, so the A2 key (subscription,
 * kind, period_start, attempt) stays unique with attempt 1 — callers give two charges of the same kind distinct
 * `createdAt` values. Every kind but CARD_CHECK names a quote (0086), here the seeded SUBSCRIBE quote. `unknowns` is
 * the number of SUBMIT_UNKNOWN events after REQUESTED.
 */
async function openCharge(seeded: Awaited<ReturnType<typeof seedActiveSubscription>>, input: Readonly<{
  kind: "INITIAL" | "UPGRADE" | "RENEWAL"; createdAt: Date; totalMicros: number; last: "REQUESTED" | "SUBMIT_UNKNOWN";
  unknowns?: number;
}>): Promise<string> {
  const billing = new BillingRepository(database.pool);
  const chargeId = randomUUID().replaceAll("-", "");
  await billing.withTransaction(async (client) => {
    await billing.insertCharge(client, {
      chargeId, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: input.kind, attempt: 1,
      periodStart: input.createdAt, periodEnd: new Date(input.createdAt.getTime() + 30 * DAY),
      quoteId: seeded.initialQuoteId, netMicros: input.totalMicros, taxMicros: 0, totalMicros: input.totalMicros,
      currency: "USD", createdAt: input.createdAt, xmoneyEnvironment: seeded.xmoneyEnvironment
    });
    await billing.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", input.createdAt, {
      xmoneyTransactionId: null, amountMicros: input.totalMicros, errorCode: null
    }));
    const unknowns = input.last === "SUBMIT_UNKNOWN" ? input.unknowns ?? 1 : 0;
    for (let index = 0; index < unknowns; index += 1) {
      await billing.appendChargeEvent(client, chargeEvent(chargeId, "SUBMIT_UNKNOWN", input.createdAt, {
        xmoneyTransactionId: null, amountMicros: input.totalMicros, errorCode: "REBILL_OUTCOME_UNKNOWN"
      }));
    }
  });
  return chargeId;
}

const kindsOf = async (chargeId: string) =>
  (await new BillingRepository(database.pool).charge(chargeId))!.events.map((event) => [event.kind, event.errorCode ?? event.xmoneyTransactionId]);

const seed = (now: Date) => seedActiveSubscription(database.pool, {
  ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 5 * DAY), taxCountry: "RO"
});

describe("P14a reconciliation on real PostgreSQL", () => {
  it("queues VERIFY_PAYMENT only for transactions whose final state we have not recorded, in all three windows", async () => {
    const now = new Date();
    const seeded = await seed(now);
    const xmoney = fakeXMoney();
    xmoney.state.byDateType.set("creation", [
      tx(seeded.initialTransactionId, seeded.xmoneyOrderId, "complete-ok", "24.20"),
      tx("991001", "777001", "complete-ok", "5.00")
    ]);
    xmoney.state.byDateType.set("charge-back", [tx(seeded.initialTransactionId, seeded.xmoneyOrderId, "charge-back", "24.20")]);
    xmoney.state.byDateType.set("refund", [tx("991002", "777002", "refund-ok", "3.00")]);
    const report = await reconciler(xmoney, now).runDaily(now);
    expect(report).toMatchObject({ enqueued: 3, uncertain: false });
    expect(await verifyJobs(seeded.initialTransactionId)).toBe(1);
    expect(await verifyJobs("991001")).toBe(1);
    expect(await verifyJobs("991002")).toBe(1);
    expect(xmoney.state.calls.map((call) => call.dateType)).toEqual(expect.arrayContaining(["creation", "charge-back", "refund"]));
    const chargeback = xmoney.state.calls.find((call) => call.dateType === "charge-back")!;
    expect(Math.round((now.getTime() - chargeback.from.getTime()) / DAY)).toBe(120);
  });

  it("adopts the transaction of an unknown submit, and fails an upgrade with none after 30 minutes (A2)", async () => {
    const now = new Date();
    const seeded = await seed(now);
    const adoptable = await openCharge(seeded, { kind: "UPGRADE", createdAt: new Date(now.getTime() - 40 * 60_000), totalMicros: 18_150_000, last: "SUBMIT_UNKNOWN" });
    const xmoney = fakeXMoney();
    xmoney.state.byOrder.set(seeded.xmoneyOrderId, [tx("992001", seeded.xmoneyOrderId, "complete-ok", "18.15")]);
    expect(await reconciler(xmoney, now).runAdoption(now)).toMatchObject({ adopted: 1 });
    expect(await kindsOf(adoptable)).toEqual([["REQUESTED", null], ["SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"], ["SUBMITTED", "992001"]]);
    expect(await verifyJobs("992001")).toBe(1);

    // Distinct instants: two UPGRADE charges of one subscription never share the A2 key.
    const lost = await openCharge(seeded, { kind: "UPGRADE", createdAt: new Date(now.getTime() - 41 * 60_000), totalMicros: 7_000_000, last: "SUBMIT_UNKNOWN" });
    const young = await openCharge(seeded, { kind: "UPGRADE", createdAt: new Date(now.getTime() - 10 * 60_000), totalMicros: 7_000_000, last: "SUBMIT_UNKNOWN" });
    const renewal = await openCharge(seeded, { kind: "RENEWAL", createdAt: new Date(now.getTime() - 40 * 60_000), totalMicros: 24_200_000, last: "SUBMIT_UNKNOWN" });
    // P12c: an upgrade whose rebill never left (a 429, a refused key) stays REQUESTED; it is settled the same way.
    const neverSent = await openCharge(seeded, { kind: "UPGRADE", createdAt: new Date(now.getTime() - 42 * 60_000), totalMicros: 7_000_000, last: "REQUESTED" });
    xmoney.state.byOrder.set(seeded.xmoneyOrderId, [tx("992001", seeded.xmoneyOrderId, "complete-ok", "18.15")]);
    await reconciler(xmoney, now).runAdoption(now);
    expect((await kindsOf(lost)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    expect((await kindsOf(neverSent)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    expect((await kindsOf(young)).at(-1)).toEqual(["SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"]);
    expect((await kindsOf(renewal)).at(-1)).toEqual(["SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"]);
  });

  it("looks on every order that could hold the payment: a resubmission after a card change went to the new order (A2 with A12)", async () => {
    const now = new Date();
    const seeded = await seed(now);
    const billing = new BillingRepository(database.pool);
    const renewal = await openCharge(seeded, { kind: "RENEWAL", createdAt: new Date(now.getTime() - 50 * 60_000), totalMicros: 24_200_000, last: "SUBMIT_UNKNOWN" });
    // The subscription moved to a new card's order after the charge was made, and the payment sits on that new order
    // (a resubmission after the card change went there): the order in force at the charge's creation holds nothing.
    const newOrder = String(880_000_000 + Math.floor(Math.random() * 99_999_999));
    const state = foldSubscription(await billing.subscriptionEvents(seeded.subscriptionId));
    await billing.withTransaction((client) => billing.appendSubscriptionEvent(client, subscriptionEvent(
      state, "CARD_CHANGED", new Date(now.getTime() - 45 * 60_000), { charge_id: "c".repeat(32), retry_now: false },
      { xmoneyOrderId: newOrder, cardRef: "4343" }
    )));
    const xmoney = fakeXMoney();
    xmoney.state.byOrder.set(newOrder, [tx("993001", newOrder, "complete-ok", "24.20")]);
    expect(await reconciler(xmoney, now).runAdoption(now)).toMatchObject({ adopted: 1 });
    expect((await kindsOf(renewal)).at(-1)).toEqual(["SUBMITTED", "993001"]);
    expect(await verifyJobs("993001")).toBe(1);
    // Both of this subscription's orders were looked up, the one in force when the charge was made first
    // (P11a's `ordersHoldingCharge`); the other open charges in this database are looked up on their own orders.
    expect(xmoney.state.calls.map((call) => call.orderId)
      .filter((orderId) => orderId === seeded.xmoneyOrderId || orderId === newOrder)).toEqual([seeded.xmoneyOrderId, newOrder]);
  });

  it("still settles an upgrade that never reached xMoney when a daily listing keeps failing (A2 does not wait for A10)", async () => {
    const now = new Date();
    const seeded = await seed(now);
    // Requested 35 minutes ago, and no transaction on its order.
    const stuck = await openCharge(seeded, { kind: "UPGRADE", createdAt: new Date(now.getTime() - 35 * 60_000), totalMicros: 7_000_000, last: "REQUESTED" });
    const xmoney = fakeXMoney();
    xmoney.state.refusedDateTypes.add("charge-back");
    // The tick fails (the pending line is still reported) yet the upgrade is settled on it.
    await expect(reconciler(xmoney, now).tick()).rejects.toMatchObject({ code: "XMONEY_REFUSED" });
    expect((await kindsOf(stuck)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
  });

  it("fails a checkout charge left REQUESTED for 24 hours, unless its order has a transaction or the lookup failed", async () => {
    const now = new Date();
    const seeded = await seed(now);
    const abandoned = await openCharge(seeded, { kind: "INITIAL", createdAt: new Date(now.getTime() - 25 * 3_600_000), totalMicros: 24_200_000, last: "REQUESTED" });
    const paidLate = await openCharge(seeded, { kind: "INITIAL", createdAt: new Date(now.getTime() - 26 * 3_600_000), totalMicros: 24_200_000, last: "REQUESTED" });
    const xmoney = fakeXMoney();
    xmoney.state.byDateType.set("creation", [tx("993001", "778001", "complete-ok", "24.20")]);
    xmoney.state.externalOrderIds.set("778001", paidLate);
    const report = await reconciler(xmoney, now).runDaily(now);
    expect(report.failed).toBeGreaterThanOrEqual(1);
    expect((await kindsOf(abandoned)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    expect((await kindsOf(paidLate)).at(-1)).toEqual(["REQUESTED", null]);
    expect(await verifyJobs("993001")).toBe(1);

    // One second apart from `abandoned`: the A2 key (subscription, INITIAL, period_start, 1) stays unique.
    const uncertain = await openCharge(seeded, { kind: "INITIAL", createdAt: new Date(now.getTime() - 25 * 3_600_000 - 1_000), totalMicros: 24_200_000, last: "REQUESTED" });
    xmoney.state.byDateType.set("creation", [tx("993002", "778002", "complete-ok", "24.20")]);
    xmoney.state.orderLookupFails = true;
    expect((await reconciler(xmoney, now).runDaily(now)).uncertain).toBe(true);
    expect((await kindsOf(uncertain)).at(-1)).toEqual(["REQUESTED", null]);
  });

  it("keeps a checkout charge whose payment is still in flight, and queues nothing for it yet", async () => {
    const now = new Date();
    const seeded = await seed(now);
    const threeDs = await openCharge(seeded, { kind: "INITIAL", createdAt: new Date(now.getTime() - 27 * 3_600_000), totalMicros: 24_200_000, last: "REQUESTED" });
    const started = await openCharge(seeded, { kind: "INITIAL", createdAt: new Date(now.getTime() - 28 * 3_600_000), totalMicros: 24_200_000, last: "REQUESTED" });
    const xmoney = fakeXMoney();
    xmoney.state.byDateType.set("creation", [
      // The order's merchant id comes from GET /order for this one, and from the transaction itself for the other.
      tx("994001", "779001", "3d-pending", "24.20"),
      tx("994002", "779002", "start", "24.20", "deposit", started)
    ]);
    xmoney.state.externalOrderIds.set("779001", threeDs);
    const report = await reconciler(xmoney, now).runDaily(now);
    expect(report.uncertain).toBe(false);
    expect((await kindsOf(threeDs)).at(-1)).toEqual(["REQUESTED", null]);
    expect((await kindsOf(started)).at(-1)).toEqual(["REQUESTED", null]);
    expect(await verifyJobs("994001")).toBe(0);
    expect(await verifyJobs("994002")).toBe(0);
    // A lookup that fails for an in-flight payment is uncertain too: nothing is failed that day.
    const pending = await openCharge(seeded, { kind: "INITIAL", createdAt: new Date(now.getTime() - 29 * 3_600_000), totalMicros: 24_200_000, last: "REQUESTED" });
    xmoney.state.byDateType.set("creation", [tx("994003", "779003", "in-progress", "24.20")]);
    xmoney.state.orderLookupFails = true;
    expect((await reconciler(xmoney, now).runDaily(now)).uncertain).toBe(true);
    expect((await kindsOf(pending)).at(-1)).toEqual(["REQUESTED", null]);
  });

  it("reads only its own xMoney system, never takes a refund for a payment, and counts rows it could not parse", async () => {
    const now = new Date();
    const billing = new BillingRepository(database.pool);
    const stage = await seed(now);
    const live = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 5 * DAY), taxCountry: "RO",
      xmoneyEnvironment: "live"
    });
    // D5 5h: a live charge waiting on an unknown submit is not this stage pass's to look up, adopt or fail.
    const liveCharge = await openCharge(live, { kind: "UPGRADE", createdAt: new Date(now.getTime() - 50 * 60_000), totalMicros: 7_000_000, last: "SUBMIT_UNKNOWN" });
    const stageCharge = await openCharge(stage, { kind: "UPGRADE", createdAt: new Date(now.getTime() - 51 * 60_000), totalMicros: 7_000_000, last: "SUBMIT_UNKNOWN" });
    // A checkout charge waiting 30 hours, so the pass looks up the orders of the transactions it has not settled.
    await openCharge(stage, { kind: "INITIAL", createdAt: new Date(now.getTime() - 30 * 3_600_000), totalMicros: 24_200_000, last: "REQUESTED" });
    await billing.withTransaction(async (client) => {
      // Our refund of part of the first payment, and a second payment of that order (P9b's DUPLICATE_PAYMENT).
      for (const kind of ["REFUND_REQUESTED", "REFUNDED"] as const) {
        await billing.appendChargeEvent(client, chargeEvent(stage.initialChargeId, kind, now, {
          xmoneyTransactionId: stage.initialTransactionId, amountMicros: 2_000_000, errorCode: "WITHDRAWAL"
        }));
      }
      await billing.appendChargeEvent(client, chargeEvent(stage.initialChargeId, "DUPLICATE_PAYMENT", now, {
        xmoneyTransactionId: "996003", amountMicros: stage.totalMicros, errorCode: null
      }));
    });
    const xmoney = fakeXMoney();
    // D5 5g: a refund of the same amount on the stage order is never adopted as the upgrade's payment.
    xmoney.state.byOrder.set(stage.xmoneyOrderId, [
      tx("996001", stage.xmoneyOrderId, "complete-ok", "7.00", "refund", null, [stage.initialTransactionId])
    ]);
    xmoney.state.byDateType.set("creation", [tx("996003", stage.xmoneyOrderId, "complete-ok", "24.20")]);
    xmoney.state.byDateType.set("refund", [
      // Ours, recorded on the payment it names: settled.
      tx("996002", stage.xmoneyOrderId, "complete-ok", "2.00", "refund", null, [stage.initialTransactionId]),
      // A refund of the second payment, which we never recorded as refunded: VERIFY_PAYMENT must look.
      tx("996004", stage.xmoneyOrderId, "refund-ok", "24.20", "refund", null, ["996003"])
    ]);
    xmoney.state.rejectedRows = 1;
    const audit = recordingAudit();
    const report = await reconciler(xmoney, now, audit).runDaily(now);
    expect((await kindsOf(liveCharge)).at(-1)).toEqual(["SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"]);
    expect(xmoney.state.calls.some((call) => call.orderId === live.xmoneyOrderId)).toBe(false);
    expect((await kindsOf(stageCharge)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    expect(await verifyJobs("996003")).toBe(0);
    expect(await verifyJobs("996002")).toBe(0);
    expect(await verifyJobs("996004")).toBe(1);
    // A refund is matched through the payment it names, never through its order.
    expect(xmoney.state.orderLookups).toEqual([]);
    // One refused row in each of the three listings, and more in the adoption look-ups.
    expect(report.rejected).toBeGreaterThanOrEqual(3);
    expect(audit.events).toContainEqual({ event: "billing.reconcile.rows_rejected", fields: { count: 3, pass: "LISTING" } });
  });

  it("never lets old unknowns hide a fresh one: the frequent pass skips double unknowns, the daily pass pages through all", async () => {
    const now = new Date();
    const seeded = await seed(now);
    const billing = new BillingRepository(database.pool);
    // 205 renewals P11a has given up on (two unknowns each), all older than any charge below.
    await billing.withTransaction(async (client) => {
      for (let index = 0; index < 205; index += 1) {
        const createdAt = new Date(now.getTime() - 2 * DAY - index * 1_000);
        const chargeId = randomUUID().replaceAll("-", "");
        await billing.insertCharge(client, {
          chargeId, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "RENEWAL", attempt: 1,
          periodStart: createdAt, periodEnd: new Date(createdAt.getTime() + 30 * DAY), quoteId: seeded.initialQuoteId,
          netMicros: 24_200_000, taxMicros: 0, totalMicros: 24_200_000, currency: "USD", createdAt,
          xmoneyEnvironment: "stage"
        });
        for (const kind of ["REQUESTED", "SUBMIT_UNKNOWN", "SUBMIT_UNKNOWN"] as const) {
          await billing.appendChargeEvent(client, chargeEvent(chargeId, kind, createdAt, {
            xmoneyTransactionId: null, amountMicros: 24_200_000, errorCode: kind === "REQUESTED" ? null : "REBILL_OUTCOME_UNKNOWN"
          }));
        }
      }
    });
    const xmoney = fakeXMoney();
    const fresh = await openCharge(seeded, { kind: "UPGRADE", createdAt: new Date(now.getTime() - 45 * 60_000), totalMicros: 7_000_000, last: "SUBMIT_UNKNOWN" });
    await reconciler(xmoney, now).runAdoption(now, "FREQUENT");
    expect((await kindsOf(fresh)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
    // The daily pass looks at the double unknowns too, 200 per pass, and still reaches a newer charge.
    const later = await openCharge(seeded, { kind: "UPGRADE", createdAt: new Date(now.getTime() - DAY), totalMicros: 7_000_000, last: "SUBMIT_UNKNOWN" });
    const daily = reconciler(xmoney, now);
    await daily.runAdoption(now, "DAILY");
    expect((await kindsOf(later)).at(-1)).toEqual(["SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"]);
    await daily.runAdoption(now, "DAILY");
    expect((await kindsOf(later)).at(-1)).toEqual(["FAILED", "NO_TRANSACTION"]);
  }, 60_000);

  it("names dead refunds and 30-day-old unsettled charges for the owner, and stops looking those charges up", async () => {
    const now = new Date();
    const seeded = await seed(now);
    const billing = new BillingRepository(database.pool);
    const expired = await openCharge(seeded, { kind: "UPGRADE", createdAt: new Date(now.getTime() - 31 * DAY), totalMicros: 7_000_000, last: "SUBMIT_UNKNOWN" });
    // A refund xMoney refused (P9b dead-letters it with XMONEY_REFUSED): REFUND_REQUESTED, then a dead job.
    const ref = `${seeded.initialChargeId}:${seeded.initialTransactionId}`;
    await billing.withTransaction(async (client) => {
      await billing.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "REFUND_REQUESTED", now, {
        xmoneyTransactionId: seeded.initialTransactionId, amountMicros: 12_100_000, errorCode: "WITHDRAWAL"
      }));
      await billing.enqueue(client, { kind: "XMONEY_REFUND", ref, notBefore: new Date(0), payload: { reason: "WITHDRAWAL" } });
    });
    const [job] = (await billing.claim(["XMONEY_REFUND"], 50, "p14a-test", now)).filter((claimed) => claimed.ref === ref);
    await billing.fail(job!.jobId, "XMONEY_REFUSED", null, now);
    expect(await billing.deadRefunds()).toEqual(expect.arrayContaining([expect.objectContaining({
      chargeId: seeded.initialChargeId, transactionId: seeded.initialTransactionId, reason: "WITHDRAWAL", code: "XMONEY_REFUSED"
    })]));
    expect((await billing.longUnsettledCharges(["UPGRADE", "RENEWAL"], new Date(now.getTime() - 30 * DAY)))
      .map((item) => item.chargeId)).toContain(expired);
    const audit = recordingAudit();
    const report = await reconciler(fakeXMoney(), now, audit).runDaily(now);
    expect(report.deadRefunds).toBeGreaterThanOrEqual(1);
    expect(report.expired).toBeGreaterThanOrEqual(1);
    expect(audit.events.map(({ event }) => event)).toEqual(expect.arrayContaining(["billing.refund.dead", "billing.reconcile.expired"]));
    expect((await kindsOf(expired)).at(-1)).toEqual(["SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"]);
    // The owner refunded it after all and xMoney reported the refund as its own transaction naming the payment
    // (D5 5g): the dead job no longer counts as money owed.
    await billing.withTransaction((client) => billing.appendChargeEvent(client, chargeEvent(seeded.initialChargeId, "REFUNDED", now, {
      xmoneyTransactionId: "7790001", amountMicros: 12_100_000, errorCode: "WITHDRAWAL",
      refundsTransactionId: seeded.initialTransactionId
    })));
    expect((await billing.deadRefunds()).map((item) => item.chargeId)).not.toContain(seeded.initialChargeId);
  }, 60_000);
});
