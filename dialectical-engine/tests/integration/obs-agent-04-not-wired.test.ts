import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import { signalSchema } from "../../apps/observation-agent/src/core/signals.js";

const modulePath = "apps/observation-agent/src/modules/capture-health/module.ts";
const temporaryDirectories: string[] = [];
const database = Object.freeze({
  async withClient<T>(): Promise<T> { throw new Error("UNUSED_DATABASE_PORT"); }
});
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
    now, timeoutMs: 2_000, database,
    stateDir, targets: [], targetFragment: null, configuration: {},
    thresholds: {
      detector_interval_ms: 15_000, blind_window_s: 120,
      gap_window_s: 300, gap_severe_lost_count: 100,
      expected_runtimes: ["runner"]
    }
  };
}

function restoredNotWiredOpen() {
  const detectedAt = "2026-09-02T08:00:00.000Z";
  return {
    correlationKey: "not-wired:runner",
    signal: signalSchema.parse({
      seq: 1,
      signal_id: "70000000-0000-4000-8000-000000000409",
      state: "OPEN",
      class: "CAPTURE_NOT_WIRED",
      component: "obs_capture",
      severity: "INFO",
      impact_code: "IMPACT_CAPTURE_NOT_WIRED",
      first_failed_probe_at: detectedAt,
      detected_at: detectedAt,
      evidence: { runtime: "runner", flush_ok_count: 0, health: "NOT_WIRED" },
      suspected_defect: false,
      defect_kind: null,
      run_ref: null,
      work_item_ref: null,
      threshold_version: 1,
      clears_signal_id: null,
      recorded_at: detectedAt
    })
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

  it("deduplicates a restored NOT-WIRED OPEN by its original UUID after restart", async () => {
    const implementation = await captureModule();
    expect(implementation).not.toBeNull();
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-daily-"));
    temporaryDirectories.push(stateDir);
    const manifest = implementation!.createCaptureHealthModule({
      readSnapshot: async () => snapshot(),
      readRuntimeLiveness: async () => ({ runner: "UP" as const })
    });
    const restored = restoredNotWiredOpen();
    const runtime = new ObservationModuleRuntime({
      modules: [manifest],
      replayedOpenSignals: [{
        signal: restored.signal,
        lifecycle: { owner: "capture-health", correlationKey: restored.correlationKey }
      }],
      nextSequence: () => { throw new Error("UNEXPECTED_SIGNAL_SEQUENCE"); },
      nextSignalId: () => { throw new Error("UNEXPECTED_SIGNAL_ID"); },
      sampleStore: { async write() {} },
      emitSignal: async () => { throw new Error("UNEXPECTED_SIGNAL_EMIT"); }
    });

    for (const now of [at(3), at(3, 15), at(4), at(4, 15)]) {
      await runtime.run({
        modules: [manifest], now, timeoutMs: 2_000, database, stateDir,
        repoRoot: process.cwd(), targets: [], thresholdVersion: 1,
        moduleThresholds: { "capture-health": context(now, stateDir).thresholds }
      });
    }
    const dayTwo = await readFile(join(stateDir, "digest", "2026-09-04.md"), "utf8");
    expect(dayTwo.match(/CAPTURE_NOT_WIRED.*Error capture is not wired into the product/gmu))
      .toHaveLength(1);
    expect(dayTwo).toContain(restored.signal.signal_id);
  });

  it("never falls back to boot-only OPEN state when current runtime identities are absent", async () => {
    const implementation = await captureModule();
    expect(implementation).not.toBeNull();
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-daily-no-current-opens-"));
    temporaryDirectories.push(stateDir);
    const manifest = implementation!.createCaptureHealthModule({
      readSnapshot: async () => snapshot(),
      readRuntimeLiveness: async () => ({ runner: "UP" as const })
    });
    manifest.lifecycle!.restore([restoredNotWiredOpen()]);

    await manifest.probe({ ...context(at(3), stateDir), repoRoot: process.cwd() });
    await manifest.probe({ ...context(at(4), stateDir), repoRoot: process.cwd() });

    await expect(readFile(join(stateDir, "digest", "2026-09-03.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(readFile(join(stateDir, "digest", "2026-09-04.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
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
