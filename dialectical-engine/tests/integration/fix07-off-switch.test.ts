import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";

import { afterEach, describe, expect, it, vi } from "vitest";

import { readObsBounds } from "../../packages/obs-capture/src/runtime/config.js";
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

afterEach(async () => {
  vi.restoreAllMocks();
  removeCallerMocks();
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
