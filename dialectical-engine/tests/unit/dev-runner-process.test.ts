import { describe, expect, it, vi } from "vitest";
import {
  DevelopmentRunnerProcessError,
  startDevelopmentRunnerProcess,
  type DevelopmentRunnerChild,
  type DevelopmentRunnerProcessOperations
} from "../../apps/runner/src/dev-runner-process.js";
import { DEVELOPMENT_CLI_CALL_TIMEOUT_MS } from "../../apps/runner/src/dev-provider-panel.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const DEV_RELEASE_KEY = ["r424242", "000000000000"].join("-");
// Row-level security S01 (PLAN S2.4, SPEC X1): the dev runner's own login, read from the credential file.
const RUNNER_DATABASE_URL = "postgresql://runner:opaque-runner@127.0.0.1:55432/debateai";

function apiEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze({
    PROVIDER_DISCOVERY_TARGETS_JSON: TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson,
    // The dev API's own value (dev-api-environment.ts): the CLI call timeout.
    PROVIDER_PROBE_TIMEOUT_MS: String(DEVELOPMENT_CLI_CALL_TIMEOUT_MS),
    REGISTER_VERSION: "424242",
    // Side-by-side §1: the dev API's own release key (dev-api-environment.ts derives r<REGISTER_VERSION>-000000000000).
    RELEASE_KEY: DEV_RELEASE_KEY,
    REGISTER_DEPLOYMENT_RECEIPT_SHA256: "a".repeat(64),
    REGISTER_DEPLOYMENT_RECEIPT_FILE: "/workspace/.local/dev-auth/deployment-register-receipt.v1.json",
    KEK_PATH: "/private/dev/kek.bin",
    DATABASE_URL: "postgresql://runtime:opaque@127.0.0.1:55432/debateai",
    CONTENT_ENCRYPTION_ENABLED: "true",
    USER_DEK_STORE_PATH: "/private/dev/user-deks",
    HATCHET_CLIENT_TOKEN: "opaque-token",
    HATCHET_HOST_PORT: "127.0.0.1:7077",
    HATCHET_API_URL: "http://127.0.0.1:8888",
    HATCHET_TENANT_ID: "00000000-0000-4000-8000-000000000001",
    HATCHET_WORKFLOW_NAME: "debateai-dev",
    HATCHET_TLS_STRATEGY: "none"
  });
}

function operations(input: Readonly<{
  ready?: unknown;
  exitFirst?: boolean;
  startError?: Error;
  apiEnvironment?: Readonly<Record<string, string>>;
  runnerDatabaseUrl?: string;
}> = {}): DevelopmentRunnerProcessOperations & Readonly<{
  terminate: ReturnType<typeof vi.fn>;
  environment: Readonly<Record<string, string>>[];
}> {
  const ready = deferred<unknown>();
  const exited = deferred<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>();
  const terminate = vi.fn(async () => {
    exited.resolve(Object.freeze({ code: 0, signal: null }));
  });
  const environment: Readonly<Record<string, string>>[] = [];
  const child: DevelopmentRunnerChild = Object.freeze({
    ready: ready.promise,
    exited: exited.promise,
    terminate
  });
  return {
    terminate,
    environment,
    loadApiEnvironment: vi.fn(async () => input.apiEnvironment ?? apiEnvironment()),
    loadRunnerDatabaseUrl: vi.fn(async () => input.runnerDatabaseUrl ?? RUNNER_DATABASE_URL),
    startRunner: vi.fn((values) => {
      if (input.startError !== undefined) throw input.startError;
      environment.push(values);
      if (input.exitFirst === true) {
        exited.resolve(Object.freeze({ code: 1, signal: null }));
      } else {
        // A well-behaved runner announces the release it was handed (side-by-side spec §1).
        ready.resolve(input.ready ?? Object.freeze({
          kind: "DEBATEAI_RUNNER_READY",
          worker: "debateai-dev-runner",
          registerVersion: "424242",
          releaseKey: values.RELEASE_KEY
        }));
      }
      return child;
    })
  };
}

