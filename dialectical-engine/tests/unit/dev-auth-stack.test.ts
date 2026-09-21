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
import {
  startAttestedDevTlsFrontDoor,
  type DevTlsOwnedFrontDoor,
  type DevTlsReadinessOperations,
  type DevTlsUiProbe
} from "../../deploy/dev-auth/tls-front-door.mjs";
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
import { SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE } from "../../apps/runner/src/dev-auth-stack-profile.js";

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
  preview?: boolean;
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
    ...(input.preview ? { profile: SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE } : {}),
    calls,
    apiExit,
    uiExit,
    runnerExit,
    generateContract: vi.fn(async () => {
      calls.push("contract:generate");
    }),
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
  it("checks model config before generating the contract and before starting the data plane", async () => {
    // Property: every stack start refuses a broken file by name, then regenerates before any seed.
    // Break caught: moving generation before validation or after data startup.
    const runtime = operations();
    const withGenerator = Object.assign(runtime, {
      generateContract: vi.fn(async () => { runtime.calls.push("contract:generate"); })
    });
    const stack = await startDevelopmentAuthStack(withGenerator);
    expect(runtime.calls.slice(0, 2)).toEqual(["model-config", "contract:generate"]);
    expect(runtime.calls.indexOf("contract:generate"))
      .toBeLessThan(runtime.calls.indexOf("data:start"));
    await stack.stop();
  });

  it("stops after model config and before data startup when contract generation fails", async () => {
    // Property: a failed roster generation is a named, fail-closed startup stage.
    // Break caught: continuing with a stale generated PLAN_TIER_ROSTERS artifact.
    const runtime = operations();
    const withGenerator = Object.assign(runtime, {
      generateContract: vi.fn(async () => {
        throw new Error("sensitive generator failure");
      })
    });
    const outcome = await startDevelopmentAuthStack(withGenerator).then(async (stack) => {
      await stack.stop();
      return "STARTED";
    }, (error: unknown) => error instanceof Error ? error.message : "UNKNOWN");
    expect(outcome).toBe("DEV_AUTH_STACK_CONTRACT_GENERATION_FAILED");
    expect(runtime.calls).toEqual(["model-config"]);
  });

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

  it("omits the model token when class 5 has no refused entry", async () => {
    // Property: an aggregate undersized-roster refusal names its tier and class without inventing a model.
    // Break caught: rendering an absent ModelConfigShapeError.model as `model=undefined`.
    const repositoryRoot = await mkdtemp(join(tmpdir(), "debateai-dev-auth-single-model-"));
    const configRoot = join(repositoryRoot, "config");
    await mkdir(configRoot, { recursive: true, mode: 0o700 });
    await writeFile(join(configRoot, "models.yaml"), [
      "free:",
      "  - api: openai",
      "    model: gpt-single",
      "    base_url: https://example.invalid/v1",
      "    key: TEST_API_KEY",
      "premium:",
      "  - cli: codex",
      "    model: gpt-test",
      "  - cli: claude",
      "    model: claude-test",
      ""
    ].join("\n"), { mode: 0o600 });
    const configured = createDevelopmentAuthStackOperations(repositoryRoot, {});
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(configured.checkModelConfig()).rejects.toThrow();
      expect(stderr.mock.calls.map(([line]) => String(line))).toEqual([
        "DEV_AUTH_STACK_MODEL_CONFIG_INVALID tier=free class 5"
      ]);
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
  /**
   * F-DIAG-DEV-AUTH-STACK. The shape rule `/^DEV_[A-Z0-9_]+$/` forwards ANY
   * message that merely LOOKS like a code. The landed pattern
   * (`apps/api/src/risk-signal-identity.ts`) considered and rejected exactly
   * that rule: "an uppercase-shaped message is still attacker- or
   * driver-influenced text". The set below is written out independently here
   * and is NOT imported from `dev-auth-stack.ts`; its producer audit is in
   * agent-reports/diag-class-a.md.
   */
  it("refuses a message that is code-SHAPED but is not a known code", () => {
    // Synthetic only (D18). Shape-legal for the old regex, absent from every producer.
    const code = developmentAuthStackErrorCode(new Error("DEV_AUTH_STACK_TLS_FAILED", {
      cause: new Error("DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER")
    }));

    expect(code).not.toContain("SYNTHETIC_PW_42");
    expect(code).toBe("DEV_AUTH_STACK_TLS_FAILED:DEV_UNRECOGNIZED");
  });

  it("returns the fixed fallback when the whole chain is code-shaped but unknown", () => {
    const code = developmentAuthStackErrorCode(
      new Error("DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER")
    );

    expect(code).not.toContain("SYNTHETIC_PW_42");
    expect(code).toBe("DEV_UNRECOGNIZED");
  });

  /**
   * codex r1 F2. These four are TEMPLATE-BUILT, not literals: `probeEndpoint`
   * composes `${errorCode}_BODY_TOO_LARGE` (tls-front-door.mjs:61) and
   * `${errorCode}_TIMEOUT` (:72) over the only two prefixes its only caller
   * supplies (:327 private, :336 public). Their source lines carry no DEV_ token,
   * so a literal-only producer sweep misses them and the first round degraded all
   * four to DEV_UNRECOGNIZED — a diagnostic regression, not a redaction. An
   * ordinary UI probe that times out or overruns its body bound produces them.
   */
  it("retains the four template-built TLS probe codes, each distinct", () => {
    const probeCodes = [
      "DEV_TLS_PRIVATE_PROBE_FAILED_BODY_TOO_LARGE",
      "DEV_TLS_PRIVATE_PROBE_FAILED_TIMEOUT",
      "DEV_TLS_PUBLIC_PROBE_FAILED_BODY_TOO_LARGE",
      "DEV_TLS_PUBLIC_PROBE_FAILED_TIMEOUT"
    ] as const;

    const joined = probeCodes.map((code) => developmentAuthStackErrorCode(
      new Error("DEV_AUTH_STACK_TLS_FAILED", { cause: new Error(code) })
    ));

    // Each is retained, and each stays DISTINCT from the other three — collapsing
    // them to a shared category would also pass a "not DEV_UNRECOGNIZED" check.
    expect(joined).toEqual(probeCodes.map((code) => `DEV_AUTH_STACK_TLS_FAILED:${code}`));
    expect(new Set(joined).size).toBe(4);
    // and the bare prefixes they are built from still join on their own
    expect(developmentAuthStackErrorCode(new Error("DEV_TLS_PRIVATE_PROBE_FAILED")))
      .toBe("DEV_TLS_PRIVATE_PROBE_FAILED");
    expect(developmentAuthStackErrorCode(new Error("DEV_TLS_PUBLIC_PROBE_FAILED")))
      .toBe("DEV_TLS_PUBLIC_PROBE_FAILED");
  });

  /**
   * codex r1 F3. Validating one read of `message` and emitting another is not an
   * allow-list. No concurrency is needed — an accessor that answers differently on
   * the second read is enough. The guard must emit the snapshot it validated.
   */
  it("reads each link's message ONCE, so an unstable accessor cannot slip past the set", () => {
    // Synthetic only (D18); shape-legal so the old regex would have forwarded it.
    const SYNTHETIC = "DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER";
    const shifty = new Error("placeholder");
    let reads = 0;
    Object.defineProperty(shifty, "message", {
      configurable: true,
      get: () => (reads++ === 0 ? "DEV_AUTH_STACK_TLS_FAILED" : SYNTHETIC)
    });

    const code = developmentAuthStackErrorCode(shifty);

    expect(code).not.toContain("SYNTHETIC_PW_42");
    expect(code).toBe("DEV_AUTH_STACK_TLS_FAILED");
  });

  it("reads once on a deeper link too, and keeps the join order", () => {
    const SYNTHETIC = "DEV_SYNTHETIC_PW_42_LEAKED_FROM_A_DRIVER";
    const inner = new Error("placeholder");
    let reads = 0;
    Object.defineProperty(inner, "message", {
      configurable: true,
      get: () => (reads++ === 0 ? "DEV_TLS_PUBLIC_PROBE_FAILED_TIMEOUT" : SYNTHETIC)
    });

    const code = developmentAuthStackErrorCode(
      new Error("DEV_AUTH_STACK_TLS_FAILED", { cause: inner })
    );

    expect(code).not.toContain("SYNTHETIC_PW_42");
    expect(code).toBe("DEV_AUTH_STACK_TLS_FAILED:DEV_TLS_PUBLIC_PROBE_FAILED_TIMEOUT");
  });

  it("control — a known chain still joins in the same order, to full depth", () => {
    expect(developmentAuthStackErrorCode(new Error("DEV_AUTH_STACK_DATA_FAILED", {
      cause: new Error("DEV_AUTH_DATA_PLANE_POSTGRES_UNAVAILABLE", {
        cause: new Error("DEV_AUTH_DATA_PLANE_DEPENDENCY_START_FAILED", {
          cause: new Error("DEV_TLS_PORT_PROBE_TIMEOUT")
        })
      })
    }))).toBe([
      "DEV_AUTH_STACK_DATA_FAILED",
      "DEV_AUTH_DATA_PLANE_POSTGRES_UNAVAILABLE",
      "DEV_AUTH_DATA_PLANE_DEPENDENCY_START_FAILED",
      "DEV_TLS_PORT_PROBE_TIMEOUT"
    ].join(":"));
  });

  it("control — the four-level walk still stops at four, and non-code links still fall away", () => {
    expect(developmentAuthStackErrorCode(new Error("DEV_AUTH_STACK_API_FAILED", {
      cause: new Error("not a code at all", {
        cause: new Error("DEV_API_PROCESS_START_FAILED", {
          cause: new Error("DEV_API_PROCESS_PROBE_TIMEOUT", {
            cause: new Error("DEV_UI_PROCESS_EXITED")
          })
        })
      })
    }))).toBe("DEV_AUTH_STACK_API_FAILED:DEV_API_PROCESS_START_FAILED:DEV_API_PROCESS_PROBE_TIMEOUT");
  });

  it("control — a chain with no DEV-shaped message keeps the historical fallback", () => {
    expect(developmentAuthStackErrorCode(new Error("plain failure", {
      cause: new Error("another plain failure")
    }))).toBe("DEV_AUTH_STACK_FAILED");
    expect(developmentAuthStackErrorCode("not an error at all")).toBe("DEV_AUTH_STACK_FAILED");
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
      "model-config", "contract:generate", "preflight", "providers:start", "support:start", "data:start", "token", "environment",
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
      "model-config", "contract:generate", "preflight", "providers:start", "support:start", "data:start", "token", "environment",
      "api:start", "runner:start", "ui:start", "tls:start",
      "tls:stop", "ui:stop", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"
    ]);
  });

  it("refuses an occupied public port before creating any resource", async () => {
    const runtime = operations({ occupied: true });
    await expect(startDevelopmentAuthStack(runtime))
      .rejects.toThrow("DEV_AUTH_STACK_PUBLIC_PORT_OCCUPIED");
    expect(runtime.calls).toEqual(["model-config", "contract:generate", "preflight"]);
  });

  it("reports the selected support-preview origin without changing lifecycle ownership", async () => {
    const runtime = operations({ preview: true });
    const stack = await startDevelopmentAuthStack(runtime);
    expect(stack.receipt.origin).toBe("https://localhost:3100");
    await stack.stop();
  });

  it.each([
    ["provider_panel", ["model-config", "contract:generate", "preflight", "providers:start"]],
    ["support_model", ["model-config", "contract:generate", "preflight", "providers:start", "support:start", "providers:stop"]],
    ["data", ["model-config", "contract:generate", "preflight", "providers:start", "support:start", "data:start", "support:stop", "providers:stop"]],
    ["token", ["model-config", "contract:generate", "preflight", "providers:start", "support:start", "data:start", "token", "data:stop", "support:stop", "providers:stop"]],
    ["environment", ["model-config", "contract:generate", "preflight", "providers:start", "support:start", "data:start", "token", "environment", "data:stop", "support:stop", "providers:stop"]],
    ["api", ["model-config", "contract:generate", "preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "data:stop", "support:stop", "providers:stop"]],
    ["runner", ["model-config", "contract:generate", "preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "runner:start", "api:stop", "data:stop", "support:stop", "providers:stop"]],
    ["ui", ["model-config", "contract:generate", "preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "runner:start", "ui:start", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"]],
    ["tls", ["model-config", "contract:generate", "preflight", "providers:start", "support:start", "data:start", "token", "environment", "api:start", "runner:start", "ui:start", "tls:start", "ui:stop", "runner:stop", "api:stop", "data:stop", "support:stop", "providers:stop"]]
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
    expect(cli).toContain("DEV_AUTH_STACK_READY=${stack.receipt.origin}:RUNNER_REGISTERED");
    expect(cli).toContain("process.once(\"uncaughtException\"");
    expect(cli).toContain("process.once(\"unhandledRejection\"");
    expect(cli).toContain("runtimeFault.dispose()");
  });

});

/**
 * F-DEV-TLS-DOUBLE-WRAP. `DevTlsFrontDoorError`'s constructor ALREADY wraps its second
 * argument (`super(code, cause === undefined ? undefined : { cause })`,
 * deploy/dev-auth/tls-front-door.mjs:32-35), and its DECLARED contract takes the cause raw
 * (`constructor(code: string, cause?: unknown)`, deploy/dev-auth/tls-front-door.d.mts:40) —
 * the same convention the sibling `DevelopmentAuthStackError` is called under in the subject
 * of this file (dev-auth-stack.ts:323, :337, :423, each passing a bare `error`). Two throw
 * sites passed `{ cause: error }` instead, so `error.cause` was a plain object
 * `{ cause: <real error> }`. `developmentAuthStackErrorCode` advances only while
 * `current instanceof Error` (dev-auth-stack.ts:299), so the walk stopped one link short and
 * the inner producer code never joined.
 *
 * Each row asserts the WRAP DEPTH directly — `cause` is the object that was thrown, not a
 * wrapper around it — and then the consequence the ticket names: the joined chain reaches it.
 * The depth assertion is what makes these rows independent of which producer supplied the
 * inner error; the join assertion is what makes the diagnostic loss visible.
 */
const DEV_TLS_READY_UI: DevTlsUiProbe = Object.freeze({
  login: Object.freeze({
    statusCode: 200,
    contentType: "text/html; charset=utf-8",
    body: "<html><body>Back to the graph.</body></html>"
  }),
  session: Object.freeze({
    statusCode: 401,
    contentType: "application/json; charset=utf-8",
    body: '{"error":"SESSION_REQUIRED"}'
  })
});

function tlsReadinessOperations(overrides: Readonly<{
  startFrontDoor?: () => Promise<DevTlsOwnedFrontDoor>;
  probePublicUi?: () => Promise<DevTlsUiProbe | null>;
}> = {}): DevTlsReadinessOperations {
  return Object.freeze({
    isPublicPortOccupied: async () => false,
    probePrivateUi: async () => DEV_TLS_READY_UI,
    startFrontDoor: overrides.startFrontDoor
      ?? (async () => Object.freeze({ port: 3_000, close: async () => undefined })),
    probePublicUi: overrides.probePublicUi ?? (async () => DEV_TLS_READY_UI),
    delay: async () => undefined
  });
}

async function rejectionOf(work: Promise<unknown>): Promise<unknown> {
  try {
    await work;
  } catch (error) {
    return error;
  }
  throw new Error("EXPECTED_A_REJECTION");
}

describe("F-DEV-TLS-DOUBLE-WRAP the front door wraps a cause exactly once", () => {
  it("joins the inner DEV code of a front-door START failure instead of stopping at the outer code", async () => {
    // A real producer code: `DevCertificateError("DEV_TLS_CERTIFICATE_INVALID")`
    // (deploy/dev-auth/create-local-certificate.mjs:27, :74) is NOT a DevTlsFrontDoorError,
    // so it takes the wrapping branch of the ternary at tls-front-door.mjs:286-288 rather
    // than the pass-through branch.
    const inner = new Error("DEV_TLS_CERTIFICATE_INVALID");

    const caught = await rejectionOf(startAttestedDevTlsFrontDoor({
      operations: tlsReadinessOperations({ startFrontDoor: () => Promise.reject(inner) })
    }));

    expect((caught as Error).message).toBe("DEV_TLS_FRONT_DOOR_START_FAILED");
    expect((caught as Error).cause).toBe(inner);
    expect(developmentAuthStackErrorCode(caught))
      .toBe("DEV_TLS_FRONT_DOOR_START_FAILED:DEV_TLS_CERTIFICATE_INVALID");
  });

  it("joins the inner DEV code of a front-door CLEANUP failure instead of stopping at the outer code", async () => {
    // The owned front door's `close` arrives through the injected operations, so its
    // rejection is whatever that implementation raises. DEV_TLS_LISTEN_FAILED is drawn from
    // this module's own vocabulary (tls-front-door.mjs:241); the depth assertion below is
    // what pins the property, and it does not depend on the producer.
    const inner = new Error("DEV_TLS_LISTEN_FAILED");
    const unreadyUi: DevTlsUiProbe = Object.freeze({
      login: Object.freeze({ ...DEV_TLS_READY_UI.login, statusCode: 503 }),
      session: DEV_TLS_READY_UI.session
    });

    const caught = await rejectionOf(startAttestedDevTlsFrontDoor({
      operations: tlsReadinessOperations({
        startFrontDoor: async () => Object.freeze({
          port: 3_000,
          close: () => Promise.reject(inner)
        }),
        probePublicUi: async () => unreadyUi
      })
    }));

    expect((caught as Error).message).toBe("DEV_TLS_FRONT_DOOR_CLEANUP_FAILED");
    expect((caught as Error).cause).toBe(inner);
    expect(developmentAuthStackErrorCode(caught))
      .toBe("DEV_TLS_FRONT_DOOR_CLEANUP_FAILED:DEV_TLS_LISTEN_FAILED");
  });

  // The neighbouring control, named for what it EXECUTES. F-DIAG-TAIL-N (codex diag-tail r1
  // N1): this row's earlier name and comment claimed a front-door error raised by
  // `startFrontDoor` and passed through the ternary UNWRAPPED. It never reaches that branch.
  // `tlsReadinessOperations` above supplies the DEFAULT, SUCCEEDING `startFrontDoor` (:444-445)
  // and is overridden here only on `probePublicUi`, so nothing is raised at start; the error
  // asserted below is the readiness timeout raised after the probe budget is spent, which is
  // why its message is DEV_TLS_PUBLIC_READINESS_TIMEOUT and not a start code.
  // What it still controls for, and why it belongs beside the two rows above: a "fix" that made
  // the constructor stop wrapping, or that attached a cause everywhere, would also satisfy
  // those two rows — this row fails if a cause is attached to an error that has none.
  // NOT covered here: the start-rejection pass-through itself. No row in this file exercises
  // an error that IS a DevTlsFrontDoorError arriving at that ternary.
  it("leaves a no-cause readiness-timeout error untouched when every public probe is unready", async () => {
    const caught = await rejectionOf(startAttestedDevTlsFrontDoor({
      operations: tlsReadinessOperations({ probePublicUi: async () => null }),
      maximumProbeAttempts: 1
    }));

    expect((caught as Error).message).toBe("DEV_TLS_PUBLIC_READINESS_TIMEOUT");
    expect((caught as Error).cause).toBeUndefined();
    expect(developmentAuthStackErrorCode(caught)).toBe("DEV_TLS_PUBLIC_READINESS_TIMEOUT");
  });
});
