/**
 * The 35 interface locales of apps/ui/lib/i18n/locales.ts, repeated because a package never imports the UI.
 * tests/unit/mail-templates-catalogue.test.ts pins the two lists equal.
 */
export const MAIL_LOCALES = Object.freeze([
  "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "ga", "it", "lv", "lt", "mt", "pl",
  "pt", "ro", "ru", "sk", "sl", "es", "sv", "uk", "zh", "hi", "id", "ja", "ko", "vi", "ar", "he", "tr"
] as const);

export type MailLocale = (typeof MAIL_LOCALES)[number];

const RIGHT_TO_LEFT: ReadonlySet<string> = new Set(["ar", "he"]);

export function mailLocaleOf(value: string): MailLocale {
  return (MAIL_LOCALES as readonly string[]).includes(value) ? value as MailLocale : "en";
}

export function mailDirectionOf(locale: MailLocale): "ltr" | "rtl" {
  return RIGHT_TO_LEFT.has(locale) ? "rtl" : "ltr";
}
