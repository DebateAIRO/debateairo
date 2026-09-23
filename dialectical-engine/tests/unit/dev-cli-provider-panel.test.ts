import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { canonicalRegisterJson, computeRegisterSnapshotSha256, parseRegisterVersionText } from "@debateai/register";
import { describe, expect, it, vi } from "vitest";
import {
  DEVELOPMENT_CLI_MODEL_PINS,
  DEVELOPMENT_CLI_PROVIDER_ROSTER,
  startDevelopmentCliProviderPanel,
  type DevelopmentCliProviderPanelOperations,
  type DevelopmentCliRelay
} from "../../apps/runner/src/dev-cli-provider-panel.js";
import { SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE } from "../../apps/runner/src/dev-auth-stack-profile.js";

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
    starts: Object.freeze([start(0), start(1), start(2), start(3), start(4)] as const)
  });
}

describe("development real CLI provider panel", () => {
  it("includes every successful CLI handshake and keeps failed CLIs explicitly absent", async () => {
    const codex = relay(8791, "OpenAI", "gpt-real");
    const codexSol = relay(8795, "OpenAI", "gpt-premium-real");
    const claude = relay(8792, "Anthropic", "claude-real");
    const claudeOpus = relay(8796, "Anthropic", "claude-premium-real");
    const runtime = operations([codex, codexSol, claude, claudeOpus, new Error("logged out")]);

    const handle = await startDevelopmentCliProviderPanel(runtime);
    expect(handle.healthyProviderRefs).toEqual([
      "development:codex-cli", "development:codex-premium-cli",
      "development:claude-cli", "development:claude-premium-cli"
    ]);
    expect(handle.panel.configuredProviders).toEqual([
      { providerRef: "development:codex-cli", adapterKind: "openai-compatible-http", maker: "OpenAI" },
      { providerRef: "development:codex-premium-cli", adapterKind: "openai-compatible-http", maker: "OpenAI" },
      { providerRef: "development:claude-cli", adapterKind: "openai-compatible-http", maker: "Anthropic" },
      { providerRef: "development:claude-premium-cli", adapterKind: "openai-compatible-http", maker: "Anthropic" },
      { providerRef: "development:grok-cli", adapterKind: "openai-compatible-http", maker: "xAI" }
    ]);
    expect(handle.panel.targets.map(({ providerRef, model, authorizationHeader }) => ({
      providerRef, model, authorizationHeader
    }))).toEqual([
      { providerRef: "development:codex-cli", model: "gpt-real", authorizationHeader: "Bearer openai-test" },
      { providerRef: "development:codex-premium-cli", model: "gpt-premium-real", authorizationHeader: "Bearer openai-test" },
      { providerRef: "development:claude-cli", model: "claude-real", authorizationHeader: "Bearer anthropic-test" },
      { providerRef: "development:claude-premium-cli", model: "claude-premium-real", authorizationHeader: "Bearer anthropic-test" },
      { providerRef: "development:grok-cli", model: "CLI_HANDSHAKE_UNAVAILABLE", authorizationHeader: undefined }
    ]);
    for (const [index, start] of runtime.starts.entries()) {
      expect(start).toHaveBeenCalledWith(DEVELOPMENT_CLI_PROVIDER_ROSTER[index]!.port);
    }

    await Promise.all([handle.stop(), handle.stop()]);
    expect(codex.close).toHaveBeenCalledTimes(1);
    expect(claude.close).toHaveBeenCalledTimes(1);
    expect(codexSol.close).toHaveBeenCalledTimes(1);
    expect(claudeOpus.close).toHaveBeenCalledTimes(1);
  });

  it("allows the one real CLI that answered without fabricating another maker", async () => {
    const codex = relay(8791, "OpenAI", "gpt-real");
    const handle = await startDevelopmentCliProviderPanel(operations([
      codex, new Error("logged out"), new Error("logged out"),
      new Error("logged out"), new Error("logged out")
    ]));
    expect(handle.healthyProviderRefs).toEqual(["development:codex-cli"]);
    expect(handle.panel.targets.map(({ model }) => model)).toEqual([
      "gpt-real", "CLI_HANDSHAKE_UNAVAILABLE", "CLI_HANDSHAKE_UNAVAILABLE",
      "CLI_HANDSHAKE_UNAVAILABLE", "CLI_HANDSHAKE_UNAVAILABLE"
    ]);
    await handle.stop();
    expect(codex.close).toHaveBeenCalledTimes(1);
  });

  it("refuses when no real CLI answers", async () => {
    await expect(startDevelopmentCliProviderPanel(operations([
      new Error("logged out"), new Error("logged out"), new Error("logged out"),
      new Error("logged out"), new Error("logged out")
    ]))).rejects.toThrow("DEV_CLI_PROVIDER_PANEL_INSUFFICIENT_MAKERS");
  });

  it("starts every relay on the selected support-preview port", async () => {
    const ports = SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE.providerPorts;
    const runtime = operations([
      relay(ports[0], "OpenAI", "gpt-real"),
      relay(ports[1], "OpenAI", "gpt-premium-real"),
      relay(ports[2], "Anthropic", "claude-real"),
      relay(ports[3], "Anthropic", "claude-premium-real"),
      relay(ports[4], "xAI", "grok-real")
    ]);
    const handle = await startDevelopmentCliProviderPanel(
      runtime,
      SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE
    );
    for (const [index, start] of runtime.starts.entries()) {
      expect(start).toHaveBeenCalledWith(ports[index]);
    }
    await handle.stop();
  });
});

