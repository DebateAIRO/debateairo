import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { signalSchema } from "../../apps/observation-agent/src/core/signals.js";
import {
  createSendmailDeliveryExecutor,
  resolveCaptureDirectory,
  type SendmailSpawnRequest
} from "../../apps/observation-agent/src/modules/channels-sendmail/sendmail.js";

const CAPTURE_SCRIPT = "deploy/dev-auth/sendmail-capture.mjs";
const SHIPPED_FRAGMENT = "deploy/observation-agent/targets.dev.d/OBS-07.json";

/**
 * DL7-F3. The capture script IS the contract, so this pin reads the flags out
 * of the script's own `requireInvocation` guard instead of restating them.
 * Until 2026-09-18 the agent's pin restated `-i -f <from> -- <to>` against a
 * fake spawn while the script demanded `-i -t -f <from>`: two pins that
 * contradicted each other and both passed. Derive the contract and they
 * cannot drift apart again.
 */
async function captureInvocationContract(): Promise<Readonly<{
  argumentCount: number;
  flags: readonly string[];
}>> {
  const source = await readFile(CAPTURE_SCRIPT, "utf8");
  const count = /argv\.length !== (\d+)/u.exec(source);
  const flags = [...source.matchAll(/argv\[(\d+)\] !== "([^"]+)"/gu)];
  if (count === null || flags.length === 0) {
    throw new Error("the capture script's invocation guard could not be read");
  }
  return Object.freeze({
    argumentCount: Number(count[1]),
    flags: Object.freeze(flags
      .sort((left, right) => Number(left[1]) - Number(right[1]))
      .map((match) => match[2]!))
  });
}

/** A grammar the script enforces, read from the script itself (DL7-F3). */
async function captureGrammar(name: "RECIPIENT_GRAMMAR" | "EMAIL_SHAPE"): Promise<RegExp> {
  const source = await readFile(CAPTURE_SCRIPT, "utf8");
  const pattern = new RegExp(`${name}\\s*=\\s*\\n?\\s*/([^\\n]+)/;`, "u").exec(source);
  if (pattern === null) throw new Error(`the capture script's ${name} could not be read`);
  return new RegExp(pattern[1]!);
}

const captureRecipientGrammar = () => captureGrammar("RECIPIENT_GRAMMAR");
const captureEnvelopeSenderShape = () => captureGrammar("EMAIL_SHAPE");

/** The `notify` block of the fragment the agent ships with. */
function shippedNotify(fragment: unknown): Readonly<Record<string, string>> {
  const notify = (fragment as Readonly<{ notify?: unknown }>).notify;
  if (notify === null || typeof notify !== "object" || Array.isArray(notify)) {
    throw new Error(`${SHIPPED_FRAGMENT} carries no notify block`);
  }
  return notify as Readonly<Record<string, string>>;
}

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

  it("meets the capture script's own invocation contract with no recipient on argv", async () => {
    const repoRoot = await scratch();
    const stateDir = join(repoRoot, "state");
    const capture = join(stateDir, "dev-mail-capture");
    const packageDirectory = join(repoRoot, "apps/observation-agent");
    const sendmail = join(repoRoot, "deploy/dev-auth/sendmail-capture.mjs");
    await Promise.all([
      mkdir(capture, { recursive: true, mode: 0o700 }),
      mkdir(packageDirectory, { recursive: true }),
      mkdir(join(repoRoot, ".local/dev-auth/tls"), { recursive: true }),
      mkdir(join(repoRoot, "deploy/dev-auth"), { recursive: true })
    ]);
    await Promise.all([
      writeFile(join(repoRoot, ".local/dev-auth/tls/localhost.pem"), "certificate"),
      writeFile(sendmail, "capture")
    ]);
    // The notify block the agent actually ships with, so this pin measures the
    // deployed configuration against the sink's grammar, not a fixture (DL7-F3).
    const notify = shippedNotify(JSON.parse(await readFile(SHIPPED_FRAGMENT, "utf8")));
    const calls: SendmailSpawnRequest[] = [];
    const execute = createSendmailDeliveryExecutor({
      repoRoot,
      stateDir,
      configuration: { notify },
      async spawn(request) {
        await readFile(request.file);
        calls.push(request);
        return Object.freeze({ stdout: "", stderr: "" });
      }
    });
    const now = new Date("2026-09-05T08:00:01.000Z");
    const originalCwd = process.cwd();
    try {
      process.chdir(packageDirectory);
      await expect(execute(fatalSignal(), now, { ordinal: 0, openExternalRef: null }))
        .resolves.toEqual({ deliveredAt: now, externalRef: null });
    } finally {
      process.chdir(originalCwd);
    }
    expect(calls).toHaveLength(1);
    const request = calls[0]!;
    expect(request.file).toBe(sendmail);
    expect(request.env).toEqual({
      PATH: `${join(homedir(), ".local/bin")}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`,
      DEBATEAI_DEV_MAIL_CAPTURE_DIR: capture
    });
    expect(request.timeoutMs).toBe(10_000);
    expect(request.closeStdin).toBe(true);

    // argv: exactly the script's flags plus the envelope sender, and nothing else.
    const contract = await captureInvocationContract();
    expect(request.args).toEqual([...contract.flags, notify.from]);
    expect(request.args).toHaveLength(contract.argumentCount);
    // No recipient on argv (L7-F7): the envelope sender is the only address there.
    expect(request.args.filter((argument) => argument.includes("@"))).toEqual([notify.from]);
    expect(request.args).not.toContain(notify.to);
    expect(notify.from).toMatch(await captureEnvelopeSenderShape());

    // Message: CRLF framing throughout, exactly one `To:`, no fan-out header,
    // no obs-fold continuation — the four things the script itself checks.
    expect(request.stdin).not.toMatch(/(?<!\r)\n/u);
    const separator = request.stdin.indexOf("\r\n\r\n");
    expect(separator).toBeGreaterThan(0);
    const headers = request.stdin.slice(0, separator).split("\r\n");
    expect(headers.filter((header) => /^to:/iu.test(header))).toEqual([`To: ${notify.to}`]);
    expect(notify.to).toMatch(await captureRecipientGrammar());
    expect(headers.some((header) => /^[ \t]/u.test(header))).toBe(false);
    expect(headers.some((header) =>
      /^(?:cc|bcc|resent-to|resent-cc|resent-bcc):/iu.test(header))).toBe(false);
    expect(request.stdin.slice(separator + 4))
      .toBe("Hatchet is down: asks are accepted but no debate work is dispatched or run.\r\n");
    expect(headers).toContain("Subject: dialectical-engine FATAL hatchet INFRA_DOWN");
  });
});
