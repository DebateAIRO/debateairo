import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { Pool } from "pg";
import { buildApi, PostgresAskApplication, type Dispatcher } from "@debateai/api";
import {
  createTerminalActivationEvaluator,
  WorkItemRepository,
  type TerminalCompletionDeclaration
} from "@debateai/battery";
import { readDeploymentMakerCapability } from "@debateai/critique";
import type { CompletionActivationResolution } from "@debateai/db";
import { TypedDomainError, type RiskTier } from "@debateai/kernel";
import { resolveEffectiveRiskTier, resolveRunCostEnvelopeBasis } from "@debateai/register";
import {
  createPostgresProviderGateway,
  WalkingSkeletonRunner,
  type RunnerExecutionResult
} from "@debateai/runner";
import { startClaudeRelay } from "./claude-relay.js";
import { ACCEPTANCE_REGISTER_SOURCE_REF, ACCEPTANCE_REGISTER_VERSION } from "./seed-register.js";
import { readAcceptanceRuntimePolicy, readOptionalScoringOperator } from "./runtime-policy.js";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  API_HOST: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().max(65_535),
  STRANGER_SAMPLE_RATE: z.coerce.number().min(0).max(1),
  BATTERY_VERSION: z.string().min(1),
  SETTLEMENT_WATCH_HANDLE: z.string().min(1),
  MODEL_BASE_URL: z.string().url()
}).strict();

const ceremonyEnvironmentSchema = z.object({
  ACCEPTANCE_DB_PORT: z.coerce.number().int().positive().max(65_535),
  ACCEPTANCE_API_HOST: z.string().min(1),
  ACCEPTANCE_API_PORT: z.coerce.number().int().positive().max(65_535),
  ACCEPTANCE_SHIM_PORT: z.coerce.number().int().positive().max(65_535),
  ACCEPTANCE_STRANGER_SAMPLE_RATE: z.coerce.number().min(0).max(1),
  ACCEPTANCE_BATTERY_VERSION: z.string().min(1),
  ACCEPTANCE_SETTLEMENT_WATCH_HANDLE: z.string().min(1)
}).strict();

export type AcceptanceEnvironment = z.infer<typeof environmentSchema>;
export type AcceptanceCeremonyEnvironment = z.infer<typeof ceremonyEnvironmentSchema>;

const environmentKeys = Object.keys(environmentSchema.shape);

export function loadAcceptanceEnvironment(source: NodeJS.ProcessEnv = process.env): AcceptanceEnvironment {
  return environmentSchema.parse(Object.fromEntries(environmentKeys.map((key) => [key, source[key]])));
}

export function loadAcceptanceCeremonyEnvironment(
  source: NodeJS.ProcessEnv = process.env
): AcceptanceCeremonyEnvironment {
  const keys = Object.keys(ceremonyEnvironmentSchema.shape);
  return ceremonyEnvironmentSchema.parse(Object.fromEntries(keys.map((key) => [key, source[key]])));
}

export interface AcceptanceWorkExecutor {
  executeWorkItem(workItemId: string): Promise<RunnerExecutionResult>;
}

export interface AcceptanceFailureRecorder {
  recordTerminalFailure(input: {
    readonly runId: string;
    readonly workItemId: string;
    readonly reason: string;
  }): Promise<boolean>;
}

function acceptanceFailureReason(error: unknown): string {
  return error instanceof TypedDomainError
    ? `ACCEPTANCE_EXECUTION_FAILED:${error.code}`
    : "ACCEPTANCE_EXECUTION_FAILED:UNEXPECTED_ERROR";
}

export class AcceptanceDispatcher implements Dispatcher {
  constructor(
    private readonly runner: AcceptanceWorkExecutor,
    private readonly failures: AcceptanceFailureRecorder
  ) {}

  async dispatch(input: { readonly runId: string; readonly workItemId: string }): Promise<void> {
    // The acceptance API keeps the same non-blocking 202 contract as Hatchet's
    // runNoWait adapter. The database queue remains the source of record (P11).
    setImmediate(() => {
      void this.runner.executeWorkItem(input.workItemId).catch(async (error: unknown) => {
        const recorded = await this.failures.recordTerminalFailure({
          ...input,
          reason: acceptanceFailureReason(error)
        });
        if (!recorded) {
          process.stderr.write("ACCEPTANCE_FAILURE_STATE_NOT_RECORDED\n");
        }
      }).catch(() => {
          process.stderr.write("ACCEPTANCE_FAILURE_STATE_PERSIST_FAILED\n");
      });
    });
  }
}

