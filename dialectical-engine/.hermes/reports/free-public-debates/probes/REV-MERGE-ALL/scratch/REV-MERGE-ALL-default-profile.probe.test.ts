// TEMPORARY REVIEW FIXTURE — REV-MERGE-ALL, deleted before handoff. Never committed.
import { loadModelConfig } from "@debateai/model-config";
import { describe, expect, it, vi } from "vitest";
const relayStarts = vi.hoisted(() => {
  const make = (maker: string) => vi.fn(async (input: Readonly<{ port: number; model: string }>) =>
    Object.freeze({
      port: input.port,
      baseUrl: `http://127.0.0.1:${input.port}`,
      authorizationHeader: `Bearer ${maker}-probe`,
      maker,
      model: input.model,
      close: vi.fn(async () => undefined)
    }));
  return { codex: make("OpenAI"), claude: make("Anthropic"), grok: make("xAI") };
});
vi.mock("../../acceptance/model-shim.js", () => ({ startModelShim: relayStarts.codex }));
vi.mock("../../acceptance/claude-relay.js", () => ({ startClaudeRelay: relayStarts.claude }));
vi.mock("../../acceptance/grok-relay.js", () => ({ startGrokRelay: relayStarts.grok }));
import {
  DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE,
  SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE,
  loadDevelopmentAuthStackProfile
} from "../../apps/runner/src/dev-auth-stack-profile.js";
import {
  DEVELOPMENT_PROVIDER_SLOT_CATALOGUE,
  developmentConfiguredProviderPanel,
  developmentProviderSlots,
  loadModelConfigConfiguredProviders
} from "../../apps/runner/src/dev-provider-panel.js";
import {
  createDevelopmentCliProviderPanelOperations,
  startDevelopmentCliProviderPanel
} from "../../apps/runner/src/dev-cli-provider-panel.js";
import { createDevelopmentAuthStackOperations } from "../../apps/runner/src/dev-auth-stack.js";

const REPOSITORY_ROOT = process.cwd();
// The CLI relay ports ours (971e938c) bound before the merge: its catalogue block is byte-identical
// to the merged one and config/models.yaml is byte-identical ours==merged (3 premium CLI entries).
const OURS_CLI_PORTS = [8793, 8795, 8796];
const SUPPORT_PREVIEW_RESERVED = [
  3100, 3101, 8890, 8891, 8892, 8893, 8894, 8895, 8896, 55433, 7177, 8988
];

function everyNumberIn(value: unknown): number[] {
  return [...JSON.stringify(value).matchAll(/\d{3,5}/gu)].map((m) => Number(m[0]));
}

