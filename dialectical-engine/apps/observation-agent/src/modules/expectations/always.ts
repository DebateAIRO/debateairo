import type { ObservationComponent, ProbeObservation, SignalIntent, StatusState } from "../../core/types.js";

export function createAlwaysExpectedTracker(input: Readonly<{
  component: Extract<ObservationComponent, "kanban">;
  agentStartedAt: Date;
  openAfterFailures: number;
  clearAfterSuccesses: number;
  absentAfterMs: number;
}>): Readonly<{
  updatePolicy(policy: Readonly<{
    openAfterFailures: number; clearAfterSuccesses: number; absentAfterMs: number;
  }>): void;
  observe(observation: ProbeObservation | undefined, at: Date): Readonly<{
    state: StatusState;
    intents: readonly SignalIntent[];
  }>;
}> {
  let openAfterFailures = input.openAfterFailures;
  let clearAfterSuccesses = input.clearAfterSuccesses;
  let absentAfterMs = input.absentAfterMs;
  let failures = 0;
  let state: StatusState = "UNKNOWN";
  let seenUp = false;
  let absentOpen = false;
  let absentOpenedAt: Date | null = null;

  function intent(
    signalState: "OPEN" | "CLEARED",
    at: Date
  ): SignalIntent {
    const clearing = signalState === "CLEARED";
    return Object.freeze({
      correlationKey: `expected:${input.component}`,
      component: input.component,
      class: "EXPECTED_ABSENT",
      state: signalState,
      severity: "SEVERE",
      impactCode: clearing ? "IMPACT_CLEARED" : "IMPACT_EXPECTED_ABSENT",
      firstFailedProbeAt: input.agentStartedAt,
      detectedAt: at,
      evidence: Object.freeze({
        expected: "always",
        absent_for_s: Math.max(0, (at.getTime() - input.agentStartedAt.getTime()) / 1_000),
        first_observed_at: input.agentStartedAt.toISOString(),
        ...(clearing && absentOpenedAt !== null ? {
          duration_seconds: Math.max(0, (at.getTime() - absentOpenedAt.getTime()) / 1_000)
        } : {})
      }),
      suspectedDefect: false,
      defectKind: null,
      runRef: null,
      workItemRef: null
    });
  }

  return Object.freeze({
    updatePolicy(policy): void {
      openAfterFailures = policy.openAfterFailures;
      clearAfterSuccesses = policy.clearAfterSuccesses;
      absentAfterMs = policy.absentAfterMs;
    },
    observe(observation, at) {
      const intents: SignalIntent[] = [];
      if (observation !== undefined) {
        if (observation.ok) {
          seenUp = true;
          failures = 0;
          if (absentOpen) {
            intents.push(intent("CLEARED", at));
            absentOpen = false;
            absentOpenedAt = null;
          }
          state = "UP";
        } else {
          failures += 1;
          state = failures >= openAfterFailures ? "DOWN" : "SUSPECT";
        }
      }
      if (!seenUp && !absentOpen
        && at.getTime() - input.agentStartedAt.getTime() >= absentAfterMs) {
        absentOpen = true;
        absentOpenedAt = at;
        intents.push(intent("OPEN", at));
      }
      return Object.freeze({ state, intents: Object.freeze(intents) });
    }
  });
}
