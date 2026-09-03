import type {
  ComponentState,
  ObservationComponent,
  ProbeObservation,
  SignalIntent,
  StatusState
} from "../../core/types.js";

export const DEV_STACK_MEMBERS = Object.freeze([
  "api", "ui", "tls_front_door", "runner"
] as const);
type DevStackMember = typeof DEV_STACK_MEMBERS[number];

export type ExpectedSetPolicy = Readonly<{
  openAfterFailures: number;
  clearAfterSuccesses: number;
  groupMemoryMs: number;
}>;

type MemberState = {
  state: ComponentState;
  failures: number;
  successes: number;
  firstFailedAt: Date | null;
  open: boolean;
  openedAt: Date | null;
};

type MemberTransition = Readonly<{
  member: DevStackMember;
  observation: ProbeObservation;
  kind: "OPEN" | "CLEARED";
  firstFailedAt: Date | null;
}>;

export type ExpectedSetEvaluation = Readonly<{
  groupState: Extract<StatusState, "NOT_RUNNING" | "RUNNING" | "PARTIAL" | "EXITED">;
  lastMemberUpAt: Date | null;
  memberStates: Readonly<Record<DevStackMember, ComponentState>>;
  intents: readonly SignalIntent[];
}>;

function validatePolicy(policy: ExpectedSetPolicy): ExpectedSetPolicy {
  if (!Number.isInteger(policy.openAfterFailures) || policy.openAfterFailures < 1
    || !Number.isInteger(policy.clearAfterSuccesses) || policy.clearAfterSuccesses < 1
    || !Number.isFinite(policy.groupMemoryMs) || policy.groupMemoryMs <= 0) {
    throw new TypeError("OBSERVATION_EXPECTED_SET_POLICY_INVALID");
  }
  return Object.freeze({ ...policy });
}

function newMemberState(): MemberState {
  return { state: "UNKNOWN", failures: 0, successes: 0, firstFailedAt: null, open: false, openedAt: null };
}

function impact(component: DevStackMember): SignalIntent["impactCode"] {
  if (component === "api") return "IMPACT_API_DOWN";
  if (component === "ui") return "IMPACT_UI_DOWN";
  if (component === "tls_front_door") return "IMPACT_TLS_DOWN";
  return "IMPACT_RUNNER_GONE";
}

function safeStatus(observation: ProbeObservation): number | "READY" | "FAILED" | "TLS_TRUST" | "PRESENT" | "ABSENT" {
  if (typeof observation.lastStatus === "number") return observation.lastStatus;
  if (["READY", "FAILED", "TLS_TRUST", "PRESENT", "ABSENT"].includes(observation.lastStatus)) {
    return observation.lastStatus as "READY" | "FAILED" | "TLS_TRUST" | "PRESENT" | "ABSENT";
  }
  return observation.ok ? "READY" : "FAILED";
}

function baseIntent(input: Readonly<{
  correlationKey: string;
  component: ObservationComponent;
  state: "OPEN" | "CLEARED";
  severity: SignalIntent["severity"];
  impactCode: SignalIntent["impactCode"];
  at: Date;
  firstFailedAt: Date | null;
  evidence: Readonly<Record<string, unknown>>;
}>): SignalIntent {
  return Object.freeze({
    correlationKey: input.correlationKey,
    component: input.component,
    class: "INFRA_DOWN",
    state: input.state,
    severity: input.severity,
    impactCode: input.impactCode,
    firstFailedProbeAt: input.firstFailedAt,
    detectedAt: input.at,
    evidence: input.evidence,
    suspectedDefect: false,
    defectKind: null,
    runRef: null,
    workItemRef: null
  });
}

