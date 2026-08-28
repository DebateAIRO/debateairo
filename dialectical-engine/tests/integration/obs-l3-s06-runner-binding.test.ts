import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import {
  BoundedReferenceQueue,
  createCaptureEmitter,
  createCaptureGapCounter,
  createCaptureHealth,
  createSharedRedactor,
  installCaptureEmitter,
  runWithObsContext,
  type CaptureQueueEntry,
} from "@debateai/obs-capture";
import { TypedDomainError } from "@debateai/kernel";
import {
  createPostgresProviderGateway,
  declareHatchetWalkingSkeletonTask,
  type RunnerExecutionResult,
} from "@debateai/runner";

const ROOT = process.cwd();

function installRecordingEmitter(order: string[] = []): CaptureQueueEntry[] {
  const captured: CaptureQueueEntry[] = [];
  const health = createCaptureHealth();
  const gaps = createCaptureGapCounter({ health });
  installCaptureEmitter(createCaptureEmitter({
    queue: {
      offer(entry) {
        order.push("capture");
        captured.push(entry);
        return true;
      },
    },
    health,
    gaps,
  }));
  return captured;
}

function causeChainContains(error: unknown, target: unknown): boolean {
  const visited = new Set<unknown>();
  let cursor = error;
  while (typeof cursor === "object" && cursor !== null && !visited.has(cursor)) {
    if (cursor === target) return true;
    visited.add(cursor);
    cursor = "cause" in cursor ? cursor.cause : undefined;
  }
  return false;
}

afterEach(() => {
  const health = createCaptureHealth();
  installCaptureEmitter(createCaptureEmitter({
    queue: new BoundedReferenceQueue(1),
    health,
    gaps: createCaptureGapCounter({ health }),
  }));
});

describe("S06 runner task binding", () => {
  it("captures the real task failure before terminal recording with declared context and Hatchet attempt index", async () => {
    type TaskFn = (
      dispatch: { runId: string; workItemId: string },
      context: { retryCount(): number },
    ) => Promise<unknown>;

    let taskFn: TaskFn | undefined;
    const client = {
      task(definition: { fn: TaskFn }) {
        taskFn = definition.fn;
        return {};
      },
    };
    const failure = new TypedDomainError(
      "JUDGEMENT_POLICY_UNRESOLVED",
      "private register diagnostic",
    );
    const runner = {
      executeWorkItem: vi.fn<() => Promise<RunnerExecutionResult>>().mockRejectedValue(failure),
    };
    const order: string[] = [];
    const captured = installRecordingEmitter(order);
    const recordTerminalFailure = vi.fn(async () => {
      order.push("terminal");
      return true;
    });

    declareHatchetWalkingSkeletonTask({
      client: client as never,
      runner: runner as never,
      failures: { recordTerminalFailure },
      workflowName: "runner:s06",
      engineRetries: 3,
    });
    if (taskFn === undefined) throw new Error("TASK_FN_NOT_DECLARED");

    await expect(taskFn(
      { runId: "run:s06", workItemId: "work:s06" },
      { retryCount: () => 2 },
    )).rejects.toBe(failure);

    expect(order).toEqual(["capture", "terminal"]);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      kind: "envelope",
      payload_ref: {
        code: "JUDGEMENT_POLICY_UNRESOLVED",
        error: failure,
        taxonomy_class: "JOB_FAILURE",
        capture_point: "job",
        disposition: "THROWN",
        source: "hatchet",
        attempt_index: 2,
      },
      ambient_context_ref: {
        run_ref: { kind: "run", value: "run:s06" },
        work_item_ref: { kind: "work_item", value: "work:s06" },
      },
    });
    expect(createSharedRedactor({
      environment: "test",
      build_ref: "UNTRACKED-DEV:s06",
      build_dirty: true,
      runtime: "runner",
      component: { process: "runner", package: "@debateai/runner" },
      writer_identity: "s06-test",
      redaction_policy_version: "g0",
      allowlist_set_id: "g0-empty-parameters",
    }).redact(captured[0]!)).toMatchObject({
      code: "JUDGEMENT_POLICY_UNRESOLVED",
      capture_point: "job",
      attempt_index: 2,
      fallback_minimized: false,
    });
  });

  it("preserves the original task failure when terminal recording fails and captures the recording alarm", async () => {
    type TaskFn = (
      dispatch: { runId: string; workItemId: string },
      context: { retryCount(): number },
    ) => Promise<unknown>;

    let taskFn: TaskFn | undefined;
    const client = {
      task(definition: { fn: TaskFn }) {
        taskFn = definition.fn;
        return {};
      },
    };
    const failure = new TypedDomainError(
      "JUDGEMENT_POLICY_UNRESOLVED",
      "private failure that must reach Hatchet",
    );
    const order: string[] = [];
    const captured = installRecordingEmitter(order);
    const recordTerminalFailure = vi.fn(async () => {
      order.push("terminal");
      return false;
    });

    declareHatchetWalkingSkeletonTask({
      client: client as never,
      runner: {
        executeWorkItem: vi.fn<() => Promise<RunnerExecutionResult>>().mockRejectedValue(failure),
      } as never,
      failures: { recordTerminalFailure },
      workflowName: "runner:s06:record-failure",
      engineRetries: 3,
    });
    if (taskFn === undefined) throw new Error("TASK_FN_NOT_DECLARED");

    let observed: unknown;
    try {
      await taskFn(
        { runId: "run:s06:record-failure", workItemId: "work:s06:record-failure" },
        { retryCount: () => 1 },
      );
    } catch (error) {
      observed = error;
    }

    const chainContainsFailure = causeChainContains(observed, failure);
    expect.soft({
      chainContainsFailure,
      replacementCode: chainContainsFailure
        ? "CHAIN_PRESERVED"
        : observed instanceof TypedDomainError
          ? observed.code
          : "NOT_TYPED_DOMAIN_ERROR",
    }).toEqual({
      chainContainsFailure: true,
      replacementCode: "CHAIN_PRESERVED",
    });
    expect.soft(order).toEqual(["capture", "terminal", "capture"]);
    expect.soft(captured.map((entry) => {
      const payload = entry.payload_ref;
      return typeof payload === "object" && payload !== null && "code" in payload
        ? payload.code
        : undefined;
    })).toEqual([
      "JUDGEMENT_POLICY_UNRESOLVED",
      "RUNNER_FAILURE_STATE_NOT_RECORDED",
    ]);
    expect(captured[1]).toMatchObject({
      kind: "envelope",
      payload_ref: {
        code: "RUNNER_FAILURE_STATE_NOT_RECORDED",
        taxonomy_class: "JOB_FAILURE",
        capture_point: "job",
        disposition: "HANDLED",
        source: "hatchet",
        attempt_index: 1,
      },
      ambient_context_ref: {
        run_ref: { kind: "run", value: "run:s06:record-failure" },
        work_item_ref: { kind: "work_item", value: "work:s06:record-failure" },
      },
    });
  });
});

