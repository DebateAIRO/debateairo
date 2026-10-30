/**
 * THE PERSONAL-DATA SCAN for text that would leave us (web search plan W1-2, 2026-10-30; design §3.1).
 *
 * `canonicalMailAddress` and `normalizeManualPhone` judge ONE value a person typed into one field. This scans free text
 * (a search an AI wrote) for anything that points at a person or their money, so the search can be held back before it
 * is sent: an email address, a phone number, an IBAN, a payment card number, a Romanian CNP, another ID number, or a web
 * address carrying a query string (which can hold a name, a session or an account number).
 *
 * It errs on the side of refusing: any run of 9 or more digits that is not a year range, a thousands-grouped figure, an
 * arXiv number or a DOI is refused as an ID number even when it matches no known shape, and an IBAN, card or CNP whose
 * check digits fail is still refused (as an ID number). A refused search costs one search; a sent one cannot be called
 * back.
 *
 * A finding names its kind and its place in the text, never the value, so a caller can log or store it safely.
 */
export type PersonalDataKind = "EMAIL" | "PHONE" | "IBAN" | "CARD" | "NATIONAL_ID" | "ID_NUMBER" | "URL_QUERY";
export type PersonalDataFinding = Readonly<{ kind: PersonalDataKind; start: number; end: number }>;

/** The kinds in the order `personalDataKinds` lists them. */
export const PERSONAL_DATA_KINDS: readonly PersonalDataKind[] = Object.freeze([
  "EMAIL", "PHONE", "IBAN", "CARD", "NATIONAL_ID", "ID_NUMBER", "URL_QUERY"
]);

