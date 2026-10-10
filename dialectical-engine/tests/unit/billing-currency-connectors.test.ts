import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PriceCurrency, RefundRecord, SaleRecord, TaxLocation } from "@debateai/billing-core";
import { SmartBillInvoiceIssuer } from "@debateai/invoice-smartbill";
import { QuadernoTaxEngine } from "@debateai/tax-quaderno";
import { FakeTaxEngine } from "../support/fake-tax-engine.js";
import { startFakeQuaderno, type FakeQuaderno } from "../support/fake-quaderno.js";
import { startFakeSmartBill, type FakeSmartBill } from "../support/fake-smartbill.js";
import { smartbillRecordingRefund, smartbillRecordingSale } from "../../tools/billing/record-connector.js";

/**
 * Spec 2026-10-05 §2.16.4 (Part C): the tax is asked in the subscription's currency, and the answer is priced in the
 * currency asked, or the quote is not ours to charge. Task C2: every Quaderno record and every SmartBill invoice or
 * credit note is in the charge's currency, and SmartBill is never sent an exchange rate.
 */
const LOCATION: TaxLocation = Object.freeze({
  country: "DE", region: null, postalCode: "10115", city: "Berlin", street: null, ip: "198.51.100.7"
});
const DATE = new Date("2026-10-10T08:00:00.000Z");

let fake: FakeQuaderno;
let engine: QuadernoTaxEngine;
let smartBill: FakeSmartBill;
let issuer: SmartBillInvoiceIssuer;

beforeAll(async () => {
  fake = await startFakeQuaderno();
  engine = new QuadernoTaxEngine({ baseUrl: fake.baseUrl, apiKey: fake.apiKey, timeoutMs: 2_000 });
  smartBill = await startFakeSmartBill({ minGapMs: 50 });
  issuer = new SmartBillInvoiceIssuer({
    baseUrl: smartBill.baseUrl, username: smartBill.username, token: smartBill.token, companyCif: smartBill.companyCif,
    series: smartBill.series, minGapMs: 60, timeoutMs: 2_000
  });
});
afterAll(async () => { await fake.stop(); await smartBill.stop(); });

const ask = (currency: PriceCurrency) => engine.quote({
  netMicros: 20_000_000, currency, location: LOCATION, taxId: null, taxCode: "saas", date: DATE
});

describe("Quaderno is asked in the subscription's currency", () => {
  it.each(["EUR", "RON", "USD"] as const)("a quote in %s sends that currency and keeps the cents answered", async (currency) => {
    const before = fake.requests.length;
    const quote = await ask(currency);
    const sent = fake.requests.slice(before).find((request) => request.path === "/api/tax_rates/calculate");
    expect(sent?.query.currency).toBe(currency);
    expect(sent?.query.amount).toBe("20.00");
    expect(quote).toMatchObject({ netMicros: 20_000_000, taxMicros: 3_800_000, totalMicros: 23_800_000, taxCountry: "DE" });
  });

  it("refuses an answer priced in another currency than the one asked (QUADERNO_CURRENCY_MISMATCH)", async () => {
    fake.overrideNextCalculation({ currency: '"USD"' });
    await expect(ask("EUR")).rejects.toThrowError(expect.objectContaining({
      code: "TAX_SERVICE_REFUSED", message: "QUADERNO_CURRENCY_MISMATCH"
    }));
  });

  it("the in-memory fake records the currency of every quote asked", async () => {
    const tax = new FakeTaxEngine();
    await tax.quote({ netMicros: 100_000_000, currency: "RON", location: { ...LOCATION, country: "RO" }, taxId: null, taxCode: "saas", date: DATE });
    await tax.quote({ netMicros: 20_000_000, currency: "EUR", location: LOCATION, taxId: null, taxCode: "saas", date: DATE });
    expect(tax.quotedCurrencies).toEqual(["RON", "EUR"]);
  });
});

const ROMANIAN_BUYER: SaleRecord["customer"] = Object.freeze({
  name: "Ion Popescu", email: "person@example.test", country: "RO", region: "Cluj", postalCode: "400001",
  city: "Cluj-Napoca", street: "Str. Exemplu 1", taxId: null, locale: "ro"
});
const GERMAN_BUYER: SaleRecord["customer"] = Object.freeze({
  name: "Test Person", email: "person@example.test", country: "DE", region: null, postalCode: "10115",
  city: "Berlin", street: null, taxId: null, locale: "de"
});

