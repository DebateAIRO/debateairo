import type { LegalDocument, LegalDocumentKey } from "../lib/legalDocument.js";
import type { LocaleCode } from "../lib/i18n/locales.js";

export function bracketSpans(text: string): string[];
export function assertLegalLocale(input: Readonly<{
  english: LegalDocument;
  localized: LegalDocument;
  locale: LocaleCode;
  key: LegalDocumentKey;
}>): void;
