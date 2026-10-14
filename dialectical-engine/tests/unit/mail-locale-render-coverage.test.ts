import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { copyOf } from "@debateai/mail-templates";
import {
  ACCOUNT_MAIL_TEMPLATES, renderAccountEmail, type AccountMailInput, type AccountMailTemplate
} from "../../apps/api/src/account-mail-template.mjs";
import { renderEmailRecoveryMail, type EmailRecoveryMail } from "../../apps/api/src/email-mfa-mail.js";
import { renderPasswordResetMail, type PasswordResetMail } from "../../apps/api/src/password-reset-mail.js";

/**
 * S01 render level (SPEC-v4 R-28 and B8, D-79; Appendix B A-2). Every R-25 mail is rendered by its own renderer
 * (account-mail-template.mjs, password-reset-mail.ts, email-mfa-mail.ts) for each of the 35 catalogue codes, and is
 * read the way a reader sees it: the subject, the plain body and the HTML text with its tags and entities removed.
 * Per code other than en, no English member of the 115 auth.* copy keys may appear in the output. A member is an
 * English value with its placeholders, URLs, addresses, digit tokens and R-29 tokens cut out; each run of two words
 * or more that remains is one member, so a sentence split by a placeholder is still caught by the words on either side.
 * Per code (en included), no placeholder is left unfilled, and the recipient and the new address appear wherever the
 * English copy of the template names them. A sentence split across two template strings is read in the joined output.
 * Not caught here: a translation in the right language that is wrong (REV reads that).
 */

const MESSAGES = resolve("packages/mail-templates/messages");
const CODES = readdirSync(MESSAGES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const EN = JSON.parse(readFileSync(join(MESSAGES, "en", "mail.json"), "utf8")) as Record<string, string>;
const AUTH_KEYS = Object.keys(EN).filter((key) => key.startsWith("auth.")).sort();
const englishOf = (key: string): string => String(EN[key]);

const R29 = ["Dialectical Engine", "DebateAI", "dezbatere.ro", "PLUS", "PRO", "MAX"] as const;
const CUT = "\u0000";
const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

/** The English member runs of one copy value, lower-cased: the cut rule of the header, two words or more. */
function memberRuns(value: string): string[] {
  let out = value
    .replace(/\{[^}]+\}/g, CUT)
    .replace(/https?:\/\/\S+/g, CUT)
    .replace(/\S+@\S+/g, CUT)
    .replace(/\S*\d\S*/g, CUT);
  for (const token of R29) out = out.replace(new RegExp(`(?<![A-Za-z])${escapeRegExp(token)}(?![A-Za-z])`, "g"), CUT);
  return out
    .split(CUT)
    .map((run) => squash(run).toLowerCase())
    .filter((run) => run.split(" ").length >= 2);
}

const ENGLISH_MEMBERS: readonly string[] = [...new Set(AUTH_KEYS.flatMap((key) => memberRuns(englishOf(key))))].sort();

const ENTITIES: Readonly<Record<string, string>> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'" };

