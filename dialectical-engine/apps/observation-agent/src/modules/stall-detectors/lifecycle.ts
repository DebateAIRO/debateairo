import type { ObservationSignal } from "../../core/signals.js";
import type { RestoredOpenSignal, SignalIntent } from "../../core/types.js";

export type InfrastructureHealth = Readonly<{
  runner: "UNKNOWN" | "FRESH" | "STALE";
  postgres: "UNKNOWN" | "UP" | "DOWN";
  hatchet: "UNKNOWN" | "UP" | "DOWN";
}>;

export type DefectCandidate = Readonly<Omit<SignalIntent, "state">>;

type OpenDefect = Readonly<{
  candidate: DefectCandidate;
  openedAt: Date;
}>;

function identity(candidate: DefectCandidate): string {
  return [candidate.component, candidate.class, candidate.runRef ?? "-", candidate.workItemRef ?? "-"]
    .join(":");
}

function eligible(health: InfrastructureHealth): boolean {
  return health.runner === "FRESH" && health.postgres === "UP" && health.hatchet === "UP";
}

function requireDefectCandidate(candidate: DefectCandidate): void {
  const expectedKinds = {
    STALL: "STALL_DETECTED",
    QUEUE_NOT_DRAINING: "STALL_DETECTED",
    NO_PROGRESS: "SILENT_NOOP",
    SUSPICIOUS_SUCCESS: "SUSPICIOUS_SUCCESS"
  } as const;
  const expectedImpacts = {
    STALL: "IMPACT_STALL",
    QUEUE_NOT_DRAINING: "IMPACT_QUEUE",
    NO_PROGRESS: "IMPACT_NO_PROGRESS",
    SUSPICIOUS_SUCCESS: "IMPACT_SUSPICIOUS_SUCCESS"
  } as const;
  if (candidate.component !== "runner"
    || candidate.severity !== "SEVERE"
    || !candidate.suspectedDefect
    || !(candidate.class in expectedKinds)
    || candidate.defectKind !== expectedKinds[candidate.class as keyof typeof expectedKinds]
    || candidate.impactCode !== expectedImpacts[candidate.class as keyof typeof expectedImpacts]
    || candidate.runRef === null
    || (candidate.class === "NO_PROGRESS"
      ? candidate.workItemRef !== null
      : candidate.workItemRef === null)) {
    throw new TypeError("OBSERVATION_DEFECT_CANDIDATE_INVALID");
  }
}

function exactEvidence(signal: ObservationSignal): boolean {
  const evidence = signal.evidence as Readonly<Record<string, unknown>>;
  const keys = Object.keys(evidence).sort().join(":");
  if (signal.class === "STALL") {
    return keys === "claim_deadline:count:grace_s:health:state"
      && evidence.count === 1 && evidence.state === "CLAIMED"
      && typeof evidence.claim_deadline === "string"
      && Number.isFinite(new Date(evidence.claim_deadline).getTime())
      && typeof evidence.grace_s === "number" && Number.isFinite(evidence.grace_s)
      && evidence.grace_s >= 0 && evidence.health === "HEALTHY";
  }
  if (signal.class === "QUEUE_NOT_DRAINING") {
    return keys === "health:ready_age_s:ready_threshold_s:state"
      && evidence.state === "READY" && evidence.health === "HEALTHY"
      && typeof evidence.ready_age_s === "number" && Number.isFinite(evidence.ready_age_s)
      && typeof evidence.ready_threshold_s === "number"
      && Number.isFinite(evidence.ready_threshold_s) && evidence.ready_threshold_s > 0
      && evidence.ready_age_s >= evidence.ready_threshold_s;
  }
  if (signal.class === "NO_PROGRESS") {
    return keys === "count:health:last_progress_seq:silence_s:silence_threshold_s"
      && evidence.count === 1 && evidence.health === "HEALTHY"
      && Number.isInteger(evidence.last_progress_seq)
      && (evidence.last_progress_seq as number) >= 0
      && typeof evidence.silence_s === "number" && Number.isFinite(evidence.silence_s)
      && typeof evidence.silence_threshold_s === "number"
      && Number.isFinite(evidence.silence_threshold_s) && evidence.silence_threshold_s > 0
      && evidence.silence_s >= evidence.silence_threshold_s;
  }
  return signal.class === "SUSPICIOUS_SUCCESS"
    && keys === "artifact_present:count:health:state"
    && evidence.count === 1 && evidence.state === "DONE"
    && evidence.artifact_present === false && evidence.health === "HEALTHY";
}

