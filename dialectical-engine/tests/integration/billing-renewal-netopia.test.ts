import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  foldSubscription, paymentError, type CardPayments, type HostedPaymentStart, type HostedPaymentStarted, type PaymentReport,
  type PaymentState, type SavedCardCharge
} from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository, EntitlementRepository, migrate } from "@debateai/db";
import { createNetopiaPayments, createSecretToken } from "@debateai/payments-netopia";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { AdjustableTaxEngine, testBillingPlans, testBillingPolicy } from "../support/billingFixtures.js";
import {
  recordingAudit, seedNetopiaSubscription, TEST_PUBLIC_APP_URL, TEST_RECORDS_KEY, testCardToken, type RecordingAudit
} from "../support/billingSubscriptionFixtures.js";
import { startFakeNetopia } from "../support/fake-netopia.js";
import { netopiaVerifyHandler, verifyJob } from "../support/netopia-verify.js";
import { BillingMaintenance } from "../../apps/api/src/billing/maintenance.js";
import { englishOrderText } from "../../apps/api/src/billing/order-text.js";
import { sealBillingProfile, sealCardToken, sealQuoteLocation, type BillingProfile } from "../../apps/api/src/billing/records.js";
import { RenewalService } from "../../apps/api/src/billing/renewal.js";
import { remindHeldRenewals, resumeHeldRenewals } from "../../apps/api/src/billing/renewal-resume.js";
import { chargeEvent, subscriptionEvent } from "../../apps/api/src/billing/rows.js";
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
    repository, jobs, entitlements, tax: new AdjustableTaxEngine(), settlement, policy: testBillingPolicy,
    plans: testBillingPlans, recordsKey: TEST_RECORDS_KEY, publicAppUrl: TEST_PUBLIC_APP_URL, audit,
    clock: () => clock.now, kick: () => undefined,
    netopia: {
      payments, paymentEnvironment: "sandbox", orderText: englishOrderText,
      recipients: { currentAddress: async (customerId: string) => `${customerId}@example.test` }
    }
  });
  const maintenance = new BillingMaintenance({
    repository, jobs, entitlements, renewal, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL,
    paymentEnvironment: "sandbox", audit, clock: () => clock.now
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
      description: "Dialectical Engine Plus monthly plan",
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
    // seedNetopiaSubscription seals the SUBSCRIBE quote's location with ip 192.0.2.10.
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

  it("turns the bank's request for its security check into AUTHENTICATION_REQUIRED and says the bank asked for a confirmation", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "ACTION_REQUIRED"));
    const charge = await renewNow(run);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "SUBMITTED", "FAILED:AUTHENTICATION_REQUIRED"]);
    // B1 (final review): NETOPIA named no code 20, so the card is not tried again by itself (B2): the M5 says only
    // that the bank asked (bankAsked), never confirmCard's "we'll try again".
    const [m5] = await emails(`M5A:${charge.chargeId}`);
    expect(m5?.payload).toMatchObject({ "param.bankDeclined": "false", "param.bankAsked": "true" });
    expect(m5?.payload["param.confirmCard"]).toBeUndefined();
    expect(m5?.payload["param.endDate"]).toBeDefined();
  });

  it("ruling PR-11: a FIRST send that NETOPIA answers 56 (the order was already used) writes the audit line and tells the owner", async () => {
    // NETOPIA's protocol fake, through the real client: the first real charge makes the order, the second gets its 56.
    const fake = await startFakeNetopia();
    try {
      const real = createNetopiaPayments({ baseUrl: fake.baseUrl, apiKey: fake.apiKey, posSignature: fake.posSignature });
      const run = await due();
      const seedOrder = randomBytes(16).toString("hex");
      await real.startHostedPayment(Object.freeze({
        orderId: seedOrder, amountMicros: 24_200_000, currency: "USD", description: "Dialectical Engine Plus monthly plan",
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

describe("B2 NETOPIA's refusal code travels with the failed attempt", () => {
  /** The subscription's latest PAST_DUE data (the failed attempt's record). */
  const pastDueData = async (run: Due) => (await run.repository.subscriptionEvents(run.seeded.subscriptionId))
    .filter((event) => event.kind === "PAST_DUE").at(-1)?.data;

  it("keeps code 20 (insufficient funds) on the PAST_DUE and marks it retried; the FAILED code stays PAYMENT_DECLINED", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "DECLINED", { declineCode: "20", bankDeclined: true }));
    const charge = await renewNow(run);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "SUBMITTED", "FAILED:PAYMENT_DECLINED"]);
    expect(await pastDueData(run)).toMatchObject({ charge_id: charge.chargeId, decline_code: "20", auto_retry: true });
  });

  it("keeps code 22 on the PAST_DUE and marks it not retried (NETOPIA answers 2026-10-21, Q15)", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "DECLINED", { declineCode: "22", bankDeclined: true }));
    const charge = await renewNow(run);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "SUBMITTED", "FAILED:PAYMENT_DECLINED"]);
    expect(await pastDueData(run)).toMatchObject({ charge_id: charge.chargeId, decline_code: "22", auto_retry: false });
  });

  it("writes no code for our own CARD_NOT_SAVED (NETOPIA never refused), and retries it", async () => {
    const run = await due();
    await run.repository.withTransaction((client) => run.repository.revokeCardToken(client, {
      tokenId: run.seeded.cardTokenId, at: new Date(run.clock.now.getTime() - HOUR), reason: "OWNER"
    }));
    const charge = await renewNow(run);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "FAILED:CARD_NOT_SAVED"]);
    const data = await pastDueData(run);
    expect(data).toMatchObject({ charge_id: charge.chargeId, auto_retry: true });
    expect(data).not.toHaveProperty("decline_code");
  });
});

/**
 * Ruling C-8, B1 part 2 (NETOPIA answers 2026-10-21, Q22: at most 3 saved-card tries a day): a refusal caused by our own
 * setup never starts the failed-payment emails, and is never sent again by itself: it waits for the owner's resume
 * command (`resumeHeldRenewals`, `pnpm billing:renewal-resume`). The tests run in this order: a resume releases every
 * held renewal of the database, so the first two count on no earlier test leaving one held.
 */
