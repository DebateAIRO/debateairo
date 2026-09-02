import type { AbstentionKind, Answer, ConditionMark, StalenessState } from "@debateai/contract";
import type { VerdictSummary } from "../types.js";

export function riskTierSourceLabel(source: Answer["tier_source"]): string {
  switch (source) {
    case "ASKER": return "chosen by the asker";
    case "MACHINE_DEFAULT": return "machine default from the deployment floor";
    case "DEPLOYMENT_POLICY": return "raised by deployment policy";
  }
}

/**
 * UI-01: human labels for V3's closed honesty vocabularies, ported from the
 * S14 reading surface (web/lib/v3Presentation.ts) so no honesty surface is
 * lost in the restored V2 workspace. The switch is exhaustive over the
 * kernel vocabulary — a new mark fails typecheck here, never silently
 * renders unnamed.
 */
export function conditionMarkLabel(mark: ConditionMark): string {
  switch (mark) {
    case "UNINSTRUMENTED": return "Checking record incomplete";
    case "UNFALSIFIED-AFTER-ROTATION": return "Not falsified after model rotation";
    case "SKIPPED-BY-BUDGET": return "Enrichment skipped by budget";
    case "ENVELOPE_EXHAUSTED": return "Run envelope exhausted";
    case "LEVERAGE_UNRESOLVED": return "Leverage unresolved";
    case "DEGRADED-DIVERSITY": return "Model diversity degraded";
    case "SINGLE-LINEAGE": return "Single model lineage";
    case "CRITIQUE-UNAVAILABLE": return "Independent critique unavailable";
    case "PANEL-PARTIAL": return "Some judges could not assess this point";
    case "PANEL-DEGRADED-SINGLE-VOICE": return "Only the author's own assessment survived";
    case "AMBIGUOUS_ATTRIBUTION": return "Attribution ambiguous";
    case "STALE": return "Stale";
    case "UNDER-REVIEW": return "Under review";
    case "UNDER-EXPLORED": return "Under-explored";
    case "UNRESOLVED-TYPE-FALLBACK": return "Question type unresolved; fallback served";
    case "DEFECT": return "Defect: components-only answer";
    case "UNPRICED": return "Abstention cell unpriced";
    case "UNADJUDICATED": return "No adverse evidence found";
    case "UNCOVERED-SCOPE": return "Scope not fully covered";
    case "UNSERVED-MAKER-POSITION": return "Another maker's position was not served";
    case "NON-COMPARABLE": return "Results are not compute-matched";
    case "NOT_SAMPLED": return "Not sampled";
    case "OFF-SUBJECT-DOWNGRADE": return "Off-subject evidence downgraded";
    case "WAY-OF-KNOWING-DOWNGRADED": return "Claimed lookup had no locator";
    case "AMENDED-SEARCH": return "Search amended during run";
    case "MISSING-NUMBER": return "Number removed after replay failure";
    case "OWED-CHECK-UNEXECUTED": return "Owed check not executed at completion";
    case "SYNTHESIS-OBJECTION-STANDING": return "An evaluator objection is still standing on this statement";
    case "DIGEST-COMPRESSED": return "Node summaries shortened to fit the composition budget";
    case "DIGEST-CANNOT-EXIST": return "No digest could be built within the composition budget";
    case "PROTECTED-CORE-GUARD-RETIRED": return "Run stopped on budget; the restatement check no longer gated it";
    case "HIDDEN-UNJUDGEABLE": return "Hidden: could not be judged — show hidden to read it";
    case "DERIVED-STANDING-UNREVIEWED": return "Stands on its judged arguments — its own cross-house review is missing";
    case "HIDDEN-LOW-SCORE": return "Hidden: scored below the shown threshold";
    case "UNAUTHORED-BRANCH-HALTED": return "Expansion stopped here — nothing was written to hide or show";
    case "LABEL-BASIS-INCOMPLETE": return "Verdict basis incomplete — no rival position or no second judge to compare";
  }
}

/**
 * T11 confirm-item 4 — the live banner's verdict vocabulary, wired to the
 * engine's three-state label. VOCABULARY WIRING ONLY: the banner, its bands and
 * its copy are untouched, and renaming the UI vocabulary (the last pairing
 * stretches the existing string's meaning) is UI-owned work for another lane.
 *
 * The switch is exhaustive over the engine's label union — a fourth state fails
 * typecheck here rather than rendering as an unnamed verdict.
 */
export function liveVerdictState(
  label: NonNullable<Answer["verdict_state"]>
): NonNullable<VerdictSummary["verdictState"]> {
  switch (label) {
    case "SUPPORTED": return "endorsed";
    case "CONTESTED": return "endorsed_with_caveat";
    case "UNSUPPORTED": return "suppressed_no_evidence";
  }
}

export function abstentionKindLabel(kind: AbstentionKind): string {
  switch (kind) {
    case "not searched": return "Not searched";
    case "searched and found nothing": return "Searched and found nothing";
    case "measured and inconclusive": return "Measured, but inconclusive";
    case "not runnable": return "Not runnable";
    case "a value choice": return "A value choice";
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
