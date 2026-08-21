import type { Pool } from "pg";
import { decide, type DecisionInput, type DecisionOutcome } from "@debateai/battery-decision";
import {
  GraphRepository,
  type SpawnPendingChildInput,
  type SpawnedPendingChild,
  type NodeLifecycleEvent
} from "@debateai/graph";
import { LedgerRepository, type DecisionRecord } from "@debateai/ledger";
import { TypedDomainError } from "@debateai/kernel";

export interface SplitStageInput {
  readonly runId: string;
  readonly parentNodeId: string;
  readonly idempotencyKey: string;
  readonly decisionInput: DecisionInput;
  readonly child?: Omit<
    SpawnPendingChildInput,
    "runId" | "parentNodeId" | "explorationDecision"
  >;
}

export interface SplitStageResult {
  readonly decision: DecisionOutcome;
  readonly decisionRecord: DecisionRecord;
  readonly spawn: SpawnedPendingChild | null;
}

export class SplitStageRunner {
  readonly #ledger: LedgerRepository;
  readonly #graph: GraphRepository;

  constructor(pool: Pool) {
    this.#ledger = new LedgerRepository(pool);
    this.#graph = new GraphRepository(pool);
  }

  async execute(input: SplitStageInput): Promise<SplitStageResult> {
    const decision = decide(input.decisionInput);
    const decisionRecord = await this.#ledger.recordDecision({
      runId: input.runId,
      parentNodeId: input.parentNodeId,
      idempotencyKey: input.idempotencyKey,
      replayIdentity: {
        signals: input.decisionInput.signals,
        pathState: { ...input.decisionInput.pathState },
        action: decision.action,
        firingReasons: decision.firingReasons,
        blockers: decision.blockers,
        nextPathState: decision.nextPathState
      },
      classification: decision.classification,
      spawnCount: decision.spawnCount
    });
    if (decision.spawnCount === 0) {
      if (input.child !== undefined) {
        throw new TypedDomainError(
          "NONSPAWNING_DECISION_HAS_CHILD",
          "A non-spawning decision cannot carry child work"
        );
      }
      return Object.freeze({ decision, decisionRecord, spawn: null });
    }
    if (decision.classification !== "categorical") {
      throw new TypedDomainError("SCALAR_DECISION_CANNOT_SPAWN", "Only a categorical decision may reach graph spawn");
    }
    if (input.child === undefined) {
      throw new TypedDomainError("CATEGORICAL_SPAWN_CHILD_MISSING", "A spawning decision requires its pending child");
    }
    const spawn = await this.#graph.spawnPendingChild({
      ...input.child,
      runId: input.runId,
      parentNodeId: input.parentNodeId,
      explorationDecision: decision.action
    });
    return Object.freeze({ decision, decisionRecord, spawn });
  }
}

export class SplitLifecycleProjection {
  readonly #graph: GraphRepository;

  constructor(pool: Pool) {
    this.#graph = new GraphRepository(pool);
  }

  read(runId: string): Promise<readonly NodeLifecycleEvent[]> {
    return this.#graph.readNodeLifecycleEvents(runId);
  }
}
