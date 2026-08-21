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
  const asOf = defaults.asOfWasEdited ? new Date(defaults.asOf) : submitTime;
  if (Number.isNaN(asOf.valueOf())) {
    throw new TypedDomainError("ASK_AS_OF_INVALID", "As of must be a valid date and time.");
  }
  return {
    risk_tier: defaults.riskTier,
    tier_source: defaults.riskTierWasEdited ? "ASKER" : "MACHINE_DEFAULT",
    tier_provenance_ref: defaults.riskTierWasEdited ? "asker:ui-selection" : "machine:deployment-floor",
    composition_budget_tier: defaults.budgetTier,
    depth: defaults.depth,
    decision_owner: defaults.decisionOwner.trim(),
    action_owner: defaults.actionOwner.trim(),
    decision_scope: defaults.decisionScope.trim(),
    as_of: asOf.toISOString()
  };
}
