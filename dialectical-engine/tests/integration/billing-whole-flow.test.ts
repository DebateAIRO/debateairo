import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { microsToDecimal, upgradeMonthCreditOverrideMicros, upgradeProrationMicros } from "@debateai/billing-core";
import { BillingRepository, EntitlementRepository } from "@debateai/db";
import { taxSummaryJobFor } from "../../apps/api/src/billing/owner-jobs.js";
import { startBillingStack, type BillingStack } from "../support/billingStack.js";
import { fakeTaxMicros } from "../support/fake-tax-engine.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";

/**
 * P23 — the paid-plans whole flow on the fake stack (spec 2026-09-29 §2.8; R-26): embedded Postgres, fake xMoney,
 * FakeTaxEngine, FakeInvoiceIssuer, and the real routes and jobs of P7–P16. CI skips integration suites: run this
 * before every merge that touches billing. P2-M39: it proves what README §14.9 step 6 says it proves (the amounts at
 * the fakes, the Romanian invoice's line and PDF), plus an upgrade, an account deletion, the daily money check and the
 * owner's jobs. The cases share one stack and one clock, so their order matters; each says why it sits where it does.
 */
let stack: BillingStack;

beforeAll(async () => { stack = await startBillingStack(); }, 600_000);
afterAll(async () => { await stack?.stop(); });

const ids = (stackMails: ReadonlyArray<{ templateId: string }>): string[] => stackMails.map((mail) => mail.templateId);
const DAY_MS = 86_400_000;
/** The bytes FakeInvoiceIssuer.pdf returns for every invoice (tests/support/fake-invoice-issuer.ts). */
const FAKE_PDF = "%PDF-1.4\n% fake\n";

type ChargeAmounts = Readonly<{
  chargeId: string; net: string; tax: string; total: string; createdAt: Date; quoteKind: string; quoteCreatedAt: Date; rate: string;
}>;

/** The person's charges of one kind, oldest first, with the quote that priced each (micros as text). */
async function chargesOf(ownerRef: string, kind: "INITIAL" | "RENEWAL" | "UPGRADE"): Promise<ChargeAmounts[]> {
  const found = await stack.database.pool.query<{
    charge_id: string; net: string; tax: string; total: string; created_at: Date; quote_kind: string; quote_created_at: Date; rate: string;
  }>(`
    SELECT c.charge_id, c.net_micros::text AS net, c.tax_micros::text AS tax, c.total_micros::text AS total, c.created_at,
      q.kind AS quote_kind, q.created_at AS quote_created_at, q.tax_rate_bp::text AS rate
    FROM billing.charge c JOIN billing.quote q ON q.quote_id = c.quote_id
    WHERE c.owner_ref = $1 AND c.kind = $2 ORDER BY c.created_at
  `, [ownerRef, kind]);
  return found.rows.map((row) => ({
    chargeId: row.charge_id, net: row.net, tax: row.tax, total: row.total, createdAt: row.created_at,
    quoteKind: row.quote_kind, quoteCreatedAt: row.quote_created_at, rate: row.rate
  }));
}

/** The fake xMoney transaction that paid this charge (its one SUCCEEDED). */
async function paymentOf(chargeId: string) {
  const found = await stack.database.pool.query<{ id: string }>(
    "SELECT provider_payment_id AS id FROM billing.charge_event WHERE charge_id = $1 AND kind = 'SUCCEEDED'", [chargeId]
  );
  expect(found.rows).toHaveLength(1);
  const transaction = stack.xmoney.transactions.get(found.rows[0]!.id);
  expect(transaction).toBeDefined();
  return transaction!;
}

/** The refund transactions the fake xMoney made against one payment, in cents. */
const refundsAtXMoney = (paymentId: number): number[] => [...stack.xmoney.transactions.values()]
  .filter((transaction) => transaction.transactionType === "refund" && transaction.relatedTransactionIds.includes(paymentId))
  .map((transaction) => transaction.amountCents);

/** The lines of every sale the fake SmartBill issued an invoice for, for one charge. */
const invoiceLinesOf = (chargeId: string) =>
  stack.invoices.sales.filter((sale) => sale.chargeId === chargeId).map((sale) => sale.lines);

