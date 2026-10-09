"use client";
import Link from 'next/link';
import { clearStoredSupportConversation } from '@/components/support/conversation';
import { announceSessionChange } from '@/components/support/sessionChange';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ContractHttpError, type ContractClient, type LoginContinuationResponse, type AuthenticationResponse } from '@debateai/contract';
import { AuthShell } from '@/components/AuthShell';
import { SocialProviderButtons } from '@/components/auth/SocialProviderButtons';
import { InlineFieldMessage } from '@/components/auth/InlineFieldMessage';
import { EphemeralCodes } from '@/components/auth/EphemeralCodes';
import { VerificationResend } from '@/components/auth/VerificationResend';
import type { TurnstilePublicConfig } from '@/lib/turnstile';
import { ageConfirmationHref, ageConfirmationRequired } from '@/lib/ageConfirmation';
import { contractClient } from '@/lib/api';
import { createConsumerWebAuthnBrowser, type ConsumerWebAuthnBrowser } from '@/lib/consumerWebAuthn';
import { createCodeAttempt } from '@/lib/authCodeAttempt';
import { readSixDigitCode, sixDigitCodeToSend } from '@/lib/sixDigitCode';
import { emailShape } from '@/lib/authFormValidation';
import { setRecoveryAcknowledgementPending } from '@/lib/authNavigationGuard';
import { t, type MessageCatalog } from '@/lib/i18n/translate';
import { safeReturnPath } from '@/lib/returnPath';
import authEnglish from '@/messages/en/auth.json';
type LoginClient = Pick<ContractClient, 'beginLogin' | 'completeLogin'> & Partial<Pick<ContractClient, 'authProviders' | 'beginSocialLogin' | 'beginPasskeyLogin' | 'completePasskeyLogin' | 'resendVerification'>>;
async function navigateHome() {
    const next = new URLSearchParams(window.location.search).get('next');
    window.location.assign(await ageConfirmationRequired() ? ageConfirmationHref(next) : safeReturnPath(next));
}
export function LoginFlow({ catalog = authEnglish, client = contractClient, onAuthenticated = navigateHome, browser: provided, turnstile }: {
    catalog?: MessageCatalog;
    client?: LoginClient;
    onAuthenticated?: () => void | Promise<void>;
    browser?: ConsumerWebAuthnBrowser;
    /** Public Turnstile config for the verification-email resend entry (the endpoint requires the proof). */
    turnstile?: TurnstilePublicConfig;
}) {
    const browser = useRef(provided ?? createConsumerWebAuthnBrowser()).current;
    const flight = useRef(false);
    const dispatched = useRef(false);
    const [completing, setCompleting] = useState(false);
    const sequence = useRef(0);
    const conditional = useRef<AbortController | null>(null);
    const conditionalOptions = useRef<Promise<unknown> | null>(null);
    const attempt = useRef(createCodeAttempt());
    const [continuation, setContinuation] = useState<LoginContinuationResponse | null>(null);
    const [method, setMethod] = useState<'totp' | 'recovery_code'>('totp');
    const [replacement, setReplacement] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [codeError, setCodeError] = useState<string | null>(null);
    const codeField = useRef<HTMLInputElement>(null);
    // Bumped after a refused code: once the field is enabled again, focus goes back to it.
    const [refocusCode, setRefocusCode] = useState(0);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [signUpHref, setSignUpHref] = useState('/sign-up');
    const [resending, setResending] = useState(false);
    function cancelConditional() {
        sequence.current++;
        conditional.current?.abort();
        conditional.current = null;
        browser.cancel();
    }
    async function waitForConditionalPreparation(owner: number) {
        const pending = conditionalOptions.current;
        if (pending) {
            try {
                await pending;
            }
            catch {
                // Conditional discovery is only an ordering barrier. Its failure cannot poison an explicit method.
            }
        }
        return owner === sequence.current;
    }
    function finish(result: AuthenticationResponse) {
        if (result.status !== 'authenticated')
            return;
        clearStoredSupportConversation();
        announceSessionChange();
        cancelConditional();
        flight.current = false;
        dispatched.current = false;
        setCompleting(false);
        setBusy(false);
        setContinuation(null);
        setPassword('');
        setCode('');
        if (result.replacement_recovery_code) {
            setRecoveryAcknowledgementPending(true);
            setReplacement(result.replacement_recovery_code);
        }
        else
            void onAuthenticated();
    }
    useEffect(() => {
        if (refocusCode)
            codeField.current?.focus();
    }, [refocusCode]);
    useEffect(() => {
        const next = new URLSearchParams(window.location.search).get('next');
        if (next !== null)
            setSignUpHref(`/sign-up?next=${encodeURIComponent(next)}`);
        const owner = sequence.current;
        const abort = new AbortController();
        conditional.current = abort;
        void (async () => {
            try {
                if (!client.beginPasskeyLogin || !client.completePasskeyLogin || !await browser.supportsConditional() || abort.signal.aborted || owner !== sequence.current)
                    return;
                const pending = client.beginPasskeyLogin();
                conditionalOptions.current = pending;
                let options;
                try {
                    options = await pending;
                }
                finally {
                    if (conditionalOptions.current === pending)
                        conditionalOptions.current = null;
                }
                if (abort.signal.aborted || owner !== sequence.current)
                    return;
                const credential = await browser.authenticate(options.options, { mediation: 'conditional', signal: abort.signal });
                if (abort.signal.aborted || owner !== sequence.current || flight.current)
                    return;
                flight.current = true;
                dispatched.current = true;
                setCompleting(true);
                setBusy(true);
                const result = await client.completePasskeyLogin({ challenge_handle: options.challenge_handle, credential });
                if (owner === sequence.current && !abort.signal.aborted)
                    finish(result);
            }
            catch (failure) {
                if (dispatched.current && !(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
            }
            finally {
                if (owner === sequence.current) {
                    flight.current = false;
                    dispatched.current = false;
                    setCompleting(false);
                    setBusy(false);
                }
            }
        })();
        return () => {
            cancelConditional();
            setRecoveryAcknowledgementPending(false);
        };
    }, [browser, client]);
    async function passkey() {
        if (flight.current || !client.beginPasskeyLogin || !client.completePasskeyLogin)
            return;
        cancelConditional();
        const owner = sequence.current;
        flight.current = true;
        setBusy(true);
        setError(null);
        try {
            if (!await waitForConditionalPreparation(owner))
                return;
            const options = await client.beginPasskeyLogin(continuation ? { continuation_token: continuation.challenge_token } : undefined);
            if (owner !== sequence.current)
                return;
            const credential = await browser.authenticate(options.options);
            if (owner !== sequence.current)
                return;
            dispatched.current = true;
            setCompleting(true);
            const result = await client.completePasskeyLogin({ challenge_handle: options.challenge_handle, credential });
            if (owner === sequence.current)
                finish(result);
        }
        catch (failure) {
            if (dispatched.current && !(failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500)) clearStoredSupportConversation();
            if (owner === sequence.current)
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
    async function submitCredentials(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (flight.current)
            return;
        cancelConditional();
        const form = event.currentTarget;
        const data = new FormData(form);
        const address = String(data.get('email') ?? '').trim();
        const secret = String(data.get('password') ?? '');
        setEmail(address);
        setPassword(secret);
        setEmailError(emailShape(address) ? null : t(catalog, "auth.invalidEmail"));
        setPasswordError(secret ? null : t(catalog, "auth.password.required"));
        if (!emailShape(address) || !secret) {
            form.querySelector<HTMLElement>(!emailShape(address) ? '[name=email]' : '[name=password]')?.focus();
            return;
        }
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        try {
            if (!await waitForConditionalPreparation(owner))
                return;
            const result = await client.beginLogin(address, secret);
            if (owner !== sequence.current)
                return;
            setPassword('');
            setContinuation(result);
            setMethod(result.available_methods.includes('totp') ? 'totp' : 'recovery_code');
            setCode('');
            attempt.current.edited();
        }
        catch (failure) {
            // Paid plans G3a: an address where the service is not offered gets the sign-up page's sentence.
            if (owner === sequence.current)
                setError(failure instanceof ContractHttpError && failure.serverCode === 'COUNTRY_SERVICE_UNAVAILABLE'
                    ? t(catalog, "auth.signUp.countryUnavailable") : t(catalog, "auth.login.signInFailed"));
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
        if (!continuation || flight.current)
            return;
        if (method === 'totp' && !attempt.current.claim(continuation.challenge_token, value))
            return;
        if (method === 'recovery_code' && !value.trim())
            return;
        flight.current = true;
        setBusy(true);
        setError(null);
        const owner = sequence.current;
        try {
            dispatched.current = true;
            setCompleting(true);
            const result = await client.completeLogin(continuation.challenge_token, value.trim());
            if (owner === sequence.current)
                finish(result);
        }
        catch (failure) {
            const credentialRefused = failure instanceof ContractHttpError && failure.status >= 400 && failure.status < 500;
            if (!credentialRefused) clearStoredSupportConversation();
            if (owner === sequence.current) {
                setError(failure instanceof ContractHttpError && failure.status === 429
                    ? t(catalog, "auth.login.tooManyAttempts")
                    : !credentialRefused ? t(catalog, "auth.login.verificationFailed")
                    : method === 'recovery_code' ? t(catalog, "auth.login.recoveryCodeRejected") : t(catalog, "auth.login.authenticationCodeRejected"));
                setCode('');
                attempt.current.edited();
                setRefocusCode(n => n + 1);
            }
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
    const offered = continuation?.available_methods ?? [];
    if (resending)
        return <VerificationResend catalog={catalog} client={client} turnstile={turnstile} onBack={() => setResending(false)}/>;
    return <AuthShell eyebrow={t(catalog, "auth.login.welcomeBack")} title={replacement ? t(catalog, "auth.login.replacementTitle") : continuation ? t(catalog, "auth.login.twoStepVerification") : t(catalog, "auth.login.backToGraph")} description={t(catalog, "auth.login.securityPolicy")} footer={!replacement && !dispatched.current ? <>
 {/* One way in for every recovery route, each with one plain sentence (auth UI repair, 2026-10-09). */}
 <details className="authHelp">
 <summary>{t(catalog, "auth.login.cantSignIn")}</summary>
 <ul className="authHelpList">
 <li><Link href="/reset-password" onClick={cancelConditional}>{t(catalog, "auth.login.help.passwordLink")}</Link><p>{t(catalog, "auth.login.help.passwordText")}</p></li>
 <li><Link href="/recover-authenticator" onClick={cancelConditional}>{t(catalog, "auth.login.help.authenticatorLink")}</Link><p>{t(catalog, "auth.login.help.authenticatorText")}</p></li>
 <li><Link href="/recover" onClick={cancelConditional}>{t(catalog, "auth.login.help.codeLink")}</Link><p>{t(catalog, "auth.login.help.codeText")}</p></li>
 </ul>
 </details>
 {continuation ? null : <p>{t(catalog, "auth.login.noAccountYet")} <Link href={signUpHref}>{t(catalog, "auth.login.createOne")}</Link></p>}
 </> : null}>
 {error ? <div className="authAlert" role="alert">{error}</div> : null}
 {replacement ? <div><EphemeralCodes codes={[replacement]} catalog={catalog}/><button type="button" className="authPrimary" onClick={() => {
                setRecoveryAcknowledgementPending(false);
                setReplacement(null);
                void onAuthenticated();
            }}>{t(catalog, "auth.continue")}</button></div> : continuation ? <div>
 {offered.includes('passkey') ? <div className="authAltMethods"><button type="button" className="authSecondary" disabled={busy} onClick={() => void passkey()}>{t(catalog, "auth.passkey.signIn")}</button></div> : null}
 {offered.includes('totp') || offered.includes('recovery_code') ? <form className="authForm authMfaForm" noValidate method="post" action="/login" onSubmit={e => {
                    e.preventDefault();
                    const digits = method === 'totp' ? sixDigitCodeToSend(code) : code;
                    if (digits === null) {
                        setCodeError(t(catalog, "auth.login.codeFormat"));
                        codeField.current?.focus();
                        return;
                    }
                    void submitCode(digits);
                }} aria-busy={busy}>
 <div className="authField">
 <label htmlFor="login-code">{method === 'totp' ? t(catalog, "auth.login.authenticationCodeLabel") : t(catalog, "auth.login.recoveryCodeLabel")}</label>
 <input ref={codeField} className={method === 'totp' ? undefined : 'authRecoveryInput'} aria-invalid={!!codeError || undefined} aria-describedby={[method === 'totp' ? 'login-code-help' : '', codeError ? 'login-code-error' : ''].filter(Boolean).join(' ') || undefined} id="login-code" name="code" value={code} autoComplete="one-time-code" inputMode={method === 'totp' ? 'numeric' : 'text'} maxLength={method === 'totp' ? undefined : 128} disabled={busy} autoFocus onChange={e => {
                    if (method !== 'totp') {
                        if (e.target.value !== code)
                            attempt.current.edited();
                        setCode(e.target.value);
                        return;
                    }
                    // No maxLength here: a browser would silently cut a pasted 8-digit string to 6 digits.
                    const typed = readSixDigitCode(e.target.value);
                    const shown = typed.valid ? typed.digits : e.target.value;
                    if (shown !== code)
                        attempt.current.edited();
                    setCode(shown);
                    setCodeError(typed.valid ? null : t(catalog, "auth.login.codeFormat"));
                    if (typed.complete)
                        void submitCode(typed.digits);
                }}/>
 <InlineFieldMessage id="login-code-error" message={codeError}/>
 <p className="authFieldHint" id="login-code-help" hidden={method !== 'totp'}>{t(catalog, "auth.login.authenticatorInstruction")}</p>
 </div>
 <button className="authPrimary" type="submit" disabled={busy}>{t(catalog, "auth.continue")}</button>
 </form> : null}
 <div className="authMfaAlternatives">
 {offered.includes('recovery_code') && method !== 'recovery_code' ? <button type="button" className="authTextButton" disabled={completing} onClick={() => {
                        if (dispatched.current) return;
                        cancelConditional();
                        flight.current = false;
                        setBusy(false);
                        setMethod('recovery_code');
                        setCodeError(null);
                        setCode('');
                        attempt.current.edited();
                    }}>{t(catalog, "auth.login.useRecoveryCode")}</button> : null}
 {offered.includes('totp') && method !== 'totp' ? <button type="button" className="authTextButton" disabled={completing} onClick={() => {
                        if (dispatched.current) return;
                        cancelConditional();
                        flight.current = false;
                        setBusy(false);
                        setMethod('totp');
                        setCodeError(null);
                        setCode('');
                        attempt.current.edited();
                    }}>{t(catalog, "auth.login.useAuthenticatorCode")}</button> : null}
 <button type="button" className="authTextButton authBackButton" disabled={busy} onClick={() => {
                cancelConditional();
                setContinuation(null);
                setCode('');
                setError(null);
                setCodeError(null);
            }}>{t(catalog, "auth.login.backToSignIn")}</button>
 </div>
 </div> : <>
 <div className="authAltMethods">
 <button type="button" className="authSecondary" disabled={busy} onClick={() => void passkey()}>{t(catalog, "auth.passkey.signIn")}</button>
 <SocialProviderButtons disabled={completing} client={client} catalog={catalog} onBegin={cancelConditional}/>
 </div>
 <form className="authForm" noValidate method="post" action="/login" onSubmit={submitCredentials} aria-busy={busy}>
 <div className="authField"><label htmlFor="login-email">{t(catalog, "auth.email")}</label><input id="login-email" name="email" type="email" autoComplete="username webauthn" placeholder={t(catalog, "auth.emailPlaceholder")} value={email} onChange={e => {
                cancelConditional();
                setEmail(e.target.value);
                setEmailError(null);
            }} required aria-invalid={!!emailError || undefined} aria-describedby={emailError ? 'login-email-error' : undefined} disabled={busy}/><InlineFieldMessage id="login-email-error" message={emailError}/></div>
 <div className="authField"><label htmlFor="login-password">{t(catalog, "auth.password")}</label><input id="login-password" name="password" type="password" autoComplete="current-password" value={password} onChange={e => {
                cancelConditional();
                setPassword(e.target.value);
                setPasswordError(null);
            }} required aria-invalid={!!passwordError || undefined} aria-describedby={passwordError ? 'login-password-error' : undefined} disabled={busy}/><InlineFieldMessage id="login-password-error" message={passwordError}/></div>
 <button type="submit" className="authPrimary" disabled={busy}>{busy ? t(catalog, "auth.login.checking") : t(catalog, "auth.continue")}</button>
 </form>
 <p className="authResendEntry"><button type="button" className="authTextButton" disabled={busy} onClick={() => {
                cancelConditional();
                setError(null);
                setResending(true);
            }}>{t(catalog, "auth.login.resendVerification")}</button></p>
 </>}
 </AuthShell>;
}