/** The HTML part as a reader sees it: the tags out, and the five entities the renderer writes back in. */
const htmlText = (html: string): string =>
  html.replace(/<[^>]+>/g, " ").replace(/&(?:amp|lt|gt|quot|#39);/g, (entity) => ENTITIES[entity] ?? entity);

/** A serialized mail as a reader sees it: the encoded words of the Subject and a base64 body are decoded. */
function mimeText(message: string): string {
  const split = message.indexOf("\r\n\r\n");
  if (split < 0) throw new Error("the serialized mail has no header block");
  const head = message.slice(0, split);
  const raw = message.slice(split + 4);
  const subject = (/^Subject: (.*)$/m.exec(head)?.[1] ?? "")
    .replace(/=\?UTF-8\?B\?([A-Za-z0-9+/=]+)\?=/g, (_, word: string) => Buffer.from(word, "base64").toString("utf8"));
  const body = /^Content-Transfer-Encoding: base64$/m.test(head)
    ? Buffer.from(raw.replace(/\r\n/g, ""), "base64").toString("utf8")
    : raw;
  return `${subject}\n${body}`;
}

const RECIPIENT = "person@example.test";
const NEW_EMAIL = "new@example.test";
const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const EXPIRES = new Date("2026-10-17T12:00:00.000Z");
const NOT_BEFORE = new Date("2026-10-10T12:00:00.000Z");
const TOKEN = "T".repeat(43);
const CANCEL = "C".repeat(43);
const FINISH = "F".repeat(43);
const ACCOUNT_TOKEN = "a".repeat(43);
const PWR_OPTIONS = { from: "noreply@dezbatere.ro", publicAppUrl: "https://preview.example.test" };
const EMR_OPTIONS = { from: "noreply@example.test", publicAppUrl: "https://app.example.test" };

/** The credential link each account template carries (the renderer refuses any other path or fragment). */
const ACCOUNT_LINKS: Readonly<Partial<Record<AccountMailTemplate, string>>> = {
  "verification-v1": "https://dezbatere.ro/verify-email#token=",
  "consumer-recovery-v1": "https://dezbatere.ro/recover#token=",
  "recovery-v1": "https://dezbatere.ro/verify-recovery-email#token=",
  "email-change-confirm-v1": "https://dezbatere.ro/settings#email-change=confirm&token=",
  "email-change-notice-v1": "https://dezbatere.ro/settings#email-change=cancel&token="
};

function accountMail(template: AccountMailTemplate, code: string): AccountMailInput {
  const link = ACCOUNT_LINKS[template];
  return {
    template,
    recipient: RECIPIENT,
    display: { locale: code, timeZone: null },
    expiresAt: EXPIRES,
    copy: (key: string) => copyOf(code, key),
    ...(link === undefined ? {} : { url: new URL(`${link}${ACCOUNT_TOKEN}`) }),
    ...(template.startsWith("email-change-") ? { newEmail: NEW_EMAIL } : {})
  };
}

/** The values a template's English copy names: {recipient} and {newEmail}, read from the English catalogue. */
function accountValuesNamed(template: AccountMailTemplate): string[] {
  const names = new Set<string>();
  for (const key of AUTH_KEYS.filter((entry) => entry.startsWith(`auth.acc.${template}.`))) {
    for (const match of englishOf(key).matchAll(/\{(recipient|newEmail)\}/g)) {
      if (match[1] === "recipient") names.add(RECIPIENT);
      if (match[1] === "newEmail") names.add(NEW_EMAIL);
    }
  }
  return [...names];
}

const PWR_EVENTS = ["PROOF", "COMPLETED", "CANCELLED", "REFUSED"] as const;

const EMR_CASES: readonly Readonly<{
  label: string;
  fields: Omit<EmailRecoveryMail, "messageId" | "recipient" | "expiresAt" | "mailLocale">;
}>[] = [
  { label: "backup_email PROOF", fields: { flow: "backup_email", event: "PROOF", token: TOKEN } },
  { label: "backup_email VERIFIED", fields: { flow: "backup_email", event: "VERIFIED" } },
  { label: "mfa_recovery PROOF", fields: { flow: "mfa_recovery", event: "PROOF", token: TOKEN, cancelToken: CANCEL } },
  { label: "mfa_recovery STARTED", fields: { flow: "mfa_recovery", event: "STARTED", cancelToken: CANCEL } },
  {
    label: "mfa_recovery WAITING",
    fields: { flow: "mfa_recovery", event: "WAITING", notBefore: NOT_BEFORE, cancelToken: CANCEL }
  },
  { label: "mfa_recovery FINISH", fields: { flow: "mfa_recovery", event: "FINISH", finishToken: FINISH } },
  { label: "mfa_recovery COMPLETED", fields: { flow: "mfa_recovery", event: "COMPLETED" } },
  { label: "mfa_recovery CANCELLED", fields: { flow: "mfa_recovery", event: "CANCELLED" } },
  { label: "mfa_recovery REFUSED", fields: { flow: "mfa_recovery", event: "REFUSED" } }
];

type Rendered = Readonly<{ label: string; text: string; mustContain: readonly string[] }>;

/** Every R-25 mail for one catalogue code: 14 account templates, 4 password-reset events, 9 email-recovery cases. */
function renderAll(code: string): Rendered[] {
  const rendered: Rendered[] = [];
  for (const template of ACCOUNT_MAIL_TEMPLATES) {
    const mail = renderAccountEmail(accountMail(template, code));
    rendered.push({
      label: `account ${template}`,
      text: squash(`${mail.subject}\n${mail.text}\n${htmlText(mail.html)}`),
      mustContain: accountValuesNamed(template)
    });
  }
  for (const event of PWR_EVENTS) {
    const mail: PasswordResetMail = {
      messageId: MESSAGE_ID,
      event,
      recipient: RECIPIENT,
      expiresAt: EXPIRES,
      mailLocale: code,
      ...(event === "PROOF" ? { token: TOKEN, cancelToken: CANCEL } : {})
    };
    rendered.push({
      label: `password reset ${event}`,
      text: squash(mimeText(renderPasswordResetMail(mail, PWR_OPTIONS))),
      mustContain: []
    });
  }
  for (const item of EMR_CASES) {
    const mail: EmailRecoveryMail = {
      ...item.fields,
      messageId: MESSAGE_ID,
      recipient: RECIPIENT,
      expiresAt: EXPIRES,
      mailLocale: code
    };
    rendered.push({
      label: `email recovery ${item.label}`,
      text: squash(mimeText(renderEmailRecoveryMail(mail, EMR_OPTIONS))),
      mustContain: []
    });
  }
  return rendered;
}

describe("S01 render level: every R-25 mail in every catalogue code (R-28, B8, D-79)", () => {
  it("the catalogue holds the 35 codes and en holds the 115 auth keys", () => {
    expect(CODES).toHaveLength(35);
    expect(AUTH_KEYS).toHaveLength(115);
  });

  it("the English member runs are read from the auth keys (the list is not typed in)", () => {
    expect(ENGLISH_MEMBERS.length).toBeGreaterThan(50);
  });

  for (const code of CODES) {
    it(`no English member and no unfilled placeholder in any R-25 mail (${code})`, () => {
      const problems: string[] = [];
      for (const mail of renderAll(code)) {
        for (const placeholder of mail.text.match(/\{[A-Za-z][A-Za-z0-9_]*\}/g) ?? []) {
          problems.push(`${mail.label}: unfilled ${placeholder}`);
        }
        for (const value of mail.mustContain) {
          if (!mail.text.includes(value)) problems.push(`${mail.label}: lacks ${value}`);
        }
        if (code === "en") continue;
        const lower = mail.text.toLowerCase();
        for (const run of ENGLISH_MEMBERS) {
          if (lower.includes(run)) problems.push(`${mail.label}: English "${run}"`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
