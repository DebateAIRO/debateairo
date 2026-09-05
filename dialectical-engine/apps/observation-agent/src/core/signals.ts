import { z } from "zod";
import {
  OBSERVATION_COMPONENTS,
  SIGNAL_CLASSES,
  type SignalClass
} from "./types.js";

export const SEVERITIES = Object.freeze(["INFO", "DEGRADED", "SEVERE", "FATAL"] as const);
export const IMPACT_CODES = Object.freeze([
  "IMPACT_PG_DOWN", "IMPACT_PG_CAPACITY", "IMPACT_PG_LOCKS", "IMPACT_PG_LONG_XACT",
  "IMPACT_DOCKER_DOWN", "IMPACT_HATCHET_DOWN", "IMPACT_HATCHET_NOT_READY",
  "IMPACT_HATCHET_QUEUE", "IMPACT_HATCHET_FAILED_TASKS", "IMPACT_HATCHET_DISPATCH_SLOW",
  "IMPACT_WORKER_LOST", "IMPACT_STALL", "IMPACT_QUEUE", "IMPACT_NO_PROGRESS",
  "IMPACT_SUSPICIOUS_SUCCESS", "IMPACT_API_DOWN", "IMPACT_UI_DOWN", "IMPACT_TLS_DOWN",
  "IMPACT_DEV_STACK_EXITED", "IMPACT_DEV_STACK_NOT_RUNNING", "IMPACT_RUNNER_GONE",
  "IMPACT_SLOW", "IMPACT_BLIND", "IMPACT_CAPTURE_GAP", "IMPACT_CAPTURE_NOT_WIRED",
  "IMPACT_SPOOL_STRANDED", "IMPACT_DISK", "IMPACT_MEMORY", "IMPACT_LOAD", "IMPACT_PROVIDER",
  "IMPACT_RUN_FAILURE", "IMPACT_CERT", "IMPACT_SCHEDULE_MISSED", "IMPACT_RESTART",
  "IMPACT_EXPECTED_ABSENT", "IMPACT_THRESHOLDS", "IMPACT_AGENT_START",
  "IMPACT_AGENT_STOP", "IMPACT_AGENT_JOURNAL", "IMPACT_AGENT_DELIVERY", "IMPACT_CLEARED"
] as const);

export type Severity = typeof SEVERITIES[number];
export type ImpactCode = typeof IMPACT_CODES[number];

const safeTarget = z.string().min(1).max(512).regex(/^[A-Za-z0-9_.:/-]+$/u);
const safeToken = z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:@/-]+$/u);
const finiteNonnegative = z.number().finite().nonnegative();
const finitePositive = z.number().finite().positive();
const nonnegativeInteger = z.number().int().nonnegative();
const positiveInteger = z.number().int().positive();
const timestamp = z.iso.datetime();
const health = z.enum([
  "UNKNOWN", "UP", "DOWN", "HEALTHY", "FRESH", "STALE", "NOT_WIRED",
  "WIRED_CURRENT", "WIRED_SILENT"
]);
const livenessEvidenceSchema = z.object({
  probe: z.enum([
    "tcp+select1", "http_get", "docker_info", "docker_inspect", "heartbeat_write",
    "process_presence", "expected_set"
  ]),
  target: safeTarget.optional(),
  members: z.array(z.enum(OBSERVATION_COMPONENTS)).min(1).max(17).optional(),
  consecutive_failures: nonnegativeInteger.optional(),
  threshold: positiveInteger.optional(),
  last_status: z.union([
    z.number().int(),
    z.enum([
      "READY", "FAILED", "UNKNOWN", "WRITTEN", "TLS_TRUST", "PRESENT", "ABSENT",
      "NOT_RUNNING"
    ])
  ]).optional(),
  container_status: z.enum(["created", "running", "paused", "restarting", "exited", "dead", "UNKNOWN"]).optional(),
  restart_policy: z.enum(["no", "always", "unless-stopped", "on-failure", "UNKNOWN"]).optional(),
  exit_code: z.number().int().optional(),
  duration_seconds: finiteNonnegative.optional()
}).strict();

const agentStartEvidenceSchema = z.object({
  reason: z.literal("START"),
  previous_exit_reason: z.enum(["CLEAN", "UNCLEAN", "UNKNOWN"]).optional()
}).strict();

