import { mailAlternatives } from "../support/accountMail.js";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { recoveryEmailLink, SendmailRecoveryEmailMailSender } from "../../apps/api/src/mail-channel.js";
describe("recovery email confirmation link", () => {
  it("carries only the confirmation bearer in the fragment", () => {
    const link = new URL(recoveryEmailLink("https://dezbatere.ro", "t".repeat(43)));
    expect(link.pathname).toBe("/verify-recovery-email");
    expect(link.search).toBe("");
    expect(link.hash).toBe(`#token=${"t".repeat(43)}`);
  });
  it("rejects malformed bearers", () => {
    expect(() => recoveryEmailLink("https://dezbatere.ro", "bad\nrecipient")).toThrow("MAIL_INPUT_INVALID");
  });
});
it("sends a purpose-limited fragment link through stdin without recipient argv", async () => {
  const directory = mkdtempSync(join(tmpdir(), "task3-capture-")), capture = join(directory, "mail.eml"), argv = join(directory, "argv.txt"), executable = join(directory, "capture");
  writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argv}'\ncat > '${capture}'\n`, {
    mode: 0o700
  });
  try {
    const sender = new SendmailRecoveryEmailMailSender({
      executable, from: "noreply@dezbatere.ro", publicAppUrl: "https://dezbatere.ro", timeoutMs: 30000
    });
    await sender.sendRecoveryEmail({
      kind: "confirmation", recipient: "candidate@example.test", token: "t".repeat(43), expiresAt: new Date("2026-10-05T12:00:00.000Z")
    });
    const mail = readFileSync(capture, "utf8");
    expect(mail).toContain("To: candidate@example.test\r\n");
    expect(mailAlternatives(mail).text).toContain("https://dezbatere.ro/verify-recovery-email#token=");
    expect(mailAlternatives(mail).html).toContain("https://dezbatere.ro/verify-recovery-email#token=");
    expect(mail).not.toContain("?token=");
    expect(readFileSync(argv, "utf8").trim().split("\n")).toEqual(["-i", "-t", "-f", "noreply@dezbatere.ro"]);
    await expect(sender.sendRecoveryEmail({
      kind: "confirmation", recipient: "candidate@example.test\r\nBcc: victim@example.test", token: "t".repeat(43), expiresAt: new Date()
    })).rejects.toMatchObject({
      operatorCode: "MAIL_INPUT_INVALID"
    });
  }
  finally {
    rmSync(directory, {
      recursive: true, force: true
    });
  }
});
