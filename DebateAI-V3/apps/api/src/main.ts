import { Hatchet } from "@hatchet-dev/typescript-sdk";
import { createPool } from "@debateai/db";
import type { RiskTier } from "@debateai/kernel";
import { readDeploymentMakerCapability } from "@debateai/critique";
import {
  loadApiEnvironment,
  readRunCostEnvelopePolicy,
  resolveEffectiveRiskTier,
  resolveRunCostEnvelopeBasis
} from "@debateai/register";
import { buildApi, HatchetDispatcher, PostgresAskApplication } from "./index.js";

const environment = loadApiEnvironment();
const pool = createPool(environment.DATABASE_URL);
const hatchet = new Hatchet({
  token: environment.HATCHET_CLIENT_TOKEN, host_port: environment.HATCHET_HOST_PORT,
  api_url: environment.HATCHET_API_URL, tenant_id: environment.HATCHET_TENANT_ID,
  tls_config: { tls_strategy: environment.HATCHET_TLS_STRATEGY }
});
const dispatcher = new HatchetDispatcher(hatchet, environment.HATCHET_WORKFLOW_NAME);
await readDeploymentMakerCapability(pool, environment.REGISTER_VERSION);
const costEnvelopePolicy = await readRunCostEnvelopePolicy(pool, environment.REGISTER_VERSION);
const application = new PostgresAskApplication(pool, dispatcher, {
  strangerSampleRate: environment.STRANGER_SAMPLE_RATE,
  registerVersion: environment.REGISTER_VERSION,
  batteryVersion: environment.BATTERY_VERSION,
  settlementWatchHandle: environment.SETTLEMENT_WATCH_HANDLE,
  resolveDeploymentMakerAvailability: () => readDeploymentMakerCapability(pool, environment.REGISTER_VERSION),
  resolveEnvelopeBasis: async (input) => resolveRunCostEnvelopeBasis(costEnvelopePolicy, input),
  resolveRisk(askerRiskTier: RiskTier, askerProvenanceRef: string) {
    return resolveEffectiveRiskTier({
      askerTier: askerRiskTier,
      askerProvenanceRef,
      policyLevels: {
        parent: {},
        run: {},
        deployment: { riskTier: environment.DEPLOYMENT_RISK_TIER }
      }
    });
  }
});
const api = buildApi({ application });
await api.listen({ host: environment.API_HOST, port: environment.API_PORT });
