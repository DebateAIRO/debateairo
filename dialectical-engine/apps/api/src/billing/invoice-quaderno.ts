import { randomUUID } from "node:crypto";
import { microsToDecimal, type TaxEngine } from "@debateai/billing-core";
import type { InvoiceRow } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { mailLinkOf } from "@debateai/mail-templates";
import type { BillingAudit } from "./audit.js";
import { enqueueEmail } from "./email-job.js";
import {
  creditNoteContext, invoicesOfCharge, loadPaidCharge, otherSystemOutcome, saleRecordOf, type InvoiceJobDeps
} from "./invoice-common.js";
import { DONE, type OutboxHandler, type OutboxOutcome } from "./outbox.js";

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

/**
 * The receipt link M2_INVOICE_LINK carries (spec §2.5.10: a receipt on every successful charge). Quaderno's link is
 * passed through the mail's url rule; one the rule refuses (not https, a user or password, unparsable, too long) falls
 * back to the account's settings page, so the email is never refused and dead-lettered over the link.
 */
export function quadernoInvoiceLink(documentUrl: string | null, publicAppUrl: string): string {
  return (documentUrl === null ? null : mailLinkOf(documentUrl)) ?? new URL("/settings", publicAppUrl).toString();
}

export function createQuadernoSaleHandler(deps: QuadernoDeps): OutboxHandler {
  return async (job, now) => {
    const other = await otherSystemOutcome(deps, job, job.ref);
    if (other !== null) return other;
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
          invoiceUrl: quadernoInvoiceLink(document.url, deps.publicAppUrl)
        },
        notBefore: now
      });
    });
    return DONE;
  };
}

export function createQuadernoRefundHandler(deps: QuadernoDeps): OutboxHandler {
  return async (job, now) => {
    const context = await creditNoteContext(deps, job, now, "QUADERNO");
    if ("kind" in context) return context;
    const { paid, refund } = context;
    await deps.repository.withTransaction((client) => deps.repository.insertInvoiceIntent(client, {
      chargeId: paid.charge.chargeId, kind: "CREDIT_NOTE", issuer: "QUADERNO", requestedAt: now
    }));
    // D5 Open question 4: Quaderno prints the refund's description on the buyer's credit note, in the buyer's language.
    const note = await quaderno(deps.tax.recordRefund(refund));
    if (note === "REFUSED") return dead("TAX_SERVICE_REFUSED");
    await deps.repository.withTransaction((client) => deps.repository.insertInvoice(client, Object.freeze({
      invoiceId: randomUUID(), chargeId: paid.charge.chargeId, issuer: "QUADERNO", kind: "CREDIT_NOTE",
      externalRef: note.documentId, series: null, number: note.number, url: null, totalMicros: refund.refundTotalMicros, at: now
    }) satisfies InvoiceRow));
    return DONE;
  };
}
