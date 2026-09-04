import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readObsBounds } from "../../packages/obs-capture/src/runtime/config.js";
import {
  CAPTURE_GAP_CLASSES,
  CAPTURE_HEALTH_CODES,
  type CaptureGapCounter,
  type CaptureGapRow,
  type CaptureHealth,
} from "../../packages/obs-capture/src/health.js";
import type {
  CaptureEmitter,
  CaptureQueueEntry,
} from "../../packages/obs-capture/src/emit.js";
import type { FlushResult } from "../../packages/obs-capture/src/flusher.js";
import type { ReferenceQueue } from "../../packages/obs-capture/src/queue.js";
import { loadDevelopmentCommandEnvironment } from "../../packages/register/src/runtime-environment.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";

const CADENCE_KEY = "OBS_FLUSH_DEADLINE_MS";
const PROVIDER_KEY = "DEBATEAI_DEV_PROVIDER_TARGETS_JSON";
const MIGRATION_KEY = "MIGRATION_DATABASE_URL";

const cadenceCases = [
  ["absent", undefined, undefined, 5_000],
  ["empty", "", "", 5_000],
  ["malformed", "malformed", "malformed", 5_000],
  ["zero", "0", "0", 5_000],
  ["negative", "-1", "-1", 5_000],
  ["fractional", "1.5", "1.5", 5_000],
  ["below default", "250", "250", 250],
  ["default", "5000", "5000", 5_000],
  ["non-default", "7250", "7250", 7_250],
  ["maximum safe", "9007199254740991", "9007199254740991", Number.MAX_SAFE_INTEGER],
  ["overflow", "9007199254740992", "9007199254740992", 5_000],
] as const;

const scratchDirectories: string[] = [];

function withObsFlushDeadline<T>(
  raw: string | undefined,
  callback: () => T,
): T {
  const hadOwn = Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY);
  const previous = process.env[CADENCE_KEY];
  try {
    if (raw === undefined) delete process.env[CADENCE_KEY];
    else process.env[CADENCE_KEY] = raw;
    return callback();
  } finally {
    if (hadOwn) process.env[CADENCE_KEY] = previous;
    else delete process.env[CADENCE_KEY];
  }
}

async function withObsFlushDeadlineAsync<T>(
  raw: string | undefined,
  callback: () => T | PromiseLike<T>,
): Promise<Awaited<T>> {
  const hadOwn = Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY);
  const previous = process.env[CADENCE_KEY];
  try {
    if (raw === undefined) delete process.env[CADENCE_KEY];
    else process.env[CADENCE_KEY] = raw;
    return await callback();
  } finally {
    if (hadOwn) process.env[CADENCE_KEY] = previous;
    else delete process.env[CADENCE_KEY];
  }
}

type CapturedCadence =
  | { readonly present: false }
  | { readonly present: true; readonly value: string };

function capturedCadence(
  environment: Readonly<Record<string, string>>,
): CapturedCadence {
  if (!Object.prototype.hasOwnProperty.call(environment, CADENCE_KEY)) {
    return { present: false };
  }
  return { present: true, value: environment[CADENCE_KEY]! };
}

type CallerId =
  | "auth-stack"
  | "hatchet-token"
  | "api-environment"
  | "auth-data-plane"
  | "deployment-register"
  | "api-process"
  | "ui-process";

const callers = [
  { id: "auth-stack", provider: false, deployment: false },
  { id: "hatchet-token", provider: false, deployment: false },
  { id: "api-environment", provider: true, deployment: false },
  { id: "auth-data-plane", provider: true, deployment: false },
  { id: "deployment-register", provider: true, deployment: true },
  { id: "api-process", provider: false, deployment: false },
  { id: "ui-process", provider: false, deployment: false },
] as const satisfies readonly Readonly<{
  id: CallerId;
  provider: boolean;
  deployment: boolean;
}>[];

function removeCallerMocks(): void {
  vi.doUnmock("@debateai/register");
  vi.doUnmock("@debateai/db");
  vi.doUnmock("../../apps/runner/src/dev-auth-stack.js");
  vi.doUnmock("../../apps/runner/src/dev-hatchet-token.js");
  vi.doUnmock("../../apps/runner/src/dev-api-environment.js");
  vi.doUnmock("../../apps/runner/src/dev-auth-data-plane.js");
  vi.doUnmock("../../apps/runner/src/dev-deployment-register.js");
  vi.doUnmock("../../apps/runner/src/dev-api-process.js");
  vi.doUnmock("../../apps/runner/src/dev-ui-process.js");
}

