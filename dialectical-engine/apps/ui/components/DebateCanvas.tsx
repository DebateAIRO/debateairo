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
  type PlacedClaim
} from "@/lib/debatePresentation";
import { ModelMetaLine } from "@/components/ModelPresentation";
import { scrutinyStatus as scrutinyStatuses } from "@/lib/scrutiny";
import {
  formatIndependencePill,
  formatScoreBadgeLabel,
  formatScorePercent,
  formatStrengthPill,
  formatUncertaintyPill
} from "@/lib/scoringFormat";
import { isLowStrengthNode } from "@/lib/debateTreeUtils";
import { CanvasViewport } from "@/components/CanvasViewport";
import { ScoringErrorBoundary } from "@/components/ScoringErrorBoundary";
import type { Node as ContractNode } from "@debateai/contract";
import { v3NodeScoreState, v3ScorePresentation, type V3ScorePresentation } from "@/lib/v3/adapter";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import miscEnglish from "@/messages/en/misc.json";
import debateChromeEnglish from "@/messages/en/debateChrome.json";
import composeEnglish from "@/messages/en/compose.json";

// Verdict-first UI (Phase 9): low-strength node dimming is additive and
// gated behind NEXT_PUBLIC_VERDICT_FIRST_UI -- flag off must leave rendering
// byte-identical to pre-Task-4 behavior. See debateTreeUtils.isLowStrengthNode
// for the honesty contract (missing score is never treated as low strength).
const VERDICT_FIRST_UI_ENABLED = process.env.NEXT_PUBLIC_VERDICT_FIRST_UI === "true";

