import { randomUUID } from "node:crypto";
import { join } from "node:path";
import pg from "pg";
import { loadObservationAgentEnvironment } from "../../../packages/register/src/runtime-environment.js";
import { ObservationError, normalizeObservationError } from "./core/errors.js";
import { discoverObservationModules } from "./core/modules.js";
import { ObservationModuleRuntime } from "./core/runtime.js";
import { signalSchema, type ObservationSignal, type Severity } from "./core/signals.js";
import { loadObservationTargetCatalog } from "./core/targets.js";
import {
  OBSERVATION_COMPONENTS,
  type ModuleStatusProjection,
  type ProbeObservation,
  type StatusState
} from "./core/types.js";
import { ObservationJournal } from "./journal/journal.js";
import { createLivenessTracker, inactiveClassRecoveries } from "./modules/core-liveness/state.js";
import { deliverJournalFailureDirect } from "./modules/self/direct-notify.js";
import { HeartbeatWriter, writeHeartbeatFailOpen } from "./modules/self/heartbeat.js";
import { makeSelfSignal, makeThresholdChangedSignal } from "./modules/self/signals.js";
import { OsaScriptNotifier } from "./notify/osascript.js";
import { readMute } from "./oactl/core/state.js";
import {
  reloadThresholdPolicy,
  routeSeverity,
  ThresholdRepository,
  type RatifiedThresholdPolicy
} from "./oactl/core/thresholds.js";
import { persistSignal } from "./store/pipeline.js";
import { PostgresMirror } from "./store/postgres.js";
import { SampleRingStore } from "./store/samples.js";
import { writeStatusSnapshot } from "./store/status.js";

const VERSION = "0.1.0";

type OpenSignal = Readonly<{ signal: ObservationSignal; openedAt: Date }>;
type MutableComponentStatus = {
  state: StatusState;
  lastProbeAt: Date | null;
  lastOkAt: Date | null;
  openSignalIds: Set<string>;
};

function impactFor(observation: ProbeObservation): ObservationSignal["impact_code"] {
  if (observation.class === "INFRA_NOT_READY") return "IMPACT_HATCHET_NOT_READY";
  if (observation.class === "INFRA_UNKNOWN" || observation.component === "docker") {
    return "IMPACT_DOCKER_DOWN";
  }
  if (observation.component === "postgres") return "IMPACT_PG_DOWN";
  return "IMPACT_HATCHET_DOWN";
}

function safeLastStatus(observation: ProbeObservation): number | "READY" | "FAILED" | "UNKNOWN" | "WRITTEN" {
  if (typeof observation.lastStatus === "number") return observation.lastStatus;
  if (["READY", "FAILED", "UNKNOWN", "WRITTEN"].includes(observation.lastStatus)) {
    return observation.lastStatus as "READY" | "FAILED" | "UNKNOWN" | "WRITTEN";
  }
  return observation.ok ? "READY" : "FAILED";
}

function livenessSignal(input: Readonly<{
  seq: number;
  signalId: string;
  observation: ProbeObservation;
  kind: "OPEN" | "CLEARED";
  at: Date;
  firstFailedAt?: Date;
  thresholdVersion: number;
  threshold: number;
  severity: Severity;
  clearsSignalId?: string;
  openedAt?: Date;
}>): ObservationSignal {
  const commonEvidence = {
    probe: input.observation.probe,
    ...(input.observation.target === undefined ? {} : { target: input.observation.target }),
    last_status: safeLastStatus(input.observation)
  };
  const evidence = input.kind === "CLEARED"
    ? {
        ...commonEvidence,
        consecutive_failures: 0,
        threshold: input.threshold,
        ...(input.openedAt === undefined ? {} : {
          duration_seconds: Math.max(0, (input.at.getTime() - input.openedAt.getTime()) / 1_000)
        })
      }
    : {
        ...commonEvidence,
        consecutive_failures: input.threshold,
        threshold: input.threshold,
        ...(input.observation.containerStatus === undefined ? {} : {
          container_status: input.observation.containerStatus
        }),
        ...(input.observation.restartPolicy === undefined ? {} : {
          restart_policy: input.observation.restartPolicy
        }),
        ...(input.observation.exitCode === undefined ? {} : { exit_code: input.observation.exitCode })
      };
  const timestamp = input.at.toISOString();
  return Object.freeze(signalSchema.parse({
    seq: input.seq,
    signal_id: input.signalId,
    state: input.kind,
    class: input.observation.class,
    component: input.observation.component,
    severity: input.severity,
    impact_code: input.kind === "CLEARED" ? "IMPACT_CLEARED" : impactFor(input.observation),
    first_failed_probe_at: input.firstFailedAt?.toISOString() ?? null,
    detected_at: timestamp,
    evidence,
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: input.thresholdVersion,
    clears_signal_id: input.clearsSignalId ?? null,
    recorded_at: timestamp
  }));
}

