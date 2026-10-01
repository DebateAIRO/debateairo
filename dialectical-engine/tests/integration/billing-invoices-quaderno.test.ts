import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadPaidCharge, saleRecordOf } from "../../apps/api/src/billing/invoice-common.js";
import { createQuadernoRefundHandler, createQuadernoSaleHandler } from "../../apps/api/src/billing/invoice-quaderno.js";
import { englishOrderText, invoiceDate, type BillingOrderText } from "../../apps/api/src/billing/order-text.js";
import { testBillingPolicy } from "../support/billingFixtures.js";
import { startBillingHarness, TEST_PUBLIC_APP_URL, type BillingHarness } from "../support/billingHarness.js";

let h: BillingHarness;
beforeAll(async () => {
  h = await startBillingHarness();
  const deps = { repository: h.repository, tax: h.tax, recordsKey: h.recordsKey, policy: testBillingPolicy, publicAppUrl: TEST_PUBLIC_APP_URL, audit: h.audit };
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

describe("P10a Quaderno invoices", () => {
  it("records the sale once with its evidence, stores the invoice and sends M2 with the PDF link", async () => {
    const paid = await activateInGermany();
    const sales = h.tax.sales.filter((sale) => sale.chargeId === paid.chargeId);
    expect(sales).toHaveLength(1);
    expect(sales[0]).toMatchObject({
      transactionId: paid.transaction.transactionId, taxCode: "saas",
      customer: { email: `buyer-${paid.userId.slice(0, 8)}@example.test`, country: "DE", city: "Bucuresti", street: null, taxId: null, locale: "en" },
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

  it("dead-letters a sale Quaderno refuses", async () => {
    h.geo.country = "DE";
    const bought = await h.buy({ country: "DE" });
    const paying = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "DE" });
    // After the quote (which would take the failure itself), before VERIFY_PAYMENT queues the sale.
    h.tax.failNext("TAX_SERVICE_REFUSED");
    await h.settle(paying.transactionId);
    const job = (await h.outboxRows(bought.chargeId)).find((row) => row.kind === "QUADERNO_RECORD_SALE");
    expect(job).toMatchObject({ dead: true, lastErrorCode: "TAX_SERVICE_REFUSED" });
  });

  it("issues the credit note for a full refund (a void after success) against the original invoice", async () => {
    const paid = await activateInGermany();
    h.xmoney.setStatus(paid.transaction.transactionId, "cancel-ok");
    await h.settle(paid.transaction.transactionId);
    await h.worker.drain(5);
    const refund = h.tax.refunds.find((recorded) => recorded.chargeId === paid.chargeId);
    // `invoices` sorts by kind, so once the credit note exists it comes first: pick the INVOICE row itself.
    const original = (await invoices(paid.chargeId)).find((row) => row.kind === "INVOICE");
    const loaded = (await loadPaidCharge({ repository: h.repository, recordsKey: h.recordsKey }, paid.chargeId))!;
    expect(refund).toMatchObject({
      transactionId: paid.transaction.transactionId, refundTotalMicros: 23_800_000,
      original: { documentId: original!.external_ref, number: original!.number },
      // The credit line in the buyer's language, for the period it credits (P5/P4's RefundRecord.description).
      description: `DebateAI Plus plan, ${invoiceDate(loaded.period.start, "en")} to ${invoiceDate(loaded.period.end, "en")}`
    });
    expect((await invoices(paid.chargeId)).map((row) => row.kind)).toEqual(["CREDIT_NOTE", "INVOICE"]);
  });

  it("invoices a company under its own name and address; a person's street stays their own", async () => {
    h.geo.country = "DE";
    const company = { name: "Test GmbH", vatId: "DE123VALID", address: "Teststr. 1, 10115 Berlin" };
    const bought = await h.activate({ country: "DE", cardCountry: "DE", company });
    await h.worker.drain(5);
    const sale = h.tax.sales.find((recorded) => recorded.chargeId === bought.chargeId);
    expect(sale?.customer).toMatchObject({ name: "Test GmbH", street: "Teststr. 1, 10115 Berlin", taxId: "DE123VALID" });
    const person = await activateInGermany();
    expect(h.tax.sales.find((recorded) => recorded.chargeId === person.chargeId)?.customer.street).toBeNull();
  });

  it("words the line in the buyer's language over the period the payment bought, not the checkout's", async () => {
    h.geo.country = "DE";
    const bought = await h.buy({ country: "DE" });
    // Paid three days after the checkout: the month starts at the payment (A8c), not at the checkout.
    h.clock.advance(3 * 86_400_000);
    const paying = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "DE" });
    await h.settle(paying.transactionId);
    const loaded = (await loadPaidCharge({ repository: h.repository, recordsKey: h.recordsKey }, bought.chargeId))!;
    expect(loaded.period.start).toEqual(paying.createdAt);
    expect(loaded.period.start.getTime()).toBeGreaterThan(loaded.charge.periodStart.getTime());
    const romanian: BillingOrderText = (kind, locale, params) => kind === "INVOICE_LINE" && locale === "ro"
      ? `DebateAI ${params.plan ?? ""}, ${params.from ?? ""} – ${params.to ?? ""}` : englishOrderText(kind, locale, params);
    const line = saleRecordOf({ ...loaded, profile: { ...loaded.profile, locale: "ro" } }, {}, "saas", romanian).lines[0]!.description;
    expect(line).toBe(`DebateAI Plus, ${invoiceDate(loaded.period.start, "ro")} – ${invoiceDate(loaded.period.end, "ro")}`);
    expect(saleRecordOf(loaded, {}, "saas").lines[0]!.description)
      .toBe(`DebateAI Plus plan, ${invoiceDate(loaded.period.start, "en")} to ${invoiceDate(loaded.period.end, "en")}`);
  });
});
