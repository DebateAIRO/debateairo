import { z } from "zod";
import { ObservationError } from "./errors.js";
import {
  IMPACT_CODES,
  SEVERITIES,
  signalSchema,
  type ObservationSignal
} from "./signals.js";
import {
  OBSERVATION_COMPONENTS,
  SIGNAL_CLASSES,
  STATUS_STATES,
  STATUS_TEMPLATES,
  STATUS_UNITS,
  STATUS_VIEW_PATTERN,
  type ModuleConfigurationObject,
  type Module,
  type ModuleStatusProjection,
  type ModuleTargetFragment,
  type ProbeObservation,
  type SampleIntent,
  type SignalIntent
} from "./types.js";

const sampleIntentSchema = z.object({
  metricKey: z.string().min(1).max(128).regex(/^[a-z][a-z0-9_.-]*$/u),
  value: z.number().finite(),
  observedAt: z.date()
}).strict();

const statusViewSchema = z.string().regex(STATUS_VIEW_PATTERN);

const probeObservationSchema = z.object({
  component: z.enum(OBSERVATION_COMPONENTS),
  ok: z.boolean(),
  class: z.enum(SIGNAL_CLASSES),
  probe: z.string().min(1).max(128),
  target: z.string().min(1).max(2_048).optional(),
  lastStatus: z.union([z.string().max(256), z.number().finite()]),
  containerStatus: z.string().max(128).optional(),
  restartPolicy: z.string().max(128).optional(),
  exitCode: z.number().int().optional(),
  observedAt: z.date().optional(),
  management: z.enum(["core", "module"]).optional(),
  statusState: z.enum(STATUS_STATES).optional(),
  status: z.array(z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("state"),
      key: z.string().min(1).max(128).regex(/^[a-z][a-z0-9_.-]*$/u),
      state: z.enum(STATUS_STATES),
      view: statusViewSchema.optional(),
      observedAt: z.date().optional()
    }).strict(),
    z.object({
      kind: z.literal("metric"),
      key: z.string().min(1).max(128).regex(/^[a-z][a-z0-9_.-]*$/u),
      value: z.number().finite(),
      unit: z.enum(STATUS_UNITS),
      view: statusViewSchema.optional(),
      observedAt: z.date().optional()
    }).strict(),
    z.object({
      kind: z.literal("timestamp"),
      key: z.string().min(1).max(128).regex(/^[a-z][a-z0-9_.-]*$/u),
      value: z.date().nullable(),
      view: statusViewSchema.optional()
    }).strict(),
    z.object({
      kind: z.literal("template"),
      key: z.string().min(1).max(128).regex(/^[a-z][a-z0-9_.-]*$/u),
      template: z.enum(STATUS_TEMPLATES),
      count: z.number().int().nonnegative().optional(),
      view: statusViewSchema.optional()
    }).strict()
  ])).max(128).optional()
}).strict().superRefine((observation, context) => {
  if (observation.management !== "module"
    && (observation.statusState !== undefined || observation.status !== undefined)) {
    context.addIssue({ code: "custom", message: "OBSERVATION_MODULE_STATUS_INVALID" });
  }
});

function parseProbeObservation(input: unknown): ProbeObservation {
  const parsed = probeObservationSchema.parse(input);
  return Object.freeze({
    component: parsed.component,
    ok: parsed.ok,
    class: parsed.class,
    probe: parsed.probe,
    lastStatus: parsed.lastStatus,
    ...(parsed.target === undefined ? {} : { target: parsed.target }),
    ...(parsed.containerStatus === undefined ? {} : { containerStatus: parsed.containerStatus }),
    ...(parsed.restartPolicy === undefined ? {} : { restartPolicy: parsed.restartPolicy }),
    ...(parsed.exitCode === undefined ? {} : { exitCode: parsed.exitCode }),
    ...(parsed.observedAt === undefined ? {} : { observedAt: parsed.observedAt }),
    ...(parsed.management === undefined ? {} : { management: parsed.management }),
    ...(parsed.statusState === undefined ? {} : { statusState: parsed.statusState }),
    ...(parsed.status === undefined ? {} : {
      status: Object.freeze(parsed.status.map((projection): ModuleStatusProjection => {
        if (projection.kind === "state") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            state: projection.state,
            ...(projection.view === undefined ? {} : { view: projection.view }),
            ...(projection.observedAt === undefined ? {} : { observedAt: projection.observedAt })
          });
        }
        if (projection.kind === "metric") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            value: projection.value,
            unit: projection.unit,
            ...(projection.view === undefined ? {} : { view: projection.view }),
            ...(projection.observedAt === undefined ? {} : { observedAt: projection.observedAt })
          });
        }
        if (projection.kind === "timestamp") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            value: projection.value,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        return Object.freeze({
          kind: projection.kind,
          key: projection.key,
          template: projection.template,
          ...(projection.count === undefined ? {} : { count: projection.count }),
          ...(projection.view === undefined ? {} : { view: projection.view })
        });
      }))
    })
  });
}

