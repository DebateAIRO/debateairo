import { cookies } from "next/headers";
import { ExportDownloadClient } from "@/components/ExportDownloadClient";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export default async function ExportPage() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "settings");
  return <ExportDownloadClient catalog={catalog} />;
}
