"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { useState } from "react";
import { nodeGenerations, regenerateNode } from "@/lib/api";
import type { DebateNode, Generation, NodeScoringPayload } from "@/lib/types";
import { isAbandonedArgumentStatus, isLowStrengthNode } from "@/lib/debateTreeUtils";
import { ModelBadge, modelColorStyle } from "@/components/ModelPresentation";

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
  if (node.node_type === "PRO") return `nodeCard pro${ab}${ls}`;
  if (node.node_type === "CON") return `nodeCard con${ab}${ls}`;
  if (
    node.node_type === "SCIENTIFIC_POV" ||
    node.node_type === "STATISTICAL_POV" ||
    node.node_type === "ETHICAL_POV" ||
    node.node_type === "PRACTICAL_POV"
  )
    return `nodeCard root${ab}${ls}`;
  return `nodeCard root${ab}${ls}`;
}

function nodeLabel(node: DebateNode): string {
  if (node.node_type === "ROOT_CLAIM") return "Root";
  if (node.node_type === "SCIENTIFIC_POV") return "Scientific POV";
  if (node.node_type === "STATISTICAL_POV") return "Statistical POV";
  if (node.node_type === "ETHICAL_POV") return "Ethical POV";
  if (node.node_type === "PRACTICAL_POV") return "Practical POV";
  return node.node_type === "PRO" ? "Pro" : "Con";
}

type DebateTreeProps = {
  node: DebateNode;
  token: string | null;
  onQueued: () => void;
  onError: (message: string) => void;
  onAuthRejected: () => void;
  onSelectNode?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  scoringByNodeId?: Map<string, NodeScoringPayload>;
};

type ArgumentNodeCardProps = {
  node: DebateNode;
  token: string | null;
  onQueued: () => void;
  onError: (message: string) => void;
  onAuthRejected: () => void;
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

function looksAuthRelated(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("401") || lower.includes("403") || lower.includes("invalid user token");
}

export function ArgumentNodeCard({
  node,
  token,
  onQueued,
  onError,
  onAuthRejected,
  onSelectNode,
  isSelected = false,
  canToggleChildren = false,
  childrenOpen,
  onToggleChildren,
  selectionLabel,
  scoring,
}: ArgumentNodeCardProps) {
  const [busyNode, setBusyNode] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<Generation[]>([]);

  async function regenerate(id: string) {
    if (!token) return;
    setBusyNode(id);
    try {
      await regenerateNode(id, token);
      onQueued();
    } catch (exc) {
      const message = errorMessage(exc, "Unable to regenerate node");
      onError(message);
      if (looksAuthRelated(message)) onAuthRejected();
    } finally {
      setBusyNode(null);
    }
  }

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
      if (looksAuthRelated(message)) onAuthRejected();
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
  const modelStyle = generation ? modelColorStyle(generation.model_id) : undefined;
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
            {generation ? <ModelBadge modelId={generation.model_id} /> : null}
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
        {(token && !isAbandonedNode(node)) || canToggleChildren ? (
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
              <>
                <button
                  className="secondary"
                  type="button"
                  disabled={busyNode === node.id}
                  aria-label={`Regenerate argument: ${node.claim}`}
                  onClick={() => regenerate(node.id)}
                >
                  Regenerate
                </button>
                <button
                  className="secondary"
                  type="button"
                  aria-label={`${historyOpen ? "Hide" : "Show"} generation history for argument: ${node.claim}`}
                  aria-expanded={historyOpen}
                  onClick={toggleHistory}
                >
                  History
                </button>
              </>
            ) : null}
          </div>
        ) : null}
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
  onQueued,
  onError,
  onAuthRejected,
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
        onQueued={onQueued}
        onError={onError}
        onAuthRejected={onAuthRejected}
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
              onQueued={onQueued}
              onError={onError}
              onAuthRejected={onAuthRejected}
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
                onQueued={onQueued}
                onError={onError}
                onAuthRejected={onAuthRejected}
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
