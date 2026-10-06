import { cookies } from "next/headers";
import { MfaRecoveryFlow } from "@/components/MfaRecoveryFlow";
import { LOCALE_COOKIE } from "@/lib/i18n/locales";
import en from "@/messages/en/mfa-recovery.json";
import ro from "@/messages/ro/mfa-recovery.json";
export default async function RecoverAuthenticatorPage() { const locale = (await cookies()).get(LOCALE_COOKIE)?.value === "ro" ? "ro" : "en"; return <MfaRecoveryFlow locale={locale} catalog={locale === "ro" ? ro : en} />; }
