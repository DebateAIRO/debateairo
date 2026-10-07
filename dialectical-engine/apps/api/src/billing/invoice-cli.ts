/**
 * W12 (P2-I17; the controller's ruling of 2 October 2026): the way back for a legal document whose job died. The owner
 * settles one line of the owner summary's "Invoices and credit notes to check by hand":
 *
 *   pnpm billing:invoice --charge <ref> --kind INVOICE|CREDIT_NOTE --record <series>-<number> | <Quaderno id>
 *   pnpm billing:invoice --charge <ref> --kind INVOICE|CREDIT_NOTE --requeue [--confirm-not-issued]
 *   pnpm billing:invoice --charge <ref> --kind CREDIT_NOTE --record <series>-<number> | <Quaderno id> --amount <12.10>
 *
 * `--record` stores a document the owner issued or found by hand, through the handlers' own record path (P10b's
 * `record()` for SmartBill: the row, its SENT_BY_ACCOUNT_SETTING status and, for an invoice, M2 naming the invoice
 * number without SmartBill's PDF (W12 fix F6: a number typed by hand is never used to fetch a document for a customer);
 * P10a's for Quaderno: the row and, for an invoice, M2 with the settings link). `--requeue` queues the dead job again
 * for the API's outbox; a SmartBill job only with `--confirm-not-issued`, once the owner checked in SmartBill that
 * nothing was issued (SmartBill has no lookup, X1 row 8), and a Quaderno job freely (P4 looks a sale or a refund up by
 * the payment's id before posting, so a re-run never issues twice). Both need a dead job the summary lists for that
 * charge and kind, no job of that kind still queued, and no document of that kind recorded yet; a job our records do
 * not back (CREDIT_NOTE_REFUND_MISSING and the other `unbackedDocumentCode`s, the W4 judge's forward) is refused,
 * so nothing is issued for a refund that never happened.
 *
 * `--amount` (P4-K, P2-W12; the owner's ruling of 3 October 2026, option (b)) records the credit note the owner
 * issued by hand for a refund made in the xMoney dashboard that xMoney reported on the payment itself (P9c's
 * PROVIDER_REFUND REFUNDED with no refund transaction, the owner summary's DASHBOARD_REFUND line, which has no job):
 * at the owner's amount, at most what the payment held (that REFUNDED row's amount, P9c's upper bound), from the
 * issuer of the charge's own invoice. The line then clears by `invoiceUnknownItems`' own NOT EXISTS, and
 * `quarterSummaryRows` subtracts the refund at the credit note's amount. One credit note per charge stays (0086's
 * `invoice_one_per_intent`): a charge that has one already is refused, and that refund goes to the accountant.
 *
 * On the host it runs under `systemd-run` with the API's EnvironmentFile and writes as the API's own principal
 * (P14b's operator pool, read-write, one connection); it never calls Quaderno or SmartBill. It prints one plain
 * line; a refusal is ONE code on stderr (`BILLING_INVOICE_USAGE` exits 2 before any connection is opened, the others
 * exit 1).
 */
import { pathToFileURL } from "node:url";
import {
  BillingJobQueries, BillingRepository, type ChargeEventRow, type ChargeRow, type CustomerXMoneyEnvironment, type InvoiceRow,
  type OutboxJob
} from "@debateai/db";
import { decimalToMicros, microsToDecimal } from "@debateai/billing-core";
import { exhaustive, TypedDomainError } from "@debateai/kernel";
import { xmoneyEnvironmentOf } from "@debateai/payments-xmoney";
import { loadBillingInvoiceEnvironment } from "@debateai/register";
import { documentOfJob, issuerOfJob, isDocumentJobKind, unbackedDocumentCode, type DocumentJobKind } from "./dead-jobs.js";
import { refundJobOf, saleRefundOf, type RecordedCharge } from "./invoice-common.js";
import { recordQuadernoDocument } from "./invoice-quaderno.js";
import { INVOICE_CONFIRMED_NOT_ISSUED, parseSmartBillReference, recordSmartBillDocument } from "./invoice-smartbill.js";
import { openBillingOperatorPool } from "./operator-connection.js";

