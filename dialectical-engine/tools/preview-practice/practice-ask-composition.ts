/**
 * Preview practice: the ask path, composed exactly as apps/api/src/main.ts composes it on the preview.
 *
 * Plain words: a practice debate starts the way a person's debate starts on the preview: the same health check of
 * each model (one probe per model, a busy model sits out), the same start-of-debate estimate against what each gate
 * says is left today, the same role rotation, the same admission and the same `submit` that creates the run, pins
 * the roles and queues the first job. The API's process (mail, sign-in, billing, Hatchet) is not booted; its preview
 * wiring is mirrored here, and tests/unit/preview-practice-wiring-drift.test.ts fails when the settings main.ts hands
 * PostgresAskApplication gain a key this file does not hand it (hosted-only keys excepted).
 *
 * Differences from main.ts, all on purpose:
 *  - The gate ports (paid calls and the read-only "what is left" answer) are the forwarded sockets, watched by the
 *    practice's gate watcher, not the configuration's server paths.
 *  - The team is the practice's one throwaway person; the dispatcher is the practice's own (no Hatchet).
 *  - All pools are the throwaway database's (its superuser): a missing grant on the live roles would not show here.
 */
import type { Pool } from "pg";
import { PostgresAskApplication, preserveSubmittedTierSource, type Dispatcher, type RunCreationSettings } from "@debateai/api";
import type { AskRequest } from "@debateai/contract";
import { ProviderProbeRepository, readRoleRotationCounts } from "@debateai/db";
import { readDeploymentMakerCapability } from "@debateai/critique";
import { TypedDomainError, type RiskTier } from "@debateai/kernel";
import {
  assertDeploymentProviderTargets,
  assertPreviewProviderTargets,
  assertPreviewRoleTargets,
  assertPricedProviderTargets,
  createPreviewGuardedFetch,
  createPreviewRemainingRpcPort,
  parseProviderDiscoveryTargets,
  PREVIEW_GLM_DEADLINE_MS,
  previewProbeControls,
  resolveProviderTargetCredentials,
  type PreviewBudgetPorts,
  type PreviewGateRemaining
} from "@debateai/providers";
import {
  computeStructuralCeilingBasis,
  readAnswerRoleRotationPolicy,
  readCallTokenCeilings,
  readDeploymentRiskTier,
  readEngineVersion,
  readEnvelopeFormulaInputs,
  readModelScorecard,
  readPanelDiscoveryPolicy,
  readStructuralCeilingPolicyInputs,
  resolveEffectiveRiskTier
} from "@debateai/register";
import { composeAskModelPicker } from "../../apps/api/src/ask-model-picker.js";
import { createProviderDiscoveryResolver } from "../../apps/api/src/provider-discovery.js";
import { readPreviewBudgetGateSettings } from "../../apps/api/src/preview-budget-estimate.js";
import type { PracticeSettings, PracticeSockets } from "./practice-settings.js";

/** The read-only "what is left today" answer of each gate, over the forwarded sockets. */
export function practiceRemainingPorts(settings: PracticeSettings, sockets: PracticeSockets) {
  const scope = settings.previewConfig.scope_id;
  const deepinfra = createPreviewRemainingRpcPort({ budget_socket: sockets.deepinfra, scope_id: scope });
  const anthropic = createPreviewRemainingRpcPort({ budget_socket: sockets.anthropic, scope_id: scope });
  return Object.freeze({
    deepinfra: (signal?: AbortSignal): Promise<PreviewGateRemaining> => deepinfra.remaining(signal),
    anthropic: (signal?: AbortSignal): Promise<PreviewGateRemaining> => anthropic.remaining(signal)
  });
}

const BOOT = Object.freeze({
  run: async <T>(_stage: string, step: () => Promise<T> | T): Promise<T> => step(),
  runSync: <T>(_stage: string, step: () => T): T => step()
});

