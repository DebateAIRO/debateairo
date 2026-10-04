import type { BillingRepository, OutboxJob } from "@debateai/db";
import { emailJob } from "./email-job.js";

/**
 * W12 (P2-I16, P2-I17; the controller's rulings of 2 October 2026): what the owner is told about a legal document or
 * an email that is never sent. One wording, used by the owner summary (P16b's lists, the command and O1) and by the
 * owner's alert O3, so the two never disagree. English only, owner-facing, content-free: job kinds, codes, templates
 * and our own ids, never a person.
 */

/** The four outbox kinds that issue a legal document (spec §2.5.8–§2.5.9). */
export type DocumentJobKind = "QUADERNO_RECORD_SALE" | "QUADERNO_RECORD_REFUND" | "SMARTBILL_INVOICE" | "SMARTBILL_STORNO";
const DOCUMENT_JOB_KINDS: ReadonlySet<string> = new Set<DocumentJobKind>([
  "QUADERNO_RECORD_SALE", "QUADERNO_RECORD_REFUND", "SMARTBILL_INVOICE", "SMARTBILL_STORNO"
]);

export function isDocumentJobKind(kind: string): kind is DocumentJobKind {
  return DOCUMENT_JOB_KINDS.has(kind);
}

/** The document a job issues: a sale job an INVOICE, a refund job a CREDIT_NOTE. */
export function documentOfJob(kind: DocumentJobKind): "INVOICE" | "CREDIT_NOTE" {
  return kind === "QUADERNO_RECORD_SALE" || kind === "SMARTBILL_INVOICE" ? "INVOICE" : "CREDIT_NOTE";
}

export function issuerOfJob(kind: DocumentJobKind): "QUADERNO" | "SMARTBILL" {
  return kind === "SMARTBILL_INVOICE" || kind === "SMARTBILL_STORNO" ? "SMARTBILL" : "QUADERNO";
}

/** The charge a document job names: its ref (a sale) or the ref's first part (`${chargeId}:${transactionId}`). */
export function chargeOfDocumentJob(ref: string): string {
  return ref.split(":")[0]!;
}

/**
 * Dead-letter codes that mean our records do not back the job, so there is nothing to issue, record or re-queue:
 * CREDIT_NOTE_REFUND_MISSING (P2-I5 (2): no REFUNDED row of the sale backs this credit note; the W4 judge's forward,
 * progress.md: never offered to `--record` or `--requeue`), CREDIT_NOTE_PAYLOAD_INVALID (a malformed job),
 * INVOICE_CHARGE_NOT_PAID (no payment is recorded for the charge) and OTHER_XMONEY_SYSTEM (P2-I4: a payment of the
 * other xMoney system, which owes no document here). `pnpm billing:invoice` refuses each of them.
 */
const UNBACKED_DOCUMENT_CODES: ReadonlySet<string> = new Set([
  "CREDIT_NOTE_REFUND_MISSING", "CREDIT_NOTE_PAYLOAD_INVALID", "INVOICE_CHARGE_NOT_PAID", "OTHER_XMONEY_SYSTEM"
]);

export function unbackedDocumentCode(code: string): boolean {
  return UNBACKED_DOCUMENT_CODES.has(code);
}

/**
 * What the owner does about one dead document job (or P9c's DASHBOARD_REFUND and REFUNDED_BEFORE_START lines, which
 * have no job). The command lines name the charge and the document kind, ready to copy. An if chain, not a switch: the
 * codes are an open set.
 */
