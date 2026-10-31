import { cookies, headers } from "next/headers";
import { V4DebateClient } from "@/components/v4/V4DebateClient";
import { readCrisisCountryHint } from "@/lib/crisisLines";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { parseReadingLevel } from "@/lib/v4/storage";

export const dynamic = "force-dynamic";

/*
 * V4 initial (2026-10-28), D3/D4/D6/D7: the map page. Every read is asker-scoped, so the server only picks the
 * locale, the catalogues and the reading level from the address (fix wave 1, Decision A: `?level=`, nothing stored in
 * the browser); the client loads the debate behind AuthGate (as the classic page does). W4-6: `?path=` (a link back
 * from a dig, or a part of a dig's trail) names the path the panel opens at first.
 */

/** A path id as the map names it (a story position, "#2" on a repeat); anything else opens the question itself. */
const PATH_PARAM = /^[A-Za-z0-9_.:#-]{1,160}$/u;

function parsePath(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value;
  return typeof raw === "string" && PATH_PARAM.test(raw) ? raw : null;
}
export default async function V4DebatePage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const initialLevel = parseReadingLevel(query.level);
  const initialPath = parsePath(query.path);
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
      initialPath={initialPath}
      initialLevel={initialLevel}
      catalog={catalog}
      homeCatalog={homeCatalog}
      newDebateCatalog={newDebateCatalog}
      billingCatalog={billingCatalog}
      locale={locale}
      crisisCountryHint={readCrisisCountryHint(await headers())}
    />
  );
}
