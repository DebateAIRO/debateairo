import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signalSchema } from "../../apps/observation-agent/src/core/signals.js";
import {
  createSendmailDeliveryExecutor,
  resolveCaptureDirectory
} from "../../apps/observation-agent/src/modules/channels-sendmail/sendmail.js";
import {
  sendmailFailureObservation,
  sendmailFailureSignal
} from "../../apps/observation-agent/src/modules/channels-sendmail/failures.js";

const scratchDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(scratchDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function scratch(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "obs-07-sendmail-"));
  scratchDirectories.push(path);
  return path;
}

function fatalSignal() {
  const at = "2026-09-05T08:00:00.000Z";
  return signalSchema.parse({
    seq: 701, signal_id: "70000000-0000-4000-8000-000000000701", state: "OPEN",
    class: "INFRA_DOWN", component: "hatchet", severity: "FATAL",
    impact_code: "IMPACT_HATCHET_DOWN", first_failed_probe_at: at, detected_at: at,
    evidence: { probe: "http_get", last_status: "FAILED" }, suspected_defect: false,
    defect_kind: null, run_ref: null, work_item_ref: null, threshold_version: 7,
    clears_signal_id: null, recorded_at: at
  });
}

describe("OBS-07 sendmail channel", () => {
  it("maps delivery failure to the truthful closed AGENT_SELF impact and evidence", () => {
    const at = new Date("2026-09-05T08:00:02.000Z");
    expect(sendmailFailureSignal(sendmailFailureObservation(at))).toMatchObject({
      component: "observation_agent",
      class: "AGENT_SELF",
      severity: "DEGRADED",
      impactCode: "IMPACT_AGENT_DELIVERY",
      evidence: { reason: "DELIVERY_FAILURE", channel: "sendmail" },
      suspectedDefect: false,
      defectKind: null
    });
  });

  it("validates a V-owned mode-0700 state child and rejects escape or weak custody", async () => {
    const stateDir = await scratch();
    const capture = join(stateDir, "dev-mail-capture");
    await mkdir(capture, { mode: 0o700 });
    await expect(resolveCaptureDirectory(stateDir, "dev-mail-capture")).resolves.toBe(capture);
    await expect(resolveCaptureDirectory(stateDir, "../outside")).rejects.toThrow(
      "OBSERVATION_SENDMAIL_CAPTURE_INVALID"
    );
    await chmod(capture, 0o755);
    await expect(resolveCaptureDirectory(stateDir, "dev-mail-capture")).rejects.toThrow(
      "OBSERVATION_SENDMAIL_CAPTURE_INVALID"
    );
  });

  it("uses exact argv, a fixed template, child-only capture env, stdin close, and 10s timeout", async () => {
    const stateDir = await scratch();
    const capture = join(stateDir, "dev-mail-capture");
    await mkdir(capture, { mode: 0o700 });
    const calls: unknown[] = [];
    const execute = createSendmailDeliveryExecutor({
      stateDir,
      configuration: {
        notify: {
          sendmail_path: "deploy/dev-auth/sendmail-capture.mjs",
          dev_capture_dir: "dev-mail-capture",
          from: "observation-agent@localhost",
          to: "ops@localhost"
        }
      },
      async spawn(request) {
        calls.push(request);
        return Object.freeze({ stdout: "", stderr: "" });
      }
    });
    const now = new Date("2026-09-05T08:00:01.000Z");
    await expect(execute(fatalSignal(), now, { ordinal: 0, openExternalRef: null }))
      .resolves.toEqual({ deliveredAt: now, externalRef: null });
    expect(calls).toEqual([{
      file: "deploy/dev-auth/sendmail-capture.mjs",
      args: ["-i", "-f", "observation-agent@localhost", "--", "ops@localhost"],
      stdin: "Subject: dialectical-engine FATAL hatchet INFRA_DOWN\nContent-Type: text/plain; charset=utf-8\n\nHatchet is down: asks are accepted but no debate work is dispatched or run.\n",
      env: {
        PATH: "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin",
        DEBATEAI_DEV_MAIL_CAPTURE_DIR: capture
      },
      timeoutMs: 10_000,
      closeStdin: true
    }]);
  });
});
