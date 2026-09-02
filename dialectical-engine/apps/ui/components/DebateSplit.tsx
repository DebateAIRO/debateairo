"use client";

import type { CSSProperties, MouseEvent } from "react";
import type { Node as ContractNode } from "@debateai/contract";
import type { DebateNode } from "@/lib/types";
import { ROLE_PALETTES, renderStateOf, roleLabel, roleOf } from "@/lib/debatePresentation";
import { findNodePathById, partitionArgumentChildren, perspectiveChildren } from "@/lib/debateTreeUtils";
import { ReferenceAuthorPill, ReferenceReviewLine, ReferenceScoreBadges } from "@/components/ReferenceNodeMeta";
import { SCRUTINY_STATUS } from "@/lib/scrutiny";

export type SplitCallbacks = {
  onFocus: (nodeId: string) => void;
  onOpenNode: (nodeId: string) => void;
  onChallengeNode?: (node: DebateNode, anchor: HTMLElement) => void;
  onToggleExpand: (nodeId: string) => void;
  onProseSelect?: (node: DebateNode, event: MouseEvent) => void;
};

type DebateSplitProps = SplitCallbacks & {
  root: DebateNode;
  focusNodeId: string | null;
  expanded: Set<string>;
  scrutiny?: Record<string, string>;
  v3NodesById?: ReadonlyMap<string, ContractNode>;
};

function subtreeLean(node: DebateNode): { pro: number; con: number } {
  let pro = 0;
  let con = 0;
  const walk = (n: DebateNode) => {
    (n.children || []).forEach((child) => {
      const role = roleOf(child);
      if (renderStateOf(child) !== "empty") {
        if (role === "pro") pro += 1;
        else if (role === "con") con += 1;
      }
      walk(child);
    });
  };
  walk(node);
  return { pro, con };
}

