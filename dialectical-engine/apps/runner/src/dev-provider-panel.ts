import {
  parseProviderDiscoveryTargets,
  type ProviderDiscoveryTarget
} from "@debateai/providers";

const REMOVED_SCAFFOLD_PROVIDER_REF = "development:local-vllm";
const REMOVED_SCAFFOLD_MODEL = "qa-deterministic-v1";
export const DEVELOPMENT_UNAVAILABLE_CLI_MODEL = "CLI_HANDSHAKE_UNAVAILABLE" as const;
export const DEVELOPMENT_MINIMUM_DISTINCT_MAKERS = 1 as const;
export const DEVELOPMENT_CLI_CALL_TIMEOUT_MS = 180_000 as const;

export const REMOVED_DEVELOPMENT_SCAFFOLD_TARGETS_JSON = JSON.stringify([{
  provider_ref: REMOVED_SCAFFOLD_PROVIDER_REF,
  base_url: "http://127.0.0.1:8791/v1",
  model: REMOVED_SCAFFOLD_MODEL
}]);

export const DEVELOPMENT_CLI_PROVIDER_ROSTER = Object.freeze([
  Object.freeze({
    providerRef: "development:codex-cli",
    adapterKind: "openai-compatible-http" as const,
    maker: "OpenAI",
    port: 8_791
  }),
  Object.freeze({
    providerRef: "development:claude-cli",
    adapterKind: "openai-compatible-http" as const,
    maker: "Anthropic",
    port: 8_792
  }),
  Object.freeze({
    providerRef: "development:grok-cli",
    adapterKind: "openai-compatible-http" as const,
    maker: "xAI",
    port: 8_793
  })
] as const);

export type DevelopmentConfiguredProvider = Readonly<{
  providerRef: string;
  adapterKind: "openai-compatible-http";
  maker: string;
}>;

export type DevelopmentProviderPanel = Readonly<{
  configuredProviders: readonly DevelopmentConfiguredProvider[];
  requiredDistinctMakers: number;
  healthyProviderRefs: readonly string[];
  targets: readonly ProviderDiscoveryTarget[];
  targetsJson: string;
}>;

type DevelopmentCliTargetObservation = Readonly<{
  providerRef: string;
  baseUrl: string;
  model: string;
  authorizationHeader?: string;
}>;

const configuredProviders = Object.freeze(DEVELOPMENT_CLI_PROVIDER_ROSTER.map((provider) =>
  Object.freeze({
    providerRef: provider.providerRef,
    adapterKind: provider.adapterKind,
    maker: provider.maker
  })
));

function expectedBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/v1`;
}

export function buildDevelopmentProviderPanel(
  observations: readonly DevelopmentCliTargetObservation[]
): DevelopmentProviderPanel {
  const byRef = new Map(observations.map((observation) => [observation.providerRef, observation] as const));
  if (byRef.size !== DEVELOPMENT_CLI_PROVIDER_ROSTER.length) {
    throw new TypeError("DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID");
  }
  const rows = DEVELOPMENT_CLI_PROVIDER_ROSTER.map((provider) => {
    const observation = byRef.get(provider.providerRef);
    if (observation === undefined || observation.baseUrl !== expectedBaseUrl(provider.port)) {
      throw new TypeError("DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID");
    }
    const healthy = observation.model !== DEVELOPMENT_UNAVAILABLE_CLI_MODEL;
    if ((healthy && observation.authorizationHeader === undefined)
      || (!healthy && observation.authorizationHeader !== undefined)
      || observation.model === REMOVED_SCAFFOLD_MODEL
      || observation.providerRef === REMOVED_SCAFFOLD_PROVIDER_REF) {
      throw new TypeError("DEV_CLI_PROVIDER_PANEL_TARGET_INVALID");
    }
    return Object.freeze({
      provider_ref: provider.providerRef,
      base_url: observation.baseUrl,
      model: observation.model,
      ...(observation.authorizationHeader === undefined
        ? {} : { authorization_header: observation.authorizationHeader })
    });
  });
  const targetsJson = JSON.stringify(rows);
  const targets = parseProviderDiscoveryTargets(targetsJson, configuredProviders);
  const healthyProviderRefs = Object.freeze(targets.flatMap((target) =>
    target.model === DEVELOPMENT_UNAVAILABLE_CLI_MODEL ? [] : [target.providerRef]
  ));
  return Object.freeze({
    configuredProviders,
    requiredDistinctMakers: DEVELOPMENT_MINIMUM_DISTINCT_MAKERS,
    healthyProviderRefs,
    targets,
    targetsJson
  });
}

export function parseDevelopmentProviderPanelTargets(source: string): DevelopmentProviderPanel {
  const targets = parseProviderDiscoveryTargets(source, configuredProviders);
  return buildDevelopmentProviderPanel(targets.map((target) => Object.freeze({
    providerRef: target.providerRef,
    baseUrl: target.baseUrl,
    model: target.model,
    ...(target.authorizationHeader === undefined
      ? {} : { authorizationHeader: target.authorizationHeader })
  })));
}

export function loadDevelopmentProviderPanelFromEnvironment(
  source: Readonly<Record<string, string | undefined>>
): DevelopmentProviderPanel {
  const targetsJson = source.DEBATEAI_DEV_PROVIDER_TARGETS_JSON;
  if (targetsJson === undefined || targetsJson.trim() === "") {
    throw new TypeError("DEV_CLI_PROVIDER_PANEL_REQUIRED");
  }
  return parseDevelopmentProviderPanelTargets(targetsJson);
}
