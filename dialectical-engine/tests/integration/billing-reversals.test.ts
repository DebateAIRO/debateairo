import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paidTransactions } from "../../apps/api/src/billing/refunds.js";
import { recordDisputeOutcome, type DisputeStores } from "../../apps/api/src/billing/dispute-cli.js";
import { refundTarget } from "../../apps/api/src/billing/rows.js";
import { kindsOf, startBillingHarness, type BillingHarness } from "../support/billingHarness.js";

let h: BillingHarness;
beforeAll(async () => { h = await startBillingHarness(); });
afterAll(async () => { await h?.stop(); });

const kinds = async (subscriptionId: string) => (await h.repository.subscriptionEvents(subscriptionId)).map((event) => event.kind);
/** The refund rows that name this paid transaction as the one they refund. */
const refundRowsOf = async (chargeId: string, transactionId: string) => ((await h.repository.charge(chargeId))?.events ?? [])
  .filter((event) => (event.kind === "REFUND_REQUESTED" || event.kind === "REFUNDED") && refundTarget(event) === transactionId)
  .map((event) => [event.kind, event.errorCode, event.amountMicros]).sort();
/** A paid checkout whose order was paid a second time; the duplicate's refund is requested, and recorded if asked. */
async function paidTwice(duplicateRefunded: boolean) {
  const paid = await h.activate();
  if (!duplicateRefunded) h.xmoney.refundNotSent = 1;
  const again = h.xmoney.pay({ externalOrderId: paid.chargeId, amountDecimal: paid.totalDecimal, cardCountry: "RO" });
  await h.settle(again.transactionId);
  expect(await h.eventKinds(paid.chargeId)).toEqual(duplicateRefunded
    ? kindsOf("REQUESTED", "SUCCEEDED", "DUPLICATE_PAYMENT", "REFUND_REQUESTED", "REFUNDED")
    : kindsOf("REQUESTED", "SUCCEEDED", "DUPLICATE_PAYMENT", "REFUND_REQUESTED"));
  return { paid, again };
}
const noticeOutcomes = async (transactionId: string) => (await h.database.pool.query(
  "SELECT o.outcome FROM billing.xmoney_notice_outcome o JOIN billing.xmoney_notice n USING (notice_id) WHERE n.transaction_id=$1",
  [transactionId]
)).rows;

