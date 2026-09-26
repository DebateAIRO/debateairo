import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";

export default async function LoadingDebate() {
  const cookieStore = await cookies();
  const requestedLocale = cookieStore.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "debateChrome");

  return (
    <div className="screen scroll">
      <div className="screenInner narrow" aria-live="polite" aria-busy="true">
        <p className="eyebrow">{t(catalog, "debateChrome.loading.accepted")}</p>
        <h1 className="display md">{t(catalog, "debateChrome.loading.starting")}</h1>
        <p className="muted">{t(catalog, "debateChrome.loading.connecting")}</p>
      </div>
    </div>
  );
}
