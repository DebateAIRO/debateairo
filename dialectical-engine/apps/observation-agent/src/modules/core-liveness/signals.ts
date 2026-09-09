import { signalSchema, type ObservationSignal, type Severity } from "../../core/signals.js";
import type { ProbeObservation } from "../../core/types.js";

function impactFor(observation: ProbeObservation): ObservationSignal["impact_code"] {
  if (observation.class === "INFRA_NOT_READY") return "IMPACT_HATCHET_NOT_READY";
  if (observation.class === "INFRA_UNKNOWN" || observation.component === "docker") {
    return "IMPACT_DOCKER_DOWN";
  }
  if (observation.component === "postgres") return "IMPACT_PG_DOWN";
  return "IMPACT_HATCHET_DOWN";
}

function safeLastStatus(
  observation: ProbeObservation
): number | "READY" | "FAILED" | "UNKNOWN" | "WRITTEN" {
  if (typeof observation.lastStatus === "number") return observation.lastStatus;
  if (["READY", "FAILED", "UNKNOWN", "WRITTEN"].includes(observation.lastStatus)) {
    return observation.lastStatus as "READY" | "FAILED" | "UNKNOWN" | "WRITTEN";
  }
  return observation.ok ? "READY" : "FAILED";
}

export function materializeLivenessSignal(input: Readonly<{
  seq: number;
  signalId: string;
  observation: ProbeObservation;
  kind: "OPEN" | "CLEARED";
  at: Date;
  firstFailedAt?: Date;
  thresholdVersion: number;
  threshold: number;
  severity: Severity;
  clearsSignalId?: string;
  openedAt?: Date;
}>): ObservationSignal {
  const commonEvidence = {
    probe: input.observation.probe,
    ...(input.observation.target === undefined ? {} : { target: input.observation.target }),
    last_status: safeLastStatus(input.observation)
  };
  const evidence = input.kind === "CLEARED"
    ? {
        ...commonEvidence,
        consecutive_failures: 0,
        threshold: input.threshold,
        ...(input.openedAt === undefined ? {} : {
          duration_seconds: Math.max(0, (input.at.getTime() - input.openedAt.getTime()) / 1_000)
        })
      }
    : {
        ...commonEvidence,
        consecutive_failures: input.threshold,
        threshold: input.threshold,
        ...(input.observation.containerStatus === undefined ? {} : {
          container_status: input.observation.containerStatus
        }),
        ...(input.observation.restartPolicy === undefined ? {} : {
          restart_policy: input.observation.restartPolicy
        }),
        ...(input.observation.exitCode === undefined ? {} : { exit_code: input.observation.exitCode })
      };
  const timestamp = input.at.toISOString();
  return Object.freeze(signalSchema.parse({
    seq: input.seq,
    signal_id: input.signalId,
    state: input.kind,
    class: input.observation.class,
    component: input.observation.component,
    severity: input.severity,
    impact_code: input.kind === "CLEARED" ? "IMPACT_CLEARED" : impactFor(input.observation),
    first_failed_probe_at: input.firstFailedAt?.toISOString() ?? null,
    detected_at: timestamp,
    evidence,
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: input.thresholdVersion,
    clears_signal_id: input.clearsSignalId ?? null,
    recorded_at: timestamp
  }));
}