describe("P9c reversals of a verified payment", () => {
  it("records a dashboard refund, hands its credit note to the owner, and keeps the plan", async () => {
    const paid = await h.activate();
    h.xmoney.setStatus(paid.transaction.transactionId, "refund-ok");
    await h.settle(paid.transaction.transactionId);
    const charge = await h.repository.charge(paid.chargeId);
    expect(charge!.events.filter((event) => event.kind === "REFUND_REQUESTED" || event.kind === "REFUNDED")
      .map((event) => [event.kind, event.errorCode, event.amountMicros]).sort()).toEqual([
      ["REFUNDED", "PROVIDER_REFUND", 24_200_000], ["REFUND_REQUESTED", "PROVIDER_REFUND", 24_200_000]
    ]);
    // The refunded amount is unknown, so no document is issued automatically: a full storno for a partial dashboard
    // refund would be a wrong tax document.
    expect((await h.outboxRows(paid.chargeId)).map((row) => row.kind)).not.toContain("SMARTBILL_STORNO");
    expect(h.auditLines).toContainEqual({ event: "billing.invoice.unknown", issuer: "SMARTBILL", kind: "CREDIT_NOTE", code: "CREDIT_NOTE_MANUAL" });
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
    await h.settle(paid.transaction.transactionId);
    expect((await h.eventKinds(paid.chargeId)).filter((kind) => kind === "REFUNDED")).toHaveLength(1);
    // A later refund of ours on this transaction fails loudly instead of recording nothing.
    expect(paidTransactions([charge!], paid.transaction.createdAt!)).toEqual([
      expect.objectContaining({ transactionId: paid.transaction.transactionId, providerRefunded: true })
    ]);
    await expect(h.repository.withTransaction((client) => h.refunds.requestAll(client, {
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL", at: h.clock.now,
      allocations: [{ chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros: 1_000_000 }]
    }))).rejects.toMatchObject({ code: "REFUND_TRANSACTION_ALREADY_REFUNDED" });
  });

  it("records a dashboard refund reported as its own transaction at its amount, with that credit note (D5 5g)", async () => {
    const paid = await h.activate();
    // Refunded in the xMoney dashboard: not our call, so no REFUND_REQUESTED of ours exists for it.
    await h.xmoney.refund({ transactionId: paid.transaction.transactionId, amountDecimal: "5.00", reason: "customer-demand", message: "dashboard" });
    const [refundRow] = h.xmoney.refundTransactionsOf(paid.transaction.transactionId);
    await h.settle(refundRow!.transactionId);
    const charge = (await h.repository.charge(paid.chargeId))!;
    expect(charge.events.filter((event) => event.kind === "REFUND_REQUESTED" || event.kind === "REFUNDED")
      .map((event) => [event.kind, event.errorCode, event.amountMicros, event.xmoneyTransactionId, event.refundsTransactionId]).sort()).toEqual([
      ["REFUNDED", "PROVIDER_REFUND", 5_000_000, refundRow!.transactionId, paid.transaction.transactionId],
      ["REFUND_REQUESTED", "PROVIDER_REFUND", 5_000_000, paid.transaction.transactionId, null]
    ]);
    expect((await h.outboxRows(paid.chargeId)).find((row) => row.kind === "SMARTBILL_STORNO")).toMatchObject({
      payload: { charge_id: paid.chargeId, transaction_id: paid.transaction.transactionId, refund_micros: 5_000_000 }
    });
    // D5 5m: the REFUNDED row carries the refund transaction's own time, which dates the quarter's REFUND row.
    const refundedRow = await h.database.pool.query<{ xmoney_created_at: Date | null }>(
      "SELECT xmoney_created_at FROM billing.charge_event WHERE charge_id=$1 AND kind='REFUNDED'", [paid.chargeId]
    );
    expect(refundedRow.rows).toEqual([{ xmoney_created_at: refundRow!.createdAt }]);
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
    await h.settle(refundRow!.transactionId);
    expect((await h.eventKinds(paid.chargeId)).filter((kind) => kind === "REFUNDED")).toHaveLength(1);
    // A second refund elsewhere on the same payment cannot be held by P1a's keys: the owner records it.
    await h.xmoney.refund({ transactionId: paid.transaction.transactionId, amountDecimal: "2.00", reason: "customer-demand", message: "dashboard" });
    const second = h.xmoney.refundTransactionsOf(paid.transaction.transactionId).find((row) => row.transactionId !== refundRow!.transactionId);
    await h.settle(second!.transactionId);
    expect((await h.eventKinds(paid.chargeId)).filter((kind) => kind === "REFUNDED")).toHaveLength(1);
    expect(h.auditLines).toContainEqual({ event: "billing.refund.unrecorded", reason: "PROVIDER_REFUND" });
    // Its durable mark for the owner's summary (D6b's P16b): the check itself ends dead, keyed by the refund's id.
    expect((await h.outboxRows(second!.transactionId)).filter((row) => row.kind === "VERIFY_PAYMENT" && row.ref === second!.transactionId))
      .toEqual([expect.objectContaining({ dead: true, lastErrorCode: "REFUND_UNRECORDED" })]);
    expect(h.auditLines).toContainEqual({ event: "billing.outbox.dead", kind: "VERIFY_PAYMENT", code: "REFUND_UNRECORDED", attempts: 1 });
    // The first refund's own report, settled twice, is never the owner's: both of its checks complete.
    expect((await h.outboxRows(refundRow!.transactionId)).filter((row) => row.kind === "VERIFY_PAYMENT" && row.ref === refundRow!.transactionId)
      .map((row) => [row.done, row.dead])).toEqual([[true, false], [true, false]]);
    // A third refund elsewhere of the FIRST refund's amount is not that refund replayed: it is another refund
    // transaction, so it too is the owner's.
    await h.xmoney.refund({ transactionId: paid.transaction.transactionId, amountDecimal: "5.00", reason: "customer-demand", message: "dashboard" });
    const third = h.xmoney.refundTransactionsOf(paid.transaction.transactionId)
      .find((row) => row.transactionId !== refundRow!.transactionId && row.transactionId !== second!.transactionId);
    const linesBeforeThird = h.auditLines.length;
    await h.settle(third!.transactionId);
    expect((await h.eventKinds(paid.chargeId)).filter((kind) => kind === "REFUNDED")).toHaveLength(1);
    expect((await h.outboxRows(third!.transactionId)).filter((row) => row.kind === "VERIFY_PAYMENT" && row.ref === third!.transactionId))
      .toEqual([expect.objectContaining({ dead: true, lastErrorCode: "REFUND_UNRECORDED" })]);
    expect(h.auditLines.slice(linesBeforeThird)).toContainEqual({ event: "billing.refund.unrecorded", reason: "PROVIDER_REFUND" });
  });

  it("takes a full dashboard refund reported both as the payment's refund-ok and as its refund transaction as one refund", async () => {
    const paid = await h.activate();
    // The full refund turns the payment refund-ok AND lists its own 24.20 refund transaction (D5's model).
    await h.xmoney.refund({ transactionId: paid.transaction.transactionId, amountDecimal: null, reason: "customer-demand", message: "dashboard" });
    const [refundRow] = h.xmoney.refundTransactionsOf(paid.transaction.transactionId);
    const linesBefore = h.auditLines.length;
    await h.settle(paid.transaction.transactionId);
    await h.settle(refundRow!.transactionId);
    expect((await h.repository.charge(paid.chargeId))!.events.filter((event) => event.kind === "REFUNDED")
      .map((event) => [event.errorCode, event.amountMicros, event.xmoneyTransactionId])).toEqual([
      ["PROVIDER_REFUND", 24_200_000, paid.transaction.transactionId]
    ]);
    expect((await h.outboxRows(refundRow!.transactionId)).filter((row) => row.kind === "VERIFY_PAYMENT" && row.ref === refundRow!.transactionId)
      .map((row) => [row.done, row.dead])).toEqual([[true, false]]);
    expect(h.auditLines.slice(linesBefore).filter((line) => line.event === "billing.refund.unrecorded")).toEqual([]);
  });

  it("fails a charge voided before it succeeded, and fully refunds one voided after, with its credit note", async () => {
    const bought = await h.buy();
    const voided = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RO", status: "void-ok" });
    await h.settle(voided.transactionId);
    expect((await h.repository.charge(bought.chargeId))!.events.find((event) => event.kind === "FAILED")).toMatchObject({ errorCode: "VOIDED" });
    const paid = await h.activate();
    h.xmoney.setStatus(paid.transaction.transactionId, "cancel-ok");
    await h.settle(paid.transaction.transactionId);
    expect((await h.repository.charge(paid.chargeId))!.events.find((event) => event.kind === "REFUNDED")).toMatchObject({ errorCode: "PROVIDER_VOID" });
    // A9: a void after success is a refund in full, so its credit note is the whole charge.
    expect((await h.outboxRows(paid.chargeId)).find((row) => row.kind === "SMARTBILL_STORNO")).toMatchObject({
      ref: `${paid.chargeId}:${paid.transaction.transactionId}`,
      payload: { charge_id: paid.chargeId, transaction_id: paid.transaction.transactionId, refund_micros: 24_200_000 }
    });
  });

  it("suspends the plan on a chargeback, moves the person to Free and sends M10, once", async () => {
    const paid = await h.activate();
    h.xmoney.setStatus(paid.transaction.transactionId, "charge-back");
    await h.settle(paid.transaction.transactionId);
    await h.settle(paid.transaction.transactionId);
    expect((await h.eventKinds(paid.chargeId)).filter((kind) => kind === "CHARGEBACK")).toHaveLength(1);
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED", "SUSPENDED"]);
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "FREE", cause: "SUSPENDED_CHARGEBACK", paidThrough: null });
    expect((await h.outboxRows(paid.chargeId)).map((row) => row.ref)).toContain(`M10:${paid.chargeId}`);
    expect(h.auditLines.some((line) => line.event === "billing.chargeback")).toBe(true);
  });

  it("records a representment against the charged-back charge and changes nothing else", async () => {
    const paid = await h.activate();
    h.xmoney.setStatus(paid.transaction.transactionId, "charge-back");
    await h.settle(paid.transaction.transactionId);
    const representment = h.xmoney.pay({
      externalOrderId: paid.chargeId, amountDecimal: "24.20", cardCountry: "RO", transactionType: "representment"
    });
    await h.settle(representment.transactionId);
    expect((await h.repository.charge(paid.chargeId))!.events.find((event) => event.kind === "CHARGEBACK_REPRESENTED"))
      .toMatchObject({ xmoneyTransactionId: representment.transactionId });
    // The same representment reported again is a replay: recorded once, and its second check completes too.
    await h.notices.receive(h.noticeFor(h.xmoney.transactions.get(representment.transactionId)!));
    await h.worker.drain(10);
    expect((await h.eventKinds(paid.chargeId)).filter((kind) => kind === "CHARGEBACK_REPRESENTED")).toHaveLength(1);
    expect(await noticeOutcomes(representment.transactionId)).toEqual([{ outcome: "DUPLICATE" }]);
    expect((await h.outboxRows(representment.transactionId))
      .filter((row) => row.kind === "VERIFY_PAYMENT" && row.ref === representment.transactionId)
      .map((row) => [row.done, row.dead])).toEqual([[true, false], [true, false]]);
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED", "SUSPENDED"]);
  });

  it("ends MISMATCH for a representment notice that names another charged-back charge (P2-I1)", async () => {
    const mine = await h.activate();
    const theirs = await h.activate();
    for (const paid of [mine, theirs]) {
      h.xmoney.setStatus(paid.transaction.transactionId, "charge-back");
      await h.settle(paid.transaction.transactionId);
    }
    const representment = h.xmoney.pay({
      externalOrderId: mine.chargeId, amountDecimal: "24.20", cardCountry: "RO", transactionType: "representment"
    });
    const lines = h.auditLines.length;
    await h.notices.receive(h.noticeFor(representment, { externalOrderId: theirs.chargeId }));
    await h.worker.drain(10);
    for (const paid of [mine, theirs]) {
      expect((await h.eventKinds(paid.chargeId)).filter((kind) => kind === "CHARGEBACK_REPRESENTED")).toEqual([]);
    }
    expect(await noticeOutcomes(representment.transactionId)).toEqual([{ outcome: "MISMATCH" }]);
    expect(h.auditLines.slice(lines)).toEqual([{ event: "billing.payment.mismatch", code: "ORDER_REF_MISMATCH" }]);
    // xMoney's own reference (the notice without the forged field) records it on the right charge.
    await h.notices.receive(h.noticeFor(representment));
    await h.worker.drain(10);
    expect((await h.eventKinds(mine.chargeId)).filter((kind) => kind === "CHARGEBACK_REPRESENTED")).toHaveLength(1);
    expect((await h.eventKinds(theirs.chargeId)).filter((kind) => kind === "CHARGEBACK_REPRESENTED")).toEqual([]);
  });

  it("records a dashboard refund of the first payment in full when the charge also holds a duplicate payment's refund", async () => {
    // The duplicate's refund is only requested yet (its call found xMoney down): it still never counts against A.
    const { paid } = await paidTwice(false);
    const first = paid.transaction.transactionId;
    const linesBefore = h.auditLines.length;
    h.xmoney.setStatus(first, "refund-ok");
    await h.settle(first);
    expect(await refundRowsOf(paid.chargeId, first)).toEqual([
      ["REFUNDED", "PROVIDER_REFUND", 24_200_000], ["REFUND_REQUESTED", "PROVIDER_REFUND", 24_200_000]
    ]);
    expect(h.auditLines.slice(linesBefore)).toContainEqual({
      event: "billing.invoice.unknown", issuer: "SMARTBILL", kind: "CREDIT_NOTE", code: "CREDIT_NOTE_MANUAL"
    });
    const charge = (await h.repository.charge(paid.chargeId))!;
    expect(paidTransactions([charge], paid.transaction.createdAt!)).toEqual([expect.objectContaining({
      transactionId: first, refundedMicros: 24_200_000, providerRefunded: true
    })]);
    await expect(h.repository.withTransaction((client) => h.refunds.requestAll(client, {
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL", at: h.clock.now,
      allocations: [{ chargeId: paid.chargeId, transactionId: first, amountMicros: 1_000_000 }]
    }))).rejects.toMatchObject({ code: "REFUND_TRANSACTION_ALREADY_REFUNDED" });
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
  });

  it("voids the first payment in full with its credit note when the charge also holds a refunded duplicate (A9)", async () => {
    for (const status of ["void-ok", "cancel-ok"] as const) {
      const { paid, again } = await paidTwice(true);
      const first = paid.transaction.transactionId;
      h.xmoney.setStatus(first, status);
      await h.notices.receive(h.noticeFor(h.xmoney.transactions.get(first)!));
      await h.worker.drain(10);
      expect(await refundRowsOf(paid.chargeId, first)).toEqual([
        ["REFUNDED", "PROVIDER_VOID", 24_200_000], ["REFUND_REQUESTED", "PROVIDER_VOID", 24_200_000]
      ]);
      // The duplicate's own refund is untouched.
      expect(await refundRowsOf(paid.chargeId, again.transactionId)).toEqual([
        ["REFUNDED", "DUPLICATE_PAYMENT", 24_200_000], ["REFUND_REQUESTED", "DUPLICATE_PAYMENT", 24_200_000]
      ]);
      expect((await h.outboxRows(paid.chargeId)).filter((row) => row.kind === "SMARTBILL_STORNO")).toEqual([
        expect.objectContaining({
          ref: `${paid.chargeId}:${first}`, payload: { charge_id: paid.chargeId, transaction_id: first, refund_micros: 24_200_000 }
        })
      ]);
      expect(await noticeOutcomes(first)).toEqual([{ outcome: "REFUNDED" }]);
    }
  });
});