async function installCallerMock(
  id: CallerId,
  sentinel: Error,
  invoked: { count: number },
): Promise<void> {
  const reject = async (): Promise<never> => {
    invoked.count += 1;
    throw sentinel;
  };
  switch (id) {
    case "auth-stack":
      vi.doMock("../../apps/runner/src/dev-auth-stack.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-auth-stack.js")>(
          "../../apps/runner/src/dev-auth-stack.js",
        ),
        startDevelopmentAuthStack: reject,
      }));
      break;
    case "hatchet-token":
      vi.doMock("../../apps/runner/src/dev-hatchet-token.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-hatchet-token.js")>(
          "../../apps/runner/src/dev-hatchet-token.js",
        ),
        provisionDevelopmentHatchetToken: reject,
      }));
      break;
    case "api-environment":
      vi.doMock("../../apps/runner/src/dev-api-environment.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-api-environment.js")>(
          "../../apps/runner/src/dev-api-environment.js",
        ),
        assembleDevelopmentApiEnvironment: reject,
      }));
      break;
    case "auth-data-plane":
      vi.doMock("../../apps/runner/src/dev-auth-data-plane.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-auth-data-plane.js")>(
          "../../apps/runner/src/dev-auth-data-plane.js",
        ),
        bootstrapDevelopmentAuthDataPlane: reject,
      }));
      break;
    case "deployment-register":
      vi.doMock("../../apps/runner/src/dev-deployment-register.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-deployment-register.js")>(
          "../../apps/runner/src/dev-deployment-register.js",
        ),
        seedDevelopmentDeploymentRegister: reject,
      }));
      break;
    case "api-process":
      vi.doMock("../../apps/runner/src/dev-api-process.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-api-process.js")>(
          "../../apps/runner/src/dev-api-process.js",
        ),
        startDevelopmentApiProcess: reject,
      }));
      break;
    case "ui-process":
      vi.doMock("../../apps/runner/src/dev-ui-process.js", async () => ({
        ...await vi.importActual<typeof import("../../apps/runner/src/dev-ui-process.js")>(
          "../../apps/runner/src/dev-ui-process.js",
        ),
        startDevelopmentUiProcess: reject,
      }));
      break;
  }
}

async function importCaller(id: CallerId): Promise<unknown> {
  switch (id) {
    case "auth-stack":
      return import("../../apps/runner/src/dev-auth-stack-cli.js");
    case "hatchet-token":
      return import("../../apps/runner/src/dev-hatchet-token-cli.js");
    case "api-environment":
      return import("../../apps/runner/src/dev-api-environment-cli.js");
    case "auth-data-plane":
      return import("../../apps/runner/src/dev-auth-data-plane-cli.js");
    case "deployment-register":
      return import("../../apps/runner/src/dev-deployment-register-cli.js");
    case "api-process":
      return import("../../apps/runner/src/dev-api-process-cli.js");
    case "ui-process":
      return import("../../apps/runner/src/dev-ui-process-cli.js");
  }
}

interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const EMPTY_FLUSH_RESULT = Object.freeze({
  dequeued: 0,
  persisted: 0,
  spooled: 0,
  lost: 0,
}) satisfies FlushResult;

interface RuntimeTestHarness {
  controlValue: boolean;
  readonly controlResponses: Promise<boolean>[];
  controlReads: number;
  controlActive: number;
  maximumControlActive: number;
  controlFailures: number;
  transfer: Promise<void>;
  drain: Promise<void>;
  installCalls: number;
  installedEmitter: CaptureEmitter | undefined;
  queue: ReferenceQueue<CaptureQueueEntry> | undefined;
  health: CaptureHealth | undefined;
  gaps: CaptureGapCounter | undefined;
  flushCalls: number;
  readonly flushSteps: Array<() => Promise<FlushResult>>;
  heartbeatFailures: number;
  readonly heartbeats: Array<Readonly<{
    component: string;
    state: string;
    detailCode: string;
  }>>;
  readonly gapFailures: string[];
  readonly gapRows: CaptureGapRow[];
  closeCalls: number;
}

function removeRuntimeMocks(): void {
  vi.doUnmock("../../packages/obs-capture/src/runtime/config.js");
  vi.doUnmock("../../packages/obs-capture/src/runtime/control.js");
  vi.doUnmock("../../packages/obs-capture/src/runtime/sink.js");
  vi.doUnmock("../../packages/obs-capture/src/runtime/drain.js");
  vi.doUnmock("../../packages/obs-capture/src/flusher.js");
  vi.doUnmock("../../packages/obs-capture/src/emit.js");
}

