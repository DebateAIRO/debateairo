import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverObservationModules } from "../../apps/observation-agent/src/core/modules.js";
import { renderImpact, signalSchema } from "../../apps/observation-agent/src/core/signals.js";
import { loadObservationTargetCatalog } from "../../apps/observation-agent/src/core/targets.js";
import { renderStatus } from "../../apps/observation-agent/src/oactl/core/status.js";
import { loadMergedThresholdPolicy } from "../../apps/observation-agent/src/oactl/core/thresholds.js";
import { writeStatusSnapshot } from "../../apps/observation-agent/src/store/status.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true })));
});

function signal(input: Readonly<{
  signalClass: "CAPTURE_NOT_WIRED" | "BLIND_PERIOD" | "CAPTURE_GAP" | "SPOOL_STRANDED" | "CAPACITY";
  impactCode: "IMPACT_CAPTURE_NOT_WIRED" | "IMPACT_BLIND" | "IMPACT_CAPTURE_GAP" | "IMPACT_SPOOL_STRANDED" | "IMPACT_CLEARED";
  evidence: Readonly<Record<string, unknown>>;
  state?: "OPEN" | "CLEARED";
}>) {
  return signalSchema.parse({
    seq: 1,
    signal_id: "46000000-0000-4000-8000-000000000001",
    state: input.state ?? "OPEN",
    class: input.signalClass,
    component: input.signalClass === "SPOOL_STRANDED" ? "spool" : "obs_capture",
    severity: "DEGRADED",
    impact_code: input.impactCode,
    first_failed_probe_at: "2026-09-03T08:00:00.000Z",
    detected_at: "2026-09-03T08:00:15.000Z",
    evidence: input.evidence,
    suspected_defect: false,
    defect_kind: null,
    run_ref: null,
    work_item_ref: null,
    threshold_version: 1,
    clears_signal_id: input.state === "CLEARED"
      ? "46000000-0000-4000-8000-000000000099" : null,
    recorded_at: "2026-09-03T08:00:15.000Z"
  });
}