function localizedRoleLabel(node: DebateNode, catalog: MessageCatalog, debateChromeCatalog: MessageCatalog): string {
  const role = roleOf(node);
  if (role === "root") return t(catalog, "debateViews.rootClaim");
  if (role === "pro") return t(catalog, "debateViews.pro");
  if (role === "con") return t(catalog, "debateViews.con");
  return roleLabel(node, debateChromeCatalog);
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

function withoutSetAsidePaths(node: DebateNode): DebateNode {
  const children = node.children
    .filter((child) => !isSetAsidePath(child))
    .map(withoutSetAsidePaths);
  return { ...node, children };
}

export type CanvasCallbacks = {
  onOpenNode: (nodeId: string) => void;
  onChallengeNode?: (node: DebateNode, anchor: HTMLElement) => void;
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
  /**
   * UI-02a: the served answer's contract nodes, keyed by node id, so each card
   * can carry V3's own recorded base score and final strength. Three states,
   * all distinct and all honest: `undefined` = the caller supplies no V3 data
   * at all (V2-only callers render exactly as before), `null` = the V3 data
   * path with no served answer yet, a Map = the served graph.
   */
  v3NodesById?: ReadonlyMap<string, ContractNode> | null;
  lowStrengthThreshold?: number;
  meta: { claims: number; depth: number; judged: number; derivedStanding: number; setAside: number; decomposer?: string };
  canvasRef?: (el: HTMLDivElement | null) => void;
  /** The interface locale's `misc` catalogue, for the model identity lines. */
  miscCatalog?: MessageCatalog;
  /** The interface locale's `debateChrome` catalogue: role labels and score pills. */
  debateChromeCatalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: scrutiny status, V3 score copy, model family. */
  composeCatalog?: MessageCatalog;
};

export function DebateCanvas({
  root,
  expanded,
  selectedNodeId,
  scrutiny = {},
  scoringByNodeId,
  scoringErrorsByNodeId,
  scoreFilterNodeIds,
  v3NodesById,
  lowStrengthThreshold,
  meta,
  onOpenNode,
  onChallengeNode,
  onToggleExpand,
  onProseSelect,
  canvasRef,
  miscCatalog = miscEnglish,
  debateChromeCatalog = debateChromeEnglish,
  composeCatalog = composeEnglish
}: DebateCanvasProps) {
  const { catalog, locale } = useChromeI18n();
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [showSetAsidePaths, setShowSetAsidePaths] = useState(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const heightOf = useCallback(
    (node: DebateNode) =>
      heights[node.id] ?? estimateHeight(node, renderStateOf(node), expanded.has(node.id)),
    [heights, expanded]
  );

  const visibleRoot = showSetAsidePaths ? root : withoutSetAsidePaths(root);
  const layout = layoutTree(visibleRoot, heightOf);
  const allCardsMeasured = layout.placed.every((placed) => heights[placed.id] !== undefined);

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

  // Drop stale measurements when claims disappear.
  useEffect(() => {
    const ids = new Set(layout.placed.map((p) => p.id));
    setHeights((current) => {
      const filtered = Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id)));
      return Object.keys(filtered).length === Object.keys(current).length ? current : filtered;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, showSetAsidePaths]);

  return (
    <CanvasViewport
      layoutWidth={layout.width}
      layoutHeight={layout.height}
      initialAnchorTop={allCardsMeasured ? layout.placed[0]?.y ?? null : null}
      canvasRef={canvasRef}
      stickyControl={
        <div className="canvasStickyControl">
          <span>
            {tPlural(catalog, "debateViews.claimCount", meta.claims, locale)} {t(catalog, "debateViews.across")} {tPlural(catalog, "debateViews.levelCount", meta.depth, locale)} · {tPlural(catalog, "debateViews.judgedCount", meta.judged, locale)} · {tPlural(catalog, "debateViews.standingCount", meta.derivedStanding, locale)} · {tPlural(catalog, "debateViews.setAsideCount", meta.setAside, locale)}
          </span>
          <label className="canvasStickyToggle">
            <input
              type="checkbox"
              checked={showSetAsidePaths}
              onChange={(event) => setShowSetAsidePaths(event.currentTarget.checked)}
            />
            {t(catalog, "debateViews.showSetAsidePaths")}
          </label>
        </div>
      }
    >
      <svg className="canvasLinks" width={layout.width} height={layout.height} aria-hidden>
        {layout.connectors.map((c) => (
          <path
            key={c.id}
            data-connector-stance={c.stance}
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
          v3NodesById={v3NodesById}
          lowStrengthThreshold={lowStrengthThreshold}
          meta={meta}
          registerRef={(el) => {
            cardRefs.current[placed.id] = el;
          }}
          onOpenNode={onOpenNode}
          onChallengeNode={onChallengeNode}
          onToggleExpand={onToggleExpand}
          onProseSelect={onProseSelect}
          catalog={catalog}
          miscCatalog={miscCatalog}
          debateChromeCatalog={debateChromeCatalog}
          composeCatalog={composeCatalog}
          locale={locale}
        />
      ))}
    </CanvasViewport>
  );
}

type CanvasCardProps = CanvasCallbacks & {
  placed: PlacedClaim;
  expanded: boolean;
  selected: boolean;
  scrutinyStatus?: string;
  scoring?: NodeScoringPayload;
  scoringError?: NodeScoringError;
  scoreFilterMatch: boolean;
  v3NodesById?: ReadonlyMap<string, ContractNode> | null;
  lowStrengthThreshold?: number;
  meta: { claims: number; depth: number; judged: number; derivedStanding: number; setAside: number; decomposer?: string };
  registerRef: (el: HTMLDivElement | null) => void;
  catalog: MessageCatalog;
  miscCatalog: MessageCatalog;
  debateChromeCatalog: MessageCatalog;
  composeCatalog: MessageCatalog;
  locale: string;
};

function CanvasCard({
  placed,
  expanded,
  selected,
  scrutinyStatus,
  scoring,
  scoringError,
  scoreFilterMatch,
  v3NodesById,
  lowStrengthThreshold,
  meta,
  registerRef,
  onOpenNode,
  onChallengeNode,
  onToggleExpand,
  onProseSelect,
  catalog,
  miscCatalog,
  debateChromeCatalog,
  composeCatalog,
  locale
}: CanvasCardProps) {
  const { node, state, role } = placed;
  const pal = role === "root" ? null : ROLE_PALETTES[role];
  const stance = role === "pov" ? "reasoning" : role;
  let stanceLine: string;
  switch (stance) {
    case "pro":
      stanceLine = "var(--pro-line)";
      break;
    case "con":
      stanceLine = "var(--con-line)";
      break;
    case "reasoning":
      stanceLine = "var(--reasoning-line)";
      break;
    case "root":
      stanceLine = "var(--line-strong)";
      break;
  }
  const generation = node.active_generation;
  const scrutiny = scrutinyStatus ? scrutinyStatuses(composeCatalog)[scrutinyStatus] : null;
  const setAside = isSetAsidePath(node);
  // Task 13 (P1.5): sourcing-breadth chip, derived straight from the node's
  // own EVIDENCE children -- independent of whether scoring has run, so it
  // renders alongside (not inside) the scoring badges below.
  // UI-02a: V3's own recorded numbers for this card. `undefined` keeps V2-only
  // callers byte-identical; anything else renders either both numbers or the
  // typed reason there are none (never 0, never a dash — DR-115).
  const v3Scores =
    v3NodesById === undefined ? null : v3ScorePresentation(v3NodeScoreState(node, v3NodesById), composeCatalog);
  // Evidence sourcing breadth. Null below one distinct source, so a card with
  // no record stays silent rather than printing "sources: 0".
  const independencePill = formatIndependencePill(node.evidence_independence, debateChromeCatalog, locale);

  // Additive, flag-gated low-strength dimming (Phase 9 Task 4). Never replaces
  // the existing abandoned/scoreFilterMatch terms -- a node can be abandoned
  // AND low-strength AND filtered simultaneously, so the new dim is composed
  // via multiplication (rather than min/replace) onto the existing base
  // opacity: it scales whatever the existing rules already produced, so all
  // three states keep contributing and stay distinguishable in combination,
  // and the flag-off value is preserved exactly (multiplying by 1).
  const lowStrength = lowStrengthThreshold === undefined
    ? false
    : isLowStrengthNode(scoring?.scores?.strength, lowStrengthThreshold);
  const lowStrengthDim = VERDICT_FIRST_UI_ENABLED && lowStrength ? 0.7 : 1;

  const cardStyle: CSSProperties = {
    left: placed.x,
    top: placed.y,
    width: CARD_W,
    opacity: (scoreFilterMatch ? (state === "abandoned" ? 0.58 : 1) : 0.38) * lowStrengthDim,
    background: "var(--shell)",
    boxShadow: "var(--shadow-card)",
    boxSizing: "border-box",
    border: "1px solid var(--line-strong)",
    borderRadius: "var(--r-card)",
    padding: 4
  };

  const innerStyle: CSSProperties = scrutiny
    ? {
        background: "var(--core)",
        borderRadius: "var(--r-card)",
        position: "relative",
        borderColor: scrutiny.color,
        boxShadow: `0 0 0 4px ${scrutiny.bg}, var(--shadow-card)`
      }
    : role === "root"
      ? {
          background: "var(--core)",
          borderRadius: "var(--r-card)",
          position: "relative",
          borderColor: "var(--line-2)",
          boxShadow: "var(--shadow-card)"
        }
      : state === "empty" || state === "abandoned" || state === "failed"
        ? {
            background: "var(--surface-sunken)",
            borderRadius: "var(--r-card)",
            position: "relative",
            borderColor: "var(--line-2)"
          }
        : {
            background: "var(--core)",
            borderRadius: "var(--r-card)",
            position: "relative",
            borderColor: pal?.border
          };

  function openIfDone() {
    if (state === "done" || state === "abandoned" || state === "failed") onOpenNode(node.id);
  }

  const openNodeDetails = () => onOpenNode(node.id);

  return (
    <div
      className="nodeWrap"
      ref={registerRef}
      style={cardStyle}
      data-node-id={node.id}
      data-ai-generated={role === "root" ? undefined : "true"}
      data-bezel="shell"
      data-stance={stance}
      data-low-strength={VERDICT_FIRST_UI_ENABLED && lowStrength ? "true" : undefined}
      data-set-aside={setAside ? "true" : undefined}
    >
      <div
        className={`node${selected ? " selected" : ""}${scoreFilterMatch ? "" : " scoreFilteredOut"}`}
        style={innerStyle}
        data-bezel="core"
        data-score-filter-match={scoreFilterMatch ? "true" : "false"}
        onClick={openIfDone}
      >
        <span
          className="nodeStanceTab"
          data-stance={stance}
          aria-hidden="true"
          style={{
            display: "block",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: 3,
            borderRadius: "var(--r-tab)",
            background: stanceLine
          }}
        />
        {scrutiny ? (
          <span className="scrutinyBadge" style={{ borderColor: scrutiny.color }}>
            <span className="scrutinyDot" style={{ background: scrutiny.color }} />
            <span style={{ color: scrutiny.color }}>{scrutiny.label}</span>
          </span>
        ) : null}

        {setAside && state !== "failed" ? (
          <span
            className="roleBadge"
            style={{
              display: "inline-flex",
              marginBottom: 7,
              color: "var(--text-2)",
              background: "var(--surface-sunken)",
              borderColor: "var(--line-2)"
            }}
          >
            {t(catalog, "debateViews.setAside")}
          </span>
        ) : null}

        {role === "root" ? (
          <>
            <div className="nodeEyebrow">{t(catalog, "debateViews.rootClaim")}</div>
            <div className="nodeClaim root">{node.claim}</div>
            <div className="nodeRootMeta">
              <span>{tPlural(catalog, "debateViews.claimCount", meta.claims, locale)}</span>
              <span className="sep">/</span>
              <span>{t(catalog, "debateViews.depthValue", { depth: meta.depth })}</span>
              {meta.decomposer ? (
                <>
                  <span className="sep">/</span>
                  <span>{t(catalog, "debateViews.decomposedBy", { model: meta.decomposer })}</span>
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
              <div className="nodeEmptyText">{t(catalog, "debateViews.noStrongArgument")}</div>
              {generation || node.maker !== undefined ? (
                <div className="metaLine" style={{ marginTop: 5 }}>
                  <ModelMetaLine modelId={generation?.model_id ?? null} maker={node.maker} catalog={miscCatalog} composeCatalog={composeCatalog} />
                  {generation ? ` ${t(catalog, "debateViews.conceded")}` : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : state === "abandoned" ? (
          <div className="nodeAbandoned">
            <span className="nodeAbandonedMark" aria-hidden>⊗</span>
            <div>
              <div className="nodeAbandonedLabel">{t(catalog, "debateViews.stoppedPath")}</div>
              <div className="nodeAbandonedClaim">{node.claim || t(catalog, "debateViews.abandonedArgument")}</div>
            </div>
          </div>
        ) : state === "failed" ? (
          <div className="nodeAbandoned">
            <span className="nodeAbandonedMark" aria-hidden>⚠</span>
            <div>
              <div className="nodeAbandonedLabel">{t(catalog, "debateViews.failedBranch")}</div>
              <div className="nodeAbandonedClaim">{node.claim || t(catalog, "debateViews.generationFailed")}</div>
              <div className="metaLine" style={{ marginTop: 5 }}>
                {t(catalog, "debateViews.generationFailedContinued")}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="nodeArgHeader">
              <span className="roleBadge" style={{ color: pal?.text, background: pal?.bg, borderColor: pal?.border }}>
                {pal?.arrow} {localizedRoleLabel(node, catalog, debateChromeCatalog)}
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
            <div className="nodeScoreRow">
              <ScoringErrorBoundary catalog={miscCatalog}>
                {scoring ? (
                  <ScoreBadges node={node} scoring={scoring} openNodeDetails={openNodeDetails} catalog={catalog} debateChromeCatalog={debateChromeCatalog} locale={locale} />
                ) : scoringError ? (
                  <span className="scoreBadge unavailable" aria-label={t(catalog, "debateViews.scoringUnavailableReason", { reason: scoringError.reason })}>
                    {t(catalog, "debateViews.scoringNotAvailableBadge")}
                  </span>
                ) : null}
                {v3Scores ? (
                  <V3ScoreBadges node={node} presentation={v3Scores} openNodeDetails={openNodeDetails} catalog={catalog} />
                ) : null}
              </ScoringErrorBoundary>
              {independencePill ? (
                <span
                  className="scoreBadge independence"
                  aria-label={t(catalog, "debateViews.evidenceSourcingFor", { claim: node.claim, detail: independencePill.title })}
                  title={independencePill.title}
                >
                  {independencePill.pillText}
                </span>
              ) : null}
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
                <div className="nodeClaim treePreview">{node.claim}</div>
                <div className="nodeControls nodeReferenceFooter" data-reference-tree-footer>
                  {onChallengeNode ? (
                    <button
                      type="button"
                      className="nodeCtrl challenge"
                      onClick={(event) => {
                        event.stopPropagation();
                        onChallengeNode(node, event.currentTarget);
                      }}
                    >
                      ⚐ {t(catalog, "debateViews.challenge")}
                    </button>
                  ) : (
                    <span
                      className="nodeCtrl challenge"
                      aria-disabled="true"
                      tabIndex={-1}
                      style={{ opacity: 0.55 }}
                    >
                      🔒 {t(catalog, "debateViews.challenge")}
                    </span>
                  )}
                  {onChallengeNode ? (
                    <button
                      type="button"
                      className="nodeCtrl"
                      disabled
                      aria-disabled="true"
                      title={t(catalog, "debateViews.nodeRegenerationUnavailable")}
                    >
                      ↻ {t(catalog, "debateViews.regenerate")}
                    </button>
                  ) : null}
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    className="nodeCtrl"
                    aria-label={t(catalog, "debateViews.details")}
                    onClick={(event) => {
                      event.stopPropagation();
                      openNodeDetails();
                    }}
                  >
                    {t(catalog, "debateViews.details")} <span aria-hidden="true">▸</span>
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
  openNodeDetails,
  catalog,
  debateChromeCatalog,
  locale
}: {
  node: DebateNode;
  scoring: NodeScoringPayload;
  openNodeDetails: () => void;
  catalog: MessageCatalog;
  debateChromeCatalog: MessageCatalog;
  locale: string;
}) {
  const strength = formatScorePercent(scoring.scores.strength, debateChromeCatalog);
  const uncertainty = formatScorePercent(scoring.scores.uncertainty, debateChromeCatalog);
  const impact = formatScorePercent(scoring.scores.impact, debateChromeCatalog);
  const issueSummary = summarizeCardScoringIssues(scoring, catalog, locale);
  const uncertaintyPill = formatUncertaintyPill(scoring.uncertainty_drivers, scoring.uncertainty_source, uncertainty, debateChromeCatalog);
  const strengthPill = formatStrengthPill(scoring.strength_kind, strength, debateChromeCatalog);

  return (
    <button
      type="button"
      className="scoreBadgeButton"
      aria-label={t(catalog, "debateViews.openScoringExplanation", { claim: node.claim })}
      onClick={(event) => {
        event.stopPropagation();
        openNodeDetails();
      }}
    >
      <span
        className="scoreBadge strength"
        aria-label={formatScoreBadgeLabel(t(catalog, "debateViews.strength"), scoring.labels.strength_label, strength, debateChromeCatalog)}
        title={strengthPill.title}
      >
        {strengthPill.pillText}
      </span>
      <span
        className="scoreBadge uncertainty"
        aria-label={formatScoreBadgeLabel(t(catalog, "debateViews.uncertainty"), scoring.labels.uncertainty_label, uncertainty, debateChromeCatalog)}
        title={uncertaintyPill.title}
      >
        {uncertaintyPill.pillText}
      </span>
      <span className="scoreBadge impact" aria-label={formatScoreBadgeLabel(t(catalog, "debateViews.impact"), scoring.labels.impact_label, impact, debateChromeCatalog)}>
        {t(catalog, "debateViews.impactBadge", { value: impact.value })}
      </span>
      {issueSummary ? (
        <span className="scoreBadge issue" aria-label={issueSummary.ariaLabel}>
          {issueSummary.label}
        </span>
      ) : null}
    </button>
  );
}

/**
 * UI-02a: V3's per-node numbers in V2's own badge vocabulary — the same
 * `scoreBadgeButton` / `scoreBadge` pills the V2 scoring path uses, opening the
 * same node drawer where the fuller detail lives. No new widget, no redesign
 * (DR-145). DR-154's percentage and precision rule is applied once in the
 * adapter; a card with no recorded number shows the typed reason, never a
 * placeholder digit.
 */
function V3ScoreBadges({
  node,
  presentation,
  openNodeDetails,
  catalog
}: {
  node: DebateNode;
  presentation: V3ScorePresentation;
  openNodeDetails: () => void;
  catalog: MessageCatalog;
}) {
  if (presentation.status === "ABSENT") {
    return (
      <span
        className="scoreBadge unavailable"
        aria-label={`${node.claim}: ${presentation.badge.title}`}
        title={presentation.badge.title}
      >
        {presentation.badge.pillText}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="scoreBadgeButton"
      aria-label={t(catalog, "debateViews.openRecordedScores", { claim: node.claim })}
      onClick={(event) => {
        event.stopPropagation();
        openNodeDetails();
      }}
    >
      {presentation.badges.map((badge) => (
        <span
          key={badge.id}
          className={`scoreBadge v3 ${badge.id}`}
          data-v3-score={badge.id}
          aria-label={badge.title}
          title={badge.title}
        >
          {badge.pillText}
        </span>
      ))}
    </button>
  );
}

function summarizeCardScoringIssues(scoring: NodeScoringPayload, catalog: MessageCatalog, locale: string) {
  const highPriorityHoles = scoring.holes.filter(
    (hole) => hole.severity === "high" && hole.description.trim()
  );
  const fatalFlags = scoring.fatal_flags.filter((flag) => flag.description.trim());
  const issueCount = highPriorityHoles.length + fatalFlags.length;

  if (issueCount === 0) return null;

  const label =
    fatalFlags.length > 0 && highPriorityHoles.length > 0
      ? t(catalog, "debateViews.issuesBadge", { count: issueCount })
      : fatalFlags.length > 0
        ? t(catalog, "debateViews.flagsBadge", { count: fatalFlags.length })
        : t(catalog, "debateViews.holeBadge", { count: highPriorityHoles.length });
  const parts = [
    fatalFlags.length > 0
      ? tPlural(catalog, "debateViews.fatalFlagCount", fatalFlags.length, locale)
      : null,
    highPriorityHoles.length > 0
      ? tPlural(catalog, "debateViews.highPriorityHoleCount", highPriorityHoles.length, locale)
      : null
  ].filter(Boolean);

  return {
    label,
    ariaLabel: t(catalog, "debateViews.scoringIssues", { issues: parts.join(t(catalog, "debateViews.and")) })
  };
}
