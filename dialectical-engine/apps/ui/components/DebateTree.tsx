"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useState } from "react";
import { nodeGenerations } from "@/lib/api";
import type { DebateNode, Generation, NodeScoringPayload } from "@/lib/types";
import { isAbandonedArgumentStatus, isLowStrengthNode } from "@/lib/debateTreeUtils";
import { branchLabelOf } from "@/lib/debatePresentation";
import { ModelBadge, modelColorStyle } from "@/components/ModelPresentation";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import miscEnglish from "@/messages/en/misc.json";
import debateChromeEnglish from "@/messages/en/debateChrome.json";
import composeEnglish from "@/messages/en/compose.json";

function isAbandonedNode(node: DebateNode): boolean {
  return isAbandonedArgumentStatus(node.status)
    || isAbandonedArgumentStatus(node.path_status)
    || isAbandonedArgumentStatus(node.stopping_status);
}

// Verdict-first UI (Phase 9): low-strength node dimming is additive and
// gated behind NEXT_PUBLIC_VERDICT_FIRST_UI -- flag off must leave rendering
// byte-identical to pre-Task-3 behavior. See debateTreeUtils.isLowStrengthNode
// for the honesty contract (missing score is never treated as low strength).
const VERDICT_FIRST_UI_ENABLED = process.env.NEXT_PUBLIC_VERDICT_FIRST_UI === "true";

function nodeClass(node: DebateNode, lowStrength: boolean): string {
  const ab = isAbandonedNode(node) ? " abandoned" : "";
  const ls = VERDICT_FIRST_UI_ENABLED && lowStrength ? " lowStrengthNode" : "";
  // Any non-argument node (root claim or ANY lens/branch type) shares the
  // "root" card styling; only PRO/CON get their own stance styling. This works
  // for arbitrary backend lens types, not just the four legacy POV literals.
  const roleClass = node.node_type === "PRO" ? "pro" : node.node_type === "CON" ? "con" : "root";
  return `nodeCard ${roleClass}${ab}${ls}`;
}

function nodeLabel(node: DebateNode, catalog: MessageCatalog, debateChromeCatalog: MessageCatalog): string {
  if (node.node_type === "ROOT_CLAIM") return t(catalog, "debateViews.root");
  if (node.node_type === "PRO") return t(catalog, "debateViews.pro");
  if (node.node_type === "CON") return t(catalog, "debateViews.con");
  // Data-driven: backend-provided label/lens wins, else derive from node_type.
  return branchLabelOf(node, debateChromeCatalog);
}

type DebateTreeProps = {
  node: DebateNode;
  token: string | null;
  onError: (message: string) => void;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  scoringByNodeId?: Map<string, NodeScoringPayload>;
  lowStrengthThreshold?: number;
  /** The interface locale's `misc` catalogue, for the model badges. */
  miscCatalog?: MessageCatalog;
  /** The interface locale's `debateChrome` catalogue: branch labels. */
  debateChromeCatalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: model family names. */
  composeCatalog?: MessageCatalog;
};

type ArgumentNodeCardProps = {
  node: DebateNode;
  token: string | null;
  onError: (message: string) => void;
  onSelectNode?: (nodeId: string) => void;
  isSelected?: boolean;
  canToggleChildren?: boolean;
  childrenOpen?: boolean;
  onToggleChildren?: () => void;
  selectionLabel?: string;
  scoring?: NodeScoringPayload;
  lowStrengthThreshold?: number;
  /** The interface locale's `misc` catalogue, for the model badges. */
  miscCatalog?: MessageCatalog;
  /** The interface locale's `debateChrome` catalogue: branch labels. */
  debateChromeCatalog?: MessageCatalog;
  /** The interface locale's `compose` catalogue: model family names. */
  composeCatalog?: MessageCatalog;
};

function errorMessage(exc: unknown, fallback: string): string {
  return exc instanceof Error ? exc.message : fallback;
}

