import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
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
let invoiceHandler: () => ReturnType<typeof createSmartBillInvoiceHandler>;
let invoiceDeps: () => Parameters<typeof createSmartBillInvoiceHandler>[0];
/** While true, the worker's SMARTBILL_INVOICE attempts change nothing and retry later (C-14's row claims the job itself). */
let holdInvoices = false;
beforeAll(async () => {
  h = await startBillingHarness();
  smartbill = new RecordingSmartBill();
  const deps = () => ({
    repository: h.repository, jobs: h.jobs, issuer: smartbill.port(), recordsKey: h.recordsKey,
    recipients: PROFILE_ADDRESS_ONLY, policy: testBillingPolicy,
    publicAppUrl: TEST_PUBLIC_APP_URL, audit: h.audit, xmoneyEnvironment: "stage" as const, paymentEnvironment: "sandbox" as const
  });
  invoiceDeps = deps;
  invoiceHandler = () => createSmartBillInvoiceHandler(deps());
  h.worker.register("SMARTBILL_INVOICE", async (job, now) => holdInvoices
    // C-14: the worker leaves the job untouched (no intent, no SmartBill call), so a test can claim it itself.
    ? { kind: "RETRY" as const, code: "TEST_INVOICE_HELD", retryAt: new Date(now.getTime() + 3_600_000) }
    : createSmartBillInvoiceHandler(deps())(job, now));
  h.worker.register("SMARTBILL_STORNO", async (job, now) => createSmartBillStornoHandler(deps())(job, now));
});
afterAll(async () => { await h?.stop(); });
const invoices = async (chargeId: string) => (await h.database.pool.query(
  "SELECT issuer, kind, series, number FROM billing.invoice WHERE charge_id=$1 ORDER BY kind", [chargeId]
)).rows;
const invoiceJob = async (chargeId: string) => (await h.outboxRows(chargeId)).find((row) => row.kind === "SMARTBILL_INVOICE");
/** The invoice intents a charge has (A17b): one per kind, written before SmartBill is ever called. */
const intents = async (chargeId: string) => (await h.database.pool.query(
  "SELECT kind, issuer FROM billing.invoice_intent WHERE charge_id=$1 ORDER BY kind", [chargeId]
)).rows;
/**
 * P2-M6 / C-14: one process claims the charge's open SMARTBILL_INVOICE job (the claim's fields as the worker's claim
 * hands them over), whatever its lease: a second call is another process claiming it again after the first one's
 * lease ran out.
 */
