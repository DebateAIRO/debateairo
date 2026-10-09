/**
 * Spec §2.5.9 — the owner's tax summary on demand:
 *
 *   pnpm billing:tax-summary --quarter 2026-Q4
 *
 * On the host it runs under `systemd-run` with the API's EnvironmentFile, on a read-only one-connection pool as the
 * API's own principal (P14b). It is built from our own rows of the live payment system, so it does not depend on any
 * vendor being up.
 */
import { pathToFileURL } from "node:url";
import { TypedDomainError } from "@debateai/kernel";
import { BillingJobQueries, BillingRepository, type TaxSummaryRow } from "@debateai/db";
import { loadBillingOperatorEnvironment, readTaxAuthorities, type TaxAuthorities } from "@debateai/register";
import { openBillingOperatorPool } from "./operator-connection.js";
import {
  buildTaxSummary,
  deadEmailsFrom,
  efacturaChecksFrom,
  liveQuarterSummaryRows,
  parseTaxQuarter,
  paymentsToCheckFrom,
  renderTaxSummary,
  unverifiedNoticeDaysFrom,
  type DeadEmailItem,
  type EFacturaCheckItem,
  type InvoiceUnknownItem,
  type PaymentToCheckItem,
  type TaxQuarter,
  type UnverifiedNoticeDay
} from "./tax-summary.js";

export type TaxSummaryCliOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
export type OpenTaxSummaryReader = () => Promise<Readonly<{
  rows(from: Date, to: Date): Promise<ReadonlyArray<TaxSummaryRow>>;
  invoiceUnknown(): Promise<ReadonlyArray<InvoiceUnknownItem>>;
  /** P2-M24: every SmartBill document issued before `before` (the quarter's end) that ANAF has not accepted. */
  efactura(before: Date): Promise<ReadonlyArray<EFacturaCheckItem>>;
  paymentsToCheck(): Promise<ReadonlyArray<PaymentToCheckItem>>;
  /** W12 (P2-I16): the emails that never went out, of the last 120 days. */
  deadEmails(): Promise<ReadonlyArray<DeadEmailItem>>;
  /** N9: the quarantined NETOPIA messages by day (absent: none printed). */
  unverifiedNotices?(): Promise<ReadonlyArray<UnverifiedNoticeDay>>;
  authorities(): Promise<TaxAuthorities | null>;
  close(): Promise<void>;
}>>;

const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;

function quarterFrom(args: readonly string[]): TaxQuarter {
  if (args.length !== 2 || args[0] !== "--quarter") throw new TypeError("BILLING_TAX_SUMMARY_USAGE");
  return parseTaxQuarter(args[1]!);
}

export async function runBillingTaxSummaryCli(
  args: readonly string[], output: TaxSummaryCliOutput, open: OpenTaxSummaryReader
): Promise<number> {
  let quarter: TaxQuarter;
  try {
    quarter = quarterFrom(args);
  } catch {
    output.stderr("BILLING_TAX_SUMMARY_USAGE\n");
    return 2;
  }
  try {
    const reader = await open();
    try {
      const authorities = await reader.authorities();
      if (authorities === null) throw new TypeError("TAX_AUTHORITIES_UNRESOLVED");
      output.stdout(renderTaxSummary(buildTaxSummary({
        quarter, rows: await reader.rows(quarter.from, quarter.to),
        invoiceUnknown: await reader.invoiceUnknown(), efactura: await reader.efactura(quarter.to),
        paymentsToCheck: await reader.paymentsToCheck(), deadEmails: await reader.deadEmails(),
        unverifiedNotices: await reader.unverifiedNotices?.() ?? [], authorities
      })));
      return 0;
    } finally {
      await reader.close().catch(() => undefined);
    }
  } catch (error) {
    const code = error instanceof TypedDomainError ? error.code
      : error instanceof TypeError && PRINTABLE_CODE.test(error.message) ? error.message : "BILLING_TAX_SUMMARY_FAILED";
    output.stderr(`${code}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runBillingTaxSummaryCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, async () => {
    const environment = loadBillingOperatorEnvironment();
    const pool = await openBillingOperatorPool(environment.DATABASE_URL, {
      production: environment.NODE_ENV === "production", readOnly: true, max: 1
    });
    const billing = new BillingRepository(pool);
    const jobs = new BillingJobQueries(pool);
    return Object.freeze({
      rows: (from: Date, to: Date) => liveQuarterSummaryRows(billing, from, to),
      invoiceUnknown: () => billing.invoiceUnknownItems(),
      efactura: (before: Date) => efacturaChecksFrom(jobs, before),
      paymentsToCheck: () => paymentsToCheckFrom(billing, new Date()),
      deadEmails: () => deadEmailsFrom(billing, new Date()),
      unverifiedNotices: () => unverifiedNoticeDaysFrom(billing, new Date()),
      authorities: () => readTaxAuthorities(pool, environment.REGISTER_VERSION),
      close: () => pool.end()
    });
  });
}