async function loadRuntimeHarness(): Promise<{
  readonly harness: RuntimeTestHarness;
  readonly runtime: typeof import("../../packages/obs-capture/src/runtime/index.js");
  readonly capture: typeof import("../../packages/obs-capture/src/emit.js");
}> {
  removeRuntimeMocks();
  vi.resetModules();
  const harness: RuntimeTestHarness = {
    controlValue: false,
    controlResponses: [],
    controlReads: 0,
    controlActive: 0,
    maximumControlActive: 0,
    controlFailures: 0,
    transfer: Promise.resolve(),
    drain: Promise.resolve(),
    installCalls: 0,
    installedEmitter: undefined,
    queue: undefined,
    health: undefined,
    gaps: undefined,
    flushCalls: 0,
    flushSteps: [],
    heartbeatFailures: 0,
    heartbeats: [],
    gapFailures: [],
    gapRows: [],
    closeCalls: 0,
  };

  vi.doMock("../../packages/obs-capture/src/runtime/config.js", async () => ({
    ...await vi.importActual<typeof import("../../packages/obs-capture/src/runtime/config.js")>(
      "../../packages/obs-capture/src/runtime/config.js",
    ),
    readObsBounds: () => Object.freeze({
      flushDeadlineMs: 25,
      queueCapacity: 8,
      spoolDir: undefined,
      spoolAdmissionSeal: undefined,
      writerDatabaseUrl: "postgresql://fix07.invalid/fix07",
    }),
    readObsControlDir: () => "/tmp/fix07-control",
  }));
  vi.doMock("../../packages/obs-capture/src/runtime/control.js", async () => ({
    ...await vi.importActual<typeof import("../../packages/obs-capture/src/runtime/control.js")>(
      "../../packages/obs-capture/src/runtime/control.js",
    ),
    async readCaptureOff(): Promise<boolean> {
      harness.controlReads += 1;
      harness.controlActive += 1;
      harness.maximumControlActive = Math.max(
        harness.maximumControlActive,
        harness.controlActive,
      );
      try {
        if (harness.controlFailures > 0) {
          harness.controlFailures -= 1;
          throw new Error("PLANTED_CONTROL_FAILURE");
        }
        return await (harness.controlResponses.shift()
          ?? Promise.resolve(harness.controlValue));
      } finally {
        harness.controlActive -= 1;
      }
    },
  }));
  vi.doMock("../../packages/obs-capture/src/runtime/sink.js", async () => ({
    ...await vi.importActual<typeof import("../../packages/obs-capture/src/runtime/sink.js")>(
      "../../packages/obs-capture/src/runtime/sink.js",
    ),
    createPostgresCaptureSink: () => Object.freeze({
      async writeOccurrences(): Promise<void> {},
      async ingestSpooledOccurrence(): Promise<void> {},
      async writeCaptureGap(row: CaptureGapRow): Promise<void> {
        if (harness.gapFailures[0] === row.gap_class) {
          harness.gapFailures.shift();
          throw new Error(`PLANTED_GAP_FAILURE:${row.gap_class}`);
        }
        harness.gapRows.push(row);
      },
      async writeComponentHealth(row: Readonly<{
        component: string;
        state: string;
        detailCode: string;
      }>): Promise<void> {
        if (harness.heartbeatFailures > 0) {
          harness.heartbeatFailures -= 1;
          throw new Error("PLANTED_HEARTBEAT_FAILURE");
        }
        harness.heartbeats.push(Object.freeze({ ...row }));
      },
      async close(): Promise<void> {
        harness.closeCalls += 1;
      },
    }),
  }));
  vi.doMock("../../packages/obs-capture/src/runtime/drain.js", async () => ({
    ...await vi.importActual<typeof import("../../packages/obs-capture/src/runtime/drain.js")>(
      "../../packages/obs-capture/src/runtime/drain.js",
    ),
    drainDeadSpoolFiles: () => harness.drain,
  }));
  vi.doMock("../../packages/obs-capture/src/flusher.js", async () => ({
    ...await vi.importActual<typeof import("../../packages/obs-capture/src/flusher.js")>(
      "../../packages/obs-capture/src/flusher.js",
    ),
    createCaptureFlusher(options: Readonly<{
      queue: ReferenceQueue<CaptureQueueEntry>;
      health: CaptureHealth;
      gaps: CaptureGapCounter;
    }>) {
      harness.queue = options.queue;
      harness.health = options.health;
      harness.gaps = options.gaps;
      return Object.freeze({
        async flushOnce(): Promise<FlushResult> {
          harness.flushCalls += 1;
          return harness.flushSteps.shift()?.() ?? EMPTY_FLUSH_RESULT;
        },
      });
    },
  }));
  vi.doMock("../../packages/obs-capture/src/emit.js", async () => {
    const actual = await vi.importActual<
      typeof import("../../packages/obs-capture/src/emit.js")
    >("../../packages/obs-capture/src/emit.js");
    return {
      ...actual,
      installCaptureEmitter(
        emitter: CaptureEmitter,
        gaps?: Pick<CaptureGapCounter, "recordLoss">,
      ): Promise<void> | void {
        harness.installCalls += 1;
        harness.installedEmitter = emitter;
        const actualTransfer = gaps === undefined
          ? actual.installCaptureEmitter(emitter)
          : actual.installCaptureEmitter(emitter, gaps);
        void actualTransfer?.catch(() => undefined);
        return gaps === undefined ? undefined : harness.transfer;
      },
    };
  });

  const runtime = await import("../../packages/obs-capture/src/runtime/index.js");
  const capture = await import("../../packages/obs-capture/src/emit.js");
  return { harness, runtime, capture };
}

