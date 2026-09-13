import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadModelConfig, type ModelConfig } from "@debateai/model-config";
import { computeRegisterSnapshotSha256, parseRegisterVersionText } from "@debateai/register";
import { describe, expect, it, vi } from "vitest";
const relayStarts = vi.hoisted(() => ({
  codex: vi.fn(async (input: Readonly<{ port: number; model: string }>) => Object.freeze({
    port: input.port,
    baseUrl: `http://127.0.0.1:${input.port}`,
    authorizationHeader: "test-codex-header",
    maker: "OpenAI",
    model: input.model,
    close: vi.fn(async () => undefined)
  })),
  claude: vi.fn(async (input: Readonly<{ port: number; model: string }>) => Object.freeze({
    port: input.port,
    baseUrl: `http://127.0.0.1:${input.port}`,
    authorizationHeader: "test-claude-header",
    maker: "Anthropic",
    model: input.model,
    close: vi.fn(async () => undefined)
  })),
  grok: vi.fn(async (input: Readonly<{ port: number; model: string }>) => Object.freeze({
    port: input.port,
    baseUrl: `http://127.0.0.1:${input.port}`,
    authorizationHeader: "test-grok-header",
    maker: "xAI",
    model: input.model,
    close: vi.fn(async () => undefined)
  }))
}));
vi.mock("../../acceptance/model-shim.js", () => ({ startModelShim: relayStarts.codex }));
vi.mock("../../acceptance/claude-relay.js", () => ({ startClaudeRelay: relayStarts.claude }));
vi.mock("../../acceptance/grok-relay.js", () => ({ startGrokRelay: relayStarts.grok }));
import {
  createDevelopmentCliProviderPanelOperations,
  startDevelopmentCliProviderPanel,
  type DevelopmentCliProviderPanelOperations,
  type DevelopmentCliRelay
} from "../../apps/runner/src/dev-cli-provider-panel.js";
import { developmentProviderSlots } from "../../apps/runner/src/dev-provider-panel.js";
import {
  buildDevelopmentProviderPanel,
  DEVELOPMENT_UNAVAILABLE_CLI_MODEL
} from "../../apps/runner/src/dev-provider-panel.js";

function relay(port: number, maker: string, model: string): DevelopmentCliRelay & {
  close: ReturnType<typeof vi.fn>;
} {
  return Object.freeze({
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    authorizationHeader: `Bearer ${maker.toLowerCase()}-test`,
    maker,
    model,
    close: vi.fn(async () => undefined)
  });
}

function operations(results: readonly (DevelopmentCliRelay | Error)[]): DevelopmentCliProviderPanelOperations {
  const start = (index: number) => vi.fn(async () => {
    const result = results[index];
    if (result instanceof Error || result === undefined) throw result ?? new Error("missing");
    return result;
  });
  return Object.freeze({
    starts: Object.freeze(results.map((_, index) => start(index)))
  });
}

