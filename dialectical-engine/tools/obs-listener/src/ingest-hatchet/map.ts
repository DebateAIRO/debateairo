export type HatchetFailureStatus = "FAILED" | "CANCELLED";
export type HatchetWorkflowKind = "FUNCTION" | "DURABLE" | "DAG";
export type HatchetIngestCode =
  | "HATCHET_RUN_FAILED"
  | "HATCHET_RUN_CANCELLED"
  | "HATCHET_INGEST_UNREACHABLE"
  | "HATCHET_INGEST_PAGINATION_UNBOUNDABLE";

export interface HatchetOccurrenceInput {
  readonly occurredAt: Date;
  readonly capturedAt: Date;
  readonly environment: string;
  readonly buildRef: string;
  readonly buildDirty: false;
  readonly runtime: "ingest";
  readonly component: Readonly<Record<string, string | number>>;
  readonly capturePoint: "job" | "self";
  readonly code: HatchetIngestCode;
  readonly taxonomyClass: "JOB_FAILURE" | "CAPTURE_SELF";
  readonly severity: "DEGRADED";
  readonly disposition: "RECORDED";
  readonly fingerprint: string;
  readonly fingerprintVersion: 1;
  readonly redactionPolicyVersion: "hatchet-structured-v1";
  readonly allowlistSetId: "hatchet-failed-run-v1";
  readonly fallbackMinimized: false;
  readonly captureStatus: "PERSISTED";
  readonly runRef: string;
  readonly workItemRef: string;
  readonly nodeRef: "NOT_APPLICABLE";
  readonly attemptRef: string;
  readonly ledgerRef: "NOT_APPLICABLE";
  readonly parentOccurrenceRef: "NO_CAUSE";
  readonly atSeqWatermark: "NOT_APPLICABLE";
  readonly frames: readonly [];
  readonly safeTemplateId: string;
  readonly templateParameters: Readonly<Record<string, string | number>>;
  readonly source: "hatchet";
  readonly sourceEventRef: string;
  readonly zoneContext: false;
  readonly attemptIndex: number;
  readonly writerIdentity: "hatchet-ingest";
}

export interface HatchetMapContext {
  readonly observedAt: Date;
  readonly environment: string;
  readonly buildRef: string;
}

const CANONICAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const FAILURE_STATUSES = new Set<HatchetFailureStatus>(["FAILED", "CANCELLED"]);
const WORKFLOW_KINDS = new Set<HatchetWorkflowKind>(["FUNCTION", "DURABLE", "DAG"]);
const COUNT_KEYS = Object.freeze([
  "jobCount",
  "failedJobCount",
  "cancelledJobCount",
  "stepCount",
  "failedStepCount",
  "cancelledStepCount"
] as const);

function plainRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validDate(value: unknown): Date | undefined {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : undefined;
}

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function countsFrom(value: unknown): Readonly<Record<typeof COUNT_KEYS[number], number>> | undefined {
  if (!plainRecord(value)) return undefined;
  const entries: [typeof COUNT_KEYS[number], number][] = [];
  for (const key of COUNT_KEYS) {
    const count = value[key];
    if (!Number.isSafeInteger(count) || Number(count) < 0) return undefined;
    entries.push([key, Number(count)]);
  }
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<typeof COUNT_KEYS[number], number>>;
}

function baseOccurrence(
  context: HatchetMapContext,
  occurredAt: Date,
  component: Readonly<Record<string, string | number>>,
  input: Readonly<{
    capturePoint: "job" | "self";
    code: HatchetIngestCode;
    taxonomyClass: "JOB_FAILURE" | "CAPTURE_SELF";
    fingerprint: string;
    runRef: string;
    workItemRef: string;
    attempt: number;
    sourceEventRef: string;
    templateParameters: Readonly<Record<string, string | number>>;
  }>
): HatchetOccurrenceInput {
  return Object.freeze({
    occurredAt: new Date(occurredAt.getTime()),
    capturedAt: new Date(context.observedAt.getTime()),
    environment: context.environment,
    buildRef: context.buildRef,
    buildDirty: false,
    runtime: "ingest",
    component,
    capturePoint: input.capturePoint,
    code: input.code,
    taxonomyClass: input.taxonomyClass,
    severity: "DEGRADED",
    disposition: "RECORDED",
    fingerprint: input.fingerprint,
    fingerprintVersion: 1,
    redactionPolicyVersion: "hatchet-structured-v1",
    allowlistSetId: "hatchet-failed-run-v1",
    fallbackMinimized: false,
    captureStatus: "PERSISTED",
    runRef: input.runRef,
    workItemRef: input.workItemRef,
    nodeRef: "NOT_APPLICABLE",
    attemptRef: String(input.attempt),
    ledgerRef: "NOT_APPLICABLE",
    parentOccurrenceRef: "NO_CAUSE",
    atSeqWatermark: "NOT_APPLICABLE",
    frames: Object.freeze([] as const),
    safeTemplateId: `tpl.${input.code}`,
    templateParameters: input.templateParameters,
    source: "hatchet",
    sourceEventRef: input.sourceEventRef,
    zoneContext: false,
    attemptIndex: input.attempt,
    writerIdentity: "hatchet-ingest"
  });
}

