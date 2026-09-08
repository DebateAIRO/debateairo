import {
  createCaptureEmitter,
  installCaptureEmitter,
  type CaptureEmitter,
  type CaptureQueueEntry,
} from "../emit.js";
import {
  createCaptureFlusher,
  type CaptureFlusher,
  type FlushResult,
} from "../flusher.js";
import {
  CAPTURE_GAP_CLASSES,
  CAPTURE_HEALTH_CODES,
  createCaptureGapCounter,
  createCaptureHealth,
  type CaptureGapCounter,
  type CaptureHealth,
  type CaptureHealthCode,
} from "../health.js";
import { clampSpoolRecordLimit, UNKNOWN_SOURCE_EVENT_REF } from "../safe-metadata.js";
import { BoundedReferenceQueue } from "../queue.js";
import { createSharedRedactor } from "../redactor.js";
import { createPreopenedSpool, type SpoolWriter } from "../spool.js";
import { readObsBounds, readObsControlDir, type ObsBounds } from "./config.js";
import { captureOffMarkerPath, readCaptureOff } from "./control.js";
import { drainDeadSpoolFiles } from "./drain.js";
import {
  createPostgresCaptureSink,
  createTierOneExitSink,
  type CaptureHeartbeatState,
  type CaptureRuntimeDatabaseSink,
} from "./sink.js";

export type CaptureRuntimeName =
  | "api"
  | "runner"
  | "scheduler"
  | "evaluator-lib"
  | "ui-client"
  | "listener"
  | "watchdog"
  | "ingest";

export type FatalExitSink = () => void;

export interface CaptureRuntimeStartOptions {
  readonly runtime: CaptureRuntimeName;
  readonly spoolFd: number | undefined;
  readonly installExitSink: (nextExitSink: FatalExitSink) => void;
}

export interface RuntimeCaptureModule {
  readonly startCaptureRuntime: (
    options: CaptureRuntimeStartOptions,
  ) => void | Promise<void>;
}

type RuntimePhase = "ARMING" | "ARMED" | "STOPPED";

export type CaptureEmitterInstallOutcome =
  | "installed"
  | "start_failed"
  | "stopped"
  | "timed_out";

type GenerationOutcome = Exclude<CaptureEmitterInstallOutcome, "timed_out">;

interface InstallWaiter {
  settle(outcome: CaptureEmitterInstallOutcome): void;
}

interface RuntimeGeneration {
  readonly id: number;
  readonly waiters: Set<InstallWaiter>;
  outcome: GenerationOutcome | undefined;
}

interface ActiveRuntimeState {
  readonly generation: RuntimeGeneration;
  phase: RuntimePhase;
  readonly bounds: ObsBounds;
  readonly runtime: CaptureRuntimeName;
  readonly queue: BoundedReferenceQueue<CaptureQueueEntry>;
  readonly emitter: CaptureEmitter;
  readonly health: CaptureHealth;
  readonly gaps: CaptureGapCounter;
  readonly databaseSink: CaptureRuntimeDatabaseSink;
  readonly flusher: CaptureFlusher;
  readonly markerPath: string | undefined;
  captureOff: boolean;
  controlInFlight: Promise<void> | undefined;
  lastDetailCode: CaptureHealthCode;
  unreportedDetailCode: CaptureHealthCode | undefined;
  timer: NodeJS.Timeout | undefined;
  flushInFlight: Promise<void> | undefined;
  drainInFlight: Promise<void> | undefined;
}

const ENVELOPE_MAX_BYTES_SEED = 16_384; // seed — V ratifies at FIX-01 acceptance
const ENVIRONMENT_SEED = "unknown"; // seed — V ratifies at FIX-01 acceptance
const BUILD_REF_SEED = "UNTRACKED-DEV:UNKNOWN"; // seed — V ratifies at FIX-01 acceptance
const BUILD_DIRTY_SEED = true; // seed — V ratifies at FIX-01 acceptance
const REDACTION_POLICY_VERSION_SEED = "g0"; // seed — V ratifies at FIX-01 acceptance
const ALLOWLIST_SET_ID_SEED = "g0-empty-parameters"; // seed — V ratifies at FIX-01 acceptance

const EMPTY_FLUSH_RESULT = Object.freeze({
  dequeued: 0,
  persisted: 0,
  spooled: 0,
  lost: 0,
}) satisfies FlushResult;

let runtimeState: ActiveRuntimeState | undefined;
let activeGeneration: RuntimeGeneration | undefined;
let nextGenerationId = 1;
let idleWaiters = new Set<InstallWaiter>();

