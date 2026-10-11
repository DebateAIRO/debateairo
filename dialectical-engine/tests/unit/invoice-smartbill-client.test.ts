// tests/unit/invoice-smartbill-client.test.ts
import { createServer } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SmartBillInvoiceIssuer } from "@debateai/invoice-smartbill";
import type { InvoiceIssuer, SaleRecord } from "@debateai/billing-core";
import { startFakeSmartBill, type FakeSmartBill } from "../support/fake-smartbill.js";
import { FakeInvoiceIssuer } from "../support/fake-invoice-issuer.js";

let fake: FakeSmartBill;
let issuer: SmartBillInvoiceIssuer;
beforeAll(async () => {
  fake = await startFakeSmartBill({ minGapMs: 50 });
  issuer = new SmartBillInvoiceIssuer({
    baseUrl: fake.baseUrl, username: fake.username, token: fake.token, companyCif: fake.companyCif,
    series: fake.series, minGapMs: 60, timeoutMs: 300
  });
});
afterAll(async () => { await fake?.stop(); });

const customer = (overrides: Partial<SaleRecord["customer"]> = {}): SaleRecord["customer"] => ({
  name: "Ion Popescu", email: "person@example.test", country: "RO", region: "Cluj", postalCode: "400001",
  city: "Cluj-Napoca", street: "Str. Exemplu 1", taxId: null, locale: "ro", ...overrides
});
const sale = (chargeId: string, overrides: Partial<SaleRecord["customer"]> = {}): SaleRecord => ({
  chargeId, transactionId: "9001", issuedOn: new Date("2026-10-01T22:30:00Z"), currency: "USD", customer: customer(overrides),
  lines: [{ description: "DebateAI Plus, octombrie 2026", netMicros: 20_000_000, taxMicros: 4_200_000, taxRateBasisPoints: 2100 }],
  taxCode: "saas", evidence: { billingCountry: "RO", ipAddress: "203.0.113.10", bankCountry: "RO" }, processor: "netopia"
});

async function closedPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

