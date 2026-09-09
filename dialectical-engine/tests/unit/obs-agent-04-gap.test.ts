import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const gapPath = "apps/observation-agent/src/modules/capture-health/gaps.ts";
const at = (seconds: number) => new Date(1_800_300_000_000 + seconds * 1_000);

async function gapModule() {
  if (!existsSync(gapPath)) return null;
  return import("../../apps/observation-agent/src/modules/capture-health/gaps.js");
}

function gap(input: Readonly<{
  id: string;
  source?: string;
  gapClass?: string;
  lostCount: number;
  openedAt?: Date;
  closedAt: Date | null;
}>) {
  return {
    captureGapId: input.id,
    source: input.source ?? "first_party",
    gapClass: input.gapClass ?? "QUEUE_FULL",
    lostCount: input.lostCount,
    openedAt: input.openedAt ?? at(0),
    closedAt: input.closedAt
  };
}

function input(now: Date, gaps: readonly ReturnType<typeof gap>[]) {
  return {
    snapshot: {
      state: "CURRENT" as const, gaps, health: [], receipts: [],
      cursor: { captureGapMs: 0, componentHealthMs: 0, spoolReceiptMs: 0 }
    },
    now,
    windowSeconds: 300,
    severeLostCount: 100
  };
}

describe("OBS-04 typed capture gaps", () => {
  it("opens a completed typed row within 17 seconds and clears after one quiet cycle", async () => {
    const implementation = await gapModule();
    expect(implementation).not.toBeNull();
    const tracker = implementation!.createCaptureGapTracker();
    const row = gap({
      id: "42000000-0000-4000-8000-000000000001",
      lostCount: 7,
      closedAt: at(0)
    });
    const opened = tracker.observe(input(at(17), [row]));
    expect(opened.intents).toEqual([expect.objectContaining({
      correlationKey: "gap:first_party:first_party:QUEUE_FULL",
      class: "CAPTURE_GAP", state: "OPEN", severity: "DEGRADED",
      impactCode: "IMPACT_CAPTURE_GAP", firstFailedProbeAt: at(0),
      detectedAt: at(17),
      evidence: {
        runtime: "first_party", source: "first_party", gap_class: "QUEUE_FULL",
        lost_count: 7, opened_at: at(0).toISOString(), closed_at: at(0).toISOString()
      },
      suspectedDefect: false, defectKind: null, runRef: null, workItemRef: null
    })]);
    expect(opened.projections).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "first_party.capture_gap_open", value: 1 }),
      expect.objectContaining({ key: "first_party.capture_gap_lost", value: 7 }),
      expect.objectContaining({ key: "first_party.capture_gap_severity", state: "DEGRADED" })
    ]));
    expect(tracker.observe(input(at(32), [row])).intents).toEqual([
      expect.objectContaining({
        correlationKey: "gap:first_party:first_party:QUEUE_FULL",
        class: "CAPTURE_GAP", state: "CLEARED", impactCode: "IMPACT_CLEARED",
        detectedAt: at(32), evidence: { duration_seconds: 15 },
        suspectedDefect: false, defectKind: null
      })
    ]);
  });

  it("aggregates the five-minute band at exactly 100 and deduplicates one OPEN identity", async () => {
    const implementation = await gapModule();
    expect(implementation).not.toBeNull();
    const tracker = implementation!.createCaptureGapTracker();
    const rows = [
      gap({ id: "42000000-0000-4000-8000-000000000002", lostCount: 99,
        closedAt: null }),
      gap({ id: "42000000-0000-4000-8000-000000000003", lostCount: 1,
        closedAt: null })
    ];
    const opened = tracker.observe(input(at(15), rows));
    expect(opened.intents).toHaveLength(1);
    expect(opened.intents[0]).toMatchObject({
      severity: "SEVERE",
      evidence: { lost_count: 100 }
    });
    expect(tracker.observe(input(at(30), rows)).intents).toEqual([]);
  });

  it("holds OPEN rows through repeated samples and clears a row only after closed_at appears", async () => {
    const implementation = await gapModule();
    expect(implementation).not.toBeNull();
    const tracker = implementation!.createCaptureGapTracker();
    const open = gap({
      id: "42000000-0000-4000-8000-000000000004",
      source: "hatchet", gapClass: "EMIT_FAILURE", lostCount: 1, closedAt: null
    });
    expect(tracker.observe(input(at(0), [open])).intents).toHaveLength(1);
    expect(tracker.observe(input(at(15), [open])).intents).toEqual([]);
    expect(tracker.observe(input(at(30), [{ ...open, closedAt: at(29) }])).intents)
      .toEqual([expect.objectContaining({ state: "CLEARED", detectedAt: at(30) })]);
  });

  it("never clears or opens from an UNKNOWN relation snapshot", async () => {
    const implementation = await gapModule();
    expect(implementation).not.toBeNull();
    const tracker = implementation!.createCaptureGapTracker();
    const current = input(at(0), [gap({
      id: "42000000-0000-4000-8000-000000000005", lostCount: 1, closedAt: null
    })]);
    expect(tracker.observe(current).intents).toHaveLength(1);
    expect(tracker.observe({ ...current, now: at(15), snapshot: {
      ...current.snapshot, state: "UNKNOWN" as const, gaps: []
    } }).intents).toEqual([]);
  });
});
