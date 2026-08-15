import type { Pool } from "pg";
import type { CallBound, ProviderGateway } from "@debateai/providers";
import {
  assertEvaluatorProviderIsolation,
  DomainRegistryRepository,
  EvaluatorCatalogRepository,
  probeEvaluatorVllmCatalog,
  runEvaluatorQuestionTagger,
  type EvaluatorQuestionTagResult,
  type EvaluatorProviderFamilyRow
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
  if (rawQuestion === undefined) throw new TypeError(`EVALUATOR_TAG_RUN_UNRESOLVED:${input.runId}`);
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
