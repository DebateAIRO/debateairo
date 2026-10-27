import { cookies } from "next/headers";
import { V4ReportClient } from "@/components/v4/V4ReportClient";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { parseReadingLevel } from "@/lib/v4/storage";

export const dynamic = "force-dynamic";

/**
 * V4 initial (2026-10-28), D5: the report of one debate; `id` is a run id or an answer id, as on the map page. Fix wave
 * 1, Decision A: the reading level comes from the address (`?level=`), never from the browser.
 */
export default async function V4ReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  // newDebate: AuthGate and its legal-accept screen read newDebate.* keys.
  const [catalog, newDebateCatalog] = await Promise.all([
    loadNamespace(locale, "v4"),
    loadNamespace(locale, "newDebate")
  ]);
  return (
    <V4ReportClient
      id={id}
      locale={locale}
      initialLevel={parseReadingLevel(query.level)}
      catalog={catalog}
      newDebateCatalog={newDebateCatalog}
    />
  );
}
