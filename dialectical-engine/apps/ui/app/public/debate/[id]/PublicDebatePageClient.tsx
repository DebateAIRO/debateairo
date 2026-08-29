"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { PublicDebate } from "@debateai/contract";
import { DebateCanvas } from "@/components/DebateCanvas";
import { DebateMap } from "@/components/DebateMap";
import { DebateSplit } from "@/components/DebateSplit";
import { DebateThread } from "@/components/DebateThread";
import { NodeDetailDrawer } from "@/components/NodeDetailDrawer";
import { PublicAnswerDisclosure } from "@/components/PublicAnswerDisclosure";
import { PublicHonestyDrawer } from "@/components/PublicHonestyDrawer";
import { ScoringErrorBoundary } from "@/components/ScoringErrorBoundary";
import { getDebateScoring } from "@/lib/api";
import { countClaims, treeDepth } from "@/lib/debatePresentation";
import type { DebateNode } from "@/lib/types";
import {
  contractNodesById,
  debateDetailFromAnswer,
  type TreeProjectableAnswer
} from "@/lib/v3/adapter";
import { buildPublicAnswerExport } from "@/lib/v3/publicAnswerExport";
import {
  ScoringDiagnosticsDrawer,
  type ScoringAsyncState
} from "@/app/debate/[id]/DebatePageClient";

type DebateView = "thread" | "split" | "tree" | "map";

function findNode(root: DebateNode, nodeId: string): DebateNode | null {
  if (root.id === nodeId) return root;
  for (const child of root.children) {
    const found = findNode(child, nodeId);
    if (found) return found;
  }
  return null;
}