const agentStopEvidenceSchema = z.object({ reason: z.literal("STOP") }).strict();
const agentJournalEvidenceSchema = z.object({ reason: z.literal("JOURNAL_FAILURE") }).strict();
const agentDeliveryEvidenceSchema = z.object({
  reason: z.literal("DELIVERY_FAILURE"),
  channel: z.enum(["osascript", "sendmail", "kanban"])
}).strict();

const thresholdEvidenceSchema = z.object({
  previous_version: positiveInteger,
  current_version: positiveInteger
}).strict();

const restartEvidenceSchema = z.object({
  old_started_at: timestamp,
  new_started_at: timestamp,
  restart_count: nonnegativeInteger.optional(),
  restart_policy: z.enum(["no", "always", "unless-stopped", "on-failure", "UNKNOWN"]).optional(),
  exit_code: z.number().int().optional()
}).strict();

const expectedAbsentEvidenceSchema = z.object({
  expected: z.literal("always"),
  absent_for_s: finiteNonnegative,
  first_observed_at: timestamp.optional()
}).strict();

const latencyEvidenceSchema = z.object({
  metric_key: safeToken.optional(),
  p95_ms: finiteNonnegative,
  threshold_ms: finitePositive,
  window_minutes: finitePositive.optional(),
  observed_at: timestamp.optional()
}).strict();

const scheduleEvidenceSchema = z.object({
  job: z.enum(["liveness-sweep", "settlement-watch", "replay-self-test"]),
  cadence_s: finitePositive,
  grace_s: finiteNonnegative,
  last_completed_at: timestamp.nullable().optional()
}).strict();

const workerEvidenceSchema = z.object({
  worker_ref: safeToken,
  heartbeat_age_s: finiteNonnegative,
  heartbeat_threshold_s: finitePositive,
  health,
  observed_at: timestamp.optional(),
  reason: z.literal("HATCHET_READ_UNAVAILABLE").optional()
}).strict();

const stallEvidenceSchema = z.object({
  count: positiveInteger,
  state: z.enum(["CLAIMED", "RUNNING", "PENDING"]),
  claim_deadline: timestamp,
  grace_s: finiteNonnegative,
  health
}).strict();

const queueEvidenceSchema = z.object({
  state: z.literal("READY"),
  ready_age_s: finiteNonnegative,
  ready_threshold_s: finitePositive,
  health
}).strict();

const progressEvidenceSchema = z.object({
  count: positiveInteger,
  last_progress_seq: nonnegativeInteger,
  silence_s: finiteNonnegative,
  silence_threshold_s: finitePositive,
  health
}).strict();

const artifactEvidenceSchema = z.object({
  count: positiveInteger,
  state: z.literal("DONE"),
  artifact_present: z.literal(false),
  health
}).strict();

const blindEvidenceSchema = z.object({
  runtime: safeToken,
  last_flush_ok_at: timestamp.nullable(),
  silence_s: finiteNonnegative,
  threshold_s: finitePositive,
  health
}).strict();

const captureGapEvidenceSchema = z.object({
  runtime: safeToken.optional(),
  source: safeToken,
  gap_class: safeToken,
  lost_count: nonnegativeInteger,
  opened_at: timestamp,
  closed_at: timestamp.nullable()
}).strict();

const captureNotWiredEvidenceSchema = z.object({
  runtime: safeToken,
  flush_ok_count: z.literal(0),
  health: z.literal("NOT_WIRED")
}).strict();

const spoolEvidenceSchema = z.object({
  runtime: safeToken,
  spool_ref: z.string().max(256).regex(
    /^[A-Za-z0-9_.-]+-[0-9]+-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.spool$/u
  ),
  spool_age_s: finiteNonnegative,
  threshold_s: finitePositive,
  receipt_present: z.boolean(),
  count: positiveInteger.optional()
}).strict();

const capacityCountEvidenceSchema = z.object({
  count: finiteNonnegative,
  limit: finitePositive,
  percent: finiteNonnegative,
  threshold_percent: finiteNonnegative,
  unit: z.enum(["connections", "sessions"]),
  observed_at: timestamp.optional()
}).strict();