async function boot(): Promise<void> {
  let environment: ReturnType<typeof loadObservationAgentEnvironment>;
  try {
    environment = loadObservationAgentEnvironment();
  } catch (error) {
    throw new ObservationError("OBSERVATION_ENV_INVALID", error);
  }
  const moduleCatalog = await discoverObservationModules(join(import.meta.dirname, "modules"));
  const targetCatalog = await loadObservationTargetCatalog(environment.OBSERVATION_TARGETS_PATH);
  const ownedTargetFragments = new Set(moduleCatalog.targetFragments);
  if (targetCatalog.fragments.some((fragment) => !ownedTargetFragments.has(fragment.basename))) {
    throw new ObservationError("OBSERVATION_TARGETS_INVALID");
  }
  const targets = targetCatalog.targets;

  const bootstrapPool = new pg.Pool({
    connectionString: environment.OBSERVATION_DATABASE_URL,
    max: 1
  });
  let policy: RatifiedThresholdPolicy;
  try {
    policy = await new ThresholdRepository(bootstrapPool).readCurrent();
  } finally {
    await bootstrapPool.end();
  }

  const pool = new pg.Pool({
    connectionString: environment.OBSERVATION_DATABASE_URL,
    max: policy.value.resources.max_database_sessions
  });
  const repository = new ThresholdRepository(pool);
  const journal = new ObservationJournal(environment.OBSERVATION_STATE_DIR);
  const mirror = new PostgresMirror(pool);
  const notifier = new OsaScriptNotifier({ journal, mirror });
  const heartbeat = new HeartbeatWriter({ pool, stateDir: environment.OBSERVATION_STATE_DIR });
  let nextSequence = Date.now() * 1_000;
  const sequence = () => { nextSequence += 1; return nextSequence; };
  const tracker = createLivenessTracker({
    openAfterFailures: policy.value.liveness.open_after_failures,
    clearAfterSuccesses: policy.value.liveness.clear_after_successes
  });
  const openSignals = new Map<string, OpenSignal>();
  const status = new Map<string, MutableComponentStatus>();
  const moduleStatus = new Map<string, readonly Readonly<Record<string, unknown>>[]>();
  for (const target of targets) {
    if (!OBSERVATION_COMPONENTS.includes(target.component as never)) continue;
    status.set(target.component, {
      state: "UNKNOWN", lastProbeAt: null, lastOkAt: null, openSignalIds: new Set()
    });
  }
  let shuttingDown = false;
  let cycling = false;
  let timer: NodeJS.Timeout;

  async function emit(signal: ObservationSignal, now: Date): Promise<void> {
    try {
      await persistSignal({ signal, journal, mirror });
    } catch {
      await deliverJournalFailureDirect({ timeoutMs: policy.value.notification.timeout_ms })
        .catch(() => undefined);
      return;
    }
    const componentStatus = status.get(signal.component) ?? {
      state: "UNKNOWN" as const,
      lastProbeAt: null,
      lastOkAt: null,
      openSignalIds: new Set<string>()
    };
    status.set(signal.component, componentStatus);
    if (signal.state === "OPEN") componentStatus.openSignalIds.add(signal.signal_id);
    else if (signal.clears_signal_id !== null) componentStatus.openSignalIds.delete(signal.clears_signal_id);
    const mute = await readMute(environment.OBSERVATION_STATE_DIR, now).catch(() => null);
    await notifier.deliver(signal, {
      now,
      muted: mute !== null && (mute.component === undefined || mute.component === signal.component),
      rateLimitMs: policy.value.notification.rate_limit_ms,
      timeoutMs: policy.value.notification.timeout_ms
    }).catch(async (error) => {
      await deliverJournalFailureDirect({ timeoutMs: policy.value.notification.timeout_ms })
        .catch(() => undefined);
      throw error;
    });
  }

  const moduleRuntime = new ObservationModuleRuntime({
    nextSequence: sequence,
    nextSignalId: randomUUID,
    sampleStore: new SampleRingStore(pool),
    emitSignal: emit,
    updateModuleStatus(moduleName, update) {
      for (const observation of update.observations) {
        const componentStatus = status.get(observation.component) ?? {
          state: "UNKNOWN" as const,
          lastProbeAt: null,
          lastOkAt: null,
          openSignalIds: new Set<string>()
        };
        status.set(observation.component, componentStatus);
        componentStatus.state = observation.statusState ?? (observation.ok ? "UP" : "DOWN");
        componentStatus.lastProbeAt = observation.observedAt ?? new Date();
        if (observation.ok) componentStatus.lastOkAt = observation.observedAt ?? new Date();
      }
      const projections = update.projections.map((projection: ModuleStatusProjection) => {
        if (projection.kind === "state") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            state: projection.state,
            ...(projection.view === undefined ? {} : { view: projection.view }),
            ...(projection.observedAt === undefined ? {} : {
              observed_at: projection.observedAt.toISOString()
            })
          });
        }
        if (projection.kind === "metric") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            value: projection.value,
            unit: projection.unit,
            ...(projection.view === undefined ? {} : { view: projection.view }),
            ...(projection.observedAt === undefined ? {} : {
              observed_at: projection.observedAt.toISOString()
            })
          });
        }
        if (projection.kind === "timestamp") {
          return Object.freeze({
            kind: projection.kind,
            key: projection.key,
            value: projection.value?.toISOString() ?? null,
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
      });
      if (projections.length === 0) moduleStatus.delete(moduleName);
      else moduleStatus.set(moduleName, Object.freeze(projections));
    }
  });

  const startAt = new Date();
  const previousExitReason = await journal.previousRunExitReason();
  await emit(makeSelfSignal({
    seq: sequence(), signalId: randomUUID(), now: startAt,
    thresholdVersion: policy.version, event: "START", previousExitReason
  }), startAt);

  async function observe(
    observation: ProbeObservation,
    now: Date,
    updateComponentStatus = true
  ): Promise<void> {
    const key = `${observation.component}:${observation.class}`;
    const transition = tracker.observe({
      component: observation.component, class: observation.class, ok: observation.ok, at: now
    });
    const componentStatus = status.get(observation.component);
    if (componentStatus !== undefined && updateComponentStatus) {
      componentStatus.state = transition.state;
      componentStatus.lastProbeAt = now;
      if (observation.ok) componentStatus.lastOkAt = now;
    }
    if (transition.event?.kind === "OPEN") {
      const signal = livenessSignal({
        seq: sequence(), signalId: randomUUID(), observation, kind: "OPEN", at: now,
        ...(transition.event.firstFailedProbeAt === undefined ? {} : {
          firstFailedAt: transition.event.firstFailedProbeAt
        }),
        thresholdVersion: policy.version,
        threshold: policy.value.liveness.open_after_failures,
        severity: routeSeverity(policy.value, observation.class, observation.component)
      });
      openSignals.set(key, Object.freeze({ signal, openedAt: now }));
      componentStatus?.openSignalIds.add(signal.signal_id);
      await emit(signal, now);
    } else if (transition.event?.kind === "CLEARED") {
      const opened = openSignals.get(key);
      if (opened !== undefined) {
        const signal = livenessSignal({
          seq: sequence(), signalId: randomUUID(), observation, kind: "CLEARED", at: now,
          thresholdVersion: policy.version,
          threshold: policy.value.liveness.clear_after_successes,
          severity: routeSeverity(policy.value, observation.class, observation.component),
          clearsSignalId: opened.signal.signal_id,
          ...(opened.signal.first_failed_probe_at === null ? {} : {
            firstFailedAt: new Date(opened.signal.first_failed_probe_at)
          }),
          openedAt: opened.openedAt
        });
        openSignals.delete(key);
        componentStatus?.openSignalIds.delete(opened.signal.signal_id);
        await emit(signal, now);
      }
    }
  }

  async function probeTargets(now: Date): Promise<readonly ProbeObservation[]> {
    return moduleRuntime.run({
      modules: moduleCatalog.modules,
      now,
      timeoutMs: policy.value.liveness.probe_timeout_ms,
      databaseUrl: environment.OBSERVATION_DATABASE_URL,
      stateDir: environment.OBSERVATION_STATE_DIR,
      targets,
      targetFragments: targetCatalog.fragments,
      ...(policy.value.modules === undefined ? {} : { moduleThresholds: policy.value.modules }),
      thresholdVersion: policy.version
    });
  }

  async function cycle(): Promise<void> {
    if (cycling || shuttingDown) return;
    cycling = true;
    const now = new Date();
    try {
      const reloaded = await reloadThresholdPolicy(repository, policy);
      if (reloaded.version !== policy.version) {
        const previousVersion = policy.version;
        policy = reloaded;
        tracker.updatePolicy({
          openAfterFailures: policy.value.liveness.open_after_failures,
          clearAfterSuccesses: policy.value.liveness.clear_after_successes
        });
        await emit(makeThresholdChangedSignal({
          seq: sequence(), signalId: randomUUID(), now,
          thresholdVersion: policy.version, previousVersion, currentVersion: policy.version
        }), now);
        clearInterval(timer);
        timer = setInterval(() => { void cycle().catch(() => undefined); }, policy.value.liveness.probe_interval_ms);
      }
      await writeHeartbeatFailOpen(heartbeat, {
        now, pid: process.pid, version: VERSION, thresholdsVersion: policy.version
      });
      await mirror.catchUp(environment.OBSERVATION_STATE_DIR).catch(() => undefined);
      for (const observation of await probeTargets(now)) {
        await observe(observation, now);
        const openClasses = [...openSignals.values()]
          .filter((opened) => opened.signal.component === observation.component)
          .map((opened) => opened.signal.class);
        for (const recovery of inactiveClassRecoveries(observation, openClasses)) {
          await observe(recovery, now, false);
        }
      }

      for (const opened of openSignals.values()) {
        if (opened.signal.severity !== "DEGRADED"
          || now.getTime() - opened.openedAt.getTime() < policy.value.notification.degraded_after_ms) continue;
        const mute = await readMute(environment.OBSERVATION_STATE_DIR, now).catch(() => null);
        await notifier.deliver(opened.signal, {
          now,
          muted: mute !== null && (mute.component === undefined || mute.component === opened.signal.component),
          rateLimitMs: policy.value.notification.rate_limit_ms,
          timeoutMs: policy.value.notification.timeout_ms,
          allowDegraded: true
        });
      }

      const mute = await readMute(environment.OBSERVATION_STATE_DIR, now).catch(() => null);
      await writeStatusSnapshot(environment.OBSERVATION_STATE_DIR, {
        pid: process.pid,
        version: VERSION,
        thresholds_version: policy.version,
        mute: mute === null ? null : {
          expires_at: mute.expires_at,
          component: mute.component ?? null
        },
        components: Object.fromEntries([...status.entries()].map(([component, value]) => [component, {
          state: value.state,
          last_probe_at: value.lastProbeAt?.toISOString() ?? null,
          last_ok_at: value.lastOkAt?.toISOString() ?? null,
          open_signal_ids: [...value.openSignalIds]
        }])),
        ...(moduleStatus.size === 0 ? {} : {
          modules: Object.fromEntries(moduleStatus.entries())
        })
      });
    } finally {
      cycling = false;
    }
  }

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    clearInterval(timer);
    const stopAt = new Date();
    await Promise.race([
      emit(makeSelfSignal({
        seq: sequence(), signalId: randomUUID(), now: stopAt,
        thresholdVersion: policy.version, event: "STOP"
      }), stopAt),
      new Promise<void>((resolvePromise) => setTimeout(resolvePromise, 4_000))
    ]);
    await pool.end();
  }

  process.on("SIGTERM", () => { void shutdown().finally(() => { process.exitCode = 0; }); });
  process.on("SIGINT", () => { void shutdown().finally(() => { process.exitCode = 0; }); });
  await cycle();
  timer = setInterval(() => { void cycle().catch(() => undefined); }, policy.value.liveness.probe_interval_ms);
}

void boot().catch((error: unknown) => {
  process.stderr.write(`${normalizeObservationError(error)}\n`);
  process.exitCode = 2;
});