export function DebateSplit({
  root,
  focusNodeId,
  expanded,
  scrutiny = {},
  v3NodesById,
  onFocus,
  onOpenNode,
  onChallengeNode,
  onToggleExpand,
  onProseSelect
}: DebateSplitProps) {
  const path = focusNodeId ? findNodePathById(root, focusNodeId) : [root];
  const focus = path.length ? path[path.length - 1] : root;
  const isRootFocus = focus.node_type === "ROOT_CLAIM";
  const ancestors = path.slice(0, -1);

  const { proChildren, conChildren } = partitionArgumentChildren(focus);
  const perspectives = perspectiveChildren(focus);
  const { pro, con } = subtreeLean(focus);
  const total = pro + con;
  const leanPct = total ? Math.round((pro / total) * 100) : 50;
  const leanLabel = leanPct >= 55 ? "Pro" : leanPct <= 45 ? "Con" : "Even";

  const focusRole = roleOf(focus);
  const focusPal = focusRole === "root" ? null : ROLE_PALETTES[focusRole];

  return (
    <div className="split scroll">
      <div className="splitInner">
        <div className="splitPath">
          <div className="splitPathHead">
            <span>Path from root</span>
            <div className="splitPathChips">
            {(ancestors.length > 0 ? path.slice(0, -1) : [root]).map((node, index) => {
              const role = roleOf(node);
              const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
              return (
                <div key={node.id} className="splitChip">
                  <button
                    type="button"
                    className="splitChipBtn"
                    style={{ borderLeftColor: pal.line }}
                    onClick={() => onFocus(node.id)}
                  >
                    <span
                      className="splitChipRole"
                      style={{ color: pal.text, background: pal.bg, borderColor: pal.border }}
                    >
                      {role === "root" ? "● Root" : `${pal.arrow} ${roleLabel(node)}`}
                    </span>
                    <span className="splitChipClaim">{node.claim}</span>
                  </button>
                </div>
              );
            })}
            </div>
            <span className="splitPathHint">click a level to step back up</span>
          </div>
        </div>

        {isRootFocus ? (
          <div className="splitFocusShell">
            <div className="splitFocusRoot">
              <span className="referenceStanceTab root" aria-hidden />
              <div className="nodeEyebrow">Root claim</div>
              <div className="splitFocusRootClaim">{root.claim}</div>
            </div>
          </div>
        ) : (
          <div className="splitFocusShell" data-reference-split-focus>
            <div className="splitFocusMain" style={{ borderColor: "var(--line)" }}>
            <span className="referenceStanceTab" style={{ background: focusPal?.line }} aria-hidden />
            <div className="splitFocusHead referenceMetaRow">
              <span
                className="roleBadge"
                style={{ color: focusPal?.text, background: focusPal?.bg, borderColor: focusPal?.border }}
              >
                {focusPal?.arrow} {roleLabel(focus)}
              </span>
              <ReferenceScoreBadges node={focus} v3Node={v3NodesById?.get(focus.id)} onOpenNode={onOpenNode} />
              <span style={{ flex: 1 }} />
              <ReferenceAuthorPill node={focus} />
            </div>
            <ReferenceReviewLine review={v3NodesById?.get(focus.id)?.review} />
            <div className="splitFocusClaim">{focus.claim}</div>
            {focus.active_generation?.argument ? (
              <div className="splitFocusBody" onMouseUp={(event) => onProseSelect?.(focus, event)}>
                {focus.active_generation.argument}
              </div>
            ) : null}
            <div className="nodeControls">
              {onChallengeNode ? (
                <button
                  type="button"
                  className="nodeCtrl challenge"
                  onClick={(event) => {
                    event.stopPropagation();
                    onChallengeNode(focus, event.currentTarget);
                  }}
                >
                  ⚐ Challenge
                </button>
              ) : null}
              <button type="button" className="nodeCtrl" disabled aria-disabled="true">
                ↻ Regenerate
              </button>
              <span style={{ flex: 1 }} />
              <button type="button" className="nodeCtrl link" onClick={() => onOpenNode(focus.id)}>
                Open full analysis ▸
              </button>
            </div>
            </div>
          </div>
        )}

        {total > 0 ? (
          <>
            <div className="splitMeter">
              <div className="splitMeterSide right">
                <div className="splitMeterLabel pro">↑ The case for</div>
                <div className="splitMeterCount">{pro} arguments</div>
              </div>
              <div
                className="splitMeterBar"
                style={{
                  background: `linear-gradient(90deg, var(--pro-line) 0%, var(--pro-line) ${leanPct}%, var(--con-line) ${leanPct}%, var(--con-line) 100%)`
                }}
              />
              <div className="splitMeterSide left">
                <div className="splitMeterLabel con">The case against ↓</div>
                <div className="splitMeterCount">{con} arguments</div>
              </div>
            </div>
            <div className="splitMeterNote">Leans {leanLabel} · click any argument to make it the focus</div>
          </>
        ) : null}

        {perspectives.length > 0 ? (
          <div className="splitPerspectives">
            {perspectives.map((node) => (
              <PerspectiveCard key={node.id} node={node} onFocus={onFocus} />
            ))}
          </div>
        ) : null}

        {proChildren.length > 0 || conChildren.length > 0 ? (
          <div className="splitColumns">
            <span className="splitBattleLine" aria-hidden />
            <div className="splitColumn pro">
              <div className="splitColumnHead pro">
                <span className="splitColumnIcon pro">↑</span>
                <span>The case for</span>
              </div>
              {proChildren.length > 0 ? (
                proChildren.map((node) => (
                  <SplitCard
                    key={node.id}
                    node={node}
                    expanded={expanded.has(node.id)}
                    scrutinyStatus={scrutiny[node.id]}
                    v3Node={v3NodesById?.get(node.id)}
                    onOpenNode={onOpenNode}
                    onFocus={onFocus}
                    onChallengeNode={onChallengeNode}
                    onToggleExpand={onToggleExpand}
                    onProseSelect={onProseSelect}
                  />
                ))
              ) : (
                <p className="splitColumnEmpty">No supporting arguments at this level.</p>
              )}
            </div>
            <div className="splitColumn con">
              <div className="splitColumnHead con">
                <span className="splitColumnIcon con">↓</span>
                <span>The case against</span>
              </div>
              {conChildren.length > 0 ? (
                conChildren.map((node) => (
                  <SplitCard
                    key={node.id}
                    node={node}
                    expanded={expanded.has(node.id)}
                    scrutinyStatus={scrutiny[node.id]}
                    v3Node={v3NodesById?.get(node.id)}
                    onOpenNode={onOpenNode}
                    onFocus={onFocus}
                    onChallengeNode={onChallengeNode}
                    onToggleExpand={onToggleExpand}
                    onProseSelect={onProseSelect}
                  />
                ))
              ) : (
                <p className="splitColumnEmpty">No opposing arguments at this level.</p>
              )}
            </div>
          </div>
        ) : perspectives.length === 0 ? (
          <div className="splitLeaf">
            No further arguments branch from here — this is a leaf of the debate. Use the path above to step back up
            {onChallengeNode ? ", or challenge it to spawn a rebuttal." : "."}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PerspectiveCard({ node, onFocus }: { node: DebateNode; onFocus: (id: string) => void }) {
  const { pro, con } = subtreeLean(node);
  return (
    <button type="button" className="splitPerspective" onClick={() => onFocus(node.id)}>
      <span className="splitPerspectiveBadge">◆ {roleLabel(node)}</span>
      <span className="splitPerspectiveClaim">{node.claim}</span>
      <span className="splitPerspectiveMeta">
        {pro} for · {con} against ▸
      </span>
    </button>
  );
}

type SplitCardProps = {
  node: DebateNode;
  expanded: boolean;
  scrutinyStatus?: string;
  v3Node?: ContractNode;
  onFocus: (id: string) => void;
  onOpenNode: (id: string) => void;
  onChallengeNode?: (node: DebateNode, anchor: HTMLElement) => void;
  onToggleExpand: (id: string) => void;
  onProseSelect?: (node: DebateNode, event: MouseEvent) => void;
};

function SplitCard({
  node,
  expanded,
  scrutinyStatus,
  v3Node,
  onFocus,
  onOpenNode,
  onChallengeNode,
  onToggleExpand,
  onProseSelect
}: SplitCardProps) {
  const role = roleOf(node);
  const pal = role === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[role];
  const state = renderStateOf(node);
  const empty = state === "empty";
  const scrutiny = scrutinyStatus ? SCRUTINY_STATUS[scrutinyStatus] : null;
  const rebuttals = node.children || [];

  const cardStyle: CSSProperties = scrutiny
    ? { background: "var(--surface)", borderColor: scrutiny.color }
    : empty
      ? { background: "var(--surface-sunken)", borderColor: "var(--line-2)" }
      : { background: "var(--surface)", borderColor: "var(--line)" };

  return (
    <div className="splitCardWrap">
      <div className="splitCardShell">
      <div className="splitCard" style={cardStyle}>
        <span className="referenceStanceTab" style={{ background: pal.line }} aria-hidden />
        {scrutiny ? (
          <span className="scrutinyBadge" style={{ borderColor: scrutiny.color }}>
            <span className="scrutinyDot" style={{ background: scrutiny.color }} />
            <span style={{ color: scrutiny.color }}>{scrutiny.label}</span>
          </span>
        ) : null}
        <div className="splitCardMeta referenceMetaRow">
          <span className="roleBadge" style={{ color: pal.text, background: pal.bg, borderColor: pal.border }}>
            {pal.arrow} {roleLabel(node)}
          </span>
          <ReferenceScoreBadges node={node} v3Node={v3Node} onOpenNode={onOpenNode} condensed />
          <span style={{ flex: 1 }} />
          <ReferenceAuthorPill node={node} />
        </div>
        {empty ? (
          <div className="nodeEmpty">
            <span className="nodeEmptyMark" aria-hidden>
              ∅
            </span>
            <div className="nodeEmptyText">No strong argument found.</div>
          </div>
        ) : (
          <>
            <button type="button" className="splitCardClaim" onClick={() => onFocus(node.id)}>
              {node.claim}
            </button>
            {node.active_generation?.argument ? (
              <div
                className={`threadBody${expanded ? " open" : ""}`}
                onMouseUp={(event) => onProseSelect?.(node, event)}
              >
                {node.active_generation.argument}
              </div>
            ) : null}
            <div className="nodeControls nodeReferenceFooter">
              <button type="button" className="nodeCtrl focus" onClick={() => onFocus(node.id)}>
                Focus ▸
              </button>
              <span style={{ flex: 1 }} />
              {node.active_generation?.argument ? (
                <button type="button" className="nodeCtrl" onClick={() => onToggleExpand(node.id)}>
                  {expanded ? "Show less" : "Read"}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>
      </div>
      {rebuttals.length > 0 ? (
        <div className="splitRebuttals">
          {rebuttals.map((child) => {
            const cr = roleOf(child);
            const cpal = cr === "root" ? ROLE_PALETTES.pov : ROLE_PALETTES[cr];
            const rel = cr === "pro" ? "Supports" : cr === "con" ? "Rebuts" : "Branches";
            return (
              <button
                key={child.id}
                type="button"
                className="splitRebuttal"
                style={{ borderLeftColor: cpal.line }}
                onClick={() => onFocus(child.id)}
              >
                <span className="splitRebuttalRel" style={{ color: cpal.text }}>
                  ↳ {rel}
                </span>
                <span className="splitRebuttalClaim">
                  {renderStateOf(child) === "empty" ? "No strong argument found." : child.claim}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
