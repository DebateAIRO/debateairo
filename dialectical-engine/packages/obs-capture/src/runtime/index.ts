import {
  createCaptureEmitter,
  installCaptureEmitter,
  type CaptureEmitter,
  type CaptureQueueEntry,
} from "../emit.js";
import { createCaptureFlusher, type CaptureFlusher } from "../flusher.js";
import {
  createCaptureGapCounter,
  createCaptureHealth,
  type CaptureGapCounter,
  type CaptureHealth,
} from "../health.js";
import { clampSpoolRecordLimit } from "../safe-metadata.js";
import { BoundedReferenceQueue } from "../queue.js";
import { createSharedRedactor } from "../redactor.js";
import { createPreopenedSpool, type SpoolWriter } from "../spool.js";
import { readObsBounds, type ObsBounds } from "./config.js";
import { drainDeadSpoolFiles } from "./drain.js";
import {
  createPostgresCaptureSink,
  createTierOneExitSink,
  type PostgresCaptureSink,
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

interface ActiveRuntimeState {
  phase: RuntimePhase;
  readonly bounds: ObsBounds;
  readonly emitter: CaptureEmitter;
  readonly health: CaptureHealth;
  readonly gaps: CaptureGapCounter;
  readonly databaseSink: PostgresCaptureSink;
  readonly flusher: CaptureFlusher;
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

let runtimeState: ActiveRuntimeState | undefined;

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
): ActiveRuntimeState {
  const bounds = readObsBounds();
  const queue = new BoundedReferenceQueue<CaptureQueueEntry>(
    bounds.queueCapacity,
  );
  const health = createCaptureHealth();
  const gaps = createCaptureGapCounter({ health });
  const emitter = createCaptureEmitter({ queue, health, gaps });
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
    gaps,
  });
  const state: ActiveRuntimeState = {
    phase: "ARMING",
    bounds,
    emitter,
    health,
    gaps,
    databaseSink,
    flusher,
    timer: undefined,
    flushInFlight: undefined,
    drainInFlight: undefined,
  };
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
  return state;
}

async function flushRuntimeOnce(state: ActiveRuntimeState): Promise<void> {
  await state.gaps.flushOne((row) => state.databaseSink.writeCaptureGap(row));
  await state.flusher.flushOnce();
}

function startFlushTimer(state: ActiveRuntimeState): void {
  const timer = setInterval(() => {
    if (state.phase !== "ARMED" || state.flushInFlight !== undefined) return;
    const flush = flushRuntimeOnce(state)
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
  if (runtimeState !== undefined && runtimeState.phase !== "STOPPED") return;
  const state = createStartingState(options);
  runtimeState = state;
  const startup = (async (): Promise<void> => {
    const transfer = installCaptureEmitter(state.emitter, state.gaps);
    await transfer;
    await flushRuntimeOnce(state);
  })();
  state.flushInFlight = startup;
  try {
    await startup;
  } finally {
    if (state.flushInFlight === startup) state.flushInFlight = undefined;
  }
  if (state.phase === "STOPPED" || runtimeState !== state) return;
  state.phase = "ARMED";
  startFlushTimer(state);
  const drain = drainDeadSpoolFiles({
    spoolDirectory: state.bounds.spoolDir,
    admissionSeal: state.bounds.spoolAdmissionSeal,
    databaseSink: state.databaseSink,
  })
    .catch(() => undefined)
    .finally(() => {
      if (state.drainInFlight === drain) state.drainInFlight = undefined;
    });
  state.drainInFlight = drain;
}

export async function stopCaptureRuntime(
  options: { readonly deadlineMs: number },
): Promise<void> {
  const state = runtimeState;
  if (state === undefined || state.phase === "STOPPED") return;
  runtimeState = undefined;
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
