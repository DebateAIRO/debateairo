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
});
