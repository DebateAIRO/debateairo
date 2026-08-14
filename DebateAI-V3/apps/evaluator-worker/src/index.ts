import type { Pool } from "pg";
import {
  EvaluatorCatalogRepository,
  probeEvaluatorVllmCatalog,
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
  family: EvaluatorProviderFamilyRow
): Promise<{ readonly probeId: string; readonly state: "AVAILABLE" | "UNAVAILABLE" }> {
  const probe = await probeEvaluatorVllmCatalog(family);
  const probeId = await new EvaluatorCatalogRepository(pool).record(family, probe);
  return Object.freeze({ probeId, state: probe.state });
}
