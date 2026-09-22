import { z } from "zod";
import {
  parseRegisterVersionText,
  registerVersionToSafeLegacyNumber
} from "./register-publication.js";
import {
  COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW,
  costEnvelopePolicyFromValue
} from "./cost-envelope-policy.js";

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

/**
 * V-9(c), ruled 2026-09-22. The engine has TWO supported deployments and the
 * choice is configuration, never an inference from `NODE_ENV`:
 *
 * - `hosted` — the commercial website. Paid vendor APIs over `https:` only, one
 *   credential FILE per vendor, and the cost envelopes sealed before any work is
 *   claimed. The loopback relay path is refused here.
 * - `local` — anyone running this repository on their own computer, the owners
 *   before launch included: the command-line relays, loopback model servers and,
 *   optionally, the user's own API keys. This is a SUPPORTED product path, not
 *   development-only code, and its behaviour is byte-for-byte what this codebase
 *   did before the mode existed.
 */
export const DEPLOYMENT_MODES = Object.freeze(["hosted", "local"] as const);
export type DeploymentMode = typeof DEPLOYMENT_MODES[number];

/**
 * Production did not say which deployment it is. Deliberately NOT a default:
 * defaulting to `local` would silently permit relay targets on the hosted site,
 * and defaulting to `hosted` would break every operator's first boot with an
 * unrelated-looking provider refusal.
 */
export class DeploymentModeUnresolvedError extends TypeError {
  readonly code = "DEPLOYMENT_MODE_UNRESOLVED";

  constructor() {
    super("DEPLOYMENT_MODE_UNRESOLVED");
    this.name = "DeploymentModeUnresolvedError";
  }
}

/** A value that is not one of the two modes — a typo, in every environment. */
export class DeploymentModeInvalidError extends TypeError {
  readonly code = "DEPLOYMENT_MODE_INVALID";

  constructor() {
    super("DEPLOYMENT_MODE_INVALID");
    this.name = "DeploymentModeInvalidError";
  }
}

/**
 * `DEBATEAI_DEPLOYMENT_MODE` -> the mode. Absent outside production is `local`,
 * which is exactly what this codebase did before the setting existed; absent in
 * production refuses. Unknown refuses everywhere, untrimmed included: a stray
 * space in an `EnvironmentFile` must name itself rather than pick a deployment.
 */
export function resolveDeploymentMode(
  configured: string | undefined,
  nodeEnv: string | undefined
): DeploymentMode {
  if (configured === undefined || configured.trim() === "") {
    if (nodeEnv === "production") throw new DeploymentModeUnresolvedError();
    return "local";
  }
  const mode = DEPLOYMENT_MODES.find((candidate) => candidate === configured);
  if (mode === undefined) throw new DeploymentModeInvalidError();
  return mode;
}

export type SealedCostEnvelopeStatus = "SEALED" | "NOT_SEALED";

/**
 * TASK 11 SEAM (V-28) — A BUILD-INTEGRITY CHECK, AND THAT IS ALL IT IS.
 *
 * Review round 2, I3, was right about this and the honest thing is to say so
 * plainly rather than let the name carry a promise the code cannot keep. This is
 * the FIRST decision of both start-ups — before a pool exists, before a
 * credential file is opened — so the only thing it CAN read is the row this
 * build ships. That row is a frozen in-source constant, so with the shipped
 * source it always parses and `COST_ENVELOPES_NOT_SEALED` is unreachable at
 * runtime. What it does catch is a BUILD whose constant was removed, emptied or
 * edited into something invalid, which is a real failure mode and a cheap one to
 * close, and it keeps task 10's seam where task 10 put it.
 *
 * THE LIVE FAIL-CLOSED GATE IS ELSEWHERE, and it is the one that matters: a
 * hosted deployment reads the `costEnvelopePolicy` row IN FORCE at its own
 * register version through `readCostEnvelopePolicy`, which refuses
 * `COST_ENVELOPE_POLICY_UNRESOLVED` when that version never sealed one and
 * `COST_ENVELOPE_POLICY_INVALID` when it sealed something malformed. Both
 * shipped roots call it in hosted mode before any work is claimed or admitted.
 * A host pinned to an older `REGISTER_VERSION` is refused THERE, by name.
 *
 * Local mode is untouched by either: the relays and loopback model servers spend
 * nothing this control could bound.
 */
export function readSealedCostEnvelopeStatus(): SealedCostEnvelopeStatus {
  try {
    const policy = costEnvelopePolicyFromValue(
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.value,
      COST_ENVELOPE_POLICY_DEPLOYMENT_REGISTER_ROW.sourceRef
    );
    return policy.perRunCeilingMicros > 0 && policy.dailyCeilingMicros > 0
      ? "SEALED"
      : "NOT_SEALED";
  } catch {
    return "NOT_SEALED";
  }
}

