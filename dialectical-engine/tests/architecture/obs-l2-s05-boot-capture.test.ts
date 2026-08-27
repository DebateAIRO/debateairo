import { spawnSync } from "node:child_process";
import {
  constants as fsConstants,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const ERROR_TOKEN = "S05_FATAL_IMPORT_FIXTURE";
const THROWING_MODULE = `data:text/javascript,throw new Error(${JSON.stringify(ERROR_TOKEN)})`;
const RUNTIMES = ["api", "runner", "scheduler"] as const;
const FIXED_BOOT_ID = "00000000-0000-4000-8000-000000000505";
const PROBE_TIMEOUT_MS = 5_000;
const DYNAMIC_FAILURE_SETTLE_MS = 75;
const FD_REUSE_PROBE_MAX_OPENS = 64;
const BOOT_STALL_SEPARATOR_COUNT = 60_000;
const BOOT_STALL_MAX_MS = 2_000;
const BOOT_STALL_PROBE_TIMEOUT_MS = 10_000;
const EXPECTED_SPOOL_ENVELOPE_MAX_BYTES_SEED = 16_384;

type Runtime = typeof RUNTIMES[number];
type ImportMode = "dynamic" | "static";

const scratchDirectories: string[] = [];

function makeScratchDirectory(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "obs-l2-s05-fatal-")));
  scratchDirectories.push(directory);
  return directory;
}

function fixtureEnvironment(runtime: Runtime, spoolDirectory?: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_NO_WARNINGS: "1",
    OBS_ENVIRONMENT: "test",
    OBS_BUILD_REF: "UNTRACKED-DEV:s05-fixture",
    OBS_BUILD_DIRTY: "true",
    OBS_REDACTION_POLICY_VERSION: "g0",
    OBS_ALLOWLIST_SET_ID: "g0-empty-parameters",
    OBS_ENVELOPE_MAX_BYTES: "16384",
    OBS_WRITER_IDENTITY: `${runtime}-boot-fixture`,
  };
  if (spoolDirectory !== undefined) environment.OBS_SPOOL_DIR = spoolDirectory;
  else delete environment.OBS_SPOOL_DIR;
  return environment;
}

function unsetFixtureEnvironment(spoolDirectory: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env, NODE_NO_WARNINGS: "1" };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("OBS_")) delete environment[key];
  }
  environment.OBS_SPOOL_DIR = spoolDirectory;
  return environment;
}

function bootFailureProbe(options: {
  readonly runtime: Runtime;
  readonly mode: ImportMode;
  readonly withInstaller: boolean;
  readonly spoolDirectory?: string;
}): ReturnType<typeof spawnSync> {
  const installer = `@debateai/obs-capture/install/${options.runtime}`;
  const program = options.mode === "static"
    ? `${options.withInstaller ? `import ${JSON.stringify(installer)};` : ""}
import ${JSON.stringify(THROWING_MODULE)};`
    : `${options.withInstaller ? `await import(${JSON.stringify(installer)});` : ""}
void import(${JSON.stringify(THROWING_MODULE)});
    await new Promise((resolve) => setTimeout(resolve, ${DYNAMIC_FAILURE_SETTLE_MS}));`;

  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", program],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment(options.runtime, options.spoolDirectory),
    },
  );
}

function listenerProbe(runtime: Runtime): ReturnType<typeof spawnSync> {
  const program = `
const exitBefore = process.listenerCount("exit");
await import("@debateai/obs-capture/install/${runtime}");
console.log(JSON.stringify({
  unhandled: process.listenerCount("unhandledRejection"),
  monitor: process.listenerCount("uncaughtExceptionMonitor"),
  exitDelta: process.listenerCount("exit") - exitBefore,
}));`;
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", program],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment(runtime),
    },
  );
}

function asLoaderUrl(source: string): string {
  return `data:text/javascript,${encodeURIComponent(source)}`;
}

function fixedBootIdLoader(runtime: Runtime): string {
  const cryptoModuleUrl = asLoaderUrl(
    `export function randomUUID() { return ${JSON.stringify(FIXED_BOOT_ID)}; }`,
  );
  return asLoaderUrl(`
export function resolve(specifier, context, nextResolve) {
  if (specifier === "node:crypto" && context.parentURL?.includes("/packages/obs-capture/install/${runtime}.ts")) {
    return { url: ${JSON.stringify(cryptoModuleUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`);
}

