import { z } from "zod";

function parseEnvironment<T extends z.ZodRawShape>(shape: T): z.infer<z.ZodObject<T>> {
  return z.object(shape).strict().parse(Object.fromEntries(
    Object.keys(shape).map((key) => [key, process.env[key]])
  ));
}

export function loadMigrationEnvironment() {
  return parseEnvironment({ MIGRATION_DATABASE_URL: z.string().url() });
}

export function loadReplaySelfTestEnvironment() {
  return parseEnvironment({ REPLAY_SELF_TEST_DATABASE_URL: z.string().url() });
}

export function loadLivenessEnvironment() {
  return parseEnvironment({ LIVENESS_DATABASE_URL: z.string().url() });
}

export function loadSettlementEnvironment() {
  return parseEnvironment({ SETTLEMENT_DATABASE_URL: z.string().url() });
}

const positiveInteger = z.coerce.number().int().positive();
const nonNegativeInteger = z.coerce.number().int().nonnegative();
const boundedRate = z.coerce.number().min(0).max(1);
const hatchetShape = {
  HATCHET_CLIENT_TOKEN: z.string().min(1), HATCHET_HOST_PORT: z.string().min(1),
  HATCHET_API_URL: z.string().url(), HATCHET_TENANT_ID: z.string().min(1),
  HATCHET_WORKFLOW_NAME: z.string().min(1), HATCHET_TLS_STRATEGY: z.enum(["tls", "mtls", "none"])
} as const;

export function loadApiEnvironment() {
  const environment = parseEnvironment({
    DATABASE_URL: z.string().url(), API_HOST: z.string().min(1), API_PORT: positiveInteger,
    STRANGER_SAMPLE_RATE: boundedRate, REGISTER_VERSION: positiveInteger,
    BATTERY_VERSION: z.string().min(1), SETTLEMENT_WATCH_HANDLE: z.string().min(1),
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    EVALUATOR_DEV_MENU_ENABLED: z.enum(["true", "false"]).default("false"),
    EVALUATOR_DEV_MENU_DATABASE_URL: z.string().url().optional(),
    ...hatchetShape
  });
  if (environment.EVALUATOR_DEV_MENU_ENABLED === "true"
    && environment.EVALUATOR_DEV_MENU_DATABASE_URL === undefined) {
    throw new TypeError("EVALUATOR_DEV_MENU_DATABASE_URL_REQUIRED");
  }
  if (environment.EVALUATOR_DEV_MENU_ENABLED === "true" && environment.NODE_ENV === "production") {
    throw new TypeError("EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN");
  }
  return environment;
}

export function loadRunnerEnvironment() {
  return parseEnvironment({
    DATABASE_URL: z.string().url(), RUNNER_WORKER_ID: z.string().min(1),
    CLAIM_MS: positiveInteger, CLAIM_MARGIN_MS: nonNegativeInteger,
    JUDGE_MAX_ATTEMPTS: positiveInteger, JUDGE_TOKEN_CEILING: positiveInteger, JUDGE_DEADLINE_MS: positiveInteger,
    COMPOSER_MAX_ATTEMPTS: positiveInteger, COMPOSER_TOKEN_CEILING: positiveInteger, COMPOSER_DEADLINE_MS: positiveInteger,
    CONFORMANCE_MAX_ATTEMPTS: positiveInteger, CONFORMANCE_TOKEN_CEILING: positiveInteger, CONFORMANCE_DEADLINE_MS: positiveInteger,
    PROVIDER_REF: z.string().min(1), JUDGE_CONTRACT_HASH: z.string().min(1),
    COMPOSER_CONTRACT_HASH: z.string().min(1), CONFORMANCE_CONTRACT_HASH: z.string().min(1),
    PROPAGATION_CONTRACT_HASH: z.string().min(1), SERVE_CONTRACT_HASH: z.string().min(1),
    MAX_RECOMPOSE: positiveInteger, FACT_BUNDLE_VERSION: positiveInteger,
    JUDGEMENT_NUMBER_KIND: z.string().min(1), JUDGEMENT_PRODUCER: z.string().min(1),
    PROPAGATION_NUMBER_KIND: z.string().min(1), PROPAGATION_PRODUCER: z.string().min(1),
    HATCHET_ENGINE_RETRIES: nonNegativeInteger, HATCHET_WORKER_NAME: z.string().min(1),
    VLLM_BASE_URL: z.string().url(), VLLM_MODEL: z.string().min(1), VLLM_MAKER: z.string().min(1),
    VLLM_AUTHORIZATION: z.string().min(1).optional(), ...hatchetShape
  });
}
