import { spawnSync } from "node:child_process";

import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool, PoolClient } from "pg";
import {
  BoundedReferenceQueue,
  createCaptureEmitter,
  createCaptureGapCounter,
  createCaptureHealth,
  createSharedRedactor,
  declaredRef,
  getObsContext,
  installCaptureEmitter,
  runWithObsContext,
  type CaptureQueueEntry,
} from "@debateai/obs-capture";
import { TypedDomainError } from "@debateai/kernel";
import { parseCostEnvelopeBasis } from "@debateai/budget";
import { SERVE_LEG } from "@debateai/register";
import {
  createPostgresProviderGateway,
  declareHatchetWalkingSkeletonTask,
  type RunnerExecutionResult,
} from "@debateai/runner";

const ROOT = process.cwd();
const RUN_ID = "550e8400-e29b-41d4-a716-446655440030";
const WORK_ITEM_ID = "550e8400-e29b-41d4-a716-446655440031";

/**
 * The run head basis this gateway test hands to the real runner. It is an
 * ORDINARY SUCCESS-PATH SETUP — the point of the test is provider exhaustion,
 * not a stale-receipt refusal — so it must be a receipt the shipped parser
 * accepts, and the ceiling stays deliberately small (10) so a handful of
 * provider attempts reaches it.
 *
 * F-T17T9-3 (codex r1 B2): it used to supply `serve: 7`, the three retired
 * composition fields and `selected: "COMPOSITION"`. The v4 parser refuses that
 * shape, so the test would have died at RUN_COST_ENVELOPE_UNRESOLVED before
 * reaching the behaviour it exists to check — hidden, at the time, behind an
 * inherited advisory-lock stub failure that stops the run earlier still. Hoisted
 * out of the pool stub and pinned by its own parse test below, so it cannot rot
 * silently again while a different failure masks it.
 */
const S06_ENVELOPE_BASIS = Object.freeze({
  kind: "COMPUTED_STRUCTURAL_CEILING",
  max_model_attempts: 10,
  panel_size: 1,
  depth: 1,
  per_site_attempts: { judge: 2, organ: 2, panel_member: 2, cooldown_site: 5 },
  call_sites: { author: 1, panel: 0, reviewer: 0, serve: 6 },
  serve_leg: { synthesis_loop_sites: 6, selected: "SYNTHESIS_LOOP" },
  hold_cap: 1,
  final_retry_attempts: 1,
  formula_version: "s06-test",
  bounds_source_ref: "register:s06",
});

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
      { runId: RUN_ID, workItemId: WORK_ITEM_ID },
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
        run_ref: { kind: "run", value: RUN_ID },
        work_item_ref: { kind: "work_item", value: WORK_ITEM_ID },
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
      run_ref: RUN_ID,
      work_item_ref: WORK_ITEM_ID,
      node_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
      attempt_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
      ledger_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
      at_seq_watermark: "UNKNOWN:DECLARED_KIND_REQUIRED",
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
        { runId: RUN_ID, workItemId: WORK_ITEM_ID },
        { retryCount: () => 1 },
      );
    } catch (error) {
      observed = error;
    }

    expect.soft(observed).toBe(failure);
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
        run_ref: { kind: "run", value: RUN_ID },
        work_item_ref: { kind: "work_item", value: WORK_ITEM_ID },
      },
    });
    const alarmPayload = captured[1]?.payload_ref;
    expect(alarmPayload).toBeTypeOf("object");
    expect((alarmPayload as { error?: { cause?: unknown } }).error?.cause).toBe(failure);
  });
});

