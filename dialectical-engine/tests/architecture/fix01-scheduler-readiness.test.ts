import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const CLI_PATH = new URL("../../apps/scheduler/src/cli.ts", import.meta.url);
const INSTALLER_PATH = new URL(
  "../../packages/obs-capture/install/scheduler.ts",
  import.meta.url,
);
const MIGRATION_PATH = new URL(
  "../../migrations/0061_obs_job_lifecycle_taxonomy.sql",
  import.meta.url,
);
const DECISIONS_PATH = new URL(
  "../../docs/missions/observability-agents/slices/FIX-01/DECISIONS.md",
  import.meta.url,
);

function cancellationProbe(
  mode: "before-import" | "after-import" | "after-start",
): Readonly<Record<string, unknown>> {
  const runtimeSource = [
    "globalThis.__fix01RuntimeLoads += 1;",
    "globalThis.__fix01RuntimeLoaded?.();",
    "export function startCaptureRuntime() {",
    "  globalThis.__fix01RuntimeStarts += 1;",
    "  globalThis.__fix01RuntimeStarted?.();",
    "}",
  ].join("\n");
  const runtimeUrl = `data:text/javascript,${encodeURIComponent(runtimeSource)}`;
  const loaderSource = [
    "export function resolve(specifier, context, nextResolve) {",
    "  if (context.parentURL?.includes('/packages/obs-capture/install/scheduler.') && specifier === '@debateai/obs-capture/runtime') {",
    `    return { url: ${JSON.stringify(runtimeUrl)}, shortCircuit: true };`,
    "  }",
    "  return nextResolve(specifier, context);",
    "}",
  ].join("\n");
  const loaderUrl = `data:text/javascript,${encodeURIComponent(loaderSource)}`;
  const program = [
    "const nativeSetImmediate = globalThis.setImmediate;",
    "let armCallback;",
    "let clears = 0;",
    "globalThis.setTimeout = (callback) => { armCallback = callback; return { unref() {} }; };",
    "globalThis.clearTimeout = () => { clears += 1; };",
    "globalThis.__fix01RuntimeLoads = 0;",
    "globalThis.__fix01RuntimeStarts = 0;",
    "let resolveLoaded;",
    "let resolveStarted;",
    "const loaded = new Promise((resolve) => { resolveLoaded = resolve; });",
    "const started = new Promise((resolve) => { resolveStarted = resolve; });",
    "globalThis.__fix01RuntimeLoaded = resolveLoaded;",
    "globalThis.__fix01RuntimeStarted = resolveStarted;",
    'const installer = await import("@debateai/obs-capture/install/scheduler");',
    "const handlersBefore = [process.listenerCount('uncaughtExceptionMonitor'), process.listenerCount('exit')];",
    mode === "before-import"
      ? "installer.cancelScheduledCaptureRuntimeStart(); armCallback();"
      : mode === "after-import"
        ? "armCallback(); await loaded; installer.cancelScheduledCaptureRuntimeStart();"
        : "armCallback(); await started; installer.cancelScheduledCaptureRuntimeStart();",
    "await new Promise((resolve) => nativeSetImmediate(resolve));",
    "const handlersAfter = [process.listenerCount('uncaughtExceptionMonitor'), process.listenerCount('exit')];",
    "process.stdout.write(JSON.stringify({ loads: globalThis.__fix01RuntimeLoads, starts: globalThis.__fix01RuntimeStarts, clears, handlersBefore, handlersAfter }));",
  ].join("\n");
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-loader",
      loaderUrl,
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      program,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1", OBS_SPOOL_DIR: "" },
      timeout: 5_000,
    },
  );
  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout) as Readonly<Record<string, unknown>>;
}

type CliRuntimeMode =
  | "installed"
  | "start_failed"
  | "stopped"
  | "timed_out"
  | "missing"
  | "rejected";

