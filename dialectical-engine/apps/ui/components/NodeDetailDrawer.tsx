"use client";

import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { nodeGenerations } from "@/lib/api";
import type {
  CurrentUserFeedbackVote,
  DebateNode,
  Generation,
  LifecycleDecision,
  NodeFeedbackSummary,
  NodeScoringError,
  NodeScoringPayload
} from "@/lib/types";
import { ROLE_PALETTES, roleLabel, roleOf } from "@/lib/debatePresentation";
import { isAbandonedArgumentStatus } from "@/lib/debateTreeUtils";
import {
  formatRecommendationAction,
  manualInvestigationActionState,
  recommendationTargetClaimId,
  selectAdditionalRecommendations,
  selectTopRecommendation
} from "@/lib/recommendation";
import { ModelMetaLine } from "@/components/ModelPresentation";
import { ScoringErrorBoundary } from "@/components/ScoringErrorBoundary";
import type { Node as ContractNode } from "@debateai/contract";
import { v3NodeHonestyRows, wayOfKnowingLabel } from "@/lib/v3/adapter";
import { abstentionKindLabel, conditionMarkLabel } from "@/lib/v3/labels";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import debateDrawersEnglish from "@/messages/en/debateDrawers.json";
import miscEnglish from "@/messages/en/misc.json";
import debateChromeEnglish from "@/messages/en/debateChrome.json";
import composeEnglish from "@/messages/en/compose.json";

function isSetAsidePath(node: DebateNode): boolean {
  const pathStatus = node.path_status?.trim().toLowerCase();
  const stoppingStatus = node.stopping_status?.trim().toLowerCase();
  return (
    pathStatus === "abandoned" ||
    stoppingStatus === "abandon" ||
    stoppingStatus === "abandoned"
  );
}

const DECISION_KIND_LABEL_KEYS: Record<string, string> = {
  continue: "debateDrawers.node.decisionContinue",
  deepen: "debateDrawers.node.decisionDeepen",
  seek_evidence: "debateDrawers.node.decisionSeekEvidence",
  challenge: "debateDrawers.node.decisionChallenge",
  abandon: "debateDrawers.node.decisionAbandon",
  reopen: "debateDrawers.node.decisionReopen"
};

function decisionKindLabel(catalog: MessageCatalog, decision: string): string {
  const key = DECISION_KIND_LABEL_KEYS[decision];
  return key ? t(catalog, key) : decision;
}

/**
 * W5a: honest causality phrasing for a node's latest lifecycle decision.
 * childSpawnCount > 0 is the ground truth for "this decision caused growth"
 * (see coordinator serialization.py's _decision_outcome) -- only then may the
 * copy say the expansion HAPPENED BECAUSE of the decision. Every other
 * decision (annotate-only, scalar-grounded, budget/capacity refused) steered
 * nothing, so the copy stays in "noted" register, never implying causation.
 */
function pathDecisionCopy(catalog: MessageCatalog, decision: LifecycleDecision): string {
  const reason = decision.reason?.trim();
  const kind = decisionKindLabel(catalog, decision.decision);
  if (decision.childSpawnCount > 0) {
    return reason
      ? t(catalog, "debateDrawers.node.pathExpandedWithReason", { reason, kind })
      : t(catalog, "debateDrawers.node.pathExpanded", { kind });
  }
  return reason
    ? t(catalog, "debateDrawers.node.pathNotedWithReason", { kind, reason })
    : t(catalog, "debateDrawers.node.pathNoted", { kind });
}