describe("development real CLI provider panel", () => {
  it("accepts the configured Z.AI API base URL and rejects API or CLI base drift", () => {
    const config = loadModelConfig(process.cwd());
    const slots = developmentProviderSlots(config);
    const configured = slots.map(({ providerRef, adapterKind, maker }) => ({
      providerRef, adapterKind, maker
    }));
    const observations = slots.map((slot) => ({
      providerRef: slot.providerRef,
      baseUrl: slot.transport === "cli"
        ? `http://127.0.0.1:${slot.port}/v1`
        : slot.baseUrl!,
      model: DEVELOPMENT_UNAVAILABLE_CLI_MODEL
    }));
    expect(() => buildDevelopmentProviderPanel(observations, configured)).not.toThrow();
    const withBaseUrl = (providerRef: string, baseUrl: string) => observations.map((observation) =>
      observation.providerRef === providerRef ? { ...observation, baseUrl } : observation
    );
    expect(() => buildDevelopmentProviderPanel(
      withBaseUrl("development:codex-premium-cli", "http://127.0.0.1:9999/v1"),
      configured
    )).toThrow("DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID");
    expect(() => buildDevelopmentProviderPanel(
      withBaseUrl("development:zai-free-api", "https://example.invalid/v1"),
      configured
    )).toThrow("DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID");
  });

  it("catalogues the complete tier and transport-word cross product without a support-port collision", async () => {
    const providerPanel = await import("../../apps/runner/src/dev-provider-panel.js") as Readonly<{
      DEVELOPMENT_PROVIDER_SLOT_CATALOGUE?: readonly Readonly<{
        tier: "free" | "premium";
        word: string;
        transport: "cli" | "api";
        providerRef: string;
        port?: number;
      }>[];
    }>;
    expect(providerPanel.DEVELOPMENT_PROVIDER_SLOT_CATALOGUE).toBeDefined();
    const catalogue = providerPanel.DEVELOPMENT_PROVIDER_SLOT_CATALOGUE!;
    expect(catalogue.map(({ tier, word }) => `${tier}:${word}`).sort()).toEqual([
      "free:claude", "free:codex", "free:grok", "free:openai", "free:zai",
      "premium:claude", "premium:codex", "premium:grok", "premium:openai", "premium:zai"
    ]);
    expect(new Set(catalogue.map(({ providerRef }) => providerRef)).size).toBe(10);
    const ports = catalogue.flatMap(({ port }) => port === undefined ? [] : [port]).sort();
    expect(ports).toEqual([8791, 8792, 8793, 8795, 8796, 8797]);
    expect(ports).not.toContain(8794);
  });

  it("derives one stable provider slot per entry without using the model id", async () => {
    const providerPanel = await import("../../apps/runner/src/dev-provider-panel.js") as Readonly<{
      developmentProviderSlots?: (config: ModelConfig) => readonly Readonly<{
        tier: "free" | "premium";
        word: string;
        providerRef: string;
        maker: string;
        adapterKind: string;
        model: string;
      }>[];
    }>;
    expect(providerPanel.developmentProviderSlots).toBeTypeOf("function");
    const slots = (config: ModelConfig) => providerPanel.developmentProviderSlots!(config);
    const committed = loadModelConfig(process.cwd());
    const withFreeGrok = {
      ...committed,
      free: [...committed.free, {
        transport: "cli", tier: "free", cli: "grok", model: "grok-4.6-build"
      }]
    } as ModelConfig;
    const withoutPremiumGrok = {
      ...committed,
      premium: committed.premium.filter((entry) => entry.transport !== "cli" || entry.cli !== "grok")
    } as ModelConfig;
    expect(slots(committed)).toHaveLength(5);
    expect(slots(withFreeGrok)).toHaveLength(6);
    expect(slots(withoutPremiumGrok)).toHaveLength(4);
    expect(new Set(slots(withFreeGrok).map(({ providerRef }) => providerRef)).size).toBe(6);

    const edited = {
      ...committed,
      free: committed.free.map((entry) => entry.transport === "api" && entry.api === "zai"
        ? { ...entry, model: "glm-5.3" }
        : entry)
    } as ModelConfig;
    const projection = (config: ModelConfig) => slots(config)
      .map(({ providerRef, maker, adapterKind }) => ({ providerRef, maker, adapterKind }))
      .sort((left, right) => left.providerRef.localeCompare(right.providerRef));
    expect(projection(edited)).toEqual(projection(committed));
    expect(slots(edited).find(({ providerRef }) => providerRef === "development:zai-free-api")?.model)
      .toBe("glm-5.3");

    const duplicated = {
      ...committed,
      free: [...committed.free, {
        transport: "cli", tier: "free", cli: "grok", model: "grok-4.6-build"
      }]
    } as ModelConfig;
    const duplicateSlots = slots(duplicated).filter(({ word }) => word === "grok");
    expect(duplicateSlots.map(({ providerRef }) => providerRef).sort()).toEqual([
      "development:grok-cli", "development:grok-free-cli"
    ]);
    expect(new Set(duplicateSlots.map(({ model }) => model))).toEqual(new Set(["grok-4.6-build"]));
  });

  it("orders CLI slots before API slots with Premium preceding Free in each group", async () => {
    const { developmentProviderSlots } = await import("../../apps/runner/src/dev-provider-panel.js");
    const slots = developmentProviderSlots(loadModelConfig(process.cwd()));
    expect(slots.map(({ providerRef }) => providerRef)).toEqual([
      "development:codex-premium-cli",
      "development:claude-premium-cli",
      "development:grok-cli",
      "development:openai-free-api",
      "development:zai-free-api"
    ]);
    expect(slots[0]?.transport).toBe("cli");
  });

  it("includes every successful CLI handshake and keeps failed CLIs explicitly absent", async () => {
    const config = loadModelConfig(process.cwd());
    const codexSol = relay(8795, "OpenAI", "gpt-premium-real");
    const claudeOpus = relay(8796, "Anthropic", "claude-premium-real");
    const grok = relay(8793, "xAI", "grok-premium-real");
    const runtime = operations([codexSol, claudeOpus, grok]);

    const handle = await startDevelopmentCliProviderPanel(config, runtime);
    expect(handle.healthyProviderRefs).toEqual([
      "development:codex-premium-cli", "development:claude-premium-cli",
      "development:grok-cli"
    ]);
    expect(handle.panel.configuredProviders).toEqual([
      { providerRef: "development:codex-premium-cli", adapterKind: "openai-compatible-http", maker: "OpenAI" },
      { providerRef: "development:claude-premium-cli", adapterKind: "openai-compatible-http", maker: "Anthropic" },
      { providerRef: "development:grok-cli", adapterKind: "openai-compatible-http", maker: "xAI" },
      { providerRef: "development:openai-free-api", adapterKind: "openai-compatible-http", maker: "OpenAI" },
      { providerRef: "development:zai-free-api", adapterKind: "openai-compatible-http", maker: "Z.AI" }
    ]);
    expect(handle.panel.targets.map(({ providerRef, model, authorizationHeader }) => ({
      providerRef, model, authorizationHeader
    }))).toEqual([
      { providerRef: "development:codex-premium-cli", model: "gpt-premium-real", authorizationHeader: "Bearer openai-test" },
      { providerRef: "development:claude-premium-cli", model: "claude-premium-real", authorizationHeader: "Bearer anthropic-test" },
      { providerRef: "development:grok-cli", model: "grok-premium-real", authorizationHeader: "Bearer xai-test" },
      { providerRef: "development:openai-free-api", model: "CLI_HANDSHAKE_UNAVAILABLE", authorizationHeader: undefined },
      { providerRef: "development:zai-free-api", model: "CLI_HANDSHAKE_UNAVAILABLE", authorizationHeader: undefined }
    ]);
    const cliSlots = developmentProviderSlots(config).filter(({ transport }) => transport === "cli");
    for (const [index, start] of runtime.starts.entries()) {
      expect(start).toHaveBeenCalledWith(cliSlots[index]!.port);
    }

    await Promise.all([handle.stop(), handle.stop()]);
    expect(codexSol.close).toHaveBeenCalledTimes(1);
    expect(claudeOpus.close).toHaveBeenCalledTimes(1);
    expect(grok.close).toHaveBeenCalledTimes(1);
  });

  it("allows the one real CLI that answered without fabricating another maker", async () => {
    const config = loadModelConfig(process.cwd());
    const codex = relay(8795, "OpenAI", "gpt-real");
    const handle = await startDevelopmentCliProviderPanel(config, operations([
      codex, new Error("logged out"), new Error("logged out")
    ]));
    expect(handle.healthyProviderRefs).toEqual(["development:codex-premium-cli"]);
    expect(handle.panel.targets.map(({ model }) => model)).toEqual([
      "gpt-real", "CLI_HANDSHAKE_UNAVAILABLE", "CLI_HANDSHAKE_UNAVAILABLE",
      "CLI_HANDSHAKE_UNAVAILABLE", "CLI_HANDSHAKE_UNAVAILABLE"
    ]);
    await handle.stop();
    expect(codex.close).toHaveBeenCalledTimes(1);
  });

  it("refuses when no real CLI answers", async () => {
    await expect(startDevelopmentCliProviderPanel(loadModelConfig(process.cwd()), operations([
      new Error("logged out"), new Error("logged out"), new Error("logged out")
    ]))).rejects.toThrow("DEV_CLI_PROVIDER_PANEL_INSUFFICIENT_MAKERS");
  });
});