describe("N11 ruling C-8, B1: a refusal caused by our own setup waits for the owner", () => {
  /** This payer's saved-card calls, in the order they were made (the port also serves the file's other plans). */
  const sendsOf = (run: Due) => run.payments.charges.filter((sent) => sent.payer.email === run.email);
  /** The 60-second renewal tick, sampled every 10 minutes from `from` to `to` (both included) after `start`. */
  const tick = async (run: Due, start: number, from: number, to: number) => {
    for (let elapsed = from; elapsed <= to; elapsed += 10 * MINUTE) {
      run.clock.now = new Date(start + elapsed);
      await run.renewal.runOnce();
    }
  };
  const resume = (run: Due) => resumeHeldRenewals({
    repository: run.repository, jobs: new BillingJobQueries(database.pool), paymentEnvironment: "sandbox",
    clock: () => run.clock.now, audit: run.audit
  });
  const pendingHolds = async (run: Due) => (await database.pool.query<{ holds: number }>(
    "SELECT count(*)::int AS holds FROM billing.entitlement_event WHERE owner_ref = $1::uuid AND cause = 'RENEWAL_PENDING'",
    [run.ownerRef]
  )).rows[0]!.holds;
  const renewalCharge = async (run: Due) => (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
    .find((row) => row.kind === "RENEWAL" && row.attempt === 1)!;
  /** Every saved-card call of this payer answers `answer` (the setting is wrong until the test fixes it). */
  const answerAll = (run: Due, answer: ChargeAnswer) => {
    for (let call = 0; call < 200; call += 1) run.payments.answer(run.email, answer);
  };

  it("code 99: one send in 72 hours, one O3 naming the resume command, no M5, one hold, the charge kept open; a resume sends it once more on the same orderID, and a second resume sends nothing (Review Focus 5)", async () => {
    const run = await due();
    let fixed = false;
    answerAll(run, (input) => fixed ? report(input.orderId, "PENDING") : paymentError("PAYMENT_CONFIGURATION_REFUSED", "99"));
    const start = run.clock.now.getTime();
    await tick(run, start, 0, 72 * HOUR);
    const charge = await renewalCharge(run);
    expect(sendsOf(run)).toHaveLength(1);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "REQUESTED:CHARGE_CONFIGURATION_REFUSED"]);
    const reference = `charge ${charge.chargeId}`;
    const alerts = await ownerAlerts("CHARGE_CONFIGURATION_REFUSED", reference);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.payload).toMatchObject({ "param.paymentAlert": "true", recipient: "OWNER" });
    expect(String(alerts[0]?.payload["param.nextSteps"])).toContain("/usr/bin/pnpm billing:renewal-resume");
    // The owner was told at the refusal: no second O3 at the window's end.
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", reference)).toHaveLength(0);
    expect(await emails(`M5A:${charge.chargeId}`)).toHaveLength(0);
    expect(await kindsOf(run)).not.toContain("PAST_DUE");
    expect(await pendingHolds(run)).toBe(1);

    // The owner fixed the setting and runs the resume command: the next tick sends the same order once more, at once.
    fixed = true;
    run.clock.now = new Date(start + 72 * HOUR + 5 * MINUTE);
    expect(await resume(run)).toEqual({ resumed: 1, busy: 0 });
    expect(run.audit.events).toContainEqual({ event: "billing.renewal.resumed", fields: { resumed: 1, busy: 0 } });
    expect((await trail(charge.chargeId)).at(-1)).toBe("REQUESTED:CHARGE_RESUMED");
    expect(sendsOf(run)).toHaveLength(1);
    // Review Focus 5: run again before the tick, it releases nothing more (one marker, one send).
    expect(await resume(run)).toEqual({ resumed: 0, busy: 0 });
    expect((await trail(charge.chargeId)).filter((entry) => entry === "REQUESTED:CHARGE_RESUMED")).toHaveLength(1);
    run.clock.now = new Date(start + 72 * HOUR + 6 * MINUTE);
    await run.renewal.runOnce();
    expect(sendsOf(run).map((sent) => sent.orderId)).toEqual([charge.chargeId, charge.chargeId]);
    expect(await trail(charge.chargeId)).toEqual([
      "REQUESTED", "REQUESTED:CHARGE_CONFIGURATION_REFUSED", "REQUESTED:CHARGE_RESUMED", "REQUESTED:RESEND_STARTED", "SUBMITTED"
    ]);
    expect(await verifyJobs(charge.chargeId)).toHaveLength(1);

    // Review Focus 5: run twice, the second run releases nothing and nothing more is sent.
    expect(await resume(run)).toEqual({ resumed: 0, busy: 0 });
    await tick(run, start, 72 * HOUR + 10 * MINUTE, 74 * HOUR);
    expect(sendsOf(run)).toHaveLength(2);
  }, 600_000);

  it("a resume after the 72-hour window still sends (a fresh day, not NO_TRANSACTION); refused again, it is held again", async () => {
    const run = await due();
    answerAll(run, () => paymentError("PAYMENT_CONFIGURATION_REFUSED", "99"));
    const start = run.clock.now.getTime();
    await tick(run, start, 0, 80 * HOUR);
    const charge = await renewalCharge(run);
    expect(sendsOf(run)).toHaveLength(1);
    expect((await trail(charge.chargeId)).some((entry) => entry.startsWith("FAILED"))).toBe(false);

    run.clock.now = new Date(start + 80 * HOUR + 5 * MINUTE);
    expect(await resume(run)).toEqual({ resumed: 1, busy: 0 });
    run.clock.now = new Date(start + 80 * HOUR + 6 * MINUTE);
    await run.renewal.runOnce();
    expect(sendsOf(run).map((sent) => sent.orderId)).toEqual([charge.chargeId, charge.chargeId]);
    expect(await trail(charge.chargeId)).toEqual([
      "REQUESTED", "REQUESTED:CHARGE_CONFIGURATION_REFUSED", "REQUESTED:CHARGE_RESUMED", "REQUESTED:RESEND_STARTED",
      "REQUESTED:CHARGE_CONFIGURATION_REFUSED"
    ]);
    // Held again, past the resumed day's end too: no further send, never closed, no M5.
    await tick(run, start, 80 * HOUR + 10 * MINUTE, 110 * HOUR);
    expect(sendsOf(run)).toHaveLength(2);
    expect((await trail(charge.chargeId)).at(-1)).toBe("REQUESTED:CHARGE_CONFIGURATION_REFUSED");
    expect(await emails(`M5A:${charge.chargeId}`)).toHaveLength(0);
    expect(await kindsOf(run)).not.toContain("PAST_DUE");
  }, 600_000);

  it("refused credentials: the key alarm, one O3 naming the resume command, and exactly one send in 72 hours", async () => {
    const run = await due();
    answerAll(run, () => paymentError("PAYMENT_CREDENTIALS_REFUSED", "401"));
    const start = run.clock.now.getTime();
    await tick(run, start, 0, 72 * HOUR);
    const charge = await renewalCharge(run);
    expect(sendsOf(run)).toHaveLength(1);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "REQUESTED:CHARGE_CREDENTIALS_REFUSED"]);
    expect(run.audit.events).toContainEqual({ event: "billing.payment.credentials_refused", fields: { operation: "charge" } });
    const alerts = await ownerAlerts("CHARGE_CREDENTIALS_REFUSED", `charge ${charge.chargeId}`);
    expect(alerts).toHaveLength(1);
    expect(String(alerts[0]?.payload["param.nextSteps"])).toContain("/usr/bin/pnpm billing:renewal-resume");
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", `charge ${charge.chargeId}`)).toHaveLength(0);
    expect(await emails(`M5A:${charge.chargeId}`)).toHaveLength(0);
    expect(await pendingHolds(run)).toBe(1);

    // Follow-up of B1: three days after the refusal the daily owner job reminds the owner, naming this charge and the
    // resume command (the count holds every renewal this file left held).
    const third = new Date(start + 72 * HOUR);
    expect(await remindHeldRenewals({
      repository: run.repository, jobs: new BillingJobQueries(database.pool), paymentEnvironment: "sandbox"
    }, third)).toBeGreaterThan(0);
    const reminders = await outboxRows(
      "kind = 'EMAIL' AND ref = $1 AND payload->>'param.reasonCode' = 'RENEWAL_HELD'", [`O3:RENEWAL_HELD:${third.toISOString().slice(0, 10)}`]
    );
    expect(reminders).toHaveLength(1);
    expect(String(reminders[0]!.payload["param.nextSteps"])).toContain(`charge ${charge.chargeId}: waiting since `);
    expect(String(reminders[0]!.payload["param.nextSteps"])).toContain("/usr/bin/pnpm billing:renewal-resume");
  }, 600_000);

  it("an unknown outcome whose resend our own setup refused stays held at the window's end on NO_SUCH_ORDER: no close, no M5, reads go on; a resume sends it once more", async () => {
    const run = await due();
    let fixed = false;
    let calls = 0;
    answerAll(run, (input) => {
      calls += 1;
      if (calls === 1) return paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout");
      return fixed ? report(input.orderId, "PENDING") : paymentError("PAYMENT_CONFIGURATION_REFUSED", "99");
    });
    // Renewed 5 hours late (still inside its 72 hours), so its refusal's O3 falls in an hour no other test of this
    // file uses (one O3 per code and hour); the window ends 72 hours past the due instant, 67 hours after `start`.
    const start = run.seeded.periodEnd.getTime() + 5 * HOUR;
    const windowEnd = run.seeded.periodEnd.getTime() + 72 * HOUR;
    await tick(run, start, 0, 66 * HOUR);
    const charge = await renewalCharge(run);
    const readsOf = () => run.payments.reads.filter((read) => read.orderId === charge.chargeId).length;
    expect(sendsOf(run)).toHaveLength(2);
    expect(await trail(charge.chargeId)).toEqual([
      "REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN", "REQUESTED:RESEND_STARTED", "REQUESTED:CHARGE_CONFIGURATION_REFUSED"
    ]);
    const readsBefore = readsOf();
    // Past the window's end: the fresh reads answer NO_SUCH_ORDER, and the held charge is not closed into the dunning.
    await tick(run, start, 66 * HOUR + 10 * MINUTE, 69 * HOUR);
    expect(sendsOf(run)).toHaveLength(2);
    expect(readsOf()).toBeGreaterThan(readsBefore);
    const lastRead = await run.repository.lastStatusRead(charge.chargeId);
    expect(lastRead).toMatchObject({ outcome: "NO_SUCH_ORDER" });
    expect(lastRead!.at.getTime()).toBeGreaterThanOrEqual(windowEnd);
    expect((await trail(charge.chargeId)).some((entry) => entry.startsWith("FAILED"))).toBe(false);
    expect(await kindsOf(run)).not.toContain("PAST_DUE");
    expect(await emails(`M5A:${charge.chargeId}`)).toHaveLength(0);
    const reference = `charge ${charge.chargeId}`;
    expect(await ownerAlerts("CHARGE_CONFIGURATION_REFUSED", reference)).toHaveLength(1);
    // The owner was told at the refusal: no second O3 at the window's end.
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", reference)).toHaveLength(0);

    // The owner fixed the setting and resumes (this also releases the renewals the tests above leave held).
    fixed = true;
    run.clock.now = new Date(start + 69 * HOUR + 5 * MINUTE);
    expect((await resume(run)).resumed).toBeGreaterThanOrEqual(1);
    run.clock.now = new Date(start + 69 * HOUR + 6 * MINUTE);
    await run.renewal.runOnce();
    expect(sendsOf(run).map((sent) => sent.orderId)).toEqual([charge.chargeId, charge.chargeId, charge.chargeId]);
    expect((await trail(charge.chargeId)).slice(-3)).toEqual(["REQUESTED:CHARGE_RESUMED", "REQUESTED:RESEND_STARTED", "SUBMITTED"]);
  }, 600_000);

  it("an outage is unchanged: resent on the 1, 5, 15, 60-minute backoff, then at the window's end NO_TRANSACTION and the dunning", async () => {
    const run = await due();
    const sentAt: number[] = [];
    answerAll(run, () => {
      sentAt.push(run.clock.now.getTime());
      return paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "ECONNREFUSED");
    });
    const start = run.clock.now.getTime();
    await tick(run, start, 0, 72 * HOUR + 10 * MINUTE);
    const charge = await renewalCharge(run);
    expect(sendsOf(run)).toHaveLength(sentAt.length);
    // Sampled every 10 minutes: the 1- and 5-minute waits end at the next tick, the 15-minute one two ticks later.
    const gaps = sentAt.slice(1).map((at, index) => (at - sentAt[index]!) / MINUTE);
    expect(gaps.slice(0, 3)).toEqual([10, 10, 20]);
    expect(new Set(gaps.slice(3))).toEqual(new Set([60]));
    expect(sentAt.length).toBeGreaterThanOrEqual(70);
    expect(await ownerAlerts("CHARGE_NOT_SENT", `charge ${charge.chargeId}`)).toHaveLength(0);
    expect((await trail(charge.chargeId)).at(-1)).toBe("FAILED:NO_TRANSACTION");
    expect((await kindsOf(run)).at(-1)).toBe("PAST_DUE");
    expect(await emails(`M5A:${charge.chargeId}`)).toHaveLength(1);
  }, 600_000);

  // Last in this describe: its resume also releases the renewals the tests above leave held.
  it("a refusal after the owner's resume gets its own O3 even in the same hour; before any resume, one O3 per code and hour", async () => {
    const first = await due();
    const second = await due();
    // Five minutes into the next whole hour, so everything below happens inside one hour.
    const hour = Math.ceil(first.clock.now.getTime() / HOUR) * HOUR;
    first.clock.now = new Date(hour + 5 * MINUTE);
    answerAll(first, () => paymentError("PAYMENT_CONFIGURATION_REFUSED", "99"));
    const charge = await renewNow(first);
    const reference = `charge ${charge.chargeId}`;
    expect(await ownerAlerts("CHARGE_CONFIGURATION_REFUSED", reference)).toHaveLength(1);
    // A second plan refused in the same hour, before any resume: no second email (one per code and hour).
    second.clock.now = new Date(hour + 10 * MINUTE);
    answerAll(second, () => paymentError("PAYMENT_CONFIGURATION_REFUSED", "99"));
    const other = await renewNow(second);
    expect(await trail(other.chargeId)).toEqual(["REQUESTED", "REQUESTED:CHARGE_CONFIGURATION_REFUSED"]);
    expect(await ownerAlerts("CHARGE_CONFIGURATION_REFUSED", `charge ${other.chargeId}`)).toHaveLength(0);
    // The owner resumes; NETOPIA refuses the resend again in the same hour: a second O3 says it waits again.
    first.clock.now = new Date(hour + 20 * MINUTE);
    expect((await resume(first)).resumed).toBeGreaterThanOrEqual(1);
    first.clock.now = new Date(hour + 21 * MINUTE);
    expect(await first.renewal.recoverOpenCharge(charge.chargeId)).toBe(true);
    expect((await trail(charge.chargeId)).slice(-3)).toEqual([
      "REQUESTED:CHARGE_RESUMED", "REQUESTED:RESEND_STARTED", "REQUESTED:CHARGE_CONFIGURATION_REFUSED"
    ]);
    const alerts = await ownerAlerts("CHARGE_CONFIGURATION_REFUSED", reference);
    expect(alerts).toHaveLength(2);
    expect(alerts.map((row) => row.ref)).toEqual([
      `O3:CHARGE_CONFIGURATION_REFUSED:${new Date(hour).toISOString().slice(0, 13)}`,
      `O3:CHARGE_CONFIGURATION_REFUSED:${new Date(hour).toISOString().slice(0, 13)}:r1`
    ]);
    // Every O3 of this code and hour: those two, and no third for the second plan.
    expect(await outboxRows("kind = 'EMAIL' AND ref LIKE $1", [
      `O3:CHARGE_CONFIGURATION_REFUSED:${new Date(hour).toISOString().slice(0, 13)}%`
    ])).toHaveLength(2);
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
    const [m5] = await emails(`M5A:${charge.chargeId}`);
    expect(m5?.payload).toMatchObject({ "param.bankAsked": "true" });
    expect(m5?.payload["param.confirmCard"]).toBeUndefined();
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
    run.payments.answer(run.email, (input) => report(input.orderId, "DECLINED", { declineCode: "20", bankDeclined: true }));
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
    run.payments.answer(run.email, (input) => report(input.orderId, "DECLINED", { declineCode: "20", bankDeclined: true }));
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

  it("makes no retry while an earlier attempt is still pending or authorised at NETOPIA, tells the owner once, and retries once it reads final", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const first = await renewNow(run);
    const reference = `charge ${first.chargeId}`;
    const renewalAttempts = async () => (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
      .filter((row) => row.kind === "RENEWAL").map((row) => row.attempt);
    const heldPending = () => run.audit.events.filter((entry) => entry.event === "billing.renewal.retry_held"
      && entry.fields.code === "EARLIER_ATTEMPT_PENDING");
    // The window ends on a fresh NO_SUCH_ORDER: attempt 1 closes NO_TRANSACTION and the dunning starts.
    run.payments.scriptStatus(first.chargeId, "NO_SUCH_ORDER");
    run.clock.now = new Date(run.seeded.periodEnd.getTime() + 72 * HOUR + MINUTE);
    expect(await run.renewal.recoverOpenCharge(first.chargeId)).toBe(true);
    expect((await trail(first.chargeId)).at(-1)).toBe("FAILED:NO_TRANSACTION");
    expect((await kindsOf(run)).at(-1)).toBe("PAST_DUE");
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", reference)).toHaveLength(0);
    // A day later the retry is due, but NETOPIA now reports attempt 1 AUTHORIZED: its money could still be taken.
    run.payments.scriptStatus(first.chargeId, report(first.chargeId, "AUTHORIZED"));
    run.clock.now = new Date(run.clock.now.getTime() + DAY + MINUTE);
    await run.maintenance.runOnce();
    expect(await renewalAttempts()).toEqual([1]);
    expect(heldPending()).toHaveLength(1);
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", reference)).toHaveLength(1);
    // Still PENDING on the next pass: still no retry, and no second O3.
    run.payments.scriptStatus(first.chargeId, report(first.chargeId, "PENDING"));
    run.clock.now = new Date(run.clock.now.getTime() + 11 * MINUTE);
    await run.maintenance.runOnce();
    expect(await renewalAttempts()).toEqual([1]);
    expect(heldPending()).toHaveLength(2);
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", reference)).toHaveLength(1);
    // A final unpaid state (EXPIRED): the retry is made, with a NEW orderID.
    run.payments.scriptStatus(first.chargeId, report(first.chargeId, "EXPIRED"));
    run.payments.answer(run.email, (input) => report(input.orderId, "PAID"));
    run.clock.now = new Date(run.clock.now.getTime() + 11 * MINUTE);
    await run.maintenance.runOnce();
    expect(await renewalAttempts()).toEqual([1, 2]);
    const retry = (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
      .find((row) => row.kind === "RENEWAL" && row.attempt === 2)!;
    expect(retry.chargeId).not.toBe(first.chargeId);
    expect(run.payments.chargesOf(retry.chargeId)).toHaveLength(1);
    expect(run.payments.chargesOf(first.chargeId)).toHaveLength(1);
    expect(run.payments.reads.filter((read) => read.orderId === first.chargeId)).toHaveLength(4);
    expect(heldPending()).toHaveLength(2);
    expect(await ownerAlerts("RENEWAL_OUTCOME_OPEN", reference)).toHaveLength(1);
  });
});

const customerEmails = (run: Due) => outboxRows("kind = 'EMAIL' AND payload->>'customer_id' = $1", [run.seeded.customerId]);
const refundedBeforeSeen = (chargeId: string) => ownerAlerts("RENEWAL_REFUNDED_BEFORE_SEEN", `charge ${chargeId}`);
const NEXT_STEPS = "NETOPIA reports this renewal's payment refunded (or cancelled) before the site saw it paid, so the"
  + " plan has ended and the person was not emailed. Tell them yourself; if they should keep the plan, they can"
  + " subscribe again.";
const renewalAttempts = async (run: Due) => (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
  .filter((row) => row.kind === "RENEWAL").map((row) => row.attempt);

describe("F2 a renewal NETOPIA reports refunded before the site saw it paid (money-1, ruling PR-55)", () => {
  /** The probe reads REFUNDED (SUBMITTED + VERIFY queued), then VERIFY runs once and again; returns what it wrote. */
  async function refundedThenVerified(run: Due, chargeId: string) {
    run.payments.scriptStatus(chargeId, report(chargeId, "REFUNDED"), report(chargeId, "REFUNDED"), report(chargeId, "REFUNDED"));
    run.clock.now = new Date(run.clock.now.getTime() + 2 * MINUTE);
    expect(await run.renewal.recoverOpenCharge(chargeId)).toBe(true);
    expect((await trail(chargeId)).at(-1)).toBe("SUBMITTED");
    expect(await verifyJobs(chargeId)).toHaveLength(1);
    const emailsBefore = (await customerEmails(run)).length;
    const { verify, audit } = netopiaVerifyHandler(database.pool, { payments: run.payments, clock: () => run.clock.now });
    expect(await verify.handle(verifyJob(chargeId, run.clock.now), run.clock.now)).toEqual({ kind: "DONE" });
    // The money is recorded as NETOPIA reports it: paid, then refunded in NETOPIA's admin.
    expect((await trail(chargeId)).slice(-3)).toEqual(["SUCCEEDED", "REFUND_REQUESTED:PROVIDER_REFUND", "REFUNDED:PROVIDER_REFUND"]);
    const state = foldSubscription(await run.repository.subscriptionEvents(run.seeded.subscriptionId));
    expect(state).toMatchObject({ status: "ENDED", endedCause: "DUNNING" });
    expect(await run.entitlements.current(run.ownerRef, run.clock.now)).toMatchObject({ planId: "FREE", cause: "ENDED_DUNNING" });
    expect(await customerEmails(run)).toHaveLength(emailsBefore);
    const alerts = await refundedBeforeSeen(chargeId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.ref).toBe(`O3:${chargeId}:RENEWAL_REFUNDED_BEFORE_SEEN`);
    expect(alerts[0]!.payload).toMatchObject({ recipient: "OWNER", "param.paymentAlert": "true", "param.nextSteps": NEXT_STEPS });
    // A second VERIFY queues nothing more and writes nothing more.
    const rows = (await trail(chargeId)).length;
    const events = (await kindsOf(run)).length;
    expect(await verify.handle(verifyJob(chargeId, run.clock.now), run.clock.now)).toEqual({ kind: "DONE" });
    expect(await trail(chargeId)).toHaveLength(rows);
    expect(await kindsOf(run)).toHaveLength(events);
    expect(await refundedBeforeSeen(chargeId)).toHaveLength(1);
    expect(await customerEmails(run)).toHaveLength(emailsBefore);
    return { audit, state };
  }

  it("attempt 1 (SUBMIT_UNKNOWN, then REFUNDED): the ACTIVE plan ends, no customer email, one O3, and the month is never charged again", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const charge = await renewNow(run);
    expect(await trail(charge.chargeId)).toEqual(["REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN"]);
    const { audit } = await refundedThenVerified(run, charge.chargeId);
    expect(audit.events.filter((entry) => entry.event === "billing.renewal.refunded_before_seen"))
      .toEqual([{ event: "billing.renewal.refunded_before_seen", fields: { attempt: 1 } }]);
    // Days later: neither the renewal nor the maintenance pass charges this plan again.
    run.clock.now = new Date(run.clock.now.getTime() + 10 * DAY);
    expect(await run.renewal.renew(run.seeded.subscriptionId)).not.toBe("charged");
    await run.maintenance.runOnce();
    expect(await renewalAttempts(run)).toEqual([1]);
    expect(run.payments.charges.filter((sent) => sent.payer.email === run.email)).toHaveLength(1);
  });

  it("attempt 2 on a PAST_DUE plan: the plan ends the same way; no attempt 3, and the refunded attempt never holds a retry as paid", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "DECLINED", { declineCode: "20", bankDeclined: true }));
    await renewNow(run);
    expect((await kindsOf(run)).at(-1)).toBe("PAST_DUE");
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    run.clock.now = new Date(run.clock.now.getTime() + DAY + MINUTE);
    await run.maintenance.runOnce();
    const retry = (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
      .find((row) => row.kind === "RENEWAL" && row.attempt === 2);
    expect(retry).toBeDefined();
    expect(await trail(retry!.chargeId)).toEqual(["REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN"]);
    const customerEmailsBefore = (await customerEmails(run)).length;
    const { audit, state } = await refundedThenVerified(run, retry!.chargeId);
    expect(await customerEmails(run)).toHaveLength(customerEmailsBefore);
    expect(audit.events.filter((entry) => entry.event === "billing.renewal.refunded_before_seen"))
      .toEqual([{ event: "billing.renewal.refunded_before_seen", fields: { attempt: 2 } }]);
    // Defence in depth: an attempt whose payment was refunded in full is never an earlier attempt "paid".
    expect(await run.renewal.earlierAttemptPaid(state, retry!.periodStart, 3, run.clock.now)).toBe("NONE");
    // The next maintenance passes make no attempt 3 and never hold a retry as EARLIER_ATTEMPT_PAID.
    run.clock.now = new Date(run.clock.now.getTime() + 3 * DAY);
    await run.maintenance.runOnce();
    run.clock.now = new Date(run.clock.now.getTime() + 5 * DAY);
    await run.maintenance.runOnce();
    expect(await renewalAttempts(run)).toEqual([1, 2]);
    expect(run.audit.events.filter((entry) => entry.event === "billing.renewal.retry_held"
      && entry.fields.code === "EARLIER_ATTEMPT_PAID")).toEqual([]);
  });

  it("attempt 1 whose plan a dispute paused before the REFUNDED read: no plan changes, and the O3 says no plan changed", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const charge = await renewNow(run);
    const chargeId = charge.chargeId;
    expect(await trail(chargeId)).toEqual(["REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN"]);
    // The plan moves off this charge's month first: one legal event (the fold allows SUSPENDED from ACTIVE), written
    // under the owner lock as every billing writer does.
    const jobs = new BillingJobQueries(database.pool);
    await run.repository.withTransaction(async (client) => {
      await jobs.lockOwner(client, run.ownerRef);
      const state = foldSubscription(await run.repository.subscriptionEvents(run.seeded.subscriptionId, client));
      expect(state.status).toBe("ACTIVE");
      await run.repository.appendSubscriptionEvent(client, subscriptionEvent(state, "SUSPENDED", run.clock.now, {
        charge_id: run.seeded.initialChargeId
      }));
    });
    const eventsBefore = await kindsOf(run);
    expect(eventsBefore.at(-1)).toBe("SUSPENDED");
    run.payments.scriptStatus(chargeId, report(chargeId, "REFUNDED"), report(chargeId, "REFUNDED"), report(chargeId, "REFUNDED"));
    run.clock.now = new Date(run.clock.now.getTime() + 2 * MINUTE);
    expect(await run.renewal.recoverOpenCharge(chargeId)).toBe(true);
    expect((await trail(chargeId)).at(-1)).toBe("SUBMITTED");
    expect(await verifyJobs(chargeId)).toHaveLength(1);
    const emailsBefore = (await customerEmails(run)).length;
    const { verify, audit } = netopiaVerifyHandler(database.pool, { payments: run.payments, clock: () => run.clock.now });
    expect(await verify.handle(verifyJob(chargeId, run.clock.now), run.clock.now)).toEqual({ kind: "DONE" });
    // The money is recorded as NETOPIA reports it, and nothing about the plan changes (no PAST_DUE, no ENDED).
    expect((await trail(chargeId)).slice(-3)).toEqual(["SUCCEEDED", "REFUND_REQUESTED:PROVIDER_REFUND", "REFUNDED:PROVIDER_REFUND"]);
    expect(await kindsOf(run)).toEqual(eventsBefore);
    expect(foldSubscription(await run.repository.subscriptionEvents(run.seeded.subscriptionId))).toMatchObject({ status: "SUSPENDED" });
    expect(await customerEmails(run)).toHaveLength(emailsBefore);
    const alerts = await refundedBeforeSeen(chargeId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.ref).toBe(`O3:${chargeId}:RENEWAL_REFUNDED_BEFORE_SEEN`);
    expect(alerts[0]!.payload).toMatchObject({
      recipient: "OWNER", "param.paymentAlert": "true",
      "param.nextSteps": `NETOPIA reports this renewal's payment (NETOPIA payment ${report(chargeId, "REFUNDED").providerPaymentId})`
        + " refunded (or cancelled) before the site saw it paid. Its plan was not active or past due on the month this"
        + " payment renewed (it had ended, was paused by a dispute, or was already renewed), so no plan changed and the"
        + " person was not emailed. Look at the plan and this payment in NETOPIA's admin; tell the person yourself if they"
        + " need to know."
    });
    expect(audit.events.filter((entry) => entry.event === "billing.renewal.refunded_before_seen"))
      .toEqual([{ event: "billing.renewal.refunded_before_seen", fields: { attempt: 1 } }]);
    // A second VERIFY writes and queues nothing.
    const rows = (await trail(chargeId)).length;
    expect(await verify.handle(verifyJob(chargeId, run.clock.now), run.clock.now)).toEqual({ kind: "DONE" });
    expect(await trail(chargeId)).toHaveLength(rows);
    expect(await kindsOf(run)).toEqual(eventsBefore);
    expect(await refundedBeforeSeen(chargeId)).toHaveLength(1);
    expect(await customerEmails(run)).toHaveLength(emailsBefore);
    expect(audit.events.filter((entry) => entry.event === "billing.renewal.refunded_before_seen")).toHaveLength(1);
  });
});

