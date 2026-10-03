import { randomUUID } from "node:crypto";
import { microsToDecimal, type TaxEngine } from "@debateai/billing-core";
import type { BillingRepository, InvoiceRow } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { mailLinkOf } from "@debateai/mail-templates";
import type { BillingAudit } from "./audit.js";
import { enqueueEmail } from "./email-job.js";
import {
  creditNoteContext, invoicesOfCharge, loadPaidCharge, otherSystemOutcome, recordedChargeOf, saleRecordOf,
  type InvoiceJobDeps, type RecordedCharge
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

/**
 * The one way a Quaderno document is stored (P10a; W12's `pnpm billing:invoice --record` too): the invoice row and,
 * for an invoice, M2 with its link, in one transaction. The intent must already exist (0086's
 * `invoice_names_its_intent`).
 */
export async function recordQuadernoDocument(
  repository: Pick<BillingRepository, "withTransaction" | "insertInvoice" | "enqueue">,
  input: Readonly<{
    charge: RecordedCharge; kind: "INVOICE" | "CREDIT_NOTE"; document: Readonly<{ documentId: string; number: string; url: string | null }>;
    totalMicros: number; now: Date; publicAppUrl: string;
  }>
): Promise<void> {
  const { charge, kind, document, now } = input;
  await repository.withTransaction(async (client) => {
    await repository.insertInvoice(client, Object.freeze({
      invoiceId: randomUUID(), chargeId: charge.chargeId, issuer: "QUADERNO", kind,
      externalRef: document.documentId, series: null, number: document.number, url: kind === "INVOICE" ? document.url : null,
      totalMicros: input.totalMicros, at: now
    }) satisfies InvoiceRow);
    if (kind !== "INVOICE") return;
    await enqueueEmail(repository, client, {
      template: "M2_INVOICE_LINK", recipient: { kind: "CUSTOMER", customerId: charge.customerId }, dedupeRef: charge.chargeId,
      params: {
        plan: charge.planId, totalAmount: microsToDecimal(charge.chargeTotalMicros), chargeDate: charge.paidAt.toISOString(),
        invoiceUrl: quadernoInvoiceLink(document.url, input.publicAppUrl)
      },
      notBefore: now
    });
  });
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
    await recordQuadernoDocument(deps.repository, {
      charge: recordedChargeOf(paid), kind: "INVOICE", document, totalMicros: paid.charge.totalMicros, now,
      publicAppUrl: deps.publicAppUrl
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
    await recordQuadernoDocument(deps.repository, {
      charge: recordedChargeOf(paid), kind: "CREDIT_NOTE", document: { ...note, url: null },
      totalMicros: refund.refundTotalMicros, now, publicAppUrl: deps.publicAppUrl
    });
    return DONE;
  };
}