describe("development CLI full-id starts", () => {
  it("starts the three configured CLI entries with the full Codex model id", async () => {
    relayStarts.codex.mockClear();
    const operations = createDevelopmentCliProviderPanelOperations(loadModelConfig(process.cwd()));
    expect(operations.starts).toHaveLength(3);
    await operations.starts[0]!(8795);
    expect(relayStarts.codex).toHaveBeenCalledWith({
      port: 8795, timeoutMs: 180000, model: "gpt-5.6-sol"
    });
  });

  it("passes the full Claude model id without a modelAlias key", async () => {
    relayStarts.claude.mockClear();
    const operations = createDevelopmentCliProviderPanelOperations(loadModelConfig(process.cwd()));
    await operations.starts[1]!(8796);
    expect(relayStarts.claude).toHaveBeenCalledWith({
      port: 8796, timeoutMs: 180000, model: "claude-opus-5"
    });
    expect(relayStarts.claude.mock.calls[0]?.[0]).not.toHaveProperty("modelAlias");
  });

  it("passes the full Grok model id without allocating a start to either API entry", async () => {
    relayStarts.grok.mockClear();
    const operations = createDevelopmentCliProviderPanelOperations(loadModelConfig(process.cwd()));
    expect(operations.starts).toHaveLength(3);
    await operations.starts[2]!(8793);
    expect(relayStarts.grok).toHaveBeenCalledWith({
      port: 8793, timeoutMs: 180000, model: "grok-4.6-build", sandboxProfile: "none"
    });
  });
});

