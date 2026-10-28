import { cookies } from "next/headers";
import { PublicationReviewsPanel } from "../../../components/PublicationReviewsPanel";
import { isLocale, LOCALE_COOKIE } from "../../../lib/i18n/locales";
import staffEnglish from "../../../messages/en/staff.json";
import staffRomanian from "../../../messages/ro/staff.json";
import publicEnglish from "../../../messages/en/public.json";
import publicRomanian from "../../../messages/ro/public.json";

export default async function PublicationReviewsPage() {
  const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requested) ? requested : "en";
  return <div className="screen scroll setScreen"><div className="setBody"><PublicationReviewsPanel
    locale={locale} catalog={locale === "ro" ? staffRomanian : staffEnglish}
    publicCatalog={locale === "ro" ? publicRomanian : publicEnglish}
  /></div></div>;
}