export async function composePracticeAsk(input: Readonly<{
  pool: Pool;
  /** Pools that must be distinct objects (the API's content-provision and the two admission pools). */
  provisionPool: Pool;
  serverAdmissionPool: Pool;
  legacyAdmissionPool: Pool;
  settings: PracticeSettings;
  sockets: PracticeSockets;
  /** The two gate ports (forwarded and watched). */
  budgetPorts: PreviewBudgetPorts;
  dispatcher: Dispatcher;
  teamUserIds: readonly string[];
  log?: (line: string) => void;
}>) {
  const { pool, settings } = input;
  const version = settings.runner.REGISTER_VERSION;
  const previewConfig = settings.previewConfig;
  const deploymentMakers = await readDeploymentMakerCapability(pool, version);
  const discoveryPolicy = await readPanelDiscoveryPolicy(pool, version);
  const structuralInputs = await readStructuralCeilingPolicyInputs(pool, version);
  const envelopeFormulaInputs = await readEnvelopeFormulaInputs(pool, version);
  const probes = new ProviderProbeRepository(pool);
  const declaredProviderTargets = parseProviderDiscoveryTargets(
    settings.runner.PROVIDER_DISCOVERY_TARGETS_JSON, deploymentMakers.configuredProviders);
  assertDeploymentProviderTargets(declaredProviderTargets, { mode: settings.runner.DEPLOYMENT_MODE, nodeEnv: settings.runner.NODE_ENV });
  assertPricedProviderTargets(declaredProviderTargets, settings.runner.DEPLOYMENT_MODE);
  assertPreviewProviderTargets(previewConfig, declaredProviderTargets);
  if ((await readModelScorecard(pool, version, await readEngineVersion())).state === "VALID") {
    throw new TypedDomainError("PREVIEW_SCORECARD_CONFLICT", "Preview roster cannot override a valid scorecard");
  }
  const previewFetch = createPreviewGuardedFetch(input.budgetPorts);
  const gateSettings = await readPreviewBudgetGateSettings(pool, version, previewConfig,
    declaredProviderTargets.map((target) => target.model));
  assertPreviewRoleTargets(previewConfig, declaredProviderTargets, gateSettings.roleProviderRefs);
  // The one seam: the read-only answer comes over the forwarded sockets, not the configuration's server paths.
  const previewBudgetGate = Object.freeze({ ...gateSettings, remaining: practiceRemainingPorts(settings, input.sockets) });
  const providerDiscoveryTargets = resolveProviderTargetCredentials(declaredProviderTargets, () => {
    throw new TypeError("PRACTICE_TARGET_DECLARES_A_CREDENTIAL");
  });
  const resolveProviderPanel = createProviderDiscoveryResolver({
    configuredProviders: deploymentMakers.configuredProviders,
    targets: providerDiscoveryTargets,
    probes,
    probeFreshnessMs: discoveryPolicy.probeFreshnessMs,
    probeTimeoutMs: PREVIEW_GLM_DEADLINE_MS,
    probeControlsFor: previewProbeControls, fetchImplementation: previewFetch, previewRound: true
  });
  const callTokenCeilings = await readCallTokenCeilings(pool, version);
  const modelPicker = await composeAskModelPicker({
    boot: BOOT,
    pool,
    deploymentMode: settings.runner.DEPLOYMENT_MODE,
    registerVersion: version,
    targets: declaredProviderTargets,
    perRunCeilingMicros: null,
    callTokenCeilings,
    moneyPolicy: null,
    billingEnabled: false,
    log: (line) => input.log?.(line)
  });
  const deploymentRiskTier = await readDeploymentRiskTier(pool, version);
  const answerRoleRotation = await readAnswerRoleRotationPolicy(pool, version);
  const runSettings: RunCreationSettings = {
    previewProviderTestConfig: previewConfig, previewTeamUserIds: [...input.teamUserIds],
    previewBudgetGate,
    strangerSampleRate: settings.strangerSampleRate,
    registerVersion: version,
    batteryVersion: settings.batteryVersion,
    settlementWatchHandle: settings.settlementWatchHandle,
    resolveDiscoveredPanel: resolveProviderPanel,
    modelPicker,
    ...(answerRoleRotation.state === "ON" ? { roleRotation: { readCounts: () => readRoleRotationCounts(pool) } } : {}),
    resolveEnvelopeBasis: async (basis) => computeStructuralCeilingBasis({
      ...structuralInputs,
      panelSize: basis.panelSize,
      depth: Number(basis.depthParams.depth),
      maxRecompose: envelopeFormulaInputs.maxRecompose,
      branchingFactor: envelopeFormulaInputs.branchingFactor,
      compositionSegmentCap: envelopeFormulaInputs.compositionSegmentCap,
      fixedOrgansPerComposition: envelopeFormulaInputs.fixedOrgansPerComposition,
      reviewerCallsPerNode: envelopeFormulaInputs.reviewerCallsPerNode,
      synthesizerMaxRounds: envelopeFormulaInputs.synthesizerMaxRounds,
      evaluatorMaxRounds: envelopeFormulaInputs.evaluatorMaxRounds,
      maxDepth: envelopeFormulaInputs.maxDepth,
      backupSequencesProvisioned: basis.backupSequencesProvisioned
    }),
    resolveRisk(askerRiskTier: RiskTier, askerTierSource: AskRequest["tier_source"], askerProvenanceRef: string) {
      const resolved = resolveEffectiveRiskTier({
        askerTier: askerRiskTier,
        askerProvenanceRef,
        policyLevels: {
          parent: {},
          run: {},
          deployment: { riskTier: deploymentRiskTier.value }
        }
      });
      return preserveSubmittedTierSource(resolved, askerTierSource);
    }
  } as RunCreationSettings;
  const application = new PostgresAskApplication(pool, input.dispatcher, runSettings, undefined, input.provisionPool,
    Object.freeze({ server: input.serverAdmissionPool, legacy: input.legacyAdmissionPool }));
  return Object.freeze({ application, rotationOn: answerRoleRotation.state === "ON", declaredProviderTargets,
    configuredProviders: deploymentMakers.configuredProviders });
}
