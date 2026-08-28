import { describe, expect, it } from "vitest";
import {
  DEVELOPMENT_MINIMUM_DISTINCT_MAKERS,
  loadDevelopmentProviderPanelFromEnvironment,
  parseDevelopmentProviderPanelTargets
} from "../../apps/runner/src/dev-provider-panel.js";
import { TEST_DEVELOPMENT_PROVIDER_PANEL } from "../support/developmentProviderPanel.js";

describe("real development CLI provider panel", () => {
  it("loads the exact live CLI targets without changing the fixed maker order", () => {
    const panel = loadDevelopmentProviderPanelFromEnvironment({
      DEBATEAI_DEV_PROVIDER_TARGETS_JSON: TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson
    });
    expect(panel).toEqual(TEST_DEVELOPMENT_PROVIDER_PANEL);
    expect(panel.requiredDistinctMakers).toBe(DEVELOPMENT_MINIMUM_DISTINCT_MAKERS);
    expect(panel.healthyProviderRefs).toEqual([
      "development:codex-cli", "development:claude-cli"
    ]);
    expect(panel.targets.map(({ providerRef }) => providerRef)).toEqual([
      "development:codex-cli", "development:claude-cli", "development:grok-cli"
    ]);
  });

  it("fails closed when the live handshake result is absent or not the exact CLI roster", () => {
    expect(() => loadDevelopmentProviderPanelFromEnvironment({}))
      .toThrow("DEV_CLI_PROVIDER_PANEL_REQUIRED");
    const rows = JSON.parse(TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson) as Record<string, unknown>[];
    expect(() => parseDevelopmentProviderPanelTargets(JSON.stringify(rows.slice(0, 2))))
      .toThrow("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
    expect(() => parseDevelopmentProviderPanelTargets(JSON.stringify(rows.map((row, index) =>
      index === 0 ? { ...row, base_url: "https://external.example/v1" } : row
    )))).toThrow("DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID");
  });

  it("rejects the removed scaffold and healthy-looking targets without relay credentials", () => {
    const rows = JSON.parse(TEST_DEVELOPMENT_PROVIDER_PANEL.targetsJson) as Record<string, unknown>[];
    expect(() => parseDevelopmentProviderPanelTargets(JSON.stringify(rows.map((row, index) =>
      index === 0 ? { ...row, model: "qa-deterministic-v1" } : row
    )))).toThrow("DEV_CLI_PROVIDER_PANEL_TARGET_INVALID");
    expect(() => parseDevelopmentProviderPanelTargets(JSON.stringify(rows.map((row, index) => {
      if (index !== 0) return row;
      const { authorization_header: _removed, ...withoutAuthorization } = row;
      return withoutAuthorization;
    })))).toThrow("DEV_CLI_PROVIDER_PANEL_TARGET_INVALID");
  });
});
