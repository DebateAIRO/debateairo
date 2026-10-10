import { cookies } from "next/headers";
import { MfaRecoveryFlow } from "@/components/MfaRecoveryFlow";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/locales";
import { loadNamespace } from "@/lib/i18n/server";
export default async function RecoverAuthenticatorPage() { const requested = (await cookies()).get(LOCALE_COOKIE)?.value; const locale = isLocale(requested) ? requested : "en"; const catalog = await loadNamespace(locale, "mfa-recovery"); return <MfaRecoveryFlow locale={locale} catalog={catalog} />; }
