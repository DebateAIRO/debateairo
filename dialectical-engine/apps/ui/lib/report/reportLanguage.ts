import { questionLocale } from "../i18n/questionLocale.js";
import type { LocaleCode } from "../i18n/locales.js";
import type { MessageCatalog } from "../i18n/translate.js";

/**
 * The language the full report is printed in (spec 2026-09-26 §14.3): the
 * question's, so the report reads in one language from cover to appendix.
 *
 * FONTS (Task R-fonts, owner decision 2026-09-27: "A: add them"): the vendored
 * faces (apps/ui/assets/fonts, SOURCES.md; the choice per language is
 * lib/report/reportFonts.ts) print the 25 Latin-script locales, Cyrillic and
 * Greek (Noto Sans), Devanagari, Hebrew (right to left, lib/report/
 * reportLayout.ts) and Chinese, Japanese and Korean (their Noto faces; lines
 * break between Chinese and Japanese characters, lib/report/
 * reportLineBreaks.ts); fonts.test.mjs checks every catalogue value against
 * them. A locale stays in this list, and its report is refused (the panel
 * hides the download and says the report is not available in that language
 * yet), only while the report cannot print it correctly:
 * - ar: every dotted Arabic letter is drawn in Noto Sans Arabic and Noto Naskh
 *   Arabic as a dotless letter plus its dots, and the dots (and the vowel
 *   marks) sit where the font's vertical offsets put them. react-pdf 4.9.0
 *   drops every vertical offset (lib/report/reportGlyphs.ts), so the dots land
 *   too high or too low. Printing Arabic needs a renderer that keeps them; the
 *   owner decides how.
 * The list may become empty; reportSupportedForLocale and the hidden-download
 * path stay, and their tests inject their own rule.
 */
export const REPORT_UNPRINTABLE_LOCALES: readonly LocaleCode[] = Object.freeze(["ar"]);

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
