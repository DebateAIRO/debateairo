import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { Pool } from "pg";
import { createPool } from "@debateai/db";
import { readSynthesisRoleControls } from "@debateai/register";
import {
  EVAL_HARNESS_MATRIX,
  EVAL_HARNESS_SPEND,
  projectCallCount,
  renderProjection,
  runEvalHarness,
  type EvalHarnessDependencies,
  type EvalHarnessOutcome,
  type RecordedDebate,
  type SynthesisSurface
} from "./eval-harness.js";
import { ACCEPTANCE_REGISTER_VERSION } from "./seed-register.js";
import { readAcceptanceRuntimePolicy } from "./runtime-policy.js";

/**
 * T15 · THE ONE COMMAND (goal DoD: "one-command harness").
 *
 *   pnpm run eval:roles                      # projection + preflight, then REFUSES
 *   pnpm run eval:roles -- --projection-only # the projected count alone, no database
 *   pnpm run eval:roles -- --approve-spend   # V's explicit approval; only this spends
 *
 * `--approve-spend` is the ONLY thing that unlocks a provider call, and it is
 * V's to type. Nothing in this file may infer approval from an environment
 * variable, a default or a previous run: the goal makes the run an
 * important-operation gate and the gate has exactly one key.
 *
 * The database connection is used for FREE reads only — the sealed T16 role
 * rows (J8: the harness reads role identities, it never carries them as
 * constants), the deployment's configured provider identities, and the recorded
 * debates the matrix reuses. No read on this path calls a provider.
 */

export const EVAL_HARNESS_APPROVAL_FLAG = "--approve-spend" as const;
export const EVAL_HARNESS_PROJECTION_ONLY_FLAG = "--projection-only" as const;

/** The command a report quotes when it asks V to approve the printed count. */
export const EVAL_HARNESS_APPROVED_COMMAND =
  "ACCEPTANCE_DB_PORT=<port> pnpm run eval:roles -- --approve-spend" as const;

export interface EvalHarnessCliOptions {
  readonly approved: boolean;
  readonly projectionOnly: boolean;
  readonly tableOutPath: string | null;
}

export function parseEvalHarnessArgv(argv: readonly string[]): EvalHarnessCliOptions {
  const tableFlagIndex = argv.indexOf("--table-out");
  return Object.freeze({
    approved: argv.includes(EVAL_HARNESS_APPROVAL_FLAG),
    projectionOnly: argv.includes(EVAL_HARNESS_PROJECTION_ONLY_FLAG),
    tableOutPath: tableFlagIndex === -1 ? null : argv[tableFlagIndex + 1] ?? null
  });
}

/**
 * The recorded debates the matrix reuses. Every identifier below is a column of
 * `serve.answer` verified against migrations/0000_s00.sql:258-273, and the two
 * terminal values are members of that table's own CHECK constraint — this query
 * is not written from memory of the schema.
 */
export async function readRecordedDebatesFrom(pool: Pool, limit: number): Promise<readonly RecordedDebate[]> {
  const result = await pool.query<{ run_id: string; answer_id: string; sealed_at_seq: string }>(
    `SELECT run_id::text AS run_id, answer_id::text AS answer_id, sealed_at_seq::text AS sealed_at_seq
       FROM serve.answer
      WHERE terminal IN ('SERVED', 'DOWNGRADED')
      ORDER BY sealed_at_seq DESC
      LIMIT $1`,
    [limit]
  );
  return Object.freeze(result.rows.map((row) => Object.freeze({
    runId: row.run_id,
    answerId: row.answer_id,
    sealedAtSeq: row.sealed_at_seq
  })));
}

/**
 * T9's synthesizer/evaluator surface lives in `@debateai/serve` on lane/s07 and
 * is NOT in every checkout. Resolving it dynamically — and returning null when
 * it is absent — is what lets this harness refuse loudly instead of grading a
 * local copy of the roles. A copy would grade code that never ships.
 */
