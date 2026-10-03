import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RefundRecord, SaleRecord } from "@debateai/billing-core";
import { TypedDomainError } from "@debateai/kernel";
import {
  createSmartBillInvoiceHandler, createSmartBillStornoHandler, parseSmartBillReference, recordEfacturaStatus,
  smartBillPdfResolver, type SmartBillPort
} from "../../apps/api/src/billing/invoice-smartbill.js";
import { sealBillingProfile } from "../../apps/api/src/billing/records.js";
import { chargeEvent } from "../../apps/api/src/billing/rows.js";
import { enqueueCreditNote } from "../../apps/api/src/billing/settlement.js";
import { PROFILE_ADDRESS_ONLY, testBillingPolicy } from "../support/billingFixtures.js";
import { startBillingHarness, TEST_PUBLIC_APP_URL, type BillingHarness } from "../support/billingHarness.js";

type Document = { series: string; number: string; externalRef: string };

/**
 * A SmartBill stand-in whose failure modes follow P5's codes: DOWN created nothing, UNKNOWN created the invoice,
 * CRASH created it and then the attempt died without a typed answer (as a process killed mid-call would).
 */
class RecordingSmartBill {
  readonly issued: SaleRecord[] = [];
  readonly stornos: RefundRecord[] = [];
  readonly credits: Array<RefundRecord & { taxRateBasisPoints: number; customer: SaleRecord["customer"] }> = [];
  readonly documents = new Map<string, Document>();
  failIssue: "REFUSED" | "UNKNOWN" | "DOWN" | "CRASH" | null = null;
  withLookup = true;
  withCredit = true;
  /** One-shot: the next lookup throws INVOICE_SERVICE_UNAVAILABLE (SmartBill could not be reached). */
  failLookup = false;
  private counter = 0;
  port(): SmartBillPort {
    const next = (): Document => { this.counter += 1; return { series: "DBAI", number: String(this.counter).padStart(4, "0"), externalRef: `sb-${this.counter}` }; };
    return {
      issue: async (sale) => {
        const failure = this.failIssue;
        this.failIssue = null;
        if (failure === "REFUSED") throw new TypedDomainError("INVOICE_SERVICE_REFUSED", "x");
        if (failure === "DOWN") throw new TypedDomainError("INVOICE_SERVICE_UNAVAILABLE", "429");
        const document = next();
        this.issued.push(sale);
        this.documents.set(`INVOICE:${sale.chargeId}`, document);
        if (failure === "UNKNOWN") throw new TypedDomainError("INVOICE_UNKNOWN", "timeout after sending");
        if (failure === "CRASH") throw new Error("the attempt died after the invoice was created");
        return document;
      },
      storno: async (refund) => { this.stornos.push(refund); const document = next(); this.documents.set(`CREDIT_NOTE:${refund.chargeId}`, document); return document; },
      pdf: async ({ series, number }) => Buffer.from(`%PDF ${series} ${number}`),
      ...(this.withLookup ? { lookup: async ({ chargeId, kind }: { chargeId: string; kind: "INVOICE" | "CREDIT_NOTE" }) => {
        const failure = this.failLookup;
        this.failLookup = false;
        if (failure) throw new TypedDomainError("INVOICE_SERVICE_UNAVAILABLE", "429");
        return this.documents.get(`${kind}:${chargeId}`) ?? null;
      } } : {}),
      ...(this.withCredit ? {
        creditPartial: async (refund: Parameters<NonNullable<SmartBillPort["creditPartial"]>>[0]) => {
          this.credits.push(refund);
          const document = next();
          this.documents.set(`CREDIT_NOTE:${refund.chargeId}`, document);
          return document;
        }
      } : {})
    };
  }
}

let h: BillingHarness;
let smartbill: RecordingSmartBill;
beforeAll(async () => {
  h = await startBillingHarness();
  smartbill = new RecordingSmartBill();
  const deps = () => ({
    repository: h.repository, jobs: h.jobs, issuer: smartbill.port(), recordsKey: h.recordsKey,
    recipients: PROFILE_ADDRESS_ONLY, policy: testBillingPolicy,
    publicAppUrl: TEST_PUBLIC_APP_URL, audit: h.audit, xmoneyEnvironment: "stage" as const
  });
  h.worker.register("SMARTBILL_INVOICE", async (job, now) => createSmartBillInvoiceHandler(deps())(job, now));
  h.worker.register("SMARTBILL_STORNO", async (job, now) => createSmartBillStornoHandler(deps())(job, now));
});
afterAll(async () => { await h?.stop(); });
const invoices = async (chargeId: string) => (await h.database.pool.query(
  "SELECT issuer, kind, series, number FROM billing.invoice WHERE charge_id=$1 ORDER BY kind", [chargeId]
)).rows;
const invoiceJob = async (chargeId: string) => (await h.outboxRows(chargeId)).find((row) => row.kind === "SMARTBILL_INVOICE");
/** The e-Factura statuses of a charge's SmartBill documents, in the order they were recorded (A21). */
const statuses = async (chargeId: string) => (await h.database.pool.query(
  `SELECT i.kind, s.efactura_status FROM billing.invoice_status_event s JOIN billing.invoice i USING (invoice_id)
    WHERE i.charge_id = $1 ORDER BY s.at, s.status_event_id`, [chargeId]
)).rows;

