import chromeEnglish from "../../messages/en/chrome.json" with { type: "json" };
import homeEnglish from "../../messages/en/home.json" with { type: "json" };
import newDebateEnglish from "../../messages/en/newDebate.json" with { type: "json" };
import supportEnglish from "../../messages/en/support.json" with { type: "json" };
import timeEnglish from "../../messages/en/time.json" with { type: "json" };

export type MessageCatalog = Readonly<Record<string, string>>;
export type TranslationVariables = Readonly<Record<string, string | number>>;

const ENGLISH_MESSAGES: MessageCatalog = Object.freeze({
  ...chromeEnglish,
  ...homeEnglish,
  ...newDebateEnglish,
  ...supportEnglish,
  ...timeEnglish
});

function interpolate(message: string, vars: TranslationVariables = {}): string {
  return message.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (placeholder, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : placeholder
  );
}

export function t(
  catalog: MessageCatalog | null | undefined,
  key: string,
  vars?: TranslationVariables
): string {
  return interpolate(catalog?.[key] ?? ENGLISH_MESSAGES[key] ?? key, vars);
}

export function tPlural(
  catalog: MessageCatalog | null | undefined,
  key: string,
  count: number,
  locale: string,
  vars: TranslationVariables = {}
): string {
  let category: Intl.LDMLPluralRule;
  try {
    category = new Intl.PluralRules(locale).select(count);
  } catch {
    category = new Intl.PluralRules("en").select(count);
  }
  const selectedKey = `${key}.${category}`;
  const otherKey = `${key}.other`;
  const message = catalog?.[selectedKey]
    ?? ENGLISH_MESSAGES[selectedKey]
    ?? catalog?.[otherKey]
    ?? ENGLISH_MESSAGES[otherKey]
    ?? otherKey;
  return interpolate(message, { ...vars, count });
}

/**
 * The language tag a date or time is written in. Owner's answer to question 5 (5 Nov 2026, B, and its follow-ups):
 * every English page writes the day first on the 24-hour clock ("5 November 2026", "1 December", "5 Nov 2026, 14:30"),
 * whichever English the reader chose (plain, United States or United Kingdom), so English takes the British form.
 * Every other language keeps its own order.
 */
export function dateLocale(locale: string): string {
  return /^en(?:-|$)/i.test(locale) ? "en-GB" : locale;
}

export function formatDate(
  locale: string,
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat(dateLocale(locale), options).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat(dateLocale("en"), options).format(new Date(value));
  }
}

export function formatNumber(
  locale: string,
  value: number,
  options?: Intl.NumberFormatOptions
): string {
  try {
    return new Intl.NumberFormat(locale, options).format(value);
  } catch {
    return new Intl.NumberFormat("en", options).format(value);
  }
}
