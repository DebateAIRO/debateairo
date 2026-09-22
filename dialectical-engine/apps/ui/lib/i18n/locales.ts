export const LOCALE_COOKIE = "debateai.locale";
export const DEFAULT_LOCALE = "en";

export type LocaleTier = "EUROPE" | "ASIA" | "MIDDLE EAST";
export type LocaleDirection = "ltr" | "rtl";

export type LocaleDefinition = Readonly<{
  code: string;
  nativeName: string;
  flag: string;
  tier: LocaleTier;
  dir: LocaleDirection;
}>;

const locale = <Code extends string, Name extends string, Flag extends string, Tier extends LocaleTier>(
  code: Code,
  nativeName: Name,
  flag: Flag,
  tier: Tier,
  dir: LocaleDirection = "ltr"
) => Object.freeze({ code, nativeName, flag, tier, dir });

export const LOCALES = Object.freeze([
  locale("bg", "Български", "🇧🇬", "EUROPE"),
  locale("hr", "Hrvatski", "🇭🇷", "EUROPE"),
  locale("cs", "Čeština", "🇨🇿", "EUROPE"),
  locale("da", "Dansk", "🇩🇰", "EUROPE"),
  locale("nl", "Nederlands", "🇳🇱", "EUROPE"),
  locale("en", "English", "🇬🇧", "EUROPE"),
  locale("et", "Eesti", "🇪🇪", "EUROPE"),
  locale("fi", "Suomi", "🇫🇮", "EUROPE"),
  locale("fr", "Français", "🇫🇷", "EUROPE"),
  locale("de", "Deutsch", "🇩🇪", "EUROPE"),
  locale("el", "Ελληνικά", "🇬🇷", "EUROPE"),
  locale("hu", "Magyar", "🇭🇺", "EUROPE"),
  locale("ga", "Gaeilge", "🇮🇪", "EUROPE"),
  locale("it", "Italiano", "🇮🇹", "EUROPE"),
  locale("lv", "Latviešu", "🇱🇻", "EUROPE"),
  locale("lt", "Lietuvių", "🇱🇹", "EUROPE"),
  locale("mt", "Malti", "🇲🇹", "EUROPE"),
  locale("pl", "Polski", "🇵🇱", "EUROPE"),
  locale("pt", "Português", "🇵🇹", "EUROPE"),
  locale("ro", "Română", "🇷🇴", "EUROPE"),
  locale("ru", "Русский", "🇷🇺", "EUROPE"),
  locale("sk", "Slovenčina", "🇸🇰", "EUROPE"),
  locale("sl", "Slovenščina", "🇸🇮", "EUROPE"),
  locale("es", "Español", "🇪🇸", "EUROPE"),
  locale("sv", "Svenska", "🇸🇪", "EUROPE"),
  locale("uk", "Українська", "🇺🇦", "EUROPE"),
  locale("zh", "中文", "🇨🇳", "ASIA"),
  locale("hi", "हिन्दी", "🇮🇳", "ASIA"),
  locale("id", "Bahasa Indonesia", "🇮🇩", "ASIA"),
  locale("ja", "日本語", "🇯🇵", "ASIA"),
  locale("ko", "한국어", "🇰🇷", "ASIA"),
  locale("vi", "Tiếng Việt", "🇻🇳", "ASIA"),
  locale("ar", "العربية", "🇸🇦", "MIDDLE EAST", "rtl"),
  locale("he", "עברית", "🇮🇱", "MIDDLE EAST", "rtl"),
  locale("tr", "Türkçe", "🇹🇷", "MIDDLE EAST")
] as const);

export type LocaleCode = (typeof LOCALES)[number]["code"];

const localeCodes = new Set<string>(LOCALES.map(({ code }) => code));

export function isLocale(value: unknown): value is LocaleCode {
  return typeof value === "string" && localeCodes.has(value);
}

export function getLocale(value: unknown): LocaleDefinition {
  const code = isLocale(value) ? value : DEFAULT_LOCALE;
  return LOCALES.find((candidate) => candidate.code === code) ?? LOCALES[5];
}

export function filterLocales(query: string): readonly LocaleDefinition[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return LOCALES;
  return LOCALES.filter(({ code, nativeName }) =>
    code.toLocaleLowerCase().includes(normalized) ||
    nativeName.toLocaleLowerCase().includes(normalized)
  );
}
