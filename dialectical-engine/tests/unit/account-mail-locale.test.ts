import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { copyOf } from "@debateai/mail-templates";
import {
  ACCOUNT_MAIL_LOCALES, renderAccountEmail, serializeAccountMail, type AccountMailInput
} from "../../apps/api/src/account-mail-template.mjs";
import {
  MemoryTemplatedMailSender, SendmailConsumerAccountSender, SendmailEmailChangeMailSender, SendmailMailSender,
  SendmailRecoveryEmailMailSender, SendmailSecurityNotificationSender
} from "../../apps/api/src/mail-channel.js";
import { buildTemplatedMessage } from "../../apps/api/src/mail-mime.js";
import { encrypt } from "@debateai/crypto";
import { ConsumerRecoveryService } from "../../apps/api/src/consumer-recovery.js";
import { EmailChangeService } from "../../apps/api/src/email-change.js";
import { RecoveryEmailService } from "../../apps/api/src/recovery-email.js";
import { mailAlternatives } from "../support/accountMail.js";

// C16 (V-24): a non-ASCII Subject is RFC 2047 B-encoded and a non-ASCII body is base64. The helpers assert the encoded
// form is on the wire, then return the text the pins compare against.
const encodedSubject = (message: string): string => {
  expect(message).toMatch(/\r\nSubject: =\?UTF-8\?B\?/);
  const header = /\r\nSubject: ([^\r]*)\r\n/.exec(message)?.[1] ?? "";
  return Buffer.concat([...header.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)].map(word => Buffer.from(word[1]!, "base64"))).toString("utf8");
};

const catalogue = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(resolve(`packages/mail-templates/messages/${locale}/mail.json`), "utf8")) as Record<string, string>;
const ro = catalogue("ro");
const en = catalogue("en");
const subject = "auth.acc.verification-v1.subject";
const recipient = "person@example.test";
const expiresAt = new Date("2026-10-12T14:30:00Z");
const url = new URL(`https://dezbatere.ro/verify-email#token=${"a".repeat(43)}`);
// The caller's copy for one display locale; an absent display is English (D4, V-8).
const copyFor = (locale: string) => (key: string): string => copyOf(locale, key);
const verification = (locale?: string, timeZone: string | null = null): AccountMailInput => ({
  template: "verification-v1", recipient, expiresAt, url,
  ...(locale === undefined ? {} : { display: { locale, timeZone } }),
  copy: copyFor(locale ?? "en")
} as AccountMailInput);

describe("C12.1 copyOf: the account copy of one locale, with the English fallback", () => {
  it("returns the locale's own value for a present key, not the English one", () => {
    expect(copyOf("ro", subject)).toBe(ro[subject]);
    expect(copyOf("ro", subject)).not.toBe(en[subject]);
  });

  it("returns the English value for an unknown locale", () => {
    expect(copyOf("zz", subject)).toBe(en[subject]);
  });

  it("maps en-US and en-GB to the English catalogue", () => {
    expect(copyOf("en-US", subject)).toBe(en[subject]);
    expect(copyOf("en-GB", subject)).toBe(en[subject]);
  });
});

describe("C12.2 account renderer: copy, lang, dir, Content-Language (R-07, R-30, R-31, D4)", () => {
  it("takes the subject and paragraphs from the display locale's copy, not from English literals", () => {
    const mail = renderAccountEmail(verification("ro", "Europe/Bucharest"));
    expect(mail.subject).toBe(ro[subject]);
    expect(mail.text).toContain(ro["auth.acc.verification-v1.p1"]!.replace("{recipient}", recipient));
    expect(mail.text).not.toContain("Verify your email for Dialectical Engine");
  });

  it("renders Arabic copy with no English sentence in the plain or the HTML part", () => {
    const mail = renderAccountEmail(verification("ar", "Asia/Riyadh"));
    expect(mail.subject).toBe(copyOf("ar", subject));
    expect(mail.text).not.toMatch(/Verify your email|This verification link|If you did not create/u);
    expect(mail.html).not.toMatch(/Verify your email|This verification link|If you did not create/u);
  });

  it.each([
    ["ro", 'lang="ro" dir="ltr"'],
    ["ar", 'lang="ar" dir="rtl"'],
    ["he", 'lang="he" dir="rtl"'],
    ["en-GB", 'lang="en" dir="ltr"'],
    ["en-US", 'lang="en" dir="ltr"']
  ])("sets the HTML part's lang and dir for %s (R-30)", (locale, attributes) => {
    expect(renderAccountEmail(verification(locale)).html).toContain(`<html ${attributes}>`);
  });

  it.each([["ro", "ro"], ["ar", "ar"], ["en-GB", "en"], ["en-US", "en"]])(
    "sends Content-Language for %s as %s in the header block, before MIME-Version (R-31)", (locale, language) => {
      const message = serializeAccountMail(verification(locale), "noreply@dezbatere.ro");
      expect(message).toContain(`Content-Language: ${language}\r\n`);
      expect(message.indexOf("Content-Language:")).toBeLessThan(message.indexOf("MIME-Version:"));
      expect(message).toContain(`X-Account-Locale: ${locale}\r\n`);
    });

  it("renders an absent display as English (D4, V-8)", () => {
    const mail = renderAccountEmail(verification());
    expect(mail.subject).toBe(en[subject]);
    expect(mail.html).toContain('<html lang="en" dir="ltr">');
    expect(serializeAccountMail(verification(), "noreply@dezbatere.ro")).toContain("Content-Language: en\r\n");
  });

  it("refuses a call with no copy function", () => {
    const { copy: _copy, ...withoutCopy } = verification("ro");
    expect(() => renderAccountEmail(withoutCopy as AccountMailInput)).toThrow("MAIL_INPUT_INVALID");
  });
});

