import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldSubscription, type SubscriptionEvent } from "@debateai/billing-core";
import { BillingJobQueries, BillingRepository, EntitlementRepository, migrate } from "@debateai/db";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";
import { seedActiveSubscription, TEST_RECORDS_KEY } from "../support/billingSubscriptionFixtures.js";
import { openEfacturaStatusRecorder, runBillingEfacturaStatusCli } from "../../apps/api/src/billing/efactura-status-cli.js";
import { sealIpEvidence } from "../../apps/api/src/billing/records.js";
import { chargeEvent, subscriptionEvent } from "../../apps/api/src/billing/rows.js";
import { efacturaChecksFrom, parseTaxQuarter } from "../../apps/api/src/billing/tax-summary.js";

let database: TestDatabase;
beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
}, 120_000);
afterAll(async () => database?.stop());

function currentQuarter(now: Date) {
  return parseTaxQuarter(`${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`);
}

describe("P16b the summary reads our own rows", () => {
  it("returns one SALE per paid charge, one REFUND per refund and one CHARGEBACK per open charge-back in the quarter", async () => {
    const quarter = currentQuarter(new Date());
    const soon = new Date(quarter.from.getTime() + 3_600_000);
    const billing = new BillingRepository(database.pool);
    const ro = await seedActiveSubscription(database.pool, { ownerRef: randomUUID(), planId: "PLUS", activatedAt: soon, taxCountry: "RO" });
    const de = await seedActiveSubscription(database.pool, { ownerRef: randomUUID(), planId: "PRO", activatedAt: soon, taxCountry: "DE", taxRateBasisPoints: 1_900 });
    await billing.withTransaction(async (client) => {
      for (const kind of ["REFUND_REQUESTED", "REFUNDED"] as const) {
        await billing.appendChargeEvent(client, chargeEvent(ro.initialChargeId, kind, new Date(soon.getTime() + 3_600_000), {
          xmoneyTransactionId: ro.initialTransactionId, amountMicros: 12_100_000, errorCode: "WITHDRAWAL"
        }));
      }
      // A charge-back no dispute has won back yet: listed for the accountant (P1a's CHARGEBACK row).
      await billing.appendChargeEvent(client, chargeEvent(de.initialChargeId, "CHARGEBACK", new Date(soon.getTime() + 7_200_000), {
        xmoneyTransactionId: de.initialTransactionId, amountMicros: de.totalMicros, errorCode: null
      }));
      const ip = sealIpEvidence(TEST_RECORDS_KEY, de.initialChargeId, "192.0.2.10");
      await billing.insertLocationEvidence(client, {
        chargeId: de.initialChargeId, ipCountry: "FR", declaredCountry: "DE", cardCountry: "IT",
        verdict: "CONFLICTING", ipCiphertext: ip.ciphertext, keyId: ip.keyId, at: soon
      });
    });
    // The seeded subscriptions live in xMoney's sandbox system ("stage"), so they are read as such here.
    const rows = await billing.quarterSummaryRows(quarter.from, quarter.to, "stage");
    const mine = rows.filter((row) => row.chargeId === ro.initialChargeId || row.chargeId === de.initialChargeId);
    expect(mine).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "SALE", chargeId: ro.initialChargeId, taxCountry: "RO", taxStatus: "TAXABLE",
        chargeNetMicros: 20_000_000, chargeTaxMicros: 4_200_000, amountMicros: 24_200_000 }),
      // Our own refund: its amount is known, so the summary subtracts it.
      expect.objectContaining({ type: "REFUND", chargeId: ro.initialChargeId, amountMicros: 12_100_000, amountKnown: true }),
      expect.objectContaining({ type: "SALE", chargeId: de.initialChargeId, taxCountry: "DE",
        chargeTaxMicros: 9_500_000, locationVerdict: "CONFLICTING" }),
      expect.objectContaining({ type: "CHARGEBACK", chargeId: de.initialChargeId, taxCountry: "DE", amountMicros: de.totalMicros })
    ]));
    expect(mine).toHaveLength(4);
    // A sandbox payment is never a sale: the live summary, the one the command and O1 read, sees none of them.
    expect((await billing.quarterSummaryRows(quarter.from, quarter.to, "live"))
      .filter((row) => row.chargeId === ro.initialChargeId || row.chargeId === de.initialChargeId)).toEqual([]);
  });

  it("lists invoice jobs that ended INVOICE_UNKNOWN until an invoice row exists for them", async () => {
    const billing = new BillingRepository(database.pool);
    const seeded = await seedActiveSubscription(database.pool, { ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(), taxCountry: "RO" });
    await billing.withTransaction((client) => billing.enqueue(client, {
      kind: "SMARTBILL_INVOICE", ref: seeded.initialChargeId, notBefore: new Date(0), payload: { charge_id: seeded.initialChargeId }
    }));
    const [job] = (await billing.claim(["SMARTBILL_INVOICE"], 50, "p16b-test", new Date()))
      .filter((claimed) => claimed.ref === seeded.initialChargeId);
    await billing.fail(job!.jobId, "INVOICE_UNKNOWN", null, new Date());
    expect((await billing.invoiceUnknownItems()).map((item) => item.chargeId)).toContain(seeded.initialChargeId);
    // The owner issued it by hand and recorded it the A17 way: the intent, then the invoice that names it.
    await billing.withTransaction(async (client) => {
      await billing.insertInvoiceIntent(client, {
        chargeId: seeded.initialChargeId, kind: "INVOICE", issuer: "SMARTBILL", requestedAt: new Date()
      });
      await billing.insertInvoice(client, {
        invoiceId: randomUUID(), chargeId: seeded.initialChargeId, issuer: "SMARTBILL", kind: "INVOICE",
        externalRef: `sb-manual-${randomUUID()}`, series: "DBAI", number: "0099", url: null,
        totalMicros: seeded.totalMicros, at: new Date()
      });
    });
    expect((await billing.invoiceUnknownItems()).map((item) => item.chargeId)).not.toContain(seeded.initialChargeId);
  });

  it("lists a Romanian invoice SmartBill never issued and a dashboard refund with no credit note (D5 5j, P9c)", async () => {
    const billing = new BillingRepository(database.pool);
    const refused = await seedActiveSubscription(database.pool, { ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(), taxCountry: "RO" });
    const dashboard = await seedActiveSubscription(database.pool, { ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(), taxCountry: "RO" });
    await billing.withTransaction(async (client) => {
      await billing.enqueue(client, {
        kind: "SMARTBILL_INVOICE", ref: refused.initialChargeId, notBefore: new Date(0), payload: { charge_id: refused.initialChargeId }
      });
      for (const kind of ["REFUND_REQUESTED", "REFUNDED"] as const) {
        await billing.appendChargeEvent(client, chargeEvent(dashboard.initialChargeId, kind, new Date(), {
          xmoneyTransactionId: dashboard.initialTransactionId, amountMicros: 5_000_000, errorCode: "PROVIDER_REFUND"
        }));
      }
    });
    const [job] = (await billing.claim(["SMARTBILL_INVOICE"], 50, "p16b-test", new Date()))
      .filter((claimed) => claimed.ref === refused.initialChargeId);
    await billing.fail(job!.jobId, "INVOICE_SERVICE_REFUSED", null, new Date());
    const items = await billing.invoiceUnknownItems();
    expect(items).toEqual(expect.arrayContaining([
      expect.objectContaining({ chargeId: refused.initialChargeId, jobKind: "SMARTBILL_INVOICE", code: "INVOICE_SERVICE_REFUSED" }),
      expect.objectContaining({ chargeId: dashboard.initialChargeId, jobKind: "DASHBOARD_REFUND", code: "CREDIT_NOTE_MANUAL" })
    ]));
    // The owner issued the credit note by hand and recorded it: the dashboard refund leaves the list.
    await billing.withTransaction(async (client) => {
      await billing.insertInvoiceIntent(client, {
        chargeId: dashboard.initialChargeId, kind: "CREDIT_NOTE", issuer: "SMARTBILL", requestedAt: new Date()
      });
      await billing.insertInvoice(client, {
        invoiceId: randomUUID(), chargeId: dashboard.initialChargeId, issuer: "SMARTBILL", kind: "CREDIT_NOTE",
        externalRef: `sb-manual-${randomUUID()}`, series: "DBAI", number: "0100", url: null, totalMicros: 5_000_000, at: new Date()
      });
    });
    expect((await billing.invoiceUnknownItems()).map((item) => item.chargeId)).not.toContain(dashboard.initialChargeId);
  });

  it("marks a dashboard refund recorded on the payment itself as of unknown amount, and one xMoney reported as its own transaction as known", async () => {
    const quarter = currentQuarter(new Date());
    const billing = new BillingRepository(database.pool);
    const onPayment = await seedActiveSubscription(database.pool, { ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(), taxCountry: "RO" });
    const ownTransaction = await seedActiveSubscription(database.pool, { ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(), taxCountry: "RO" });
    const refundTransactionId = String(8_800_000_000 + Math.floor(Math.random() * 99_999_999));
    await billing.withTransaction(async (client) => {
      // P9c, xMoney's read naming no refunded amount: recorded on the payment at what was left of the charge.
      for (const kind of ["REFUND_REQUESTED", "REFUNDED"] as const) {
        await billing.appendChargeEvent(client, chargeEvent(onPayment.initialChargeId, kind, new Date(), {
          xmoneyTransactionId: onPayment.initialTransactionId, amountMicros: onPayment.totalMicros, errorCode: "PROVIDER_REFUND"
        }));
      }
      // D5 5g: a dashboard refund xMoney lists as its own transaction, naming the payment: its amount is known.
      await billing.appendChargeEvent(client, chargeEvent(ownTransaction.initialChargeId, "REFUND_REQUESTED", new Date(), {
        xmoneyTransactionId: ownTransaction.initialTransactionId, amountMicros: 3_000_000, errorCode: "PROVIDER_REFUND"
      }));
      await billing.appendChargeEvent(client, chargeEvent(ownTransaction.initialChargeId, "REFUNDED", new Date(), {
        xmoneyTransactionId: refundTransactionId, amountMicros: 3_000_000, errorCode: "PROVIDER_REFUND",
        refundsTransactionId: ownTransaction.initialTransactionId
      }));
    });
    const refunds = (await billing.quarterSummaryRows(quarter.from, quarter.to, "stage")).filter((row) => row.type === "REFUND"
      && (row.chargeId === onPayment.initialChargeId || row.chargeId === ownTransaction.initialChargeId));
    expect(refunds).toEqual(expect.arrayContaining([
      expect.objectContaining({ chargeId: onPayment.initialChargeId, amountMicros: onPayment.totalMicros, amountKnown: false }),
      expect.objectContaining({ chargeId: ownTransaction.initialChargeId, amountMicros: 3_000_000, amountKnown: true })
    ]));
    expect(refunds).toHaveLength(2);
  });

  it("lists a subscription whose history does not fold, and a renewal closed with its outcome unknown", async () => {
    const billing = new BillingRepository(database.pool);
    const now = new Date();
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 40 * 86_400_000), taxCountry: "RO"
    });
    // An illegal history (WITHDRAWN straight after CREATED), written past P1b's fold check the way D5's own test does:
    // appendSubscriptionEvent would refuse it.
    const broken = randomUUID();
    for (const [kind, data] of [["CREATED", { xmoney_environment: "stage" }], ["WITHDRAWN", {}]] as const) {
      await database.pool.query(`
        INSERT INTO billing.subscription_event (event_id, subscription_id, owner_ref, kind, at, plan_id, data)
        VALUES ($1, $2, $3, $4, clock_timestamp(), 'PLUS', $5::jsonb)
      `, [randomUUID(), broken, randomUUID(), kind, JSON.stringify(data)]);
    }
    const unfoldable = await billing.unfoldableSubscriptions();
    expect(unfoldable.map((item) => item.subscriptionId)).toContain(broken);
    expect(unfoldable.map((item) => item.subscriptionId)).not.toContain(seeded.subscriptionId);
    const renewal = randomUUID().replaceAll("-", "");
    await billing.withTransaction(async (client) => {
      await billing.insertCharge(client, {
        chargeId: renewal, ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId, kind: "RENEWAL", attempt: 1,
        periodStart: seeded.periodEnd, periodEnd: new Date(seeded.periodEnd.getTime() + 30 * 86_400_000),
        quoteId: seeded.initialQuoteId, netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: 24_200_000,
        currency: "USD", createdAt: new Date(now.getTime() - 2 * 86_400_000), xmoneyEnvironment: "stage"
      });
      for (const [kind, errorCode] of [["REQUESTED", null], ["SUBMIT_UNKNOWN", "REBILL_OUTCOME_UNKNOWN"], ["FAILED", "NO_TRANSACTION"]] as const) {
        await billing.appendChargeEvent(client, chargeEvent(renewal, kind, new Date(now.getTime() - 86_400_000), {
          xmoneyTransactionId: null, amountMicros: 24_200_000, errorCode
        }));
      }
    });
    expect((await billing.stuckRenewals(new Date(now.getTime() - 120 * 86_400_000))).map((item) => item.chargeId)).toContain(renewal);
    expect((await billing.stuckRenewals(now)).map((item) => item.chargeId)).not.toContain(renewal);
  });

  it("lists the quarter's SmartBill documents until the owner's command records ANAF's ACCEPTED (P10b's reads)", async () => {
    const quarter = currentQuarter(new Date());
    const billing = new BillingRepository(database.pool);
    const jobs = new BillingJobQueries(database.pool);
    const issuedAt = new Date(quarter.from.getTime() + 2 * 3_600_000);
    const seedInvoice = async () => {
      const seeded = await seedActiveSubscription(database.pool, {
        ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(quarter.from.getTime() + 3_600_000), taxCountry: "RO"
      });
      const number = String(Math.floor(Math.random() * 900_000) + 100_000);
      await billing.withTransaction(async (client) => {
        await billing.insertInvoiceIntent(client, { chargeId: seeded.initialChargeId, kind: "INVOICE", issuer: "SMARTBILL", requestedAt: issuedAt });
        await billing.insertInvoice(client, {
          invoiceId: randomUUID(), chargeId: seeded.initialChargeId, issuer: "SMARTBILL", kind: "INVOICE",
          externalRef: `sb-${randomUUID()}`, series: "DBAI", number, url: null, totalMicros: seeded.totalMicros, at: issuedAt
        });
      });
      return Object.freeze({ chargeId: seeded.initialChargeId, number });
    };
    const accepted = await seedInvoice();
    const rejected = await seedInvoice();
    const listed = async (chargeId: string) => (await efacturaChecksFrom(jobs, quarter.from, quarter.to))
      .filter((item) => item.chargeId === chargeId);
    expect(await listed(accepted.chargeId)).toEqual([{
      document: `DBAI-${accepted.number}`, kind: "INVOICE", chargeId: accepted.chargeId, issuedAt, status: null
    }]);
    // The command as the host runs it: P14b's operator pool on the database URL, read-write, one connection.
    const open = () => openEfacturaStatusRecorder({ DATABASE_URL: database.connectionString, NODE_ENV: "test" });
    const lines = { out: "", err: "" };
    const output = { stdout: (text: string) => { lines.out += text; }, stderr: (text: string) => { lines.err += text; } };
    expect(await runBillingEfacturaStatusCli(["--invoice", `DBAI-${accepted.number}`, "--status", "ACCEPTED"], output, open)).toBe(0);
    expect(await runBillingEfacturaStatusCli(["--invoice", `DBAI-${rejected.number}`, "--status", "REJECTED"], output, open)).toBe(0);
    expect(lines.err).toBe("");
    expect(await listed(accepted.chargeId)).toEqual([]);
    expect((await listed(rejected.chargeId)).map((item) => item.status)).toEqual(["REJECTED"]);
    // A number SmartBill never printed is refused with P10b's code, and nothing is written.
    expect(await runBillingEfacturaStatusCli(["--invoice", "DBAI-9999999", "--status", "ACCEPTED"], output, open)).toBe(1);
    expect(lines.err).toBe("EFACTURA_DOCUMENT_UNKNOWN\n");
    // Another quarter never lists them.
    expect((await efacturaChecksFrom(jobs, quarter.to, new Date(quarter.to.getTime() + 86_400_000)))
      .filter((item) => item.chargeId === rejected.chargeId)).toEqual([]);
  });

  it("lists a dunning the tax service could not price and a plan it ended, never a charged dunning (R2 Q-1)", async () => {
    const billing = new BillingRepository(database.pool);
    const now = new Date();
    const seed = () => seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 40 * 86_400_000), taxCountry: "RO"
    });
    const unpriced = await seed();
    const ended = await seed();
    const charged = await seed();
    const append = async (subscriptionId: string, kind: "PAST_DUE" | "ENDED", at: Date, data: SubscriptionEvent["data"]) => {
      const state = foldSubscription(await billing.subscriptionEvents(subscriptionId));
      await billing.withTransaction((client) => billing.appendSubscriptionEvent(client, subscriptionEvent(state, kind, at, data)));
    };
    const firstFailedAt = new Date(now.getTime() - 5 * 86_400_000);
    const endedAt = new Date(now.getTime() - 86_400_000);
    const retry = { first_failed_at: firstFailedAt.toISOString(), next_retry_at: new Date(firstFailedAt.getTime() + 86_400_000).toISOString() };
    // P11a's failUnpricedAttempt writes through writeDunningAttempt: a `reason` where a charged attempt names its charge.
    await append(unpriced.subscriptionId, "PAST_DUE", firstFailedAt, { attempt: 1, reason: "TAX_SERVICE_UNAVAILABLE", ...retry });
    await append(ended.subscriptionId, "PAST_DUE", firstFailedAt, { attempt: 1, reason: "TAX_SERVICE_UNAVAILABLE", ...retry });
    await append(ended.subscriptionId, "ENDED", endedAt, { cause: "DUNNING", reason: "TAX_SERVICE_UNAVAILABLE" });
    await append(charged.subscriptionId, "PAST_DUE", firstFailedAt, { attempt: 1, charge_id: "c".repeat(32), ...retry });
    const ours = new Set([unpriced.subscriptionId, ended.subscriptionId, charged.subscriptionId]);
    const listed = async (since: Date) => (await billing.chargelessDunning(since)).filter((item) => ours.has(item.subscriptionId));
    expect(await listed(new Date(now.getTime() - 120 * 86_400_000))).toEqual([
      { subscriptionId: unpriced.subscriptionId, ended: false, reason: "TAX_SERVICE_UNAVAILABLE", since: firstFailedAt },
      { subscriptionId: ended.subscriptionId, ended: true, reason: "TAX_SERVICE_UNAVAILABLE", since: endedAt }
    ]);
    // A PAST_DUE one is listed while it lasts; an ended one only inside the window the summary asks for.
    expect((await listed(now)).map((item) => item.subscriptionId)).toEqual([unpriced.subscriptionId]);
  });

  it("lists an ACTIVE renewal a tax refusal blocks (a lapsed RENEWAL_PENDING, no RENEWAL charge), until a charge exists", async () => {
    const billing = new BillingRepository(database.pool);
    const entitlements = new EntitlementRepository(database.pool);
    const now = new Date();
    const seeded = await seedActiveSubscription(database.pool, {
      ownerRef: randomUUID(), planId: "PLUS", activatedAt: new Date(now.getTime() - 40 * 86_400_000), taxCountry: "RO"
    });
    // P11a's taxRefused hold: written inside the lead, paid through 72 hours past the period end, lapsed by now.
    const paidThrough = new Date(seeded.periodEnd.getTime() + 72 * 3_600_000);
    await billing.withTransaction((client) => entitlements.append(client, {
      ownerRef: seeded.ownerRef, planId: "PLUS", periodAnchorAt: seeded.periodStart, cause: "RENEWAL_PENDING",
      effectiveAt: new Date(seeded.periodEnd.getTime() - 60_000), subscriptionId: seeded.subscriptionId, paidThrough,
      monthCreditOverrideMicros: null
    }));
    const blocked = async (at: Date) => (await billing.blockedRenewals(at))
      .filter((item) => item.subscriptionId === seeded.subscriptionId);
    expect(await blocked(now)).toEqual([{ subscriptionId: seeded.subscriptionId, since: paidThrough }]);
    // Inside its 72 hours the hold still holds the plan: nothing to list yet.
    expect(await blocked(new Date(paidThrough.getTime() - 3_600_000))).toEqual([]);
    // A RENEWAL charge for the period (the renewal was priced after all): P14a's lists own it from here on.
    await billing.withTransaction((client) => billing.insertCharge(client, {
      chargeId: randomUUID().replaceAll("-", ""), ownerRef: seeded.ownerRef, subscriptionId: seeded.subscriptionId,
      kind: "RENEWAL", attempt: 1, periodStart: seeded.periodEnd,
      periodEnd: new Date(seeded.periodEnd.getTime() + 30 * 86_400_000), quoteId: seeded.initialQuoteId,
      netMicros: 20_000_000, taxMicros: 4_200_000, totalMicros: 24_200_000, currency: "USD", createdAt: now,
      xmoneyEnvironment: "stage"
    }));
    expect(await blocked(now)).toEqual([]);
  });

  it("lists a second refund made elsewhere that our records cannot hold, once per refund transaction (P9c's dead mark)", async () => {
    const billing = new BillingRepository(database.pool);
    const refundTransactionId = String(7_700_000_000 + Math.floor(Math.random() * 99_999_999));
    const deadAt: Date[] = [];
    // P9c ends the refund transaction's check DEAD with REFUND_UNRECORDED; a notice xMoney sends again makes a new
    // job of the same ref (one LIVE job per kind and ref), which dies the same way.
    for (let copy = 0; copy < 2; copy += 1) {
      const jobId = await billing.withTransaction((client) => billing.enqueue(client, {
        kind: "VERIFY_PAYMENT", ref: refundTransactionId, notBefore: new Date(0), payload: {}
      }));
      const at = new Date(Date.now() - (2 - copy) * 3_600_000);
      deadAt.push(at);
      expect(await billing.fail(jobId, "REFUND_UNRECORDED", null, at)).toBe(true);
    }
    // Another dead check, for another reason (P9b's CHARGE_NOT_FOUND), is not this list's.
    const otherId = await billing.withTransaction((client) => billing.enqueue(client, {
      kind: "VERIFY_PAYMENT", ref: String(Number(refundTransactionId) + 1), notBefore: new Date(0), payload: {}
    }));
    expect(await billing.fail(otherId, "CHARGE_NOT_FOUND", null, new Date())).toBe(true);
    const listed = async (since: Date) => (await billing.unrecordedRefunds(since))
      .filter((item) => item.transactionId === refundTransactionId || item.transactionId === String(Number(refundTransactionId) + 1));
    expect(await listed(new Date(Date.now() - 120 * 86_400_000))).toEqual([
      { transactionId: refundTransactionId, since: deadAt[0] }
    ]);
    // Outside the window the summary asks for, it is no longer listed.
    expect(await listed(new Date(Date.now() + 60_000))).toEqual([]);
  });
});