export function NodeDetailDrawer({
  node,
  v3,
  scoring,
  scoringError,
  feedbackSummary,
  currentUserFeedback,
  lifecycleDecision,
  token,
  onClose,
  onChallenge,
  onFocusRecommendationNode,
  canFocusRecommendationNode,
  onQueued,
  onError,
  onAuthRejected,
  catalog = debateDrawersEnglish,
  miscCatalog = miscEnglish,
  debateChromeCatalog = debateChromeEnglish,
  composeCatalog = composeEnglish
}: {
  node: DebateNode;
  /**
   * UI-01 additive: the V3 contract node behind this claim card. V2's drawer
   * has no home for V3's per-node honesty (way of knowing, labeled scores
   * with replay handles, restatement check, defeater obligation, condition
   * marks, abstention, freshness) — DR-145's no-honesty-regression law puts
   * it here, rendered with the drawer's own section vocabulary.
   */
  v3?: ContractNode;
  scoring?: NodeScoringPayload;
  scoringError?: NodeScoringError;
  feedbackSummary?: NodeFeedbackSummary;
  currentUserFeedback?: CurrentUserFeedbackVote;
  lifecycleDecision?: LifecycleDecision;
  token: string | null;
  onClose: () => void;
  onChallenge?: (anchor: HTMLElement, text: string) => void;
  onFocusRecommendationNode: (targetClaimId: string) => boolean;
  canFocusRecommendationNode: (targetClaimId: string) => boolean;
  onQueued: () => void;
  onError: (message: string) => void;
  onAuthRejected: () => void;
  catalog?: MessageCatalog;
  /** The interface locale's `misc` catalogue, for the model identity lines and the scoring fallback. */
  miscCatalog?: MessageCatalog;
  /** The interface locale's `debateChrome` catalogue: role label, condition and abstention labels. */
  debateChromeCatalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: way of knowing, V3 honesty rows, recommendations, model family. */
  composeCatalog?: MessageCatalog;
}) {
  const { locale } = useChromeI18n();
  const role = roleOf(node);
  const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
  const generation = node.active_generation;
  const isAbandoned = isAbandonedArgumentStatus(node.status);
  const stoppingReason = (node.stopping_reason_human ?? node.stopping_reason)?.trim();

  const [history, setHistory] = useState<Generation[]>([]);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [compareOn, setCompareOn] = useState(false);
  const [focusFailedTargetNodeId, setFocusFailedTargetNodeId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!token) {
      setHistory([]);
      return;
    }
    nodeGenerations(node.id, token)
      .then((items) => {
        if (active) setHistory(items);
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, [node.id, token]);

  useEffect(() => {
    setFocusFailedTargetNodeId(null);
  }, [node.id, scoring]);

  function selectProse(event: MouseEvent) {
    if (!onChallenge) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 4) return;
    onChallenge(event.currentTarget as HTMLElement, text);
  }

  function recommendationTargetButton(recommendation: NodeScoringPayload["recommended_investigations"][number]) {
    const targetClaimId = recommendationTargetClaimId(recommendation);
    const canFocusTarget = Boolean(targetClaimId && canFocusRecommendationNode(targetClaimId));
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
        <button
          type="button"
          className="linkBtn"
          disabled={!targetClaimId || !canFocusTarget}
          aria-label={t(catalog, canFocusTarget
            ? "debateDrawers.node.openRecommendedTargetClaim"
            : "debateDrawers.node.recommendedTargetUnavailable")}
          onClick={() => {
            if (!targetClaimId || !canFocusTarget) return;
            if (onFocusRecommendationNode(targetClaimId) === false) {
              setFocusFailedTargetNodeId(targetClaimId);
            } else {
              setFocusFailedTargetNodeId(null);
            }
          }}
        >
          {t(catalog, canFocusTarget
            ? "debateDrawers.recommendations.openTarget"
            : "debateDrawers.recommendations.targetUnavailable")}
        </button>
        {targetClaimId && !canFocusTarget ? (
          <span className="muted" role="status">
            {t(catalog, "debateDrawers.node.targetNotVisible")}
          </span>
        ) : null}
        {targetClaimId && focusFailedTargetNodeId === targetClaimId ? (
          <span className="muted" role="status">
            {t(catalog, "debateDrawers.node.targetFocusFailed")}
          </span>
        ) : null}
      </span>
    );
  }

  const current = history[selectedVersion];

  return (
    <>
      <div className="drawerScrim" data-drawer-scrim onClick={onClose} />
      <aside
        className="drawer scroll"
        data-drawer-panel
        data-design-turn="5"
        role="dialog"
        aria-modal
        aria-label={t(catalog, "debateDrawers.node.argumentDetail")}
        style={{ width: "min(440px, 100vw)", boxSizing: "border-box", background: "var(--core)" }}
      >
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <span className="roleBadge" style={{ color: pal.text, background: pal.bg, borderColor: pal.border }}>
              {pal.arrow} {roleLabel(node, debateChromeCatalog)}
            </span>
            {generation || node.maker !== undefined ? (
              <ModelMetaLine
                modelId={generation?.model_id ?? null}
                maker={node.maker}
                className="modelPill metaLine"
                catalog={miscCatalog}
                composeCatalog={composeCatalog}
              />
            ) : null}
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label={t(catalog, "debateDrawers.common.close")}>
            ×
          </button>
        </div>

        <div className="drawerBody">
          <div className="drawerIntro">
          {v3 ? (
            <div className="nodeEyebrow drawerWayOfKnowing" data-drawer-way-of-knowing>
              {t(catalog, "debateDrawers.node.wayOfKnowing", { way: wayOfKnowingLabel(v3.way_of_knowing, composeCatalog).toUpperCase() })}
            </div>
          ) : (
            <div className="nodeEyebrow">{t(catalog, "debateDrawers.node.argument")}</div>
          )}
          {isAbandoned || isSetAsidePath(node) ? (
            <div className="drawerAbandonedBanner" role="status">
              <div className="drawerSectionTitle">{t(catalog, "debateDrawers.node.stoppedPath")}</div>
              <p>{t(catalog, "debateDrawers.node.stoppedPathExplanation")}</p>
              {isSetAsidePath(node) && stoppingReason ? (
                <p>{t(catalog, "debateDrawers.node.setAsideReason", { reason: stoppingReason })}</p>
              ) : null}
            </div>
          ) : null}
          {lifecycleDecision ? (
            <div className="drawerPathDecision" role="status">
              <div className="drawerSectionTitle">{t(catalog, "debateDrawers.node.pathDecision")}</div>
              <p>{pathDecisionCopy(catalog, lifecycleDecision)}</p>
            </div>
          ) : null}
          <div className="drawerClaim" data-ai-generated={node.node_type === "ROOT_CLAIM" ? undefined : "true"}>{node.claim}</div>
          {generation?.argument ? (
            <div className="drawerProse" data-ai-generated={node.node_type === "ROOT_CLAIM" ? undefined : "true"} onMouseUp={onChallenge ? selectProse : undefined}>
              {generation.argument}
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 12 }}>
              {t(catalog, "debateDrawers.node.noArgumentText")}
            </div>
          )}
          {generation?.argument && onChallenge ? (
            <div className="drawerSelectHint">▲ {t(catalog, "debateDrawers.node.selectToChallenge")}</div>
          ) : null}
          </div>

          {v3 ? <NodeHonestyDetails
              v3={v3}
              catalog={catalog}
              miscCatalog={miscCatalog}
              debateChromeCatalog={debateChromeCatalog}
              composeCatalog={composeCatalog}
              locale={locale}
            /> : null}

          <div className="drawerActions drawerReferenceActions">
            {onChallenge ? (
              <button
                type="button"
                className="btn btnChallenge"
                onClick={(event) => onChallenge(event.currentTarget, "")}
              >
                ⚐ {t(catalog, "debateDrawers.node.challenge")}
              </button>
            ) : null}
            <button
              type="button"
              className="btn"
              disabled
              aria-disabled="true"
              title={t(catalog, "debateDrawers.node.regenerationUnavailable")}
            >
              ↻ {t(catalog, "debateDrawers.node.regenerate")}
            </button>
          </div>

          <div className="drawerHistoryHead">
            <span>{t(catalog, "debateDrawers.node.generationHistory")}</span>
            <span className="drawerHistoryRule" aria-hidden />
            {history.length > 1 ? (
              <button type="button" className="linkBtn" onClick={() => setCompareOn((value) => !value)}>
                {t(catalog, compareOn ? "debateDrawers.node.hideCompare" : "debateDrawers.node.compareVersions")}
              </button>
            ) : null}
          </div>

          {compareOn && current ? (
            <div className="compareRow">
              <div className="compareCell current">
                <div className="compareCellHead">
                  <span className="compareTag">{t(catalog, "debateDrawers.node.current")}</span>
                  {generation || node.maker !== undefined ? (
                    <ModelMetaLine modelId={generation?.model_id ?? null} maker={node.maker} className="modelPill metaLine" catalog={miscCatalog} composeCatalog={composeCatalog} />
                  ) : null}
                </div>
                <div className="compareClaim" data-ai-generated={node.node_type === "ROOT_CLAIM" ? undefined : "true"}>{node.claim}</div>
              </div>
              <div className="compareCell">
                <div className="compareCellHead">
                  <ModelMetaLine modelId={current.model_id} className="compareTag metaLine" catalog={miscCatalog} composeCatalog={composeCatalog} />
                </div>
                <div className="compareClaim muted" data-ai-generated="true">{current.argument.slice(0, 200)}</div>
              </div>
            </div>
          ) : null}

          <div className="historyList">
            {!token ? (
              <div className="muted">{t(catalog, "debateDrawers.node.unlockHistory")}</div>
            ) : history.length === 0 ? (
              <div className="muted">{t(catalog, "debateDrawers.node.noPreviousGenerations")}</div>
            ) : (
              history.map((item, index) => {
                const selected = index === selectedVersion;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`historyCard${selected ? " selected" : ""}`}
                    onClick={() => {
                      setSelectedVersion(index);
                      setCompareOn(false);
                    }}
                  >
                    <div className="historyCardHead">
                      <ModelMetaLine modelId={item.model_id} className="modelPill metaLine" catalog={miscCatalog} composeCatalog={composeCatalog} />
                      <span className="historyTag">{t(catalog, item.is_active ? "debateDrawers.node.active" : "debateDrawers.node.archived")}</span>
                    </div>
                    <div className="historyCardBody" data-ai-generated="true">{item.argument}</div>
                  </button>
                );
              })
            )}
          </div>

          {scoring || scoringError || feedbackSummary || currentUserFeedback ? (
            <ScoringErrorBoundary catalog={miscCatalog}>
              <NodeScoringDetails
                scoring={scoring}
                scoringError={scoringError}
                feedbackSummary={feedbackSummary}
                currentUserFeedback={currentUserFeedback}
                recommendationTargetButton={recommendationTargetButton}
                catalog={catalog}
                composeCatalog={composeCatalog}
                locale={locale}
              />
            </ScoringErrorBoundary>
          ) : null}
        </div>
      </aside>
    </>
  );
}

