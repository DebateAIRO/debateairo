/**
 * Spec §2.5.4 / A21 — the owner records ANAF's answer for one Romanian SmartBill document. SmartBill's API has no
 * read of it (X1 row 10), so the owner reads it in SmartBill or in the ANAF SPV, then runs
 *
 *   pnpm billing:efactura-status --invoice DBAI-0042 --status ACCEPTED
 *
 * On the host it runs under `systemd-run` with the API's EnvironmentFile and writes one `billing.invoice_status_event`
 * as the API's own principal (P14b's operator pool, read-write, one connection: P10b's `recordEfacturaStatus` reads
 * the document before its one transaction opens). An ACCEPTED document leaves the owner summary's e-Factura list
 * (P16b); a REJECTED one stays on it. It prints one plain line; a refusal is ONE code on stderr
 * (`BILLING_EFACTURA_STATUS_USAGE` exits 2 before any connection is opened, the others exit 1).
 */
import { pathToFileURL } from "node:url";
import { BillingJobQueries, BillingRepository } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { loadBillingOperatorEnvironment } from "@debateai/register";
import { parseSmartBillReference, recordEfacturaStatus } from "./invoice-smartbill.js";
import { openBillingOperatorPool } from "./operator-connection.js";

export type EfacturaStatusArguments = Readonly<{ series: string; number: string; status: "ACCEPTED" | "REJECTED" }>;
export type EfacturaStatusCliOutput = Readonly<{ stdout(text: string): void; stderr(text: string): void }>;
/** The document P10b found for the printed series and number. */
export type RecordedEfacturaDocument = Readonly<{ invoiceId: string; chargeId: string; kind: "INVOICE" | "CREDIT_NOTE" }>;
export type EfacturaStatusRecorder = Readonly<{
  record(input: EfacturaStatusArguments, at: Date): Promise<RecordedEfacturaDocument>;
  close(): Promise<void>;
}>;
export type OpenEfacturaStatusRecorder = () => Promise<EfacturaStatusRecorder>;

const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}$/u;

/** Exactly `--invoice <series>-<number>` (P10b's grammar) and `--status ACCEPTED|REJECTED`, in either order. */
export function parseEfacturaStatusArguments(args: readonly string[]): EfacturaStatusArguments {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    const value = args[index + 1];
    if ((name !== "--invoice" && name !== "--status") || value === undefined || values.has(name)) {
      throw new TypeError("BILLING_EFACTURA_STATUS_USAGE");
    }
    values.set(name, value);
  }
  const reference = parseSmartBillReference(values.get("--invoice") ?? "");
  const status = values.get("--status");
  if (reference === null || (status !== "ACCEPTED" && status !== "REJECTED")) {
    throw new TypeError("BILLING_EFACTURA_STATUS_USAGE");
  }
  return Object.freeze({ series: reference.series, number: reference.number, status });
}

export function renderEfacturaStatusResult(input: EfacturaStatusArguments, document: RecordedEfacturaDocument): string {
  const what = `${document.kind === "INVOICE" ? "invoice" : "credit note"} ${input.series}-${input.number}`
    + ` (charge ${document.chargeId})`;
  return input.status === "ACCEPTED"
    ? `Recorded: ANAF accepted ${what}. It leaves the e-Factura list of the owner summary.\n`
    : `Recorded: ANAF rejected ${what}. It stays on the e-Factura list of the owner summary until ANAF accepts it:`
      + " correct it in SmartBill, send it again, then record the new answer.\n";
}

function refusalCode(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  if (error instanceof TypeError && PRINTABLE_CODE.test(error.message)) return error.message;
  return "BILLING_EFACTURA_STATUS_FAILED";
}

export async function runBillingEfacturaStatusCli(
  args: readonly string[], output: EfacturaStatusCliOutput, open: OpenEfacturaStatusRecorder,
  clock: () => Date = () => new Date()
): Promise<number> {
  let input: EfacturaStatusArguments;
  try {
    input = parseEfacturaStatusArguments(args);
  } catch {
    output.stderr("BILLING_EFACTURA_STATUS_USAGE\n");
    return 2;
  }
  try {
    const recorder = await open();
    try {
      output.stdout(renderEfacturaStatusResult(input, await recorder.record(input, clock())));
      return 0;
    } finally {
      await recorder.close().catch(() => undefined);
    }
  } catch (error) {
    output.stderr(`${refusalCode(error)}\n`);
    return 1;
  }
}

/**
 * The recorder as the host runs it: P14b's operator pool on the API's database URL (the API's own principal in
 * production), read-write, one connection, with P10b's `recordEfacturaStatus` on it. The integration test opens it the
 * same way, so the shipped setup is the one tested.
 */
export async function openEfacturaStatusRecorder(
  environment: Readonly<{ DATABASE_URL: string; NODE_ENV?: string | undefined }>
): Promise<EfacturaStatusRecorder> {
  const pool = await openBillingOperatorPool(environment.DATABASE_URL, {
    production: environment.NODE_ENV === "production", readOnly: false, max: 1
  });
  const deps = Object.freeze({ repository: new BillingRepository(pool), jobs: new BillingJobQueries(pool) });
  return Object.freeze({
    record: (input: EfacturaStatusArguments, at: Date) => recordEfacturaStatus(deps, { ...input, at }),
    close: () => pool.end()
  });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runBillingEfacturaStatusCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, () => openEfacturaStatusRecorder(loadBillingOperatorEnvironment()));
}