const postgresCapacityEvidenceSchema = z.object({
  used: finiteNonnegative,
  max: finitePositive,
  percent: finiteNonnegative,
  threshold_percent: finiteNonnegative,
  unit: z.literal("connections"),
  observed_at: timestamp.optional()
}).strict();

const capacityDurationEvidenceSchema = z.object({
  count: finiteNonnegative.optional(),
  duration_seconds: finiteNonnegative,
  threshold_seconds: finitePositive,
  unit: z.enum(["seconds", "sessions"]),
  observed_at: timestamp.optional()
}).strict();

const capacityPercentEvidenceSchema = z.object({
  percent: finiteNonnegative,
  threshold_percent: finiteNonnegative,
  free_bytes: finiteNonnegative.optional(),
  available_bytes: finiteNonnegative.optional(),
  total_bytes: finitePositive,
  unit: z.literal("bytes"),
  observed_at: timestamp.optional()
}).strict();

const loadEvidenceSchema = z.object({
  load_one_minute: finiteNonnegative,
  logical_cores: positiveInteger,
  threshold_multiplier: finitePositive,
  sustained_seconds: finiteNonnegative,
  observed_at: timestamp
}).strict();

const certificateEvidenceSchema = z.object({
  days: z.number().finite(),
  threshold_days: finiteNonnegative,
  not_after: timestamp,
  unit: z.literal("days")
}).strict();

const hatchetQueueEvidenceSchema = z.object({
  metric_key: safeToken.optional(),
  count: nonnegativeInteger,
  threshold: finiteNonnegative.optional(),
  duration_seconds: finiteNonnegative,
  window_minutes: finitePositive.optional(),
  source: z.enum(["REST", "PROMETHEUS"]).optional(),
  observed_at: timestamp.optional()
}).strict();

const failedTaskEvidenceSchema = z.object({
  metric_key: safeToken.optional(),
  failed: nonnegativeInteger,
  total: nonnegativeInteger.optional(),
  threshold: finiteNonnegative.optional(),
  window_minutes: finitePositive,
  source: z.enum(["REST", "PROMETHEUS"]).optional(),
  window_started_at: timestamp.optional(),
  window_ended_at: timestamp.optional()
}).strict();

const dispatchEvidenceSchema = z.object({
  metric_key: safeToken.optional(),
  p95_seconds: finiteNonnegative,
  threshold_seconds: finitePositive.optional(),
  quantile: z.number().finite().min(0).max(1).optional(),
  window_minutes: finitePositive,
  source: z.enum(["REST", "PROMETHEUS"]).optional(),
  observed_at: timestamp.optional()
}).strict();

const runFailureEvidenceSchema = z.object({
  failed: nonnegativeInteger,
  total: positiveInteger,
  ratio: z.number().finite().min(0).max(1),
  threshold_ratio: z.number().finite().min(0).max(1),
  window_minutes: finitePositive,
  window_started_at: timestamp.optional(),
  window_ended_at: timestamp.optional()
}).strict();

const providerEvidenceSchema = z.object({
  provider_ref: safeToken,
  failed: nonnegativeInteger,
  total: positiveInteger,
  count: positiveInteger.optional(),
  ratio: z.number().finite().min(0).max(1),
  percent: z.number().finite().min(0).max(100).optional(),
  window_minutes: finitePositive.optional(),
  window_started_at: timestamp,
  window_ended_at: timestamp,
  source: z.enum(["SAFE_VIEW", "REST"]).optional()
}).strict();

const clearedEvidenceSchema = z.object({
  duration_seconds: finiteNonnegative.optional(),
  probe: z.enum([
    "tcp+select1", "http_get", "docker_info", "docker_inspect", "heartbeat_write",
    "process_presence", "expected_set"
  ]).optional(),
  target: safeTarget.optional(),
  members: z.array(z.enum(OBSERVATION_COMPONENTS)).min(1).max(17).optional(),
  consecutive_failures: nonnegativeInteger.optional(),
  threshold: positiveInteger.optional(),
  last_status: z.union([z.number().int(), z.enum([
    "READY", "FAILED", "UNKNOWN", "WRITTEN", "TLS_TRUST", "PRESENT", "ABSENT",
    "NOT_RUNNING"
  ])]).optional(),
  container_status: z.enum(["created", "running", "paused", "restarting", "exited", "dead", "UNKNOWN"]).optional(),
  restart_policy: z.enum(["no", "always", "unless-stopped", "on-failure", "UNKNOWN"]).optional(),
  exit_code: z.number().int().optional()
}).strict();

