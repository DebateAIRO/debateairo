import type { ObsContext } from "./context.js";

export const DECLARED_KINDS = Object.freeze([
  "run",
  "work_item",
  "node",
  "attempt",
  "ledger_entry",
  "at_seq",
] as const);

export type LawfulKind = (typeof DECLARED_KINDS)[number];

export const DECLARED_KIND_FIELDS = Object.freeze({
  run: "run_ref",
  work_item: "work_item_ref",
  node: "node_ref",
  attempt: "attempt_ref",
  ledger_entry: "ledger_ref",
  at_seq: "at_seq_watermark",
} as const);

export type DeclaredRefField = (typeof DECLARED_KIND_FIELDS)[LawfulKind];

export interface DeclaredRef<K extends LawfulKind = LawfulKind> {
  readonly kind: K;
  readonly value: string;
}

export interface NotApplicableRef<K extends LawfulKind = LawfulKind> {
  readonly kind: K;
  readonly not_applicable: true;
}

export interface ProjectedDeclaredRefs {
  readonly run_ref: string;
  readonly work_item_ref: string;
  readonly node_ref: string;
  readonly attempt_ref: string;
  readonly ledger_ref: string;
  readonly at_seq_watermark: string;
}

const UNKNOWN_DECLARED_KIND = "UNKNOWN:DECLARED_KIND_REQUIRED";
const NOT_APPLICABLE = "NOT_APPLICABLE";
const DECLARED_KIND_SET: ReadonlySet<string> = new Set(DECLARED_KINDS);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const AT_SEQ_PATTERN = /^[1-9][0-9]*$/u;

const UNKNOWN_REFS: ProjectedDeclaredRefs = Object.freeze({
  run_ref: UNKNOWN_DECLARED_KIND,
  work_item_ref: UNKNOWN_DECLARED_KIND,
  node_ref: UNKNOWN_DECLARED_KIND,
  attempt_ref: UNKNOWN_DECLARED_KIND,
  ledger_ref: UNKNOWN_DECLARED_KIND,
  at_seq_watermark: UNKNOWN_DECLARED_KIND,
});

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

const MISSING_OWN_DATA = Symbol("MISSING_OWN_DATA");
const ACCESSOR_PROPERTY = Symbol("ACCESSOR_PROPERTY");

function ownDataValue(
  record: Readonly<Record<string, unknown>>,
  key: string,
): unknown | typeof MISSING_OWN_DATA | typeof ACCESSOR_PROPERTY {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined) {
    return MISSING_OWN_DATA;
  }
  return Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : ACCESSOR_PROPERTY;
}

function hasValidShape(kind: LawfulKind, value: string): boolean {
  if (kind !== "at_seq") {
    return UUID_PATTERN.test(value);
  }
  if (!AT_SEQ_PATTERN.test(value)) {
    return false;
  }
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence > 0 && String(sequence) === value;
}

function projectField(
  context: Readonly<Record<string, unknown>>,
  field: DeclaredRefField,
  expectedKind: LawfulKind,
): string {
  const declaration = ownDataValue(context, field);
  if (
    declaration === MISSING_OWN_DATA ||
    declaration === ACCESSOR_PROPERTY ||
    !isRecord(declaration)
  ) {
    return UNKNOWN_DECLARED_KIND;
  }
  const kind = ownDataValue(declaration, "kind");
  if (kind === MISSING_OWN_DATA || kind === ACCESSOR_PROPERTY) {
    return UNKNOWN_DECLARED_KIND;
  }
  if (
    typeof kind !== "string" ||
    !DECLARED_KIND_SET.has(kind) ||
    kind !== expectedKind
  ) {
    return UNKNOWN_DECLARED_KIND;
  }

  const value = ownDataValue(declaration, "value");
  const positiveAbsence = ownDataValue(declaration, "not_applicable");
  if (value === ACCESSOR_PROPERTY || positiveAbsence === ACCESSOR_PROPERTY) {
    return UNKNOWN_DECLARED_KIND;
  }
  const hasValue = value !== MISSING_OWN_DATA;
  const hasPositiveAbsence = positiveAbsence !== MISSING_OWN_DATA;
  if (hasValue === hasPositiveAbsence) {
    return UNKNOWN_DECLARED_KIND;
  }
  if (hasPositiveAbsence) {
    return positiveAbsence === true
      ? NOT_APPLICABLE
      : UNKNOWN_DECLARED_KIND;
  }

  return typeof value === "string" && hasValidShape(expectedKind, value)
    ? value
    : UNKNOWN_DECLARED_KIND;
}

export function declaredRef<K extends LawfulKind>(
  kind: K,
  value: string,
): Readonly<DeclaredRef<K>> {
  return Object.freeze({ kind, value });
}

export function notApplicable<K extends LawfulKind>(
  kind: K,
): Readonly<NotApplicableRef<K>> {
  return Object.freeze({ kind, not_applicable: true });
}

export function projectDeclaredRefs(
  context: ObsContext | undefined,
  zoneContext: boolean,
): ProjectedDeclaredRefs {
  try {
    if (!isRecord(context)) {
      return UNKNOWN_REFS;
    }
    const ambientZone = ownDataValue(context, "zone_context");
    if (ambientZone === ACCESSOR_PROPERTY) {
      return UNKNOWN_REFS;
    }
    if (
      ambientZone !== MISSING_OWN_DATA &&
      typeof ambientZone !== "boolean"
    ) {
      return UNKNOWN_REFS;
    }
    if (zoneContext || ambientZone === true) {
      return UNKNOWN_REFS;
    }
    return Object.freeze({
      run_ref: projectField(context, "run_ref", "run"),
      work_item_ref: projectField(context, "work_item_ref", "work_item"),
      node_ref: projectField(context, "node_ref", "node"),
      attempt_ref: projectField(context, "attempt_ref", "attempt"),
      ledger_ref: projectField(context, "ledger_ref", "ledger_entry"),
      at_seq_watermark: projectField(
        context,
        "at_seq_watermark",
        "at_seq",
      ),
    });
  } catch {
    return UNKNOWN_REFS;
  }
}