const signalIntentSchema = z.object({
  correlationKey: z.string().min(1).max(128).regex(/^[A-Za-z0-9_.:-]+$/u),
  component: z.enum(OBSERVATION_COMPONENTS),
  class: z.enum(SIGNAL_CLASSES),
  state: z.enum(["OPEN", "CLEARED"]),
  severity: z.enum(SEVERITIES),
  impactCode: z.enum(IMPACT_CODES),
  firstFailedProbeAt: z.date().nullable(),
  detectedAt: z.date(),
  evidence: z.record(z.string(), z.unknown()),
  suspectedDefect: z.boolean(),
  defectKind: z.enum(["STALL_DETECTED", "SILENT_NOOP", "SUSPICIOUS_SUCCESS"]).nullable(),
  runRef: z.uuid().nullable(),
  workItemRef: z.uuid().nullable()
}).strict();

type SampleStore = Readonly<{
  write(sample: SampleIntent, cadenceMs: number): Promise<void>;
}>;

export type ModuleStatusUpdate = Readonly<{
  observations: readonly ProbeObservation[];
  projections: readonly ModuleStatusProjection[];
}>;

export class ObservationModuleRuntime {
  private readonly nextSequence: () => number;
  private readonly nextSignalId: () => string;
  private readonly sampleStore: SampleStore;
  private readonly emitSignal: (signal: ObservationSignal, now: Date) => Promise<void>;
  private readonly updateModuleStatus: ((
    moduleName: string,
    update: ModuleStatusUpdate
  ) => Promise<void> | void) | undefined;
  private readonly lastRun = new Map<string, number>();
  private readonly openSignals = new Map<string, ObservationSignal>();

  constructor(input: Readonly<{
    nextSequence: () => number;
    nextSignalId: () => string;
    sampleStore: SampleStore;
    emitSignal: (signal: ObservationSignal, now: Date) => Promise<void>;
    updateModuleStatus?: (
      moduleName: string,
      update: ModuleStatusUpdate
    ) => Promise<void> | void;
  }>) {
    this.nextSequence = input.nextSequence;
    this.nextSignalId = input.nextSignalId;
    this.sampleStore = input.sampleStore;
    this.emitSignal = input.emitSignal;
    this.updateModuleStatus = input.updateModuleStatus;
  }

