import { describe, expect, it, vi } from "vitest";
import {
  startDevelopmentRunnerProcess,
  type DevelopmentRunnerChild,
  type DevelopmentRunnerProcessOperations
} from "../../apps/runner/src/dev-runner-process.js";
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
    PROVIDER_PROBE_TIMEOUT_MS: "180000",
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
      repositoryRoot: process.cwd(),
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
      PROVIDER_REF: "development:codex-premium-cli",
      VLLM_BASE_URL: "http://127.0.0.1:8795/v1",
      VLLM_MODEL: "gpt-5.6-sol",
      VLLM_MAKER: "OpenAI",
      VLLM_AUTHORIZATION: "test-codex-relay-header",
      HATCHET_WORKER_NAME: "debateai-dev-runner",
      // The claim-time probe waits as long as the API's ask-time probe; the
      // runtime default (5 s) refused every Codex-synthesized run at claim.
      PROVIDER_PROBE_TIMEOUT_MS: "180000",
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
      repositoryRoot: process.cwd(), commandEnvironment: {}, operations: runtime
    })).rejects.toThrow("DEV_RUNNER_PROCESS_READINESS_INVALID");
    expect(runtime.terminate).toHaveBeenCalledTimes(1);
  });

  it("terminates and refuses when the child exits before readiness", async () => {
    const runtime = operations({ exitFirst: true });
    await expect(startDevelopmentRunnerProcess({
      repositoryRoot: process.cwd(), commandEnvironment: {}, operations: runtime
    })).rejects.toThrow("DEV_RUNNER_PROCESS_EXITED");
    expect(runtime.terminate).toHaveBeenCalledTimes(1);
  });

  it("wraps a synchronous spawn failure without claiming readiness", async () => {
    const runtime = operations({ startError: new Error("sensitive spawn detail") });
    await expect(startDevelopmentRunnerProcess({
      repositoryRoot: process.cwd(), commandEnvironment: {}, operations: runtime
    })).rejects.toThrow("DEV_RUNNER_PROCESS_START_FAILED");
    expect(runtime.terminate).not.toHaveBeenCalled();
  });

  it("refuses a dropped deployment receipt before spawning", async () => {
    const { REGISTER_DEPLOYMENT_RECEIPT_SHA256: _dropped, ...withoutReceipt } = apiEnvironment();
    const runtime = operations({ apiEnvironment: withoutReceipt });
    await expect(startDevelopmentRunnerProcess({
      repositoryRoot: process.cwd(), commandEnvironment: {}, operations: runtime
    })).rejects.toThrow("DEV_RUNNER_PROCESS_START_FAILED");
    expect(runtime.environment).toEqual([]);
  });
});
