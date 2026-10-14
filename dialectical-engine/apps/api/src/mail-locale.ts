/**
 * The mail-language carrier (S01 C03; SPEC-v3 R-05 to R-09). The dropdown value (cookie `debateai.locale`) is
 * resolved once per request in `sourceFor`, which stores it on the source as `mailLocale`. Dependency-free on
 * purpose: the values are the 37 of packages/contract/src/locale.ts:9 in the same order, and the resolver test
 * pins the list against that schema.
 */

/** The cookie the browser writes (apps/ui/lib/i18n/locales.ts:1). */
export const LOCALE_COOKIE_NAME = "debateai.locale";

/** MLV: the 35 catalogue codes plus en-US and en-GB, in the order of packages/contract/src/locale.ts:9. */
export const MAIL_LOCALE_VALUES: readonly string[] = Object.freeze([
  "bg", "hr", "cs", "da", "nl", "en", "et", "fi", "fr", "de", "el", "hu", "ga", "it", "lv", "lt", "mt", "pl",
  "pt", "ro", "ru", "sk", "sl", "es", "sv", "uk", "zh", "hi", "id", "ja", "ko", "vi", "ar", "he", "tr",
  "en-US", "en-GB"
]);

const MAIL_LOCALE_SET: ReadonlySet<string> = new Set(MAIL_LOCALE_VALUES);

/** R-06: the value when it is one of the 37, otherwise `en` (an absent, malformed or old `en` value too). */
export function resolveMailLocale(value: unknown): string {
  return typeof value === "string" && MAIL_LOCALE_SET.has(value) ? value : "en";
}

/** R-07: the catalogue code of a mail-locale value; en-US and en-GB both read the English catalogue. */
export function catalogLocaleOf(mailLocale: string): string {
  return mailLocale === "en-US" || mailLocale === "en-GB" ? "en" : mailLocale;
}

/** R-06 from a Cookie header: the first occurrence of `debateai.locale` decides; absent gives `en`. */
export function mailLocaleOfCookieHeader(header: string | undefined): string {
  if (header === undefined) return "en";
  for (const member of header.split(";")) {
    const index = member.indexOf("=");
    if (index < 1) continue;
    if (member.slice(0, index).trim() !== LOCALE_COOKIE_NAME) continue;
    return resolveMailLocale(member.slice(index + 1).trim());
  }
  return "en";
}

/**
 * D-54 precedence: the value a register or resend body supplied, else the cookie, else `en`.
 * The API writes the result as the transaction setting of every mail-triggering request (R-08, R-11).
 */
export function resolveSourceMailLocale(cookieHeader: string | undefined, mailDisplayLocale: string | undefined): string {
  if (mailDisplayLocale !== undefined) return resolveMailLocale(mailDisplayLocale);
  return mailLocaleOfCookieHeader(cookieHeader);
}
