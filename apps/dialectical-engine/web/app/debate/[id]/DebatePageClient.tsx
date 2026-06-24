"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import {
  API_BASE,
  approveDebateAdaptiveDepthExpansion,
  clearStoredToken,
  getDebate,
  getDebateAdaptiveDepthDryRun,
  getDebateScoring,
  getDebateScoringJobStatus,
  getStoredToken,
  setStoredToken,
  startDebateScoringRefresh,
  validateUserToken
} from "@/lib/api";
import type {
  AdaptiveDepthDryRunItem,
  DebateAdaptiveDepthDryRunResponse,
  DebateDetail,
  DebateNode,
  DebateScoringResponse,
  DepthPressure,
  InvestigationAction,
  NodeScoringPayload,
  RecommendedInvestigation,
  SingleShotResult
} from "@/lib/types";
import { BrandMark } from "@/components/TopBar";
import { DebateCanvas } from "@/components/DebateCanvas";
import { DebateOutline } from "@/components/DebateOutline";
import { RecommendedInvestigations } from "@/components/RecommendedInvestigations";
import { SynthesisPanel } from "@/components/SynthesisPanel";
import { DebateWorkspaceDrawer } from "@/components/DebateWorkspaceDrawer";
import { NodeDetailDrawer } from "@/components/NodeDetailDrawer";
import { ChallengePopover } from "@/components/ChallengePopover";
import { InvestigationDrawer } from "@/components/InvestigationDrawer";
import { GuideModal } from "@/components/GuideModal";
import { Toast } from "@/components/Toast";
import { ScoringErrorBoundary } from "@/components/ScoringErrorBoundary";
import { computeLean, countNodes, renderStateOf, treeDepth } from "@/lib/debatePresentation";
import type { PopoverState } from "@/lib/scrutiny";
import { isComplete, statusLabel } from "@/lib/format";
import {
  formatScoringVisibilityState,
  indexScoringResponse,
  selectStrongestUnresolvedScoringIssue,
  summarizeScoringFatalFlags,
  summarizeScoringHoles
} from "@/lib/scoringResponse";
import type {
  DebateScoringFatalFlagSummary,
  DebateScoringHoleSummary,
  DebateScoringUnresolvedIssue,
  ScoringVisibilityState
} from "@/lib/scoringResponse";
import { formatScoringConfidenceCopy, formatScoringStatusCopy } from "@/lib/scoringStatusCopy";

type SynthesisDraft = {
  model_id?: string;
  worker_id?: string;
  raw: string;
};

type StreamState = {
  status: "connecting" | "live" | "reconnecting";
  retryInMs?: number;
};

type ScoringAsyncState =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: DebateScoringResponse | null; error: null }
  | { status: "loaded"; data: DebateScoringResponse; error: null }
  | { status: "unavailable"; data: DebateScoringResponse; error: null }
  | { status: "error"; data: DebateScoringResponse | null; error: string };

type ScoringRefreshState =
  | { status: "idle"; jobId: null; error: null }
  | { status: "starting"; jobId: string | null; error: null }
  | { status: "error"; jobId: string | null; error: string };

type AdaptiveDepthDryRunAsyncState =
  | { status: "idle"; data: null; error: null }
  | { status: "loading"; data: DebateAdaptiveDepthDryRunResponse | null; error: null }
  | { status: "loaded"; data: DebateAdaptiveDepthDryRunResponse; error: null }
  | { status: "unavailable"; data: DebateAdaptiveDepthDryRunResponse | null; error: string | null }
  | { status: "error"; data: DebateAdaptiveDepthDryRunResponse | null; error: string };

type AdaptiveDepthApprovalState =
  | { status: "idle"; error: null }
  | { status: "starting"; error: null }
  | { status: "queued"; error: null }
  | { status: "unavailable"; error: string }
  | { status: "error"; error: string };

const SCORE_AWARE_FILTERS = [
  { id: "all", label: "All" },
  { id: "issues", label: "Issues" },
  { id: "weak_uncertain", label: "Weak/uncertain" },
  { id: "decisive", label: "Decisive" },
  { id: "unavailable", label: "Unavailable" }
] as const;

type ScoreAwareFilter = (typeof SCORE_AWARE_FILTERS)[number]["id"];

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

