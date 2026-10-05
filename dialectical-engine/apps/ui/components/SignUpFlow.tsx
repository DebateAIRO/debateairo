"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { ContractHttpError, type ContractClient } from '@debateai/contract';
import { checkDob, dobToIso, meetsMinimumAge, type DobErrorCode, type DobParts } from '@debateai/kernel';
import { AgeRefusal } from '@/components/AgeRefusal';
import { AuthShell } from '@/components/AuthShell';
import { DateOfBirthField, EMPTY_DOB } from '@/components/DateOfBirthField';
import { EmailPendingScreen } from '@/components/auth/EmailPendingScreen';
import { SocialProviderButtons } from '@/components/auth/SocialProviderButtons';
import { PhoneField } from '@/components/auth/PhoneField';
import { InlineFieldMessage } from '@/components/auth/InlineFieldMessage';
import { TurnstileChallenge } from '@/components/auth/TurnstileChallenge';
import { PrivacyPolicyModal } from '@/components/consent/PrivacyPolicyModal';
import { TermsOfServiceModal } from '@/components/consent/TermsOfServiceModal';
import { useLegalDocument } from '@/components/consent/useLegalDocument';
import { contractClient } from '@/lib/api';
import { validateSignup, type SignupFieldErrors } from '@/lib/authFormValidation';
import { resolveDobLocale, type DobLocale } from '@/lib/dob/dobLocale';
import { useChromeI18n } from '@/lib/i18n/I18nProvider';
import { catalogLocale } from '@/lib/i18n/locales';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import type { TurnstilePublicConfig } from '@/lib/turnstile';
import authEnglish from '@/messages/en/auth.json';
type RegistrationClient = Pick<ContractClient, 'checkAge' | 'register'> & Partial<Pick<ContractClient, 'resendVerification' | 'authProviders' | 'beginSocialLogin'>>;
const PRIVACY_CONSENT_TEXT_ID = 'signup-privacy-consent-text';
const TERMS_CONSENT_TEXT_ID = 'signup-terms-consent-text';
function gatedRowClick(inputRef: RefObject<HTMLInputElement | null>, accepted: boolean, open: () => void): (event: ReactMouseEvent<HTMLElement>) => void {
    return (event) => {
        const input = inputRef.current;
        if (input === null)
            return;
        /* THE PREDICATE READS THE REACT MIRROR, NEVER THE DOM. The pre-click activation steps
           have ALREADY flipped `input.checked` by the time this runs, so `if (input.checked)`
           takes the CHECKED branch on a bare click on an EMPTY box: the document would never open
           and the box would tick — the one behaviour V's goal forbids. `accepted` is the
           settled value (ARCH-REV-S02 r3 N12, measured). */
        if (accepted) {
            /* No preventDefault: the box unchecks directly, with no modal. A click that did not
               originate ON the input toggles nothing natively — the row is a <div>, not a <label>
               — so it is driven through `.click()`, the path React's change detection listens to.
               The `event.target !== input` guard is also what stops that synthesised click, which
               bubbles back through this same handler, from recursing. */
            if (event.target !== input)
                input.click();
            return;
        }
        event.preventDefault();
        /* The helper returns focus to whatever was focused when the surface opened, so focusing
           the input HERE is what makes focus come back to it from every entry point. */
        input.focus();
        open();
        /* THE TRACKER RESYNC, and it runs AFTER the dispatch, never inside it.
           React's value tracker desynchronises across a cancelled click: the box is toggled
           BEFORE dispatch, React's change extraction records `true`, and the canceled-activation
           steps revert the DOM to `false` AFTER dispatch — leaving tracker `true` over DOM
           `false`, so a later genuine change can go unannounced. A PLAIN instance assignment
           re-syncs it (the prototype setter and a synthesised `.click()` are both measured NOT
           to: probe code-rev-s02-c3c4-r1-recovery.test.tsx, R1 against R2/R3).
           PLACEMENT IS LOAD-BEARING AND IS MEASURED. Assigning inside this handler leaves the
           box CHECKED under jsdom 30.0.1, whose canceled-activation behaviour for a checkbox is
           `this.checked = !this.checked` — a TOGGLE, not the spec's restore-to-pre-click-value
           (jsdom/living/nodes/HTMLInputElement-impl.js:179-182) — so it inverts the `false` this
           line writes. Measured that way round: `the box must stay unticked: expected true to be
           false`. A microtask runs after the activation steps in every environment, and touches
           only the tracker (the DOM value is already `false`), so no frame shows a ticked box. */
        queueMicrotask(() => {
            const box = inputRef.current;
            if (box !== null)
                box.checked = false;
        });
    };
}
export function SignUpFlow({ turnstile, catalog = authEnglish, client = contractClient, dobLocale = resolveDobLocale('en'), refused: refusedOnArrival = false, reloadPage = () => window.location.reload() }: {
    turnstile?: TurnstilePublicConfig;
    catalog?: MessageCatalog;
    client?: RegistrationClient;
    dobLocale?: DobLocale;
    refused?: boolean;
    reloadPage?: () => void;
}) {
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);
    const [retryAfterSeconds, setRetryAfterSeconds] = useState(60);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loginHref, setLoginHref] = useState('/login');
    const [dateOfBirth, setDateOfBirth] = useState<DobParts>(EMPTY_DOB);
    const [dateOfBirthError, setDateOfBirthError] = useState<DobErrorCode | null>(null);
    const [refused, setRefused] = useState(refusedOnArrival);
    const [privacyAccepted, setPrivacyAccepted] = useState(false);
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [policyOpen, setPolicyOpen] = useState(false);
    const [termsOpen, setTermsOpen] = useState(false);
    const [documentsStale, setDocumentsStale] = useState(false);
    const [errors, setErrors] = useState<SignupFieldErrors>({});
    const [proof, setProof] = useState<string | null>(null);
    const [proofReset, setProofReset] = useState(0);
    const privacyInputRef = useRef<HTMLInputElement | null>(null);
    const termsInputRef = useRef<HTMLInputElement | null>(null);
    const flight = useRef(false);
    const { locale } = useChromeI18n();
    const termsDocument = useLegalDocument('terms');
    const privacyDocument = useLegalDocument('privacy');
    useEffect(() => {
        const next = new URLSearchParams(window.location.search).get('next');
        if (next !== null)
            setLoginHref(`/login?next=${encodeURIComponent(next)}`);
    }, []);
    function fieldError(field: keyof SignupFieldErrors) {
        return errors[field] ? t(catalog, errors[field]!) : undefined;
    }
    function edit(field: keyof SignupFieldErrors) {
        setErrors(current => ({ ...current, [field]: undefined }));
    }
    async function submitRegistration(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (flight.current)
            return;
        const form = event.currentTarget;
        const data = new FormData(form);
        const submitted = String(data.get('email') ?? '').trim();
        const rawPassword = String(data.get('password') ?? '');
        const rawPhone = String(data.get('phone') ?? '');
        setEmail(submitted);
        setPhone(rawPhone);
        setPassword(rawPassword);
        const checked = validateSignup({ email: submitted, phone: rawPhone, password: rawPassword, dateOfBirth, privacy: data.get('privacy-accepted') === 'on', terms: data.get('terms-accepted') === 'on' });
        setErrors(checked);
        const dateCheck = checkDob(dateOfBirth);
        setDateOfBirthError(dateCheck.code === 'ok' ? null : dateCheck.code);
        if (Object.keys(checked).length) {
            const selector = checked.email ? '[name=email]' : checked.phone ? '[name=phone]' : checked.password ? '[name=password]' : checked.dateOfBirth ? '[name=dob-d]' : checked.privacy ? '[name=privacy-accepted]' : '[name=terms-accepted]';
            form.querySelector<HTMLElement>(selector)?.focus();
            return;
        }
        if (!proof) {
            setError(t(catalog, "auth.pending.proofUnavailable"));
            return;
        }
        flight.current = true;
        setBusy(true);
        setError(null);
        setDocumentsStale(false);
        try {
            const isoDate = dobToIso(dateOfBirth);
            const age = await client.checkAge(isoDate);
            if (age.outcome === 'refused') {
                setRefused(true);
                return;
            }
            const acknowledgement = await client.register({ email: submitted, password: rawPassword, phone: rawPhone, date_of_birth: isoDate, terms: { version: termsDocument.version, sha256: termsDocument.sha256 }, privacy: { version: privacyDocument.version, sha256: privacyDocument.sha256 }, locale: catalogLocale(locale), ui_locale: locale, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? null, turnstile_token: proof });
            setEmail('');
            setPhone('');
            setPassword('');
            setDateOfBirth(EMPTY_DOB);
            setDateOfBirthError(null);
            setPrivacyAccepted(false);
            setTermsAccepted(false);
            setPolicyOpen(false);
            setTermsOpen(false);
            setRetryAfterSeconds(acknowledgement.retry_after_seconds);
            setSubmittedEmail(submitted);
        }
        catch (failure) {
            if (failure instanceof ContractHttpError && failure.serverCode === 'AUTH_AGE_REFUSED') {
                setRefused(true);
                return;
            }
            if (failure instanceof ContractHttpError && failure.serverCode === 'LEGAL_DOCUMENT_STALE') {
                if (privacyInputRef.current)
                    privacyInputRef.current.checked = false;
                if (termsInputRef.current)
                    termsInputRef.current.checked = false;
                setPrivacyAccepted(false);
                setTermsAccepted(false);
                setDocumentsStale(true);
                setError(t(catalog, "auth.signUp.documentsUpdated"));
                return;
            }
            setError(failure instanceof ContractHttpError && ['COUNTRY_SIGNUP_UNAVAILABLE', 'COUNTRY_UNKNOWN', 'TOR_REFUSED'].includes(failure.serverCode ?? '') ? t(catalog, "auth.signUp.countryUnavailable") : t(catalog, "auth.signUp.creationFailed"));
        }
        finally {
            setProof(null);
            setProofReset(x => x + 1);
            flight.current = false;
            setBusy(false);
        }
    }
    const onPrivacyRowClick = gatedRowClick(privacyInputRef, privacyAccepted, () => setPolicyOpen(true));
    const onTermsRowClick = gatedRowClick(termsInputRef, termsAccepted, () => setTermsOpen(true));
    function acknowledgePolicy() {
        if (privacyInputRef.current)
            privacyInputRef.current.checked = true;
        setPrivacyAccepted(true);
        setPolicyOpen(false);
        edit('privacy');
    }
    function acknowledgeTerms() {
        if (termsInputRef.current)
            termsInputRef.current.checked = true;
        setTermsAccepted(true);
        setTermsOpen(false);
        edit('terms');
    }
    if (refused)
        return <AgeRefusal catalog={catalog}/>;
    if (submittedEmail !== null)
        return <EmailPendingScreen email={submittedEmail} retryAfterSeconds={retryAfterSeconds} client={{ resendVerification: client.resendVerification ?? contractClient.resendVerification }} catalog={catalog} locale={locale} turnstile={turnstile} onDifferentEmail={() => setSubmittedEmail(null)}/>;
    return <AuthShell eyebrow={t(catalog, "auth.signUp.eyebrow")} title={t(catalog, "auth.signUp.title")} description={t(catalog, "auth.signUp.description")} footer={null}>
 {error ? <div className="authAlert" role="alert">{error}</div> : null}{documentsStale ? <button type="button" onClick={reloadPage}>{t(catalog, "auth.signUp.reloadDocuments")}</button> : null}
 <SocialProviderButtons client={client} catalog={catalog}/>
 <form className="authForm" data-form="signup" noValidate method="post" action="/sign-up" aria-busy={busy} onSubmit={submitRegistration}>
 <div className="authField"><label htmlFor="signup-email">{t(catalog, "auth.email")}</label><input id="signup-email" name="email" type="email" autoComplete="username" placeholder={t(catalog, "auth.emailPlaceholder")} value={email} onChange={e => {
            setEmail(e.target.value);
            edit('email');
        }} required autoFocus disabled={busy} aria-invalid={!!errors.email || undefined} aria-describedby={errors.email ? 'signup-email-error' : undefined}/><InlineFieldMessage id="signup-email-error" message={fieldError('email')}/></div>
 <PhoneField catalog={catalog} value={phone} onChange={raw => {
            setPhone(raw);
            edit('phone');
        }} error={fieldError('phone')} disabled={busy}/>
 <div className="authField"><label htmlFor="signup-password">{t(catalog, "auth.password")}</label><input id="signup-password" name="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => {
            setPassword(e.target.value);
            edit('password');
        }} required disabled={busy} aria-invalid={!!errors.password || undefined} aria-describedby={errors.password ? 'signup-password-error' : 'signup-password-hint'}/><button type="button" aria-controls="signup-password" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? t(catalog, "auth.password.hide") : t(catalog, "auth.password.show")}</button><p id="signup-password-hint">{t(catalog, "auth.signUp.passwordInvalid")}</p><InlineFieldMessage id="signup-password-error" message={fieldError('password')}/></div>
 <div className="authField"><DateOfBirthField catalog={catalog} locale={dobLocale} value={dateOfBirth} error={dateOfBirthError} onChange={next => {
            setDateOfBirth(next);
            setDateOfBirthError(null);
            edit('dateOfBirth');
        }} disabled={busy} minimumAgeMessage={t(catalog, "auth.dob.underAge")}/></div>
 <div className="consentGroup">
 <div className="consentRow" onClick={onPrivacyRowClick}><input className="consentBox" name="privacy-accepted" type="checkbox" required disabled={busy} aria-labelledby={PRIVACY_CONSENT_TEXT_ID} ref={privacyInputRef} aria-invalid={!!errors.privacy || undefined} aria-describedby={errors.privacy ? 'signup-privacy-error' : undefined} onChange={e => setPrivacyAccepted(e.currentTarget.checked && !e.nativeEvent.defaultPrevented)}/><span className="consentText" id={PRIVACY_CONSENT_TEXT_ID}>{t(catalog, "auth.signUp.privacyAgreementPrefix")} <button type="button" className="consentPolicyLink">{t(catalog, "auth.signUp.privacyPolicy")}</button>{t(catalog, "auth.signUp.privacyAgreementSuffix")}</span></div><InlineFieldMessage id="signup-privacy-error" message={fieldError('privacy')}/>
 <div className="consentRow" onClick={onTermsRowClick}><input className="consentBox" name="terms-accepted" type="checkbox" required disabled={busy} aria-labelledby={TERMS_CONSENT_TEXT_ID} ref={termsInputRef} aria-invalid={!!errors.terms || undefined} aria-describedby={errors.terms ? 'signup-terms-error' : undefined} onChange={e => setTermsAccepted(e.currentTarget.checked && !e.nativeEvent.defaultPrevented)}/><span className="consentText" id={TERMS_CONSENT_TEXT_ID}>{t(catalog, "auth.signUp.termsAgreementPrefix")} <button type="button" className="consentPolicyLink">{t(catalog, "auth.signUp.termsOfService")}</button>{t(catalog, "auth.signUp.privacyAgreementSuffix")}</span></div><InlineFieldMessage id="signup-terms-error" message={fieldError('terms')}/>
 </div>
 {turnstile ? <TurnstileChallenge siteKey={turnstile.siteKey} nonce={turnstile.nonce} action="signup" locale={locale} resetKey={proofReset} onToken={setProof} onError={() => {
                setProof(null);
                setError(t(catalog, "auth.pending.proofUnavailable"));
            }}/> : null}
 <button className="authPrimary" type="submit" disabled={busy || !privacyAccepted || !termsAccepted || (checkDob(dateOfBirth).code !== 'incomplete' && !meetsMinimumAge(dateOfBirth))}>{busy ? t(catalog, "auth.signUp.creating") : t(catalog, "auth.signUp.createAccount")}</button>
 <p className="authPanelFooter">{t(catalog, "auth.signUp.alreadyHaveOne")} <Link href={loginHref}>{t(catalog, "auth.signUp.logIn")}</Link></p>
 </form>
 {policyOpen ? <PrivacyPolicyModal open mode="consent" onClose={() => {
                setPrivacyAccepted(privacyInputRef.current?.checked ?? false);
                setPolicyOpen(false);
            }} onAcknowledge={acknowledgePolicy}/> : null}
 {termsOpen ? <TermsOfServiceModal open mode="consent" onClose={() => {
                setTermsAccepted(termsInputRef.current?.checked ?? false);
                setTermsOpen(false);
            }} onAcknowledge={acknowledgeTerms}/> : null}
 </AuthShell>;
}
