// Deterministic code-point ordering keeps the host locale from changing a
// replayable recommendation tiebreak.
export function compareRecommendationText(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
