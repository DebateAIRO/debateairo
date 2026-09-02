import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MailDeliveryError,
  SendmailSecurityNotificationSender
} from "../../apps/api/src/mail-channel.js";

describe("S10 own-sendmail security notification adapter", () => {
  it("writes only fixed event copy with the stable opaque message id", async () => {
    const directory = mkdtempSync(join(tmpdir(), "debateai-s10-mail-"));
    const executable = join(directory, "sendmail-capture");
    const capture = join(directory, "message.eml");
    writeFileSync(executable, `#!/bin/sh\ncat > '${capture.replaceAll("'", "'\\''")}'\n`, {
      encoding: "utf8",
      mode: 0o700
    });
    chmodSync(executable, 0o700);
    try {
      const sender = new SendmailSecurityNotificationSender({
        executable,
        from: "noreply@debateai.test",
        timeoutMs: 1_000
      });
      const messageId = "11111111-1111-4111-8111-111111111111";
      const executeAt = new Date("2026-08-31T00:00:00.000Z");
      for (const [eventKind, expected] of [
        ["SCHEDULED", "Deletion is scheduled for 2026-08-31T00:00:00.000Z."],
        ["CANCELLED", "The scheduled account deletion was cancelled."],
        ["COMPLETION", "Your account deletion has entered its irreversible completion step."]
      ] as const) {
        await sender.sendSecurityNotification({
          messageId,
          recipient: "person@example.test",
          eventKind,
          executeAt
        });
        const message = readFileSync(capture, "utf8");
        expect(message).toContain("From: noreply@debateai.test\r\n");
        expect(message).toContain("To: person@example.test\r\n");
        expect(message).toContain(`Message-ID: <${messageId}@debateai.local>\r\n`);
        expect(message).toContain(expected);
        expect(message).not.toContain("DELETE MY ACCOUNT");
      }
      await expect(sender.sendSecurityNotification({
        messageId,
        recipient: "person@example.test\r\nBcc: attacker@example.test",
        eventKind: "SCHEDULED",
        executeAt
      })).rejects.toEqual(expect.objectContaining<Partial<MailDeliveryError>>({
        operatorCode: "MAIL_INPUT_INVALID"
      }));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("never puts a recipient address on the sendmail argv (L7-F7)", async () => {
    const directory = mkdtempSync(join(tmpdir(), "debateai-s10-mail-argv-"));
    const executable = join(directory, "sendmail-capture");
    const argumentsFile = join(directory, "arguments.txt");
    writeFileSync(
      executable,
      `#!/bin/sh\nprintf '%s\\n' "$@" > '${argumentsFile.replaceAll("'", "'\\''")}'\ncat >/dev/null\n`,
      { encoding: "utf8", mode: 0o700 }
    );
    chmodSync(executable, 0o700);
    try {
      const sender = new SendmailSecurityNotificationSender({
        executable,
        from: "noreply@debateai.test",
        // This test pins argv, not timing; a 1s budget flakes on a loaded host.
        timeoutMs: 30_000
      });
      await sender.sendSecurityNotification({
        messageId: "11111111-1111-4111-8111-111111111111",
        recipient: "person@example.test",
        eventKind: "SCHEDULED",
        executeAt: new Date("2026-08-31T00:00:00.000Z")
      });
      const argv = readFileSync(argumentsFile, "utf8").trim().split("\n");
      // `-t` reads the recipient out of the header block on stdin, so it never
      // appears in `ps` output for every local user (L7-F7).
      expect(argv).toEqual(["-i", "-t", "-f", "noreply@debateai.test"]);
      expect(argv).not.toContain("--");
      for (const argument of argv) {
        expect(argument).not.toContain("person@example.test");
      }
      expect(argv.filter((argument) => argument.includes("@")))
        .toEqual(["noreply@debateai.test"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses a recipient that could fan the message out under -t", async () => {
    const sender = new SendmailSecurityNotificationSender({
      executable: "/definitely/not/a/sendmail-binary",
      from: "noreply@debateai.test",
      timeoutMs: 1_000
    });
    // Under `-t` the MTA parses the `To:` header, so a separator inside a
    // single address would deliver a second copy to a mailbox we never vetted.
    // Each of these carries one `@`, so the address shape alone accepts them:
    // only the explicit `,`/`;` guard refuses them.
    for (const recipient of [
      "person,attacker@example.test",
      "person;attacker@example.test",
      "person@example.test,attacker",
      "person@example.test;attacker"
    ]) {
      await expect(sender.sendSecurityNotification({
        messageId: "11111111-1111-4111-8111-111111111111",
        recipient,
        eventKind: "SCHEDULED",
        executeAt: new Date("2026-08-31T00:00:00.000Z")
      })).rejects.toEqual(expect.objectContaining<Partial<MailDeliveryError>>({
        operatorCode: "MAIL_INPUT_INVALID"
      }));
    }
  });
});