describe("F8 a renewal whose first state NETOPIA reports is VOIDED, never seen paid (ruling PR-56)", () => {
  /**
   * After the period's charge, attempt 1 or a retry, answered SUBMIT_UNKNOWN: the money never moved (FAILED(VOIDED)),
   * and the plan ends as a refunded-before-seen renewal's does, with no customer email, one O3 and no retry ever.
   */
  async function endsWithoutDunning(run: Due, chargeId: string, emailsBefore: number, audit: RecordingAudit, attempt: number) {
    expect((await trail(chargeId)).slice(-2)).toEqual(["SUBMITTED", "FAILED:VOIDED"]);
    const state = foldSubscription(await run.repository.subscriptionEvents(run.seeded.subscriptionId));
    expect(state).toMatchObject({ status: "ENDED", endedCause: "DUNNING" });
    expect(await run.entitlements.current(run.ownerRef, run.clock.now)).toMatchObject({ planId: "FREE", cause: "ENDED_DUNNING" });
    expect(await customerEmails(run)).toHaveLength(emailsBefore);
    const alerts = await refundedBeforeSeen(chargeId);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.ref).toBe(`O3:${chargeId}:RENEWAL_REFUNDED_BEFORE_SEEN`);
    expect(alerts[0]!.payload).toMatchObject({ recipient: "OWNER", "param.paymentAlert": "true", "param.nextSteps": NEXT_STEPS });
    expect(audit.events.filter((entry) => entry.event === "billing.renewal.refunded_before_seen"))
      .toEqual([{ event: "billing.renewal.refunded_before_seen", fields: { attempt, voided: true } }]);
    expect(audit.events).toContainEqual({ event: "billing.payment.failed", fields: { chargeKind: "RENEWAL", code: "VOIDED" } });
    // A later VERIFY (a status-4 notice, say) writes and queues nothing more.
    const rows = (await trail(chargeId)).length;
    const events = (await kindsOf(run)).length;
    run.payments.scriptStatus(chargeId, report(chargeId, "VOIDED"));
    const { verify } = netopiaVerifyHandler(database.pool, { payments: run.payments, clock: () => run.clock.now });
    expect(await verify.handle(verifyJob(chargeId, run.clock.now), run.clock.now)).toEqual({ kind: "DONE" });
    expect(await trail(chargeId)).toHaveLength(rows);
    expect(await kindsOf(run)).toHaveLength(events);
    expect(await refundedBeforeSeen(chargeId)).toHaveLength(1);
    expect(await customerEmails(run)).toHaveLength(emailsBefore);
    // Days later: no maintenance pass makes another charge for this plan.
    const attempts = await renewalAttempts(run);
    for (const days of [1, 3, 7]) {
      run.clock.now = new Date(run.clock.now.getTime() + days * DAY + MINUTE);
      await run.maintenance.runOnce();
    }
    expect(await run.renewal.renew(run.seeded.subscriptionId)).not.toBe("charged");
    expect(await renewalAttempts(run)).toEqual(attempts);
    expect(run.payments.charges.filter((sent) => sent.payer.email === run.email)).toHaveLength(attempts.length);
    expect(await customerEmails(run)).toHaveLength(emailsBefore);
  }

  it("attempt 1 (SUBMIT_UNKNOWN, a PENDING probe, then VERIFY reads VOIDED): the plan ends, no customer email, one O3, no retry", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const charge = await renewNow(run);
    const chargeId = charge.chargeId;
    expect(await trail(chargeId)).toEqual(["REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN"]);
    run.payments.scriptStatus(chargeId, report(chargeId, "PENDING"));
    run.clock.now = new Date(run.clock.now.getTime() + 2 * MINUTE);
    expect(await run.renewal.recoverOpenCharge(chargeId)).toBe(true);
    expect((await trail(chargeId)).at(-1)).toBe("SUBMITTED");
    expect(await verifyJobs(chargeId)).toHaveLength(1);
    const emailsBefore = (await customerEmails(run)).length;
    run.payments.scriptStatus(chargeId, report(chargeId, "VOIDED"));
    const { verify, audit } = netopiaVerifyHandler(database.pool, { payments: run.payments, clock: () => run.clock.now });
    expect(await verify.handle(verifyJob(chargeId, run.clock.now), run.clock.now)).toEqual({ kind: "DONE" });
    await endsWithoutDunning(run, chargeId, emailsBefore, audit, 1);
  });

  it("attempt 1 (SUBMIT_UNKNOWN, then the renewal's own probe reads VOIDED, then VERIFY): the same, without a VERIFY", async () => {
    const run = await due();
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const charge = await renewNow(run);
    const chargeId = charge.chargeId;
    const emailsBefore = (await customerEmails(run)).length;
    run.payments.scriptStatus(chargeId, report(chargeId, "VOIDED"));
    run.clock.now = new Date(run.clock.now.getTime() + 2 * MINUTE);
    expect(await run.renewal.recoverOpenCharge(chargeId)).toBe(true);
    await endsWithoutDunning(run, chargeId, emailsBefore, run.audit, 1);
  });

  it("a dunning retry (attempt 2 on a PAST_DUE plan) read VOIDED: the dunning does not go on; the plan ends the same way", async () => {
    const run = await due();
    run.payments.answer(run.email, (input) => report(input.orderId, "DECLINED", { declineCode: "20", bankDeclined: true }));
    await renewNow(run);
    expect((await kindsOf(run)).at(-1)).toBe("PAST_DUE");
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    run.clock.now = new Date(run.clock.now.getTime() + DAY + MINUTE);
    await run.maintenance.runOnce();
    const retry = (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
      .find((row) => row.kind === "RENEWAL" && row.attempt === 2)!;
    expect(await trail(retry.chargeId)).toEqual(["REQUESTED", "SUBMIT_UNKNOWN:CHARGE_OUTCOME_UNKNOWN"]);
    const emailsBefore = (await customerEmails(run)).length;
    run.payments.scriptStatus(retry.chargeId, report(retry.chargeId, "PENDING"));
    run.clock.now = new Date(run.clock.now.getTime() + 2 * MINUTE);
    expect(await run.renewal.recoverOpenCharge(retry.chargeId)).toBe(true);
    run.payments.scriptStatus(retry.chargeId, report(retry.chargeId, "VOIDED"));
    const { verify, audit } = netopiaVerifyHandler(database.pool, { payments: run.payments, clock: () => run.clock.now });
    expect(await verify.handle(verifyJob(retry.chargeId, run.clock.now), run.clock.now)).toEqual({ kind: "DONE" });
    await endsWithoutDunning(run, retry.chargeId, emailsBefore, audit, 2);
  });
});

