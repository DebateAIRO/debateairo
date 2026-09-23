"use client";

import { AiNotice } from "@/components/AiNotice";
import debateChromeEnglish from "@/messages/en/debateChrome.json";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  COOKIE_SESSION_MARKER,
  contractClient,
  getDebateAdaptiveDepthDryRun,
  getDebateBundle,
  getDebateScoring,
  validateSession
} from "@/lib/api";
import {
  ContractHttpError,
  type Answer,
  type ExecutionLedgerDigest,
  type Inspection,
  type InvestigationGap,
  type RunEvent
} from "@debateai/contract";
import {
  contractNodesById,
  liveDebateDetail,
  v3ScoringStatusLabel
} from "@/lib/v3/adapter";
import { buildAnswerExport, type AnswerExport } from "@/lib/v3/answerExport";
import { projectCanvasCensus } from "@/lib/v3/census";
import {
  measureDebateHeaderCollapse,
  observeDebateHeaderFit,
  readDebateHeaderGeometry
} from "@/lib/debateHeaderOverflow";
import { classifyTokenUnlockFailure } from "@/lib/v3/tokenUnlock";
import {
  applyRunEvent,
  createLiveRunState,
  liveTreeFromState,
  refreshTriggeredBy,
  type LiveRunState } from "@/lib/v3/liveEvents";
import { AnswerHonestyDrawer } from "@/components/AnswerHonestyDrawer";
import type {
  AdaptiveDepthDryRunItem,
  DebateAdaptiveDepthDryRunResponse,
  DebateDetail,
  DebateNode,
  DebateScoringResponse,
  DepthPressure,
  InvestigationAction,
  LifecycleDecision,
  NodeScoringPayload,
  RecommendedInvestigation,
  SingleShotResult
} from "@/lib/types";

import { BrandMark } from "@/components/TopBar";
import { DebateCanvas } from "@/components/DebateCanvas";
import { RecommendedInvestigations } from "@/components/RecommendedInvestigations";
import { DebateThread } from "@/components/DebateThread";
import { DebateSplit } from "@/components/DebateSplit";
import { DebateMap } from "@/components/DebateMap";
import { SynthesisPanel } from "@/components/SynthesisPanel";
import { VerdictBanner } from "@/components/VerdictBanner";
import { DebateWorkspaceDrawer } from "@/components/DebateWorkspaceDrawer";
import { NodeDetailDrawer } from "@/components/NodeDetailDrawer";
import { ChallengePopover } from "@/components/ChallengePopover";
import { InvestigationDrawer } from "@/components/InvestigationDrawer";
import { GuideModal } from "@/components/GuideModal";
import { ModeToggle } from "@/components/ModeToggle";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t, tPlural, type MessageCatalog } from "@/lib/i18n/translate";
import { Toast } from "@/components/Toast";
import {
  PublicationControl,type PrivateDeletionStatus
} from "@/components/PublicationControl";
import { ScoringErrorBoundary } from "@/components/ScoringErrorBoundary";
import { computeLean, countClaims, renderStateOf, treeDepth } from "@/lib/debatePresentation";
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

export function debateAfterRunTerminalFailure(debate: DebateDetail, reason: string): DebateDetail {
  return {
    ...debate,
    status: "failed",
    run_state: "FAILED",
    completion: { state: "failed", reasonCode: reason, humanReason: null }
  };
}

type SynthesisDraft = {
  model_id?: string;
  worker_id?: string;
  raw: string;
};

type StateUpdate<T> = T | ((current: T) => T);

export type DebatePageRunEventConsumerInput = {
  runRef: string;
  readLive: () => LiveRunState;
  writeLive: (next: LiveRunState) => void;
  hasAnswer: () => boolean;
  updateDebate: (update: (current: DebateDetail | null) => DebateDetail | null) => void;
  updateSynthesisDraft: (update: StateUpdate<SynthesisDraft | null>) => void;
  writeError: (next: string | null) => void;
  refresh: (answerExpected?: boolean) => void | Promise<void>;
  catalog?: MessageCatalog;
};

/** The single event-consumption seam used by the live stream and render tests. */
export function createDebatePageRunEventConsumer(input: DebatePageRunEventConsumerInput): (event: RunEvent) => void {
  return (event) => {
    const next = applyRunEvent(input.readLive(), event);
    input.writeLive(next);
    if (!input.hasAnswer()) {
      const tree = liveTreeFromState(next, input.runRef, "");
      if (tree) input.updateDebate((current) => input.hasAnswer()
        ? current
        : { ...liveDebateDetail(input.runRef, tree), run_state: current?.run_state === "FAILED" ? "FAILED" : "RUNNING" });
    }
    if (event.event_type === "serve.composition_started") {
      input.updateSynthesisDraft({ raw: "" });
    } else if (event.event_type === "serve.composition_delta") {
      input.updateSynthesisDraft((current) => ({
        model_id: current?.model_id,
        worker_id: current?.worker_id,
        raw: next.compositionText
      }));
    } else if (event.event_type === "node.failed") {
      input.writeError(t(input.catalog ?? debateChromeEnglish, "debateChrome.error.claimGenerationFailed"));
    } else if (event.event_type === "node.retrying") {
      input.writeError(null);
    } else if (event.event_type === "run.terminal") {
      if (next.terminalFailure !== null) {
        input.updateDebate((current) => current === null
          ? current
          : debateAfterRunTerminalFailure(current, next.terminalFailure!));
      }
      input.writeError(next.terminalFailure === null
        ? null
        : t(input.catalog ?? debateChromeEnglish, "debateChrome.error.debateGenerationFailed", {
            reason: next.terminalFailure
          }));
    }
    if (refreshTriggeredBy(event.event_type)) void input.refresh(event.event_type === "run.terminal");
  };
}

type StreamState = {
  status: "connecting" | "live" | "reconnecting";
  retryInMs?: number;
};

export type ScoringAsyncState =
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

const SCORE_AWARE_FILTERS = [
  { id: "all", key: "debateChrome.filter.all" },
  { id: "issues", key: "debateChrome.filter.issues" },
  { id: "weak_uncertain", key: "debateChrome.filter.weakUncertain" },
  { id: "decisive", key: "debateChrome.filter.decisive" },
  { id: "unavailable", key: "debateChrome.filter.unavailable" }
] as const;

type ScoreAwareFilter = (typeof SCORE_AWARE_FILTERS)[number]["id"];

/**
 * "overview" is the published verdict-first summary and exists only in public
 * mode. V's ruling of 2026-09-20: a visitor lands on the conclusion and the
 * argument tree is one click away, so the overview is its own view rather than
 * something that replaces Tree.
 */
type DebateView = "overview" | "thread" | "split" | "tree" | "map";

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