type EvidenceValidator = Readonly<{ safeParse(input: unknown): Readonly<{ success: boolean }> }>;

function cleared(
  schema: Readonly<{ partial(): Readonly<{ extend(shape: Readonly<{ duration_seconds: typeof finiteNonnegative }>): EvidenceValidator }> }>
): EvidenceValidator {
  return schema.partial().extend({ duration_seconds: finiteNonnegative });
}

function oneOf(...validators: readonly EvidenceValidator[]): EvidenceValidator {
  return Object.freeze({
    safeParse(input: unknown): Readonly<{ success: boolean }> {
      return Object.freeze({ success: validators.some((validator) => validator.safeParse(input).success) });
    }
  });
}

const clearedEvidenceByClass = {
  INFRA_DOWN: clearedEvidenceSchema,
  INFRA_NOT_READY: clearedEvidenceSchema,
  INFRA_UNKNOWN: clearedEvidenceSchema,
  WORKER_LOST: cleared(workerEvidenceSchema),
  STALL: cleared(stallEvidenceSchema),
  QUEUE_NOT_DRAINING: cleared(queueEvidenceSchema),
  NO_PROGRESS: cleared(progressEvidenceSchema),
  SUSPICIOUS_SUCCESS: cleared(artifactEvidenceSchema),
  BLIND_PERIOD: cleared(blindEvidenceSchema),
  CAPTURE_GAP: cleared(captureGapEvidenceSchema),
  CAPTURE_NOT_WIRED: cleared(captureNotWiredEvidenceSchema),
  SPOOL_STRANDED: cleared(spoolEvidenceSchema),
  CAPACITY: oneOf(
    cleared(capacityCountEvidenceSchema),
    cleared(capacityDurationEvidenceSchema),
    cleared(capacityPercentEvidenceSchema),
    cleared(loadEvidenceSchema)
  ),
  THROUGHPUT_ANOMALY: oneOf(
    cleared(latencyEvidenceSchema),
    cleared(hatchetQueueEvidenceSchema),
    cleared(failedTaskEvidenceSchema),
    cleared(dispatchEvidenceSchema),
    cleared(runFailureEvidenceSchema)
  ),
  PROVIDER_DEGRADED: cleared(providerEvidenceSchema),
  RESTART_WITNESSED: cleared(restartEvidenceSchema),
  EXPECTED_ABSENT: cleared(expectedAbsentEvidenceSchema),
  CERT_EXPIRY: cleared(certificateEvidenceSchema),
  SCHEDULE_MISSED: cleared(scheduleEvidenceSchema),
  THRESHOLD_CHANGED: z.never(),
  AGENT_SELF: z.never()
} satisfies Readonly<Record<SignalClass, EvidenceValidator>>;

