import { randomUUID } from "node:crypto";
import { microsToDecimal, type InvoiceIssuer, type IssuedDocument, type RefundRecord } from "@debateai/billing-core";
import type { BillingJobQueries, BillingRepository, InvoiceRow } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { BillingAudit } from "./audit.js";
import { enqueueEmail, type AttachmentResolver } from "./email-job.js";
import {
  creditNoteContext, invoicesOfCharge, loadPaidCharge, otherSystemOutcome, recordedChargeOf, saleRecordOf,
  type InvoiceJobDeps, type PaidCharge, type RecordedCharge
} from "./invoice-common.js";
import { claimLost, DONE, failureRetryAt, type OutboxHandler, type OutboxOutcome } from "./outbox.js";

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
  jobs: Pick<BillingJobQueries, "markJobStage" | "jobStage" | "holdsClaim">;
  audit: BillingAudit;
}>;

const CALL_STARTED = "INVOICE_CALL_STARTED";
/**
 * W12 (P2-I17): the stage `pnpm billing:invoice --requeue --confirm-not-issued` gives a re-queued SmartBill job: the
 * owner checked SmartBill and nothing was issued, which proves what INVOICE_SERVICE_UNAVAILABLE proves (A17b). Only
 * the new job's first attempt carries it: the attempt overwrites it with CALL_STARTED before calling `issue`.
 */
export const INVOICE_CONFIRMED_NOT_ISSUED = "INVOICE_CONFIRMED_NOT_ISSUED";
/** A17(b): the stages that prove an earlier attempt created nothing, so `issue` may be called despite the intent. */
const provenNothingIssued = (stage: string | null): boolean =>
  stage === "INVOICE_SERVICE_UNAVAILABLE" || stage === INVOICE_CONFIRMED_NOT_ISSUED;
const dead = (code: string): OutboxOutcome => Object.freeze({ kind: "DEAD" as const, code });
const retry = (code: string, attempts: number, now: Date): OutboxOutcome =>
  Object.freeze({ kind: "RETRY" as const, code, retryAt: failureRetryAt(attempts, now) });
const codeOf = (error: unknown): string | null => error instanceof TypedDomainError ? error.code : null;

function unknownOutcome(deps: SmartBillDeps, kind: "INVOICE" | "CREDIT_NOTE"): OutboxOutcome {
  deps.audit("billing.invoice.unknown", { issuer: "SMARTBILL", kind, code: "INVOICE_UNKNOWN" });
  return dead("INVOICE_UNKNOWN");
}

/**
 * The one way a SmartBill document is stored (P10b; W12's `pnpm billing:invoice --record` too): the invoice row, its
 * SENT_BY_ACCOUNT_SETTING status (A21), and for an invoice M2 with SmartBill's PDF when the issuer offers one
 * (`attachPdf`), in one transaction. The intent must already exist (0086's `invoice_names_its_intent`).
 */
export async function recordSmartBillDocument(
  repository: Pick<BillingRepository, "withTransaction" | "insertInvoice" | "appendInvoiceStatus" | "enqueue">,
  input: Readonly<{
    charge: RecordedCharge; kind: "INVOICE" | "CREDIT_NOTE"; document: SmartBillDocument; totalMicros: number; now: Date;
    attachPdf: boolean;
  }>
): Promise<void> {
  const { charge, kind, document, totalMicros, now } = input;
  await repository.withTransaction(async (client) => {
    const invoiceId = randomUUID();
    await repository.insertInvoice(client, Object.freeze({
      invoiceId, chargeId: charge.chargeId, issuer: "SMARTBILL", kind,
      externalRef: document.externalRef, series: document.series, number: document.number, url: null, totalMicros, at: now
    }) satisfies InvoiceRow);
    // A21 / X1 row 10: SmartBill sends every document (invoice or credit) to ANAF by the account setting.
    const sent: EfacturaStatus = "SENT_BY_ACCOUNT_SETTING";
    await repository.appendInvoiceStatus(client, { invoiceId, at: now, efacturaStatus: sent });
    if (kind !== "INVOICE") return;
    await enqueueEmail(repository, client, {
      template: "M2_INVOICE_ATTACHED", recipient: { kind: "CUSTOMER", customerId: charge.customerId }, dedupeRef: charge.chargeId,
      params: {
        plan: charge.planId, totalAmount: microsToDecimal(charge.chargeTotalMicros), currency: charge.currency,
        chargeDate: charge.paidAt.toISOString(),
        // P2-M33: one number in one form, `<series>-<number>`, as Settings, the owner's summary and commands show it.
        invoiceNumber: `${document.series}-${document.number}`
      },
      ...(input.attachPdf ? {
        attachments: [{ kind: "SMARTBILL_INVOICE_PDF" as const, fields: { series: document.series, number: document.number } }]
      } : {}),
      notBefore: now
    });
  });
}

