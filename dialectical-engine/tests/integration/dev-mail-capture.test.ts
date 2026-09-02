import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SendmailMailSender } from "../../apps/api/src/mail-channel.js";

const executable = resolve("deploy/dev-auth/sendmail-capture.mjs");
const captureEnvironmentKey = "DEBATEAI_DEV_MAIL_CAPTURE_DIR";
const originalCaptureDirectory = process.env[captureEnvironmentKey];

afterEach(() => {
  if (originalCaptureDirectory === undefined) delete process.env[captureEnvironmentKey];
  else process.env[captureEnvironmentKey] = originalCaptureDirectory;
});

function permissions(path: string): number {
  return lstatSync(path).mode & 0o777;
}

describe.sequential("DEV-06 local sendmail-compatible capture", () => {
  it("preflights private spool custody without creating or reading a message", () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-dev-mail-"));
    const spool = join(root, "mail");
    try {
      const preflight = spawnSync(executable, ["--preflight"], {
        encoding: "utf8",
        env: { ...process.env, [captureEnvironmentKey]: spool }
      });
      expect(preflight.status).toBe(0);
      expect(preflight.stdout).toBe("");
      expect(preflight.stderr).toBe("");
      expect(permissions(spool)).toBe(0o700);
      expect(readdirSync(spool)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("captures the production verification message in a private opaque file", async () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-dev-mail-"));
    const spool = join(root, "mail");
    process.env[captureEnvironmentKey] = spool;
    try {
      const sender = new SendmailMailSender({
        executable,
        from: "noreply@localhost.test",
        publicAppUrl: "https://localhost:3000",
        timeoutMs: 2_000
      });
      const token = "A".repeat(43);
      await sender.sendVerification({
        attemptId: "attempt-not-persisted-by-the-sink",
        recipient: "developer@example.test",
        token,
        expiresAt: new Date("2026-08-27T10:00:00.000Z")
      });

      const files = readdirSync(spool);
      expect(files).toHaveLength(1);
      expect(files[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.eml$/);
      expect(files[0]).not.toContain("developer");
      expect(files[0]).not.toContain(token);
      expect(permissions(spool)).toBe(0o700);
      expect(permissions(join(spool, files[0]!))).toBe(0o600);

      const message = readFileSync(join(spool, files[0]!), "utf8");
      expect(message).toContain("To: developer@example.test\r\n");
      expect(message).toContain(`https://localhost:3000/verify-email#token=${token}`);
      expect(message).not.toContain("?token=");
      expect(message).not.toContain("attempt-not-persisted-by-the-sink");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("is silent on success and refuses unsafe existing spool custody", () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-dev-mail-"));
    const spool = join(root, "mail");
    const message = "To: developer@example.test\r\n\r\nsecret-token-value\r\n";
    try {
      const first = spawnSync(executable, ["-i", "-t", "-f", "noreply@localhost.test"], {
        encoding: "utf8",
        env: { ...process.env, [captureEnvironmentKey]: spool },
        input: message
      });
      expect(first.status).toBe(0);
      expect(first.stdout).toBe("");
      expect(first.stderr).toBe("");

      chmodSync(spool, 0o755);
      const refused = spawnSync(executable, ["-i", "-t", "-f", "noreply@localhost.test"], {
        encoding: "utf8",
        env: { ...process.env, [captureEnvironmentKey]: spool },
        input: message
      });
      expect(refused.status).not.toBe(0);
      expect(refused.stdout).toBe("");
      expect(refused.stderr).toMatch(/^DEV_MAIL_CAPTURE_[A-Z_]+\n$/);
      expect(refused.stderr).not.toContain("developer@example.test");
      expect(refused.stderr).not.toContain("secret-token-value");
      expect(readdirSync(spool)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses symlink custody and oversized input without leaving a message", () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-dev-mail-"));
    const spool = join(root, "mail");
    const args = ["-i", "-t", "-f", "noreply@localhost.test"];
    try {
      symlinkSync(root, spool);
      const symlinked = spawnSync(executable, args, {
        encoding: "utf8",
        env: { ...process.env, [captureEnvironmentKey]: spool },
        input: "To: developer@example.test\r\n\r\nbody\r\n"
      });
      expect(symlinked.status).not.toBe(0);
      expect(symlinked.stderr).toBe("DEV_MAIL_CAPTURE_CUSTODY_INVALID\n");

      rmSync(spool);
      const oversized = spawnSync(executable, args, {
        encoding: "utf8",
        env: { ...process.env, [captureEnvironmentKey]: spool },
        input: "x".repeat(256 * 1024 + 1)
      });
      expect(oversized.status).not.toBe(0);
      expect(oversized.stderr).toBe("DEV_MAIL_CAPTURE_MESSAGE_TOO_LARGE\n");
      expect(readdirSync(spool)).toEqual([]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("takes the recipient from a single strict To: header and refuses anything else", () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-dev-mail-"));
    const spool = join(root, "mail");
    const run = (input: string) => spawnSync(executable, ["-i", "-t", "-f", "noreply@localhost.test"], {
      encoding: "utf8",
      env: { ...process.env, [captureEnvironmentKey]: spool },
      input
    });
    try {
      const accepted = run("To: developer@example.test\r\nSubject: hello\r\n\r\nbody\r\n");
      expect(accepted.status).toBe(0);
      expect(accepted.stderr).toBe("");
      expect(readdirSync(spool)).toHaveLength(1);

      // Every rejected shape either hides a second recipient from the argv
      // reader or is simply not the message the mailer emits (L7-F7).
      for (const input of [
        "Subject: no recipient at all\r\n\r\nbody\r\n",
        "To: developer@example.test\r\nTo: attacker@example.test\r\n\r\nbody\r\n",
        "To: developer@example.test, attacker@example.test\r\n\r\nbody\r\n",
        "To: developer@example.test;attacker@example.test\r\n\r\nbody\r\n",
        "To: developer@example.test\r\nCc: attacker@example.test\r\n\r\nbody\r\n",
        "To: developer@example.test\r\nBcc: attacker@example.test\r\n\r\nbody\r\n",
        "To: developer@example.test\r\n\t, attacker@example.test\r\n\r\nbody\r\n",
        "To: <developer@example.test>\r\n\r\nbody\r\n",
        "To: Developer <developer@example.test>\r\n\r\nbody\r\n",
        "To: not-an-email\r\n\r\nbody\r\n",
        "To: developer@example.test\r\nbody with no header separator\r\n"
      ]) {
        const refused = run(input);
        expect(refused.status, input).not.toBe(0);
        expect(refused.stdout).toBe("");
        expect(refused.stderr).toMatch(/^DEV_MAIL_CAPTURE_[A-Z_]+\n$/);
        expect(refused.stderr).not.toContain("attacker@example.test");
      }
      // Only the one accepted message was ever written.
      expect(readdirSync(spool)).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

});