describe("S06 provider gateway binding", () => {
  it("captures one provider occurrence after the real gateway exhausts all attempts", async () => {
    let sequence = 0;
    const client = {
      async query(sql: string) {
        if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [] };
        if (sql.includes("ledger.allocate_sequence")) {
          sequence += 1;
          return { rows: [{ sequence: String(sequence) }] };
        }
        if (sql.includes("INSERT INTO ledger.ledger_entry")) {
          return {
            rows: [{
              ledger_entry_id: `ledger:s06:${sequence}`,
              subject_item_id: "node:s06",
              stance_at_action: "UNASSIGNED",
              outcome: "FAILED",
            }],
          };
        }
        throw new Error(`UNEXPECTED_CLIENT_QUERY:${sql}`);
      },
      release() {},
    } as unknown as PoolClient;
    const pool = {
      async connect() {
        return client;
      },
      async query(sql: string) {
        if (sql.includes("SELECT envelope_basis")) {
          return {
            rows: [{
              envelope_basis: {
                kind: "COMPUTED_STRUCTURAL_CEILING",
                max_model_attempts: 10,
                panel_size: 1,
                depth: 1,
                per_site_attempts: { judge: 2, organ: 2 },
                hold_cap: 1,
                final_retry_attempts: 1,
                formula_version: "s06-test",
                bounds_source_ref: "register:s06",
              },
            }],
          };
        }
        if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: "0" }] };
        throw new Error(`UNEXPECTED_POOL_QUERY:${sql}`);
      },
    } as unknown as Pool;
    const transportFailure = new Error("private provider transport detail");
    const fetchImplementation = vi.fn(async () => {
      throw transportFailure;
    });
    const captured = installRecordingEmitter();
    const gateway = createPostgresProviderGateway(pool, {
      endpoint: "http://127.0.0.1:1",
      model: "test/model",
      maker: "test-maker",
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });

    let observed: unknown;
    try {
      await runWithObsContext({
        work_item_ref: { kind: "work_item", value: "work:provider-s06" },
      }, () => gateway.call({
        runId: "run:provider-s06",
        subjectItemId: "node:s06",
        callSiteKey: "JUDGE:s06",
        role: "JUDGE",
        lane: "served",
        bound: { maxAttempts: 2, tokenCeiling: 64, deadlineMs: 1_000 },
        contractHash: "c".repeat(64),
        providerRef: "provider:s06",
        packet: { messages: [{ role: "user", content: "fixture" }] },
      }));
    } catch (error) {
      observed = error;
    }

    expect(observed).toMatchObject({ code: "PROVIDER_CALL_FAILED", attempts: 2 });
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(captured).toHaveLength(1);
    expect(captured[0]).toMatchObject({
      kind: "envelope",
      payload_ref: {
        code: "PROVIDER_CALL_FAILED",
        error: observed,
        taxonomy_class: "PROVIDER_EXHAUSTED",
        capture_point: "provider",
        disposition: "THROWN",
        source: "first_party",
      },
      ambient_context_ref: {
        run_ref: { kind: "run", value: "run:provider-s06" },
        work_item_ref: { kind: "work_item", value: "work:provider-s06" },
      },
    });
  });
});