export function createExpectedSetTracker(initialPolicy: ExpectedSetPolicy): Readonly<{
  updatePolicy(policy: ExpectedSetPolicy): void;
  observe(observations: readonly ProbeObservation[], at: Date): ExpectedSetEvaluation;
}> {
  let policy = validatePolicy(initialPolicy);
  const states = Object.fromEntries(
    DEV_STACK_MEMBERS.map((member) => [member, newMemberState()])
  ) as Record<DevStackMember, MemberState>;
  let groupOpen: "not_running" | "exited" | null = null;
  let groupOpenedAt: Date | null = null;
  let groupRecoverySuccesses = 0;
  let lastMemberUpAt: Date | null = null;

  function firstGroupFailure(at: Date): Date {
    const candidates = DEV_STACK_MEMBERS.flatMap((member) => {
      const failedAt = states[member].firstFailedAt;
      return failedAt === null ? [] : [failedAt];
    });
    return candidates.reduce((earliest, candidate) =>
      candidate.getTime() < earliest.getTime() ? candidate : earliest, at);
  }

  function updateMember(member: DevStackMember, observation: ProbeObservation, at: Date): MemberTransition | null {
    const current = states[member];
    if (observation.ok) {
      lastMemberUpAt = at;
      current.failures = 0;
      if (current.state !== "DOWN" && current.state !== "RECOVERING") {
        current.state = "UP";
        current.successes = 0;
        current.firstFailedAt = null;
        return null;
      }
      current.successes += 1;
      if (current.successes < policy.clearAfterSuccesses) {
        current.state = "RECOVERING";
        return null;
      }
      current.state = "UP";
      current.successes = 0;
      current.firstFailedAt = null;
      return Object.freeze({ member, observation, kind: "CLEARED", firstFailedAt: current.openedAt });
    }
    current.successes = 0;
    if (current.state === "DOWN") return null;
    current.failures += 1;
    current.firstFailedAt ??= at;
    if (current.failures < policy.openAfterFailures) {
      current.state = "SUSPECT";
      return null;
    }
    current.state = "DOWN";
    return Object.freeze({
      member, observation, kind: "OPEN", firstFailedAt: current.firstFailedAt
    });
  }

  function memberIntent(transition: MemberTransition, at: Date): SignalIntent {
    const current = states[transition.member];
    const clearing = transition.kind === "CLEARED";
    const evidence = {
      probe: transition.observation.probe,
      ...(transition.observation.target === undefined ? {} : { target: transition.observation.target }),
      last_status: safeStatus(transition.observation),
      consecutive_failures: clearing ? 0 : policy.openAfterFailures,
      threshold: clearing ? policy.clearAfterSuccesses : policy.openAfterFailures,
      ...(clearing && current.openedAt !== null ? {
        duration_seconds: Math.max(0, (at.getTime() - current.openedAt.getTime()) / 1_000)
      } : {})
    };
    return baseIntent({
      correlationKey: `member:${transition.member}:infra_down`,
      component: transition.member,
      state: transition.kind,
      severity: "SEVERE",
      impactCode: clearing ? "IMPACT_CLEARED" : impact(transition.member),
      at,
      firstFailedAt: transition.firstFailedAt,
      evidence: Object.freeze(evidence)
    });
  }

  function groupIntent(
    state: "OPEN" | "CLEARED",
    kind: "not_running" | "exited",
    at: Date
  ): SignalIntent {
    const clearing = state === "CLEARED";
    return baseIntent({
      correlationKey: "dev_stack:infra_down",
      component: "dev_stack",
      state,
      severity: kind === "not_running" ? "INFO" : "SEVERE",
      impactCode: clearing ? "IMPACT_CLEARED"
        : kind === "not_running" ? "IMPACT_DEV_STACK_NOT_RUNNING" : "IMPACT_DEV_STACK_EXITED",
      at,
      firstFailedAt: groupOpenedAt,
      evidence: Object.freeze({
        probe: "expected_set",
        members: DEV_STACK_MEMBERS,
        last_status: clearing ? "READY" : kind === "not_running" ? "NOT_RUNNING" : "ABSENT",
        ...(clearing && groupOpenedAt !== null ? {
          duration_seconds: Math.max(0, (at.getTime() - groupOpenedAt.getTime()) / 1_000)
        } : {})
      })
    });
  }

  return Object.freeze({
    updatePolicy(input): void { policy = validatePolicy(input); },
    observe(observations, at) {
      const byComponent = new Map(observations.map((observation) => [observation.component, observation]));
      const transitions: MemberTransition[] = [];
      for (const member of DEV_STACK_MEMBERS) {
        const observation = byComponent.get(member);
        if (observation !== undefined) {
          const transition = updateMember(member, observation, at);
          if (transition !== null) transitions.push(transition);
        }
      }

      const allUp = DEV_STACK_MEMBERS.every((member) => states[member].state === "UP");
      const allDown = DEV_STACK_MEMBERS.every((member) => states[member].state === "DOWN");
      const allObservedUp = DEV_STACK_MEMBERS.every((member) => byComponent.get(member)?.ok === true);
      const intents: SignalIntent[] = [];
      let groupState: ExpectedSetEvaluation["groupState"] = "PARTIAL";

      if (groupOpen === "exited") {
        if (allObservedUp) {
          groupRecoverySuccesses += 1;
          if (groupRecoverySuccesses >= policy.clearAfterSuccesses) {
            intents.push(groupIntent("CLEARED", "exited", at));
            groupOpen = null;
            groupOpenedAt = null;
            groupRecoverySuccesses = 0;
            groupState = "RUNNING";
          } else groupState = "EXITED";
        } else {
          groupRecoverySuccesses = 0;
          groupState = "EXITED";
        }
      } else if (allDown) {
        const recent = lastMemberUpAt !== null
          && at.getTime() - lastMemberUpAt.getTime() <= policy.groupMemoryMs;
        const nextKind = recent ? "exited" : "not_running";
        groupState = recent ? "EXITED" : "NOT_RUNNING";
        if (groupOpen === "not_running" && nextKind === "exited") {
          intents.push(groupIntent("CLEARED", "not_running", at));
          groupOpen = null;
          groupOpenedAt = null;
        }
        if (groupOpen === null) {
          for (const member of DEV_STACK_MEMBERS) {
            const current = states[member];
            const observation = byComponent.get(member);
            if (current.open && observation !== undefined) {
              intents.push(memberIntent(Object.freeze({
                member, observation, kind: "CLEARED", firstFailedAt: current.openedAt
              }), at));
              current.open = false;
              current.openedAt = null;
            }
          }
          groupOpen = nextKind;
          groupOpenedAt = firstGroupFailure(at);
          intents.push(groupIntent("OPEN", nextKind, at));
        }
      } else if (allUp) {
        groupState = "RUNNING";
        if (groupOpen === "not_running") {
          intents.push(groupIntent("CLEARED", "not_running", at));
          groupOpen = null;
          groupOpenedAt = null;
        }
        for (const transition of transitions) {
          if (transition.kind === "CLEARED" && states[transition.member].open) {
            intents.push(memberIntent(transition, at));
            states[transition.member].open = false;
            states[transition.member].openedAt = null;
          }
        }
      } else {
        groupState = "PARTIAL";
        for (const transition of transitions) {
          if (transition.kind === "OPEN" && !states[transition.member].open) {
            states[transition.member].open = true;
            states[transition.member].openedAt = at;
            intents.push(memberIntent(transition, at));
          } else if (transition.kind === "CLEARED" && states[transition.member].open) {
            intents.push(memberIntent(transition, at));
            states[transition.member].open = false;
            states[transition.member].openedAt = null;
          }
        }
      }

      return Object.freeze({
        groupState,
        lastMemberUpAt,
        memberStates: Object.freeze(Object.fromEntries(
          DEV_STACK_MEMBERS.map((member) => [member, states[member].state])
        ) as Record<DevStackMember, ComponentState>),
        intents: Object.freeze(intents)
      });
    }
  });
}
