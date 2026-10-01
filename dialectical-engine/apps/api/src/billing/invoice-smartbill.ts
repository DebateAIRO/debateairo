import { randomUUID } from "node:crypto";
import { microsToDecimal, type InvoiceIssuer, type IssuedDocument, type RefundRecord } from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository, InvoiceRow } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { BillingAudit } from "./audit.js";
import { enqueueEmail, type AttachmentResolver } from "./email-job.js";
import {
  invoiceLine, invoicesOfCharge, loadPaidCharge, refundJobOf, saleRecordOf, type InvoiceJobDeps, type PaidCharge
} from "./invoice-common.js";
import { englishOrderText } from "./order-text.js";
import { DONE, failureRetryAt, type OutboxHandler, type OutboxOutcome } from "./outbox.js";
import { refundTarget } from "./rows.js";

type SmartBillDocument = IssuedDocument;

/**
 * P5's issuer (R-24; D5 Open question 4): `issue` and `storno` always; `creditPartial`, `pdf` and `lookup` are
 * OPTIONAL members of P2's `InvoiceIssuer` itself (X1 row 8 found no lookup by our reference, so P5 ships none). Each
 * absence has a conservative fallback below, so the port is the issuer as it stands.
 */
export type SmartBillPort = InvoiceIssuer;

/**
 * Spec §2.5.4 / A21: what the e-Factura status event records. SmartBill sends every document to ANAF's SPV by an
 * ACCOUNT setting and offers no API read of the answer (X1 row 10), so the job records the sending and the owner
 * records ANAF's answer, read in SmartBill or in the SPV.
 */
export type EfacturaStatus = "SENT_BY_ACCOUNT_SETTING" | "ACCEPTED" | "REJECTED";

type SmartBillDeps = InvoiceJobDeps & Readonly<{
  repository: Pick<BillingRepository, "appendInvoiceStatus">;
  issuer: SmartBillPort;
  jobs: Pick<BillingJobQueries, "markJobStage" | "jobStage">;
  audit: BillingAudit;
}>;

const CALL_STARTED = "INVOICE_CALL_STARTED";
const dead = (code: string): OutboxOutcome => Object.freeze({ kind: "DEAD" as const, code });
const retry = (code: string, attempts: number, now: Date): OutboxOutcome =>
  Object.freeze({ kind: "RETRY" as const, code, retryAt: failureRetryAt(attempts, now) });
const codeOf = (error: unknown): string | null => error instanceof TypedDomainError ? error.code : null;

function unknownOutcome(deps: SmartBillDeps, kind: "INVOICE" | "CREDIT_NOTE"): OutboxOutcome {
  deps.audit("billing.invoice.unknown", { issuer: "SMARTBILL", kind, code: "INVOICE_UNKNOWN" });
  return dead("INVOICE_UNKNOWN");
}

async function record(
  deps: SmartBillDeps, paid: PaidCharge, kind: "INVOICE" | "CREDIT_NOTE", document: SmartBillDocument, totalMicros: number, now: Date
): Promise<void> {
  await deps.repository.withTransaction(async (client) => {
    const invoiceId = randomUUID();
    await deps.repository.insertInvoice(client, Object.freeze({
      invoiceId, chargeId: paid.charge.chargeId, issuer: "SMARTBILL", kind,
      externalRef: document.externalRef, series: document.series, number: document.number, url: null, totalMicros, at: now
    }) satisfies InvoiceRow);
    // A21 / X1 row 10: SmartBill sends every document (invoice or credit) to ANAF by the account setting.
    const sent: EfacturaStatus = "SENT_BY_ACCOUNT_SETTING";
    await deps.repository.appendInvoiceStatus(client, { invoiceId, at: now, efacturaStatus: sent });
    if (kind !== "INVOICE") return;
    await enqueueEmail(deps.repository, client, {
      template: "M2_INVOICE_ATTACHED", recipient: { kind: "CUSTOMER", customerId: paid.customerId }, dedupeRef: paid.charge.chargeId,
      params: {
        plan: paid.quote.planId, totalAmount: microsToDecimal(paid.charge.totalMicros), chargeDate: paid.paid.at.toISOString(),
        invoiceNumber: `${document.series} ${document.number}`
      },
      ...(deps.issuer.pdf === undefined ? {} : {
        attachments: [{ kind: "SMARTBILL_INVOICE_PDF" as const, fields: { series: document.series, number: document.number } }]
      }),
      notBefore: now
    });
  });
}