describe("development runner process lifecycle", () => {
  it("accepts only the exact readiness receipt and passes a bounded explicit environment", async () => {
    const runtime = operations();
    const runner = await startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace",
      commandEnvironment: Object.freeze({ PATH: "/usr/bin" }),
      operations: runtime
    });
    expect(runner.receipt).toEqual({
      worker: "debateai-dev-runner",
      registerVersion: "424242",
      state: "REGISTERED"
    });
    expect(runtime.environment).toHaveLength(1);
    expect(runtime.environment[0]).toMatchObject({
      PROVIDER_REF: "development:codex-cli",
      VLLM_BASE_URL: "http://127.0.0.1:8791/v1",
      VLLM_MODEL: "gpt-test-real",
      VLLM_MAKER: "OpenAI",
      VLLM_AUTHORIZATION: "Bearer test-codex",
      HATCHET_WORKER_NAME: "debateai-dev-runner",
      REGISTER_VERSION: "424242",
      REGISTER_DEPLOYMENT_RECEIPT_SHA256: "a".repeat(64),
      REGISTER_DEPLOYMENT_RECEIPT_FILE: "/workspace/.local/dev-auth/deployment-register-receipt.v1.json"
    });
    await Promise.all([runner.stop(), runner.stop()]);
    expect(runtime.terminate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["wrong kind", { kind: "WRONG", worker: "debateai-dev-runner", registerVersion: "424242", releaseKey: DEV_RELEASE_KEY }],
    ["wrong worker", { kind: "DEBATEAI_RUNNER_READY", worker: "wrong", registerVersion: "424242", releaseKey: DEV_RELEASE_KEY }],
    ["numeric reconstruction", { kind: "DEBATEAI_RUNNER_READY", worker: "debateai-dev-runner", registerVersion: 424242, releaseKey: DEV_RELEASE_KEY }],
    ["wrong register", { kind: "DEBATEAI_RUNNER_READY", worker: "debateai-dev-runner", registerVersion: "999", releaseKey: DEV_RELEASE_KEY }],
    // Side-by-side spec §1: the ready line names the release, and it must be the API's own.
    ["a missing releaseKey", { kind: "DEBATEAI_RUNNER_READY", worker: "debateai-dev-runner", registerVersion: "424242" }],
    ["another release's key", { kind: "DEBATEAI_RUNNER_READY", worker: "debateai-dev-runner", registerVersion: "424242", releaseKey: ["r4", "0123456789ab"].join("-") }]
  ] as const)("terminates on %s readiness", async (_label, ready) => {
    const runtime = operations({ ready });
    await expect(startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    })).rejects.toThrow("DEV_RUNNER_PROCESS_READINESS_INVALID");
    expect(runtime.terminate).toHaveBeenCalledTimes(1);
  });

  it("terminates and refuses when the child exits before readiness", async () => {
    const runtime = operations({ exitFirst: true });
    await expect(startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    })).rejects.toThrow("DEV_RUNNER_PROCESS_EXITED");
    expect(runtime.terminate).toHaveBeenCalledTimes(1);
  });

  it("wraps a synchronous spawn failure without claiming readiness", async () => {
    const runtime = operations({ startError: new Error("sensitive spawn detail") });
    await expect(startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    })).rejects.toThrow("DEV_RUNNER_PROCESS_START_FAILED");
    expect(runtime.terminate).not.toHaveBeenCalled();
  });

  it("S2.4-b the dev runner's DATABASE_URL is RUNNER_DATABASE_URL, never the API's DATABASE_URL", async () => {
    const runtime = operations();
    const runner = await startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: { DATABASE_URL: "postgresql://ambient@127.0.0.1/x" }, operations: runtime
    });
    expect(runtime.loadRunnerDatabaseUrl).toHaveBeenCalledWith("/workspace");
    expect(runtime.environment[0]?.DATABASE_URL).toBe(RUNNER_DATABASE_URL);
    expect(runtime.environment[0]?.DATABASE_URL).not.toBe(apiEnvironment().DATABASE_URL);
    await runner.stop();
    // A credential file that hands the runner the API's own login is refused before spawning.
    const shared = operations({ runnerDatabaseUrl: apiEnvironment().DATABASE_URL! });
    await expect(startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: shared
    })).rejects.toThrow("DEV_RUNNER_PROCESS_ENVIRONMENT_INVALID");
    expect(shared.environment).toEqual([]);
  });

  it("refuses a dropped deployment receipt before spawning", async () => {
    const { REGISTER_DEPLOYMENT_RECEIPT_SHA256: _dropped, ...withoutReceipt } = apiEnvironment();
    const runtime = operations({ apiEnvironment: withoutReceipt });
    await expect(startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    })).rejects.toThrow("DEV_RUNNER_PROCESS_ENVIRONMENT_INVALID");
    expect(runtime.environment).toEqual([]);
  });

  // Side-by-side uploads spec 2026-10-21 §1: the dev runner runs as the dev API's own release, never as a key it made up.
  it("forwards the API's RELEASE_KEY to the runner", async () => {
    const runtime = operations({ apiEnvironment: { ...apiEnvironment(), RELEASE_KEY: ["r4", "000000000000"].join("-") } });
    const runner = await startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    });
    expect(runtime.environment[0]?.RELEASE_KEY).toBe(["r4", "000000000000"].join("-"));
    await runner.stop();
  });

  it("refuses an API environment without RELEASE_KEY", async () => {
    const { RELEASE_KEY: _dropped, ...withoutKey } = apiEnvironment();
    const runtime = operations({ apiEnvironment: withoutKey });
    const refusal = startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    });
    await expect(refusal).rejects.toBeInstanceOf(DevelopmentRunnerProcessError);
    await expect(refusal).rejects.toThrow("DEV_RUNNER_PROCESS_ENVIRONMENT_INVALID");
    expect(runtime.environment).toEqual([]);
  });
  /**
   * FIX-HS1-probe-timeout (hate-speech TEST rehearsal 2, runs 20acc13d and
   * d85fb35d): the runner re-probes each panel member at claim time with
   * PROVIDER_PROBE_TIMEOUT_MS, but this builder never forwarded it, so the
   * schema default (5 s) applied while the API probed with 180 s. The CLIs
   * answered after the runner had given up: RUN_DISCOVERED_PANEL_EMPTY_AT_CLAIM.
   * The CLASS: a value the dev API and the dev runner both read, where the
   * runner's copy is not forwarded and falls back to a different default.
   */
  it("forwards the API's provider probe timeout, so the claim-time probe waits as long as the API's", async () => {
    const runtime = operations();
    const runner = await startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    });
    expect(runtime.environment[0]?.PROVIDER_PROBE_TIMEOUT_MS).toBe(apiEnvironment().PROVIDER_PROBE_TIMEOUT_MS);
    expect(runtime.environment[0]?.PROVIDER_PROBE_TIMEOUT_MS).toBe("180000");
    await runner.stop();
  });

  it("the API's value wins over a probe timeout the command environment carries", async () => {
    const runtime = operations();
    const runner = await startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: { PROVIDER_PROBE_TIMEOUT_MS: "5000" }, operations: runtime
    });
    expect(runtime.environment[0]?.PROVIDER_PROBE_TIMEOUT_MS).toBe("180000");
    await runner.stop();
  });

  it("when the API carries no probe timeout, the runner carries none either: both read the same schema default", async () => {
    const { PROVIDER_PROBE_TIMEOUT_MS: _dropped, ...withoutTimeout } = apiEnvironment();
    const runtime = operations({ apiEnvironment: withoutTimeout });
    const runner = await startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    });
    expect(runtime.environment[0]).not.toHaveProperty("PROVIDER_PROBE_TIMEOUT_MS");
    await runner.stop();
  });

  it("the class sweep: every value the API and the runner both read reaches the runner equal to the API's", async () => {
    const runtime = operations();
    const runner = await startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    });
    const forwarded = runtime.environment[0]!;
    const api = apiEnvironment();
    // Row-level security S01 (Ruling R-12 F-C2-3; SPEC-v4 X1): DATABASE_URL is the one value the runner reads on its own
    // login (RUNNER_DATABASE_URL), never the API's, so this sweep skips it and S2.4-b pins it.
    for (const key of [
      "KEK_PATH", "REGISTER_VERSION", "RELEASE_KEY", "REGISTER_DEPLOYMENT_RECEIPT_SHA256",
      "REGISTER_DEPLOYMENT_RECEIPT_FILE", "CONTENT_ENCRYPTION_ENABLED", "USER_DEK_STORE_PATH",
      "PROVIDER_DISCOVERY_TARGETS_JSON", "PROVIDER_PROBE_TIMEOUT_MS",
      "HATCHET_CLIENT_TOKEN", "HATCHET_HOST_PORT", "HATCHET_API_URL", "HATCHET_TENANT_ID",
      "HATCHET_WORKFLOW_NAME", "HATCHET_TLS_STRATEGY"
    ]) {
      expect(forwarded[key], key).toBe(api[key]);
    }
    await runner.stop();
  });
});
