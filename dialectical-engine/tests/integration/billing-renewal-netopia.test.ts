import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  foldSubscription, paymentError, type CardPayments, type HostedPaymentStart, type HostedPaymentStarted, type PaymentReport,
  type PaymentState, type SavedCardCharge
} from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository, EntitlementRepository, migrate } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { createNetopiaPayments, createSecretToken } from "@debateai/payments-netopia";
import type { XMoneyClient } from "@debateai/payments-xmoney";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { AdjustableTaxEngine, testBillingPlans, testBillingPolicy } from "../support/billingFixtures.js";
import {
  recordingAudit, seedNetopiaSubscription, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY
} from "../support/billingSubscriptionFixtures.js";
import { startFakeNetopia } from "../support/fake-netopia.js";
import { BillingMaintenance } from "../../apps/api/src/billing/maintenance.js";
import { englishOrderText } from "../../apps/api/src/billing/order-text.js";
import { sealBillingProfile, type BillingProfile } from "../../apps/api/src/billing/records.js";
import { RenewalService } from "../../apps/api/src/billing/renewal.js";
import { createRenewalSettlement } from "../../apps/api/src/billing/settlement-renewal.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

const STATUS_NUMBER: Readonly<Record<PaymentState, string>> = Object.freeze({
  PENDING: "1", AUTHORIZED: "2", PAID: "3", VOIDED: "4", REFUNDED: "8", CHARGEBACK_OPENED: "9", CHARGEBACK_LOST: "10",
  FAILED: "11", DECLINED: "12", ACTION_REQUIRED: "15", CHARGEBACK_REPRESENTED: "16", UNCLEAR: "17", EXPIRED: "23"
});

/** A NETOPIA report for `orderId` (spec §2.3); the ntpID is derived from the order, so a probe and a resend agree. */
function report(orderId: string, state: PaymentState, extra: Partial<PaymentReport> = {}): PaymentReport {
  return Object.freeze({
    orderId, providerPaymentId: `ntp-${orderId.slice(0, 16)}`, state, providerStatus: STATUS_NUMBER[state],
    amountMicros: 24_200_000, currency: "USD", cardCountry: "RO", savedCard: null, declineCode: null, declineSide: null,
    bankDeclined: false, occurredAt: null, clientId: null, ...extra
  });
}

/** A saved card from an answer: the token is made from pieces (spec §2.2 rule 2) and wrapped at once. */
const answeredCard = () => Object.freeze({
  token: createSecretToken(["tok", "renewal", randomUUID().slice(0, 8)].join("-")), expMonth: 12, expYear: 2031, last4: "4242"
});

type ChargeAnswer = (input: SavedCardCharge) => PaymentReport | Error | Promise<PaymentReport | Error>;

/**
 * The port, scripted. A charge answer is keyed by the payer's email (each subscription's account address is its own,
 * `${customerId}@example.test`), because the maintenance pass also retries the other tests' plans through the same port;
 * an unscripted charge reads PENDING, an unscripted status NO_SUCH_ORDER.
 */
class ScriptedPayments implements CardPayments {
  readonly provider = "netopia" as const;
  readonly environment = "sandbox" as const;
  readonly charges: SavedCardCharge[] = [];
  readonly reads: Array<Readonly<{ orderId: string; providerPaymentId: string | null }>> = [];
  private readonly answers: Array<Readonly<{ email: string; answer: ChargeAnswer }>> = [];
  private readonly statuses = new Map<string, Array<PaymentReport | "NO_SUCH_ORDER" | Error>>();

  answer(email: string, answer: ChargeAnswer): void {
    this.answers.push(Object.freeze({ email, answer }));
  }

