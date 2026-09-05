import { z } from "zod";
import { ObservationError } from "./errors.js";
import {
  signalLifecycleIdentitySchema,
  type ReplayedOpenSignal,
  type SignalLifecycleIdentity
} from "./lifecycle.js";
import {
  IMPACT_CODES,
  SEVERITIES,
  signalSchema,
  type ObservationSignal
} from "./signals.js";
import {
  OBSERVATION_COMPONENTS,
  SIGNAL_CLASSES,
  STATUS_CHANNELS,
  STATUS_STATES,
  STATUS_UNITS,
  STATUS_VIEW_PATTERN,
  type ModuleConfigurationObject,
  type ModuleLifecycle,
  type Module,
  type ModuleStatusProjection,
  type ModuleTargetFragment,
  type ProbeObservation,
  type RestoredOpenSignal,
  type SampleIntent,
  type SignalIntent
} from "./types.js";

const sampleIntentSchema = z.object({
  metricKey: z.string().min(1).max(128).regex(/^[a-z][a-z0-9_.-]*$/u),
  value: z.number().finite(),
  observedAt: z.date()
}).strict();

const statusViewSchema = z.string().regex(STATUS_VIEW_PATTERN);
const statusKeySchema = z.string().min(1).max(128).regex(/^[a-z][a-z0-9_.-]*$/u);
const safeIdentifierSchema = z.string().min(1).max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u);
const endpointPathSchema = z.string().min(2).max(128)
  .regex(/^\/[a-z0-9][a-z0-9/_-]{0,127}$/u);
const stateSegmentSchema = z.string().min(1).max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u)
  .refine((value) => value !== "." && value !== "..");

const stateStatusProjectionSchema = z.object({
  kind: z.literal("state"),
  key: statusKeySchema,
  state: z.enum(STATUS_STATES),
  view: statusViewSchema.optional(),
  observedAt: z.date().optional()
}).strict();

const metricStatusProjectionSchema = z.object({
  kind: z.literal("metric"),
  key: statusKeySchema,
  value: z.number().finite(),
  unit: z.enum(STATUS_UNITS),
  view: statusViewSchema.optional(),
  observedAt: z.date().optional()
}).strict();

const timestampStatusProjectionSchema = z.object({
  kind: z.literal("timestamp"),
  key: statusKeySchema,
  value: z.date().nullable(),
  view: statusViewSchema.optional()
}).strict();

const channelsStatusProjectionSchema = z.object({
  kind: z.literal("channels"),
  key: statusKeySchema,
  channels: z.array(z.enum(STATUS_CHANNELS)).min(1).max(STATUS_CHANNELS.length)
    .superRefine((channels, context) => {
      if (new Set(channels).size !== channels.length) {
        context.addIssue({ code: "custom", message: "OBSERVATION_STATUS_CHANNEL_DUPLICATE" });
      }
    }),
  view: statusViewSchema.optional()
}).strict();

const componentStatusProjectionSchema = z.object({
  kind: z.literal("component"),
  key: statusKeySchema,
  component: z.enum(OBSERVATION_COMPONENTS),
  view: statusViewSchema.optional()
}).strict();

const uuidStatusProjectionSchema = z.object({
  kind: z.literal("uuid"),
  key: statusKeySchema,
  value: z.uuid().nullable(),
  view: statusViewSchema.optional()
}).strict();

const identifierStatusProjectionSchema = z.object({
  kind: z.literal("identifier"),
  key: statusKeySchema,
  identifierType: z.enum(["board", "external_ref"]),
  value: safeIdentifierSchema,
  view: statusViewSchema.optional()
}).strict();

const loopbackEndpointStatusProjectionSchema = z.object({
  kind: z.literal("loopback_endpoint"),
  key: statusKeySchema,
  port: z.number().int().min(1024).max(65_535),
  path: endpointPathSchema,
  view: statusViewSchema.optional()
}).strict();