describe("C12.8 dates per entry (R-32, D-82): en-GB, en-US and ro format the expiry differently", () => {
  it.each([
    ["en-GB", "12 October 2026 at 14:30 GMT+0 (UTC)"],
    ["en-US", "October 12, 2026 at 14:30 GMT+0 (UTC)"],
    ["ro", "12 octombrie 2026 la 14:30 GMT+0 (UTC)"]
  ])("formats the expiry for %s as %s", (locale, expiry) => {
    expect(renderAccountEmail(verification(locale)).text).toContain(expiry);
  });
});

describe("C12.9 plain text carries no bidi control (R-33)", () => {
  it("has no U+202A-U+202E or U+2066-U+2069 in the text part of any of the 37 display values", () => {
    expect(ACCOUNT_MAIL_LOCALES).toHaveLength(37);
    for (const locale of ACCOUNT_MAIL_LOCALES) {
      const mail = renderAccountEmail({
        template: "security-recovery-code-used-v1", recipient, expiresAt,
        display: { locale, timeZone: "Europe/Bucharest" }, copy: copyFor(locale)
      } as AccountMailInput);
      expect(mail.text, locale).not.toMatch(/[‪-‮⁦-⁩]/u);
    }
  });
});

// C12.4 / C12.5 / C12.6: every account sender sends the display locale's copy, with lang and Content-Language, through the
// real `sendmail -t` path; the dev sink (deploy/dev-auth/sendmail-capture.mjs) keeps each message as one .eml file.
const capture = fileURLToPath(new URL("../../deploy/dev-auth/sendmail-capture.mjs", import.meta.url));
const sendOptions = { executable: capture, from: "noreply@debate.test", publicAppUrl: "https://debate.test", timeoutMs: 10_000 };
const token = "A".repeat(21) + "_" + "b".repeat(20) + "-";
const person = "person@example.test";
const messageId = "11111111-1111-4111-8111-111111111111";
const roDisplay = { locale: "ro", timeZone: null };
let directory: string;
let previous: string | undefined;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "c12-account-mail-"));
  previous = process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR;
  process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = directory;
});

afterEach(async () => {
  if (previous === undefined) delete process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR;
  else process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = previous;
  await rm(directory, { recursive: true, force: true });
});

async function sentMail(): Promise<string> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".eml"));
  expect(names).toHaveLength(1);
  return readFile(join(directory, names[0]!), "utf8");
}

