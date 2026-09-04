import type { ObsAcceptanceCase, ObsCaseContext } from "../index.js";
import { FIX08_RUNTIME_SUBJECT } from "./corpus.js";

export const IDENTITY_CANARIES = Object.freeze({
  asker: "00000000-0000-4000-8000-00000000a508",
  session: "00000000-0000-4000-8000-00000000b508",
});

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
  subjectPaths: Object.freeze([FIX08_RUNTIME_SUBJECT]),
  async run(context: ObsCaseContext) {
    return context.fail("LIVE_PIPELINE_BINDING_REQUIRED", { failures: 1 });
  },
});
