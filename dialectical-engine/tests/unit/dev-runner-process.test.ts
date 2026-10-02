import { describe, expect, it, vi } from "vitest";
import {
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

function apiEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze({
    PROVIDER_DISCOVERY_TARGETS_JSON: TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson,
    // The dev API's own value (dev-api-environment.ts): the CLI call timeout.
    PROVIDER_PROBE_TIMEOUT_MS: String(DEVELOPMENT_CLI_CALL_TIMEOUT_MS),
    REGISTER_VERSION: "424242",
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
    startRunner: vi.fn((values) => {
      if (input.startError !== undefined) throw input.startError;
      environment.push(values);
      if (input.exitFirst === true) {
        exited.resolve(Object.freeze({ code: 1, signal: null }));
      } else {
        ready.resolve(input.ready ?? Object.freeze({
          kind: "DEBATEAI_RUNNER_READY",
          worker: "debateai-dev-runner",
          registerVersion: "424242"
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
    ["wrong kind", { kind: "WRONG", worker: "debateai-dev-runner", registerVersion: "424242" }],
    ["wrong worker", { kind: "DEBATEAI_RUNNER_READY", worker: "wrong", registerVersion: "424242" }],
    ["numeric reconstruction", { kind: "DEBATEAI_RUNNER_READY", worker: "debateai-dev-runner", registerVersion: 424242 }],
    ["wrong register", { kind: "DEBATEAI_RUNNER_READY", worker: "debateai-dev-runner", registerVersion: "999" }]
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

  it("refuses a dropped deployment receipt before spawning", async () => {
    const { REGISTER_DEPLOYMENT_RECEIPT_SHA256: _dropped, ...withoutReceipt } = apiEnvironment();
    const runtime = operations({ apiEnvironment: withoutReceipt });
    await expect(startDevelopmentRunnerProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    })).rejects.toThrow("DEV_RUNNER_PROCESS_START_FAILED");
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
    for (const key of [
      "KEK_PATH", "DATABASE_URL", "REGISTER_VERSION", "REGISTER_DEPLOYMENT_RECEIPT_SHA256",
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