describe("C12.4 / C12.6 senders: the display locale's copy, lang and Content-Language on every ACC family (R-15, R-30, R-31)", () => {
  it("sends verification-v1 in the display locale", async () => {
    await new SendmailMailSender(sendOptions).sendVerification({ attemptId: "opaque", recipient: person, token, expiresAt, display: roDisplay });
    const message = await sentMail();
    expect(encodedSubject(message)).toBe(ro["auth.acc.verification-v1.subject"]);
    expect(message).toContain("Content-Language: ro\r\n");
    expect(mailAlternatives(message).html).toContain('<html lang="ro" dir="ltr">');
  });

  it("sends an absent display in English (D4, V-8)", async () => {
    await new SendmailMailSender(sendOptions).sendVerification({ attemptId: "opaque", recipient: person, token, expiresAt });
    const message = await sentMail();
    expect(message).toContain(`Subject: ${en["auth.acc.verification-v1.subject"]}\r\n`);
    expect(message).toContain("Content-Language: en\r\n");
  });

  it("sends the security-scheduled-v1 erasure notice in the display locale", async () => {
    await new SendmailSecurityNotificationSender(sendOptions).sendSecurityNotification({
      messageId, recipient: person, eventKind: "SCHEDULED", executeAt: expiresAt, display: roDisplay
    });
    expect(encodedSubject(await sentMail())).toBe(ro["auth.acc.security-scheduled-v1.subject"]);
  });

  it("sends the email-change confirmation and address-unavailable mails in the display locale", async () => {
    await new SendmailEmailChangeMailSender(sendOptions).sendEmailChange({ kind: "confirmation", recipient: person, token, expiresAt, display: roDisplay });
    expect(encodedSubject(await sentMail())).toBe(ro["auth.acc.email-change-confirm-v1.subject"]);
    await rm(directory, { recursive: true, force: true });
    directory = await mkdtemp(join(tmpdir(), "c12-account-mail-"));
    process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = directory;
    await new SendmailEmailChangeMailSender(sendOptions).sendEmailChange({ kind: "address-unavailable", recipient: person, display: roDisplay });
    expect(await sentMail()).toContain(`Subject: ${ro["auth.acc.email-change-unavailable-v1.subject"]}\r\n`);
  });

  it("sends the recovery-v1 confirmation in the display locale", async () => {
    await new SendmailRecoveryEmailMailSender(sendOptions).sendRecoveryEmail({ kind: "confirmation", recipient: person, token, expiresAt, display: roDisplay });
    expect(encodedSubject(await sentMail())).toBe(ro["auth.acc.recovery-v1.subject"]);
  });

  it("sends the consumer-recovery-v1 proof and the security-recovery-code-used-v1 notice in the display locale", async () => {
    const consumer = new SendmailConsumerAccountSender({ ...sendOptions, publicAppUrl: "https://debate.test" });
    await consumer.sendRecovery({ recipient: person, token, expiresAt, display: roDisplay });
    expect(encodedSubject(await sentMail())).toBe(ro["auth.acc.consumer-recovery-v1.subject"]);
    await rm(directory, { recursive: true, force: true });
    directory = await mkdtemp(join(tmpdir(), "c12-account-mail-"));
    process.env.DEBATEAI_DEV_MAIL_CAPTURE_DIR = directory;
    await consumer.sendConsumerSecurityNotice({ recipient: person, messageId, eventKind: "RECOVERY_CODE_USED", happenedAt: expiresAt, display: roDisplay });
    expect(await sentMail()).toContain(`Subject: ${ro["auth.acc.security-recovery-code-used-v1.subject"]}\r\n`);
  });
});

describe("C12.5 CAT messages carry Content-Language (R-31)", () => {
  it("writes Content-Language: ro in the header block of a ro CAT message, and the Romanian copy", async () => {
    const sender = new MemoryTemplatedMailSender();
    await sender.sendTemplated({
      to: person, templateId: "M1", locale: "ro",
      params: {
        plan: "PLUS", totalAmount: "24.20", renewDate: "2026-10-29", cancelPageUrl: "https://dezbatere.ro/cancel",
        withdrawalDays: "14", termsUrl: "https://dezbatere.ro/terms"
      },
      messageId: "22222222-2222-4222-8222-222222222222"
    });
    const raw = sender.messages[0]!.raw;
    expect(raw).toContain("Content-Language: ro\r\n");
    expect(raw.indexOf("Content-Language:")).toBeLessThan(raw.indexOf("MIME-Version:"));
  });

  it("writes no Content-Language header when the caller gives no language", () => {
    const message = buildTemplatedMessage({
      from: "noreply@debate.test", to: person, messageId: null, subject: "S", text: "t", html: "<p>h</p>", attachments: [], boundary: "abcdefghijklmnop"
    });
    expect(message).not.toContain("Content-Language:");
  });
});

// C12.6 (R-15): each service hands the request's mail language (source.mailLocale) to its sender, and the detached
// consumer-recovery work keeps it until the send. The repositories are stubs; the DEK and the envelopes are real.
const userId = "user:c12-services";
const dek = randomBytes(32);
const userAad = (field: "user.email_ciphertext" | "user.recovery_email_ciphertext") =>
  ["identity", field, userId, "run:none", userId, `user-dek:${userId}`, "1"] as const;
const sealed = (plain: string, field: "user.email_ciphertext" | "user.recovery_email_ciphertext" = "user.email_ciphertext") =>
  encrypt(dek, Buffer.from(plain, "utf8"), userAad(field));
const users = { load: async () => Buffer.from(dek), exists: async () => true };
const session = { userId, sessionId: "session:c12-services" };
const requestSource = (mailLocale?: string) => ({
  ip: "203.0.113.7", userAgent: "c12-services", requestId: "request:c12-services", ...(mailLocale === undefined ? {} : { mailLocale })
}) as never;
const grantToken = "g".repeat(43);
const serviceExpiresAt = new Date("2026-10-13T09:00:00.000Z");

