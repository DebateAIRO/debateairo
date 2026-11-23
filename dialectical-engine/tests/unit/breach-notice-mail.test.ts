import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEmailBlindIndex } from "@debateai/crypto";
import { renderPasswordResetMail } from "../../apps/api/src/password-reset-mail.js";
import { renderEmailRecoveryMail } from "../../apps/api/src/email-mfa-mail.js";
import { buildTemplatedMessage } from "../../apps/api/src/mail-mime.js";
import {
  BreachNoticeMailSender,
  MailDeliveryError,
  MemoryBreachNoticeMailSender,
  isSingleDeliverableRecipient,
  renderAccountMailMessage,
  type BreachNoticeMail
} from "../../apps/api/src/mail-channel.js";
import { OutboundMailGate, mailPurposeClass, type OutboundMailGateEvent } from "../../apps/api/src/outbound-mail-gate.js";
import { parseBreachNoticeText, renderBreachNotice } from "../../apps/api/src/breach-notice/text.js";
import { MemoryOutboundMailStore, testOutboundMailGate } from "../support/outboundMailGate.js";

// A breach notice is one mail of its own per account, over the same road as every other account mail: the outbound mail
// gate (address rule, blocked addresses, the day's limit), then the mail program named in MAIL_SENDMAIL_PATH with the
// recipient in the header block. On the hosted site that program is deploy/preview-auth-dev/v1/mail-handoff.mjs, which
// holds the mail plan and its allow-list lock; the last tests prove it takes this mail under both.

const hosted = await import("../../deploy/" + "preview-auth-dev/v1/mail-handoff.mjs");
const fixture = await import("../../deploy/" + "preview-mail/v4-20261005/synthetic-recipient-fixture.mjs");

