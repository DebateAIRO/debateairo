import { questionLocale } from "../i18n/questionLocale.js";
import type { LocaleCode } from "../i18n/locales.js";
import type { MessageCatalog } from "../i18n/translate.js";

/**
 * The language the full report is printed in (spec 2026-09-26 §14.3): the
 * question's, so the report reads in one language from cover to appendix.
 *
 * FONTS (interim, until the owner's font decision): the vendored faces
 * (apps/ui/assets/fonts, Fraunces and Plus Jakarta Sans) carry every Latin
 * letter the 25 Latin-script interface locales use, Vietnamese included, and
 * none of the Cyrillic, Greek, Hebrew, Arabic, Devanagari or CJK scripts
 * (lib/report/fonts.test.mjs measures both halves). A report in one of those
 * ten would print empty boxes, so it is refused: the panel hides its download
 * and says the report is not available in that language yet. New script fonts
 * (and right-to-left layout for ar and he) would flip this list.
 */
export const REPORT_UNPRINTABLE_LOCALES: readonly LocaleCode[] = Object.freeze([
  "bg", "ru", "uk", "el", "he", "ar", "hi", "zh", "ja", "ko"
]);

export function reportSupportedForLocale(locale: string): boolean {
  return !(REPORT_UNPRINTABLE_LOCALES as readonly string[]).includes(locale);
}

/**
 * The namespaces the report prints from: its own words (public) and the way of
 * knowing each point rests on (compose). Its set-aside and note lines are its
 * own plain `public.report.point.*` keys, never dev's machinery labels.
 */
export type ReportNamespace = "public" | "compose";

/**
 * Loads one namespace's catalogue for one locale. The report route passes dev's
 * `loadNamespace` (lib/i18n/server.ts, server-only); the owner's sample-report
 * script passes a reader of the same message files.
 */
export type ReportCatalogLoader = (locale: string, namespace: ReportNamespace) => Promise<MessageCatalog>;

/**
 * Every catalogue the report reads, for its one locale. `metadataCatalog` is
 * the ENGLISH `public` catalogue, read for one thing only: the PDF's metadata
 * carries the English disclosure line, so a machine can read that the file is
 * AI-generated whatever language the page is in (controller ruling, R2; dev's
 * "export disclosure stays English" governs the JSON export).
 */
export interface ReportCatalogs {
  readonly locale: LocaleCode;
  readonly publicCatalog: MessageCatalog;
  readonly composeCatalog: MessageCatalog;
  readonly metadataCatalog: MessageCatalog;
}

/**
 * The report's catalogues for the question's language tag (the run's
 * argument_language_tag). A tag of "und", or one outside the 35 interface
 * locales, falls back to `interfaceLocale`, the reader's own. A locale whose
 * script the fonts cannot print is refused before anything is loaded.
 */
export async function loadReportCatalogs(input: Readonly<{
  questionTag: string | null;
  interfaceLocale: LocaleCode;
  load: ReportCatalogLoader;
}>): Promise<ReportCatalogs> {
  const locale = questionLocale(input.questionTag, input.interfaceLocale);
  if (!reportSupportedForLocale(locale)) throw new RangeError(`REPORT_LOCALE_UNSUPPORTED: ${locale}`);
  const [publicCatalog, composeCatalog, metadataCatalog] = await Promise.all([
    input.load(locale, "public"),
    input.load(locale, "compose"),
    input.load("en", "public")
  ]);
  return Object.freeze({ locale, publicCatalog, composeCatalog, metadataCatalog });
}