describe("development CLI model pins", () => {
  it("carries one slot per roster member so BOTH plan tiers are admissible from one panel", () => {
    // V, 2026-09-12: "Both free and premium need to be accessible at the same time."
    // Discovery is 1:1 with the configured provider set, so every roster model of every
    // tier needs its own slot; one slot per maker could only ever serve one tier.
    const rosterModels = [...PLAN_TIER_ROSTERS.free, ...PLAN_TIER_ROSTERS.premium];
    expect(DEVELOPMENT_CLI_PROVIDER_ROSTER).toHaveLength(rosterModels.length);
    expect([...new Set(DEVELOPMENT_CLI_PROVIDER_ROSTER.map(({ port }) => port))])
      .toHaveLength(rosterModels.length);
    expect([...new Set(DEVELOPMENT_CLI_PROVIDER_ROSTER.map(({ providerRef }) => providerRef))])
      .toHaveLength(rosterModels.length);
    expect(DEVELOPMENT_CLI_MODEL_PINS.grokSandboxProfile).toBe("none");
  });

  it("pins each Codex and Claude slot to the roster model that slot exists to serve", () => {
    expect(PLAN_TIER_ROSTERS.free).toContain(DEVELOPMENT_CLI_MODEL_PINS.codexFreeModel);
    expect(PLAN_TIER_ROSTERS.premium).toContain(DEVELOPMENT_CLI_MODEL_PINS.codexPremiumModel);
    expect(DEVELOPMENT_CLI_MODEL_PINS.codexFreeModel)
      .not.toBe(DEVELOPMENT_CLI_MODEL_PINS.codexPremiumModel);
    const anthropic = (models: readonly string[]) =>
      models.find((modelId) => modelId.startsWith("claude-"))!.split(/[^a-z0-9]+/u);
    expect(anthropic(PLAN_TIER_ROSTERS.free)).toContain(DEVELOPMENT_CLI_MODEL_PINS.claudeFreeAlias);
    expect(anthropic(PLAN_TIER_ROSTERS.premium)).toContain(DEVELOPMENT_CLI_MODEL_PINS.claudePremiumAlias);
    expect(DEVELOPMENT_CLI_MODEL_PINS.claudeFreeAlias)
      .not.toBe(DEVELOPMENT_CLI_MODEL_PINS.claudePremiumAlias);
  });
});

describe("development provider-set publication", () => {
  it.each([false, true])("publishes the provider set and preserves sealed roles when present: %s", async (hasRoles) => {
    // The bootstrap register (v1-4) is append-only and capped at 4, so a deployment that
    // grows a provider slot supersedes the old set by publication, never by edit.
    const { developmentConfiguredProviderPanel } = await import("../../apps/runner/src/dev-provider-panel.js");
    const {
      developmentProviderSetPublicationId,
      publishDevelopmentDeploymentRegisterProviderSet,
      readDevelopmentDeploymentRegisterReceipt
    } = await import("../../apps/runner/src/dev-deployment-register.js");
    const repositoryRoot = await mkdtemp(join(tmpdir(), "dev-provider-set-"));
    await mkdir(join(repositoryRoot, ".local", "dev-auth"), { recursive: true, mode: 0o700 });
    const panel = developmentConfiguredProviderPanel();
    expect(panel.configuredProviders.map(({ providerRef }) => providerRef))
      .toEqual(DEVELOPMENT_CLI_PROVIDER_ROSTER.map(({ providerRef }) => providerRef));

    const seen: unknown[] = [];
    const roleRows = hasRoles ? [
      { rowKey: "synthesizerRoleRef", valueJsonText: canonicalRegisterJson({kind: "SYNTHESIZER_ROLE_REF", providerRef: "development:codex-premium-cli", provisional: false}), sourceRef: "operator:selected-synthesizer" },
      { rowKey: "evaluatorRoleRef", valueJsonText: canonicalRegisterJson({kind: "EVALUATOR_ROLE_REF", providerRef: "development:claude-premium-cli", provisional: false}), sourceRef: "operator:selected-evaluator" }
    ] : [];
    const receipt = await publishDevelopmentDeploymentRegisterProviderSet({
      adminPool: undefined as never,
      providerPanel: panel,
      repositoryRoot,
      baseRegisterVersion: parseRegisterVersionText("4"),
      operations: {
        readBaseAlgorithmRows: async () => roleRows,
        publishGeneral: async (input) => {
          seen.push(input);
          return Object.freeze({
            registerVersion: parseRegisterVersionText("9"),
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
    for (const row of roleRows) expect(published.rows).toContainEqual(row);
    const providerRow = published.rows.find(({ rowKey }) => rowKey === "configuredProviderSet");
    expect(JSON.parse(providerRow!.valueJsonText).providers.map((p: { providerRef: string }) => p.providerRef))
      .toEqual(DEVELOPMENT_CLI_PROVIDER_ROSTER.map(({ providerRef }) => providerRef));
    // deterministic id: republishing the same set on the same base replays, never forks
    expect(published.publicationId).toBe(
      developmentProviderSetPublicationId(parseRegisterVersionText("4"), computeRegisterSnapshotSha256(published.rows as never))
    );
    expect(published.publicationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(receipt.registerVersion).toBe("9");
    await expect(readDevelopmentDeploymentRegisterReceipt(repositoryRoot))
      .resolves.toMatchObject({ registerVersion: "9", rowCount: published.rows.length });
    await rm(repositoryRoot, { recursive: true, force: true });
  });
});
