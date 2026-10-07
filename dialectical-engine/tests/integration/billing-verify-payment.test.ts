import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeWindows, foldSubscription } from "@debateai/billing-core";
import {
  AcceptanceRepository, BillingJobQueries, BillingRepository, createPool, EntitlementRepository, type ChargeEventKind
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { sealAcceptanceEvidence } from "../../apps/api/src/legal.js";
import { ChargeStatusReader } from "../../apps/api/src/billing/charge-status.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { chargeEvent, newChargeId, subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { APPLIED } from "../../apps/api/src/billing/settlement.js";
import { createInitialSettlement } from "../../apps/api/src/billing/settlement-initial.js";
import { VerifyPaymentHandler } from "../../apps/api/src/billing/verify-payment.js";
import { activeSubscriptionEvents, testBillingPolicy, testCountryPolicy } from "../support/billingFixtures.js";
import {
  endPoolWithin, kindsOf, startBillingHarness, TEST_PUBLIC_APP_URL, within, type BillingHarness
} from "../support/billingHarness.js";

let h: BillingHarness;
beforeAll(async () => { h = await startBillingHarness(); });
afterAll(async () => { await h?.stop(); });

const subscriptionKinds = async (subscriptionId: string) => (await h.repository.subscriptionEvents(subscriptionId)).map((event) => event.kind);
const status = (chargeId: string, ownerRef: string) => new ChargeStatusReader(h.repository).read(chargeId, ownerRef);
/** A VERIFY_PAYMENT job as the worker hands it over, at a chosen attempt (7: the not-final schedule is spent). */
const claimedCheck = (transactionId: string, attempts: number) => ({
  jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: transactionId, payload: {}, attempts, notBefore: h.clock.now,
  createdAt: h.clock.now, claimedBy: "test", claimedAt: h.clock.now
}) as unknown as Parameters<typeof h.verify.handle>[0];
/**
 * P2-M6: claims the one open job of this kind and ref for `workerId` at `now`, exactly as P1b's `claim` does (the
 * worker, the time, the next attempt), touching no other job of the shared database. Returns it as the worker hands
 * it to its handler.
 */
async function claimOnly(kind: string, ref: string, workerId: string, now: Date): Promise<Parameters<typeof h.refunds.handle>[0]> {
  const row = (await h.database.pool.query<{ job_id: string; payload: Record<string, unknown>; created_at: Date; not_before: Date; attempts: number }>(`
    UPDATE billing.outbox SET claimed_by = $3, claimed_at = $4, attempts = attempts + 1
    WHERE kind = $1 AND ref = $2 AND done_at IS NULL AND dead_at IS NULL
    RETURNING job_id, payload, created_at, not_before, attempts
  `, [kind, ref, workerId, now])).rows[0]!;
  return {
    jobId: row.job_id, kind, ref, payload: row.payload, createdAt: row.created_at, notBefore: row.not_before,
    attempts: row.attempts, claimedBy: workerId, claimedAt: now
  } as unknown as Parameters<typeof h.refunds.handle>[0];
}
/**
 * Hands a job `claimOnly` took back unclaimed and due, as the queue held it before (a test that called a handler
 * directly settles nothing, so the harness's later drains run the job, as they did before P2-M6's claims).
 */
const unclaim = (jobId: string) => h.database.pool.query(
  "UPDATE billing.outbox SET claimed_by = NULL, claimed_at = NULL WHERE job_id = $1", [jobId]
);
/** One charge event, committed on its own (a row another path wrote earlier). */
const appendEvent = (chargeId: string, kind: ChargeEventKind, fields: Parameters<typeof chargeEvent>[3]) =>
  h.repository.withTransaction((client) => h.repository.appendChargeEvent(client, chargeEvent(chargeId, kind, h.clock.now, fields)));
/** The RENEWAL charge of the period after `paid`'s, as P11a writes it: the row and its first REQUESTED (A1). */
async function renewalCharge(paid: Readonly<{ ownerRef: string; subscriptionId: string; quoteId: string }>, totalMicros: number): Promise<string> {
  const state = foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId));
  const chargeId = newChargeId();
  await h.repository.withTransaction(async (client) => {
    await h.repository.insertCharge(client, {
      chargeId, ownerRef: paid.ownerRef, subscriptionId: paid.subscriptionId, kind: "RENEWAL", attempt: 1,
      periodStart: state.currentPeriodEnd!, periodEnd: computeWindows(state.periodAnchorAt!, state.currentPeriodEnd!).month.end,
      quoteId: paid.quoteId, netMicros: 20_000_000, taxMicros: totalMicros - 20_000_000, totalMicros, currency: "USD",
      createdAt: h.clock.now, paymentProvider: "xmoney", paymentEnvironment: "stage"
    });
    await h.repository.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", h.clock.now, {
      providerPaymentId: null, amountMicros: totalMicros, errorCode: null
    }));
  });
  return chargeId;
}

