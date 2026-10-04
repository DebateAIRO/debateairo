import { dobOrderForLocale, type DobErrorCode, type DobOrder } from "@debateai/kernel";
import { getLocale } from "../i18n/locales.js";
import { t, type MessageCatalog } from "../i18n/translate.js";

/** How the date-of-birth widget reads the UI locale: field order, script direction and Intl tag. */
export type DobLocale = Readonly<{ tag: string; order: DobOrder; dir: "ltr" | "rtl" }>;

/**
 * Explicit US/UK preferences determine formatting. Legacy `en` cookies retain
 * their Accept-Language behavior: US browsers get MDY, other English readers DMY.
 */
export function resolveDobLocale(uiLocale: string, acceptLanguage: string | null = null): DobLocale {
  const definition = getLocale(uiLocale);
  let tag: string = definition.code;
  if (definition.code === "en") {
    const englishTag = (acceptLanguage ?? "")
      .split(",")
      .map((entry) => entry.split(";")[0]!.trim())
      .find((entry) => /^en(-|$)/i.test(entry));
    tag = englishTag !== undefined && /^en-us$/i.test(englishTag) ? "en-US" : "en-GB";
  }
  return { tag, order: dobOrderForLocale(tag), dir: definition.dir };
}

/** The validity line for a failed check, in the widget's field order. */
export function dobErrorMessage(catalog: MessageCatalog, code: DobErrorCode, order: DobOrder): string {
  const monthFirst = order[0] === "m";
  switch (code) {
    case "incomplete":
      return monthFirst ? t(catalog, "auth.dob.incompleteMonthFirst") : t(catalog, "auth.dob.incomplete");
    case "impossible":
      return monthFirst ? t(catalog, "auth.dob.impossibleMonthFirst") : t(catalog, "auth.dob.impossible");
    case "before":
      return t(catalog, "auth.dob.beforeMinYear");
    case "future":
      return t(catalog, "auth.dob.future");
  }
}
