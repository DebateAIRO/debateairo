"use client";

import { useEffect, useState } from "react";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import type { LocaleCode } from "@/lib/i18n/locales";
import type { MessageCatalog } from "@/lib/i18n/translate";
import consentEnglish from "@/messages/en/consent.json";

type CatalogModule = Readonly<{ default: MessageCatalog }>;
type CatalogLoader = () => Promise<CatalogModule>;

const CONSENT_CATALOG_LOADERS = Object.freeze({
  ar: () => import("@/messages/ar/consent.json"),
  bg: () => import("@/messages/bg/consent.json"),
  cs: () => import("@/messages/cs/consent.json"),
  da: () => import("@/messages/da/consent.json"),
  de: () => import("@/messages/de/consent.json"),
  el: () => import("@/messages/el/consent.json"),
  en: () => import("@/messages/en/consent.json"),
  es: () => import("@/messages/es/consent.json"),
  et: () => import("@/messages/et/consent.json"),
  fi: () => import("@/messages/fi/consent.json"),
  fr: () => import("@/messages/fr/consent.json"),
  ga: () => import("@/messages/ga/consent.json"),
  he: () => import("@/messages/he/consent.json"),
  hi: () => import("@/messages/hi/consent.json"),
  hr: () => import("@/messages/hr/consent.json"),
  hu: () => import("@/messages/hu/consent.json"),
  id: () => import("@/messages/id/consent.json"),
  it: () => import("@/messages/it/consent.json"),
  ja: () => import("@/messages/ja/consent.json"),
  ko: () => import("@/messages/ko/consent.json"),
  lt: () => import("@/messages/lt/consent.json"),
  lv: () => import("@/messages/lv/consent.json"),
  mt: () => import("@/messages/mt/consent.json"),
  nl: () => import("@/messages/nl/consent.json"),
  pl: () => import("@/messages/pl/consent.json"),
  pt: () => import("@/messages/pt/consent.json"),
  ro: () => import("@/messages/ro/consent.json"),
  ru: () => import("@/messages/ru/consent.json"),
  sk: () => import("@/messages/sk/consent.json"),
  sl: () => import("@/messages/sl/consent.json"),
  sv: () => import("@/messages/sv/consent.json"),
  tr: () => import("@/messages/tr/consent.json"),
  uk: () => import("@/messages/uk/consent.json"),
  vi: () => import("@/messages/vi/consent.json"),
  zh: () => import("@/messages/zh/consent.json")
} satisfies Readonly<Record<LocaleCode, CatalogLoader>>);

const catalogCache: Partial<Record<LocaleCode, MessageCatalog>> = { en: consentEnglish };

export function useConsentCatalog(): MessageCatalog {
  const { locale } = useChromeI18n();
  const [catalog, setCatalog] = useState<MessageCatalog>(catalogCache[locale] ?? consentEnglish);

  useEffect(() => {
    let active = true;
    const cached = catalogCache[locale];
    if (cached !== undefined) {
      setCatalog(cached);
      return () => {
        active = false;
      };
    }
    setCatalog(consentEnglish);
    void CONSENT_CATALOG_LOADERS[locale]().then((loaded) => {
      catalogCache[locale] = loaded.default;
      if (active) setCatalog(loaded.default);
    }).catch(() => {
      // Consent controls retain usable English copy if a locale chunk cannot load.
    });
    return () => {
      active = false;
    };
  }, [locale]);

  return catalog;
}
