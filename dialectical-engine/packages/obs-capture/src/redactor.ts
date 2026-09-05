import { createHash, randomUUID } from "node:crypto";

import type { CaptureQueueEntry } from "./emit.js";
import {
  projectDeclaredRefs,
  type ProjectedDeclaredRefs,
} from "./kinds.js";
import {
  normalizeSafeEnvelopeMetadata,
  normalizeSourceEventRef,
  UNKNOWN_DECLARED_KIND,
} from "./safe-metadata.js";
import {
  resolveSafeTemplate,
  resolveTaxonomyClass,
  severity,
  validateTemplateParameters,
  type Severity,
  type TaxonomyClass,
} from "./registry/index.js";

export * from "./kinds.js";
export { UNKNOWN_DECLARED_KIND } from "./safe-metadata.js";

const POST_REDACTION_BRAND: unique symbol = Symbol("POST_REDACTION_ENVELOPE");

const CAPTURE_POINTS = Object.freeze([
  "process",
  "http",
  "job",
  "provider",
  "db",
  "client",
  "detector",
  "boundary",
  "self",
] as const);
type CapturePoint = (typeof CAPTURE_POINTS)[number];

const DISPOSITIONS = Object.freeze([
  "THROWN",
  "HANDLED",
  "DETECTED",
  "SELF",
] as const);
type CaptureDisposition = (typeof DISPOSITIONS)[number];

const SOURCES = Object.freeze(["first_party", "hatchet", "ui_client"] as const);
type DurableSource = (typeof SOURCES)[number];

const CAPTURE_POINT_SET: ReadonlySet<string> = new Set(CAPTURE_POINTS);
const DISPOSITION_SET: ReadonlySet<string> = new Set(DISPOSITIONS);
const SOURCE_SET: ReadonlySet<string> = new Set(SOURCES);
const INPUT_ALLOWLIST: ReadonlySet<string> = new Set([
  "code",
  "error",
  "taxonomy_class",
  "capture_point",
  "disposition",
  "source",
  "zone_context",
  "attempt_index",
  "template_parameters",
]);
const LIFECYCLE_INPUT_ALLOWLIST: ReadonlySet<string> = new Set([
  "code",
  "error",
  "taxonomy_class",
  "capture_point",
  "disposition",
  "source",
  "template_parameters",
]);

export interface PostRedactionEnvelope {
  readonly [POST_REDACTION_BRAND]: true;
  readonly occurred_at: string;
  readonly environment: string;
  readonly build_ref: string;
  readonly build_dirty: boolean;
  readonly runtime:
    | "api"
    | "runner"
    | "scheduler"
    | "evaluator-lib"
    | "ui-client"
    | "listener"
    | "watchdog"
    | "ingest";
  readonly component: Readonly<{ readonly process: string; readonly package: string }>;
  readonly capture_point: CapturePoint;
  readonly code: string;
  readonly taxonomy_class: TaxonomyClass;
  readonly severity: Severity;
  readonly condition_mark: null;
  readonly disposition: CaptureDisposition;
  readonly fingerprint: string;
  readonly fingerprint_version: 1;
  readonly redaction_policy_version: string;
  readonly allowlist_set_id: string;
  readonly fallback_minimized: boolean;
  readonly run_ref: ProjectedDeclaredRefs["run_ref"];
  readonly work_item_ref: ProjectedDeclaredRefs["work_item_ref"];
  readonly node_ref: ProjectedDeclaredRefs["node_ref"];
  readonly attempt_ref: ProjectedDeclaredRefs["attempt_ref"];
  readonly ledger_ref: ProjectedDeclaredRefs["ledger_ref"];
  readonly parent_occurrence_ref: "NO_CAUSE";
  readonly cause_relation: null;
  readonly at_seq_watermark: ProjectedDeclaredRefs["at_seq_watermark"];
  readonly frames: readonly [];
  readonly safe_template_id: string;
  readonly template_parameters: Readonly<Record<string, string | number>>;
  readonly source: DurableSource;
  readonly source_event_ref: string;
  readonly zone_context: boolean;
  readonly attempt_index: number | null;
  readonly writer_identity: string;
}

export interface SharedRedactor {
  redact(entry: CaptureQueueEntry): PostRedactionEnvelope;
}

