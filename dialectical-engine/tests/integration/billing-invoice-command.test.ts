import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SaleRecord } from "@debateai/billing-core";
import { TypedDomainError } from "@debateai/kernel";
import { createDeadJobAlert } from "../../apps/api/src/billing/dead-jobs.js";
import { openInvoiceCommand, runBillingInvoiceCli } from "../../apps/api/src/billing/invoice-cli.js";
import { createQuadernoRefundHandler, createQuadernoSaleHandler } from "../../apps/api/src/billing/invoice-quaderno.js";
import {
  createSmartBillInvoiceHandler, createSmartBillStornoHandler, type SmartBillPort
} from "../../apps/api/src/billing/invoice-smartbill.js";
import { BillingOutboxWorker } from "../../apps/api/src/billing/outbox.js";
import { PROFILE_ADDRESS_ONLY, testBillingPolicy } from "../support/billingFixtures.js";
import { startBillingHarness, TEST_PUBLIC_APP_URL, type BillingHarness } from "../support/billingHarness.js";

/** A SmartBill stand-in with no lookup (X1 row 8), as P5 ships it; `fail` is the next issue's outcome. */
class SmartBillStub {
  issued: SaleRecord[] = [];
  fail: "REFUSED" | "UNKNOWN" | null = null;
  private counter = 500;
  port(): SmartBillPort {
    return {
      issue: async (sale) => {
        const failure = this.fail;
        this.fail = null;
        if (failure === "REFUSED") throw new TypedDomainError("INVOICE_SERVICE_REFUSED", "x");
        this.counter += 1;
        this.issued.push(sale);
        if (failure === "UNKNOWN") throw new TypedDomainError("INVOICE_UNKNOWN", "timeout after sending");
        return { series: "DBAI", number: String(this.counter).padStart(4, "0"), externalRef: `DBAI-${String(this.counter).padStart(4, "0")}` };
      },
      storno: async () => {
        this.counter += 1;
        return { series: "DBAI", number: String(this.counter).padStart(4, "0"), externalRef: `DBAI-${String(this.counter).padStart(4, "0")}` };
      },
      pdf: async ({ series, number }) => Buffer.from(`%PDF ${series} ${number}`)
    };
  }
}

let h: BillingHarness;
let smartbill: SmartBillStub;
/** The documents' worker, with the runtime's dead-letter alert (W12): the harness's own worker never claims them. */
let documents: BillingOutboxWorker;
beforeAll(async () => {
  h = await startBillingHarness();
  smartbill = new SmartBillStub();
  documents = new BillingOutboxWorker({
    repository: h.repository, workerId: "w12-documents", clock: h.clock.read, audit: h.audit, batchSize: 20,
    onDead: createDeadJobAlert({ repository: h.repository })
  });
  const common = {
    repository: h.repository, recordsKey: h.recordsKey, recipients: PROFILE_ADDRESS_ONLY, policy: testBillingPolicy,
    publicAppUrl: TEST_PUBLIC_APP_URL, audit: h.audit, xmoneyEnvironment: "stage" as const
  };
  const sb = () => ({ ...common, jobs: h.jobs, issuer: smartbill.port() });
  documents.register("SMARTBILL_INVOICE", async (job, now) => createSmartBillInvoiceHandler(sb())(job, now));
  documents.register("SMARTBILL_STORNO", async (job, now) => createSmartBillStornoHandler(sb())(job, now));
  documents.register("QUADERNO_RECORD_SALE", createQuadernoSaleHandler({ ...common, tax: h.tax }));
  documents.register("QUADERNO_RECORD_REFUND", createQuadernoRefundHandler({ ...common, tax: h.tax }));
});
afterAll(async () => { await h?.stop(); });
beforeEach(() => { h.geo.country = "RO"; smartbill.fail = null; });

const sink = () => {
  const lines = { out: "", err: "" };
  return { lines, output: { stdout: (text: string) => { lines.out += text; }, stderr: (text: string) => { lines.err += text; } } };
};
/** `pnpm billing:invoice` as the host runs it: the operator pool on the database URL, the API's xMoney system. */
async function invoiceCommand(...args: string[]) {
  const { lines, output } = sink();
  const code = await runBillingInvoiceCli(args, output, () => openInvoiceCommand({
    DATABASE_URL: h.database.connectionString, XMONEY_API_BASE_URL: "https://api-stage.xmoney.com",
    PUBLIC_APP_URL: TEST_PUBLIC_APP_URL
  }), h.clock.read);
  return { code, ...lines };
}
const invoices = async (chargeId: string) => (await h.database.pool.query(
  "SELECT invoice_id, issuer, kind, series, number, external_ref, total_micros FROM billing.invoice WHERE charge_id=$1 ORDER BY kind", [chargeId]
)).rows;
const statuses = async (invoiceId: string) => (await h.database.pool.query(
  "SELECT efactura_status FROM billing.invoice_status_event WHERE invoice_id=$1", [invoiceId]
)).rows.map((row) => row.efactura_status);
const listed = async (chargeId: string) => (await h.repository.invoiceUnknownItems()).filter((item) => item.chargeId === chargeId);
const jobsOf = async (chargeId: string, kind: string) => (await h.outboxRows(chargeId)).filter((row) => row.kind === kind);