const CAPTURE = resolve("deploy/dev-auth/sendmail-capture.mjs");
const CAPTURE_DIR = "DEBATEAI_DEV_MAIL_CAPTURE_DIR";
const original = process.env[CAPTURE_DIR];
const folders: string[] = [];
const temporary = (prefix: string): string => {
  const folder = mkdtempSync(join(tmpdir(), prefix));
  folders.push(folder);
  return folder;
};
afterEach(() => {
  if (original === undefined) delete process.env[CAPTURE_DIR];
  else process.env[CAPTURE_DIR] = original;
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

const rendered = renderBreachNotice(parseBreachNoticeText("ro", [
  "Subject: Notificare privind o încălcare a securității datelor",
  "",
  "Ce s-a întâmplat",
  "Pe 3 mai cineva a citit o copie a bazei noastre de date.",
  "",
  "Scrieți-ne la privacy@dezbatere.ro."
].join("\n")));
const NOTICE: BreachNoticeMail = Object.freeze({
  to: "person@example.test", language: "ro", messageId: "22222222-2222-4222-8222-222222222222", ...rendered
});

function base64Parts(message: string): string[] {
  return [...message.matchAll(/Content-Transfer-Encoding: base64\r\n(?:[^\r\n]+\r\n)*\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)]
    .map((match) => Buffer.from(match[1]!.replaceAll("\r\n", ""), "base64").toString("utf8"));
}

describe("the breach notice sender", { concurrent: false }, () => {
  it("hands the mail program one message with the text, in the account's language", async () => {
    const root = temporary("debateai-breach-mail-");
    process.env[CAPTURE_DIR] = join(root, "mail");
    const sender = new BreachNoticeMailSender({ gate: testOutboundMailGate(), executable: CAPTURE, from: "noreply@localhost.test", timeoutMs: 10_000 });
    await expect(sender.sendBreachNotice(NOTICE)).resolves.toBe("SENT");
    const files = readdirSync(join(root, "mail")).filter((name) => name.endsWith(".eml"));
    expect(files).toHaveLength(1);
    const message = readFileSync(join(root, "mail", files[0]!), "utf8");
    expect(message).toContain("To: person@example.test\r\n");
    expect(message).toContain("Message-ID: <22222222-2222-4222-8222-222222222222@debateai.local>\r\n");
    expect(message).toMatch(/\r\nSubject: =\?UTF-8\?B\?/);
    expect(message).toContain("\r\nContent-Language: ro\r\n");
    const [text, html] = base64Parts(message);
    expect(text).toContain("Pe 3 mai cineva a citit o copie a bazei noastre de date.");
    expect(html).toContain("<p>Ce s-a întâmplat<br>Pe 3 mai cineva a citit o copie a bazei noastre de date.</p>");
  });

  it("passes only -i -t -f <from> on argv, never the recipient", async () => {
    const directory = temporary("debateai-breach-argv-");
    const executable = join(directory, "sendmail");
    const argumentsFile = join(directory, "argv.txt");
    writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argumentsFile}'\ncat >/dev/null\n`, { mode: 0o700 });
    chmodSync(executable, 0o700);
    await new BreachNoticeMailSender({ gate: testOutboundMailGate(), executable, from: "noreply@debateai.test", timeoutMs: 30_000 }).sendBreachNotice(NOTICE);
    expect(readFileSync(argumentsFile, "utf8").trim().split("\n")).toEqual(["-i", "-t", "-f", "noreply@debateai.test"]);
  });

  it("refuses a second recipient, a bad language, a bad id and a subject with a line break before any process starts", async () => {
    const sender = new BreachNoticeMailSender({ gate: testOutboundMailGate(), executable: "/definitely/not/a/sendmail-binary", from: "noreply@debateai.test", timeoutMs: 1_000 });
    for (const bad of [
      { ...NOTICE, to: "person@example.test,other@example.test" },
      { ...NOTICE, language: "en-US" },
      { ...NOTICE, messageId: "not-a-uuid" },
      { ...NOTICE, subject: "Notice\r\nBcc: other@example.test" },
      { ...NOTICE, text: "" }
    ]) {
      await expect(sender.sendBreachNotice(bad)).rejects.toEqual(expect.objectContaining<Partial<MailDeliveryError>>({ operatorCode: "MAIL_INPUT_INVALID" }));
    }
  });

  it("refuses to exist without the gate", () => {
    expect(() => new BreachNoticeMailSender({ executable: "/x", from: "noreply@dezbatere.ro", timeoutMs: 1000 } as never)).toThrow("OWN_MAIL_CONFIGURATION_INVALID");
    expect(() => new BreachNoticeMailSender({ executable: "/x", from: "noreply@dezbatere.ro", timeoutMs: 1000, gate: testOutboundMailGate() })).not.toThrow();
  });

  it("the memory sender renders exactly what the mail program would receive", async () => {
    const memory = new MemoryBreachNoticeMailSender();
    await expect(memory.sendBreachNotice(NOTICE)).resolves.toBe("SENT");
    expect(memory.messages[0]!.raw).toContain("Content-Language: ro\r\n");
    await expect(memory.sendBreachNotice({ ...NOTICE, language: "xx" })).rejects.toBeInstanceOf(MailDeliveryError);
  });
});

describe("a breach notice and the daily mail limit", { concurrent: false }, () => {
  function gateWith(dailyLimit: number): { gate: OutboundMailGate; store: MemoryOutboundMailStore; events: OutboundMailGateEvent[] } {
    const store = new MemoryOutboundMailStore();
    const events: OutboundMailGateEvent[] = [];
    const gate = new OutboundMailGate({
      policy: { dailyLimit, reservedForSecurityPct: 20, alertAtPct: 100 }, blindIndexKey: Buffer.alloc(32, 0x61), ledger: store, suppression: store,
      report: (event) => { events.push(event); }
    });
    return { gate, store, events };
  }
  const quiet = (): string => {
    const directory = temporary("debateai-breach-quiet-");
    const executable = join(directory, "sendmail");
    writeFileSync(executable, "#!/bin/sh\ncat >/dev/null\n", { mode: 0o700 });
    chmodSync(executable, 0o700);
    return executable;
  };

  it("is counted as security mail: it may use the whole of the day's limit, sign-up mail may not", () => {
    expect(mailPurposeClass("breach-notice")).toBe("security");
  });

  it("is counted once per mail, and refused with the limit's own code when the day is full", async () => {
    const { gate, store } = gateWith(2);
    const sender = new BreachNoticeMailSender({ gate, executable: quiet(), from: "noreply@debateai.test", timeoutMs: 10_000 });
    await sender.sendBreachNotice(NOTICE);
    await sender.sendBreachNotice({ ...NOTICE, to: "second@example.test" });
    expect(store.sum(store.day)).toBe(2);
    await expect(sender.sendBreachNotice({ ...NOTICE, to: "third@example.test" }))
      .rejects.toEqual(expect.objectContaining<Partial<MailDeliveryError>>({ operatorCode: "MAIL_DAILY_LIMIT" }));
    expect(store.sum(store.day)).toBe(2);
  });

  it("an address on the blocked list is skipped: nothing is started and nothing is counted", async () => {
    const { gate, store } = gateWith(10);
    store.suppress(createEmailBlindIndex(Buffer.alloc(32, 0x61), NOTICE.to));
    const sender = new BreachNoticeMailSender({ gate, executable: "/definitely/not/a/sendmail-binary", from: "noreply@debateai.test", timeoutMs: 1_000 });
    await expect(sender.sendBreachNotice(NOTICE)).resolves.toBe("SUPPRESSED");
    expect(store.sum(store.day)).toBe(0);
  });
});

describe("the hosted site's mail program (the mail plan and its allow-list lock)", () => {
  const FROM = "noreply@dezbatere.ro";
  const options = (recipientOf: unknown) => ({
    from: FROM, origin: "https://dezbatere.ro", renderPasswordResetMail, renderEmailRecoveryMail, buildTemplatedMessage,
    renderAccountMail: renderAccountMailMessage, recipientOf
  });
  const messageFor = async (to: string): Promise<Buffer> => {
    const memory = new MemoryBreachNoticeMailSender(FROM);
    await memory.sendBreachNotice({ ...NOTICE, to });
    return Buffer.from(memory.messages[0]!.raw, "utf8");
  };

  it("takes a breach notice to any account's address when mail is open", async () => {
    const message = await messageFor("stranger@example.com");
    const selected = hosted.selectSiteMail(message, options(hosted.openRecipient(isSingleDeliverableRecipient)));
    expect(selected).toMatchObject({ family: "templated", recipient: "stranger@example.com" });
    expect(selected.message.equals(message)).toBe(true);
  });

  it("refuses it under the allow-list lock for anyone who is not on the list", async () => {
    const locked = hosted.allowListRecipient(fixture.recipientPolicy);
    const message = await messageFor("stranger@example.com");
    expect(() => hosted.selectSiteMail(message, options(locked))).toThrow(/^PREVIEW_MAIL_REFUSED$/);
  });
});
