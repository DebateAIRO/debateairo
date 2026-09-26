import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
import { t } from "@/lib/i18n/translate";

/* Turn 7 · 7c "Fleet". The refusal is the screen: no deployment request is
   issued and no worker state is inferred from a refused operator response. */
export default async function WorkersPage() {
  const requestedLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requestedLocale) ? requestedLocale : "en";
  const catalog = await loadNamespace(locale, "settings");
  return (
    <div className="screen scroll fleetScreen">
      <div className="fleetCard">
        <p className="fleetEyebrow">{t(catalog, "settings.workers.eyebrow")}</p>
        <h1 className="fleetTitle">{t(catalog, "settings.workers.title")}</h1>
        <div className="fleetPanel">
          <div className="fleetPanelCore">
            <span className="fleetAccent" aria-hidden="true" />
            <p className="fleetNoticeTitle">{t(catalog, "settings.workers.operatorOnly")}</p>
            <p className="fleetNoticeBody">{t(catalog, "settings.workers.body")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
