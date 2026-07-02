import {
  inspectScoringResponse,
  type ScoringResponseSpecificationFinding,
} from "../scoring/scoringResponseSpecification";
import type { DebateScoringResponse } from "../types";

export type SuspiciousScoringContext = {
  debateId?: string | null;
  runId?: string | null;
  requestId?: string | null;
  operation?: string | null;
};

export type SuspiciousScoringLogger = {
  suspicious(event: string, payload: Record<string, unknown>): void | Promise<void>;
};

export type SuspiciousScoringEvent = {
  event: string;
  payload: Record<string, unknown>;
};

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null));
}

function argumentClaimIds(response: DebateScoringResponse): string[] {
  return Array.isArray(response.node_ids) ? response.node_ids : [];
}

function countClaims(response: DebateScoringResponse): number {
  return Array.isArray(response.node_ids) ? response.node_ids.length : 0;
}

function countErrors(response: DebateScoringResponse): number {
  return Array.isArray(response.errors) ? response.errors.length : 0;
}

function dddDiagnosticFieldPath(fieldPath: string): string {
  const nestedClaimPath = fieldPath.match(/^items\[(\d+)\]\.(.+)$/);
  if (nestedClaimPath) {
    const [, index, field] = nestedClaimPath;
    const dddField =
      field === "node_id" ? "argumentClaimId" : field === "claim" ? "argumentClaim" : field;
    return `argumentClaims[${index}].${dddField}`;
  }

  const dddFields: Record<string, string> = {
    debate_id: "debateId",
    node_ids: "argumentClaimIds",
    items: "argumentClaims",
    scored_node_count: "scoredClaimCount",
    model_metadata: "modelMetadata",
  };
  return dddFields[fieldPath] ?? fieldPath;
}

function dddDiagnosticFieldPaths(fieldPaths: string[]): string[] {
  return fieldPaths.map(dddDiagnosticFieldPath);
}

function scoringBasePayload(
  response: DebateScoringResponse,
  context: SuspiciousScoringContext
): Record<string, unknown> {
  return compactPayload({
    source: "scoring-response",
    message: "Scoring response contains a suspicious output state.",
    debateId: context.debateId ?? response.debate_id,
    runId: context.runId,
    requestId: context.requestId,
    operation: context.operation,
    status: response.status,
    claimCount: countClaims(response),
    argumentClaimIds: argumentClaimIds(response),
    errorCount: countErrors(response),
    scoredClaimCount: response.scored_node_count,
  });
}

function serializeSuspiciousScoringFinding(
  finding: ScoringResponseSpecificationFinding,
  basePayload: Record<string, unknown>
): SuspiciousScoringEvent {
  if (finding.kind === "empty_output") {
    return {
      event: "scoring.empty_output",
      payload: {
        ...basePayload,
        message: "Successful scoring response contained no scored items.",
      },
    };
  }

  if (finding.kind === "missing_required_fields") {
    return {
      event: "scoring.success_missing_required_fields",
      payload: {
        ...basePayload,
        message: "Successful scoring response is missing required fields.",
        missingFields: dddDiagnosticFieldPaths(finding.missingFields),
      },
    };
  }

  return {
    event: "scoring.missing_artifact_chain",
    payload: {
      ...basePayload,
      message: "Successful scoring response is missing artifact chain metadata.",
      missingFields: dddDiagnosticFieldPaths(finding.missingFields),
      artifactChainExpectation: finding.artifactChainExpectation,
    },
  };
}

export function suspiciousScoringEvents(
  response: DebateScoringResponse | null,
  context: SuspiciousScoringContext = {}
): SuspiciousScoringEvent[] {
  if (!response) return [];

  const findings = inspectScoringResponse(response);
  if (findings.length === 0) return [];

  const basePayload = scoringBasePayload(response, context);
  return findings.map((finding) => serializeSuspiciousScoringFinding(finding, basePayload));
}

export async function recordSuspiciousScoringEvents(
  response: DebateScoringResponse | null,
  context: SuspiciousScoringContext,
  logger: SuspiciousScoringLogger
): Promise<void> {
  for (const { event, payload } of suspiciousScoringEvents(response, context)) {
    await logger.suspicious(event, payload);
  }
}
