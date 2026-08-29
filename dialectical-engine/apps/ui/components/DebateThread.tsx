"use client";

import type { CSSProperties, MouseEvent } from "react";
import type { DebateNode } from "@/lib/types";
import { ROLE_PALETTES, renderStateOf, roleLabel, roleOf } from "@/lib/debatePresentation";
import { ModelMetaLine } from "@/components/ModelPresentation";
import { SCRUTINY_STATUS } from "@/lib/scrutiny";
import { V3_MISSING_CAPABILITIES } from "@/lib/v3/missingCapabilities";

export type ThreadCallbacks = {
  onOpenNode: (nodeId: string) => void;
  onChallengeNode?: (node: DebateNode, anchor: HTMLElement) => void;
  onRegenNode?: (node: DebateNode, anchor: HTMLElement) => void;
  onToggleExpand: (nodeId: string) => void;
  onToggleCollapse: (nodeId: string) => void;
  onProseSelect?: (node: DebateNode, event: MouseEvent) => void;
};

type DebateThreadProps = ThreadCallbacks & {
  root: DebateNode;
  expanded: Set<string>;
  collapsed: Set<string>;
  scrutiny?: Record<string, string>;
  meta: { nodes: number; depth: number };
};

type ThreadRow = {
  node: DebateNode;
  /** isLast flag for each ancestor (child-of-root … parent). */
  trail: boolean[];
  childCount: number;
};

function buildRows(root: DebateNode, collapsed: Set<string>): ThreadRow[] {
  const rows: ThreadRow[] = [];
  const walk = (node: DebateNode, trail: boolean[]) => {
    const open = !collapsed.has(node.id);
    const kids = open ? node.children || [] : [];
    kids.forEach((child, index) => {
      const isLast = index === kids.length - 1;
      const childTrail = [...trail, isLast];
      rows.push({ node: child, trail: childTrail, childCount: (child.children || []).length });
      walk(child, childTrail);
    });
  };
  walk(root, []);
  return rows;
}

export function DebateThread({
  root,
  expanded,
  collapsed,
  scrutiny = {},
  meta,
  onOpenNode,
  onChallengeNode,
  onRegenNode,
  onToggleExpand,
  onToggleCollapse,
  onProseSelect
}: DebateThreadProps) {
  const rows = buildRows(root, collapsed);

  return (
    <div className="thread scroll">
      <div className="threadInner">
        <div className="threadRoot">
          <div className="nodeEyebrow">Root claim</div>
          <div className="threadRootClaim">{root.claim}</div>
          <div className="nodeRootMeta">
            <span>{meta.nodes} nodes</span>
            <span className="sep">/</span>
            <span>depth {meta.depth}</span>
            <span className="sep">/</span>
            <span>scroll down to follow each line of argument</span>
          </div>
        </div>

        <div className="threadStub" aria-hidden />

        {rows.map((row) => (
          <ThreadRowCard
            key={row.node.id}
            row={row}
            expanded={expanded.has(row.node.id)}
            collapsed={collapsed.has(row.node.id)}
            scrutinyStatus={scrutiny[row.node.id]}
            onOpenNode={onOpenNode}
            onChallengeNode={onChallengeNode}
            onRegenNode={onRegenNode}
            onToggleExpand={onToggleExpand}
            onToggleCollapse={onToggleCollapse}
            onProseSelect={onProseSelect}
          />
        ))}
      </div>
    </div>
  );
}

type ThreadRowCardProps = ThreadCallbacks & {
  row: ThreadRow;
  expanded: boolean;
  collapsed: boolean;
  scrutinyStatus?: string;
};

