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
}

export interface PersistedTerminalRun {
  readonly answerId: string;
  readonly workItemId: string;
}

/**
 * Persists one terminal answer through the production serve path and settles its
 * work item. ServeRepository.persist owns the sole TERMINAL progress event.
 */
export async function persistTerminalRun(input: PersistTerminalRunInput): Promise<PersistedTerminalRun> {
  const work = new WorkItemRepository(input.pool);
  const workItemId = await work.enqueue({
    runId: input.runId,
    batteryRowId: "Q1",
    nodeSet: [],
    commandKey: `test-layer:terminal-run:${input.fixtureKey}:${input.runId}`
  });
  const factBundle = buildFactBundle(input.factBundle);
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
    projections: Object.freeze({
      reversalPoint: factBundle.reversalPoint,
      buildsOnPrevious: factBundle.buildsOnPrevious,
      memoryDisclosure: factBundle.memoryDisclosure
    })
  });
  const factBundleContentHash = createHash("sha256").update(JSON.stringify(factBundle)).digest("hex");
  const persisted = await new ServeRepository(input.pool).persist({
    runId: input.runId,
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
  await work.settle({ workItemId, attemptId: randomUUID(), artifactRef: persisted.answerId });
  return Object.freeze({ answerId: persisted.answerId, workItemId });
}