  scriptStatus(orderId: string, ...outcomes: Array<PaymentReport | "NO_SUCH_ORDER" | Error>): void {
    this.statuses.set(orderId, [...(this.statuses.get(orderId) ?? []), ...outcomes]);
  }
  async startHostedPayment(_input: HostedPaymentStart): Promise<HostedPaymentStarted> {
    throw paymentError("PAYMENT_CONFIGURATION_REFUSED", "not-in-this-suite");
  }
  async chargeSavedCard(input: SavedCardCharge): Promise<PaymentReport> {
    this.charges.push(input);
    const index = this.answers.findIndex((entry) => entry.email === input.payer.email);
    const scripted = index === -1 ? null : this.answers.splice(index, 1)[0]!.answer;
    const answer = await (scripted ?? ((charge: SavedCardCharge) => report(charge.orderId, "PENDING")))(input);
    if (answer instanceof Error) throw answer;
    return answer;
  }
  async status(input: Readonly<{ orderId: string; providerPaymentId: string | null }>): Promise<PaymentReport | "NO_SUCH_ORDER"> {
    this.reads.push(input);
    const next = this.statuses.get(input.orderId)?.shift() ?? "NO_SUCH_ORDER";
    if (next instanceof Error) throw next;
    return next;
  }
  chargesOf(orderId: string): SavedCardCharge[] {
    return this.charges.filter((charge) => charge.orderId === orderId);
  }
}

const unconfigured = async (): Promise<never> => {
  throw new TypedDomainError("XMONEY_UNAVAILABLE", "no xMoney in this suite");
};
const NO_XMONEY: Pick<XMoneyClient, "rebill" | "listTransactions"> = Object.freeze({ rebill: unconfigured, listTransactions: unconfigured });

const PROFILE: BillingProfile = Object.freeze({
  email: "stored@example.test", locale: "ro", name: "Ana Pop", firstName: "Ana", lastName: "Pop", phone: "+40712345678",
  paymentIp: "198.51.100.7", country: "RO", region: "Cluj", postalCode: "400001", city: "Cluj-Napoca",
  street: "Strada Memorandumului 1", company: null
});

async function writeProfile(customerId: string, overrides: Partial<BillingProfile>): Promise<void> {
  const repository = new BillingRepository(database.pool);
  const profile: BillingProfile = { ...PROFILE, ...overrides };
  const sealed = sealBillingProfile(TEST_RECORDS_KEY, customerId, profile);
  await repository.withTransaction((client) => repository.appendProfile(client, {
    customerId, at: new Date(), locale: profile.locale, profileCiphertext: sealed.ciphertext, keyId: sealed.keyId
  }));
}

/** One NETOPIA subscription due now (its period ended a minute ago), and the renewal, maintenance and port over it. */
async function due(profile: Partial<BillingProfile> = {}) {
  // Ruling PR-19: every billing owner_ref is a uuid (0085), so the settlements' erasure lookup can read it.
  const ownerRef = randomUUID();
  const seeded = await seedNetopiaSubscription(database.pool, {
    ownerRef, planId: "PLUS", activatedAt: new Date(Date.now() - 40 * DAY), taxCountry: "RO"
  });
  await writeProfile(seeded.customerId, profile);
  const email = `${seeded.customerId}@example.test`;
  const clock = { now: new Date(seeded.periodEnd.getTime() + MINUTE) };
  const payments = new ScriptedPayments();
  const audit = recordingAudit();
  const repository = new BillingRepository(database.pool);
  const jobs = new BillingJobQueries(database.pool);
  const entitlements = new EntitlementRepository(database.pool);
  const settlement = createRenewalSettlement({ repository, entitlements, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL });
  const renewal = new RenewalService({
    repository, jobs, entitlements, xmoney: NO_XMONEY, tax: new AdjustableTaxEngine(), settlement, policy: testBillingPolicy,
    plans: testBillingPlans, recordsKey: TEST_RECORDS_KEY, publicAppUrl: TEST_PUBLIC_APP_URL, audit,
    clock: () => clock.now, kick: () => undefined, xmoneyEnvironment: "stage",
    netopia: {
      payments, paymentEnvironment: "sandbox", orderText: englishOrderText,
      recipients: { currentAddress: async (customerId: string) => `${customerId}@example.test` }
    }
  });
  const maintenance = new BillingMaintenance({
    repository, jobs, entitlements, renewal, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL,
    xmoneyEnvironment: "stage", paymentEnvironment: "sandbox", audit, clock: () => clock.now
  });
  return { ownerRef, seeded, email, clock, payments, audit, repository, entitlements, renewal, maintenance };
}
type Due = Awaited<ReturnType<typeof due>>;

