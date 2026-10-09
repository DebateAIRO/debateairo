// tests/integration/billing-netopia-intake.test.ts
// N9 (spec 2026-10-05 §2.7.3-2.7.4, §2.20.2 "the intake"): NETOPIA's message stored before the answer, the saved card
// kept, the quarantine and the restart re-check, the provider-only mode, admission after verification.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PoolClient } from "pg";
import { buildApi } from "@debateai/api";
import { openRecord } from "@debateai/crypto";
import { BillingJobQueries, BillingRepository, migrate } from "@debateai/db";
import type { AdmissionLimiter } from "../../apps/api/src/admission.js";
import { NETOPIA_NOTIFY_PATH } from "../../apps/api/src/billing/index.js";
import { NetopiaNoticeIntake, type NetopiaIntakeMode, type NoticeArrival } from "../../apps/api/src/billing/netopia-intake.js";
import { openCardToken } from "../../apps/api/src/billing/records.js";
import { newChargeId } from "../../apps/api/src/billing/rows.js";
import { testBillingPlans, unusedAskApplication } from "../support/billingFixtures.js";
import { recordingAudit, TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { signedNetopiaNotice, testNetopiaKeys } from "../support/netopia-notice.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

const POS = ["NT9A", "B2C3", "D4E5", "F6G7", "H8J9"].join("-");
const TOKEN = ["tok", "n9", "4f1c2b"].join("-");
const OK = "{\"errorType\":0,\"errorCode\":0,\"errorMessage\":\"OK\"}";
const KEYS = testNetopiaKeys();
const WRONG_KEYS = testNetopiaKeys();
/** Every case has its own hour (O4 is once an hour), all after the messages' operationDate 09:58Z. */
const hour = (offset: number): Date => new Date(Date.UTC(2026, 9, 6, 10 + offset));

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

function body(orderId: string, payment: Readonly<Record<string, unknown>> = {}): object {
  return {
    payment: {
      method: "card", ntpID: "1234567", status: 3, amount: 24.2, currency: "USD", code: "00", message: "Approved",
      binding: { token: TOKEN, expireMonth: 11, expireYear: 2030 }, instrument: { panMasked: "9****5098", country: 642 },
      operationDate: "2026-10-06T09:58:00Z", ...payment
    },
    order: { orderID: orderId }
  };
}
const sign = (content: object | Buffer, keys = KEYS) => signedNetopiaNotice({ privateKey: keys.privateKey, posSignature: POS, body: content });
const arrival = (signed: Readonly<{ rawBody: Buffer; header: string }>, now: Date, admit?: () => boolean): NoticeArrival =>
  ({ rawBody: signed.rawBody, header: signed.header, sourceKey: "198.51.100.0/24", now, ...(admit === undefined ? {} : { admit }) });

function intakeFor(options: Partial<{ mode: NetopiaIntakeMode; keys: typeof KEYS; storeDown: true }> = {}) {
  const audit = recordingAudit();
  const kick = vi.fn();
  const store = options.storeDown === undefined ? repository : Object.assign(Object.create(repository) as BillingRepository, {
    withTransaction: async () => { throw new Error("the database is unreachable"); }
  });
  const intake = new NetopiaNoticeIntake({
    repository: store, jobs, trust: (options.keys ?? KEYS).trust(POS), recordsKey: TEST_RECORDS_KEY,
    paymentEnvironment: "sandbox", mode: options.mode ?? "ON", audit, kick
  });
  return { intake, audit, kick };
}

/** An open charge of ours (a card check: no quote, nothing settled), its owner's customer created. */
async function openCharge(environment: "sandbox" | "live" = "sandbox") {
  const ownerRef = randomUUID();
  const chargeId = newChargeId();
  const at = new Date("2026-10-06T08:00:00.000Z");
  const customerId = await repository.withTransaction(async (client: PoolClient) => {
    const customer = await repository.ensureCustomer(client, { ownerRef, locale: "en", now: at });
    await repository.insertCharge(client, {
      chargeId, ownerRef, subscriptionId: randomUUID(), kind: "CARD_CHECK", attempt: 1, periodStart: at,
      periodEnd: new Date(at.getTime() + 30 * 86_400_000), quoteId: null, netMicros: 0, taxMicros: 0, totalMicros: 0,
      currency: "USD", createdAt: at, paymentProvider: "netopia", paymentEnvironment: environment
    });
    return customer.customerId;
  });
  return { chargeId, customerId };
}

const query = async <T extends Record<string, unknown>>(sql: string, values: unknown[]): Promise<T[]> =>
  (await database.pool.query<T>(sql, values)).rows;
const noticesFor = (orderId: string) => query<{ notice_id: string; payment_environment: string; provider_status: number;
  provider_payment_id: string; amount_text: string; card_country: string; key_fingerprint: string; allowed_ciphertext: Buffer }>(
  `SELECT notice_id, payment_environment, provider_status, provider_payment_id, amount_text, card_country, key_fingerprint,
     allowed_ciphertext FROM billing.payment_notice WHERE order_id = $1 ORDER BY received_at`, [orderId]);
const outcomesOf = async (noticeId: string) => (await query<{ outcome: string }>(
  "SELECT outcome FROM billing.payment_notice_outcome WHERE notice_id = $1 ORDER BY at, outcome", [noticeId])).map((row) => row.outcome);
const tokensFor = (column: "source_charge_id" | "source_tool_order", value: string) => query<{ token_id: string;
  customer_id: string | null; source_notice_id: string; source_paid_at: Date; token_ciphertext: Buffer; last4: string;
  exp_month: number; exp_year: number; card_country: string; payment_environment: string }>(
  `SELECT token_id, customer_id, source_notice_id, source_paid_at, token_ciphertext, last4, exp_month, exp_year, card_country,
     payment_environment FROM billing.card_token WHERE ${column} = $1`, [value]);
const jobsFor = (ref: string) => query<{ kind: string; not_before: Date; payload: Record<string, unknown> }>(
  "SELECT kind, not_before, payload FROM billing.outbox WHERE ref = $1 ORDER BY created_at", [ref]);
const ownerMails = (template: "O3" | "O4", contains: string) => query<{ ref: string; payload: Record<string, unknown> }>(
  "SELECT ref, payload FROM billing.outbox WHERE kind = 'EMAIL' AND payload->>'template' = $1 AND payload::text LIKE $2",
  [template, `%${contains}%`]);
const quarantineFor = (orderId: string) => query<{ quarantine_id: string; reason: string; raw_ciphertext: Buffer;
  header_ciphertext: Buffer | null }>(
  "SELECT quarantine_id, reason, raw_ciphertext, header_ciphertext FROM billing.notice_quarantine WHERE order_id = $1", [orderId]);

describe("N9 NETOPIA's verified message", () => {
  it("stores the notice, its bytes and its saved card in one transaction, queues VERIFY_PAYMENT, then answers OK", async () => {
    const { chargeId, customerId } = await openCharge();
    const { intake, kick } = intakeFor();
    const message = sign(body(chargeId));
    expect(await intake.receive(arrival(message, hour(0)))).toEqual({ status: 200, body: OK });
    const [notice, ...more] = await noticesFor(chargeId);
    expect(more).toEqual([]);
    expect(notice).toMatchObject({
      payment_environment: "sandbox", provider_status: 3, provider_payment_id: "1234567", amount_text: "24.2",
      card_country: "RO", key_fingerprint: KEYS.trust(POS).keys[0]!.fingerprint
    });
    expect(await outcomesOf(notice!.notice_id)).toEqual(["APPLIED"]);
    const allowed = openRecord(TEST_RECORDS_KEY, { table: "billing.payment_notice", column: "allowed_ciphertext", rowId: notice!.notice_id },
      notice!.allowed_ciphertext).toString("utf8");
    expect(JSON.parse(allowed)).toMatchObject({ orderID: chargeId, ntpID: "1234567", last4: "5098" });
    expect(allowed).not.toContain(TOKEN);
    const [raw] = await query<{ raw_ciphertext: Buffer }>("SELECT raw_ciphertext FROM billing.payment_notice_raw WHERE notice_id = $1", [notice!.notice_id]);
    expect(openRecord(TEST_RECORDS_KEY, { table: "billing.payment_notice_raw", column: "raw_ciphertext", rowId: notice!.notice_id },
      raw!.raw_ciphertext).equals(message.rawBody)).toBe(true);
    const [token] = await tokensFor("source_charge_id", chargeId);
    expect(token).toMatchObject({
      customer_id: customerId, source_notice_id: notice!.notice_id, last4: "5098", exp_month: 11, exp_year: 2030,
      card_country: "RO", payment_environment: "sandbox"
    });
    expect(token!.source_paid_at.toISOString()).toBe("2026-10-06T09:58:00.000Z");
    expect(openCardToken(TEST_RECORDS_KEY, { tokenId: token!.token_id, tokenCiphertext: token!.token_ciphertext }).reveal()).toBe(TOKEN);
    expect(await jobsFor(chargeId)).toEqual([{ kind: "VERIFY_PAYMENT", not_before: hour(0), payload: { charge_id: chargeId } }]);
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it("stores a resent message once (one notice, one card, one job) and still answers OK", async () => {
    const { chargeId } = await openCharge();
    const { intake } = intakeFor();
    const message = sign(body(chargeId));
    await intake.receive(arrival(message, hour(1)));
    expect(await intake.receive(arrival(message, new Date(hour(1).getTime() + 60_000)))).toEqual({ status: 200, body: OK });
    const notices = await noticesFor(chargeId);
    expect(notices).toHaveLength(1);
    expect(await outcomesOf(notices[0]!.notice_id)).toEqual(["APPLIED", "DUPLICATE"]);
    expect(await tokensFor("source_charge_id", chargeId)).toHaveLength(1);
    expect(await jobsFor(chargeId)).toHaveLength(1);
  });

  it("brings a waiting VERIFY_PAYMENT forward instead of queueing a second one", async () => {
    const { chargeId } = await openCharge();
    await repository.withTransaction((client) => repository.enqueue(client, {
      kind: "VERIFY_PAYMENT", ref: chargeId, notBefore: hour(3), payload: { charge_id: chargeId }
    }));
    const { intake } = intakeFor();
    await intake.receive(arrival(sign(body(chargeId, { status: 15 })), hour(2)));
    expect((await jobsFor(chargeId)).map((job) => job.not_before)).toEqual([hour(2)]);
  });

  it("keeps a tool order's card with no customer and queues nothing; an unknown order keeps nothing", async () => {
    const orderId = `t-${randomUUID().replaceAll("-", "").slice(0, 30)}`;
    await repository.withTransaction((client) => repository.insertToolOrder(client, {
      orderId, paymentEnvironment: "live", createdAt: hour(4), purpose: "LIVE_TEST"
    }));
    const { intake, audit } = intakeFor();
    await intake.receive(arrival(sign(body(orderId)), hour(4)));
    const [notice] = await noticesFor(orderId);
    expect([notice?.payment_environment, await outcomesOf(notice!.notice_id)]).toEqual(["live", ["TOOL_ORDER"]]);
    expect(await tokensFor("source_tool_order", orderId)).toMatchObject([{ customer_id: null, payment_environment: "live" }]);
    expect(await jobsFor(orderId)).toEqual([]);
    const unknown = newChargeId();
    await intake.receive(arrival(sign(body(unknown)), hour(4)));
    const [stray] = await noticesFor(unknown);
    expect([stray?.payment_environment, await outcomesOf(stray!.notice_id)]).toEqual(["sandbox", ["UNKNOWN_ORDER"]]);
    expect(await tokensFor("source_charge_id", unknown)).toEqual([]);
    expect(audit.events.map((entry) => entry.event)).toEqual(["billing.notice.unknown_order"]);
  });

  it("keeps no card and queues nothing for a charge of another payment system or environment", async () => {
    const { intake } = intakeFor();
    const live = (await openCharge("live")).chargeId;
    // An xMoney-era charge as 0109 keeps it, seeded with SQL as billing-netopia-migration.test.ts does.
    const xmoney = newChargeId();
    await query(`INSERT INTO billing.charge (charge_id, owner_ref, subscription_id, kind, attempt, period_start, period_end,
        quote_id, net_micros, tax_micros, total_micros, currency, created_at, payment_provider, payment_environment)
      VALUES ($1, $2, $3, 'CARD_CHECK', 1, $4::timestamptz, $4::timestamptz + interval '1 day', NULL, 0, 0, 0, 'USD', $4,
        'xmoney', 'stage')`, [xmoney, randomUUID(), randomUUID(), "2026-10-06T08:00:00.000Z"]);
    // Another system's charge: the notice is labelled with this API's own system (0109 allows only NETOPIA's there).
    for (const [chargeId, label, system] of [[live, "live", "netopia/live"], [xmoney, "sandbox", "xmoney/stage"]] as const) {
      await intake.receive(arrival(sign(body(chargeId)), hour(5)));
      const [notice] = await noticesFor(chargeId);
      expect([notice?.payment_environment, await outcomesOf(notice!.notice_id)], system).toEqual([label, ["OTHER_SYSTEM"]]);
      expect(await tokensFor("source_charge_id", chargeId), system).toEqual([]);
      expect(await jobsFor(chargeId), system).toEqual([]);
    }
  });

  it("stores an unreadable verified body as PARSE_FAILED, tells the owner once, and still answers OK", async () => {
    const { intake, audit } = intakeFor();
    const unreadable = sign(Buffer.from("not json at all", "utf8"));
    expect(await intake.receive(arrival(unreadable, hour(6)))).toEqual({ status: 200, body: OK });
    const [notice] = await query<{ notice_id: string; order_id: string | null }>(
      "SELECT notice_id, order_id FROM billing.payment_notice WHERE received_at = $1", [hour(6)]);
    expect(notice?.order_id).toBeNull();
    expect(await outcomesOf(notice!.notice_id)).toEqual(["PARSE_FAILED"]);
    expect(audit.events.map((entry) => entry.event)).toEqual(["billing.notice.parse_failed"]);
    const [mail, ...others] = await ownerMails("O3", notice!.notice_id);
    expect(others).toEqual([]);
    expect(mail?.payload).toMatchObject({
      recipient: "OWNER", "param.reasonCode": "NOTICE_PARSE_FAILED", "param.paymentAlert": "true",
      "param.reference": `notice ${notice!.notice_id}`
    });
  });

  it("answers 503 'retry' and kicks nothing when the database write fails", async () => {
    const { chargeId } = await openCharge();
    const { intake, kick, audit } = intakeFor({ storeDown: true });
    expect(await intake.receive(arrival(sign(body(chargeId)), hour(7))))
      .toEqual({ status: 503, body: "{\"errorType\":1,\"errorCode\":1,\"errorMessage\":\"retry\"}" });
    expect(kick).not.toHaveBeenCalled();
    expect(audit.events).toEqual([{ event: "billing.notice.store_failed", fields: {} }]);
    expect(await noticesFor(chargeId)).toEqual([]);
  });
});

describe("N9 a message that fails verification", () => {
  it("answers 'retry', quarantines it sealed, emails the owner at most once an hour, and acts on nothing", async () => {
    const { chargeId } = await openCharge();
    const { intake, audit } = intakeFor();
    const forged = sign(body(chargeId), WRONG_KEYS);
    expect(await intake.receive(arrival(forged, hour(8))))
      .toEqual({ status: 503, body: "{\"errorType\":1,\"errorCode\":268435714,\"errorMessage\":\"retry\"}" });
    await intake.receive(arrival(sign(body(chargeId, { status: 15 }), WRONG_KEYS), new Date(hour(8).getTime() + 600_000)));
    const quarantined = await quarantineFor(chargeId);
    expect(quarantined.map((row) => row.reason)).toEqual(["NOTICE_SIGNATURE_INVALID", "NOTICE_SIGNATURE_INVALID"]);
    const rowId = quarantined[0]!.quarantine_id;
    expect(openRecord(TEST_RECORDS_KEY, { table: "billing.notice_quarantine", column: "raw_ciphertext", rowId }, quarantined[0]!.raw_ciphertext)
      .equals(forged.rawBody)).toBe(true);
    expect(openRecord(TEST_RECORDS_KEY, { table: "billing.notice_quarantine", column: "header_ciphertext", rowId },
      quarantined[0]!.header_ciphertext!).toString("utf8")).toBe(forged.header);
    const mails = await ownerMails("O4", chargeId);
    expect(mails).toHaveLength(1);
    expect(mails[0]).toMatchObject({ ref: "O4:2026-10-06T18", payload: {
      recipient: "OWNER", "param.chargeRef": chargeId, "param.reasonCode": "NOTICE_SIGNATURE_INVALID",
      "param.receivedAt": "2026-10-06T18:00:00.000Z"
    } });
    expect(JSON.stringify(mails[0]!.payload)).not.toContain(forged.header);
    expect(audit.events).toEqual([
      { event: "billing.notice.unverified", fields: { reason: "NOTICE_SIGNATURE_INVALID" } },
      { event: "billing.notice.unverified", fields: { reason: "NOTICE_SIGNATURE_INVALID" } }
    ]);
    expect(await noticesFor(chargeId)).toEqual([]);
    expect(await tokensFor("source_charge_id", chargeId)).toEqual([]);
    expect(await jobsFor(chargeId)).toEqual([]);
  });

  it("keeps nothing of a message that is not worth keeping (no header, or another POS)", async () => {
    const { chargeId } = await openCharge();
    const { intake, audit } = intakeFor();
    const signed = sign(body(chargeId));
    expect((await intake.receive({ ...arrival(signed, hour(9)), header: undefined })).body)
      .toBe("{\"errorType\":1,\"errorCode\":268435713,\"errorMessage\":\"retry\"}");
    const elsewhere = signedNetopiaNotice({ privateKey: KEYS.privateKey, posSignature: POS, body: body(chargeId), aud: "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ" });
    expect((await intake.receive(arrival(elsewhere, hour(9)))).status).toBe(503);
    expect(await quarantineFor(chargeId)).toEqual([]);
    expect(await ownerMails("O4", chargeId)).toEqual([]);
    expect(audit.events.map((entry) => entry.fields.reason)).toEqual(["NOTICE_HEADER_MISSING", "NOTICE_AUDIENCE_INVALID"]);
  });

  it("verifies the quarantine again at the next start, with the fixed keys, and keeps the saved card after all", async () => {
    const { chargeId, customerId } = await openCharge();
    await intakeFor({ keys: WRONG_KEYS }).intake.receive(arrival(sign(body(chargeId)), hour(10)));
    expect(await noticesFor(chargeId)).toEqual([]);
    const restarted = intakeFor();
    expect(await restarted.intake.recheckQuarantine(hour(11))).toBeGreaterThanOrEqual(1);
    const [notice] = await noticesFor(chargeId);
    expect(await outcomesOf(notice!.notice_id)).toEqual(["APPLIED"]);
    expect(await tokensFor("source_charge_id", chargeId)).toMatchObject([{ customer_id: customerId, last4: "5098" }]);
    expect(await jobsFor(chargeId)).toMatchObject([{ kind: "VERIFY_PAYMENT", not_before: hour(11) }]);
    expect(restarted.kick).toHaveBeenCalled();
    expect(restarted.audit.events.find((entry) => entry.event === "billing.notice.recheck")?.fields)
      .toMatchObject({ failed: 0 });
    // A second start finds every quarantined message already stored.
    expect(await intakeFor().intake.recheckQuarantine(new Date(hour(11).getTime() + 60_000))).toBe(0);
    expect(await noticesFor(chargeId)).toHaveLength(1);
    // The start re-read its own quarantine; NETOPIA delivered nothing, so no DUPLICATE outcome is written.
    expect(await outcomesOf(notice!.notice_id)).toEqual(["APPLIED"]);
  });
});

describe("N9 the provider-only mode (ruling C-9)", () => {
  it("handles a tool order's card, stores every other message as BILLING_OFF, and queues no job and no email", async () => {
    const { intake, audit } = intakeFor({ mode: "PROVIDER_ONLY" });
    const { chargeId } = await openCharge();
    await intake.receive(arrival(sign(body(chargeId)), hour(12)));
    const [notice] = await noticesFor(chargeId);
    expect(await outcomesOf(notice!.notice_id)).toEqual(["BILLING_OFF"]);
    expect(await tokensFor("source_charge_id", chargeId)).toEqual([]);
    expect(await jobsFor(chargeId)).toEqual([]);
    const orderId = `t-${randomUUID().replaceAll("-", "").slice(0, 30)}`;
    await repository.withTransaction((client) => repository.insertToolOrder(client, {
      orderId, paymentEnvironment: "sandbox", createdAt: hour(12), purpose: "SANDBOX_RECORDING"
    }));
    await intake.receive(arrival(sign(body(orderId)), hour(12)));
    expect(await tokensFor("source_tool_order", orderId)).toHaveLength(1);
    await intake.receive(arrival(sign(Buffer.from("[1,2,3", "utf8")), hour(13)));
    const [unreadable] = await query<{ notice_id: string }>("SELECT notice_id FROM billing.payment_notice WHERE received_at = $1", [hour(13)]);
    expect(await outcomesOf(unreadable!.notice_id)).toEqual(["PARSE_FAILED"]);
    expect(await ownerMails("O3", unreadable!.notice_id)).toEqual([]);
    await intake.receive(arrival(sign(body(chargeId), WRONG_KEYS), hour(13)));
    expect(await quarantineFor(chargeId)).toHaveLength(1);
    expect(await ownerMails("O4", chargeId)).toEqual([]);
    expect(audit.events.map((entry) => entry.event)).toEqual(["billing.notice.parse_failed", "billing.notice.unverified"]);
  });
});

describe("N9 the route over the real intake: verification before admission", () => {
  it("never refuses a verified message for volume, and answers 429 to a rejected one over budget, storing nothing", async () => {
    const decide = vi.fn(() => ({ allowed: false, reason: "LIMIT", retryAfterMs: 1_000, windowMs: 60_000 }));
    const { intake } = intakeFor();
    const api = buildApi({
      application: unusedAskApplication(),
      billing: { plans: testBillingPlans, clock: () => hour(14), legal: { requiresReacceptance: async () => false }, netopiaNotices: intake },
      admission: { configured: () => true, decide } as unknown as AdmissionLimiter
    });
    const { chargeId } = await openCharge();
    const good = sign(body(chargeId));
    const verified = await api.inject({ method: "POST", url: NETOPIA_NOTIFY_PATH, headers: { "content-type": "application/json", "Verification-token": good.header }, payload: good.rawBody });
    expect([verified.statusCode, verified.body]).toEqual([200, OK]);
    expect(decide).not.toHaveBeenCalled();
    const forged = sign(body(chargeId, { status: 12 }), WRONG_KEYS);
    const refused = await api.inject({ method: "POST", url: NETOPIA_NOTIFY_PATH, headers: { "verification-token": forged.header }, payload: forged.rawBody });
    expect(refused.statusCode).toBe(429);
    expect(decide).toHaveBeenCalledTimes(1);
    expect(await quarantineFor(chargeId)).toEqual([]);
    expect(await noticesFor(chargeId)).toHaveLength(1);
    await api.close();
  });
});

describe("N9 the quarantine in keyset pages (ruling PR-30)", () => {
  it("reads at most `limit` rows after the cursor, in (received_at, quarantine_id) order, ties included", async () => {
    // After every other case's rows (the last of them is hour(14)), so the page holds these five only.
    const at = new Date(Date.UTC(2026, 9, 9, 12));
    const ids = Array.from({ length: 5 }, () => randomUUID()).sort();
    const seal = Buffer.from([7, 7, 7]);
    await repository.withTransaction(async (client) => {
      // Three rows share one received_at, so the order inside a tie is the id's.
      for (const [index, quarantineId] of ids.entries()) {
        await repository.insertNoticeQuarantine(client, {
          quarantineId, receivedAt: new Date(at.getTime() + Math.max(0, index - 2) * 1_000), reason: "NOTICE_SIGNATURE_INVALID",
          orderId: null, rawCiphertext: seal, headerCiphertext: null, keyId: "0".repeat(16)
        });
      }
    });
    const page = (after: { receivedAt: Date; quarantineId: string } | null) =>
      repository.quarantineSince(database.pool, at, { after, limit: 2 });
    const first = await page(null);
    expect(first.map((row) => row.quarantineId)).toEqual(ids.slice(0, 2));
    const second = await page({ receivedAt: first[1]!.receivedAt, quarantineId: first[1]!.quarantineId });
    expect(second.map((row) => row.quarantineId)).toEqual(ids.slice(2, 4));
    const third = await page({ receivedAt: second[1]!.receivedAt, quarantineId: second[1]!.quarantineId });
    expect(third.map((row) => row.quarantineId)).toEqual(ids.slice(4));
    expect((await repository.quarantineSince(database.pool, at)).map((row) => row.quarantineId)).toEqual(ids);
  });
});
