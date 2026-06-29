"use client";

import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { nodeGenerations, regenerateNode } from "@/lib/api";
import type { DebateNode, Generation, NodeScoringError, NodeScoringPayload } from "@/lib/types";
import { ROLE_PALETTES, roleLabel, roleOf } from "@/lib/debatePresentation";
import { modelMeta } from "@/lib/models";
import {
  formatRecommendationAction,
  manualInvestigationActionState,
  recommendationTargetNodeId,
  selectAdditionalRecommendations,
  selectTopRecommendation
} from "@/lib/recommendation";
import { ScoringErrorBoundary } from "@/components/ScoringErrorBoundary";

function looksAuthRelated(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("401") || lower.includes("403") || lower.includes("invalid user token");
}

export function NodeDetailDrawer({
  node,
  scoring,
  scoringError,
  token,
  onClose,
  onChallenge,
  onFocusRecommendationNode,
  canFocusRecommendationNode,
  onQueued,
  onError,
  onAuthRejected
}: {
  node: DebateNode;
  scoring?: NodeScoringPayload;
  scoringError?: NodeScoringError;
  token: string | null;
  onClose: () => void;
  onChallenge: (anchor: HTMLElement, text: string) => void;
  onFocusRecommendationNode: (targetNodeId: string) => boolean;
  canFocusRecommendationNode: (targetNodeId: string) => boolean;
  onQueued: () => void;
  onError: (message: string) => void;
  onAuthRejected: () => void;
}) {
  const role = roleOf(node);
  const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
  const generation = node.active_generation;
  const model = generation ? modelMeta(generation.model_id) : null;
  const isAbandoned = ["abandoned", "stale", "paused", "stopped"].includes((node.status || "").toLowerCase());

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
    const targetNodeId = recommendationTargetNodeId(recommendation);
    const canFocusTarget = Boolean(targetNodeId && canFocusRecommendationNode(targetNodeId));
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
        <button
          type="button"
          className="linkBtn"
          disabled={!targetNodeId || !canFocusTarget}
          aria-label={canFocusTarget ? "Open recommended target node" : "Recommended target node unavailable"}
          onClick={() => {
            if (!targetNodeId || !canFocusTarget) return;
            if (onFocusRecommendationNode(targetNodeId) === false) {
              setFocusFailedTargetNodeId(targetNodeId);
            } else {
              setFocusFailedTargetNodeId(null);
            }
          }}
        >
          {canFocusTarget ? "Open target" : "Target unavailable"}
        </button>
        {targetNodeId && !canFocusTarget ? (
          <span className="muted" role="status">
            This recommendation references a node that is not visible in the current debate tree.
          </span>
        ) : null}
        {targetNodeId && focusFailedTargetNodeId === targetNodeId ? (
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
            {model ? (
              <span className="metaLine">
                <span className="modelDot" style={{ ["--dot" as string]: model.dot }} />
                {model.name}
              </span>
            ) : null}
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="drawerBody">
          <div className="nodeEyebrow">Argument</div>
          {isAbandoned ? (
            <div className="drawerAbandonedBanner" role="status">
              <div className="drawerSectionTitle">Stopped path</div>
              <p>This investigation path was paused or abandoned. It is preserved here for reference — abandoned paths are never deleted. You can resume investigation by regenerating this argument.</p>
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
                  {model ? (
                    <span className="metaLine">
                      <span className="modelDot" style={{ ["--dot" as string]: model.dot }} />
                      {model.name}
                    </span>
                  ) : null}
                </div>
                <div className="compareClaim">{node.claim}</div>
              </div>
              <div className="compareCell">
                <div className="compareCellHead">
                  <span className="compareTag">{modelMeta(current.model_id).name}</span>
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
                const itemModel = modelMeta(item.model_id);
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
                      <span className="metaLine">
                        <span className="modelDot" style={{ ["--dot" as string]: itemModel.dot }} />
                        {itemModel.name}
                      </span>
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

function NodeScoringDetails({
  scoring,
  scoringError,
  recommendationTargetButton
}: {
  scoring?: NodeScoringPayload;
  scoringError?: NodeScoringError;
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
