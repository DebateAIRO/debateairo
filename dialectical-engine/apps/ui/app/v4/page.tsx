import { cookies, headers } from "next/headers";
import { V4AskClient } from "@/components/v4/V4AskClient";
import { V4AllMaps } from "@/components/v4/V4AllMaps";
import { readCrisisCountryHint } from "@/lib/crisisLines";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { askAgainRunId } from "@/lib/v4/failedRun";
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
 * reading level comes from the address (`?level=`, FIXES Decision A: V4 stores nothing in the browser). `?maps=all` is
 * "All my maps" (owner pick ask-d5 B; "My questions" since the owner's third round, 5 Nov): a view of this page, so the
 * site's list of pages is unchanged.
 */
export default async function V4AskPage({
  searchParams = Promise.resolve({})
}: {
  searchParams?: Promise<{ topic?: string | string[]; level?: string | string[]; maps?: string | string[]; again?: string | string[] }>;
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
  // ask-d5 B: "All my maps" is a view of this page (`?maps=all`), signed-in only. It takes no level (the 5 Nov ruling): its
  // links carry none, and the map still uses the account's level until the run read names the debate's own.
  if (firstParam(query.maps) === "all") {
    return <V4AllMaps catalog={catalog} newDebateCatalog={newDebateCatalog} locale={locale} />;
  }
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
      // Owner review 3 Nov (wait-f11): "Ask this again" names only the debate; its words are read back from the server.
      againRunId={askAgainRunId(firstParam(query.again))}
    />
  );
}
