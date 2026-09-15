import type { ObservationSignal } from "../../core/signals.js";
import type {
  ObservationComponent, ProbeObservation, RestoredOpenSignal, SignalIntent, StatusState
} from "../../core/types.js";

function exactAlwaysEvidence(signal: ObservationSignal): boolean {
  const evidence = signal.evidence as Readonly<Record<string, unknown>>;
  const keys = Object.keys(evidence).sort();
  if (keys.join(":") !== "absent_for_s:expected:first_observed_at"
    || evidence.expected !== "always"
    || typeof evidence.absent_for_s !== "number"
    || !Number.isFinite(evidence.absent_for_s)
    || evidence.absent_for_s < 0
    || typeof evidence.first_observed_at !== "string") return false;
  const first = new Date(evidence.first_observed_at).getTime();
  const detected = new Date(signal.detected_at).getTime();
  return Number.isFinite(first)
    && Math.abs(evidence.absent_for_s - Math.max(0, (detected - first) / 1_000)) < 1e-9;
}

export function createAlwaysExpectedTracker(input: Readonly<{
  component: Extract<ObservationComponent, "kanban">;
  agentStartedAt: Date;
  openAfterFailures: number;
  clearAfterSuccesses: number;
  absentAfterMs: number;
}>): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
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
  let agentStartedAt = input.agentStartedAt;
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
      firstFailedProbeAt: agentStartedAt,
      detectedAt: at,
      evidence: Object.freeze({
        expected: "always",
        absent_for_s: Math.max(0, (at.getTime() - agentStartedAt.getTime()) / 1_000),
        first_observed_at: agentStartedAt.toISOString(),
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
    legacyCorrelationKey(signal): string | null {
      return signal.state === "OPEN"
        && signal.component === input.component
        && signal.class === "EXPECTED_ABSENT"
        && signal.severity === "SEVERE"
        && signal.impact_code === "IMPACT_EXPECTED_ABSENT"
        && signal.first_failed_probe_at !== null
        && signal.suspected_defect === false
        && signal.defect_kind === null
        && signal.run_ref === null
        && signal.work_item_ref === null
        && exactAlwaysEvidence(signal)
        ? `expected:${input.component}`
        : null;
    },
    restore(openSignals): void {
      if (openSignals.length > 1) throw new TypeError("OBSERVATION_EXPECTATION_RESTORE_INVALID");
      const restored = openSignals[0];
      if (restored === undefined) return;
      if (restored.correlationKey !== `expected:${input.component}`
        || this.legacyCorrelationKey(restored.signal) !== restored.correlationKey) {
        throw new TypeError("OBSERVATION_EXPECTATION_RESTORE_INVALID");
      }
      agentStartedAt = restored.signal.first_failed_probe_at === null
        ? new Date(restored.signal.detected_at)
        : new Date(restored.signal.first_failed_probe_at);
      absentOpen = true;
      absentOpenedAt = new Date(restored.signal.detected_at);
    },
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
        && at.getTime() - agentStartedAt.getTime() >= absentAfterMs) {
        absentOpen = true;
        absentOpenedAt = at;
        intents.push(intent("OPEN", at));
      }
      return Object.freeze({ state, intents: Object.freeze(intents) });
    }
  });
}
