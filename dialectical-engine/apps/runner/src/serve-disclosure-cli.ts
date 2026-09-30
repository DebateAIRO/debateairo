/**
 * ENGINE MONEY RULE (spec 2026-09-26 §14.4.5), TASK M5 — the operator's report
 * of one answer's owner-side disclosure record (migration 0076's
 * `serve.serve_disclosure`). Run as
 *
 *   pnpm ops:serve-disclosure <answerId|runId>
 *
 * with `DATABASE_URL` naming the runner's own database principal, read through
 * the register's `loadServeDisclosureReportEnvironment()`. On the host it runs
 * under `systemd-run` with the runner's `EnvironmentFile`
 * (deploy/vps/README.md §11, "The cost envelopes").
 *
 * The connection is READ-ONLY (`default_transaction_read_only`, checked before
 * any read), and in production it must be the runner's own database principal
 * (`debateai_prod_runner_runtime`), the way the rotation command refuses any
 * connection but the support principal (M5 review, M3).
 *
 * It prints the answer's LATEST version that has a record, one fact per line,
 * in plain words: ids, codes, counts and the names of the models — never debate
 * or model text, a price, an address or a credential. A refusal is ONE code on
 * stderr: `SERVE_DISCLOSURE_USAGE` (exit 2), `SERVE_DISCLOSURE_NOT_FOUND`,
 * `SERVE_DISCLOSURE_CONNECTION_NOT_READ_ONLY`, `SERVE_DISCLOSURE_PRINCIPAL_INVALID`,
 * a typed code, or `SERVE_DISCLOSURE_REPORT_FAILED` (exit 1).
 *
 * Every decision lives in the exported functions, which the unit tests drive
 * without a database; the bottom of this file only opens things.
 */
import { pathToFileURL } from "node:url";
import { TypedDomainError } from "@debateai/kernel";
import {
  createPool,
  RunCostSubstitutionRepository,
  ServeDisclosureRepository,
  type Pool,
  type RunCostSubstitution,
  type ServeDisclosureModel,
  type ServeDisclosureRead
} from "@debateai/db";
import { loadServeDisclosureReportEnvironment } from "@debateai/register";
import { DIGEST_LADDER } from "@debateai/serve";

export type ServeDisclosureCliOutput = Readonly<{
  stdout(text: string): void;
  stderr(text: string): void;
}>;

/**
 * B9 (budget spec §2.9): the report's read — the answer's disclosure row, and
 * the run's cost substitutions when the reader supplies them (the shipped
 * reader always does): every call moved to a cheaper maker while arguing (B9)
 * and, when billing chose the Free roster for a paid ask, B8's roster swap
 * (`ASK:roster`). Both live in `core.run_cost_substitution`, read through
 * B8's one reader (ruling R-2). This report is the owner's record of them.
 */
export type ServeDisclosureReport = ServeDisclosureRead & Readonly<{ substitutions?: readonly RunCostSubstitution[] }>;

/** Opened only after the arguments are accepted; closed whatever happens. */
export type OpenServeDisclosureReader = () => Promise<Readonly<{
  read(answerOrRunId: string): Promise<ServeDisclosureReport | null>;
  close(): Promise<void>;
}>>;

const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;
/** A code a refusal may print as it is: an engine code, or a floor refusal such as `DATABASE_URL_TLS_REQUIRED:DATABASE_URL`. */
const PRINTABLE_CODE = /^[A-Z][A-Z0-9_]{2,95}(?::[A-Z][A-Z0-9_]{0,95})?$/u;

/** What cut the arguing, or the answer-writing, short — in words. */
const STOP_WORDS: Readonly<Record<string, string>> = Object.freeze({
  MONEY: "money",
  ATTEMPTS: "the attempt ceiling",
  USAGE: "a vendor that reported no usage",
  DAILY: "the daily ceiling",
  ALLOWANCE: "the person's allowance",
  TRANSPORT_DEATH: "a dead model connection",
  NO_ARTIFACT: "a draft with nothing to serve"
});

function stopWords(stop: string | null): string {
  return stop === null ? "nothing" : STOP_WORDS[stop] ?? stop;
}

