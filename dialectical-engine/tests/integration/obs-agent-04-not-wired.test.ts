import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const modulePath = "apps/observation-agent/src/modules/capture-health/module.ts";
const temporaryDirectories: string[] = [];
const at = (day: number, seconds = 0) =>
  new Date(Date.UTC(2026, 8, day, 8, 0, seconds));

async function captureModule() {
  if (!existsSync(modulePath)) return null;
  return import("../../apps/observation-agent/src/modules/capture-health/module.js");
}

function snapshot(input: Readonly<{
  state?: "CURRENT" | "UNKNOWN";
  flushAt?: Date;
}> = {}) {
  return {
    state: input.state ?? "CURRENT",
    gaps: [],
    health: input.flushAt === undefined ? [] : [{
      runtime: "runner", state: "HEALTHY", observedAt: input.flushAt,
      detailCode: "FLUSH_OK"
    }],
    receipts: [],
    cursor: { captureGapMs: 0, componentHealthMs: 0, spoolReceiptMs: 0 }
  };
}

function context(now: Date, stateDir: string) {
  return {
    now, timeoutMs: 2_000, databaseUrl: "postgresql://isolated/obs04",
    stateDir, targets: [], targetFragment: null, configuration: {},
    thresholds: {
      detector_interval_ms: 15_000, blind_window_s: 120,
      gap_window_s: 300, gap_severe_lost_count: 100,
      expected_runtimes: ["runner"]
    }
  };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("OBS-04 NOT WIRED authority", () => {
  it("keeps process liveness subordinate to positive FLUSH_OK authority and clears only on it", async () => {
    const implementation = await captureModule();
    expect(implementation).not.toBeNull();
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-not-wired-"));
    temporaryDirectories.push(stateDir);
    let current = snapshot();
    const manifest = implementation!.createCaptureHealthModule({
      readSnapshot: async () => current,
      readRuntimeLiveness: async () => ({ runner: "UP" as const })
    });

    const first = await manifest.probe(context(at(3), stateDir));
    expect(first).toEqual([expect.objectContaining({
      component: "obs_capture", ok: false, management: "module",
      statusState: "NOT_WIRED",
      status: expect.arrayContaining([
        { kind: "template", key: "obs_capture", template: "CAPTURE_NOT_WIRED", count: 0 },
        expect.objectContaining({ kind: "state", key: "runner.capture", state: "NOT_WIRED" })
      ])
    })]);
    expect(manifest.signals(first, { ...context(at(3), stateDir), thresholdVersion: 1 }))
      .toEqual([expect.objectContaining({
        correlationKey: "not-wired:runner", class: "CAPTURE_NOT_WIRED", state: "OPEN",
        severity: "INFO", impactCode: "IMPACT_CAPTURE_NOT_WIRED",
        evidence: { runtime: "runner", flush_ok_count: 0, health: "NOT_WIRED" },
        suspectedDefect: false, defectKind: null, runRef: null, workItemRef: null
      })]);

    const repeated = await manifest.probe(context(at(3, 15), stateDir));
    expect(manifest.signals(repeated, {
      ...context(at(3, 15), stateDir), thresholdVersion: 1
    })).toEqual([]);

    current = snapshot({ flushAt: at(3, 20) });
    const wired = await manifest.probe(context(at(3, 30), stateDir));
    expect(wired[0]).toMatchObject({ ok: true, statusState: "WIRED_CURRENT" });
    expect(manifest.signals(wired, {
      ...context(at(3, 30), stateDir), thresholdVersion: 1
    })).toEqual([expect.objectContaining({
      correlationKey: "not-wired:runner", class: "CAPTURE_NOT_WIRED", state: "CLEARED",
      impactCode: "IMPACT_CLEARED", suspectedDefect: false, defectKind: null
    })]);
  });

  it("deduplicates the fixed NOT-WIRED digest impact once per UTC day", async () => {
    const implementation = await captureModule();
    expect(implementation).not.toBeNull();
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-daily-"));
    temporaryDirectories.push(stateDir);
    const manifest = implementation!.createCaptureHealthModule({
      readSnapshot: async () => snapshot(),
      readRuntimeLiveness: async () => ({ runner: "UP" as const })
    });

    for (const now of [at(3), at(3, 15), at(4), at(4, 15)]) {
      const observed = await manifest.probe(context(now, stateDir));
      manifest.signals(observed, { ...context(now, stateDir), thresholdVersion: 1 });
    }
    const dayTwo = await readFile(join(stateDir, "digest", "2026-09-04.md"), "utf8");
    expect(dayTwo.match(/CAPTURE_NOT_WIRED.*Error capture is not wired into the product/gmu))
      .toHaveLength(1);
  });

  it("projects UNKNOWN without clearing or claiming health when a capture read fails", async () => {
    const implementation = await captureModule();
    expect(implementation).not.toBeNull();
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-unknown-"));
    temporaryDirectories.push(stateDir);
    const manifest = implementation!.createCaptureHealthModule({
      readSnapshot: async () => snapshot({ state: "UNKNOWN" }),
      readRuntimeLiveness: async () => ({ runner: "UP" as const })
    });
    const observed = await manifest.probe(context(at(3), stateDir));
    expect(observed).toEqual([expect.objectContaining({
      component: "obs_capture", ok: false, statusState: "UNKNOWN",
      status: [expect.objectContaining({ kind: "state", state: "UNKNOWN" })]
    })]);
    expect(manifest.signals(observed, {
      ...context(at(3), stateDir), thresholdVersion: 1
    })).toEqual([]);
  });
});
