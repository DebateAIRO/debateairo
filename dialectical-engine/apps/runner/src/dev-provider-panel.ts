import {
  parseProviderDiscoveryTargets,
  type ProviderDiscoveryTarget
} from "@debateai/providers";
import { loadModelConfig, type ModelConfig } from "@debateai/model-config";
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

export type DevelopmentProviderSlotCatalogueEntry = Readonly<{
  tier: "free" | "premium";
  word: "codex" | "claude" | "grok" | "openai" | "zai";
  transport: "cli" | "api";
  providerRef: string;
  maker: "OpenAI" | "Anthropic" | "xAI" | "Z.AI";
  adapterKind: "openai-compatible-http";
  port?: number;
  baseUrl?: string;
}>;

export const DEVELOPMENT_PROVIDER_SLOT_CATALOGUE = Object.freeze([
  Object.freeze({
    tier: "premium", word: "codex", transport: "cli",
    providerRef: "development:codex-premium-cli", maker: "OpenAI",
    adapterKind: "openai-compatible-http", port: 8_795
  }),
  Object.freeze({
    tier: "premium", word: "claude", transport: "cli",
    providerRef: "development:claude-premium-cli", maker: "Anthropic",
    adapterKind: "openai-compatible-http", port: 8_796
  }),
  Object.freeze({
    tier: "premium", word: "grok", transport: "cli",
    providerRef: "development:grok-cli", maker: "xAI",
    adapterKind: "openai-compatible-http", port: 8_793
  }),
  Object.freeze({
    tier: "free", word: "codex", transport: "cli",
    providerRef: "development:codex-cli", maker: "OpenAI",
    adapterKind: "openai-compatible-http", port: 8_791
  }),
  Object.freeze({
    tier: "free", word: "claude", transport: "cli",
    providerRef: "development:claude-cli", maker: "Anthropic",
    adapterKind: "openai-compatible-http", port: 8_792
  }),
  Object.freeze({
    tier: "free", word: "grok", transport: "cli",
    providerRef: "development:grok-free-cli", maker: "xAI",
    adapterKind: "openai-compatible-http", port: 8_797
  }),
  Object.freeze({
    tier: "premium", word: "openai", transport: "api",
    providerRef: "development:openai-premium-api", maker: "OpenAI",
    adapterKind: "openai-compatible-http", baseUrl: "https://api.openai.com/v1"
  }),
  Object.freeze({
    tier: "premium", word: "zai", transport: "api",
    providerRef: "development:zai-premium-api", maker: "Z.AI",
    adapterKind: "openai-compatible-http", baseUrl: "https://api.z.ai/api/coding/paas/v4"
  }),
  Object.freeze({
    tier: "free", word: "openai", transport: "api",
    providerRef: "development:openai-free-api", maker: "OpenAI",
    adapterKind: "openai-compatible-http", baseUrl: "https://api.openai.com/v1"
  }),
  Object.freeze({
    tier: "free", word: "zai", transport: "api",
    providerRef: "development:zai-free-api", maker: "Z.AI",
    adapterKind: "openai-compatible-http", baseUrl: "https://api.z.ai/api/coding/paas/v4"
  })
] satisfies readonly DevelopmentProviderSlotCatalogueEntry[]);

export type DevelopmentProviderSlot = DevelopmentProviderSlotCatalogueEntry & Readonly<{
  model: string;
  baseUrl?: string;
  keyVariable?: string;
}>;

export type DevelopmentApiProviderProbeInput = Readonly<{
  tier: "free" | "premium";
  model: string;
  baseUrl: string;
  keyVariable: string;
  keyValue: string;
}>;

export type DevelopmentApiProviderProbe = (
  input: DevelopmentApiProviderProbeInput
) => Promise<Readonly<{ model: string }>>;

function profileProviderPort(
  defaultPort: number,
  profile: DevelopmentAuthStackProfile
): number {
  const profileIndex = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE.providerPorts.indexOf(defaultPort);
  if (profileIndex >= 0) return profile.providerPorts[profileIndex]!;
  if (profile.name === "default") return defaultPort;
  return defaultPort
    + profile.publicPort
    - DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE.publicPort;
}