/**
 * UI-01 additive: V3 per-node honesty in the drawer's own section language.
 * Every line is a served contract value or a typed absence — no invented
 * numbers, no defaults.
 */
function NodeHonestyDetails({
  v3,
  catalog,
  miscCatalog,
  debateChromeCatalog,
  composeCatalog,
  locale
}: {
  v3: ContractNode;
  catalog: MessageCatalog;
  miscCatalog: MessageCatalog;
  debateChromeCatalog: MessageCatalog;
  composeCatalog: MessageCatalog;
  locale: string;
}) {
  const reviewLabel = v3.review?.outcome === "agree"
    ? t(catalog, "debateDrawers.node.reviewAgreedBy")
    : v3.review?.outcome === "dispute"
      ? t(catalog, "debateDrawers.node.reviewDisputedBy")
      : v3.review?.outcome === "cannot-assess"
        ? t(catalog, "debateDrawers.node.reviewCouldNotAssess")
        : null;
  const rows = v3NodeHonestyRows(v3, composeCatalog, locale);

  return (
    <section aria-label={t(catalog, "debateDrawers.node.honestyAriaLabel")} className="drawerHonesty">
      <div className="drawerFindingText drawerFreshness">
        {t(catalog, "debateDrawers.node.freshness", { state: v3.staleness_state, date: v3.relevant_as_of })}
      </div>

      <div className="drawerReviewLine" data-node-review={v3.review?.outcome ?? "absent"} data-ai-generated={v3.review === null ? undefined : "true"}>
        {reviewLabel === null ? (
          <span className="drawerFindingText">
            {t(catalog, "debateDrawers.node.noCompletedReview")}
          </span>
        ) : (
          <>
            <span
              className={`drawerReviewLabel ${v3.review?.outcome === "agree" ? "agree" : "dispute"}`}
              data-review-label
            >
              {reviewLabel}
            </span>
            <ModelMetaLine
              modelId={v3.review?.reviewer_lineage.model_id ?? null}
              maker={v3.review?.reviewer_lineage.maker ?? null}
              className="modelPill metaLine"
              catalog={miscCatalog}
              composeCatalog={composeCatalog}
            />
          </>
        )}
      </div>
      {v3.review === null ? null : <div className="drawerFindingText" data-ai-generated="true">{v3.review.reasons.join(" ")}</div>}

      <table className="drawerRecordTable" data-drawer-section-table>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} data-drawer-section-row>
              <th scope="row" data-drawer-section-key>{row.key}</th>
              <td data-drawer-section-value title={row.title}
                data-ai-generated={row.key === "BASE SCORE" || row.key === "FINAL STRENGTH" ? "true" : undefined}
              >{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {v3.condition_marks.length > 0 ? (
        <div className="drawerConditionPills">
          {v3.condition_marks.map((mark) => {
            const tone = mark === "UNFALSIFIED-AFTER-ROTATION"
              ? "agree"
              : mark === "UNDER-EXPLORED"
                ? "gold"
                : "dispute";
            return (
              <span key={mark} className={`drawerConditionPill ${tone}`} data-condition-pill data-mark={tone} title={mark}>
                {conditionMarkLabel(mark, debateChromeCatalog)}
              </span>
            );
          })}
        </div>
      ) : null}
      {v3.abstention !== null ? (
        <p style={{ marginTop: 8 }}>
          {t(catalog, "debateDrawers.node.abstention", {
            kind: abstentionKindLabel(v3.abstention.kind, debateChromeCatalog),
            condition: v3.abstention.unlock_condition
          })}
        </p>
      ) : null}
    </section>
  );
}

