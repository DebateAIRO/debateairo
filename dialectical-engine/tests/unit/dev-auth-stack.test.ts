import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  developmentAuthStackErrorCode,
  superviseDevelopmentAuthStack,
  startDevelopmentAuthStack,
  type DevelopmentAuthStackOperations
} from "../../apps/runner/src/dev-auth-stack.js";
import {
  renderDevelopmentProviderContent,
  startDevelopmentLocalProvider
} from "../../apps/runner/src/dev-local-provider.js";

type Exit = Readonly<{ code: number | null; signal: NodeJS.Signals | null }>;

function deferredExit() {
  let resolveExit!: (exit: Exit) => void;
  const exited = new Promise<Exit>((resolve) => { resolveExit = resolve; });
  return { exited, resolveExit };
}

function operations(input: Readonly<{
  occupied?: boolean;
  failAt?: "data" | "token" | "environment" | "provider" | "api" | "runner" | "ui" | "tls";
  providerReceipt?: Readonly<{ host: string; port: number; model: string }>;
}> = {}): DevelopmentAuthStackOperations & Readonly<{
  calls: string[];
  apiExit: ReturnType<typeof deferredExit>;
  uiExit: ReturnType<typeof deferredExit>;
  providerExit: ReturnType<typeof deferredExit>;
  runnerExit: ReturnType<typeof deferredExit>;
}> {
  const calls: string[] = [];
  const apiExit = deferredExit();
  const uiExit = deferredExit();
  const providerExit = deferredExit();
  const runnerExit = deferredExit();
  const fail = (stage: NonNullable<typeof input.failAt>) => {
    if (input.failAt === stage) throw new Error(`sensitive ${stage} failure`);
  };
  return {
    calls,
    apiExit,
    uiExit,
    providerExit,
    runnerExit,
    isPublicPortOccupied: vi.fn(async () => {
      calls.push("preflight");
      return input.occupied ?? false;
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
    startProvider: vi.fn(async () => {
      calls.push("provider:start");
      fail("provider");
      return Object.freeze({
        receipt: input.providerReceipt ?? Object.freeze({
          host: "127.0.0.1", port: 8_791, model: "qa-deterministic-v1"
        }),
        exited: providerExit.exited,
        stop: vi.fn(async () => { calls.push("provider:stop"); })
      });
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
      provider: "OPENAI_COMPATIBLE",
      runner: "REGISTERED"
    });
    expect(runtime.calls).toEqual([
      "preflight", "data:start", "token", "environment",
      "provider:start", "api:start", "runner:start", "ui:start", "tls:start"
    ]);

    await Promise.all([stack.stop(), stack.stop()]);
    await stack.stop();
    expect(runtime.calls).toEqual([
      "preflight", "data:start", "token", "environment",
      "provider:start", "api:start", "runner:start", "ui:start", "tls:start",
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "provider:stop", "data:stop"
    ]);
  });

  it("refuses an occupied public port before creating any resource", async () => {
    const runtime = operations({ occupied: true });
    await expect(startDevelopmentAuthStack(runtime))
      .rejects.toThrow("DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED");
    expect(runtime.calls).toEqual(["preflight"]);
  });

  it("refuses a provider receipt that cannot match the assembled API target", async () => {
    const runtime = operations({
      providerReceipt: { host: "127.0.0.1", port: 8_792, model: "wrong-model" }
    });
    await expect(startDevelopmentAuthStack(runtime))
      .rejects.toThrow("DEV_AUTH_STACK_PROVIDER_RECEIPT_INVALID");
    expect(runtime.calls).toEqual([
      "preflight", "data:start", "token", "environment",
      "provider:start", "provider:stop", "data:stop"
    ]);
  });

  it.each([
    ["data", ["preflight", "data:start"]],
    ["token", ["preflight", "data:start", "token", "data:stop"]],
    ["environment", ["preflight", "data:start", "token", "environment", "data:stop"]],
    ["provider", ["preflight", "data:start", "token", "environment", "provider:start", "data:stop"]],
    ["api", ["preflight", "data:start", "token", "environment", "provider:start", "api:start", "provider:stop", "data:stop"]],
    ["runner", ["preflight", "data:start", "token", "environment", "provider:start", "api:start", "runner:start", "api:stop", "provider:stop", "data:stop"]],
    ["ui", ["preflight", "data:start", "token", "environment", "provider:start", "api:start", "runner:start", "ui:start", "runner:stop", "api:stop", "provider:stop", "data:stop"]],
    ["tls", ["preflight", "data:start", "token", "environment", "provider:start", "api:start", "runner:start", "ui:start", "tls:start", "ui:stop", "runner:stop", "api:stop", "provider:stop", "data:stop"]]
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

    const providerRuntime = operations();
    const providerStack = await startDevelopmentAuthStack(providerRuntime);
    providerRuntime.providerExit.resolveExit({ code: 1, signal: null });
    await expect(providerStack.exited).resolves.toEqual({
      component: "PROVIDER",
      exit: { code: 1, signal: null }
    });
    await providerStack.stop();

    const runnerRuntime = operations();
    const runnerStack = await startDevelopmentAuthStack(runnerRuntime);
    runnerRuntime.runnerExit.resolveExit({ code: null, signal: "SIGKILL" });
    await expect(runnerStack.exited).resolves.toEqual({
      component: "RUNNER",
      exit: { code: null, signal: "SIGKILL" }
    });
    await runnerStack.stop();
  });

  it("routes a real post-listen provider server fault through the full reverse unwind", async () => {
    const base = operations();
    let provider: Awaited<ReturnType<typeof startDevelopmentLocalProvider>> | undefined;
    const runtime: DevelopmentAuthStackOperations & Pick<typeof base, "calls"> = {
      ...base,
      startProvider: vi.fn(async () => {
        base.calls.push("provider:start");
        provider = await startDevelopmentLocalProvider({ port: 0 });
        return Object.freeze({
          receipt: Object.freeze({
            host: "127.0.0.1", port: 8_791, model: "qa-deterministic-v1"
          }),
          exited: provider.exited,
          stop: async () => {
            base.calls.push("provider:stop");
            await provider!.stop();
          }
        });
      })
    };
    const stack = await startDevelopmentAuthStack(runtime);
    try {
      const activeHandles = (process as typeof process & {
        _getActiveHandles(): readonly unknown[];
      })._getActiveHandles();
      const server = activeHandles.find((handle): handle is {
        address(): { port: number } | string | null;
        emit(event: "error", error: Error): boolean;
      } => {
        if (typeof (handle as { address?: unknown }).address !== "function") return false;
        const address = (handle as { address(): { port?: unknown } | string | null }).address();
        return typeof address === "object" && address !== null
          && address.port === provider!.receipt.port;
      });
      expect(server).toBeDefined();
      expect(() => server!.emit("error", new Error("simulated accept-path failure")))
        .not.toThrow();
      await expect(superviseDevelopmentAuthStack(stack, new Promise(() => undefined)))
        .rejects.toThrow("DEV_AUTH_STACK_PROVIDER_EXITED");
      await expect(provider!.exited).resolves.toEqual({ code: 1, signal: null });
      expect(base.calls.slice(-6)).toEqual([
        "tls:stop", "ui:stop", "runner:stop", "api:stop", "provider:stop", "data:stop"
      ]);
    } finally {
      await stack.stop();
    }
  });

  it("always stops the stack on signal, exact child exit, or runtime-promise failure", async () => {
    const signalRuntime = operations();
    const signalStack = await startDevelopmentAuthStack(signalRuntime);
    await expect(superviseDevelopmentAuthStack(signalStack, Promise.resolve("SIGTERM")))
      .resolves.toBeUndefined();
    expect(signalRuntime.calls.slice(-6)).toEqual([
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "provider:stop", "data:stop"
    ]);

    const exitRuntime = operations();
    const exitStack = await startDevelopmentAuthStack(exitRuntime);
    const exited = superviseDevelopmentAuthStack(exitStack, new Promise(() => undefined));
    exitRuntime.apiExit.resolveExit({ code: 1, signal: null });
    await expect(exited).rejects.toThrow("DEV_AUTH_STACK_API_EXITED");
    expect(exitRuntime.calls.slice(-6)).toEqual([
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "provider:stop", "data:stop"
    ]);

    const stop = vi.fn(async () => undefined);
    await expect(superviseDevelopmentAuthStack({
      receipt: exitStack.receipt,
      exited: Promise.reject(new Error("sensitive child transport failure")),
      stop
    }, new Promise(() => undefined))).rejects.toThrow("DEV_AUTH_STACK_RUNTIME_FAILED");
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("exposes one fixed CLI and owns the provider and runner without claiming an account", async () => {
    const [packageSource, source, cli] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile("apps/runner/src/dev-auth-stack.ts", "utf8"),
      readFile("apps/runner/src/dev-auth-stack-cli.ts", "utf8")
    ]);
    const scripts = JSON.parse(packageSource).scripts as Record<string, string>;
    expect(scripts["dev:auth:up"]).toBe("tsx apps/runner/src/dev-auth-stack-cli.ts");
    expect(source).toContain("startDevelopmentAuthDataPlane");
    expect(source).toContain("startAttestedDevTlsFrontDoor");
    expect(source).toContain("startDevelopmentLocalProvider");
    expect(source).toContain("startDevelopmentRunnerProcess");
    expect(source).not.toMatch(/mkcert\s+-install|seedAccount/iu);
    expect(source).not.toContain("process.env");
    expect(cli).toContain("DEV_AUTH_STACK_READY=https://localhost:3000:RUNNER_REGISTERED");
    expect(cli).toContain("process.once(\"uncaughtException\"");
    expect(cli).toContain("process.once(\"unhandledRejection\"");
    expect(cli).toContain("runtimeFault.dispose()");
  });

  it("returns exact deterministic OpenAI-compatible content for every runner organ", () => {
    expect(renderDevelopmentProviderContent([{ role: "user", content: "DR-181 discovery health probe. Reply exactly: OK" }])).toBe("OK");
    expect(JSON.parse(renderDevelopmentProviderContent([{ role: "system", content: "Review an existing debate node authored by a different maker." }]))).toEqual({
      outcome: "agree", reasons: ["The position is internally coherent under the available reasoning."]
    });
    expect(JSON.parse(renderDevelopmentProviderContent([{ role: "system", content: "Return only JSON with a segments array of at most two entries." }]))).toHaveProperty("segments", expect.any(Array));
    expect(JSON.parse(renderDevelopmentProviderContent([{ role: "system", content: "Return only JSON {conforms,findings}." }]))).toEqual({ conforms: true, findings: [] });
    expect(JSON.parse(renderDevelopmentProviderContent([{ role: "system", content: "Return only JSON {pass}." }]))).toEqual({ pass: true });
    expect(JSON.parse(renderDevelopmentProviderContent([{ role: "system", content: "Return only one JSON object with exactly the following schema" }]))).toMatchObject({
      way_of_knowing: "REASONING", restatement_status: "PASS", claim_type: "unknown"
    });
  });

  it("serves the exact bounded OpenAI-compatible handshake on the configured loopback endpoint", async () => {
    const provider = await startDevelopmentLocalProvider({ port: 0 });
    try {
      const response = await fetch(`http://127.0.0.1:${provider.receipt.port}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "qa-deterministic-v1",
          messages: [{ role: "user", content: "DR-181 discovery health probe. Reply exactly: OK" }]
        })
      });
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        model: "qa-deterministic-v1",
        choices: [{ message: { content: "OK" } }]
      });
    } finally {
      await provider.stop();
    }
    await expect(provider.exited).resolves.toEqual({ code: 0, signal: null });
  });

  it("refuses wrong routes, models, prompts, and oversized provider bodies over the wire", async () => {
    const provider = await startDevelopmentLocalProvider({ port: 0 });
    const endpoint = `http://127.0.0.1:${provider.receipt.port}/v1/chat/completions`;
    try {
      const wrongRoute = await fetch(endpoint, { method: "GET" });
      expect(wrongRoute.status).toBe(404);
      await expect(wrongRoute.json()).resolves.toEqual({ error: "NOT_FOUND" });

      const wrongModel = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "untrusted", messages: [] })
      });
      expect(wrongModel.status).toBe(422);
      await expect(wrongModel.json()).resolves.toEqual({ error: "REQUEST_INVALID" });

      const wrongPrompt = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "qa-deterministic-v1",
          messages: [{ role: "user", content: "execute an unsupported prompt" }]
        })
      });
      expect(wrongPrompt.status).toBe(422);
      await expect(wrongPrompt.json()).resolves.toEqual({ error: "REQUEST_UNSUPPORTED" });

      const oversized = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: "qa-deterministic-v1",
          messages: [{ role: "user", content: "x".repeat(256 * 1024) }]
        })
      });
      expect(oversized.status).toBe(422);
      await expect(oversized.json()).resolves.toEqual({ error: "REQUEST_UNSUPPORTED" });
    } finally {
      await provider.stop();
    }
    await expect(provider.exited).resolves.toEqual({ code: 0, signal: null });
  });
});