export type InvoiceArguments =
  /** `amountMicros` (P4-K): only with `--kind CREDIT_NOTE`, for a DASHBOARD_REFUND line; absent otherwise. */
  | Readonly<{ chargeId: string; kind: "INVOICE" | "CREDIT_NOTE"; mode: "RECORD"; reference: string; amountMicros?: number }>
  | Readonly<{ chargeId: string; kind: "INVOICE" | "CREDIT_NOTE"; mode: "REQUEUE"; confirmNotIssued: boolean }>;
export type InvoiceResult =
  | Readonly<{
    kind: "RECORDED"; document: "INVOICE" | "CREDIT_NOTE"; issuer: "QUADERNO" | "SMARTBILL";
    /** A dead credit-note job of the charge that waits for this invoice (INVOICE_ORIGINAL_MISSING): re-queue it next. */
    creditNoteWaiting: boolean;
  }>
  | Readonly<{ kind: "REQUEUED"; jobKind: DocumentJobKind }>;
export type InvoiceCliOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
export type OpenInvoiceCommand = () => Promise<Readonly<{
  run(input: InvoiceArguments, now: Date): Promise<InvoiceResult>;
  close(): Promise<void>;
}>>;
export type InvoiceCommandDeps = Readonly<{
  repository: Pick<BillingRepository,
    | "charge" | "quote" | "customerByOwner" | "invoicesForOwner" | "withTransaction" | "insertInvoiceIntent"
    | "insertInvoice" | "appendInvoiceStatus" | "enqueue" | "requeue">;
  jobs: Pick<BillingJobQueries, "documentJobsOfCharge" | "documentByExternalRef">;
  /** P2-I4 (D5 5h): the xMoney system the API's invoicers follow; a charge of the other system owes no document here. */
  xmoneyEnvironment: CustomerXMoneyEnvironment;
  /** R-7: PUBLIC_APP_URL's origin, for a recorded Quaderno receipt's settings link. */
  publicAppUrl: string;
}>;

const CHARGE_REF = /^[A-Za-z0-9]{1,64}$/u;
const QUADERNO_ID = /^[A-Za-z0-9_-]{1,64}$/u;
const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;
/** Dollars and cents, as `pnpm billing:withdraw` takes an amount (the charges are in USD). */
const AMOUNT = /^(0|[1-9][0-9]*)\.[0-9]{2}$/u;
const refuse = (code: string, message: string): never => { throw new TypedDomainError(code, message); };

/** Exactly the grammar above, the flags in any order, each once. */
export function parseInvoiceArguments(args: readonly string[]): InvoiceArguments {
  const values = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index]!;
    if (values.has(name)) throw new TypeError("BILLING_INVOICE_USAGE");
    if (name === "--requeue" || name === "--confirm-not-issued") {
      values.set(name, true);
    } else if (name === "--charge" || name === "--kind" || name === "--record" || name === "--amount") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("--")) throw new TypeError("BILLING_INVOICE_USAGE");
      values.set(name, value);
      index += 1;
    } else {
      throw new TypeError("BILLING_INVOICE_USAGE");
    }
  }
  const chargeId = values.get("--charge");
  const kind = values.get("--kind");
  const record = values.get("--record");
  const requeue = values.get("--requeue") === true;
  const confirmNotIssued = values.get("--confirm-not-issued") === true;
  const amount = values.get("--amount");
  if (typeof chargeId !== "string" || !CHARGE_REF.test(chargeId) || (kind !== "INVOICE" && kind !== "CREDIT_NOTE")) {
    throw new TypeError("BILLING_INVOICE_USAGE");
  }
  if (typeof record === "string" && !requeue && !confirmNotIssued) {
    if (parseSmartBillReference(record) === null && !QUADERNO_ID.test(record)) throw new TypeError("BILLING_INVOICE_USAGE");
    if (amount === undefined) return Object.freeze({ chargeId, kind, mode: "RECORD" as const, reference: record });
    // P4-K: an amount names a dashboard refund's credit note, in whole cents above zero.
    const amountMicros = typeof amount === "string" && AMOUNT.test(amount) ? decimalToMicros(amount) : 0;
    if (kind !== "CREDIT_NOTE" || amountMicros <= 0) throw new TypeError("BILLING_INVOICE_USAGE");
    return Object.freeze({ chargeId, kind, mode: "RECORD" as const, reference: record, amountMicros });
  }
  if (record === undefined && amount === undefined && requeue) {
    return Object.freeze({ chargeId, kind, mode: "REQUEUE" as const, confirmNotIssued });
  }
  throw new TypeError("BILLING_INVOICE_USAGE");
}