/** The digest ladder's rung in words (spec §14.4.3): whole, shortened summaries, compact, the spine. */
function rungWords(rung: number | null): string {
  if (rung === null) return "none (no digest was handed to the answer-writer)";
  if (rung === 0) return "rung 0, whole";
  if (rung < DIGEST_LADDER.compactRung) return `rung ${String(rung)}, shortened summaries`;
  if (rung === DIGEST_LADDER.compactRung) return `rung ${String(rung)}, compact (every point kept)`;
  return `rung ${String(rung)}, the spine (some points left out)`;
}

/** A model as the story's "Written by" names one: maker · model id, and its provider ref. */
function modelWords(model: ServeDisclosureModel | null, providerRef: string): string {
  return model === null
    ? `${providerRef} (no call by it is recorded in this run)`
    : `${model.maker} · ${model.modelId} (${model.providerRef})`;
}

function usedWords(model: ServeDisclosureModel | null, providerRef: string | null): string {
  return providerRef === null ? "none (no checked round was served)" : modelWords(model, providerRef);
}

/** Why a model was chosen for cost, in words (B9; the reasons are B8's `RUN_COST_SUBSTITUTION_REASONS`). */
const SUBSTITUTION_WORDS: Readonly<Record<string, string>> = Object.freeze({
  RUN_ARGUING: "the run's own money while arguing",
  RUN_FIRST_CALL: "the run's own money on the first position's call",
  SITE_DAY: "the daily ceiling",
  PERSON: "the person's allowance"
});

/** B8's roster swap is recorded at this call-site key; it happened at the ask, not while arguing. */
const ASK_ROSTER_CALL_SITE = "ASK:roster";

function substitutionLines(substitutions: readonly RunCostSubstitution[] | undefined): readonly string[] {
  if (substitutions === undefined) return [];
  if (substitutions.length === 0) return ["models chosen for cost: none"];
  return [
    `models chosen for cost: ${String(substitutions.length)}`,
    ...substitutions.map((moved) => `  ${moved.callSiteKey === ASK_ROSTER_CALL_SITE ? "the question's roster" : moved.callSiteKey}:`
      + ` ${moved.plannedProviderRef} -> ${moved.usedProviderRef},`
      + ` because of ${SUBSTITUTION_WORDS[moved.reason] ?? moved.reason}`)
  ];
}

/** The report: one fact per line, ending with a newline. */
export function renderServeDisclosure(read: ServeDisclosureReport): string {
  const { row, models } = read;
  const floor = row.floorVerdictState !== null && row.floorLeadingNodeId !== null;
  const lines = [
    `answer: ${row.answerId} (version ${String(row.answerVersion)})`,
    `run: ${row.runId}`,
    `recorded at: ${row.createdAt.toISOString()}`,
    row.writerServedRef !== null
      ? "answer: written by a model and checked"
      : floor
        ? "answer: not written by a model; the floor stands in for it"
        : "answer: not written by a model",
    floor ? `floor: ${row.floorVerdictState!}, on the leading position ${row.floorLeadingNodeId!}` : "floor: none",
    ...(floor ? [
      `floor reason: ${row.floorReason ?? "unknown"}`,
      `floor label basis: ${row.floorBasisIncomplete === true
        ? "incomplete (derived without a margin or a disagreement measure)"
        : "complete"}`
    ] : []),
    `answer writer planned: ${modelWords(models.writerPlanned, row.writerPlannedRef)}`,
    `answer writer used: ${usedWords(models.writerServed, row.writerServedRef)}`,
    `answer checker planned: ${modelWords(models.checkerPlanned, row.checkerPlannedRef)}`,
    `answer checker used: ${usedWords(models.checkerServed, row.checkerServedRef)}`,
    `a lower-cost model was used: ${row.writerFallback || row.checkerFallback ? "yes, for money" : "no"}`,
    `one model both wrote and checked the answer: ${row.checkerSameAsWriter ? "yes" : "no"}`,
    `arguing cut short by: ${stopWords(row.bodyStop)}`,
    `points left without a cross-review: ${row.pointsWithoutReview === null ? "not counted" : String(row.pointsWithoutReview)}`,
    `answer-writing cut short by: ${stopWords(row.serveStop)}`,
    `digest the answer-writer read: ${rungWords(row.digestRung)}`,
    `points left out of that digest: ${row.digestPointsOmitted === null ? "not counted" : String(row.digestPointsOmitted)}`,
    ...substitutionLines(read.substitutions)
  ];
  return `${lines.join("\n")}\n`;
}

