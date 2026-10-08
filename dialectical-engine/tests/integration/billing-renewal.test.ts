import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { addBusinessDays, computeWindows, decimalToMicros, foldSubscription } from "@debateai/billing-core";
import { createPool } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { BillingPlans } from "@debateai/register";
import { subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { testBillingPlans } from "../support/billingFixtures.js";
import { kindsOf, startBillingHarness, type BillingHarness } from "../support/billingHarness.js";

let h: BillingHarness;
beforeAll(async () => { h = await startBillingHarness(); });
afterAll(async () => { await h?.stop(); });
beforeEach(() => { h.tax.rateOverride.clear(); });

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;
const renewalCharges = async (subscriptionId: string) =>
  (await h.repository.chargesForSubscription(subscriptionId)).filter((charge) => charge.kind === "RENEWAL");
/** Q-1: the M5 emails queued for a charge (none may go out while an outage is waited out). */
const m5Refs = async (chargeId: string) => (await h.outboxRows(chargeId)).map((row) => row.ref).filter((ref) => ref.startsWith("M5"));
/**
 * W10 (P2-I21): one param of the queued EMAIL job `jobRef`. M5's `bankDeclined` is "true" only for PAYMENT_DECLINED:
 * no other failed attempt asked a bank, so its email never says one refused.
 */
const emailParam = async (jobRef: string, name: string) =>
  (await h.outboxRows(jobRef)).find((row) => row.kind === "EMAIL" && row.ref === jobRef)?.payload[`param.${name}`];
const subscriptionKinds = async (subscriptionId: string) =>
  (await h.repository.subscriptionEvents(subscriptionId)).map((event) => event.kind);
/** Saved-card charge calls for this subscription: earlier tests' subscriptions may fall due on the same clock. */
const rebills = (paid: Readonly<{ subscriptionId: string }>) => h.payments.chargesFor(paid.subscriptionId);
/** Saved-card charges NETOPIA actually made for this subscription (a charge that never reached NETOPIA makes none). */
const madeRebills = (paid: Readonly<{ subscriptionId: string }>) => h.payments.madeFor(paid.subscriptionId);
const unknownCodes = async (chargeId: string) => ((await h.repository.charge(chargeId))?.events ?? [])
  .filter((event) => event.kind === "SUBMIT_UNKNOWN").map((event) => event.errorCode);
/** The call markers and not-sent outcomes: every REQUESTED row's code, the first (null) being the request itself. */
const requestedCodes = async (chargeId: string) => ((await h.repository.charge(chargeId))?.events ?? [])
  .filter((event) => event.kind === "REQUESTED").map((event) => event.errorCode);
/** A billingPlans version published later with Plus at 25.00 (Terms §12's case). */
const plusAt25: BillingPlans = Object.freeze({
  ...testBillingPlans, sourceRef: "test:billing-plans:plus-25",
  plans: testBillingPlans.plans.map((plan) => (plan.planId === "PLUS" ? { ...plan, netPriceMicros: 25_000_000 } : plan))
});
const append = async (subscriptionId: string, kind: Parameters<typeof subscriptionEvent>[1], data: Record<string, string>) => {
  const state = foldSubscription(await h.repository.subscriptionEvents(subscriptionId));
  await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client, subscriptionEvent(state, kind, h.clock.now, data)));
};

async function dueNow() {
  const paid = await h.activate();
  const end = await h.periodEndOf(paid.subscriptionId);
  h.clock.now = new Date(end.getTime() + MINUTE);
  return { paid, end };
}