export interface SharedRedactorConfig {
  readonly environment: string;
  readonly build_ref: string;
  readonly build_dirty: boolean;
  readonly runtime: PostRedactionEnvelope["runtime"];
  readonly component: Readonly<{ readonly process: string; readonly package: string }>;
  readonly writer_identity: string;
  readonly redaction_policy_version: string;
  readonly allowlist_set_id: string;
  readonly now?: () => Date;
  readonly sourceEventRef?: () => string;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isParameterRecord(
  value: unknown,
): value is Readonly<Record<string, unknown>> {
  return isRecord(value) && !Array.isArray(value);
}

function hasOwn(
  record: Readonly<Record<string, unknown>>,
  key: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function ownValue(
  record: Readonly<Record<string, unknown>>,
  key: string,
): unknown {
  return Object.prototype.hasOwnProperty.call(record, key)
    ? record[key]
    : undefined;
}

function stringMember<T extends string>(
  value: unknown,
  members: ReadonlySet<string>,
  fallback: T,
): T | undefined {
  if (value === undefined) {
    return fallback;
  }
  return typeof value === "string" && members.has(value)
    ? (value as T)
    : undefined;
}

export function isPostRedactionEnvelope(
  value: unknown,
): value is PostRedactionEnvelope {
  try {
    return isRecord(value) && value[POST_REDACTION_BRAND as unknown as string] === true;
  } catch {
    return false;
  }
}

export function createSharedRedactor(
  config: SharedRedactorConfig,
): SharedRedactor {
  const metadata = normalizeSafeEnvelopeMetadata({
    environment: config.environment,
    build_ref: config.build_ref,
    runtime: config.runtime,
    component: config.component,
    writer_identity: config.writer_identity,
    redaction_policy_version: config.redaction_policy_version,
    allowlist_set_id: config.allowlist_set_id,
  });
  const component = metadata.component;
  const now = config.now ?? (() => new Date());
  const sourceEventRef = config.sourceEventRef ?? randomUUID;
  const ambientProjectionFields = Object.freeze([
    "run_ref",
    "work_item_ref",
    "node_ref",
    "attempt_ref",
    "ledger_ref",
    "at_seq_watermark",
    "zone_context",
  ] as const);

  function safeNow(): Date {
    try {
      const value = now();
      return Number.isNaN(value.getTime()) ? new Date(0) : value;
    } catch {
      return new Date(0);
    }
  }

  function safeSourceEventRef(): Readonly<{
    readonly value: string;
    readonly minimized: boolean;
  }> {
    try {
      return normalizeSourceEventRef(sourceEventRef());
    } catch {
      return normalizeSourceEventRef(undefined);
    }
  }

  function build(options: {
    readonly code: string;
    readonly taxonomyClass: TaxonomyClass;
    readonly capturePoint: CapturePoint;
    readonly disposition: CaptureDisposition;
    readonly source: DurableSource;
    readonly zoneContext: boolean;
    readonly attemptIndex: number | null;
    readonly fallbackMinimized: boolean;
    readonly ambientContext: CaptureQueueEntry["ambient_context_ref"];
    readonly templateParameters: Readonly<Record<string, string | number>>;
  }): PostRedactionEnvelope {
    const template = resolveSafeTemplate(options.code);
    const fallbackTemplate = resolveSafeTemplate("OBS_CAPTURE_SELF");
    if (template === undefined && fallbackTemplate === undefined) {
      throw new Error("OBS_CAPTURE_SELF_TEMPLATE_MISSING");
    }
    const safeTemplate = template ?? fallbackTemplate;
    if (safeTemplate === undefined) {
      throw new Error("OBS_CAPTURE_SELF_TEMPLATE_MISSING");
    }
    const safeCode = safeTemplate.code;
    const binding = safeTemplate.binding;
    const safeTaxonomy = template === undefined
      ? "CAPTURE_SELF"
      : (binding?.taxonomy_class ?? options.taxonomyClass);
    const sourceRef = safeSourceEventRef();
    const fingerprint = createHash("sha256")
      .update(`v1\u0000${safeCode}\u0000${safeTaxonomy}\u0000${metadata.runtime}\u0000${component.package}`)
      .digest("hex");
    const declaredRefs = projectDeclaredRefs(
      options.ambientContext,
      options.zoneContext,
    );
    return Object.freeze({
      [POST_REDACTION_BRAND]: true as const,
      occurred_at: safeNow().toISOString(),
      environment: metadata.environment,
      build_ref: metadata.build_ref,
      build_dirty: config.build_dirty,
      runtime: metadata.runtime,
      component,
      capture_point: template === undefined
        ? "self"
        : (binding?.capture_point ?? options.capturePoint),
      code: safeCode,
      taxonomy_class: safeTaxonomy,
      severity: severity(safeCode),
      condition_mark: null,
      disposition: template === undefined
        ? "SELF"
        : (binding?.disposition ?? options.disposition),
      fingerprint,
      fingerprint_version: 1 as const,
      redaction_policy_version: metadata.redaction_policy_version,
      allowlist_set_id: metadata.allowlist_set_id,
      fallback_minimized: options.fallbackMinimized
        || template === undefined
        || metadata.fallback_minimized
        || sourceRef.minimized,
      run_ref: declaredRefs.run_ref,
      work_item_ref: declaredRefs.work_item_ref,
      node_ref: declaredRefs.node_ref,
      attempt_ref: declaredRefs.attempt_ref,
      ledger_ref: declaredRefs.ledger_ref,
      parent_occurrence_ref: "NO_CAUSE" as const,
      cause_relation: null,
      at_seq_watermark: declaredRefs.at_seq_watermark,
      frames: Object.freeze([]) as readonly [],
      safe_template_id: safeTemplate.id,
      template_parameters: template === undefined
        ? Object.freeze({})
        : options.templateParameters,
      source: template === undefined
        ? "first_party"
        : (binding?.source ?? options.source),
      source_event_ref: sourceRef.value,
      zone_context: template === undefined ? false : options.zoneContext,
      attempt_index: template === undefined ? null : options.attemptIndex,
      writer_identity: metadata.writer_identity,
    });
  }

  function fallback(
    ambientContext: CaptureQueueEntry["ambient_context_ref"],
    zoneContext: boolean,
  ): PostRedactionEnvelope {
    return build({
      code: "OBS_CAPTURE_SELF",
      taxonomyClass: "CAPTURE_SELF",
      capturePoint: "self",
      disposition: "SELF",
      source: "first_party",
      zoneContext,
      attemptIndex: null,
      fallbackMinimized: true,
      ambientContext,
      templateParameters: Object.freeze({}),
    });
  }

  function snapshotAmbientContext(
    ambientContext: CaptureQueueEntry["ambient_context_ref"],
  ): Readonly<{
    ambientContext: CaptureQueueEntry["ambient_context_ref"];
    zoneContext: boolean;
    safe: boolean;
  }> {
    if (!isRecord(ambientContext)) {
      return Object.freeze({
        ambientContext: undefined,
        zoneContext: false,
        safe: true,
      });
    }
    try {
      const snapshot: Record<string, unknown> = Object.create(null) as Record<
        string,
        unknown
      >;
      let zoneContext = false;
      for (const field of ambientProjectionFields) {
        const descriptor = Object.getOwnPropertyDescriptor(ambientContext, field);
        if (descriptor === undefined) {
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) {
          return Object.freeze({
            ambientContext: undefined,
            zoneContext: true,
            safe: false,
          });
        }
        if (field === "zone_context") {
          if (typeof descriptor.value !== "boolean") {
            return Object.freeze({
              ambientContext: undefined,
              zoneContext: true,
              safe: false,
            });
          }
          zoneContext = descriptor.value;
        }
        snapshot[field] = descriptor.value;
      }
      return Object.freeze({
        ambientContext: Object.freeze(
          snapshot,
        ) as CaptureQueueEntry["ambient_context_ref"],
        zoneContext,
        safe: true,
      });
    } catch {
      return Object.freeze({
        ambientContext: undefined,
        zoneContext: true,
        safe: false,
      });
    }
  }

  return Object.freeze({
    redact(entry: CaptureQueueEntry): PostRedactionEnvelope {
      let rawAmbientContext: CaptureQueueEntry["ambient_context_ref"];
      try {
        rawAmbientContext = entry?.ambient_context_ref;
      } catch {
        return fallback(undefined, true);
      }
      const ambientSnapshot = snapshotAmbientContext(rawAmbientContext);
      if (!ambientSnapshot.safe) {
        return fallback(undefined, true);
      }
      const ambientContext = ambientSnapshot.ambientContext;
      let zoneContext = ambientSnapshot.zoneContext;

      try {
        let payload: Readonly<Record<string, unknown>> | undefined;
        let codeValue: unknown;
        if (entry.kind === "envelope") {
          if (!isRecord(entry.payload_ref)) {
            return fallback(ambientContext, zoneContext);
          }
          payload = entry.payload_ref;
          const payloadZoneValue = ownValue(payload, "zone_context");
          if (
            payloadZoneValue !== undefined &&
            typeof payloadZoneValue !== "boolean"
          ) {
            return fallback(ambientContext, true);
          }
          zoneContext = zoneContext || payloadZoneValue === true;
          if (Object.keys(payload).some((key) => !INPUT_ALLOWLIST.has(key))) {
            return fallback(ambientContext, zoneContext);
          }
          codeValue = ownValue(payload, "code");
          if (codeValue === undefined) {
            const errorValue = ownValue(payload, "error");
            codeValue = isRecord(errorValue) ? ownValue(errorValue, "code") : undefined;
          }
        } else {
          codeValue = isRecord(entry.payload_ref)
            ? ownValue(entry.payload_ref, "code")
            : undefined;
        }

        if (typeof codeValue !== "string") {
          return fallback(ambientContext, zoneContext);
        }
        const safeTemplate = resolveSafeTemplate(codeValue);
        if (safeTemplate === undefined) {
          return fallback(ambientContext, zoneContext);
        }
        const parameterValue = payload === undefined
          ? undefined
          : ownValue(payload, "template_parameters");
        if (parameterValue !== undefined && !isParameterRecord(parameterValue)) {
          return fallback(ambientContext, zoneContext);
        }
        const validatedParameters = validateTemplateParameters(
          safeTemplate.parameters,
          parameterValue ?? Object.freeze({}),
        );
        if (validatedParameters.fallback_minimized) {
          return fallback(ambientContext, zoneContext);
        }
        const binding = safeTemplate.binding;
        if (binding !== undefined) {
          if (
            payload === undefined
            || Object.keys(payload).some((key) => !LIFECYCLE_INPUT_ALLOWLIST.has(key))
          ) {
            return fallback(ambientContext, zoneContext);
          }
          const hasError = hasOwn(payload, "error");
          if (
            (codeValue === "OBS_SCHEDULER_JOB_FAILED" && !hasError)
            || (codeValue !== "OBS_SCHEDULER_JOB_FAILED" && hasError)
          ) {
            return fallback(ambientContext, zoneContext);
          }
          for (const [field, expected] of Object.entries(binding)) {
            if (hasOwn(payload, field) && ownValue(payload, field) !== expected) {
              return fallback(ambientContext, zoneContext);
            }
          }
        }
        const taxonomyValue = binding?.taxonomy_class ?? (payload === undefined
          ? "ORIGIN_UNKNOWN"
          : (ownValue(payload, "taxonomy_class") ?? "ORIGIN_UNKNOWN"));
        const taxonomy = typeof taxonomyValue === "string"
          ? resolveTaxonomyClass(taxonomyValue)?.taxonomy_class
          : undefined;
        if (taxonomy === undefined) return fallback(ambientContext, zoneContext);
        const capturePoint = stringMember<CapturePoint>(
          binding?.capture_point
            ?? (payload === undefined ? undefined : ownValue(payload, "capture_point")),
          CAPTURE_POINT_SET,
          entry.kind === "handled_error" ? "boundary" : "self",
        );
        const disposition = stringMember<CaptureDisposition>(
          binding?.disposition
            ?? (payload === undefined ? undefined : ownValue(payload, "disposition")),
          DISPOSITION_SET,
          entry.kind === "handled_error" ? "HANDLED" : "THROWN",
        );
        const source = stringMember<DurableSource>(
          binding?.source
            ?? (payload === undefined ? undefined : ownValue(payload, "source")),
          SOURCE_SET,
          "first_party",
        );
        if (capturePoint === undefined || disposition === undefined || source === undefined) {
          return fallback(ambientContext, zoneContext);
        }
        const attemptValue = payload === undefined
          ? undefined
          : ownValue(payload, "attempt_index");
        if (
          attemptValue !== undefined &&
          (!Number.isSafeInteger(attemptValue) || (attemptValue as number) < 0)
        ) {
          return fallback(ambientContext, zoneContext);
        }
        return build({
          code: codeValue,
          taxonomyClass: taxonomy,
          capturePoint,
          disposition,
          source,
          zoneContext,
          attemptIndex: attemptValue === undefined ? null : (attemptValue as number),
          fallbackMinimized: false,
          ambientContext,
          templateParameters: validatedParameters.parameters,
        });
      } catch {
        return fallback(ambientContext, true);
      }
    },
  });
}
