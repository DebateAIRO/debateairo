import { randomUUID } from "node:crypto";
import { join } from "node:path";
import pg from "pg";
import { loadObservationAgentEnvironment } from "../../../packages/register/src/runtime-environment.js";
import { createObservationDaemonDatabase } from "./core/database.js";
import { ObservationError, normalizeObservationError } from "./core/errors.js";
import type { SignalLifecycleIdentity } from "./core/lifecycle.js";
import { createOwnedSignalRouter, discoverObservationRuntimeModules } from "./core/modules.js";
import { observationRepoRoot } from "./core/paths.js";
import { ObservationModuleRuntime, parseModuleStatusProjection } from "./core/runtime.js";
import { createLegacyOsaScriptRouter, type SignalRouter } from "./core/routing.js";
import type { ObservationSignal } from "./core/signals.js";
import { readBootThresholdPolicy, ThresholdPolicyCache } from "./core/threshold-cache.js";
import { loadObservationTargetCatalog } from "./core/targets.js";
import {
  OBSERVATION_COMPONENTS,
  type ModuleConfigurationObject,
  type ProbeObservation,
  type StatusState
} from "./core/types.js";
import { ObservationJournal } from "./journal/journal.js";
import { replayObservationJournals } from "./journal/records.js";
import {
  createCoreLivenessObservationCoordinator,
  type CoreLivenessOpenSignal
} from "./modules/core-liveness/coordinator.js";
import { createLivenessTracker, inactiveClassRecoveries } from "./modules/core-liveness/state.js";
import { deliverJournalFailureDirect } from "./modules/self/direct-notify.js";
import { HeartbeatWriter, writeHeartbeatFailOpen } from "./modules/self/heartbeat.js";
import { makeSelfSignal, makeThresholdChangedSignal } from "./modules/self/signals.js";
import { DeliveryCoordinator } from "./notify/delivery.js";
import { createOsaScriptDeliveryExecutor } from "./notify/osascript.js";
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
import {
  mergeModuleStatus,
  toStoredModuleStatusProjection,
  writeStatusSnapshot,
  type StoredModuleStatusProjection
} from "./store/status.js";

const VERSION = "0.1.0";

type MutableComponentStatus = {
  state: StatusState;
  lastProbeAt: Date | null;
  lastOkAt: Date | null;
  openSignalIds: Set<string>;
};

