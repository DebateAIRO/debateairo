import { cookies, headers } from "next/headers";
import { V4AskClient } from "@/components/v4/V4AskClient";
import { readCrisisCountryHint } from "@/lib/crisisLines";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { parseReadingLevel } from "@/lib/v4/storage";

export const dynamic = "force-dynamic";

/** A topic handed in by a link (`/v4?topic=…`) pre-fills the question; anything longer is cut, never refused. */
const TOPIC_MAX = 4000;

/** One value of a search param (a repeated param keeps its first value). */
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/*
 * V4 initial (spec "/v4 — D1 Ask + D2"): the ask page, beside V3's /new. Locale exactly as app/new/page.tsx. The
 * reading level comes from the address (`?level=`, FIXES Decision A: V4 stores nothing in the browser).
 */
export default async function V4AskPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ topic?: string | string[]; level?: string | string[] }>;
}) {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [catalog, homeCatalog, newDebateCatalog, billingCatalog] = await Promise.all([
    loadNamespace(locale, "v4"),
    loadNamespace(locale, "home"),
    loadNamespace(locale, "newDebate"),
    loadNamespace(locale, "billing")
  ]);
  const query = await searchParams;
  const topic = firstParam(query.topic);
  const initialQuestion = typeof topic === "string" ? topic.slice(0, TOPIC_MAX) : "";
  return (
    <V4AskClient
      catalog={catalog}
      homeCatalog={homeCatalog}
      newDebateCatalog={newDebateCatalog}
      billingCatalog={billingCatalog}
      locale={locale}
      crisisCountryHint={readCrisisCountryHint(await headers())}
      initialQuestion={initialQuestion}
      initialLevel={parseReadingLevel(firstParam(query.level))}
    />
  );
}
