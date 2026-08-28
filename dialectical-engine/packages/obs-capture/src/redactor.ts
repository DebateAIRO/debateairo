import { createHash, randomUUID } from "node:crypto";

import type { CaptureQueueEntry } from "./emit.js";
import {
  resolveSafeTemplate,
  resolveTaxonomyClass,
  severity,
  type Severity,
  type TaxonomyClass,
} from "./registry/index.js";

const POST_REDACTION_BRAND: unique symbol = Symbol("POST_REDACTION_ENVELOPE");
const UNKNOWN_DECLARED_KIND = "UNKNOWN:DECLARED_KIND_REQUIRED";

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
  readonly run_ref: typeof UNKNOWN_DECLARED_KIND;
  readonly work_item_ref: typeof UNKNOWN_DECLARED_KIND;
  readonly node_ref: typeof UNKNOWN_DECLARED_KIND;
  readonly attempt_ref: typeof UNKNOWN_DECLARED_KIND;
  readonly ledger_ref: typeof UNKNOWN_DECLARED_KIND;
  readonly parent_occurrence_ref: "NO_CAUSE";
  readonly cause_relation: null;
  readonly at_seq_watermark: typeof UNKNOWN_DECLARED_KIND;
  readonly frames: readonly [];
  readonly safe_template_id: string;
  readonly template_parameters: Readonly<Record<string, never>>;
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
  const component = Object.freeze({
    process: config.component.process,
    package: config.component.package,
  });
  const now = config.now ?? (() => new Date());
  const sourceEventRef = config.sourceEventRef ?? randomUUID;

  function safeNow(): Date {
    try {
      const value = now();
      return Number.isNaN(value.getTime()) ? new Date(0) : value;
    } catch {
      return new Date(0);
    }
  }

  function safeSourceEventRef(): string {
    try {
      const value = sourceEventRef();
      return typeof value === "string" && value.length > 0
        ? value
        : "UNKNOWN:SOURCE_EVENT_REF_UNAVAILABLE";
    } catch {
      return "UNKNOWN:SOURCE_EVENT_REF_UNAVAILABLE";
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
    const safeTaxonomy = template === undefined ? "CAPTURE_SELF" : options.taxonomyClass;
    const fingerprint = createHash("sha256")
      .update(`v1\u0000${safeCode}\u0000${safeTaxonomy}\u0000${config.runtime}\u0000${component.package}`)
      .digest("hex");
    return Object.freeze({
      [POST_REDACTION_BRAND]: true as const,
      occurred_at: safeNow().toISOString(),
      environment: config.environment,
      build_ref: config.build_ref,
      build_dirty: config.build_dirty,
      runtime: config.runtime,
      component,
      capture_point: template === undefined ? "self" : options.capturePoint,
      code: safeCode,
      taxonomy_class: safeTaxonomy,
      severity: severity(safeCode),
      condition_mark: null,
      disposition: template === undefined ? "SELF" : options.disposition,
      fingerprint,
      fingerprint_version: 1 as const,
      redaction_policy_version: config.redaction_policy_version,
      allowlist_set_id: config.allowlist_set_id,
      fallback_minimized: options.fallbackMinimized || template === undefined,
      run_ref: UNKNOWN_DECLARED_KIND,
      work_item_ref: UNKNOWN_DECLARED_KIND,
      node_ref: UNKNOWN_DECLARED_KIND,
      attempt_ref: UNKNOWN_DECLARED_KIND,
      ledger_ref: UNKNOWN_DECLARED_KIND,
      parent_occurrence_ref: "NO_CAUSE" as const,
      cause_relation: null,
      at_seq_watermark: UNKNOWN_DECLARED_KIND,
      frames: Object.freeze([]) as readonly [],
      safe_template_id: safeTemplate.id,
      template_parameters: Object.freeze({}) as Readonly<Record<string, never>>,
      source: template === undefined ? "first_party" : options.source,
      source_event_ref: safeSourceEventRef(),
      zone_context: template === undefined ? false : options.zoneContext,
      attempt_index: template === undefined ? null : options.attemptIndex,
      writer_identity: config.writer_identity,
    });
  }

  function fallback(): PostRedactionEnvelope {
    return build({
      code: "OBS_CAPTURE_SELF",
      taxonomyClass: "CAPTURE_SELF",
      capturePoint: "self",
      disposition: "SELF",
      source: "first_party",
      zoneContext: false,
      attemptIndex: null,
      fallbackMinimized: true,
    });
  }

  return Object.freeze({
    redact(entry: CaptureQueueEntry): PostRedactionEnvelope {
      try {
        let payload: Readonly<Record<string, unknown>> | undefined;
        let codeValue: unknown;
        if (entry.kind === "envelope") {
          if (!isRecord(entry.payload_ref)) {
            return fallback();
          }
          payload = entry.payload_ref;
          if (Object.keys(payload).some((key) => !INPUT_ALLOWLIST.has(key))) {
            return fallback();
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

        if (typeof codeValue !== "string" || resolveSafeTemplate(codeValue) === undefined) {
          return fallback();
        }
        const taxonomyValue = payload === undefined
          ? "ORIGIN_UNKNOWN"
          : (ownValue(payload, "taxonomy_class") ?? "ORIGIN_UNKNOWN");
        const taxonomy = typeof taxonomyValue === "string"
          ? resolveTaxonomyClass(taxonomyValue)?.taxonomy_class
          : undefined;
        if (taxonomy === undefined) {
          return fallback();
        }
        const capturePoint = stringMember<CapturePoint>(
          payload === undefined ? undefined : ownValue(payload, "capture_point"),
          CAPTURE_POINT_SET,
          entry.kind === "handled_error" ? "boundary" : "self",
        );
        const disposition = stringMember<CaptureDisposition>(
          payload === undefined ? undefined : ownValue(payload, "disposition"),
          DISPOSITION_SET,
          entry.kind === "handled_error" ? "HANDLED" : "THROWN",
        );
        const source = stringMember<DurableSource>(
          payload === undefined ? undefined : ownValue(payload, "source"),
          SOURCE_SET,
          "first_party",
        );
        if (capturePoint === undefined || disposition === undefined || source === undefined) {
          return fallback();
        }
        const zoneValue = payload === undefined
          ? undefined
          : ownValue(payload, "zone_context");
        if (zoneValue !== undefined && typeof zoneValue !== "boolean") {
          return fallback();
        }
        const contextZone = entry.ambient_context_ref?.zone_context;
        const zoneContext = zoneValue ?? (typeof contextZone === "boolean" && contextZone);
        const attemptValue = payload === undefined
          ? undefined
          : ownValue(payload, "attempt_index");
        if (
          attemptValue !== undefined &&
          (!Number.isSafeInteger(attemptValue) || (attemptValue as number) < 0)
        ) {
          return fallback();
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
        });
      } catch {
        return fallback();
      }
    },
  });
}
