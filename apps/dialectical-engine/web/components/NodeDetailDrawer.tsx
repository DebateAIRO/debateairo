"use client";

import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { nodeGenerations, regenerateNode } from "@/lib/api";
import type {
  CurrentUserFeedbackVote,
  DebateNode,
  Generation,
  LifecycleDecision,
  NodeFeedbackSummary,
  NodeScoringError,
  NodeScoringPayload,
  ScoringFeedbackVote
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

function looksAuthRelated(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("401") || lower.includes("403") || lower.includes("invalid user token");
}

function isSetAsidePath(node: DebateNode): boolean {
  const pathStatus = node.path_status?.trim().toLowerCase();
  const stoppingStatus = node.stopping_status?.trim().toLowerCase();
  return (
    pathStatus === "abandoned" ||
    stoppingStatus === "abandon" ||
    stoppingStatus === "abandoned"
  );
}

const DECISION_KIND_LABELS: Record<string, string> = {
  continue: "continue",
  deepen: "deepen this path",
  seek_evidence: "seek evidence",
  challenge: "challenge",
  abandon: "abandon",
  reopen: "reopen"
};

function decisionKindLabel(decision: string): string {
  return DECISION_KIND_LABELS[decision] ?? decision;
}

/**
 * W5a: honest causality phrasing for a node's latest lifecycle decision.
 * childSpawnCount > 0 is the ground truth for "this decision caused growth"
 * (see coordinator serialization.py's _decision_outcome) -- only then may the
 * copy say the expansion HAPPENED BECAUSE of the decision. Every other
 * decision (annotate-only, scalar-grounded, budget/capacity refused) steered
 * nothing, so the copy stays in "noted" register, never implying causation.
 */
function pathDecisionCopy(decision: LifecycleDecision): string {
  const reason = decision.reason?.trim();
  const kind = decisionKindLabel(decision.decision);
  if (decision.childSpawnCount > 0) {
    return reason
      ? `This path expanded because ${reason} (decision: ${kind}).`
      : `This path expanded because of a ${kind} decision.`;
  }
  return reason
    ? `Noted (decision: ${kind}): ${reason}. This did not change the tree.`
    : `Noted: a ${kind} decision was recorded. This did not change the tree.`;
}

export function NodeDetailDrawer({
  node,
  scoring,
  scoringError,
  feedbackSummary,
  currentUserFeedback,
  feedbackSubmitState,
  lifecycleDecision,
  token,
  onClose,
  onChallenge,
  onSubmitFeedback,
  onFocusRecommendationNode,
  canFocusRecommendationNode,
  onQueued,
  onError,
  onAuthRejected
}: {
  node: DebateNode;
  scoring?: NodeScoringPayload;
  scoringError?: NodeScoringError;
  feedbackSummary?: NodeFeedbackSummary;
  currentUserFeedback?: CurrentUserFeedbackVote;
  feedbackSubmitState?: { status: "idle" | "submitting" | "error"; error: string | null };
  lifecycleDecision?: LifecycleDecision;
  token: string | null;
  onClose: () => void;
  onChallenge: (anchor: HTMLElement, text: string) => void;
  onSubmitFeedback: (vote: ScoringFeedbackVote) => void;
  onFocusRecommendationNode: (targetClaimId: string) => boolean;
  canFocusRecommendationNode: (targetClaimId: string) => boolean;
  onQueued: () => void;
  onError: (message: string) => void;
  onAuthRejected: () => void;
}) {
  const role = roleOf(node);
  const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
  const generation = node.active_generation;
  const isAbandoned = isAbandonedArgumentStatus(node.status);
  const stoppingReason = (node.stopping_reason_human ?? node.stopping_reason)?.trim();

  const [history, setHistory] = useState<Generation[]>([]);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [compareOn, setCompareOn] = useState(false);
  const [busy, setBusy] = useState(false);
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

  async function regenerate(modelId?: string) {
    if (!token || busy) return;
    setBusy(true);
    try {
      await regenerateNode(node.id, token, modelId);
      onQueued();
      onClose();
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : "Unable to regenerate";
      onError(message);
      if (looksAuthRelated(message)) onAuthRejected();
    } finally {
      setBusy(false);
    }
  }

  function selectProse(event: MouseEvent) {
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
          aria-label={canFocusTarget ? "Open recommended target claim" : "Recommended target claim unavailable"}
          onClick={() => {
            if (!targetClaimId || !canFocusTarget) return;
            if (onFocusRecommendationNode(targetClaimId) === false) {
              setFocusFailedTargetNodeId(targetClaimId);
            } else {
              setFocusFailedTargetNodeId(null);
            }
          }}
        >
          {canFocusTarget ? "Open target" : "Target unavailable"}
        </button>
        {targetClaimId && !canFocusTarget ? (
          <span className="muted" role="status">
            This recommendation references a claim that is not visible in the current debate tree.
          </span>
        ) : null}
        {targetClaimId && focusFailedTargetNodeId === targetClaimId ? (
          <span className="muted" role="status">
            Unable to focus that recommendation target because it is no longer visible.
          </span>
        ) : null}
      </span>
    );
  }

  const current = history[selectedVersion];

  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label="Argument detail">
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <span className="roleBadge" style={{ color: pal.text, background: pal.bg, borderColor: pal.border }}>
              {pal.arrow} {roleLabel(node)}
            </span>
            {generation ? <ModelMetaLine modelId={generation.model_id} /> : null}
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawerBody">
          <div className="nodeEyebrow">Argument</div>
          {isAbandoned || isSetAsidePath(node) ? (
            <div className="drawerAbandonedBanner" role="status">
              <div className="drawerSectionTitle">Stopped path</div>
              <p>This investigation path was paused or abandoned. It is preserved here for reference — abandoned paths are never deleted. You can resume investigation by regenerating this argument.</p>
              {isSetAsidePath(node) && stoppingReason ? (
                <p>set aside because: {stoppingReason}</p>
              ) : null}
            </div>
          ) : null}
          {lifecycleDecision ? (
            <div className="drawerPathDecision" role="status">
              <div className="drawerSectionTitle">Path decision</div>
              <p>{pathDecisionCopy(lifecycleDecision)}</p>
            </div>
          ) : null}
          <div className="drawerClaim">{node.claim}</div>
          {generation?.argument ? (
            <div className="drawerProse" onMouseUp={selectProse}>
              {generation.argument}
            </div>
          ) : (
            <div className="muted" style={{ marginTop: 12 }}>
              No argument text yet.
            </div>
          )}
          {generation?.argument ? (
            <div className="drawerSelectHint">▲ Select any sentence above to challenge it.</div>
          ) : null}

          <ScoringErrorBoundary>
            <NodeScoringDetails
              scoring={scoring}
              scoringError={scoringError}
              feedbackSummary={feedbackSummary}
              currentUserFeedback={currentUserFeedback}
              feedbackSubmitState={feedbackSubmitState}
              token={token}
              onSubmitFeedback={onSubmitFeedback}
              recommendationTargetButton={recommendationTargetButton}
            />
          </ScoringErrorBoundary>

          <div className="drawerActions">
            <button
              type="button"
              className="btn btnChallenge"
              onClick={(event) => onChallenge(event.currentTarget, "")}
            >
              ⚐ Challenge
            </button>
            <button type="button" className="btn" disabled={!token || busy} onClick={() => regenerate()}>
              ↻ Regenerate
            </button>
          </div>
          {!token ? <div className="drawerHintMuted">Unlock actions to regenerate or challenge.</div> : null}

          <div className="drawerDivider" />

          <div className="drawerHistoryHead">
            <span>Generation history</span>
            {history.length > 1 ? (
              <button type="button" className="linkBtn" onClick={() => setCompareOn((value) => !value)}>
                {compareOn ? "Hide compare" : "Compare versions"}
              </button>
            ) : null}
          </div>

          {compareOn && current ? (
            <div className="compareRow">
              <div className="compareCell current">
                <div className="compareCellHead">
                  <span className="compareTag">Current</span>
                  {generation ? <ModelMetaLine modelId={generation.model_id} /> : null}
                </div>
                <div className="compareClaim">{node.claim}</div>
              </div>
              <div className="compareCell">
                <div className="compareCellHead">
                  <ModelMetaLine modelId={current.model_id} className="compareTag metaLine" />
                </div>
                <div className="compareClaim muted">{current.argument.slice(0, 200)}</div>
              </div>
            </div>
          ) : null}

          <div className="historyList">
            {!token ? (
              <div className="muted">Unlock actions to view generation history.</div>
            ) : history.length === 0 ? (
              <div className="muted">No previous generations.</div>
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
                      <ModelMetaLine modelId={item.model_id} />
                      <span className="historyTag">{item.is_active ? "active" : "archived"}</span>
                    </div>
                    <div className="historyCardBody">{item.argument}</div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </aside>
    </>
  );
}

function ScoringFeedbackControls({
  summary,
  currentVote,
  submitState,
  token,
  onSubmit
}: {
  summary?: NodeFeedbackSummary;
  currentVote?: ScoringFeedbackVote;
  submitState: { status: "idle" | "submitting" | "error"; error: string | null };
  token: string | null;
  onSubmit: (vote: ScoringFeedbackVote) => void;
}) {
  const busy = submitState.status === "submitting";
  const upCount = summary?.up ?? 0;
  const downCount = summary?.down ?? 0;
  const locked = !token;

  return (
    <section
      className="drawerScoringRationale"
      aria-label="User feedback on scoring usefulness"
      data-scoring-feedback="user-feedback"
    >
      <div className="drawerSectionTitle">Your feedback</div>
      <p>Was this scoring explanation useful for reviewing the claim?</p>
      <div
        role="group"
        aria-label="User feedback on scoring usefulness"
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}
      >
        <button
          type="button"
          className="nodeCtrl"
          aria-pressed={currentVote === "up"}
          disabled={locked || busy}
          onClick={() => onSubmit("up")}
        >
          UP {upCount}
        </button>
        <button
          type="button"
          className="nodeCtrl"
          aria-pressed={currentVote === "down"}
          disabled={locked || busy}
          onClick={() => onSubmit("down")}
        >
          DOWN {downCount}
        </button>
      </div>
      {locked ? (
        <div className="drawerHintMuted">Unlock actions to save feedback.</div>
      ) : busy ? (
        <div className="drawerHintMuted" role="status">
          Saving feedback...
        </div>
      ) : submitState.status === "error" && submitState.error ? (
        <div className="drawerHintMuted" role="alert">
          Feedback was not saved: {submitState.error}
        </div>
      ) : currentVote ? (
        <div className="drawerHintMuted" role="status">
          Current user feedback: {currentVote === "up" ? "useful" : "not useful"}.
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
  feedbackSubmitState = { status: "idle", error: null },
  token,
  onSubmitFeedback,
  recommendationTargetButton
}: {
  scoring?: NodeScoringPayload;
  scoringError?: NodeScoringError;
  feedbackSummary?: NodeFeedbackSummary;
  currentUserFeedback?: CurrentUserFeedbackVote;
  feedbackSubmitState?: { status: "idle" | "submitting" | "error"; error: string | null };
  token: string | null;
  onSubmitFeedback: (vote: ScoringFeedbackVote) => void;
  recommendationTargetButton: (
    recommendation: NodeScoringPayload["recommended_investigations"][number]
  ) => ReactNode;
}) {
  const rationaleShort = scoring?.rationale?.short?.trim();
  const holes = scoring?.holes.filter((hole) => hole.description.trim()) ?? [];
  const fatalFlags = scoring?.fatal_flags.filter((flag) => flag.description.trim()) ?? [];
  const hasScoringFindings = holes.length > 0 || fatalFlags.length > 0;
  const topRecommendation = selectTopRecommendation(scoring?.recommended_investigations);
  const additionalRecommendations = selectAdditionalRecommendations(scoring?.recommended_investigations);

  function manualInvestigationButton(recommendation: NodeScoringPayload["recommended_investigations"][number]) {
    const manualInvestigationState = manualInvestigationActionState(recommendation.action, { runFlowWired: false });
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
        <section className="drawerScoringUnavailable" aria-label="Scoring unavailable">
          <div className="drawerSectionTitle">Scoring unavailable</div>
          <p>{scoringError.reason}</p>
        </section>
      ) : null}

      {rationaleShort ? (
        <section className="drawerScoringRationale" aria-label="Scoring rationale">
          <div className="drawerSectionTitle">Scoring rationale</div>
          <p>{rationaleShort}</p>
        </section>
      ) : null}

      {scoring ? (
        <ScoringFeedbackControls
          summary={feedbackSummary}
          currentVote={currentUserFeedback?.vote}
          submitState={feedbackSubmitState}
          token={token}
          onSubmit={onSubmitFeedback}
        />
      ) : null}

      {hasScoringFindings ? (
        <section className="drawerScoringFindings" aria-label="Scoring holes and fatal flags">
          <div className="drawerSectionTitle">Holes and fatal flags</div>
          {fatalFlags.length > 0 ? (
            <div className="drawerFindingGroup">
              <div className="drawerFindingGroupTitle">Fatal flags</div>
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
              <div className="drawerFindingGroupTitle">Holes</div>
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
        <section className="drawerScoringRecommendation" aria-label="Top recommendation">
          <div className="drawerSectionTitle">Top recommendation</div>
          {topRecommendation ? (
            <>
              <div className="drawerFindingMeta">
                <span>{formatRecommendationAction(topRecommendation.action)}</span>
                <span>priority {topRecommendation.priority}</span>
                {recommendationTargetButton(topRecommendation)}
                {manualInvestigationButton(topRecommendation)}
              </div>
              <p>{topRecommendation.reason}</p>
              {additionalRecommendations.length > 0 ? (
                <details>
                  <summary className="linkBtn">
                    {additionalRecommendations.length} more recommendation
                    {additionalRecommendations.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="drawerFindingList">
                    {additionalRecommendations.map((recommendation, index) => (
                      <li
                        key={`${recommendation.action}-${recommendation.priority}-${index}`}
                        className="drawerFindingItem"
                      >
                        <div className="drawerFindingMeta">
                          <span>{formatRecommendationAction(recommendation.action)}</span>
                          <span>priority {recommendation.priority}</span>
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
            <p>No scoring recommendation is available for this argument.</p>
          )}
        </section>
      ) : null}
    </>
  );
}