const evidenceByImpact = {
  IMPACT_PG_DOWN: livenessEvidenceSchema,
  IMPACT_PG_CAPACITY: postgresCapacityEvidenceSchema,
  IMPACT_PG_LOCKS: capacityDurationEvidenceSchema,
  IMPACT_PG_LONG_XACT: capacityDurationEvidenceSchema,
  IMPACT_DOCKER_DOWN: livenessEvidenceSchema,
  IMPACT_HATCHET_DOWN: livenessEvidenceSchema,
  IMPACT_HATCHET_NOT_READY: livenessEvidenceSchema,
  IMPACT_HATCHET_QUEUE: hatchetQueueEvidenceSchema,
  IMPACT_HATCHET_FAILED_TASKS: failedTaskEvidenceSchema,
  IMPACT_HATCHET_DISPATCH_SLOW: dispatchEvidenceSchema,
  IMPACT_WORKER_LOST: workerEvidenceSchema,
  IMPACT_STALL: stallEvidenceSchema,
  IMPACT_QUEUE: queueEvidenceSchema,
  IMPACT_NO_PROGRESS: progressEvidenceSchema,
  IMPACT_SUSPICIOUS_SUCCESS: artifactEvidenceSchema,
  IMPACT_API_DOWN: livenessEvidenceSchema,
  IMPACT_UI_DOWN: livenessEvidenceSchema,
  IMPACT_TLS_DOWN: livenessEvidenceSchema,
  IMPACT_DEV_STACK_EXITED: livenessEvidenceSchema,
  IMPACT_DEV_STACK_NOT_RUNNING: livenessEvidenceSchema,
  IMPACT_RUNNER_GONE: livenessEvidenceSchema,
  IMPACT_SLOW: latencyEvidenceSchema,
  IMPACT_BLIND: blindEvidenceSchema,
  IMPACT_CAPTURE_GAP: captureGapEvidenceSchema,
  IMPACT_CAPTURE_NOT_WIRED: captureNotWiredEvidenceSchema,
  IMPACT_SPOOL_STRANDED: spoolEvidenceSchema,
  IMPACT_DISK: capacityPercentEvidenceSchema,
  IMPACT_MEMORY: capacityPercentEvidenceSchema,
  IMPACT_LOAD: loadEvidenceSchema,
  IMPACT_PROVIDER: providerEvidenceSchema,
  IMPACT_RUN_FAILURE: runFailureEvidenceSchema,
  IMPACT_CERT: certificateEvidenceSchema,
  IMPACT_SCHEDULE_MISSED: scheduleEvidenceSchema,
  IMPACT_RESTART: restartEvidenceSchema,
  IMPACT_EXPECTED_ABSENT: expectedAbsentEvidenceSchema,
  IMPACT_THRESHOLDS: thresholdEvidenceSchema,
  IMPACT_AGENT_START: agentStartEvidenceSchema,
  IMPACT_AGENT_STOP: agentStopEvidenceSchema,
  IMPACT_AGENT_JOURNAL: agentJournalEvidenceSchema,
  IMPACT_AGENT_DELIVERY: agentDeliveryEvidenceSchema,
  IMPACT_CLEARED: clearedEvidenceSchema
} satisfies Readonly<Record<ImpactCode, EvidenceValidator>>;

const impactsByClass = {
  INFRA_DOWN: [
    "IMPACT_PG_DOWN", "IMPACT_HATCHET_DOWN", "IMPACT_API_DOWN", "IMPACT_UI_DOWN",
    "IMPACT_TLS_DOWN", "IMPACT_DEV_STACK_EXITED", "IMPACT_DEV_STACK_NOT_RUNNING",
    "IMPACT_RUNNER_GONE", "IMPACT_DOCKER_DOWN", "IMPACT_CLEARED"
  ],
  INFRA_NOT_READY: ["IMPACT_HATCHET_NOT_READY", "IMPACT_CLEARED"],
  INFRA_UNKNOWN: ["IMPACT_DOCKER_DOWN", "IMPACT_CLEARED"],
  WORKER_LOST: ["IMPACT_WORKER_LOST", "IMPACT_CLEARED"],
  STALL: ["IMPACT_STALL", "IMPACT_CLEARED"],
  QUEUE_NOT_DRAINING: ["IMPACT_QUEUE", "IMPACT_CLEARED"],
  NO_PROGRESS: ["IMPACT_NO_PROGRESS", "IMPACT_CLEARED"],
  SUSPICIOUS_SUCCESS: ["IMPACT_SUSPICIOUS_SUCCESS", "IMPACT_CLEARED"],
  BLIND_PERIOD: ["IMPACT_BLIND", "IMPACT_CLEARED"],
  CAPTURE_GAP: ["IMPACT_CAPTURE_GAP", "IMPACT_CLEARED"],
  CAPTURE_NOT_WIRED: ["IMPACT_CAPTURE_NOT_WIRED", "IMPACT_CLEARED"],
  SPOOL_STRANDED: ["IMPACT_SPOOL_STRANDED", "IMPACT_CLEARED"],
  CAPACITY: [
    "IMPACT_PG_CAPACITY", "IMPACT_PG_LOCKS", "IMPACT_PG_LONG_XACT", "IMPACT_DISK",
    "IMPACT_MEMORY", "IMPACT_LOAD", "IMPACT_CLEARED"
  ],
  THROUGHPUT_ANOMALY: [
    "IMPACT_HATCHET_QUEUE", "IMPACT_HATCHET_FAILED_TASKS", "IMPACT_HATCHET_DISPATCH_SLOW",
    "IMPACT_RUN_FAILURE", "IMPACT_SLOW", "IMPACT_CLEARED"
  ],
  PROVIDER_DEGRADED: ["IMPACT_PROVIDER", "IMPACT_CLEARED"],
  RESTART_WITNESSED: ["IMPACT_RESTART", "IMPACT_CLEARED"],
  EXPECTED_ABSENT: ["IMPACT_EXPECTED_ABSENT", "IMPACT_CLEARED"],
  CERT_EXPIRY: ["IMPACT_CERT", "IMPACT_CLEARED"],
  SCHEDULE_MISSED: ["IMPACT_SCHEDULE_MISSED", "IMPACT_CLEARED"],
  THRESHOLD_CHANGED: ["IMPACT_THRESHOLDS"],
  AGENT_SELF: [
    "IMPACT_AGENT_START", "IMPACT_AGENT_STOP", "IMPACT_AGENT_JOURNAL",
    "IMPACT_AGENT_DELIVERY"
  ]
} as const satisfies Readonly<Record<SignalClass, readonly ImpactCode[]>>;

