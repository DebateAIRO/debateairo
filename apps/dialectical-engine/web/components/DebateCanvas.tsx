"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import type { DebateNode, NodeScoringError, NodeScoringPayload } from "@/lib/types";
import {
  CARD_W,
  ROLE_PALETTES,
  estimateHeight,
  layoutTree,
  renderStateOf,
  roleLabel,
  roleOf,
  type PlacedNode
} from "@/lib/debatePresentation";
import { modelMeta } from "@/lib/models";
import { SCRUTINY_STATUS } from "@/lib/scrutiny";
import { formatScoreBadgeLabel, formatScorePercent } from "@/lib/scoringFormat";
import { ScoringErrorBoundary } from "@/components/ScoringErrorBoundary";

export type CanvasCallbacks = {
  onOpenNode: (nodeId: string) => void;
  onChallengeNode: (node: DebateNode, anchor: HTMLElement) => void;
  onRegenNode?: (node: DebateNode, anchor: HTMLElement) => void;
  onToggleExpand: (nodeId: string) => void;
  onProseSelect?: (node: DebateNode, event: MouseEvent) => void;
};

type DebateCanvasProps = CanvasCallbacks & {
  root: DebateNode;
  expanded: Set<string>;
  selectedNodeId: string | null;
  scrutiny?: Record<string, string>;
  scoringByNodeId?: Map<string, NodeScoringPayload>;
  scoringErrorsByNodeId?: Map<string, NodeScoringError>;
  scoreFilterNodeIds?: Set<string> | null;
  meta: { nodes: number; depth: number; decomposer?: string };
  canvasRef?: (el: HTMLDivElement | null) => void;
};

