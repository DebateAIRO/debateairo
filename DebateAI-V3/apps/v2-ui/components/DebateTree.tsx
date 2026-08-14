"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useState } from "react";
import { nodeGenerations } from "@/lib/api";
import type { DebateNode, Generation, NodeScoringPayload } from "@/lib/types";
import { isAbandonedArgumentStatus, isLowStrengthNode } from "@/lib/debateTreeUtils";
import { branchLabelOf } from "@/lib/debatePresentation";
import { ModelBadge, modelColorStyle } from "@/components/ModelPresentation";
import { V3_MISSING_CAPABILITIES } from "@/lib/v3/missingCapabilities";

function isAbandonedNode(node: DebateNode): boolean {
  return isAbandonedArgumentStatus(node.status);
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

function nodeLabel(node: DebateNode): string {
  if (node.node_type === "ROOT_CLAIM") return "Root";
  if (node.node_type === "PRO") return "Pro";
  if (node.node_type === "CON") return "Con";
  // Data-driven: backend-provided label/lens wins, else derive from node_type.
  return branchLabelOf(node);
}

type DebateTreeProps = {
  node: DebateNode;
  token: string | null;
  onError: (message: string) => void;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  scoringByNodeId?: Map<string, NodeScoringPayload>;
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
}: ArgumentNodeCardProps) {
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
      const message = errorMessage(exc, "Unable to load generation history");
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
  const argument = generation?.argument || (node.status === "pending" ? "Queued" : "");
  const workerName = generation?.worker_name || generation?.worker_id;
  const isCardInteractive = Boolean(onSelectNode);
  const cardLabel = selectionLabel ?? (isCardInteractive ? `Select argument: ${node.claim}` : undefined);
  const modelStyle = generation ? modelColorStyle(generation.maker ?? generation.model_id) : undefined;
  // Additive, flag-gated low-strength dimming (Phase 9 Task 3). Never replaces
  // the existing abandoned/selection classes -- a node can be both abandoned
  // AND low-strength, and dimming never affects clickability or children.
  const lowStrength = isLowStrengthNode(scoring?.scores?.strength);
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
            <span className="badge">{nodeLabel(node)}</span>
            <span className={`badge${isAbandonedNode(node) ? " abandonedBadge" : ""}`}>
              {isAbandonedNode(node) ? "Stopped" : node.status}
            </span>
            {generation || node.maker !== undefined ? (
              <ModelBadge modelId={generation?.model_id ?? null} maker={node.maker} />
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
              aria-label={`${childrenOpen ? "Collapse" : "Expand"} child arguments for: ${node.claim}`}
              onClick={onToggleChildren}
            >
              {childrenOpen ? "Collapse" : "Expand"}
            </button>
          ) : null}
          {token && !isAbandonedNode(node) ? (
            <button
              className="secondary"
              type="button"
              disabled
              aria-disabled="true"
              aria-label={`Regenerate argument: ${node.claim}`}
              title={V3_MISSING_CAPABILITIES.nodeRegeneration}
            >
              Regenerate
            </button>
          ) : null}
          {token && !isAbandonedNode(node) ? (
            <button
              className="secondary"
              type="button"
              aria-label={`${historyOpen ? "Hide" : "Show"} generation history for argument: ${node.claim}`}
              aria-expanded={historyOpen}
              onClick={toggleHistory}
            >
              History
            </button>
          ) : null}
        </div>
      </div>
      {historyOpen ? (
        <div className="historyPanel">
          {history.length === 0 ? (
            <p className="muted">No generations yet.</p>
          ) : (
            history.map((item) => (
              <section key={item.id}>
                <div className="toolbar">
                  <span className="badge">{item.is_active ? "Active" : "Archived"}</span>
                  <ModelBadge modelId={item.model_id} />
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
}: DebateTreeProps) {
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
            />
          ))}
        </div>
      ) : null}
      {abandonedChildren.length > 0 ? (
        <div className="abandonedPaths" aria-label={`${abandonedChildren.length} stopped path${abandonedChildren.length === 1 ? "" : "s"}`}>
          <div className="abandonedPathsSummary">
            ⊗ {abandonedChildren.length} stopped path{abandonedChildren.length === 1 ? "" : "s"}
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
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
