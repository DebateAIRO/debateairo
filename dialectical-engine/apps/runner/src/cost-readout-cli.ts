/**
 * THE OWNER'S COST READ-OUT, on demand:
 *
 *   pnpm ops:cost-readout                                    the last 7 days
 *   pnpm ops:cost-readout --days 30
 *   pnpm ops:cost-readout --from 2026-11-01 --to 2026-11-07
 *   pnpm ops:cost-readout --run <runId>                      one debate or one dig
 *
 * Add `--json` to any of them for the same numbers as one JSON object.
 *
 * Plain words: it prints where the money for AI calls went, by step, by job, by model and by run, from the spend
 * ledger (`@debateai/budget`'s cost read-out). `DATABASE_URL` names the runner's own database principal, read through
 * the register's `loadCostReadoutEnvironment()`. On the host it runs under `systemd-run` with the runner's
 * `EnvironmentFile` (deploy/vps/README.md §11, "Where the money went").
 *
 * The connection is READ-ONLY (`default_transaction_read_only`, checked before any read), and in production it must
 * be the runner's own database principal (`debateai_prod_runner_runtime`), which already reads and writes these rows.
 *
 * It prints codes, counts, amounts and the names of models. It never prints a question, an answer, an address or a
 * credential. A refusal is ONE code on stderr: `COST_READOUT_USAGE` (exit 2), `COST_READOUT_RUN_NOT_FOUND`,
 * `COST_READOUT_CONNECTION_NOT_READ_ONLY`, `COST_READOUT_PRINCIPAL_INVALID`, a typed code, or `COST_READOUT_FAILED`
 * (exit 1).
 *
 * Every decision lives in the exported functions, which the unit tests drive without a database; the bottom of this
 * file only opens things.
 */
import { pathToFileURL } from "node:url";
import {
  PostgresCostReadoutReader,
  costReadoutLastDays,
  costReadoutSpan,
  renderCostReadout,
  type CostReadout
} from "@debateai/budget";
import { createPool, type Pool } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";
import { loadCostReadoutEnvironment } from "@debateai/register";

export type CostReadoutCliOutput = Readonly<{
  stdout(text: string): void;
  stderr(text: string): void;
}>;

/** Opened only after the arguments are accepted; closed whatever happens. */
export type OpenCostReadoutReader = () => Promise<Readonly<{
  readDays(span: Readonly<{ from: string; to: string }>): Promise<CostReadout>;
  readRun(runId: string): Promise<CostReadout | null>;
  close(): Promise<void>;
}>>;

/** What the arguments ask for. A span is given as a number of days up to today, or as its first and last day. */
export type CostReadoutRequest = Readonly<{ json: boolean }> & (
  | Readonly<{ kind: "LAST_DAYS"; days: number }>
  | Readonly<{ kind: "SPAN"; from: string; to: string }>
  | Readonly<{ kind: "RUN"; runId: string }>
);

/** With no span named, the read-out covers a week: long enough to even out one odd day, short enough to act on. */
export const COST_READOUT_DEFAULT_DAYS = 7 as const;

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
const WHOLE_NUMBER = /^[1-9]\d{0,3}$/u;
/** A code a refusal may print as it is: an engine code, or a floor refusal such as `DATABASE_URL_TLS_REQUIRED:DATABASE_URL`. */
const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}(?::[A-Z][A-Z0-9_]{0,95})?$/u;

/**
 * The arguments as a request, or null when they do not name exactly one thing to read. Each option may be given once,
 * a span's two days come together, and a span, a number of days and a run exclude each other.
 */
export function parseCostReadoutArgs(args: readonly string[]): CostReadoutRequest | null {
  const values = new Map<string, string>();
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index]!;
    if (option === "--json") {
      if (json) return null;
      json = true;
      continue;
    }
    const value = args[index + 1];
    if (!["--days", "--from", "--to", "--run"].includes(option) || value === undefined || values.has(option)) return null;
    values.set(option, value);
    index += 1;
  }
  const days = values.get("--days"), from = values.get("--from"), to = values.get("--to"), runId = values.get("--run");
  if (values.size === 0) return Object.freeze({ kind: "LAST_DAYS", days: COST_READOUT_DEFAULT_DAYS, json });
  if (values.size === 1 && days !== undefined && WHOLE_NUMBER.test(days)) return Object.freeze({ kind: "LAST_DAYS", days: Number(days), json });
  if (values.size === 1 && runId !== undefined && UUID_TEXT.test(runId)) return Object.freeze({ kind: "RUN", runId, json });
  if (values.size === 2 && from !== undefined && to !== undefined) return Object.freeze({ kind: "SPAN", from, to, json });
  return null;
}

