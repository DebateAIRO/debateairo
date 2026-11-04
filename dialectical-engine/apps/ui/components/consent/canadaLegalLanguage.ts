import type { CatalogLocaleCode } from "@/lib/i18n/locales";

/**
 * Canada at sign-up (owner ruling, 2 November 2026). Quebec's French-language law says a standard contract is
 * offered in French first, and sign-up never asks for the province, so a person who picks Canada in the Region
 * field reads the Terms of Service and the Privacy Policy in French whatever the page language, and may switch
 * both to English. The two documents always share one language: the server checks both pairs under one locale.
 */
export const CANADA_COUNTRY = "CA";

export type CanadaLegalLocale = Extract<CatalogLocaleCode, "fr" | "en">;

/** The documents' language while Region says Canada (French until the person switches); for any other country, none. */
export function canadaLegalLocale(country: string | null, choice: CanadaLegalLocale): CanadaLegalLocale | undefined {
  return country === CANADA_COUNTRY ? choice : undefined;
}

/** The switch at the top of a document: its name, the language that name is written in, and what pressing it does. */
export type LegalLanguageSwitch = Readonly<{ lang: CanadaLegalLocale; name: string; onSwitch: () => void }>;

/* Fixed text, each written in the language it leads to, the way the language switcher names languages (LOCALES'
   nativeName): never translated into the page language. */
const SWITCH_NAMES: Readonly<Record<CanadaLegalLocale, string>> = Object.freeze({
  en: "Continue in English",
  fr: "Lire en français"
});

export function canadaLegalSwitch(current: CanadaLegalLocale, choose: (next: CanadaLegalLocale) => void): LegalLanguageSwitch {
  const next: CanadaLegalLocale = current === "fr" ? "en" : "fr";
  return Object.freeze({ lang: next, name: SWITCH_NAMES[next], onSwitch: () => choose(next) });
}
