import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { copyOf } from "@debateai/mail-templates";
import {
  ACCOUNT_MAIL_BOUNDARY, ACCOUNT_MAIL_LOCALES, ACCOUNT_MAIL_TEMPLATES, renderAccountEmail, serializeAccountMail,
  type AccountMailInput, type AccountMailTemplate
} from "../../apps/api/src/account-mail-template.mjs";
import { renderEmailRecoveryMail, type EmailRecoveryMail } from "../../apps/api/src/email-mfa-mail.js";
import { renderPasswordResetMail, type PasswordResetMail } from "../../apps/api/src/password-reset-mail.js";

/**
 * Mission email-locale, S01 FIX-S01-p1-code (REV-S01-p1-translation N6; SPEC-v4 R-33): plain-text parts get no bidi
 * control character; `ar` and `he` change only the HTML `dir`. The guard renders every account template for the 37
 * display locales (two time zones each) and every password-reset and email-recovery mail for the 35 catalogue codes,
 * then reads each plain-text part as a reader gets it (the account part through its MIME base64 encoding).
 * The Bidi_Control set is U+061C, U+200E, U+200F, U+202A-U+202E, U+2066-U+2069.
 */

const BIDI_CONTROL = /[؜‎‏‪-‮⁦-⁩]/;
const CODES = readdirSync(resolve("packages/mail-templates/messages"), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const RECIPIENT = "person@example.test";
const NEW_EMAIL = "new@example.test";
const MESSAGE_ID = "11111111-1111-4111-8111-111111111111";
const EXPIRES = new Date("2026-10-17T12:00:00.000Z");
const NOT_BEFORE = new Date("2026-10-10T12:00:00.000Z");
const TOKEN = "T".repeat(43);
const CANCEL = "C".repeat(43);
const FINISH = "F".repeat(43);
const ACCOUNT_TOKEN = "a".repeat(43);
const ZONES: readonly (string | null)[] = [null, "Europe/Bucharest"];
const FROM = "noreply@dezbatere.ro";
const PWR_OPTIONS = { from: FROM, publicAppUrl: "https://preview.example.test" };
const EMR_OPTIONS = { from: "noreply@example.test", publicAppUrl: "https://app.example.test" };

const ACCOUNT_LINKS: Readonly<Partial<Record<AccountMailTemplate, string>>> = {
  "verification-v1": "https://dezbatere.ro/verify-email#token=",
  "consumer-recovery-v1": "https://dezbatere.ro/recover#token=",
  "recovery-v1": "https://dezbatere.ro/verify-recovery-email#token=",
  "email-change-confirm-v1": "https://dezbatere.ro/settings#email-change=confirm&token=",
  "email-change-notice-v1": "https://dezbatere.ro/settings#email-change=cancel&token="
};

/** A catalogue code for a display locale: the two English display entries share the English copy. */
const catalogOf = (locale: string): string => (locale === "en-US" || locale === "en-GB" ? "en" : locale);

function accountMail(template: AccountMailTemplate, locale: string, timeZone: string | null): AccountMailInput {
  const link = ACCOUNT_LINKS[template];
  return {
    template,
    recipient: RECIPIENT,
    display: { locale, timeZone },
    expiresAt: EXPIRES,
    copy: (key: string) => copyOf(catalogOf(locale), key),
    ...(link === undefined ? {} : { url: new URL(`${link}${ACCOUNT_TOKEN}`) }),
    ...(template.startsWith("email-change-") ? { newEmail: NEW_EMAIL } : {}),
    ...(template.startsWith("security-") ? { messageId: MESSAGE_ID } : {})
  };
}

/** The decoded text/plain parts of one serialized mail: a multipart mail has its parts, a single-part mail is one. */
function plainPartsOf(message: string): string[] {
  const segments = message.includes(`--${ACCOUNT_MAIL_BOUNDARY}`) ? message.split(`--${ACCOUNT_MAIL_BOUNDARY}`) : [message];
  return segments.flatMap((segment) => {
    const split = segment.indexOf("\r\n\r\n");
    if (split < 0 || !/^Content-Type: text\/plain/m.test(segment.slice(0, split))) return [];
    const head = segment.slice(0, split);
    const raw = segment.slice(split + 4);
    return [/^Content-Transfer-Encoding: base64$/m.test(head)
      ? Buffer.from(raw.replace(/\r\n/g, ""), "base64").toString("utf8")
      : raw];
  });
}

const bidiIn = (text: string): string[] => [...text].filter((character) => BIDI_CONTROL.test(character))
  .map((character) => `U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`);

describe("R-33: no bidi control character in any plain-text part", () => {
  it("the guard covers the 37 display locales and the 14 account templates", () => {
    expect(ACCOUNT_MAIL_LOCALES).toHaveLength(37);
    expect(ACCOUNT_MAIL_TEMPLATES).toHaveLength(14);
    expect(CODES).toHaveLength(35);
  });

  for (const locale of ACCOUNT_MAIL_LOCALES) {
    it(`account renderer: every template plain part is free of bidi controls (${locale})`, () => {
      const problems: string[] = [];
      for (const template of ACCOUNT_MAIL_TEMPLATES) {
        for (const timeZone of ZONES) {
          const input = accountMail(template, locale, timeZone);
          const marks = bidiIn(renderAccountEmail(input).text);
          if (marks.length > 0) problems.push(`${template} zone=${timeZone ?? "UTC"} renderAccountEmail.text ${marks.join(" ")}`);
          for (const plain of plainPartsOf(serializeAccountMail(input, FROM))) {
            const wire = bidiIn(plain);
            if (wire.length > 0) problems.push(`${template} zone=${timeZone ?? "UTC"} serialized text/plain ${wire.join(" ")}`);
          }
        }
      }
      expect(problems).toEqual([]);
    });
  }

  for (const code of CODES) {
    it(`password-reset and email-recovery plain parts are free of bidi controls (${code})`, () => {
      const problems: string[] = [];
      for (const event of ["PROOF", "COMPLETED", "CANCELLED", "REFUSED"] as const) {
        const mail: PasswordResetMail = {
          messageId: MESSAGE_ID, event, recipient: RECIPIENT, expiresAt: EXPIRES, mailLocale: code,
          ...(event === "PROOF" ? { token: TOKEN, cancelToken: CANCEL } : {})
        };
        for (const plain of plainPartsOf(renderPasswordResetMail(mail, PWR_OPTIONS))) {
          const marks = bidiIn(plain);
          if (marks.length > 0) problems.push(`password reset ${event} ${marks.join(" ")}`);
        }
      }
      const emr: readonly Omit<EmailRecoveryMail, "messageId" | "recipient" | "expiresAt" | "mailLocale">[] = [
        { flow: "backup_email", event: "PROOF", token: TOKEN },
        { flow: "mfa_recovery", event: "PROOF", token: TOKEN, cancelToken: CANCEL },
        { flow: "mfa_recovery", event: "STARTED", cancelToken: CANCEL },
        { flow: "mfa_recovery", event: "WAITING", notBefore: NOT_BEFORE, cancelToken: CANCEL },
        { flow: "mfa_recovery", event: "FINISH", finishToken: FINISH },
        { flow: "mfa_recovery", event: "COMPLETED" },
        { flow: "mfa_recovery", event: "CANCELLED" },
        { flow: "mfa_recovery", event: "REFUSED" }
      ];
      for (const fields of emr) {
        const mail: EmailRecoveryMail = { ...fields, messageId: MESSAGE_ID, recipient: RECIPIENT, expiresAt: EXPIRES, mailLocale: code };
        for (const plain of plainPartsOf(renderEmailRecoveryMail(mail, EMR_OPTIONS))) {
          const marks = bidiIn(plain);
          if (marks.length > 0) problems.push(`email recovery ${fields.flow} ${fields.event} ${marks.join(" ")}`);
        }
      }
      expect(problems).toEqual([]);
    });
  }
});
