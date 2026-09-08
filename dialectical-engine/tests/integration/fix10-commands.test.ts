import { describe, expect, it } from "vitest";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { chmod, mkdtemp, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { arm, runArmEntry, type ArmPort } from "../../tools/obs-listener/src/obsctl/arm.js";
import { kill, runKillEntry, type KillPort } from "../../tools/obs-listener/src/obsctl/kill.js";
import { runStatusEntry } from "../../tools/obs-listener/src/obsctl/status-entry.js";
import { parseObsctl } from "../../tools/obs-listener/src/obsctl/cli.js";

function killPort(failAt?: string): { port: KillPort; calls: string[] } {
  const calls: string[] = [];
  const hit = async (name: string): Promise<void> => { calls.push(name); if (name === failAt) throw new Error(name); };
  return { calls, port: {
    appendIntent: () => hit("intent"),
    ensureMarker: async (name) => { await hit(name); },
    sampleMarkers: async () => ({ captureOff: calls.includes("CAPTURE_OFF"), kill: calls.includes("KILL") }),
    appendResult: async (result) => { calls.push(`result:${result.outcome}`); if (failAt === "journal") throw new Error("journal"); },
  } };
}

describe("FIX-10 commands", () => {
  it("kill_orders_intent_capture_off_kill_journal", async () => {
    const { port, calls } = killPort();
    expect(await kill(port)).toEqual({ exitCode: 0, output: "KILLED\n" });
    expect(calls).toEqual(["intent", "CAPTURE_OFF", "KILL", "result:KILL_APPLIED"]);
  });

  it("kill_continues_markers_after_intent_failure", async () => {
    const { port, calls } = killPort("intent");
    expect((await kill(port)).exitCode).toBe(1);
    expect(calls.slice(0, 3)).toEqual(["intent", "CAPTURE_OFF", "KILL"]);
    expect(calls.at(-1)).toBe("result:KILL_AUDIT_DEGRADED");
  });

  it("kill_never_rolls_back_safety_marker", async () => {
    const { port, calls } = killPort("KILL");
    expect((await kill(port)).exitCode).toBe(1);
    expect(calls).not.toContain("REMOVE_CAPTURE_OFF");
  });

  it("kill_does_not_claim_success_when_journal_fails", async () => {
    const { port } = killPort("journal");
    expect(await kill(port)).toEqual({ exitCode: 1, output: "" });
  });

  it("arm_authenticates_before_any_write", async () => {
    const calls: string[] = [];
    const port: ArmPort = {
      authenticate: async () => { calls.push("auth"); throw new Error("denied"); },
      appendIntent: async () => { calls.push("intent"); },
      publishArmed: async () => { calls.push("armed"); },
      removeMarker: async (name) => { calls.push(`remove:${name}`); },
      ensureMarker: async (name) => { calls.push(`ensure:${name}`); },
      sampleMarkers: async () => ({ captureOff: true, kill: true }),
      appendResult: async () => { calls.push("result"); },
    };
    expect((await arm(port)).exitCode).toBe(1);
    expect(calls).toEqual(["auth", "intent", "result"]);
  });

  it("arm_orders_armed_capture_off_then_kill_removal", async () => {
    const calls: string[] = [];
    const port: ArmPort = {
      authenticate: async () => { calls.push("auth"); }, appendIntent: async () => { calls.push("intent"); },
      publishArmed: async () => { calls.push("armed"); }, removeMarker: async (name) => { calls.push(`remove:${name}`); },
      ensureMarker: async (name) => { calls.push(`ensure:${name}`); }, sampleMarkers: async () => ({ captureOff: false, kill: false }),
      appendResult: async (result) => { calls.push(`result:${result.outcome}`); },
    };
    expect(await arm(port)).toEqual({ exitCode: 0, output: "ARMED_PENDING_PROOF\n" });
    expect(calls).toEqual(["auth", "intent", "armed", "remove:CAPTURE_OFF", "remove:KILL", "result:ARM_APPLIED_PENDING_PROOF"]);
  });

  it("arm_rolls_back_capture_first_after_publication_failure", async () => {
    const calls: string[] = [];
    const port: ArmPort = {
      authenticate: async () => { calls.push("auth"); }, appendIntent: async () => { calls.push("intent"); },
      publishArmed: async () => { calls.push("armed"); }, removeMarker: async (name) => { calls.push(`remove:${name}`); if (name === "KILL") throw new Error("fail"); },
      ensureMarker: async (name) => { calls.push(`ensure:${name}`); }, sampleMarkers: async () => ({ captureOff: true, kill: true }),
      appendResult: async (result) => { calls.push(`result:${result.outcome}`); },
    };
    expect((await arm(port)).exitCode).toBe(1);
    expect(calls.slice(-3)).toEqual(["ensure:CAPTURE_OFF", "ensure:KILL", "result:ARM_FAILED_ROLLED_BACK"]);
  });
  async function localRoot(): Promise<{ root: string; environment: NodeJS.ProcessEnv }> {
    const created = await mkdtemp(join(tmpdir(), "fix10-command-")); const root = await realpath(created);
    await chmod(root, 0o751); await mkdir(join(root, "keys"), { mode: 0o711 }); await mkdir(join(root, "outbox"), { mode: 0o700 });
    await mkdir(join(root, "witness"), { mode: 0o711 }); await mkdir(join(root, "proof"), { mode: 0o2750 });
    const { privateKey } = generateKeyPairSync("ed25519");
    await writeFile(join(root, "keys", "obsctl-outbox.pk8"), privateKey.export({ format: "der", type: "pkcs8" }), { mode: 0o600 });
    await writeFile(join(root, "keys", "armed-marker.hmac"), randomBytes(32), { mode: 0o600 });
    await writeFile(join(root, "outbox", "obsctl-actions.jsonl"), "", { mode: 0o600 });
    await writeFile(join(root, "witness", "obsctl-actions.jsonl"), "", { mode: 0o600 });
    const uid = process.getuid!(); const gid = process.getgid!();
    return { root, environment: { OBS_CONTROL_DIR: root, OBS_POSTGRES_DATA_DEVICE_ID: String(Number((await stat(root)).dev) + 1),
      OBS_ARMED_HMAC_KEY_FILE: join(root, "keys", "armed-marker.hmac"), OBS_ARMED_TOKEN_STALENESS_MS: "1000",
      OBS_AUTHORITY_PROOF_STALENESS_MS: "1000", OBS_AUTHORITY_PROOF_REFRESH_INTERVAL_MS: "100",
      OBS_SKEW_TOLERANCE_MS: "10", OBS_FLUSH_INTERVAL_MS: "50", OBS_CAPTURE_GAP_QUIET_WINDOW_MS: "1260",
      OBS_KILL_POLL_INTERVAL_MS: "5", OBS_KILL_LATENCY_MS: "10",
      OBS_SPOOL_DIR: join(root, "spool"), OBS_POLICY_BUNDLE_PATH: join(root, "policy.json"), V_PROVISIONER_UID: String(uid + 1),
      V_PROVISIONER_GID: String(gid + 1), OBSCTL_UID: String(uid), OBSCTL_GID: String(gid), DAEMON_UID: String(uid + 2),
      DAEMON_GID: String(gid + 2), WATCHDOG_UID: String(uid + 3), WATCHDOG_GID: String(gid + 3), OBS_PUBLIC_READ_GID: String(gid),
      OBS_CHAIN_PUBLIC_GID: String(gid + 4), OBS_POLICY_CUSTODIAN_TOKEN: "0123456789abcdef" } };
  }

  it("entry_kill_uses_real_temp_control_root", async () => {
    const value = await localRoot(); const prior = { ...process.env }; Object.assign(process.env, value.environment);
    try { expect(await runKillEntry()).toMatchObject({ exitCode: 0, stdout: "KILLED\n" }); expect(await readFile(join(value.root, "KILL"))).toHaveLength(0); }
    finally { process.env = prior; }
  });

  it("entry_arm_reverses_real_temp_markers", async () => {
    const value = await localRoot(); const prior = { ...process.env }; Object.assign(process.env, value.environment);
    try { expect((await runKillEntry()).exitCode).toBe(0); expect(await runArmEntry()).toMatchObject({ exitCode: 0, stdout: "ARMED_PENDING_PROOF\n" }); }
    finally { process.env = prior; }
  });

  it("entry_status_audits_and_reports_local_state", async () => {
    const value = await localRoot(); const prior = { ...process.env }; Object.assign(process.env, value.environment);
    try {
      expect((await runKillEntry()).exitCode).toBe(0); expect((await runArmEntry()).exitCode).toBe(0);
      const result = await runStatusEntry(); expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ schema: "obsctl-status/v3", local_state: "ARMING",
        capture_gaps: { quiet_window_ms: "1260", query_window_ms: "1270", reason: "DB_UNAVAILABLE" } });
      process.env.OBSCTL_DATABASE_URL = "postgres://debateai_obs_listener:test@127.0.0.1/db";
      const calls: string[] = [];
      const reconciled = await runStatusEntry({
        facts: async (_url, quiet, skew) => { calls.push(`facts:${quiet}:${skew}`); return { openRows: "0", recentRows: "0" }; },
        reconcile: async (_url, records, appendReceipt) => {
          calls.push(`reconcile:${records.length}`);
          for (const record of records) await appendReceipt({ record,
            databaseActionId: "22222222-2222-4222-8222-222222222222" });
          return { reconciled: records.length, pending: 0 };
        },
      });
      expect(reconciled.exitCode).toBe(0);
      expect(JSON.parse(reconciled.stdout)).toMatchObject({ database: { state: "RECONCILED", reason: "NONE" },
        capture_gaps: { open_rows: "0", recent_rows: "0", reason: "NONE" } });
      expect(calls[0]).toBe("facts:1260:10");
    } finally { process.env = prior; }
  });

  it.each(Array.from({ length: 2 }, (_, index) => index + 1))("command_fault_matrix_%i", async () => {
    const { port } = killPort();
    expect((await kill(port)).exitCode).toBe(0);
    expect(parseObsctl(["chain", "rotate-row", "api-writer"]))
      .toEqual({ verb: "chain-rotate-row", args: ["api-writer"] });
    expect(() => parseObsctl(["chain-rotate-row", "api-writer"])).toThrow("FIX10_CLI_USAGE");
  });
});
