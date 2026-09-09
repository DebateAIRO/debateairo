import { existsSync } from "node:fs";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ObservationModuleRuntime } from "../../apps/observation-agent/src/core/runtime.js";
import { signalSchema } from "../../apps/observation-agent/src/core/signals.js";
import { createCaptureHealthModule } from "../../apps/observation-agent/src/modules/capture-health/module.js";
import { createCaptureHealthTracker } from "../../apps/observation-agent/src/modules/capture-health/tracker.js";
import { createSpoolHealthModule } from "../../apps/observation-agent/src/modules/spool-health/module.js";

const scanPath = "apps/observation-agent/src/modules/spool-health/scan.ts";
const trackerPath = "apps/observation-agent/src/modules/spool-health/tracker.ts";
const temporaryDirectories: string[] = [];
const at = (seconds: number) => new Date(1_800_400_000_000 + seconds * 1_000);

async function spoolModules() {
  if (!existsSync(scanPath) || !existsSync(trackerPath)) return null;
  return {
    scan: await import("../../apps/observation-agent/src/modules/spool-health/scan.js"),
    tracker: await import("../../apps/observation-agent/src/modules/spool-health/tracker.js")
  };
}

function captureSnapshot(flushAt: Date | undefined, state: "CURRENT" | "UNKNOWN" = "CURRENT") {
  return {
    state,
    gaps: [], receipts: [],
    health: flushAt === undefined ? [] : [{
      runtime: "runner", state: "HEALTHY", observedAt: flushAt, detailCode: "FLUSH_OK"
    }],
    cursor: { captureGapMs: 0, componentHealthMs: 0, spoolReceiptMs: 0 }
  } as const;
}