const signalBaseSchema = z.object({
  seq: z.number().int().positive(),
  signal_id: z.uuid(),
  state: z.enum(["OPEN", "CLEARED"]),
  class: z.enum(SIGNAL_CLASSES),
  component: z.enum(OBSERVATION_COMPONENTS),
  severity: z.enum(SEVERITIES),
  impact_code: z.enum(IMPACT_CODES),
  first_failed_probe_at: z.iso.datetime().nullable(),
  detected_at: z.iso.datetime(),
  evidence: z.unknown(),
  suspected_defect: z.boolean(),
  defect_kind: z.enum(["STALL_DETECTED", "SILENT_NOOP", "SUSPICIOUS_SUCCESS"]).nullable(),
  run_ref: z.uuid().nullable(),
  work_item_ref: z.uuid().nullable(),
  threshold_version: z.number().int().positive(),
  clears_signal_id: z.uuid().nullable(),
  recorded_at: z.iso.datetime()
}).strict();

export const signalSchema = signalBaseSchema.superRefine((signal, context) => {
  const impactAllowed = (impactsByClass[signal.class] as readonly ImpactCode[])
    .includes(signal.impact_code);
  const evidenceResult = (signal.impact_code === "IMPACT_CLEARED"
    ? clearedEvidenceByClass[signal.class]
    : evidenceByImpact[signal.impact_code]).safeParse(signal.evidence);
  if (!impactAllowed || !evidenceResult.success) {
    context.addIssue({ code: "custom", message: "OBSERVATION_EVIDENCE_INVALID", path: ["evidence"] });
  }
  if ((signal.suspected_defect && signal.defect_kind === null)
    || (!signal.suspected_defect && signal.defect_kind !== null)) {
    context.addIssue({ code: "custom", message: "OBSERVATION_DEFECT_KIND_INVALID", path: ["defect_kind"] });
  }
  if (signal.impact_code === "IMPACT_AGENT_DELIVERY" && signal.suspected_defect) {
    context.addIssue({ code: "custom", message: "OBSERVATION_DEFECT_KIND_INVALID", path: ["suspected_defect"] });
  }
  if ((signal.state === "OPEN" && signal.clears_signal_id !== null)
    || (signal.state === "CLEARED" && signal.clears_signal_id === null)) {
    context.addIssue({ code: "custom", message: "OBSERVATION_CLEAR_LINK_INVALID", path: ["clears_signal_id"] });
  }
});

export type ObservationSignal = z.infer<typeof signalSchema>;

export const deliverySchema = z.object({
  delivery_id: z.uuid(),
  signal_id: z.uuid(),
  channel: z.enum(["osascript", "sendmail", "kanban"]),
  attempted_at: z.iso.datetime(),
  delivered_at: z.iso.datetime().nullable(),
  outcome: z.enum(["DELIVERED", "FAILED", "MUTED", "RATE_LIMITED"]),
  external_ref: z.string().min(1).nullable()
}).strict();

export type ObservationDelivery = z.infer<typeof deliverySchema>;

export const deliveryAttemptEnvelopeSchema = z.object({
  kind: z.literal("ATTEMPT"),
  delivery_id: z.uuid(),
  signal_id: z.uuid(),
  channel: z.enum(["osascript", "sendmail", "kanban"]),
  attempted_at: z.iso.datetime()
}).strict();

