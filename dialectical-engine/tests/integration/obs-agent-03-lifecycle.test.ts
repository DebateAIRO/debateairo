import { describe, expect, it } from "vitest";
import { createDefectLifecycle } from "../../apps/observation-agent/src/modules/stall-detectors/lifecycle.js";

const runRef = "33000000-0000-4000-8000-000000000001";
const workItemRef = "33000000-0000-4000-8000-000000000002";
const at = (seconds: number) => new Date(1_800_200_000_000 + seconds * 1_000);
const healthy = { runner: "FRESH" as const, postgres: "UP" as const, hatchet: "UP" as const };

function candidate(
  signalClass: "STALL" | "QUEUE_NOT_DRAINING" | "NO_PROGRESS" | "SUSPICIOUS_SUCCESS"
) {
  const definitions = {
    STALL: { impactCode: "IMPACT_STALL", defectKind: "STALL_DETECTED",
      evidence: { count: 1, state: "CLAIMED", claim_deadline: at(0).toISOString(),
        grace_s: 15, health: "HEALTHY" } },
    QUEUE_NOT_DRAINING: { impactCode: "IMPACT_QUEUE", defectKind: "STALL_DETECTED",
      evidence: { state: "READY", ready_age_s: 120, ready_threshold_s: 120,
        health: "HEALTHY" } },
    NO_PROGRESS: { impactCode: "IMPACT_NO_PROGRESS", defectKind: "SILENT_NOOP",
      evidence: { count: 1, last_progress_seq: 1, silence_s: 300,
        silence_threshold_s: 300, health: "HEALTHY" } },
    SUSPICIOUS_SUCCESS: { impactCode: "IMPACT_SUSPICIOUS_SUCCESS",
      defectKind: "SUSPICIOUS_SUCCESS", evidence: { count: 1, state: "DONE",
        artifact_present: false, health: "HEALTHY" } }
  } as const;
  const definition = definitions[signalClass];
  return {
    correlationKey: `${signalClass}:${workItemRef}`,
    component: "runner" as const,
    class: signalClass,
    severity: "SEVERE" as const,
    impactCode: definition.impactCode,
    firstFailedProbeAt: at(0),
    detectedAt: at(15),
    evidence: definition.evidence,
    suspectedDefect: true,
    defectKind: definition.defectKind,
    runRef,
    workItemRef: signalClass === "NO_PROGRESS" ? null : workItemRef
  };
}

describe("OBS-03 immutable defect lifecycle", () => {
  it("deduplicates the full defect identity and appends exactly four clears", () => {
    const tracker = createDefectLifecycle();
    const candidates = (["STALL", "QUEUE_NOT_DRAINING", "NO_PROGRESS", "SUSPICIOUS_SUCCESS"] as const)
      .map(candidate);
    expect(tracker.reconcile([...candidates, { ...candidates[0]!, correlationKey: "duplicate" }], healthy, at(15)))
      .toEqual(candidates.map((item) => expect.objectContaining({
        correlationKey: item.correlationKey,
        state: "OPEN",
        severity: "SEVERE"
      })));
    expect(tracker.reconcile(candidates, healthy, at(30))).toEqual([]);
    const clears = tracker.reconcile([], healthy, at(45));
    expect(clears).toHaveLength(4);
    expect(clears.map((item) => item.state)).toEqual(["CLEARED", "CLEARED", "CLEARED", "CLEARED"]);
    expect(clears.every((item) => item.suspectedDefect && item.severity === "SEVERE")).toBe(true);
  });

  it("never opens infrastructure rows through the defect lifecycle", () => {
    const tracker = createDefectLifecycle();
    const invalid = {
      ...candidate("STALL"), class: "WORKER_LOST", suspectedDefect: false, defectKind: null
    } as never;
    expect(() => tracker.reconcile([invalid], healthy, at(15))).toThrow("OBSERVATION_DEFECT_CANDIDATE_INVALID");
  });
});
