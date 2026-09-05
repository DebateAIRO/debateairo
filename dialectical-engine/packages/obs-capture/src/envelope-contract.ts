import { createHash } from "node:crypto";

import {
  resolveSafeTemplate,
  resolveTaxonomyClass,
  severity,
  validateTemplateParameters,
} from "./registry/index.js";
import {
  isSafeBuildRefMetadata,
  isSafeEnvironmentMetadata,
  isSafePolicyIdentifierMetadata,
  isSafeSourceEventRef,
  isSafeWriterIdentityMetadata,
  NOT_APPLICABLE,
  SAFE_RUNTIME_NAMES,
  UNKNOWN_DECLARED_KIND,
  type SafeRuntimeName,
} from "./safe-metadata.js";

const RUNTIME_NAME_SET: ReadonlySet<string> = new Set(SAFE_RUNTIME_NAMES);
const CAPTURE_POINTS: ReadonlySet<string> = new Set([
  "process",
  "http",
  "job",
  "provider",
  "db",
  "client",
  "detector",
  "boundary",
  "self",
]);
const DISPOSITIONS: ReadonlySet<string> = new Set([
  "THROWN",
  "HANDLED",
  "DETECTED",
  "SELF",
]);
const SOURCES: ReadonlySet<string> = new Set([
  "first_party",
  "hatchet",
  "ui_client",
]);
const UUID_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const AT_SEQ_REF = /^[1-9][0-9]*$/u;
const CANONICAL_TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u;
const ENVELOPE_KEYS = Object.freeze([
  "occurred_at",
  "environment",
  "build_ref",
  "build_dirty",
  "runtime",
  "component",
  "capture_point",
  "code",
  "taxonomy_class",
  "severity",
  "condition_mark",
  "disposition",
  "fingerprint",
  "fingerprint_version",
  "redaction_policy_version",
  "allowlist_set_id",
  "fallback_minimized",
  "run_ref",
  "work_item_ref",
  "node_ref",
  "attempt_ref",
  "ledger_ref",
  "parent_occurrence_ref",
  "cause_relation",
  "at_seq_watermark",
  "frames",
  "safe_template_id",
  "template_parameters",
  "source",
  "source_event_ref",
  "zone_context",
  "attempt_index",
  "writer_identity",
] as const);

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

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function expectedFingerprint(value: Readonly<Record<string, unknown>>): string {
  const component = value.component as Readonly<Record<string, unknown>>;
  return createHash("sha256")
    .update(
      `v1\u0000${String(value.code)}\u0000${String(value.taxonomy_class)}\u0000${String(value.runtime)}\u0000${String(component.package)}`,
    )
    .digest("hex");
}

function isUuidCorrelationRef(value: unknown): value is string {
  return value === UNKNOWN_DECLARED_KIND
    || value === NOT_APPLICABLE
    || (typeof value === "string" && UUID_REF.test(value));
}

function isAtSeqCorrelationRef(value: unknown): value is string {
  if (value === UNKNOWN_DECLARED_KIND || value === NOT_APPLICABLE) return true;
  if (typeof value !== "string" || !AT_SEQ_REF.test(value)) return false;
  return Number(value) <= Number.MAX_SAFE_INTEGER;
}

function hasLawfulCorrelationRefs(
  value: Readonly<Record<string, unknown>>,
): boolean {
  if (value.zone_context === true) {
    return value.run_ref === UNKNOWN_DECLARED_KIND
      && value.work_item_ref === UNKNOWN_DECLARED_KIND
      && value.node_ref === UNKNOWN_DECLARED_KIND
      && value.attempt_ref === UNKNOWN_DECLARED_KIND
      && value.ledger_ref === UNKNOWN_DECLARED_KIND
      && value.at_seq_watermark === UNKNOWN_DECLARED_KIND;
  }
  return isUuidCorrelationRef(value.run_ref)
    && isUuidCorrelationRef(value.work_item_ref)
    && isUuidCorrelationRef(value.node_ref)
    && isUuidCorrelationRef(value.attempt_ref)
    && isUuidCorrelationRef(value.ledger_ref)
    && isAtSeqCorrelationRef(value.at_seq_watermark);
}

export function isSerializedSafeEnvelope(
  value: unknown,
  runtime: SafeRuntimeName,
): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value) || !hasExactKeys(value, ENVELOPE_KEYS)) return false;
  const component = value.component;
  if (
    !isRecord(component)
    || !hasExactKeys(component, ["process", "package"])
    || component.process !== runtime
    || component.package !== `@debateai/${runtime}`
  ) {
    return false;
  }
  if (
    !Array.isArray(value.frames)
    || value.frames.length !== 0
    || !isRecord(value.template_parameters)
  ) {
    return false;
  }
  const safeTemplate = typeof value.code === "string"
    ? resolveSafeTemplate(value.code)
    : undefined;
  if (
    safeTemplate === undefined
    || value.safe_template_id !== safeTemplate.id
    || validateTemplateParameters(
      safeTemplate.parameters,
      value.template_parameters,
    ).fallback_minimized
  ) {
    return false;
  }
  return isCanonicalTimestamp(value.occurred_at)
    && isSafeEnvironmentMetadata(value.environment)
    && isSafeBuildRefMetadata(value.build_ref)
    && typeof value.build_dirty === "boolean"
    && typeof value.runtime === "string"
    && RUNTIME_NAME_SET.has(value.runtime)
    && value.runtime === runtime
    && typeof value.capture_point === "string"
    && CAPTURE_POINTS.has(value.capture_point)
    && typeof value.taxonomy_class === "string"
    && resolveTaxonomyClass(value.taxonomy_class) !== undefined
    && value.severity === severity(safeTemplate.code)
    && value.condition_mark === null
    && typeof value.disposition === "string"
    && DISPOSITIONS.has(value.disposition)
    && value.fingerprint === expectedFingerprint(value)
    && value.fingerprint_version === 1
    && isSafePolicyIdentifierMetadata(value.redaction_policy_version)
    && isSafePolicyIdentifierMetadata(value.allowlist_set_id)
    && typeof value.fallback_minimized === "boolean"
    && value.parent_occurrence_ref === "NO_CAUSE"
    && value.cause_relation === null
    && hasLawfulCorrelationRefs(value)
    && typeof value.source === "string"
    && SOURCES.has(value.source)
    && isSafeSourceEventRef(value.source_event_ref)
    && typeof value.zone_context === "boolean"
    && (value.attempt_index === null
      || (typeof value.attempt_index === "number"
        && Number.isSafeInteger(value.attempt_index)
        && value.attempt_index >= 0))
    && isSafeWriterIdentityMetadata(value.writer_identity);
}
