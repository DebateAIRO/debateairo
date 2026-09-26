import type { AbstentionKind, Answer, ConditionMark, StalenessState } from "@debateai/contract";
import debateChromeEnglish from "../../messages/en/debateChrome.json" with { type: "json" };
import { t, type MessageCatalog } from "../i18n/translate.js";
import type { LiveVerdictState } from "../types.js";

export function riskTierSourceLabel(
  source: Answer["tier_source"],
  catalog: MessageCatalog = debateChromeEnglish
): string {
  switch (source) {
    case "ASKER": return t(catalog, "debateChrome.riskTier.chosenByAsker");
    case "MACHINE_DEFAULT": return t(catalog, "debateChrome.riskTier.machineDefault");
    case "DEPLOYMENT_POLICY": return t(catalog, "debateChrome.riskTier.deploymentPolicy");
  }
}

/**
 * UI-01: human labels for V3's closed honesty vocabularies, ported from the
 * S14 reading surface (web/lib/v3Presentation.ts) so no honesty surface is
 * lost in the restored V2 workspace. The switch is exhaustive over the
 * kernel vocabulary — a new mark fails typecheck here, never silently
 * renders unnamed.
 */
export function conditionMarkLabel(
  mark: ConditionMark,
  catalog: MessageCatalog = debateChromeEnglish
): string {
  switch (mark) {
    case "UNINSTRUMENTED": return t(catalog, "debateChrome.condition.uninstrumented");
    case "UNFALSIFIED-AFTER-ROTATION": return t(catalog, "debateChrome.condition.unfalsifiedAfterRotation");
    case "SKIPPED-BY-BUDGET": return t(catalog, "debateChrome.condition.skippedByBudget");
    case "ENVELOPE_EXHAUSTED": return t(catalog, "debateChrome.condition.envelopeExhausted");
    case "LEVERAGE_UNRESOLVED": return t(catalog, "debateChrome.condition.leverageUnresolved");
    case "BRANCH-FROZEN-LOW-LEVERAGE": return t(catalog, "debateChrome.condition.branchFrozenLowLeverage");
    case "DEGRADED-DIVERSITY": return t(catalog, "debateChrome.condition.degradedDiversity");
    case "SINGLE-LINEAGE": return t(catalog, "debateChrome.condition.singleLineage");
    case "CRITIQUE-UNAVAILABLE": return t(catalog, "debateChrome.condition.critiqueUnavailable");
    case "PANEL-PARTIAL": return t(catalog, "debateChrome.condition.panelPartial");
    case "PANEL-DEGRADED-SINGLE-VOICE": return t(catalog, "debateChrome.condition.panelDegradedSingleVoice");
    case "AMBIGUOUS_ATTRIBUTION": return t(catalog, "debateChrome.condition.ambiguousAttribution");
    case "STALE": return t(catalog, "debateChrome.condition.stale");
    case "UNDER-REVIEW": return t(catalog, "debateChrome.condition.underReview");
    case "UNDER-EXPLORED": return t(catalog, "debateChrome.condition.underExplored");
    case "UNRESOLVED-TYPE-FALLBACK": return t(catalog, "debateChrome.condition.unresolvedTypeFallback");
    case "DEFECT": return t(catalog, "debateChrome.condition.defect");
    case "UNPRICED": return t(catalog, "debateChrome.condition.unpriced");
    case "UNADJUDICATED": return t(catalog, "debateChrome.condition.unadjudicated");
    case "UNCOVERED-SCOPE": return t(catalog, "debateChrome.condition.uncoveredScope");
    case "UNSERVED-MAKER-POSITION": return t(catalog, "debateChrome.condition.unservedMakerPosition");
    case "NON-COMPARABLE": return t(catalog, "debateChrome.condition.nonComparable");
    case "NOT_SAMPLED": return t(catalog, "debateChrome.condition.notSampled");
    case "OFF-SUBJECT-DOWNGRADE": return t(catalog, "debateChrome.condition.offSubjectDowngrade");
    case "WAY-OF-KNOWING-DOWNGRADED": return t(catalog, "debateChrome.condition.wayOfKnowingDowngraded");
    case "AMENDED-SEARCH": return t(catalog, "debateChrome.condition.amendedSearch");
    case "MISSING-NUMBER": return t(catalog, "debateChrome.condition.missingNumber");
    case "OWED-CHECK-UNEXECUTED": return t(catalog, "debateChrome.condition.owedCheckUnexecuted");
    case "SYNTHESIS-OBJECTION-STANDING": return t(catalog, "debateChrome.condition.synthesisObjectionStanding");
    case "DIGEST-COMPRESSED": return t(catalog, "debateChrome.condition.digestCompressed");
    case "DIGEST-CANNOT-EXIST": return t(catalog, "debateChrome.condition.digestCannotExist");
    case "PROTECTED-CORE-GUARD-RETIRED": return t(catalog, "debateChrome.condition.protectedCoreGuardRetired");
    case "HIDDEN-UNJUDGEABLE": return t(catalog, "debateChrome.condition.hiddenUnjudgeable");
    case "DERIVED-STANDING-UNREVIEWED": return t(catalog, "debateChrome.condition.derivedStandingUnreviewed");
    case "HIDDEN-LOW-SCORE": return t(catalog, "debateChrome.condition.hiddenLowScore");
    case "UNAUTHORED-BRANCH-HALTED": return t(catalog, "debateChrome.condition.unauthoredBranchHalted");
    case "LABEL-BASIS-INCOMPLETE": return t(catalog, "debateChrome.condition.labelBasisIncomplete");
  }
}

