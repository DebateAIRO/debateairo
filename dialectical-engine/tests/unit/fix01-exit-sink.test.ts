import { spawn, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PROBE_TIMEOUT_MS = 5_000;
const ARM_SETTLE_MS = 250;
const scratchDirectories: string[] = [];

interface ChildResult {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
}

interface DirectSinkProbe {
  readonly installCalls: number;
  readonly sinkAvailable: boolean;
  readonly sinkThrew: boolean;
  readonly raw: string;
}

function makeScratchDirectory(): string {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "fix01-c3-exit-")));
  scratchDirectories.push(directory);
  return directory;
}

function fixtureEnvironment(
  overrides: Readonly<Record<string, string>> = {},
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_NO_WARNINGS: "1",
  };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("OBS_")) delete environment[key];
  }
  return {
    ...environment,
    OBS_ENVIRONMENT: "test",
    OBS_BUILD_REF: "UNTRACKED-DEV:fix01-c3",
    OBS_BUILD_DIRTY: "true",
    OBS_REDACTION_POLICY_VERSION: "g0",
    OBS_ALLOWLIST_SET_ID: "g0-empty-parameters",
    OBS_ENVELOPE_MAX_BYTES: "16384",
    OBS_WRITER_IDENTITY: "scheduler-fix01-c3",
    ...overrides,
  };
}

function runProbe<T>(
  program: string,
  environment: NodeJS.ProcessEnv = fixtureEnvironment(),
): T {
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "--eval", program],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: environment,
      timeout: PROBE_TIMEOUT_MS,
    },
  );

  expect(
    child.status,
    ["stdout=", child.stdout, "\nstderr=", child.stderr].join(""),
  ).toBe(0);
  return JSON.parse(child.stdout.trim()) as T;
}

function runInstallerExitProbe(options: {
  readonly program: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly sendSigterm?: boolean;
}): Promise<ChildResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", options.program],
      {
        cwd: ROOT,
        env: options.environment,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    let signalSent = false;
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`exit probe timed out; stdout=${stdout}; stderr=${stderr}`));
    }, PROBE_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (
        options.sendSigterm === true &&
        !signalSent &&
        stdout.includes("READY\n")
      ) {
        signalSent = child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal, stdout, stderr });
    });
  });
}

function onlySpoolContents(directory: string): string {
  const spoolFiles = readdirSync(directory).filter((name) =>
    name.endsWith(".spool")
  );
  expect(spoolFiles).toHaveLength(1);
  return readFileSync(join(directory, spoolFiles[0] ?? "missing"), "utf8");
}