function findNode(root: DebateNode | null, id: string | null): DebateNode | null {
  if (!root || !id) return null;
  if (root.id === id) return root;
  for (const child of root.children || []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
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

function formatAdaptiveDepthAction(
  action: InvestigationAction | null,
  catalog: MessageCatalog = debateChromeEnglish
): string {
  switch (action) {
    case "challenge": return t(catalog, "debateChrome.adaptiveDepth.action.challenge");
    case "support": return t(catalog, "debateChrome.adaptiveDepth.action.support");
    case "find_evidence": return t(catalog, "debateChrome.adaptiveDepth.action.findEvidence");
    case "decompose": return t(catalog, "debateChrome.adaptiveDepth.action.decompose");
    case "ask_user": return t(catalog, "debateChrome.adaptiveDepth.action.askUser");
    case null: return t(catalog, "debateChrome.adaptiveDepth.action.review");
  }
}

function formatAdaptiveDepthReason(reason: string): string {
  return reason.replace(/_/g, " ");
}

function formatAdaptiveDepthPressure(
  pressure: DepthPressure,
  catalog: MessageCatalog = debateChromeEnglish
): string {
  switch (pressure) {
    case "low": return t(catalog, "debateChrome.adaptiveDepth.pressure.low");
    case "medium": return t(catalog, "debateChrome.adaptiveDepth.pressure.medium");
    case "high": return t(catalog, "debateChrome.adaptiveDepth.pressure.high");
  }
}

function formatAdaptiveDepthScore(score: number): string {
  const percent = Math.max(0, Math.min(100, Math.round(score * 100)));
  return `${percent}%`;
}

function compactNodeId(nodeId: string): string {
  return nodeId.length > 13 ? `${nodeId.slice(0, 8)}...` : nodeId;
}

function adaptiveDepthDryRunStateFromPayload(
  payload: DebateAdaptiveDepthDryRunResponse,
  catalog: MessageCatalog = debateChromeEnglish
): AdaptiveDepthDryRunAsyncState {
  if (payload.status === "unavailable") {
    return {
      status: "unavailable",
      data: payload,
      error: payload.reason || t(catalog, "debateChrome.adaptiveDepth.unavailableDetail")
    };
  }
  return { status: "loaded", data: payload, error: null };
}

function localizedTokenUnlockFailure(error: unknown, catalog: MessageCatalog): string {
  const failure = classifyTokenUnlockFailure(error);
  if (failure.kind === "REJECTED") return t(catalog, "debateChrome.token.rejected");
  if (failure.kind === "UNREACHABLE") return t(catalog, "debateChrome.token.unreachable");
  if (failure.kind === "UNCLASSIFIED") return t(catalog, "debateChrome.token.unclassified");
  if (error instanceof ContractHttpError) {
    if (error.code === "RATE_LIMITED") return t(catalog, "debateChrome.token.rateLimited");
    if (error.code === "SERVER_FAILURE") {
      return t(catalog, "debateChrome.token.serverFailure", { status: error.status });
    }
    if (error.code === "NOT_FOUND") {
      return t(catalog, "debateChrome.token.endpointMissing", { status: error.status });
    }
  }
  return t(catalog, "debateChrome.token.replyUnreadable");
}

function localizedAnswerExport(
  answerExport: AnswerExport,
  ledgerError: string | null,
  catalog: MessageCatalog
): AnswerExport {
  if (answerExport.available) {
    return {
      ...answerExport,
      label: t(catalog, "debateChrome.export.label"),
      toast: t(catalog, "debateChrome.export.toast")
    };
  }
  switch (answerExport.reason) {
    case "NO_SERVED_ANSWER":
      return { ...answerExport, message: t(catalog, "debateChrome.export.noServedAnswer") };
    case "LEDGER_DIGEST_PENDING":
      return { ...answerExport, message: t(catalog, "debateChrome.export.ledgerPending") };
    case "LEDGER_DIGEST_UNREADABLE":
      return {
        ...answerExport,
        message: t(catalog, "debateChrome.export.ledgerUnreadable", {
          error: ledgerError ?? t(catalog, "debateChrome.export.unknownLedgerError")
        })
      };
  }
}

function localizedPendingProgressCopy(
  live: LiveRunState,
  stream: StreamState,
  catalog: MessageCatalog,
  locale: string
): string {
  const total = live.nodeOrder.length;
  const settled = live.nodeOrder.filter((ref) => {
    const lifecycle = live.nodes[ref]?.lifecycle;
    return lifecycle === "scored" || lifecycle === "complete";
  }).length;
  const noEvidence = live.runPhase === "idle" && total === 0;
  if (stream.status === "connecting" && noEvidence) {
    return t(catalog, "debateChrome.progress.connecting");
  }

  const parts: string[] = [];
  if (live.servePhase === "composing" || live.servePhase === "conformance") {
    parts.push(t(catalog, "debateChrome.progress.composing"));
  } else if (total > 0) {
    parts.push(t(catalog, "debateChrome.progress.debating"));
  } else {
    parts.push(t(catalog, live.runPhase === "planning"
      ? "debateChrome.progress.planning"
      : "debateChrome.progress.accepted"));
  }
  if (total > 0) {
    parts.push(settled > 0
      ? tPlural(catalog, "debateChrome.progress.nodesSettled", total, locale, { settled, total })
      : tPlural(catalog, "debateChrome.progress.nodesInPlay", total, locale, { total }));
  }
  if (stream.status === "reconnecting") {
    const seconds = Math.max(1, Math.round((stream.retryInMs ?? 1000) / 1000));
    parts.push(tPlural(catalog, "debateChrome.progress.reconnecting", seconds, locale, { seconds }));
  }
  return t(catalog, "debateChrome.progress.summary", { parts: parts.join(" — ") });
}

function localizedScoringVisibility(
  visibility: ScoringVisibilityState,
  scoringStatus: ScoringAsyncState["status"],
  refreshStatus: ScoringRefreshState["status"],
  response: DebateScoringResponse | null,
  error: string | null,
  catalog: MessageCatalog,
  locale: string
): ScoringVisibilityState {
  const reason = error || response?.reason || null;
  const scoredCount = response?.scored_node_count ?? response?.items?.length ?? 0;
  const unavailableCount = response?.errors?.length ?? 0;
  const persisted = scoredCount > 0
    ? tPlural(catalog, "debateChrome.scoring.persistedClaim", scoredCount, locale, { count: scoredCount })
    : t(catalog, "debateChrome.scoring.noPersistedClaims");

  if (visibility.kind === "off") {
    return {
      kind: visibility.kind,
      title: t(catalog, "debateChrome.scoring.offTitle"),
      detail: t(catalog, "debateChrome.scoring.offDetail")
    };
  }
  if (visibility.kind === "refreshing") {
    const loadingPersisted = scoringStatus === "loading" && refreshStatus === "idle";
    const detail = loadingPersisted
      ? t(catalog, "debateChrome.scoring.readingPersisted")
      : scoredCount > 0
        ? t(catalog, "debateChrome.scoring.generatingWithRetained", { persisted })
        : t(catalog, "debateChrome.scoring.generatingJudgeOutputs");
    return {
      kind: visibility.kind,
      title: t(catalog, loadingPersisted
        ? "debateChrome.scoring.loadingTitle"
        : "debateChrome.scoring.inProgressTitle"),
      detail
    };
  }
  if (visibility.kind === "empty") {
    return {
      kind: visibility.kind,
      title: t(catalog, "debateChrome.scoring.pending"),
      detail: t(catalog, "debateChrome.scoring.noJudgeOutputsYet")
    };
  }
  if (visibility.kind === "provider_required") {
    return {
      kind: visibility.kind,
      title: t(catalog, "debateChrome.scoring.providerRequired"),
      detail: reason ?? t(catalog, "debateChrome.scoring.noPayload")
    };
  }
  if (visibility.kind === "unavailable") {
    const isV3ScoringAbsence = v3ScoringStatusLabel(reason) !== null;
    return {
      kind: visibility.kind,
      title: isV3ScoringAbsence
        ? t(catalog, "debateChrome.scoring.graphScoredNoV2Endpoint")
        : t(catalog, "debateChrome.scoring.unavailableTitle"),
      detail: isV3ScoringAbsence
        ? t(catalog, "debateChrome.scoring.graphScoredNoV2EndpointDetail")
        : reason ?? t(catalog, "debateChrome.scoring.noPayload")
    };
  }
  if (response?.status === "partial") {
    const detail = unavailableCount > 0
      ? t(catalog, "debateChrome.scoring.partialDetail", {
          persisted,
          unavailable: tPlural(
            catalog,
            "debateChrome.scoring.unavailableClaim",
            unavailableCount,
            locale,
            { count: unavailableCount }
          )
        })
      : t(catalog, "debateChrome.scoring.detailSentence", { detail: persisted });
    return {
      kind: visibility.kind,
      title: t(catalog, "debateChrome.scoring.partialTitle"),
      detail
    };
  }
  return {
    kind: visibility.kind,
    title: t(catalog, "debateChrome.scoring.realScoresTitle"),
    detail: scoredCount > 0
      ? tPlural(catalog, "debateChrome.scoring.realScoresDetail", scoredCount, locale, { count: scoredCount })
      : t(catalog, "debateChrome.scoring.noPersistedClaimsAvailable")
  };
}

export default function DebatePageClient({
  id,
  initialDebate,
  initialAnswer = null,
  initialError = null,
  initialPending = false,
  timeCatalog,
  debateChromeCatalog = debateChromeEnglish,
  publicMode = false,
  publicNodesById = null,
  publicExport = null,
  renderPublicHonesty = null,
  publicOverview = null,
  publicHeader = null
}: {
  id: string;
  initialDebate: DebateDetail | null;
  /** UI-01: the raw V3 answer behind initialDebate — the honesty surfaces render from it. */
  initialAnswer?: Answer | null;
  initialError?: string | null;
  // True when the SSR fetch failed transiently (coordinator timeout/unreachable).
  // This is NOT an error: the page renders a loading/connecting state and the
  // client polling/stream below retries. Only a definitive failure sets
  // initialError, which is the sole seed of the fatal `error && !debate` gate.
  initialPending?: boolean;
  timeCatalog: MessageCatalog;
  debateChromeCatalog?: MessageCatalog;
  /**
   * Public read-only mode. A published debate is the same workspace seen by a
   * stranger: identical chrome, identical views, identical panels — minus every
   * affordance that needs an owner session. One component, so the public page
   * can never drift away from the private one.
   */
  publicMode?: boolean;
  /** Public projections, supplied by the caller because the public envelope is not an Answer. */
  publicNodesById?: ReturnType<typeof contractNodesById> | null;
  publicExport?: AnswerExport | null;
  renderPublicHonesty?: ((close: () => void) => ReactNode) | null;
  /** Turn 3b publication overview, rendered as the public Tree view. */
  publicOverview?: ((actions: Readonly<{
    onDetails: () => void;
    onRead: (nodeId: string) => void;
  }>) => ReactNode) | null;
  /**
   * Published-answer header: pseudonym, published date, badges, residual
   * objections and the indexing disclosure. These have no other public home,
   * so the public page supplies them and the workspace renders them under the
   * chrome.
   */
  publicHeader?: ReactNode;
}) {
  const { catalog: chromeCatalog, locale } = useChromeI18n();
  const [debate, setDebate] = useState<DebateDetail | null>(initialDebate);
  const [answer, setAnswer] = useState<Answer | null>(initialAnswer);
  const [live, setLive] = useState<LiveRunState>(createLiveRunState);
  const [ledgerDigest, setLedgerDigest] = useState<ExecutionLedgerDigest | null>(null);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [inspectionError, setInspectionError] = useState<string | null>(null);
  const [honestyOpen, setHonestyOpen] = useState(false);
  const [honestyActionState, setHonestyActionState] = useState<string | null>(null);
  const lowStrengthThreshold: number | undefined = undefined;
  const [investigationInput, setInvestigationInput] = useState<Record<string, string>>({});
  const [privateDeletionStatus,setPrivateDeletionStatus]=useState<PrivateDeletionStatus|null>(null);
  const privateDeletionRef=useRef<PrivateDeletionStatus|null>(null);
  const liveRef = useRef<LiveRunState>(createLiveRunState());
  const answerRef = useRef<Answer | null>(initialAnswer);
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
  const [scoreAwareFilter, setScoreAwareFilter] = useState<ScoreAwareFilter>("all");
  const [actionToken, setActionToken] = useState<string | null>(null);

  const [view, setView] = useState<DebateView>(publicMode && publicOverview ? "overview" : "tree");
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
  const [scoringDiagnosticsOpen, setScoringDiagnosticsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const canvasElRef = useRef<HTMLDivElement | null>(null);
  const debateHeaderRef = useRef<HTMLElement | null>(null);
  const debateHeaderIdentityRef = useRef<HTMLDivElement | null>(null);
  const debateHeaderClaimRef = useRef<HTMLDivElement | null>(null);
  const debateHeaderTitleMeasureRef = useRef<HTMLSpanElement | null>(null);
  const debateHeaderControlsRef = useRef<HTMLDivElement | null>(null);
  const debateHeaderInlineActionsRef = useRef<HTMLDivElement | null>(null);
  const [headerActionsCollapsed, setHeaderActionsCollapsed] = useState(false);

  const refresh = useCallback(async (answerExpected = false) => {
    if (privateDeletionRef.current!==null) return;
    try {
      const bundle = await getDebateBundle(id, COOKIE_SESSION_MARKER, contractClient, {
        answerExpected,
        currentAnswer: answerRef.current
      });
      if (privateDeletionRef.current!==null) return;
      if (bundle.kind === "served") {
        answerRef.current = bundle.answer;
        setAnswer(bundle.answer);
        setDebate(bundle.detail);
        // V3 composes prose into the served answer itself; a live composition
        // draft is superseded the moment a settled answer arrives.
        if (bundle.detail.synthesis) setSynthesisDraft(null);
      } else {
        setDebate((current) => current?.id === bundle.detail.id && current.tree?.children.length
          ? { ...current, run_state: bundle.detail.run_state, status: bundle.detail.status }
          : bundle.detail);
      }
      // Self-heal: recovered data must always clear any stale error banner/fatal
      // screen (e.g. a transient SSR coordinator timeout, or an earlier failed
      // poll). Without this, a debate that arrives after a transient failure
      // would stay stuck behind an old error (see the `error && !debate` gate).
      setError(bundle.kind === "failed"
        ? t(debateChromeCatalog, "debateChrome.error.debateGenerationFailed", {
            reason: bundle.run.terminal_reason ?? ""
          })
        : null);
    } catch (exc) {
      if (privateDeletionRef.current!==null) return;
      // Existing in-flight runs resolve through the loading bundle above.
      // A remaining NOT_FOUND therefore means neither a visible run nor a
      // visible answer exists, and must remain an honest fatal result.
      setError(exc instanceof ContractHttpError
        ? exc.code
        : exc instanceof Error
          ? exc.message
          : t(debateChromeCatalog, "debateChrome.error.unableToLoadDebate"));
    }
  }, [debateChromeCatalog, id]);

  const purgePrivateDebate=useCallback((status:PrivateDeletionStatus)=>{
    privateDeletionRef.current=status;
    setPrivateDeletionStatus(status);
    answerRef.current=null;
    liveRef.current=createLiveRunState();
    setDebate(null);setAnswer(null);setLive(createLiveRunState());
    setLedgerDigest(null);setLedgerError(null);setInspection(null);setInspectionError(null);
    setHonestyOpen(false);setHonestyActionState(null);setInvestigationInput({});
    setSynthesisDraft(null);setError(null);setStreamState({ status:"connecting" });
    setScoringState({ status:"idle",data:null,error:null });
    setScoringRefreshState({ status:"idle",jobId:null,error:null });
    setAdaptiveDepthDryRunState({ status:"idle",data:null,error:null });
    setExpanded(new Set());setCollapsed(new Set());setFocusNodeId(null);
    setSelectedNodeId(null);setDetailNodeId(null);setPopover(null);setInvestigation(null);
    setScrutiny({});setWorkspaceOpen(false);setScoringDiagnosticsOpen(false);
    setGuideOpen(false);setToast(null);
  },[]);

  const debateTerminal = debate
    ? isComplete(debate.status) || (debate.status || "").toLowerCase() === "failed"
    : false;

  useEffect(() => {
    if (publicMode) return;
    if (privateDeletionStatus!==null) return;
    refresh();
  }, [publicMode,privateDeletionStatus,refresh]);

  useEffect(() => {
    setScoringState({ status: "idle", data: null, error: null });
    setScoringRefreshState({ status: "idle", jobId: null, error: null });
    setAdaptiveDepthDryRunState({ status: "idle", data: null, error: null });
  }, [id]);

  useEffect(() => {
    if (privateDeletionStatus!==null) return;
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
          error: exc instanceof Error
            ? exc.message
            : t(debateChromeCatalog, "debateChrome.error.unableToLoadScoring")
        }));
      });
    return () => {
      active = false;
    };
  }, [debateChromeCatalog,id,privateDeletionStatus]);

  useEffect(() => {
    if (privateDeletionStatus!==null) return;
    let active = true;
    if (publicMode) return;
    setAdaptiveDepthDryRunState((current) => ({ status: "loading", data: current.data, error: null }));
    getDebateAdaptiveDepthDryRun(id)
      .then((payload) => {
        if (!active) return;
        setAdaptiveDepthDryRunState(adaptiveDepthDryRunStateFromPayload(payload, debateChromeCatalog));
      })
      .catch((exc) => {
        if (!active) return;
        setAdaptiveDepthDryRunState((current) => ({
          status: "error",
          data: current.data,
          error: exc instanceof Error
            ? exc.message
            : t(debateChromeCatalog, "debateChrome.error.unableToLoadAdaptiveDepth")
        }));
      });
    return () => {
      active = false;
    };
  }, [debateChromeCatalog,id,privateDeletionStatus]);

  useEffect(() => {
    if (publicMode) return;
    let active = true;
    async function validateCookieSession() {
      try {
        await validateSession();
        if (active) setActionToken(COOKIE_SESSION_MARKER);
      } catch (error) {
        if (active) {
          setActionToken(null);
          setError(localizedTokenUnlockFailure(error, debateChromeCatalog));
        }
      }
    }
    void validateCookieSession();
    return () => {
      active = false;
    };
  }, [debateChromeCatalog, publicMode]);

  // UI-01 data-access swap: V2's coordinator EventSource becomes the V3 run
  // stream (cookie-authenticated fetch streaming — EventSource cannot carry
  // the authenticated same-origin cookie request). Every V3 event lands in the pure live-state
  // translator; while no settled answer exists, the tree the stream described
  // is materialized into the SAME debate state the V2 views already render.
  useEffect(() => {
    if (publicMode) return;
    if (privateDeletionStatus!==null) return;
    const runRef = answerRef.current?.run_ref ?? id;

    const consume = createDebatePageRunEventConsumer({
      runRef,
      readLive: () => liveRef.current,
      writeLive: (next) => {
        liveRef.current = next;
        setLive(next);
      },
      hasAnswer: () => answerRef.current !== null,
      updateDebate: setDebate,
      updateSynthesisDraft: setSynthesisDraft,
      writeError: setError,
      refresh,
      catalog: debateChromeCatalog
    });

    if (debateTerminal) {
      // Settled run: replay the recorded stream once so the honesty surfaces
      // (investigation gaps, cycle refusals, honesty/ledger events) render
      // without holding a live connection open.
      let active = true;
      contractClient
        .readEvents(runRef)
        .then((events) => {
          if (!active) return;
          let state = createLiveRunState();
          for (const event of events) state = applyRunEvent(state, event);
          liveRef.current = state;
          setLive(state);
        })
        .catch((failure) => {
          if (!active) return;
          setHonestyActionState(
            failure instanceof ContractHttpError
              ? t(debateChromeCatalog, "debateChrome.error.recordedReplayUnavailableWithCode", {
                  code: failure.code
                })
              : t(debateChromeCatalog, "debateChrome.error.recordedReplayUnavailable")
          );
        });
      return () => {
        active = false;
      };
    }

    let stopped = false;
    let timer: number | null = null;
    let attempt = 0;
    const controller = new AbortController();

    function scheduleReconnect() {
      if (stopped || timer) return;
      const delay = Math.min(30000, 1000 * 2 ** attempt);
      attempt += 1;
      setStreamState({ status: "reconnecting", retryInMs: delay });
      timer = window.setTimeout(connect, delay);
    }

    function connect() {
      timer = null;
      setStreamState({ status: "connecting" });
      let opened = false;
      contractClient
        .streamEvents(
          runRef,
          (event) => {
            if (!opened) {
              opened = true;
              attempt = 0;
              setStreamState({ status: "live" });
              // Live stream (re)connected: clear any stale transient error so
              // recovered data is never masked by an old banner/fatal screen.
              setError(null);
              void refresh();
            }
            consume(event);
          },
          controller.signal
        )
        .then(() => {
          if (stopped) return;
          // The stream closed. If the run reached terminal we are done —
          // refresh() pulls the settled projection; otherwise reconnect.
          if (liveRef.current.runPhase === "terminal") {
            void refresh(true);
            return;
          }
          void refresh();
          scheduleReconnect();
        })
        .catch((failure) => {
          if (stopped || controller.signal.aborted) return;
          if (failure instanceof ContractHttpError && (failure.code === "NOT_FOUND" || failure.code === "SESSION_REQUIRED" || failure.code === "FORBIDDEN")) {
            // Terminal stream refusal: this run is not visible to this asker.
            setError(failure.code);
            return;
          }
          void refresh();
          scheduleReconnect();
        });
    }

    connect();
    return () => {
      stopped = true;
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [answer?.run_ref,debateChromeCatalog,debateTerminal,id,privateDeletionStatus,refresh]);

  // Honesty surfaces: the execution-ledger digest rides every settled answer.
  useEffect(() => {
    if (answer === null) return;
    let active = true;
    contractClient
      .readLedgerDigest(answer.answer_id)
      .then((digest) => {
        if (!active) return;
        setLedgerDigest(digest);
        setLedgerError(null);
      })
      .catch((failure) => {
        if (!active) return;
        setLedgerError(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
      });
    return () => {
      active = false;
    };
  }, [answer]);

  const showInspection = useCallback(async () => {
    if (answerRef.current === null) return;
    try {
      setInspection(await contractClient.readInspection(
        answerRef.current.answer_id,
        answerRef.current.answer_version
      ));
      setInspectionError(null);
    } catch (failure) {
      setInspectionError(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
    }
  }, []);

  const unlinkMemory = useCallback(async () => {
    if (answerRef.current === null) return;
    try {
      await contractClient.unlinkMemory(answerRef.current.answer_id);
      setHonestyActionState("MEMORY_UNLINKED");
      await refresh();
    } catch (failure) {
      setHonestyActionState(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
    }
  }, [refresh]);

  const recordInvestigation = useCallback(
    async (gap: InvestigationGap) => {
      if (answerRef.current === null) return;
      const verbatim = investigationInput[gap.gap_ref] ?? "";
      try {
        const accepted = await contractClient.recordInvestigation(
          answerRef.current.answer_id,
          gap.gap_ref,
          { user_input: gap.accepts_user_input && verbatim.length > 0 ? verbatim : null, human_steer_input: true }
        );
        setHonestyActionState(`${accepted.status} · replay ${accepted.replay_handle}`);
      } catch (failure) {
        setHonestyActionState(failure instanceof ContractHttpError ? failure.code : "NETWORK_FAILURE");
      }
    },
    [investigationInput]
  );

  // UI-01: V2's export.md endpoint does not exist in V3. The export is the
  // S14 shape — the served answer plus its honesty artifacts, verbatim — and
  // it keeps S14's DUAL GATE: no affordance, and no "+ ledger" claim, until
  // the execution-ledger digest is actually in hand. One decision serves both
  // the top bar and the honesty drawer so the label can never outrun the
  // payload.
  const answerExport = useMemo(
    () => publicMode
      ? (publicExport ?? {
          available: false,
          reason: "NO_SERVED_ANSWER",
          message: t(debateChromeCatalog, "debateChrome.error.exportUnavailable")
        } as const)
      : localizedAnswerExport(
          buildAnswerExport({ answer, ledgerDigest, ledgerError, live }),
          ledgerError,
          debateChromeCatalog
        ),
    [answer, debateChromeCatalog, ledgerDigest, ledgerError, live, publicExport, publicMode]
  );
  const v3NodeById = useMemo(
    () => publicMode ? publicNodesById : (answer === null ? null : contractNodesById(answer)),
    [publicMode, publicNodesById, answer]
  );
  // The honesty surface exists in both modes; only its contents differ.
  const honestyAvailable = publicMode ? renderPublicHonesty !== null : answer !== null;
  const canvasCensus = useMemo(() => answer === null ? null : projectCanvasCensus(answer), [answer]);
  const synthesisRaw = synthesisDraft?.raw || "";
  const strongestPro =
    debate?.synthesis?.strongest_pro || partialJsonField(synthesisRaw, "strongest_pro") || partialJsonField(synthesisRaw, "title") || "";
  const strongestCon = debate?.synthesis?.strongest_con || partialJsonField(synthesisRaw, "strongest_con") || "";
  // UI-01: V3 streams the composition as plain prose (never a JSON envelope),
  // so the raw draft itself is the honest live fallback after the V2 JSON
  // field probes find nothing.
  const verdict =
    debate?.synthesis?.verdict ||
    partialJsonField(synthesisRaw, "verdict") ||
    partialJsonField(synthesisRaw, "content") ||
    synthesisRaw ||
    "";
  const synthesisStreaming = Boolean(synthesisDraft && !debate?.synthesis);
  const synthesisProvenance = debate?.synthesis?.provenance || {};
  const synthesisSections = [
    { title: t(debateChromeCatalog, "debateChrome.synthesis.agreements"), items: stringList(synthesisProvenance.agreements) },
    { title: t(debateChromeCatalog, "debateChrome.synthesis.tensions"), items: stringList(synthesisProvenance.tensions) },
    { title: t(debateChromeCatalog, "debateChrome.synthesis.evidenceGaps"), items: stringList(synthesisProvenance.evidence_gaps) },
    { title: t(debateChromeCatalog, "debateChrome.synthesis.keyTakeaways"), items: stringList(synthesisProvenance.key_takeaways) }
  ].filter((section) => section.items.length > 0);
  // P4.1: prefer the backend-computed lean (coordinator/app/scoring/lean.py --
  // propagated DF-QuAD strength split when usable, else a labeled structural
  // count fallback). `synthesis.provenance.lean` was investigated and
  // confirmed vestigial (no backend path ever wrote it), so it is no longer
  // read; computeLean(debate.tree) is now only a client-side fallback for
  // payloads cached before the top-level `lean` field existed -- i.e. the
  // key is genuinely absent (`undefined`), NOT merely null. A present-but-
  // null backend `lean` is itself an honest answer (no live PRO/CON node
  // yet) and must not be overridden by a looser client-side recomputation.
  const backendLean = debate?.lean;
  const lean =
    backendLean === undefined
      ? debate?.synthesis
        ? computeLean(debate.tree, debateChromeCatalog)
        : null
      : backendLean && typeof backendLean.pct === "number" && typeof backendLean.label === "string"
        ? {
            pct: backendLean.pct,
            label: backendLean.label,
            source: backendLean.source === "dialectical" ? ("dialectical" as const) : ("structural" as const)
          }
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
    if (!hasTree) return {
      pct: 6,
      label: t(debateChromeCatalog, "debateChrome.progress.decomposingClaim"),
      count: ""
    };
    let total = 0;
    let done = 0;
    const walk = (node: DebateNode) => {
      if (node.node_type !== "ROOT_CLAIM") {
        total += 1;
        const state = renderStateOf(node);
        // "failed" is terminal too: a degraded debate must not report a
        // forever-stuck progress percentage.
        if (state === "done" || state === "empty" || state === "failed") done += 1;
      }
      (node.children || []).forEach(walk);
    };
    if (debate.tree) walk(debate.tree);
    if (total === 0 && !complete) {
      const label = statusLabel(debate.run_state ?? "generating", timeCatalog);
      return { pct: null, label, count: "" };
    }
    const pct = total ? Math.round((done / total) * 100) : 100;
    return {
      pct,
      label: t(debateChromeCatalog, "debateChrome.progress.modelsArguing"),
      count: `${pct}%`
    };
  }, [debate, debateChromeCatalog, hasTree, complete, timeCatalog]);

  const hasArtifacts = Boolean(
    debate &&
      (singleShotResult ||
        debate.analyzer_runs.length ||
        debate.selected_skills.length ||
        debate.selected_agents.length ||
        debate.agent_runs.length)
  );

  useLayoutEffect(() => {
    const header = debateHeaderRef.current;
    const identity = debateHeaderIdentityRef.current;
    const claim = debateHeaderClaimRef.current;
    const titleMeasure = debateHeaderTitleMeasureRef.current;
    const controls = debateHeaderControlsRef.current;
    const inlineActions = debateHeaderInlineActionsRef.current;
    if (!header || !identity || !claim || !titleMeasure || !controls || !inlineActions) return;

    const measureHeaderFit = () => {
      const geometry = readDebateHeaderGeometry({
        header,
        identity,
        claim,
        titleMeasure,
        controls
      }, (element) => window.getComputedStyle(element));
      const fit = measureDebateHeaderCollapse(geometry);
      setHeaderActionsCollapsed(fit.collapse);
    };

    measureHeaderFit();
    // Same guard CanvasViewport already applies: environments without
    // ResizeObserver still get the one-shot measurement above, they just do
    // not get live re-measurement.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureHeaderFit);
    return observeDebateHeaderFit({
      observer,
      targets: [header, titleMeasure, inlineActions],
      resizeTarget: window,
      measure: measureHeaderFit
    });
  }, [answerExport.available, debate?.completion?.humanReason, debate?.status, debate?.topic, hasArtifacts, hasTree]);

  const detailNode = findNode(debate?.tree ?? null, detailNodeId);
  const { scoringByNodeId, scoringErrorsByNodeId } = useMemo(
    () => indexScoringResponse(scoringState.data),
    [scoringState.data]
  );
  // W5a: bounded (latest-per-node) decision provenance, indexed for the
  // drawer's "Path decision" line. Absent on older cached/SSR payloads.
  const lifecycleDecisionByNodeId = useMemo(() => {
    const map = new Map<string, LifecycleDecision>();
    for (const decision of debate?.lifecycleDecisions ?? []) {
      map.set(decision.nodeId, decision);
    }
    return map;
  }, [debate?.lifecycleDecisions]);
  const { feedbackSummaryByNodeId, currentUserFeedbackByNodeId } = useMemo(
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
  const scoringVisibility = useMemo(() => {
    const visibility = formatScoringVisibilityState({
        enabled: true,
        hasActionToken: Boolean(actionToken),
        scoringStatus: scoringState.status,
        refreshStatus: scoringRefreshState.status,
        response: scoringState.data,
        error: scoringRefreshState.error || scoringState.error
      });
    return localizedScoringVisibility(
      visibility,
      scoringState.status,
      scoringRefreshState.status,
      scoringState.data,
      scoringRefreshState.error || scoringState.error,
      debateChromeCatalog,
      locale
    );
  }, [actionToken, debateChromeCatalog, locale, scoringRefreshState.error, scoringRefreshState.status, scoringState]);

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
    showToast(t(debateChromeCatalog, "debateChrome.toast.replayingGeneration"));
  }

  function openChallenge(node: DebateNode, anchor: HTMLElement, text = "") {
    if (publicMode) return;
    const rect = anchor.getBoundingClientRect();
    setPopover({ nodeId: node.id, x: rect.left + rect.width / 2, y: rect.top - 8, text });
  }

  // Thread, Split and Canvas each render a Challenge affordance only when they
  // are handed a handler. Withholding it is what makes the public view
  // read-only — a no-op handler would still paint a dead button.
  const challengeProps = publicMode
    ? {}
    : { onChallengeNode: (node: DebateNode, anchor: HTMLElement) => openChallenge(node, anchor) };

  function onProseSelect(node: DebateNode, _event: MouseEvent) {
    if (publicMode) return;
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
      showToast(t(debateChromeCatalog, "debateChrome.toast.recommendationNoLongerVisible"));
      return false;
    }
    setView("tree");
    setSelectedNodeId(targetNodeId);
    setDetailNodeId(targetNodeId);
    return true;
  }

  function rejectActionToken() {
    setActionToken(null);
  }

  function scoringStatusMessage(): string | null {
    return formatScoringStatusCopy({
      enabled: true,
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
    }, debateChromeCatalog);
  }

  // Fatal dead-end ONLY for a definitive error with no data. A transient SSR
  // failure never reaches here: it leaves error null (pending), so it falls
  // through to the loading/connecting state below and the client retries.
  if (privateDeletionStatus!==null) {
    return (
      <div className="screen scroll"><div className="screenInner narrow">
        <p className="eyebrow">{t(debateChromeCatalog, "debateChrome.privateDebate")}</p>
        <h1>{privateDeletionStatus==="CLEANED"
          ? t(debateChromeCatalog, "debateChrome.privateDebateDeleted")
          : t(debateChromeCatalog, "debateChrome.privateDebateDeletionProcessing")}</h1>
        <p role="status">{privateDeletionStatus==="CLEANED"
          ? t(debateChromeCatalog, "debateChrome.privateDebateDeletedDetail")
          : t(debateChromeCatalog, "debateChrome.privateDebateDeletionProcessingDetail")}</p>
        <Link className="btn" href="/">{t(debateChromeCatalog, "debateChrome.backToLibrary")}</Link>
      </div></div>
    );
  }
  if (error && !debate) {
    return (
      <div className="screen scroll">
        <div className="screenInner narrow">
          <div className="error">{error}</div>
          <Link className="btn" href="/" style={{ marginTop: 16 }}>
            {t(debateChromeCatalog, "debateChrome.backToLibrary")}
          </Link>
        </div>
      </div>
    );
  }
  if (!debate) {
    return (
      <div className="screen scroll">
        <div className="screenInner narrow">
          <p className="muted" role="status">
            {initialPending
              ? localizedPendingProgressCopy(live, streamState, debateChromeCatalog, locale)
              : t(debateChromeCatalog, "debateChrome.loading")}
          </p>
        </div>
      </div>
    );
  }

  const statusKind = complete ? "pillOk" : generating ? "pillGen" : "";
  const scoringStatusText = scoringStatusMessage();
  const scoringConfidenceText = formatScoringConfidenceCopy(debateChromeCatalog);
  const scoringInsightsExpandable = scoringState.status === "loaded" && scoringByNodeId.size > 0;
  return (
    <div
      className="debateView"
      data-public-mode={publicMode ? "true" : "false"}
      data-scoring-state={scoringState.status}
      data-scoring-enabled={true}
      data-scoring-visibility={scoringVisibility.kind}
      data-scoring-node-count={scoringByNodeId.size}
      data-adaptive-depth-dry-run-state={adaptiveDepthDryRunState.status}
      data-actions-collapsed={headerActionsCollapsed ? "true" : "false"}
    >
      {/* ---- top bar ---- */}
      <header className="debateTopBar" data-debate-reference-chrome ref={debateHeaderRef}>
        <div className="debateTopIdentityRow" ref={debateHeaderIdentityRef}>
          <BrandMark />
          <span className="debateTopDivider" aria-hidden />
          <div className="debateTopClaim" ref={debateHeaderClaimRef}>
            <span className="debateTopTitle">{debate.topic}</span>
            <span className="debateTopTitle debateTopTitleMeasure" aria-hidden ref={debateHeaderTitleMeasureRef}>
              {debate.topic}
            </span>
            <span className={`pill ${statusKind}`}>
              <span className="dot" />
              {statusLabel(debate.run_state ?? debate.status, timeCatalog)}
            </span>
            {debate.completion?.humanReason ? (
              <span className="topSwitchStatus" role="status" title={debate.completion.humanReason}>
                {debate.completion.humanReason}
              </span>
            ) : null}
          </div>
        </div>
        <div className="debateTopControlRow" ref={debateHeaderControlsRef}>
          {publicMode ? (
            <span className="publicViewPill"><span aria-hidden>🔒</span> {t(chromeCatalog, "chrome.publicViewLocked")}</span>
          ) : null}
          {/* Scoring diagnostics is a read-only drawer, so the public reader
              keeps it: "actions locked" withholds writes, not evidence. */}
          <ScoringErrorBoundary>
            <button
              type="button"
              className="debateScoringPill"
              data-debate-scoring-pill
              aria-label={t(chromeCatalog, "chrome.openScoringDiagnostics")}
              onClick={() => setScoringDiagnosticsOpen(true)}
            >
              <span className="debateScoringDot" aria-hidden />
              {t(chromeCatalog, "chrome.scoring", { scored: scoringByNodeId.size, total: countClaims(debate.tree) })}
            </button>
          </ScoringErrorBoundary>
          {hasTree ? (
            <div className="segment" role="group" aria-label={t(chromeCatalog, "chrome.view")}>
              {publicMode && publicOverview ? (
                <button type="button" aria-pressed={view === "overview"} onClick={() => setView("overview")}>
                  {t(chromeCatalog, "chrome.overview")}
                </button>
              ) : null}
              <button type="button" aria-pressed={view === "thread"} onClick={() => setView("thread")}>
                {t(chromeCatalog, "chrome.thread")}
              </button>
              <button
                type="button"
                aria-pressed={view === "split"}
                onClick={() => {
                  setFocusNodeId((current) => current ?? debate.tree?.children[0]?.id ?? debate.tree?.id ?? null);
                  setView("split");
                }}
              >
                {t(chromeCatalog, "chrome.split")}
              </button>
              <button type="button" aria-pressed={view === "tree"} onClick={() => setView("tree")}>
                {t(chromeCatalog, "chrome.tree")}
              </button>
              <button type="button" aria-pressed={view === "map"} onClick={() => setView("map")}>
                {t(chromeCatalog, "chrome.map")}
              </button>
            </div>
          ) : null}
          <LanguageSwitcher />
          <ModeToggle compact />
          <div className="debateUtilityActions" ref={debateHeaderInlineActionsRef}>
            <Link className="btnGhost debateOverflowAction" href="/" aria-label={t(chromeCatalog, "chrome.library")}>
              <span aria-hidden>←</span><span className="debateActionLabel">{t(chromeCatalog, "chrome.library")}</span>
            </Link>
            {hasTree && !publicMode ? (
              <button type="button" className="btn debateOverflowAction" onClick={replayGeneration} title={t(chromeCatalog, "chrome.replayGeneration")} aria-label={t(chromeCatalog, "chrome.replay")}>
                <span aria-hidden>↻</span><span className="debateActionLabel">{t(chromeCatalog, "chrome.replay")}</span>
              </button>
            ) : null}
            {hasArtifacts && !publicMode ? (
              <button type="button" className="btn debateOverflowAction" onClick={() => setWorkspaceOpen(true)} aria-label={t(chromeCatalog, "chrome.workspace")}>
                <span aria-hidden>◫</span><span className="debateActionLabel">{t(chromeCatalog, "chrome.workspace")}</span>
              </button>
            ) : null}
            {honestyAvailable ? (
              <button type="button" className="btn debateOverflowAction" onClick={() => setHonestyOpen(true)} aria-label={t(chromeCatalog, "chrome.honesty")}>
                <span aria-hidden>◈</span><span className="debateActionLabel">{t(chromeCatalog, "chrome.honesty")}</span>
              </button>
            ) : null}
            {answerExport.available ? (
              <a className="btn debateOverflowAction" href={answerExport.href} download={answerExport.filename} title={answerExport.label} onClick={() => showToast(answerExport.toast)} aria-label={t(chromeCatalog, "chrome.export")}>
                <span aria-hidden>↓</span><span className="debateActionLabel">{t(chromeCatalog, "chrome.export")}</span>
              </a>
            ) : null}
            <button type="button" className="iconBtn debateOverflowAction" aria-label={t(chromeCatalog, "chrome.howItWorks")} onClick={() => setGuideOpen(true)}>?</button>
            {publicMode ? null : <Link className="iconBtn debateOverflowAction" href="/settings" aria-label={t(chromeCatalog, "chrome.settings")}>⚙</Link>}
          </div>
          <details className="debateUtilityOverflow">
            <summary className="iconBtn" role="button" aria-label={t(chromeCatalog, "chrome.moreDebateActions")} title={t(chromeCatalog, "chrome.moreDebateActions")}>
              <span aria-hidden>⋯</span>
            </summary>
            <div className="debateOverflowMenu">
              <Link className="btnGhost debateOverflowAction" href="/" aria-label={t(chromeCatalog, "chrome.library")}>
                <span aria-hidden>←</span><span className="debateActionLabel">{t(chromeCatalog, "chrome.library")}</span>
              </Link>
              {hasTree && !publicMode ? (
                <button type="button" className="btn debateOverflowAction" onClick={replayGeneration} title={t(chromeCatalog, "chrome.replayGeneration")} aria-label={t(chromeCatalog, "chrome.replay")}>
                  <span aria-hidden>↻</span><span className="debateActionLabel">{t(chromeCatalog, "chrome.replay")}</span>
                </button>
              ) : null}
              {hasArtifacts && !publicMode ? (
                <button type="button" className="btn debateOverflowAction" onClick={() => setWorkspaceOpen(true)} aria-label={t(chromeCatalog, "chrome.workspace")}>
                  <span aria-hidden>◫</span><span className="debateActionLabel">{t(chromeCatalog, "chrome.workspace")}</span>
                </button>
              ) : null}
              {honestyAvailable ? (
                <button type="button" className="btn debateOverflowAction" onClick={() => setHonestyOpen(true)} aria-label={t(chromeCatalog, "chrome.honesty")}>
                  <span aria-hidden>◈</span><span className="debateActionLabel">{t(chromeCatalog, "chrome.honesty")}</span>
                </button>
              ) : null}
              {answerExport.available ? (
                <a className="btn debateOverflowAction" href={answerExport.href} download={answerExport.filename} title={answerExport.label} onClick={() => showToast(answerExport.toast)} aria-label={t(chromeCatalog, "chrome.export")}>
                  <span aria-hidden>↓</span><span className="debateActionLabel">{t(chromeCatalog, "chrome.export")}</span>
                </a>
              ) : null}
              <button type="button" className="iconBtn debateOverflowAction" aria-label={t(chromeCatalog, "chrome.howItWorks")} onClick={() => setGuideOpen(true)}>?</button>
              {publicMode ? null : <Link className="iconBtn debateOverflowAction" href="/settings" aria-label={t(chromeCatalog, "chrome.settings")}>⚙</Link>}
            </div>
          </details>
        </div>
      </header>

      <div className="debateAiDisclosure">
        <AiNotice body={t(debateChromeCatalog, "debateChrome.aiNotice")} catalog={chromeCatalog} />
      </div>
      {publicMode && publicHeader ? publicHeader : null}

      {/* ---- verdict-first banner (flag-gated: NEXT_PUBLIC_VERDICT_FIRST_UI) ---- */}
      {!publicMode && process.env.NEXT_PUBLIC_VERDICT_FIRST_UI === "true" ? <VerdictBanner verdict={debate.verdict} /> : null}

      <ScoringErrorBoundary>
        {scoringInsightsExpandable ? (
          <details className="scoringInsightsPanel">
            <summary className="scoringInsightsSummary">
              <span className="progressLabel">{t(debateChromeCatalog, "debateChrome.scoring.insights")}</span>
              <span className="progressCount">{scoringVisibility.title}</span>
              <span className="scoringInsightsDetail">{scoringVisibility.detail}</span>
              {scoringStatusText || scoringConfidenceText ? (
                <span className="scoringInsightsStatus" data-mobile-scoring-status="true">
                  {scoringStatusText ? <span>{scoringStatusText}</span> : null}
                  {scoringConfidenceText ? <span>{scoringConfidenceText}</span> : null}
                </span>
              ) : null}
            </summary>
            <div className="scoringInsightsBody scroll">
              <ScoringVisibilityPanel state={scoringVisibility} catalog={debateChromeCatalog} />
              <ScoringHolesSummaryPanel
                enabled={true}
                state={scoringState}
                holesSummary={scoringHolesSummary}
                fatalFlagsSummary={scoringFatalFlagsSummary}
                strongestIssue={strongestUnresolvedScoringIssue}
                catalog={debateChromeCatalog}
              />
              <ScoreAwareFilterPanel
                enabled={true}
                filter={scoreAwareFilter}
                matchCount={scoreAwareFilterNodeIds?.size ?? scoringByNodeId.size}
                scoredCount={scoringByNodeId.size}
                onChange={setScoreAwareFilter}
                catalog={debateChromeCatalog}
              />
              <RecommendedInvestigations
                recommendations={debateRecommendations}
                canOpenTarget={canFocusRecommendationNode}
                onOpenTarget={focusRecommendationNode}
                emptyMessage={
                  t(debateChromeCatalog, "debateChrome.scoring.noRecommendedInvestigations")
                }
              />
              <AdaptiveDepthDryRunPanel
                enabled={true}
                state={adaptiveDepthDryRunState}
                catalog={debateChromeCatalog}
              />
            </div>
          </details>
        ) : (
          <section
            className="scoringInsightsPanel scoringInsightsPanelCompact"
            aria-label={t(debateChromeCatalog, "debateChrome.scoring.insights")}
            data-scoring-insights-compact="true"
          >
            <div className="scoringInsightsSummary">
              <span className="progressLabel">{t(debateChromeCatalog, "debateChrome.scoring.insights")}</span>
              <span className="progressCount">{scoringVisibility.title}</span>
              <span className="scoringInsightsDetail">{scoringVisibility.detail}</span>
              {scoringStatusText || scoringConfidenceText ? (
                <span className="scoringInsightsStatus" data-mobile-scoring-status="true">
                  {scoringStatusText ? <span>{scoringStatusText}</span> : null}
                  {scoringConfidenceText ? <span>{scoringConfidenceText}</span> : null}
                </span>
              ) : null}
            </div>
            <AdaptiveDepthDryRunPanel
              enabled={true}
              state={adaptiveDepthDryRunState}
              catalog={debateChromeCatalog}
            />
          </section>
        )}
      </ScoringErrorBoundary>

      {/* ---- generation progress strip ---- */}
      {generating ? (
        <div className="progressStrip">
          <span className="progressLabel">{progress.label}</span>
          <div className="progressTrack" aria-busy={progress.pct === null ? true : undefined}>
            {progress.pct === null ? (
              <div className="progressFill progressFillIndeterminate" />
            ) : (
                <div className="progressFill" style={{ width: `${progress.pct}%` }} />
            )}
          </div>
          {progress.pct === null ? null : <span className="progressCount">{progress.count}</span>}
        </div>
      ) : null}

      {error ? (
        <div className="debateError">
          <div className="error">{error}</div>
        </div>
      ) : null}

      {/* ---- main split ---- */}
      {publicMode && view === "overview" && publicOverview ? publicOverview({
        onDetails: () => setHonestyOpen(true),
        onRead: (nodeId) => {
          setSelectedNodeId(nodeId);
          setDetailNodeId(nodeId);
        }
      }) : <div className="debateMain">
        <div key={`${view}-${replayNonce}`} className="fadeup" style={{ flex: 1, minWidth: 0, display: "flex" }}>
          {hasTree && debate.tree ? (
            view === "thread" ? (
              <DebateThread
                root={debate.tree}
                expanded={expanded}
                collapsed={collapsed}
                scrutiny={scrutiny}
                v3NodesById={v3NodeById ?? undefined}
                meta={{ nodes: countClaims(debate.tree), depth: treeDepth(debate.tree) }}
                onOpenNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setDetailNodeId(nodeId);
                }}
                {...challengeProps}
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
                v3NodesById={v3NodeById ?? undefined}
                onFocus={setFocusNodeId}
                onOpenNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setDetailNodeId(nodeId);
                }}
                {...challengeProps}
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
                scoringByNodeId={scoringByNodeId}
                scoringErrorsByNodeId={scoringErrorsByNodeId}
                scoreFilterNodeIds={scoreAwareFilterNodeIds}
                v3NodesById={v3NodeById}
                lowStrengthThreshold={lowStrengthThreshold}
                meta={{
                  claims: canvasCensus?.claims ?? countClaims(debate.tree),
                  depth: treeDepth(debate.tree),
                  judged: canvasCensus?.judged ?? 0,
                  derivedStanding: canvasCensus?.derivedStanding ?? 0,
                  setAside: canvasCensus?.setAside ?? 0
                }}
                canvasRef={(el) => {
                  canvasElRef.current = el;
                }}
                onOpenNode={(nodeId) => {
                  setSelectedNodeId(nodeId);
                  setDetailNodeId(nodeId);
                }}
                {...challengeProps}
                onToggleExpand={toggleExpand}
                onProseSelect={onProseSelect}
              />
            )
          ) : singleShotResult ? (
            <SingleShotMain result={singleShotResult} catalog={debateChromeCatalog} />
          ) : (
            <div className="canvasEmpty">
              <p className="muted">
                {generating
                  ? t(debateChromeCatalog, "debateChrome.tree.building")
                  : t(debateChromeCatalog, "debateChrome.tree.notProduced")}
              </p>
            </div>
          )}
        </div>

        <SynthesisPanel
          ready={complete}
          pending={generating}
          streaming={synthesisStreaming}
          structured={Boolean(
            // UI-01: V3 supplies no strongest-pro/strongest-con projections, so
            // a served answer with neither renders in V2's own verdict-led
            // "structured" mode instead of two forever-"Pending" stance cards.
            debate?.synthesis && !strongestCon.trim() && (synthesisSections.length > 0 || !strongestPro.trim())
          )}
          proClaim={strongestPro}
          conClaim={strongestCon}
          verdict={verdict}
          verdictGate={
            process.env.NEXT_PUBLIC_VERDICT_FIRST_UI === "true" ? debate.synthesis?.verdict_gate : undefined
          }
          meta={synthesisMeta}
          lean={lean}
          sections={synthesisSections}
        />
      </div>}

      {/* ---- overlays ---- */}
      {detailNode ? (
        <NodeDetailDrawer
          node={detailNode}
          v3={v3NodeById?.get(detailNode.id)}
          scoring={scoringByNodeId.get(detailNode.id)}
          scoringError={scoringErrorsByNodeId.get(detailNode.id)}
          feedbackSummary={feedbackSummaryByNodeId.get(detailNode.id)}
          currentUserFeedback={currentUserFeedbackByNodeId.get(detailNode.id)}
          lifecycleDecision={lifecycleDecisionByNodeId.get(detailNode.id)}
          token={publicMode ? null : actionToken}
          onClose={() => setDetailNodeId(null)}
          {...(publicMode
            ? {}
            : { onChallenge: (anchor: HTMLElement, text: string) => openChallenge(detailNode, anchor, text) })}
          onFocusRecommendationNode={focusRecommendationNode}
          canFocusRecommendationNode={canFocusRecommendationNode}
          onQueued={() => {
            showToast(t(debateChromeCatalog, "debateChrome.toast.regenerationQueued"));
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

      {honestyOpen && publicMode ? renderPublicHonesty?.(() => setHonestyOpen(false)) : null}

      {honestyOpen && !publicMode && answer ? (
        <AnswerHonestyDrawer
          answer={answer}
          live={live}
          ledgerDigest={ledgerDigest}
          ledgerError={ledgerError}
          inspection={inspection}
          inspectionError={inspectionError}
          onShowInspection={() => void showInspection()}
          onUnlinkMemory={() => void unlinkMemory()}
          actionState={honestyActionState}
          investigationInput={investigationInput}
          onInvestigationInput={(gapRef, value) =>
            setInvestigationInput((current) => ({ ...current, [gapRef]: value }))
          }
          onRecordInvestigation={(gap) => void recordInvestigation(gap)}
          answerExport={answerExport}
          token={actionToken}
          onClose={() => setHonestyOpen(false)}
        />
      ) : null}

      {scoringDiagnosticsOpen ? (
        <ScoringDiagnosticsDrawer
          scoringState={scoringState}
          refreshState={scoringRefreshState}
          onClose={() => setScoringDiagnosticsOpen(false)}
          catalog={debateChromeCatalog}
        />
      ) : null}

      {debate && !publicMode ? <PublicationControl
        runId={answer?.run_ref ?? id}
        onPrivateDeletion={purgePrivateDebate}
      /> : null}
      {guideOpen ? <GuideModal onClose={() => setGuideOpen(false)} /> : null}

      {toast ? <Toast message={toast} /> : null}

      {/* S5: the only browser credential is the server-set HttpOnly cookie.
          A public reader is not missing a session — they need none — so the
          dock states an owner-mode fact and stays out of the public page. */}
      {publicMode ? null : (
        <div className="tokenDock">
          <span className="btn" aria-live="polite">
            {t(
              debateChromeCatalog,
              actionToken ? "debateChrome.session.signedIn" : "debateChrome.session.required"
            )}
          </span>
        </div>
      )}
    </div>
  );
}

function formatDebugValue(
  value: string | number | boolean | null | undefined,
  catalog: MessageCatalog = debateChromeEnglish
): string {
  if (value === null || value === undefined || value === "") {
    return t(catalog, "debateChrome.scoring.unavailable");
  }
  if (typeof value === "boolean") {
    return t(catalog, value ? "debateChrome.scoring.yes" : "debateChrome.scoring.no");
  }
  return String(value);
}

function formatCacheDebug(
  cache: DebateScoringResponse["cache"],
  catalog: MessageCatalog = debateChromeEnglish
): string {
  if (!cache) return t(catalog, "debateChrome.scoring.unavailable");
  const base = t(
    catalog,
    cache.hit ? "debateChrome.scoring.cacheHit" : "debateChrome.scoring.cacheMiss"
  );
  const staleReason = cache.stale?.reason;
  if (!staleReason) return base;
  return t(catalog, "debateChrome.scoring.cacheStale", { base, reason: staleReason });
}

function ScoreAwareFilterPanel({
  enabled,
  filter,
  matchCount,
  scoredCount,
  onChange,
  catalog = debateChromeEnglish
}: {
  enabled: boolean;
  filter: ScoreAwareFilter;
  matchCount: number;
  scoredCount: number;
  onChange: (filter: ScoreAwareFilter) => void;
  catalog?: MessageCatalog;
}) {
  return (
    <section className="progressStrip" aria-label={t(catalog, "debateChrome.scoring.navigationFilters")}>
      <span className="progressLabel">{t(catalog, "debateChrome.scoring.navigation")}</span>
      <div className="segment" role="group" aria-label={t(catalog, "debateChrome.scoring.filter")}>
        {SCORE_AWARE_FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={filter === item.id}
            disabled={!enabled}
            onClick={() => onChange(item.id)}
          >
            {t(catalog, item.key)}
          </button>
        ))}
      </div>
      <span className="progressCount">
        {enabled
          ? t(catalog, "debateChrome.scoring.matches", { matches: matchCount, total: scoredCount })
          : t(catalog, "debateChrome.scoring.filterRequiresData")}
      </span>
    </section>
  );
}