/** One failure as one printable code, never its message. */
function refusalCode(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  if (error instanceof Error && error.name === "ZodError") return "COST_READOUT_ENVIRONMENT_INVALID";
  if (error instanceof TypeError && PRINTABLE_CODE.test(error.message)) return error.message;
  return "COST_READOUT_FAILED";
}

/** The runner's own database principal on the host (deploy/vps/README.md §3). */
const RUNNER_RUNTIME_PRINCIPAL = "debateai_prod_runner_runtime";

/**
 * The connection the read-out reads through: read-only for every transaction it opens, and in production the runner's
 * principal and no other. Refused before any row is read.
 */
export async function assertCostReadoutConnection(pool: Pick<Pool, "query">, production: boolean): Promise<void> {
  const witness = await pool.query<{ role: string; read_only: string }>(
    "SELECT current_user::text AS role, current_setting('default_transaction_read_only') AS read_only"
  );
  const row = witness.rows[0];
  if (row?.read_only !== "on") throw new TypeError("COST_READOUT_CONNECTION_NOT_READ_ONLY");
  if (production && row.role !== RUNNER_RUNTIME_PRINCIPAL) throw new TypeError("COST_READOUT_PRINCIPAL_INVALID");
}

/**
 * Open the read-out's reader: ONE connection, so the read-only setting made when it opens holds for every read after
 * it (a replacement connection opens the same way), then the connection check above. Closed again on a refusal.
 */
export async function openCostReadoutReader(databaseUrl: string, production: boolean): Promise<Awaited<ReturnType<OpenCostReadoutReader>>> {
  const pool = createPool(databaseUrl, { max: 1 });
  pool.on("connect", (client) => {
    client.query("SET default_transaction_read_only = on").catch(() => undefined);
  });
  try {
    await assertCostReadoutConnection(pool, production);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
  const reader = new PostgresCostReadoutReader(pool);
  return Object.freeze({
    readDays: (span: Readonly<{ from: string; to: string }>) => reader.readDays(span),
    readRun: (runId: string) => reader.readRun(runId),
    close: () => pool.end()
  });
}

/**
 * The whole command, with its outputs, its database seam and its clock injected. Returns the exit code. A span that
 * cannot be read (a day that does not exist, an end before its start) is a usage refusal, decided before the database
 * is opened.
 */
export async function runCostReadoutCli(
  args: readonly string[],
  output: CostReadoutCliOutput,
  open: OpenCostReadoutReader,
  now: () => Date = () => new Date()
): Promise<number> {
  const request = parseCostReadoutArgs(args);
  let span: Readonly<{ from: string; to: string }> | null = null;
  try {
    if (request?.kind === "LAST_DAYS") span = costReadoutLastDays(request.days, now());
    if (request?.kind === "SPAN") span = costReadoutSpan(request.from, request.to);
  } catch {
    span = null;
  }
  if (request === null || (request.kind !== "RUN" && span === null)) {
    output.stderr("COST_READOUT_USAGE\n");
    return 2;
  }
  try {
    const reader = await open();
    try {
      const readout = request.kind === "RUN" ? await reader.readRun(request.runId) : await reader.readDays(span!);
      if (readout === null) {
        output.stderr("COST_READOUT_RUN_NOT_FOUND\n");
        return 1;
      }
      output.stdout(request.json ? `${JSON.stringify(readout)}\n` : renderCostReadout(readout));
      return 0;
    } finally {
      await reader.close().catch(() => undefined);
    }
  } catch (error) {
    output.stderr(`${refusalCode(error)}\n`);
    return 1;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCostReadoutCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, async () => {
    const environment = loadCostReadoutEnvironment();
    return openCostReadoutReader(environment.DATABASE_URL, environment.NODE_ENV === "production");
  });
}
