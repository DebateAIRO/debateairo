import chromeEnglish from "../../messages/en/chrome.json" with { type: "json" };
import homeEnglish from "../../messages/en/home.json" with { type: "json" };
import newDebateEnglish from "../../messages/en/newDebate.json" with { type: "json" };
import timeEnglish from "../../messages/en/time.json" with { type: "json" };

export type MessageCatalog = Readonly<Record<string, string>>;
export type TranslationVariables = Readonly<Record<string, string | number>>;

const ENGLISH_MESSAGES: MessageCatalog = Object.freeze({
  ...chromeEnglish,
  ...homeEnglish,
  ...newDebateEnglish,
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

export function formatDate(
  locale: string,
  value: string | number | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat(locale, options).format(new Date(value));
  } catch {
    return new Intl.DateTimeFormat("en", options).format(new Date(value));
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