function openFlagsProbe(runtime: Runtime, spoolDirectory: string): {
  readonly flags: number;
  readonly mode: number;
  readonly result: ReturnType<typeof spawnSync>;
} {
  const marker = join(spoolDirectory, "open-flags.json");
  const fsModuleUrl = asLoaderUrl(`
import * as fs from "node:fs";
export const constants = fs.constants;
export const closeSync = fs.closeSync;
export const fstatSync = fs.fstatSync;
export const lstatSync = fs.lstatSync;
export const realpathSync = fs.realpathSync;
export const writeSync = fs.writeSync;
export function openSync(path, flags, mode) {
  fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ flags, mode }));
  return fs.openSync(path, flags, mode);
}`);
  const loaderUrl = asLoaderUrl(`
export function resolve(specifier, context, nextResolve) {
  if (specifier === "node:fs" && context.parentURL?.includes("/packages/obs-capture/install/${runtime}.ts")) {
    return { url: ${JSON.stringify(fsModuleUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--experimental-loader",
      loaderUrl,
      "--input-type=module",
      "--eval",
      `await import("@debateai/obs-capture/install/${runtime}"); process.exit(0);`,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment(runtime, spoolDirectory),
      timeout: PROBE_TIMEOUT_MS,
    },
  );
  const observed = JSON.parse(readFileSync(marker, "utf8")) as { flags: number; mode: number };
  return { ...observed, result };
}

function partialWriteProbe(spoolDirectory: string): {
  readonly calls: number;
  readonly raw: string;
  readonly result: ReturnType<typeof spawnSync>;
} {
  const callMarker = join(spoolDirectory, "partial-write-calls");
  const fsModuleUrl = asLoaderUrl(`
import * as fs from "node:fs";
export const constants = fs.constants;
export const closeSync = fs.closeSync;
export const fstatSync = fs.fstatSync;
export const lstatSync = fs.lstatSync;
export const openSync = fs.openSync;
export const realpathSync = fs.realpathSync;
export function writeSync(fd, buffer, offset, length) {
  const partialLength = Math.max(1, Math.ceil(length / 2));
  fs.appendFileSync(${JSON.stringify(callMarker)}, "call\\n");
  return fs.writeSync(fd, buffer, offset, partialLength);
}`);
  const loaderUrl = asLoaderUrl(`
export function resolve(specifier, context, nextResolve) {
  if (specifier === "node:fs" && context.parentURL?.includes("/packages/obs-capture/install/runner.ts")) {
    return { url: ${JSON.stringify(fsModuleUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--experimental-loader",
      loaderUrl,
      "--input-type=module",
      "--eval",
      `import "@debateai/obs-capture/install/runner"; import ${JSON.stringify(THROWING_MODULE)};`,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment("runner", spoolDirectory),
      timeout: PROBE_TIMEOUT_MS,
    },
  );
  const spoolFile = readdirSync(spoolDirectory).find((name) => name.endsWith(".spool"));
  const raw = spoolFile === undefined ? "" : readFileSync(join(spoolDirectory, spoolFile), "utf8");
  const calls = readFileSync(callMarker, "utf8").trimEnd().split("\n").length;
  return { calls, raw, result };
}

type WriteOutcome = "fail" | "half" | "success" | "zero";

function writeOutcomeProbe(spoolDirectory: string, outcomes: readonly WriteOutcome[]): {
  readonly calls: number;
  readonly distinctBuffers: number;
  readonly distinctContents: number;
  readonly raw: string;
  readonly result: ReturnType<typeof spawnSync>;
} {
  const callMarker = join(spoolDirectory, "write-outcome-calls");
  const fsModuleUrl = asLoaderUrl(`
import { createHash } from "node:crypto";
import * as fs from "node:fs";
export const constants = fs.constants;
export const closeSync = fs.closeSync;
export const fstatSync = fs.fstatSync;
export const lstatSync = fs.lstatSync;
export const openSync = fs.openSync;
export const realpathSync = fs.realpathSync;
const outcomes = ${JSON.stringify(outcomes)};
const buffers = new Set();
const contents = new Set();
let callIndex = 0;
export function writeSync(fd, buffer, offset, length) {
  const outcome = outcomes[Math.min(callIndex, outcomes.length - 1)] ?? "success";
  callIndex += 1;
  buffers.add(buffer);
  contents.add(createHash("sha256").update(buffer).digest("hex"));
  fs.appendFileSync(
    ${JSON.stringify(callMarker)},
    JSON.stringify({
      outcome,
      distinctBuffers: buffers.size,
      distinctContents: contents.size,
    }) + "\\n",
  );
  if (outcome === "fail") {
    const error = new Error("WRITE_OUTCOME_FAILURE");
    error.code = "EIO";
    throw error;
  }
  if (outcome === "zero") return 0;
  const writeLength = outcome === "half" ? Math.max(1, Math.floor(length / 2)) : length;
  return fs.writeSync(fd, buffer, offset, writeLength);
}`);
  const loaderUrl = asLoaderUrl(`
export function resolve(specifier, context, nextResolve) {
  if (specifier === "node:fs" && context.parentURL?.includes("/packages/obs-capture/install/runner.ts")) {
    return { url: ${JSON.stringify(fsModuleUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--experimental-loader",
      loaderUrl,
      "--input-type=module",
      "--eval",
      `import "@debateai/obs-capture/install/runner"; import ${JSON.stringify(THROWING_MODULE)};`,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment("runner", spoolDirectory),
      timeout: PROBE_TIMEOUT_MS,
    },
  );
  const spoolFile = readdirSync(spoolDirectory).find((name) => name.endsWith(".spool"));
  const raw = spoolFile === undefined ? "" : readFileSync(join(spoolDirectory, spoolFile), "utf8");
  const callRows = readFileSync(callMarker, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as {
      readonly distinctBuffers: number;
      readonly distinctContents: number;
    });
  return {
    calls: callRows.length,
    distinctBuffers: callRows.at(-1)?.distinctBuffers ?? 0,
    distinctContents: callRows.at(-1)?.distinctContents ?? 0,
    raw,
    result,
  };
}

function spoolDirectoryTraceProbe(spoolDirectory: string): {
  readonly result: ReturnType<typeof spawnSync>;
  readonly trace: readonly Record<string, unknown>[];
} {
  const scratchDirectory = makeScratchDirectory();
  const marker = join(scratchDirectory, "spool-directory-trace");
  const fsModuleUrl = asLoaderUrl(`
import * as fs from "node:fs";
const mark = (row) => fs.appendFileSync(${JSON.stringify(marker)}, JSON.stringify(row) + "\\n");
export const constants = fs.constants;
export const closeSync = fs.closeSync;
export const fstatSync = fs.fstatSync;
export const writeSync = fs.writeSync;
export function lstatSync(path) {
  const result = fs.lstatSync(path);
  mark({ call: "lstatSync", path, isSymlink: result.isSymbolicLink() });
  return result;
}
export function realpathSync(path) {
  const result = fs.realpathSync(path);
  mark({ call: "realpathSync", path, result });
  return result;
}
export function openSync(path, flags, mode) {
  mark({ call: "openSync", path, flags, mode });
  throw new Error("ROOT_OPEN_BLOCKED_BY_TEST");
}`);
  const loaderUrl = asLoaderUrl(`
export function resolve(specifier, context, nextResolve) {
  if (specifier === "node:fs" && context.parentURL?.includes("/packages/obs-capture/install/runner.ts")) {
    return { url: ${JSON.stringify(fsModuleUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--experimental-loader",
      loaderUrl,
      "--input-type=module",
      "--eval",
      `await import("@debateai/obs-capture/install/runner");`,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment("runner", spoolDirectory),
      timeout: PROBE_TIMEOUT_MS,
    },
  );
  const trace = existsSync(marker)
    ? readFileSync(marker, "utf8").trimEnd().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>)
    : [];
  return { result, trace };
}

function finalComponentSwapProbe(
  spoolDirectory: string,
  attackerDirectory: string,
  resolutionMarker: string,
): ReturnType<typeof spawnSync> {
  const fsModuleUrl = asLoaderUrl(`
import * as fs from "node:fs";
const mark = (call) => fs.appendFileSync(${JSON.stringify(resolutionMarker)}, call + "\\n");
export const constants = fs.constants;
export const closeSync = fs.closeSync;
export const fstatSync = fs.fstatSync;
export const openSync = fs.openSync;
export const writeSync = fs.writeSync;
export function lstatSync(path) {
  mark("lstatSync");
  const original = fs.lstatSync(path);
  if (path === ${JSON.stringify(spoolDirectory)}) {
    fs.rmdirSync(path);
    fs.symlinkSync(${JSON.stringify(attackerDirectory)}, path, "dir");
  }
  return original;
}
export function realpathSync(path) {
  mark("realpathSync");
  return fs.realpathSync(path);
}`);
  const loaderUrl = asLoaderUrl(`
export function resolve(specifier, context, nextResolve) {
  if (specifier === "node:fs" && context.parentURL?.includes("/packages/obs-capture/install/runner.ts")) {
    return { url: ${JSON.stringify(fsModuleUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`);
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--experimental-loader",
      loaderUrl,
      "--input-type=module",
      "--eval",
      `import "@debateai/obs-capture/install/runner"; import ${JSON.stringify(THROWING_MODULE)};`,
    ],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment("runner", spoolDirectory),
      timeout: PROBE_TIMEOUT_MS,
    },
  );
}

function bootStallProbe(runtime: Runtime): {
  readonly appReachedAfterMs: number;
  readonly result: ReturnType<typeof spawnSync>;
  readonly spoolFiles: readonly string[];
} {
  const spoolDirectory = makeScratchDirectory();
  const rejectedPath = spoolDirectory + "/" + "/".repeat(BOOT_STALL_SEPARATOR_COUNT) + "missing";
  const program = `
const started = performance.now();
await import("@debateai/obs-capture/install/${runtime}");
process.stdout.write(String(performance.now() - started));`;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", program],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment(runtime, rejectedPath),
      timeout: BOOT_STALL_PROBE_TIMEOUT_MS,
    },
  );
  return {
    appReachedAfterMs: Number(result.stdout),
    result,
    spoolFiles: readdirSync(spoolDirectory).filter((name) => name.endsWith(".spool")),
  };
}

function defaultEnvelopeSeedProbe(spoolDirectory: string, buildRef: string): {
  readonly raw: string;
  readonly result: ReturnType<typeof spawnSync>;
} {
  const environment = unsetFixtureEnvironment(spoolDirectory);
  environment.OBS_BUILD_REF = buildRef;
  delete environment.OBS_ENVELOPE_MAX_BYTES;
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `import "@debateai/obs-capture/install/runner"; import ${JSON.stringify(THROWING_MODULE)};`,
    ],
    { cwd: ROOT, encoding: "utf8", env: environment, timeout: PROBE_TIMEOUT_MS },
  );
  const spoolFile = readdirSync(spoolDirectory).find((name) => name.endsWith(".spool"));
  return {
    raw: spoolFile === undefined ? "" : readFileSync(join(spoolDirectory, spoolFile), "utf8"),
    result,
  };
}