async function boot(): Promise<void> {
  const repoRoot = observationRepoRoot();
  let environment: ReturnType<typeof loadObservationAgentEnvironment>;
  try {
    environment = loadObservationAgentEnvironment();
  } catch (error) {
    throw new ObservationError("OBSERVATION_ENV_INVALID", error);
  }
  const moduleCatalog = await discoverObservationRuntimeModules(join(import.meta.dirname, "modules"));
  const targetCatalog = await loadObservationTargetCatalog(environment.OBSERVATION_TARGETS_PATH);
  const ownedTargetFragments = new Set(moduleCatalog.targetFragments);
  if (targetCatalog.fragments.some((fragment) => !ownedTargetFragments.has(fragment.basename))) {
    throw new ObservationError("OBSERVATION_TARGETS_INVALID");
  }
  const targets = targetCatalog.targets;
  const journal = new ObservationJournal(environment.OBSERVATION_STATE_DIR);
  const lifecycleOwners = new Set([
    "core-liveness",
    ...moduleCatalog.modules
      .filter((module) => module.lifecycle !== undefined)
      .map((module) => module.name)
  ]);
  const replayed = await replayObservationJournals(
    environment.OBSERVATION_STATE_DIR,
    lifecycleOwners
  );

  const bootstrapPool = new pg.Pool({
    connectionString: environment.OBSERVATION_DATABASE_URL,
    max: 1
  });
  const thresholdCache = new ThresholdPolicyCache(environment.OBSERVATION_STATE_DIR);
  let policy: RatifiedThresholdPolicy;
  try {
    ({ policy } = await readBootThresholdPolicy({
      repository: new ThresholdRepository(bootstrapPool),
      cache: thresholdCache
    }));
  } finally {
    await bootstrapPool.end();
  }

  const { pool, database } = createObservationDaemonDatabase({
    connectionString: environment.OBSERVATION_DATABASE_URL,
    policy
  });
  const repository = new ThresholdRepository(pool);
  const mirror = new PostgresMirror(pool);
  const delivery = new DeliveryCoordinator({ journal, mirror });
  const osascript = createOsaScriptDeliveryExecutor();
  const routerOwner = moduleCatalog.routerContribution;
  const routerTargetFragments = routerOwner === null ? [] : targetCatalog.fragments.filter(
    (fragment) => fragment.basename === routerOwner.targetFragmentBasename
  );
  if (routerOwner !== null && routerTargetFragments.length !== 1) {
    throw new ObservationError("OBSERVATION_MODULE_INVALID");
  }
  const currentRouterModule = () => Object.freeze({
    thresholdVersion: policy.version,
    thresholds: Object.freeze({
      ...(routerOwner === null ? {} : policy.value.modules?.[routerOwner.moduleName] ?? {})
    }) as ModuleConfigurationObject
  });
  const heartbeat = new HeartbeatWriter({ pool, stateDir: environment.OBSERVATION_STATE_DIR });
  let nextSequence = Date.now() * 1_000;
  const sequence = () => { nextSequence += 1; return nextSequence; };
  const tracker = createLivenessTracker({
    openAfterFailures: policy.value.liveness.open_after_failures,
    clearAfterSuccesses: policy.value.liveness.clear_after_successes
  });
  const openSignals = new Map<string, CoreLivenessOpenSignal>();
  const status = new Map<string, MutableComponentStatus>();
  const moduleStatus = new Map<string, readonly StoredModuleStatusProjection[]>();
  for (const target of targets) {
    if (!OBSERVATION_COMPONENTS.includes(target.component as never)) continue;
    status.set(target.component, {
      state: "UNKNOWN", lastProbeAt: null, lastOkAt: null, openSignalIds: new Set()
    });
  }
  let shuttingDown = false;
  let cycling = false;
  let timer: NodeJS.Timeout;
  let router: SignalRouter | null = null;

  async function emit(
    signal: ObservationSignal,
    now: Date,
    lifecycle: SignalLifecycleIdentity | null = null
  ): Promise<void> {
    try {
      await persistSignal({ signal, lifecycle, journal, mirror });
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
    if (router === null) throw new ObservationError("OBSERVATION_LIFECYCLE_RESTORE_INVALID");
    const routingMute = await readMute(environment.OBSERVATION_STATE_DIR, now).catch(() => null);
    await router.onSignal({
      signal,
      now,
      policy: {
        rateLimitMs: policy.value.notification.rate_limit_ms,
        degradedAfterMs: policy.value.notification.degraded_after_ms,
        timeoutMs: policy.value.notification.timeout_ms
      },
      mute: routingMute === null || routingMute.component === undefined
        ? routingMute === null ? null : {}
        : { component: routingMute.component },
      module: currentRouterModule()
    }).catch(async (error) => {
      await deliverJournalFailureDirect({ timeoutMs: policy.value.notification.timeout_ms })
        .catch(() => undefined);
      throw error;
    });
  }

  const moduleRuntime = new ObservationModuleRuntime({
    modules: moduleCatalog.modules,
    replayedOpenSignals: replayed.openSignals,
    lifecycleOwners: Object.freeze([Object.freeze({
      owner: "core-liveness",
      lifecycle: Object.freeze({
        legacyCorrelationKey: tracker.legacyCorrelationKey,
        restore: tracker.restore
      })
    })]),
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
      const projections = update.projections.map(toStoredModuleStatusProjection);
      if (projections.length === 0) moduleStatus.delete(moduleName);
      else moduleStatus.set(moduleName, Object.freeze(projections));
    }
  });

  for (const owner of lifecycleOwners) {
    for (const restored of moduleRuntime.restoredOpenSignals(owner)) {
      const componentStatus = status.get(restored.signal.component) ?? {
        state: "UNKNOWN" as const,
        lastProbeAt: null,
        lastOkAt: null,
        openSignalIds: new Set<string>()
      };
      componentStatus.openSignalIds.add(restored.signal.signal_id);
      if (owner === "core-liveness") componentStatus.state = "DOWN";
      status.set(restored.signal.component, componentStatus);
      if (owner === "core-liveness") {
        openSignals.set(restored.correlationKey, Object.freeze({
          signal: restored.signal,
          openedAt: new Date(restored.signal.detected_at)
        }));
      }
    }
  }

  const initialRouterModule = currentRouterModule();
  const initializedRouter = routerOwner === null
    ? createLegacyOsaScriptRouter({ delivery, osascript })
    : await createOwnedSignalRouter(routerOwner, {
        stateDir: environment.OBSERVATION_STATE_DIR,
        repoRoot,
        delivery,
        osascript,
        moduleName: routerOwner.moduleName,
        targetFragment: routerTargetFragments[0]!,
        configuration: routerTargetFragments[0]!.configuration,
        thresholds: initialRouterModule.thresholds,
        thresholdVersion: initialRouterModule.thresholdVersion,
        deliveryResults: replayed.deliveryResults
      });
  router = initializedRouter;

  const livenessCoordinator = createCoreLivenessObservationCoordinator({
    tracker,
    openSignals,
    nextSequence: sequence,
    nextSignalId: randomUUID,
    emit
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
    const componentStatus = status.get(observation.component);
    await livenessCoordinator.observe({
      observation,
      now,
      thresholdVersion: policy.version,
      openAfterFailures: policy.value.liveness.open_after_failures,
      clearAfterSuccesses: policy.value.liveness.clear_after_successes,
      severity: routeSeverity(policy.value, observation.class, observation.component),
      onTransition(state) {
        if (componentStatus !== undefined && updateComponentStatus) {
          componentStatus.state = state;
          componentStatus.lastProbeAt = now;
          if (observation.ok) componentStatus.lastOkAt = now;
        }
      },
      onOpened(signal) {
        componentStatus?.openSignalIds.add(signal.signal_id);
      },
      onCleared(signalId) {
        componentStatus?.openSignalIds.delete(signalId);
      }
    });
  }

  async function probeTargets(now: Date): Promise<readonly ProbeObservation[]> {
    return moduleRuntime.run({
      modules: moduleCatalog.modules,
      now,
      timeoutMs: policy.value.liveness.probe_timeout_ms,
      database,
      stateDir: environment.OBSERVATION_STATE_DIR,
      repoRoot,
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
      const reloaded = await reloadThresholdPolicy(
        repository,
        policy,
        (current) => thresholdCache.write(current)
      );
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

      const routingMute = await readMute(environment.OBSERVATION_STATE_DIR, now).catch(() => null);
      await initializedRouter.onTick({
        now,
        policy: {
          rateLimitMs: policy.value.notification.rate_limit_ms,
          degradedAfterMs: policy.value.notification.degraded_after_ms,
          timeoutMs: policy.value.notification.timeout_ms
        },
        mute: routingMute === null || routingMute.component === undefined
          ? routingMute === null ? null : {}
          : { component: routingMute.component },
        module: currentRouterModule()
      });

      const routerStatus = initializedRouter.status().map((projection) =>
        toStoredModuleStatusProjection(parseModuleStatusProjection(projection)));
      const mergedModuleStatus = mergeModuleStatus(
        moduleStatus, routerOwner?.moduleName ?? null, routerStatus
      );
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
        ...(Object.keys(mergedModuleStatus).length === 0 ? {} : {
          modules: mergedModuleStatus
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
