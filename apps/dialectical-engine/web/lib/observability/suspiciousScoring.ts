import type { DebateScoringResponse, NodeScoringPayload } from "../types";

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

type ScoringSuccessStatus = "available" | "partial";

const successStatuses = new Set<string>(["available", "partial"]);
const artifactChainExpectation = "current-scoring-producers-emit-model-metadata-and-cache";

function isSuccessStatus(status: string | undefined): status is ScoringSuccessStatus {
  return typeof status === "string" && successStatuses.has(status);
}

function compactPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined && value !== null));
}

function countItems(response: DebateScoringResponse): number {
  return Array.isArray(response.items) ? response.items.length : 0;
}

function countNodeIds(response: DebateScoringResponse): number {
  return Array.isArray(response.node_ids) ? response.node_ids.length : 0;
}

function countErrors(response: DebateScoringResponse): number {
  return Array.isArray(response.errors) ? response.errors.length : 0;
}

function scoringBasePayload(
  response: DebateScoringResponse,
  context: SuspiciousScoringContext
): Record<string, unknown> {
  return compactPayload({
    category: "suspicious",
    source: "scoring-response",
    message: "Scoring response contains a suspicious output state.",
    debateId: context.debateId ?? response.debate_id,
    runId: context.runId,
    requestId: context.requestId,
    operation: context.operation,
    status: response.status,
    itemCount: countItems(response),
    nodeIdCount: countNodeIds(response),
    errorCount: countErrors(response),
    scoredNodeCount: response.scored_node_count,
  });
}

function isEmptySuccessfulOutput(response: DebateScoringResponse): boolean {
  return isSuccessStatus(response.status) && countItems(response) === 0 && (countNodeIds(response) > 0 || response.scored_node_count === 0);
}

function missingArtifactChainFields(response: DebateScoringResponse): string[] {
  const missingFields: string[] = [];
  if (!response.model_metadata) missingFields.push("model_metadata");
  if (!response.cache) missingFields.push("cache");
  return missingFields;
}

function missingRequiredFields(response: DebateScoringResponse): string[] {
  const missingFields: string[] = [];

  if (!response.debate_id) missingFields.push("debate_id");
  if (!response.status) missingFields.push("status");
  if (!Array.isArray(response.node_ids)) missingFields.push("node_ids");
  if (!Array.isArray(response.items)) missingFields.push("items");

  for (const [index, item] of (response.items ?? []).entries()) {
    const candidate = item as Partial<NodeScoringPayload> | null;
    if (!candidate?.node_id) missingFields.push(`items[${index}].node_id`);
    if (!candidate?.claim) missingFields.push(`items[${index}].claim`);
    if (!candidate?.scores) missingFields.push(`items[${index}].scores`);
    if (!candidate?.labels) missingFields.push(`items[${index}].labels`);
    if (!candidate?.rationale) missingFields.push(`items[${index}].rationale`);
  }

  return missingFields;
}

export function suspiciousScoringEvents(
  response: DebateScoringResponse | null,
  context: SuspiciousScoringContext = {}
): SuspiciousScoringEvent[] {
  if (!response || !isSuccessStatus(response.status)) return [];

  const basePayload = scoringBasePayload(response, context);

  if (isEmptySuccessfulOutput(response)) {
    return [
      {
        event: "scoring.empty_output",
        payload: {
          ...basePayload,
          message: "Successful scoring response contained no scored items.",
        },
      },
    ];
  }

  const missingFields = missingRequiredFields(response);
  if (missingFields.length > 0) {
    return [
      {
        event: "scoring.success_missing_required_fields",
        payload: {
          ...basePayload,
          message: "Successful scoring response is missing required fields.",
          missingFields,
        },
      },
    ];
  }

  const missingArtifactFields = missingArtifactChainFields(response);
  if (missingArtifactFields.length > 0) {
    return [
      {
        event: "scoring.missing_artifact_chain",
        payload: {
          ...basePayload,
          message: "Successful scoring response is missing artifact chain metadata.",
          missingFields: missingArtifactFields,
          artifactChainExpectation,
        },
      },
    ];
  }

  return [];
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
