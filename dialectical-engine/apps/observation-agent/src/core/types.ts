import type { ImpactCode, Severity } from "./signals.js";

export const OBSERVATION_COMPONENTS = Object.freeze([
  "postgres", "docker", "hatchet", "runner", "api", "ui", "tls_front_door",
  "dev_stack", "provider_panel", "scheduler.liveness-sweep", "scheduler.settlement-watch",
  "scheduler.replay-self-test", "obs_capture", "spool", "host", "kanban",
  "observation_agent"
] as const);

export type ObservationComponent = typeof OBSERVATION_COMPONENTS[number];

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
}>;

export type SampleContext = Readonly<{ now: Date }>;
export type SignalContext = Readonly<{ now: Date; thresholdVersion: number }>;

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