/** The command's work: every check before any write, then one record or one re-queued job. */
export async function runInvoiceCommand(deps: InvoiceCommandDeps, input: InvoiceArguments, now: Date): Promise<InvoiceResult> {
  const charge = await deps.repository.charge(input.chargeId);
  if (charge === null) return refuse("BILLING_INVOICE_CHARGE_UNKNOWN", "no charge has this reference");
  if (charge.paymentProvider !== "xmoney" || charge.paymentEnvironment !== deps.xmoneyEnvironment) {
    return refuse("BILLING_INVOICE_OTHER_XMONEY_SYSTEM", "the charge was paid in the other xMoney system");
  }
  const paid = charge.events.find((event) => event.kind === "SUCCEEDED");
  if (paid === undefined || paid.providerPaymentId === null) {
    return refuse("BILLING_INVOICE_CHARGE_NOT_PAID", "the charge records no payment");
  }
  const issued = (await deps.repository.invoicesForOwner(charge.ownerRef)).filter((invoice) => invoice.chargeId === charge.chargeId);
  if (issued.some((invoice) => invoice.kind === input.kind)) {
    return refuse("BILLING_INVOICE_ALREADY_RECORDED", "the charge already has a document of this kind");
  }
  const jobs = await deps.jobs.documentJobsOfCharge(charge.chargeId, input.kind);
  if (jobs.open) return refuse("BILLING_INVOICE_JOB_OPEN", "a job for this document is still queued");
  const original = issued.find((invoice) => invoice.kind === "INVOICE");
  if (input.mode === "RECORD" && input.amountMicros !== undefined) {
    return recordDashboardCreditNote(deps, { charge, paid, original, reference: input.reference, amountMicros: input.amountMicros, now });
  }
  const dead = jobs.dead;
  if (dead === null || !isDocumentJobKind(dead.kind)) {
    // P4-K: a DASHBOARD_REFUND line has no job; its credit note is recorded with the owner's amount (`--amount`).
    if (input.mode === "RECORD" && input.kind === "CREDIT_NOTE" && dashboardRefundOf(charge, paid) !== null) {
      return refuse("BILLING_INVOICE_REFUND_AMOUNT_UNKNOWN", "a dashboard refund: give the credit note's amount with --amount");
    }
    return refuse("BILLING_INVOICE_NOTHING_LISTED", "no dead job of this kind is listed for the charge");
  }
  if (unbackedDocumentCode(dead.code)) return refuse("BILLING_INVOICE_NOTHING_TO_ISSUE", "our records do not back this job");
  const issuer = issuerOfJob(dead.kind);
  if (input.kind === "CREDIT_NOTE" && original === undefined) {
    return refuse("BILLING_INVOICE_ORIGINAL_MISSING", "settle the charge's invoice first");
  }
  const listed: ListedJob = Object.freeze({ kind: dead.kind, ref: dead.ref, payload: dead.payload, code: dead.code });
  switch (input.mode) {
    case "REQUEUE":
      return requeue(deps, listed, issuer, input.confirmNotIssued, now);
    case "RECORD": {
      const document = documentOfJob(listed.kind);
      return record(deps, {
        charge, paid, document, issuer, reference: input.reference, now,
        totalMicros: () => document === "INVOICE" ? charge.totalMicros : creditedMicros(charge, paid, listed)
      });
    }
    default:
      return exhaustive(input);
  }
}

