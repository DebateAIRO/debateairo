import type {
  DiscoveredPanelMember,
  ProviderProbeRecord
} from "@debateai/db";
import { probeTarget, type ProviderDiscoveryTarget } from "@debateai/providers";
export {
  assertDeploymentProviderTargets,
  assertHostedProviderTargets,
  assertProductionProviderTargets,
  parseProviderDiscoveryTargets
} from "@debateai/providers";

export type ProviderDiscoveryProbeStore = Readonly<{
  readLatest(providerRefs: readonly string[]): Promise<readonly ProviderProbeRecord[]>;
  record(observation: ProviderProbeRecord): Promise<void>;
}>;

function isFreshMatchingRecord(
  record: ProviderProbeRecord | undefined,
  target: ProviderDiscoveryTarget,
  now: Date,
  freshnessMs: number
): record is ProviderProbeRecord {
  if (record === undefined
    || record.providerRef !== target.providerRef
    || record.maker !== target.maker
    || !Number.isFinite(record.probedAt.getTime())) return false;
  const ageMs = now.getTime() - record.probedAt.getTime();
  if (ageMs < 0 || ageMs > freshnessMs) return false;
  return record.state === "HEALTHY"
    && record.modelId === target.model
    && record.failureCode === null;
}

export function createProviderDiscoveryResolver(input: Readonly<{
  configuredProviders: readonly Readonly<{ providerRef: string; maker: string }>[];
  targets: readonly ProviderDiscoveryTarget[];
  probes: ProviderDiscoveryProbeStore;
  probeFreshnessMs: number;
  probeTimeoutMs: number;
  fetchImplementation?: typeof fetch;
  clock?: () => Date;
}>): () => Promise<readonly DiscoveredPanelMember[]> {
  if (!Number.isInteger(input.probeFreshnessMs) || input.probeFreshnessMs < 1) {
    throw new TypeError("PROVIDER_PROBE_FRESHNESS_INVALID");
  }
  if (!Number.isInteger(input.probeTimeoutMs) || input.probeTimeoutMs < 1) {
    throw new TypeError("PROVIDER_PROBE_TIMEOUT_INVALID");
  }
  const expectedRefs = input.configuredProviders.map((provider) => provider.providerRef);
  if (expectedRefs.length !== input.targets.length
    || input.targets.some((target, index) => target.providerRef !== expectedRefs[index]
      || target.maker !== input.configuredProviders[index]?.maker)) {
    throw new TypeError("PROVIDER_DISCOVERY_TARGET_SET_MISMATCH");
  }
  const fetchImplementation = input.fetchImplementation ?? fetch;
  const clock = input.clock ?? (() => new Date());
  const resolve = async (): Promise<readonly DiscoveredPanelMember[]> => {
    const now = clock();
    const latest = await input.probes.readLatest(expectedRefs);
    const latestByRef = new Map(latest.map((record) => [record.providerRef, record] as const));
    const observations = await Promise.all(input.targets.map(async (target) => {
      const record = latestByRef.get(target.providerRef);
      return isFreshMatchingRecord(record, target, now, input.probeFreshnessMs)
        ? record
        : probeTarget({
            target,
            probes: input.probes,
            timeoutMs: input.probeTimeoutMs,
            fetchImplementation,
            clock
          });
    }));
    return Object.freeze(observations.flatMap((record) => (
      record.state === "HEALTHY" && record.modelId !== null
        ? [Object.freeze({
            provider_ref: record.providerRef,
            maker: record.maker,
            model_id: record.modelId,
            probe_evidence_ref: record.probeEvidenceRef,
            probed_at: record.probedAt.toISOString()
          })]
        : []
    )));
  };
  let inFlight: Promise<readonly DiscoveredPanelMember[]> | undefined;
  return () => {
    if (inFlight !== undefined) return inFlight;
    const current = resolve();
    let shared!: Promise<readonly DiscoveredPanelMember[]>;
    shared = current.finally(() => {
      if (inFlight === shared) inFlight = undefined;
    });
    inFlight = shared;
    return shared;
  };
}