describe("development provider-set publication", () => {
  it("publishes the roster's configured set as a new version on the sealed base and moves the receipt", async () => {
    // The bootstrap register (v1-4) is append-only and capped at 4, so a deployment that
    // grows a provider slot supersedes the old set by publication, never by edit.
    const {
      developmentConfiguredProviderPanel,
      loadModelConfigConfiguredProviders
    } = await import("../../apps/runner/src/dev-provider-panel.js");
    const {
      developmentProviderSetPublicationId,
      developmentPlanTierRosters,
      publishDevelopmentDeploymentRegisterProviderSet,
      readDevelopmentDeploymentRegisterReceipt
    } = await import("../../apps/runner/src/dev-deployment-register.js");
    const repositoryRoot = await mkdtemp(join(tmpdir(), "dev-provider-set-"));
    await mkdir(join(repositoryRoot, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
    const panel = developmentConfiguredProviderPanel(loadModelConfigConfiguredProviders(process.cwd()));
    const slots = developmentProviderSlots(loadModelConfig(process.cwd()));
    expect(panel.configuredProviders.map(({ providerRef }) => providerRef))
      .toEqual(slots.map(({ providerRef }) => providerRef));

    const seen: unknown[] = [];
    const baseRegisterVersion = parseRegisterVersionText("4");
    const publishedRegisterVersion = parseRegisterVersionText("9");
    const receipt = await publishDevelopmentDeploymentRegisterProviderSet({
      adminPool: undefined as never,
      planTierRosters: developmentPlanTierRosters(loadModelConfig(process.cwd())),
      providerPanel: panel,
      repositoryRoot,
      baseRegisterVersion,
      operations: {
        publishGeneral: async (input) => {
          seen.push(input);
          return Object.freeze({
            registerVersion: publishedRegisterVersion,
            baseRegisterVersion: input.baseRegisterVersion,
            publicationId: input.publicationId,
            publicationKind: "GENERAL" as const,
            requestSha256: "0".repeat(64),
            snapshotSha256: computeRegisterSnapshotSha256(input.rows),
            rowCount: input.rows.length,
            recordedAt: new Date(0)
          });
        }
      }
    });

    const published = seen[0] as { publicationId: string; baseRegisterVersion: string; rows: readonly { rowKey: string; valueJsonText: string }[] };
    expect(published.baseRegisterVersion).toBe("4");
    const providerRow = published.rows.find(({ rowKey }) => rowKey === "configuredProviderSet");
    expect(JSON.parse(providerRow!.valueJsonText).providers.map((p: { providerRef: string }) => p.providerRef))
      .toEqual(slots.map(({ providerRef }) => providerRef));
    // deterministic id: republishing the same set on the same base replays, never forks
    expect(published.publicationId).toBe(
      developmentProviderSetPublicationId(
        baseRegisterVersion,
        computeRegisterSnapshotSha256(published.rows as never)
      )
    );
    expect(published.publicationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(receipt.registerVersion).toBe("9");
    await expect(readDevelopmentDeploymentRegisterReceipt(repositoryRoot))
      .resolves.toMatchObject({ registerVersion: "9", rowCount: published.rows.length });
    await rm(repositoryRoot, { recursive: true, force: true });
  });
});
