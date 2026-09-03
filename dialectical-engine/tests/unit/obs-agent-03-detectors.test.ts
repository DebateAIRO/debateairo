import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detectorPath = "apps/observation-agent/src/modules/stall-detectors/detectors.ts";

async function detectorModule() {
  if (!existsSync(detectorPath)) return null;
  return import("../../apps/observation-agent/src/modules/stall-detectors/detectors.js");
}

const runRef = "31000000-0000-4000-8000-000000000001";
const workItemRef = "31000000-0000-4000-8000-000000000002";
const at = (seconds: number) => new Date(1_800_000_000_000 + seconds * 1_000);

function emptyInput(now: Date) {
  return {
    now,
    stallRows: [], readyRows: [], progressRows: [], suspiciousRows: [],
    thresholds: { claimGraceSeconds: 15, readyAgeSeconds: 120, noProgressSeconds: 300 }
  };
}

describe("OBS-03 defect predicates", () => {
  it("opens STALL only for CLAIMED after the strict claim deadline plus grace boundary", async () => {
    const detectors = await detectorModule();
    expect(detectors).not.toBeNull();
    const tracker = detectors!.createDefectDetectorTracker();
    const row = {
      workItemId: workItemRef, runId: runRef, state: "CLAIMED" as const,
      claimDeadline: at(0)
    };
    expect(tracker.observe({ ...emptyInput(at(15)), stallRows: [row] }).candidates).toEqual([]);
    expect(tracker.observe({ ...emptyInput(at(15.001)), stallRows: [row] }).candidates)
      .toEqual([expect.objectContaining({
        class: "STALL", severity: "SEVERE", defectKind: "STALL_DETECTED",
        runRef, workItemRef, firstFailedProbeAt: at(15),
        evidence: {
          count: 1, state: "CLAIMED", claim_deadline: at(0).toISOString(),
          grace_s: 15, health: "HEALTHY"
        }
      })]);
    const invalid = { ...row, state: "RUNNING" } as never;
    expect(detectors!.createDefectDetectorTracker()
      .observe({ ...emptyInput(at(16)), stallRows: [invalid] }).candidates).toEqual([]);
  });

  it("opens QUEUE_NOT_DRAINING at 120 seconds from the local first observation", async () => {
    const detectors = await detectorModule();
    expect(detectors).not.toBeNull();
    const tracker = detectors!.createDefectDetectorTracker();
    const ready = [{ workItemId: workItemRef, runId: runRef, state: "READY" as const }];
    expect(tracker.observe({ ...emptyInput(at(0)), readyRows: ready }).candidates).toEqual([]);
    expect(tracker.observe({ ...emptyInput(at(119.999)), readyRows: ready }).candidates).toEqual([]);
    expect(tracker.observe({ ...emptyInput(at(120)), readyRows: ready }).candidates)
      .toEqual([expect.objectContaining({
        class: "QUEUE_NOT_DRAINING", severity: "SEVERE", defectKind: "STALL_DETECTED",
        runRef, workItemRef, firstFailedProbeAt: at(0),
        evidence: {
          state: "READY", ready_age_s: 120, ready_threshold_s: 120, health: "HEALTHY"
        }
      })]);
  });

  it("opens NO_PROGRESS after 300 seconds and resets the clock on a higher sequence", async () => {
    const detectors = await detectorModule();
    expect(detectors).not.toBeNull();
    const tracker = detectors!.createDefectDetectorTracker();
    const progress = [{ runId: runRef, latestProgressSeq: 7 }];
    expect(tracker.observe({ ...emptyInput(at(0)), progressRows: progress }).candidates).toEqual([]);
    expect(tracker.observe({ ...emptyInput(at(299.999)), progressRows: progress }).candidates).toEqual([]);
    expect(tracker.observe({ ...emptyInput(at(300)), progressRows: progress }).candidates)
      .toEqual([expect.objectContaining({
        class: "NO_PROGRESS", severity: "SEVERE", defectKind: "SILENT_NOOP",
        runRef, workItemRef: null, firstFailedProbeAt: at(0),
        evidence: {
          count: 1, last_progress_seq: 7, silence_s: 300,
          silence_threshold_s: 300, health: "HEALTHY"
        }
      })]);
    expect(tracker.observe({
      ...emptyInput(at(301)), progressRows: [{ runId: runRef, latestProgressSeq: 8 }]
    }).candidates).toEqual([]);
    expect(tracker.observe({
      ...emptyInput(at(600)), progressRows: [{ runId: runRef, latestProgressSeq: 8 }]
    }).candidates).toEqual([]);
  });

  it("opens SUSPICIOUS_SUCCESS only for DONE without the required artifact", async () => {
    const detectors = await detectorModule();
    expect(detectors).not.toBeNull();
    const tracker = detectors!.createDefectDetectorTracker();
    const result = tracker.observe({ ...emptyInput(at(0)), suspiciousRows: [{
      workItemId: workItemRef, runId: runRef, state: "DONE" as const,
      settledArtifactPresent: false
    }] });
    expect(result.candidates).toEqual([expect.objectContaining({
      class: "SUSPICIOUS_SUCCESS", severity: "SEVERE", defectKind: "SUSPICIOUS_SUCCESS",
      runRef, workItemRef,
      evidence: {
        count: 1, state: "DONE", artifact_present: false, health: "HEALTHY"
      }
    })]);
  });

  it("projects stalled, oldest READY, no-progress, and suspicious-success status", async () => {
    const detectors = await detectorModule();
    expect(detectors).not.toBeNull();
    const tracker = detectors!.createDefectDetectorTracker();
    const ready = [{ workItemId: workItemRef, runId: runRef, state: "READY" as const }];
    tracker.observe({ ...emptyInput(at(0)), readyRows: ready,
      progressRows: [{ runId: runRef, latestProgressSeq: 1 }] });
    const observed = tracker.observe({
      ...emptyInput(at(300)),
      stallRows: [{ workItemId: workItemRef, runId: runRef, state: "CLAIMED",
        claimDeadline: at(0) }],
      readyRows: ready,
      progressRows: [{ runId: runRef, latestProgressSeq: 1 }],
      suspiciousRows: [{ workItemId: workItemRef, runId: runRef, state: "DONE",
        settledArtifactPresent: false }]
    });
    expect(observed.status).toEqual({
      state: "OPEN",
      projections: [
        { kind: "metric", key: "runner.oldest_ready", value: 300, unit: "SECONDS",
          observedAt: at(300) },
        { kind: "metric", key: "runner.stalled_items", value: 1, unit: "COUNT",
          observedAt: at(300) },
        { kind: "metric", key: "runner.no_progress_runs", value: 1, unit: "COUNT",
          observedAt: at(300) },
        { kind: "metric", key: "runner.suspicious_success", value: 1, unit: "COUNT",
          observedAt: at(300) }
      ]
    });
  });
});
