import { loadModelConfig, type ModelConfig } from "@debateai/model-config";
import { startClaudeRelay } from "../../../acceptance/claude-relay.js";
import { startGrokRelay } from "../../../acceptance/grok-relay.js";
import { startModelShim } from "../../../acceptance/model-shim.js";
import {
  buildDevelopmentProviderPanel,
  DEVELOPMENT_CLI_CALL_TIMEOUT_MS,
  DEVELOPMENT_MINIMUM_DISTINCT_MAKERS,
  DEVELOPMENT_UNAVAILABLE_CLI_MODEL,
  developmentProviderSlots,
  type DevelopmentProviderPanel
} from "./dev-provider-panel.js";

export { DEVELOPMENT_PROVIDER_SLOT_CATALOGUE } from "./dev-provider-panel.js";

export type DevelopmentCliRelay = Readonly<{
  port: number;
  baseUrl: string;
  authorizationHeader: string;
  maker: string;
  model: string;
  close(): Promise<void>;
}>;

type DevelopmentCliRelayStart = (port: number) => Promise<DevelopmentCliRelay>;

export type DevelopmentCliProviderPanelOperations = Readonly<{
  starts: readonly DevelopmentCliRelayStart[];
}>;

export type DevelopmentCliProviderPanelHandle = Readonly<{
  panel: DevelopmentProviderPanel;
  healthyProviderRefs: readonly string[];
  stop(): Promise<void>;
}>;

async function closeRelays(relays: readonly DevelopmentCliRelay[]): Promise<void> {
  const outcomes = await Promise.allSettled([...relays].reverse().map((relay) => relay.close()));
  const rejected = outcomes.find((outcome) => outcome.status === "rejected");
  if (rejected?.status === "rejected") throw rejected.reason;
}

export async function startDevelopmentCliProviderPanel(
  config: ModelConfig = loadModelConfig(process.cwd()),
  operations: DevelopmentCliProviderPanelOperations = createDevelopmentCliProviderPanelOperations(config)
): Promise<DevelopmentCliProviderPanelHandle> {
  const slots = developmentProviderSlots(config);
  const cliSlots = slots.filter((slot) => slot.transport === "cli");
  if (operations.starts.length !== cliSlots.length) {
    throw new TypeError("DEV_CLI_PROVIDER_PANEL_START_SET_INVALID");
  }
  const settled = await Promise.allSettled(operations.starts.map((start, index) =>
    start(cliSlots[index]!.port!)
  ));
  const relays = settled.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
  let panel: DevelopmentProviderPanel;
  try {
    let cliIndex = 0;
    const observations = slots.map((provider) => {
      if (provider.transport === "api") {
        return Object.freeze({
          providerRef: provider.providerRef,
          baseUrl: provider.baseUrl!,
          model: DEVELOPMENT_UNAVAILABLE_CLI_MODEL
        });
      }
      const outcome = settled[cliIndex];
      cliIndex += 1;
      if (outcome?.status === "fulfilled") {
        if (outcome.value.port !== provider.port
          || outcome.value.baseUrl !== `http://127.0.0.1:${provider.port}`
          || outcome.value.maker !== provider.maker
          || outcome.value.model.trim() === "") {
          throw new TypeError("DEV_CLI_PROVIDER_PANEL_RELAY_IDENTITY_INVALID");
        }
        return Object.freeze({
          providerRef: provider.providerRef,
          baseUrl: `${outcome.value.baseUrl}/v1`,
          model: outcome.value.model,
          authorizationHeader: outcome.value.authorizationHeader
        });
      }
      return Object.freeze({
        providerRef: provider.providerRef,
        baseUrl: `http://127.0.0.1:${provider.port}/v1`,
        model: DEVELOPMENT_UNAVAILABLE_CLI_MODEL
      });
    });
    panel = buildDevelopmentProviderPanel(observations, slots.map((provider) => ({
      providerRef: provider.providerRef,
      adapterKind: provider.adapterKind,
      maker: provider.maker
    })));
    if (panel.healthyProviderRefs.length < DEVELOPMENT_MINIMUM_DISTINCT_MAKERS) {
      throw new TypeError("DEV_CLI_PROVIDER_PANEL_INSUFFICIENT_MAKERS");
    }
  } catch (error) {
    await closeRelays(relays).catch(() => undefined);
    throw error;
  }
  let stopPromise: Promise<void> | undefined;
  return Object.freeze({
    panel,
    healthyProviderRefs: panel.healthyProviderRefs,
    stop() {
      stopPromise ??= closeRelays(relays);
      return stopPromise;
    }
  });
}

export function createDevelopmentCliProviderPanelOperations(
  config: ModelConfig = loadModelConfig(process.cwd())
): DevelopmentCliProviderPanelOperations {
  const cliSlots = developmentProviderSlots(config).filter((slot) => slot.transport === "cli");
  return Object.freeze({
    starts: Object.freeze(cliSlots.map((slot): DevelopmentCliRelayStart => {
      if (slot.word === "codex") return (port) => startModelShim({
        port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS, model: slot.model
      });
      if (slot.word === "claude") return (port) => startClaudeRelay({
        port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS, model: slot.model
      } as unknown as Parameters<typeof startClaudeRelay>[0]);
      return (port) => startGrokRelay({
        port,
        timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS,
        model: slot.model,
        sandboxProfile: "none"
      } as unknown as Parameters<typeof startGrokRelay>[0]);
    }))
  });
}