describe("C12.6 services: the request's mail language reaches each account sender (R-15)", () => {
  it("sends the email-change confirmation and the notice in the request's language", async () => {
    const mail = new (await import("../../apps/api/src/mail-channel.js")).MemoryEmailChangeMailSender();
    const service = new EmailChangeService({
      repository: { requestBounded: async () => ({ status: "PENDING", currentEmailCiphertext: sealed("current@example.test"), serviceExpiresAt, addressAvailable: true }) } as never,
      users: users as never, blindIndexKey: randomBytes(32), mail, tokenFactory: () => "t".repeat(43)
    });
    await service.request(session as never, { newEmail: "new@example.test", grantToken }, requestSource("ro"));
    expect(mail.messages.map((message) => [message.kind, message.display])).toEqual([
      ["confirmation", { locale: "ro", timeZone: null }], ["notice", { locale: "ro", timeZone: null }]
    ]);
  });

  it("sends the address-unavailable note in the request's language", async () => {
    const mail = new (await import("../../apps/api/src/mail-channel.js")).MemoryEmailChangeMailSender();
    const service = new EmailChangeService({
      repository: { requestBounded: async () => ({ status: "PENDING", currentEmailCiphertext: sealed("current@example.test"), serviceExpiresAt, addressAvailable: false }) } as never,
      users: users as never, blindIndexKey: randomBytes(32), mail, tokenFactory: () => "t".repeat(43)
    });
    await service.request(session as never, { newEmail: "taken@example.test", grantToken }, requestSource("ro"));
    expect(mail.messages[0]).toMatchObject({ kind: "address-unavailable", display: { locale: "ro", timeZone: null } });
  });

  it("sends the resent confirmation in the request's language", async () => {
    const mail = new (await import("../../apps/api/src/mail-channel.js")).MemoryEmailChangeMailSender();
    const service = new EmailChangeService({
      repository: { resendBounded: async () => ({ status: "RESENT", newEmailCiphertext: sealed("new@example.test"), serviceExpiresAt, addressAvailable: true }) } as never,
      users: users as never, blindIndexKey: randomBytes(32), mail, tokenFactory: () => "t".repeat(43)
    });
    await service.resend(session as never, requestSource("ro"));
    expect(mail.messages).toMatchObject([{ kind: "confirmation", display: { locale: "ro", timeZone: null } }]);
  });

  it("sends an email change with no request language in English (D4)", async () => {
    const mail = new (await import("../../apps/api/src/mail-channel.js")).MemoryEmailChangeMailSender();
    const service = new EmailChangeService({
      repository: { requestBounded: async () => ({ status: "PENDING", currentEmailCiphertext: sealed("current@example.test"), serviceExpiresAt, addressAvailable: true }) } as never,
      users: users as never, blindIndexKey: randomBytes(32), mail, tokenFactory: () => "t".repeat(43)
    });
    await service.request(session as never, { newEmail: "new@example.test", grantToken }, requestSource());
    expect(mail.messages[0]).toMatchObject({ kind: "confirmation", display: { locale: "en", timeZone: null } });
  });

  it("sends the recovery-v1 confirmation in the request's language", async () => {
    const sent: unknown[] = [];
    const service = new RecoveryEmailService({
      repository: { request: async () => "PENDING", read: async () => ({ ciphertext: null, pending: null }) } as never,
      users: users as never, blindIndexKey: randomBytes(32), mail: { sendRecoveryEmail: async (message: unknown) => { sent.push(message); } },
      tokenFactory: () => "t".repeat(43), now: () => new Date("2026-10-12T09:00:00.000Z")
    });
    await service.requestRecoveryEmail(session as never, { email: "recovery@example.test", grantToken }, requestSource("ro"));
    expect(sent).toMatchObject([{ kind: "confirmation", recipient: "recovery@example.test", display: { locale: "ro", timeZone: null } }]);
  });

  it("keeps the request's language through the detached consumer-recovery send", async () => {
    const sent: unknown[] = [];
    const service = Object.create(ConsumerRecoveryService.prototype) as Record<string, unknown>;
    Object.assign(service, {
      repository: {
        start: async () => ({ userId }),
        withDeliveryLease: async (_userId: string, _hash: string, operation: (record: unknown) => Promise<void>) =>
          operation({ userId, channelType: "email", addressCiphertext: sealed("consumer@example.test"), serviceExpiresAt: serviceExpiresAt.toISOString() })
      },
      d: {
        users, blindIndexKey: randomBytes(32), mail: { sendRecovery: async (message: unknown) => { sent.push(message); } },
        onMailFailure: () => { throw new Error("MAIL_FAILED"); }
      }
    });
    const work = await (service as unknown as ConsumerRecoveryService).prepareStart({ email: "consumer@example.test" }, requestSource("ro"));
    await work!();
    expect(sent).toMatchObject([{ recipient: "consumer@example.test", display: { locale: "ro", timeZone: null } }]);
  });
});