/**
 * P4-K: P9c's dashboard refund recorded on the sale's payment itself (PROVIDER_REFUND, no refund transaction), the
 * row the owner summary lists as DASHBOARD_REFUND; null when the charge holds none. `saleRefundOf` decides the shape,
 * the one definition the credit-note jobs read.
 */
function dashboardRefundOf(charge: PaidChargeRow, paid: ChargeEventRow): Readonly<{ upToMicros: number }> | null {
  const sale = paid.providerPaymentId === null ? null : saleRefundOf(charge, paid, paid.providerPaymentId);
  return sale?.kind === "AMOUNT_UNKNOWN" ? sale : null;
}

/**
 * P4-K (P2-W12, option (b)): the credit note the owner issued by hand for a DASHBOARD_REFUND line, at the owner's
 * amount, at most what the payment held, from the issuer of the charge's own invoice (spec §1.4: the credit note
 * comes from the charge's issuer). The checks before it (no credit note yet, no job queued) are `runInvoiceCommand`'s.
 */
async function recordDashboardCreditNote(deps: InvoiceCommandDeps, input: Readonly<{
  charge: PaidChargeRow; paid: ChargeEventRow; original: InvoiceRow | undefined; reference: string; amountMicros: number; now: Date;
}>): Promise<InvoiceResult> {
  const dashboard = dashboardRefundOf(input.charge, input.paid);
  if (dashboard === null) {
    return refuse("BILLING_INVOICE_NO_DASHBOARD_REFUND", "--amount is only for a refund made in the xMoney dashboard");
  }
  if (input.original === undefined) return refuse("BILLING_INVOICE_ORIGINAL_MISSING", "settle the charge's invoice first");
  if (input.amountMicros > dashboard.upToMicros) {
    return refuse("BILLING_INVOICE_AMOUNT_ABOVE_PAYMENT", "the credit note would credit more than the payment held");
  }
  return record(deps, {
    charge: input.charge, paid: input.paid, document: "CREDIT_NOTE", issuer: input.original.issuer,
    totalMicros: () => input.amountMicros, reference: input.reference, now: input.now
  });
}

type PaidChargeRow = ChargeRow & Readonly<{ events: ChargeEventRow[] }>;
/** The dead job the owner summary lists for the charge and kind (P1b's `documentJobsOfCharge`). */
type ListedJob = Readonly<{ kind: DocumentJobKind; ref: string; payload: OutboxJob["payload"]; code: string }>;

async function requeue(
  deps: InvoiceCommandDeps, dead: ListedJob, issuer: "QUADERNO" | "SMARTBILL", confirmNotIssued: boolean, now: Date
): Promise<InvoiceResult> {
  if (issuer === "SMARTBILL" && !confirmNotIssued) {
    return refuse("BILLING_INVOICE_CONFIRM_NOT_ISSUED_REQUIRED", "check SmartBill first, then confirm nothing was issued");
  }
  const jobId = await deps.repository.withTransaction((client) => deps.repository.requeue(client, {
    kind: dead.kind, ref: dead.ref, payload: dead.payload, notBefore: now,
    stage: issuer === "SMARTBILL" ? INVOICE_CONFIRMED_NOT_ISSUED : null
  }));
  if (jobId === null) return refuse("BILLING_INVOICE_JOB_OPEN", "a job for this document is still queued");
  return Object.freeze({ kind: "REQUEUED" as const, jobKind: dead.kind });
}