export function createDefectLifecycle(): Readonly<{
  legacyCorrelationKey(signal: ObservationSignal): string | null;
  restore(openSignals: readonly RestoredOpenSignal[]): void;
  reconcile(
    candidates: readonly DefectCandidate[],
    health: InfrastructureHealth,
    now: Date
  ): readonly SignalIntent[];
}> {
  const opened = new Map<string, OpenDefect>();
  function restoredKey(signal: ObservationSignal): string | null {
    const expected = {
      STALL: Object.freeze({ impact: "IMPACT_STALL", kind: "STALL_DETECTED", refs: "BOTH" }),
      QUEUE_NOT_DRAINING: Object.freeze({
        impact: "IMPACT_QUEUE", kind: "STALL_DETECTED", refs: "BOTH"
      }),
      NO_PROGRESS: Object.freeze({
        impact: "IMPACT_NO_PROGRESS", kind: "SILENT_NOOP", refs: "RUN"
      }),
      SUSPICIOUS_SUCCESS: Object.freeze({
        impact: "IMPACT_SUSPICIOUS_SUCCESS", kind: "SUSPICIOUS_SUCCESS", refs: "BOTH"
      })
    } as const;
    if (signal.state !== "OPEN"
      || signal.component !== "runner"
      || signal.severity !== "SEVERE"
      || !signal.suspected_defect
      || !(signal.class in expected)
      || !exactEvidence(signal)) return null;
    const shape = expected[signal.class as keyof typeof expected];
    if (signal.impact_code !== shape.impact
      || signal.defect_kind !== shape.kind
      || signal.run_ref === null
      || (shape.refs === "BOTH" ? signal.work_item_ref === null : signal.work_item_ref !== null)) {
      return null;
    }
    return signal.class === "NO_PROGRESS"
      ? `NO_PROGRESS:${signal.run_ref}`
      : `${signal.class}:${signal.work_item_ref}`;
  }
  return Object.freeze({
    legacyCorrelationKey(signal): string | null {
      return restoredKey(signal);
    },
    restore(openSignals): void {
      for (const restored of openSignals) {
        const signal = restored.signal;
        const evidence = signal.evidence as Readonly<Record<string, unknown>>;
        const correlationKey = restoredKey(signal);
        if (correlationKey === null || correlationKey !== restored.correlationKey) {
          throw new TypeError("OBSERVATION_DEFECT_RESTORE_INVALID");
        }
        const candidate: DefectCandidate = Object.freeze({
          correlationKey,
          component: signal.component,
          class: signal.class,
          severity: signal.severity,
          impactCode: signal.impact_code,
          firstFailedProbeAt: signal.first_failed_probe_at === null
            ? null
            : new Date(signal.first_failed_probe_at),
          detectedAt: new Date(signal.detected_at),
          evidence,
          suspectedDefect: signal.suspected_defect,
          defectKind: signal.defect_kind,
          runRef: signal.run_ref,
          workItemRef: signal.work_item_ref
        });
        requireDefectCandidate(candidate);
        const key = identity(candidate);
        if (opened.has(key)) throw new TypeError("OBSERVATION_DEFECT_RESTORE_INVALID");
        opened.set(key, Object.freeze({ candidate, openedAt: new Date(signal.detected_at) }));
      }
    },
    reconcile(candidates, health, now) {
      const next = new Map<string, DefectCandidate>();
      for (const candidate of candidates) {
        requireDefectCandidate(candidate);
        if (eligible(health) && !next.has(identity(candidate))) {
          next.set(identity(candidate), candidate);
        }
      }
      const intents: SignalIntent[] = [];
      for (const [key, current] of opened) {
        if (next.has(key)) continue;
        intents.push(Object.freeze({
          ...current.candidate,
          state: "CLEARED",
          impactCode: "IMPACT_CLEARED",
          detectedAt: now,
          evidence: Object.freeze({
            duration_seconds: Math.max(0, (now.getTime() - current.openedAt.getTime()) / 1_000)
          })
        }));
        opened.delete(key);
      }
      for (const [key, candidate] of next) {
        if (opened.has(key)) continue;
        opened.set(key, Object.freeze({ candidate, openedAt: now }));
        intents.push(Object.freeze({ ...candidate, state: "OPEN" }));
      }
      return Object.freeze(intents);
    }
  });
}
