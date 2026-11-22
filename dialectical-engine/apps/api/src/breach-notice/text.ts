/**
 * The text of a personal-data-breach notice (docs/operations/breach-runbook.md part 6). The owner writes it, one file
 * per language, in a folder: `en.txt`, `ro.txt`, `ko.txt` and so on, named by the language codes mail is written in.
 *
 * One file:
 *
 *   Subject: Notice of Data Breach
 *   (an empty line)
 *   The message. An empty line starts a new paragraph; a line break inside a paragraph is kept.
 *
 * The mail prints the message exactly as written and adds one closing line: who we are and the privacy address. Nothing
 * is translated, added or filled in here, so the file is the notice. A file that cannot go out as written is refused
 * before anything is sent: no subject, a placeholder in square brackets left unfilled, no privacy address to write to
 * (a reply to noreply@ reaches nobody, and every region's law asks for a contact), a control character, bytes that are
 * not UTF-8.
 *
 * A refusal names the file and the rule. It never repeats the text.
 */
import { createHash } from "node:crypto";
import { lstatSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SELLER_COMPANY } from "@debateai/billing-core";
import { MAIL_LOCALES, mailDirectionOf, type MailLocale } from "@debateai/mail-templates";

/** One refusal of the breach-notice command: a fixed code and a plain sentence with no personal data in it. */
export class BreachNoticeRefusal extends Error {
  constructor(readonly code: string, detail: string) {
    super(detail);
    this.name = "BreachNoticeRefusal";
  }
}

export type BreachNoticeText = Readonly<{
  language: MailLocale;
  subject: string;
  paragraphs: readonly string[];
  /** SHA-256 of the file's bytes, so the log proves which text went out. */
  sha256: string;
}>;

const SUBJECT_PREFIX = "Subject: ";
const SUBJECT_MAX = 200;
const MESSAGE_MAX = 20_000;
/** A file larger than this is not a notice; the longest message allowed fits four times over in any language. */
const FILE_BYTES_MAX = 80_000;
const CONTROL_CHARACTER = /[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029]/u;
const PLACEHOLDER_LEFT = /\[[^\]\n]*\]/u;
const LANGUAGE_FILE = /^(.+)\.txt$/u;

const isMailLanguage = (value: string): value is MailLocale => (MAIL_LOCALES as readonly string[]).includes(value);

export function parseBreachNoticeText(language: string, raw: string | Uint8Array): BreachNoticeText {
  const file = `${language}.txt`;
  if (!isMailLanguage(language)) {
    throw new BreachNoticeRefusal("BREACH_NOTICE_TEXT_LANGUAGE_UNKNOWN", `${file} is not named by a language mail is written in (for example en.txt, ro.txt)`);
  }
  const bytes = typeof raw === "string" ? Buffer.from(raw, "utf8") : Buffer.from(raw);
  if (bytes.byteLength > FILE_BYTES_MAX) throw new BreachNoticeRefusal("BREACH_NOTICE_TEXT_TOO_LONG", `${file} is too long to be a notice`);
  let decoded: string;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new BreachNoticeRefusal("BREACH_NOTICE_TEXT_NOT_UTF8", `${file} is not saved as UTF-8 text`);
  }
  const lines = decoded.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const first = lines[0] ?? "";
  const subject = first.startsWith(SUBJECT_PREFIX) ? first.slice(SUBJECT_PREFIX.length).trim() : "";
  if (subject === "" || subject.length > SUBJECT_MAX || (lines[1] ?? "").trim() !== "") {
    throw new BreachNoticeRefusal("BREACH_NOTICE_TEXT_NO_SUBJECT",
      `${file} must start with a line "Subject: ..." of at most ${String(SUBJECT_MAX)} characters, followed by an empty line`);
  }
  const message = lines.slice(2).map((line) => line.trimEnd()).join("\n").trim();
  if (message === "") throw new BreachNoticeRefusal("BREACH_NOTICE_TEXT_EMPTY", `${file} has a subject and no message`);
  if (message.length > MESSAGE_MAX) {
    throw new BreachNoticeRefusal("BREACH_NOTICE_TEXT_TOO_LONG", `${file} has a message longer than ${String(MESSAGE_MAX)} characters`);
  }
  if (CONTROL_CHARACTER.test(subject) || CONTROL_CHARACTER.test(message)) {
    throw new BreachNoticeRefusal("BREACH_NOTICE_TEXT_CONTROL_CHARACTER", `${file} holds a tab or another control character; write plain text only`);
  }
  if (PLACEHOLDER_LEFT.test(subject) || PLACEHOLDER_LEFT.test(message)) {
    throw new BreachNoticeRefusal("BREACH_NOTICE_TEXT_PLACEHOLDER_LEFT", `${file} still has a part in [square brackets]; fill it in or remove the brackets`);
  }
  if (!message.includes(SELLER_COMPANY.emails.privacy)) {
    throw new BreachNoticeRefusal("BREACH_NOTICE_TEXT_NO_CONTACT", `${file} does not say where to write: it must name ${SELLER_COMPANY.emails.privacy}`);
  }
  const paragraphs = message.split(/\n{2,}/u).map((paragraph) => paragraph.trim()).filter((paragraph) => paragraph !== "");
  return Object.freeze({
    language, subject, paragraphs: Object.freeze(paragraphs), sha256: createHash("sha256").update(bytes).digest("hex")
  });
}

