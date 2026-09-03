import type { ModuleStatusProjection, SignalIntent } from "../../core/types.js";
import type { ContainerInspection, WitnessedComponent } from "./inspect.js";

type WitnessState = {
  previousStartedAt: Date | null;
  seenUp: boolean;
  absentOpen: boolean;
  absentOpenedAt: Date | null;
};

export type ContainerWitnessEvaluation = Readonly<{
  intents: readonly SignalIntent[];
  projections: readonly ModuleStatusProjection[];
}>;

function safePolicy(value: string): "no" | "always" | "unless-stopped" | "on-failure" | "UNKNOWN" {
  return ["no", "always", "unless-stopped", "on-failure"].includes(value)
    ? value as "no" | "always" | "unless-stopped" | "on-failure"
    : "UNKNOWN";
}

export function createContainerWitness(input: Readonly<{
  agentStartedAt: Date;
  absentAfterMs: number;
}>): Readonly<{
  updatePolicy(policy: Readonly<{ absentAfterMs: number }>): void;
  observe(inspections: readonly ContainerInspection[], at: Date): ContainerWitnessEvaluation;
}> {
  let absentAfterMs = input.absentAfterMs;
  const states = new Map<WitnessedComponent, WitnessState>();

  function stateFor(component: WitnessedComponent): WitnessState {
    const current = states.get(component) ?? {
      previousStartedAt: null, seenUp: false, absentOpen: false, absentOpenedAt: null
    };
    states.set(component, current);
    return current;
  }

  function restartIntents(
    inspection: ContainerInspection,
    previous: Date,
    at: Date
  ): readonly SignalIntent[] {
    const evidence = Object.freeze({
      old_started_at: previous.toISOString(),
      new_started_at: inspection.startedAt!.toISOString(),
      restart_count: inspection.restartCount,
      restart_policy: safePolicy(inspection.restartPolicy),
      exit_code: inspection.exitCode
    });
    const common = {
      correlationKey: `restart:${inspection.component}:${inspection.startedAt!.toISOString()}`,
      component: inspection.component,
      class: "RESTART_WITNESSED" as const,
      severity: "INFO" as const,
      firstFailedProbeAt: at,
      detectedAt: at,
      suspectedDefect: false,
      defectKind: null,
      runRef: null,
      workItemRef: null
    };
    return Object.freeze([
      Object.freeze({ ...common, state: "OPEN" as const, impactCode: "IMPACT_RESTART" as const, evidence }),
      Object.freeze({
        ...common,
        state: "CLEARED" as const,
        impactCode: "IMPACT_CLEARED" as const,
        evidence: Object.freeze({ ...evidence, duration_seconds: 0 })
      })
    ]);
  }

  function expectedIntent(
    inspection: ContainerInspection,
    state: "OPEN" | "CLEARED",
    at: Date,
    openedAt: Date | null
  ): SignalIntent {
    return Object.freeze({
      correlationKey: `expected:${inspection.component}`,
      component: inspection.component,
      class: "EXPECTED_ABSENT",
      state,
      severity: "SEVERE",
      impactCode: state === "OPEN" ? "IMPACT_EXPECTED_ABSENT" : "IMPACT_CLEARED",
      firstFailedProbeAt: input.agentStartedAt,
      detectedAt: at,
      evidence: Object.freeze({
        expected: "always",
        absent_for_s: Math.max(0, (at.getTime() - input.agentStartedAt.getTime()) / 1_000),
        first_observed_at: input.agentStartedAt.toISOString(),
        ...(state === "CLEARED" && openedAt !== null ? {
          duration_seconds: Math.max(0, (at.getTime() - openedAt.getTime()) / 1_000)
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
      if (!Number.isFinite(policy.absentAfterMs) || policy.absentAfterMs <= 0) {
        throw new TypeError("OBSERVATION_WITNESS_POLICY_INVALID");
      }
      absentAfterMs = policy.absentAfterMs;
    },
    observe(inspections, at) {
      const intents: SignalIntent[] = [];
      const projections: ModuleStatusProjection[] = [];
      for (const inspection of inspections) {
        const current = stateFor(inspection.component);
        const appeared = inspection.status === "running" && inspection.startedAt !== null;
        if (inspection.startedAt !== null) {
          if (current.previousStartedAt !== null
            && current.previousStartedAt.getTime() !== inspection.startedAt.getTime()) {
            intents.push(...restartIntents(inspection, current.previousStartedAt, at));
          }
          current.previousStartedAt = inspection.startedAt;
        }
        if (appeared) {
          current.seenUp = true;
          if (current.absentOpen) {
            intents.push(expectedIntent(inspection, "CLEARED", at, current.absentOpenedAt));
            current.absentOpen = false;
            current.absentOpenedAt = null;
          }
        } else if (!current.seenUp && !current.absentOpen
          && at.getTime() - input.agentStartedAt.getTime() >= absentAfterMs) {
          current.absentOpen = true;
          current.absentOpenedAt = at;
          intents.push(expectedIntent(inspection, "OPEN", at, null));
        }

        projections.push(
          Object.freeze({
            kind: "timestamp", key: `container.${inspection.component}.started_at`,
            value: inspection.startedAt
          }),
          Object.freeze({
            kind: "metric", key: `container.${inspection.component}.restart_count`,
            value: inspection.restartCount, unit: "COUNT"
          }),
          Object.freeze({
            kind: "state", key: `container.${inspection.component}.restart_policy.${safePolicy(inspection.restartPolicy).toLowerCase()}`,
            state: "CURRENT"
          }),
          Object.freeze({
            kind: "metric", key: `container.${inspection.component}.exit_code`,
            value: inspection.exitCode, unit: "COUNT"
          })
        );
      }
      return Object.freeze({ intents: Object.freeze(intents), projections: Object.freeze(projections) });
    }
  });
}
