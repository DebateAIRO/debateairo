import type { Pool } from "pg";
import type { CallBound, ProviderGateway } from "@debateai/providers";
import {
  assertEvaluatorProviderIsolation,
  DomainRegistryRepository,
  EvaluatorCatalogRepository,
  EvaluatorHarvestRepository,
  HARVEST_PIPELINE_VERSION,
  probeEvaluatorVllmCatalog,
  reconcileEvaluatorMetering,
  runEvaluatorQuestionTagger,
  type EvaluatorHarvestResult,
  type EvaluatorMeteringReconciliationResult,
  type EvaluatorQuestionTagResult,
  type EvaluatorProviderFamilyRow,
  type RelativeCostDerivationWindow
} from "@debateai/evaluator";

export const EVALUATOR_TASK_FAMILIES = Object.freeze([
  "evaluator.tag-question",
  "evaluator.reconcile-tags",
  "evaluator.harvest-terminal-runs",
  "evaluator.grade-judge-output",
  "evaluator.derive-profiles",
  "evaluator.refresh-consumer-output"
] as const);
export const HARVEST_MAX_CONSECUTIVE_FAILURES = 3 as const;

export async function runEvaluatorCatalogProbe(
  pool: Pool,
  family: EvaluatorProviderFamilyRow,
  deployment: {
    readonly configuredProviders: readonly {
      readonly providerRef: string;
      readonly maker: string;
    }[];
  },
  fetchImplementation: typeof fetch = fetch
): Promise<{ readonly probeId: string; readonly state: "AVAILABLE" | "UNAVAILABLE" }> {
  assertEvaluatorProviderIsolation(family, deployment);
  const probe = await probeEvaluatorVllmCatalog(family, fetchImplementation);
  const probeId = await new EvaluatorCatalogRepository(pool).record(family, probe);
  return Object.freeze({ probeId, state: probe.state });
}

export async function runAskTimeEvaluatorTag(input: {
  readonly pool: Pool;
  readonly runId: string;
  readonly family: EvaluatorProviderFamilyRow;
  readonly deployment: {
    readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  };
  readonly provider: ProviderGateway;
  readonly bound: CallBound;
  readonly provenanceRef: string;
}): Promise<EvaluatorQuestionTagResult> {
  return runPersistedQuestionTag({ ...input, basis: "TAGGER" });
}

export async function runEvaluatorTagReconciliation(input: {
  readonly pool: Pool;
  readonly runId: string;
  readonly family: EvaluatorProviderFamilyRow;
  readonly deployment: {
    readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  };
  readonly provider: ProviderGateway;
  readonly bound: CallBound;
  readonly provenanceRef: string;
}): Promise<EvaluatorQuestionTagResult> {
  return runPersistedQuestionTag({ ...input, basis: "BACKFILL" });
}

export interface EvaluatorTerminalHarvestWorkerResult {
  readonly metering: EvaluatorMeteringReconciliationResult;
  readonly harvest: EvaluatorHarvestResult;
}

export async function runEvaluatorTerminalHarvest(input: {
  readonly pool: Pool;
  readonly runId: string;
  readonly meteringWindow: RelativeCostDerivationWindow;
  readonly observedAt?: Date;
}): Promise<EvaluatorTerminalHarvestWorkerResult> {
  const metering = await reconcileMeteringBestEffort(input.pool, input.meteringWindow);
  const harvest = await new EvaluatorHarvestRepository(input.pool)
    .harvestTerminalRun(input.runId, input.observedAt);
  return Object.freeze({ metering, harvest });
}

