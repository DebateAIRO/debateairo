import { cookies } from "next/headers";
import { BackupEmailConfirmation } from "@/components/BackupEmailVerification";
import { LOCALE_COOKIE } from "@/lib/i18n/locales";
import en from "@/messages/en/mfa-recovery.json";
import ro from "@/messages/ro/mfa-recovery.json";
export default async function VerifyBackupEmailPage() { const locale = (await cookies()).get(LOCALE_COOKIE)?.value === "ro" ? "ro" : "en"; return <BackupEmailConfirmation locale={locale} catalog={locale === "ro" ? ro : en} />; }
