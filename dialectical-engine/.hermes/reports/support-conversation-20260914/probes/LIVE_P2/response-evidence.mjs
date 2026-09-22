const RESPONSE_KEYS = ["outcome", "text", "sourceIds"];
const SNAPSHOT_KEYS = ["requestVersion", "pinnedVersion", "pinnedSourceId", "reviewedFallback"];
const FALLBACK_KEYS = ["version", "sourceId", "text"];

function hasExactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

const incompatible = Object.freeze({ terminal: "INCOMPATIBLE", reviewedFallbackMatch: false });

export function classifySupportResponseEvidence(response, snapshot) {
  if (!hasExactKeys(response, RESPONSE_KEYS) || !hasExactKeys(snapshot, SNAPSHOT_KEYS)
    || !hasExactKeys(snapshot.reviewedFallback, FALLBACK_KEYS)
    || typeof response.text !== "string" || response.text.length === 0
    || !Array.isArray(response.sourceIds)
    || response.sourceIds.some((id) => typeof id !== "string" || id.length === 0)
    || typeof snapshot.requestVersion !== "string" || snapshot.requestVersion.length === 0
    || typeof snapshot.pinnedVersion !== "string" || snapshot.pinnedVersion.length === 0
    || typeof snapshot.pinnedSourceId !== "string" || snapshot.pinnedSourceId.length === 0
    || typeof snapshot.reviewedFallback.version !== "string"
    || typeof snapshot.reviewedFallback.sourceId !== "string"
    || typeof snapshot.reviewedFallback.text !== "string") {
    return incompatible;
  }
  if (response.outcome === "REFUSE_SAFETY" && response.sourceIds.length === 0) {
    return Object.freeze({ terminal: "REFUSAL", reviewedFallbackMatch: false });
  }
  if (response.outcome !== "ANSWER_GROUNDED" || response.sourceIds.length === 0) {
    return incompatible;
  }
  const reviewedFallbackMatch = snapshot.requestVersion === snapshot.pinnedVersion
    && snapshot.reviewedFallback.version === snapshot.pinnedVersion
    && snapshot.reviewedFallback.sourceId === snapshot.pinnedSourceId
    && response.sourceIds.length === 1
    && response.sourceIds[0] === snapshot.pinnedSourceId
    && response.text === snapshot.reviewedFallback.text;
  return Object.freeze({ terminal: "GROUNDED", reviewedFallbackMatch });
}