function ScoringFeedbackControls({
  summary,
  currentVote,
  catalog
}: {
  summary?: NodeFeedbackSummary;
  currentVote?: CurrentUserFeedbackVote["vote"];
  catalog: MessageCatalog;
}) {
  const upLabel = summary
    ? t(catalog, "debateDrawers.node.feedbackUpCount", { count: summary.up })
    : t(catalog, "debateDrawers.node.feedbackUp");
  const downLabel = summary
    ? t(catalog, "debateDrawers.node.feedbackDownCount", { count: summary.down })
    : t(catalog, "debateDrawers.node.feedbackDown");

  return (
    <section
      className="drawerScoringRationale"
      aria-label={t(catalog, "debateDrawers.node.feedbackAriaLabel")}
      data-scoring-feedback="user-feedback"
    >
      <div className="drawerSectionTitle">{t(catalog, "debateDrawers.node.yourFeedback")}</div>
      <p>{t(catalog, "debateDrawers.node.feedbackQuestion")}</p>
      <div
        role="group"
        aria-label={t(catalog, "debateDrawers.node.feedbackAriaLabel")}
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}
      >
        <button
          type="button"
          className="nodeCtrl"
          aria-pressed={currentVote === "up"}
          disabled
          aria-disabled="true"
          title={t(catalog, "debateDrawers.node.scoringFeedbackUnavailable")}
        >
          {upLabel}
        </button>
        <button
          type="button"
          className="nodeCtrl"
          aria-pressed={currentVote === "down"}
          disabled
          aria-disabled="true"
          title={t(catalog, "debateDrawers.node.scoringFeedbackUnavailable")}
        >
          {downLabel}
        </button>
      </div>
      <div className="drawerHintMuted">{t(catalog, "debateDrawers.node.scoringFeedbackUnavailable")}</div>
      {currentVote ? (
        <div className="drawerHintMuted" role="status">
          {t(catalog, "debateDrawers.node.previousFeedback", {
            feedback: t(catalog, currentVote === "up"
              ? "debateDrawers.node.useful"
              : "debateDrawers.node.notUseful")
          })}
        </div>
      ) : null}
    </section>
  );
}

