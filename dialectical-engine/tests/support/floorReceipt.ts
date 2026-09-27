import type { Pool } from "@debateai/db";
import { LedgerRepository } from "@debateai/ledger";

/**
 * Engine money rule, M5 review (I2) test support: the label receipt a floor is
 * read with. The runner records it (`ledger.propagation_run.served_root_selection`)
 * BEFORE it seals the answer, and the disclosure reads take the floor's
 * `basis_incomplete` from it; a fixture that writes a floor row by hand records
 * one first, the way the runner does. Only the members the reads use are real.
 */
export async function recordFloorLabelReceipt(pool: Pool, input: Readonly<{
  runId: string;
  servedNodeId: string;
  label: "SUPPORTED" | "CONTESTED" | "UNSUPPORTED";
  basisAbsence: readonly ("MARGIN" | "DISAGREEMENT")[];
}>): Promise<void> {
  await new LedgerRepository(pool).recordPropagation({
    runId: input.runId,
    inputHash: "test-layer:floor-receipt",
    contractHash: "test-layer:propagation",
    graphFingerprint: "test-layer:floor-receipt",
    arrowOrder: [],
    clusterRecords: [],
    operatorResolutions: [],
    transmissionReductions: [],
    liftRecords: [],
    judgementSelectionRule: { kind: "TEST_LAYER" },
    servedRootSelection: {
      rule: "max-propagated-strength-lexicographic-tiebreak",
      servedNodeId: input.servedNodeId,
      servedStrength: 0.5,
      runnerUp: null,
      margin: { kind: "ABSENT", reason: "SINGLE_SERVABLE_ROOT" },
      tiebreak: "NOT_APPLIED",
      candidateCount: 1,
      verdictLabel: {
        label: input.label,
        rung: input.basisAbsence.length > 0 ? 0 : 4,
        trigger: input.basisAbsence.length > 0 ? "BASIS_INCOMPLETE" : "MID_BAND",
        basisAbsence: [...input.basisAbsence],
        disagreement: { kind: "ABSENT", reason: "FEWER_THAN_TWO_PARSEABLE_JUDGEMENTS" },
        registerVersion: 1,
        sourceRefs: {}
      }
    },
    strengths: []
  });
}
