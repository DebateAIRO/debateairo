import { Hatchet } from "@hatchet-dev/typescript-sdk";
import { createPool, ProviderProbeRepository } from "@debateai/db";
import type { AskRequest } from "@debateai/contract";
import type { RiskTier } from "@debateai/kernel";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  loadApiEnvironment,
  readDeploymentRiskTier,
  computeStructuralCeilingBasis,
  ENGINE_BRANCHING_FACTOR,
  ENGINE_COMPOSITION_SEGMENT_CAP,
  ENGINE_FIXED_ORGANS_PER_COMPOSITION,
  ENGINE_MAX_RECOMPOSE,
  readPanelDiscoveryPolicy,
  readStructuralCeilingPolicyInputs,
  resolveEffectiveRiskTier,
} from "@debateai/register";
import {
  buildApi,
  HatchetDispatcher,
  PostgresAskApplication,
  preserveSubmittedTierSource
} from "./index.js";

const environment = loadApiEnvironment();
const pool = createPool(environment.DATABASE_URL);
const hatchet = new Hatchet({
  token: environment.HATCHET_CLIENT_TOKEN, host_port: environment.HATCHET_HOST_PORT,
  api_url: environment.HATCHET_API_URL, tenant_id: environment.HATCHET_TENANT_ID,
  tls_config: { tls_strategy: environment.HATCHET_TLS_STRATEGY }
});
const dispatcher = new HatchetDispatcher(hatchet, environment.HATCHET_WORKFLOW_NAME);
const deploymentMakers = await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);
const discoveryPolicy = await readPanelDiscoveryPolicy(pool, environment.REGISTER_VERSION);
const structuralInputs = await readStructuralCeilingPolicyInputs(pool, environment.REGISTER_VERSION);
const probes = new ProviderProbeRepository(pool);
const deploymentRiskTier = await readDeploymentRiskTier(pool, environment.REGISTER_VERSION);
const application = new PostgresAskApplication(pool, dispatcher, {
  strangerSampleRate: environment.STRANGER_SAMPLE_RATE,
  registerVersion: environment.REGISTER_VERSION,
  batteryVersion: environment.BATTERY_VERSION,
  settlementWatchHandle: environment.SETTLEMENT_WATCH_HANDLE,
  resolveDiscoveredPanel: async () => {
    const latest = await probes.readLatest(deploymentMakers.configuredProviders.map((provider) => provider.providerRef));
    const now = Date.now();
    return Object.freeze(latest.flatMap((record) =>
      record.state === "HEALTHY" && record.modelId !== null
        && now - record.probedAt.getTime() <= discoveryPolicy.probeFreshnessMs
        ? [Object.freeze({
            provider_ref: record.providerRef,
            maker: record.maker,
            model_id: record.modelId,
            probe_evidence_ref: record.probeEvidenceRef,
            probed_at: record.probedAt.toISOString()
          })]
        : []
    ));
  },
  resolveEnvelopeBasis: async (input) => computeStructuralCeilingBasis({
    ...structuralInputs,
    panelSize: input.panelSize,
    depth: Number(input.depthParams.depth),
    maxRecompose: ENGINE_MAX_RECOMPOSE,
    branchingFactor: ENGINE_BRANCHING_FACTOR,
    compositionSegmentCap: ENGINE_COMPOSITION_SEGMENT_CAP,
    fixedOrgansPerComposition: ENGINE_FIXED_ORGANS_PER_COMPOSITION
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
});
const api = buildApi({ application });
await api.listen({ host: environment.API_HOST, port: environment.API_PORT });
