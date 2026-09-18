import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
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

  it("renders typed status views and rejects every invalid selector", async () => {
    const home = await scratch("obs-01-status-views-");
    const stateDir = join(home, ".local/state/dialectical-engine/observation-agent");
    await mkdir(stateDir, { recursive: true });
    await writeFile(join(stateDir, "status.json"), JSON.stringify({
      pid: 456,
      version: "0.1.0",
      thresholds_version: 7,
      mute: null,
      components: {
        postgres: { state: "UP", last_probe_at: null, last_ok_at: null, open_signal_ids: [] }
      },
      modules: {
        "capacity-fixture": [
          { kind: "metric", key: "postgres.connections.used", value: 31, unit: "COUNT", view: "capacity" },
          { kind: "metric", key: "postgres.connections.max", value: 100, unit: "COUNT", view: "capacity" },
          { kind: "template", key: "slow_queries", template: "SLOW_QUERIES_NOT_OBSERVABLE", view: "capacity" }
        ],
        "throughput-fixture": [
          { kind: "metric", key: "throughput.runs", value: 4, unit: "COUNT", view: "throughput" }
        ],
        "unscoped-fixture": [
          { kind: "state", key: "shared.health", state: "UP" }
        ]
      }
    }));
    const { runOactl } = await import(
      "../../apps/observation-agent/src/oactl/core/commands.js"
    );
    const run = async (...args: readonly string[]) => {
      const stdout: string[] = [];
      const stderr: string[] = [];
      const code = await runOactl(["status", ...args], {
        stdout: (value) => { stdout.push(value); },
        stderr: (value) => { stderr.push(value); }
      }, {
        repoRoot: resolve("."), home, uid: 501,
        execute: async () => undefined
      });
      return { code, stdout, stderr };
    };

    const capacity = await run("--capacity");
    expect(capacity).toEqual({
      code: 0,
      stderr: [],
      stdout: [[
        `state_dir ${stateDir}`,
        "pid 456",
        "thresholds v7",
        "postgres                     UP",
        "postgres.connections.max     100 count",
        "postgres.connections.used    31 count",
        "slow_queries: NOT OBSERVABLE (pg_stat_statements disabled)"
      ].join("\n")]
    });
    const throughput = await run("--throughput");
    expect(throughput.stdout[0]).toContain("throughput.runs              4 count");
    expect(throughput.stdout[0]).not.toContain("postgres.connections");
    expect(throughput.stdout[0]).not.toContain("shared.health");

    const plain = await run();
    expect(plain.code).toBe(0);
    expect(plain.stdout[0]).toContain("postgres.connections.used    31 count");
    expect(plain.stdout[0]).toContain("throughput.runs              4 count");
    expect(plain.stdout[0]).toContain("shared.health                UP");

    for (const args of [
      ["--unknown"],
      ["--capacity", "--throughput"],
      ["capacity"],
      ["--"],
      ["---capacity"],
      ["--Capacity"],
      ["--capacity=value"]
    ]) {
      await expect(run(...args)).resolves.toEqual({
        code: 2,
        stdout: [],
        stderr: ["OBSERVATION_ARGUMENTS_INVALID"]
      });
    }
  });

  it("renders the five closed composite throughput status lines exactly", async () => {
    const stateDir = await scratch("obs-01-composite-status-");
    await writeFile(join(stateDir, "status.json"), JSON.stringify({
      pid: 789,
      version: "0.1.0",
      thresholds_version: 9,
      mute: null,
      components: {},
      modules: {
        "throughput-fixture": [
          {
            kind: "template", key: "queue.threshold", template: "COUNT_WINDOW_THRESHOLD",
            count: 10, window_minutes: 5, view: "throughput"
          },
          {
            kind: "template", key: "provider.threshold", template: "PERCENT_MINIMUM_THRESHOLD",
            percent: 50, minimum: 10, view: "throughput"
          },
          {
            kind: "template", key: "run.failure.threshold", template: "PERCENT_MINIMUM_THRESHOLD",
            percent: 50, minimum: 4, view: "throughput"
          },
          {
            kind: "template", key: "run.failure", template: "RATIO_WINDOW_STATE",
            numerator: 3, denominator: 4, window_minutes: 60, state: "SEVERE",
            view: "throughput"
          },
          {
            kind: "template", key: "dispatch.p95", template: "DURATION_WINDOW_STATE",
            value_seconds: 31, window_minutes: 5, state: "DEGRADED", view: "throughput"
          }
        ]
      }
    }));
    const { renderStatus } = await import(
      "../../apps/observation-agent/src/oactl/core/status.js"
    );

    const output = await renderStatus(stateDir, "throughput");
    expect(output).toBe([
      `state_dir ${stateDir}`,
      "pid 789",
      "thresholds v9",
      "dispatch p95: 31s over 5m (DEGRADED)",
      "provider threshold 50%/10",
      "queue threshold 10/5m",
      "run failure: 3/4 over 60m (SEVERE)",
      "run failure threshold 50%/4"
    ].join("\n"));
  });

  it("renders module-owned router status through fixed privacy-safe forms", async () => {
    const stateDir = await scratch("obs-01-router-status-");
    await writeFile(join(stateDir, "status.json"), JSON.stringify({
      pid: 790,
      version: "0.1.0",
      thresholds_version: 10,
      mute: null,
      components: {},
      modules: {
        routing: [
          {
            kind: "channels", key: "route.fatal",
            channels: ["digest", "status", "osascript", "sendmail", "kanban"]
          },
          { kind: "component", key: "storm.root", component: "postgres" },
          {
            kind: "uuid", key: "ack.signal",
            value: "70000000-0000-4000-8000-000000000001"
          },
          {
            kind: "identifier", key: "board", identifier_type: "board", value: "ops-alerts"
          },
          {
            kind: "identifier", key: "ticket", identifier_type: "external_ref",
            value: "t_70000001"
          },
          { kind: "loopback_endpoint", key: "status", port: 9797, path: "/status" },
          { kind: "state_child_path", key: "capture.dir", segments: ["dev-mail-capture"] },
          {
            kind: "template", key: "storm", template: "COUNT_SECONDS_THRESHOLD",
            count: 5, window_seconds: 60
          }
        ]
      }
    }));
    const { renderStatus } = await import(
      "../../apps/observation-agent/src/oactl/core/status.js"
    );

    expect(await renderStatus(stateDir)).toBe([
      `state_dir ${stateDir}`,
      "pid 790",
      "thresholds v10",
      "ack signal 70000000-0000-4000-8000-000000000001",
      "board ops-alerts",
      `capture dir ${join(stateDir, "dev-mail-capture")}`,
      "route fatal digest,status,osascript,sendmail,kanban",
      "status http://127.0.0.1:9797/status",
      "storm 5/60s",
      "storm root postgres",
      "ticket t_70000001"
    ].join("\n"));
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
    // pin updated 2026-09-19 (DL7-F4): dev custody is movable (DEBATEAI_DEV_CUSTODY_ROOT),
    // so the receipt names the file it actually wrote instead of a fixed repo-relative
    // string that would be a lie whenever the override is set. With no override the
    // resolver returns <repoRoot>/.local/dev-auth, so this fixture's path is unchanged.
    expect(result).toEqual({
      output: `PROVISIONED ${join(repoRoot, ".local/dev-auth/observation-agent.env")}`,
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