export const deliveryResultEnvelopeSchema = z.object({
  kind: z.literal("RESULT"),
  delivery: deliverySchema
}).strict();

export const deliveryJournalEnvelopeSchema = z.discriminatedUnion("kind", [
  deliveryAttemptEnvelopeSchema,
  deliveryResultEnvelopeSchema
]);

export type DeliveryAttemptEnvelope = z.infer<typeof deliveryAttemptEnvelopeSchema>;
export type DeliveryResultEnvelope = z.infer<typeof deliveryResultEnvelopeSchema>;

type RenderableSignal = Pick<ObservationSignal, "impact_code" | "component" | "class" | "evidence">;

function numberEvidence(signal: RenderableSignal, key: string): number {
  const value = (signal.evidence as Readonly<Record<string, unknown>>)[key];
  return typeof value === "number" ? value : 0;
}

function firstNumberEvidence(signal: RenderableSignal, ...keys: readonly string[]): number {
  for (const key of keys) {
    const value = (signal.evidence as Readonly<Record<string, unknown>>)[key];
    if (typeof value === "number") return value;
  }
  return 0;
}

function providerPercentEvidence(signal: RenderableSignal): number {
  const evidence = signal.evidence as Readonly<Record<string, unknown>>;
  if (typeof evidence.percent === "number") return evidence.percent;
  return typeof evidence.ratio === "number" ? evidence.ratio * 100 : 0;
}

function stringEvidence(signal: RenderableSignal, key: string): string {
  const value = (signal.evidence as Readonly<Record<string, unknown>>)[key];
  return typeof value === "string" ? value : "unknown";
}