export function documentJobAction(item: Readonly<{ chargeId: string; jobKind: string; code: string }>): string {
  if (item.jobKind === "REFUNDED_BEFORE_START") {
    // Part 4 final review C-5 (the controller's ruling): P9c's never-verified path (a payment xMoney refunded before we
    // ever saw it paid, for a checkout, an upgrade or a renewal) queues no invoice; A29 (q) owes no invoice and no
    // credit note for it. The quarter still counts its SALE and lists its refund, so the owner takes both out by hand.
    return "Refunded before it started: no invoice or credit note is owed. Take this sale and its refund out of the"
      + " quarter's figures by hand.";
  }
  if (item.jobKind === "DASHBOARD_REFUND") {
    // P4-K (P2-W12, the owner's ruling of 3 October 2026, option (b)): P9c queued no job for this refund, so the
    // owner issues the credit note by hand and records it with its amount (`--amount`, at most what the payment held).
    // One credit note per charge (0086's invoice_one_per_intent): the command refuses a second one.
    return "a refund made in the xMoney dashboard, whose amount only the dashboard shows: issue its credit note by hand"
      + " in SmartBill (a Romanian sale) or Quaderno, then record it with its amount: pnpm billing:invoice --charge"
      + ` ${item.chargeId} --kind CREDIT_NOTE --record <series>-<number> (SmartBill) or <Quaderno id> --amount <the amount`
      + " refunded, for example 12.10>, at most what the payment held; the line then leaves this list and the quarter's"
      + " tax summary subtracts that amount; the command refuses a second credit note of one charge, so give that one to"
      + " the accountant";
  }
  if (item.code === "CREDIT_NOTE_REFUND_MISSING") {
    return "no refund is recorded for this sale: nothing to issue or re-queue; tell whoever runs the server";
  }
  if (item.code === "OTHER_XMONEY_SYSTEM") {
    return "a payment of the other xMoney system (sandbox or live), which owes no document here: nothing to issue or"
      + " re-queue";
  }
  if (unbackedDocumentCode(item.code) || !isDocumentJobKind(item.jobKind)) {
    return "our records do not back this job (no payment is recorded, or the job is malformed): nothing to issue or"
      + " re-queue; tell whoever runs the server";
  }
  const kind = documentOfJob(item.jobKind);
  const smartbill = issuerOfJob(item.jobKind) === "SMARTBILL";
  const issuer = smartbill ? "SmartBill" : "Quaderno";
  const command = `pnpm billing:invoice --charge ${item.chargeId} --kind ${kind}`;
  const record = `${command} --record ${smartbill ? "<series>-<number>" : "<Quaderno id>"}`;
  // SmartBill has no lookup (X1 row 8): a re-queued SmartBill job issues a new document, so only after the owner
  // checked. Quaderno looks for a document with the payment's id first (P4), so a re-run never issues twice.
  const requeue = smartbill
    ? `once you have checked in SmartBill that nothing was issued, re-queue it with ${command} --requeue --confirm-not-issued`
    : `re-queue it with ${command} --requeue (Quaderno looks for an existing document first, so it is never issued twice)`;
  const byHand = `or issue it by hand in ${issuer} and record it with ${record}`;
  if (item.code === "INVOICE_UNKNOWN") {
    return `${issuer} never confirmed it: look for it in ${issuer}; if it is there, record it with ${record};`
      + ` if it is not, ${requeue}`;
  }
  if (item.code === "INVOICE_SERVICE_REFUSED" || item.code === "INVOICE_SERVICE_UNAVAILABLE") {
    return `SmartBill never issued it: once SmartBill takes it again, ${requeue}; ${byHand}`;
  }
  if (item.code === "TAX_SERVICE_REFUSED") {
    return `Quaderno refused it (a wrong or revoked key, or a request it rejects): fix the key or the request, then ${requeue}`;
  }
  if (item.code === "TAX_SERVICE_UNAVAILABLE") {
    return `Quaderno did not answer through every retry: once it answers, ${requeue}`;
  }
  if (item.code === "INVOICE_ORIGINAL_MISSING") {
    return "this credit note waits for the charge's invoice, which is not recorded: settle the invoice first (its own"
      + ` line), then ${requeue}`;
  }
  if (item.code === "CREDIT_NOTE_MANUAL") {
    // F5: a refund made in the dashboard of unknown amount has no job; its line is DASHBOARD_REFUND, above (P4-K's
    // `--amount` records its credit note).
    return `a credit note ${issuer} cannot make by itself (a partial refund, or a second refund of one charge): issue it`
      + ` by hand in ${issuer} and record it with ${record}; the command refuses a second credit note of one charge, so`
      + " give that one to the accountant";
  }
  return `the job failed on our side: tell whoever runs the server; once the cause is fixed, ${requeue}; ${byHand}`;
}

