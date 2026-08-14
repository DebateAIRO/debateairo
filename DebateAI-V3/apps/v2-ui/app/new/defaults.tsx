import type { Deployment, Session } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";

export type RiskTier = "casual" | "standard" | "high-stakes";
export type CompositionBudgetTier = "low" | "medium" | "high";

export const DECISION_SCOPE_DEFAULT = "personal" as const;
// QUESTION FOR V: ratify this provisional product value or require an
// explicit user choice. It is intentionally not derived from deployment data.
export const PROVISIONAL_COMPOSITION_BUDGET_DEFAULT = "low" as const;

export function dateTimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function deriveSessionAskDefaults(session: Session, now: Date = new Date()) {
  return Object.freeze({
    decisionOwner: session.asker_id,
    actionOwner: session.asker_id,
    decisionScope: DECISION_SCOPE_DEFAULT,
    asOf: dateTimeLocalValue(now),
    decisionOwnerProvenance: "authenticated session asker identity",
    actionOwnerProvenance: "authenticated session asker identity",
    decisionScopeProvenance: "V ruling DR-166",
    asOfProvenance: "ask time (refreshed when Start is clicked)"
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

const SET_A_HEADROOM_MULTIPLIER = 3;
const HEALTHY_FIXED_MODEL_CALLS = 4;

function ratifiedEnvelopeAttempts(depth: number, makerCount: number): number {
  const treeAuthoringCalls = makerCount * (2 ** (depth + 1) - 1);
  const crossRootAuthoringCalls = makerCount * (makerCount - 1);
  const authoredNodeCalls = treeAuthoringCalls + crossRootAuthoringCalls;
  return (authoredNodeCalls * 2 + HEALTHY_FIXED_MODEL_CALLS) * SET_A_HEADROOM_MULTIPLIER;
}

function deriveRatifiedMakerMaximum(deployment: Deployment): { readonly maximum: number; readonly provenance: string } {
  const envelopeRow = deployment.register.rows.find((row) => row.row_key === "runCostEnvelope");
  const envelope = record(envelopeRow?.value);
  const members = envelope?.members;
  if (envelopeRow === undefined || envelope?.kind !== "RUN_COST_ENVELOPE_POLICY" || !Array.isArray(members) || members.length === 0) {
    throw new TypedDomainError(
      "ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE",
      "The deployment runCostEnvelope cannot identify a ratified maker maximum."
    );
  }

  const maxima = new Set<number>();
  for (const rawMember of members) {
    const member = record(rawMember);
    const depthParams = record(member?.depth_params);
    const depth = depthParams?.depth;
    const ceiling = member?.max_model_attempts;
    if (!Number.isInteger(depth) || Number(depth) < 1 || !Number.isInteger(ceiling) || Number(ceiling) < 1) {
      throw new TypedDomainError(
        "ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE",
        "The deployment runCostEnvelope has an invalid member."
      );
    }
    let candidate = 1;
    while (ratifiedEnvelopeAttempts(Number(depth), candidate) < Number(ceiling)) candidate += 1;
    if (ratifiedEnvelopeAttempts(Number(depth), candidate) !== Number(ceiling)) {
      throw new TypedDomainError(
        "ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE",
        "The deployment runCostEnvelope does not encode a ratified maker maximum."
      );
    }
    maxima.add(candidate);
  }
  if (maxima.size !== 1) {
    throw new TypedDomainError(
      "ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE",
      "The deployment runCostEnvelope members disagree on the ratified maker maximum."
    );
  }
  const maximum = [...maxima][0]!;
  return Object.freeze({
    maximum,
    provenance: `runCostEnvelope@${deployment.register.register_version}:${envelopeRow.source_ref}`
  });
}

export function deriveAgentCountDefault(deployment: Deployment) {
  const providerSetRow = deployment.register.rows.find((row) => row.row_key === "configuredProviderSet");
  const providerSet = record(providerSetRow?.value);
  const providers = providerSet?.providers;
  const requiredDistinctMakers = providerSet?.requiredDistinctMakers;
  if (
    providerSetRow === undefined ||
    providerSet?.kind !== "CONFIGURED_PROVIDER_SET" ||
    !Array.isArray(providers) ||
    !Number.isInteger(requiredDistinctMakers) ||
    Number(requiredDistinctMakers) < 1
  ) {
    throw new TypedDomainError(
      "ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE",
      "The deployment configuredProviderSet row is invalid; Agent count awaits input."
    );
  }

  const configuredMakers = new Set<string>();
  for (const provider of providers) {
    const candidate = record(provider);
    if (
      candidate === null ||
      typeof candidate.providerRef !== "string" || candidate.providerRef.trim().length === 0 ||
      typeof candidate.adapterKind !== "string" || candidate.adapterKind.trim().length === 0 ||
      typeof candidate.maker !== "string" || candidate.maker.trim().length === 0
    ) {
      throw new TypedDomainError(
        "ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE",
        "The deployment configuredProviderSet row is invalid; Agent count awaits input."
      );
    }
    configuredMakers.add(candidate.maker);
  }
  if (configuredMakers.size === 0) {
    throw new TypedDomainError(
      "ASK_AGENT_COUNT_DEFAULT_UNAVAILABLE",
      "The deployment configuredProviderSet names no makers; Agent count awaits input."
    );
  }

  const makers = [...configuredMakers].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const ratifiedMaximum = deriveRatifiedMakerMaximum(deployment);
  const lawfulMakerCount = Math.min(makers.length, ratifiedMaximum.maximum);
  return Object.freeze({
    agentCount: String(lawfulMakerCount),
    agentCountProvenance: `configuredProviderSet@${deployment.register.register_version}:${providerSetRow.source_ref} (${makers.join(", ")}); capped by ${ratifiedMaximum.provenance} (M=${ratifiedMaximum.maximum})`
  });
}

export function deriveRiskTierDefault(deployment: Deployment) {
  const riskRow = deployment.register.rows.find((row) => row.row_key === "riskTier");
  if (riskRow === undefined || !["casual", "standard", "high-stakes"].includes(String(riskRow.value))) {
    throw new TypedDomainError(
      "ASK_RISK_TIER_DEFAULT_UNAVAILABLE",
      "The deployment has no valid riskTier row; Risk tier awaits input."
    );
  }
  return Object.freeze({
    riskTier: riskRow.value as RiskTier,
    riskTierProvenance: `deployment riskTier floor (${riskRow.source_ref})`
  });
}

export function askDefaultFailureMessage(failure: unknown, fallbackCode: string): string {
  if (failure instanceof TypedDomainError) return `${failure.code}: ${failure.message}`;
  return `${fallbackCode}: ${failure instanceof Error ? failure.message : "Default derivation failed"}`;
}

export type NewDebateAskDefaults = {
  readonly agentCount: string;
  readonly riskTier: RiskTier;
  readonly budgetTier: CompositionBudgetTier;
  readonly decisionOwner: string;
  readonly actionOwner: string;
  readonly decisionScope: string;
  readonly asOf: string;
  readonly depth: number;
  readonly asOfWasEdited: boolean;
  readonly riskTierWasEdited?: boolean;
};

export function buildNewDebateAskConfig(defaults: NewDebateAskDefaults, submitTime: Date): Record<string, unknown> {
  const agentCount = Number(defaults.agentCount);
  const asOf = defaults.asOfWasEdited ? new Date(defaults.asOf) : submitTime;
  if (!Number.isInteger(agentCount) || agentCount < 1) {
    throw new TypedDomainError("ASK_AGENT_COUNT_INVALID", "Agent count must be a positive integer.");
  }
  if (Number.isNaN(asOf.valueOf())) {
    throw new TypedDomainError("ASK_AS_OF_INVALID", "As of must be a valid date and time.");
  }
  return {
    risk_tier: defaults.riskTier,
    tier_source: defaults.riskTierWasEdited ? "ASKER" : "MACHINE_DEFAULT",
    tier_provenance_ref: defaults.riskTierWasEdited ? "asker:ui-selection" : "machine:deployment-floor",
    composition_budget_tier: defaults.budgetTier,
    depth: defaults.depth,
    agent_count: agentCount,
    decision_owner: defaults.decisionOwner.trim(),
    action_owner: defaults.actionOwner.trim(),
    decision_scope: defaults.decisionScope.trim(),
    as_of: asOf.toISOString()
  };
}
