import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const scratchDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) =>
    rm(path, { recursive: true, force: true })));
});

async function scratch(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  scratchDirectories.push(path);
  return path;
}

const EXPECTED_POLICY = {
  schema_version: 1,
  liveness: {
    probe_interval_ms: 5_000,
    probe_timeout_ms: 2_000,
    open_after_failures: 2,
    clear_after_successes: 2
  },
  notification: {
    rate_limit_ms: 600_000,
    degraded_after_ms: 900_000,
    timeout_ms: 2_000
  },
  resources: {
    cpu_percent_max: 2,
    rss_mb_max: 150,
    max_database_sessions: 2,
    statement_timeout_ms: 2_000
  },
  routing: {
    INFRA_DOWN: "FATAL",
    INFRA_NOT_READY: "DEGRADED",
    INFRA_UNKNOWN: "SEVERE",
    AGENT_SELF: "SEVERE"
  }
} as const;

describe("OBS-01 core oactl controls", () => {
  it("uses the fixed state path and writes scoped, expiring mute state", async () => {
    const home = await scratch("obs-01-home-");
    const { fixedStateDirectory, parseMuteDuration, readMute, removeMute, writeMute } =
      await import("../../apps/observation-agent/src/oactl/core/state.js");
    const stateDir = fixedStateDirectory(home);
    expect(stateDir).toBe(join(home, ".local/state/dialectical-engine/observation-agent"));
    expect(parseMuteDuration("10m")).toBe(600_000);
    expect(() => parseMuteDuration("0m")).toThrow("OBSERVATION_MUTE_DURATION_INVALID");
    expect(() => parseMuteDuration("forever")).toThrow("OBSERVATION_MUTE_DURATION_INVALID");

    const mute = await writeMute({
      stateDir,
      duration: "10m",
      component: "hatchet",
      now: new Date("2026-09-03T09:00:00.000Z")
    });
    expect(mute).toEqual({
      expires_at: "2026-09-03T09:10:00.000Z",
      component: "hatchet"
    });
    expect(await readMute(stateDir, new Date("2026-09-03T09:01:00.000Z"))).toEqual(mute);
    expect(await readFile(join(stateDir, "MUTE"), "utf8")).toBe(`${JSON.stringify(mute)}\n`);
    await removeMute(stateDir);
    await expect(readMute(stateDir, new Date("2026-09-03T09:01:00.000Z"))).resolves.toBeNull();
  });

  it("renders status from the fixed snapshot without requiring Postgres", async () => {
    const stateDir = await scratch("obs-01-status-");
    await writeFile(join(stateDir, "status.json"), JSON.stringify({
      pid: 123,
      version: "0.1.0",
      thresholds_version: 1,
      mute: null,
      components: {
        postgres: { state: "UP", last_probe_at: null, last_ok_at: null, open_signal_ids: [] },
        hatchet: { state: "DOWN", last_probe_at: null, last_ok_at: null, open_signal_ids: [] },
        dev_stack: {
          state: "NOT_RUNNING", last_probe_at: null, last_ok_at: null, open_signal_ids: []
        }
      },
      modules: {
        "product-liveness": [{
          kind: "template",
          key: "evaluator_worker",
          template: "EVALUATOR_UNBOUND_BY_REGISTER"
        }]
      }
    }));
    const { renderStatus } = await import(
      "../../apps/observation-agent/src/oactl/core/status.js"
    );
    const output = await renderStatus(stateDir);
    expect(output).toContain(`state_dir ${stateDir}`);
    expect(output).toMatch(/^postgres\s+UP$/m);
    expect(output).toMatch(/^hatchet\s+DOWN$/m);
    expect(output).toMatch(/^dev_stack\s+NOT_RUNNING$/m);
    expect(output).toMatch(/^evaluator_worker\s+UNBOUND by register$/m);
  });

  it("provisions one repo-root 0600 credential file without returning the secret", async () => {
    const repoRoot = await scratch("obs-01-provision-repo-");
    const home = await scratch("obs-01-provision-home-");
    let appliedPassword = "";
    const { provisionObservationAgent } = await import(
      "../../apps/observation-agent/src/oactl/core/provision.js"
    );
    const result = await provisionObservationAgent({
      repoRoot,
      home,
      passwordFactory: () => "deterministic-test-secret",
      setRolePassword: async (password) => { appliedPassword = password; }
    });
    expect(appliedPassword).toBe("deterministic-test-secret");
    expect(result).toEqual({
      output: "PROVISIONED .local/dev-auth/observation-agent.env",
      environmentPath: join(repoRoot, ".local/dev-auth/observation-agent.env")
    });
    expect(JSON.stringify(result)).not.toContain("deterministic-test-secret");
    const source = await readFile(result.environmentPath, "utf8");
    expect(source.trim().split("\n").map((line) => line.split("=", 1)[0])).toEqual([
      "OBSERVATION_DATABASE_URL",
      "OBSERVATION_STATE_DIR",
      "OBSERVATION_TARGETS_PATH",
      "OBSERVATION_HATCHET_TOKEN_PATH"
    ]);
    expect(source).toContain(join(home, ".local/state/dialectical-engine/observation-agent"));
    expect(source).toContain(join(repoRoot, "deploy/observation-agent/targets.dev.d"));
    expect((await import("node:fs/promises").then(({ stat }) => stat(result.environmentPath))).mode & 0o777)
      .toBe(0o600);
  });

  it("exposes exactly the required core verb names and returns one code for unknown input", async () => {
    const { CORE_VERB_NAMES, assertNoCoreVerbCollisions, runOactl } = await import(
      "../../apps/observation-agent/src/oactl/core/commands.js"
    );
    expect(CORE_VERB_NAMES).toEqual([
      "provision", "install", "uninstall", "start", "kill", "status", "mute",
      "unmute", "thresholds"
    ]);
    expect(() => assertNoCoreVerbCollisions([
      { verb: "status", async run() { return 0; } }
    ])).toThrow("OBSERVATION_DUPLICATE_VERB");
    const errors: string[] = [];
    await expect(runOactl(["not-a-verb"], {
      stdout: () => undefined,
      stderr: (value) => { errors.push(value); }
    })).resolves.toBe(2);
    expect(errors).toEqual(["OBSERVATION_VERB_UNKNOWN"]);
  });
});

