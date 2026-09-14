import { describe, expect, it, vi } from "vitest";
import { createDaemon, type DaemonSafety } from "../../tools/obs-listener/src/daemon/main.js";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function generation(calls: string[]) {
  return { connect: async () => { calls.push("db"); }, listen: async () => undefined, tryLeadership: async () => false,
    selectPending: async () => undefined, withDelivery: async () => undefined, onNotification: () => undefined,
    onError: () => undefined, onEnd: () => undefined, removeNotification: () => undefined, removeError: () => undefined,
    removeEnd: () => undefined, close: async () => { calls.push("close"); } };
}

describe("FIX-10 daemon control", () => {
  it("kill_before_db_connect", async () => {
    const calls: string[] = [];
    const safety: DaemonSafety = { killed: async () => { calls.push("kill"); return true; }, abortLocal: async () => { calls.push("abort"); } };
    const daemon = createDaemon({ databaseUrl: "postgres://x", pollIntervalMs: 10, consumer: "fixagent-daemon" }, () => generation(calls), safety);
    await daemon.start(); await daemon.stop();
    expect(calls.slice(0, 2)).toEqual(["kill", "abort"]); expect(calls).not.toContain("db");
  });
  it("abort_precedes_optional_lease_release", async () => {
    const calls: string[] = [];
    const safety: DaemonSafety = { killed: async () => true, abortLocal: async () => { calls.push("abort"); }, releaseLease: async () => { calls.push("lease"); } };
    const daemon = createDaemon({ databaseUrl: "postgres://x", pollIntervalMs: 10, consumer: "fixagent-daemon" }, () => generation(calls), safety);
    await daemon.start(); expect(calls).toEqual(["abort", "lease"]); await daemon.stop();
  });
  it("healthy_start_samples_before_connect", async () => {
    const calls: string[] = [];
    const safety: DaemonSafety = { killed: async () => { calls.push("kill"); return false; }, abortLocal: async () => undefined };
    const daemon = createDaemon({ databaseUrl: "postgres://x", pollIntervalMs: 10, consumer: "fixagent-daemon" }, () => generation(calls), safety);
    await daemon.start(); await daemon.stop(); expect(calls.indexOf("kill")).toBeLessThan(calls.indexOf("db"));
  });
  it("timer_samples_without_database_recovery", async () => {
    vi.useFakeTimers(); const calls: string[] = []; let killed = false;
    const safety: DaemonSafety = { killed: async () => killed, abortLocal: async () => { calls.push("abort"); } };
    const daemon = createDaemon({ databaseUrl: "postgres://x", pollIntervalMs: 10, consumer: "fixagent-daemon" }, () => generation(calls), safety);
    await daemon.start(); killed = true; await vi.advanceTimersByTimeAsync(31);
    expect(calls.filter((call) => call === "abort")).toEqual(["abort"]);
    expect(calls.indexOf("abort")).toBeLessThan(calls.indexOf("close")); await daemon.stop(); vi.useRealTimers();
  });
  it.each(Array.from({ length: 4 }, (_, index) => index + 1))("daemon_kill_boundary_%i", async (ordinal) => {
    const calls: string[] = []; const daemon = createDaemon({ databaseUrl: "postgres://x", pollIntervalMs: 10,
      consumer: "fixagent-daemon" }, () => generation(calls), { killed: async () => true, abortLocal: async () => undefined });
    await daemon.start(); expect(calls).not.toContain("db"); await daemon.stop();
    if (ordinal === 1) {
      const root = await mkdtemp(join(tmpdir(), "fix10-daemon-root-"));
      await chmod(root, 0o751); await writeFile(join(root, "KILL"), "", { mode: 0o600 });
      const previous = process.env.OBS_CONTROL_DIR; process.env.OBS_CONTROL_DIR = root;
      try {
        const defaultCalls: string[] = [];
        const defaultDaemon = createDaemon({ databaseUrl: "postgres://x", pollIntervalMs: 10,
          consumer: "fixagent-daemon" }, () => generation(defaultCalls));
        await defaultDaemon.start(); await defaultDaemon.stop();
        expect(defaultCalls).not.toContain("db");
      } finally {
        if (previous === undefined) delete process.env.OBS_CONTROL_DIR; else process.env.OBS_CONTROL_DIR = previous;
      }
    }
  });
});
