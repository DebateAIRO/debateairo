import "@debateai/obs-capture/install/runner";
import { Hatchet } from "@hatchet-dev/typescript-sdk";
import {
  ContentCipher,
  FileRunContentKeyStore,
  FileUserDekStore,
  loadKek
} from "@debateai/crypto";
import { configureContentEncryption, createPool, RunRepository } from "@debateai/db";
import { createTerminalActivationEvaluator, WorkItemRepository } from "@debateai/battery";
import { loadRunnerEnvironment } from "@debateai/register";
import { readDeploymentMakerCapability } from "@debateai/critique";
import { parseProviderDiscoveryTargets } from "@debateai/providers";
import { createPostgresProviderGateway, declareHatchetWalkingSkeletonTask, WalkingSkeletonRunner } from "./index.js";
import { createRunnerProviderTopology } from "./provider-topology.js";
import { readDevelopmentRunnerPolicy } from "./dev-runner-policy.js";
import { reconcileRunnerStartupWork } from "./runner-startup-reconciliation.js";

const environment = loadRunnerEnvironment();
const kek = loadKek(environment.KEK_PATH);
const pool = createPool(environment.DATABASE_URL);
if (environment.CONTENT_ENCRYPTION_ENABLED === "true") {
  const users = new FileUserDekStore(environment.USER_DEK_STORE_PATH!, kek);
  configureContentEncryption(pool, new ContentCipher(
    new FileRunContentKeyStore(
      environment.USER_DEK_STORE_PATH!,
      users,
      async (ownerRef) => {
        const resolved = await pool.query<{ user_id: string }>(
          `SELECT user_id FROM identity."user"
           WHERE owner_ref=$1 AND state='active'`,
          [ownerRef]
        );
        const userId = resolved.rows[0]?.user_id;
        if (userId === undefined) throw new TypeError("OWNER_REF_UNRESOLVED");
        return userId;
      }
    )
  ));
}
const policy = await readDevelopmentRunnerPolicy(pool, environment.REGISTER_VERSION);
const deploymentMakers = await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);
if (environment.PROVIDER_DISCOVERY_TARGETS_JSON === undefined) {
  throw new TypeError("PROVIDER_DISCOVERY_TARGETS_REQUIRED");
}
const providerTargets = parseProviderDiscoveryTargets(
  environment.PROVIDER_DISCOVERY_TARGETS_JSON,
  deploymentMakers.configuredProviders
);
const hatchet = new Hatchet({
  token: environment.HATCHET_CLIENT_TOKEN, host_port: environment.HATCHET_HOST_PORT,
  api_url: environment.HATCHET_API_URL, tenant_id: environment.HATCHET_TENANT_ID,
  tls_config: { tls_strategy: environment.HATCHET_TLS_STRATEGY }
});
const providerTopology = createRunnerProviderTopology(providerTargets, (target) =>
  createPostgresProviderGateway(pool, {
    endpoint: target.baseUrl,
    model: target.model,
    maker: target.maker,
    ...(target.authorizationHeader === undefined
      ? {} : { authorizationHeader: target.authorizationHeader })
  })
);
const runRepository = new RunRepository(pool);
if (providerTopology.primary.providerRef !== environment.PROVIDER_REF
  || providerTopology.primary.maker !== environment.VLLM_MAKER
  || providerTargets[0]?.baseUrl !== environment.VLLM_BASE_URL.replace(/\/$/u, "")
  || providerTargets[0]?.model !== environment.VLLM_MODEL
  || providerTargets[0]?.authorizationHeader !== environment.VLLM_AUTHORIZATION) {
  throw new TypeError("RUNNER_PRIMARY_PROVIDER_CONFIGURATION_DRIFT");
}
const runner = new WalkingSkeletonRunner(pool, providerTopology.primary.provider, {
  workerId: environment.RUNNER_WORKER_ID, claimMs: environment.CLAIM_MS, claimMarginMs: environment.CLAIM_MARGIN_MS,
  judgeBound: policy.bounds.JUDGE,
  composerBound: policy.bounds.COMPOSER,
  conformanceBound: policy.bounds.CONFORMANCE,
  providerRef: providerTopology.primary.providerRef, maker: providerTopology.primary.maker,
  ...(providerTopology.critique === undefined
    ? {} : { critique: providerTopology.critique }),
  additionalMakers: providerTopology.additionalMakers,
  judgeContractHash: policy.hashes.judge,
  composerContractHash: policy.hashes.composer,
  conformanceContractHash: policy.hashes.conformance,
  propagationContractHash: policy.hashes.propagation,
  serveContractHash: policy.hashes.serve,
  maxRecompose: environment.MAX_RECOMPOSE, factBundleVersion: environment.REGISTER_VERSION,
  judgementNumberKind: environment.JUDGEMENT_NUMBER_KIND, judgementProducer: environment.JUDGEMENT_PRODUCER,
  propagationNumberKind: environment.PROPAGATION_NUMBER_KIND,
  propagationProducer: environment.PROPAGATION_PRODUCER,
  resolveTerminalActivations: createTerminalActivationEvaluator(pool),
  compositionRow: policy.compositionRow,
  servePolicy: {
    compositionBudgets: policy.compositionBudgets,
    candidateConfidenceBand: policy.candidateConfidenceBand,
    bandCeiling: policy.bandCeiling
  },
  judgementPolicy: policy.judgementPolicy,
  scoringOperator: policy.scoringOperator,
  runDeathPolicy: policy.runDeathPolicy,
  hiddenNodeScoreThreshold: policy.hiddenNodeScoreThreshold,
  holdRecorder: {
    countCooldownHolds: (runId) => runRepository.countCooldownHolds(runId),
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
  }
});
const task = declareHatchetWalkingSkeletonTask({ client: hatchet, runner,
  failures: new WorkItemRepository(pool),
  workflowName: environment.HATCHET_WORKFLOW_NAME, engineRetries: environment.HATCHET_ENGINE_RETRIES });
const worker = await hatchet.worker(environment.HATCHET_WORKER_NAME);
await worker.registerWorkflows([task]);
const started = worker.start();
await worker.waitUntilReady(30_000);
const startupReconciliation = await reconcileRunnerStartupWork({
  work: new WorkItemRepository(pool),
  dispatcher: {
    dispatch: async ({ runId, workItemId }) => {
      await hatchet.runNoWait(environment.HATCHET_WORKFLOW_NAME, { runId, workItemId }, {
        additionalMetadata: {
          v3RunId: runId,
          v3WorkItemId: workItemId,
          sourceOfRecord: "core.work_item",
          dispatchSource: "runner-startup-reconciliation"
        }
      });
    }
  }
});
if (process.send !== undefined) {
  process.send(Object.freeze({
    kind: "DEBATEAI_RUNNER_READY",
    worker: environment.HATCHET_WORKER_NAME,
    registerVersion: environment.REGISTER_VERSION,
    startupDispatched: startupReconciliation.dispatched
  }));
}
await started;
