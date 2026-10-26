import { cookies, headers } from "next/headers";
import NotFound from "../../not-found";
import { RemovalNoticeTake } from "@/components/CheckRemovalNotice";
import { SupportWidget } from "@/components/support/SupportWidget";
import { readCrisisCountryHint } from "@/lib/crisisLines";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { readSessionCookie } from "@/lib/serverApi";

/* A debate address that answers "not found" keeps the app's 404. S01-R39: when the end check deleted one of this
   reader's debates, its notice shows here once. The notice is the account's and names no debate, so this page takes it
   for any debate address it answers; it is taken from the browser, which sends the CSRF pair a signed-in POST needs.
   The support chat stays reachable beside it, as on the debate page. */
export default async function DebateNotFound() {
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const page = await NotFound();
  if (readSessionCookie(cookieStore) === null) return page;
  return <>
    {page}
    <RemovalNoticeTake catalog={await loadNamespace(locale, "home")} locale={locale}
      countryHint={readCrisisCountryHint(await headers())} closeTo="/?tab=yours" />
    <SupportWidget />
  </>;
}