async function record(deps: InvoiceCommandDeps, input: Readonly<{
  charge: PaidChargeRow; paid: ChargeEventRow; document: "INVOICE" | "CREDIT_NOTE"; issuer: "QUADERNO" | "SMARTBILL";
  /** Read after the reference checks, so a refusal names the reference first, as before P4-K. */
  totalMicros: () => number; reference: string; now: Date;
}>): Promise<InvoiceResult> {
  const { charge, document, issuer, now } = input;
  const smartbill = issuer === "SMARTBILL" ? parseSmartBillReference(input.reference) : null;
  if (issuer === "SMARTBILL" ? smartbill === null : !QUADERNO_ID.test(input.reference)) {
    return refuse("BILLING_INVOICE_REFERENCE_INVALID", "SmartBill takes <series>-<number>, Quaderno its document id");
  }
  const externalRef = smartbill === null ? input.reference : `${smartbill.series}-${smartbill.number}`;
  if (await deps.jobs.documentByExternalRef(issuer, externalRef)) {
    return refuse("BILLING_INVOICE_DOCUMENT_TAKEN", "this document is already recorded for a charge");
  }
  const totalMicros = input.totalMicros();
  const quote = charge.quoteId === null ? null : await deps.repository.quote(charge.quoteId, charge.ownerRef);
  const customer = await deps.repository.customerByOwner(charge.ownerRef);
  if (quote === null || customer === null) return refuse("BILLING_INVOICE_DATA_MISSING", "a paid charge without its quote or customer");
  const recorded: RecordedCharge = Object.freeze({
    chargeId: charge.chargeId, customerId: customer.customerId, planId: quote.planId,
    chargeTotalMicros: charge.totalMicros, paidAt: input.paid.at
  });
  // A17a: the intent first (it already exists after the job's own attempt; 0086's foreign key needs it).
  await deps.repository.withTransaction((client) => deps.repository.insertInvoiceIntent(client, {
    chargeId: charge.chargeId, kind: document, issuer, requestedAt: now
  }));
  if (smartbill !== null) {
    // W12 fix F6 (privacy): no PDF. The API's resolver would fetch whatever SmartBill holds under the typed series and
    // number, so two swapped hand-issued numbers would mail one customer another's invoice (DOCUMENT_TAKEN only catches
    // numbers already recorded). M2 goes out with its missing-attachment paragraph: the invoice number, where it is
    // listed in Settings, and the merchant address for a copy. The handler's own record path still attaches the PDF of
    // a document SmartBill itself just returned.
    await recordSmartBillDocument(deps.repository, {
      charge: recorded, kind: document, totalMicros, now, attachPdf: false,
      document: { series: smartbill.series, number: smartbill.number, externalRef }
    });
  } else {
    // Quaderno's printed number is not read back (the command calls no vendor): the id stands for it.
    await recordQuadernoDocument(deps.repository, {
      charge: recorded, kind: document, totalMicros, now, publicAppUrl: deps.publicAppUrl,
      document: { documentId: externalRef, number: externalRef, url: null }
    });
  }
  const waiting = document === "INVOICE" ? (await deps.jobs.documentJobsOfCharge(charge.chargeId, "CREDIT_NOTE")).dead : null;
  return Object.freeze({
    kind: "RECORDED" as const, document, issuer, creditNoteWaiting: waiting?.code === "INVOICE_ORIGINAL_MISSING"
  });
}

/**
 * The amount a recorded credit note credits: the charge's own REFUNDED row for the sale's payment that the dead job
 * names, read by the same `saleRefundOf` the credit-note jobs read (P2-I5 (2), W12 fix I-2), never the job's figure.
 * A malformed job, one naming another charge or transaction, or no such row, is not backed; a dashboard refund
 * recorded on the payment itself holds only an upper bound.
 */
function creditedMicros(charge: PaidChargeRow, paid: ChargeEventRow, dead: ListedJob): number {
  const refund = refundJobOf(dead);
  const sale = refund === null || refund.chargeId !== charge.chargeId ? null : saleRefundOf(charge, paid, refund.transactionId);
  if (sale === null || sale.kind === "MISSING") {
    return refuse("BILLING_INVOICE_NOTHING_TO_ISSUE", "no refund of the sale backs this credit note");
  }
  if (sale.kind === "AMOUNT_UNKNOWN") {
    return refuse("BILLING_INVOICE_REFUND_AMOUNT_UNKNOWN", "a dashboard refund whose amount only the dashboard shows");
  }
  return sale.amountMicros;
}