const UNAVAILABLE_SPOOL: Pick<SpoolWriter, "append"> = Object.freeze({
  append(): void {
    throw new Error("OBS_SPOOL_UNAVAILABLE");
  },
});

function configValue(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? fallback : value;
}

function configBooleanValue(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  return value === undefined || value.length === 0 ? fallback : value === "true";
}

function envelopeMaxBytes(): number {
  const configured = Number(process.env.OBS_ENVELOPE_MAX_BYTES);
  return clampSpoolRecordLimit(Number.isSafeInteger(configured) && configured > 0
    ? configured
    : ENVELOPE_MAX_BYTES_SEED);
}

function createSpool(spoolFd: number | undefined): SpoolWriter | undefined {
  if (spoolFd === undefined) return undefined;
  return createPreopenedSpool({
    fd: spoolFd,
    envelopeMaxBytes: envelopeMaxBytes(),
  });
}

function createStartingState(
  options: CaptureRuntimeStartOptions,
  generation: RuntimeGeneration,
): ActiveRuntimeState {
  const bounds = readObsBounds();
  const queue = new BoundedReferenceQueue<CaptureQueueEntry>(
    bounds.queueCapacity,
  );
  let gaps: CaptureGapCounter | undefined;
  let state: ActiveRuntimeState | undefined;
  let lastDetailCode: CaptureHealthCode = CAPTURE_HEALTH_CODES.FLUSH_OK;
  const health = createCaptureHealth((code) => {
    lastDetailCode = code;
    if (state !== undefined) state.lastDetailCode = code;
    if (code === CAPTURE_HEALTH_CODES.POSTGRES_FAILURE) {
      gaps?.recordLoss(
        "unclassified",
        CAPTURE_GAP_CLASSES.POSTGRES_FAILURE,
        1,
      );
    }
    if (code === CAPTURE_HEALTH_CODES.GAP_WRITE_FAILURE) {
      gaps?.recordLoss(
        "unclassified",
        CAPTURE_GAP_CLASSES.GAP_WRITE_FAILURE,
        1,
      );
    }
  });
  gaps = createCaptureGapCounter({ health });
  const captureGaps = gaps;
  const delegateEmitter = createCaptureEmitter({
    queue,
    health,
    gaps: captureGaps,
  });
  const emitter: CaptureEmitter = Object.freeze({
    emit(envelope: unknown): void {
      if (state?.captureOff !== true) {
        delegateEmitter.emit(envelope);
        return;
      }
      health.record(CAPTURE_HEALTH_CODES.DISABLED);
      captureGaps.recordLoss(
        "first_party",
        CAPTURE_GAP_CLASSES.DISABLED,
        1,
      );
    },
    captureHandled(error: unknown, context: unknown): string {
      if (state?.captureOff !== true) {
        return delegateEmitter.captureHandled(error, context);
      }
      health.record(CAPTURE_HEALTH_CODES.DISABLED);
      captureGaps.recordLoss(
        "first_party",
        CAPTURE_GAP_CLASSES.DISABLED,
        1,
      );
      return UNKNOWN_SOURCE_EVENT_REF;
    },
  });
  const databaseSink = createPostgresCaptureSink({
    connectionString: bounds.writerDatabaseUrl,
  });
  const redactor = createSharedRedactor({
    environment: configValue("OBS_ENVIRONMENT", ENVIRONMENT_SEED),
    build_ref: configValue("OBS_BUILD_REF", BUILD_REF_SEED),
    build_dirty: configBooleanValue("OBS_BUILD_DIRTY", BUILD_DIRTY_SEED),
    runtime: options.runtime,
    component: Object.freeze({
      process: options.runtime,
      package: `@debateai/${options.runtime}`,
    }),
    writer_identity: configValue("OBS_WRITER_IDENTITY", options.runtime),
    redaction_policy_version: configValue(
      "OBS_REDACTION_POLICY_VERSION",
      REDACTION_POLICY_VERSION_SEED,
    ),
    allowlist_set_id: configValue(
      "OBS_ALLOWLIST_SET_ID",
      ALLOWLIST_SET_ID_SEED,
    ),
  });
  const spool = createSpool(options.spoolFd);
  const flusher = createCaptureFlusher({
    queue,
    redactor,
    databaseSink,
    spool: spool ?? UNAVAILABLE_SPOOL,
    health,
    gaps: captureGaps,
  });
  const nextState: ActiveRuntimeState = {
    generation,
    phase: "ARMING",
    bounds,
    runtime: options.runtime,
    queue,
    emitter,
    health,
    gaps: captureGaps,
    databaseSink,
    flusher,
    markerPath: captureOffMarkerPath(readObsControlDir()),
    captureOff: false,
    controlInFlight: undefined,
    lastDetailCode,
    unreportedDetailCode: undefined,
    timer: undefined,
    flushInFlight: undefined,
    drainInFlight: undefined,
  };
  state = nextState;
  if (spool !== undefined) {
    try {
      const envelope = redactor.redact({
        kind: "envelope",
        payload_ref: Object.freeze({
          code: "OBS_CAPTURE_SELF",
          taxonomy_class: "CAPTURE_SELF",
          capture_point: "self",
          disposition: "SELF",
          source: "first_party",
        }),
        ambient_context_ref: undefined,
      });
      const exitSink = createTierOneExitSink({ spool, envelope });
      options.installExitSink(exitSink);
    } catch {
      // Tier 0 remains installed when Tier-1 preparation is unavailable.
    }
  }
  return nextState;
}