/** The renewal's own charge (attempt 1) after `renew`. */
async function renewNow(run: Due) {
  expect(await run.renewal.renew(run.seeded.subscriptionId)).toBe("charged");
  const charge = (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
    .find((row) => row.kind === "RENEWAL" && row.attempt === 1);
  expect(charge).toBeDefined();
  return charge!;
}

/** Each event as KIND or KIND:CODE, in order. */
async function trail(chargeId: string): Promise<string[]> {
  return ((await new BillingRepository(database.pool).charge(chargeId))?.events ?? [])
    .map((event) => event.errorCode === null ? event.kind : `${event.kind}:${event.errorCode}`);
}

async function outboxRows(where: string, values: unknown[]) {
  return (await database.pool.query<{ kind: string; ref: string; payload: Record<string, unknown>; not_before: Date }>(
    `SELECT kind, ref, payload, not_before FROM billing.outbox WHERE ${where} ORDER BY created_at`, values
  )).rows;
}
const verifyJobs = (chargeId: string) => outboxRows("kind = 'VERIFY_PAYMENT' AND ref = $1", [chargeId]);
const emails = (refPrefix: string) => outboxRows("kind = 'EMAIL' AND ref LIKE $1", [`${refPrefix}%`]);
const ownerAlerts = (reasonCode: string, reference: string) => outboxRows(
  "kind = 'EMAIL' AND ref LIKE 'O3:%' AND payload->>'param.reasonCode' = $1 AND payload->>'param.reference' = $2",
  [reasonCode, reference]
);
const kindsOf = async (run: Due) => (await run.repository.subscriptionEvents(run.seeded.subscriptionId)).map((event) => event.kind);

describe("N11 a NETOPIA renewal charges the saved card (spec §2.9.2)", () => {
  it("sends one saved-card charge with the charge id as orderID, the full payer, the payment IP and MIT's notify address", async () => {
    const run = await due();
    const card = answeredCard();
    run.payments.answer(run.email, (input) => report(input.orderId, "PAID", { savedCard: card }));
    const charge = await renewNow(run);
    expect(run.payments.charges).toHaveLength(1);
    const sent = run.payments.charges[0]!;
    expect(sent).toMatchObject({
      orderId: charge.chargeId, amountMicros: 24_200_000, currency: "USD", payerIp: "198.51.100.7", language: "ro",
      notifyUrl: `${TEST_PUBLIC_APP_URL}/api/v1/billing/netopia/notify`,
      returnUrl: `${TEST_PUBLIC_APP_URL}/checkout/return?charge=${charge.chargeId}`,
      description: "DebateAI Plus monthly plan",
      payer: {
        firstName: "Ana", lastName: "Pop", email: run.email, phone: "+40712345678", country: "RO",
        region: "Cluj", city: "Cluj-Napoca", postalCode: "400001", street: "Strada Memorandumului 1"
      }
    });
    // Spec §2.2 rule 5: the token only travels inside a SecretToken.
    expect(String(sent.cardToken)).toBe("[token]");
    expect(JSON.stringify(sent)).not.toContain("tok-renewal");
    expect(charge).toMatchObject({ paymentProvider: "netopia", paymentEnvironment: "sandbox" });
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "SUBMITTED"]);
    const submitted = (await run.repository.charge(charge.chargeId))!.events.find((event) => event.kind === "SUBMITTED");
    expect(submitted?.providerPaymentId).toBe(`ntp-${charge.chargeId.slice(0, 16)}`);
    // VERIFY_PAYMENT decides (spec §2.8): ref = the charge id, due now.
    const [verify] = await verifyJobs(charge.chargeId);
    expect(verify).toMatchObject({ payload: { charge_id: charge.chargeId } });
    expect(verify!.not_before.getTime()).toBeLessThanOrEqual(run.clock.now.getTime());
    // NETOPIA issues a new token with each token payment: stored at once, from this charge.
    const stored = await run.repository.withTransaction((client) => run.repository.cardTokensFromCharge(client, charge.chargeId));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ last4: "4242", expMonth: 12, expYear: 2031, sourceChargeId: charge.chargeId, revokedAt: null });
    expect(run.audit.events.map((entry) => JSON.stringify(entry))).not.toEqual(
      expect.arrayContaining([expect.stringContaining("tok-renewal")])
    );
  });

  it("fails CARD_NOT_SAVED with no call when the card was revoked, and the M5 never names the bank", async () => {
    const run = await due();
    await run.repository.withTransaction((client) => run.repository.revokeCardToken(client, {
      tokenId: run.seeded.cardTokenId, at: new Date(run.clock.now.getTime() - HOUR), reason: "OWNER"
    }));
    const charge = await renewNow(run);
    expect(run.payments.charges).toHaveLength(0);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "FAILED:CARD_NOT_SAVED"]);
    expect((await kindsOf(run)).at(-1)).toBe("PAST_DUE");
    const [m5] = await emails(`M5A:${charge.chargeId}`);
    expect(m5?.payload).toMatchObject({ "param.bankDeclined": "false" });
    expect(m5?.payload["param.confirmCard"]).toBeUndefined();
  });

  it("fails CARD_NOT_SAVED with no call when the payer is incomplete (no phone)", async () => {
    const run = await due({ phone: null });
    const charge = await renewNow(run);
    expect(run.payments.charges).toHaveLength(0);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "FAILED:CARD_NOT_SAVED"]);
  });

  it("uses the checkout quote's address when the profile holds no payment IP", async () => {
    const run = await due({ paymentIp: null });
    await renewNow(run);
    // seedNetopiaSubscription seals the SUBSCRIBE quote's location with ip 192.0.2.10, as seedActiveSubscription does.
    expect(run.payments.charges[0]?.payerIp).toBe("192.0.2.10");
  });

  it("records a bank's decline at once and says so in M5; a decline NETOPIA does not lay on the bank says nothing of a bank", async () => {
    const bank = await due();
    bank.payments.answer(bank.email, (input) => report(input.orderId, "DECLINED", {
      declineCode: "20", declineSide: "CARD", bankDeclined: true
    }));
    const declined = await renewNow(bank);
    expect(await trail(declined.chargeId)).toEqual(["REQUESTED", "SUBMITTED", "FAILED:PAYMENT_DECLINED"]);
    expect((await emails(`M5A:${declined.chargeId}`))[0]?.payload).toMatchObject({ "param.bankDeclined": "true" });
    expect(await verifyJobs(declined.chargeId)).toHaveLength(0);

    const antifraud = await due();
    antifraud.payments.answer(antifraud.email, (input) => report(input.orderId, "DECLINED", {
      declineCode: "36", declineSide: "CARD", bankDeclined: false
    }));
    const refused = await renewNow(antifraud);
    expect((await emails(`M5A:${refused.chargeId}`))[0]?.payload).toMatchObject({ "param.bankDeclined": "false" });
  });

  it("turns the bank's request for its security check into AUTHENTICATION_REQUIRED and asks for the card to be confirmed", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "ACTION_REQUIRED"));
    const charge = await renewNow(run);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "SUBMITTED", "FAILED:AUTHENTICATION_REQUIRED"]);
    expect((await emails(`M5A:${charge.chargeId}`))[0]?.payload).toMatchObject({
      "param.bankDeclined": "false", "param.confirmCard": "true"
    });
  });

  it("ruling PR-11: a FIRST send that NETOPIA answers 56 (the order was already used) writes the audit line and tells the owner", async () => {
    // NETOPIA's protocol fake, through the real client: the first real charge makes the order, the second gets its 56.
    const fake = await startFakeNetopia();
    try {
      const real = createNetopiaPayments({ baseUrl: fake.baseUrl, apiKey: fake.apiKey, posSignature: fake.posSignature });
      const run = await due();
      const seedOrder = randomBytes(16).toString("hex");
      await real.startHostedPayment(Object.freeze({
        orderId: seedOrder, amountMicros: 24_200_000, currency: "USD", description: "DebateAI Plus monthly plan",
        payer: Object.freeze({
          firstName: "Ana", lastName: "Pop", email: run.email, phone: "+40712345678", country: "RO", region: "Cluj",
          city: "Cluj-Napoca", postalCode: "400001", street: "Strada Memorandumului 1"
        }),
        clientId: randomBytes(16).toString("hex"), returnUrl: `${TEST_PUBLIC_APP_URL}/checkout/return?charge=${seedOrder}`,
        notifyUrl: `${TEST_PUBLIC_APP_URL}/api/v1/billing/netopia/notify`, language: "ro"
      }));
      fake.pay(seedOrder, "APPROVE");
      const issued = fake.orders.get(seedOrder)!.token!;
      run.payments.answer(run.email, async (input) => {
        const withIssued = Object.freeze({ ...input, cardToken: createSecretToken(issued) });
        await real.chargeSavedCard(withIssued);
        return real.chargeSavedCard(withIssued);
      });
      const charge = await renewNow(run);
      expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "SUBMITTED"]);
      expect(run.audit.events.filter((entry) => entry.event === "billing.payment.order_reused"))
        .toEqual([{ event: "billing.payment.order_reused", fields: { orderId: charge.chargeId } }]);
      expect(await ownerAlerts("ORDER_REUSED", `charge ${charge.chargeId}`)).toHaveLength(1);
    } finally {
      await fake.close();
    }
  });
});

