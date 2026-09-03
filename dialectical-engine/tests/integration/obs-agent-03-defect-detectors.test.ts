import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const detectorPath = "apps/observation-agent/src/modules/stall-detectors/detectors.ts";
const lifecyclePath = "apps/observation-agent/src/modules/stall-detectors/lifecycle.ts";

async function modules() {
  if (!existsSync(detectorPath) || !existsSync(lifecyclePath)) return null;
  return {
    detectors: await import("../../apps/observation-agent/src/modules/stall-detectors/detectors.js"),
    lifecycle: await import("../../apps/observation-agent/src/modules/stall-detectors/lifecycle.js")
  };
}

const runRef = "32000000-0000-4000-8000-000000000001";
const workItemRef = "32000000-0000-4000-8000-000000000002";
const origin = 1_800_100_000_000;
const at = (seconds: number) => new Date(origin + seconds * 1_000);
const healthy = { runner: "FRESH" as const, postgres: "UP" as const, hatchet: "UP" as const };

function input(now: Date) {
  return {
    now, stallRows: [], readyRows: [], progressRows: [], suspiciousRows: [],
    thresholds: { claimGraceSeconds: 15, readyAgeSeconds: 120, noProgressSeconds: 300 }
  };
}

describe("OBS-03 healthy-infrastructure defect recovery", () => {
  it.each([
    {
      name: "STALL",
      prime: input(at(16)),
      open: { ...input(at(16)), stallRows: [{
        workItemId: workItemRef, runId: runRef, state: "CLAIMED" as const,
        claimDeadline: at(0)
      }] },
      recover: input(at(31))
    },
    {
      name: "QUEUE_NOT_DRAINING",
      prime: { ...input(at(0)), readyRows: [{
        workItemId: workItemRef, runId: runRef, state: "READY" as const
      }] },
      open: { ...input(at(120)), readyRows: [{
        workItemId: workItemRef, runId: runRef, state: "READY" as const
      }] },
      recover: input(at(135))
    },
    {
      name: "NO_PROGRESS",
      prime: { ...input(at(0)), progressRows: [{ runId: runRef, latestProgressSeq: 4 }] },
      open: { ...input(at(300)), progressRows: [{ runId: runRef, latestProgressSeq: 4 }] },
      recover: { ...input(at(315)), progressRows: [{ runId: runRef, latestProgressSeq: 5 }] }
    },
    {
      name: "SUSPICIOUS_SUCCESS",
      prime: input(at(0)),
      open: { ...input(at(0)), suspiciousRows: [{
        workItemId: workItemRef, runId: runRef, state: "DONE" as const,
        settledArtifactPresent: false as const
      }] },
      recover: input(at(15))
    }
  ])("opens and clears $name using isolated healthy inputs", async ({ name, prime, open, recover }) => {
    const loaded = await modules();
    expect(loaded).not.toBeNull();
    const detector = loaded!.detectors.createDefectDetectorTracker();
    const lifecycle = loaded!.lifecycle.createDefectLifecycle();
    detector.observe(prime);
    const candidateCycle = detector.observe(open);
    const opened = lifecycle.reconcile(candidateCycle.candidates, healthy, open.now);
    expect(opened).toEqual([expect.objectContaining({
      class: name,
      state: "OPEN",
      severity: "SEVERE",
      suspectedDefect: true
    })]);
    const recoveredCycle = detector.observe(recover);
    expect(lifecycle.reconcile(recoveredCycle.candidates, healthy, recover.now))
      .toEqual([expect.objectContaining({
        class: name,
        state: "CLEARED",
        impactCode: "IMPACT_CLEARED",
        suspectedDefect: true
      })]);
  });
});