describe("P2-I2 a dispute xMoney reports as its own transaction", () => {
  const chargebacksOf = async (chargeId: string) => ((await h.repository.charge(chargeId))?.events ?? [])
    .filter((event) => event.kind === "CHARGEBACK").map((event) => [event.xmoneyTransactionId, event.errorCode, event.amountMicros]);
  const disputeStores = (): DisputeStores => Object.freeze({
    billing: h.repository, jobs: h.jobs, entitlements: h.entitlements, clock: () => h.clock.now
  });

  it("records it once, under the payment it names, on that payment's charge, whichever report comes first", async () => {
    for (const disputeFirst of [true, false]) {
      const paid = await h.activate();
      const payment = paid.transaction.transactionId;
      // xMoney reports both, as P3b's fake models it: the payment turns charge-back and a chargeback transaction names it.
      const dispute = h.xmoney.dispute(payment);
      h.xmoney.setStatus(payment, "charge-back");
      for (const transactionId of disputeFirst ? [dispute.transactionId, payment] : [payment, dispute.transactionId]) {
        await h.settle(transactionId);
      }
      await h.settle(dispute.transactionId);
      expect(await chargebacksOf(paid.chargeId), `dispute first: ${disputeFirst}`).toEqual([[payment, null, 24_200_000]]);
      expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED", "SUSPENDED"]);
      expect((await h.outboxRows(paid.chargeId)).filter((row) => row.ref === `M10:${paid.chargeId}`)).toHaveLength(1);
      expect((await h.outboxRows(dispute.transactionId))
        .filter((row) => row.kind === "VERIFY_PAYMENT" && row.ref === dispute.transactionId)
        .map((row) => [row.done, row.dead])).toEqual([[true, false], [true, false]]);
      // One dispute is one charge-back: the owner's "won" resumes the plan at once.
      expect(await recordDisputeOutcome(disputeStores(), { chargeRef: paid.chargeId, outcome: "won" })).toBe("RESUMED");
    }
  });

  it("suspends the plan when xMoney reports only the dispute transaction", async () => {
    const paid = await h.activate();
    const payment = paid.transaction.transactionId;
    const dispute = h.xmoney.dispute(payment);
    await h.notices.receive(h.noticeFor(dispute));
    await h.worker.drain(10);
    expect(await chargebacksOf(paid.chargeId)).toEqual([[payment, null, 24_200_000]]);
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED", "SUSPENDED"]);
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "FREE", cause: "SUSPENDED_CHARGEBACK" });
    expect(await noticeOutcomes(dispute.transactionId)).toEqual([{ outcome: "CHARGEBACK" }]);
    // The payment's own later charge-back status is the same dispute.
    h.xmoney.setStatus(payment, "charge-back");
    await h.settle(payment);
    expect(await chargebacksOf(paid.chargeId)).toEqual([[payment, null, 24_200_000]]);
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED", "SUSPENDED"]);
  });

  it("never reads a dispute transaction as a payment, whatever status xMoney gives it", async () => {
    const paid = await h.activate();
    const payment = paid.transaction.transactionId;
    // Still in flight: nothing is written, and the check comes back later.
    const pending = h.xmoney.dispute(payment, "in-progress");
    await h.settle(pending.transactionId);
    expect(await chargebacksOf(paid.chargeId)).toEqual([]);
    expect((await h.outboxRows(pending.transactionId)).find((row) => row.kind === "VERIFY_PAYMENT" && row.ref === pending.transactionId))
      .toMatchObject({ done: false, dead: false, lastErrorCode: "PAYMENT_NOT_FINAL" });
    // A dispute that did not happen moves nothing.
    const failed = h.xmoney.dispute(payment, "complete-failed");
    await h.settle(failed.transactionId);
    expect(await chargebacksOf(paid.chargeId)).toEqual([]);
    // `complete-ok` on a chargeback transaction is the dispute, never a second payment to refund.
    const complete = h.xmoney.dispute(payment, "complete-ok");
    await h.settle(complete.transactionId);
    expect(await h.eventKinds(paid.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "CHARGEBACK"));
    expect(await chargebacksOf(paid.chargeId)).toEqual([[payment, null, 24_200_000]]);
    expect((await h.outboxRows(paid.chargeId)).filter((row) => row.kind === "XMONEY_REFUND")).toEqual([]);
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED", "SUSPENDED"]);
  });

  it("changes nothing when it is first seen after its payment's dispute was won", async () => {
    const paid = await h.activate();
    const payment = paid.transaction.transactionId;
    h.xmoney.setStatus(payment, "charge-back");
    await h.settle(payment);
    expect(await recordDisputeOutcome(disputeStores(), { chargeRef: paid.chargeId, outcome: "won" })).toBe("RESUMED");
    const dispute = h.xmoney.dispute(payment);
    await h.settle(dispute.transactionId);
    expect(await chargebacksOf(paid.chargeId)).toEqual([[payment, null, 24_200_000]]);
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED", "SUSPENDED", "RESUMED"]);
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "PLUS", cause: "RESUMED" });
    expect((await h.outboxRows(paid.chargeId)).filter((row) => row.ref === `M10:${paid.chargeId}`)).toHaveLength(1);
  });

  it("records a dispute of a second payment on that payment, without touching the plan", async () => {
    const { paid, again } = await paidTwice(true);
    const dispute = h.xmoney.dispute(again.transactionId);
    await h.settle(dispute.transactionId);
    expect(await chargebacksOf(paid.chargeId)).toEqual([[again.transactionId, "DUPLICATE_PAYMENT", 24_200_000]]);
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
    h.xmoney.setStatus(again.transactionId, "charge-back");
    await h.settle(again.transactionId);
    expect(await chargebacksOf(paid.chargeId)).toEqual([[again.transactionId, "DUPLICATE_PAYMENT", 24_200_000]]);
  });

  it("waits for a payment it does not know yet, and never falls back to the order", async () => {
    const paid = await h.activate();
    // A payment of this order that VERIFY_PAYMENT has not recorded: the dispute names only it.
    const unseen = h.xmoney.pay({ externalOrderId: paid.chargeId, amountDecimal: paid.totalDecimal, cardCountry: "RO" });
    const dispute = h.xmoney.dispute(unseen.transactionId);
    await h.settle(dispute.transactionId);
    expect(await chargebacksOf(paid.chargeId)).toEqual([]);
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
    expect((await h.outboxRows(dispute.transactionId)).find((row) => row.kind === "VERIFY_PAYMENT" && row.ref === dispute.transactionId))
      .toMatchObject({ done: false, dead: false, lastErrorCode: "CHARGE_NOT_FOUND" });
  });
});
