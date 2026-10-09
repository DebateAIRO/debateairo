"use client";
import {ContractHttpError} from "@debateai/contract";
import {clearStoredSupportConversation} from "../support/conversation";
import {announceSessionChange} from "../support/sessionChange";
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ContractClient, LocaleCode, CatalogLocaleCode, StepUpResponse, SocialStepUpStatusResponse, SocialLoginStatusResponse, AuthenticationResponse } from '@debateai/contract';
import { dobToIso, declaredRegionFromPick, type DobParts } from '@debateai/kernel';
import { contractClient } from '@/lib/api';
import { createConsumerWebAuthnBrowser } from '@/lib/consumerWebAuthn';
import { ownedPhoneCompletionDraft } from '@/lib/phoneCompletionDraft';
import { retainSocialStepUp } from '@/lib/socialStepUpHandoff';
import { safeSocialReturnPath } from '@/lib/returnPath';
import { takeFragmentToken } from '@/lib/mfaEnrollment';
import { createCodeAttempt } from '@/lib/authCodeAttempt';
import { readSixDigitCode, sixDigitCodeToSend } from '@/lib/sixDigitCode';
import { validateSignup, type SignupFieldErrors } from '@/lib/authFormValidation';
import type { TurnstilePublicConfig } from '@/lib/turnstile';
import { TurnstileChallenge } from './TurnstileChallenge';
import { EmailPendingScreen } from './EmailPendingScreen';
import { SecurityEnrollment } from './SecurityEnrollment';
import { PhoneField } from './PhoneField';
import { InlineFieldMessage, useFormErrorAnnouncer } from './InlineFieldMessage';
import { EphemeralCodes } from './EphemeralCodes';
import { RegionField, EMPTY_REGION_PICK, type RegionPick } from '../RegionField';
import { DateOfBirthField, EMPTY_DOB } from '../DateOfBirthField';
import { dobErrorMessage, resolveDobLocale } from '@/lib/dob/dobLocale';
import { AuthShell } from '../AuthShell';
import authEnglish from '@/messages/en/auth.json';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { PrivacyPolicyModal } from '../consent/PrivacyPolicyModal';
import { TermsOfServiceModal } from '../consent/TermsOfServiceModal';
import { useLegalDocument } from '../consent/useLegalDocument';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
import { catalogLocale } from '@/lib/i18n/locales';
type SocialFlowKind = 'signup' | 'login' | 'stepup' | 'enroll';
export function SocialCompleteFlow({ client = contractClient, catalog = authEnglish, turnstile, locale = 'en', uiLocale = 'en', onAuthenticated, onStepUp }: {
    client?: ContractClient;
    catalog?: MessageCatalog;
    turnstile?: TurnstilePublicConfig;
    locale?: CatalogLocaleCode;
    uiLocale?: LocaleCode;
    onAuthenticated?: () => void;
    onStepUp?: (result: StepUpResponse) => void;
}) {
    const [returnToQuestion, setReturnToQuestion] = useState(false);
    useEffect(() => {
        let current = true;
        void ownedPhoneCompletionDraft(client, () => current).then(value => { if (current) setReturnToQuestion(!!value); });
        return () => { current = false; };
    }, [client]);
    const router = useRouter();
    const started = useRef(false);
    const flight = useRef(false);
    const dispatched = useRef(false);
    const [completing, setCompleting] = useState(false);
    const sequence = useRef(0);
    const browser = useRef(createConsumerWebAuthnBrowser()).current;
    const attempt = useRef(createCodeAttempt());
    const [returnPath, setReturnPath] = useState('/new');
    const [token, setToken] = useState('');
    const [kind, setKind] = useState<SocialFlowKind | null>(null);
    const authority = useRef<{ token: string; kind: SocialFlowKind | null }>({ token: '', kind: null });
    const startup = useRef<{ token: string; kind: 'signup' | 'login' | 'stepup' } | null>(null);
    const [email, setEmail] = useState('');
    const [name, setName] = useState<string | null>(null);
    const [phone, setPhone] = useState('');
    const [region, setRegion] = useState<RegionPick>(EMPTY_REGION_PICK);
    const declaredRegion = declaredRegionFromPick(region.country, region.usState);
    const [birth, setBirth] = useState<DobParts>(EMPTY_DOB);
    const [errors, setErrors] = useState<SignupFieldErrors>({});
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(true);
    const [code, setCode] = useState('');
    const [recoveryMode, setRecoveryMode] = useState(false);
    // Set by a submit that did not hold exactly six digits; any edit clears it.
    const [codeIncomplete, setCodeIncomplete] = useState(false);
    const codeField = useRef<HTMLInputElement>(null);
    // One live region per form: says the first error of a failed submit (review fix, 2026-10-09).
    const signupAnnouncer = useFormErrorAnnouncer();
    const codeAnnouncer = useFormErrorAnnouncer();
    const [proof, setProof] = useState<string | null>(null);
    const [reset, setReset] = useState(0);
    const [pending, setPending] = useState<string | null>(null);
    const [backup, setBackup] = useState<string | null>(null);
    const [stepUpResult, setStepUpResult] = useState<StepUpResponse | null>(null);
    const [loginStatus, setLoginStatus] = useState<SocialLoginStatusResponse | null>(null);
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
    function replaceAuthority(nextToken: string, nextKind: SocialFlowKind | null) {
        authority.current = { token: nextToken, kind: nextKind };
        setToken(nextToken);
        setKind(nextKind);
    }
    function owns(owner: number, ownedToken: string, ownedKind: SocialFlowKind | null) {
        return owner === sequence.current && authority.current.token === ownedToken && authority.current.kind === ownedKind;
    }
    const navigateAuthenticated = () => {
        if (onAuthenticated)
            onAuthenticated();
        else
            window.location.assign(returnPath);
    };
    useEffect(() => {
        let initial = startup.current;
        if (!started.current) {
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
            initial = { token: value, kind: mode as 'signup' | 'login' | 'stepup' };
            startup.current = initial;
        }
        else if (!initial || authority.current.token || authority.current.kind)
            return;
        const { token: value, kind: initialKind } = initial;
        const owner = sequence.current;
        replaceAuthority(value, initialKind);
        setBusy(true);
        void (async () => {
            try {
                if (initialKind === 'signup') {
                    const status = await client.socialSignupStatus({ continuation_token: value });
                    if (!owns(owner, value, initialKind))
                        return;
                    setEmail(status.email ?? '');
                    setName(status.name);
                    setFlowExpiry(status.expires_at);
                }
                else if (initialKind === 'login') {
                    const status = await client.socialLoginStatus(value);
                    if (!owns(owner, value, initialKind)) return;
                    setLoginStatus(status);
                    setRecoveryMode(!status.available_methods.includes('totp'));
                    setFlowExpiry(status.expires_at);
                }
                else if (initialKind === 'stepup') {
                    const status = await client.socialStepUpStatus(value);
                    if (!owns(owner, value, initialKind))
                        return;
                    setStepUpStatus(status);
                    setRecoveryMode(!status.available_methods.includes('totp'));
                    setFlowExpiry(status.expires_at);
                }
            }
            catch {
                if (!owns(owner, value, initialKind))
                    return;
                startup.current = null;
                setError(t(catalog, "auth.enroll.invalidLink"));
                replaceAuthority('', null);
            }
            finally {
                if (owner === sequence.current)
                    setBusy(false);
            }
        })();
    }, [client, catalog]);
    useEffect(() => () => {
        sequence.current++;
        authority.current = { token: '', kind: null };
        flight.current = false;
        dispatched.current = false;
        setCompleting(false);
        browser.cancel();
    }, [browser]);
    useEffect(() => {
        if (!flowExpiry || !token)
            return;
        const timer = setTimeout(() => {
            sequence.current++;
            browser.cancel();
            startup.current = null;
            replaceAuthority('', null);
            setCode('');
            setBusy(false);
            flight.current = false;
            dispatched.current = false;
            setCompleting(false);
            setError(t(catalog, 'auth.enroll.invalidLink'));
        }, Math.max(0, Date.parse(flowExpiry) - Date.now()));
        return () => clearTimeout(timer);
    }, [flowExpiry, token, browser, catalog]);
    function finish(result: AuthenticationResponse, sessionAlreadyAnnounced = false) {
        if (result.status !== 'authenticated')
            return;
        if (!sessionAlreadyAnnounced) { clearStoredSupportConversation(); announceSessionChange(); }
        startup.current = null;
        replaceAuthority('', null);
        setCode('');
        setAuthenticated(true);
        if (result.replacement_recovery_code)
            setBackup(result.replacement_recovery_code);
        else
            navigateAuthenticated();
    }
    function finishStepUp(result: StepUpResponse) {
        window.dispatchEvent(new Event('debateai:staff-session-ended'));
        startup.current = null;
        replaceAuthority('', null);
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
            // The first error, in the order focus takes; the date of birth says what its own field says.
            const first = checked.email ?? checked.phone ?? (checked.dateOfBirth === undefined ? checked.privacy ?? checked.terms : undefined);
            signupAnnouncer.announce(first !== undefined ? t(catalog, first) : dobErrorMessage(catalog, 'incomplete', resolveDobLocale(uiLocale).order));
            return;
        }
        if (declaredRegion === null) return;
        if (!proof) {
            setError(t(catalog, "auth.pending.proofUnavailable"));
            return;
        }
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        const ownedToken = token;
        const ownedKind = kind;
        try {
            const response = await client.completeSocialSignup({ continuation_token: ownedToken, email: address, phone: rawPhone, country: declaredRegion.country, ...(declaredRegion.country === "US" ? { us_state: declaredRegion.usState! } : {}), date_of_birth: dobToIso(birth), terms: { version: termsDocument.version, sha256: termsDocument.sha256 }, privacy: { version: privacyDocument.version, sha256: privacyDocument.sha256 }, locale: catalogLocale(chrome.locale), ui_locale: chrome.locale, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, turnstile_token: proof });
            if (!owns(owner, ownedToken, ownedKind))
                return;
            startup.current = null;
            setBirth(EMPTY_DOB);
            setRegion(EMPTY_REGION_PICK);
            setPhone('');
            setPrivacyAccepted(false);
            setTermsAccepted(false);
            if ('status' in response) {
                replaceAuthority(response.enrollment_token, 'enroll');
                setFlowExpiry(response.expires_at);
            }
            else {
                setPending(address);
                setEmail('');
                replaceAuthority('', null);
            }
        }
        catch (failure) {
            if (dispatched.current && ownedKind !== 'stepup' && !(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
            if (owns(owner, ownedToken, ownedKind))
                setError(failure instanceof ContractHttpError && failure.serverCode === 'STATE_SIGNUP_UNAVAILABLE'
                    ? t(catalog, "auth.signUp.stateUnavailable") : t(catalog, "auth.signUp.creationFailed"));
        }
        finally {
            if (owner === sequence.current) {
                setProof(null);
                setReset(x => x + 1);
                flight.current = false;
                dispatched.current = false;
                setCompleting(false);
                setBusy(false);
            }
        }
    }
    async function passkey() {
        if (flight.current || !token)
            return;
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        const ownedToken = token;
        const ownedKind = kind;
        try {
            const options = ownedKind === 'stepup' ? await client.beginSocialStepUpPasskey(ownedToken) : await client.beginPasskeyLogin({ continuation_token: ownedToken });
            if (!owns(owner, ownedToken, ownedKind))
                return;
            const credential = await browser.authenticate(options.options);
            if (!owns(owner, ownedToken, ownedKind))
                return;
            dispatched.current = true;
            setCompleting(true);
            const result = ownedKind === 'stepup'
                ? await client.completeSocialStepUp({ continuation_token: ownedToken, challenge_handle: options.challenge_handle, credential })
                : await client.completePasskeyLogin({ challenge_handle: options.challenge_handle, credential });
            if (!owns(owner, ownedToken, ownedKind))
                return;
            if (ownedKind === 'stepup')
                finishStepUp(result as StepUpResponse);
            else
                finish(result as AuthenticationResponse);
        }
        catch (failure) {
            if (dispatched.current && ownedKind !== 'stepup' && !(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
            if (owns(owner, ownedToken, ownedKind))
                setError(t(catalog, "auth.passkey.cancelled"));
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
                dispatched.current = false;
                setCompleting(false);
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
        const owner = sequence.current;
        const ownedToken = token;
        const ownedKind = kind;
        try {
            dispatched.current = true;
            setCompleting(true);
            const result = ownedKind === 'stepup'
                ? await client.completeSocialStepUp({ continuation_token: ownedToken, code: value.trim() })
                : await client.completeLogin(ownedToken, value.trim());
            if (!owns(owner, ownedToken, ownedKind))
                return;
            if (ownedKind === 'stepup')
                finishStepUp(result as StepUpResponse);
            else
                finish(result as AuthenticationResponse);
        }
        catch (failure) {
            if (dispatched.current && ownedKind !== 'stepup' && !(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
            if (owns(owner, ownedToken, ownedKind))
                setError(t(catalog, "auth.login.authenticationCodeRejected"));
        }
        finally {
            if (owner === sequence.current) {
                flight.current = false;
                dispatched.current = false;
                setCompleting(false);
                setBusy(false);
            }
        }
    }
    if (pending)
        return <EmailPendingScreen email={pending} retryAfterSeconds={60} client={client} catalog={catalog} locale={uiLocale} turnstile={turnstile} onDifferentEmail={() => window.location.assign('/sign-up')}/>;
    const methods = kind === 'stepup' ? stepUpStatus?.available_methods ?? [] : loginStatus?.available_methods ?? [];
    const codeFormatError = !recoveryMode && (codeIncomplete || !readSixDigitCode(code).valid);
    return <AuthShell eyebrow={t(catalog, "auth.login.welcomeBack")} title={kind === 'signup' ? t(catalog, "auth.signUp.title") : kind === 'enroll' ? t(catalog, "auth.enroll.securityTitle") : t(catalog, "auth.security.title")} description={name && kind === 'signup' ? t(catalog, "auth.social.welcome", { name }) : ''} footer={null}>
 {error ? <div className="authAlert" role="alert">{error}</div> : null}
 {returnToQuestion && !stepUpResult && !backup ? <a className="authPrimary" href="/new">{t(catalog, 'auth.continue')}</a> : null}
 {backup ? <div><EphemeralCodes codes={[backup]} catalog={catalog}/><button type="button" className="authPrimary" onClick={() => {
                setBackup(null);
                if (authenticated)
                    navigateAuthenticated();
            }}>{t(catalog, "auth.continue")}</button></div> : null}
 {stepUpResult && !backup ? <div className="recoveryStatus"><p>{t(catalog, "auth.security.complete")}</p><button type="button" className="authPrimary" onClick={() => {
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
 <div className="authField"><label htmlFor="social-email">{t(catalog, "auth.email")}</label><input id="social-email" name="email" type="email" autoComplete="email" value={email} disabled={busy} onChange={e => setEmail(e.target.value)} aria-invalid={!!errors.email || undefined} aria-describedby={errors.email ? 'social-email-error' : undefined}/><InlineFieldMessage id="social-email-error" message={fieldError('email')}/></div>
 <PhoneField id="social-phone" catalog={catalog} value={phone} onChange={setPhone} error={fieldError('phone')} disabled={busy}/>
 <RegionField catalog={catalog} locale={chrome.locale} value={region} onChange={setRegion} disabled={busy}/>
 <DateOfBirthField catalog={catalog} locale={resolveDobLocale(uiLocale)} value={birth} onChange={setBirth} error={errors.dateOfBirth ? 'incomplete' : null} disabled={busy} minimumAgeMessage={t(catalog, "auth.dob.underAge")}/>
 <div className="consentGroup"><div className="consentRow"><input className="consentBox" name="privacy" type="checkbox" checked={privacyAccepted} disabled={busy} aria-labelledby="social-privacy-label" aria-invalid={!!errors.privacy || undefined} aria-describedby={errors.privacy ? "social-privacy-error" : undefined} onChange={() => privacyAccepted ? setPrivacyAccepted(false) : setPolicyOpen(true)}/><span className="consentText" id="social-privacy-label">{t(catalog, "auth.signUp.privacyAgreementPrefix")} <button type="button" className="consentPolicyLink" onClick={() => setPolicyOpen(true)}>{t(catalog, "auth.signUp.privacyPolicy")}</button>{t(catalog, "auth.signUp.privacyAgreementSuffix")}</span></div><InlineFieldMessage id="social-privacy-error" message={fieldError('privacy')}/>
 <div className="consentRow"><input className="consentBox" name="terms" type="checkbox" checked={termsAccepted} disabled={busy} aria-labelledby="social-terms-label" aria-invalid={!!errors.terms || undefined} aria-describedby={errors.terms ? "social-terms-error" : undefined} onChange={() => termsAccepted ? setTermsAccepted(false) : setTermsOpen(true)}/><span className="consentText" id="social-terms-label">{t(catalog, "auth.signUp.termsAgreementPrefix")} <button type="button" className="consentPolicyLink" onClick={() => setTermsOpen(true)}>{t(catalog, "auth.signUp.termsOfService")}</button>{t(catalog, "auth.signUp.privacyAgreementSuffix")}</span></div><InlineFieldMessage id="social-terms-error" message={fieldError('terms')}/></div>
 {turnstile ? <TurnstileChallenge siteKey={turnstile.siteKey} nonce={turnstile.nonce} action="signup" locale={uiLocale} resetKey={reset} onToken={setProof} onError={() => {
                    setProof(null);
                    setError(t(catalog, "auth.pending.proofUnavailable"));
                }}/> : null}<button type="submit" className="authPrimary" disabled={busy}>{t(catalog, "auth.continue")}</button>{signupAnnouncer.region}</form> : null}
 {token && kind === 'enroll' ? <SecurityEnrollment catalog={catalog} client={client} authority={{ kind: 'pending', token }} onAuthenticated={result => finish(result, true)}/> : null}
 {token && (kind === 'login' || kind === 'stepup') ? <div>
 {methods.includes('passkey') ? <div className="authAltMethods"><button type="button" className="authSecondary" disabled={busy} onClick={() => void passkey()}>{t(catalog, "auth.passkey.use")}</button></div> : null}
 {methods.includes('totp') || methods.includes('recovery_code') ? <><form className="authForm authMfaForm" method="post" action="/social/complete" noValidate onSubmit={e => {
                    e.preventDefault();
                    const digits = recoveryMode ? code : sixDigitCodeToSend(code);
                    if (digits === null) {
                        setCodeIncomplete(true);
                        codeField.current?.focus();
                        codeAnnouncer.announce(t(catalog, "auth.login.codeFormat"));
                        return;
                    }
                    void submitCode(digits);
                }}><div className="authField"><label htmlFor="social-code">{recoveryMode ? t(catalog, "auth.login.recoveryCodeLabel") : t(catalog, "auth.login.authenticationCodeLabel")}</label>{!recoveryMode ? <p className="authFieldHint" id="social-code-help">{t(catalog, 'auth.login.authenticatorInstruction')}</p> : null}<input ref={codeField} className={recoveryMode ? 'authRecoveryInput' : undefined} aria-invalid={codeFormatError || undefined} aria-describedby={[!recoveryMode ? 'social-code-help' : '', codeFormatError ? 'social-code-error' : ''].filter(Boolean).join(' ') || undefined} id="social-code" name="code" autoComplete="one-time-code" inputMode={recoveryMode ? 'text' : 'numeric'} maxLength={recoveryMode ? 128 : undefined} value={code} disabled={busy} onChange={e => {
                    // Exactly six digits (spaces and dashes ignored); a longer paste is shown and refused, never cut.
                    const typed = readSixDigitCode(e.target.value);
                    const value = recoveryMode || !typed.valid ? e.target.value : typed.digits;
                    if (value !== code)
                        attempt.current.edited();
                    setCode(value);
                    setCodeIncomplete(false);
                    // Said once when the field turns invalid (a letter typed), not on every further key.
                    if (!recoveryMode && !typed.valid && !codeFormatError)
                        codeAnnouncer.announce(t(catalog, "auth.login.codeFormat"));
                    if (!recoveryMode && typed.complete)
                        void submitCode(typed.digits);
                }}/><InlineFieldMessage id="social-code-error" message={codeFormatError ? t(catalog, "auth.login.codeFormat") : null}/></div><button type="submit" className="authPrimary" disabled={busy}>{t(catalog, "auth.continue")}</button>{codeAnnouncer.region}</form>{methods.includes('recovery_code') && methods.includes('totp') ? <button type="button" className="authTextButton" disabled={completing} onClick={() => {
                        if (dispatched.current) return;
                        sequence.current++;
                        browser.cancel();
                        startup.current = null;
                        flight.current = false;
                        dispatched.current = false;
                        setCompleting(false);
                        setBusy(false);
                        setError(null);
                        setRecoveryMode(!recoveryMode);
                        setCode('');
                        setCodeIncomplete(false);
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
