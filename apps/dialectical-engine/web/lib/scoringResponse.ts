import type { DebateScoringResponse, NodeScoringError, NodeScoringPayload, Severity } from "./types";

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
