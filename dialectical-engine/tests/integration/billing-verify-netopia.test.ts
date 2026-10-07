import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  computeWindows, foldSubscription, paymentError, type CardPayments, type PaymentReport, type PaymentState
} from "@debateai/billing-core";
import {
  AcceptanceRepository, BillingJobQueries, BillingRepository, EntitlementRepository, migrate, type OutboxJob
} from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { createSecretToken } from "@debateai/payments-netopia";
import type { XMoneyClient } from "@debateai/payments-xmoney";
import { planById } from "@debateai/register";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { testBillingPlans, testBillingPolicy, testCountryPolicy } from "../support/billingFixtures.js";
import {
  recordingAudit, seedNetopiaSubscription, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY
} from "../support/billingSubscriptionFixtures.js";
import { sealBillingProfile, sealCardToken, sealIpEvidence, sealQuoteLocation } from "../../apps/api/src/billing/records.js";
import { RefundDesk } from "../../apps/api/src/billing/refunds.js";
import { chargeEvent, newChargeId, subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { createInitialSettlement } from "../../apps/api/src/billing/settlement-initial.js";
import { createRenewalSettlement } from "../../apps/api/src/billing/settlement-renewal.js";
import { VerifyPaymentHandler } from "../../apps/api/src/billing/verify-payment.js";

let database: TestDatabase;
let repository: BillingRepository;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  repository = new BillingRepository(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const MINUTE = 60_000;
const DAY = 86_400_000;
const STATUS: Readonly<Record<PaymentState, string>> = Object.freeze({
  PENDING: "1", AUTHORIZED: "2", PAID: "3", VOIDED: "4", REFUNDED: "8", CHARGEBACK_OPENED: "9", CHARGEBACK_LOST: "10",
  FAILED: "11", DECLINED: "12", ACTION_REQUIRED: "15", CHARGEBACK_REPRESENTED: "16", UNCLEAR: "17", EXPIRED: "23"
});

function report(orderId: string, state: PaymentState, extra: Partial<PaymentReport> = {}): PaymentReport {
  return Object.freeze({
    orderId, providerPaymentId: `ntp-${orderId.slice(0, 12)}`, state, providerStatus: STATUS[state],
    amountMicros: 23_800_000, currency: "USD", cardCountry: "DE", savedCard: null, declineCode: null, declineSide: null,
    bankDeclined: false, occurredAt: null, clientId: null, ...extra
  });
}

class ScriptedStatus implements Pick<CardPayments, "status"> {
  readonly reads: Array<Readonly<{ orderId: string; providerPaymentId: string | null }>> = [];
  private readonly queued = new Map<string, Array<PaymentReport | "NO_SUCH_ORDER" | Error>>();
  script(orderId: string, ...answers: Array<PaymentReport | "NO_SUCH_ORDER" | Error>): void {
    this.queued.set(orderId, [...(this.queued.get(orderId) ?? []), ...answers]);
  }
  async status(input: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER"> {
    this.reads.push(input);
    const next = this.queued.get(input.orderId)?.shift() ?? "NO_SUCH_ORDER";
    if (next instanceof Error) throw next;
    return next;
  }
}

const unused = async (): Promise<never> => { throw new TypedDomainError("XMONEY_UNAVAILABLE", "no xMoney in this suite"); };
const NO_XMONEY = Object.freeze({ getTransaction: unused, getOrder: unused, getCard: unused, refund: unused, listTransactions: unused }) as
  unknown as Pick<XMoneyClient, "getTransaction" | "getOrder" | "getCard" | "refund" | "listTransactions">;

function handlerFor(status: ScriptedStatus, now: { at: Date }, paymentEnvironment: "sandbox" | "live" = "sandbox") {
  const jobs = new BillingJobQueries(database.pool);
  const entitlements = new EntitlementRepository(database.pool);
  const audit = recordingAudit();
  const refunds = new RefundDesk({
    repository, jobs, xmoney: NO_XMONEY, policy: testBillingPolicy, audit, clock: () => now.at, xmoneyEnvironment: "stage"
  });
  const verify = new VerifyPaymentHandler({
    repository, jobs, xmoney: NO_XMONEY, refunds, entitlements, countryPolicy: testCountryPolicy, policy: testBillingPolicy,
    recordsKey: TEST_RECORDS_KEY, audit, xmoneyEnvironment: "stage",
    netopia: { payments: status, paymentEnvironment, jobs }
  });
  verify.registerSettlement("INITIAL", createInitialSettlement({
    repository, entitlements, acceptances: new AcceptanceRepository(database.pool), policy: testBillingPolicy,
    publicAppUrl: TEST_PUBLIC_APP_URL
  }));
  verify.registerSettlement("RENEWAL", createRenewalSettlement({ repository, entitlements, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL }));
  return { verify, audit };
}

const job = (chargeId: string, attempts: number, now: Date) => ({
  jobId: randomUUID(), kind: "VERIFY_PAYMENT", ref: chargeId, payload: { charge_id: chargeId }, attempts, notBefore: now,
  createdAt: now, claimedBy: "test", claimedAt: now
}) as unknown as OutboxJob;

/** A NETOPIA checkout as N18 will write it: CREATED subscription, its quote, and an INITIAL charge REQUESTED. */
async function checkout(_label: string) {
  const ownerRef = randomUUID() /* billing owner_ref is a uuid (0085) */;
  const subscriptionId = randomUUID();
  const quoteId = randomUUID();
  const chargeId = newChargeId();
  const netMicros = planById(testBillingPlans, "PLUS").netPriceMicros;
  const taxMicros = 3_800_000;
  const totalMicros = netMicros + taxMicros;
  const at = new Date(Date.now() - 5 * MINUTE);
  const periodEnd = computeWindows(at, at).month.end;
  const location = sealQuoteLocation(TEST_RECORDS_KEY, quoteId, {
    name: "Ana Pop", firstName: "Ana", lastName: "Pop", phone: "+4915112345678", country: "DE", region: null,
    postalCode: "10115", city: "Berlin", street: "Unter den Linden 1", ip: "192.0.2.10", ipCountry: "DE", company: null
  });
  const customerId = await repository.withTransaction(async (client) => {
    const customer = await repository.ensureCustomer(client, { ownerRef, locale: "en", now: at, environment: "stage" });
    const profile = sealBillingProfile(TEST_RECORDS_KEY, customer.customerId, {
      email: `${ownerRef}@example.test`, locale: "en", name: "Ana Pop", firstName: "Ana", lastName: "Pop",
      phone: "+4915112345678", paymentIp: "192.0.2.10", country: "DE", region: null, postalCode: "10115", city: "Berlin",
      street: "Unter den Linden 1", company: null
    });
    await repository.appendProfile(client, { customerId: customer.customerId, at, locale: "en", profileCiphertext: profile.ciphertext, keyId: profile.keyId });
    await repository.insertQuote(client, {
      quoteId, ownerRef, planId: "PLUS", kind: "SUBSCRIBE", netMicros, taxMicros, totalMicros, taxCountry: "DE",
      taxRegion: null, taxRateBasisPoints: 1_900, taxStatus: "TAXABLE", taxName: "VAT", quadernoRef: null, createdAt: at,
      expiresAt: new Date(at.getTime() + 30 * MINUTE), locationCiphertext: location.ciphertext, keyId: location.keyId,
      recurringTotalMicros: null
    });
    await repository.insertCharge(client, {
      chargeId, ownerRef, subscriptionId, kind: "INITIAL", attempt: 1, periodStart: at, periodEnd, quoteId, netMicros,
      taxMicros, totalMicros, currency: "USD", createdAt: at, paymentProvider: "netopia", paymentEnvironment: "sandbox"
    });
    await repository.useQuote(client, { quoteId, usedAt: at, chargeId });
    await repository.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", at, { providerPaymentId: null, amountMicros: totalMicros, errorCode: null }));
    await repository.appendSubscriptionEvent(client, {
      eventId: randomUUID(), subscriptionId, ownerRef, kind: "CREATED", at, planId: "PLUS", periodAnchorAt: null,
      xmoneyOrderId: null, xmoneyCustomerId: null, cardRef: null, cardTokenId: null,
      data: { country_confirmed: false, ip_country: "DE", quote_id: quoteId, payment_provider: "netopia", payment_environment: "sandbox" }
    });
    return customer.customerId;
  });
  return { ownerRef, subscriptionId, quoteId, chargeId, customerId, totalMicros };
}

async function storeToken(chargeId: string, customerId: string, paidAt: Date): Promise<string> {
  const tokenId = randomUUID();
  const sealed = sealCardToken(TEST_RECORDS_KEY, tokenId, createSecretToken(["tok", "n10", randomUUID().slice(0, 8)].join("-")));
  const stored = await repository.withTransaction((client) => repository.insertCardToken(client, {
    tokenId, customerId, paymentProvider: "netopia", paymentEnvironment: "sandbox", sourceChargeId: chargeId,
    sourceToolOrder: null, sourceNoticeId: null, sourcePaidAt: paidAt, tokenCiphertext: sealed.ciphertext,
    keyId: sealed.keyId, expMonth: 12, expYear: 2031, last4: "4242", cardCountry: "DE", createdAt: paidAt
  }));
  return stored.tokenId;
}

/** A verified NETOPIA message for `chargeId`, as N9 stores it (the sealed allow-list is a stand-in ciphertext). */
async function storeNotice(chargeId: string, status: number, amountText: string): Promise<string> {
  const sealed = sealIpEvidence(TEST_RECORDS_KEY, chargeId, null);
  const stored = await repository.withTransaction((client) => repository.insertPaymentNotice(client, {
    noticeId: randomUUID(), paymentProvider: "netopia", paymentEnvironment: "sandbox", receivedAt: new Date(), bodySha256: randomBytes(32).toString("hex"),
    orderId: chargeId, providerPaymentId: `ntp-${chargeId.slice(0, 12)}`, providerStatus: status, amountText, currency: "USD",
    cardCountry: "DE", keyFingerprint: "e".repeat(64), jwtIat: null, allowedCiphertext: sealed.ciphertext, keyId: sealed.keyId
  }));
  return stored.noticeId;
}

const kinds = async (chargeId: string) => (await repository.charge(chargeId))!.events.map((event) => event.kind);
const state = async (subscriptionId: string) => foldSubscription(await repository.subscriptionEvents(subscriptionId));
const outbox = async (ref: string) => (await database.pool.query<{ kind: string; payload: Record<string, unknown> }>(
  "SELECT kind, payload FROM billing.outbox WHERE ref = $1 OR ref LIKE $2 ORDER BY created_at", [ref, `%${ref}%`]
)).rows;
const owners = async (reasonCode: string, reference: string) => (await database.pool.query<{ payload: Record<string, unknown> }>(
  "SELECT payload FROM billing.outbox WHERE kind = 'EMAIL' AND payload->>'template' = 'O3'"
)).rows.filter((row) => JSON.stringify(row.payload).includes(reasonCode) && JSON.stringify(row.payload).includes(reference));
const noticeOutcomes = async (noticeId: string) => (await database.pool.query<{ outcome: string }>(
  "SELECT outcome FROM billing.payment_notice_outcome WHERE notice_id = $1 ORDER BY at", [noticeId]
)).rows.map((row) => row.outcome);
const statusReads = async (chargeId: string) => (await database.pool.query<{ outcome: string }>(
  "SELECT outcome FROM billing.status_read WHERE charge_id = $1 ORDER BY at", [chargeId]
)).rows.map((row) => row.outcome);

describe("N10 VERIFY_PAYMENT on NETOPIA: a checkout", () => {
  it("activates once from NETOPIA's status, with the saved card adopted at the decision (Review Focus 1)", async () => {
    const bought = await checkout("paid");
    const tokenId = await storeToken(bought.chargeId, bought.customerId, new Date(Date.now() - MINUTE));
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    const { verify } = handlerFor(status, now);
    // The message arrived before NETOPIA's status says PAID: the check waits, nothing is recorded.
    status.script(bought.chargeId, report(bought.chargeId, "PENDING"));
    const waiting = await verify.handle(job(bought.chargeId, 1, now.at), now.at);
    expect(waiting).toMatchObject({ kind: "RETRY", code: "PAYMENT_NOT_FINAL" });
    expect(await kinds(bought.chargeId)).toEqual(["REQUESTED"]);
    const occurredAt = new Date(Date.now() - 2 * MINUTE);
    status.script(bought.chargeId, report(bought.chargeId, "PAID", { occurredAt }), report(bought.chargeId, "PAID", { occurredAt }));
    expect(await verify.handle(job(bought.chargeId, 2, now.at), now.at)).toEqual({ kind: "DONE" });
    expect(await verify.handle(job(bought.chargeId, 1, now.at), now.at)).toEqual({ kind: "DONE" });
    expect(await kinds(bought.chargeId)).toEqual(["REQUESTED", "SUCCEEDED"]);
    const succeeded = (await repository.charge(bought.chargeId))!.events.find((event) => event.kind === "SUCCEEDED")!;
    expect(succeeded.providerPaymentId).toBe(`ntp-${bought.chargeId.slice(0, 12)}`);
    const after = await state(bought.subscriptionId);
    expect(after).toMatchObject({ status: "ACTIVE", cardTokenId: tokenId, paymentProvider: "netopia", paymentEnvironment: "sandbox" });
    expect(after.periodAnchorAt?.getTime()).toBe(occurredAt.getTime());
    expect((await repository.subscriptionEvents(bought.subscriptionId)).filter((event) => event.kind === "ACTIVATED")).toHaveLength(1);
    const queued = (await outbox(bought.chargeId)).map((row) => row.kind);
    expect(queued).toContain("QUADERNO_RECORD_SALE");
    expect(await statusReads(bought.chargeId)).toEqual(["PENDING", "PAID", "PAID"]);
    expect(status.reads[0]).toEqual({ orderId: bought.chargeId, providerPaymentId: null });
  });

  it("starts the plan without a card, then adopts a token that landed later with CARD_SAVED, once", async () => {
    const bought = await checkout("late-card");
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    const { verify, audit } = handlerFor(status, now);
    status.script(bought.chargeId, report(bought.chargeId, "PAID"));
    await verify.handle(job(bought.chargeId, 1, now.at), now.at);
    expect((await state(bought.subscriptionId)).cardTokenId).toBeNull();
    const tokenId = await storeToken(bought.chargeId, bought.customerId, new Date());
    status.script(bought.chargeId, report(bought.chargeId, "PAID"), report(bought.chargeId, "PAID"));
    expect(await verify.handle(job(bought.chargeId, 1, now.at), now.at)).toEqual({ kind: "DONE" });
    expect(await verify.handle(job(bought.chargeId, 1, now.at), now.at)).toEqual({ kind: "DONE" });
    const events = await repository.subscriptionEvents(bought.subscriptionId);
    expect(events.filter((event) => event.kind === "CARD_SAVED").map((event) => event.cardTokenId)).toEqual([tokenId]);
    expect((await state(bought.subscriptionId)).cardTokenId).toBe(tokenId);
    expect(audit.events.filter((entry) => entry.event === "billing.card.saved")).toHaveLength(1);
    expect(await kinds(bought.chargeId)).toEqual(["REQUESTED", "SUCCEEDED"]);
  });

  it("keeps the checkout open after a decline, and activates when the person pays on the same page", async () => {
    const bought = await checkout("declined");
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    const { verify } = handlerFor(status, now);
    status.script(bought.chargeId, report(bought.chargeId, "DECLINED", { declineCode: "20", declineSide: "CARD", bankDeclined: true }));
    await verify.handle(job(bought.chargeId, 1, now.at), now.at);
    const failed = (await repository.charge(bought.chargeId))!.events.find((event) => event.kind === "FAILED")!;
    expect(failed.errorCode).toBe("PAYMENT_DECLINED");
    expect((await state(bought.subscriptionId)).status).toBe("CREATED");
    status.script(bought.chargeId, report(bought.chargeId, "PAID"));
    await verify.handle(job(bought.chargeId, 1, now.at), now.at);
    expect(await kinds(bought.chargeId)).toEqual(["REQUESTED", "FAILED", "SUCCEEDED"]);
    expect((await state(bought.subscriptionId)).status).toBe("ACTIVE");
  });

  it("refuses a payment whose amount, currency or client id our charge does not hold, and tells the owner", async () => {
    const cases: Array<[Partial<PaymentReport>, string]> = [
      [{ amountMicros: 23_810_000 }, "PAYMENT_AMOUNT_MISMATCH"],
      [{ amountMicros: null }, "PAYMENT_AMOUNT_MISMATCH"],
      [{ currency: "RON" }, "PAYMENT_AMOUNT_MISMATCH"],
      [{ clientId: "f".repeat(32) }, "PAYMENT_CUSTOMER_MISMATCH"]
    ];
    for (const [extra, code] of cases) {
      const bought = await checkout(`mismatch-${code}`);
      const status = new ScriptedStatus();
      const now = { at: new Date() };
      const { verify, audit } = handlerFor(status, now);
      status.script(bought.chargeId, report(bought.chargeId, "PAID", extra));
      expect(await verify.handle(job(bought.chargeId, 1, now.at), now.at)).toEqual({ kind: "DEAD", code });
      expect(await kinds(bought.chargeId)).toEqual(["REQUESTED"]);
      expect(audit.events).toContainEqual({ event: "billing.payment.mismatch", fields: { code } });
      expect(await owners(code, bought.chargeId)).toHaveLength(1);
    }
    const bought = await checkout("client-id");
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    status.script(bought.chargeId, report(bought.chargeId, "PAID", { clientId: bought.customerId.replaceAll("-", "") }));
    expect(await handlerFor(status, now).verify.handle(job(bought.chargeId, 1, now.at), now.at)).toEqual({ kind: "DONE" });
  });

  it("makes one plan of two paid orders of one checkout, and asks for the second's money back (Review Focus 2)", async () => {
    const bought = await checkout("two-orders");
    const second = newChargeId();
    await repository.withTransaction(async (client) => {
      // A second order of the same checkout (a second tab): same quote, its own charge id (attempt 2 keeps 0086's
      // (subscription, kind, period, attempt) key apart).
      const first = (await repository.charge(bought.chargeId, client))!;
      await repository.insertCharge(client, {
        chargeId: second, ownerRef: first.ownerRef, subscriptionId: first.subscriptionId, kind: "INITIAL", attempt: 2,
        periodStart: first.periodStart, periodEnd: first.periodEnd, quoteId: first.quoteId, netMicros: first.netMicros,
        taxMicros: first.taxMicros, totalMicros: first.totalMicros, currency: "USD", createdAt: new Date(),
        paymentProvider: "netopia", paymentEnvironment: "sandbox"
      });
      await repository.appendChargeEvent(client, chargeEvent(second, "REQUESTED", new Date(), { providerPaymentId: null, amountMicros: bought.totalMicros, errorCode: null }));
    });
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    const { verify } = handlerFor(status, now);
    status.script(bought.chargeId, report(bought.chargeId, "PAID"));
    status.script(second, report(second, "PAID"));
    await verify.handle(job(bought.chargeId, 1, now.at), now.at);
    await verify.handle(job(second, 1, now.at), now.at);
    expect((await repository.subscriptionEvents(bought.subscriptionId)).filter((event) => event.kind === "ACTIVATED")).toHaveLength(1);
    const refund = (await repository.charge(second))!.events.find((event) => event.kind === "REFUND_REQUESTED")!;
    expect(refund).toMatchObject({ errorCode: "SUBSCRIPTION_ENDED", amountMicros: bought.totalMicros, providerPaymentId: `ntp-${second.slice(0, 12)}` });
  });

  it("decides from the signed notice when the status read stays unavailable past the schedule", async () => {
    const bought = await checkout("by-notice");
    const noticeId = await storeNotice(bought.chargeId, 3, "23.80");
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    const { verify, audit } = handlerFor(status, now);
    status.script(bought.chargeId, paymentError("PAYMENT_PROVIDER_UNAVAILABLE"), paymentError("PAYMENT_CREDENTIALS_REFUSED"));
    expect(await verify.handle(job(bought.chargeId, 1, now.at), now.at)).toMatchObject({ kind: "RETRY", code: "PAYMENT_STATUS_UNREADABLE" });
    expect(await verify.handle(job(bought.chargeId, 7, now.at), now.at)).toEqual({ kind: "DONE" });
    expect(await kinds(bought.chargeId)).toEqual(["REQUESTED", "SUCCEEDED"]);
    expect(await noticeOutcomes(noticeId)).toContain("DECIDED_BY_NOTICE");
    expect(await statusReads(bought.chargeId)).toEqual(["PAYMENT_PROVIDER_UNAVAILABLE", "PAYMENT_CREDENTIALS_REFUSED"]);
    expect(audit.events).toContainEqual({ event: "billing.payment.credentials_refused", fields: { operation: "verify" } });
    expect(status.reads[0]).toEqual({ orderId: bought.chargeId, providerPaymentId: `ntp-${bought.chargeId.slice(0, 12)}` });
  });

  it("records nothing for a status NETOPIA has not explained, and hands it to the owner (ruling C-7)", async () => {
    const bought = await checkout("unclear");
    const noticeId = await storeNotice(bought.chargeId, 17, "23.80");
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    const { verify, audit } = handlerFor(status, now);
    status.script(bought.chargeId, report(bought.chargeId, "UNCLEAR", { providerStatus: "17" }));
    expect(await verify.handle(job(bought.chargeId, 1, now.at), now.at)).toEqual({ kind: "DONE" });
    expect(await kinds(bought.chargeId)).toEqual(["REQUESTED"]);
    expect((await state(bought.subscriptionId)).status).toBe("CREATED");
    expect(await noticeOutcomes(noticeId)).toContain("OWNER_REVIEW");
    expect(audit.events).toContainEqual({ event: "billing.payment.status_unexpected", fields: { status: "17" } });
    expect(await owners("OWNER_REVIEW", bought.chargeId)).toHaveLength(1);
  });

  it("closes a voided unpaid order as FAILED(VOIDED), and an expired one as FAILED(PAYMENT_EXPIRED)", async () => {
    for (const [state, code] of [["VOIDED", "VOIDED"], ["EXPIRED", "PAYMENT_EXPIRED"], ["FAILED", "PAYMENT_FAILED"]] as const) {
      const bought = await checkout(`closed-${code}`);
      const status = new ScriptedStatus();
      const now = { at: new Date() };
      status.script(bought.chargeId, report(bought.chargeId, state));
      await handlerFor(status, now).verify.handle(job(bought.chargeId, 1, now.at), now.at);
      expect((await repository.charge(bought.chargeId))!.events.find((event) => event.kind === "FAILED")?.errorCode).toBe(code);
    }
  });

  it("ends a job of another NETOPIA environment before any read, and waits for a charge it cannot find", async () => {
    const bought = await checkout("other-system");
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    const { verify, audit } = handlerFor(status, now, "live");
    expect(await verify.handle(job(bought.chargeId, 1, now.at), now.at)).toEqual({ kind: "DEAD", code: "OTHER_PAYMENT_SYSTEM" });
    expect(status.reads).toHaveLength(0);
    expect(audit.events).toContainEqual({ event: "billing.outbox.other_system", fields: { kind: "VERIFY_PAYMENT", code: "OTHER_PAYMENT_SYSTEM" } });
    const missing = await handlerFor(new ScriptedStatus(), now).verify.handle(job(newChargeId(), 1, now.at), now.at);
    expect(missing).toMatchObject({ kind: "RETRY", code: "CHARGE_NOT_FOUND" });
  });
});

describe("N10 (ruling PR-21): the owner's tax summary counts NETOPIA sales of its own system", () => {
  it("lists a NETOPIA sale in the summary of its environment and not in the other's", async () => {
    const bought = await checkout("tax-summary");
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    status.script(bought.chargeId, report(bought.chargeId, "PAID"));
    expect(await handlerFor(status, now).verify.handle(job(bought.chargeId, 1, now.at), now.at)).toEqual({ kind: "DONE" });
    const ever = [new Date(0), new Date(Date.UTC(9999, 0, 1))] as const;
    const sales = async (system: Parameters<BillingRepository["quarterSummaryRows"]>[2]) =>
      (await repository.quarterSummaryRows(ever[0], ever[1], system)).filter((row) => row.chargeId === bought.chargeId);
    expect(await sales({ provider: "netopia", environment: "sandbox" })).toMatchObject([
      { type: "SALE", amountMicros: bought.totalMicros, taxCountry: "DE" }
    ]);
    expect(await sales({ provider: "netopia", environment: "live" })).toEqual([]);
    expect(await sales({ provider: "xmoney", environment: "live" })).toEqual([]);
  });
});

describe("N10 VERIFY_PAYMENT on NETOPIA: a renewal", () => {
  async function renewal(_label: string) {
    const seeded = await seedNetopiaSubscription(database.pool, {
      ownerRef: randomUUID() /* billing owner_ref is a uuid (0085) */, planId: "PLUS", activatedAt: new Date(Date.now() - 31 * DAY), taxCountry: "DE"
    });
    const before = await state(seeded.subscriptionId);
    const chargeId = newChargeId();
    const at = new Date();
    await repository.withTransaction(async (client) => {
      await repository.insertCharge(client, {
        chargeId, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "RENEWAL", attempt: 1,
        periodStart: before.currentPeriodEnd!, periodEnd: computeWindows(before.periodAnchorAt!, before.currentPeriodEnd!).month.end,
        quoteId: seeded.initialQuoteId, netMicros: 20_000_000, taxMicros: seeded.totalMicros - 20_000_000,
        totalMicros: seeded.totalMicros, currency: "USD", createdAt: at, paymentProvider: "netopia", paymentEnvironment: "sandbox"
      });
      await repository.appendChargeEvent(client, chargeEvent(chargeId, "REQUESTED", at, { providerPaymentId: null, amountMicros: seeded.totalMicros, errorCode: null }));
      await repository.appendChargeEvent(client, chargeEvent(chargeId, "SUBMITTED", at, { providerPaymentId: `ntp-${chargeId.slice(0, 12)}`, amountMicros: seeded.totalMicros, errorCode: null }));
    });
    return { seeded, chargeId, before };
  }

  it("renews with the new token NETOPIA issued for this payment, reading by the SUBMITTED ntpID", async () => {
    const { seeded, chargeId } = await renewal("renewed");
    const tokenId = await storeToken(chargeId, seeded.customerId, new Date());
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    status.script(chargeId, report(chargeId, "PAID", { amountMicros: seeded.totalMicros }));
    expect(await handlerFor(status, now).verify.handle(job(chargeId, 1, now.at), now.at)).toEqual({ kind: "DONE" });
    expect(status.reads[0]).toEqual({ orderId: chargeId, providerPaymentId: `ntp-${chargeId.slice(0, 12)}` });
    const renewed = (await repository.subscriptionEvents(seeded.subscriptionId)).find((event) => event.kind === "RENEWED")!;
    expect(renewed.cardTokenId).toBe(tokenId);
    expect((await state(seeded.subscriptionId)).cardTokenId).toBe(tokenId);
  });

  it("fails a renewal NETOPIA's bank wanted confirmed (nobody is present) and one the bank declined, and dunning starts", async () => {
    for (const [answer, code] of [
      [{ state: "ACTION_REQUIRED" as const }, "AUTHENTICATION_REQUIRED"],
      [{ state: "DECLINED" as const, declineCode: "20", declineSide: "CARD" as const, bankDeclined: true }, "PAYMENT_DECLINED"]
    ] as const) {
      const { seeded, chargeId } = await renewal(`failed-${code}`);
      const status = new ScriptedStatus();
      const now = { at: new Date() };
      status.script(chargeId, report(chargeId, answer.state, { ...answer, amountMicros: seeded.totalMicros }));
      await handlerFor(status, now).verify.handle(job(chargeId, 1, now.at), now.at);
      expect((await repository.charge(chargeId))!.events.find((event) => event.kind === "FAILED")?.errorCode).toBe(code);
      expect((await state(seeded.subscriptionId)).status).toBe("PAST_DUE");
    }
  });

  it("leaves a renewal whose read stays unavailable to the pending-renewal deadline instead of letting the job die", async () => {
    const { chargeId } = await renewal("unreadable");
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    status.script(chargeId, paymentError("PAYMENT_PROVIDER_UNAVAILABLE"));
    expect(await handlerFor(status, now).verify.handle(job(chargeId, 7, now.at), now.at)).toEqual({ kind: "DONE" });
    expect(await kinds(chargeId)).toEqual(["REQUESTED", "SUBMITTED"]);
  });

  it("adopts a recovered retry's token with CARD_SAVED right after RECOVERED", async () => {
    const { seeded, chargeId, before } = await renewal("recovered");
    // The subscription is past due (a failed attempt 1 without a charge), and this charge is the paid retry.
    await repository.withTransaction((client) => repository.appendSubscriptionEvent(client, subscriptionEvent(before, "PAST_DUE", new Date(), {
      reason: "TAX_SERVICE_UNAVAILABLE", attempt: 1, next_retry_at: new Date(Date.now() + DAY).toISOString(),
      first_failed_at: new Date().toISOString()
    })));
    const tokenId = await storeToken(chargeId, seeded.customerId, new Date());
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    status.script(chargeId, report(chargeId, "PAID", { amountMicros: seeded.totalMicros }));
    await handlerFor(status, now).verify.handle(job(chargeId, 1, now.at), now.at);
    const kindsAfter = (await repository.subscriptionEvents(seeded.subscriptionId)).map((event) => event.kind);
    expect(kindsAfter.slice(-2)).toEqual(["RECOVERED", "CARD_SAVED"]);
    expect((await state(seeded.subscriptionId))).toMatchObject({ status: "ACTIVE", cardTokenId: tokenId });
  });

  it("settles as RECOVERED an earlier attempt closed FAILED(NO_TRANSACTION) that NETOPIA later reports PAID (spec §2.9.3 step 5)", async () => {
    const { seeded, chargeId, before } = await renewal("failed-then-paid");
    // Attempt 1 was closed NO_TRANSACTION at its window's end, and the dunning started from it.
    const failedAt = new Date();
    await repository.withTransaction(async (client) => {
      await repository.appendChargeEvent(client, chargeEvent(chargeId, "FAILED", failedAt, {
        providerPaymentId: null, amountMicros: seeded.totalMicros, errorCode: "NO_TRANSACTION"
      }));
      await repository.appendSubscriptionEvent(client, subscriptionEvent(before, "PAST_DUE", failedAt, {
        charge_id: chargeId, attempt: 1, next_retry_at: new Date(failedAt.getTime() + DAY).toISOString(),
        first_failed_at: failedAt.toISOString()
      }));
    });
    expect((await state(seeded.subscriptionId)).status).toBe("PAST_DUE");
    // The retry's probe of the earlier attempt finds it PAID: its SUBMITTED is a replay (DUPLICATE), so the probe's
    // transaction, and the VERIFY_PAYMENT it queues, stand.
    const replayed = await repository.withTransaction((client) => repository.appendChargeEvent(client, chargeEvent(chargeId, "SUBMITTED", new Date(), {
      providerPaymentId: `ntp-${chargeId.slice(0, 12)}`, amountMicros: seeded.totalMicros, errorCode: null
    })));
    expect(replayed).toBe("DUPLICATE");
    const status = new ScriptedStatus();
    const now = { at: new Date() };
    status.script(chargeId, report(chargeId, "PAID", { amountMicros: seeded.totalMicros }));
    expect(await handlerFor(status, now).verify.handle(job(chargeId, 1, now.at), now.at)).toEqual({ kind: "DONE" });
    expect(await kinds(chargeId)).toEqual(["REQUESTED", "SUBMITTED", "FAILED", "SUCCEEDED"]);
    expect((await repository.subscriptionEvents(seeded.subscriptionId)).at(-1)?.kind).toBe("RECOVERED");
    expect((await state(seeded.subscriptionId)).status).toBe("ACTIVE");
  });
});