describe("P11a monthly renewal", () => {
  it("charges the saved card at the period end and renews once VERIFY_PAYMENT confirms", async () => {
    const { paid, end } = await dueNow();
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(1);
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect(charge).toMatchObject({ attempt: 1, periodStart: end, periodEnd: computeWindows(paid.payment.occurredAt!, end).month.end, totalMicros: 24_200_000 });
    expect(await h.eventKinds(charge!.chargeId)).toEqual(kindsOf("REQUESTED", "SUBMITTED"));
    await h.worker.drain(10);
    expect((await subscriptionKinds(paid.subscriptionId)).at(-1)).toBe("RENEWED");
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "PLUS", cause: "RENEWED", paidThrough: charge!.periodEnd });
    expect((await h.outboxRows(charge!.chargeId)).map((row) => row.kind)).toContain("SMARTBILL_INVOICE");
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(1);
  });

  it("sends M3 and postpones 7 business days when the total changed, then charges the new total", async () => {
    const { paid, end } = await dueNow();
    h.tax.rateOverride.set("RO", 1_900);
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(0);
    const until = addBusinessDays(h.clock.now, 7);
    // W12 (the controller's ruling on P2-I16, A7): M3 is queued, but nothing counts as a notice until it went out.
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({
      kind: "RENEWAL_POSTPONED", data: { until: until.toISOString(), reason: "NOTICE_PERIOD" }
    });
    expect(await subscriptionKinds(paid.subscriptionId)).not.toContain("RENEWAL_NOTICE_SENT");
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref)).toContain(`M3:${paid.subscriptionId}:${end.toISOString()}:23800000`);
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ cause: "RENEWAL_POSTPONED", paidThrough: until });
    await h.mail.drain();
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({
      kind: "RENEWAL_NOTICE_SENT", data: { announced_total_micros: 23_800_000, sent_at: h.clock.now.toISOString() }
    });
    h.clock.advance(MINUTE);
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(0);
    h.clock.now = new Date(until.getTime() + MINUTE);
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(1);
    expect((await renewalCharges(paid.subscriptionId))[0]).toMatchObject({ periodStart: end, totalMicros: 23_800_000 });
  });

  it("never charges a changed total on a notice that never went out: it sends M3 again and waits again (W12, A7)", async () => {
    const { paid, end } = await dueNow();
    h.tax.rateOverride.set("RO", 1_900);
    await h.renewal.runOnce();
    const noticeRef = `M3:${paid.subscriptionId}:${end.toISOString()}:23800000`;
    // The notice's email dies (an unreadable profile, a relay that never answered): its job is dead-lettered.
    await h.database.pool.query(
      "UPDATE billing.outbox SET dead_at = $2, last_error_code = 'BILLING_PROFILE_UNREADABLE' WHERE kind = 'EMAIL' AND ref = $1 AND dead_at IS NULL",
      [noticeRef, h.clock.now]
    );
    const firstUntil = addBusinessDays(h.clock.now, 7);
    h.clock.now = new Date(firstUntil.getTime() + MINUTE);
    await h.renewal.runOnce();
    // No charge on the unsent notice: a new M3 under the same ref, and a new 7-business-day wait from now.
    expect(rebills(paid)).toBe(0);
    expect(await subscriptionKinds(paid.subscriptionId)).not.toContain("RENEWAL_NOTICE_SENT");
    expect((await h.outboxRows(noticeRef)).filter((row) => row.ref === noticeRef).map((row) => `dead=${row.dead} done=${row.done}`).sort())
      .toEqual(["dead=false done=false", "dead=true done=false"]);
    const secondUntil = addBusinessDays(h.clock.now, 7);
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({
      kind: "RENEWAL_POSTPONED", data: { until: secondUntil.toISOString() }
    });
    // This one goes out, so the changed total is charged once its own wait is over.
    await h.mail.drain();
    expect(h.mail.sent.filter((mail) => mail.templateId === "M3" && mail.params.totalAmount === "23.80").length).toBeGreaterThan(0);
    h.clock.now = new Date(secondUntil.getTime() + MINUTE);
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(1);
    expect((await renewalCharges(paid.subscriptionId))[0]).toMatchObject({ periodStart: end, totalMicros: 23_800_000 });
  });

  it("never charges twice when two API processes run the timer against one database", async () => {
    const { paid } = await dueNow();
    const second = createPool(h.database.connectionString);
    try {
      const other = h.renewalFor(second);
      for (let round = 0; round < 3; round += 1) await Promise.all([h.renewal.runOnce(), other.runOnce()]);
      expect(rebills(paid)).toBe(1);
      expect(await renewalCharges(paid.subscriptionId)).toHaveLength(1);
    } finally {
      await second.end();
    }
  });

  it("never charges an owner whose account erasure is pending (R-34)", async () => {
    const { paid } = await dueNow();
    h.erasures.add(paid.ownerRef);
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(0);
    expect(await renewalCharges(paid.subscriptionId)).toHaveLength(0);
    expect(h.auditLines.some((line) => line.event === "billing.renewal.owner_stopped")).toBe(true);
    h.erasures.delete(paid.ownerRef);
  });

  it("never charges an owner the age gate froze (0077's age_frozen: P15's port answers true for one, R3-2)", async () => {
    const { paid } = await dueNow();
    h.frozen.add(paid.ownerRef);
    const stopped = () => h.auditLines.filter((line) => line.event === "billing.renewal.owner_stopped").length;
    const before = stopped();
    expect(await h.renewal.renew(paid.subscriptionId)).toBe("skipped");
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(0);
    expect(madeRebills(paid)).toBe(0);
    expect(await renewalCharges(paid.subscriptionId)).toHaveLength(0);
    // The line names the stop, never its cause: a frozen account is no erasure, and the line carries no field.
    expect(stopped()).toBeGreaterThan(before);
    expect(h.auditLines.filter((line) => line.event === "billing.renewal.owner_stopped").every((line) => Object.keys(line).length === 1)).toBe(true);
    h.frozen.delete(paid.ownerRef);
  });

  it("keeps the plan through a NETOPIA outage for 72 hours past the period end, then starts the normal dunning (Q-1)", async () => {
    const { paid, end } = await dueNow();
    const pendingUntil = new Date(end.getTime() + 72 * HOUR);
    h.payments.failNextCharge(paid.subscriptionId, "UNAVAILABLE");
    await h.renewal.runOnce();
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "PLUS", cause: "RENEWAL_PENDING", paidThrough: pendingUntil });
    // Still down two days on: retried quietly, never failed, never emailed, and still one RENEWAL_PENDING.
    h.clock.now = new Date(end.getTime() + 48 * HOUR);
    h.payments.failNextCharge(paid.subscriptionId, "UNAVAILABLE");
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(2);
    expect(await h.eventKinds(charge!.chargeId)).not.toContain("FAILED");
    expect(await m5Refs(charge!.chargeId)).toEqual([]);
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "PLUS", cause: "RENEWAL_PENDING" });
    expect((await h.entitlementRows(paid.ownerRef)).filter((row) => row.cause === "RENEWAL_PENDING")).toHaveLength(1);
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).status).toBe("ACTIVE");
    // 72 hours past the period end with no outcome: no further call, FAILED(NO_TRANSACTION), PAST_DUE, its grace, M5A.
    h.clock.now = new Date(pendingUntil.getTime() + MINUTE);
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(2);
    expect((await h.repository.charge(charge!.chargeId))!.events.find((event) => event.kind === "FAILED"))
      .toMatchObject({ errorCode: "NO_TRANSACTION" });
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)).toMatchObject({ kind: "PAST_DUE", data: { attempt: 1 } });
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({
      cause: "PAST_DUE_GRACE", paidThrough: new Date(h.clock.now.getTime() + 8 * DAY)
    });
    expect(await m5Refs(charge!.chargeId)).toEqual([`M5A:${charge!.chargeId}`]);
    // W10 (P2-I21): 72 hours of our own outage reached no bank, so M5A never says a bank refused.
    expect(await emailParam(`M5A:${charge!.chargeId}`, "bankDeclined")).toBe("false");
    expect(h.auditLines).toContainEqual({ event: "billing.renewal.stuck", attempt: 1, code: "CHARGE_NOT_SENT" });
  });

  it("retries a charge that never reached NETOPIA on later ticks, never as a failure, and charges once (Review Focus 5)", async () => {
    const { paid } = await dueNow();
    h.payments.failNextCharge(paid.subscriptionId, "UNAVAILABLE");
    await h.renewal.runOnce();
    const [charge] = await renewalCharges(paid.subscriptionId);
    // D5 5i: nothing reached NETOPIA, so the charge stays REQUESTED and spends no SUBMIT_UNKNOWN.
    expect(await requestedCodes(charge!.chargeId)).toEqual([null, "CHARGE_NOT_SENT"]);
    expect(await unknownCodes(charge!.chargeId)).toEqual([]);
    // Q-1: the plan stays while the renewal is retried quietly.
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ cause: "RENEWAL_PENDING", paidThrough: new Date(charge!.periodStart.getTime() + 72 * HOUR) });
    h.clock.advance(MINUTE + 1_000);
    h.payments.failNextCharge(paid.subscriptionId, "UNAVAILABLE");
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(2);
    expect(await requestedCodes(charge!.chargeId)).toEqual([null, "CHARGE_NOT_SENT", "RESEND_STARTED", "CHARGE_NOT_SENT"]);
    expect(await unknownCodes(charge!.chargeId)).toEqual([]);
    // NETOPIA is back, 35 minutes on: the next eligible tick charges it.
    h.clock.advance(35 * MINUTE);
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(3);
    expect(madeRebills(paid)).toBe(1);
    await h.worker.drain(10);
    const kinds = await subscriptionKinds(paid.subscriptionId);
    expect(kinds.at(-1)).toBe("RENEWED");
    expect(kinds).not.toContain("PAST_DUE");
    expect((await h.eventKinds(charge!.chargeId))).not.toContain("FAILED");
    expect((await h.outboxRows(charge!.chargeId)).map((row) => row.ref)).not.toContain(`M5A:${charge!.chargeId}`);
    // The renewal's own entitlement, dated after the pending one, is the plan in force for the new period.
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ cause: "RENEWED", paidThrough: charge!.periodEnd });
  });

  it("keeps the plan through a 429 and then a refused key: no FAILED, no PAST_DUE, no M5, and the alarm (D5 5i)", async () => {
    const { paid } = await dueNow();
    h.payments.failNextCharge(paid.subscriptionId, "UNAVAILABLE");
    await h.renewal.runOnce();
    h.clock.advance(MINUTE + 1_000);
    h.payments.failNextCharge(paid.subscriptionId, "CREDENTIALS");
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(2);
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect(await requestedCodes(charge!.chargeId))
      .toEqual([null, "CHARGE_NOT_SENT", "RESEND_STARTED", "CHARGE_CREDENTIALS_REFUSED"]);
    expect(await h.eventKinds(charge!.chargeId)).not.toContain("FAILED");
    expect(await h.eventKinds(charge!.chargeId)).not.toContain("SUBMIT_UNKNOWN");
    expect(await subscriptionKinds(paid.subscriptionId)).not.toContain("PAST_DUE");
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).status).toBe("ACTIVE");
    expect((await h.outboxRows(charge!.chargeId)).map((row) => row.ref).filter((ref) => ref.startsWith("M5"))).toEqual([]);
    expect(h.auditLines).toContainEqual(expect.objectContaining({ event: "billing.payment.credentials_refused" }));
    // The key is fixed: the next eligible tick charges it, once.
    h.clock.advance(6 * MINUTE);
    await h.renewal.runOnce();
    expect(rebills(paid)).toBe(3);
    expect(await h.eventKinds(charge!.chargeId)).toContain("SUBMITTED");
  });

  it("renews an existing subscriber at the net they bought, never a price published later (Terms §12)", async () => {
    const { paid, end } = await dueNow();
    // The register's next billingPlans version raises Plus to 25.00; this renewal runs under it.
    await h.renewalWith({ plans: plusAt25 }).renew(paid.subscriptionId);
    const [charge] = await renewalCharges(paid.subscriptionId);
    // 20.00 plus the fresh 21 % tax: the announced 24.20, so no notice and no postponement.
    expect(charge).toMatchObject({ periodStart: end, netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: 24_200_000 });
    expect(await subscriptionKinds(paid.subscriptionId)).not.toContain("RENEWAL_NOTICE_SENT");
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref).filter((ref) => ref.startsWith("M3:"))).toEqual([]);
    expect(rebills(paid)).toBe(1);
    // A new checkout under the same version pays the new price.
    const quoted = await h.quotesWith(plusAt25).create({
      ownerRef: randomUUID(), ip: "198.51.100.7", planId: "PLUS", country: "RO", name: "Test Buyer", firstName: null,
      lastName: null, phone: null, street: null, region: "Bucuresti", postalCode: null, city: "Sector 1", company: null,
      now: h.clock.now
    });
    expect(quoted.quote).toMatchObject({ netMicros: 25_000_000, taxMicros: 5_250_000, totalMicros: 30_250_000 });
  });

  it("never charges a history with no recorded price: one line, and the next tick tries again", async () => {
    const paid = await h.activate();
    const ownerRef = randomUUID();
    const [created, activated] = [...(await h.repository.subscriptionEvents(paid.subscriptionId))];
    // The same history written without recurring_net_micros (a writer's bug), for another owner.
    const subscriptionId = randomUUID();
    await h.repository.withTransaction(async (client) => {
      for (const event of [created!, activated!]) {
        const { recurring_net_micros: _dropped, ...data } = event.data;
        await h.repository.appendSubscriptionEvent(client, { ...event, eventId: randomUUID(), subscriptionId, ownerRef, data });
      }
    });
    await expect(h.renewal.renew(subscriptionId)).rejects.toMatchObject({ code: "BILLING_RECURRING_PRICE_MISSING" });
    expect(h.auditLines).toContainEqual({ event: "billing.renewal.price_missing" });
    expect(await renewalCharges(subscriptionId)).toHaveLength(0);
  });

  it("writes no notice and no postponement when a withdrawal lands while the fresh quote is made (D5 5d)", async () => {
    const { paid } = await dueNow();
    h.tax.rateOverride.set("RO", 1_900);
    h.tax.beforeQuote = async () => { await append(paid.subscriptionId, "WITHDRAWN", {}); };
    expect(await h.renewal.renew(paid.subscriptionId)).toBe("skipped");
    const kinds = await subscriptionKinds(paid.subscriptionId);
    expect(kinds.at(-1)).toBe("WITHDRAWN");
    expect(kinds).not.toContain("RENEWAL_NOTICE_SENT");
    expect(kinds).not.toContain("RENEWAL_POSTPONED");
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref).filter((ref) => ref.startsWith("M3:"))).toEqual([]);
    // The history is still one the fold accepts.
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).status).toBe("WITHDRAWN");
  });

  it("keeps the plan and emails nothing while the tax service is down at renewal, then charges the fresh total", async () => {
    const { paid, end } = await dueNow();
    h.tax.failNext("TAX_SERVICE_UNAVAILABLE");
    // `renew` directly: a whole `runOnce` would hand the one queued failure to whichever due renewal quotes first.
    await expect(h.renewal.renew(paid.subscriptionId)).rejects.toMatchObject({ code: "TAX_SERVICE_UNAVAILABLE" });
    expect(await renewalCharges(paid.subscriptionId)).toHaveLength(0);
    expect(rebills(paid)).toBe(0);
    expect(await subscriptionKinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref).filter((ref) => ref.startsWith("M5"))).toEqual([]);
    // Q-1: the plan stays, paid through 72 hours past the period end, with one line.
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({
      planId: "PLUS", cause: "RENEWAL_PENDING", paidThrough: new Date(end.getTime() + 72 * HOUR)
    });
    expect(h.auditLines).toContainEqual({ event: "billing.renewal.pending", code: "TAX_SERVICE_UNAVAILABLE" });
    h.clock.advance(MINUTE);
    expect(await h.renewal.renew(paid.subscriptionId)).toBe("charged");
    expect(await renewalCharges(paid.subscriptionId)).toEqual([expect.objectContaining({ totalMicros: 24_200_000 })]);
  });

  it("starts the normal dunning with no charge when the tax service is still down 72 hours past the period end (Q-1)", async () => {
    const { paid, end } = await dueNow();
    const pendingUntil = new Date(end.getTime() + 72 * HOUR);
    h.tax.failNext("TAX_SERVICE_UNAVAILABLE");
    await expect(h.renewal.renew(paid.subscriptionId)).rejects.toMatchObject({ code: "TAX_SERVICE_UNAVAILABLE" });
    // 71 hours on, still down: ACTIVE, paid access runs on, and a second failing tick writes no second RENEWAL_PENDING.
    h.clock.now = new Date(end.getTime() + 71 * HOUR);
    h.tax.failNext("TAX_SERVICE_UNAVAILABLE");
    await expect(h.renewal.renew(paid.subscriptionId)).rejects.toMatchObject({ code: "TAX_SERVICE_UNAVAILABLE" });
    expect(foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId)).status).toBe("ACTIVE");
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "PLUS", cause: "RENEWAL_PENDING", lapsed: false });
    expect((await h.entitlementRows(paid.ownerRef)).filter((row) => row.cause === "RENEWAL_PENDING")).toHaveLength(1);
    // 72 hours and a minute, still down: the normal dunning starts, with no charge row and no saved-card charge (Q-1).
    h.clock.now = new Date(pendingUntil.getTime() + MINUTE);
    const failedAt = h.clock.now;
    h.tax.failNext("TAX_SERVICE_UNAVAILABLE");
    expect(await h.renewal.renew(paid.subscriptionId)).toBe("dunning");
    expect(await renewalCharges(paid.subscriptionId)).toHaveLength(0);
    expect(rebills(paid)).toBe(0);
    const pastDue = (await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1)!;
    expect(pastDue).toMatchObject({ kind: "PAST_DUE", data: {
      attempt: 1, reason: "TAX_SERVICE_UNAVAILABLE", first_failed_at: failedAt.toISOString(),
      next_retry_at: new Date(failedAt.getTime() + DAY).toISOString()
    } });
    expect(Object.keys(pastDue.data)).not.toContain("charge_id");
    // Paid access runs on through the 8-day grace, and the person is told (M5A), on day 3, not after days on Free.
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({
      planId: "PLUS", cause: "PAST_DUE_GRACE", paidThrough: new Date(failedAt.getTime() + 8 * DAY)
    });
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "PLUS", lapsed: false });
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref).filter((ref) => ref.startsWith("M5")))
      .toEqual([`M5A:${paid.subscriptionId}:${end.toISOString()}:1`]);
    // W10 (P2-I21): the card was never asked, so M5A never says a bank refused.
    expect(await emailParam(`M5A:${paid.subscriptionId}:${end.toISOString()}:1`, "bankDeclined")).toBe("false");
    expect(h.auditLines).toContainEqual({ event: "billing.renewal.dunning_unpriced", attempt: 1, code: "TAX_SERVICE_UNAVAILABLE" });
    // From here the retries are P11b's, each priced afresh: the renewal leaves a PAST_DUE plan alone.
    expect(await h.renewal.renew(paid.subscriptionId)).toBe("skipped");
    expect((await subscriptionKinds(paid.subscriptionId)).filter((kind) => kind === "PAST_DUE")).toHaveLength(1);
  });

  it("treats a tax refusal at renewal as an operator alarm: no charge, no dunning, and the real code on every line", async () => {
    const { paid, end } = await dueNow();
    // P4's client on a revoked key: TAX_SERVICE_REFUSED with the detail QUADERNO_HTTP_401 (D5's P4 test pins it).
    const refused = h.renewalWith({
      tax: { quote: async (): Promise<never> => { throw new TypedDomainError("TAX_SERVICE_REFUSED", "QUADERNO_HTTP_401"); } }
    });
    const linesBefore = h.auditLines.length;
    await expect(refused.renew(paid.subscriptionId)).rejects.toMatchObject({ code: "TAX_SERVICE_REFUSED" });
    expect(await renewalCharges(paid.subscriptionId)).toHaveLength(0);
    expect(rebills(paid)).toBe(0);
    expect(await subscriptionKinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
    expect((await h.outboxRows(paid.subscriptionId)).map((row) => row.ref).filter((ref) => ref.startsWith("M5"))).toEqual([]);
    const lines = h.auditLines.slice(linesBefore);
    expect(lines).toContainEqual({ event: "billing.renewal.tax_refused", code: "TAX_SERVICE_REFUSED", reason: "QUADERNO_HTTP_401" });
    expect(lines.filter((line) => line.code === "TAX_SERVICE_UNAVAILABLE")).toEqual([]);
    // The default hold, the precedent of a refused payment key, labelled with the real code.
    expect(lines).toContainEqual({ event: "billing.renewal.pending", code: "TAX_SERVICE_REFUSED" });
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({
      cause: "RENEWAL_PENDING", paidThrough: new Date(end.getTime() + 72 * HOUR)
    });
    // A second refusing tick raises no second alarm for this period.
    h.clock.advance(MINUTE);
    await expect(refused.renew(paid.subscriptionId)).rejects.toMatchObject({ code: "TAX_SERVICE_REFUSED" });
    expect(h.auditLines.slice(linesBefore).filter((line) => line.event === "billing.renewal.tax_refused")).toHaveLength(1);
    // Past the 72 hours a refusal still starts no dunning: nothing to retry until the key is fixed.
    h.clock.now = new Date(end.getTime() + 72 * HOUR + MINUTE);
    await expect(refused.renew(paid.subscriptionId)).rejects.toMatchObject({ code: "TAX_SERVICE_REFUSED" });
    expect(await subscriptionKinds(paid.subscriptionId)).toEqual(["CREATED", "ACTIVATED"]);
    expect(await renewalCharges(paid.subscriptionId)).toHaveLength(0);
  });

  it("keeps the plan while a sent renewal waits for its check past the period end, then renews it (Q-1)", async () => {
    const paid = await h.activate();
    const end = await h.periodEndOf(paid.subscriptionId);
    // Charged two minutes before the end (inside the due list's 5-minute horizon); NETOPIA answered the charge.
    h.clock.now = new Date(end.getTime() - 2 * MINUTE);
    await h.renewal.runOnce();
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect(await h.eventKinds(charge!.chargeId)).toEqual(kindsOf("REQUESTED", "SUBMITTED"));
    // VERIFY_PAYMENT cannot read NETOPIA's status: NETOPIA is down. The worker retries it a minute later.
    h.payments.failNextStatus(charge!.chargeId);
    await h.worker.drain(10);
    expect(await h.eventKinds(charge!.chargeId)).toEqual(kindsOf("REQUESTED", "SUBMITTED"));
    // Past the period end the person, already charged, keeps the plan: one RENEWAL_PENDING, 72 hours past the end.
    h.clock.now = new Date(end.getTime() + MINUTE);
    await h.renewal.runOnce();
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({
      planId: "PLUS", cause: "RENEWAL_PENDING", paidThrough: new Date(end.getTime() + 72 * HOUR), lapsed: false
    });
    h.clock.advance(MINUTE);
    await h.renewal.runOnce();
    expect((await h.entitlementRows(paid.ownerRef)).filter((row) => row.cause === "RENEWAL_PENDING")).toHaveLength(1);
    expect(await m5Refs(charge!.chargeId)).toEqual([]);
    expect(await h.eventKinds(charge!.chargeId)).not.toContain("FAILED");
    expect(rebills(paid)).toBe(1);
    // NETOPIA answers again: the check's retry verifies it, and the plan renews for the next period.
    await h.worker.drain(10);
    expect(await h.eventKinds(charge!.chargeId)).toEqual(kindsOf("REQUESTED", "SUBMITTED", "SUCCEEDED"));
    expect((await subscriptionKinds(paid.subscriptionId)).at(-1)).toBe("RENEWED");
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ cause: "RENEWED", paidThrough: charge!.periodEnd });
  });

  it("holds nothing for a renewal verified before its period end", async () => {
    const paid = await h.activate();
    const end = await h.periodEndOf(paid.subscriptionId);
    h.clock.now = new Date(end.getTime() - 2 * MINUTE);
    await h.renewal.runOnce();
    await h.worker.drain(10);
    expect((await subscriptionKinds(paid.subscriptionId)).at(-1)).toBe("RENEWED");
    h.clock.now = new Date(end.getTime() + 2 * MINUTE);
    await h.renewal.runOnce();
    expect((await h.entitlementRows(paid.ownerRef)).map((row) => row.cause)).toEqual(["SUBSCRIBED", "RENEWED"]);
    expect(await h.entitlements.current(paid.ownerRef, h.clock.now)).toMatchObject({ planId: "PLUS", cause: "RENEWED", lapsed: false });
  });

  it("charges nothing when a cancel, a withdrawal or an erasure lands between the renewal's first look and its charge", async () => {
    for (const lands of ["CANCEL_REQUESTED", "WITHDRAWN", "ERASURE_STOPPED", "ERASURE_PENDING"] as const) {
      const { paid } = await dueNow();
      // Lands during the fresh quote: after renew()'s first fold and erasure check, before the charge row.
      h.tax.beforeQuote = async () => {
        if (lands === "ERASURE_PENDING") h.erasures.add(paid.ownerRef);
        else await append(paid.subscriptionId, lands, {});
      };
      expect(await h.renewal.renew(paid.subscriptionId)).toBe("skipped");
      expect(rebills(paid)).toBe(0);
      expect(await renewalCharges(paid.subscriptionId)).toHaveLength(0);
      h.erasures.delete(paid.ownerRef);
    }
  });

  it("still adopts a lost renewal charge on a suspended plan, and hands its refund to the owner", async () => {
    const { paid } = await dueNow();
    h.payments.failNextCharge(paid.subscriptionId, "PAID_ANSWER_LOST");
    await h.renewal.runOnce();
    await append(paid.subscriptionId, "SUSPENDED", { charge_id: paid.chargeId });
    // Past the 30 quiet minutes the probe reads NETOPIA's status: PAID.
    h.clock.advance(61 * MINUTE);
    await h.renewal.runOnce();
    await h.worker.drain(10);
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect(madeRebills(paid)).toBe(1);
    expect(await h.eventKinds(charge!.chargeId)).toEqual(expect.arrayContaining(["SUBMIT_UNKNOWN", "SUCCEEDED", "REFUND_REQUESTED"]));
    expect((await h.repository.charge(charge!.chargeId))!.events.find((event) => event.kind === "REFUND_REQUESTED"))
      .toMatchObject({ errorCode: "SUBSCRIPTION_ENDED" });
    // Spec §2.12.2, the owner mode: the whole payment is handed to the owner.
    expect(await h.ownerRefundsDue(charge!.chargeId)).toEqual([
      expect.objectContaining({ refundAmount: "24.20", refundReason: "SUBSCRIPTION_ENDED" })
    ]);
  });

  it("keeps the plan during a declined renewal: PAST_DUE, paid through 8 days more, and M5A", async () => {
    const { paid } = await dueNow();
    h.payments.failNextCharge(paid.subscriptionId, "DECLINED");
    await h.renewal.runOnce();
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect((await h.repository.charge(charge!.chargeId))!.events.find((event) => event.kind === "FAILED")).toMatchObject({ errorCode: "PAYMENT_DECLINED" });
    const pastDue = (await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1);
    expect(pastDue).toMatchObject({ kind: "PAST_DUE", data: { attempt: 1, next_retry_at: new Date(h.clock.now.getTime() + 86_400_000).toISOString() } });
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({
      planId: "PLUS", cause: "PAST_DUE_GRACE", paidThrough: new Date(h.clock.now.getTime() + 8 * 86_400_000)
    });
    expect((await h.outboxRows(charge!.chargeId)).map((row) => row.ref)).toContain(`M5A:${charge!.chargeId}`);
    // W10 (P2-I21): the bank declined (PAYMENT_DECLINED), so M5A says so after its first sentence.
    expect(await emailParam(`M5A:${charge!.chargeId}`, "bankDeclined")).toBe("true");
  });

  it("holds the plan when NETOPIA refuses the charge for our own setup: no FAILED, no M5, one O3 (ruling C-8)", async () => {
    const { paid } = await dueNow();
    h.payments.failNextCharge(paid.subscriptionId, "CONFIGURATION");
    await h.renewal.runOnce();
    const [charge] = await renewalCharges(paid.subscriptionId);
    expect(await requestedCodes(charge!.chargeId)).toEqual([null, "CHARGE_CONFIGURATION_REFUSED"]);
    expect(await h.eventKinds(charge!.chargeId)).not.toContain("FAILED");
    expect(await subscriptionKinds(paid.subscriptionId)).not.toContain("PAST_DUE");
    expect(await m5Refs(charge!.chargeId)).toEqual([]);
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "PLUS", cause: "RENEWAL_PENDING" });
    // O3 is keyed once per code and hour (payment-alert.ts); its reference names this charge.
    const alerts = await h.database.pool.query(
      `SELECT 1 FROM billing.outbox WHERE kind = 'EMAIL' AND ref LIKE 'O3:%' AND payload->>'param.reasonCode' = $1
         AND payload->>'param.reference' = $2`, ["CHARGE_CONFIGURATION_REFUSED", `charge ${charge!.chargeId}`]
    );
    expect(alerts.rows).toHaveLength(1);
  });

  it("says in M11 that the plan ended when a renewal is refused for the card's country (W10, P2-M9)", async () => {
    const { paid } = await dueNow();
    // The saved card's country moved onto the always-blocked list after activation (P2-M9's narrowing).
    h.payments.cardCountryFor(paid.subscriptionId, "RU");
    await h.renewal.runOnce();
    await h.worker.drain(10);
    const [charge] = await renewalCharges(paid.subscriptionId);
    // Spec §2.12.2, the owner mode: the whole renewal is handed to the owner, who refunds it in NETOPIA's admin; NETOPIA's
    // status then says REFUNDED, and VERIFY_PAYMENT records it (§2.12.4).
    expect(await h.ownerRefundsDue(charge!.chargeId)).toEqual([expect.objectContaining({ refundAmount: "24.20", whole: "true" })]);
    h.payments.setState(charge!.chargeId, "REFUNDED");
    await h.settle(charge!.chargeId);
    expect(await h.eventKinds(charge!.chargeId)).toEqual(expect.arrayContaining(["SUCCEEDED", "REFUND_REQUESTED", "REFUNDED"]));
    expect((await h.repository.subscriptionEvents(paid.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ENDED", data: { cause: "CANCEL", reason: "CARD_COUNTRY_BLOCKED" } });
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "FREE", cause: "ENDED_CANCEL" });
    expect(await emailParam(`M11:${charge!.chargeId}`, "refundAmount")).toBe("24.20");
    expect(await emailParam(`M11:${charge!.chargeId}`, "endedPlan")).toBe("PLUS");
  });

  it("applies a scheduled downgrade at the renewal: DOWNGRADED, then RENEWED at the lower plan (R-34)", async () => {
    const paid = await h.activate({ planId: "PRO" });
    const end = await h.periodEndOf(paid.subscriptionId);
    const state = foldSubscription(await h.repository.subscriptionEvents(paid.subscriptionId));
    // The announced total is Plus's recurring total quoted at the downgrade (A7), so the renewal needs no notice;
    // the recorded net is the one the renewal charges (Terms §12).
    await h.repository.withTransaction((client) => h.repository.appendSubscriptionEvent(client,
      subscriptionEvent(state, "DOWNGRADE_SCHEDULED", h.clock.now, { announced_total_micros: 24_200_000, recurring_net_micros: 20_000_000 }, { planId: "PLUS" })));
    h.clock.now = new Date(end.getTime() + MINUTE);
    await h.renewal.runOnce();
    expect((await renewalCharges(paid.subscriptionId))[0]).toMatchObject({ totalMicros: 24_200_000 });
    await h.worker.drain(10);
    expect((await subscriptionKinds(paid.subscriptionId)).slice(-2)).toEqual(["DOWNGRADED", "RENEWED"]);
    expect((await h.entitlementRows(paid.ownerRef)).at(-1)).toMatchObject({ planId: "PLUS", cause: "DOWNGRADED" });
  });

  it("renews a revived checkout with its own buyer's VAT id, never a later checkout's company (A8c, P2-M30)", async () => {
    h.geo.country = "DE";
    try {
      const ownerRef = randomUUID();
      // The older checkout bought as a person in Germany; the newer one, under other details, as a company with a
      // validated VAT id, and it wrote the latest billing profile. The older one is then paid late and revived.
      const older = await h.buy({ ownerRef, planId: "PLUS", country: "DE" });
      await h.buy({ ownerRef, planId: "PRO", country: "DE", company: { name: "Later GmbH", vatId: "DE123VALID", address: "Teststr. 1, 10115 Berlin" } });
      await h.storeCardToken(older.chargeId, { cardCountry: "DE" });
      h.payments.pay(older.chargeId, { amountMicros: decimalToMicros(older.totalDecimal), cardCountry: "DE" });
      await h.settle(older.chargeId);
      expect((await h.repository.subscriptionEvents(older.subscriptionId)).at(-1))
        .toMatchObject({ kind: "ACTIVATED", data: { reactivated: true } });
      h.clock.now = new Date((await h.periodEndOf(older.subscriptionId)).getTime() + MINUTE);
      await h.renewal.runOnce();
      // Priced as the person it was bought by: German VAT, the same total, so no notice and one saved-card charge.
      expect(rebills(older)).toBe(1);
      const [charge] = await renewalCharges(older.subscriptionId);
      expect(charge).toMatchObject({ totalMicros: 23_800_000 });
      expect(await h.repository.quote(charge!.quoteId!, ownerRef))
        .toMatchObject({ taxStatus: "TAXABLE", taxCountry: "DE", taxRateBasisPoints: 1_900 });
    } finally {
      h.geo.country = "RO";
    }
  });
});