describe("OBS-04 defaults and projections", () => {
  it("loads the additive target/default fragments and discovers both modules lexically", async () => {
    const catalog = await loadObservationTargetCatalog(resolve(
      "deploy/observation-agent/targets.dev.d"
    ));
    expect(catalog.fragments.find((fragment) => fragment.basename === "OBS-04.json"))
      .toMatchObject({ targets: [{
        component: "spool", kind: "spool_directory",
        path: "/tmp/dialectical-engine-observation-spool"
      }] });
    const policy = await loadMergedThresholdPolicy({
      defaultsDirectory: resolve("deploy/observation-agent/thresholds/defaults")
    });
    expect(policy.routing).toMatchObject({
      CAPTURE_NOT_WIRED: "INFO", BLIND_PERIOD: "DEGRADED",
      CAPTURE_GAP: "DEGRADED", SPOOL_STRANDED: "DEGRADED"
    });
    expect(policy.modules).toMatchObject({
      "capture-health": {
        detector_interval_ms: 15_000, blind_window_s: 120,
        gap_window_s: 300, gap_severe_lost_count: 100,
        expected_runtimes: ["runner"]
      },
      "spool-health": { detector_interval_ms: 15_000, spool_age_s: 600 }
    });
    const discovered = await discoverObservationModules(resolve(
      "apps/observation-agent/src/modules"
    ));
    expect(discovered.modules.map((module) => module.name)).toEqual(expect.arrayContaining([
      "capture-health", "spool-health"
    ]));
    expect(discovered.targetFragments.filter((name) => name === "OBS-04.json"))
      .toEqual(["OBS-04.json"]);
  });

  it("renders exact NOT WIRED copy plus capture/spool counts and threshold values", async () => {
    const stateDir = await mkdtemp(join(tmpdir(), "obs-04-status-"));
    temporaryDirectories.push(stateDir);
    await writeStatusSnapshot(stateDir, {
      pid: 123,
      version: "OBS-04-test",
      thresholds_version: 1,
      mute: null,
      components: {
        obs_capture: {
          state: "NOT_WIRED", last_probe_at: "2026-09-03T08:00:00.000Z",
          last_ok_at: null, open_signal_ids: []
        },
        spool: {
          state: "STRANDED", last_probe_at: "2026-09-03T08:00:00.000Z",
          last_ok_at: null, open_signal_ids: []
        }
      },
      modules: {
        "capture-health": [
          { kind: "template", key: "obs_capture", template: "CAPTURE_NOT_WIRED", count: 0 },
          { kind: "metric", key: "runner.capture_gap_open", value: 1, unit: "COUNT" },
          { kind: "metric", key: "runner.capture_gap_lost", value: 7, unit: "COUNT" },
          { kind: "state", key: "runner.capture_gap_severity", state: "DEGRADED" },
          { kind: "metric", key: "capture.blind_threshold", value: 120, unit: "SECONDS" },
          { kind: "metric", key: "capture.gap_severe", value: 100, unit: "COUNT" },
          { kind: "metric", key: "capture.gap_window", value: 5, unit: "MINUTES" }
        ],
        "spool-health": [
          { kind: "metric", key: "runner.spool_stranded", value: 1, unit: "COUNT" },
          { kind: "metric", key: "spool.threshold", value: 10, unit: "MINUTES" }
        ]
      }
    });
    const output = await renderStatus(stateDir);
    expect(output).toContain("obs_capture: NOT WIRED (0 FLUSH_OK rows) — blind by construction");
    expect(output).toContain("runner.capture_gap_lost      7 count");
    expect(output).toContain("runner.capture_gap_severity  DEGRADED");
    expect(output).toContain("runner.spool_stranded        1 count");
    expect(output).toContain("capture.blind_threshold      120 seconds");
    expect(output).toContain("capture.gap_severe           100 count");
    expect(output).toContain("capture.gap_window           5 minutes");
    expect(output).toContain("spool.threshold              10 minutes");
  });

  it("renders only the five fixed capture impact templates", async () => {
    const signals = [
      signal({ signalClass: "CAPTURE_NOT_WIRED", impactCode: "IMPACT_CAPTURE_NOT_WIRED",
        evidence: { runtime: "runner", flush_ok_count: 0, health: "NOT_WIRED" } }),
      signal({ signalClass: "BLIND_PERIOD", impactCode: "IMPACT_BLIND",
        evidence: { runtime: "runner", last_flush_ok_at: "2026-09-03T08:00:00.000Z",
          silence_s: 120, threshold_s: 120, health: "WIRED_SILENT" } }),
      signal({ signalClass: "CAPTURE_GAP", impactCode: "IMPACT_CAPTURE_GAP",
        evidence: { runtime: "runner", source: "first_party", gap_class: "QUEUE_FULL",
          lost_count: 7, opened_at: "2026-09-03T08:00:00.000Z", closed_at: null } }),
      signal({ signalClass: "SPOOL_STRANDED", impactCode: "IMPACT_SPOOL_STRANDED",
        evidence: { runtime: "runner",
          spool_ref: "runner-7-46000000-0000-4000-8000-000000000002.spool",
          spool_age_s: 600, threshold_s: 600, receipt_present: false, count: 1 } }),
      signal({ signalClass: "CAPTURE_GAP", impactCode: "IMPACT_CLEARED", state: "CLEARED",
        evidence: { duration_seconds: 15 } })
    ];
    expect(signals.map(renderImpact)).toEqual([
      "Error capture is not wired into the product: no failure is recorded anywhere.",
      "Error capture on runner is silent while the process is up: failures there are not recorded.",
      "7 error events were dropped by capture: the error record is incomplete.",
      "1 spooled error files are older than 10 minutes without re-ingestion.",
      "obs_capture: CAPTURE_GAP cleared after 15 seconds."
    ]);
    const defaults = JSON.parse(await readFile(
      "deploy/observation-agent/thresholds/defaults/OBS-04.json", "utf8"
    ));
    expect(defaults.modules["capture-health"].gap_severe_lost_count).toBe(100);
  });
});
