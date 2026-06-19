"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { API_BASE, clearStoredToken, getDebate, getStoredToken, setStoredToken, validateUserToken } from "@/lib/api";
import type { DebateDetail, DebateNode, SingleShotResult } from "@/lib/types";
import { BrandMark } from "@/components/TopBar";
import { DebateCanvas } from "@/components/DebateCanvas";
import { DebateThread } from "@/components/DebateThread";
import { DebateSplit } from "@/components/DebateSplit";
import { DebateMap } from "@/components/DebateMap";
import { SynthesisPanel } from "@/components/SynthesisPanel";
import { DebateWorkspaceDrawer } from "@/components/DebateWorkspaceDrawer";
import { NodeDetailDrawer } from "@/components/NodeDetailDrawer";
import { ChallengePopover } from "@/components/ChallengePopover";
import { InvestigationDrawer } from "@/components/InvestigationDrawer";
import { GuideModal } from "@/components/GuideModal";
import { Toast } from "@/components/Toast";
import { computeLean, countNodes, renderStateOf, treeDepth } from "@/lib/debatePresentation";
import type { PopoverState } from "@/lib/scrutiny";
import { isComplete, statusLabel } from "@/lib/format";

type SynthesisDraft = {
  model_id?: string;
  worker_id?: string;
  raw: string;
};

type StreamState = {
  status: "connecting" | "live" | "reconnecting";
  retryInMs?: number;
};

type DebateView = "thread" | "split" | "tree" | "map";