function tierOneSwapProbe(runtime: Runtime, spoolDirectory: string): ReturnType<typeof spawnSync> {
  const runtimeModuleUrl = asLoaderUrl(`
import { writeSync } from "node:fs";
export function startCaptureRuntime({ runtime, spoolFd, installExitSink }) {
  if (runtime !== ${JSON.stringify(runtime)}) throw new Error("RUNTIME_ARGUMENT_MISMATCH");
  if (!Number.isInteger(spoolFd)) throw new Error("SPOOL_FD_ARGUMENT_MISSING");
  if (typeof installExitSink !== "function") throw new Error("INSTALL_EXIT_SINK_ARGUMENT_MISSING");
  installExitSink(() => { writeSync(spoolFd, "TIER1_EXIT_SINK\\n"); });
  globalThis.__s05TierOneArmed();
}`);
  const loaderUrl = asLoaderUrl(`
export function resolve(specifier, context, nextResolve) {
  if (specifier === "@debateai/obs-capture/runtime" && context.parentURL?.includes("/packages/obs-capture/install/${runtime}.ts")) {
    return { url: ${JSON.stringify(runtimeModuleUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`);
  const program = `
const keepAlive = setInterval(() => undefined, ${PROBE_TIMEOUT_MS});
const armed = new Promise((resolve) => { globalThis.__s05TierOneArmed = resolve; });
await import("@debateai/obs-capture/install/${runtime}");
await armed;
clearInterval(keepAlive);
throw new Error(${JSON.stringify(ERROR_TOKEN)});`;
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--experimental-loader", loaderUrl, "--input-type=module", "--eval", program],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment(runtime, spoolDirectory),
      timeout: PROBE_TIMEOUT_MS,
    },
  );
}

