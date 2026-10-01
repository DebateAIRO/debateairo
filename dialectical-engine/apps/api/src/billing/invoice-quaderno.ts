import { randomUUID } from "node:crypto";
import { microsToDecimal, type TaxEngine } from "@debateai/billing-core";
import type { InvoiceRow } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import type { BillingAudit } from "./audit.js";
import { enqueueEmail } from "./email-job.js";
import {
  invoiceLine, invoicesOfCharge, loadPaidCharge, refundJobOf, saleRecordOf, type InvoiceJobDeps
} from "./invoice-common.js";
import { englishOrderText } from "./order-text.js";
import { DONE, failureRetryAt, type OutboxHandler, type OutboxOutcome } from "./outbox.js";
import { refundTarget } from "./rows.js";

type QuadernoDeps = InvoiceJobDeps & Readonly<{ tax: Pick<TaxEngine, "recordSale" | "recordRefund">; audit: BillingAudit }>;

const dead = (code: string): OutboxOutcome => Object.freeze({ kind: "DEAD" as const, code });

/** A 4xx from Quaderno will not pass on a retry; everything else (5xx, timeout) is retried by the worker. */
async function quaderno<T>(call: Promise<T>): Promise<T | "REFUSED"> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof TypedDomainError && error.code === "TAX_SERVICE_REFUSED") return "REFUSED";
    throw error;
  }
}

export function createQuadernoSaleHandler(deps: QuadernoDeps): OutboxHandler {
  return async (job, now) => {
    const paid = await loadPaidCharge(deps, job.ref);
    if (paid === null) return dead("INVOICE_CHARGE_NOT_PAID");
    if ((await invoicesOfCharge(deps.repository, paid)).some((invoice) => invoice.kind === "INVOICE")) return DONE;
    await deps.repository.withTransaction((client) => deps.repository.insertInvoiceIntent(client, {
      chargeId: paid.charge.chargeId, kind: "INVOICE", issuer: "QUADERNO", requestedAt: now
    }));
    const document = await quaderno(deps.tax.recordSale(saleRecordOf(paid, job.payload, deps.policy.taxCode, deps.orderText)));
    if (document === "REFUSED") return dead("TAX_SERVICE_REFUSED");
    await deps.repository.withTransaction(async (client) => {
      await deps.repository.insertInvoice(client, Object.freeze({
        invoiceId: randomUUID(), chargeId: paid.charge.chargeId, issuer: "QUADERNO", kind: "INVOICE",
        externalRef: document.documentId, series: null, number: document.number, url: document.url,
        totalMicros: paid.charge.totalMicros, at: now
      }) satisfies InvoiceRow);
      await enqueueEmail(deps.repository, client, {
        template: "M2_INVOICE_LINK", recipient: { kind: "CUSTOMER", customerId: paid.customerId }, dedupeRef: paid.charge.chargeId,
        params: {
          plan: paid.quote.planId, totalAmount: microsToDecimal(paid.charge.totalMicros), chargeDate: paid.paid.at.toISOString(),
          invoiceUrl: document.url ?? new URL("/settings", deps.publicAppUrl).toString()
        },
        notBefore: now
      });
    });
    return DONE;
  };
}

export function createQuadernoRefundHandler(deps: QuadernoDeps): OutboxHandler {
  return async (job, now) => {
    const refund = refundJobOf(job);
    if (refund === null) return dead("CREDIT_NOTE_PAYLOAD_INVALID");
    const paid = await loadPaidCharge(deps, refund.chargeId);
    if (paid === null) return dead("INVOICE_CHARGE_NOT_PAID");
    const issued = await invoicesOfCharge(deps.repository, paid);
    // Refunds of the sale itself only: a DUPLICATE_PAYMENT's refund (D5 5f) was never a sale and has no document.
    const refundsOnCharge = paid.charge.events.filter((event) => event.kind === "REFUNDED"
      && refundTarget(event) === paid.paid.xmoneyTransactionId).length;
    if (issued.some((invoice) => invoice.kind === "CREDIT_NOTE")) {
      if (refundsOnCharge <= 1) return DONE;
      deps.audit("billing.invoice.unknown", { issuer: "QUADERNO", kind: "CREDIT_NOTE", code: "CREDIT_NOTE_MANUAL" });
      return dead("CREDIT_NOTE_MANUAL");
    }
    const original = issued.find((invoice) => invoice.kind === "INVOICE");
    if (original === undefined) {
      return Object.freeze({ kind: "RETRY" as const, code: "INVOICE_ORIGINAL_MISSING", retryAt: failureRetryAt(job.attempts, now) });
    }
    // The refund of this paid transaction, on its own row or on a refund transaction naming it (D5 5g).
    const refunded = paid.charge.events.find((event) => event.kind === "REFUNDED" && refundTarget(event) === refund.transactionId);
    await deps.repository.withTransaction((client) => deps.repository.insertInvoiceIntent(client, {
      chargeId: paid.charge.chargeId, kind: "CREDIT_NOTE", issuer: "QUADERNO", requestedAt: now
    }));
    const note = await quaderno(deps.tax.recordRefund({
      chargeId: paid.charge.chargeId, transactionId: refund.transactionId, issuedOn: refunded?.at ?? now,
      refundTotalMicros: refund.refundMicros, original: { documentId: original.externalRef, number: original.number },
      // D5 Open question 4: Quaderno prints this line on the buyer's credit note, in the buyer's language, the same
      // sentence the invoice carried for the period it credits.
      description: invoiceLine(deps.orderText ?? englishOrderText, paid.profile.locale, paid.quote.planId, paid.period)
    }));
    if (note === "REFUSED") return dead("TAX_SERVICE_REFUSED");
    await deps.repository.withTransaction((client) => deps.repository.insertInvoice(client, Object.freeze({
      invoiceId: randomUUID(), chargeId: paid.charge.chargeId, issuer: "QUADERNO", kind: "CREDIT_NOTE",
      externalRef: note.documentId, series: null, number: note.number, url: null, totalMicros: refund.refundMicros, at: now
    }) satisfies InvoiceRow));
    return DONE;
  };
}