function parseEventData(event: Event): Record<string, unknown> | null {
  const data = (event as MessageEvent).data;
  if (typeof data !== "string" || !data) return null;
  try {
    const payload = JSON.parse(data);
    return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function payloadString(payload: Record<string, unknown> | null, key: string): string | undefined {
  const value = payload?.[key];
  return typeof value === "string" ? value : undefined;
}

function decodeJsonSnippet(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
}

function partialJsonField(raw: string, key: string): string {
  const keyIndex = raw.indexOf(`"${key}"`);
  if (keyIndex < 0) return "";
  const colonIndex = raw.indexOf(":", keyIndex);
  if (colonIndex < 0) return "";
  const quoteIndex = raw.indexOf('"', colonIndex);
  if (quoteIndex < 0) return "";
  let escaped = false;
  let value = "";
  for (let index = quoteIndex + 1; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      value += `\\${char}`;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') return decodeJsonSnippet(value);
    value += char;
  }
  return decodeJsonSnippet(value);
}

function activeSynthesisDraft(debate: DebateDetail | null): SynthesisDraft | null {
  if (!debate?.active_synthesis || debate.synthesis) return null;
  return {
    model_id: debate.active_synthesis.model_id,
    worker_id: debate.active_synthesis.worker_id,
    raw: debate.active_synthesis.raw || ""
  };
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function isSingleShotResult(value: unknown): value is SingleShotResult {
  if (!value || typeof value !== "object") return false;
  const result = value as Partial<SingleShotResult>;
  return (
    Array.isArray(result.pros) &&
    result.pros.every((item) => typeof item === "string") &&
    Array.isArray(result.cons) &&
    result.cons.every((item) => typeof item === "string") &&
    typeof result.strongest_pro === "string" &&
    typeof result.strongest_con === "string" &&
    Boolean(result.global_winner) &&
    typeof result.global_winner === "object" &&
    ["pro", "con", "balanced"].includes((result.global_winner as { side?: string }).side || "") &&
    typeof (result.global_winner as { reason?: unknown }).reason === "string" &&
    typeof result.final_text === "string" &&
    typeof result.model_id === "string" &&
    typeof result.tokens_in === "number" &&
    typeof result.tokens_out === "number" &&
    typeof result.created_at === "string"
  );
}

function appendToken(node: DebateNode, nodeId: string, delta: string): DebateNode {
  if (node.id === nodeId) {
    const generation = node.active_generation || {
      id: "streaming",
      model_id: "streaming",
      role: "streaming",
      argument: "",
      worker_id: "",
      created_at: new Date().toISOString()
    };
    return {
      ...node,
      status: "generating",
      active_generation: { ...generation, argument: `${generation.argument}${delta}` }
    };
  }
  return { ...node, children: node.children.map((child) => appendToken(child, nodeId, delta)) };
}

function beginNodeStream(
  node: DebateNode,
  payload: { node_id?: string; model_id?: string; worker_id?: string; role?: string }
): DebateNode {
  if (node.id === payload.node_id) {
    return {
      ...node,
      status: "generating",
      active_generation: {
        id: "streaming",
        model_id: payload.model_id || "streaming",
        role: payload.role || "streaming",
        argument: "",
        worker_id: payload.worker_id || "",
        created_at: new Date().toISOString()
      }
    };
  }
  return { ...node, children: node.children.map((child) => beginNodeStream(child, payload)) };
}

function findNode(root: DebateNode | null, id: string | null): DebateNode | null {
  if (!root || !id) return null;
  if (root.id === id) return root;
  for (const child of root.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

export default function DebatePageClient({
  id,
  initialDebate,
  initialError = null
}: {
  id: string;
  initialDebate: DebateDetail | null;
  initialError?: string | null;
}) {
  const [debate, setDebate] = useState<DebateDetail | null>(initialDebate);
  const [synthesisDraft, setSynthesisDraft] = useState<SynthesisDraft | null>(() =>
    activeSynthesisDraft(initialDebate)
  );
  const [error, setError] = useState<string | null>(initialError);
  const [streamState, setStreamState] = useState<StreamState>({ status: "connecting" });
  const [actionToken, setActionToken] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);

  const [view, setView] = useState<DebateView>("tree");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focusNodeId, setFocusNodeId] = useState<string | null>(null);
  const [replayNonce, setReplayNonce] = useState(0);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [investigation, setInvestigation] = useState<{ nodeId: string; status: string; flagged: string } | null>(
    null
  );
  const [scrutiny, setScrutiny] = useState<Record<string, string>>({});
  const [guideOpen, setGuideOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [tokenBarOpen, setTokenBarOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const canvasElRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const latest = await getDebate(id);
      setDebate(latest);
      const draft = activeSynthesisDraft(latest);
      if (draft) {
        setSynthesisDraft(draft);
      } else if (latest.synthesis) {
        setSynthesisDraft(null);
      }
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Unable to load debate");
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    let active = true;
    async function validateStoredToken() {
      const stored = getStoredToken();
      if (!stored) return;
      try {
        await validateUserToken(stored);
        if (active) setActionToken(stored);
      } catch {
        clearStoredToken();
        if (active) setActionToken(null);
      }
    }
    validateStoredToken();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let events: EventSource | null = null;
    let timer: number | null = null;
    let stopped = false;
    let attempt = 0;

    function scheduleReconnect() {
      if (stopped || timer) return;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      attempt += 1;
      setStreamState({ status: "reconnecting", retryInMs: delay });
      timer = window.setTimeout(connect, delay);
    }

    function connect() {
      timer = null;
      events?.close();
      setStreamState({ status: "connecting" });
      events = new EventSource(`${API_BASE}/api/debates/${id}/events`);
      events.onopen = () => {
        attempt = 0;
        setStreamState({ status: "live" });
        refresh();
      };
      events.addEventListener("tree_ready", () => refresh());
      events.addEventListener("node_started", (event) => {
        const payload = parseEventData(event);
        const nodeId = payloadString(payload, "node_id");
        const modelId = payloadString(payload, "model_id");
        const workerId = payloadString(payload, "worker_id");
        const role = payloadString(payload, "role");
        setDebate((current) =>
          current?.tree && nodeId
            ? {
                ...current,
                tree: beginNodeStream(current.tree, {
                  node_id: nodeId,
                  model_id: modelId,
                  worker_id: workerId,
                  role
                })
              }
            : current
        );
      });
      events.addEventListener("node_token", (event) => {
        const payload = parseEventData(event);
        const nodeId = payloadString(payload, "node_id");
        const delta = payloadString(payload, "delta");
        setDebate((current) =>
          current?.tree && nodeId && delta ? { ...current, tree: appendToken(current.tree, nodeId, delta) } : current
        );
      });
      events.addEventListener("node_complete", () => refresh());
      events.addEventListener("node_failed", (event) => {
        const payload = parseEventData(event);
        setError(payloadString(payload, "reason") || "Node generation failed");
      });
      events.addEventListener("synthesis_started", (event) => {
        const payload = parseEventData(event);
        setSynthesisDraft({
          model_id: payloadString(payload, "model_id"),
          worker_id: payloadString(payload, "worker_id"),
          raw: ""
        });
      });
      events.addEventListener("synthesis_token", (event) => {
        const payload = parseEventData(event);
        const delta = payloadString(payload, "delta") || "";
        setSynthesisDraft((current) => ({
          model_id: current?.model_id,
          worker_id: current?.worker_id,
          raw: `${current?.raw || ""}${delta}`
        }));
      });
      events.addEventListener("synthesis_complete", () => {
        setSynthesisDraft(null);
        refresh();
      });
      events.addEventListener("debate_complete", () => {
        setSynthesisDraft(null);
        refresh();
      });
      events.addEventListener("error", (event) => {
        const payload = parseEventData(event);
        if (payload) setError(payloadString(payload, "message") || "Debate stream error");
      });
      events.onerror = () => {
        events?.close();
        refresh();
        scheduleReconnect();
      };
    }

    connect();
    return () => {
      stopped = true;
      events?.close();
      if (timer) window.clearTimeout(timer);
    };
  }, [id, refresh]);

  const exportUrl = useMemo(() => `${API_BASE}/api/debates/${id}/export.md`, [id]);
  const synthesisRaw = synthesisDraft?.raw || "";
  const strongestPro =
    debate?.synthesis?.strongest_pro || partialJsonField(synthesisRaw, "strongest_pro") || partialJsonField(synthesisRaw, "title") || "";
  const strongestCon = debate?.synthesis?.strongest_con || partialJsonField(synthesisRaw, "strongest_con") || "";
  const verdict =
    debate?.synthesis?.verdict || partialJsonField(synthesisRaw, "verdict") || partialJsonField(synthesisRaw, "content") || "";
  const synthesisStreaming = Boolean(synthesisDraft && !debate?.synthesis);
  const synthesisProvenance = debate?.synthesis?.provenance || {};
  const synthesisSections = [
    { title: "Agreements", items: stringList(synthesisProvenance.agreements) },
    { title: "Tensions", items: stringList(synthesisProvenance.tensions) },
    { title: "Evidence Gaps", items: stringList(synthesisProvenance.evidence_gaps) },
    { title: "Key Takeaways", items: stringList(synthesisProvenance.key_takeaways) }
  ].filter((section) => section.items.length > 0);
  const leanRaw = synthesisProvenance.lean as { pct?: unknown; label?: unknown } | undefined;
  const lean =
    leanRaw && typeof leanRaw.pct === "number" && typeof leanRaw.label === "string"
      ? { pct: leanRaw.pct, label: leanRaw.label }
      : debate?.synthesis
        ? computeLean(debate.tree)
        : null;
  const synthesisMeta = synthesisDraft?.model_id
    ? `${synthesisDraft.model_id}${synthesisDraft.worker_id ? ` · ${synthesisDraft.worker_id}` : ""}`
    : debate?.synthesis
      ? `${debate.synthesis.model_id}${debate.synthesis.worker_name ? ` · ${debate.synthesis.worker_name}` : ""}`
      : "";

  const singleShotResult = isSingleShotResult(debate?.config?.single_shot_result)
    ? debate.config.single_shot_result
    : null;

  const complete = debate ? isComplete(debate.status) : false;
  const generating = debate ? !complete && (debate.status || "").toLowerCase() !== "failed" : false;
  const hasTree = Boolean(debate?.tree);

  const progress = useMemo(() => {
    if (!debate) return { pct: 0, label: "", count: "" };
    if (!hasTree) return { pct: 6, label: "Decomposing claim", count: "" };
    let total = 0;
    let done = 0;
    const walk = (node: DebateNode) => {
      if (node.node_type !== "ROOT_CLAIM") {
        total += 1;
        const state = renderStateOf(node);
        if (state === "done" || state === "empty") done += 1;
      }
      (node.children || []).forEach(walk);
    };
    if (debate.tree) walk(debate.tree);
    const pct = total ? Math.round((done / total) * 100) : complete ? 100 : 40;
    return { pct, label: "Models arguing", count: `${pct}%` };
  }, [debate, hasTree, complete]);

  const hasArtifacts = Boolean(
    debate &&
      (singleShotResult ||
        debate.analyzer_runs.length ||
        debate.selected_skills.length ||
        debate.selected_agents.length ||
        debate.agent_runs.length)
  );

  const detailNode = findNode(debate?.tree ?? null, detailNodeId);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }

  function toggleExpand(nodeId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function toggleCollapse(nodeId: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }

  function openInSplit(nodeId: string) {
    setFocusNodeId(nodeId);
    setView("split");
  }

  function replayGeneration() {
    setReplayNonce((nonce) => nonce + 1);
    showToast("Replaying generation");
  }

  function openChallenge(node: DebateNode, anchor: HTMLElement, text = "") {
    const rect = anchor.getBoundingClientRect();
    setPopover({ nodeId: node.id, x: rect.left + rect.width / 2, y: rect.top - 8, text });
  }

  function onProseSelect(node: DebateNode, _event: MouseEvent) {
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (!text || text.length < 4) return;
    const range = selection?.getRangeAt(0);
    const rect = range?.getBoundingClientRect();
    if (!rect) return;
    setPopover({ nodeId: node.id, x: rect.left + rect.width / 2, y: rect.top - 8, text });
  }

  async function unlockActions(event: FormEvent) {
    event.preventDefault();
    const value = tokenDraft.trim();
    if (!value) return;
    setTokenBusy(true);
    setError(null);
    try {
      await validateUserToken(value);
      setStoredToken(value);
      setActionToken(value);
      setTokenDraft("");
      setTokenBarOpen(false);
    } catch {
      clearStoredToken();
      setActionToken(null);
      setError("Token was rejected by the coordinator.");
    } finally {
      setTokenBusy(false);
    }
  }

  function lockActions() {
    clearStoredToken();
    setActionToken(null);
    setTokenDraft("");
  }

  function rejectActionToken() {
    clearStoredToken();
    setActionToken(null);
  }

  if (error && !debate) {
    return (
      <div className="screen scroll">
        <div className="screenInner narrow">
          <div className="error">{error}</div>
          <Link className="btn" href="/" style={{ marginTop: 16 }}>
            ← Back to library
          </Link>
        </div>
      </div>
    );
  }
  if (!debate) {
    return (
      <div className="screen scroll">
        <div className="screenInner narrow">
          <p className="muted">Loading…</p>
        </div>
      </div>
    );
  }

  const statusKind = complete ? "pillOk" : generating ? "pillGen" : "";

  return (
    <div className="debateView">
      {/* ---- top bar ---- */}
      <header className="debateTopBar">
        <BrandMark />
        <div className="debateTopCenter">
          <span className="topBarDivider" aria-hidden />
          <Link className="btnGhost" href="/">
            ← Library
          </Link>
          <div className="debateTopClaim">
            <span className="debateTopTitle">{debate.topic}</span>
            <span className={`pill ${statusKind}`}>
              <span className="dot" />
              {statusLabel(debate.status)}
            </span>
          </div>
        </div>
        <div className="debateTopActions">
          {hasTree ? (
            <>
              <div className="segment" role="group" aria-label="View">
                <button type="button" aria-pressed={view === "thread"} onClick={() => setView("thread")}>
                  Thread
                </button>
                <button type="button" aria-pressed={view === "split"} onClick={() => setView("split")}>
                  Split
                </button>
                <button type="button" aria-pressed={view === "tree"} onClick={() => setView("tree")}>
                  Tree
                </button>
                <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
                  Map
                </button>
              </div>
              <button type="button" className="btn" onClick={replayGeneration} title="Replay generation">
                ↻ Replay
              </button>
            </>
          ) : null}
          {hasArtifacts ? (
            <button type="button" className="btn" onClick={() => setWorkspaceOpen(true)}>
              ◫ Workspace
            </button>
          ) : null}
          <a className="btn" href={exportUrl} onClick={() => showToast("Exported debate.md")}>
            ↓ Export
          </a>
          <button type="button" className="iconBtn" aria-label="How it works" onClick={() => setGuideOpen(true)}>
            ?
          </button>
          <Link className="iconBtn" href="/settings" aria-label="Settings">
            ⚙
          </Link>
        </div>
      </header>

      {/* ---- generation progress strip ---- */}
      {generating ? (
        <div className="progressStrip">
          <span className="progressLabel">{progress.label}</span>
          <div className="progressTrack">
            <div className="progressFill" style={{ width: `${progress.pct}%` }} />
          </div>
          <span className="progressCount">{progress.count}</span>
        </div>
      ) : null}

      {error ? (
        <div className="debateError">
          <div className="error">{error}</div>
        </div>
      ) : null}

      {/* ---- main split ---- */}
      <div className="debateMain">
        <div key={`${view}-${replayNonce}`} className="fadeup" style={{ flex: 1, minWidth: 0, display: "flex" }}>
          {hasTree && debate.tree ? (
            view === "thread" ? (
              <DebateThread
                root={debate.tree}
                expanded={expanded}
                collapsed={collapsed}
                scrutiny={scrutiny}
                meta={{ nodes: countNodes(debate.tree), depth: treeDepth(debate.tree) }}
                onOpenNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setDetailNodeId(nodeId);
                }}
                onChallengeNode={(node, anchor) => openChallenge(node, anchor)}
                onToggleExpand={toggleExpand}
                onToggleCollapse={toggleCollapse}
                onProseSelect={onProseSelect}
              />
            ) : view === "split" ? (
              <DebateSplit
                root={debate.tree}
                focusNodeId={focusNodeId}
                expanded={expanded}
                scrutiny={scrutiny}
                onFocus={setFocusNodeId}
                onOpenNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setDetailNodeId(nodeId);
                }}
                onChallengeNode={(node, anchor) => openChallenge(node, anchor)}
                onToggleExpand={toggleExpand}
                onProseSelect={onProseSelect}
              />
            ) : view === "map" ? (
              <DebateMap root={debate.tree} onOpenSplit={openInSplit} />
            ) : (
              <DebateCanvas
                root={debate.tree}
                expanded={expanded}
                selectedNodeId={selectedNodeId}
                scrutiny={scrutiny}
                meta={{ nodes: countNodes(debate.tree), depth: treeDepth(debate.tree) }}
                canvasRef={(el) => {
                  canvasElRef.current = el;
                }}
                onOpenNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setDetailNodeId(nodeId);
                }}
                onChallengeNode={(node, anchor) => openChallenge(node, anchor)}
                onToggleExpand={toggleExpand}
                onProseSelect={onProseSelect}
              />
            )
          ) : singleShotResult ? (
            <SingleShotMain result={singleShotResult} />
          ) : (
            <div className="canvasEmpty">
              <p className="muted">
                {generating ? "Building the argument tree…" : "No argument tree was produced for this debate."}
              </p>
            </div>
          )}
        </div>

        <SynthesisPanel
          ready={complete}
          pending={generating}
          streaming={synthesisStreaming}
          structured={Boolean(debate?.synthesis && !strongestCon.trim() && synthesisSections.length > 0)}
          proClaim={strongestPro}
          conClaim={strongestCon}
          verdict={verdict}
          meta={synthesisMeta}
          lean={lean}
          sections={synthesisSections}
        />
      </div>

      {/* ---- overlays ---- */}
      {detailNode ? (
        <NodeDetailDrawer
          node={detailNode}
          token={actionToken}
          onClose={() => setDetailNodeId(null)}
          onChallenge={(anchor, text) => openChallenge(detailNode, anchor, text)}
          onQueued={() => {
            showToast("Regeneration queued");
            refresh();
          }}
          onError={(message) => setError(message)}
          onAuthRejected={rejectActionToken}
        />
      ) : null}

      {popover ? (
        <ChallengePopover
          state={popover}
          onClose={() => setPopover(null)}
          onChoose={() => {
            setScrutiny((current) => ({ ...current, [popover.nodeId]: "working" }));
            setInvestigation({ nodeId: popover.nodeId, status: "working", flagged: popover.text });
            setDetailNodeId(null);
            setPopover(null);
          }}
        />
      ) : null}

      {investigation ? (
        <InvestigationDrawer
          node={findNode(debate.tree, investigation.nodeId)}
          status={investigation.status}
          flagged={investigation.flagged}
          onClose={() => setInvestigation(null)}
          onResolve={(status) => {
            setScrutiny((current) => ({ ...current, [investigation.nodeId]: status }));
            setInvestigation((current) => (current ? { ...current, status } : current));
          }}
          onClear={() => {
            setScrutiny((current) => {
              const next = { ...current };
              delete next[investigation.nodeId];
              return next;
            });
            setInvestigation(null);
          }}
        />
      ) : null}

      {workspaceOpen ? (
        <DebateWorkspaceDrawer debate={debate} singleShot={singleShotResult} onClose={() => setWorkspaceOpen(false)} />
      ) : null}

      {guideOpen ? <GuideModal onClose={() => setGuideOpen(false)} /> : null}

      {toast ? <Toast message={toast} /> : null}

      {/* ---- action token (subtle, bottom-left) ---- */}
      <div className="tokenDock">
        {actionToken ? (
          <button type="button" className="btn" onClick={lockActions}>
            🔓 Actions unlocked
          </button>
        ) : tokenBarOpen ? (
          <form className="tokenForm" onSubmit={unlockActions}>
            <input
              className="tokenInput"
              value={tokenDraft}
              onChange={(event) => setTokenDraft(event.target.value)}
              type="password"
              autoComplete="off"
              placeholder="User token"
              aria-label="User token"
            />
            <button className="btn btnDark" type="submit" disabled={tokenBusy}>
              {tokenBusy ? "…" : "Unlock"}
            </button>
          </form>
        ) : (
          <button type="button" className="btn" onClick={() => setTokenBarOpen(true)}>
            🔒 Unlock actions
          </button>
        )}
      </div>
    </div>
  );
}