describe("P5 — SmartBill invoices against the fake", () => {
  it("issues a USD invoice for a Romanian consumer with the documented body", async () => {
    const issued = await issuer.issue(sale("a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1"));
    expect(issued).toEqual({ series: fake.series, number: "0001", externalRef: `${fake.series}-0001` });
    const body = fake.invoices.get(issued.externalRef)!.body;
    expect(body).toMatchObject({
      companyVatCode: fake.companyCif, seriesName: fake.series, currency: "USD", isDraft: false,
      issueDate: "2026-10-02",
      mentions: "debateai-charge:a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1",
      client: { name: "Ion Popescu", vatCode: "0000000000000", isTaxPayer: false, country: "Romania", county: "Cluj", city: "Cluj-Napoca", email: "person@example.test" },
      products: [{ name: "DebateAI Plus, octombrie 2026", quantity: 1, price: 24.2, currency: "USD", isTaxIncluded: true, taxName: "Normala", taxPercentage: 21, isService: true }]
    });
  });

  it("sends the charged gross, so SmartBill's own base and VAT come out at the quoted cents (a half-cent case)", async () => {
    // 12.50 net at 21 % is 2.625; the quote (fakeTaxMicros, half up) charged 2.63, so the card paid 15.13.
    const halfCent = { ...sale("a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2"),
      lines: [{ description: "DebateAI Plus, upgrade", netMicros: 12_500_000, taxMicros: 2_630_000, taxRateBasisPoints: 2100 }] };
    const issued = await issuer.issue(halfCent);
    const recorded = fake.invoices.get(issued.externalRef)!;
    expect(recorded.body).toMatchObject({ products: [{ price: 15.13, isTaxIncluded: true, taxPercentage: 21 }] });
    expect(recorded.derived).toEqual([{ baseCents: 1250, vatCents: 263 }]);
  });

  it("refuses a tax more than half a cent from net × rate, or more than one line, before calling SmartBill", async () => {
    const before = fake.requestTimes.length;
    const off = { ...sale("a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3"),
      lines: [{ description: "DebateAI Plus", netMicros: 12_500_000, taxMicros: 2_700_000, taxRateBasisPoints: 2100 }] };
    await expect(issuer.issue(off)).rejects.toMatchObject({ code: "INVOICE_SERVICE_REFUSED", message: "SMARTBILL_TAX_MISMATCH" });
    const twoLines = { ...sale("a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4"), lines: [...sale("a4").lines, ...sale("a4").lines] };
    await expect(issuer.issue(twoLines)).rejects.toMatchObject({ code: "INVOICE_SERVICE_REFUSED", message: "SMARTBILL_TAX_MISMATCH" });
    expect(fake.requestTimes.length).toBe(before);
  });

  it("marks a Romanian VAT payer and refuses an invoice without a buyer name", async () => {
    const issued = await issuer.issue(sale("b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2", { name: "Firma SRL", taxId: "RO12345678" }));
    expect(fake.invoices.get(issued.externalRef)!.body).toMatchObject({ client: { vatCode: "RO12345678", isTaxPayer: true } });
    // P2-M32: a tax id reaches the invoice only once it was validated as a VAT number (the billing profile's
    // vatValidated), so every such buyer is a VAT payer, whatever prefix or spacing they typed; the code is sent as
    // SmartBill writes it, RO + the digits.
    for (const [typed, chargeId] of [["12345678", "b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5"], [" ro 1234 5678 ", "b6b6b6b6b6b6b6b6b6b6b6b6b6b6b6b6"]] as const) {
      const bare = await issuer.issue(sale(chargeId, { name: "Firma SRL", taxId: typed }));
      expect(fake.invoices.get(bare.externalRef)!.body, typed).toMatchObject({ client: { vatCode: "RO12345678", isTaxPayer: true } });
    }
    await expect(issuer.issue(sale("c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3", { name: null })))
      .rejects.toMatchObject({ code: "INVOICE_SERVICE_REFUSED", message: "SMARTBILL_CLIENT_NAME_REQUIRED" });
    // R-15: e-Factura also needs the buyer's city and county.
    for (const missing of [{ city: null }, { region: null }, { city: "  " }]) {
      await expect(issuer.issue(sale("c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4", missing)))
        .rejects.toMatchObject({ code: "INVOICE_SERVICE_REFUSED", message: "SMARTBILL_CLIENT_ADDRESS_REQUIRED" });
    }
  });

  it("reverses a whole invoice once, and issues a partial credit as a negative line", async () => {
    const original = await issuer.issue(sale("d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4"));
    const refund = { chargeId: "d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4", transactionId: "9001", issuedOn: new Date("2026-10-03T10:00:00Z"),
      currency: "USD" as const, refundTotalMicros: 24_200_000, original: { documentId: original.externalRef, number: original.number },
      description: "Rambursare DebateAI Plus", processor: "netopia" as const };
    const storno = await issuer.storno({ ...refund, series: original.series, number: original.number });
    expect(storno.number).not.toBe(original.number);
    expect(fake.invoices.get(original.externalRef)!.reversedBy).toBe(storno.externalRef);
    await expect(issuer.storno({ ...refund, series: original.series, number: original.number }))
      .rejects.toMatchObject({ code: "INVOICE_SERVICE_REFUSED", message: "SMARTBILL_REFUSED" });
    expect((issuer as InvoiceIssuer).lookup).toBeUndefined();
    const partial = await issuer.creditPartial({
      ...refund, refundTotalMicros: 12_100_000, series: original.series, number: original.number,
      customer: customer(), taxRateBasisPoints: 2100
    });
    expect(fake.invoices.get(partial.externalRef)!.body).toMatchObject({
      mentions: `Storno partial al facturii ${original.series}-${original.number}; debateai-charge:d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4d4`,
      products: [{
        name: `Rambursare partiala ${original.series}-${original.number}`, quantity: -1, price: 12.1,
        isTaxIncluded: true, taxPercentage: 21
      }]
    });
  });

  it("fetches the invoice PDF", async () => {
    const issued = await issuer.issue(sale("e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5"));
    const pdf = await issuer.pdf({ series: issued.series, number: issued.number });
    expect(Buffer.from(pdf).subarray(0, 4).toString("latin1")).toBe("%PDF");
  });

  it("keeps one call in flight with a gap, so the fake never rate-limits it", async () => {
    const before = fake.requestTimes.length;
    await Promise.all(["f6", "f7", "f8"].map((prefix) => issuer.issue(sale(prefix.repeat(16)))));
    const times = fake.requestTimes.slice(before);
    expect(times).toHaveLength(3);
    for (let index = 1; index < times.length; index += 1) {
      expect(times[index]! - times[index - 1]!).toBeGreaterThanOrEqual(50);
    }
    expect(fake.rateLimited()).toBe(0);
  });

  it("names each failure by whether an invoice may exist (A17b)", async () => {
    fake.failNext("RATE_LIMIT");
    await expect(issuer.issue(sale("0a".repeat(16)))).rejects.toMatchObject({ code: "INVOICE_SERVICE_UNAVAILABLE" });
    fake.failNext("SERVER_ERROR");
    await expect(issuer.issue(sale("0b".repeat(16)))).rejects.toMatchObject({ code: "INVOICE_UNKNOWN" });
    fake.failNext("STALL");
    await expect(issuer.issue(sale("0c".repeat(16)))).rejects.toMatchObject({ code: "INVOICE_UNKNOWN" });
    // X1 row 4 unconfirmed: an HTML page with 200 is an unknown outcome, never retried (A17b).
    fake.failNext("HTML");
    await expect(issuer.issue(sale("0d".repeat(16)))).rejects.toMatchObject({ code: "INVOICE_UNKNOWN" });
    // An HTML error page with a 4xx (a wrong base URL) is still a refusal, named by its status.
    fake.failNext("HTML_404");
    await expect(issuer.issue(sale("1d".repeat(16)))).rejects.toMatchObject({ code: "INVOICE_SERVICE_REFUSED", message: "SMARTBILL_HTTP_404" });
    fake.failNext("REFUSED");
    await expect(issuer.issue(sale("0e".repeat(16)))).rejects.toMatchObject({ code: "INVOICE_SERVICE_REFUSED", message: "SMARTBILL_REFUSED" });
    const offline = new SmartBillInvoiceIssuer({ baseUrl: `http://127.0.0.1:${await closedPort()}/SBORO/api`, username: "a@b.ro",
      token: "t", companyCif: fake.companyCif, series: fake.series, minGapMs: 0 });
    await expect(offline.issue(sale("0f".repeat(16)))).rejects.toMatchObject({ code: "INVOICE_SERVICE_UNAVAILABLE" });
    // A fresh issuer has no pacing history; wait out the fake's gap so this measures the 401, not a 429.
    await new Promise((resolve) => setTimeout(resolve, 80));
    const stranger = new SmartBillInvoiceIssuer({ baseUrl: fake.baseUrl, username: "x@y.ro", token: "wrong",
      companyCif: fake.companyCif, series: fake.series, minGapMs: 60 });
    await expect(stranger.issue(sale("1a".repeat(16)))).rejects.toMatchObject({ code: "INVOICE_SERVICE_REFUSED", message: "SMARTBILL_HTTP_401" });
  });
});

