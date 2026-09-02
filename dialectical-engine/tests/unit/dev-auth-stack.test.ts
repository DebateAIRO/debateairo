import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  developmentAuthStackErrorCode,
  superviseDevelopmentAuthStack,
  startDevelopmentAuthStack,
  type DevelopmentAuthStackOperations
} from "../../apps/runner/src/dev-auth-stack.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";

type Exit = Readonly<{ code: number | null; signal: NodeJS.Signals | null }>;

function deferredExit() {
  let resolveExit!: (exit: Exit) => void;
  const exited = new Promise<Exit>((resolve) => { resolveExit = resolve; });
  return { exited, resolveExit };
}

function operations(input: Readonly<{
  occupied?: boolean;
  failAt?: "provider_panel" | "data" | "token" | "environment" | "api" | "runner" | "ui" | "tls";
}> = {}): DevelopmentAuthStackOperations & Readonly<{
  calls: string[];
  apiExit: ReturnType<typeof deferredExit>;
  uiExit: ReturnType<typeof deferredExit>;
  runnerExit: ReturnType<typeof deferredExit>;
}> {
  const calls: string[] = [];
  const apiExit = deferredExit();
  const uiExit = deferredExit();
  const runnerExit = deferredExit();
  const fail = (stage: NonNullable<typeof input.failAt>) => {
    if (input.failAt === stage) throw new Error(`sensitive ${stage} failure`);
  };
  return {
    calls,
    apiExit,
    uiExit,
    runnerExit,
    isPublicPortOccupied: vi.fn(async () => {
      calls.push("preflight");
      return input.occupied ?? false;
    }),
    startProviderPanel: vi.fn(async () => {
      calls.push("providers:start");
      fail("provider_panel");
      return Object.freeze({
        panel: TEST_DEVELOPMENT_PROVIDER_PANEL,
        healthyProviderRefs: TEST_DEVELOPMENT_PROVIDER_PANEL.healthyProviderRefs,
        stop: vi.fn(async () => { calls.push("providers:stop"); })
      });
    }),
    startDataPlane: vi.fn(async () => {
      calls.push("data:start");
      fail("data");
      return Object.freeze({
        receipt: Object.freeze({ mailCapture: "ATTESTED" as const }),
        stop: vi.fn(async () => { calls.push("data:stop"); })
      });
    }),
    provisionHatchetToken: vi.fn(async () => {
      calls.push("token");
      fail("token");
    }),
    assembleApiEnvironment: vi.fn(async () => {
      calls.push("environment");
      fail("environment");
    }),
    startApi: vi.fn(async () => {
      calls.push("api:start");
      fail("api");
      return Object.freeze({
        exited: apiExit.exited,
        stop: vi.fn(async () => { calls.push("api:stop"); })
      });
    }),
    startRunner: vi.fn(async () => {
      calls.push("runner:start");
      fail("runner");
      return Object.freeze({
        exited: runnerExit.exited,
        stop: vi.fn(async () => { calls.push("runner:stop"); })
      });
    }),
    startUi: vi.fn(async () => {
      calls.push("ui:start");
      fail("ui");
      return Object.freeze({
        exited: uiExit.exited,
        stop: vi.fn(async () => { calls.push("ui:stop"); })
      });
    }),
    startTls: vi.fn(async () => {
      calls.push("tls:start");
      fail("tls");
      return Object.freeze({ stop: vi.fn(async () => { calls.push("tls:stop"); }) });
    })
  };
}