function settleGeneration(
  generation: RuntimeGeneration,
  outcome: GenerationOutcome,
): void {
  if (generation.outcome !== undefined) return;
  generation.outcome = outcome;
  for (const waiter of [...generation.waiters]) waiter.settle(outcome);
  generation.waiters.clear();
}

function createGeneration(): RuntimeGeneration {
  const generation = {
    id: nextGenerationId,
    waiters: idleWaiters,
    outcome: undefined,
  } satisfies RuntimeGeneration;
  nextGenerationId += 1;
  idleWaiters = new Set<InstallWaiter>();
  return generation;
}

export function waitForCaptureEmitterInstalled(options: {
  readonly deadlineMs: number;
}): Promise<CaptureEmitterInstallOutcome> {
  if (
    !Number.isFinite(options.deadlineMs)
    || options.deadlineMs < 0
  ) {
    return Promise.resolve("timed_out");
  }
  const generation = activeGeneration;
  if (generation?.outcome !== undefined) {
    return Promise.resolve(generation.outcome);
  }
  const target = generation?.waiters ?? idleWaiters;
  return new Promise((resolve) => {
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const waiter: InstallWaiter = Object.freeze({
      settle(outcome: CaptureEmitterInstallOutcome): void {
        if (settled) return;
        settled = true;
        target.delete(waiter);
        if (timer !== undefined) clearTimeout(timer);
        resolve(outcome);
      },
    });
    target.add(waiter);
    timer = setTimeout(() => waiter.settle("timed_out"), options.deadlineMs);
  });
}

function isCurrentRuntimeState(state: ActiveRuntimeState): boolean {
  return runtimeState === state
    && activeGeneration === state.generation
    && state.phase !== "STOPPED";
}

function beginControlSample(state: ActiveRuntimeState): Promise<void> {
  if (state.controlInFlight !== undefined) return state.controlInFlight;
  const attempt = (async (): Promise<void> => {
    let sampledOff = true;
    try {
      sampledOff = await readCaptureOff(state.markerPath);
    } catch {
      sampledOff = true;
    }
    if (!isCurrentRuntimeState(state)) return;
    if (sampledOff === state.captureOff) return;
    state.captureOff = sampledOff;
    if (sampledOff) {
      const suppressed = state.queue.drain().length;
      if (suppressed > 0) {
        state.gaps.recordLoss(
          "first_party",
          CAPTURE_GAP_CLASSES.DISABLED,
          suppressed,
        );
      }
    }
  })();
  const control = attempt.finally(() => {
    if (state.controlInFlight === control) {
      state.controlInFlight = undefined;
    }
  });
  state.controlInFlight = control;
  return control;
}

async function flushRuntimeOnce(
  state: ActiveRuntimeState,
): Promise<FlushResult> {
  await state.gaps.flushOne((row) => state.databaseSink.writeCaptureGap(row));
  return state.flusher.flushOnce();
}

async function flushArmedCycle(state: ActiveRuntimeState): Promise<void> {
  await state.gaps.flushOne((row) => state.databaseSink.writeCaptureGap(row));
  const result = state.captureOff
    ? EMPTY_FLUSH_RESULT
    : await state.flusher.flushOnce();
  if (!isCurrentRuntimeState(state) || state.phase !== "ARMED") return;

  const heartbeatState: CaptureHeartbeatState = state.captureOff
    ? "OFF"
    : state.drainInFlight !== undefined
    ? "DRAINING"
    : result.spooled > 0
    ? "SPOOL_ONLY"
    : "ARMED";
  const unreportedDetailCode = state.unreportedDetailCode;
  const detailCode = unreportedDetailCode ?? state.lastDetailCode;
  try {
    await state.databaseSink.writeComponentHealth({
      component: `capture:${state.runtime}`,
      state: heartbeatState,
      detailCode,
    });
    if (
      unreportedDetailCode !== undefined
      && state.unreportedDetailCode === unreportedDetailCode
    ) {
      state.unreportedDetailCode = undefined;
    }
  } catch {
    state.unreportedDetailCode ??= CAPTURE_HEALTH_CODES.POSTGRES_FAILURE;
    state.health.record(CAPTURE_HEALTH_CODES.POSTGRES_FAILURE);
  }
}

