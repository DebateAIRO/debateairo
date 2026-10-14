// S01-C10 (R-13, R-22, R-23, R-31; D-63): the email-recovery family renders in the language stored on its row.
// The copy is the catalogue of that language (copyOf); the English pins in email-mfa-wait-mail.test.ts stay as they are.
import { describe, expect, it, vi } from "vitest";
import { copyOf } from "@debateai/mail-templates";
import { encrypt } from "@debateai/crypto";
import { AUTH_POLICY_REGISTER_ROWS, authPolicyFromRegisterRows } from "@debateai/register";
import { EmailRecoveryNotificationWorker, renderEmailRecoveryMail, type EmailRecoveryMail } from "../../apps/api/src/email-mfa-mail.js";
import { emailRecoveryNoticeAad } from "../../apps/api/src/email-mfa-recovery.js";

// C16 (V-24): a non-ASCII Subject is RFC 2047 B-encoded and a non-ASCII body is base64. The helpers assert the encoded
// form is on the wire, then return the text the pins compare against.
const encodedSubject = (message: string): string => {
  expect(message).toMatch(/\r\nSubject: =\?UTF-8\?B\?/);
  const header = /\r\nSubject: ([^\r]*)\r\n/.exec(message)?.[1] ?? "";
  return Buffer.concat([...header.matchAll(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g)].map(word => Buffer.from(word[1]!, "base64"))).toString("utf8");
};
const decodedBody = (message: string): string => {
  const split = message.indexOf("\r\n\r\n");
  expect(message.slice(0, split).split("\r\n")).toContain("Content-Transfer-Encoding: base64");
  // The blank line that ends the header block stays in front, so the pins read the sentences as they sit on the wire.
  return "\r\n" + Buffer.from(message.slice(split + 4).replace(/\r\n/g, ""), "base64").toString("utf8");
};

const options = { from: "noreply@example.test", publicAppUrl: "https://app.example.test" };
const CANCEL = "C".repeat(43), FINISH = "F".repeat(43), TOKEN = "T".repeat(43);
const NOT_BEFORE = new Date("2026-10-10T12:00:00.000Z"), EXPIRES = new Date("2026-10-17T12:00:00.000Z");
const base = { flow: "mfa_recovery", messageId: "11111111-1111-4111-8111-111111111111", recipient: "main@example.test", expiresAt: EXPIRES } as const;
// The body is one sentence per line: a sentence counts only as a whole line, never as a part of a longer one.
const lines = (text: string) => text.split("\r\n");
const render = (mail: Record<string, unknown>) => renderEmailRecoveryMail(mail as EmailRecoveryMail, options);

// The expected sentence of a locale, read from the catalogue with its placeholders filled the way the renderer fills them.
const copy = (locale: string, key: string, values: Record<string, string> = {}) =>
  Object.entries(values).reduce((text, [name, value]) => text.replace(`{${name}}`, value), copyOf(locale, key));

