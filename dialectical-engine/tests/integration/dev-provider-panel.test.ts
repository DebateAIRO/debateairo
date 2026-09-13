import { describe, expect, it } from "vitest";
import { loadModelConfig } from "@debateai/model-config";
import {
  buildDevelopmentProviderPanel,
  DEVELOPMENT_MINIMUM_DISTINCT_MAKERS,
  DEVELOPMENT_UNAVAILABLE_CLI_MODEL,
  developmentProviderSlots,
  loadDevelopmentProviderPanelFromEnvironment,
  parseDevelopmentProviderPanelTargets
} from "../../apps/runner/src/dev-provider-panel.js";

const slots = developmentProviderSlots(loadModelConfig(process.cwd()));
const LIVE_DEVELOPMENT_PROVIDER_PANEL = buildDevelopmentProviderPanel(slots.map((slot) => ({
  providerRef: slot.providerRef,
  baseUrl: slot.transport === "cli"
    ? `http://127.0.0.1:${slot.port}/v1`
    : slot.baseUrl!,
  model: slot.transport === "cli" ? slot.model : DEVELOPMENT_UNAVAILABLE_CLI_MODEL,
  ...(slot.transport === "cli" ? { authorizationHeader: "test-relay-header" } : {})
})), slots.map(({ providerRef, adapterKind, maker }) => ({ providerRef, adapterKind, maker })));

describe("real development CLI provider panel", () => {
  it("loads the exact live CLI targets without changing the fixed maker order", () => {
    const panel = loadDevelopmentProviderPanelFromEnvironment({
      DEBATEAI_DEV_PROVIDER_TARGETS_JSON: LIVE_DEVELOPMENT_PROVIDER_PANEL.targetsJson
    }, LIVE_DEVELOPMENT_PROVIDER_PANEL.configuredProviders);
    expect(panel).toEqual(LIVE_DEVELOPMENT_PROVIDER_PANEL);
    expect(panel.requiredDistinctMakers).toBe(DEVELOPMENT_MINIMUM_DISTINCT_MAKERS);
    expect(panel.healthyProviderRefs).toEqual([
      "development:codex-premium-cli", "development:claude-premium-cli",
      "development:grok-cli"
    ]);
    expect(panel.targets.map(({ providerRef }) => providerRef)).toEqual([
      "development:codex-premium-cli", "development:claude-premium-cli",
      "development:grok-cli", "development:openai-free-api", "development:zai-free-api"
    ]);
  });

  it("fails closed when the live handshake result is absent or not the exact CLI roster", () => {
    expect(() => loadDevelopmentProviderPanelFromEnvironment(
      {}, LIVE_DEVELOPMENT_PROVIDER_PANEL.configuredProviders
    ))
      .toThrow("DEV_CLI_PROVIDER_PANEL_REQUIRED");
    const rows = JSON.parse(LIVE_DEVELOPMENT_PROVIDER_PANEL.targetsJson) as Record<string, unknown>[];
    expect(() => parseDevelopmentProviderPanelTargets(
      JSON.stringify(rows.slice(0, 2)), LIVE_DEVELOPMENT_PROVIDER_PANEL.configuredProviders
    ))
      .toThrow("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
    expect(() => parseDevelopmentProviderPanelTargets(JSON.stringify(rows.map((row, index) =>
      index === 0 ? { ...row, base_url: "https://external.example/v1" } : row
    )), LIVE_DEVELOPMENT_PROVIDER_PANEL.configuredProviders))
      .toThrow("DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID");
  });

  it("rejects the removed scaffold and healthy-looking targets without relay credentials", () => {
    const rows = JSON.parse(LIVE_DEVELOPMENT_PROVIDER_PANEL.targetsJson) as Record<string, unknown>[];
    expect(() => parseDevelopmentProviderPanelTargets(JSON.stringify(rows.map((row, index) =>
      index === 0 ? { ...row, model: "qa-deterministic-v1" } : row
    )), LIVE_DEVELOPMENT_PROVIDER_PANEL.configuredProviders))
      .toThrow("DEV_CLI_PROVIDER_PANEL_TARGET_INVALID");
    expect(() => parseDevelopmentProviderPanelTargets(JSON.stringify(rows.map((row, index) => {
      if (index !== 0) return row;
      const { authorization_header: _removed, ...withoutAuthorization } = row;
      return withoutAuthorization;
    })), LIVE_DEVELOPMENT_PROVIDER_PANEL.configuredProviders))
      .toThrow("DEV_CLI_PROVIDER_PANEL_TARGET_INVALID");
  });
});
