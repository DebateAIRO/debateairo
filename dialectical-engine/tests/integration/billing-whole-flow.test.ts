import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startBillingStack, type BillingStack } from "../support/billingStack.js";
import { TEST_APP_ORIGIN } from "../support/httpSession.js";

/**
 * P23 — the paid-plans whole flow on the fake stack (spec 2026-09-29 §2.8; R-26): embedded Postgres, fake xMoney,
 * FakeTaxEngine, FakeInvoiceIssuer, and the real routes and jobs of P7–P16. CI skips integration suites: run this
 * before every merge that touches billing.
 */
let stack: BillingStack;

beforeAll(async () => { stack = await startBillingStack(); }, 600_000);
afterAll(async () => { await stack?.stop(); });

const ids = (stackMails: ReadonlyArray<{ templateId: string }>): string[] => stackMails.map((mail) => mail.templateId);

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

    // Renewal: the period ends, the saved card is charged again, the plan stays.
    stack.advanceDays(31);
    await stack.runRenewals();
    expect(await stack.subscriptionStatus(person.ownerRef)).toBe("ACTIVE");
    expect(ids(stack.mailsTo(person.email)).filter((id) => id === "M2_INVOICE_ATTACHED")).toHaveLength(2);

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
    // The grant is spent by billing.consume_withdrawal_grant (P12a): a replay is refused.
    const replay = await stack.post(person, "/v1/billing/subscription/withdraw", { step_up_grant: grant });
    expect(replay.status).toBeGreaterThanOrEqual(400);
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
    expect(await stack.subscriptionStatus(person.ownerRef)).not.toBe("ACTIVE");
    expect(ids(stack.mailsTo(person.email))).toContain("M11");
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