function cliProbe(options: {
  readonly command: "replay-self-test" | "liveness-sweep" | "settlement-watch";
  readonly runtime: CliRuntimeMode;
  readonly job: "return" | "throw";
}): Readonly<Record<string, unknown>> {
  const moduleUrl = (source: string): string =>
    `data:text/javascript,${encodeURIComponent(source)}`;
  const installerUrl = moduleUrl([
    "export function cancelScheduledCaptureRuntimeStart() {",
    "  globalThis.__fix01CliEvents.push('cancel');",
    "}",
  ].join("\n"));
  const databaseUrl = moduleUrl([
    "export function createPool() {",
    "  globalThis.__fix01CliEvents.push('pool:create');",
    "  return { async end() { globalThis.__fix01CliEvents.push('pool:end'); } };",
    "}",
  ].join("\n"));
  const registerUrl = moduleUrl([
    "export const loadReplaySelfTestEnvironment = () => ({ REPLAY_SELF_TEST_DATABASE_URL: 'postgres://test' });",
    "export const loadLivenessEnvironment = () => ({ LIVENESS_DATABASE_URL: 'postgres://test' });",
    "export const loadSettlementEnvironment = () => ({ SETTLEMENT_DATABASE_URL: 'postgres://test' });",
  ].join("\n"));
  const jobsSource = [
    "async function run(name) {",
    "  globalThis.__fix01CliEvents.push(`job:${name}`);",
    "  if (globalThis.__fix01CliJobMode === 'throw') throw globalThis.__fix01CliError;",
    "  return globalThis.__fix01CliReports[name];",
    "}",
    "export const runReplaySelfTest = () => run('replay-self-test');",
    "export const runLivenessSweep = () => run('liveness-sweep');",
    "export const runSettlementWatch = () => run('settlement-watch');",
    "export async function runJobWithLifecycle(name, fn) {",
    "  globalThis.__fix01CliEvents.push(`lifecycle:${name}`);",
    "  return fn();",
    "}",
  ].join("\n");
  const jobsUrl = moduleUrl(jobsSource);
  const runtimeUrl = options.runtime === "missing"
    ? "file:///fix01-c5-deliberately-missing-runtime.mjs"
    : moduleUrl(options.runtime === "rejected"
      ? "throw new Error('FIX01_RUNTIME_IMPORT_REJECTED');"
      : [
          "export async function waitForCaptureEmitterInstalled(options) {",
          "  globalThis.__fix01CliEvents.push(`wait:${options.deadlineMs}`);",
          `  return ${JSON.stringify(options.runtime)};`,
          "}",
          "export async function stopCaptureRuntime(options) {",
          "  globalThis.__fix01CliEvents.push(`stop:${options.deadlineMs}`);",
          "}",
        ].join("\n"));
  const redirects = {
    "@debateai/obs-capture/install/scheduler": installerUrl,
    "@debateai/db": databaseUrl,
    "@debateai/register": registerUrl,
    "./index.js": jobsUrl,
    "@debateai/obs-capture/runtime": runtimeUrl,
  };
  const loaderSource = [
    `const redirects = new Map(Object.entries(${JSON.stringify(redirects)}));`,
    "export function resolve(specifier, context, nextResolve) {",
    "  if (context.parentURL?.includes('/apps/scheduler/src/cli.') && redirects.has(specifier)) {",
    "    return { url: redirects.get(specifier), shortCircuit: true };",
    "  }",
    "  return nextResolve(specifier, context);",
    "}",
    "export function load(url, context, nextLoad) {",
    "  if (url.includes('/apps/scheduler/src/index.ts')) {",
    `    return { format: 'module', source: ${JSON.stringify(jobsSource)}, shortCircuit: true };`,
    "  }",
    "  return nextLoad(url, context);",
    "}",
  ].join("\n");
  const loaderUrl = moduleUrl(loaderSource);
  const program = [
    `process.argv[2] = ${JSON.stringify(options.command)};`,
    "globalThis.__fix01CliEvents = [];",
    `globalThis.__fix01CliJobMode = ${JSON.stringify(options.job)};`,
    "globalThis.__fix01CliError = Object.freeze({ planted: 'same-error' });",
    "globalThis.__fix01CliReports = Object.freeze({",
    "  'replay-self-test': Object.freeze({ checked: 3, evicted: Object.freeze([]) }),",
    "  'liveness-sweep': Object.freeze({ checked: 3, archived: Object.freeze([]) }),",
    "  'settlement-watch': Object.freeze({ checked: 3, settled: 0, superseded: 0, incomplete: 3, results: Object.freeze([]) }),",
    "});",
    "const logs = [];",
    "const originalLog = console.log;",
    "console.log = (...args) => logs.push(args.join(' '));",
    "let caught;",
    `try { await import(${JSON.stringify(CLI_PATH.href)} + '?probe=' + Math.random()); } catch (error) { caught = error; }`,
    "console.log = originalLog;",
    "process.stdout.write(JSON.stringify({",
    "  events: globalThis.__fix01CliEvents,",
    "  logs,",
    "  caughtSame: caught === globalThis.__fix01CliError,",
    "  caughtName: caught?.name,",
    "  caughtMessage: caught?.message,",
    "}));",
  ].join("\n");
  const child = spawnSync(
    process.execPath,
    [
      "--experimental-loader",
      loaderUrl,
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      program,
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, NODE_NO_WARNINGS: "1", OBS_SPOOL_DIR: "" },
      timeout: 5_000,
    },
  );
  expect(child.status, child.stderr).toBe(0);
  expect(child.stderr).toBe("");
  return JSON.parse(child.stdout) as Readonly<Record<string, unknown>>;
}

