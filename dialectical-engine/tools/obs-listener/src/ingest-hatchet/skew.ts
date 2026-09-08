export interface SplitClockInput {
  readonly firstPartyAt: Date;
  readonly hatchetAt: Date;
  readonly ingestObservedAt: Date;
  readonly toleranceMs: number;
}

export interface SplitClockMeasurement {
  readonly firstPartyOccurredAt: string;
  readonly hatchetOccurredAt: string;
  readonly ingestObservedAt: string;
  readonly skewMs: number;
  readonly ingestLagMs: number;
  readonly toleranceMs: number;
  readonly withinTolerance: boolean;
  readonly tripEligible: boolean;
}

export function measureSplitClock(input: SplitClockInput): SplitClockMeasurement {
  const firstPartyMs = input.firstPartyAt.getTime();
  const hatchetMs = input.hatchetAt.getTime();
  const observedMs = input.ingestObservedAt.getTime();
  if (!Number.isFinite(firstPartyMs) || !Number.isFinite(hatchetMs) || !Number.isFinite(observedMs)) {
    throw new TypeError("HATCHET_SKEW_CLOCK_INVALID");
  }
  if (!Number.isSafeInteger(input.toleranceMs) || input.toleranceMs <= 0) {
    throw new TypeError("HATCHET_SKEW_TOLERANCE_UNRATIFIED");
  }
  const skewMs = Math.abs(hatchetMs - firstPartyMs);
  const ingestLagMs = Math.abs(observedMs - hatchetMs);
  const withinTolerance = skewMs <= input.toleranceMs;
  return Object.freeze({
    firstPartyOccurredAt: input.firstPartyAt.toISOString(),
    hatchetOccurredAt: input.hatchetAt.toISOString(),
    ingestObservedAt: input.ingestObservedAt.toISOString(),
    skewMs,
    ingestLagMs,
    toleranceMs: input.toleranceMs,
    withinTolerance,
    tripEligible: !withinTolerance || ingestLagMs > input.toleranceMs
  });
}
