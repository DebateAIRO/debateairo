import { cookies } from "next/headers";
import NewDebatePageClient from "./NewDebatePageClient";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export default async function NewDebatePage() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  // chrome is served for the AI notice's block label (chrome.aiTransparency), so
  // any variant of it on this page reads the reader's locale (re-check 2, R2).
  const [catalog, homeCatalog, chromeCatalog] = await Promise.all([
    loadNamespace(locale, "newDebate"),
    loadNamespace(locale, "home"),
    loadNamespace(locale, "chrome")
  ]);
  return <NewDebatePageClient catalog={catalog} homeCatalog={homeCatalog} chromeCatalog={chromeCatalog} />;
}