function ThreadRowCard({
  row,
  expanded,
  collapsed,
  scrutinyStatus,
  onOpenNode,
  onChallengeNode,
  onRegenNode,
  onToggleExpand,
  onToggleCollapse,
  onProseSelect
}: ThreadRowCardProps) {
  const { node, trail, childCount } = row;
  const role = roleOf(node);
  const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
  const state = renderStateOf(node);
  const empty = state === "empty";
  const generation = node.active_generation;
  const scrutiny = scrutinyStatus ? SCRUTINY_STATUS[scrutinyStatus] : null;
  const hasContinue = trail.length > 0 ? !trail[trail.length - 1] : false;
  // ancestor lanes = every ancestor except the immediate parent
  const lanes = trail.slice(0, -1);

  const cardStyle: CSSProperties = scrutiny
    ? { background: "var(--surface)", borderColor: scrutiny.color, borderLeftColor: pal.line }
    : empty
      ? { background: "var(--surface-sunken)", borderColor: "var(--line-2)", borderLeftColor: "oklch(0.82 0.006 80)" }
      : { background: "var(--surface)", borderColor: pal.border, borderLeftColor: pal.line };

  const canOpen = state === "done";

  return (
    <div className="threadRow">
      {lanes.map((isLast, index) => (
        <span key={index} className="threadLane">
          {isLast ? null : <span className="threadLaneLine" />}
        </span>
      ))}

      <span className="threadElbow">
        <span className="threadElbowShape" style={{ borderColor: pal.line }} />
        {hasContinue ? <span className="threadElbowContinue" /> : null}
      </span>

      <div className="threadCardWrap">
        <div
          className="threadCard"
          style={cardStyle}
          role={canOpen ? "button" : undefined}
          tabIndex={canOpen ? 0 : undefined}
          onClick={canOpen ? () => onOpenNode(node.id) : undefined}
          onKeyDown={(event) => {
            if (canOpen && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              onOpenNode(node.id);
            }
          }}
        >
          {scrutiny ? (
            <span className="scrutinyBadge" style={{ borderColor: scrutiny.color }}>
              <span className="scrutinyDot" style={{ background: scrutiny.color }} />
              <span style={{ color: scrutiny.color }}>{scrutiny.label}</span>
            </span>
          ) : null}

          <div className="nodeHeader">
            <span className="roleBadge" style={{ color: pal.text, background: pal.bg, borderColor: pal.border }}>
              {pal.arrow} {roleLabel(node)}
            </span>
            {generation || node.maker !== undefined ? (
              <ModelMetaLine modelId={generation?.model_id ?? null} maker={node.maker} />
            ) : null}
          </div>

          {empty ? (
            <div className="nodeEmpty">
              <span className="nodeEmptyMark" aria-hidden>
                ∅
              </span>
              <div className="nodeEmptyText">No strong argument found.</div>
            </div>
          ) : state === "pending" ? (
            <div className="nodePending">
              <div className="skel" style={{ height: 13, borderRadius: 4, width: "92%", marginBottom: 7 }} />
              <div className="skel" style={{ height: 13, borderRadius: 4, width: "60%" }} />
            </div>
          ) : state === "streaming" ? (
            <div className="threadClaim">
              {generation?.argument || node.claim}
              <span className="streamCursor" style={{ background: pal.text }} />
            </div>
          ) : (
            <>
              <div className="threadClaim">{node.claim}</div>
              {generation?.argument ? (
                <div
                  className={`threadBody${expanded ? " open" : ""}`}
                  onMouseUp={(event) => onProseSelect?.(node, event)}
                >
                  {generation.argument}
                </div>
              ) : null}
              <div className="nodeControls">
                {onChallengeNode ? (
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
                ) : null}
                <button
                  type="button"
                  className="nodeCtrl"
                  disabled
                  aria-disabled="true"
                  title={V3_MISSING_CAPABILITIES.nodeRegeneration}
                >
                  ↻ Regenerate
                </button>
                {generation?.argument ? (
                  <button
                    type="button"
                    className="nodeCtrl"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleExpand(node.id);
                    }}
                  >
                    {expanded ? "Show less" : "Read"}
                  </button>
                ) : null}
                <span style={{ flex: 1 }} />
                {childCount > 0 ? (
                  <button
                    type="button"
                    className="threadCollapse"
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleCollapse(node.id);
                    }}
                  >
                    <span className="threadCollapseSign">{collapsed ? "+" : "–"}</span>
                    {collapsed ? `${childCount}` : "Hide"}
                  </button>
                ) : null}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
