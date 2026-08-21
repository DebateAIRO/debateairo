import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { RunRepository } from "@debateai/db";
import { Judge } from "@debateai/judgement";
import { TypedDomainError } from "@debateai/kernel";
import {
  createPostgresProviderGateway,
  createPostgresReviewCatchUpDependencies,
  runReviewCatchUp
} from "@debateai/runner";
import { ServeRepository } from "@debateai/serve";
import { probeRelay } from "./discovery.js";
import { readAcceptanceRuntimePolicy, readOptionalScoringOperator } from "./runtime-policy.js";
import { ACCEPTANCE_REGISTER_SOURCE_REF, ACCEPTANCE_REGISTER_VERSION } from "./seed-register.js";

function valuesAfter(flag: string): string[] {
  return process.argv.flatMap((value, index, all) => all[index - 1] === flag ? [value] : []);
}

function requiredOne(flag: string): string {
  const values = valuesAfter(flag);
  if (values.length !== 1 || values[0]!.trim() === "") throw new Error(`USAGE_REQUIRED:${flag}`);
  return values[0]!;
}

function relayMap(): ReadonlyMap<string, string> {
  return new Map(valuesAfter("--relay").map((entry) => {
    const split = entry.indexOf("=");
    if (split < 1 || split === entry.length - 1) throw new Error("USAGE_RELAY:providerRef=baseUrl");
    return [entry.slice(0, split), entry.slice(split + 1)] as const;
  }));
}

function relayRoot(value: string): string {
  const parsed = new URL(value);
  parsed.pathname = parsed.pathname.replace(/\/v1\/?$/, "");
  return parsed.toString().replace(/\/$/, "");
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) throw new Error("DATABASE_URL_REQUIRED");
  const runId = requiredOne("--run");
  const relays = relayMap();
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const [policy, scoringOperator, run, source] = await Promise.all([
      readAcceptanceRuntimePolicy(pool),
      readOptionalScoringOperator(pool),
      new RunRepository(pool).readFrozenHead(runId),
      new ServeRepository(pool).readReviewCatchUpSource(runId)
    ]);
    if (scoringOperator === undefined) throw new TypedDomainError("SCORING_OPERATOR_UNRESOLVED", runId);
    const reviewers = run.discoveredPanel.flatMap((member) => {
      const configuredUrl = relays.get(member.provider_ref);
      if (configuredUrl === undefined) return [];
      const baseUrl = relayRoot(configuredUrl);
      const gateway = createPostgresProviderGateway(pool, {
        endpoint: `${baseUrl}/v1`, model: member.model_id, maker: member.maker
      });
      return [{
        maker: member.maker,
        providerRef: member.provider_ref,
        judge: new Judge(gateway),
        probe: async () => {
          try {
            const observation = await probeRelay({
              providerRef: member.provider_ref,
              maker: member.maker,
              baseUrl,
              model: member.model_id
            });
            return observation.modelId === member.model_id;
          } catch {
            return false;
          }
        }
      }];
    });
    const dependencies = createPostgresReviewCatchUpDependencies({
      pool,
      reviewers,
      scoringOperator,
      propagationContractHash: policy.hashes.propagation,
      propagationNumberKind: "propagated-probability",
      propagationProducer: "propagation:acceptance:review-catch-up",
      judgementSelectionRule: {
        kind: "MAXIMIZE_WEIGHTED_TAU",
        rowKey: "claimTypeCompositionMap",
        registerVersion: ACCEPTANCE_REGISTER_VERSION,
        sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF
      },
      compositionBudget: policy.compositionBudgets[run.compositionBudgetTier]!
    });
    const runRepository = new RunRepository(pool);
    const report = await runReviewCatchUp({
      runId,
      answerId: source.answerId,
      fromVersion: source.answerVersion,
      workItemId: source.workItemId,
      questionLine: run.questionLine,
      invocationId: randomUUID(),
      pinnedPanel: run.discoveredPanel.map((member) => ({
        maker: member.maker, providerRef: member.provider_ref
      })),
      judgeBound: policy.bounds.JUDGE,
      judgeContractHash: policy.hashes.judge,
      runDeathPolicy: policy.runDeathPolicy,
      hold: {
        countCooldownHolds: (candidateRunId) => runRepository.countCooldownHolds(candidateRunId),
        record: (event) => runRepository.recordRunLifecycleEvent({
          runId: event.runId,
          kind: event.kind,
          value: {
            state: event.state,
            call_site_key: event.callSiteKey,
            parent_node_ref: event.parentNodeId,
            hold_ms: event.holdMs,
            hold_until: event.holdUntil,
            attempts_spent: event.attemptsSpent,
            transport_outcome: event.transportOutcome,
            planned_leg_count: event.plannedLegCount
          }
        }),
        wait: (cooldownMs) => new Promise((resolve) => setTimeout(resolve, cooldownMs))
      },
      dependencies
    });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  const report = error instanceof TypedDomainError
    ? { refusal: error.code, detail: error.message }
    : { refusal: "CATCH_UP_UNEXPECTED_FAILURE", detail: error instanceof Error ? error.message : String(error) };
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = 1;
});