export class CostEnvelopesNotSealedError extends TypeError {
  readonly code = "COST_ENVELOPES_NOT_SEALED";

  constructor() {
    super("COST_ENVELOPES_NOT_SEALED");
    this.name = "CostEnvelopesNotSealedError";
  }
}

/** The hosted-mode half of the start-up decision; `readStatus` is the task 11 seam. */
export function assertHostedCostEnvelopesSealed(
  mode: DeploymentMode,
  readStatus: () => SealedCostEnvelopeStatus = readSealedCostEnvelopeStatus
): void {
  if (mode !== "hosted") return;
  if (readStatus() !== "SEALED") throw new CostEnvelopesNotSealedError();
}

/**
 * TASK 11 AMENDMENT (from task 8's review). The support chat's three admission
 * budgets — `support_reads`, `support_sessions`, `support_model_calls` — are
 * OPTIONAL members of the `admissionPolicy` row, because DL1-F2 added them in a
 * superseding version and a host still serving the sealed three-scope row had to
 * keep booting. The consequence is fail-OPEN: a host pinned to an older
 * `REGISTER_VERSION` runs unmetered support reads and an unshared model cap, and
 * says nothing about it.
 *
 * In HOSTED mode that is a spend hole of the same family as an unsealed
 * envelope, so start-up refuses. LOCAL mode keeps today's fail-open behaviour:
 * there the support chat reaches a relay or a local model and the budgets bound
 * nothing that costs money.
 */
export class SupportAdmissionScopesNotSealedError extends TypeError {
  readonly code = "SUPPORT_ADMISSION_SCOPES_NOT_SEALED";

  constructor(readonly absentScopes: readonly string[]) {
    super("SUPPORT_ADMISSION_SCOPES_NOT_SEALED");
    this.name = "SupportAdmissionScopesNotSealedError";
  }
}

/**
 * The second half of the hosted start-up decision, taken where the admission row
 * IN FORCE has been read — which is after a pool exists, so it cannot live
 * inside `assertHostedCostEnvelopesSealed` above (that one runs before the first
 * connection). The parameter is structural rather than the `AdmissionPolicy`
 * type so this module keeps no dependency on the policy reader.
 */
export function assertHostedSupportAdmissionSealed(
  mode: DeploymentMode,
  policy: Readonly<{
    supportReads: unknown;
    supportSessions: unknown;
    supportModelCalls: unknown;
  }>
): void {
  if (mode !== "hosted") return;
  const absent = (["supportReads", "supportSessions", "supportModelCalls"] as const)
    .filter((scope) => policy?.[scope] === null || policy?.[scope] === undefined);
  if (absent.length > 0) throw new SupportAdmissionScopesNotSealedError(Object.freeze(absent));
}

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
    DEBATEAI_DEV_PROVIDER_TARGETS_JSON: z.string().min(1).optional(),
    DEBATEAI_DEV_CUSTODY_ROOT: z.string().min(1).optional(),
    // T16 · operator overrides for the sealed synthesizer/evaluator role
    // identities. Goal 84-85 permits identical refs; without an override the
    // permitted case is unreachable and its startup warning is dead code.
    DEBATEAI_DEV_SYNTHESIZER_ROLE_REF: z.string().min(1).optional(),
    DEBATEAI_DEV_EVALUATOR_ROLE_REF: z.string().min(1).optional(),
    DEBATEAI_DEV_SUPPORT_MODEL_TARGET_JSON: z.string().min(1).optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).optional()
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
const legacyRegisterVersion = z.string().regex(/^[1-9][0-9]*$/u).transform((value) => (
  registerVersionToSafeLegacyNumber(parseRegisterVersionText(value))
));
export const ACCOUNT_ERASURE_GRACE_MS = 604_800_000 as const;
const hatchetShape = {
  HATCHET_CLIENT_TOKEN: z.string().min(1), HATCHET_HOST_PORT: z.string().min(1),
  HATCHET_API_URL: z.string().url(), HATCHET_TENANT_ID: z.string().min(1),
  HATCHET_WORKFLOW_NAME: z.string().min(1), HATCHET_TLS_STRATEGY: z.enum(["tls", "mtls", "none"])
} as const;