function seamFailureProbe(
  runtime: Runtime,
  spoolDirectory: string,
  seamBody: string,
): ReturnType<typeof spawnSync> {
  const runtimeModuleUrl = asLoaderUrl(`
export function startCaptureRuntime({ runtime, spoolFd, installExitSink }) {
  if (runtime !== ${JSON.stringify(runtime)}) throw new Error("RUNTIME_ARGUMENT_MISMATCH");
  if (!Number.isInteger(spoolFd)) throw new Error("SPOOL_FD_ARGUMENT_MISSING");
  if (typeof installExitSink !== "function") throw new Error("INSTALL_EXIT_SINK_ARGUMENT_MISSING");
  ${seamBody}
}`);
  const loaderUrl = asLoaderUrl(`
export function resolve(specifier, context, nextResolve) {
  if (specifier === "@debateai/obs-capture/runtime" && context.parentURL?.includes("/packages/obs-capture/install/${runtime}.ts")) {
    return { url: ${JSON.stringify(runtimeModuleUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`);
  const program = `
const keepAlive = setInterval(() => undefined, ${PROBE_TIMEOUT_MS});
const armed = new Promise((resolve) => { globalThis.__s05TierOneArmed = resolve; });
await import("@debateai/obs-capture/install/${runtime}");
await armed;
clearInterval(keepAlive);
throw new Error(${JSON.stringify(ERROR_TOKEN)});`;
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--experimental-loader", loaderUrl, "--input-type=module", "--eval", program],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment(runtime, spoolDirectory),
      timeout: PROBE_TIMEOUT_MS,
    },
  );
}

function fdReuseProbe(spoolDirectory: string, unrelatedDirectory: string): ReturnType<typeof spawnSync> {
  const runtimeModuleUrl = asLoaderUrl(`
import { closeSync, openSync } from "node:fs";
export function startCaptureRuntime({ spoolFd }) {
  closeSync(spoolFd);
  let reopened = -1;
  let index = 0;
  while (reopened < spoolFd && index < ${FD_REUSE_PROBE_MAX_OPENS}) {
    reopened = openSync(${JSON.stringify(unrelatedDirectory)} + "/file-" + index + ".txt", "w");
    index += 1;
  }
  if (reopened !== spoolFd) throw new Error("FD_REUSE_FIXTURE_FAILED");
  globalThis.__s05TierOneArmed();
}`);
  const loaderUrl = asLoaderUrl(`
export function resolve(specifier, context, nextResolve) {
  if (specifier === "@debateai/obs-capture/runtime" && context.parentURL?.includes("/packages/obs-capture/install/runner.ts")) {
    return { url: ${JSON.stringify(runtimeModuleUrl)}, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}`);
  const program = `
const keepAlive = setInterval(() => undefined, ${PROBE_TIMEOUT_MS});
const armed = new Promise((resolve) => { globalThis.__s05TierOneArmed = resolve; });
await import("@debateai/obs-capture/install/runner");
await armed;
clearInterval(keepAlive);
throw new Error(${JSON.stringify(ERROR_TOKEN)});`;
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "--experimental-loader", loaderUrl, "--input-type=module", "--eval", program],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: fixtureEnvironment("runner", spoolDirectory),
      timeout: PROBE_TIMEOUT_MS,
    },
  );
}

function redactorConfig(runtime: Runtime) {
  return {
    environment: "test",
    build_ref: "UNTRACKED-DEV:s05-fixture",
    build_dirty: true,
    runtime,
    component: { process: runtime, package: `@debateai/${runtime}` },
    writer_identity: `${runtime}-boot-fixture`,
    redaction_policy_version: "g0",
    allowlist_set_id: "g0-empty-parameters",
    now: () => new Date("2026-08-26T00:00:00.000Z"),
    sourceEventRef: () => "00000000-0000-4000-8000-000000000005",
  } as const;
}

afterEach(() => {
  while (scratchDirectories.length > 0) {
    rmSync(scratchDirectories.pop()!, { recursive: true, force: true });
  }
});