/**
 * A17(b): calls `issue` only when no earlier attempt can have created the document: the intent is new, or the
 * previous attempt proved nothing was created (INVOICE_SERVICE_UNAVAILABLE), or SmartBill's own lookup says so.
 */
async function issueOnce(
  deps: SmartBillDeps, job: Parameters<OutboxHandler>[0], now: Date, paid: PaidCharge, kind: "INVOICE" | "CREDIT_NOTE",
  totalMicros: number, issue: () => Promise<SmartBillDocument>
): Promise<OutboxOutcome> {
  const intent = await deps.repository.withTransaction((client) => deps.repository.insertInvoiceIntent(client, {
    chargeId: paid.charge.chargeId, kind, issuer: "SMARTBILL", requestedAt: now
  }));
  if (intent === "DUPLICATE" && await deps.jobs.jobStage(job.jobId) !== "INVOICE_SERVICE_UNAVAILABLE") {
    if (deps.issuer.lookup === undefined) return unknownOutcome(deps, kind);
    const found = await deps.issuer.lookup({ chargeId: paid.charge.chargeId, kind });
    if (found !== null) {
      await record(deps, paid, kind, found, totalMicros, now);
      return DONE;
    }
  }
  await deps.jobs.markJobStage(job.jobId, CALL_STARTED);
  let document: SmartBillDocument;
  try {
    document = await issue();
  } catch (error) {
    // An if chain, not a switch: the codes are P5's open string, and anything else is thrown to the worker's retry.
    const code = codeOf(error);
    if (code === "INVOICE_SERVICE_REFUSED") return dead("INVOICE_SERVICE_REFUSED");
    if (code === "INVOICE_SERVICE_UNAVAILABLE") return retry("INVOICE_SERVICE_UNAVAILABLE", job.attempts, now);
    if (code === "INVOICE_UNKNOWN") {
      return deps.issuer.lookup === undefined ? unknownOutcome(deps, kind) : retry("INVOICE_UNKNOWN", job.attempts, now);
    }
    throw error;
  }
  await record(deps, paid, kind, document, totalMicros, now);
  return DONE;
}

export function createSmartBillInvoiceHandler(deps: SmartBillDeps): OutboxHandler {
  return async (job, now) => {
    const paid = await loadPaidCharge(deps, job.ref);
    if (paid === null) return dead("INVOICE_CHARGE_NOT_PAID");
    if ((await invoicesOfCharge(deps.repository, paid)).some((invoice) => invoice.kind === "INVOICE")) return DONE;
    return issueOnce(deps, job, now, paid, "INVOICE", paid.charge.totalMicros,
      () => deps.issuer.issue(saleRecordOf(paid, job.payload, deps.policy.taxCode, deps.orderText)));
  };
}

