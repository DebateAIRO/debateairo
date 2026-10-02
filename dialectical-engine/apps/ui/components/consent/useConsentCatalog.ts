"use client";

import { createContext, createElement, useContext, type ReactNode } from "react";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import type { MessageCatalog } from "@/lib/i18n/translate";
import { inventoryCopy } from "@/lib/legal/pages";
import consentMessages from "@/messages/en/consent.json";
import legalMessages from "@/messages/en/legal.json";

/**
 * The English fallback: the consent catalogue plus the 24 inventory strings of the legal
 * catalogue (kind, purpose and lifetime of the eight items), the same projection the root
 * layout merges for every locale (D-28), so the storage card reads one string per item.
 * Built on first use, inside a function: `lib/i18n/catalogThreading.test.mjs` forbids a
 * module-level constant built from an English catalogue.
 */
let englishFallback: MessageCatalog | null = null;
function englishConsentCatalog(): MessageCatalog {
  englishFallback ??= Object.freeze({ ...consentMessages, ...inventoryCopy(legalMessages) });
  return englishFallback;
}

/**
 * The reader's `consent` catalogue, SERVED WITH THE SERVER RENDER (FIX-DEBATE-
 * CATALOGS follow-up 3). The root layout loads the locale's namespace next to
 * chrome/debateViews/support and hands it down here, so the consent bar, the
 * storage card, the settings panel and the legal modal paint in the
 * reader's locale on their very first render. There is no client-side chunk
 * load, and therefore no English copy shown while one is in flight.
 */
const ConsentCatalogContext = createContext<MessageCatalog | null>(null);

export function ConsentCatalogProvider({
  catalog,
  children
}: {
  catalog: MessageCatalog;
  children: ReactNode;
}) {
  return createElement(ConsentCatalogContext.Provider, { value: catalog }, children);
}

export function useConsentCatalog(): MessageCatalog {
  const served = useContext(ConsentCatalogContext);
  const { locale } = useChromeI18n();
  if (served !== null) return served;
  const consentEnglish = englishConsentCatalog();
  // The English catalogue is the English path only: an "en" reader outside the
  // provider (isolated component renders) reads it directly.
  if (locale === "en") return consentEnglish;
  throw new Error(
    `useConsentCatalog: no consent catalogue was served for "${locale}"; mount ConsentCatalogProvider with the locale's consent namespace`
  );
}
