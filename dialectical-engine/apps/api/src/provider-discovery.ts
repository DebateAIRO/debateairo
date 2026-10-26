import type {
  DiscoveredPanelMember,
  ProviderProbeRecord
} from "@debateai/db";
import { randomUUID } from "node:crypto";
import {
  assertDeploymentProviderTargets,
  assertPricedProviderTargets,
  observeProviderTarget,
  parseProviderDiscoveryTargets,
  previewProbeRoundBusy,
  probeTarget,
  providerTargetPrice,
  type ProviderDiscoveryTarget,
  type ProviderProbeObservation
} from "@debateai/providers";
import type { ProviderTargetPrice } from "@debateai/budget";
export {
  assertDeploymentProviderTargets,
  assertHostedProviderTargets,
  // V-28: the hosted DEBATE targets' price rule — deliberately its own
  // assertion, because the support chat's target shares the mode decision above
  // but keeps its own spend accounting (task 12).
  assertPricedProviderTargets,
  assertProductionProviderTargets,
  parseProviderDiscoveryTargets,
  resolveProviderTargetCredentials
} from "@debateai/providers";

/**
 * Side-by-side spec §13 (S14, ruling R57) — THE API's DECLARED TARGETS, ONE DECISION: apps/api/src/main.ts's
 * "provider-targets" stage, the preview practice's ask and check-version's API half all parse and judge the targets
 * here. Parsed over the register's configured providers; then V-9(c)'s mode decision, the runner's own, over the same
 * target set and taken on the DECLARED targets, before any credential file is resolved; then V-28: a hosted DEBATE
 * target must carry its price, or its calls cannot be billed against the per-run and daily envelopes (separate from the
 * rule above because the support chat's target shares that one and keeps its own accounting). Pure.
 */
export function parseDeclaredProviderTargets(input: Readonly<{
  targetsJson: string;
  configuredProviders: Parameters<typeof parseProviderDiscoveryTargets>[1];
  mode: "hosted" | "local";
  nodeEnv: string | undefined;
}>): readonly ProviderDiscoveryTarget[] {
  const declared = parseProviderDiscoveryTargets(input.targetsJson, input.configuredProviders);
  assertDeploymentProviderTargets(declared, { mode: input.mode, nodeEnv: input.nodeEnv });
  assertPricedProviderTargets(declared, input.mode);
  return declared;
}

/**
 * What one discovery round found: the healthy members, and (preview only, spec 2026-10-11 busy model
 * §3/§3a) the models whose probe this round was a gate-proven unbilled refusal; no busy model is in the
 * panel. The busy list is a non-enumerable property, so the panel itself reads, compares and serializes
 * exactly as before.
 */
export type DiscoveredProviderPanel = readonly DiscoveredPanelMember[] & Readonly<{ busyModelIds?: readonly string[] }>;

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

/** The healthy members of one round's records, in target order. */
function panelOf(records: readonly ProviderProbeObservation[]): DiscoveredPanelMember[] {
  return records.flatMap((record) => (
    record.state === "HEALTHY" && record.modelId !== null
      ? [Object.freeze({
          provider_ref: record.providerRef,
          maker: record.maker,
          model_id: record.modelId,
          probe_evidence_ref: record.probeEvidenceRef,
          probed_at: record.probedAt.toISOString()
        })]
      : []
  ));
}