describe("P23 paid plans, end to end on the fake stack", () => {
  it("Free → Plus → usage → renewal → a failing card through the retries → Free", async () => {
    const person = await stack.signUp("plus.person@example.test", "RO");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("FREE");

    const quote = await stack.quote(person, "PLUS");
    expect(quote.status).toBe(200);
    expect(quote.body).toMatchObject({ net: "20.00", tax: "4.20", total: "24.20", country_confirm_needed: false });
    const checkout = await stack.checkout(person, String(quote.body.quote_ref));
    expect(checkout.status).toBe(200);
    expect(checkout.body.sdk_environment).toBe("stage");
    const chargeRef = String(checkout.body.charge_ref);
    expect(chargeRef).toMatch(/^[0-9a-f]{32}$/);

    // The fake checks the order's HMAC before it pays: the signed payload is exactly what the browser would mount.
    const notice = await stack.pay(checkout, "RO");
    const notified = await stack.notify(notice.opensslResult);
    expect([notified.status, notified.text]).toEqual([200, "OK"]);

    await stack.runJobs();
    expect((await stack.get(person, `/v1/billing/charges/${chargeRef}`)).body).toEqual({ state: "SUCCEEDED", reason_code: null });
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ACTIVE");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("PLUS");
    expect(ids(stack.mailsTo(person.email))).toEqual(expect.arrayContaining(["M1", "M2_INVOICE_ATTACHED"]));
    // M1 carries the accepted Terms (ruling Q-3: L2 archived the current version, which the sign-up row names by its
    // hash) and the model withdrawal form (A26b, P17's resolvers fed by P9b's fields from the acceptance row).
    const m1 = stack.mailsTo(person.email).find((mail) => mail.templateId === "M1")!;
    expect((m1.attachments ?? []).map((attachment) => attachment.filename)).toEqual(["terms-of-service.txt", "withdrawal-form.txt"]);
    // P2-M39, the Romanian invoice: the fake SmartBill issued ONE invoice for this charge, for the name and place the
    // quote recorded (R-15), with the sale's one line at Romania's 21 %; M2 carries the PDF made for that number.
    const invoices = stack.invoices.issued.filter((document) => document.chargeId === chargeRef);
    expect(invoices.map((document) => document.kind)).toEqual(["INVOICE"]);
    expect(stack.invoices.sales.filter((sale) => sale.chargeId === chargeRef)).toEqual([expect.objectContaining({
      customer: expect.objectContaining({ name: "Ana Pop", email: person.email, country: "RO", city: "Cluj-Napoca" }),
      lines: [{ description: expect.stringMatching(/\S/u), netMicros: 20_000_000, taxMicros: 4_200_000, taxRateBasisPoints: 2_100 }]
    })]);
    const m2 = stack.mailsTo(person.email).find((mail) => mail.templateId === "M2_INVOICE_ATTACHED")!;
    expect((m2.attachments ?? []).map((attachment) => [
      attachment.filename, attachment.contentType, Buffer.from(attachment.content).toString("latin1")
    ])).toEqual([[`${invoices[0]!.externalRef}.pdf`, "application/pdf", FAKE_PDF]]);
    const again = await stack.notify(notice.opensslResult);
    expect(again.status).toBe(200);
    await stack.runJobs();
    const succeeded = await stack.database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM billing.charge_event WHERE charge_id = $1 AND kind = 'SUCCEEDED'", [chargeRef]
    );
    expect(succeeded.rows[0]!.count).toBe("1");

    // Usage: 0.50 of Plus's 1.00 day, 2.50 week and 5.00 month.
    await stack.spend(person, 500_000);
    const usage = await stack.get(person, "/v1/billing/usage");
    expect(usage.status).toBe(200);
    const percent = Object.fromEntries((usage.body.windows as Array<{ scope: string; percent: number }>).map((w) => [w.scope, w.percent]));
    expect(percent).toEqual({ PERSON_DAY: 50, PERSON_WEEK: 20, PERSON_MONTH: 10 });
    expect(usage.text).not.toMatch(/micros|\$|"0\.5/u);

    // Renewal: the period ends, the saved card is charged again, the plan stays. C-18: the tax service is watched
    // from here, so a renewal that copied the checkout's tax (whose numbers the fake's fixed rate would reproduce)
    // fails below: the renewal must ask for ONE fresh quote, for its recurring net, at its own (moved) time.
    const taxQuotes = vi.spyOn(stack.tax, "quote");
    stack.advanceDays(31);
    const renewalFrom = stack.now();
    await stack.runRenewals();
    const renewalUntil = stack.now();
    // Read before the restore, which clears the spy's record.
    const quoteCalls = taxQuotes.mock.calls.map(([input]) => input);
    taxQuotes.mockRestore();
    expect(quoteCalls).toHaveLength(1);
    const asked = quoteCalls[0]!;
    expect(asked).toMatchObject({ netMicros: 20_000_000, currency: "USD", location: expect.objectContaining({ country: "RO" }) });
    expect(asked.date.getTime()).toBeGreaterThanOrEqual(renewalFrom.getTime());
    expect(asked.date.getTime()).toBeLessThanOrEqual(renewalUntil.getTime());
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ACTIVE");
    expect(ids(stack.mailsTo(person.email)).filter((id) => id === "M2_INVOICE_ATTACHED")).toHaveLength(2);
    // P2-M39, the renewal's amount: the recurring net (Plus's 20.00) plus tax priced afresh by the tax service at the
    // renewal's own (moved) time, in the renewal's own RENEWAL quote; that total is what the fake xMoney rebilled, and
    // the renewal's invoice carries the same line.
    const [initial] = await chargesOf(person.ownerRef, "INITIAL");
    const renewals = await chargesOf(person.ownerRef, "RENEWAL");
    expect(renewals).toHaveLength(1);
    expect(renewals[0]).toMatchObject({ net: "20000000", tax: "4200000", total: "24200000", quoteKind: "RENEWAL", rate: "2100.00" });
    expect(renewals[0]!.quoteCreatedAt.getTime() - initial!.createdAt.getTime()).toBeGreaterThan(30 * DAY_MS);
    const rebill = await paymentOf(renewals[0]!.chargeId);
    expect([rebill.transactionSource, rebill.amountCents]).toEqual(["re-bill", 2_420]);
    expect(invoiceLinesOf(renewals[0]!.chargeId)).toEqual([
      [{ description: expect.stringMatching(/\S/u), netMicros: 20_000_000, taxMicros: 4_200_000, taxRateBasisPoints: 2_100 }]
    ]);

    // The next renewal fails (xMoney declines the rebill: HTTP 402), and each retry fails: +1, +3, +7 days after the
    // first failure (testBillingPolicy.dunningRetryDays), then Free. The clock steps just past each retry time.
    stack.xmoney.failNextRebill("insufficient-funds");
    stack.advanceDays(31);
    await stack.runRenewals();
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("PAST_DUE");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("PLUS");
    expect(ids(stack.mailsTo(person.email))).toContain("M5A");
    for (const [days, email] of [[1.05, "M5B"], [2, "M5C"]] as const) {
      stack.xmoney.failNextRebill("insufficient-funds");
      stack.advanceDays(days);
      await stack.runRenewals();
      expect(ids(stack.mailsTo(person.email))).toContain(email);
      expect(await stack.entitlementPlan(person.ownerRef)).toBe("PLUS");
    }
    stack.xmoney.failNextRebill("insufficient-funds");
    stack.advanceDays(4);
    await stack.runRenewals();
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ENDED");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("FREE");
    const sent = ids(stack.mailsTo(person.email));
    for (const [earlier, later] of [["M1", "M5A"], ["M5A", "M5B"], ["M5B", "M5C"], ["M5C", "M6"]] as const) {
      expect(sent.indexOf(earlier), `${earlier} before ${later}`).toBeLessThan(sent.indexOf(later));
    }
  });

  it("a withdrawal within 14 days refunds the price minus the larger of days or credit used", async () => {
    const person = await stack.signUp("withdraw.person@example.test", "DE");
    const chargeRef = await stack.subscribe(person, "PRO", "DE");
    const paid = await stack.database.pool.query<{ total_micros: string }>(
      "SELECT total_micros::text FROM billing.charge WHERE charge_id = $1", [chargeRef]
    );
    const paidCents = Number(paid.rows[0]!.total_micros) / 10_000;
    await stack.spend(person, 2_000_000);              // 10% of Pro's 20.00 month (testBillingPlans)
    stack.advanceDays(2);                               // 2 days of a 28–31-day period: under 10%
    const stepped = await stack.post(person, "/v1/auth/step-up", {
      password: "not-checked-by-the-stack", code: "000000", authorization: { action: "WITHDRAW_SUBSCRIPTION" }
    });
    expect(stepped.status).toBe(200);
    expect(stepped.body.step_up_grant).toMatchObject({ action: "WITHDRAW_SUBSCRIPTION" });
    const grant = (stepped.body.step_up_grant as { token: string }).token;
    const withdrawn = await stack.post(person, "/v1/billing/subscription/withdraw", { step_up_grant: grant });
    expect(withdrawn.status).toBe(200);
    const expectedCents = Math.floor(paidCents * 0.9);
    expect(withdrawn.body.refund).toBe((expectedCents / 100).toFixed(2));
    await stack.runJobs();
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("WITHDRAWN");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("FREE");
    expect(ids(stack.mailsTo(person.email))).toContain("M8");
    // W9 (P2-I11): the acknowledgement of receipt, rendered and sent before the refund ran, then M8 once it did.
    expect(ids(stack.mailsTo(person.email)).filter((id) => id === "M8_RECEIVED" || id === "M8")).toEqual(["M8_RECEIVED", "M8"]);
    // P2-M39, the withdrawal's money: the fake xMoney refunded exactly that amount from the payment, as one refund
    // transaction (a partial refund leaves the payment complete-ok), and M8 names the same amount.
    const payment = await paymentOf(chargeRef);
    expect([payment.refundedCents, payment.transactionStatus]).toEqual([expectedCents, "complete-ok"]);
    expect(refundsAtXMoney(payment.id)).toEqual([expectedCents]);
    const m8 = stack.mailsTo(person.email).find((mail) => mail.templateId === "M8")!;
    expect(m8.params.refundAmount).toBe((expectedCents / 100).toFixed(2));
    // The plan is already withdrawn, so a replay is refused before its grant is read. The grant itself was spent
    // inside the withdrawal's own transaction by billing.consume_withdrawal_grant (P12a).
    const replay = await stack.post(person, "/v1/billing/subscription/withdraw", { step_up_grant: grant });
    expect([replay.status, replay.body.error]).toEqual([409, "NOT_SUBSCRIBED"]);
    const spent = await stack.database.pool.query<{ spent: boolean }>(
      "SELECT consumed_at IS NOT NULL AS spent FROM identity.step_up_grant WHERE session_id = $1 AND action = 'WITHDRAW_SUBSCRIPTION'",
      [person.identity.authenticated.session.session_id]
    );
    expect(spent.rows.map((row) => row.spent)).toEqual([true]);
  });

  it("the emailed cancel link cancels only on its button, once, and the plan ends at the period end", async () => {
    // This person's row names a version the archive does not hold (a hash never published): M1 must attach nothing
    // rather than today's file as "the Terms you accepted".
    const person = await stack.signUp("cancel.person@example.test", "RO", "OLDER");
    await stack.subscribe(person, "PLUS", "RO");
    const m1 = stack.mailsTo(person.email).find((mail) => mail.templateId === "M1")!;
    expect((m1.attachments ?? []).map((attachment) => attachment.filename)).toEqual(["withdrawal-form.txt"]);
    const raw = stack.mail.messages.find((message) => message.mail === m1)!.raw;
    expect(raw).not.toContain('filename="terms-of-service.txt"');
    const unknown = await stack.post(null, "/v1/billing/cancel-link", { email: "nobody@example.test" });
    const known = await stack.post(null, "/v1/billing/cancel-link", { email: person.email });
    expect([unknown.status, known.status]).toEqual([202, 202]);
    expect([unknown.body, known.body]).toEqual([{ status: "ACCEPTED" }, { status: "ACCEPTED" }]);
    const m9 = await stack.waitForMail(person.email, "M9");
    const link = new URL(m9.params.cancelLinkUrl!);
    expect(link.origin).toBe(TEST_APP_ORIGIN);            // PUBLIC_APP_URL's origin (R-7), as the stack composes it
    expect(link.pathname).toBe("/cancel");
    expect(link.search).toBe("");
    const token = /^#token=([A-Za-z0-9_-]{43})$/.exec(link.hash)![1]!;
    expect(await stack.cancelRequested(person.ownerRef)).toBe(false);
    expect((await stack.post(null, "/v1/billing/cancel-by-token", { token })).status).toBe(204);
    expect(await stack.cancelRequested(person.ownerRef)).toBe(true);
    const spent = await stack.post(null, "/v1/billing/cancel-by-token", { token });
    expect([spent.status, spent.body.error]).toEqual([404, "CANCEL_LINK_INVALID"]);
    await stack.runJobs();
    expect(ids(stack.mailsTo(person.email))).toContain("M7");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("PLUS");
    stack.advanceDays(32);
    await stack.runRenewals();
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ENDED");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("FREE");
    // The unknown address never received anything, however long it waited.
    expect(stack.mailsTo("nobody@example.test")).toHaveLength(0);
  });

  it("a card issued in an always-blocked country is refunded in full and gives no plan", async () => {
    const person = await stack.signUp("blocked.card@example.test", "RO");
    const quote = await stack.quote(person, "PLUS");
    const checkout = await stack.checkout(person, String(quote.body.quote_ref));
    const chargeRef = String(checkout.body.charge_ref);
    const notice = await stack.pay(checkout, "RU");
    await stack.notify(notice.opensslResult);
    await stack.runJobs();
    expect(stack.xmoney.transactions.get(notice.transactionId)?.transactionStatus).toBe("refund-ok");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("FREE");
    // P2-M39: the checkout it paid for ends (abandoned, the card's country named), not merely "not active".
    const billing = new BillingRepository(stack.database.pool);
    const ended = await billing.subscriptionForOwner(person.ownerRef);
    expect(ended).toMatchObject({ status: "ENDED", endedCause: "ABANDONED" });
    expect((await billing.subscriptionEvents(ended!.subscriptionId)).at(-1))
      .toMatchObject({ kind: "ENDED", data: { cause: "ABANDONED", reason: "CARD_COUNTRY_BLOCKED" } });
    expect(ids(stack.mailsTo(person.email))).toContain("M11");
    // The whole payment went back at the fake xMoney, and M11 names that amount.
    const payment = stack.xmoney.transactions.get(notice.transactionId)!;
    expect([payment.amountCents, payment.refundedCents]).toEqual([2_420, 2_420]);
    expect(refundsAtXMoney(payment.id)).toEqual([2_420]);
    expect(stack.mailsTo(person.email).find((mail) => mail.templateId === "M11")!.params.refundAmount).toBe("24.20");
    // What P19's waiting screen reads: a refused card, refunded, never "no money was taken".
    expect((await stack.get(person, `/v1/billing/charges/${chargeRef}`)).body)
      .toEqual({ state: "FAILED", reason_code: "CARD_COUNTRY_BLOCKED" });
    const evidence = await stack.database.pool.query<{ verdict: string }>(
      "SELECT verdict FROM billing.location_evidence WHERE charge_id = $1", [chargeRef]
    );
    expect(evidence.rows.map((row) => row.verdict)).toEqual(["BLOCKED"]);
  });

  it("takes no money from an account that still owes its one-time age check (P8c's guard, R3-2)", async () => {
    // An account from before the age gate: no identity.age_check row, so 0077's read answers 'required'. The UI would
    // send it to the interstitial first; the server refuses on its own, whatever the UI did.
    const person = await stack.signUp("age.owed@example.test", "DE", "CURRENT", "OWED");
    const quote = await stack.quote(person, "PLUS");
    expect(quote.status).toBe(200);
    const refused = await stack.checkout(person, String(quote.body.quote_ref));
    expect([refused.status, refused.body.error]).toEqual([403, "AGE_CONFIRMATION_REQUIRED"]);
    const charges = await stack.database.pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM billing.charge WHERE owner_ref = $1", [person.ownerRef]
    );
    expect(charges.rows[0]!.count).toBe("0");
    expect(await stack.subscriptionStatus(person.ownerRef)).toBeNull();
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("FREE");
  });

  it("a renewal whose answer was lost is adopted under the moved clock, never charged twice (A2, the stage adapter)", async () => {
    // Last on purpose: every earlier subscription has ended, so this person's order is the only one renewing.
    const person = await stack.signUp("stalled.renewal@example.test", "DE", "NONE");
    await stack.subscribe(person, "PLUS", "DE");
    const order = await stack.xmoneyOrderOf(person.ownerRef);
    expect(order).not.toBeNull();
    const rebills = () => [...stack.xmoney.transactions.values()]
      .filter((transaction) => String(transaction.orderId) === order && transaction.transactionSource === "re-bill");
    // The fake takes the rebill (a complete-ok transaction, stamped with REAL time) and never answers.
    stack.xmoney.stallNextRebill();
    stack.advanceDays(31);
    await stack.runRenewals();
    expect(rebills()).toHaveLength(1);
    const unknown = await stack.database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM billing.charge_event e JOIN billing.charge c ON c.charge_id = e.charge_id
       WHERE c.owner_ref = $1 AND c.kind = 'RENEWAL' AND e.kind = 'SUBMIT_UNKNOWN'`, [person.ownerRef]
    );
    expect(unknown.rows[0]!.count).toBe("1");
    // An hour later, past A2's 30 quiet minutes: the adoption check asks xMoney from the charge's (moved) creation
    // time; translated to real time it finds the transaction, so nothing is submitted again.
    stack.advanceDays(1 / 24);
    await stack.runRenewals();
    expect(rebills()).toHaveLength(1);
    const succeeded = await stack.database.pool.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM billing.charge_event e JOIN billing.charge c ON c.charge_id = e.charge_id
       WHERE c.owner_ref = $1 AND c.kind = 'RENEWAL' AND e.kind = 'SUCCEEDED'`, [person.ownerRef]
    );
    expect(succeeded.rows[0]!.count).toBe("1");
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ACTIVE");
    // With no acceptance row at all, M1 carried the withdrawal form only.
    const m1 = stack.mailsTo(person.email).find((mail) => mail.templateId === "M1")!;
    expect((m1.attachments ?? []).map((attachment) => attachment.filename)).toEqual(["withdrawal-form.txt"]);
  });
});