describe("the copy is the catalogue of the stored language", () => {
  it.each(["ro", "ar"])("the test's own expectations differ from English in %s (no vacuous pass)", locale => {
    expect(copy(locale, "auth.emr.mfa.proof.p7")).not.toBe(copy("en", "auth.emr.mfa.proof.p7"));
    expect(copy(locale, "auth.emr.mfa.waiting.p2", { notBefore: NOT_BEFORE.toISOString() })).not.toBe(copy("en", "auth.emr.mfa.waiting.p2", { notBefore: NOT_BEFORE.toISOString() }));
  });

  it("renders the authenticator PROOF in ro: subject, body sentences, both links and its cancel branch", () => {
    const text = render({ ...base, mailLocale: "ro", event: "PROOF", token: TOKEN, cancelToken: CANCEL });
    expect(encodedSubject(text)).toBe(copy("ro", "auth.emr.mfa.proof.subject"));
    expect(lines(decodedBody(text))).toContain(copy("ro", "auth.emr.mfa.proof.p1"));
    expect(lines(decodedBody(text))).toContain(copy("ro", "auth.emr.mfa.proof.p4"));
    expect(lines(decodedBody(text))).toContain(copy("ro", "auth.emr.mfa.proof.p3", { expiry: EXPIRES.toISOString() }));
    expect(lines(decodedBody(text))).toContain(`https://app.example.test/recover-authenticator#token=${TOKEN}`);
    expect(lines(decodedBody(text))).toContain(copy("ro", "auth.emr.mfa.proof.p7"));
    expect(lines(decodedBody(text))).toContain(`https://app.example.test/recover-authenticator#cancel=${CANCEL}`);
    expect(lines(decodedBody(text))).toContain(copy("ro", "auth.emr.mfa.proof.p8"));
    expect(decodedBody(text)).not.toContain("Recover your Dialectical Engine authenticator");
  });

  it("renders the STARTED mail in ro with the cancel sentences of the PROOF and WAITING copy", () => {
    const text = render({ ...base, mailLocale: "ro", event: "STARTED", cancelToken: CANCEL });
    expect(encodedSubject(text)).toBe(copy("ro", "auth.emr.mfa.started.subject"));
    expect(lines(decodedBody(text))).toContain(copy("ro", "auth.emr.mfa.started.statement"));
    expect(lines(decodedBody(text))).toContain(copy("ro", "auth.emr.mfa.proof.p7"));
    expect(lines(decodedBody(text))).toContain(copy("ro", "auth.emr.mfa.waiting.p5"));
    expect(decodedBody(text)).toContain(`#cancel=${CANCEL}\r\n`);
  });

  it("renders the WAITING notice in ar with its wait time filled into the sentence and its cancel link", () => {
    const text = render({ ...base, mailLocale: "ar", event: "WAITING", notBefore: NOT_BEFORE, cancelToken: CANCEL });
    expect(encodedSubject(text)).toBe(copy("ar", "auth.emr.mfa.waiting.subject"));
    expect(lines(decodedBody(text))).toContain(copy("ar", "auth.emr.mfa.waiting.p2", { notBefore: NOT_BEFORE.toISOString() }));
    expect(lines(decodedBody(text))).toContain(copy("ar", "auth.emr.mfa.waiting.p6"));
    expect(decodedBody(text)).toContain(`#cancel=${CANCEL}\r\n`);
    expect(decodedBody(text)).not.toContain("{notBefore}");
  });

  it("renders the backup-email PROOF in ro, and the VERIFIED mail in ro", () => {
    const proof = render({ ...base, flow: "backup_email", mailLocale: "ro", event: "PROOF", token: TOKEN });
    expect(encodedSubject(proof)).toBe(copy("ro", "auth.emr.backup.proof.subject"));
    expect(lines(decodedBody(proof))).toContain(copy("ro", "auth.emr.backup.proof.p3", { expiry: EXPIRES.toISOString() }));
    expect(decodedBody(proof)).toContain(`https://app.example.test/verify-backup-email#token=${TOKEN}\r\n`);
    const verified = render({ ...base, flow: "backup_email", mailLocale: "ro", event: "VERIFIED" });
    expect(encodedSubject(verified)).toBe(copy("ro", "auth.emr.backup.verified.subject"));
    expect(lines(decodedBody(verified))).toContain(copy("ro", "auth.emr.backup.verified.p2"));
  });

  it("renders the finish link in ro with its expiry", () => {
    const text = render({ ...base, mailLocale: "ro", event: "FINISH", finishToken: FINISH });
    expect(encodedSubject(text)).toBe(copy("ro", "auth.emr.mfa.finish.subject"));
    expect(lines(decodedBody(text))).toContain(copy("ro", "auth.emr.mfa.finish.p4"));
    expect(lines(decodedBody(text))).toContain(copy("ro", "auth.emr.mfa.finish.p3", { expiry: EXPIRES.toISOString() }));
  });

  it.each([["ro", "ro"], ["ar", "ar"], ["en-GB", "en"]])("states Content-Language for %s as %s in the header block", (locale, cc) => {
    const text = render({ ...base, mailLocale: locale, event: "COMPLETED" });
    expect(text).toContain(`\r\nContent-Language: ${cc}\r\n`);
  });

  it("gives en-GB the English catalogue (the same sentences as en)", () => {
    const british = render({ ...base, mailLocale: "en-GB", event: "CANCELLED" });
    const english = render({ ...base, mailLocale: "en", event: "CANCELLED" });
    expect(british.replace(/Message-ID: .*\r\n/, "")).toBe(english.replace(/Message-ID: .*\r\n/, ""));
  });

  it("refuses a mail language outside the 37 values", () => {
    expect(() => render({ ...base, mailLocale: "xx", event: "COMPLETED" })).toThrow("EMAIL_RECOVERY_MAIL_INPUT_INVALID");
  });
});

describe("the notice worker sends each row in the language its claim carries", () => {
  const USER = "22222222-2222-4222-8222-222222222222", CHANNEL = "33333333-3333-4333-8333-333333333333", KEY = Buffer.alloc(32, 9);
  async function deliver(mailLocale: string | undefined, event: "PROOF" | "STARTED", payload: Record<string, unknown>) {
    const sent: EmailRecoveryMail[] = [];
    const notice = { noticeId: base.messageId, leaseId: "44444444-4444-4444-8444-444444444444", userId: USER, channelId: CHANNEL, event, payload: encrypt(KEY, Buffer.from(JSON.stringify(payload)), emailRecoveryNoticeAad("mfa_recovery", USER, CHANNEL)), expiresAt: EXPIRES.toISOString(), cancelAllowed: true, ...(mailLocale === undefined ? {} : { mailLocale }) };
    let claimed = false;
    const repository = { expire: vi.fn(async () => 0), claimNotice: vi.fn(async () => { if (claimed) return null; claimed = true; return notice as never; }), finishNotice: vi.fn(async () => true) };
    const worker = new EmailRecoveryNotificationWorker({ flow: "mfa_recovery", repository, users: { load: async () => Buffer.from(KEY) } as never, sender: { send: async mail => { sent.push(mail); } }, authPolicy: authPolicyFromRegisterRows(AUTH_POLICY_REGISTER_ROWS), reportDiagnostic: () => {}, dispatch: async prepare => { await (await prepare())?.(); } });
    await worker.reconcile(5);
    return sent;
  }
  it("hands the claimed language to the mail of a PROOF row stored in ro", async () => {
    const sent = await deliver("ro", "PROOF", { recipient: "main@example.test", token: TOKEN, cancelToken: CANCEL });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ event: "PROOF", mailLocale: "ro" });
    expect(decodedBody(render({ ...sent[0]! } as never))).toContain(copy("ro", "auth.emr.mfa.proof.p1"));
  });
  it("sends a row without a stored language as English (the pinned default of the renderer)", async () => {
    const sent = await deliver(undefined, "STARTED", { recipient: "main@example.test", cancelToken: CANCEL });
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toHaveProperty("mailLocale");
    expect(render({ ...sent[0]! } as never)).toContain("Dialectical Engine authenticator recovery started");
  });
});
