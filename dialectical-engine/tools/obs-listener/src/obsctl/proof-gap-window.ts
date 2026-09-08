export const GAP_QUERY = `SELECT count(*)::text AS recent_gaps
FROM obs.capture_gap
WHERE closed_at IS NULL
   OR closed_at > now() - make_interval(secs => ($1::numeric + $2::numeric) / 1000.0)
   OR opened_at > now() - make_interval(secs => ($1::numeric + $2::numeric) / 1000.0)`;

function positive(value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError("FIX10_PROOF_WINDOW");
}

export function computeProofWindow(input: Readonly<{
  proofStalenessMs: number;
  refreshIntervalMs: number;
  skewToleranceMs: number;
  flushIntervalMs: number;
  quietWindowMs: number;
}>): Readonly<{ W: number; Q: number }> {
  positive(input.proofStalenessMs); positive(input.refreshIntervalMs); positive(input.skewToleranceMs);
  positive(input.flushIntervalMs); positive(input.quietWindowMs);
  const doubledRefresh = input.refreshIntervalMs * 2;
  const derivedW = input.proofStalenessMs + doubledRefresh + input.skewToleranceMs + input.flushIntervalMs;
  const W = input.quietWindowMs;
  const Q = W + input.skewToleranceMs;
  if (!Number.isSafeInteger(doubledRefresh) || !Number.isSafeInteger(derivedW) ||
      !Number.isSafeInteger(Q) || W !== derivedW || W < input.proofStalenessMs) {
    throw new TypeError("FIX10_PROOF_WINDOW");
  }
  return Object.freeze({ W, Q });
}

export function gapQueryParameters(quietWindowMs: number, skewToleranceMs: number): readonly [string, string] {
  positive(quietWindowMs); positive(skewToleranceMs);
  return Object.freeze([String(quietWindowMs), String(skewToleranceMs)] as const);
}