describe("REV-MERGE-ALL probe — the default profile is ours' pre-merge stack", () => {
  it("resolves to the default profile when DEBATEAI_DEV_AUTH_STACK_PROFILE is unset or empty-ish", () => {
    for (const source of [{}, { DEBATEAI_DEV_AUTH_STACK_PROFILE: undefined }, { OTHER: "x" }]) {
      expect(loadDevelopmentAuthStackProfile(source)).toBe(DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE);
    }
    expect(DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE).toEqual({
      name: "default",
      publicOrigin: "https://localhost:3000",
      publicPort: 3000,
      uiPort: 3001,
      apiPort: 8790,
      providerPorts: [8791, 8795, 8792, 8796, 8793],
      supportModelPort: 8794,
      postgresPort: 55432,
      hatchetGrpcPort: 7077,
      hatchetApiPort: 8888,
      composeProjectName: "debateai-v3"
    });
  });

  it("REFUTATION: no spelling of the variable other than support-preview reaches the other stack", () => {
    for (const value of ["", " ", "SUPPORT-PREVIEW", "Support-Preview", "support_preview", "0", "1", "true"]) {
      expect(() => loadDevelopmentAuthStackProfile({ DEBATEAI_DEV_AUTH_STACK_PROFILE: value }))
        .toThrow("DEV_AUTH_STACK_PROFILE_INVALID");
    }
  });

  it("derives exactly ours' six CLI relay ports from models.yaml under the default profile", () => {
    const config = loadModelConfig(REPOSITORY_ROOT);
    const slots = developmentProviderSlots(config);
    const cli = slots.filter((slot) => slot.transport === "cli");
    expect([...cli.map((slot) => slot.port!)].sort((a, b) => a - b)).toEqual(OURS_CLI_PORTS);
    // identical when the profile is passed explicitly
    const explicit = developmentProviderSlots(config, DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE);
    expect(explicit).toEqual(slots);
  });

  it("emits no support-preview number anywhere in the default-profile panel or targets JSON", () => {
    const config = loadModelConfig(REPOSITORY_ROOT);
    const configured = loadModelConfigConfiguredProviders(REPOSITORY_ROOT);
    const panel = developmentConfiguredProviderPanel(configured);
    const numbers = everyNumberIn({
      profile: DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE,
      slots: developmentProviderSlots(config),
      targets: panel.targetsJson,
      panel
    });
    for (const reserved of SUPPORT_PREVIEW_RESERVED) {
      expect(numbers).not.toContain(reserved);
    }
    expect(panel.targetsJson).toContain("127.0.0.1:8795");
  });

  it("starts every CLI relay on ours' port under the default profile and tears them down in reverse", async () => {
    const config = loadModelConfig(REPOSITORY_ROOT);
    const operations = createDevelopmentCliProviderPanelOperations(config);
    const handle = await startDevelopmentCliProviderPanel(config, operations);
    const startedPorts = [relayStarts.codex, relayStarts.claude, relayStarts.grok]
      .flatMap((start) => start.mock.calls.map((call) => (call[0] as { port: number }).port))
      .sort((a, b) => a - b);
    expect(startedPorts).toEqual(OURS_CLI_PORTS);
    await handle.stop();
  });

  it("gives the stack operations the default compose project when no profile is passed", () => {
    const operations = createDevelopmentAuthStackOperations(REPOSITORY_ROOT, { PATH: process.env.PATH ?? "" });
    expect(operations.profile.name).toBe("default");
    expect(operations.profile.composeProjectName).toBe("debateai-v3");
    expect(operations.profile.postgresPort).toBe(55432);
    expect(operations.profile.publicOrigin).toBe("https://localhost:3000");
  });

  it("EXCEEDING THE AUTHOR: a sixth catalogue CLI slot has no declared support-preview port", () => {
    // The catalogue carries 6 CLI entries; each profile declares only 5 providerPorts.
    // Today models.yaml configures 3, so the gap is latent — turn on free-tier CLI and it opens.
    const cliCatalogue = DEVELOPMENT_PROVIDER_SLOT_CATALOGUE.filter((e) => e.transport === "cli");
    expect(cliCatalogue).toHaveLength(6);
    expect(SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE.providerPorts).toHaveLength(5);
    const undeclared = cliCatalogue
      .map((entry) => entry.port!)
      .filter((port) => !DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE.providerPorts.includes(port));
    expect(undeclared).toEqual([8797]);
    const allConfig = {
      premium: [
        { tier: "premium", transport: "cli", cli: "grok", model: "grok-4.6-build" }
      ],
      free: [
        { tier: "free", transport: "cli", cli: "grok", model: "grok-4.6-build" }
      ]
    } as unknown as Parameters<typeof developmentProviderSlots>[0];
    const preview = developmentProviderSlots(allConfig, SUPPORT_PREVIEW_DEVELOPMENT_AUTH_STACK_PROFILE)
      .map((slot) => slot.port!)
      .sort((a, b) => a - b);
    // eslint-disable-next-line no-console
    console.log("LATENT_SUPPORT_PREVIEW_CLI_PORTS", JSON.stringify(preview));
    expect(preview).toContain(8897);
    const dflt = developmentProviderSlots(allConfig, DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE)
      .map((slot) => slot.port!)
      .sort((a, b) => a - b);
    expect(dflt).toEqual([8793, 8797]);
  });
});
