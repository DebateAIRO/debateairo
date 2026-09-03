import type { SignalIntent } from "../../core/types.js";

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
  if (candidate.component !== "runner"
    || candidate.severity !== "SEVERE"
    || !candidate.suspectedDefect
    || !(candidate.class in expectedKinds)
    || candidate.defectKind !== expectedKinds[candidate.class as keyof typeof expectedKinds]) {
    throw new TypeError("OBSERVATION_DEFECT_CANDIDATE_INVALID");
  }
}

export function createDefectLifecycle(): Readonly<{
  reconcile(
    candidates: readonly DefectCandidate[],
    health: InfrastructureHealth,
    now: Date
  ): readonly SignalIntent[];
}> {
  const opened = new Map<string, OpenDefect>();
  return Object.freeze({
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
