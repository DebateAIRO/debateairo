import { randomUUID } from "node:crypto";
import type {
  DiscoveredPanelMember,
  ProviderProbeRecord
} from "@debateai/db";
import type { ProviderDiscoveryTarget } from "@debateai/providers";
export { parseProviderDiscoveryTargets } from "@debateai/providers";

const MAX_PROBE_RESPONSE_BYTES = 64 * 1024;

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

async function probeTarget(input: Readonly<{
  target: ProviderDiscoveryTarget;
  probes: ProviderDiscoveryProbeStore;
  timeoutMs: number;
  fetchImplementation: typeof fetch;
  clock: () => Date;
}>): Promise<ProviderProbeRecord> {
  const probeEvidenceRef = randomUUID();
  const probedAt = input.clock();
  let state: ProviderProbeRecord;
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (input.target.authorizationHeader !== undefined) {
      headers.authorization = input.target.authorizationHeader;
    }
    const response = await input.fetchImplementation(
      `${input.target.baseUrl}/chat/completions`,
      {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(input.timeoutMs),
        body: JSON.stringify({
          model: input.target.model,
          max_tokens: 8,
          messages: [{
            role: "user",
            content: "DR-181 discovery health probe. Reply exactly: OK"
          }]
        })
      }
    );
    const raw = await response.text();
    if (!response.ok || Buffer.byteLength(raw, "utf8") > MAX_PROBE_RESPONSE_BYTES) {
      throw new TypeError("PROVIDER_PROBE_UNAVAILABLE");
    }
    const decoded = JSON.parse(raw) as Readonly<Record<string, unknown>>;
    const choices = decoded.choices;
    const first = Array.isArray(choices) ? choices[0] : undefined;
    const message = typeof first === "object" && first !== null
      ? (first as Readonly<Record<string, unknown>>).message
      : undefined;
    const content = typeof message === "object" && message !== null
      ? (message as Readonly<Record<string, unknown>>).content
      : undefined;
    if (decoded.model !== input.target.model || content !== "OK") {
      throw new TypeError("PROVIDER_PROBE_RESPONSE_INVALID");
    }
    state = Object.freeze({
      probeEvidenceRef,
      providerRef: input.target.providerRef,
      maker: input.target.maker,
      state: "HEALTHY" as const,
      modelId: input.target.model,
      failureCode: null,
      probedAt
    });
  } catch {
    state = Object.freeze({
      probeEvidenceRef,
      providerRef: input.target.providerRef,
      maker: input.target.maker,
      state: "ABSENT" as const,
      modelId: null,
      failureCode: "PROVIDER_PROBE_FAILED",
      probedAt
    });
  }
  await input.probes.record(state);
  return state;
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
