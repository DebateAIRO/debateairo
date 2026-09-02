import { z } from "zod";

function parseEnvironmentSource<T extends z.ZodRawShape>(
  shape: T,
  source: Readonly<Record<string, string | undefined>>
): z.infer<z.ZodObject<T>> {
  return z.object(shape).strict().parse(Object.fromEntries(
    Object.keys(shape).map((key) => [key, source[key]])
  ));
}

function parseEnvironment<T extends z.ZodRawShape>(shape: T): z.infer<z.ZodObject<T>> {
  return parseEnvironmentSource(shape, process.env);
}

export class RuntimeKekUnresolvedError extends TypeError {
  readonly code = "KEK_UNRESOLVED";

  constructor() {
    super("KEK_UNRESOLVED");
    this.name = "RuntimeKekUnresolvedError";
  }
}

const kekPath = z.preprocess((value) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new RuntimeKekUnresolvedError();
  }
  return value;
}, z.string().min(1));

export function loadMigrationEnvironment() {
  return parseEnvironment({ MIGRATION_DATABASE_URL: z.string().url() });
}

export function loadDevelopmentCommandEnvironment(): Readonly<Record<string, string>> {
  const environment = parseEnvironment({
    PATH: z.string().min(1).optional(),
    HOME: z.string().min(1).optional(),
    TMPDIR: z.string().min(1).optional(),
    DOCKER_CONFIG: z.string().min(1).optional(),
    XDG_CONFIG_HOME: z.string().min(1).optional(),
    PNPM_EXECUTABLE: z.string().min(1).optional(),
    DEBATEAI_DEV_DOCKER_BIN: z.string().min(1).optional(),
    DEBATEAI_DEV_PROVIDER_TARGETS_JSON: z.string().min(1).optional(),
    DEBATEAI_DEV_CUSTODY_ROOT: z.string().min(1).optional()
  });
  return Object.freeze(Object.fromEntries(
    Object.entries(environment).filter((entry): entry is [string, string] => (
      typeof entry[1] === "string"
    ))
  ));
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
export const ACCOUNT_ERASURE_GRACE_MS = 604_800_000 as const;
const hatchetShape = {
  HATCHET_CLIENT_TOKEN: z.string().min(1), HATCHET_HOST_PORT: z.string().min(1),
  HATCHET_API_URL: z.string().url(), HATCHET_TENANT_ID: z.string().min(1),
  HATCHET_WORKFLOW_NAME: z.string().min(1), HATCHET_TLS_STRATEGY: z.enum(["tls", "mtls", "none"])
} as const;

const apiEnvironmentShape = {
    KEK_PATH: kekPath,
    BLIND_INDEX_KEY_PATH: z.string().min(1),
    AUDIT_KEY_STORE_PATH: z.string().min(1),
    AUDIT_SOURCE_IP_SALT_PATH: z.string().min(1),
    USER_DEK_STORE_PATH: z.string().min(1),
    CONTENT_ENCRYPTION_ENABLED: z.enum(["true", "false"]).default("false"),
    CONTENT_BLIND_INDEX_KEY_PATH: z.string().min(1).optional(),
    CONTENT_PROVISION_DATABASE_URL: z.string().url(),
    PUBLICATION_ENABLED: z.enum(["true", "false"]).default("false"),
    CORPUS_KEK_PATH: z.string().min(1).optional(),
    PUBLICATION_KEY_STORE_PATH: z.string().min(1).optional(),
    AUTHORIZATION_DATABASE_URL: z.string().url().optional(),
    PUBLICATION_CLEANUP_DATABASE_URL: z.string().url().optional(),
    ERASURE_DATABASE_URL: z.string().url(),
    ACCOUNT_ERASURE_GRACE_MS: z.literal(String(ACCOUNT_ERASURE_GRACE_MS))
      .transform(() => ACCOUNT_ERASURE_GRACE_MS),
    MAIL_SENDMAIL_PATH: z.string().min(1),
    MAIL_FROM: z.string().regex(/^noreply@[A-Za-z0-9.-]+$/),
    PUBLIC_APP_URL: z.string().url().refine((value) => value.startsWith("https://")),
    DATABASE_URL: z.string().url(), API_HOST: z.string().min(1), API_PORT: positiveInteger,
    STRANGER_SAMPLE_RATE: boundedRate, REGISTER_VERSION: positiveInteger,
    BATTERY_VERSION: z.string().min(1), SETTLEMENT_WATCH_HANDLE: z.string().min(1),
    PROVIDER_DISCOVERY_TARGETS_JSON: z.string().min(1).optional(),
    PROVIDER_PROBE_TIMEOUT_MS: positiveInteger.default(5_000),
    NODE_ENV: z.enum(["development", "test", "production"]).optional(),
    EVALUATOR_DEV_MENU_ENABLED: z.enum(["true", "false"]).default("false"),
    EVALUATOR_DEV_MENU_DATABASE_URL: z.string().url().optional(),
    ...hatchetShape
} as const;

function validateApiEnvironment(
  environment: z.infer<z.ZodObject<typeof apiEnvironmentShape>>
) {
  if (environment.EVALUATOR_DEV_MENU_ENABLED === "true"
    && environment.EVALUATOR_DEV_MENU_DATABASE_URL === undefined) {
    throw new TypeError("EVALUATOR_DEV_MENU_DATABASE_URL_REQUIRED");
  }
  if (environment.EVALUATOR_DEV_MENU_ENABLED === "true" && environment.NODE_ENV !== "development") {
    throw new TypeError("EVALUATOR_DEV_MENU_PRODUCTION_FORBIDDEN");
  }
  if (environment.CONTENT_BLIND_INDEX_KEY_PATH !== undefined) {
    throw new TypeError("CONTENT_BLIND_INDEX_V1_KEY_MUST_BE_RETIRED");
  }
  if (environment.ERASURE_DATABASE_URL === environment.DATABASE_URL
    || environment.ERASURE_DATABASE_URL === environment.AUTHORIZATION_DATABASE_URL
    || environment.ERASURE_DATABASE_URL === environment.PUBLICATION_CLEANUP_DATABASE_URL
    || environment.ERASURE_DATABASE_URL === environment.CONTENT_PROVISION_DATABASE_URL
    || environment.ERASURE_DATABASE_URL === environment.EVALUATOR_DEV_MENU_DATABASE_URL) {
    throw new TypeError("ERASURE_DATABASE_URL_MUST_BE_SEPARATE");
  }
  if (environment.CONTENT_PROVISION_DATABASE_URL === environment.DATABASE_URL
      || environment.CONTENT_PROVISION_DATABASE_URL === environment.AUTHORIZATION_DATABASE_URL
      || environment.CONTENT_PROVISION_DATABASE_URL === environment.PUBLICATION_CLEANUP_DATABASE_URL) {
    throw new TypeError("CONTENT_PROVISION_DATABASE_URL_MUST_BE_SEPARATE");
  }
  if (environment.PUBLICATION_ENABLED === "true"
    && (environment.CORPUS_KEK_PATH === undefined
      || environment.PUBLICATION_KEY_STORE_PATH === undefined)) {
    throw new TypeError("PUBLICATION_KEY_PATHS_REQUIRED");
  }
  if (environment.PUBLICATION_ENABLED === "true"
    && environment.CONTENT_ENCRYPTION_ENABLED !== "true") {
    throw new TypeError("PUBLICATION_REQUIRES_CONTENT_ENCRYPTION");
  }
  if (environment.AUTHORIZATION_DATABASE_URL === undefined) {
    throw new TypeError("AUTHORIZATION_DATABASE_URL_REQUIRED");
  }
  if (environment.PUBLICATION_ENABLED === "true"
    && environment.PUBLICATION_CLEANUP_DATABASE_URL === undefined) {
    throw new TypeError("PUBLICATION_CLEANUP_DATABASE_URL_REQUIRED");
  }
  if (environment.PUBLICATION_ENABLED === "true"
    && (environment.PUBLICATION_CLEANUP_DATABASE_URL === environment.DATABASE_URL
      || environment.PUBLICATION_CLEANUP_DATABASE_URL === environment.AUTHORIZATION_DATABASE_URL)) {
    throw new TypeError("PUBLICATION_CLEANUP_DATABASE_URL_MUST_BE_SEPARATE");
  }
  if (environment.AUTHORIZATION_DATABASE_URL === environment.DATABASE_URL) {
    throw new TypeError("AUTHORIZATION_DATABASE_URL_MUST_BE_SEPARATE");
  }
  if (environment.PUBLICATION_ENABLED === "true"
    && (environment.CORPUS_KEK_PATH === environment.KEK_PATH
      || environment.PUBLICATION_KEY_STORE_PATH === environment.USER_DEK_STORE_PATH)) {
    throw new TypeError("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");
  }
  return environment;
}

export function parseApiEnvironment(
  source: Readonly<Record<string, string | undefined>>
) {
  return validateApiEnvironment(parseEnvironmentSource(apiEnvironmentShape, source));
}

export function loadApiEnvironment() {
  return validateApiEnvironment(parseEnvironment(apiEnvironmentShape));
}

export function loadRunnerEnvironment() {
  const environment = parseEnvironment({
    KEK_PATH: kekPath, DATABASE_URL: z.string().url(), RUNNER_WORKER_ID: z.string().min(1),
    REGISTER_VERSION: positiveInteger,
    CONTENT_ENCRYPTION_ENABLED: z.enum(["true", "false"]).default("false"),
    CONTENT_BLIND_INDEX_KEY_PATH: z.string().min(1).optional(),
    USER_DEK_STORE_PATH: z.string().min(1).optional(),
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
    VLLM_AUTHORIZATION: z.string().min(1).optional(),
    PROVIDER_DISCOVERY_TARGETS_JSON: z.string().min(1).optional(),
    ...hatchetShape
  });
  if (environment.CONTENT_BLIND_INDEX_KEY_PATH !== undefined) {
    throw new TypeError("CONTENT_BLIND_INDEX_V1_KEY_MUST_BE_RETIRED");
  }
  if (environment.CONTENT_ENCRYPTION_ENABLED === "true"
    && environment.USER_DEK_STORE_PATH === undefined) {
    throw new TypeError("CONTENT_ENCRYPTION_KEY_PATHS_REQUIRED");
  }
  return environment;
}
