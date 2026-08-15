import type { Pool } from "pg";
import { createHash, randomUUID } from "node:crypto";
import type { CallBound, ProviderGateway } from "@debateai/providers";
import {
  assertEvaluatorProviderIsolation,
  DomainRegistryRepository,
  EvaluatorCatalogRepository,
  EvaluatorHarvestRepository,
  PostgresEvaluatorAddonRepository,
  PostgresEvaluatorConsumerRepository,
  HARVEST_MAX_CONSECUTIVE_FAILURES,
  HARVEST_PIPELINE_VERSION,
  probeEvaluatorVllmCatalog,
  readEvaluatorJudgeAddonPolicy,
  reconcileEvaluatorMetering,
  runEvaluatorJudgeAddon,
  runEvaluatorConsumerRefresh,
  runEvaluatorQuestionTagger,
  type EvaluatorJudgeAddonResult,
  type EvaluatorConsumerRefreshResult,
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
export { HARVEST_MAX_CONSECUTIVE_FAILURES } from "@debateai/evaluator";

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

interface EvaluatorConsumerWorkerInput {
  readonly pool: Pool;
  readonly family: EvaluatorProviderFamilyRow;
  readonly deployment: {
    readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  };
  readonly provider: ProviderGateway;
  readonly bound: CallBound;
  readonly observedAt?: Date;
}

export async function runOnDemandEvaluatorConsumerRefresh(
  input: EvaluatorConsumerWorkerInput
): Promise<EvaluatorConsumerRefreshResult> {
  return runEvaluatorConsumerRefresh({
    ...input,
    trigger: "ON_DEMAND",
    repository: new PostgresEvaluatorConsumerRepository(input.pool)
  });
}

export async function runPostAggregateEvaluatorConsumerRefresh(
  input: EvaluatorConsumerWorkerInput & { readonly aggregateAsOf: Date }
): Promise<EvaluatorConsumerRefreshResult> {
  return runEvaluatorConsumerRefresh({
    ...input,
    trigger: "POST_AGGREGATE",
    repository: new PostgresEvaluatorConsumerRepository(input.pool)
  });
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

export async function runEvaluatorJudgeGradingAddon(input: {
  readonly pool: Pool;
  readonly runId: string;
  readonly family: EvaluatorProviderFamilyRow;
  readonly deployment: {
    readonly configuredProviders: readonly { readonly providerRef: string; readonly maker: string }[];
  };
  readonly provider: ProviderGateway;
  readonly observedAt?: Date;
}): Promise<EvaluatorJudgeAddonResult> {
  if (input.runId.trim() === "") throw new TypeError("EVALUATOR_ADDON_RUN_ID_INVALID");
  if (input.observedAt !== undefined && !Number.isFinite(input.observedAt.getTime())) {
    throw new TypeError("EVALUATOR_ADDON_TIME_INVALID");
  }
  const run = await input.pool.query<{ register_version: string | number }>(
    "SELECT register_version FROM core.run WHERE run_id=$1",
    [input.runId]
  );
  if (run.rows[0] === undefined) throw new TypeError("EVALUATOR_ADDON_RUN_UNRESOLVED");
  const repository = new PostgresEvaluatorAddonRepository(input.pool);
  const registerVersion = Number(run.rows[0]?.register_version);
  const recordPreflightReceipt = async (state: "FAILED" | "SKIPPED", reason: string): Promise<void> => {
    const attemptId = randomUUID();
    const inputHash = createHash("sha256").update(JSON.stringify({
      run_id: input.runId,
      register_version: Number.isFinite(registerVersion) ? registerVersion : null,
      family_register_version: input.family.registerVersion,
      reason
    })).digest("hex");
    try {
      await repository.recordPipelineEvent({ runId: input.runId, attemptId, state, reason, inputHash });
    } catch {
      // The worker remains best effort; a receipt-store outage must not affect the product run.
    }
  };
  if (!Number.isInteger(registerVersion) || registerVersion < 1) {
    await recordPreflightReceipt("FAILED", "ADDON_PREFLIGHT_FAILED");
    return Object.freeze({ state: "FAILED", reason: "ADDON_PREFLIGHT_FAILED" });
  }
  if (input.family.registerVersion !== registerVersion) {
    await recordPreflightReceipt("SKIPPED", "ADDON_FAMILY_REGISTER_VERSION_MISMATCH");
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_FAMILY_REGISTER_VERSION_MISMATCH" });
  }
  let policy;
  try {
    policy = await readEvaluatorJudgeAddonPolicy(input.pool, registerVersion);
  } catch {
    await recordPreflightReceipt("SKIPPED", "ADDON_POLICY_INVALID");
    return Object.freeze({ state: "SKIPPED", reason: "ADDON_POLICY_INVALID" });
  }
  return runEvaluatorJudgeAddon({
    runId: input.runId,
    family: input.family,
    deployment: input.deployment,
    policy,
    provider: input.provider,
    repository,
    ...(input.observedAt === undefined ? {} : { observedAt: input.observedAt })
  });
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