async function record(
  deps: SmartBillDeps, paid: PaidCharge, kind: "INVOICE" | "CREDIT_NOTE", document: SmartBillDocument, totalMicros: number, now: Date
): Promise<void> {
  await recordSmartBillDocument(deps.repository, {
    charge: recordedChargeOf(paid), kind, document, totalMicros, now, attachPdf: deps.issuer.pdf !== undefined
  });
}

/**
 * A17(b): calls `issue` only when no earlier attempt can have created the document: the intent is new, or the
 * previous attempt proved nothing was created (INVOICE_SERVICE_UNAVAILABLE), or the owner confirmed it when
 * re-queueing the job (W12's INVOICE_CONFIRMED_NOT_ISSUED), or SmartBill's own lookup says so.
 * C-14: a new intent and its CALL_STARTED stage are one write, made under the job's claim, and the holder that made it
 * calls `issue` next with no further check. A holder that goes stale after that write (its lease ran out while it was
 * slow) still calls SmartBill, so the next holder, which finds the intent with CALL_STARTED and (with no lookup)
 * dead-letters INVOICE_UNKNOWN, reports a true unknown: the document may well exist (A17b), and the owner checks.
 */
async function issueOnce(
  deps: SmartBillDeps, job: Parameters<OutboxHandler>[0], now: Date, paid: PaidCharge, kind: "INVOICE" | "CREDIT_NOTE",
  totalMicros: number, issue: () => Promise<SmartBillDocument>
): Promise<OutboxOutcome> {
  // C-14: the intent is written only while the job row is still this claim's, in one transaction, and a new intent's
  // CALL_STARTED stage is written in that same transaction, under the row lock `holdsClaim` took. A stale holder's
  // intent would read as "an earlier attempt may have issued it" to the current holder, which (with no lookup) would
  // dead-letter INVOICE_UNKNOWN for an invoice nobody issued; and an intent committed without its stage would let a
  // holder that stalls before the stage write lose the claim there, after the next holder had already read the intent
  // as an unknown. Now a holder that goes stale after this commit still calls SmartBill next, so the next holder's
  // INVOICE_UNKNOWN is a true unknown (A17b); a holder that goes stale before it writes nothing.
  const intent = await deps.repository.withTransaction(async (client) => {
    if (!await deps.jobs.holdsClaim(client, job)) return "CLAIM_LOST" as const;
    const inserted = await deps.repository.insertInvoiceIntent(client, {
      chargeId: paid.charge.chargeId, kind, issuer: "SMARTBILL", requestedAt: now
    });
    if (inserted === "INSERTED" && !await deps.jobs.markJobStage(job, CALL_STARTED, client)) {
      // `holdsClaim` locked this very row a moment ago, so the fenced write cannot miss it; if it ever does, the
      // transaction rolls back: there is never an intent without its stage.
      throw new TypedDomainError("INVOICE_STAGE_NOT_WRITTEN", "The invoice intent's call stage matched no job row");
    }
    return inserted;
  });
  if (intent === "CLAIM_LOST") return claimLost(now);
  if (intent === "DUPLICATE") {
    if (!provenNothingIssued(await deps.jobs.jobStage(job.jobId))) {
      if (deps.issuer.lookup === undefined) return unknownOutcome(deps, kind);
      let found: SmartBillDocument | null;
      try {
        found = await deps.issuer.lookup({ chargeId: paid.charge.chargeId, kind });
      } catch {
        // A failed lookup proves nothing either way: it must never leave INVOICE_SERVICE_UNAVAILABLE as the stage
        // (which would let the next attempt call `issue` blindly). The next attempt looks up again; a spent schedule
        // ends DEAD INVOICE_UNKNOWN for the owner.
        return retry("INVOICE_UNKNOWN", job.attempts, now);
      }
      if (found !== null) {
        await record(deps, paid, kind, found, totalMicros, now);
        return DONE;
      }
    }
    // P2-M6: only the job's current claim holder records the stage; a stale holder stops before SmartBill is called.
    if (!await deps.jobs.markJobStage(job, CALL_STARTED)) return claimLost(now);
  }
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
    const other = await otherSystemOutcome(deps, job, job.ref);
    if (other !== null) return other;
    const paid = await loadPaidCharge(deps, job.ref);
    if (paid === null) return dead("INVOICE_CHARGE_NOT_PAID");
    if ((await invoicesOfCharge(deps.repository, paid)).some((invoice) => invoice.kind === "INVOICE")) return DONE;
    return issueOnce(deps, job, now, paid, "INVOICE", paid.charge.totalMicros,
      () => deps.issuer.issue(saleRecordOf(paid, job.payload, deps.policy.taxCode, deps.orderText)));
  };
}

