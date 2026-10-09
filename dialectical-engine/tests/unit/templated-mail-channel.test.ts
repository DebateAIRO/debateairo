import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MAIL_TEMPLATE_IDS, type MailTemplateId } from "@debateai/mail-templates";
import type { BillingMail, BillingMailPort, BillingMailTemplateId } from "../../apps/api/src/billing/email-job.js";
import {
  MailDeliveryError,
  MemoryTemplatedMailSender,
  TemplatedMailSender,
  type TemplatedMail
} from "../../apps/api/src/mail-channel.js";

// P7 declared its port before this package existed; these lines stop compiling the day the two drift apart.
type SameIds = [BillingMailTemplateId] extends [MailTemplateId]
  ? ([MailTemplateId] extends [BillingMailTemplateId] ? true : false) : false;
const SAME_IDS: SameIds = true;

const CAPTURE = resolve("deploy/dev-auth/sendmail-capture.mjs");
const CAPTURE_DIR = "DEBATEAI_DEV_MAIL_CAPTURE_DIR";
const original = process.env[CAPTURE_DIR];
afterEach(() => {
  if (original === undefined) delete process.env[CAPTURE_DIR];
  else process.env[CAPTURE_DIR] = original;
});

const M1: TemplatedMail = Object.freeze({
  to: "person@example.test",
  templateId: "M1",
  locale: "en",
  params: {
    plan: "PLUS", totalAmount: "24.20", renewDate: "2026-10-29", cancelPageUrl: "https://dezbatere.ro/cancel",
    withdrawalDays: "14", termsUrl: "https://dezbatere.ro/terms"
  },
  attachments: [
    { filename: "terms-of-service.txt", contentType: "text/plain; charset=UTF-8" as const, content: Buffer.from("# Terms\n", "utf8") },
    { filename: "withdrawal-form.txt", contentType: "text/plain; charset=UTF-8" as const, content: Buffer.from("Form\n", "utf8") }
  ],
  messageId: "22222222-2222-4222-8222-222222222222"
});

function base64Parts(message: string): string[] {
  return [...message.matchAll(/Content-Transfer-Encoding: base64\r\n(?:[^\r\n]+\r\n)*\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)]
    .map((match) => Buffer.from(match[1]!.replaceAll("\r\n", ""), "base64").toString("utf8"));
}

