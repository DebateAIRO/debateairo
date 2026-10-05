import "server-only";

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE, type LocaleCode } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t, type MessageCatalog } from "@/lib/i18n/translate";
import { LEGAL_PAGES, type LegalPageKey } from "./pages";

const PRODUCT_NAME = "Dialectical Engine";

export type LegalPageCatalogs = Readonly<{
  locale: LocaleCode;
  chromeCatalog: MessageCatalog;
  legalCatalog: MessageCatalog;
}>;

/** The reader's locale (the layout's rule: the locale cookie, else English) and both catalogues. */
export async function loadLegalPageCatalogs(explicitLocale?: string): Promise<LegalPageCatalogs> {
  const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: LocaleCode = isLocale(explicitLocale) ? explicitLocale : isLocale(requested) ? requested : "en";
  const [chromeCatalog, legalCatalog] = await Promise.all([
    loadNamespace(locale, "chrome"),
    loadNamespace(locale, "legal")
  ]);
  return { locale, chromeCatalog, legalCatalog };
}

/** `<page label> · Dialectical Engine`, in the reader's locale. */
export async function legalPageMetadata(key: LegalPageKey): Promise<Metadata> {
  const { chromeCatalog, legalCatalog } = await loadLegalPageCatalogs();
  const labelKey = LEGAL_PAGES.find((page) => page.key === key)?.labelKey ?? "chrome.legalPages";
  return {
    title: t(legalCatalog, "legal.metaTitle", { page: t(chromeCatalog, labelKey), product: PRODUCT_NAME })
  };
}
