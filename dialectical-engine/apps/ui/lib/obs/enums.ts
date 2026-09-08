export const CLIENT_REPORT_CODES = Object.freeze([
  "OBS_CAPTURE_SELF",
  "SCORING_OPERATOR_UNRESOLVED",
] as const);
export const CLIENT_REPORT_COMPONENTS = Object.freeze([
  "ui-app",
  "ui-scoring",
] as const);
export const CLIENT_REPORT_ROUTE_TEMPLATES = Object.freeze([
  "/",
  "/:segment",
  "/debate/:id",
] as const);
export const CLIENT_REPORT_KINDS = Object.freeze([
  "error_boundary",
  "global_error_boundary",
  "scoring_error_boundary",
  "window_error",
  "unhandled_rejection",
] as const);

export type ClientReportCode = (typeof CLIENT_REPORT_CODES)[number];
export type ClientReportComponent = (typeof CLIENT_REPORT_COMPONENTS)[number];
export type ClientReportRouteTemplate = (typeof CLIENT_REPORT_ROUTE_TEMPLATES)[number];
export type ClientReportKind = (typeof CLIENT_REPORT_KINDS)[number];

export interface ClientReportPayload {
  readonly code: ClientReportCode;
  readonly component: ClientReportComponent;
  readonly route_template: ClientReportRouteTemplate;
  readonly kind: ClientReportKind;
  readonly build_ref?: string;
}

export interface ClientReportBundle {
  readonly schema: "debateai.client-report-enums.v1";
  readonly build_ref: string;
  readonly codes: readonly string[];
  readonly components: readonly string[];
  readonly route_templates: readonly string[];
  readonly kinds: readonly string[];
}

const CODE_SET: ReadonlySet<string> = new Set(CLIENT_REPORT_CODES);
const COMPONENT_SET: ReadonlySet<string> = new Set(CLIENT_REPORT_COMPONENTS);
const ROUTE_SET: ReadonlySet<string> = new Set(CLIENT_REPORT_ROUTE_TEMPLATES);
const KIND_SET: ReadonlySet<string> = new Set(CLIENT_REPORT_KINDS);
const PAYLOAD_KEYS: ReadonlySet<string> = new Set([
  "code", "component", "route_template", "kind", "build_ref",
]);
const BUNDLE_KEYS: ReadonlySet<string> = new Set([
  "schema", "build_ref", "codes", "components", "route_templates", "kinds",
]);
const BUILD_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,191}$/u;

function plainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function dataValue(record: Readonly<Record<string, unknown>>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor !== undefined && Object.hasOwn(descriptor, "value")
    ? descriptor.value
    : undefined;
}

function exactKeys(record: Readonly<Record<string, unknown>>, allowed: ReadonlySet<string>): boolean {
  const keys = Object.keys(record);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function stringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.length > 0
    && value.every((member) => typeof member === "string");
}

export function isClientReportPayload(value: unknown): value is ClientReportPayload {
  if (!plainRecord(value)) return false;
  const keys = Object.keys(value);
  const hasBuildRef = keys.includes("build_ref");
  if (keys.length !== (hasBuildRef ? 5 : 4) || !keys.every((key) => PAYLOAD_KEYS.has(key))) {
    return false;
  }
  const buildRef = dataValue(value, "build_ref");
  return CODE_SET.has(String(dataValue(value, "code")))
    && COMPONENT_SET.has(String(dataValue(value, "component")))
    && ROUTE_SET.has(String(dataValue(value, "route_template")))
    && KIND_SET.has(String(dataValue(value, "kind")))
    && (!hasBuildRef || (typeof buildRef === "string" && BUILD_REF.test(buildRef)));
}

export function isClientReportBundle(value: unknown): value is ClientReportBundle {
  if (!plainRecord(value) || !exactKeys(value, BUNDLE_KEYS)) return false;
  const buildRef = dataValue(value, "build_ref");
  const codes = dataValue(value, "codes");
  const components = dataValue(value, "components");
  const routeTemplates = dataValue(value, "route_templates");
  const kinds = dataValue(value, "kinds");
  return dataValue(value, "schema") === "debateai.client-report-enums.v1"
    && typeof buildRef === "string" && BUILD_REF.test(buildRef)
    && stringArray(codes) && CLIENT_REPORT_CODES.every((member) => codes.includes(member))
    && stringArray(components) && CLIENT_REPORT_COMPONENTS.every((member) => components.includes(member))
    && stringArray(routeTemplates) && CLIENT_REPORT_ROUTE_TEMPLATES.every((member) => routeTemplates.includes(member))
    && stringArray(kinds) && CLIENT_REPORT_KINDS.every((member) => kinds.includes(member));
}
