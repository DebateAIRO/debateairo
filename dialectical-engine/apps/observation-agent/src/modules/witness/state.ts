import type { ObservationSignal } from "../../core/signals.js";
import type {
  ModuleStatusProjection, RestoredOpenSignal, SignalIntent
} from "../../core/types.js";
import type { ContainerInspection, WitnessedComponent } from "./inspect.js";

type WitnessState = {
  previousStartedAt: Date | null;
  seenUp: boolean;
  absentOpen: boolean;
  absentOpenedAt: Date | null;
  pendingRestart: RestoredOpenSignal | null;
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
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  updatePolicy(policy: Readonly<{ absentAfterMs: number }>): void;
  observe(inspections: readonly ContainerInspection[], at: Date): ContainerWitnessEvaluation;
}> {
  let agentStartedAt = input.agentStartedAt;
  let absentAfterMs = input.absentAfterMs;
  const states = new Map<WitnessedComponent, WitnessState>();

  function stateFor(component: WitnessedComponent): WitnessState {
    const current = states.get(component) ?? {
      previousStartedAt: null, seenUp: false, absentOpen: false, absentOpenedAt: null,
      pendingRestart: null
    };
    states.set(component, current);
    return current;
  }

  function restoredKey(signal: ObservationSignal): string | null {
    if (signal.state !== "OPEN"
      || !(signal.component === "postgres" || signal.component === "hatchet")
      || signal.first_failed_probe_at === null
      || signal.suspected_defect
      || signal.defect_kind !== null
      || signal.run_ref !== null
      || signal.work_item_ref !== null) return null;
    const evidence = signal.evidence as Readonly<Record<string, unknown>>;
    if (signal.class === "EXPECTED_ABSENT"
      && signal.severity === "SEVERE"
      && signal.impact_code === "IMPACT_EXPECTED_ABSENT"
      && Object.keys(evidence).sort().join(":") === "absent_for_s:expected:first_observed_at"
      && evidence.expected === "always"
      && typeof evidence.absent_for_s === "number"
      && Number.isFinite(evidence.absent_for_s) && evidence.absent_for_s >= 0
      && typeof evidence.first_observed_at === "string"
      && Number.isFinite(new Date(evidence.first_observed_at).getTime())
      && Math.abs(evidence.absent_for_s - Math.max(0, (
        new Date(signal.detected_at).getTime() - new Date(evidence.first_observed_at).getTime()
      ) / 1_000)) < 1e-9) return `expected:${signal.component}`;
    if (signal.class === "RESTART_WITNESSED"
      && signal.severity === "INFO"
      && signal.impact_code === "IMPACT_RESTART"
      && Object.keys(evidence).sort().join(":")
        === "exit_code:new_started_at:old_started_at:restart_count:restart_policy"
      && typeof evidence.old_started_at === "string"
      && typeof evidence.new_started_at === "string"
      && Number.isFinite(new Date(evidence.old_started_at).getTime())
      && Number.isFinite(new Date(evidence.new_started_at).getTime())
      && evidence.old_started_at !== evidence.new_started_at
      && Number.isInteger(evidence.restart_count) && (evidence.restart_count as number) >= 0
      && ["no", "always", "unless-stopped", "on-failure", "UNKNOWN"]
        .includes(evidence.restart_policy as string)
      && Number.isInteger(evidence.exit_code)) {
      return `restart:${signal.component}:${evidence.new_started_at}`;
    }
    return null;
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
      firstFailedProbeAt: agentStartedAt,
      detectedAt: at,
      evidence: Object.freeze({
        expected: "always",
        absent_for_s: Math.max(0, (at.getTime() - agentStartedAt.getTime()) / 1_000),
        first_observed_at: agentStartedAt.toISOString(),
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
    legacyCorrelationKey(signal): string | null {
      return restoredKey(signal);
    },
    restore(openSignals): void {
      for (const restored of openSignals) {
        const signal = restored.signal;
        const evidence = signal.evidence as Readonly<Record<string, unknown>>;
        if (!(signal.component === "postgres" || signal.component === "hatchet")
          || restoredKey(signal) !== restored.correlationKey) {
          throw new TypeError("OBSERVATION_WITNESS_RESTORE_INVALID");
        }
        const current = stateFor(signal.component);
        if (signal.class === "EXPECTED_ABSENT"
          && signal.impact_code === "IMPACT_EXPECTED_ABSENT"
          && evidence.expected === "always"
          && restored.correlationKey === `expected:${signal.component}`
          && !current.absentOpen) {
          agentStartedAt = signal.first_failed_probe_at === null
            ? new Date(signal.detected_at)
            : new Date(signal.first_failed_probe_at);
          current.absentOpen = true;
          current.absentOpenedAt = new Date(signal.detected_at);
          continue;
        }
        const newStartedAt = evidence.new_started_at;
        if (signal.class === "RESTART_WITNESSED"
          && signal.impact_code === "IMPACT_RESTART"
          && typeof newStartedAt === "string"
          && Number.isFinite(new Date(newStartedAt).getTime())
          && restored.correlationKey === `restart:${signal.component}:${newStartedAt}`
          && current.pendingRestart === null) {
          current.previousStartedAt = new Date(newStartedAt);
          current.seenUp = true;
          current.pendingRestart = restored;
          continue;
        }
        throw new TypeError("OBSERVATION_WITNESS_RESTORE_INVALID");
      }
    },
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
        if (current.pendingRestart !== null) {
          const pending = current.pendingRestart;
          const signal = pending.signal;
          const evidence = signal.evidence as Readonly<Record<string, unknown>>;
          intents.push(Object.freeze({
            correlationKey: pending.correlationKey,
            component: signal.component,
            class: "RESTART_WITNESSED",
            state: "CLEARED",
            severity: signal.severity,
            impactCode: "IMPACT_CLEARED",
            firstFailedProbeAt: signal.first_failed_probe_at === null
              ? null : new Date(signal.first_failed_probe_at),
            detectedAt: at,
            evidence: Object.freeze({
              ...evidence,
              duration_seconds: Math.max(
                0,
                (at.getTime() - new Date(signal.detected_at).getTime()) / 1_000
              )
            }),
            suspectedDefect: false,
            defectKind: null,
            runRef: null,
            workItemRef: null
          }));
          current.pendingRestart = null;
        }
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
          && at.getTime() - agentStartedAt.getTime() >= absentAfterMs) {
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
