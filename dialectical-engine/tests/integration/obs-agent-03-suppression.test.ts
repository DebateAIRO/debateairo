import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lifecyclePath = "apps/observation-agent/src/modules/stall-detectors/lifecycle.ts";

async function lifecycleModule() {
  if (!existsSync(lifecyclePath)) return null;
  return import("../../apps/observation-agent/src/modules/stall-detectors/lifecycle.js");
}

function stallCandidate() {
  return {
    correlationKey: "STALL:30000000-0000-4000-8000-000000000002",
    component: "runner" as const,
    class: "STALL" as const,
    severity: "SEVERE" as const,
    impactCode: "IMPACT_STALL" as const,
    firstFailedProbeAt: new Date("2026-09-03T08:00:00.000Z"),
    detectedAt: new Date("2026-09-03T08:00:15.000Z"),
    evidence: {
      count: 1, state: "CLAIMED", claim_deadline: "2026-09-03T07:59:45.000Z",
      grace_s: 15, health: "HEALTHY"
    },
    suspectedDefect: true,
    defectKind: "STALL_DETECTED" as const,
    runRef: "30000000-0000-4000-8000-000000000001",
    workItemRef: "30000000-0000-4000-8000-000000000002"
  };
}

describe("OBS-03 infrastructure suppression", () => {
  it("opens defect candidates only while runner, Postgres, and Hatchet are healthy", async () => {
    const lifecycle = await lifecycleModule();
    expect(lifecycle).not.toBeNull();
    const tracker = lifecycle!.createDefectLifecycle();
    const healthy = { runner: "FRESH" as const, postgres: "UP" as const, hatchet: "UP" as const };
    const stale = { ...healthy, runner: "STALE" as const };

    expect(tracker.reconcile([stallCandidate()], stale, new Date("2026-09-03T08:00:15.000Z")))
      .toEqual([]);
    expect(tracker.reconcile([stallCandidate()], healthy, new Date("2026-09-03T08:00:15.000Z")))
      .toEqual([expect.objectContaining({
        correlationKey: stallCandidate().correlationKey,
        state: "OPEN",
        suspectedDefect: true,
        defectKind: "STALL_DETECTED"
      })]);
    expect(tracker.reconcile([stallCandidate()], healthy, new Date("2026-09-03T08:00:30.000Z")))
      .toEqual([]);
  });

  it("clears an open defect before suppressing the stale-heartbeat cycle", async () => {
    const lifecycle = await lifecycleModule();
    expect(lifecycle).not.toBeNull();
    const tracker = lifecycle!.createDefectLifecycle();
    const healthy = { runner: "FRESH" as const, postgres: "UP" as const, hatchet: "UP" as const };
    const postgresDown = { ...healthy, postgres: "DOWN" as const };
    expect(tracker.reconcile([stallCandidate()], healthy, new Date("2026-09-03T08:00:15.000Z")))
      .toHaveLength(1);
    expect(tracker.reconcile([stallCandidate()], postgresDown, new Date("2026-09-03T08:00:30.000Z")))
      .toEqual([expect.objectContaining({
        correlationKey: stallCandidate().correlationKey,
        state: "CLEARED",
        impactCode: "IMPACT_CLEARED",
        evidence: { duration_seconds: 15 },
        suspectedDefect: true,
        defectKind: "STALL_DETECTED"
      })]);
    expect(tracker.reconcile([stallCandidate()], postgresDown, new Date("2026-09-03T08:00:45.000Z")))
      .toEqual([]);
  });

  it("treats UNKNOWN infrastructure as ineligible rather than healthy", async () => {
    const lifecycle = await lifecycleModule();
    expect(lifecycle).not.toBeNull();
    const tracker = lifecycle!.createDefectLifecycle();
    expect(tracker.reconcile([stallCandidate()], {
      runner: "UNKNOWN", postgres: "UP", hatchet: "UP"
    }, new Date("2026-09-03T08:00:15.000Z"))).toEqual([]);
  });
});
