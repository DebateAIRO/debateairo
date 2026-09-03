import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../../packages/db/src/index.js";
import { startTestDatabase, type TestDatabase } from "../support/testDatabase.js";

let database: TestDatabase;
let stateDir: string;

beforeAll(async () => {
  database = await startTestDatabase();
  await migrate(database.pool);
  stateDir = await mkdtemp(join(tmpdir(), "obs-01-supervision-"));
}, 120_000);

afterAll(async () => {
  await database.stop();
  await rm(stateDir, { recursive: true, force: true });
});

const POLICY = {
  schema_version: 1,
  liveness: {
    probe_interval_ms: 5_000, probe_timeout_ms: 2_000,
    open_after_failures: 2, clear_after_successes: 2
  },
  notification: {
    rate_limit_ms: 600_000, degraded_after_ms: 900_000, timeout_ms: 2_000
  },
  resources: {
    cpu_percent_max: 2, rss_mb_max: 150,
    max_database_sessions: 2, statement_timeout_ms: 2_000
  },
  routing: {
    INFRA_DOWN: "FATAL", INFRA_NOT_READY: "DEGRADED",
    INFRA_UNKNOWN: "SEVERE", AGENT_SELF: "SEVERE"
  }
} as const;

describe("OBS-01 ratified threshold versions", () => {
  it("fails closed with no row and inserts immutable ascending versions with a diff", async () => {
    const { ThresholdRepository } = await import(
      "../../apps/observation-agent/src/oactl/core/thresholds.js"
    );
    const repository = new ThresholdRepository(database.pool);
    await expect(repository.readCurrent()).rejects.toThrow("OBSERVATION_THRESHOLDS_UNRESOLVED");
    await expect(repository.apply(POLICY, "OBS-01-v1", "V")).resolves.toMatchObject({
      version: 1,
      diff: ["<none> -> configured"]
    });
    const changed = {
      ...POLICY,
      notification: { ...POLICY.notification, rate_limit_ms: 300_000 }
    };
    await expect(repository.apply(changed, "OBS-01-drill", "V")).resolves.toMatchObject({
      version: 2,
      diff: ["notification.rate_limit_ms: 600000 -> 300000"]
    });
    expect((await database.pool.query<{ version: number }>(
      "SELECT version FROM observation.threshold_policy ORDER BY version"
    )).rows.map((row) => row.version)).toEqual([1, 2]);
    await expect(repository.readCurrent()).resolves.toMatchObject({ version: 2, value: changed });
  });
});