describe("S06 deployment linkage", () => {
  it("loads obs-capture from the workspace root with a DB control and preserves the deep-import refusal", () => {
    const program = `
import { lstat } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const rootProbe = pathToFileURL(resolve(root, "workspace-root-resolution-proof.mjs"));
const requireFromWorkspaceRoot = createRequire(rootProbe);
const obsResolved = requireFromWorkspaceRoot.resolve("@debateai/obs-capture");
const dbResolved = requireFromWorkspaceRoot.resolve("@debateai/db");
const nodeModulesEntry = await lstat(resolve(root, "node_modules/@debateai/obs-capture"));
const obs = await import("@debateai/obs-capture");
let deepImportCode = "NO_ERROR";
try {
  await import("@debateai/obs-capture/src/zone/index.ts");
} catch (error) {
  deepImportCode = error?.code ?? "UNKNOWN";
}
console.log(JSON.stringify({
  root,
  obsResolved,
  dbResolved,
  nodeModulesPresent: nodeModulesEntry.isSymbolicLink() || nodeModulesEntry.isDirectory(),
  obsLoaded: typeof obs.emit === "function" && typeof obs.runWithObsContext === "function",
  deepImportCode,
}));`;
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", program],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } },
    );

    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
    const proof = JSON.parse(result.stdout.trim()) as Record<string, unknown>;
    expect(proof).toMatchObject({
      root: ROOT,
      nodeModulesPresent: true,
      obsLoaded: true,
      deepImportCode: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
    expect(String(proof.obsResolved)).toMatch(/\/packages\/obs-capture\/src\/index\.ts$/u);
    expect(String(proof.dbResolved)).toMatch(/\/packages\/db\/src\/index\.ts$/u);
  });

  it("evaluates the runner installer before the DB dependency in the real production entrypoint", () => {
    const throwingDb = `data:text/javascript,${encodeURIComponent(`
export function createPool() {}
const unhandled = process.listenerCount("unhandledRejection");
const uncaught = process.listenerCount("uncaughtExceptionMonitor");
if (unhandled < 1 || uncaught < 1) throw new Error("RUNNER_INSTALLER_NOT_FIRST");
throw new Error("DB_IMPORT_AFTER_RUNNER_INSTALL");`)} `;
    const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/apps/runner/src/main.ts")) {
    if (specifier === "@debateai/db") {
      return { url: ${JSON.stringify(throwingDb.trim())}, shortCircuit: true };
    }
    const stubs = {
      "@hatchet-dev/typescript-sdk": "export class Hatchet {}",
      "../../../packages/crypto/src/index.js": "export function loadKek() {}",
      "@debateai/battery": "export class WorkItemRepository {}",
      "@debateai/register": "export function loadBootstrapRegister() {} export function loadRunnerEnvironment() {} export function readClaimTypeCompositionMap() {}",
      "./index.js": "export function createPostgresProviderGateway() {} export function declareHatchetWalkingSkeletonTask() {} export class WalkingSkeletonRunner {}",
    };
    if (Object.hasOwn(stubs, specifier)) {
      return { url: "data:text/javascript," + encodeURIComponent(stubs[specifier]), shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}`;
    const loaderUrl = `data:text/javascript,${encodeURIComponent(loaderSource)}`;
    const program = `
try {
  await import("./apps/runner/src/main.ts");
  throw new Error("RUNNER_MAIN_UNEXPECTEDLY_LOADED");
} catch (error) {
  console.log(JSON.stringify({
    message: error?.message,
    unhandled: process.listenerCount("unhandledRejection"),
    uncaught: process.listenerCount("uncaughtExceptionMonitor"),
  }));
}`;
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--experimental-loader",
        loaderUrl,
        "--input-type=module",
        "--eval",
        program,
      ],
      { cwd: ROOT, encoding: "utf8", env: { ...process.env, NODE_NO_WARNINGS: "1" } },
    );

    expect(result.status, `stdout=${result.stdout}\nstderr=${result.stderr}`).toBe(0);
    expect(JSON.parse(result.stdout.trim())).toMatchObject({
      message: "DB_IMPORT_AFTER_RUNNER_INSTALL",
      unhandled: 1,
      uncaught: 1,
    });
  });
});
