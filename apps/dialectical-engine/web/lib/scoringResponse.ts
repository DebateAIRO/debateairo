import type { DebateScoringResponse, NodeScoringError, NodeScoringPayload, Severity } from "./types";
import {
  recordSuspiciousScoringEvents,
  type SuspiciousScoringContext,
  type SuspiciousScoringLogger,
} from "./observability/suspiciousScoring";

export type IndexedScoringResponse = {
  scoringByNodeId: Map<string, NodeScoringPayload>;
  scoringErrorsByNodeId: Map<string, NodeScoringError>;
};

export type DebateScoringHoleSummaryItem = {
  nodeId: string;
  claim: string;
  type: string;
  severity: Severity;
  description: string;
  source: string;
};

export type DebateScoringHoleSummary = {
  total: number;
  bySeverity: Record<Severity, number>;
  items: DebateScoringHoleSummaryItem[];
};

export type DebateScoringFatalFlagSummaryItem = {
  nodeId: string;
  claim: string;
  type: string;
  severity: Severity;
  description: string;
};

export type DebateScoringFatalFlagSummary = {
  total: number;
  bySeverity: Record<Severity, number>;
  items: DebateScoringFatalFlagSummaryItem[];
};

export type DebateScoringUnresolvedIssue =
  | {
      kind: "fatal_flag";
      nodeId: string;
      claim: string;
      type: string;
      severity: Severity;
      description: string;
    }
  | {
      kind: "hole";
      nodeId: string;
      claim: string;
      type: string;
      severity: Severity;
      description: string;
      source: string;
    };

export type ScoringVisibilityKind =
  | "off"
  | "empty"
  | "token_required"
  | "provider_required"
  | "unavailable"
  | "refreshing"
  | "scores";

export type ScoringVisibilityState = {
  kind: ScoringVisibilityKind;
  title: string;
  detail: string;
};

export type ScoringVisibilityInput = {
  enabled: boolean;
  hasActionToken: boolean;
  scoringStatus: "idle" | "loading" | "loaded" | "unavailable" | "error";
  refreshStatus: "idle" | "starting" | "error";
  response: DebateScoringResponse | null;
  error?: string | null;
};

const severityRank: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const issueKindRank: Record<DebateScoringUnresolvedIssue["kind"], number> = {
  fatal_flag: 0,
  hole: 1,
};

type RankedScoringIssue = {
  issue: DebateScoringUnresolvedIssue;
  nodeIndex: number;
  issueIndex: number;
  impact: number;
  uncertainty: number;
  strength: number;
};

