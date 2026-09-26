"use client";

import type { RecommendedInvestigation } from "@/lib/types";
import {
  formatRecommendationAction,
  recommendationTargetClaimId,
  selectAdditionalRecommendations,
  selectTopRecommendation,
} from "@/lib/recommendation";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import debateDrawersEnglish from "@/messages/en/debateDrawers.json";
import composeEnglish from "@/messages/en/compose.json";

export type RecommendedInvestigationsProps = {
  recommendations: RecommendedInvestigation[];
  canOpenTarget?: (targetClaimId: string) => boolean;
  onOpenTarget?: (targetClaimId: string) => void;
  onStartInvestigation?: (recommendation: RecommendedInvestigation) => void;
  emptyMessage?: string;
  catalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: the investigation action names. */
  composeCatalog?: MessageCatalog;
};

export function RecommendedInvestigations({
  recommendations,
  canOpenTarget,
  onOpenTarget,
  onStartInvestigation,
  emptyMessage,
  catalog = debateDrawersEnglish,
  composeCatalog = composeEnglish
}: RecommendedInvestigationsProps) {
  const { locale } = useChromeI18n();
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
          <span>{t(catalog, "debateDrawers.recommendations.rank", { rank: index + 1 })}</span>
          <span>{formatRecommendationAction(recommendation.action, composeCatalog)}</span>
          <span>{t(catalog, "debateDrawers.recommendations.priority", { priority: recommendation.priority })}</span>
          <span>{t(catalog, targetAvailable ? "debateDrawers.recommendations.targetAvailable" : "debateDrawers.recommendations.targetUnavailable")}</span>
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
            {t(catalog, "debateDrawers.recommendations.openTarget")}
          </button>
          <button
            type="button"
            className="linkBtn"
            disabled={!onStartInvestigation}
            onClick={() => onStartInvestigation?.(recommendation)}
          >
            {t(catalog, "debateDrawers.recommendations.startInvestigation")}
          </button>
        </div>
      </li>
    );
  }

  return (
    <section className="recommendationsPanel" aria-label={t(catalog, "debateDrawers.recommendations.title")}>
      <div className="recommendationsHeader">
        <div>
          <div className="recommendationsEyebrow">{t(catalog, "debateDrawers.recommendations.title")}</div>
          <div className="recommendationsCount">{t(catalog, "debateDrawers.recommendations.fromScoringData", { count: rankedRecommendations.length })}</div>
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
                {tPlural(catalog, "debateDrawers.recommendations.more", additionalRecommendations.length, locale)}
              </summary>
              <ol className="recommendationsList">
                {additionalRecommendations.map((recommendation, index) => renderRecommendationItem(recommendation, index + 1))}
              </ol>
            </details>
          ) : null}
        </>
      ) : (
        <p>{emptyMessage ?? t(catalog, "debateDrawers.recommendations.empty")}</p>
      )}
    </section>
  );
}
