"use client";

import type { RecommendedInvestigation } from "@/lib/types";
import {
  formatRecommendationAction,
  recommendationTargetNodeId,
  selectAdditionalRecommendations,
  selectTopRecommendation
} from "@/lib/recommendation";

export type RecommendedInvestigationsProps = {
  recommendations: RecommendedInvestigation[];
  canOpenTarget?: (targetNodeId: string) => boolean;
  onOpenTarget?: (targetNodeId: string) => void;
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

  return (
    <section className="drawerScoringRecommendation" aria-label="Recommended investigations">
      <div className="drawerSectionTitle">Recommended investigations</div>
      {rankedRecommendations.length > 0 ? (
        <ol className="drawerFindingList">
          {rankedRecommendations.map((recommendation, index) => {
            const targetNodeId = recommendationTargetNodeId(recommendation);
            const targetAvailable = Boolean(targetNodeId && (canOpenTarget ? canOpenTarget(targetNodeId) : true));
            return (
              <li
                key={`${recommendation.action}-${recommendation.priority}-${targetNodeId ?? "none"}-${index}`}
                className="drawerFindingItem"
              >
                <div className="drawerFindingMeta">
                  <span>Recommendation #{index + 1}</span>
                  <span>{formatRecommendationAction(recommendation.action)}</span>
                  <span>priority {recommendation.priority}</span>
                  <span>{targetAvailable ? "Target available" : "Target unavailable"}</span>
                </div>
                <div className="drawerFindingText">{recommendation.reason}</div>
                <div className="drawerFindingMeta">
                  <button
                    type="button"
                    className="linkBtn"
                    disabled={!targetNodeId || !targetAvailable || !onOpenTarget}
                    onClick={() => {
                      if (!targetNodeId || !targetAvailable || !onOpenTarget) return;
                      onOpenTarget(targetNodeId);
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
          })}
        </ol>
      ) : (
        <p>{emptyMessage}</p>
      )}
    </section>
  );
}