const stateChildPathStatusProjectionSchema = z.object({
  kind: z.literal("state_child_path"),
  key: statusKeySchema,
  segments: z.array(stateSegmentSchema).min(1).max(8),
  view: statusViewSchema.optional()
}).strict();

const templateStatusProjectionSchemas = [
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("EVALUATOR_UNBOUND_BY_REGISTER"), view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("NO_SCHEDULE_RULED"), view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("CAPTURE_NOT_WIRED"), count: z.number().int().nonnegative(),
    view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("SLOW_QUERIES_NOT_OBSERVABLE"), view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("PROVIDER_LATENCY_NOT_OBSERVABLE"), view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("COUNT_WINDOW_THRESHOLD"), count: z.number().int().positive(),
    windowMinutes: z.number().finite().positive(), view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("PERCENT_MINIMUM_THRESHOLD"),
    percent: z.number().finite().min(0).max(100), minimum: z.number().int().positive(),
    view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("RATIO_WINDOW_STATE"), numerator: z.number().int().nonnegative(),
    denominator: z.number().int().positive(), windowMinutes: z.number().finite().positive(),
    state: z.enum(STATUS_STATES), view: statusViewSchema.optional()
  }).strict().refine((projection) => projection.numerator <= projection.denominator, {
    message: "OBSERVATION_STATUS_RATIO_INVALID"
  }),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("DURATION_WINDOW_STATE"), valueSeconds: z.number().finite().nonnegative(),
    windowMinutes: z.number().finite().positive(), state: z.enum(STATUS_STATES),
    view: statusViewSchema.optional()
  }).strict(),
  z.object({
    kind: z.literal("template"), key: statusKeySchema,
    template: z.literal("COUNT_SECONDS_THRESHOLD"), count: z.number().int().nonnegative(),
    windowSeconds: z.number().int().positive(), view: statusViewSchema.optional()
  }).strict()
] as const;

const moduleStatusProjectionSchema = z.union([
  stateStatusProjectionSchema,
  metricStatusProjectionSchema,
  timestampStatusProjectionSchema,
  channelsStatusProjectionSchema,
  componentStatusProjectionSchema,
  uuidStatusProjectionSchema,
  identifierStatusProjectionSchema,
  loopbackEndpointStatusProjectionSchema,
  stateChildPathStatusProjectionSchema,
  ...templateStatusProjectionSchemas
]);

