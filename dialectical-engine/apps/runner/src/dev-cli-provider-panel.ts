import { PLAN_TIER_ROSTERS } from "@debateai/contract";
import { startClaudeRelay } from "../../../acceptance/claude-relay.js";
import { startGrokRelay } from "../../../acceptance/grok-relay.js";
import { startModelShim } from "../../../acceptance/model-shim.js";
import {
  buildDevelopmentProviderPanel,
  developmentCliProviderRoster,
  DEVELOPMENT_CLI_CALL_TIMEOUT_MS,
  DEVELOPMENT_CLI_PROVIDER_ROSTER,
  DEVELOPMENT_MINIMUM_DISTINCT_MAKERS,
  DEVELOPMENT_UNAVAILABLE_CLI_MODEL,
  type DevelopmentProviderPanel
} from "./dev-provider-panel.js";
import {
  DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE,
  type DevelopmentAuthStackProfile
} from "./dev-auth-stack-profile.js";

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
  operations: DevelopmentCliProviderPanelOperations = createDevelopmentCliProviderPanelOperations(),
  profile: DevelopmentAuthStackProfile = DEFAULT_DEVELOPMENT_AUTH_STACK_PROFILE
): Promise<DevelopmentCliProviderPanelHandle> {
  const roster = developmentCliProviderRoster(profile);
  const settled = await Promise.allSettled(operations.starts.map((start, index) =>
    start(roster[index]!.port)
  ));
  const relays = settled.flatMap((outcome) => outcome.status === "fulfilled" ? [outcome.value] : []);
  let panel: DevelopmentProviderPanel;
  try {
    const observations = roster.map((provider, index) => {
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
    panel = buildDevelopmentProviderPanel(observations, profile);
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

function rosterModel(models: readonly string[], prefix: string): string {
  const modelId = models.find((candidate) => candidate.startsWith(prefix));
  if (modelId === undefined) throw new TypeError("DEV_CLI_MODEL_PIN_UNRESOLVED");
  return modelId;
}

/** The family word the Claude CLI takes as `--model`: the roster id's second segment. */
function claudeAlias(modelId: string): string {
  const alias = modelId.split("-")[1];
  if (alias === undefined || alias === "") throw new TypeError("DEV_CLI_MODEL_PIN_UNRESOLVED");
  return alias;
}

/**
 * What each local CLI is asked for, one pin per slot of DEVELOPMENT_CLI_PROVIDER_ROSTER,
 * so Free and Premium are both admissible from a single panel (2026-09-12, V: "Both free
 * and premium need to be accessible at the same time"). Every id is read from the contract
 * rosters and never spelled here — roster model ids have exactly one declaration
 * (tests/architecture/tiers-s02-rosters.test.ts). Lineage stays CLI-reported (DR-115): the
 * Codex shim refuses a rollout that disagrees with its pin, Claude's alias only selects
 * among the lineages the CLI itself reports, and Grok reports its own default, pinned
 * nowhere — the xAI roster entry is spelled as the id that CLI answers as.
 */
export const DEVELOPMENT_CLI_MODEL_PINS = Object.freeze({
  codexFreeModel: rosterModel(PLAN_TIER_ROSTERS.free, "gpt-"),
  codexPremiumModel: rosterModel(PLAN_TIER_ROSTERS.premium, "gpt-"),
  claudeFreeAlias: claudeAlias(rosterModel(PLAN_TIER_ROSTERS.free, "claude-")),
  claudePremiumAlias: claudeAlias(rosterModel(PLAN_TIER_ROSTERS.premium, "claude-")),
  grokSandboxProfile: "none" as const
});

export function createDevelopmentCliProviderPanelOperations(): DevelopmentCliProviderPanelOperations {
  return Object.freeze({
    starts: Object.freeze([
      (port: number) => startModelShim({
        port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS, model: DEVELOPMENT_CLI_MODEL_PINS.codexFreeModel
      }),
      (port: number) => startModelShim({
        port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS, model: DEVELOPMENT_CLI_MODEL_PINS.codexPremiumModel
      }),
      (port: number) => startClaudeRelay({
        port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS, modelAlias: DEVELOPMENT_CLI_MODEL_PINS.claudeFreeAlias
      }),
      (port: number) => startClaudeRelay({
        port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS, modelAlias: DEVELOPMENT_CLI_MODEL_PINS.claudePremiumAlias
      }),
      (port: number) => startGrokRelay({
        port, timeoutMs: DEVELOPMENT_CLI_CALL_TIMEOUT_MS, sandboxProfile: DEVELOPMENT_CLI_MODEL_PINS.grokSandboxProfile
      })
    ] as const)
  });
}
