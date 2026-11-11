import { cookies } from "next/headers";
import { ModerationNoticesPageClient } from "@/components/ModerationNotices";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";

/** 0157 (D1): the statements of reasons, signed in. The mails link here, to one statement by its id. */
export default async function ModerationNoticesPage() {
  const requested = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(requested) ? requested : "en";
  const [catalog, newDebateCatalog] = await Promise.all([loadNamespace(locale, "public"), loadNamespace(locale, "newDebate")]);
  return <ModerationNoticesPageClient catalog={catalog} newDebateCatalog={newDebateCatalog} locale={locale} />;
}
