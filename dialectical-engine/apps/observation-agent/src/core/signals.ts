import { z } from "zod";
import { OBSERVATION_COMPONENTS, SIGNAL_CLASSES } from "./types.js";

export const SEVERITIES = Object.freeze(["INFO", "DEGRADED", "SEVERE", "FATAL"] as const);
export const IMPACT_CODES = Object.freeze([
  "IMPACT_PG_DOWN", "IMPACT_PG_CAPACITY", "IMPACT_PG_LOCKS", "IMPACT_PG_LONG_XACT",
  "IMPACT_DOCKER_DOWN", "IMPACT_HATCHET_DOWN", "IMPACT_HATCHET_NOT_READY",
  "IMPACT_HATCHET_QUEUE", "IMPACT_HATCHET_FAILED_TASKS", "IMPACT_HATCHET_DISPATCH_SLOW",
  "IMPACT_WORKER_LOST", "IMPACT_STALL", "IMPACT_QUEUE", "IMPACT_NO_PROGRESS",
  "IMPACT_SUSPICIOUS_SUCCESS", "IMPACT_API_DOWN", "IMPACT_UI_DOWN", "IMPACT_TLS_DOWN",
  "IMPACT_DEV_STACK_EXITED", "IMPACT_DEV_STACK_NOT_RUNNING", "IMPACT_RUNNER_GONE",
  "IMPACT_SLOW", "IMPACT_BLIND", "IMPACT_CAPTURE_GAP", "IMPACT_CAPTURE_NOT_WIRED",
  "IMPACT_SPOOL_STRANDED", "IMPACT_DISK", "IMPACT_MEMORY", "IMPACT_PROVIDER",
  "IMPACT_RUN_FAILURE", "IMPACT_CERT", "IMPACT_SCHEDULE_MISSED", "IMPACT_RESTART",
  "IMPACT_EXPECTED_ABSENT", "IMPACT_THRESHOLDS", "IMPACT_AGENT_START",
  "IMPACT_AGENT_STOP", "IMPACT_AGENT_JOURNAL", "IMPACT_CLEARED"
] as const);

export type Severity = typeof SEVERITIES[number];
export type ImpactCode = typeof IMPACT_CODES[number];

const safeTarget = z.string().min(1).max(512).regex(/^[A-Za-z0-9_.:/-]+$/u);
const livenessEvidenceSchema = z.object({
  probe: z.enum(["tcp+select1", "http_get", "docker_info", "docker_inspect", "heartbeat_write"]),
  target: safeTarget.optional(),
  consecutive_failures: z.number().int().nonnegative().optional(),
  threshold: z.number().int().positive().optional(),
  last_status: z.union([
    z.number().int(), z.enum(["READY", "FAILED", "UNKNOWN", "WRITTEN"])
  ]).optional(),
  container_status: z.enum(["created", "running", "paused", "restarting", "exited", "dead", "UNKNOWN"]).optional(),
  restart_policy: z.enum(["no", "always", "unless-stopped", "on-failure", "UNKNOWN"]).optional(),
  exit_code: z.number().int().optional(),
  duration_seconds: z.number().nonnegative().optional()
}).strict();

const selfEvidenceSchema = z.object({
  reason: z.enum(["START", "STOP", "JOURNAL_FAILURE", "UNCLEAN_PREVIOUS_EXIT"]).optional(),
  previous_exit_reason: z.enum(["CLEAN", "UNCLEAN", "UNKNOWN"]).optional()
}).strict();

