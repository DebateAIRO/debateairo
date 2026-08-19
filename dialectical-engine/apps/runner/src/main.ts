import { Hatchet } from "@hatchet-dev/typescript-sdk";
import { loadKek } from "../../../packages/crypto/src/index.js";
import { createPool } from "@debateai/db";
import { WorkItemRepository } from "@debateai/battery";
import {
  loadBootstrapRegister,
  loadRunnerEnvironment,
  readClaimTypeCompositionMap
} from "@debateai/register";
import { createPostgresProviderGateway, declareHatchetWalkingSkeletonTask, WalkingSkeletonRunner } from "./index.js";

const environment = loadRunnerEnvironment();
loadKek(environment.KEK_PATH);
const pool = createPool(environment.DATABASE_URL);
const bootstrap = await loadBootstrapRegister();
// DR-128: the canonical row is attached to the judgement path; absence blocks loudly before claim.
const compositionRow = await readClaimTypeCompositionMap(pool, bootstrap.registerVersion);
const hatchet = new Hatchet({
  token: environment.HATCHET_CLIENT_TOKEN, host_port: environment.HATCHET_HOST_PORT,
  api_url: environment.HATCHET_API_URL, tenant_id: environment.HATCHET_TENANT_ID,
  tls_config: { tls_strategy: environment.HATCHET_TLS_STRATEGY }
});
const provider = createPostgresProviderGateway(pool, {
  endpoint: environment.VLLM_BASE_URL, model: environment.VLLM_MODEL, maker: environment.VLLM_MAKER,
  ...(environment.VLLM_AUTHORIZATION === undefined ? {} : { authorizationHeader: environment.VLLM_AUTHORIZATION })
});
const runner = new WalkingSkeletonRunner(pool, provider, {
  workerId: environment.RUNNER_WORKER_ID, claimMs: environment.CLAIM_MS, claimMarginMs: environment.CLAIM_MARGIN_MS,
  judgeBound: { maxAttempts: environment.JUDGE_MAX_ATTEMPTS, tokenCeiling: environment.JUDGE_TOKEN_CEILING, deadlineMs: environment.JUDGE_DEADLINE_MS },
  composerBound: { maxAttempts: environment.COMPOSER_MAX_ATTEMPTS, tokenCeiling: environment.COMPOSER_TOKEN_CEILING, deadlineMs: environment.COMPOSER_DEADLINE_MS },
  conformanceBound: { maxAttempts: environment.CONFORMANCE_MAX_ATTEMPTS, tokenCeiling: environment.CONFORMANCE_TOKEN_CEILING, deadlineMs: environment.CONFORMANCE_DEADLINE_MS },
  providerRef: environment.PROVIDER_REF, maker: environment.VLLM_MAKER,
  judgeContractHash: environment.JUDGE_CONTRACT_HASH,
  composerContractHash: environment.COMPOSER_CONTRACT_HASH, conformanceContractHash: environment.CONFORMANCE_CONTRACT_HASH,
  propagationContractHash: environment.PROPAGATION_CONTRACT_HASH, serveContractHash: environment.SERVE_CONTRACT_HASH,
  maxRecompose: environment.MAX_RECOMPOSE, factBundleVersion: environment.FACT_BUNDLE_VERSION,
  judgementNumberKind: environment.JUDGEMENT_NUMBER_KIND, judgementProducer: environment.JUDGEMENT_PRODUCER,
  propagationNumberKind: environment.PROPAGATION_NUMBER_KIND,
  propagationProducer: environment.PROPAGATION_PRODUCER,
  compositionRow
});
const task = declareHatchetWalkingSkeletonTask({ client: hatchet, runner,
  failures: new WorkItemRepository(pool),
  workflowName: environment.HATCHET_WORKFLOW_NAME, engineRetries: environment.HATCHET_ENGINE_RETRIES });
const worker = await hatchet.worker(environment.HATCHET_WORKER_NAME);
await worker.registerWorkflows([task]);
await worker.start();
