export const UNKNOWN_DECLARED_KIND = "UNKNOWN:DECLARED_KIND_REQUIRED" as const;
export const UNKNOWN_SOURCE_EVENT_REF = "UNKNOWN:SOURCE_EVENT_REF_UNAVAILABLE" as const;
export const NOT_APPLICABLE = "NOT_APPLICABLE" as const;
export const SPOOL_RECORD_MAX_BYTES = 16_384;
export const SPOOL_FILE_MAX_BYTES = 65_536;

export const SAFE_METADATA_FALLBACKS = Object.freeze({
  environment: "unknown",
  buildRef: "UNTRACKED-DEV:UNKNOWN",
  redactionPolicyVersion: "g0",
  allowlistSetId: "g0-empty-parameters",
});

export const SAFE_RUNTIME_NAMES = Object.freeze([
  "api",
  "runner",
  "scheduler",
  "evaluator-lib",
  "ui-client",
  "listener",
  "watchdog",
  "ingest",
] as const);
export type SafeRuntimeName = (typeof SAFE_RUNTIME_NAMES)[number];

const ENVIRONMENT = /^[a-z][a-z0-9-]{0,31}$/u;
const BUILD_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/u;
const POLICY_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,255}$/u;
const WRITER_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SENSITIVE_METADATA = /(?:password|passwd|secret|token|credential|authorization|cookie|bearer|api[_-]?key|private[_-]?key)/iu;
const UUID_V4_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export interface NormalizedSafeValue {
  readonly value: string;
  readonly minimized: boolean;
}

export interface SafeEnvelopeMetadata {
  readonly environment: string;
  readonly build_ref: string;
  readonly runtime: SafeRuntimeName;
  readonly component: Readonly<{
    readonly process: SafeRuntimeName;
    readonly package: string;
  }>;
  readonly writer_identity: string;
  readonly redaction_policy_version: string;
  readonly allowlist_set_id: string;
  readonly fallback_minimized: boolean;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function isSafeMetadata(value: unknown, grammar: RegExp): value is string {
  return typeof value === "string"
    && grammar.test(value)
    && !SENSITIVE_METADATA.test(value)
    && !value.includes("://");
}

export function isSafeEnvironmentMetadata(value: unknown): value is string {
  return isSafeMetadata(value, ENVIRONMENT);
}

export function isSafeBuildRefMetadata(value: unknown): value is string {
  return isSafeMetadata(value, BUILD_REF);
}

export function isSafePolicyIdentifierMetadata(
  value: unknown,
): value is string {
  return isSafeMetadata(value, POLICY_IDENTIFIER);
}

export function isSafeWriterIdentityMetadata(value: unknown): value is string {
  return isSafeMetadata(value, WRITER_IDENTITY);
}

export function isSafeSourceEventRef(value: unknown): value is string {
  return typeof value === "string"
    && (UUID_V4_REF.test(value) || value === UNKNOWN_SOURCE_EVENT_REF);
}

function normalizedMetadata(
  value: unknown,
  isSafe: (candidate: unknown) => candidate is string,
  fallback: string,
): NormalizedSafeValue {
  return isSafe(value)
    ? { value, minimized: false }
    : { value: fallback, minimized: true };
}

export function normalizeSafeEnvelopeMetadata(input: {
  readonly environment: unknown;
  readonly build_ref: unknown;
  readonly runtime: SafeRuntimeName;
  readonly component: unknown;
  readonly writer_identity: unknown;
  readonly redaction_policy_version: unknown;
  readonly allowlist_set_id: unknown;
}): SafeEnvelopeMetadata {
  const environment = normalizedMetadata(
    input.environment,
    isSafeEnvironmentMetadata,
    SAFE_METADATA_FALLBACKS.environment,
  );
  const buildRef = normalizedMetadata(
    input.build_ref,
    isSafeBuildRefMetadata,
    SAFE_METADATA_FALLBACKS.buildRef,
  );
  const redactionPolicyVersion = normalizedMetadata(
    input.redaction_policy_version,
    isSafePolicyIdentifierMetadata,
    SAFE_METADATA_FALLBACKS.redactionPolicyVersion,
  );
  const allowlistSetId = normalizedMetadata(
    input.allowlist_set_id,
    isSafePolicyIdentifierMetadata,
    SAFE_METADATA_FALLBACKS.allowlistSetId,
  );
  const writerIdentity = normalizedMetadata(
    input.writer_identity,
    isSafeWriterIdentityMetadata,
    input.runtime,
  );
  const expectedComponent = Object.freeze({
    process: input.runtime,
    package: `@debateai/${input.runtime}`,
  });
  const componentMatches = isRecord(input.component)
    && hasExactKeys(input.component, ["process", "package"])
    && input.component.process === expectedComponent.process
    && input.component.package === expectedComponent.package;
  return Object.freeze({
    environment: environment.value,
    build_ref: buildRef.value,
    runtime: input.runtime,
    component: expectedComponent,
    writer_identity: writerIdentity.value,
    redaction_policy_version: redactionPolicyVersion.value,
    allowlist_set_id: allowlistSetId.value,
    fallback_minimized: environment.minimized
      || buildRef.minimized
      || redactionPolicyVersion.minimized
      || allowlistSetId.minimized
      || writerIdentity.minimized
      || !componentMatches,
  });
}

export function normalizeSourceEventRef(value: unknown): NormalizedSafeValue {
  return typeof value === "string" && UUID_V4_REF.test(value)
    ? { value, minimized: false }
    : { value: UNKNOWN_SOURCE_EVENT_REF, minimized: true };
}

export function clampSpoolRecordLimit(value: number): number {
  return Number.isSafeInteger(value) && value > 0
    ? Math.min(value, SPOOL_RECORD_MAX_BYTES)
    : SPOOL_RECORD_MAX_BYTES;
}
