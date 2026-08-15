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
  const metering = await reconcileEvaluatorMetering(input.pool, input.meteringWindow);
  const harvest = await new EvaluatorHarvestRepository(input.pool)
    .harvestTerminalRun(input.runId, input.observedAt);
  return Object.freeze({ metering, harvest });
}

export async function reconcileEvaluatorTerminalRuns(input: {
  readonly pool: Pool;
  readonly meteringWindow: RelativeCostDerivationWindow;
  readonly observedAt?: Date;
}): Promise<readonly EvaluatorHarvestResult[]> {
  await reconcileEvaluatorMetering(input.pool, input.meteringWindow);
  const terminal = await input.pool.query<{ run_id: string }>(`
    SELECT DISTINCT event.run_id
    FROM core.run_progress_event AS event
    WHERE event.kind='TERMINAL'
      AND NOT EXISTS (
        SELECT 1 FROM evaluator.pipeline_event AS harvest
        WHERE harvest.run_id=event.run_id AND harvest.pipeline='HARVEST'
          AND harvest.pipeline_version=$1 AND harvest.state='SUCCEEDED'
      )
    ORDER BY event.run_id
  `, [HARVEST_PIPELINE_VERSION]);
  const repository = new EvaluatorHarvestRepository(input.pool);
  const results: EvaluatorHarvestResult[] = [];
  for (const row of terminal.rows) {
    results.push(await repository.harvestTerminalRun(row.run_id, input.observedAt));
  }
  return Object.freeze(results);
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
