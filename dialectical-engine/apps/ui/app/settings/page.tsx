import { cookies } from "next/headers";
import { SettingsPageClient } from "@/components/SettingsPageClient";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export default async function SettingsPage() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [catalog, newDebateCatalog] = await Promise.all([
    loadNamespace(locale, "settings"),
    loadNamespace(locale, "newDebate")
  ]);
  return <SettingsPageClient catalog={catalog} locale={locale} newDebateCatalog={newDebateCatalog} />;
}