const saleIn = (currency: PriceCurrency, chargeId: string, transactionId: string, line: Readonly<{
  netMicros: number; taxMicros: number; taxRateBasisPoints: number;
}>, customer: SaleRecord["customer"]): SaleRecord => ({
  chargeId, transactionId, issuedOn: new Date("2026-10-10T08:00:00Z"), currency, customer,
  lines: [{ description: "DebateAI Plus, October 2026", ...line }],
  taxCode: "saas", evidence: { billingCountry: customer.country, ipAddress: "203.0.113.10", bankCountry: customer.country },
  processor: "netopia"
});

describe("Quaderno records every sale and refund in the charge's currency", () => {
  it("an EUR sale and its refund are sent with currency EUR", async () => {
    const chargeId = "e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0e0";
    const sale = saleIn("EUR", chargeId, "8801", { netMicros: 20_000_000, taxMicros: 3_800_000, taxRateBasisPoints: 1900 }, GERMAN_BUYER);
    const document = await engine.recordSale(sale);
    const refund: RefundRecord = {
      chargeId, transactionId: "8801", issuedOn: new Date("2026-10-12T08:00:00Z"), currency: "EUR",
      refundTotalMicros: 23_800_000, original: { documentId: document.documentId, number: document.number },
      description: "Rückerstattung DebateAI Plus", processor: "netopia"
    };
    await engine.recordRefund(refund);
    expect(fake.sales.find((recorded) => recorded.processor_id === "8801")).toMatchObject({ type: "sale", currency: "EUR" });
    expect(fake.refunds.find((recorded) => recorded.processor_id === "8801")).toMatchObject({ type: "refund", currency: "EUR" });
  });
});

describe("SmartBill invoices in the charge's currency, never with an exchange rate", () => {
  const noExchangeRate = (body: unknown) => expect(JSON.stringify(body)).not.toMatch(/exchangerate/iu);

  it("a RON invoice says RON on the document and on its product, tax included, with no exchange rate", async () => {
    const issued = await issuer.issue(saleIn("RON", "e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e1", "8811",
      { netMicros: 100_000_000, taxMicros: 21_000_000, taxRateBasisPoints: 2100 }, ROMANIAN_BUYER));
    const body = smartBill.invoices.get(issued.externalRef)!.body;
    expect(body).toMatchObject({
      currency: "RON",
      products: [{ currency: "RON", price: 121, quantity: 1, isTaxIncluded: true, taxPercentage: 21 }]
    });
    noExchangeRate(body);
  });

  it.each([
    ["EUR", "e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2e2"],
    ["USD", "e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3"]
  ] as const)("an invoice in %s is in that currency, with no exchange rate", async (currency, chargeId) => {
    const issued = await issuer.issue(saleIn(currency, chargeId, "8812",
      { netMicros: 20_000_000, taxMicros: 4_200_000, taxRateBasisPoints: 2100 }, ROMANIAN_BUYER));
    const body = smartBill.invoices.get(issued.externalRef)!.body;
    expect(body).toMatchObject({ currency, products: [{ currency, price: 24.2 }] });
    noExchangeRate(body);
  });

  it("a partial credit of a RON invoice is a negative RON line", async () => {
    const chargeId = "e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4";
    const original = await issuer.issue(saleIn("RON", chargeId, "8813",
      { netMicros: 100_000_000, taxMicros: 21_000_000, taxRateBasisPoints: 2100 }, ROMANIAN_BUYER));
    const partial = await issuer.creditPartial({
      chargeId, transactionId: "8813", issuedOn: new Date("2026-10-12T08:00:00Z"), currency: "RON",
      refundTotalMicros: 60_500_000, original: { documentId: original.externalRef, number: original.number },
      description: "Rambursare DebateAI Plus", processor: "netopia",
      series: original.series, number: original.number, taxRateBasisPoints: 2100, customer: ROMANIAN_BUYER
    });
    const body = smartBill.invoices.get(partial.externalRef)!.body;
    expect(body).toMatchObject({ currency: "RON", products: [{ currency: "RON", quantity: -1, price: 60.5 }] });
    noExchangeRate(body);
  });

  it("the owner's SmartBill recording issues its Romanian sale and part-credits it in RON (spec 2026-10-05 §2.16.1)", async () => {
    const chargeId = "e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5";
    const sale = smartbillRecordingSale(chargeId, DATE);
    const issued = await issuer.issue(sale);
    const partial = await issuer.creditPartial({
      ...smartbillRecordingRefund(chargeId, DATE, issued, 500_000), series: issued.series, number: issued.number,
      taxRateBasisPoints: 2100, customer: sale.customer
    });
    for (const externalRef of [issued.externalRef, partial.externalRef]) {
      const body = smartBill.invoices.get(externalRef)!.body;
      expect(body).toMatchObject({ currency: "RON", products: [{ currency: "RON" }] });
      noExchangeRate(body);
    }
  });
});
