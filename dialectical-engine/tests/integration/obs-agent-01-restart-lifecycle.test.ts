import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObservationError } from "../../apps/observation-agent/src/core/errors.js";
import type { ReplayedOpenSignal } from "../../apps/observation-agent/src/core/lifecycle.js";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import { signalSchema, type ObservationSignal } from "../../apps/observation-agent/src/core/signals.js";
import { ThresholdPolicyCache } from "../../apps/observation-agent/src/core/threshold-cache.js";
import type { Module, ModuleLifecycle, ProbeObservation, SignalIntent } from "../../apps/observation-agent/src/core/types.js";
import { ObservationJournal } from "../../apps/observation-agent/src/journal/journal.js";
import { replayObservationJournals } from "../../apps/observation-agent/src/journal/records.js";
import {
  probeDockerEngine,
  probePostgres
} from "../../apps/observation-agent/src/modules/core-liveness/probes.js";
import {
  createCoreLivenessObservationCoordinator
} from "../../apps/observation-agent/src/modules/core-liveness/coordinator.js";
import { materializeLivenessSignal } from "../../apps/observation-agent/src/modules/core-liveness/signals.js";
import { createLivenessTracker } from "../../apps/observation-agent/src/modules/core-liveness/state.js";
import {
  createStallDetectorsModule
} from "../../apps/observation-agent/src/modules/stall-detectors/module.js";
import type {
  WorkerHeartbeatSnapshot
} from "../../apps/observation-agent/src/modules/stall-detectors/heartbeat.js";
import { createWorkerHeartbeatTracker } from "../../apps/observation-agent/src/modules/stall-detectors/heartbeat.js";
import { createDefectLifecycle } from "../../apps/observation-agent/src/modules/stall-detectors/lifecycle.js";
import { createDefectDetectorTracker } from "../../apps/observation-agent/src/modules/stall-detectors/detectors.js";
import { persistSignal } from "../../apps/observation-agent/src/store/pipeline.js";
import { createAlwaysExpectedTracker } from "../../apps/observation-agent/src/modules/expectations/always.js";
import { createExpectedSetTracker } from "../../apps/observation-agent/src/modules/expectations/state.js";
import { createProbeLatencyTracker } from "../../apps/observation-agent/src/modules/product-liveness/latency.js";
import { createCaptureHealthTracker } from "../../apps/observation-agent/src/modules/capture-health/tracker.js";
import { createCaptureGapTracker } from "../../apps/observation-agent/src/modules/capture-health/gaps.js";
import { createSpoolHealthTracker } from "../../apps/observation-agent/src/modules/spool-health/tracker.js";
import { createHostCapacityTracker } from "../../apps/observation-agent/src/modules/host-capacity/tracker.js";
import { createPostgresCapacityTracker } from "../../apps/observation-agent/src/modules/postgres-capacity/tracker.js";
import { createCertificateCapacityTracker } from "../../apps/observation-agent/src/modules/certificate-capacity/tracker.js";
import { createProviderHealthTracker } from "../../apps/observation-agent/src/modules/provider-health/tracker.js";
import { createRunFailureTracker } from "../../apps/observation-agent/src/modules/throughput/tracker.js";
import { createHatchetThroughputTracker } from "../../apps/observation-agent/src/modules/hatchet-throughput/tracker.js";
import { createContainerWitness } from "../../apps/observation-agent/src/modules/witness/state.js";
import { createScheduleTracker } from "../../apps/observation-agent/src/modules/job-witness/witness.js";
import {
  createDeliveryHealthTracker,
  deliveryHealthLegacyCorrelationKey
} from "../../apps/observation-agent/src/modules/routing/delivery-health.js";
import { createRoutingModule } from "../../apps/observation-agent/src/modules/routing/module.js";
import { createStatusPageModule } from "../../apps/observation-agent/src/modules/status-page/module.js";
import { createChannelsSendmailModule } from "../../apps/observation-agent/src/modules/channels-sendmail/module.js";
import { parseRatifiedThresholdPolicy } from "../../apps/observation-agent/src/oactl/core/thresholds.js";

const scratchDirectories: string[] = [];
const start = new Date("2026-09-06T00:00:00.000Z");
const originalId = "74000000-0000-4000-8000-000000000001";
const database = Object.freeze({
  async withClient<T>(): Promise<T> { throw new Error("UNUSED_DATABASE_PORT"); }
});

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

function workerSnapshot(
  state: "FRESH" | "STALE",
  observedAt: Date
): WorkerHeartbeatSnapshot {
  const lastHeartbeatAt = new Date(observedAt.getTime() - (state === "STALE" ? 31_000 : 1_000));
  return Object.freeze({
    state,
    workerRef: "debateai-dev-runner",
    heartbeatAgeSeconds: state === "STALE" ? 31 : 1,
    heartbeatThresholdSeconds: 30,
    lastHeartbeatAt,
    observedAt,
    evidence: Object.freeze({ health: state })
  });
}

function runtimeInput(module: Module, now: Date) {
  return Object.freeze({
    modules: Object.freeze([module]),
    now,
    timeoutMs: 2_000,
    database,
    stateDir: "/tmp/obs-agent-restart-fixture",
    repoRoot: "/tmp/obs-agent-restart-repo",
    targets: Object.freeze([]),
    thresholdVersion: 4,
    moduleThresholds: Object.freeze({
      "stall-detectors": Object.freeze({ detector_interval_ms: 10_000 })
    })
  });
}

function livenessOpen(signalId = originalId): ObservationSignal {
  return signalSchema.parse({
    seq: 1,
    signal_id: signalId,
    state: "OPEN",
    class: "INFRA_DOWN",
    component: "hatchet",
    severity: "FATAL",
    impact_code: "IMPACT_HATCHET_DOWN",
    first_failed_probe_at: start.toISOString(),
    detected_at: new Date(start.getTime() + 5_000).toISOString(),
    evidence: {
      probe: "http_get",
      target: "hatchet:/api/live",
      consecutive_failures: 2,
      threshold: 2,
      last_status: 0
    },
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: 4,
    clears_signal_id: null,
    recorded_at: new Date(start.getTime() + 5_000).toISOString()
  });
}

function workerOpen(signalId = originalId): ObservationSignal {
  return signalSchema.parse({
    seq: 1,
    signal_id: signalId,
    state: "OPEN",
    class: "WORKER_LOST",
    component: "runner",
    severity: "SEVERE",
    impact_code: "IMPACT_WORKER_LOST",
    first_failed_probe_at: start.toISOString(),
    detected_at: new Date(start.getTime() + 1_000).toISOString(),
    evidence: {
      worker_ref: "debateai-dev-runner",
      heartbeat_age_s: 31,
      heartbeat_threshold_s: 30,
      health: "STALE"
    },
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: 4,
    clears_signal_id: null,
    recorded_at: new Date(start.getTime() + 1_000).toISOString()
  });
}

function exactOpen(input: Readonly<{
  id: string;
  component: ObservationSignal["component"];
  class: ObservationSignal["class"];
  severity: ObservationSignal["severity"];
  impactCode: ObservationSignal["impact_code"];
  evidence: Readonly<Record<string, unknown>>;
  suspectedDefect?: boolean;
  defectKind?: ObservationSignal["defect_kind"];
  runRef?: string | null;
  workItemRef?: string | null;
}>): ObservationSignal {
  return signalSchema.parse({
    seq: 1,
    signal_id: input.id,
    state: "OPEN",
    class: input.class,
    component: input.component,
    severity: input.severity,
    impact_code: input.impactCode,
    first_failed_probe_at: start.toISOString(),
    detected_at: start.toISOString(),
    evidence: input.evidence,
    suspected_defect: input.suspectedDefect ?? false,
    defect_kind: input.defectKind ?? null,
    run_ref: input.runRef ?? null,
    work_item_ref: input.workItemRef ?? null,
    threshold_version: 4,
    clears_signal_id: null,
    recorded_at: start.toISOString()
  });
}

function lifecycleOf(tracker: Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(opens: readonly import("../../apps/observation-agent/src/core/types.js").RestoredOpenSignal[]): void;
}>): ModuleLifecycle {
  return Object.freeze({
    legacyCorrelationKey: tracker.legacyCorrelationKey,
    restore: tracker.restore
  });
}

function combineLifecycles(...lifecycles: readonly ModuleLifecycle[]): ModuleLifecycle {
  return Object.freeze({
    legacyCorrelationKey(signal) {
      const matches = lifecycles.flatMap((lifecycle) => {
        const key = lifecycle.legacyCorrelationKey(signal);
        return key === null ? [] : [key];
      });
      return matches.length === 1 ? matches[0]! : null;
    },
    restore(opens) {
      for (const lifecycle of lifecycles) {
        lifecycle.restore(opens.filter((open) =>
          lifecycle.legacyCorrelationKey(open.signal) === open.correlationKey));
      }
    }
  });
}

type LifecyclePhase = "OPEN" | "CONTINUING" | "RECOVERED";
type ActualLifecycleDriver = Readonly<{
  lifecycle: ModuleLifecycle;
  signals(phase: LifecyclePhase, at: Date): readonly SignalIntent[];
  recoveryOffsetsMs?: readonly number[];
}>;

async function roundTripRealLifecycle(input: Readonly<{
  owner: string;
  expectedCorrelationKeys: readonly string[];
  createDriver(): ActualLifecycleDriver;
}>): Promise<void> {
  const stateDir = await mkdtemp(join(tmpdir(), `obs-restart-${input.owner}-`));
  scratchDirectories.push(stateDir);
  const journal = new ObservationJournal(stateDir);
  const emitted: Array<Readonly<{
    signal: ObservationSignal;
    lifecycle: Readonly<{ owner: string; correlationKey: string }>;
  }>> = [];
  let sequence = 100;
  let idCalls = 0;
  const createRuntime = (module: Module, replayedOpenSignals: readonly ReplayedOpenSignal[]) => {
    try {
      return new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      replayedOpenSignals,
      nextSequence: () => ++sequence,
      nextSignalId: () => {
        idCalls += 1;
        return crypto.randomUUID();
      },
      sampleStore: { async write() {} },
      async emitSignal(signal, _now, lifecycle) {
        const result = await persistSignal({
          signal,
          lifecycle,
          journal,
          mirror: { async mirrorSignal() { throw new Error("POSTGRES_UNAVAILABLE"); } }
        });
        expect(result.mirrored).toBe(false);
        emitted.push(Object.freeze({ signal, lifecycle }));
      }
      });
    } catch (error) {
      throw new Error(`restart owner ${input.owner} failed reconstruction`, { cause: error });
    }
  };
  const drivenModule = (driver: ActualLifecycleDriver, initial: LifecyclePhase) => {
    let phase = initial;
    return Object.freeze({
      module: lifecycleModule(input.owner, driver.lifecycle, undefined, (_observations, context) =>
        driver.signals(phase, context.now)),
      phase(next: LifecyclePhase) { phase = next; }
    });
  };

  const first = drivenModule(input.createDriver(), "OPEN");
  await createRuntime(first.module, Object.freeze([])).run(runtimeInput(first.module, start));
  const expectedCorrelationKeys = [...input.expectedCorrelationKeys].sort();
  const openedSignals = emitted.filter(({ signal }) => signal.state === "OPEN");
  expect(openedSignals.map(({ lifecycle }) => lifecycle.correlationKey).sort(), input.owner)
    .toEqual(expectedCorrelationKeys);
  const expectedOpenCount = expectedCorrelationKeys.length;
  const originals = new Map(openedSignals.map(({ signal, lifecycle }) => [
    lifecycle.correlationKey,
    signal.signal_id
  ]));
  expect(originals.size, `${input.owner}:unique-original-keys`).toBe(expectedOpenCount);
  const replayed = await replayObservationJournals(stateDir, new Set([input.owner]));
  expect(replayed.openSignals.map((open) =>
    open.lifecycle?.correlationKey ?? "<legacy>").sort(), `${input.owner}:initial-replay`)
    .toEqual(expectedCorrelationKeys);

  const assertRejectedBeforeProbe = (
    rawSignal: unknown,
    correlationKey: string,
    label: string,
    mustReachOwnerBoundary: boolean
  ) => {
    const parsed = signalSchema.safeParse(rawSignal);
    if (!parsed.success) {
      expect(mustReachOwnerBoundary, `${input.owner}:${correlationKey}:${label}:shared-schema`)
        .toBe(false);
      return;
    }
    expect(mustReachOwnerBoundary, `${input.owner}:${correlationKey}:${label}:owner-boundary`)
      .toBe(true);
    const driver = input.createDriver();
    expect(driver.lifecycle.legacyCorrelationKey(parsed.data), `${input.owner}:${correlationKey}:${label}`)
      .not.toBe(correlationKey);
    let probes = 0;
    let routes = 0;
    const module = lifecycleModule(input.owner, driver.lifecycle, async () => {
      probes += 1;
      return Object.freeze([]);
    });
    expect(() => new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      replayedOpenSignals: Object.freeze([Object.freeze({
        signal: parsed.data,
        lifecycle: Object.freeze({ owner: input.owner, correlationKey })
      })]),
      nextSequence: () => 1,
      nextSignalId: () => crypto.randomUUID(),
      sampleStore: { async write() {} },
      async emitSignal() { routes += 1; }
    }), `${input.owner}:${correlationKey}:${label}`).toThrow("OBSERVATION_LIFECYCLE_RESTORE_INVALID");
    expect(probes, `${input.owner}:${correlationKey}:${label}:probes`).toBe(0);
    expect(routes, `${input.owner}:${correlationKey}:${label}:routes`).toBe(0);
  };
  for (const { signal, lifecycle } of emitted.filter(({ signal }) => signal.state === "OPEN")) {
    const impossible = { ...signal, evidence: producerImpossibleEvidence(signal) };
    expect(signalSchema.safeParse(impossible).success,
      `${input.owner}:${lifecycle.correlationKey}:producer-impossible must pass shared schema`).toBe(true);
    assertRejectedBeforeProbe(impossible, lifecycle.correlationKey, "producer-impossible", true);
    for (const field of Object.keys(signal.evidence as Readonly<Record<string, unknown>>)) {
      const evidence = { ...(signal.evidence as Readonly<Record<string, unknown>>) };
      delete evidence[field];
      const raw = { ...signal, evidence };
      const reachesOwner = signalSchema.safeParse(raw).success;
      assertRejectedBeforeProbe(raw, lifecycle.correlationKey, `without-${field}`, reachesOwner);
    }
  }

  const reconstruct = (
    phase: Extract<LifecyclePhase, "CONTINUING" | "RECOVERED">,
    replayedOpenSignals: readonly ReplayedOpenSignal[]
  ) => {
    let restoredBeforeProbe = false;
    const actualDriver = input.createDriver();
    const actualLifecycle = actualDriver.lifecycle;
    const lifecycle: ModuleLifecycle = Object.freeze({
      legacyCorrelationKey: actualLifecycle.legacyCorrelationKey,
      restore(opens) {
        actualLifecycle.restore(opens);
        restoredBeforeProbe = true;
      }
    });
    const restartedDriver: ActualLifecycleDriver = Object.freeze({
      lifecycle,
      signals: actualDriver.signals,
      ...(actualDriver.recoveryOffsetsMs === undefined
        ? {} : { recoveryOffsetsMs: actualDriver.recoveryOffsetsMs })
    });
    const restarted = drivenModule(restartedDriver, phase);
    const runtime = createRuntime(restarted.module, replayedOpenSignals);
    expect(restoredBeforeProbe, `${input.owner}:${phase}:restore-before-probe`).toBe(true);
    return Object.freeze({ restartedDriver, restarted, runtime });
  };

  const continuing = reconstruct("CONTINUING", replayed.openSignals);
  const idsBeforeContinuing = idCalls;
  await continuing.runtime.run(runtimeInput(
    continuing.restarted.module,
    new Date(start.getTime() + 10_000)
  ));
  expect(emitted.filter(({ signal }) => signal.state === "OPEN")
    .map(({ lifecycle }) => lifecycle.correlationKey).sort(), `${input.owner}:continuing-open-keys`)
    .toEqual(expectedCorrelationKeys);
  expect(idCalls, `${input.owner}:continuing fault allocated replacement UUID`)
    .toBe(idsBeforeContinuing);

  const recoveryReplay = await replayObservationJournals(stateDir, new Set([input.owner]));
  expect(recoveryReplay.openSignals.map((open) =>
    open.lifecycle?.correlationKey ?? "<legacy>").sort(), `${input.owner}:recovery-replay`)
    .toEqual(expectedCorrelationKeys);
  const recovery = reconstruct("RECOVERED", recoveryReplay.openSignals);
  const emittedBeforeRecovery = emitted.length;
  const idsBeforeRecovery = idCalls;
  for (const offset of recovery.restartedDriver.recoveryOffsetsMs ?? [1_200_000]) {
    await recovery.runtime.run(runtimeInput(
      recovery.restarted.module,
      new Date(start.getTime() + offset)
    ));
  }
  const recoverySignals = emitted.slice(emittedBeforeRecovery);
  expect(recoverySignals.map(({ lifecycle }) => lifecycle.correlationKey).sort(),
    `${input.owner}:immediate-recovery-keys`).toEqual(expectedCorrelationKeys);
  expect(recoverySignals.every(({ signal }) => signal.state === "CLEARED"),
    `${input.owner}:immediate-recovery-no-replacement-open`).toBe(true);
  expect(idCalls, `${input.owner}:one UUID per immediate recovery`)
    .toBe(idsBeforeRecovery + expectedOpenCount);
  const clears = emitted.filter(({ signal }) => signal.state === "CLEARED");
  expect(clears.map(({ lifecycle }) => lifecycle.correlationKey).sort(),
    `${input.owner}:final-clear-keys`).toEqual(expectedCorrelationKeys);
  for (const correlationKey of expectedCorrelationKeys) {
    const clear = clears.find(({ lifecycle }) => lifecycle.correlationKey === correlationKey);
    expect(clear?.signal.clears_signal_id, `${input.owner}:${correlationKey}`)
      .toBe(originals.get(correlationKey));
  }
  await expect(replayObservationJournals(stateDir, new Set([input.owner])))
    .resolves.toMatchObject({ openSignals: [] });
}

