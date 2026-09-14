export type OccurrenceSource = "first_party" | "hatchet" | "ui_client";
export type OccurrenceSeverity = "INFO" | "DEGRADED" | "SEVERE" | "FATAL";

export type SkipReason =
  | "SKIP_NON_DEFECT_JOB_LIFECYCLE"
  | "SKIP_DETECTOR_LOCATION_MISSING";

export type PoisonReason =
  | "POISON_UNSAFE_OCC_SEQ"
  | "POISON_INVALID_TIMESTAMP"
  | "POISON_INVALID_COMPONENT"
  | "POISON_INVALID_FRAMES"
  | "POISON_INVALID_SOURCE"
  | "POISON_INVALID_SEVERITY"
  | "POISON_INVALID_IDENTITY";

export interface OccurrenceRecord {
  readonly occurrenceId: string;
  readonly occSeq: number;
  readonly occurredAt: Date;
  readonly capturedAt: Date;
  readonly component: Readonly<Record<string, unknown>>;
  readonly frames: readonly Readonly<Record<string, unknown>>[];
  readonly source: OccurrenceSource;
  readonly severity: OccurrenceSeverity;
  readonly fingerprint: string;
  readonly fingerprintVersion: number;
  readonly sourceEventRef: string;
  readonly taxonomyClass: string;
  readonly code: string;
  readonly capturePoint: string;
  readonly runRef: string;
  readonly workItemRef: string;
}

export type IntakeResult =
  | { readonly kind: "ACCEPT"; readonly occurrence: OccurrenceRecord }
  | { readonly kind: "SKIP"; readonly reason: SkipReason }
  | { readonly kind: "POISON"; readonly reason: PoisonReason };

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isDataOnly(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isDataOnly);
  return isPlainRecord(value) && Object.values(value).every(isDataOnly);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function safePositiveSequence(value: unknown): number | undefined {
  if (typeof value === "string" && /^[1-9][0-9]*$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return value;
  if (typeof value === "bigint" && value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value);
  }
  return undefined;
}

function timestamp(value: unknown): Date | undefined {
  const parsed = value instanceof Date
    ? new Date(value.getTime())
    : typeof value === "string" ? new Date(value) : undefined;
  return parsed !== undefined && Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function freezeDataRecord(value: Record<string, unknown>): Readonly<Record<string, unknown>> {
  return Object.freeze({ ...value });
}

export function decodeOccurrence(row: unknown): IntakeResult {
  if (!isPlainRecord(row)) return { kind: "POISON", reason: "POISON_INVALID_IDENTITY" };
  const occSeq = safePositiveSequence(row.occ_seq);
  if (occSeq === undefined) return { kind: "POISON", reason: "POISON_UNSAFE_OCC_SEQ" };

  const occurredAt = timestamp(row.occurred_at);
  const capturedAt = timestamp(row.captured_at);
  if (occurredAt === undefined || capturedAt === undefined) {
    return { kind: "POISON", reason: "POISON_INVALID_TIMESTAMP" };
  }
  if (!isPlainRecord(row.component) || !isDataOnly(row.component)) {
    return { kind: "POISON", reason: "POISON_INVALID_COMPONENT" };
  }
  if (!Array.isArray(row.frames)
    || !row.frames.every((frame) => isPlainRecord(frame) && isDataOnly(frame))) {
    return { kind: "POISON", reason: "POISON_INVALID_FRAMES" };
  }
  if (row.source !== "first_party" && row.source !== "hatchet" && row.source !== "ui_client") {
    return { kind: "POISON", reason: "POISON_INVALID_SOURCE" };
  }
  if (row.severity !== "INFO" && row.severity !== "DEGRADED"
    && row.severity !== "SEVERE" && row.severity !== "FATAL") {
    return { kind: "POISON", reason: "POISON_INVALID_SEVERITY" };
  }
  if (!nonEmpty(row.occurrence_id) || !nonEmpty(row.fingerprint)
    || !Number.isSafeInteger(row.fingerprint_version) || Number(row.fingerprint_version) <= 0
    || !nonEmpty(row.source_event_ref) || !nonEmpty(row.taxonomy_class)
    || !nonEmpty(row.code) || !nonEmpty(row.capture_point)
    || !nonEmpty(row.run_ref) || !nonEmpty(row.work_item_ref)) {
    return { kind: "POISON", reason: "POISON_INVALID_IDENTITY" };
  }

  if (row.taxonomy_class === "JOB_LIFECYCLE") {
    return { kind: "SKIP", reason: "SKIP_NON_DEFECT_JOB_LIFECYCLE" };
  }
  if (row.capture_point === "detector"
    && (!nonEmpty(row.component.package) || !nonEmpty(row.component.call_site_key))) {
    return { kind: "SKIP", reason: "SKIP_DETECTOR_LOCATION_MISSING" };
  }

  return {
    kind: "ACCEPT",
    occurrence: Object.freeze({
      occurrenceId: row.occurrence_id,
      occSeq,
      occurredAt,
      capturedAt,
      component: freezeDataRecord(row.component),
      frames: Object.freeze(row.frames.map(freezeDataRecord)),
      source: row.source,
      severity: row.severity,
      fingerprint: row.fingerprint,
      fingerprintVersion: Number(row.fingerprint_version),
      sourceEventRef: row.source_event_ref,
      taxonomyClass: row.taxonomy_class,
      code: row.code,
      capturePoint: row.capture_point,
      runRef: row.run_ref,
      workItemRef: row.work_item_ref
    })
  };
}