export function PublicDebatePageClient({ debate }: { debate: PublicDebate }) {
  const [view, setView] = useState<DebateView>("tree");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const [honestyOpen, setHonestyOpen] = useState(false);
  const [scoringDiagnosticsOpen, setScoringDiagnosticsOpen] = useState(false);
  const [scoringState, setScoringState] = useState<ScoringAsyncState>({
    status: "idle",
    data: null,
    error: null
  });

  const refreshState = { status: "idle", jobId: null, error: null } as const;
  const exported = useMemo(() => buildPublicAnswerExport(debate), [debate]);
  const treeProjection = useMemo(() => {
    if (debate.answer.tree_included !== true) return null;
    const projectable: TreeProjectableAnswer = {
      nodes: debate.answer.nodes ?? [],
      edges: debate.answer.edges ?? [],
      condition_mark_records: [],
      answer_id: debate.public_ref,
      answer_version: 1,
      question_line: debate.question,
      terminal: debate.answer.terminal,
      composed_text: debate.answer.summary_segments,
      serve_state: debate.answer.terminal === "COMPONENTS_ONLY" ? "COMPONENTS_ONLY" : "COMPOSED"
    };
    return {
      detail: debateDetailFromAnswer(projectable),
      nodesById: contractNodesById({ nodes: debate.answer.nodes ?? [] })
    };
  }, [debate]);

  useEffect(() => {
    let active = true;
    setScoringState((current) => ({ status: "loading", data: current.data, error: null }));
    getDebateScoring(debate.public_ref)
      .then((payload) => {
        if (!active) return;
        setScoringState({
          status: payload.status === "unavailable" ? "unavailable" : "loaded",
          data: payload,
          error: null
        });
      })
      .catch((error) => {
        if (!active) return;
        setScoringState((current) => ({
          status: "error",
          data: current.data,
          error: error instanceof Error ? error.message : "Unable to load scoring"
        }));
      });
    return () => {
      active = false;
    };
  }, [debate.public_ref]);

  const tree = treeProjection?.detail.tree ?? null;
  const detailNode = tree && detailNodeId ? findNode(tree, detailNodeId) : null;
  const toggleExpanded = (nodeId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const toggleCollapsed = (nodeId: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };
  const openNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setDetailNodeId(nodeId);
  };

  return (
    <main className="screen scroll">
      <div className="screenInner wide">
        <nav><Link href="/">← Published debates</Link></nav>
        <p className="eyebrow" style={{ marginTop: 30 }}>Public debate · by {debate.author_pseudonym}</p>
        <h1 className="display">{debate.question}</h1>
        <p>Published {new Date(debate.published_at).toLocaleDateString()}.</p>

        <div className="debateTopControlRow">
          {tree ? (
            <div className="segment" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "thread"} onClick={() => setView("thread")}>Thread</button>
              <button type="button" aria-pressed={view === "split"} onClick={() => setView("split")}>Split</button>
              <button type="button" aria-pressed={view === "tree"} onClick={() => setView("tree")}>Tree</button>
              <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>Map</button>
            </div>
          ) : null}
          <ScoringErrorBoundary>
            <div className="topSwitch">
              <span>Scoring</span>
              <button
                type="button"
                className="iconBtn"
                aria-label="Open scoring diagnostics"
                title="Scoring diagnostics"
                onClick={() => setScoringDiagnosticsOpen(true)}
              >
                i
              </button>
            </div>
          </ScoringErrorBoundary>
          <button type="button" className="btn" aria-label="Honesty" onClick={() => setHonestyOpen(true)}>
            Honesty
          </button>
          <a href={exported.href} download={exported.filename} className="btn" aria-label="Export">
            Export
          </a>
        </div>

        <section className="card">
          <PublicAnswerDisclosure answer={debate.answer} />
          <h2>{debate.answer.verdict ?? "Verdict unavailable"}</h2>
          {debate.answer.confidence_band ? <p>Confidence: {debate.answer.confidence_band}</p> : null}
          {debate.answer.summary_segments.map((segment, index) => <p key={index}>{segment.text}</p>)}
        </section>
        {debate.answer.badges.length > 0 ? (
          <section className="card"><h2>Badges</h2><p>{debate.answer.badges.join(" · ")}</p></section>
        ) : null}
        {debate.answer.residual_objections.length > 0 ? (
          <section className="card">
            <h2>Residual objections</h2>
            {debate.answer.residual_objections.map((objection, index) => <p key={index}>{objection}</p>)}
          </section>
        ) : null}
        <section className="card"><h2>What could reverse this answer?</h2><p>{debate.answer.reversal_point}</p></section>

        {tree ? (
          <section className="debateMain" aria-label="Published argument tree">
            {view === "thread" ? (
              <DebateThread
                root={tree}
                expanded={expanded}
                collapsed={collapsed}
                meta={{ nodes: countClaims(tree), depth: treeDepth(tree) }}
                onOpenNode={openNode}
                onToggleExpand={toggleExpanded}
                onToggleCollapse={toggleCollapsed}
              />
            ) : view === "split" ? (
              <DebateSplit
                root={tree}
                focusNodeId={focusNodeId}
                expanded={expanded}
                onFocus={setFocusNodeId}
                onOpenNode={openNode}
                onToggleExpand={toggleExpanded}
              />
            ) : view === "map" ? (
              <DebateMap
                root={tree}
                onOpenSplit={(nodeId) => {
                  setFocusNodeId(nodeId);
                  setView("split");
                }}
              />
            ) : (
              <DebateCanvas
                root={tree}
                expanded={expanded}
                selectedNodeId={selectedNodeId}
                v3NodesById={treeProjection?.nodesById}
                meta={{
                  claims: countClaims(tree),
                  depth: treeDepth(tree),
                  judged: 0,
                  derivedStanding: 0,
                  setAside: 0
                }}
                onOpenNode={openNode}
                onToggleExpand={toggleExpanded}
              />
            )}
          </section>
        ) : null}
      </div>

      {detailNode ? (
        <NodeDetailDrawer
          node={detailNode}
          v3={treeProjection?.nodesById.get(detailNode.id)}
          token={null}
          onClose={() => setDetailNodeId(null)}
          onFocusRecommendationNode={() => false}
          canFocusRecommendationNode={() => false}
          onQueued={() => undefined}
          onError={() => undefined}
          onAuthRejected={() => undefined}
        />
      ) : null}
      {honestyOpen ? <PublicHonestyDrawer answer={debate.answer} onClose={() => setHonestyOpen(false)} /> : null}
      {scoringDiagnosticsOpen ? (
        <ScoringDiagnosticsDrawer
          scoringState={scoringState}
          refreshState={refreshState}
          onClose={() => setScoringDiagnosticsOpen(false)}
        />
      ) : null}
    </main>
  );
}
