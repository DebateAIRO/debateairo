import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decimalToMicros } from "@debateai/billing-core";
import { loadPaidCharge, saleRecordOf } from "../../apps/api/src/billing/invoice-common.js";
import { createQuadernoRefundHandler, createQuadernoSaleHandler } from "../../apps/api/src/billing/invoice-quaderno.js";
import { englishOrderText, invoiceDate, type BillingOrderText } from "../../apps/api/src/billing/order-text.js";
import { PROFILE_ADDRESS_ONLY, testBillingPolicy } from "../support/billingFixtures.js";
import { startBillingHarness, TEST_PUBLIC_APP_URL, type BillingHarness } from "../support/billingHarness.js";

let h: BillingHarness;
beforeAll(async () => {
  h = await startBillingHarness();
  const deps = { repository: h.repository, tax: h.tax, recordsKey: h.recordsKey, recipients: PROFILE_ADDRESS_ONLY, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL, audit: h.audit, xmoneyEnvironment: "stage" as const, paymentEnvironment: "sandbox" as const };
  h.worker.register("QUADERNO_RECORD_SALE", createQuadernoSaleHandler(deps));
  h.worker.register("QUADERNO_RECORD_REFUND", createQuadernoRefundHandler(deps));
});
afterAll(async () => { await h?.stop(); });

async function activateInGermany() {
  h.geo.country = "DE";
  const paid = await h.activate({ country: "DE", cardCountry: "DE" });
  await h.worker.drain(5);
  return paid;
}
const invoices = async (chargeId: string) => (await h.database.pool.query(
  "SELECT issuer, kind, number, external_ref FROM billing.invoice WHERE charge_id=$1 ORDER BY kind", [chargeId]
)).rows;
const intents = async (chargeId: string) => (await h.database.pool.query(
  "SELECT kind, issuer FROM billing.invoice_intent WHERE charge_id=$1 ORDER BY kind", [chargeId]
)).rows;

/** A German sale paid and verified while Quaderno cannot be reached: its sale job fails once and waits for a retry. */
async function settleWithSaleOutage() {
  h.geo.country = "DE";
  const bought = await h.buy({ country: "DE" });
  await h.storeCardToken(bought.chargeId, { cardCountry: "DE" });
  h.payments.pay(bought.chargeId, { amountMicros: decimalToMicros(bought.totalDecimal), cardCountry: "DE" });
  // After the quote (which would take the failure itself), before VERIFY_PAYMENT queues the sale.
  h.tax.failNext("TAX_SERVICE_UNAVAILABLE");
  await h.settle(bought.chargeId);
  return { bought };
}