describe("N11 ruling C-8: a refusal caused by our own setup never starts the failed-payment emails", () => {
  it("holds a configuration refusal, retries it on the not-sent backoff with the same orderID, emails the owner once an hour, and never dunns it", async () => {
    const run = await due();
    // Five minutes into the next whole hour, so the retries below stay inside one hour ("once per code and hour").
    run.clock.now = new Date(Math.ceil(run.clock.now.getTime() / HOUR) * HOUR + 5 * MINUTE);
    run.payments.answer(run.email, () => paymentError("PAYMENT_CONFIGURATION_REFUSED", "32"));
    const charge = await renewNow(run);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "REQUESTED:CHARGE_CONFIGURATION_REFUSED"]);
    expect(await emails(`M5A:${charge.chargeId}`)).toHaveLength(0);
    expect(await run.entitlements.current(run.ownerRef, run.clock.now)).toMatchObject({ cause: "RENEWAL_PENDING" });
    const reference = `charge ${charge.chargeId}`;
    expect(await ownerAlerts("CHARGE_CONFIGURATION_REFUSED", reference)).toHaveLength(1);
    expect((await ownerAlerts("CHARGE_CONFIGURATION_REFUSED", reference))[0]?.payload).toMatchObject({
      "param.paymentAlert": "true", recipient: "OWNER"
    });
    // 1 minute is the first not-sent wait: nothing before it.
    run.clock.now = new Date(run.clock.now.getTime() + 30_000);
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(false);
    run.payments.answer(run.email, () => paymentError("PAYMENT_CONFIGURATION_REFUSED", "32"));
    run.clock.now = new Date(run.clock.now.getTime() + MINUTE);
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(true);
    expect(run.payments.chargesOf(charge.chargeId)).toHaveLength(2);
    // Still the same hour: no second O3 for this code.
    expect(await ownerAlerts("CHARGE_CONFIGURATION_REFUSED", reference)).toHaveLength(1);
    // The window ends: a configuration refusal is never closed into the dunning; the owner hears the outcome is open.
    run.payments.answer(run.email, () => paymentError("PAYMENT_CONFIGURATION_REFUSED", "32"));
    run.clock.now = new Date(run.seeded.periodEnd.getTime() + 72 * HOUR + MINUTE);
    await run.renewal.recoverOpenCharge(charge.chargeId);
    expect((await trail(charge.chargeId)).some((entry) => entry.startsWith("FAILED"))).toBe(false);
    expect(await emails(`M5A:${charge.chargeId}`)).toHaveLength(0);
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", reference)).toHaveLength(1);
  });

  it("raises the key alarm and an O3 for refused credentials, and only waits out an outage", async () => {
    const keyRun = await due();
    keyRun.payments.answer(keyRun.email, () => paymentError("PAYMENT_CREDENTIALS_REFUSED"));
    const keyCharge = await renewNow(keyRun);
    expect(await trail(keyCharge.chargeId)).toEqual(["REQUESTED", "REQUESTED:CHARGE_CREDENTIALS_REFUSED"]);
    expect(keyRun.audit.events.map((entry) => entry.event)).toContain("billing.payment.credentials_refused");
    expect(await ownerAlerts("CHARGE_CREDENTIALS_REFUSED", `charge ${keyCharge.chargeId}`)).toHaveLength(1);

    const outage = await due();
    outage.payments.answer(outage.email, () => paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "ECONNREFUSED"));
    const outageCharge = await renewNow(outage);
    expect(await trail(outageCharge.chargeId)).toEqual(["REQUESTED", "REQUESTED:CHARGE_NOT_SENT"]);
    expect(await ownerAlerts("CHARGE_NOT_SENT", `charge ${outageCharge.chargeId}`)).toHaveLength(0);
    // Q-1: an outage that outlasts the window closes NO_TRANSACTION and the normal dunning starts.
    outage.payments.answer(outage.email, () => paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "ECONNREFUSED"));
    outage.clock.now = new Date(outage.seeded.periodEnd.getTime() + 72 * HOUR + MINUTE);
    await outage.renewal.recoverOpenCharge(outageCharge.chargeId);
    expect((await trail(outageCharge.chargeId)).at(-1)).toBe("FAILED:NO_TRANSACTION");
    expect(await emails(`M5A:${outageCharge.chargeId}`)).toHaveLength(1);
  });
});