function NodeScoringDetails({
  scoring,
  scoringError,
  feedbackSummary,
  currentUserFeedback,
  recommendationTargetButton,
  catalog,
  composeCatalog,
  locale
}: {
  scoring?: NodeScoringPayload;
  scoringError?: NodeScoringError;
  feedbackSummary?: NodeFeedbackSummary;
  currentUserFeedback?: CurrentUserFeedbackVote;
  recommendationTargetButton: (
    recommendation: NodeScoringPayload["recommended_investigations"][number]
  ) => ReactNode;
  catalog: MessageCatalog;
  composeCatalog: MessageCatalog;
  locale: string;
}) {
  const rationaleShort = scoring?.rationale?.short?.trim();
  const holes = scoring?.holes.filter((hole) => hole.description.trim()) ?? [];
  const fatalFlags = scoring?.fatal_flags.filter((flag) => flag.description.trim()) ?? [];
  const hasScoringFindings = holes.length > 0 || fatalFlags.length > 0;
  const topRecommendation = selectTopRecommendation(scoring?.recommended_investigations);
  const additionalRecommendations = selectAdditionalRecommendations(scoring?.recommended_investigations);

  function manualInvestigationButton(recommendation: NodeScoringPayload["recommended_investigations"][number]) {
    const manualInvestigationState = manualInvestigationActionState(recommendation.action, { runFlowWired: false }, composeCatalog);
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
        <button
          type="button"
          className="linkBtn"
          disabled={manualInvestigationState.disabled}
          aria-label={manualInvestigationState.label}
        >
          {manualInvestigationState.label}
        </button>
        {manualInvestigationState.status === "unavailable" && manualInvestigationState.reason ? (
          <span className="muted" role="status">
            {manualInvestigationState.reason}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <>
      {scoringError ? (
        <section className="drawerScoringUnavailable" aria-label={t(catalog, "debateDrawers.node.scoringUnavailable")}>
          <div className="drawerSectionTitle">{t(catalog, "debateDrawers.node.scoringUnavailable")}</div>
          <p>{scoringError.reason}</p>
        </section>
      ) : null}

      {rationaleShort ? (
        <section className="drawerScoringRationale" aria-label={t(catalog, "debateDrawers.node.scoringRationale")}>
          <div className="drawerSectionTitle">{t(catalog, "debateDrawers.node.scoringRationale")}</div>
          <p>{rationaleShort}</p>
        </section>
      ) : null}

      <ScoringFeedbackControls
        summary={feedbackSummary}
        currentVote={currentUserFeedback?.vote}
        catalog={catalog}
      />

      {hasScoringFindings ? (
        <section className="drawerScoringFindings" aria-label={t(catalog, "debateDrawers.node.scoringFindingsAria")}>
          <div className="drawerSectionTitle">{t(catalog, "debateDrawers.node.scoringFindings")}</div>
          {fatalFlags.length > 0 ? (
            <div className="drawerFindingGroup">
              <div className="drawerFindingGroupTitle">{t(catalog, "debateDrawers.node.fatalFlags")}</div>
              <ul className="drawerFindingList">
                {fatalFlags.map((flag, index) => (
                  <li key={`${flag.type}-${index}`} className="drawerFindingItem fatal">
                    <div className="drawerFindingMeta">
                      <span>{flag.severity}</span>
                      <span>{flag.type}</span>
                    </div>
                    <div className="drawerFindingText">{flag.description}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {holes.length > 0 ? (
            <div className="drawerFindingGroup">
              <div className="drawerFindingGroupTitle">{t(catalog, "debateDrawers.node.holes")}</div>
              <ul className="drawerFindingList">
                {holes.map((hole, index) => (
                  <li key={`${hole.type}-${index}`} className="drawerFindingItem">
                    <div className="drawerFindingMeta">
                      <span>{hole.severity}</span>
                      <span>{hole.type}</span>
                      {hole.source ? <span>{hole.source}</span> : null}
                    </div>
                    <div className="drawerFindingText">{hole.description}</div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {scoring ? (
        <section className="drawerScoringRecommendation" aria-label={t(catalog, "debateDrawers.node.topRecommendation")}>
          <div className="drawerSectionTitle">{t(catalog, "debateDrawers.node.topRecommendation")}</div>
          {topRecommendation ? (
            <>
              <div className="drawerFindingMeta">
                <span>{formatRecommendationAction(topRecommendation.action, composeCatalog)}</span>
                <span>{t(catalog, "debateDrawers.recommendations.priority", { priority: topRecommendation.priority })}</span>
                {recommendationTargetButton(topRecommendation)}
                {manualInvestigationButton(topRecommendation)}
              </div>
              <p>{topRecommendation.reason}</p>
              {additionalRecommendations.length > 0 ? (
                <details>
                  <summary className="linkBtn">
                    {tPlural(catalog, "debateDrawers.recommendations.more", additionalRecommendations.length, locale)}
                  </summary>
                  <ul className="drawerFindingList">
                    {additionalRecommendations.map((recommendation, index) => (
                      <li
                        key={`${recommendation.action}-${recommendation.priority}-${index}`}
                        className="drawerFindingItem"
                      >
                        <div className="drawerFindingMeta">
                          <span>{formatRecommendationAction(recommendation.action, composeCatalog)}</span>
                          <span>{t(catalog, "debateDrawers.recommendations.priority", { priority: recommendation.priority })}</span>
                          {recommendationTargetButton(recommendation)}
                          {manualInvestigationButton(recommendation)}
                        </div>
                        <div className="drawerFindingText">{recommendation.reason}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </>
          ) : (
            <p>{t(catalog, "debateDrawers.node.noScoringRecommendation")}</p>
          )}
        </section>
      ) : null}
    </>
  );
}