const claimInvoiceJob = async (chargeId: string, workerId: string, at: Date) => {
  const row = (await h.database.pool.query<{ job_id: string; payload: Record<string, unknown>; created_at: Date; not_before: Date; attempts: number }>(`
    UPDATE billing.outbox SET claimed_by = $2, claimed_at = $3, attempts = attempts + 1
    WHERE kind = 'SMARTBILL_INVOICE' AND ref = $1 AND done_at IS NULL AND dead_at IS NULL
    RETURNING job_id, payload, created_at, not_before, attempts
  `, [chargeId, workerId, at])).rows[0]!;
  return {
    jobId: row.job_id, kind: "SMARTBILL_INVOICE" as const, ref: chargeId, payload: row.payload as never,
    createdAt: row.created_at, notBefore: row.not_before, attempts: row.attempts, claimedBy: workerId, claimedAt: at
  };
};
/** C-14 (review M-2): a paid charge whose SMARTBILL_INVOICE job the worker left untouched, so the row claims it itself. */
const heldCharge = async () => {
  holdInvoices = true;
  try {
    return await h.activate();
  } finally {
    holdInvoices = false;
  }
};
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

  it("never issues from a stale claim: only the job's current claim holder records the stage and calls SmartBill (P2-M6)", async () => {
    smartbill.withLookup = false;
    smartbill.failIssue = "DOWN";
    const paid = await h.activate();
    await h.worker.drain(10);
    // Attempt 1 proved nothing was created, so the next attempt may call `issue` again (A17b).
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ done: false, dead: false, lastErrorCode: "INVOICE_SERVICE_UNAVAILABLE" });
    // Process A claims attempt 2; its lease runs out while it is slow, and process B claims attempt 3.
    const stale = await claimInvoiceJob(paid.chargeId, "process-a", h.clock.now);
    const current = await claimInvoiceJob(paid.chargeId, "process-b", new Date(h.clock.now.getTime() + 301_000));
    expect(await invoiceHandler()(stale, h.clock.now)).toMatchObject({ kind: "RETRY", code: "BILLING_OUTBOX_CLAIM_LOST" });
    expect(smartbill.issued.filter((sale) => sale.chargeId === paid.chargeId)).toHaveLength(0);
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ lastErrorCode: "INVOICE_SERVICE_UNAVAILABLE" });
    // B, the holder, issues it once.
    expect(await invoiceHandler()(current, h.clock.now)).toEqual({ kind: "DONE" });
    expect(smartbill.issued.filter((sale) => sale.chargeId === paid.chargeId)).toHaveLength(1);
    expect(await h.repository.complete(current.jobId, h.clock.now, { workerId: "process-b", attempts: current.attempts })).toBe(true);
    expect(await invoices(paid.chargeId)).toHaveLength(1);
    smartbill.withLookup = true;
  });

  it("writes the invoice intent only under the job's current claim: a stale holder's is refused, and the holder issues once (C-14)", async () => {
    // Production SmartBill has no lookup (X1 row 8), so an intent with no proof of "nothing issued" would be dead-lettered
    // INVOICE_UNKNOWN: the stale holder's intent must never be written.
    smartbill.withLookup = false;
    const paid = await heldCharge();
    expect(await intents(paid.chargeId)).toEqual([]);
    // Process A claims the job and stalls past its lease before writing anything; process B claims it again.
    const stale = await claimInvoiceJob(paid.chargeId, "process-a", h.clock.now);
    const current = await claimInvoiceJob(paid.chargeId, "process-b", new Date(h.clock.now.getTime() + 301_000));
    expect(await invoiceHandler()(stale, h.clock.now)).toMatchObject({ kind: "RETRY", code: "BILLING_OUTBOX_CLAIM_LOST" });
    expect(await intents(paid.chargeId)).toEqual([]);
    expect(smartbill.issued.filter((sale) => sale.chargeId === paid.chargeId)).toHaveLength(0);
    // B, the holder, writes the intent and issues the invoice once: no INVOICE_UNKNOWN, no O3, no hand check.
    expect(await invoiceHandler()(current, h.clock.now)).toEqual({ kind: "DONE" });
    expect(await intents(paid.chargeId)).toEqual([{ kind: "INVOICE", issuer: "SMARTBILL" }]);
    expect(smartbill.issued.filter((sale) => sale.chargeId === paid.chargeId)).toHaveLength(1);
    expect(await h.repository.complete(current.jobId, h.clock.now, { workerId: "process-b", attempts: current.attempts })).toBe(true);
    expect(await invoices(paid.chargeId)).toHaveLength(1);
    expect(await invoiceJob(paid.chargeId)).toMatchObject({ done: true, dead: false });
    smartbill.withLookup = true;
  });

  it("writes SmartBill's intent and its call-started stage as one write, so a holder that stalls after it still calls SmartBill once and the next holder's unknown is true (C-14, A17b)", async () => {
    smartbill.withLookup = false;
    const paid = await heldCharge();
    const issuedFor = () => smartbill.issued.filter((sale) => sale.chargeId === paid.chargeId);
    const a = await claimInvoiceJob(paid.chargeId, "process-a", h.clock.now);
    // A's repository lets its first transaction (the intent's: the reads before it open none) commit for real, says
    // so, and then holds A there: A has written what it writes and has not called SmartBill yet.
    let committed!: () => void;
    const hasCommitted = new Promise<void>((resolve) => { committed = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let first = true;
    const repository = new Proxy(h.repository, {
      get(target, property) {
        if (property === "withTransaction") {
          return async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
            const isFirst = first;
            first = false;
            let value: T;
            try {
              value = await target.withTransaction(work);
            } finally {
              if (isFirst) committed();
            }
            if (isFirst) await gate;
            return value;
          };
        }
        const value: unknown = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const runA = createSmartBillInvoiceHandler({ ...invoiceDeps(), repository })(a, h.clock.now);
    try {
      await Promise.race([hasCommitted, runA]);
      // While A waits: the intent and its stage are already there, together.
      expect(await intents(paid.chargeId)).toEqual([{ kind: "INVOICE", issuer: "SMARTBILL" }]);
      expect(await invoiceJob(paid.chargeId)).toMatchObject({ done: false, dead: false, lastErrorCode: "INVOICE_CALL_STARTED" });
      // A's lease runs out; B claims the job again. A calls SmartBill next, so B's unknown is a true one: B must never
      // call `issue` (that would be a second invoice), and with no lookup it hands the job to the owner.
      const b = await claimInvoiceJob(paid.chargeId, "process-b", new Date(h.clock.now.getTime() + 301_000));
      expect(await invoiceHandler()(b, h.clock.now)).toEqual({ kind: "DEAD", code: "INVOICE_UNKNOWN" });
      expect(issuedFor()).toHaveLength(0);
      expect(await h.repository.fail(b.jobId, "INVOICE_UNKNOWN", null, h.clock.now, { workerId: "process-b", attempts: b.attempts })).toBe(true);
      // A wakes and issues the invoice once; its own settle is refused, as a stale holder's is.
      release();
      expect(await runA).toEqual({ kind: "DONE" });
      expect(issuedFor()).toHaveLength(1);
      expect(await invoices(paid.chargeId)).toHaveLength(1);
      expect(await h.repository.complete(a.jobId, h.clock.now, { workerId: "process-a", attempts: a.attempts })).toBe(false);
      expect(await invoiceJob(paid.chargeId)).toMatchObject({ dead: true, lastErrorCode: "INVOICE_UNKNOWN" });
    } finally {
      release();
      await runA.catch(() => undefined);
      smartbill.withLookup = true;
    }
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
      const fields = { providerPaymentId: paid.payment.providerPaymentId, amountMicros: 12_100_000, errorCode: "WITHDRAWAL" };
      await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUND_REQUESTED", h.clock.now, fields));
      await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUNDED", h.clock.now, fields));
      await enqueueCreditNote(h.repository, client, {
        charge, quote, policy: testBillingPolicy, transactionId: paid.payment.providerPaymentId, refundMicros: 12_100_000, now: h.clock.now
      });
    });
    await h.worker.drain(10);
    expect(smartbill.credits.find((refund) => refund.chargeId === paid.chargeId)?.customer)
      .toMatchObject({ name: "SC Test SRL", street: "Str. Test 1, Bucuresti" });
    const person = await h.activate();
    await h.worker.drain(10);
    // A person's street is the one they typed for NETOPIA's cardholder (spec 2026-10-05 §2.6.1, the harness's buyer).
    expect(smartbill.issued.find((sale) => sale.chargeId === person.chargeId)?.customer.street).toBe("Strada Test 1");
  });

  it("credits an old charge to that charge's own buyer, not to the details of a later checkout (P2-M30)", async () => {
    const paid = await h.activate();
    await h.worker.drain(10);
    expect(smartbill.issued.find((sale) => sale.chargeId === paid.chargeId)?.customer)
      .toMatchObject({ name: "Test Buyer", city: "Sector 1", region: "Bucuresti", street: "Strada Test 1", taxId: null });
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
      const fields = { providerPaymentId: paid.payment.providerPaymentId, amountMicros: 12_100_000, errorCode: "WITHDRAWAL" };
      await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUND_REQUESTED", h.clock.now, fields));
      await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUNDED", h.clock.now, fields));
      await enqueueCreditNote(h.repository, client, {
        charge, quote, policy: testBillingPolicy, transactionId: paid.payment.providerPaymentId, refundMicros: 12_100_000, now: h.clock.now
      });
    });
    await h.worker.drain(10);
    // The buyer is the one the charge's own quote sealed; only the address it is sent to and its language follow the
    // newest profile (W8: the account's current address, here the profile's own).
    expect(smartbill.credits.find((refund) => refund.chargeId === paid.chargeId)?.customer).toEqual({
      name: "Test Buyer", email: "later-buyer@example.test", country: "RO", region: "Bucuresti", postalCode: "010011",
      city: "Sector 1", street: "Strada Test 1", taxId: null, locale: "ro"
    });
  });

  it("stornos a full refund, credits a partial one, and hands a partial one to the owner without creditPartial", async () => {
    const full = await h.activate();
    await h.worker.drain(10);
    // A void after success is a refund in full (A9); a dashboard refund's amount is unknown and gets no document (P9c).
    h.payments.setState(full.chargeId, "VOIDED");
    await h.settle(full.chargeId);
    await h.worker.drain(10);
    expect(smartbill.stornos.map((refund) => refund.chargeId)).toContain(full.chargeId);

    const partialRefund = async (withCredit: boolean) => {
      smartbill.withCredit = withCredit;
      const paid = await h.activate();
      await h.worker.drain(10);
      const charge = (await h.repository.charge(paid.chargeId))!;
      const quote = (await h.repository.quote(charge.quoteId!, paid.ownerRef))!;
      await h.repository.withTransaction(async (client) => {
        const fields = { providerPaymentId: paid.payment.providerPaymentId, amountMicros: 12_100_000, errorCode: "WITHDRAWAL" };
        await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUND_REQUESTED", h.clock.now, fields));
        await h.repository.appendChargeEvent(client, chargeEvent(paid.chargeId, "REFUNDED", h.clock.now, fields));
        await enqueueCreditNote(h.repository, client, {
          charge, quote, policy: testBillingPolicy, transactionId: paid.payment.providerPaymentId, refundMicros: 12_100_000, now: h.clock.now
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
