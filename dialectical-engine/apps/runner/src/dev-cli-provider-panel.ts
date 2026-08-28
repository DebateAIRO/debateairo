import { startClaudeRelay } from "../../../acceptance/claude-relay.js";
import { startGrokRelay } from "../../../acceptance/grok-relay.js";
import { startModelShim } from "../../../acceptance/model-shim.js";
import {
  buildDevelopmentProviderPanel,
  DEVELOPMENT_CLI_CALL_TIMEOUT_MS,
  DEVELOPMENT_CLI_PROVIDER_ROSTER,
  DEVELOPMENT_MINIMUM_DISTINCT_MAKERS,
  DEVELOPMENT_UNAVAILABLE_CLI_MODEL,
  type DevelopmentProviderPanel
} from "./dev-provider-panel.js";

export { DEVELOPMENT_CLI_PROVIDER_ROSTER } from "./dev-provider-panel.js";

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
  starts: readonly [
    DevelopmentCliRelayStart,
    DevelopmentCliRelayStart,
    DevelopmentCliRelayStart
  ];
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
  operations: DevelopmentCliProviderPanelOperations = createDevelopmentCliProviderPanelOperations()
): Promise<DevelopmentCliProviderPanelHandle> {
  const settled = await Promise.allSettled(operations.starts.map((start, index) =>
    start(DEVELOPMENT_CLI_PROVIDER_ROSTER[index]!.port)
  ));
  const relays = settled.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
  let panel: DevelopmentProviderPanel;
  try {
    const observations = DEVELOPMENT_CLI_PROVIDER_ROSTER.map((provider, index) => {
      const outcome = settled[index];
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
    panel = buildDevelopmentProviderPanel(observations);
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

export function createDevelopmentCliProviderPanelOperations(): DevelopmentCliProviderPanelOperations {
  return Object.freeze({
    starts: Object.freeze([
      (port: number) => startModelShim({ port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS }),
      (port: number) => startClaudeRelay({ port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS }),
      (port: number) => startGrokRelay({ port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS })
    ] as const)
  });
}
