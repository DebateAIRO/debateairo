import {
  parseProviderDiscoveryTargets,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import {
  DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE,
  loadDevelopmentAuthStackProfile,
  type DevelopmentAuthStackProfile
} from "./dev-auth-stack-profile.js";

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

/**
 * One slot per plan-tier roster member (V, 2026-09-12: "Both free and premium need to be
 * accessible at the same time"). Discovery is 1:1 with the configured provider set — one
 * target per provider_ref, checked in parseProviderDiscoveryTargets — so a maker that
 * serves two tiers needs two slots. The order is the order of the discovery targets and
 * of the sealed configuredProviderSet row; appending is safe, reordering is not.
 */
export const DEVELOPMENT_CLI_PROVIDER_ROSTER = Object.freeze([
  Object.freeze({
    providerRef: "development:codex-cli",
    adapterKind: "openai-compatible-http" as const,
    maker: "OpenAI",
    port: 8_791
  }),
  Object.freeze({
    providerRef: "development:codex-premium-cli",
    adapterKind: "openai-compatible-http" as const,
    maker: "OpenAI",
    port: 8_795
  }),
  Object.freeze({
    providerRef: "development:claude-cli",
    adapterKind: "openai-compatible-http" as const,
    maker: "Anthropic",
    port: 8_792
  }),
  Object.freeze({
    providerRef: "development:claude-premium-cli",
    adapterKind: "openai-compatible-http" as const,
    maker: "Anthropic",
    port: 8_796
  }),
  Object.freeze({
    providerRef: "development:grok-cli",
    adapterKind: "openai-compatible-http" as const,
    maker: "xAI",
    port: 8_793
  })
] as const);

type DevelopmentCliProvider = Omit<(typeof DEVELOPMENT_CLI_PROVIDER_ROSTER)[number], "port"> &
  Readonly<{ port: number }>;

export function developmentCliProviderRoster(
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): readonly DevelopmentCliProvider[] {
  return Object.freeze(DEVELOPMENT_CLI_PROVIDER_ROSTER.map((provider, index) => Object.freeze({
    providerRef: provider.providerRef,
    adapterKind: provider.adapterKind,
    maker: provider.maker,
    port: profile.providerPorts[index]!
  })));
}

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

function configuredProvidersFor(
  roster: readonly DevelopmentCliProvider[]
): readonly DevelopmentConfiguredProvider[] {
  return Object.freeze(roster.map((provider) =>
  Object.freeze({
    providerRef: provider.providerRef,
    adapterKind: provider.adapterKind,
    maker: provider.maker
  })
  ));
}

function expectedBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/v1`;
}

export function buildDevelopmentProviderPanel(
  observations: readonly DevelopmentCliTargetObservation[],
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): DevelopmentProviderPanel {
  const roster = developmentCliProviderRoster(profile);
  const configuredProviders = configuredProvidersFor(roster);
  const byRef = new Map(observations.map((observation) => [observation.providerRef, observation] as const));
  if (byRef.size !== roster.length) {
    throw new TypeError("DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID");
  }
  const rows = roster.map((provider) => {
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

/**
 * The deployment's CONFIGURED provider set, straight from the roster: refs, makers and
 * adapter kinds, with every slot marked unavailable. Health is not part of the register
 * row - only which providers the deployment is allowed to discover - so this is the
 * honest input when publishing the set without standing the CLIs up first.
 */
export function developmentConfiguredProviderPanel(
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): DevelopmentProviderPanel {
  const roster = developmentCliProviderRoster(profile);
  return buildDevelopmentProviderPanel(roster.map((provider) =>
    Object.freeze({
      providerRef: provider.providerRef,
      baseUrl: expectedBaseUrl(provider.port),
      model: DEVELOPMENT_UNAVAILABLE_CLI_MODEL
    })
  ), profile);
}

export function parseDevelopmentProviderPanelTargets(
  source: string,
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): DevelopmentProviderPanel {
  const configuredProviders = configuredProvidersFor(developmentCliProviderRoster(profile));
  const targets = parseProviderDiscoveryTargets(source, configuredProviders);
  // V-9(2): the shared parser understands `authorization_file`, but this stack
  // does not resolve it — only the two shipped composition roots do. Carrying on
  // would drop the credential silently and make every call UNAUTHENTICATED, which
  // surfaces as an ABSENT probe with no explanation. Fail loudly, naming the field.
  if (targets.some((target) => target.authorizationFile !== undefined)) {
    throw new TypeError("DEV_CLI_PROVIDER_PANEL_AUTHORIZATION_FILE_UNSUPPORTED");
  }
  return buildDevelopmentProviderPanel(targets.map((target) => Object.freeze({
    providerRef: target.providerRef,
    baseUrl: target.baseUrl,
    model: target.model,
    ...(target.authorizationHeader === undefined
      ? {} : { authorizationHeader: target.authorizationHeader })
  })), profile);
}

export function loadDevelopmentProviderPanelFromEnvironment(
  source: Readonly<Record<string, string | undefined>>
): DevelopmentProviderPanel {
  const targetsJson = source.DEBATEAI_DEV_PROVIDER_TARGETS_JSON;
  if (targetsJson === undefined || targetsJson.trim() === "") {
    throw new TypeError("DEV_CLI_PROVIDER_PANEL_REQUIRED");
  }
  return parseDevelopmentProviderPanelTargets(
    targetsJson,
    loadDevelopmentAuthStackProfile(source)
  );
}