export function renderInvoiceResult(input: InvoiceArguments, result: InvoiceResult): string {
  switch (result.kind) {
    case "RECORDED": {
      const what = `${result.issuer === "SMARTBILL" ? "SmartBill" : "Quaderno"} ${result.document === "INVOICE" ? "invoice" : "credit note"}`;
      const reference = input.mode === "RECORD" ? input.reference : "";
      return `Recorded: ${what} ${reference} for charge ${input.chargeId}.`
        + (result.document === "INVOICE" ? " The receipt (M2) is queued for the customer." : "")
        + (result.issuer === "SMARTBILL"
          ? " It joins the e-Factura list until you record ANAF's answer with pnpm billing:efactura-status." : "")
        + " It leaves the owner summary's list."
        + (input.mode === "RECORD" && input.amountMicros !== undefined
          ? ` The quarter's tax summary now subtracts this refund at ${microsToDecimal(input.amountMicros)} USD.` : "")
        + (result.creditNoteWaiting
          ? ` A credit note of this charge was waiting for this invoice: re-queue it with pnpm billing:invoice --charge`
            + ` ${input.chargeId} --kind CREDIT_NOTE --requeue${result.issuer === "SMARTBILL" ? " --confirm-not-issued (once you have checked SmartBill)" : ""}.`
          : "")
        + "\n";
    }
    case "REQUEUED":
      return `Re-queued: the ${result.jobKind} job of charge ${input.chargeId} runs again within a minute, in the API's`
        + " outbox. It leaves the owner summary's list; if it fails again, it is listed again and you are emailed (O3).\n";
    default:
      return exhaustive(result);
  }
}

function refusalCode(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  if (error instanceof TypeError && PRINTABLE_CODE.test(error.message)) return error.message;
  return "BILLING_INVOICE_FAILED";
}

export async function runBillingInvoiceCli(
  args: readonly string[], output: InvoiceCliOutput, open: OpenInvoiceCommand, clock: () => Date = () => new Date()
): Promise<number> {
  let input: InvoiceArguments;
  try {
    input = parseInvoiceArguments(args);
  } catch {
    output.stderr("BILLING_INVOICE_USAGE\n");
    return 2;
  }
  try {
    const command = await open();
    try {
      output.stdout(renderInvoiceResult(input, await command.run(input, clock())));
      return 0;
    } finally {
      await command.close().catch(() => undefined);
    }
  } catch (error) {
    output.stderr(`${refusalCode(error)}\n`);
    return 1;
  }
}

/**
 * The command as the host runs it: P14b's operator pool on the API's database URL (the API's own principal in
 * production), read-write, one connection, the xMoney system named by the API's XMONEY_API_BASE_URL. The integration
 * test opens it the same way, so the shipped setup is the one tested.
 */
export async function openInvoiceCommand(environment: Readonly<{
  DATABASE_URL: string; XMONEY_API_BASE_URL: string; PUBLIC_APP_URL: string; NODE_ENV?: string | undefined;
}>): ReturnType<OpenInvoiceCommand> {
  const pool = await openBillingOperatorPool(environment.DATABASE_URL, {
    production: environment.NODE_ENV === "production", readOnly: false, max: 1
  });
  const deps: InvoiceCommandDeps = Object.freeze({
    repository: new BillingRepository(pool), jobs: new BillingJobQueries(pool),
    xmoneyEnvironment: xmoneyEnvironmentOf(environment.XMONEY_API_BASE_URL),
    publicAppUrl: new URL(environment.PUBLIC_APP_URL).origin
  });
  return Object.freeze({
    run: (input: InvoiceArguments, now: Date) => runInvoiceCommand(deps, input, now),
    close: () => pool.end()
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runBillingInvoiceCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, () => openInvoiceCommand(loadBillingInvoiceEnvironment()));
}