describe("P10b SmartBill invoices for Romania", () => {
  it("issues the invoice once, stores series and number, and attaches the PDF to M2", async () => {
    const paid = await h.activate();
    await h.worker.drain(10);
    expect(smartbill.issued.filter((sale) => sale.chargeId === paid.chargeId)).toHaveLength(1);
    expect(smartbill.issued.find((sale) => sale.chargeId === paid.chargeId)?.customer).toMatchObject({ name: "Test Buyer", city: "Sector 1", region: "Bucuresti" });
    const [invoice] = await invoices(paid.chargeId);
    expect(invoice).toMatchObject({ issuer: "SMARTBILL", kind: "INVOICE", series: "DBAI" });
    const mail = (await h.outboxRows(paid.chargeId)).find((row) => row.ref === `M2_INVOICE_ATTACHED:${paid.chargeId}`);
    expect(mail?.payload).toMatchObject({
      attachments: "SMARTBILL_INVOICE_PDF", "attach.SMARTBILL_INVOICE_PDF.series": "DBAI",
      "attach.SMARTBILL_INVOICE_PDF.number": invoice!.number,
      // P2-M33: the receipt names the number as Settings, the summary and the owner's commands do, `<series>-<number>`.
      "param.invoiceNumber": `DBAI-${invoice!.number}`
    });
    const attachment = await smartBillPdfResolver({ issuer: smartbill.port() })({ series: "DBAI", number: invoice!.number }, "ro");
    expect(attachment).toMatchObject({ filename: `DBAI-${invoice!.number}.pdf`, contentType: "application/pdf" });
    // A21 / X1 row 10: SmartBill sends it to ANAF by the account setting; that is recorded with the document.
    expect(await statuses(paid.chargeId)).toEqual([{ kind: "INVOICE", efactura_status: "SENT_BY_ACCOUNT_SETTING" }]);
  });

  it("records ANAF's answer the owner reads, and lists every document ANAF has not accepted (spec §2.5.4)", async () => {
    const accepted = await h.activate();
    const rejected = await h.activate();
    const waiting = await h.activate();
    await h.worker.drain(10);
    const numberOf = async (chargeId: string) => (await invoices(chargeId))[0]!.number as string;
    const reference = (number: string) => parseSmartBillReference(`DBAI-${number}`)!;
    expect(parseSmartBillReference("DBAI-0042")).toEqual({ series: "DBAI", number: "0042" });
    expect(parseSmartBillReference("DBAI 0042")).toBeNull();
    const deps = { repository: h.repository, jobs: h.jobs };
    // The owner reads ANAF's answer later than SmartBill's sending.
    h.clock.advance(60_000);
    await recordEfacturaStatus(deps, { ...reference(await numberOf(accepted.chargeId)), status: "ACCEPTED", at: h.clock.now });
    await recordEfacturaStatus(deps, { ...reference(await numberOf(rejected.chargeId)), status: "REJECTED", at: h.clock.now });
    await expect(recordEfacturaStatus(deps, { series: "DBAI", number: "999999", status: "ACCEPTED", at: h.clock.now }))
      .rejects.toMatchObject({ code: "EFACTURA_DOCUMENT_UNKNOWN" });
    expect(await statuses(accepted.chargeId)).toEqual([
      { kind: "INVOICE", efactura_status: "SENT_BY_ACCOUNT_SETTING" }, { kind: "INVOICE", efactura_status: "ACCEPTED" }
    ]);
    const open = await h.jobs.smartBillDocumentsNotAccepted(new Date(h.clock.now.getTime() + 1));
    const listed = open.map((document) => document.chargeId);
    expect(listed).toContain(rejected.chargeId);
    expect(listed).toContain(waiting.chargeId);
    expect(listed).not.toContain(accepted.chargeId);
    expect(open.find((document) => document.chargeId === rejected.chargeId)).toMatchObject({ kind: "INVOICE", series: "DBAI", status: "REJECTED" });
    expect(open.find((document) => document.chargeId === waiting.chargeId)).toMatchObject({ status: "SENT_BY_ACCOUNT_SETTING" });
  });

  it("looks the invoice up after an unknown outcome instead of issuing it twice", async () => {
    smartbill.failIssue = "UNKNOWN";
    const paid = await h.activate();
    await h.worker.drain(10);
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ done: false, dead: false, lastErrorCode: "INVOICE_UNKNOWN" });
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(smartbill.issued.filter((sale) => sale.chargeId === paid.chargeId)).toHaveLength(1);
    expect(await invoices(paid.chargeId)).toHaveLength(1);
  });

  it("never reads a failed lookup as 'nothing was created': it looks up again instead of issuing a second invoice (A17b)", async () => {
    smartbill.failIssue = "UNKNOWN";
    const paid = await h.activate();
    await h.worker.drain(10);
    h.clock.advance(61_000);
    smartbill.failLookup = true;
    await h.worker.drain(10);
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ done: false, dead: false, lastErrorCode: "INVOICE_UNKNOWN" });
    h.clock.advance(301_000);
    await h.worker.drain(10);
    expect(smartbill.issued.filter((sale) => sale.chargeId === paid.chargeId)).toHaveLength(1);
    expect(await invoices(paid.chargeId)).toHaveLength(1);
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ done: true });
  });

  it("dead-letters an unknown outcome as INVOICE_UNKNOWN when SmartBill offers no lookup", async () => {
    smartbill.withLookup = false;
    smartbill.failIssue = "UNKNOWN";
    const paid = await h.activate();
    await h.worker.drain(10);
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ dead: true, lastErrorCode: "INVOICE_UNKNOWN" });
    expect(h.auditLines.some((line) => line.event === "billing.invoice.unknown")).toBe(true);
    smartbill.withLookup = true;
  });

  it("calls again after a failure that proved nothing was created, and issues exactly once", async () => {
    smartbill.withLookup = false;
    smartbill.failIssue = "DOWN";
    const paid = await h.activate();
    await h.worker.drain(10);
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ done: false, dead: false, lastErrorCode: "INVOICE_SERVICE_UNAVAILABLE" });
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(smartbill.issued.filter((sale) => sale.chargeId === paid.chargeId)).toHaveLength(1);
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ done: true });
    smartbill.withLookup = true;
  });

  it("treats an attempt that died after the call started as an unknown outcome, never a second call", async () => {
    smartbill.withLookup = false;
    smartbill.failIssue = "CRASH";
    const paid = await h.activate();
    await h.worker.drain(10);
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ done: false, dead: false, lastErrorCode: "OUTBOX_HANDLER_FAILED" });
    h.clock.advance(61_000);
    await h.worker.drain(10);
    expect(smartbill.issued.filter((sale) => sale.chargeId === paid.chargeId)).toHaveLength(1);
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ dead: true, lastErrorCode: "INVOICE_UNKNOWN" });
    smartbill.withLookup = true;
  });

  it("invoices a Romanian company under its own name and address, and credits it at that address", async () => {
    const company = { name: "SC Test SRL", vatId: "RO123VALID", address: "Str. Test 1, Bucuresti" };
    const paid = await h.activate({ company });
    await h.worker.drain(10);
    expect(smartbill.issued.find((sale) => sale.chargeId === paid.chargeId)?.customer)
      .toMatchObject({ name: "SC Test SRL", street: "Str. Test 1, Bucuresti", taxId: "RO123VALID" });
    const charge = (await h.repository.charge(paid.chargeId))!;
    const quote = (await h.repository.quote(charge.quoteId!, paid.ownerRef))!;
    await h.repository.withTransaction(async (client) => {
      const fields = { xmoneyTransactionId: paid.transaction.transactionId, amountMicros: 12_100_000, errorCode: "WITHDRAWAL" };
      await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUND_REQUESTED", h.clock.now, fields));
      await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUNDED", h.clock.now, fields));
      await enqueueCreditNote(h.repository, client, {
        charge, quote, policy: testBillingPolicy, transactionId: paid.transaction.transactionId, refundMicros: 12_100_000, now: h.clock.now
      });
    });
    await h.worker.drain(10);
    expect(smartbill.credits.find((refund) => refund.chargeId === paid.chargeId)?.customer)
      .toMatchObject({ name: "SC Test SRL", street: "Str. Test 1, Bucuresti" });
    const person = await h.activate();
    await h.worker.drain(10);
    expect(smartbill.issued.find((sale) => sale.chargeId === person.chargeId)?.customer.street).toBeNull();
  });

  it("credits an old charge to that charge's own buyer, not to the details of a later checkout (P2-M30)", async () => {
    const paid = await h.activate();
    await h.worker.drain(10);
    expect(smartbill.issued.find((sale) => sale.chargeId === paid.chargeId)?.customer)
      .toMatchObject({ name: "Test Buyer", city: "Sector 1", region: "Bucuresti", street: null, taxId: null });
    // The person later checks out under other details (a company in Cluj): that writes the newest billing profile.
    const customer = (await h.repository.customerByOwner(paid.ownerRef))!;
    const later = sealBillingProfile(h.recordsKey, customer.customerId, {
      email: "later-buyer@example.test", locale: "ro", name: "SC Alta SRL", country: "RO", region: "Cluj",
      postalCode: "400001", city: "Cluj-Napoca", street: "Str. Noua 2",
      company: { name: "SC Alta SRL", vatId: "RO999VALID", address: "Str. Noua 2, Cluj-Napoca", vatValidated: true }
    });
    h.clock.advance(60_000);
    await h.repository.withTransaction((client) => h.repository.appendProfile(client, {
      customerId: customer.customerId, at: h.clock.now, locale: "ro", profileCiphertext: later.ciphertext, keyId: later.keyId
    }));
    const charge = (await h.repository.charge(paid.chargeId))!;
    const quote = (await h.repository.quote(charge.quoteId!, paid.ownerRef))!;
    await h.repository.withTransaction(async (client) => {
      const fields = { xmoneyTransactionId: paid.transaction.transactionId, amountMicros: 12_100_000, errorCode: "WITHDRAWAL" };
      await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUND_REQUESTED", h.clock.now, fields));
      await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUNDED", h.clock.now, fields));
      await enqueueCreditNote(h.repository, client, {
        charge, quote, policy: testBillingPolicy, transactionId: paid.transaction.transactionId, refundMicros: 12_100_000, now: h.clock.now
      });
    });
    await h.worker.drain(10);
    // The buyer is the one the charge's own quote sealed; only the address it is sent to and its language follow the
    // newest profile (W8: the account's current address, here the profile's own).
    expect(smartbill.credits.find((refund) => refund.chargeId === paid.chargeId)?.customer).toEqual({
      name: "Test Buyer", email: "later-buyer@example.test", country: "RO", region: "Bucuresti", postalCode: null,
      city: "Sector 1", street: null, taxId: null, locale: "ro"
    });
  });

  it("stornos a full refund, credits a partial one, and hands a partial one to the owner without creditPartial", async () => {
    const full = await h.activate();
    await h.worker.drain(10);
    // A void after success is a refund in full (A9); a dashboard refund's amount is unknown and gets no document (P9c).
    h.xmoney.setStatus(full.transaction.transactionId, "void-ok");
    await h.settle(full.transaction.transactionId);
    await h.worker.drain(10);
    expect(smartbill.stornos.map((refund) => refund.chargeId)).toContain(full.chargeId);

    const partialRefund = async (withCredit: boolean) => {
      smartbill.withCredit = withCredit;
      const paid = await h.activate();
      await h.worker.drain(10);
      const charge = (await h.repository.charge(paid.chargeId))!;
      const quote = (await h.repository.quote(charge.quoteId!, paid.ownerRef))!;
      await h.repository.withTransaction(async (client) => {
        const fields = { xmoneyTransactionId: paid.transaction.transactionId, amountMicros: 12_100_000, errorCode: "WITHDRAWAL" };
        await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUND_REQUESTED", h.clock.now, fields));
        await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUNDED", h.clock.now, fields));
        await enqueueCreditNote(h.repository, client, {
          charge, quote, policy: testBillingPolicy, transactionId: paid.transaction.transactionId, refundMicros: 12_100_000, now: h.clock.now
        });
      });
      await h.worker.drain(10);
      return paid;
    };
    const credited = await partialRefund(true);
    expect(smartbill.credits.find((refund) => refund.chargeId === credited.chargeId)).toMatchObject({
      refundTotalMicros: 12_100_000, taxRateBasisPoints: 2_100, customer: { name: "Test Buyer", country: "RO" },
      // RefundRecord.description: the credited line, worded as the invoice's was (the harness buyer's locale is en).
      description: expect.stringMatching(/^DebateAI Plus plan, .+ to .+$/)
    });
    const manual = await partialRefund(false);
    expect((await h.outboxRows(manual.chargeId)).find((row) => row.kind === "SMARTBILL_STORNO")).toMatchObject({ dead: true, lastErrorCode: "CREDIT_NOTE_MANUAL" });
    smartbill.withCredit = true;
  });
});
