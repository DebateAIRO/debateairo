import type {
  ComponentState, ObservationComponent, ProbeObservation, SignalClass
} from "../../core/types.js";

export type LivenessPolicy = Readonly<{
  openAfterFailures: number;
  clearAfterSuccesses: number;
}>;

export type LivenessTransition = Readonly<{
  state: ComponentState;
  event: null | Readonly<{
    kind: "OPEN" | "CLEARED";
    component: ObservationComponent;
    class: SignalClass;
    at: Date;
    firstFailedProbeAt?: Date;
  }>;
}>;

export function inactiveClassRecoveries(
  current: ProbeObservation,
  openClasses: readonly SignalClass[]
): readonly ProbeObservation[] {
  return Object.freeze(openClasses
    .filter((signalClass) => signalClass !== current.class)
    .map((signalClass) => Object.freeze({
      ...current,
      ok: true,
      class: signalClass,
      lastStatus: "READY"
    })));
}

type MutableState = {
  state: ComponentState;
  failures: number;
  successes: number;
  firstFailedProbeAt: Date | undefined;
};

export function createLivenessTracker(policy: LivenessPolicy): Readonly<{
  updatePolicy(policy: LivenessPolicy): void;
  observe(input: Readonly<{
    component: ObservationComponent;
    class: SignalClass;
    ok: boolean;
    at: Date;
  }>): LivenessTransition;
}> {
  function validate(input: LivenessPolicy): LivenessPolicy {
    if (!Number.isInteger(input.openAfterFailures) || input.openAfterFailures < 1
      || !Number.isInteger(input.clearAfterSuccesses) || input.clearAfterSuccesses < 1) {
      throw new TypeError("OBSERVATION_LIVENESS_POLICY_INVALID");
    }
    return Object.freeze({ ...input });
  }
  let currentPolicy = validate(policy);
  const states = new Map<string, MutableState>();
  return Object.freeze({
    updatePolicy(input): void {
      currentPolicy = validate(input);
    },
    observe(input): LivenessTransition {
      const key = `${input.component}:${input.class}`;
      const current = states.get(key) ?? {
        state: "UNKNOWN" as const,
        failures: 0,
        successes: 0,
        firstFailedProbeAt: undefined
      };
      states.set(key, current);
      if (!input.ok) {
        current.successes = 0;
        if (current.state === "DOWN") return Object.freeze({ state: "DOWN", event: null });
        current.failures += 1;
        current.firstFailedProbeAt ??= input.at;
        if (current.failures < currentPolicy.openAfterFailures) {
          current.state = "SUSPECT";
          return Object.freeze({ state: current.state, event: null });
        }
        current.state = "DOWN";
        return Object.freeze({
          state: current.state,
          event: Object.freeze({
            kind: "OPEN" as const,
            component: input.component,
            class: input.class,
            at: input.at,
            firstFailedProbeAt: current.firstFailedProbeAt
          })
        });
      }

      current.failures = 0;
      if (current.state !== "DOWN" && current.state !== "RECOVERING") {
        current.state = "UP";
        current.successes = 0;
        current.firstFailedProbeAt = undefined;
        return Object.freeze({ state: current.state, event: null });
      }
      current.successes += 1;
      if (current.successes < currentPolicy.clearAfterSuccesses) {
        current.state = "RECOVERING";
        return Object.freeze({ state: current.state, event: null });
      }
      current.state = "UP";
      current.successes = 0;
      current.firstFailedProbeAt = undefined;
      return Object.freeze({
        state: current.state,
        event: Object.freeze({
          kind: "CLEARED" as const,
          component: input.component,
          class: input.class,
          at: input.at
        })
      });
    }
  });
}