function scoreValue(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function scoredNodeDetail(response: DebateScoringResponse | null): string {
  const count = response?.scored_node_count ?? response?.items?.length ?? 0;
  if (count <= 0) return "No persisted scored nodes are available.";
  return `Showing ${pluralize(count, "persisted scored node")} from the scoring response.`;
}

function retainedScoreDetail(response: DebateScoringResponse | null): string {
  const count = response?.scored_node_count ?? response?.items?.length ?? 0;
  if (count <= 0) return "No persisted scored nodes are available yet.";
  return `Showing ${pluralize(count, "persisted scored node")} while it completes.`;
}

function hasActiveScoringJob(response: DebateScoringResponse | null): boolean {
  return response?.active_scoring_job_status === "queued" || response?.active_scoring_job_status === "running";
}

function activeScoringJobDetail(response: DebateScoringResponse | null): string {
  const count = response?.scored_node_count ?? response?.items?.length ?? 0;
  if (count <= 0) return "Judge outputs are being generated.";
  return `Judge outputs are being generated. ${retainedScoreDetail(response)}`;
}

function unavailableNodeCount(response: DebateScoringResponse | null): number {
  return response?.errors?.length ?? 0;
}

function partialScoreDetail(response: DebateScoringResponse | null): string {
  const scoredCount = response?.scored_node_count ?? response?.items?.length ?? 0;
  const unavailableCount = unavailableNodeCount(response);
  const scoredDetail =
    scoredCount > 0 ? `Showing ${pluralize(scoredCount, "persisted scored node")}` : "No persisted scored nodes";
  return unavailableCount > 0
    ? `${scoredDetail}; ${pluralize(unavailableCount, "unavailable node")}.`
    : `${scoredDetail}.`;
}

function isMissingJudgeOutputReason(reason?: string | null): boolean {
  return (reason || "").trim().toLowerCase() === "no scoring judge outputs are available for this debate.";
}

function looksProviderOrTokenRequired(value: string | null | undefined): boolean {
  const lower = (value || "").toLowerCase();
  return (
    lower.includes("provider") ||
    lower.includes("model") ||
    lower.includes("token") ||
    lower.includes("credential") ||
    lower.includes("auth") ||
    lower.includes("api key")
  );
}

function compareRankedIssues(left: RankedScoringIssue, right: RankedScoringIssue): number {
  return (
    severityRank[left.issue.severity] - severityRank[right.issue.severity] ||
    issueKindRank[left.issue.kind] - issueKindRank[right.issue.kind] ||
    right.impact - left.impact ||
    right.uncertainty - left.uncertainty ||
    left.strength - right.strength ||
    left.nodeIndex - right.nodeIndex ||
    left.issueIndex - right.issueIndex
  );
}

export function indexScoringResponse(response: DebateScoringResponse | null): IndexedScoringResponse {
  return {
    scoringByNodeId: new Map<string, NodeScoringPayload>(
      (response?.items ?? []).map((item) => [item.node_id, item])
    ),
    scoringErrorsByNodeId: new Map<string, NodeScoringError>(
      (response?.errors ?? []).map((error) => [error.node_id, error])
    ),
  };
}

export async function recordSuspiciousScoringResponse(
  response: DebateScoringResponse | null,
  context: SuspiciousScoringContext,
  logger: SuspiciousScoringLogger
): Promise<void> {
  await recordSuspiciousScoringEvents(response, context, logger);
}

export function formatScoringVisibilityState(input: ScoringVisibilityInput): ScoringVisibilityState {
  const reason = input.error || input.response?.reason || null;

  if (!input.enabled) {
    return {
      kind: "off",
      title: "Scoring off",
      detail: "Scoring is disabled for this view; no score data is being shown.",
    };
  }

  if (input.refreshStatus === "starting" || input.scoringStatus === "loading") {
    const hasRetainedScores = (input.response?.scored_node_count ?? input.response?.items?.length ?? 0) > 0;
    return {
      kind: "refreshing",
      title: input.scoringStatus === "loading" && input.refreshStatus === "idle" ? "Loading scoring" : "Scoring in progress",
      detail:
        input.refreshStatus === "idle"
          ? "Reading persisted scoring state for this debate."
          : hasRetainedScores
            ? `Judge outputs are being generated. ${retainedScoreDetail(input.response)}`
            : "Judge outputs are being generated.",
    };
  }

  if (hasActiveScoringJob(input.response)) {
    return {
      kind: "refreshing",
      title: "Scoring in progress",
      detail: activeScoringJobDetail(input.response),
    };
  }

  if (input.scoringStatus === "unavailable" && isMissingJudgeOutputReason(reason)) {
    return {
      kind: "empty",
      title: "No scoring run yet",
      detail: "Refresh scoring to generate judge outputs.",
    };
  }

  if (reason && looksProviderOrTokenRequired(reason)) {
    return {
      kind: "provider_required",
      title: "Scoring provider required",
      detail: reason,
    };
  }

  if (input.scoringStatus === "error" || input.scoringStatus === "unavailable") {
    return {
      kind: "unavailable",
      title: "Scoring unavailable",
      detail: reason || "No scoring payload is available.",
    };
  }

  if (!input.hasActionToken) {
    const count = input.response?.scored_node_count ?? input.response?.items?.length ?? 0;
    return {
      kind: "token_required",
      title: "User token required",
      detail:
        count > 0
          ? `Unlock actions with a user token to refresh scoring. Showing ${pluralize(count, "persisted scored node")}.`
          : "Unlock actions with a user token to refresh scoring. No persisted scored nodes are available.",
    };
  }

  if (input.response?.status === "partial") {
    return {
      kind: "scores",
      title: "Scores partially checked",
      detail: partialScoreDetail(input.response),
    };
  }

  return {
    kind: "scores",
    title: "Real scores displayed",
    detail: scoredNodeDetail(input.response),
  };
}

export function summarizeScoringHoles(response: DebateScoringResponse | null): DebateScoringHoleSummary {
  const items = (response?.items ?? [])
    .flatMap((node) =>
      (node.holes ?? []).map((hole) => ({
        nodeId: node.node_id,
        claim: node.claim?.core_claim?.trim() || node.node_id,
        type: hole.type,
        severity: hole.severity,
        description: hole.description.trim(),
        source: hole.source,
      }))
    )
    .filter((hole) => hole.description.length > 0)
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity]);

  return {
    total: items.length,
    bySeverity: {
      high: items.filter((hole) => hole.severity === "high").length,
      medium: items.filter((hole) => hole.severity === "medium").length,
      low: items.filter((hole) => hole.severity === "low").length,
    },
    items,
  };
}

export function summarizeScoringFatalFlags(response: DebateScoringResponse | null): DebateScoringFatalFlagSummary {
  const items = (response?.items ?? [])
    .flatMap((node) =>
      (node.fatal_flags ?? []).map((flag) => ({
        nodeId: node.node_id,
        claim: node.claim?.core_claim?.trim() || node.node_id,
        type: flag.type,
        severity: flag.severity,
        description: flag.description.trim(),
      }))
    )
    .filter((flag) => flag.description.length > 0)
    .sort((left, right) => severityRank[left.severity] - severityRank[right.severity]);

  return {
    total: items.length,
    bySeverity: {
      high: items.filter((flag) => flag.severity === "high").length,
      medium: items.filter((flag) => flag.severity === "medium").length,
      low: items.filter((flag) => flag.severity === "low").length,
    },
    items,
  };
}

export function selectStrongestUnresolvedScoringIssue(
  response: DebateScoringResponse | null
): DebateScoringUnresolvedIssue | null {
  const issues = (response?.items ?? []).flatMap((node, nodeIndex) => {
    const claim = node.claim?.core_claim?.trim() || node.node_id;
    const impact = scoreValue(node.scores?.impact);
    const uncertainty = scoreValue(node.scores?.uncertainty);
    const strength = scoreValue(node.scores?.strength);
    const fatalFlags = (node.fatal_flags ?? []).map((flag, issueIndex): RankedScoringIssue => ({
      issue: {
        kind: "fatal_flag",
        nodeId: node.node_id,
        claim,
        type: flag.type,
        severity: flag.severity,
        description: flag.description.trim(),
      },
      nodeIndex,
      issueIndex,
      impact,
      uncertainty,
      strength,
    }));
    const holes = (node.holes ?? []).map((hole, issueIndex): RankedScoringIssue => ({
      issue: {
        kind: "hole",
        nodeId: node.node_id,
        claim,
        type: hole.type,
        severity: hole.severity,
        description: hole.description.trim(),
        source: hole.source,
      },
      nodeIndex,
      issueIndex,
      impact,
      uncertainty,
      strength,
    }));

    return [...fatalFlags, ...holes];
  });

  return issues.filter((item) => item.issue.description.length > 0).sort(compareRankedIssues)[0]?.issue ?? null;
}
