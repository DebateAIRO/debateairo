import { createHash, randomUUID } from "node:crypto";
import { WorkItemRepository } from "@debateai/battery";
import type { Pool } from "@debateai/db";
import {
  ServeRepository,
  buildFactBundle,
  type FactBundle,
  type GateTrace,
  type ServeGateResult
} from "@debateai/serve";

export interface PersistTerminalRunInput {
  readonly pool: Pool;
  readonly runId: string;
  readonly fixtureKey: string;
  readonly factBundle: FactBundle;
  /**
   * T9 / J29: optional loop-round records, so a fixture can drive the
   * same-run/producer proof `persist` performs before it commits.
   */
  readonly loopRounds?: ServeGateResult["loopRounds"];
  /**
   * Reuse an existing work item instead of enqueueing one. A fixture that has
   * pre-seeded ledger entries needs the persist to share their
   * `subject_item_id`, or the producer binding refuses for the wrong reason.
   */
  readonly workItemId?: string;
}

export interface PersistedTerminalRun {
  readonly answerId: string;
  readonly workItemId: string;
}

/**
 * The PRODUCTION WRITER alone — `ServeRepository.persist` — with no work-item
 * settle after it (codex r4 B2, D43).
 *
 * Why this exists as its own entry point. A negative arm that drives the whole
 * `persistTerminalRun` cannot tell its own guard from the settle that follows
 * it: when R5M2 removed the round guard, `persist` correctly RESOLVED and the
 * run then died in `work.settle` on `23514 WAIT_DRAIN_REQUIRED`. The arm went
 * RED and looked like a kill, but a work-item constraint had killed it, not the
 * binding assertion it was credited to. Anything asserting on the producer
 * binding calls THIS, so removing the guard makes the call resolve and the
 * assertion itself is the only thing left that can fail.
 */
export async function persistTerminalAnswer(
  input: PersistTerminalRunInput & { readonly workItemId: string }
): Promise<{ readonly answerId: string }> {
  return buildAndPersist(input.pool, input.runId, input.workItemId, input.factBundle, input.loopRounds);
}

/**
 * Persists one terminal answer through the production serve path and settles its
 * work item. ServeRepository.persist owns the sole TERMINAL progress event.
 */
export async function persistTerminalRun(input: PersistTerminalRunInput): Promise<PersistedTerminalRun> {
  const work = new WorkItemRepository(input.pool);
  const workItemId = input.workItemId ?? await work.enqueue({
    runId: input.runId,
    batteryRowId: "Q1",
    nodeSet: [],
    commandKey: `test-layer:terminal-run:${input.fixtureKey}:${input.runId}`
  });
  const persisted = await buildAndPersist(
    input.pool, input.runId, workItemId, input.factBundle, input.loopRounds
  );
  await work.settle({ workItemId, attemptId: randomUUID(), artifactRef: persisted.answerId });
  return Object.freeze({ answerId: persisted.answerId, workItemId });
}

/** The one place the terminal result shape and the persist call are built. */
async function buildAndPersist(
  pool: Pool,
  runId: string,
  workItemId: string,
  inputFactBundle: FactBundle,
  loopRounds: ServeGateResult["loopRounds"] | undefined
): Promise<{ readonly answerId: string }> {
  const factBundle = buildFactBundle(inputFactBundle);
  const gateTrace: readonly GateTrace[] = Object.freeze(["GATE1_R9_BLOCK", "COMPONENTS_ONLY_DEFECT"]);
  const result: ServeGateResult = Object.freeze({
    terminal: "COMPONENTS_ONLY",
    answerForm: null,
    factBundle,
    gateTrace,
    conditionMarks: Object.freeze(["DEFECT"]),
    conformance: Object.freeze([]),
    coverageMode: "NOT_RUN",
    segments: Object.freeze([]),
    compositionBudget: Object.freeze({
      tier: "low",
      bound: 1,
      registerRowKey: "test-layer:composition-budget",
      registerVersion: 404_013,
      sourceRef: "test-layer:terminal-run"
    }),
    confidenceBand: null,
    bandCeiling: null,
    // A PRE-T9 sealed answer, kept deliberately: its `GATE1_R9_BLOCK` trace is
    // exactly the retired history the READ vocabulary exists to accept
    // (`RETIRED_GATE_TRACE`, J17's shape). No digest, no loop and no T9 crash
    // class existed when this shape was written, so all four are absent rather
    // than back-filled with a class this answer never had.
    digest: null,
    loopRounds: loopRounds ?? Object.freeze([]),
    standingObjection: null,
    crashClass: null,
    projections: Object.freeze({
      reversalPoint: factBundle.reversalPoint,
      buildsOnPrevious: factBundle.buildsOnPrevious,
      memoryDisclosure: factBundle.memoryDisclosure
    })
  });
  const factBundleContentHash = createHash("sha256").update(JSON.stringify(factBundle)).digest("hex");
  const persisted = await new ServeRepository(pool).persist({
    runId,
    workItemId,
    factBundleVersion: 1,
    factBundleContentHash,
    factBundle,
    result,
    segments: [],
    compositionRawArtifactRef: null,
    compositionAttempt: 0,
    conformanceRawArtifactRefs: [],
    servedNumber: null
  });
  return Object.freeze({ answerId: persisted.answerId });
}
