export const SUPPORT_LOCALES = Object.freeze([
  "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu",
  "ga", "it", "lv", "lt", "mt", "pl", "pt", "ro", "ru", "sk", "sl", "es",
  "sv", "uk", "zh", "hi", "id", "ja", "ko", "vi", "ar", "he", "tr",
] as const);

export type SupportLanguage = (typeof SUPPORT_LOCALES)[number];

const SUPPORT_LOCALE_CODES: ReadonlySet<string> = new Set(SUPPORT_LOCALES);

const SUPPORT_NATIVE_NAMES: Readonly<Record<SupportLanguage, string>> = Object.freeze({
  bg: "Български",
  hr: "Hrvatski",
  cs: "Čeština",
  da: "Dansk",
  nl: "Nederlands",
  en: "English",
  et: "Eesti",
  fi: "Suomi",
  fr: "Français",
  de: "Deutsch",
  el: "Ελληνικά",
  hu: "Magyar",
  ga: "Gaeilge",
  it: "Italiano",
  lv: "Latviešu",
  lt: "Lietuvių",
  mt: "Malti",
  pl: "Polski",
  pt: "Português",
  ro: "Română",
  ru: "Русский",
  sk: "Slovenčina",
  sl: "Slovenščina",
  es: "Español",
  sv: "Svenska",
  uk: "Українська",
  zh: "中文",
  hi: "हिन्दी",
  id: "Bahasa Indonesia",
  ja: "日本語",
  ko: "한국어",
  vi: "Tiếng Việt",
  ar: "العربية",
  he: "עברית",
  tr: "Türkçe",
});

const ENGLISH_LANGUAGE_NAMES = new Intl.DisplayNames("en", { type: "language" });

export function isSupportLanguage(value: unknown): value is SupportLanguage {
  return typeof value === "string" && SUPPORT_LOCALE_CODES.has(value);
}

export function supportLocaleNames(code: SupportLanguage): Readonly<{
  english: string;
  native: string;
}> {
  const english = ENGLISH_LANGUAGE_NAMES.of(code);
  if (english === undefined) throw new TypeError("SUPPORT_LANGUAGE_NAME_UNAVAILABLE");
  return Object.freeze({ english, native: SUPPORT_NATIVE_NAMES[code] });
}