describe("W12 the runtime's own dead-letter alert, on the fake stack", () => {
  // After the A2 case on purpose: this plan stays ACTIVE, and the A2 case must be the only order renewing.
  it("a Quaderno sale the tax service refuses dies and emails the owner O3 at once, through the runtime's own hook (W12 fix F3)", async () => {
    const person = await stack.signUp("o3.alert@example.test", "DE");
    const quote = await stack.quote(person, "PLUS");
    const checkout = await stack.checkout(person, String(quote.body.quote_ref));
    const chargeRef = String(checkout.body.charge_ref);
    const notice = await stack.pay(checkout, "DE");
    // A revoked Quaderno key: the sale's record is refused (createBillingRuntime's onDead: createDeadJobAlert).
    stack.tax.failNext("TAX_SERVICE_REFUSED");
    await stack.notify(notice.opensslResult);
    await stack.runJobs();
    const sale = await stack.database.pool.query<{ dead: boolean; code: string | null }>(
      "SELECT dead_at IS NOT NULL AS dead, last_error_code AS code FROM billing.outbox WHERE kind = 'QUADERNO_RECORD_SALE' AND ref = $1",
      [chargeRef]
    );
    expect(sale.rows).toEqual([{ dead: true, code: "TAX_SERVICE_REFUSED" }]);
    expect(stack.mailsTo("owner@example.test").filter((mail) => mail.templateId === "O3")).toEqual([
      expect.objectContaining({
        locale: "en",
        params: expect.objectContaining({
          jobKind: "QUADERNO_RECORD_SALE", reference: `charge ${chargeRef}`, reasonCode: "TAX_SERVICE_REFUSED",
          nextSteps: expect.stringContaining(`pnpm billing:invoice --charge ${chargeRef} --kind INVOICE --requeue`)
        })
      })
    ]);
    // The plan itself is unaffected: the payment was taken and the plan is live.
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("PLUS");
  });
});

