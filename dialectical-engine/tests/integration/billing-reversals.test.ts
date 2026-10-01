import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { paidTransactions } from "../../apps/api/src/billing/refunds.js";
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
    expect(await kinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED", "SUSPENDED"]);
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
