"use client";

import { useContext, useEffect, useState } from "react";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import type { LocaleCode } from "@/lib/i18n/locales";
import type { LegalDocument, LegalDocumentKey } from "@/lib/legalDocument";
import { PRIVACY_POLICY } from "@/lib/privacyPolicy";
import { TERMS_OF_SERVICE } from "@/lib/termsOfService";
import { LegalDocumentsContext } from "./LegalDocumentsProvider";

const ENGLISH_DOCUMENTS = Object.freeze({
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_SERVICE
});

const loadPrivacy = (locale: LocaleCode): Promise<LegalDocument> =>
  import(`../../lib/legal/${locale}/privacyPolicy.ts`).then(({ PRIVACY_POLICY }) => PRIVACY_POLICY);
const loadTerms = (locale: LocaleCode): Promise<LegalDocument> =>
  import(`../../lib/legal/${locale}/termsOfService.ts`).then(({ TERMS_OF_SERVICE }) => TERMS_OF_SERVICE);

const LEGAL_DOCUMENT_LOADERS = Object.freeze({
  ar: {
    privacy: () => loadPrivacy("ar"),
    terms: () => loadTerms("ar")
  },
  bg: {
    privacy: () => loadPrivacy("bg"),
    terms: () => loadTerms("bg")
  },
  cs: {
    privacy: () => loadPrivacy("cs"),
    terms: () => loadTerms("cs")
  },
  da: {
    privacy: () => loadPrivacy("da"),
    terms: () => loadTerms("da")
  },
  de: {
    privacy: () => loadPrivacy("de"),
    terms: () => loadTerms("de")
  },
  el: {
    privacy: () => loadPrivacy("el"),
    terms: () => loadTerms("el")
  },
  en: {
    privacy: async () => PRIVACY_POLICY,
    terms: async () => TERMS_OF_SERVICE
  },
  es: {
    privacy: () => loadPrivacy("es"),
    terms: () => loadTerms("es")
  },
  et: {
    privacy: () => loadPrivacy("et"),
    terms: () => loadTerms("et")
  },
  fi: {
    privacy: () => loadPrivacy("fi"),
    terms: () => loadTerms("fi")
  },
  fr: {
    privacy: () => loadPrivacy("fr"),
    terms: () => loadTerms("fr")
  },
  ga: {
    privacy: () => loadPrivacy("ga"),
    terms: () => loadTerms("ga")
  },
  he: {
    privacy: () => loadPrivacy("he"),
    terms: () => loadTerms("he")
  },
  hi: {
    privacy: () => loadPrivacy("hi"),
    terms: () => loadTerms("hi")
  },
  hr: {
    privacy: () => loadPrivacy("hr"),
    terms: () => loadTerms("hr")
  },
  hu: {
    privacy: () => loadPrivacy("hu"),
    terms: () => loadTerms("hu")
  },
  id: {
    privacy: () => loadPrivacy("id"),
    terms: () => loadTerms("id")
  },
  it: {
    privacy: () => loadPrivacy("it"),
    terms: () => loadTerms("it")
  },
  ja: {
    privacy: () => loadPrivacy("ja"),
    terms: () => loadTerms("ja")
  },
  ko: {
    privacy: () => loadPrivacy("ko"),
    terms: () => loadTerms("ko")
  },
  lt: {
    privacy: () => loadPrivacy("lt"),
    terms: () => loadTerms("lt")
  },
  lv: {
    privacy: () => loadPrivacy("lv"),
    terms: () => loadTerms("lv")
  },
  mt: {
    privacy: () => loadPrivacy("mt"),
    terms: () => loadTerms("mt")
  },
  nl: {
    privacy: () => loadPrivacy("nl"),
    terms: () => loadTerms("nl")
  },
  pl: {
    privacy: () => loadPrivacy("pl"),
    terms: () => loadTerms("pl")
  },
  pt: {
    privacy: () => loadPrivacy("pt"),
    terms: () => loadTerms("pt")
  },
  ro: {
    privacy: () => loadPrivacy("ro"),
    terms: () => loadTerms("ro")
  },
  ru: {
    privacy: () => loadPrivacy("ru"),
    terms: () => loadTerms("ru")
  },
  sk: {
    privacy: () => loadPrivacy("sk"),
    terms: () => loadTerms("sk")
  },
  sl: {
    privacy: () => loadPrivacy("sl"),
    terms: () => loadTerms("sl")
  },
  sv: {
    privacy: () => loadPrivacy("sv"),
    terms: () => loadTerms("sv")
  },
  tr: {
    privacy: () => loadPrivacy("tr"),
    terms: () => loadTerms("tr")
  },
  uk: {
    privacy: () => loadPrivacy("uk"),
    terms: () => loadTerms("uk")
  },
  vi: {
    privacy: () => loadPrivacy("vi"),
    terms: () => loadTerms("vi")
  },
  zh: {
    privacy: () => loadPrivacy("zh"),
    terms: () => loadTerms("zh")
  }
} satisfies Readonly<
  Record<LocaleCode, Readonly<Record<LegalDocumentKey, () => Promise<LegalDocument>>>>
>);

const documentCache: Partial<Record<LocaleCode, Partial<Record<LegalDocumentKey, LegalDocument>>>> = {
  en: ENGLISH_DOCUMENTS
};

export function useLegalDocument(key: LegalDocumentKey): LegalDocument {
  const { locale } = useChromeI18n();
  const provided = useContext(LegalDocumentsContext);
  const serverDocument = provided?.locale === locale ? provided[key] : undefined;
  const [document, setDocument] = useState<LegalDocument>(
    serverDocument ?? documentCache[locale]?.[key] ?? ENGLISH_DOCUMENTS[key]
  );

  useEffect(() => {
    let active = true;
    if (serverDocument !== undefined) {
      documentCache[locale] = { ...documentCache[locale], [key]: serverDocument };
      setDocument(serverDocument);
      return () => {
        active = false;
      };
    }
    const cached = documentCache[locale]?.[key];
    if (cached !== undefined) {
      setDocument(cached);
      return () => {
        active = false;
      };
    }
    setDocument(ENGLISH_DOCUMENTS[key]);
    void LEGAL_DOCUMENT_LOADERS[locale][key]().then((loaded) => {
      documentCache[locale] = { ...documentCache[locale], [key]: loaded };
      if (active) setDocument(loaded);
    }).catch(() => {
      // Legal documents retain usable English content if a locale chunk cannot load.
    });
    return () => {
      active = false;
    };
  }, [key, locale, serverDocument]);

  return serverDocument ?? document;
}