export function mapHatchetFailure(
  value: unknown,
  context: HatchetMapContext
): HatchetOccurrenceInput | null {
  if (!plainRecord(value) || !plainRecord(value.metadata)
    || !plainRecord(value.additionalMetadata)) return null;
  const runId = value.metadata.id;
  const status = value.status;
  const kind = value.kind;
  const attempt = value.attempt;
  const runRef = value.additionalMetadata.v3RunId;
  const workItemRef = value.additionalMetadata.v3WorkItemId;
  const occurredAt = validDate(value.finishedAt);
  const counts = countsFrom(value.counts);
  if (typeof runId !== "string" || !CANONICAL_UUID.test(runId)
    || typeof status !== "string" || !FAILURE_STATUSES.has(status as HatchetFailureStatus)
    || typeof kind !== "string" || !WORKFLOW_KINDS.has(kind as HatchetWorkflowKind)
    || !Number.isSafeInteger(attempt) || Number(attempt) < 1
    || typeof runRef !== "string" || !CANONICAL_UUID.test(runRef)
    || typeof workItemRef !== "string" || !CANONICAL_UUID.test(workItemRef)
    || occurredAt === undefined || counts === undefined
    || !Number.isFinite(context.observedAt.getTime())
    || !nonEmpty(context.environment) || !nonEmpty(context.buildRef)) return null;

  const typedStatus = status as HatchetFailureStatus;
  const typedKind = kind as HatchetWorkflowKind;
  const typedAttempt = Number(attempt);
  const structured = Object.freeze({
    status: typedStatus,
    kind: typedKind,
    attempt: typedAttempt,
    job_count: counts.jobCount,
    failed_job_count: counts.failedJobCount,
    cancelled_job_count: counts.cancelledJobCount,
    step_count: counts.stepCount,
    failed_step_count: counts.failedStepCount,
    cancelled_step_count: counts.cancelledStepCount
  });
  const component = Object.freeze({ package: "hatchet", call_site_key: "runs.list", ...structured });
  const code = typedStatus === "FAILED" ? "HATCHET_RUN_FAILED" : "HATCHET_RUN_CANCELLED";
  return baseOccurrence(context, occurredAt, component, {
    capturePoint: "job",
    code,
    taxonomyClass: "JOB_FAILURE",
    fingerprint: `hatchet:JOB_FAILURE:${typedKind}`,
    runRef,
    workItemRef,
    attempt: typedAttempt,
    sourceEventRef: `hatchet:${runId}:${typedAttempt}`,
    templateParameters: structured
  });
}

export function mapHatchetSelfOccurrence(
  code: "HATCHET_INGEST_UNREACHABLE" | "HATCHET_INGEST_PAGINATION_UNBOUNDABLE",
  context: HatchetMapContext
): HatchetOccurrenceInput {
  if (!Number.isFinite(context.observedAt.getTime())
    || !nonEmpty(context.environment) || !nonEmpty(context.buildRef)) {
    throw new TypeError("HATCHET_INGEST_CONTEXT_INVALID");
  }
  const component = Object.freeze({ package: "hatchet", call_site_key: "runs.list" });
  const templateParameters = Object.freeze({ code });
  return baseOccurrence(context, context.observedAt, component, {
    capturePoint: "self",
    code,
    taxonomyClass: "CAPTURE_SELF",
    fingerprint: `hatchet:CAPTURE_SELF:${code}`,
    runRef: "NOT_APPLICABLE",
    workItemRef: "NOT_APPLICABLE",
    attempt: 0,
    sourceEventRef: `hatchet:self:${context.observedAt.toISOString()}:${code}`,
    templateParameters
  });
}
