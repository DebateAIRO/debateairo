"use client";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContractClient, LocaleCode, CatalogLocaleCode, StepUpResponse, SocialStepUpStatusResponse, AuthenticationResponse } from '@debateai/contract';
import { dobToIso, type DobParts } from '@debateai/kernel';
import { contractClient } from '@/lib/api';
import { createConsumerWebAuthnBrowser } from '@/lib/consumerWebAuthn';
import { retainSocialStepUp } from '@/lib/socialStepUpHandoff';
import { safeSocialReturnPath } from '@/lib/returnPath';
import { takeFragmentToken } from '@/lib/mfaEnrollment';
import { createCodeAttempt } from '@/lib/authCodeAttempt';
import { validateSignup, type SignupFieldErrors } from '@/lib/authFormValidation';
import type { TurnstilePublicConfig } from '@/lib/turnstile';
import { TurnstileChallenge } from './TurnstileChallenge';
import { EmailPendingScreen } from './EmailPendingScreen';
import { SecurityEnrollment } from './SecurityEnrollment';
import { PhoneField } from './PhoneField';
import { InlineFieldMessage } from './InlineFieldMessage';
import { EphemeralCodes } from './EphemeralCodes';
import { DateOfBirthField, EMPTY_DOB } from '../DateOfBirthField';
import { resolveDobLocale } from '@/lib/dob/dobLocale';
import { AuthShell } from '../AuthShell';
import authEnglish from '@/messages/en/auth.json';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { PrivacyPolicyModal } from '../consent/PrivacyPolicyModal';
import { TermsOfServiceModal } from '../consent/TermsOfServiceModal';
import { useLegalDocument } from '../consent/useLegalDocument';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
import { catalogLocale } from '@/lib/i18n/locales';
export function SocialCompleteFlow({ client = contractClient, catalog = authEnglish, turnstile, locale = 'en', uiLocale = 'en', onAuthenticated, onStepUp }: {
    client?: ContractClient;
    catalog?: MessageCatalog;
    turnstile?: TurnstilePublicConfig;
    locale?: CatalogLocaleCode;
    uiLocale?: LocaleCode;
    onAuthenticated?: () => void;
    onStepUp?: (result: StepUpResponse) => void;
}) {
    const router = useRouter();
    const started = useRef(false);
    const flight = useRef(false);
    const sequence = useRef(0);
    const browser = useRef(createConsumerWebAuthnBrowser()).current;
    const attempt = useRef(createCodeAttempt());
    const [returnPath, setReturnPath] = useState('/new');
    const [token, setToken] = useState('');
    const [kind, setKind] = useState<'signup' | 'login' | 'stepup' | 'enroll' | null>(null);
    const [email, setEmail] = useState('');
    const [name, setName] = useState<string | null>(null);
    const [phone, setPhone] = useState('');
    const [birth, setBirth] = useState<DobParts>(EMPTY_DOB);
    const [errors, setErrors] = useState<SignupFieldErrors>({});
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [code, setCode] = useState('');
    const [recoveryMode, setRecoveryMode] = useState(false);
    const [proof, setProof] = useState<string | null>(null);
    const [reset, setReset] = useState(0);
    const [pending, setPending] = useState<string | null>(null);
    const [backup, setBackup] = useState<string | null>(null);
    const [stepUpResult, setStepUpResult] = useState<StepUpResponse | null>(null);
    const [stepUpStatus, setStepUpStatus] = useState<SocialStepUpStatusResponse | null>(null);
    const [flowExpiry, setFlowExpiry] = useState<string | null>(null);
    const [authenticated, setAuthenticated] = useState(false);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [policyOpen, setPolicyOpen] = useState(false);
    const [termsOpen, setTermsOpen] = useState(false);
    const privacyDocument = useLegalDocument('privacy');
    const termsDocument = useLegalDocument('terms');
    const chrome = useChromeI18n();
    const navigateAuthenticated = () => {
        if (onAuthenticated)
            onAuthenticated();
        else
            window.location.assign(returnPath);
    };
    useEffect(() => {
        if (started.current)
            return;
        started.current = true;
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const mode = fragment.get('kind');
        const next = fragment.get('next');
        const validShape = fragment.getAll('kind').length === 1 && fragment.getAll('next').length <= 1;
        const value = takeFragmentToken(window.location, window.history);
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
        setReturnPath(safeSocialReturnPath(next));
        if (!value || !validShape || !['signup', 'login', 'stepup'].includes(mode ?? '')) {
            setError(t(catalog, "auth.enroll.invalidLink"));
            setBusy(false);
            return;
        }
        setToken(value);
        setKind(mode as 'signup' | 'login' | 'stepup');
        void (async () => {
            try {
                if (mode === 'signup') {
                    const status = await client.socialSignupStatus({ continuation_token: value });
                    setEmail(status.email ?? '');
                    setName(status.name);
                    setFlowExpiry(status.expires_at);
                }
                else if (mode === 'stepup') {
                    const status = await client.socialStepUpStatus(value);
                    setStepUpStatus(status);
                    setFlowExpiry(status.expires_at);
                }
            }
            catch {
                setError(t(catalog, "auth.enroll.invalidLink"));
                setToken('');
            }
            finally {
                setBusy(false);
            }
        })();
    }, [client, catalog]);
    useEffect(() => () => {
        sequence.current++;
        browser.cancel();
    }, [browser]);
    useEffect(() => {
        if (!flowExpiry || !token)
            return;
        const timer = setTimeout(() => {
            sequence.current++;
            browser.cancel();
            setToken('');
            setCode('');
            setBusy(false);
            flight.current = false;
            setError(t(catalog, 'auth.enroll.invalidLink'));
        }, Math.max(0, Date.parse(flowExpiry) - Date.now()));
        return () => clearTimeout(timer);
    }, [flowExpiry, token, browser, catalog]);
    function finish(result: AuthenticationResponse) {
        if (result.status !== 'authenticated')
            return;
        setToken('');
        setCode('');
        setAuthenticated(true);
        if (result.replacement_recovery_code)
            setBackup(result.replacement_recovery_code);
        else
            navigateAuthenticated();
    }
    function finishStepUp(result: StepUpResponse) {
        window.dispatchEvent(new Event('debateai:staff-session-ended'));
        setToken('');
        setCode('');
        setStepUpResult(result);
        if (result.replacement_recovery_code)
            setBackup(result.replacement_recovery_code);
    }
    function fieldError(field: keyof SignupFieldErrors) {
        return errors[field] ? t(catalog, errors[field]!) : undefined;
    }
    async function submitSignup(form: HTMLFormElement) {
        if (flight.current)
            return;
        const data = new FormData(form);
        const address = String(data.get('email') ?? '').trim();
        const rawPhone = String(data.get('phone') ?? '');
        setEmail(address);
        setPhone(rawPhone);
        const checked = validateSignup({ email: address, phone: rawPhone, dateOfBirth: birth, privacy: data.get('privacy') === 'on', terms: data.get('terms') === 'on' });
        setErrors(checked);
        if (Object.keys(checked).length) {
            form.querySelector<HTMLElement>(checked.email ? '[name=email]' : checked.phone ? '[name=phone]' : checked.dateOfBirth ? '[name=dob-d]' : checked.privacy ? '[name=privacy]' : '[name=terms]')?.focus();
            return;
        }
        if (!proof) {
            setError(t(catalog, "auth.pending.proofUnavailable"));
            return;
        }
        flight.current = true;
        setBusy(true);
        setError(null);
        try {
            const response = await client.completeSocialSignup({ continuation_token: token, email: address, phone: rawPhone, date_of_birth: dobToIso(birth), terms: { version: termsDocument.version, sha256: termsDocument.sha256 }, privacy: { version: privacyDocument.version, sha256: privacyDocument.sha256 }, locale: catalogLocale(chrome.locale), ui_locale: chrome.locale, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, turnstile_token: proof });
            setBirth(EMPTY_DOB);
            setPhone('');
            setPrivacyAccepted(false);
            setTermsAccepted(false);
            if ('status' in response) {
                setKind('enroll');
                setToken(response.enrollment_token);
                setFlowExpiry(response.expires_at);
            }
            else {
                setPending(address);
                setEmail('');
                setToken('');
            }
        }
        catch {
            setError(t(catalog, "auth.signUp.creationFailed"));
        }
        finally {
            setProof(null);
            setReset(x => x + 1);
            flight.current = false;
            setBusy(false);
        }
    }
    async function passkey() {
        if (flight.current || !token)
            return;
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        try {
            const options = kind === 'stepup' ? await client.beginSocialStepUpPasskey(token) : await client.beginPasskeyLogin({ continuation_token: token });
            if (owner !== sequence.current)
                return;
            const credential = await browser.authenticate(options.options);
            if (owner !== sequence.current)
                return;
            if (kind === 'stepup')
                finishStepUp(await client.completeSocialStepUp({ continuation_token: token, challenge_handle: options.challenge_handle, credential }));
            else
                finish(await client.completePasskeyLogin({ challenge_handle: options.challenge_handle, credential }));
        }
        catch {
            if (owner === sequence.current)
                setError(t(catalog, "auth.passkey.cancelled"));
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
                setBusy(false);
            }
        }
    }
    async function submitCode(value: string) {
        if (flight.current || !token || !value.trim())
            return;
        if (!recoveryMode && !attempt.current.claim(token, value))
            return;
        flight.current = true;
        setBusy(true);
        setError(null);
        try {
            if (kind === 'stepup')
                finishStepUp(await client.completeSocialStepUp({ continuation_token: token, code: value.trim() }));
            else
                finish(await client.completeLogin(token, value.trim()));
        }
        catch {
            setError(t(catalog, "auth.login.authenticationCodeRejected"));
        }
        finally {
            flight.current = false;
            setBusy(false);
        }
    }
    if (pending)
        return <EmailPendingScreen email={pending} retryAfterSeconds={60} client={client} catalog={catalog} locale={uiLocale} turnstile={turnstile} onDifferentEmail={() => window.location.assign('/sign-up')}/>;
    const methods = kind === 'stepup' ? stepUpStatus?.available_methods ?? [] : ['passkey', 'totp', 'recovery_code'];
    return <AuthShell eyebrow={t(catalog, "auth.login.welcomeBack")} title={kind === 'signup' ? t(catalog, "auth.signUp.title") : kind === 'enroll' ? t(catalog, "auth.enroll.securityTitle") : t(catalog, "auth.security.title")} description={name && kind === 'signup' ? t(catalog, "auth.social.welcome", { name }) : ''} footer={null}>
 {error ? <p role="alert">{error}</p> : null}
 {backup ? <div><EphemeralCodes codes={[backup]} catalog={catalog}/><button type="button" onClick={() => {
                setBackup(null);
                if (authenticated)
                    navigateAuthenticated();
            }}>{t(catalog, "auth.continue")}</button></div> : null}
 {stepUpResult && !backup ? <div><p>{t(catalog, "auth.security.complete")}</p><button type="button" onClick={() => {
                const result = stepUpResult;
                setStepUpResult(null);
                if (onStepUp)
                    onStepUp(result);
                else {
                    retainSocialStepUp(result);
                    router.push('/settings/security');
                }
            }}>{t(catalog, "auth.security.return")}</button></div> : null}
 {token && kind === 'signup' ? <form className="authForm" method="post" action="/social/complete" noValidate onSubmit={e => {
                e.preventDefault();
                void submitSignup(e.currentTarget);
            }} aria-busy={busy}>
 <label htmlFor="social-email">{t(catalog, "auth.email")}</label><input id="social-email" name="email" type="email" autoComplete="email" value={email} disabled={busy} onChange={e => setEmail(e.target.value)} aria-invalid={!!errors.email || undefined} aria-describedby={errors.email ? 'social-email-error' : undefined}/><InlineFieldMessage id="social-email-error" message={fieldError('email')}/>
 <PhoneField id="social-phone" catalog={catalog} value={phone} onChange={setPhone} error={fieldError('phone')} disabled={busy}/>
 <DateOfBirthField catalog={catalog} locale={resolveDobLocale(uiLocale)} value={birth} onChange={setBirth} error={errors.dateOfBirth ? 'incomplete' : null} disabled={busy} minimumAgeMessage={t(catalog, "auth.dob.underAge")}/>
 <div><input name="privacy" type="checkbox" checked={privacyAccepted} disabled={busy} aria-labelledby="social-privacy-label" aria-invalid={!!errors.privacy || undefined} aria-describedby={errors.privacy ? "social-privacy-error" : undefined} onChange={() => privacyAccepted ? setPrivacyAccepted(false) : setPolicyOpen(true)}/><span id="social-privacy-label">{t(catalog, "auth.signUp.privacyAgreementPrefix")} <button type="button" onClick={() => setPolicyOpen(true)}>{t(catalog, "auth.signUp.privacyPolicy")}</button>{t(catalog, "auth.signUp.privacyAgreementSuffix")}</span><InlineFieldMessage id="social-privacy-error" message={fieldError('privacy')}/></div>
 <div><input name="terms" type="checkbox" checked={termsAccepted} disabled={busy} aria-labelledby="social-terms-label" aria-invalid={!!errors.terms || undefined} aria-describedby={errors.terms ? "social-terms-error" : undefined} onChange={() => termsAccepted ? setTermsAccepted(false) : setTermsOpen(true)}/><span id="social-terms-label">{t(catalog, "auth.signUp.termsAgreementPrefix")} <button type="button" onClick={() => setTermsOpen(true)}>{t(catalog, "auth.signUp.termsOfService")}</button>{t(catalog, "auth.signUp.privacyAgreementSuffix")}</span><InlineFieldMessage id="social-terms-error" message={fieldError('terms')}/></div>
 {turnstile ? <TurnstileChallenge siteKey={turnstile.siteKey} nonce={turnstile.nonce} action="signup" locale={uiLocale} resetKey={reset} onToken={setProof} onError={() => {
                    setProof(null);
                    setError(t(catalog, "auth.pending.proofUnavailable"));
                }}/> : null}<button type="submit" disabled={busy}>{t(catalog, "auth.continue")}</button></form> : null}
 {token && kind === 'enroll' ? <SecurityEnrollment offerRecoveryCodes catalog={catalog} client={client} authority={{ kind: 'pending', token }} onAuthenticated={finish}/> : null}
 {token && (kind === 'login' || kind === 'stepup') ? <div>
 {methods.includes('passkey') ? <button type="button" disabled={busy} onClick={() => void passkey()}>{t(catalog, "auth.passkey.use")}</button> : null}
 {methods.includes('totp') || methods.includes('recovery_code') ? <><form method="post" action="/social/complete" noValidate onSubmit={e => {
                    e.preventDefault();
                    void submitCode(code);
                }}><label htmlFor="social-code">{recoveryMode ? t(catalog, "auth.login.recoveryCodeLabel") : t(catalog, "auth.login.authenticationCodeLabel")}</label><input id="social-code" name="code" autoComplete="one-time-code" inputMode={recoveryMode ? 'text' : 'numeric'} maxLength={recoveryMode ? 128 : 6} value={code} disabled={busy} onChange={e => {
                    const value = recoveryMode ? e.target.value : e.target.value.replace(/\D/g, '').slice(0, 6);
                    if (value !== code)
                        attempt.current.edited();
                    setCode(value);
                    if (!recoveryMode && value.length === 6)
                        void submitCode(value);
                }}/><button type="submit" disabled={busy}>{t(catalog, "auth.continue")}</button></form>{methods.includes('recovery_code') ? <button type="button" onClick={() => {
                        sequence.current++;
                        browser.cancel();
                        setRecoveryMode(!recoveryMode);
                        setCode('');
                        attempt.current.edited();
                    }}>{recoveryMode ? t(catalog, "auth.login.useAuthenticatorCode") : t(catalog, "auth.login.useRecoveryCode")}</button> : null}</> : null}
 </div> : null}
 {!token && !stepUpResult && !backup && !busy ? <a href="/login">{t(catalog, "auth.login.backToSignIn")}</a> : null}
 {policyOpen ? <PrivacyPolicyModal open mode="consent" onClose={() => setPolicyOpen(false)} onAcknowledge={() => {
                setPrivacyAccepted(true);
                setPolicyOpen(false);
            }}/> : null}
 {termsOpen ? <TermsOfServiceModal open mode="consent" onClose={() => setTermsOpen(false)} onAcknowledge={() => {
                setTermsAccepted(true);
                setTermsOpen(false);
            }}/> : null}
 </AuthShell>;
}