/** What a lost email means, and what the owner does about it. An if chain: templates are read from the job. */
export function deadEmailAction(template: string | null, recipient: string | null): string {
  if (recipient === "OWNER") {
    return "an email to you never went out: check the owner address (the file OWNER_REPORT_EMAIL_PATH names in the API's"
      + " settings) and the mail relay; this summary (pnpm billing:tax-summary) shows the same lists";
  }
  const address = "ask whoever runs the server for the account's address";
  if (template === "M1") {
    return "the customer never got the confirmation with the Terms and the model withdrawal form, which the law requires"
      + ` on a durable medium: ${address}, send them the Terms of their version and the withdrawal form yourself, and`
      + " report the code";
  }
  if (template === "M2_INVOICE_LINK" || template === "M2_INVOICE_ATTACHED") {
    return `the customer never got the receipt: ${address} and send them their invoice from Quaderno or SmartBill`;
  }
  if (template === "M3") {
    return "the notice of a changed renewal amount never went out: nothing is charged and the plan stays active until a"
      + " notice goes out; the renewal waits and sends the notice again when its 7-business-day wait ends; report the code";
  }
  if (template === "M8_RECEIVED") {
    return "the acknowledgement of a withdrawal never went out, which the law requires: "
      + `${address} and confirm to them yourself that their withdrawal was received`;
  }
  if (template === "M8") {
    return `the confirmation of a withdrawal's refund never went out: ${address} and confirm the refund yourself`;
  }
  return "the customer never got this email, and nothing sends it again by itself: report the code to whoever runs the"
    + " server";
}

/**
 * W12: the outbox worker's dead-letter hook. Every dead document job and every dead EMAIL job queues the owner's O3
 * at once (one per dead job, deduplicated by its job id), except a dead O3 itself, which would only repeat. The lists
 * stay the daily and quarterly reminder; nothing else is alerted here (a dead refund already queues O2, Q-5).
 */
export function createDeadJobAlert(deps: Readonly<{
  repository: Pick<BillingRepository, "withTransaction" | "enqueue">;
}>): (job: OutboxJob, code: string, now: Date) => Promise<void> {
  return async (job, code, now) => {
    const alert = alertOf(job, code);
    if (alert === null) return;
    await deps.repository.withTransaction((client) => deps.repository.enqueue(client, emailJob({
      template: "O3", recipient: { kind: "OWNER" }, dedupeRef: job.jobId,
      params: { jobKind: alert.jobKind, reference: alert.reference, reasonCode: code, nextSteps: alert.nextSteps },
      notBefore: now
    })));
  };
}

function alertOf(job: OutboxJob, code: string): Readonly<{ jobKind: string; reference: string; nextSteps: string }> | null {
  if (isDocumentJobKind(job.kind)) {
    const chargeId = chargeOfDocumentJob(job.ref);
    return { jobKind: job.kind, reference: `charge ${chargeId}`, nextSteps: documentJobAction({ chargeId, jobKind: job.kind, code }) };
  }
  if (job.kind !== "EMAIL") return null;
  const template = typeof job.payload.template === "string" ? job.payload.template : null;
  if (template === "O3") return null;
  const recipient = typeof job.payload.recipient === "string" ? job.payload.recipient : null;
  return { jobKind: `EMAIL ${template ?? "unknown"}`, reference: job.ref, nextSteps: deadEmailAction(template, recipient) };
}