export function createProviderDiscoveryResolver(input: Readonly<{
  configuredProviders: readonly Readonly<{ providerRef: string; maker: string }>[];
  targets: readonly ProviderDiscoveryTarget[];
  probes: ProviderDiscoveryProbeStore;
  probeFreshnessMs: number;
  probeTimeoutMs: number;
  thinkingLevel?: string;
  probeTokenCeiling?: number;
  /**
   * Preview multi-model (contract A §1): each target's own probe controls (a level only where the
   * row has one, a ceiling within the row's bound). When given, it replaces the two fields above.
   */
  probeControlsFor?: (target: ProviderDiscoveryTarget) => Readonly<{ thinkingLevel?: string; tokenCeiling?: number }>;
  fetchImplementation?: typeof fetch;
  clock?: () => Date;
  /**
   * Spec 2026-10-11 busy model §1-§3, the PREVIEW only (main.ts passes it with the preview config; hosted
   * and local leave it out and probe exactly as before): each (baseUrl, model, adapter kind, probe
   * controls) is probed ONCE per round, its observation written as one row per ref, each with its own
   * probe id; and the round reports its busy models (a gate-proven unbilled refusal). Amendment §3a
   * (2026-10-11 review): NO resend at ask time, so the round sends exactly one request per model, and a
   * busy model is left out of the panel even where another of its refs has a fresh HEALTHY record.
   */
  previewRound?: true;
}>): () => Promise<DiscoveredProviderPanel> {
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
  const previewRound = input.previewRound;
  /**
   * Spec 2026-10-11 busy model §1: the preview's round. GLM is reviewed under two refs
   * (`preview:fixture-a`, `preview:fixture-b`), and probing both at the same moment sent the busy model
   * two requests where one answers the question. Stale targets that would send the same request are
   * probed once; the observation is recorded once per ref, under that ref's own probe id and maker.
   */
  const resolvePreviewObservations = async (
    stale: readonly ProviderDiscoveryTarget[]
  ): Promise<Readonly<{ byRef: ReadonlyMap<string, ProviderProbeRecord>; busyModelIds: readonly string[] }>> => {
    const groups = new Map<string, ProviderDiscoveryTarget[]>();
    for (const target of stale) {
      const controls = input.probeControlsFor?.(target)
        ?? { thinkingLevel: input.thinkingLevel, tokenCeiling: input.probeTokenCeiling };
      const key = JSON.stringify([target.baseUrl, target.model, target.adapterKind ?? null,
        controls.thinkingLevel ?? null, controls.tokenCeiling ?? null]);
      groups.set(key, [...(groups.get(key) ?? []), target]);
    }
    const asRef = (observation: ProviderProbeObservation, target: ProviderDiscoveryTarget): ProviderProbeRecord => Object.freeze({
      ...observation,
      probeEvidenceRef: randomUUID(),
      providerRef: target.providerRef,
      maker: target.maker
    });
    const recordAll = async (observation: ProviderProbeObservation, group: readonly ProviderDiscoveryTarget[]) => {
      const rows = group.map((target) => asRef(observation, target));
      for (const row of rows) await input.probes.record(row);
      return rows;
    };
    const byRef = new Map<string, ProviderProbeRecord>();
    const busyModelIds: string[] = [];
    await Promise.all([...groups.values()].map(async (group) => {
      const target = group[0]!;
      const controls = input.probeControlsFor?.(target)
        ?? { thinkingLevel: input.thinkingLevel, tokenCeiling: input.probeTokenCeiling };
      // Amendment §3a (2026-10-11 review): ONE observation, never a resend at ask time. A model admitted only
      // on a resend could be pinned as the answer writer and then die at claim (J24), and synchronized
      // resends push the gate toward its unsent-in-a-row and daily unbilled-refusal halts.
      const observation = await observeProviderTarget({
        target,
        timeoutMs: input.probeTimeoutMs,
        ...(controls.thinkingLevel === undefined ? {} : { thinkingLevel: controls.thinkingLevel }),
        ...(controls.tokenCeiling === undefined ? {} : { tokenCeiling: controls.tokenCeiling }),
        fetchImplementation,
        clock
      });
      const rows = await recordAll(observation, group);
      group.forEach((member, index) => byRef.set(member.providerRef, rows[index]!));
      if (previewProbeRoundBusy([observation])) busyModelIds.push(target.model);
    }));
    return Object.freeze({ byRef, busyModelIds: Object.freeze([...new Set(busyModelIds)]) });
  };
  const resolve = async (): Promise<DiscoveredProviderPanel> => {
    const now = clock();
    const latest = await input.probes.readLatest(expectedRefs);
    const latestByRef = new Map(latest.map((record) => [record.providerRef, record] as const));
    if (previewRound !== undefined) {
      const stale = input.targets.filter((target) => !isFreshMatchingRecord(latestByRef.get(target.providerRef), target, now, input.probeFreshnessMs));
      const round = await resolvePreviewObservations(stale);
      const records = input.targets.map((target) => round.byRef.get(target.providerRef) ?? latestByRef.get(target.providerRef)!);
      // §3a: busy is per MODEL. A ref of a busy model whose own record is fresh and HEALTHY (freshness is
      // per ref) was not probed this round, but the model's probe this round was refused: it sits out too,
      // so the busy list and the panel always agree.
      const panel = panelOf(records).filter((member) => !round.busyModelIds.includes(member.model_id));
      // §3: non-enumerable, so the panel compares and serializes as a plain array.
      Object.defineProperty(panel, "busyModelIds", { value: round.busyModelIds, enumerable: false });
      return Object.freeze(panel);
    }
    const observations = await Promise.all(input.targets.map(async (target) => {
      const record = latestByRef.get(target.providerRef);
      if (isFreshMatchingRecord(record, target, now, input.probeFreshnessMs)) return record;
      const controls = input.probeControlsFor?.(target);
      return controls !== undefined
        ? probeTarget({
            target,
            probes: input.probes,
            timeoutMs: input.probeTimeoutMs,
            ...(controls.thinkingLevel===undefined?{}:{thinkingLevel:controls.thinkingLevel}),
            ...(controls.tokenCeiling===undefined?{}:{tokenCeiling:controls.tokenCeiling}),
            fetchImplementation,
            clock
          })
        : probeTarget({
            target,
            probes: input.probes,
            timeoutMs: input.probeTimeoutMs,
            ...(input.thinkingLevel===undefined?{}:{thinkingLevel:input.thinkingLevel}),
            ...(input.probeTokenCeiling===undefined?{}:{tokenCeiling:input.probeTokenCeiling}),
            fetchImplementation,
            clock
          });
    }));
    return Object.freeze(panelOf(observations));
  };
  let inFlight: Promise<DiscoveredProviderPanel> | undefined;
  return () => {
    if (inFlight !== undefined) return inFlight;
    const current = resolve();
    let shared!: Promise<DiscoveredProviderPanel>;
    shared = current.finally(() => {
      if (inFlight === shared) inFlight = undefined;
    });
    inFlight = shared;
    return shared;
  };
}

/**
 * Budget spec 2026-09-28 §2.5 (B2) — THE API'S PRICE MAP, for the estimate:
 * providerRef → the target's price, built exactly as the runner builds its own
 * (`buildProviderPriceMap`, apps/runner/src/index.ts:2024) from the same
 * PROVIDER_DISCOVERY_TARGETS_JSON. Hosted only: local mode never estimates, and
 * a target with no declared price is left out (hosted refuses one at boot).
 */
export function buildApiProviderPriceMap(
  targets: readonly ProviderDiscoveryTarget[],
  mode: "hosted" | "local"
): ReadonlyMap<string, ProviderTargetPrice> {
  const prices = new Map<string, ProviderTargetPrice>();
  if (mode !== "hosted") return prices;
  for (const target of targets) {
    const price = providerTargetPrice(target);
    if (price !== null) prices.set(target.providerRef, Object.freeze({ ...price }));
  }
  return prices;
}
