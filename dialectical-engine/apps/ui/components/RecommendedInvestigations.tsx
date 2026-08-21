"use client";

import type { RecommendedInvestigation } from "@/lib/types";
import {
  formatRecommendationAction,
  recommendationTargetClaimId,
  selectAdditionalRecommendations,
  selectTopRecommendation,
} from "@/lib/recommendation";

export type RecommendedInvestigationsProps = {
  recommendations: RecommendedInvestigation[];
  canOpenTarget?: (targetClaimId: string) => boolean;
  onOpenTarget?: (targetClaimId: string) => void;
  onStartInvestigation?: (recommendation: RecommendedInvestigation) => void;
  emptyMessage?: string;
};

export function RecommendedInvestigations({
  recommendations,
  canOpenTarget,
  onOpenTarget,
  onStartInvestigation,
  emptyMessage = "No recommended investigations are available from the current scoring data."
}: RecommendedInvestigationsProps) {
  const topRecommendation = selectTopRecommendation(recommendations);
  const additionalRecommendations = selectAdditionalRecommendations(recommendations);
  const rankedRecommendations = topRecommendation ? [topRecommendation, ...additionalRecommendations] : [];

  function renderRecommendationItem(recommendation: RecommendedInvestigation, index: number) {
    const targetClaimId = recommendationTargetClaimId(recommendation);
    const targetAvailable = Boolean(targetClaimId && (canOpenTarget ? canOpenTarget(targetClaimId) : true));
    return (
      <li
        key={`${recommendation.action}-${recommendation.priority}-${targetClaimId ?? "none"}-${index}`}
        className="recommendationItem"
      >
        <div className="recommendationMeta">
          <span>Recommendation #{index + 1}</span>
          <span>{formatRecommendationAction(recommendation.action)}</span>
          <span>priority {recommendation.priority}</span>
          <span>{targetAvailable ? "Target available" : "Target unavailable"}</span>
        </div>
        <div className="recommendationReason">{recommendation.reason}</div>
        <div className="recommendationActions">
          <button
            type="button"
            className="linkBtn"
            disabled={!targetClaimId || !targetAvailable || !onOpenTarget}
            onClick={() => {
              if (!targetClaimId || !targetAvailable || !onOpenTarget) return;
              onOpenTarget(targetClaimId);
            }}
          >
            Open target
          </button>
          <button
            type="button"
            className="linkBtn"
            disabled={!onStartInvestigation}
            onClick={() => onStartInvestigation?.(recommendation)}
          >
            Start investigation
          </button>
        </div>
      </li>
    );
  }

  return (
    <section className="recommendationsPanel" aria-label="Recommended investigations">
      <div className="recommendationsHeader">
        <div>
          <div className="recommendationsEyebrow">Recommended investigations</div>
          <div className="recommendationsCount">{rankedRecommendations.length} from current scoring data</div>
        </div>
      </div>
      {rankedRecommendations.length > 0 ? (
        <>
          <ol className="recommendationsList recommendationsPrimary">
            {renderRecommendationItem(rankedRecommendations[0], 0)}
          </ol>
          {additionalRecommendations.length > 0 ? (
            <details className="recommendationsDetails">
              <summary className="recommendationsSummary">
                {additionalRecommendations.length} more recommendation
                {additionalRecommendations.length === 1 ? "" : "s"}
              </summary>
              <ol className="recommendationsList">
                {additionalRecommendations.map((recommendation, index) => renderRecommendationItem(recommendation, index + 1))}
              </ol>
            </details>
          ) : null}
        </>
      ) : (
        <p>{emptyMessage}</p>
      )}
    </section>
  );
}
