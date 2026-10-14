import { readFileSync, readdirSync } from "node:fs";

/**
 * The legal-page sentence set (#158, 2026-10-13): every sentence of six to thirty words of the site's translated
 * Terms and Privacy pages, in 35 locales (17,833 sentences when #158 was written). Used to tune the question checks.
 */
export function legalSentences(locale: string): string[] {
  const files = locale === "en"
    ? ["../../apps/ui/lib/termsOfService.ts", "../../apps/ui/lib/privacyPolicy.ts"]
    : [`../../apps/ui/lib/legal/${locale}/termsOfService.ts`, `../../apps/ui/lib/legal/${locale}/privacyPolicy.ts`];
  return files.flatMap((file) => [...readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/text: "((?:[^"\\]|\\.)*)"/gu)]
    .map((match) => JSON.parse(`"${match[1]!}"`) as string)
    .filter((text) => !text.startsWith("[")))
    .flatMap((paragraph) => paragraph.split(/(?<=[.!?;:])\s+/u))
    .filter((sentence) => { const words = sentence.split(/\s+/u).length; return words >= 6 && words <= 30; });
}

export const LEGAL_LOCALES: readonly string[] = Object.freeze(["en", ...readdirSync(new URL("../../apps/ui/lib/legal/", import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name)].sort());

/**
 * Ruling L-TUNE (controller, 2026-10-14): the measurement set measures QUESTION-LIKE prose. A legal line is not prose
 * when it holds an email address, a URL (a scheme, www., or a lower-case dotted domain such as edoeb.admin.ch), or when
 * digits are more than 20% of its non-space characters (contact, company, trade-register and address lines). Lines
 * heavy with proper names stay: questions can contain names. The excluded lines are listed by `excludedLines`.
 */
export type NonProseReason = "email" | "url" | "digits";
export function nonProseReason(text: string): NonProseReason | null {
  if (/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)+/u.test(text)) return "email";
  if (/https?:\/\/|\bwww\.|(?<![\p{L}\p{N}.])(?:[a-z0-9-]{2,}\.)+[a-z]{2,}(?![\p{L}\p{N}])/u.test(text)) return "url";
  const chars = text.replace(/\s+/gu, "");
  const digits = chars.match(/\p{Nd}/gu)?.length ?? 0;
  return digits * 5 > chars.length ? "digits" : null;
}

/** Ruling L-TUNE: the prose sentences of one locale (legalSentences without the non-prose lines). */
export function proseSentences(locale: string): string[] {
  return legalSentences(locale).filter((sentence) => nonProseReason(sentence) === null);
}

/** Ruling L-TUNE: every excluded line, with its locale and reason, in the set's order (reported, never silently dropped). */
export function excludedLines(): readonly Readonly<{ locale: string; reason: NonProseReason; text: string }>[] {
  return Object.freeze(LEGAL_LOCALES.flatMap((locale) => legalSentences(locale).flatMap((text) => {
    const reason = nonProseReason(text);
    return reason === null ? [] : [Object.freeze({ locale, reason, text })];
  })));
}

/** Romanian typed without diacritics (ă â î ș ț → a a i s t): the most common way people type it. */
export function withoutDiacritics(text: string): string {
  return text.normalize("NFD").replace(/\p{M}+/gu, "").normalize("NFC");
}

/**
 * Ruling L-MIX: real mixes built from the set — a Romanian sentence and an English one joined by a comma, both orders
 * (prose sentences only, ruling L-TUNE).
 */
export function mixedQuestions(): readonly Readonly<{ text: string; order: "RO+EN" | "EN+RO" }>[] {
  const ro = proseSentences("ro");
  const en = proseSentences("en");
  const open = (sentence: string): string => sentence.replace(/[.!?;:]+$/u, "");
  return Object.freeze(Array.from({ length: Math.min(ro.length, en.length) }, (_, index) => [
    Object.freeze({ text: `${open(ro[index]!)}, ${en[index]!}`, order: "RO+EN" as const }),
    Object.freeze({ text: `${open(en[index]!)}, ${ro[index]!}`, order: "EN+RO" as const })
  ]).flat());
}

/** Ruling L-MIX: the single-language controls — every prose sentence (L-TUNE), and the Romanian ones without diacritics. */
export function pureControls(): readonly Readonly<{ text: string; locale: string }>[] {
  return Object.freeze([
    ...LEGAL_LOCALES.flatMap((locale) => proseSentences(locale).map((text) => Object.freeze({ text, locale }))),
    ...proseSentences("ro").map((text) => Object.freeze({ text: withoutDiacritics(text), locale: "ro-plain" }))
  ]);
}