export interface AcceptanceRuntime {
  readonly api: ReturnType<typeof buildApi>;
  readonly runner: WalkingSkeletonRunner;
}

/**
 * FAIR-01 (DR-140(b)): the SECOND real maker's relay endpoint — live, the
 * FAIR-02 claude CLI relay after its startup handshake (the model id is the
 * one the CLI itself reported, DR-143(2)). The acceptance runtime REQUIRES
 * it: DR-143 clause 1 makes the more-than-one-maker requirement run-level
 * fair-debate law, enforced on the acceptance debate at this composition root.
 */
export interface AcceptanceCriticRelay {
  readonly baseUrl: string;
  readonly model: string;
}

/**
 * The DR-135 refusing evaluator — the OUTERMOST fallback (DR-139 ruling 2).
 * The live acceptance path now wires the real DR-139 terminal evaluator
 * (createTerminalActivationEvaluator); this function resolves NOTHING and
 * stays available for any wiring that must fail closed instead.
 */
export async function resolveAcceptanceTerminalActivations(input: {
  readonly runId: string;
  readonly waitingRows: readonly string[];
  readonly completion?: TerminalCompletionDeclaration;
}): Promise<readonly CompletionActivationResolution[]> {
  if (input.waitingRows.length > 0) {
    throw new TypedDomainError(
      "ACCEPTANCE_TERMINAL_WAIT_ROWS_UNRESOLVED",
      `DR-135 refusing evaluator: run ${input.runId} retains terminal WAIT rows ${input.waitingRows.join(",")}`
    );
  }
  return Object.freeze([]);
}

export function resolveAcceptanceRisk(
  askerRiskTier: RiskTier,
  askerProvenanceRef: string,
  deploymentRiskTier: RiskTier
): ReturnType<typeof resolveEffectiveRiskTier> {
  return resolveEffectiveRiskTier({
    askerTier: askerRiskTier,
    askerProvenanceRef,
    policyLevels: {
      parent: {},
      run: {},
      deployment: { riskTier: deploymentRiskTier }
    }
  });
}

