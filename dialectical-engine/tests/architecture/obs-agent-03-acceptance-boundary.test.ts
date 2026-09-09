import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { discoverObservationModules } from "../../apps/observation-agent/src/core/modules.js";
import { loadObservationTargetCatalog } from "../../apps/observation-agent/src/core/targets.js";
import { loadMergedThresholdPolicy } from "../../apps/observation-agent/src/oactl/core/thresholds.js";

describe("OBS-03 acceptance and configuration boundaries", () => {
  it("keeps the fixture stimulus-only with no output-surface or EXPLAIN reads", async () => {
    const source = await readFile("tests/acceptance/obs-agent-03-fixture.ts", "utf8");
    expect(source).not.toMatch(/SELECT[\s\S]{0,120}observation\.(?:signal|delivery|defect_signal_v)/iu);
    expect(source).not.toMatch(/SELECT[\s\S]{0,120}observation\.open_signal_v/iu);
    expect(source).not.toMatch(/status\.json|\/digest\/|EXPLAIN\s*\(/iu);
    expect(source).not.toMatch(/assert(?:Signal|Status|Digest|Explain)/u);
  });

  it("discovers the OBS-03 module and its empty, non-overlapping target fragment", async () => {
    const catalog = await discoverObservationModules(resolve("apps/observation-agent/src/modules"));
    expect(catalog.modules.find((module) => module.name === "stall-detectors"))
      .toMatchObject({ cadence: { intervalMs: 10_000, timeoutMs: 2_000 },
        targetFragmentBasename: "OBS-03.json" });
    const targets = await loadObservationTargetCatalog(resolve("deploy/observation-agent/targets.dev.d"));
    expect(targets.fragments.find((fragment) => fragment.basename === "OBS-03.json"))
      .toEqual({ basename: "OBS-03.json", targets: [], configuration: {} });
  });

  it("merges exact thresholds, mappings, SEVERE routing, and the inherited two-session bound", async () => {
    const policy = await loadMergedThresholdPolicy({
      defaultsDirectory: resolve("deploy/observation-agent/thresholds/defaults")
    });
    expect(policy.resources).toMatchObject({
      max_database_sessions: 2,
      statement_timeout_ms: 2_000
    });
    expect(policy.routing).toMatchObject({
      WORKER_LOST: "SEVERE",
      STALL: "SEVERE",
      QUEUE_NOT_DRAINING: "SEVERE",
      NO_PROGRESS: "SEVERE",
      SUSPICIOUS_SUCCESS: "SEVERE"
    });
    expect(policy.modules?.["stall-detectors"]).toEqual({
      worker_poll_ms: 10_000,
      heartbeat_age_s: 30,
      detector_interval_ms: 15_000,
      claim_grace_s: 15,
      ready_age_s: 120,
      no_progress_s: 300,
      worker_ref: "debateai-dev-runner",
      worker_list_url: "http://127.0.0.1:8888/api/v1/tenants/main/worker",
      defect_mappings: {
        STALL: "STALL_DETECTED",
        QUEUE_NOT_DRAINING: "STALL_DETECTED",
        NO_PROGRESS: "SILENT_NOOP",
        SUSPICIOUS_SUCCESS: "SUSPICIOUS_SUCCESS"
      }
    });
  });
});
