import type { ObsAcceptanceCase, ObsCaseContext } from "../index.js";
import { IDENTITY_CANARIES } from "../case-inputs.js";
import { readCorrelationRows } from "../database.js";
import { FIX08_RUNTIME_SUBJECT } from "./corpus.js";

export { IDENTITY_CANARIES } from "../case-inputs.js";

const CAPTURE_SUBJECT = "acceptance/obs/subjects/capture-subject.ts";

export const OBS_CORRELATION_COLUMNS = Object.freeze([
  "run_ref",
  "work_item_ref",
  "node_ref",
  "attempt_ref",
  "ledger_ref",
  "parent_occurrence_ref",
  "at_seq_watermark",
] as const);

export interface IdentityCanaryHit {
  readonly rowIndex: number;
  readonly column: typeof OBS_CORRELATION_COLUMNS[number];
  readonly canary: keyof typeof IDENTITY_CANARIES;
}

export interface IdentityCanaryEvaluation {
  readonly passed: boolean;
  readonly scannedCells: number;
  readonly hits: readonly IdentityCanaryHit[];
}

export function evaluateIdentityCanaries(
  rows: readonly Readonly<Record<string, unknown>>[],
): IdentityCanaryEvaluation {
  let scannedCells = 0;
  const hits: IdentityCanaryHit[] = [];
  for (const [rowIndex, row] of rows.entries()) {
    for (const column of OBS_CORRELATION_COLUMNS) {
      if (!Object.hasOwn(row, column)) continue;
      scannedCells += 1;
      const value = row[column];
      if (typeof value !== "string") continue;
      for (const [canary, planted] of Object.entries(IDENTITY_CANARIES) as [keyof typeof IDENTITY_CANARIES, string][]) {
        if (value.includes(planted)) {
          hits.push(Object.freeze({ rowIndex, column, canary }));
        }
      }
    }
  }
  return Object.freeze({
    passed: hits.length === 0,
    scannedCells,
    hits: Object.freeze(hits),
  });
}

export const identityCanaryCase: ObsAcceptanceCase = Object.freeze({
  name: "identity-canary",
  subjectPaths: Object.freeze([FIX08_RUNTIME_SUBJECT, CAPTURE_SUBJECT]),
  async run(context: ObsCaseContext) {
    if (!process.env.OBS_WRITER_DATABASE_URL?.trim()) {
      return context.skipMissing("OBS_WRITER_DATABASE_URL");
    }
    if (!process.env.OBS_LISTENER_DATABASE_URL?.trim()) {
      return context.skipMissing("OBS_LISTENER_DATABASE_URL");
    }
    try {
      const receipt = await context.spawn({
        command: process.execPath,
        arguments: ["--import", "tsx", CAPTURE_SUBJECT, "identity-canary"],
        environment: { OBS_WRITER_DATABASE_URL: process.env.OBS_WRITER_DATABASE_URL },
        timeoutMs: 10_000,
        rowExpectation: { runtime: "scheduler", capturePoint: "job" },
      });
      if (receipt.exitCode !== 0 || receipt.declaredRunRef === undefined || receipt.stderr !== "") {
        return context.fail("IDENTITY_SUBJECT_FAILED", { failures: 1 });
      }
      const evaluation = evaluateIdentityCanaries(await readCorrelationRows(receipt.declaredRunRef));
      if (!evaluation.passed) {
        return context.fail("IDENTITY_CANARY_STORED", { hits: evaluation.hits.length });
      }
      return context.passRows(receipt, { scanned_cells: evaluation.scannedCells });
    } catch {
      return context.fail("IDENTITY_PROOF_UNAVAILABLE", { failures: 1 });
    }
  },
});