describe("P5 — FakeInvoiceIssuer (what the route tests rely on)", () => {
  it("offers lookup only when asked, finding what it issued by charge", async () => {
    expect(new FakeInvoiceIssuer().lookup).toBeUndefined();
    const withLookup = new FakeInvoiceIssuer({ withLookup: true });
    const issued = await withLookup.issue(sale("cc".repeat(16)));
    expect(await withLookup.lookup!({ chargeId: "cc".repeat(16), kind: "INVOICE" })).toEqual(issued);
    expect(await withLookup.lookup!({ chargeId: "cc".repeat(16), kind: "CREDIT_NOTE" })).toBeNull();
  });

  it("numbers invoices, reverses once and can be told to fail", async () => {
    const fakeIssuer = new FakeInvoiceIssuer();
    const first = await fakeIssuer.issue(sale("aa".repeat(16)));
    expect(first).toEqual({ series: "FAKE", number: "0001", externalRef: "FAKE-0001" });
    const refund = { chargeId: "aa".repeat(16), transactionId: "1", issuedOn: new Date(), currency: "USD" as const, refundTotalMicros: 24_200_000,
      original: { documentId: first.externalRef, number: first.number }, description: "Rambursare", processor: "netopia" as const };
    await fakeIssuer.storno({ ...refund, series: first.series, number: first.number });
    await expect(fakeIssuer.storno({ ...refund, series: first.series, number: first.number }))
      .rejects.toMatchObject({ code: "INVOICE_SERVICE_REFUSED" });
    fakeIssuer.failNext("INVOICE_UNKNOWN");
    await expect(fakeIssuer.issue(sale("bb".repeat(16)))).rejects.toMatchObject({ code: "INVOICE_UNKNOWN" });
    expect(Buffer.from(await fakeIssuer.pdf(first)).subarray(0, 4).toString("latin1")).toBe("%PDF");
    const partial = await fakeIssuer.creditPartial({ ...refund, refundTotalMicros: 1_000_000, series: first.series,
      number: first.number, taxRateBasisPoints: 2100, customer: sale("aa".repeat(16)).customer });
    expect(fakeIssuer.issued.at(-1)).toEqual({ kind: "CREDIT", chargeId: "aa".repeat(16), externalRef: partial.externalRef });
  });
});
