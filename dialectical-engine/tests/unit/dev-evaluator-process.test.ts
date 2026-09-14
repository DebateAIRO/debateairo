import { describe, expect, it, vi } from "vitest";
import {
  startDevelopmentEvaluatorProcess,
  type DevelopmentEvaluatorChild,
  type DevelopmentEvaluatorProcessOperations
} from "../../apps/runner/src/dev-evaluator-process.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return { promise, resolve };
}

function apiEnvironment(): Readonly<Record<string, string>> {
  return Object.freeze({
    EVALUATOR_DATABASE_URL:
      "postgresql://debateai_dev_evaluator_worker:opaque@127.0.0.1:55432/debateai",
    REGISTER_VERSION: "424242",
    DATABASE_URL: "postgresql://debateai_dev_runtime:secret@127.0.0.1:55432/debateai",
    KEK_PATH: "/private/dev/kek.bin",
    HATCHET_CLIENT_TOKEN: "secret-token"
  });
}

function operations(input: Readonly<{
  ready?: unknown;
  exitFirst?: boolean;
  startError?: Error;
  apiEnvironment?: Readonly<Record<string, string>>;
}> = {}): DevelopmentEvaluatorProcessOperations & Readonly<{
  terminate: ReturnType<typeof vi.fn>;
  environment: Readonly<Record<string, string>>[];
}> {
  const ready = deferred<unknown>();
  const exited = deferred<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>>();
  const terminate = vi.fn(async () => {
    exited.resolve(Object.freeze({ code: 0, signal: "SIGTERM" }));
  });
  const environment: Readonly<Record<string, string>>[] = [];
  const child: DevelopmentEvaluatorChild = Object.freeze({
    ready: ready.promise,
    exited: exited.promise,
    terminate
  });
  return {
    terminate,
    environment,
    loadApiEnvironment: vi.fn(async () => input.apiEnvironment ?? apiEnvironment()),
    startEvaluator: vi.fn((values) => {
      if (input.startError !== undefined) throw input.startError;
      environment.push(values);
      if (input.exitFirst === true) {
        exited.resolve(Object.freeze({ code: 1, signal: null }));
      } else {
        ready.resolve(input.ready ?? Object.freeze({ kind: "DEBATEAI_EVALUATOR_READY" }));
      }
      return child;
    })
  };
}

describe("development evaluator process lifecycle", () => {
  it("accepts exact readiness and passes only the bounded evaluator environment", async () => {
    const runtime = operations();
    const evaluator = await startDevelopmentEvaluatorProcess({
      repositoryRoot: "/workspace",
      commandEnvironment: Object.freeze({
        PATH: "/usr/bin",
        HOME: "/private/home",
        TMPDIR: "/private/tmp",
        AWS_SECRET_ACCESS_KEY: "must-not-pass",
        DATABASE_URL: "must-not-pass"
      }),
      operations: runtime
    });

    expect(evaluator.receipt).toEqual({ state: "READY", registerVersion: "424242" });
    expect(runtime.environment).toEqual([{
      PATH: "/usr/bin",
      HOME: "/private/home",
      TMPDIR: "/private/tmp",
      EVALUATOR_DATABASE_URL:
        "postgresql://debateai_dev_evaluator_worker:opaque@127.0.0.1:55432/debateai",
      REGISTER_VERSION: "424242"
    }]);
    await Promise.all([evaluator.stop(), evaluator.stop()]);
    expect(runtime.terminate).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["wrong kind", { kind: "WRONG" }],
    ["missing receipt", null],
    ["additional receipt data", { kind: "DEBATEAI_EVALUATOR_READY", registerVersion: "424242" }]
  ] as const)("terminates on %s readiness", async (_label, ready) => {
    const runtime = operations({ ready });
    await expect(startDevelopmentEvaluatorProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
    })).rejects.toThrow("DEV_EVALUATOR_PROCESS_READINESS_INVALID");
    expect(runtime.terminate).toHaveBeenCalledTimes(1);
  });

  it("refuses missing or aliased evaluator credentials before spawning", async () => {
    for (const environment of [
      { REGISTER_VERSION: "424242" },
      {
        REGISTER_VERSION: "424242",
        EVALUATOR_DATABASE_URL:
          "postgresql://debateai_dev_runtime:opaque@127.0.0.1:55432/debateai"
      }
    ]) {
      const runtime = operations({ apiEnvironment: environment });
      await expect(startDevelopmentEvaluatorProcess({
        repositoryRoot: "/workspace", commandEnvironment: {}, operations: runtime
      })).rejects.toThrow("DEV_EVALUATOR_PROCESS_START_FAILED");
      expect(runtime.environment).toEqual([]);
    }
  });

  it("terminates an early exit and wraps synchronous spawn failure", async () => {
    const exited = operations({ exitFirst: true });
    await expect(startDevelopmentEvaluatorProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: exited
    })).rejects.toThrow("DEV_EVALUATOR_PROCESS_EXITED");
    expect(exited.terminate).toHaveBeenCalledTimes(1);

    const failed = operations({ startError: new Error("sensitive spawn detail") });
    await expect(startDevelopmentEvaluatorProcess({
      repositoryRoot: "/workspace", commandEnvironment: {}, operations: failed
    })).rejects.toThrow("DEV_EVALUATOR_PROCESS_START_FAILED");
    expect(failed.terminate).not.toHaveBeenCalled();
  });
});
