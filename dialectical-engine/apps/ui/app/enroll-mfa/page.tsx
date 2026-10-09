"use client";
import { useEffect, useRef, useState } from 'react';
import { AuthShell, useSelectedAuthCatalog } from '@/components/AuthShell';
import { SecurityEnrollment } from '@/components/auth/SecurityEnrollment';
import { OnboardingEvidence } from '@/components/auth/OnboardingEvidence';
import { takeFragmentToken, verifyMfaEmail, MfaEnrollmentHttpError } from '@/lib/mfaEnrollment';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
import { t } from '@/lib/i18n/translate';
import { safeReturnPath } from '@/lib/returnPath';
export default function EnrollMfaPage() {
    const { locale } = useChromeI18n();
    const catalog = useSelectedAuthCatalog(locale);
    const started = useRef(false);
    const [token, setToken] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    useEffect(() => {
        if (started.current)
            return;
        started.current = true;
        const bearer = takeFragmentToken(window.location, window.history, true);
        if (!bearer) {
            setError(t(catalog, "auth.enroll.invalidLink"));
            return;
        }
        void (async () => {
            try {
                try {
                    await verifyMfaEmail(bearer);
                }
                catch (failure) {
                    if (!(failure instanceof MfaEnrollmentHttpError && failure.code === 'VERIFICATION_TOKEN_INVALID'))
                        throw failure;
                }
                setToken(bearer);
            }
            catch {
                setError(t(catalog, "auth.enroll.invalidLink"));
            }
        })();
    }, [catalog]);
    return <AuthShell eyebrow={t(catalog, "auth.signUp.eyebrow")} title={t(catalog, "auth.enroll.securityTitle")} description={t(catalog, "auth.enroll.passkeyPreferred")} footer={null}>
 {error ? <><p className="authFieldError" role="alert">{error}</p><a className="authPrimary" href="/login">{t(catalog, "auth.login.backToSignIn")}</a></> : !token ? <p role="status">{t(catalog, "auth.enroll.verifyingEmail")}</p> : ready ? <SecurityEnrollment catalog={catalog} authority={{ kind: 'pending', token }} onAuthenticated={() => {
                setToken('');
                window.location.assign(safeReturnPath(new URLSearchParams(window.location.search).get('next')));
            }}/> : <OnboardingEvidence catalog={catalog} locale={locale} authority={{ kind: 'pending', token }} onReady={() => setReady(true)}/>}
 </AuthShell>;
}