/** Every `<language>.txt` of the folder. A file that is not a `.txt` file is ignored; a folder inside it is refused. */
export function readBreachNoticeTexts(directory: string): ReadonlyMap<string, BreachNoticeText> {
  const texts = new Map<string, BreachNoticeText>();
  let names: string[];
  try {
    names = readdirSync(directory).sort();
  } catch {
    throw new BreachNoticeRefusal("BREACH_NOTICE_TEXTS_UNREADABLE", "the folder of notice texts cannot be read");
  }
  for (const name of names) {
    const language = LANGUAGE_FILE.exec(name)?.[1];
    if (language === undefined || name.startsWith(".")) continue;
    let bytes: Buffer;
    try {
      const entry = lstatSync(join(directory, name));
      if (!entry.isFile()) throw new TypeError("not a file");
      if (entry.size > FILE_BYTES_MAX) throw new BreachNoticeRefusal("BREACH_NOTICE_TEXT_TOO_LONG", `${name} is too long to be a notice`);
      bytes = readFileSync(join(directory, name));
    } catch (error) {
      if (error instanceof BreachNoticeRefusal) throw error;
      throw new BreachNoticeRefusal("BREACH_NOTICE_TEXTS_UNREADABLE", `${name} in the folder of notice texts cannot be read as a file`);
    }
    texts.set(language, parseBreachNoticeText(language, bytes));
  }
  if (texts.size === 0) throw new BreachNoticeRefusal("BREACH_NOTICE_TEXTS_NONE", "the folder of notice texts holds no <language>.txt file");
  return texts;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

/**
 * The mail: the message as written, then one closing line with the company's name, its registered office and the
 * privacy address. The same plain shell as the other templated mail (packages/mail-templates/src/render.ts).
 */
export function renderBreachNotice(text: BreachNoticeText): Readonly<{ subject: string; text: string; html: string }> {
  const footer = `${SELLER_COMPANY.legalName}, ${SELLER_COMPANY.registeredOffice}. ${SELLER_COMPANY.emails.privacy}`;
  const plain = `${text.paragraphs.join("\n\n")}\n\n-- \n${footer}\n`;
  const html = [
    "<!doctype html>",
    `<html lang="${text.language}" dir="${mailDirectionOf(text.language)}">`,
    `<head><meta charset="utf-8"><title>${escapeHtml(text.subject)}</title></head>`,
    '<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5">',
    ...text.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`),
    '<hr style="border:none;border-top:1px solid #dddddd">',
    `<p style="font-size:12px">${escapeHtml(footer)}</p>`,
    "</body></html>",
    ""
  ].join("\n");
  return Object.freeze({ subject: text.subject, text: plain, html });
}
