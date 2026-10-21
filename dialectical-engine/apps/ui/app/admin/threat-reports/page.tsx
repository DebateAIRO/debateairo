import { cookies } from "next/headers";
import { ThreatReportsPanel } from "../../../components/ThreatReportsPanel";
import { isLocale, LOCALE_COOKIE } from "../../../lib/i18n/locales";
import staffEnglish from "../../../messages/en/staff.json";
import staffRomanian from "../../../messages/ro/staff.json";
export default async function ThreatReportsPage() {
  const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requested) ? requested : "en";
  return <div className="screen scroll setScreen"><div className="setBody"><ThreatReportsPanel locale={locale} catalog={locale === "ro" ? staffRomanian : staffEnglish}/></div></div>;
}
