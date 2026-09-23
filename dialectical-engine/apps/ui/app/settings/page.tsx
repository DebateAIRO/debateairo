import { cookies } from "next/headers";
import { SettingsPageClient } from "@/components/EvaluatorDevMenu";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export default async function SettingsPage() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "settings");
  return <SettingsPageClient catalog={catalog} locale={locale} />;
}
