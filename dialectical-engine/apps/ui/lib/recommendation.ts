import type { InvestigationAction, ManualInvestigationStatus, RecommendedInvestigation } from "@/lib/types";

const ACTION_LABELS: Record<InvestigationAction, string> = {
  ask_user: "Ask user",
  challenge: "Challenge",
  decompose: "Decompose",
  find_evidence: "Find evidence",
  support: "Support"
};

export function selectTopRecommendation(
  recommendations: RecommendedInvestigation[] | null | undefined
): RecommendedInvestigation | null {
  const usable = sortUsableRecommendations(recommendations);
  return usable[0] ?? null;
}

export function selectAdditionalRecommendations(
  recommendations: RecommendedInvestigation[] | null | undefined
): RecommendedInvestigation[] {
  return sortUsableRecommendations(recommendations).slice(1);
}

/**
 * S14 / W19: the tiebreak must not depend on the host's locale. A collation
 * comparison reads ICU tables, so the same two recommendations can order one
 * way on the Mac mini and the other way in CI — the same class of defect as a
 * machine-specific path. A code-unit comparison is total, stable and identical
 * on every machine. The five InvestigationAction values are distinct
 * lowercase ASCII, so their order is unchanged by this.
 *
 * Both lines reached this fix independently — S14 / W19 on `dev` and B30 on the
 * security line — with byte-identical bodies and no textual conflict, so the
 * 2026-09-22 merge silently kept BOTH declarations and the module stopped
 * parsing. One declaration, both ticket ids.
 */
function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortUsableRecommendations(
  recommendations: RecommendedInvestigation[] | null | undefined
): RecommendedInvestigation[] {
  const usable = (recommendations ?? []).filter((item) => item.reason.trim());
  if (usable.length === 0) return [];
  return [...usable].sort((left, right) => {
    if (left.priority !== right.priority) return left.priority - right.priority;
    if (left.action !== right.action) return compareCodeUnits(left.action, right.action);
    return compareCodeUnits(left.reason, right.reason);
  });
}

export function formatRecommendationAction(action: InvestigationAction): string {
  return ACTION_LABELS[action] ?? action;
}

export function recommendationTargetClaimId(recommendation: RecommendedInvestigation): string | null {
  return recommendation.target_node_id?.trim() || null;
}

export type ManualInvestigationActionState = {
  status: ManualInvestigationStatus;
  disabled: boolean;
  label: string;
  reason: string | null;
};

export function manualInvestigationActionState(
  action: InvestigationAction,
  options: { runFlowWired: boolean }
): ManualInvestigationActionState {
  if (action === "ask_user") {
    return {
      status: "unavailable",
      disabled: true,
      label: "Manual investigation unavailable",
      reason: "No existing backend orchestration path is wired for ask_user."
    };
  }
  if (!options.runFlowWired) {
    return {
      status: "unavailable",
      disabled: true,
      label: "Manual investigation unavailable",
      reason: "Manual investigation controls are not wired in this drawer yet."
    };
  }
  return {
    status: "queued",
    disabled: false,
    label: "Start manual investigation",
    reason: null
  };
}