/** One character of an email's local part (before `@`). */
const EMAIL_LOCAL_CHAR = /[\p{L}\p{N}._%+-]/u;
/** An email's domain, read from just after its `@` (sticky, so it is tried at that one place only). */
const EMAIL_DOMAIN = /[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/uy;
/** The longest local part RFC 5321 allows; a longer run is still found, as its last 64 characters. */
const EMAIL_LOCAL_MAX = 64;
/**
 * The email addresses in `text`, leftmost first and never overlapping: a local part, `@`, a dotted domain. Found from
 * each `@` outwards rather than by one pattern over the whole text, so a long run of `%` or `.` with no `@` costs one
 * pass, not one pass per character (CodeQL js/polynomial-redos, PR #224).
 */
function emailSpans(text: string): readonly Readonly<{ start: number; end: number }>[] {
  const spans: { start: number; end: number }[] = [];
  let lastEnd = 0;
  for (let at = text.indexOf("@"); at >= 0; at = text.indexOf("@", at + 1)) {
    let start = at;
    while (start > lastEnd && at - start < EMAIL_LOCAL_MAX && EMAIL_LOCAL_CHAR.test(text[start - 1]!)) start -= 1;
    if (start === at) continue;
    EMAIL_DOMAIN.lastIndex = at + 1;
    const domain = EMAIL_DOMAIN.exec(text);
    if (domain === null) continue;
    spans.push({ start, end: at + 1 + domain[0].length });
    lastEnd = at + 1 + domain[0].length;
    at = lastEnd - 1;
  }
  return spans;
}
/** A web address token: a scheme, a leading `www.`, or a dotted host followed by a path. */
const URL_TOKEN = /\S+/gu;
const URL_START = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.)|^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+\//iu;
/** A DOI (`10.1056/NEJMoa2034577`) and an arXiv number (`2310.12345v2`) name a paper, never a person. */
const PAPER_NUMBERS = /\b10\.\d{4,9}\/\S+|\b\d{4}\.\d{4,5}(?:v\d+)?\b/gu;
const IBAN_START = /\b[A-Z]{2}\d{2}(?=[ A-Z0-9])/gu;
const UK_INSURANCE_NUMBER = /\b[A-Z]{2} ?\d{2} ?\d{2} ?\d{2} ?[A-D]\b/gu;
/** A Romanian identity card: two letters of the series and six digits (`RX 123456`). */
const SERIES_AND_NUMBER = /\b[A-Z]{2} ?\d{6}\b/gu;
/** A run of digits with the separators a written number uses; a leading `+` or `(` belongs to a phone number. */
const DIGIT_RUN = /(?:\+|\(\+?)?\d(?:[\d  .()-]*\d)?/gu;
const LETTERS_AND_DIGITS = /[\p{L}\p{N}]+/gu;
const US_SOCIAL_SECURITY = /^\d{3}-\d{2}-\d{4}$/u;
const YEAR = /^(?:19|20)\d\d$/u;
const CNP_KEY = "279146358279";
const MIN_ID_DIGITS = 9;
const MAX_PHONE_DIGITS = 15;
const MIN_TOKEN_DIGITS = 6;

function ibanValid(compact: string): boolean {
  if (compact.length < 15 || compact.length > 34) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const character of rearranged) {
    const value = character >= "A" && character <= "Z" ? String(character.charCodeAt(0) - 55) : character;
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/** A Romanian personal numeric code: sex/century digit, a real birth date, a county code and its check digit. */
function romanianCnpValid(digits: string): boolean {
  if (!/^[1-9]\d{12}$/u.test(digits)) return false;
  const month = Number(digits.slice(3, 5));
  const day = Number(digits.slice(5, 7));
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  let sum = 0;
  for (let index = 0; index < 12; index += 1) sum += Number(digits[index]) * Number(CNP_KEY[index]);
  const check = sum % 11 === 10 ? 1 : sum % 11;
  return check === Number(digits[12]);
}

/** `19 053 815` or `1.500.000`: a figure grouped in thousands, not an identifier. */
function thousandsGrouped(run: string): boolean {
  const match = /^([1-9]\d{0,2})((?:([ . ])\d{3})(?:\3\d{3})*)$/u.exec(run);
  return match !== null;
}

function digitRunKind(run: string): PersonalDataKind | null {
  const groups = run.split(/\D+/u).filter((group) => group !== "");
  const digits = groups.join("");
  const separated = groups.length > 1;
  const plusOrParen = run.startsWith("+") || run.startsWith("(");
  if (plusOrParen && digits.length >= 7 && digits.length <= MAX_PHONE_DIGITS) return "PHONE";
  if (digits.length < MIN_ID_DIGITS) return null;
  if (groups.every((group) => YEAR.test(group))) return null;
  if (thousandsGrouped(run)) return null;
  if (US_SOCIAL_SECURITY.test(run)) return "ID_NUMBER";
  if (digits.length === 13 && romanianCnpValid(digits)) return "NATIONAL_ID";
  if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) return "CARD";
  if (digits.length <= MAX_PHONE_DIGITS && (plusOrParen || digits.startsWith("0") || separated)) return "PHONE";
  return "ID_NUMBER";
}

/** Every piece of personal data in the text, by kind and place (never the value), in reading order. */
export function findPersonalData(text: string): readonly PersonalDataFinding[] {
  const findings: PersonalDataFinding[] = [];
  let masked = text;
  const mask = (start: number, end: number): void => {
    masked = masked.slice(0, start) + " ".repeat(end - start) + masked.slice(end);
  };
  const found = (kind: PersonalDataKind, start: number, end: number): void => {
    findings.push(Object.freeze({ kind, start, end }));
    mask(start, end);
  };

  for (const token of text.matchAll(URL_TOKEN)) {
    const value = token[0];
    if (!URL_START.test(value)) continue;
    const query = value.indexOf("?");
    if (query >= 0 && query < value.length - 1) found("URL_QUERY", token.index, token.index + value.length);
  }
  for (const email of emailSpans(masked)) found("EMAIL", email.start, email.end);
  for (const paper of masked.matchAll(PAPER_NUMBERS)) mask(paper.index, paper.index + paper[0].length);

  for (const start of [...masked.matchAll(IBAN_START)].map((match) => match.index)) {
    const positions: number[] = [];
    let cursor = start;
    while (cursor < masked.length && positions.length < 34) {
      const character = masked[cursor]!;
      if (/[A-Z0-9]/u.test(character)) {
        positions.push(cursor);
      } else if (!(character === " " && /[A-Z0-9]/u.test(masked[cursor + 1] ?? ""))) {
        break;
      }
      cursor += 1;
    }
    const compact = positions.map((position) => masked[position]).join("");
    for (let length = compact.length; length >= 15; length -= 1) {
      if (ibanValid(compact.slice(0, length))) {
        found("IBAN", start, positions[length - 1]! + 1);
        break;
      }
    }
  }
  for (const pattern of [UK_INSURANCE_NUMBER, SERIES_AND_NUMBER]) {
    for (const match of masked.matchAll(pattern)) found("ID_NUMBER", match.index, match.index + match[0].length);
  }
  // A word mixing letters and at least six digits (a passport number, an IBAN whose check digits fail) is taken whole
  // before the digit runs, so its digits are never read as a shorter number of another kind.
  for (const token of masked.matchAll(LETTERS_AND_DIGITS)) {
    const digits = token[0].replace(/\D/gu, "").length;
    if (digits >= MIN_TOKEN_DIGITS && /\p{L}/u.test(token[0])) found("ID_NUMBER", token.index, token.index + token[0].length);
  }
  for (const run of masked.matchAll(DIGIT_RUN)) {
    const kind = digitRunKind(run[0]);
    if (kind !== null) found(kind, run.index, run.index + run[0].length);
  }
  return Object.freeze(findings.sort((a, b) => a.start - b.start));
}

/** The kinds of personal data in the text, each once, in `PERSONAL_DATA_KINDS` order. */
export function personalDataKinds(text: string): readonly PersonalDataKind[] {
  const kinds = new Set(findPersonalData(text).map((finding) => finding.kind));
  return Object.freeze(PERSONAL_DATA_KINDS.filter((kind) => kinds.has(kind)));
}