describe("P2-M39 four more journeys on the fake stack", () => {
  // After the W12 case on purpose: the plans these cases leave live must not renew under an earlier case's clock moves,
  // and the A2 case must stay the only order renewing there. None of these cases moves the clock except the last.
  it("an upgrade charges the prorated difference with fresh tax and adds the new plan's credit for the rest of the period", async () => {
    const person = await stack.signUp("upgrade.person@example.test", "DE");
    await stack.subscribe(person, "PLUS", "DE");
    const billing = new BillingRepository(stack.database.pool);
    const before = (await billing.subscriptionForOwner(person.ownerRef))!;
    const quoted = await stack.post(person, "/v1/billing/subscription/upgrade-quote", { plan_id: "PRO" });
    expect(quoted.status).toBe(200);
    const quoteRef = String(quoted.body.quote_ref);
    const quote = (await billing.quote(quoteRef, person.ownerRef))!;
    // Pro's 50.00 less the Plus price paid (20.00), for the part of the period still to run, then Germany's 19 %.
    const net = upgradeProrationMicros({
      oldNetMicros: 20_000_000, newNetMicros: 50_000_000,
      periodStart: before.currentPeriodStart!, periodEnd: before.currentPeriodEnd!, now: quote.createdAt
    });
    const tax = fakeTaxMicros(net, 1_900);
    expect(net).toBeGreaterThan(0);
    expect(net).toBeLessThanOrEqual(30_000_000);
    expect(quoted.body).toMatchObject({
      plan_id: "PRO", net: microsToDecimal(net), tax: microsToDecimal(tax), total: microsToDecimal(net + tax),
      tax_country: "DE", tax_rate_basis_points: 1_900, recurring_total: "59.50",
      renews_on: before.currentPeriodEnd!.toISOString()
    });

    const upgraded = await stack.post(person, "/v1/billing/subscription/upgrade", { plan_id: "PRO", quote_ref: quoteRef });
    expect(upgraded.status).toBe(200);
    const chargeRef = String(upgraded.body.charge_ref);
    await stack.runJobs();
    expect((await stack.get(person, `/v1/billing/charges/${chargeRef}`)).body).toEqual({ state: "SUCCEEDED", reason_code: null });
    // The prorated total is what the fake xMoney rebilled on the saved order, and what the tax service recorded.
    const [charge] = await chargesOf(person.ownerRef, "UPGRADE");
    expect(charge).toMatchObject({ chargeId: chargeRef, net: String(net), tax: String(tax), total: String(net + tax), quoteKind: "UPGRADE" });
    const rebill = await paymentOf(chargeRef);
    expect([rebill.transactionSource, rebill.amountCents, String(rebill.orderId)])
      .toEqual(["re-bill", (net + tax) / 10_000, before.xmoneyOrderId]);
    expect(stack.tax.sales.filter((sale) => sale.chargeId === chargeRef).map((sale) => sale.lines.map((line) => [line.netMicros, line.taxMicros])))
      .toEqual([[[net, tax]]]);

    // The plan is Pro at once, in the same period, with the new total announced; the month credit is Plus's 5.00
    // plus Pro's extra 15.00 for the part of the period still to run when the quote was made (A6).
    const after = (await billing.subscriptionForOwner(person.ownerRef))!;
    expect(after).toMatchObject({
      status: "ACTIVE", planId: "PRO", currentPeriodStart: before.currentPeriodStart, currentPeriodEnd: before.currentPeriodEnd,
      announcedTotalMicros: 59_500_000
    });
    const credit = upgradeMonthCreditOverrideMicros({
      currentMonthCreditMicros: 5_000_000, oldPlanCreditMicros: 5_000_000, newPlanCreditMicros: 20_000_000,
      periodStart: before.currentPeriodStart!, periodEnd: before.currentPeriodEnd!, at: quote.createdAt
    });
    expect(credit).toBeGreaterThan(5_000_000);
    expect(credit).toBeLessThan(20_000_000);
    expect(await new EntitlementRepository(stack.database.pool).current(person.ownerRef, stack.now())).toMatchObject({
      planId: "PRO", cause: "UPGRADED", paidThrough: before.currentPeriodEnd, monthCreditOverrideMicros: credit
    });
  });

  it("a payment whose notice never came is found by one daily money check and settles the plan", async () => {
    const person = await stack.signUp("lost.notice@example.test", "DE");
    const quote = await stack.quote(person, "PLUS");
    const checkout = await stack.checkout(person, String(quote.body.quote_ref));
    const chargeRef = String(checkout.body.charge_ref);
    // xMoney took the money; its notice is lost on the way.
    const paid = await stack.pay(checkout, "DE");
    await stack.runJobs();
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("CREATED");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("FREE");
    const verifications = async () => (await stack.database.pool.query<{ done: boolean; dead: boolean }>(
      "SELECT done_at IS NOT NULL AS done, dead_at IS NOT NULL AS dead FROM billing.outbox WHERE kind = 'VERIFY_PAYMENT' AND ref = $1",
      [paid.transactionId]
    )).rows;
    expect(await verifications()).toEqual([]);

    const report = await stack.reconcileDaily();
    expect(report.enqueued).toBeGreaterThanOrEqual(1);
    expect(await verifications()).toEqual([{ done: true, dead: false }]);
    expect((await stack.get(person, `/v1/billing/charges/${chargeRef}`)).body).toEqual({ state: "SUCCEEDED", reason_code: null });
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ACTIVE");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("PLUS");
    expect(ids(stack.mailsTo(person.email))).toContain("M1");
    expect((await paymentOf(chargeRef)).id).toBe(Number(paid.transactionId));
    // Settled: the next daily check lists the payment again and queues nothing for it.
    await stack.reconcileDaily();
    expect(await verifications()).toEqual([{ done: true, dead: false }]);
    expect(ids(stack.mailsTo(person.email)).filter((id) => id === "M1")).toHaveLength(1);
  });

  it("W7: deleting the account stops the renewal, keeps the paid plan until the erasure, then ends it", async () => {
    const person = await stack.signUp("erasure.person@example.test", "RO");
    await stack.subscribe(person, "PLUS", "RO");
    const order = await stack.xmoneyOrderOf(person.ownerRef);
    const rebills = () => [...stack.xmoney.transactions.values()]
      .filter((transaction) => String(transaction.orderId) === order && transaction.transactionSource === "re-bill");
    await stack.addEmailChannel(person);
    const stepped = await stack.post(person, "/v1/auth/step-up", {
      password: "not-checked-by-the-stack", code: "000000", authorization: { action: "DELETE_ACCOUNT" }
    });
    expect(stepped.status).toBe(200);
    const grant = (stepped.body.step_up_grant as { token: string }).token;
    const scheduled = await stack.delete(person, "/v1/account", { confirmation: "DELETE MY ACCOUNT", step_up_grant: grant });
    expect([scheduled.status, scheduled.body.status]).toEqual([202, "SCHEDULED"]);

    // Scheduled: the renewal is stopped at once (the route's billing hook); the paid plan goes on.
    const billing = new BillingRepository(stack.database.pool);
    const subscription = (await billing.subscriptionForOwner(person.ownerRef))!;
    expect(subscription).toMatchObject({ status: "ACTIVE", planId: "PLUS", cancelRequested: true });
    expect((await billing.subscriptionEvents(subscription.subscriptionId)).at(-1))
      .toMatchObject({ kind: "CANCEL_REQUESTED", data: { source: "ACCOUNT_ERASURE" } });
    expect(await billing.ownerErasurePending(person.ownerRef)).toBe(true);
    // The renewal and maintenance passes and the erasure sweep keep it while the deletion is pending; no M7 is mailed.
    await stack.runRenewals();
    await stack.runtime.erasure.sweep(100);
    await stack.runJobs();
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ACTIVE");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("PLUS");
    expect(ids(stack.mailsTo(person.email))).not.toContain("M7");

    // The erasure runs (its week has passed); the runtime's 10-minute sweep then ends the plan.
    expect(await stack.commitErasure(person)).toBe("COMMITTED");
    await stack.runtime.erasure.sweep(100);
    await stack.runJobs();
    const ended = (await billing.subscriptionForOwner(person.ownerRef))!;
    expect(ended).toMatchObject({ status: "ENDED", endedCause: "ERASURE" });
    expect((await billing.subscriptionEvents(ended.subscriptionId)).at(-1)).toMatchObject({ kind: "ERASURE_STOPPED" });
    expect(await new EntitlementRepository(stack.database.pool).current(person.ownerRef, stack.now()))
      .toMatchObject({ planId: "FREE", cause: "ERASURE_STOPPED" });
    // Nothing was ever rebilled on the order.
    expect(rebills()).toHaveLength(0);
  });

  it("the owner jobs: a dead SmartBill invoice emails O3 at once, and the quarter's summary O1 lists it, once", async () => {
    // Last on purpose: it may move the clock to the summary's due time.
    const person = await stack.signUp("o1.summary@example.test", "RO");
    stack.invoices.failNext("INVOICE_SERVICE_REFUSED");
    const chargeRef = await stack.subscribe(person, "PLUS", "RO");
    expect(await stack.entitlementPlan(person.ownerRef)).toBe("PLUS");
    expect(stack.mailsTo("owner@example.test").filter((mail) => mail.templateId === "O3" && mail.params.reference === `charge ${chargeRef}`))
      .toEqual([expect.objectContaining({
        params: expect.objectContaining({
          jobKind: "SMARTBILL_INVOICE", reasonCode: "INVOICE_SERVICE_REFUSED",
          nextSteps: expect.stringContaining(`pnpm billing:invoice --charge ${chargeRef} --kind INVOICE`)
        })
      })]);

    // The quarter's summary is due at 06:00 UTC on the 5th day after the quarter ended (spec §2.5.9).
    const due = taxSummaryJobFor(stack.now());
    if (stack.now() < due.notBefore) stack.advanceDays((due.notBefore.getTime() - stack.now().getTime()) / DAY_MS + 1 / 24);
    expect(await stack.runOwnerJobs()).toBe(1);
    expect(await stack.runOwnerJobs()).toBe(0);
    const summaries = stack.mailsTo("owner@example.test").filter((mail) => mail.templateId === "O1");
    expect(summaries).toHaveLength(1);
    expect(summaries[0]!.params.quarter).toBe(due.quarter.label);
    expect(summaries[0]!.params.summaryText).toContain(chargeRef);
  });
});
