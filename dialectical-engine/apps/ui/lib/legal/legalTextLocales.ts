import { CANADA_LEGAL_LOCALES } from "../../components/consent/canadaLegalLanguage.js";
import {
  catalogLocale,
  isCatalogLocale,
  OFFERED_LOCALE_CODES,
  type CatalogLocaleCode,
  type LocaleCode
} from "../i18n/locales.js";

/**
 * The languages whose Terms of Service and Privacy Policy a person can be shown: the offered interface languages, and
 * the languages a person who picks Canada at sign-up reads them in (French first). Only these texts are held to the
 * current English text and archived at release. The release scripts keep their own copy of this list
 * (RELEASE_LEGAL_LOCALES in apps/ui/scripts/generate-legal-data.mjs, which the site does not load), and
 * tests/unit/legal-release-languages.test.ts holds the two equal. The other catalogue languages' drafts carry the
 * current version number over older text that nobody checked, so no page may show them as the text in force.
 */
export const LEGAL_TEXT_LOCALE_CODES: readonly CatalogLocaleCode[] = Object.freeze(
  [...new Set<CatalogLocaleCode>([...OFFERED_LOCALE_CODES, ...CANADA_LEGAL_LOCALES])].sort()
);

/** Whether a value names a language whose legal texts a person can be shown, a regional English choice included. */
export function isLegalTextLocale(value: unknown): value is LocaleCode {
  return isCatalogLocale(value) && LEGAL_TEXT_LOCALE_CODES.includes(catalogLocale(value));
}