const IMPACT_RENDERERS: Readonly<Record<ImpactCode, (signal: RenderableSignal) => string>> = Object.freeze({
  IMPACT_PG_DOWN: () => "Postgres is down: every debate read and write fails; nothing can be dispatched or recorded.",
  IMPACT_PG_CAPACITY: (s) => `Postgres is at ${numberEvidence(s, "used")}/${numberEvidence(s, "max")} connections: new requests fail when the limit is reached.`,
  IMPACT_PG_LOCKS: (s) => `${numberEvidence(s, "count")} Postgres sessions have waited on locks for ${numberEvidence(s, "duration_seconds")} seconds: requests are queuing behind each other.`,
  IMPACT_PG_LONG_XACT: (s) => `A transaction has been open for ${numberEvidence(s, "duration_seconds")} seconds: vacuum and locks are held back.`,
  IMPACT_DOCKER_DOWN: () => "The Docker engine is unreachable: Postgres and Hatchet state is unknown.",
  IMPACT_HATCHET_DOWN: () => "Hatchet is down: asks are accepted but no debate work is dispatched or run.",
  IMPACT_HATCHET_NOT_READY: () => "Hatchet is up but not ready: dispatch is paused.",
  IMPACT_HATCHET_QUEUE: (s) => `Hatchet has ${numberEvidence(s, "count")} tasks queued for ${numberEvidence(s, "duration_seconds")} seconds: dispatch is not keeping up.`,
  IMPACT_HATCHET_FAILED_TASKS: (s) => `${firstNumberEvidence(s, "failed", "count")} Hatchet tasks failed in the last ${numberEvidence(s, "window_minutes")} minutes: debates are dying at dispatch.`,
  IMPACT_HATCHET_DISPATCH_SLOW: (s) => `Hatchet dispatch p95 is ${numberEvidence(s, "p95_seconds")} seconds over ${numberEvidence(s, "window_minutes")} minutes: queued debate work waits too long to start.`,
  IMPACT_WORKER_LOST: (s) => `The runner stopped heartbeating ${firstNumberEvidence(s, "heartbeat_age_s", "duration_seconds")} seconds ago: queued debate work is not picked up.`,
  IMPACT_STALL: (s) => `${numberEvidence(s, "count")} work items are past their claim deadline: those debates will not finish on their own.`,
  IMPACT_QUEUE: (s) => `New debate work has waited ${firstNumberEvidence(s, "ready_age_s", "duration_seconds")} seconds without being picked up: asks hang.`,
  IMPACT_NO_PROGRESS: (s) => `${numberEvidence(s, "count")} runs have in-flight work and no progress for ${firstNumberEvidence(s, "silence_s", "duration_seconds")} seconds: those debates look alive but are not moving.`,
  IMPACT_SUSPICIOUS_SUCCESS: (s) => `${numberEvidence(s, "count")} work items completed without the artifact the contract requires: results may be empty.`,
  IMPACT_API_DOWN: () => "The API is down: the app cannot sign in, ask, or read debates.",
  IMPACT_UI_DOWN: () => "The UI server is down: https://localhost:3000 does not render.",
  IMPACT_TLS_DOWN: () => "The https front door is down: the browser cannot reach the app.",
  IMPACT_DEV_STACK_EXITED: () => "The https dev stack exited (its supervisor stops every child when one exits): API, UI, front door and runner are all down.",
  IMPACT_DEV_STACK_NOT_RUNNING: () => "The dev stack is not running.",
  IMPACT_RUNNER_GONE: () => "The runner process is gone: queued debate work is not picked up.",
  IMPACT_SLOW: (s) => `${s.component} answered its liveness probe in ${numberEvidence(s, "p95_ms")} ms at p95 over 5 minutes: users are waiting.`,
  IMPACT_BLIND: (s) => `Error capture on ${stringEvidence(s, "runtime")} is silent while the process is up: failures there are not recorded.`,
  IMPACT_CAPTURE_GAP: (s) => `${firstNumberEvidence(s, "lost_count", "count")} error events were dropped by capture: the error record is incomplete.`,
  IMPACT_CAPTURE_NOT_WIRED: () => "Error capture is not wired into the product: no failure is recorded anywhere.",
  IMPACT_SPOOL_STRANDED: (s) => `${firstNumberEvidence(s, "count") || 1} spooled error files are older than ${firstNumberEvidence(s, "duration_minutes") || numberEvidence(s, "threshold_s") / 60} minutes without re-ingestion.`,
  IMPACT_DISK: (s) => `Disk free is ${numberEvidence(s, "percent")}%: Postgres and the spool stop accepting writes at 0.`,
  IMPACT_MEMORY: () => "Host memory pressure is high: processes may be killed.",
  IMPACT_LOAD: (s) => `Host load is ${numberEvidence(s, "load_one_minute")} across ${numberEvidence(s, "logical_cores")} logical cores for ${numberEvidence(s, "sustained_seconds")} seconds: processes are contending for CPU.`,
  IMPACT_PROVIDER: (s) => `Provider ${stringEvidence(s, "provider_ref")} failed ${providerPercentEvidence(s)}% of its last ${firstNumberEvidence(s, "count", "total")} calls: debates stall or die on it.`,
  IMPACT_RUN_FAILURE: (s) => `${numberEvidence(s, "failed") } of ${numberEvidence(s, "total")} terminal runs failed in the last ${numberEvidence(s, "window_minutes")} minutes: debate runs are failing more often than they finish.`,
  IMPACT_CERT: (s) => `The https certificate expires in ${numberEvidence(s, "days")} days: the front door refuses connections after that.`,
  IMPACT_SCHEDULE_MISSED: (s) => `Job ${stringEvidence(s, "job")} has not completed within its ruled cadence.`,
  IMPACT_RESTART: (s) => `${s.component} restarted (start time changed).`,
  IMPACT_EXPECTED_ABSENT: (s) => `${s.component} is expected to run and has not been seen since the agent started.`,
  IMPACT_THRESHOLDS: (s) => `Thresholds changed from v${numberEvidence(s, "previous_version")} to v${numberEvidence(s, "current_version")}.`,
  IMPACT_AGENT_START: () => "ObservationAgent started.",
  IMPACT_AGENT_STOP: () => "ObservationAgent stopped.",
  IMPACT_AGENT_JOURNAL: () => "ObservationAgent cannot write its journal: signals may be lost until storage is restored.",
  IMPACT_AGENT_DELIVERY: (s) => `ObservationAgent could not deliver through ${stringEvidence(s, "channel")}: the signal remains stored and other channels continue.`,
  IMPACT_CLEARED: (s) => `${s.component}: ${s.class} cleared after ${numberEvidence(s, "duration_seconds")} seconds.`
});

export function renderImpact(input: unknown): string {
  const signal = signalSchema.parse(input);
  return IMPACT_RENDERERS[signal.impact_code](signal);
}