function startFlushTimer(state: ActiveRuntimeState): void {
  const timer = setInterval(() => {
    if (!isCurrentRuntimeState(state)) return;
    const control = beginControlSample(state);
    if (state.phase !== "ARMED" || state.flushInFlight !== undefined) return;
    const flush = (async (): Promise<void> => {
      await control;
      if (!isCurrentRuntimeState(state) || state.phase !== "ARMED") return;
      await flushArmedCycle(state);
    })()
      .catch(() => undefined)
      .finally(() => {
        if (state.flushInFlight === flush) state.flushInFlight = undefined;
      });
    state.flushInFlight = flush;
  }, state.bounds.flushDeadlineMs);
  timer.unref?.();
  state.timer = timer;
}

export async function startCaptureRuntime(
  options: CaptureRuntimeStartOptions,
): Promise<void> {
  if (
    (runtimeState !== undefined && runtimeState.phase !== "STOPPED")
    || (activeGeneration !== undefined && activeGeneration.outcome === undefined)
  ) return;
  const generation = createGeneration();
  activeGeneration = generation;
  let state: ActiveRuntimeState | undefined;
  try {
    state = createStartingState(options, generation);
    if (activeGeneration !== generation || generation.outcome === "stopped") return;
    runtimeState = state;
    await beginControlSample(state);
    if (
      runtimeState !== state
      || activeGeneration !== generation
      || state.phase === "STOPPED"
    ) return;
    const transfer = installCaptureEmitter(state.emitter, state.gaps);
    settleGeneration(generation, "installed");
    const startup = (async (): Promise<void> => {
      await transfer;
      if (!isCurrentRuntimeState(state!)) return;
      startFlushTimer(state!);
      await flushRuntimeOnce(state!);
    })();
    state.flushInFlight = startup;
    try {
      await startup;
    } finally {
      if (state.flushInFlight === startup) state.flushInFlight = undefined;
    }
    if (!isCurrentRuntimeState(state)) return;
    state.phase = "ARMED";
    const drain = drainDeadSpoolFiles({
      spoolDirectory: state.bounds.spoolDir,
      admissionSeal: state.bounds.spoolAdmissionSeal,
      databaseSink: state.databaseSink,
    })
      .catch(() => undefined)
      .finally(() => {
        if (state?.drainInFlight === drain) state.drainInFlight = undefined;
      });
    state.drainInFlight = drain;
  } catch (error) {
    settleGeneration(generation, "start_failed");
    if (activeGeneration === generation && generation.outcome === "start_failed") {
      activeGeneration = undefined;
    }
    throw error;
  }
}

export async function stopCaptureRuntime(
  options: { readonly deadlineMs: number },
): Promise<void> {
  const generation = activeGeneration;
  const state = runtimeState;
  if (state === undefined || state.phase === "STOPPED") {
    if (generation !== undefined && generation.outcome === undefined) {
      settleGeneration(generation, "stopped");
      if (activeGeneration === generation) activeGeneration = undefined;
    }
    return;
  }
  runtimeState = undefined;
  if (activeGeneration === state.generation) activeGeneration = undefined;
  settleGeneration(state.generation, "stopped");
  state.phase = "STOPPED";
  if (state.timer !== undefined) clearInterval(state.timer);

  const finish = async (): Promise<void> => {
    await state.flushInFlight;
    await state.drainInFlight;
    await flushRuntimeOnce(state);
  };
  let timeout: NodeJS.Timeout | undefined;
  const completed = await Promise.race([
    finish().then(() => true, () => true),
    new Promise<false>((resolve) => {
      timeout = setTimeout(() => resolve(false), Math.max(0, options.deadlineMs));
      timeout.unref?.();
    }),
  ]);
  if (timeout !== undefined) clearTimeout(timeout);
  if (completed) {
    await state.databaseSink.close().catch(() => undefined);
  } else {
    void state.databaseSink.close().catch(() => undefined);
  }
}

export { readObsBounds, type ObsBounds } from "./config.js";