export function parseModuleStatusProjection(input: unknown): ModuleStatusProjection {
  return moduleStatusProjectionSchema.parse(input) as ModuleStatusProjection;
}

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
  status: z.array(moduleStatusProjectionSchema).max(128).optional()
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
        if (projection.kind === "channels") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            channels: Object.freeze([...projection.channels]),
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.kind === "component") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            component: projection.component,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.kind === "uuid") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            value: projection.value,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.kind === "identifier") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            identifierType: projection.identifierType,
            value: projection.value,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.kind === "loopback_endpoint") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            port: projection.port,
            path: projection.path,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.kind === "state_child_path") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            segments: Object.freeze([...projection.segments]),
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.template === "CAPTURE_NOT_WIRED") {
          return Object.freeze({
            kind: projection.kind, key: projection.key, template: projection.template,
            count: projection.count,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.template === "COUNT_WINDOW_THRESHOLD") {
          return Object.freeze({
            kind: projection.kind, key: projection.key, template: projection.template,
            count: projection.count, windowMinutes: projection.windowMinutes,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.template === "PERCENT_MINIMUM_THRESHOLD") {
          return Object.freeze({
            kind: projection.kind, key: projection.key, template: projection.template,
            percent: projection.percent, minimum: projection.minimum,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.template === "RATIO_WINDOW_STATE") {
          return Object.freeze({
            kind: projection.kind, key: projection.key, template: projection.template,
            numerator: projection.numerator, denominator: projection.denominator,
            windowMinutes: projection.windowMinutes, state: projection.state,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.template === "DURATION_WINDOW_STATE") {
          return Object.freeze({
            kind: projection.kind, key: projection.key, template: projection.template,
            valueSeconds: projection.valueSeconds, windowMinutes: projection.windowMinutes,
            state: projection.state,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        if (projection.template === "COUNT_SECONDS_THRESHOLD") {
          return Object.freeze({
            kind: projection.kind, key: projection.key, template: projection.template,
            count: projection.count, windowSeconds: projection.windowSeconds,
            ...(projection.view === undefined ? {} : { view: projection.view })
          });
        }
        return Object.freeze({
          kind: projection.kind, key: projection.key, template: projection.template,
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
  private readonly emitSignal: (
    signal: ObservationSignal,
    now: Date,
    lifecycle: SignalLifecycleIdentity
  ) => Promise<void>;
  private readonly updateModuleStatus: ((
    moduleName: string,
    update: ModuleStatusUpdate
  ) => Promise<void> | void) | undefined;
  private readonly lastRun = new Map<string, number>();
  private readonly openSignals = new Map<string, ObservationSignal>();
  private readonly restoredByOwner = new Map<string, readonly RestoredOpenSignal[]>();
  private readonly lifecycleOwners = new Map<string, ModuleLifecycle>();

  constructor(input: Readonly<{
    nextSequence: () => number;
    nextSignalId: () => string;
    sampleStore: SampleStore;
    emitSignal: (
      signal: ObservationSignal,
      now: Date,
      lifecycle: SignalLifecycleIdentity
    ) => Promise<void>;
    modules?: readonly Module[];
    replayedOpenSignals?: readonly ReplayedOpenSignal[];
    lifecycleOwners?: readonly Readonly<{ owner: string; lifecycle: ModuleLifecycle }>[];
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
    this.restoreOpenSignals(
      input.modules ?? Object.freeze([]),
      input.lifecycleOwners ?? Object.freeze([]),
      input.replayedOpenSignals ?? Object.freeze([])
    );
  }

  restoredOpenSignals(owner: string): readonly RestoredOpenSignal[] {
    return this.restoredByOwner.get(owner) ?? Object.freeze([]);
  }

  async run(input: Readonly<{
    modules: readonly Module[];
    now: Date;
    timeoutMs: number;
    databaseUrl: string;
    stateDir: string;
    repoRoot: string;
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
          repoRoot: input.repoRoot,
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
    const ownerLifecycle = this.lifecycleOwners.get(moduleName);
    if (ownerLifecycle === undefined) {
      throw new ObservationError("OBSERVATION_MODULE_SIGNAL_INVALID");
    }
    const correlationKey = `${moduleName}:${intent.correlationKey}`;
    const opened = this.openSignals.get(correlationKey);
    const signalInput = (seq: number, signalId: string, clearsSignalId: string | null) => ({
      seq,
      signal_id: signalId,
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
      clears_signal_id: clearsSignalId,
      recorded_at: context.now.toISOString()
    });
    try {
      if (intent.state === "OPEN") {
        const candidate = signalSchema.parse(signalInput(
          1,
          "00000000-0000-4000-8000-000000000001",
          null
        ));
        const derivedKey = ownerLifecycle.legacyCorrelationKey(candidate);
        if (derivedKey === null || derivedKey !== intent.correlationKey) {
          throw new TypeError("lifecycle identity mismatch");
        }
      }
    } catch (error) {
      throw new ObservationError("OBSERVATION_MODULE_SIGNAL_INVALID", error);
    }
    if (opened !== undefined
      && (opened.component !== intent.component || opened.class !== intent.class)) {
      throw new ObservationError("OBSERVATION_MODULE_SIGNAL_INVALID");
    }
    if (intent.state === "OPEN" && opened !== undefined) return;
    if (intent.state === "CLEARED" && opened === undefined) return;
    let signal: ObservationSignal;
    try {
      signal = signalSchema.parse(signalInput(
        this.nextSequence(),
        this.nextSignalId(),
        opened?.signal_id ?? null
      ));
    } catch (error) {
      throw new ObservationError("OBSERVATION_MODULE_SIGNAL_INVALID", error);
    }
    const lifecycle = Object.freeze({ owner: moduleName, correlationKey: intent.correlationKey });
    await this.emitSignal(signal, context.now, lifecycle);
    if (intent.state === "OPEN") {
      this.openSignals.set(correlationKey, signal);
    } else {
      this.openSignals.delete(correlationKey);
    }
  }

  private restoreOpenSignals(
    modules: readonly Module[],
    additionalOwners: readonly Readonly<{ owner: string; lifecycle: ModuleLifecycle }>[],
    replayed: readonly ReplayedOpenSignal[]
  ): void {
    const owners = new Map<string, ModuleLifecycle>();
    try {
      for (const module of modules) {
        if (module.lifecycle === undefined) continue;
        if (owners.has(module.name)) throw new TypeError("duplicate lifecycle owner");
        owners.set(module.name, module.lifecycle);
      }
      for (const entry of additionalOwners) {
        if (owners.has(entry.owner)
          || !/^[a-z][a-z0-9-]*$/u.test(entry.owner)
          || typeof entry.lifecycle.legacyCorrelationKey !== "function"
          || typeof entry.lifecycle.restore !== "function") {
          throw new TypeError("invalid lifecycle owner");
        }
        owners.set(entry.owner, entry.lifecycle);
      }
      for (const [owner, lifecycle] of owners) this.lifecycleOwners.set(owner, lifecycle);

      const mutableByOwner = new Map<string, RestoredOpenSignal[]>();
      for (const owner of owners.keys()) mutableByOwner.set(owner, []);
      const restoredComposites = new Set<string>();
      for (const replayedOpen of replayed) {
        if (replayedOpen.signal.state !== "OPEN") throw new TypeError("not open");
        let owner: string;
        let correlationKey: string;
        if (replayedOpen.lifecycle === null) {
          const matches = [...owners].flatMap(([candidateOwner, lifecycle]) => {
            const candidateKey = lifecycle.legacyCorrelationKey(replayedOpen.signal);
            return candidateKey === null ? [] : [{ owner: candidateOwner, correlationKey: candidateKey }];
          });
          if (matches.length !== 1) throw new TypeError("ambiguous legacy owner");
          ({ owner, correlationKey } = matches[0]!);
        } else {
          const parsed = signalLifecycleIdentitySchema.parse(replayedOpen.lifecycle);
          const lifecycle = owners.get(parsed.owner);
          if (lifecycle === undefined) throw new TypeError("unknown lifecycle owner");
          const derivedKey = lifecycle.legacyCorrelationKey(replayedOpen.signal);
          if (derivedKey === null || derivedKey !== parsed.correlationKey) {
            throw new TypeError("lifecycle identity mismatch");
          }
          owner = parsed.owner;
          correlationKey = parsed.correlationKey;
        }
        const parsedIdentity = signalLifecycleIdentitySchema.parse({ owner, correlationKey });
        const composite = `${parsedIdentity.owner}:${parsedIdentity.correlationKey}`;
        if (restoredComposites.has(composite)) {
          throw new TypeError("duplicate restored identity");
        }
        restoredComposites.add(composite);
        const restored = Object.freeze({
          correlationKey: parsedIdentity.correlationKey,
          signal: replayedOpen.signal
        });
        mutableByOwner.get(parsedIdentity.owner)!.push(restored);
        this.openSignals.set(composite, replayedOpen.signal);
      }
      for (const [owner, lifecycle] of owners) {
        const restored = Object.freeze([...(mutableByOwner.get(owner) ?? [])]);
        this.restoredByOwner.set(owner, restored);
        lifecycle.restore(restored);
      }
    } catch (error) {
      this.openSignals.clear();
      this.restoredByOwner.clear();
      this.lifecycleOwners.clear();
      throw new ObservationError("OBSERVATION_LIFECYCLE_RESTORE_INVALID", error);
    }
  }
}