describe("FIX-01 C5 scheduler readiness architecture", () => {
  it("loads the scheduler installer first and the runtime only through one caught dynamic import", () => {
    const source = readFileSync(CLI_PATH, "utf8");
    const importLines = source.match(/^import[^;]+;$/gmu) ?? [];

    expect(importLines[0]).toBe(
      'import { cancelScheduledCaptureRuntimeStart } from "@debateai/obs-capture/install/scheduler";',
    );
    expect(importLines.some((line) =>
      line.includes('@debateai/obs-capture/runtime'))).toBe(false);
    expect(source.match(/import\("@debateai\/obs-capture\/runtime"\)/gu)).toHaveLength(1);
    expect(source).toMatch(/\.catch\(\(\) => undefined\)/u);
  });

  it("shares one monotonic 5000 ms deadline and gives the waiter only the remainder", () => {
    const source = readFileSync(CLI_PATH, "utf8");

    expect(source).toMatch(/performance\.now\(\)\s*\+\s*5_000/u);
    expect(source).toMatch(/deadline\s*-\s*performance\.now\(\)/u);
    expect(source.match(/5_000/gu)).toHaveLength(1);
    expect(source).not.toMatch(/Date\.now/u);
  });

  it("cancels, stops within the same remaining deadline, then closes the pool", () => {
    const source = readFileSync(CLI_PATH, "utf8");
    const cancel = source.lastIndexOf("cancelScheduledCaptureRuntimeStart()");
    const stop = source.lastIndexOf("stopCaptureRuntime");
    const close = source.lastIndexOf("pool.end()");

    expect(cancel).toBeGreaterThan(-1);
    expect(stop).toBeGreaterThan(cancel);
    expect(close).toBeGreaterThan(stop);
    expect(source).toMatch(/deadlineMs:\s*remaining/u);
  });

  it("has both cancellation checks and leaves active-runtime stop to the CLI", () => {
    const source = readFileSync(INSTALLER_PATH, "utf8");

    expect(source.match(/if \(runtimeStartCancelled\)/gu)).toHaveLength(2);
    expect(source).toMatch(/clearTimeout\(runtimeArm\)/u);
    expect(source).not.toContain("stopCaptureRuntime");
    expect(source).not.toContain("removeListener");
  });

  it("makes cancellation inert before import and after import but not retroactive", () => {
    expect(cancellationProbe("before-import")).toMatchObject({
      loads: 0,
      starts: 0,
      clears: 1,
    });
    expect(cancellationProbe("after-import")).toMatchObject({
      loads: 1,
      starts: 0,
      clears: 1,
    });
    const active = cancellationProbe("after-start");
    expect(active).toMatchObject({ loads: 1, starts: 1, clears: 1 });
    expect(active.handlersAfter).toEqual(active.handlersBefore);
  });

  it.each([
    ["replay-self-test", '"evicted": []'],
    ["liveness-sweep", '"archived": []'],
    ["settlement-watch", '"settled": 0'],
  ] as const)("runs %s with an inert installer and only emits after installed", (
    command,
    reportFragment,
  ) => {
    const result = cliProbe({ command, runtime: "installed", job: "return" });
    const events = result.events as readonly string[];

    expect(result.logs, JSON.stringify(result)).toHaveLength(1);
    expect((result.logs as readonly string[])[0]).toContain(reportFragment);
    expect(result.caughtSame).toBe(false);
    expect(events).toEqual([
      "pool:create",
      expect.stringMatching(/^wait:/u),
      `lifecycle:${command}`,
      `job:${command}`,
      "cancel",
      expect.stringMatching(/^stop:/u),
      "pool:end",
    ]);
  });

  it.each(["start_failed", "stopped", "timed_out"] as const)(
    "runs silently without lifecycle output after %s readiness",
    (runtime) => {
      const result = cliProbe({
        command: "replay-self-test",
        runtime,
        job: "return",
      });
      const events = result.events as readonly string[];

      expect(result.caughtSame).toBe(false);
      expect(result.logs).toHaveLength(1);
      expect(events).not.toContain("lifecycle:replay-self-test");
      expect(events.at(-3)).toBe("cancel");
      expect(events.at(-2)).toMatch(/^stop:/u);
      expect(events.at(-1)).toBe("pool:end");
    },
  );

  it.each(["missing", "rejected"] as const)(
    "keeps report and rejection behavior unchanged when runtime import is %s",
    (runtime) => {
      const returned = cliProbe({
        command: "replay-self-test",
        runtime,
        job: "return",
      });
      const thrown = cliProbe({
        command: "replay-self-test",
        runtime,
        job: "throw",
      });

      expect(returned).toMatchObject({ caughtSame: false });
      expect(returned.logs).toHaveLength(1);
      expect(thrown).toMatchObject({ caughtSame: true, logs: [] });
      for (const result of [returned, thrown]) {
        const events = result.events as readonly string[];
        expect(events).not.toContain("lifecycle:replay-self-test");
        expect(events).toContain("job:replay-self-test");
        expect(events.slice(-2)).toEqual(["cancel", "pool:end"]);
      }
    },
  );

  it("changes only the occurrence taxonomy check in migration 0061", () => {
    const source = readFileSync(MIGRATION_PATH, "utf8");
    const values = [...source.matchAll(/'([A-Z_]+)'/gu)].map((match) => match[1]);

    expect(values).toEqual([
      "PROCESS_DEATH",
      "HTTP_FAILURE",
      "JOB_FAILURE",
      "PROVIDER_EXHAUSTED",
      "DB_FAILURE",
      "PARSE_SCHEMA_FAILURE",
      "STALL_DETECTED",
      "SILENT_NOOP",
      "SUSPICIOUS_SUCCESS",
      "CLIENT_FAILURE",
      "CAPTURE_SELF",
      "ORIGIN_UNKNOWN",
      "JOB_LIFECYCLE",
    ]);
    expect(source.match(/ALTER TABLE obs\.occurrence/gu)).toHaveLength(1);
    expect(source).toContain("DROP CONSTRAINT IF EXISTS occurrence_taxonomy_class_check");
    expect(source).toContain("ADD CONSTRAINT occurrence_taxonomy_class_check CHECK");
    expect(source).not.toMatch(/\b(?:CREATE|GRANT|REVOKE|ROLE|TRIGGER|VIEW)\b/u);
  });

  it("keeps cadence and scheduled receipts open", () => {
    const cli = readFileSync(CLI_PATH, "utf8");
    const registry = readFileSync(
      new URL("../../packages/obs-capture/src/registry/index.ts", import.meta.url),
      "utf8",
    );

    expect(cli).not.toMatch(/next_due|launchd|cron|JOB_SCHEDULED/u);
    expect(registry).not.toContain("OBS_SCHEDULER_JOB_SCHEDULED");
  });

  it("keeps the audited 0061 allocation before the migration", () => {
    const decisions = readFileSync(DECISIONS_PATH, "utf8");
    const allocation = decisions.split("\n").find((line) =>
      line.includes("Which migration number is allocated to FIX-01 C5?"));

    expect(allocation).toContain("0061_obs_job_lifecycle_taxonomy.sql");
    expect(allocation).toContain("76 registered worktrees");
    expect(allocation).toContain("59 local and remote refs");
    expect(allocation).toContain("only open PR (#8)");
    expect(allocation).toContain("V approval carried by the controller");
  });
});
