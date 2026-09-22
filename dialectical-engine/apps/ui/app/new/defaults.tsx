import type { Deployment, PlanTier, Session } from "@debateai/contract";
import { TypedDomainError } from "@debateai/kernel";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

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

export function deriveSessionAskDefaults(session: Session, now: Date = new Date(), catalog?: MessageCatalog) {
  return Object.freeze({
    decisionScope: DECISION_SCOPE_DEFAULT,
    asOf: dateTimeLocalValue(now),
    decisionScopeProvenance: t(catalog, "newDebate.decisionScopeProvenance"),
    asOfProvenance: t(catalog, "newDebate.asOfProvenance")
  });
}

export function deriveRiskTierDefault(deployment: Deployment, catalog?: MessageCatalog) {
  const riskRow = deployment.register.rows.find((row) => row.row_key === "riskTier");
  if (riskRow === undefined || !["casual", "standard", "high-stakes"].includes(String(riskRow.value))) {
    throw new TypedDomainError(
      "ASK_RISK_TIER_DEFAULT_UNAVAILABLE",
      t(catalog, "newDebate.defaultUnavailable")
    );
  }
  return Object.freeze({
    riskTier: riskRow.value as RiskTier,
    riskTierProvenance: `deployment riskTier floor (${riskRow.source_ref})`
  });
}

export function askDefaultFailureMessage(
  failure: unknown,
  fallbackCode: string,
  catalog?: MessageCatalog
): string {
  if (failure instanceof TypedDomainError) return `${failure.code}: ${failure.message}`;
  return `${fallbackCode}: ${failure instanceof Error ? failure.message : t(catalog, "newDebate.defaultDerivationFailed")}`;
}

export type NewDebateAskDefaults = {
  readonly riskTier: RiskTier;
  readonly budgetTier: CompositionBudgetTier;
  readonly decisionScope: string;
  readonly asOf: string;
  readonly depth: number;
  readonly steeringPresets?: string;
  readonly steeringAnnotations?: string;
  readonly asOfWasEdited: boolean;
  readonly planTier?: PlanTier;
  readonly riskTierWasEdited?: boolean;
};

export function buildNewDebateAskConfig(
  defaults: NewDebateAskDefaults,
  submitTime: Date,
  catalog?: MessageCatalog
): Record<string, unknown> {
  const asOf = defaults.asOfWasEdited ? new Date(defaults.asOf) : submitTime;
  if (Number.isNaN(asOf.valueOf())) {
    throw new TypedDomainError("ASK_AS_OF_INVALID", t(catalog, "newDebate.invalidAsOf"));
  }
  return {
    plan_tier: defaults.planTier,
    risk_tier: defaults.riskTier,
    tier_source: defaults.riskTierWasEdited ? "ASKER" : "MACHINE_DEFAULT",
    tier_provenance_ref: defaults.riskTierWasEdited ? "asker:ui-selection" : "machine:plan-tier-free",
    composition_budget_tier: defaults.budgetTier,
    depth: defaults.depth,
    decision_scope: defaults.decisionScope.trim(),
    as_of: asOf.toISOString(),
    steering_presets: (defaults.steeringPresets ?? "")
      .split("\n").map((value) => value.trim()).filter(Boolean),
    steering_annotations: (defaults.steeringAnnotations ?? "")
      .split("\n").map((value) => value.trim()).filter(Boolean)
  };
}
