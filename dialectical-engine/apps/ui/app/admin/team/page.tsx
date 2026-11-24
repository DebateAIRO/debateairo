import { cookies } from "next/headers";
import { StaffAccessPanel } from "../../../components/StaffAccessPanel";
import { TeamLimitPanel } from "../../../components/TeamLimitPanel";
import { TeamAllowancePanel } from "../../../components/TeamAllowancePanel";
import { PreviewBuyersPanel } from "../../../components/PreviewBuyersPanel";
import { RecoveryPermitsPanel } from "../../../components/RecoveryPermitsPanel";
import { PublicReviewPanel } from "../../../components/PublicReviewPanel";
import { isLocale, LOCALE_COOKIE } from "../../../lib/i18n/locales";
import staffEnglish from "../../../messages/en/staff.json";
import staffRomanian from "../../../messages/ro/staff.json";
export default async function TeamPage() {
    const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
    const locale = isLocale(requested) ? requested : "en";
    return <div className="screen scroll setScreen"><div className="setBody"><TeamLimitPanel locale={locale} catalog={locale === "ro" ? staffRomanian : staffEnglish}/><PreviewBuyersPanel locale={locale} catalog={locale === "ro" ? staffRomanian : staffEnglish}/><RecoveryPermitsPanel locale={locale} catalog={locale === "ro" ? staffRomanian : staffEnglish}/><TeamAllowancePanel locale={locale} catalog={locale === "ro" ? staffRomanian : staffEnglish}/><PublicReviewPanel catalog={locale === "ro" ? staffRomanian : staffEnglish}/><StaffAccessPanel locale={locale} catalog={locale === "ro" ? staffRomanian : staffEnglish}/></div></div>;
}