export function ArgumentNodeCard({
  node,
  token,
  onError,
  onSelectNode,
  isSelected = false,
  canToggleChildren = false,
  childrenOpen,
  onToggleChildren,
  selectionLabel,
  scoring,
  lowStrengthThreshold,
  miscCatalog = miscEnglish,
  debateChromeCatalog = debateChromeEnglish,
  composeCatalog = composeEnglish,
}: ArgumentNodeCardProps) {
  const { catalog } = useChromeI18n();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Generation[]>([]);

  async function toggleHistory() {
    if (!token) return;
    try {
      if (!historyOpen) {
        setHistory(await nodeGenerations(node.id, token));
      }
      setHistoryOpen(!historyOpen);
    } catch (exc) {
      const message = errorMessage(exc, t(catalog, "debateViews.unableToLoadGenerationHistory"));
      onError(message);
    }
  }

  function activateCard() {
    onSelectNode?.(node.id);
  }

  function selectFromClick(event: MouseEvent<HTMLElement>) {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest("button, a, input, textarea, select, .historyPanel")) return;
    activateCard();
  }

  function selectOrToggleFromKeyboard(event: KeyboardEvent<HTMLElement>) {
    if (!isCardInteractive) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activateCard();
  }

  const generation = node.active_generation;
  const argument = generation?.argument || (node.status === "pending" ? t(catalog, "debateViews.queued") : "");
  const workerName = generation?.worker_name || generation?.worker_id;
  const isCardInteractive = Boolean(onSelectNode);
  const cardLabel = selectionLabel ?? (isCardInteractive ? t(catalog, "debateViews.selectArgument", { claim: node.claim }) : undefined);
  const modelStyle = generation ? modelColorStyle(generation.maker ?? generation.model_id) : undefined;
  // Additive, flag-gated low-strength dimming (Phase 9 Task 3). Never replaces
  // the existing abandoned/selection classes -- a node can be both abandoned
  // AND low-strength, and dimming never affects clickability or children.
  const lowStrength = lowStrengthThreshold === undefined
    ? false
    : isLowStrengthNode(scoring?.scores?.strength, lowStrengthThreshold);
  return (
    <article
      className={[nodeClass(node, lowStrength), canToggleChildren ? "expandable" : "", isCardInteractive ? "selectable" : "", isSelected ? "selected" : ""]
        .filter(Boolean)
        .join(" ")}
      style={modelStyle}
      data-node-type={node.node_type}
      data-model-id={generation?.model_id}
      data-worker-name={workerName}
      data-children-open={canToggleChildren ? childrenOpen : undefined}
      data-selectable={isCardInteractive ? "true" : undefined}
      data-low-strength={VERDICT_FIRST_UI_ENABLED && lowStrength ? "true" : undefined}
      aria-current={isSelected ? "true" : undefined}
    >
      <div className="nodeTop">
        <div
          className="nodeSelectionSurface"
          role={isCardInteractive ? "button" : undefined}
          tabIndex={isCardInteractive ? 0 : undefined}
          aria-label={cardLabel}
          aria-current={isSelected ? "true" : undefined}
          data-selected={isSelected ? "true" : undefined}
          onClick={isCardInteractive ? selectFromClick : undefined}
          onKeyDown={isCardInteractive ? selectOrToggleFromKeyboard : undefined}
        >
          <div className="toolbar">
            <span className="badge">{nodeLabel(node, catalog, debateChromeCatalog)}</span>
            <span className={`badge${isAbandonedNode(node) ? " abandonedBadge" : ""}`}>
              {isAbandonedNode(node) ? t(catalog, "debateViews.stopped") : node.status}
            </span>
            {generation || node.maker !== undefined ? (
              <ModelBadge modelId={generation?.model_id ?? null} maker={node.maker} catalog={miscCatalog} composeCatalog={composeCatalog} />
            ) : null}
            {generation ? <span className="badge" data-worker-name={workerName}>{workerName}</span> : null}
            {generation ? <span className="badge">{generation.role}</span> : null}
          </div>
          <h3>{node.claim}</h3>
          <div
            className={[
              node.status === "generating" || node.status === "pending" ? "argument cursor" : "argument",
              canToggleChildren ? "argumentToggle" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {argument}
          </div>
        </div>
        <div className="toolbar nodeActionToolbar">
          {canToggleChildren ? (
            <button
              className="secondary"
              type="button"
              aria-expanded={childrenOpen}
              aria-label={childrenOpen
                ? t(catalog, "debateViews.collapseChildArgumentsFor", { claim: node.claim })
                : t(catalog, "debateViews.expandChildArgumentsFor", { claim: node.claim })}
              onClick={onToggleChildren}
            >
              {childrenOpen ? t(catalog, "debateViews.collapse") : t(catalog, "debateViews.expand")}
            </button>
          ) : null}
          {token && !isAbandonedNode(node) ? (
            <button
              className="secondary"
              type="button"
              disabled
              aria-disabled="true"
              aria-label={t(catalog, "debateViews.regenerateArgument", { claim: node.claim })}
              title={t(catalog, "debateViews.nodeRegenerationUnavailable")}
            >
              {t(catalog, "debateViews.regenerate")}
            </button>
          ) : null}
          {token && !isAbandonedNode(node) ? (
            <button
              className="secondary"
              type="button"
              aria-label={historyOpen
                ? t(catalog, "debateViews.hideGenerationHistory", { claim: node.claim })
                : t(catalog, "debateViews.showGenerationHistory", { claim: node.claim })}
              aria-expanded={historyOpen}
              onClick={toggleHistory}
            >
              {t(catalog, "debateViews.history")}
            </button>
          ) : null}
        </div>
      </div>
      {historyOpen ? (
        <div className="historyPanel">
          {history.length === 0 ? (
            <p className="muted">{t(catalog, "debateViews.noGenerationsYet")}</p>
          ) : (
            history.map((item) => (
              <section key={item.id}>
                <div className="toolbar">
                  <span className="badge">{item.is_active ? t(catalog, "debateViews.active") : t(catalog, "debateViews.archived")}</span>
                  <ModelBadge modelId={item.model_id} catalog={miscCatalog} composeCatalog={composeCatalog} />
                  <span className="badge">{item.worker_name || item.worker_id}</span>
                  <span className="badge">{item.role}</span>
                </div>
                <p>{item.argument}</p>
              </section>
            ))
          )}
        </div>
      ) : null}
    </article>
  );
}

export function DebateTree({
  node,
  token,
  onError,
  onSelectNode,
  selectedNodeId,
  scoringByNodeId,
  lowStrengthThreshold,
  miscCatalog = miscEnglish,
  debateChromeCatalog = debateChromeEnglish,
  composeCatalog = composeEnglish,
}: DebateTreeProps) {
  const { catalog, locale } = useChromeI18n();
  const [childrenOpen, setChildrenOpen] = useState(node.node_type === "ROOT_CLAIM");

  const activeChildren = node.children.filter((c) => !isAbandonedNode(c));
  const abandonedChildren = node.children.filter(isAbandonedNode);
  const hasActiveChildren = activeChildren.length > 0;
  const canToggleChildren = hasActiveChildren && node.node_type !== "ROOT_CLAIM";
  const childLayout = node.node_type === "ROOT_CLAIM" ? "root-povs" : "vertical";

  return (
    <div className="tree" data-node-type={node.node_type}>
      <ArgumentNodeCard
        node={node}
        token={token}
        onError={onError}
        onSelectNode={onSelectNode}
        isSelected={selectedNodeId === node.id}
        canToggleChildren={canToggleChildren}
        childrenOpen={childrenOpen}
        onToggleChildren={() => setChildrenOpen((current) => !current)}
        scoring={scoringByNodeId?.get(node.id)}
        lowStrengthThreshold={lowStrengthThreshold}
        miscCatalog={miscCatalog}
        debateChromeCatalog={debateChromeCatalog}
        composeCatalog={composeCatalog}
      />
      {hasActiveChildren && childrenOpen ? (
        <div
          className={["children", childLayout === "root-povs" ? "rootPovChildren" : ""].filter(Boolean).join(" ")}
          data-child-layout={childLayout}
        >
          {activeChildren.map((child) => (
            <DebateTree
              key={child.id}
              node={child}
              token={token}
              onError={onError}
              onSelectNode={onSelectNode}
              selectedNodeId={selectedNodeId}
              scoringByNodeId={scoringByNodeId}
              lowStrengthThreshold={lowStrengthThreshold}
              miscCatalog={miscCatalog}
              debateChromeCatalog={debateChromeCatalog}
              composeCatalog={composeCatalog}
            />
          ))}
        </div>
      ) : null}
      {abandonedChildren.length > 0 ? (
        <div className="abandonedPaths" aria-label={tPlural(catalog, "debateViews.stoppedPathCount", abandonedChildren.length, locale)}>
          <div className="abandonedPathsSummary">
            ⊗ {tPlural(catalog, "debateViews.stoppedPathCount", abandonedChildren.length, locale)}
          </div>
          <div className="children vertical" data-child-layout="vertical">
            {abandonedChildren.map((child) => (
              <DebateTree
                key={child.id}
                node={child}
                token={token}
                onError={onError}
                onSelectNode={onSelectNode}
                selectedNodeId={selectedNodeId}
                scoringByNodeId={scoringByNodeId}
                lowStrengthThreshold={lowStrengthThreshold}
                miscCatalog={miscCatalog}
                debateChromeCatalog={debateChromeCatalog}
                composeCatalog={composeCatalog}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
