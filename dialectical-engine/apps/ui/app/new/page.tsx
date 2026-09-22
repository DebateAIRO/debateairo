import { cookies } from "next/headers";
import NewDebatePageClient from "./NewDebatePageClient";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export default async function NewDebatePage() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [catalog, homeCatalog] = await Promise.all([
    loadNamespace(locale, "newDebate"),
    loadNamespace(locale, "home")
  ]);
  return <NewDebatePageClient catalog={catalog} homeCatalog={homeCatalog} />;
}
