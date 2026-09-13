import { createHash } from "node:crypto";
import { chmod, link, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { loadModelConfig, type ModelConfig } from "@debateai/model-config";
import {
  developmentAuthStackErrorCode,
  createDevelopmentAuthStackOperations,
  superviseDevelopmentAuthStack,
  startDevelopmentAuthStack,
  type DevelopmentAuthStackOperations
} from "../../apps/runner/src/dev-auth-stack.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";
import { createDevelopmentDeploymentRegisterMachineReceipt } from "../../apps/runner/src/dev-deployment-register.js";
import { parseRegisterVersionText } from "../../packages/register/src/index.js";
import {
  buildDevelopmentProviderPanel,
  DEVELOPMENT_UNAVAILABLE_CLI_MODEL,
  developmentProviderSlots,
  type DevelopmentApiProviderProbe,
  type DevelopmentProviderPanel
} from "../../apps/runner/src/dev-provider-panel.js";

const REGISTER_RECEIPT = createDevelopmentDeploymentRegisterMachineReceipt({
  registerVersion: parseRegisterVersionText("424242"),
  rowCount: 32,
  snapshotSha256: "a".repeat(64)
});
const SUPPORT_MODEL_TARGET = JSON.stringify({
  provider_ref: "development:hermes-glm-5.3-flash",
  base_url: "http://127.0.0.1:8794/v1",
  model: "z-ai/glm-5.3-flash",
  authorization_header: "Bearer support-only"
});

type Exit = Readonly<{ code: number | null; signal: NodeJS.Signals | null }>;

function deferredExit() {
  let resolveExit!: (exit: Exit) => void;
  const exited = new Promise<Exit>((resolve) => { resolveExit = resolve; });
  return { exited, resolveExit };
}

function unavailableApiPanel(config: ModelConfig): DevelopmentProviderPanel {
  const slots = developmentProviderSlots(config);
  return buildDevelopmentProviderPanel(slots.map((slot) => Object.freeze({
    providerRef: slot.providerRef,
    baseUrl: slot.transport === "cli"
      ? `http://127.0.0.1:${slot.port}/v1`
      : slot.baseUrl!,
    model: slot.transport === "cli" ? slot.model : DEVELOPMENT_UNAVAILABLE_CLI_MODEL,
    ...(slot.transport === "cli" ? { authorizationHeader: "test-relay-header" } : {})
  })), slots.map(({ providerRef, adapterKind, maker }) => Object.freeze({
    providerRef, adapterKind, maker
  })));
}

async function resolveApiAvailability(
  config: ModelConfig,
  providerPanel: DevelopmentProviderPanel,
  providerKeys: ReadonlyMap<string, string>,
  probe: DevelopmentApiProviderProbe,
  warning: (line: string) => void
): Promise<DevelopmentProviderPanel> {
  const module = await import("../../apps/runner/src/dev-provider-panel.js") as Readonly<{
    resolveDevelopmentApiProviderSlots?: (
      config: ModelConfig,
      providerPanel: DevelopmentProviderPanel,
      providerKeys: ReadonlyMap<string, string>,
      probe: DevelopmentApiProviderProbe,
      warning: (line: string) => void
    ) => Promise<DevelopmentProviderPanel>;
  }>;
  expect(module.resolveDevelopmentApiProviderSlots).toBeTypeOf("function");
  return module.resolveDevelopmentApiProviderSlots!(config, providerPanel, providerKeys, probe, warning);
}

async function providerKeysReader(): Promise<(repositoryRoot: string) => Promise<ReadonlyMap<string, string>>> {
  const module = await import("../../apps/runner/src/dev-provider-keys.js").catch(() => ({})) as Readonly<{
    readProviderKeys?: (repositoryRoot: string) => Promise<ReadonlyMap<string, string>>;
  }>;
  expect(module.readProviderKeys).toBeTypeOf("function");
  return module.readProviderKeys!;
}

function operations(input: Readonly<{
  occupied?: boolean;
  failAt?: "provider_panel" | "support_model" | "data" | "token" | "environment" | "api" | "runner" | "ui" | "tls";
  apiEnvironmentPath?: string;
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
    checkModelConfig: vi.fn(async () => {
      calls.push("model-config");
    }),
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
    startSupportModelRelay: vi.fn(async () => {
      calls.push("support:start");
      fail("support_model");
      return Object.freeze({
        targetJson: SUPPORT_MODEL_TARGET,
        providerRef: "development:hermes-glm-5.3-flash" as const,
        stop: vi.fn(async () => { calls.push("support:stop"); })
      });
    }),
    startDataPlane: vi.fn(async () => {
      calls.push("data:start");
      fail("data");
      return Object.freeze({
        receipt: Object.freeze({ mailCapture: "ATTESTED" as const, register: REGISTER_RECEIPT }),
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
      if (input.apiEnvironmentPath !== undefined) {
        await writeFile(input.apiEnvironmentPath, "changed\n", { mode: 0o600 });
      }
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
  it("refuses a world-readable provider key file", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-provider-keys-mode-"));
    const custodyRoot = join(repositoryRoot, ".local", "dev-auth");
    await mkdir(custodyRoot, { recursive: true, mode: 0o700 });
    await writeFile(join(custodyRoot, "provider-keys.env"), "TEST_API_KEY=test-fixture-value\n", {
      mode: 0o644
    });
    try {
      await expect((await providerKeysReader())(repositoryRoot))
        .rejects.toThrow("DEV_PROVIDER_KEYS_CUSTODY_INVALID");
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("refuses a hard-linked provider key file", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-provider-keys-link-"));
    const custodyRoot = join(repositoryRoot, ".local", "dev-auth");
    const path = join(custodyRoot, "provider-keys.env");
    await mkdir(custodyRoot, { recursive: true, mode: 0o700 });
    await writeFile(path, "TEST_API_KEY=test-fixture-value\n", { mode: 0o600 });
    await link(path, `${path}.hardlink`);
    try {
      await expect((await providerKeysReader())(repositoryRoot))
        .rejects.toThrow("DEV_PROVIDER_KEYS_CUSTODY_INVALID");
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("returns declared variable names from a private provider key file", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-provider-keys-private-"));
    const custodyRoot = join(repositoryRoot, ".local", "dev-auth");
    await mkdir(custodyRoot, { recursive: true, mode: 0o700 });
    await writeFile(join(custodyRoot, "provider-keys.env"), [
      "TEST_OPENAI_API_KEY=test-fixture-openai",
      "TEST_ZAI_API_KEY=test-fixture-zai",
      ""
    ].join("\n"), { mode: 0o600 });
    try {
      const keys = await (await providerKeysReader())(repositoryRoot);
      expect([...keys.keys()]).toEqual(["TEST_OPENAI_API_KEY", "TEST_ZAI_API_KEY"]);
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("treats an absent provider key file as an empty map", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-provider-keys-absent-"));
    try {
      await expect((await providerKeysReader())(repositoryRoot)).resolves.toEqual(new Map());
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("keeps the provider key loader free of logging and value interpolation", async () => {
    const source = await readFile(
      join(process.cwd(), "apps", "runner", "src", "dev-provider-keys.ts"),
      "utf8"
    );
    expect(source).not.toContain("console.log");
    expect(source).not.toMatch(/[$][{][^}]*value/iu);
  });

  it("keeps a keyless API slot configured but absent with one class-(a) warning", async () => {
    const committed = loadModelConfig(process.cwd());
    const config = {
      ...committed,
      free: [committed.free.find((entry) => entry.transport === "api" && entry.api === "openai")!]
    } as ModelConfig;
    const probe = vi.fn(async () => Object.freeze({ model: "unused" }));
    const warning = vi.fn<(line: string) => void>();
    const outcome = await resolveApiAvailability(
      config,
      unavailableApiPanel(config),
      new Map(),
      probe,
      warning
    ).then((panel) => ({ exitCode: 0, panel }));
    expect(outcome.exitCode).toBe(0);
    expect(outcome.panel.configuredProviders.map(({ providerRef }) => providerRef))
      .toContain("development:openai-free-api");
    expect(outcome.panel.healthyProviderRefs).not.toContain("development:openai-free-api");
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0]?.[0]).toContain("class (a)");
    expect(warning.mock.calls[0]?.[0]).toContain("free");
    expect(warning.mock.calls[0]?.[0]).toContain("gpt-5.6-luna");
    expect(warning.mock.calls[0]?.[0]).not.toMatch(/sk-|Bearer|OPENAI_API_KEY=/u);
    expect(probe).not.toHaveBeenCalled();
  });

  it("keeps a probe-mismatched API slot absent with one class-(b) warning", async () => {
    const committed = loadModelConfig(process.cwd());
    const config = {
      ...committed,
      free: [committed.free.find((entry) => entry.transport === "api" && entry.api === "openai")!]
    } as ModelConfig;
    const apiEntry = config.free[0]!;
    if (apiEntry.transport !== "api") throw new TypeError("TEST_API_ENTRY_REQUIRED");
    const secret = "test-provider-key-never-print";
    const warning = vi.fn<(line: string) => void>();
    const outcome = await resolveApiAvailability(
      config,
      unavailableApiPanel(config),
      new Map([[apiEntry.keyVariable!, secret]]),
      vi.fn(async () => Object.freeze({ model: "different-model" })),
      warning
    ).then((panel) => ({ exitCode: 0, panel }));
    expect(outcome.exitCode).toBe(0);
    expect(outcome.panel.configuredProviders.map(({ providerRef }) => providerRef))
      .toContain("development:openai-free-api");
    expect(outcome.panel.healthyProviderRefs).not.toContain("development:openai-free-api");
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0]?.[0]).toContain("class (b)");
    expect(warning.mock.calls[0]?.[0]).toContain("free");
    expect(warning.mock.calls[0]?.[0]).toContain("gpt-5.6-luna");
    expect(warning.mock.calls[0]?.[0]).not.toContain(secret);
  });

  it("starts the merged five-slot panel without a provider key file", async () => {
    const config = loadModelConfig(process.cwd());
    const warning = vi.fn<(line: string) => void>();
    const probe = vi.fn(async () => Object.freeze({ model: "unused" }));
    const panel = await resolveApiAvailability(
      config,
      unavailableApiPanel(config),
      new Map(),
      probe,
      warning
    );
    expect(panel.configuredProviders).toHaveLength(5);
    expect(panel.healthyProviderRefs).toEqual([
      "development:codex-premium-cli",
      "development:claude-premium-cli",
      "development:grok-cli"
    ]);
    expect(warning).toHaveBeenCalledTimes(2);
    expect(probe).not.toHaveBeenCalled();
  });

  it("refuses a class-2 model config before rewriting api.env or starting resources", async () => {
    const repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-dev-auth-model-config-"));
    const configRoot = join(repositoryRoot, "config");
    const custodyRoot = join(repositoryRoot, ".local", "dev-auth");
    await mkdir(configRoot, { recursive: true, mode: 0o700 });
    await mkdir(custodyRoot, { recursive: true, mode: 0o700 });
    await writeFile(join(configRoot, "models.yaml"), [
      "free:",
      "  - api: acme",
      "    model: broken-shape-model",
      "    base_url: https://example.invalid/v1",
      "    key: TEST_API_KEY",
      "premium:",
      "  - cli: codex",
      "    model: gpt-test",
      "  - cli: claude",
      "    model: claude-test",
      ""
    ].join("\n"), { mode: 0o600 });
    const apiEnvironmentPath = join(custodyRoot, "api.env");
    await writeFile(apiEnvironmentPath, "stable\n", { mode: 0o600 });
    const digest = async () => createHash("sha256")
      .update(await readFile(apiEnvironmentPath))
      .digest("hex");
    const beforeDigest = await digest();
    const runtime = operations({ apiEnvironmentPath });
    const configured = createDevelopmentAuthStackOperations(repositoryRoot, {}) as
      DevelopmentAuthStackOperations & Readonly<{ checkModelConfig(): Promise<void> }>;
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const outcome = await startDevelopmentAuthStack({
        ...runtime,
        checkModelConfig: configured.checkModelConfig
      }).then(async (stack) => {
        await stack.stop();
        return { exitCode: 0, digest: await digest() };
      }, async () => ({ exitCode: 1, digest: await digest() }));

      expect(outcome).toEqual({ exitCode: 1, digest: beforeDigest });
      const message = stderr.mock.calls.map(([line]) => String(line)).join("\n");
      expect(message).toContain("free");
      expect(message).toContain("broken-shape-model");
      expect(message).toContain("class 2");
      expect(message).not.toMatch(/sk-|Bearer|OPENAI_API_KEY=/u);
      expect(runtime.calls).toEqual([]);
    } finally {
      stderr.mockRestore();
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });

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
      supportModel: "HERMES_GLM_5_3_FLASH",
      healthyProviderRefs: [
        "development:codex-premium-cli",
        "development:claude-premium-cli",
        "development:grok-cli"
      ],
      runner: "REGISTERED"
    });
    expect(runtime.calls).toEqual([
      "model-config", "preflight", "providers:start", "support:start", "data:start", "token", "environment",
      "api:start", "runner:start", "ui:start", "tls:start"
    ]);
    expect(runtime.startDataPlane).toHaveBeenCalledWith(TEST_DEVELOPMENT_PROVIDER_PANEL);
    expect(runtime.assembleApiEnvironment)
      .toHaveBeenCalledWith(
        TEST_DEVELOPMENT_PROVIDER_PANEL,
        REGISTER_RECEIPT,
        SUPPORT_MODEL_TARGET,
        undefined
      );

    await Promise.all([stack.stop(), stack.stop()]);
    await stack.stop();
    expect(runtime.calls).toEqual([
      "model-config", "preflight", "providers:start", "support:start", "data:start", "token", "environment",
      "api:start", "runner:start", "ui:start", "tls:start",
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"
    ]);
  });

  it("refuses an occupied public port before creating any resource", async () => {
    const runtime = operations({ occupied: true });
    await expect(startDevelopmentAuthStack(runtime))
      .rejects.toThrow("DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED");
    expect(runtime.calls).toEqual(["model-config", "preflight"]);
  });

  it.each([
    ["provider_panel", ["model-config", "preflight", "providers:start"]],
    ["support_model", ["model-config", "preflight", "providers:start", "support:start", "providers:stop"]],
    ["data", ["model-config", "preflight", "providers:start", "support:start", "data:start", "support:stop", "providers:stop"]],
    ["token", ["model-config", "preflight", "providers:start", "support:start", "data:start", "token", "data:stop", "support:stop", "providers:stop"]],
    ["environment", ["model-config", "preflight", "providers:start", "support:start", "data:start", "token", "environment", "data:stop", "support:stop", "providers:stop"]],
    ["api", ["model-config", "preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "data:stop", "support:stop", "providers:stop"]],
    ["runner", ["model-config", "preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "runner:start", "api:stop", "data:stop", "support:stop", "providers:stop"]],
    ["ui", ["model-config", "preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "runner:start", "ui:start", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"]],
    ["tls", ["model-config", "preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "runner:start", "ui:start", "tls:start", "ui:stop", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"]]
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
    expect(signalRuntime.calls.slice(-7)).toEqual([
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"
    ]);

    const exitRuntime = operations();
    const exitStack = await startDevelopmentAuthStack(exitRuntime);
    const exited = superviseDevelopmentAuthStack(exitStack, new Promise(() => undefined));
    exitRuntime.apiExit.resolveExit({ code: 1, signal: null });
    await expect(exited).rejects.toThrow("DEV_AUTH_STACK_API_EXITED");
    expect(exitRuntime.calls.slice(-7)).toEqual([
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"
    ]);

    const stop = vi.fn(async () => undefined);
    await expect(superviseDevelopmentAuthStack({
      receipt: exitStack.receipt,
      exited: Promise.reject(new Error("sensitive child transport failure")),
      stop
    }, new Promise(() => undefined))).rejects.toThrow("DEV_AUTH_STACK_RUNTIME_FAILED");
    expect(stop).toHaveBeenCalledTimes(1);
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
    expect(cli).toContain("process.once(\"uncaughtException\"");
    expect(cli).toContain("process.once(\"unhandledRejection\"");
    expect(cli).toContain("runtimeFault.dispose()");
  });

});