describe("OBS-01 external supervision witnesses", () => {
  it("rejects invalid targets with one code and exit 2 within five seconds", async () => {
    const startedAt = Date.now();
    const mainPath = join(import.meta.dirname, "../../apps/observation-agent/src/main.ts");
    const result = await new Promise<Readonly<{ code: number | null; stdout: string; stderr: string }>>(
      (resolveResult, reject) => {
        const child = spawn(process.execPath, ["--import", "tsx", mainPath], {
          cwd: join(import.meta.dirname, "../.."),
          env: {
            OBSERVATION_DATABASE_URL: "postgresql://agent:secret@127.0.0.1:1/debateai",
            OBSERVATION_STATE_DIR: stateDir,
            OBSERVATION_TARGETS_PATH: join(stateDir, "missing-targets"),
            OBSERVATION_HATCHET_TOKEN_PATH: join(stateDir, "token")
          },
          stdio: ["ignore", "pipe", "pipe"]
        });
        let stdout = "";
        let stderr = "";
        child.stdout.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
        child.stderr.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
        child.once("error", reject);
        child.once("close", (code) => resolveResult({ code, stdout, stderr }));
      }
    );
    expect(result).toEqual({ code: 2, stdout: "", stderr: "OBSERVATION_TARGETS_INVALID\n" });
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });

  it("refreshes the heartbeat file and singleton database row with the bounded session", async () => {
    const { HeartbeatWriter } = await import(
      "../../apps/observation-agent/src/modules/self/heartbeat.js"
    );
    const writer = new HeartbeatWriter({ pool: database.pool, stateDir });
    const now = new Date("2026-09-03T09:00:05.000Z");
    await writer.write({ now, pid: 4321, version: "0.1.0", thresholdsVersion: 2 });
    expect(await readFile(join(stateDir, "heartbeat"), "utf8")).toBe(
      "2026-09-03T09:00:05.000Z\n"
    );
    expect((await stat(join(stateDir, "heartbeat"))).isFile()).toBe(true);
    expect((await database.pool.query<{
      pid: number; version: string; thresholds_version: number; observed_at: Date;
    }>("SELECT pid,version,thresholds_version,observed_at FROM observation.heartbeat")).rows[0])
      .toMatchObject({ pid: 4321, version: "0.1.0", thresholds_version: 2 });
  });

  it("keeps a cycle alive when only the database heartbeat mirror fails", async () => {
    const { writeHeartbeatFailOpen } = await import(
      "../../apps/observation-agent/src/modules/self/heartbeat.js"
    );
    let attempted = 0;
    await expect(writeHeartbeatFailOpen({
      async write() { attempted += 1; throw new Error("postgres down"); }
    }, {
      now: new Date("2026-09-03T09:00:10.000Z"),
      pid: 4321,
      version: "0.1.0",
      thresholdsVersion: 2
    })).resolves.toBe(false);
    expect(attempted).toBe(1);
  });

  it("creates fixed start, stop, journal-failure and threshold-change self signals", async () => {
    const { makeSelfSignal, makeThresholdChangedSignal } = await import(
      "../../apps/observation-agent/src/modules/self/signals.js"
    );
    const common = {
      seq: 20,
      now: new Date("2026-09-03T09:01:00.000Z"),
      thresholdVersion: 2,
      signalId: "20000000-0000-4000-8000-000000000020"
    } as const;
    expect(makeSelfSignal({ ...common, event: "START" })).toMatchObject({
      class: "AGENT_SELF", component: "observation_agent", severity: "INFO",
      impact_code: "IMPACT_AGENT_START", evidence: { reason: "START" }
    });
    expect(makeSelfSignal({ ...common, seq: 21, event: "STOP",
      signalId: "20000000-0000-4000-8000-000000000021" })).toMatchObject({
      severity: "INFO", impact_code: "IMPACT_AGENT_STOP", evidence: { reason: "STOP" }
    });
    expect(makeSelfSignal({ ...common, seq: 22, event: "JOURNAL_FAILURE",
      signalId: "20000000-0000-4000-8000-000000000022" })).toMatchObject({
      severity: "SEVERE", impact_code: "IMPACT_AGENT_JOURNAL",
      evidence: { reason: "JOURNAL_FAILURE" }
    });
    expect(makeThresholdChangedSignal({ ...common, previousVersion: 1, currentVersion: 2 }))
      .toMatchObject({
        class: "THRESHOLD_CHANGED", severity: "INFO", impact_code: "IMPACT_THRESHOLDS",
        evidence: { previous_version: 1, current_version: 2 }
      });
  });

  it("delivers journal-failure copy directly when the durable store itself is unavailable", async () => {
    const invocations: Array<readonly [string, readonly string[], number]> = [];
    const { deliverJournalFailureDirect } = await import(
      "../../apps/observation-agent/src/modules/self/direct-notify.js"
    );
    await deliverJournalFailureDirect({
      execute: async (file, args, timeoutMs) => { invocations.push([file, args, timeoutMs]); },
      timeoutMs: 2_000
    });
    expect(invocations).toEqual([[
      "/usr/bin/osascript",
      ["-e", "display notification \"ObservationAgent cannot write its journal: signals may be lost until storage is restored.\" with title \"dialectical-engine: observation_agent SEVERE\" subtitle \"AGENT_SELF\""],
      2_000
    ]]);
  });

  it("renders launchd custody and invokes only the observation-agent label", async () => {
    const invocations: Array<readonly [string, readonly string[]]> = [];
    const { launchdLabel, renderLaunchAgent, startLaunchAgent, stopLaunchAgent } = await import(
      "../../apps/observation-agent/src/oactl/core/launchd.js"
    );
    const plist = renderLaunchAgent({
      launchScript: "/repo/apps/observation-agent/bin/launch.sh",
      stateDir
    });
    expect(plist).toContain("<key>RunAtLoad</key>\n  <true/>");
    expect(plist).toContain("<key>KeepAlive</key>\n  <true/>");
    expect(plist).toContain("<key>ThrottleInterval</key>\n  <integer>10</integer>");
    expect(plist).toContain(join(stateDir, "stdout.log"));
    const execute = async (file: string, args: readonly string[]) => {
      invocations.push([file, args]);
    };
    await startLaunchAgent({ uid: 501, execute });
    await stopLaunchAgent({ uid: 501, execute });
    expect(invocations).toEqual([
      ["/bin/launchctl", ["kickstart", "gui/501/com.dialectical-engine.observation-agent"]],
      ["/bin/launchctl", ["bootout", "gui/501/com.dialectical-engine.observation-agent"]]
    ]);
    expect(launchdLabel).toBe("com.dialectical-engine.observation-agent");
  });

  it("escalates only the launchd-reported agent PID after a five-second grace", async () => {
    const actions: string[] = [];
    const { killLaunchAgent } = await import(
      "../../apps/observation-agent/src/oactl/core/launchd.js"
    );
    await killLaunchAgent({
      uid: 501,
      execute: async (_file, args) => { actions.push(args.join(" ")); },
      findPid: async () => 4321,
      signal: (pid, name) => { actions.push(`${name} ${pid}`); },
      wait: async (milliseconds) => { actions.push(`wait ${milliseconds}`); },
      isAlive: () => true
    });
    expect(actions).toEqual([
      "bootout gui/501/com.dialectical-engine.observation-agent",
      "SIGTERM 4321",
      "wait 5000",
      "SIGKILL 4321"
    ]);
  });

  it("bootstraps the installed plist when start follows a bootout kill", async () => {
    const actions: string[] = [];
    const { startLaunchAgent } = await import(
      "../../apps/observation-agent/src/oactl/core/launchd.js"
    );
    await startLaunchAgent({
      uid: 501,
      fallbackPlistPath: "/home/Library/LaunchAgents/com.dialectical-engine.observation-agent.plist",
      execute: async (_file, args) => {
        actions.push(args.join(" "));
        if (args[0] === "kickstart") throw new Error("not loaded");
      }
    });
    expect(actions).toEqual([
      "kickstart gui/501/com.dialectical-engine.observation-agent",
      "bootstrap gui/501 /home/Library/LaunchAgents/com.dialectical-engine.observation-agent.plist"
    ]);
  });
});