export function DebateCanvas({
  root,
  expanded,
  selectedNodeId,
  scrutiny = {},
  scoringByNodeId,
  scoringErrorsByNodeId,
  scoreFilterNodeIds,
  meta,
  onOpenNode,
  onChallengeNode,
  onRegenNode,
  onToggleExpand,
  onProseSelect,
  canvasRef
}: DebateCanvasProps) {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const heightOf = useCallback(
    (node: DebateNode) =>
      heights[node.id] ?? estimateHeight(node, renderStateOf(node), expanded.has(node.id)),
    [heights, expanded]
  );

  const layout = layoutTree(root, heightOf);

  // Measure rendered cards and re-layout when their real heights differ.
  useLayoutEffect(() => {
    let changed = false;
    const next: Record<string, number> = { ...heights };
    for (const placed of layout.placed) {
      const el = cardRefs.current[placed.id];
      if (!el) continue;
      const measured = Math.round(el.offsetHeight);
      if (measured > 0 && next[placed.id] !== measured) {
        next[placed.id] = measured;
        changed = true;
      }
    }
    if (changed) setHeights(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // Drop stale measurements when nodes disappear.
  useEffect(() => {
    const ids = new Set(layout.placed.map((p) => p.id));
    setHeights((current) => {
      const filtered = Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id)));
      return Object.keys(filtered).length === Object.keys(current).length ? current : filtered;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  return (
    <div className="canvas scroll" ref={canvasRef}>
      <div className="canvasInner" style={{ width: layout.width, height: layout.height }}>
        <svg className="canvasLinks" width={layout.width} height={layout.height} aria-hidden>
          {layout.connectors.map((c) => (
            <path
              key={c.id}
              d={c.d}
              fill="none"
              stroke={c.color}
              strokeWidth={c.width}
              strokeDasharray={c.dash}
              opacity={c.opacity}
            />
          ))}
        </svg>
        {layout.placed.map((placed) => (
          <CanvasCard
            key={placed.id}
            placed={placed}
            expanded={expanded.has(placed.id)}
            selected={selectedNodeId === placed.id}
            scrutinyStatus={scrutiny[placed.id]}
            scoring={scoringByNodeId?.get(placed.id)}
            scoringError={scoringErrorsByNodeId?.get(placed.id)}
            scoreFilterMatch={!scoreFilterNodeIds || scoreFilterNodeIds.has(placed.id)}
            meta={meta}
            registerRef={(el) => {
              cardRefs.current[placed.id] = el;
            }}
            onOpenNode={onOpenNode}
            onChallengeNode={onChallengeNode}
            onRegenNode={onRegenNode}
            onToggleExpand={onToggleExpand}
            onProseSelect={onProseSelect}
          />
        ))}
      </div>
    </div>
  );
}

type CanvasCardProps = CanvasCallbacks & {
  placed: PlacedNode;
  expanded: boolean;
  selected: boolean;
  scrutinyStatus?: string;
  scoring?: NodeScoringPayload;
  scoringError?: NodeScoringError;
  scoreFilterMatch: boolean;
  meta: { nodes: number; depth: number; decomposer?: string };
  registerRef: (el: HTMLDivElement | null) => void;
};

function CanvasCard({
  placed,
  expanded,
  selected,
  scrutinyStatus,
  scoring,
  scoringError,
  scoreFilterMatch,
  meta,
  registerRef,
  onOpenNode,
  onChallengeNode,
  onRegenNode,
  onToggleExpand,
  onProseSelect
}: CanvasCardProps) {
  const { node, state, role } = placed;
  const pal = role === "root" ? null : ROLE_PALETTES[role];
  const generation = node.active_generation;
  const model = generation ? modelMeta(generation.model_id) : null;
  const scrutiny = scrutinyStatus ? SCRUTINY_STATUS[scrutinyStatus] : null;

  const cardStyle: CSSProperties = {
    left: placed.x,
    top: placed.y,
    width: CARD_W,
    opacity: scoreFilterMatch ? 1 : 0.38
  };

  const innerStyle: CSSProperties = scrutiny
    ? {
        background: "var(--surface)",
        borderColor: scrutiny.color,
        boxShadow: `0 0 0 4px ${scrutiny.bg}, 0 4px 16px -8px oklch(0.5 0.08 70 / 0.3)`
      }
    : role === "root"
      ? {
          background: "var(--surface)",
          borderColor: "oklch(0.8 0.012 70)",
          boxShadow: "var(--shadow-card)"
        }
      : state === "empty"
        ? {
            background: "var(--surface-sunken)",
            borderColor: "var(--line-2)"
          }
        : {
            background: "var(--surface)",
            borderColor: pal?.border
          };

  function openIfDone() {
    if (state === "done") onOpenNode(node.id);
  }

  return (
    <div className="nodeWrap" style={cardStyle}>
      <div
        ref={registerRef}
        className={`node${selected ? " selected" : ""}${scoreFilterMatch ? "" : " scoreFilteredOut"}`}
        style={innerStyle}
        data-score-filter-match={scoreFilterMatch ? "true" : "false"}
        role={state === "done" ? "button" : undefined}
        tabIndex={state === "done" ? 0 : undefined}
        onClick={openIfDone}
        onKeyDown={(event) => {
          if (state === "done" && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openIfDone();
          }
        }}
      >
        {scrutiny ? (
          <span className="scrutinyBadge" style={{ borderColor: scrutiny.color }}>
            <span className="scrutinyDot" style={{ background: scrutiny.color }} />
            <span style={{ color: scrutiny.color }}>{scrutiny.label}</span>
          </span>
        ) : null}

        {role === "root" ? (
          <>
            <div className="nodeEyebrow">Root claim</div>
            <div className="nodeClaim root">{node.claim}</div>
            <div className="nodeRootMeta">
              <span>{meta.nodes} nodes</span>
              <span className="sep">/</span>
              <span>depth {meta.depth}</span>
              {meta.decomposer ? (
                <>
                  <span className="sep">/</span>
                  <span>decomposed by {meta.decomposer}</span>
                </>
              ) : null}
            </div>
          </>
        ) : state === "empty" ? (
          <div className="nodeEmpty">
            <span className="nodeEmptyMark" aria-hidden>
              ∅
            </span>
            <div>
              <div className="nodeEmptyText">No strong argument found.</div>
              {model ? (
                <div className="metaLine" style={{ marginTop: 5 }}>
                  <span className="modelDot" style={{ ["--dot" as string]: model.dot }} />
                  {model.name} conceded
                </div>
              ) : null}
            </div>
          </div>
        ) : (
          <>
            <div className="nodeHeader">
              <span className="roleBadge" style={{ color: pal?.text, background: pal?.bg, borderColor: pal?.border }}>
                {pal?.arrow} {roleLabel(node)}
              </span>
              {model ? (
                <span className="metaLine">
                  <span className="modelDot" style={{ ["--dot" as string]: model.dot }} />
                  {model.name}
                </span>
              ) : null}
              <ScoringErrorBoundary>
                {scoring ? (
                  <ScoreBadges node={node} scoring={scoring} openIfDone={openIfDone} />
                ) : scoringError ? (
                  <span className="scoreBadge unavailable" aria-label={`Scoring unavailable: ${scoringError.reason}`}>
                    SCORING N/A
                  </span>
                ) : null}
              </ScoringErrorBoundary>
            </div>

            {state === "pending" ? (
              <div className="nodePending">
                <div className="skel" style={{ height: 13, borderRadius: 4, width: "92%", marginBottom: 7 }} />
                <div className="skel" style={{ height: 13, borderRadius: 4, width: "64%" }} />
              </div>
            ) : state === "streaming" ? (
              <div className="nodeClaim streaming">
                {generation?.argument || node.claim}
                <span className="streamCursor" style={{ background: pal?.text }} />
              </div>
            ) : (
              <>
                <div className="nodeClaim">{node.claim}</div>
                {expanded && generation?.argument ? (
                  <div
                    className="nodeProse scroll"
                    onMouseUp={(event) => onProseSelect?.(node, event)}
                  >
                    {generation.argument}
                  </div>
                ) : null}
                <div className="nodeControls">
                  <button
                    type="button"
                    className="nodeCtrl challenge"
                    onClick={(event) => {
                      event.stopPropagation();
                      onChallengeNode(node, event.currentTarget);
                    }}
                  >
                    ⚐ Challenge
                  </button>
                  {onRegenNode ? (
                    <button
                      type="button"
                      className="nodeCtrl"
                      onClick={(event) => {
                        event.stopPropagation();
                        onRegenNode(node, event.currentTarget);
                      }}
                    >
                      ↻ Regenerate
                    </button>
                  ) : null}
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="nodeCtrl"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleExpand(node.id);
                    }}
                  >
                    {expanded ? "Collapse" : "Read"} <span style={{ fontSize: 9 }}>{expanded ? "▲" : "▼"}</span>
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ScoreBadges({
  node,
  scoring,
  openIfDone
}: {
  node: DebateNode;
  scoring: NodeScoringPayload;
  openIfDone: () => void;
}) {
  const strength = formatScorePercent(scoring.scores.strength);
  const uncertainty = formatScorePercent(scoring.scores.uncertainty);
  const impact = formatScorePercent(scoring.scores.impact);
  const issueSummary = summarizeCardScoringIssues(scoring);

  return (
    <button
      type="button"
      className="scoreBadgeButton"
      aria-label={`Open scoring explanation for ${node.claim}`}
      onClick={(event) => {
        event.stopPropagation();
        openIfDone();
      }}
    >
      <span className="scoreBadge strength" aria-label={formatScoreBadgeLabel("Strength", scoring.labels.strength_label, strength)}>
        STR {strength.value}
      </span>
      <span className="scoreBadge uncertainty" aria-label={formatScoreBadgeLabel("Uncertainty", scoring.labels.uncertainty_label, uncertainty)}>
        UNC {uncertainty.value}
      </span>
      <span className="scoreBadge impact" aria-label={formatScoreBadgeLabel("Impact", scoring.labels.impact_label, impact)}>
        IMP {impact.value}
      </span>
      {issueSummary ? (
        <span className="scoreBadge issue" aria-label={issueSummary.ariaLabel}>
          {issueSummary.label}
        </span>
      ) : null}
    </button>
  );
}

function summarizeCardScoringIssues(scoring: NodeScoringPayload) {
  const highPriorityHoles = scoring.holes.filter(
    (hole) => hole.severity === "high" && hole.description.trim()
  );
  const fatalFlags = scoring.fatal_flags.filter((flag) => flag.description.trim());
  const issueCount = highPriorityHoles.length + fatalFlags.length;

  if (issueCount === 0) return null;

  const label =
    fatalFlags.length > 0 && highPriorityHoles.length > 0
      ? `ISS ${issueCount}`
      : fatalFlags.length > 0
        ? `FLAG ${fatalFlags.length}`
        : `HOLE ${highPriorityHoles.length}`;
  const parts = [
    fatalFlags.length > 0
      ? `${fatalFlags.length} fatal ${fatalFlags.length === 1 ? "flag" : "flags"}`
      : null,
    highPriorityHoles.length > 0
      ? `${highPriorityHoles.length} high-priority ${highPriorityHoles.length === 1 ? "hole" : "holes"}`
      : null
  ].filter(Boolean);

  return {
    label,
    ariaLabel: `Scoring issues: ${parts.join(" and ")}`
  };
}