describe("N11 an unknown outcome is probed on the same orderID (spec §2.9.3)", () => {
  it("adopts the payment a status read finds, without a second charge", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const charge = await renewNow(run);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN"]);
    expect(await run.entitlements.current(run.ownerRef, run.clock.now)).toMatchObject({ cause: "RENEWAL_PENDING" });
    // Never in the minute after the unknown.
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(false);
    expect(run.payments.reads).toHaveLength(0);
    run.payments.scriptStatus(charge.chargeId, report(charge.chargeId, "PAID"));
    run.clock.now = new Date(run.clock.now.getTime() + MINUTE + 1_000);
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(true);
    expect(run.payments.reads).toEqual([{ orderId: charge.chargeId, providerPaymentId: null }]);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN", "SUBMITTED"]);
    expect(await verifyJobs(charge.chargeId)).toHaveLength(1);
    expect(run.payments.chargesOf(charge.chargeId)).toHaveLength(1);
    const read = await run.repository.lastStatusRead(charge.chargeId);
    expect(read).toMatchObject({ outcome: "PAID" });
  });

  it("resends the same orderID after 30 quiet minutes when NETOPIA knows no such order, and takes the 56 answer as the payment", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const charge = await renewNow(run);
    const unknownAt = run.clock.now.getTime();
    run.payments.scriptStatus(charge.chargeId, "NO_SUCH_ORDER", "NO_SUCH_ORDER");
    run.clock.now = new Date(unknownAt + 2 * MINUTE);
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(false);
    expect(run.payments.chargesOf(charge.chargeId)).toHaveLength(1);
    // Hourly probes: no second read 10 minutes later.
    run.clock.now = new Date(unknownAt + 12 * MINUTE);
    await run.renewal.recoverOpenCharge(charge.chargeId);
    expect(run.payments.reads).toHaveLength(1);
    // NETOPIA's 56 answers the resend with the existing payment: the package returns its report.
    run.payments.answer(run.email, (input) => report(input.orderId, "PAID"));
    run.clock.now = new Date(unknownAt + 31 * MINUTE);
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(true);
    expect(run.payments.chargesOf(charge.chargeId)).toHaveLength(2);
    expect(run.payments.charges.map((sent) => sent.orderId)).toEqual([charge.chargeId, charge.chargeId]);
    expect(await trail(charge.chargeId)).toEqual([
      "REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN", "REQUESTED:RESEND_STARTED", "SUBMITTED"
    ]);
  });

  it("closes NO_TRANSACTION at the window's end only on a fresh NO_SUCH_ORDER, and starts the dunning", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const charge = await renewNow(run);
    run.payments.scriptStatus(charge.chargeId, "NO_SUCH_ORDER");
    run.clock.now = new Date(run.seeded.periodEnd.getTime() + 72 * HOUR + MINUTE);
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(true);
    expect((await trail(charge.chargeId)).at(-1)).toBe("FAILED:NO_TRANSACTION");
    expect((await kindsOf(run)).at(-1)).toBe("PAST_DUE");
    expect((await emails(`M5A:${charge.chargeId}`))[0]?.payload).toMatchObject({ "param.bankDeclined": "false" });
  });

  it("ruling PR-27: never closes an order NETOPIA confirmed (a resend's 56 with no payment), even on NO_SUCH_ORDER at the window's end", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const charge = await renewNow(run);
    const unknownAt = run.clock.now.getTime();
    run.payments.scriptStatus(charge.chargeId, "NO_SUCH_ORDER", "NO_SUCH_ORDER");
    run.clock.now = new Date(unknownAt + 2 * MINUTE);
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(false);
    // The resend: NETOPIA answers 56 without the payment, and the package's follow-up read cannot say.
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "56"));
    run.clock.now = new Date(unknownAt + 31 * MINUTE);
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(true);
    expect(await trail(charge.chargeId)).toEqual([
      "REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN", "REQUESTED:RESEND_STARTED", "SUBMIT_UNKNOWN:CHARGE_ORDER_EXISTS"
    ]);
    // The window ends; the fresh read says NO_SUCH_ORDER, but NETOPIA said the order exists: it is never closed.
    run.clock.now = new Date(run.seeded.periodEnd.getTime() + 72 * HOUR + MINUTE);
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(false);
    expect(run.payments.reads.at(-1)).toEqual({ orderId: charge.chargeId, providerPaymentId: null });
    expect(await run.repository.lastStatusRead(charge.chargeId)).toMatchObject({ outcome: "NO_SUCH_ORDER" });
    expect((await trail(charge.chargeId)).some((entry) => entry.startsWith("FAILED"))).toBe(false);
    expect(await emails(`M5A:${charge.chargeId}`)).toHaveLength(0);
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", `charge ${charge.chargeId}`)).toHaveLength(1);
  });

  it("never closes an order it could not read at the window's end: the renewal keeps holding and the owner is told", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const charge = await renewNow(run);
    run.payments.scriptStatus(charge.chargeId, paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "503"));
    run.clock.now = new Date(run.seeded.periodEnd.getTime() + 72 * HOUR + MINUTE);
    expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(false);
    expect((await trail(charge.chargeId)).some((entry) => entry.startsWith("FAILED"))).toBe(false);
    expect(await emails(`M5A:${charge.chargeId}`)).toHaveLength(0);
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", `charge ${charge.chargeId}`)).toHaveLength(1);
    expect(await run.repository.lastStatusRead(charge.chargeId)).toMatchObject({ outcome: "PAYMENT_PROVIDER_UNAVAILABLE" });
  });

  it("decides a probe's ACTION_REQUIRED as AUTHENTICATION_REQUIRED", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const charge = await renewNow(run);
    run.payments.scriptStatus(charge.chargeId, report(charge.chargeId, "ACTION_REQUIRED"));
    run.clock.now = new Date(run.clock.now.getTime() + 2 * MINUTE);
    await run.renewal.recoverOpenCharge(charge.chargeId);
    expect((await trail(charge.chargeId)).slice(-2)).toEqual(["SUBMITTED", "FAILED:AUTHENTICATION_REQUIRED"]);
    expect((await emails(`M5A:${charge.chargeId}`))[0]?.payload).toMatchObject({ "param.confirmCard": "true" });
  });
});