/**
 * T11 confirm-item 4 — the live banner's verdict vocabulary IS the engine's
 * own, lower-cased: V ruled "rename now" (D77 of 2026-09-18), declining the
 * goal's "accept the mapping now, rename later". The retired words came from
 * the older evidence gate and made the banner say something false about a
 * label derived from propagated strength alone.
 *
 * The switch is exhaustive over the engine's label union — a fourth state fails
 * typecheck here rather than rendering as an unnamed verdict.
 */
export function liveVerdictState(
  label: NonNullable<Answer["verdict_state"]>
): LiveVerdictState {
  switch (label) {
    case "SUPPORTED": return "supported";
    case "CONTESTED": return "contested";
    case "UNSUPPORTED": return "unsupported";
  }
}

export function abstentionKindLabel(
  kind: AbstentionKind,
  catalog: MessageCatalog = debateChromeEnglish
): string {
  switch (kind) {
    case "not searched": return t(catalog, "debateChrome.abstention.notSearched");
    case "searched and found nothing": return t(catalog, "debateChrome.abstention.searchedFoundNothing");
    case "measured and inconclusive": return t(catalog, "debateChrome.abstention.measuredInconclusive");
    case "not runnable": return t(catalog, "debateChrome.abstention.notRunnable");
    case "a value choice": return t(catalog, "debateChrome.abstention.valueChoice");
  }
}

export type FreshnessItem = Readonly<{ subjectRef: string; state: StalenessState }>;

export function summarizeFreshness(items: readonly FreshnessItem[]):
  | Readonly<{ kind: "EMPTY"; items: readonly FreshnessItem[] }>
  | Readonly<{ kind: "UNIFORM"; state: StalenessState; items: readonly FreshnessItem[] }>
  | Readonly<{ kind: "MIXED"; items: readonly FreshnessItem[] }> {
  const frozen = Object.freeze(items.map((item) => Object.freeze({ ...item })));
  if (frozen.length === 0) return { kind: "EMPTY", items: frozen };
  const first = frozen[0]!.state;
  return frozen.every((item) => item.state === first)
    ? { kind: "UNIFORM", state: first, items: frozen }
    : { kind: "MIXED", items: frozen };
}
