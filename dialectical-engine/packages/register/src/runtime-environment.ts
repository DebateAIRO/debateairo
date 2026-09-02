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

type EnvironmentSource = Readonly<Record<string, string | undefined>>;
const nodeEnvironment = z.enum(["development", "test", "production"]).optional();

export function parseMigrationEnvironment(source: EnvironmentSource) {
  return withProductionFloors(parseEnvironmentSource({ MIGRATION_DATABASE_URL: z.string().url(), NODE_ENV: nodeEnvironment }, source));
}

export function loadMigrationEnvironment() {
  return parseMigrationEnvironment(process.env);
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
    DEBATEAI_DEV_PROVIDER_TARGETS_JSON: z.string().min(1).optional()
  });
  return Object.freeze(Object.fromEntries(
    Object.entries(environment).filter((entry): entry is [string, string] => (
      typeof entry[1] === "string"
    ))
  ));
}

export function parseReplaySelfTestEnvironment(source: EnvironmentSource) {
  return withProductionFloors(parseEnvironmentSource({ REPLAY_SELF_TEST_DATABASE_URL: z.string().url(), NODE_ENV: nodeEnvironment }, source));
}

export function loadReplaySelfTestEnvironment() {
  return parseReplaySelfTestEnvironment(process.env);
}

export function parseLivenessEnvironment(source: EnvironmentSource) {
  return withProductionFloors(parseEnvironmentSource({ LIVENESS_DATABASE_URL: z.string().url(), NODE_ENV: nodeEnvironment }, source));
}

export function loadLivenessEnvironment() {
  return parseLivenessEnvironment(process.env);
}

export function parseSettlementEnvironment(source: EnvironmentSource) {
  return withProductionFloors(parseEnvironmentSource({ SETTLEMENT_DATABASE_URL: z.string().url(), NODE_ENV: nodeEnvironment }, source));
}

export function loadSettlementEnvironment() {
  return parseSettlementEnvironment(process.env);
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

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.has(host.toLowerCase());
}

/** Host of a `host:port` pair; bracketed and bare IPv6 literals keep their whole address. */
function hostOfHostPort(value: string): string {
  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    return close === -1 ? value : value.slice(0, close + 1);
  }
  return value.split(":").length === 2 ? value.replace(/:\d+$/u, "") : value;
}

/**
 * pg 8 / pg-connection-string 2.14 honour only the URL: `verify-full` checks chain + hostname,
 * a private CA needs `sslrootcert=`, `uselibpqcompat` downgrades `require` to unverified,
 * `no-verify` and `ssl=0` disable verification. Loopback and unix-socket hosts are exempt.
 */
function databaseUrlSatisfiesTlsFloor(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const parameters = parsed.searchParams;
  const hosts = parsed.hostname === "" ? (parameters.get("host") ?? "").split(",") : [parsed.hostname];
  if (hosts.every((host) => host === "" || host.startsWith("/") || isLoopbackHost(host))) return true;
  return parameters.get("sslmode") === "verify-full"
    && (parameters.get("sslrootcert") ?? "").trim() !== ""
    && !parameters.has("uselibpqcompat")
    && !["0", "false"].includes(parameters.get("ssl") ?? "");
}

/**
 * Fail-closed floors for `NODE_ENV === "production"` (R2; L5-F3, L5-F5, L4-F5, L1 q10).
 * Every `*_DATABASE_URL` off-box must pin verified TLS; content encryption must be on
 * wherever the shape carries the flag; cleartext Hatchet gRPC and a public API bind are refused.
 */
export function assertProductionFloors(environment: Readonly<Record<string, unknown>>): void {
  if (environment.NODE_ENV !== "production") return;
  for (const [key, value] of Object.entries(environment)) {
    if ((key === "DATABASE_URL" || key.endsWith("_DATABASE_URL"))
      && typeof value === "string" && !databaseUrlSatisfiesTlsFloor(value)) {
      throw new TypeError(`DATABASE_URL_TLS_REQUIRED:${key}`);
    }
  }
  if (environment.CONTENT_ENCRYPTION_ENABLED !== undefined
    && environment.CONTENT_ENCRYPTION_ENABLED !== "true") {
    throw new TypeError("CONTENT_ENCRYPTION_REQUIRED_IN_PRODUCTION");
  }
  if (environment.HATCHET_TLS_STRATEGY === "none") {
    const hatchetHost = typeof environment.HATCHET_HOST_PORT === "string"
      ? hostOfHostPort(environment.HATCHET_HOST_PORT)
      : "";
    if (!isLoopbackHost(hatchetHost)) throw new TypeError("HATCHET_TLS_REQUIRED");
  }
  if (typeof environment.API_HOST === "string" && !isLoopbackHost(environment.API_HOST)) {
    throw new TypeError("API_HOST_MUST_BE_LOOPBACK");
  }
}

function withProductionFloors<T extends Readonly<Record<string, unknown>>>(environment: T): T {
  assertProductionFloors(environment);
  return environment;
}

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
  assertProductionFloors(environment);
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
  return parseRunnerEnvironment(process.env);
}

export function parseRunnerEnvironment(source: EnvironmentSource) {
  const environment = parseEnvironmentSource({
    KEK_PATH: kekPath, DATABASE_URL: z.string().url(), RUNNER_WORKER_ID: z.string().min(1),
    REGISTER_VERSION: positiveInteger, NODE_ENV: nodeEnvironment,
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
  }, source);
  if (environment.CONTENT_BLIND_INDEX_KEY_PATH !== undefined) {
    throw new TypeError("CONTENT_BLIND_INDEX_V1_KEY_MUST_BE_RETIRED");
  }
  if (environment.CONTENT_ENCRYPTION_ENABLED === "true"
    && environment.USER_DEK_STORE_PATH === undefined) {
    throw new TypeError("CONTENT_ENCRYPTION_KEY_PATHS_REQUIRED");
  }
  assertProductionFloors(environment);
  return environment;
}