describe("P17 TemplatedMailSender over the dev sendmail capture", { concurrent: false }, () => {
  it("delivers text, html and both attachments in one captured message", async () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-templated-mail-"));
    process.env[CAPTURE_DIR] = join(root, "mail");
    try {
      await new TemplatedMailSender({ executable: CAPTURE, from: "noreply@localhost.test", timeoutMs: 10_000 })
        .sendTemplated(M1);
      const files = readdirSync(join(root, "mail")).filter((name) => name.endsWith(".eml"));
      expect(files).toHaveLength(1);
      const message = readFileSync(join(root, "mail", files[0]!), "utf8");
      expect(message).toContain("To: person@example.test\r\n");
      expect(message).toContain("Subject: Your Plus plan is active\r\n");
      const [text, html, terms, form] = base64Parts(message);
      expect(text).toContain("You pay $24.20 a month, tax included.");
      expect(text).toContain("The Terms you accepted are attached.");
      expect(html).toContain('<a href="https://dezbatere.ro/cancel">');
      expect(terms).toBe("# Terms\n");
      expect(form).toBe("Form\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("words the Terms sentence from the attachments the message really carries", async () => {
    const memory = new MemoryTemplatedMailSender();
    await memory.sendTemplated({ ...M1, attachments: M1.attachments!.filter((file) => file.filename !== "terms-of-service.txt") });
    const [text] = base64Parts(memory.messages[0]!.raw);
    expect(text).toContain("Our current Terms are online at https://dezbatere.ro/terms");
    expect(text).not.toContain("The Terms you accepted are attached.");
  });

  it("encodes a non-ASCII subject so the capture's header checks still pass", async () => {
    const root = mkdtempSync(join(tmpdir(), "debateai-templated-mail-uk-"));
    process.env[CAPTURE_DIR] = join(root, "mail");
    try {
      await new TemplatedMailSender({ executable: CAPTURE, from: "noreply@localhost.test", timeoutMs: 10_000 })
        .sendTemplated({ ...M1, locale: "uk" });
      const [file] = readdirSync(join(root, "mail")).filter((name) => name.endsWith(".eml"));
      expect(readFileSync(join(root, "mail", file!), "utf8")).toMatch(/\r\nSubject: =\?UTF-8\?B\?/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes only -i -t -f <from> on argv, never the recipient", async () => {
    const directory = mkdtempSync(join(tmpdir(), "debateai-templated-argv-"));
    const executable = join(directory, "sendmail");
    const argumentsFile = join(directory, "argv.txt");
    writeFileSync(executable, `#!/bin/sh\nprintf '%s\\n' "$@" > '${argumentsFile}'\ncat >/dev/null\n`, { mode: 0o700 });
    chmodSync(executable, 0o700);
    try {
      await new TemplatedMailSender({ executable, from: "noreply@debateai.test", timeoutMs: 30_000 }).sendTemplated(M1);
      expect(readFileSync(argumentsFile, "utf8").trim().split("\n")).toEqual(["-i", "-t", "-f", "noreply@debateai.test"]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("refuses a fan-out recipient and a bad template before any process starts", async () => {
    const sender = new TemplatedMailSender({
      executable: "/definitely/not/a/sendmail-binary", from: "noreply@debateai.test", timeoutMs: 1_000
    });
    await expect(sender.sendTemplated({ ...M1, to: "person@example.test,attacker@example.test" }))
      .rejects.toEqual(expect.objectContaining<Partial<MailDeliveryError>>({ operatorCode: "MAIL_INPUT_INVALID" }));
    await expect(sender.sendTemplated({ ...M1, params: { ...M1.params, plan: "GOLD" } }))
      .rejects.toEqual(expect.objectContaining<Partial<MailDeliveryError>>({ operatorCode: "MAIL_TEMPLATE_PARAM_INVALID" }));
    await expect(sender.sendTemplated({ ...M1, messageId: "not-a-uuid" }))
      .rejects.toEqual(expect.objectContaining<Partial<MailDeliveryError>>({ operatorCode: "MAIL_INPUT_INVALID" }));
  });

  it("the memory sender renders exactly what sendmail would receive", async () => {
    const memory = new MemoryTemplatedMailSender();
    await memory.sendTemplated(M1);
    expect(memory.messages).toHaveLength(1);
    expect(memory.messages[0]!.raw).toContain("Subject: Your Plus plan is active\r\n");
    await expect(memory.sendTemplated({ ...M1, params: {} })).rejects.toBeInstanceOf(MailDeliveryError);
  });

  it("both senders are P7's BillingMailPort, and the EMAIL job's message goes through unchanged", async () => {
    expect(SAME_IDS).toBe(true);
    // R-8's sixteen, ruling Q-5's owner template O2, W9's M8_RECEIVED and O2_WITHDRAWAL (P2-I11), and W12's O3 (P2-I16), N9's O4,
    // N14's O2_REFUND_DUE and O2_REFUND_REMINDER, and N17's M12 (ruling PR-17).
    expect(MAIL_TEMPLATE_IDS).toHaveLength(24);
    const memory = new MemoryTemplatedMailSender();
    const ports: BillingMailPort[] = [
      memory,
      new TemplatedMailSender({ executable: CAPTURE, from: "noreply@localhost.test", timeoutMs: 10_000 })
    ];
    const job: BillingMail = Object.freeze({
      messageId: "33333333-3333-4333-8333-333333333333", to: "person@example.test", templateId: "M10",
      locale: "ro", params: Object.freeze({ plan: "PRO" }), attachments: Object.freeze([])
    });
    await ports[0]!.sendTemplated(job);
    expect(memory.messages[0]!.raw).toContain("Message-ID: <33333333-3333-4333-8333-333333333333@debateai.local>");
    expect(ports).toHaveLength(2);
  });
});
