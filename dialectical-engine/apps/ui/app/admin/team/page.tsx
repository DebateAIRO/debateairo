import { cookies } from "next/headers";
import { ThreatReportsLink } from "../../../components/ThreatReportsLink";
import { StaffAccessPanel } from "../../../components/StaffAccessPanel";
import { isLocale, LOCALE_COOKIE } from "../../../lib/i18n/locales";
import staffEnglish from "../../../messages/en/staff.json";
import staffRomanian from "../../../messages/ro/staff.json";
export default async function TeamPage() {
    const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
    const locale = isLocale(requested) ? requested : "en";
    return <div className="screen scroll setScreen"><div className="setBody"><ThreatReportsLink catalog={locale === "ro" ? staffRomanian : staffEnglish}/><StaffAccessPanel locale={locale} catalog={locale === "ro" ? staffRomanian : staffEnglish}/></div></div>;
}