export function resolveSynthesisSurfaceFrom(
  serveModule: Readonly<Record<string, unknown>>
): SynthesisSurface | null {
  const required = ["buildSynthesizerRequest", "buildEvaluatorRequest", "runSynthesisLoop"];
  if (required.some((name) => typeof serveModule[name] !== "function")) return null;
  throw new Error(
    "EVAL_SYNTHESIS_ADAPTER_UNWRITTEN: T9's surface is present, but the adapter that maps this "
    + "harness's calls onto buildSynthesizerRequest/buildEvaluatorRequest/runSynthesisLoop belongs "
    + "to the lane that owns those signatures. It is written when T9 merges, against the merged "
    + "signatures, and never guessed from an unmerged branch."
  );
}

export async function main(argv: readonly string[]): Promise<EvalHarnessOutcome | null> {
  const options = parseEvalHarnessArgv(argv);
  const emit = (line: string): void => { console.log(line); };

  const port = process.env["ACCEPTANCE_DB_PORT"];
  const databaseMissing = port === undefined || port.trim().length === 0;
  // The projected count reaches the operator on EVERY path, including the two
  // that cannot reach the database at all. A stack trace where the projection
  // should be is a failure of the DoD row, not a tidy error.
  if (options.projectionOnly || databaseMissing) {
    for (const line of renderProjection(projectCallCount({
      recordedDebateCount: EVAL_HARNESS_MATRIX.recordedDebateCount,
      candidateConfigCount: EVAL_HARNESS_MATRIX.candidateConfigCount,
      evaluatorRoundCap: EVAL_HARNESS_MATRIX.evaluatorRoundCap,
      gradersPerCell: EVAL_HARNESS_MATRIX.gradersPerCell,
      maxAttemptsPerCall: EVAL_HARNESS_SPEND.maxAttemptsPerCall,
      tokenCeilingPerCall: EVAL_HARNESS_SPEND.tokenCeilingPerCall
    }))) emit(line);
    if (options.projectionOnly) {
      emit(`approval flag required to proceed: ${EVAL_HARNESS_APPROVAL_FLAG}`);
      return null;
    }
    emit(
      "REFUSED EVAL_RECORDED_DEBATES_UNAVAILABLE: ACCEPTANCE_DB_PORT is unset, so the recorded "
      + "debates the matrix reuses cannot be read. Nothing was spent."
    );
    process.exitCode = 1;
    return null;
  }
  const pool = createPool(
    `postgresql://debateai:debateai-acceptance-local@127.0.0.1:${port}/debateai_acceptance`
  );
  // A LIVE read of what this checkout actually exports, not a stub: if T9 has
  // merged, the three functions are there and the adapter gap becomes loud; if
  // it has not, the surface is honestly absent and the harness refuses.
  const serveModule = await import("@debateai/serve") as Readonly<Record<string, unknown>>;
  try {
    const dependencies: EvalHarnessDependencies = {
      emit,
      readSynthesisRoleControls: async () => readSynthesisRoleControls(pool, ACCEPTANCE_REGISTER_VERSION),
      // The maker travels WITH the ref, off the same sealed configuredProviderSet
      // row, so same-family provenance needs no second register read (V-S11-1).
      readConfiguredProviders: async () => Object.freeze(
        (await readAcceptanceRuntimePolicy(pool)).providers.map((provider) => Object.freeze({
          providerRef: provider.providerRef,
          maker: provider.maker
        }))
      ),
      readRecordedDebates: async () =>
        readRecordedDebatesFrom(pool, EVAL_HARNESS_MATRIX.recordedDebateCount),
      resolveSynthesisSurface: () => resolveSynthesisSurfaceFrom(serveModule),
      grade: async () => {
        throw new Error(
          "EVAL_GRADER_ADAPTER_UNWRITTEN: the blind grader adapter is written with the T9 adapter, "
          + "against merged signatures, and is never reached before V approves the printed count"
        );
      }
    };
    const outcome = await runEvalHarness({ approved: options.approved }, dependencies);
    for (const line of outcome.table) emit(line);
    if (options.tableOutPath !== null) {
      await writeFile(options.tableOutPath, `${outcome.table.join("\n")}\n`, "utf8");
      emit(`comparison table written to ${options.tableOutPath}`);
    }
    return outcome;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