function expectOnePostRedactionSelfEnvelope(raw: string): void {
  expect(raw.endsWith("\n")).toBe(true);
  const lines = raw.trimEnd().split("\n");
  expect(lines).toHaveLength(1);
  const envelope = JSON.parse(lines[0] ?? "null") as Record<string, unknown>;
  expect(envelope).toMatchObject({
    environment: "test",
    build_ref: "UNTRACKED-DEV:fix01-c3",
    build_dirty: true,
    runtime: "scheduler",
    component: { process: "scheduler", package: "@debateai/scheduler" },
    capture_point: "self",
    code: "OBS_CAPTURE_SELF",
    taxonomy_class: "CAPTURE_SELF",
    severity: "DEGRADED",
    condition_mark: null,
    disposition: "SELF",
    fingerprint_version: 1,
    redaction_policy_version: "g0",
    allowlist_set_id: "g0-empty-parameters",
    fallback_minimized: false,
    run_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
    work_item_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
    node_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
    attempt_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
    ledger_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
    parent_occurrence_ref: "NO_CAUSE",
    cause_relation: null,
    at_seq_watermark: "UNKNOWN:DECLARED_KIND_REQUIRED",
    frames: [],
    safe_template_id: "tpl.OBS_CAPTURE_SELF",
    template_parameters: {},
    source: "first_party",
    zone_context: false,
    attempt_index: null,
    writer_identity: "scheduler-fix01-c3",
  });
  expect(envelope.occurred_at).toEqual(expect.any(String));
  expect(envelope.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  expect(envelope.source_event_ref).toEqual(expect.any(String));
  expect(raw).not.toContain("FIX01_C3_FATAL_SECRET");
}

function directSinkProgram(file: string): string {
  return [
    'import { closeSync, constants, openSync, readFileSync } from "node:fs";',
    'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
    `const file = ${JSON.stringify(file)};`,
    "const fd = openSync(file, constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);",
    "let installCalls = 0;",
    "let sink;",
    "await startCaptureRuntime({",
    '  runtime: "scheduler",',
    "  spoolFd: fd,",
    "  installExitSink(next) { installCalls += 1; sink = next; },",
    "});",
    "const originalStringify = JSON.stringify;",
    "JSON.stringify = () => { throw new Error(\"STRINGIFY_AT_EXIT\"); };",
    "let sinkThrew = false;",
    "try { sink?.(); sink?.(); } catch { sinkThrew = true; }",
    "JSON.stringify = originalStringify;",
    'const raw = readFileSync(file, "utf8");',
    "await stopCaptureRuntime({ deadlineMs: 100 });",
    "closeSync(fd);",
    "process.stdout.write(originalStringify({ installCalls, sinkAvailable: sink !== undefined, sinkThrew, raw }));",
  ].join("\n");
}

function unavailableSinkProgram(file: string, mode: "no-fd" | "failed-prepare"): string {
  return [
    'import { closeSync, constants, openSync } from "node:fs";',
    'import { startCaptureRuntime, stopCaptureRuntime } from "@debateai/obs-capture/runtime";',
    `const mode = ${JSON.stringify(mode)};`,
    `const file = ${JSON.stringify(file)};`,
    "const fd = mode === \"no-fd\" ? undefined : openSync(file, constants.O_APPEND | constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);",
    "let installCalls = 0;",
    "await startCaptureRuntime({ runtime: \"scheduler\", spoolFd: fd, installExitSink() { installCalls += 1; } });",
    "await stopCaptureRuntime({ deadlineMs: 100 });",
    "if (fd !== undefined) closeSync(fd);",
    "process.stdout.write(JSON.stringify({ installCalls }));",
  ].join("\n");
}

afterEach(() => {
  while (scratchDirectories.length > 0) {
    const directory = scratchDirectories.pop();
    if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  }
});

describe("FIX-01 C3 Tier-1 exit sink", () => {
  it.each([
    {
      name: "uncaught throw",
      expectedCode: 1,
      sendSigterm: false,
      program: [
        'await import("@debateai/obs-capture/install/scheduler");',
        `await new Promise((resolve) => setTimeout(resolve, ${ARM_SETTLE_MS}));`,
        'throw new Error("FIX01_C3_FATAL_SECRET");',
      ].join("\n"),
    },
    {
      name: "SIGTERM translated to a normal non-zero exit",
      expectedCode: 143,
      sendSigterm: true,
      program: [
        "const keepAlive = setInterval(() => undefined, 1000);",
        'process.once("SIGTERM", () => { process.exitCode = 143; clearInterval(keepAlive); });',
        'await import("@debateai/obs-capture/install/scheduler");',
        `await new Promise((resolve) => setTimeout(resolve, ${ARM_SETTLE_MS}));`,
        'process.stdout.write("READY\\n");',
      ].join("\n"),
    },
    {
      name: "process.exit(1)",
      expectedCode: 1,
      sendSigterm: false,
      program: [
        'await import("@debateai/obs-capture/install/scheduler");',
        `await new Promise((resolve) => setTimeout(resolve, ${ARM_SETTLE_MS}));`,
        "process.exit(1);",
      ].join("\n"),
    },
  ])(
    "writes one complete post-redaction line before parent-observed exit for $name",
    async ({ expectedCode, program, sendSigterm }) => {
      const directory = makeScratchDirectory();
      const result = await runInstallerExitProbe({
        program,
        sendSigterm,
        environment: fixtureEnvironment({ OBS_SPOOL_DIR: directory }),
      });

      expect(result.code, `stderr=${result.stderr}`).toBe(expectedCode);
      expect(result.signal).toBeNull();
      expectOnePostRedactionSelfEnvelope(onlySpoolContents(directory));
    },
    10_000,
  );

  it("prepares before exit, writes synchronously, and ignores a repeated call", () => {
    const directory = makeScratchDirectory();
    const file = join(directory, "direct.spool");
    const proof = runProbe<DirectSinkProbe>(directSinkProgram(file));

    expect(proof.installCalls).toBe(1);
    expect(proof.sinkAvailable).toBe(true);
    expect(proof.sinkThrew).toBe(false);
    expectOnePostRedactionSelfEnvelope(proof.raw);
  });

  it("leaves Tier 0 installed when no fd exists or preparation fails", () => {
    const directory = makeScratchDirectory();
    const noFdFile = join(directory, "unused.spool");
    const failedPrepareFile = join(directory, "failed-prepare.spool");

    expect(
      runProbe<{ readonly installCalls: number }>(
        unavailableSinkProgram(noFdFile, "no-fd"),
      ),
    ).toEqual({ installCalls: 0 });
    expect(
      runProbe<{ readonly installCalls: number }>(
        unavailableSinkProgram(failedPrepareFile, "failed-prepare"),
        fixtureEnvironment({ OBS_ENVELOPE_MAX_BYTES: "1" }),
      ),
    ).toEqual({ installCalls: 0 });
  });

  it("keeps exit ownership out of runtime/sink.ts", () => {
    const source = readFileSync(
      new URL("../../packages/obs-capture/src/runtime/sink.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/\bprocess\s*\.\s*exit\s*\(/);
    expect(source).not.toMatch(
      /\bprocess\s*\.\s*on\s*\(\s*["']uncaughtException["']/,
    );
    expect(source).not.toMatch(
      /\bprocess\s*\.\s*on\s*\(\s*["']unhandledRejection["']/,
    );
  });
});
