import { cookies, headers } from "next/headers";
import { V4DebateClient } from "@/components/v4/V4DebateClient";
import { readCrisisCountryHint } from "@/lib/crisisLines";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/*
 * V4 initial (2026-10-28), D3/D4/D6/D7: the map page. Every read is asker-scoped, so the server only picks the
 * locale and the catalogues; the client loads the debate behind AuthGate (as the classic page does).
 */
export default async function V4DebatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [catalog, homeCatalog, newDebateCatalog, billingCatalog] = await Promise.all([
    loadNamespace(locale, "v4"),
    loadNamespace(locale, "home"),
    loadNamespace(locale, "newDebate"),
    loadNamespace(locale, "billing")
  ]);
  return (
    <V4DebateClient
      id={id}
      catalog={catalog}
      homeCatalog={homeCatalog}
      newDebateCatalog={newDebateCatalog}
      billingCatalog={billingCatalog}
      locale={locale}
      crisisCountryHint={readCrisisCountryHint(await headers())}
    />
  );
}