function findPathToNode(root: DebateNode | null, id: string | null): string[] {
  if (!root || !id) return [];
  if (root.id === id) return [root.id];
  for (const child of root.children || []) {
    const childPath = findPathToNode(child, id);
    if (childPath.length > 0) return [root.id, ...childPath];
  }
  return [];
}

function hasHighPriorityScoringIssue(scoring: NodeScoringPayload): boolean {
  const highImpact = scoring.scores.impact >= 0.7;
  return (
    scoring.fatal_flags.some((flag) => flag.description.trim().length > 0) ||
    scoring.holes.some(
      (hole) => (hole.severity === "high" || highImpact) && hole.description.trim().length > 0
    )
  );
}

function matchesScoreAwareFilter(scoring: NodeScoringPayload, filter: ScoreAwareFilter): boolean {
  if (filter === "all") return true;
  if (filter === "issues") return hasHighPriorityScoringIssue(scoring);
  if (filter === "weak_uncertain") {
    return scoring.scores.strength <= 0.45 || scoring.scores.uncertainty >= 0.65;
  }
  if (filter === "decisive") {
    return scoring.scores.impact >= 0.7 && scoring.scores.uncertainty <= 0.45;
  }
  if (filter === "unavailable") return false;
  return true;
}

function collectRecommendedInvestigations(response: DebateScoringResponse | null): RecommendedInvestigation[] {
  return (response?.items ?? []).flatMap((item) => item.recommended_investigations ?? []);
}