  async run(input: Readonly<{
    modules: readonly Module[];
    now: Date;
    timeoutMs: number;
    databaseUrl: string;
    stateDir: string;
    targets: readonly unknown[];
    targetFragments?: readonly ModuleTargetFragment[];
    moduleThresholds?: Readonly<Record<string, ModuleConfigurationObject>>;
    thresholdVersion: number;
  }>): Promise<readonly ProbeObservation[]> {
    const observations: ProbeObservation[] = [];
    for (const module of input.modules) {
      const last = this.lastRun.get(module.name);
      if (last !== undefined && input.now.getTime() - last < module.cadence.intervalMs) continue;
      this.lastRun.set(module.name, input.now.getTime());
      const configuredFragment = module.targetFragmentBasename === undefined
        ? null
        : input.targetFragments?.find((fragment) =>
          fragment.basename === module.targetFragmentBasename) ?? null;
      if (module.targetFragmentBasename !== undefined
        && input.targetFragments !== undefined
        && configuredFragment === null) {
        throw new ObservationError("OBSERVATION_TARGETS_INVALID");
      }
      const targetFragment = configuredFragment ?? (module.targetFragmentBasename === undefined
        ? null
        : Object.freeze({
            basename: module.targetFragmentBasename,
            targets: input.targets,
            configuration: Object.freeze({})
          }));
      const configuration = targetFragment?.configuration ?? Object.freeze({});
      const thresholds = Object.freeze(input.moduleThresholds?.[module.name] ?? {});
      let moduleObservations: readonly ProbeObservation[];
      try {
        const output = await module.probe({
          now: input.now,
          timeoutMs: Math.min(input.timeoutMs, module.cadence.timeoutMs),
          databaseUrl: input.databaseUrl,
          stateDir: input.stateDir,
          targets: targetFragment?.targets ?? [],
          targetFragment,
          configuration,
          thresholds
        });
        moduleObservations = Object.freeze(output.map(parseProbeObservation));
      } catch (error) {
        throw new ObservationError("OBSERVATION_MODULE_PROBE_INVALID", error);
      }
      observations.push(...moduleObservations.filter((observation) =>
        observation.management !== "module"));

      const managedObservations = Object.freeze(moduleObservations.filter((observation) =>
        observation.management === "module"));
      const projections = Object.freeze(managedObservations.flatMap((observation) =>
        observation.status ?? []));
      await this.updateModuleStatus?.(module.name, Object.freeze({
        observations: managedObservations,
        projections
      }));

      let samples: readonly SampleIntent[];
      try {
        samples = Object.freeze(module.samples(moduleObservations, { now: input.now })
          .map((sample) => Object.freeze(sampleIntentSchema.parse(sample))));
      } catch (error) {
        throw new ObservationError("OBSERVATION_MODULE_SAMPLE_INVALID", error);
      }
      for (const sample of samples) await this.sampleStore.write(sample, module.cadence.intervalMs);

      let signalIntents: readonly SignalIntent[];
      try {
        signalIntents = Object.freeze(module.signals(moduleObservations, {
          now: input.now,
          thresholdVersion: input.thresholdVersion,
          targetFragment,
          configuration,
          thresholds
        }).map((intent) => Object.freeze(signalIntentSchema.parse(intent))));
      } catch (error) {
        throw new ObservationError("OBSERVATION_MODULE_SIGNAL_INVALID", error);
      }
      for (const intent of signalIntents) await this.applySignalIntent(module.name, intent, input);
    }
    return Object.freeze(observations);
  }

  private async applySignalIntent(
    moduleName: string,
    intent: SignalIntent,
    context: Readonly<{ now: Date; thresholdVersion: number }>
  ): Promise<void> {
    const correlationKey = `${moduleName}:${intent.correlationKey}`;
    const opened = this.openSignals.get(correlationKey);
    if (intent.state === "OPEN" && opened !== undefined) return;
    if (intent.state === "CLEARED" && opened === undefined) return;
    if (opened !== undefined
      && (opened.component !== intent.component || opened.class !== intent.class)) {
      throw new ObservationError("OBSERVATION_MODULE_SIGNAL_INVALID");
    }
    let signal: ObservationSignal;
    try {
      signal = signalSchema.parse({
        seq: this.nextSequence(),
        signal_id: this.nextSignalId(),
        state: intent.state,
        class: intent.class,
        component: intent.component,
        severity: intent.severity,
        impact_code: intent.impactCode,
        first_failed_probe_at: intent.firstFailedProbeAt?.toISOString() ?? null,
        detected_at: intent.detectedAt.toISOString(),
        evidence: intent.evidence,
        suspected_defect: intent.suspectedDefect,
        defect_kind: intent.defectKind,
        run_ref: intent.runRef,
        work_item_ref: intent.workItemRef,
        threshold_version: context.thresholdVersion,
        clears_signal_id: opened?.signal_id ?? null,
        recorded_at: context.now.toISOString()
      });
    } catch (error) {
      throw new ObservationError("OBSERVATION_MODULE_SIGNAL_INVALID", error);
    }
    await this.emitSignal(signal, context.now);
    if (intent.state === "OPEN") this.openSignals.set(correlationKey, signal);
    else this.openSignals.delete(correlationKey);
  }
}
