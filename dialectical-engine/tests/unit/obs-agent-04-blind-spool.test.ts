import { existsSync } from "node:fs";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCaptureHealthTracker } from "../../apps/observation-agent/src/modules/capture-health/tracker.js";

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
});