describe("P9b VERIFY_PAYMENT", () => {
  it("activates a paid checkout in one transaction: charge, subscription, entitlement, evidence, invoice job and M1", async () => {
    const bought = await h.buy();
    const paid = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RO" });
    await h.settle(paid.transactionId);
    expect(await h.eventKinds(bought.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED"));
    // D5 5m: the row keeps the verification instant as `at` and the payment's own time for the tax rows.
    const succeededRow = await h.database.pool.query<{ at: Date; provider_created_at: Date | null }>(
      "SELECT at, provider_created_at FROM billing.charge_event WHERE charge_id=$1 AND kind='SUCCEEDED'", [bought.chargeId]
    );
    expect(succeededRow.rows).toEqual([{ at: h.clock.now, provider_created_at: paid.createdAt }]);
    const events = await h.repository.subscriptionEvents(bought.subscriptionId);
    expect(events.map((event) => event.kind)).toEqual(["CREATED", "ACTIVATED"]);
    const anchor = paid.createdAt!;
    expect(events[1]).toMatchObject({
      planId: "PLUS", periodAnchorAt: anchor, xmoneyOrderId: paid.orderId, cardRef: paid.cardId,
      // Terms §12: the net this subscriber renews at, whatever billingPlans later says (P11a).
      data: { charge_id: bought.chargeId, announced_total_micros: 24_200_000, recurring_net_micros: 20_000_000, reactivated: false }
    });
    expect(await h.entitlementRows(bought.ownerRef)).toEqual([
      { planId: "PLUS", cause: "SUBSCRIBED", paidThrough: computeWindows(anchor, anchor).month.end }
    ]);
    const evidence = await h.database.pool.query(
      "SELECT verdict, ip_country, declared_country, card_country FROM billing.location_evidence WHERE charge_id=$1", [bought.chargeId]
    );
    expect(evidence.rows).toEqual([{ verdict: "AGREED", ip_country: "RO", declared_country: "RO", card_country: "RO" }]);
    expect((await h.outboxRows(bought.chargeId)).map((row) => [row.kind, row.ref])).toContainEqual(["SMARTBILL_INVOICE", bought.chargeId]);
    const m1 = (await h.outboxRows(bought.subscriptionId)).find((row) => row.ref === `M1:${bought.subscriptionId}`);
    expect(m1?.payload).toMatchObject({ attachments: "ACCEPTED_TERMS,WITHDRAWAL_FORM", "param.withdrawalDays": "14" });
    // This owner has no TERMS acceptance on record (the harness skips the billing gate that refuses such an account):
    // the attachment names no version, and P17 attaches nothing.
    expect(Object.keys(m1!.payload).filter((key) => key.startsWith("attach.ACCEPTED_TERMS."))).toEqual([]);
    expect(await status(bought.chargeId, bought.ownerRef)).toEqual({ state: "SUCCEEDED", reasonCode: null });
  });

  it("attaches to M1 the Terms the person accepted, in that acceptance's version and locale (spec §2.5.10)", async () => {
    const ownerRef = randomUUID();
    const acceptanceId = randomUUID();
    const evidence = sealAcceptanceEvidence(h.recordsKey, acceptanceId, { ip: "198.51.100.7", userAgent: "test" });
    await h.acceptances.recordAll([{
      acceptanceId, ownerRef, kind: "TERMS", documentVersion: "1.0", documentSha256: "c".repeat(64), locale: "ro",
      surface: "SIGN_UP", acceptedAt: h.clock.now, evidenceCiphertext: evidence.evidenceCiphertext, keyId: evidence.keyId
    }]);
    const paid = await h.activate({ ownerRef });
    const m1 = (await h.outboxRows(paid.subscriptionId)).find((row) => row.ref === `M1:${paid.subscriptionId}`);
    expect(m1?.payload).toMatchObject({
      "attach.ACCEPTED_TERMS.version": "1.0", "attach.ACCEPTED_TERMS.sha256": "c".repeat(64),
      "attach.ACCEPTED_TERMS.locale": "ro"
    });
  });

  it("offers no withdrawal right and no form in M1 outside the withdrawal countries (spec §2.5.6)", async () => {
    h.geo.country = "US";
    const paid = await h.activate({ country: "US", cardCountry: "US" });
    h.geo.country = "RO";
    const m1 = (await h.outboxRows(paid.subscriptionId)).find((row) => row.ref === `M1:${paid.subscriptionId}`);
    expect(m1?.payload).toMatchObject({ attachments: "ACCEPTED_TERMS" });
    expect(Object.keys(m1!.payload)).not.toContain("param.withdrawalDays");
  });

  it("changes state once for the same notice twice, and once more for a late repeat", async () => {
    const bought = await h.buy();
    const paid = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RO" });
    const token = h.noticeFor(paid);
    expect(await h.notices.receive(token)).toBe("STORED");
    expect(await h.notices.receive(token)).toBe("DUPLICATE");
    expect((await h.outboxRows(paid.transactionId)).filter((row) => row.kind === "VERIFY_PAYMENT" && !row.done)).toHaveLength(1);
    await h.worker.drain(10);
    expect(await h.notices.receive(token)).toBe("DUPLICATE");
    await h.worker.drain(10);
    expect((await subscriptionKinds(bought.subscriptionId)).filter((kind) => kind === "ACTIVATED")).toHaveLength(1);
    expect((await h.eventKinds(bought.chargeId)).filter((kind) => kind === "SUCCEEDED")).toHaveLength(1);
    expect((await h.entitlementRows(bought.ownerRef))).toHaveLength(1);
    const outcomes = await h.database.pool.query(
      "SELECT o.outcome FROM billing.xmoney_notice_outcome o JOIN billing.xmoney_notice n USING (notice_id) WHERE n.transaction_id=$1",
      [paid.transactionId]
    );
    expect(outcomes.rows).toEqual([{ outcome: "APPLIED" }]);
  });

  it("retries a notice that arrives before its charge row, then applies it", async () => {
    const chargeId = newChargeId();
    // Paid by the xMoney customer the checkout below creates (its signed order names that customer).
    const paid = h.xmoney.pay({ externalOrderId: chargeId, amountDecimal: "24.20", cardCountry: "RO", customerId: h.xmoney.reserveCustomer() });
    await h.notices.receive(h.noticeFor(paid));
    await h.worker.drain(10);
    const [waiting] = (await h.outboxRows(paid.transactionId)).filter((row) => row.kind === "VERIFY_PAYMENT");
    expect(waiting).toMatchObject({ done: false, dead: false, lastErrorCode: "CHARGE_NOT_FOUND", notBefore: new Date(h.clock.now.getTime() + 60_000) });
    const bought = await h.buy({ chargeId });
    await h.worker.drain(10);
    expect(await subscriptionKinds(bought.subscriptionId)).toEqual(["CREATED"]);
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(await subscriptionKinds(bought.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
  });

  it("waits for a payment that is not final, on the 1-minute-first schedule", async () => {
    const bought = await h.buy();
    const pending = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RO", status: "3d-pending" });
    await h.settle(pending.transactionId);
    expect(await h.eventKinds(bought.chargeId)).toEqual(kindsOf("REQUESTED"));
    expect((await h.outboxRows(pending.transactionId)).find((row) => row.kind === "VERIFY_PAYMENT"))
      .toMatchObject({ lastErrorCode: "PAYMENT_NOT_FINAL", done: false });
    h.xmoney.setStatus(pending.transactionId, "complete-ok");
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(await h.eventKinds(bought.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED"));
  });

  it("changes nothing when the amount does not match, and records a decline the person can retry", async () => {
    const wrong = await h.buy();
    const odd = h.xmoney.pay({ externalOrderId: wrong.chargeId, amountDecimal: "1.00", cardCountry: "RO" });
    await h.settle(odd.transactionId);
    expect(await h.eventKinds(wrong.chargeId)).toEqual(kindsOf("REQUESTED"));
    expect(h.auditLines.some((line) => line.event === "billing.payment.mismatch")).toBe(true);
    const declined = await h.buy();
    const refused = h.xmoney.pay({ externalOrderId: declined.chargeId, amountDecimal: declined.totalDecimal, cardCountry: "RO", status: "complete-failed" });
    await h.settle(refused.transactionId);
    expect(await h.eventKinds(declined.chargeId)).toEqual(kindsOf("REQUESTED", "FAILED"));
    expect(await subscriptionKinds(declined.subscriptionId)).toEqual(["CREATED"]);
    expect(await status(declined.chargeId, declined.ownerRef)).toEqual({ state: "NEEDS_ACTION", reasonCode: "PAYMENT_DECLINED" });
  });

  it("ends MISMATCH and moves nothing for a forged notice naming another open charge; the payer's own notice still applies (P2-I1)", async () => {
    // Spec §2.7: "The browser never decides a payment, and neither does a notice." Two open checkouts of one price; a
    // notice decrypts under our key (it has no MAC) and names the payer's transaction with the other person's charge.
    const payer = await h.buy();
    const other = await h.buy();
    const paid = h.xmoney.pay({ externalOrderId: payer.chargeId, amountDecimal: payer.totalDecimal, cardCountry: "RO" });
    const before = h.auditLines.length;
    expect(await h.notices.receive(h.noticeFor(paid, { externalOrderId: other.chargeId }))).toBe("STORED");
    await h.worker.drain(10);
    expect(await h.eventKinds(other.chargeId)).toEqual(kindsOf("REQUESTED"));
    expect(await subscriptionKinds(other.subscriptionId)).toEqual(["CREATED"]);
    expect(await h.entitlementRows(other.ownerRef)).toEqual([]);
    expect(await h.eventKinds(payer.chargeId)).toEqual(kindsOf("REQUESTED"));
    expect((await h.outboxRows(paid.transactionId)).filter((row) => row.kind === "VERIFY_PAYMENT").map((row) => [row.done, row.dead]))
      .toEqual([[true, false]]);
    const outcomes = await h.database.pool.query(
      "SELECT o.outcome FROM billing.xmoney_notice_outcome o JOIN billing.xmoney_notice n USING (notice_id) WHERE n.transaction_id=$1",
      [paid.transactionId]
    );
    expect(outcomes.rows).toEqual([{ outcome: "MISMATCH" }]);
    // One content-free line: no id of either person, no amount.
    expect(h.auditLines.slice(before)).toEqual([{ event: "billing.payment.mismatch", code: "ORDER_REF_MISMATCH" }]);
    // The forged notice does not hold the other person's checkout: their young open charge is simply reused.
    expect(await h.buy({ ownerRef: other.ownerRef })).toMatchObject({ chargeId: other.chargeId, reused: true });
    // The payer's own notice (xMoney's order reference) activates the payer's plan with the payer's payment.
    expect(await h.notices.receive(h.noticeFor(paid))).toBe("STORED");
    await h.worker.drain(10);
    expect(await h.eventKinds(payer.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED"));
    expect(await subscriptionKinds(payer.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
    expect(foldSubscription(await h.repository.subscriptionEvents(payer.subscriptionId)))
      .toMatchObject({ xmoneyOrderId: paid.orderId, xmoneyCustomerId: paid.customerId, cardRef: paid.cardId });
  });

  it("ends MISMATCH when a first payment's customer is not the checkout's xMoney customer (P2-I1)", async () => {
    const bought = await h.buy();
    const stranger = h.xmoney.pay({
      externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RO", customerId: "4040404"
    });
    const before = h.auditLines.length;
    await h.notices.receive(h.noticeFor(stranger));
    await h.worker.drain(10);
    expect(await h.eventKinds(bought.chargeId)).toEqual(kindsOf("REQUESTED"));
    expect(await subscriptionKinds(bought.subscriptionId)).toEqual(["CREATED"]);
    expect(h.auditLines.slice(before)).toEqual([{ event: "billing.payment.mismatch", code: "CUSTOMER_MISMATCH" }]);
  });

  it("ends the checkout ABANDONED and reads FAILED when the owner refunded its payment before we verified it (P2-M5)", async () => {
    const bought = await h.buy();
    // Refunded in the xMoney dashboard before any check of ours ran: the payment's own status is already refund-ok.
    const refunded = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RO", status: "refund-ok" });
    await h.settle(refunded.transactionId);
    // The money came and went: recorded as such, with no plan, no invoice and no M1.
    expect(await h.eventKinds(bought.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    expect((await h.repository.subscriptionEvents(bought.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED", reason: "PROVIDER_REFUND" } });
    expect(await subscriptionKinds(bought.subscriptionId)).not.toContain("ACTIVATED");
    // The waiting screen never says "Your plan is active", and the person can buy again at once (no CHECKOUT_PENDING).
    expect(await status(bought.chargeId, bought.ownerRef)).toEqual({ state: "FAILED", reasonCode: "PROVIDER_REFUND" });
    const again = await h.buy({ ownerRef: bought.ownerRef });
    expect(again.chargeId).not.toBe(bought.chargeId);
  });

  it("reads FAILED when a checkout's payment was charged back before we verified it, and no sale is recorded (C-19)", async () => {
    // Part 4 final review C-19 (the controller's ruling): the check finds the payment already `charge-back`, so the
    // charge records only its CHARGEBACK (no SUCCEEDED, no plan, no M10): the waiting screen must not wait for ever.
    const bought = await h.buy();
    const disputed = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RO", status: "charge-back" });
    await h.settle(disputed.transactionId);
    expect(await h.eventKinds(bought.chargeId)).toEqual(kindsOf("REQUESTED", "CHARGEBACK"));
    expect(await subscriptionKinds(bought.subscriptionId)).not.toContain("ACTIVATED");
    expect(await status(bought.chargeId, bought.ownerRef)).toEqual({ state: "FAILED", reasonCode: "CHARGEBACK" });
    const quarter = { from: new Date(h.clock.now.getTime() - 86_400_000), to: new Date(h.clock.now.getTime() + 86_400_000) };
    expect((await h.repository.quarterSummaryRows(quarter.from, quarter.to, { provider: "xmoney", environment: "stage" }))
      .filter((row) => row.chargeId === bought.chargeId).map((row) => `${row.type} ${String(row.saleRecorded)}`))
      .toEqual(["CHARGEBACK false"]);
  });

  it("answers no one but the charge's owner about its status (P2-M16)", async () => {
    const paid = await h.activate();
    expect(await status(paid.chargeId, paid.ownerRef)).toEqual({ state: "SUCCEEDED", reasonCode: null });
    // Another signed-in person who learned the charge reference reads nothing, as for a reference that does not exist.
    expect(await status(paid.chargeId, randomUUID())).toBeNull();
    expect(await status("0".repeat(32), paid.ownerRef)).toBeNull();
  });

  it("refunds a card from a blocked country through the refund job: intent first, one call, no invoice, M11", async () => {
    const bought = await h.buy();
    const paid = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RU" });
    const refundsBefore = h.xmoney.refunds.length;
    await h.settle(paid.transactionId);
    expect(await h.eventKinds(bought.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    expect(h.xmoney.refunds.slice(refundsBefore)).toEqual([{ transactionId: paid.transactionId, amountDecimal: null, reason: "fraud-confirm" }]);
    const events = await h.repository.subscriptionEvents(bought.subscriptionId);
    expect(events.at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED", reason: "CARD_COUNTRY_BLOCKED" } });
    const jobs = await h.outboxRows(bought.chargeId);
    expect(jobs.map((row) => row.kind)).not.toContain("SMARTBILL_INVOICE");
    expect(jobs.find((row) => row.kind === "XMONEY_REFUND")).toMatchObject({
      ref: `${bought.chargeId}:${paid.transactionId}`, done: true,
      payload: { charge_id: bought.chargeId, transaction_id: paid.transactionId, amount_micros: 24_200_000, whole: true, reason: "CARD_COUNTRY_BLOCKED" }
    });
    expect(jobs.map((row) => row.ref)).toContain(`M11:${bought.chargeId}`);
    // W10 (P2-M9): a checkout's plan never started, so M11 names no plan that ended.
    expect(jobs.find((row) => row.ref === `M11:${bought.chargeId}`)?.payload).not.toHaveProperty("param.endedPlan");
    expect(await h.entitlementRows(bought.ownerRef)).toEqual([]);
    expect(await status(bought.chargeId, bought.ownerRef)).toEqual({ state: "FAILED", reasonCode: "CARD_COUNTRY_BLOCKED" });
  });

  it("never refunds twice: an unknown refund outcome is looked up before any second call (A4c)", async () => {
    const retried = await h.buy();
    const first = h.xmoney.pay({ externalOrderId: retried.chargeId, amountDecimal: retried.totalDecimal, cardCountry: "RU" });
    h.xmoney.refundFailures = 1;
    const before = h.xmoney.refunds.length;
    await h.settle(first.transactionId);
    expect(await h.eventKinds(retried.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED"));
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(await h.eventKinds(retried.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    expect(h.xmoney.refunds.length - before).toBe(1);

    const lost = await h.buy();
    const second = h.xmoney.pay({ externalOrderId: lost.chargeId, amountDecimal: lost.totalDecimal, cardCountry: "RU" });
    h.xmoney.refundFailures = 1;
    await h.settle(second.transactionId);
    h.xmoney.setStatus(second.transactionId, "refund-ok");
    const middle = h.xmoney.refunds.length;
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(await h.eventKinds(lost.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    expect(h.xmoney.refunds.length).toBe(middle);
  });

  it("records a refund xMoney already reports through VERIFY_PAYMENT, and the refund job then does nothing", async () => {
    const bought = await h.buy();
    const paid = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RU" });
    h.xmoney.refundFailures = 1;
    await h.settle(paid.transactionId);
    h.xmoney.setStatus(paid.transactionId, "refund-ok");
    const calls = h.xmoney.refunds.length;
    await h.settle(paid.transactionId);
    expect(await h.eventKinds(bought.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(h.xmoney.refunds.length).toBe(calls);
    expect((await h.eventKinds(bought.chargeId)).filter((kind) => kind === "REFUNDED")).toHaveLength(1);
  });

  it("re-activates a late payment for an abandoned checkout, unless the owner already has a plan (A8c)", async () => {
    const lone = await h.buy();
    const loneEvents = await h.repository.subscriptionEvents(lone.subscriptionId);
    await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client,
      subscriptionEvent(foldSubscription(loneEvents), "ENDED", h.clock.now, { cause: "ABANDONED", reason: "TEST" })));
    const late = h.xmoney.pay({ externalOrderId: lone.chargeId, amountDecimal: lone.totalDecimal, cardCountry: "RO" });
    await h.settle(late.transactionId);
    expect((await h.repository.subscriptionEvents(lone.subscriptionId)).at(-1)).toMatchObject({ kind: "ACTIVATED", data: { reactivated: true } });

    const ownerRef = (await h.buy()).ownerRef;
    const abandoned = await h.repository.subscriptionForOwner(ownerRef);
    h.clock.advance(31 * 60_000);
    const current = await h.activate({ ownerRef });
    const firstCharge = (await h.repository.chargesForSubscription(abandoned!.subscriptionId))[0]!;
    const latePayment = h.xmoney.pay({ externalOrderId: firstCharge.chargeId, amountDecimal: "24.20", cardCountry: "RO" });
    await h.settle(latePayment.transactionId);
    expect(await h.eventKinds(firstCharge.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    expect((await h.outboxRows(firstCharge.chargeId)).map((row) => row.ref)).toContain(`M11_DUPLICATE:${firstCharge.chargeId}`);
    expect((await h.repository.subscriptionForOwner(ownerRef))?.subscriptionId).toBe(current.subscriptionId);
    expect((await h.repository.subscriptionForOwner(ownerRef))?.status).toBe("ACTIVE");
  });

  it("never leaves an owner with two live plans: an abandoned checkout paid first, then the newer one (A8c)", async () => {
    const ownerRef = randomUUID();
    const older = await h.buy({ ownerRef, planId: "PLUS" });
    const newer = await h.buy({ ownerRef, planId: "PRO" });
    expect((await h.repository.subscriptionEvents(older.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED", reason: "NEW_CHECKOUT" } });
    const olderPaid = h.xmoney.pay({ externalOrderId: older.chargeId, amountDecimal: older.totalDecimal, cardCountry: "RO" });
    await h.settle(olderPaid.transactionId);
    expect((await h.repository.subscriptionEvents(older.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ACTIVATED", data: { reactivated: true } });
    expect((await h.repository.subscriptionEvents(newer.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED", reason: "SUPERSEDED" } });
    const newerPaid = h.xmoney.pay({ externalOrderId: newer.chargeId, amountDecimal: newer.totalDecimal, cardCountry: "RO" });
    await h.settle(newerPaid.transactionId);
    expect(await h.eventKinds(newer.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    expect((await h.outboxRows(newer.chargeId)).map((row) => row.ref)).toContain(`M11_DUPLICATE:${newer.chargeId}`);
    expect((await h.repository.subscriptionEvents(newer.subscriptionId)).at(-1)).toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED" } });
    const states = await h.repository.subscriptionsForOwner(ownerRef);
    expect(states.filter((state) => state.status === "ACTIVE").map((state) => state.subscriptionId)).toEqual([older.subscriptionId]);
    const end = foldSubscription(await h.repository.subscriptionEvents(older.subscriptionId)).currentPeriodEnd!;
    const due = (await h.repository.dueRenewals(new Date(end.getTime() + 60_000), 5 * 60_000, 50, { provider: "xmoney", environment: "stage" }))
      .filter((state) => state.ownerRef === ownerRef).map((state) => state.subscriptionId);
    expect(due).toEqual([older.subscriptionId]);
  });

  it("refuses a CREATED checkout's payment while another plan of the owner is live, and abandons the checkout", async () => {
    const bought = await h.buy();
    await h.repository.withTransaction(async (client) => {
      for (const event of activeSubscriptionEvents(bought.ownerRef, h.clock.now)) await h.repository.appendSubscriptionEvent(client, event);
    });
    const paid = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RO" });
    await h.settle(paid.transactionId);
    expect(await h.eventKinds(bought.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    expect((await h.repository.subscriptionEvents(bought.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED", reason: "ALREADY_SUBSCRIBED" } });
    expect(await status(bought.chargeId, bought.ownerRef)).toEqual({ state: "FAILED", reasonCode: "ALREADY_SUBSCRIBED" });
    expect(await h.entitlementRows(bought.ownerRef)).toEqual([]);
  });

  it("refunds a second complete-ok on one INITIAL order as a duplicate payment, and changes nothing else (D5 5f, D7 #5)", async () => {
    const paid = await h.activate();
    const again = h.xmoney.pay({ externalOrderId: paid.chargeId, amountDecimal: paid.totalDecimal, cardCountry: "RO" });
    const token = h.noticeFor(again);
    await h.notices.receive(token);
    await h.worker.drain(10);
    // The same charge records it: one SUCCEEDED (the first payment), one DUPLICATE_PAYMENT, and its refund.
    expect(await h.eventKinds(paid.chargeId))
      .toEqual(kindsOf("REQUESTED", "SUCCEEDED", "DUPLICATE_PAYMENT", "REFUND_REQUESTED", "REFUNDED"));
    const charge = (await h.repository.charge(paid.chargeId))!;
    expect(charge.events.find((event) => event.kind === "DUPLICATE_PAYMENT"))
      .toMatchObject({ providerPaymentId: again.transactionId, amountMicros: 24_200_000 });
    expect(charge.events.find((event) => event.kind === "REFUND_REQUESTED"))
      .toMatchObject({ providerPaymentId: again.transactionId, errorCode: "DUPLICATE_PAYMENT" });
    expect(await h.repository.chargesForSubscription(paid.subscriptionId)).toHaveLength(1);
    expect(await subscriptionKinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
    expect(h.xmoney.refunds.at(-1)).toEqual({ transactionId: again.transactionId, amountDecimal: null, reason: "customer-demand" });
    const jobs = await h.outboxRows(paid.chargeId);
    expect(jobs.map((row) => row.ref)).toContain(`M11_DUPLICATE:${paid.chargeId}:${again.transactionId}`);
    expect(jobs.filter((row) => row.kind === "SMARTBILL_INVOICE")).toHaveLength(1);
    expect(jobs.map((row) => row.kind)).not.toContain("SMARTBILL_STORNO");
    expect(await h.entitlementRows(paid.ownerRef)).toHaveLength(1);
    expect(h.auditLines.some((line) => line.event === "billing.payment.duplicate")).toBe(true);
    expect(await status(paid.chargeId, paid.ownerRef)).toEqual({ state: "SUCCEEDED", reasonCode: null });
    const outcomes = await h.database.pool.query(
      "SELECT o.outcome FROM billing.xmoney_notice_outcome o JOIN billing.xmoney_notice n USING (notice_id) WHERE n.transaction_id=$1",
      [again.transactionId]
    );
    expect(outcomes.rows).toEqual([{ outcome: "DUPLICATE" }]);
    // A replay of either payment changes nothing; the refund's own status reads back to the same charge.
    await h.settle(again.transactionId);
    await h.settle(paid.transaction.transactionId);
    expect((await h.eventKinds(paid.chargeId)).filter((kind) => kind === "REFUNDED")).toHaveLength(1);
    expect(await h.repository.chargesForSubscription(paid.subscriptionId)).toHaveLength(1);
  });

  it("refunds the loser when two payments of one checkout are verified at the same moment (D5 5f)", async () => {
    const bought = await h.buy();
    const first = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RO" });
    const second = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "RO" });
    const job = (transactionId: string) => ({
      jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: transactionId, payload: {}, attempts: 1, notBefore: h.clock.now,
      createdAt: h.clock.now, claimedBy: "test", claimedAt: h.clock.now
    }) as unknown as Parameters<typeof h.verify.handle>[0];
    await Promise.all([h.verify.handle(job(first.transactionId), h.clock.now), h.verify.handle(job(second.transactionId), h.clock.now)]);
    await h.worker.drain(10);
    const charge = (await h.repository.charge(bought.chargeId))!;
    const winner = charge.events.find((event) => event.kind === "SUCCEEDED")!.providerPaymentId;
    const loser = winner === first.transactionId ? second.transactionId : first.transactionId;
    expect(charge.events.filter((event) => event.kind === "DUPLICATE_PAYMENT").map((event) => event.providerPaymentId)).toEqual([loser]);
    expect(h.xmoney.refunds.filter((refund) => refund.transactionId === winner)).toHaveLength(0);
    expect(h.xmoney.refunds.filter((refund) => refund.transactionId === loser)).toHaveLength(1);
    expect((await subscriptionKinds(bought.subscriptionId)).filter((kind) => kind === "ACTIVATED")).toHaveLength(1);
  });

  it("refunds a second success the not-final schedule never matched to a rebill, instead of waiting for ever (D5 5f)", async () => {
    const paid = await h.activate();
    const rebilled = await h.xmoney.rebill({
      orderId: paid.transaction.orderId, customerId: paid.transaction.customerId, amountDecimal: paid.totalDecimal
    });
    // Six not-final retries (1m … 24h) find no SUBMITTED for it; the seventh attempt settles it.
    await h.settle(rebilled.transactionId);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      h.clock.advance(25 * 3_600_000);
      await h.worker.drain(10);
    }
    expect(await h.eventKinds(paid.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "DUPLICATE_PAYMENT", "REFUND_REQUESTED", "REFUNDED"));
    expect((await h.outboxRows(rebilled.transactionId)).find((row) => row.kind === "VERIFY_PAYMENT")).toMatchObject({ done: true });
  });

  it("waits, as CHARGE_NOT_FOUND, on a second success xMoney marks as a rebill", async () => {
    const paid = await h.activate();
    const rebilled = await h.xmoney.rebill({
      orderId: paid.transaction.orderId, customerId: paid.transaction.customerId, amountDecimal: paid.totalDecimal
    });
    await h.settle(rebilled.transactionId);
    expect((await h.outboxRows(rebilled.transactionId)).find((row) => row.kind === "VERIFY_PAYMENT"))
      .toMatchObject({ done: false, dead: false, lastErrorCode: "CHARGE_NOT_FOUND" });
    expect(await h.repository.chargesForSubscription(paid.subscriptionId)).toHaveLength(1);
  });

  it("records a lost partial refund from its own refund transaction, never calling twice (A4c, D5 5g)", async () => {
    const paid = await h.activate();
    const before = h.xmoney.refunds.length;
    h.xmoney.refundLostResponses = 1;
    await h.repository.withTransaction((client) => h.refunds.requestAll(client, {
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL", at: h.clock.now,
      allocations: [{ chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros: 12_100_000 }]
    }));
    await h.worker.drain(10);
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(h.xmoney.refunds.length - before).toBe(1);
    const [refundRow] = h.xmoney.refundTransactionsOf(paid.transaction.transactionId);
    expect((await h.repository.charge(paid.chargeId))!.events.find((event) => event.kind === "REFUNDED")).toMatchObject({
      providerPaymentId: refundRow!.transactionId, refundsTransactionId: paid.transaction.transactionId, amountMicros: 12_100_000
    });
    // Its notice later reads back to the same charge as ours: nothing more is recorded.
    await h.settle(refundRow!.transactionId);
    expect((await h.eventKinds(paid.chargeId)).filter((kind) => kind === "REFUNDED")).toHaveLength(1);
  });

  it("hands the owner a dashboard refund of the same amount as our landed refund, never reading it as ours (P2-M1)", async () => {
    const paid = await h.activate();
    h.xmoney.refundLostResponses = 1;
    await h.repository.withTransaction((client) => h.refunds.requestAll(client, {
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL", at: h.clock.now,
      allocations: [{ chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros: 12_100_000 }]
    }));
    await h.worker.drain(10);
    h.clock.advance(61_000);
    await h.worker.drain(10);
    // Ours landed and is recorded on its own refund transaction (the payment still reads complete-ok: a partial refund).
    const [ours] = h.xmoney.refundTransactionsOf(paid.transaction.transactionId);
    expect((await h.repository.charge(paid.chargeId))!.events.find((event) => event.kind === "REFUNDED"))
      .toMatchObject({ providerPaymentId: ours!.transactionId, amountMicros: 12_100_000 });
    // The owner then refunds the same 12.10 again in the dashboard: another refund transaction, not ours.
    await h.xmoney.refund({ transactionId: paid.transaction.transactionId, amountDecimal: "12.10", reason: "customer-demand", message: "dashboard" });
    const dashboard = h.xmoney.refundTransactionsOf(paid.transaction.transactionId).find((row) => row.transactionId !== ours!.transactionId);
    const linesBefore = h.auditLines.length;
    await h.settle(dashboard!.transactionId);
    expect((await h.eventKinds(paid.chargeId)).filter((kind) => kind === "REFUNDED")).toHaveLength(1);
    expect((await h.outboxRows(dashboard!.transactionId)).filter((row) => row.kind === "VERIFY_PAYMENT" && row.ref === dashboard!.transactionId))
      .toEqual([expect.objectContaining({ dead: true, lastErrorCode: "REFUND_UNRECORDED" })]);
    expect(h.auditLines.slice(linesBefore)).toContainEqual({ event: "billing.refund.unrecorded", reason: "PROVIDER_REFUND" });
  });

  it("never sends a partial refund twice when its answer was lost and xMoney shows no refund row; the owner gets it (A4c)", async () => {
    const paid = await h.activate();
    const before = h.xmoney.refunds.length;
    const withdraw = (amountMicros: number) => h.repository.withTransaction((client) => h.refunds.requestAll(client, {
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL", at: h.clock.now,
      allocations: [{ chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros }]
    }));
    h.xmoney.refundLostResponses = 1;
    h.xmoney.refundRowsHidden = true;
    await withdraw(12_100_000);
    await h.worker.drain(10);
    h.clock.advance(61_000);
    await h.worker.drain(10);
    h.xmoney.refundRowsHidden = false;
    expect(h.xmoney.refunds.length - before).toBe(1);
    expect((await h.outboxRows(`${paid.chargeId}:${paid.transaction.transactionId}`)).find((row) => row.kind === "XMONEY_REFUND"))
      .toMatchObject({ dead: true, lastErrorCode: "REFUND_OUTCOME_UNKNOWN" });
    expect(await h.eventKinds(paid.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED"));
    expect(h.auditLines).toContainEqual({ event: "billing.refund.outcome_unknown", reason: "WITHDRAWAL" });
    // Q-5: the owner is emailed at once, in English, with the charge, the amount and why it stopped.
    const ownerMail = (await h.outboxRows(`O2:${paid.chargeId}:${paid.transaction.transactionId}`)).find((row) => row.kind === "EMAIL");
    expect(ownerMail?.payload).toMatchObject({
      template: "O2", recipient: "OWNER", customer_id: null, "param.chargeRef": paid.chargeId,
      "param.refundAmount": "12.10", "param.reasonCode": "REFUND_OUTCOME_UNKNOWN"
    });
    // A second refund request on the same transaction fails loudly instead of recording nothing.
    await expect(withdraw(1_000_000)).rejects.toMatchObject({ code: "REFUND_TRANSACTION_ALREADY_REFUNDED" });
  });

  it("emails the owner at once when xMoney refuses a refund, and moves no money (Q-5)", async () => {
    const paid = await h.activate();
    const refusing = {
      getTransaction: (transactionId: string) => h.xmoney.getTransaction(transactionId),
      listTransactions: (query: Parameters<typeof h.xmoney.listTransactions>[0]) => h.xmoney.listTransactions(query),
      refund: async (): Promise<void> => { throw new TypedDomainError("XMONEY_REFUSED", "XMONEY_REFUSED:1402"); }
    };
    const desk = new RefundDesk({ repository: h.repository, jobs: h.jobs, xmoney: refusing, policy: testBillingPolicy, audit: h.audit, clock: h.clock.read, xmoneyEnvironment: "stage" });
    // A withdrawal refund is always a named amount (P12d, P2-I5: never `whole`); here it is the whole 24.20.
    await h.repository.withTransaction((client) => desk.request(client, {
      chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros: 24_200_000, whole: false,
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL"
    }, h.clock.now));
    // The job itself, claimed (P2-M6: only its claim holder may record the call's stage and make the call).
    const claimed = await claimOnly("XMONEY_REFUND", `${paid.chargeId}:${paid.transaction.transactionId}`, "test", h.clock.now);
    expect(await desk.handle(claimed, h.clock.now)).toEqual({ kind: "DEAD", code: "XMONEY_REFUSED" });
    await unclaim(claimed.jobId);
    const ownerMail = (await h.outboxRows(`O2:${paid.chargeId}:${paid.transaction.transactionId}`)).find((row) => row.kind === "EMAIL");
    expect(ownerMail?.ref).toBe(`O2:${paid.chargeId}:${paid.transaction.transactionId}`);
    expect(ownerMail?.payload).toMatchObject({
      template: "O2", recipient: "OWNER", "param.refundAmount": "24.20", "param.reasonCode": "XMONEY_REFUSED",
      "param.notRequested": "false"
    });
    expect(await h.eventKinds(paid.chargeId)).not.toContain("REFUNDED");
  });

  it("keeps retrying a refund xMoney refuses our credentials for, with the operator alarm, and never kills it (D5 5i)", async () => {
    const paid = await h.activate();
    const refused = {
      getTransaction: (transactionId: string) => h.xmoney.getTransaction(transactionId),
      listTransactions: (query: Parameters<typeof h.xmoney.listTransactions>[0]) => h.xmoney.listTransactions(query),
      refund: async (): Promise<void> => { throw new TypedDomainError("XMONEY_CREDENTIALS_REFUSED", "XMONEY_CREDENTIALS_REFUSED:401"); }
    };
    const desk = new RefundDesk({ repository: h.repository, jobs: h.jobs, xmoney: refused, policy: testBillingPolicy, audit: h.audit, clock: h.clock.read, xmoneyEnvironment: "stage" });
    await h.repository.withTransaction((client) => desk.request(client, {
      chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros: 24_200_000, whole: false,
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL"
    }, h.clock.now));
    // The job itself, claimed at its 9th attempt (P2-M6: only its claim holder may record the stage and make the call).
    const ref = `${paid.chargeId}:${paid.transaction.transactionId}`;
    await h.database.pool.query("UPDATE billing.outbox SET attempts = 8 WHERE kind = 'XMONEY_REFUND' AND ref = $1", [ref]);
    const claimed = await claimOnly("XMONEY_REFUND", ref, "test", h.clock.now);
    expect(claimed.attempts).toBe(9);
    const outcome = await desk.handle(claimed, h.clock.now);
    await unclaim(claimed.jobId);
    expect(outcome).toEqual({ kind: "RETRY", code: "XMONEY_CREDENTIALS_REFUSED", retryAt: new Date(h.clock.now.getTime() + 12 * 3_600_000) });
    expect(h.auditLines).toContainEqual({ event: "billing.xmoney.credentials_refused", operation: "refund" });
    expect(await h.eventKinds(paid.chargeId)).not.toContain("REFUNDED");
  });

  it("moves no money for a forged XMONEY_REFUND row the charge records no request for, and tells the owner (P2-I5)", async () => {
    const paid = await h.activate();
    const ref = `${paid.chargeId}:${paid.transaction.transactionId}`;
    // What a process holding the runtime role could insert: the whole payment back as a quiet card-check release.
    await h.repository.withTransaction((client) => h.repository.enqueue(client, {
      kind: "XMONEY_REFUND", ref, notBefore: h.clock.now,
      payload: {
        charge_id: paid.chargeId, transaction_id: paid.transaction.transactionId, amount_micros: 24_200_000, whole: true,
        owner_ref: paid.ownerRef, reason: "CARD_CHECK_RELEASE"
      }
    }));
    await h.worker.drain(10);
    expect(h.xmoney.refunds.filter((refund) => refund.transactionId === paid.transaction.transactionId)).toEqual([]);
    expect(await h.eventKinds(paid.chargeId)).not.toContain("REFUNDED");
    expect((await h.outboxRows(ref)).find((row) => row.kind === "XMONEY_REFUND"))
      .toMatchObject({ dead: true, lastErrorCode: "REFUND_NOT_REQUESTED" });
    // Its own O2 (P2-I5): the "no refund to make" sentences, under a ref no real refund's O2 for this payment uses.
    expect((await h.outboxRows(`O2:${ref}:not-requested`)).find((row) => row.kind === "EMAIL" && row.ref === `O2:${ref}:not-requested`)?.payload)
      .toMatchObject({ template: "O2", recipient: "OWNER", "param.reasonCode": "REFUND_NOT_REQUESTED", "param.notRequested": "true" });
    expect((await h.outboxRows(`O2:${ref}`)).filter((row) => row.ref === `O2:${ref}`)).toEqual([]);
  });

  it("releases a refused new card's hold and keeps the plan, its card and its order (P12e's path through VERIFY_PAYMENT)", async () => {
    const paid = await h.activate();
    const before = foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId));
    // A card-change order (A12): its own charge, 1.00 USD, no quote.
    const holdCharge = newChargeId();
    await h.repository.withTransaction(async (client) => {
      await h.repository.insertCharge(client, {
        chargeId: holdCharge, ownerRef: paid.ownerRef, subscriptionId: paid.subscriptionId, kind: "CARD_CHECK", attempt: 1,
        periodStart: h.clock.now, periodEnd: new Date(h.clock.now.getTime() + 1_000), quoteId: null, netMicros: 1_000_000,
        taxMicros: 0, totalMicros: 1_000_000, currency: "USD", createdAt: h.clock.now, paymentProvider: "xmoney", paymentEnvironment: "stage"
      });
      await h.repository.appendChargeEvent(client, chargeEvent(holdCharge, "REQUESTED", h.clock.now, {
        providerPaymentId: null, amountMicros: 1_000_000, errorCode: null
      }));
    });
    // A stand-in for P12e's CARD_CHECK settlement, on a verifier of this test's own.
    const verifier = new VerifyPaymentHandler({
      repository: h.repository, jobs: h.jobs, xmoney: h.xmoney, refunds: h.refunds, entitlements: h.entitlements,
      countryPolicy: testCountryPolicy, policy: testBillingPolicy, recordsKey: h.recordsKey, audit: h.audit, xmoneyEnvironment: "stage"
    });
    verifier.registerSettlement("CARD_CHECK", {
      succeeded: async (context) => context.cardCountry === "RU" ? { kind: "REFUND", reason: "CARD_CHECK_REFUSED" } : APPLIED,
      failed: async () => undefined
    });
    // The card-change order is the subscription's own xMoney customer's (P2-I1).
    const hold = h.xmoney.pay({ externalOrderId: holdCharge, amountDecimal: "1.00", cardCountry: "RU", customerId: paid.transaction.customerId });
    await verifier.handle({ jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: hold.transactionId, payload: {}, attempts: 1,
      notBefore: h.clock.now, createdAt: h.clock.now, claimedBy: "test", claimedAt: h.clock.now } as unknown as Parameters<typeof verifier.handle>[0], h.clock.now);
    await h.worker.drain(10);
    expect(h.xmoney.refunds.at(-1)).toEqual({ transactionId: hold.transactionId, amountDecimal: null, reason: "fraud-confirm" });
    expect(await status(holdCharge, paid.ownerRef)).toEqual({ state: "FAILED", reasonCode: "CARD_CHECK_REFUSED" });
    const after = foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId));
    expect(after).toMatchObject({ status: "ACTIVE", planId: before.planId, cardRef: before.cardRef, xmoneyOrderId: before.xmoneyOrderId });
    expect(await h.entitlementRows(paid.ownerRef)).toHaveLength(1);
  });

  it("sends a partial refund again only after a failure that proved nothing was sent", async () => {
    const paid = await h.activate();
    const before = h.xmoney.refunds.length;
    h.xmoney.refundNotSent = 1;
    await h.repository.withTransaction((client) => h.refunds.requestAll(client, {
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL", at: h.clock.now,
      allocations: [{ chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros: 12_100_000 }]
    }));
    await h.worker.drain(10);
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(h.xmoney.refunds.length - before).toBe(1);
    expect(await h.eventKinds(paid.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
  });

  it("records a call's stage on an open job only", async () => {
    const ref = `M10:stage-${randomUUID()}`;
    const jobId = await h.repository.withTransaction((client) => h.repository.enqueue(client, {
      kind: "EMAIL", ref, notBefore: h.clock.now, payload: {}
    }));
    const held = await claimOnly("EMAIL", ref, "stage-worker", h.clock.now);
    expect(await h.jobs.jobStage(jobId)).toBeNull();
    expect(await h.jobs.markJobStage(held, "REFUND_CALL_STARTED")).toBe(true);
    expect(await h.jobs.jobStage(jobId)).toBe("REFUND_CALL_STARTED");
    await h.repository.complete(jobId, h.clock.now);
    expect(await h.jobs.markJobStage(held, "SOMETHING_ELSE")).toBe(false);
    expect(await h.jobs.jobStage(jobId)).toBe("REFUND_CALL_STARTED");
  });

  it("refuses a stale claim's stage write, and its holder stops before any refund call (P2-M6)", async () => {
    const paid = await h.activate();
    const before = h.xmoney.refunds.length;
    const ref = `${paid.chargeId}:${paid.transaction.transactionId}`;
    await h.repository.withTransaction((client) => h.refunds.requestAll(client, {
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL", at: h.clock.now,
      allocations: [{ chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros: 12_100_000 }]
    }));
    // Process A claims the job; its 5-minute lease runs out while it is slow, and process B claims it again.
    const stale = await claimOnly("XMONEY_REFUND", ref, "process-a", h.clock.now);
    const current = await claimOnly("XMONEY_REFUND", ref, "process-b", new Date(h.clock.now.getTime() + 301_000));
    expect(current.attempts).toBe(stale.attempts + 1);
    // Only the current holder moves the stage; A's write changes nothing.
    expect(await h.jobs.markJobStage(stale, "REFUND_CALL_STARTED")).toBe(false);
    expect(await h.jobs.jobStage(stale.jobId)).toBeNull();
    // A's handler, still running, reaches the call: it stops before it, and nothing is recorded.
    const outcome = await h.refunds.handle(stale, h.clock.now);
    expect(outcome).toMatchObject({ kind: "RETRY", code: "BILLING_OUTBOX_CLAIM_LOST" });
    expect(h.xmoney.refunds.length - before).toBe(0);
    expect(await h.jobs.jobStage(stale.jobId)).toBeNull();
    expect(await h.eventKinds(paid.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED"));
    // B, the current holder, still moves it.
    expect(await h.jobs.markJobStage(current, "REFUND_CALL_STARTED")).toBe(true);
    expect(await h.jobs.jobStage(current.jobId)).toBe("REFUND_CALL_STARTED");
    expect(await h.repository.complete(current.jobId, h.clock.now, { workerId: "process-b", attempts: current.attempts })).toBe(true);
  });

  it("calls a full-amount refund again after a failure that moved nothing, and refunds exactly once", async () => {
    const paid = await h.activate();
    const before = h.xmoney.refunds.length;
    h.xmoney.refundFailures = 1;
    await h.repository.withTransaction((client) => h.refunds.requestAll(client, {
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL", at: h.clock.now,
      allocations: [{ chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros: 24_200_000 }]
    }));
    await h.worker.drain(10);
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(h.xmoney.refunds.length - before).toBe(1);
    expect(await h.eventKinds(paid.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
  });

  it("sends a not-sent partial refund once xMoney is back, although the look before it failed in between (the stage stands)", async () => {
    const paid = await h.activate();
    const before = h.xmoney.refunds.length;
    const ref = `${paid.chargeId}:${paid.transaction.transactionId}`;
    h.xmoney.refundNotSent = 1;
    h.xmoney.failNextLookup(paid.transaction.transactionId);
    await h.repository.withTransaction((client) => h.refunds.requestAll(client, {
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL", at: h.clock.now,
      allocations: [{ chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros: 12_100_000 }]
    }));
    // Attempt 1: the call is refused before any byte is sent (P3b's XMONEY_UNAVAILABLE).
    await h.worker.drain(10);
    // Attempt 2: still down, so the look before any second call fails too. The call's not-sent stage stays the code.
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect((await h.outboxRows(ref)).find((row) => row.kind === "XMONEY_REFUND"))
      .toMatchObject({ done: false, dead: false, lastErrorCode: "XMONEY_UNAVAILABLE" });
    // Attempt 3: xMoney is back; the payment reads complete-ok with no refund row, and the refund is sent, once.
    h.clock.advance(301_000);
    await h.worker.drain(10);
    expect(h.xmoney.refunds.length - before).toBe(1);
    expect(await h.eventKinds(paid.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    expect((await h.outboxRows(`O2:${ref}`)).filter((row) => row.kind === "EMAIL")).toEqual([]);
  });

  it("still never resends a partial refund after a call that may have run, whatever its lookups did (A4c)", async () => {
    const paid = await h.activate();
    const before = h.xmoney.refunds.length;
    const ref = `${paid.chargeId}:${paid.transaction.transactionId}`;
    // Attempt 1's call times out: nothing proves it sent nothing.
    h.xmoney.refundFailures = 1;
    await h.repository.withTransaction((client) => h.refunds.requestAll(client, {
      ownerRef: paid.ownerRef, reason: "WITHDRAWAL", at: h.clock.now,
      allocations: [{ chargeId: paid.chargeId, transactionId: paid.transaction.transactionId, amountMicros: 12_100_000 }]
    }));
    await h.worker.drain(10);
    // Model the process that made the call dying during it: the stage it wrote before calling is all that is left.
    // (Written as that process wrote it while it held the claim; the job has been released for its retry since.)
    await h.database.pool.query(
      "UPDATE billing.outbox SET last_error_code = 'REFUND_CALL_STARTED' WHERE kind = 'XMONEY_REFUND' AND ref = $1", [ref]
    );
    // Attempt 2: the look fails. Attempt 3: the payment reads complete-ok and xMoney lists no refund for it.
    h.xmoney.failNextLookup(paid.transaction.transactionId);
    h.clock.advance(61_000);
    await h.worker.drain(10);
    h.clock.advance(301_000);
    await h.worker.drain(10);
    expect(h.xmoney.refunds.length - before).toBe(0);
    expect((await h.outboxRows(ref)).find((row) => row.kind === "XMONEY_REFUND"))
      .toMatchObject({ dead: true, lastErrorCode: "REFUND_OUTCOME_UNKNOWN" });
    expect(await h.eventKinds(paid.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED"));
  });

  it("refunds an unmatched 24.20 rebill on a card-changed order (a 1.00 CARD_CHECK) whose renewal closed with no transaction", async () => {
    const paid = await h.activate();
    // A12: the card change's 1.00 USD auth order is now the subscription's order; its hold was taken.
    const holdCharge = newChargeId();
    await h.repository.withTransaction(async (client) => {
      await h.repository.insertCharge(client, {
        chargeId: holdCharge, ownerRef: paid.ownerRef, subscriptionId: paid.subscriptionId, kind: "CARD_CHECK", attempt: 1,
        periodStart: h.clock.now, periodEnd: new Date(h.clock.now.getTime() + 1_000), quoteId: null, netMicros: 1_000_000,
        taxMicros: 0, totalMicros: 1_000_000, currency: "USD", createdAt: h.clock.now, paymentProvider: "xmoney", paymentEnvironment: "stage"
      });
      await h.repository.appendChargeEvent(client, chargeEvent(holdCharge, "REQUESTED", h.clock.now, {
        providerPaymentId: null, amountMicros: 1_000_000, errorCode: null
      }));
    });
    const hold = h.xmoney.pay({ externalOrderId: holdCharge, amountDecimal: "1.00", cardCountry: "RO", customerId: paid.transaction.customerId });
    const state = foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId));
    await h.repository.withTransaction(async (client) => {
      await h.repository.appendChargeEvent(client, chargeEvent(holdCharge, "SUCCEEDED", h.clock.now, {
        providerPaymentId: hold.transactionId, amountMicros: 1_000_000, errorCode: null, providerCreatedAt: hold.createdAt
      }));
      await h.repository.appendSubscriptionEvent(client, subscriptionEvent(state, "CARD_CHANGED", h.clock.now,
        { charge_id: holdCharge, retry_now: false }, { xmoneyOrderId: hold.orderId, cardRef: hold.cardId }));
    });
    // The renewal's rebill was sent and its answer lost; adoption never found it, and P11a closed the charge.
    const renewal = await renewalCharge(paid, 24_200_000);
    await appendEvent(renewal, "SUBMIT_UNKNOWN", { providerPaymentId: null, amountMicros: 24_200_000, errorCode: "REBILL_OUTCOME_UNKNOWN" });
    const rebilled = await h.xmoney.rebill({ orderId: hold.orderId, customerId: hold.customerId, amountDecimal: "24.20" });
    await appendEvent(renewal, "FAILED", { providerPaymentId: null, amountMicros: 24_200_000, errorCode: "NO_TRANSACTION" });
    const linesBefore = h.auditLines.length;
    await h.notices.receive(h.noticeFor(await h.xmoney.getTransaction(rebilled.transactionId)));
    await h.worker.drain(10);
    // Six not-final retries (1m … 24h) find no SUBMITTED for it; the seventh attempt settles it.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      h.clock.advance(25 * 3_600_000);
      await h.worker.drain(10);
    }
    const check = (await h.repository.charge(holdCharge))!;
    expect(check.events.find((event) => event.kind === "DUPLICATE_PAYMENT"))
      .toMatchObject({ providerPaymentId: rebilled.transactionId, amountMicros: 24_200_000 });
    expect(check.events.find((event) => event.kind === "REFUND_REQUESTED"))
      .toMatchObject({ providerPaymentId: rebilled.transactionId, amountMicros: 24_200_000, errorCode: "DUPLICATE_PAYMENT" });
    expect(h.xmoney.refunds.at(-1)).toEqual({ transactionId: rebilled.transactionId, amountDecimal: null, reason: "customer-demand" });
    expect((await h.outboxRows(holdCharge)).map((row) => row.ref)).toContain(`M11_DUPLICATE:${holdCharge}:${rebilled.transactionId}`);
    const outcomes = await h.database.pool.query(
      "SELECT o.outcome FROM billing.xmoney_notice_outcome o JOIN billing.xmoney_notice n USING (notice_id) WHERE n.transaction_id=$1",
      [rebilled.transactionId]
    );
    expect(outcomes.rows).toEqual([{ outcome: "DUPLICATE" }]);
    const lines = h.auditLines.slice(linesBefore);
    expect(lines.map((line) => line.event)).not.toContain("billing.payment.mismatch");
    expect(lines).toContainEqual({ event: "billing.payment.duplicate", chargeKind: "CARD_CHECK" });
  });

  it("refunds an unmatched rebill of a repriced renewal on the RENEWAL charge its resubmission already paid (A2)", async () => {
    const paid = await h.activate();
    // The tax moved since checkout: the renewal charges 23.80, not the order's 24.20.
    const renewal = await renewalCharge(paid, 23_800_000);
    await appendEvent(renewal, "SUBMIT_UNKNOWN", { providerPaymentId: null, amountMicros: 23_800_000, errorCode: "REBILL_OUTCOME_UNKNOWN" });
    const rebill = { orderId: paid.transaction.orderId, customerId: paid.transaction.customerId, amountDecimal: "23.80" };
    const lost = await h.xmoney.rebill(rebill);
    // Adoption missed the lost one; A2's one resubmission went through and paid the renewal.
    const resubmitted = await h.xmoney.rebill(rebill);
    await appendEvent(renewal, "SUBMITTED", { providerPaymentId: resubmitted.transactionId, amountMicros: 23_800_000, errorCode: null });
    await appendEvent(renewal, "SUCCEEDED", {
      providerPaymentId: resubmitted.transactionId, amountMicros: 23_800_000, errorCode: null,
      providerCreatedAt: (await h.xmoney.getTransaction(resubmitted.transactionId)).createdAt
    });
    const linesBefore = h.auditLines.length;
    // The lost rebill's check at the end of its not-final schedule.
    expect(await h.verify.handle(claimedCheck(lost.transactionId, 7), h.clock.now)).toEqual({ kind: "DONE" });
    await h.worker.drain(10);
    expect(await h.eventKinds(renewal))
      .toEqual(kindsOf("REQUESTED", "SUBMIT_UNKNOWN", "SUBMITTED", "SUCCEEDED", "DUPLICATE_PAYMENT", "REFUND_REQUESTED", "REFUNDED"));
    expect((await h.repository.charge(renewal))!.events.find((event) => event.kind === "DUPLICATE_PAYMENT"))
      .toMatchObject({ providerPaymentId: lost.transactionId, amountMicros: 23_800_000 });
    expect(await h.eventKinds(paid.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED"));
    expect(h.xmoney.refunds.at(-1)).toEqual({ transactionId: lost.transactionId, amountDecimal: null, reason: "customer-demand" });
    const lines = h.auditLines.slice(linesBefore);
    expect(lines.map((line) => line.event)).not.toContain("billing.payment.mismatch");
    expect(lines).toContainEqual({ event: "billing.payment.duplicate", chargeKind: "RENEWAL" });
  });

  it("links an unmatched rebill to the renewal still open for it and settles it there, refunding nothing", async () => {
    const paid = await h.activate();
    const renewal = await renewalCharge(paid, 23_800_000);
    await appendEvent(renewal, "SUBMIT_UNKNOWN", { providerPaymentId: null, amountMicros: 23_800_000, errorCode: "REBILL_OUTCOME_UNKNOWN" });
    const lost = await h.xmoney.rebill({ orderId: paid.transaction.orderId, customerId: paid.transaction.customerId, amountDecimal: "23.80" });
    // A verifier of this test's own, with a stand-in RENEWAL settlement (P11a registers the real one later).
    const verifier = new VerifyPaymentHandler({
      repository: h.repository, jobs: h.jobs, xmoney: h.xmoney, refunds: h.refunds, entitlements: h.entitlements,
      countryPolicy: testCountryPolicy, policy: testBillingPolicy, recordsKey: h.recordsKey, audit: h.audit, xmoneyEnvironment: "stage"
    });
    const settledOn: string[] = [];
    verifier.registerSettlement("RENEWAL", {
      succeeded: async (context) => { settledOn.push(context.charge.chargeId); return APPLIED; },
      failed: async () => undefined
    });
    const refundsBefore = h.xmoney.refunds.length;
    expect(await verifier.handle(claimedCheck(lost.transactionId, 7), h.clock.now)).toEqual({ kind: "DONE" });
    expect(settledOn).toEqual([renewal]);
    expect(await h.eventKinds(renewal)).toEqual(kindsOf("REQUESTED", "SUBMIT_UNKNOWN", "SUBMITTED", "SUCCEEDED"));
    expect((await h.repository.charge(renewal))!.events.find((event) => event.kind === "SUBMITTED"))
      .toMatchObject({ providerPaymentId: lost.transactionId });
    expect(await h.eventKinds(paid.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED"));
    expect(h.xmoney.refunds.length).toBe(refundsBefore);
  });

  it("settles a late completion of an attempt the checkout dropped as stale: a re-activation, or a refund once the new plan is live", async () => {
    // Nothing else is live: the late payment re-activates the abandoned checkout and supersedes the newer one.
    const ownerRef = randomUUID();
    const first = await h.buy({ ownerRef });
    const attempt = h.xmoney.pay({ externalOrderId: first.chargeId, amountDecimal: first.totalDecimal, cardCountry: "RO", status: "3d-pending" });
    h.clock.advance(31 * 60_000);
    const newer = await h.buy({ ownerRef });
    expect(newer.chargeId).not.toBe(first.chargeId);
    h.xmoney.setStatus(attempt.transactionId, "complete-ok");
    await h.settle(attempt.transactionId);
    expect((await h.repository.subscriptionEvents(first.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ACTIVATED", data: { reactivated: true } });
    expect((await h.repository.subscriptionEvents(newer.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED", reason: "SUPERSEDED" } });

    // The newer plan went live first: the old attempt's late payment is refunded ALREADY_SUBSCRIBED.
    const other = randomUUID();
    const stale = await h.buy({ ownerRef: other });
    const late = h.xmoney.pay({ externalOrderId: stale.chargeId, amountDecimal: stale.totalDecimal, cardCountry: "RO", status: "3d-pending" });
    h.clock.advance(31 * 60_000);
    const live = await h.activate({ ownerRef: other });
    h.xmoney.setStatus(late.transactionId, "complete-ok");
    await h.settle(late.transactionId);
    expect(await h.eventKinds(stale.chargeId)).toEqual(kindsOf("REQUESTED", "SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"));
    expect((await h.repository.charge(stale.chargeId))!.events.find((event) => event.kind === "REFUND_REQUESTED"))
      .toMatchObject({ errorCode: "ALREADY_SUBSCRIBED" });
    expect((await h.repository.subscriptionForOwner(other))?.subscriptionId).toBe(live.subscriptionId);
  });

  it("never starves its pool: eleven payments verified at once on a two-connection pool all settle", async () => {
    const bought: Array<Awaited<ReturnType<BillingHarness["buy"]>>> = [];
    for (let index = 0; index < 11; index += 1) bought.push(await h.buy());
    const payments = bought.map((purchase) => h.xmoney.pay({
      externalOrderId: purchase.chargeId, amountDecimal: purchase.totalDecimal, cardCountry: "RO"
    }));
    // Two connections: a read on the pool inside the owner lock would wait for ever for a second one.
    const narrow = createPool(h.database.connectionString, { max: 2 });
    try {
      const repository = new BillingRepository(narrow);
      const jobs = new BillingJobQueries(narrow);
      const entitlements = new EntitlementRepository(narrow);
      const verifier = new VerifyPaymentHandler({
        repository, jobs, xmoney: h.xmoney, entitlements, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
        recordsKey: h.recordsKey, audit: h.audit, xmoneyEnvironment: "stage",
        refunds: new RefundDesk({
          repository, jobs, xmoney: h.xmoney, policy: testBillingPolicy, audit: h.audit, clock: h.clock.read, xmoneyEnvironment: "stage"
        })
      });
      verifier.registerSettlement("INITIAL", createInitialSettlement({
        repository, entitlements, acceptances: new AcceptanceRepository(narrow), policy: testBillingPolicy,
        publicAppUrl: TEST_PUBLIC_APP_URL
      }));
      const outcomes = await within(Promise.all(payments.map((payment) =>
        verifier.handle(claimedCheck(payment.transactionId, 1), h.clock.now))), 5_000);
      expect(outcomes).toEqual(payments.map(() => ({ kind: "DONE" })));
      for (const purchase of bought) expect(await subscriptionKinds(purchase.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
    } finally {
      await endPoolWithin(narrow);
    }
  }, 20_000);
});