// Kept last: its 72-hour tick runs `runOnce` over every plan of this file's database, through this test's own port.
describe("B1 at most 2 saved-card sends per card in 24 hours (NETOPIA Q22)", () => {
  /** This payer's saved-card calls, in the order they were made (the port also serves the file's other plans). */
  const sendsOf = (run: Due) => run.payments.charges.filter((sent) => sent.payer.email === run.email);
  const capped = (run: Due) => run.audit.events.filter((entry) => entry.event === "billing.renewal.send_capped");

  it("an unknown outcome: never more than 2 sends in any 24 hours, and a third only once the first is more than a day old", async () => {
    const run = await due();
    const sentAt: number[] = [];
    for (let call = 0; call < 100; call += 1) {
      run.payments.answer(run.email, () => {
        sentAt.push(run.clock.now.getTime());
        return paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout");
      });
    }
    // The 60-second tick, sampled every 10 minutes for 72 hours: the renewal, its probes and its resends.
    const start = run.clock.now.getTime();
    for (let elapsed = 0; elapsed <= 72 * HOUR; elapsed += 10 * MINUTE) {
      run.clock.now = new Date(start + elapsed);
      await run.renewal.runOnce();
    }
    expect(sendsOf(run)).toHaveLength(sentAt.length);
    // Not vacuous: the renewal went out, was resent, and was resent again a day later.
    expect(sentAt.length).toBeGreaterThanOrEqual(3);
    for (const [index, sent] of sentAt.entries()) {
      // Every 24-hour span ending at a send (both ends included, as `since` is) holds at most 2 sends.
      const inSpan = sentAt.filter((other) => other <= sent && sent - other <= DAY);
      expect(inSpan.length, `send ${index} at +${(sent - start) / MINUTE} min`).toBeLessThanOrEqual(2);
    }
    expect(sentAt[2]! - sentAt[0]!).toBeGreaterThan(DAY);
    // Each capped charge says so with a content-free line (at most one an hour, C1).
    expect(capped(run).length).toBeGreaterThan(0);
    expect(capped(run)[0]!.fields).toEqual({ attempt: 1 });
    const charge = (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
      .filter((row) => row.kind === "RENEWAL");
    expect(charge.map((row) => row.attempt)).toEqual([1]);
  }, 600_000);

  it("a card change on a day the old card already used both sends: the new card is charged at once (Review Focus 6)", async () => {
    const run = await due();
    // Send 1: the answer is lost. Send 2, the resend 31 minutes later: declined, code 20 (retried by itself, B2).
    run.payments.answer(run.email, () => paymentError("PAYMENT_OUTCOME_UNKNOWN", "timeout"));
    const first = await renewNow(run);
    const unknownAt = run.clock.now.getTime();
    run.payments.answer(run.email, (input) => report(input.orderId, "DECLINED", { declineCode: "20", bankDeclined: true }));
    run.clock.now = new Date(unknownAt + 31 * MINUTE);
    expect(await run.renewal.recoverOpenCharge(first.chargeId)).toBe(true);
    expect((await trail(first.chargeId)).slice(-3)).toEqual(["REQUESTED:RESEND_STARTED", "SUBMITTED", "FAILED:PAYMENT_DECLINED"]);
    expect((await kindsOf(run)).at(-1)).toBe("PAST_DUE");
    expect(sendsOf(run)).toHaveLength(2);
    const jobs = new BillingJobQueries(database.pool);
    const changeCard = async (cardTokenId: string) => run.repository.withTransaction(async (client) => {
      await jobs.lockOwner(client, run.ownerRef);
      const state = foldSubscription(await run.repository.subscriptionEvents(run.seeded.subscriptionId, client));
      await run.repository.appendSubscriptionEvent(client, subscriptionEvent(state, "CARD_CHANGED", run.clock.now,
        { retry_now: true }, { cardTokenId }));
    });
    // Control: the person confirms the SAME card, asking for a retry now. Its 2 sends of the last hour hold it.
    run.clock.now = new Date(unknownAt + 40 * MINUTE);
    await changeCard(run.seeded.cardTokenId);
    run.clock.now = new Date(unknownAt + 41 * MINUTE);
    await run.maintenance.runOnce();
    expect(await renewalAttempts(run)).toEqual([1]);
    expect(sendsOf(run)).toHaveLength(2);
    expect(run.audit.events.filter((entry) => entry.event === "billing.renewal.retry_held"
      && entry.fields.code === "SAVED_CARD_DAILY_LIMIT")).toHaveLength(1);
    // C1: the capped line is written once per plan, attempt and hour: two more capped asks in this hour write none.
    const cappedRetry = () => capped(run).filter((entry) => entry.fields.attempt === 2);
    expect(cappedRetry()).toHaveLength(1);
    const pastDue = foldSubscription(await run.repository.subscriptionEvents(run.seeded.subscriptionId));
    expect(await run.renewal.savedCardSendAllowed(pastDue, run.clock.now, 2)).toBe(false);
    expect(await run.renewal.savedCardSendAllowed(pastDue, run.clock.now, 2)).toBe(false);
    expect(cappedRetry()).toHaveLength(1);
    // A NEW card, stored now: its sends count from its storage, so the retry charges it at once.
    run.clock.now = new Date(unknownAt + 45 * MINUTE);
    const newTokenId = randomUUID();
    const newToken = ["tok", "changed", newTokenId.slice(0, 8)].join("-");
    const sealed = sealCardToken(TEST_RECORDS_KEY, newTokenId, testCardToken(newToken));
    await run.repository.withTransaction((client) => run.repository.insertCardToken(client, {
      tokenId: newTokenId, customerId: run.seeded.customerId, paymentProvider: "netopia", paymentEnvironment: "sandbox",
      // A card change brings its card from a payment of its own; any charge of the plan stands in for it here.
      sourceChargeId: run.seeded.initialChargeId, sourceToolOrder: null, sourceNoticeId: null, sourcePaidAt: run.clock.now,
      tokenCiphertext: sealed.ciphertext, keyId: sealed.keyId, expMonth: 12, expYear: 2031, last4: "4343",
      cardCountry: "RO", createdAt: run.clock.now
    }));
    await changeCard(newTokenId);
    run.payments.answer(run.email, (input) => report(input.orderId, "PENDING"));
    run.clock.now = new Date(unknownAt + 46 * MINUTE);
    await run.maintenance.runOnce();
    expect(await renewalAttempts(run)).toEqual([1, 2]);
    const retry = (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
      .find((row) => row.kind === "RENEWAL" && row.attempt === 2)!;
    expect(run.payments.chargesOf(retry.chargeId)).toHaveLength(1);
    expect(run.payments.chargesOf(retry.chargeId)[0]!.cardToken.reveal()).toBe(newToken);
    expect(sendsOf(run)).toHaveLength(3);
  });

  it("an outage is not counted: four calls that never reached NETOPIA, then the fifth goes out", async () => {
    const run = await due();
    for (let call = 0; call < 4; call += 1) {
      run.payments.answer(run.email, () => paymentError("PAYMENT_PROVIDER_UNAVAILABLE", "429"));
    }
    run.payments.answer(run.email, (input) => report(input.orderId, "PENDING"));
    const charge = await renewNow(run);
    const firstAt = run.clock.now.getTime();
    // The not-sent backoff: 1, 5, 15, then 60 minutes after each not-sent call.
    for (const minutes of [1, 1 + 5, 1 + 5 + 15, 1 + 5 + 15 + 60]) {
      run.clock.now = new Date(firstAt + minutes * MINUTE);
      expect(await run.renewal.recoverOpenCharge(charge.chargeId)).toBe(true);
    }
    expect(run.payments.chargesOf(charge.chargeId)).toHaveLength(5);
    expect(await trail(charge.chargeId)).toEqual([
      "REQUESTED", "REQUESTED:CHARGE_NOT_SENT",
      "REQUESTED:RESEND_STARTED", "REQUESTED:CHARGE_NOT_SENT",
      "REQUESTED:RESEND_STARTED", "REQUESTED:CHARGE_NOT_SENT",
      "REQUESTED:RESEND_STARTED", "REQUESTED:CHARGE_NOT_SENT",
      "REQUESTED:RESEND_STARTED", "SUBMITTED"
    ]);
    expect(capped(run)).toEqual([]);
  });

  /**
   * Two counted sends of this plan's card at `first` and `second` (an answer lost, then a resend NETOPIA declined), on
   * a RENEWAL charge of the CURRENT month: the stand-in for an earlier renewal's sends, which the period's own renewal
   * never reads as its own charge.
   */
  async function seedTwoSends(run: Due, first: Date, second: Date): Promise<void> {
    const quoteId = randomUUID();
    const chargeId = randomUUID().replaceAll("-", "");
    const location = sealQuoteLocation(TEST_RECORDS_KEY, quoteId, {
      name: null, country: "RO", region: null, postalCode: null, city: null, street: null, ip: "192.0.2.10", ipCountry: "RO",
      company: null
    });
    await run.repository.withTransaction(async (client) => {
      await run.repository.insertQuote(client, {
        quoteId, ownerRef: run.ownerRef, planId: "PLUS", kind: "RENEWAL", netMicros: 20_000_000, taxMicros: 4_200_000,
        totalMicros: 24_200_000, taxCountry: "RO", taxRegion: null, taxRateBasisPoints: 2_100, taxStatus: "TAXABLE",
        taxName: "VAT", quadernoRef: null, createdAt: first, expiresAt: new Date(first.getTime() + 30 * MINUTE),
        locationCiphertext: location.ciphertext, keyId: location.keyId, recurringTotalMicros: null, currency: "USD"
      });
      await run.repository.insertCharge(client, {
        chargeId, ownerRef: run.ownerRef, subscriptionId: run.seeded.subscriptionId, kind: "RENEWAL", attempt: 1,
        periodStart: run.seeded.periodStart, periodEnd: run.seeded.periodEnd, quoteId, netMicros: 20_000_000,
        taxMicros: 4_200_000, totalMicros: 24_200_000, currency: "USD", createdAt: first, paymentProvider: "netopia",
        paymentEnvironment: "sandbox"
      });
      const fields = (errorCode: string | null, providerPaymentId: string | null = null) =>
        ({ providerPaymentId, amountMicros: 24_200_000, errorCode });
      for (const event of [
        chargeEvent(chargeId, "REQUESTED", first, fields(null)),
        chargeEvent(chargeId, "SUBMIT_UNKNOWN", first, fields("CHARGE_OUTCOME_UNKNOWN")),
        chargeEvent(chargeId, "REQUESTED", second, fields("RESEND_STARTED")),
        chargeEvent(chargeId, "SUBMITTED", second, fields(null, `ntp-${chargeId.slice(0, 16)}`)),
        chargeEvent(chargeId, "FAILED", second, fields("PAYMENT_DECLINED", `ntp-${chargeId.slice(0, 16)}`))
      ]) {
        await run.repository.appendChargeEvent(client, event);
      }
    });
  }

  it("a renewal due on a day its card already made 2 sends is held (Q-1), and charged once the first is more than a day old", async () => {
    const run = await due();
    const dueAt = run.clock.now.getTime();
    await seedTwoSends(run, new Date(dueAt - 2 * HOUR), new Date(dueAt - HOUR));
    expect(await run.renewal.renew(run.seeded.subscriptionId)).toBe("skipped");
    expect(await renewalAttempts(run)).toEqual([1]);
    expect(sendsOf(run)).toHaveLength(0);
    expect(capped(run).map((entry) => entry.fields)).toEqual([{ attempt: 1 }]);
    expect(run.audit.events).toContainEqual({ event: "billing.renewal.pending", fields: { code: "SAVED_CARD_DAILY_LIMIT" } });
    expect(await run.entitlements.current(run.ownerRef, run.clock.now)).toMatchObject({ cause: "RENEWAL_PENDING" });
    // At 24 hours after the first send it still counts (the span includes both ends).
    run.clock.now = new Date(dueAt + 22 * HOUR);
    expect(await run.renewal.renew(run.seeded.subscriptionId)).toBe("skipped");
    expect(sendsOf(run)).toHaveLength(0);
    run.clock.now = new Date(dueAt + 22 * HOUR + MINUTE);
    expect(await run.renewal.renew(run.seeded.subscriptionId)).toBe("charged");
    expect(sendsOf(run)).toHaveLength(1);
    const renewal = (await run.repository.chargesForSubscription(run.seeded.subscriptionId))
      .find((row) => row.kind === "RENEWAL" && row.periodStart.getTime() === run.seeded.periodEnd.getTime());
    expect(renewal).toBeDefined();
    expect(sendsOf(run)[0]!.orderId).toBe(renewal!.chargeId);
  });
});