export function createSmartBillStornoHandler(deps: SmartBillDeps): OutboxHandler {
  return async (job, now) => {
    const context = await creditNoteContext(deps, job, now, "SMARTBILL");
    if ("kind" in context) return context;
    const { paid, original } = context;
    if (original.series === null) return retry("INVOICE_ORIGINAL_MISSING", job.attempts, now);
    // P5 still names its negative line itself ("Rambursare partiala <series>-<number>", the Romanian legal wording).
    const refundRecord: RefundRecord & Readonly<{ series: string; number: string }> = Object.freeze({
      ...context.refund, series: original.series, number: original.number
    });
    if (refundRecord.refundTotalMicros >= paid.charge.totalMicros) {
      return issueOnce(deps, job, now, paid, "CREDIT_NOTE", refundRecord.refundTotalMicros, () => deps.issuer.storno(refundRecord));
    }
    const creditPartial = deps.issuer.creditPartial;
    if (creditPartial === undefined) {
      deps.audit("billing.invoice.unknown", { issuer: "SMARTBILL", kind: "CREDIT_NOTE", code: "CREDIT_NOTE_MANUAL" });
      return dead("CREDIT_NOTE_MANUAL");
    }
    const customer = saleRecordOf(paid, job.payload, deps.policy.taxCode, deps.orderText).customer;
    return issueOnce(deps, job, now, paid, "CREDIT_NOTE", refundRecord.refundTotalMicros,
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
    let content: Uint8Array;
    try {
      content = await pdf.call(deps.issuer, { series, number });
    } catch (error) {
      // SmartBill refused the PDF (a 4xx, or bytes that are not a PDF): it will not pass on a retry, so M2 goes out
      // now without it and names the invoice for Settings. Anything else (INVOICE_SERVICE_UNAVAILABLE) is retried.
      if (codeOf(error) === "INVOICE_SERVICE_REFUSED") return null;
      throw error;
    }
    const safe = (value: string) => value.replace(/[^A-Za-z0-9._-]/g, "-");
    return Object.freeze({ filename: `${safe(series)}-${safe(number)}.pdf`, contentType: "application/pdf" as const, content });
  };
}
