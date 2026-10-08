import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { SendmailMailSender, SendmailRecoveryEmailMailSender, SendmailEmailChangeMailSender, isSingleDeliverableRecipient } from "../../apps/api/src/mail-channel.js";
import { mailAlternatives } from "../support/accountMail.js";
it("produces exactly two base64 alternatives without bearer headers or tracking", async () => {
  const dir = await mkdtemp(join(tmpdir(), "task6-mime-")), capture = join(dir, "mail"), executable = join(dir, "sink");
  await writeFile(executable, `#!${process.execPath}\nimport fs from 'node:fs'; let chunks=[]; for await(const c of process.stdin)chunks.push(c); fs.writeFileSync(${JSON.stringify(capture)}, Buffer.concat(chunks),{mode:0o600});`, { mode: 0o700 });
  try {
    const sender = new SendmailMailSender({ executable, from: "noreply@dezbatere.ro", publicAppUrl: "https://v3-preview.dezbatere.ro", timeoutMs: 5000 });
    const token = "Z".repeat(43);
    await sender.sendVerification({ attemptId: "opaque", recipient: "person@example.test", token, expiresAt: new Date("2026-10-05T07:41:00Z"), display: { locale: "ro", timeZone: "Europe/Bucharest" } });
    const message = await readFile(capture, "utf8"), parts = mailAlternatives(message);
    expect(message).toContain("From: dezbatere.ro <noreply@dezbatere.ro>\r\n");
    expect(message).toContain("Subject: Verify your email for Dialectical Engine\r\n");
    expect(message).toContain('Content-Type: multipart/alternative; boundary="dialectical-account-v1"');
    expect(message.match(/Content-Transfer-Encoding: base64/g)).toHaveLength(2);
    expect(message.split("\r\n\r\n")[0]).not.toContain(token);
    expect(parts.text).toContain("5 octombrie 2026"); expect(parts.html).toContain("5 octombrie 2026");
    expect(parts.text).toContain(`https://v3-preview.dezbatere.ro/verify-email#token=${token}`);
    expect(parts.html).not.toMatch(/<img|src=|<script/);
    expect(message).not.toMatch(/(?<!\r)\n/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
describe("producer refuses malformed inputs before spawn", () => {
  it.each(["a<b@c.test", '"a"@c.test', "a@c.test> <x@y.test", "a:b@c.test", "a\\b@c.test"])("rejects header address syntax %s", recipient => {
    expect(isSingleDeliverableRecipient(recipient)).toBe(false);
  });
  it.each([new Date(NaN), "invalid" as unknown as Date])("rejects invalid expiry %s", async expiresAt => {
    const sender = new SendmailMailSender({ executable: "/definitely/no/spawn", from: "noreply@dezbatere.ro", publicAppUrl: "https://dezbatere.ro", timeoutMs: 1000 });
    await expect(sender.sendVerification({ attemptId: "opaque", recipient: "person@example.test", token: "Z".repeat(43), expiresAt })).rejects.toMatchObject({ operatorCode: "MAIL_INPUT_INVALID" });
  });
});

it("recovery invalid dates retain the opaque pre-spawn input failure", async () => {
  const sender = new SendmailRecoveryEmailMailSender({ executable: "/definitely/no/spawn", from: "noreply@dezbatere.ro", publicAppUrl: "https://dezbatere.ro", timeoutMs: 1000 });
  for (const expiresAt of [new Date(NaN), "invalid" as unknown as Date]) await expect(sender.sendRecoveryEmail({ kind: "confirmation", recipient: "person@example.test", token: "Z".repeat(43), expiresAt })).rejects.toMatchObject({ operatorCode: "MAIL_INPUT_INVALID" });
});

describe("configured credential origins", () => {
  it.each(["https://", "https://user:password@dezbatere.ro", "https://dezbatere.ro?token=override", "https://dezbatere.ro#token=override", "https://dezbatere.ro\r\n"])("rejects unsafe configuration %s", publicAppUrl => {
    for (const Sender of [SendmailMailSender, SendmailRecoveryEmailMailSender, SendmailEmailChangeMailSender]) expect(() => new Sender({ executable: "/definitely/no/spawn", from: "noreply@dezbatere.ro", publicAppUrl, timeoutMs: 1000 })).toThrow("OWN_MAIL_CONFIGURATION_INVALID");
  });
});