describe("N11 a renewal that stays pending (spec §2.9.4)", () => {
  it("holds it until its deadline, then records a final unpaid state and starts the dunning", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "PENDING"));
    const charge = await renewNow(run);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "SUBMITTED"]);
    run.clock.now = new Date(run.clock.now.getTime() + 2 * MINUTE);
    expect(await run.renewal.decidePendingRenewal(charge.chargeId)).toBe(false);
    expect(await run.entitlements.current(run.ownerRef, run.clock.now)).toMatchObject({ cause: "RENEWAL_PENDING" });
    expect(run.payments.reads).toHaveLength(0);
    run.payments.scriptStatus(charge.chargeId, report(charge.chargeId, "DECLINED", { bankDeclined: true }));
    run.clock.now = new Date(run.seeded.periodEnd.getTime() + 72 * HOUR + MINUTE);
    expect(await run.renewal.decidePendingRenewal(charge.chargeId)).toBe(true);
    expect(run.payments.reads[0]).toEqual({ orderId: charge.chargeId, providerPaymentId: `ntp-${charge.chargeId.slice(0, 16)}` });
    expect((await trail(charge.chargeId)).at(-1)).toBe("FAILED:PAYMENT_DECLINED");
    expect((await emails(`M5A:${charge.chargeId}`))[0]?.payload).toMatchObject({ "param.bankDeclined": "true" });
  });

  it("keeps a still-pending renewal held at its deadline, emails the owner once, and reads again only an hour later", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "PENDING"));
    const charge = await renewNow(run);
    run.payments.scriptStatus(charge.chargeId, report(charge.chargeId, "PENDING"), report(charge.chargeId, "PENDING"));
    run.clock.now = new Date(run.seeded.periodEnd.getTime() + 72 * HOUR + MINUTE);
    expect(await run.renewal.decidePendingRenewal(charge.chargeId)).toBe(false);
    expect((await trail(charge.chargeId)).some((entry) => entry.startsWith("FAILED"))).toBe(false);
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", `charge ${charge.chargeId}`)).toHaveLength(1);
    run.clock.now = new Date(run.clock.now.getTime() + 10 * MINUTE);
    await run.renewal.decidePendingRenewal(charge.chargeId);
    expect(run.payments.reads).toHaveLength(1);
    run.clock.now = new Date(run.clock.now.getTime() + HOUR);
    await run.renewal.decidePendingRenewal(charge.chargeId);
    expect(run.payments.reads).toHaveLength(2);
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", `charge ${charge.chargeId}`)).toHaveLength(1);
  });

  it("brings VERIFY_PAYMENT forward when the deadline's read says PAID", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "PENDING"));
    const charge = await renewNow(run);
    run.payments.scriptStatus(charge.chargeId, report(charge.chargeId, "PAID"));
    run.clock.now = new Date(run.seeded.periodEnd.getTime() + 72 * HOUR + MINUTE);
    expect(await run.renewal.decidePendingRenewal(charge.chargeId)).toBe(true);
    const [verify] = await verifyJobs(charge.chargeId);
    expect(verify!.not_before.getTime()).toBeLessThanOrEqual(run.clock.now.getTime());
  });
});