function ScoringVisibilityPanel({
  state,
  catalog = debateChromeEnglish
}: {
  state: ScoringVisibilityState;
  catalog?: MessageCatalog;
}) {
  return (
    <section
      className="progressStrip"
      aria-label={t(catalog, "debateChrome.scoring.visibilityState")}
      data-scoring-visibility-kind={state.kind}
    >
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
  strongestIssue,
  catalog = debateChromeEnglish
}: {
  enabled: boolean;
  state: ScoringAsyncState;
  holesSummary: DebateScoringHoleSummary;
  fatalFlagsSummary: DebateScoringFatalFlagSummary;
  strongestIssue: DebateScoringUnresolvedIssue | null;
  catalog?: MessageCatalog;
}) {
  const reason = state.error || state.data?.reason;

  if (!enabled) {
    return (
      <section className="progressStrip" aria-label={t(catalog, "debateChrome.scoring.issueSummary")}>
        <span className="progressLabel">{t(catalog, "debateChrome.scoring.issueSummaryUnavailable")}</span>
        <span className="progressCount">{t(catalog, "debateChrome.scoring.issueSummaryRequiresData")}</span>
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section className="progressStrip" aria-label={t(catalog, "debateChrome.scoring.issueSummary")}>
        <span className="progressLabel">{t(catalog, "debateChrome.progress.loadingScoringSummary")}</span>
        <span className="progressCount">{t(catalog, "debateChrome.progress.waitingForScoredClaims")}</span>
      </section>
    );
  }

  if (state.status === "error" || state.status === "unavailable") {
    return (
      <section className="progressStrip" aria-label={t(catalog, "debateChrome.scoring.issueSummary")}>
        <span className="progressLabel">{t(catalog, "debateChrome.scoring.issueSummaryUnavailable")}</span>
        <span className="progressCount">{reason || t(catalog, "debateChrome.scoring.noPayload")}</span>
      </section>
    );
  }

  if (!state.data) return null;

  if (holesSummary.total === 0 && fatalFlagsSummary.total === 0) {
    return (
      <section className="progressStrip" aria-label={t(catalog, "debateChrome.scoring.issueSummary")}>
        <span className="progressLabel">{t(catalog, "debateChrome.scoring.issueSummary")}</span>
        <span className="progressCount">{t(catalog, "debateChrome.scoring.noUnresolvedIssues")}</span>
      </section>
    );
  }

  return (
    <section
      className="progressStrip scoringIssueStrip"
      aria-label={t(catalog, "debateChrome.scoring.issueSummary")}
    >
      <div className="scoringIssueIntro">
        <span className="progressLabel">{t(catalog, "debateChrome.scoring.issueSummary")}</span>
        <div className="scoringIssueSubcopy">
          {t(catalog, "debateChrome.scoring.issueCounts", {
            holes: holesSummary.total,
            fatalFlags: fatalFlagsSummary.total,
            claims: state.data.items.length
          })}
        </div>
      </div>
      <div className="scoringIssuePills">
        {strongestIssue ? (
          <div className="pill scoringIssuePill" title={`${strongestIssue.claim}: ${strongestIssue.description}`}>
            <span>{t(catalog, "debateChrome.scoring.strongestUnresolvedIssue")}</span>
            <span>{t(
              catalog,
              strongestIssue.kind === "fatal_flag"
                ? "debateChrome.scoring.fatal"
                : "debateChrome.scoring.hole"
            )}</span>
            <span>{strongestIssue.severity}</span>
            <span>{strongestIssue.type}</span>
            <span title={strongestIssue.nodeId}>{compactNodeId(strongestIssue.nodeId)}</span>
          </div>
        ) : null}
        <div className="pill scoringIssuePill" title={t(catalog, "debateChrome.scoring.holeSeverityTitle")}>
          <span>{t(catalog, "debateChrome.scoring.holes")}</span>
          <span>{t(catalog, "debateChrome.scoring.highCount", { count: holesSummary.bySeverity.high })}</span>
          <span>{t(catalog, "debateChrome.scoring.mediumCount", { count: holesSummary.bySeverity.medium })}</span>
          <span>{t(catalog, "debateChrome.scoring.lowCount", { count: holesSummary.bySeverity.low })}</span>
        </div>
        <div className="pill scoringIssuePill" title={t(catalog, "debateChrome.scoring.fatalFlagSeverityTitle")}>
          <span>{t(catalog, "debateChrome.scoring.fatalFlags")}</span>
          <span>{t(catalog, "debateChrome.scoring.highCount", { count: fatalFlagsSummary.bySeverity.high })}</span>
          <span>{t(catalog, "debateChrome.scoring.mediumCount", { count: fatalFlagsSummary.bySeverity.medium })}</span>
          <span>{t(catalog, "debateChrome.scoring.lowCount", { count: fatalFlagsSummary.bySeverity.low })}</span>
        </div>
        {fatalFlagsSummary.items.slice(0, 4).map((flag, index) => (
          <div
            key={`${flag.nodeId}-${flag.type}-${index}`}
            className="pill scoringIssuePill"
            title={`${flag.claim}: ${flag.description}`}
          >
            <span>{t(catalog, "debateChrome.scoring.fatal")}</span>
            <span>{flag.severity}</span>
            <span>{flag.type}</span>
            <span title={flag.nodeId}>{compactNodeId(flag.nodeId)}</span>
          </div>
        ))}
        {holesSummary.items.slice(0, 4).map((hole, index) => (
          <div
            key={`${hole.nodeId}-${hole.type}-${index}`}
            className="pill scoringIssuePill"
            title={`${hole.claim}: ${hole.description}`}
          >
            <span>{hole.severity}</span>
            <span>{hole.type}</span>
            <span title={hole.nodeId}>{compactNodeId(hole.nodeId)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function ScoringDiagnosticsDrawer({
  scoringState,
  refreshState,
  onClose,
  catalog = debateChromeEnglish
}: {
  scoringState: ScoringAsyncState;
  refreshState: ScoringRefreshState;
  onClose: () => void;
  catalog?: MessageCatalog;
}) {
  const data = scoringState.data;
  const error = refreshState.error || scoringState.error || data?.reason ||
    t(catalog, "debateChrome.error.noScoringError");
  const rows: Array<[string, string | number | boolean | null | undefined]> = [
    [t(catalog, "debateChrome.scoring.frontendState"), scoringState.status],
    [t(catalog, "debateChrome.scoring.refreshState"), refreshState.status],
    [t(catalog, "debateChrome.scoring.payloadStatus"), data?.status],
    [t(catalog, "debateChrome.scoring.provider"), data?.model_metadata?.provider],
    [t(catalog, "debateChrome.scoring.model"), data?.model_metadata?.model],
    [t(catalog, "debateChrome.scoring.checkedAt"), data?.model_metadata?.checked_at],
    [t(catalog, "debateChrome.scoring.generatedAt"), data?.generated_at],
    [t(catalog, "debateChrome.scoring.producer"), data?.producer],
    [t(catalog, "debateChrome.scoring.cache"), formatCacheDebug(data?.cache, catalog)],
    [t(catalog, "debateChrome.scoring.currentClaims"), data?.node_ids?.length],
    [t(catalog, "debateChrome.scoring.scoredClaims"), data?.scored_node_count],
    [t(catalog, "debateChrome.scoring.skippedClaims"), data?.skipped_node_count],
    [t(catalog, "debateChrome.scoring.truncated"), data?.truncated],
    [t(catalog, "debateChrome.scoring.callCount"), t(catalog, "debateChrome.scoring.notExposedByApi")],
    [t(catalog, "debateChrome.scoring.latency"), t(catalog, "debateChrome.scoring.notExposedByApi")],
    [t(catalog, "debateChrome.scoring.error"), error]
  ];

  return (
    <>
      <div className="drawerScrim" onClick={onClose} />
      <aside
        className="drawer scroll"
        role="dialog"
        aria-modal
        aria-label={t(catalog, "debateChrome.scoring.diagnostics")}
      >
        <div className="drawerHead">
          <div className="drawerHeadMeta">
            <div className="nodeEyebrow">{t(catalog, "debateChrome.scoring.developerDiagnostics")}</div>
            <h2>{t(catalog, "debateChrome.scoring.diagnostics")}</h2>
          </div>
          <button
            type="button"
            className="iconBtn"
            onClick={onClose}
            aria-label={t(catalog, "debateChrome.scoring.close")}
          >
            x
          </button>
        </div>
        <div className="drawerBody">
          <div className="drawerHintMuted">{t(catalog, "debateChrome.scoring.diagnosticsHint")}</div>
          <ul className="drawerFindingList">
            {rows.map(([label, value]) => (
              <li key={label} className="drawerFindingItem">
                <div className="drawerFindingMeta">
                  <span>{label}</span>
                </div>
                <div className="drawerFindingText">{formatDebugValue(value, catalog)}</div>
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
  catalog = debateChromeEnglish
}: {
  enabled: boolean;
  state: AdaptiveDepthDryRunAsyncState;
  catalog?: MessageCatalog;
}) {
  const reason =
    state.error ||
    state.data?.reason ||
    (!enabled ? t(catalog, "debateChrome.adaptiveDepth.requiresScoring") : null);

  if (!enabled) {
    return (
      <section className="progressStrip" aria-label={t(catalog, "debateChrome.adaptiveDepth.title")}>
        <span className="progressLabel">{t(catalog, "debateChrome.adaptiveDepth.unavailable")}</span>
        <span className="progressCount">{reason}</span>
      </section>
    );
  }

  if (state.status === "loading") {
    return (
      <section className="progressStrip" aria-label={t(catalog, "debateChrome.adaptiveDepth.title")}>
        <span className="progressLabel">{t(catalog, "debateChrome.progress.loadingAdaptiveDepth")}</span>
        <span className="progressCount">{t(catalog, "debateChrome.progress.readOnlyPlan")}</span>
      </section>
    );
  }

  if (state.status === "error" || state.status === "unavailable") {
    return (
      <section className="progressStrip" aria-label={t(catalog, "debateChrome.adaptiveDepth.title")}>
        <span className="progressLabel">{t(catalog, "debateChrome.adaptiveDepth.unavailable")}</span>
        <span className="progressCount">{reason || t(catalog, "debateChrome.adaptiveDepth.noPlan")}</span>
        <button
          type="button"
          className="btn btnDark"
          disabled
          aria-disabled="true"
          title={t(catalog, "debateChrome.adaptiveDepth.approvalUnavailable")}
        >
          {t(catalog, "debateChrome.adaptiveDepth.approveSelected")}
        </button>
        <span className="progressCount adaptiveDepthActionMessage">
          {t(catalog, "debateChrome.adaptiveDepth.approvalUnavailable")}
        </span>
      </section>
    );
  }

  if (!state.data) return null;

  const items = state.data.plan.items;
  return (
    <section
      className="progressStrip adaptiveDepthStrip"
      aria-label={t(catalog, "debateChrome.adaptiveDepth.title")}
    >
      <div className="scoringIssueIntro">
        <span className="progressLabel">{t(catalog, "debateChrome.adaptiveDepth.title")}</span>
        <div className="scoringIssueSubcopy">
          {t(catalog, "debateChrome.adaptiveDepth.summary", {
            expansions: state.data.plan.expansion_count,
            candidates: state.data.plan.candidate_count
          })}
        </div>
      </div>
      {items.length === 0 ? (
        <span className="progressCount">{t(catalog, "debateChrome.adaptiveDepth.noneRecommended")}</span>
      ) : (
        <div className="adaptiveDepthChips">
          {items.map((item) => (
            <AdaptiveDepthDryRunChip key={item.node_id} item={item} catalog={catalog} />
          ))}
        </div>
      )}
      <div className="adaptiveDepthActions">
        <button
          type="button"
          className="btn btnDark"
          disabled
          aria-disabled="true"
          title={t(catalog, "debateChrome.adaptiveDepth.approvalUnavailable")}
        >
          {t(catalog, "debateChrome.adaptiveDepth.approveSelected")}
        </button>
        <span className="progressCount adaptiveDepthActionMessage">
          {t(catalog, "debateChrome.adaptiveDepth.approvalUnavailable")}
        </span>
      </div>
    </section>
  );
}

function AdaptiveDepthDryRunChip({
  item,
  catalog = debateChromeEnglish
}: {
  item: AdaptiveDepthDryRunItem;
  catalog?: MessageCatalog;
}) {
  const reasons = item.reasons.map(formatAdaptiveDepthReason);
  const recommendedDepthLabel =
    t(
      catalog,
      item.expansion_hint === "expand"
        ? "debateChrome.adaptiveDepth.recommendedExpand"
        : "debateChrome.adaptiveDepth.recommendedReview"
    );

  return (
    <div
      title={reasons.join(", ") || t(catalog, "debateChrome.adaptiveDepth.noListedReasons")}
      style={{
        display: "grid",
        gap: 6,
        width: 220,
        padding: "8px 10px",
        border: "1px solid var(--line-strong)",
        borderRadius: 6,
        background: item.expansion_hint === "expand" ? "var(--score-strength-bg)" : "var(--surface-2)"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <span className="progressLabel">{t(catalog, "debateChrome.adaptiveDepth.pressure", {
          pressure: formatAdaptiveDepthPressure(item.pressure, catalog)
        })}</span>
        <span className="progressCount">{formatAdaptiveDepthScore(item.score)}</span>
      </div>
      <div
        className="adaptiveDepthMeter"
        aria-label={t(catalog, "debateChrome.adaptiveDepth.score", {
          score: formatAdaptiveDepthScore(item.score)
        })}
        style={{
          height: 5,
          overflow: "hidden",
          borderRadius: 4,
          background: "var(--surface-sunken)"
        }}
      >
        <div
          style={{
            width: formatAdaptiveDepthScore(item.score),
            height: "100%",
            borderRadius: 4,
            background:
              item.pressure === "high"
                ? "var(--dispute)"
                : item.pressure === "medium"
                  ? "var(--gen-dot)"
                  : "var(--agree)"
          }}
        />
      </div>
      <div className="progressCount" style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
        {t(catalog, "debateChrome.adaptiveDepth.recommendation", {
          depth: recommendedDepthLabel,
          action: formatAdaptiveDepthAction(item.recommended_action, catalog)
        })}
      </div>
      <div className="progressCount" style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
        {t(catalog, "debateChrome.adaptiveDepth.counts", {
          holes: item.hole_count,
          investigations: item.recommended_investigation_count,
          claim: compactNodeId(item.node_id)
        })}
      </div>
      {reasons.length > 0 ? (
        <div className="progressCount" style={{ whiteSpace: "normal", lineHeight: 1.35 }}>
          {reasons.join("; ")}
        </div>
      ) : null}
    </div>
  );
}

function SingleShotMain({
  result,
  catalog = debateChromeEnglish
}: {
  result: SingleShotResult;
  catalog?: MessageCatalog;
}) {
  return (
    <div className="singleShot scroll">
      <div className="singleShotInner">
        <div className="nodeEyebrow">{t(catalog, "debateChrome.singleShot.result")}</div>
        <h1 className="display sm" style={{ marginTop: 8 }} data-ai-generated="true">
          {result.final_text}
        </h1>
        <p className="lede" style={{ marginTop: 10 }} data-ai-generated="true">
          {result.global_winner.reason}
        </p>
        <div className="singleShotGrid" data-ai-generated="true">
          <section className="synthCard synthPro">
            <div className="synthCardLabel pro">{t(catalog, "debateChrome.singleShot.strongestPro")}</div>
            <div className="synthCardClaim">{result.strongest_pro}</div>
          </section>
          <section className="synthCard synthCon">
            <div className="synthCardLabel con">{t(catalog, "debateChrome.singleShot.strongestCon")}</div>
            <div className="synthCardClaim">{result.strongest_con}</div>
          </section>
        </div>
        <div className="singleShotColumns" data-ai-generated="true">
          <section>
            <div className="synthSectionTitle">{t(catalog, "debateChrome.singleShot.pros", { count: result.pros.length })}</div>
            <ul className="synthSectionList">
              {result.pros.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <div className="synthSectionTitle">{t(catalog, "debateChrome.singleShot.cons", { count: result.cons.length })}</div>
            <ul className="synthSectionList">
              {result.cons.map((item, index) => (
                <li key={`${index}-${item}`}>{item}</li>
              ))}
            </ul>
          </section>
        </div>
        <div className="singleShotMeta">
          <span className="pill">{result.model_id}</span>
          <span className="pill">{t(catalog, "debateChrome.singleShot.tokensIn", { count: result.tokens_in })}</span>
          <span className="pill">{t(catalog, "debateChrome.singleShot.tokensOut", { count: result.tokens_out })}</span>
        </div>
      </div>
    </div>
  );
}