export async function reconcileEvaluatorTerminalRuns(input: {
  readonly pool: Pool;
  readonly meteringWindow: RelativeCostDerivationWindow;
  readonly observedAt?: Date;
  readonly limit?: number;
}): Promise<readonly (
  | EvaluatorHarvestResult
  | { readonly state: "FAILED"; readonly runId: string; readonly reason: "TERMINAL_HARVEST_FAILED" }
)[]> {
  await reconcileMeteringBestEffort(input.pool, input.meteringWindow);
  const limit = input.limit ?? 100;
  if (!Number.isInteger(limit) || limit <= 0) throw new TypeError("EVALUATOR_HARVEST_LIMIT_INVALID");
  const terminal = await input.pool.query<{ run_id: string }>(`
    SELECT DISTINCT event.run_id
    FROM core.run_progress_event AS event
    WHERE event.kind='TERMINAL'
      AND (
        NOT EXISTS (
          SELECT 1 FROM evaluator.pipeline_event AS harvest
          WHERE harvest.run_id=event.run_id AND harvest.pipeline='HARVEST'
            AND harvest.pipeline_version=$1 AND harvest.state='SUCCEEDED'
        )
        OR EXISTS (
          SELECT 1 FROM scorecard.answer_outcome AS outcome
          WHERE outcome.run_id=event.run_id AND outcome.accepted
            AND NOT EXISTS (
              SELECT 1 FROM evaluator.observation AS observation
              WHERE observation.answer_outcome_id=outcome.answer_outcome_id
            )
        )
      )
      AND (
        SELECT count(*)
        FROM evaluator.pipeline_event AS failed
        WHERE failed.run_id=event.run_id AND failed.pipeline='HARVEST'
          AND failed.pipeline_version=$1 AND failed.state='FAILED'
          AND failed.at_seq > COALESCE((
            SELECT max(completed.at_seq)
            FROM evaluator.pipeline_event AS completed
            WHERE completed.run_id=event.run_id AND completed.pipeline='HARVEST'
              AND completed.pipeline_version=$1 AND completed.state IN ('SUCCEEDED','SKIPPED')
          ), 0)
      ) < $3
    ORDER BY event.run_id
    LIMIT $2
  `, [HARVEST_PIPELINE_VERSION, limit, HARVEST_MAX_CONSECUTIVE_FAILURES]);
  const repository = new EvaluatorHarvestRepository(input.pool);
  const results: (
    | EvaluatorHarvestResult
    | { readonly state: "FAILED"; readonly runId: string; readonly reason: "TERMINAL_HARVEST_FAILED" }
  )[] = [];
  for (const row of terminal.rows) {
    try {
      results.push(await repository.harvestTerminalRun(row.run_id, input.observedAt));
    } catch {
      results.push(Object.freeze({
        state: "FAILED" as const,
        runId: row.run_id,
        reason: "TERMINAL_HARVEST_FAILED" as const
      }));
    }
  }
  return Object.freeze(results);
}

async function reconcileMeteringBestEffort(
  pool: Pool,
  window: RelativeCostDerivationWindow
): Promise<EvaluatorMeteringReconciliationResult> {
  try {
    return await reconcileEvaluatorMetering(pool, window);
  } catch {
    return Object.freeze({
      callsProjected: 0,
      callsFailed: 0,
      relativeCostCellsDerived: 0,
      failureReason: "METERING_RECONCILIATION_FAILED" as const
    });
  }
}

async function runPersistedQuestionTag(input: {
  readonly pool: Pool;
  readonly runId: string;
  readonly family: EvaluatorProviderFamilyRow;
  readonly deployment: {
    readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  };
  readonly provider: ProviderGateway;
  readonly bound: CallBound;
  readonly provenanceRef: string;
  readonly basis: "TAGGER" | "BACKFILL";
}): Promise<EvaluatorQuestionTagResult> {
  const run = await input.pool.query<{ question_line: string }>(
    "SELECT question_line FROM core.run WHERE run_id=$1",
    [input.runId]
  );
  const rawQuestion = run.rows[0]?.question_line;
  if (rawQuestion === undefined) {
    return Object.freeze({ state: "UNTAGGED", reason: "TAGGER_RUN_UNRESOLVED" });
  }
  return runEvaluatorQuestionTagger({
    runId: input.runId,
    rawQuestion,
    family: input.family,
    deployment: input.deployment,
    provider: input.provider,
    repository: new DomainRegistryRepository(input.pool),
    bound: input.bound,
    basis: input.basis,
    provenanceRef: input.provenanceRef
  });
}