const apiEnvironmentShape = {
    KEK_PATH: kekPath,
    SUPPORT_KEK_PATH: kekPath,
    // V-19: opt-in custody group. Absent, every key file and wrapped-key record
    // must be 0600 owned by this uid inside a 0700 directory owned by this uid.
    // Present (a group name or a decimal gid), @debateai/crypto additionally
    // accepts a 0640 file whose gid is that group's inside a 0750 directory
    // whose gid is that group's, so a second principal can READ the shared
    // user-DEK store without being able to replace anything in it.
    DEBATEAI_CUSTODY_GROUP: z.string().min(1).optional(),
    // V-9(c): which of the two supported deployments this process is. Resolved
    // by the loader (see `resolveDeploymentMode`) so no composition root can
    // forget to ask; the resolved value rides on `DEPLOYMENT_MODE`.
    DEBATEAI_DEPLOYMENT_MODE: z.string().min(1).optional(),
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
    DATABASE_URL: z.string().url(),
    SUPPORT_DATABASE_URL: z.string().url(),
    API_HOST: z.string().min(1), API_PORT: positiveInteger,
    STRANGER_SAMPLE_RATE: boundedRate, REGISTER_VERSION: legacyRegisterVersion,
    BATTERY_VERSION: z.string().min(1), SETTLEMENT_WATCH_HANDLE: z.string().min(1),
    PROVIDER_DISCOVERY_TARGETS_JSON: z.string().min(1).optional(),
    SUPPORT_MODEL_TARGET_JSON: z.string().min(1).optional(),
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
  const supportConflicts = [
    environment.DATABASE_URL,
    environment.AUTHORIZATION_DATABASE_URL,
    environment.CONTENT_PROVISION_DATABASE_URL,
    environment.PUBLICATION_CLEANUP_DATABASE_URL,
    environment.ERASURE_DATABASE_URL,
    environment.EVALUATOR_DEV_MENU_DATABASE_URL
  ];
  if (supportConflicts.includes(environment.SUPPORT_DATABASE_URL)) {
    throw new TypeError("SUPPORT_DATABASE_URL_MUST_BE_SEPARATE");
  }
  if (environment.SUPPORT_KEK_PATH === environment.KEK_PATH
    || environment.SUPPORT_KEK_PATH === environment.CORPUS_KEK_PATH
    || environment.SUPPORT_KEK_PATH === environment.BLIND_INDEX_KEY_PATH
    || environment.SUPPORT_KEK_PATH === environment.AUDIT_SOURCE_IP_SALT_PATH) {
    throw new TypeError("SUPPORT_KEK_PATH_MUST_BE_SEPARATE");
  }
  if (environment.PUBLICATION_ENABLED === "true"
    && (environment.CORPUS_KEK_PATH === environment.KEK_PATH
      || environment.PUBLICATION_KEY_STORE_PATH === environment.USER_DEK_STORE_PATH)) {
    throw new TypeError("PUBLICATION_KEY_DOMAIN_MUST_BE_SEPARATE");
  }
  assertProductionFloors(environment);
  return {
    ...environment,
    DEPLOYMENT_MODE: resolveDeploymentMode(
      environment.DEBATEAI_DEPLOYMENT_MODE, environment.NODE_ENV
    )
  };
}

export function parseApiEnvironment(
  source: Readonly<Record<string, string | undefined>>
) {
  return validateApiEnvironment(parseEnvironmentSource(apiEnvironmentShape, source));
}

/**
 * V-3. What `apps/runner/src/rotate-kek-cli.ts` needs. Each `*_KEK_PREVIOUS_PATH`
 * is OPTIONAL because its absence is the steady state: an operator sets it only
 * for the length of a changeover and removes it once a verification pass is
 * clean.
 *
 * The corpus pair is NOT optional in the way it looks. The command applies the
 * API's own rule: with `PUBLICATION_ENABLED=true` both `CORPUS_KEK_PATH` and
 * `PUBLICATION_KEY_STORE_PATH` are required and their absence fails the run,
 * and half a pair fails it whatever the flag says. Only a host that never
 * enabled publication may leave both unset, and the command prints that store
 * as declined by configuration rather than counting it as a clean zero.
 */
const keyRotationEnvironmentShape = {
  KEK_PATH: kekPath,
  KEK_PREVIOUS_PATH: z.string().min(1).optional(),
  USER_DEK_STORE_PATH: z.string().min(1),
  CORPUS_KEK_PATH: z.string().min(1).optional(),
  CORPUS_KEK_PREVIOUS_PATH: z.string().min(1).optional(),
  PUBLICATION_KEY_STORE_PATH: z.string().min(1).optional(),
  PUBLICATION_ENABLED: z.enum(["true", "false"]).default("false"),
  SUPPORT_KEK_PATH: kekPath,
  SUPPORT_KEK_PREVIOUS_PATH: z.string().min(1).optional(),
  // The ONLY database this command opens. It writes two support key columns and
  // touches nothing else, so it asserts the support role alone
  // (assertSupportPrincipalRole) and never holds the runtime credential.
  SUPPORT_DATABASE_URL: z.string().url(),
  DEBATEAI_CUSTODY_GROUP: z.string().min(1).optional()
} as const;