async function settleMicrotasks(): Promise<void> {
  for (let turn = 0; turn < 8; turn += 1) {
    await Promise.resolve();
  }
}

afterEach(async () => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  removeCallerMocks();
  removeRuntimeMocks();
  vi.resetModules();
  while (scratchDirectories.length > 0) {
    await rm(scratchDirectories.pop()!, { recursive: true, force: true });
  }
});

describe.sequential("FIX-07 C2 capture control and launch cadence", () => {
  it("accepts only a nonempty absolute control directory independent of spool", async () => {
    const { readObsControlDir } = await import(
      "../../packages/obs-capture/src/runtime/config.js"
    );
    const cases = [
      [{}, undefined],
      [{ OBS_CONTROL_DIR: "" }, undefined],
      [{ OBS_CONTROL_DIR: "relative/control" }, undefined],
      [{ OBS_CONTROL_DIR: "/tmp/fix07\0control" }, undefined],
      [{ OBS_CONTROL_DIR: "/tmp/fix07-control" }, "/tmp/fix07-control"],
      [{ OBS_SPOOL_DIR: "/tmp/spool" }, undefined],
      [{ OBS_CONTROL_DIR: "/tmp/fix07-control", OBS_SPOOL_DIR: "/elsewhere" }, "/tmp/fix07-control"],
    ] as const;

    for (const [environment, expected] of cases) {
      expect(readObsControlDir(environment)).toBe(expected);
    }
  });

  it("uses only CAPTURE_OFF and treats every descriptor except ENOENT as OFF", async () => {
    const { captureOffMarkerPath, readCaptureOff } = await import(
      "../../packages/obs-capture/src/runtime/control.js"
    );
    const directory = await mkdtemp(join(tmpdir(), "fix07-control-"));
    scratchDirectories.push(directory);
    const marker = join(directory, "CAPTURE_OFF");
    const nestedDirectory = join(directory, "nested-marker");
    const symlinkMarker = join(directory, "symlink-marker");

    expect(captureOffMarkerPath(undefined)).toBeUndefined();
    expect(captureOffMarkerPath(directory)).toBe(marker);
    await expect(readCaptureOff(undefined)).resolves.toBe(false);
    await expect(readCaptureOff(marker)).resolves.toBe(false);

    await writeFile(marker, "off\n");
    await mkdir(nestedDirectory);
    await symlink(join(directory, "missing-target"), symlinkMarker);
    await expect(readCaptureOff(marker)).resolves.toBe(true);
    await expect(readCaptureOff(nestedDirectory)).resolves.toBe(true);
    await expect(readCaptureOff(symlinkMarker)).resolves.toBe(true);
    await expect(readCaptureOff("\0invalid-descriptor-path")).resolves.toBe(true);
  });

  it.each(cadenceCases)(
    "transports %s without taking numeric authority",
    (_label, raw, forwarded, effective) => {
      withObsFlushDeadline(raw, () => {
        const commandEnvironment = loadDevelopmentCommandEnvironment();
        expect(commandEnvironment.OBS_FLUSH_DEADLINE_MS).toBe(forwarded);
        expect(withObsFlushDeadline(
          forwarded,
          () => readObsBounds().flushDeadlineMs,
        )).toBe(effective);
      });
    },
  );

  it("keeps asynchronous cadence scope active through every settlement and restores exactly", async () => {
    const originalHadOwn = Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY);
    const original = process.env[CADENCE_KEY];
    try {
      delete process.env[CADENCE_KEY];
      const fromAbsent = await withObsFlushDeadlineAsync("7250", async () => {
        await Promise.resolve();
        expect(process.env[CADENCE_KEY]).toBe("7250");
        return 17;
      });
      expect(fromAbsent).toBe(17);
      expect(Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY)).toBe(false);

      process.env[CADENCE_KEY] = "round5-prior";
      const fromPresent = await withObsFlushDeadlineAsync("", async () => {
        await Promise.resolve();
        expect(process.env[CADENCE_KEY]).toBe("");
        return 23;
      });
      expect(fromPresent).toBe(23);
      expect(process.env[CADENCE_KEY]).toBe("round5-prior");

      await expect(withObsFlushDeadlineAsync("7250", () => {
        throw new Error("SYNC_SENTINEL");
      })).rejects.toThrow("SYNC_SENTINEL");
      expect(process.env[CADENCE_KEY]).toBe("round5-prior");

      await expect(withObsFlushDeadlineAsync("7250", async () => {
        await Promise.resolve();
        throw new Error("ASYNC_SENTINEL");
      })).rejects.toThrow("ASYNC_SENTINEL");
      expect(process.env[CADENCE_KEY]).toBe("round5-prior");

      for (const raw of [undefined, "", "7250", "malformed"] as const) {
        await withObsFlushDeadlineAsync(raw, async () => {
          await Promise.resolve();
          expect(Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY))
            .toBe(raw !== undefined);
          expect(process.env[CADENCE_KEY]).toBe(raw);
        });
        expect(process.env[CADENCE_KEY]).toBe("round5-prior");
      }
    } finally {
      if (originalHadOwn) process.env[CADENCE_KEY] = original;
      else delete process.env[CADENCE_KEY];
    }
  });

  it("carries every raw cadence through all seven real CLI loader contexts", async () => {
    const originalCadenceHadOwn = Object.prototype.hasOwnProperty.call(process.env, CADENCE_KEY);
    const originalCadence = process.env[CADENCE_KEY];
    const originalProviderHadOwn = Object.prototype.hasOwnProperty.call(process.env, PROVIDER_KEY);
    const originalProvider = process.env[PROVIDER_KEY];
    const originalMigrationHadOwn = Object.prototype.hasOwnProperty.call(process.env, MIGRATION_KEY);
    const originalMigration = process.env[MIGRATION_KEY];
    const originalExitCode = process.exitCode;
    try {
      process.env[CADENCE_KEY] = "round5-prior";
      process.env[PROVIDER_KEY] = TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson;
      process.env[MIGRATION_KEY] = "postgresql://fix07:fix07@127.0.0.1:5432/fix07";
      const summary = {
        loaderCalls: 0,
        exactCaptures: 0,
        sentinels: 0,
        providerSentinels: 0,
        exactTerminalOutcomes: 0,
        fixtureRows: 0,
        cadenceRestorations: 0,
        deploymentConstructions: 0,
        deploymentEnds: 0,
      };

      for (const [, raw] of cadenceCases) {
        for (const caller of callers) {
          removeCallerMocks();
          vi.resetModules();
          vi.clearAllMocks();
          process.exitCode = undefined;
          const loader = { calls: 0, captured: [] as CapturedCadence[] };
          const invoked = { count: 0 };
          const pool = { constructions: 0, ends: 0 };
          const sentinel = new Error(`FIX07_${caller.id.toUpperCase().replaceAll("-", "_")}_SENTINEL`);

          vi.doMock("@debateai/register", async () => {
            const actual = await vi.importActual<typeof import("../../packages/register/src/index.js")>(
              "@debateai/register",
            );
            return {
              ...actual,
              loadDevelopmentCommandEnvironment(): Readonly<Record<string, string>> {
                loader.calls += 1;
                const environment = actual.loadDevelopmentCommandEnvironment();
                loader.captured.push(capturedCadence(environment));
                return environment;
              },
            };
          });
          if (caller.deployment) {
            vi.doMock("@debateai/db", async () => ({
              ...await vi.importActual<typeof import("../../packages/db/src/index.js")>(
                "@debateai/db",
              ),
              createPool() {
                pool.constructions += 1;
                return {
                  async end(): Promise<void> {
                    pool.ends += 1;
                  },
                };
              },
            }));
          }
          await installCallerMock(caller.id, sentinel, invoked);
          const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
          const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined);

          let importedError: unknown;
          await withObsFlushDeadlineAsync(raw, async () => {
            try {
              await importCaller(caller.id);
            } catch (error) {
              importedError = error;
            }
            summary.loaderCalls += loader.calls;
            const expectedCapture: CapturedCadence = raw === undefined
              ? { present: false }
              : { present: true, value: raw };
            if (JSON.stringify(loader.captured) === JSON.stringify([expectedCapture])) {
              summary.exactCaptures += 1;
            }
            summary.sentinels += invoked.count;
            if (caller.provider) summary.providerSentinels += invoked.count;
            if (
              process.env[PROVIDER_KEY] === TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson
              && process.env[MIGRATION_KEY]
                === "postgresql://fix07:fix07@127.0.0.1:5432/fix07"
            ) {
              summary.fixtureRows += 1;
            }
            if (caller.deployment) {
              summary.deploymentConstructions += pool.constructions;
              summary.deploymentEnds += pool.ends;
              if (
                importedError === sentinel
                && invoked.count === 1
                && pool.constructions === 1
                && pool.ends === 1
              ) {
                summary.exactTerminalOutcomes += 1;
              }
            } else if (
              importedError === undefined
              && invoked.count === 1
              && process.exitCode === 1
            ) {
              summary.exactTerminalOutcomes += 1;
            }
          });
          if (process.env[CADENCE_KEY] === "round5-prior") {
            summary.cadenceRestorations += 1;
          }
          consoleError.mockRestore();
          consoleLog.mockRestore();
        }
      }
      expect(summary).toEqual({
        loaderCalls: 77,
        exactCaptures: 77,
        sentinels: 77,
        providerSentinels: 33,
        exactTerminalOutcomes: 77,
        fixtureRows: 77,
        cadenceRestorations: 77,
        deploymentConstructions: 11,
        deploymentEnds: 11,
      });
    } finally {
      process.exitCode = originalExitCode;
      if (originalCadenceHadOwn) process.env[CADENCE_KEY] = originalCadence;
      else delete process.env[CADENCE_KEY];
      if (originalProviderHadOwn) process.env[PROVIDER_KEY] = originalProvider;
      else delete process.env[PROVIDER_KEY];
      if (originalMigrationHadOwn) process.env[MIGRATION_KEY] = originalMigration;
      else delete process.env[MIGRATION_KEY];
      removeCallerMocks();
      vi.resetModules();
    }
  }, 120_000);

  it("confines command cadence to one passive optional-string property", async () => {
    const source = await readFile(
      new URL("../../packages/register/src/runtime-environment.ts", import.meta.url),
      "utf8",
    );
    const start = source.indexOf("export function loadDevelopmentCommandEnvironment");
    const end = source.indexOf("export function loadReplaySelfTestEnvironment", start);
    const body = source.slice(start, end);

    expect(body.match(/OBS_FLUSH_DEADLINE_MS/gu)).toHaveLength(1);
    expect(body).toContain("    OBS_FLUSH_DEADLINE_MS: z.string().optional(),");
    expect(body).not.toMatch(/OBS_FLUSH_DEADLINE_MS[^\n]*(regex|refine|coerce|transform|default)/u);
  });
});