function SingleShotMain({ result }: { result: SingleShotResult }) {
  return (
    <div className="singleShot scroll">
      <div className="singleShotInner">
        <div className="nodeEyebrow">Single-shot result</div>
        <h1 className="display sm" style={{ marginTop: 8 }}>
          {result.final_text}
        </h1>
        <p className="lede" style={{ marginTop: 10 }}>
          {result.global_winner.reason}
        </p>
        <div className="singleShotGrid">
          <section className="synthCard synthPro">
            <div className="synthCardLabel pro">↑ Strongest Pro</div>
            <div className="synthCardClaim">{result.strongest_pro}</div>
          </section>
          <section className="synthCard synthCon">
            <div className="synthCardLabel con">↓ Strongest Con</div>
            <div className="synthCardClaim">{result.strongest_con}</div>
          </section>
        </div>
        <div className="singleShotColumns">
          <section>
            <div className="synthSectionTitle">Pros ({result.pros.length})</div>
            <ul className="synthSectionList">
              {result.pros.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <div className="synthSectionTitle">Cons ({result.cons.length})</div>
            <ul className="synthSectionList">
              {result.cons.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
        <div className="singleShotMeta">
          <span className="pill">{result.model_id}</span>
          <span className="pill">{result.tokens_in} in</span>
          <span className="pill">{result.tokens_out} out</span>
        </div>
      </div>
    </div>
  );
}
