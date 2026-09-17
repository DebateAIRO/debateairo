export type ThroughputCounters = Readonly<{
  runSequence: number;
  runsStarted: number;
  terminalRuns: number;
  failedRuns: number;
  workItemSequence: number;
  completedWorkItems: number;
  failedWorkItems: number;
}>;

export type ThroughputDelta = Readonly<{
  runsStarted: number;
  terminalRuns: number;
  failedRuns: number;
  completedWorkItems: number;
  failedWorkItems: number;
  drainedWorkItems: number;
}>;

function difference(current: number, previous: number): number {
  if (!Number.isSafeInteger(current) || !Number.isSafeInteger(previous)
    || current < 0 || previous < 0 || current < previous) {
    throw new TypeError("OBSERVATION_THROUGHPUT_CURSOR_INVALID");
  }
  return current - previous;
}

export function computeThroughputDelta(
  previous: ThroughputCounters,
  current: ThroughputCounters
): ThroughputDelta {
  if (current.runSequence < previous.runSequence
    || current.workItemSequence < previous.workItemSequence) {
    throw new TypeError("OBSERVATION_THROUGHPUT_CURSOR_INVALID");
  }
  const completedWorkItems = difference(
    current.completedWorkItems,
    previous.completedWorkItems
  );
  const failedWorkItems = difference(current.failedWorkItems, previous.failedWorkItems);
  return Object.freeze({
    runsStarted: difference(current.runsStarted, previous.runsStarted),
    terminalRuns: difference(current.terminalRuns, previous.terminalRuns),
    failedRuns: difference(current.failedRuns, previous.failedRuns),
    completedWorkItems,
    failedWorkItems,
    drainedWorkItems: completedWorkItems + failedWorkItems
  });
}
