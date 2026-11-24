export const LOCALE_COOKIE = "debateai.locale";
export const DEFAULT_LOCALE = "en";

export type LocaleTier = "EUROPE" | "ASIA" | "MIDDLE EAST";
export type LocaleDirection = "ltr" | "rtl";

export type LocaleDefinition = Readonly<{
  code: string;
  nativeName: string;
  tier: LocaleTier;
  dir: LocaleDirection;
}>;

const locale = <Code extends string, Name extends string, Tier extends LocaleTier>(
  code: Code,
  nativeName: Name,
  tier: Tier,
  dir: LocaleDirection = "ltr"
) => Object.freeze({ code, nativeName, tier, dir });

export const LOCALES = Object.freeze([
  locale("bg", "Български", "EUROPE"),
  locale("hr", "Hrvatski", "EUROPE"),
  locale("cs", "Čeština", "EUROPE"),
  locale("da", "Dansk", "EUROPE"),
  locale("nl", "Nederlands", "EUROPE"),
  locale("en", "English", "EUROPE"),
  locale("et", "Eesti", "EUROPE"),
  locale("fi", "Suomi", "EUROPE"),
  locale("fr", "Français", "EUROPE"),
  locale("de", "Deutsch", "EUROPE"),
  locale("el", "Ελληνικά", "EUROPE"),
  locale("hu", "Magyar", "EUROPE"),
  locale("ga", "Gaeilge", "EUROPE"),
  locale("it", "Italiano", "EUROPE"),
  locale("lv", "Latviešu", "EUROPE"),
  locale("lt", "Lietuvių", "EUROPE"),
  locale("mt", "Malti", "EUROPE"),
  locale("pl", "Polski", "EUROPE"),
  locale("pt", "Português", "EUROPE"),
  locale("ro", "Română", "EUROPE"),
  locale("ru", "Русский", "EUROPE"),
  locale("sk", "Slovenčina", "EUROPE"),
  locale("sl", "Slovenščina", "EUROPE"),
  locale("es", "Español", "EUROPE"),
  locale("sv", "Svenska", "EUROPE"),
  locale("uk", "Українська", "EUROPE"),
  locale("zh", "中文", "ASIA"),
  locale("hi", "हिन्दी", "ASIA"),
  locale("id", "Bahasa Indonesia", "ASIA"),
  locale("ja", "日本語", "ASIA"),
  locale("ko", "한국어", "ASIA"),
  locale("vi", "Tiếng Việt", "ASIA"),
  locale("ar", "العربية", "MIDDLE EAST", "rtl"),
  locale("he", "עברית", "MIDDLE EAST", "rtl"),
  locale("tr", "Türkçe", "MIDDLE EAST")
] as const);

export type CatalogLocaleCode = (typeof LOCALES)[number]["code"];
export type LocaleCode = CatalogLocaleCode | "en-US" | "en-GB";

/** Formatting choices share the 35 translation catalogs; old `en` cookies remain valid. */
export const LOCALE_PREFERENCES: readonly LocaleDefinition[] = Object.freeze(LOCALES.flatMap<LocaleDefinition>((definition) =>
  definition.code === "en"
    ? [locale("en-US", "English (United States)", "EUROPE"), locale("en-GB", "English (United Kingdom)", "EUROPE")]
    : [definition]
));

export function catalogLocale(locale: LocaleCode): CatalogLocaleCode {
  return locale === "en-US" || locale === "en-GB" ? "en" : locale;
}

export function legalLocale(locale: LocaleCode): CatalogLocaleCode {
  return catalogLocale(locale);
}

const catalogLocaleCodes = new Set<string>([...LOCALES.map(({ code }) => code), "en-US", "en-GB"]);

/**
 * Whether a value names one of the 35 catalogue languages (or a regional English choice). Text that carries a language
 * of its own, such as a debate argued in German, is tagged and read with this test, whatever the interface shows.
 */
export function isCatalogLocale(value: unknown): value is LocaleCode {
  return typeof value === "string" && catalogLocaleCodes.has(value);
}

/**
 * The interface languages the site offers: all 35 catalogue languages since 24 November 2026 (owner's decision; from
 * 19 November it was English and Romanian only). A language left out of this list stays in the repository but is not
 * offered: the language list does not show it, and a locale cookie naming it is read as English.
 */
export const OFFERED_LOCALE_CODES: readonly CatalogLocaleCode[] = Object.freeze(LOCALES.map(({ code }) => code));

/** Whether a value names an offered interface language: the test every page applies to the locale cookie. */
export function isLocale(value: unknown): value is LocaleCode {
  return isCatalogLocale(value) && OFFERED_LOCALE_CODES.includes(catalogLocale(value));
}

/** The rows of the language list: the offered languages, with English as its two regional choices. */
export const OFFERED_LOCALE_PREFERENCES: readonly LocaleDefinition[] = Object.freeze(
  LOCALE_PREFERENCES.filter(({ code }) => isLocale(code))
);

/** A language's definition (name, direction); any catalogue language is known here, so Arabic and Hebrew text stays right to left. */
export function getLocale(value: unknown): LocaleDefinition {
  const code = isCatalogLocale(value) ? value : DEFAULT_LOCALE;
  return LOCALE_PREFERENCES.find((candidate) => candidate.code === code)
    ?? LOCALES.find((candidate) => candidate.code === code) ?? LOCALES[5];
}

export function filterLocales(query: string, choices: readonly LocaleDefinition[] = LOCALE_PREFERENCES): readonly LocaleDefinition[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return choices;
  return choices.filter(({ code, nativeName }) =>
    code.toLowerCase().includes(normalized) ||
    nativeName.toLowerCase().includes(normalized)
  );
}