describe("OBS-01 threshold policy", () => {
  it("loads lexical defaults plus an override, validates closed input, and renders a field diff", async () => {
    const root = await scratch("obs-01-thresholds-");
    const defaultsDirectory = join(root, "defaults");
    const { mkdir } = await import("node:fs/promises");
    await mkdir(defaultsDirectory);
    await writeFile(join(defaultsDirectory, "OBS-01.json"), JSON.stringify(EXPECTED_POLICY));
    await writeFile(join(defaultsDirectory, "OBS-02.json"), JSON.stringify({
      notification: { degraded_after_ms: 600_000 },
      modules: { product_liveness: { api_latency_ms: 500 } },
      routing: { "INFRA_DOWN.api": "SEVERE" }
    }));
    const overrideFile = join(root, "override.json");
    await writeFile(overrideFile, JSON.stringify({ liveness: { probe_timeout_ms: 1_500 } }));
    const { diffThresholdPolicies, loadMergedThresholdPolicy, routeSeverity } = await import(
      "../../apps/observation-agent/src/oactl/core/thresholds.js"
    );
    const merged = await loadMergedThresholdPolicy({ defaultsDirectory, overrideFile });
    expect(merged.liveness.probe_timeout_ms).toBe(1_500);
    expect(merged.notification.degraded_after_ms).toBe(600_000);
    expect(merged.modules).toEqual({ product_liveness: { api_latency_ms: 500 } });
    expect(merged.routing["INFRA_DOWN.api"]).toBe("SEVERE");
    expect(routeSeverity(merged, "INFRA_DOWN", "api")).toBe("SEVERE");
    expect(routeSeverity(merged, "INFRA_DOWN", "hatchet")).toBe("FATAL");
    expect(diffThresholdPolicies(EXPECTED_POLICY, merged)).toEqual([
      "liveness.probe_timeout_ms: 2000 -> 1500",
      "modules.product_liveness.api_latency_ms: undefined -> 500",
      "notification.degraded_after_ms: 900000 -> 600000",
      "routing.INFRA_DOWN.api: undefined -> SEVERE"
    ]);

    await writeFile(overrideFile, JSON.stringify({ secret_webhook: "https://host/private" }));
    await expect(loadMergedThresholdPolicy({ defaultsDirectory, overrideFile }))
      .rejects.toThrow("OBSERVATION_THRESHOLDS_INVALID");
  });

  it("keeps the last ratified policy through a transient mirror outage but not invalid policy", async () => {
    const { ObservationError } = await import(
      "../../apps/observation-agent/src/core/errors.js"
    );
    const { reloadThresholdPolicy } = await import(
      "../../apps/observation-agent/src/oactl/core/thresholds.js"
    );
    const current = {
      version: 1,
      value: EXPECTED_POLICY,
      sourceRef: "OBS-01-v1",
      ratifiedBy: "V",
      appliedAt: new Date("2026-09-03T09:00:00.000Z")
    } as const;
    await expect(reloadThresholdPolicy({
      async readCurrent() { throw new Error("connection refused"); }
    }, current)).resolves.toBe(current);
    await expect(reloadThresholdPolicy({
      async readCurrent() { throw new ObservationError("OBSERVATION_THRESHOLDS_INVALID"); }
    }, current)).rejects.toThrow("OBSERVATION_THRESHOLDS_INVALID");
  });
});
