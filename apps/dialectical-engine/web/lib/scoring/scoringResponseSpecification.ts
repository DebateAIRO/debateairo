import type { DebateScoringResponse, NodeScoringPayload } from "../types";

export const scoringArtifactChainExpectation = "current-scoring-producers-emit-model-metadata-and-cache";

export type ScoringResponseSpecificationFinding =
  | {
      kind: "empty_output";
    }
  | {
      kind: "missing_required_fields";
      missingFields: string[];
    }
  | {
      kind: "missing_artifact_chain";
      missingFields: string[];
      artifactChainExpectation: string;
    };

type ScoringSuccessStatus = "available" | "partial";

const successStatuses = new Set<string>(["available", "partial"]);

function isSuccessStatus(status: string | undefined): status is ScoringSuccessStatus {
  return typeof status === "string" && successStatuses.has(status);
}

function countItems(response: DebateScoringResponse): number {
  return Array.isArray(response.items) ? response.items.length : 0;
}

function countNodeIds(response: DebateScoringResponse): number {
  return Array.isArray(response.node_ids) ? response.node_ids.length : 0;
}

function isEmptySuccessfulOutput(response: DebateScoringResponse): boolean {
  return (
    isSuccessStatus(response.status) &&
    countItems(response) === 0 &&
    (countNodeIds(response) > 0 || response.scored_node_count === 0)
  );
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

function missingArtifactChainFields(response: DebateScoringResponse): string[] {
  const missingFields: string[] = [];
  if (!response.model_metadata) missingFields.push("model_metadata");
  if (!response.cache) missingFields.push("cache");
  return missingFields;
}

export function inspectScoringResponse(
  response: DebateScoringResponse | null
): ScoringResponseSpecificationFinding[] {
  if (!response || !isSuccessStatus(response.status)) return [];

  if (isEmptySuccessfulOutput(response)) {
    return [{ kind: "empty_output" }];
  }

  const requiredFields = missingRequiredFields(response);
  if (requiredFields.length > 0) {
    return [
      {
        kind: "missing_required_fields",
        missingFields: requiredFields,
      },
    ];
  }

  const artifactFields = missingArtifactChainFields(response);
  if (artifactFields.length > 0) {
    return [
      {
        kind: "missing_artifact_chain",
        missingFields: artifactFields,
        artifactChainExpectation: scoringArtifactChainExpectation,
      },
    ];
  }

  return [];
}
