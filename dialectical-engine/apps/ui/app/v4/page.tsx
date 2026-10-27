import { cookies, headers } from "next/headers";
import { V4AskClient } from "@/components/v4/V4AskClient";
import { readCrisisCountryHint } from "@/lib/crisisLines";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

/** A topic handed in by a link (`/v4?topic=…`) pre-fills the question; anything longer is cut, never refused. */
const TOPIC_MAX = 4000;

/* V4 initial (spec "/v4 — D1 Ask + D2"): the ask page, beside V3's /new. Locale exactly as app/new/page.tsx. */
export default async function V4AskPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ topic?: string | string[] }>;
}) {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const [catalog, homeCatalog, newDebateCatalog, billingCatalog] = await Promise.all([
    loadNamespace(locale, "v4"),
    loadNamespace(locale, "home"),
    loadNamespace(locale, "newDebate"),
    loadNamespace(locale, "billing")
  ]);
  const topic = (await searchParams).topic;
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
    />
  );
}