export async function createAcceptanceRuntime(input: {
  readonly pool: Pool;
  readonly environment: AcceptanceEnvironment;
  readonly criticRelay: AcceptanceCriticRelay;
  readonly testOnlyTerminalEvaluator?: (input: {
    readonly runId: string;
    readonly waitingRows: readonly string[];
    readonly completion: TerminalCompletionDeclaration;
  }) => Promise<readonly CompletionActivationResolution[]>;
}): Promise<AcceptanceRuntime> {
  if (input.testOnlyTerminalEvaluator !== undefined && process.env.NODE_ENV !== "test") {
    throw new Error("TEST_ONLY_TERMINAL_EVALUATOR_FORBIDDEN");
  }
  const policy = await readAcceptanceRuntimePolicy(input.pool);
  const scoringOperator = await readOptionalScoringOperator(input.pool);
  await readDeploymentMakerCapability(input.pool, ACCEPTANCE_REGISTER_VERSION);
  // The walking-skeleton judge/composer/conformance chain stays on the OpenAI
  // (codex) provider; FAIR-01 (DR-140(b)) adds the Anthropic relay as the
  // debate's SECOND maker — it runs the critic leg, so the counter-position
  // in the answer graph is genuinely independent of the position's maker.
  const provider = createPostgresProviderGateway(input.pool, {
    endpoint: input.environment.MODEL_BASE_URL,
    model: "gpt-5.6-sol",
    maker: policy.providers.openai.maker
  });
  const criticProvider = createPostgresProviderGateway(input.pool, {
    endpoint: `${input.criticRelay.baseUrl}/v1`,
    // DR-115/DR-143(2): the model id is the relay's honestly-reported one.
    model: input.criticRelay.model,
    maker: policy.providers.anthropic.maker
  });
  const longestDeadline = Math.max(
    policy.bounds.JUDGE.deadlineMs,
    policy.bounds.COMPOSER.deadlineMs,
    policy.bounds.CONFORMANCE.deadlineMs
  );
  const maximumRunAttempts = Math.max(
    ...policy.runCostEnvelopePolicy.value.members.map((member) => member.max_model_attempts)
  );
  const runner = new WalkingSkeletonRunner(input.pool, provider, {
    workerId: "acceptance:walking-skeleton",
    claimMs: longestDeadline * maximumRunAttempts,
    claimMarginMs: 0,
    judgeBound: policy.bounds.JUDGE,
    composerBound: policy.bounds.COMPOSER,
    conformanceBound: policy.bounds.CONFORMANCE,
    providerRef: policy.providers.openai.providerRef,
    maker: policy.providers.openai.maker,
    judgeContractHash: policy.hashes.judge,
    composerContractHash: policy.hashes.composer,
    conformanceContractHash: policy.hashes.conformance,
    propagationContractHash: policy.hashes.propagation,
    serveContractHash: policy.hashes.serve,
    maxRecompose: 2,
    factBundleVersion: ACCEPTANCE_REGISTER_VERSION,
    judgementNumberKind: "base-probability",
    judgementProducer: "judgement:acceptance",
    propagationNumberKind: "propagated-probability",
    propagationProducer: "propagation:acceptance",
    compositionRow: policy.compositionRow,
    servePolicy: {
      compositionBudgets: policy.compositionBudgets,
      candidateConfidenceBand: "FULL",
      bandCeiling: policy.bandCeiling
    },
    judgementPolicy: {
      selectionRule: {
        kind: "MAXIMIZE_WEIGHTED_TAU",
        rowKey: "claimTypeCompositionMap",
        registerVersion: ACCEPTANCE_REGISTER_VERSION,
        sourceRef: ACCEPTANCE_REGISTER_SOURCE_REF
      },
      earnedWeight: 1,
      judgeWeightVersion: "acceptance:single-judge:v1",
      reducerVersion: "acceptance:DR-133:v1"
    },
    // FAIR-01 (DR-140(b)): the critique leg — the second maker judges the
    // counter-position; its maker rides every persisted artifact via the
    // gateway lineage (one maker per artifact, from the RULED provider set).
    critique: {
      provider: criticProvider,
      providerRef: policy.providers.anthropic.providerRef,
      maker: policy.providers.anthropic.maker
    },
    // DR-074: the raw deployment row when V has ruled it; absent ⇒ the runner
    // stops loudly before any claim or model call (AC-76 — never invented).
    ...(scoringOperator === undefined ? {} : { scoringOperator }),
    // TERM-01 (DR-139): the REAL recorded-facts terminal evaluator replaces
    // the DR-135 refusing evaluator on the live path. The refusing evaluator
    // (resolveAcceptanceTerminalActivations) remains the outermost fallback.
    resolveTerminalActivations: input.testOnlyTerminalEvaluator ?? createTerminalActivationEvaluator(input.pool)
  });
  const dispatcher = new AcceptanceDispatcher(runner, new WorkItemRepository(input.pool));
  const application = new PostgresAskApplication(input.pool, dispatcher, {
    strangerSampleRate: input.environment.STRANGER_SAMPLE_RATE,
    registerVersion: ACCEPTANCE_REGISTER_VERSION,
    batteryVersion: input.environment.BATTERY_VERSION,
    settlementWatchHandle: input.environment.SETTLEMENT_WATCH_HANDLE,
    resolveDeploymentMakerAvailability: () => readDeploymentMakerCapability(
      input.pool,
      ACCEPTANCE_REGISTER_VERSION
    ),
    resolveEnvelopeBasis: async (basis) => resolveRunCostEnvelopeBasis(
      policy.runCostEnvelopePolicy,
      basis
    ),
    resolveRisk: (askerRiskTier, askerProvenanceRef) => resolveAcceptanceRisk(
      askerRiskTier,
      askerProvenanceRef,
      policy.riskTier
    )
  });
  return Object.freeze({ api: buildApi({ application }), runner });
}

async function main(): Promise<void> {
  const environment = loadAcceptanceEnvironment();
  const { createPool } = await import("@debateai/db");
  const pool = createPool(environment.DATABASE_URL);
  // FAIR-01: the standalone boot starts the REAL Anthropic relay itself — the
  // startup handshake proves the claude CLI is alive and captures its honest
  // model id before the API accepts any ask (DR-143(3)).
  const policy = await readAcceptanceRuntimePolicy(pool);
  const relay = await startClaudeRelay({ port: 0, timeoutMs: policy.bounds.JUDGE.deadlineMs });
  const runtime = await createAcceptanceRuntime({
    pool,
    environment,
    criticRelay: { baseUrl: relay.baseUrl, model: relay.model }
  });
  await runtime.api.listen({ host: environment.API_HOST, port: environment.API_PORT });
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
