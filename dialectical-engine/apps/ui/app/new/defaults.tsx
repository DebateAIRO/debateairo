import type { DepthParams, Deployment, PlanTier, Session } from "@debateai/contract";
import { TypedDomainError, type ModelStrength } from "@debateai/kernel";
import { t, type MessageCatalog } from "@/lib/i18n/translate";

export type RiskTier = "casual" | "standard" | "high-stakes";
export type CompositionBudgetTier = "low" | "medium" | "high";

export const DECISION_SCOPE_DEFAULT = "personal" as const;
// QUESTION FOR V: ratify this provisional product value or require an
// explicit user choice. It is intentionally not derived from deployment data.
export const PROVISIONAL_COMPOSITION_BUDGET_DEFAULT = "low" as const;

/*
 * Debate shape P2c (spec 2026-10-12 §3.2, rulings S6–S8): the three choices the ask carries in
 * depth_params, typed by the contract (P2a) so the page never restates them. The API normalises
 * each one per plan again; the page only keeps itself honest.
 */
export type DepthMode = NonNullable<DepthParams["depthMode"]>;
export type Scrutiny = NonNullable<DepthParams["scrutiny"]>;
export type AnswerLength = NonNullable<DepthParams["answerLength"]>;
/** V4 reading level (owner N6): the same three levels the contract's depth_params carries. */
export type ReadingLevel = NonNullable<DepthParams["readingLevel"]>;
export const DEPTH_MODES: readonly DepthMode[] = ["adaptive", "fixed"];
export const SCRUTINY_LEVELS: readonly Scrutiny[] = ["standard", "deep", "exhaustive"];
export const ANSWER_LENGTHS: readonly AnswerLength[] = ["short", "standard", "detailed"];

/**
 * Spec 2026-10-15 §3.8: what the hint says when no room read named the plan's own words. The program's start values,
 * OVERVIEW C-1 (owner ruling G5): Short 200, Standard 350, Detailed 1,000 (engine INTERFACE §4.1).
 */
const ANSWER_LENGTH_HINT_DEFAULTS = Object.freeze({ short: 200, standard: 350, detailed: 1000 });

/**
 * The hint's three numbers for the person's plan (the room read's `answer_words`, else the start values 200 / 350 / 1,000),
 * formatted by the page's language rules with Latin digits, as every translation wrote them before ("1.500", "1 500").
 * A browser with no number data for the language formats them in English (never another language's grouping).
 */
export function answerLengthHintVars(words: Readonly<{ short: number; standard: number; detailed: number }> | null,
  locale: string): Readonly<{ short: string; standard: string; detailed: string }> {
  const chosen = words ?? ANSWER_LENGTH_HINT_DEFAULTS;
  let known: boolean;
  try { known = Intl.NumberFormat.supportedLocalesOf(locale).length > 0; } catch { known = false; }
  let format: Intl.NumberFormat;
  try { format = new Intl.NumberFormat(known ? locale : "en", { numberingSystem: "latn" }); } catch { format = new Intl.NumberFormat("en"); }
  return Object.freeze({ short: format.format(chosen.short), standard: format.format(chosen.standard), detailed: format.format(chosen.detailed) });
}

/** S6: Fixed is offered on Premium; Free is adaptive (its depth ceiling 2). */
export function fixedDepthAllowedFor(planTier: PlanTier): boolean {
  return planTier !== "free";
}

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
  readonly asOfWasEdited: boolean;
  readonly planTier?: PlanTier;
  readonly riskTierWasEdited?: boolean;
  /** A21: the asker's choice, or null/absent — then the ask omits it and the deployment's default applies. */
  readonly modelStrength?: ModelStrength | null;
  /** Debate shape P2c: absent sends nothing, so the API's default applies and older callers keep working. */
  readonly depthMode?: DepthMode;
  readonly scrutiny?: Scrutiny;
  readonly answerLength?: AnswerLength;
  /** V4 reading level (owner N6, 2026-10-29): sent by the V4 ask page only; absent sends nothing (every /new ask). */
  readonly readingLevel?: ReadingLevel;
  /**
   * Side-by-side spec §13 (Task S12): the settings version the room read named (`settings_version`); absent sends
   * nothing, so the API normalises the ask as before.
   */
  readonly settingsVersion?: number;
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
    // S1-2 · V ruling 2026-09-03: the asker has no steering control, so these
    // are always empty. The two contract fields stay PRESENT rather than being
    // dropped, so the submitted ask and every already-stored ask stay valid.
    steering_presets: [],
    steering_annotations: [],
    ...(defaults.modelStrength === undefined || defaults.modelStrength === null
      ? {}
      : { model_strength: defaults.modelStrength }),
    ...(defaults.depthMode === undefined ? {} : { depth_mode: defaults.depthMode }),
    ...(defaults.scrutiny === undefined ? {} : { scrutiny: defaults.scrutiny }),
    ...(defaults.answerLength === undefined ? {} : { answer_length: defaults.answerLength }),
    ...(defaults.readingLevel === undefined ? {} : { reading_level: defaults.readingLevel }),
    ...(defaults.settingsVersion === undefined ? {} : { settings_version: defaults.settingsVersion })
  };
}