describe("N11 a dunning retry first probes the period's earlier attempts (spec §2.9.3 step 5)", () => {
  it("makes no retry while an earlier attempt reads PAID, and queues its check instead", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "DECLINED", { bankDeclined: true }));
    const first = await renewNow(run);
    expect((await kindsOf(run)).at(-1)).toBe("PAST_DUE");
    run.payments.scriptStatus(first.chargeId, report(first.chargeId, "PAID"));
    run.clock.now = new Date(run.clock.now.getTime() + DAY + MINUTE);
    await run.maintenance.runOnce();
    const renewals = (await run.repository.chargesForSubscription(run.seeded.subscriptionId)).filter((row) => row.kind === "RENEWAL");
    expect(renewals.map((row) => row.attempt)).toEqual([1]);
    expect(await verifyJobs(first.chargeId)).toHaveLength(1);
    expect(run.audit.events.filter((entry) => entry.event === "billing.renewal.retry_held")
      .map((entry) => entry.fields.code)).toContain("EARLIER_ATTEMPT_PAID");
  });

  it("makes no retry while an earlier attempt cannot be read, and retries with a NEW orderID once it reads unpaid", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "DECLINED", { bankDeclined: true }));
    const first = await renewNow(run);
    run.payments.scriptStatus(first.chargeId, paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "503"));
    run.clock.now = new Date(run.clock.now.getTime() + DAY + MINUTE);
    await run.maintenance.runOnce();
    expect((await run.repository.chargesForSubscription(run.seeded.subscriptionId)).filter((row) => row.kind === "RENEWAL"))
      .toHaveLength(1);
    run.payments.scriptStatus(first.chargeId, report(first.chargeId, "DECLINED", { bankDeclined: true }));
    run.payments.answer(run.email, (input) => report(input.orderId, "PAID"));
    run.clock.now = new Date(run.clock.now.getTime() + 11 * MINUTE);
    await run.maintenance.runOnce();
    const retry = (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
      .find((row) => row.kind === "RENEWAL" && row.attempt === 2);
    expect(retry).toBeDefined();
    expect(retry!.chargeId).not.toBe(first.chargeId);
    expect(run.payments.chargesOf(retry!.chargeId)).toHaveLength(1);
    expect(foldSubscription(await run.repository.subscriptionEvents(run.seeded.subscriptionId)).status).toBe("PAST_DUE");
  });
});
