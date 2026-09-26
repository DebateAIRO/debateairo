import Link from "next/link";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";

/* The app's 404 (an unknown debate id, a mistyped path), in the reader's
   locale. Next's built-in page printed "This page could not be found." in
   English for every reader (FIX-DEBATE-CATALOGS follow-up 4, review F6); the
   English sentence is kept byte for byte as `chrome.notFound`. */
export default async function NotFound() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "chrome");
  return (
    <div className="screen scroll">
      <div className="screenInner narrow">
        <h1>404</h1>
        <p className="muted" role="status">{t(catalog, "chrome.notFound")}</p>
        <Link href="/">{t(catalog, "chrome.library")}</Link>
      </div>
    </div>
  );
}
