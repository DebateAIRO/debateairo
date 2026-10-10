import { cookies } from "next/headers";
import { BackupEmailConfirmation } from "@/components/BackupEmailVerification";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
export default async function VerifyBackupEmailPage() { const requested = (await cookies()).get(LOCALE_COOKIE)?.value; const locale = isLocale(requested) ? requested : "en"; const catalog = await loadNamespace(locale, "mfa-recovery"); return <BackupEmailConfirmation locale={locale} catalog={catalog} />; }
