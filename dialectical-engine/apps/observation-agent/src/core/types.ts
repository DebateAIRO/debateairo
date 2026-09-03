import type { ImpactCode, Severity } from "./signals.js";

export const OBSERVATION_COMPONENTS = Object.freeze([
  "postgres", "docker", "hatchet", "runner", "api", "ui", "tls_front_door",
  "dev_stack", "provider_panel", "scheduler.liveness-sweep", "scheduler.settlement-watch",
  "scheduler.replay-self-test", "obs_capture", "spool", "host", "kanban",
  "observation_agent"
] as const);

export type ObservationComponent = typeof OBSERVATION_COMPONENTS[number];

export const STATUS_STATES = Object.freeze([
  "UNKNOWN", "UP", "SUSPECT", "DOWN", "RECOVERING",
  "NOT_RUNNING", "RUNNING", "PARTIAL", "EXITED", "UNBOUND",
  "FRESH", "STALE", "INELIGIBLE", "HEALTHY", "PENDING", "OPEN", "CLEARED", "ABSENT",
  "NOT_WIRED", "WIRED_CURRENT", "WIRED_SILENT", "NONE", "CLOSED", "CURRENT",
  "STRANDED", "RECEIPTED_OR_ABSENT", "NORMAL", "DEGRADED", "SEVERE", "FATAL",
  "NOT_OBSERVABLE", "VALID", "EXPIRING_14D", "EXPIRING_3D", "EXPIRED",
  "COLLECTING", "INSUFFICIENT_SAMPLE", "QUALIFIED_NORMAL", "REST_ONLY",
  "REST_AND_PROMETHEUS_MATCH", "SOURCE_MISMATCH", "MATCH", "DELIVERED", "FAILED",
  "MUTED", "RATE_LIMITED", "OPEN_UNACKED", "ACKED", "QUIET", "STORM_SUMMARY_SENT"
] as const);

export type StatusState = typeof STATUS_STATES[number];

export const STATUS_UNITS = Object.freeze([
  "COUNT", "MILLISECONDS", "SECONDS", "MINUTES", "PERCENT", "BYTES", "RATIO", "VERSION"
] as const);

export type StatusUnit = typeof STATUS_UNITS[number];

export const STATUS_TEMPLATES = Object.freeze([
  "EVALUATOR_UNBOUND_BY_REGISTER", "NO_SCHEDULE_RULED", "CAPTURE_NOT_WIRED",
  "SLOW_QUERIES_NOT_OBSERVABLE", "PROVIDER_LATENCY_NOT_OBSERVABLE"
] as const);

export type StatusTemplate = typeof STATUS_TEMPLATES[number];
export const STATUS_VIEW_PATTERN = /^[a-z][a-z0-9-]{0,31}$/u;
export type StatusView = string;

export type ModuleStatusProjection =
  | Readonly<{
      kind: "state";
      key: string;
      state: StatusState;
      view?: StatusView;
      observedAt?: Date;
    }>
  | Readonly<{
      kind: "metric";
      key: string;
      value: number;
      unit: StatusUnit;
      view?: StatusView;
      observedAt?: Date;
    }>
  | Readonly<{
      kind: "timestamp";
      key: string;
      value: Date | null;
      view?: StatusView;
    }>
  | Readonly<{
      kind: "template";
      key: string;
      template: StatusTemplate;
      count?: number;
      view?: StatusView;
    }>;

export interface ModuleConfigurationObject {
  readonly [key: string]: ModuleConfigurationValue;
}

export type ModuleConfigurationValue = string | number | boolean
  | readonly ModuleConfigurationValue[] | ModuleConfigurationObject;

export type ModuleTargetFragment = Readonly<{
  basename: string;
  targets: readonly unknown[];
  configuration: ModuleConfigurationObject;
}>;

export const SIGNAL_CLASSES = Object.freeze([
  "INFRA_DOWN", "INFRA_NOT_READY", "INFRA_UNKNOWN", "WORKER_LOST", "STALL",
  "QUEUE_NOT_DRAINING", "NO_PROGRESS", "SUSPICIOUS_SUCCESS", "BLIND_PERIOD",
  "CAPTURE_GAP", "CAPTURE_NOT_WIRED", "SPOOL_STRANDED", "CAPACITY",
  "THROUGHPUT_ANOMALY", "PROVIDER_DEGRADED", "RESTART_WITNESSED",
  "EXPECTED_ABSENT", "CERT_EXPIRY", "SCHEDULE_MISSED", "THRESHOLD_CHANGED",
  "AGENT_SELF"
] as const);

export type SignalClass = typeof SIGNAL_CLASSES[number];
export type ComponentState = "UNKNOWN" | "UP" | "SUSPECT" | "DOWN" | "RECOVERING";

export type ProbeObservation = Readonly<{
  component: ObservationComponent;
  ok: boolean;
  class: SignalClass;
  probe: string;
  target?: string;
  lastStatus: string | number;
  containerStatus?: string;
  restartPolicy?: string;
  exitCode?: number;
  observedAt?: Date;
  management?: "core" | "module";
  statusState?: StatusState;
  status?: readonly ModuleStatusProjection[];
}>;

export type SampleIntent = Readonly<{
  metricKey: string;
  value: number;
  observedAt: Date;
}>;

export type SignalIntent = Readonly<{
  correlationKey: string;
  component: ObservationComponent;
  class: SignalClass;
  state: "OPEN" | "CLEARED";
  severity: Severity;
  impactCode: ImpactCode;
  firstFailedProbeAt: Date | null;
  detectedAt: Date;
  evidence: Readonly<Record<string, unknown>>;
  suspectedDefect: boolean;
  defectKind: "STALL_DETECTED" | "SILENT_NOOP" | "SUSPICIOUS_SUCCESS" | null;
  runRef: string | null;
  workItemRef: string | null;
}>;

export type ProbeContext = Readonly<{
  now: Date;
  timeoutMs: number;
  databaseUrl: string;
  stateDir: string;
  targets: readonly unknown[];
  targetFragment: ModuleTargetFragment | null;
  configuration: ModuleConfigurationObject;
  thresholds: ModuleConfigurationObject;
}>;

export type SampleContext = Readonly<{ now: Date }>;
export type SignalContext = Readonly<{
  now: Date;
  thresholdVersion: number;
  targetFragment: ModuleTargetFragment | null;
  configuration: ModuleConfigurationObject;
  thresholds: ModuleConfigurationObject;
}>;

export type OactlVerbContribution = Readonly<{
  verb: string;
  run(args: readonly string[]): Promise<number>;
}>;

export type ObservationModuleManifest = Readonly<{
  name: string;
  cadence: Readonly<{ intervalMs: number; timeoutMs: number }>;
  targetFragmentBasename?: string;
  oactl?: readonly OactlVerbContribution[];
  probe(ctx: ProbeContext): Promise<readonly ProbeObservation[]>;
  samples(observations: readonly ProbeObservation[], ctx: SampleContext): readonly SampleIntent[];
  signals(observations: readonly ProbeObservation[], ctx: SignalContext): readonly SignalIntent[];
}>;

export type Module = ObservationModuleManifest;