describe.sequential("FIX-07 C3 runtime control and heartbeat", () => {
  it("settles the initial OFF sample before installing the emitter or its sole timer", async () => {
    vi.useFakeTimers();
    const initialControl = deferred<boolean>();
    const transfer = deferred<void>();
    const startupFlush = deferred<FlushResult>();
    const { harness, runtime, capture } = await loadRuntimeHarness();
    harness.controlResponses.push(initialControl.promise);
    harness.transfer = transfer.promise;
    harness.flushSteps.push(() => startupFlush.promise);
    const interval = vi.spyOn(globalThis, "setInterval");
    const readiness = runtime.waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });
    let readinessSettled = false;
    void readiness.then(() => {
      readinessSettled = true;
    });
    const starting = runtime.startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });

    try {
      await settleMicrotasks();
      expect(harness.controlReads).toBe(1);
      expect(harness.installCalls).toBe(0);
      expect(readinessSettled).toBe(false);
      expect(interval).toHaveBeenCalledTimes(0);
      expect(harness.flushCalls).toBe(0);
      expect(harness.heartbeats).toEqual([]);

      initialControl.resolve(true);
      await expect(readiness).resolves.toBe("installed");
      expect(harness.installCalls).toBe(1);
      capture.emit({ code: "FIRST_AFTER_INSTALL" });
      capture.captureHandled(new Error("SECOND_AFTER_INSTALL"), { boundary: "test" });
      expect(harness.queue?.size).toBe(0);
      expect(harness.gaps?.pendingLossCount()).toBe(2);
      expect(harness.health?.snapshot().counts.DISABLED).toBe(2);
      expect(harness.heartbeats).toEqual([]);
      expect(interval).toHaveBeenCalledTimes(0);

      transfer.resolve();
      await settleMicrotasks();
      expect(interval).toHaveBeenCalledTimes(1);
      expect(harness.flushCalls).toBe(1);
      startupFlush.resolve(EMPTY_FLUSH_RESULT);
      await starting;
    } finally {
      initialControl.resolve(true);
      transfer.resolve();
      startupFlush.resolve(EMPTY_FLUSH_RESULT);
      await starting.catch(() => undefined);
      harness.flushSteps.length = 0;
      await runtime.stopCaptureRuntime({ deadlineMs: 20 });
    }
  });

  it("lets stop win a held initial sample without a late install or timer", async () => {
    vi.useFakeTimers();
    const initialControl = deferred<boolean>();
    const { harness, runtime } = await loadRuntimeHarness();
    harness.controlResponses.push(initialControl.promise);
    const interval = vi.spyOn(globalThis, "setInterval");
    const readiness = runtime.waitForCaptureEmitterInstalled({ deadlineMs: 1_000 });
    const starting = runtime.startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });
    await settleMicrotasks();

    const stopping = runtime.stopCaptureRuntime({ deadlineMs: 20 });
    await vi.advanceTimersByTimeAsync(20);
    await stopping;
    expect(await readiness).toBe("stopped");
    expect(harness.installCalls).toBe(0);
    expect(interval).toHaveBeenCalledTimes(0);

    initialControl.resolve(true);
    await starting;
    await settleMicrotasks();
    expect(harness.installCalls).toBe(0);
    expect(interval).toHaveBeenCalledTimes(0);
    expect(harness.heartbeats).toEqual([]);
  });

  it("fails closed when the initial descriptor probe rejects", async () => {
    vi.useFakeTimers();
    const { harness, runtime, capture } = await loadRuntimeHarness();
    harness.controlFailures = 1;
    await runtime.startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });
    try {
      capture.emit({ code: "AFTER_FAILED_SAMPLE" });
      expect(harness.queue?.size).toBe(0);
      expect(harness.gaps?.pendingLossCount()).toBe(1);
      expect(harness.health?.snapshot().counts.DISABLED).toBe(1);
    } finally {
      await runtime.stopCaptureRuntime({ deadlineMs: 20 });
    }
  });

  it("samples OFF independently while startup and armed sinks remain unresolved", async () => {
    vi.useFakeTimers();
    const startupFlush = deferred<FlushResult>();
    const { harness, runtime, capture } = await loadRuntimeHarness();
    harness.flushSteps.push(() => startupFlush.promise);
    const interval = vi.spyOn(globalThis, "setInterval");
    const starting = runtime.startCaptureRuntime({
      runtime: "scheduler",
      spoolFd: undefined,
      installExitSink() {},
    });
    await settleMicrotasks();
    expect(interval).toHaveBeenCalledTimes(1);
    expect(harness.flushCalls).toBe(1);

    capture.emit({ queued: "startup" });
    expect(harness.queue?.size).toBe(1);
    const heldControl = deferred<boolean>();
    harness.controlResponses.push(heldControl.promise);
    await vi.advanceTimersByTimeAsync(75);
    expect(harness.controlReads).toBe(2);
    expect(harness.maximumControlActive).toBe(1);

    heldControl.resolve(true);
    await settleMicrotasks();
    expect(harness.queue?.size).toBe(0);
    capture.emit({ direct: "startup-off" });
    capture.captureHandled(new Error("startup-off"), {});
    expect(harness.gaps?.pendingLossCount()).toBe(3);

    startupFlush.resolve(EMPTY_FLUSH_RESULT);
    await starting;
    harness.controlResponses.push(Promise.resolve(false));
    const armedFlush = deferred<FlushResult>();
    harness.flushSteps.push(() => armedFlush.promise);
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.flushCalls).toBe(2);
    capture.emit({ queued: "armed" });
    expect(harness.queue?.size).toBe(1);

    harness.controlValue = true;
    await vi.advanceTimersByTimeAsync(50);
    await settleMicrotasks();
    expect(harness.queue?.size).toBe(0);
    capture.emit({ direct: "armed-off" });
    expect(harness.gaps?.pendingLossCount()).toBe(2);
    expect(harness.maximumControlActive).toBe(1);
    expect(interval).toHaveBeenCalledTimes(1);

    harness.controlValue = false;
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    armedFlush.resolve(EMPTY_FLUSH_RESULT);
    await settleMicrotasks();
    capture.emit({ queued: "re-enabled" });
    expect(harness.queue?.size).toBe(1);
    harness.flushSteps.length = 0;
    await runtime.stopCaptureRuntime({ deadlineMs: 20 });
  });

  it("publishes current DRAINING, SPOOL_ONLY, OFF and ARMED state once per armed cycle", async () => {
    vi.useFakeTimers();
    const heldDrain = deferred<void>();
    const { harness, runtime } = await loadRuntimeHarness();
    harness.drain = heldDrain.promise;
    await runtime.startCaptureRuntime({
      runtime: "runner",
      spoolFd: undefined,
      installExitSink() {},
    });
    expect(harness.heartbeats).toEqual([]);

    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.heartbeats.at(-1)).toEqual({
      component: "capture:runner",
      state: "DRAINING",
      detailCode: "FLUSH_OK",
    });

    heldDrain.resolve();
    await settleMicrotasks();
    harness.flushSteps.push(async () => ({
      dequeued: 1,
      persisted: 0,
      spooled: 1,
      lost: 0,
    }));
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.heartbeats.at(-1)?.state).toBe("SPOOL_ONLY");

    harness.controlResponses.push(Promise.resolve(true));
    const flushCallsBeforeOff = harness.flushCalls;
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.flushCalls).toBe(flushCallsBeforeOff);
    expect(harness.heartbeats.at(-1)?.state).toBe("OFF");

    harness.controlResponses.push(Promise.resolve(false));
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.heartbeats.at(-1)?.state).toBe("ARMED");

    harness.heartbeatFailures = 1;
    harness.flushSteps.push(async () => {
      harness.health?.record(CAPTURE_HEALTH_CODES.FLUSH_OK);
      return EMPTY_FLUSH_RESULT;
    });
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    const successfulBeforeRecovery = harness.heartbeats.length;
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.heartbeats).toHaveLength(successfulBeforeRecovery + 1);
    expect(harness.heartbeats.at(-1)?.detailCode).toBe("POSTGRES_FAILURE");

    harness.flushSteps.push(async () => {
      harness.health?.record(CAPTURE_HEALTH_CODES.FLUSH_OK);
      return EMPTY_FLUSH_RESULT;
    });
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.heartbeats.at(-1)?.detailCode).toBe("FLUSH_OK");

    const beforeStop = harness.heartbeats.length;
    await runtime.stopCaptureRuntime({ deadlineMs: 20 });
    expect(harness.heartbeats).toHaveLength(beforeStop);
  });

  it("converts PostgreSQL and repeated gap-write failures into exact recoverable rows", async () => {
    vi.useFakeTimers();
    const { harness, runtime } = await loadRuntimeHarness();
    await runtime.startCaptureRuntime({
      runtime: "runner",
      spoolFd: undefined,
      installExitSink() {},
    });
    harness.flushSteps.push(async () => {
      harness.health?.record(CAPTURE_HEALTH_CODES.POSTGRES_FAILURE);
      return { dequeued: 1, persisted: 0, spooled: 1, lost: 0 };
    });
    await vi.advanceTimersByTimeAsync(25);
    await vi.advanceTimersByTimeAsync(25);
    await settleMicrotasks();
    expect(harness.gapRows.map((row) => ({
      source: row.source,
      gap_class: row.gap_class,
      lost_count: row.lost_count,
    }))).toContainEqual({
      source: "unclassified",
      gap_class: "POSTGRES_FAILURE",
      lost_count: 1,
    });

    harness.gaps?.recordLoss("first_party", CAPTURE_GAP_CLASSES.QUEUE_FULL, 3);
    harness.gapFailures.push("QUEUE_FULL", "GAP_WRITE_FAILURE");
    for (let cycle = 0; cycle < 4; cycle += 1) {
      await vi.advanceTimersByTimeAsync(25);
      await settleMicrotasks();
    }
    expect(harness.gapRows.map((row) => ({
      source: row.source,
      gap_class: row.gap_class,
      lost_count: row.lost_count,
    }))).toEqual(expect.arrayContaining([
      {
        source: "first_party",
        gap_class: "QUEUE_FULL",
        lost_count: 3,
      },
      {
        source: "unclassified",
        gap_class: "GAP_WRITE_FAILURE",
        lost_count: 2,
      },
    ]));
    await runtime.stopCaptureRuntime({ deadlineMs: 20 });
  });
});