export function parseKeyRotationEnvironment(source: EnvironmentSource) {
  return parseEnvironmentSource(keyRotationEnvironmentShape, source);
}

export function loadKeyRotationEnvironment() {
  return parseEnvironment(keyRotationEnvironmentShape);
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
    REGISTER_VERSION: legacyRegisterVersion, NODE_ENV: nodeEnvironment,
    CONTENT_ENCRYPTION_ENABLED: z.enum(["true", "false"]).default("false"),
    CONTENT_BLIND_INDEX_KEY_PATH: z.string().min(1).optional(),
    USER_DEK_STORE_PATH: z.string().min(1).optional(),
    // V-19: the runner reads the API's user-DEK store and owns none of it, so
    // this is the setting that lets it in. Same shape and meaning as the API's.
    DEBATEAI_CUSTODY_GROUP: z.string().min(1).optional(),
    // V-9(c): see the API shape. Same key, same meaning, one deployment.
    DEBATEAI_DEPLOYMENT_MODE: z.string().min(1).optional(),
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
    // V-20, ruled 2026-09-22: despite their name these three describe the
    // PRIMARY provider, and a hosted deployment has no self-hosted inference
    // server to describe. Absent, `PROVIDER_DISCOVERY_TARGETS_JSON` is the
    // single source; present (development), the cross-check is unchanged.
    VLLM_BASE_URL: z.string().url().optional(),
    VLLM_MODEL: z.string().min(1).optional(),
    VLLM_MAKER: z.string().min(1).optional(),
    VLLM_AUTHORIZATION: z.string().min(1).optional(),
    PROVIDER_DISCOVERY_TARGETS_JSON: z.string().min(1).optional(),
    // T3C / F34: the runner re-probes each pinned panel member at claim time
    // (DR-182 VROW-5), so it needs the same probe timeout the API already reads.
    // Same key, same shape, same default — one knob, two entry points.
    PROVIDER_PROBE_TIMEOUT_MS: positiveInteger.default(5_000),
    ...hatchetShape
  }, source);
  if (environment.CONTENT_BLIND_INDEX_KEY_PATH !== undefined) {
    throw new TypeError("CONTENT_BLIND_INDEX_V1_KEY_MUST_BE_RETIRED");
  }
  if (environment.CONTENT_ENCRYPTION_ENABLED === "true"
    && environment.USER_DEK_STORE_PATH === undefined) {
    throw new TypeError("CONTENT_ENCRYPTION_KEY_PATHS_REQUIRED");
  }
  // V-20: the three keys are one declaration, all or none. Half a set is neither
  // source of truth — the cross-check would compare a declared primary against
  // values nobody finished writing — so it refuses here rather than at the first
  // claim, and `VLLM_AUTHORIZATION` alone declares a credential for nothing.
  const declaredPrimary = [
    environment.VLLM_BASE_URL, environment.VLLM_MODEL, environment.VLLM_MAKER
  ].filter((value) => value !== undefined).length;
  if (declaredPrimary !== 0 && declaredPrimary !== 3) {
    throw new TypeError("RUNNER_PRIMARY_PROVIDER_KEYS_INCOMPLETE");
  }
  if (declaredPrimary === 0 && environment.VLLM_AUTHORIZATION !== undefined) {
    throw new TypeError("RUNNER_PRIMARY_PROVIDER_KEYS_INCOMPLETE");
  }
  assertProductionFloors(environment);
  return {
    ...environment,
    DEPLOYMENT_MODE: resolveDeploymentMode(
      environment.DEBATEAI_DEPLOYMENT_MODE, environment.NODE_ENV
    )
  };
}

export function loadObservationAgentEnvironment() {
  const observationEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => key.startsWith("OBSERVATION_"))
  );
  const absolutePath = z.string().min(1).regex(/^\//u);
  const environment = Object.freeze(z.object({
    OBSERVATION_DATABASE_URL: z.string().url(),
    OBSERVATION_STATE_DIR: absolutePath,
    OBSERVATION_TARGETS_PATH: absolutePath,
    OBSERVATION_HATCHET_TOKEN_PATH: z.string().min(1).optional()
  }).strict().parse(observationEnvironment));
  // C1 / L5-F3: every loader floors its `*_DATABASE_URL` in production. NODE_ENV is read
  // for the floor only — the agent's ruled inputs stay the four OBSERVATION_ keys above.
  assertProductionFloors({ ...environment, NODE_ENV: process.env.NODE_ENV });
  return environment;
}