describe("S06 provider gateway binding", () => {
  it("supplies a receipt the shipped run-head parser accepts", () => {
    expect(parseCostEnvelopeBasis(S06_ENVELOPE_BASIS)).toMatchObject({
      maxModelAttempts: 10,
      panelSize: 1,
      depth: 1,
      serveLeg: { synthesisLoopSites: 6, selected: SERVE_LEG.chain }
    });
  });

  it.each([
    ["a lawful inherited work item", () => {
      let reads = 0;
      const outer: Record<string, unknown> = {
        run_ref: declaredRef("run", "550e8400-e29b-41d4-a716-446655440032"),
        work_item_ref: declaredRef("work_item", WORK_ITEM_ID),
        zone_context: false,
      };
      for (const field of ["asker_id", "session_id", "node_ref"] as const) {
        Object.defineProperty(outer, field, {
          get() {
            reads += 1;
            throw new Error(`GATEWAY_UNRELATED_GETTER_CALLED:${field}`);
          },
          enumerable: true,
        });
      }
      return {
        outer,
        expected: {
          run_ref: declaredRef("run", RUN_ID),
          work_item_ref: declaredRef("work_item", WORK_ITEM_ID),
        },
        readCount: (): number => reads,
      };
    }],
    ["a hostile work-item declaration accessor", () => {
      let reads = 0;
      const declaration: Record<string, unknown> = {
        value: WORK_ITEM_ID,
      };
      Object.defineProperty(declaration, "kind", {
        get() {
          reads += 1;
          throw new Error("GATEWAY_WORK_ITEM_KIND_GETTER_CALLED");
        },
        enumerable: true,
      });
      return {
        outer: { work_item_ref: declaration },
        expected: { run_ref: declaredRef("run", RUN_ID) },
        readCount: (): number => reads,
      };
    }],
    ["a noncanonical work-item value", () => ({
      outer: {
        work_item_ref: { kind: "work_item", value: WORK_ITEM_ID.toUpperCase() },
      },
      expected: { run_ref: declaredRef("run", RUN_ID) },
      readCount: (): number => 0,
    })],
    ["no inherited work item", () => ({
      outer: { node_ref: declaredRef("node", "550e8400-e29b-41d4-a716-446655440032") },
      expected: { run_ref: declaredRef("run", RUN_ID) },
      readCount: (): number => 0,
    })],
    ["an outer true zone", () => ({
      outer: {
        work_item_ref: declaredRef("work_item", WORK_ITEM_ID),
        zone_context: true,
      },
      expected: {
        run_ref: declaredRef("run", RUN_ID),
        work_item_ref: declaredRef("work_item", WORK_ITEM_ID),
        zone_context: true,
      },
      readCount: (): number => 0,
    })],
    ["a hostile zone accessor", () => {
      let reads = 0;
      const outer: Record<string, unknown> = {
        work_item_ref: declaredRef("work_item", WORK_ITEM_ID),
      };
      Object.defineProperty(outer, "zone_context", {
        get() {
          reads += 1;
          throw new Error("GATEWAY_ZONE_GETTER_CALLED");
        },
        enumerable: true,
      });
      return {
        outer,
        expected: {
          run_ref: declaredRef("run", RUN_ID),
          work_item_ref: declaredRef("work_item", WORK_ITEM_ID),
          zone_context: true,
        },
        readCount: (): number => reads,
      };
    }],
    ["a hostile zone descriptor trap", () => ({
      outer: new Proxy({}, {
        getOwnPropertyDescriptor() { throw new Error("GATEWAY_ZONE_DESCRIPTOR_TRAP"); },
      }),
      expected: {
        run_ref: declaredRef("run", RUN_ID),
        zone_context: true,
      },
      readCount: (): number => 0,
    })],
    ["a non-boolean zone value", () => ({
      outer: {
        work_item_ref: declaredRef("work_item", WORK_ITEM_ID),
        zone_context: "true",
      },
      expected: {
        run_ref: declaredRef("run", RUN_ID),
        work_item_ref: declaredRef("work_item", WORK_ITEM_ID),
        zone_context: true,
      },
      readCount: (): number => 0,
    })],
    ["a hostile work-item accessor", () => {
      let reads = 0;
      const outer: Record<string, unknown> = {};
      Object.defineProperty(outer, "work_item_ref", {
        get() {
          reads += 1;
          throw new Error("GATEWAY_WORK_ITEM_GETTER_CALLED");
        },
        enumerable: true,
      });
      return {
        outer,
        expected: { run_ref: declaredRef("run", RUN_ID) },
        readCount: (): number => reads,
      };
    }],
    ["an invalid work-item declaration", () => ({
      outer: {
        work_item_ref: declaredRef("run", WORK_ITEM_ID),
        asker_id: "550e8400-e29b-41d4-a716-446655440032",
        session_id: "550e8400-e29b-41d4-a716-446655440033",
      },
      expected: { run_ref: declaredRef("run", RUN_ID) },
      readCount: (): number => 0,
    })],
  ] as const)("seeds a fresh provider context for %s", async (_name, makeCase) => {
    const { outer, expected, readCount } = makeCase();
    let sequence = 0;
    const client = {
      async query(sql: string, values?: readonly unknown[]) {
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
        if (sql.includes("FROM core.run AS run") && sql.includes("run_id=ANY")) {
          return { rows: [{ run_id: RUN_ID, live: true }] };
        }
        if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
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
        // `acquireRunContentLease` acquires with pg_TRY_advisory_lock and reads
        // `acquired` off the row (packages/db/src/index.ts:331, :334). That form is
        // pinned by tests/architecture/s6-content-encryption-contract.test.ts:52-57,
        // which also forbids the blocking `pg_advisory_lock(hashtextextended($1,0))`.
        // Any row without `acquired: true` reads as CONTENTION and sends the lease
        // into an unbounded unlock-and-retry loop. This client modelled the lease not
        // at all, so the try-lock reached the throw below — the third member of
        // F-PG-STUB-QUERY-TEXT-CLASS, stale by ABSENCE rather than by a stale branch.
        if (sql.includes("pg_try_advisory_lock")) return { rows: [{ acquired: true }] };
        if (sql.includes("run_private_content_is_live")) {
          // `assertLive` compares the row COUNT against the leased run ids and
          // requires every `live` to be true (packages/db/src/index.ts:377-384),
          // so the answer is tied to the run actually requested rather than to a
          // constant. Same shape as tests/unit/pro01-runner-tree.test.ts:207.
          return {
            rows: [{ run_id: String((values?.[0] as readonly string[])[0]), live: true }],
          };
        }
        if (sql.includes("pg_advisory_unlock")) return { rows: [{ unlocked: true }] };
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
          return { rows: [{ envelope_basis: S06_ENVELOPE_BASIS }] };
        }
        if (sql.includes("SELECT count(*)::text")) return { rows: [{ count: "0" }] };
        throw new Error(`UNEXPECTED_POOL_QUERY:${sql}`);
      },
    } as unknown as Pool;
    const transportFailure = new Error("private provider transport detail");
    const providerContexts: unknown[] = [];
    const captured = installRecordingEmitter();
    const fetchImplementation = vi.fn(async () => {
      providerContexts.push(getObsContext());
      throw transportFailure;
    });
    const gateway = createPostgresProviderGateway(pool, {
      endpoint: "http://127.0.0.1:1",
      model: "test/model",
      maker: "test-maker",
      fetchImplementation: fetchImplementation as unknown as typeof fetch,
    });

    let observed: unknown;
    try {
      await runWithObsContext(outer, () => gateway.call({
        runId: RUN_ID,
        subjectItemId: "550e8400-e29b-41d4-a716-446655440034",
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
    expect((observed as { cause?: unknown }).cause).toBe(transportFailure);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    const providerOccurrences = captured.filter((entry) => {
      const payload = entry.payload_ref;
      return typeof payload === "object"
        && payload !== null
        && "capture_point" in payload
        && payload.capture_point === "provider";
    });
    expect(providerOccurrences).toHaveLength(1);
    expect(providerOccurrences[0]).toMatchObject({
      kind: "envelope",
      payload_ref: {
        code: "PROVIDER_CALL_FAILED",
        taxonomy_class: "PROVIDER_EXHAUSTED",
        capture_point: "provider",
        disposition: "THROWN",
        source: "first_party",
        template_parameters: { attempt_count: 2 },
      },
      ambient_context_ref: expected,
    });
    expect(providerContexts).toHaveLength(2);
    for (const context of providerContexts) {
      expect(context === outer).toBe(false);
      expect(context).toEqual(expected);
      if ("zone_context" in expected) {
        expect(createSharedRedactor({
          environment: "test",
          build_ref: "UNTRACKED-DEV:s06-gateway",
          build_dirty: true,
          runtime: "runner",
          component: { process: "runner", package: "@debateai/runner" },
          writer_identity: "s06-gateway-test",
          redaction_policy_version: "g0",
          allowlist_set_id: "g0-empty-parameters",
        }).redact({
          kind: "envelope",
          payload_ref: {
            code: "JUDGEMENT_POLICY_UNRESOLVED",
            taxonomy_class: "JOB_FAILURE",
            capture_point: "provider",
            disposition: "THROWN",
            source: "first_party",
          },
          ambient_context_ref: context as CaptureQueueEntry["ambient_context_ref"],
        })).toMatchObject({
          zone_context: true,
          run_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
          work_item_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
          node_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
          attempt_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
          ledger_ref: "UNKNOWN:DECLARED_KIND_REQUIRED",
          at_seq_watermark: "UNKNOWN:DECLARED_KIND_REQUIRED",
        });
      }
    }
    expect(readCount()).toBe(0);
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
    // The stub's export set must match what apps/runner/src/main.ts actually
    // imports: ESM reports a missing binding at LINK time, before any module
    // in the graph evaluates, so one stale name silences the whole probe.
    // 2d1f86b8 rewrote that import list (`RunRepository` onto @debateai/db,
    // `createTerminalActivationEvaluator` onto @debateai/battery, and
    // loadBootstrapRegister/readClaimTypeCompositionMap off @debateai/register)
    // and this table stayed at the pre-2d1f86b8 shape.
    //
    // The install-first gate is re-keyed per s06-rework-1.md §7 (A3): the L2
    // addendum DELETED the unhandledRejection registration from all three
    // installers because it superseded Node's crash-on-rejection, and
    // tests/architecture/obs-l2-s05-import-graph.test.ts:423 now forbids it.
    // uncaughtExceptionMonitor already observes rejections and suppresses
    // nothing, so the property is keyed on it plus the exit sink — both
    // observed BEFORE @debateai/db evaluates, not by reading source text.
    const throwingDb = `data:text/javascript,${encodeURIComponent(`
export function configureContentEncryption() {}
export function createPool() {}
export class RunRepository {}
const uncaught = process.listenerCount("uncaughtExceptionMonitor");
const exitSink = process.listenerCount("exit");
if (uncaught < 1 || exitSink < 1) throw new Error("RUNNER_INSTALLER_NOT_FIRST");
throw new Error("DB_IMPORT_AFTER_RUNNER_INSTALL");`)} `;
    const loaderSource = `
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL?.endsWith("/apps/runner/src/main.ts")) {
    if (specifier === "@debateai/db") {
      return { url: ${JSON.stringify(throwingDb.trim())}, shortCircuit: true };
    }
    const stubs = {
      "@hatchet-dev/typescript-sdk": "export class Hatchet {}",
      "@debateai/crypto": "export class ContentCipher {} export class FileRunContentKeyStore {} export class FileUserDekStore {} export function loadKek() {}",
      "../../../packages/crypto/src/index.js": "export function loadKek() {}",
      "@debateai/battery": "export function createTerminalActivationEvaluator() {} export class WorkItemRepository {}",
      "@debateai/register": "export function loadRunnerEnvironment() {}",
      "@debateai/critique": "export function readDeploymentMakerCapability() {}",
      "@debateai/providers": "export function observeProviderTarget() {} export function parseProviderDiscoveryTargets() {}",
      "./index.js": "export function createPostgresProviderGateway() {} export function declareHatchetWalkingSkeletonTask() {} export class WalkingSkeletonRunner {}",
      "./provider-topology.js": "export function createRunnerProviderTopology() {}",
      "./dev-runner-policy.js": "export function readDevelopmentRunnerPolicy() {}",
      "./runner-startup-reconciliation.js": "export function reconcileRunnerStartupWork() {}",
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
    exitSink: process.listenerCount("exit"),
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
    const linkage = JSON.parse(result.stdout.trim()) as Readonly<{
      message: string;
      unhandled: number;
      uncaught: number;
      exitSink: number;
    }>;
    // Reaching DB_IMPORT_AFTER_RUNNER_INSTALL at all is the install-first
    // proof: the stub refuses with RUNNER_INSTALLER_NOT_FIRST unless both
    // boundary listeners are already on the process when @debateai/db
    // evaluates.
    expect(linkage.message).toBe("DB_IMPORT_AFTER_RUNNER_INSTALL");
    expect(linkage.uncaught).toBeGreaterThanOrEqual(1);
    expect(linkage.exitSink).toBeGreaterThanOrEqual(1);
    // The deleted registration stays deleted: a surviving process is never
    // acceptable evidence of capture on any boundary path.
    expect(linkage.unhandled).toBe(0);
  });
});
