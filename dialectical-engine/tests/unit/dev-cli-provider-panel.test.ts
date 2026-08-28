import { describe, expect, it, vi } from "vitest";
import {
  DEVELOPMENT_CLI_PROVIDER_ROSTER,
  startDevelopmentCliProviderPanel,
  type DevelopmentCliProviderPanelOperations,
  type DevelopmentCliRelay
} from "../../apps/runner/src/dev-cli-provider-panel.js";

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
    starts: Object.freeze([start(0), start(1), start(2)] as const)
  });
}

describe("development real CLI provider panel", () => {
  it("includes every successful CLI handshake and keeps failed CLIs explicitly absent", async () => {
    const codex = relay(8791, "OpenAI", "gpt-real");
    const claude = relay(8792, "Anthropic", "claude-real");
    const runtime = operations([codex, claude, new Error("logged out")]);

    const handle = await startDevelopmentCliProviderPanel(runtime);
    expect(handle.healthyProviderRefs).toEqual([
      "development:codex-cli", "development:claude-cli"
    ]);
    expect(handle.panel.configuredProviders).toEqual([
      { providerRef: "development:codex-cli", adapterKind: "openai-compatible-http", maker: "OpenAI" },
      { providerRef: "development:claude-cli", adapterKind: "openai-compatible-http", maker: "Anthropic" },
      { providerRef: "development:grok-cli", adapterKind: "openai-compatible-http", maker: "xAI" }
    ]);
    expect(handle.panel.targets.map(({ providerRef, model, authorizationHeader }) => ({
      providerRef, model, authorizationHeader
    }))).toEqual([
      { providerRef: "development:codex-cli", model: "gpt-real", authorizationHeader: "Bearer openai-test" },
      { providerRef: "development:claude-cli", model: "claude-real", authorizationHeader: "Bearer anthropic-test" },
      { providerRef: "development:grok-cli", model: "CLI_HANDSHAKE_UNAVAILABLE", authorizationHeader: undefined }
    ]);
    for (const [index, start] of runtime.starts.entries()) {
      expect(start).toHaveBeenCalledWith(DEVELOPMENT_CLI_PROVIDER_ROSTER[index]!.port);
    }

    await Promise.all([handle.stop(), handle.stop()]);
    expect(codex.close).toHaveBeenCalledTimes(1);
    expect(claude.close).toHaveBeenCalledTimes(1);
  });

  it("allows the one real CLI that answered without fabricating another maker", async () => {
    const codex = relay(8791, "OpenAI", "gpt-real");
    const handle = await startDevelopmentCliProviderPanel(operations([
      codex, new Error("logged out"), new Error("logged out")
    ]));
    expect(handle.healthyProviderRefs).toEqual(["development:codex-cli"]);
    expect(handle.panel.targets.map(({ model }) => model)).toEqual([
      "gpt-real", "CLI_HANDSHAKE_UNAVAILABLE", "CLI_HANDSHAKE_UNAVAILABLE"
    ]);
    await handle.stop();
    expect(codex.close).toHaveBeenCalledTimes(1);
  });

  it("refuses when no real CLI answers", async () => {
    await expect(startDevelopmentCliProviderPanel(operations([
      new Error("logged out"), new Error("logged out"), new Error("logged out")
    ]))).rejects.toThrow("DEV_CLI_PROVIDER_PANEL_INSUFFICIENT_MAKERS");
  });
});
