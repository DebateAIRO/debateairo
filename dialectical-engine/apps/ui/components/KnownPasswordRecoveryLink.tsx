"use client";
import { useChromeI18n } from "@/lib/i18n/I18nProvider";
import { t } from "@/lib/i18n/translate";
import en from "@/messages/en/mfa-recovery.json";
import ro from "@/messages/ro/mfa-recovery.json";
export function KnownPasswordRecoveryLink({ onClick }: { onClick?: () => void }) { const { locale } = useChromeI18n(); return <a className="authTextButton" href="/recover-authenticator" onClick={onClick}>{t(locale === "ro" ? ro : en, "known.link")}</a>; }