describe("S05 fatal-boundary installers", () => {
  it.each(RUNTIMES)(
    "%s installs the monitor and exit listeners without a rejection listener",
    (runtime) => {
      const result = listenerProbe(runtime);
      expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
      expect(JSON.parse(result.stdout.toString())).toEqual({ exitDelta: 1, monitor: 1, unhandled: 0 });
    },
  );

  it.each(RUNTIMES)("%s opens one exclusive no-follow mode-0600 append spool", (runtime) => {
    const spoolDirectory = makeScratchDirectory();
    const { flags, mode, result } = openFlagsProbe(runtime, spoolDirectory);
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
    expect(flags).toBe(
      fsConstants.O_APPEND
        | fsConstants.O_CREAT
        | fsConstants.O_EXCL
        | fsConstants.O_NOFOLLOW
        | fsConstants.O_WRONLY,
    );
    expect(mode).toBe(0o600);
  });

  it.each(RUNTIMES)("%s writes nothing on clean exit but writes once on nonzero exit", (runtime) => {
    const cleanDirectory = makeScratchDirectory();
    const clean = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", `await import("@debateai/obs-capture/install/${runtime}");`],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: fixtureEnvironment(runtime, cleanDirectory),
      },
    );
    expect(clean.status, `stdout=${clean.stdout}\nstderr=${clean.stderr}`).toBe(0);
    const cleanSpool = readdirSync(cleanDirectory).find((name) => name.endsWith(".spool"));
    expect(cleanSpool).toBeDefined();
    expect(readFileSync(join(cleanDirectory, cleanSpool!), "utf8")).toBe("");

    const nonzeroDirectory = makeScratchDirectory();
    const nonzero = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `await import("@debateai/obs-capture/install/${runtime}"); process.exit(7);`,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: fixtureEnvironment(runtime, nonzeroDirectory),
      },
    );
    expect(nonzero.status).toBe(7);
    const nonzeroSpool = readdirSync(nonzeroDirectory).find((name) => name.endsWith(".spool"));
    expect(nonzeroSpool).toBeDefined();
    const raw = readFileSync(join(nonzeroDirectory, nonzeroSpool!), "utf8");
    expect(raw.trimEnd().split("\n")).toHaveLength(1);
    expect(JSON.parse(raw)).toMatchObject({ code: "OBS_CAPTURE_SELF", runtime });
  });

  it.each(RUNTIMES)(
    "%s preserves uninstrumented static and dynamic failure semantics byte-for-byte",
    (runtime) => {
      for (const mode of ["static", "dynamic"] as const) {
        const control = bootFailureProbe({ mode, runtime, withInstaller: false });
        const installed = bootFailureProbe({ mode, runtime, withInstaller: true });

        expect(control.status).not.toBe(0);
        expect(control.stderr).toContain(ERROR_TOKEN);
        expect(
          installed.status,
          `${runtime}/${mode}\ncontrol=${control.stderr}\ninstalled=${installed.stderr}`,
        ).toBe(control.status);
        expect(Buffer.compare(Buffer.from(installed.stderr), Buffer.from(control.stderr))).toBe(0);
      }
    },
  );

  it.each(RUNTIMES)(
    "%s synchronously writes one minimized fatal record matching the real redactor",
    async (runtime) => {
      const spoolDirectory = makeScratchDirectory();
      const result = bootFailureProbe({
        mode: "static",
        runtime,
        spoolDirectory,
        withInstaller: true,
      });

      expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
      const spoolFiles = readdirSync(spoolDirectory);
      expect(spoolFiles).toHaveLength(1);
      expect(spoolFiles[0]).toMatch(
        new RegExp(`^${runtime}-${result.pid}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.spool$`, "u"),
      );
      const raw = readFileSync(join(spoolDirectory, spoolFiles[0]!), "utf8");
      expect(raw.endsWith("\n")).toBe(true);
      const lines = raw.trimEnd().split("\n");
      expect(lines).toHaveLength(1);
      expect(raw).not.toContain(ERROR_TOKEN);
      expect(raw).not.toContain("    at ");

      const envelope = JSON.parse(lines[0]!) as Record<string, unknown>;
      expect(envelope).toMatchObject({
        code: "OBS_CAPTURE_SELF",
        taxonomy_class: "CAPTURE_SELF",
        capture_point: "self",
        disposition: "SELF",
        fallback_minimized: true,
      });

      const { createSharedRedactor } = await import("@debateai/obs-capture");
      const expected = JSON.parse(JSON.stringify(createSharedRedactor(redactorConfig(runtime)).redact({
        kind: "handled_error",
        payload_ref: {},
        ambient_context_ref: undefined,
        handled_context_ref: {},
      }))) as Record<string, unknown>;
      delete envelope.occurred_at;
      delete envelope.source_event_ref;
      delete expected.occurred_at;
      delete expected.source_event_ref;
      expect(envelope).toEqual(expected);
    },
  );

  it.each(RUNTIMES)("%s gives Tier 1 the fd and swaps to exactly one installed exit sink", (runtime) => {
    const spoolDirectory = makeScratchDirectory();
    const result = tierOneSwapProbe(runtime, spoolDirectory);
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
    expect(result.stderr).toContain(ERROR_TOKEN);
    const spoolFiles = readdirSync(spoolDirectory).filter((name) => name.endsWith(".spool"));
    expect(spoolFiles).toHaveLength(1);
    expect(readFileSync(join(spoolDirectory, spoolFiles[0]!), "utf8")).toBe("TIER1_EXIT_SINK\n");
  });

  it.each(RUNTIMES)("%s aligns every unset Tier-0 fallback with the declared runtime seeds", (runtime) => {
    const spoolDirectory = makeScratchDirectory();
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `import "@debateai/obs-capture/install/${runtime}"; import ${JSON.stringify(THROWING_MODULE)};`,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: unsetFixtureEnvironment(spoolDirectory),
        timeout: PROBE_TIMEOUT_MS,
      },
    );
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
    const spoolFile = readdirSync(spoolDirectory).find((name) => name.endsWith(".spool"));
    expect(spoolFile).toBeDefined();
    expect(JSON.parse(readFileSync(join(spoolDirectory, spoolFile!), "utf8"))).toMatchObject({
      environment: "unknown",
      build_ref: "UNTRACKED-DEV:UNKNOWN",
      build_dirty: true,
      redaction_policy_version: "g0",
      allowlist_set_id: "g0-empty-parameters",
      writer_identity: runtime,
    });
  });

  it.each(RUNTIMES)("%s falls back to Tier 0 when a Tier-1 exit sink throws", (runtime) => {
    const spoolDirectory = makeScratchDirectory();
    const result = seamFailureProbe(
      runtime,
      spoolDirectory,
      `installExitSink(() => { throw new Error("TIER1_SINK_THROW"); });
      globalThis.__s05TierOneArmed();`,
    );
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
    const spoolFiles = readdirSync(spoolDirectory).filter((name) => name.endsWith(".spool"));
    expect(spoolFiles).toHaveLength(1);
    const raw = readFileSync(join(spoolDirectory, spoolFiles[0]!), "utf8");
    expect(raw.trimEnd().split("\n")).toHaveLength(1);
    expect(JSON.parse(raw)).toMatchObject({ code: "OBS_CAPTURE_SELF", runtime });
  });

  it("retains Tier 0 for invalid sinks and for an arming call that throws after installing", () => {
    for (const seamBody of [
      `installExitSink(null); globalThis.__s05TierOneArmed();`,
      `installExitSink(() => { throw new Error("TIER1_SINK_THROW"); });
       globalThis.__s05TierOneArmed();
       throw new Error("RUNTIME_ARM_FAILED");`,
    ]) {
      const spoolDirectory = makeScratchDirectory();
      const result = seamFailureProbe("runner", spoolDirectory, seamBody);
      expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
      const spoolFile = readdirSync(spoolDirectory).find((name) => name.endsWith(".spool"));
      expect(spoolFile).toBeDefined();
      const raw = readFileSync(join(spoolDirectory, spoolFile!), "utf8");
      expect(raw.trimEnd().split("\n")).toHaveLength(1);
      expect(JSON.parse(raw)).toMatchObject({ code: "OBS_CAPTURE_SELF", runtime: "runner" });
    }
  });

  it("refuses Tier-0 output after its handed-out fd is closed and recycled", () => {
    const root = makeScratchDirectory();
    const spoolDirectory = join(root, "spool");
    const unrelatedDirectory = join(root, "unrelated");
    mkdirSync(spoolDirectory);
    mkdirSync(unrelatedDirectory);
    const result = fdReuseProbe(spoolDirectory, unrelatedDirectory);
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
    expect(result.stderr).toContain(ERROR_TOKEN);
    const unrelatedContents = readdirSync(unrelatedDirectory)
      .map((name) => readFileSync(join(unrelatedDirectory, name), "utf8"));
    expect(unrelatedContents.length).toBeGreaterThan(0);
    expect(unrelatedContents.every((contents) => contents === "")).toBe(true);
  });

  it("loops until a sequence of legal short writes completes one parseable line", () => {
    const spoolDirectory = makeScratchDirectory();
    const { calls, raw, result } = partialWriteProbe(spoolDirectory);
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
    expect(calls).toBeGreaterThan(1);
    expect(raw.endsWith("\n")).toBe(true);
    expect(raw.trimEnd().split("\n")).toHaveLength(1);
    expect(JSON.parse(raw)).toMatchObject({ code: "OBS_CAPTURE_SELF", runtime: "runner" });
  });

  it.each([
    ["success", ["success"], 1, "record"],
    ["short write then success", ["half", "success"], 2, "record"],
    ["first-call failure then success", ["fail", "success"], 2, "record"],
    ["mid-record failure then success", ["half", "fail", "success"], 3, "record"],
    ["all calls fail", ["fail"], 2, "empty"],
    ["zero progress", ["zero"], 2, "empty"],
    ["half write then all later calls fail", ["half", "fail"], 3, "torn"],
    ["half write then all later calls make zero progress", ["half", "zero"], 3, "torn"],
    ["two half writes then all later calls fail", ["half", "half", "fail"], 4, "torn"],
  ] as const)(
    "never fuses retry bytes after %s",
    (_name, outcomes, expectedCalls, expectedResult) => {
      const spoolDirectory = makeScratchDirectory();
      const { calls, distinctBuffers, distinctContents, raw, result } = writeOutcomeProbe(
        spoolDirectory,
        outcomes,
      );
      expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
      expect(result.stderr).toContain(ERROR_TOKEN);
      expect(calls).toBe(expectedCalls);
      expect(distinctBuffers).toBe(1);
      expect(distinctContents).toBe(1);
      if (expectedResult === "empty") {
        expect(raw).toBe("");
      } else if (expectedResult === "record") {
        expect(raw.endsWith("\n")).toBe(true);
        const lines = raw.trimEnd().split("\n");
        expect(lines).toHaveLength(1);
        expect(JSON.parse(lines[0]!)).toMatchObject({ code: "OBS_CAPTURE_SELF", runtime: "runner" });
      } else {
        expect(raw).not.toBe("");
        expect(raw.endsWith("\n")).toBe(false);
        expect(raw.split("\n")).toHaveLength(1);
        expect(() => JSON.parse(raw)).toThrow();
      }
    },
  );

  it("caps the Tier-0 envelope before the first write", () => {
    const spoolDirectory = makeScratchDirectory();
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `import "@debateai/obs-capture/install/runner"; import ${JSON.stringify(THROWING_MODULE)};`,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...fixtureEnvironment("runner", spoolDirectory), OBS_ENVELOPE_MAX_BYTES: "1" },
      },
    );
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
    const spoolFile = readdirSync(spoolDirectory).find((name) => name.endsWith(".spool"));
    expect(spoolFile).toBeDefined();
    expect(readFileSync(join(spoolDirectory, spoolFile!), "utf8")).toBe("");
  });

  it("pins the exact default Tier-0 envelope seed at 16,384 bytes", () => {
    const baselineDirectory = makeScratchDirectory();
    const baseline = defaultEnvelopeSeedProbe(baselineDirectory, "x");
    expect(baseline.result.status, `stdout=${baseline.result.stdout}\nstderr=${baseline.result.stderr}`).toBe(1);
    expect(Buffer.byteLength(baseline.raw)).toBeGreaterThan(1);

    const fixedOverheadBytes = Buffer.byteLength(baseline.raw) - 1;
    const atCapBuildRefLength = EXPECTED_SPOOL_ENVELOPE_MAX_BYTES_SEED - fixedOverheadBytes;
    expect(atCapBuildRefLength).toBeGreaterThan(0);

    const atCapDirectory = makeScratchDirectory();
    const atCap = defaultEnvelopeSeedProbe(atCapDirectory, "x".repeat(atCapBuildRefLength));
    expect(atCap.result.status, `stdout=${atCap.result.stdout}\nstderr=${atCap.result.stderr}`).toBe(1);
    expect(Buffer.byteLength(atCap.raw)).toBe(EXPECTED_SPOOL_ENVELOPE_MAX_BYTES_SEED);
    expect(JSON.parse(atCap.raw)).toMatchObject({ code: "OBS_CAPTURE_SELF", runtime: "runner" });

    const overCapDirectory = makeScratchDirectory();
    const overCap = defaultEnvelopeSeedProbe(overCapDirectory, "x".repeat(atCapBuildRefLength + 1));
    expect(overCap.result.status, `stdout=${overCap.result.stdout}\nstderr=${overCap.result.stderr}`).toBe(1);
    expect(overCap.raw).toBe("");
  });

  it("refuses a predictable symlink target without writing outside the spool directory", () => {
    const root = makeScratchDirectory();
    const spoolDirectory = join(root, "spool");
    const outside = join(root, "outside-record");
    mkdirSync(spoolDirectory);
    writeFileSync(outside, "OUTSIDE_SENTINEL\n", { mode: 0o600 });
    const program = `
import { symlinkSync } from "node:fs";
import { join } from "node:path";
const target = join(${JSON.stringify(spoolDirectory)}, "runner-" + process.pid + "-${FIXED_BOOT_ID}.spool");
symlinkSync(${JSON.stringify(outside)}, target);
await import("@debateai/obs-capture/install/runner");
throw new Error(${JSON.stringify(ERROR_TOKEN)});`;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--experimental-loader", fixedBootIdLoader("runner"), "--input-type=module", "--eval", program],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: fixtureEnvironment("runner", spoolDirectory),
        timeout: PROBE_TIMEOUT_MS,
      },
    );
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
    expect(result.stderr).toContain(ERROR_TOKEN);
    const spoolTarget = join(spoolDirectory, `runner-${result.pid}-${FIXED_BOOT_ID}.spool`);
    expect(lstatSync(spoolTarget).isSymbolicLink()).toBe(true);
    expect(readFileSync(outside, "utf8")).toBe("OUTSIDE_SENTINEL\n");
  });

  it("refuses a pre-existing mode-0666 path instead of appending to it", () => {
    const spoolDirectory = makeScratchDirectory();
    const program = `
import { chmodSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const target = join(${JSON.stringify(spoolDirectory)}, "runner-" + process.pid + "-${FIXED_BOOT_ID}.spool");
writeFileSync(target, "PREEXISTING_SENTINEL\\n");
chmodSync(target, 0o666);
await import("@debateai/obs-capture/install/runner");
throw new Error(${JSON.stringify(ERROR_TOKEN)});`;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--experimental-loader", fixedBootIdLoader("runner"), "--input-type=module", "--eval", program],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: fixtureEnvironment("runner", spoolDirectory),
        timeout: PROBE_TIMEOUT_MS,
      },
    );
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
    const spoolTarget = join(spoolDirectory, `runner-${result.pid}-${FIXED_BOOT_ID}.spool`);
    expect(readFileSync(spoolTarget, "utf8")).toBe("PREEXISTING_SENTINEL\n");
    expect(statSync(spoolTarget).mode & 0o777).toBe(0o666);
  });

  it("accepts equivalent absolute spellings while rejecting relative, traversal, and symlinked directories", () => {
    const spellingDirectory = makeScratchDirectory();
    for (const [index, spelling] of [
      spellingDirectory,
      spellingDirectory + "/",
      spellingDirectory + "//",
      spellingDirectory + "/.",
    ].entries()) {
      const spellingResult = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          `import "@debateai/obs-capture/install/runner"; import ${JSON.stringify(THROWING_MODULE)};`,
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: fixtureEnvironment("runner", spelling),
          timeout: PROBE_TIMEOUT_MS,
        },
      );
      expect(spellingResult.status).toBe(1);
      expect(readdirSync(spellingDirectory).filter((name) => name.endsWith(".spool"))).toHaveLength(index + 1);
    }

    const interiorDotRoot = makeScratchDirectory();
    const interiorDotDirectory = join(interiorDotRoot, "nested");
    mkdirSync(interiorDotDirectory);
    const interiorDotResult = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `import "@debateai/obs-capture/install/runner"; import ${JSON.stringify(THROWING_MODULE)};`,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: fixtureEnvironment("runner", interiorDotRoot + "/./nested"),
        timeout: PROBE_TIMEOUT_MS,
      },
    );
    expect(interiorDotResult.status).toBe(1);
    expect(readdirSync(interiorDotDirectory).filter((name) => name.endsWith(".spool"))).toHaveLength(1);

    const dotDotDirectory = join(spellingDirectory, "sub");
    mkdirSync(dotDotDirectory);
    const dotDotResult = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `import "@debateai/obs-capture/install/runner"; import ${JSON.stringify(THROWING_MODULE)};`,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: fixtureEnvironment("runner", spellingDirectory + "/sub/.."),
        timeout: PROBE_TIMEOUT_MS,
      },
    );
    expect(dotDotResult.status).toBe(1);
    expect(readdirSync(spellingDirectory).filter((name) => name.endsWith(".spool"))).toHaveLength(4);

    const relativeDirectory = makeScratchDirectory();
    const relativeResult = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `process.chdir(${JSON.stringify(relativeDirectory)});
         await import("@debateai/obs-capture/install/runner");
         throw new Error(${JSON.stringify(ERROR_TOKEN)});`,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: fixtureEnvironment("runner", "."),
        timeout: PROBE_TIMEOUT_MS,
      },
    );
    expect(relativeResult.status).toBe(1);
    expect(readdirSync(relativeDirectory).some((name) => name.endsWith(".spool"))).toBe(false);

    const traversalRoot = makeScratchDirectory();
    const traversalBase = join(traversalRoot, "intended", "a", "b");
    const escapedDirectory = join(traversalRoot, "escaped");
    mkdirSync(traversalBase, { recursive: true });
    mkdirSync(escapedDirectory);
    const traversalResult = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `import "@debateai/obs-capture/install/runner"; import ${JSON.stringify(THROWING_MODULE)};`,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: fixtureEnvironment("runner", traversalBase + "/../../../escaped"),
        timeout: PROBE_TIMEOUT_MS,
      },
    );
    expect(traversalResult.status).toBe(1);
    expect(readdirSync(escapedDirectory)).toEqual([]);

    const symlinkRoot = makeScratchDirectory();
    const symlinkTarget = join(symlinkRoot, "outside");
    const symlinkDirectory = join(symlinkRoot, "spool-link");
    mkdirSync(symlinkTarget);
    symlinkSync(symlinkTarget, symlinkDirectory, "dir");
    for (const symlinkSpelling of [symlinkDirectory, symlinkDirectory + "/", symlinkDirectory + "/."]) {
      const symlinkResult = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          "--input-type=module",
          "--eval",
          `import "@debateai/obs-capture/install/runner"; import ${JSON.stringify(THROWING_MODULE)};`,
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: fixtureEnvironment("runner", symlinkSpelling),
          timeout: PROBE_TIMEOUT_MS,
        },
      );
      expect(symlinkResult.status).toBe(1);
    }
    expect(readdirSync(symlinkTarget)).toEqual([]);
  });

  it.each(RUNTIMES)("%s refuses a real symlinked ancestor without writing through it", (runtime) => {
    const root = makeScratchDirectory();
    const namedParent = join(root, "named");
    const physicalParent = join(root, "physical");
    const physicalSpool = join(physicalParent, "spool");
    mkdirSync(namedParent);
    mkdirSync(physicalSpool, { recursive: true });
    const linkedAncestor = join(namedParent, "linked-ancestor");
    symlinkSync(physicalParent, linkedAncestor, "dir");

    const result = bootFailureProbe({
      mode: "static",
      runtime,
      spoolDirectory: join(linkedAncestor, "spool"),
      withInstaller: true,
    });

    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
    expect(readdirSync(physicalSpool)).toEqual([]);
  });

  // Node has no openat-style primitive, so a check-to-open window remains after this single
  // resolution. It is about 17 microseconds, depth-independent, requires pre-existing write
  // access to the spool directory's parent, and is bounded by O_CREAT | O_EXCL | O_NOFOLLOW
  // on a mode-0600 file. This test pins the single-resolution trace; it does not close that window.
  it("resolves the normalized spool directory exactly once", () => {
    const root = makeScratchDirectory();
    const spoolDirectory = join(root, "named-spool");
    const attackerDirectory = join(root, "attacker");
    const resolutionMarker = join(root, "resolution-trace");
    mkdirSync(spoolDirectory);
    mkdirSync(attackerDirectory);

    const result = finalComponentSwapProbe(spoolDirectory, attackerDirectory, resolutionMarker);

    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(1);
    expect(readFileSync(resolutionMarker, "utf8").trimEnd().split("\n")).toEqual(["realpathSync"]);
    expect(lstatSync(spoolDirectory).isDirectory()).toBe(true);
    expect(readdirSync(attackerDirectory)).toEqual([]);
    expect(readdirSync(spoolDirectory).filter((name) => name.endsWith(".spool"))).toHaveLength(1);
  });

  it.each(["/", "/////"])("refuses filesystem-root spelling %j before any filesystem call", (spelling) => {
    const { result, trace } = spoolDirectoryTraceProbe(spelling);
    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(trace).toEqual([]);
  });

  it.each(RUNTIMES)(
    "%s rejects a large separator run without delaying boot",
    (runtime) => {
      const { appReachedAfterMs, result, spoolFiles } = bootStallProbe(runtime);
      expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
      expect(result.stderr).toBe("");
      expect(spoolFiles).toEqual([]);
      expect(appReachedAfterMs).toBeLessThan(BOOT_STALL_MAX_MS);
    },
  );

  it.each(RUNTIMES)("%s silently degrades when the exit spool cannot be opened", (runtime) => {
    const absentParent = join(makeScratchDirectory(), "absent", "nested");
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "--eval",
        `await import("@debateai/obs-capture/install/${runtime}");`,
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: fixtureEnvironment(runtime, absentParent),
      },
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
  });
});