describe("P10a Quaderno invoices", () => {
  it("records the sale once with its evidence, stores the invoice and sends M2 with the PDF link", async () => {
    const paid = await activateInGermany();
    const sales = h.tax.sales.filter((sale) => sale.chargeId === paid.chargeId);
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({
      transactionId: paid.payment.providerPaymentId, taxCode: "saas",
      // The street the buyer typed for NETOPIA's cardholder (spec 2026-10-05 §2.6.1, the harness's buyer).
      customer: { email: `buyer-${paid.userId.slice(0, 8)}@example.test`, country: "DE", city: "Sector 1", street: "Strada Test 1", taxId: null, locale: "en" },
      lines: [{ netMicros: 20_000_000, taxMicros: 3_800_000, taxRateBasisPoints: 1_900 }],
      evidence: { billingCountry: "DE", ipAddress: "198.51.100.7", bankCountry: "DE" }
    });
    const [invoice] = await invoices(paid.chargeId);
    expect(invoice).toMatchObject({ issuer: "QUADERNO", kind: "INVOICE" });
    const mail = (await h.outboxRows(paid.chargeId)).find((row) => row.ref === `M2_INVOICE_LINK:${paid.chargeId}`);
    expect(mail?.payload).toMatchObject({ "param.invoiceUrl": expect.stringMatching(/^https:\/\/quaderno\.test\/documents\//), "param.plan": "PLUS" });
    await h.repository.withTransaction((client) => h.repository.enqueue(client, {
      kind: "QUADERNO_RECORD_SALE", ref: paid.chargeId, notBefore: h.clock.now, payload: {}
    }));
    await h.worker.drain(5);
    expect(h.tax.sales.filter((sale) => sale.chargeId === paid.chargeId)).toHaveLength(1);
    expect(await invoices(paid.chargeId)).toHaveLength(1);
  });

  it("records a US sale under the state Quaderno priced from the ZIP code, never the state the buyer typed (C-8)", async () => {
    // Part 4 final review C-8: ZIP 75001 is Texas, where the fakes charge sales tax; the buyer typed "NY". The quote
    // took Texas's rate (its taxRegion TX), so Quaderno's sale record carries TX as the customer's region (and each tax
    // line's, which recordSale reads from it), as O1 groups it.
    h.geo.country = "US";
    const texas = await h.activate({ country: "US", cardCountry: "US", postalCode: "75001", region: "NY" });
    await h.worker.drain(5);
    expect((await h.repository.quote(texas.quoteId, texas.ownerRef))).toMatchObject({ taxCountry: "US", taxRegion: "TX", taxStatus: "TAXABLE" });
    const [sale] = h.tax.sales.filter((recorded) => recorded.chargeId === texas.chargeId);
    expect(sale?.customer).toMatchObject({ country: "US", region: "TX", postalCode: "75001" });
    expect(sale?.lines).toEqual([expect.objectContaining({ taxRateBasisPoints: 625 })]);
    // Where Quaderno named no region (New York's ZIP, where the fakes are not registered), none is sent: never the
    // typed text.
    const newYork = await h.activate({ country: "US", cardCountry: "US", postalCode: "10001", region: "Texas" });
    await h.worker.drain(5);
    expect(h.tax.sales.find((recorded) => recorded.chargeId === newYork.chargeId)?.customer).toMatchObject({ country: "US", region: null });
    // Outside the US and Canada the typed region stays (a Romanian county SmartBill needs, R-15; the EU's VAT has none).
    const germany = await activateInGermany();
    expect(h.tax.sales.find((recorded) => recorded.chargeId === germany.chargeId)?.customer).toMatchObject({ region: "Bucuresti" });
    // Canada follows the same rule (Part 4's re-review M-7): the region Quaderno priced, never the typed one. The
    // fakes price no Canadian region, so the Texas charge stands in with a Canadian buyer and quote.
    const loaded = (await loadPaidCharge({ repository: h.repository, recordsKey: h.recordsKey, recipients: PROFILE_ADDRESS_ONLY }, texas.chargeId))!;
    const canadian = { ...loaded, location: { ...loaded.location, country: "CA", region: "Quebec" }, quote: { ...loaded.quote, taxRegion: "ON" } };
    expect(saleRecordOf(canadian, {}, "saas").customer).toMatchObject({ country: "CA", region: "ON" });
  });

  it("dead-letters a sale Quaderno refuses", async () => {
    h.geo.country = "DE";
    const bought = await h.buy({ country: "DE" });
    await h.storeCardToken(bought.chargeId, { cardCountry: "DE" });
    h.payments.pay(bought.chargeId, { amountMicros: decimalToMicros(bought.totalDecimal), cardCountry: "DE" });
    // After the quote (which would take the failure itself), before VERIFY_PAYMENT queues the sale.
    h.tax.failNext("TAX_SERVICE_REFUSED");
    await h.settle(bought.chargeId);
    const job = (await h.outboxRows(bought.chargeId)).find((row) => row.kind === "QUADERNO_RECORD_SALE");
    expect(job).toMatchObject({ dead: true, lastErrorCode: "TAX_SERVICE_REFUSED" });
  });

  it("retries a sale Quaderno could not reach, with its intent on record first, then invoices it once", async () => {
    const { bought } = await settleWithSaleOutage();
    const sale = (await h.outboxRows(bought.chargeId)).find((row) => row.kind === "QUADERNO_RECORD_SALE");
    expect(sale).toMatchObject({ done: false, dead: false, lastErrorCode: "TAX_SERVICE_UNAVAILABLE" });
    // A17a: the intent is on record before Quaderno is called, so it survives the failed call.
    expect(await intents(bought.chargeId)).toEqual([{ kind: "INVOICE", issuer: "QUADERNO" }]);
    expect(await invoices(bought.chargeId)).toEqual([]);
    expect(h.tax.sales.filter((recorded) => recorded.chargeId === bought.chargeId)).toEqual([]);

    // The first retry falls 60 seconds later (failureRetryAt).
    h.clock.advance(61_000);
    await h.worker.drain(5);
    expect(h.tax.sales.filter((recorded) => recorded.chargeId === bought.chargeId)).toHaveLength(1);
    expect((await invoices(bought.chargeId)).map((row) => row.kind)).toEqual(["INVOICE"]);
    expect(await intents(bought.chargeId)).toHaveLength(1);
    expect((await h.outboxRows(bought.chargeId)).filter((row) => row.ref === `M2_INVOICE_LINK:${bought.chargeId}`)).toHaveLength(1);
  });

  it("a credit note waits for its original invoice", async () => {
    const { bought } = await settleWithSaleOutage();
    // The payment is voided after it succeeded, while its sale is still waiting for Quaderno.
    h.payments.setState(bought.chargeId, "VOIDED");
    await h.settle(bought.chargeId);
    await h.worker.drain(5);
    const waiting = (await h.outboxRows(bought.chargeId)).find((row) => row.kind === "QUADERNO_RECORD_REFUND");
    expect(waiting).toMatchObject({ done: false, dead: false, lastErrorCode: "INVOICE_ORIGINAL_MISSING" });
    expect(h.tax.refunds.filter((recorded) => recorded.chargeId === bought.chargeId)).toEqual([]);

    // Both jobs are due 60 seconds later; whichever runs first, the credit note follows within the next retry delays.
    const stillOpen = async () => (await h.outboxRows(bought.chargeId))
      .some((row) => (row.kind === "QUADERNO_RECORD_SALE" || row.kind === "QUADERNO_RECORD_REFUND") && !row.done && !row.dead);
    h.clock.advance(61_000);
    await h.worker.drain(5);
    for (let round = 0; round < 3 && await stillOpen(); round += 1) {
      h.clock.advance(5 * 60_000);
      await h.worker.drain(5);
    }
    const issued = await invoices(bought.chargeId);
    expect(issued.map((row) => row.kind)).toEqual(["CREDIT_NOTE", "INVOICE"]);
    const original = issued.find((row) => row.kind === "INVOICE")!;
    const refunds = h.tax.refunds.filter((recorded) => recorded.chargeId === bought.chargeId);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]!.original).toEqual({ documentId: original.external_ref, number: original.number });
  });

  it("issues the credit note for a full refund (a void after success) against the original invoice", async () => {
    const paid = await activateInGermany();
    h.payments.setState(paid.chargeId, "VOIDED");
    await h.settle(paid.chargeId);
    await h.worker.drain(5);
    const refund = h.tax.refunds.find((recorded) => recorded.chargeId === paid.chargeId);
    // `invoices` sorts by kind, so once the credit note exists it comes first: pick the INVOICE row itself.
    const original = (await invoices(paid.chargeId)).find((row) => row.kind === "INVOICE");
    const loaded = (await loadPaidCharge({ repository: h.repository, recordsKey: h.recordsKey, recipients: PROFILE_ADDRESS_ONLY }, paid.chargeId))!;
    expect(refund).toMatchObject({
      transactionId: paid.payment.providerPaymentId, refundTotalMicros: 23_800_000,
      original: { documentId: original!.external_ref, number: original!.number },
      // The credit line in the buyer's language, for the period it credits (P5/P4's RefundRecord.description).
      description: `DebateAI Plus plan, ${invoiceDate(loaded.period.start, "en")} to ${invoiceDate(loaded.period.end, "en")}`
    });
    expect((await invoices(paid.chargeId)).map((row) => row.kind)).toEqual(["CREDIT_NOTE", "INVOICE"]);
  });

  it("issues no credit note for a forged QUADERNO_RECORD_REFUND row of a payment never refunded (P2-I5)", async () => {
    const paid = await activateInGermany();
    const ref = `${paid.chargeId}:${paid.payment.providerPaymentId}`;
    // What a process holding the runtime role could insert: a credit note for the whole sale, with no refund behind it.
    await h.repository.withTransaction((client) => h.repository.enqueue(client, {
      kind: "QUADERNO_RECORD_REFUND", ref, notBefore: h.clock.now,
      payload: { charge_id: paid.chargeId, transaction_id: paid.payment.providerPaymentId, refund_micros: 23_800_000 }
    }));
    await h.worker.drain(5);
    const forged = async () => (await h.outboxRows(ref)).find((row) => row.kind === "QUADERNO_RECORD_REFUND");
    expect(await forged()).toMatchObject({ done: false, dead: false, lastErrorCode: "CREDIT_NOTE_REFUND_MISSING" });
    // It waits through the failure schedule (1m, 5m, 30m, 2h, 12h), then dies, and nothing is ever issued.
    for (const delayMs of [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]) {
      h.clock.advance(delayMs + 1_000);
      await h.worker.drain(5);
    }
    expect(await forged()).toMatchObject({ dead: true, lastErrorCode: "CREDIT_NOTE_REFUND_MISSING" });
    expect(h.tax.refunds.filter((recorded) => recorded.chargeId === paid.chargeId)).toEqual([]);
    expect((await invoices(paid.chargeId)).map((row) => row.kind)).toEqual(["INVOICE"]);
    expect(await intents(paid.chargeId)).toEqual([{ kind: "INVOICE", issuer: "QUADERNO" }]);
  });

  it("invoices a company under its own name and address; a person's street stays their own", async () => {
    h.geo.country = "DE";
    const company = { name: "Test GmbH", vatId: "DE123VALID", address: "Teststr. 1, 10115 Berlin" };
    const bought = await h.activate({ country: "DE", cardCountry: "DE", company });
    await h.worker.drain(5);
    const sale = h.tax.sales.find((recorded) => recorded.chargeId === bought.chargeId);
    expect(sale?.customer).toMatchObject({ name: "Test GmbH", street: "Teststr. 1, 10115 Berlin", taxId: "DE123VALID" });
    const person = await activateInGermany();
    expect(h.tax.sales.find((recorded) => recorded.chargeId === person.chargeId)?.customer.street).toBe("Strada Test 1");
  });

  it("words the line in the buyer's language over the period the payment bought, not the checkout's", async () => {
    h.geo.country = "DE";
    const bought = await h.buy({ country: "DE" });
    // Paid three days after the checkout: the month starts at the payment (A8c), not at the checkout.
    h.clock.advance(3 * 86_400_000);
    await h.storeCardToken(bought.chargeId, { cardCountry: "DE" });
    const paying = h.payments.pay(bought.chargeId, { amountMicros: decimalToMicros(bought.totalDecimal), cardCountry: "DE" });
    await h.settle(bought.chargeId);
    const loaded = (await loadPaidCharge({ repository: h.repository, recordsKey: h.recordsKey, recipients: PROFILE_ADDRESS_ONLY }, bought.chargeId))!;
    expect(loaded.period.start).toEqual(paying.occurredAt);
    expect(loaded.period.start.getTime()).toBeGreaterThan(loaded.charge.periodStart.getTime());
    const romanian: BillingOrderText = (kind, locale, params) => kind === "INVOICE_LINE" && locale === "ro"
      ? `DebateAI ${params.plan ?? ""}, ${params.from ?? ""} – ${params.to ?? ""}` : englishOrderText(kind, locale, params);
    const line = saleRecordOf({ ...loaded, profile: { ...loaded.profile, locale: "ro" } }, {}, "saas", romanian).lines[0]!.description;
    expect(line).toBe(`DebateAI Plus, ${invoiceDate(loaded.period.start, "ro")} – ${invoiceDate(loaded.period.end, "ro")}`);
    expect(saleRecordOf(loaded, {}, "saas").lines[0]!.description)
      .toBe(`DebateAI Plus plan, ${invoiceDate(loaded.period.start, "en")} to ${invoiceDate(loaded.period.end, "en")}`);
  });
});