const thresholdEvidenceSchema = z.object({
  previous_version: z.number().int().positive(),
  current_version: z.number().int().positive()
}).strict();

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
  const evidenceResult = signal.class.startsWith("INFRA_")
    ? livenessEvidenceSchema.safeParse(signal.evidence)
    : signal.class === "AGENT_SELF"
      ? selfEvidenceSchema.safeParse(signal.evidence)
      : signal.class === "THRESHOLD_CHANGED"
        ? thresholdEvidenceSchema.safeParse(signal.evidence)
        : z.object({}).strict().safeParse(signal.evidence);
  if (!evidenceResult.success) {
    context.addIssue({ code: "custom", message: "OBSERVATION_EVIDENCE_INVALID", path: ["evidence"] });
  }
  if ((signal.suspected_defect && signal.defect_kind === null)
    || (!signal.suspected_defect && signal.defect_kind !== null)) {
    context.addIssue({ code: "custom", message: "OBSERVATION_DEFECT_KIND_INVALID", path: ["defect_kind"] });
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

function stringEvidence(signal: RenderableSignal, key: string): string {
  const value = (signal.evidence as Readonly<Record<string, unknown>>)[key];
  return typeof value === "string" ? value : "unknown";
}

const IMPACT_RENDERERS: Readonly<Record<ImpactCode, (signal: RenderableSignal) => string>> = Object.freeze({
  IMPACT_PG_DOWN: () => "Postgres is down: every debate read and write fails; nothing can be dispatched or recorded.",
  IMPACT_PG_CAPACITY: (s) => `Postgres is at ${numberEvidence(s, "count")}/${numberEvidence(s, "limit")} connections: new requests fail when the limit is reached.`,
  IMPACT_PG_LOCKS: (s) => `${numberEvidence(s, "count")} Postgres sessions have waited on locks for ${numberEvidence(s, "duration_seconds")} seconds: requests are queuing behind each other.`,
  IMPACT_PG_LONG_XACT: (s) => `A transaction has been open for ${numberEvidence(s, "duration_seconds")} seconds: vacuum and locks are held back.`,
  IMPACT_DOCKER_DOWN: () => "The Docker engine is unreachable: Postgres and Hatchet state is unknown.",
  IMPACT_HATCHET_DOWN: () => "Hatchet is down: asks are accepted but no debate work is dispatched or run.",
  IMPACT_HATCHET_NOT_READY: () => "Hatchet is up but not ready: dispatch is paused.",
  IMPACT_HATCHET_QUEUE: (s) => `Hatchet has ${numberEvidence(s, "count")} tasks queued for ${numberEvidence(s, "duration_seconds")} seconds: dispatch is not keeping up.`,
  IMPACT_HATCHET_FAILED_TASKS: (s) => `${numberEvidence(s, "count")} Hatchet tasks failed in the last ${numberEvidence(s, "window_minutes")} minutes: debates are dying at dispatch.`,
  IMPACT_HATCHET_DISPATCH_SLOW: (s) => `Hatchet dispatch p95 is ${numberEvidence(s, "p95_seconds")} seconds over ${numberEvidence(s, "window_minutes")} minutes: queued debate work waits too long to start.`,
  IMPACT_WORKER_LOST: (s) => `The runner stopped heartbeating ${numberEvidence(s, "duration_seconds")} seconds ago: queued debate work is not picked up.`,
  IMPACT_STALL: (s) => `${numberEvidence(s, "count")} work items are past their claim deadline: those debates will not finish on their own.`,
  IMPACT_QUEUE: (s) => `New debate work has waited ${numberEvidence(s, "duration_seconds")} seconds without being picked up: asks hang.`,
  IMPACT_NO_PROGRESS: (s) => `${numberEvidence(s, "count")} runs have in-flight work and no progress for ${numberEvidence(s, "duration_seconds")} seconds: those debates look alive but are not moving.`,
  IMPACT_SUSPICIOUS_SUCCESS: (s) => `${numberEvidence(s, "count")} work items completed without the artifact the contract requires: results may be empty.`,
  IMPACT_API_DOWN: () => "The API is down: the app cannot sign in, ask, or read debates.",
  IMPACT_UI_DOWN: () => "The UI server is down: https://localhost:3000 does not render.",
  IMPACT_TLS_DOWN: () => "The https front door is down: the browser cannot reach the app.",
  IMPACT_DEV_STACK_EXITED: () => "The https dev stack exited (its supervisor stops every child when one exits): API, UI, front door and runner are all down.",
  IMPACT_DEV_STACK_NOT_RUNNING: () => "The dev stack is not running.",
  IMPACT_RUNNER_GONE: () => "The runner process is gone: queued debate work is not picked up.",
  IMPACT_SLOW: (s) => `${s.component} answered its liveness probe in ${numberEvidence(s, "p95_ms")} ms at p95 over 5 minutes: users are waiting.`,
  IMPACT_BLIND: (s) => `Error capture on ${s.component} is silent while the process is up: failures there are not recorded.`,
  IMPACT_CAPTURE_GAP: (s) => `${numberEvidence(s, "count")} error events were dropped by capture: the error record is incomplete.`,
  IMPACT_CAPTURE_NOT_WIRED: () => "Error capture is not wired into the product: no failure is recorded anywhere.",
  IMPACT_SPOOL_STRANDED: (s) => `${numberEvidence(s, "count")} spooled error files are older than ${numberEvidence(s, "duration_minutes")} minutes without re-ingestion.`,
  IMPACT_DISK: (s) => `Disk free is ${numberEvidence(s, "percent")}%: Postgres and the spool stop accepting writes at 0.`,
  IMPACT_MEMORY: () => "Host memory pressure is high: processes may be killed.",
  IMPACT_PROVIDER: (s) => `Provider ${stringEvidence(s, "provider_ref")} failed ${numberEvidence(s, "percent")}% of its last ${numberEvidence(s, "count")} calls: debates stall or die on it.`,
  IMPACT_RUN_FAILURE: (s) => `${numberEvidence(s, "failed") } of ${numberEvidence(s, "total")} terminal runs failed in the last ${numberEvidence(s, "window_minutes")} minutes: debate runs are failing more often than they finish.`,
  IMPACT_CERT: (s) => `The https certificate expires in ${numberEvidence(s, "days")} days: the front door refuses connections after that.`,
  IMPACT_SCHEDULE_MISSED: (s) => `Job ${stringEvidence(s, "job")} has not completed within its ruled cadence.`,
  IMPACT_RESTART: (s) => `${s.component} restarted (start time changed).`,
  IMPACT_EXPECTED_ABSENT: (s) => `${s.component} is expected to run and has not been seen since the agent started.`,
  IMPACT_THRESHOLDS: (s) => `Thresholds changed from v${numberEvidence(s, "previous_version")} to v${numberEvidence(s, "current_version")}.`,
  IMPACT_AGENT_START: () => "ObservationAgent started.",
  IMPACT_AGENT_STOP: () => "ObservationAgent stopped.",
  IMPACT_AGENT_JOURNAL: () => "ObservationAgent cannot write its journal: signals may be lost until storage is restored.",
  IMPACT_CLEARED: (s) => `${s.component}: ${s.class} cleared after ${numberEvidence(s, "duration_seconds")} seconds.`
});

export function renderImpact(input: unknown): string {
  const signal = signalSchema.parse(input);
  return IMPACT_RENDERERS[signal.impact_code](signal);
}