describe("DEV-10F bounded local auth stack supervisor", () => {
  it("reports only bounded DEV error codes from nested stage failures", () => {
    expect(developmentAuthStackErrorCode(new Error("DEV_AUTH_STACK_TLS_FAILED", {
      cause: new Error("DEV_TLS_PUBLIC_READINESS_INVALID", {
        cause: new Error("sensitive certificate path")
      })
    }))).toBe("DEV_AUTH_STACK_TLS_FAILED:DEV_TLS_PUBLIC_READINESS_INVALID");
  });
  it("starts the exact attested chain and stops owned resources once in reverse order", async () => {
    const runtime = operations();
    const stack = await startDevelopmentAuthStack(runtime);

    expect(stack.receipt).toEqual({
      origin: "https://localhost:3000",
      dataPlane: "ATTESTED",
      mail: "CAPTURED",
      api: "DENY_DEFAULT",
      ui: "DENY_DEFAULT_PROXY",
      tls: "SYSTEM_TRUST",
      providers: "CLI_HANDSHAKE",
      healthyProviderRefs: ["development:codex-cli", "development:claude-cli"],
      runner: "REGISTERED"
    });
    expect(runtime.calls).toEqual([
      "preflight", "providers:start", "data:start", "token", "environment",
      "api:start", "runner:start", "ui:start", "tls:start"
    ]);
    expect(runtime.startDataPlane).toHaveBeenCalledWith(TEST_DEVELOPMENT_PROVIDER_PANEL);
    expect(runtime.assembleApiEnvironment).toHaveBeenCalledWith(TEST_DEVELOPMENT_PROVIDER_PANEL);

    await Promise.all([stack.stop(), stack.stop()]);
    await stack.stop();
    expect(runtime.calls).toEqual([
      "preflight", "providers:start", "data:start", "token", "environment",
      "api:start", "runner:start", "ui:start", "tls:start",
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "data:stop", "providers:stop"
    ]);
  });

  it("refuses an occupied public port before creating any resource", async () => {
    const runtime = operations({ occupied: true });
    await expect(startDevelopmentAuthStack(runtime))
      .rejects.toThrow("DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED");
    expect(runtime.calls).toEqual(["preflight"]);
  });

  it.each([
    ["provider_panel", ["preflight", "providers:start"]],
    ["data", ["preflight", "providers:start", "data:start", "providers:stop"]],
    ["token", ["preflight", "providers:start", "data:start", "token", "data:stop", "providers:stop"]],
    ["environment", ["preflight", "providers:start", "data:start", "token", "environment", "data:stop", "providers:stop"]],
    ["api", ["preflight", "providers:start", "data:start", "token", "environment", "api:start", "data:stop", "providers:stop"]],
    ["runner", ["preflight", "providers:start", "data:start", "token", "environment", "api:start", "runner:start", "api:stop", "data:stop", "providers:stop"]],
    ["ui", ["preflight", "providers:start", "data:start", "token", "environment", "api:start", "runner:start", "ui:start", "runner:stop", "api:stop", "data:stop", "providers:stop"]],
    ["tls", ["preflight", "providers:start", "data:start", "token", "environment", "api:start", "runner:start", "ui:start", "tls:start", "ui:stop", "runner:stop", "api:stop", "data:stop", "providers:stop"]]
  ] as const)("unwinds only the started prefix when %s fails", async (failAt, expected) => {
    const runtime = operations({ failAt });
    await expect(startDevelopmentAuthStack(runtime))
      .rejects.toThrow(`DEV_AUTH_STACK_${failAt.toUpperCase()}_FAILED`);
    expect(runtime.calls).toEqual(expected);
    expect(runtime.calls.join("\n")).not.toContain("sensitive");
  });

  it("reports every owned process exit so the CLI can unwind the full stack", async () => {
    const apiRuntime = operations();
    const apiStack = await startDevelopmentAuthStack(apiRuntime);
    apiRuntime.apiExit.resolveExit({ code: 1, signal: null });
    await expect(apiStack.exited).resolves.toEqual({
      component: "API",
      exit: { code: 1, signal: null }
    });
    await apiStack.stop();

    const uiRuntime = operations();
    const uiStack = await startDevelopmentAuthStack(uiRuntime);
    uiRuntime.uiExit.resolveExit({ code: null, signal: "SIGTERM" });
    await expect(uiStack.exited).resolves.toEqual({
      component: "UI",
      exit: { code: null, signal: "SIGTERM" }
    });
    await uiStack.stop();

    const runnerRuntime = operations();
    const runnerStack = await startDevelopmentAuthStack(runnerRuntime);
    runnerRuntime.runnerExit.resolveExit({ code: null, signal: "SIGKILL" });
    await expect(runnerStack.exited).resolves.toEqual({
      component: "RUNNER",
      exit: { code: null, signal: "SIGKILL" }
    });
    await runnerStack.stop();
  });

  it("always stops the stack on signal, exact child exit, or runtime-promise failure", async () => {
    const signalRuntime = operations();
    const signalStack = await startDevelopmentAuthStack(signalRuntime);
    await expect(superviseDevelopmentAuthStack(signalStack, Promise.resolve("SIGTERM")))
      .resolves.toBeUndefined();
    expect(signalRuntime.calls.slice(-6)).toEqual([
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "data:stop", "providers:stop"
    ]);

    const exitRuntime = operations();
    const exitStack = await startDevelopmentAuthStack(exitRuntime);
    const exited = superviseDevelopmentAuthStack(exitStack, new Promise(() => undefined));
    exitRuntime.apiExit.resolveExit({ code: 1, signal: null });
    await expect(exited).rejects.toThrow("DEV_AUTH_STACK_API_EXITED");
    expect(exitRuntime.calls.slice(-6)).toEqual([
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "data:stop", "providers:stop"
    ]);

    const stop = vi.fn(async () => undefined);
    await expect(superviseDevelopmentAuthStack({
      receipt: exitStack.receipt,
      exited: Promise.reject(new Error("sensitive child transport failure")),
      stop
    }, new Promise(() => undefined))).rejects.toThrow("DEV_AUTH_STACK_RUNTIME_FAILED");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("bounds every owned stop so one hung service cannot orphan the rest (L7-F1)", async () => {
    const base = operations();
    const stack = await startDevelopmentAuthStack({
      ...base,
      startTls: vi.fn(async () => {
        base.calls.push("tls:start");
        return Object.freeze({ stop: vi.fn(() => new Promise<void>(() => undefined)) });
      })
    }, 50);

    await expect(stack.stop()).rejects.toThrow("DEV_AUTH_STACK_STOP_TIMEOUT");
    expect(base.calls).toContain("ui:stop");
    expect(base.calls).toContain("runner:stop");
    expect(base.calls).toContain("api:stop");
    expect(base.calls).toContain("data:stop");
    expect(base.calls).toContain("providers:stop");
  });

  it("exposes one fixed CLI, owns the runner, and never starts a substitute provider", async () => {
    const [packageSource, source, cli] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("apps/runner/src/dev-auth-stack.ts", "utf8"),
      readFile("apps/runner/src/dev-auth-stack-cli.ts", "utf8")
    ]);
    const scripts = JSON.parse(packageSource).scripts as Record<string, string>;
    expect(scripts["dev:auth:up"]).toBe("tsx apps/runner/src/dev-auth-stack-cli.ts");
    expect(source).toContain("startDevelopmentAuthDataPlane");
    expect(source).toContain("startAttestedDevTlsFrontDoor");
    expect(source).toContain("startDevelopmentRunnerProcess");
    expect(source).toContain("startDevelopmentCliProviderPanel");
    expect(source).not.toMatch(/dev-local-provider|qa-deterministic/iu);
    expect(source).not.toMatch(/mkcert\s+-install|seedAccount/iu);
    expect(source).not.toContain("process.env");
    expect(cli).toContain("DEV_AUTH_STACK_READY=https://localhost:3000:RUNNER_REGISTERED");
    expect(cli).toContain("process.on(\"uncaughtException\"");
    expect(cli).toContain("process.on(\"unhandledRejection\"");
    expect(cli).not.toContain("process.once(\"SIGINT\"");
    expect(cli).toContain("runtimeFault.dispose()");
  });

});