async function romanianSaleThat(fail: "REFUSED" | "UNKNOWN") {
  const paid = await h.activate();
  smartbill.fail = fail;
  await documents.drain(5);
  return paid;
}

describe("W12 pnpm billing:invoice (P2-I17)", () => {
  it("records a Romanian invoice the owner found in SmartBill after an unknown outcome: the row, SENT_BY_ACCOUNT_SETTING and M2", async () => {
    const paid = await romanianSaleThat("UNKNOWN");
    expect(await jobsOf(paid.chargeId, "SMARTBILL_INVOICE")).toEqual([expect.objectContaining({ dead: true, lastErrorCode: "INVOICE_UNKNOWN" })]);
    // P2-I16: the owner is emailed at once, and the summary lists it.
    expect((await h.outboxRows("O3:")).filter((row) => row.payload["param.reference"] === `charge ${paid.chargeId}`))
      .toEqual([expect.objectContaining({ kind: "EMAIL", payload: expect.objectContaining({ template: "O3", recipient: "OWNER", "param.reasonCode": "INVOICE_UNKNOWN" }) })]);
    expect(await listed(paid.chargeId)).toEqual([expect.objectContaining({ jobKind: "SMARTBILL_INVOICE", code: "INVOICE_UNKNOWN" })]);

    const recorded = await invoiceCommand("--charge", paid.chargeId, "--kind", "INVOICE", "--record", "DBAI-0700");
    expect(recorded).toMatchObject({ code: 0, err: "" });
    expect(recorded.out).toContain(`Recorded: SmartBill invoice DBAI-0700 for charge ${paid.chargeId}.`);
    const [invoice] = await invoices(paid.chargeId);
    expect(invoice).toMatchObject({ issuer: "SMARTBILL", kind: "INVOICE", series: "DBAI", number: "0700", external_ref: "DBAI-0700", total_micros: "24200000" });
    expect(await statuses(invoice.invoice_id)).toEqual(["SENT_BY_ACCOUNT_SETTING"]);
    expect((await h.outboxRows(paid.chargeId)).find((row) => row.ref === `M2_INVOICE_ATTACHED:${paid.chargeId}`)?.payload)
      .toMatchObject({ "param.invoiceNumber": "DBAI 0700", attachments: "SMARTBILL_INVOICE_PDF" });
    expect(await listed(paid.chargeId)).toEqual([]);
    // Once only, and never a document SmartBill already numbered for another charge.
    expect(await invoiceCommand("--charge", paid.chargeId, "--kind", "INVOICE", "--record", "DBAI-0701"))
      .toMatchObject({ code: 1, err: "BILLING_INVOICE_ALREADY_RECORDED\n" });
    const other = await romanianSaleThat("UNKNOWN");
    expect(await invoiceCommand("--charge", other.chargeId, "--kind", "INVOICE", "--record", "DBAI-0700"))
      .toMatchObject({ code: 1, err: "BILLING_INVOICE_DOCUMENT_TAKEN\n" });
    expect(await invoices(other.chargeId)).toEqual([]);
  });

  it("re-queues a SmartBill invoice only once the owner confirmed nothing was issued, and the job then issues it", async () => {
    const paid = await romanianSaleThat("REFUSED");
    expect(await jobsOf(paid.chargeId, "SMARTBILL_INVOICE")).toEqual([expect.objectContaining({ dead: true, lastErrorCode: "INVOICE_SERVICE_REFUSED" })]);
    expect(await invoiceCommand("--charge", paid.chargeId, "--kind", "INVOICE", "--requeue"))
      .toMatchObject({ code: 1, err: "BILLING_INVOICE_CONFIRM_NOT_ISSUED_REQUIRED\n" });
    expect(await jobsOf(paid.chargeId, "SMARTBILL_INVOICE")).toHaveLength(1);
    const requeued = await invoiceCommand("--charge", paid.chargeId, "--kind", "INVOICE", "--requeue", "--confirm-not-issued");
    expect(requeued).toMatchObject({ code: 0, err: "" });
    expect(requeued.out).toContain(`Re-queued: the SMARTBILL_INVOICE job of charge ${paid.chargeId}`);
    expect(await listed(paid.chargeId)).toEqual([]);
    // A second command while it waits is refused: the job is already queued.
    expect(await invoiceCommand("--charge", paid.chargeId, "--kind", "INVOICE", "--requeue", "--confirm-not-issued"))
      .toMatchObject({ code: 1, err: "BILLING_INVOICE_JOB_OPEN\n" });
    const before = smartbill.issued.length;
    await documents.drain(5);
    // The intent from the first attempt is still there; the owner's confirmation lets the new job call `issue`.
    expect(smartbill.issued.length).toBe(before + 1);
    expect(await invoices(paid.chargeId)).toEqual([expect.objectContaining({ issuer: "SMARTBILL", kind: "INVOICE" })]);
    expect((await jobsOf(paid.chargeId, "SMARTBILL_INVOICE")).map((row) => `dead=${row.dead} done=${row.done}`).sort())
      .toEqual(["dead=false done=true", "dead=true done=false"]);
  });

  it("re-queues a Quaderno sale after a revoked key without asking, because Quaderno looks the sale up first", async () => {
    h.geo.country = "DE";
    const bought = await h.buy({ country: "DE" });
    const paying = h.xmoney.pay({ externalOrderId: bought.chargeId, amountDecimal: bought.totalDecimal, cardCountry: "DE" });
    h.tax.failNext("TAX_SERVICE_REFUSED");
    await h.settle(paying.transactionId);
    await documents.drain(5);
    expect(await jobsOf(bought.chargeId, "QUADERNO_RECORD_SALE")).toEqual([expect.objectContaining({ dead: true, lastErrorCode: "TAX_SERVICE_REFUSED" })]);
    expect((await h.outboxRows("O3:")).filter((row) => row.payload["param.reference"] === `charge ${bought.chargeId}`)).toHaveLength(1);
    expect(await invoiceCommand("--charge", bought.chargeId, "--kind", "INVOICE", "--requeue")).toMatchObject({ code: 0, err: "" });
    await documents.drain(5);
    expect(await invoices(bought.chargeId)).toEqual([expect.objectContaining({ issuer: "QUADERNO", kind: "INVOICE" })]);
    expect((await h.outboxRows(bought.chargeId)).map((row) => row.ref)).toContain(`M2_INVOICE_LINK:${bought.chargeId}`);
    expect(await listed(bought.chargeId)).toEqual([]);
  });

  it("refuses a credit-note job no refund backs, for --record and --requeue alike, and writes nothing (the W4 forward)", async () => {
    const paid = await h.activate();
    smartbill.fail = null;
    await documents.drain(5);
    const forged = await h.repository.withTransaction((client) => h.repository.enqueue(client, {
      kind: "SMARTBILL_STORNO", ref: `${paid.chargeId}:${paid.transaction.transactionId}`, notBefore: h.clock.now,
      payload: { charge_id: paid.chargeId, transaction_id: paid.transaction.transactionId, refund_micros: 24_200_000 }
    }));
    expect(await h.repository.fail(forged, "CREDIT_NOTE_REFUND_MISSING", null, h.clock.now)).toBe(true);
    for (const args of [["--record", "DBAI-0800"], ["--requeue", "--confirm-not-issued"]]) {
      expect(await invoiceCommand("--charge", paid.chargeId, "--kind", "CREDIT_NOTE", ...args), args.join(" "))
        .toMatchObject({ code: 1, err: "BILLING_INVOICE_NOTHING_TO_ISSUE\n" });
    }
    expect((await invoices(paid.chargeId)).map((row) => row.kind)).toEqual(["INVOICE"]);
    expect(await jobsOf(paid.chargeId, "SMARTBILL_STORNO")).toHaveLength(1);
  });

  it("refuses a charge it does not know, one of the other xMoney system, and one with nothing listed", async () => {
    expect(await invoiceCommand("--charge", "f".repeat(32), "--kind", "INVOICE", "--requeue"))
      .toMatchObject({ code: 1, err: "BILLING_INVOICE_CHARGE_UNKNOWN\n" });
    const paid = await h.activate();
    smartbill.fail = null;
    await documents.drain(5);
    expect(await invoiceCommand("--charge", paid.chargeId, "--kind", "CREDIT_NOTE", "--requeue", "--confirm-not-issued"))
      .toMatchObject({ code: 1, err: "BILLING_INVOICE_NOTHING_LISTED\n" });
    const live = sink();
    expect(await runBillingInvoiceCli(["--charge", paid.chargeId, "--kind", "INVOICE", "--requeue"], live.output, () => openInvoiceCommand({
      DATABASE_URL: h.database.connectionString, XMONEY_API_BASE_URL: "https://api.xmoney.com", PUBLIC_APP_URL: TEST_PUBLIC_APP_URL
    }), h.clock.read)).toBe(1);
    expect(live.lines.err).toBe("BILLING_INVOICE_OTHER_XMONEY_SYSTEM\n");
  });
});
