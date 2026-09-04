import { createHash } from "node:crypto";
import { types as nodeUtilTypes } from "node:util";

import {
  EMPTY_CAUSE_CHAIN_CODES,
  isProjectedCauseChainCodes,
  projectCauseChainCodes,
} from "./cause-chain.js";
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
import type { PostRedactionEnvelope } from "./redactor.js";

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
  "cause_chain_codes",
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
const LEGACY_ENVELOPE_KEYS = Object.freeze(
  ENVELOPE_KEYS.filter((key) => key !== "cause_chain_codes"),
);

type OwnDataSnapshot = Readonly<Record<string, unknown>>;

function isObjectLike(value: unknown): value is object {
  return (typeof value === "object" && value !== null)
    || typeof value === "function";
}

function snapshotOwnData(value: unknown): OwnDataSnapshot | undefined {
  if (!isObjectLike(value)) return undefined;
  try {
    if (nodeUtilTypes.isProxy(value)) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor
    >;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === "symbol")) return undefined;
    const snapshot = Object.create(null) as Record<string, unknown>;
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined
        || !Object.prototype.hasOwnProperty.call(descriptor, "value")
        || descriptor.enumerable !== true
      ) {
        return undefined;
      }
      snapshot[key] = descriptor.value;
    }
    return Object.freeze(snapshot);
  } catch {
    return undefined;
  }
}

function hasExactSnapshotKeys(
  snapshot: OwnDataSnapshot,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(snapshot).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function snapshotArray(
  value: unknown,
  maximumLength: number,
): readonly unknown[] | undefined {
  if (!isObjectLike(value)) return undefined;
  try {
    if (nodeUtilTypes.isProxy(value) || !Array.isArray(value)) return undefined;
    const descriptors = Object.getOwnPropertyDescriptors(value) as Record<
      string,
      PropertyDescriptor
    >;
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key === "symbol")) return undefined;
    const lengthDescriptor = descriptors.length;
    if (
      lengthDescriptor === undefined
      || !Object.prototype.hasOwnProperty.call(lengthDescriptor, "value")
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > maximumLength
    ) {
      return undefined;
    }
    const length = lengthDescriptor.value as number;
    if (keys.length !== length + 1) return undefined;
    const snapshot: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        descriptor === undefined
        || !Object.prototype.hasOwnProperty.call(descriptor, "value")
        || descriptor.enumerable !== true
      ) {
        return undefined;
      }
      snapshot.push(descriptor.value);
    }
    return Object.freeze(snapshot);
  } catch {
    return undefined;
  }
}

function copyNullPrototypeRecord(
  snapshot: OwnDataSnapshot,
): Readonly<Record<string, unknown>> {
  const copy = Object.create(null) as Record<string, unknown>;
  for (const key of Object.keys(snapshot)) copy[key] = snapshot[key];
  return Object.freeze(copy);
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

function isNormalizedSafeEnvelope(
  value: Readonly<Record<string, unknown>>,
  runtime: SafeRuntimeName,
): boolean {
  const component = value.component as Readonly<Record<string, unknown>>;
  if (
    !hasExactSnapshotKeys(component, ["process", "package"])
    || component.process !== runtime
    || component.package !== `@debateai/${runtime}`
  ) {
    return false;
  }
  const hasCauseChain = (value.cause_chain_codes as readonly string[]).length > 0;
  if (
    !Array.isArray(value.frames)
    || value.frames.length !== 0
    || typeof value.template_parameters !== "object"
    || value.template_parameters === null
    || Array.isArray(value.template_parameters)
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
      value.template_parameters as Readonly<Record<string, unknown>>,
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
    && (hasCauseChain
      ? value.parent_occurrence_ref === "CAUSE_NOT_CAPTURED:NOT_SEPARATELY_CAPTURED"
        && value.cause_relation === "WRAPS"
      : value.parent_occurrence_ref === "NO_CAUSE"
        && value.cause_relation === null)
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

export function normalizeSerializedSafeEnvelope(
  value: unknown,
  runtime: SafeRuntimeName,
): PostRedactionEnvelope | undefined {
  try {
    const outer = snapshotOwnData(value);
    if (outer === undefined) return undefined;
    const legacy = hasExactSnapshotKeys(outer, LEGACY_ENVELOPE_KEYS);
    if (!legacy && !hasExactSnapshotKeys(outer, ENVELOPE_KEYS)) {
      return undefined;
    }

    const componentSnapshot = snapshotOwnData(outer.component);
    const parameterSnapshot = snapshotOwnData(outer.template_parameters);
    const frameSnapshot = snapshotArray(outer.frames, 0);
    if (
      componentSnapshot === undefined
      || !hasExactSnapshotKeys(componentSnapshot, ["process", "package"])
      || parameterSnapshot === undefined
      || frameSnapshot === undefined
    ) {
      return undefined;
    }

    const code = outer.code;
    if (typeof code !== "string") return undefined;
    let causeChainCodes: readonly string[];
    if (legacy) {
      causeChainCodes = EMPTY_CAUSE_CHAIN_CODES;
    } else {
      const chainSnapshot = snapshotArray(outer.cause_chain_codes, 8);
      if (
        chainSnapshot === undefined
        || !isProjectedCauseChainCodes(chainSnapshot, code)
      ) {
        return undefined;
      }
      causeChainCodes = projectCauseChainCodes(chainSnapshot, code);
      if (chainSnapshot.length === 0) causeChainCodes = Object.freeze([]);
    }

    const normalized = Object.create(null) as Record<string, unknown>;
    for (const key of ENVELOPE_KEYS) {
      normalized[key] = key === "component"
        ? copyNullPrototypeRecord(componentSnapshot)
        : key === "template_parameters"
          ? copyNullPrototypeRecord(parameterSnapshot)
          : key === "frames"
            ? frameSnapshot
            : key === "cause_chain_codes"
              ? causeChainCodes
              : outer[key];
    }
    Object.freeze(normalized);
    return isNormalizedSafeEnvelope(normalized, runtime)
      ? normalized as unknown as PostRedactionEnvelope
      : undefined;
  } catch {
    return undefined;
  }
}

export function isSerializedSafeEnvelope(
  value: unknown,
  runtime: SafeRuntimeName,
): boolean {
  return normalizeSerializedSafeEnvelope(value, runtime) !== undefined;
}