function blindOpen(signalId: string) {
  return signalSchema.parse({
    seq: 1,
    signal_id: signalId,
    state: "OPEN",
    class: "BLIND_PERIOD",
    component: "obs_capture",
    severity: "DEGRADED",
    impact_code: "IMPACT_BLIND",
    first_failed_probe_at: at(120).toISOString(),
    detected_at: at(135).toISOString(),
    evidence: {
      runtime: "runner",
      last_flush_ok_at: at(0).toISOString(),
      silence_s: 135,
      threshold_s: 120,
      health: "WIRED_SILENT"
    },
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: 1,
    clears_signal_id: null,
    recorded_at: at(135).toISOString()
  });
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

describe("OBS-04 blind periods", () => {
  it("opens only for an UP runtime at the exact 120-second FLUSH_OK boundary", () => {
    const tracker = createCaptureHealthTracker();
    const observe = (now: Date, runtime: "UP" | "DOWN" | "UNKNOWN") => tracker.observe({
      snapshot: captureSnapshot(at(0)), runtimeLiveness: { runner: runtime },
      expectedRuntimes: ["runner"], now, blindWindowSeconds: 120
    });
    expect(observe(at(119.999), "UP").intents).toEqual([]);
    const opened = observe(at(120), "UP");
    expect(opened.state).toBe("WIRED_SILENT");
    expect(opened.intents).toEqual([expect.objectContaining({
      correlationKey: "blind:runner", class: "BLIND_PERIOD", state: "OPEN",
      severity: "DEGRADED", impactCode: "IMPACT_BLIND",
      firstFailedProbeAt: at(120), detectedAt: at(120),
      evidence: {
        runtime: "runner", last_flush_ok_at: at(0).toISOString(),
        silence_s: 120, threshold_s: 120, health: "WIRED_SILENT"
      },
      suspectedDefect: false, defectKind: null, runRef: null, workItemRef: null
    })]);
    expect(observe(at(135), "UP").intents).toEqual([]);
  });

  it("never substitutes process death for blindness and clears on a new positive authority", () => {
    const dead = createCaptureHealthTracker().observe({
      snapshot: captureSnapshot(at(0)), runtimeLiveness: { runner: "DOWN" },
      expectedRuntimes: ["runner"], now: at(300), blindWindowSeconds: 120
    });
    expect(dead.intents).toEqual([]);
    expect(dead.state).toBe("WIRED_CURRENT");

    const tracker = createCaptureHealthTracker();
    tracker.observe({
      snapshot: captureSnapshot(at(0)), runtimeLiveness: { runner: "UP" },
      expectedRuntimes: ["runner"], now: at(120), blindWindowSeconds: 120
    });
    const cleared = tracker.observe({
      snapshot: captureSnapshot(at(121)), runtimeLiveness: { runner: "UP" },
      expectedRuntimes: ["runner"], now: at(122), blindWindowSeconds: 120
    });
    expect(cleared.intents).toEqual([expect.objectContaining({
      correlationKey: "blind:runner", class: "BLIND_PERIOD", state: "CLEARED",
      impactCode: "IMPACT_CLEARED", evidence: { duration_seconds: 2 },
      suspectedDefect: false, defectKind: null
    })]);
  });

  it("holds blind lifecycle state when capture relations become UNKNOWN", () => {
    const tracker = createCaptureHealthTracker();
    expect(tracker.observe({
      snapshot: captureSnapshot(at(0)), runtimeLiveness: { runner: "UP" },
      expectedRuntimes: ["runner"], now: at(120), blindWindowSeconds: 120
    }).intents).toHaveLength(1);
    expect(tracker.observe({
      snapshot: captureSnapshot(undefined, "UNKNOWN"), runtimeLiveness: { runner: "UP" },
      expectedRuntimes: ["runner"], now: at(135), blindWindowSeconds: 120
    }).intents).toEqual([]);
  });

  it("clears a restored blind period by its original UUID when DOWN has no fresh capture authority", async () => {
    const originalId = "70000000-0000-4000-8000-000000000401";
    const module = createCaptureHealthModule({
      readSnapshot: async () => captureSnapshot(undefined),
      readRuntimeLiveness: async () => ({ runner: "DOWN" }),
      appendDailyNotWiredImpact: async () => "OPEN_IDENTITY_MISSING"
    });
    const emitted: ReturnType<typeof signalSchema.parse>[] = [];
    let nextId = 1;
    const runtime = new ObservationModuleRuntime({
      modules: [module],
      replayedOpenSignals: [{
        signal: blindOpen(originalId),
        lifecycle: { owner: "capture-health", correlationKey: "blind:runner" }
      }],
      nextSequence: () => 10 + nextId,
      nextSignalId: () => `70000000-0000-4000-8000-${String(++nextId).padStart(12, "0")}`,
      sampleStore: { async write() {} },
      emitSignal: async (signal) => { emitted.push(signal); }
    });

    await runtime.run({
      modules: [module], now: at(150), timeoutMs: 2_000,
      database: {} as never, stateDir: "/tmp/obs-04-blind-down",
      repoRoot: process.cwd(), targets: [], thresholdVersion: 1,
      moduleThresholds: { "capture-health": {
        expected_runtimes: ["runner"], blind_window_s: 120,
        gap_window_s: 300, gap_severe_lost_count: 100
      } }
    });

    expect(emitted.filter((signal) => signal.class === "BLIND_PERIOD")).toEqual([
      expect.objectContaining({
        state: "CLEARED",
        clears_signal_id: originalId,
        impact_code: "IMPACT_CLEARED",
        suspected_defect: false
      })
    ]);
  });

  it("retains and retries the original blind UUID when a pre-journal CLEAR fails", async () => {
    const originalId = "70000000-0000-4000-8000-000000000416";
    const module = createCaptureHealthModule({
      readSnapshot: async () => captureSnapshot(undefined),
      readRuntimeLiveness: async () => ({ runner: "DOWN" }),
      appendDailyNotWiredImpact: async () => "OPEN_IDENTITY_MISSING"
    });
    const blindAttempts: ReturnType<typeof signalSchema.parse>[] = [];
    let sequence = 0;
    let identifier = 0;
    const runtime = new ObservationModuleRuntime({
      modules: [module],
      replayedOpenSignals: [{
        signal: blindOpen(originalId),
        lifecycle: { owner: "capture-health", correlationKey: "blind:runner" }
      }],
      nextSequence: () => ++sequence,
      nextSignalId: () => `70000000-0000-4000-8000-${String(++identifier).padStart(12, "0")}`,
      sampleStore: { async write() {} },
      emitSignal: async (signal) => {
        if (signal.class !== "BLIND_PERIOD") return { journaled: true };
        blindAttempts.push(signal);
        return { journaled: blindAttempts.length === 2 };
      }
    });
    const run = (now: Date) => runtime.run({
      modules: [module], now, timeoutMs: 2_000,
      database: {} as never, stateDir: "/tmp/obs-04-blind-clear-retry",
      repoRoot: process.cwd(), targets: [], thresholdVersion: 1,
      moduleThresholds: { "capture-health": {
        expected_runtimes: ["runner"], blind_window_s: 120,
        gap_window_s: 300, gap_severe_lost_count: 100
      } }
    });

    await run(at(150));
    await run(at(165));

    expect(blindAttempts).toHaveLength(2);
    expect(blindAttempts).toEqual([
      expect.objectContaining({
        state: "CLEARED", class: "BLIND_PERIOD", clears_signal_id: originalId
      }),
      expect.objectContaining({
        state: "CLEARED", class: "BLIND_PERIOD", clears_signal_id: originalId
      })
    ]);
  });

  it("retains a restored blind period when UNKNOWN has no fresh capture authority", () => {
    const tracker = createCaptureHealthTracker();
    tracker.restore([{
      correlationKey: "blind:runner",
      signal: blindOpen("70000000-0000-4000-8000-000000000402")
    }]);

    expect(tracker.observe({
      snapshot: captureSnapshot(undefined, "UNKNOWN"), runtimeLiveness: { runner: "UNKNOWN" },
      expectedRuntimes: ["runner"], now: at(150), blindWindowSeconds: 120
    }).intents.filter((intent) => intent.class === "BLIND_PERIOD")).toEqual([]);
    expect(tracker.observe({
      snapshot: captureSnapshot(at(0)), runtimeLiveness: { runner: "UP" },
      expectedRuntimes: ["runner"], now: at(165), blindWindowSeconds: 120
    }).intents.filter((intent) => intent.class === "BLIND_PERIOD")).toEqual([]);
  });
});

describe("OBS-04 metadata-only stranded spool", () => {
  it("stats only valid spool filenames and opens at the 10-minute boundary", async () => {
    const implementation = await spoolModules();
    expect(implementation).not.toBeNull();
    const directory = await mkdtemp(join(tmpdir(), "obs-04-spool-"));
    temporaryDirectories.push(directory);
    const spoolRef = "runner-42-45000000-0000-4000-8000-000000000001.spool";
    const path = join(directory, spoolRef);
    await writeFile(path, "PRIVATE BODY MUST NEVER BE READ", { mode: 0o600 });
    await writeFile(join(directory, "not-a-spool.txt"), "ignored", { mode: 0o600 });
    await utimes(path, at(0), at(0));

    const scanned = await implementation!.scan.scanSpoolMetadata({
      targets: [{ component: "spool", kind: "spool_directory", path: directory }],
      now: at(600), thresholdSeconds: 600
    });
    expect(scanned).toEqual({
      state: "CURRENT",
      files: [{ runtime: "runner", spoolRef, mtime: at(0), ageSeconds: 600 }]
    });
    const tracker = implementation!.tracker.createSpoolHealthTracker();
    expect(tracker.observe({ scan: scanned, receipts: { state: "CURRENT", refs: [] },
      now: at(600), thresholdSeconds: 600 }).intents).toEqual([
      expect.objectContaining({
        correlationKey: `spool:runner:${spoolRef}`,
        component: "spool", class: "SPOOL_STRANDED", state: "OPEN",
        severity: "DEGRADED", impactCode: "IMPACT_SPOOL_STRANDED",
        firstFailedProbeAt: at(600), detectedAt: at(600),
        evidence: {
          runtime: "runner", spool_ref: spoolRef, spool_age_s: 600,
          threshold_s: 600, receipt_present: false, count: 1
        },
        suspectedDefect: false, defectKind: null
      })
    ]);
  });

  it("deduplicates stranded files and clears when a receipt appears or the file is absent", async () => {
    const implementation = await spoolModules();
    expect(implementation).not.toBeNull();
    const spoolRef = "api-7-45000000-0000-4000-8000-000000000002.spool";
    const scan = {
      state: "CURRENT" as const,
      files: [{ runtime: "api", spoolRef, mtime: at(0), ageSeconds: 700 }]
    };
    const tracker = implementation!.tracker.createSpoolHealthTracker();
    expect(tracker.observe({ scan, receipts: { state: "CURRENT", refs: [] },
      now: at(700), thresholdSeconds: 600 }).intents).toHaveLength(1);
    expect(tracker.observe({ scan, receipts: { state: "CURRENT", refs: [] },
      now: at(715), thresholdSeconds: 600 }).intents).toEqual([]);
    expect(tracker.observe({ scan, receipts: { state: "CURRENT", refs: [spoolRef] },
      now: at(730), thresholdSeconds: 600 }).intents).toEqual([
      expect.objectContaining({ state: "CLEARED", evidence: { duration_seconds: 30 } })
    ]);

    const absentTracker = implementation!.tracker.createSpoolHealthTracker();
    absentTracker.observe({ scan, receipts: { state: "CURRENT", refs: [] },
      now: at(700), thresholdSeconds: 600 });
    expect(absentTracker.observe({ scan: { state: "CURRENT", files: [] },
      receipts: { state: "CURRENT", refs: [] }, now: at(715), thresholdSeconds: 600
    }).intents).toEqual([expect.objectContaining({ state: "CLEARED" })]);
  });

  it("treats directory/read failures as UNKNOWN and never as loss evidence", async () => {
    const implementation = await spoolModules();
    expect(implementation).not.toBeNull();
    const scanned = await implementation!.scan.scanSpoolMetadata({
      targets: [{ component: "spool", kind: "spool_directory", path: "/tmp/obs-04-denied" }],
      now: at(600), thresholdSeconds: 600,
      io: {
        lstat: async () => ({ isDirectory: () => true, isSymbolicLink: () => false }),
        readdir: async () => { throw new Error("EACCES"); },
        stat: async () => { throw new Error("must not run"); }
      }
    });
    expect(scanned).toEqual({ state: "UNKNOWN", files: [] });
    const tracker = implementation!.tracker.createSpoolHealthTracker();
    expect(tracker.observe({ scan: scanned, receipts: { state: "UNKNOWN", refs: [] },
      now: at(600), thresholdSeconds: 600 }).intents).toEqual([]);
  });

  it("rejects excluded-zone and relative targets before any filesystem contact", async () => {
    const implementation = await spoolModules();
    expect(implementation).not.toBeNull();
    let contacts = 0;
    const io = {
      lstat: async () => { contacts += 1; throw new Error("forbidden"); },
      readdir: async () => { contacts += 1; return []; },
      stat: async () => { contacts += 1; throw new Error("forbidden"); }
    };
    for (const path of [
      "relative/spool",
      "/workspace/apps/api/src",
      "/workspace/apps/api/src/mfa.ts",
      "/workspace/apps/api/dist/mfa.js",
      "/workspace/dist/apps/api/src/registration.js",
      "/workspace/dist/packages/db/src/identity.js",
      "/workspace/packages/db/dist",
      "/workspace/migrations"
    ]) {
      await expect(implementation!.scan.scanSpoolMetadata({
        targets: [{ component: "spool", kind: "spool_directory", path }],
        now: at(600), thresholdSeconds: 600, io
      })).resolves.toEqual({ state: "UNKNOWN", files: [] });
    }
    expect(contacts).toBe(0);
  });

  it("publishes fixed UNKNOWN and performs no scan or database work when unconfigured", async () => {
    let scanCalls = 0;
    let databaseCalls = 0;
    const module = createSpoolHealthModule({
      scan: async () => {
        scanCalls += 1;
        return { state: "CURRENT", files: [] };
      },
      readReceipts: async () => {
        databaseCalls += 1;
        return { state: "CURRENT", refs: [] };
      }
    });
    const now = at(600);
    const observations = await module.probe({
      now, timeoutMs: 2_000, database: {} as never,
      stateDir: "/tmp/obs-04-spool-unconfigured", repoRoot: process.cwd(),
      targets: [], targetFragment: {
        basename: "OBS-04.json", targets: [], configuration: {}
      },
      configuration: {}, thresholds: { spool_age_s: 600 }
    });

    expect(scanCalls).toBe(0);
    expect(databaseCalls).toBe(0);
    expect(observations).toEqual([expect.objectContaining({
      component: "spool", ok: false, lastStatus: "UNKNOWN", statusState: "UNKNOWN",
      status: [{ kind: "state", key: "spool", state: "UNKNOWN", observedAt: now }]
    })]);
    expect(module.signals(observations, {
      now, thresholdVersion: 1, targetFragment: null,
      configuration: {}, thresholds: { spool_age_s: 600 }
    })).toEqual([]);
  });

  it("preserves scan and receipt behavior for a genuinely configured target", async () => {
    const spoolRef = "runner-42-45000000-0000-4000-8000-000000000003.spool";
    let scanCalls = 0;
    let databaseCalls = 0;
    const module = createSpoolHealthModule({
      scan: async (input) => {
        scanCalls += 1;
        expect(input.targets).toEqual([{
          component: "spool", kind: "spool_directory", path: "/var/tmp/obs-04-spool"
        }]);
        return {
          state: "CURRENT",
          files: [{ runtime: "runner", spoolRef, mtime: at(0), ageSeconds: 600 }]
        };
      },
      readReceipts: async (_database, refs) => {
        databaseCalls += 1;
        expect(refs).toEqual([spoolRef]);
        return { state: "CURRENT", refs: [spoolRef] };
      }
    });
    const now = at(600);
    const observations = await module.probe({
      now, timeoutMs: 2_000, database: {} as never,
      stateDir: "/tmp/obs-04-spool-configured", repoRoot: process.cwd(),
      targets: [], targetFragment: {
        basename: "OBS-04.json",
        targets: [{
          component: "spool", kind: "spool_directory", path: "/var/tmp/obs-04-spool"
        }],
        configuration: {}
      },
      configuration: {}, thresholds: { spool_age_s: 600 }
    });

    expect(scanCalls).toBe(1);
    expect(databaseCalls).toBe(1);
    expect(observations).toEqual([expect.objectContaining({
      component: "spool", ok: true, lastStatus: "CURRENT", statusState: "CURRENT"
    })]);
    expect(module.signals(observations, {
      now, thresholdVersion: 1, targetFragment: null,
      configuration: {}, thresholds: { spool_age_s: 600 }
    })).toEqual([]);
  });
});
