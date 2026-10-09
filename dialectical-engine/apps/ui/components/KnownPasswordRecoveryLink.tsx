"use client";
import { useMfaRecoveryCatalog } from "@/components/MfaRecoveryCatalog";
import { t } from "@/lib/i18n/translate";
export function KnownPasswordRecoveryLink({ onClick }: { onClick?: () => void }) { const catalog = useMfaRecoveryCatalog(); return <a className="authTextButton" href="/recover-authenticator" onClick={onClick}>{t(catalog, "known.link")}</a>; }
