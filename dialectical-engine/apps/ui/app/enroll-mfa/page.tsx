"use client";
import { useEffect, useRef, useState } from 'react';
import { AuthShell, useSelectedAuthCatalog } from '@/components/AuthShell';
import { SecurityEnrollment } from '@/components/auth/SecurityEnrollment';
import { OnboardingEvidence } from '@/components/auth/OnboardingEvidence';
import { LockoutPrompt } from '@/components/auth/LockoutPrompt';
import { InlineFieldMessage } from '@/components/auth/InlineFieldMessage';
import { takeFragmentToken, verifyMfaEmailWithPassword, MfaEnrollmentHttpError } from '@/lib/mfaEnrollment';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
import { t } from '@/lib/i18n/translate';
import { safeReturnPath } from '@/lib/returnPath';
export default function EnrollMfaPage() {
    const { locale } = useChromeI18n();
    const catalog = useSelectedAuthCatalog(locale);
    const started = useRef(false);
    const [token, setToken] = useState('');
    // NV-14: the mailed bearer, taken and scrubbed on mount, is verified only with the password the inbox holder
    // chooses here, which replaces any password a registrant set at sign-up.
    const [bearer, setBearer] = useState('');
    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const passwordInput = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);
    const [ready, setReady] = useState(false);
    // Set once MFA set-up has signed the person in: the "don't get locked out" card comes first.
    const [secured, setSecured] = useState(false);
    useEffect(() => {
        if (started.current)
            return;
        started.current = true;
        const bearer = takeFragmentToken(window.location, window.history, true);
        if (!bearer) {
            setError(t(catalog, "auth.enroll.invalidLink"));
            return;
        }
        setBearer(bearer);
    }, [catalog]);
    // A refused password re-enables the field after the request; focus it so its message is read.
    useEffect(() => {
        if (passwordError)
            passwordInput.current?.focus();
    }, [passwordError]);
    const submitPassword = async () => {
        if (submitting)
            return;
        if (!password) {
            setPasswordError(t(catalog, "auth.password.required"));
            return;
        }
        setSubmitting(true);
        setPasswordError(null);
        try {
            await verifyMfaEmailWithPassword(bearer, password);
            setPassword('');
            setToken(bearer);
        }
        catch (failure) {
            const code = failure instanceof MfaEnrollmentHttpError ? failure.code : null;
            const status = failure instanceof MfaEnrollmentHttpError ? failure.status : null;
            // An already-used link: continue into enrolment as before; the password is not applied.
            if (code === 'VERIFICATION_TOKEN_INVALID') {
                setPassword('');
                setToken(bearer);
            }
            // Below the minimum or over the ruled maximum (the route's own bound answers MALFORMED_REQUEST).
            else if (code === 'AUTH_INPUT_INVALID' || code === 'MALFORMED_REQUEST')
                setPasswordError(t(catalog, "auth.signUp.passwordInvalid"));
            else if (code === 'AUTH_TEMPORARILY_UNAVAILABLE' || status === 503 || status === 429)
                setPasswordError(t(catalog, "auth.pending.proofUnavailable"));
            else {
                setPassword('');
                setError(t(catalog, "auth.enroll.invalidLink"));
            }
        }
        finally {
            setSubmitting(false);
        }
    };
    return <AuthShell eyebrow={t(catalog, "auth.signUp.eyebrow")} title={t(catalog, "auth.enroll.securityTitle")} description={t(catalog, "auth.enroll.passkeyPreferred")} footer={null}>
 {error ? <><p className="authFieldError" role="alert">{error}</p><a className="authPrimary" href="/login">{t(catalog, "auth.login.backToSignIn")}</a></> : secured ? <LockoutPrompt catalog={catalog} onDone={() => window.location.assign(safeReturnPath(new URLSearchParams(window.location.search).get('next')))}/> : !token ? (bearer ? <><div className="authField"><label htmlFor="verify-password">{t(catalog, "auth.password")}</label><input ref={passwordInput} id="verify-password" name="password" type="password" autoComplete="new-password" value={password} onChange={e => {
                setPassword(e.target.value);
                setPasswordError(null);
            }} onKeyDown={e => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    void submitPassword();
                }
            }} disabled={submitting} aria-invalid={!!passwordError} aria-describedby={passwordError ? 'verify-password-error' : 'verify-password-hint'}/><p className="authFieldHint" id="verify-password-hint">{t(catalog, "auth.signUp.passwordInvalid")}</p><InlineFieldMessage id="verify-password-error" message={passwordError}/></div><button type="button" className="authPrimary" disabled={submitting} onClick={() => void submitPassword()}>{t(catalog, "auth.continue")}</button></> : <p role="status">{t(catalog, "auth.enroll.verifyingEmail")}</p>) : ready ? <SecurityEnrollment catalog={catalog} authority={{ kind: 'pending', token }} onAuthenticated={() => {
                setToken('');
                setSecured(true);
            }}/> : <OnboardingEvidence catalog={catalog} locale={locale} authority={{ kind: 'pending', token }} onReady={() => setReady(true)}/>}
 </AuthShell>;
}
