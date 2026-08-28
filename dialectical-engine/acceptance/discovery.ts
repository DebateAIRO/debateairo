import { randomUUID } from "node:crypto";
import {
  CliRelayFailure,
  invokeCli,
  type CliRelayAdapter,
  type CommandSpec
} from "./relay-core.js";
import type { DiscoveredPanelMember } from "@debateai/db";
import { TypedDomainError } from "@debateai/kernel";

export interface DiscoveryTarget {
  readonly providerRef: string;
  readonly maker: string;
}

export interface ProbeTarget extends DiscoveryTarget {
  readonly command: CommandSpec;
  readonly adapter: CliRelayAdapter;
  readonly handshakePrompt: string;
}

export type DiscoveredProvider =
  | {
      readonly probeEvidenceRef: string;
      readonly providerRef: string;
      readonly maker: string;
      readonly state: "HEALTHY";
      readonly modelId: string;
      readonly probedAt: Date;
    }
  | {
      readonly probeEvidenceRef: string;
      readonly providerRef: string;
      readonly maker: string;
      readonly state: "ABSENT";
      readonly failureCode: string;
      readonly probedAt: Date;
    };

export interface RelayProbeTarget extends DiscoveryTarget {
  readonly baseUrl: string;
  readonly model: string;
  readonly authorizationHeader: string;
}

export async function probeRelay(target: RelayProbeTarget): Promise<Extract<
  DiscoveredProvider,
  { readonly state: "HEALTHY" }
>> {
  const response = await fetch(`${target.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: target.authorizationHeader
    },
    body: JSON.stringify({
      model: target.model,
      messages: [{ role: "user", content: "DR-181 discovery health probe. Reply: OK" }]
    })
  });
  if (!response.ok) throw new TypedDomainError("PROVIDER_PROBE_FAILED", target.providerRef);
  const body = await response.json() as Readonly<Record<string, unknown>>;
  if (typeof body.model !== "string" || body.model.trim() === "") {
    throw new TypedDomainError("PROVIDER_PROBE_MODEL_UNRESOLVED", target.providerRef);
  }
  return Object.freeze({
    probeEvidenceRef: randomUUID(),
    providerRef: target.providerRef,
    maker: target.maker,
    state: "HEALTHY",
    modelId: body.model,
    probedAt: new Date()
  });
}

function requiredTargetText(value: string, code: string): string {
  const normalized = value.trim();
  if (normalized === "") throw new TypeError(code);
  return normalized;
}

export async function probeProvider(
  target: ProbeTarget,
  timeoutMs: number,
  clock: () => Date = () => new Date()
): Promise<DiscoveredProvider> {
  const providerRef = requiredTargetText(target.providerRef, "PROBE_PROVIDER_REF_INVALID");
  const maker = requiredTargetText(target.maker, "PROBE_MAKER_INVALID");
  const probeEvidenceRef = randomUUID();
  const probedAt = clock();
  try {
    const completion = await invokeCli(target.command, target.adapter, target.handshakePrompt, timeoutMs);
    return Object.freeze({
      probeEvidenceRef,
      providerRef,
      maker,
      state: "HEALTHY",
      modelId: requiredTargetText(completion.model, `${target.adapter.failureCode}_MODEL_UNRESOLVED`),
      probedAt
    });
  } catch (error) {
    if (!(error instanceof CliRelayFailure)) throw error;
    return Object.freeze({
      probeEvidenceRef,
      providerRef,
      maker,
      state: "ABSENT",
      failureCode: error.message,
      probedAt
    });
  }
}

export async function discoverPanel(
  targets: readonly ProbeTarget[],
  timeoutMs: number,
  clock: () => Date = () => new Date()
): Promise<readonly DiscoveredProvider[]> {
  const settled = await Promise.allSettled(targets.map((target) => probeProvider(target, timeoutMs, clock)));
  return Object.freeze(settled.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    const target = targets[index];
    if (target === undefined) throw result.reason;
    return Object.freeze({
      probeEvidenceRef: randomUUID(),
      providerRef: requiredTargetText(target.providerRef, "PROBE_PROVIDER_REF_INVALID"),
      maker: requiredTargetText(target.maker, "PROBE_MAKER_INVALID"),
      state: "ABSENT" as const,
      failureCode: "PROVIDER_PROBE_FAILED",
      probedAt: clock()
    });
  }));
}

export async function resolveFreshDiscovery<Target extends DiscoveryTarget>(input: {
  readonly targets: readonly Target[];
  readonly latestRecords: readonly DiscoveredProvider[];
  readonly probeFreshnessMs: number;
  readonly now: Date;
  readonly probe: (target: Target) => Promise<DiscoveredProvider>;
}): Promise<{
  readonly observations: readonly DiscoveredProvider[];
  readonly panel: readonly Extract<DiscoveredProvider, { readonly state: "HEALTHY" }>[];
}> {
  if (!Number.isInteger(input.probeFreshnessMs) || input.probeFreshnessMs < 1) {
    throw new TypeError("PROBE_FRESHNESS_MS_INVALID");
  }
  const latestByProvider = new Map(input.latestRecords.map((record) => [record.providerRef, record] as const));
  const observations: DiscoveredProvider[] = [];
  for (const target of input.targets) {
    const latest = latestByProvider.get(target.providerRef);
    const ageMs = latest === undefined ? Number.POSITIVE_INFINITY : input.now.getTime() - latest.probedAt.getTime();
    observations.push(latest !== undefined && ageMs >= 0 && ageMs <= input.probeFreshnessMs
      ? latest
      : await input.probe(target));
  }
  return Object.freeze({
    observations: Object.freeze(observations),
    panel: Object.freeze(observations.filter(
      (record): record is Extract<DiscoveredProvider, { readonly state: "HEALTHY" }> => record.state === "HEALTHY"
    ))
  });
}

export function toDiscoveredPanel(
  panel: readonly Extract<DiscoveredProvider, { readonly state: "HEALTHY" }>[]
): readonly DiscoveredPanelMember[] {
  return Object.freeze(panel.map((record) => Object.freeze({
    provider_ref: record.providerRef,
    maker: record.maker,
    model_id: record.modelId,
    probe_evidence_ref: record.probeEvidenceRef,
    probed_at: record.probedAt.toISOString()
  })));
}