export function createSmartBillStornoHandler(deps: SmartBillDeps): OutboxHandler {
  return async (job, now) => {
    const refund = refundJobOf(job);
    if (refund === null) return dead("CREDIT_NOTE_PAYLOAD_INVALID");
    const paid = await loadPaidCharge(deps, refund.chargeId);
    if (paid === null) return dead("INVOICE_CHARGE_NOT_PAID");
    const issued = await invoicesOfCharge(deps.repository, paid);
    if (issued.some((invoice) => invoice.kind === "CREDIT_NOTE")) {
      // Refunds of the sale itself only: a DUPLICATE_PAYMENT's refund (D5 5f) was never a sale and has no document.
      const saleRefunds = paid.charge.events.filter((event) => event.kind === "REFUNDED"
        && refundTarget(event) === paid.paid.xmoneyTransactionId).length;
      if (saleRefunds <= 1) return DONE;
      deps.audit("billing.invoice.unknown", { issuer: "SMARTBILL", kind: "CREDIT_NOTE", code: "CREDIT_NOTE_MANUAL" });
      return dead("CREDIT_NOTE_MANUAL");
    }
    const original = issued.find((invoice) => invoice.kind === "INVOICE");
    if (original === undefined || original.series === null) return retry("INVOICE_ORIGINAL_MISSING", job.attempts, now);
    // The refund of this paid transaction, on its own row or on a refund transaction naming it (D5 5g).
    const refunded = paid.charge.events.find((event) => event.kind === "REFUNDED" && refundTarget(event) === refund.transactionId);
    const refundRecord: RefundRecord & Readonly<{ series: string; number: string }> = Object.freeze({
      chargeId: paid.charge.chargeId, transactionId: refund.transactionId, issuedOn: refunded?.at ?? now,
      refundTotalMicros: refund.refundMicros, original: { documentId: original.externalRef, number: original.number },
      // RefundRecord.description (D5 Open question 4): the credited line in the buyer's language; P5 still names
      // its negative line itself ("Rambursare partiala <series>-<number>", the Romanian legal wording).
      description: invoiceLine(deps.orderText ?? englishOrderText, paid.profile.locale, paid.quote.planId, paid.period),
      series: original.series, number: original.number
    });
    if (refund.refundMicros >= paid.charge.totalMicros) {
      return issueOnce(deps, job, now, paid, "CREDIT_NOTE", refund.refundMicros, () => deps.issuer.storno(refundRecord));
    }
    const creditPartial = deps.issuer.creditPartial;
    if (creditPartial === undefined) {
      deps.audit("billing.invoice.unknown", { issuer: "SMARTBILL", kind: "CREDIT_NOTE", code: "CREDIT_NOTE_MANUAL" });
      return dead("CREDIT_NOTE_MANUAL");
    }
    const customer = saleRecordOf(paid, job.payload, deps.policy.taxCode, deps.orderText).customer;
    return issueOnce(deps, job, now, paid, "CREDIT_NOTE", refund.refundMicros,
      () => creditPartial.call(deps.issuer, {
        ...refundRecord, customer, taxRateBasisPoints: paid.quote.taxRateBasisPoints
      }));
  };
}

/**
 * The owner's reference to a SmartBill document as SmartBill prints it, `<series>-<number>` (the series letters and
 * digits, the number digits; the last `-` splits them). Null when the text is not one.
 */
export function parseSmartBillReference(text: string): Readonly<{ series: string; number: string }> | null {
  const match = /^([A-Za-z0-9]{1,32})-([0-9]{1,64})$/.exec(text.trim());
  return match === null ? null : Object.freeze({ series: match[1]!, number: match[2]! });
}

/**
 * Spec §2.5.4 / A21: ANAF's answer for one SmartBill document, which the owner reads in SmartBill or in the SPV
 * (SmartBill's API has no read of it, X1 row 10), appended as its own status event. D6b's owner command
 * `pnpm billing:efactura-status --invoice <series>-<number> --status ACCEPTED|REJECTED` runs it.
 */
export async function recordEfacturaStatus(
  deps: Readonly<{
    repository: Pick<BillingRepository, "withTransaction" | "appendInvoiceStatus">;
    jobs: Pick<BillingJobQueries, "smartBillDocument">;
  }>,
  input: Readonly<{ series: string; number: string; status: Exclude<EfacturaStatus, "SENT_BY_ACCOUNT_SETTING">; at: Date }>
): Promise<Readonly<{ invoiceId: string; chargeId: string; kind: "INVOICE" | "CREDIT_NOTE" }>> {
  const document = await deps.jobs.smartBillDocument(input.series, input.number);
  if (document === null) {
    throw new TypedDomainError("EFACTURA_DOCUMENT_UNKNOWN", "No SmartBill document has this series and number");
  }
  await deps.repository.withTransaction((client) => deps.repository.appendInvoiceStatus(client, {
    invoiceId: document.invoiceId, at: input.at, efacturaStatus: input.status
  }));
  return document;
}

/** A26(b): the RO receipt carries SmartBill's own PDF, fetched at send time (P5 paces the call). */
export function smartBillPdfResolver(deps: Readonly<{ issuer: SmartBillPort }>): AttachmentResolver {
  return async (fields) => {
    const { series, number } = fields;
    const pdf = deps.issuer.pdf;
    if (series === undefined || number === undefined || pdf === undefined) return null;
    const content = await pdf.call(deps.issuer, { series, number });
    const safe = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, "-");
    return Object.freeze({ filename: `${safe(series)}-${safe(number)}.pdf`, contentType: "application/pdf" as const, content });
  };
}