/** One failure as one printable code, never its message. */
function refusalCode(error: unknown): string {
  if (error instanceof TypedDomainError) return error.code;
  if (error instanceof Error && error.name === "ZodError") return "SERVE_DISCLOSURE_ENVIRONMENT_INVALID";
  if (error instanceof TypeError && PRINTABLE_CODE.test(error.message)) return error.message;
  return "SERVE_DISCLOSURE_REPORT_FAILED";
}

/** The runner's own database principal on the host (deploy/vps/README.md §3; P3-01 `runner-runtime`). */
const RUNNER_RUNTIME_PRINCIPAL = "debateai_prod_runner_runtime";

/**
 * The connection this report reads through: one connection, read-only for
 * every transaction it opens, and — in production — the runner's principal and
 * no other. Refused before any row is read.
 */
export async function assertServeDisclosureReportConnection(
  pool: Pick<Pool, "query">,
  production: boolean
): Promise<void> {
  const witness = await pool.query<{ role: string; read_only: string }>(
    "SELECT current_user::text AS role, current_setting('default_transaction_read_only') AS read_only"
  );
  const row = witness.rows[0];
  if (row?.read_only !== "on") throw new TypeError("SERVE_DISCLOSURE_CONNECTION_NOT_READ_ONLY");
  if (production && row.role !== RUNNER_RUNTIME_PRINCIPAL) throw new TypeError("SERVE_DISCLOSURE_PRINCIPAL_INVALID");
}

/**
 * Open the report's reader: ONE connection, so the read-only setting made when
 * it opens holds for every read after it (a replacement connection opens the
 * same way), then the connection check above. Closed again on a refusal.
 */
export async function openServeDisclosureReader(
  databaseUrl: string,
  production: boolean
): Promise<Readonly<{
  read(answerOrRunId: string): Promise<ServeDisclosureReport | null>;
  close(): Promise<void>;
}>> {
  const pool = createPool(databaseUrl, { max: 1 });
  pool.on("connect", (client) => {
    client.query("SET default_transaction_read_only = on").catch(() => undefined);
  });
  try {
    await assertServeDisclosureReportConnection(pool, production);
  } catch (error) {
    await pool.end().catch(() => undefined);
    throw error;
  }
  const repository = new ServeDisclosureRepository(pool);
  const substitutions = new RunCostSubstitutionRepository(pool);
  return Object.freeze({
    read: async (answerOrRunId: string) => {
      const read = await repository.readLatestForOperator(answerOrRunId);
      return read === null
        ? null
        : Object.freeze({ ...read, substitutions: await substitutions.listForRun(read.row.runId) });
    },
    close: () => pool.end()
  });
}

/** The whole command, with its outputs and its database seam injected. Returns the exit code. */
export async function runServeDisclosureCli(
  args: readonly string[],
  output: ServeDisclosureCliOutput,
  open: OpenServeDisclosureReader
): Promise<number> {
  const id = args.length === 1 ? args[0]! : "";
  if (!UUID_TEXT.test(id)) {
    output.stderr("SERVE_DISCLOSURE_USAGE\n");
    return 2;
  }
  try {
    const reader = await open();
    try {
      const read = await reader.read(id);
      if (read === null) {
        output.stderr("SERVE_DISCLOSURE_NOT_FOUND\n");
        return 1;
      }
      output.stdout(renderServeDisclosure(read));
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
  process.exitCode = await runServeDisclosureCli(process.argv.slice(2), {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  }, async () => {
    const environment = loadServeDisclosureReportEnvironment();
    return openServeDisclosureReader(environment.DATABASE_URL, environment.NODE_ENV === "production");
  });
}
