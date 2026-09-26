import "server-only";

import type { LocaleCode } from "@/lib/i18n/locales";
import type { LegalDocument, LegalDocumentKey } from "@/lib/legalDocument";
import { PRIVACY_POLICY } from "@/lib/privacyPolicy";
import { TERMS_OF_SERVICE } from "@/lib/termsOfService";

type LegalDocumentLoader = () => Promise<LegalDocument>;

const ENGLISH_DOCUMENTS = Object.freeze({
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_SERVICE
});

const LOADERS = Object.freeze({
  ar: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/ar/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/ar/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  bg: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/bg/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/bg/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  cs: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/cs/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/cs/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  da: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/da/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/da/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  de: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/de/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/de/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  el: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/el/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/el/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  en: {
    privacy: async () => PRIVACY_POLICY,
    terms: async () => TERMS_OF_SERVICE
  },
  es: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/es/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/es/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  et: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/et/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/et/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  fi: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/fi/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/fi/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  fr: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/fr/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/fr/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  ga: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/ga/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/ga/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  he: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/he/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/he/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  hi: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/hi/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/hi/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  hr: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/hr/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/hr/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  hu: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/hu/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/hu/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  id: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/id/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/id/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  it: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/it/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/it/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  ja: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/ja/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/ja/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  ko: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/ko/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/ko/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  lt: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/lt/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/lt/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  lv: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/lv/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/lv/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  mt: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/mt/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/mt/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  nl: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/nl/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/nl/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  pl: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/pl/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/pl/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  pt: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/pt/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/pt/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  ro: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/ro/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/ro/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  ru: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/ru/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/ru/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  sk: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/sk/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/sk/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  sl: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/sl/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/sl/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  sv: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/sv/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/sv/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  tr: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/tr/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/tr/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  uk: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/uk/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/uk/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  vi: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/vi/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/vi/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  },
  zh: {
    privacy: () => import(/* @vite-ignore */ "@/lib/legal/zh/privacyPolicy.js").then(({ PRIVACY_POLICY }) => PRIVACY_POLICY),
    terms: () => import(/* @vite-ignore */ "@/lib/legal/zh/termsOfService.js").then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE)
  }
} satisfies Readonly<Record<LocaleCode, Readonly<Record<LegalDocumentKey, LegalDocumentLoader>>>>);

export async function loadLegalDocument(
  locale: LocaleCode,
  key: LegalDocumentKey
): Promise<LegalDocument> {
  const loaders = LOADERS[locale] ?? LOADERS.en;
  try {
    return await loaders[key]();
  } catch {
    return ENGLISH_DOCUMENTS[key];
  }
}
