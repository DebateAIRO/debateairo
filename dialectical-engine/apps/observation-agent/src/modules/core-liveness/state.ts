import type {
  ComponentState, ObservationComponent, ProbeObservation, RestoredOpenSignal, SignalClass
} from "../../core/types.js";
import type { ObservationSignal } from "../../core/signals.js";

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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[]
): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function hasFailureCounts(evidence: Readonly<Record<string, unknown>>): boolean {
  return Number.isInteger(evidence.consecutive_failures)
    && (evidence.consecutive_failures as number) > 0
    && Number.isInteger(evidence.threshold)
    && evidence.threshold === evidence.consecutive_failures;
}

function ownsEvidence(signal: ObservationSignal): boolean {
  if (!isRecord(signal.evidence) || !hasFailureCounts(signal.evidence)) return false;
  const evidence = signal.evidence;
  const base = ["probe", "last_status", "consecutive_failures", "threshold"] as const;
  const withTarget = [...base, "target"] as const;
  const withContainer = [...withTarget, "container_status", "restart_policy", "exit_code"] as const;

  if (signal.component === "docker") {
    return hasExactKeys(evidence, [...withTarget, "exit_code"])
      && evidence.probe === "docker_info"
      && evidence.target === "docker-engine"
      && evidence.last_status === "FAILED"
      && Number.isInteger(evidence.exit_code);
  }
  if (signal.class === "INFRA_UNKNOWN") {
    return hasExactKeys(evidence, [...base, "container_status"])
      && evidence.probe === "docker_inspect"
      && evidence.last_status === "UNKNOWN"
      && evidence.container_status === "UNKNOWN";
  }
  if (signal.component === "postgres") {
    const failedConnection = hasExactKeys(evidence, withTarget)
      && evidence.last_status === "FAILED";
    const stoppedContainer = hasExactKeys(evidence, withContainer)
      && evidence.container_status !== "running"
      && ((evidence.container_status === "UNKNOWN" && evidence.last_status === "UNKNOWN")
        || (evidence.container_status !== "UNKNOWN" && evidence.last_status === "FAILED"));
    return evidence.probe === "tcp+select1"
      && typeof evidence.target === "string"
      && (failedConnection || stoppedContainer);
  }
  if (signal.component === "hatchet") {
    const liveFailure = hasExactKeys(evidence, withTarget)
      && evidence.last_status !== 200;
    const inspectedFailure = hasExactKeys(evidence, withContainer)
      && (signal.class === "INFRA_NOT_READY"
        ? evidence.last_status !== 200
        : evidence.last_status === 200 && evidence.container_status !== "running");
    return evidence.probe === "http_get"
      && typeof evidence.target === "string"
      && Number.isInteger(evidence.last_status)
      && (signal.class === "INFRA_NOT_READY" ? inspectedFailure : liveFailure || inspectedFailure);
  }
  return false;
}

export function createLivenessTracker(policy: LivenessPolicy): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
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
  function owns(signal: ObservationSignal): boolean {
    const expectedSeverity = signal.class === "INFRA_DOWN" ? "FATAL"
      : signal.class === "INFRA_NOT_READY" ? "DEGRADED"
        : signal.class === "INFRA_UNKNOWN" ? "SEVERE" : null;
    if (signal.state !== "OPEN"
      || signal.severity !== expectedSeverity
      || signal.first_failed_probe_at === null
      || signal.suspected_defect
      || signal.defect_kind !== null
      || signal.run_ref !== null
      || signal.work_item_ref !== null
      || !ownsEvidence(signal)) return false;
    if (signal.component === "docker") {
      return signal.class === "INFRA_DOWN" && signal.impact_code === "IMPACT_DOCKER_DOWN";
    }
    if (signal.component === "postgres") {
      return (signal.class === "INFRA_DOWN" && signal.impact_code === "IMPACT_PG_DOWN")
        || (signal.class === "INFRA_UNKNOWN" && signal.impact_code === "IMPACT_DOCKER_DOWN");
    }
    if (signal.component === "hatchet") {
      return (signal.class === "INFRA_DOWN" && signal.impact_code === "IMPACT_HATCHET_DOWN")
        || (signal.class === "INFRA_NOT_READY"
          && signal.impact_code === "IMPACT_HATCHET_NOT_READY")
        || (signal.class === "INFRA_UNKNOWN" && signal.impact_code === "IMPACT_DOCKER_DOWN");
    }
    return false;
  }
  return Object.freeze({
    legacyCorrelationKey(signal): string | null {
      return owns(signal)
        ? `${signal.component}:${signal.class}`
        : null;
    },
    restore(openSignals): void {
      for (const restored of openSignals) {
        const key = `${restored.signal.component}:${restored.signal.class}`;
        if (restored.correlationKey !== key || !owns(restored.signal) || states.has(key)) {
          throw new TypeError("OBSERVATION_LIVENESS_RESTORE_INVALID");
        }
        states.set(key, {
          state: "DOWN",
          failures: currentPolicy.openAfterFailures,
          successes: 0,
          firstFailedProbeAt: restored.signal.first_failed_probe_at === null
            ? undefined
            : new Date(restored.signal.first_failed_probe_at)
        });
      }
    },
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
