import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratch: string[] = [];
afterEach(async () => Promise.all(scratch.splice(0).map((path) => rm(path, { recursive: true, force: true }))));

describe("OBS-02 defaults, status, and template output", () => {
  it("merges the exact ruled cadences, windows, latency bands, and routing without redefining readiness", async () => {
    const { loadMergedThresholdPolicy, routeSeverity } = await import(
      "../../apps/observation-agent/src/oactl/core/thresholds.js"
    );
    const policy = await loadMergedThresholdPolicy({
      defaultsDirectory: resolve("deploy/observation-agent/thresholds/defaults")
    });
    expect(policy.modules?.["product-liveness"]).toEqual({
      probe_interval_ms: 5_000,
      probe_timeout_ms: 2_000,
      kanban_probe_interval_ms: 30_000,
      group_memory_ms: 600_000,
      never_started_ms: 60_000,
      latency_window_ms: 300_000,
      api_latency_threshold_ms: 500,
      ui_latency_threshold_ms: 2_000,
      tls_front_door_latency_threshold_ms: 2_500,
      not_running_severity: "INFO"
    });
    expect(policy.modules?.witness).toEqual({ probe_interval_ms: 5_000, never_started_ms: 60_000 });
    expect(policy.modules?.["job-witness"]).toEqual({ detector_interval_ms: 15_000 });
    expect(routeSeverity(policy, "INFRA_NOT_READY", "hatchet")).toBe("DEGRADED");
    expect(routeSeverity(policy, "THROUGHPUT_ANOMALY", "api")).toBe("DEGRADED");
    expect(routeSeverity(policy, "INFRA_DOWN", "api")).toBe("SEVERE");
    expect(routeSeverity(policy, "INFRA_DOWN", "dev_stack")).toBe("SEVERE");
    expect(routeSeverity(policy, "RESTART_WITNESSED", "hatchet")).toBe("INFO");
    expect(routeSeverity(policy, "EXPECTED_ABSENT", "hatchet")).toBe("SEVERE");
  });

  it("renders exact slow/restart/expected copy and typed NO SCHEDULE status without product text", async () => {
    const { renderImpact, signalSchema } = await import(
      "../../apps/observation-agent/src/core/signals.js"
    );
    const base = {
      seq: 1, signal_id: "60000000-0000-4000-8000-000000000001", state: "OPEN",
      first_failed_probe_at: "2026-09-03T08:00:00.000Z", detected_at: "2026-09-03T08:00:05.000Z",
      suspected_defect: false, defect_kind: null, run_ref: null, work_item_ref: null,
      threshold_version: 1, clears_signal_id: null, recorded_at: "2026-09-03T08:00:05.000Z"
    } as const;
    expect(renderImpact(signalSchema.parse({
      ...base, class: "THROUGHPUT_ANOMALY", component: "api", severity: "DEGRADED",
      impact_code: "IMPACT_SLOW",
      evidence: { metric_key: "probe.api.latency_ms", p95_ms: 700, threshold_ms: 500, window_minutes: 5 }
    }))).toBe("api answered its liveness probe in 700 ms at p95 over 5 minutes: users are waiting.");
    expect(renderImpact(signalSchema.parse({
      ...base, class: "RESTART_WITNESSED", component: "hatchet", severity: "INFO",
      impact_code: "IMPACT_RESTART",
      evidence: { old_started_at: "2026-09-03T07:00:00.000Z", new_started_at: "2026-09-03T08:00:00.000Z" }
    }))).toBe("hatchet restarted (start time changed).");
    expect(renderImpact(signalSchema.parse({
      ...base, class: "EXPECTED_ABSENT", component: "hatchet", severity: "SEVERE",
      impact_code: "IMPACT_EXPECTED_ABSENT", evidence: { expected: "always", absent_for_s: 60 }
    }))).toBe("hatchet is expected to run and has not been seen since the agent started.");

    const stateDir = await mkdtemp(join(tmpdir(), "obs-02-status-"));
    scratch.push(stateDir);
    const { writeStatusSnapshot } = await import("../../apps/observation-agent/src/store/status.js");
    const { renderStatus } = await import("../../apps/observation-agent/src/oactl/core/status.js");
    await writeStatusSnapshot(stateDir, {
      pid: 42, version: "0.1.0", thresholds_version: 1, mute: null, components: {},
      modules: { "job-witness": [
        { kind: "template", key: "scheduler.replay-self-test", template: "NO_SCHEDULE_RULED" },
        { kind: "timestamp", key: "scheduler.replay-self-test.last_completion", value: "2026-09-03T08:00:02.000Z" },
        { kind: "metric", key: "scheduler.replay-self-test.exit_code", value: 7, unit: "COUNT" }
      ] }
    });
    const rendered = await renderStatus(stateDir);
    expect(rendered).toContain("scheduler.replay-self-test: NO SCHEDULE RULED (V row D10)");
    expect(rendered).toContain("scheduler.replay-self-test.last_completion");
    expect(rendered).not.toContain("question text");
    expect(JSON.parse(await readFile(join(stateDir, "status.json"), "utf8"))).toHaveProperty(
      "modules.job-witness"
    );
  });
});
