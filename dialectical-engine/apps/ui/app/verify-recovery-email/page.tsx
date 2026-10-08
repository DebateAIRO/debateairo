"use client";
import { useEffect, useRef, useState } from 'react';
import { AuthShell, useSelectedAuthCatalog } from '@/components/AuthShell';
import { takeFragmentToken } from '@/lib/mfaEnrollment';
import { contractClient } from '@/lib/api';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
import { t } from '@/lib/i18n/translate';
export default function VerifyRecoveryEmailPage() {
    const { locale } = useChromeI18n();
    const catalog = useSelectedAuthCatalog(locale);
    const started = useRef(false);
    const [confirmed, setConfirmed] = useState(false);
    const [error, setError] = useState(false);
    useEffect(() => {
        if (started.current)
            return;
        started.current = true;
        const token = takeFragmentToken(window.location, window.history);
        if (!token) {
            setError(true);
            return;
        }
        void contractClient.confirmRecoveryEmail({ token }).then(() => setConfirmed(true), () => setError(true));
    }, []);
    return <AuthShell eyebrow={t(catalog, "auth.login.recoveryAccess")} title={t(catalog, "auth.recovery.emailTitle")} description="" footer={null}><p role="status">{error ? t(catalog, "auth.enroll.invalidLink") : confirmed ? t(catalog, "auth.recovery.emailConfirmed") : t(catalog, "auth.login.verifying")}</p><a href="/login">{t(catalog, "auth.signUp.logIn")}</a></AuthShell>;
}