function restored(intent: SignalIntent) {
  return Object.freeze({
    correlationKey: intent.correlationKey,
    signal: signalSchema.parse({
      seq: 1,
      signal_id: originalId,
      state: "OPEN",
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
      threshold_version: 4,
      clears_signal_id: null,
      recorded_at: intent.detectedAt.toISOString()
    })
  });
}

function memberObservations(ok: boolean): readonly ProbeObservation[] {
  return (["api", "ui", "tls_front_door", "runner"] as const).map((component) =>
    Object.freeze({
      component,
      ok,
      class: "INFRA_DOWN" as const,
      probe: component === "runner" ? "process_presence" : "http_get",
      target: component === "runner" ? "runner-process" : `${component}:/health`,
      lastStatus: component === "runner" ? (ok ? "PRESENT" : "ABSENT") : ok ? 200 : 0
    }));
}

function lifecycleModule(
  name: string,
  lifecycle: ModuleLifecycle,
  probe: Module["probe"] = async () => Object.freeze([]),
  signals: Module["signals"] = () => Object.freeze([])
): Module {
  return Object.freeze({
    name,
    cadence: Object.freeze({ intervalMs: 1, timeoutMs: 1 }),
    lifecycle,
    probe,
    samples: () => Object.freeze([]),
    signals
  });
}

function producerImpossibleEvidence(signal: ObservationSignal): Readonly<Record<string, unknown>> {
  const evidence = { ...(signal.evidence as Readonly<Record<string, unknown>>) };
  if (signal.class === "INFRA_UNKNOWN") return Object.freeze({ ...evidence, container_status: "running" });
  if (signal.class === "INFRA_NOT_READY") return Object.freeze({ ...evidence, last_status: 200 });
  if (signal.class === "INFRA_DOWN") {
    if (signal.component === "dev_stack") {
      return Object.freeze({
        ...evidence,
        last_status: signal.impact_code === "IMPACT_DEV_STACK_NOT_RUNNING" ? "ABSENT" : "NOT_RUNNING"
      });
    }
    if (signal.component === "tls_front_door") {
      return Object.freeze({ ...evidence, last_status: 200 });
    }
    return Object.freeze({ ...evidence, threshold: (evidence.threshold as number) + 1 });
  }
  if (signal.class === "EXPECTED_ABSENT") {
    return Object.freeze({ ...evidence, absent_for_s: (evidence.absent_for_s as number) + 1 });
  }
  if (signal.class === "WORKER_LOST") return Object.freeze({ ...evidence, heartbeat_age_s: 0 });
  if (signal.class === "STALL" || signal.class === "NO_PROGRESS"
    || signal.class === "SUSPICIOUS_SUCCESS") return Object.freeze({ ...evidence, count: 2 });
  if (signal.class === "QUEUE_NOT_DRAINING") return Object.freeze({ ...evidence, ready_age_s: 0 });
  if (signal.class === "CAPTURE_NOT_WIRED") return Object.freeze({ ...evidence, runtime: "other" });
  if (signal.class === "BLIND_PERIOD") return Object.freeze({ ...evidence, silence_s: 0 });
  if (signal.class === "CAPTURE_GAP") return Object.freeze({ ...evidence, runtime: "other" });
  if (signal.class === "SPOOL_STRANDED") return Object.freeze({ ...evidence, spool_age_s: 0 });
  if (signal.class === "CAPACITY") {
    if (signal.impact_code === "IMPACT_DISK") {
      const { free_bytes: _freeBytes, ...remaining } = evidence;
      return Object.freeze({ ...remaining, available_bytes: evidence.free_bytes });
    }
    if (signal.impact_code === "IMPACT_MEMORY") {
      const { available_bytes: _availableBytes, ...remaining } = evidence;
      return Object.freeze({ ...remaining, free_bytes: evidence.available_bytes });
    }
    if (signal.impact_code === "IMPACT_LOAD") return Object.freeze({ ...evidence, load_one_minute: 0 });
    if (signal.impact_code === "IMPACT_PG_CAPACITY") return Object.freeze({ ...evidence, percent: 0 });
    if (signal.impact_code === "IMPACT_PG_LOCKS") {
      const { count: _count, ...remaining } = evidence;
      return Object.freeze(remaining);
    }
    if (signal.severity === "SEVERE") return Object.freeze({ ...evidence, count: 1 });
    return Object.freeze({ ...evidence, count: 0 });
  }
  if (signal.class === "CERT_EXPIRY") return Object.freeze({ ...evidence, threshold_days: 3 });
  if (signal.class === "PROVIDER_DEGRADED") return Object.freeze({ ...evidence, ratio: 0 });
  if (signal.class === "THROUGHPUT_ANOMALY") {
    if (signal.impact_code === "IMPACT_SLOW") return Object.freeze({ ...evidence, p95_ms: 0 });
    if (signal.impact_code === "IMPACT_RUN_FAILURE") return Object.freeze({ ...evidence, ratio: 0 });
    if (signal.impact_code === "IMPACT_HATCHET_QUEUE") return Object.freeze({ ...evidence, count: 0 });
    if (signal.impact_code === "IMPACT_HATCHET_DISPATCH_SLOW") {
      return Object.freeze({ ...evidence, quantile: 0.5 });
    }
    return Object.freeze({ ...evidence, failed: 0 });
  }
  if (signal.class === "RESTART_WITNESSED") {
    return Object.freeze({ ...evidence, old_started_at: evidence.new_started_at });
  }
  if (signal.class === "SCHEDULE_MISSED") {
    const { last_completed_at: _lastCompletedAt, ...remaining } = evidence;
    return Object.freeze(remaining);
  }
  if (signal.class === "AGENT_SELF") {
    return Object.freeze({
      ...evidence,
      channel: evidence.channel === "kanban" ? "sendmail" : "kanban"
    });
  }
  throw new TypeError(`missing producer-impossible evidence mutation for ${signal.class}`);
}

function coreLivenessDriver(): ActualLifecycleDriver {
  const tracker = createLivenessTracker({ openAfterFailures: 1, clearAfterSuccesses: 1 });
  const failures: readonly ProbeObservation[] = Object.freeze([
    Object.freeze({ component: "docker", ok: false, class: "INFRA_DOWN", probe: "docker_info",
      target: "docker-engine", lastStatus: "FAILED", exitCode: 1 }),
    Object.freeze({ component: "postgres", ok: false, class: "INFRA_DOWN", probe: "tcp+select1",
      target: "postgres:5432", lastStatus: "FAILED" }),
    Object.freeze({ component: "postgres", ok: false, class: "INFRA_UNKNOWN",
      probe: "docker_inspect", lastStatus: "UNKNOWN", containerStatus: "UNKNOWN" }),
    Object.freeze({ component: "hatchet", ok: false, class: "INFRA_DOWN", probe: "http_get",
      target: "hatchet:/api/live", lastStatus: 0 }),
    Object.freeze({ component: "hatchet", ok: false, class: "INFRA_NOT_READY", probe: "http_get",
      target: "hatchet:/api/ready", lastStatus: 503, containerStatus: "running",
      restartPolicy: "always", exitCode: 0 }),
    Object.freeze({ component: "hatchet", ok: false, class: "INFRA_UNKNOWN",
      probe: "docker_inspect", lastStatus: "UNKNOWN", containerStatus: "UNKNOWN" })
  ]);
  const impact = (observation: ProbeObservation): ObservationSignal["impact_code"] => {
    if (observation.class === "INFRA_NOT_READY") return "IMPACT_HATCHET_NOT_READY";
    if (observation.class === "INFRA_UNKNOWN" || observation.component === "docker") {
      return "IMPACT_DOCKER_DOWN";
    }
    return observation.component === "postgres" ? "IMPACT_PG_DOWN" : "IMPACT_HATCHET_DOWN";
  };
  const severity = (observation: ProbeObservation): ObservationSignal["severity"] =>
    observation.class === "INFRA_DOWN" ? "FATAL"
      : observation.class === "INFRA_NOT_READY" ? "DEGRADED" : "SEVERE";
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    signals(phase, at) {
      const intents: SignalIntent[] = [];
      for (const failed of failures) {
        const observation = phase === "RECOVERED"
          ? Object.freeze({ ...failed, ok: true, lastStatus: "READY" })
          : failed;
        const transition = tracker.observe({
          component: observation.component,
          class: observation.class,
          ok: observation.ok,
          at
        });
        if (transition.event === null) continue;
        const opening = transition.event.kind === "OPEN";
        intents.push(Object.freeze({
          correlationKey: `${observation.component}:${observation.class}`,
          component: observation.component,
          class: observation.class,
          state: transition.event.kind,
          severity: severity(observation),
          impactCode: opening ? impact(observation) : "IMPACT_CLEARED",
          firstFailedProbeAt: transition.event.firstFailedProbeAt ?? at,
          detectedAt: at,
          evidence: opening ? Object.freeze({
            probe: observation.probe,
            ...(observation.target === undefined ? {} : { target: observation.target }),
            last_status: observation.lastStatus,
            consecutive_failures: 1,
            threshold: 1,
            ...(observation.containerStatus === undefined
              ? {} : { container_status: observation.containerStatus }),
            ...(observation.restartPolicy === undefined
              ? {} : { restart_policy: observation.restartPolicy }),
            ...(observation.exitCode === undefined ? {} : { exit_code: observation.exitCode })
          }) : Object.freeze({
            probe: observation.probe,
            ...(observation.target === undefined ? {} : { target: observation.target }),
            last_status: observation.lastStatus,
            consecutive_failures: 0,
            threshold: 1,
            duration_seconds: Math.max(0, (at.getTime() - start.getTime()) / 1_000)
          }),
          suspectedDefect: false,
          defectKind: null,
          runRef: null,
          workItemRef: null
        }));
      }
      return Object.freeze(intents);
    }
  });
}

function productLivenessDriver(exitedGroup = false): ActualLifecycleDriver {
  const expected = createExpectedSetTracker({
    openAfterFailures: 1, clearAfterSuccesses: 1, groupMemoryMs: 1
  });
  const always = createAlwaysExpectedTracker({
    component: "kanban", agentStartedAt: new Date(start.getTime() - 60_000),
    openAfterFailures: 1, clearAfterSuccesses: 1, absentAfterMs: 1
  });
  const latency = createProbeLatencyTracker({
    windowMs: 1,
    thresholdsMs: { api: 500, ui: 2_000, tls_front_door: 2_500 }
  });
  let primedExited = false;
  return Object.freeze({
    lifecycle: combineLifecycles(
      lifecycleOf(expected), lifecycleOf(always), lifecycleOf(latency)
    ),
    signals(phase, at) {
      if (exitedGroup && phase === "OPEN" && !primedExited) {
        expected.observe(memberObservations(true), new Date(at.getTime() - 10));
        primedExited = true;
      }
      if (exitedGroup) {
        const group = expected.observe(
          memberObservations(phase === "RECOVERED"), at
        ).intents.filter((intent) => intent.component === "dev_stack");
        return Object.freeze(group);
      }
      return Object.freeze([
        ...expected.observe(memberObservations(phase === "RECOVERED"), at).intents,
        ...always.observe(phase === "RECOVERED" ? Object.freeze({
          component: "kanban" as const, ok: true, class: "EXPECTED_ABSENT" as const,
          probe: "http_get", target: "kanban:/health", lastStatus: 200
        }) : undefined, at).intents,
        ...latency.observe("api", phase === "RECOVERED" ? 100 : 700, at),
        ...latency.observe("ui", phase === "RECOVERED" ? 100 : 2_100, at),
        ...latency.observe("tls_front_door", phase === "RECOVERED" ? 100 : 2_600, at)
      ]);
    }
  });
}

function productMemberLivenessDriver(): ActualLifecycleDriver {
  const expected = createExpectedSetTracker({
    openAfterFailures: 1, clearAfterSuccesses: 1, groupMemoryMs: 1
  });
  const always = createAlwaysExpectedTracker({
    component: "kanban", agentStartedAt: new Date(start.getTime() - 60_000),
    openAfterFailures: 1, clearAfterSuccesses: 1, absentAfterMs: 1
  });
  const latency = createProbeLatencyTracker({
    windowMs: 1,
    thresholdsMs: { api: 500, ui: 2_000, tls_front_door: 2_500 }
  });
  return Object.freeze({
    lifecycle: combineLifecycles(
      lifecycleOf(expected), lifecycleOf(always), lifecycleOf(latency)
    ),
    signals(phase, at) {
      const observations = memberObservations(true).map((observation) =>
        observation.component === "api" && phase !== "RECOVERED"
          ? Object.freeze({ ...observation, ok: false, lastStatus: 0 })
          : observation);
      return expected.observe(observations, at).intents;
    }
  });
}

