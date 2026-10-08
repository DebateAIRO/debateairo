import { catalogLocale, getLocale, isLocale, type LocaleCode, type LocaleDefinition } from "./locales.js";

/**
 * The interface locale that speaks a question's language (spec 2026-09-26
 * §14.3). The tag is dev's `core.run.argument_language_tag` (a BCP-47 tag such
 * as "ro" or "pt-BR", or "und" when detection was not confident), carried by
 * the run read and by a public snapshot. Its primary subtag names one of the 35
 * interface locales, or the question's language has no catalogue: "und", an
 * unknown tag, a missing tag and anything malformed all fall back to the
 * interface locale the reader already uses.
 */
export function questionLocale(tag: string | null | undefined, interfaceLocale: LocaleCode): LocaleCode {
  if (typeof tag !== "string") return interfaceLocale;
  const primary = tag.trim().split("-")[0]?.toLowerCase() ?? "";
  return isLocale(primary) ? primary : interfaceLocale;
}

/**
 * The locale the debate page offers to switch to (spec §14.3): the question's
 * own locale when it is one of the 35 and differs from the interface locale;
 * otherwise null, and no offer shows.
 */
export function languageOfferLocale(
  questionLocaleCode: LocaleCode | null,
  interfaceLocale: LocaleCode
): LocaleDefinition | null {
  if (questionLocaleCode === null || catalogLocale(questionLocaleCode) === catalogLocale(interfaceLocale)) return null;
  return getLocale(questionLocaleCode);
}

/** The writing direction of a locale's script, for `dir` on a container in that locale. */
export function localeDirection(locale: string): "ltr" | "rtl" {
  return getLocale(locale).dir;
}

/**
 * A language's name in the INTERFACE's language (fix round 1): "Romanian" for
 * an English reader, "engleză" for a Romanian one, from the browser's own
 * Intl.DisplayNames. Null where the interface cannot name it (no DisplayNames,
 * or a name that is only the code or the language's own name echoed back): the
 * offer then names the language once, in its own words.
 */
export function languageNameIn(
  code: LocaleCode,
  interfaceLocale: LocaleCode,
  displayNames: typeof Intl.DisplayNames = Intl.DisplayNames
): string | null {
  let name: string | undefined;
  try {
    name = new displayNames([interfaceLocale], { type: "language" }).of(code);
  } catch {
    return null;
  }
  if (name === undefined || name.trim().length === 0) return null;
  return name === code || name === getLocale(code).nativeName ? null : name;
}