export function developmentProviderSlots(
  config: ModelConfig,
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): readonly DevelopmentProviderSlot[] {
  const byTier = [...config.premium, ...config.free];
  const entries = [
    ...byTier.filter((entry) => entry.transport === "cli"),
    ...byTier.filter((entry) => entry.transport === "api")
  ];
  return Object.freeze(entries.map((entry) => {
    const word = entry.transport === "cli" ? entry.cli : entry.api;
    const catalogue = DEVELOPMENT_PROVIDER_SLOT_CATALOGUE.find((candidate) =>
      candidate.tier === entry.tier && candidate.word === word
    );
    if (catalogue === undefined) throw new TypeError("DEV_PROVIDER_SLOT_UNRESOLVED");
    return Object.freeze({
      ...catalogue,
      ...(catalogue.transport === "cli"
        ? { port: profileProviderPort(catalogue.port!, profile) }
        : {}),
      model: entry.model,
      ...(entry.transport === "api"
        ? { baseUrl: entry.baseUrl, keyVariable: entry.keyVariable }
        : {})
    });
  }));
}

export const REMOVED_DEVELOPMENT_SCAFFOLD_TARGETS_JSON = JSON.stringify([{
  provider_ref: REMOVED_SCAFFOLD_PROVIDER_REF,
  base_url: "http://127.0.0.1:8791/v1",
  model: REMOVED_SCAFFOLD_MODEL
}]);

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

function configuredProvidersForSlots(
  slots: readonly DevelopmentProviderSlot[]
): readonly DevelopmentConfiguredProvider[] {
  return Object.freeze(slots.map(({ providerRef, adapterKind, maker }) => Object.freeze({
    providerRef, adapterKind, maker
  })));
}

export function loadModelConfigConfiguredProviders(
  repositoryRoot: string
): readonly DevelopmentConfiguredProvider[] {
  return configuredProvidersForSlots(developmentProviderSlots(loadModelConfig(repositoryRoot)));
}

function expectedBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/v1`;
}

export function buildDevelopmentProviderPanel(
  observations: readonly DevelopmentCliTargetObservation[],
  configuredProviders: readonly DevelopmentConfiguredProvider[],
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): DevelopmentProviderPanel {
  const byRef = new Map(observations.map((observation) => [observation.providerRef, observation] as const));
  if (byRef.size !== configuredProviders.length) {
    throw new TypeError("DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID");
  }
  const rows = configuredProviders.map((provider) => {
    const observation = byRef.get(provider.providerRef);
    const catalogue = DEVELOPMENT_PROVIDER_SLOT_CATALOGUE.find(({ providerRef }) =>
      providerRef === provider.providerRef
    );
    if (observation === undefined || catalogue === undefined
      || (catalogue.transport === "cli" && observation.baseUrl
        !== expectedBaseUrl(profileProviderPort(catalogue.port!, profile)))
      || (catalogue.transport === "api" && observation.baseUrl !== catalogue.baseUrl)) {
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

export async function resolveDevelopmentApiProviderSlots(
  config: ModelConfig,
  providerPanel: DevelopmentProviderPanel,
  providerKeys: ReadonlyMap<string, string>,
  probe: DevelopmentApiProviderProbe,
  warning: (line: string) => void = (line) => console.warn(line),
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): Promise<DevelopmentProviderPanel> {
  const slots = developmentProviderSlots(config, profile);
  const currentTargets = new Map(providerPanel.targets.map((target) => [target.providerRef, target]));
  const observations = await Promise.all(slots.map(async (slot) => {
    if (slot.transport === "cli") {
      const target = currentTargets.get(slot.providerRef);
      if (target === undefined) throw new TypeError("DEV_CLI_PROVIDER_PANEL_TARGET_SET_INVALID");
      return Object.freeze({
        providerRef: target.providerRef,
        baseUrl: target.baseUrl,
        model: target.model,
        ...(target.authorizationHeader === undefined
          ? {} : { authorizationHeader: target.authorizationHeader })
      });
    }
    const keyValue = providerKeys.get(slot.keyVariable!)?.trim();
    if (keyValue === undefined || keyValue === "") {
      warning(`DEV_PROVIDER_SLOT_UNAVAILABLE class (a) tier=${slot.tier} model=${slot.model}`);
      return Object.freeze({
        providerRef: slot.providerRef,
        baseUrl: slot.baseUrl!,
        model: DEVELOPMENT_UNAVAILABLE_CLI_MODEL
      });
    }
    try {
      const response = await probe({
        tier: slot.tier,
        model: slot.model,
        baseUrl: slot.baseUrl!,
        keyVariable: slot.keyVariable!,
        keyValue
      });
      if (response.model === slot.model) {
        return Object.freeze({
          providerRef: slot.providerRef,
          baseUrl: slot.baseUrl!,
          model: slot.model,
          authorizationHeader: `Bearer ${keyValue}`
        });
      }
    } catch {
      // A failed availability probe is represented by the same bounded absent-slot shape.
    }
    warning(`DEV_PROVIDER_SLOT_UNAVAILABLE class (b) tier=${slot.tier} model=${slot.model}`);
    return Object.freeze({
      providerRef: slot.providerRef,
      baseUrl: slot.baseUrl!,
      model: DEVELOPMENT_UNAVAILABLE_CLI_MODEL
    });
  }));
  return buildDevelopmentProviderPanel(
    observations,
    configuredProvidersForSlots(slots),
    profile
  );
}

/**
 * The deployment's CONFIGURED provider set, straight from the roster: refs, makers and
 * adapter kinds, with every slot marked unavailable. Health is not part of the register
 * row - only which providers the deployment is allowed to discover - so this is the
 * honest input when publishing the set without standing the CLIs up first.
 */
export function developmentConfiguredProviderPanel(
  configuredProviders: readonly DevelopmentConfiguredProvider[],
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): DevelopmentProviderPanel {
  return buildDevelopmentProviderPanel(configuredProviders.map((provider) => {
    const catalogue = DEVELOPMENT_PROVIDER_SLOT_CATALOGUE.find(({ providerRef }) =>
      providerRef === provider.providerRef
    );
    if (catalogue === undefined) throw new TypeError("DEV_PROVIDER_SLOT_UNRESOLVED");
    return Object.freeze({
      providerRef: provider.providerRef,
      baseUrl: catalogue.transport === "cli"
        ? expectedBaseUrl(profileProviderPort(catalogue.port!, profile))
        : catalogue.baseUrl!,
      model: DEVELOPMENT_UNAVAILABLE_CLI_MODEL
    });
  }), configuredProviders, profile);
}

export function parseDevelopmentProviderPanelTargets(
  source: string,
  configuredProviders: readonly DevelopmentConfiguredProvider[],
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): DevelopmentProviderPanel {
  const targets = parseProviderDiscoveryTargets(source, configuredProviders);
  return buildDevelopmentProviderPanel(targets.map((target) => Object.freeze({
    providerRef: target.providerRef,
    baseUrl: target.baseUrl,
    model: target.model,
    ...(target.authorizationHeader === undefined
      ? {} : { authorizationHeader: target.authorizationHeader })
  })), configuredProviders, profile);
}

export function loadDevelopmentProviderPanelFromEnvironment(
  source: Readonly<Record<string, string | undefined>>,
  configuredProviders: readonly DevelopmentConfiguredProvider[]
): DevelopmentProviderPanel {
  const targetsJson = source.DEBATEAI_DEV_PROVIDER_TARGETS_JSON;
  if (targetsJson === undefined || targetsJson.trim() === "") {
    throw new TypeError("DEV_CLI_PROVIDER_PANEL_REQUIRED");
  }
  return parseDevelopmentProviderPanelTargets(
    targetsJson,
    configuredProviders,
    loadDevelopmentAuthStackProfile(source)
  );
}