function stallDetectorsDriver(): ActualLifecycleDriver {
  const heartbeat = createWorkerHeartbeatTracker();
  const detector = createDefectDetectorTracker();
  const defects = createDefectLifecycle();
  const runRef = "78000000-0000-4000-8000-000000000001";
  const item = (suffix: number) =>
    `78000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
  const rows = (now: Date) => Object.freeze({
    now,
    stallRows: Object.freeze([
      Object.freeze({
        workItemId: item(2), runId: runRef, state: "CLAIMED" as const,
        claimDeadline: new Date(now.getTime() - 2_000)
      }),
      Object.freeze({
        workItemId: item(6), runId: runRef, state: "CLAIMED" as const,
        claimDeadline: new Date(now.getTime() - 2_000)
      })
    ]),
    readyRows: Object.freeze([Object.freeze({
      workItemId: item(3), runId: runRef, state: "READY" as const
    })]),
    progressRows: Object.freeze([Object.freeze({ runId: item(4), latestProgressSeq: 2 })]),
    suspiciousRows: Object.freeze([Object.freeze({
      workItemId: item(5), runId: runRef, state: "DONE" as const,
      settledArtifactPresent: false as const
    })]),
    thresholds: Object.freeze({ claimGraceSeconds: 1, readyAgeSeconds: 30, noProgressSeconds: 30 })
  });
  const health = Object.freeze({
    runner: "FRESH" as const, postgres: "UP" as const, hatchet: "UP" as const
  });
  return Object.freeze({
    lifecycle: combineLifecycles(lifecycleOf(heartbeat), lifecycleOf(defects)),
    signals(phase, at) {
      if (phase === "RECOVERED") {
        return Object.freeze([
          ...heartbeat.observe(workerSnapshot("FRESH", at)),
          ...defects.reconcile(Object.freeze([]), health, at)
        ]);
      }
      const seed = new Date(at.getTime() - 31_000);
      const clocks = Object.freeze({
        readyFirstObserved: new Map([[item(3), seed]]),
        progressLastChanged: new Map([[item(4), Object.freeze({ sequence: 2, at: seed })]]),
        exhausted: new Set<"READY" | "PROGRESS">()
      });
      detector.observe(rows(seed), clocks);
      const candidates = detector.observe(rows(at), clocks).candidates;
      return Object.freeze([
        ...heartbeat.observe(workerSnapshot("STALE", at)),
        ...defects.reconcile(candidates, health, at)
      ]);
    }
  });
}

function captureHealthDriver(): ActualLifecycleDriver {
  const health = createCaptureHealthTracker();
  const gaps = createCaptureGapTracker();
  const gapFacts = Object.freeze([
    Object.freeze({
      captureGapId: "78000000-0000-4000-8000-000000000010",
      source: "runner", gapClass: "QUEUE_FULL", lostCount: 1,
      openedAt: start, closedAt: null as Date | null
    }),
    Object.freeze({
      captureGapId: "78000000-0000-4000-8000-000000000013",
      source: "api", gapClass: "WRITE_FAILED", lostCount: 2,
      openedAt: start, closedAt: null as Date | null
    })
  ]);
  const snapshot = (at: Date, recovered: boolean) => Object.freeze({
    state: "CURRENT" as const,
    gaps: Object.freeze(gapFacts.map((gap) => Object.freeze({
      ...gap, closedAt: recovered ? at : null
    }))),
    health: Object.freeze(recovered ? [
      Object.freeze({ runtime: "runner", state: "HEALTHY", observedAt: at, detailCode: "FLUSH_OK" }),
      Object.freeze({ runtime: "api", state: "HEALTHY", observedAt: at, detailCode: "FLUSH_OK" })
    ] : [Object.freeze({
      runtime: "api", state: "HEALTHY",
      observedAt: new Date(at.getTime() - 121_000), detailCode: "FLUSH_OK"
    })]),
    receipts: Object.freeze([]),
    cursor: Object.freeze({ captureGapMs: 0, componentHealthMs: 0, spoolReceiptMs: 0 })
  });
  return Object.freeze({
    lifecycle: combineLifecycles(lifecycleOf(health), lifecycleOf(gaps)),
    signals(phase, at) {
      const recovered = phase === "RECOVERED";
      const current = snapshot(at, recovered);
      return Object.freeze([
        ...health.observe({
          snapshot: current,
          runtimeLiveness: { runner: "UP", api: "UP" },
          expectedRuntimes: ["runner", "api"],
          now: at,
          blindWindowSeconds: 120
        }).intents,
        ...gaps.observe({
          snapshot: current, now: at, windowSeconds: 300, severeLostCount: 100
        }).intents
      ]);
    }
  });
}

function spoolHealthDriver(): ActualLifecycleDriver {
  const tracker = createSpoolHealthTracker();
  const files = Object.freeze([
    Object.freeze({
      runtime: "runner", spoolRef: "runner-1-78000000-0000-4000-8000-000000000011.spool",
      mtime: start, ageSeconds: 600
    }),
    Object.freeze({
      runtime: "api", spoolRef: "api-2-78000000-0000-4000-8000-000000000012.spool",
      mtime: start, ageSeconds: 600
    })
  ]);
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    signals(phase, at) {
      return tracker.observe({
        scan: { state: "CURRENT", files: phase === "RECOVERED" ? [] : files },
        receipts: { state: "CURRENT", refs: [] },
        now: at,
        thresholdSeconds: 300
      }).intents;
    }
  });
}

const hostThresholds = Object.freeze({
  diskDegradedFreePercent: 15, diskFatalFreePercent: 5,
  memorySevereAvailablePercent: 10, loadPerCoreMultiplier: 2,
  loadSustainedSamples: 1, clearSamples: 1
});

function hostCapacityDriver(): ActualLifecycleDriver {
  const tracker = createHostCapacityTracker();
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    signals(phase, at) {
      const failed = phase !== "RECOVERED";
      return tracker.observe({
        snapshot: Object.freeze({
          diskTotalBytes: 100, diskFreeBytes: failed ? 4 : 50,
          diskFreePercent: failed ? 4 : 50, dockerDiskBytes: 0,
          memoryTotalBytes: 100, memoryAvailableBytes: failed ? 4 : 50,
          memoryAvailablePercent: failed ? 4 : 50,
          loadOneMinute: failed ? 3 : 0, logicalCores: 1,
          containers: Object.freeze([]), observedAt: at
        }),
        thresholds: hostThresholds
      }).intents;
    }
  });
}

const postgresThresholds = Object.freeze({
  connectionsSeverePercent: 80, connectionsFatalPercent: 95,
  lockWaiterCount: 1, lockWaitSeconds: 60, transactionAgeSeconds: 300,
  idleInTransactionCount: 5, idleInTransactionSeconds: 120, clearSamples: 1
});

function postgresCapacityDriver(): ActualLifecycleDriver {
  const tracker = createPostgresCapacityTracker();
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    signals(phase, at) {
      const failed = phase !== "RECOVERED";
      return tracker.observe({
        snapshot: Object.freeze({
          usedConnections: failed ? 96 : 10, maxConnections: 100,
          lockWaiters: failed ? 2 : 0, longestLockWaitSeconds: failed ? 61 : 0,
          longestTransactionAgeSeconds: failed ? 301 : 0, activeQueryAgeSeconds: 0,
          idleInTransactionCount: failed ? 5 : 0,
          idleInTransactionAgeSeconds: failed ? 121 : 0,
          debateaiDatabaseBytes: 0, hatchetDatabaseBytes: 0, observedAt: at
        }),
        thresholds: postgresThresholds
      }).intents;
    }
  });
}

function certificateCapacityDriver(): ActualLifecycleDriver {
  const tracker = createCertificateCapacityTracker();
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    signals(phase, at) {
      return tracker.observe({
        snapshot: { days: phase === "RECOVERED" ? 365 : -1, notAfter: at, observedAt: at },
        thresholds: { degradedDays: 14, severeDays: 3 }
      }).intents;
    }
  });
}

function providerHealthDriver(): ActualLifecycleDriver {
  const tracker = createProviderHealthTracker();
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    signals(phase, at) {
      const statuses = Array(10).fill(phase === "RECOVERED" ? "PARSED" : "PARSE_FAILED");
      return tracker.observe([
        { providerRef: "provider:alpha", statuses },
        { providerRef: "provider:beta", statuses }
      ], {
        minimum: 10, ratio: 0.5, windowMinutes: 5,
        windowStartedAt: new Date(at.getTime() - 300_000), windowEndedAt: at
      }).intents;
    }
  });
}

function runFailureDriver(): ActualLifecycleDriver {
  const tracker = createRunFailureTracker();
  const threshold = Object.freeze({ minimum: 4, ratio: 0.5, windowMinutes: 60 });
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    signals(phase, at) {
      return tracker.observe({
        failed: phase === "RECOVERED" ? 0 : 3,
        total: 4,
        windowStartedAt: new Date(at.getTime() - 3_600_000),
        windowEndedAt: at
      }, threshold).intents;
    }
  });
}

function hatchetThroughputDriver(): ActualLifecycleDriver {
  const tracker = createHatchetThroughputTracker();
  const thresholds = Object.freeze({
    queueDepth: 10, queueSeconds: 300, dispatchP95Seconds: 30,
    failedTasks: 3, failedWindowMinutes: 15
  });
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    recoveryOffsetsMs: Object.freeze([300_000, 1_200_000]),
    signals(phase, at) {
      if (phase === "RECOVERED") {
        return tracker.observe({
          queueDepth: 0, dispatchP95Seconds: 1, failedTasksTotal: 3,
          createdTasksTotal: 20, observedAt: at, source: "REST"
        }, thresholds).intents;
      }
      if (phase === "OPEN") {
        tracker.observe({
          queueDepth: 10, dispatchP95Seconds: 1, failedTasksTotal: 0,
          createdTasksTotal: 10, observedAt: new Date(at.getTime() - 300_000), source: "REST"
        }, thresholds);
        return tracker.observe({
          queueDepth: 10, dispatchP95Seconds: 31, failedTasksTotal: 3,
          createdTasksTotal: 13, observedAt: at, source: "REST"
        }, thresholds).intents;
      }
      return tracker.observe({
        queueDepth: 10, dispatchP95Seconds: 31, failedTasksTotal: 3,
        createdTasksTotal: 13, observedAt: at, source: "REST"
      }, thresholds).intents;
    }
  });
}

function absentWitnessDriver(): ActualLifecycleDriver {
  const tracker = createContainerWitness({
    agentStartedAt: new Date(start.getTime() - 60_000), absentAfterMs: 1
  });
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    signals(phase, at) {
      return tracker.observe([Object.freeze({
        component: "postgres" as const,
        status: phase === "RECOVERED" ? "running" : "exited",
        startedAt: phase === "RECOVERED" ? at : null,
        container: "debateai-v3-postgres-1", finishedAt: phase === "RECOVERED" ? null : at,
        restartCount: 0, restartPolicy: "always", exitCode: phase === "RECOVERED" ? 0 : 1
      })], at).intents;
    }
  });
}

function restartWitnessDriver(): ActualLifecycleDriver {
  const tracker = createContainerWitness({ agentStartedAt: start, absentAfterMs: 60_000 });
  const restartedAt = new Date(start.getTime() + 1_000);
  let initialized = false;
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    signals(phase, at) {
      if (phase === "CONTINUING") return tracker.observe(Object.freeze([]), at).intents;
      const inspection = Object.freeze({
        component: "hatchet" as const, status: "running", startedAt: restartedAt,
        container: "debateai-v3-hatchet-1", finishedAt: null,
        restartCount: 1, restartPolicy: "always", exitCode: 0
      });
      if (phase === "OPEN") {
        if (!initialized) {
          tracker.observe([Object.freeze({
            ...inspection, startedAt: start, restartCount: 0
          })], new Date(at.getTime() - 1_000));
          initialized = true;
        }
        return Object.freeze(tracker.observe([inspection], at).intents.filter(
          (intent) => intent.state === "OPEN"
        ));
      }
      return tracker.observe([inspection], at).intents;
    }
  });
}

function scheduleDriver(): ActualLifecycleDriver {
  const tracker = createScheduleTracker(new Date(start.getTime() - 100_000));
  const thresholds = Object.freeze({ schedule: Object.freeze({
    "liveness-sweep": Object.freeze({ cadence_s: 60, grace_s: 10 }),
    "settlement-watch": Object.freeze({ cadence_s: 60, grace_s: 10 }),
    "replay-self-test": Object.freeze({ cadence_s: 60, grace_s: 10 })
  }) });
  return Object.freeze({
    lifecycle: lifecycleOf(tracker),
    signals(phase, at) {
      const completions = phase === "RECOVERED"
        ? (["liveness-sweep", "settlement-watch", "replay-self-test"] as const).map((job) =>
            Object.freeze({ job, completedAt: at, exitCode: 0, reportOk: true }))
        : Object.freeze([]);
      return tracker.observe(completions, thresholds, at);
    }
  });
}

function deliveryHealthDriver(): ActualLifecycleDriver {
  const tracker = createDeliveryHealthTracker(Object.freeze([]));
  return Object.freeze({
    lifecycle: Object.freeze({
      legacyCorrelationKey: deliveryHealthLegacyCorrelationKey,
      restore: tracker.restore
    }),
    signals(phase, at) {
      for (const channel of ["osascript", "sendmail", "kanban"] as const) {
        tracker.record({ channel, outcome: phase === "RECOVERED" ? "DELIVERED" : "FAILED", at });
      }
      return tracker.drain();
    }
  });
}

function deliveryHealthLifecycle(): ModuleLifecycle {
  const tracker = createDeliveryHealthTracker(Object.freeze([]));
  return Object.freeze({
    legacyCorrelationKey: deliveryHealthLegacyCorrelationKey,
    restore: tracker.restore
  });
}

const realLifecycleScenarios: readonly Readonly<{
  name: string;
  owner: string;
  expectedCorrelationKeys: readonly string[];
  createDriver(): ActualLifecycleDriver;
}>[] = Object.freeze([
  Object.freeze({
    name: "core all component/classes", owner: "core-liveness",
    expectedCorrelationKeys: Object.freeze([
      "docker:INFRA_DOWN", "postgres:INFRA_DOWN", "postgres:INFRA_UNKNOWN",
      "hatchet:INFRA_DOWN", "hatchet:INFRA_NOT_READY", "hatchet:INFRA_UNKNOWN"
    ]),
    createDriver: coreLivenessDriver
  }),
  Object.freeze({
    name: "product group/expected/latencies", owner: "product-liveness",
    expectedCorrelationKeys: Object.freeze([
      "dev_stack:infra_down", "expected:kanban", "latency:api", "latency:ui",
      "latency:tls_front_door"
    ]),
    createDriver: productLivenessDriver
  }),
  Object.freeze({
    name: "product member partial stack", owner: "product-liveness",
    expectedCorrelationKeys: Object.freeze(["member:api:infra_down"]),
    createDriver: productMemberLivenessDriver
  }),
  Object.freeze({
    name: "product exited group", owner: "product-liveness",
    expectedCorrelationKeys: Object.freeze(["dev_stack:infra_down"]),
    createDriver: () => productLivenessDriver(true)
  }),
  Object.freeze({
    name: "heartbeat/four defects/two STALL subjects", owner: "stall-detectors",
    expectedCorrelationKeys: Object.freeze([
      "worker:debateai-dev-runner",
      "STALL:78000000-0000-4000-8000-000000000002",
      "STALL:78000000-0000-4000-8000-000000000006",
      "QUEUE_NOT_DRAINING:78000000-0000-4000-8000-000000000003",
      "NO_PROGRESS:78000000-0000-4000-8000-000000000004",
      "SUSPICIOUS_SUCCESS:78000000-0000-4000-8000-000000000005"
    ]),
    createDriver: stallDetectorsDriver
  }),
  Object.freeze({
    name: "not-wired/blind/two gaps", owner: "capture-health",
    expectedCorrelationKeys: Object.freeze([
      "not-wired:runner", "blind:api", "gap:runner:runner:QUEUE_FULL",
      "gap:api:api:WRITE_FAILED"
    ]),
    createDriver: captureHealthDriver
  }),
  Object.freeze({
    name: "two spool correlations", owner: "spool-health",
    expectedCorrelationKeys: Object.freeze([
      "spool:runner:runner-1-78000000-0000-4000-8000-000000000011.spool",
      "spool:api:api-2-78000000-0000-4000-8000-000000000012.spool"
    ]),
    createDriver: spoolHealthDriver
  }),
  Object.freeze({
    name: "disk/memory/load", owner: "host-capacity",
    expectedCorrelationKeys: Object.freeze(["host-disk", "host-memory", "host-load"]),
    createDriver: hostCapacityDriver
  }),
  Object.freeze({
    name: "connections/locks/long/idle", owner: "postgres-capacity",
    expectedCorrelationKeys: Object.freeze([
      "postgres-connections", "postgres-lock-waiters", "postgres-long-transaction",
      "postgres-idle-transaction"
    ]),
    createDriver: postgresCapacityDriver
  }),
  Object.freeze({
    name: "certificate", owner: "certificate-capacity",
    expectedCorrelationKeys: Object.freeze(["tls-certificate-expiry"]),
    createDriver: certificateCapacityDriver
  }),
  Object.freeze({
    name: "two providers", owner: "provider-health",
    expectedCorrelationKeys: Object.freeze(["provider:provider:alpha", "provider:provider:beta"]),
    createDriver: providerHealthDriver
  }),
  Object.freeze({
    name: "run failure", owner: "throughput",
    expectedCorrelationKeys: Object.freeze(["run-failure"]),
    createDriver: runFailureDriver
  }),
  Object.freeze({
    name: "queue/dispatch/failed", owner: "hatchet-throughput",
    expectedCorrelationKeys: Object.freeze([
      "hatchet-queue", "hatchet-dispatch-p95", "hatchet-failed-tasks"
    ]),
    createDriver: hatchetThroughputDriver
  }),
  Object.freeze({
    name: "expected absence", owner: "witness",
    expectedCorrelationKeys: Object.freeze(["expected:postgres"]),
    createDriver: absentWitnessDriver
  }),
  Object.freeze({
    name: "crash-interrupted restart", owner: "witness",
    expectedCorrelationKeys: Object.freeze(["restart:hatchet:2026-09-06T00:00:01.000Z"]),
    createDriver: restartWitnessDriver
  }),
  Object.freeze({
    name: "all schedule jobs", owner: "job-witness",
    expectedCorrelationKeys: Object.freeze([
      "schedule:liveness-sweep", "schedule:settlement-watch", "schedule:replay-self-test"
    ]),
    createDriver: scheduleDriver
  }),
  Object.freeze({
    name: "independent channel delivery health", owner: "routing",
    expectedCorrelationKeys: Object.freeze([
      "delivery:osascript", "delivery:sendmail", "delivery:kanban"
    ]),
    createDriver: deliveryHealthDriver
  })
]);

describe("real owner restart transitions", () => {
  it.each(realLifecycleScenarios)("replays $owner: $name through its actual tracker", async (scenario) => {
    await roundTripRealLifecycle({
      owner: scenario.owner,
      expectedCorrelationKeys: scenario.expectedCorrelationKeys,
      createDriver: scenario.createDriver
    });
  });
});

describe("OBS-01 restart lifecycle restoration", () => {
  it("restores an actual module before probes and clears the original UUID while its mirror is down", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-module-"));
    scratchDirectories.push(stateDir);
    const journal = new ObservationJournal(stateDir);
    const routed: ObservationSignal[] = [];
    let sequence = 0;
    let nextId = 0;
    let currentState: "FRESH" | "STALE" = "STALE";
    let currentNow = start;
    const makeModule = () => createStallDetectorsModule({
      tokenPath: () => undefined,
      readHeartbeat: async () => workerSnapshot(currentState, currentNow),
      readDefectInputs: async () => Object.freeze({
        stallRows: Object.freeze([]), readyRows: Object.freeze([]),
        progressRows: Object.freeze([]), suspiciousRows: Object.freeze([])
      })
    });
    const makeRuntime = (
      module: Module,
      replayedOpenSignals: readonly ReplayedOpenSignal[] = Object.freeze([])
    ) => new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      replayedOpenSignals,
      nextSequence: () => ++sequence,
      nextSignalId: () => nextId++ === 0
        ? originalId
        : `74000000-0000-4000-8000-${String(nextId).padStart(12, "0")}`,
      sampleStore: { async write() {} },
      async emitSignal(signal, now, lifecycle) {
        const result = await persistSignal({
          signal,
          lifecycle,
          journal,
          mirror: { async mirrorSignal() { throw new Error("POSTGRES_UNAVAILABLE"); } }
        });
        expect(result.mirrored).toBe(false);
        routed.push(signal);
      }
    });

    const firstModule = makeModule();
    await makeRuntime(firstModule).run(runtimeInput(firstModule, currentNow));
    expect(routed).toEqual([expect.objectContaining({
      signal_id: originalId, state: "OPEN", class: "WORKER_LOST"
    })]);

    const replayed = await replayObservationJournals(
      stateDir,
      new Set(["core-liveness", "stall-detectors"])
    );
    expect(replayed.openSignals).toEqual([expect.objectContaining({
      lifecycle: { owner: "stall-detectors", correlationKey: "worker:debateai-dev-runner" },
      signal: expect.objectContaining({ signal_id: originalId })
    })]);

    const restartedModule = makeModule();
    const restartedRuntime = makeRuntime(restartedModule, replayed.openSignals);
    currentNow = new Date(start.getTime() + 10_000);
    await restartedRuntime.run(runtimeInput(restartedModule, currentNow));
    expect(routed.filter((signal) => signal.state === "OPEN")).toHaveLength(1);

    currentState = "FRESH";
    currentNow = new Date(start.getTime() + 20_000);
    await restartedRuntime.run(runtimeInput(restartedModule, currentNow));
    expect(routed).toHaveLength(2);
    expect(routed[1]).toMatchObject({
      state: "CLEARED",
      class: "WORKER_LOST",
      clears_signal_id: originalId
    });
  });

  it("restores core liveness before self-start routing and resumes two-success recovery", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-core-"));
    scratchDirectories.push(stateDir);
    const journal = new ObservationJournal(stateDir);
    await journal.appendSignal(livenessOpen(), {
      owner: "core-liveness",
      correlationKey: "hatchet:INFRA_DOWN"
    });
    const replayed = await replayObservationJournals(
      stateDir,
      new Set(["core-liveness"])
    );
    const order: string[] = [];
    const emitted: ObservationSignal[] = [];
    let sequenceAllocations = 0;
    let uuidAllocations = 0;
    let journalWrites = 0;
    let routes = 0;
    const nextSequence = () => { sequenceAllocations += 1; return sequenceAllocations + 1; };
    const nextSignalId = () => {
      uuidAllocations += 1;
      return "74000000-0000-4000-8000-000000000002";
    };
    const tracker = createLivenessTracker({ openAfterFailures: 2, clearAfterSuccesses: 2 });
    const runtime = new ObservationModuleRuntime({
      modules: Object.freeze([]),
      replayedOpenSignals: replayed.openSignals,
      lifecycleOwners: Object.freeze([Object.freeze({
        owner: "core-liveness",
        lifecycle: Object.freeze({
          legacyCorrelationKey: tracker.legacyCorrelationKey,
          restore(opens: readonly import("../../apps/observation-agent/src/core/types.js").RestoredOpenSignal[]) {
            order.push("restore");
            tracker.restore(opens);
          }
        })
      })]),
      nextSequence,
      nextSignalId,
      sampleStore: { async write() {} },
      async emitSignal() { throw new Error("UNEXPECTED_MODULE_EMIT"); }
    });
    order.push("self-start-route");

    expect(order).toEqual(["restore", "self-start-route"]);
    const restored = runtime.restoredOpenSignals("core-liveness");
    expect(restored).toEqual([{
      correlationKey: "hatchet:INFRA_DOWN",
      signal: livenessOpen()
    }]);
    const coreOpenSignals = new Map(restored.map((open) => [
      open.correlationKey,
      Object.freeze({
        signal: open.signal,
        openedAt: new Date(open.signal.detected_at)
      })
    ]));
    const coordinator = createCoreLivenessObservationCoordinator({
      tracker,
      openSignals: coreOpenSignals,
      nextSequence,
      nextSignalId,
      async emit(signal, _now, lifecycle) {
        journalWrites += 1;
        await expect(persistSignal({
          signal,
          lifecycle,
          journal,
          mirror: { async mirrorSignal() { throw new Error("POSTGRES_UNAVAILABLE"); } }
        })).resolves.toEqual({ mirrored: false });
        routes += 1;
        emitted.push(signal);
      }
    });
    const firstHealthy = Object.freeze({
      component: "hatchet" as const,
      class: "INFRA_DOWN" as const,
      ok: true,
      probe: "http_get",
      target: "hatchet:/api/live",
      lastStatus: 200
    });
    await expect(coordinator.observe({
      observation: firstHealthy,
      now: new Date(start.getTime() + 15_000),
      thresholdVersion: 4,
      openAfterFailures: 2,
      clearAfterSuccesses: 2,
      severity: "FATAL"
    })).resolves.toMatchObject({ state: "RECOVERING", event: null });
    expect({ sequenceAllocations, uuidAllocations, journalWrites, routes, emitted }).toEqual({
      sequenceAllocations: 0, uuidAllocations: 0, journalWrites: 0, routes: 0, emitted: []
    });
    const recoveredAt = new Date(start.getTime() + 20_000);
    await expect(coordinator.observe({
      observation: firstHealthy,
      now: recoveredAt,
      thresholdVersion: 4,
      openAfterFailures: 2,
      clearAfterSuccesses: 2,
      severity: "FATAL"
    })).resolves.toMatchObject({ state: "UP", event: { kind: "CLEARED" } });
    expect({
      sequenceAllocations, uuidAllocations, journalWrites, routes
    }).toEqual({ sequenceAllocations: 1, uuidAllocations: 1, journalWrites: 1, routes: 1 });
    expect(emitted).toEqual([expect.objectContaining({
      state: "CLEARED", clears_signal_id: originalId
    })]);
    expect(emitted.filter((signal) => signal.state === "OPEN")).toEqual([]);
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .resolves.toMatchObject({ openSignals: [] });
  });

  it("does not clear a core OPEN whose journal append was rejected before durability", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-core-rejected-open-"));
    scratchDirectories.push(stateDir);
    const journal = new ObservationJournal(stateDir);
    const openSignals = new Map<string, Readonly<{
      signal: ObservationSignal;
      openedAt: Date;
    }>>();
    const attempts: ObservationSignal[] = [];
    const transitions: string[] = [];
    const openedCallbacks: string[] = [];
    const clearedCallbacks: string[] = [];
    const identifiers = [
      "74000000-0000-4000-8000-000000000041",
      "74000000-0000-4000-8000-000000000042"
    ];
    let sequence = 0;
    let identifier = 0;
    let rejectNextAppend = true;
    const coordinator = createCoreLivenessObservationCoordinator({
      tracker: createLivenessTracker({ openAfterFailures: 1, clearAfterSuccesses: 2 }),
      openSignals,
      nextSequence: () => ++sequence,
      nextSignalId: () => identifiers[identifier++]!,
      async emit(signal, _now, lifecycle) {
        attempts.push(signal);
        let journaled = false;
        await persistSignal({
          signal,
          lifecycle,
          journal: {
            stateDir,
            async appendSignal(...args: Parameters<ObservationJournal["appendSignal"]>) {
              if (rejectNextAppend) {
                rejectNextAppend = false;
                throw new Error("PRE_FSYNC_OPEN_FAILURE");
              }
              return journal.appendSignal(...args);
            }
          } as never,
          mirror: { async mirrorSignal() {} },
          onJournaled() { journaled = true; }
        }).catch(() => undefined);
        return Object.freeze({ journaled });
      }
    });
    const failed = Object.freeze({
      component: "hatchet" as const,
      class: "INFRA_DOWN" as const,
      ok: false,
      probe: "http_get",
      target: "hatchet:/api/live",
      lastStatus: 500
    });
    const healthy = Object.freeze({ ...failed, ok: true, lastStatus: 200 });
    const observe = (observation: ProbeObservation, now: Date) => coordinator.observe({
      observation,
      now,
      thresholdVersion: 4,
      openAfterFailures: 1,
      clearAfterSuccesses: 2,
      severity: "FATAL",
      onTransition(state) { transitions.push(state); },
      onOpened(signal) { openedCallbacks.push(signal.signal_id); },
      onCleared(signalId) { clearedCallbacks.push(signalId); }
    });

    await observe(failed, start);
    expect(openSignals.size).toBe(0);
    expect(transitions).toEqual(["DOWN"]);
    expect(openedCallbacks).toEqual([]);

    await observe(healthy, new Date(start.getTime() + 1_000));
    await observe(healthy, new Date(start.getTime() + 2_000));

    expect(attempts).toEqual([expect.objectContaining({
      signal_id: identifiers[0], state: "OPEN", clears_signal_id: null
    })]);
    expect(clearedCallbacks).toEqual([]);
    const replayed = await replayObservationJournals(stateDir, new Set(["core-liveness"]));
    expect(replayed.openSignals).toEqual([]);
    expect(() => new ObservationModuleRuntime({
      modules: Object.freeze([]),
      replayedOpenSignals: replayed.openSignals,
      lifecycleOwners: Object.freeze([Object.freeze({
        owner: "core-liveness",
        lifecycle: lifecycleOf(createLivenessTracker({
          openAfterFailures: 1,
          clearAfterSuccesses: 2
        }))
      })]),
      nextSequence: () => 1,
      nextSignalId: () => identifiers[1]!,
      sampleStore: { async write() {} },
      async emitSignal() {}
    })).not.toThrow();
  });

  it("retries a rejected core OPEN while the component remains down", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-core-retry-open-"));
    scratchDirectories.push(stateDir);
    const journal = new ObservationJournal(stateDir);
    const openSignals = new Map<string, Readonly<{
      signal: ObservationSignal;
      openedAt: Date;
    }>>();
    const attempts: ObservationSignal[] = [];
    const openedCallbacks: string[] = [];
    const identifiers = [
      "74000000-0000-4000-8000-000000000043",
      "74000000-0000-4000-8000-000000000044"
    ];
    let sequence = 0;
    let identifier = 0;
    let rejectNextAppend = true;
    const coordinator = createCoreLivenessObservationCoordinator({
      tracker: createLivenessTracker({ openAfterFailures: 1, clearAfterSuccesses: 2 }),
      openSignals,
      nextSequence: () => ++sequence,
      nextSignalId: () => identifiers[identifier++]!,
      async emit(signal, _now, lifecycle) {
        attempts.push(signal);
        let journaled = false;
        await persistSignal({
          signal,
          lifecycle,
          journal: {
            stateDir,
            async appendSignal(...args: Parameters<ObservationJournal["appendSignal"]>) {
              if (rejectNextAppend) {
                rejectNextAppend = false;
                throw new Error("PRE_FSYNC_OPEN_FAILURE");
              }
              return journal.appendSignal(...args);
            }
          } as never,
          mirror: { async mirrorSignal() {} },
          onJournaled() { journaled = true; }
        }).catch(() => undefined);
        return Object.freeze({ journaled });
      }
    });
    const failed = Object.freeze({
      component: "hatchet" as const,
      class: "INFRA_DOWN" as const,
      ok: false,
      probe: "http_get",
      target: "hatchet:/api/live",
      lastStatus: 500
    });
    const observe = (now: Date) => coordinator.observe({
      observation: failed,
      now,
      thresholdVersion: 4,
      openAfterFailures: 1,
      clearAfterSuccesses: 2,
      severity: "FATAL",
      onOpened(signal) { openedCallbacks.push(signal.signal_id); }
    });

    await observe(start);
    expect(openSignals.size).toBe(0);
    await observe(new Date(start.getTime() + 1_000));

    expect(attempts).toEqual([
      expect.objectContaining({ signal_id: identifiers[0], state: "OPEN" }),
      expect.objectContaining({
        signal_id: identifiers[1],
        state: "OPEN",
        first_failed_probe_at: start.toISOString()
      })
    ]);
    expect(openedCallbacks).toEqual([identifiers[1]]);
    expect(openSignals.get("hatchet:INFRA_DOWN")?.signal.signal_id).toBe(identifiers[1]);
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .resolves.toMatchObject({
        openSignals: [expect.objectContaining({
          signal: expect.objectContaining({
            signal_id: identifiers[1],
            first_failed_probe_at: start.toISOString()
          })
        })]
      });
  });

  it("retains and retries a durable core OPEN after its CLEAR append is rejected", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-core-rejected-clear-"));
    scratchDirectories.push(stateDir);
    const journal = new ObservationJournal(stateDir);
    const openSignals = new Map<string, Readonly<{
      signal: ObservationSignal;
      openedAt: Date;
    }>>();
    const attempts: ObservationSignal[] = [];
    const openedCallbacks: string[] = [];
    const clearedCallbacks: string[] = [];
    const identifiers = [
      "74000000-0000-4000-8000-000000000051",
      "74000000-0000-4000-8000-000000000052",
      "74000000-0000-4000-8000-000000000053"
    ];
    let sequence = 0;
    let identifier = 0;
    let rejectNextAppend = false;
    const coordinator = createCoreLivenessObservationCoordinator({
      tracker: createLivenessTracker({ openAfterFailures: 1, clearAfterSuccesses: 2 }),
      openSignals,
      nextSequence: () => ++sequence,
      nextSignalId: () => identifiers[identifier++]!,
      async emit(signal, _now, lifecycle) {
        attempts.push(signal);
        let journaled = false;
        await persistSignal({
          signal,
          lifecycle,
          journal: {
            stateDir,
            async appendSignal(...args: Parameters<ObservationJournal["appendSignal"]>) {
              if (rejectNextAppend) {
                rejectNextAppend = false;
                throw new Error("PRE_FSYNC_CLEAR_FAILURE");
              }
              return journal.appendSignal(...args);
            }
          } as never,
          mirror: { async mirrorSignal() {} },
          onJournaled() { journaled = true; }
        }).catch(() => undefined);
        return Object.freeze({ journaled });
      }
    });
    const failed = Object.freeze({
      component: "hatchet" as const,
      class: "INFRA_DOWN" as const,
      ok: false,
      probe: "http_get",
      target: "hatchet:/api/live",
      lastStatus: 500
    });
    const healthy = Object.freeze({ ...failed, ok: true, lastStatus: 200 });
    const observe = (observation: ProbeObservation, now: Date) => coordinator.observe({
      observation,
      now,
      thresholdVersion: 4,
      openAfterFailures: 1,
      clearAfterSuccesses: 2,
      severity: "FATAL",
      onOpened(signal) { openedCallbacks.push(signal.signal_id); },
      onCleared(signalId) { clearedCallbacks.push(signalId); }
    });

    await observe(failed, start);
    expect(openedCallbacks).toEqual([identifiers[0]]);
    expect(openSignals.get("hatchet:INFRA_DOWN")?.signal.signal_id).toBe(identifiers[0]);
    await observe(healthy, new Date(start.getTime() + 1_000));
    rejectNextAppend = true;
    await observe(healthy, new Date(start.getTime() + 2_000));

    expect(clearedCallbacks).toEqual([]);
    expect(openSignals.get("hatchet:INFRA_DOWN")?.signal.signal_id).toBe(identifiers[0]);
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .resolves.toMatchObject({
        openSignals: [expect.objectContaining({
          signal: expect.objectContaining({ signal_id: identifiers[0] })
        })]
      });

    await observe(healthy, new Date(start.getTime() + 3_000));

    expect(attempts).toEqual([
      expect.objectContaining({ signal_id: identifiers[0], state: "OPEN" }),
      expect.objectContaining({
        signal_id: identifiers[1],
        state: "CLEARED",
        clears_signal_id: identifiers[0]
      }),
      expect.objectContaining({
        signal_id: identifiers[2],
        state: "CLEARED",
        clears_signal_id: identifiers[0]
      })
    ]);
    expect(clearedCallbacks).toEqual([identifiers[0]]);
    expect(openSignals.size).toBe(0);
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .resolves.toMatchObject({ openSignals: [] });
  });

  it("does not replace a durable core OPEN after its CLEAR append is rejected", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-core-rejected-clear-reopen-"));
    scratchDirectories.push(stateDir);
    const journal = new ObservationJournal(stateDir);
    const openSignals = new Map<string, Readonly<{
      signal: ObservationSignal;
      openedAt: Date;
    }>>();
    const attempts: ObservationSignal[] = [];
    const openedCallbacks: string[] = [];
    const clearedCallbacks: string[] = [];
    const identifiers = [
      "74000000-0000-4000-8000-000000000061",
      "74000000-0000-4000-8000-000000000062",
      "74000000-0000-4000-8000-000000000063"
    ];
    let sequence = 0;
    let identifier = 0;
    let rejectNextAppend = false;
    const coordinator = createCoreLivenessObservationCoordinator({
      tracker: createLivenessTracker({ openAfterFailures: 2, clearAfterSuccesses: 2 }),
      openSignals,
      nextSequence: () => ++sequence,
      nextSignalId: () => identifiers[identifier++]!,
      async emit(signal, _now, lifecycle) {
        attempts.push(signal);
        let journaled = false;
        await persistSignal({
          signal,
          lifecycle,
          journal: {
            stateDir,
            async appendSignal(...args: Parameters<ObservationJournal["appendSignal"]>) {
              if (rejectNextAppend) {
                rejectNextAppend = false;
                throw new Error("PRE_FSYNC_CLEAR_FAILURE");
              }
              return journal.appendSignal(...args);
            }
          } as never,
          mirror: { async mirrorSignal() {} },
          onJournaled() { journaled = true; }
        }).catch(() => undefined);
        return Object.freeze({ journaled });
      }
    });
    const failed = Object.freeze({
      component: "hatchet" as const,
      class: "INFRA_DOWN" as const,
      ok: false,
      probe: "http_get",
      target: "hatchet:/api/live",
      lastStatus: 500
    });
    const healthy = Object.freeze({ ...failed, ok: true, lastStatus: 200 });
    const observe = (observation: ProbeObservation, now: Date) => coordinator.observe({
      observation,
      now,
      thresholdVersion: 4,
      openAfterFailures: 2,
      clearAfterSuccesses: 2,
      severity: "FATAL",
      onOpened(signal) { openedCallbacks.push(signal.signal_id); },
      onCleared(signalId) { clearedCallbacks.push(signalId); }
    });

    await observe(failed, start);
    await observe(failed, new Date(start.getTime() + 1_000));
    await observe(healthy, new Date(start.getTime() + 2_000));
    rejectNextAppend = true;
    await observe(healthy, new Date(start.getTime() + 3_000));
    await observe(failed, new Date(start.getTime() + 4_000));
    await observe(failed, new Date(start.getTime() + 5_000));

    const replayed = await replayObservationJournals(stateDir, new Set(["core-liveness"]));
    expect(identifier).toBe(2);
    expect(sequence).toBe(2);
    expect(attempts).toEqual([
      expect.objectContaining({ signal_id: identifiers[0], state: "OPEN" }),
      expect.objectContaining({
        signal_id: identifiers[1],
        state: "CLEARED",
        clears_signal_id: identifiers[0]
      })
    ]);
    expect(openedCallbacks).toEqual([identifiers[0]]);
    expect(clearedCallbacks).toEqual([]);
    expect(openSignals.get("hatchet:INFRA_DOWN")?.signal.signal_id).toBe(identifiers[0]);
    expect(replayed.openSignals).toEqual([expect.objectContaining({
      lifecycle: Object.freeze({
        owner: "core-liveness",
        correlationKey: "hatchet:INFRA_DOWN"
      }),
      signal: expect.objectContaining({ signal_id: identifiers[0] })
    })]);
    expect(() => new ObservationModuleRuntime({
      modules: Object.freeze([]),
      replayedOpenSignals: replayed.openSignals,
      lifecycleOwners: Object.freeze([Object.freeze({
        owner: "core-liveness",
        lifecycle: lifecycleOf(createLivenessTracker({
          openAfterFailures: 2,
          clearAfterSuccesses: 2
        }))
      })]),
      nextSequence: () => 3,
      nextSignalId: () => identifiers[2]!,
      sampleStore: { async write() {} },
      async emitSignal() {}
    })).not.toThrow();
  });

  it("adopts one legacy raw OPEN through its unique native owner", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-legacy-"));
    scratchDirectories.push(stateDir);
    await mkdir(join(stateDir, "journal"), { recursive: true });
    await writeFile(
      join(stateDir, "journal", "signals-2026-09-06.jsonl"),
      `${JSON.stringify(workerOpen())}\n`
    );
    const replayed = await replayObservationJournals(stateDir, new Set(["stall-detectors"]));
    const module = createStallDetectorsModule({
      tokenPath: () => undefined,
      readHeartbeat: async () => workerSnapshot("FRESH", new Date(start.getTime() + 10_000)),
      readDefectInputs: async () => Object.freeze({
        stallRows: Object.freeze([]), readyRows: Object.freeze([]),
        progressRows: Object.freeze([]), suspiciousRows: Object.freeze([])
      })
    });
    const emitted: ObservationSignal[] = [];
    const runtime = new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      replayedOpenSignals: replayed.openSignals,
      nextSequence: () => 2,
      nextSignalId: () => "74000000-0000-4000-8000-000000000002",
      sampleStore: { async write() {} },
      async emitSignal(signal) { emitted.push(signal); }
    });
    await runtime.run(runtimeInput(module, new Date(start.getTime() + 10_000)));
    expect(emitted).toEqual([expect.objectContaining({
      state: "CLEARED", clears_signal_id: originalId
    })]);
  });

  it("rejects a stateful v2 lifecycle-null row before Runtime, START, routing, or probes", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-v2-null-"));
    scratchDirectories.push(stateDir);
    await mkdir(join(stateDir, "journal"), { recursive: true });
    await writeFile(
      join(stateDir, "journal", "signals-2026-09-06.jsonl"),
      `${JSON.stringify({
        record_version: 2,
        kind: "signal",
        signal: livenessOpen(),
        lifecycle: null
      })}\n`
    );
    let runtimeConstructions = 0;
    let startRoutes = 0;
    let probes = 0;
    let routed = 0;

    await expect((async () => {
      const replayed = await replayObservationJournals(stateDir, new Set(["core-liveness"]));
      runtimeConstructions += 1;
      const tracker = createLivenessTracker({ openAfterFailures: 2, clearAfterSuccesses: 2 });
      const module = lifecycleModule("core-liveness", lifecycleOf(tracker), async () => {
        probes += 1;
        return Object.freeze([]);
      });
      const runtime = new ObservationModuleRuntime({
        modules: Object.freeze([module]),
        replayedOpenSignals: replayed.openSignals,
        nextSequence: () => 2,
        nextSignalId: () => "74000000-0000-4000-8000-000000000002",
        sampleStore: { async write() {} },
        async emitSignal() { routed += 1; }
      });
      startRoutes += 1;
      await runtime.run(runtimeInput(module, new Date(start.getTime() + 10_000)));
    })()).rejects.toThrow("OBSERVATION_JOURNAL_INVALID");
    expect({ runtimeConstructions, startRoutes, probes, routed }).toEqual({
      runtimeConstructions: 0, startRoutes: 0, probes: 0, routed: 0
    });
  });

  it("fails closed before probes when a legacy OPEN has ambiguous ownership", async () => {
    let probes = 0;
    const restores: string[] = [];
    const lifecycle = (owner: string): ModuleLifecycle => Object.freeze({
      legacyCorrelationKey: () => "worker:debateai-dev-runner",
      restore() { restores.push(owner); }
    });
    const first = lifecycleModule("first-owner", lifecycle("first"), async () => {
      probes += 1;
      return Object.freeze([]);
    });
    const second = lifecycleModule("second-owner", lifecycle("second"), async () => {
      probes += 1;
      return Object.freeze([]);
    });
    const replayed = Object.freeze([Object.freeze({ signal: workerOpen(), lifecycle: null })]);
    expect(() => new ObservationModuleRuntime({
      modules: Object.freeze([first, second]),
      replayedOpenSignals: replayed,
      nextSequence: () => 2,
      nextSignalId: () => "74000000-0000-4000-8000-000000000002",
      sampleStore: { async write() {} },
      async emitSignal() {}
    })).toThrow("OBSERVATION_LIFECYCLE_RESTORE_INVALID");
    expect(probes).toBe(0);
    expect(restores).toEqual([]);
  });

  it("permits a distinct native correlation with the same component and class", async () => {
    const intents: SignalIntent[] = [Object.freeze({
      correlationKey: "second-correlation",
      component: "runner",
      class: "WORKER_LOST",
      state: "OPEN",
      severity: "SEVERE",
      impactCode: "IMPACT_WORKER_LOST",
      firstFailedProbeAt: start,
      detectedAt: start,
      evidence: Object.freeze({
        worker_ref: "other-runner",
        heartbeat_age_s: 31,
        heartbeat_threshold_s: 30,
        health: "STALE"
      }),
      suspectedDefect: false,
      defectKind: null,
      runRef: null,
      workItemRef: null
    })];
    const lifecycle: ModuleLifecycle = Object.freeze({
      legacyCorrelationKey(signal) {
        const workerRef = (signal.evidence as Readonly<Record<string, unknown>>).worker_ref;
        if (workerRef === "debateai-dev-runner") return "first-correlation";
        if (workerRef === "other-runner") return "second-correlation";
        return null;
      },
      restore() {}
    });
    const module = lifecycleModule("owner", lifecycle, undefined, () => intents.splice(0));
    const emitted: ObservationSignal[] = [];
    const runtime = new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      replayedOpenSignals: Object.freeze([Object.freeze({
        signal: workerOpen(),
        lifecycle: Object.freeze({ owner: "owner", correlationKey: "first-correlation" })
      })]),
      nextSequence: () => 2,
      nextSignalId: () => "74000000-0000-4000-8000-000000000002",
      sampleStore: { async write() {} },
      async emitSignal(signal) { emitted.push(signal); }
    });
    await expect(runtime.run(runtimeInput(module, start))).resolves.toEqual([]);
    expect(emitted).toEqual([expect.objectContaining({
      state: "OPEN", component: "runner", class: "WORKER_LOST"
    })]);
  });

  it.each([
    ["null", null],
    ["mismatched", "canonical-key"]
  ] as const)("rejects a new OPEN whose lifecycle derives a %s identity before side effects", async (
    _case,
    invalidDerivedKey
  ) => {
    const intents: SignalIntent[][] = [
      [Object.freeze({
        correlationKey: "reported-key",
        component: "runner",
        class: "WORKER_LOST",
        state: "OPEN",
        severity: "SEVERE",
        impactCode: "IMPACT_WORKER_LOST",
        firstFailedProbeAt: start,
        detectedAt: start,
        evidence: Object.freeze({
          worker_ref: "invalid-runner",
          heartbeat_age_s: 31,
          heartbeat_threshold_s: 30,
          health: "STALE"
        }),
        suspectedDefect: false,
        defectKind: null,
        runRef: null,
        workItemRef: null
      })],
      [Object.freeze({
        correlationKey: "reported-key",
        component: "runner",
        class: "WORKER_LOST",
        state: "OPEN",
        severity: "SEVERE",
        impactCode: "IMPACT_WORKER_LOST",
        firstFailedProbeAt: start,
        detectedAt: new Date(start.getTime() + 2),
        evidence: Object.freeze({
          worker_ref: "truthful-runner",
          heartbeat_age_s: 31,
          heartbeat_threshold_s: 30,
          health: "STALE"
        }),
        suspectedDefect: false,
        defectKind: null,
        runRef: null,
        workItemRef: null
      })]
    ];
    const lifecycle: ModuleLifecycle = Object.freeze({
      legacyCorrelationKey(signal) {
        const workerRef = (signal.evidence as Readonly<Record<string, unknown>>).worker_ref;
        return workerRef === "truthful-runner" ? "reported-key" : invalidDerivedKey;
      },
      restore() {}
    });
    const module = lifecycleModule("owner", lifecycle, undefined, () =>
      Object.freeze(intents.shift() ?? []));
    let sequences = 0;
    let signalIds = 0;
    let journalAppends = 0;
    let routed = 0;
    const runtime = new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      nextSequence: () => { sequences += 1; return sequences; },
      nextSignalId: () => {
        signalIds += 1;
        return `74000000-0000-4000-8000-${String(signalIds).padStart(12, "0")}`;
      },
      sampleStore: { async write() {} },
      async emitSignal() {
        journalAppends += 1;
        routed += 1;
      }
    });

    await expect(runtime.run(runtimeInput(module, start)))
      .rejects.toThrow("OBSERVATION_MODULE_SIGNAL_INVALID");
    expect({ sequences, signalIds, journalAppends, routed }).toEqual({
      sequences: 0, signalIds: 0, journalAppends: 0, routed: 0
    });

    await expect(runtime.run(runtimeInput(module, new Date(start.getTime() + 2))))
      .resolves.toEqual([]);
    expect({ sequences, signalIds, journalAppends, routed }).toEqual({
      sequences: 1, signalIds: 1, journalAppends: 1, routed: 1
    });
  });

  it.each([
    ["restored", "null", null, "runner"],
    ["restored", "mismatched", "native-key", "runner"],
    ["restored", "component-mismatched", "reported-key", "api"],
    ["live", "null", null, "runner"],
    ["live", "mismatched", "native-key", "runner"],
    ["live", "component-mismatched", "reported-key", "api"]
  ] as const)(
    "rejects an occupied %s OPEN with %s canonical identity before side effects",
    async (occupancy, _case, invalidDerivedKey, invalidComponent) => {
      const intent = (
        state: "OPEN" | "CLEARED",
        workerRef: string,
        detectedAt: Date,
        component: ObservationSignal["component"] = "runner"
      ): SignalIntent => Object.freeze({
        correlationKey: "reported-key",
        component,
        class: "WORKER_LOST",
        state,
        severity: "SEVERE",
        impactCode: state === "OPEN" ? "IMPACT_WORKER_LOST" : "IMPACT_CLEARED",
        firstFailedProbeAt: start,
        detectedAt,
        evidence: Object.freeze({
          worker_ref: workerRef,
          heartbeat_age_s: state === "OPEN" ? 31 : 1,
          heartbeat_threshold_s: 30,
          health: state === "OPEN" ? "STALE" : "FRESH",
          ...(state === "CLEARED" ? { duration_seconds: 6 } : {})
        }),
        suspectedDefect: false,
        defectKind: null,
        runRef: null,
        workItemRef: null
      });
      const queued: SignalIntent[][] = [];
      const lifecycle: ModuleLifecycle = Object.freeze({
        legacyCorrelationKey(signal) {
          const workerRef = (signal.evidence as Readonly<Record<string, unknown>>).worker_ref;
          if (workerRef === "debateai-dev-runner" || workerRef === "truthful-runner") {
            return "reported-key";
          }
          return invalidDerivedKey;
        },
        restore() {}
      });
      const module = lifecycleModule("owner", lifecycle, undefined, () =>
        Object.freeze(queued.shift() ?? []));
      let sequences = 0;
      let signalIds = 0;
      let journalAppends = 0;
      let routed = 0;
      const emitted: ObservationSignal[] = [];
      const liveId = "74000000-0000-4000-8000-000000000002";
      const runtime = new ObservationModuleRuntime({
        modules: Object.freeze([module]),
        ...(occupancy === "restored" ? {
          replayedOpenSignals: Object.freeze([Object.freeze({
            signal: workerOpen(),
            lifecycle: Object.freeze({ owner: "owner", correlationKey: "reported-key" })
          })])
        } : {}),
        nextSequence: () => { sequences += 1; return sequences; },
        nextSignalId: () => {
          signalIds += 1;
          return liveId;
        },
        sampleStore: { async write() {} },
        async emitSignal(signal) {
          journalAppends += 1;
          routed += 1;
          emitted.push(signal);
        }
      });

      if (occupancy === "live") {
        queued.push([intent("OPEN", "truthful-runner", start)]);
        await runtime.run(runtimeInput(module, start));
      }
      const occupiedId = occupancy === "restored" ? originalId : liveId;
      const beforeInvalid = Object.freeze({
        sequences, signalIds, journalAppends, routed, emitted: emitted.length
      });

      queued.push([intent(
        "OPEN",
        invalidDerivedKey === "reported-key" ? "truthful-runner" : "invalid-runner",
        new Date(start.getTime() + 2),
        invalidComponent
      )]);
      await expect(runtime.run(runtimeInput(module, new Date(start.getTime() + 2))))
        .rejects.toThrow("OBSERVATION_MODULE_SIGNAL_INVALID");
      expect({ sequences, signalIds, journalAppends, routed, emitted: emitted.length })
        .toEqual(beforeInvalid);

      queued.push([intent("OPEN", "truthful-runner", new Date(start.getTime() + 4))]);
      await expect(runtime.run(runtimeInput(module, new Date(start.getTime() + 4))))
        .resolves.toEqual([]);
      expect({ sequences, signalIds, journalAppends, routed, emitted: emitted.length })
        .toEqual(beforeInvalid);

      queued.push([intent("CLEARED", "truthful-runner", new Date(start.getTime() + 6))]);
      await runtime.run(runtimeInput(module, new Date(start.getTime() + 6)));
      expect(emitted.at(-1)).toMatchObject({
        state: "CLEARED",
        clears_signal_id: occupiedId
      });
    }
  );

  it("rejects stateful output from a discovered module without a restoration owner", async () => {
    const intent: SignalIntent = Object.freeze({
      correlationKey: "unowned-open",
      component: "observation_agent",
      class: "AGENT_SELF",
      state: "OPEN",
      severity: "DEGRADED",
      impactCode: "IMPACT_AGENT_DELIVERY",
      firstFailedProbeAt: start,
      detectedAt: start,
      evidence: Object.freeze({ reason: "DELIVERY_FAILURE", channel: "sendmail" }),
      suspectedDefect: false,
      defectKind: null,
      runRef: null,
      workItemRef: null
    });
    const module: Module = Object.freeze({
      name: "discovered-only",
      cadence: Object.freeze({ intervalMs: 1, timeoutMs: 1 }),
      async probe() { return Object.freeze([]); },
      samples() { return Object.freeze([]); },
      signals() { return Object.freeze([intent]); }
    });
    const emitted: ObservationSignal[] = [];
    const runtime = new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      nextSequence: () => 2,
      nextSignalId: () => "74000000-0000-4000-8000-000000000002",
      sampleStore: { async write() {} },
      async emitSignal(signal) { emitted.push(signal); }
    });

    await expect(runtime.run(runtimeInput(module, start)))
      .rejects.toThrow("OBSERVATION_MODULE_SIGNAL_INVALID");
    expect(emitted).toEqual([]);
  });

  it("keeps the sendmail executor module stateless after routing takes lifecycle ownership", async () => {
    const module = createChannelsSendmailModule();
    const emitted: ObservationSignal[] = [];
    expect(module.lifecycle).toBeUndefined();
    const runtime = new ObservationModuleRuntime({
      modules: [module],
      nextSequence: () => 1,
      nextSignalId: () => "75000000-0000-4000-8000-000000000031",
      sampleStore: { async write() {} },
      async emitSignal(signal) { emitted.push(signal); }
    });
    await runtime.run(runtimeInput(module, start));
    expect(emitted).toEqual([]);
  });
});

describe("canonical restored OPEN ownership", () => {
  it("round-trips the real Docker empty-output exit-zero OPEN and clears its original UUID", async () => {
    const failed = await probeDockerEngine({
      timeoutMs: 2_000,
      async runDocker() {
        return Object.freeze({ stdout: "\n", stderr: "", exitCode: 0 });
      }
    });
    expect(failed).toEqual({
      component: "docker", ok: false, class: "INFRA_DOWN", probe: "docker_info",
      target: "docker-engine", lastStatus: "", exitCode: 0
    });
    const openingTracker = createLivenessTracker({
      openAfterFailures: 1, clearAfterSuccesses: 1
    });
    const opening = openingTracker.observe({
      component: failed.component, class: failed.class, ok: failed.ok, at: start
    });
    expect(opening.event?.kind).toBe("OPEN");
    const open = materializeLivenessSignal({
      seq: 1,
      signalId: originalId,
      observation: failed,
      kind: "OPEN",
      at: start,
      ...(opening.event?.firstFailedProbeAt === undefined ? {} : {
        firstFailedAt: opening.event.firstFailedProbeAt
      }),
      thresholdVersion: 4,
      threshold: 1,
      severity: "FATAL"
    });
    expect(open.evidence).toEqual({
      probe: "docker_info", target: "docker-engine", last_status: "FAILED",
      consecutive_failures: 1, threshold: 1, exit_code: 0
    });

    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-docker-empty-"));
    scratchDirectories.push(stateDir);
    const journal = new ObservationJournal(stateDir);
    await journal.appendSignal(open, {
      owner: "core-liveness", correlationKey: "docker:INFRA_DOWN"
    });
    const replayed = await replayObservationJournals(stateDir, new Set(["core-liveness"]));
    const restartedTracker = createLivenessTracker({
      openAfterFailures: 1, clearAfterSuccesses: 1
    });
    expect(() => new ObservationModuleRuntime({
      lifecycleOwners: Object.freeze([Object.freeze({
        owner: "core-liveness", lifecycle: lifecycleOf(restartedTracker)
      })]),
      replayedOpenSignals: replayed.openSignals,
      nextSequence: () => 2,
      nextSignalId: () => "74000000-0000-4000-8000-000000000002",
      sampleStore: { async write() {} },
      async emitSignal() {}
    })).not.toThrow();

    const healthy = await probeDockerEngine({
      timeoutMs: 2_000,
      async runDocker() {
        return Object.freeze({ stdout: "27.1.0\n", stderr: "", exitCode: 0 });
      }
    });
    const recovery = restartedTracker.observe({
      component: healthy.component, class: healthy.class, ok: healthy.ok,
      at: new Date(start.getTime() + 1_000)
    });
    expect(recovery.event?.kind).toBe("CLEARED");
    const clear = materializeLivenessSignal({
      seq: 2,
      signalId: "74000000-0000-4000-8000-000000000002",
      observation: healthy,
      kind: "CLEARED",
      at: new Date(start.getTime() + 1_000),
      thresholdVersion: 4,
      threshold: 1,
      severity: "FATAL",
      clearsSignalId: originalId,
      openedAt: start
    });
    expect(clear).toMatchObject({ state: "CLEARED", clears_signal_id: originalId });
    await journal.appendSignal(clear, {
      owner: "core-liveness", correlationKey: "docker:INFRA_DOWN"
    });
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .resolves.toMatchObject({ openSignals: [] });
  });

  it("round-trips the successful PostgreSQL query with UNKNOWN inspection and clears its UUID", async () => {
    const target = Object.freeze({
      component: "postgres" as const,
      kind: "postgres" as const,
      host: "postgres.test",
      port: 5432,
      container: "postgres-container"
    });
    const failed = await probePostgres(target, database, {
      timeoutMs: 2_000,
      async queryPostgres() {},
      async inspectContainer() {
        return Object.freeze({ status: "UNKNOWN", restartPolicy: "UNKNOWN", exitCode: -1 });
      }
    });
    expect(failed).toEqual({
      component: "postgres", ok: false, class: "INFRA_DOWN", probe: "tcp+select1",
      target: "postgres.test:5432", lastStatus: "UNKNOWN", containerStatus: "UNKNOWN",
      restartPolicy: "UNKNOWN", exitCode: -1
    });
    const openingTracker = createLivenessTracker({
      openAfterFailures: 1, clearAfterSuccesses: 1
    });
    const opening = openingTracker.observe({
      component: failed.component, class: failed.class, ok: failed.ok, at: start
    });
    const pgOpenId = "74000000-0000-4000-8000-000000000011";
    const open = materializeLivenessSignal({
      seq: 11,
      signalId: pgOpenId,
      observation: failed,
      kind: "OPEN",
      at: start,
      ...(opening.event?.firstFailedProbeAt === undefined ? {} : {
        firstFailedAt: opening.event.firstFailedProbeAt
      }),
      thresholdVersion: 4,
      threshold: 1,
      severity: "FATAL"
    });
    expect(open.evidence).toEqual({
      probe: "tcp+select1", target: "postgres.test:5432", last_status: "UNKNOWN",
      consecutive_failures: 1, threshold: 1, container_status: "UNKNOWN",
      restart_policy: "UNKNOWN", exit_code: -1
    });

    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-pg-unknown-"));
    scratchDirectories.push(stateDir);
    const journal = new ObservationJournal(stateDir);
    await journal.appendSignal(open, {
      owner: "core-liveness", correlationKey: "postgres:INFRA_DOWN"
    });
    const replayed = await replayObservationJournals(stateDir, new Set(["core-liveness"]));
    const restartedTracker = createLivenessTracker({
      openAfterFailures: 1, clearAfterSuccesses: 1
    });
    expect(() => new ObservationModuleRuntime({
      lifecycleOwners: Object.freeze([Object.freeze({
        owner: "core-liveness", lifecycle: lifecycleOf(restartedTracker)
      })]),
      replayedOpenSignals: replayed.openSignals,
      nextSequence: () => 12,
      nextSignalId: () => "74000000-0000-4000-8000-000000000012",
      sampleStore: { async write() {} },
      async emitSignal() {}
    })).not.toThrow();

    const healthy = await probePostgres(target, database, {
      timeoutMs: 2_000,
      async queryPostgres() {},
      async inspectContainer() {
        return Object.freeze({ status: "running", restartPolicy: "always", exitCode: 0 });
      }
    });
    const recoveredAt = new Date(start.getTime() + 1_000);
    const recovery = restartedTracker.observe({
      component: healthy.component, class: healthy.class, ok: healthy.ok, at: recoveredAt
    });
    expect(recovery.event?.kind).toBe("CLEARED");
    const clear = materializeLivenessSignal({
      seq: 12,
      signalId: "74000000-0000-4000-8000-000000000012",
      observation: healthy,
      kind: "CLEARED",
      at: recoveredAt,
      thresholdVersion: 4,
      threshold: 1,
      severity: "FATAL",
      clearsSignalId: pgOpenId,
      openedAt: start
    });
    expect(clear).toMatchObject({ state: "CLEARED", clears_signal_id: pgOpenId });
    await journal.appendSignal(clear, {
      owner: "core-liveness", correlationKey: "postgres:INFRA_DOWN"
    });
    await expect(replayObservationJournals(stateDir, new Set(["core-liveness"])))
      .resolves.toMatchObject({ openSignals: [] });
  });

  it("rejects a versioned TLS-200 OPEN at its owner boundary before routing or probes", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-restart-tls-200-"));
    scratchDirectories.push(stateDir);
    const impossible = exactOpen({
      id: "74000000-0000-4000-8000-000000000021",
      component: "tls_front_door",
      class: "INFRA_DOWN",
      severity: "SEVERE",
      impactCode: "IMPACT_TLS_DOWN",
      evidence: Object.freeze({
        probe: "http_get",
        target: "https://tls.test/health",
        last_status: 200,
        consecutive_failures: 2,
        threshold: 2
      })
    });
    const journal = new ObservationJournal(stateDir);
    await journal.appendSignal(impossible, {
      owner: "product-liveness", correlationKey: "member:tls_front_door:infra_down"
    });
    const replayed = await replayObservationJournals(stateDir, new Set(["product-liveness"]));
    const lifecycle = lifecycleOf(createExpectedSetTracker({
      openAfterFailures: 2, clearAfterSuccesses: 2, groupMemoryMs: 600_000
    }));
    let probes = 0;
    let routed = 0;
    const module = lifecycleModule("product-liveness", lifecycle, async () => {
      probes += 1;
      return Object.freeze([]);
    });

    expect(() => new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      replayedOpenSignals: replayed.openSignals,
      nextSequence: () => 22,
      nextSignalId: () => "74000000-0000-4000-8000-000000000022",
      sampleStore: { async write() {} },
      async emitSignal() { routed += 1; }
    })).toThrow("OBSERVATION_LIFECYCLE_RESTORE_INVALID");
    expect({ probes, routed }).toEqual({ probes: 0, routed: 0 });
  });

  it("rejects absent core evidence at schema and producer-impossible evidence at owner boundary", () => {
    let probes = 0;
    let routed = 0;
    expect(signalSchema.safeParse({ ...livenessOpen(), evidence: {} }).success).toBe(false);
    expect(probes).toBe(0);
    expect(routed).toBe(0);

    const signal = signalSchema.parse({ ...livenessOpen(), evidence: { probe: "http_get" } });
    const lifecycle = lifecycleOf(createLivenessTracker({
      openAfterFailures: 2, clearAfterSuccesses: 2
    }));
    const module = lifecycleModule("core-liveness", lifecycle, async () => {
      probes += 1;
      return Object.freeze([]);
    });

    expect(lifecycle.legacyCorrelationKey(signal)).toBeNull();
    expect(() => new ObservationModuleRuntime({
      modules: Object.freeze([module]),
      replayedOpenSignals: Object.freeze([Object.freeze({
        signal,
        lifecycle: Object.freeze({
          owner: "core-liveness", correlationKey: "hatchet:INFRA_DOWN"
        })
      })]),
      nextSequence: () => 2,
      nextSignalId: () => "75000000-0000-4000-8000-000000000099",
      sampleStore: { async write() {} },
      async emitSignal() { routed += 1; }
    })).toThrow("OBSERVATION_LIFECYCLE_RESTORE_INVALID");
    expect(probes).toBe(0);
    expect(routed).toBe(0);
  });

  it("accepts only core evidence shapes that its component/class probes can emit", () => {
    const lifecycle = lifecycleOf(createLivenessTracker({
      openAfterFailures: 2, clearAfterSuccesses: 2
    }));
    const coreOpen = (
      component: "docker" | "postgres" | "hatchet",
      className: "INFRA_DOWN" | "INFRA_NOT_READY",
      severity: ObservationSignal["severity"],
      impactCode: ObservationSignal["impact_code"],
      evidence: Readonly<Record<string, unknown>>
    ) => exactOpen({
      id: crypto.randomUUID(), component, class: className, severity, impactCode, evidence
    });
    const counts = Object.freeze({ consecutive_failures: 2, threshold: 2 });
    const container = Object.freeze({
      container_status: "exited", restart_policy: "always", exit_code: 1
    });
    const accepted = [
      coreOpen("docker", "INFRA_DOWN", "FATAL", "IMPACT_DOCKER_DOWN", Object.freeze({
        probe: "docker_info", target: "docker-engine", last_status: "FAILED",
        ...counts, exit_code: 0
      })),
      coreOpen("postgres", "INFRA_DOWN", "FATAL", "IMPACT_PG_DOWN", Object.freeze({
        probe: "tcp+select1", target: "postgres:5432", last_status: "FAILED",
        ...counts, ...container
      })),
      coreOpen("hatchet", "INFRA_DOWN", "FATAL", "IMPACT_HATCHET_DOWN", Object.freeze({
        probe: "http_get", target: "http://hatchet.test/api/live", last_status: 200,
        ...counts, ...container
      })),
      coreOpen("hatchet", "INFRA_NOT_READY", "DEGRADED", "IMPACT_HATCHET_NOT_READY",
        Object.freeze({
          probe: "http_get", target: "http://hatchet.test/api/ready", last_status: 503,
          ...counts, ...container
        }))
    ] as const;
    for (const signal of accepted) {
      expect(lifecycle.legacyCorrelationKey(signal), `${signal.component}:${signal.class}:accepted`)
        .toBe(`${signal.component}:${signal.class}`);
    }

    const rejected = [
      coreOpen("postgres", "INFRA_DOWN", "FATAL", "IMPACT_PG_DOWN", Object.freeze({
        probe: "tcp+select1", target: "postgres:5432", last_status: "FAILED",
        ...counts, container_status: "running", restart_policy: "always", exit_code: 0
      })),
      coreOpen("hatchet", "INFRA_DOWN", "FATAL", "IMPACT_HATCHET_DOWN", Object.freeze({
        probe: "http_get", target: "http://hatchet.test/api/live", last_status: 200,
        ...counts
      })),
      coreOpen("hatchet", "INFRA_DOWN", "FATAL", "IMPACT_HATCHET_DOWN", Object.freeze({
        probe: "http_get", target: "http://hatchet.test/api/live", last_status: 503,
        ...counts, ...container
      }))
    ] as const;
    for (const signal of rejected) {
      expect(lifecycle.legacyCorrelationKey(signal), `${signal.component}:${signal.class}:rejected`)
        .toBeNull();
    }
  });

  it("rejects invalid OPEN metadata before probes for every lifecycle owner", async () => {
    const spoolRef = "runner-42-74000000-0000-4000-8000-000000000010.spool";
    const cases: readonly Readonly<{
      owner: string;
      correlationKey: string;
      lifecycle: ModuleLifecycle;
      signal: ObservationSignal;
      producerImpossibleEvidence: Readonly<Record<string, unknown>>;
    }>[] = Object.freeze([
      Object.freeze({
        owner: "core-liveness", correlationKey: "hatchet:INFRA_DOWN",
        lifecycle: lifecycleOf(createLivenessTracker({ openAfterFailures: 2, clearAfterSuccesses: 2 })),
        signal: livenessOpen("75000000-0000-4000-8000-000000000001"),
        producerImpossibleEvidence: Object.freeze({
          ...(livenessOpen().evidence as Readonly<Record<string, unknown>>), threshold: 3
        })
      }),
      Object.freeze({
        owner: "product-liveness", correlationKey: "member:api:infra_down",
        lifecycle: lifecycleOf(createExpectedSetTracker({
          openAfterFailures: 2, clearAfterSuccesses: 2, groupMemoryMs: 600_000
        })),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000002", component: "api",
          class: "INFRA_DOWN", severity: "SEVERE", impactCode: "IMPACT_API_DOWN",
          evidence: Object.freeze({
            probe: "http_get", target: "api:/api/v1/session", last_status: 0,
            consecutive_failures: 2, threshold: 2
          })
        }),
        producerImpossibleEvidence: Object.freeze({
          probe: "process_presence", target: "api:/api/v1/session", last_status: "ABSENT",
          consecutive_failures: 2, threshold: 2
        })
      }),
      Object.freeze({
        owner: "stall-detectors", correlationKey: "worker:debateai-dev-runner",
        lifecycle: lifecycleOf(createWorkerHeartbeatTracker()),
        signal: workerOpen("75000000-0000-4000-8000-000000000003"),
        producerImpossibleEvidence: Object.freeze({
          worker_ref: "debateai-dev-runner", heartbeat_age_s: 1,
          heartbeat_threshold_s: 30, health: "STALE"
        })
      }),
      Object.freeze({
        owner: "capture-health", correlationKey: "not-wired:runner",
        lifecycle: lifecycleOf(createCaptureHealthTracker()),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000004", component: "obs_capture",
          class: "CAPTURE_NOT_WIRED", severity: "INFO", impactCode: "IMPACT_CAPTURE_NOT_WIRED",
          evidence: Object.freeze({ runtime: "runner", flush_ok_count: 0, health: "NOT_WIRED" })
        }),
        producerImpossibleEvidence: Object.freeze({
          runtime: "api", flush_ok_count: 0, health: "NOT_WIRED"
        })
      }),
      Object.freeze({
        owner: "spool-health", correlationKey: `spool:runner:${spoolRef}`,
        lifecycle: lifecycleOf(createSpoolHealthTracker()),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000005", component: "spool",
          class: "SPOOL_STRANDED", severity: "DEGRADED", impactCode: "IMPACT_SPOOL_STRANDED",
          evidence: Object.freeze({
            runtime: "runner", spool_ref: spoolRef, spool_age_s: 600,
            threshold_s: 300, receipt_present: false, count: 1
          })
        }),
        producerImpossibleEvidence: Object.freeze({
          runtime: "runner", spool_ref: spoolRef, spool_age_s: 0,
          threshold_s: 300, receipt_present: false, count: 1
        })
      }),
      Object.freeze({
        owner: "host-capacity", correlationKey: "host-disk",
        lifecycle: lifecycleOf(createHostCapacityTracker()),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000006", component: "host",
          class: "CAPACITY", severity: "DEGRADED", impactCode: "IMPACT_DISK",
          evidence: Object.freeze({
            percent: 9, threshold_percent: 10, free_bytes: 9, total_bytes: 100,
            unit: "bytes", observed_at: start.toISOString()
          })
        }),
        producerImpossibleEvidence: Object.freeze({
          percent: 9, threshold_percent: 10, available_bytes: 9, total_bytes: 100,
          unit: "bytes", observed_at: start.toISOString()
        })
      }),
      Object.freeze({
        owner: "postgres-capacity", correlationKey: "postgres-lock-waiters",
        lifecycle: lifecycleOf(createPostgresCapacityTracker()),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000007", component: "postgres",
          class: "CAPACITY", severity: "SEVERE", impactCode: "IMPACT_PG_LOCKS",
          evidence: Object.freeze({
            count: 2, duration_seconds: 31, threshold_seconds: 30,
            unit: "seconds", observed_at: start.toISOString()
          })
        }),
        producerImpossibleEvidence: Object.freeze({
          duration_seconds: 31, threshold_seconds: 30,
          unit: "seconds", observed_at: start.toISOString()
        })
      }),
      Object.freeze({
        owner: "certificate-capacity", correlationKey: "tls-certificate-expiry",
        lifecycle: lifecycleOf(createCertificateCapacityTracker()),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000008", component: "tls_front_door",
          class: "CERT_EXPIRY", severity: "SEVERE", impactCode: "IMPACT_CERT",
          evidence: Object.freeze({
            days: 2, threshold_days: 3, not_after: start.toISOString(), unit: "days"
          })
        }),
        producerImpossibleEvidence: Object.freeze({
          days: 2, threshold_days: 1, not_after: start.toISOString(), unit: "days"
        })
      }),
      Object.freeze({
        owner: "provider-health", correlationKey: "provider:openai",
        lifecycle: lifecycleOf(createProviderHealthTracker()),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000009", component: "provider_panel",
          class: "PROVIDER_DEGRADED", severity: "SEVERE", impactCode: "IMPACT_PROVIDER",
          evidence: Object.freeze({
            provider_ref: "openai", failed: 2, total: 3, ratio: 2 / 3,
            percent: 200 / 3, window_minutes: 5,
            window_started_at: start.toISOString(), window_ended_at: start.toISOString(),
            source: "SAFE_VIEW"
          })
        }),
        producerImpossibleEvidence: Object.freeze({
          provider_ref: "openai", failed: 2, total: 3, ratio: 0,
          percent: 200 / 3, window_minutes: 5,
          window_started_at: start.toISOString(), window_ended_at: start.toISOString(),
          source: "SAFE_VIEW"
        })
      }),
      Object.freeze({
        owner: "throughput", correlationKey: "run-failure",
        lifecycle: lifecycleOf(createRunFailureTracker()),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000010", component: "runner",
          class: "THROUGHPUT_ANOMALY", severity: "SEVERE", impactCode: "IMPACT_RUN_FAILURE",
          evidence: Object.freeze({
            failed: 2, total: 3, ratio: 2 / 3, threshold_ratio: 0.5,
            window_minutes: 5, window_started_at: start.toISOString(),
            window_ended_at: start.toISOString()
          })
        }),
        producerImpossibleEvidence: Object.freeze({
          failed: 2, total: 3, ratio: 0, threshold_ratio: 0.5,
          window_minutes: 5, window_started_at: start.toISOString(),
          window_ended_at: start.toISOString()
        })
      }),
      Object.freeze({
        owner: "hatchet-throughput", correlationKey: "hatchet-dispatch-p95",
        lifecycle: lifecycleOf(createHatchetThroughputTracker()),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000011", component: "hatchet",
          class: "THROUGHPUT_ANOMALY", severity: "DEGRADED",
          impactCode: "IMPACT_HATCHET_DISPATCH_SLOW",
          evidence: Object.freeze({
            metric_key: "hatchet.dispatch.p95", p95_seconds: 4, threshold_seconds: 3,
            quantile: 0.95, window_minutes: 5, source: "REST",
            observed_at: start.toISOString()
          })
        }),
        producerImpossibleEvidence: Object.freeze({
          metric_key: "hatchet.dispatch.p95", p95_seconds: 1, threshold_seconds: 3,
          quantile: 0.95, window_minutes: 5, source: "REST",
          observed_at: start.toISOString()
        })
      }),
      Object.freeze({
        owner: "witness", correlationKey: "expected:postgres",
        lifecycle: lifecycleOf(createContainerWitness({ agentStartedAt: start, absentAfterMs: 1 })),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000012", component: "postgres",
          class: "EXPECTED_ABSENT", severity: "SEVERE", impactCode: "IMPACT_EXPECTED_ABSENT",
          evidence: Object.freeze({
            expected: "always", absent_for_s: 0, first_observed_at: start.toISOString()
          })
        }),
        producerImpossibleEvidence: Object.freeze({
          expected: "always", absent_for_s: 1, first_observed_at: start.toISOString()
        })
      }),
      Object.freeze({
        owner: "job-witness", correlationKey: "schedule:liveness-sweep",
        lifecycle: lifecycleOf(createScheduleTracker(start)),
        signal: exactOpen({
          id: "75000000-0000-4000-8000-000000000013", component: "scheduler.liveness-sweep",
          class: "SCHEDULE_MISSED", severity: "SEVERE", impactCode: "IMPACT_SCHEDULE_MISSED",
          evidence: Object.freeze({
            job: "liveness-sweep", cadence_s: 60, grace_s: 10, last_completed_at: null
          })
        }),
        producerImpossibleEvidence: Object.freeze({
          job: "liveness-sweep", cadence_s: 60, grace_s: 10
        })
      }),
      ...(["osascript", "sendmail", "kanban"] as const).map((channel, index) => Object.freeze({
        owner: "routing", correlationKey: `delivery:${channel}`,
        lifecycle: deliveryHealthLifecycle(),
        signal: exactOpen({
          id: `75000000-0000-4000-8000-${String(14 + index).padStart(12, "0")}`,
          component: "observation_agent", class: "AGENT_SELF", severity: "DEGRADED",
          impactCode: "IMPACT_AGENT_DELIVERY",
          evidence: Object.freeze({ reason: "DELIVERY_FAILURE", channel })
        }),
        producerImpossibleEvidence: Object.freeze({
          reason: "DELIVERY_FAILURE",
          channel: channel === "sendmail" ? "osascript" : "sendmail"
        })
      }))
    ]);
    const replacementRef = "75000000-0000-4000-8000-000000000099";
    for (const ownerCase of cases) {
      expect(ownerCase.lifecycle.legacyCorrelationKey(ownerCase.signal), ownerCase.owner)
        .toBe(ownerCase.correlationKey);
      const classMutation = ownerCase.signal.class === "AGENT_SELF"
        ? Object.freeze({
            class: "SCHEDULE_MISSED" as const,
            impact_code: "IMPACT_SCHEDULE_MISSED" as const,
            evidence: Object.freeze({
              job: "liveness-sweep", cadence_s: 60, grace_s: 10, last_completed_at: null
            })
          })
        : Object.freeze({
            class: "AGENT_SELF" as const,
            impact_code: "IMPACT_AGENT_JOURNAL" as const,
            evidence: Object.freeze({ reason: "JOURNAL_FAILURE" })
          });
      const rawVariants: readonly Readonly<{ label: string; value: unknown }>[] = [
        Object.freeze({
          label: "state", value: {
            ...ownerCase.signal, state: "CLEARED", impact_code: "IMPACT_CLEARED",
            evidence: { duration_seconds: 1 }, clears_signal_id: replacementRef
          }
        }),
        Object.freeze({
          label: "component", value: {
            ...ownerCase.signal,
            component: ownerCase.signal.component === "docker" ? "host" : "docker"
          }
        }),
        Object.freeze({
          label: "class", value: { ...ownerCase.signal, ...classMutation }
        }),
        Object.freeze({
          label: "impact", value: {
            ...ownerCase.signal, impact_code: "IMPACT_CLEARED", evidence: { duration_seconds: 1 }
          }
        }),
        Object.freeze({
          label: "severity", value: {
            ...ownerCase.signal,
            severity: ownerCase.signal.severity === "INFO" ? "DEGRADED" : "INFO"
          }
        }),
        Object.freeze({
          label: "defect-pair", value: {
            ...ownerCase.signal, suspected_defect: true, defect_kind: "STALL_DETECTED"
          }
        }),
        Object.freeze({ label: "run-ref", value: { ...ownerCase.signal, run_ref: replacementRef } }),
        Object.freeze({
          label: "work-item-ref",
          value: { ...ownerCase.signal, work_item_ref: replacementRef }
        }),
        Object.freeze({
          label: "producer-impossible-evidence",
          value: { ...ownerCase.signal, evidence: ownerCase.producerImpossibleEvidence }
        }),
        ...Object.keys(ownerCase.signal.evidence as Readonly<Record<string, unknown>>).map(
          (field) => {
            const evidence = { ...(ownerCase.signal.evidence as Readonly<Record<string, unknown>>) };
            delete evidence[field];
            return Object.freeze({
              label: `evidence-without-${field}`,
              value: { ...ownerCase.signal, evidence }
            });
          }
        )
      ];
      for (const variant of rawVariants) {
        const parsed = signalSchema.safeParse(variant.value);
        if (!parsed.success) {
          expect(parsed.success, `${ownerCase.owner}:${variant.label}:earlier-schema-fail-close`)
            .toBe(false);
          continue;
        }
        const signal = parsed.data;
        expect(ownerCase.lifecycle.legacyCorrelationKey(signal), `${ownerCase.owner}:${variant.label}`)
          .not.toBe(ownerCase.correlationKey);
        let probes = 0;
        let routed = 0;
        const module = lifecycleModule(ownerCase.owner, ownerCase.lifecycle, async () => {
          probes += 1;
          return Object.freeze([]);
        });
        expect(() => new ObservationModuleRuntime({
          modules: Object.freeze([module]),
          replayedOpenSignals: Object.freeze([Object.freeze({
            signal,
            lifecycle: Object.freeze({
              owner: ownerCase.owner,
              correlationKey: ownerCase.correlationKey
            })
          })]),
          nextSequence: () => 2,
          nextSignalId: () => replacementRef,
          sampleStore: { async write() {} },
          async emitSignal() { routed += 1; }
        }), `${ownerCase.owner}:${variant.label}`)
          .toThrow("OBSERVATION_LIFECYCLE_RESTORE_INVALID");
        expect(probes).toBe(0);
        expect(routed).toBe(0);
      }
    }

  });

  it("rejects each defect class unless its exact producer refs are present", () => {
    const runRef = "75000000-0000-4000-8000-000000000090";
    const workItemRef = "75000000-0000-4000-8000-000000000091";
    const defectCases = [
      exactOpen({
        id: "75000000-0000-4000-8000-000000000020", component: "runner",
        class: "STALL", severity: "SEVERE", impactCode: "IMPACT_STALL",
        evidence: Object.freeze({
          count: 1, state: "CLAIMED", claim_deadline: start.toISOString(), grace_s: 1,
          health: "HEALTHY"
        }), suspectedDefect: true, defectKind: "STALL_DETECTED",
        runRef, workItemRef
      }),
      exactOpen({
        id: "75000000-0000-4000-8000-000000000021", component: "runner",
        class: "QUEUE_NOT_DRAINING", severity: "SEVERE", impactCode: "IMPACT_QUEUE",
        evidence: Object.freeze({
          state: "READY", ready_age_s: 31, ready_threshold_s: 30, health: "HEALTHY"
        }), suspectedDefect: true, defectKind: "STALL_DETECTED",
        runRef, workItemRef
      }),
      exactOpen({
        id: "75000000-0000-4000-8000-000000000022", component: "runner",
        class: "NO_PROGRESS", severity: "SEVERE", impactCode: "IMPACT_NO_PROGRESS",
        evidence: Object.freeze({
          count: 1, last_progress_seq: 2, silence_s: 31,
          silence_threshold_s: 30, health: "HEALTHY"
        }), suspectedDefect: true, defectKind: "SILENT_NOOP", runRef, workItemRef: null
      }),
      exactOpen({
        id: "75000000-0000-4000-8000-000000000023", component: "runner",
        class: "SUSPICIOUS_SUCCESS", severity: "SEVERE", impactCode: "IMPACT_SUSPICIOUS_SUCCESS",
        evidence: Object.freeze({ count: 1, state: "DONE", artifact_present: false, health: "HEALTHY" }),
        suspectedDefect: true, defectKind: "SUSPICIOUS_SUCCESS", runRef, workItemRef
      })
    ] as const;
    const invalidRefs = [
      { ...defectCases[0], run_ref: null },
      { ...defectCases[1], run_ref: null },
      { ...defectCases[2], work_item_ref: workItemRef },
      { ...defectCases[3], run_ref: null }
    ] as const;
    for (const signal of invalidRefs) {
      expect(createDefectLifecycle().legacyCorrelationKey(signal)).toBeNull();
    }
  });

});

describe("all current stateful owners restore their native state", () => {
  it("restores expected-set and always-expected state", () => {
    const policy = { openAfterFailures: 2, clearAfterSuccesses: 2, groupMemoryMs: 600_000 };
    const before = createExpectedSetTracker(policy);
    before.observe(memberObservations(false), start);
    const groupOpen = before.observe(
      memberObservations(false), new Date(start.getTime() + 5_000)
    ).intents.at(-1)!;
    const after = createExpectedSetTracker(policy);
    after.restore([restored(groupOpen)]);
    expect(after.observe(memberObservations(false), new Date(start.getTime() + 10_000)).intents)
      .toEqual([]);
    expect(after.observe(memberObservations(true), new Date(start.getTime() + 15_000)).intents)
      .toEqual([]);
    expect(after.observe(memberObservations(true), new Date(start.getTime() + 20_000)).intents)
      .toEqual([expect.objectContaining({
        correlationKey: "dev_stack:infra_down",
        state: "CLEARED",
        firstFailedProbeAt: groupOpen.detectedAt,
        evidence: expect.objectContaining({ duration_seconds: 15 })
      })]);

    const alwaysBefore = createAlwaysExpectedTracker({
      component: "kanban", agentStartedAt: start, openAfterFailures: 2,
      clearAfterSuccesses: 2, absentAfterMs: 60_000
    });
    const absentOpen = alwaysBefore.observe(undefined, new Date(start.getTime() + 60_000)).intents[0]!;
    const alwaysAfter = createAlwaysExpectedTracker({
      component: "kanban", agentStartedAt: new Date(start.getTime() + 61_000),
      openAfterFailures: 2, clearAfterSuccesses: 2, absentAfterMs: 60_000
    });
    alwaysAfter.restore([restored(absentOpen)]);
    expect(alwaysAfter.observe(undefined, new Date(start.getTime() + 65_000)).intents).toEqual([]);
    expect(alwaysAfter.observe(Object.freeze({
      component: "kanban", ok: true, class: "EXPECTED_ABSENT", probe: "kanban",
      lastStatus: "READY"
    }), new Date(start.getTime() + 70_000)).intents)
      .toEqual([expect.objectContaining({ correlationKey: "expected:kanban", state: "CLEARED" })]);
  });

  it("restores product latency state", () => {
    const policy = { windowMs: 300_000, thresholdsMs: { api: 500, ui: 2_000, tls_front_door: 2_500 } };
    const open = createProbeLatencyTracker(policy).observe("api", 700, start)[0]!;
    const tracker = createProbeLatencyTracker(policy);
    tracker.restore([restored(open)]);
    expect(tracker.observe("api", 700, new Date(start.getTime() + 1_000))).toEqual([]);
    expect(tracker.observe("api", 100, new Date(start.getTime() + 302_000)))
      .toEqual([expect.objectContaining({ correlationKey: "latency:api", state: "CLEARED" })]);
  });

  it("restores both capture-health lifecycles", () => {
    const missingSnapshot = Object.freeze({
      state: "CURRENT" as const, gaps: Object.freeze([]), health: Object.freeze([]),
      receipts: Object.freeze([]),
      cursor: Object.freeze({ captureGapMs: 0, componentHealthMs: 0, spoolReceiptMs: 0 })
    });
    const first = createCaptureHealthTracker();
    const notWired = first.observe({
      snapshot: missingSnapshot, runtimeLiveness: { runner: "UP" },
      expectedRuntimes: ["runner"], now: start, blindWindowSeconds: 120
    }).intents[0]!;
    const restoredTracker = createCaptureHealthTracker();
    restoredTracker.restore([restored(notWired)]);
    expect(restoredTracker.observe({
      snapshot: missingSnapshot, runtimeLiveness: { runner: "UP" },
      expectedRuntimes: ["runner"], now: new Date(start.getTime() + 5_000), blindWindowSeconds: 120
    }).intents).toEqual([]);
    const healthySnapshot = Object.freeze({
      ...missingSnapshot,
      health: Object.freeze([Object.freeze({
        runtime: "runner", state: "HEALTHY", observedAt: new Date(start.getTime() + 9_000),
        detailCode: "FLUSH_OK"
      })])
    });
    expect(restoredTracker.observe({
      snapshot: healthySnapshot, runtimeLiveness: { runner: "UP" },
      expectedRuntimes: ["runner"], now: new Date(start.getTime() + 10_000), blindWindowSeconds: 120
    }).intents).toEqual([expect.objectContaining({ correlationKey: "not-wired:runner", state: "CLEARED" })]);
  });

  it("restores capture gaps and stranded spool files", () => {
    const gap = Object.freeze({
      captureGapId: "74000000-0000-4000-8000-000000000010", source: "runner",
      gapClass: "QUEUE_FULL", lostCount: 1, openedAt: start, closedAt: null
    });
    const gapInput = (now: Date, rows: readonly Readonly<{
      captureGapId: string; source: string; gapClass: string; lostCount: number;
      openedAt: Date; closedAt: Date | null;
    }>[]) => Object.freeze({
      snapshot: Object.freeze({
        state: "CURRENT" as const, gaps: rows, health: Object.freeze([]), receipts: Object.freeze([]),
        cursor: Object.freeze({ captureGapMs: 0, componentHealthMs: 0, spoolReceiptMs: 0 })
      }),
      now, windowSeconds: 300, severeLostCount: 100
    });
    const gapOpen = createCaptureGapTracker().observe(gapInput(start, [gap])).intents[0]!;
    const gapTracker = createCaptureGapTracker();
    gapTracker.restore([restored(gapOpen)]);
    expect(() => gapTracker.restore([restored(gapOpen)]))
      .toThrow("OBSERVATION_CAPTURE_GAP_RESTORE_INVALID");
    expect(gapTracker.observe(gapInput(new Date(start.getTime() + 1_000), [gap])).intents).toEqual([]);
    expect(gapTracker.observe(gapInput(new Date(start.getTime() + 2_000), [{
      ...gap, closedAt: new Date(start.getTime() + 1_500)
    }])).intents).toEqual([expect.objectContaining({ state: "CLEARED" })]);

    const file = Object.freeze({
      runtime: "runner", spoolRef: "runner-42-74000000-0000-4000-8000-000000000010.spool",
      mtime: start, ageSeconds: 600
    });
    const spoolOpen = createSpoolHealthTracker().observe({
      scan: { state: "CURRENT", files: [file] }, receipts: { state: "CURRENT", refs: [] },
      now: new Date(start.getTime() + 600_000), thresholdSeconds: 600
    }).intents[0]!;
    const spool = createSpoolHealthTracker();
    spool.restore([restored(spoolOpen)]);
    const mismatchedSpool = restored(spoolOpen);
    expect(createSpoolHealthTracker().legacyCorrelationKey(signalSchema.parse({
      ...mismatchedSpool.signal,
      evidence: {
        ...(mismatchedSpool.signal.evidence as Readonly<Record<string, unknown>>),
        runtime: "api"
      }
    }))).toBeNull();
    expect(spool.observe({
      scan: { state: "CURRENT", files: [file] }, receipts: { state: "CURRENT", refs: [] },
      now: new Date(start.getTime() + 601_000), thresholdSeconds: 600
    }).intents).toEqual([]);
    expect(spool.observe({
      scan: { state: "CURRENT", files: [] }, receipts: { state: "CURRENT", refs: [] },
      now: new Date(start.getTime() + 602_000), thresholdSeconds: 600
    }).intents).toEqual([expect.objectContaining({ state: "CLEARED" })]);
  });

  it("restores host, Postgres, and certificate capacity state", () => {
    const hostThresholds = {
      diskDegradedFreePercent: 15, diskFatalFreePercent: 5,
      memorySevereAvailablePercent: 10, loadPerCoreMultiplier: 2,
      loadSustainedSamples: 10, clearSamples: 1
    };
    const hostSnapshot = (diskFreePercent: number, at: Date) => Object.freeze({
      diskTotalBytes: 100, diskFreeBytes: diskFreePercent, diskFreePercent,
      dockerDiskBytes: 0, memoryTotalBytes: 100, memoryAvailableBytes: 100,
      memoryAvailablePercent: 100, loadOneMinute: 0, logicalCores: 1,
      containers: Object.freeze([]), observedAt: at
    });
    const hostOpen = createHostCapacityTracker().observe({
      snapshot: hostSnapshot(4, start), thresholds: hostThresholds
    }).intents[0]!;
    const host = createHostCapacityTracker();
    host.restore([restored(hostOpen)]);
    expect(host.observe({ snapshot: hostSnapshot(4, new Date(start.getTime() + 1_000)), thresholds: hostThresholds }).intents).toEqual([]);
    expect(host.observe({ snapshot: hostSnapshot(20, new Date(start.getTime() + 2_000)), thresholds: hostThresholds }).intents)
      .toEqual([expect.objectContaining({ correlationKey: "host-disk", state: "CLEARED" })]);

    const pgThresholds = {
      connectionsSeverePercent: 80, connectionsFatalPercent: 95,
      lockWaiterCount: 1, lockWaitSeconds: 60, transactionAgeSeconds: 300,
      idleInTransactionCount: 5, idleInTransactionSeconds: 120, clearSamples: 1
    };
    const pgSnapshot = (usedConnections: number, at: Date) => Object.freeze({
      usedConnections, maxConnections: 100, lockWaiters: 0, longestLockWaitSeconds: 0,
      longestTransactionAgeSeconds: 0, activeQueryAgeSeconds: 0,
      idleInTransactionCount: 0, idleInTransactionAgeSeconds: 0,
      debateaiDatabaseBytes: 0, hatchetDatabaseBytes: 0, observedAt: at
    });
    const pgOpen = createPostgresCapacityTracker().observe({
      snapshot: pgSnapshot(96, start), thresholds: pgThresholds
    }).intents[0]!;
    const postgres = createPostgresCapacityTracker();
    postgres.restore([restored(pgOpen)]);
    expect(postgres.observe({ snapshot: pgSnapshot(96, new Date(start.getTime() + 1_000)), thresholds: pgThresholds }).intents).toEqual([]);
    expect(postgres.observe({ snapshot: pgSnapshot(10, new Date(start.getTime() + 2_000)), thresholds: pgThresholds }).intents)
      .toEqual([expect.objectContaining({ correlationKey: "postgres-connections", state: "CLEARED" })]);

    const certificateOpen = createCertificateCapacityTracker().observe({
      snapshot: { days: -1, notAfter: start, observedAt: start },
      thresholds: { degradedDays: 14, severeDays: 3 }
    }).intents[0]!;
    const certificate = createCertificateCapacityTracker();
    certificate.restore([restored(certificateOpen)]);
    expect(certificate.observe({
      snapshot: { days: -1, notAfter: start, observedAt: new Date(start.getTime() + 1_000) },
      thresholds: { degradedDays: 14, severeDays: 3 }
    }).intents).toEqual([]);
    expect(certificate.observe({
      snapshot: { days: 365, notAfter: start, observedAt: new Date(start.getTime() + 2_000) },
      thresholds: { degradedDays: 14, severeDays: 3 }
    }).intents).toEqual([expect.objectContaining({ state: "CLEARED" })]);
  });

  it("restores provider and run-failure throughput state", () => {
    const failedStatuses = Array(10).fill("PARSE_FAILED");
    const providerInput = {
      minimum: 10, ratio: 0.5, windowMinutes: 5,
      windowStartedAt: start, windowEndedAt: new Date(start.getTime() + 300_000)
    };
    const providerOpen = createProviderHealthTracker().observe(
      [{ providerRef: "provider:alpha", statuses: failedStatuses }], providerInput
    ).intents[0]!;
    const provider = createProviderHealthTracker();
    provider.restore([restored(providerOpen)]);
    expect(provider.observe([{ providerRef: "provider:alpha", statuses: failedStatuses }], {
      ...providerInput, windowEndedAt: new Date(start.getTime() + 301_000)
    }).intents).toEqual([]);
    expect(provider.observe([{ providerRef: "provider:alpha", statuses: Array(10).fill("PARSED") }], {
      ...providerInput, windowEndedAt: new Date(start.getTime() + 302_000)
    }).intents).toEqual([expect.objectContaining({ correlationKey: "provider:provider:alpha", state: "CLEARED" })]);

    const threshold = { minimum: 4, ratio: 0.5, windowMinutes: 60 };
    const failing = { failed: 3, total: 4, windowStartedAt: start, windowEndedAt: new Date(start.getTime() + 3_600_000) };
    const runOpen = createRunFailureTracker().observe(failing, threshold).intents[0]!;
    const runs = createRunFailureTracker();
    runs.restore([restored(runOpen)]);
    expect(runs.observe(failing, threshold).intents).toEqual([]);
    expect(runs.observe({
      failed: 0, total: 4, windowStartedAt: failing.windowEndedAt,
      windowEndedAt: new Date(failing.windowEndedAt.getTime() + 3_600_000)
    }, threshold).intents).toEqual([expect.objectContaining({ correlationKey: "run-failure", state: "CLEARED" })]);
  });

  it("restores Hatchet throughput state", () => {
    const thresholds = {
      queueDepth: 10, queueSeconds: 300, dispatchP95Seconds: 30,
      failedTasks: 3, failedWindowMinutes: 15
    };
    const snapshot = (dispatchP95Seconds: number, at: Date) => ({
      queueDepth: 0, dispatchP95Seconds, failedTasksTotal: 0, createdTasksTotal: 0,
      observedAt: at, source: "REST" as const
    });
    const open = createHatchetThroughputTracker().observe(snapshot(31, start), thresholds).intents[0]!;
    const tracker = createHatchetThroughputTracker();
    tracker.restore([restored(open)]);
    expect(tracker.observe(snapshot(31, new Date(start.getTime() + 1_000)), thresholds).intents).toEqual([]);
    expect(tracker.observe(snapshot(1, new Date(start.getTime() + 2_000)), thresholds).intents)
      .toEqual([expect.objectContaining({ correlationKey: "hatchet-dispatch-p95", state: "CLEARED" })]);
  });

  it("restores container absence and crash-interrupted restart witnesses", () => {
    const absentInspection = Object.freeze({
      component: "postgres" as const, status: "exited", startedAt: null,
      container: "debateai-v3-postgres-1", finishedAt: start,
      restartCount: 0, restartPolicy: "always", exitCode: 1
    });
    const before = createContainerWitness({ agentStartedAt: start, absentAfterMs: 1_000 });
    const open = before.observe([absentInspection], new Date(start.getTime() + 1_000)).intents[0]!;
    const after = createContainerWitness({
      agentStartedAt: new Date(start.getTime() + 2_000), absentAfterMs: 1_000
    });
    after.restore([restored(open)]);
    expect(after.observe([absentInspection], new Date(start.getTime() + 3_000)).intents).toEqual([]);
    expect(after.observe([Object.freeze({
      ...absentInspection, status: "running", startedAt: new Date(start.getTime() + 2_500)
    })], new Date(start.getTime() + 4_000)).intents)
      .toEqual([expect.objectContaining({ correlationKey: "expected:postgres", state: "CLEARED" })]);

    const restartedBefore = createContainerWitness({ agentStartedAt: start, absentAfterMs: 60_000 });
    restartedBefore.observe([Object.freeze({
      ...absentInspection, status: "running", startedAt: start
    })], start);
    const restartOpen = restartedBefore.observe([Object.freeze({
      ...absentInspection, status: "running", startedAt: new Date(start.getTime() + 5_000), restartCount: 1
    })], new Date(start.getTime() + 5_000)).intents[0]!;
    const restartedAfter = createContainerWitness({ agentStartedAt: start, absentAfterMs: 60_000 });
    restartedAfter.restore([restored(restartOpen)]);
    expect(restartedAfter.observe([Object.freeze({
      ...absentInspection, status: "running", startedAt: new Date(start.getTime() + 5_000), restartCount: 1
    })], new Date(start.getTime() + 6_000)).intents)
      .toEqual([expect.objectContaining({ correlationKey: restartOpen.correlationKey, state: "CLEARED" })]);
  });

  it("restores missed-schedule state", () => {
    const thresholds = { schedule: { "replay-self-test": { cadence_s: 60, grace_s: 15 } } } as const;
    const open = createScheduleTracker(start).observe(
      [], thresholds, new Date(start.getTime() + 75_000)
    )[0]!;
    const tracker = createScheduleTracker(new Date(start.getTime() + 80_000));
    tracker.restore([restored(open)]);
    expect(tracker.observe([], thresholds, new Date(start.getTime() + 90_000))).toEqual([]);
    expect(tracker.observe([{
      job: "replay-self-test", completedAt: new Date(start.getTime() + 91_000),
      exitCode: 0, reportOk: true
    }], thresholds, new Date(start.getTime() + 91_000)))
      .toEqual([expect.objectContaining({ correlationKey: "schedule:replay-self-test", state: "CLEARED" })]);
  });
});

describe("OBS-01 complete boot restoration", () => {
  it("boots from cache and journal through recovery, contained module failure, and atomic status", async () => {
    const root = resolve(import.meta.dirname, "../..");
    const stateDir = await mkdtemp(join(tmpdir(), "obs-complete-boot-"));
    const targetsDir = join(stateDir, "targets");
    scratchDirectories.push(stateDir);
    await mkdir(targetsDir, { recursive: true });
    await Promise.all(["OBS-03.json", "OBS-07.json"].map(async (name) => {
      await writeFile(
        join(targetsDir, name),
        await readFile(resolve(root, "deploy/observation-agent/targets.dev.d", name), "utf8")
      );
    }));

    const basePolicy = JSON.parse(await readFile(
      resolve(root, "deploy/observation-agent/thresholds/defaults/OBS-01.json"),
      "utf8"
    )) as Readonly<Record<string, unknown>>;
    const policy = parseRatifiedThresholdPolicy({
      version: 9,
      value: {
        ...basePolicy,
        routing: {
          ...(basePolicy.routing as Readonly<Record<string, unknown>>),
          WORKER_LOST: "SEVERE"
        },
        modules: {
          "stall-detectors": {
            heartbeat_age_s: 30,
            detector_interval_ms: 15_000,
            worker_ref: "debateai-dev-runner",
            worker_list_url: "http://127.0.0.1:8888/api/v1/tenants/main/worker"
          },
          routing: {
            storm_count: 5,
            storm_window_s: 60,
            escalation_interval_ms: 1_800_000,
            fatal_resend_max: 3,
            board: "ops-alerts"
          },
          "status-page": { port: 9797 }
        }
      },
      sourceRef: "task-9-cache",
      ratifiedBy: "V",
      appliedAt: new Date("2026-09-06T00:00:00.000Z")
    });
    await new ThresholdPolicyCache(stateDir).write(policy);

    const journal = new ObservationJournal(stateDir);
    await journal.appendSignal(workerOpen(originalId), {
      owner: "stall-detectors",
      correlationKey: "worker:debateai-dev-runner"
    });
    const failedAt = new Date(Date.now() + 60_000);
    await journal.appendDeliveryResult({
      kind: "RESULT",
      delivery: {
        delivery_id: "79000000-0000-4000-8000-000000000901",
        signal_id: originalId,
        channel: "sendmail",
        attempted_at: failedAt.toISOString(),
        delivered_at: null,
        outcome: "FAILED",
        external_ref: null
      }
    });

    const timeline: string[] = [];
    const restoredAtProbe: string[][] = [];
    const routed: ObservationSignal[] = [];
    let sentinelRuns = 0;
    const stallBase = createStallDetectorsModule({
      tokenPath: () => undefined,
      readHeartbeat: async (input) => workerSnapshot("FRESH", input.now),
      readDefectInputs: async () => Object.freeze({
        stallRows: Object.freeze([]), readyRows: Object.freeze([]),
        progressRows: Object.freeze([]), suspiciousRows: Object.freeze([])
      })
    });
    const stallLifecycle = stallBase.lifecycle!;
    const stall: Module = Object.freeze({
      ...stallBase,
      lifecycle: Object.freeze({
        legacyCorrelationKey: stallLifecycle.legacyCorrelationKey,
        restore(opens: Parameters<ModuleLifecycle["restore"]>[0]) {
          timeline.push("lifecycle:stall-detectors");
          stallLifecycle.restore(opens);
        }
      }),
      async probe(context) {
        timeline.push("probe:stall-detectors");
        restoredAtProbe.push((context.openSignals ?? []).map((open) => open.signal.signal_id));
        return stallBase.probe(context);
      }
    });
    const routingBase = createRoutingModule();
    const routingLifecycle = routingBase.lifecycle!;
    const routing: Module = Object.freeze({
      ...routingBase,
      lifecycle: Object.freeze({
        legacyCorrelationKey: routingLifecycle.legacyCorrelationKey,
        restore(opens: Parameters<ModuleLifecycle["restore"]>[0]) {
          timeline.push("lifecycle:routing");
          routingLifecycle.restore(opens);
        }
      }),
      async probe(context) {
        timeline.push("probe:routing");
        return routingBase.probe(context);
      }
    });
    const statusBase = createStatusPageModule({
      async start() {
        throw new ObservationError("OBSERVATION_STATUS_BIND_FAILED");
      }
    });
    const statusPage: Module = Object.freeze({
      ...statusBase,
      async probe(context) {
        timeline.push("probe:status-page");
        return statusBase.probe(context);
      }
    });
    const sentinel: Module = Object.freeze({
      name: "zz-sentinel",
      cadence: Object.freeze({ intervalMs: 30_000, timeoutMs: 2_000 }),
      async probe() {
        timeline.push("probe:zz-sentinel");
        sentinelRuns += 1;
        return Object.freeze([]);
      },
      samples() { return Object.freeze([]); },
      signals() { return Object.freeze([]); }
    });
    const modules = Object.freeze([stall, routing, statusPage, sentinel]);
    const offline = () => Object.assign(new Error("POSTGRES_UNAVAILABLE"), {
      code: "ECONNREFUSED"
    });
    const daemonPool = Object.freeze({
      async connect(): Promise<never> { throw offline(); },
      async end() {}
    });
    const priorTermListeners = new Set(process.listeners("SIGTERM"));
    const priorInterruptListeners = new Set(process.listeners("SIGINT"));
    const priorExitCode = process.exitCode;

    vi.resetModules();
    vi.stubGlobal("setInterval", () => 1);
    vi.stubGlobal("clearInterval", () => undefined);
    vi.doMock("pg", () => ({
      default: {
        Pool: class {
          async connect(): Promise<never> { throw offline(); }
          async end() {}
        }
      }
    }));
    vi.doMock("../../packages/register/src/runtime-environment.js", () => ({
      loadObservationAgentEnvironment: () => ({
        OBSERVATION_DATABASE_URL: "postgresql://127.0.0.1:1/unavailable",
        OBSERVATION_STATE_DIR: stateDir,
        OBSERVATION_TARGETS_PATH: targetsDir
      })
    }));
    vi.doMock("../../apps/observation-agent/src/core/database.js", () => ({
      createObservationDaemonDatabase: () => Object.freeze({
        pool: daemonPool,
        database: Object.freeze({
          async withClient<T>(): Promise<T> { throw offline(); }
        })
      })
    }));
    vi.doMock("../../apps/observation-agent/src/core/modules.js", async () => {
      const actual = await vi.importActual<typeof import(
        "../../apps/observation-agent/src/core/modules.js"
      )>("../../apps/observation-agent/src/core/modules.js");
      return {
        ...actual,
        discoverObservationRuntimeModules: async () => Object.freeze({
          modules,
          targetFragments: Object.freeze(["OBS-03.json", "OBS-07.json"]),
          routerContribution: Object.freeze({
            moduleName: "routing",
            targetFragmentBasename: "OBS-07.json",
            factory: routing.router!
          })
        }),
        async createOwnedSignalRouter(...args: Parameters<typeof actual.createOwnedSignalRouter>) {
          const created = await actual.createOwnedSignalRouter(...args);
          timeline.push("router-construction");
          return Object.freeze({
            async onSignal(input: Parameters<typeof created.onSignal>[0]) {
              routed.push(input.signal);
              if (input.signal.impact_code === "IMPACT_AGENT_START") {
                timeline.push("initial-self-signal");
              }
              await created.onSignal(input);
            },
            onTick: created.onTick,
            status: created.status
          });
        }
      };
    });
    vi.doMock("../../apps/observation-agent/src/core/targets.js", async () => {
      const actual = await vi.importActual<typeof import(
        "../../apps/observation-agent/src/core/targets.js"
      )>("../../apps/observation-agent/src/core/targets.js");
      return {
        ...actual,
        async loadObservationTargetCatalog(path: string) {
          const catalog = await actual.loadObservationTargetCatalog(path);
          timeline.push("validated-targets");
          return catalog;
        }
      };
    });
    vi.doMock("../../apps/observation-agent/src/core/threshold-cache.js", async () => {
      const actual = await vi.importActual<typeof import(
        "../../apps/observation-agent/src/core/threshold-cache.js"
      )>("../../apps/observation-agent/src/core/threshold-cache.js");
      return {
        ...actual,
        async readBootThresholdPolicy(
          input: Parameters<typeof actual.readBootThresholdPolicy>[0]
        ) {
          const selected = await actual.readBootThresholdPolicy(input);
          timeline.push(`policy:${selected.source}`);
          return selected;
        }
      };
    });
    vi.doMock("../../apps/observation-agent/src/journal/records.js", async () => {
      const actual = await vi.importActual<typeof import(
        "../../apps/observation-agent/src/journal/records.js"
      )>("../../apps/observation-agent/src/journal/records.js");
      return {
        ...actual,
        async replayObservationJournals(
          ...args: Parameters<typeof actual.replayObservationJournals>
        ) {
          const replayed = await actual.replayObservationJournals(...args);
          timeline.push("journal-replay");
          return replayed;
        }
      };
    });
    vi.doMock("../../apps/observation-agent/src/modules/self/heartbeat.js", () => ({
      HeartbeatWriter: class {},
      writeHeartbeatFailOpen: async () => false
    }));
    vi.doMock("../../apps/observation-agent/src/store/samples.js", () => ({
      SampleRingStore: class { async write() {} }
    }));
    vi.doMock("../../apps/observation-agent/src/store/status.js", async () => {
      const actual = await vi.importActual<typeof import(
        "../../apps/observation-agent/src/store/status.js"
      )>("../../apps/observation-agent/src/store/status.js");
      return {
        ...actual,
        async writeStatusSnapshot(...args: Parameters<typeof actual.writeStatusSnapshot>) {
          await actual.writeStatusSnapshot(...args);
          timeline.push("atomic-status-write");
        }
      };
    });

    try {
      process.exitCode = undefined;
      await import("../../apps/observation-agent/src/main.js");
      await vi.waitFor(() => {
        expect(timeline).toContain("atomic-status-write");
      });

      expect(timeline).toEqual([
        "validated-targets",
        "policy:LAST_RATIFIED_CACHE",
        "journal-replay",
        "lifecycle:stall-detectors",
        "lifecycle:routing",
        "router-construction",
        "initial-self-signal",
        "probe:stall-detectors",
        "probe:routing",
        "probe:status-page",
        "probe:zz-sentinel",
        "atomic-status-write"
      ]);
      expect(restoredAtProbe).toEqual([[originalId]]);
      expect(routed.filter((signal) => signal.class === "WORKER_LOST")).toEqual([
        expect.objectContaining({ state: "CLEARED", clears_signal_id: originalId })
      ]);
      expect(routed).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ state: "OPEN", class: "WORKER_LOST" })
      ]));
      const deliveryHealth = routed.find((signal) =>
        signal.impact_code === "IMPACT_AGENT_DELIVERY");
      expect(deliveryHealth).toMatchObject({
        state: "OPEN",
        component: "observation_agent",
        class: "AGENT_SELF",
        suspected_defect: false,
        defect_kind: null,
        evidence: { reason: "DELIVERY_FAILURE", channel: "sendmail" }
      });
      const finalReplay = await replayObservationJournals(
        stateDir,
        new Set(["core-liveness", "stall-detectors", "routing"])
      );
      expect(finalReplay.openSignals).toEqual([
        expect.objectContaining({
          lifecycle: { owner: "routing", correlationKey: "delivery:sendmail" },
          signal: expect.objectContaining({ signal_id: deliveryHealth?.signal_id })
        })
      ]);
      expect(finalReplay.deliveryResults).toHaveLength(1);
      expect(sentinelRuns).toBe(1);
      const snapshot = JSON.parse(await readFile(join(stateDir, "status.json"), "utf8")) as {
        components: Record<string, { open_signal_ids: string[] }>;
        modules: Record<string, readonly unknown[]>;
      };
      expect(snapshot.components.runner?.open_signal_ids).toEqual([]);
      expect(snapshot.components.observation_agent?.open_signal_ids)
        .toContain(deliveryHealth?.signal_id);
      expect(snapshot.modules["status-page"]).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "state", key: "status.health", state: "DEGRADED" })
      ]));
    } finally {
      process.exitCode = priorExitCode;
      for (const listener of process.listeners("SIGTERM")) {
        if (!priorTermListeners.has(listener)) process.removeListener("SIGTERM", listener);
      }
      for (const listener of process.listeners("SIGINT")) {
        if (!priorInterruptListeners.has(listener)) process.removeListener("SIGINT", listener);
      }
      vi.unstubAllGlobals();
      for (const path of [
        "pg",
        "../../packages/register/src/runtime-environment.js",
        "../../apps/observation-agent/src/core/database.js",
        "../../apps/observation-agent/src/core/modules.js",
        "../../apps/observation-agent/src/core/targets.js",
        "../../apps/observation-agent/src/core/threshold-cache.js",
        "../../apps/observation-agent/src/journal/records.js",
        "../../apps/observation-agent/src/modules/self/heartbeat.js",
        "../../apps/observation-agent/src/store/samples.js",
        "../../apps/observation-agent/src/store/status.js"
      ]) vi.doUnmock(path);
      vi.resetModules();
    }
  });
});