function formatAdaptiveDepthAction(action: InvestigationAction | null): string {
  if (!action) return "Review";
  return action.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAdaptiveDepthReason(reason: string): string {
  return reason.replace(/_/g, " ");
}

function formatAdaptiveDepthPressure(pressure: DepthPressure): string {
  return pressure.replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatAdaptiveDepthScore(score: number): string {
  const percent = Math.max(0, Math.min(100, Math.round(score * 100)));
  return `${percent}%`;
}

function adaptiveDepthDryRunStateFromPayload(
  payload: DebateAdaptiveDepthDryRunResponse
): AdaptiveDepthDryRunAsyncState {
  if (payload.status === "unavailable") {
    return {
      status: "unavailable",
      data: payload,
      error: payload.reason || "Adaptive depth dry-run unavailable."
    };
  }
  return { status: "loaded", data: payload, error: null };
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
  const [scoringState, setScoringState] = useState<ScoringAsyncState>({ status: "idle", data: null, error: null });
  const [scoringRefreshState, setScoringRefreshState] = useState<ScoringRefreshState>({
    status: "idle",
    jobId: null,
    error: null
  });
  const [adaptiveDepthDryRunState, setAdaptiveDepthDryRunState] = useState<AdaptiveDepthDryRunAsyncState>({
    status: "idle",
    data: null,
    error: null
  });
  const [adaptiveDepthApprovalState, setAdaptiveDepthApprovalState] = useState<AdaptiveDepthApprovalState>({
    status: "idle",
    error: null
  });
  const [scoringEnabled, setScoringEnabled] = useState(false);
  const [scoreAwareFilter, setScoreAwareFilter] = useState<ScoreAwareFilter>("all");
  const [actionToken, setActionToken] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);

  const [view, setView] = useState<"tree" | "outline">("tree");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [detailNodeId, setDetailNodeId] = useState<string | null>(null);
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [investigation, setInvestigation] = useState<{ nodeId: string; status: string; flagged: string } | null>(
    null
  );
  const [scrutiny, setScrutiny] = useState<Record<string, string>>({});
  const [guideOpen, setGuideOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [scoringDiagnosticsOpen, setScoringDiagnosticsOpen] = useState(false);
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
    setScoringState({ status: "idle", data: null, error: null });
    setScoringRefreshState({ status: "idle", jobId: null, error: null });
    setAdaptiveDepthDryRunState({ status: "idle", data: null, error: null });
    setAdaptiveDepthApprovalState({ status: "idle", error: null });
  }, [id]);

  useEffect(() => {
    if (!scoringEnabled) setScoringState({ status: "idle", data: null, error: null });
    if (!scoringEnabled) setAdaptiveDepthDryRunState({ status: "idle", data: null, error: null });
    if (!scoringEnabled) setAdaptiveDepthApprovalState({ status: "idle", error: null });
    if (!scoringEnabled) setScoreAwareFilter("all");
  }, [scoringEnabled]);

  useEffect(() => {
    if (!scoringEnabled) return;
    let active = true;
    setScoringState((current) => ({ status: "loading", data: current.data, error: null }));
    getDebateScoring(id)
      .then((payload) => {
        if (!active) return;
        setScoringState({
          status: payload.status === "unavailable" ? "unavailable" : "loaded",
          data: payload,
          error: null
        });
      })
      .catch((exc) => {
        if (!active) return;
        setScoringState((current) => ({
          status: "error",
          data: current.data,
          error: exc instanceof Error ? exc.message : "Unable to load scoring"
        }));
      });
    return () => {
      active = false;
    };
  }, [id, scoringEnabled]);

  useEffect(() => {
    if (!scoringEnabled) return;
    let active = true;
    setAdaptiveDepthDryRunState((current) => ({ status: "loading", data: current.data, error: null }));
    getDebateAdaptiveDepthDryRun(id)
      .then((payload) => {
        if (!active) return;
        setAdaptiveDepthDryRunState(adaptiveDepthDryRunStateFromPayload(payload));
      })
      .catch((exc) => {
        if (!active) return;
        setAdaptiveDepthDryRunState((current) => ({
          status: "error",
          data: current.data,
          error: exc instanceof Error ? exc.message : "Unable to load adaptive depth dry-run"
        }));
      });
    return () => {
      active = false;
    };
  }, [id, scoringEnabled]);

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
  const { scoringByNodeId, scoringErrorsByNodeId } = useMemo(
    () => indexScoringResponse(scoringState.data),
    [scoringState.data]
  );
  const scoreAwareFilterNodeIds = useMemo(() => {
    if (scoreAwareFilter === "all") return null;
    if (scoreAwareFilter === "unavailable") {
      return new Set(Array.from(scoringErrorsByNodeId.keys()));
    }
    return new Set(
      Array.from(scoringByNodeId.values())
        .filter((scoring) => matchesScoreAwareFilter(scoring, scoreAwareFilter))
        .map((scoring) => scoring.node_id)
    );
  }, [scoreAwareFilter, scoringByNodeId, scoringErrorsByNodeId]);
  const selectedPathNodeIds = useMemo(
    () => new Set(findPathToNode(debate?.tree ?? null, selectedNodeId)),
    [debate?.tree, selectedNodeId]
  );
  const debateRecommendations = useMemo(
    () => collectRecommendedInvestigations(scoringState.data),
    [scoringState.data]
  );
  const scoringHolesSummary = useMemo(
    () => summarizeScoringHoles(scoringState.data),
    [scoringState.data]
  );
  const scoringFatalFlagsSummary = useMemo(
    () => summarizeScoringFatalFlags(scoringState.data),
    [scoringState.data]
  );
  const strongestUnresolvedScoringIssue = useMemo(
    () => selectStrongestUnresolvedScoringIssue(scoringState.data),
    [scoringState.data]
  );
  const scoringVisibility = useMemo(
    () =>
      formatScoringVisibilityState({
        enabled: scoringEnabled,
        hasActionToken: Boolean(actionToken),
        scoringStatus: scoringState.status,
        refreshStatus: scoringRefreshState.status,
        response: scoringState.data,
        error: scoringRefreshState.error || scoringState.error
      }),
    [actionToken, scoringEnabled, scoringRefreshState.error, scoringRefreshState.status, scoringState]
  );

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

  function canFocusRecommendationNode(targetNodeId: string): boolean {
    return Boolean(findNode(debate?.tree ?? null, targetNodeId));
  }

  function focusRecommendationNode(targetNodeId: string): boolean {
    if (!findNode(debate?.tree ?? null, targetNodeId)) {
      showToast("Recommendation target is no longer visible.");
      return false;
    }
    setView("tree");
    setSelectedNodeId(targetNodeId);
    setDetailNodeId(targetNodeId);
    return true;
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

  function scoringStatusMessage(): string | null {
    return formatScoringStatusCopy({
      enabled: scoringEnabled,
      scoringStatus: scoringState.status,
      refreshStatus: scoringRefreshState.status,
      responseStatus: scoringState.data?.status,
      reason: scoringState.data?.reason,
      error: scoringRefreshState.error || scoringState.error,
      cacheHit: scoringState.data?.cache?.hit,
      staleReason: scoringState.data?.cache?.stale?.reason,
      checkedAt: scoringState.data?.model_metadata?.checked_at,
      provider: scoringState.data?.model_metadata?.provider,
      model: scoringState.data?.model_metadata?.model
    });
  }

  function scoringRefreshDisabledReason(): string | null {
    if (!hasTree) return "Refresh scoring unavailable: this debate has no generated argument tree yet.";
    if (!actionToken) return "Refresh scoring unavailable: unlock actions with a user token to run manual scoring refresh.";
    if (scoringState.status === "loading") {
      return "Refresh scoring unavailable: waiting for persisted scoring state before starting another refresh.";
    }
    if (scoringRefreshBusy) return "Refresh scoring is already running.";
    return null;
  }

  async function refreshScoringFromJob() {
    if (!actionToken || scoringRefreshState.status === "starting") return;
    setScoringEnabled(true);
    setScoringRefreshState({ status: "starting", jobId: null, error: null });
    setScoringState((current) => ({ status: "loading", data: current.data, error: null }));
    setAdaptiveDepthDryRunState((current) => ({ status: "loading", data: current.data, error: null }));
    try {
      const job = await startDebateScoringRefresh(id, actionToken);
      setScoringRefreshState({ status: "starting", jobId: job.job_id, error: null });
      const completedJob = await waitForScoringJobCompletion(job.job_id);
      if (completedJob.status === "failed") {
        throw new Error(completedJob.error || "Scoring refresh failed.");
      }
      const payload = await getDebateScoring(id);
      setScoringState({
        status: payload.status === "unavailable" ? "unavailable" : "loaded",
        data: payload,
        error: null
      });
      try {
        const dryRunPayload = await getDebateAdaptiveDepthDryRun(id);
        setAdaptiveDepthDryRunState(adaptiveDepthDryRunStateFromPayload(dryRunPayload));
      } catch (exc) {
        setAdaptiveDepthDryRunState((current) => ({
          status: "error",
          data: current.data,
          error: exc instanceof Error ? exc.message : "Unable to load adaptive depth dry-run"
        }));
      }
      setScoringRefreshState({ status: "idle", jobId: null, error: null });
    } catch (exc) {
      const message = exc instanceof Error ? exc.message : "Unable to refresh scoring";
      setScoringState((current) => ({
        status: "error",
        data: current.data,
        error: message
      }));
      setScoringRefreshState((current) => ({
        status: "error",
        jobId: current.jobId,
        error: message
      }));
      setAdaptiveDepthDryRunState((current) => ({
        status: "error",
        data: current.data,
        error: message
      }));
    }
  }

  async function waitForScoringJobCompletion(jobId: string) {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (Date.now() < deadline) {
      const status = await getDebateScoringJobStatus(id, jobId);
      if (status.status === "complete" || status.status === "failed") return status;
      await new Promise((resolve) => window.setTimeout(resolve, 2_000));
    }
    throw new Error("Scoring refresh is still running after 10 minutes.");
  }

  async function approveAdaptiveDepthExpansion(selectedNodeIds: string[]) {
    if (!actionToken || selectedNodeIds.length === 0 || adaptiveDepthApprovalState.status === "starting") return;
    setAdaptiveDepthApprovalState({ status: "starting", error: null });
    try {
      const result = await approveDebateAdaptiveDepthExpansion(
        id,
        {
          debate_id: id,
          selected_node_ids: selectedNodeIds,
          approval_reason: "User approved adaptive depth expansion from dry-run recommendations."
        },
        actionToken
      );
      if (result.status === "unavailable") {
        setAdaptiveDepthApprovalState({
          status: "unavailable",
          error: result.reason || "Selected adaptive depth expansions are unavailable."
        });
        return;
      }
      setAdaptiveDepthApprovalState({ status: "queued", error: null });
      showToast(`Queued ${result.queued_node_ids.length} adaptive expansion${result.queued_node_ids.length === 1 ? "" : "s"}`);
      await refresh();
      try {
        const dryRunPayload = await getDebateAdaptiveDepthDryRun(id);
        setAdaptiveDepthDryRunState(adaptiveDepthDryRunStateFromPayload(dryRunPayload));
      } catch (exc) {
        setAdaptiveDepthDryRunState((current) => ({
          status: "error",
          data: current.data,
          error: exc instanceof Error ? exc.message : "Unable to load adaptive depth dry-run"
        }));
      }
    } catch (exc) {
      setAdaptiveDepthApprovalState({
        status: "error",
        error: exc instanceof Error ? exc.message : "Unable to approve adaptive depth expansion"
      });
    }
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
  const scoringRefreshBusy = scoringRefreshState.status === "starting";
  const scoringRefreshDisabled = !hasTree || !actionToken || scoringState.status === "loading" || scoringRefreshBusy;
  const scoringRefreshDisabledReasonText = scoringRefreshDisabled ? scoringRefreshDisabledReason() : null;
  const scoringStatusText = scoringStatusMessage();
  const scoringConfidenceText = scoringEnabled ? formatScoringConfidenceCopy() : null;
  return (
    <div
      className="debateView"
      data-scoring-state={scoringState.status}
      data-scoring-enabled={scoringEnabled}
      data-scoring-visibility={scoringVisibility.kind}
      data-scoring-node-count={scoringByNodeId.size}
      data-adaptive-depth-dry-run-state={adaptiveDepthDryRunState.status}
    >
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
          <ScoringErrorBoundary>
            <div className="topSwitch">
              <span>Scoring</span>
              <button
                type="button"
                className="switch"
                role="switch"
                aria-checked={scoringEnabled}
                aria-label="Toggle scoring"
                onClick={() => setScoringEnabled((current) => !current)}
              >
                <span className="knob" />
              </button>
              <button
                type="button"
                className="btn"
                disabled={scoringRefreshDisabled}
                onClick={refreshScoringFromJob}
              >
                {scoringRefreshBusy ? "Refreshing" : "Refresh scoring"}
              </button>
              {scoringRefreshDisabledReasonText ? <span className="topSwitchStatus">{scoringRefreshDisabledReasonText}</span> : null}
              {scoringStatusText ? <span className="topSwitchStatus">{scoringStatusText}</span> : null}
              {scoringConfidenceText ? <span className="topSwitchStatus">{scoringConfidenceText}</span> : null}
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
          {hasTree ? (
            <div className="segment" role="group" aria-label="View">
              <button type="button" aria-pressed={view === "tree"} onClick={() => setView("tree")}>
                Tree
              </button>
              <button type="button" aria-pressed={view === "outline"} onClick={() => setView("outline")}>
                Outline
              </button>
            </div>
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

      <ScoringErrorBoundary>
        <ScoringVisibilityPanel state={scoringVisibility} />
        <ScoringHolesSummaryPanel
          enabled={scoringEnabled}
          state={scoringState}
          holesSummary={scoringHolesSummary}
          fatalFlagsSummary={scoringFatalFlagsSummary}
          strongestIssue={strongestUnresolvedScoringIssue}
        />
        <ScoreAwareFilterPanel
          enabled={scoringEnabled}
          filter={scoreAwareFilter}
          matchCount={scoreAwareFilterNodeIds?.size ?? scoringByNodeId.size}
          scoredCount={scoringByNodeId.size}
          onChange={setScoreAwareFilter}
        />
        <RecommendedInvestigations
          recommendations={scoringEnabled ? debateRecommendations : []}
          canOpenTarget={canFocusRecommendationNode}
          onOpenTarget={focusRecommendationNode}
          emptyMessage={
            scoringEnabled
              ? "No recommended investigations are available from the current scoring data."
              : "Enable scoring to surface recommended investigations from scored nodes."
          }
        />
        <AdaptiveDepthDryRunPanel
          enabled={scoringEnabled}
          state={adaptiveDepthDryRunState}
          actionToken={actionToken}
          approvalState={adaptiveDepthApprovalState}
          onApprove={approveAdaptiveDepthExpansion}
        />
      </ScoringErrorBoundary>

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
        {view === "tree" && hasTree && debate.tree ? (
          <DebateCanvas
            root={debate.tree}
            expanded={expanded}
            selectedNodeId={selectedNodeId}
            scrutiny={scrutiny}
            scoringByNodeId={scoringByNodeId}
            scoringErrorsByNodeId={scoringErrorsByNodeId}
            scoreFilterNodeIds={scoringEnabled ? scoreAwareFilterNodeIds : null}
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
        ) : view === "outline" && hasTree && debate.tree ? (
          <DebateOutline
            root={debate.tree}
            selectedNodeId={selectedNodeId}
            selectedPathNodeIds={selectedPathNodeIds}
            scoringByNodeId={scoringByNodeId}
            scoringErrorsByNodeId={scoringErrorsByNodeId}
          />
        ) : singleShotResult ? (
          <SingleShotMain result={singleShotResult} />
        ) : (
          <div className="canvasEmpty">
            <p className="muted">
              {generating ? "Building the argument tree…" : "No argument tree was produced for this debate."}
            </p>
          </div>
        )}

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
          scoring={scoringByNodeId.get(detailNode.id)}
          scoringError={scoringErrorsByNodeId.get(detailNode.id)}
          token={actionToken}
          onClose={() => setDetailNodeId(null)}
          onChallenge={(anchor, text) => openChallenge(detailNode, anchor, text)}
          onFocusRecommendationNode={focusRecommendationNode}
          canFocusRecommendationNode={canFocusRecommendationNode}
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

      {scoringDiagnosticsOpen ? (
        <ScoringDiagnosticsDrawer
          scoringState={scoringState}
          refreshState={scoringRefreshState}
          onClose={() => setScoringDiagnosticsOpen(false)}
        />
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
              id="action-user-token"
              name="action-user-token"
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

function formatDebugValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") return "Unavailable";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function formatCacheDebug(cache: DebateScoringResponse["cache"]): string {
  if (!cache) return "Unavailable";
  const base = cache.hit ? "Hit" : "Miss";
  const staleReason = cache.stale?.reason;
  if (!staleReason) return base;
  return `${base}; stale: ${staleReason}`;
}

function ScoreAwareFilterPanel({
  enabled,
  filter,
  matchCount,
  scoredCount,
  onChange
}: {
  enabled: boolean;
  filter: ScoreAwareFilter;
  matchCount: number;
  scoredCount: number;
  onChange: (filter: ScoreAwareFilter) => void;
}) {
  return (
    <section className="progressStrip" aria-label="Score-aware navigation filters">
      <span className="progressLabel">Score-aware navigation</span>
      <div className="segment" role="group" aria-label="Score-aware filter">
        {SCORE_AWARE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            disabled={!enabled}
            onClick={() => onChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <span className="progressCount">
        {enabled
          ? `${matchCount} of ${scoredCount} scored nodes match`
          : "Enable scoring to filter by scored node signals."}
      </span>
    </section>
  );
}

function ScoringVisibilityPanel({ state }: { state: ScoringVisibilityState }) {
  return (
    <section className="progressStrip" aria-label="Scoring visibility state" data-scoring-visibility-kind={state.kind}>
      <span className="progressLabel">{state.title}</span>
      <span className="progressCount">{state.detail}</span>
    </section>
  );
}

function ScoringHolesSummaryPanel({
  enabled,
  state,
  holesSummary,
  fatalFlagsSummary,
  strongestIssue
}: {
  enabled: boolean;
  state: ScoringAsyncState;
  holesSummary: DebateScoringHoleSummary;
  fatalFlagsSummary: DebateScoringFatalFlagSummary;
  strongestIssue: DebateScoringUnresolvedIssue | null;
}) {
  const reason = state.error || state.data?.reason;

  if (!enabled) {
    return (
      <section className="progressStrip" aria-label="Scoring issue summary">
        <span className="progressLabel">Scoring issue summary unavailable</span>
        <span className="progressCount">Enable scoring to summarize unresolved holes and fatal flags from scored nodes.</span>
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section className="progressStrip" aria-label="Scoring issue summary">
        <span className="progressLabel">Loading scoring issue summary</span>
        <span className="progressCount">Waiting for scored nodes.</span>
      </section>
    );
  }

  if (state.status === "error" || state.status === "unavailable") {
    return (
      <section className="progressStrip" aria-label="Scoring issue summary">
        <span className="progressLabel">Scoring issue summary unavailable</span>
        <span className="progressCount">{reason || "No scoring payload is available."}</span>
      </section>
    );
  }

  if (!state.data) return null;

  if (holesSummary.total === 0 && fatalFlagsSummary.total === 0) {
    return (
      <section className="progressStrip" aria-label="Scoring issue summary">
        <span className="progressLabel">Scoring issue summary</span>
        <span className="progressCount">No unresolved scoring holes or fatal flags were returned by the current scoring payload.</span>
      </section>
    );
  }

  return (
    <section
      className="progressStrip"
      aria-label="Scoring issue summary"
      style={{ alignItems: "flex-start", gap: 12, minHeight: "auto", paddingTop: 8, paddingBottom: 8 }}
    >
      <div style={{ minWidth: 190 }}>
        <span className="progressLabel">Scoring issue summary</span>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {holesSummary.total} unresolved holes / {fatalFlagsSummary.total} fatal flags from {state.data.items.length} scored nodes
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {strongestIssue ? (
          <div className="pill" title={`${strongestIssue.claim}: ${strongestIssue.description}`}>
            <span>Strongest unresolved issue</span>
            <span>{strongestIssue.kind === "fatal_flag" ? "fatal" : "hole"}</span>
            <span>{strongestIssue.severity}</span>
            <span>{strongestIssue.type}</span>
            <span>{strongestIssue.nodeId}</span>
          </div>
        ) : null}
        <div className="pill" title="Severity counts from scoring payload holes">
          <span>Holes</span>
          <span>{holesSummary.bySeverity.high} high</span>
          <span>{holesSummary.bySeverity.medium} medium</span>
          <span>{holesSummary.bySeverity.low} low</span>
        </div>
        <div className="pill" title="Severity counts from scoring payload fatal flags">
          <span>Fatal flags</span>
          <span>{fatalFlagsSummary.bySeverity.high} high</span>
          <span>{fatalFlagsSummary.bySeverity.medium} medium</span>
          <span>{fatalFlagsSummary.bySeverity.low} low</span>
        </div>
        {fatalFlagsSummary.items.slice(0, 4).map((flag, index) => (
          <div
            key={`${flag.nodeId}-${flag.type}-${index}`}
            className="pill"
            title={`${flag.claim}: ${flag.description}`}
          >
            <span>fatal</span>
            <span>{flag.severity}</span>
            <span>{flag.type}</span>
            <span>{flag.nodeId}</span>
          </div>
        ))}
        {holesSummary.items.slice(0, 4).map((hole, index) => (
          <div
            key={`${hole.nodeId}-${hole.type}-${index}`}
            className="pill"
            title={`${hole.claim}: ${hole.description}`}
          >
            <span>{hole.severity}</span>
            <span>{hole.type}</span>
            <span>{hole.nodeId}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScoringDiagnosticsDrawer({
  scoringState,
  refreshState,
  onClose
}: {
  scoringState: ScoringAsyncState;
  refreshState: ScoringRefreshState;
  onClose: () => void;
}) {
  const data = scoringState.data;
  const error = refreshState.error || scoringState.error || data?.reason || "No scoring error reported.";
  const rows: Array<[string, string | number | boolean | null | undefined]> = [
    ["Frontend state", scoringState.status],
    ["Refresh state", refreshState.status],
    ["Backend status", data?.status],
    ["Provider", data?.model_metadata?.provider],
    ["Model", data?.model_metadata?.model],
    ["Checked at", data?.model_metadata?.checked_at],
    ["Generated at", data?.generated_at],
    ["Producer", data?.producer],
    ["Cache", formatCacheDebug(data?.cache)],
    ["Scored nodes", data?.scored_node_count],
    ["Skipped nodes", data?.skipped_node_count],
    ["Truncated", data?.truncated],
    ["Call count", "Not exposed by scoring API"],
    ["Latency", "Not exposed by scoring API"],
    ["Error", error]
  ];

  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside className="drawer scroll" role="dialog" aria-modal aria-label="Scoring diagnostics">
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <div className="nodeEyebrow">Developer diagnostics</div>
            <h2>Scoring diagnostics</h2>
          </div>
          <button type="button" className="iconBtn" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>
        <div className="drawerBody">
          <div className="drawerHintMuted">Only fields present in the frontend scoring payload are shown.</div>
          <ul className="drawerFindingList">
            {rows.map(([label, value]) => (
              <li key={label} className="drawerFindingItem">
                <div className="drawerFindingMeta">
                  <span>{label}</span>
                </div>
                <div className="drawerFindingText">{formatDebugValue(value)}</div>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}

function AdaptiveDepthDryRunPanel({
  enabled,
  state,
  actionToken,
  approvalState,
  onApprove
}: {
  enabled: boolean;
  state: AdaptiveDepthDryRunAsyncState;
  actionToken: string | null;
  approvalState: AdaptiveDepthApprovalState;
  onApprove: (selectedNodeIds: string[]) => void;
}) {
  const reason =
    state.error ||
    state.data?.reason ||
    (!enabled ? "Enable scoring to inspect the adaptive depth dry-run plan." : null);

  if (!enabled) {
    return (
      <section className="progressStrip" aria-label="Adaptive depth dry-run">
        <span className="progressLabel">Adaptive depth dry-run unavailable</span>
        <span className="progressCount">{reason}</span>
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section className="progressStrip" aria-label="Adaptive depth dry-run">
        <span className="progressLabel">Loading adaptive depth dry-run</span>
        <span className="progressCount">Read-only plan</span>
      </section>
    );
  }

  if (state.status === "error" || state.status === "unavailable") {
    return (
      <section className="progressStrip" aria-label="Adaptive depth dry-run">
        <span className="progressLabel">Adaptive depth dry-run unavailable</span>
        <span className="progressCount">{reason || "No dry-run plan is available."}</span>
      </section>
    );
  }

  if (!state.data) return null;

  const items = state.data.plan.items;
  const actionableItems = items.filter((item) => item.expansion_hint === "expand");
  const actionLocked = !actionToken;
  const actionBusy = approvalState.status === "starting";
  const actionDisabled = actionLocked || actionBusy || actionableItems.length === 0;
  const actionMessage = actionLocked
    ? "Unlock actions to approve adaptive expansion."
    : actionableItems.length === 0
      ? "No selected expand recommendations are available."
      : approvalState.status === "queued"
        ? "Adaptive expansion jobs queued."
        : approvalState.status === "unavailable" || approvalState.status === "error"
          ? approvalState.error
          : null;
  return (
    <section
      className="progressStrip"
      aria-label="Adaptive depth dry-run"
      style={{ alignItems: "flex-start", gap: 12, minHeight: "auto", paddingTop: 8, paddingBottom: 8 }}
    >
      <div style={{ minWidth: 190 }}>
        <span className="progressLabel">Adaptive depth dry-run</span>
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {state.data.plan.expansion_count} expansions from {state.data.plan.candidate_count} scored candidates
        </div>
      </div>
      {items.length === 0 ? (
        <span className="progressCount">No adaptive depth expansions are recommended from the current scoring data.</span>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {items.map((item) => (
            <AdaptiveDepthDryRunChip key={item.node_id} item={item} />
          ))}
        </div>
      )}
      <div style={{ display: "grid", gap: 4, marginLeft: "auto", minWidth: 190 }}>
        <button
          type="button"
          className="btn btnDark"
          disabled={actionDisabled}
          onClick={() => onApprove(actionableItems.map((item) => item.node_id))}
        >
          {actionBusy ? "Starting expansions" : "Approve and run selected expansions"}
        </button>
        {actionMessage ? (
          <span className="progressCount" style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
            {actionMessage}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function AdaptiveDepthDryRunChip({ item }: { item: AdaptiveDepthDryRunItem }) {
  const reasons = item.reasons.map(formatAdaptiveDepthReason);
  const recommendedDepthLabel =
    item.expansion_hint === "expand" ? "Recommended depth: expand" : "Recommended depth: review";

  return (
    <div
      title={reasons.join(", ") || "No listed reasons"}
      style={{
        display: "grid",
        gap: 6,
        width: 220,
        padding: "8px 10px",
        border: "1px solid oklch(0.88 0.03 75)",
        borderRadius: 6,
        background: item.expansion_hint === "expand" ? "oklch(0.97 0.03 118)" : "oklch(0.98 0.01 75)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="progressLabel">{formatAdaptiveDepthPressure(item.pressure)} pressure</span>
        <span className="progressCount">{formatAdaptiveDepthScore(item.score)}</span>
      </div>
      <div
        className="adaptiveDepthMeter"
        aria-label={`Adaptive depth score ${formatAdaptiveDepthScore(item.score)}`}
        style={{
          height: 5,
          overflow: "hidden",
          borderRadius: 4,
          background: "oklch(0.9 0.01 75)"
        }}
      >
        <div
          style={{
            width: formatAdaptiveDepthScore(item.score),
            height: "100%",
            borderRadius: 4,
            background:
              item.pressure === "high"
                ? "oklch(0.62 0.15 32)"
                : item.pressure === "medium"
                  ? "oklch(0.66 0.12 80)"
                  : "oklch(0.62 0.09 165)"
          }}
        />
      </div>
      <div className="progressCount" style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
        {recommendedDepthLabel} for {formatAdaptiveDepthAction(item.recommended_action).toLowerCase()}
      </div>
      <div className="progressCount" style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
        {item.hole_count} holes, {item.recommended_investigation_count} investigations, node {item.node_id}
      </div>
      {reasons.length > 0 ? (
        <div className="progressCount" style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
          {reasons.join("; ")}
        </div>
      ) : null}
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
